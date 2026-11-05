# Broken Ash — history

What each milestone actually built. The plan is `docs/design.md` §11.

### B0 — Scaffold ✅
- **Monorepo** (pnpm: shared, server, client, desktop) on Dinusie's stack. Ported from Dinusie:
  embedded Colyseus server (`startServer`), the Electron shell with UPnP/CGNAT host report and the
  `app://` protocol, the Windows build workflow, the host report UI and address parsing.
- **Free isometric movement** (`shared/src/movement.ts`): screen-relative WASD, acceleration with
  weight, dodge roll (ease-out burst, i-frames, cooldown, stamina), circle-vs-grid collision with
  sliding and anti-tunnelling sub-steps. Deterministic, so it runs on the server and in client
  prediction alike.
- **Netcode**: fixed 60 Hz server step, input frames with sequence numbers, input credit against
  speed hacks, client prediction with reconciliation and smoothed corrections, partner interpolation.
- **Cinematics**: seekable timeline data (camera keys, letterbox, fades, title cards, subtitles,
  actors, events), synced via room state so a late joiner sees the same moment, skip needs both
  votes. The **prolog** (54 s) over the Soramei courtyard.
- **Map**: *Dziedziniec Soramei* (30 × 30) written as code: paths, plaza, gravel garden, koi pond,
  shrine, walls, vermilion gate, lanterns, blossom trees, bamboo, the Greyed dead in their blood.
- **Art pipeline** (`tools/art`): Blender-rendered props (gate, stone and paper lanterns, three
  blossom trees, shrine, walls, rocks, bamboo, Soramei banner, Greyed corpses) with soft contact
  shadows; two convict elves (8 directions × idle/run/roll) from rigid-part models; numpy ground
  painter (flagstones, moss with fallen petals, raked gravel, dirt, water) with seamless 4×4
  super-tiles and feathered borders; painted blood decals; fx sprites (lights, glow, petals, fog).
- **Audio** (`tools/audio`): synthesised in-sen night theme, wind ambience, footsteps on stone/moss,
  dodge, gate impacts, the tree's splitting, gong, UI sounds.
- **Client**: title screen over a drifting view of the courtyard, night lighting with flickering
  lanterns, bloom/vignette, falling petals, drifting fog, props that fade when you walk behind them,
  name tags, stamina bar, area toast, Esc menu (volumes, gore level, raids setting).
