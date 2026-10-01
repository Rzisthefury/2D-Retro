/* =========================================================================
 * war.ts — the war state on the campaign map (PLAN 6, 7): the treasury's
 * income, convoys, castle garrisons and troop production, node upgrades and
 * the knight's warband. Ticks while the map is up (battles pause it).
 *
 * Armies on the road, the off-screen sim (Phase 8) and the Dominion's
 * campaign AI (Phase 9) build on this.
 * ========================================================================= */

/** A wagon of gold on the roads (PLAN 6). */
interface Convoy {
  id: number; team: Team;
  path: number[];       // node ids, from the village to the castle
  leg: number;          // index into path: travelling path[leg] -> path[leg + 1]
  t: number;            // 0..1 along that leg
  cargo: number;
}

/** Recruit mixes a castle can be set to (PLAN 6: default auto-balance 40/20/25/15). */
const RECRUIT_MIXES: { name: string; mix: { sword: number; spear: number; archer: number; shield: number } }[] = [
  { name: 'Balanced', mix: { sword: 0.4, spear: 0.2, archer: 0.25, shield: 0.15 } },
  { name: 'Infantry', mix: { sword: 0.55, spear: 0.3, archer: 0.05, shield: 0.1 } },
  { name: 'Archers', mix: { sword: 0.25, spear: 0.1, archer: 0.5, shield: 0.15 } },
  { name: 'Shield wall', mix: { sword: 0.3, spear: 0.2, archer: 0.15, shield: 0.35 } },
];

function troopTotal(r: Reserve): number { let n = 0; for (const k of UNIT_ORDER) n += r[k]; return n; }

class War {
  readonly camp: Campaign;
  time = 0;                                   // seconds of map time this campaign
  stock: number[];                            // villages: gold waiting for the next convoy
  convoyT: number[];                          // villages: seconds to the next convoy
  garrison: (Reserve | null)[];               // castles you hold: troops inside
  prod: number[];                             // castles: progress toward the next recruit
  sinceRam: number[];                         // castles: troops recruited since the last ram
  mix: number[];                              // castles: RECRUIT_MIXES index
  convoys: Convoy[] = [];
  nextConvoyId = 1;
  enemyConvoyT = 0;
  warband: Reserve = emptyReserve();          // the knight's own troops (PLAN 7.2)
  delivered = 0;                              // gold delivered by your convoys (for the HUD and checks)

  constructor(camp: Campaign) {
    this.camp = camp;
    const N = camp.nodes.length;
    this.stock = new Array(N).fill(0);
    this.convoyT = new Array(N).fill(WAR.convoyEvery);
    this.garrison = new Array(N).fill(null);
    this.prod = new Array(N).fill(0);
    this.sinceRam = new Array(N).fill(0);
    this.mix = new Array(N).fill(0);
    this.reset();
  }

  /** A fresh war: the Last Camp's garrison and a full warband. */
  reset() {
    this.time = 0;
    this.stock.fill(0); this.convoyT.fill(WAR.convoyEvery); this.prod.fill(0); this.sinceRam.fill(0); this.mix.fill(0);
    this.garrison.fill(null);
    this.convoys = [];
    this.enemyConvoyT = WAR.enemyConvoyEvery * 0.5;
    this.delivered = 0;
    for (const n of this.camp.nodes) if (n.owner === 'player' && n.type === 'castle') this.garrison[n.id] = this.recruitList(WAR.startGarrison, 0);
    this.warband = this.recruitList(WAR.warbandBase, 0);
  }

  /** n troops in a mix (no gold involved): for the start and for tests. */
  recruitList(n: number, mixIdx: number): Reserve {
    const r = emptyReserve();
    for (let k = 0; k < n; k++) r[this.nextType(r, mixIdx)]++;
    return r;
  }

  /** The type a castle recruits next: the one furthest under its share of the mix. */
  private nextType(r: Reserve, mixIdx: number): UnitType {
    const m = RECRUIT_MIXES[mixIdx].mix, tot = troopTotal(r) - r.ram + 1;
    let best: UnitType = 'sword', bd = -Infinity;
    for (const k of ['sword', 'spear', 'archer', 'shield'] as const) {
      const d = m[k] - r[k] / tot;
      if (d > bd) { bd = d; best = k; }
    }
    return best;
  }

  /* ------------------------------------------------------------- figures */

  static readonly INCOME = [20, 35, 55];          // PLAN 5.2 village gold / min
  static readonly PRODUCTION = [6, 10, 16];       // castle troops / min
  static readonly UPGRADE: Record<'village' | 'castle' | 'keep', number[]> = { village: [150, 400], castle: [300, 800], keep: [250, 700] };

  income(n: MapNode): number { return n.type === 'village' ? War.INCOME[n.level - 1] : 0; }
  production(n: MapNode): number { return n.type === 'castle' ? War.PRODUCTION[n.level - 1] : 0; }
  cap(n: MapNode): number { return WAR.castleGarrison[n.level - 1]; }

  /** Gold to raise a node a level (PLAN 5.2 x the tier multiplier), or 0 if it can't be. */
  upgradeCost(n: MapNode): number {
    if (n.type === 'outpost' || n.level >= 3) return 0;
    const t = this.camp.territories[n.territory];
    return Math.round(War.UPGRADE[n.type][n.level - 1] * WAR.tierCost[t.tier - 1]);
  }

  /** Raise a node you hold a level, paying from the treasury. */
  upgrade(n: MapNode, p: Player): boolean {
    const cost = this.upgradeCost(n);
    if (n.owner !== 'player' || !cost || p.gold < cost) return false;
    p.gold -= cost;
    n.level++;
    return true;
  }

  /** The warband's cap: 12, +3 per level-3 castle you hold (max +12); talents add in Phase 11. */
  warbandCap(): number {
    const l3 = this.camp.nodes.filter((n) => n.type === 'castle' && n.owner === 'player' && n.level === 3).length;
    return WAR.warbandBase + Math.min(WAR.l3WarbandMax, l3 * WAR.l3Warband);
  }

  /** Your castle nearest by road to node `from` (or -1). */
  nearestCastle(from: number, team: Team): number {
    const N = this.camp.nodes.length;
    let best = -1, bd = Infinity;
    for (const n of this.camp.nodes) {
      if (n.type !== 'castle' || n.owner !== team) continue;
      const d = this.camp.dist[from * N + n.id];
      if (d < bd) { bd = d; best = n.id; }
    }
    return best;
  }

  /** The road route between two nodes. */
  path(a: number, b: number): number[] {
    const N = this.camp.nodes.length, out = [a];
    let k = a;
    while (k !== b && out.length < N) { k = this.camp.hop[k * N + b]; if (k < 0) return []; out.push(k); }
    return out;
  }

  /** Where a convoy is on the map (on the road's bowed curve, as the map draws it). */
  convoyPos(c: Convoy): { x: number; y: number } {
    if (c.leg >= c.path.length - 1) { const n = this.camp.nodes[c.path[c.path.length - 1]]; return { x: n.x, y: n.y }; }
    return this.camp.roadPoint(c.path[c.leg], c.path[c.leg + 1], c.t);
  }

  /* ---------------------------------------------------------------- tick */

  /** Advance map time: income, convoys, production, the warband's refill. */
  tick(dt: number, p: Player) {
    this.time += dt;
    const camp = this.camp;
    for (const n of camp.nodes) {
      if (n.owner !== 'player') continue;
      if (n.type === 'village') {
        this.stock[n.id] = Math.min(WAR.villageStockCap, this.stock[n.id] + this.income(n) / 60 * dt);
        this.convoyT[n.id] -= dt;
        if (this.convoyT[n.id] <= 0) {
          this.convoyT[n.id] = WAR.convoyEvery;
          const to = this.nearestCastle(n.id, 'player'), cargo = Math.floor(this.stock[n.id]);
          if (to >= 0 && cargo > 0) {
            this.stock[n.id] -= cargo;
            this.convoys.push({ id: this.nextConvoyId++, team: 'player', path: this.path(n.id, to), leg: 0, t: 0, cargo });
          }
        }
      } else if (n.type === 'castle') {
        this.produce(n, dt, p);
      }
    }
    // the Dominion's convoys (its economy proper arrives with its campaign AI, Phase 9)
    this.enemyConvoyT -= dt;
    if (this.enemyConvoyT <= 0) {
      this.enemyConvoyT = WAR.enemyConvoyEvery;
      if (this.convoys.filter((c) => c.team === 'enemy').length < WAR.enemyConvoyMax) this.sendEnemyConvoy();
    }
    // convoys roll along their roads
    for (const c of this.convoys) {
      let move = WAR.convoySpeed * dt;
      while (move > 0 && c.leg < c.path.length - 1) {
        const a = camp.nodes[c.path[c.leg]], b = camp.nodes[c.path[c.leg + 1]];
        const len = Math.max(1, dist(a.x, a.y, b.x, b.y));
        const left = (1 - c.t) * len;
        if (move < left) { c.t += move / len; move = 0; } else { move -= left; c.leg++; c.t = 0; }
      }
    }
    for (const c of this.convoys) {
      if (c.leg < c.path.length - 1) continue;
      if (c.team === 'player') { p.gold += c.cargo; this.delivered += c.cargo; }
    }
    this.convoys = this.convoys.filter((c) => c.leg < c.path.length - 1);
    this.refillWarband();
  }

  /** PLAN 6: castles recruit continuously while there's gold, up to their cap; a ram every 30. */
  private produce(n: MapNode, dt: number, p: Player) {
    const g = this.garrison[n.id] || (this.garrison[n.id] = emptyReserve());
    if (troopTotal(g) >= this.cap(n)) { this.prod[n.id] = 0; return; }
    this.prod[n.id] = Math.min(1, this.prod[n.id] + this.production(n) / 60 * dt);
    while (this.prod[n.id] >= 1 && troopTotal(g) < this.cap(n)) {
      const kind: UnitType = this.sinceRam[n.id] >= WAR.ramEvery ? 'ram' : this.nextType(g, this.mix[n.id]);
      const cost = WAR.troopCost[kind];
      if (p.gold < cost) return;                   // waits for gold, progress held
      p.gold -= cost;
      g[kind]++;
      this.sinceRam[n.id] = kind === 'ram' ? 0 : this.sinceRam[n.id] + 1;
      this.prod[n.id] -= 1;
    }
  }

  /** The warband tops itself up from your castles' garrisons (biggest first) while you're on the map. */
  refillWarband() {
    let need = this.warbandCap() - troopTotal(this.warband);
    if (need <= 0) return;
    const castles = this.camp.nodes.filter((n) => n.type === 'castle' && n.owner === 'player' && this.garrison[n.id])
      .sort((a, b) => troopTotal(this.garrison[b.id]!) - troopTotal(this.garrison[a.id]!));
    for (const c of castles) {
      const g = this.garrison[c.id]!;
      while (need > 0 && troopTotal(g) > 0) {
        // take what the warband is shortest of, among what the castle has (rams stay home)
        let pick: UnitType | null = null, bd = -Infinity;
        for (const k of ['sword', 'spear', 'archer', 'shield'] as const) {
          if (!g[k]) continue;
          const d = RECRUIT_MIXES[0].mix[k] - this.warband[k] / (troopTotal(this.warband) + 1);
          if (d > bd) { bd = d; pick = k; }
        }
        if (!pick) break;
        g[pick]--; this.warband[pick]++; need--;
      }
      if (need <= 0) return;
    }
  }

  /**
   * A Dominion village sends its gold as tribute to the warlord: the Dominion's
   * highest-tier castle (the capital while it stands). *default*: long routes
   * that cross your frontier, so there's something to ambush.
   */
  private sendEnemyConvoy() {
    const camp = this.camp;
    const castles = camp.nodes.filter((n) => n.type === 'castle' && n.owner === 'enemy');
    if (!castles.length) return;
    const top = Math.max(...castles.map((n) => camp.territories[n.territory].tier));
    const seat = castles.find((n) => camp.territories[n.territory].tier === top)!;
    const villages = camp.nodes.filter((n) => n.type === 'village' && n.owner === 'enemy' && n.territory !== seat.territory);
    if (!villages.length) return;
    const v = villages[Math.floor(Math.random() * villages.length)];
    const to = seat.id, path = this.path(v.id, to);
    if (path.length < 2) return;
    const tier = camp.territories[v.territory].tier;
    this.convoys.push({ id: this.nextConvoyId++, team: 'enemy', path, leg: 0, t: 0, cargo: WAR.enemyConvoyCargo * tier });
  }

  /** A Dominion convoy you can reach: on a road touching a node you hold or can attack (the frontier). */
  canAmbush(c: Convoy): boolean {
    if (c.team !== 'enemy' || c.leg >= c.path.length - 1) return false;
    return [c.path[c.leg], c.path[c.leg + 1]].some((id) => {
      const n = this.camp.nodes[id];
      return n.owner === 'player' || this.camp.canAttack(n);
    });
  }

  /** The battle an ambush gives (PLAN 10.2: convoy ambush), carrying this convoy's cargo. */
  ambushSpec(c: Convoy): BattleSpec {
    const n = this.camp.nodes[c.path[c.leg]], t = this.camp.territories[n.territory];
    const spec = convoySpec();
    spec.name = `Convoy near ${n.name}`;
    spec.tier = t.tier; spec.scenery = t.scenery; spec.seed = 5000 + c.id * 31;
    spec.cargo = c.cargo; spec.convoyId = c.id;
    return spec;
  }

  /** Battle over: survivors are the warband again (a loss loses it, PLAN 10.1). */
  warbandBack(survivors: Reserve | null) {
    this.warband = survivors || emptyReserve();
    const cap = this.warbandCap();
    // over the cap (it can't be, but a save could say so): trim
    while (troopTotal(this.warband) > cap) {
      const k = UNIT_ORDER.reduce((a, b) => (this.warband[a] >= this.warband[b] ? a : b));
      this.warband[k]--;
    }
  }

  /** A node changed hands: a captured castle starts with an empty garrison, a village with an empty store. */
  onCapture(n: MapNode) {
    if (n.type === 'castle') { this.garrison[n.id] = emptyReserve(); this.prod[n.id] = 0; this.sinceRam[n.id] = 0; this.mix[n.id] = 0; }
    if (n.type === 'village') { this.stock[n.id] = 0; this.convoyT[n.id] = WAR.convoyEvery; }
  }

  /* --------------------------------------------------------------- saves */

  save(): object {
    const r = (x: Reserve | null) => x ? UNIT_ORDER.map((k) => x[k]) : null;
    return {
      time: Math.round(this.time), stock: this.stock.map((s) => Math.round(s)), convoyT: this.convoyT.map((s) => Math.round(s)),
      garrison: this.garrison.map(r), prod: this.prod.map((s) => +s.toFixed(2)), sinceRam: this.sinceRam, mix: this.mix,
      warband: r(this.warband), enemyConvoyT: Math.round(this.enemyConvoyT), delivered: this.delivered,
      convoys: this.convoys.map((c) => [c.team === 'player' ? 1 : 0, c.path, c.leg, +c.t.toFixed(3), c.cargo]),
    };
  }

  /** Restore, keeping only what fits this continent (PLAN 13: validate on load). */
  load(s: any) {
    this.reset();
    if (!s || typeof s !== 'object') return;
    const N = this.camp.nodes.length;
    const nums = (a: unknown, lo: number, hi: number) => Array.isArray(a) && a.length === N ? a.map((v) => clamp(+v || 0, lo, hi)) : null;
    const res = (a: unknown): Reserve | null => {
      if (!Array.isArray(a) || a.length !== UNIT_ORDER.length) return null;
      const r = emptyReserve(); UNIT_ORDER.forEach((k, i) => { r[k] = Math.max(0, a[i] | 0); }); return r;
    };
    this.time = Math.max(0, +s.time || 0);
    this.stock = nums(s.stock, 0, WAR.villageStockCap) || this.stock;
    this.convoyT = nums(s.convoyT, 0, WAR.convoyEvery) || this.convoyT;
    this.prod = nums(s.prod, 0, 1) || this.prod;
    this.sinceRam = nums(s.sinceRam, 0, WAR.ramEvery) || this.sinceRam;
    this.mix = (nums(s.mix, 0, RECRUIT_MIXES.length - 1) || this.mix).map((v) => v | 0);
    if (Array.isArray(s.garrison) && s.garrison.length === N) {
      this.garrison = s.garrison.map((g: unknown, i: number) => this.camp.nodes[i].type === 'castle' && this.camp.nodes[i].owner === 'player' ? res(g) || emptyReserve() : null);
    }
    const wb = res(s.warband); if (wb) this.warband = wb;
    this.enemyConvoyT = clamp(+s.enemyConvoyT || 0, 0, WAR.enemyConvoyEvery);
    this.delivered = Math.max(0, +s.delivered || 0);
    if (Array.isArray(s.convoys)) {
      for (const c of s.convoys) {
        if (!Array.isArray(c) || !Array.isArray(c[1]) || c[1].length < 2 || c[1].some((id: number) => !(id >= 0 && id < N))) continue;
        const path = c[1] as number[];
        if (!path.every((id, i) => i === 0 || this.camp.links[path[i - 1]].includes(id))) continue;
        this.convoys.push({ id: this.nextConvoyId++, team: c[0] === 1 ? 'player' : 'enemy', path, leg: clamp(c[2] | 0, 0, path.length - 2), t: clamp(+c[3] || 0, 0, 1), cargo: Math.max(0, c[4] | 0) });
      }
    }
  }
}
