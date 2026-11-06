"""
Ground textures and small effect sprites, painted with numpy (no Blender needed).

Each ground type is a seamless 4×4-cell "super-tile" painted top-down, then cut into 16 square
cells for the top-down view. A cell at (x, y) uses square (x % 4, y % 4), so neighbouring cells of
one type always join without seams. Every type also gets "soft" squares with a ragged, feathered
rim reaching a quarter cell outwards: drawn over lower-priority neighbours, they make borders
organic (moss creeping over flagstones) instead of a hard grid.

    python tools/art/ground.py
"""
import math
import os
import sys

import numpy as np
from PIL import Image

sys.path.insert(0, os.path.dirname(__file__))
from atlas import pack_atlas  # noqa: E402

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", ".."))
OUT = os.path.join(ROOT, "client", "public", "assets", "sprites")
CELLS = 4
S = 128  # top-down texture pixels per cell
CELL = 64  # screen pixels per cell (shared/src/view.ts CELL)
N = CELLS * S
LIGHT = np.array([-0.55, -0.25, 0.8])  # from world -x (screen upper left), raised
LIGHT = LIGHT / np.linalg.norm(LIGHT)


def periodic_noise(seed, power=2.0, n=N, lo=1):
    """Seamless fractal noise in [0, 1] (random spectrum with a 1/f^power falloff)."""
    rng = np.random.default_rng(seed)
    fx = np.fft.fftfreq(n) * n
    f = np.sqrt(fx[None, :] ** 2 + fx[:, None] ** 2)
    f[0, 0] = 1
    amp = 1 / f ** (power / 2)
    amp[f < lo] = 0
    spec = amp * np.exp(1j * rng.uniform(0, math.tau, (n, n)))
    field = np.real(np.fft.ifft2(spec))
    field -= field.min()
    return field / field.max()


def shade(height, strength):
    """Lambert shading from a height map (periodic gradients)."""
    gx = (np.roll(height, -1, 1) - np.roll(height, 1, 1)) * strength
    gy = (np.roll(height, -1, 0) - np.roll(height, 1, 0)) * strength
    n = np.dstack([-gx, -gy, np.ones_like(height)])
    n /= np.linalg.norm(n, axis=2, keepdims=True)
    lam = np.clip(n @ LIGHT, 0, 1)
    return lam / LIGHT[2]


def mix(a, b, t):
    t = t[..., None] if np.ndim(t) == 2 else t
    return np.asarray(a) * (1 - t) + np.asarray(b) * t


def rgb(h):
    return np.array([int(h[i : i + 2], 16) / 255 for i in (1, 3, 5)])


def petals(seed, density):
    """Fallen blossom petals: small red ellipses scattered (seamlessly) over the texture."""
    rng = np.random.default_rng(seed)
    layer = np.zeros((N, N), np.float32)
    ys, xs = np.mgrid[0:24, 0:24] - 12
    for _ in range(int(density * CELLS * CELLS)):
        cx, cy = rng.integers(0, N, 2)
        a = rng.uniform(0, math.pi)
        rx, ry = rng.uniform(2.5, 4.5), rng.uniform(1.4, 2.4)
        u = (xs * math.cos(a) + ys * math.sin(a)) / rx
        v = (-xs * math.sin(a) + ys * math.cos(a)) / ry
        blob = np.clip(1.3 - (u * u + v * v), 0, 1)
        yy = (np.arange(24) + cy - 12) % N
        xx = (np.arange(24) + cx - 12) % N
        layer[np.ix_(yy, xx)] = np.maximum(layer[np.ix_(yy, xx)], blob)
    return np.clip(layer, 0, 1)


def flagstones(seed):
    """Irregular flagstones (periodic Voronoi), worn and cracked, moss in the joints."""
    rng = np.random.default_rng(seed)
    k = CELLS * 2  # two stones per cell
    pts = (np.stack(np.meshgrid(np.arange(k), np.arange(k)), -1).reshape(-1, 2) + rng.uniform(0.15, 0.85, (k * k, 2))) * (N / k)
    ys, xs = np.mgrid[0:N, 0:N].astype(np.float32)
    f1 = np.full((N, N), 1e9, np.float32)
    f2 = np.full((N, N), 1e9, np.float32)
    idx = np.zeros((N, N), np.int32)
    for i, (px, py) in enumerate(pts):
        dx = np.abs(xs - px)
        dx = np.minimum(dx, N - dx)
        dy = np.abs(ys - py)
        dy = np.minimum(dy, N - dy)
        d = np.sqrt(dx * dx + dy * dy)
        closer = d < f1
        f2 = np.where(closer, f1, np.minimum(f2, d))
        idx = np.where(closer, i, idx)
        f1 = np.where(closer, d, f1)
    edge = f2 - f1
    grout = np.clip(1 - edge / 4.5, 0, 1)
    bevel = np.clip(edge / 14, 0, 1) ** 0.6
    tone = rng.uniform(-0.08, 0.08, len(pts))[idx]
    fine = periodic_noise(seed + 1, 1.2)
    coarse = periodic_noise(seed + 2, 2.6)
    height = bevel * 0.8 + fine * 0.15 + coarse * 0.2
    base = mix(rgb("#6e6a62"), rgb("#57534c"), coarse)
    base = base * (1 + tone[..., None]) * (0.8 + 0.35 * fine[..., None])
    # Hairline cracks and dark weathering streaks.
    cracks = np.clip((periodic_noise(seed + 5, 1.0) - 0.82) * 6, 0, 1) * (1 - grout)
    base = mix(base, rgb("#3a3832"), cracks * 0.6)
    moss = np.clip((coarse - 0.45) * 3, 0, 1) * grout
    col = mix(base, rgb("#2a2c22"), grout * 0.7)
    col = mix(col, rgb("#3b4a24"), moss)
    return col * shade(height, 6)[..., None]


def moss_ground(seed):
    coarse = periodic_noise(seed, 2.4)
    fine = periodic_noise(seed + 1, 0.9)
    clumps = periodic_noise(seed + 2, 1.8)
    col = mix(rgb("#232a1a"), rgb("#3a4226"), coarse)
    col = mix(col, rgb("#171c10"), np.clip((0.4 - clumps) * 2.5, 0, 1))
    col = mix(col, rgb("#3a3428"), np.clip((clumps - 0.7) * 3, 0, 1) * 0.6)
    col = col * (0.82 + 0.3 * fine[..., None])
    p = petals(seed + 3, 14)
    col = mix(col, rgb("#9a1a22") * (0.8 + 0.4 * fine[..., None]), p * 0.95)
    height = coarse * 0.5 + fine * 0.6 + p * 0.3
    return col * shade(height, 5)[..., None]


def gravel(seed):
    """Raked gravel: parallel grooves along world x, the Thorn Clan's garden discipline."""
    ys, xs = np.mgrid[0:N, 0:N].astype(np.float32)
    lines = CELLS * 5
    wobble = periodic_noise(seed, 3.0) * 6
    rake = 0.5 + 0.5 * np.sin((ys + wobble) / N * lines * math.tau)
    grain = periodic_noise(seed + 1, 0.3)
    col = mix(rgb("#8b877f"), rgb("#b2ada2"), rake * 0.6 + grain * 0.4)
    height = rake * 0.7 + grain * 0.5
    return col * shade(height, 9)[..., None]


def dirt(seed):
    coarse = periodic_noise(seed, 2.3)
    fine = periodic_noise(seed + 1, 0.6)
    col = mix(rgb("#3a2c22"), rgb("#5a4634"), coarse)
    col = col * (0.85 + 0.3 * fine[..., None])
    pebbles = np.clip((fine - 0.78) * 6, 0, 1)
    col = mix(col, rgb("#7a7268"), pebbles)
    p = petals(seed + 3, 3)
    col = mix(col, rgb("#7a1418"), p * 0.8)
    return col * shade(coarse * 0.6 + fine * 0.5 + pebbles * 0.4, 6)[..., None]


def water(seed):
    coarse = periodic_noise(seed, 2.8)
    ripple = periodic_noise(seed + 1, 1.4)
    col = mix(rgb("#0b1416"), rgb("#16272a"), coarse)
    glint = np.clip((ripple - 0.72) * 5, 0, 1)
    col = mix(col, rgb("#3a5054"), glint * 0.6)
    return col


def slabs(seed):
    """Dungeon floor: big square slabs with deep grout, damp and stained (the cells under the keep)."""
    ys, xs = np.mgrid[0:N, 0:N].astype(np.float32)
    k = CELLS
    u = (xs / N * k) % 1
    v = (ys / N * k) % 1
    grout = np.clip(1 - np.minimum(np.minimum(u, 1 - u), np.minimum(v, 1 - v)) * N / k / 3.5, 0, 1)
    rng = np.random.default_rng(seed)
    tone = rng.uniform(-0.1, 0.1, (k, k))[(ys / N * k).astype(int) % k, (xs / N * k).astype(int) % k]
    fine = periodic_noise(seed + 1, 1.1)
    damp = periodic_noise(seed + 2, 2.8)
    col = mix(rgb("#3e3c38"), rgb("#2c2a27"), damp)
    col = col * (1 + tone[..., None]) * (0.8 + 0.35 * fine[..., None])
    col = mix(col, rgb("#121110"), grout * 0.85)
    stain = np.clip((periodic_noise(seed + 3, 2.0) - 0.7) * 4, 0, 1)
    col = mix(col, rgb("#2a0a08"), stain * 0.55)
    return col * shade((1 - grout) * 0.8 + fine * 0.2, 6)[..., None]


def rock(seed):
    """Mine floor: rough dark rock with amber veins of sap seeping through the cracks."""
    coarse = periodic_noise(seed, 2.6)
    fine = periodic_noise(seed + 1, 0.8)
    veins = np.clip(1 - np.abs(periodic_noise(seed + 2, 1.6) - 0.5) * 14, 0, 1)
    col = mix(rgb("#22201c"), rgb("#3a3630"), coarse)
    col = col * (0.75 + 0.45 * fine[..., None])
    col = mix(col, rgb("#c87818"), veins * 0.55)
    return col * shade(coarse * 0.6 + fine * 0.7, 8)[..., None]


def planks(seed):
    """Wooden boards along world x (cages, the farmstead's floors, mine walkways)."""
    ys, xs = np.mgrid[0:N, 0:N].astype(np.float32)
    rows = CELLS * 4
    board = (ys / N * rows).astype(int)
    v = (ys / N * rows) % 1
    gap = np.clip(1 - np.minimum(v, 1 - v) * N / rows / 1.6, 0, 1)
    rng = np.random.default_rng(seed)
    tone = rng.uniform(-0.12, 0.12, rows)[board % rows]
    grain = periodic_noise(seed + 1, 0.7)
    streak = 0.5 + 0.5 * np.sin(xs / N * math.tau * 9 + grain * 6 + board * 1.7)
    col = mix(rgb("#4a3424"), rgb("#6a4e34"), streak * 0.5 + grain * 0.5)
    col = col * (1 + tone[..., None])
    col = mix(col, rgb("#140c08"), gap * 0.9)
    return col * shade((1 - gap) * 0.6 + streak * 0.2, 6)[..., None]


def mud(seed):
    coarse = periodic_noise(seed, 2.5)
    fine = periodic_noise(seed + 1, 0.7)
    puddle = np.clip((coarse - 0.62) * 4, 0, 1)
    col = mix(rgb("#2a2018"), rgb("#3e3022"), fine)
    col = mix(col, rgb("#161210"), puddle * 0.8)
    glint = np.clip((fine - 0.75) * 5, 0, 1) * puddle
    col = mix(col, rgb("#4a4a48"), glint * 0.5)
    return col * shade(coarse * 0.4 + fine * 0.6, 5)[..., None]


def sap(seed):
    """Pools of World-Ash sap: thick amber, glowing faintly where it is deep (impassable, like water)."""
    coarse = periodic_noise(seed, 2.9)
    ripple = periodic_noise(seed + 1, 1.5)
    col = mix(rgb("#5a2a04"), rgb("#a85a0a"), coarse)
    glint = np.clip((ripple - 0.7) * 5, 0, 1)
    col = mix(col, rgb("#f0b040"), glint * 0.6)
    return col


def scorched(seed):
    """Burnt earth: black ash, charred stubble, the odd ember still glowing."""
    coarse = periodic_noise(seed, 2.4)
    fine = periodic_noise(seed + 1, 0.6)
    col = mix(rgb("#141210"), rgb("#2e2a26"), coarse)
    col = col * (0.8 + 0.4 * fine[..., None])
    ash = np.clip((fine - 0.6) * 3, 0, 1)
    col = mix(col, rgb("#5a5652"), ash * 0.5)
    ember = np.clip((periodic_noise(seed + 2, 0.4) - 0.9) * 12, 0, 1)
    col = mix(col, rgb("#e0601a"), ember)
    return col * shade(coarse * 0.5 + fine * 0.6, 5)[..., None]


def grass(seed):
    """Forest grass of the North-Grove: dark green, tufted, a few fallen leaves."""
    coarse = periodic_noise(seed, 2.4)
    fine = periodic_noise(seed + 1, 0.5)
    tufts = np.clip((periodic_noise(seed + 2, 0.9) - 0.5) * 3, 0, 1)
    col = mix(rgb("#1e2a14"), rgb("#34461e"), coarse)
    col = mix(col, rgb("#4a5e26"), tufts * 0.6)
    col = col * (0.82 + 0.3 * fine[..., None])
    p = petals(seed + 3, 4)
    col = mix(col, rgb("#7a4a18"), p * 0.7)
    return col * shade(coarse * 0.4 + fine * 0.6 + tufts * 0.4, 6)[..., None]


# Lifts for the Act 1 grounds: painted as they'd look in daylight-dark tones, they sank to black under
# the night's multiply (the courtyard's paving and gravel are ~80–100 bright; these were ~30).
LIFT = {"grass": 2.0, "mud": 1.9, "scorched": 1.9, "slabs": 1.7, "rock": 1.75, "planks": 1.25, "water": 1.3}

GROUND = {"paving": flagstones, "moss": moss_ground, "gravel": gravel, "dirt": dirt, "water": water, "slabs": slabs, "rock": rock, "planks": planks, "mud": mud, "sap": sap, "scorched": scorched, "grass": grass}


def sample(tex, u, v):
    """Bilinear, wrapping texture lookup at texel coordinates."""
    u0 = np.floor(u).astype(int)
    v0 = np.floor(v).astype(int)
    fu = (u - u0)[..., None]
    fv = (v - v0)[..., None]
    u0 %= N
    v0 %= N
    u1 = (u0 + 1) % N
    v1 = (v0 + 1) % N
    top = tex[v0, u0] * (1 - fu) + tex[v0, u1] * fu
    bot = tex[v1, u0] * (1 - fu) + tex[v1, u1] * fu
    return top * (1 - fv) + bot * fv


def square(tex, cx, cy, margin, edge_noise):
    """Cuts cell (cx, cy) of the super-tile as a top-down square (CELL px); margin > 0 gives a feathered soft rim."""
    scale = 1 + 2 * margin
    w = h = int(round(CELL * scale))
    ys, xs = np.mgrid[0:h, 0:w].astype(np.float32) + 0.5
    wx = (xs - w / 2) / CELL + 0.5
    wy = (ys - h / 2) / CELL + 0.5
    col = sample(tex, (cx + wx) * S, (cy + wy) * S)
    # Distance outside the cell (0 inside), in cells.
    out = np.maximum(np.maximum(-wx, wx - 1), np.maximum(-wy, wy - 1))
    if margin > 0:
        jitter = sample(edge_noise[..., None], (cx + wx) * S, (cy + wy) * S)[..., 0]
        alpha = np.clip(1 - (out - (jitter - 0.5) * margin * 1.6) / (margin * 0.45), 0, 1)
        alpha = np.where(out <= 0, 1, alpha) ** 1.3
    else:
        alpha = np.ones_like(out)
    img = np.dstack([np.clip(col, 0, 1), alpha])
    return Image.fromarray((img * 255).round().astype(np.uint8), "RGBA"), (w / 2, h / 2)


def fx_frames():
    frames = []
    n = 256
    ys, xs = np.mgrid[0:n, 0:n].astype(np.float32) + 0.5
    d = np.sqrt((xs - n / 2) ** 2 + (ys - n / 2) ** 2) / (n / 2)
    # Light: bright flat core, smooth fall-off (stamped into the darkness map).
    k = np.clip((d - 0.25) / 0.75, 0, 1)
    light = np.clip(1 - k * k * (3 - 2 * k), 0, 1)
    frames.append(("light", Image.fromarray((np.dstack([np.ones((n, n, 3)), light]) * 255).astype(np.uint8), "RGBA"), (n / 2, n / 2)))
    # Glow: additive halo around flames and lanterns.
    glow = np.clip(1 - d, 0, 1) ** 2.2
    frames.append(("glow", Image.fromarray((np.dstack([np.ones((n, n, 3)), glow]) * 255).astype(np.uint8), "RGBA"), (n / 2, n / 2)))
    # Soft blob shadow under characters (a low ellipse: the 3/4 view sees the ground nearly flat).
    sw, sh = 64, 40
    ys2, xs2 = np.mgrid[0:sh, 0:sw].astype(np.float32) + 0.5
    e = np.sqrt(((xs2 - sw / 2) / (sw / 2)) ** 2 + ((ys2 - sh / 2) / (sh / 2)) ** 2)
    sa = np.clip(1 - e, 0, 1) ** 1.4 * 0.75
    frames.append(("shadow", Image.fromarray((np.dstack([np.zeros((sh, sw, 3)), sa]) * 255).astype(np.uint8), "RGBA"), (sw / 2, sh / 2)))
    # Petals: three shapes, light red so the engine can tint them.
    for i, (rx, ry) in enumerate(((7, 4), (6, 3.2), (5, 4))):
        pw, ph = 18, 12
        ys3, xs3 = np.mgrid[0:ph, 0:pw].astype(np.float32) + 0.5
        u = (xs3 - pw / 2) / rx
        v = (ys3 - ph / 2) / ry
        a = np.clip((1 - (u * u + v * v)) * 3, 0, 1)
        notch = np.clip(((xs3 - pw / 2 - rx * 0.9) ** 2 + (ys3 - ph / 2) ** 2) / 4 - 0.2, 0, 1) if i == 0 else 1
        shade_ = 0.75 + 0.25 * (1 - (ys3 / ph))
        c = np.dstack([0.85 * shade_, 0.16 * shade_, 0.2 * shade_, a * notch])
        frames.append((f"petal_{i}", Image.fromarray((np.clip(c, 0, 1) * 255).astype(np.uint8), "RGBA"), (pw / 2, ph / 2)))
    # Ember: tiny hot spark.
    m = 16
    ys4, xs4 = np.mgrid[0:m, 0:m].astype(np.float32) + 0.5
    de = np.sqrt((xs4 - m / 2) ** 2 + (ys4 - m / 2) ** 2) / (m / 2)
    ea = np.clip(1 - de, 0, 1) ** 1.8
    frames.append(("ember", Image.fromarray((np.dstack([np.ones((m, m)), np.full((m, m), 0.75), np.full((m, m), 0.45), ea]) * 255).astype(np.uint8), "RGBA"), (m / 2, m / 2)))
    # Fog: a seamless soft cloud sheet, scrolled slowly over the scene.
    fogn = periodic_noise(77, 3.2, n=256)
    fa = np.clip((fogn - 0.35) * 1.6, 0, 1) * 0.55
    frames.append(("fog", Image.fromarray((np.dstack([np.ones((256, 256, 3)), fa]) * 255).astype(np.uint8), "RGBA"), (128, 128)))
    return frames


def main():
    os.makedirs(OUT, exist_ok=True)
    frames = []
    edge = periodic_noise(999, 1.1)
    for gi, (name, painter) in enumerate(GROUND.items()):
        tex = painter(10 + gi * 7) * LIFT.get(name, 1.0)
        for cy in range(CELLS):
            for cx in range(CELLS):
                im, pivot = square(tex, cx, cy, 0, edge)
                frames.append((f"{name}_{cx}_{cy}", im, pivot))
                if name not in ("water", "sap"):
                    im, pivot = square(tex, cx, cy, 0.25, edge)
                    frames.append((f"{name}_{cx}_{cy}_soft", im, pivot))
        print("ground", name, flush=True)
    print("ground atlas", pack_atlas(frames, os.path.join(OUT, "ground.png"), os.path.join(OUT, "ground.json")))
    print("fx atlas", pack_atlas(fx_frames(), os.path.join(OUT, "fx.png"), os.path.join(OUT, "fx.json")))


if __name__ == "__main__":
    main()
