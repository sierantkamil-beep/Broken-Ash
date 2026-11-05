"""
Builds skinned elf bodies in Blender from the MakeHuman CC0 base mesh (tools/art/mh_fetch.py).

What happens:
  1. Morph the base mesh with MakeHuman's own targets: a young adult, lean, tall, ideal proportions,
     male or female, a mix of two face types (elves are their own people, not a real-world one).
  2. Turn the ears into long elven ears (MakeHuman's pointed-ear targets plus a pull of the ear tips).
  3. Build MakeHuman's 163-bone skeleton from its joint helpers, and skin the body with its weights.
  4. Keep some helper meshes (tights, skirt, hair volume, eyes) as skinned objects: outfits and hair
     are built from them, so they deform with the body for free.

Coordinates: MakeHuman is Y-up, facing +Z, in decimetres. Blender here is Z-up with characters facing
-Y (the convention of tools/art/common.py), in metres: (x, y, z)_mh → (x, -z, y) · SCALE.
"""
import json
import math
import os

import bpy  # noqa: I001 — bpy must load before bmesh
import bmesh
import numpy as np
from mathutils import Matrix, Quaternion, Vector

MH = os.path.join(os.path.dirname(__file__), ".mh")
# Decimetres → metres, shrunk so the tall elven targets come out at ~1.88 m (male) / ~1.78 m (female).
SCALE = 0.09

_cache = {}


def _obj():
    """Base mesh vertices and faces grouped by their OBJ group."""
    if "obj" in _cache:
        return _cache["obj"]
    verts, groups = [], {}
    group = None
    with open(os.path.join(MH, "3dobjs", "base.obj")) as f:
        for line in f:
            if line.startswith("v "):
                verts.append([float(x) for x in line.split()[1:4]])
            elif line.startswith("g "):
                group = line.split()[1]
            elif line.startswith("f "):
                idx = [int(p.split("/")[0]) - 1 for p in line.split()[1:]]
                groups.setdefault(group, []).append(idx)
    _cache["obj"] = (np.array(verts, dtype=np.float64), groups)
    return _cache["obj"]


def _target(rel):
    """A MakeHuman .target: rows of 'index dx dy dz'. Returns (indices, deltas)."""
    key = ("t", rel)
    if key not in _cache:
        rows = []
        with open(os.path.join(MH, "targets", rel)) as f:
            for line in f:
                if line[:1].isdigit():
                    p = line.split()
                    rows.append((int(p[0]), float(p[1]), float(p[2]), float(p[3])))
        a = np.array(rows) if rows else np.zeros((0, 4))
        _cache[key] = (a[:, 0].astype(int), a[:, 1:4])
    return _cache[key]


def _apply(v, rel, w):
    if w == 0:
        return
    idx, d = _target(rel)
    np.add.at(v, idx, d * w)


def morph(sex, shape=None):
    """
    Base mesh vertices with the elven body applied (MakeHuman units and axes). `shape` overrides the
    build for monsters: {"muscle": {...}, "weight": {...}, "height": 0..1}.
    """
    v, _ = _obj()
    v = v.copy()
    g = sex  # "male" | "female"
    shape = shape or {}
    # Face and build: two face types mixed, so the elves don't read as any one real people.
    _apply(v, f"macrodetails/caucasian-{g}-young.target", 0.55)
    _apply(v, f"macrodetails/asian-{g}-young.target", 0.45)
    muscle = shape.get("muscle") or ({"averagemuscle": 0.55, "maxmuscle": 0.45} if g == "male" else {"averagemuscle": 0.8, "maxmuscle": 0.2})
    weight = shape.get("weight") or {"minweight": 0.65, "averageweight": 0.35}
    tall = shape.get("height", 0.55 if g == "male" else 0.45)
    for m, wm in muscle.items():
        for wt, ww in weight.items():
            _apply(v, f"macrodetails/universal-{g}-young-{m}-{wt}.target", wm * ww)
            _apply(v, f"macrodetails/height/{g}-young-{m}-{wt}-maxheight.target", wm * ww * tall)
            _apply(v, f"macrodetails/proportions/{g}-young-{m}-{wt}-idealproportions.target", wm * ww)
    # Elven ears: MakeHuman's pointed shape, taller, swept back...
    for side in "lr":
        _apply(v, f"ears/{side}-ear-shape-pointed.target", 1.0)
        _apply(v, f"ears/{side}-ear-scale-vert-incr.target", 0.8)
        _apply(v, f"ears/{side}-ear-rot-backward.target", 0.5)
        _apply(v, f"ears/{side}-ear-trans-up.target", 0.2)
    # ...then pulled into long tips: the higher up the ear, the further up, back and out it goes.
    for side, sx in (("l", 1), ("r", -1)):
        idx, _ = _target(f"ears/{side}-ear-shape-pointed.target")
        ear = v[idx]
        centre = ear.mean(axis=0)
        top = ear[:, 1].max()
        t = np.clip((ear[:, 1] - centre[1]) / max(1e-6, top - centre[1]), 0, 1) ** 2.2
        back = np.clip((centre[2] - ear[:, 2]) / 0.3 + 0.6, 0.2, 1.2)
        v[idx, 1] += t * 0.85
        v[idx, 2] -= t * 0.6 * back
        v[idx, 0] += sx * t * 0.24
    return v


_scale = [SCALE]


def to_blender(p, ground=0.0):
    k = _scale[0]
    return Vector((p[0] * k, -p[2] * k, (p[1] - ground) * k))


def build(sex, name="elf", shape=None, scale=1.0):
    """
    Creates the armature and skinned meshes. Returns a dict:
      armature, body, tights, skirt, hair, eyes (list), joints (name → Blender position).
    """
    v, groups = _obj()
    mv = morph(sex, shape)
    # Stand on the ground: the lowest point of the body (the soles) at z = 0.
    body_idx = sorted({i for f in groups["body"] for i in f})
    ground = float(mv[body_idx, 1].min())
    _scale[0] = SCALE * scale
    skel = json.load(open(os.path.join(MH, "rigs", "default.mhskel")))
    weights = json.load(open(os.path.join(MH, "rigs", "default_weights.mhw")))["weights"]
    joints = {j: to_blender(mv[idx].mean(axis=0), ground) for j, idx in skel["joints"].items()}

    arm_data = bpy.data.armatures.new(f"{name}_rig")
    arm = bpy.data.objects.new(f"{name}_rig", arm_data)
    bpy.context.scene.collection.objects.link(arm)
    bpy.context.view_layer.objects.active = arm
    bpy.ops.object.mode_set(mode="EDIT")
    for bname, b in skel["bones"].items():
        eb = arm_data.edit_bones.new(bname)
        eb.head = joints[b["head"]]
        eb.tail = joints[b["tail"]]
        if (eb.tail - eb.head).length < 1e-4:
            eb.tail = eb.head + Vector((0, 0, 0.01))
        plane = skel.get("planes", {}).get(b.get("rotation_plane") or "")
        if plane and all(p in joints for p in plane):
            p1, p2, p3 = (joints[p] for p in plane)
            n = (p2 - p1).cross(p3 - p2)
            if n.length > 1e-8:
                eb.align_roll(n.normalized())
    for bname, b in skel["bones"].items():
        if b.get("parent"):
            arm_data.edit_bones[bname].parent = arm_data.edit_bones[b["parent"]]
    bpy.ops.object.mode_set(mode="OBJECT")

    def mesh_from(group_names, oname):
        faces = [f for g in group_names for f in groups.get(g, [])]
        used = sorted({i for f in faces for i in f})
        remap = {o: n for n, o in enumerate(used)}
        me = bpy.data.meshes.new(oname)
        me.from_pydata([to_blender(mv[i], ground) for i in used], [], [[remap[i] for i in f] for f in faces])
        me.update()
        for p in me.polygons:
            p.use_smooth = True
        o = bpy.data.objects.new(oname, me)
        bpy.context.scene.collection.objects.link(o)
        used_set = set(used)
        for bname, ws in weights.items():
            pairs = [(remap[i], w) for i, w in ws if i in used_set]
            if not pairs:
                continue
            vg = o.vertex_groups.new(name=bname)
            for i, w in pairs:
                vg.add([i], w, "REPLACE")
        o.parent = arm
        mod = o.modifiers.new("rig", "ARMATURE")
        mod.object = arm
        return o

    body = mesh_from(["body"], f"{name}_body")
    sub = body.modifiers.new("smooth", "SUBSURF")
    sub.levels = 0
    sub.render_levels = 1
    tights = mesh_from(["helper-tights"], f"{name}_tights")
    skirt = mesh_from(["helper-skirt"], f"{name}_skirt")
    hair = mesh_from(["helper-hair"], f"{name}_hair")
    eyes = [mesh_from([f"helper-{s}-eye"], f"{name}_eye_{s}") for s in "lr"]
    for o in (tights, skirt, hair):
        o.hide_render = True
    return {"armature": arm, "body": body, "tights": tights, "skirt": skirt, "hair": hair, "eyes": eyes, "joints": joints, "sex": sex}


# ----------------------------------------------------------------------------- posing

def reset_pose(arm):
    for pb in arm.pose.bones:
        pb.rotation_mode = "QUATERNION"
        pb.rotation_quaternion = Quaternion()
        pb.location = Vector()


def rotate(arm, bone, axis, degrees):
    """
    Rotates a bone about an axis given in the character's own frame (x right, -y forward, z up),
    measured at rest. Composes with any rotation already set on the bone.
    """
    pb = arm.pose.bones[bone]
    m = pb.bone.matrix_local.to_3x3()
    q_arm = Quaternion(Vector(axis).normalized(), math.radians(degrees))
    q_local = (m.inverted() @ q_arm.to_matrix() @ m).to_quaternion()
    pb.rotation_mode = "QUATERNION"
    pb.rotation_quaternion = q_local @ pb.rotation_quaternion


def shift(arm, bone, offset):
    """Moves a bone (usually the root) by an offset in the character's frame."""
    pb = arm.pose.bones[bone]
    m = pb.bone.matrix_local.to_3x3()
    pb.location = m.inverted() @ Vector(offset)
