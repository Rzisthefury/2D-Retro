# Aerial Conquest — build spec (v2)

**Status:** v2 draft, waiting for Michael's approval. Not built.
**v1 → v2 (2026-10-01):** v1 kept too much of Aerial Finisher (walkable overworld, regions, dungeons, bosses, chests, levels 1–100). Michael's direction: keep only AF's **knight and combat system** plus its **talent tree, gear & crafting, and music**. Everything else follows Hyper Knights: a node-based campaign map, armies, generals, an economy. Scope shrinks to **one continent first**.
**Owner decisions:** Michael, 2026-09-30 (v1) and 2026-10-01 (v2). Anything marked *default* is Claude's call and can be overruled.

**Pitch:** Hyper Knights' campaign (conquer a continent territory by territory from an illustrated strategy map, backed by an economy and an army), fought with Aerial Finisher's knight and KH2-style action combat.

---

## 0. Rules for the builder

1. **Fork, don't share.** The fork already exists in `Retro Games/Aerial Conquest` (v1 Phase 0). v2 Phase 0 strips it much further (section 3). Never edit `../Aerial Finisher`.
2. Same toolchain: TypeScript, `tsc -p tsconfig.json` (`module: none`, `outFile`), `node build.js` writes `aerial-conquest.html`. **No dependencies, no bundler, no npm installs.**
3. **Commit and push each finished phase** to the session's working branch. No force-push, no history rewrites, nothing to `main` without Michael's say-so.
4. Every build also gets copied to `Desktop\Claude\Aerial Conquest` (playable HTML + `src/` + build files + README). In a cloud session that can't reach the PC, push and tell Michael the Desktop copy is his to make.
5. Save keys: `aerial-conquest-slot1/2/3`. Never touch `aerial-finisher-save-*`.
6. **Phone is equal priority.** Every phase must work on touch before it counts as done. Unit caps scale down on phones.
7. Work phase by phase (section 14). Each phase ends with its "done when" checks passing in headless Chromium (desktop + emulated phone) and a README section.
8. All new tunable numbers go in a `WAR` constants object in `config.ts` (next to `TUNING`), never inline.

---

## 1. Hyper Knights reference (what we copy, what we fix)

**Copy:** an illustrated campaign map split into territories, enemy owns almost everything at the start; you pick a node to attack and fight it on its own battlefield; villages make gold, castles turn gold into troops, keeps fortify; three upgrade levels per node; gold moves by convoy; battle type depends on the target (burn villages, break gates then the throne, ambush convoys, defend); taking small nodes first thins the castle garrison; hundreds of minions; allied knights (generals) who level up and can attack or defend; skill points and gold upgrades for the knight and army; New Game+.

**Replace:** HK's button-sequence combat → Aerial Finisher's combat (combos, air combos, dash, Whirl, spells, guard, lock-on, talents, gear).

**Fix (HK's known complaints):**

| HK complaint | Our fix |
|---|---|
| 600-vs-600 fights become a slog | Live-unit caps + reinforcement streaming; minions die fast |
| Constant enemy offensives make defending pointless | "Measured" war clock with telegraphs and grace periods |
| Too many mini-boss heroes, stutter | One lord per castle, one captain per keep; perf budgets |
| Waiting while five troops hit a gate | Knight can damage gates; siege rams; gate HP tuned to the 2–4 min target |
| No victory screen | Victory + stats screen |

---

## 2. Decisions log

| Topic | Decision |
|---|---|
| Engine | Fork of Aerial Finisher, stripped to knight + combat + talents + gear + music |
| Kept from AF | Knight (sprite, hero/blade looks, moveset), combat system, `Enemy` AI class (for elites/lords/generals), talent tree, weapon/armour tiers + forge recipes, adaptive score, touch controls, menu framework |
| Removed from AF | Walkable overworld, regions/biomes/barriers, towns, landmarks, chests, waypoints, dungeons, AF's 30 bosses, Ascendant superbosses, levels 1–100/EXP, material farming, AF Map tab |
| Campaign map | **HK node map**: an illustrated continent, territories coloured by owner, node icons, roads, armies and convoys drawn on it. Select a node to attack, upgrade, recruit or send troops. **No walking on the map** |
| Map look | **Illustrated**: drawn coastline, forests, mountains, rivers, banners |
| Map time | **Real-time**: gold flows, troops train, enemy offensives on a telegraphed timer |
| Scope | **One continent, ~12 territories**, built and playable end to end. More continents only after Michael decides |
| Battles | Separate scrolling top-down battlefield per battle, **new art** (fields, walls, gates, villages, keeps), nothing reused from AF regions or dungeons |
| Progression | **HK-style**: no levels. Gold buys knight upgrades; **skill points from conquest** buy talents; gear forged with **gold + battle spoils** |
| Enemy | The **Umbral Dominion** (placeholder), led here by **Warlord Garrick Thorne** (placeholder). Human soldiers + Shades as elite shock troops |
| Your army | Personal **warband** that joins every battle you fight + **sent armies** from castles led by generals |
| Army features | Troops in battle with commands, generals, sending armies, convoys (all kept from v1) |
| Warband size | 12 → 60 |
| Enemy pressure | Measured: timed counterattacks with breathing room, scaling with your land |
| Off-screen fights | Live strength sim ticking over time; you can join any fight from the map |
| You fall | Back to the map, warband lost, battle lost |
| Generals | Recruit beaten castle lords; captured when beaten, rescuable; loyalty meter, defect at zero |
| Loyalty drivers | Victories/defeats, fighting beside you (incl. rescue). *Not* wages, *not* "left alone" |
| Story | Light framing (text cards + portrait lines) |
| Saves | 3 slots + autosave |
| Army stats | 4th talent branch **Command** |
| Battle commands | 4-way command wheel: Follow / Charge / Hold / Focus |
| Extras | Difficulty modes, New Game+, Victory + stats screen |
| Skirmish length | 2–4 min (castle sieges 4–6) |
| General cap | 1 per castle held, max 8 active, rest in reserve |
| Visibility | Full — no fog of war |
| Music | Reuse AF adaptive score + new war layer |
| Hosting | Add a card for Aerial Conquest to the GitHub Pages `index.html` |
| Signature unit | **Thornhounds**, fielded by the warlord's armies |

---

## 3. Engine base and the v2 strip

What each AF file becomes:

| file | in Aerial Conquest v2 |
|---|---|
| `config.ts` | Keep `TUNING`, attack frame data, spells, `ENEMIES` (shade, bruiser, caster, flyer → elite Shades). Replace `statsForLevel`/`expToNext`/`MAX_LEVEL` with `statsForKnight(upgrades)` (section 12). Replace region `TIER_SCALING` with a battle-tier curve (tiers 1–5). Add `WAR`, `UNITS` |
| `core.ts` | Keep. + command-wheel input (key + radial touch) |
| `items.ts` | Keep weapon/armour tiers and recipes. Material list cut to what one continent needs (section 12.3). + gold cost on recipes. Drop tables move from "enemy kill" to "battle spoils" |
| `talents.ts` | Keep Blade / Arcana / Survival. + Command branch. AP comes from conquest, not levels |
| `entities.ts` | Keep `Player`, `Enemy`, `Projectile`, `Pickup`. Remove level/EXP. + `team` on `Enemy`, hostile-target selection |
| `music.ts` | Keep. + war layer. Region themes re-mapped to map/battle contexts |
| `render.ts` | Keep knight/enemy/VFX/HUD/menu drawing. Remove tile world, regions, buildings, dungeon rooms, AF map tab. + campaign map, battlefields, units, structures, war HUD |
| `main.ts` | Screens `title / campaign / battle / victory`. `world` and `dungeon` removed |
| `world.ts`, `location.ts`, `overworld.ts`, `dungeon.ts`, `superboss.ts` | **Deleted** |

**New files** (tsconfig order after `talents.ts`, before `music.ts`): `campaign.ts` (continent, territories, nodes, roads — data + map geometry), `war.ts` (war state, economy, armies, off-screen sim, enemy AI), `generals.ts` (recruit, loyalty, capture), `army.ts` (mass-unit sim), `battle.ts` (battlefields, structures, objectives).

**v2 Phase 0 (strip):** delete the five files above and everything that reads them; remove levels/EXP (temporary: the knight uses fixed stats until Phase 11); title → New Game drops you into a plain **test battlefield** (open ground, a few Shades) so combat can be checked; keep talents, gear menus and music working. The v1 Phase 0 work (title, save key, Colosseum removal) carries over.

---

## 4. The continent

- One hand-built continent, **12 territories** (*default* name: **Verdant Reach**; forest, coast and ruins scenery on the map).
- Territory tiers **1–5**, rising with distance from the start; the warlord's capital is tier 5.
- **Start:** player holds one territory ("the Last Camp") with a level-1 castle and one village. No generals. Warband 12. Everything else is Dominion.
- **Goal:** take the warlord's capital castle → ending card → victory screen.
- Map layout is hand-authored data in `campaign.ts` (positions, borders, roads), not procedural.
- **More continents** are out of scope until continent 1 is done and Michael decides. Keep the data shape continent-indexed so adding one later is data, not a rewrite.

---

## 5. Territories and nodes

### 5.1 Node set per territory

| node | count | role | battle when attacked |
|---|---|---|---|
| **Castle** | 1 | Territory capital. Holding it = owning the territory. Produces troops, holds garrison, houses a general, has a forge | Castle siege |
| **Keep** | 1 | Fortification. While the enemy holds it, the castle gets +50% garrison and an iron gate | Keep assault |
| **Village** | 2–3 | Gold income | Village raid |
| **Outpost** | 1 | Watchtower. While the enemy holds it, its territory's castle and keep get +1 tier of defenders | Outpost capture |

**What you can attack:** any enemy node in a territory you border or partly hold (HK's frontier rule). Nodes deep in enemy land are locked until you push up to them.

**Garrison thinning:** each village or outpost in the territory held by the player reduces the castle's starting garrison by 15% (max 60%). Taking the keep removes its +50%. This is the main strategic hook — reward hitting the small targets first.

### 5.2 Node levels (base values; costs × tier multiplier `WAR.tierCost` 1 / 1.5 / 2 / 3 / 4)

| | L1 | L2 | L3 |
|---|---|---|---|
| Village gold / min | 20 | 35 | 55 |
| Village upgrade cost | — | 150 | 400 |
| Castle troop production / min | 6 | 10 | 16 |
| Castle garrison cap | 40 | 80 | 140 |
| Castle gate HP (× tier scale) | 1.0 | 1.5 | 2.2 |
| Castle upgrade cost | — | 300 | 800 |
| Keep defense multiplier (off-screen sim) | 1.5 | 1.7 | 2.0 |
| Keep defenders in battle | +0 | +10 | +20 |
| Keep upgrade cost | — | 250 | 700 |

Outposts don't level. Each L3 castle you hold adds +3 warband cap (max +12).

### 5.3 Capture outcomes

- Captured node flips to the player at `max(1, level − 1)` (fighting damages it).
- Enemy recapture flips it back the same way.
- Village raids burn the buildings; they're rebuilt as yours instantly.

---

## 6. Economy

- **Gold** is a single global treasury.
- Villages accumulate gold locally (cap 300). Every 60 s a **convoy** (wagon + 3 escorts) carries a village's stock along the road to the nearest castle you hold; on arrival it enters the treasury. Convoys are drawn moving on the map: the enemy can intercept yours (off-screen sim), and you can ambush theirs (Convoy battle — you steal their cargo).
- **Troops** are produced continuously at each castle you hold while gold is available. Cost: swordsman 4, spearman 5, archer 6, shieldbearer 8, siege ram 40. Per-castle recruit mix settable from the castle's panel; default auto-balance 40/20/25/15 and a ram per 30 troops.
- **Gold sinks:** troops, node upgrades, knight upgrades (12.1), forging (12.3).
- **Spoils:** every battle won pays gold and a few materials (12.3). No enemy drops on the field — spoils appear on the results screen.
- Enemy runs the same economy, simplified: income = its villages' gold × difficulty multiplier; it spends on garrison refill first, then offensives.

---

## 7. The campaign map

### 7.1 Screen

- Screen `campaign`: the illustrated continent fills the view; pan by drag/stick, pinch/wheel zoom between two levels (whole continent / close-up).
- Drawn: terrain art, territory borders tinted by owner, roads, node icons (by type, owner, level), banners on castles, convoys and armies moving along roads, crossed-swords markers on fights, cage icons on captive generals, muster warnings.
- **Select a node** → side panel (all layouts in shared geometry constants, like AF's `MENU_TAB`/`MENU_LIST`, so render and hit-testing never disagree):
  - enemy node you can reach: type, level, defenders (with thinning applied), expected battle type, **Attack** (starts the battle with your warband);
  - your castle: garrison, production, recruit mix, **Upgrade**, **Send army**, **Assign general**, **Forge**;
  - your village/keep: income or defense, **Upgrade**.
- **Select an army or fight**: **Intercept** (enemy army inside or bordering your land → Field battle), **Join** (fight in progress → battle with current counts).
- HUD: treasury, warband count/cap, skill points, active offensives, next-muster timer.
- Pause menu tabs: Gear · Forge · Talents · Knight · Generals · Status.

### 7.2 Armies

```ts
interface ArmyUnitCounts { sword: number; spear: number; archer: number; shield: number; ram: number; signature: number; shade: number; }
interface MapArmy {
  id: number; team: 'player' | 'enemy';
  general: string | null;            // general id, enemy lord id, or null
  units: ArmyUnitCounts;
  pos: { road: number; t: number };  // position along a road segment
  path: number[]; pathIndex: number; // node path (precomputed road graph)
  target: NodeRef; order: 'attack' | 'reinforce' | 'convoy';
  cargo: number;                      // gold, convoys only
  speed: number;                      // map units/s (WAR)
}
```

- Roads are a hand-authored graph in `campaign.ts`; shortest paths precomputed at load.
- **Sending an army:** castle panel → troops (slider per type, or "half"/"all") → optional general → target node. Armies without a general fight at −20% strength.
- **Your warband** is separate: it fights in every battle you start or join, refilling between battles from the nearest castle you hold (pulls from its garrison).

### 7.3 Off-screen battle sim

When an army reaches a hostile node, or two hostile armies meet on a road:

- Strength `S = Σ(count × UNITS[type].power × tierScale) × (1 + general.command) × fortification`.
  Fortification: castle 1.3 + 0.1/level, keep = its multiplier, village/outpost 1.0, field 1.0.
- Each sim second, each side loses `WAR.simRate × S_enemy` points of HP, removed from its cheapest units first (rams last).
- A side breaks at 20% of its starting strength. Winner takes/keeps the node; loser's general is **captured** (section 9.3).
- Crossed-swords marker with a two-colour strength bar over the node/road.
- **Joining:** select the fight → Join. The battle starts with the *current* counts, current structure HP and the right type (defense/attack). Leaving the battlefield (walking off your exit edge) hands it back to the sim.

---

## 8. Enemy campaign AI (Measured)

- **War clock:** an offensive launches every `T` seconds. T = Easy 240 / Normal 160 / Hard 110, shortened 10% per 3 territories you hold (floor 60% of T).
- **Telegraph:** 30 s before departure: banner + map marker "The Dominion musters at <castle>".
- **Concurrent offensives:** `1 + floor(playerTerritories / 4)`, cap 3 (Hard 4).
- **Grace:** after you take a castle, no offensives target that territory for 90 s.
- **Target score:** `nodeValue × (1 / pathDistance) × (1 / defenderStrength)`; node value castle 5, keep 3, village 2, outpost 1. Prefers your nodes bordering its land.
- **Army size:** 70–110% of the target's defending strength, clamped by its garrisons.
- **Reinforce:** when you siege its castle off-screen, it may send one reinforcement from the nearest castle.
- **Convoys:** the enemy runs convoys just like you; they're your ambush targets.
- **Capital falls:** campaign won; offensives stop.

---

## 9. Generals and loyalty

### 9.1 Recruiting

- Every territory castle has a **Castle Lord** — a named enemy knight using AF's boss AI (patterns brute / sorcerer / stalker / skylord + signature move), generated per castle from a name table. Keeps have a **Captain** (elite, not recruitable).
- Defeat a lord in a castle siege → after victory: **Recruit** or **Release** (Release gives double spoils). Lords who fled because you destroyed the throne first can't be recruited — that's the trade-off.
- The warlord is the final boss and is not recruitable.

### 9.2 Using them

- Active cap: 1 per castle you hold, max 8. Extras sit in reserve (no loyalty change while in reserve).
- Assign to a castle (defends it; adds `command` to its defense) or to a sent army.
- Generals level from battles they're in (off-screen or live). Recruit level = their lord level.
- `command` = 0.10 + 0.01 × level (*default*, generals level 1–20, max 0.30).
- In a live battle a general is an **allied Enemy entity** (`team: 'player'`) using their boss AI and signature move against Dominion targets. Knocked down at 0 HP; if the battle is then lost, they're captured; if won, they get back up.

### 9.3 Capture and rescue

- Captured when their army breaks (sim) or they're down when a battle is lost. Held at the nearest Dominion castle (cage icon on the map).
- **Rescue:** take that castle (auto-rescue), or run a **Rescue raid** battle there without taking the castle.

### 9.4 Loyalty (0–100, start 50 on recruit)

| event | change |
|---|---|
| Victory with the general present (sim or live) | +6 |
| Victory where you and the general both fight in the same live battle | +12 (replaces the +6) |
| Rescued by you | +25 |
| Defeat with the general present | −10 |
| Captured | −15 once, then −1 per 20 s captive |
| Command talent *Warlord's Presence* | all gains ×1.5 |

- **≤ 25:** portrait border turns red, the general says a line, Generals tab shows a warning.
- **0 → defects:** if garrisoned, the castle *and* its garrison flip to the Dominion and they become its lord again; if leading an army, the army joins the Dominion; if captive, they join the castle holding them. A defected general can be beaten and recruited again, starting at loyalty 30.
- Never defects mid-battle (check at the end).

---

## 10. Battles

### 10.1 Framework

- Screen `battle`. Entered from the map (Attack / Join / Intercept / defend prompt); 0.6 s fade + banner with the objective.
- Battlefield larger than the view; camera follows the knight. **New top-down art** per battle type and territory scenery (grass, dirt roads, stone walls, timber villages, forest edges). Nothing from AF's tile regions or dungeon rooms.
- **Structures** (`battle.ts`): `gate`, `building`, `throne`, `wagon`, `captureRing`, `cell`. Each has HP / progress and a hit radius; hit by knight attacks (×0.3 vs gates/throne, ×1 vs buildings; Fire ×2 vs buildings) and rams (×4 vs gates, can't hit units).
- **Spawns:** each side has a spawn edge/gate. Live caps: desktop 100 per side, phone 60 per side (`IS_TOUCH`). Units beyond the cap wait in reserve and stream in every 1.5 s when the live count drops.
- **Losing:** knight dies → back to the map, warband lost, node unchanged. Defense also lost if the defended objective is destroyed.
- **Rout:** a side whose general/lord/captain is down *and* which has <40% units left flees.
- **Exit:** walking into your own spawn edge leaves the battle (attack abandoned, hands back to the sim).
- Results screen: kills, losses, gold + material spoils, skill points, general loyalty changes, node captured.

### 10.2 Types

| # | type | layout (px) | win | target time |
|---|---|---|---|---|
| 1 | **Village raid** | 2400×1400, 3–5 houses | Burn every house | ~2 min |
| 2 | **Outpost capture** | 2000×1200, tower on a rise | Stand in the capture ring 10 s with no enemies inside (progress pauses, doesn't reset) | ~2 min |
| 3 | **Keep assault** | 2000×1600, walled fort, 1 gate | Break the gate, defeat the Captain | ~3 min |
| 4 | **Castle siege** | 3200×1800: outer gate → courtyard → inner gate → throne room | Destroy the throne. The Lord defends it; beating the Lord first allows recruiting | 4–6 min |
| 5 | **Convoy ambush** | 3600×1000 road, wagon moving toward the far edge | Destroy the wagon(s) before they leave → steal cargo | ~2 min |
| 6 | **Field battle** | 2800×1400 open ground | Rout or destroy the army | 2–3 min |
| 7 | **Defense** | node's own layout, roles reversed | Rout the attackers, or survive 3 min with the objective standing | 2–3 min |
| 8 | **Rescue raid** | castle layout, cell in the throne-room wing | Reach the cell, hold its ring 8 s, then reach your exit edge with the general alive | ~3 min |

Iron gate (keep held by enemy) = gate HP ×1.6.

---

## 11. Units and combat

### 11.1 Two tiers

- **Minions** (`army.ts`): struct-of-arrays (`Float32Array` x/y/vx/vy/hp, `Uint8Array` type/team/state), 2–3 states (advance / fight / flee), uniform-grid spatial hash (cell 64 px), retarget every 10 frames. No poise, no frame data; one simple windup → hit.
- **Elites**: AF `Enemy` class (Shades, captains, lords, generals). ≤ 8 per side per fight.
- Knight attacks hit minions through the same `inArc` test against the spatial hash.
- **Hitstop:** minion kills give 0–1 frame of hitstop, capped at 2 frames per sim frame total.

### 11.2 Roster (base stats at tier 1; scaled by the battle-tier curve)

| unit | side | HP | dmg | speed | reach | notes |
|---|---|---|---|---|---|---|
| Swordsman | both | 30 | 4 | 95 | 28 | baseline |
| Spearman | both | 34 | 4 | 85 | 44 | ×2 vs beasts and charging units |
| Archer | both | 20 | 3 | 90 | 260 | arrows = lightweight projectiles in the same arrays |
| Shieldbearer | both | 60 | 3 | 70 | 26 | frontal hits −70% |
| Siege ram | both | 200 | gate ×4 | 50 | 30 | 4 crew sprite, ignores units |
| Shades | Dominion | — | — | — | — | AF `ENEMIES` (shade, bruiser, caster, flyer), elite tier, 1–4 per fight |
| Thornhound | Dominion | 22 | 5 | 160 | 26 | packs of 6, warlord's armies and tier 4–5 only |

**Feel target:** with the gear and upgrades expected for a territory's tier, the knight's normal swing kills a swordsman in 2 hits; a Whirl clears a crowd. Minions threaten through numbers. Player troops are a little weaker per unit than the Dominion's; numbers and generals make up the difference.

### 11.3 Bosses

- **Castle Lords:** generated per castle (pattern + 1–2 moves + palette), stats from the territory tier.
- **Keep Captains:** elite `Enemy` with a captain palette.
- **Warlord Garrick Thorne:** hand-authored final boss, two signature moves, all four patterns in phases, leads Thornhounds.

### 11.4 Command wheel

- Keyboard: hold **Q** + direction (or tap Q to cycle). Gamepad: LB + stick. Touch: a **CMD** button that opens a 4-slice radial under the thumb. (Potion moves off Q; key TBD by Michael.)
- **Follow** (default): stay within 220 px of the knight. **Charge**: attack nearest hostiles / objective. **Hold**: stay where ordered. **Focus**: everyone targets your lock-on target (or the nearest structure if none).
- Applies to your warband and allied units in the battle; generals obey Charge/Focus.

---

## 12. Progression (HK-style)

No player level, no EXP.

### 12.1 Knight upgrades (gold)

Pause menu **Knight** tab, bought at any time:

| upgrade | per rank | ranks | cost (*default*, gold) |
|---|---|---|---|
| Vitality | max HP | 10 | 100 × rank² |
| Might | strength + defense | 10 | 100 × rank² |
| Arcana | magic + magic resist + max MP | 10 | 100 × rank² |

`statsForKnight(ranks)` replaces `statsForLevel`; rank 10 in a stat ≈ AF level-40 values for it (*default*, tuned in Phase 14).

### 12.2 Talents (skill points from conquest)

- **Skill points (SP):** start with 5; +2 for the first capture of each of the 11 enemy castles, +1 for each of the 12 keeps, +3 bonus for the warlord's capital (*default*). 5 + 22 + 12 + 3 = **42** = the whole tree, so the full tree lands at campaign end (tuned in Phase 14).
- AF's Blade (11 SP), Arcana (11), Survival (10) branches unchanged, plus **Command**:

| id | name | cost | needs | effect |
|---|---|---|---|---|
| banner | Rally Banner | 1 | — | Warband +8 |
| drill | Drillmaster | 1 | — | Troop HP +15% |
| steel | Sharpened Steel | 1 | — | Troop damage +15% |
| muster | Muster | 2 | banner | Warband +12, reinforcements stream 30% faster |
| presence | Warlord's Presence | 2 | — | Troops within 300 px of you +20% damage; general loyalty gains ×1.5 |
| host | Grand Host | 3 | muster | Warband +16, troop HP +15% |

  All four branches = 42 SP. Warband cap = 12 + talents (max +36) + L3 castles (max +12) = **60**.
- UI: Talents tab gets 4 branch columns (AF lays out 3: `colW = (VIEW_W - 52 - 20) / 3`).
- v1's ranked **Masteries** are dropped: they existed to soak up 58 surplus AP at level 100, and v2 has no levels.

### 12.3 Gear and forging (gold + spoils)

- AF's 6 weapon and 6 armour tiers stay. Forge from any castle you hold (castle panel or Forge tab).
- Recipes cost **gold + materials**. Materials come only from **battle spoils**: each won battle pays 1–3 common materials scaled by tier; castle lords pay their castle's rare material; the warlord pays the top one.
- Material list cut to one continent's worth (*default*: 4 common + 3 rare, renamed from AF's list).
- Recipes are re-costed so tier N gear is affordable around territory tier N.

---

## 13. Story, modes, saves, UI, music

**Story (light framing).** Text cards + short portrait lines, no cutscene engine:
1. Intro: the Dominion took the Verdant Reach; you're the last knight of the Aerial Order, holding the Last Camp.
2. First keep, first castle, first general: one line each.
3. Recruit / ≤25 loyalty / defect / rescue: one line each per general (templates).
4. Warlord defeated → ending card → victory screen.

**Difficulty** (choose at New Game, changeable in Options): Easy (enemy dmg ×0.7, war clock ×1.4, enemy income ×0.8), Normal, Hard (×1.3, ×0.75, ×1.25).

**New Game+:** after victory. Keeps knight upgrades, talents, gear, materials. Resets generals, nodes, gold. Dominion stats ×1.5 per NG+ cycle, war clock ×0.8. NG+ count shown on the title and save slot.

**Victory screen:** total time, battles won/lost, nodes captured, generals recruited / defected / rescued, gold earned, troops lost, highest combo, difficulty, NG+ cycle.

**Saves:** 3 slots (`aerial-conquest-slot1..3`). Title → slot picker showing territories held, play time, NG+. Autosave after every battle and every 60 s on the map. Save contains: knight (upgrades, talents, gear, materials, looks), war state (node owner/level/garrison/stock, armies, convoys, treasury, war clock, captives), generals, difficulty, NG+, stats. Validate on load (drop anything that no longer exists).

**Battle HUD:** objective text + progress bar, both sides' live/reserve counts, command wheel state, ally general portraits with HP.

**Music:** keep AF's score. Map = calm theme (intensity 0–1 by threat); battles 2; 60+ live units or siege inner gate 3; lord / warlord 4. New **war layer**: snare-roll march + low brass (saw/square through a lowpass), added on bar lines. Keep AF rev 3's mix rule — the lead stays on top.

**Hosting:** add an Aerial Conquest card/link to the repo root `index.html` in the last phase.

---

## 14. Phases

Each phase: build, run headless checks, update README, commit and push. Touch must work in every phase.

| # | phase | done when |
|---|---|---|
| 0 | **Strip** (section 3) | Builds; title → test battlefield; combos, air combos, Whirl, dash, spells, guard unchanged; talents, gear menus, music work; no overworld / dungeon / region / boss / level code left |
| 1 | **Teams** — `team` on `Enemy`, hostile-target selection, allied Enemy entities | An allied Shade fights hostile Shades; hostile AI targets allies as well as the knight |
| 2 | **Mass units** — `army.ts`, roster, spatial hash, rendering, knight ↔ minion damage, hitstop cap | 200 live units at 60 fps desktop, 120 at 60 fps on emulated iPhone 13; Whirl through 20 minions doesn't hitch |
| 3 | **Warband + command wheel + streaming** | All 4 commands work by key, pad and touch radial; reserves stream when live count drops |
| 4 | **Battle framework + new battlefield art** + Field battle + Village raid | Both types winnable/losable; death returns to map stub; results screen; exit edge works |
| 5 | **Remaining battle types** (outpost, keep, castle siege, convoy, defense, rescue) | Each type's win and lose conditions verified; siege throne-first vs lord-first both work; times land in target bands with default troops |
| 6 | **Campaign map** — `campaign.ts`, illustrated continent, territories, nodes, roads, pan/zoom, node panels, attack → battle → result → ownership | Every node reachable by road; frontier rule correct; map readable and tappable on phone |
| 7 | **War state & economy** — gold, convoys, production, upgrades | Capture a village → convoy delivers gold → castle produces troops → upgrade works; garrison thinning math verified |
| 8 | **Armies, off-screen sim, join, intercept** | Send an army, it walks the road, sim resolves; joining carries current counts and structure HP; intercept starts a field battle |
| 9 | **Enemy AI** | Telegraph 30 s before departure; concurrent cap and grace respected; offensives stop after the capital falls |
| 10 | **Generals & loyalty** | Every loyalty row verified; defection flips castle + garrison; re-recruit starts at 30 |
| 11 | **Progression & bosses** — knight upgrades, SP from conquest, Command branch, forge gold + spoils, lords, captains, warlord, Thornhounds | Warband cap hits exactly 60 with all sources; SP totals match 12.2; upgrades and talents survive reload; forge spends gold + materials |
| 12 | **Story, difficulty, NG+, victory, 3 slots** | Scripted fast run start → warlord → victory → NG+; slots isolated; save round-trips through reload |
| 13 | **Music war layer, touch polish, phone caps** | Intensity ladder visits 0–4 at the right moments; full siege playable on emulated phone |
| 14 | **Balance + index.html card** | Battles hit their time bands; continent completable in ~2–3 h on Normal; landing page links the game |

---

## 15. Verification checklist (headless Chromium)

- Combos, air combos, Whirl, dash, spells, guard unchanged from AF.
- 200/120 unit perf targets; no frame over 25 ms during a Whirl through a crowd.
- Garrison thinning: 0 / 1 / 2 / 3 / 4 small nodes taken = 100 / 85 / 70 / 55 / 40%, keep removes its +50%.
- Off-screen sim: equal strength → defender (fortified) wins; 2:1 attacker wins.
- War clock interval, telegraph lead, grace and concurrency on all three difficulties.
- Loyalty: each table row, the ≤25 warning, defection in all three states.
- Save/load for each slot, including armies on the road.
- Touch: command radial, map pan/zoom and node taps, slot picker, battle HUD, portrait rotate prompt.

---

## 16. Traps carried over from Aerial Finisher

- `setPointerCapture` throws for stale pointers — wrap it in try/catch.
- Append new parameters to existing function signatures (e.g. `Sfx.tone`), never insert in the middle.
- Combo chaining needs `queuedAttack`, not just the input buffer.
- Check music intensity thresholds against real fight sizes — battles are much bigger than AF waves.
- Measure canvas text with `measureText`; never guess offsets (the "AERIAEINISHER" bug).
- Early-return the HUD under full-screen overlays (alpha bleed).
- Top-level consts depend on tsconfig order; functions are hoisted.
- Google Fonts errors in a sandbox are not real.
- localStorage is per-origin: the GitHub Pages build and a local file have separate saves.

## 17. Open items (defaults apply if Michael doesn't say otherwise)

- All names (Dominion, Garrick Thorne, Verdant Reach, Last Camp) are placeholders.
- Potion's new key (Q goes to the command wheel).
- Art direction for minions (simple team-coloured figures by default) and for the map illustration.
- Whether and when to add continents 2–4 (v1 had Ember Wastes, Frostcrown, The Riftthrone with signature units War Beasts, Ice Mages, Riftspawn).
