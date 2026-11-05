# Broken Ash — design document (draft 1)

> Status: **for review**. Nothing here is coded yet. Mark up anything you hate; everything is negotiable
> except the four pillars.

## 0. Pillars

1. **Two players, one story.** Built for exactly two people in online co-op. Every system assumes a partner.
2. **Dark, adult, consequential.** Gore, swearing, moral grey. Characters you like can and will die, and
   some of those deaths are your fault.
3. **Action combat that feels heavy.** Free movement, dodging, aimed skills, hits that stagger and splatter.
4. **Loot you think about.** Fewer items, each one a decision. Nothing in the bag is filler.

### Lessons from Dinusie (what we will *not* do again)
- **Scope creep.** Dinusie grew pets, homes, rifts, expeditions, giants, emotes... and none of them got
  finished properly. Broken Ash adds a system only when the vertical slice is fun without it.
- **Patching tone after the fact.** The tone is fixed here, before any content gets written.
- **Security as an afterthought.** Passwords get hashed (scrypt), no plaintext "remember me", the server
  validates every message, the host's save can't be edited by the guest.
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
- **Żywica is the only currency that matters.** The last sap is hoarded by the noble houses and
  bled out of the stump by force. Houses murder each other for barrels of it.
- **Humans smell weakness.** The **Iron Margrave Harrow** marches north with siege engines and
  mercenaries, promising "order" to elven peasants who were never given any.

The secret (revealed in Act 3): the World-Ash never gave life for free. Every century it took a **tithe of
elven children** into its roots. Ysolde broke it when it asked for her daughter. She is the villain of
everyone's story, and she was right.

### Tone rules
| Topic | Rule |
|---|---|
| **Gore** | Yes. Blood splatter stays on the floor, overkill dismembers, executions on staggered enemies, corpses stay in the room. Gore can be lowered in settings (default: full). |
| **Profanity** | Yes, in Polish, used like people actually swear: by soldiers, criminals, frightened people. Nobles insult each other more cleverly. Not every line. |
| **Sex** | Implied, never shown. |
| **Death of named characters** | Yes, often, sometimes because of you. Deaths are never random flavour: each one changes something later. |
| **Moral choices** | No "good" and "evil" bar. Choices trade one loss for another. |
| **Humour** | Black humour from characters, never from the narrator. The game is grim, not humourless. |
| **Children** | Children can be in danger and the tithe is a plot point, but child deaths happen off-screen. |
| **Polish grammar** | Player-facing text avoids gendered forms where possible ("Giniesz"), as in Dinusie. NPCs may address each player with the right form once we know the characters' genders (chosen at creation). |

---

## 2. The player characters

Both players are **Ashbound** (*Popielni*): elven convicts branded with ash on the forehead, which means
they are already legally dead. The game opens with both of you in the dungeons under **Sorrowmere Keep**,
sentenced to the stump: being bled for Żywica until you die.

You pick your own name, look, class and your crime (*Twoja zbrodnia*). The crime is a small backstory
choice (murder, desertion, heresy, theft of sap) that unlocks a few unique dialogue lines and one side quest.

Why two convicts? Because nobody will miss you, so you get sent into every shitty job the story needs.

---

## 3. Story — three acts

Rough length: ~20–25 hours for both acts of content combined with side quests. Act 1 is the vertical slice.

### Cast (who lives, who dies)

| # | Character | Who they are | Fate |
|---|---|---|---|
| 1 | **Lord Ithiel Sorrowmere** | Old honourable warden of the North-Grove. Frees you from the dungeon because he needs people with nothing to lose. Kind, funny, the father figure. | **Dies at the end of Act 1, always.** Executed at the royal court on a forged charge. Players can't stop it — they can only choose what they do on the day (see Choice 1). |
| 2 | **Maeve "Rdza" (Rust)** | Half-elf sellsword, the foulest mouth in the realm, travels with you from Act 1 ch. 2. Comic relief and the most likeable person in the game. | **Dies or lives at the Siege of Hollowmere** (Choice 2). Can also die permanently in battle if left downed. |
| 3 | **Fennick** | 15-year-old squire of Ithiel. Idolises Maeve, follows you after Ithiel's death. | Lives if Hollowmere's lower city is spared; otherwise turns on you in Act 3 (his family drowned). |
| 4 | **Brother Corvane** | Priest of the Root, gentle, helpful, brings you medicine and secrets. | **The traitor.** Forged the charge against Ithiel. Whether you catch him decides the Ash Feast (Choice 3). |
| 5 | **Prince Taerin** | Ysolde's son, nervous, decent, hates his mother. The heir everyone wants to control. | Dies poisoned at the Ash Feast unless Corvane is exposed. If he lives, Act 3 has to deal with what kind of king he becomes (he isn't a good one). |
| 6 | **Queen Ysolde** | Broke the World-Ash. Cold, brilliant, completely alone. | Final choice: kill her, or let her finish what she started (Choice 4). |
| 7 | **Margrave Harrow** | Human warlord. Brutal, honest, keeps his word. | Enemy in Acts 1–2, possible ally in Act 3, depending on how you treated his men. |
| 8 | **Gwendr the Ash-Witch** | Ancient elf living in the stump's shadow; the only one who knows the tithe. | Dies giving you the truth at the start of Act 3 (the price of the knowledge, not your choice). |

### Act 1 — "Ash on the Forehead" (*Popiół na czole*) — the vertical slice
1. **The Stump.** Prison escape tutorial under Sorrowmere: fight Greyed in the bleeding-cells, learn
   dodging, find your first weapon on a dead guard. Ithiel's men break you out — on purpose.
2. **The Warden's Hounds.** Ithiel recruits you as deniable agents. Maeve joins. First dungeon:
   **the Drowned Sap-Mine** (*Zatopiona Kopalnia Żywicy*) — a house was secretly bleeding captives here.
3. **Harrow's Scouts.** First taste of the human army. Choice: execute the captured scouts or let them go
   (Harrow remembers; this feeds Act 3).
4. **The Court.** You escort Ithiel to the capital, **Lirendhal**. Corvane helps. Ithiel is arrested for
   treason.
5. **Execution day.** **Choice 1:** try to free Ithiel (a hopeless fight in the plaza — you lose, Maeve
   gets scarred, you're hunted in Act 2) **or** stay hidden in the crowd and watch (you keep your cover;
   Fennick never forgives you). Either way his head comes off. Fade to black. End of Act 1.

### Act 2 — "The Rot" (*Zgnilizna*)
- Houses go to open war; the Greyed multiply; Harrow takes the southern forests.
- You build a **camp** (see §7) out of survivors and deserters.
- **Siege of Hollowmere — Choice 2:** hold the river gate with Maeve while refugees escape (Maeve dies
  covering your retreat; you see it happen) **or** break the dam and flood the lower city, drowning
  Harrow's army *and* ~2000 refugees (Maeve lives; Fennick's family dies; the drowned rise as Greyed in Act 3).
- **The Ash Feast — Choice 3:** throughout Act 2 you can find **clues** (letters, a forged seal, a
  poisoner's receipt). If you have enough and accuse Corvane at the feast, he dies and Taerin lives. If
  you don't, the feast becomes a massacre: Taerin dies screaming, half the court is poisoned, and you
  fight your way out through the hall.

### Act 3 — "The Tithe" (*Dziesięcina*)
- Gwendr tells you the truth about the World-Ash and dies doing it.
- You march on the stump with whoever is still alive (Maeve, Fennick, Taerin, Harrow's men — or not).
- Ysolde is at the roots, trying to burn them for good so the tree can never be regrown.
- **Choice 4 (the ending):**
  - **Kill Ysolde and regrow the World-Ash.** Elves become immortal again; the tithe returns. If
    Taerin is alive he's crowned and pays the first tithe. Bitter "victory".
  - **Help Ysolde burn the roots.** The elves will age and die like humans; the Greyed fall still. The
    realm is ruined but free. Harrow (if allied) takes the south.
  - **Hidden third option** — one of you becomes the new heart of the tree (the player who chooses
    sacrifices their character; the epilogue is told by the other). Only available if both players agree.
- Epilogue slides show what happened to everyone, based on all four choices.

### Companion death in battle
Named companions fight with you. If one is downed and nobody reaches them within **10 seconds**, they die
for good — their story lines are rewritten around their absence. It makes losing someone your own fault
and gives "anyone can die" a mechanical meaning. (Can be switched off for the story-critical ones if it
turns out too harsh.)

---

## 4. Classes — elven paths

Classes are **paths** (*Ścieżki*), so the Polish names stay gender-neutral. Two are in the vertical slice
(marked ★), the rest arrive later.

| Path | Role | Fantasy | Resource |
|---|---|---|---|
| ★ **Path of the Thorn** (*Ścieżka Ciernia*) | Melee DPS | Dual blades, bleeds, finishers that dismember. Gets stronger the more blood is on the floor. | Fury, builds on hits |
| ★ **Path of Blood** (*Ścieżka Krwi*) | Caster | Blood mage: pays **health** for spells, heals by drinking from wounds. Ranged, fragile, very gory. | Health |
| **Path of Bark** (*Ścieżka Kory*) | Tank | Shield, roots, thorny armour, protects the partner. | Stamina |
| **Path of Dusk** (*Ścieżka Zmierzchu*) | Ranged | Longbow, traps, poison arrows, stealth. | Focus |
| **Path of Graves** (*Ścieżka Grobów*) | Summoner | Raises the Greyed to fight for you; corpses are resources. | Ash (gathered from corpses) |

### Carried over from Dinusie (the parts you liked)
- **Skill pool → loadout.** ~12 skills per path, 6 on the bar (fewer than Dinusie's 8 — action combat
  needs fewer buttons). Unlocked by level and by story moments.
- **Talent tree.** Three branches per path, tiers with choice-of-one rows and a **keystone** at the bottom
  that changes how you play (e.g. Thorn keystone: "bleeds can be detonated").
- **Skill evolution.** Every skill gains **mastery** by use. At rank 2 you pick one of two **forks**, at
  rank 3 you master it. Forms change the shape, look and sound of the skill, not just numbers. Evolution
  costs **Żywica** — which ties the progression to the story's central resource and to the moral cost of
  harvesting it.

### Co-op synergies
Each path has 2–3 skills that do something extra with the partner: Blood can drink from enemies the
Thorn has bled; Bark's shield can be thrown to the partner; Dusk's traps trigger Graves' corpse
explosions. The vertical slice must show at least one Thorn × Blood combo.

---

## 5. Combat

- **Movement:** WASD, free 8-way movement (no tiles). Mouse aims. Camera: 3/4 top-down or isometric
  (decided with the art, §8).
- **Buttons:** LMB basic attack, RMB + 1–5 skills, **Space = dodge roll** with short invulnerability,
  Q/E consumables, F interact / execute.
- **Stamina:** dodging and heavy attacks cost stamina. You can't spam rolls.
- **Poise & stagger:** enemies have a poise bar; break it and they stagger. A staggered enemy can be
  **executed** (F) — a short brutal animation, guaranteed gore, both players heal a little.
- **Telegraphs:** enemy attacks are readable (wind-up, ground markers for big hits). Bosses are learned,
  not out-geared.
- **Gore:** blood decals per hit that stay for the whole visit, dismemberment on overkill, corpses stay
  (and matter: Path of Graves uses them; some enemies eat them).
- **Downed & revive:** at 0 HP you're downed, crawling, bleeding out for 20 s. The partner revives by
  holding F. Both downed = back to the last bonfire (*Ognisko*), enemies reset.
- **Friendly fire:** off. (Could be a hard-mode toggle later.)
- **Netcode:** server-authoritative as in Dinusie, plus client-side prediction for your own movement and
  dodge so it feels instant at Tailscale latency.

---

## 6. Items — every slot is a decision

### Equipment
Slots: weapon (main + off-hand or two-handed), head, chest, hands, legs, boots, amulet, 2 rings,
**relic**.

- **Rarity:** common (grey), fine (white), rare (blue), **ashen** (red — uniques).
- **Affixes:** 1–4 random affixes on fine/rare items, drawn from a pool per slot. Fewer, stronger
  affixes than Dinusie — "+15% bleed damage" not "+1 strength".
- **Ashen uniques** change how a skill *works* (e.g. *Kaelith's Gutting Knife*: your dodge leaves a
  bleeding cut in the ground). Each is tied to a place or person in the story.
- **Relics** are powerful with a curse attached (e.g. +30% damage, but you can't be healed by your
  partner). The trade-off is the point.
- **Comparison tooltip** always shows what changes vs. what you wear (Dinusie had this late; here it's
  day one).

### Inventory with weight
A **grid inventory** (items take 1×1 to 2×4 cells), so a big axe and a stack of herbs compete for
space. No infinite bag, no infinite stash: the camp chest is big but finite. You decide what to carry back.

### Salvage & crafting
- Any item can be **salvaged** into materials (iron, leather, bone, sap-wood, ash-glass).
- The camp **smith** (an NPC you recruit — who can die) upgrades item level, rerolls *one* affix, or
  forges a socket.
- **Runes** (dungeon drops) go into sockets and modify skills ("Blood Lance pierces").

### Alchemy — herbs and seeds that matter
Dinusie's seeds were filler. Here, herbs are the alchemy system:
- **Gather** herbs in the world (each region has its own; some only at night, some only off corpses —
  *grave-moss*).
- **Brew** at the camp alchemy bench:
  - **Potions:** healing (slow, big) vs. salve (instant, small) — a real choice.
  - **Poisons and oils:** coat your weapon for a fight (fire oil vs. Greyed, poison vs. humans).
  - **Bombs:** fire, smoke (lose aggro, revive your partner safely), shrapnel.
  - **Draughts:** temporary skill-modifying elixirs (e.g. a night-sight draught for dark dungeons).
- **Seeds** grow in the camp garden over **in-game days**; rare seeds (found in dungeons) grow the only
  ingredients for the strongest brews. Plants can be lost if the camp is raided (Act 2 event).
- **Belt:** only 4 consumable slots; refilled from the bag only at bonfires. You pick a loadout before a
  dungeon.

### Gold
Gold buys things the story cares about: **bribes** in dialogue (free a prisoner, buy a guard, buy a
clue), camp upgrades, the smith's rerolls, Harrow's mercenaries. If gold is worthless at level 10 we've
failed.

---

## 7. The camp (*Obóz*)
The only hub. Starts as a fire in a ruined chapel in Act 2, grows as you recruit people:
smith, alchemist, quartermaster, a priest who can respec talents, refugees who give side quests.
**Recruited NPCs can die** (story events, raids, your choices) and take their services with them.
Boss trophies hang on the walls. This replaces Dinusie's home/pets/expeditions with one place that
matters.

---

## 8. Dungeons

The dungeons were Dinusie's best part; their mechanics come over intact:
- **Gates** opened by **levers** (timed windows), **pressure plates** that need both players,
  **tablets** with symbol puzzles, **pylons** that shield a boss until destroyed, "use" objects, clues.
- **New for free movement:** traps (spike floors, swinging blades, collapsing floors — with gore),
  darkness where only torches and spells light the room, ambush rooms that lock until cleared.
- Each dungeon: 3–5 rooms of fighting, 1–2 puzzle rooms, a mini-boss, a boss with phases and telegraphs,
  and a story reveal at the end.
- **Vertical slice dungeon: the Drowned Sap-Mine** (*Zatopiona Kopalnia Żywicy*): flooded tunnels, sap
  pumps you have to restart in sync, bled captives in cages (some can be saved, they join the camp),
  boss: **the Tapper** (*Upuszczacz*), a noble's overseer stitched to his own sap-pump.

---

## 9. Art direction

**Goal:** higher-resolution 2D, painterly or pre-rendered, dark palette. **No visible pixel art.**
Characters ~96–128 px tall on a 1080p screen (Dinusie's were 32 px).

### Shortlist
| Option | What | License / price | Pros | Cons |
|---|---|---|---|---|
| **A. Flare art** | Isometric, pre-rendered from 3D. Heroes with paper-doll equipment, many monsters, tilesets, UI. Its repo ships the **Blender source files** (`art_src`). | **CC-BY-SA 3.0**, free ([flare-game](https://github.com/flareteam/flare-game)) | Complete, consistent, Diablo-like, free. Blender sources mean we could re-render at **higher resolution** and add our own poses/gore. | Human-looking, generic medieval; needs elf ears/recolours. Share-alike: modified *art* must stay CC-BY-SA (code stays MIT). |
| **B. Paid itch.io dark-fantasy packs** | e.g. *Dark Fantasy 2D Game Pack* by Moon Tribe (750+ assets: characters, tiles, UI, VFX, ~$20), *Blood, Gore & More* by luckythespacecat (CC0 gore sprites). | Varies per pack, often royalty-free for commercial games | Fast, polished, cheap. | **Not verified from here** (itch.io is blocked in this session). Most dark-fantasy packs on itch are **pixel art**, which we don't want; check the perspective and resolution before buying. |
| **C. 3D → 2D pipeline** | Free/CC0 3D models (Quaternius etc.) + Mixamo animations, rendered in Blender to 8-direction sprite sheets. | Free (CC0 models; Mixamo allowed in games) | Any resolution, unlimited animations, perfectly consistent, gore variants are easy. Diablo 2 was made this way. | Most work up front: a render script and a lighting setup. |

**Recommendation:** start the vertical slice with **A** (Flare art, re-rendered larger where needed)
plus CC0 gore decals. Look at it in-game together, then decide whether to stay with it, switch to
**C** for our own elves, or buy a pack from **B**. All three use the same isometric 2D renderer, so
switching later is a content change, not a code rewrite.

Every external asset gets a line in `CREDITS.md` (author, link, license) — CC-BY-SA requires it.

### Audio
Keep Dinusie's audio engine (buses, limiter, positional panning) and procedural SFX where they fit
(hits, blood, footsteps). Music and ambience should be darker and more "real": recorded CC0/CC-BY ambient
tracks or dark-folk loops, credited.

---

## 10. Tech (summary — details in CLAUDE.md once we scaffold)

Same stack as Dinusie so the good code carries over: pnpm workspaces, TypeScript, Phaser 3.90 (WebGL),
Colyseus 0.16 (embedded server: *Hostuj grę* / *Dołącz* + IP), Electron Windows .exe, `node:sqlite`.

- **Carried over:** networking & hosting, desktop shell + Windows build, persistence, skill/effect/status
  pipeline, talent engine, skill evolution, dungeon mechanics, quest & cutscene-dialogue engine,
  `plural()`, audio engine.
- **Rewritten:** movement & collision (continuous positions, circle colliders), skill targeting (aimed
  cones, lines, circles), client-side prediction, isometric renderer.
- **New:** grid inventory, crafting/alchemy, choice & consequence flags (`story.flags`), companion AI,
  gore system.

---

## 11. Milestones

| # | Milestone | Done when |
|---|---|---|
| **B0** | Scaffold | Engine ported, two players move freely in a test room over IP, tests + typecheck green. |
| **B1** | Combat slice | Thorn and Blood with 6 skills each, dodge, stamina, poise, executions, gore, 3 enemy types, 1 boss. *Playtest: is fighting fun?* |
| **B2** | Items & alchemy | Grid inventory, affixes, 3 ashen uniques, salvage, herbs → potions/oils/bombs, belt. |
| **B3** | Vertical slice | Act 1 ch. 1–2: prison escape, Ithiel, Maeve, the Drowned Sap-Mine, first camp version, dialogue with choices. *Playtest: do we care about Ithiel?* |
| **B4** | Act 1 complete | Harrow's scouts, the court, execution day (Choice 1), talent trees + evolution for both paths. |
| **B5** | Act 2 | Camp, Hollowmere (Choice 2), clues & the Ash Feast (Choice 3), Bark and Dusk paths. |
| **B6** | Act 3 & endings | The Tithe, Choice 4, epilogues, Graves path. |
| **B7** | Polish & ship | Balance, settings (gore level, volumes, keybinds), bug pass, hosting tested end-to-end. |

Every milestone ends with a playtest and a bug-fix pass before the next one starts.

---

## Open questions for you two
1. Isometric or 3/4 top-down camera? (Flare art = isometric.)
2. Are the four big choices the right ones? Too cruel, not cruel enough?
3. Is the hidden "one of you becomes the tree" ending a great idea or a terrible one?
4. Should companion permadeath in battle be on for Maeve, or is her story death enough?
5. Which two paths do you each want to play first? (The slice has Thorn + Blood.)
