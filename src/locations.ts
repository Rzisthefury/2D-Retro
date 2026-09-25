/* =========================================================================
 * locations.ts — the places you fight. Each location is pure data: a look,
 * an enemy mix, a difficulty depth and a material bias. Clearing enough
 * waves in one location opens the next, and you travel from the MAP tab.
 * ========================================================================= */

type DecoKind = 'plaza' | 'bastion' | 'spire' | 'wastes' | 'rift';

interface LocationLook {
  sky: string;       // backdrop gradient, top
  floor: string;     // backdrop gradient, bottom
  floorAlt: string;  // the arena plate
  grid: string;
  motif: string;     // centre rings
  wall: string;      // arena border
  accent: string;    // name plate, map highlight, decoration
  deco: DecoKind;
}

interface LocationDef {
  id: string;
  name: string;
  sub: string;
  desc: string;
  // Waves of difficulty added on top of the local wave number. Enemy stats,
  // EXP, the enemy roster and Void Core odds all read the *effective* wave,
  // so a deep location is harder and pays better from its very first wave.
  depth: number;
  weights: Record<string, number>;          // enemy id -> pick weight, 0 = never
  matBias: Partial<Record<MatId, number>>;  // drop chance multiplier per material
  unlock: { from: string; wave: number } | null;
  look: LocationLook;
}

const LOCATIONS: LocationDef[] = [
  {
    id: 'plaza', name: 'Twilight Plaza', sub: 'where every blade starts',
    desc: 'A quiet square at the edge of the dark. Balanced foes, no surprises.',
    depth: 0,
    weights: { shade: 1, caster: 1, flyer: 1, bruiser: 1 },
    matBias: {},
    unlock: null,
    look: {
      sky: '#12151f', floor: '#171a26', floorAlt: '#1c2031', grid: '#242a3d',
      motif: '#4a5aa0', wall: '#39406090', accent: '#8fb4ff', deco: 'plaza',
    },
  },
  {
    id: 'bastion', name: 'Sunken Bastion', sub: 'the walls still hold',
    desc: 'A drowned fortress full of Bulwarks. Break guards, harvest plate and iron.',
    depth: 4,
    weights: { shade: 1, caster: 0.6, flyer: 0.5, bruiser: 2.4 },
    matBias: { plate: 1.8, iron: 1.5 },
    unlock: { from: 'plaza', wave: 5 },
    look: {
      sky: '#141312', floor: '#1b1816', floorAlt: '#221e1b', grid: '#332c27',
      motif: '#a05a4a', wall: '#6a4a3a99', accent: '#ff8b6b', deco: 'bastion',
    },
  },
  {
    id: 'spire', name: "Chanter's Spire", sub: 'the air hums with verses',
    desc: 'Chanters and Wisps rain magic from range. Close the gap; sigils fall here.',
    depth: 6,
    weights: { shade: 0.8, caster: 2.2, flyer: 1.6, bruiser: 0.5 },
    matBias: { sigil: 1.8, ember: 1.4, crystal: 1.4 },
    unlock: { from: 'bastion', wave: 5 },
    look: {
      sky: '#0f1224', floor: '#141833', floorAlt: '#191e3d', grid: '#262d57',
      motif: '#6f7dff', wall: '#5a64b099', accent: '#8fd0ff', deco: 'spire',
    },
  },
  {
    id: 'wastes', name: 'Ember Wastes', sub: 'nothing grows, everything burns',
    desc: 'Swarms of Shades and Wisps across scorched ground. Embers and iron.',
    depth: 9,
    weights: { shade: 1.7, caster: 0.8, flyer: 1.8, bruiser: 1 },
    matBias: { ember: 1.8, iron: 1.4, crystal: 1.3 },
    unlock: { from: 'spire', wave: 5 },
    look: {
      sky: '#1a0f0b', floor: '#21130d', floorAlt: '#2a1810', grid: '#3d2417',
      motif: '#ff7a3d', wall: '#8a4a2a99', accent: '#ffb35c', deco: 'wastes',
    },
  },
  {
    id: 'rift', name: 'Void Rift', sub: 'the end of the map',
    desc: 'Everything at once, at full strength. The only place Void Cores fall early.',
    depth: 13,
    weights: { shade: 1, caster: 1.2, flyer: 1.2, bruiser: 1.4 },
    matBias: { core: 2, crystal: 1.5 },
    unlock: { from: 'wastes', wave: 10 },
    look: {
      sky: '#0c0712', floor: '#120a1a', floorAlt: '#170d22', grid: '#2a1740',
      motif: '#ff5fd2', wall: '#8a3a9a99', accent: '#e79bff', deco: 'rift',
    },
  },
];

function locationById(id: string): LocationDef {
  return LOCATIONS.find((l) => l.id === id) || LOCATIONS[0];
}

/** `cleared` maps location id -> highest wave cleared there. */
function locationUnlocked(loc: LocationDef, cleared: Record<string, number>): boolean {
  return !loc.unlock || (cleared[loc.unlock.from] || 0) >= loc.unlock.wave;
}

function unlockText(loc: LocationDef): string {
  if (!loc.unlock) return 'Open from the start';
  return `Clear wave ${loc.unlock.wave} in ${locationById(loc.unlock.from).name}`;
}
