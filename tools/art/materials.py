"""Procedural materials (Cycles). Colours are linear RGB tuples."""
import bpy


def srgb(hex_str):
    """'#c8301e' → linear RGB tuple."""
    h = hex_str.lstrip("#")
    c = [int(h[i : i + 2], 16) / 255 for i in (0, 2, 4)]
    return tuple(((v + 0.055) / 1.055) ** 2.4 if v > 0.04045 else v / 12.92 for v in c)


_cache = {}


def material(name, color, rough=0.6, color2=None, noise_scale=6.0, metallic=0.0, emission=None, emission_strength=0.0, sss=0.0, bump=0.0, coat=0.0):
    """
    A principled material. With color2 the base colour is mottled between two colours by noise
    (stone, bark, cloth). Bump adds small surface relief from the same noise.
    """
    key = (name, color, rough, color2, noise_scale, metallic, emission, emission_strength, sss, bump, coat)
    if key in _cache:
        return _cache[key]
    m = bpy.data.materials.new(name)
    m.use_nodes = True
    nt = m.node_tree
    bsdf = nt.nodes["Principled BSDF"]
    bsdf.inputs["Roughness"].default_value = rough
    bsdf.inputs["Metallic"].default_value = metallic
    if coat:
        bsdf.inputs["Coat Weight"].default_value = coat
        bsdf.inputs["Coat Roughness"].default_value = 0.2
    if sss:
        bsdf.inputs["Subsurface Weight"].default_value = sss
    if color2 is not None or bump:
        tc = nt.nodes.new("ShaderNodeTexCoord")
        noise = nt.nodes.new("ShaderNodeTexNoise")
        noise.inputs["Scale"].default_value = noise_scale
        noise.inputs["Detail"].default_value = 8
        noise.inputs["Roughness"].default_value = 0.6
        nt.links.new(tc.outputs["Object"], noise.inputs["Vector"])
    if color2 is not None:
        ramp = nt.nodes.new("ShaderNodeValToRGB")
        ramp.color_ramp.elements[0].position = 0.35
        ramp.color_ramp.elements[1].position = 0.7
        ramp.color_ramp.elements[0].color = (*color, 1)
        ramp.color_ramp.elements[1].color = (*color2, 1)
        nt.links.new(noise.outputs["Fac"], ramp.inputs["Fac"])
        nt.links.new(ramp.outputs["Color"], bsdf.inputs["Base Color"])
    else:
        bsdf.inputs["Base Color"].default_value = (*color, 1)
    if bump:
        b = nt.nodes.new("ShaderNodeBump")
        b.inputs["Strength"].default_value = bump
        nt.links.new(noise.outputs["Fac"], b.inputs["Height"])
        nt.links.new(b.outputs["Normal"], bsdf.inputs["Normal"])
    if emission is not None:
        bsdf.inputs["Emission Color"].default_value = (*emission, 1)
        bsdf.inputs["Emission Strength"].default_value = emission_strength
    _cache[key] = m
    return m


def image_material(name, path, rough=0.7, emission_strength=0.0):
    """A material from an image (banner cloth with a painted crest)."""
    m = bpy.data.materials.new(name)
    m.use_nodes = True
    nt = m.node_tree
    bsdf = nt.nodes["Principled BSDF"]
    tex = nt.nodes.new("ShaderNodeTexImage")
    tex.image = bpy.data.images.load(path)
    nt.links.new(tex.outputs["Color"], bsdf.inputs["Base Color"])
    bsdf.inputs["Roughness"].default_value = rough
    if emission_strength:
        nt.links.new(tex.outputs["Color"], bsdf.inputs["Emission Color"])
        bsdf.inputs["Emission Strength"].default_value = emission_strength
    return m


# The realm's palette: black lacquer, ash grey, vermilion, old gold.
PALETTE = {
    "vermilion": srgb("#b8261a"),
    "vermilion_dark": srgb("#7a140e"),
    "lacquer": srgb("#141012"),
    "ash": srgb("#8d8a86"),
    "ash_dark": srgb("#4a4744"),
    "gold": srgb("#b08a3e"),
    "stone": srgb("#77736c"),
    "stone_dark": srgb("#4c4943"),
    "moss": srgb("#3f4a2a"),
    "wood": srgb("#4a3022"),
    "wood_dark": srgb("#2a1a13"),
    "plaster": srgb("#d9d2c3"),
    "roof": srgb("#2c2e33"),
    "blossom": srgb("#c0283a"),
    "blossom_light": srgb("#e2566a"),
    "blossom_dark": srgb("#7e1424"),
    "bamboo": srgb("#6d7a3a"),
    "bamboo_dark": srgb("#3e4a22"),
    "skin": srgb("#d9b8a0"),
    "grey_skin": srgb("#8f938f"),
    "blood": srgb("#5a0606"),
}
