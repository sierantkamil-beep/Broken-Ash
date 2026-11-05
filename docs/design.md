# Broken Ash — design document (draft 2)

> Status: **for review**. Nothing here is coded yet. Mark up anything you hate; everything is negotiable
> except the pillars.
>
> Draft 2 changes: five acts following the agreed emotional curve, a happy ending, eight paths
> (2 melee, 4 magic, 2 ranged, no healers), building as a core pillar, companions no longer die in
> combat, free assets only.

## 0. Pillars

1. **Two players, one story.** Built for exactly two people in online co-op. Every system assumes a partner.
2. **Dark, adult, consequential.** Gore, swearing, moral grey. Characters you like die, some because of
   your choices. The ending is happy, and it has to be earned.
3. **Action combat that feels heavy.** Free movement, dodging, aimed skills, hits that stagger and splatter.
4. **Build your home.** A fortress you design, furnish, run and defend, which the story keeps threatening
   and which ends up as a town.
5. **Loot you think about.** Fewer items, each one a decision. Nothing in the bag is filler.

### Lessons from Dinusie (what we will *not* do again)
- **Scope creep.** Dinusie grew pets, homes, rifts, expeditions, giants, emotes... and none of them got
  finished properly. Broken Ash adds a system only when the current slice is fun without it.
- **Patching tone after the fact.** The tone and the story curve are fixed here, before content is written.
- **Security as an afterthought.** Passwords get hashed (scrypt), no plaintext "remember me", the server
  validates every message, the guest can't edit the host's save.
- **Bugs piling up.** Every milestone ends with a playtest *and* a bug-fix pass before new features.

---

## 1. World & tone

### The realm: Aeldrith (*Aeldrith*)
For three thousand years the elves of Aeldrith lived under the **World-Ash** (*Jesion Świata*), a tree
whose sap (*Żywica*) kept them young, beautiful and undying. The kingdom was rich, cruel and very sure of
itself.

Nineteen years ago **Queen Ysolde** split the World-Ash with a single axe stroke in front of the whole
court. Nobody knows why. Since then:

- **Elves age.** Lords who were 900 years old and looked 30 now rot within a decade. Vanity turns to
  terror; terror turns to war.
- **The dead don't stay dead.** Anyone who dies near the roots rises again as one of the **Greyed**
  (*Szarzy*): ash-skinned, hungry, half-remembering who they were.
- **Żywica is the only currency that matters.** The last sap is hoarded by the noble houses and bled out of
  the stump by force. Houses murder each other for barrels of it.
- **The priests of the Root** (*Kapłani Korzenia*), led by the **Rootfather** (*Ojciec Korzeni*), preach
  that the tree must be regrown at any price.
- **Humans smell weakness.** The **Iron Margrave Harrow** marches north with siege engines and
  mercenaries, promising "order" to elven peasants who were never given any.

The secret (revealed in Act 4): the World-Ash never gave life for free. Every century it took a **tithe of
elven children** into its roots, and the priests delivered them. Ysolde broke the tree when it asked for
her daughter **Elia**. She is the villain of everyone's story, and she was right.

### Tone rules
| Topic | Rule |
|---|---|
| **Gore** | Yes. Blood splatter stays on the floor, overkill dismembers, executions on staggered enemies, corpses stay in the room. Gore level adjustable in settings (default: full). |
| **Profanity** | Yes, in Polish, used like people actually swear: by soldiers, criminals, frightened people. Nobles insult each other more cleverly. Not every line. |
| **Sex** | Implied, never shown. |
| **Death of named characters** | Yes, often, sometimes because of you. Deaths happen in the **story**, never as random combat losses, and each one changes something later. |
| **Moral choices** | No "good" and "evil" bar. Choices trade one loss for another. |
| **Humour** | Black humour from characters, never from the narrator. The game is grim, not humourless. |
| **Children** | Children can be in danger (the tithe is the plot), but child deaths happen off-screen. |
| **The ending** | Happy. The realm heals, the people who survived get a future, your fortress becomes a town. Who is alive to see it depends on you. |
| **Polish grammar** | Player-facing text avoids gendered forms where possible ("Giniesz"), as in Dinusie. NPCs may address each player with the right form once we know the characters' genders (chosen at creation). |

---

## 2. The player characters

Both players are **Ashbound** (*Popielni*): elven convicts branded with ash on the forehead, which means
they are already legally dead. The game opens with both of you in the dungeons under **Sorrowmere Keep**,
sentenced to the stump: being bled for Żywica until you die.

You pick your own name, look, path and your crime (*Twoja zbrodnia*). The crime is a small backstory
choice (murder, desertion, heresy, theft of sap) that unlocks a few unique dialogue lines and one side quest.

Why two convicts? Because nobody will miss you, so you get sent into every shitty job the story needs.

---

## 3. Story — five acts

### The emotional curve
The whole story follows one agreed shape:

```
Normal → downer → CRUEL → DOOM → Hope → DOOM AND CRUELTY → another ray of hope → Happy ending
```

| Act | Title | Beats | One-line summary |
|---|---|---|---|
| 1 | **Ash on the Forehead** (*Popiół na czole*) | Normal → downer | Escape, a kind lord, a first camp, a first dungeon. Then his home burns and he is summoned to court. |
| 2 | **The Execution Square** (*Plac Ścięć*) | **CRUEL** | Court intrigue in the capital ends with Ithiel's head on a spike. |
| 3 | **The Rot** (*Zgnilizna*) | **DOOM** → Hope | The realm collapses and Hollowmere falls. Then you find a ruined fortress and build a home in it. |
| 4 | **The Ash Feast** (*Uczta Popiołu*) | **DOOM AND CRUELTY** | A massacre inside the walls you built, the children taken for the tithe, the truth about the tree. |
| 5 | **The Tithe** (*Dziesięcina*) | Ray of hope → **Happy ending** | The hated queen becomes your ally. You rebuild, march into the roots, bring the children home and plant a new tree. |

Rough length: 25–30 hours with side quests. Act 1 is the vertical slice.

### Cast — who lives, who dies
Companions **never die in combat**: when they're downed they get back up after the fight. Every death
below is a story event.

| # | Character | Who they are | Fate |
|---|---|---|---|
| 1 | **Lord Ithiel Sorrowmere** | Old honourable warden of the North-Grove. Frees you from the dungeon because he needs people with nothing to lose. Kind, funny, the father figure. | **Always dies in Act 2.** Beheaded on a forged charge. You can't save him, only choose how you spend the day (Choice 1). |
| 2 | **Maeve "Rdza" (Rust)** | Half-elf sellsword, the foulest mouth in the realm, travels with you from Act 1. Comic relief and the most likeable person in the game. | **Dies or lives at Hollowmere** (Choice 2, Act 3). If she lives, she stays to the end. |
| 3 | **Fennick** | 15-year-old squire of Ithiel. Idolises Maeve, follows you after Ithiel's death. | If Hollowmere's lower city was drowned (his family died), he **opens Ostoja's gate to the enemy in Act 4** and dies in the fighting. Otherwise he's knighted in the epilogue. |
| 4 | **Brother Corvane** | Priest of the Root, gentle, helpful, brings you medicine and secrets. | **The traitor.** Forged the charge against Ithiel, plans the Ash Feast. Whether you catch him decides who dies at the feast (Choice 3). |
| 5 | **Prince Taerin** | Ysolde's son, nervous, decent, hates his mother. The heir everyone wants to control. | Dies poisoned at the Ash Feast unless Corvane is exposed. If he lives, he grows into a king worth having. |
| 6 | **Queen Ysolde** | Broke the World-Ash. Cold, brilliant, completely alone. Hunted by everyone, including you, until Act 5. | Becomes your ally in Act 5 (the ray of hope). **Lives** and is reunited with Elia. |
| 7 | **Margrave Harrow** | Human warlord. Brutal, honest, keeps his word. | Enemy in Acts 1–4. In Act 5 he marches with you **if** you spared his scouts in Act 1; otherwise his army stands in your way. |
| 8 | **Gwendr the Ash-Witch** | Ancient elf living in the stump's shadow; the only one outside the priesthood who knows about the tithe. | Joins Ostoja in Act 3. **Always dies in Act 4**, killed by the priests for telling you the truth. |
| 9 | **The Rootfather** | Head of the priesthood. Soft-spoken, sincere, monstrous. | The final villain. Takes the children in Act 4; dies at the roots in Act 5. |
| 10 | **Elia** | Ysolde's daughter, alive and trapped in the roots for nineteen years. Heard only as a voice until the end. | **Lives.** Rescued in the finale. |

### Act 1 — "Ash on the Forehead" (*Popiół na czole*) — Normal → downer — the vertical slice
1. **The Stump.** Prison escape tutorial under Sorrowmere: fight the Greyed in the bleeding-cells, learn
   dodging, find your first weapon on a dead guard. Ithiel's men break you out on purpose.
2. **The Warden's Hounds.** Ithiel recruits you as deniable agents and gives you a burned-out farmstead.
   **First building:** palisade, tents, a workbench, a garden bed (the building tutorial). Maeve joins.
3. **The Drowned Sap-Mine** (*Zatopiona Kopalnia Żywicy*), the first dungeon: a noble house was secretly
   bleeding captives here. Captives you save move into your farmstead.
4. **Harrow's Scouts.** First taste of the human army. Choice: execute the captured scouts or let them go.
   Harrow remembers, and it decides Act 5.
5. **Downer.** You come back to find the North-Grove burned by royal troops. Ithiel is summoned to the
   capital and goes willingly, sure that the truth will protect him. You go with him. The farmstead is
   abandoned.

### Act 2 — "The Execution Square" (*Plac Ścięć*) — CRUEL
- The capital **Lirendhal**: beautiful, rotting, full of old elves who are suddenly afraid of dying.
  Hideout in a brothel cellar (small building: beds, a stash, an alchemy corner).
- Intrigue quests: Corvane helps you hunt for proof of Ithiel's innocence. Each lead is a dungeon or a
  heist (the royal catacombs, a noble's sap vault).
- The trial is a farce; the proof you found is "lost" (by Corvane, though you don't know it yet).
- **Execution day — Choice 1:** try to free Ithiel (a hopeless fight in the plaza: you lose, Maeve is
  scarred, you're hunted for the rest of the act) **or** stay hidden in the crowd and watch (you keep
  your cover; Fennick never forgives you). Either way his head comes off, and his body hangs at the gate.
- You flee the capital with nothing.

### Act 3 — "The Rot" (*Zgnilizna*) — DOOM → Hope
- **Doom.** The noble houses go to open war, the Greyed multiply, Harrow takes the southern forests.
- **Siege of Hollowmere — Choice 2:** hold the river gate with Maeve while refugees escape (Maeve dies
  covering your retreat; you see it happen) **or** break the dam and flood the lower city, drowning
  Harrow's army *and* about 2000 refugees (Maeve lives; Fennick's family dies; the drowned rise as Greyed
  later). Hollowmere falls either way.
- **Hope.** Survivors lead you to **Ostoja**, a ruined border fortress. You make it yours: clear it,
  rebuild the walls, bring in the refugees, recruit a smith, an alchemist, a quartermaster. This is where
  the building system opens up fully (§7).
- Prince Taerin escapes the capital and comes to you. Gwendr arrives with half the truth.
- **End of act:** the first real victory. A wave of Greyed hits Ostoja and breaks on the walls you built.
  People cheer. For a while, things are good.

### Act 4 — "The Ash Feast" (*Uczta Popiołu*) — DOOM AND CRUELTY
- Taerin is to be crowned at Ostoja, with houses invited to swear to him. You prepare the feast in your
  own great hall.
- Throughout Acts 2–4 you can find **clues** (letters, a forged seal, a poisoner's receipt). **Choice 3:**
  accuse Corvane before the feast with enough evidence and he dies, Taerin lives. Without it, the feast
  becomes a massacre: Taerin dies screaming, half the guests are poisoned, and you fight through your own
  hall.
- Either way, the Root's priests use the chaos to **take Ostoja's children** for a new tithe. Parts of
  Ostoja burn. If the refugees were drowned, Fennick opens the gate for the enemy and dies.
- Gwendr tells you the whole truth about the tree and is killed for it.
- The act ends at the lowest point of the game: your home half-burned, the children gone, the one person
  who knew the way dead.

### Act 5 — "The Tithe" (*Dziesięcina*) — another ray of hope → Happy ending
- **Ray of hope.** Queen Ysolde comes to Ostoja alone and unarmed. She knows the roots, she knows the
  Rootfather, and she has heard Elia's voice for nineteen years. She becomes your ally.
- **Rebuild.** You rebuild and fortify Ostoja as a war base. Harrow marches with you if you spared his
  scouts; otherwise you have to break his army first.
- **The Roots** (*Korzenie*), the final dungeon: down through the stump into the tree's living roots,
  where the old tithes are still half-alive.
- **The Rootfather**, fused with the stump, is the final boss.
- **Happy ending.** The children are carried out alive. Elia is freed. Ysolde plants a new seed grown from
  Elia's sap: a tree that **takes no tithe**. Elves will age now, but the Greyed finally rest.
- **Epilogue:** Ostoja grows into a town built around the fortress you designed. Everyone you kept alive
  is there: Maeve drinking, Taerin crowned or a council in his place, Fennick knighted, Harrow's banner
  over the southern road. The epilogue shows your actual buildings.

---

## 4. Paths (classes)

Eight **paths** (*Ścieżki*), so the Polish names stay gender-neutral: **2 melee, 4 magic, 2 ranged.**

**No healers, no pure tanks.** There are always exactly two of you, so nobody should spend the game
watching the other's health bar. Every path:
- deals real damage and can solo a fight;
- has its own sustain (lifesteal, shields, regeneration);
- has 2–3 **co-op combo** skills that do something extra with the partner's effects (detonate their
  bleeds, ignite their poison, pull enemies into their area). Supporting means making the partner's hits
  better, not keeping them alive.

Reviving a downed partner is universal (hold F), not a class skill.

| Path | Type | Fantasy | Resource | Sustain |
|---|---|---|---|---|
| ★ **Path of the Thorn** (*Ścieżka Ciernia*) | Melee | Dual blades, bleeds, finishers that dismember. Fast and fragile, lives on dodging. | Fury, builds on hits | Heals from bleed ticks |
| **Path of Bark** (*Ścieżka Kory*) | Melee | Heavy two-handed weapons, roots, thorny armour. Slow, huge hits, hard to kill. | Stamina | Bark shield that grows with damage taken |
| ★ **Path of Blood** (*Ścieżka Krwi*) | Magic | Blood mage: pays **health** for spells, drinks from wounds. Very gory. | Health | Drinks from bleeding enemies |
| **Path of Ash** (*Ścieżka Popiołu*) | Magic | Fire and ash: burning ground, explosions, area denial. | Heat (overheat = backfire) | Burning enemies drop embers that heal |
| **Path of Storm** (*Ścieżka Burzy*) | Magic | Lightning and wind: the most mobile caster, chains, blinks, knock-ups. | Charge, built by moving | Static shield |
| **Path of Graves** (*Ścieżka Grobów*) | Magic | Raises the Greyed to fight for you; corpses are resources. | Ash, gathered from corpses | Drains life from minions |
| **Path of Dusk** (*Ścieżka Zmierzchu*) | Ranged | Longbow, stealth, traps, headshots from the dark. | Focus | Stealth regenerates health |
| **Path of the Sting** (*Ścieżka Żądła*) | Ranged | Throwing knives, javelins, blowpipe darts, poisons. Mid-range and always moving. | Poison doses | Antidote reflex: cleanses and heals |

★ = in the vertical slice. Thorn × Blood is the first combo: Blood drinks from enemies the Thorn has bled.

### Carried over from Dinusie (the parts you liked)
- **Skill pool → loadout.** About 12 skills per path, 6 on the bar (fewer than Dinusie's 8, since action
  combat needs fewer buttons). Unlocked by level and by story moments.
- **Talent tree.** Three branches per path, tiers with choice-of-one rows and a **keystone** at the bottom
  that changes how you play (e.g. Thorn: "bleeds can be detonated").
- **Skill evolution.** Every skill gains **mastery** by use. At rank 2 you pick one of two **forks**, at
  rank 3 you master it. Forms change the shape, look and sound of the skill, not just numbers. Evolution
  costs **Żywica**, so your power depends on the resource the whole war is about.

---

## 5. Combat

- **Movement:** WASD, free 8-way movement (no tiles). Mouse aims. Camera: isometric or 3/4 top-down
  (decided with the art, §9).
- **Buttons:** LMB basic attack, RMB + 1–5 skills, **Space = dodge roll** with short invulnerability,
  Q/E consumables, F interact / execute / revive, B build mode.
- **Stamina:** dodging and heavy attacks cost stamina. You can't spam rolls.
- **Poise & stagger:** enemies have a poise bar; break it and they stagger. A staggered enemy can be
  **executed** (F): a short brutal animation, guaranteed gore, both players heal a little.
- **Telegraphs:** enemy attacks are readable (wind-up, ground markers for big hits). Bosses are learned,
  not out-geared.
- **Gore:** blood decals per hit that stay for the whole visit, dismemberment on overkill, corpses stay
  (and matter: Path of Graves uses them; some enemies eat them).
- **Downed & revive:** at 0 HP you're downed and bleeding out for 20 s. The partner revives by holding F.
  Both downed = back to the last bonfire (*Ognisko*), enemies reset. Companions downed in a fight get
  up when it ends.
- **Friendly fire:** off. (Could be a hard-mode toggle later.)
- **Netcode:** server-authoritative as in Dinusie, plus client-side prediction for your own movement and
  dodge so it feels instant at Tailscale latency.

---

## 6. Items — every slot is a decision

### Equipment
Slots: weapon (main + off-hand or two-handed), head, chest, hands, legs, boots, amulet, 2 rings,
**relic**.

- **Rarity:** common (grey), fine (white), rare (blue), **ashen** (red, uniques).
- **Affixes:** 1–4 random affixes on fine/rare items, drawn from a pool per slot. Fewer, stronger
  affixes than Dinusie: "+15% bleed damage", not "+1 strength".
- **Ashen uniques** change how a skill *works* (e.g. *Kaelith's Gutting Knife*: your dodge leaves a
  bleeding cut in the ground). Each is tied to a place or person in the story.
- **Relics** are powerful with a curse attached (e.g. +30% damage, but your partner can't revive you).
  The trade-off is the point.
- **Comparison tooltip** always shows what changes vs. what you wear.

### Inventory with weight
A **grid inventory** (items take 1×1 to 2×4 cells), so a big axe and a stack of herbs compete for space.
No infinite bag. Storage at Ostoja is as big as the storehouses you build. You decide what to carry back.

### Salvage & crafting
- Any item can be **salvaged** into materials (iron, leather, bone, sap-wood, ash-glass).
- The **smith** at your base upgrades item level, rerolls *one* affix, or forges a socket. A better
  smithy building unlocks better work.
- **Runes** (dungeon drops) go into sockets and modify skills ("Blood Lance pierces").

### Alchemy — herbs and seeds that matter
Dinusie's seeds were filler. Here, herbs are the alchemy system:
- **Gather** herbs in the world (each region has its own; some only at night, some only off corpses, like
  *grave-moss*).
- **Brew** at the alchemy lab you build:
  - **Potions:** healing (slow, big) vs. salve (instant, small), a real choice.
  - **Poisons and oils:** coat your weapon for a fight (fire oil vs. the Greyed, poison vs. humans).
  - **Bombs:** fire, smoke (lose aggro, revive your partner safely), shrapnel.
  - **Draughts:** temporary skill-modifying elixirs (e.g. night-sight for dark dungeons).
- **Seeds** grow in garden plots and greenhouses you build, over **in-game days**. Rare seeds (found in
  dungeons) grow the only ingredients for the strongest brews. Gardens can burn in raids and in Act 4.
- **Belt:** only 4 consumable slots, refilled from the bag only at bonfires. You pick a loadout before a
  dungeon.

### Gold
Gold buys things the story cares about: **bribes** in dialogue (free a prisoner, buy a guard, buy a clue),
building materials you can't gather, the smith's rerolls, mercenaries for Ostoja's walls.

---

## 7. Building — Ostoja

Building is a core pillar. It grows in three steps with the story:
- **Act 1:** the farmstead, a small camp (the building tutorial).
- **Act 2:** a hideout in the capital, interior only.
- **Acts 3–5:** **Ostoja**, a whole fortress and the town around it.

### What you build
- **Structure:** foundations, floors, walls, doors, gates, stairs, roofs, a second storey. Free placement
  on a fine snapping grid, with rotation. Material tiers: wood → stone → ash-glass. Better tiers look
  better and survive raids.
- **Workshops** that unlock systems:
  - **smithy:** upgrades, rerolls, sockets;
  - **alchemy lab:** brewing;
  - **garden plots and greenhouse:** growing seeds;
  - **storehouse:** storage space;
  - **chapel:** talent respec;
  - **map table:** fast travel and expeditions.
- **Homes:** every recruited NPC needs a bed and a house. No room, no recruit. Bigger houses keep people
  happier and working better.
- **Defences:** palisades, stone walls, towers, gatehouses, spike pits, braziers. Guard posts where NPC
  guards stand.
- **Decoration:** furniture, carpets, banners, lighting (torches matter in a dark game), boss trophies,
  and each player's own room to furnish however they like.

### How it plays
- **Build mode (B):** a ghost preview shows where a piece goes, green or red. Placing costs materials;
  removing refunds most of them.
- **Materials** come from gathering (wood, stone, clay), salvage, dungeons and gold. Workshops staffed by
  NPCs also produce materials over time.
- **Co-op:** both of you build at the same time from shared storage. **Blueprints** let you save a building
  and place it again.
- **Defence:** Ostoja gets attacked:
  - in story sieges (end of Act 3, Act 4, Act 5);
  - in occasional raids by the Greyed or bandits, if the setting is on.
  - During an attack you fight in the action combat while your walls, towers, traps and guards hold the
    line. Damaged pieces need repairs.
- **Field building:** a small kit you can use anywhere: barricades, spike traps, bridges over gaps. Some
  dungeon puzzles use it.
- **Story weight:** the Act 4 feast takes place in the great hall you built, and the fire burns parts of
  what you made. In Act 5 you rebuild it. The epilogue shows your town.

### Rules so it stays fun
- No upkeep timers or decay. Damage only comes from attacks.
- The story never destroys everything. Act 4 burns chosen districts, and rebuilding them is cheaper.
- Building is never required to finish a dungeon. It makes you stronger and richer, and it is where you
  live.

---

## 8. Dungeons

The dungeons were Dinusie's best part, so their mechanics come over intact:
- **Gates** opened by **levers** (timed windows), **pressure plates** that need both players,
  **tablets** with symbol puzzles, **pylons** that shield a boss until destroyed, "use" objects, clues.
- **New for free movement:** traps (spike floors, swinging blades, collapsing floors, all with gore),
  darkness where only torches and spells light the room, ambush rooms that lock until cleared, and
  field-building puzzles (bridge a gap, barricade a corridor against a horde).
- Each dungeon: 3–5 rooms of fighting, 1–2 puzzle rooms, a mini-boss, a boss with phases and telegraphs,
  and a story reveal at the end.
- **Vertical slice dungeon: the Drowned Sap-Mine** (*Zatopiona Kopalnia Żywicy*): flooded tunnels, sap
  pumps you have to restart in sync, bled captives in cages (save them and they move into your
  farmstead). Boss: **the Tapper** (*Upuszczacz*), a noble's overseer stitched to his own sap-pump.

---

## 9. Art direction

**Goal:** higher-resolution 2D, painterly or pre-rendered, dark palette. **No visible pixel art.**
Characters about 96–128 px tall on a 1080p screen (Dinusie's were 32 px).

**Only free assets.** Allowed licenses: CC0, CC-BY, CC-BY-SA (and GPL-compatible art). Nothing bought,
and nothing whose license forbids redistribution. Every asset gets a line in `CREDITS.md` (author, link,
license, changes).

### Shortlist
| Option | What | License | Pros | Cons |
|---|---|---|---|---|
| **A. Flare art** | Isometric, pre-rendered from 3D. Heroes with paper-doll equipment, many monsters, tilesets, UI. Its repo ships the **Blender source files** (`art_src`). | **CC-BY-SA 3.0** ([flare-game](https://github.com/flareteam/flare-game)) | Complete and consistent, with a Diablo-like look. The Blender sources mean we can re-render at **higher resolution** and add our own poses and gore. | Human-looking, generic medieval: elves need new ears and recolours. Share-alike: modified *art* stays CC-BY-SA (code stays MIT). Few building pieces. |
| **B. 3D → 2D pipeline** | Free CC0 3D models and modular kits (Quaternius characters, Kenney castle/town kits and others) plus free Mixamo animations, rendered in Blender to 8-direction sprites and building pieces. | CC0 models; Mixamo is free to use in games | Any resolution, unlimited animations, perfectly consistent. **Modular kits are ideal for the building system.** Gore variants are easy. Diablo 2 was made this way. | Most up-front work: a render script and a lighting setup. Elves still need head/ear edits. |

Gore decals (blood pools, splatter, gibs) can come from either option (rendered in B) or from a CC0 pack
on OpenGameArt.

**Recommendation:** use **B for building pieces and props** (modular kits are exactly what building
needs) and **A for characters and monsters** at the start. Look at it in-game together, then move
characters to B too if Flare's style doesn't fit. Both produce the same isometric sprites, so switching
is a content change, not a code rewrite.

### Audio
Keep Dinusie's audio engine (buses, limiter, positional panning) and procedural SFX where they fit (hits,
blood, footsteps). Music and ambience should be darker and more "real": free CC0/CC-BY ambient tracks or
dark-folk loops, credited.

---

## 10. Tech (summary — details in CLAUDE.md once we scaffold)

Same stack as Dinusie so the good code carries over: pnpm workspaces, TypeScript, Phaser 3.90 (WebGL),
Colyseus 0.16 (embedded server: *Hostuj grę* / *Dołącz* + IP), Electron Windows .exe, `node:sqlite`.

- **Carried over:** networking & hosting, desktop shell + Windows build, persistence, skill/effect/status
  pipeline, talent engine, skill evolution, dungeon mechanics, quest & cutscene-dialogue engine,
  `plural()`, audio engine.
- **Rewritten:** movement & collision (continuous positions, circle colliders), skill targeting (aimed
  cones, lines, circles), client-side prediction, isometric renderer.
- **New:** grid inventory, crafting/alchemy, building (placement grid, structures with health, NPC housing
  and jobs, raids), choice & consequence flags (`story.flags`), companion AI, gore system.

---

## 11. Milestones

| # | Milestone | Done when |
|---|---|---|
| **B0** | Scaffold | Engine ported, two players move freely in a test room over IP, tests + typecheck green. |
| **B1** | Combat slice | Thorn and Blood with 6 skills each, dodge, stamina, poise, executions, gore, 3 enemy types, 1 boss. *Playtest: is fighting fun?* |
| **B2** | Items & alchemy | Grid inventory, affixes, 3 ashen uniques, salvage, herbs → potions/oils/bombs, belt. |
| **B3** | Building basics | Build mode, walls/floors/doors/roofs in wood, workbench, garden plots, storage, decoration, blueprints, saved on the host. *Playtest: is building fun on its own?* |
| **B4** | Vertical slice | Act 1 complete: prison escape, Ithiel, Maeve, the farmstead, the Drowned Sap-Mine, Harrow's scouts, the downer ending. Talent trees + evolution for Thorn and Blood. *Playtest: do we care about Ithiel?* |
| **B5** | Act 2 + 2 paths | The capital, the hideout, intrigue dungeons, the execution (Choice 1). Bark and Dusk. |
| **B6** | Act 3 + Ostoja + 2 paths | Hollowmere (Choice 2), Ostoja's full building (stone tiers, workshops, NPC homes and jobs, defences, sieges). Ash and Sting. |
| **B7** | Act 4 + 2 paths | The Ash Feast (Choice 3), the burning, the taken children. Graves and Storm. |
| **B8** | Act 5 & ending | Ysolde, the rebuild, the Roots, the Rootfather, the happy ending, an epilogue built from your town and your choices. |
| **B9** | Polish & ship | Balance, settings (gore level, raids on/off, volumes, keybinds), bug pass, hosting tested end-to-end. |

Every milestone ends with a playtest and a bug-fix pass before the next one starts.

---

## Open questions for you two
1. Isometric or 3/4 top-down camera? (Both art options are isometric by default.)
2. Is the five-act curve right? Is Act 4 cruel enough? Is Act 5 hopeful enough?
3. Should Ostoja's raids outside the story be on by default, off, or a setting?
4. Building: is a second storey enough, or do you want cellars and multi-level castles?
5. Which path does each of you want to play first? (The slice has Thorn + Blood.)
