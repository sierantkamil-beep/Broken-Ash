# Credits

Code is MIT-licensed (see `LICENSE`). Third-party art, audio and fonts keep their own licenses and are
listed here: **name, author, link, license, what we changed**. Assets under CC-BY-SA stay CC-BY-SA when
modified.

## Art
- **PixelLab** (https://www.pixellab.ai), AI pixel-art generation, used under PixelLab's Terms of Service
  (https://pixellab.ai/termsofservice) on the project owner's account: the male and female base
  bodies and their run, strike and cast animations (`tools/pixellab/ids.json` lists every generation).
  Changed: palette-snapped, recoloured per path, mirrored to the missing directions; idle, hit, death
  and roll are derived from the generated rotations.

Older sprites (props, ground, the not-yet-replaced Greyed) are rendered by our own scripts in
`tools/art/` with Blender (the program's GPL licence doesn't extend to images it renders).
- **MakeHuman base mesh, skeleton, skin weights and body/ear targets** — the MakeHuman project
  (Data Collection AB, Joel Palmius, Jonas Hauquier and contributors),
  https://github.com/makehumancommunity/makehuman, **CC0 1.0**. Changed: morphed into elves
  (proportions, long ears), dressed with our own outfits, hair and weapons, posed and rendered.

## Audio
All music, ambience and effects are original, synthesised by `tools/audio/build.py`. No third-party
audio yet.

## Fonts
- **Cormorant Garamond** — Christian Thalmann (Catharsis Fonts), SIL Open Font License 1.1, via
  `@fontsource/cormorant-garamond`. Unchanged.
- **Shippori Mincho** — FONTDASU, SIL Open Font License 1.1, via `@fontsource/shippori-mincho`
  (Latin subset only). Unchanged.

## Libraries
Phaser (MIT), Colyseus (MIT), Electron (MIT), Vite (MIT) — see each package's licence in `node_modules`.
