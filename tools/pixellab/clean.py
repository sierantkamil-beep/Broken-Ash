"""
Strips effects PixelLab baked into a clip (the fireball template draws a fire orb in some frames):
the orb's colours, and any blob left floating off the figure, are erased, since spell visuals are the game's own (Vfx.ts)
and differ per path. Originals are kept under _raw/.

  python tools/pixellab/clean.py <key> <anim>
"""
import os
import shutil
import sys

from PIL import Image

HERE = os.path.dirname(os.path.abspath(__file__))


def components(im):
    px = im.load()
    seen = set()
    comps = []
    for y in range(im.height):
        for x in range(im.width):
            if (x, y) in seen or px[x, y][3] < 128:
                continue
            stack, comp = [(x, y)], []
            seen.add((x, y))
            while stack:
                cx, cy = stack.pop()
                comp.append((cx, cy))
                for dx in (-1, 0, 1):
                    for dy in (-1, 0, 1):
                        nx, ny = cx + dx, cy + dy
                        if 0 <= nx < im.width and 0 <= ny < im.height and (nx, ny) not in seen and px[nx, ny][3] >= 128:
                            seen.add((nx, ny))
                            stack.append((nx, ny))
            comps.append(comp)
    return comps


# The fireball template's orb: hot white, yellow and red that the bodies' palette never uses.
ORB = [(250, 246, 240), (248, 235, 49), (245, 37, 11)]


def clean(path):
    im = Image.open(path).convert("RGBA")
    px = im.load()
    erased = 0
    for y in range(im.height):
        for x in range(im.width):
            p = px[x, y]
            r, g, bl = p[:3]
            # The orb's colours, and its yellow and hot-orange rim (the bodies have neither).
            hot = (r > 190 and g > 150 and bl < 120) or (r > 220 and 70 < g < 170 and bl < 70)
            if p[3] >= 128 and (hot or any(sum((a - b) ** 2 for a, b in zip(p[:3], o)) < 700 for o in ORB)):
                px[x, y] = (0, 0, 0, 0)
                erased += 1
    comps = sorted(components(im), key=len, reverse=True)
    for comp in comps[1:]:
        lum = sum(0.299 * px[p][0] + 0.587 * px[p][1] + 0.114 * px[p][2] for p in comp) / len(comp)
        if lum > 110 or len(comp) <= 25:
            for p in comp:
                px[p] = (0, 0, 0, 0)
            erased += len(comp)
    im.save(path)
    return erased


if __name__ == "__main__":
    key, anim = sys.argv[1:3]
    root = os.path.join(HERE, "src", key, anim)
    raw = os.path.join(HERE, "src", key, "_raw", anim)
    if not os.path.isdir(raw):
        shutil.copytree(root, raw)
    for d in sorted(os.listdir(root)):
        for f in sorted(os.listdir(os.path.join(root, d))):
            src = os.path.join(raw, d, f)
            dst = os.path.join(root, d, f)
            shutil.copy(src, dst)
            n = clean(dst)
            if n:
                print(key, anim, d, f, "erased", n)
