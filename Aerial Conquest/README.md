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
| `src/army.ts` | the minion sim: typed-array slots, uniform grid, minion AI, arrows, `MinionRef`, reserves, orders, rout |
| `src/generals.ts` | castle Lords and generals: the roster record, Lord generation (pattern, moves, palette, level), command, boss data, their lines |
| `src/war.ts` | the war on the map: village income and stores, convoys (yours and theirs), castle garrisons and recruiting, node upgrades, the warband, armies, the off-screen sim (fights), join / intercept / ambush / defense specs, the Dominion's campaign AI (war clock, musters, grace, targeting, economy), saves |
| `src/campaign.ts` | the continent: territories, nodes, roads (data), borders, road paths, ownership, the frontier rule, garrisons and each node's battle spec |
| `src/battle.ts` | battles: spec, seeded layouts for all eight types, `Structure` (houses, walls, gates, throne, wagons, rings, cell), zones and doors for walled layouts, objectives, scenery palettes, the stub's battle list |
| `src/music.ts` | AF's adaptive score |
| `src/entities.ts` | `Player`, `Enemy` (with boss AI), `Projectile`, `Pickup` |
| `src/render.ts` | the campaign map, battlefield, characters, VFX, HUD, pause menu, title |
| `src/main.ts` | `Game`: loop, screens (`title`, `campaign` map, `battle`, debug `sandbox` battle list), battle flow and results, test field, team-aware damage, orders, menus, save, debug panel |

# Update: invisible wall, longer keep fight, earned spells, Thunder ring

**Invisible wall.** Structures were culled by a single anchor point, the
bottom-centre of their footprint. A long wall whose anchor was off
screen vanished even while most of it was in view. Every keep and castle
wall could do it. They're now culled by their whole footprint.

**Longer keep fight** (Michael: more defenders inside):
- A keep is now won when the gate is down, the Captain is beaten, **and
  the garrison is broken**: down to a quarter of its strength
  (`WAR.keepBreak` 0.25), after which the rest flee. Before, the Captain
  alone ended it however many defenders were left, so more defenders
  changed nothing. The objective reads "Break the garrison" once the
  Captain falls.
- Garrison 50 → **120** (`keepGarrison`), battle reinforcements 100 →
  **340**, streamed in steady waves (`battlePace.keep` 2 → 3).
- Millbrook (tier 1) with ~30 troops on autopilot: **won 6 of 6 at about
  160 s** (gate down at 22 s). It used to end at about 60 s.

**Earned spells** (Michael: by conquest; Cure fairly early). All four
start locked, and each is learned by the first capture of a node type:

| spell | learned by |
|---|---|
| Fire | your first keep |
| Cure | your first castle (the first territory, early) |
| Blizzard | your first tier-3 castle |
| Thunder | your first tier-4 castle |

- Rules live in `WAR.spellUnlock` and are derived from your first
  captures, so existing saves get credit for what they already took.
- Learned spells are kept on the knight: saved, and kept through New
  Game+.
- **Locked:**
  - casting tells you how to learn the spell ("FIRE: TAKE A KEEP TO
    LEARN IT");
  - the Magic menu shows LOCKED; touch chips show a dot.
- **Learned:** a banner (after any capture banner) and a portrait line;
  battle results list "spell learned".
- The Status tab lists your spells.
- The test field and the debug battle list keep all four, for practice.

**Thunder** strikes **every** Dominion unit within **200 px** of you
(Storm Surge: 280 px), at 80% of its old per-target damage, with a ring
showing the radius.
- It respects walls and closed gates.
- Full bolt effects on the nearest 10 targets; the rest flash, which
  keeps big crowds cheap.

**Verified** (headless Chromium): new suite `tests/update1.js` **11/11**.
- With the camera on a keep wall's top half and its anchor 160 px below
  the screen, the wall is drawn.
- **Spells:**
  - A new game knows none; casting one is refused with no MP spent.
  - Keep → Fire, castle → Cure, tier-3 castle → Blizzard, tier-4 castle
    → Thunder.
  - They survive a reload and New Game+; the test field has all four.
- **Thunder:** 16 of 16 at 150 px hit, 0 at 250 or 340 px. With Storm
  Surge, 250 px is hit and 340 px is not.
- **Keep:** the Captain down with the garrison standing is not the win;
  breaking the garrison is. Millbrook ran 2-4 min, 3 of 3.
- **Regressions:** Phases 0-14 all pass. Phase 5's debug-list timing is
  now 6 of 8 in band (keeps now in).
  - Phases 5 and 11 now break the garrison after the Captain.
  - Phases 8 and 10 pin the old 50-defender keep: their sim checks were
    sized for it.
  - Phase 14's through-the-gate check spawns past the live cap.
- **Four Normal campaigns on autopilot:** 173, 181, 185, 194 min, all
  won. Keeps now take about 160 s each.

**Not verified:** how the earned-spell pacing feels by hand. Fire comes
at your first keep. Cure at your first castle is typically 15-25 min in,
going by the harness.

# Fix: keep gates (Michael's playtest of Millbrook Keep)

**Reported:**
1. The keep's gate took far too long to break.
2. Defenders crowded the inside of the gate, and you could kill them
   through it before it broke.

**Cause:**
1. Knights did 30% damage to gates (a rule meant for castle gates, where
   rams do the work). With keep gate HP at ×4 the base, Millbrook's
   (tier 2 while its outpost stands) took **295 s** with a new game's
   12-strong warband, **458 s** alone.
2. A defender with no target "marches on the enemy's centre", and the
   pathfinding treats a spot within 60 px of a gateway as reachable from
   either side. With your troops pressed against the gate, the whole
   garrison walked up to its inside. On top of that, melee arcs, boss
   shockwaves and Thunder never checked for walls.

**Changed:**
- **Keep gates** take the knight's full hit (`WAR.keepGateKnight` 1;
  castle gates stay at 0.3) and have less HP (`WAR.keepGateMult` 4.0 →
  1.3).
- **Defenders** whose enemy is still behind their closed gate hold their
  posts (`Army.think`).
- **Nothing hits through a closed gate or a wall** (`Game.blocked`):
  - the knight's swings and Whirl, and the hits on elites;
  - elites' and minions' melee;
  - boss shockwaves;
  - Thunder's targets.
  - Arrows and spell bolts already stopped on walls and gates.

**Verified** (headless Chromium):
- Millbrook's gate falls in **43 s** with the starting warband (50 s
  alone).
- With your troops pressed against the gate: **68** defenders crowded its
  inside on the old build, **0** now.
- **Point blank through the closed gate:**
  - old build: a swing took a defender from 54 to 36 HP, a Whirl to 25;
  - now: no damage from either.
  - With the gate down, the same swing lands (54 → 36).
- Phase 14 suite 7/7 (three new gate checks); Phases 0-13 all pass.
- **Four campaigns:** won in 165-188 min (as before).
  - Whole keep battles now take about 50-60 s, under PLAN's ~3 min,
    because the gate used to be most of the fight.

# Phase 14: balance + index.html card

**How it was balanced:** a new harness, `tests/campaign14.js`, plays a
whole Normal campaign on autopilot from New Game to the warlord, with
the Dominion AI on.

- **Strategy:** small nodes before keeps and castles, lowest tier first.
  It attacks when the warband is nearly full, joins the defense of its
  nodes, and recruits beaten Lords.
- **Spending:** castles, villages and gear first, then knight upgrades,
  keeping a buffer for recruiting. Talents go to Command first.
- **Measures:** campaign time (map + battles) and every battle's length
  in real campaign context.
- **Speed:** a 3-hour campaign simulates in about 1.5 minutes, so every
  change below was measured over whole campaigns, not guessed.

**What it found, and what changed** (all in `WAR`):

| problem (baseline: not won in 6 h, 66 knight deaths) | change |
|---|---|
| your captured villages, outposts and keeps had **0 defenders**, so any 6-unit Dominion squad retook them on arrival (50 losses, none defendable) | **militia** (new): villages 6 (+4/level), outposts 8, keeps 12 + `keepDefenders`; refills 2/min. The Dominion now has to fight for them, and you can join the defense |
| with villages defended, the AI took the **Last Camp** itself (the warband refill empties its garrison). No castle means no production, a dead campaign | the Dominion **never targets your last castle** (new rule) |
| knight upgrades lagged far behind tier scaling (5k gold banked, rank 7 cost 4,900) | `upgradeCost` 100 → **40** × rank² |
| tier 4–5 **keeps** killed the knight 94 times in one run: a 150 s gate, then a 5,559 HP Captain | Captain HP 2000 → **1300**, attack 14 → **11**; `keepGateMult` 4.5 → **4.0** |
| the **warlord** won about 5 duels per campaign against a fully geared first-run knight | HP 1500 → **1000**, attack 18 → **15**, level 20 → **16** (all four phases and both moves unchanged) |
| villages ended in about 66 s and outposts in about 28 s (band ~2 min) | `houseHp` 800 → **1300**; outposts 50 → **90** defenders, reinforcements stream ×2 faster |
| map waits for the warband | castle production 6 / 10 / 16 → **8 / 13 / 20** a minute (`WAR.castleProduction`; PLAN 5.2's table) |

- The debug autopilot now also casts Cure below 50% HP when its MP is
  full, as a competent player would. Before, it only drank potions.
- **index.html:** the existing Aerial Conquest card (it said "In
  development") now describes the finished game.

**Verified**: headless Chromium. Phase 14 suite 4/4.

- **DONE, landing page:** the repo root `index.html` has the Aerial
  Conquest card; clicking it opens the game's title screen.
- Militia raises 6 / 12 and refills 2 a minute. An empty Last Camp is
  never a target.
- **DONE, campaign:** six full Normal campaigns on autopilot with the
  final settings: **168, 173, 185, 189, 192, 235 minutes**, all won (the
  suite's own run: 185 min).
  - Median about **187 min (3.1 h)**: map waits about 40-45 min, battles
    the rest.
  - The 235-minute run lost 9 duels to the warlord; he is the main
    source of variance.
- **Battle times in campaign context** (medians across those runs) vs
  PLAN 10.2:
  - villages 93-96 s (band 80-160): **in**
  - keeps 110-126 s (120-240): **mostly in**
  - castles 219-256 s (240-360): **at the lower edge**
  - outposts 41-56 s (80-160): **short**. The warband floods the ring;
    PLAN's 10 s hold is kept.
  - defenses about 9 s. The Dominion's raids on your militia are small
    by PLAN 8's sizing rule (70-110% of the defender).
- **Debug battle list** (Phase 5 timing, its assumed knight ranks): 5 of
  8 in band. Village, keep, convoy, defense and field are in. Outpost is
  out (about 57 s) and castle is borderline (234 / 262 s). Rescue still
  loses on autopilot, as before.
- **Regressions:** Phases 0-13 all pass.
  - Updated for the tuned values: Phase 7 (production rates), Phase 9
    (the spared last castle: its targeting tests add a second, held
    castle) and Phase 11 (upgrade cost).
  - Phase 2's 120-unit phone check failed once more on frame gaps (53.4
    fps with 1.0 ms of work per frame) and passed on rerun, as in Phase
    13.

**Assumed / not verified:**
- **Human play time.** The autopilot is a stand-in. A person spends time
  on map decisions the harness doesn't, and probably dodges better than
  it does. Expect roughly 2.5-3.5 h on Normal; only a real playthrough
  will tell.
- Easy and Hard weren't run through whole campaigns; their multipliers
  are PLAN's.
- Field, convoy and rescue battles don't come up in the harness's
  strategy, so they're tuned only on the debug list.

# Phase 13: music war layer, touch polish, phone caps

**What changed** (PLAN 13 music; PLAN 10.1 / 15 touch):

- **Intensity ladder** (`Game.musicLevel`, fed to `Music.target` every
  frame):

  | level | when | music |
  |---|---|---|
  | 0 | calm map, title, victory screen | theme only |
  | 1 | map under threat: a muster or a Dominion army heading for your land, or a fight at one of your nodes | soft war layer |
  | 2 | any battle | combat layer + war layer |
  | 3 | 60+ live units (back to 2 under 50, so it doesn't flap), or a castle siege past its outer gate | full war layer |
  | 4 | a Lord in the fight, or the warlord once his gates are down | the boss theme |

- **Themes:**
  - Title and victory: AF's title theme. The map: *Above the Storm*.
  - Battles: the scenery's theme (forest, coast, ruins). Level 4
    switches to *Crown of Thorns*.
- **War layer** (`music.ts`):
  - A snare march with a four-stroke roll into each bar line, plus low
    brass on the root and fifth: saw + square through a 380 Hz lowpass.
  - Its bus comes in and out on bar lines only (gain by level:
    0 / 0.5 / 0.6 / 0.95 / 0.75), kept under the melody bus.
- **Portrait:** the rotate prompt already existed, but the game kept
  running behind it. Now nothing ticks while a phone is upright, and it
  resumes on turning back.
- **Phone caps:** 60 live per side (`WAR.liveCapPhone`), already in
  since Phase 2; now checked in a full siege.
- The page's help strip and footer described Aerial Finisher; they now
  describe this game.

**Verified**: headless Chromium, desktop + emulated iPhone 13. Phase 13
suite 16/16.

- **The ladder:**
  - Title 0 → calm map 0 (*sky*) → a muster on the Last Camp 1 → an
    army marching on it 1 → back to 0.
  - Village raid 2 (*forest*). 62 live units → 3; 55 → still 3; 48 → 2.
  - Siege: outer gate up 2 → broken 3 → the Lord aggro 4 (*boss*) → the
    Lord down 3.
  - The warlord's seat: 4 once its gates fall.
- **Live audio:** with the score running, after a bar line at level 3
  the war bus read 0.95.
- **Offline render (6 s):** no war events at 0, 20 at each of levels
  1-4.
  - With seeded noise, level 1 is louder than level 0.
  - The layer adds about 6% of the mix's RMS (0.0126 vs 0.218), so it
    sits under the tune.
- **Phone siege:**
  - Tap Millbrook Castle on the map → tap Attack → the siege.
  - 60 enemy units live, 60 more in reserve.
  - CMD tap cycled Follow → Charge; ATK tap swung.
  - 8 s of real-time play: 60 fps, frame work avg 1.7 ms, p99 3.4 ms.
  - On autopilot it played to a win. Tapping Recruit, then back, left
    the castle yours.
- **Portrait** (390×844 mid-battle): stage hidden, rotate prompt shown,
  battle time frozen for 1.2 s. Landscape resumed it.
- Regressions: Phases 0-12 all pass: 30/30, 17/17, 23/23, 24/24,
  24/24, 46/46 functional, 31/31, 24/24, 17/17, 20/20, 28/28, 34/34,
  19/19.
  - Phase 2's 120-unit phone check failed once at 54.9 fps (55 needed).
    Frame work was 1.0 ms avg, but the browser delivered frames every
    18 ms. It passed on the rerun at 57.8 fps (p99 work 1.6 ms).

**Assumed / not yet verified:**
- How it sounds. The checks prove the war layer is scheduled and sits
  under the tune, not that the mix is right; that needs your ears.
- Real phone hardware: the iPhone was emulated on a desktop CPU.
- **Balance note for Phase 14:** the autopilot siege at Millbrook (tier
  2) took 744 simulated seconds with a 12-unit warband against the phone
  cap. The band is 240-360 s.

# Phase 12: story, difficulty, New Game+, victory, 3 slots

**What changed** (PLAN 13):

- **Three save slots** (`aerial-conquest-slot1..3`; Aerial Finisher's
  keys are never touched).
  - Title → **Play** → slot picker. Each slot shows territories held,
    play time, difficulty, NG+ and VICTORY.
  - An empty slot goes straight to Easy / Normal / Hard. A used slot
    offers Continue / New Game (which erases it, after a difficulty
    pick).
  - The title's **Continue** opens the most recently saved slot (no
    extra storage key).
- **Difficulty** is chosen at New Game and can be changed in Options (a
  new Difficulty row; it changes the current slot).
  - Dominion damage in your battles is ×0.7 / ×1 / ×1.3
    (`WAR.enemyDamage`).
  - Enemy income ×0.8 / ×1 / ×1.25 and the war clock 240 / 160 / 110 s
    were already in (Phase 9).
- **Story:**
  - Text cards with the knight's portrait for the intro (on New Game),
    the ending and New Game+. Any key or tap moves on.
  - A short portrait line at the foot of the map for the first keep,
    first castle and first general. It doesn't block play.
  - The per-general lines (recruit, ≤25 loyalty, defect, rescue) were
    already in (Phase 10).
- **Victory:** when the warlord's seat is yours, by your army or live,
  the ending card plays, then the **victory screen**. It shows total
  time, battles won / lost, nodes captured, generals recruited /
  defected / rescued, gold earned, troops lost, highest combo,
  difficulty and NG+ cycle. Then **New Game+** or **Title**. Continuing
  a won slot shows the ending again.
- **New Game+:**
  - Keeps knight upgrades, talents, gear, materials and SP.
  - Resets the land, generals, gold and tallies.
  - Per cycle, the Dominion's HP and damage are ×1.5 in battle (minions,
    elites, Lords, the warlord) and their sim strength ×1.5
    (`WAR.ngStats`). The war clock is ×0.8 (`WAR.ngClock`).
  - The cycle shows on the slot and on the title.
- Saves now also carry difficulty, NG+, the run's tallies, the story
  lines seen and a timestamp; all are validated on load.

**Deviations / choices:**
- **War clock by difficulty:** PLAN 13 says ×1.4 / ×0.75, but PLAN 8
  gives 240 / 160 / 110 s (×1.5 / ×0.69). I kept PLAN 8's numbers
  (built and verified in Phase 9).
- Difficulty damage applies in your battles, not the off-screen sim.
  NG+ scales both.
- First keep, castle and general use a non-blocking portrait line, not a
  full card, so they never interrupt a map action.
- NG+ pays SP for first captures again. The tree is already full at 42,
  so it has nothing to buy (Phase 14 can decide).
- "Battles lost" counts falls and retreats. "Troops lost" counts your
  live battles only, not the off-screen sim.
- Older suites now walk the new title flow (helpers `titleStart` /
  `titleTapStart`); their checks are unchanged.

**Verified**: headless Chromium, desktop + emulated iPhone 13. Phase 12
suite 19/19.

- **Fresh title:** Play → slot picker → Slot 2 (empty) → Normal
  preselected → Hard → intro card → map. Only slot 2 was written.
- **Difficulty:** Hard: Dominion damage ×1.3, clock 110 s. Easy: ×0.7,
  240 s. The debug battle list fights at ×1.
- **DONE, scripted fast run:** take everything but the seat, recruit a
  Lord (the three story lines fired), beat the warlord live, Enter →
  ending card → victory screen.
  - The screen read: won 1 / lost 0, 62 nodes captured, 1 / 0 / 0
    generals, gold 1101, combo 3, Hard, first campaign.
- **DONE, NG+:** upgrades, weapons, materials, talents and SP were kept;
  gold 0, 1 territory, all Lords back, tallies 0.
  - In battle: Dominion HP ×1.5, damage ×1.95 (×1.5 × Hard's 1.3).
  - Sim ×1.5; clock 110 → 88 s.
- **DONE, slots isolated:**
  - Slot 2 (NG+1, 777 gold) was untouched by a new game in slot 3
    (5 gold, NG 0, no upgrades).
  - Slot 1 stayed empty; the Aerial Finisher save was untouched.
- **DONE, reload:**
  - Continue opened the newest slot (3).
  - Slot 2 via the picker came back identical: node owners and levels,
    gold, NG+, difficulty, upgrades and story lines.
- **Options:** Difficulty changed slot 2 only. New Game on a used slot
  asked for a difficulty and wiped only that slot.
- **Phone:** tap Play → Slot 1 → Normal → intro → map; the victory
  screen's Title button by tap.
- **Regressions:** Phases 0-11 all pass: 30/30, 17/17, 23/23, 24/24,
  24/24, 46/46 functional, 31/31, 24/24, 17/17, 20/20, 28/28, 34/34.

**Assumed / not yet verified:**
- A real playthrough to victory. The run was scripted: nodes captured in
  code, the warlord killed by the test.
- Play time counts the map and map battles, not the title, pauses or
  open story cards.

# Phase 11: progression and bosses

**What changed** (PLAN 11.3, 12; numbers in `WAR`):

- **Knight upgrades (gold):**
  - New **Knight** tab in the pause menu (tabs are now Gear · Forge ·
    Talents · Knight · Status, keys 1-5).
  - Vitality, Might and Arcana, 10 ranks each. A rank costs
    `100 × rank²` gold (`WAR.upgradeCost`).
  - Each row shows the stat now → after the next rank.
- **Skill points from conquest:**
  - +2 for the first capture of each enemy castle, +1 for each keep, plus
    a capital bonus (`WAR.spCastle / spKeep / spCapital`).
  - First capture only: a node lost and retaken pays nothing again
    (`War.spTaken`, saved).
  - Live captures list the SP on the results screen; captures by your
    off-screen armies get a banner on the map.
- **Command branch** (the 4th column in Talents):
  - Rally Banner, Drillmaster, Sharpened Steel, Muster, Warlord's
    Presence, Grand Host, per PLAN 12.2.
  - HP and damage apply to your troops as they spawn.
  - Muster speeds your reserve stream ×1.3.
  - Presence: +20% damage for your troops within 300 px of the knight.
  - The off-screen sim multiplies your armies and garrisons by the same
    HP × damage.
- **Warband cap** = 12 + talents (8 + 12 + 16) + 3 per L3 castle
  (max 12) = 60.
- **Forge:**
  - Recipes cost gold + materials.
  - Forging works only on the map, at a castle you hold: open the menu
    from the map (MENU button bottom-left, or Tab), or use your castle's
    new **Forge** button. In battle the tab is read-only.
- **Materials** cut to 4 common (Shadow Shard, Bulwark Plate, Chant
  Sigil, Dark Iron) + 3 rare (Wisp Ember, Radiant Crystal, Void Core).
  - Won battles pay 1-3 commons × tier.
  - A castle pays 2 of its Lord's rare by territory tier: ember at tiers
    1-2, crystal at 3-4.
  - The warlord pays 3 Void Core.
  - Recipe gold: 150 / 400 / 900 / 1800 / 3500 for tiers 2-6.
- **Gear** cut to 6 weapon and 6 armour tiers (PLAN 12.3). AF's tiers
  7-11 needed boss materials that no longer exist. Saves holding them
  fall back to a valid tier on load.
- **Warlord Garrick Thorne** holds the capital. He has two signature
  moves:
  - **Thornline**: a line of six shocks marching at you.
  - **Howl**: calls a pack of 6 Thornhounds, even past the live cap,
    while fewer than 12 are on the field.

  He fights in four phases, a new pattern per quarter of his HP:
  brute → stalker → sorcerer → skylord. Beaten before the throne he
  "FALLS" (no recruit offer). The debug battle list has his fight.
- **Thornhounds:**
  - Packs of 6: one per tier-4 node, two per tier-5 node, in their
    garrisons too.
  - Every army marching out of the warlord's land brings a pack.
- Lords (Phase 10) and named keep Captains (Phase 5/6) were already in.
- **Map panel:** a panel with 5+ buttons (your castle) lays them out two
  per row, with labels shrunk to fit. Before this, the General button
  overlapped the castle's garrison rows. A stale "arrive in Phases 8 and
  10" line is gone.

**Deviation:** PLAN 12.2 counts 12 keeps, but the map has 11 enemy keeps:
the Last Camp has no keep, per PLAN 4. 5 + 22 + 11 + 3 would be 41, so the
capital bonus is **+4** (not +3) to land the whole tree exactly on 42.
Change `WAR.spCapital` if you'd rather have it another way.

**Verified**: headless Chromium, desktop + emulated iPhone 13. Phase 11
suite 34/34.

- **Warband cap:** 12 → 20 → 32 → 48 → 51 → 54 → 57 → 60, and a 5th L3
  castle stays at 60.
- **SP:** capturing all 11 castles and 11 keeps went 5 → 42. A retaken
  castle and a village paid 0. A live keep paid +1 and said so; the
  live capital paid +6.
- **Knight tab** by keys: 100 then 400 gold, next 900; rank 10 refuses.
- **Talents:** Left wrapped to Command, Enter learned Banner (cap 20), a
  double tap learned Sharpened Steel.
- **Forge:** Iron Fang took 150 gold, 4 shard and 3 iron. Materials
  without the gold: refused, nothing spent. Mid-battle: refused. The
  castle's Forge button opens the Forge tab.
- **Reload:** upgrades, talents, SP, free SP, gold, first captures and
  the Presence loyalty multiplier all came back. The keep taken before
  the reload paid nothing again.
- **Troops in battle:** HP ×1.3 (27 → 35), damage ×1.15, stream ×1/1.3,
  Presence 1.2 near / 1.0 far. Sim ×1.495.
- **Thornhounds:** 0 / 6 / 12 at tiers ≤3 / 4 / 5, garrisons matching. A
  capital army carried 6.
- **Spoils:** a tier-1 castle paid 2 Wisp Ember plus commons only; the
  warlord paid 3 Void Core.
- **Warlord:** patterns bruiser → grunt → caster → flyer at 70 / 45 / 20%
  HP. Howl spawned 6. Thornline made 6 shocks. "WARLORD GARRICK THORNE
  FALLS / now the throne".
- **Phone:** tap MENU → KNIGHT → Might twice bought rank 1 for 100 gold;
  the ✕ closed the menu.
- Regressions:
  - Phases 0-10 all pass: 30/30, 17/17, 23/23, 24/24, 24/24, 46/46
    functional, 31/31, 24/24, 17/17, 20/20, 28/28. Phase 5 battle times:
    5 of 8 in band, as before.
  - Test updates, all for intended changes:
    - Phase 0 expects 5 tabs, and that forging in battle is refused.
    - Phases 4 and 5 find debug-list rows by label, since the warlord row
      was added.
    - Every suite's map-button helper uses the button's own width.

**Assumed / not yet verified:**
- None of the new costs are balanced: knight upgrades total 115,500 gold
  for all 30 ranks. Recipe costs, warlord HP (7,417 at tier 5) and hound
  counts are defaults for Phase 14.
- The warlord was not fought by hand; his moves and phases were driven by
  the test.
- PLAN 7.1's Generals tab in the pause menu is not added: the map's
  roster (G / the top-bar button) does that job.

# Phase 10: generals and loyalty

**What changed** (new `src/generals.ts`; the logic is in `war.ts`, PLAN 9):

- **Lords:**
  - Each of the 10 conquerable castles (everything but yours and the
    warlord's) has a Lord from the name table.
  - Each Lord has an AF boss pattern (brute / sorcerer / stalker /
    skylord) with its signature move (slam+rush / fan / rush / dive) and
    colours.
  - Lord level by tier: 4 / 7 / 10 / 13 / 16 (*default*).
  - A castle siege fields that castle's own Lord. A castle with none
    left fields "the Castellan"; the capital, the warlord.
- **Recruit or Release:**
  - Beat the Lord before the throne falls, and the results screen offers
    **Recruit** or **Release** (←/→ + Enter, or tap).
  - Recruit gives a general at the Lord's level, loyalty 50, or 30 if
    they defected before.
  - Release pays the spoils twice.
  - Throne first: the Lord flees and is gone. Castles taken off-screen
    lose their Lord too.
- **Using generals:**
  - Active cap: 1 per castle you hold, max 8; the rest wait in reserve.
  - Assign one with the castle panel's **General** button (cycles), or
    pick one in the Send panel to lead an army.
  - Command = 0.10 + 0.01 × level (max 0.30):
    - an army with a general fights ×(1 + command), without one ×0.8;
    - a castle's defenders get ×(1 + command) from your general or their
      Lord.
  - Garrisons themselves no longer take the −20%: PLAN 7.3 puts that on
    armies.
  - Generals level +1 per victory they're in (max 20).
- **Live:**
  - In a joined fight or a defense, your general fights beside you as an
    allied boss: their pattern, moves and level, obeying Charge and Focus.
  - Their portrait and HP show under your bars.
  - At 0 HP they're down, not dead: win and they get back up; lose and
    they're taken.
- **Loyalty (PLAN 9.4, every row):**
  - victory with them present: +6;
  - fighting beside you live: +12, replacing the +6;
  - rescued: +25;
  - defeat: −10;
  - captured: −15, then −1 per 20 s held;
  - Warlord's Presence: gains ×1.5. The Command talent arrives in
    Phase 11; the hook reads it.
- **The 25 warning:** at 25 or under, the general says their line once,
  and their row and the top bar's Generals button turn red.
- **Defection at 0** (checked on the map only, never mid-battle):
  - from a castle, it and its garrison flip to the Dominion with them as
    its Lord;
  - leading an army, the army goes over and heads for their castle;
  - held captive, they become the Lord of the castle holding them. The
    newest Lord holds a castle.
- **Capture and rescue (PLAN 9.3):**
  - Captives are held at the Dominion castle nearest the defeat (a cage
    on the map).
  - Taking that castle frees them.
  - So does a **Rescue raid** from the castle's panel: the cell holds the
    real general, out alive is +25, and the castle stays theirs.
- **Map:**
  - The top bar's **Generals** button (or G) opens the roster: level,
    command, where each one is, a loyalty bar, red at 25 or under.
  - A crown marks a castle with your general.
  - An army led by a general has a gold trim.
  - News banners for warnings, captures, rescues and defections, each
    with the general's line (PLAN 13 templates).
- Saves carry every general (status, place, level, loyalty, times
  recruited) and which army they lead.

**Verified**: headless Chromium, desktop + emulated iPhone 13. Phase 10
suite 28/28.

- **Lords:**
  - 10 Lords, all four patterns, levels 4 / 7 / 10 / 13 by tier; none at
    the Last Camp or the capital.
  - Millbrook Castle's siege fielded Lord Maud (sorcerer, fan, level 4).
- **Recruit:**
  - Lord first → Enter → Recruit: loyalty 50, level 4, in reserve,
    "JOINS YOU".
  - Release by tap: gold 441 → 882, spoils shown ×2, the Lord gone.
  - Throne first: no offer, the Lord gone.
- **Cap:** with one castle, a second general couldn't lead an army while
  the first held it. With two castles, two were active.
- **Command:**
  - L10 = +20%: army ×1.08 with a general vs ×0.72 without (both ×0.9
    yours). Max 0.30.
  - A general in your castle multiplied its defense by exactly
    1 + command.
- **Every PLAN 9.4 row:**
  - sim victory: +6 and a level;
  - sim defeat: −10 −15, held at the nearest Dominion castle;
  - 60 s captive: −3;
  - rescued: +25;
  - Presence: +6 → +9, losses unchanged;
  - live victory beside you: +12 (not +18). They were on the field as an
    allied boss, knocked down mid-fight ("IS DOWN"), and got back up on
    the win;
  - a live defeat: −10 −15 and taken.
- **The warning:** 30 → 23 raised "LORD OSRIC: LOYALTY 23" with his line,
  once.
- **DONE, defection flips castle + garrison:**
  - A garrisoned general at 0: the castle went to the Dominion with its 33
    troops, and he's its Lord again.
  - Leading 25 troops: the army went over.
  - Captive: became Lord of the castle holding him, the newest Lord there.
- **Never mid-battle:** at 0 during a battle, the general held. Back on the
  map, he defected and the Last Camp went with him.
- **DONE, re-recruit starts at 30:** the defector held his castle again.
  Beaten first in its siege and recruited, he came back at loyalty 30
  (recruited twice).
- **Rescue raid:** the castle holding Lord Ysolde offered "Rescue raid:
  Lord Ysolde". It fielded her in the cell; out alive she went 40 → 65,
  and the castle stayed theirs. Taking a castle that held her also freed
  her (+25).
- **Map:** the castle panel's General button assigned and unassigned. The
  Send panel's picker made her lead the army. G opened the roster.
- Generals and their armies survived a reload.
- **Phone:** tapping the top bar's Generals button opened the roster.

**Regressions:** Phase 0–9 suites green (5: 46/46 functional, timing 5/8
in band on this single run).

**Bugs found and fixed:**
- The castle-to-Lord lookup preferred the castle's original Lord over a
  defector who'd just taken it.
- The roster's open state survived a trip to the map from a battle.
  Returning to the map now resets the map mode.

**Assumed / not checked:**
- Lord levels by tier and +1 level per victory (the PLAN says "level from
  battles", no rate).
- Fled Lords simply leave the war.
- Lords don't add command to their castle's live battle (they fight in
  it).
- A defected army's general can't be fought until it reaches a castle.

# Phase 9: the Dominion's campaign AI

**What changed** (`war.ts`, PLAN 8):

- **War clock:**
  - An offensive musters every 240 / 160 / 110 s on Easy / Normal / Hard.
  - The interval is 10% shorter per 3 territories you hold, never below
    60%.
  - The top bar shows offensives under way / the cap, and the time to the
    next muster.
- **Telegraph:**
  - A muster is announced ("THE DOMINION MUSTERS AT <castle>, they march
    on <node> in 30 s").
  - The map marks it: a pulsing ring over their castle with a countdown,
    and a dashed line to the target.
  - The army departs exactly 30 s later, drawn from that castle's
    garrison.
- **Concurrent cap:** 1 + one per 4 territories you hold, max 3 (Hard 4).
  Mustering, marching and fighting offensives all count; a victorious
  army stops counting.
- **Grace:** for 90 s after you take a castle, by any means, no offensive
  targets its territory.
- **Targets:**
  - score = value ÷ road distance ÷ the target's defending strength
    (value: castle 5, keep 3, village 2, outpost 1);
  - × 2 for your nodes on their border (*default* weight);
  - mustered from their nearest castle with troops to spare.
- **Army size:** 70–110% of the target's defending strength, at most 80%
  of the mustering garrison, never fewer than 6.
- **Their economy:**
  - Their villages' gold per minute × 0.8 / 1 / 1.25 by difficulty.
  - It refills worn garrisons first, at 6 troops/min per node (*default*),
    at your troop prices.
  - Offensives draw troops from the garrisons.
- **Reinforcements:** when you besiege one of their castles, the nearest
  other castle sends one army half the time (*default* reading of "may")
  with 40% of its garrison. It joins the defense on arrival.
- **Convoys:** their armies on the road catch your convoys; the gold is
  lost.
- **The capital falls:** the war is won, any muster is called off, and
  offensives stop. (The victory screen is Phase 12.)
- **Defending live:**
  - A Dominion army at one of your nodes raises "<node> UNDER ATTACK".
  - Joining that fight starts a Defense battle (the node's layout, roles
    reversed). Their army is the attackers; you, the warband and the
    node's garrison defend.
  - Win, and their army breaks. Lose, and the node falls. Withdraw, and
    the sim carries on.
- **Difficulty** lives in the save (default Normal). The New Game picker is
  Phase 12.
- Saves carry the clock, musters, grace, their gold and refill progress,
  and which armies are offensives.
- Banners now shrink to fit the screen (measured, PLAN 16): "THE DOMINION
  MUSTERS AT MILLBROOK CASTLE" overflowed.

**Verified**: headless Chromium, desktop + emulated iPhone 13. Phase 9
suite 20/20.

- **War clock and cap, all three difficulties** (PLAN 15 checklist), at
  1 / 3 / 4 / 6 / 8 / 11 territories held. Every value matched the
  formulas:
  - Normal: 160 → 144 → 128 → 112 s.
  - Easy at 3 held: 216 s.
  - Hard at 11 held: 77 s, cap 3.
  - All 12 held: cap 4 on Hard; the clock at its 66 s floor.
- **DONE, telegraph 30 s before departure:**
  - The first muster came at exactly 160 s and was announced.
  - At 29.9 s after: still mustering, nobody on the road.
  - At 30.1 s: the army was out, marked an offensive, with the mustered
    size.
- **DONE, concurrent cap respected:** with the clock forced to fire every
  second for 25 minutes, offensives under way hit the cap and never
  passed it: Normal with 1 territory (cap 1) and 4 (cap 2), Hard with 8
  (cap 3).
- **DONE, grace respected:** after Greywatch Castle was taken it was the
  obviously best target, but for 89 s every plan went elsewhere. After
  90 s it was chosen.
- **Army size:** over 40 plans against the Last Camp, 0.74–1.11 of its
  defending strength. It was clamped to 80% of a thin mustering
  garrison.
- **Targeting:** an undefended village beat the garrisoned castle.
- **DONE, offensives stop after the capital falls:** the muster in
  progress was cancelled and the "won" news raised. 20 more minutes: no
  muster, no offensive.
- **Their income:** exactly their villages' 880 gold/min × 0.8 / 1 / 1.25.
  A worn garrison refilled 10 → 16 in a minute, paid from their gold.
- **Reinforcement:** your siege of Greywatch Castle drew one from Thornwall
  Castle, and it merged into the defenders on arrival (count exact).
- **Defending:** a 60-strong army at the Last Camp raised "THE LAST CAMP
  UNDER ATTACK".
  - Join started a Defense battle: their 60 vs you, the warband and the
    30-troop garrison, with the houses yours.
  - Winning broke their army, and the castle stayed yours.
- **Convoys:** a Dominion army caught your convoy on the road, and its
  99 gold was lost.
- **Saves:** Hard difficulty, a muster in progress, the clock, a
  territory's grace and their gold all survived a reload.
- **Phone:** the clock ran out on the live map and the muster was
  announced.

**Regressions:** Phase 0–8 suites green (5: 46/46 functional, timing 5/8
in band on this single run). The Phase 7 and 8 suites now switch the
Dominion's AI off: they test the economy and the sim, and offensives
retaking nodes mid-test broke their setups.

**Assumed / not checked:**
- Real-play pacing: how often offensives land against how fast you grow.
- Whether their refill rate starves or floods them.
- Difficulty's enemy damage multiplier (Phase 12 with the New Game
  picker).
- A castle you defend uses the Defense (village) layout.

# Phase 8: armies, the off-screen sim, join and intercept

**What changed**

- **Armies** (`MapArmy` in `war.ts`, PLAN 7.2):
  - **Send army:** a castle panel's Send army opens a troop picker: −/+
    per type (5 at a time), then Half or All. Then Choose target and tap
    the map:
    - an enemy node means **attack**;
    - one of your castles means **reinforce**.
  - The troops leave the garrison and march along the roads at 22 map
    units/s, drawn as banners with their count.
  - An army stops at the first hostile node on its way and fights there.
  - When it's done, it goes into a castle's garrison, or heads for your
    nearest castle.
  - **Generals** (Phase 10) don't exist yet, so every army fights at −20%.
- **The off-screen sim** (`Fight`, PLAN 7.3):
  - Strength = Σ count × unit power × the tier's HP scale, × the side's
    multipliers:
    - no general ×0.8;
    - your troops ×0.9 per unit (PLAN 11.2);
    - fortification: castle 1.3 + 0.1/level, keep 1.5 / 1.7 / 2.0,
      villages and outposts 1.
  - Each second, each side loses `WAR.simRate` (0.02) × the other's
    strength, taken from its cheapest units first, rams last. A side
    breaks at 20% of its starting strength.
  - A fight starts when an army reaches a hostile node, or two hostile
    armies meet on a road (within 30 map units).
  - A node fight also wears the node's walls and gates, faster the more
    the attackers outweigh the defenders.
  - The winner takes or keeps the ground. A captured node flips a level
    down. The loser's army is gone.
  - Fights show crossed swords with a two-colour strength bar. Their
    panel shows both sides' strength now / at the start and the walls'
    HP.
  - News of off-screen results pops up on the map ("… TAKEN", "… LOST").
  - Dominion garrisons now persist between fights (worn down, not reset).
- **Join (PLAN 7.3):**
  - Join on your fight starts its battle from where the sim stands:
    - the defenders' current counts;
    - the node's battle reinforcements, scaled down by how far the
      garrison is worn;
    - your army beside the warband;
    - the structures at the sim's remaining HP share, outer gate first.
  - Afterwards:
    - your army is who's left of it;
    - the Dominion side keeps the share of each troop type that survived
      the battle;
    - the walls keep their damage.
  - Win or lose decides the fight. Withdrawing hands it back to the sim.
- **Intercept (PLAN 7.1):** an enemy army in or next to your land can be
  intercepted. That starts a field battle against exactly its troops. A win
  breaks it; withdrawing leaves it its survivors.
- Off-screen, the Dominion can take your nodes: an undefended village
  falls, and a castle's garrison fights behind its walls.
- **Debug:** tuning panel → "Dominion army (map)" sends one at your nearest
  node. Their campaign AI is Phase 9.
- Saves carry armies, fights and Dominion garrisons. They're validated
  (roads must be real), and an army whose fight didn't load marches on.
- New `WAR` keys: `armySpeed`, `armyMeet`, `simRate`, `simBreak`,
  `simStructRate`, `noGeneralMult`, `fortCastle`, `fortCastlePerLevel`,
  `keepFort`, `debugArmy`.

**Verified**: headless Chromium, desktop + emulated iPhone 13. Phase 8
suite 17/17.

- **DONE, send an army:**
  - Castle panel → Send army opened at half the garrison. All took 150;
    −5 twice left 140.
  - In target mode, your own village was refused. The enemy node was
    taken: 140 troops left the 150-troop garrison and the army was
    selected.
- **DONE, it walks the road:** its position changed every 3 s along its
  path. It stopped to fight at the first enemy node (Millbrook Keep:
  strength 192 vs 113).
- **DONE, the sim resolves:**
  - The keep fell to the army.
  - 113 survivors marched back to The Last Camp and joined its garrison
    (10 → 123).
- **PLAN 15 sim checks:**
  - Equal strength against a castle (×1.4): the defender won.
  - 2:1: the attacker won.
  - Two armies meeting on a road fought. The loser broke with 5 of 20 left
    (not wiped out), and the winner marched on.
- **DONE, joining carries current counts and structure HP** (a siege of
  Millbrook Castle 10 s into the sim):
  - The battle fielded exactly the fight's 32 defenders (the full garrison
    is 50) plus the 58 of your army beside the 12 of the warband.
  - It started the walls at the sim's 0.939, with the outer gate damaged.
- **Withdraw and rejoin:**
  - Withdrawing handed it back: the sim went on with fewer defenders and
    the walls at 0.469, the share the battle left them.
  - Rejoining and winning took the castle and its territory, and the
    army garrisoned it.
- **DONE, intercept:**
  - A Dominion army marching from Hollin Castle on the Last Camp became
    interceptable near your land. Clicking it → Intercept started a field
    battle against exactly its 40 troops.
  - Withdrawing after killing 15 left it 25. A win broke it.
- **The Dominion off-screen:** a 30-strong army broke against your
  40-troop castle (garrison 40 → 33). Ten took your undefended village.
- Armies on the road came back after a reload.
- **Phone:** tap the castle → Send army → All → Choose target → tap an
  enemy node → 30 troops march.

**Regressions:** Phase 0–7 suites green (0 30/30, 1 17/17, 2 23/23, 3
24/24, 4 24/24, 5 46/46 functional with timing 7/8 in band, 6 31/31, 7
24/24).

**Bugs found and fixed:**
- The Dominion's garrison mix lacked ram and hound counts, so strength
  came out as NaN.
- After a joined battle, the garrison only lost units beyond the battle's
  extra reinforcements. Now it takes the same per-type share of losses as
  the whole force.

**Assumed / not checked:**
- **Sim speed:** `simRate` gives about 40 s for an even fight. Not tuned
  against play.
- **Joined node battles:** they keep their battle reinforcements, scaled by
  the garrison's wear. Intercepts have none (just the army).
- **Defending your own nodes live:** a join on their attack arrives with
  the Dominion's offensives (Phase 9). A castle you defend will use the
  defense layout (village roles reversed) until then.
- **Your convoys** can't be intercepted yet (Phase 9).

# Phase 7: war state and economy

**What changed**

- **New `src/war.ts`** holds the war's state on the map. It ticks in real
  time while the map is up; battles pause it (*default*, as in Hyper
  Knights).
- **Villages** (PLAN 5.2 / 6):
  - They earn 20 / 35 / 55 gold a minute by level into a local store
    (cap 300).
  - Every 60 s a convoy carries the store along the roads (`Campaign.path`)
    to your nearest castle. Its gold enters the treasury when it arrives.
  - Convoys are drawn as small wagons on the same bowed roads the map
    draws (`Campaign.roadPoint`).
- **Castles:**
  - They recruit continuously, 6 / 10 / 16 troops a minute by level, while
    the treasury can pay each troop's cost (sword 4, spear 5, archer 6,
    shield 8, ram 40). They stop at the garrison cap of 40 / 80 / 140.
  - A ram comes after every 30 troops.
  - The mix is set per castle from its panel: Balanced 40/20/25/15 (the
    default), Infantry, Archers or Shield wall.
  - The Last Camp starts with 24 troops (*default*). A captured castle
    starts empty.
- **Upgrades** (PLAN 5.2 costs × `WAR.tierCost` 1 / 1.5 / 2 / 3 / 4):
  - villages 150 / 400;
  - castles 300 / 800;
  - keeps 250 / 700;
  - outposts don't level.
  - A level-3 castle adds +3 warband cap (max +12).
- **The warband** is now real troops:
  - Each battle from the map fields exactly your warband. Whoever is
    standing at the end comes home; a defeat loses it.
  - On the map it refills to its cap from your castles' garrisons
    (PLAN 7.2).
  - The debug battle list still gets a full one for free.
- **Dominion convoys** (*default* until their economy arrives in Phase 9):
  - Every 45 s one of their villages sends 60 × tier gold as tribute to
    their highest-tier castle (the capital), at most 3 on the roads at
    once.
  - A convoy on a road touching your frontier (a node you hold or can
    attack) can be **Ambushed**. That starts a convoy battle, and a win
    takes its cargo.
- **Map UI:**
  - Convoys are selectable, with a panel and an Ambush button.
  - Your castles show a garrison badge; your villages show a gold bar.
  - The top bar shows the warband as count / cap.
  - Castle panel: garrison by type, recruiting status, warband, the Mix
    and Upgrade buttons.
  - Village panel: income, gold waiting, next convoy, Upgrade.
  - Keep panel: sim defense, defenders, Upgrade.
  - Disabled buttons say why when pressed (e.g. "NEED 150 GOLD").
- **Saves:** a new `econ` block holds:
  - village stores and timers;
  - garrisons, recruit progress and mixes;
  - the warband;
  - convoys on the road;
  - the Dominion convoy timer.

  It's validated piece by piece on load. Autosave runs every 60 s on the
  map and after every map battle, won or not.

**Verified**: headless Chromium, desktop + emulated iPhone 13. Phase 7
suite 24/24.

- **DONE, capture a village:** Fennick taken through the attack flow came
  over at level 1, earning 20 gold a minute.
- **DONE, the convoy delivers gold:**
  - Fennick's store held 10 gold at 30 s.
  - At 60 s its convoy left with exactly 20 gold for The Last Camp (4 road
    legs).
  - It took over 5 s on the road, and the treasury rose by exactly 20.
- **DONE, the castle produces troops:**
  - With no gold, nothing in 60 s.
  - With gold, 6 troops in a minute, and the gold spent equalled their
    costs exactly.
  - A ram arrived after 30.
  - The garrison stopped at 40, with a 0.38 / 0.21 / 0.26 / 0.15 mix.
- **DONE, upgrades work:**
  - Fennick to L2 was refused at 120 gold ("NEED 150 GOLD"), then bought
    at 150: income 20 → 35, and saved.
  - Castle L2 brought cap 80 and 10 per minute. L3 lifted the warband cap
    12 → 15. 300 + 800 gold, and no L4.
  - Costs × tier: a tier-2 castle costs 450; a tier-5 keep to L3, 2800.
- **DONE, thinning verified through real captures** (Millbrook Castle, L1,
  keep +50%):
  - with Fennick and Ashby held: 42;
  - + Millbrook Watch: 33;
  - + Millbrook Keep (no +50%): 22.
  - The battle fielded exactly those numbers. The outpost's +1 tier and
    the iron gate went with their nodes.
  - With 4 small nodes held the cut stops at 60%: 24.
- **Warband:** the battle fielded exactly the cap (15). 11 came home after
  4 fell, and the warband refilled from the garrison on the map. A defeat
  lost it, and with an empty garrison it stayed empty.
- **Ambush:**
  - A frontier convoy was ambushable; one deep in their land wasn't; yours
    never are.
  - Clicking it opened its panel; Ambush started a convoy battle carrying
    its 120 gold.
  - The win paid it into the spoils and treasury, and removed it from the
    map.
- **Save/reload** brought back stores, garrisons, a convoy mid-road, the
  warband, levels and gold. A mangled `econ` block was dropped piece by
  piece, no crash.
- **Phone:** tap your castle → panel → tap Upgrade → level 2, 300 gold
  paid.

**Regressions:** Phase 0 30/30, 1 17/17, 2 23/23, 3 24/24, 4 24/24, 5
46/46 functional (timing 5/8 in band on this single run; the autopilot
varies run to run), 6 31/31.

**Bug found and fixed:** a lost or withdrawn map battle wasn't saved, so
the map reloaded the older state and a lost warband came back. Every map
battle now saves at its result.

**Assumed / not checked:**
- The map pausing during battles.
- The Last Camp's 24-troop start.
- Dominion convoys as tribute to their capital (their real economy is
  Phase 9).
- Enemy interception of your convoys (Phase 8–9's sim).
- No balance pass on income against troop and upgrade costs (Phase 14).

# Phase 6: the campaign map

**What changed**

- **New `src/campaign.ts`** holds the Verdant Reach as hand-authored data:
  - a 5×4 grid of border vertices;
  - 12 territories (name, tier, scenery);
  - 64 nodes (type, territory, position, name);
  - 69 roads;
  - 3 rivers.
- Each edge of the borders and coast gets a fixed wiggle keyed to that
  edge, so the lines look drawn and both neighbours always agree.
- Territory adjacency comes from shared edges. Shortest road paths between
  all nodes are worked out at load (for armies in Phase 8).
- **Start (PLAN 4):** you hold the Last Camp (a level-1 castle and the
  village of Emberfield). The Dominion holds the other 11 territories:
  - each has 1 castle, 1 keep, 1 outpost and 2–3 villages;
  - tiers run 1–5 from the south-west to Thorne's Seat, the capital;
  - starting levels rise with tier (`WAR.castleStartLevel`,
    `WAR.nodeStartLevel`).
- **The map screen** (`campaign`; New Game / Continue land here):
  - **Art:** sea with shallows, land tinted by scenery, forests, mountains,
    rivers, dashed borders, the coastline and bowed roads. It's drawn once
    to an offscreen layer.
  - **Ownership:** a blue or red wash shows who holds each territory (the
    holder of its castle).
  - **Frontier:** territories you can strike into get a pulsing gold edge,
    and the nodes in them a pulsing ring.
  - **Node icons:** the shape is the type (castle with banner, keep,
    village, watchtower), the colour is the owner, and pips show the level.
  - **Labels:** territory names and tiers sit where they cover the fewest
    icons. Node names show at close-up or when a node is selected.
  - **Top bar:** gold, warband, skill points, territories held.
- **Controls:**
  - Two zooms, whole continent and close-up: wheel, pinch, Z, or L / LT.
  - Pan: drag, the stick or WASD.
  - Pick a node: click or tap it, or use arrows / d-pad to step to the
    nearest node that way.
  - Enter attacks. Esc closes the panel, then goes to the title.
- **Node panel** (shared geometry `MAP_PANEL` / `MAP_BTN`, so drawing and
  hit-testing agree):
  - For a Dominion node: type, level, territory, tier, the battle it
    gives, battle tier, defenders, reinforcements, and why (keep +50% and
    iron gate, thinning, the outpost's +1 tier).
  - **Attack** is enabled only on the frontier.
  - Your own nodes say the economy arrives in Phases 7–8.
- **The frontier rule (PLAN 5.1):** you can attack an enemy node if you
  hold any node in its territory, or hold (its castle) a territory
  bordering it.
- **Attack → battle → result → ownership:**
  - A node builds its battle spec:
    - type from the node;
    - tier from the territory, +1 for castle/keep while the Dominion holds
      the outpost;
    - its scenery;
    - a seed from the node, so it always lays out the same;
    - its garrison and the `WAR.battleReinforce` reinforcements;
    - houses = 2 + level;
    - a named Captain or Lord;
    - for castles, iron gate while the keep is theirs and gate HP ×1 /
      1.5 / 2.2 by level.
  - **Garrisons:**
    - castles 40 / 80 / 140 by level, +50% while the keep is theirs, −15%
      per village or outpost you hold there (max −60%);
    - keeps 50 + 0 / 10 / 20;
    - villages 30 + 10 a level;
    - outposts 50.
  - A win flips the node to you at max(1, level − 1) (PLAN 5.3). The
    results screen says so, and you're back on the map looking at it with
    a "TAKEN" banner. Losing or withdrawing leaves it unchanged.
- **Saves** now carry the war (owner and level per node). A war save that
  doesn't fit the continent is dropped for a fresh war.
- The Phase 4–5 battle list is now a **debug screen** (tuning panel →
  "Battle list"); the older test suites use it.
- New `WAR` keys: `startTerritory`, `capitalTerritory`,
  `castleStartLevel`, `nodeStartLevel`, the garrison keys,
  `keepGarrisonBonus`, `thinPerNode`, `thinMax`, `castleGateLevel`, the
  map wiggle keys, `mapZoomNear`, `mapPanSpeed`, `mapZoomTime` and
  `mapNodeTap`.

**Verified**: headless Chromium, desktop + emulated iPhone 13. Phase 6
suite 31/31.

- **Layout:**
  - 12 territories and 64 nodes.
  - Last Camp = castle + village, both yours; the rest are Dominion, each
    with castle / keep / outpost / 2–3 villages.
  - Tiers rise with road distance from the start, and the capital is
    tier 5.
- **DONE: every node is reachable by road.** BFS from the Last Camp
  reaches 64/64, all 4096 node pairs have a path, and a path's hops are
  real roads.
- **DONE: frontier rule:**
  - At the start, exactly Millbrook Vale and Greywatch March are open,
    every node in them.
  - Taking Greywatch's castle opened Thornwall and Hollin Reach.
  - Holding one village deep in Saltmarsh opened Saltmarsh but not Ashfen
    beyond it.
  - Your own nodes are never targets.
- **Garrison math, Millbrook Castle (L1):**
  - 60 with the keep theirs; 40 once the keep is taken;
  - then 34, 28 and 22 as you take 1, 2 and 3 villages/outposts;
  - iron gate on, then off when the keep falls;
  - battle tier 2 while their outpost stands, 1 after.
- **Mouse:**
  - Clicking a node opened its panel; Attack started an outpost capture
    for that node.
  - A win flipped it to you, it was saved, and you came back to the map
    with it selected and a "TAKEN" banner.
  - Captured nodes came over a level down (L3 → 2, L2 → 1).
- **Lose and withdraw:** both returned to the map with the node unchanged.
- **Out of reach:** Ravenmoor Castle's Attack was disabled, and Enter only
  explained why.
- **Keyboard:** Esc closed the panel; arrows picked and stepped between
  nodes; Z zoomed in; WASD panned; Esc with nothing selected went to the
  title.
- **Mouse drag and wheel:** dragging panned without selecting, and the
  wheel zoomed out.
- **Taking a castle:** territories went 1 → 2 with "Greywatch March is
  yours". After a page reload, Continue showed the same map.
- A corrupt war save gave a fresh war, no crash.
- Map drawing costs p50 0.8 ms, p95 2.2 ms per frame on desktop.
- **DONE, phone:**
  - All 64 nodes selected with a real tap on their icon at the
    whole-continent zoom.
  - Tap a node → panel → tap Attack → battle → win → tap the results →
    the node is yours.
  - A two-finger pinch zoomed in; a one-finger drag panned without
    selecting.

**Regressions:** Phase 0 30/30, Phase 1 17/17, Phase 2 23/23, Phase 3
24/24, Phase 4 24/24, Phase 5 46/46 functional (timing 7/8 in band on a
single run). The Phase 4 and 5 suites now start their battles from the
debug battle list.

**Assumed / not checked:**
- **Phone text size.** In this page layout an iPhone 13 shows the game at
  0.63 CSS px per logical px. At the whole-continent zoom, territory names
  are about 6 CSS px tall and the closest nodes 25 CSS px apart; close-up
  is about 2.6× that.
  - Screenshots at the phone's 3× density read clearly, but on a real
    phone the overview's names will be small; pinching in is the
    readable view.
- **Garrisons I chose (*default*):** village 30 + 10/level, outpost 50,
  keep 50 + PLAN's bonus. The PLAN only fixes castles and the keep bonus.
- Phase 7 is where thinning gets its full verification, with the economy.
- Thorne's Seat's name clips one village icon at the overview zoom.
- Gear, talents and the pause-menu tabs aren't on the map yet (the PLAN
  7.1 tabs come with later phases); they still open in battle with Tab.

# Phase 5: outpost, keep, castle siege, convoy, defense, rescue

**What changed**

- **Six more battle types** (PLAN 10.2), each with its own seeded layout,
  new top-down art, objective line and progress bar:

  | type | layout | win | lose (besides the knight falling) |
  |---|---|---|---|
  | **Outpost** | 2000×1200, stone watchtower on a rise, capture ring (r 110) | 10 s with you or your troops in the ring and **no enemy inside**. Contested = paused (ring turns red), never reset | — |
  | **Keep** | 2000×1600, square stone fort, one west gate | gate broken **and** Captain defeated | — |
  | **Castle siege** | 3200×1800: outer gate → courtyard → inner gate → throne room | throne destroyed. Lord beaten first = recruitable; throne first = the Lord flees, not recruitable | — |
  | **Convoy** | 3600×1000 road, 3 wagons rolling east in a column | every wagon wrecked → their cargo joins the spoils | a wagon reaches the far edge |
  | **Defense** | the village layout, roles reversed: the houses are yours, you start among them | rout the attackers, destroy them, or hold 3:00 with a house standing | every house burned |
  | **Rescue raid** | the castle layout, a cell in the throne room's north wing, a breach at the north end of each wall | hold the cell's ring 8 s (frees the general), then reach your edge with them alive | the general dies |

- **Walls** are a new structure kind, `wall`: solid and indestructible.
  Shots and arrows stop on them.
- **Getting through walls:**
  - Walled layouts are split into zones (outside, courtyard, throne room)
    joined by doors. A gate's door opens when the gate falls; a breach is
    always open.
  - Units, elites and generals walk zone to zone through open doors
    (`Battle.via`) instead of grinding on walls.
  - They only pick targets they can actually reach, so a garrison behind a
    shut gate waits and doesn't press against the wall.
  - Charge and Focus go for the nearest structure they can reach: the next
    gate first.
- **Leaders** use AF's boss AI:
  - Keep Captain: stalker pattern with a rush move (`WAR.captainStats`).
  - Castle Lord: brute pattern with slam and rush (`WAR.lordStats`).
  - Both wait by their post until something comes near. Their bar shows
    once they're fighting.
  - The defense commander leads from the rear at the Dominion edge.
- **Reinforcements:** a spec can carry `reinforce` units. They join the
  Dominion's reserve and stream in from its edge: the column for an
  outpost, the barracks inside a keep, the throne-room guard of a castle,
  the rearguard of a convoy.
- **Rams** now do 20 base (×4 on gates, ×1 on houses). They skip anything
  they can't hurt, such as the throne. On defense, the Dominion and its
  rams go for your houses when no defender is in sight.
- **Convoy** uses the top edge as yours: you start on the north verge and
  leave through the top (a "▲ LEAVE" marker).
- **Rescue:** the freed general is an allied elite who sticks with you and
  only fights what comes close. Leaving through your edge with the general
  alive is the win; without them it's a withdrawal.
- **Results screen:** a per-battle outcome line plus notes, such as "Lord
  … beaten first — can be recruited (Phase 10)", "… fled — not
  recruitable", "cargo taken: 270 gold" or "Sir Aldric rescued".
- **Map stub:** two columns, all eight types plus the test field.
- **Debug:**
  - An **Autopilot** toggle in the tuning panel plays the knight. It walks
    to the objective through the gates, hits what's in the way, and drinks
    a potion when low. It's used to time battles; it isn't a player feature.
  - `GAME.simulate(seconds)` fast-forwards the sim for tests.
- New `WAR` keys: `ringRadius`, `outpostHold`, `gateHp`, `keepGateMult`,
  `ironGateMult`, `throneHp`, `cellRingRadius`, `rescueHold`, `wagonHp`,
  `wagonSpeed`, `wagonGap`, `convoyCargo`, `defenseHold`, `captainStats`,
  `lordStats` and `commanderMult`; `spoilGold` covers every type.

**Verified**: headless Chromium, desktop + emulated iPhone 13. Phase 5
suite: 46/46 functional checks.

- Each type starts from its stub row at its PLAN 10.2 size.
- **Win and lose for every type**, with the outcomes driven directly:
  - Outpost:
    - Progress held at 2.93 s while an enemy shieldbearer stood in the ring
      (ring flagged contested).
    - It resumed from 2.93 (not reset) once the shieldbearer died, and won
      at 10 s.
    - Standing outside the ring took nothing.
  - Keep: the gate alone didn't win, and the objective switched to the
    Captain. The Captain alone didn't win either. Gate and Captain both
    down won.
  - Castle, Lord first: beating the Lord wasn't the win. The throne then
    won it with "can be recruited".
  - Castle, throne first: the throne won it, and the living Lord fled with
    "not recruitable".
  - Convoy:
    - Wagons moved east.
    - All wrecked = win with the cargo (+270) in the spoils.
    - A wagon at the far edge = lose ("Wagon 2 got away").
    - Pushing into the top edge = withdrawal.
  - Defense:
    - Holding to 3:00 won ("held for 3:00").
    - Commander down plus 75% killed = rout = win.
    - All houses burned = lose.
    - Left undefended for 60 s, the attackers damaged all 3 houses (and
      won).
  - Rescue:
    - The cell was reachable through the breaches with every gate shut.
    - At 4 s in its ring the general was still caged; at 9 s they were
      free (allied, escorting).
    - Reaching the left edge with the general = win.
    - The general killed = lose.
    - Leaving without the general = withdrawal.
  - Every type: the knight falling = lose.
- **Structure rules**, measured on the castle:
  - The iron gate has exactly 1.6× normal gate HP.
  - The knight's slash does 0.30× to a gate vs a house.
  - A ram does 4.00× to a gate; a swordsman does 0.28× (rounding).
  - A ram does 0 to the throne.
  - A wall took no damage from a 1e6 hit and pushed a body out of its
    footprint.
- **Walls and doors:**
  - With both castle gates shut, nothing outside could reach the courtyard
    or the throne room. Each broken gate opened the next zone.
  - With both gates down and Charge ordered, the warband walked through
    both gateways into the throne room and hit the throne.
- Results → Enter → map stub. Phone: tap the castle row → siege at the
  phone's 60 live cap (60 in reserve) → courtyard fight drawn live with the
  autopilot → won → tap the results → map.
- Phone frame work during that fight: p50 1.9 ms, p95 4.0 ms
  (100 units live).

**Time bands: retuned with bigger armies (Michael's call, 2026-10-01).** The
first pass came in far under the bands. The knight kills about 3 Dominion
units a second (the PLAN 11.2 feel target), so a battle lasts about as long
as its army does. Michael took the recommendation: bigger Dominion armies
streaming in as reinforcements, rather than tougher minions.

- `WAR.battleReinforce` sets, per type, how many more units come on during
  the fight (default 40/20/25/15 mix). `WAR.battlePace` sets how fast they
  arrive (× the 1.5 s stream interval).
- Outpost reinforcements turn out of the tower beside the ring. A keep's
  come from its barracks, a castle's from the throne room.
- A rescue's reinforcements wait for the alarm: they pour out when the
  general walks free.
- Idle Dominion units now hold their objective: the outpost ring, the
  rescue cell.
- The rescue cell's ring now pauses while an enemy is inside, like the
  outpost's.
- Objectives got tougher:
  - gates ×4.5 on keeps;
  - throne 5600;
  - wagons 1700, 1100 px apart;
  - houses 800;
  - Captain 2000 HP.

Autopilot runs, final build, 3 each. The knight is assumed at upgrade
rank 1 at tier 1 and rank 4 at tier 2 (PLAN 11.2: "the upgrades expected
for a territory's tier"); no god mode:

| type | band | measured | |
|---|---|---|---|
| Village raid | ~2 min | 100, 98, 102 s | in band |
| Outpost | ~2 min | 40 s, lost at 79 s, 67 s | **out**: high variance |
| Keep | ~3 min | 144, 149, 142 s | in band |
| Castle siege | 4–6 min | 273, 236, 279 s | 2 of 3 in band (one 4 s short) |
| Convoy | ~2 min | 90, 90, 87 s | in band |
| Field battle | 2–3 min | 135, 135, 135 s | in band |
| Defense | 2–3 min | 143, 148, 180 s | in band |
| Rescue raid | ~3 min | lost at 64 s, lost at 70 s, 52 s | **out** |

- **Outpost:** the ring is easily contested or cleared. The knight kills up
  to ~8 units a second in the crowd on it, and the fight ends at the rout
  (40%). It needs 650 reinforcements to average about a minute and a half,
  and the no-dodge autopilot starts dying above that.
- **Rescue:** a raid is short by design. When the knight wins, he escapes
  in under a minute, ahead of the alarm. When he loses, it's at the cell,
  under the garrison.
- Neither can be pushed into band with numbers alone. Both are listed for
  the Phase 14 balance pass.
- The autopilot never dodges or guards, so its deaths say little about a
  real player's.

**Bugs found and fixed while building it:**
- Units grinding on walls. Solved by the zone and door routing above.
- The freed general wandered off to duel the Lord and died. Generals now
  escort.
- The autopilot charged into the whole defense column. It now holds by the
  houses.
- A ram hitting a throne did 1 damage (the floor in the damage formula).
  Zero-multiplier hits are now skipped.

**Assumed / not checked:**
- How long a human player takes. The autopilot doesn't dodge or guard and
  never stops swinging.
- Lord and Captain stats beyond "they fight and fall".
- Recruiting a beaten Lord (Phase 10) and the general's loyalty gain
  (Phase 10). The battle only records them.
- Rescue's ring pauses when contested, like the outpost. PLAN 10.2 only
  says "hold its ring 8 s"; this is my default.

**Regression runs (final build):** Phase 0 30/30, Phase 1 17/17, Phase 2
23/23 (200 units on desktop at 60 fps, 120 on the phone at 60 fps), Phase 3
24/24, Phase 4 24/24. The Phase 4 suite was updated in two ways:
- for the stub's new row order;
- two tests now set the bigger reserve aside: one checks a rout by killing
  live units, and one watches forced-rout runners leave.

Phase 5 functional checks: 46/46. Phone frame work in the castle fight:
p50 2.1 ms, p95 4.1 ms.

**Desktop copy:** `sync-desktop.bat` in this folder copies the game and its
sources to `Desktop\Claude\Aerial Conquest`. Pull `main` first, then
double-click it.

# Phase 4: battle framework, Field battle, Village raid

**What changed**

- **New `src/battle.ts`** (PLAN 10.1):
  - A `Battle` holds its spec (kind, node name, tier, territory scenery,
    seed, both armies), a seeded layout, its structures, a timer, tallies
    (kills by you, by your army, elites, troops lost, routed) and the spoils.
  - `Structure` covers every kind the plan lists (gate, building, throne,
    wagon, capture ring, cell), each with HP and a hit radius. Houses, gates
    and wagons are solid: the knight, elites and minions are pushed out of
    them, and every shot and arrow stops on them.
  - Damage multipliers follow PLAN 10.1: the knight does ×1 to buildings
    and ×0.3 to gates and thrones; Fire does ×2 to buildings; rams do ×4 to
    gates and can't hurt thrones.
- **Screens:** `title → campaign → battle`. The campaign screen is a **stub**
  until the illustrated map in Phase 6: a list of Village raid (Millbrook),
  Field battle (Dominion column) and the Test field. New Game and Continue
  land on it, and every battle's results screen returns to it.
- **Entering a battle:** a 0.6 s fade plus a banner with the node and its
  objective. The knight starts at the left edge with the warband (12); the
  Dominion holds the right edge, and units past the live cap wait in
  reserve there.
- **The two battle types (PLAN 10.2):**
  - **Village raid** (2400×1400): 4 houses in the far half along a road,
    with crops, fences and a well. Garrison: 40 minions + 2 Shades.
    **Win:** burn every house (`WAR.houseHp` 600 × tier). Houses smoke, then
    burn as they lose HP, and leave charred, glowing frames.
  - **Field battle** (2800×1400): open coastal ground with rocks and
    bushes. A Dominion column of 70 minions + 2 Shades, led by a
    **commander** (a stronger bruiser). On the stub, a sent army of 26 joins
    your warband. **Win:** rout or destroy the army.
- **Rout:** checked every 0.5 s. A side whose leader is down (or has none)
  and is under 40% of its starting strength flees: its units run for their
  own edge and leave the field there (counted as routed, not killed), and
  its reserve never comes on. On the player's side the knight is the
  leader, so it never routes while you live.
- **Losing and leaving:**
  - If the knight falls, the results screen shows after 1.6 s, then you're
    back at camp: warband lost, node unchanged.
  - Pushing into your own (left) edge for 0.35 s withdraws, abandoning the
    attack. A "◀ LEAVE" marker shows when you're near it.
- **Results screen:** outcome, time, kills by you and by your army, elites
  felled, Dominion routed, your troops lost, and spoils. A win pays gold
  (`WAR.spoilGold` × tier + 1 per kill) and 1–3 common materials × tier. The
  gold goes into a new `gold` save field, the treasury until Phase 7.
- **Orders and structures:** under Charge (or Focus with no lock-on), a
  minion with no enemy unit in sight goes for the nearest hostile
  structure. Focus with no lock-on now points at the nearest structure,
  per PLAN 11.4. Allied elites' swings and minions' strikes damage
  structures by the same rules.
- **Battle HUD:** the node name, timer and live/reserve counts top right;
  the objective with a progress bar top centre.
- **Scenery** (`SCENERY` in battle.ts): forest, coast and ruins palettes for
  grass, tufts, dirt and trees. Phase 6 picks one per territory.

**Verified**: headless Chromium, desktop + emulated iPhone 13, Phase 4
suite 24/24:

- **Done-when, village raid:**
  - Won by burning all 4 houses (progress bar at 1, +132 gold). The gold
    reached the saved file.
  - Lost when the knight fell: the results screen, then back to the stub
    with the knight on their feet.
- **Done-when, field battle:**
  - Won by rout: with the commander alive there was no rout even at 21/73
    strength; once the commander fell, the army routed and the battle was won.
  - Won by destroying the whole army.
  - Lost when the knight fell.
- **Done-when, exit edge:** walking left off the start withdrew from the
  battle, with no spoils.
- **Done-when, results screen:** shown on win, loss and withdrawal; Enter or
  a tap returns to the stub.
- **Structure rules:** the knight's slash did 20 to a house and 6 to a gate
  (×0.3). Fire did 48 normally and 96 to a house. A ram's 10 became 40 on a
  gate.
- Houses are solid: walking north into one, the knight stopped at its wall.
- Focus with no lock-on picked a structure. Under Charge, with the
  garrison gone, the warband burned houses (2284 → 2078 HP in 9 s).
- The village layout is identical each time the node is played (seeded).
- 57 routed Dominion units ran off at their edge, counted as routed with
  0 extra kills.
- Phone: Start → map stub → tap Field battle → win → tap the results → back
  to the map.

**Bugs found and fixed:**
- Minions told to attack a house never landed a hit. The 10-frame re-pick
  found no enemy unit, dropped the house, and reset the 25-frame windup.
  A re-pick that finds nothing now keeps a live structure target.
- The results screen let the HUD and the last banner show through. The
  HUD now returns early under it (PLAN 16: alpha bleed).

**Regression runs:** Phase 0, 1 and 3 suites green; Phase 4 suite 24/24.
The Phase 2 phone check (120 units, must stay above 55 fps) failed in 2 of
3 runs, at 53.2–53.5 fps. Measured side by side, the Phase 3 and Phase 4
builds are identical (desktop 2.2–2.6 ms frame work, phone 58–59 fps in
both). This container is simply slower now than when Phase 2 was measured
(1.13 ms then, about 1.9 ms now for both builds), so it isn't a code
regression. Frame work stays far inside budget (p99 under 5 ms of the
16.7 ms).

**Assumed / not checked:** how long real play takes. The 2–4 minute bands
are checked in Phase 5 (for all types) and tuned in Phase 14; these tests
drive the outcomes directly.

# Phase 3: warband, orders, streaming

**What changed**

- **Controls:** Potion moved from Q to **E**. **Q** is the order wheel
  (PLAN 11.4). On the gamepad, **LB** is the order wheel, so Fire is no
  longer on LB; cast it from the command menu (D-pad + confirm).
- **The order wheel:**
  - Keyboard: hold Q + direction (WASD or arrows) and release to give the
    order. Tap Q to cycle; a tap shorter than one frame is caught on the
    key-down edge.
  - Gamepad: hold LB + stick; tap LB to cycle.
  - Touch: a new **CMD** button opens a 4-slice radial under the thumb. Drag
    toward a slice (past `WAR.wheelDeadZone`) and release; a tap cycles.
  - Up = Charge, right = Focus, down = Hold, left = Follow.
  - With Q or LB held, the knight stands still so the direction keys pick a
    slice. On touch the other thumb keeps walking.
  - The HUD shows the standing order with a hint, and an "ORDER: …" call-out
    flashes when it changes.
- **What the orders do** (player-side minions; Dominion units always charge):
  - **Follow** (default): each unit has its own spot in a ring around the
    knight (no pile-up) and runs to keep up. It only fights hostiles within
    `WAR.followRange` + `followEngage` (220 + 120 px) of the knight, and lets go of a
    target that drags the fight away.
  - **Charge:** engage the nearest hostile in sight; with nothing in sight,
    march on the enemy's centre.
  - **Hold:** every unit's anchor is where it stood when the order was
    given. It fights only within `WAR.holdRadius` (90 px) + its reach of
    that spot and walks back to it.
  - **Focus:** every unit targets the knight's lock-on target. With no lock,
    it targets the hostile nearest the knight; structures join this in
    Phases 4–5.
  - Allied elites (stand-ins for generals) obey Focus. Under the other
    orders they fight on their own judgement, which matches "generals obey
    Charge/Focus", since Charge is their default anyway.
- **Warband:** the knight's own squad, capped at `WAR.warbandBase` = 12
  (PLAN 12.2). Talents and L3 castles raise it toward 60 in Phase 11. On the
  test field it is topped up with each new group.
- **Streaming (PLAN 10.1):** units past the live cap (100 per side, 60 on
  phones) wait in a per-side reserve. While a side is under its cap, every
  `WAR.streamInterval` (1.5 s) up to `WAR.streamBatch` (6) come on at that
  side's edge, drawn by the reserve's mix. At the cap nothing streams.
  `streamMult` is ready for the Muster talent. A test-field group now counts
  its reserve, so it only clears once the reserve is spent too. Groups start
  at 30 and grow by 15, so later groups overflow into reserve. The HUD shows
  "+N reserve".

**Verified**: headless Chromium, desktop + emulated iPhone 13, Phase 3
suite 24/24:

- **Done-when, keyboard:** tap Q cycles. Q+W/D/S/A gives
  Charge/Focus/Hold/Follow with the wheel open, and the knight moves 0 px
  while choosing.
- **Done-when, pad:** LB + stick up/right/down/left gives the same four, and
  tapping LB cycles. The pad was a stub injected through
  `navigator.getGamepads`, because Playwright can't attach a real one.
- **Done-when, touch:** a CMD tap cycles, and the radial drag in all four
  directions gives the right order. The knight keeps walking on the stick
  while the radial is open.
- **Done-when, streaming:** with 100 at the cap and 30 in reserve, nothing
  streamed for 2 s. After 20 kills it came back +6 at 1.56 s, +6 at 3.05 s
  and +6 at 4.57 s, and all 18 newcomers appeared at the side's edge. Phone:
  60 live, 20 in reserve; after 12 kills it was back to 60 with 8 left in
  reserve.
- Follow: after walking, the furthest warband unit was 135 px from the
  knight, and a foe 500 px away was left alone. Switching to Charge, the
  warband went and engaged it.
- Hold: the knight walked 543 px; the warband stayed within 8 px of its
  anchors, then caught back up on Follow.
- Focus: all 10 units and the allied elite took the lock-on target; with no
  lock, all of them took the hostile nearest the knight.
- Potion: Q no longer drinks; E drinks (HP 30 → 100).
- The test field fields a warband of 12. A big group overflows into reserve,
  and the reserve counts toward the group.

**Assumed / not checked**: a real gamepad (only the stub was tested); how
the radial feels under a real thumb.

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

