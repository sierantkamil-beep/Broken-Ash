# Broken Ash — design document (draft 5)

> Status: **for review**. Nothing here is coded yet. Mark up anything you hate; everything is negotiable
> except the pillars.
>
> Draft 2 changes: five acts following the agreed emotional curve, a happy ending, eight paths
> (2 melee, 4 magic, 2 ranged, no healers), building as a core pillar, companions no longer die in
> combat, free assets only.
>
> Draft 3 changes: East Asian–inspired elven cultures. Eight peoples, each with its own look, architecture,
> customs and path; vermilion red as the realm's sacred colour; the World-Ash blossoms red; peoples you
> win over unlock their building style; human invaders as the European contrast.
>
> Draft 4 changes: the realm mixes Japanese and Chinese influences about equally (each people leans one way);
> every people has its own naming style, and the cast and places are renamed to match.
>
> Draft 5 changes: isometric camera decided; raids outside the story are a setting; a new section on
> cinematics (§5a); the art and audio pipelines are decided and built (§9); B0 is done.

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
the size of a mountain whose **red blossoms** fell over the realm every spring. Its sap (*Żywica*), red as
lacquer, kept them young, beautiful and undying. The kingdom was rich, cruel and very sure of itself.

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

### The look of Aeldrith
Aeldrith is an elven realm built on **East Asian aesthetics**: tiered pagodas with curved roofs,
vermilion gates, paper lanterns, blossom groves, moon bridges, rock gardens, lacquer, silk, masks,
curved swords. It mixes **Japanese and Chinese influences about equally** with elven grace and is never a
copy of a real country. Each people leans one way (see the table), so travelling across the realm feels
like crossing borders.

- **Colour:** vermilion red is sacred, because it's the colour of the sap, the blossoms and blood. The
  realm's palette is **black lacquer, ash grey, vermilion and old gold**. Since the tree broke, the
  blossoms fall grey and the red is now mostly blood.
- **Contrast:** the human invaders of the **Iron March** (*Żelazna Marchia*) look European: steel plate,
  crossbows, stone keeps, siege engines. You can see in every fight that they come from somewhere else.
- **Rule:** inspired by, not borrowed. No real-world gods, clans, place names or historical figures,
  and no fake Asian script used as decoration. Every name, people and custom is invented for Aeldrith.

### Peoples of Aeldrith
The realm is a patchwork of elven peoples (*ludy* and *klany*), each with its own lands, architecture,
customs and fighting style. Each people is home to one of the eight paths (§4). You choose your
character's **people of origin** at creation, independently of your path.

| People | Leans | Lands & architecture | Customs | Path born there |
|---|---|---|---|---|
| **The Lacquer Court** (*Lakowy Dwór*) | Chinese | The capital **Lirendhal**: tiered vermilion pagodas on stone terraces, lantern streets, paper-screen halls, palace gardens with koi ponds. | Masks, silk, rank shown by robe colour, poetry duels, tea ceremonies that sometimes double as poisonings. Calligraphers write law, and blood-scribes write spells. | **Blood**: sigils painted with a brush dipped in your own blood. |
| **The Thorn Clan** (*Klan Ciernia*) | Japanese | The **North-Grove**: wooden keeps with curved roofs among red-blossom groves, training yards, ancestor halls. Itheru's people. | A warrior oath, **the Oath of the Thorn**, that values loyalty over life. It's why Itheru walks to his own execution. Duels, ritual tea before battle, poems written on the eve of death. | **Thorn**: a pair of curved blades, one long and one short, with a lightning draw-and-cut. |
| **The Bark Monasteries** (*Klasztory Kory*) | Japanese | Mountain fortress-temples on terraced cliffs, bronze bells, stone stairways in the clouds. | Warrior monks, vows of silence, meditation in the snow, heavy lacquered armour bound with living bark. | **Bark**: huge two-handed blades and iron-studded war-clubs. |
| **The Reed Folk** (*Lud Trzcin*) | Chinese | **Shuilan**: a river city on stilts, moon bridges, bamboo walkways, boat markets, floating lantern festivals. | Fishers, smugglers, poisoners and spies. Black-clad night runners, smoke and silence. | **Sting**: throwing knives, darts, blowpipes, poisons, smoke. |
| **The Dusk Riders** (*Jeźdźcy Zmierzchu*) | Chinese (frontier steppe) | The **grey steppe**: felt tents, wooden watchtowers, sky-burial hills, horse herds. | Nomad archers who hunt at dusk, tattoos of every kill, songs instead of written history. | **Dusk**: asymmetric longbows, stealth, traps. |
| **The Ember Folk** (*Lud Żaru*) | Japanese | Volcanic forge-shrines behind rows of vermilion gates, black-stone smithies, hot springs. | The realm's swordsmiths. Fire festivals, and paper talismans that burn with a prayer written on them. | **Ash**: talismans that burst into flame, burning ground, explosions. |
| **The Wind Clan** (*Klan Wiatru*) | Chinese | Cliff-pagodas above a sea of clouds, rope bridges, wind chimes, kite towers. | Messengers and scholars who read storms, war-fans, kites flown into battle. | **Storm**: lightning, wind, war-fans, blinks. |
| **The Lantern-Keepers** (*Strażnicy Latarni*) | Japanese | Ancestor shrines lit by thousands of lanterns, bone pagodas, spirit tablets in the fog. Sanoe's people. | The festival of the dead, lanterns to guide souls home. Since the tree broke, they have tended the Greyed instead of fighting them. | **Graves**: lanterns that bind spirits, raising the dead. |

### Names
Every people names its children its own way, so you can tell where someone is from by their name. All
names are invented: they borrow the *sound* of Japanese or Chinese, mixed with elven endings, and are
never real names or words used as names.

| People | Style | Examples |
|---|---|---|
| **Thorn Clan** | Family (house) name first, then a given name of three soft syllables. Lords are addressed by given name, everyone else by house. | Soramei Itheru, Tamari Fenshō, Kasuren Ayume |
| **Bark Monasteries** | Monks drop their family name and take a two-syllable temple name ending in *-an* or *-on*, addressed as Brother/Sister. | Brother Tessan, Sister Hokuron |
| **Ember Folk** | Forge-house name + given name. Smiths sign their blades with the house name, and a famous blade is known by it. | Hakura of House Enjima |
| **Lantern-Keepers** | One soft given name. At death they receive a "lantern name" that is spoken only at the festival of the dead. | Sanoe, Hinaru, Moyuki |
| **Lacquer Court** | One-syllable family name first, then a two-syllable given name, often with an elven ending. Long courtly titles. | Lady Zhae Minrue, Minister Quen Taoyel |
| **Wind Clan** | Clan name + a generation name shared by siblings + a personal name. | Yuevar Shan-Li, Yuevar Shan-Teo |
| **Reed Folk** | Everyone goes by a nickname; real names are kept secret because names have power on the river. | Old Eel, Three-Fingers Wuyen, Lantern-Fish |
| **Dusk Riders** | One name + "child of" a parent + the name of a deed, earned and changed through life. | Orsa, child of Temuen, Who Ran With Wolves |
| **Priests & royal house** | **Old elven names**, from before the peoples split. The royal house and the priesthood keep them to show they belong to the tree, which marks them as the old elite. | Queen Ysolde, Prince Taerin, Elia, Brother Corvane |
| **Iron March (humans)** | European names. | Margrave Harrow; Maeve's human father |

Maeve keeps her human name from her father, which the elves never let her forget.

Two more powers stand outside the peoples:
- **The Priests of the Root** (*Kapłani Korzenia*): white robes, red cords, shaved heads, and shrines
  of red gates around the stump. They serve the tree and no people.
- **The Iron March** (*Żelazna Marchia*): Margrave Harrow's human army, the European contrast.

Every region has its own enemies in its own style. The Greyed wear what they wore in life, so the
capital has lacquered Greyed courtiers and the steppe has Greyed riders.

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
| **Culture** | East Asian–inspired, never a parody: peoples are written as people, with their own grudges, honour and hypocrisy, not as exotic decoration. |
| **The ending** | Happy. The realm heals, the people who survived get a future, your fortress becomes a town. Who is alive to see it depends on you. |
| **Polish grammar** | Player-facing text avoids gendered forms where possible ("Giniesz"), as in Dinusie. NPCs may address each player with the right form once we know the characters' genders (chosen at creation). |

---

## 2. The player characters

Both players are **Ashbound** (*Popielni*): elven convicts branded with ash on the forehead, which means
they are already legally dead. The game opens with both of you in the dungeons under **Soramei Keep**,
sentenced to the stump: being bled for Żywica until you die.

You pick your own name, look, **people of origin**, path and your crime (*Twoja zbrodnia*):
- **People** sets your starting look (clothes, tattoos, hair, mask), a few dialogue options with your own
  people, and how they greet you. Any people can walk any path, though a Reed Folk elf on the Path of the
  Thorn will hear about it from the Thorn Clan.
- **Crime** is a small backstory choice (murder, desertion, heresy, theft of sap) that unlocks a few
  unique dialogue lines and one side quest.

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
| 2 | **The Execution Square** (*Plac Ścięć*) | **CRUEL** | Court intrigue in the capital ends with Itheru's head on a spike. |
| 3 | **The Rot** (*Zgnilizna*) | **DOOM** → Hope | The realm collapses and Shuilan falls. Then you find a ruined fortress and build a home in it. |
| 4 | **The Ash Feast** (*Uczta Popiołu*) | **DOOM AND CRUELTY** | A massacre inside the walls you built, the children taken for the tithe, the truth about the tree. |
| 5 | **The Tithe** (*Dziesięcina*) | Ray of hope → **Happy ending** | The hated queen becomes your ally. You rebuild, march into the roots, bring the children home and plant a new tree. |

Rough length: 25–30 hours with side quests. Act 1 is the vertical slice.

**Where it happens.** Each act travels through different peoples' lands, so the world keeps changing:
- Act 1: the Thorn Clan's North-Grove.
- Act 2: the Lacquer Court's capital.
- Act 3: the Reed Folk's Shuilan, then Ostoja on the border between the Bark mountains and the Dusk
  steppe.
- Act 4: Ostoja, where the lords of every people gather.
- Act 5: the whole realm, then the roots.

**Alliances.** From Act 3 on, each people has a side-quest line that wins them over. An allied people:
- sends warriors to Ostoja's walls and to the final march;
- teaches its building style (§7);
- opens its unique items and its path's rarest runes.

You can't win all eight before the end, so you choose whose trust is worth earning.

### Cast — who lives, who dies
Companions **never die in combat**: when they're downed they get back up after the fight. Every death
below is a story event.

| # | Character | Who they are | Fate |
|---|---|---|---|
| 1 | **Lord Itheru of House Soramei** (*Soramei Itheru*) | Old lord of the Thorn Clan and warden of the North-Grove. Frees you from the dungeon because he needs people with nothing to lose. Kind, funny, the father figure. Bound by the Oath of the Thorn. | **Always dies in Act 2.** Beheaded on a forged charge. You can't save him, only choose how you spend the day (Choice 1). |
| 2 | **Maeve "Rdza" (Rust)** | Half-elf sellsword, the foulest mouth in the realm, travels with you from Act 1. Comic relief and the most likeable person in the game. | **Dies or lives at Shuilan** (Choice 2, Act 3). If she lives, she stays to the end. |
| 3 | **Fenshō** (*Tamari Fenshō*) | 15-year-old squire of Itheru. Idolises Maeve, follows you after Itheru's death. | If Shuilan's lower city was drowned (his family died), he **opens Ostoja's gate to the enemy in Act 4** and dies in the fighting. Otherwise he's knighted in the epilogue. |
| 4 | **Brother Corvane** | Priest of the Root, gentle, helpful, brings you medicine and secrets. | **The traitor.** Forged the charge against Itheru, plans the Ash Feast. Whether you catch him decides who dies at the feast (Choice 3). |
| 5 | **Prince Taerin** | Ysolde's son, nervous, decent, hates his mother. The heir everyone wants to control. | Dies poisoned at the Ash Feast unless Corvane is exposed. If he lives, he grows into a king worth having. |
| 6 | **Queen Ysolde** | Broke the World-Ash. Cold, brilliant, completely alone. Hunted by everyone, including you, until Act 5. | Becomes your ally in Act 5 (the ray of hope). **Lives** and is reunited with Elia. |
| 7 | **Margrave Harrow** | Human warlord. Brutal, honest, keeps his word. | Enemy in Acts 1–4. In Act 5 he marches with you **if** you spared his scouts in Act 1; otherwise his army stands in your way. |
| 8 | **Sanoe the Ash-Witch** | Ancient Lantern-Keeper living in the stump's shadow; the only one outside the priesthood who knows about the tithe. | Joins Ostoja in Act 3. **Always dies in Act 4**, killed by the priests for telling you the truth. |
| 9 | **The Rootfather** | Head of the priesthood. Soft-spoken, sincere, monstrous. | The final villain. Takes the children in Act 4; dies at the roots in Act 5. |
| 10 | **Elia** | Ysolde's daughter, alive and trapped in the roots for nineteen years. Heard only as a voice until the end. | **Lives.** Rescued in the finale. |

### Act 1 — "Ash on the Forehead" (*Popiół na czole*) — Normal → downer — the vertical slice
1. **The Stump.** Prison escape tutorial under Soramei Keep: fight the Greyed in the bleeding-cells, learn
   dodging, find your first weapon on a dead guard. Itheru's men break you out on purpose.
2. **The Warden's Hounds.** Itheru recruits you as deniable agents and gives you a burned-out farmstead.
   **First building:** palisade, tents, a workbench, a garden bed (the building tutorial). Maeve joins.
3. **The Drowned Sap-Mine** (*Zatopiona Kopalnia Żywicy*), the first dungeon: a noble house was secretly
   bleeding captives here. Captives you save move into your farmstead.
4. **Harrow's Scouts.** First taste of the human army. Choice: execute the captured scouts or let them go.
   Harrow remembers, and it decides Act 5.
5. **Downer.** You come back to find the North-Grove burned by royal troops. Itheru is summoned to the
   capital and goes willingly, sure that the truth will protect him. You go with him. The farmstead is
   abandoned.

### Act 2 — "The Execution Square" (*Plac Ścięć*) — CRUEL
- The capital **Lirendhal**: beautiful, rotting, full of old elves who are suddenly afraid of dying.
  Hideout in a brothel cellar (small building: beds, a stash, an alchemy corner).
- Intrigue quests: Corvane helps you hunt for proof of Itheru's innocence. Each lead is a dungeon or a
  heist (the royal catacombs, a noble's sap vault).
- The trial is a farce; the proof you found is "lost" (by Corvane, though you don't know it yet).
- **Execution day — Choice 1:** try to free Itheru (a hopeless fight in the plaza: you lose, Maeve is
  scarred, you're hunted for the rest of the act) **or** stay hidden in the crowd and watch (you keep
  your cover; Fenshō never forgives you). Either way his head comes off, and his body hangs at the gate.
- You flee the capital with nothing.

### Act 3 — "The Rot" (*Zgnilizna*) — DOOM → Hope
- **Doom.** The noble houses go to open war, the Greyed multiply, Harrow takes the southern forests.
- **Siege of Shuilan — Choice 2:** hold the river gate with Maeve while refugees escape (Maeve dies
  covering your retreat; you see it happen) **or** break the dam and flood the lower city, drowning
  Harrow's army *and* about 2000 refugees (Maeve lives; Fenshō's family dies; the drowned rise as Greyed
  later). Shuilan falls either way.
- **Hope.** Survivors lead you to **Ostoja**, a ruined border fortress. You make it yours: clear it,
  rebuild the walls, bring in the refugees, recruit a smith, an alchemist, a quartermaster. This is where
  the building system opens up fully (§7).
- Prince Taerin escapes the capital and comes to you. Sanoe arrives with half the truth.
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
  Ostoja burn. If the refugees were drowned, Fenshō opens the gate for the enemy and dies.
- Sanoe tells you the whole truth about the tree and is killed for it.
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
  is there: Maeve drinking, Taerin crowned or a council in his place, Fenshō knighted, Harrow's banner
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

| Path | Type | Home people | Fantasy | Resource | Sustain |
|---|---|---|---|---|---|
| ★ **Path of the Thorn** (*Ścieżka Ciernia*) | Melee | Thorn Clan | Paired curved blades (long + short), draw-and-cut strikes, bleeds, finishers that dismember. Fast and fragile, lives on dodging. | Fury, builds on hits | Heals from bleed ticks |
| **Path of Bark** (*Ścieżka Kory*) | Melee | Bark Monasteries | Huge two-handed blades and war-clubs, roots, lacquer-and-bark armour. Slow, huge hits, hard to kill. | Stamina | Bark shield that grows with damage taken |
| ★ **Path of Blood** (*Ścieżka Krwi*) | Magic | Lacquer Court | Blood-scribe: paints sigils with a brush and **their own blood**, drinks from wounds. Very gory. | Health | Drinks from bleeding enemies |
| **Path of Ash** (*Ścieżka Popiołu*) | Magic | Ember Folk | Paper talismans that burst into flame, burning ground, explosions, area denial. | Heat (overheat = backfire) | Burning enemies drop embers that heal |
| **Path of Storm** (*Ścieżka Burzy*) | Magic | Wind Clan | War-fans that throw lightning and wind: the most mobile caster, chains, blinks, knock-ups. | Charge, built by moving | Static shield |
| **Path of Graves** (*Ścieżka Grobów*) | Magic | Lantern-Keepers | Spirit lanterns that bind the dead; raises the Greyed to fight for you; corpses are resources. | Ash, gathered from corpses | Drains life from minions |
| **Path of Dusk** (*Ścieżka Zmierzchu*) | Ranged | Dusk Riders | Asymmetric longbow, stealth, traps, headshots from the dark. | Focus | Stealth regenerates health |
| **Path of the Sting** (*Ścieżka Żądła*) | Ranged | Reed Folk | Throwing knives, darts, blowpipes, poisons, smoke. Mid-range and always moving. | Poison doses | Antidote reflex: cleanses and heals |

★ = in the vertical slice. Thorn × Blood is the first combo: Blood drinks from enemies the Thorn has bled.

### Weapons and mastery (decided after B1)
**Any path can wield any weapon.** The skill bar is **path 3 + weapon 3**:
- the **weapon** gives the basic attack (LMB), the RMB skill and one more (key 1), chosen from that
  weapon type's own **mastery tree**;
- the **path** gives its resource, sustain, co-op combo and **3 signature skills** (keys 2–4), which work
  with any weapon.

Nine weapon types: paired blades, glaive, greatblade, blood brush, talismans, war-fan, spirit lantern,
longbow, throwing knives. Each path has 2–3 **home weapons** (more damage and a path rider, e.g. the
Thorn's home weapons add bleed), so off-path builds work but feel different.

**Mastery** is per weapon type and levelled by fighting with it (1–10). The tree: RMB is one of two
skills (mastery 1 and 3), key 1 one of three (mastery 1, 5, 8), and passive rows at 4, 6, 7, 9 and 10
offer one of two modifiers (damage, cooldown, reach, extra projectile, a status rider, or a *form* that
changes the skill's look). Mastery is saved on the host's PC with the character. The weapon you hold
and your armour are **visible** on the character.

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

- **Movement:** WASD, free 8-way movement (no tiles), along the screen (W is straight up the screen).
  Mouse aims. Camera: **isometric** (2:1), zoomable a little with the wheel.
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

## 5a. Cinematics

The story is told in the engine, not in dialogue boxes. Every important beat gets a **cinematic**:
camera moves over the real scene, letterbox bars, a title or subtitles, music and sound cues, the
characters acting it out. Talking to an NPC can still be a plain dialogue, but deaths, betrayals,
arrivals and boss reveals are always staged.

**Kinds of cinematic action:**
- **Story scenes.** Letterboxed, both players' control taken away. Examples: the prolog over the
  burning courtyard, Itheru's execution, Maeve's last stand at Shuilan, the Ash Feast massacre, Elia
  carried out of the roots.
- **Scripted moments in play.** No letterbox and no lost control: the camera swings to show
  something (a gate bursting, a horde coming over the wall, the shrine collapsing) while you keep
  moving and fighting.
- **Finishers.** An execution on a staggered enemy or a boss kill gets a short close-up: zoom, a beat
  of slow motion, a gore burst, and a sound sting. It lasts under a second, so it never breaks the
  flow.
- **Boss entrances.** A short camera move to the boss, a title card with its name, and its theme
  starting.
- **Death and loss.** When a named character dies, the scene doesn't cut away. The camera holds,
  the music drops out, and the partner's reaction is part of the shot.

**Rules:**
- **Both players watch together.** A cinematic is shared state on the server. A partner who
  connects mid-scene joins at the same moment, not at the start.
- **Skipping needs both votes:** Esc on each side (the corner shows "Pomiń: Esc (1/2)"). Nobody gets
  a key story beat skipped for them.
- **Cinematics are data:** timelines of camera keys, subtitles, title cards, actors, fades and events
  (`shared/src/data/cinematics.ts`). Tests check that every subtitle stays on screen long enough to
  read in Polish.
- **No voice acting:** text plus sound design and music carry it. Any line can be rewritten without
  re-recording anything.
- **Grading:** scenes can desaturate the picture slightly, which makes the red of blood and blossoms
  stand out.

---

## 6. Items — every slot is a decision

### Equipment
Slots: weapon (main + off-hand or two-handed), head, chest, hands, legs, boots, amulet, 2 rings,
**relic**.

- **Look:** gear shows each people's craft: lacquered lamellar armour, silk robes, demon-faced half masks
  in the head slot, Ember-forged curved blades, Wind Clan war-fans, Lantern-Keeper spirit lanterns. The
  Iron March drops steel plate and crossbows that look out of place on purpose.
- **Rarity:** common (grey), fine (white), rare (blue), **ashen** (vermilion, uniques).
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
- **Structure:** foundations, floors, walls, doors, gates, stairs, roofs, one upper storey; cellars
  as separate interiors. Free placement
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
- **Decoration:** furniture, tatami-like mats, folding screens, banners, lighting (paper lanterns and
  braziers matter in a dark game), boss trophies, and each player's own room to furnish however they like.
- **Gardens:** plant blossom trees, bamboo, pine; build koi ponds, rock gardens, moon bridges and stone
  lanterns. Seeds from the alchemy system grow the trees.

### Building styles from the peoples
You start with plain timber and a bamboo palisade. Every people you ally with (§3) teaches its style, and
styles can be mixed freely:

| People | Unlocks |
|---|---|
| Thorn Clan | Curved-roof wooden keeps, training yard, ancestor hall, blossom groves |
| Lacquer Court | Tiered vermilion pagodas, lacquered halls, paper screens, lantern streets, tea house |
| Bark Monasteries | Stone terraces, bell towers, massive stone walls and gatehouses |
| Reed Folk | Stilt houses, bamboo walkways, moon bridges, water gardens, boat docks |
| Dusk Riders | Felt tents, horse pens, wooden watchtowers, archery ranges |
| Ember Folk | Black-stone forge-shrines, rows of vermilion gates, hot springs, better smithy |
| Wind Clan | Tall slender pagoda towers, wind chimes, kite towers (extend the view over the map) |
| Lantern-Keepers | Lantern shrines, spirit tablets, bone pagodas, the festival of lanterns over Ostoja |

Iron March pieces (stone keep, iron portcullis) can be looted from Harrow's camps, for players who want a
stranger fortress.

### How it plays
- **Build mode (B):** a ghost preview shows where a piece goes, green or red. Placing costs materials;
  removing refunds most of them.
- **Materials** come from gathering (wood, stone, clay), salvage, dungeons and gold. Workshops staffed by
  NPCs also produce materials over time.
- **Co-op:** both of you build at the same time from shared storage. **Blueprints** let you save a building
  and place it again.
- **Defence:** Ostoja gets attacked:
  - in story sieges (end of Act 3, Act 4, Act 5), which always happen;
  - in occasional raids by the Greyed or bandits outside the story. Raids are a **setting**
    (*Najazdy na Ostoję poza fabułą*, on by default) that each of you can see in the Esc menu. The
    host's setting decides.
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

**Goal (revised after B1):** detailed **pixel art drawn at 2×** (one art pixel = 2×2 screen pixels),
dark palette, characters about 120 px tall on screen. The two shared character bodies and their motion
come from **PixelLab**; everything else is ours, made to match: the map is rendered in Blender and then
put through a pixel-art pass that keeps its detail (art resolution, generous per-prop palettes, dark
silhouette outline), gear is hand-placed pixel parts, and skill effects are shadow-ink.

**Skill effects: shadow-ink, always.** Every skill visual (now and every future one) is sumi-e ink:
tapered brush strokes, blots and splatter, dry-brush streaks, enso rings, smoky ink trails. A black ink
core with a pale rice-paper rim and one accent colour per path (Thorn vermilion, Bark moss, Blood
crimson, Ash ember, Storm pale indigo, Graves lantern teal, Dusk amber, Sting venom green), so the ink
reads on the dark night map. Gore is not a skill effect and keeps its own look.

The original goal ("no visible pixel art", painterly pre-rendered characters) was dropped: the Blender
characters never looked good enough.

**Only free assets.** Allowed licenses: CC0, CC-BY, CC-BY-SA (and GPL-compatible art). Nothing bought,
and nothing whose license forbids redistribution. Every asset gets a line in `CREDITS.md` (author, link,
license, changes).

**East Asian look:** free assets in this style with a clear open license are rare. A first search found
mostly paid packs and free models with unclear licenses. So pagodas, curved roofs, vermilion gates,
lanterns and blossom trees will mostly be **made by us in Blender**. They are simple, repetitive shapes
(roof tiers, posts, beams) that a script can generate in many variants. That fits option B below. Each
people gets its own colour palette and trim on the same base pieces.

### Shortlist
| Option | What | License | Pros | Cons |
|---|---|---|---|---|
| **A. Flare art** | Isometric, pre-rendered from 3D. Heroes with paper-doll equipment, many monsters, tilesets, UI. Its repo ships the **Blender source files** (`art_src`). | **CC-BY-SA 3.0** ([flare-game](https://github.com/flareteam/flare-game)) | Complete and consistent, with a Diablo-like look. The Blender sources mean we can re-render at **higher resolution** and add our own poses and gore. | Human-looking, generic medieval: elves need new ears and recolours. Share-alike: modified *art* stays CC-BY-SA (code stays MIT). Few building pieces. |
| **B. 3D → 2D pipeline** | Free CC0 3D models and modular kits (Quaternius characters, Kenney castle/town kits and others) plus free Mixamo animations, rendered in Blender to 8-direction sprites and building pieces. | CC0 models; Mixamo is free to use in games | Any resolution, unlimited animations, perfectly consistent. **Modular kits are ideal for the building system.** Gore variants are easy. Diablo 2 was made this way. | Most up-front work: a render script and a lighting setup. Elves still need head/ear edits. |

Gore decals (blood pools, splatter, gibs) can come from either option (rendered in B) or from a CC0 pack
on OpenGameArt.

**Decision (B0):** option **B, built by us**. `tools/art/` renders every sprite with Blender's Python
module (`bpy`) through the same isometric camera the game uses:
- props and characters are procedural models with Cycles lighting, soft contact shadows and 2×
  supersampling;
- the ground is painted with numpy as seamless textures with feathered borders;
- blood is painted decals.

Everything is original, so no licences need tracking. Option A (Flare) stays the fallback for Iron
March humans if we want them fast. The B0 placeholders (the two convicts, the courtyard props) are
meant to be refined, not thrown away: improving a model and re-running the script updates every
sprite.

### Audio
All audio is **synthesised by `tools/audio/build.py` into real `.ogg` files**, so it is original and
easy to re-tune:
- **Music** uses the in-sen scale with plucked-string, breathy-flute, drum and temple-bell voices,
  a drone and reverb. It loops seamlessly.
- **Ambience:** wind, rustling blossom, wind chimes, crickets.
- **Effects:** footsteps on stone and moss, the dodge roll, gate impacts, the splitting of the tree,
  and the UI sounds.

The game mixes them on three buses (music, ambience, effects), crossfades loops, and pans effects by
where they happen on screen. Free CC0/CC-BY recordings can be added later where synthesis falls
short; they would be credited.

---

## 10. Tech (summary — details in CLAUDE.md)

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
| **B0** ✅ | Scaffold | Networking, hosting and the desktop shell ported from Dinusie; two players move freely in a test room over IP; tests + typecheck green. *Also done: the Blender sprite pipeline, ground painter, audio synthesiser, the cinematic system with the prolog, and the Soramei courtyard.* Dinusie's skill, talent, evolution and dungeon systems come over in B1–B4, when each is needed. |
| **B1** | Combat slice | **All eight paths** with 6 skills each, MakeHuman-based elf characters (both body types), dodge, stamina, poise, executions, gore, 3 Greyed types, the Tapper boss, character creation. *Playtest: is fighting fun?* |
| **B2** | Items & alchemy | Grid inventory, affixes, 3 ashen uniques, salvage, herbs → potions/oils/bombs, belt. |
| **B3** | Building basics | Build mode, walls/floors/doors/roofs in wood, workbench, garden plots, storage, decoration, blueprints, saved on the host. *Playtest: is building fun on its own?* |
| **B4** | Vertical slice | Act 1 complete: prison escape, Itheru, Maeve, the farmstead, the Drowned Sap-Mine, Harrow's scouts, the downer ending. Talent trees + evolution for Thorn and Blood. *Playtest: do we care about Itheru?* |
| **B5** | Act 2 + 2 paths | The capital, the hideout, intrigue dungeons, the execution (Choice 1). Bark and Dusk. |
| **B6** | Act 3 + Ostoja + 2 paths | Shuilan (Choice 2), Ostoja's full building (stone tiers, workshops, NPC homes and jobs, defences, sieges). Ash and Sting. |
| **B7** | Act 4 + 2 paths | The Ash Feast (Choice 3), the burning, the taken children. Graves and Storm. |
| **B8** | Act 5 & ending | Ysolde, the rebuild, the Roots, the Rootfather, the happy ending, an epilogue built from your town and your choices. |
| **B9** | Polish & ship | Balance, settings (gore level, raids on/off, volumes, keybinds), bug pass, hosting tested end-to-end. |

Every milestone ends with a playtest and a bug-fix pass before the next one starts.

---

## Decided
- Isometric camera.
- Raids outside the story are a setting (on by default).
- The five-act curve stays as written.
- **Building height:** a ground floor plus one upper storey under the roof. Cellars and undercrofts
  are separate interior areas reached by stairs, built like small dungeons. No multi-level castles:
  in the isometric view taller buildings would hide the fighting behind them.
- **B1 brings all eight paths**, not two.
