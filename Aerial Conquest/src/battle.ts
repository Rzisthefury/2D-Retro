/* =========================================================================
 * battle.ts — battlefields, structures and objectives (PLAN 10).
 *
 * A Battle is one fight on its own scrolling field: its layout (seeded, so
 * the same node always looks the same), the structures on it, both sides'
 * armies, and the objective that decides it. The eight PLAN 10.2 types:
 * village raid, outpost capture, keep assault, castle siege, convoy ambush,
 * field battle, defense and rescue raid. The Phase 0 test field is kind 'test'.
 * ========================================================================= */

type BattleKind = 'test' | 'field' | 'village' | 'outpost' | 'keep' | 'castle' | 'convoy' | 'defense' | 'rescue';
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
  reinforce?: Partial<Record<UnitType, number>>;   // Dominion units that come on later from their edge
  foeElites: string[];                        // ENEMIES ids
  commander: string | null;                   // ENEMIES id of a Dominion field commander, or none
  allies: Partial<Record<UnitType, number>>;  // allied minions besides the warband (a sent army joining)
  houses?: number;                            // village raid / defense
  ironGate?: boolean;                         // castle: the keep is still the Dominion's (gate HP x1.6)
  wagons?: number;                            // convoy ambush
  lordName?: string;                          // castle / rescue
  captainName?: string;                       // keep
  warlord?: boolean;                          // castle: the capital, held by Warlord Garrick Thorne (PLAN 11.3)
  generalName?: string;                       // rescue: who you came for
  gateMult?: number;                          // castle gate HP x (castle level, PLAN 5.2)
  nodeId?: number;                            // the map node this battle is for (none: the debug battle list)
  convoyId?: number;                          // convoy ambush: the map convoy this is
  cargo?: number;                             // convoy ambush: the gold aboard
  fightId?: number;                           // joining an off-screen fight (PLAN 7.3)
  armyId?: number;                            // intercepting a Dominion army
  structure?: number;                         // joined fights: the structures' remaining HP share
  lordId?: string;                            // castle: the Lord's roster id (recruitable if beaten first)
  generalId?: string;                         // your general fighting beside you (a joined army's, a defended castle's)
  rescueId?: string;                          // rescue raid: the general in the cell
}

/** Ground colours per territory scenery (PLAN 10.1: the look comes from the territory). */
const SCENERY: Record<Scenery, { grassA: string; grassB: string; tuftA: string; tuftB: string; dirt: string; forest: string; tree: string; treeHi: string }> = {
  forest: { grassA: '#3f6a3a', grassB: '#43703d', tuftA: '#5c8f4c', tuftB: '#335a30', dirt: 'rgba(122,96,60,0.55)', forest: '#16241a', tree: '#254a2a', treeHi: '#2f5d33' },
  coast:  { grassA: '#5a7a4a', grassB: '#5f8050', tuftA: '#88a868', tuftB: '#47653b', dirt: 'rgba(196,176,128,0.55)', forest: '#1c3038', tree: '#3a5e48', treeHi: '#4a7458' },
  ruins:  { grassA: '#4f5f3e', grassB: '#556644', tuftA: '#748856', tuftB: '#3e4c31', dirt: 'rgba(120,110,96,0.6)', forest: '#1d2219', tree: '#33452c', treeHi: '#41573a' },
};

/**
 * 'wall' is not in the PLAN list: walls are layout geometry, solid and
 * indestructible. The rest are the PLAN 10.1 structures.
 */
type StructureKind = 'gate' | 'building' | 'throne' | 'wagon' | 'captureRing' | 'cell' | 'wall';

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
  // capture rings and cells: seconds held, out of `need`
  progress = 0;
  need = 0;
  ringR = 0;
  contested = false;             // outpost: an enemy is in the ring (progress paused)
  // wagons: travel along the road, x-ward, until they leave
  speed = 0;
  escaped = false;
  look = '';                     // drawing variant ('tower', 'throne-room' ...)
  constructor(readonly kind: StructureKind, readonly team: Team, x: number, y: number, w: number, h: number, hp: number, readonly label = '') {
    this.x = x; this.y = y; this.w = w; this.h = h;
    this.hp = this.maxHp = hp;
  }
  get alive() { return this.hp > 0 && !this.escaped; }
  /** Hit radius for swing arcs and shots. */
  get radius() { return Math.max(this.w, this.h) * 0.5; }
  get solid() { return this.alive && (this.kind === 'building' || this.kind === 'gate' || this.kind === 'wagon' || this.kind === 'wall' || this.kind === 'throne'); }
  /** Can units, Charge and Focus aim at it? (walls, rings and cells are not attacked) */
  get targetable() { return this.alive && this.kind !== 'wall' && this.kind !== 'captureRing' && this.kind !== 'cell'; }

  /** Damage multiplier for a hit from `src` (PLAN 10.1). */
  mult(src: 'knight' | 'fire' | 'unit' | 'ram'): number {
    if (this.kind === 'wall' || this.kind === 'captureRing' || this.kind === 'cell') return 0;
    if (this.kind === 'building') return src === 'fire' ? 2 : 1;
    if (this.kind === 'gate') return src === 'ram' ? 4 : 0.3;
    if (this.kind === 'throne') return src === 'ram' ? 0 : 0.3;
    return 1;
  }

  /** Apply damage. Returns true if this hit destroyed it. */
  damage(g: Game, amount: number): boolean {
    if (!this.alive || amount <= 0 || !this.targetable) return false;
    this.hp -= amount;
    this.flash = 0.12;
    if (this.hp > 0) return false;
    this.hp = 0;
    if (this.kind === 'gate') g.battle.navCache.clear();   // a new way through
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

  /** The footprint's centre (aim point). */
  get cy() { return this.y - this.h / 2; }
}

/** An opening between two zones: step from side a (in zone za) to side b (in zone zb). */
interface Door { a: { x: number; y: number }; b: { x: number; y: number }; za: number; zb: number; gate: Structure | null; halfGap: number; }

/** Ground decoration (not solid). */
interface Decor { kind: 'road' | 'crops' | 'fence' | 'well' | 'rock' | 'bush' | 'stone' | 'rise' | 'carpet'; x: number; y: number; w: number; h: number; a?: number; }

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
  outcome = '';                      // the results screen's line under VICTORY / DEFEAT
  notes: string[] = [];              // extra results lines (Lord recruitable, cargo taken ...)
  leader: Enemy | null = null;       // the side's leader: commander (field / defense), captain (keep), lord (castle)
  // per-type state
  lord: Enemy | null = null;         // castle / rescue
  lordFled = false;                  // castle: the throne fell while the Lord lived (not recruitable)
  lordBeatenFirst = false;           // castle: the Lord fell before the throne (recruitable, Phase 10)
  captain: Enemy | null = null;      // keep
  general: Enemy | null = null;      // rescue: the freed general, once out of the cell
  cargo = 0;                         // convoy: gold aboard the wagons
  /** Which edge is the knight's: where they start and where they leave. */
  exitSide: 'left' | 'top' = 'left';
  /** Where the knight starts. */
  start = { x: 110, y: 0 };
  /** Where the Dominion's units come on from. */
  foeEdge = { x: 0, y: 0, spread: 0 };
  /**
   * Walled layouts: the enclosed areas (zone 0 is outside, zone k is rooms[k-1])
   * and the openings between them. A door is open once its gate is down
   * (a breach has none). Units go zone to zone through open doors; that is
   * all the pathfinding there is.
   */
  rooms: { x0: number; y0: number; x1: number; y1: number }[] = [];
  doors: Door[] = [];
  /** firstDoor results by zone pair, cleared when a gate falls. */
  navCache = new Map<number, Door | null>();

  constructor(spec: BattleSpec) {
    this.spec = spec;
    const size = BATTLE_SIZE[spec.kind];
    this.w = size.w; this.h = size.h;
    this.start = { x: 110, y: this.h / 2 };
    this.foeEdge = { x: this.w - 40, y: this.h / 2, spread: this.h * 0.3 };
    const rng = seededRng(spec.seed);
    switch (spec.kind) {
      case 'village': this.layVillage(rng, 'enemy'); break;
      case 'defense': this.layVillage(rng, 'player'); break;
      case 'field': this.scatter(rng, 22); break;
      case 'outpost': this.layOutpost(rng); break;
      case 'keep': this.layKeep(rng); break;
      case 'castle': this.layCastle(rng, false); break;
      case 'rescue': this.layCastle(rng, true); break;
      case 'convoy': this.layConvoy(rng); break;
    }
    if (spec.structure !== undefined && spec.structure < 1) this.applyWear(spec.structure);
  }

  /** The structures that wear down in an off-screen siege, in the order they fall: gates, houses, the throne. */
  private wearable(): Structure[] {
    const rank = (s: Structure) => s.kind === 'gate' ? 0 : s.kind === 'building' ? 1 : 2;
    return this.structures.filter((s) => s.kind === 'gate' || s.kind === 'building' || s.kind === 'throne').sort((a, b) => rank(a) - rank(b));
  }

  /** Start with the structures at `share` of their total HP (a joined fight, PLAN 7.3), the outer ones worn first. */
  applyWear(share: number) {
    const ws = this.wearable();
    let cut = ws.reduce((s, x) => s + x.maxHp, 0) * (1 - clamp(share, 0, 1));
    for (const s of ws) {
      const d = Math.min(cut, s.hp);
      s.hp -= d; cut -= d;
      if (s.hp <= 0) { s.hp = 0; s.burnT = 99; if (s.kind === 'gate') this.navCache.clear(); }
      if (cut <= 0) break;
    }
  }

  /** The structures' remaining share of their total HP (handed back to the sim when you leave). */
  wear(): number {
    const ws = this.wearable(), max = ws.reduce((s, x) => s + x.maxHp, 0);
    return max ? ws.reduce((s, x) => s + x.hp, 0) / max : 1;
  }

  private of(kind: StructureKind): Structure[] { return this.structures.filter((s) => s.kind === kind); }
  get houses() { return this.of('building'); }
  get gates() { return this.of('gate'); }
  get throne() { return this.of('throne')[0] || null; }
  get ring() { return this.of('captureRing')[0] || null; }
  get cell() { return this.of('cell')[0] || null; }
  get wagons() { return this.of('wagon'); }

  /** The objective line for the HUD; sieges change it as gates fall. */
  get objective(): string {
    switch (this.spec.kind) {
      case 'village': return 'Burn every house';
      case 'field': return 'Rout or destroy the Dominion army';
      case 'outpost': return 'Hold the ring 10 s with no enemy inside';
      case 'keep': return this.gates.some((s) => s.alive) ? 'Break the keep gate' : `Defeat ${this.spec.captainName || 'the Captain'}`;
      case 'castle': {
        const [outer, inner] = this.gates;
        if (outer && outer.alive) return 'Break the outer gate';
        if (inner && inner.alive) return 'Break the inner gate';
        return this.lord && this.lord.alive ? `Destroy the throne  ·  or beat ${this.spec.lordName || 'the Lord'} first to recruit` : 'Destroy the throne';
      }
      case 'convoy': return 'Destroy the wagons before they leave';
      case 'defense': return 'Rout the attackers, or hold 3:00 with a house standing';
      case 'rescue': return this.general ? `Bring ${this.spec.generalName || 'the general'} to your edge` : `Free ${this.spec.generalName || 'the general'}: hold the cell 8 s`;
      default: return 'Test field';
    }
  }

  /** 0..1 progress toward the objective, for the HUD bar. */
  progress(g: Game): number {
    const frac = (xs: Structure[]) => xs.length ? xs.filter((s) => !s.alive).length / xs.length : 0;
    switch (this.spec.kind) {
      case 'village': return frac(this.houses);
      case 'field': return this.startFoes ? clamp(1 - g.foeStrength() / this.startFoes, 0, 1) : 0;
      case 'outpost': { const r = this.ring; return r ? clamp(r.progress / r.need, 0, 1) : 0; }
      case 'keep': { const gt = this.gates[0]; return (gt && !gt.alive ? 0.5 : gt ? 0.5 * (1 - gt.hp / gt.maxHp) : 0) + (this.captain && !this.captain.alive ? 0.5 : 0); }
      case 'castle': {
        const gs = this.gates, t = this.throne;
        const gp = gs.reduce((s, x) => s + (1 - x.hp / x.maxHp), 0) / Math.max(1, gs.length);
        return clamp(gp * 0.6 + (t ? (1 - t.hp / t.maxHp) * 0.4 : 0), 0, 1);
      }
      case 'convoy': return frac(this.wagons);
      case 'defense': return clamp(this.time / WAR.defenseHold, 0, 1);
      case 'rescue': { const c = this.cell; return this.general ? 0.5 + 0.5 * clamp(1 - (g.player.x - g.field.x) / Math.max(1, (c ? c.x : this.w) - g.field.x), 0, 1) : c ? 0.5 * clamp(c.progress / c.need, 0, 1) : 0; }
      default: return 0;
    }
  }

  /* ---------------------------------------------------------- navigation */

  /** Which zone a point is in (0 = outside every wall). */
  zone(x: number, y: number): number {
    for (let k = 0; k < this.rooms.length; k++) {
      const r = this.rooms[k];
      if (x >= r.x0 && x < r.x1 && y >= r.y0 && y < r.y1) return k + 1;
    }
    return 0;
  }

  /** The first open door on the way from zone a to zone b, or null if b can't be reached. */
  private firstDoor(a: number, b: number): Door | null {
    if (a === b) return null;
    const key = a * 64 + b;
    let d = this.navCache.get(key);
    if (d === undefined) { d = this.searchDoor(a, b); this.navCache.set(key, d); }
    return d;
  }

  private searchDoor(a: number, b: number): Door | null {
    const prev = new Map<number, Door>();
    const seen = new Set([a]);
    const queue = [a];
    while (queue.length) {
      const z = queue.shift()!;
      for (const d of this.doors) {
        if (d.gate && d.gate.alive) continue;
        const o = d.za === z ? d.zb : d.zb === z ? d.za : -1;
        if (o < 0 || seen.has(o)) continue;
        seen.add(o); prev.set(o, d); queue.push(o);
        if (o === b) {
          // walk back to the door leaving zone a
          let cur = b, door = d;
          while (true) { door = prev.get(cur)!; const from = door.za === cur ? door.zb : door.za; if (from === a) return door; cur = from; }
        }
      }
    }
    return null;
  }

  /** Can something at (fx, fy) walk to (tx, ty)? */
  reachable(fx: number, fy: number, tx: number, ty: number): boolean {
    if (!this.doors.length) return true;
    const a = this.zone(fx, fy), b = this.zone(tx, ty);
    return a === b || this.firstDoor(a, b) !== null;
  }

  /** Can something at (fx, fy) get at this combatant? Gates are hit from either side. */
  canReach(fx: number, fy: number, c: { x: number; y: number }): boolean {
    if (c instanceof Structure && c.kind === 'gate') return true;
    return this.reachable(fx, fy, c.x, c.y);
  }

  /**
   * Where to walk next on the way from (fx, fy) to (tx, ty): the target itself
   * in the same zone, else the near side of the next open door, then its far
   * side. Null if there is no way through.
   */
  via(fx: number, fy: number, tx: number, ty: number): { x: number; y: number } | null {
    if (!this.doors.length) return { x: tx, y: ty };
    const a = this.zone(fx, fy), b = this.zone(tx, ty);
    if (a === b) return { x: tx, y: ty };
    // a target in a doorway (a gate) is reached from either side
    for (const dr of this.doors) {
      if ((dr.za === a || dr.zb === a) && tx >= Math.min(dr.a.x, dr.b.x) && tx <= Math.max(dr.a.x, dr.b.x) && Math.abs(ty - dr.a.y) <= dr.halfGap + 24) return { x: tx, y: ty };
    }
    const d = this.firstDoor(a, b);
    if (!d) return null;
    const near = d.za === a ? d.a : d.b, far = d.za === a ? d.b : d.a;
    // in the doorway (or on its near step): through to the far side
    const onStep = (fx - near.x) ** 2 + (fy - near.y) ** 2 < 28 * 28;
    const inGap = fx > Math.min(near.x, far.x) && fx < Math.max(near.x, far.x) && Math.abs(fy - near.y) < d.halfGap;
    return onStep || inGap ? far : near;
  }

  /* -------------------------------------------------------------- layouts */

  /** Village raid / defense: houses in the far half (defense: the middle), a road through them, crops and fences. */
  private layVillage(rng: () => number, owner: Team) {
    const n = this.spec.houses ?? 4;
    const cy = this.h / 2;
    this.decor.push({ kind: 'road', x: 0, y: cy - 22, w: this.w, h: 44 });
    const x0 = owner === 'enemy' ? this.w * 0.52 : this.w * 0.3, x1 = owner === 'enemy' ? this.w * 0.88 : this.w * 0.62;
    for (let k = 0; k < n; k++) {
      const x = x0 + (x1 - x0) * ((k + 0.5) / n) + (rng() - 0.5) * 60;
      const above = k % 2 === 0;
      const y = above ? cy - 70 - rng() * 120 : cy + 150 + rng() * 120;
      const hp = Math.round(WAR.houseHp * TIER_SCALING.hpMultiplier(this.spec.tier));
      this.structures.push(new Structure('building', owner, x, y, 112, 78, hp, `House ${k + 1}`));
    }
    this.decor.push({ kind: 'well', x: (x0 + x1) / 2 + 40, y: cy - 34, w: 30, h: 30 });
    for (let k = 0; k < 4; k++) {
      const x = x0 - 120 + rng() * (x1 - x0 + 160), y = k % 2 ? cy - 330 - rng() * 120 : cy + 330 + rng() * 80;
      this.decor.push({ kind: 'crops', x, y, w: 150 + rng() * 60, h: 90 + rng() * 40 });
    }
    for (let k = 0; k < 6; k++) {
      this.decor.push({ kind: 'fence', x: x0 - 60 + rng() * (x1 - x0 + 80), y: cy + (k % 2 ? 1 : -1) * (40 + rng() * 260), w: 90 + rng() * 60, h: 6 });
    }
    if (owner === 'player') this.start = { x: (x0 + x1) / 2, y: cy };
    this.scatter(rng, 14);
  }

  /** Outpost: a watchtower on a rise, its capture ring beside it. */
  private layOutpost(rng: () => number) {
    const tx = this.w * 0.68, ty = this.h / 2;
    this.decor.push({ kind: 'rise', x: tx, y: ty, w: 520, h: 360 });
    const tower = new Structure('wall', 'enemy', tx + 90, ty - 30, 70, 70, 1e9, 'Tower');
    tower.look = 'tower';
    this.structures.push(tower);
    this.foeEdge = { x: tower.x, y: tower.y + 40, spread: 30 };   // the garrison turns out of the tower
    const ring = new Structure('captureRing', 'enemy', tx - 60, ty + 60, 10, 10, 1, 'Capture ring');
    ring.ringR = WAR.ringRadius; ring.need = WAR.outpostHold;
    this.structures.push(ring);
    this.scatter(rng, 18);
  }

  /** Keep: a square fort of walls with one gate on the west side; the Captain inside. */
  private layKeep(rng: () => number) {
    const x0 = this.w * 0.5, x1 = this.w * 0.82, y0 = this.h * 0.28, y1 = this.h * 0.72, t = 26, gap = 110;
    const cy = (y0 + y1) / 2;
    this.decor.push({ kind: 'stone', x: (x0 + x1) / 2, y: cy, w: x1 - x0, h: y1 - y0 });
    this.wallV(x0, y0, cy - gap / 2, t);
    this.wallV(x0, cy + gap / 2, y1, t);
    this.wallV(x1, y0, y1, t);
    this.wallH(x0, x1, y0, t);
    this.wallH(x0, x1, y1, t);
    const gateHp = Math.round(WAR.gateHp * WAR.keepGateMult * TIER_SCALING.hpMultiplier(this.spec.tier));
    this.foeEdge = { x: x1 - 60, y: cy, spread: 60 };   // the barracks: reinforcements come from inside
    const gate = new Structure('gate', 'enemy', x0, cy + gap / 2, t + 8, gap, gateHp, 'Keep gate');
    this.structures.push(gate);
    this.rooms.push({ x0, y0, x1, y1 });
    this.doors.push({ a: { x: x0 - 60, y: cy }, b: { x: x0 + 60, y: cy }, za: 0, zb: 1, gate, halfGap: gap / 2 - 14 });
    this.decor.push({ kind: 'road', x: 0, y: cy - 22, w: x0, h: 44 });
    this.scatter(rng, 12);
  }

  /**
   * Castle (PLAN 10.2): outer gate -> courtyard -> inner gate -> throne room.
   * Rescue raids use the same castle with a cell in the throne room's north
   * wing and a breach in each wall's north end (the way in without taking it).
   */
  private layCastle(rng: () => number, rescue: boolean) {
    const t = 30, gap = 130, cy = this.h / 2;
    const ox = this.w * 0.3, ix = this.w * 0.62, top = 60, bot = this.h - 60;
    const breach = rescue ? 150 : 0;   // a gap at each wall's north end
    this.decor.push({ kind: 'stone', x: (ox + this.w) / 2, y: cy, w: this.w - ox, h: bot - top });
    this.decor.push({ kind: 'carpet', x: (ix + this.w) / 2 + 60, y: cy, w: this.w - ix - 200, h: 70 });
    this.wallV(ox, top + breach, cy - gap / 2, t); this.wallV(ox, cy + gap / 2, bot, t);
    this.wallV(ix, top + breach, cy - gap / 2, t); this.wallV(ix, cy + gap / 2, bot, t);
    this.wallH(ox, this.w, top, t); this.wallH(ox, this.w, bot, t);
    const iron = this.spec.ironGate ? WAR.ironGateMult : 1;
    const gateHp = Math.round(WAR.gateHp * iron * (this.spec.gateMult || 1) * TIER_SCALING.hpMultiplier(this.spec.tier));
    const outer = new Structure('gate', 'enemy', ox, cy + gap / 2, t + 8, gap, gateHp, 'Outer gate');
    const inner = new Structure('gate', 'enemy', ix, cy + gap / 2, t + 8, gap, gateHp, 'Inner gate');
    this.structures.push(outer, inner);
    this.rooms.push({ x0: ox, y0: top, x1: ix, y1: bot }, { x0: ix, y0: top, x1: this.w, y1: bot });
    this.doors.push({ a: { x: ox - 60, y: cy }, b: { x: ox + 60, y: cy }, za: 0, zb: 1, gate: outer, halfGap: gap / 2 - 14 });
    this.doors.push({ a: { x: ix - 60, y: cy }, b: { x: ix + 60, y: cy }, za: 1, zb: 2, gate: inner, halfGap: gap / 2 - 14 });
    const thr = new Structure('throne', 'enemy', this.w - 220, cy + 30, 70, 60, Math.round(WAR.throneHp * TIER_SCALING.hpMultiplier(this.spec.tier)), 'Throne');
    this.structures.push(thr);
    this.decor.push({ kind: 'road', x: 0, y: cy - 22, w: ox, h: 44 });
    if (rescue) {
      // the cell sits in the throne room's north wing
      const cell = new Structure('cell', 'enemy', ix + 260, top + 150, 60, 50, 1, 'Cell');
      cell.ringR = WAR.cellRingRadius; cell.need = WAR.rescueHold;
      this.structures.push(cell);
      // in through the breaches, back out the same way
      const by = top + t / 2 + (breach - t / 2) / 2;
      this.doors.push({ a: { x: ox - 60, y: by }, b: { x: ox + 60, y: by }, za: 0, zb: 1, gate: null, halfGap: (breach - t / 2) / 2 - 14 });
      this.doors.push({ a: { x: ix - 60, y: by }, b: { x: ix + 60, y: by }, za: 1, zb: 2, gate: null, halfGap: (breach - t / 2) / 2 - 14 });
    }
    this.scatter(rng, 10, ox - 40);
  }

  /** Convoy: a long road; wagons start at the west end heading east; you wait on the north verge. */
  private layConvoy(rng: () => number) {
    const ry = this.h * 0.55;
    this.decor.push({ kind: 'road', x: 0, y: ry - 30, w: this.w, h: 60 });
    const n = this.spec.wagons ?? 2;
    const hp = Math.round(WAR.wagonHp * TIER_SCALING.hpMultiplier(this.spec.tier));
    for (let k = 0; k < n; k++) {
      // a column: the later wagons roll onto the field one after another
      const wg = new Structure('wagon', 'enemy', 260 - k * WAR.wagonGap, ry + 20, 74, 44, hp, `Wagon ${k + 1}`);
      wg.speed = WAR.wagonSpeed;
      this.structures.push(wg);
    }
    this.cargo = this.spec.cargo ?? WAR.convoyCargo * this.spec.tier * n;
    this.exitSide = 'top';
    this.start = { x: this.w * 0.3, y: 70 };
    this.foeEdge = { x: 60, y: ry, spread: 120 };
    this.scatter(rng, 26);
  }

  private wallV(x: number, y0: number, y1: number, t: number) {
    if (y1 - y0 < 4) return;
    this.structures.push(new Structure('wall', 'enemy', x, y1, t, y1 - y0, 1e9, 'Wall'));
  }
  private wallH(x0: number, x1: number, y: number, t: number) {
    this.structures.push(new Structure('wall', 'enemy', (x0 + x1) / 2, y + t / 2, x1 - x0, t, 1e9, 'Wall'));
  }

  private scatter(rng: () => number, n: number, maxX = this.w) {
    for (let k = 0; k < n; k++) {
      const x = 120 + rng() * (Math.min(this.w, maxX) - 240), y = 80 + rng() * (this.h - 160);
      if (Math.abs(y - this.h / 2) < 60 && (this.spec.kind === 'village' || this.spec.kind === 'defense')) continue;   // keep the road clear
      if (this.structures.some((s) => Math.abs(s.x - x) < s.w / 2 + 30 && y > s.y - s.h - 30 && y < s.y + 30)) continue;
      this.decor.push({ kind: rng() < 0.5 ? 'rock' : 'bush', x, y, w: 16 + rng() * 18, h: 10 + rng() * 10 });
    }
  }

  /* --------------------------------------------------------------- queries */

  /** Where idle Dominion units gather: the ring they hold, or the cell they guard. */
  guardPoint(): Structure | null {
    if (this.spec.kind === 'outpost') return this.ring;
    if (this.spec.kind === 'rescue' && !this.general) return this.cell;
    return null;
  }

  /** The nearest live structure hostile to `side` that units may attack and can get at, or null. */
  nearestStructure(side: Team, x: number, y: number, ram = false): Structure | null {
    let best: Structure | null = null, bd = Infinity;
    for (const s of this.structures) {
      if (!s.targetable || s.team === side || !this.canReach(x, y, s) || (ram && s.mult('ram') <= 0)) continue;
      const d = (s.x - x) ** 2 + (s.cy - y) ** 2;
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
  outpost: { w: 2000, h: 1200 },
  keep: { w: 2000, h: 1600 },
  castle: { w: 3200, h: 1800 },
  convoy: { w: 3600, h: 1000 },
  defense: { w: 2400, h: 1400 },   // the node's own layout: the village, roles reversed
  rescue: { w: 3200, h: 1800 },    // the castle layout
};

/* ------------------------------------------------- battles on the stub map */

// Until the campaign map exists (Phase 6), the stub offers one of each type.
function testSpec(): BattleSpec {
  return { kind: 'test', name: 'Test field', tier: WAR.testFieldTier, scenery: 'forest', seed: 1, foes: {}, foeElites: [], commander: null, allies: {} };
}

/** A village raid: a garrison among four houses. */
function villageSpec(): BattleSpec {
  return {
    reinforce: foeMix(WAR.battleReinforce.village),
    kind: 'village', name: 'Millbrook', tier: 1, scenery: 'forest', seed: 1337 + 11, houses: 4,
    foes: { sword: 16, spear: 8, archer: 10, shield: 6 }, foeElites: ['shade', 'caster'], commander: null, allies: {},
  };
}

/** A field battle: a Dominion column with a commander, against your warband and a sent army joining. */
function fieldSpec(): BattleSpec {
  return {
    reinforce: foeMix(WAR.battleReinforce.field),
    kind: 'field', name: 'Dominion column', tier: 1, scenery: 'coast', seed: 1337 + 23,
    foes: { sword: 28, spear: 14, archer: 18, shield: 10 }, foeElites: ['shade', 'flyer'], commander: 'bruiser',
    allies: { sword: 10, spear: 6, archer: 6, shield: 4 },
  };
}

/** Outpost capture: a watchtower and its garrison. */
function outpostSpec(): BattleSpec {
  return {
    reinforce: foeMix(WAR.battleReinforce.outpost),
    kind: 'outpost', name: 'Greywatch Tower', tier: 1, scenery: 'forest', seed: 1337 + 31,
    foes: { sword: 20, spear: 10, archer: 12, shield: 8 }, foeElites: ['shade', 'caster'], commander: null, allies: {},
  };
}

/** Keep assault: a walled fort, one gate, a Captain. */
function keepSpec(): BattleSpec {
  return {
    reinforce: foeMix(WAR.battleReinforce.keep),
    kind: 'keep', name: 'Thornwall Keep', tier: 1, scenery: 'ruins', seed: 1337 + 41, captainName: 'Captain Varn',
    foes: { sword: 24, spear: 12, archer: 12, shield: 10 }, foeElites: ['caster', 'shade'], commander: null,
    allies: { sword: 8, spear: 4, archer: 4, shield: 4, ram: 1 },
  };
}

/** Castle siege: two gates and a throne; the keep still stands, so the gate is iron. */
function castleSpec(): BattleSpec {
  return {
    reinforce: foeMix(WAR.battleReinforce.castle),
    kind: 'castle', name: 'Castle Hollin', tier: 2, scenery: 'forest', seed: 1337 + 51, ironGate: true, lordName: 'Lord Edric Hollin',
    foes: { sword: 32, spear: 16, archer: 20, shield: 12 }, foeElites: ['shade', 'caster'], commander: null,
    allies: { sword: 16, spear: 8, archer: 10, shield: 6, ram: 2 },
  };
}

/** The warlord's seat (debug list): tier 5, his four phases, two hound packs. */
function warlordSpec(): BattleSpec {
  return {
    reinforce: foeMix(WAR.battleReinforce.castle),
    kind: 'castle', name: "Thorne's Seat", tier: 5, scenery: 'ruins', seed: 1337 + 53, ironGate: false, lordName: 'Warlord Garrick Thorne', warlord: true,
    foes: { sword: 30, spear: 14, archer: 18, shield: 10, hound: WAR.houndPacks[4] * WAR.houndPack }, foeElites: ['shade', 'caster', 'bruiser'], commander: null,
    allies: { sword: 16, spear: 8, archer: 10, shield: 6, ram: 2 },
  };
}

/** Convoy ambush: two wagons of gold and their escort. */
function convoySpec(): BattleSpec {
  return {
    reinforce: foeMix(WAR.battleReinforce.convoy),
    kind: 'convoy', name: 'Dominion convoy', tier: 1, scenery: 'coast', seed: 1337 + 61, wagons: 3,
    foes: { sword: 12, spear: 6, archer: 6, shield: 4 }, foeElites: ['shade'], commander: null, allies: {},
  };
}

/** Defense: the Dominion comes for your village, rams and all. */
function defenseSpec(): BattleSpec {
  return {
    reinforce: { ...foeMix(WAR.battleReinforce.defense), ram: 2 },
    kind: 'defense', name: 'Millbrook (held)', tier: 1, scenery: 'forest', seed: 1337 + 71, houses: 3,
    foes: { sword: 40, spear: 20, archer: 22, shield: 14, ram: 3 }, foeElites: ['shade', 'flyer'], commander: 'bruiser',
    allies: { sword: 10, spear: 6, archer: 8, shield: 4 },
  };
}

/** Rescue raid: a general caged in a castle's north wing. */
function rescueSpec(): BattleSpec {
  return {
    reinforce: foeMix(WAR.battleReinforce.rescue),
    kind: 'rescue', name: 'Castle Hollin (cells)', tier: 2, scenery: 'forest', seed: 1337 + 81, lordName: 'Lord Edric Hollin', generalName: 'Sir Aldric',
    foes: { sword: 24, spear: 12, archer: 14, shield: 10 }, foeElites: ['shade', 'caster'], commander: null, allies: {},
  };
}

/** n Dominion units in the default recruit mix (PLAN 6: 40/20/25/15). */
function foeMix(n: number): Partial<Record<UnitType, number>> {
  const m = WAR.testMix;
  const out: Partial<Record<UnitType, number>> = { sword: Math.round(n * m.sword), spear: Math.round(n * m.spear), archer: Math.round(n * m.archer) };
  out.shield = Math.max(0, n - out.sword! - out.spear! - out.archer!);
  return out;
}

/** Counts by type -> a shuffled list of unit types. */
function unitList(counts: Partial<Record<UnitType, number>>): UnitType[] {
  const out: UnitType[] = [];
  for (const k of UNIT_ORDER) for (let n = counts[k] || 0; n > 0; n--) out.push(k);
  for (let k = out.length - 1; k > 0; k--) { const r = Math.floor(Math.random() * (k + 1)); [out[k], out[r]] = [out[r], out[k]]; }
  return out;
}
