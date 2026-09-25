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

# rev 5 - open world

The wave arena is now one part of an open world: a hub, twelve areas on a
road graph, 30 bosses, 30 optional Ascendant superbosses, and forges
scattered across the map. Levels run 1-100.

## New files

| file | what lives there |
|---|---|
| `src/world.ts` | `WorldLocation`, `BossDefinition`, `WorldState`; save (de)serialisation, road lookups, unlock rules, the quest hint |
| `src/location.ts` | the hub and 12 areas, 30 bosses, `ROADS`, tier level bands, station flavour — all data |
| `src/superboss.ts` | Ascendant variants: availability, stat scaling, Star Fragment spoils |
| `src/travel.ts` | `TravelState`: the road clock, roadside spawns, ambushes, turning back |

Build order: config, core, items, talents, world, location, superboss,
music, entities, travel, render, main.

## The loop

`Game.screen` is `'title' | 'location' | 'travel' | 'battle'`.

- **location** - safe. The panel lists the area's bosses (and their
  Ascendants once beaten), the Wave Trial, the forge if there is one,
  Travel (opens the MAP tab), the road home, gear, and Save. A "Next:" line
  points at the cheapest boss that opens something.
- **travel** - pick a neighbour on the map. Roads take `roadTime` seconds,
  and every area also has a direct road home (`hubDistance`) so you can
  never get stuck. Roads use the harder end's look and enemies. Enemies
  arrive at `spawnRate` per minute forever until you arrive; 0-3 ambushes
  of 1-5 enemies stop the clock until cleared. B (or the button) turns you
  around from where you are. Arriving pays EXP for the distance.
- **battle** - a boss fight is two waves of the area's enemies then the
  boss; a Wave Trial is the old endless mode at any unlocked tier. B
  retreats at any time and you keep what you picked up.

Dying loses nothing: you wake at the last safe place (where the road began,
or the area the battle was in).

## Tiers and scaling

`TIER_SCALING` (config.ts) multiplies HP/attack/defence/EXP by tier;
`LEVEL_SCALING` adds a little per enemy level inside the tier's band
(`TIER_LEVELS`: tier 1 is Lv 1-8, tier 10 is Lv 87-100). Enemy attack
grows slowly on purpose - strength counts twice in `physDamage`.

The spec's prose says "5x stats per tier" but its formulas give 1.8x hp
per tier step (tier 3 = 2.6x tier 1). The formulas are implemented as
written; tune them in config.ts.

Measured with on-level gear: ordinary enemies take ~4 hits to kill and ~8
to kill you at every tier. Boss slams go from ~16% of your HP at tier 1 to
~50% at tier 10 (always telegraphed; jump or dash out). 1.45M EXP to reach
level 100, about 20 on-tier kills per level at the top.

## Bosses

Four patterns, each a base AI plus signature moves (`runMove` in
entities.ts): **slam** (ground ring - be airborne), **fan** (bolt spread),
**rush** (a string of lunges), **dive** (rises, tracks, lands on a marked
spot). Enrage under 50% HP; no stagger mid-move. `bossEnemyDef` turns a
`BossDefinition` into a fightable enemy (`BOSS_HP_SCALE`, `SHOCK_MULT`).

Each area's bosses unlock the next area and one Wave Trial tier, and drop
that region's boss-only material (Heartwood, Tidepearl, Relic Gear,
Sunglass, Magma Heart, Rimeshard, Stormfeather, Crownshard).

**Ascendants** appear once the boss is beaten: x1.5 stats, x2 spoils and
EXP, plus Star Fragments - the only way to forge Starforged / Starwoven.
They are tracked separately and unlock nothing.

## Forges

The Haven and six areas have a station. Forging only works there (the tab
reads FORGE; elsewhere it is a read-only RECIPES list). Every recipe is
available at every station and none is gated on level or on owning the
previous tier. Arriving at a station restores HP/MP and restocks items.

## Save

`aerial-finisher-save-v2` gains `world` (current location, discovered,
completedBosses, completedSuperbosses, unlockedAreas, unlockedWaveTiers,
trialBest). `worldFromSave` re-derives unlocks from defeated bosses, so a
save can never hold a kill without the door it opened. Saves from before
the open world keep level, gear and materials and start at the Haven.

## Decisions taken on the spec's open questions

1. Music: the existing score, with intensity driven by the world state
   (calm in locations, peak during a boss). No per-area themes yet.
2. Onboarding: rewritten How to Play, plus the "Next:" hint.
3. Fast travel: none, but every area has a direct road home.
4. Recommended level: shown on the HUD, the panel and the map.
5. Quest markers: the "Next:" hint line.

Not done from the spec: area music themes (stretch), and bosses as random
road encounters (the `TravelEncounter.boss` case) - bosses live at their
areas.

Debug panel: **Unlock all areas + tiers**; "Skip to wave +5" only works in
a Wave Trial.
