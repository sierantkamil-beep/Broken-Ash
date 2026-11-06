"""
Packs PixelLab output into the game's character atlas format.

Input:  tools/pixellab/src/<key>/<anim>/<direction>/<frame>.png
        (direction = south, south-west, west, north-west, north, north-east, east, south-east;
         the folder layout fetch.py writes from PixelLab's downloads).
Output: client/public/assets/chars/<key>.webp + <key>.json (Phaser JSON-hash atlas, frames named
        "<anim>/<dir index>/<frame>", each with a pivot at the feet) and a refreshed index.json.

The atlas "meta" tells the client this is pixel art (nearest filtering), the scale it's drawn at,
how many frames each animation has and how tall the figure stands, so nothing is hard-coded per set.

With --palette <file.json> every frame is snapped to that palette first (template animations aren't
palette-locked) and the atlas meta gets "regions": which palette colours are skin, hair-and-cloth,
leather trim and outline, so the client can recolour gear (client/src/assets/recolor.ts).

Usage: python tools/pixellab/pack.py [--palette tools/pixellab/body_palette.json] [key ...]
       (no keys = every folder under src/)
"""
import json
import math
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


def hex_rgb(h):
    return tuple(int(h[i : i + 2], 16) for i in (1, 3, 5))


def lum(c):
    return 0.299 * c[0] + 0.587 * c[1] + 0.114 * c[2]


def classify(c):
    """Which recolourable region a palette colour belongs to (see the client's recolor.ts)."""
    r, g, b = c
    if lum(c) < 14:
        return "outline"
    if r > 140 and r > g > b and r - b > 45:
        return "skin"
    if r > g >= b - 6 and r - b > 14:
        return "trim"
    if r - b > 30:
        return "skin"
    return "cloth"


def snap(im, palette):
    """Every opaque pixel to its nearest palette colour; alpha is made hard (pixel art has no blur)."""
    px = im.load()
    cache = {}
    for y in range(im.height):
        for x in range(im.width):
            r, g, b, a = px[x, y]
            if a < 128:
                px[x, y] = (0, 0, 0, 0)
                continue
            k = (r, g, b)
            if k not in cache:
                cache[k] = min(palette, key=lambda p: (p[0] - r) ** 2 * 3 + (p[1] - g) ** 2 * 4 + (p[2] - b) ** 2 * 2)
            px[x, y] = (*cache[k], 255)
    return im


PALETTE = None


def frames_of(folder):
    names = sorted((f for f in os.listdir(folder) if f.endswith(".png")), key=lambda f: int("".join(c for c in f if c.isdigit()) or 0))
    ims = [Image.open(os.path.join(folder, f)).convert("RGBA") for f in names]
    return [snap(im, PALETTE) for im in ims] if PALETTE else ims


def rel_anchor(a, pivot, mirror_w=None):
    """A frame's anchors relative to its pivot (feet), as a flat list the client reads:
    [hand x, y, angle, off x, y, angle, head x, y, top y, neck x, y, torso x, y, shoulder L x, y,
    R x, y, rotation]. Anchors are whole art pixels; the pivot sits on a half or whole pixel, so the
    client lands every part on the body's own pixel grid. Hands are null when stowed or hidden.
    A mirrored frame flips x, angles and the rotation: `pivot` is then the MIRRORED frame's pivot, so a
    mirrored anchor is exactly its source anchor reflected about the feet. Gear on a mirrored frame is
    flipped about its own origin too, so body and gear flip together as one picture."""
    if a is None:
        return None

    def pt(p):
        x, y = p[0], p[1]
        if mirror_w is not None:
            x = mirror_w - x
        return [round(x - pivot[0], 2), round(y - pivot[1], 2)]

    def hand(h):
        if not h:
            return [None, None, None]
        x, y = pt(h)
        ang = h[2] if mirror_w is None else math.pi - h[2]
        return [x, y, round(ang, 3)]

    sl, sr = a["shoulders"]
    if mirror_w is not None:
        sl, sr = sr, sl
    rot = a.get("rot", 0.0)
    if mirror_w is not None:
        rot = -rot
    return [*hand(a.get("hand")), *hand(a.get("off")), *pt(a["head"]), round(a["top"] - pivot[1], 2), *pt(a["neck"]), *pt(a["torso"]), *pt(sl), *pt(sr), round(rot, 3)]


def pack(key):
    src = os.path.join(SRC, key)
    apath = os.path.join(src, "anchors.json")
    anchors = json.load(open(apath)) if os.path.exists(apath) else {}
    rel = {}
    frames = []  # (name, image, pivot)
    counts = {}
    height = 0
    for anim in sorted(os.listdir(src)):
        adir = os.path.join(src, anim)
        if anim.startswith("_") or not os.path.isdir(adir):
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
                r = rel_anchor(anchors.get(f"{anim}/{d}/{n}"), pivot)
                if r:
                    rel[f"{anim}/{i}/{n}"] = r
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
                    mpivot = (im.width - hit[2][0], hit[2][1])
                    extra.append((f"{anim}/{i}/{k}", im, mpivot))
                    # Measured from the mirrored frame's own pivot (measuring from the source pivot put
                    # every piece of gear w - 2·pivot pixels off the body in NE, E and SE).
                    r = rel_anchor(anchors.get(f"{anim}/{DIRS[mirror]}/{k}"), mpivot, mirror_w=im.width)
                    if r:
                        rel[f"{anim}/{i}/{k}"] = r
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
    if rel:
        meta["anchors"] = rel
    if PALETTE:
        regions = {}
        for c in PALETTE:
            regions.setdefault(classify(c), []).append("#%02x%02x%02x" % c)
        meta["regions"] = regions
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
    args = sys.argv[1:]
    if args[:1] == ["--palette"]:
        PALETTE = [hex_rgb(h) for h in json.load(open(args[1]))]
        args = args[2:]
    keys = args or sorted(d for d in os.listdir(SRC) if os.path.isdir(os.path.join(SRC, d)))
    for k in keys:
        pack(k)
    write_index()
