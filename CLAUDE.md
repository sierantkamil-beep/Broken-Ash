# Broken Ash — project guide for Claude

A **2-player online co-op dark-fantasy action RPG** set in a fallen elven realm. Built for exactly two
people (Kamil and his girlfriend). Successor to *Dinusie* (`sierantkamil-beep/dinusie`, final state at the
`dinusie-final` tag), whose engine-level systems will be carried over.

**Current phase: design. No code yet.** The design lives in `docs/design.md`; nothing gets scaffolded
until the two players have reviewed it.

## Decisions

| Topic | Decision | Why |
|---|---|---|
| Genre | Action RPG, free 8-way movement, dodge, aimed skills. Not tile-based. | Dinusie's Tibia foundation was the wrong base. |
| Tone | Dark fantasy: gore, profanity, moral grey, named characters die in the story (Game of Thrones-like). Five acts on the curve normal → downer → cruel → doom → hope → doom & cruelty → hope → **happy ending**. | Dinusie felt made for children; the users chose this curve. |
| Companions | Never die in combat (downed companions get up after the fight); deaths are story events only. | User request. |
| Paths (classes) | 8: 2 melee, 4 magic, 2 ranged. No healers or pure tanks; every path deals damage, sustains itself and has co-op combos. | Always exactly two players; support roles would be boring. |
| Building | Core pillar: the players build, furnish and defend their fortress (Ostoja). | The users love building. |
| Language | Player-facing content in **Polish**; code, comments, docs, data keys in English. | User request. |
| Polish grammar | Avoid gendered verb forms where possible; counts via `plural()`. | Players are different genders; three plural forms. |
| Art | Higher-resolution 2D (isometric or 3/4), painterly or pre-rendered, no visible pixel art. **Free assets only** (CC0, CC-BY, CC-BY-SA); nothing paid. Every external asset gets a license entry in `CREDITS.md`. | User request. |
| Stack (planned) | pnpm workspaces, TypeScript 5.9, Phaser 3.90 (WebGL), Colyseus 0.16 embedded server, Electron Windows .exe, `node:sqlite`. | Same as Dinusie so its systems port over. |
| Security | Hashed passwords (scrypt), no plaintext "remember me", server validates every message. | Dinusie lacked this. |
| Scope | A system is added only when the current slice is fun without it. Every milestone ends with a playtest and a bug pass. | Dinusie's scope creep. |

## Conventions (carried from Dinusie)
- Server owns all state; clients send intent only.
- Content is data; tunable numbers in one balance module with a comment saying why.
- Original names and story; art from credited asset packs.
- Comment the *why*, not the *what*.

## Workflow
Commit per feature. Don't push to `main` without the user's go-ahead.
