"""
Gear QA: assembles the paper doll (body + head piece + shoulder plates + weapon + cape) for every frame
of every clip in all 8 directions, with the same placement rules as the client
(client/src/entities/Character.ts placeGear), and writes contact sheets. A helmet that stays put while
the head moves, a weapon off the hand or a plate floating off a shoulder is plain to see.

  python tools/pixellab/doll_qa.py body_male out.png [head] [weapon-part]
"""
import json
import math
import os
import sys

from PIL import Image, ImageDraw

ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
CHARS = os.path.join(ROOT, "client", "public", "assets", "chars")
GEAR = os.path.join(ROOT, "client", "public", "assets", "gear")
ANGLES = 32
TURNS = 16


def load(base):
    data = json.load(open(base + ".json"))
    sheet = Image.open(base + ".webp").convert("RGBA")
    return data, sheet


def frame(data, sheet, name):
    f = data["frames"].get(name)
    if not f:
        return None, None
    r = f["frame"]
    im = sheet.crop((r["x"], r["y"], r["x"] + r["w"], r["y"] + r["h"]))
    return im, (f["pivot"]["x"] * r["w"], f["pivot"]["y"] * r["h"])


def idx(angle, n):
    return round(angle / (2 * math.pi / n)) % n


def place(canvas, im, piv, x, y, flip):
    """Like a Phaser image with a custom origin: flipX mirrors it about the origin's vertical line."""
    if flip:
        im = im.transpose(Image.FLIP_LEFT_RIGHT)
        left = x - (im.width - piv[0])
    else:
        left = x - piv[0]
    canvas.alpha_composite(im, (int(round(left)), int(round(y - piv[1]))))


def doll(body, gear, name, dirn, head, weapon, cape):
    bd, bs = body
    gd, gs = gear
    im, piv = frame(bd, bs, name)
    a = bd["meta"]["anchors"].get(name)
    W = H = 150
    canvas = Image.new("RGBA", (W, H), (200, 196, 186, 255))
    ox, oy = W // 2, int(H * 0.7)
    mirror = dirn >= 5
    view = "side" if dirn in (2, 6) else "back" if 3 <= dirn <= 5 else "front"
    away = view == "back"
    rot = a[17] if a and len(a) > 17 else 0
    turn = idx(-rot if mirror else rot, TURNS)

    def gearpart(nm, x, y, flip):
        g, gp = frame(gd, gs, nm)
        if g is not None:
            place(canvas, g, gp, ox + x, oy + y, flip)

    def weap(part, h, front):
        if not part:
            return
        # Mirrored frames show the source picture's weapon flipped about the grip.
        if h[0] is not None:
            ang = 0.15 if part == "bow" else (math.pi - h[2] if mirror else h[2])
            gearpart(f"w/{part}/{idx(ang, ANGLES)}", h[0], h[1], mirror)
        else:
            stow = -2.25 if part != "bow" else -0.5
            gearpart(f"w/{part}/{idx(stow + (-rot if mirror else rot), ANGLES)}", a[11], a[12] - 3, mirror)

    if not a:
        place(canvas, im, piv, ox, oy, False)
        return canvas
    if cape and not away:
        gearpart(f"c/{view}/1/{turn}", a[9], a[10], mirror)
    stowed = a[0] is None
    if weapon and (away or stowed):
        weap(weapon, a[0:3], False)
    place(canvas, im, piv, ox, oy, False)
    if cape and away:
        gearpart(f"c/{view}/1/{turn}", a[9], a[10], mirror)
    gearpart(f"s/sode/{turn}", a[13], a[14], False)
    gearpart(f"s/sode/{idx(rot if mirror else -rot, TURNS)}", a[15], a[16], True)
    if head:
        gearpart(f"h/{head}/{view}/{turn}", a[6], a[7], mirror)
    if weapon and not away and not stowed:
        weap(weapon, a[0:3], True)
    return canvas


def sheet(key, out, head="kabuto", weapon="katana", cape=False):
    body = load(os.path.join(CHARS, key))
    gear = load(os.path.join(GEAR, "gear"))
    anims = body[0]["meta"]["anims"]
    rows = []
    for anim in ["idle", "run", "strike", "cast", "hit", "roll", "death"]:
        for d in range(8):
            row = []
            for n in range(anims.get(anim, 0)):
                c = doll(body, gear, f"{anim}/{d}/{n}", d, head, weapon, cape)
                ImageDraw.Draw(c).text((3, 2), f"{anim} {d} {n}", fill=(0, 0, 0))
                row.append(c)
            rows.append(row)
    cw, ch = 150, 150
    k = 2
    w = max(len(r) for r in rows) * cw
    out_im = Image.new("RGBA", (w, len(rows) * ch), (60, 60, 60, 255))
    for j, r in enumerate(rows):
        for i, c in enumerate(r):
            out_im.paste(c, (i * cw, j * ch))
    out_im = out_im.resize((out_im.width * k, out_im.height * k), Image.NEAREST)
    out_im.save(out)
    print(out, out_im.size)


if __name__ == "__main__":
    a = sys.argv[1:]
    sheet(a[0], a[1], a[2] if len(a) > 2 else "kabuto", a[3] if len(a) > 3 else "katana", cape=len(a) > 4)
