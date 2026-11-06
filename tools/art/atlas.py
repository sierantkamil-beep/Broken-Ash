"""Atlas packing shared by every art tool; no Blender import, so numpy-only painters can use it."""
import json
import os

from PIL import Image


def pack_atlas(frames, out_png, out_json, max_width=4096):
    """
    Shelf-packs (name, image, pivot_px) frames into one PNG and a Phaser JSON-hash atlas.
    Pivots are stored normalised, which Phaser uses as each frame's origin.
    """
    frames = sorted(frames, key=lambda f: -f[1].height)
    x = y = shelf = 0
    placed = []
    width = 0
    for name, im, pivot in frames:
        if x + im.width + 2 > max_width:
            x = 0
            y += shelf + 2
            shelf = 0
        placed.append((name, im, pivot, x, y))
        x += im.width + 2
        shelf = max(shelf, im.height)
        width = max(width, x)
    height = y + shelf
    sheet = Image.new("RGBA", (width, height), (0, 0, 0, 0))
    out = {"frames": {}, "meta": {"image": os.path.basename(out_png), "format": "RGBA8888", "size": {"w": width, "h": height}, "scale": "1"}}
    for name, im, pivot, px, py in placed:
        sheet.paste(im, (px, py))
        out["frames"][name] = {
            "frame": {"x": px, "y": py, "w": im.width, "h": im.height},
            "rotated": False,
            "trimmed": False,
            "spriteSourceSize": {"x": 0, "y": 0, "w": im.width, "h": im.height},
            "sourceSize": {"w": im.width, "h": im.height},
            "pivot": {"x": round(pivot[0] / im.width, 5), "y": round(pivot[1] / im.height, 5)},
        }
    sheet.save(out_png, optimize=True)
    with open(out_json, "w") as f:
        json.dump(out, f, separators=(",", ":"))
    return width, height
