"""
Finds where gear attaches on every body frame: head (centre + top), neck, torso, shoulders, and both
hands with the arm's direction. The client pins weapons, helmets, shoulder plates and capes to these.

The shared bodies are snapped to one palette whose colours are classified by region (pack.classify),
which makes the anatomy readable:
- the hair is the top band of "cloth" colours (the tunic starts below the shoulders);
- the arms are bare: each is a chain of skin (and leather wrist-wrap) pixels from shoulder to fist,
  so a hand is the end of a chain farthest from its shoulder.

Overrides for frames the heuristic gets wrong live in anchor_overrides.json
({"body_male/strike/south/3": {"hand": [x, y]}}), found by looking at the QA sheet:

  python tools/pixellab/anchors.py body_male body_female      # writes src/<key>/anchors.json
  python tools/pixellab/anchors.py --qa out.png body_male:strike:south ...
"""
import json
import math
import os
import sys

from PIL import Image, ImageDraw

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import pack  # noqa: E402

HERE = os.path.dirname(os.path.abspath(__file__))
DIRS = ["south", "south-west", "west", "north-west", "north"]
PALETTE = [pack.hex_rgb(h) for h in json.load(open(os.path.join(HERE, "body_palette.json")))]
CLASS = {c: pack.classify(c) for c in PALETTE}
# Which screen side the character's right hand is on, per facing (they face the viewer in the south
# views, so their right is our left; facing away it is our right).
RIGHT_ON_LEFT = {"south": True, "south-west": True, "west": True, "north-west": False, "north": False}


# Shoulder offsets from the neck, per facing (left, right in screen x): wide face-on, close in profile.
SHOULDER_SPAN = {"south": (-7, 6), "south-west": (-6, 4), "west": (-3, 2), "north-west": (-4, 6), "north": (-6, 7)}


def region_map(im):
    im = pack.snap(im.copy(), PALETTE)
    px = im.load()
    reg = {}
    for y in range(im.height):
        for x in range(im.width):
            p = px[x, y]
            if p[3]:
                reg[(x, y)] = CLASS[p[:3]]
    return reg


def components(points):
    points = set(points)
    out = []
    while points:
        start = points.pop()
        comp = [start]
        stack = [start]
        while stack:
            x, y = stack.pop()
            for dx in (-1, 0, 1):
                for dy in (-1, 0, 1):
                    n = (x + dx, y + dy)
                    if n in points:
                        points.remove(n)
                        comp.append(n)
                        stack.append(n)
        out.append(comp)
    return out


def anchors_for(im, direction):
    reg = region_map(im)
    if not reg:
        return None
    cloth = [p for p, r in reg.items() if r == "cloth"]
    hair_top = min(y for _, y in cloth)
    # Hair: cloth colours in the first rows below its top.
    hair = [(x, y) for x, y in cloth if y <= hair_top + 9]
    hx = sum(x for x, _ in hair) / len(hair)
    head = (hx, hair_top + 6)
    neck = (hx, hair_top + 12)
    band = [(x, y) for x, y in reg if hair_top + 13 <= y <= hair_top + 26 and reg[(x, y)] in ("cloth", "trim", "outline")]
    torso = (sum(x for x, _ in band) / len(band), sum(y for _, y in band) / len(band)) if band else (hx, hair_top + 20)
    # Shoulders sit a fixed span either side of the neck for each view. Measuring the widest row
    # failed in side views, where long hair hanging down the back doubles the width.
    span = SHOULDER_SPAN[direction]
    sy = hair_top + 13
    shoulders = ((hx + span[0], sy), (hx + span[1], sy))

    # Hands. The wrist wraps (leather) split each bare arm's skin in two: the forearm and the fist.
    # So a fist is a small skin blob touching a wrap; the bigger blob on the wrap's other side is the
    # forearm, which gives the arm's direction. The belt and boots are leather too: the belt is a wide
    # flat run at the waist, the boots are at the bottom, so wraps are small and above the knees.
    face_box = (hx - 6, hair_top + 2, hx + 6, hair_top + 12)
    bottom = max(y for _, y in reg)
    skin = [p for p, r in reg.items() if r == "skin" and not (face_box[0] <= p[0] <= face_box[2] and face_box[1] <= p[1] <= face_box[3])]
    skin_comps = components(skin)
    trim = [p for p, r in reg.items() if r == "trim" and p[1] < bottom - 10]
    wraps = []
    for c in components(trim):
        xs = [x for x, _ in c]
        ys = [y for _, y in c]
        w, h = max(xs) - min(xs) + 1, max(ys) - min(ys) + 1
        if len(c) < 3 or (w >= 9 and h <= 4):
            continue  # specks, and the belt
        wraps.append(c)
    owner = {}
    for i, c in enumerate(skin_comps):
        for p in c:
            owner[p] = i
    found = []
    for wr in wraps:
        touching = {}
        for x, y in wr:
            for dx in (-1, 0, 1):
                for dy in (-1, 0, 1):
                    i = owner.get((x + dx, y + dy))
                    if i is not None:
                        touching[i] = touching.get(i, 0) + 1
        if not touching:
            continue
        blobs = sorted(touching, key=lambda i: len(skin_comps[i]))
        fist = skin_comps[blobs[0]]
        wx = sum(x for x, _ in wr) / len(wr)
        wy = sum(y for _, y in wr) / len(wr)
        fx = sum(x for x, _ in fist) / len(fist)
        fy = sum(y for _, y in fist) / len(fist)
        if len(blobs) >= 2 and len(fist) <= 30:
            fore = skin_comps[blobs[-1]]
            ex = sum(x for x, _ in fore) / len(fore)
            ey = sum(y for _, y in fore) / len(fore)
        else:
            # Only one blob: a fist alone (forearm hidden) or a forearm alone (fist hidden).
            ex, ey = wx - (fx - wx), wy - (fy - wy)
            if len(fist) > 30:
                fx, fy = wx + (wx - fx) * 0.4, wy + (wy - fy) * 0.4
        found.append({"hand": (fx, fy), "elbow": (ex, ey), "size": len(wr) + len(fist)})
    found.sort(key=lambda h: -h["size"])
    found = found[:2]
    found.sort(key=lambda h: h["hand"][0])
    right_left = RIGHT_ON_LEFT[direction]
    def guess(side):
        sh = shoulders[0] if side < 0 else shoulders[1]
        return {"hand": (sh[0] + side, torso[1] + 8), "elbow": sh}
    if len(found) == 2:
        right, left = (found[0], found[1]) if right_left else (found[1], found[0])
    elif len(found) == 1:
        right = found[0]
        on_left = right["hand"][0] < torso[0]
        left = guess(1 if on_left else -1)
    else:
        right, left = guess(-1 if right_left else 1), guess(1 if right_left else -1)

    def arm(h):
        ang = math.atan2(h["hand"][1] - h["elbow"][1], h["hand"][0] - h["elbow"][0])
        return [round(h["hand"][0], 1), round(h["hand"][1], 1), round(ang, 3)]

    return {
        "head": [round(head[0], 1), round(head[1], 1)],
        "top": hair_top,
        "neck": [round(neck[0], 1), round(neck[1], 1)],
        "torso": [round(torso[0], 1), round(torso[1], 1)],
        "shoulders": [list(shoulders[0]), list(shoulders[1])],
        "hand": arm(right),
        "off": arm(left),
    }


def candidates(im):
    """Numbered places a hand could be: every non-face skin blob (its centre) and the far end of
    every long one. A person then picks the right numbers per frame (anchor_picks.json)."""
    reg = region_map(im)
    cloth = [p for p, r in reg.items() if r == "cloth"]
    hair_top = min(y for _, y in cloth)
    hair = [(x, y) for x, y in cloth if y <= hair_top + 9]
    hx = sum(x for x, _ in hair) / len(hair)
    face_box = (hx - 6, hair_top + 2, hx + 6, hair_top + 12)
    skin = [p for p, r in reg.items() if r == "skin" and not (face_box[0] <= p[0] <= face_box[2] and face_box[1] <= p[1] <= face_box[3])]
    out = []
    for c in components(skin):
        if len(c) < 2:
            continue
        cx = sum(x for x, _ in c) / len(c)
        cy = sum(y for _, y in c) / len(c)
        out.append((round(cx, 1), round(cy, 1)))
        if len(c) > 14:
            # Long blob (a bare arm): its two ends.
            ends = sorted(c, key=lambda p: (p[0] - cx) ** 2 + (p[1] - cy) ** 2)[-1:]
            far = ends[0]
            other = max(c, key=lambda p: (p[0] - far[0]) ** 2 + (p[1] - far[1]) ** 2)
            for e in (far, other):
                tip = [p for p in c if (p[0] - e[0]) ** 2 + (p[1] - e[1]) ** 2 <= 4]
                out.append((round(sum(x for x, _ in tip) / len(tip), 1), round(sum(y for _, y in tip) / len(tip), 1)))
    # Merge near-duplicates.
    merged = []
    for c in out:
        if all(math.dist(c, m) > 2.5 for m in merged):
            merged.append(c)
    return merged


def pick_sheet(out_png, key, anim, dirs):
    """Frames with numbered hand candidates, large enough to choose by eye."""
    from PIL import ImageFont

    font = ImageFont.load_default(size=26)
    k = 8
    rows = []
    for d in dirs:
        row = []
        for n, im in frames(key, anim, d):
            box = im.getchannel("A").getbbox()
            x0, y0, x1, y1 = max(0, box[0] - 3), max(0, box[1] - 3), min(im.width, box[2] + 3), min(im.height, box[3] + 3)
            crop = Image.new("RGBA", (x1 - x0, y1 - y0), (225, 220, 210, 255))
            crop.alpha_composite(im.crop((x0, y0, x1, y1)))
            big = crop.resize((crop.width * k, crop.height * k), Image.NEAREST)
            dr = ImageDraw.Draw(big)
            for i, c in enumerate(candidates(im)):
                x, y = (c[0] - x0) * k + k / 2, (c[1] - y0) * k + k / 2
                dr.ellipse((x - 6, y - 6, x + 6, y + 6), fill=(255, 0, 0), outline=(0, 0, 0))
                dr.text((x + 8, y - 14), str(i), fill=(0, 0, 255), font=font, stroke_width=3, stroke_fill=(255, 255, 255))
            dr.text((4, 2), f"{d} {n}", fill=(0, 0, 0), font=font, stroke_width=2, stroke_fill=(255, 255, 255))
            row.append(big)
        rows.append(row)
    ch = max(im.height for r in rows for im in r)
    widths = [sum(im.width + 10 for im in r) for r in rows]
    sheet = Image.new("RGBA", (max(widths), ch * len(rows)), (90, 90, 90, 255))
    for j, r in enumerate(rows):
        x = 0
        for im in r:
            sheet.paste(im, (x, j * ch))
            x += im.width + 10
    sheet.save(out_png)


def smooth(track):
    """A hand that jumps away for one frame while its neighbours agree is a misread: average them."""
    for i in range(1, len(track) - 1):
        a, b, c = track[i - 1], track[i], track[i + 1]
        if math.dist(a[:2], c[:2]) < 7 and math.dist(b[:2], ((a[0] + c[0]) / 2, (a[1] + c[1]) / 2)) > 9:
            track[i] = [round((a[0] + c[0]) / 2, 1), round((a[1] + c[1]) / 2, 1), round(math.atan2(math.sin(a[2]) + math.sin(c[2]), math.cos(a[2]) + math.cos(c[2])), 3)]
    return track


def frames(key, anim, d):
    folder = os.path.join(HERE, "src", key, anim, d)
    if not os.path.isdir(folder):
        return []
    names = sorted((f for f in os.listdir(folder) if f.endswith(".png")), key=lambda f: int(f[:-4]))
    return [(int(n[:-4]), Image.open(os.path.join(folder, n)).convert("RGBA")) for n in names]


def resolve(pick, cands, im, shoulder):
    """A pick is a candidate number, a token (top/left/right: that extreme of the figure), or -1.
    The arm's angle is measured from the hand's OWN shoulder: measuring from whichever shoulder was
    nearer flipped the weapon by ~180° whenever the hand crossed the body."""
    if pick == -1 or pick is None:
        return None
    if isinstance(pick, int):
        if pick >= len(cands):
            return None
        x, y = cands[pick]
    else:
        a = im.getchannel("A")
        pts = [(x, y) for y in range(im.height) for x in range(im.width) if a.getpixel((x, y)) > 128]
        if pick == "top":
            m = min(y for _, y in pts)
            sel = [p for p in pts if p[1] <= m + 2]
        elif pick == "left":
            m = min(x for x, _ in pts)
            sel = [p for p in pts if p[0] <= m + 2]
        else:
            m = max(x for x, _ in pts)
            sel = [p for p in pts if p[0] >= m - 2]
        x, y = sum(p[0] for p in sel) / len(sel), sum(p[1] for p in sel) / len(sel)
    return [round(x, 1), round(y, 1), round(math.atan2(y - shoulder[1], x - shoulder[0]), 3)]


def own_shoulders(a, d):
    """(main hand's shoulder, off hand's shoulder): the right hand's is on our left facing us."""
    sl, sr = a["shoulders"]
    return (sl, sr) if RIGHT_ON_LEFT[d] else (sr, sl)


def standing(key, d, picks):
    """The standing pose's anchors (the rotation image) with its picked hands."""
    im = Image.open(os.path.join(HERE, "src", key, "_rotations", f"{d}.png")).convert("RGBA")
    a = anchors_for(im, d)
    rows = picks.get(f"{key}/idle/{d}")
    c = candidates(im)
    sm, so = own_shoulders(a, d)
    a["hand"] = resolve(rows[0][0], c, im, sm) if rows else None
    a["off"] = resolve(rows[0][1], c, im, so) if rows else None
    return a


def moved(a, t, stowed):
    """The standing anchors carried through a derived frame's transform (derive.apply)."""
    import derive

    def pt(p):
        x, y, _ = derive.apply(t, p[0], p[1])
        return [x, y]

    _, _, rot = derive.apply(t, a["head"][0], a["head"][1])
    hx, hy = pt(a["head"])
    tx, ty = pt([a["head"][0], a["top"]])
    out = {
        "head": [hx, hy],
        "top": ty,
        "neck": pt(a["neck"]),
        "torso": pt(a["torso"]),
        "shoulders": [pt(a["shoulders"][0]), pt(a["shoulders"][1])],
        "rot": rot,
    }
    for k in ("hand", "off"):
        h = a.get(k)
        out[k] = None if (stowed or not h) else [*pt(h), h[2] + rot]
    return out


def snap(a):
    """Whole art pixels: gear sits on the body's pixel grid, never half a pixel off."""
    r = lambda v: int(round(v))
    out = {
        "head": [r(a["head"][0]), r(a["head"][1])],
        "top": r(a["top"]),
        "neck": [r(a["neck"][0]), r(a["neck"][1])],
        "torso": [r(a["torso"][0]), r(a["torso"][1])],
        "shoulders": [[r(p[0]), r(p[1])] for p in a["shoulders"]],
        "rot": round(a.get("rot", 0.0), 3),
    }
    for k in ("hand", "off"):
        h = a.get(k)
        out[k] = [r(h[0]), r(h[1]), round(h[2], 3)] if h else None
    return out


def median3(vals, loop):
    """Each value replaced by the median of itself and its neighbours (wrapping round on loops)."""
    n = len(vals)
    out = []
    for i in range(n):
        if loop:
            w = [vals[(i - 1) % n], vals[i], vals[(i + 1) % n]]
        else:
            w = vals[max(0, i - 1) : i + 2]
        out.append(sorted(w)[len(w) // 2])
    return out


def steady_head(clip, d, loop=False):
    """Head, neck and torso follow the body without the detector's wobble (hair swinging moves the
    hair centroid by 2-4 px a frame): a one-frame jump while both neighbours agree is a misread, and
    a 3-frame median takes out the rest. Shoulders then sit at the fixed span from the steadied neck,
    so plates no longer jump with the raw hair centroid."""
    if not clip:
        return
    for k in ("head", "neck", "torso"):
        track = smooth([[*a[k], 0.0] for _, a in clip])
        xs = median3([v[0] for v in track], loop)
        ys = median3([v[1] for v in track], loop)
        for (_, a), x, y in zip(clip, xs, ys):
            a[k] = [x, y]
    span = SHOULDER_SPAN[d]
    for _, a in clip:
        nx, ny = a["neck"]
        a["shoulders"] = [[nx + span[0], ny + 1], [nx + span[1], ny + 1]]


def compute(key):
    """Anchors for every frame.
    - Clips we derived ourselves (idle, hit, death, roll): the standing pose's anchors moved exactly
      the way derive.py moved its pixels, with a rotation so gear turns with the body. Death and
      roll carry the weapon stowed (no hands).
    - PixelLab clips (run, strike, cast): body points from the detector, steadied across the clip;
      hands from the picks on run, strike and cast, so the weapon stays in hand while running."""
    picks = json.load(open(os.path.join(HERE, "anchor_picks.json")))
    over = {}
    opath = os.path.join(HERE, "anchor_overrides.json")
    if os.path.exists(opath):
        over = json.load(open(opath))
    derived = json.load(open(os.path.join(HERE, "src", key, "derived.json")))
    out = {}
    for anim in sorted(os.listdir(os.path.join(HERE, "src", key))):
        if anim.startswith("_") or not os.path.isdir(os.path.join(HERE, "src", key, anim)):
            continue
        for d in DIRS:
            if anim in derived:
                base = standing(key, d, picks)
                for n, t in enumerate(derived[anim][d]):
                    out[f"{anim}/{d}/{n}"] = moved(base, t, stowed=anim in ("death", "roll"))
                continue
            clip = []
            for n, im in frames(key, anim, d):
                a = anchors_for(im, d)
                if a is None:
                    continue
                a["hand"] = a["off"] = None
                a["rot"] = 0.0
                clip.append((n, a, im))
            # Steady the body points first: hands are measured from the steadied shoulders.
            steady_head([(n, a) for n, a, _ in clip], d, loop=anim == "run")
            rows = picks.get(f"{key}/{anim}/{d}")
            # Running carries the weapon at the standing pose's angle: only the hand swings, the
            # blade doesn't whip round with every arm swing.
            carry = standing(key, d, picks) if anim == "run" else None
            for n, a, im in clip:
                if rows:
                    pk = rows[min(n, len(rows) - 1)]
                    cands = candidates(im)
                    sm, so = own_shoulders(a, d)
                    a["hand"] = resolve(pk[0], cands, im, sm)
                    a["off"] = resolve(pk[1], cands, im, so)
                    for k in ("hand", "off"):
                        h = a[k]
                        if not h:
                            continue
                        if carry:
                            if carry.get(k):
                                h[2] = carry[k][2]
                        else:
                            # Strikes and casts: the blade points out from the body through the hand.
                            # Measured from a shoulder it flipped ~180° whenever the fist passed it.
                            h[2] = round(math.atan2(h[1] - a["torso"][1], h[0] - a["torso"][0]), 3)
            clip = [(n, a) for n, a, _ in clip]
            for n, a in clip:
                out[f"{anim}/{d}/{n}"] = a
    for name in list(out):
        for k, v in over.get(f"{key}/{name}", {}).items():
            out[name][k] = v
        out[name] = snap(out[name])
    with open(os.path.join(HERE, "src", key, "anchors.json"), "w") as f:
        json.dump(out, f, separators=(",", ":"))
    print(key, len(out), "frames anchored")
    return out


def qa(out_png, specs):
    k = 5
    rows = []
    for spec in specs:
        key, anim, d = spec.split(":")
        row = []
        done = json.load(open(os.path.join(HERE, "src", key, "anchors.json")))
        for n, im in frames(key, anim, d):
            a = done.get(f"{anim}/{d}/{n}")
            big = Image.new("RGBA", im.size, (225, 220, 210, 255))
            big.alpha_composite(im)
            big = big.resize((im.width * k, im.height * k), Image.NEAREST)
            dr = ImageDraw.Draw(big)
            if a:
                def dot(p, c, r=4):
                    dr.ellipse((p[0] * k - r + k / 2, p[1] * k - r + k / 2, p[0] * k + r + k / 2, p[1] * k + r + k / 2), fill=c)
                dot(a["head"], (40, 120, 255))
                dot(a["neck"], (40, 200, 255), 3)
                dot(a["torso"], (60, 200, 60))
                for s in a["shoulders"]:
                    dot(s, (240, 200, 40), 3)
                for key2, col in (("hand", (255, 0, 0)), ("off", (255, 0, 255))):
                    h = a.get(key2)
                    if not h:
                        continue
                    dot(h, col, 5)
                    ex, ey = h[0] + math.cos(h[2]) * 8, h[1] + math.sin(h[2]) * 8
                    dr.line((h[0] * k + k / 2, h[1] * k + k / 2, ex * k + k / 2, ey * k + k / 2), fill=col, width=3)
            dr.text((4, 4), f"{anim[:2]} {d[:2]} {n}", fill=(0, 0, 0))
            row.append(big)
        rows.append(row)
    cw = max(im.width for r in rows for im in r)
    ch = max(im.height for r in rows for im in r)
    sheet = Image.new("RGBA", (cw * max(len(r) for r in rows), ch * len(rows)), (90, 90, 90, 255))
    for j, r in enumerate(rows):
        for i, im in enumerate(r):
            sheet.paste(im, (i * cw, j * ch))
    sheet.save(out_png)


if __name__ == "__main__":
    if sys.argv[1] == "--pick":
        pick_sheet(sys.argv[2], sys.argv[3], sys.argv[4], sys.argv[5].split(","))
    elif sys.argv[1] == "--qa":
        qa(sys.argv[2], sys.argv[3:])
    else:
        for key in sys.argv[1:]:
            compute(key)
