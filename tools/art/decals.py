"""Painted decals: blood (flat on the top-down ground) and the Soramei crest for banners."""
import math
import os
import random

import numpy as np
from PIL import Image, ImageDraw, ImageFilter

CELL = 64  # screen px per cell (shared/src/view.ts)


def _blood_mask(seed, size=256):
    """Top-down blood: a few merged pools plus splatter drops, with soft edges."""
    rnd = random.Random(seed)
    yy, xx = np.mgrid[0:size, 0:size].astype(np.float32) / size
    field = np.zeros((size, size), np.float32)
    for _ in range(rnd.randint(4, 7)):
        cx, cy = rnd.uniform(0.3, 0.7), rnd.uniform(0.3, 0.7)
        r = rnd.uniform(0.07, 0.17)
        field += r * r / ((xx - cx) ** 2 + (yy - cy) ** 2 + 1e-4)
    # Drops thrown outward.
    for _ in range(rnd.randint(14, 26)):
        a = rnd.uniform(0, math.tau)
        d = rnd.uniform(0.18, 0.45)
        cx, cy = 0.5 + math.cos(a) * d, 0.5 + math.sin(a) * d
        r = rnd.uniform(0.008, 0.025)
        field += r * r / ((xx - cx) ** 2 + (yy - cy) ** 2 + 1e-5)
    mask = np.clip((field - 0.9) * 2.5, 0, 1)
    return Image.fromarray((mask * 255).astype(np.uint8), "L").filter(ImageFilter.GaussianBlur(1.2))


def _blood_rgba(seed, size=256):
    mask = np.asarray(_blood_mask(seed, size)).astype(np.float32) / 255
    rnd = np.random.default_rng(seed)
    noise = Image.fromarray((rnd.random((size // 8, size // 8)) * 255).astype(np.uint8)).resize((size, size), Image.BICUBIC)
    n = np.asarray(noise).astype(np.float32) / 255
    # Thick in the middle (darker), thin at the edges (brighter, more transparent).
    depth = np.asarray(Image.fromarray((mask * 255).astype(np.uint8)).filter(ImageFilter.GaussianBlur(6))).astype(np.float32) / 255
    r = 0.36 - 0.2 * depth + 0.05 * n
    g = 0.02 + 0.015 * n
    b = 0.025 + 0.01 * n
    # A wet highlight on the upper-left rims.
    gy, gx = np.gradient(depth)
    hl = np.clip((-gx - gy) * 40, 0, 1) * mask
    r, g, b = r + hl * 0.35, g + hl * 0.18, b + hl * 0.16
    a = np.clip(mask * (0.75 + 0.25 * depth), 0, 1)
    rgba = np.stack([r, g, b, a], -1)
    return Image.fromarray((np.clip(rgba, 0, 1) * 255).astype(np.uint8), "RGBA")


def to_ground(im, cells=1.0):
    """A top-down square image covering `cells` × `cells`, at the game's CELL px per cell."""
    n = max(1, int(round(CELL * cells)))
    return im.resize((n, n), Image.LANCZOS)


def blood_pool(v):
    im = to_ground(_blood_rgba(40 + v), cells=1.5 if v % 2 == 0 else 1.1)
    return im, (im.width / 2, im.height / 2)


def blood_plane(v):
    """A blood pool under a corpse, rendered in Blender so it sits in the same light."""
    import bpy
    import bmesh

    from models import mesh_obj

    path = os.path.join(os.path.dirname(__file__), ".cache", f"blood_tex_{v}.png")
    os.makedirs(os.path.dirname(path), exist_ok=True)
    _blood_rgba(70 + v, 512).save(path)
    m = bpy.data.materials.new(f"blood{v}")
    m.use_nodes = True
    nt = m.node_tree
    bsdf = nt.nodes["Principled BSDF"]
    tex = nt.nodes.new("ShaderNodeTexImage")
    tex.image = bpy.data.images.load(path)
    nt.links.new(tex.outputs["Color"], bsdf.inputs["Base Color"])
    nt.links.new(tex.outputs["Alpha"], bsdf.inputs["Alpha"])
    bsdf.inputs["Roughness"].default_value = 0.12
    bsdf.inputs["Coat Weight"].default_value = 0.6
    bm = bmesh.new()
    bmesh.ops.create_grid(bm, x_segments=1, y_segments=1, size=1.0)
    o = mesh_obj("blood", bm, m)
    o.location = (0, 0, 0.004)
    o.data.uv_layers.new()


def crest_path(cache):
    """The Soramei banner: black cloth, a ring of thorns around a red blossom, frayed hem."""
    path = os.path.join(cache, "crest_soramei.png")
    if os.path.exists(path):
        return path
    os.makedirs(cache, exist_ok=True)
    W, H = 256, 640
    im = Image.new("RGB", (W, H), (14, 11, 12))
    d = ImageDraw.Draw(im)
    red = (176, 30, 22)
    cx, cy, R = W // 2, 230, 82
    # Thorn ring: a circle with hooked spikes.
    d.ellipse((cx - R, cy - R, cx + R, cy + R), outline=red, width=12)
    for i in range(12):
        a = i / 12 * math.tau
        p1 = (cx + math.cos(a) * (R + 4), cy + math.sin(a) * (R + 4))
        p2 = (cx + math.cos(a + 0.18) * (R + 30), cy + math.sin(a + 0.18) * (R + 30))
        p3 = (cx + math.cos(a + 0.22) * (R + 2), cy + math.sin(a + 0.22) * (R + 2))
        d.polygon([p1, p2, p3], fill=red)
    # Five-petal blossom in the middle.
    for i in range(5):
        a = i / 5 * math.tau - math.pi / 2
        px, py = cx + math.cos(a) * 26, cy + math.sin(a) * 26
        d.ellipse((px - 22, py - 22, px + 22, py + 22), fill=red)
    d.ellipse((cx - 10, cy - 10, cx + 10, cy + 10), fill=(176, 138, 62))
    # Gold edge lines and a frayed hem.
    d.rectangle((10, 10, W - 11, H - 60), outline=(150, 118, 52), width=4)
    rnd = random.Random(5)
    for x in range(0, W, 6):
        d.rectangle((x, H - 60 + rnd.randint(0, 40), x + 6, H), fill=(0, 0, 0))
    im = im.filter(ImageFilter.GaussianBlur(0.6))
    # Cloth grain.
    arr = np.asarray(im).astype(np.float32)
    arr *= 0.9 + 0.1 * np.random.default_rng(3).random((H, W, 1))
    Image.fromarray(np.clip(arr, 0, 255).astype(np.uint8)).save(path)
    return path
