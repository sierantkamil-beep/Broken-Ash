"""
Clips we draw ourselves from a character's rotations instead of paying PixelLab for them:
idle (a one-pixel breath), hit (a flinch), death (a fall) and the dodge roll. Pixels are only moved, never invented,
so they match the generated art exactly.

  python tools/pixellab/derive.py body_male body_female
reads  tools/pixellab/src/<key>/_rotations/<direction>.png
writes tools/pixellab/src/<key>/{idle,hit,death,roll}/<direction>/<n>.png
"""
import json
import math
import os
import sys

from PIL import Image

HERE = os.path.dirname(os.path.abspath(__file__))
DIRS = ["south", "south-west", "west", "north-west", "north"]
# Which way the figure leans back when hit, per facing (screen x): away from where it looks.
BACK = {"south": 0, "south-west": 1, "west": 1, "north-west": 1, "north": 0}


def bbox(im):
    return im.getchannel("A").getbbox()


def split_shift(im, waist, dx, dy):
    """Moves everything above the waist row by (dx, dy), leaving the legs planted."""
    out = Image.new("RGBA", im.size)
    out.alpha_composite(im.crop((0, waist, im.width, im.height)), (0, waist))
    top = im.crop((0, 0, im.width, waist))
    out.alpha_composite(top, (dx, dy)) if dx >= 0 and dy >= 0 else out.paste(top, (dx, dy), top)
    return out


def save(frames, key, anim, d):
    out = os.path.join(HERE, "src", key, anim, d)
    os.makedirs(out, exist_ok=True)
    for i, f in enumerate(frames):
        f.save(os.path.join(out, f"{i}.png"))


def apply(t, x, y):
    """Where a point of the standing pose ends up in a derived frame (the frame's recorded transform).
    Returns (x, y, rotation): rotation in radians, clockwise on screen, for gear that turns with it."""
    if t.get("waist") is not None and y < t["waist"]:
        x, y = x + t["upper"][0], y + t["upper"][1]
    x, y = x + t.get("offset", [0, 0])[0], y + t.get("offset", [0, 0])[1]
    if t.get("squash"):
        sy, ty = t["squash"]
        y = y * sy + ty
    rot = 0.0
    if t.get("rotate"):
        deg, cx, cy = t["rotate"]
        # PIL turns counter-clockwise for a positive angle (on screen, y down).
        a = math.radians(deg)
        dx, dy = x - cx, y - cy
        x, y = cx + dx * math.cos(a) + dy * math.sin(a), cy - dx * math.sin(a) + dy * math.cos(a)
        rot = -a
    if t.get("sink"):
        y += t["sink"]
    return x, y, rot


def derive(key):
    meta = {}
    for d in DIRS:
        rot = Image.open(os.path.join(HERE, "src", key, "_rotations", f"{d}.png")).convert("RGBA")
        x0, y0, x1, y1 = bbox(rot)
        # Waist about 55% down the figure; the breath moves head, shoulders and arms one pixel.
        waist = y0 + int((y1 - y0) * 0.55)
        breath = split_shift(rot, waist, 0, 1)
        save([rot, breath, breath, rot], key, "idle", d)
        still = {}
        bob = {"waist": waist, "upper": [0, 1]}
        meta.setdefault("idle", {})[d] = [still, bob, bob, still]

        # Flinch: the upper body snaps back a pixel or two, then recovers a little.
        back = 1 if BACK[d] else 0
        h1 = split_shift(rot, waist, back, 0)
        h2 = split_shift(rot, waist, back * 2, 0)
        save([h1, h2, h1], key, "hit", d)
        meta.setdefault("hit", {})[d] = [{"waist": waist, "upper": [back, 0]}, {"waist": waist, "upper": [back * 2, 0]}, {"waist": waist, "upper": [back, 0]}]

        # Fall: tip over around the feet, then lie flat a little lower (on a bigger canvas so
        # the lying body fits).
        size = max(rot.size) * 2
        feet = ((x0 + x1) / 2, y1)
        base = Image.new("RGBA", (size, size))
        ox, oy = int(size / 2 - feet[0]), int(size * 0.75 - feet[1])
        base.alpha_composite(rot, (ox, oy))
        centre = (size / 2, size * 0.75)
        side = -1 if BACK[d] or d == "south" else 1
        frames = []
        tf = []
        for angle, sink in [(0, 0), (18, 0), (42, 1), (68, 2), (86, 3), (90, 3)]:
            tf.append({"offset": [ox, oy], "rotate": [angle * side, centre[0], centre[1]], "sink": sink})
            f = base.rotate(angle * side, resample=Image.NEAREST, center=centre)
            if sink:
                g = Image.new("RGBA", f.size)
                g.alpha_composite(f, (0, sink))
                f = g
            frames.append(f)
        save(frames, key, "death", d)
        meta.setdefault("death", {})[d] = tf

        # Dodge roll: tuck (squash) and tumble one full turn around the body's middle, on the same
        # big canvas with the feet where the standing pose has them.
        mid = (centre[0], centre[1] - (y1 - y0) / 2)
        roll = []
        rtf = []
        for i in range(6):
            tuck = base.resize((size, int(size * 0.7)), Image.NEAREST)
            t = Image.new("RGBA", base.size)
            t.alpha_composite(tuck, (0, int(size * 0.3 * 0.75)))
            angle = -side * 60 * i
            roll.append(t.rotate(angle, resample=Image.NEAREST, center=mid) if i else base)
            rtf.append({"offset": [ox, oy]} if not i else {"offset": [ox, oy], "squash": [0.7, int(size * 0.3 * 0.75)], "rotate": [angle, mid[0], mid[1]]})
        save(roll, key, "roll", d)
        meta.setdefault("roll", {})[d] = rtf
    # How each derived frame was made from the standing pose: anchors.py moves the standing pose's
    # anchors the same way, so gear follows exactly (instead of being re-detected on a rotated body).
    with open(os.path.join(HERE, "src", key, "derived.json"), "w") as f:
        json.dump(meta, f)
    print(key, "idle/hit/death written")


if __name__ == "__main__":
    for k in sys.argv[1:]:
        derive(k)
