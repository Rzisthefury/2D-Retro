# Aerial Conquest — build spec

**Status:** fully planned, not built. This file is the handoff for Claude Code.
**Owner decisions:** Michael, 2026-09-30. Anything marked *default* is Claude's call and can be overruled.

**Pitch:** Hyper Knights' structure (conquer a continent territory by territory through real-time skirmishes, backed by an economy and an army), played with Aerial Finisher's knight, moveset and KH2-style action combat. Four continents, level 1–100.

---

## 0. Rules for the builder

1. **Fork, don't share.** Copy the open-world Aerial Finisher (`Documents\GitHub\Retro Games\Aerial Finisher`) into `Documents\GitHub\Retro Games\Aerial Conquest` and evolve it there. Never edit Aerial Finisher.
2. Same toolchain: TypeScript, `tsc -p tsconfig.json` (`module: none`, `outFile`), `node build.js` inlines into one HTML. **No dependencies, no bundler, no npm installs.**
3. **Commit and push each finished phase** to the session's working branch. No force-push, no history rewrites, nothing to `main` without Michael's say-so.
4. Every build also gets copied to `Desktop\Claude\Aerial Conquest` (playable HTML + `src/` + build files + README). A build is not delivered until it is in both folders.
5. Output file: `aerial-conquest.html`. Save keys: `aerial-conquest-slot1/2/3`. Never touch `aerial-finisher-save-*`.
6. **Phone is equal priority.** Every phase must work on touch before it counts as done. Unit caps scale down on phones.
7. Work phase by phase (section 14). Each phase ends with its "done when" checks passing in headless Chromium, and a README section describing what changed, the same way Aerial Finisher's README does.
8. All new tunable numbers go in a `WAR` constants object in `config.ts` (next to `TUNING`), never inline.

---

## 1. Hyper Knights reference (what we copy, what we fix)

**Copy:** one map per campaign split into territories, enemy owns everything at the start; villages make gold, castles turn gold into troops, keeps fortify; three upgrade levels per node; gold moves by convoy; skirmish type depends on target (burn villages, break gates then the throne, ambush convoys, defend); taking small nodes first thins the castle garrison; hundreds of minions; allied knights who level up and can attack or defend; skill points for army stats; New Game+.

**Replace:** HK's button-sequence combat → Aerial Finisher's combat (combos, air combos, dash, Whirl, spells, guard, talents, crafting).

**Fix (HK's known complaints):**

| HK complaint | Our fix |
|---|---|
| Only one map | Four continents |
| 600-vs-600 fights become a slog | Live-unit caps + reinforcement streaming; minions die fast |
| Constant enemy offensives make defending pointless | "Measured" war clock with telegraphs and grace periods |
| Too many mini-boss heroes, stutter | One lord per castle, one captain per keep; perf budgets |
| Waiting while five troops hit a gate | Knight can damage gates; siege rams; gate HP tuned to the 2–4 min target |
| No victory screen | Victory + stats screen |

---

## 2. Decisions log

| Topic | Decision |
|---|---|
| Engine | Fork open-world Aerial Finisher |
| Strategic layer | Real-time, walkable overworld. Pause-menu **War Map** tab for orders |
| Campaigns | 4 hand-built continents, free travel by ship between them once unlocked |
| Continent size | 5x3 grid, 13 territories each (same as AF), 52 total |
| Depth | Full AF: level 1–100, tiers 1–10, all crafting tiers |
| Enemy | The **Umbral Dominion** (placeholder), ruled by **Emperor Vael** (placeholder). Human soldiers + Shades as shock troops |
| Your army | Personal **warband** that follows you + **sent armies** from castles led by generals |
| Warband size | 12 → 60 |
| Enemy pressure | Measured: timed counterattacks with breathing room, scaling with your land |
| Off-screen fights | Live strength sim ticking over time; you can travel there and join mid-fight |
| Economy | Gold + AF crafting materials |
| You fall | Wake at nearest held castle, warband lost, skirmish lost |
| Generals | Captured when beaten, rescuable; left captive too long → defect |
| Loyalty drivers | Victories/defeats, fighting beside you (incl. rescue). *Not* wages, *not* "left alone" |
| Story | Light framing |
| Kept from AF | Dungeons, Ascendant superbosses, chests + landmarks. **Removed:** Colosseum / Wave Trials |
| Saves | 3 slots + autosave |
| Army stats | New 4th talent branch **Command** |
| Battle commands | 4-way command wheel: Follow / Charge / Hold / Focus |
| Extras | Difficulty modes, New Game+, Victory + stats screen |
| Themes | By climate (section 4) |
| Skirmish length | 2–4 min (castle sieges 4–6) |
| General cap | 1 per castle held, max 8 active, rest in reserve |
| Battlefields | Separate scrolling battlefield per skirmish (like AF dungeons) |
| Visibility | Full — no fog of war |
| Ambient roamers | Enemy-held land only |
| Field fights | Yes — touching a marching enemy army starts a field skirmish |
| Music | Reuse AF adaptive score + new war layer |
| Hosting | Add a card for Aerial Conquest to the GitHub Pages `index.html` |
| Signature units | One per continent, fielded by that continent's warlord |
| Recruiting | Beaten castle lords can be recruited as generals |
| Loyalty | Meter; at zero the general defects with their garrison |

---

## 3. Engine base and fork

The open-world AF is 13 files, ~9,200 lines. What exists and what happens to it:

| file | today | in Aerial Conquest |
|---|---|---|
| `config.ts` | `TUNING`, attacks, spells, `ENEMIES` (shade, bruiser, caster, flyer), stat curves | + `WAR` constants, `UNITS` roster, signature units |
| `core.ts` | math, input, touch, audio, SFX | + command-wheel input (key + radial touch) |
| `items.ts` | 7 materials, 6 weapon / 6 armour tiers, drops, recipes | + gold cost on recipes |
| `talents.ts` | Blade / Arcana / Survival, 18 nodes | + Command branch (6 nodes) |
| `world.ts` | `WorldLocation`, `WorldState`, unlock rules, `nextObjective` | Becomes per-continent; boss-gated barriers removed (see 5.4); objectives come from war state |
| `location.ts` | hub + 12 areas, tiers 1–10, 2–3 bosses each | Becomes `CONTINENTS` data: 4 × 13 territories. AF's 12 dungeons re-homed (section 11.3) |
| `overworld.ts` | 5x3 tile world, camera, buildings, ~110 spawners/region | `buildOverworld(continent)`; `WORLD_MAP` becomes `let`, rebuilt on sailing; new building kinds |
| `dungeon.ts` | multi-room dungeons | Kept as optional content |
| `superboss.ts` | Ascendant rematches | Kept |
| `music.ts` | adaptive score, 5 intensity levels | + war layer |
| `entities.ts` | Player, Enemy (full AI), Projectile, Pickup | + `team` on Enemy, hostile-target selection |
| `render.ts` | tiles, knight, VFX, HUD, menus, title | + units, structures, war map, war HUD |
| `main.ts` | `Game`, screens `title/world/dungeon/trial` | Screens `title/world/dungeon/skirmish/sail/victory`; `trial` removed |

**New files** (tsconfig order after `superboss.ts`, before `music.ts`): `campaign.ts` (continents, territories, nodes data), `war.ts` (war state, economy, armies, off-screen sim, enemy AI), `generals.ts` (recruit, loyalty, capture), `army.ts` (mass-unit sim), `skirmish.ts` (battlefields, structures, objectives).

**Fork pass (Phase 0):** copy, rename title/wordmark to AERIAL CONQUEST (measure text — see trap list), new save keys, delete Colosseum building + Wave Trial screen + `trialBest`/`unlockedWaveTiers` + `BattleState.kind 'trial'`, keep everything else running.

---

## 4. The four continents

Each continent is a 5x3 grid, 2 cells impassable mountain, 13 territories. Territories get tiers ascending with distance from the landing territory.

| # | Continent | Biomes | AF tiers | Level band | Warlord (placeholder) | Signature unit |
|---|---|---|---|---|---|---|
| 1 | **Verdant Reach** | Forest, Coast, Ruins | 1–3 | 1–25 | Warlord Garrick Thorne | **Thornhounds** — fast beast packs (minion tier) |
| 2 | **Ember Wastes** | Desert, Volcano | 4–5 | 25–44 | Warlord Sabra Kiln | **War Beasts** — Cinder Rhinos, charging heavies (elite tier) |
| 3 | **Frostcrown** | Tundra, Sky | 6–8 | 44–75 | Warlord Ysolde Rime | **Ice Mages** — frost AoE that slows (elite tier) |
| 4 | **The Riftthrone** | Rift + corrupted Forest/Ruins/Volcano/Tundra | 9–10 | 75–100 | Emperor Vael | **Riftspawn** — split into two minions on death |

- Territory tier within a continent: landing = continent's min tier (safe); then spread across the band; the warlord's capital territory = continent's max tier.
- Within a tier the enemy level is rolled from AF's `TIER_LEVELS` like today.
- **Continent 1 start:** player holds one territory ("the Last Camp") with a level-1 castle and one village. No generals. Warband 12. Everything else is Dominion.
- **Unlocking the next continent:** take the warlord's capital castle. A **Port** building in the landing territory of each continent (and in the capital territory of the previous one) opens sailing.
- **Sailing:** `sail` screen = short transition with a ship crossing (2–3 s), then load that continent's map. Conquered continents stay yours; once a continent's capital falls the Dominion there stops counterattacking (it keeps any nodes you haven't taken, which stay passive).
- **Continent 4 capital:** Emperor Vael's throne. Taking it ends the campaign → victory screen.
- Map generation stays seeded and deterministic: seed = `1337 + continent * 1000`. Bump `MAP_VERSION`.

---

## 5. Territories and nodes

### 5.1 Node set per territory

| node | count | role | skirmish when attacked |
|---|---|---|---|
| **Castle** | 1 | Territory capital. Holding it = owning the territory. Produces troops, holds garrison, houses a general | Castle siege |
| **Keep** | 1 | Fortification. While the enemy holds it, the castle gets +50% garrison and an iron gate | Keep assault |
| **Village** | 2–3 | Gold income. Reuses AF's town buildings (forge stays in one town per territory where AF had a station) | Village raid |
| **Outpost** | 1 | Waypoint (fast travel when yours). Source of enemy roamers when theirs | Outpost capture |
| Port | landing + capital only | Sailing | — |
| Dungeon | 3 per continent | Optional AF dungeon | AF dungeon run |
| Landmark, chests | as AF | Flavour / loot | — |

**Garrison thinning:** each village or outpost in the territory held by the player reduces the castle's starting garrison by 15% (max 60%). Taking the keep removes its +50%. This is the main strategic hook — reward hitting the small targets first.

### 5.2 Node levels (base values; costs scale ×1 / ×2.5 / ×5 / ×9 by continent)

| | L1 | L2 | L3 |
|---|---|---|---|
| Village gold / min | 20 | 35 | 55 |
| Village upgrade cost | — | 150 | 400 |
| Castle troop production / min | 6 | 10 | 16 |
| Castle garrison cap | 40 | 80 | 140 |
| Castle gate HP (× tier scale) | 1.0 | 1.5 | 2.2 |
| Castle upgrade cost | — | 300 | 800 |
| Keep defense multiplier (off-screen sim) | 1.5 | 1.7 | 2.0 |
| Keep defenders in skirmish | +0 | +10 | +20 |
| Keep upgrade cost | — | 250 | 700 |

Outposts don't level. Each L3 castle you hold adds +3 warband cap (max +12).

### 5.3 Capture outcomes

- Captured node flips to the player at `max(1, level − 1)` (fighting damages it).
- Enemy recapture flips it back the same way.
- Village raids burn the buildings; they're rebuilt as yours instantly (keep it simple, no rebuild timer).

### 5.4 Borders

AF's magic barriers between regions are removed. Every territory is reachable on foot from the start; danger is controlled by enemy tier levels and garrisons, not locks. (The Port is the only gate, between continents.)

---

## 6. Economy

- **Gold** is a single global treasury.
- Villages accumulate gold locally (cap 300 × continent multiplier). Every 60 s a **convoy** (wagon + 3 escorts) carries a village's stock along the road to the nearest castle you hold; on arrival it enters the treasury. Convoys are real map entities: the enemy can intercept yours (off-screen sim), and you can ambush theirs (Convoy skirmish — you steal their cargo).
- **Troops** are produced continuously at each castle you hold while gold is available. Cost: swordsman 4, spearman 5, archer 6, shieldbearer 8, siege ram 40 (× continent multiplier). Per-castle recruit mix is settable on the War Map; default auto-balance 40/20/25/15 and a ram per 30 troops.
- **Gold sinks:** troops, node upgrades, forge recipes (new gold fee, ×tier), sailing (free — don't gate progress on gold).
- **Materials:** unchanged from AF (enemy drops, boss-only materials, forges). Castle lords and warlords drop their territory's boss material.
- Enemy runs the same economy, simplified: its income = its villages' gold × difficulty multiplier; it spends on garrison refill first, then offensives.

---

## 7. Armies on the overworld

### 7.1 Entities

```ts
interface ArmyUnitCounts { sword: number; spear: number; archer: number; shield: number; ram: number; signature: number; shade: number; }
interface MapArmy {
  id: number; team: 'player' | 'enemy';
  general: string | null;            // general id, enemy lord id, or null
  units: ArmyUnitCounts;
  x: number; y: number;              // world px
  path: number[]; pathIndex: number; // precomputed road path (tile indices)
  target: NodeRef; order: 'attack' | 'reinforce' | 'convoy';
  cargo: number;                      // gold, convoys only
  speed: number;                      // px/s, ~70% of knight walk speed
}
```

- Paths: at map build, BFS over walkable tiles between every pair of nodes in the same continent; cache by `(from,to)`.
- Drawn on the overworld as a banner + a cluster of 3–7 small figures (count scales with size), team-coloured. Also drawn on the War Map.
- **Sending an army (War Map tab):** pick a castle → pick troops (slider per type, or "half"/"all") → optional general → pick target node. Armies without a general fight at −20% strength.
- **Your warband** is separate: it walks with you, refills at any castle you hold (pulls from garrison), and comes into every skirmish you start.

### 7.2 Off-screen battle sim

When an army reaches a hostile node or two hostile armies touch and the knight is not within join range:

- Strength `S = Σ(count × UNITS[type].power × tierScale) × (1 + general.command) × fortification`.
  Fortification: castle 1.3 + 0.1/level, keep = its multiplier, village/outpost 1.0, field 1.0.
- Each sim second, each side loses `WAR.simRate × S_enemy` points of HP, removed from its cheapest units first (rams last).
- A side breaks at 20% of its starting strength. Winner takes/keeps the node; loser's general is **captured** (section 9.3).
- Show a crossed-swords marker with a two-colour strength bar over the node on the map and War Map.
- **Joining:** knight within 500 px of a fight → prompt "Join battle". The skirmish starts with the *current* counts, current structure HP and the right type (defense/attack). Leaving the battlefield (walking off the edge exit) hands it back to the sim.
- **Intercepting:** touching a marching enemy army on the overworld starts a **Field battle** skirmish with its counts.

---

## 8. Enemy campaign AI (Measured)

- **War clock:** an offensive launches every `T` seconds. T = Easy 240 / Normal 160 / Hard 110, shortened 10% per 3 territories you hold (floor 60% of T).
- **Telegraph:** 30 s before departure: banner + map marker "The Dominion musters at <castle>".
- **Concurrent offensives:** `1 + floor(playerTerritories / 4)`, cap 3 (Hard 4).
- **Grace:** after you take a castle, no offensives target that territory for 90 s.
- **Target score:** `nodeValue × (1 / pathDistance) × (1 / defenderStrength)`; node value castle 5, keep 3, village 2, outpost 1. Prefers your nodes bordering its land.
- **Army size:** 70–110% of the target's defending strength, clamped by its garrisons.
- **Reinforce:** when you siege its castle off-screen, it may send one reinforcement from the nearest castle.
- **Convoys:** enemy runs convoys just like you; they're your ambush targets.
- **Roamers:** AF's spawners stay, but only spawn in enemy-held territories (and stop spawning in a territory the moment its castle flips). Outposts held by the enemy add +30% spawn rate in their territory.
- **Once a continent's capital falls:** offensives on that continent stop.

---

## 9. Generals and loyalty

### 9.1 Recruiting

- Every territory castle has a **Castle Lord** — a named enemy knight using AF's boss system (`BossDefinition`, patterns brute / sorcerer / stalker / skylord + signature move). Names generated from per-continent name tables. Keeps have a **Captain** (elite, not recruitable).
- Defeat a lord in a castle siege → after victory, a choice: **Recruit** or **Release** (Release gives double boss materials). Lords who fled because you destroyed the throne first can't be recruited — that's the trade-off.
- Warlords are recruitable too, after their capital falls. Emperor Vael is not.

### 9.2 Using them

- Active cap: 1 per castle you hold, max 8. Extras sit in reserve (no loyalty change while in reserve).
- Assign to a castle (defends it; adds `command` to its defense) or to a sent army.
- Generals level from battles they're in (off-screen or live), XP like the player's curve, independent of your level. Recruit level = their lord level.
- `command` = 0.10 + 0.002 × level (max ~0.30).
- In a live skirmish a general is an **allied Enemy entity** (`team: 'player'`) using their boss AI and signature move against Dominion targets. They can be knocked down; if their HP hits 0 and the skirmish is then lost, they're captured; if it's won, they get back up.

### 9.3 Capture and rescue

- A general is captured when their army breaks (sim) or they're down when a skirmish is lost. They're held at the nearest Dominion castle (marked on the map with a cage icon).
- **Rescue:** take that castle (auto-rescue), or run a **Rescue raid** skirmish there (section 10, type 8) without taking the castle.
- While captive, loyalty drains (below).

### 9.4 Loyalty (0–100, start 50 on recruit)

| event | change |
|---|---|
| Victory with the general present (sim or live) | +6 |
| Victory where you and the general both fight in the same live skirmish | +12 (replaces the +6) |
| Rescued by you | +25 |
| Defeat with the general present | −10 |
| Captured | −15 once, then −1 per 20 s captive |
| Command talent *Warlord's Presence* | all gains ×1.5 |

- **≤ 25:** portrait border turns red, the general says a line ("Another rout like that and I'm done with you."), War Map shows a warning.
- **0 → defects:** if garrisoned, the castle *and* its garrison flip to the Dominion and they become its lord again; if leading an army, the army joins the Dominion; if captive, they join the castle holding them. A defected general can be beaten and recruited again, starting at loyalty 30.
- Never defects mid-skirmish (check at the end).

---

## 10. Skirmishes

### 10.1 Framework

- New screen `skirmish`. Enter via node prompt / join / intercept; short transition (0.6 s fade + banner with objective).
- Battlefield = tile map like AF dungeon rooms but larger than the view; camera follows (`cameraFor` generalised to battlefield bounds). Theme look comes from the territory.
- **Structures** (new class in `skirmish.ts`): `gate`, `building`, `throne`, `wagon`, `captureRing`, `cell`. Each has HP / progress, a hit radius, and is hit by knight attacks (normal damage ×0.3 vs gates/throne, ×1 vs buildings; Fire ×2 vs buildings), and rams (×4 vs gates, can't hit units).
- **Spawns:** each side has a spawn edge/gate. Live caps: desktop 100 per side, phone 60 per side (`IS_TOUCH`). Units beyond the cap wait in reserve and stream in every 1.5 s when the live count drops.
- **Losing:** knight dies → retreat (wake at nearest held castle, warband lost, node unchanged). Defense also lost if the defended objective is destroyed.
- **Rout:** a side whose general/lord/captain is down *and* which has <40% units left flees (units run to their edge and despawn). Speeds up the tail of every fight.
- **Exit:** walking into your own spawn edge leaves the skirmish (attack abandoned, hands back to the sim).
- Results screen: kills, losses, gold/materials, XP, general loyalty changes, node captured.

### 10.2 Types

| # | type | layout (px) | win | target time |
|---|---|---|---|---|
| 1 | **Village raid** | 2400×1400, 3–5 houses | Burn every house (buildings HP) | ~2 min |
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

- **Minions** (`army.ts`): struct-of-arrays (`Float32Array` x/y/vx/vy/hp, `Uint8Array` type/team/state), 2–3 states (advance / fight / flee), uniform-grid spatial hash (cell 64 px) for separation + nearest-hostile queries, retarget every 10 frames, not every frame. No poise, no frame data; one simple windup → hit.
- **Elites**: AF `Enemy` class (Shades, captains, lords, generals, signature elites). A handful per fight (≤ 8 per side).
- Knight attacks hit minions through the same `inArc` test against the spatial hash.
- **Hitstop:** minion kills give 0–1 frame of hitstop, capped at 2 frames per sim frame total — otherwise a Whirl through 20 minions freezes the game.

### 11.2 Roster (base stats at tier 1; scale by AF stat curve for the territory's level)

| unit | side | HP | dmg | speed | reach | notes |
|---|---|---|---|---|---|---|
| Swordsman | both | 30 | 4 | 95 | 28 | baseline |
| Spearman | both | 34 | 4 | 85 | 44 | ×2 vs beasts and charging units |
| Archer | both | 20 | 3 | 90 | 260 | arrows = lightweight projectiles in the same arrays |
| Shieldbearer | both | 60 | 3 | 70 | 26 | frontal hits −70% |
| Siege ram | both | 200 | gate ×4 | 50 | 30 | 4 crew sprite, ignores units |
| Shades | Dominion | — | — | — | — | existing AF `ENEMIES`, elite tier, 1–4 per fight |
| Thornhound | C1 | 22 | 5 | 160 | 26 | packs of 6 |
| War Beast | C2 | 400 | 18 | 140 charge | 50 | elite; charge knocks units aside |
| Ice Mage | C3 | 90 | 10 | 70 | 240 | elite; frost circle slows 40% |
| Riftspawn | C4 | 40 | 6 | 100 | 30 | splits into 2× 15 HP on death (once) |

**Feel target:** at the recommended level, the knight's normal swing kills a swordsman in 2 hits; a Whirl clears a crowd. Minions threaten through numbers, not individually. Player-side troops are a little weaker than the Dominion's per unit; numbers and generals make up the difference.

### 11.3 Bosses

- **Castle Lords:** generated `BossDefinition` per territory (pattern + 1–2 moves + continent palette).
- **Warlords:** hand-authored per continent, stronger, two signature moves, lead their signature unit.
- **Emperor Vael:** final boss, all four patterns in phases.
- **AF dungeons:** AF's 12 areas' dungeons and bosses are re-homed, 3 per continent by biome — C1: forest-1, coast-1, ruins-1; C2: desert-1, volcano-1, volcano-2; C3: tundra-1, sky-1, sky-2; C4: rift-1 + "corrupted" forest-2 and ruins-2. Their tiers are re-set to the territory they sit in. They no longer unlock areas; they drop boss materials as before.
- **Ascendants:** unchanged rules, available for dungeon bosses and warlords after the capital falls.

### 11.4 Command wheel

- Keyboard: hold **Q** + direction (or tap Q to cycle). Gamepad: LB + stick. Touch: a **CMD** button that opens a 4-slice radial under the thumb.
- **Follow** (default): stay within 220 px of the knight. **Charge**: attack nearest hostiles / objective. **Hold**: stay at the spot you gave the order. **Focus**: everyone targets your lock-on target (or the nearest structure if none).
- Applies to your warband and allied units in the skirmish; generals obey Charge/Focus.

---

## 12. Progression

- **Levels 1–100, tiers 1–10** as AF. Each continent covers its band (section 4).
- **AP:** 1 per level as AF.
- **Command branch** (new):

| id | name | cost | needs | effect |
|---|---|---|---|---|
| banner | Rally Banner | 1 | — | Warband +8 |
| drill | Drillmaster | 1 | — | Troop HP +15% |
| steel | Sharpened Steel | 1 | — | Troop damage +15% |
| muster | Muster | 2 | banner | Warband +12, reinforcements stream 30% faster |
| presence | Warlord's Presence | 2 | — | Troops within 300 px of you +20% damage; general loyalty gains ×1.5 |
| host | Grand Host | 3 | muster | Warband +16, troop HP +15% |

  Warband cap = 12 + talents (max +36) + L3 castles (max +12) = **60**.

- **Masteries — the late-game AP sink.** The problem: `apPerLevel(level) = level`, so level 100 gives 100 AP, but every fixed talent across all four branches costs 42 (Blade 11, Arcana 11, Survival 10, Command 10). Without a fix, 58 AP sit unspent from level 42 on. Fix: two ranked talents per branch, 1 AP per rank, 10 ranks each = 80 ranks. With 58 AP left over, a level-100 knight fills about 70% of them, so the endgame is still about choices.

| branch | id | name | per rank | max |
|---|---|---|---|---|
| Blade | `m_honed` | Honed Blade | +3% physical damage | 10 |
| Blade | `m_precision` | Precision | +1.5% crit chance | 10 |
| Arcana | `m_well` | Deep Well | +5% max MP | 10 |
| Arcana | `m_weave` | Spellweave | +3% spell power | 10 |
| Survival | `m_tough` | Toughness | +3% max HP | 10 |
| Survival | `m_fortune` | Fortune | +4% material and gold drops | 10 |
| Command | `m_veterans` | Veterans | +3% troop HP and damage | 10 |
| Command | `m_quarter` | Quartermaster | −3% gold cost on troops and node upgrades | 10 |

  Rules:
  - A branch's masteries unlock once you own **3 fixed talents in that branch**, so they're late-game and don't crowd out the moveset talents early.
  - Masteries stack additively with the fixed talents they resemble (Honed Blade + Keen Edge = +42% at max).
  - None of them touch the 0.55 armour DR cap or the warband cap of 60. Those stay fixed.
  - Precision needs a small engine change: AF's `physDamage` rolls crits from the global `TUNING.critChance` and has no per-player input. **Append** a `critBonus = 0` parameter (never insert, see trap list) and pass the player's rank × 0.015 from the player's attack path only.
  - Code: `TalentDef` gets an optional `maxRank` (fixed talents = 1). `TalentSet` becomes `Record<string, number>` (rank). `apSpent = Σ cost × rank`. `canLearn` checks `rank < maxRank`. `loadSave` converts any old `true` to rank 1.
  - UI: the Talents tab gets 4 branch columns (AF lays out 3: `colW = (VIEW_W - 52 - 20) / 3`). Masteries go at the bottom of each column with a `3/10` rank pip bar. The branch's masteries show as locked with "Own 3 <branch> talents" until unlocked. Touch: tap to select, tap again to buy a rank, as AF does.
- Gear, forges, recipes as AF, plus the gold fee.
- Generals level separately (9.2).

---

## 13. Story, modes, saves, UI, music

**Story (light framing).** Text cards + short portrait lines, no cutscene engine:
1. Intro: the Dominion took the Verdant Reach; you're the last knight of the Aerial Order, holding the Last Camp.
2. Each continent arrival: one card naming the warlord and the signature unit.
3. Each capital falls: warlord's defeat line, Port opens.
4. Recruit / ≤25 loyalty / defect / rescue: one line each per general (generated from templates).
5. Vael defeated → ending card → victory screen.

**Difficulty** (choose at New Game, changeable in Options): Easy (enemy dmg ×0.7, war clock ×1.4, enemy income ×0.8), Normal, Hard (×1.3, ×0.75, ×1.25).

**New Game+:** after victory. Keeps level, talents, gear, materials. Resets generals, nodes, gold. Dominion stats ×1.5 per NG+ cycle, war clock ×0.8. NG+ count shown on the title and save slot.

**Victory screen:** total time, skirmishes won/lost, nodes captured, territories per continent, generals recruited / defected / rescued, gold earned, troops lost, highest combo, difficulty, NG+ cycle.

**Saves:** 3 slots (`aerial-conquest-slot1..3`). Title → slot picker showing continent, level, play time, territories held. Autosave after every skirmish and every 60 s on the overworld. Save contains: player (as AF), world (as AF, per continent), war state (node owner/level/garrison/stock, armies, convoys, treasury, war clock, captives), generals (stats, loyalty, assignment), difficulty, NG+, stats. Validate on load like AF's `worldFromSave` (drop anything that no longer exists).

**UI additions:**
- Overworld HUD: treasury, warband count/cap, active offensives counter, next-muster timer.
- Pause menu tabs: Gear · Synthesis · Talents · Status · **War Map** · **Generals**. The War Map replaces AF's Map tab: the whole continent with node icons by owner/level, armies, convoys, fights in progress, captives; tap/click a node for upgrade / recruit mix / send army / fast travel (outposts and castles).
- Skirmish HUD: objective text + progress bar, both sides' live/reserve counts, command wheel state, ally general portraits with HP.
- All touch targets laid out in shared geometry constants like AF's `MENU_TAB`/`MENU_LIST`, so renderer and hit-testing never disagree.

**Music:** keep AF's score and levels. New **war layer**: snare-roll march + low brass (saw/square through a lowpass), added on bar lines. Intensity mapping: overworld in own land 0–1; enemy land 1–2; skirmish 2; 60+ live units or siege inner gate 3; lord / warlord / Vael 4. Keep AF rev 3's mix rule — the lead stays on top.

**Hosting:** add an Aerial Conquest card/link to the repo root `index.html` landing page in the last phase.

---

## 14. Phases

Each phase: build, run headless checks, update README, deliver to both folders. Touch must work in every phase.

| # | phase | done when |
|---|---|---|
| 0 | **Fork & strip** (section 3) | Builds as `aerial-conquest.html`, title says AERIAL CONQUEST, AF open world still plays, no Colosseum / trial code reachable, new save keys |
| 1 | **Teams** — `team` on `Enemy`, hostile-target selection, allied Enemy entities | An allied Shade fights hostile Shades; hostile AI targets allies as well as the knight |
| 2 | **Mass units** — `army.ts`, roster, spatial hash, rendering, knight ↔ minion damage, hitstop cap | 200 live units at 60 fps desktop, 120 at 60 fps on emulated iPhone 13; Whirl through 20 minions doesn't hitch |
| 3 | **Warband + command wheel + streaming** | Warband follows on the overworld; all 4 commands work by key, pad and touch radial; reserves stream when live count drops |
| 4 | **Skirmish framework** + Field battle + Village raid | Both types winnable/losable; retreat on death; results screen; exit edge hands back |
| 5 | **Remaining skirmish types** (outpost, keep, castle siege, convoy, defense, rescue) | Each type's win and lose conditions verified; siege throne-first vs lord-first branches both work; times land in target bands with default troops |
| 6 | **Continents & map gen** — `campaign.ts`, `buildOverworld(continent)`, node placement, road paths, ports, sailing, roamers in enemy land only | 4 continents generate deterministically; every node reachable by road; sail round-trip keeps state |
| 7 | **War state & economy** — ownership, gold, convoys, production, upgrades, War Map tab | Capture a village → convoy delivers gold → castle produces troops → upgrade works; garrison thinning math verified |
| 8 | **Armies, off-screen sim, join, intercept** | Send an army, it walks the road, sim resolves; joining mid-fight carries current counts and structure HP; touching an enemy army starts a field battle |
| 9 | **Enemy AI** | Telegraph fires 30 s before departure; concurrent cap and grace period respected; offensives stop after capital falls |
| 10 | **Generals & loyalty** — recruit/release, cap, assign, levels, capture, rescue, loyalty, defection | Every loyalty table row verified; defection flips castle + garrison; re-recruit starts at 30 |
| 11 | **Progression & bosses** — Command branch, masteries (ranked talents), tier mapping, unit scaling, dungeons re-homed, lords, warlords, signature units, Vael, Ascendants, forge gold | Warband cap hits exactly 60 with all sources; level 100 = 100 AP, all fixed talents = 42, 58 left for masteries; masteries locked until 3 branch talents owned; ranks survive a save reload; each continent's signature unit appears only there |
| 12 | **Story, difficulty, NG+, victory, 3 slots** | Full campaign start → Vael → victory screen → NG+ in a scripted fast run; slots isolated; save round-trips through reload |
| 13 | **Music war layer, touch polish, phone caps** | Intensity ladder visits 0–4 at the right moments; full skirmish playable on emulated phone |
| 14 | **Balance + index.html card** | Recommended-level skirmishes hit their time bands; continent 1 completable in ~2–3 h on Normal; landing page links the game |

---

## 15. Verification checklist (headless Chromium, same standard as AF)

- Combos, air combos, Whirl, dash, spells, guard all unchanged from AF.
- 200/120 unit perf targets; no frame over 25 ms during a Whirl through a crowd.
- Garrison thinning: castle garrison with 0 / 1 / 2 / 3 / 4 small nodes taken = 100 / 85 / 70 / 55 / 40%, keep removes its +50%.
- Off-screen sim: equal strength → defender (fortified) wins; 2:1 attacker wins.
- War clock interval, telegraph lead, grace and concurrency on all three difficulties.
- Loyalty: each table row, the ≤25 warning, defection in all three states (garrisoned, leading, captive).
- Save/load for each slot, including mid-war state with armies on the road.
- Touch: command radial, War Map node taps, slot picker, skirmish HUD, portrait rotate prompt.

---

## 16. Traps carried over from Aerial Finisher

- `setPointerCapture` throws for stale pointers — wrap it in try/catch.
- Append new parameters to existing function signatures (e.g. `Sfx.tone`), never insert in the middle.
- Combo chaining needs `queuedAttack`, not just the input buffer.
- Check music intensity thresholds against real fight sizes — skirmishes are much bigger than AF waves.
- Measure canvas text with `measureText`; never guess offsets (the "AERIAEINISHER" bug).
- Early-return the HUD under full-screen overlays (alpha bleed).
- Top-level consts depend on tsconfig order; functions are hoisted.
- Google Fonts errors in a sandbox are not real.
- localStorage is per-origin: the GitHub Pages build and a local file have separate saves.

## 17. Open items (defaults apply if Michael doesn't say otherwise)

- All names (Dominion, Vael, warlords, continents) are placeholders.
- Real art direction for minions (simple team-coloured figures by default).
