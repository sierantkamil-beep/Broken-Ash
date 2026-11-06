"""
Skill effects as pixel art: every effect is a short animation drawn procedurally at the game's art
resolution (one art pixel = 2×2 screen pixels, like the characters) in hard-edged element palettes,
then packed into one atlas the client plays (client/src/fx/spriteFx.ts).

How a frame is drawn: each family computes an *intensity field* (0..1) per pixel for each frame;
the field is cut into the element's ramp in hard steps (no smooth gradients: pixel art), with the
brightest step the hottest core. Fields come from shapes (crescent smears, rings, streaks, flame
tongues, clouds) shaped with deterministic noise, so every run makes the same atlas.

    python tools/fx/build.py               # client/public/assets/fx/spells.{png,json} + tools/fx/out/sheet.png

Frame names: "<family>/<ramp>/<frame>". The JSON meta lists every animation with its frame count,
so the client never hard-codes lengths.
"""
import json
import math
import os
import sys

import numpy as np
from PIL import Image

sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "art"))
from atlas import pack_atlas  # noqa: E402

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", ".."))
OUT = os.path.join(ROOT, "client", "public", "assets", "fx")
SHEET = os.path.join(os.path.dirname(os.path.abspath(__file__)), "out")


def hexrgb(h):
    return tuple(int(h[i : i + 2], 16) for i in (1, 3, 5))


# Element ramps, darkest to hottest. Five hard steps each.
RAMPS = {
    "steel": ["#1c2230", "#4a5a74", "#9aacc4", "#dfe8f2", "#ffffff"],
    "blood": ["#24030a", "#5e0812", "#a8121f", "#e0403a", "#ffc0b0"],
    "fire": ["#2e0804", "#962606", "#ec7618", "#ffc23c", "#fff6c8"],
    "lightning": ["#14163e", "#3e48b0", "#8e9cf0", "#d4dcff", "#ffffff"],
    "spirit": ["#082a2a", "#1a7062", "#52bca6", "#a6f0d6", "#f2fff8"],
    "poison": ["#14220a", "#365e12", "#7cc23e", "#c4ee6c", "#f2ffc8"],
    "wind": ["#2e3844", "#6c7c8c", "#b4c2cc", "#e8f0f6", "#ffffff"],
    "nature": ["#24160a", "#553614", "#76983a", "#acd06a", "#e2f2b4"],
    "dusk": ["#301a06", "#84540e", "#dca63c", "#ffd88c", "#fff6dc"],
    "shadow": ["#060408", "#1a1420", "#32283a", "#54485e", "#847a8e"],
    "gold": ["#3a2406", "#8a5c12", "#d8a032", "#ffe08a", "#fffbe8"],
}


def noise2(w, h, seed, scale=6.0):
    """Smooth value noise in [0, 1] (bilinear over a random lattice): breaks shapes up organically."""
    rng = np.random.default_rng(seed)
    gw, gh = int(w / scale) + 3, int(h / scale) + 3
    g = rng.random((gh, gw))
    ys, xs = np.mgrid[0:h, 0:w].astype(np.float32)
    fx, fy = xs / scale, ys / scale
    x0, y0 = np.floor(fx).astype(int), np.floor(fy).astype(int)
    tx, ty = fx - x0, fy - y0
    tx, ty = tx * tx * (3 - 2 * tx), ty * ty * (3 - 2 * ty)
    a = g[y0, x0] * (1 - tx) + g[y0, x0 + 1] * tx
    b = g[y0 + 1, x0] * (1 - tx) + g[y0 + 1, x0 + 1] * tx
    return a * (1 - ty) + b * ty


def grid(w, h, cx=None, cy=None):
    ys, xs = np.mgrid[0:h, 0:w].astype(np.float32) + 0.5
    cx = w / 2 if cx is None else cx
    cy = h / 2 if cy is None else cy
    return xs - cx, ys - cy


def to_rgba(field, ramp, cut=0.12, outline=False):
    """Cuts an intensity field into the ramp's hard steps; below `cut` is transparent."""
    cols = np.array([hexrgb(c) for c in RAMPS[ramp]], dtype=np.uint8)
    f = np.nan_to_num(np.clip(field, 0, 1))
    idx = np.clip(((f - cut) / (1 - cut) * len(cols)).astype(int), 0, len(cols) - 1)
    rgb = cols[idx]
    a = (f >= cut).astype(np.uint8) * 255
    if outline:
        # A one-pixel dark rim where the shape meets nothing (projectiles, solid things).
        m = a > 0
        edge = np.zeros_like(m)
        edge[1:, :] |= m[:-1, :]
        edge[:-1, :] |= m[1:, :]
        edge[:, 1:] |= m[:, :-1]
        edge[:, :-1] |= m[:, 1:]
        edge &= ~m
        rgb[edge] = cols[0]
        a[edge] = 255
    return Image.fromarray(np.dstack([rgb, a]), "RGBA")


def smooth(t):
    t = min(1.0, max(0.0, t))
    return t * t * (3 - 2 * t)


# ----------------------------------------------------------------------------------- families
# Each family returns (frames: list of float fields, pivot (x, y) in px, outline flag).


def slash(arc_deg, n=7, R=56, seed=1):
    """
    A blade smear: a crescent band sweeping through `arc_deg` around the pivot (the wielder), aimed
    along +x. The leading edge is hottest; the tail cools and thins as the swing passes, then the
    whole smear fades. 360° is a full whirl.
    """
    size = 2 * R + 6
    xs, ys = grid(size, size)
    d = np.hypot(xs, ys)
    ang = np.arctan2(ys, xs)
    half = math.radians(arc_deg) / 2
    nz = noise2(size, size, seed, 5.0)
    frames = []
    for k in range(n):
        t = (k + 1) / (n - 1)
        lead = -half + 2 * half * min(1.0, t * 1.35)
        fade = 1.0 - max(0.0, (t - 0.7) / 0.3) * 0.85
        # Angle behind the leading edge (0 at the edge, growing towards the start of the swing).
        behind = lead - ang
        if arc_deg >= 360:
            behind = np.mod(behind, 2 * math.pi)
            span = 2 * math.pi * min(1.0, t * 1.35)
        else:
            span = lead + half
        inside = (behind >= 0) & (behind <= span + 1e-6)
        u = np.where(inside, behind / max(span, 1e-3), 1.0)
        # The band: thick at the edge, thinning towards the tail, along the outer radius.
        thick = 0.55 * (1 - u) ** 0.7 + 0.08
        inner = R * (1 - thick)
        band = np.clip(1 - np.abs(d - (R + inner) / 2) / ((R - inner) / 2 + 0.6), 0, 1)
        f = band * (1 - u) ** 0.7 * inside
        f = f * (0.8 + 0.35 * nz) * fade
        # A white-hot rim at the very edge of the blade's path.
        rim = np.clip(1 - np.abs(d - R + 1.5) / 1.6, 0, 1) * (1 - u) ** 2 * inside * fade
        frames.append(np.maximum(f, rim * 1.05))
    return frames, (size / 2, size / 2), False


def streak(n=6, L=96, W=18, seed=2):
    """A thrust or dash: a spear of light along +x from the pivot, extending then thinning away."""
    w, h = L + 8, W * 2 + 6
    xs, ys = grid(w, h, cx=2, cy=h / 2)
    nz = noise2(w, h, seed, 4.0)
    frames = []
    for k in range(n):
        t = (k + 1) / n
        reach = L * min(1.0, t * 1.8)
        tail = L * max(0.0, (t - 0.45) / 0.55)
        along = np.clip((xs - tail) / max(reach - tail, 1), 0, 1)
        inside = (xs >= tail) & (xs <= reach)
        # Tapered: a point at the head, wide in the middle, thin at the tail.
        prof = np.maximum(np.sin(np.clip(along, 0, 1) * math.pi), 0) ** 0.6 * (0.35 + 0.65 * along)
        width = W * 0.5 * prof * (1 - 0.5 * t) + 1.4
        f = np.clip(1 - np.abs(ys) / width, 0, 1) * inside
        f = f * (0.85 + 0.3 * nz) * (0.6 + 0.6 * along)
        frames.append(f)
    return frames, (2, h / 2), False


def ring(n=8, R=44, w0=7, seed=3):
    """An expanding shockwave ring (novas, bells, landings), bright at first, thinning as it grows."""
    size = 2 * R + 6
    xs, ys = grid(size, size)
    d = np.hypot(xs, ys)
    nz = noise2(size, size, seed, 5.0)
    frames = []
    for k in range(n):
        t = (k + 1) / n
        r = R * (0.25 + 0.75 * smooth(t ** 0.7))
        wd = w0 * (1 - t) + 1.2
        f = np.clip(1 - np.abs(d - r) / wd, 0, 1) * (1.1 - t * 0.7)
        # A soft inner glow early on.
        f = np.maximum(f, np.clip(1 - d / r, 0, 1) * 0.5 * (1 - t) ** 2)
        frames.append(f * (0.8 + 0.35 * nz))
    return frames, (size / 2, size / 2), False


def sparks(n=6, R=18, count=11, seed=4):
    """A hit: a hot core and short rays flying out, fading."""
    size = 2 * R + 4
    xs, ys = grid(size, size)
    rng = np.random.default_rng(seed)
    rays = [(rng.uniform(0, 2 * math.pi), rng.uniform(0.55, 1.0)) for _ in range(count)]
    frames = []
    for k in range(n):
        t = (k + 1) / n
        f = np.zeros((size, size), np.float32)
        core = np.clip(1 - np.hypot(xs, ys) / (R * 0.45 * (1 - t) + 0.5), 0, 1) * (1 - t)
        f = np.maximum(f, core * 1.1)
        for a, ln in rays:
            head = R * ln * min(1.0, t * 1.6)
            tail = head * (0.25 + 0.6 * t)
            dx, dy = math.cos(a), math.sin(a)
            along = xs * dx + ys * dy
            across = np.abs(-xs * dy + ys * dx)
            seg = (along >= tail) & (along <= head)
            f = np.maximum(f, np.clip(1 - across / 1.1, 0, 1) * seg * (1 - t * 0.8) * np.clip((along - tail) / max(head - tail, 1), 0, 1) ** 0.5)
        frames.append(f)
    return frames, (size / 2, size / 2), False


def explosion(n=12, R=34, seed=5):
    """A fiery blast: a hot core swells, breaks into boiling lobes, then cools to smoke and embers."""
    size = 2 * R + 8
    xs, ys = grid(size, size)
    d = np.hypot(xs, ys)
    nzs = [noise2(size, size, seed + i, 4.5) for i in range(4)]
    frames = []
    for k in range(n):
        t = (k + 1) / n
        r = R * (0.3 + 0.7 * smooth(t ** 0.55))
        nz = nzs[k % 4] * 0.6 + nzs[(k + 1) % 4] * 0.4
        body = np.clip(1 - (d / r) ** 1.6 + (nz - 0.5) * 0.9, 0, 1)
        heat = 1.15 - t * 1.05
        f = body * heat
        # Hollowing out as it burns away.
        f *= np.clip((d / r - (t - 0.45) * 1.2) * 3, 0, 1) if t > 0.45 else 1
        frames.append(f)
    return frames, (size / 2, size / 2), False


def flames(n=8, w=20, h=26, seed=6, tongues=3):
    """A looping fire: tongues of flame licking upwards from the pivot at the bottom."""
    xs, ys = grid(w, h, cx=w / 2, cy=h - 2)
    frames = []
    for k in range(n):
        nz = noise2(w, h + 40, seed, 3.5)[k * 5 % 40 : k * 5 % 40 + h, :]
        f = np.zeros((h, w), np.float32)
        for i in range(tongues):
            ox = (i - (tongues - 1) / 2) * (w / (tongues + 1)) + math.sin(k / n * 2 * math.pi + i * 2.1) * 1.5
            height = h * (0.65 + 0.3 * math.sin(k / n * 2 * math.pi * 1 + i * 1.7) ** 2)
            up = np.clip(-ys / height, 0, 1)
            width = (w / (tongues + 0.6)) * (1 - up) ** 0.8 + 0.3
            f = np.maximum(f, np.clip(1 - np.abs(xs - ox) / width, 0, 1) * (ys <= 0) * (1 - up) ** 0.6)
        f = f * (0.7 + 0.6 * nz)
        frames.append(f)
    return frames, (w / 2, h - 2), False


def cloud(n=8, R=18, seed=7):
    """A looping puff (poison, smoke): a lumpy blob that breathes and churns."""
    size = 2 * R + 6
    xs, ys = grid(size, size)
    d = np.hypot(xs, ys)
    frames = []
    for k in range(n):
        a = k / n * 2 * math.pi
        nz = noise2(size + 30, size + 30, seed, 5.0)
        ox, oy = int(15 + 10 * math.cos(a)), int(15 + 10 * math.sin(a))
        nz = nz[oy : oy + size, ox : ox + size]
        r = R * (0.85 + 0.08 * math.sin(a * 2))
        f = np.clip(1 - (d / r) ** 1.4 + (nz - 0.5) * 0.9, 0, 1) * 0.85
        frames.append(f)
    return frames, (size / 2, size / 2), False


def cyclone(n=8, R=32, seed=8):
    """A looping whirlwind seen from above: spiral streaks turning round the centre."""
    size = 2 * R + 6
    xs, ys = grid(size, size)
    d = np.hypot(xs, ys)
    ang = np.arctan2(ys, xs)
    nz = noise2(size, size, seed, 4.0)
    frames = []
    for k in range(n):
        phase = k / n * 2 * math.pi / 3
        spiral = np.sin(3 * (ang - phase) + d / R * 5.5)
        f = np.clip((spiral - 0.35) * 1.8, 0, 1) * np.clip(1 - d / R, 0, 1) ** 0.6
        f = np.maximum(f, np.clip(1 - d / (R * 0.25), 0, 1) * 0.6)
        frames.append(f * (0.75 + 0.4 * nz))
    return frames, (size / 2, size / 2), False


def roots(n=8, R=26, count=7, seed=9):
    """Roots or thorns bursting out of the ground: gnarled spikes rising and then sinking a little."""
    w, h = 2 * R + 6, R + 22
    xs, ys = grid(w, h, cx=w / 2, cy=h - 6)
    rng = np.random.default_rng(seed)
    spikes = [(rng.uniform(-R * 0.85, R * 0.85), rng.uniform(-3, 4), rng.uniform(0.55, 1.0), rng.uniform(-0.35, 0.35)) for _ in range(count)]
    frames = []
    for k in range(n):
        t = (k + 1) / n
        grow = smooth(min(1.0, t * 2.2)) * (1 - 0.15 * max(0, t - 0.6) / 0.4)
        f = np.zeros((h, w), np.float32)
        for sx, sy, hgt, lean in spikes:
            top = (R + 8) * hgt * grow
            up = np.clip(-(ys - sy) / max(top, 1), 0, 1)
            cx = sx + lean * (-(ys - sy))
            width = 4.6 * (1 - up) ** 0.9 + 0.6
            spike = np.clip(1 - np.abs(xs - cx) / width, 0, 1) * ((ys - sy) <= 0) * (up < 1)
            f = np.maximum(f, spike * (0.55 + 0.5 * up))
        # Broken earth at the base.
        f = np.maximum(f, np.clip(1 - np.hypot(xs / R, (ys) / 4), 0, 1) * 0.35 * grow)
        frames.append(f)
    return frames, (w / 2, h - 6), True


def pillar(n=8, w=22, h=72, seed=10):
    """A buff: a column of light rising from the feet with motes, then dissolving."""
    xs, ys = grid(w, h, cx=w / 2, cy=h - 4)
    nz = noise2(w, h + 60, seed, 3.0)
    frames = []
    for k in range(n):
        t = (k + 1) / n
        top = h * smooth(min(1.0, t * 1.8))
        up = np.clip(-ys / max(top, 1), 0, 1)
        width = (w / 2 - 2) * (1 - 0.5 * up) * (1 - 0.6 * max(0, t - 0.5) / 0.5)
        n2 = nz[(k * 7) % 60 : (k * 7) % 60 + h, :]
        f = np.clip(1 - np.abs(xs) / np.maximum(width, 0.5), 0, 1) * (ys <= 0) * (-ys <= top)
        f = f * (1 - up) ** 0.5 * (0.6 + 0.6 * n2) * (1.1 - 0.6 * t)
        frames.append(f)
    return frames, (w / 2, h - 4), False


def sigil(n=8, R=36, seed=11):
    """A ground seal: a double ring with invented rune strokes, turning and pulsing (no real script)."""
    size = 2 * R + 6
    xs, ys = grid(size, size)
    d = np.hypot(xs, ys)
    ang = np.arctan2(ys, xs)
    rng = np.random.default_rng(seed)
    marks = rng.random(16)
    frames = []
    for k in range(n):
        t = k / n
        rot = t * 2 * math.pi / 8
        outer = np.clip(1 - np.abs(d - R + 2) / 1.3, 0, 1)
        inner = np.clip(1 - np.abs(d - R * 0.68) / 1.0, 0, 1)
        # Rune strokes between the rings: short radial and tangential ticks at seeded angles.
        sector = np.mod(ang - rot, 2 * math.pi) / (2 * math.pi) * 16
        si = np.floor(sector).astype(int) % 16
        frac = sector - np.floor(sector)
        band = (d > R * 0.72) & (d < R - 4)
        tick = (np.abs(frac - 0.5) < 0.09) & band & (marks[si] > 0.3)
        bar = (np.abs(d - R * 0.84) < 0.9) & band & (frac > 0.25) & (frac < 0.75) & (marks[si] > 0.55)
        f = np.maximum(outer, inner) * 0.9 + (tick | bar) * 0.75
        f = np.minimum(f, 1) * (0.75 + 0.25 * math.sin(t * 2 * math.pi))
        frames.append(f)
    return frames, (size / 2, size / 2), False


def bubble(n=6, R=22, seed=12):
    """A shield: a shimmering dome with a bright rim and a sliding highlight."""
    size = 2 * R + 6
    xs, ys = grid(size, size)
    d = np.hypot(xs, ys)
    frames = []
    for k in range(n):
        a = k / n * 2 * math.pi
        rim = np.clip(1 - np.abs(d - R + 1.5) / 2.2, 0, 1)
        fill = np.zeros_like(d)
        hx, hy = math.cos(a) * R * 0.45, -R * 0.4
        hl = np.clip(1 - np.hypot(xs - hx, ys - hy) / 4.5, 0, 1) * 0.9
        frames.append(np.maximum(np.maximum(rim, fill), hl) * (d <= R + 1))
    return frames, (size / 2, size / 2), False


def hands(n=8, w=36, h=40, seed=13):
    """Summoning: ghostly clawed hands clawing up out of the ground."""
    xs, ys = grid(w, h, cx=w / 2, cy=h - 4)
    frames = []
    for k in range(n):
        t = (k + 1) / n
        rise = smooth(min(1.0, t * 1.6)) * (1 - 0.3 * max(0, t - 0.7) / 0.3)
        f = np.zeros((h, w), np.float32)
        for side in (-1, 1):
            bx = side * 7
            top = 30 * rise
            arm = np.clip(1 - np.abs(xs - bx - side * (-ys) * 0.12) / 3.6, 0, 1) * (ys <= 0) * (-ys <= top - 6)
            palm = np.clip(1 - np.hypot(xs - bx - side * top * 0.12, ys + top - 6) / 4.0, 0, 1) * (rise > 0.2)
            f = np.maximum(f, np.maximum(arm, palm))
            for i in range(4):
                fa = -math.pi / 2 + (i - 1.5) * 0.35 * side
                fx0 = bx + side * top * 0.12
                fy0 = -top + 6
                along = (xs - fx0) * math.cos(fa) + (ys - fy0) * math.sin(fa)
                across = np.abs(-(xs - fx0) * math.sin(fa) + (ys - fy0) * math.cos(fa))
                f = np.maximum(f, np.clip(1 - across / 1.5, 0, 1) * (along > 0) * (along < 7 * rise) * (rise > 0.3))
        f = np.maximum(f, np.clip(1 - np.hypot(xs / 16, ys / 3), 0, 1) * 0.5 * rise)
        frames.append(f * (1.05 - 0.4 * t))
    return frames, (w / 2, h - 4), False


def mote(n=6, R=6, seed=14):
    """A tiny glowing particle loop (status motes, wisps' heads): a pulsing soft dot with a cross glint."""
    size = 2 * R + 3
    xs, ys = grid(size, size)
    d = np.hypot(xs, ys)
    frames = []
    for k in range(n):
        p = 0.75 + 0.25 * math.sin(k / n * 2 * math.pi)
        core = np.clip(1 - d / (R * 0.55 * p), 0, 1)
        glint = (np.clip(1 - np.abs(xs) / 0.6, 0, 1) * np.clip(1 - np.abs(ys) / (R * p), 0, 1) + np.clip(1 - np.abs(ys) / 0.6, 0, 1) * np.clip(1 - np.abs(xs) / (R * p), 0, 1)) * 0.6
        frames.append(np.maximum(core * 1.1, glint))
    return frames, (size / 2, size / 2), False


def drip(n=6, w=7, h=14, seed=15):
    """Bleeding: a drop swelling at the top and falling."""
    xs, ys = grid(w, h, cx=w / 2, cy=0)
    frames = []
    for k in range(n):
        t = k / n
        y = 2 + t * (h - 5)
        r = 1.6 + 0.8 * min(1, t * 3)
        drop = np.clip(1 - np.hypot(xs, (ys - y) * (0.8 if t > 0.3 else 1)) / r, 0, 1)
        trail = np.clip(1 - np.abs(xs) / 0.6, 0, 1) * (ys < y) * (ys > y - 4 * t) * 0.6
        frames.append(np.maximum(drop * 1.1, trail))
    return frames, (w / 2, 0), True


def crackle(n=4, R=10, seed=16):
    """Static: little forking sparks crawling over a body."""
    size = 2 * R + 3
    xs, ys = grid(size, size)
    rng = np.random.default_rng(seed)
    frames = []
    for k in range(n):
        f = np.zeros((size, size), np.float32)
        for _ in range(3):
            x, y = rng.uniform(-R * 0.6, R * 0.6), rng.uniform(-R * 0.6, R * 0.6)
            for _ in range(5):
                a = rng.uniform(0, 2 * math.pi)
                nx, ny = x + math.cos(a) * 3, y + math.sin(a) * 3
                for s in np.linspace(0, 1, 8):
                    px, py = x + (nx - x) * s, y + (ny - y) * s
                    f = np.maximum(f, np.clip(1 - np.hypot(xs - px, ys - py) / 0.9, 0, 1))
                x, y = nx, ny
        frames.append(f)
    return frames, (size / 2, size / 2), False


def vines(n=6, w=30, h=12, seed=17):
    """Rooted: vines coiling round the feet, tightening."""
    xs, ys = grid(w, h)
    ang = np.arctan2(ys * 2.4, xs)
    d = np.hypot(xs, ys * 2.4)
    frames = []
    for k in range(n):
        t = k / n
        coil = np.sin(ang * 3 + t * 2 * math.pi + d * 0.4)
        band = np.clip(1 - np.abs(d - 11) / 3.0, 0, 1)
        frames.append(np.clip((coil + 0.2), 0, 1) * band)
    return frames, (w / 2, h / 2), True


def stars(n=6, w=26, h=10, seed=18):
    """Stagger: three little stars wheeling over the head."""
    xs, ys = grid(w, h)
    frames = []
    for k in range(n):
        f = np.zeros((h, w), np.float32)
        for i in range(3):
            a = k / n * 2 * math.pi + i * 2 * math.pi / 3
            px, py = math.cos(a) * 10, math.sin(a) * 3
            f = np.maximum(f, np.clip(1 - (np.abs(xs - px) + np.abs(ys - py)) / 2.4, 0, 1) * (0.6 + 0.4 * math.sin(a) ** 2))
        frames.append(f)
    return frames, (w / 2, h / 2), False


# Projectiles: small solid sprites pointing along +x, pivot at their centre (one frame, or a loop).
def proj(kind, n=1, seed=19):
    if kind == "arrow":
        w, h = 18, 5
    elif kind == "knife":
        w, h = 11, 5
    elif kind == "needle":
        w, h = 13, 3
    elif kind == "talisman":
        w, h, n = 10, 12, 4
    else:  # orb
        w, h, n = 12, 12, 6
    xs, ys = grid(w, h)
    frames = []
    for k in range(n):
        if kind == "arrow":
            shaft = (np.abs(ys) < 0.6) * (xs > -8) * (xs < 5) * 0.55
            head = np.clip(1 - (np.abs(ys) * 1.6 + np.maximum(0, 5 - xs) * 0.5) / 2.5, 0, 1) * (xs >= 4) * (xs <= 9)
            flet = (np.abs(ys) < 2.2) * (xs > -9) * (xs < -5) * 0.4
            f = np.maximum(np.maximum(shaft, head), flet)
        elif kind == "knife":
            blade = np.clip(1 - np.abs(ys + 0.3) / (1.6 * np.clip((5.5 - xs) / 5, 0, 1) + 0.2), 0, 1) * (xs > 0) * (xs < 5.5)
            grip = (np.abs(ys) < 0.9) * (xs <= 0) * (xs > -5) * 0.35
            f = np.maximum(blade * 0.95, grip)
        elif kind == "needle":
            f = np.clip(1 - np.abs(ys) / 0.7, 0, 1) * (xs > -6) * (xs < 6) * (0.4 + 0.6 * (xs + 6) / 12)
        elif kind == "talisman":
            paper = (np.abs(xs) < 3.5) * (np.abs(ys) < 5) * 0.55
            burn = np.clip(1 - np.abs(np.abs(ys) - 5 - 0.6 * math.sin(k * 1.7)) / 1.2, 0, 1) * (np.abs(xs) < 4) * 0.95
            mark = (np.abs(xs) < 0.6) * (np.abs(ys) < 3) * 0.2
            f = np.maximum(np.maximum(paper, burn), mark)
        else:
            d = np.hypot(xs, ys)
            p = 0.85 + 0.15 * math.sin(k / n * 2 * math.pi)
            f = np.clip(1 - d / (5 * p), 0, 1) ** 0.7
        frames.append(f)
    return frames, (w / 2, h / 2), kind in ("arrow", "knife", "needle", "talisman")


# ----------------------------------------------------------------------------------- the set
# family name -> (builder, ramps it's baked in)
SET = {
    "slash80": (lambda: slash(80, seed=21), ["steel", "blood", "wind", "nature", "spirit", "dusk", "poison", "fire"]),
    "slash130": (lambda: slash(130, seed=22), ["steel", "blood", "wind", "nature", "spirit", "dusk", "poison", "fire"]),
    "slash220": (lambda: slash(220, seed=23), ["steel", "blood", "wind", "nature"]),
    "whirl": (lambda: slash(360, n=8, seed=24), ["steel", "blood", "wind", "spirit"]),
    "streak": (lambda: streak(), ["steel", "blood", "wind", "lightning", "spirit", "shadow", "dusk", "fire"]),
    "ring": (lambda: ring(), ["steel", "blood", "fire", "lightning", "spirit", "poison", "wind", "nature", "dusk", "shadow", "gold"]),
    "sparks": (lambda: sparks(), ["gold", "blood", "fire", "lightning", "spirit", "poison", "nature", "wind", "dusk", "steel"]),
    "explosion": (lambda: explosion(), ["fire", "poison", "blood", "spirit"]),
    "flames": (lambda: flames(), ["fire", "spirit", "poison"]),
    "cloud": (lambda: cloud(), ["poison", "shadow", "wind", "blood", "spirit"]),
    "cyclone": (lambda: cyclone(), ["wind", "nature", "blood"]),
    "roots": (lambda: roots(), ["nature", "blood", "shadow"]),
    "pillar": (lambda: pillar(), ["gold", "blood", "nature", "lightning", "spirit", "dusk", "poison", "fire"]),
    "sigil": (lambda: sigil(), ["blood", "fire", "spirit", "lightning", "nature", "dusk", "poison", "gold"]),
    "bubble": (lambda: bubble(), ["nature", "blood", "lightning", "steel"]),
    "hands": (lambda: hands(), ["spirit", "shadow"]),
    "mote": (lambda: mote(), ["fire", "poison", "lightning", "spirit", "wind", "gold", "blood", "dusk", "nature", "shadow"]),
    "drip": (lambda: drip(), ["blood"]),
    "crackle": (lambda: crackle(), ["lightning"]),
    "vines": (lambda: vines(), ["nature"]),
    "stars": (lambda: stars(), ["gold"]),
    "arrow": (lambda: proj("arrow"), ["steel", "dusk", "wind"]),
    "knife": (lambda: proj("knife"), ["steel", "poison", "blood"]),
    "needle": (lambda: proj("needle"), ["blood", "steel"]),
    "talisman": (lambda: proj("talisman"), ["fire"]),
    "orb": (lambda: proj("orb"), ["fire", "spirit", "blood", "wind", "poison", "lightning", "nature", "dusk", "shadow"]),
}


def build():
    os.makedirs(OUT, exist_ok=True)
    os.makedirs(SHEET, exist_ok=True)
    frames = []
    anims = {}
    for fam, (make, ramps) in SET.items():
        fields, pivot, outline = make()
        for ramp in ramps:
            key = f"{fam}/{ramp}"
            anims[key] = len(fields)
            for i, f in enumerate(fields):
                frames.append((f"{key}/{i}", to_rgba(f, ramp, outline=outline), pivot))
    print("fx frames", len(frames))
    size = pack_atlas(frames, os.path.join(OUT, "spells.png"), os.path.join(OUT, "spells.json"))
    data = json.load(open(os.path.join(OUT, "spells.json")))
    data["meta"]["anims"] = anims
    data["meta"]["pixel"] = True
    with open(os.path.join(OUT, "spells.json"), "w") as fh:
        json.dump(data, fh, separators=(",", ":"))
    print("atlas", size)
    preview(frames, anims)


def preview(frames, anims):
    """A contact sheet: every animation as a row of frames, at 2× on a dark ground, for review."""
    by = {}
    for name, im, _ in frames:
        key = name.rsplit("/", 1)[0]
        by.setdefault(key, []).append(im)
    rows = list(by.items())
    cw = 120
    out = Image.new("RGBA", (cw * 12 * 2, len(rows) * cw * 2 // 2), (16, 13, 15, 255))
    y = 0
    sheets = []
    for key, ims in rows:
        h = max(i.height for i in ims)
        row = Image.new("RGBA", (sum(i.width + 4 for i in ims) + 4, h + 4), (16, 13, 15, 255))
        x = 2
        for im in ims:
            row.alpha_composite(im, (x, 2))
            x += im.width + 4
        sheets.append(row)
    W = max(r.width for r in sheets)
    H = sum(r.height for r in sheets)
    out = Image.new("RGBA", (W, H), (16, 13, 15, 255))
    for r in sheets:
        out.alpha_composite(r, (0, y))
        y += r.height
    out = out.resize((out.width * 2, out.height * 2), Image.NEAREST)
    out.save(os.path.join(SHEET, "sheet.png"))


if __name__ == "__main__":
    build()
