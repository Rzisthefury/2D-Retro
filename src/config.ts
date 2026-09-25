/* =========================================================================
 * config.ts — all data tables and every tunable constant.
 * Everything in TUNING is live-editable from the in-game debug panel (`).
 * Frame values are at a fixed 60Hz simulation tick.
 * ========================================================================= */

const TICK = 1 / 60;
const VIEW_W = 960;
const VIEW_H = 540;

/* ---------------------------------------------------------------- tuning */

interface Tunable {
  key: string;
  label: string;
  min: number;
  max: number;
  step: number;
  group: string;
}

const TUNING = {
  // player movement
  moveSpeed: 215,
  airControl: 0.62,
  gravity: 1250,
  jumpVel: 400,
  turnRate: 16,

  // combat feel
  hitstopScale: 1.0,
  shakeScale: 1.0,
  homingRange: 190,
  homingStrength: 1.0,
  lungeScale: 1.0,
  bufferFrames: 13,
  queueFrames: 34,
  iframesOnHit: 34,
  comboResetFrames: 34,

  // damage
  playerDamageMult: 1.0,
  enemyDamageMult: 1.0,
  critChance: 0.07,
  critMult: 1.6,
  variance: 0.08,

  // magic
  mpRechargeSeconds: 4.2,
  spellPowerMult: 1.0,

  // enemies
  enemyHpMult: 1.0,
  enemySpeedMult: 1.0,
  enemyAggression: 1.0,
  waveScaling: 0.05,

  // dash
  dashSpeed: 760,
  dashFrames: 13,
  dashIframes: 11,
  dashCooldown: 26,
  dashRecharge: 70,

  // progression
  expMult: 1.0,
  dropRate: 1.0,

  // audio
  musicVolume: 0.3,
  sfxVolume: 0.7,
  waveIntro: 1.6,
  travelSpawnMult: 1.0,
};

type TuningKey = keyof typeof TUNING;

const TUNABLES: Tunable[] = [
  { key: 'moveSpeed', label: 'Move speed', min: 60, max: 420, step: 5, group: 'Movement' },
  { key: 'airControl', label: 'Air control', min: 0, max: 1.5, step: 0.02, group: 'Movement' },
  { key: 'gravity', label: 'Gravity', min: 400, max: 2600, step: 25, group: 'Movement' },
  { key: 'jumpVel', label: 'Jump velocity', min: 150, max: 700, step: 10, group: 'Movement' },
  { key: 'turnRate', label: 'Turn rate', min: 2, max: 40, step: 0.5, group: 'Movement' },

  { key: 'hitstopScale', label: 'Hitstop', min: 0, max: 3, step: 0.05, group: 'Game feel' },
  { key: 'shakeScale', label: 'Screen shake', min: 0, max: 3, step: 0.05, group: 'Game feel' },
  { key: 'homingRange', label: 'Homing range', min: 0, max: 400, step: 5, group: 'Game feel' },
  { key: 'homingStrength', label: 'Homing strength', min: 0, max: 2, step: 0.05, group: 'Game feel' },
  { key: 'lungeScale', label: 'Attack lunge', min: 0, max: 3, step: 0.05, group: 'Game feel' },
  { key: 'bufferFrames', label: 'Input buffer (f)', min: 0, max: 30, step: 1, group: 'Game feel' },
  { key: 'queueFrames', label: 'Combo queue (f)', min: 0, max: 90, step: 1, group: 'Game feel' },
  { key: 'iframesOnHit', label: 'I-frames on hit', min: 0, max: 90, step: 1, group: 'Game feel' },
  { key: 'comboResetFrames', label: 'Combo drop (f)', min: 5, max: 120, step: 1, group: 'Game feel' },

  { key: 'playerDamageMult', label: 'Player damage', min: 0.1, max: 5, step: 0.05, group: 'Damage' },
  { key: 'enemyDamageMult', label: 'Enemy damage', min: 0, max: 4, step: 0.05, group: 'Damage' },
  { key: 'critChance', label: 'Crit chance', min: 0, max: 1, step: 0.01, group: 'Damage' },
  { key: 'critMult', label: 'Crit multiplier', min: 1, max: 4, step: 0.05, group: 'Damage' },
  { key: 'variance', label: 'Damage variance', min: 0, max: 0.5, step: 0.01, group: 'Damage' },

  { key: 'mpRechargeSeconds', label: 'MP recharge (s)', min: 0.5, max: 15, step: 0.1, group: 'Magic' },
  { key: 'spellPowerMult', label: 'Spell power', min: 0.1, max: 4, step: 0.05, group: 'Magic' },

  { key: 'enemyHpMult', label: 'Enemy HP', min: 0.1, max: 5, step: 0.05, group: 'Enemies' },
  { key: 'enemySpeedMult', label: 'Enemy speed', min: 0.1, max: 3, step: 0.05, group: 'Enemies' },
  { key: 'enemyAggression', label: 'Aggression', min: 0, max: 3, step: 0.05, group: 'Enemies' },
  { key: 'waveScaling', label: 'Wave scaling', min: 0, max: 0.6, step: 0.01, group: 'Enemies' },

  { key: 'dashSpeed', label: 'Dash speed', min: 200, max: 1600, step: 20, group: 'Dash' },
  { key: 'dashFrames', label: 'Dash length (f)', min: 4, max: 40, step: 1, group: 'Dash' },
  { key: 'dashIframes', label: 'Dash i-frames', min: 0, max: 40, step: 1, group: 'Dash' },
  { key: 'dashCooldown', label: 'Dash cooldown (f)', min: 0, max: 120, step: 1, group: 'Dash' },
  { key: 'dashRecharge', label: 'Charge refill (f)', min: 10, max: 300, step: 5, group: 'Dash' },

  { key: 'expMult', label: 'EXP rate', min: 0.1, max: 10, step: 0.1, group: 'Progression' },
  { key: 'dropRate', label: 'Drop rate', min: 0.1, max: 8, step: 0.1, group: 'Progression' },

  { key: 'waveIntro', label: 'Wave grace (s)', min: 0, max: 6, step: 0.1, group: 'Progression' },
  { key: 'travelSpawnMult', label: 'Road spawn rate', min: 0, max: 4, step: 0.1, group: 'Progression' },

  { key: 'musicVolume', label: 'Music volume', min: 0, max: 1, step: 0.02, group: 'Audio' },
  { key: 'sfxVolume', label: 'SFX volume', min: 0, max: 1, step: 0.02, group: 'Audio' },
];

/* --------------------------------------------------------------- attacks */

interface AttackDef {
  id: string;
  label: string;
  startup: number;   // frames before the hitbox exists
  active: number;    // frames the hitbox is live
  recovery: number;  // frames of lag afterwards
  cancel: number;    // frame into recovery where the next combo hit may fire
  power: number;     // fed into the physical damage formula
  range: number;     // reach measured from body centre
  arc: number;       // half-angle of the swing, radians
  hitstun: number;   // frames of stun applied to whatever it hits
  knockback: number; // px/s pushed along the swing direction
  launch: number;    // vertical velocity applied (negative = spike)
  poise: number;     // stagger damage
  hitstop: number;   // frames the whole sim freezes on connect
  shake: number;
  lunge: number;     // px/s the attacker slides forward during startup
  air: boolean;
  finisher: boolean;
  radial: boolean;   // ignores facing — sweeps everything in a circle
  ticks: number;     // how many separate hits a radial attack lands
  pull: number;      // px/s a radial attack drags enemies inward
  spinRate: number;  // radians per frame the character rotates
}

function atk(o: Partial<AttackDef> & { id: string; label: string }): AttackDef {
  return {
    startup: 6, active: 4, recovery: 14, cancel: 7,
    power: 12, range: 52, arc: 1.05, hitstun: 16, knockback: 90,
    launch: 0, poise: 10, hitstop: 5, shake: 3, lunge: 0,
    air: false, finisher: false,
    radial: false, ticks: 1, pull: 0, spinRate: 0,
    ...o,
  };
}

// Ground combo: three swings into a finisher. Cancel windows shrink so the
// finisher commits you — that is the KH2 rhythm, not a mash string.
const GROUND_COMBO: AttackDef[] = [
  atk({ id: 'g1', label: 'Slash', startup: 5, active: 4, recovery: 13, cancel: 6, power: 13, lunge: 210, hitstun: 14, knockback: 70, poise: 9 }),
  atk({ id: 'g2', label: 'Backslash', startup: 6, active: 4, recovery: 14, cancel: 7, power: 15, lunge: 190, arc: 1.2, hitstun: 15, knockback: 80, poise: 10 }),
  atk({ id: 'g3', label: 'Rising', startup: 7, active: 5, recovery: 15, cancel: 9, power: 17, lunge: 160, arc: 1.15, hitstun: 18, knockback: 60, launch: 190, poise: 14, hitstop: 6, shake: 4 }),
  atk({ id: 'gf', label: 'Finish', startup: 11, active: 6, recovery: 27, cancel: 99, power: 36, range: 66, arc: 1.5, hitstun: 30, knockback: 340, launch: 90, poise: 45, hitstop: 11, shake: 11, lunge: 130, finisher: true }),
];

// Talent-gated combo extensions, slotted in before the finisher.
const COMBO_EXTRA: AttackDef[] = [
  atk({ id: 'g4', label: 'Cross', startup: 6, active: 5, recovery: 15, cancel: 8, power: 19, lunge: 170, arc: 1.25, hitstun: 18, knockback: 85, poise: 16, hitstop: 6, shake: 4 }),
  atk({ id: 'g5', label: 'Reversal', startup: 7, active: 5, recovery: 16, cancel: 9, power: 22, lunge: 150, arc: 1.35, hitstun: 20, knockback: 95, launch: 60, poise: 22, hitstop: 7, shake: 5 }),
];

const AIR_EXTRA: AttackDef = atk({
  id: 'a3', label: 'Aerial 3', startup: 6, active: 5, recovery: 13, cancel: 7,
  power: 19, lunge: 150, arc: 1.25, hitstun: 18, knockback: 75, launch: 70, air: true,
});

// The Whirl: Zelda's spin attack as a finisher. arc = PI means facing stops
// mattering, so the hitbox is a ring around the player.
const WHIRL: AttackDef = atk({
  id: 'whirl', label: 'Whirl', startup: 8, active: 30, recovery: 26, cancel: 99,
  power: 21, range: 94, arc: Math.PI, hitstun: 22, knockback: 250, launch: 40,
  poise: 26, hitstop: 4, shake: 5, lunge: 0,
  radial: true, ticks: 3, spinRate: 0.42, finisher: true,
});

const WHIRL_BIG: AttackDef = atk({
  id: 'whirl+', label: 'Tempest', startup: 8, active: 44, recovery: 24, cancel: 99,
  power: 23, range: 122, arc: Math.PI, hitstun: 24, knockback: 300, launch: 60,
  poise: 30, hitstop: 4, shake: 6, lunge: 0,
  radial: true, ticks: 5, pull: 210, spinRate: 0.46, finisher: true,
});

// Air combo. Shorter, faster, ends in a spike that slams the target down.
const AIR_COMBO: AttackDef[] = [
  atk({ id: 'a1', label: 'Aerial', startup: 5, active: 4, recovery: 12, cancel: 6, power: 14, lunge: 170, hitstun: 16, knockback: 60, launch: 60, air: true }),
  atk({ id: 'a2', label: 'Aerial 2', startup: 6, active: 5, recovery: 13, cancel: 7, power: 16, lunge: 150, arc: 1.2, hitstun: 17, knockback: 70, launch: 70, air: true }),
  atk({ id: 'af', label: 'Aerial Finish', startup: 9, active: 6, recovery: 22, cancel: 99, power: 34, range: 64, arc: 1.4, hitstun: 34, knockback: 150, launch: -520, poise: 42, hitstop: 10, shake: 10, air: true, finisher: true }),
];

/* ---------------------------------------------------------------- spells */

type SpellKind = 'projectile' | 'pierce' | 'strike' | 'heal';

interface SpellDef {
  id: string;
  name: string;
  cost: number;
  drainAll?: boolean;
  power: number;
  kind: SpellKind;
  color: string;
  cast: number;      // startup frames, locked in place
  recovery: number;
  desc: string;
}

const SPELLS: SpellDef[] = [
  { id: 'fire', name: 'Fire', cost: 14, power: 30, kind: 'projectile', color: '#ff7a3d', cast: 12, recovery: 16, desc: 'Homing fireball' },
  { id: 'blizzard', name: 'Blizzard', cost: 12, power: 24, kind: 'pierce', color: '#63d7ff', cast: 10, recovery: 14, desc: 'Piercing shard, slows' },
  { id: 'thunder', name: 'Thunder', cost: 26, power: 34, kind: 'strike', color: '#ffe14d', cast: 18, recovery: 22, desc: 'Bolts on nearby foes' },
  // Cure eats the entire gauge whatever is left in it, exactly like KH2 — which
  // is what makes the recharge lock a real decision instead of a formality.
  { id: 'cure', name: 'Cure', cost: 0, power: 52, kind: 'heal', color: '#7dffa8', cast: 16, recovery: 20, drainAll: true, desc: 'Heals, spends ALL MP' },
];

/* --------------------------------------------------------------- enemies */

type AIKind = 'grunt' | 'bruiser' | 'caster' | 'flyer';

interface EnemyDef {
  id: string;
  name: string;
  ai: AIKind;
  hp: number;
  str: number;
  def: number;
  mres: number;
  speed: number;
  radius: number;
  height: number;
  color: string;
  accent: string;
  exp: number;
  poise: number;        // stagger threshold
  power: number;        // attack power
  telegraph: number;    // frames of windup — the tell
  active: number;
  recovery: number;
  reach: number;
  cooldown: number;     // frames between attack attempts
  guard: boolean;       // blocks frontal attacks
  hover: number;        // resting z height
}

const ENEMIES: Record<string, EnemyDef> = {
  shade: {
    id: 'shade', name: 'Shade', ai: 'grunt',
    hp: 46, str: 7, def: 3, mres: 3, speed: 118, radius: 15, height: 30,
    color: '#2a2340', accent: '#ffd54a', exp: 14, poise: 26,
    power: 9, telegraph: 22, active: 5, recovery: 24, reach: 40, cooldown: 60,
    guard: false, hover: 0,
  },
  bruiser: {
    id: 'bruiser', name: 'Bulwark', ai: 'bruiser',
    hp: 190, str: 13, def: 11, mres: 6, speed: 62, radius: 26, height: 46,
    color: '#4a3552', accent: '#ff6b6b', exp: 52, poise: 105,
    power: 20, telegraph: 38, active: 7, recovery: 42, reach: 62, cooldown: 96,
    guard: true, hover: 0,
  },
  caster: {
    id: 'caster', name: 'Chanter', ai: 'caster',
    hp: 62, str: 9, def: 4, mres: 12, speed: 88, radius: 16, height: 38,
    color: '#2f4a6b', accent: '#8fd0ff', exp: 30, poise: 30,
    power: 15, telegraph: 34, active: 4, recovery: 30, reach: 320, cooldown: 110,
    guard: false, hover: 0,
  },
  flyer: {
    id: 'flyer', name: 'Wisp', ai: 'flyer',
    hp: 54, str: 10, def: 5, mres: 9, speed: 132, radius: 15, height: 26,
    color: '#5b3a6e', accent: '#e79bff', exp: 34, poise: 22,
    power: 13, telegraph: 26, active: 5, recovery: 26, reach: 46, cooldown: 78,
    guard: false, hover: 74,
  },
};

/* ----------------------------------------------------------- progression */

interface Stats {
  maxHp: number;
  maxMp: number;
  str: number;
  def: number;
  mag: number;
  mres: number;
}

function statsForLevel(level: number): Stats {
  const l = level - 1;
  return {
    maxHp: Math.round(100 + l * 13),
    maxMp: Math.round(40 + l * 4),
    str: 6 + l * 1.25,
    def: 4 + l * 0.95,
    mag: 6 + l * 1.15,
    mres: 4 + l * 0.85,
  };
}

function expToNext(level: number): number {
  return Math.floor(14 * Math.pow(level, 1.72) + 10 * level);
}

const MAX_LEVEL = 100;

/* ------------------------------------------------------ tier scaling */

// Every location has a tier (1-10). Its enemies' stats are multiplied by
// these, then nudged by their individual level. Superbosses multiply on top.
const TIER_SCALING = {
  hpMultiplier: (tier: number) => 1 + (tier - 1) * 0.8,
  attackMultiplier: (tier: number) => 1 + (tier - 1) * 0.9,
  defenseMultiplier: (tier: number) => 1 + (tier - 1) * 0.7,
  xpMultiplier: (tier: number) => 1 + (tier - 1) * 1.2,
};

// Within a tier, an enemy's level adds a little more on top. Attack grows
// slowly because it counts twice in the damage formula (as a power ratio and
// as the strength term).
const LEVEL_SCALING = {
  hp: (level: number) => 1 + (level - 1) * 0.03,
  attack: (level: number) => 1 + (level - 1) * 0.005,
  xp: (level: number) => 1 + (level - 1) * 0.06,
};

/* --------------------------------------------------- touch control layout */

// Positions are in the canvas's logical 960x540 space, so they scale with the
// canvas and land in the same place whatever the phone's resolution is.
interface TouchBtn { id: string; x: number; y: number; r: number; label: string; color: string; }

const TOUCH_STICK = { x: 118, y: 424, r: 64, knob: 30, dead: 0.17 };

const TOUCH_BTNS: TouchBtn[] = [
  { id: 'attack', x: 866, y: 448, r: 42, label: 'ATK', color: '#ff9d5c' },
  { id: 'jump',   x: 768, y: 430, r: 33, label: 'JMP', color: '#7fb4ff' },
  { id: 'dash',   x: 878, y: 356, r: 33, label: 'DSH', color: '#69e29a' },
  { id: 'magic',  x: 776, y: 340, r: 31, label: 'MAG', color: '#c39bff' },
];

const TOUCH_CHIPS = { x: 920, y: 186, dy: 38, r: 16 };

// Menu geometry lives here because the renderer draws from it and the input
// layer hit-tests against it — one source of truth or taps land in the wrong row.
const MENU_TAB = { x: 26, y: 18, w: 116, h: 28, gap: 8 };
const MENU_TABS = 5;  // gear · synth · talents · status · map
const SYNTH_ROW_H = 20;  // the recipe list is long now, so its rows are tighter
const MAP_BOX = { x: 26, y: 62, w: 590, h: 432 };      // world map area in the MAP tab
const PLACE_PANEL = { x: 18, y: 104, w: 300, rowH: 26 }; // the location action list
const BACK_BTN = { x: 405, y: 70, w: 150, h: 26 };      // turn back / retreat
const MENU_LIST = { x: 26, y: 62, w: 330, rowH: 26, pad: 10 };
const TITLE_ROW = { x: 336, y0: 258, w: 288, h: 40, gap: 6 };
const TOUCH_MENU = { x: 916, y: 118, r: 22 };

/* --------------------------------------------------------------- palette */

const PAL = {
  floor: '#171a26',
  floorAlt: '#1c2031',
  grid: '#242a3d',
  wall: '#0e111a',
  player: '#3f78ff',
  playerLight: '#8fb4ff',
  blade: '#e8f1ff',
  text: '#e8ecf7',
  dim: '#8e97b3',
  hp: '#4fe08a',
  hpLow: '#ff5f56',
  mp: '#4fb8ff',
  mpCharge: '#ffd54a',
  exp: '#c39bff',
  danger: '#ff5f56',
};
