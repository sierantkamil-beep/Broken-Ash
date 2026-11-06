"""
Shared Blender helpers for the sprite pipeline.

Conventions (must match shared/src/view.ts):
  * Game world (gx, gy, gz) maps to Blender (gx, -gy, gz). One cell = one Blender unit.
  * Top-down 3/4 view: an orthographic camera tilted PITCH from straight down, no yaw (north is up).
    The render is then stretched vertically by 1 / cos(PITCH), so the ground comes out square:
    one cell is CELL × CELL px, as the game draws it, and one unit of height is Z_PX px.
  * Everything is rendered at SS× resolution and downsampled for clean anti-aliasing.
  * Each sprite gets a pivot: the pixel where its ground origin is, so the game can place it.
"""
import math
import os

from atlas import pack_atlas  # noqa: F401  (re-exported: painters without Blender import it directly)
import bpy
import numpy as np
from PIL import Image

CELL = 64  # screen px per cell (shared/src/view.ts CELL)
PX_PER_UNIT = CELL  # horizontal pixels per Blender unit at scale 1
# 35° from straight down: high enough to read the ground like a map, low enough to see walls, trunks
# and faces (PixelLab's "high top-down" bodies are drawn from about here).
PITCH = math.radians(35)
YAW = 0.0
# After the ground stretch, a unit of height is tan(PITCH) cells tall (shared/src/view.ts Z_PX).
Z_PX = CELL * math.tan(PITCH)
GROUND_STRETCH = 1 / math.cos(PITCH)
SS = 2  # supersampling factor

# Camera view direction (from the rotation), used to back the camera away from its target.
VIEW_DIR = (0.0, math.sin(PITCH), -math.cos(PITCH))


def reset_scene(samples=20, footprint=None):
    import materials

    bpy.ops.wm.read_factory_settings(use_empty=True)
    # The factory reset deletes every material, so cached handles would point at freed data.
    materials._cache.clear()
    s = bpy.context.scene
    s.render.engine = "CYCLES"
    s.cycles.device = "CPU"
    s.cycles.samples = samples
    s.cycles.use_denoising = True
    s.cycles.denoiser = "OPENIMAGEDENOISE"
    s.cycles.max_bounces = 4
    s.render.film_transparent = True
    s.render.image_settings.file_format = "PNG"
    s.render.image_settings.color_mode = "RGBA"
    s.view_settings.view_transform = "AgX"
    s.view_settings.look = "AgX - Medium High Contrast"
    world = bpy.data.worlds.new("world")
    s.world = world
    world.use_nodes = True
    bg = world.node_tree.nodes["Background"]
    # Soft cool ambient: the engine adds night and lantern light on top, so sprites stay neutral.
    bg.inputs[0].default_value = (0.42, 0.45, 0.55, 1)
    bg.inputs[1].default_value = 0.55
    add_lights()
    if footprint:
        add_shadow_catcher(footprint)
    return s


def add_shadow_catcher(footprint):
    """
    An invisible ground that keeps only the shadows falling on it, so sprites sit on the ground.
    Limited to an ellipse around the footprint: long shadows would make sprites huge and wouldn't
    match the game's own lights anyway.
    """
    w, h = footprint
    bpy.ops.mesh.primitive_circle_add(vertices=48, radius=1, fill_type="NGON", location=(0, 0, 0))
    disc = bpy.context.active_object
    disc.scale = (w / 2 + 0.55, h / 2 + 0.55, 1)
    disc.is_shadow_catcher = True
    disc.name = "shadow_catcher"


def render_with_shadow(path_obj, path_shadow):
    """Renders the prop alone, then with its shadow catcher (see composite_shadow)."""
    disc = bpy.data.objects["shadow_catcher"]
    disc.hide_render = True
    render_to(path_obj)
    disc.hide_render = False
    render_to(path_shadow)


def composite_shadow(obj, with_shadow, pivot, footprint):
    """
    Keeps the object's pixels and adds the shadow (the extra coverage of the catcher render),
    faded out towards the edge of the footprint ellipse so it never shows a hard rim.
    """
    o = np.asarray(obj).astype(np.float32) / 255
    s = np.asarray(with_shadow).astype(np.float32) / 255
    shadow = np.clip(s[..., 3] - o[..., 3], 0, 1)
    h, w = shadow.shape
    ys, xs = np.mgrid[0:h, 0:w].astype(np.float32) + 0.5
    # The stretched render shows the ground square: a pixel's ground cell is just its offset / CELL.
    gx, gy = (xs - pivot[0]) / CELL, (ys - pivot[1]) / CELL
    rx, ry = footprint[0] / 2 + 0.55, footprint[1] / 2 + 0.55
    d = np.sqrt((gx / rx) ** 2 + (gy / ry) ** 2)
    feather = np.clip((1.0 - d) / 0.45, 0, 1) ** 1.5
    sa = shadow * feather * 0.8
    ao = o[..., 3]
    out_a = ao + sa * (1 - ao)
    out_rgb = np.where(out_a[..., None] > 1e-4, o[..., :3] * ao[..., None] / np.maximum(out_a[..., None], 1e-4), 0)
    return Image.fromarray((np.dstack([np.clip(out_rgb, 0, 1), out_a]) * 255).round().astype(np.uint8), "RGBA")


def add_lights():
    s = bpy.context.scene
    # Key light from the front left of the screen (the moon), a warm low fill from the right, a rim
    # from behind. Angles were set for the old 45° camera; turned by −45° they keep the same side of
    # the screen with the camera facing north.
    turn = -45
    for name, energy, rot, color in [
        ("key", 3.2, (math.radians(28), 0, math.radians(-20 + turn)), (1.0, 0.97, 0.92)),
        ("fill", 0.6, (math.radians(70), 0, math.radians(120 + turn)), (1.0, 0.72, 0.55)),
        ("rim", 1.4, (math.radians(55), 0, math.radians(200 + turn)), (0.7, 0.8, 1.0)),
    ]:
        l = bpy.data.lights.new(name, "SUN")
        l.energy = energy
        l.color = color
        l.angle = math.radians(8)
        o = bpy.data.objects.new(name, l)
        o.rotation_euler = rot
        s.collection.objects.link(o)


def setup_camera(width_px, height_px, target_z, zoom=1.0):
    """
    Camera whose image centre looks at (0, 0, target_z), for a final (stretched) frame of
    width_px × height_px. `zoom` draws at that many times the map's pixels per unit (characters:
    the PixelLab players stand about 2.8 cells tall, bigger than true scale, and enemies must match).
    Returns the pivot of the world origin in final pixels.
    """
    s = bpy.context.scene
    s.render.resolution_x = width_px * SS
    # Rendered shorter, then stretched back to height_px (stretch()).
    s.render.resolution_y = round(height_px / GROUND_STRETCH) * SS
    cam = bpy.data.cameras.new("cam")
    cam.type = "ORTHO"
    cam.sensor_fit = "HORIZONTAL"
    cam.ortho_scale = width_px / (PX_PER_UNIT * zoom)
    cam.clip_start = 0.1
    cam.clip_end = 200
    o = bpy.data.objects.new("cam", cam)
    s.collection.objects.link(o)
    o.rotation_euler = (PITCH, 0, YAW)
    s.render.pixel_aspect_x = 1
    s.render.pixel_aspect_y = 1
    dist = 60
    o.location = (-VIEW_DIR[0] * dist, -VIEW_DIR[1] * dist, target_z - VIEW_DIR[2] * dist)
    s.camera = o
    # The origin is target_z below the image centre.
    return (width_px / 2, height_px / 2 + target_z * Z_PX * zoom)


def render_to(path):
    s = bpy.context.scene
    s.render.filepath = path
    bpy.ops.render.render(write_still=True)


def stretch(im, height_px):
    """Stretches a downsampled render vertically to its final height (premultiplied, see above)."""
    if im.height == height_px:
        return im
    a = np.asarray(im).astype(np.float32) / 255.0
    pre = np.concatenate([a[..., :3] * a[..., 3:4], a[..., 3:4]], axis=-1)
    big = Image.fromarray((pre * 255).round().astype(np.uint8), "RGBA").resize((im.width, height_px), Image.LANCZOS)
    s = np.asarray(big).astype(np.float32) / 255.0
    alpha = s[..., 3:4]
    rgb = np.where(alpha > 1e-4, s[..., :3] / np.maximum(alpha, 1e-4), 0)
    return Image.fromarray((np.concatenate([np.clip(rgb, 0, 1), alpha], axis=-1) * 255).round().astype(np.uint8), "RGBA")


def load_frame(path, height_px):
    """A finished frame: the supersampled render shrunk, then stretched so the ground is square."""
    return stretch(load_downsampled(path), height_px)


def load_downsampled(path):
    """Loads a supersampled render and shrinks it with premultiplied alpha (no dark fringes)."""
    im = Image.open(path).convert("RGBA")
    a = np.asarray(im).astype(np.float32) / 255.0
    rgb = a[..., :3] * a[..., 3:4]
    pre = np.concatenate([rgb, a[..., 3:4]], axis=-1)
    small = Image.fromarray((pre * 255).round().astype(np.uint8), "RGBA").resize((im.width // SS, im.height // SS), Image.LANCZOS)
    s = np.asarray(small).astype(np.float32) / 255.0
    alpha = s[..., 3:4]
    rgb = np.where(alpha > 1e-4, s[..., :3] / np.maximum(alpha, 1e-4), 0)
    out = np.concatenate([np.clip(rgb, 0, 1), alpha], axis=-1)
    return Image.fromarray((out * 255).round().astype(np.uint8), "RGBA")


def trim(im, pivot, pad=1):
    """Crops transparent margins; returns the cropped image and the pivot moved with it."""
    bbox = im.getchannel("A").point(lambda v: 255 if v > 2 else 0).getbbox()
    if not bbox:
        return im.crop((0, 0, 1, 1)), (0, 0)
    x0, y0, x1, y1 = bbox
    x0, y0 = max(0, x0 - pad), max(0, y0 - pad)
    x1, y1 = min(im.width, x1 + pad), min(im.height, y1 + pad)
    return im.crop((x0, y0, x1, y1)), (pivot[0] - x0, pivot[1] - y0)


