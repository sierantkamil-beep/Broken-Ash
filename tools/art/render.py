"""
Renders every sprite with Blender (bpy) and packs them into atlases for the client.

    python tools/art/render.py            # props (characters: tools/art/characters.py)

Needs the `bpy` module (pip install bpy — Blender as a Python module) plus numpy and Pillow.
Output: client/public/assets/sprites/props.{png,json}. Renders are cached in
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

# Final frame size (px, top-down view: CELL px per cell), camera target height, builder. Generous:
# frames are trimmed, and a warning is printed if anything touches the edge.
PROPS = {
    "gate_vermilion": (320, 320, 1.7, lambda v: M.build_gate(v), 1),
    "stone_lantern": (150, 190, 0.7, lambda v: M.build_stone_lantern(v), 1),
    "paper_lantern": (190, 260, 1.2, lambda v: M.build_paper_lantern(v), 1),
    "blossom_tree": (460, 480, 2.4, lambda v: M.build_blossom_tree(v), 3),
    "shrine": (460, 480, 1.7, lambda v: M.build_shrine(v), 1),
    "wall_x": (140, 230, 1.1, lambda v: M.build_wall("wall_x"), 1),
    "wall_y": (130, 320, 1.1, lambda v: M.build_wall("wall_y"), 1),
    "wall_post": (130, 240, 1.2, lambda v: M.build_wall("wall_post"), 1),
    "rock": (130, 120, 0.2, lambda v: M.build_rock(v), 3),
    "bamboo": (200, 360, 1.8, lambda v: M.build_bamboo(v), 2),
    "banner": (170, 290, 1.6, lambda v: M.build_banner(decals.crest_path(CACHE)), 1),
    # Act 1: the cells, the mine, the farmstead, the road.
    "bars_x": (130, 230, 1.0, lambda v: M.build_bars("bars_x"), 1),
    "bars_y": (150, 280, 1.0, lambda v: M.build_bars("bars_y"), 1),
    "rockwall": (130, 230, 0.8, lambda v: M.build_rockwall(v), 3),
    "brazier": (150, 160, 0.45, lambda v: M.build_brazier(v), 1),
    "torch_post": (150, 220, 1.0, lambda v: M.build_torch_post(v), 1),
    "support": (150, 220, 1.0, lambda v: M.build_support(v), 1),
    "cart": (200, 160, 0.4, lambda v: M.build_cart(v), 1),
    "barrel": (160, 180, 0.3, lambda v: M.build_barrel(v), 2),
    "crate": (160, 180, 0.3, lambda v: M.build_crate(v), 1),
    "lever": (150, 160, 0.5, lambda v: M.build_lever(v), 1),
    "pump": (220, 240, 0.8, lambda v: M.build_pump(v), 1),
    "tent": (320, 320, 0.8, lambda v: M.build_tent(v), 1),
    "palisade_x": (130, 200, 0.9, lambda v: M.build_palisade("palisade_x"), 1),
    "palisade_y": (150, 250, 0.9, lambda v: M.build_palisade("palisade_y"), 1),
    "house_burnt": (400, 340, 1.0, lambda v: M.build_house_burnt(v), 1),
    "campfire": (130, 120, 0.2, lambda v: M.build_campfire(v), 1),
    "dead_tree": (230, 300, 1.4, lambda v: M.build_dead_tree(v), 2),
    "pine": (220, 300, 1.4, lambda v: M.build_pine(v), 3),
}

# Footprints in cells (Blender X × Y), for the shadow area. Must match shared/src/data/props.ts.
FOOTPRINTS = {"gate_vermilion": (3, 1), "blossom_tree": (3, 3), "shrine": (4, 4), "bamboo": (1.2, 1.2), "cart": (2, 1), "pump": (2, 2), "tent": (3, 3), "house_burnt": (4, 3), "dead_tree": (2, 2), "pine": (2, 2)}



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
    im = C.composite_shadow(C.load_frame(path, h), C.load_frame(path_s, h), pivot, footprint)
    a = im.getchannel("A")
    edge = max(max(a.crop((0, 0, w, 1)).getdata()), max(a.crop((0, h - 1, w, h)).getdata()), max(a.crop((0, 0, 1, h)).getdata()), max(a.crop((w - 1, 0, w, h)).getdata()))
    if edge > 8:
        print(f"WARNING {key}: touches the frame edge, enlarge its frame", flush=True)
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

        im, pivot = render_frame(f"prop_corpse_{v}", 260, 200, 0.15, build_corpse, (2, 1.4))
        frames.append((f"corpse_greyed_{v}", im, pivot))
    for v in range(4):
        im, pivot = decals.blood_pool(v)
        frames.append((f"blood_pool_{v}", im, pivot))
    os.makedirs(OUT, exist_ok=True)
    print("props atlas", C.pack_atlas(frames, os.path.join(OUT, "props.png"), os.path.join(OUT, "props.json")))


if __name__ == "__main__":
    props()
