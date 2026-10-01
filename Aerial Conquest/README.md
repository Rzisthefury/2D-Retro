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
| `src/campaign.ts` | the continent: territories, nodes, roads (data), borders, road paths, ownership, the frontier rule, garrisons and each node's battle spec |
| `src/battle.ts` | battles: spec, seeded layouts for all eight types, `Structure` (houses, walls, gates, throne, wagons, rings, cell), zones and doors for walled layouts, objectives, scenery palettes, the stub's battle list |
| `src/music.ts` | AF's adaptive score |
| `src/entities.ts` | `Player`, `Enemy` (with boss AI), `Projectile`, `Pickup` |
| `src/render.ts` | the campaign map, battlefield, characters, VFX, HUD, pause menu, title |
| `src/main.ts` | `Game`: loop, screens (`title`, `campaign` map, `battle`, debug `sandbox` battle list), battle flow and results, test field, team-aware damage, orders, menus, save, debug panel |

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

