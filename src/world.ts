/* =========================================================================
 * world.ts — the shape of the open world: what a location and a boss are,
 * the player's WorldState, the road graph, and every unlock rule.
 * The actual places and bosses are data in location.ts.
 * ========================================================================= */

type Theme = 'Haven' | 'Forest' | 'Coast' | 'Ruins' | 'Desert' | 'Volcano' | 'Tundra' | 'Sky' | 'Rift';

/** How a boss fights. Each pattern is a base AI plus one signature move. */
type BossPattern = 'brute' | 'sorcerer' | 'stalker' | 'skylord';
type BossMove = 'slam' | 'fan' | 'rush' | 'dive';

interface BossDefinition {
  id: string;
  name: string;
  title: string;                 // one line of flavour under the name
  tier: number;                  // filled in from the location
  stats: { hp: number; attack: number; defense: number };  // tier-1 base values
  unlocksArea?: string;
  unlocksWaveTier?: number;
  uniqueMaterials: MatId[];      // drops nothing else in the world gives
  superboss: { statMultiplier: number; dropMultiplier: number };
  pattern: BossPattern;
  moves: BossMove[];             // signature attacks layered on the base AI
  color: string;
  accent: string;
}

interface LocationLook {
  sky: string; floor: string; floorAlt: string; grid: string;
  motif: string; wall: string; accent: string;
}

interface WorldLocation {
  id: string;
  name: string;
  theme: Theme;
  tier: number;                  // 0 = the hub, 1-10 otherwise
  description: string;

  enemyTypes: string[];          // ids into ENEMIES
  enemyLevelRange: [number, number];
  spawnRate: number;             // ambient enemies per minute on roads into here

  bosses: BossDefinition[];

  connectedLocations: string[];  // road graph (kept symmetric by buildWorld)
  hubDistance: number;           // seconds of travel on the direct road home
  roadTime: Record<string, number>;  // seconds to each connected location

  hasCraftingStation: boolean;
  stationName?: string;

  map: { x: number; y: number }; // 0-1 position on the world map
  look: LocationLook;
}

interface WorldState {
  currentLocation: string;
  discoveredLocations: Set<string>;
  completedBosses: Map<string, boolean>;
  completedSuperbosses: Map<string, boolean>;
  unlockedAreas: Set<string>;
  unlockedWaveTiers: Set<number>;
  trialBest: Record<number, number>;   // best wave reached per wave tier
}

/** What goes into localStorage — Sets and Maps flattened to JSON. */
interface WorldSave {
  currentLocation: string;
  discoveredLocations: string[];
  completedBosses: Record<string, boolean>;
  completedSuperbosses: Record<string, boolean>;
  unlockedAreas: string[];
  unlockedWaveTiers: number[];
  trialBest: Record<string, number>;
}

const HUB_ID = 'hub';
const START_AREAS = ['hub', 'forest-1', 'coast-1'];

function freshWorld(): WorldState {
  return {
    currentLocation: HUB_ID,
    discoveredLocations: new Set([HUB_ID]),
    completedBosses: new Map(),
    completedSuperbosses: new Map(),
    unlockedAreas: new Set(START_AREAS),
    unlockedWaveTiers: new Set([1]),
    trialBest: {},
  };
}

function worldToSave(w: WorldState): WorldSave {
  const flat = (m: Map<string, boolean>) => {
    const o: Record<string, boolean> = {};
    m.forEach((v, k) => { if (v) o[k] = true; });
    return o;
  };
  const tb: Record<string, number> = {};
  for (const k of Object.keys(w.trialBest)) tb[k] = w.trialBest[+k];
  return {
    currentLocation: w.currentLocation,
    discoveredLocations: [...w.discoveredLocations],
    completedBosses: flat(w.completedBosses),
    completedSuperbosses: flat(w.completedSuperbosses),
    unlockedAreas: [...w.unlockedAreas],
    unlockedWaveTiers: [...w.unlockedWaveTiers].sort((a, b) => a - b),
    trialBest: tb,
  };
}

/** Rebuild a WorldState from a save, dropping anything that no longer exists. */
function worldFromSave(j: any): WorldState {
  const w = freshWorld();
  if (!j || typeof j !== 'object') return w;
  const isLoc = (id: any) => typeof id === 'string' && !!LOCATION_MAP[id];
  const isBoss = (id: any) => typeof id === 'string' && !!BOSS_MAP[id];
  if (Array.isArray(j.discoveredLocations)) for (const id of j.discoveredLocations) if (isLoc(id)) w.discoveredLocations.add(id);
  if (Array.isArray(j.unlockedAreas)) for (const id of j.unlockedAreas) if (isLoc(id)) w.unlockedAreas.add(id);
  if (Array.isArray(j.unlockedWaveTiers)) {
    for (const t of j.unlockedWaveTiers) if (t >= 1 && t <= 10) w.unlockedWaveTiers.add(t | 0);
  }
  if (j.completedBosses) for (const id of Object.keys(j.completedBosses)) if (isBoss(id) && j.completedBosses[id]) w.completedBosses.set(id, true);
  if (j.completedSuperbosses) for (const id of Object.keys(j.completedSuperbosses)) if (isBoss(id) && j.completedSuperbosses[id]) w.completedSuperbosses.set(id, true);
  if (j.trialBest) for (const k of Object.keys(j.trialBest)) if (+k >= 1 && +k <= 10) w.trialBest[+k] = Math.max(1, j.trialBest[k] | 0);
  // Re-derive unlocks from defeated bosses, so a save can never hold a boss
  // kill without the door it opened.
  w.completedBosses.forEach((_, id) => applyBossUnlocks(w, BOSS_MAP[id]));
  if (isLoc(j.currentLocation) && w.unlockedAreas.has(j.currentLocation)) w.currentLocation = j.currentLocation;
  w.discoveredLocations.add(w.currentLocation);
  return w;
}

/* ------------------------------------------------------------- queries */

function locById(id: string): WorldLocation { return LOCATION_MAP[id] || LOCATION_MAP[HUB_ID]; }

function isAreaUnlocked(w: WorldState, id: string): boolean { return w.unlockedAreas.has(id); }

function bossDefeated(w: WorldState, id: string): boolean { return !!w.completedBosses.get(id); }
function superDefeated(w: WorldState, id: string): boolean { return !!w.completedSuperbosses.get(id); }

/** Seconds on the road from `a` to `b`, or 0 if there is no road. */
function roadTime(a: string, b: string): number {
  if (a === b) return 0;
  const la = locById(a);
  if (la.roadTime[b]) return la.roadTime[b];
  if (b === HUB_ID) return la.hubDistance;   // every place has a road home
  if (a === HUB_ID) return locById(b).hubDistance;
  return 0;
}

/** The boss whose defeat opens `areaId`, for "defeat X to unlock" messages. */
function unlockerOf(areaId: string): BossDefinition | null {
  for (const b of ALL_BOSSES) if (b.unlocksArea === areaId) return b;
  return null;
}

function waveTierUnlocker(tier: number): BossDefinition | null {
  for (const b of ALL_BOSSES) if (b.unlocksWaveTier === tier) return b;
  return null;
}

function lockedAreaText(areaId: string): string {
  const b = unlockerOf(areaId);
  return b ? `Defeat ${b.name} in ${locById(bossHome(b.id)).name} to unlock` : 'This area is locked';
}

function lockedTierText(tier: number): string {
  const b = waveTierUnlocker(tier);
  return b ? `Defeat ${b.name} to unlock Wave Tier ${tier}` : `Wave Tier ${tier} is locked`;
}

function bossHome(bossId: string): string { return BOSS_HOME[bossId] || HUB_ID; }

/** Mark a boss defeated. Returns the names of anything it opened. */
function defeatBoss(w: WorldState, b: BossDefinition): string[] {
  w.completedBosses.set(b.id, true);
  return applyBossUnlocks(w, b);
}

function applyBossUnlocks(w: WorldState, b: BossDefinition | undefined): string[] {
  const out: string[] = [];
  if (!b) return out;
  if (b.unlocksArea && !w.unlockedAreas.has(b.unlocksArea)) {
    w.unlockedAreas.add(b.unlocksArea);
    out.push(locById(b.unlocksArea).name);
  }
  if (b.unlocksWaveTier && !w.unlockedWaveTiers.has(b.unlocksWaveTier)) {
    w.unlockedWaveTiers.add(b.unlocksWaveTier);
    out.push(`Wave Tier ${b.unlocksWaveTier}`);
  }
  return out;
}

function maxWaveTier(w: WorldState): number {
  let m = 1;
  w.unlockedWaveTiers.forEach((t) => { if (t > m) m = t; });
  return m;
}

/** A nudge toward the next thing that opens the map up. */
function nextObjective(w: WorldState): string {
  // Cheapest open gate: the lowest-tier undefeated boss that unlocks an area
  // in a place you can already reach.
  let best: BossDefinition | null = null;
  for (const b of ALL_BOSSES) {
    if (bossDefeated(w, b.id) || !b.unlocksArea) continue;
    if (w.unlockedAreas.has(b.unlocksArea)) continue;
    if (!w.unlockedAreas.has(bossHome(b.id))) continue;
    if (!best || b.tier < best.tier) best = b;
  }
  if (best) return `Next: defeat ${best.name} in ${locById(bossHome(best.id)).name}`;
  const left = ALL_BOSSES.filter((b) => !bossDefeated(w, b.id));
  if (left.length) return `Next: ${left.length} boss${left.length > 1 ? 'es' : ''} still stand — try ${left[0].name}`;
  const sLeft = ALL_BOSSES.filter((b) => !superDefeated(w, b.id)).length;
  return sLeft ? `Every boss is down. ${sLeft} Ascendant superbosses remain.` : 'You have conquered everything. Well fought.';
}
