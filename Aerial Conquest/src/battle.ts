/* =========================================================================
 * battle.ts — battlefields, structures and objectives (PLAN 10).
 *
 * A Battle is one fight on its own scrolling field: its layout (seeded, so
 * the same node always looks the same), the structures on it, both sides'
 * armies, and the objective that decides it. Phase 4 builds two types:
 * Field battle (rout or destroy the army) and Village raid (burn every
 * house). The test field from Phase 0 is kept as kind 'test'.
 * ========================================================================= */

type BattleKind = 'test' | 'field' | 'village';
type Scenery = 'forest' | 'coast' | 'ruins';
type BattleResult = 'win' | 'lose' | 'retreat';

/** What a battle is: everything needed to lay it out and populate it. */
interface BattleSpec {
  kind: BattleKind;
  name: string;              // the node's name, for banners and results
  tier: number;
  scenery: Scenery;
  seed: number;
  foes: Partial<Record<UnitType, number>>;   // Dominion minions (past the live cap: reserve)
  foeElites: string[];                        // ENEMIES ids
  commander: string | null;                   // ENEMIES id of the Dominion leader (field battle), or none
  allies: Partial<Record<UnitType, number>>;  // allied minions besides the warband (a sent army joining)
  houses?: number;                            // village raid
}

/** Ground colours per territory scenery (PLAN 10.1: the look comes from the territory). */
const SCENERY: Record<Scenery, { grassA: string; grassB: string; tuftA: string; tuftB: string; dirt: string; forest: string; tree: string; treeHi: string }> = {
  forest: { grassA: '#3f6a3a', grassB: '#43703d', tuftA: '#5c8f4c', tuftB: '#335a30', dirt: 'rgba(122,96,60,0.55)', forest: '#16241a', tree: '#254a2a', treeHi: '#2f5d33' },
  coast:  { grassA: '#5a7a4a', grassB: '#5f8050', tuftA: '#88a868', tuftB: '#47653b', dirt: 'rgba(196,176,128,0.55)', forest: '#1c3038', tree: '#3a5e48', treeHi: '#4a7458' },
  ruins:  { grassA: '#4f5f3e', grassB: '#556644', tuftA: '#748856', tuftB: '#3e4c31', dirt: 'rgba(120,110,96,0.6)', forest: '#1d2219', tree: '#33452c', treeHi: '#41573a' },
};

type StructureKind = 'gate' | 'building' | 'throne' | 'wagon' | 'captureRing' | 'cell';

/**
 * Something on the field with HP (or progress) that is hit like a unit:
 * the knight does x1 to buildings and x0.3 to gates and thrones, Fire x2 to
 * buildings, rams x4 to gates (PLAN 10.1). Solid ones block movement.
 */
class Structure {
  x: number; y: number;          // centre of the footprint's base
  w: number; h: number;          // footprint (world px)
  hp: number; maxHp: number;
  flash = 0;
  burnT = 0;                     // seconds since destroyed (for the ruin's embers)
  readonly z = 0;
  constructor(readonly kind: StructureKind, readonly team: Team, x: number, y: number, w: number, h: number, hp: number, readonly label = '') {
    this.x = x; this.y = y; this.w = w; this.h = h;
    this.hp = this.maxHp = hp;
  }
  get alive() { return this.hp > 0; }
  /** Hit radius for swing arcs and shots. */
  get radius() { return Math.max(this.w, this.h) * 0.5; }
  get solid() { return this.alive && (this.kind === 'building' || this.kind === 'gate' || this.kind === 'wagon'); }

  /** Damage multiplier for a hit from `src` (PLAN 10.1). */
  mult(src: 'knight' | 'fire' | 'unit' | 'ram'): number {
    if (this.kind === 'building') return src === 'fire' ? 2 : src === 'ram' ? 1 : 1;
    if (this.kind === 'gate') return src === 'ram' ? 4 : 0.3;
    if (this.kind === 'throne') return src === 'ram' ? 0 : 0.3;
    return 1;
  }

  /** Apply damage. Returns true if this hit destroyed it. */
  damage(g: Game, amount: number): boolean {
    if (!this.alive || amount <= 0) return false;
    this.hp -= amount;
    this.flash = 0.12;
    if (this.hp > 0) return false;
    this.hp = 0;
    g.onStructureDestroyed(this);
    return true;
  }

  /** Push a circle out of the footprint (solid structures only). */
  pushOut(o: { x: number; y: number; radius: number }) {
    if (!this.solid) return;
    const x0 = this.x - this.w / 2, x1 = this.x + this.w / 2, y0 = this.y - this.h, y1 = this.y;
    const cx = clamp(o.x, x0, x1), cy = clamp(o.y, y0, y1);
    const dx = o.x - cx, dy = o.y - cy, d2 = dx * dx + dy * dy;
    if (d2 >= o.radius * o.radius) return;
    if (d2 > 0.0001) {
      const d = Math.sqrt(d2), k = (o.radius - d) / d;
      o.x += dx * k; o.y += dy * k;
    } else {
      // centre inside the footprint: out through the nearest side
      const l = o.x - x0, r = x1 - o.x, t = o.y - y0, b = y1 - o.y, m = Math.min(l, r, t, b);
      if (m === l) o.x = x0 - o.radius; else if (m === r) o.x = x1 + o.radius;
      else if (m === t) o.y = y0 - o.radius; else o.y = y1 + o.radius;
    }
  }

  /** Does the point lie on the footprint (for shots)? */
  contains(x: number, y: number, pad = 0): boolean {
    return x > this.x - this.w / 2 - pad && x < this.x + this.w / 2 + pad && y > this.y - this.h - pad && y < this.y + pad;
  }
}

/** Ground decoration (not solid): roads, crop plots, fences, a well. */
interface Decor { kind: 'road' | 'crops' | 'fence' | 'well' | 'rock' | 'bush'; x: number; y: number; w: number; h: number; a?: number; }

/** A small seeded RNG (mulberry32) so a node always lays out the same way. */
function seededRng(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

class Battle {
  readonly spec: BattleSpec;
  readonly w: number; readonly h: number;
  structures: Structure[] = [];
  decor: Decor[] = [];
  time = 0;
  result: BattleResult | null = null;
  resultT = 0;                       // seconds since the result was decided
  routed: Team | null = null;        // a side that broke and fled
  // tallies for the results screen
  kills = { byKnight: 0, byArmy: 0, elites: 0 };
  losses = { troops: 0, elites: 0 };
  startFoes = 0;                     // Dominion strength at the start (units + reserve + elites)
  startAllies = 0;
  spoils = { gold: 0, mats: {} as Inventory };
  leader: Enemy | null = null;       // the Dominion commander (field battle), or null

  constructor(spec: BattleSpec) {
    this.spec = spec;
    const size = BATTLE_SIZE[spec.kind];
    this.w = size.w; this.h = size.h;
    const rng = seededRng(spec.seed);
    if (spec.kind === 'village') this.layVillage(rng);
    else if (spec.kind === 'field') this.layField(rng);
  }

  get objective(): string {
    if (this.spec.kind === 'village') return 'Burn every house';
    if (this.spec.kind === 'field') return 'Rout or destroy the Dominion army';
    return 'Test field';
  }

  /** 0..1 progress toward the objective, for the HUD bar. */
  progress(g: Game): number {
    if (this.spec.kind === 'village') {
      const hs = this.structures.filter((s) => s.kind === 'building');
      return hs.length ? hs.filter((s) => !s.alive).length / hs.length : 0;
    }
    if (this.spec.kind === 'field') return this.startFoes ? clamp(1 - g.foeStrength() / this.startFoes, 0, 1) : 0;
    return 0;
  }

  /** Village raid: houses in the far half, a road through them, crops and fences. */
  private layVillage(rng: () => number) {
    const n = this.spec.houses ?? 4;
    const cy = this.h / 2;
    this.decor.push({ kind: 'road', x: 0, y: cy - 22, w: this.w, h: 44 });
    // houses on both sides of the road, in the right ~45% of the field
    const x0 = this.w * 0.52, x1 = this.w * 0.88;
    for (let k = 0; k < n; k++) {
      const x = x0 + (x1 - x0) * ((k + 0.5) / n) + (rng() - 0.5) * 60;
      const above = k % 2 === 0;
      const y = above ? cy - 70 - rng() * 120 : cy + 150 + rng() * 120;
      const hp = Math.round(WAR.houseHp * TIER_SCALING.hpMultiplier(this.spec.tier));
      this.structures.push(new Structure('building', 'enemy', x, y, 112, 78, hp, `House ${k + 1}`));
    }
    this.decor.push({ kind: 'well', x: (x0 + x1) / 2 + 40, y: cy - 34, w: 30, h: 30 });
    for (let k = 0; k < 4; k++) {
      const x = x0 - 120 + rng() * (x1 - x0 + 160), y = k % 2 ? cy - 330 - rng() * 120 : cy + 330 + rng() * 80;
      this.decor.push({ kind: 'crops', x, y, w: 150 + rng() * 60, h: 90 + rng() * 40 });
    }
    for (let k = 0; k < 6; k++) {
      this.decor.push({ kind: 'fence', x: x0 - 60 + rng() * (x1 - x0 + 80), y: cy + (k % 2 ? 1 : -1) * (40 + rng() * 260), w: 90 + rng() * 60, h: 6 });
    }
    this.scatter(rng, 14);
  }

  /** Field battle: open ground, a few rocks and bushes. */
  private layField(rng: () => number) { this.scatter(rng, 22); }

  private scatter(rng: () => number, n: number) {
    for (let k = 0; k < n; k++) {
      const x = 120 + rng() * (this.w - 240), y = 80 + rng() * (this.h - 160);
      if (Math.abs(y - this.h / 2) < 60 && this.spec.kind === 'village') continue;   // keep the road clear
      if (this.structures.some((s) => Math.abs(s.x - x) < s.w && Math.abs(s.y - s.h / 2 - y) < s.h)) continue;
      this.decor.push({ kind: rng() < 0.5 ? 'rock' : 'bush', x, y, w: 16 + rng() * 18, h: 10 + rng() * 10 });
    }
  }

  /** The nearest live structure hostile to `side`, or null. */
  nearestStructure(side: Team, x: number, y: number): Structure | null {
    let best: Structure | null = null, bd = Infinity;
    for (const s of this.structures) {
      if (!s.alive || s.team === side || s.kind === 'captureRing') continue;
      const d = (s.x - x) ** 2 + (s.y - s.h / 2 - y) ** 2;
      if (d < bd) { bd = d; best = s; }
    }
    return best;
  }

  /** Push a circle out of every solid structure. */
  collide(o: { x: number; y: number; radius: number }) {
    for (const s of this.structures) if (s.solid) s.pushOut(o);
  }
}

/** Field sizes per battle kind (PLAN 10.2). */
const BATTLE_SIZE: Record<BattleKind, { w: number; h: number }> = {
  test: { w: 1920, h: 1200 },
  field: { w: 2800, h: 1400 },
  village: { w: 2400, h: 1400 },
};

/* ------------------------------------------------- battles on the stub map */

// Until the campaign map exists (Phase 6), the stub offers these. Tier 1.
function testSpec(): BattleSpec {
  return { kind: 'test', name: 'Test field', tier: WAR.testFieldTier, scenery: 'forest', seed: 1, foes: {}, foeElites: [], commander: null, allies: {} };
}

/** A village raid: a garrison among four houses. */
function villageSpec(): BattleSpec {
  return {
    kind: 'village', name: 'Millbrook', tier: 1, scenery: 'forest', seed: 1337 + 11, houses: 4,
    foes: { sword: 16, spear: 8, archer: 10, shield: 6 }, foeElites: ['shade', 'caster'], commander: null, allies: {},
  };
}

/** A field battle: a Dominion column with a commander, against your warband and a sent army joining. */
function fieldSpec(): BattleSpec {
  return {
    kind: 'field', name: 'Dominion column', tier: 1, scenery: 'coast', seed: 1337 + 23,
    foes: { sword: 28, spear: 14, archer: 18, shield: 10 }, foeElites: ['shade', 'flyer'], commander: 'bruiser',
    allies: { sword: 10, spear: 6, archer: 6, shield: 4 },
  };
}

/** Counts by type -> a shuffled list of unit types. */
function unitList(counts: Partial<Record<UnitType, number>>): UnitType[] {
  const out: UnitType[] = [];
  for (const k of UNIT_ORDER) for (let n = counts[k] || 0; n > 0; n--) out.push(k);
  for (let k = out.length - 1; k > 0; k--) { const r = Math.floor(Math.random() * (k + 1)); [out[k], out[r]] = [out[r], out[k]]; }
  return out;
}
