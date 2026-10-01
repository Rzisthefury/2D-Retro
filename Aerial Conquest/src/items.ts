/* =========================================================================
 * items.ts — materials, equipment tiers, forge recipes (PLAN 12.3).
 * Weapons raise power and reach; armour cuts damage taken. Six tiers of
 * each, forged at a castle you hold for gold plus battle spoils.
 * ========================================================================= */

// PLAN 12.3: one continent's worth - four commons from battle spoils, three
// rares paid by castle Lords (by territory tier) and the warlord (the top one).
type MatId = 'shard' | 'plate' | 'sigil' | 'iron' | 'ember' | 'crystal' | 'core';

interface MatDef { id: MatId; name: string; color: string; rank: number; }

const MATS: Record<MatId, MatDef> = {
  shard:   { id: 'shard',   name: 'Shadow Shard',    color: '#8f7dff', rank: 1 },
  plate:   { id: 'plate',   name: 'Bulwark Plate',   color: '#ff8b8b', rank: 1 },
  sigil:   { id: 'sigil',   name: 'Chant Sigil',     color: '#8fd0ff', rank: 1 },
  iron:    { id: 'iron',    name: 'Dark Iron',       color: '#c9d2e8', rank: 1 },
  ember:   { id: 'ember',   name: 'Wisp Ember',      color: '#e79bff', rank: 2 },
  crystal: { id: 'crystal', name: 'Radiant Crystal', color: '#ffe27a', rank: 3 },
  core:    { id: 'core',    name: 'Void Core',       color: '#ff5fd2', rank: 4 },
};

const MAT_ORDER: MatId[] = ['shard', 'plate', 'sigil', 'iron', 'ember', 'crystal', 'core'];

/** Won battles pay these (1-3 x tier). */
const COMMON_MATS: MatId[] = ['shard', 'plate', 'sigil', 'iron'];
/** Only Lords and the warlord pay these. */
const RARE_MATS: MatId[] = ['ember', 'crystal', 'core'];

type MatCost = Partial<Record<MatId, number>>;

// No level or gear requirements: gold and materials are the whole price (PLAN 12.3).
interface Recipe { gold: number; needs: MatCost; }

/* -------------------------------------------------------------- weapons */

interface BladeLook {
  color: string;
  edge: string;
  glow: number;    // 0-1, how much the blade emits
  length: number;  // drawn length multiplier
  width: number;
  teeth: boolean;  // key-style tooth at the tip
  flame: boolean;  // trails embers on the swing
}

interface WeaponDef {
  id: string;
  name: string;
  tier: number;
  powerMult: number;
  rangeBonus: number;   // px added to every attack's reach
  critBonus: number;
  magBonus: number;
  poiseMult: number;
  blade: BladeLook;
  recipe?: Recipe;
  desc: string;
}

const WEAPONS: WeaponDef[] = [
  {
    id: 'w1', name: 'Worn Edge', tier: 1,
    powerMult: 1.00, rangeBonus: 0, critBonus: 0, magBonus: 0, poiseMult: 1,
    blade: { color: '#b9c4dc', edge: '#e8f1ff', glow: 0, length: 1.0, width: 6, teeth: true, flame: false },
    desc: 'The blade you started with. It still cuts.',
  },
  {
    id: 'w2', name: 'Iron Fang', tier: 2,
    powerMult: 1.18, rangeBonus: 4, critBonus: 0.02, magBonus: 0, poiseMult: 1.1,
    blade: { color: '#9fb0cc', edge: '#f2f7ff', glow: 0.1, length: 1.06, width: 7, teeth: true, flame: false },
    recipe: { gold: 150, needs: { shard: 4, iron: 3 } },
    desc: 'Heavier steel. A little more reach, a little more bite.',
  },
  {
    id: 'w3', name: 'Shadowsteel', tier: 3,
    powerMult: 1.38, rangeBonus: 8, critBonus: 0.04, magBonus: 1, poiseMult: 1.2,
    blade: { color: '#6c5fa8', edge: '#c6b4ff', glow: 0.35, length: 1.12, width: 7, teeth: true, flame: false },
    recipe: { gold: 400, needs: { shard: 8, sigil: 6, iron: 6, ember: 1 } },
    desc: 'Quenched in shade. Staggers heavier things than it should.',
  },
  {
    id: 'w4', name: 'Emberfang', tier: 4,
    powerMult: 1.62, rangeBonus: 12, critBonus: 0.07, magBonus: 2, poiseMult: 1.35,
    blade: { color: '#a34a2a', edge: '#ffb066', glow: 0.6, length: 1.18, width: 8, teeth: true, flame: true },
    recipe: { gold: 900, needs: { sigil: 10, iron: 10, ember: 3, crystal: 1 } },
    desc: 'Burns on the swing. Crits far more often.',
  },
  {
    id: 'w5', name: 'Stormcaller', tier: 5,
    powerMult: 1.90, rangeBonus: 16, critBonus: 0.09, magBonus: 5, poiseMult: 1.5,
    blade: { color: '#3e6fa8', edge: '#8fe4ff', glow: 0.8, length: 1.24, width: 9, teeth: true, flame: true },
    recipe: { gold: 1800, needs: { shard: 16, iron: 16, crystal: 3 } },
    desc: 'Long reach and real magic behind it.',
  },
  {
    id: 'w6', name: 'Oblivion Fang', tier: 6,
    powerMult: 2.25, rangeBonus: 21, critBonus: 0.12, magBonus: 8, poiseMult: 1.75,
    blade: { color: '#5a1f4e', edge: '#ff7ae0', glow: 1, length: 1.32, width: 10, teeth: true, flame: true },
    recipe: { gold: 3500, needs: { iron: 24, sigil: 20, crystal: 3, core: 1 } },
    desc: 'Nothing guards against it for long.',
  },
];

/* --------------------------------------------------------------- armour */

interface ArmorLook {
  plate: string;
  trim: string;
  cape: string;
  shoulder: number;  // pauldron half-width in px
  spikes: number;    // spikes per pauldron
  capeLen: number;
  crest: number;     // helm crest height
}

interface ArmorDef {
  id: string;
  name: string;
  tier: number;
  dr: number;         // flat fraction of incoming damage removed
  hpBonus: number;
  mresBonus: number;
  look: ArmorLook;
  recipe?: Recipe;
  desc: string;
}

const ARMORS: ArmorDef[] = [
  {
    id: 'a1', name: 'Traveler Guard', tier: 1,
    dr: 0, hpBonus: 0, mresBonus: 0,
    look: { plate: '#3d4870', trim: '#9db2e0', cape: '#a02434', shoulder: 9, spikes: 0, capeLen: 22, crest: 0 },
    desc: 'Boiled leather and a dented breastplate.',
  },
  {
    id: 'a2', name: 'Iron Cuirass', tier: 2,
    dr: 0.06, hpBonus: 16, mresBonus: 1,
    look: { plate: '#42507e', trim: '#b3c4ec', cape: '#ad2a3c', shoulder: 12, spikes: 0, capeLen: 27, crest: 2 },
    recipe: { gold: 150, needs: { plate: 4, shard: 3 } },
    desc: 'Proper plate. Takes the edge off everything.',
  },
  {
    id: 'a3', name: 'Shadowmail', tier: 3,
    dr: 0.12, hpBonus: 38, mresBonus: 3,
    look: { plate: '#332b57', trim: '#c4adff', cape: '#8a2359', shoulder: 15, spikes: 2, capeLen: 33, crest: 5 },
    recipe: { gold: 400, needs: { plate: 8, shard: 6, iron: 6, ember: 1 } },
    desc: 'Shoulders start getting in the way of doorframes.',
  },
  {
    id: 'a4', name: 'Emberplate', tier: 4,
    dr: 0.18, hpBonus: 66, mresBonus: 5,
    look: { plate: '#331d22', trim: '#ffab5e', cape: '#9c2418', shoulder: 17, spikes: 3, capeLen: 38, crest: 7 },
    recipe: { gold: 900, needs: { plate: 10, iron: 10, ember: 3, crystal: 1 } },
    desc: 'Forge-blackened, gold-veined, faintly warm.',
  },
  {
    id: 'a5', name: 'Stormward', tier: 5,
    dr: 0.24, hpBonus: 100, mresBonus: 9,
    look: { plate: '#1d2c44', trim: '#8fe4ff', cape: '#123a5c', shoulder: 20, spikes: 4, capeLen: 44, crest: 10 },
    recipe: { gold: 1800, needs: { plate: 16, sigil: 16, crystal: 3 } },
    desc: 'Turns magic aside as easily as steel.',
  },
  {
    id: 'a6', name: 'Oblivion Aegis', tier: 6,
    dr: 0.30, hpBonus: 145, mresBonus: 14,
    look: { plate: '#1a1024', trim: '#ff7ae0', cape: '#3d0b2e', shoulder: 24, spikes: 5, capeLen: 52, crest: 14 },
    recipe: { gold: 3500, needs: { plate: 24, iron: 20, crystal: 3, core: 1 } },
    desc: 'Nothing about the silhouette is subtle.',
  },
];

function weaponById(id: string): WeaponDef { return WEAPONS.find((w) => w.id === id) || WEAPONS[0]; }
function armorById(id: string): ArmorDef { return ARMORS.find((a) => a.id === id) || ARMORS[0]; }

/* ------------------------------------------------------------ inventory */

type Inventory = Record<string, number>;

function have(inv: Inventory, id: MatId): number { return inv[id] || 0; }

function canAfford(inv: Inventory, needs: MatCost): boolean {
  for (const k of Object.keys(needs) as MatId[]) {
    if (have(inv, k) < (needs[k] || 0)) return false;
  }
  return true;
}

function spend(inv: Inventory, needs: MatCost) {
  for (const k of Object.keys(needs) as MatId[]) {
    inv[k] = Math.max(0, have(inv, k) - (needs[k] || 0));
  }
}
