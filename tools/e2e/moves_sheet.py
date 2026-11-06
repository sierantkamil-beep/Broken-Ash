"""
Puts the filmstrips from tools/e2e/moves.cjs (or skills.cjs) on one sheet per weapon (and one for
the paths): a row per skill (and per chain beat), its moments left to right, the id on the left.

  python3 tools/e2e/moves_sheet.py [moves|skills]   ->  tools/e2e/out/<kind>-<group>.png
"""
import os
import re
import sys
from collections import defaultdict

from PIL import Image, ImageDraw

HERE = os.path.dirname(os.path.abspath(__file__))
KIND = sys.argv[1] if len(sys.argv) > 1 else "moves"
SRC = os.path.join(HERE, "out", KIND)
WEAPONS = ["blades", "glaive", "greatblade", "brush", "talismans", "fan", "lantern", "bow", "knives"]

rows = defaultdict(dict)
for f in os.listdir(SRC):
    m = re.match(r"(.+)_(\d)\.png$", f)
    if m:
        rows[m.group(1)][int(m.group(2))] = os.path.join(SRC, f)

groups = defaultdict(list)
for name in sorted(rows):
    base = name.split("~")[0]
    g = next((w for w in WEAPONS if base.startswith(w + "_")), "paths")
    groups[g].append(name)

LABEL = 150
for g, names in groups.items():
    tiles = [[Image.open(rows[n][i]) for i in sorted(rows[n])] for n in names]
    w, h = tiles[0][0].size
    cols = max(len(r) for r in tiles)
    sheet = Image.new("RGB", (LABEL + w * cols, h * len(names)), (24, 22, 30))
    d = ImageDraw.Draw(sheet)
    for r, (n, row) in enumerate(zip(names, tiles)):
        d.text((6, r * h + h // 2 - 6), n.replace("~", " beat "), fill=(235, 225, 205))
        for c, im in enumerate(row):
            sheet.paste(im.convert("RGB"), (LABEL + c * w, r * h))
    out = os.path.join(HERE, "out", f"{KIND}-{g}.png")
    sheet.save(out)
    print(out, sheet.size)
