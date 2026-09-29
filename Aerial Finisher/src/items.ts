/* =========================================================================
 * items.ts — materials, equipment tiers, synthesis recipes, drop tables.
 * Weapons raise power and reach; armour cuts damage taken. Every tier is
 * gated on owning the previous one, so progression is a ladder, not a shop.
 * ========================================================================= */

type MatId = 'shard' | 'plate' | 'sigil' | 'ember' | 'iron' | 'crystal' | 'core'
  // boss-only materials, one per region, and the superboss-only Star Fragment
  | 'heartwood' | 'tidepearl' | 'relic' | 'sunglass' | 'magma' | 'rime' | 'storm' | 'voidcrown' | 'star';

interface MatDef { id: MatId; name: string; color: string; rank: number; }

const MATS: Record<MatId, MatDef> = {
  shard:   { id: 'shard',   name: 'Shadow Shard',   color: '#8f7dff', rank: 1 },
  plate:   { id: 'plate',   name: 'Bulwark Plate',  color: '#ff8b8b', rank: 2 },
  sigil:   { id: 'sigil',   name: 'Chant Sigil',    color: '#8fd0ff', rank: 2 },
  ember:   { id: 'ember',   name: 'Wisp Ember',     color: '#e79bff', rank: 2 },
  iron:    { id: 'iron',    name: 'Dark Iron',      color: '#c9d2e8', rank: 3 },
  crystal: { id: 'crystal', name: 'Radiant Crystal', color: '#ffe27a', rank: 4 },
  core:    { id: 'core',    name: 'Void Core',      color: '#ff5fd2', rank: 5 },
  heartwood: { id: 'heartwood', name: 'Heartwood',     color: '#7fe0a0', rank: 6 },
  tidepearl: { id: 'tidepearl', name: 'Tidepearl',     color: '#7fd8ff', rank: 6 },
  relic:     { id: 'relic',     name: 'Relic Gear',    color: '#d0b090', rank: 6 },
  sunglass:  { id: 'sunglass',  name: 'Sunglass',      color: '#ffd27a', rank: 7 },
  magma:     { id: 'magma',     name: 'Magma Heart',   color: '#ff6a3d', rank: 7 },
  rime:      { id: 'rime',      name: 'Rimeshard',     color: '#d8f0ff', rank: 8 },
  storm:     { id: 'storm',     name: 'Stormfeather',  color: '#fff08a', rank: 8 },
  voidcrown: { id: 'voidcrown', name: 'Crownshard',    color: '#c070ff', rank: 9 },
  star:      { id: 'star',      name: 'Star Fragment', color: '#ffffff', rank: 10 },
};

const MAT_ORDER: MatId[] = [
  'shard', 'plate', 'sigil', 'ember', 'iron', 'crystal', 'core',
  'heartwood', 'tidepearl', 'relic', 'sunglass', 'magma', 'rime', 'storm', 'voidcrown', 'star',
];

/** Boss materials never come from ordinary enemies. */
const BOSS_MATS: MatId[] = ['heartwood', 'tidepearl', 'relic', 'sunglass', 'magma', 'rime', 'storm', 'voidcrown', 'star'];

type MatCost = Partial<Record<MatId, number>>;

// No level or gear requirements: if you hold the materials, you can forge it.
interface Recipe { needs: MatCost; }

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
    recipe: { needs: { shard: 8, iron: 2 } },
    desc: 'Heavier steel. A little more reach, a little more bite.',
  },
  {
    id: 'w3', name: 'Shadowsteel', tier: 3,
    powerMult: 1.38, rangeBonus: 8, critBonus: 0.04, magBonus: 1, poiseMult: 1.2,
    blade: { color: '#6c5fa8', edge: '#c6b4ff', glow: 0.35, length: 1.12, width: 7, teeth: true, flame: false },
    recipe: { needs: { shard: 18, sigil: 8, iron: 6 } },
    desc: 'Quenched in shade. Staggers heavier things than it should.',
  },
  {
    id: 'w4', name: 'Emberfang', tier: 4,
    powerMult: 1.62, rangeBonus: 12, critBonus: 0.07, magBonus: 2, poiseMult: 1.35,
    blade: { color: '#a34a2a', edge: '#ffb066', glow: 0.6, length: 1.18, width: 8, teeth: true, flame: true },
    recipe: { needs: { ember: 16, plate: 10, iron: 12, crystal: 2 } },
    desc: 'Burns on the swing. Crits far more often.',
  },
  {
    id: 'w5', name: 'Stormcaller', tier: 5,
    powerMult: 1.90, rangeBonus: 16, critBonus: 0.09, magBonus: 5, poiseMult: 1.5,
    blade: { color: '#3e6fa8', edge: '#8fe4ff', glow: 0.8, length: 1.24, width: 9, teeth: true, flame: true },
    recipe: { needs: { sigil: 24, crystal: 8, iron: 20, core: 1 } },
    desc: 'Long reach and real magic behind it.',
  },
  {
    id: 'w6', name: 'Oblivion Fang', tier: 6,
    powerMult: 2.25, rangeBonus: 21, critBonus: 0.12, magBonus: 8, poiseMult: 1.75,
    blade: { color: '#5a1f4e', edge: '#ff7ae0', glow: 1, length: 1.32, width: 10, teeth: true, flame: true },
    recipe: { needs: { core: 5, crystal: 20, iron: 40, ember: 30 } },
    desc: 'Nothing guards against it for long.',
  },
  {
    id: 'w7', name: 'Tidebreaker', tier: 7,
    powerMult: 2.60, rangeBonus: 24, critBonus: 0.13, magBonus: 10, poiseMult: 1.9,
    blade: { color: '#2a6a8a', edge: '#7fd8ff', glow: 0.8, length: 1.36, width: 10, teeth: true, flame: false },
    recipe: { needs: { tidepearl: 8, heartwood: 8, iron: 40, core: 4 } },
    desc: 'Forest and sea, bound in one edge. Heavy as a wave.',
  },
  {
    id: 'w8', name: 'Magmaheart', tier: 8,
    powerMult: 3.00, rangeBonus: 27, critBonus: 0.15, magBonus: 12, poiseMult: 2.05,
    blade: { color: '#8a2a1a', edge: '#ff9a5c', glow: 1, length: 1.40, width: 11, teeth: true, flame: true },
    recipe: { needs: { magma: 10, sunglass: 10, relic: 8, core: 6 } },
    desc: 'Still molten at the core. It never quite cools.',
  },
  {
    id: 'w9', name: 'Rimestorm', tier: 9,
    powerMult: 3.45, rangeBonus: 30, critBonus: 0.17, magBonus: 15, poiseMult: 2.2,
    blade: { color: '#6a8ab0', edge: '#e8f8ff', glow: 1, length: 1.44, width: 11, teeth: true, flame: false },
    recipe: { needs: { rime: 12, storm: 12, crystal: 30, core: 8 } },
    desc: 'Frost on the blade, thunder in the swing.',
  },
  {
    id: 'w10', name: 'Hollow Crown', tier: 10,
    powerMult: 4.00, rangeBonus: 34, critBonus: 0.20, magBonus: 18, poiseMult: 2.5,
    blade: { color: '#3a1060', edge: '#d890ff', glow: 1, length: 1.50, width: 12, teeth: true, flame: true },
    recipe: { needs: { voidcrown: 14, storm: 10, magma: 10, core: 12 } },
    desc: 'Taken from the Rift itself. The end of the main road.',
  },
  {
    id: 'w11', name: 'Starforged', tier: 11,
    powerMult: 4.60, rangeBonus: 38, critBonus: 0.25, magBonus: 22, poiseMult: 2.8,
    blade: { color: '#c8c8f0', edge: '#ffffff', glow: 1, length: 1.55, width: 12, teeth: true, flame: true },
    recipe: { needs: { star: 12, voidcrown: 10, core: 15 } },
    desc: 'Only Ascendant bosses drop what this is made of.',
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
    recipe: { needs: { plate: 8, shard: 6 } },
    desc: 'Proper plate. Takes the edge off everything.',
  },
  {
    id: 'a3', name: 'Shadowmail', tier: 3,
    dr: 0.12, hpBonus: 38, mresBonus: 3,
    look: { plate: '#332b57', trim: '#c4adff', cape: '#8a2359', shoulder: 15, spikes: 2, capeLen: 33, crest: 5 },
    recipe: { needs: { plate: 16, shard: 20, iron: 8 } },
    desc: 'Shoulders start getting in the way of doorframes.',
  },
  {
    id: 'a4', name: 'Emberplate', tier: 4,
    dr: 0.18, hpBonus: 66, mresBonus: 5,
    look: { plate: '#331d22', trim: '#ffab5e', cape: '#9c2418', shoulder: 17, spikes: 3, capeLen: 38, crest: 7 },
    recipe: { needs: { ember: 18, plate: 22, iron: 14, crystal: 3 } },
    desc: 'Forge-blackened, gold-veined, faintly warm.',
  },
  {
    id: 'a5', name: 'Stormward', tier: 5,
    dr: 0.24, hpBonus: 100, mresBonus: 9,
    look: { plate: '#1d2c44', trim: '#8fe4ff', cape: '#123a5c', shoulder: 20, spikes: 4, capeLen: 44, crest: 10 },
    recipe: { needs: { sigil: 26, crystal: 10, iron: 24, core: 1 } },
    desc: 'Turns magic aside as easily as steel.',
  },
  {
    id: 'a6', name: 'Oblivion Aegis', tier: 6,
    dr: 0.30, hpBonus: 145, mresBonus: 14,
    look: { plate: '#1a1024', trim: '#ff7ae0', cape: '#3d0b2e', shoulder: 24, spikes: 5, capeLen: 52, crest: 14 },
    recipe: { needs: { core: 5, crystal: 24, plate: 40, iron: 44 } },
    desc: 'Nothing about the silhouette is subtle.',
  },
  {
    id: 'a7', name: 'Tidewall', tier: 7,
    dr: 0.33, hpBonus: 200, mresBonus: 18,
    look: { plate: '#1a3a4a', trim: '#7fd8ff', cape: '#0e3a52', shoulder: 25, spikes: 5, capeLen: 54, crest: 15 },
    recipe: { needs: { tidepearl: 8, heartwood: 8, plate: 50, core: 4 } },
    desc: 'Scaled like a sea wall, grown like bark.',
  },
  {
    id: 'a8', name: 'Magmaforged', tier: 8,
    dr: 0.36, hpBonus: 260, mresBonus: 22,
    look: { plate: '#3a1410', trim: '#ff8a4a', cape: '#6a1a0e', shoulder: 26, spikes: 6, capeLen: 56, crest: 17 },
    recipe: { needs: { magma: 10, sunglass: 10, relic: 8, core: 6 } },
    desc: 'Cooled obsidian over a glowing seam.',
  },
  {
    id: 'a9', name: 'Rimeguard', tier: 9,
    dr: 0.39, hpBonus: 330, mresBonus: 27,
    look: { plate: '#2a3a4e', trim: '#e8f8ff', cape: '#3a5a7a', shoulder: 27, spikes: 6, capeLen: 58, crest: 19 },
    recipe: { needs: { rime: 12, storm: 12, crystal: 30, core: 8 } },
    desc: 'Frost-hardened plate that sheds lightning.',
  },
  {
    id: 'a10', name: 'Hollow Regalia', tier: 10,
    dr: 0.42, hpBonus: 410, mresBonus: 32,
    look: { plate: '#1e0e30', trim: '#d890ff', cape: '#4a1060', shoulder: 28, spikes: 7, capeLen: 60, crest: 22 },
    recipe: { needs: { voidcrown: 14, rime: 10, sunglass: 10, core: 12 } },
    desc: 'A king\'s armour, from a king who is no longer there.',
  },
  {
    id: 'a11', name: 'Starwoven', tier: 11,
    dr: 0.46, hpBonus: 520, mresBonus: 40,
    look: { plate: '#d8d8ec', trim: '#ffffff', cape: '#8a8ad0', shoulder: 29, spikes: 7, capeLen: 62, crest: 24 },
    recipe: { needs: { star: 12, voidcrown: 10, core: 15 } },
    desc: 'Woven from Ascendant spoils. Faintly warm, faintly humming.',
  },
];

function weaponById(id: string): WeaponDef { return WEAPONS.find((w) => w.id === id) || WEAPONS[0]; }
function armorById(id: string): ArmorDef { return ARMORS.find((a) => a.id === id) || ARMORS[0]; }

/* ----------------------------------------------------------- drop table */

interface DropEntry { id: MatId; chance: number; min: number; max: number; }
interface DropTable { mats: DropEntry[]; potion: number; ether: number; }

const DROPS: Record<string, DropTable> = {
  shade: {
    mats: [
      { id: 'shard', chance: 0.62, min: 1, max: 2 },
      { id: 'iron', chance: 0.07, min: 1, max: 1 },
    ],
    potion: 0.10, ether: 0.07,
  },
  bruiser: {
    mats: [
      { id: 'plate', chance: 0.85, min: 1, max: 3 },
      { id: 'iron', chance: 0.22, min: 1, max: 2 },
      { id: 'crystal', chance: 0.06, min: 1, max: 1 },
    ],
    potion: 0.26, ether: 0.13,
  },
  caster: {
    mats: [
      { id: 'sigil', chance: 0.66, min: 1, max: 2 },
      { id: 'iron', chance: 0.12, min: 1, max: 1 },
      { id: 'crystal', chance: 0.05, min: 1, max: 1 },
    ],
    potion: 0.12, ether: 0.24,
  },
  flyer: {
    mats: [
      { id: 'ember', chance: 0.66, min: 1, max: 2 },
      { id: 'iron', chance: 0.12, min: 1, max: 1 },
      { id: 'crystal', chance: 0.06, min: 1, max: 1 },
    ],
    potion: 0.13, ether: 0.16,
  },
};

/** Void Cores only drop from tier 5 up — the late-tier gate is depth, not luck. */
function coreChance(tier: number): number {
  if (tier < 5) return 0;
  return Math.min(0.12, 0.02 + (tier - 5) * 0.018);
}

interface RolledDrop { kind: 'mat' | 'potion' | 'ether'; id: MatId | null; count: number; }

function rollDrops(enemyId: string, tier: number, luck: number): RolledDrop[] {
  const t = DROPS[enemyId] || DROPS.shade;
  const out: RolledDrop[] = [];
  const tierBonus = 1 + Math.min(0.6, tier * 0.06);
  for (const m of t.mats) {
    if (Math.random() < m.chance * luck * tierBonus) {
      out.push({ kind: 'mat', id: m.id, count: rndInt(m.min, m.max) });
    }
  }
  if (Math.random() < coreChance(tier) * luck) out.push({ kind: 'mat', id: 'core', count: 1 });
  if (Math.random() < t.potion) out.push({ kind: 'potion', id: null, count: 1 });
  if (Math.random() < t.ether) out.push({ kind: 'ether', id: null, count: 1 });
  return out;
}

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
