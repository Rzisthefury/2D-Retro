/* =========================================================================
 * army.ts — the mass-unit sim (PLAN 11.1).
 *
 * Minions live in struct-of-arrays slots: Float32Array position, velocity,
 * HP and timers; Uint8Array type, team and state. A uniform grid (64 px
 * cells) is rebuilt every frame for neighbour queries: separation, nearest
 * hostile, the knight's swing arcs, arrows. Each minion re-picks its target
 * every WAR.unitRetargetFrames frames (staggered by slot), advances, and
 * fights with one simple windup -> hit. No poise, no frame data.
 *
 * Elites (AF `Enemy` entities) and the knight interact with minions through
 * `MinionRef`, a tiny handle that looks like any other Combatant.
 * ========================================================================= */

const TEAM_PLAYER = 0, TEAM_ENEMY = 1;
const ST_ADVANCE = 0, ST_FIGHT = 1, ST_FLEE = 2;

/** The knight's standing order to the player's side (PLAN 11.4). */
type Order = 'follow' | 'charge' | 'hold' | 'focus';
const ORDERS: Order[] = ['follow', 'charge', 'hold', 'focus'];

type Reserve = Record<UnitType, number>;
function emptyReserve(): Reserve { return { sword: 0, spear: 0, archer: 0, shield: 0, ram: 0, hound: 0 }; }

function teamIndex(t: Team): number { return t === 'player' ? TEAM_PLAYER : TEAM_ENEMY; }
function teamName(i: number): Team { return i === TEAM_PLAYER ? 'player' : 'enemy'; }

/** A minion seen as a Combatant (x, y, z, radius, alive, team). Stale once its slot is reused. */
class MinionRef {
  constructor(readonly army: Army, readonly i: number, readonly uid: number) {}
  get x() { return this.army.x[this.i]; }
  get y() { return this.army.y[this.i]; }
  get z() { return 0; }
  get radius() { return UNITS[UNIT_ORDER[this.army.type[this.i]]].radius; }
  get alive() { return this.army.uid[this.i] === this.uid && this.army.alive[this.i] === 1; }
  get team(): Team { return teamName(this.army.team[this.i]); }
}

class Army {
  readonly cap: number;
  // per-slot state
  x: Float32Array; y: Float32Array; vx: Float32Array; vy: Float32Array;
  hp: Float32Array; maxHp: Float32Array; facing: Float32Array;
  cd: Float32Array; wind: Float32Array; flash: Float32Array; deadT: Float32Array;
  atk: Float32Array; armor: Float32Array; walk: Float32Array;
  anchorX: Float32Array; anchorY: Float32Array;   // Hold: where each unit was told to stand
  type: Uint8Array; team: Uint8Array; state: Uint8Array; alive: Uint8Array; used: Uint8Array;
  uid: Uint32Array;
  tgt: (Combatant | null)[];
  private refs: (MinionRef | null)[];
  private freeList: number[] = [];
  private nextUid = 1;
  private frame = 0;
  liveCount = [0, 0];
  routedCount = [0, 0];               // units that fled off the field (not kills)
  private tmpBody = { x: 0, y: 0, radius: 0 };

  // reserves (PLAN 10.1): units past the live cap wait here and stream in from their side's edge
  reserve: Reserve[] = [emptyReserve(), emptyReserve()];
  streamT = [0, 0];
  streamMult = [1, 1];                // < 1 streams faster (the Muster talent, Phase 11)
  edge = [{ x: 0, y: 0, spread: 200 }, { x: 0, y: 0, spread: 200 }];
  streamTier = 1;
  /** where each side's fighters are massed (knight and elites included), for units with nothing in sight */
  centre = [{ x: 0, y: 0, n: 0 }, { x: 0, y: 0, n: 0 }];

  // uniform grid
  readonly cell = 64;
  private cols = 1; private rows = 1;
  private head: Int32Array = new Int32Array(1).fill(-1);   // -1 = empty cell (0 would be a valid slot)
  private next: Int32Array;

  // arrows: lightweight projectiles in the same style
  readonly arrowCap: number;
  ax: Float32Array; ay: Float32Array; avx: Float32Array; avy: Float32Array; alife: Float32Array; admg: Float32Array;
  ateam: Uint8Array;
  arrows = 0;

  constructor(cap = WAR.unitCapacity, arrowCap = WAR.arrowCapacity) {
    this.cap = cap;
    const f = () => new Float32Array(cap), u = () => new Uint8Array(cap);
    this.x = f(); this.y = f(); this.vx = f(); this.vy = f();
    this.hp = f(); this.maxHp = f(); this.facing = f();
    this.cd = f(); this.wind = f(); this.flash = f(); this.deadT = f();
    this.atk = f(); this.armor = f(); this.walk = f();
    this.anchorX = f(); this.anchorY = f();
    this.type = u(); this.team = u(); this.state = u(); this.alive = u(); this.used = u();
    this.uid = new Uint32Array(cap);
    this.tgt = new Array(cap).fill(null);
    this.refs = new Array(cap).fill(null);
    this.next = new Int32Array(cap);
    for (let i = cap - 1; i >= 0; i--) this.freeList.push(i);
    this.arrowCap = arrowCap;
    const a = () => new Float32Array(arrowCap);
    this.ax = a(); this.ay = a(); this.avx = a(); this.avy = a(); this.alife = a(); this.admg = a();
    this.ateam = new Uint8Array(arrowCap);
  }

  /** Live cap per side on this device (PLAN 10.1). */
  static liveCap(): number { return IS_TOUCH ? WAR.liveCapPhone : WAR.liveCapDesktop; }

  clear() {
    this.freeList.length = 0;
    for (let i = this.cap - 1; i >= 0; i--) {
      this.used[i] = 0; this.alive[i] = 0; this.tgt[i] = null; this.refs[i] = null;
      this.freeList.push(i);
    }
    this.liveCount[0] = this.liveCount[1] = 0;
    this.routedCount[0] = this.routedCount[1] = 0;
    this.arrows = 0;
    this.head.fill(-1);
    this.reserve = [emptyReserve(), emptyReserve()];
    this.streamT = [WAR.streamInterval, WAR.streamInterval];
  }

  /* ------------------------------------------------------------ reserves */

  addReserve(side: Team, kind: UnitType, n = 1) { this.reserve[teamIndex(side)][kind] += n; }

  reserveCount(side: Team): number {
    const r = this.reserve[teamIndex(side)];
    let n = 0;
    for (const k of UNIT_ORDER) n += r[k];
    return n;
  }

  /** Where a side's reinforcements walk on from. */
  setEdge(side: Team, x: number, y: number, spread: number) { this.edge[teamIndex(side)] = { x, y, spread }; }

  /** Every WAR.streamInterval, a side under its live cap brings up to WAR.streamBatch reserves on at its edge. */
  private stream(dt: number) {
    const cap = Army.liveCap();
    for (let t = 0; t < 2; t++) {
      const interval = WAR.streamInterval * this.streamMult[t];
      const side = teamName(t);
      if (this.reserveCount(side) === 0 || this.liveCount[t] >= cap) { this.streamT[t] = interval; continue; }
      this.streamT[t] -= dt;
      if (this.streamT[t] > 0) continue;
      this.streamT[t] = interval;
      const e = this.edge[t];
      for (let n = Math.min(WAR.streamBatch, cap - this.liveCount[t]); n > 0; n--) {
        const kind = this.drawReserve(t);
        if (!kind) break;
        if (this.spawn(kind, side, e.x + rnd(-20, 20), e.y + rnd(-e.spread, e.spread), this.streamTier) < 0) {
          this.reserve[t][kind]++;   // no slot after all: put it back
          break;
        }
      }
    }
  }

  /** Take one unit out of a side's reserve, weighted by what is left. */
  private drawReserve(t: number): UnitType | null {
    const r = this.reserve[t];
    let total = 0;
    for (const k of UNIT_ORDER) total += r[k];
    if (!total) return null;
    let pick = Math.random() * total;
    for (const k of UNIT_ORDER) {
      if (pick < r[k]) { r[k]--; return k; }
      pick -= r[k];
    }
    return null;
  }

  live(t: Team): number { return this.liveCount[teamIndex(t)]; }

  /** Spawn one minion. Returns its slot, or -1 if the side is at its live cap or the arrays are full. */
  spawn(kind: UnitType, side: Team, x: number, y: number, tier: number): number {
    const t = teamIndex(side);
    if (this.liveCount[t] >= Army.liveCap() || !this.freeList.length) return -1;
    const i = this.freeList.pop()!;
    const d = UNITS[kind];
    const tm = side === 'player' ? WAR.playerTroopMult : 1;
    const ts = Math.max(1, tier);
    this.used[i] = 1; this.alive[i] = 1;
    this.uid[i] = this.nextUid++;
    this.type[i] = UNIT_ORDER.indexOf(kind);
    this.team[i] = t;
    this.state[i] = ST_ADVANCE;
    this.x[i] = x; this.y[i] = y; this.vx[i] = 0; this.vy[i] = 0;
    this.maxHp[i] = this.hp[i] = Math.round(d.hp * TIER_SCALING.hpMultiplier(ts) * tm);
    this.atk[i] = d.dmg * TIER_SCALING.attackMultiplier(ts) * tm;
    this.armor[i] = d.def * TIER_SCALING.defenseMultiplier(ts);
    this.facing[i] = side === 'player' ? 0 : Math.PI;
    this.cd[i] = rnd(0, d.cooldown);
    this.wind[i] = 0; this.flash[i] = 0; this.deadT[i] = 0;
    this.walk[i] = Math.random() * 6.28;
    this.tgt[i] = null;
    this.refs[i] = null;
    this.anchorX[i] = x; this.anchorY[i] = y;
    this.liveCount[t]++;
    return i;
  }

  def(i: number): UnitDef { return UNITS[UNIT_ORDER[this.type[i]]]; }

  /** A Combatant handle for slot i (cached per spawn). */
  ref(i: number): MinionRef {
    const r = this.refs[i];
    if (r && r.uid === this.uid[i]) return r;
    return (this.refs[i] = new MinionRef(this, i, this.uid[i]));
  }

  /** Rout (PLAN 10.1): every live unit of the side flees; its reserve never comes on. */
  routSide(side: Team) {
    const t = teamIndex(side);
    for (let i = 0; i < this.cap; i++) {
      if (!this.alive[i] || this.team[i] !== t) continue;
      this.state[i] = ST_FLEE; this.wind[i] = 0; this.tgt[i] = null;
    }
    this.reserve[t] = emptyReserve();
  }

  /** Remove a unit without a death (it fled off the field). */
  private despawn(i: number) {
    if (!this.alive[i]) return;
    this.alive[i] = 0; this.used[i] = 0; this.tgt[i] = null;
    this.liveCount[this.team[i]]--;
    this.routedCount[this.team[i]]++;
    this.freeList.push(i);
  }

  /** Hold: every player-side unit's anchor becomes where it stands now. */
  anchorAll(side: Team) {
    const t = teamIndex(side);
    for (let i = 0; i < this.cap; i++) {
      if (!this.alive[i] || this.team[i] !== t) continue;
      this.anchorX[i] = this.x[i]; this.anchorY[i] = this.y[i];
    }
  }

  /** Follow: each unit's own spot around the knight, so the warband rings you instead of piling up. */
  formationSpot(i: number, kx: number, ky: number): { x: number; y: number } {
    const u = this.uid[i];
    const ang = u * 2.39996;                       // golden angle: an even scatter
    const r = 44 + (u % 4) * 30;
    return { x: kx + Math.cos(ang) * r, y: ky + Math.sin(ang) * r * 0.75 };
  }

  /* ------------------------------------------------------------- the grid */

  private rebuildGrid(f: { x: number; y: number; w: number; h: number }) {
    const cols = Math.max(1, Math.ceil(f.w / this.cell)), rows = Math.max(1, Math.ceil(f.h / this.cell));
    if (cols !== this.cols || rows !== this.rows || this.head.length !== cols * rows) {
      this.cols = cols; this.rows = rows; this.head = new Int32Array(cols * rows);
    }
    this.head.fill(-1);
    for (let i = 0; i < this.cap; i++) {
      if (!this.alive[i]) continue;
      const c = this.cellOf(this.x[i], this.y[i], f);
      this.next[i] = this.head[c];
      this.head[c] = i;
    }
  }

  private gx0 = 0; private gy0 = 0;
  private cellOf(x: number, y: number, f: { x: number; y: number }): number {
    const cx = clamp(Math.floor((x - f.x) / this.cell), 0, this.cols - 1);
    const cy = clamp(Math.floor((y - f.y) / this.cell), 0, this.rows - 1);
    return cy * this.cols + cx;
  }

  /** Calls fn(i) for every live minion whose cell overlaps the circle (x, y, r). fn returns true to stop. */
  query(x: number, y: number, r: number, fn: (i: number) => boolean | void) {
    const c0 = clamp(Math.floor((x - r - this.gx0) / this.cell), 0, this.cols - 1);
    const c1 = clamp(Math.floor((x + r - this.gx0) / this.cell), 0, this.cols - 1);
    const r0 = clamp(Math.floor((y - r - this.gy0) / this.cell), 0, this.rows - 1);
    const r1 = clamp(Math.floor((y + r - this.gy0) / this.cell), 0, this.rows - 1);
    for (let cy = r0; cy <= r1; cy++) for (let cx = c0; cx <= c1; cx++) {
      for (let i = this.head[cy * this.cols + cx]; i !== -1; i = this.next[i]) {
        if (this.alive[i] && fn(i)) return;
      }
    }
  }

  /** Nearest live minion hostile to `side` within r of (x, y), or -1. */
  nearestHostile(side: Team, x: number, y: number, r: number): number {
    const own = teamIndex(side);
    let best = -1, bd = r * r;
    this.query(x, y, r, (j) => {
      if (this.team[j] === own) return;
      const dx = this.x[j] - x, dy = this.y[j] - y, d = dx * dx + dy * dy;
      if (d < bd) { bd = d; best = j; }
    });
    return best;
  }

  /* --------------------------------------------------------------- update */

  update(g: Game, dt: number) {
    this.frame++;
    const f = g.field;
    this.gx0 = f.x; this.gy0 = f.y;
    this.rebuildGrid(f);
    this.computeCentres(g);

    for (let i = 0; i < this.cap; i++) {
      if (!this.used[i]) continue;
      if (this.flash[i] > 0) this.flash[i] -= dt;
      if (!this.alive[i]) {
        this.deadT[i] += dt;
        if (this.deadT[i] > WAR.unitCorpseTime) { this.used[i] = 0; this.tgt[i] = null; this.freeList.push(i); }
        continue;
      }
      this.think(g, i, dt);
    }
    this.separate(g, dt);
    this.stream(dt);
    for (let i = 0; i < this.cap; i++) {
      if (!this.alive[i]) continue;
      this.x[i] += this.vx[i] * dt;
      this.y[i] += this.vy[i] * dt;
      const r = this.def(i).radius;
      this.x[i] = clamp(this.x[i], f.x + r, f.x + f.w - r);
      this.y[i] = clamp(this.y[i], f.y + r, f.y + f.h - r);
      if (g.battle.structures.length) {
        // houses and walls are solid
        const o = this.tmpBody; o.x = this.x[i]; o.y = this.y[i]; o.radius = r;
        g.battle.collide(o);
        this.x[i] = o.x; this.y[i] = o.y;
      }
    }
    this.updateArrows(g, dt);
  }

  /** Each side's centre of mass, the knight and elites included. */
  private computeCentres(g: Game) {
    for (const c of this.centre) { c.x = 0; c.y = 0; c.n = 0; }
    for (let i = 0; i < this.cap; i++) {
      if (!this.alive[i]) continue;
      const c = this.centre[this.team[i]];
      c.x += this.x[i]; c.y += this.y[i]; c.n++;
    }
    for (const e of g.enemies) {
      if (!e.alive) continue;
      const c = this.centre[teamIndex(e.team)];
      c.x += e.x; c.y += e.y; c.n++;
    }
    if (g.player.alive) { const c = this.centre[TEAM_PLAYER]; c.x += g.player.x; c.y += g.player.y; c.n++; }
    for (const c of this.centre) if (c.n) { c.x /= c.n; c.y /= c.n; }
  }

  /** Nearest hostile in sight: minions via the grid, the knight and elites directly. */
  private pick(g: Game, i: number): Combatant | null {
    return this.pickIn(g, i, this.x[i], this.y[i], WAR.unitSight);
  }

  /**
   * The hostile nearest to unit i among those within r of (cx, cy). Follow and
   * Hold use this to keep the fight near the knight or the held spot.
   */
  private pickIn(g: Game, i: number, cx: number, cy: number, r: number): Combatant | null {
    const side = teamName(this.team[i]), own = this.team[i];
    const x = this.x[i], y = this.y[i], r2 = r * r;
    // behind walls only what can be walked to counts (a garrison behind a shut gate waits)
    const bt = g.battle, walled = bt.doors.length > 0;
    let best: Combatant | null = null, bd = Infinity;
    this.query(cx, cy, r, (j) => {
      if (this.team[j] === own) return;
      if ((this.x[j] - cx) ** 2 + (this.y[j] - cy) ** 2 > r2) return;
      const d = (this.x[j] - x) ** 2 + (this.y[j] - y) ** 2;
      if (d < bd && (!walled || bt.reachable(x, y, this.x[j], this.y[j]))) { bd = d; best = this.ref(j); }
    });
    for (const e of g.enemies) {
      if (!e.alive || e.team === side || (e.x - cx) ** 2 + (e.y - cy) ** 2 > r2) continue;
      const d = (e.x - x) ** 2 + (e.y - y) ** 2;
      if (d < bd && (!walled || bt.reachable(x, y, e.x, e.y))) { bd = d; best = e; }
    }
    const k = g.player;
    if (side === 'enemy' && k.alive && (k.x - cx) ** 2 + (k.y - cy) ** 2 <= r2 && (!walled || bt.reachable(x, y, k.x, k.y))) {
      const d = (k.x - x) ** 2 + (k.y - y) ** 2;
      if (d < bd) { bd = d; best = k; }
    }
    return best;
  }

  /** The area unit i may fight in under its side's order: [cx, cy, r], or null for anywhere in sight. */
  private leash(g: Game, i: number, order: Order): [number, number, number] | null {
    const d = this.def(i);
    if (order === 'follow') return [g.player.x, g.player.y, WAR.followRange + WAR.followEngage];
    if (order === 'hold') return [this.anchorX[i], this.anchorY[i], WAR.holdRadius + d.reach + d.radius];
    return null;
  }

  private think(g: Game, i: number, dt: number) {
    const d = this.def(i);
    const own = this.team[i];
    if (this.cd[i] > 0) this.cd[i] -= dt;

    // the player's side obeys the knight's order; the Dominion always charges
    const order: Order = own === TEAM_PLAYER ? g.order : 'charge';
    const zone = this.leash(g, i, order);

    // re-pick, staggered so ~1/10th of the units do it each frame
    let t = this.tgt[i];
    const due = (this.frame + i) % WAR.unitRetargetFrames === 0 || !t || !t.alive;
    if (!d.ignoresUnits) {
      const ft = order === 'focus' ? g.focusTarget() : null;
      if (ft) t = this.tgt[i] = ft;
      else if (due) {
        const found = zone ? this.pickIn(g, i, zone[0], zone[1], zone[2]) : this.pick(g, i);
        // no unit in sight: keep working on a structure rather than dropping it (and its windup) every re-pick
        if (found || !(t instanceof Structure) || !t.alive) t = this.tgt[i] = found;
      }
      // a target that has dragged the fight out of the order's area is let go
      if (t && zone && (t.x - zone[0]) ** 2 + (t.y - zone[1]) ** 2 > (zone[2] + 40) ** 2) t = this.tgt[i] = null;
    }

    const sp = d.speed;
    const steer = (tx: number, ty: number, mult: number) => {
      const a = Math.atan2(ty - this.y[i], tx - this.x[i]);
      const k = clamp(10 * dt, 0, 1);
      this.vx[i] += (Math.cos(a) * sp * mult - this.vx[i]) * k;
      this.vy[i] += (Math.sin(a) * sp * mult - this.vy[i]) * k;
      this.facing[i] = a;
      this.walk[i] += dt * sp * mult * 0.12;
    };
    const halt = () => { this.vx[i] *= 0.7; this.vy[i] *= 0.7; };
    /** Walk toward (tx, ty) through whatever doors lie between; false (and stand) if there is no way. */
    const go = (tx: number, ty: number, mult: number): boolean => {
      const w = g.battle.via(this.x[i], this.y[i], tx, ty);
      if (!w) { halt(); return false; }
      steer(w.x, w.y, mult);
      return true;
    };

    if (this.state[i] === ST_FLEE) {
      // routed: run for the side's own edge and leave the field there (cut off: slip away where it stands)
      const e = this.edge[own];
      const top = e.spread <= 40 && e.y < 80;   // a top edge (convoy) rather than a side
      const ex = top ? this.x[i] : e.x, ey = top ? e.y : this.y[i];
      if (!go(ex, ey, 1.2) || Math.abs(this.x[i] - ex) + Math.abs(this.y[i] - ey) < d.radius + 8) this.despawn(i);
      return;
    }

    if (!t || !t.alive) {
      this.wind[i] = 0;
      this.state[i] = ST_ADVANCE;
      if (order === 'follow' && !d.ignoresUnits) {
        // fall in around the knight, running to keep up when left behind
        const k = g.player, s = this.formationSpot(i, k.x, k.y);
        const far = dist(this.x[i], this.y[i], s.x, s.y);
        if (far > 18) go(s.x, s.y, far > 120 ? Math.max(1, (TUNING.moveSpeed * 1.05) / sp) : 1); else halt();
        return;
      }
      if (order === 'hold' && !d.ignoresUnits) {
        if (dist(this.x[i], this.y[i], this.anchorX[i], this.anchorY[i]) > 10) go(this.anchorX[i], this.anchorY[i], 1); else halt();
        return;
      }
      // Charge with no unit in sight: go for the objective (PLAN 11.4), if there is one.
      // Rams always do; so does the Dominion (in a defense: your houses).
      if ((own === TEAM_PLAYER && (order === 'charge' || order === 'focus')) || d.ignoresUnits || own === TEAM_ENEMY) {
        const st = g.battle.nearestStructure(teamName(own), this.x[i], this.y[i], !!d.ignoresUnits);
        if (st) { this.tgt[i] = st; return; }
      }
      // the Dominion holds its objective (the outpost's ring, the rescue cell)
      const gp = own === TEAM_ENEMY ? g.battle.guardPoint() : null;
      if (gp) {
        const s = this.formationSpot(i, gp.x, gp.y);
        if (dist(this.x[i], this.y[i], s.x, s.y) > 14) go(s.x, s.y, 1); else halt();
        return;
      }
      // otherwise march on the enemy's centre (behind a shut gate: stand)
      const c = this.centre[1 - own];
      if (c.n && dist(this.x[i], this.y[i], c.x, c.y) > 40) go(c.x, c.y, 1); else halt();
      return;
    }

    const dx = t.x - this.x[i], dy = t.y - this.y[i];
    const dd = Math.hypot(dx, dy);
    const reach = d.reach + d.radius + t.radius;

    if (this.wind[i] > 0) {
      // committed to the swing: stop, keep facing, land it at the end of the windup
      halt();
      this.facing[i] = Math.atan2(dy, dx);
      this.wind[i] -= dt;
      if (this.wind[i] <= 0) {
        this.wind[i] = 0;
        this.cd[i] = d.cooldown * rnd(0.85, 1.15);
        if (d.ranged) this.fireArrow(i, t);
        else if (dd <= reach * 1.25) g.unitStrike(this, i, t);
      }
      return;
    }

    if (dd > reach) {
      this.state[i] = ST_ADVANCE;
      go(t.x, t.y, 1);
    } else {
      this.state[i] = ST_FIGHT;
      halt();
      this.facing[i] = Math.atan2(dy, dx);
      if (this.cd[i] <= 0) this.wind[i] = d.windup;
    }
  }

  /** Push overlapping minions apart, and out of the knight and elites. */
  private separate(g: Game, dt: number) {
    const push = 90 * dt * 60;
    for (let i = 0; i < this.cap; i++) {
      if (!this.alive[i]) continue;
      const ri = this.def(i).radius;
      const xi = this.x[i], yi = this.y[i];
      this.query(xi, yi, ri + 20, (j) => {
        if (j <= i) return;
        const rj = this.def(j).radius;
        const dx = this.x[j] - xi, dy = this.y[j] - yi;
        const min = ri + rj;
        const d2 = dx * dx + dy * dy;
        if (d2 >= min * min || d2 < 0.0001) return;
        const d = Math.sqrt(d2), k = ((min - d) / min) * push * 0.5 / d;
        this.vx[i] -= dx * k; this.vy[i] -= dy * k;
        this.vx[j] += dx * k; this.vy[j] += dy * k;
      });
    }
    const bodies: { x: number; y: number; radius: number }[] = [];
    if (g.player.alive) bodies.push(g.player);
    for (const e of g.enemies) if (e.alive) bodies.push(e);
    for (const b of bodies) {
      this.query(b.x, b.y, b.radius + 24, (j) => {
        const dx = this.x[j] - b.x, dy = this.y[j] - b.y;
        const min = b.radius + this.def(j).radius;
        const d2 = dx * dx + dy * dy;
        if (d2 >= min * min || d2 < 0.0001) return;
        const d = Math.sqrt(d2), k = ((min - d) / min) * push / d;
        this.vx[j] += dx * k; this.vy[j] += dy * k;
      });
    }
  }

  /* --------------------------------------------------------------- damage */

  /**
   * Hit minion i. `angle` points from the attacker to the minion. Shieldbearers
   * cut frontal hits; rams shrug off knockback. Returns true if it died.
   */
  hurt(g: Game, i: number, dmg: number, angle: number, knockback: number, byKnight: boolean): boolean {
    if (!this.alive[i]) return false;
    const d = this.def(i);
    if (d.frontGuard && Math.abs(angleDiff(this.facing[i], angle + Math.PI)) < WAR.shieldFrontArc) {
      dmg = Math.max(1, Math.round(dmg * (1 - WAR.shieldFrontCut)));
    }
    this.hp[i] -= dmg;
    this.flash[i] = 0.1;
    if (!d.ignoresUnits) {
      this.vx[i] += Math.cos(angle) * knockback;
      this.vy[i] += Math.sin(angle) * knockback;
    }
    if (this.hp[i] > 0) return false;
    this.hp[i] = 0;
    this.alive[i] = 0;
    this.deadT[i] = 0;
    this.wind[i] = 0;
    this.liveCount[this.team[i]]--;
    g.onMinionDeath(this, i, byKnight);
    return true;
  }

  /* --------------------------------------------------------------- arrows */

  private fireArrow(i: number, t: Combatant) {
    if (this.arrows >= this.arrowCap) return;
    const k = this.arrows++;
    const a = Math.atan2(t.y - this.y[i], t.x - this.x[i]) + rnd(-0.05, 0.05);
    this.ax[k] = this.x[i]; this.ay[k] = this.y[i];
    this.avx[k] = Math.cos(a) * WAR.arrowSpeed; this.avy[k] = Math.sin(a) * WAR.arrowSpeed;
    this.alife[k] = (this.def(i).reach * 1.4) / WAR.arrowSpeed;
    this.admg[k] = this.atk[i];
    this.ateam[k] = this.team[i];
  }

  private updateArrows(g: Game, dt: number) {
    let k = 0;
    while (k < this.arrows) {
      this.ax[k] += this.avx[k] * dt;
      this.ay[k] += this.avy[k] * dt;
      this.alife[k] -= dt;
      if (this.alife[k] <= 0 || g.arrowHit(this, k)) {
        // swap-remove
        const last = --this.arrows;
        this.ax[k] = this.ax[last]; this.ay[k] = this.ay[last];
        this.avx[k] = this.avx[last]; this.avy[k] = this.avy[last];
        this.alife[k] = this.alife[last]; this.admg[k] = this.admg[last]; this.ateam[k] = this.ateam[last];
        continue;
      }
      k++;
    }
  }
}
