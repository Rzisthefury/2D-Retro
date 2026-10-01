# Aerial Conquest

Hyper Knights' campaign (conquer a continent territory by territory from an
illustrated strategy map, with an economy and an army) played with Aerial
Finisher's knight and action combat. `PLAN.md` (v2, approved 2026-10-01) is
the spec and `CLAUDE.md` the build rules. One README section per phase; below
them, the engine notes inherited from Aerial Finisher.

## Build

    tsc -p tsconfig.json     # concatenates src/*.ts -> dist/game.js
    node build.js            # inlines it into dist/ and writes aerial-conquest.html

`aerial-conquest.html` is the playable single file. `dist/` is scratch output.
No dependencies, no bundler, nothing to install.

## Layout (after v2 Phase 0)

| file | what lives there |
|---|---|
| `src/config.ts` | `TUNING`, attack frame data, spells, `ENEMIES`, `UNITS` roster, boss types, `statsForKnight`, **`WAR`** (all new conquest tunables), menu/touch geometry, palette |
| `src/core.ts` | math, buffered input (keyboard, gamepad, touch), WebAudio SFX |
| `src/items.ts` | materials, weapon/armour tiers, recipes |
| `src/talents.ts` | Blade / Arcana / Survival talents, bought with skill points |
| `src/army.ts` | the minion sim: typed-array slots, uniform grid, minion AI, arrows, `MinionRef` |
| `src/music.ts` | AF's adaptive score |
| `src/entities.ts` | `Player`, `Enemy` (with boss AI), `Projectile`, `Pickup` |
| `src/render.ts` | battlefield, characters, VFX, HUD, pause menu, title |
| `src/main.ts` | `Game`: loop, screens (`title`, `battle`), test field, team-aware damage (`hostilesOf`), menus, save, debug panel |

# Phase 2: mass units

Hundreds of minions on the field (PLAN 11.1–11.2), fighting each other, the
elites and the knight.

**What changed**

- **`src/army.ts`** (new): the minion sim, struct-of-arrays.
  - Each minion is a slot in typed arrays: `Float32Array` position, velocity,
    HP, facing and timers; `Uint8Array` type, team and state.
  - A uniform 64 px grid is rebuilt every frame. It serves separation,
    nearest-hostile lookups, the knight's swing arcs and arrow hits.
  - Each minion re-picks the nearest hostile in sight (`WAR.unitSight` 420)
    every 10 frames, staggered by slot. With nothing in sight it marches on
    the enemy side's centre of mass.
  - One windup → hit per swing; no poise and no frame data.
  - States are advance / fight / flee. Flee is wired up but unused until rout in Phase 4.
  - Arrows are lightweight projectiles in the same typed-array style, swap-removed when spent.
- **Roster** (`UNITS` in `config.ts`): the PLAN 11.2 base stats for
  swordsman, spearman (×2 vs beasts), archer (arrows, reach 260),
  shieldbearer (frontal hits −70%), siege ram (ignores units, no knockback,
  walks on the enemy) and Thornhound (beast). Player-side units are ×0.9
  (`WAR.playerTroopMult`).
- **Live caps:** 100 per side on desktop and 60 on phones (`IS_TOUCH`).
  Spawning past the cap is refused; reserve streaming arrives in Phase 3.
- **Knight vs minions:** combo hits and the Whirl hit every Dominion minion
  in the arc (`Game.hitMinions`), and the Tempest pull drags them in. Fire
  and Thunder hit minions, and Fire aims at the nearest minion when there is
  no elite to home on. Allied minions are never hit.
- **Hitstop cap:** non-kill hits on minions give no hitstop. Each knight kill
  adds 1 frame, capped at 2 frames per sim frame (`WAR.minionHitstopCap`), so
  a Whirl through a crowd doesn't freeze the game. Hit and death sounds are
  rate-limited to one every 50 ms.
- **Elites ↔ minions:**
  - Elites pick the nearest hostile minion within `WAR.eliteSight` 900
    (through `MinionRef`, a small handle that acts like any Combatant).
  - An elite's swing mows through every minion in its arc.
  - Boss shockwaves and caster bolts hit minions.
  - Minions target and damage elites and the knight. The knight's 34
    i-frames after a hit stop a crowd from stun-locking them.
- **Rendering:** simple team-coloured figures (blue for you, crimson for the
  Dominion) with walk cycles, windup poses and per-type weapons; the ram is a
  log with four crew, the hound a thorny beast. On-screen minions are sorted
  by y and merged into the depth-sorted elites and knight, with no
  per-minion closures, and all minion shadows are drawn in one batched path.
- **Frame loop:** the next frame is requested before any work, so an
  exception in one frame can no longer stop the game. Frame work (sim +
  draw) and frame gaps go into a ring buffer (`perfWork`, `perfGap`).
- **Test field:** each group is a Dominion block of minions (in the PLAN 6
  40/20/25/15 mix, archers at the back) led by up to 3 Shades, against an
  allied squad topped up to 16. The debug panel has **100 v 100 minions**
  (`Game.massTest`).

**Verified**: headless Chromium, desktop + emulated iPhone 13, 23/23:

- **Done-when, desktop:** 200 live units (100 v 100, fighting) for 6 s. Frame
  work averaged 1.37 ms, p99 2.8 ms, max 4.1 ms; 60 fps; no frame over 25 ms.
- **Done-when, phone:** 120 live units (the 60-per-side phone cap) on the
  Playwright iPhone 13 profile, which emulates the device but not its CPU.
  Frame work averaged 1.13 ms, p99 2.3 ms; 60 fps.
- **Done-when, Whirl:** a Whirl through 20 swordsmen killed all 20. Worst
  frame 5.3 ms, none over 25 ms. Minion kills added at most 2 hitstop frames
  per sim frame.
- **Hitstop cap:** 20 kills in one call add exactly 2 frames; 1 kill adds 1.
- **Feel target:** over 2,000 simulated swings, the knight's opening slash
  kills a tier-1 swordsman in 2 hits about 95% of the time and in 1 hit (a
  high crit) about 5%; it never takes 3. Live, a swordsman died to the
  opening combo in 2 presses.
- Minions hurt the knight. Shieldbearer frontal hit: 20 → 6 (−70%), and 20
  from behind. Spearman vs hound is double his damage vs a swordsman. The
  ram never targets units, takes no knockback and walks on. Archers' arrows
  hit.
- An allied elite targets and kills Dominion minions; a Dominion elite does
  the same to allied minions; minions damage elites.
- The knight's combo, Whirl and Thunder never touch allied minions. Fire and
  Thunder hit Dominion minions.
- The desktop live cap holds at exactly 100. The grid's nearest-hostile
  matched a brute-force search in 200 random queries.

**Phone CPU, not verified.** Playwright's iPhone 13 profile doesn't slow the
CPU, so I also ran it with Chromium's CPU throttling. With 120 units: 2× gave
about 50–53 fps and 4× about 21–23 fps. At 4×, even an empty field only
reaches about 36 fps, because headless Chromium draws the canvas in software
on the throttled thread, while a real phone uses its GPU. Two standard
optimisations were tried and measured: a pre-rendered ground and cached
minion sprites. Both were slower in this software canvas (4×: 19 fps with
120 units, 31 fps empty; at 1.5× cache scale, as low as 8 fps), so neither
shipped. **A test on a real phone is the real answer here.**

**Bug found and fixed during the phase:** the grid's cell table started as
zeros instead of "empty" (-1). An elite looking up minions before the first
grid rebuild walked slot 0 → slot 0 forever, which hung the page. It now
starts at -1 and is reset on `clear()`.

# Phase 1: teams

Allies are `Enemy` entities on the player's side. This is the base for the
warband, generals and armies (PLAN 9.2, 11.1).

**What changed**

- `Enemy.team` (`'player' | 'enemy'`, default `'enemy'`) and `Enemy.target`.
  Every `WAR.retargetFrames` (10) frames a unit picks the nearest hostile.
  Dominion units can pick the knight or any ally; allies pick any Dominion
  unit. A unit sticks with its current target unless a new one is clearly
  closer (`WAR.retargetSwitch` 0.8), so it doesn't flip-flop between two foes.
- All four AIs (grunt, bruiser, caster, flyer), the idle "notice" check and
  the boss moves (slam, fan, rush, dive) chase and aim at `target` instead of
  the knight. `Player` has `team = 'player'`; `Combatant = Player | Enemy`.
- Hits are resolved by team in `main.ts`:
  - `hostilesOf(team)` lists who a side may fight.
  - `enemyStrike` lands on every hostile in the arc (the knight, allies, or
    Dominion units).
  - Bolts carry a `team` and hit the first hostile they touch.
  - A boss shockwave hits every grounded hostile in its ring.
  - Unit-on-unit damage uses the normal formula, scaled by
    `WAR.unitDamageMult`, with light poise damage (`WAR.unitPoiseDamage`).
- The knight never hurts allies. Combo hit resolution, Whirl pull, attack
  homing, lock-on cycling, touch auto lock-on, Fire homing and Thunder all
  skip `team === 'player'`.
- An ally with nothing to fight falls in beside the knight
  (`WAR.allyFollowRange` 160 px). Its follow speed is pegged to the knight's
  walk (×0.8 near, ×1.1 when over 2× the range behind), so allies keep up
  whatever their own speed. This needed `MOVE_GAIN`: enemy movement eases
  and damps velocity, so a unit settles at about 48% of the speed it asks for.
- Allies look different: blue-washed body, blue eyes/trim, a blue ground
  ring, and a blue health bar.
- Test field: two allied Shades (`WAR.testAllies`) fight beside the knight
  and are topped back up with each new group. A group counts as cleared when
  no Dominion units remain. The HUD shows foes and allies separately.

**Verified**: headless Chromium, desktop + emulated iPhone 13, Phase 1
suite 17/17, plus the Phase 0 suite as regression:

- **Done-when:** an allied Shade fights two hostile Shades with the knight out
  of reach. It damages them and kills at least one within 9 s.
- **Done-when:** the hostiles fight the ally (its HP drops). A hostile targets
  the knight when the knight is nearer and switches to the ally when the
  knight steps back.
- The knight's combo, Fire and Thunder leave an ally untouched; lock-on skips allies.
- A hostile caster's bolts hurt the ally. An allied caster's bolts hurt the
  foe and never the knight. A boss shockwave damages allies.
- An idle ally walks to the knight, and keeps within range while the knight walks.
- A group clears while an ally still lives, and the next group tops allies back to 2.
- Phone: the test field has its allies, and touch auto lock-on picks the foe, never the ally.

Final runs: Phase 1 suite 17/17 on 5 consecutive runs; Phase 0 suite 30/30
on 3 more.

**Bug found and fixed:** the renderer's colour helper (`hex`) only read
6-digit `#rrggbb`. A 3-digit `#rgb` colour (used by a test boss) produced
`NaN`, and the canvas exception stopped the whole frame loop. All shipped
colours are 6-digit, so players couldn't hit it, but generated lord palettes
(Phase 11) could have. `hex` now reads both forms and falls back to grey
instead of `NaN`. Checked directly: `#fa4` and `#ffaa44` give the same result.

**Test-harness note:** the Phase 0 save round-trip check failed
intermittently (about 1 run in 6). Diagnostics showed the save key missing
after a reload, not overwritten. The game has no code that deletes a key.
The cause was the test's own page-start script, which re-runs on every
reload and sometimes wiped storage. With it removed, that suite passed 17
runs in a row. Separately, a direct save→reload stress test lost 0 of 60 saves.

**Assumed / not checked**: how fights feel on a real phone; balance of
unit-on-unit damage (tuned in Phase 14).

# Phase 0 (v2): strip

PLAN v2 keeps only Aerial Finisher's knight, combat, talent tree, gear and
music. This pass removes everything else.

**What changed**

- **Deleted** `world.ts`, `location.ts`, `overworld.ts`, `dungeon.ts` and
  `superboss.ts`, plus everything that read them: the walkable tile world,
  regions and barriers, towns, landmarks, chests, waypoints, checkpoints,
  roaming spawners, dungeons and their rooms, AF's 30 bosses, Ascendants,
  the MAP tab, the minimap, door prompts and the LEAVE button.
- **Levels and EXP removed.** `statsForLevel`, `expToNext`, `MAX_LEVEL`,
  `Player.level/exp`, `grantExp` and the EXP bar are gone. The knight's base stats come
  from `statsForKnight(upgrades)` (PLAN 12.1: Vitality / Might / Arcana
  ranks, each worth `WAR.levelsPerRank` = 4 old levels). All ranks are 0
  until the gold shop arrives in Phase 11, which gives AF's level-1 stats.
- **Talents cost skill points (SP)**, not AP-per-level. `Player.skillPoints`
  starts at `WAR.startSkillPoints` = 5 (PLAN 12.2). The HUD and menus say SP.
- **No field drops.** Kills no longer drop materials or potions. PLAN v2 pays
  spoils on the battle results screen (Phase 4+).
- **New screen set:** `title` and `battle`. New Game / Continue opens a
  **test battlefield** (1920×1200, `WAR.testField`) with new top-down art:
  mown grass bands, dirt patches, tufts, pebbles, wildflowers and a treeline
  border, all placed from a cell hash so they stay fixed while the camera
  scrolls. Groups of Shades (shade / caster / flyer / bruiser) keep coming;
  each cleared group brings a bigger one after `WAR.testRespawnDelay`.
  Dying restarts the field and keeps gear, talents and materials.
- **Pause menu:** 4 tabs, Gear · Forge · Talents · Status. Forging works
  anywhere for now; PLAN puts it at castles, with a gold fee, in Phase 11.
  The SP badge moved left so it no longer overlaps the close box.
- **Music:** the battle plays AF's forest theme for now; PLAN maps the war
  contexts and adds the war layer in Phase 13. `ZONE_MUSIC` (region map) removed.
- Enemy overworld leash removed; idle "notice the knight" AI kept for
  garrisons later. The boss AI types moved to `config.ts` for castle lords.
- Save (`aerial-conquest-slot1`) now holds SP, upgrades, gear, materials,
  talents, supplies and looks. No level, EXP or world block.
- Source: 9,163 → 6,802 lines.

**Verified**: headless Chromium (Playwright), desktop 1280×800 and emulated
iPhone 13 landscape. 30/30 checks passed on 5 consecutive runs. One earlier
run failed the reload check; the cause was the test's own storage seeding (a
`sessionStorage` flag lost across reload on `file://`), and moving that marker
into localStorage cleared it:

- the removed globals (`WORLD_MAP`, `LOCATION_LIST`, `dungeonRooms`,
  `makeAscendant`, `freshWorld`, `expToNext`, `MAX_LEVEL`, `statsForLevel`,
  `ZONE_MUSIC`) don't exist; `Player` has no level/EXP; `Game` has no world/dungeon
- title → Start → test field with Shades; the camera scrolls as the knight
  walks; the knight is held inside the field
- ground combo, air combo (airborne hits), Whirl finisher (6/6 enemies around
  hit), dash charge, Fire spell (MP spent, damage dealt), and a bruiser
  guarding a frontal hit
- talents cost SP (5 → 3 for Whirl); a cleared group is followed by a new one
- 4-tab menu; forging w2 with materials equips it; AF's score plays on the field
- death → R → field restarts at full HP with gear and talents kept
- save has SP/upgrades and no level/world keys; the AF save is untouched;
  upgrades raise stats and survive a reload
- phone: touch mode, tap Start, ATK hits, stick moves the knight, MENU button
  + tab tap, close box; no page errors on either device

**Assumed / not checked**: real-phone feel, gamepad, audio output (headless).
The items list still has AF's 16 materials and Ascendant flavour text. PLAN
cuts it to one continent's worth in Phase 11.

# Phase 0 (v1): fork & strip (superseded)

The first pass under PLAN v1: forked Aerial Finisher into this folder,
renamed it to AERIAL CONQUEST (canvas wordmark measured with `measureText`,
page title, header), changed the save key to `aerial-conquest-slot1`,
removed the Colosseum and Wave Trials, and made `build.js` write
`aerial-conquest.html`. All of that carries into v2.

---

# Inherited: Aerial Finisher engine notes

Everything below documents Aerial Finisher's engine as forked. Phase 0 removed
the Colosseum, Wave Trials, the open world, dungeons, levels/EXP and the
`aerial-finisher` save keys, so mentions of those below are historical. The
knight, combat, talents, gear, music and touch controls are as described.

## Aerial Finisher — v1 combat arena

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

# rev 6-7 (kept parts)

The open world, regions, dungeons, barriers and their music mapping were
removed in v2 Phase 0. What survives:

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

## Boss AI

Bosses: four patterns, each a base AI plus signature moves - **slam**
(ground ring, be airborne), **fan** (bolt spread), **rush** (a string of
lunges), **dive** (lands on a marked spot). Enrage under 50% HP.

