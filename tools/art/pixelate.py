"""
The map's pixel-art pass: takes the Blender-rendered prop and ground atlases and turns every frame
into pixel art that matches the PixelLab characters (one art pixel = 2×2 screen pixels), keeping
the detail and the baked light:

1. downsample to art resolution with a high-quality filter, then sharpen lightly, so stones, roof
   tiles and blossoms stay legible instead of turning to mush;
2. keep three alpha steps (solid, soft shadow, none) and snap each frame to its own generous palette (no dithering): props 56 colours, ground 40;
3. harden alpha and draw a one-pixel dark outline round prop silhouettes, like the characters';
4. scale back up 2× with nearest neighbour, so frame sizes and pivots are unchanged and the
   client needs no new numbers.

  python tools/art/pixelate.py           # writes client/public/assets/sprites/{props,ground}_px.*
"""
import json
import os

from PIL import Image, ImageFilter

ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
SPR = os.path.join(ROOT, "client", "public", "assets", "sprites")
SCALE = 2


def pixelate(im, colours, outline):
    w, h = im.size
    small = im.resize((max(1, w // SCALE), max(1, h // SCALE)), Image.LANCZOS)
    rgb = small.convert("RGB").filter(ImageFilter.UnsharpMask(radius=1, percent=60, threshold=2))
    # Three alpha steps: solid, the soft contact shadow (kept see-through), nothing.
    alpha = small.getchannel("A").point(lambda a: 255 if a >= 200 else 120 if a >= 40 else 0)
    # Palette from the visible pixels only (transparent black would steal a colour).
    q = rgb.quantize(colors=colours, method=Image.MEDIANCUT, dither=Image.Dither.NONE).convert("RGB")
    out = Image.merge("RGBA", (*q.split(), alpha))
    if outline:
        px = out.load()
        a = alpha.load()
        sw, sh = out.size
        edge = []
        for y in range(sh):
            for x in range(sw):
                if a[x, y] == 255:
                    continue
                if any(0 <= x + dx < sw and 0 <= y + dy < sh and a[x + dx, y + dy] == 255 for dx, dy in ((1, 0), (-1, 0), (0, 1), (0, -1))):
                    edge.append((x, y))
        for x, y in edge:
            # Darkest neighbour, darkened further: an outline that keeps the object's hue.
            ns = [px[x + dx, y + dy] for dx, dy in ((1, 0), (-1, 0), (0, 1), (0, -1)) if 0 <= x + dx < sw and 0 <= y + dy < sh and a[x + dx, y + dy] == 255]
            d = min(ns, key=lambda c: c[0] + c[1] + c[2])
            px[x, y] = (d[0] // 3, d[1] // 3, d[2] // 3, 255)
    big = out.resize((out.width * SCALE, out.height * SCALE), Image.NEAREST)
    if big.size != (w, h):
        canvas = Image.new("RGBA", (w, h), (0, 0, 0, 0))
        canvas.paste(big, (0, 0))
        big = canvas
    return big


def run(name, colours, outline, skip=()):
    data = json.load(open(os.path.join(SPR, f"{name}.json")))
    sheet = Image.open(os.path.join(SPR, f"{name}.png")).convert("RGBA")
    out = Image.new("RGBA", sheet.size, (0, 0, 0, 0))
    for fname, f in data["frames"].items():
        r = f["frame"]
        im = sheet.crop((r["x"], r["y"], r["x"] + r["w"], r["y"] + r["h"]))
        if any(fname.startswith(s) for s in skip):
            out.paste(im, (r["x"], r["y"]))
            continue
        out.paste(pixelate(im, colours, outline), (r["x"], r["y"]))
    out.save(os.path.join(SPR, f"{name}_px.png"), optimize=True)
    data["meta"]["image"] = f"{name}_px.png"
    data["meta"]["pixel"] = True
    with open(os.path.join(SPR, f"{name}_px.json"), "w") as fh:
        json.dump(data, fh, separators=(",", ":"))
    print(name, len(data["frames"]), "frames")


if __name__ == "__main__":
    # Blood pools are gore decals, soft on purpose: they keep their look.
    run("props", 56, True, skip=("blood_pool",))
    run("ground", 40, False)


def run_chars(key, colours=40):
    """A character atlas (the Blender-rendered Greyed) through the same pass, in place."""
    base = os.path.join(ROOT, "client", "public", "assets", "chars", key)
    data = json.load(open(base + ".json"))
    if data["meta"].get("pixelated"):
        print(key, "already pixel art")
        return
    sheet = Image.open(base + ".webp").convert("RGBA")
    out = Image.new("RGBA", sheet.size, (0, 0, 0, 0))
    for f in data["frames"].values():
        r = f["frame"]
        im = sheet.crop((r["x"], r["y"], r["x"] + r["w"], r["y"] + r["h"]))
        out.paste(pixelate(im, colours, True), (r["x"], r["y"]))
    out.save(base + ".webp", "WEBP", lossless=True, method=6)
    data["meta"]["pixelated"] = True
    with open(base + ".json", "w") as fh:
        json.dump(data, fh, separators=(",", ":"))
    print(key, "pixelated")


if __name__ == "__main__":
    # Every Blender-rendered enemy (the Greyed and the Iron March), whatever has been rendered so far.
    chars = os.path.join(ROOT, "client", "public", "assets", "chars")
    for f in sorted(os.listdir(chars)):
        if f.endswith("_greyed.json"):
            run_chars(f[:-5])
