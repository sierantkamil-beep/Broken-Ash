# Broken Ash — project guide for Claude

A **2-player online co-op dark-fantasy action RPG** in a fallen elven realm with East Asian–inspired
aesthetics. Built for exactly two people (Kamil and his girlfriend). Successor to *Dinusie*
(`sierantkamil-beep/dinusie`, final state at the `dinusie-final` tag), whose engine-level systems are
carried over as they are needed.

The design is **`docs/design.md`** (world, story, paths, combat, items, building, cinematics,
milestones) — read the relevant section before building a feature. **`docs/history.md`** logs what
each milestone actually built; append a short entry for every finished feature.
**`docs/catalogue.md`** maps every source file (purpose, exports, dependencies); it is generated
(`pnpm catalogue`) and a test fails when it's stale — regenerate it after adding or changing files.

## Graphify
The repo is indexed in Graphify (`sierantkamil-beep/Broken-Ash`, repository id
`7915e7d0-8d7f-491b-8831-5c949dcfb53c`). Graphify indexes **`main` only**, re-indexed after each merge, so
merge finished work to `main` to keep the graph current. Prefer `query_graph` / `graphify_find` /
`graphify_callers` / `graphify_impact` for "where / who calls / what breaks" questions; read the file when
the index may be stale (work not yet on `main`). Dinusie (`sierantkamil-beep/Dinusie`) is indexed too,
for porting its systems.

## Decisions

| Topic | Decision | Why |
|---|---|---|
| Genre | Action RPG, free 8-way movement along the screen, dodge, aimed skills. Not tile-based. | Dinusie's Tibia foundation was the wrong base. |
| Camera | **Top-down 3/4** like Dinusie: square 64 px cells (32 art px), ground drawn flat, characters and props upright, WASD straight along the screen; whole-pixel zoom. Replaced isometric 2:1 after B1 (`shared/src/view.ts`). | User decision ("go back to top-down"); the PixelLab bodies are "high top-down" art already. |
| Tone | Dark fantasy: gore, profanity, moral grey, named characters die in the story (Game of Thrones-like). Five acts on the curve normal → downer → cruel → doom → hope → doom & cruelty → hope → **happy ending**. | Dinusie felt made for children; the users chose this curve. |
| Culture | Elven realm with **East Asian–inspired aesthetics**, Japanese and Chinese about equally (pagodas, vermilion, lanterns, blossoms, curved blades). Eight peoples with distinct looks, architecture and customs, one per path, each with its own naming style (see design.md "Names"). Royals and priests keep old elven names. Human invaders look European. Invented names and customs only; no real-world gods, clans or fake script. | User request; makes the world unique. |
| Cinematics | Story beats are **in-engine cinematics**: seekable timelines (shared data) synced through room state; both players must vote to skip; no voice acting. | User request ("cinematic actions, not just plain dialogues"). |
| Companions | Never die in combat (downed companions get up after the fight); deaths are story events only. | User request. |
| Paths (classes) | 8: 2 melee, 4 magic, 2 ranged. No healers or pure tanks; every path deals damage, sustains itself and has co-op combos. | Always exactly two players; support roles would be boring. |
| Building | Core pillar: the players build, furnish and defend their fortress (Ostoja). Raids outside the story are a **setting** (on by default). | The users love building. |
| Language | Player-facing content in **Polish**; code, comments, docs, data keys in English. Avoid gendered verb forms where possible; counts via `plural()`. | User request; the two players are different genders. |
| Art | **PixelLab** (pixellab.ai) generates the hard parts: the **two shared bodies** (male/female, 64 px, 8 rotations) and their motion (run, strike, cast; 5 directions, the other 3 mirrored). Everything else is ours, made from those pixels: path looks by **palette recolour** (`shared/src/data/looks.ts`, `client/src/assets/recolor.ts`), idle/hit/death/roll derived in `tools/pixellab/derive.py`, gear (weapons, head pieces, shoulders, capes) hand-placed pixel parts pinned to per-frame anchors (`tools/pixellab/anchors.py` + `anchor_picks.json`, `parts.py`), armour materials drawn into the tunic. Pixel art drawn at 2× with nearest filtering and whole-pixel zoom. Generations are scarce (40 on the trial): test one direction before buying the rest. Props, ground and the Greyed are Blender renders put through `tools/art/pixelate.py` (art resolution, per-frame palettes, dark outlines) so the whole screen is one pixel style. Free assets (CC0/CC-BY/CC-BY-SA) only with a `CREDITS.md` entry; **nothing paid**. | User decision ("visuals still ugly"; "male/female models, animations within the skills, armour that actually appears"). |
| Skill VFX | **Pixel spell effects over the exact hit shapes.** Every skill's effect is built from its data: the element from its weapon (talismans burn, the lantern haunts) or its path (Ash fire, Storm lightning, Graves spirit…), the look from its shape and vfx key (blade smears, thrusts, whirls, explosions, lightning, seals, roots, clouds, volleys), with particles, flashes of light on the night, hit-stop and shake; signature skills have their own recipes (`client/src/fx/spells.ts`). Small sprites are baked by `tools/fx/build.py`; big shapes (smears, rings, seals, blasts, cyclones) are generated in the client at the exact size (`procfx.ts`) so every effect has the characters' pixel size. The flat hit shape stays underneath (`shapes.ts`), so the spectacle never hides what hits. Statuses show on bodies (flames, bubbles, drips, sparks, vines, sigils, stars, shields). **Every skill has its own recipe** (`client/src/fx/recipes/`: wind-up, release, bolt, landing, zone; enemy attacks too) and **its own move** (`client/src/entities/moves.ts`: a pose timeline over the strike/cast frames, weapon strokes with trails, afterimages, 3-beat basic chains); tests fail on a missing or repeated one. | User decision: "outstandingly beautiful" effects; pixel spell FX chosen over ink. |
| Weapons | **Any path can wield any of 9 weapon types**; each path has 2–3 home weapons (+damage and a path rider). The bar is **path 3 + weapon 3**: the weapon gives LMB, RMB and key 1 from its own **mastery tree** (levelled by use, saved on the host); the path gives its 3 signature skills. Weapons and armour are **visible** on the body (anchored parts + armour materials). **The weapon is the equipped item** (no free switching; not mid-fight). | User decision. |
| Progression | **Levels 1–20** from kills and clears (shared XP); bar slots open with level (`SLOT_UNLOCK`); a talent point per level in three branches (tiers of one-of-two + keystone), respec at a bonfire (`shared/src/progress.ts`). New skills are introduced on a card; a first-hour tutorial. | Playtest: "you start with all the skills… no character development". |
| Items | Design §6: slots (weapon, head, chest, hands, legs, boots, amulet, rings, relic), base tiers, rarities common/fine/rare/ashen with rolled affixes, relics, story uniques; a 10×6 bag; loot from drops and chests, shown on the ground by rarity (`shared/src/data/items.ts`, `inventory.ts`). Chest/head bases set the body's look. | Playtest: "we lack the equipment". |
| Casting | Hold to aim (reach + exact shape preview), release to cast; wind-ups mark the ground and chant; thrown circles really fly (dodgeable); some skills are channels. | Playtest: skills "appear out of nowhere". |
| Bodies | Each player picks a male or female body; **one body per sex for every path**, dressed by the path's look and gear. | User request. |
| Combat | Skills are data (aimed shapes + effects + statuses), interpreted by the server; Greyed attacks are telegraphed on the ground; executions, downed/revive, wipes restart the wave. | design.md §5. |
| Audio | **Synthesised into .ogg files** by `tools/audio/build.py` (numpy + ffmpeg); played through Phaser's Web Audio on three buses. | Original, re-tunable, nothing to license. |
| Platform | **Windows desktop app only** (Electron). No browser version: the client is web tech inside Electron, never shipped or played in a browser. | User decision. |
| Stack | pnpm workspaces, TypeScript 5.9, Phaser 3.90 (WebGL), Colyseus 0.16 embedded server, Electron Windows .exe. | Same as Dinusie so its systems port over. |
| Netcode | Server-authoritative fixed 60 Hz simulation; the owning client **predicts** with the same `stepBody` and reconciles on every patch; remote players are interpolated 110 ms behind. Input credit (one step per tick) stops speed hacks. | Action combat needs instant movement. |
| Security | Server validates every message (`sanitizeInput`, name sanitising, input credit). When accounts arrive: hashed passwords (scrypt), no plaintext "remember me". | Dinusie lacked this. |
| Scope | A system is added only when the current slice is fun without it. Every milestone ends with a playtest and a bug pass. Progression, items and casting were added after the B1 playtest asked for them; no further systems until those are fun. | Dinusie's scope creep; the visual reset after B1. |

## Layout

```
shared/   Pure logic + data used by both sides (no Phaser/Colyseus/Node imports).
  src/view.ts        Top-down projection (world cells ↔ screen px, CELL = 64), 8 sprite directions, depth.
  src/movement.ts    Body, InputFrame, stepBody (accel, dodge roll, stamina), circle-vs-grid collision.
  src/map.ts         AreaMap (exits, encounters, NPCs, levers, gates via prop `until`), CollisionGrid.
  src/maps/          Maps written as code (MapBuilder): soramei.ts (courtyard), act1.ts (cells, farmstead,
                     sap-mine, Harrow's road); index.ts (MAPS, START_MAP = the cells).
  src/cinematic.ts   Cinematic timeline types, evaluateCinematic (seekable), validation.
  src/combat/        types.ts (SkillDef, Shape, Effect, StatusId, PathDef), geometry.ts (hit tests).
  src/data/          paths.ts (8 paths: resource, sustain, 3 signature skills, home weapons), weapons.ts
                     (9 weapon types × mastery trees), looks.ts (dyes, skin tones, armour/head/shoulders,
                     validLook), greyed.ts (enemies, waves), props.ts, cinematics.ts (+ act1scenes.ts,
                     written with scene.ts: lines of dialogue timed from their length).
  src/progress.ts    XP, levels, slot unlocks, talents (Bonus types, withBonuses, statsOf).
  src/inventory.ts   The bag grid, equip rules, equipment bonuses and worn look; data/items.ts bases, affixes, uniques.
  src/loadout.ts     The skill bar: weapon basic/RMB/key 1 (+ passives, home affinity) + path signature;
                     masteryLevel, validPicks. Server and client resolve the same bar from synced inputs.
  src/balance.ts     Every tunable number, each with its reason.
server/   Colyseus. game/World.ts is the network-free simulation (unit tested): Combat.ts (casts,
          projectiles, zones, statuses, damage), Units.ts (Greyed/thrall AI), Pathing.ts (flow fields);
          sim.test.ts is the balance simulation (paths and weapons). Profiles.ts saves characters (mastery,
          picks, look) as JSON in the host's data dir. rooms/WorldRoom.ts mirrors World into the schema.
client/   Phaser 3 + Vite.
  src/scenes/        BootScene (atlases + audio), WorldScene (title drift, play, cinematics).
  src/world/         GroundLayer (baked ground), PropLayer (props, light sources, occlusion fade),
                     Lighting (night multiply + lights), Petals (falling blossom).
  src/cinematic/     CinematicPlayer (camera, DOM overlay, events).
  src/entities/      Character (paper doll: dyed body + gear on anchors; plays moves), moves.ts (every skill's
                     move: poses, weapon strokes, trails, basic chains), UnitSprite (Greyed, thralls, corpses).
  src/fx/            Vfx (combat events → effects, damage numbers, status loops), Telegraphs; gore.ts (blood
                     layer, sprays, gibs, dismemberment by cause, corpse treatments);
                     spells.ts (every skill's effect recipe), fxkit.ts (effect sprites, pixel particles,
                     lightning, temporary lights, hit-stop), procfx.ts (big shapes at exact size),
                     shapes.ts (exact hit shapes), accents.ts (one colour per path); recipes/ (every
                     skill's, form's and enemy attack's effect, built from tools.ts beats); scars.ts
                     (scorch, cracks, ink kept on the ground).
  src/assets/        Atlas loading (per game), recolor.ts (looks: dyes, skin, armour materials; gear dyes).
  src/net/           Prediction, Interpolation, loadout.ts (bar/look of a synced player).
  src/ui/            Hud (bars, skill slots, level/XP), Book (I/C/K/T: character, bag, skills, talents,
                     weapon), Progression (level-ups, new-skill cards, tutorial), itemIcons/itemText, Mastery, pixelIcons.ts (24 px skill icons from each
                     skill's shape + main effect, shown at 2×; the title mark),
                     menu/ (Menu: title, characters, creation, lobby; Preview: live paper doll; characters.ts).
  src/audio/         AudioDirector (buses, crossfades, positional effects).
  public/assets/     Generated sprites (atlases with pivots), chars/ (one WebP atlas per path×body and
                     per Greyed, index.json), audio — committed.
desktop/  Electron shell (embedded server, UPnP/host report, app:// protocol). From Dinusie.
tools/
  pixellab/ PixelLab REST tooling + generated frames (src/), pack.py (atlases + anchors), derive.py (free
          clips), clean.py (strips baked-in effects), anchors.py (+ anchor_picks.json: hands picked by
          eye on numbered candidates), parts.py (gear as letter grids, RotSprite angles).
  art/    render.py (props), characters.py (players + Greyed), mh_fetch.py / mh.py (MakeHuman bodies),
          outfits.py (path outfits, hair, weapons, Greyed), anims.py (poses), models.py, materials.py,
          decals.py, ground.py, common.py.
  audio/  build.py (music, ambience, effects, combat sounds).
  fx/     build.py (skill-effect pixel animations in element palettes → client/public/assets/fx/spells.*).
  catalogue/ catalogue.ts (writes docs/catalogue.md).
  e2e/    play.cjs (two Electron windows host/join and fight at the courtyard), act1.cjs (every Act 1 area
          from a story save, the cells from the start), moves.cjs / skills.cjs (+ moves_sheet.py: every
          move and every skill's effect filmed, in slow motion), gore.cjs (each kind of death), menu.cjs (walks the menus, creation,
          lobby, mastery panel), gallery.cjs (every skill's shape, page by page), icons.cjs (every icon on
          one sheet); screenshots in tools/e2e/out.
```

## Commands

```
pnpm install
pnpm dev            # the desktop app with hot reload (server + Vite + Electron window)
pnpm test           # vitest
pnpm e2e            # Electron end-to-end: host + join windows, prolog skip, a fight (Linux: xvfb-run -a pnpm e2e)
pnpm typecheck      # tsc in every package
pnpm desktop        # build client + run Electron
pnpm dist:win       # Windows portable .exe + installer (CI does this on push to main)
pnpm art            # re-render props + ground (needs: pip install bpy numpy pillow)
pnpm art:pack       # pack PixelLab frames (tools/pixellab/src) into atlases; bodies: add --palette tools/pixellab/body_palette.json
                    # tools/pixellab/: api.py (REST client; the token is injected by the environment's proxy),
                    # queue.py (one job at a time, skips what exists), derive.py (free idle/hit/death/roll),
                    # ids.json (everything generated, so nothing is paid for twice)
python tools/pixellab/parts.py      # gear atlas (client/public/assets/gear)
python tools/pixellab/anchors.py body_male body_female && pnpm art:pack --palette tools/pixellab/body_palette.json body_male body_female
node tools/e2e/menu.cjs / gallery.cjs / icons.cjs   # after building client + desktop; under xvfb-run on Linux
pnpm catalogue      # regenerate docs/catalogue.md
pnpm audio          # re-synthesise audio (needs: numpy + ffmpeg)
python3 tools/fx/build.py   # skill-effect sprites (+ tools/fx/out/sheet.png); gallery: SEEK_MS=120 node tools/e2e/gallery.cjs
```

Automated checks drive the real Electron app (`tools/e2e/play.cjs`, Playwright's `_electron`): the
shell passes `ASH_TEST_PARAMS` (e.g. `autohost=1&name=A&path=thorn&body=male`, or
`autojoin=1&address=localhost`) to the page, and `ASH_USER_DATA` gives each window its own profile.
`window.__room` and `window.__game()` exist for these checks. Under xvfb/CI Chromium needs software WebGL
(`--use-gl=angle --use-angle=swiftshader`), which the harness passes.

Art renders are cached in `tools/art/.cache` (gitignored); pass `--force` or delete it after changing a
model. MakeHuman assets come from `python tools/art/mh_fetch.py` (gitignored `tools/art/.mh`). In bpy,
`import bpy` must come before `import bmesh`. Character frame counts come from each atlas's meta
(`pack.py` writes them), so nothing is hard-coded. `python tools/art/render.py props` or `chars` renders one group. The Blender module lives in a
venv here (`/home/user/.venvs/art`); on another machine `pip install bpy numpy pillow` (Python 3.13).

## Conventions

- **Server owns all state.** Clients send intent (`MSG.input` frames, `MSG.skip`), never results.
  Anything a late joiner must see (cinematics, votes) is **schema state**, not a one-shot message.
- **Content is data** (maps as code, props, cinematics); **numbers in `balance.ts`** with a reason.
- **Art contract:** world +x is screen right, +y screen down, 1 cell = 64 screen px (32 art px);
  every atlas frame carries its pivot (ground origin) so the game just places it. Prop footprints must
  match `shared/src/data/props.ts`. Blender renders (props, Greyed) use the top-down camera in
  `tools/art/common.py`: 35° from straight down, no yaw, stretched so the ground is square; heights
  are then `Z_PX` = 64·tan 35° ≈ 45 px per unit (`shared/src/view.ts`). Characters render at 1.35× so
  the Greyed stand as tall as the PixelLab players. The ground is numpy-painted squares (`ground.py`).
- **Gear anchors:** NE, E and SE are mirrors of NW, W and SW (pack.py), so body and gear flip together;
  `tools/pixellab/anchors.test.ts` fails if a mirrored anchor drifts or a run loses its steady weapon.
- Cinematic subtitles must pass `validateCinematic` (readable at ~15 chars/s, no overlaps).
- Imports inside `shared/` use `.js` extensions. Server schema uses legacy decorators
  (`experimentalDecorators`, `useDefineForClassFields: false`) — don't remove them.
- Comment the *why*, not the *what*. Every milestone: playable, tests + typecheck green, committed.

## Workflow
Commit per feature on the working branch; pushing to `main` starts the Windows build, so push to `main`
only when the user says so.
