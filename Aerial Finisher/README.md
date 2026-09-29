# Aerial Finisher — v1 combat arena

A Kingdom Hearts 2-flavoured action-combat prototype in TypeScript. No engine, no
dependencies: a fixed 60Hz simulation, a canvas renderer, and a tuning panel.

## Build

    tsc -p tsconfig.json     # concatenates src/*.ts -> dist/game.js
    node build.js            # inlines it into dist/index.html + dist/page.html

Open `dist/index.html` in a browser. There is no bundler and nothing to install.

## Layout

| file              | what lives there                                                        |
|-------------------|-------------------------------------------------------------------------|
| `src/config.ts`   | `TUNING` (every live-tunable constant), attack frame data, spells, enemies, stat curves |
| `src/core.ts`     | math, buffered input (keyboard + gamepad), WebAudio synth, VFX types    |
| `src/entities.ts` | `Player`, `Enemy`, `Projectile`, damage formulas, arc hitboxes, all AI  |
| `src/render.ts`   | arena, characters, VFX, HUD, command menu                              |
| `src/main.ts`     | `Game`: loop, waves, progression, save, debug panel                    |
| `shell.html`      | page chrome; `/*__GAME_JS__*/` is where the compiled JS is injected     |

Files are compiled in the order listed in `tsconfig.json` with `module: none` and
`outFile`, so everything shares one global scope — no imports, no bundler.

## How combat works

Attacks are pure data. `AttackDef` in `config.ts` holds startup / active /
recovery / cancel frames plus power, reach, arc, hitstun, knockback, launch,
poise damage, hitstop and lunge. `GROUND_COMBO` and `AIR_COMBO` are arrays of
those; the player just indexes into them. Retiming a combo means editing numbers,
never code.

- **Cancel windows.** A press during any part of a swing is stored in
  `queuedAttack`; when recovery reaches `cancel` it chains to the next entry.
  That's what makes mashing feel responsive without dropping inputs.
- **Homing.** On startup the player snaps to the lock-on (or nearest forward)
  target and gets a lunge velocity sized to close the gap — KH2's glide-to-target.
- **Hitstop** freezes the whole simulation for a few frames on connect while
  rendering continues. It is the single biggest contributor to impact.
- **Poise.** Enemies have a stagger meter; enough damage fast enough staggers
  them. Launchers and the aerial spike bypass it.
- **Guard.** Bulwarks reduce frontal non-finisher hits to 18% and shove you back;
  go around, or break the guard with a ground finisher.
- **MP.** Fire/Blizzard/Thunder cost MP. Cure spends the entire bar, which locks
  it into a timed recharge. That is the KH2 model and the reason magic is a
  decision instead of a rotation.

## Where to take it next

- Party AI ally with a gambit-style behaviour config
- Reaction commands (per-enemy contextual prompts on specific states)
- Guard / dodge-roll with i-frames as a real defensive layer
- Ability + AP equip screen, drive-form transformations
- Overworld map with roaming enemies and a seamless combat transition

---

# rev 2 — synthesis, talents, dash, whirl, adaptive score

## New files

| file | what lives there |
|---|---|
| `src/items.ts` | 7 materials, 6 weapon tiers, 6 armour tiers, per-enemy drop tables, recipes |
| `src/talents.ts` | 18 nodes across Blade / Arcana / Survival, AP maths |
| `src/music.ts` | the whole score: synth band, riff patterns, sections, intensity layers |

`tsconfig.json` compiles in the order config → core → items → talents → music →
entities → render → main. Order matters for top-level consts, not functions.

## Synthesis

Enemies drop materials, potions and ethers as physical pickups that magnetise
to you within 130px. Drop tables are per enemy type (`DROPS` in items.ts), which
is what makes farming a *specific wave* meaningful: Bulwarks are the only real
source of Bulwark Plate, Chanters of Chant Sigils. Void Cores don't exist before
wave 10 (`coreChance`), so the top two tiers are gated behind depth, not luck.

Every recipe requires the previous tier be **owned**, not consumed — you keep
the old gear and can swap back. Weapons raise `powerMult` and `rangeBonus`
(reach is folded into every hitbox by `Player.reach()`); armour is flat
`dr` subtracted in `Player.takeHit`, capped at 0.55 including Iron Skin.

## Talents

1 AP per level, `apFree = apPerLevel(level) - apSpent(talents)`. The combo table
is **built per swing** by `Player.groundTable()` / `airTable()`, so learning
Extended Combo genuinely lengthens the string rather than swapping a preset.

The Whirl is an ordinary `AttackDef` with `radial: true` and `arc: Math.PI` —
that one value makes `inArc` stop caring about facing, turning the hitbox into a
ring. `ticks` splits the active frames into separate hits by clearing
`attackHits` on each tick boundary. Tempest adds `pull`, which drags enemies in.

## Dash

`TUNING.dashSpeed/dashFrames/dashIframes/dashCooldown/dashRecharge`. It is
pollable from `idle` **and** `attack`, which is the dodge-cancel — the single
biggest thing it adds to the feel. Charges refill on a timer; Aerial Dodge adds
a second charge and unlocks it in the air.

## Music

One `AudioContext` shared with the SFX (`sharedAudio()` in core.ts) — browsers
cap how many a page may open.

Monophonic persistent voices for guitar/bass/lead (frequency set per note, gain
enveloped) instead of a node per note: at 176bpm a tremolo bar is 16 notes, and
allocating oscillators that fast is what kills Web Audio performance. Drums and
harpsichord are per-hit because they're sparse.

Five layers, applied **on bar lines only** (`applyLevel`) so the mix never
changes mid-phrase:

| level | when | what you hear |
|---|---|---|
| 0 | rest point, menu open | harpsichord arpeggio + string pad |
| 1 | 2 or fewer enemies left | bass, ride, palm mutes |
| 2 | ordinary wave | full rhythm guitar, backbeat |
| 3 | 6+ enemies or 12+ combo | double-kick, twin harmony lead |
| 4 | every 5th wave, or under 25% HP | blast beats, china, sweeps |

Ten sections reshuffled every cycle (`reshuffle`), never repeating back to back.
Changing `bpm` changes the delay time — it is set from bpm at build time.

## Player sprite

`drawPlayer` in render.ts. Tier reads through silhouette first: `ArmorLook`
carries `shoulder`, `spikes`, `capeLen`, `crest`, and only then colour. A rim
gradient sits behind the figure so the player never gets lost in a crowded wave.
The drawn blade length is capped independently of hitbox reach — the Whirl's
122px ring would otherwise draw a sword three times the height of the character.

## Save

`aerial-finisher-save-v2` carries level, exp, best wave, materials, owned gear,
equipped gear, talents and consumables. `loadSave` validates that the equipped
ids are actually in the owned lists and falls back to tier 1 if not.

---

# rev 3 - title screen, grace period, lighter score, touch controls

## Music, rebuilt melody-first

`music.ts` was rewritten, not tuned. 176bpm -> **132**. The blast-beat branch is
gone entirely; every intensity plays a groove, and level 4 is "driving" (extra
double-kick fills) rather than an assault. The sweep run fires only in section F,
only at intensity 3+, and runs in eighths with rests instead of straight
sixteenths.

The mix enforces the brief: `applyLevel` caps the guitar at 0.21 while the lead
sits at 0.26, so the twin harmony leads are always on top. Harpsichord stays
audible through intensity 2 instead of dropping out the moment combat starts.
Guitar drive 46 -> 26 and cab lowpass 3400 -> 2800Hz, which is most of why it
stopped sounding harsh. Default volume 0.55 -> **0.30**.

## Title screen

`Game.screen` is `'title' | 'play'`. Wave 1 spawns during construction but stays
frozen behind the menu, so the arena is the backdrop rather than an empty box.

Continue / New Game / Options / How to Play. Continue only appears when
`hasSave()` is true, and New Game wipes. Options carries music and SFX sliders,
which is the only volume control that exists on a phone.

It also solves iOS audio: Safari will not start an AudioContext without a user
gesture, and pressing Start is that gesture.

## Wave grace period

`TUNING.waveIntro` (1.6s). `startWave` sets it; `tick` skips the enemy update
loop while it runs, so they spawn in and stand still while you reposition.
Everything else - you, pickups, VFX - keeps running. A shrinking ring and GET
READY show the time left, and it ends on a GO banner.

## Touch controls

`IS_TOUCH` is `(pointer: coarse)`. When true:

- **Floating thumbstick** - put a thumb anywhere on the left half and the base
  appears under it, rather than hunting for a fixed circle.
- **ATK / JMP / DSH / MAG** on the right, with a spell-chip column at the right
  edge choosing what MAG casts. Holding ATK re-presses every 9 frames so combos
  chain without machine-gun tapping.
- **Auto lock-on** (`Player.updateLock`) - there is no spare thumb for a
  targeting button, so it takes the nearest enemy and re-acquires on death.
- The keyboard command menu is hidden; the thumbstick owns that corner.

Menu geometry (`MENU_TAB`, `MENU_LIST`, `TITLE_ROW` in config.ts) is shared
between the renderer and the hit-testing, so taps cannot land in the wrong row.
`InputState.uiMode` suppresses the stick and buttons while a full-screen UI is
up, and menus read `takeTap()` instead. In the pause menu, tap a row to select
and tap again to commit.

**`setPointerCapture` must be wrapped in try/catch.** It throws for pointers the
browser no longer considers active, and an uncaught throw swallows the rest of
the press handler. That bug ate every button press until it was guarded.

## Phone layout

`@media (pointer: coarse), (max-width: 760px)` hides the page chrome and gives
the stage `100dvw/100dvh`. Portrait swaps in a rotate prompt, because the arena
is 16:9 and portrait would show a third of the fight. `viewport-fit=cover` plus
the apple-mobile-web-app meta tags make Add to Home Screen a fullscreen app.

Known: the canvas letterboxes on a 19.5:9 phone (960x540 fitted by height).
Widening `VIEW_W` on mobile would fill it, but every layout constant is written
against 960x540, so that is a deliberate later job.

---

# rev 7 - a bigger world, a new score

See the sections below; rev 7 changes are folded in.

# rev 6 - open world, dungeons

The game is an open world you walk around, Zelda-style: a smooth-scrolling
camera over one connected map, enemies scattered through every region, and
a dungeon in each region holding its bosses. Levels run 1-100.

## Files

| file | what lives there |
|---|---|
| `src/world.ts` | `WorldLocation`, `BossDefinition`, `WorldState` (incl. your position and checkpoint); save (de)serialisation, unlock rules, the quest hint |
| `src/location.ts` | the Haven and 12 regions, 30 bosses, tier level bands, forge flavour - all data |
| `src/overworld.ts` | the tile map: region grid, cliffs, passages and barriers, clutter, roads, buildings, enemy spawn points; tile collision; spawning; camera |
| `src/dungeon.ts` | a dungeon's rooms (hall, wave rooms, boss rooms), waystones and altars |
| `src/superboss.ts` | Ascendant variants: stat scaling, Star Fragment spoils |

Build order: config, core, items, talents, world, location, superboss,
overworld, dungeon, music, entities, render, main.

## The world

`REGION_GRID` in overworld.ts lays the 12 regions and the Haven out on a
5x3 grid (two cells are mountains). Each region is **128x80 tiles** of 40px
(16x the area of rev 6), ringed by cliffs; neighbours are joined by a
6-tile passage. The whole map is 640x240 tiles and generated from fixed
seeds, so it is the same every load; a flood fill keeps only spawn points
and chests you can actually walk to. `MAP_VERSION` is saved with your
position, so a save from an older map layout wakes you at the Haven.

The **Haven** is the exception: a 56x36-tile valley in the middle of its
cell (`HAVEN_RECT`), ringed by mountains, with roads tunnelled out to the
forest, the coast and the desert. It holds the Haven Forge, Harrow Inn,
the colosseum and the Lantern Fountain.

Every other region has:
- a **dungeon** (the Haven has the **colosseum** instead)
- **two towns** - rest stops, checkpoints and waypoints; the first has the
  region's forge where it has one
- a **landmark** per biome (the Eldest Tree, the Drowned Ship, the Fallen
  Colossus, the Mirror Oasis, the Lake of Cinders, the Still Lake, the
  Wind Shrine, the Monolith, the Lantern Fountain)
- **14 treasure chests** (materials for the tier, supplies, sometimes a
  boss material); opened ones stay open
- **~110 enemy spawn points**, one in twelve an **Elite**: x2.6 HP,
  x1.35 attack, bigger, glowing, x3 loot and EXP, a chance at a boss
  material, and a slower respawn

A passage into a region you have not opened is a glowing **barrier**.

**Waypoints**: every town and dungeon door you reach is added; open the
MAP tab, pick one with the arrows (or tap it) and press ENTER to warp -
not while something is chasing you.

The HUD minimap shows the region you are in at one pixel per tile, with
towns, the dungeon door and unopened chests marked.

**Enemies** live on spawn points. A spawner fills when you are 560-1500px
away (so never on-screen), its enemy idles near home until you come within
300px, chases, and gives up if you drag it 760px from home. Killed enemies
respawn after 28s (Elites 84s); idle ones far away are put back. Only
enemies within ~1150px of you are simulated.

## Dungeons

`dungeonRooms`: an entrance hall, then for each of the region's bosses two
wave rooms and the boss's room. A room's east door is barred until the
room is clear; walk into it to go on. The last boss opens the next region
(its barrier drops); another boss opens a Wave Trial tier. B leaves at any
time - rooms refill, beaten bosses stay beaten.

The hall has a **waystone** for every section you have reached, so a
beaten boss is a checkpoint. A beaten boss's room has two **altars**:
rematch it, or face its **Ascendant** (x1.5 stats, x2 spoils, Star
Fragments). Ascendants unlock nothing.

## Music

`music.ts` is an orchestral, melody-first score synthesised live: piano,
bells, flute, strings, pads, choir, soft brass, harp, pizzicato, marimba,
an oud-like pluck, bass, gentle drums and timpani through a generated
hall reverb and a compressor.

Twelve original themes, each two 8-bar sections written in readable
notation (roman-numeral chords, scale-degree melodies):

| theme | where | feel |
|---|---|---|
| Heart's Lantern | title | piano lullaby, D major |
| Lanterns of the Haven | the Haven | celesta waltz, 3/4 |
| Where the Old Trees Listen | forests | flute over harp |
| Saltglass Morning | coast | marimba and flute, 6/8 |
| Verses in Stone | ruins | dorian strings |
| Glass and Wind | desert | oud, phrygian dominant |
| Embers Rising | volcanoes | horn over a string ostinato |
| Frostveil Lullaby | tundra | bells and piano |
| Above the Storm | sky | lydian strings |
| The Space Between Stars | the Rift | bells and choir |
| Beneath | dungeons | low piano and cello |
| Crown of Thorns | bosses, colosseum | everything, with timpani |

Regions sharing a biome play it in a different key and tempo
(`ZONE_MUSIC`). When enemies engage, a combat layer (drums, driving bass,
brass stabs) fades in on the next bar and the tune moves to a brighter
instrument; it fades out after the fight. Every third pass the melody
rests. Themes crossfade on a fresh bar, and the menu ducks the music.
Default volume is 20%; every theme measures ~-14 dBFS RMS at full volume.
`Music.render(id, seconds, combat)` renders a theme offline for testing.

## Hero and blade looks

Options on the title screen picks how the hero and the sword are drawn,
with a live preview (saved with your game). Colours still come from the
equipped armour and weapon tier; the style is the silhouette.

- Heroes (`HERO_STYLES`): **Wayfarer** (hooded, long split coat, trailing
  scarf - the default), **Dreamer** (spiky hair, jacket, big shoes),
  **Paladin** (winged helm, tabard, long cape), **Ronin** (wide sleeves,
  hakama, headband tails), and the original **Knight**.
- Blades (`BLADE_STYLES`): **Longsword** (the default), **Katana**,
  **Crystal Edge**, **Greatblade**, **Starlight Saber**, and the original
  key-toothed blade.

Each is one drawing method in render.ts (`heroWayfarer`, `bladeKatana`...).

## Combat change

You can turn mid-swing: holding a direction rotates you toward it during
any attack (`TUNING.swingTurnRate`, 11 - a full about-face takes ~0.2s),
and the hitbox and lunge turn with you. The Whirl still spins on its own.

## Tiers and scaling

`TIER_SCALING` (config.ts) multiplies HP/attack/defence/EXP by tier;
`LEVEL_SCALING` adds a little per enemy level inside the tier band
(`TIER_LEVELS`: tier 1 is Lv 1-8, tier 10 is Lv 87-100). Boss attack is fed
in gently and HP scaled (`BOSS_HP_SCALE`, `SHOCK_MULT`) so a slam runs ~16%
of your HP at tier 1 to ~50% at tier 10. 1.45M EXP to level 100.

Bosses: four patterns, each a base AI plus signature moves - **slam**
(ground ring, be airborne), **fan** (bolt spread), **rush** (a string of
lunges), **dive** (lands on a marked spot). Enrage under 50% HP.

## Save

`aerial-finisher-save-v2` holds level, gear, materials, talents and a
`world` block: current region, discovered regions, beaten bosses and
Ascendants, unlocked regions and tiers, trial bests, your position and your
checkpoint. Unlocks are re-derived from beaten bosses on load; a position
that is no longer standable falls back to the checkpoint.

Debug panel (`): **Unlock all areas + tiers**, god mode, levels,
materials; "Skip to wave +5" only works in a Wave Trial.
