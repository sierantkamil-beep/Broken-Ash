"""
Outfits, hair and weapons for the eight paths, built on a MakeHuman body from mh.py.

Building blocks:
  * region_shell: a fitted garment cut from the body by bone weights (torso, arms, legs...), pushed out
    along the normals and given thickness. It keeps the body's skin weights, so it moves with it.
  * robe: MakeHuman's skirt helper extended to the ankles and flared — long robes and hakama.
  * hair: hundreds of tapered strands grown from the scalp helper, shaped per style, on the head bone.
  * attach: rigid pieces (armour plates, masks, weapons, lanterns) fixed to a bone.

Each path in PATHS is a recipe of those pieces with its own palette (design.md §1 peoples / §4 paths).
"""
import math
import random

import bpy  # noqa: I001 — bpy must load before bmesh
import bmesh
from mathutils import Matrix, Vector

from materials import material, srgb
from models import box, cyl, link, mesh_obj, sphere

# ----------------------------------------------------------------------------- materials

def cloth(name, c1, c2=None, rough=0.85, scale=60.0, bump=0.25, sheen=0.0):
    """Woven cloth: fine noise relief and a little colour variation."""
    return material(f"cloth_{name}", srgb(c1), rough, srgb(c2 or c1), scale, bump=bump)


def silk(name, c1, c2=None):
    """Silk: smooth, a soft sheen, and only a slight shift of shade across the cloth."""
    return material(f"silk_{name}", srgb(c1), 0.36, srgb(c2 or c1), 3.0, bump=0.02, coat=0.12)


def leather(name, c1, c2=None):
    return material(f"leather_{name}", srgb(c1), 0.55, srgb(c2 or c1), 22.0, bump=0.35)


def lacquer(name, c1):
    return material(f"lacquer_{name}", srgb(c1), 0.28, srgb(c1), 8.0, bump=0.03, coat=0.6)


def lamellar(name, c1, c2, lace):
    """Lacquered lamellar: rows of small plates (horizontal bands) bound with coloured lacing."""
    key = f"lamellar_{name}"
    if key in bpy.data.materials:
        return bpy.data.materials[key]
    m = bpy.data.materials.new(key)
    m.use_nodes = True
    nt = m.node_tree
    bsdf = nt.nodes["Principled BSDF"]
    bsdf.inputs["Roughness"].default_value = 0.3
    bsdf.inputs["Coat Weight"].default_value = 0.5
    tc = nt.nodes.new("ShaderNodeTexCoord")
    sep = nt.nodes.new("ShaderNodeSeparateXYZ")
    nt.links.new(tc.outputs["Object"], sep.inputs[0])
    rows = nt.nodes.new("ShaderNodeMath")
    rows.operation = "MULTIPLY"
    rows.inputs[1].default_value = 16.0
    nt.links.new(sep.outputs["Z"], rows.inputs[0])
    frac = nt.nodes.new("ShaderNodeMath")
    frac.operation = "FRACT"
    nt.links.new(rows.outputs[0], frac.inputs[0])
    # Lacing: thin bands near each row's top edge.
    lace_mask = nt.nodes.new("ShaderNodeMath")
    lace_mask.operation = "GREATER_THAN"
    lace_mask.inputs[1].default_value = 0.9
    nt.links.new(frac.outputs[0], lace_mask.inputs[0])
    noise = nt.nodes.new("ShaderNodeTexNoise")
    noise.inputs["Scale"].default_value = 30
    nt.links.new(tc.outputs["Object"], noise.inputs["Vector"])
    plate = nt.nodes.new("ShaderNodeMix")
    plate.data_type = "RGBA"
    plate.inputs["A"].default_value = (*srgb(c1), 1)
    plate.inputs["B"].default_value = (*srgb(c2), 1)
    nt.links.new(noise.outputs["Fac"], plate.inputs["Factor"])
    mix = nt.nodes.new("ShaderNodeMix")
    mix.data_type = "RGBA"
    nt.links.new(lace_mask.outputs[0], mix.inputs["Factor"])
    nt.links.new(plate.outputs["Result"], mix.inputs["A"])
    mix.inputs["B"].default_value = (*srgb(lace), 1)
    nt.links.new(mix.outputs["Result"], bsdf.inputs["Base Color"])
    bump = nt.nodes.new("ShaderNodeBump")
    bump.inputs["Strength"].default_value = 0.6
    nt.links.new(frac.outputs[0], bump.inputs["Height"])
    nt.links.new(bump.outputs["Normal"], bsdf.inputs["Normal"])
    return m


def metal(name, c1, rough=0.35):
    return material(f"metal_{name}", srgb(c1), rough, metallic=0.9)


def skin_material(tone):
    return material(f"skin_{tone}", srgb(tone), 0.42, srgb("#c9927c"), 40.0, sss=0.2, bump=0.04)


def hair_material(color):
    """Cycles' principled hair shader, coloured directly."""
    key = f"hair_{color}"
    if key in bpy.data.materials:
        return bpy.data.materials[key]
    m = bpy.data.materials.new(key)
    m.use_nodes = True
    nt = m.node_tree
    for n in list(nt.nodes):
        if n.type != "OUTPUT_MATERIAL":
            nt.nodes.remove(n)
    h = nt.nodes.new("ShaderNodeBsdfHairPrincipled")
    h.parametrization = "COLOR"
    h.inputs["Color"].default_value = (*srgb(color), 1)
    h.inputs["Roughness"].default_value = 0.3
    h.inputs["Radial Roughness"].default_value = 0.4
    nt.links.new(h.outputs[0], nt.nodes["Material Output"].inputs["Surface"])
    return m


# ----------------------------------------------------------------------------- body regions

TORSO = ("spine", "pelvis", "breast", "clavicle", "shoulder01", "root")
NECK = ("neck",)
UPPERARM = ("upperarm",)
LOWERARM = ("lowerarm",)
HAND = ("wrist", "finger", "metacarpal")
THIGH = ("upperleg",)
SHIN = ("lowerleg",)
FOOT = ("foot", "toe")
HEAD = ("head", "jaw", "special", "levator", "oculi", "orbicularis", "oris", "risorius", "temporalis", "tongue", "eye")


def _weight_sums(obj, prefixes):
    names = {vg.index for vg in obj.vertex_groups if vg.name.startswith(tuple(prefixes))}
    sums = [0.0] * len(obj.data.vertices)
    for v in obj.data.vertices:
        sums[v.index] = sum(g.weight for g in v.groups if g.group in names)
    return sums


def _copy_skinned(src, name):
    o = src.copy()
    o.data = src.data.copy()
    o.name = name
    link(o)
    o.parent = src.parent
    for m in list(o.modifiers):
        if m.type != "ARMATURE":
            o.modifiers.remove(m)
    o.hide_render = False
    o.data.materials.clear()
    return o


def region_shell(r, prefixes, name, mat, offset=0.006, thickness=0.004, thresh=0.45, zmin=-9.0, zmax=9.0, flare=None, keep=None, src="body"):
    """
    A garment cut from the body: vertices whose summed weight for the bones in `prefixes` passes
    `thresh` (and within the height band), pushed out by `offset` (+ flare(v) per vertex).
    """
    src_obj = r[src]
    o = _copy_skinned(src_obj, name)
    sums = _weight_sums(o, prefixes)
    bm = bmesh.new()
    bm.from_mesh(o.data)
    bm.verts.ensure_lookup_table()
    drop = [v for v in bm.verts if not (sums[v.index] >= thresh and zmin <= v.co.z <= zmax and (keep is None or keep(v.co)))]
    bmesh.ops.delete(bm, geom=drop, context="VERTS")
    bm.normal_update()
    for v in bm.verts:
        extra = flare(v.co) if flare else 0.0
        v.co += v.normal * (offset + extra)
    bm.to_mesh(o.data)
    bm.free()
    o.data.materials.append(mat)
    if thickness:
        s = o.modifiers.new("thick", "SOLIDIFY")
        s.thickness = thickness
        s.offset = 1
    sub = o.modifiers.new("smooth", "SUBSURF")
    sub.levels = 0
    sub.render_levels = 1
    return o


def robe(r, name, mat, length=0.1, flare=0.22, split=False, top_offset=0.012):
    """
    A long garment from the waist down: MakeHuman's skirt helper (already weighted to hips and legs),
    its hem extended down to `length` metres above the ground and flared out. split=True opens it at
    the front and back (a riding coat or hakama-like look).
    """
    o = _copy_skinned(r["skirt"], name)
    bm = bmesh.new()
    bm.from_mesh(o.data)
    bm.normal_update()
    for v in bm.verts:
        v.co += v.normal * top_offset
    hem_z = min(v.co.z for v in bm.verts)
    hem = [e for e in bm.edges if e.is_boundary and all(abs(v.co.z - hem_z) < 0.06 for v in e.verts)]
    cx = sum(v.co.x for v in bm.verts) / len(bm.verts)
    cy = sum(v.co.y for v in bm.verts) / len(bm.verts)
    if length < hem_z - 0.02:
        # Extend the hem downwards in a few rings, opening out by `flare` metres at the bottom.
        steps = 4
        edges = hem
        start = {v: v.co.copy() for e in hem for v in e.verts}
        prev = dict(start)
        for k in range(steps):
            res = bmesh.ops.extrude_edge_only(bm, edges=edges)
            new_verts = [g for g in res["geom"] if isinstance(g, bmesh.types.BMVert)]
            edges = [g for g in res["geom"] if isinstance(g, bmesh.types.BMEdge)]
            t = (k + 1) / steps
            for v in new_verts:
                v.co.z = hem_z + (length - hem_z) * t
        # Open the new rings out: nothing at the old hem, `flare` metres at the bottom.
        for v in bm.verts:
            if v.co.z < hem_z - 0.005:
                t = (hem_z - v.co.z) / max(1e-6, hem_z - length)
                d = Vector((v.co.x - cx, v.co.y - cy, 0))
                if d.length > 1e-6:
                    v.co += d.normalized() * flare * t ** 2
    elif length > hem_z + 0.02:
        # Shorter than the helper: cut the hem off at `length`.
        bmesh.ops.delete(bm, geom=[v for v in bm.verts if v.co.z < length], context="VERTS")
    if split:
        cut = [f for f in bm.faces if abs(f.calc_center_median().x - cx) < 0.035 and f.calc_center_median().z < hem_z + 0.05]
        bmesh.ops.delete(bm, geom=cut, context="FACES")
    bm.to_mesh(o.data)
    bm.free()
    o.data.materials.append(mat)
    s = o.modifiers.new("thick", "SOLIDIFY")
    s.thickness = 0.006
    sub = o.modifiers.new("smooth", "SUBSURF")
    sub.levels = 0
    sub.render_levels = 1
    # Cloth folds: a soft vertical ripple.
    tex = bpy.data.textures.new(f"{name}_folds", "WOOD")
    tex.wood_type = "BANDNOISE"
    tex.noise_scale = 0.08
    d = o.modifiers.new("folds", "DISPLACE")
    d.texture = tex
    d.strength = 0.012
    d.texture_coords = "OBJECT"
    return o


# ----------------------------------------------------------------------------- rigid attachments

def attach(r, obj, bone):
    """Fixes an object (built in rest-pose world space) to a bone, so it follows the pose."""
    arm = r["armature"]
    obj.parent = arm
    obj.parent_type = "BONE"
    obj.parent_bone = bone
    b = arm.data.bones[bone]
    # Bone parenting is relative to the bone's tail; cancel that so the object stays where it was built.
    obj.matrix_parent_inverse = (arm.matrix_world @ b.matrix_local @ Matrix.Translation((0, b.length, 0))).inverted()
    return obj


def joint(r, name):
    return r["joints"][name]


def bone_head(r, bone):
    return r["armature"].data.bones[bone].head_local.copy()


def bone_tail(r, bone):
    return r["armature"].data.bones[bone].tail_local.copy()


def palm(r, side):
    """Centre of the palm in rest pose (between the wrist and the middle finger's knuckle)."""
    w = bone_head(r, f"wrist.{side}")
    k = bone_head(r, f"finger3-1.{side}")
    return w.lerp(k, 0.7)


def grip_axes(r, side):
    """
    Rest-pose axes for a held weapon. A fist closes around a grip that runs across the palm from the
    little finger to the index finger, so a blade comes out of the thumb side: `point` runs from the
    little finger's knuckle to the index finger's. `hand` runs from the wrist to the knuckles.
    """
    w = bone_head(r, f"wrist.{side}")
    index = bone_head(r, f"finger2-1.{side}")
    little = bone_head(r, f"finger5-1.{side}")
    point = (index - little).normalized()
    hand = ((index + little) / 2 - w)
    hand = (hand - point * hand.dot(point)).normalized()
    return point, hand


def oriented(obj, origin, x, y, z):
    """Places an object built along its local axes so local (x, y, z) map onto the given world axes."""
    m = Matrix((x, y, z)).transposed().to_4x4()
    m.translation = origin
    obj.matrix_world = m
    return obj


def curve_blade(name, length, width, curve, mat_blade, mat_guard, mat_grip, grip=0.24):
    """A single-edged curved blade with a round guard and a wrapped grip, built along +Z from the fist."""
    bm = bmesh.new()
    n = 24
    prev = None
    for i in range(n + 1):
        t = i / n
        z = t * length
        bend = curve * (t ** 2) * length
        w = width * (1 - 0.65 * t ** 3)
        a = bm.verts.new((0.0, bend, z))
        b = bm.verts.new((0.0, bend + w, z))
        if prev:
            bm.faces.new((prev[0], prev[1], b, a))
        prev = (a, b)
    tip = bm.verts.new((0.0, curve * length + width * 0.2, length * 1.04))
    bm.faces.new((prev[0], prev[1], tip))
    blade = mesh_obj(name, bm, mat_blade)
    s = blade.modifiers.new("t", "SOLIDIFY")
    s.thickness = 0.006
    s.offset = 0
    parts = [blade]
    g = cyl(f"{name}_guard", 0.035, 0.035, 0.008, (0, width / 2, -0.008), mat_guard, segs=16)
    g.rotation_euler = (0, 0, 0)
    parts.append(g)
    parts.append(cyl(f"{name}_grip", 0.015, 0.014, grip, (0, width / 2, -grip - 0.008), mat_grip, segs=10))
    return join(parts, name)


def join(objs, name):
    for o in objs:
        o.select_set(False)
    ctx = bpy.context
    for o in objs:
        o.select_set(True)
    ctx.view_layer.objects.active = objs[0]
    # Apply modifiers so the joined mesh keeps its thickness.
    for o in objs:
        ctx.view_layer.objects.active = o
        for m in list(o.modifiers):
            try:
                bpy.ops.object.modifier_apply(modifier=m.name)
            except RuntimeError:
                pass
    ctx.view_layer.objects.active = objs[0]
    for o in objs:
        o.select_set(True)
    bpy.ops.object.join()
    obj = ctx.view_layer.objects.active
    obj.name = name
    obj.select_set(False)
    return obj


def hold(r, obj, side, roll=0.0):
    """
    Puts a weapon into a hand and fixes it to the wrist. Weapons are built with the blade along +Z
    and the edge along +Y; the blade leaves the fist on the thumb side, the edge faces along the hand.
    roll turns it about the blade axis (e.g. 180 for a reverse grip).
    """
    point, hand = grip_axes(r, side)
    if roll:
        hand = Matrix.Rotation(math.radians(roll), 3, point) @ hand
    x = hand.cross(point).normalized()
    oriented(obj, palm(r, side), x, hand, point)
    bpy.context.view_layer.update()
    return attach(r, obj, f"wrist.{side}")


# ----------------------------------------------------------------------------- hair

def scalp_filter(r):
    """
    MakeHuman's hair helper is a long-hair volume that also hangs in front of the face; roots and the
    cap must stay on the scalp: above the brow, or behind the ears above the nape.
    """
    eye = sum((v.co for v in r["eyes"][0].data.vertices), Vector()) / len(r["eyes"][0].data.vertices)
    head = bone_head(r, "head")

    def keep(co):
        return co.z > eye.z + 0.03 or (co.y > head.y + 0.01 and co.z > head.z + 0.02)

    return keep


def hair(r, style, color, length=0.5, count=320, seed=1):
    """
    Strand hair grown from the scalp helper and fixed to the head bone. Styles:
      tail  — tied at the back of the head, a long tail down the back
      knot  — swept up into a topknot (with a pin)
      loose — falling to the shoulders
      crop  — short and rough
      braid — a single thick braid
    """
    rnd = random.Random(seed)
    scalp = r["hair"]
    keep = scalp_filter(r)
    verts = [v.co.copy() for v in scalp.data.vertices if keep(v.co)]
    centre = sum(verts, Vector()) / len(verts)
    top = max(v.z for v in verts)
    back = max(v.y for v in verts)
    cu = bpy.data.curves.new("hair", "CURVE")
    cu.dimensions = "3D"
    cu.bevel_depth = 0.0028
    cu.bevel_resolution = 1
    cu.use_fill_caps = True
    tie = Vector((centre.x, back + 0.005, top - 0.06))
    crown = Vector((centre.x, centre.y + 0.02, top + 0.035))
    for i in range(count):
        root = rnd.choice(verts)
        out = (root - centre).normalized()
        p0 = root + out * 0.004
        pts = [p0]
        if style == "crop":
            pts.append(p0 + out * 0.025 + Vector((0, 0.01, -0.012)) + Vector((rnd.gauss(0, 0.006), rnd.gauss(0, 0.006), 0)))
        elif style == "knot":
            pts.append(p0.lerp(crown, 0.55) + out * 0.012)
            pts.append(crown + Vector((rnd.gauss(0, 0.012), rnd.gauss(0, 0.012), rnd.gauss(0, 0.008))))
        elif style in ("tail", "braid"):
            pts.append(p0.lerp(tie, 0.6) + out * 0.01)
            pts.append(tie + Vector((rnd.gauss(0, 0.006), 0, rnd.gauss(0, 0.006))))
            spread = 0.01 if style == "braid" else 0.022
            for k in range(1, 5):
                t = k / 4
                pts.append(tie + Vector((rnd.gauss(0, spread), 0.035 * t + rnd.gauss(0, 0.006), -length * t)))
        else:  # loose
            side = Vector((out.x, max(0.0, out.y) * 0.7 + 0.15, 0)).normalized()
            pts.append(p0 + out * 0.02 + Vector((0, 0.01, -0.03)))
            for k in range(1, 4):
                t = k / 3
                pts.append(p0 + side * (0.03 + 0.02 * t) + Vector((rnd.gauss(0, 0.008), 0.02 * t, -length * t)))
        sp = cu.splines.new("NURBS")
        sp.points.add(len(pts) - 1)
        for k, (pt, p) in enumerate(zip(sp.points, pts)):
            pt.co = (*p, 1)
            pt.radius = 1.0 - 0.75 * k / max(1, len(pts) - 1)
        sp.order_u = min(4, len(pts))
        sp.use_endpoint_u = True
    o = bpy.data.objects.new("hair", cu)
    o.data.materials.append(hair_material(color))
    link(o)
    # A cap under the strands, so the scalp never shows through (cut to the scalp, like the roots).
    cap = _copy_skinned(scalp, "hair_cap")
    bm = bmesh.new()
    bm.from_mesh(cap.data)
    bmesh.ops.delete(bm, geom=[v for v in bm.verts if not keep(v.co)], context="VERTS")
    bm.normal_update()
    for v in bm.verts:
        v.co += v.normal * 0.003
    bm.to_mesh(cap.data)
    bm.free()
    cap.data.materials.append(material(f"hair_cap_{color}", srgb(color), 0.45))
    attach(r, o, "head")
    if style == "knot":
        bun = sphere("bun", 0.04, crown, hair_material(color), scale=(1, 1, 0.8))
        pin = cyl("pin", 0.004, 0.004, 0.16, crown + Vector((-0.08, 0, 0.0)), material("pin", srgb("#b08a3e"), 0.3, metallic=0.9), rot=(0, math.radians(90), 0))
        attach(r, bun, "head")
        attach(r, pin, "head")
    if style == "braid":
        for k in range(6):
            b = sphere(f"braid{k}", 0.022 - k * 0.002, tie + Vector((0, 0.03 + 0.008 * k, -0.06 - k * length / 6)), hair_material(color), scale=(1, 0.8, 1.3))
            attach(r, b, "head")
    return o


# ----------------------------------------------------------------------------- recipes per path

def base_layers(r, pal):
    """What every outfit shares: fitted trousers, a jacket over torso and upper arms, wrapped shins, soft boots."""
    region_shell(r, THIGH + ("pelvis", "root"), "trousers", pal["trousers"], offset=0.008, thickness=0.004, zmin=0.3, src="body")
    region_shell(r, SHIN, "wraps", pal["wraps"], offset=0.006, thickness=0.003)
    region_shell(r, FOOT, "boots", pal["boots"], offset=0.004, thickness=0.004)
    region_shell(r, TORSO + NECK, "jacket", pal["jacket"], offset=0.008, thickness=0.004, zmax=r["joints"]["neck02____head"].z if "neck02____head" in r["joints"] else 9)
    region_shell(r, UPPERARM, "sleeves", pal["jacket"], offset=0.009, thickness=0.004, thresh=0.35)
    region_shell(r, LOWERARM, "forearm_wraps", pal["wraps"], offset=0.005, thickness=0.003, thresh=0.5)


def sash(r, mat, width=0.07, z=None, offset=0.022):
    """A wide band around the waist."""
    zc = z if z is not None else bone_head(r, "spine04").z
    return region_shell(r, TORSO, "sash", mat, offset=offset, thickness=0.006, thresh=0.3, zmin=zc - width / 2, zmax=zc + width / 2)


def wide_sleeves(r, mat, flare=0.05):
    """Forearm sleeves that open towards the wrist (court robes, shrine robes)."""
    def f(co):
        return 0.0

    o = region_shell(r, LOWERARM, "wide_sleeves", mat, offset=0.012, thickness=0.004, thresh=0.3)
    # Flare: push the vertices nearest the wrist out further.
    wz = {s: bone_head(r, f"wrist.{s}") for s in "LR"}
    for v in o.data.vertices:
        side = "L" if v.co.x > 0 else "R"
        d = (v.co - wz[side]).length
        k = max(0.0, 1 - d / 0.22)
        n = (v.co - (bone_head(r, f"lowerarm01.{side}").lerp(wz[side], 0.7))).normalized()
        v.co += n * flare * k ** 1.5
    return o


def mask(r, mat, part="lower"):
    """A face mask over the lower face, from just under the eyes (Thorn's half-mask, Sting's wrap)."""
    eye = sum((v.co for v in r["eyes"][0].data.vertices), Vector()) / len(r["eyes"][0].data.vertices)
    head = bone_head(r, "head")

    def keep(co):
        return co.y < head.y - 0.02 and co.z < eye.z - 0.018 and co.z > head.z - 0.04

    return region_shell(r, HEAD + NECK, f"mask_{part}", mat, offset=0.007, thickness=0.004, thresh=0.3, keep=keep)


def plate(r, name, bone, size, offset, mat, rot=(0, 0, 0), curve=0.0):
    """A rigid armour plate (shoulder guard, chest plate) fixed to a bone, curved a little."""
    bm = bmesh.new()
    bmesh.ops.create_grid(bm, x_segments=6, y_segments=6, size=0.5)
    for v in bm.verts:
        x, y = v.co.x * size[0] * 2, v.co.y * size[1] * 2
        v.co = Vector((x, -curve * (x * x) * 6, y))
    o = mesh_obj(name, bm, mat, smooth=True)
    s = o.modifiers.new("t", "SOLIDIFY")
    s.thickness = size[2]
    h = bone_head(r, bone)
    o.location = h + Vector(offset)
    o.rotation_euler = rot
    bpy.context.view_layer.update()
    return attach(r, o, bone)


def build_path(r, path, pal):
    """Dresses and arms the body for one path. pal: the path's materials."""
    r["body"].data.materials.append(pal["skin"])
    for e in r["eyes"]:
        e.data.materials.append(material("eye", srgb("#120a08"), 0.15, coat=0.6))
    base_layers(r, pal)
    s = r["sex"]
    if path == "thorn":
        region_shell(r, TORSO, "lamellar", pal["armour"], offset=0.022, thickness=0.008, zmin=bone_head(r, "spine04").z - 0.05, zmax=bone_head(r, "spine01").z + 0.02)
        sash(r, pal["accent"], z=bone_head(r, "spine04").z - 0.06)
        robe(r, "kusazuri", pal["armour"], length=0.62, flare=0.06, split=True, top_offset=0.03)
        for side, sx in (("L", 1), ("R", -1)):
            plate(r, f"sode{side}", f"upperarm01.{side}", (0.09, 0.11, 0.008), (sx * 0.05, 0, -0.05), pal["armour"], rot=(0, math.radians(-sx * 25), 0), curve=0.6)
        region_shell(r, LOWERARM, "kote", pal["armour"], offset=0.012, thickness=0.005, thresh=0.5)
        mask(r, pal["mask"])
        hair(r, "tail", pal["hair"], length=0.55, seed=11)
        bl = pal["blade"], pal["gold"], pal["accent"]
        hold(r, curve_blade("long_blade", 0.78, 0.034, 0.08, *bl), "R")
        hold(r, curve_blade("short_blade", 0.46, 0.03, 0.06, *bl, grip=0.14), "L", roll=180)
    elif path == "bark":
        region_shell(r, TORSO + UPPERARM, "bark_armour", pal["armour"], offset=0.03, thickness=0.012, thresh=0.4)
        sash(r, pal["accent"], z=bone_head(r, "spine04").z - 0.05, offset=0.04)
        robe(r, "bark_skirt", pal["cloth2"], length=0.45, flare=0.12, split=True)
        for side, sx in (("L", 1), ("R", -1)):
            plate(r, f"pauldron{side}", f"upperarm01.{side}", (0.13, 0.12, 0.02), (sx * 0.06, 0, -0.02), pal["armour"], rot=(0, math.radians(-sx * 30), 0), curve=0.9)
        region_shell(r, HEAD, "helm", pal["armour"], offset=0.018, thickness=0.01, thresh=0.5, keep=lambda co: co.z > bone_head(r, "head").z + 0.06)
        hair(r, "crop", pal["hair"], seed=12)
        blade = curve_blade("great_blade", 1.25, 0.06, 0.05, pal["blade"], pal["metal"], pal["accent"], grip=0.36)
        hold(r, blade, "R")
    elif path == "blood":
        robe(r, "court_robe", pal["cloth"], length=0.03, flare=0.13)
        region_shell(r, TORSO + NECK, "overrobe", pal["cloth"], offset=0.016, thickness=0.005, zmax=bone_head(r, "neck02").z)
        wide_sleeves(r, pal["cloth"], flare=0.09)
        sash(r, pal["accent"], width=0.1)
        hair(r, "knot", pal["hair"], seed=13)
        brush = join([cyl("brush_handle", 0.012, 0.01, 0.42, (0, 0, -0.08), pal["lacquer"], segs=10), cyl("brush_tip", 0.016, 0.002, 0.09, (0, 0, 0.34), material("brush_red", srgb("#6a0a08"), 0.6), segs=10)], "brush")
        hold(r, brush, "R")
    elif path == "ash":
        robe(r, "shrine_robe", pal["cloth"], length=0.06, flare=0.11)
        region_shell(r, TORSO, "shrine_vest", pal["cloth2"], offset=0.016, thickness=0.005)
        wide_sleeves(r, pal["cloth"], flare=0.07)
        sash(r, pal["accent"], width=0.09)
        # Paper talismans hanging from the sash.
        z = bone_head(r, "spine04").z - 0.08
        for k in range(5):
            a = -0.9 + k * 0.45
            p = box(f"talisman{k}", (0.035, 0.002, 0.11), (math.sin(a) * 0.17, -math.cos(a) * 0.13, z), material("paper", srgb("#e8dcc0"), 0.8, srgb("#c8b890"), 10.0))
            attach(r, p, "spine04")
        hair(r, "loose", pal["hair"], length=0.3, seed=14)
        talisman = box("held_talisman", (0.05, 0.003, 0.14), (0, 0, 0.07), material("paper_glow", srgb("#f0e0b0"), 0.7, emission=srgb("#ff7a2a"), emission_strength=1.5))
        hold(r, talisman, "R")
    elif path == "storm":
        robe(r, "wind_robe", pal["cloth"], length=0.12, flare=0.12, split=True)
        region_shell(r, TORSO + NECK, "wind_layer", pal["cloth2"], offset=0.014, thickness=0.004, zmax=bone_head(r, "neck02").z)
        wide_sleeves(r, pal["cloth"], flare=0.06)
        sash(r, pal["accent"])
        hair(r, "braid", pal["hair"], length=0.6, seed=15)
        for side in "LR":
            hold(r, war_fan(pal), side, roll=0 if side == "R" else 180)
    elif path == "graves":
        robe(r, "shroud", pal["cloth"], length=0.02, flare=0.14)
        region_shell(r, TORSO + NECK + UPPERARM, "shroud_top", pal["cloth"], offset=0.018, thickness=0.006, thresh=0.35)
        wide_sleeves(r, pal["cloth"], flare=0.08)
        region_shell(r, HEAD + NECK, "hood", pal["cloth"], offset=0.03, thickness=0.006, thresh=0.4, keep=lambda co: co.y > bone_head(r, "head").y - 0.06 or co.z > bone_head(r, "head").z + 0.08)
        sash(r, pal["accent"], width=0.05)
        hold(r, spirit_lantern(pal), "L")
    elif path == "dusk":
        robe(r, "riding_coat", pal["cloth"], length=0.42, flare=0.14, split=True)
        region_shell(r, TORSO + UPPERARM, "leather_coat", pal["armour"], offset=0.014, thickness=0.006, thresh=0.35)
        fur = material("fur", srgb("#5a4a3a"), 0.95, srgb("#2e241c"), 120.0, bump=0.9)
        region_shell(r, NECK + ("clavicle", "spine01"), "fur_collar", fur, offset=0.035, thickness=0.02, thresh=0.5, zmin=bone_head(r, "spine01").z - 0.02)
        sash(r, pal["accent"])
        hair(r, "braid", pal["hair"], length=0.45, seed=16)
        hold(r, longbow(pal), "L")
        quiver = cyl("quiver", 0.05, 0.05, 0.55, bone_head(r, "spine02") + Vector((0.08, 0.13, -0.25)), pal["armour"], rot=(math.radians(15), math.radians(20), 0))
        attach(r, quiver, "spine02")
    elif path == "sting":
        region_shell(r, TORSO + UPPERARM + LOWERARM, "wraps_top", pal["cloth"], offset=0.008, thickness=0.004, thresh=0.3)
        region_shell(r, HEAD + NECK, "hood", pal["cloth"], offset=0.012, thickness=0.004, thresh=0.4, keep=lambda co: co.y > bone_head(r, "head").y - 0.04 or co.z > bone_head(r, "head").z + 0.07)
        mask(r, pal["mask"])
        sash(r, pal["accent"], width=0.05)
        for side in "LR":
            knife = join([box("kb", (0.004, 0.025, 0.16), (0, 0, 0.09), pal["blade"]), cyl("kg", 0.012, 0.012, 0.08, (0, 0, -0.07), pal["accent"], segs=8)], f"knife{side}")
            hold(r, knife, side, roll=0 if side == "R" else 180)
        pipe = cyl("blowpipe", 0.012, 0.012, 0.9, bone_head(r, "spine02") + Vector((-0.1, 0.12, -0.35)), pal["lacquer"], rot=(math.radians(20), math.radians(-25), 0))
        attach(r, pipe, "spine02")


def war_fan(pal):
    """An iron-ribbed war-fan, open: a half disc of paper on ribs."""
    bm = bmesh.new()
    c = bm.verts.new((0, 0, 0))
    ring = []
    for i in range(17):
        a = math.radians(-70 + 140 * i / 16)
        ring.append(bm.verts.new((0, math.sin(a) * 0.3, math.cos(a) * 0.3)))
    for i in range(16):
        bm.faces.new((c, ring[i], ring[i + 1]))
    fan = mesh_obj("fan_paper", bm, material("fan_paper", srgb("#d8d4c8"), 0.7, srgb("#3a5a7a"), 6.0))
    s = fan.modifiers.new("t", "SOLIDIFY")
    s.thickness = 0.004
    ribs = [box(f"rib{i}", (0.004, 0.006, 0.3), (0, math.sin(math.radians(-70 + 140 * i / 6)) * 0.15, math.cos(math.radians(-70 + 140 * i / 6)) * 0.15), pal["metal"], rot=(math.radians(70 - 140 * i / 6), 0, 0)) for i in range(7)]
    return join([fan] + ribs, "war_fan")


def spirit_lantern(pal):
    """A Lantern-Keeper's spirit lantern on a short black pole, glowing pale."""
    pole = cyl("lpole", 0.01, 0.01, 0.5, (0, 0, -0.1), pal["lacquer"], segs=8)
    glow = material("spirit", srgb("#8fa8b4"), 0.4, emission=srgb("#a8d8f0"), emission_strength=1.2)
    lamp = sphere("lamp", 0.05, (0, -0.06, 0.32), glow, scale=(1, 1, 1.3))
    cap = cyl("lcap", 0.04, 0.03, 0.03, (0, -0.06, 0.41), pal["lacquer"], segs=10)
    arm = box("larm", (0.008, 0.07, 0.008), (0, -0.03, 0.42), pal["lacquer"])
    return join([pole, lamp, cap, arm], "spirit_lantern")


def longbow(pal):
    """The Dusk Riders' asymmetric bow: the grip sits low, the upper limb is longer."""
    cu = bpy.data.curves.new("bow", "CURVE")
    cu.dimensions = "3D"
    cu.bevel_depth = 0.012
    sp = cu.splines.new("NURBS")
    pts = [(0, 0.0, -0.55), (0, -0.08, -0.35), (0, -0.02, 0.0), (0, -0.1, 0.5), (0, 0.0, 1.05)]
    sp.points.add(len(pts) - 1)
    for p, c in zip(sp.points, pts):
        p.co = (*c, 1)
    sp.order_u = 4
    sp.use_endpoint_u = True
    bow = bpy.data.objects.new("bow", cu)
    bow.data.materials.append(pal["lacquer"])
    link(bow)
    bpy.context.view_layer.objects.active = bow
    bow.select_set(True)
    bpy.ops.object.convert(target="MESH")
    bow.select_set(False)
    string = cyl("string", 0.002, 0.002, 1.6, (0, 0.0, -0.55), material("string", srgb("#d8d0c0"), 0.6), segs=4)
    return join([bow, string], "longbow")


# ----------------------------------------------------------------------------- palettes

def palette(path, sex):
    """Materials for a path, from its home people's colours (design.md §1)."""
    S = skin_material
    P = {
        "thorn": dict(skin=S("#e6c3ab"), hair="#16100e", trousers=cloth("thorn_hakama", "#2a2326", "#1a1517"), wraps=cloth("wrap_dark", "#3a3230"), boots=leather("boot_black", "#1a1414"),
                      jacket=cloth("thorn_jacket", "#4a3a34", "#2e2422"), armour=lamellar("thorn", "#5a0e0c", "#2a0806", "#c8a050"), accent=silk("thorn_cord", "#c8a050"), mask=lacquer("mask_black", "#121011"),
                      blade=metal("steel", "#b8bcc0", 0.18), gold=metal("gold", "#b08a3e", 0.3)),
        "bark": dict(skin=S("#d8b49a"), hair="#3a2a20", trousers=cloth("bark_trousers", "#3a3228", "#2a241c"), wraps=leather("bark_wrap", "#3a2a1e"), boots=leather("boot_brown", "#2a1e16"),
                     jacket=cloth("bark_gambeson", "#4a3e30"), armour=material("bark_plate", srgb("#4a3424"), 0.85, srgb("#20160e"), 14.0, bump=1.0), accent=silk("bark_sash", "#6a7a3a"),
                     cloth2=cloth("bark_cloth", "#2e2a22"), blade=metal("dark_steel", "#7c8084", 0.3), metal=metal("iron", "#4a4a4c", 0.45)),
        "blood": dict(skin=S("#ecd2c2"), hair="#0e0a0c", trousers=silk("blood_under", "#1a0a0c"), wraps=silk("blood_wrap", "#1a0a0c"), boots=lacquer("blood_shoes", "#140c0c"),
                      jacket=silk("blood_inner", "#2a0e10"), cloth=silk("blood_robe", "#6e0a10", "#5a080c"), accent=silk("blood_gold", "#b08a3e", "#8a6a2a"), lacquer=lacquer("black", "#141012")),
        "ash": dict(skin=S("#e2bea4"), hair="#2a1a14", trousers=cloth("ash_hakama", "#e2dccc", "#bab2a0"), wraps=cloth("ash_wrap", "#2a2624"), boots=leather("ash_sandal", "#2a201a"),
                    jacket=cloth("ash_inner", "#d8d0bc"), cloth=cloth("ash_robe", "#ece6d6", "#c8c0ac"), cloth2=cloth("ash_vest", "#2a2624"), accent=silk("ember_sash", "#c8461a")),
        "storm": dict(skin=S("#eed8c8"), hair="#cfd4d8", trousers=cloth("storm_trousers", "#3a4a5a"), wraps=cloth("storm_wrap", "#2a3440"), boots=leather("storm_boot", "#1e2228"),
                      jacket=silk("storm_inner", "#5a7088"), cloth=silk("storm_robe", "#8aa0b4", "#5a7088"), cloth2=silk("storm_layer", "#9aa8b6", "#8494a4"), accent=silk("storm_sash", "#2a4a6a"),
                      metal=metal("fan_iron", "#3a3a40", 0.4)),
        "graves": dict(skin=S("#dcd4d0"), hair="#d8d8d4", trousers=cloth("grave_under", "#2a2a2c"), wraps=cloth("grave_wrap", "#3a3a3a"), boots=leather("grave_boot", "#1a1a1c"),
                       jacket=cloth("grave_inner", "#3a3a3c"), cloth=cloth("shroud", "#4a4a48", "#2e2e2e", rough=0.95), accent=material("bone", srgb("#d8ccb0"), 0.6, srgb("#a89a80"), 20.0), lacquer=lacquer("black", "#141012")),
        "dusk": dict(skin=S("#d2a888"), hair="#2a1c14", trousers=leather("dusk_trousers", "#4a3626", "#2e2018"), wraps=leather("dusk_wrap", "#3a2a1e"), boots=leather("dusk_boot", "#2a1c14"),
                     jacket=cloth("dusk_shirt", "#5a4a3a"), cloth=cloth("dusk_coat", "#6a5a44", "#4a3e2e"), armour=leather("dusk_leather", "#5a3e28", "#3a281a"), accent=silk("dusk_sash", "#8a2a1a"), lacquer=lacquer("bow", "#2a1a12")),
        "sting": dict(skin=S("#dcb8a0"), hair="#0e0c0c", trousers=cloth("sting_trousers", "#141618"), wraps=cloth("sting_wrap", "#1e2024"), boots=leather("sting_boot", "#101112"),
                      jacket=cloth("sting_jacket", "#16181a"), cloth=cloth("sting_wraps", "#1c1e22", "#101214"), mask=cloth("sting_mask", "#101214"), accent=silk("sting_sash", "#3a5a3a"),
                      blade=metal("dark_blade", "#5a5e62", 0.25), lacquer=lacquer("pipe", "#2a3a2a")),
    }[path]
    if sex == "female":
        # Hair colours stay with the people; nothing else changes by body.
        pass
    return P


# ----------------------------------------------------------------------------- the Greyed

GREYED_SHAPES = {
    # The ash-skinned dead: what they were in life still shows in the body.
    "shambler": dict(sex="male", shape={"muscle": {"averagemuscle": 1.0}, "weight": {"averageweight": 1.0}, "height": 0.3}, scale=1.0),
    "runner": dict(sex="female", shape={"muscle": {"minmuscle": 0.6, "averagemuscle": 0.4}, "weight": {"minweight": 1.0}, "height": 0.4}, scale=0.98),
    "bloated": dict(sex="male", shape={"muscle": {"minmuscle": 0.5, "averagemuscle": 0.5}, "weight": {"maxweight": 1.0}, "height": 0.1}, scale=1.05),
    "tapper": dict(sex="male", shape={"muscle": {"maxmuscle": 1.0}, "weight": {"maxweight": 0.6, "averageweight": 0.4}, "height": 1.0}, scale=1.32),
    # Act 1's mine and road.
    "miner": dict(sex="male", shape={"muscle": {"maxmuscle": 0.6, "averagemuscle": 0.4}, "weight": {"averageweight": 1.0}, "height": 0.2}, scale=1.0),
    "drowned": dict(sex="female", shape={"muscle": {"minmuscle": 1.0}, "weight": {"minweight": 0.6, "averageweight": 0.4}, "height": 0.5}, scale=1.0),
    "eater": dict(sex="male", shape={"muscle": {"minmuscle": 1.0}, "weight": {"minweight": 1.0}, "height": 1.0}, scale=1.08),
    # Humans of the Iron March: alive, European, armoured.
    "crossbow": dict(sex="male", shape={"muscle": {"averagemuscle": 1.0}, "weight": {"averageweight": 1.0}, "height": 0.6}, scale=1.0),
    "manatarms": dict(sex="male", shape={"muscle": {"maxmuscle": 0.7, "averagemuscle": 0.3}, "weight": {"averageweight": 1.0}, "height": 0.7}, scale=1.04),
}

# Which kinds are living humans (pink skin, no stoop, no rot) rather than the Greyed.
HUMANS = {"crossbow", "manatarms"}


def build_human(r, kind):
    """
    An Iron March soldier: ruddy European skin, a padded gambeson, a steel kettle hat. The crossbowman
    carries his crossbow; the man-at-arms wears plate over mail with a kite shield and an arming sword.
    """
    r["body"].data.materials.append(skin_material("#c8907a"))
    for e in r["eyes"]:
        e.data.materials.append(material("eye_human", srgb("#e8e4dc"), 0.2))
    gambeson = cloth("gambeson", "#7a6a4e", "#4e4232", rough=0.9, scale=40.0, bump=0.5)
    hose = cloth("hose", "#3a3028", "#241e18", rough=0.9)
    steel = metal("march_steel", "#8a8e94", 0.3)
    region_shell(r, THIGH + SHIN + ("pelvis", "root"), "hose", hose, offset=0.006, thickness=0.004, zmin=0.08)
    region_shell(r, FOOT, "boots", leather("boots", "#2a1e14", "#1a120c"), offset=0.008, thickness=0.006)
    region_shell(r, TORSO + UPPERARM, "gambeson", gambeson, offset=0.014, thickness=0.01)
    hair(r, "crop", "#5a4030", count=160, seed=31)
    # Kettle hat: a steel dome with a wide brim.
    head_c = bone_head(r, "head") + Vector((0, 0, 0.11))
    dome = sphere("kettle_dome", 0.105, head_c + Vector((0, 0, 0.02)), steel, scale=(1, 1, 0.8))
    brim = cyl("kettle_brim", 0.155, 0.155, 0.015, head_c + Vector((0, 0, -0.03)), steel, segs=24)
    for o in (dome, brim):
        attach(r, o, "head")
    if kind == "crossbow":
        stock = box("xbow_stock", (0.05, 0.05, 0.62), (0, 0, 0.12), lacquer("xbow_wood", "#4a3220"))
        limbs = box("xbow_limbs", (0.62, 0.035, 0.04), (0, 0, 0.36), steel)
        hold(r, join([stock, limbs], "crossbow"), "R")
        # A quiver of bolts at the hip.
        hip = bone_head(r, "upperleg01.L")
        q = cyl("quiver", 0.05, 0.05, 0.36, hip + Vector((0.1, 0.06, 0.1)), leather("quiver", "#3a2a1a"), segs=10)
        attach(r, q, "upperleg01.L")
    else:
        plate_m = metal("march_plate", "#9a9ea4", 0.25)
        region_shell(r, TORSO, "breastplate", plate_m, offset=0.03, thickness=0.01, thresh=0.5, zmin=0.9)
        region_shell(r, UPPERARM + LOWERARM, "vambrace", plate_m, offset=0.02, thickness=0.008, thresh=0.5)
        region_shell(r, THIGH + SHIN, "greaves", plate_m, offset=0.02, thickness=0.008, thresh=0.5)
        sword = join([box("sword_blade", (0.012, 0.05, 0.75), (0, 0, 0.42), steel),
                      box("sword_guard", (0.03, 0.22, 0.03), (0, 0, 0.04), steel),
                      cyl("sword_grip", 0.02, 0.02, 0.16, (0, 0, -0.06), leather("sword_grip", "#2a1a10"), segs=8)], "arming_sword")
        hold(r, sword, "R")
        # A kite shield on the left forearm, painted in the Margrave's black and gold.
        sh = box("kite_shield", (0.04, 0.42, 0.66), (0, 0, 0), material("shield_paint", srgb("#1a1a1e"), 0.5))
        boss = sphere("shield_boss", 0.05, (0.03, 0, 0.08), metal("shield_gold", "#b08a3e", 0.3))
        shield = join([sh, boss], "kite")
        fa = bone_head(r, "lowerarm01.L")
        shield.location = fa + Vector((0.12, -0.06, -0.12))
        bpy.context.view_layer.update()
        attach(r, shield, "lowerarm01.L")


def build_greyed(r, kind):
    """Dresses a Greyed: ash skin, rotten rags, wounds; the Tapper gets his apron, sap tank and cleaver."""
    if kind in HUMANS:
        return build_human(r, kind)
    ash_skin = material("greyed_skin", srgb("#8c908a"), 0.6, srgb("#5e625c"), 18.0, sss=0.1, bump=0.4)
    rot = cloth("rags", "#3a3430", "#1e1a18", rough=0.95, scale=30.0, bump=0.5)
    blood = material("old_blood", srgb("#3a0606"), 0.3, srgb("#1a0202"), 12.0, coat=0.4)
    r["body"].data.materials.append(ash_skin)
    for e in r["eyes"]:
        e.data.materials.append(material("dead_eye", srgb("#d8d4c0"), 0.2, emission=srgb("#c8c0a0"), emission_strength=0.6))
    # Torn trousers and a ragged shirt; parts of the body show through where the cloth rotted away.
    region_shell(r, THIGH + ("pelvis", "root"), "rag_trousers", rot, offset=0.008, thickness=0.004, zmin=0.35)
    region_shell(r, TORSO, "rag_shirt", rot, offset=0.009, thickness=0.004, keep=lambda co: (int(co.x * 37) + int(co.z * 23)) % 5 != 0)
    # Wounds: dark blood patches on the chest and arms.
    region_shell(r, TORSO + UPPERARM, "wounds", blood, offset=0.012, thickness=0.0, thresh=0.5, keep=lambda co: (int(co.x * 53) * 7 + int(co.z * 41) * 3) % 11 == 0)
    if kind == "runner":
        hair(r, "loose", "#5a5a56", length=0.35, count=200, seed=21)
        # Once a keep guard: broken red lamellar and a cracked helmet.
        region_shell(r, TORSO, "guard_lamellar", lamellar("greyed_guard", "#5a1410", "#2a0a08", "#8a6a3a"), offset=0.02, thickness=0.008, thresh=0.5, keep=lambda co: (int(co.x * 31) + int(co.z * 17)) % 4 != 0)
    elif kind == "miner":
        hair(r, "crop", "#3a3a36", count=150, seed=23)
        # A leather cap with a lamp still burning on it, a pickaxe in both hands.
        cap = sphere("miner_cap", 0.12, bone_head(r, "head") + Vector((0, 0, 0.12)), leather("miner_cap", "#3a2a1a"), scale=(1, 1, 0.6))
        lamp = sphere("miner_lamp", 0.04, bone_head(r, "head") + Vector((0, -0.11, 0.14)), material("lamp", srgb("#ffd890"), 0.3, emission=srgb("#ffb050"), emission_strength=8))
        for o in (cap, lamp):
            attach(r, o, "head")
        pick = join([cyl("pick_handle", 0.022, 0.022, 0.8, (0, 0, 0.1), lacquer("pick_wood", "#5a4028"), segs=8),
                     box("pick_head", (0.03, 0.46, 0.05), (0, 0.0, 0.48), metal("pick_iron", "#4a4440", 0.5))], "pickaxe")
        hold(r, pick, "R")
    elif kind == "drowned":
        hair(r, "loose", "#2a3428", length=0.6, count=220, seed=24)
        # Drowned in sap: amber dripping from the hair and down the body, glowing faintly.
        sap = material("sap_amber", srgb("#c87818"), 0.15, srgb("#7a4008"), 8.0, coat=0.9, emission=srgb("#a85a08"), emission_strength=0.8)
        region_shell(r, TORSO + UPPERARM + THIGH, "sap_coat", sap, offset=0.011, thickness=0.0, thresh=0.4, keep=lambda co: (int(co.x * 29) * 5 + int(co.z * 37)) % 3 == 0)
    elif kind == "eater":
        # Gaunt, shirtless, blood to the elbows and down the chin and chest.
        fresh = material("fresh_blood", srgb("#6a0a0a"), 0.25, srgb("#3a0404"), 10.0, coat=0.7)
        region_shell(r, LOWERARM + HAND, "gore_arms", fresh, offset=0.006, thickness=0.0, thresh=0.4)
        region_shell(r, TORSO, "gore_chest", fresh, offset=0.012, thickness=0.0, thresh=0.5, zmin=1.15)
    elif kind == "shambler":
        hair(r, "crop", "#4a4a46", count=180, seed=22)
    if kind == "tapper":
        apron = leather("apron", "#2a1e16", "#140e0a")
        region_shell(r, TORSO + THIGH, "apron", apron, offset=0.03, thickness=0.008, thresh=0.3, keep=lambda co: co.y < 0.02)
        sap = material("sap", srgb("#9a1a0c"), 0.15, srgb("#5a0804"), 6.0, coat=0.8, emission=srgb("#6a0a04"), emission_strength=0.6)
        iron = metal("rust", "#4a3a30", 0.6)
        back = bone_head(r, "spine02") + Vector((0, 0.22, -0.05))
        tank = cyl("tank", 0.16, 0.16, 0.7, back + Vector((0, 0, -0.35)), sap, segs=20)
        bands = [cyl(f"band{k}", 0.17, 0.17, 0.04, back + Vector((0, 0, -0.33 + k * 0.3)), iron, segs=20) for k in range(3)]
        for o in [tank] + bands:
            attach(r, o, "spine02")
        hose = cyl("hose", 0.03, 0.03, 0.6, back + Vector((0.12, 0, 0.2)), iron, rot=(0, math.radians(70), math.radians(-30)), segs=8)
        attach(r, hose, "spine02")
        cleaver = join([box("cleaver_blade", (0.012, 0.22, 0.7), (0, 0.08, 0.38), metal("cleaver", "#6a6460", 0.5)),
                        cyl("cleaver_grip", 0.025, 0.025, 0.3, (0, 0, -0.27), leather("grip", "#2a1a10"), segs=8)], "cleaver")
        hold(r, cleaver, "R")
