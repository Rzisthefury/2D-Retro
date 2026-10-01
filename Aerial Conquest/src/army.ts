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
  type: Uint8Array; team: Uint8Array; state: Uint8Array; alive: Uint8Array; used: Uint8Array;
  uid: Uint32Array;
  tgt: (Combatant | null)[];
  private refs: (MinionRef | null)[];
  private freeList: number[] = [];
  private nextUid = 1;
  private frame = 0;
  liveCount = [0, 0];
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
    this.arrows = 0;
    this.head.fill(-1);
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
    for (let i = 0; i < this.cap; i++) {
      if (!this.alive[i]) continue;
      this.x[i] += this.vx[i] * dt;
      this.y[i] += this.vy[i] * dt;
      const r = this.def(i).radius;
      this.x[i] = clamp(this.x[i], f.x + r, f.x + f.w - r);
      this.y[i] = clamp(this.y[i], f.y + r, f.y + f.h - r);
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
    const side = teamName(this.team[i]);
    const x = this.x[i], y = this.y[i], sight = WAR.unitSight;
    let best: Combatant | null = null, bd = sight * sight;
    const j = this.nearestHostile(side, x, y, sight);
    if (j >= 0) { best = this.ref(j); bd = (this.x[j] - x) ** 2 + (this.y[j] - y) ** 2; }
    for (const e of g.enemies) {
      if (!e.alive || e.team === side) continue;
      const d = (e.x - x) ** 2 + (e.y - y) ** 2;
      if (d < bd) { bd = d; best = e; }
    }
    const k = g.player;
    if (side === 'enemy' && k.alive) {
      const d = (k.x - x) ** 2 + (k.y - y) ** 2;
      if (d < bd) { bd = d; best = k; }
    }
    return best;
  }

  private think(g: Game, i: number, dt: number) {
    const d = this.def(i);
    const own = this.team[i];
    if (this.cd[i] > 0) this.cd[i] -= dt;

    // re-pick, staggered so ~1/10th of the units do it each frame
    let t = this.tgt[i];
    if (!d.ignoresUnits && ((this.frame + i) % WAR.unitRetargetFrames === 0 || !t || !t.alive)) {
      t = this.tgt[i] = this.pick(g, i);
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

    if (this.state[i] === ST_FLEE) {
      const c = this.centre[1 - own];
      steer(this.x[i] * 2 - c.x, this.y[i] * 2 - c.y, 1.1);
      return;
    }

    if (!t || !t.alive) {
      // nothing in sight: march on the enemy's centre (rams always do)
      this.wind[i] = 0;
      this.state[i] = ST_ADVANCE;
      const c = this.centre[1 - own];
      if (c.n && dist(this.x[i], this.y[i], c.x, c.y) > 40) steer(c.x, c.y, 1); else halt();
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
      steer(t.x, t.y, 1);
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
