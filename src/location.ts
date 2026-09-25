/* =========================================================================
 * location.ts — every place in the world and every boss in it. Pure data:
 * the rules that read it live in world.ts, travel.ts and superboss.ts.
 *
 * The world is a hub and twelve areas across tiers 1-10. Each area has
 * 2-3 bosses; one opens the next area, one opens a new Wave Trial tier,
 * and every one drops that region's boss-only material.
 * ========================================================================= */

/** Tier -> the level band enemies there are drawn from. */
const TIER_LEVELS: [number, number][] = [
  [1, 1],
  [1, 8], [8, 16], [16, 25], [25, 34], [34, 44],
  [44, 54], [54, 64], [64, 75], [75, 87], [87, 100],
];

const SUPER = { statMultiplier: 1.5, dropMultiplier: 2 };

function mkBoss(
  id: string, name: string, title: string, pattern: BossPattern, moves: BossMove[],
  hp: number, attack: number, defense: number,
  mats: MatId[], color: string, accent: string,
  unlock: { area?: string; tier?: number } = {},
): BossDefinition {
  return {
    id, name, title, tier: 0, pattern, moves,
    stats: { hp, attack, defense },
    unlocksArea: unlock.area, unlocksWaveTier: unlock.tier,
    uniqueMaterials: mats, superboss: { ...SUPER }, color, accent,
  };
}

type LocSeed = Omit<WorldLocation, 'connectedLocations' | 'roadTime' | 'hubDistance' | 'enemyLevelRange'>;

const LOCATION_SEEDS: LocSeed[] = [
  {
    id: 'hub', name: 'Haven Crossroads', theme: 'Haven', tier: 0,
    description: 'The last lit square before the dark. Safe ground, a forge, and roads everywhere.',
    enemyTypes: ['shade'], spawnRate: 0, bosses: [],
    hasCraftingStation: true, stationName: 'Haven Forge',
    map: { x: 0.08, y: 0.52 },
    look: { sky: '#12151f', floor: '#171a26', floorAlt: '#1c2031', grid: '#242a3d', motif: '#4a5aa0', wall: '#39406090', accent: '#8fb4ff' },
  },
  {
    id: 'forest-1', name: 'Whispering Wood', theme: 'Forest', tier: 1,
    description: 'Old trees that lean in to listen. Shades and Wisps nest in the canopy.',
    enemyTypes: ['shade', 'flyer'], spawnRate: 10,
    bosses: [
      mkBoss('f1-hulk', 'Mossback Hulk', 'the wood that walks', 'brute', ['slam'], 800, 12, 8, ['heartwood'], '#3a5a3a', '#b6f06a', { area: 'forest-2' }),
      mkBoss('f1-stag', 'Gloomstag', 'antlers like a thornbush', 'stalker', ['rush'], 650, 13, 6, ['heartwood'], '#2a3a2e', '#7fe0a0', { tier: 2 }),
    ],
    hasCraftingStation: false, map: { x: 0.24, y: 0.26 },
    look: { sky: '#0e1612', floor: '#121c16', floorAlt: '#16221a', grid: '#223428', motif: '#4a9a60', wall: '#3a6a4a99', accent: '#7fe0a0' },
  },
  {
    id: 'coast-1', name: 'Saltglass Shore', theme: 'Coast', tier: 1,
    description: 'A beach of green glass. Chanters sing to the tide; the tide sings back.',
    enemyTypes: ['shade', 'caster'], spawnRate: 10,
    bosses: [
      mkBoss('c1-tide', 'Tidecaller', 'she speaks and the sea obeys', 'sorcerer', ['fan'], 700, 12, 6, ['tidepearl'], '#1e3e5a', '#7fd8ff', { area: 'ruins-1' }),
      mkBoss('c1-brine', 'Brinewing', 'a gull the size of a boat', 'skylord', ['dive'], 650, 13, 6, ['tidepearl'], '#2e4a5e', '#e0f4ff'),
    ],
    hasCraftingStation: false, map: { x: 0.24, y: 0.8 },
    look: { sky: '#0e151c', floor: '#121c26', floorAlt: '#16222e', grid: '#223446', motif: '#4a8ab0', wall: '#3a6a8a99', accent: '#7fd8ff' },
  },
  {
    id: 'forest-2', name: 'Thornheart Deep', theme: 'Forest', tier: 2,
    description: 'The forest\'s heart, grown shut. A druid loom still weaves here.',
    enemyTypes: ['shade', 'flyer', 'bruiser'], spawnRate: 12,
    bosses: [
      mkBoss('f2-root', 'Rootwarden', 'older than the paths', 'brute', ['slam'], 850, 13, 9, ['heartwood'], '#2e4a26', '#c8f07a', { area: 'desert-1' }),
      mkBoss('f2-witch', 'Nightbloom Witch', 'every petal a curse', 'sorcerer', ['fan'], 720, 13, 7, ['heartwood'], '#3a2a4a', '#f07ad8', { tier: 3 }),
      mkBoss('f2-queen', 'Thornqueen', 'crowned in briars', 'stalker', ['rush'], 760, 14, 7, ['heartwood'], '#2a3a1e', '#ff8a8a'),
    ],
    hasCraftingStation: true, stationName: 'Druid Loom', map: { x: 0.4, y: 0.16 },
    look: { sky: '#0b120e', floor: '#0f1812', floorAlt: '#131e16', grid: '#1e3024', motif: '#6ab04a', wall: '#3a6a3a99', accent: '#b6f06a' },
  },
  {
    id: 'ruins-1', name: 'Sunken Bastion', theme: 'Ruins', tier: 2,
    description: 'A drowned fortress full of Bulwarks. Its old smithy still has a fire.',
    enemyTypes: ['bruiser', 'shade', 'caster'], spawnRate: 12,
    bosses: [
      mkBoss('r1-sentinel', 'Iron Sentinel', 'it never stopped guarding', 'brute', ['slam'], 900, 13, 11, ['relic'], '#4a4450', '#ff8b6b', { area: 'ruins-2' }),
      mkBoss('r1-bell', 'Bellringer', 'tolls for the drowned', 'sorcerer', ['fan'], 700, 13, 7, ['relic'], '#4a3a2e', '#ffd27a'),
    ],
    hasCraftingStation: true, stationName: 'Bastion Smithy', map: { x: 0.4, y: 0.68 },
    look: { sky: '#141312', floor: '#1b1816', floorAlt: '#221e1b', grid: '#332c27', motif: '#a05a4a', wall: '#6a4a3a99', accent: '#ff8b6b' },
  },
  {
    id: 'desert-1', name: 'Glass Dunes', theme: 'Desert', tier: 3,
    description: 'Sand fused to glass by something that fell here long ago.',
    enemyTypes: ['shade', 'flyer', 'caster'], spawnRate: 14,
    bosses: [
      mkBoss('d1-tyrant', 'Sand Tyrant', 'the dunes move when it breathes', 'brute', ['slam', 'rush'], 900, 14, 9, ['sunglass'], '#6a5230', '#ffd27a', { area: 'volcano-1' }),
      mkBoss('d1-mirage', 'Mirage Stalker', 'there are two of it, or none', 'stalker', ['rush'], 760, 15, 7, ['sunglass'], '#5a4a3a', '#fff0b0', { tier: 4 }),
      mkBoss('d1-wyrm', 'Dune Wyrm', 'swims through sand like water', 'skylord', ['dive'], 820, 14, 8, ['sunglass'], '#7a5a2a', '#ffb35c'),
    ],
    hasCraftingStation: false, map: { x: 0.54, y: 0.42 },
    look: { sky: '#1c170e', floor: '#241d12', floorAlt: '#2c2416', grid: '#3d3220', motif: '#d0a050', wall: '#8a6a3a99', accent: '#ffd27a' },
  },
  {
    id: 'ruins-2', name: "Chanter's Spire", theme: 'Ruins', tier: 4,
    description: 'A tower of verses. The Chanters\' scriptorium doubles as a forge.',
    enemyTypes: ['caster', 'flyer', 'bruiser'], spawnRate: 14,
    bosses: [
      mkBoss('r2-arch', 'Archchanter', 'the loudest voice in the choir', 'sorcerer', ['fan'], 820, 15, 8, ['relic'], '#2f3a6b', '#8fd0ff', { area: 'tundra-1' }),
      mkBoss('r2-gargoyle', 'Gargoyle Lord', 'wakes when the bells stop', 'skylord', ['dive', 'slam'], 880, 15, 11, ['relic'], '#4a4a5a', '#c6b4ff', { tier: 5 }),
    ],
    hasCraftingStation: true, stationName: 'Scriptorium Forge', map: { x: 0.6, y: 0.82 },
    look: { sky: '#0f1224', floor: '#141833', floorAlt: '#191e3d', grid: '#262d57', motif: '#6f7dff', wall: '#5a64b099', accent: '#8fd0ff' },
  },
  {
    id: 'volcano-1', name: 'Ember Wastes', theme: 'Volcano', tier: 5,
    description: 'Scorched ground and drifting sparks. A slag-forge smokes on the ridge.',
    enemyTypes: ['shade', 'flyer', 'bruiser'], spawnRate: 16,
    bosses: [
      mkBoss('v1-colossus', 'Cinder Colossus', 'a mountain with a temper', 'brute', ['slam'], 980, 15, 11, ['magma'], '#4a2418', '#ff7a3d', { area: 'volcano-2' }),
      mkBoss('v1-ash', 'Ashwing', 'its shadow scorches', 'skylord', ['dive'], 840, 16, 8, ['magma'], '#3a2a2a', '#ffb35c', { tier: 6 }),
      mkBoss('v1-hound', 'Magma Hound', 'the leash melted long ago', 'stalker', ['rush'], 820, 16, 8, ['magma'], '#5a2010', '#ffd24a'),
    ],
    hasCraftingStation: true, stationName: 'Slag Forge', map: { x: 0.7, y: 0.2 },
    look: { sky: '#1a0f0b', floor: '#21130d', floorAlt: '#2a1810', grid: '#3d2417', motif: '#ff7a3d', wall: '#8a4a2a99', accent: '#ffb35c' },
  },
  {
    id: 'tundra-1', name: 'Frostveil Pass', theme: 'Tundra', tier: 6,
    description: 'A white pass where sound freezes in the air.',
    enemyTypes: ['caster', 'bruiser', 'flyer'], spawnRate: 16,
    bosses: [
      mkBoss('t1-colossus', 'Frost Colossus', 'a glacier that learned to hate', 'brute', ['slam', 'rush'], 1000, 16, 12, ['rime'], '#3a4a5e', '#d8f0ff', { area: 'sky-1' }),
      mkBoss('t1-sorc', 'Rime Sorceress', 'her breath is a blizzard', 'sorcerer', ['fan'], 860, 16, 9, ['rime'], '#2a3a5a', '#a0d8ff', { tier: 7 }),
    ],
    hasCraftingStation: false, map: { x: 0.76, y: 0.64 },
    look: { sky: '#10161c', floor: '#16202a', floorAlt: '#1c2834', grid: '#2c3c4c', motif: '#a0d8ff', wall: '#6a8aa099', accent: '#d8f0ff' },
  },
  {
    id: 'volcano-2', name: 'Caldera Throne', theme: 'Volcano', tier: 7,
    description: 'The crater\'s rim, where fire kings hold court. Their anvil is still hot.',
    enemyTypes: ['bruiser', 'flyer', 'caster', 'shade'], spawnRate: 18,
    bosses: [
      mkBoss('v2-king', 'Caldera King', 'sits on the lava, not beside it', 'brute', ['slam', 'fan'], 1050, 16, 12, ['magma'], '#5a1a10', '#ff4a2a', { area: 'sky-2' }),
      mkBoss('v2-oracle', 'Pyre Oracle', 'sees your end in the smoke', 'sorcerer', ['fan', 'dive'], 880, 17, 9, ['magma'], '#4a1e2a', '#ff9a5c', { tier: 8 }),
      mkBoss('v2-reaver', 'Obsidian Reaver', 'sharp enough to cut light', 'stalker', ['rush', 'slam'], 920, 17, 10, ['magma'], '#1e1418', '#ff6a8a'),
    ],
    hasCraftingStation: true, stationName: 'Throne Anvil', map: { x: 0.82, y: 0.08 },
    look: { sky: '#1c0a08', floor: '#240d0a', floorAlt: '#2e100c', grid: '#461a12', motif: '#ff4a2a', wall: '#9a2a1a99', accent: '#ff7a5c' },
  },
  {
    id: 'sky-1', name: 'Stormspire Heights', theme: 'Sky', tier: 8,
    description: 'Islands of rock held up by the storm. Lightning is the weather.',
    enemyTypes: ['flyer', 'caster', 'shade'], spawnRate: 18,
    bosses: [
      mkBoss('s1-roc', 'Storm Roc', 'every wingbeat a thunderclap', 'skylord', ['dive', 'fan'], 960, 17, 10, ['storm'], '#3a4a6a', '#fff08a', { area: 'sky-2' }),
      mkBoss('s1-herald', 'Thunder Herald', 'announces the lightning', 'sorcerer', ['fan'], 900, 17, 10, ['storm'], '#2a3050', '#ffe14d', { tier: 9 }),
    ],
    hasCraftingStation: false, map: { x: 0.86, y: 0.56 },
    look: { sky: '#101828', floor: '#16223a', floorAlt: '#1c2a46', grid: '#2c3e64', motif: '#ffe14d', wall: '#6a7ab099', accent: '#fff08a' },
  },
  {
    id: 'sky-2', name: 'Celestial Aerie', theme: 'Sky', tier: 9,
    description: 'Above the storm. Quiet, bright, and guarded by things with too many wings.',
    enemyTypes: ['flyer', 'bruiser', 'caster', 'shade'], spawnRate: 20,
    bosses: [
      mkBoss('s2-seraph', 'Seraph of Gales', 'the wind has a face', 'skylord', ['dive', 'fan'], 1000, 18, 11, ['storm'], '#5a5a8a', '#f0e8ff', { area: 'rift-1' }),
      mkBoss('s2-warden', 'Aerie Warden', 'the gate between sky and void', 'brute', ['slam', 'rush'], 1100, 18, 13, ['storm'], '#4a4a6a', '#ffe8a0', { tier: 10 }),
      mkBoss('s2-zephyr', 'Zephyr Blade', 'you hear it after it hits', 'stalker', ['rush', 'dive'], 940, 19, 10, ['storm'], '#3a3a5e', '#a0f0ff'),
    ],
    hasCraftingStation: false, map: { x: 0.93, y: 0.3 },
    look: { sky: '#1a1a30', floor: '#22223e', floorAlt: '#2a2a4c', grid: '#3c3c6a', motif: '#f0e8ff', wall: '#9a9ad099', accent: '#f0e8ff' },
  },
  {
    id: 'rift-1', name: 'Void Rift', theme: 'Rift', tier: 10,
    description: 'The end of the map. A forge burns here with no fuel at all.',
    enemyTypes: ['shade', 'caster', 'flyer', 'bruiser'], spawnRate: 22,
    bosses: [
      mkBoss('x1-herald', 'Void Herald', 'speaks in the silence between stars', 'sorcerer', ['fan', 'dive'], 1000, 19, 11, ['voidcrown'], '#2a1040', '#ff5fd2'),
      mkBoss('x1-knight', 'Abyssal Knight', 'sworn to a crown of nothing', 'stalker', ['rush', 'slam'], 1050, 20, 12, ['voidcrown'], '#1a0e2a', '#c070ff'),
      mkBoss('x1-king', 'The Hollow King', 'the crown remembers a head', 'brute', ['slam', 'fan', 'rush'], 1300, 20, 14, ['voidcrown'], '#12081e', '#e79bff'),
    ],
    hasCraftingStation: true, stationName: 'Voidfire Forge', map: { x: 0.95, y: 0.86 },
    look: { sky: '#0c0712', floor: '#120a1a', floorAlt: '#170d22', grid: '#2a1740', motif: '#ff5fd2', wall: '#8a3a9a99', accent: '#e79bff' },
  },
];

/** Roads as [a, b, seconds]. Kept symmetric; the hub road is separate. */
const ROADS: [string, string, number][] = [
  ['hub', 'forest-1', 16], ['hub', 'coast-1', 16], ['forest-1', 'coast-1', 18],
  ['forest-1', 'forest-2', 20], ['coast-1', 'ruins-1', 20], ['forest-2', 'ruins-1', 20],
  ['forest-2', 'desert-1', 22], ['ruins-1', 'ruins-2', 22], ['desert-1', 'ruins-2', 22],
  ['desert-1', 'volcano-1', 24], ['ruins-2', 'tundra-1', 24], ['volcano-1', 'volcano-2', 26],
  ['tundra-1', 'sky-1', 26], ['volcano-2', 'sky-2', 28], ['sky-1', 'sky-2', 26],
  ['sky-2', 'rift-1', 30],
];

function buildWorld(): Record<string, WorldLocation> {
  const out: Record<string, WorldLocation> = {};
  for (const s of LOCATION_SEEDS) {
    out[s.id] = {
      ...s,
      enemyLevelRange: TIER_LEVELS[s.tier],
      connectedLocations: [],
      roadTime: {},
      hubDistance: s.tier === 0 ? 0 : 12 + s.tier * 5,
    };
    for (const b of s.bosses) b.tier = s.tier;
  }
  for (const [a, b, t] of ROADS) {
    out[a].connectedLocations.push(b); out[a].roadTime[b] = t;
    out[b].connectedLocations.push(a); out[b].roadTime[a] = t;
  }
  return out;
}

const LOCATION_MAP: Record<string, WorldLocation> = buildWorld();
const LOCATION_LIST: WorldLocation[] = LOCATION_SEEDS.map((s) => LOCATION_MAP[s.id]);
const ALL_BOSSES: BossDefinition[] = LOCATION_LIST.flatMap((l) => l.bosses);
const BOSS_MAP: Record<string, BossDefinition> = {};
const BOSS_HOME: Record<string, string> = {};
for (const l of LOCATION_LIST) for (const b of l.bosses) { BOSS_MAP[b.id] = b; BOSS_HOME[b.id] = l.id; }

/** Recommended level for an area: the bottom of its enemy level band. */
function recommendedLevel(l: WorldLocation): number { return l.enemyLevelRange[0]; }

/** An enemy level drawn from the location's band. */
function rollEnemyLevel(l: WorldLocation): number {
  return rndInt(l.enemyLevelRange[0], l.enemyLevelRange[1]);
}
