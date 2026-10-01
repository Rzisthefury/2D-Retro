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

/** An army on the map (PLAN 7.2). Generals (Phase 10) are null for now. */
interface MapArmy {
  id: number; team: Team;
  general: string | null;
  units: Reserve;
  path: number[]; leg: number; t: number;   // along the roads, like a convoy
  target: number;                           // node id
  order: 'attack' | 'reinforce';
  fight: number;                            // the fight it's in, or -1
  gone?: boolean;
  offensive?: boolean;                      // a Dominion offensive (counts toward their cap, PLAN 8)
}

type Difficulty = 'easy' | 'normal' | 'hard';

/** One run's tallies for the victory screen (PLAN 13); reset by a new game and by NG+. */
interface RunStats {
  time: number;         // seconds played (map and map battles)
  won: number; lost: number;        // map battles; lost counts falls and retreats
  captured: number;     // nodes you took, live or by your armies
  recruited: number; defected: number; rescued: number;
  gold: number;         // all gold that came in
  troopsLost: number;   // your units killed in your battles
  bestCombo: number;
}

function freshStats(): RunStats {
  return { time: 0, won: 0, lost: 0, captured: 0, recruited: 0, defected: 0, rescued: 0, gold: 0, troopsLost: 0, bestCombo: 0 };
}

/** n units in the default mix, every type present (rams, hounds 0). */
function foeMixFull(n: number): Reserve { return { ...emptyReserve(), ...foeMix(n) }; }

/** An off-screen fight (PLAN 7.3): an army at a hostile node, or two armies on a road. */
class Fight {
  attackTeam: Team = 'player';
  tier = 1;
  startAtt = 0; startDef = 0;               // strengths when it began (a side breaks at 20%)
  lossA = 0; lossD = 0;                     // raw power lost but not yet a whole unit
  structure = 1;                            // node fights: the structures' remaining HP share
  over = false; winner: Team | null = null;
  joined = false;                           // the knight is fighting it live
  constructor(readonly id: number, readonly node: number, readonly x: number, readonly y: number, readonly attackers: number[], readonly defenders: number[]) {}
  static str(w: War, a: MapArmy, f: Fight): number { return War.strength(a.units, f.tier, w.mult(a.team, a.general)); }
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
  armies: MapArmy[] = [];
  fights: Fight[] = [];
  nextArmyId = 1; nextFightId = 1;
  nodeForce: (Reserve | null)[];              // defenders a node has now (null: its full garrison; worn down by fights)
  captured: number[] = [];                    // nodes that changed hands off-screen since the map last looked
  results: { fight: number; node: number; winner: Team; x: number; y: number }[] = [];   // fights decided since the map last looked
  // the Dominion's campaign (Phase 9)
  difficulty: Difficulty = 'normal';
  ng = 0;                                     // New Game+ cycle (PLAN 13): Dominion x1.5 and war clock x0.8 per cycle
  stats: RunStats = freshStats();
  enemyGold = 0;
  clock = 0;                                  // seconds to the next muster
  musters: { from: number; target: number; size: number; t: number; done?: boolean }[] = [];
  grace: number[] = [];                       // per territory: seconds no offensive may target it
  refill: number[] = [];                      // per node: progress to the next recruit back into a worn garrison
  won = false;                                // their capital has fallen
  events: { kind: 'muster' | 'depart' | 'attacked' | 'reinforce' | 'convoyLost' | 'won' | 'lowLoyalty' | 'captured' | 'rescued' | 'defected' | 'sp'; node: number; target: number; general?: string }[] = [];
  // generals (Phase 10)
  generals: General[] = [];
  loyaltyMult = 1;                            // Warlord's Presence (Phase 11): set by the game from the knight's talents
  talents: TalentSet = {};                    // the knight's (Phase 11): Command talents grow the warband and your troops
  // skill points from conquest (PLAN 12.2)
  spTaken: number[] = [];                     // castles and keeps whose first capture has paid (yours at the start count as paid)
  spPending = 0;                              // earned on the map, not yet handed to the knight (Game.syncWar)
  liveGenerals = new Set<string>();           // generals who fought beside the knight in the battle being settled

  constructor(camp: Campaign) {
    this.camp = camp;
    const N = camp.nodes.length;
    this.stock = new Array(N).fill(0);
    this.convoyT = new Array(N).fill(WAR.convoyEvery);
    this.garrison = new Array(N).fill(null);
    this.prod = new Array(N).fill(0);
    this.sinceRam = new Array(N).fill(0);
    this.mix = new Array(N).fill(0);
    this.nodeForce = new Array(N).fill(null);
    this.refill = new Array(N).fill(0);
    this.grace = new Array(camp.territories.length).fill(0);
    this.reset();
  }

  /** A fresh war: the Last Camp's garrison and a full warband. */
  reset() {
    this.time = 0;
    this.stock.fill(0); this.convoyT.fill(WAR.convoyEvery); this.prod.fill(0); this.sinceRam.fill(0); this.mix.fill(0);
    this.garrison.fill(null);
    this.convoys = [];
    this.armies = []; this.fights = []; this.captured = []; this.results = [];
    this.nodeForce.fill(null);
    this.refill.fill(0); this.grace.fill(0);
    this.enemyGold = 0; this.musters = []; this.won = false; this.events = [];
    this.stats = freshStats();
    this.spTaken = this.camp.nodes.filter((n) => n.owner === 'player' && (n.type === 'castle' || n.type === 'keep')).map((n) => n.id);
    this.spPending = 0;
    // every territory castle but yours and the warlord's has a Lord (PLAN 9.1)
    this.generals = this.camp.territories.filter((t) => t.id !== WAR.startTerritory && t.id !== WAR.capitalTerritory).map((t) => makeLord(t, this.camp.castleOf(t.id).id));
    this.clock = this.clockInterval();
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

  /** The warband's cap (PLAN 12.2): 12, + Command talents (max +36), +3 per level-3 castle you hold (max +12) = 60. */
  warbandCap(): number {
    const l3 = this.camp.nodes.filter((n) => n.type === 'castle' && n.owner === 'player' && n.level === 3).length;
    const t = this.talents, c = WAR.command;
    const talents = (t.banner ? c.banner : 0) + (t.muster ? c.muster : 0) + (t.host ? c.host : 0);
    return WAR.warbandBase + talents + Math.min(WAR.l3WarbandMax, l3 * WAR.l3Warband);
  }

  /** Your troops' Command talents as one sim multiplier: HP (Drillmaster, Grand Host) x damage (Sharpened Steel). */
  troopMult(): number {
    const t = this.talents, c = WAR.command;
    return (1 + (t.drill ? c.drill : 0) + (t.host ? c.hostHp : 0)) * (1 + (t.steel ? c.steel : 0));
  }

  /** SP the first time a castle or keep is yours (PLAN 12.2): 2 a castle (+4 the capital), 1 a keep. */
  private awardSP(n: MapNode) {
    if (n.owner !== 'player' || (n.type !== 'castle' && n.type !== 'keep') || this.spTaken.includes(n.id)) return;
    this.spTaken.push(n.id);
    const sp = n.type === 'keep' ? WAR.spKeep : WAR.spCastle + (n.territory === WAR.capitalTerritory ? WAR.spCapital : 0);
    this.spPending += sp;
    this.events.push({ kind: 'sp', node: n.id, target: sp });
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
    this.tickArmies(dt);
    this.tickAI(dt);
    for (const g of this.generals) {
      if (g.status === 'captive') {
        g.captiveT += dt;
        while (g.captiveT >= WAR.captiveDrainEvery) { g.captiveT -= WAR.captiveDrainEvery; this.loyalty(g, -1); }
      }
      if ((g.status === 'castle' || g.status === 'army' || g.status === 'captive') && g.loyalty <= 0) this.defect(g);
    }
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
    this.awardSP(n);
    if (n.owner === 'player') this.stats.captured++;
    // PLAN 8: grace - no offensive targets a territory for 90 s after you take its castle
    if (n.type === 'castle' && n.owner === 'player') this.grace[n.territory] = WAR.grace;
    if (n.type === 'castle') { this.garrison[n.id] = emptyReserve(); this.prod[n.id] = 0; this.sinceRam[n.id] = 0; this.mix[n.id] = 0; }
    if (n.type === 'village') { this.stock[n.id] = 0; this.convoyT[n.id] = WAR.convoyEvery; }
  }

  /* ------------------------------------------ the Dominion's campaign AI (Phase 9, PLAN 8) */

  /** Seconds between offensives (PLAN 8): by difficulty, 10% shorter per 3 territories you hold, floor 60%. */
  clockInterval(): number {
    const held = this.camp.territoriesHeld('player');
    return WAR.warClock[this.difficulty] * Math.max(WAR.warClockFloor, 1 - WAR.warClockStep * Math.floor(held / 3)) * Math.pow(WAR.ngClock, this.ng);
  }

  /** How many offensives may be under way at once: 1 + one per 4 territories you hold, cap 3 (Hard 4). */
  offensiveCap(): number {
    return Math.min(this.difficulty === 'hard' ? WAR.offensiveCapHard : WAR.offensiveCap, 1 + Math.floor(this.camp.territoriesHeld('player') / 4));
  }

  /** Offensives under way: mustering, marching or fighting. */
  activeOffensives(): number {
    return this.musters.length + this.armies.filter((a) => a.team === 'enemy' && a.offensive && !a.gone).length;
  }

  /** The node's defending strength, as the sim would field it (fortified). */
  nodeStrength(n: MapNode): number {
    return War.strength(this.defendersOf(n), this.camp.battleTier(n), this.fortification(n) * this.nodeMult(n));
  }

  /** The Dominion's next offensive: its best target and the castle that musters for it, or null. */
  planOffensive(): { from: number; target: number; size: number } | null {
    const camp = this.camp, N = camp.nodes.length;
    const value: Record<NodeType, number> = { castle: 5, keep: 3, village: 2, outpost: 1 };
    let best: { from: number; target: number; size: number } | null = null, bs = -Infinity;
    for (const n of camp.nodes) {
      if (n.owner !== 'player' || this.grace[n.territory] > 0) continue;
      if (this.musters.some((m) => m.target === n.id) || this.armies.some((a) => a.team === 'enemy' && a.offensive && a.target === n.id)) continue;
      // the nearest of their castles that can field an army
      let from = -1, fd = Infinity;
      for (const c of camp.nodes) {
        if (c.type !== 'castle' || c.owner !== 'enemy' || this.musters.some((m) => m.from === c.id)) continue;
        if (troopTotal(this.defendersOf(c)) < WAR.offensiveMin) continue;
        const d = camp.dist[c.id * N + n.id];
        if (d < fd) { fd = d; from = c.id; }
      }
      if (from < 0 || fd === Infinity) continue;
      const t = camp.territories[n.territory];
      const borders = t.nodes.some((m) => m.owner === 'enemy') || t.neighbors.some((k) => camp.territories[k].nodes.some((m) => m.owner === 'enemy'));
      const str = this.nodeStrength(n);
      const score = value[n.type] / Math.max(1, fd) / Math.max(1, str) * (borders ? WAR.borderPreference : 1);
      if (score > bs) { bs = score; best = { from, target: n.id, size: 0 }; }
    }
    if (!best) return null;
    // 70-110% of the target's defending strength, clamped by the mustering garrison
    const target = camp.nodes[best.target], src = this.defendersOf(camp.nodes[best.from]);
    const want = this.nodeStrength(target) * (WAR.offensiveSize[0] + Math.random() * (WAR.offensiveSize[1] - WAR.offensiveSize[0]));
    const perUnit = War.strength(foeMixFull(1), camp.battleTier(target), this.mult('enemy', null));
    best.size = clamp(Math.ceil(want / Math.max(0.01, perUnit)), WAR.offensiveMin, Math.floor(troopTotal(src) * WAR.offensiveDraw));
    return best;
  }

  /** Map time for the Dominion: income, refilling garrisons, the war clock, musters marching out. */
  private tickAI(dt: number) {
    const camp = this.camp;
    for (let k = 0; k < this.grace.length; k++) if (this.grace[k] > 0) this.grace[k] = Math.max(0, this.grace[k] - dt);
    if (this.won) return;
    if (camp.castleOf(WAR.capitalTerritory).owner === 'player') {
      // PLAN 8: the capital falls, the war is won, offensives stop
      this.won = true; this.musters = [];
      this.events.push({ kind: 'won', node: camp.castleOf(WAR.capitalTerritory).id, target: -1 });
      return;
    }
    // income: their villages, x difficulty; garrison refill comes first (PLAN 6)
    for (const n of camp.nodes) if (n.owner === 'enemy' && n.type === 'village') this.enemyGold += this.income(n) / 60 * dt * WAR.enemyIncome[this.difficulty];
    for (const n of camp.nodes) {
      if (n.owner !== 'enemy') continue;
      const g = this.nodeForce[n.id];
      if (!g) continue;                                    // still full
      const full = troopTotal(camp.foeForce(n));           // garrison + hound packs
      this.refill[n.id] = Math.min(1, this.refill[n.id] + WAR.enemyRefill / 60 * dt);
      while (this.refill[n.id] >= 1 && troopTotal(g) < full) {
        const k = this.nextType(g, 0), cost = WAR.troopCost[k];
        if (this.enemyGold < cost) break;
        this.enemyGold -= cost; g[k]++; this.refill[n.id] -= 1;
      }
      if (troopTotal(g) >= full) this.refill[n.id] = 0;
    }
    // musters march out 30 s after they're announced
    for (const m of this.musters) {
      m.t -= dt;
      if (m.t > 0) continue;
      const from = camp.nodes[m.from], to = camp.nodes[m.target];
      if (from.owner === 'enemy' && to.owner === 'player') {
        const g = this.defendersOf(from), units = emptyReserve();
        for (let k = 0; k < m.size && troopTotal(g) > 0; k++) {
          const type = (['sword', 'spear', 'archer', 'shield'] as UnitType[]).sort((a, b) => g[b] - g[a])[0];
          g[type]--; units[type]++;
        }
        // the warlord's own armies bring Thornhounds (PLAN 11.2)
        if (troopTotal(units) && from.territory === WAR.capitalTerritory) units.hound += WAR.warlordArmyPacks * WAR.houndPack;
        const a = troopTotal(units) ? this.spawnEnemyArmy(from.id, to.id, units) : null;
        if (a) { a.offensive = true; this.events.push({ kind: 'depart', node: from.id, target: to.id }); }
      }
      m.done = true;
    }
    this.musters = this.musters.filter((m) => !m.done);
    // the war clock
    this.clock -= dt;
    if (this.clock <= 0) {
      this.clock = this.clockInterval();
      if (this.activeOffensives() < this.offensiveCap()) {
        const o = this.planOffensive();
        if (o) {
          this.musters.push({ from: o.from, target: o.target, size: o.size, t: WAR.telegraph });
          this.events.push({ kind: 'muster', node: o.from, target: o.target });
        }
      }
    }
  }

  /** PLAN 8: when you besiege one of their castles, the nearest other castle may send one reinforcement. */
  private maybeReinforce(n: MapNode) {
    if (n.type !== 'castle' || n.owner !== 'enemy' || Math.random() >= WAR.reinforceChance) return;
    const camp = this.camp, N = camp.nodes.length;
    let from = -1, fd = Infinity;
    for (const c of camp.nodes) {
      if (c.type !== 'castle' || c.owner !== 'enemy' || c.id === n.id || troopTotal(this.defendersOf(c)) < WAR.offensiveMin * 2) continue;
      const d = camp.dist[c.id * N + n.id];
      if (d < fd) { fd = d; from = c.id; }
    }
    if (from < 0) return;
    const g = this.defendersOf(camp.nodes[from]), units = emptyReserve();
    for (const k of UNIT_ORDER) { units[k] = Math.floor(g[k] * WAR.reinforceDraw); g[k] -= units[k]; }
    const path = this.path(from, n.id);
    if (path.length < 2 || !troopTotal(units)) return;
    this.armies.push({ id: this.nextArmyId++, team: 'enemy', general: null, units, path, leg: 0, t: 0, target: n.id, order: 'reinforce', fight: -1 });
    this.events.push({ kind: 'reinforce', node: from, target: n.id });
  }

  /* --------------------------------------------- generals and loyalty (Phase 10, PLAN 9) */

  general(id: string | null): General | null { return id ? this.generals.find((g) => g.id === id) || null : null; }
  /** The Lord holding a Dominion castle, or null (the warlord's seat has none to recruit). */
  lordAt(node: number): General | null {
    let best: General | null = null;
    for (const g of this.generals) if (g.status === 'lord' && g.at === node && (!best || g.lordSince > best.lordSince)) best = g;
    return best;
  }
  /** Your general assigned to a castle, or null. */
  generalAt(node: number): General | null { return this.generals.find((g) => g.status === 'castle' && g.at === node) || null; }
  /** Generals in Dominion cells at a castle. */
  captivesAt(node: number): General[] { return this.generals.filter((g) => g.status === 'captive' && g.at === node); }
  /** Your generals (recruited, wherever they are). */
  mine(): General[] { return this.generals.filter((g) => g.status === 'reserve' || g.status === 'castle' || g.status === 'army' || g.status === 'captive'); }
  activeGenerals(): number { return this.generals.filter((g) => g.status === 'castle' || g.status === 'army').length; }
  /** PLAN 9.2: one active general per castle you hold, at most 8. */
  generalCap(): number { return Math.min(WAR.generalCap, this.camp.nodes.filter((n) => n.type === 'castle' && n.owner === 'player').length); }

  /** Loyalty moves (PLAN 9.4); gains x1.5 with Warlord's Presence. Warns once at 25 or under. */
  loyalty(g: General, delta: number) {
    if (delta > 0) delta *= this.loyaltyMult;
    g.loyalty = clamp(g.loyalty + delta, 0, 100);
    if (g.loyalty > WAR.loyaltyWarn) g.warned = false;
    else if (!g.warned) { g.warned = true; this.events.push({ kind: 'lowLoyalty', node: -1, target: -1, general: g.id }); }
  }

  /** A victory a general was part of: +6 (the knight beside them live: +12, PLAN 9.4) and a level. */
  private generalWon(g: General, live: boolean) {
    this.loyalty(g, live ? WAR.loyaltyWinTogether : WAR.loyaltyWin);
    g.level = Math.min(WAR.generalMaxLevel, g.level + 1);
  }

  /** A defeat with the general present: -10; their side broke, so they're taken (-15) to the nearest Dominion castle. */
  private generalLost(g: General, near: number) {
    this.loyalty(g, WAR.loyaltyDefeat);
    const cell = this.nearestCastle(near, 'enemy');
    g.army = -1;
    if (cell < 0) { g.status = 'reserve'; g.at = -1; return; }   // nowhere left to hold them
    g.status = 'captive'; g.at = cell; g.captiveT = 0;
    this.loyalty(g, WAR.loyaltyCaptured);
    this.events.push({ kind: 'captured', node: cell, target: -1, general: g.id });
  }

  /** Freed (PLAN 9.3): +25, back in the reserve. */
  rescue(g: General) {
    if (g.status !== 'captive') return;
    g.status = 'reserve'; g.at = -1; g.captiveT = 0;
    this.stats.rescued++;
    this.loyalty(g, WAR.loyaltyRescued);
    this.events.push({ kind: 'rescued', node: -1, target: -1, general: g.id });
  }

  /** A beaten Lord joins you (PLAN 9.1): loyalty 50, or 30 if they defected before. */
  recruit(g: General) {
    g.status = 'reserve'; g.at = -1; g.army = -1; g.warned = false;
    g.loyalty = g.recruited > 0 ? WAR.loyaltyReRecruit : WAR.loyaltyStart;
    g.recruited++;
    this.stats.recruited++;
  }

  /** Put a general in a castle of yours (or take them out with null). Respects the active cap. */
  assignCastle(node: number, id: string | null): boolean {
    const cur = this.generalAt(node);
    if (cur) { cur.status = 'reserve'; cur.at = -1; }
    if (!id) return true;
    const g = this.general(id);
    if (!g || g.status !== 'reserve' || this.activeGenerals() >= this.generalCap()) { if (cur) { cur.status = 'castle'; cur.at = node; } return false; }
    g.status = 'castle'; g.at = node;
    return true;
  }

  /** A general can lead or hold if they're in the reserve (and the cap allows), or already at `node`. */
  assignable(node: number): General[] {
    const room = this.activeGenerals() < this.generalCap();
    return this.generals.filter((g) => (g.status === 'reserve' && room) || (g.status === 'castle' && g.at === node));
  }

  /**
   * PLAN 9.4: at 0 loyalty a general defects (checked on the map, never mid-battle):
   * from a castle, the castle and its garrison go with them and they're its Lord again;
   * leading an army, the army goes over; held captive, they join the castle holding them.
   */
  defect(g: General) {
    const camp = this.camp;
    g.lordSince = 1 + Math.max(0, ...this.generals.map((x) => x.lordSince));
    this.stats.defected++;
    this.events.push({ kind: 'defected', node: g.at, target: -1, general: g.id });
    if (g.status === 'castle') {
      const n = camp.nodes[g.at];
      n.owner = 'enemy';
      this.nodeForce[n.id] = this.garrison[n.id] ? { ...this.garrison[n.id]! } : emptyReserve();
      this.garrison[n.id] = null;
      this.captured.push(n.id);
      g.status = 'lord';
    } else if (g.status === 'army') {
      const a = this.armies.find((x) => x.id === g.army);
      g.status = 'lord'; g.at = -1;
      if (a) {
        a.team = 'enemy'; a.offensive = false;
        const here = a.leg < a.path.length - 1 && a.t > 0.5 ? a.path[a.leg + 1] : a.path[a.leg];
        const to = this.nearestCastle(here, 'enemy');
        if (to >= 0 && a.fight < 0) { a.path = this.path(here, to); a.leg = 0; a.t = 0; a.target = to; a.order = 'reinforce'; }
        // the fight it was in changes sides with it
        const f = this.fights.find((x) => x.id === a.fight);
        if (f) { f.over = true; a.fight = -1; this.fights = this.fights.filter((x) => !x.over); }
      }
    } else if (g.status === 'captive') {
      g.status = 'lord';            // the castle holding them gets a Lord
    }
    g.army = -1;
  }

  /** Who leads a castle siege battle: the castle's Lord from the roster (the warlord's seat has its own). */
  dressCastle(spec: BattleSpec, n: MapNode) {
    if (n.type !== 'castle') return;
    const lord = this.lordAt(n.id);
    spec.lordId = lord ? lord.id : undefined;
    spec.lordName = lord ? lord.name : n.territory === WAR.capitalTerritory ? 'Warlord Garrick Thorne' : 'the Castellan';
    spec.warlord = !lord && n.territory === WAR.capitalTerritory;
  }

  /** PLAN 9.3: a rescue raid on the castle holding one of your generals, without taking it. */
  rescueSpecFor(n: MapNode, g: General): BattleSpec {
    const t = this.camp.territories[n.territory], s = rescueSpec();
    s.name = `${n.name} (cells)`; s.tier = this.camp.battleTier(n); s.scenery = t.scenery; s.seed = 11000 + n.id * 23;
    s.generalName = g.name; s.rescueId = g.id;
    this.dressCastle(s, n);
    return s;
  }

  /* ------------------------------------------------- armies (Phase 8, PLAN 7.2) */

  /** Strength (PLAN 7.3): sum of count x power x tier scale, x the side's multipliers. */
  static strength(u: Reserve, tier: number, mult: number): number {
    let s = 0;
    for (const k of UNIT_ORDER) s += u[k] * UNITS[k].power;
    return s * TIER_SCALING.hpMultiplier(tier) * mult;
  }

  /** Fortification of a node's defenders (PLAN 7.3). */
  fortification(n: MapNode): number {
    if (n.type === 'castle') return WAR.fortCastle + WAR.fortCastlePerLevel * n.level;
    if (n.type === 'keep') return WAR.keepFort[n.level - 1];
    return 1;
  }

  /** The Dominion's NG+ multiplier on their strength (PLAN 13): x1.5 per cycle. */
  ngMult(): number { return Math.pow(WAR.ngStats, this.ng); }

  /** An army's multiplier: x(1 + command) with a general, -20% without (PLAN 7.3); your troops' per-unit edge; NG+ theirs. */
  private sideMult(team: Team, general: string | null): number {
    const g = this.general(general);
    return (g ? 1 + command(g) : WAR.noGeneralMult) * (team === 'player' ? WAR.playerTroopMult * this.troopMult() : this.ngMult());
  }

  /** A node's defenders' multiplier (before fortification): x(1 + command) of its general or Lord. */
  nodeMult(n: MapNode): number {
    const g = n.owner === 'player' ? this.generalAt(n.id) : n.type === 'castle' ? this.lordAt(n.id) : null;
    return (g ? 1 + command(g) : 1) * (n.owner === 'player' ? WAR.playerTroopMult * this.troopMult() : this.ngMult());
  }

  /** Where an army is on the map. */
  armyPos(a: MapArmy): { x: number; y: number } {
    if (a.leg >= a.path.length - 1) { const n = this.camp.nodes[a.path[a.path.length - 1]]; return { x: n.x, y: n.y }; }
    return this.camp.roadPoint(a.path[a.leg], a.path[a.leg + 1], a.t);
  }

  /** The node an army stands at (fighting or arrived), or -1 while on a road. */
  private armyNode(a: MapArmy): number { return a.t === 0 ? a.path[a.leg] : -1; }

  /** Send troops from one of your castles: to an enemy node (attack) or one of your castles (reinforce). */
  sendArmy(from: MapNode, units: Reserve, target: MapNode, generalId: string | null = null): MapArmy | null {
    const g = this.garrison[from.id];
    if (!g || from.owner !== 'player' || from.id === target.id) return null;
    if (troopTotal(units) <= 0 || UNIT_ORDER.some((k) => units[k] > g[k])) return null;
    if (target.owner === 'player' && target.type !== 'castle') return null;
    const path = this.path(from.id, target.id);
    if (path.length < 2) return null;
    for (const k of UNIT_ORDER) g[k] -= units[k];
    const gen = this.general(generalId);
    const canLead = !!gen && (gen.status === 'reserve' ? this.activeGenerals() < this.generalCap() : gen.status === 'castle' && gen.at === from.id);
    const a: MapArmy = { id: this.nextArmyId++, team: 'player', general: canLead ? gen!.id : null, units: { ...units }, path, leg: 0, t: 0, target: target.id, order: target.owner === 'player' ? 'reinforce' : 'attack', fight: -1 };
    if (canLead) { gen!.status = 'army'; gen!.at = -1; gen!.army = a.id; }
    this.armies.push(a);
    return a;
  }

  /** A Dominion army marching from a node (Phase 9's AI decides when; the debug panel can send one). */
  spawnEnemyArmy(from: number, target: number, units: Reserve): MapArmy | null {
    const path = this.path(from, target);
    if (path.length < 2) return null;
    const a: MapArmy = { id: this.nextArmyId++, team: 'enemy', general: null, units: { ...units }, path, leg: 0, t: 0, target, order: 'attack', fight: -1 };
    this.armies.push(a);
    return a;
  }

  /** The units holding a node: your castles' garrisons, the Dominion's (reduced by fighting) garrisons. */
  defendersOf(n: MapNode): Reserve {
    if (n.owner === 'player') return n.type === 'castle' ? (this.garrison[n.id] || (this.garrison[n.id] = emptyReserve())) : (this.nodeForce[n.id] || (this.nodeForce[n.id] = emptyReserve()));
    return this.nodeForce[n.id] || (this.nodeForce[n.id] = this.camp.foeForce(n));
  }

  private fightAt(node: number): Fight | undefined { return this.fights.find((f) => f.node === node); }

  /** Armies march; arrivals and meetings start fights; fights run (PLAN 7.3). */
  private tickArmies(dt: number) {
    const camp = this.camp;
    for (const a of this.armies) {
      if (a.fight >= 0) continue;
      let move = WAR.armySpeed * dt;
      while (move > 0 && a.leg < a.path.length - 1) {
        const p = camp.nodes[a.path[a.leg]], q = camp.nodes[a.path[a.leg + 1]];
        const len = Math.max(1, dist(p.x, p.y, q.x, q.y)), left = (1 - a.t) * len;
        if (move < left) { a.t += move / len; move = 0; break; }
        move -= left; a.leg++; a.t = 0;
        if (this.arrive(a, camp.nodes[a.path[a.leg]])) break;
      }
    }
    this.armies = this.armies.filter((a) => !a.gone);
    // two hostile armies on the same road meet
    for (const a of this.armies) for (const b of this.armies) {
      if (a.team !== 'player' || b.team !== 'enemy' || a.fight >= 0 || b.fight >= 0) continue;
      const pa = this.armyPos(a), pb = this.armyPos(b);
      if (dist(pa.x, pa.y, pb.x, pb.y) < WAR.armyMeet) this.startFight({ node: -1, x: (pa.x + pb.x) / 2, y: (pa.y + pb.y) / 2, attackers: [a.id], defenders: [b.id] });
    }
    // their armies catch your convoys on the road (the cargo is lost)
    for (const c of this.convoys) {
      if (c.team !== 'player') continue;
      const cp = this.convoyPos(c);
      if (this.armies.some((a) => a.team === 'enemy' && !a.gone && a.fight < 0 && (() => { const q = this.armyPos(a); return dist(q.x, q.y, cp.x, cp.y) < WAR.armyMeet; })())) {
        c.leg = c.path.length;   // gone
        this.events.push({ kind: 'convoyLost', node: c.path[0], target: c.cargo });
      }
    }
    this.convoys = this.convoys.filter((c) => c.leg < c.path.length);
    for (const f of this.fights) this.simFight(f, dt);
    this.fights = this.fights.filter((f) => !f.over);
    this.armies = this.armies.filter((a) => !a.gone);
  }

  /** An army reaches a node on its path. Returns true if it stops there. */
  private arrive(a: MapArmy, n: MapNode): boolean {
    if (n.owner !== a.team) {
      // hostile: fight here (with any of its side already attacking it)
      const f = this.fightAt(n.id);
      if (f && f.attackTeam === a.team) {
        const lead = this.armies.find((x) => x.id === f.attackers[0])!;
        for (const k of UNIT_ORDER) lead.units[k] += a.units[k];
        f.startAtt += Fight.str(this, a, f);   // the newcomer counts toward the attackers' starting strength
        a.gone = true;
      } else if (!f) {
        this.startFight({ node: n.id, x: n.x, y: n.y, attackers: [a.id], defenders: [] });
      } else a.gone = true;   // a fight of the other side's (can't happen yet) — the army waits it out off the map
      return true;
    }
    if (n.id === a.target || a.leg >= a.path.length - 1) {
      this.settleAt(a, n);
      return true;
    }
    return false;
  }

  /** An army done at one of its own nodes: castles take it into the garrison; elsewhere it heads for the nearest castle. */
  private settleAt(a: MapArmy, n: MapNode) {
    if (n.type === 'castle') {
      const g = this.general(a.general);
      if (g && a.team === 'player' && g.status === 'army') { g.status = 'reserve'; g.army = -1; g.at = -1; }
      if (g && a.team === 'enemy' && g.status === 'lord' && g.at < 0) g.at = n.id;
      if (a.team === 'player') { const g = this.garrison[n.id] || (this.garrison[n.id] = emptyReserve()); for (const k of UNIT_ORDER) g[k] += a.units[k]; }
      else { const g = this.defendersOf(n); for (const k of UNIT_ORDER) g[k] += a.units[k]; }
      a.gone = true; return;
    }
    const to = this.nearestCastle(n.id, a.team);
    const path = to >= 0 ? this.path(n.id, to) : [];
    if (path.length < 2) { a.gone = true; return; }
    a.path = path; a.leg = 0; a.t = 0; a.target = to; a.order = 'reinforce';
  }

  private startFight(o: { node: number; x: number; y: number; attackers: number[]; defenders: number[] }) {
    const f = new Fight(this.nextFightId++, o.node, o.x, o.y, o.attackers, o.defenders);
    for (const id of [...o.attackers, ...o.defenders]) { const a = this.armies.find((x) => x.id === id); if (a) a.fight = f.id; }
    const att = this.armies.find((x) => x.id === o.attackers[0])!;
    f.attackTeam = att.team;
    f.tier = o.node >= 0 ? this.camp.battleTier(this.camp.nodes[o.node]) : this.camp.territories[this.camp.nodes[att.path[att.leg]].territory].tier;
    f.startAtt = Fight.str(this, att, f);
    f.startDef = this.defStrength(f);
    this.fights.push(f);
    if (o.node >= 0) {
      const n = this.camp.nodes[o.node];
      if (att.team === 'player') this.maybeReinforce(n);
      else if (n.owner === 'player') this.events.push({ kind: 'attacked', node: n.id, target: f.id });
    }
  }

  /** The defending side's strength: the node's holders (fortified) or the other army. */
  defStrength(f: Fight): number {
    if (f.node >= 0) {
      const n = this.camp.nodes[f.node];
      return War.strength(this.defendersOf(n), f.tier, this.fortification(n) * this.nodeMult(n));
    }
    const d = this.armies.find((x) => x.id === f.defenders[0]);
    return d ? Fight.str(this, d, f) : 0;
  }
  attStrength(f: Fight): number {
    const a = this.armies.find((x) => x.id === f.attackers[0]);
    return a ? Fight.str(this, a, f) : 0;
  }
  mult(team: Team, general: string | null): number { return this.sideMult(team, general); }

  /**
   * One stretch of an off-screen fight (PLAN 7.3): each side loses simRate x the
   * other's strength, taken from its cheapest units first (rams last); a side
   * under 20% of its starting strength breaks. Structures wear down as it goes.
   */
  private simFight(f: Fight, dt: number) {
    if (f.joined || f.over) return;
    const camp = this.camp;
    const att = this.armies.find((x) => x.id === f.attackers[0]);
    if (!att) { f.over = true; return; }
    const n = f.node >= 0 ? camp.nodes[f.node] : null;
    const defArmy = n ? null : this.armies.find((x) => x.id === f.defenders[0]) || null;
    const defUnits = n ? this.defendersOf(n) : defArmy ? defArmy.units : emptyReserve();
    const aMult = this.sideMult(att.team, att.general), dMult = n ? this.fortification(n) * this.nodeMult(n) : this.sideMult(defArmy!.team, defArmy!.general);
    const sA = War.strength(att.units, f.tier, aMult), sD = War.strength(defUnits, f.tier, dMult);
    const scale = TIER_SCALING.hpMultiplier(f.tier);
    f.lossA += WAR.simRate * sD * dt / (aMult * scale);
    f.lossD += WAR.simRate * sA * dt / (dMult * scale);
    f.lossA = War.takeLosses(att.units, f.lossA);
    f.lossD = War.takeLosses(defUnits, f.lossD);
    if (n) f.structure = Math.max(0, f.structure - WAR.simStructRate * dt * sA / Math.max(1, sA + sD));
    const nowA = War.strength(att.units, f.tier, aMult), nowD = War.strength(defUnits, f.tier, dMult);
    if (nowD <= f.startDef * WAR.simBreak) this.endFight(f, att.team);
    else if (nowA <= f.startAtt * WAR.simBreak) this.endFight(f, n ? n.owner : defArmy!.team);
  }

  /** Remove `points` of raw power from a force, cheapest units first, rams last. Returns the carry. */
  static takeLosses(u: Reserve, points: number): number {
    const order: UnitType[] = ['sword', 'spear', 'archer', 'shield', 'hound', 'ram'];
    for (const k of order) {
      while (u[k] > 0 && points >= UNITS[k].power) { u[k]--; points -= UNITS[k].power; }
      if (u[k] > 0) return points;
    }
    return 0;
  }

  /** A fight is decided: the winner keeps or takes the ground; the loser breaks (its army is gone). */
  endFight(f: Fight, winner: Team) {
    f.over = true; f.winner = winner;
    const camp = this.camp;
    const att = this.armies.find((x) => x.id === f.attackers[0]);
    // generals on your side (PLAN 9.4): the army's, and a castle's you defended
    const near = f.node >= 0 ? f.node : att ? att.path[att.leg] : 0;
    const involved: General[] = [];
    for (const id of [...f.attackers, ...f.defenders]) {
      const a = this.armies.find((x) => x.id === id), g = a && a.team === 'player' ? this.general(a.general) : null;
      if (g && g.status === 'army') involved.push(g);
    }
    if (f.node >= 0 && camp.nodes[f.node].owner === 'player') { const g = this.generalAt(f.node); if (g) involved.push(g); }
    for (const g of involved) {
      if (winner === 'player') this.generalWon(g, this.liveGenerals.has(g.id));
      else this.generalLost(g, near);
    }
    if (f.node >= 0 && att && winner === att.team && att.team === 'player') {
      // their castle falls: its Lord is gone (a siege won live may have recruited them already); its cells open
      const n = camp.nodes[f.node];
      const lord = this.lordAt(n.id); if (lord) { lord.status = 'gone'; lord.at = -1; }   // one beaten live first is recruited after (Game.finishBattle)
      for (const c of this.captivesAt(n.id)) this.rescue(c);
    }
    if (f.node >= 0) {
      const n = camp.nodes[f.node];
      if (att && winner === att.team) {
        // the node changes hands, a level down (PLAN 5.3); the attackers move in
        n.owner = att.team; n.level = Math.max(1, n.level - 1);
        this.onCapture(n);
        this.nodeForce[n.id] = null;   // a fresh holder: your castles keep their garrison in `garrison`; a node they retake starts full again (their refill is Phase 9)
        att.fight = -1; att.offensive = false;   // its offensive is done
        this.settleAt(att, n);
        this.captured.push(n.id);
      } else if (att) att.gone = true;
    } else {
      const def = this.armies.find((x) => x.id === f.defenders[0]);
      for (const a of [att, def]) if (a) { if (a.team === winner) a.fight = -1; else a.gone = true; }
    }
    this.results.push({ fight: f.id, node: f.node, winner, x: f.x, y: f.y });
  }

  /** Field battles: an enemy army inside or bordering your land can be intercepted (PLAN 7.1). */
  canIntercept(a: MapArmy): boolean {
    if (a.team !== 'enemy' || a.fight >= 0) return false;
    const ids = a.leg < a.path.length - 1 ? [a.path[a.leg], a.path[a.leg + 1]] : [a.path[a.leg]];
    return ids.some((id) => {
      const t = this.camp.territories[this.camp.nodes[id].territory];
      return t.nodes.some((m) => m.owner === 'player') || t.neighbors.some((k) => this.camp.holds(k, 'player'));
    });
  }

  /** A field battle against an army on the road (intercept) or with your army (a field fight you join). */
  fieldSpecFor(enemy: MapArmy, mine: MapArmy | null, tier: number): BattleSpec {
    const n = this.camp.nodes[enemy.path[enemy.leg]], t = this.camp.territories[n.territory];
    const foes = { ...enemy.units }, allies = mine ? { ...mine.units } : {};
    return {
      kind: 'field', name: `Dominion army near ${n.name}`, tier, scenery: t.scenery, seed: 7000 + enemy.id * 13,
      foes, foeElites: ['shade'], commander: 'bruiser', allies, armyId: enemy.id,
    };
  }

  /** Join a fight in progress (PLAN 7.3): the battle starts with its current counts and structure HP. */
  joinSpec(f: Fight): BattleSpec | null {
    const att = this.armies.find((x) => x.id === f.attackers[0]);
    if (!att) return null;
    if (f.node < 0) {
      const def = this.armies.find((x) => x.id === f.defenders[0]);
      if (!def) return null;
      const mine = att.team === 'player' ? att : def, theirs = att.team === 'player' ? def : att;
      const s = this.fieldSpecFor(theirs, mine, f.tier);
      s.fightId = f.id;
      if (mine.general) s.generalId = mine.general;
      return s;
    }
    const n = this.camp.nodes[f.node];
    if (att.team !== 'player') {
      // defending your node (PLAN 10.2: Defense) against the army at its gates; your garrison fights beside you
      if (n.owner !== 'player') return null;
      const t = this.camp.territories[n.territory], d = defenseSpec();
      d.name = `${n.name} (defense)`; d.tier = f.tier; d.scenery = t.scenery; d.seed = 9000 + n.id * 17;
      d.foes = { ...att.units }; d.reinforce = {}; d.allies = { ...this.defendersOf(n) }; d.commander = null;
      d.houses = n.type === 'village' ? 2 + n.level : 3;
      d.nodeId = n.id; d.fightId = f.id;
      const gen = this.generalAt(n.id); if (gen) d.generalId = gen.id;
      return d;
    }
    const s = this.camp.battleSpec(n);
    this.dressCastle(s, n);
    if (att.general) s.generalId = att.general;
    const d = this.defendersOf(n), full = troopTotal(this.camp.foeForce(n));
    s.foes = { ...d };
    // the battle's reinforcements shrink with the garrison the sim has already worn down
    const k = full > 0 ? troopTotal(d) / full : 1;
    s.reinforce = foeMix(Math.round(WAR.battleReinforce[s.kind] * clamp(k, 0, 1)));
    s.allies = { ...att.units };
    s.structure = f.structure;
    s.fightId = f.id;
    return s;
  }

  /**
   * A joined fight's battle is over (PLAN 7.3). Survivors carry over: your
   * army is who's left of it; their side keeps the share of each type that
   * survived the battle (`share`, 0..1),
   * the structures keep their damage; a win or loss decides it, leaving hands
   * it back to the sim. Returns the node captured, or -1.
   */
  resolveJoin(fightId: number, result: BattleResult, ally: Reserve, share: Reserve, structure: number): number {
    const f = this.fights.find((x) => x.id === fightId);
    if (!f) return -1;
    const att = this.armies.find((x) => x.id === f.attackers[0]);
    const def = f.node < 0 ? this.armies.find((x) => x.id === f.defenders[0]) : undefined;
    const mine = att && att.team === 'player' ? att : def, theirs = mine === att ? def : att;
    if (mine) mine.units = { ...ally };
    const cap = (u: Reserve) => { for (const k of UNIT_ORDER) u[k] = Math.round(u[k] * share[k]); };
    if (f.node >= 0 && att && att.team === 'player') cap(this.defendersOf(this.camp.nodes[f.node]));
    else if (f.node >= 0) {
      // you defended: your garrison is who's left of it; their army keeps its surviving share
      const g = this.defendersOf(this.camp.nodes[f.node]);
      for (const k of UNIT_ORDER) g[k] = ally[k];
      if (att) cap(att.units);
    }
    else if (theirs) cap(theirs.units);
    f.structure = clamp(structure, 0, 1);
    f.joined = false;
    let took = -1;
    if (result === 'win') { this.endFight(f, 'player'); if (f.node >= 0 && f.attackTeam === 'player' && this.camp.nodes[f.node].owner === 'player') took = f.node; }
    else if (result === 'lose') this.endFight(f, 'enemy');
    else { f.lossA = f.lossD = 0; }
    this.fights = this.fights.filter((x) => !x.over);
    this.armies = this.armies.filter((x) => !x.gone);
    this.results = this.results.filter((r) => r.fight !== f.id);   // the knight was there: no news banner
    this.captured = [];
    return took;
  }

  /** An intercept's battle is over: a win breaks the army, otherwise it marches on with what it has left. */
  resolveIntercept(armyId: number, result: BattleResult, share: Reserve) {
    const a = this.armies.find((x) => x.id === armyId);
    if (!a) return;
    if (result === 'win') { a.gone = true; this.armies = this.armies.filter((x) => !x.gone); return; }
    for (const k of UNIT_ORDER) a.units[k] = Math.round(a.units[k] * share[k]);
    if (troopTotal(a.units) === 0) this.armies = this.armies.filter((x) => x !== a);
  }

  /* --------------------------------------------------------------- saves */

  save(): object {
    const r = (x: Reserve | null) => x ? UNIT_ORDER.map((k) => x[k]) : null;
    return {
      time: Math.round(this.time), stock: this.stock.map((s) => Math.round(s)), convoyT: this.convoyT.map((s) => Math.round(s)),
      garrison: this.garrison.map(r), prod: this.prod.map((s) => +s.toFixed(2)), sinceRam: this.sinceRam, mix: this.mix,
      warband: r(this.warband), enemyConvoyT: Math.round(this.enemyConvoyT), delivered: this.delivered,
      convoys: this.convoys.map((c) => [c.team === 'player' ? 1 : 0, c.path, c.leg, +c.t.toFixed(3), c.cargo]),
      armies: this.armies.map((a) => [a.id, a.team === 'player' ? 1 : 0, UNIT_ORDER.map((k) => a.units[k]), a.path, a.leg, +a.t.toFixed(3), a.target, a.order === 'attack' ? 1 : 0, a.fight, a.general]),
      fights: this.fights.map((f) => [f.id, f.node, Math.round(f.x), Math.round(f.y), f.attackers, f.defenders, f.attackTeam === 'player' ? 1 : 0, f.tier, +f.startAtt.toFixed(2), +f.startDef.toFixed(2), +f.lossA.toFixed(3), +f.lossD.toFixed(3), +f.structure.toFixed(3)]),
      nodeForce: this.nodeForce.map(r),
      nextArmyId: this.nextArmyId, nextFightId: this.nextFightId,
      generals: this.generals.map((g) => [g.id, g.status, g.at, g.army, g.level, +g.loyalty.toFixed(2), +g.captiveT.toFixed(1), g.warned ? 1 : 0, g.recruited, g.lordSince]),
      ai: { difficulty: this.difficulty, gold: Math.round(this.enemyGold), clock: +this.clock.toFixed(1), won: this.won,
        musters: this.musters.map((m) => [m.from, m.target, m.size, +m.t.toFixed(1)]), grace: this.grace.map((g) => Math.round(g)), refill: this.refill.map((r) => +r.toFixed(2)),
        offensive: this.armies.filter((a) => a.offensive).map((a) => a.id) },
      sp: { taken: this.spTaken, pending: this.spPending },
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
    if (Array.isArray(s.nodeForce) && s.nodeForce.length === N) this.nodeForce = s.nodeForce.map((x: unknown) => res(x));
    const okPath = (path: unknown): path is number[] => Array.isArray(path) && path.length >= 2 && path.every((id: number, i: number) => id >= 0 && id < N && (i === 0 || this.camp.links[path[i - 1]].includes(id)));
    if (Array.isArray(s.armies)) {
      for (const a of s.armies) {
        if (!Array.isArray(a) || !okPath(a[3])) continue;
        const u = res(a[2]); if (!u) continue;
        const path = a[3] as number[];
        this.armies.push({ id: a[0] | 0, team: a[1] === 1 ? 'player' : 'enemy', general: typeof a[9] === 'string' ? a[9] : null, units: u, path, leg: clamp(a[4] | 0, 0, path.length - 1), t: clamp(+a[5] || 0, 0, 1), target: clamp(a[6] | 0, 0, N - 1), order: a[7] === 1 ? 'attack' : 'reinforce', fight: a[8] | 0 });
      }
    }
    if (Array.isArray(s.fights)) {
      for (const x of s.fights) {
        if (!Array.isArray(x) || !Array.isArray(x[4]) || !Array.isArray(x[5])) continue;
        const f = new Fight(x[0] | 0, clamp(x[1] | 0, -1, N - 1), +x[2] || 0, +x[3] || 0, x[4].map((v: number) => v | 0), x[5].map((v: number) => v | 0));
        f.attackTeam = x[6] === 1 ? 'player' : 'enemy'; f.tier = clamp(x[7] | 0, 1, 5);
        f.startAtt = +x[8] || 0; f.startDef = +x[9] || 0; f.lossA = +x[10] || 0; f.lossD = +x[11] || 0; f.structure = clamp(+x[12] || 0, 0, 1);
        if (f.attackers.every((id) => this.armies.some((a) => a.id === id))) this.fights.push(f);
      }
    }
    // an army that says it's fighting a fight that didn't load marches on
    for (const a of this.armies) if (a.fight >= 0 && !this.fights.some((f) => f.id === a.fight)) a.fight = -1;
    if (Array.isArray(s.generals)) {
      const statuses: GeneralStatus[] = ['lord', 'reserve', 'castle', 'army', 'captive', 'gone'];
      for (const row of s.generals) {
        if (!Array.isArray(row)) continue;
        const g = this.general(String(row[0]));
        if (!g || !statuses.includes(row[1])) continue;
        g.status = row[1]; g.at = clamp(row[2] | 0, -1, N - 1); g.army = row[3] | 0;
        g.level = clamp(row[4] | 0, 1, WAR.generalMaxLevel); g.loyalty = clamp(+row[5] || 0, 0, 100);
        g.captiveT = Math.max(0, +row[6] || 0); g.warned = row[7] === 1; g.recruited = Math.max(0, row[8] | 0); g.lordSince = Math.max(0, row[9] | 0);
      }
      // an army a general was leading that didn't load: they're back in the reserve
      for (const g of this.generals) if (g.status === 'army' && !this.armies.some((a) => a.id === g.army && a.general === g.id)) { g.status = 'reserve'; g.army = -1; }
    }
    if (s.ai && typeof s.ai === 'object') {
      const ai = s.ai;
      if (ai.difficulty === 'easy' || ai.difficulty === 'normal' || ai.difficulty === 'hard') this.difficulty = ai.difficulty;
      this.enemyGold = Math.max(0, +ai.gold || 0);
      this.clock = clamp(+ai.clock || 0, 0, WAR.warClock.easy);
      this.won = !!ai.won;
      if (Array.isArray(ai.musters)) for (const m of ai.musters) if (Array.isArray(m) && m[0] >= 0 && m[0] < N && m[1] >= 0 && m[1] < N) this.musters.push({ from: m[0] | 0, target: m[1] | 0, size: Math.max(0, m[2] | 0), t: clamp(+m[3] || 0, 0, WAR.telegraph) });
      if (Array.isArray(ai.grace) && ai.grace.length === this.grace.length) this.grace = ai.grace.map((g: number) => clamp(+g || 0, 0, WAR.grace));
      if (Array.isArray(ai.refill) && ai.refill.length === N) this.refill = ai.refill.map((r: number) => clamp(+r || 0, 0, 1));
      if (Array.isArray(ai.offensive)) for (const a of this.armies) if (ai.offensive.includes(a.id)) a.offensive = true;
    }
    if (s.sp && Array.isArray(s.sp.taken)) {
      for (const id of s.sp.taken) if (id >= 0 && id < N && !this.spTaken.includes(id | 0)) this.spTaken.push(id | 0);
      this.spPending = Math.max(0, s.sp.pending | 0);
    }
    this.nextArmyId = Math.max(1, +s.nextArmyId || 1, ...this.armies.map((a) => a.id + 1));
    this.nextFightId = Math.max(1, +s.nextFightId || 1, ...this.fights.map((f) => f.id + 1));
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
