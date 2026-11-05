"""
Procedural models for props and characters. Built in Blender coordinates (see common.py):
the camera sees the +X and -Y faces; the world origin is the centre of the prop's footprint.
"""
import math
import random

import bmesh
import bpy
from mathutils import Vector

from materials import PALETTE as P, material, srgb


# ----------------------------------------------------------------------------- primitives

def link(o, parent=None):
    bpy.context.scene.collection.objects.link(o)
    if parent is not None:
        o.parent = parent
    return o


def mesh_obj(name, bm, mat, parent=None, smooth=False):
    me = bpy.data.meshes.new(name)
    bm.to_mesh(me)
    bm.free()
    if smooth:
        for p in me.polygons:
            p.use_smooth = True
    me.materials.append(mat)
    o = bpy.data.objects.new(name, me)
    return link(o, parent)


def box(name, size, loc, mat, parent=None, rot=(0, 0, 0), bevel=0.0):
    bm = bmesh.new()
    bmesh.ops.create_cube(bm, size=1.0)
    for v in bm.verts:
        v.co = Vector((v.co.x * size[0], v.co.y * size[1], v.co.z * size[2]))
    if bevel:
        bmesh.ops.bevel(bm, geom=bm.edges[:], offset=bevel, segments=2, affect="EDGES")
    o = mesh_obj(name, bm, mat, parent)
    o.location = loc
    o.rotation_euler = rot
    return o


def cyl(name, r1, r2, h, loc, mat, parent=None, rot=(0, 0, 0), segs=16, smooth=True, cap=True):
    """A (possibly tapered) cylinder standing on loc, height h along local +Z."""
    bm = bmesh.new()
    bmesh.ops.create_cone(bm, cap_ends=cap, cap_tris=False, segments=segs, radius1=r1, radius2=r2, depth=h)
    for v in bm.verts:
        v.co.z += h / 2
    o = mesh_obj(name, bm, mat, parent, smooth)
    o.location = loc
    o.rotation_euler = rot
    return o


def sphere(name, r, loc, mat, parent=None, scale=(1, 1, 1), subdiv=3, smooth=True):
    bm = bmesh.new()
    bmesh.ops.create_icosphere(bm, subdivisions=subdiv, radius=r)
    for v in bm.verts:
        v.co = Vector((v.co.x * scale[0], v.co.y * scale[1], v.co.z * scale[2]))
    o = mesh_obj(name, bm, mat, parent, smooth)
    o.location = loc
    return o


def empty(name, loc=(0, 0, 0), parent=None):
    o = bpy.data.objects.new(name, None)
    o.location = loc
    return link(o, parent)


def modifier(o, kind, **props):
    m = o.modifiers.new(kind.lower(), kind)
    for k, v in props.items():
        setattr(m, k, v)
    return m


def curved_roof(name, hx, hy, height, loc, mat, upturn=0.25, thickness=0.06, parent=None, ridge=0.0):
    """
    A hipped roof with a concave slope and upturned corners — the curved eaves of the realm.
    hx, hy: half extents of the eaves; ridge: half length of the ridge along X.
    """
    n = 28
    bm = bmesh.new()
    verts = []
    for j in range(n + 1):
        row = []
        for i in range(n + 1):
            u = -1 + 2 * i / n
            v = -1 + 2 * j / n
            x, y = u * hx, v * hy
            # Distance to the ridge, normalised to 1 at the eaves.
            ax = max(0.0, (abs(x) - ridge) / max(1e-6, hx - ridge))
            ay = abs(y) / hy
            m = max(ax, ay)
            z = height * (1 - m) ** 1.7
            z += upturn * (ax * ay) ** 3 + upturn * 0.25 * m ** 6
            row.append(bm.verts.new((x, y, z)))
        verts.append(row)
    for j in range(n):
        for i in range(n):
            bm.faces.new((verts[j][i], verts[j][i + 1], verts[j + 1][i + 1], verts[j + 1][i]))
    o = mesh_obj(name, bm, mat, parent, smooth=True)
    o.location = loc
    modifier(o, "SOLIDIFY", thickness=thickness, offset=-1)
    return o


def tiled_roof_material():
    """Dark ceramic tiles: wave texture ridges running down the slope."""
    m = bpy.data.materials.new("roof_tiles")
    m.use_nodes = True
    nt = m.node_tree
    bsdf = nt.nodes["Principled BSDF"]
    bsdf.inputs["Base Color"].default_value = (*P["roof"], 1)
    bsdf.inputs["Roughness"].default_value = 0.45
    tc = nt.nodes.new("ShaderNodeTexCoord")
    wave = nt.nodes.new("ShaderNodeTexWave")
    wave.wave_type = "BANDS"
    wave.bands_direction = "X"
    wave.inputs["Scale"].default_value = 9
    nt.links.new(tc.outputs["Object"], wave.inputs["Vector"])
    bump = nt.nodes.new("ShaderNodeBump")
    bump.inputs["Strength"].default_value = 0.5
    nt.links.new(wave.outputs["Fac"], bump.inputs["Height"])
    nt.links.new(bump.outputs["Normal"], bsdf.inputs["Normal"])
    return m


def rocky(name, r, loc, mat, seed, parent=None, squash=0.7):
    o = sphere(name, r, loc, mat, parent, scale=(1, 0.9, squash), subdiv=4)
    tex = bpy.data.textures.new(f"{name}_tex", "VORONOI")
    tex.noise_scale = 0.35 + (seed % 3) * 0.08
    d = modifier(o, "DISPLACE", texture=tex, strength=r * 0.35)
    d.texture_coords = "OBJECT"
    o.rotation_euler = (0, 0, seed * 1.7)
    return o


# ----------------------------------------------------------------------------- props

def stone_material():
    return material("stone", P["stone"], 0.85, P["stone_dark"], 5.0, bump=0.35)


def mossy_stone_material():
    return material("mossy_stone", P["stone"], 0.9, P["moss"], 3.0, bump=0.4)


def build_stone_lantern(_v=0):
    st = stone_material()
    ms = mossy_stone_material()
    cyl("base", 0.3, 0.26, 0.12, (0, 0, 0), ms, segs=6)
    cyl("shaft", 0.1, 0.09, 0.55, (0, 0, 0.12), st, segs=8)
    cyl("platform", 0.24, 0.24, 0.08, (0, 0, 0.67), st, segs=6)
    # Fire box: hollow look via a dark box with a glowing core (the engine adds the real light).
    box("firebox", (0.3, 0.3, 0.26), (0, 0, 0.88), st)
    glow = material("ember_glow", srgb("#ffb070"), 0.5, emission=srgb("#ff9a40"), emission_strength=7)
    for dx, dy in [(0.152, 0), (0, -0.152)]:
        box("window", (0.12 if dx == 0 else 0.01, 0.01 if dx == 0 else 0.12, 0.13), (dx, dy, 0.88), glow)
    curved_roof("roof", 0.3, 0.3, 0.22, (0, 0, 1.0), stone_material(), upturn=0.08, thickness=0.05)
    sphere("finial", 0.06, (0, 0, 1.26), st, scale=(1, 1, 1.4))


def build_paper_lantern(_v=0):
    wood = material("wood", P["wood"], 0.7, P["wood_dark"], 12.0, bump=0.2)
    cyl("post", 0.07, 0.06, 2.35, (0, 0, 0), wood, segs=8)
    box("arm", (0.06, 0.55, 0.06), (0, -0.25, 2.3), wood)
    cyl("cord", 0.008, 0.008, 0.12, (0, -0.48, 2.15), material("cord", P["lacquer"], 0.5))
    paper = material("paper", srgb("#c22a1c"), 0.55, srgb("#8e1a12"), 4.0, emission=srgb("#ff3a1a"), emission_strength=1.6)
    sphere("lantern", 0.2, (0, -0.48, 1.98), paper, scale=(1, 1, 1.25))
    black = material("lacquer", P["lacquer"], 0.3, coat=0.5)
    cyl("cap_top", 0.09, 0.08, 0.05, (0, -0.48, 2.2), black)
    cyl("cap_bot", 0.08, 0.09, 0.05, (0, -0.48, 1.71), black)
    # Ribs on the paper.
    for z in (1.86, 1.98, 2.1):
        cyl(f"rib{z}", 0.205 if z == 1.98 else 0.18, 0.205 if z == 1.98 else 0.18, 0.01, (0, -0.48, z), black, segs=24)
    cyl("foot", 0.18, 0.14, 0.1, (0, 0, 0), stone_material(), segs=6)


def build_gate(_v=0):
    red = material("vermilion", P["vermilion"], 0.35, P["vermilion_dark"], 3.0, coat=0.3, bump=0.05)
    black = material("lacquer", P["lacquer"], 0.3, coat=0.5)
    for x in (-1.0, 1.0):
        cyl(f"pillar{x}", 0.16, 0.14, 3.0, (x, 0, 0.18), red, segs=20)
        cyl(f"socket{x}", 0.22, 0.2, 0.2, (x, 0, 0), black, segs=20)
    box("tie", (2.4, 0.18, 0.18), (0, 0, 2.45), red)
    box("plaque", (0.36, 0.08, 0.5), (0, -0.02, 2.7), black)
    gold = material("gold", P["gold"], 0.35, metallic=0.8)
    box("plaque_trim", (0.3, 0.09, 0.44), (0, -0.025, 2.7), gold)
    box("plaque_inner", (0.26, 0.1, 0.4), (0, -0.03, 2.7), black)
    # The top lintel curves up at the ends (bmesh grid bent along X).
    bm = bmesh.new()
    bmesh.ops.create_grid(bm, x_segments=24, y_segments=1, size=1.0)
    for v in bm.verts:
        x = v.co.x * 1.6
        v.co = Vector((x, v.co.y * 0.14, 0.08 * (x / 1.6) ** 4 * 3))
    o = mesh_obj("lintel", bm, red, smooth=True)
    o.location = (0, 0, 3.05)
    modifier(o, "SOLIDIFY", thickness=0.2, offset=0)
    bm = bmesh.new()
    bmesh.ops.create_grid(bm, x_segments=24, y_segments=1, size=1.0)
    for v in bm.verts:
        x = v.co.x * 1.75
        v.co = Vector((x, v.co.y * 0.2, 0.1 * (x / 1.75) ** 4 * 3))
    o = mesh_obj("cap", bm, black, smooth=True)
    o.location = (0, 0, 3.2)
    modifier(o, "SOLIDIFY", thickness=0.1, offset=0)


def build_blossom_tree(v=0):
    rnd = random.Random(100 + v)
    bark = material("bark", srgb("#3a2a24"), 0.9, srgb("#1e1512"), 9.0, bump=0.6)
    petals = [
        material("blossom", P["blossom"], 0.7, P["blossom_dark"], 7.0),
        material("blossom_l", P["blossom_light"], 0.7, P["blossom"], 7.0),
        material("blossom_d", P["blossom_dark"], 0.75, P["blossom"], 7.0),
    ]

    def branch(name, pts, radii):
        cu = bpy.data.curves.new(name, "CURVE")
        cu.dimensions = "3D"
        cu.bevel_depth = 1.0
        cu.bevel_resolution = 3
        sp = cu.splines.new("NURBS")
        sp.points.add(len(pts) - 1)
        for p, c, r in zip(sp.points, pts, radii):
            p.co = (*c, 1)
            p.radius = r
        sp.use_endpoint_u = True
        sp.order_u = 3
        o = bpy.data.objects.new(name, cu)
        o.data.materials.append(bark)
        return link(o)

    lean = rnd.uniform(-0.3, 0.3)
    trunk = [(0, 0, -0.1), (0.05 + lean * 0.3, 0.02, 0.8), (lean * 0.6, -0.05, 1.6), (lean, 0.1, 2.3)]
    branch("trunk", trunk, [0.24, 0.17, 0.13, 0.09])
    tips = []
    for i in range(6):
        a = i / 6 * math.tau + rnd.uniform(-0.3, 0.3)
        reach = rnd.uniform(1.0, 1.6)
        start = trunk[2 if i % 2 else 3]
        mid = (start[0] + math.cos(a) * reach * 0.5, start[1] + math.sin(a) * reach * 0.5, start[2] + rnd.uniform(0.3, 0.6))
        tip = (start[0] + math.cos(a) * reach, start[1] + math.sin(a) * reach, start[2] + rnd.uniform(0.5, 1.2))
        branch(f"branch{i}", [start, mid, tip], [0.08, 0.05, 0.02])
        tips.append(tip)
    tips.append((lean, 0.1, 3.0))
    # Canopy: thousands of small petal cards scattered in lumpy clusters around the branch tips,
    # over a few dark inner masses that fill the gaps. Reads as blossom, not as balls.
    inner = material("blossom_inner", P["blossom_dark"], 0.8, P["blossom"], 9.0, bump=0.8)
    cards = {id(m): (m, bmesh.new()) for m in petals}
    for t in tips:
        for _ in range(3 if t[2] < 2.9 else 0):
            off = (rnd.gauss(0, 0.2), rnd.gauss(0, 0.2), rnd.gauss(-0.05, 0.1))
            sphere("mass", rnd.uniform(0.22, 0.32), (t[0] + off[0], t[1] + off[1], t[2] + off[2] - 0.08), inner, subdiv=2, scale=(1, 1, 0.7))
        for _ in range(1400):
            # Points in a squashed ellipsoid, denser towards the centre.
            r = rnd.random() ** 0.45
            a, e = rnd.uniform(0, math.tau), rnd.uniform(-1, 1)
            c = (t[0] + math.cos(a) * math.sqrt(1 - e * e) * r * 0.75, t[1] + math.sin(a) * math.sqrt(1 - e * e) * r * 0.75, t[2] + e * r * 0.45)
            m, bm = cards[id(rnd.choice(petals))]
            sz = rnd.uniform(0.025, 0.05)
            n = Vector((rnd.uniform(-1, 1), rnd.uniform(-1, 1), rnd.uniform(-0.3, 1))).normalized()
            u = n.orthogonal().normalized() * sz
            w = n.cross(u).normalized() * sz
            base = Vector(c)
            vs = [bm.verts.new(base + u * dx + w * dy) for dx, dy in ((-1, -1), (1, -1), (1, 1), (-1, 1))]
            bm.faces.new(vs)
    for m, bm in cards.values():
        mesh_obj("petals", bm, m)
    # Roots and fallen petals at the foot.
    for i in range(4):
        a = i / 4 * math.tau + rnd.uniform(0, 1)
        branch(f"root{i}", [(0, 0, 0.3), (math.cos(a) * 0.3, math.sin(a) * 0.3, 0.05), (math.cos(a) * 0.55, math.sin(a) * 0.55, -0.05)], [0.12, 0.07, 0.03])


def build_shrine(_v=0):
    """A small ancestor shrine on a stone plinth; its open front faces +X (game east, towards the plaza)."""
    st = stone_material()
    wood = material("wood_dark", P["wood_dark"], 0.65, P["wood"], 10.0, bump=0.2)
    red = material("vermilion", P["vermilion"], 0.35, P["vermilion_dark"], 3.0, coat=0.3, bump=0.05)
    plaster = material("plaster", P["plaster"], 0.9, srgb("#b9b0a0"), 4.0, bump=0.1)
    # Footprint 4×4 centred on the origin: the building covers x ∈ [-2, 1], steps on x ∈ [1, 2].
    box("plinth", (3.0, 4.0, 0.45), (-0.5, 0, 0.225), st, bevel=0.03)
    for i, x in enumerate((1.05, 1.35, 1.65)):
        box(f"step{i}", (0.3, 1.6, 0.45 - i * 0.15), (x, 0, (0.45 - i * 0.15) / 2), st)
    for x in (-1.75, -0.5, 0.75):
        for y in (-1.75, 1.75):
            cyl(f"post{x}{y}", 0.1, 0.09, 2.0, (x, y, 0.45), red, segs=12)
    for y in (-1.75, 1.75):
        box(f"wall_side{y}", (2.5, 0.08, 1.6), (-0.5, y, 1.35), plaster)
        box(f"beam_side{y}", (2.7, 0.16, 0.14), (-0.5, y, 2.4), wood)
    box("wall_back", (0.08, 3.5, 1.6), (-1.75, 0, 1.35), plaster)
    box("beam_front", (0.16, 3.7, 0.18), (0.75, 0, 2.4), wood)
    # Inside: an altar with spirit tablets and a candle glow.
    black = material("lacquer", P["lacquer"], 0.3, coat=0.5)
    box("altar", (0.5, 1.2, 0.5), (-1.3, 0, 0.7), black)
    gold = material("gold", P["gold"], 0.35, metallic=0.8)
    for i, y in enumerate((-0.35, 0, 0.35)):
        box(f"tablet{i}", (0.06, 0.18, 0.42 if i == 1 else 0.32), (-1.3, y, 1.15), gold if i == 1 else black)
    candle = material("candle", srgb("#ffd9a0"), 0.5, emission=srgb("#ffab50"), emission_strength=12)
    for y in (-0.5, 0.5):
        sphere(f"candle{y}", 0.04, (-1.05, y, 1.0), candle)
    roof = tiled_roof_material()
    curved_roof("roof", 2.35, 2.45, 1.25, (-0.5, 0, 2.45), roof, upturn=0.35, thickness=0.09, ridge=0.6)
    box("ridge", (1.4, 0.14, 0.14), (-0.5, 0, 3.72), black)
    for x in (-1.2, 0.2):
        sphere(f"ridge_end{x}", 0.12, (x, 0, 3.78), black, scale=(1, 1, 1.3))


def build_wall(kind):
    """A castle wall segment: stone footing, white plaster, timber band, tiled cap."""
    st = mossy_stone_material()
    plaster = material("plaster", P["plaster"], 0.9, srgb("#b9b0a0"), 3.0, bump=0.15)
    wood = material("wood_dark", P["wood_dark"], 0.65, P["wood"], 10.0)
    roof = tiled_roof_material()
    if kind == "wall_post":
        box("pillar_base", (0.7, 0.7, 0.7), (0, 0, 0.35), st)
        box("pillar", (0.6, 0.6, 1.5), (0, 0, 1.45), plaster)
        curved_roof("cap", 0.5, 0.5, 0.35, (0, 0, 2.2), roof, upturn=0.12, thickness=0.06)
        return
    along_x = kind == "wall_x"
    L, T = 1.02, 0.5
    sx, sy = (L, T) if along_x else (T, L)
    box("footing", (sx, sy, 0.7), (0, 0, 0.35), st, bevel=0.02)
    box("plaster", (sx * 0.98 if along_x else T * 0.86, sy * 0.98 if not along_x else T * 0.86, 1.3), (0, 0, 1.35), plaster)
    box("band", (sx if along_x else T * 0.9, sy if not along_x else T * 0.9, 0.1), (0, 0, 1.9), wood)
    curved_roof("cap", 0.62 if along_x else 0.4, 0.4 if along_x else 0.62, 0.28, (0, 0, 2.0), roof, upturn=0.0, thickness=0.06, ridge=0.5)


def build_rock(v=0):
    rocky("rock", [0.42, 0.34, 0.48][v], (0, 0, 0.12), mossy_stone_material(), seed=v + 3, squash=[0.75, 1.0, 0.6][v])
    if v == 1:
        rocky("rock2", 0.18, (0.32, -0.2, 0.05), mossy_stone_material(), seed=9)


def build_bamboo(v=0):
    rnd = random.Random(200 + v)
    stalk = material("bamboo", P["bamboo"], 0.45, P["bamboo_dark"], 2.0, coat=0.2)
    node = material("bamboo_node", P["bamboo_dark"], 0.5)
    leaf = material("bamboo_leaf", srgb("#4f6a2c"), 0.6, srgb("#2f4419"), 3.0, sss=0.2)
    for i in range(7):
        x, y = rnd.uniform(-0.35, 0.35), rnd.uniform(-0.35, 0.35)
        h = rnd.uniform(2.6, 3.8)
        tilt = (rnd.uniform(-0.08, 0.08), rnd.uniform(-0.08, 0.08), 0)
        s = cyl(f"stalk{i}", 0.045, 0.035, h, (x, y, 0), stalk, rot=tilt, segs=10)
        for k in range(1, int(h / 0.45)):
            cyl(f"node{i}{k}", 0.05, 0.05, 0.03, (0, 0, k * 0.45), node, parent=s, segs=10)
        for k in range(10):
            z = rnd.uniform(h * 0.55, h)
            a = rnd.uniform(0, math.tau)
            l = box(f"leaf{i}{k}", (0.32, 0.06, 0.01), (math.cos(a) * 0.18, math.sin(a) * 0.18, z), leaf, parent=s)
            l.rotation_euler = (rnd.uniform(-0.4, 0.4), rnd.uniform(0.2, 0.7), a)


def build_banner(crest_path):
    from materials import image_material

    black = material("lacquer", P["lacquer"], 0.3, coat=0.5)
    cyl("pole", 0.04, 0.035, 3.0, (0, 0, 0), black, segs=10)
    cyl("foot", 0.16, 0.12, 0.12, (0, 0, 0), stone_material(), segs=8)
    box("crossbar", (0.05, 0.75, 0.05), (0, -0.33, 2.85), black)
    sphere("finial", 0.06, (0, 0, 3.02), material("gold", P["gold"], 0.35, metallic=0.8))
    # Cloth: a subdivided plane hanging from the crossbar, gently waved.
    bm = bmesh.new()
    bmesh.ops.create_grid(bm, x_segments=10, y_segments=24, size=0.5)
    for v in bm.verts:
        u, w = v.co.x + 0.5, v.co.y + 0.5  # 0..1 across, 0..1 down
        v.co = Vector((0.04 * math.sin(w * 7 + u * 2) * w, -0.05 - u * 0.62, -w * 2.0))
    cloth = mesh_obj("cloth", bm, image_material("crest", crest_path, 0.8), smooth=True)
    cloth.location = (0, 0, 2.82)
    me = cloth.data
    uv = me.uv_layers.new()
    for poly in me.polygons:
        for li in poly.loop_indices:
            co = me.vertices[me.loops[li].vertex_index].co
            uv.data[li].uv = ((-co.y - 0.05) / 0.62, 1 + co.z / 2.0)
    modifier(cloth, "SOLIDIFY", thickness=0.01)


# ----------------------------------------------------------------------------- characters

CHAR_PALETTES = {
    # Two convicts in prison rags: one in undyed ash-grey with a vermilion sash, one in soot-black with old gold.
    "a": {"cloth": "#8a837a", "cloth2": "#5f5850", "sash": "#a82418", "hair": "#141012", "skin": "#d8b49a"},
    "b": {"cloth": "#2c2a2e", "cloth2": "#18171a", "sash": "#9a7a34", "hair": "#d8d4cc", "skin": "#c9a48c"},
    # The Greyed: ash skin, rotten rags.
    "greyed": {"cloth": "#4a4440", "cloth2": "#2a2522", "sash": "#3a2420", "hair": "#6f6f6a", "skin": "#8a8e88"},
}


def build_humanoid(pal_id, blades=True):
    """
    An elf built from rigid parts parented to pivot empties, so poses are just rotations.
    Faces -Y. Returns the pivots by name.
    """
    pal = CHAR_PALETTES[pal_id]
    cloth = material(f"cloth_{pal_id}", srgb(pal["cloth"]), 0.9, srgb(pal["cloth2"]), 9.0, bump=0.25)
    cloth_dark = material(f"cloth2_{pal_id}", srgb(pal["cloth2"]), 0.9, srgb(pal["cloth"]), 14.0, bump=0.2)
    sash = material(f"sash_{pal_id}", srgb(pal["sash"]), 0.6, coat=0.1)
    skin = material(f"skin_{pal_id}", srgb(pal["skin"]), 0.55, sss=0.25)
    hair = material(f"hair_{pal_id}", srgb(pal["hair"]), 0.4, coat=0.2)
    wrap = material("wrap", srgb("#3a302a"), 0.9)

    piv = {}
    piv["facing"] = empty("facing")
    piv["root"] = empty("root", (0, 0, 0.5), piv["facing"])
    piv["pelvis"] = empty("pelvis", (0, 0, 0.45), piv["root"])
    pelvis = piv["pelvis"]

    # Legs: wide trousers over the thighs, wraps on the shins, sandal-like feet.
    for side, sx in (("L", -1), ("R", 1)):
        hip = empty(f"hip{side}", (0.1 * sx, 0, -0.02), pelvis)
        cyl(f"thigh{side}", 0.11, 0.1, 0.46, (0, 0, -0.46), cloth, hip, segs=12)
        knee = empty(f"knee{side}", (0, 0, -0.44), hip)
        cyl(f"shin{side}", 0.075, 0.1, 0.42, (0, 0, -0.42), cloth_dark, knee, segs=12)
        cyl(f"wrap{side}", 0.065, 0.075, 0.22, (0, 0, -0.42), wrap, knee, segs=10)
        box(f"foot{side}", (0.09, 0.2, 0.06), (0, -0.05, -0.45), wrap, knee, bevel=0.02)
        piv[f"hip{side}"] = hip
        piv[f"knee{side}"] = knee

    torso = empty("torso", (0, 0, 0), pelvis)
    piv["torso"] = torso
    cyl("waist", 0.15, 0.16, 0.12, (0, 0, -0.06), sash, torso, segs=16)
    jacket = cyl("chest", 0.16, 0.19, 0.42, (0, 0, 0.05), cloth, torso, segs=16)
    jacket.scale = (1.1, 0.8, 1)
    cyl("collar", 0.12, 0.08, 0.08, (0, -0.02, 0.45), cloth_dark, torso, segs=12)
    # Tattered skirt flaps hide the hip joint when legs swing.
    for y, name in ((-0.11, "front"), (0.11, "back")):
        flap = box(f"flap_{name}", (0.3, 0.03, 0.34), (0, y, -0.2), cloth_dark, torso)
        flap.rotation_euler = (0.12 if y < 0 else -0.12, 0, 0)

    neck = empty("neck", (0, 0, 0.5), torso)
    piv["neck"] = neck
    cyl("neck_m", 0.05, 0.045, 0.08, (0, 0, -0.02), skin, neck, segs=10)
    sphere("head", 0.105, (0, 0, 0.12), skin, neck, scale=(0.9, 1.0, 1.15))
    # Long elven ears, swept back.
    for sx in (-1, 1):
        ear = cyl(f"ear{sx}", 0.03, 0.002, 0.16, (0.085 * sx, 0.01, 0.12), skin, neck, segs=6)
        ear.rotation_euler = (math.radians(-55), math.radians(70 * sx), 0)
        ear.scale = (0.5, 1, 1)
    # Hair: a cap and a long tail down the back.
    # The cap sits back on the skull so the face stays visible; a fringe frames the forehead.
    sphere("hair_cap", 0.108, (0, 0.03, 0.16), hair, neck, scale=(0.96, 0.92, 1.02))
    fringe = box("fringe", (0.17, 0.03, 0.05), (0, -0.075, 0.215), hair, neck, bevel=0.012)
    fringe.rotation_euler = (math.radians(-25), 0, 0)
    tail = cyl("hair_tail", 0.04, 0.02, 0.38, (0, 0.11, -0.2), hair, neck, segs=8)
    tail.rotation_euler = (math.radians(-12), 0, 0)
    eyes = material("eyes", srgb("#1a0c0a"), 0.3)
    for sx in (-1, 1):
        sphere(f"eye{sx}", 0.012, (0.035 * sx, -0.092, 0.135), eyes, neck)

    for side, sx in (("L", -1), ("R", 1)):
        sh = empty(f"shoulder{side}", (0.2 * sx, 0, 0.4), torso)
        cyl(f"sleeve{side}", 0.065, 0.085, 0.3, (0, 0, -0.3), cloth, sh, segs=10)
        el = empty(f"elbow{side}", (0, 0, -0.28), sh)
        cyl(f"forearm{side}", 0.042, 0.05, 0.25, (0, 0, -0.25), wrap, el, segs=8)
        sphere(f"hand{side}", 0.045, (0, 0, -0.29), skin, el)
        piv[f"shoulder{side}"] = sh
        piv[f"elbow{side}"] = el

    if blades:
        # The Thorn pair at the left hip: a long and a short curved blade in black scabbards.
        black = material("lacquer", P["lacquer"], 0.3, coat=0.5)
        gold = material("gold", P["gold"], 0.35, metallic=0.8)
        for i, (length, dz) in enumerate(((0.8, 0.0), (0.55, 0.05))):
            holder = empty(f"blade{i}", (-0.17, -0.06 + i * 0.05, 0.08 + dz), pelvis)
            # Hanging at the hip, tips angled down and back, close to the leg.
            holder.rotation_euler = (math.radians(160), math.radians(-10), math.radians(5))
            bm = bmesh.new()
            bmesh.ops.create_cube(bm, size=1.0)
            for v in bm.verts:
                z = (v.co.z + 0.5) * length
                v.co = Vector((v.co.x * 0.035, v.co.y * 0.022 + 0.06 * (z / length) ** 2, z))
            mesh_obj(f"scabbard{i}", bm, black, holder)
            cyl(f"guard{i}", 0.04, 0.04, 0.015, (0, 0, -0.015), gold, holder, segs=12)
            cyl(f"hilt{i}", 0.018, 0.018, 0.22 if i == 0 else 0.15, (0, -0.005, -0.23 if i == 0 else -0.16), sash, holder, segs=8)
    return piv


def pose(piv, anim, f, frames):
    """Rigid-body poses. Angles in radians; forward is -Y, so a leg swings forward with a negative X rotation."""
    p = f / frames * math.tau
    rot = lambda name, x=0.0, y=0.0, z=0.0: setattr(piv[name], "rotation_euler", (x, y, z))
    for k in ("root", "pelvis", "torso", "neck", "hipL", "hipR", "kneeL", "kneeR", "shoulderL", "shoulderR", "elbowL", "elbowR"):
        rot(k)
    piv["root"].location = (0, 0, 0.5)
    piv["pelvis"].location = (0, 0, 0.45)

    if anim == "idle":
        breath = math.sin(p)
        piv["root"].location = (0, 0, 0.49 + 0.006 * breath)
        rot("hipL", -0.08, 0.04)
        rot("hipR", 0.06, -0.04)
        rot("kneeL", 0.14)
        rot("kneeR", 0.1)
        rot("torso", -0.03 - 0.015 * breath)
        rot("neck", 0.04 + 0.01 * breath)
        rot("shoulderL", 0.05, 0, -0.1 - 0.02 * breath)
        rot("shoulderR", -0.05 + 0.02 * breath, 0, 0.12)
        rot("elbowL", -0.25)
        rot("elbowR", -0.5)
    elif anim == "run":
        s = math.sin(p)
        c = math.cos(p)
        piv["root"].location = (0, 0, 0.47 + 0.035 * abs(c))
        rot("pelvis", 0, 0, 0.12 * s)
        rot("hipL", -0.75 * s - 0.1)
        rot("hipR", 0.75 * s - 0.1)
        rot("kneeL", 0.2 + 0.95 * max(0.0, -c) + 0.3 * max(0.0, s))
        rot("kneeR", 0.2 + 0.95 * max(0.0, c) + 0.3 * max(0.0, -s))
        rot("torso", -0.22, 0, -0.18 * s)
        rot("neck", 0.16, 0, 0.1 * s)
        rot("shoulderL", 0.65 * s, 0, -0.12)
        rot("shoulderR", -0.65 * s, 0, 0.12)
        rot("elbowL", -0.9 - 0.25 * max(0.0, -s))
        rot("elbowR", -0.9 - 0.25 * max(0.0, s))
    elif anim == "roll":
        # A forward roll: tuck, spin a full turn around the hips' centre, come back up.
        k = f / (frames - 1)
        spin = -math.tau * (0.5 - 0.5 * math.cos(min(1.0, k * 1.15) * math.pi)) if k < 0.95 else -math.tau
        tuck = math.sin(min(1.0, k * 1.1) * math.pi)
        piv["root"].location = (0, 0, 0.5 - 0.12 * tuck)
        piv["pelvis"].location = (0, 0, 0.45 - 0.3 * tuck)
        rot("root", spin)
        rot("hipL", -1.9 * tuck)
        rot("hipR", -1.7 * tuck)
        rot("kneeL", 2.3 * tuck)
        rot("kneeR", 2.2 * tuck)
        rot("torso", -0.9 * tuck)
        rot("neck", 0.5 * tuck)
        rot("shoulderL", -1.2 * tuck, 0, -0.2)
        rot("shoulderR", -1.2 * tuck, 0, 0.2)
        rot("elbowL", -1.4 * tuck)
        rot("elbowR", -1.4 * tuck)
    elif anim == "dead":
        # Sprawled on its back, one arm torn off at the elbow.
        piv["root"].location = (0, 0, 0.16)
        rot("root", math.radians(88), 0, 0)
        rot("pelvis", 0, 0.1, 0)
        rot("hipL", -0.5, 0.3)
        rot("hipR", 0.1, -0.2)
        rot("kneeL", 0.9)
        rot("kneeR", 0.2)
        rot("neck", -0.6, 0.4)
        rot("shoulderL", -1.8, 0, -0.6)
        rot("shoulderR", 0.4, 0, 1.2)
        rot("elbowL", -0.3)
        piv["elbowR"].location = (0.35, -0.25, -0.5)
        rot("elbowR", 1.2, 0.4)
    bpy.context.view_layer.update()
