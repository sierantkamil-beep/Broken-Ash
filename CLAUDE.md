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
| Skill VFX | **Exact hit shapes, for now.** Every skill draws the area it really hits (cone wedge, line rectangle, circle at its true radius, bolts as dots the server ends where they stop), flat on the ground in **one accent colour per path** (Thorn vermilion, Bark moss, Blood crimson, Ash ember, Storm pale indigo, Graves lantern teal, Dusk amber, Sting venom green; `ACCENTS` in `client/src/fx/ink/ink.ts`), `client/src/fx/shapes.ts`. Shadow-ink stays the goal: it comes back one effect at a time, drawn over these shapes, never instead of them. Gore keeps its own look. | User decision: the painted ink was "profoundly wrong" (approximate on purpose, so it never matched the hits). |
| Weapons | **Any path can wield any of 9 weapon types**; each path has 2–3 home weapons (+damage and a path rider). The bar is **path 3 + weapon 3**: the weapon gives LMB, RMB and key 1 from its own **mastery tree** (levelled by use, saved on the host); the path gives its 3 signature skills. Weapons and armour are **visible** on the body (anchored parts + armour materials). | User decision. |
| Bodies | Each player picks a male or female body; **one body per sex for every path**, dressed by the path's look and gear. | User request. |
| Combat | Skills are data (aimed shapes + effects + statuses), interpreted by the server; Greyed attacks are telegraphed on the ground; executions, downed/revive, wipes restart the wave. | design.md §5. |
| Audio | **Synthesised into .ogg files** by `tools/audio/build.py` (numpy + ffmpeg); played through Phaser's Web Audio on three buses. | Original, re-tunable, nothing to license. |
| Platform | **Windows desktop app only** (Electron). No browser version: the client is web tech inside Electron, never shipped or played in a browser. | User decision. |
| Stack | pnpm workspaces, TypeScript 5.9, Phaser 3.90 (WebGL), Colyseus 0.16 embedded server, Electron Windows .exe. | Same as Dinusie so its systems port over. |
| Netcode | Server-authoritative fixed 60 Hz simulation; the owning client **predicts** with the same `stepBody` and reconciles on every patch; remote players are interpolated 110 ms behind. Input credit (one step per tick) stops speed hacks. | Action combat needs instant movement. |
| Security | Server validates every message (`sanitizeInput`, name sanitising, input credit). When accounts arrive: hashed passwords (scrypt), no plaintext "remember me". | Dinusie lacked this. |
| Scope | A system is added only when the current slice is fun without it. Every milestone ends with a playtest and a bug pass. **No new systems until B1 is fun and stable** (movement, gear, skill visuals). | Dinusie's scope creep; the visual reset after B1. |

## Layout

```
shared/   Pure logic + data used by both sides (no Phaser/Colyseus/Node imports).
  src/view.ts        Top-down projection (world cells ↔ screen px, CELL = 64), 8 sprite directions, depth.
  src/movement.ts    Body, InputFrame, stepBody (accel, dodge roll, stamina), circle-vs-grid collision.
  src/map.ts         AreaMap, CollisionGrid. src/maps/ maps written as code (MapBuilder).
  src/cinematic.ts   Cinematic timeline types, evaluateCinematic (seekable), validation.
  src/combat/        types.ts (SkillDef, Shape, Effect, StatusId, PathDef), geometry.ts (hit tests).
  src/data/          paths.ts (8 paths: resource, sustain, 3 signature skills, home weapons), weapons.ts
                     (9 weapon types × mastery trees), looks.ts (dyes, skin tones, armour/head/shoulders,
                     validLook), greyed.ts (enemies, waves), props.ts, cinematics.ts.
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
  src/entities/      Character (paper doll: dyed body + gear on anchors), UnitSprite (Greyed, thralls, corpses).
  src/fx/            Vfx (skill visuals, blood, gore, damage numbers), Telegraphs (enemy wind-ups);
                     shapes.ts (exact hit shapes for skills and telegraphs); ink/ (ink painter, skill icons).
  src/assets/        Atlas loading (per game), recolor.ts (looks: dyes, skin, armour materials; gear dyes).
  src/net/           Prediction, Interpolation, loadout.ts (bar/look of a synced player).
  src/ui/            Hud (bars, ink skill icons), Mastery (K panel), icons.ts (ink skill glyphs),
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
  catalogue/ catalogue.ts (writes docs/catalogue.md).
  e2e/    play.cjs (two Electron windows host/join and fight), menu.cjs (walks the menus, creation,
          lobby, mastery panel), gallery.cjs (every skill's shape, page by page); screenshots in tools/e2e/out.
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
node tools/e2e/menu.cjs / gallery.cjs   # after building client + desktop; under xvfb-run on Linux
pnpm catalogue      # regenerate docs/catalogue.md
pnpm audio          # re-synthesise audio (needs: numpy + ffmpeg)
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
  match `shared/src/data/props.ts`. The Blender props and Greyed are still isometric renders (camera
  pitch 60°, yaw 45°) until they are replaced with top-down art; the ground is cut into squares.
- **Gear anchors:** NE, E and SE are mirrors of NW, W and SW (pack.py), so body and gear flip together;
  `tools/pixellab/anchors.test.ts` fails if a mirrored anchor drifts or a run loses its steady weapon.
- Cinematic subtitles must pass `validateCinematic` (readable at ~15 chars/s, no overlaps).
- Imports inside `shared/` use `.js` extensions. Server schema uses legacy decorators
  (`experimentalDecorators`, `useDefineForClassFields: false`) — don't remove them.
- Comment the *why*, not the *what*. Every milestone: playable, tests + typecheck green, committed.

## Workflow
Commit per feature on the working branch; pushing to `main` starts the Windows build, so push to `main`
only when the user says so.
