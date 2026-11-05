"""
Packs PixelLab output into the game's character atlas format.

Input:  tools/pixellab/src/<key>/<anim>/<direction>/<frame>.png
        (direction = south, south-west, west, north-west, north, north-east, east, south-east;
         the folder layout fetch.py writes from PixelLab's downloads).
Output: client/public/assets/chars/<key>.webp + <key>.json (Phaser JSON-hash atlas, frames named
        "<anim>/<dir index>/<frame>", each with a pivot at the feet) and a refreshed index.json.

The atlas "meta" tells the client this is pixel art (nearest filtering), the scale it's drawn at,
how many frames each animation has and how tall the figure stands, so nothing is hard-coded per set.

Usage: python tools/pixellab/pack.py [key ...]   (no keys = every folder under src/)
"""
import json
import os
import sys

from PIL import Image

ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
SRC = os.path.join(ROOT, "tools", "pixellab", "src")
OUT = os.path.join(ROOT, "client", "public", "assets", "chars")
# shared/src/iso.ts directionIndex: 0 = screen south, then clockwise (SW, W, NW, N, NE, E, SE).
DIRS = ["south", "south-west", "west", "north-west", "north", "north-east", "east", "south-east"]
# One art pixel is two screen pixels: an iso cell (128 × 64 on screen) is 64 × 32 art pixels.
ART_SCALE = 2


def feet(im):
    """Pivot of a standing pose: horizontal centre of the opaque pixels, one row under the lowest one."""
    a = im.getchannel("A")
    box = a.point(lambda v: 255 if v > 32 else 0).getbbox()
    if not box:
        return im.width / 2, im.height
    # The lowest rows are the feet; centre on them rather than on a cape or weapon sticking out.
    x0, y0, x1, y1 = box
    rows = a.crop((x0, max(y0, y1 - 4), x1, y1)).point(lambda v: 255 if v > 32 else 0).getbbox()
    cx = x0 + (rows[0] + rows[2]) / 2 if rows else (x0 + x1) / 2
    return cx, y1


def frames_of(folder):
    names = sorted((f for f in os.listdir(folder) if f.endswith(".png")), key=lambda f: int("".join(c for c in f if c.isdigit()) or 0))
    return [Image.open(os.path.join(folder, f)).convert("RGBA") for f in names]


def pack(key):
    src = os.path.join(SRC, key)
    frames = []  # (name, image, pivot)
    counts = {}
    height = 0
    for anim in sorted(os.listdir(src)):
        adir = os.path.join(src, anim)
        if not os.path.isdir(adir):
            continue
        for i, d in enumerate(DIRS):
            ddir = os.path.join(adir, d)
            if not os.path.isdir(ddir):
                continue
            imgs = frames_of(ddir)
            if not imgs:
                continue
            counts[anim] = max(counts.get(anim, 0), len(imgs))
            # Every frame of a clip shares the first frame's pivot, so the figure doesn't jitter.
            pivot = feet(imgs[0])
            if anim == "idle" and i == 0:
                box = imgs[0].getchannel("A").getbbox()
                height = (box[3] - box[1]) if box else imgs[0].height
            for n, im in enumerate(imgs):
                frames.append((f"{anim}/{i}/{n}", im, pivot))
    if not frames:
        raise SystemExit(f"{key}: no frames under {src}")
    # A missing direction falls back to its mirror, then to south, so every lookup resolves.
    have = {name for name, _, _ in frames}
    extra = []
    for anim, n in counts.items():
        for i in range(8):
            if f"{anim}/{i}/0" in have:
                continue
            mirror = (8 - i) % 8
            for k in range(n):
                src_name = f"{anim}/{mirror}/{k}"
                hit = next((f for f in frames if f[0] == src_name), None)
                if hit:
                    im = hit[1].transpose(Image.FLIP_LEFT_RIGHT)
                    extra.append((f"{anim}/{i}/{k}", im, (im.width - hit[2][0], hit[2][1])))
                else:
                    hit = next((f for f in frames if f[0] == f"{anim}/0/{k}"), None)
                    if hit:
                        extra.append((f"{anim}/{i}/{k}", hit[1], hit[2]))
    frames += extra

    frames.sort(key=lambda f: -f[1].height)
    max_w, x, y, shelf, width = 4096, 0, 0, 0, 0
    placed = []
    for name, im, pivot in frames:
        if x + im.width + 2 > max_w:
            x, y, shelf = 0, y + shelf + 2, 0
        placed.append((name, im, pivot, x, y))
        x += im.width + 2
        shelf = max(shelf, im.height)
        width = max(width, x)
    sheet = Image.new("RGBA", (width, y + shelf), (0, 0, 0, 0))
    meta = {
        "image": f"{key}.webp",
        "format": "RGBA8888",
        "size": {"w": sheet.width, "h": sheet.height},
        "scale": "1",
        "pixel": True,
        "artScale": ART_SCALE,
        "anims": counts,
        "height": height,
    }
    out = {"frames": {}, "meta": meta}
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
    os.makedirs(OUT, exist_ok=True)
    # Lossless: lossy WebP smears pixel art.
    sheet.save(os.path.join(OUT, f"{key}.webp"), "WEBP", lossless=True, method=6)
    with open(os.path.join(OUT, f"{key}.json"), "w") as f:
        json.dump(out, f, separators=(",", ":"))
    print(f"{key}: {len(frames)} frames, {sheet.width}x{sheet.height}, anims {counts}")


def write_index():
    keys = sorted(f[:-5] for f in os.listdir(OUT) if f.endswith(".json") and f != "index.json")
    with open(os.path.join(OUT, "index.json"), "w") as f:
        json.dump(keys, f)


if __name__ == "__main__":
    keys = sys.argv[1:] or sorted(d for d in os.listdir(SRC) if os.path.isdir(os.path.join(SRC, d)))
    for k in keys:
        pack(k)
    write_index()
