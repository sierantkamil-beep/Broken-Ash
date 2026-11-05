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
| Camera | **Isometric 2:1** (128 × 64 px cells), mouse-wheel zoom within limits. | User decision. |
| Tone | Dark fantasy: gore, profanity, moral grey, named characters die in the story (Game of Thrones-like). Five acts on the curve normal → downer → cruel → doom → hope → doom & cruelty → hope → **happy ending**. | Dinusie felt made for children; the users chose this curve. |
| Culture | Elven realm with **East Asian–inspired aesthetics**, Japanese and Chinese about equally (pagodas, vermilion, lanterns, blossoms, curved blades). Eight peoples with distinct looks, architecture and customs, one per path, each with its own naming style (see design.md "Names"). Royals and priests keep old elven names. Human invaders look European. Invented names and customs only; no real-world gods, clans or fake script. | User request; makes the world unique. |
| Cinematics | Story beats are **in-engine cinematics**: seekable timelines (shared data) synced through room state; both players must vote to skip; no voice acting. | User request ("cinematic actions, not just plain dialogues"). |
| Companions | Never die in combat (downed companions get up after the fight); deaths are story events only. | User request. |
| Paths (classes) | 8: 2 melee, 4 magic, 2 ranged. No healers or pure tanks; every path deals damage, sustains itself and has co-op combos. | Always exactly two players; support roles would be boring. |
| Building | Core pillar: the players build, furnish and defend their fortress (Ostoja). Raids outside the story are a **setting** (on by default). | The users love building. |
| Language | Player-facing content in **Polish**; code, comments, docs, data keys in English. Avoid gendered verb forms where possible; counts via `plural()`. | User request; the two players are different genders. |
| Art | **Our own**: Blender (`bpy`) renders every sprite through the game's iso camera; the ground is painted with numpy. Characters are built on the **MakeHuman CC0** base mesh, skeleton and weights (elven morph, our own outfits per path, skeletal animation). Higher-resolution, no pixel art. Free assets (CC0/CC-BY/CC-BY-SA) allowed only with a `CREDITS.md` entry; **nothing paid**. | User request ("character design was horrible"); uniqueness; no licence risk. |
| Bodies | Each player picks a male or female body; every path is rendered for both. | User request. |
| Combat | Skills are data (aimed shapes + effects + statuses), interpreted by the server; Greyed attacks are telegraphed on the ground; executions, downed/revive, wipes restart the wave. | design.md §5. |
| Audio | **Synthesised into .ogg files** by `tools/audio/build.py` (numpy + ffmpeg); played through Phaser's Web Audio on three buses. | Original, re-tunable, nothing to license. |
| Stack | pnpm workspaces, TypeScript 5.9, Phaser 3.90 (WebGL), Colyseus 0.16 embedded server, Electron Windows .exe. | Same as Dinusie so its systems port over. |
| Netcode | Server-authoritative fixed 60 Hz simulation; the owning client **predicts** with the same `stepBody` and reconciles on every patch; remote players are interpolated 110 ms behind. Input credit (one step per tick) stops speed hacks. | Action combat needs instant movement. |
| Security | Server validates every message (`sanitizeInput`, name sanitising, input credit). When accounts arrive: hashed passwords (scrypt), no plaintext "remember me". | Dinusie lacked this. |
| Scope | A system is added only when the current slice is fun without it. Every milestone ends with a playtest and a bug pass. | Dinusie's scope creep. |

## Layout

```
shared/   Pure logic + data used by both sides (no Phaser/Colyseus/Node imports).
  src/iso.ts         Projection (world cells ↔ screen px), 8 sprite directions, depth.
  src/movement.ts    Body, InputFrame, stepBody (accel, dodge roll, stamina), circle-vs-grid collision.
  src/map.ts         AreaMap, CollisionGrid. src/maps/ maps written as code (MapBuilder).
  src/cinematic.ts   Cinematic timeline types, evaluateCinematic (seekable), validation.
  src/combat/        types.ts (SkillDef, Shape, Effect, StatusId, PathDef), geometry.ts (hit tests).
  src/data/          paths.ts (8 paths × 6 skills), greyed.ts (enemies, waves), props.ts, cinematics.ts.
  src/balance.ts     Every tunable number, each with its reason.
server/   Colyseus. game/World.ts is the network-free simulation (unit tested): Combat.ts (casts,
          projectiles, zones, statuses, damage), Units.ts (Greyed/thrall AI), Pathing.ts (flow fields);
          sim.test.ts is the balance simulation. rooms/WorldRoom.ts mirrors World into the schema.
client/   Phaser 3 + Vite.
  src/scenes/        BootScene (atlases + audio), WorldScene (title drift, play, cinematics).
  src/world/         GroundLayer (baked ground), PropLayer (props, light sources, occlusion fade),
                     Lighting (night multiply + lights), Petals (falling blossom).
  src/net/           Prediction (own player), Interpolation (partner).
  src/cinematic/     CinematicPlayer (camera, DOM overlay, events).
  src/entities/      Character (player sprite & anims), UnitSprite (Greyed, thralls, corpses).
  src/fx/            Vfx (skill visuals, blood, gore, damage numbers), Telegraphs (enemy wind-ups).
  src/assets/        On-demand loading of the character atlases.
  src/ui/            Hud (bars, skill bar, partner, boss, downed), Creator (character creation).
  src/audio/         AudioDirector (buses, crossfades, positional effects).
  public/assets/     Generated sprites (atlases with pivots), chars/ (one WebP atlas per path×body and
                     per Greyed, index.json), audio — committed.
desktop/  Electron shell (embedded server, UPnP/host report, app:// protocol). From Dinusie.
tools/
  art/    render.py (props), characters.py (players + Greyed), mh_fetch.py / mh.py (MakeHuman bodies),
          outfits.py (path outfits, hair, weapons, Greyed), anims.py (poses), models.py, materials.py,
          decals.py, ground.py, common.py.
  audio/  build.py (music, ambience, effects, combat sounds).
  catalogue/ catalogue.ts (writes docs/catalogue.md).
```

## Commands

```
pnpm install
pnpm dev            # server + Vite + Electron window (click "Hostuj grę")
pnpm dev:web        # server + Vite only (browser at :5173)
pnpm test           # vitest
pnpm typecheck      # tsc in every package
pnpm desktop        # build client + run Electron
pnpm dist:win       # Windows portable .exe + installer (CI does this on push to main)
pnpm art            # re-render props + ground (needs: pip install bpy numpy pillow)
pnpm chars          # re-render characters (hours; resumable; python tools/art/characters.py path:body for one set)
pnpm catalogue      # regenerate docs/catalogue.md
pnpm audio          # re-synthesise audio (needs: numpy + ffmpeg)
```

Dev URL shortcut: `http://localhost:5173/?autojoin=1&name=X[&path=thorn&body=male&address=host]` joins directly;
`window.__room` and `window.__game()` exist for automated checks.

Art renders are cached in `tools/art/.cache` (gitignored); pass `--force` or delete it after changing a
model. MakeHuman assets come from `python tools/art/mh_fetch.py` (gitignored `tools/art/.mh`). In bpy,
`import bpy` must come before `import bmesh`. Frame counts per animation live in `tools/art/anims.py`
FRAMES and `client/src/entities/Character.ts` ANIM_FRAMES — keep them equal. `python tools/art/render.py props` or `chars` renders one group. The Blender module lives in a
venv here (`/home/user/.venvs/art`); on another machine `pip install bpy numpy pillow` (Python 3.13).

## Conventions

- **Server owns all state.** Clients send intent (`MSG.input` frames, `MSG.skip`), never results.
  Anything a late joiner must see (cinematics, votes) is **schema state**, not a one-shot message.
- **Content is data** (maps as code, props, cinematics); **numbers in `balance.ts`** with a reason.
- **Art contract:** game world (x, y, z) = Blender (x, −y, z); 1 cell = 1 unit; camera pitch 60°,
  yaw 45°, ortho; every atlas frame carries its pivot (ground origin) so the game just places it.
  Prop footprints in `tools/art/render.py` must match `shared/src/data/props.ts`.
- Cinematic subtitles must pass `validateCinematic` (readable at ~15 chars/s, no overlaps).
- Imports inside `shared/` use `.js` extensions. Server schema uses legacy decorators
  (`experimentalDecorators`, `useDefineForClassFields: false`) — don't remove them.
- Comment the *why*, not the *what*. Every milestone: playable, tests + typecheck green, committed.

## Workflow
Commit per feature on the working branch; pushing to `main` starts the Windows build, so push to `main`
only when the user says so.
