"""
Renders every sprite with Blender (bpy) and packs them into atlases for the client.

    python tools/art/render.py            # everything
    python tools/art/render.py props      # only props
    python tools/art/render.py chars      # only characters

Needs the `bpy` module (pip install bpy — Blender as a Python module) plus numpy and Pillow.
Output: client/public/assets/sprites/{props,chars}.{png,json}. Renders are cached in
tools/art/.cache; delete it (or pass --force) after changing a model.
"""
import math
import os
import sys

sys.path.insert(0, os.path.dirname(__file__))

from PIL import Image  # noqa: E402

import common as C  # noqa: E402
import models as M  # noqa: E402
import decals  # noqa: E402

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", ".."))
OUT = os.path.join(ROOT, "client", "public", "assets", "sprites")
CACHE = os.path.join(os.path.dirname(__file__), ".cache")
FORCE = "--force" in sys.argv

# Frame size (px at scale 1), camera target height, builder.
PROPS = {
    "gate_vermilion": (360, 400, 1.7, lambda v: M.build_gate(v), 1),
    "stone_lantern": (160, 220, 0.7, lambda v: M.build_stone_lantern(v), 1),
    "paper_lantern": (220, 320, 1.2, lambda v: M.build_paper_lantern(v), 1),
    "blossom_tree": (560, 620, 2.4, lambda v: M.build_blossom_tree(v), 3),
    "shrine": (680, 600, 1.7, lambda v: M.build_shrine(v), 1),
    "wall_x": (220, 280, 1.1, lambda v: M.build_wall("wall_x"), 1),
    "wall_y": (220, 280, 1.1, lambda v: M.build_wall("wall_y"), 1),
    "wall_post": (220, 300, 1.2, lambda v: M.build_wall("wall_post"), 1),
    "rock": (180, 150, 0.2, lambda v: M.build_rock(v), 3),
    "bamboo": (240, 420, 1.8, lambda v: M.build_bamboo(v), 2),
    "banner": (200, 360, 1.6, lambda v: M.build_banner(decals.crest_path(CACHE)), 1),
}

# Footprints in cells (Blender X × Y), for the shadow area. Must match shared/src/data/props.ts.
FOOTPRINTS = {"gate_vermilion": (3, 1), "blossom_tree": (3, 3), "shrine": (4, 4), "bamboo": (1.2, 1.2)}

# Sprite directions in the order of shared/src/iso.ts DIRECTIONS (S, SW, W, NW, N, NE, E, SE), as screen vectors.
SCREEN_DIRS = [(0, 1), (-1, 1), (-1, 0), (-1, -1), (0, -1), (1, -1), (1, 0), (1, 1)]
ANIMS = {"idle": 6, "run": 8, "roll": 8}
CHARS = ["a", "b"]
CHAR_FRAME = (200, 230, 0.85)


def facing_z(dx, dy):
    """Z rotation that turns the model (built facing -Y) towards a screen direction."""
    wx = (dx / 64 + dy / 32) / 2
    wy = (dy / 32 - dx / 64) / 2
    bx, by = wx, -wy  # game → Blender
    return math.atan2(by, bx) + math.pi / 2


def render_frame(key, w, h, tz, build, footprint=(1, 1)):
    """Renders a prop (cached) with a soft contact shadow; returns the trimmed sprite and its pivot."""
    os.makedirs(CACHE, exist_ok=True)
    path = os.path.join(CACHE, f"{key}.png")
    path_s = os.path.join(CACHE, f"{key}_shadow.png")
    if FORCE or not os.path.exists(path) or not os.path.exists(path_s):
        C.reset_scene(footprint=footprint)
        build()
        C.setup_camera(w, h, tz)
        C.render_with_shadow(path, path_s)
    pivot = (w / 2, h / 2 + tz * C.Z_PX)
    im = C.composite_shadow(C.load_downsampled(path), C.load_downsampled(path_s), pivot, footprint)
    return C.trim(im, pivot)


def props():
    frames = []
    for kind, (w, h, tz, build, variants) in PROPS.items():
        for v in range(variants):
            im, pivot = render_frame(f"prop_{kind}_{v}", w, h, tz, lambda: build(v), FOOTPRINTS.get(kind, (1, 1)))
            frames.append((f"{kind}_{v}", im, pivot))
            print("prop", kind, v, im.size, flush=True)
    # The Greyed dead: the character model posed on the ground, plus painted blood.
    for v in range(2):
        def build_corpse(v=v):
            piv = M.build_humanoid("greyed", blades=False)
            piv["facing"].rotation_euler = (0, 0, 0.9 + v * 2.2)
            M.pose(piv, "dead", 0, 1)
            decals.blood_plane(v)

        im, pivot = render_frame(f"prop_corpse_{v}", 320, 220, 0.15, build_corpse, (2, 1.4))
        frames.append((f"corpse_greyed_{v}", im, pivot))
    for v in range(4):
        im, pivot = decals.blood_pool(v)
        frames.append((f"blood_pool_{v}", im, pivot))
    os.makedirs(OUT, exist_ok=True)
    print("props atlas", C.pack_atlas(frames, os.path.join(OUT, "props.png"), os.path.join(OUT, "props.json")))


def chars():
    w, h, tz = CHAR_FRAME
    frames = []
    for pal in CHARS:
        built = {"piv": None}

        def ensure():
            # Building the model once per palette; every frame re-poses the same objects.
            if built["piv"] is None:
                # Characters get their shadow in the engine (a soft blob), which follows them in every pose.
                C.reset_scene(samples=16)
                built["piv"] = M.build_humanoid(pal)
                C.setup_camera(w, h, tz)

        for anim, n in ANIMS.items():
            for d, (dx, dy) in enumerate(SCREEN_DIRS):
                for f in range(n):
                    key = f"char_{pal}_{anim}_{d}_{f}"
                    path = os.path.join(CACHE, f"{key}.png")
                    if FORCE or not os.path.exists(path):
                        ensure()
                        piv = built["piv"]
                        piv["facing"].rotation_euler = (0, 0, facing_z(dx, dy))
                        M.pose(piv, anim, f, n)
                        os.makedirs(CACHE, exist_ok=True)
                        C.render_to(path)
                    im, pivot = C.trim(C.load_downsampled(path), (w / 2, h / 2 + tz * C.Z_PX))
                    frames.append((f"ashbound_{pal}/{anim}/{d}/{f}", im, pivot))
            print("char", pal, anim, flush=True)
    os.makedirs(OUT, exist_ok=True)
    print("chars atlas", C.pack_atlas(frames, os.path.join(OUT, "chars.png"), os.path.join(OUT, "chars.json")))


if __name__ == "__main__":
    which = [a for a in sys.argv[1:] if not a.startswith("--")] or ["props", "chars"]
    if "props" in which:
        props()
    if "chars" in which:
        chars()
