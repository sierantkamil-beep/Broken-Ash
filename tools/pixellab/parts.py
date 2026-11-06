"""
Gear drawn pixel by pixel: weapons, head pieces, shoulder plates and capes that the client pins to the
body anchors (tools/pixellab/anchors.py). Each part is a grid of letters (palette below), written
here so every pixel is a decision, not a filter's guess.

Weapons are drawn pointing right with their grip at `grip`; RotSprite (scale2x three times, rotate,
sample back down) turns them into 32 clean angles, so a sword at 35° is still crisp pixel art.
Head pieces, shoulders and capes are drawn per direction (south, south-west, west, north-west, north;
the client mirrors the rest) with their pivot on the head / neck / shoulder anchor.

Digits are dye slots the client fills from the player's look: 1–4 the cloth dye (dark → light),
5–8 the trim dye. They are written as marker colours (#ff00xx) that client/src/assets/gear.ts swaps.

  python tools/pixellab/parts.py        # writes client/public/assets/gear/gear.webp + gear.json
  python tools/pixellab/parts.py --preview out.png
"""
import json
import math
import os
import sys

import numpy as np
from PIL import Image

ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
OUT = os.path.join(ROOT, "client", "public", "assets", "gear")
ANGLES = 32

PAL = {
    "k": "#0d0b0e",  # outline
    "w": "#eef3f4",  # steel glint
    "s": "#bcc6cc",  # steel light
    "m": "#848e96",  # steel mid
    "d": "#4c545e",  # steel dark
    "h": "#241a18",  # handle wrap dark
    "H": "#4a3226",  # handle / wood light
    "g": "#d8b050",  # gold
    "G": "#8a6420",  # gold dark
    "r": "#c0301c",  # vermilion
    "R": "#6a1410",  # dark red
    "p": "#ece4cc",  # paper
    "P": "#b4aa8c",  # paper shade
    "y": "#e2bc6a",  # straw light
    "Y": "#a8823e",  # straw
    "z": "#6a4e24",  # straw shadow
    "l": "#fff0a8",  # lantern glow core
    "L": "#f0b040",  # lantern glow
    "o": "#b06418",  # lantern paper dark
    "b": "#3a2416",  # bow wood dark
    "B": "#6e4628",  # bow wood
    "n": "#d8d0c0",  # bow string / bristle light
    "f": "#a89884",  # fur light
    "F": "#706252",  # fur
    "v": "#3c3228",  # fur dark
    "x": "#2e2a30",  # lacquer black
    "X": "#4a4450",  # lacquer black light
    "e": "#c8d8c8",  # pale (veil, eyes)
    "E": "#8a9a90",  # pale shade
}
# Dye markers: the client replaces these exact colours with the look's ramps.
for i in range(1, 9):
    PAL[str(i)] = "#ff00%02x" % i


def grid(text):
    rows = [r for r in text.strip("\n").split("\n")]
    w = max(len(r) for r in rows)
    im = Image.new("RGBA", (w, len(rows)), (0, 0, 0, 0))
    px = im.load()
    for y, r in enumerate(rows):
        for x, c in enumerate(r):
            if c in PAL:
                h = PAL[c]
                px[x, y] = (int(h[1:3], 16), int(h[3:5], 16), int(h[5:7], 16), 255)
    return im


# ------------------------------------------------------------------------------------------ weapons
# Pointing right (angle 0); `grip` is where the fist closes. Kept thin: the bodies are 64 px tall and
# a fist is three pixels, so a blade is one bright pixel wide with an outline.

WEAPONS = {
    # The long blade of the pair: wrapped grip, gold guard, a long gently curving edge.
    "katana": dict(grip=(3, 2), art="""
.......................kk.
.kkkkkkk.kkkkkkkkkkkkkkwkk
k5656565gsswwwwwwwwwwwwsk.
.kkkkkkkGkmmmmmmmmmmmmmk..
..........kkkkkkkkkkkkk...
"""),
    # The short blade, for the off hand.
    "wakizashi": dict(grip=(2, 2), art="""
..............kk.
.kkkkk.kkkkkkkwkk
k56565gsswwwwwsk.
.kkkkkGkmmmmmmk..
.......kkkkkkk...
"""),
    # A long haft (dark lacquer, a gold ring) and a curved blade with a red tassel at the joint.
    "glaive": dict(grip=(10, 2), art="""
............................................kkk..
.kkkkkkkkkkkkkkkkkkkkkkkkkkkkkkk.kkkkkkkkkkkkkwk..
kXxXxXxXxXxXxXxXxXxXxXxXxXxXxXgGrsswwwwwwwwwwwsk..
.kkkkkkkkkkkkkkkkkkkkkkkkkkkkkkRrkkmmmmmmmmmmmk...
...............................rRkkkkkkkkkkkk.....
................................r.................
"""),
    # A great two-handed blade: long wrapped grip, heavy guard, broad slightly curved edge.
    "nodachi": dict(grip=(5, 3), art="""
.................................kk.
...........kkkkkkkkkkkkkkkkkkkkkkwkk
.kkkkkkkk.kgsswwwwwwwwwwwwwwwwwwwsk.
k56565656gGsswwwwwwwwwwwwwwwwwwwsk..
.kkkkkkkkGkmmmmmmmmmmmmmmmmmmmmmk...
...........kddddddddddddddddddk.....
............kkkkkkkkkkkkkkkkkk......
"""),
    # The scribe's brush: lacquered handle, gold ferrule, a bristle tip dark with blood.
    "brush": dict(grip=(4, 1), art="""
.kkkkkkkkkkkkk...
kXxXxXxXxXgGnRRkk
.kkkkkkkkkkkkkkk.
"""),
    # A fan of paper talismans held at the edge, red seals on each.
    "talismans": dict(grip=(1, 6), art="""
...kkkk...
..kppppk..
.kpPrPpkk.
.kprRrpppk
.kpPrPPrPk
.kppppprRk
kkpPPpPrPk
k6kppppppk
.kkkkkkkk.
"""),
    # An iron war-fan, folded ribs fanned open, trim-dyed edge.
    "fan": dict(grip=(1, 5), art="""
......kkkk....
....kk5656kk..
...k5dmdmdm5k.
..k5mdmdmdmd5k
.kkdmdmdmdmdmk
kGkmdmdmdmdmk.
.kkkdmdmdmkk..
...kkkkkkk....
"""),
    # A spirit lantern on a short pole: the lantern hangs from the far end and glows.
    "lantern": dict(grip=(3, 2), art="""
..................kkk...
.kkkkkkkkkkkkkkkkkkHkk..
kHbHbHbHbHbHbHbHbHbHHk..
.kkkkkkkkkkkkkkkkkkHkk..
..................kgk...
.................kkgkk..
................kRooooRk
................koLllLok
................koLllLok
................kRooooRk
.................kkgkk..
..................kRk...
"""),
    # The asymmetric steppe bow, held in the middle (lower than centre), string drawn as one line.
    "bow": dict(grip=(3, 21), art="""
..kk.
.kBk.
.kBnk
kbBnk
kBkn.
kBkn.
kBkn.
kBkn.
kBkn.
kbkn.
kBkn.
kBkn.
kBkn.
kBkn.
kBkn.
kbkn.
kBkn.
kBkn.
kBkn.
k5kn.
k6kn.
k5kn.
kBkn.
kBkn.
kbkn.
kBkn.
kBkn.
kBnk.
.kBnk
.kBk.
..kk.
"""),
    # A thin throwing knife with a ring pommel and a trim-dyed tassel.
    "knife": dict(grip=(2, 2), art="""
.kk.......k.
k55kkkkkkkwk
kk5kdsswwsk.
.k.kkkmmmk..
....kkkkk...
"""),
}

# Which sprites a weapon type shows in the main and off hand (shared/src/data/weapons.ts ids).
WEAPON_PARTS = {
    "blades": ("katana", "wakizashi"),
    "glaive": ("glaive", None),
    "greatblade": ("nodachi", None),
    "brush": ("brush", None),
    "talismans": ("talismans", "talismans"),
    "fan": ("fan", None),
    "lantern": ("lantern", None),
    "bow": (None, "bow"),
    "knives": ("knife", "knife"),
}


# ------------------------------------------------------------------------------------------ rotsprite

def scale2x(a):
    """EPX / Scale2x on an (h, w) array of colour ids: edges stay sharp when the image is rotated."""
    h, w = a.shape
    p = np.pad(a, 1, mode="edge")
    B, D, E, F, H = p[:-2, 1:-1], p[1:-1, :-2], p[1:-1, 1:-1], p[1:-1, 2:], p[2:, 1:-1]
    out = np.empty((h * 2, w * 2), a.dtype)
    e0 = np.where((D == B) & (B != F) & (D != H), D, E)
    e1 = np.where((B == F) & (B != D) & (F != H), F, E)
    e2 = np.where((D == H) & (D != B) & (H != F), D, E)
    e3 = np.where((H == F) & (D != H) & (B != F), F, E)
    out[0::2, 0::2], out[0::2, 1::2], out[1::2, 0::2], out[1::2, 1::2] = e0, e1, e2, e3
    return out


def rotsprite(im, grip, angle):
    """Rotates pixel art cleanly about `grip`. Returns the rotated image and the grip's new position."""
    colours = {}
    a = np.zeros((im.height, im.width), np.int32)
    px = im.load()
    for y in range(im.height):
        for x in range(im.width):
            c = px[x, y]
            if c[3]:
                a[y, x] = colours.setdefault(c, len(colours) + 1)
    k = 8
    big = scale2x(scale2x(scale2x(a)))
    # Pad so the rotation never clips, keeping the grip at the centre.
    R = int(math.hypot(im.width, im.height)) + 2
    size = 2 * R * k
    canvas = np.zeros((size, size), np.int32)
    gx, gy = int(grip[0] * k + k / 2), int(grip[1] * k + k / 2)
    oy, ox = R * k - gy, R * k - gx
    canvas[oy : oy + big.shape[0], ox : ox + big.shape[1]] = big
    rot = Image.fromarray(canvas.astype(np.uint16) if canvas.max() < 65535 else canvas).rotate(-math.degrees(angle), resample=Image.NEAREST)
    r = np.array(rot)
    # Back down: each art pixel takes its block's centre sample (keeps lines one pixel wide).
    small = r[k // 2 :: k, k // 2 :: k]
    inv = {v: c for c, v in colours.items()}
    out = Image.new("RGBA", (small.shape[1], small.shape[0]), (0, 0, 0, 0))
    op = out.load()
    for y in range(small.shape[0]):
        for x in range(small.shape[1]):
            v = int(small[y, x])
            if v:
                op[x, y] = inv[v]
    box = out.getbbox()
    if not box:
        return out, (R, R)
    out = out.crop(box)
    return out, (R - box[0], R - box[1])


# ------------------------------------------------------------------------------------------ head
# Three views: front (south, south-west), side (west; east is mirrored) and back (north-west, north).
# `pivot` is the head anchor: the middle of the hair, six rows below its top.

HEADS = {
    # Straw kasa: a wide shallow cone, the same from every side.
    "kasa": {
        v: dict(pivot=(11, 8), art="""
.........kkkk.........
.......kkyyyykk.......
.....kkyyYyyyyykk.....
...kkYyyYyyYyyyyYkk...
.kkzYYyyYyyYyyYyyYzkk.
kzzYYYYYYYYYYYYYYYYzzk
.kkzzzzzzzzzzzzzzzzkk.
...kkkkkkkkkkkkkkkk...
""")
        for v in ("front", "side", "back")
    },
    # Lacquered kabuto with gold horns and a neck guard in the trim dye.
    "kabuto": {
        "front": dict(pivot=(8, 11), art="""
...g........g...
...gg......gg...
....gg....gg....
.....gkkkkg.....
....kkxXXxkk....
...kxXXXXXXxk...
..kxXXXXXXXXxk..
..kxxxxxxxxxxk..
.kxGgGgGgGgGgxk.
.kx5k......k5xk.
kx56k......k65xk
kx65k......k56xk
kkkk........kkkk
"""),
        "side": dict(pivot=(7, 11), art="""
g..............
.gg............
..ggkkkkk......
...kxXXXXkk....
..kxXXXXXXXk...
.kxXXXXXXXXXk..
.kxxxxxxxxxxk..
.kGgGgGgGgGgxk.
..kk...kx5x5xk.
.......kx5x6xk.
.......kx656xk.
.......kx565k..
........kkkk...
"""),
        "back": dict(pivot=(8, 11), art="""
...g........g...
....g......g....
.....kkkkkkk....
....kkxXXxkk....
...kxXXXXXXxk...
..kxXXXXXXXXxk..
..kxxxxxxxxxxk..
.kxGgGgGgGgGgxk.
.kx5656565656xk.
kx565656565656xk
kx656565656565xk
kx565656565656xk
.kkkkkkkkkkkkkk.
"""),
    },
    # A cloth hood in the cloth dye, falling to the shoulders.
    "hood": {
        "front": dict(pivot=(8, 8), art="""
.....kkkkkk.....
...kk223322kk...
..k2233333322k..
.k223333333322k.
.k22k......k22k.
k221k......k122k
k21k........k12k
k21k........k12k
k211k......k112k
.k111kkkkkk111k.
..kk11111111kk..
....kkkkkkkk....
"""),
        "side": dict(pivot=(6, 8), art="""
...kkkkkkk...
..k2233332kk.
.k223333333k.
.k2k33333332k
.kk.k3333332k
....k2333332k
....k2333322k
....k2333221k
....k2222211k
...kk1111111k
..k11111111kk
...kkkkkkkk..
"""),
        "back": dict(pivot=(8, 8), art="""
.....kkkkkk.....
...kk223322kk...
..k2233333322k..
.k223333333322k.
.k233333333332k.
k22333333333322k
k22333333333322k
k22233333333222k
k12222222222221k
.k111111111111k.
..kk11111111kk..
....kkkkkkkk....
"""),
    },
    # A red-lacquered demon half-mask with gold teeth over mouth and jaw (none from behind).
    "mask": {
        "front": dict(pivot=(5, -1), art="""
.krrrrrrk.
krRrrrrRrk
kgkgkkgkgk
.kRrrrrRk.
..kkkkkk..
"""),
        "side": dict(pivot=(5, -1), art="""
.krrrk
krRrrk
kgkgk.
.kRrk.
..kk..
"""),
        "back": dict(pivot=(0, 0), art="."),
    },
    # A headband in the trim dye; its tails hang behind.
    "band": {
        "front": dict(pivot=(6, 3), art="""
k56565656565k
.kkkkkkkkkkk.
"""),
        "side": dict(pivot=(3, 3), art="""
k565656k....
.kkkkkk5k...
.......k56k.
........k5k.
.........kk.
"""),
        "back": dict(pivot=(6, 3), art="""
k5656565656k
.kkkk56kkkk.
....k56k....
....k5k.....
...k55k.....
...kkk......
"""),
    },
    # The Lantern-Keepers' pale veil: a hood whose front falls over the face.
    "veil": {
        "front": dict(pivot=(8, 8), art="""
.....kkkkkk.....
...kkeeeeeekk...
..keeEeeeeEeek..
.keeEeeeeeeEeek.
.keEeEeEeEeEeEk.
keeEeeEeeEeeEeek
keEeeEeeEeeEeEek
keEeeEeeEeeEeEek
keeEeeEeeEeeEeek
.keEeeEeeEeeEek.
..kEeeEeeEeeEk..
...kkkkkkkkkk...
"""),
        "side": dict(pivot=(6, 8), art="""
...kkkkkkk...
..keeeeeeekk.
.keeEeeeeeek.
keEeeeeeeeeek
keEeEeeeeeeek
keeEeeeeeeEek
keEeEeeeeeEek
keEeeeeeeEEek
.keEeeeeeEEek
.keeEeeEEEEk.
..kkkkkkkkk..
"""),
        "back": dict(pivot=(8, 8), art="""
.....kkkkkk.....
...kkeeeeeekk...
..keeeeeeeeeek..
.keeeEeeeeEeeek.
.keeeeeeeeeeeek.
keeeEeeeeeeEeeek
keeeeeeeeeeeeeek
keeEeeeeeeeeEeek
kEeeeeeeeeeeeeEk
.kEEeeeeeeeeEEk.
..kkEEEEEEEEkk..
....kkkkkkkk....
"""),
    },
}

# Shoulders: sode plates sit on each shoulder anchor; the fur mantle on the neck.
SHOULDERS = {
    "sode": dict(pivot=(3, 1), art="""
.kkkkk.
k56565k
kx5x5xk
k56565k
kx5x5xk
.kkkkk.
"""),
    "fur_front": dict(pivot=(8, 1), art="""
..kkkkkkkkkkkkk..
.kffFffFffFffFfk.
kfFvFfFvFfFvFfFvk
.kvkFkvkFkvkFkvk.
..k.k.k.k.k.k.k..
"""),
    "fur_side": dict(pivot=(5, 1), art="""
..kkkkkkk..
.kffFffFfk.
kfFvFfFvFfk
.kvkFkvkFk.
..k.k.k.k..
"""),
}


def cape(view, sway):
    """A cape in the cloth dye, hanging from the neck. Drawn rather than typed: folds every few
    pixels, shading to the darker edge, the hem swinging with `sway` (-1, 0, 1)."""
    if view == "back":
        w0, w1, h = 14, 20, 30
    elif view == "side":
        w0, w1, h = 6, 11, 28
    else:
        w0, w1, h = 14, 18, 26
    W = w1 + 6
    im = Image.new("RGBA", (W, h + 2), (0, 0, 0, 0))
    px = im.load()

    def col(c):
        hx = PAL[c]
        return (int(hx[1:3], 16), int(hx[3:5], 16), int(hx[5:7], 16), 255)

    for y in range(h):
        t = y / (h - 1)
        width = w0 + (w1 - w0) * t
        shift = sway * t * t * 2 + (2.5 * t if view == "side" else 0)
        left = W / 2 - width / 2 + shift
        for x in range(int(left), int(left + width) + 1):
            if 0 <= x < W:
                u = (x - left) / max(1, width)
                fold = int((x - left + y * 0.15) / 3) % 2
                shade = 3 if fold else 2
                if u < 0.15 or u > 0.85:
                    shade -= 1
                if y > h - 4:
                    shade = max(1, shade - 1)
                px[x, y] = col(str(max(1, min(4, shade))))
    # Outline.
    a = np.array(im)[:, :, 3] > 0
    out = im.copy()
    op = out.load()
    for y in range(im.height):
        for x in range(im.width):
            if a[y, x]:
                continue
            n = any(0 <= x + dx < im.width and 0 <= y + dy < im.height and a[y + dy, x + dx] for dx, dy in ((1, 0), (-1, 0), (0, 1), (0, -1)))
            if n:
                op[x, y] = col("k")
    return out, (W // 2, 1)


# ------------------------------------------------------------------------------------------ atlas

def build():
    frames = []  # (name, image, pivot)
    for name, w in WEAPONS.items():
        im = grid(w["art"])
        for i in range(ANGLES):
            rot, piv = rotsprite(im, w["grip"], i * 2 * math.pi / ANGLES)
            frames.append((f"w/{name}/{i}", rot, piv))
    for hid, views in HEADS.items():
        for view, h in views.items():
            frames.append((f"h/{hid}/{view}", grid(h["art"]), h["pivot"]))
    for sid, s in SHOULDERS.items():
        frames.append((f"s/{sid}", grid(s["art"]), s["pivot"]))
    for view in ("front", "side", "back"):
        for sway in (-1, 0, 1):
            im, piv = cape(view, sway)
            frames.append((f"c/{view}/{sway + 1}", im, piv))

    frames.sort(key=lambda f: -f[1].height)
    x = y = shelf = width = 0
    placed = []
    for name, im, piv in frames:
        if x + im.width + 2 > 1024:
            x, y, shelf = 0, y + shelf + 2, 0
        placed.append((name, im, piv, x, y))
        x += im.width + 2
        shelf = max(shelf, im.height)
        width = max(width, x)
    sheet = Image.new("RGBA", (width, y + shelf), (0, 0, 0, 0))
    out = {"frames": {}, "meta": {"image": "gear.webp", "size": {"w": sheet.width, "h": sheet.height}, "scale": "1", "pixel": True, "angles": ANGLES, "weapons": WEAPON_PARTS}}
    for name, im, piv, px_, py_ in placed:
        sheet.paste(im, (px_, py_))
        out["frames"][name] = {
            "frame": {"x": px_, "y": py_, "w": im.width, "h": im.height},
            "rotated": False,
            "trimmed": False,
            "spriteSourceSize": {"x": 0, "y": 0, "w": im.width, "h": im.height},
            "sourceSize": {"w": im.width, "h": im.height},
            "pivot": {"x": round((piv[0] + 0.5) / im.width, 5), "y": round((piv[1] + 0.5) / im.height, 5)},
        }
    os.makedirs(OUT, exist_ok=True)
    sheet.save(os.path.join(OUT, "gear.webp"), "WEBP", lossless=True, method=6)
    with open(os.path.join(OUT, "gear.json"), "w") as f:
        json.dump(out, f, separators=(",", ":"))
    print(f"gear: {len(frames)} frames, {sheet.width}x{sheet.height}")
    return sheet


def preview(path):
    sheet = build()
    sheet = sheet.resize((sheet.width * 3, sheet.height * 3), Image.NEAREST)
    bg = Image.new("RGBA", sheet.size, (200, 196, 186, 255))
    bg.alpha_composite(sheet)
    bg.save(path)


if __name__ == "__main__":
    if len(sys.argv) > 2 and sys.argv[1] == "--preview":
        preview(sys.argv[2])
    else:
        build()
