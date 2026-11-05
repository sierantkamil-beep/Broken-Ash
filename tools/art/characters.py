"""
Renders the playable characters: 8 paths × 2 bodies × every animation × 8 directions.

    python tools/art/characters.py                   # everything (hours; resumable, renders are cached)
    python tools/art/characters.py thorn:male        # one set
    python tools/art/characters.py --pack            # only re-pack atlases from the cache

Output per set: client/public/assets/chars/{path}_{body}.webp + .json (Phaser atlas, frames named
"{anim}/{dir}/{frame}", each with its pivot). Frame counts come from anims.FRAMES.
"""
import math
import os
import sys
import time

sys.path.insert(0, os.path.dirname(__file__))

import anims as A  # noqa: E402
import common as C  # noqa: E402
import mh  # noqa: E402
import outfits as O  # noqa: E402

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", ".."))
OUT = os.path.join(ROOT, "client", "public", "assets", "chars")
CACHE = os.path.join(os.path.dirname(__file__), ".cache", "chars")
PATHS = ["thorn", "bark", "blood", "ash", "storm", "graves", "dusk", "sting"]
BODIES = ["male", "female"]
GREYED = ["shambler", "runner", "bloated", "tapper"]
# Render order: two sets to test with first, then the enemies, then everything else.
ORDER = [("thorn", "male"), ("blood", "female")] + [(g, "greyed") for g in GREYED] + [(p, b) for p in PATHS for b in BODIES if (p, b) not in (("thorn", "male"), ("blood", "female"))]
FRAME = (300, 330, 0.95)
# The Tapper is a third bigger and swings a cleaver: a larger frame.
FRAMES_BY_KIND = {"tapper": (420, 440, 1.25)}
SCREEN_DIRS = [(0, 1), (-1, 1), (-1, 0), (-1, -1), (0, -1), (1, -1), (1, 0), (1, 1)]


def facing_z(dx, dy):
    """Z rotation that turns a character built facing -Y towards a screen direction (see render.py)."""
    wx = (dx / 64 + dy / 32) / 2
    wy = (dy / 32 - dx / 64) / 2
    return math.atan2(-wy, wx) + math.pi / 2


def render_set(path, body):
    w, h, tz = FRAMES_BY_KIND.get(path, FRAME)
    folder = os.path.join(CACHE, f"{path}_{body}")
    os.makedirs(folder, exist_ok=True)
    todo = [(anim, d, f) for anim, n in A.FRAMES.items() for d in range(8) for f in range(n)]
    missing = [t for t in todo if not os.path.exists(os.path.join(folder, f"{t[0]}_{t[1]}_{t[2]}.png"))]
    if missing:
        C.reset_scene(samples=8)
        import bpy

        # Keep scene data between frames (only the pose changes) and stop sampling clean pixels early.
        bpy.context.scene.render.use_persistent_data = True
        bpy.context.scene.cycles.adaptive_threshold = 0.05
        if body == "greyed":
            spec = O.GREYED_SHAPES[path]
            r = mh.build(spec["sex"], shape=spec["shape"], scale=spec["scale"])
            O.build_greyed(r, path)
        else:
            r = mh.build(body)
            O.build_path(r, path, O.palette(path, body))
        C.setup_camera(w, h, tz)
        t0 = time.time()
        for i, (anim, d, f) in enumerate(missing):
            r["armature"].rotation_euler = (0, 0, facing_z(*SCREEN_DIRS[d]))
            A.pose(r, path, anim, f)
            C.render_to(os.path.join(folder, f"{anim}_{d}_{f}.png"))
            if i % 40 == 0:
                print(f"{path}:{body} {i}/{len(missing)} ({(time.time() - t0) / (i + 1):.1f}s/frame)", flush=True)
    pack(path, body)


def pack(path, body):
    w, h, tz = FRAMES_BY_KIND.get(path, FRAME)
    folder = os.path.join(CACHE, f"{path}_{body}")
    frames = []
    for anim, n in A.FRAMES.items():
        for d in range(8):
            for f in range(n):
                im, pivot = C.trim(C.load_downsampled(os.path.join(folder, f"{anim}_{d}_{f}.png")), (w / 2, h / 2 + tz * C.Z_PX))
                frames.append((f"{anim}/{d}/{f}", im, pivot))
    os.makedirs(OUT, exist_ok=True)
    png = os.path.join(OUT, f"{path}_{body}.png")
    size = C.pack_atlas(frames, png, os.path.join(OUT, f"{path}_{body}.json"))
    # WebP keeps the atlas small enough to ship sixteen of them.
    from PIL import Image
    import json

    Image.open(png).save(png.replace(".png", ".webp"), "WEBP", quality=90, method=6)
    os.remove(png)
    meta_path = os.path.join(OUT, f"{path}_{body}.json")
    meta = json.load(open(meta_path))
    meta["meta"]["image"] = f"{path}_{body}.webp"
    json.dump(meta, open(meta_path, "w"), separators=(",", ":"))
    print(f"packed {path}_{body} {size}", flush=True)


if __name__ == "__main__":
    args = [a for a in sys.argv[1:] if not a.startswith("--")]
    sets = [tuple(a.split(":")) for a in args] or ORDER
    for p, b in sets:
        if "--pack" in sys.argv:
            pack(p, b)
        else:
            render_set(p, b)
