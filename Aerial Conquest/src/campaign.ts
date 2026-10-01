/* =========================================================================
 * campaign.ts — the continent (PLAN 4, 5, 7): territories, nodes, roads,
 * who holds what, and the battle each node gives when attacked.
 *
 * The layout is hand-authored data (CONTINENT): a 5x4 grid of border
 * vertices, twelve territories between them, the nodes inside each and the
 * roads joining them. Borders and coast get a fixed wiggle per edge so they
 * read as drawn lines, not a grid; the wiggle is a function of the edge,
 * so both sides of a border always agree.
 * ========================================================================= */

type NodeType = 'castle' | 'keep' | 'village' | 'outpost';

const CONTINENT = {
  w: 2400, h: 1500,
  vertices: [
    [190, 270], [690, 150], [1240, 200], [1760, 130], [2230, 250],
    [130, 610], [730, 540], [1200, 610], [1800, 520], [2290, 630],
    [170, 1010], [650, 1000], [1280, 960], [1720, 1040], [2260, 990],
    [260, 1330], [700, 1400], [1230, 1360], [1810, 1390], [2170, 1300],
  ],
  territories: [
    { id: 0, name: "Last Camp", tier: 1, scenery: 'forest', corners: [10, 11, 16, 15] },
    { id: 1, name: "Millbrook Vale", tier: 1, scenery: 'forest', corners: [11, 12, 17, 16] },
    { id: 2, name: "Greywatch March", tier: 1, scenery: 'coast', corners: [5, 6, 11, 10] },
    { id: 3, name: "Saltmarsh", tier: 2, scenery: 'coast', corners: [12, 13, 18, 17] },
    { id: 4, name: "Hollin Reach", tier: 2, scenery: 'forest', corners: [6, 7, 12, 11] },
    { id: 5, name: "Thornwall", tier: 2, scenery: 'coast', corners: [0, 1, 6, 5] },
    { id: 6, name: "Ashfen", tier: 3, scenery: 'coast', corners: [13, 14, 19, 18] },
    { id: 7, name: "Briarholt", tier: 3, scenery: 'forest', corners: [7, 8, 13, 12] },
    { id: 8, name: "Ravenmoor", tier: 3, scenery: 'ruins', corners: [1, 2, 7, 6] },
    { id: 9, name: "Stonecrown", tier: 4, scenery: 'ruins', corners: [8, 9, 14, 13] },
    { id: 10, name: "Duskhollow", tier: 4, scenery: 'ruins', corners: [2, 3, 8, 7] },
    { id: 11, name: "Thorne's Seat", tier: 5, scenery: 'ruins', corners: [3, 4, 9, 8] },
  ],
  // [id, type, territory, x, y, name]
  nodes: [
    [0, 'castle', 0, 444, 1178, "The Last Camp"],
    [1, 'village', 0, 534, 1279, "Emberfield"],
    [2, 'castle', 1, 977, 1163, "Millbrook Castle"],
    [3, 'keep', 1, 810, 1118, "Millbrook Keep"],
    [4, 'outpost', 1, 1135, 1057, "Millbrook Watch"],
    [5, 'village', 1, 855, 1300, "Ashby"],
    [6, 'village', 1, 1088, 1251, "Fennick"],
    [7, 'castle', 2, 420, 790, "Greywatch Castle"],
    [8, 'keep', 2, 283, 717, "Greywatch Keep"],
    [9, 'outpost', 2, 586, 654, "Greywatch Watch"],
    [10, 'village', 2, 283, 908, "Oakhurst"],
    [11, 'village', 2, 538, 887, "Corran"],
    [12, 'village', 2, 438, 651, "Hale"],
    [13, 'castle', 3, 1531, 1205, "Saltmarsh Castle"],
    [14, 'keep', 3, 1406, 1269, "Saltmarsh Keep"],
    [15, 'outpost', 3, 1647, 1302, "Saltmarsh Watch"],
    [16, 'village', 3, 1391, 1089, "Wyle"],
    [17, 'village', 3, 1631, 1129, "Brackwater"],
    [18, 'village', 3, 1504, 1075, "Elmstead"],
    [19, 'castle', 4, 975, 850, "Hollin Castle"],
    [20, 'keep', 4, 1094, 706, "Hollin Keep"],
    [21, 'outpost', 4, 824, 651, "Hollin Watch"],
    [22, 'village', 4, 1140, 900, "Pellow"],
    [23, 'village', 4, 800, 905, "Rook's End"],
    [24, 'village', 4, 955, 647, "Tamsin"],
    [25, 'castle', 5, 424, 380, "Thornwall Castle"],
    [26, 'keep', 5, 575, 300, "Thornwall Keep"],
    [27, 'outpost', 5, 292, 321, "Thornwall Watch"],
    [28, 'village', 5, 548, 478, "Larkfield"],
    [29, 'village', 5, 308, 484, "Dunmore"],
    [30, 'castle', 6, 1972, 1196, "Ashfen Castle"],
    [31, 'keep', 6, 2071, 1243, "Ashfen Keep"],
    [32, 'outpost', 6, 1894, 1292, "Ashfen Watch"],
    [33, 'village', 6, 2108, 1093, "Kestrel"],
    [34, 'village', 6, 1864, 1130, "Morrow"],
    [35, 'village', 6, 1990, 1081, "Westerby"],
    [36, 'castle', 7, 1489, 765, "Briarholt Castle"],
    [37, 'keep', 7, 1643, 695, "Briarholt Keep"],
    [38, 'outpost', 7, 1342, 675, "Briarholt Watch"],
    [39, 'village', 7, 1595, 913, "Hollowmere"],
    [40, 'village', 7, 1393, 863, "Brindle"],
    [41, 'castle', 8, 965, 375, "Ravenmoor Castle"],
    [42, 'keep', 8, 1096, 309, "Ravenmoor Keep"],
    [43, 'outpost', 8, 816, 248, "Ravenmoor Watch"],
    [44, 'village', 8, 1092, 496, "Cobb's Ford"],
    [45, 'village', 8, 847, 455, "Ilsley"],
    [46, 'village', 8, 954, 246, "Marrow"],
    [47, 'castle', 9, 1995, 812, "Stonecrown Castle"],
    [48, 'keep', 9, 2110, 899, "Stonecrown Keep"],
    [49, 'outpost', 9, 1875, 922, "Stonecrown Watch"],
    [50, 'village', 9, 2151, 714, "Ventry"],
    [51, 'village', 9, 1897, 691, "Quell"],
    [52, 'village', 9, 2034, 663, "Sorrel"],
    [53, 'castle', 10, 1489, 351, "Duskhollow Castle"],
    [54, 'keep', 10, 1642, 273, "Duskhollow Keep"],
    [55, 'outpost', 10, 1349, 274, "Duskhollow Watch"],
    [56, 'village', 10, 1616, 460, "Aldmoor"],
    [57, 'village', 10, 1373, 463, "Glint"],
    [58, 'castle', 11, 2020, 382, "The Black Seat"],
    [59, 'keep', 11, 2150, 300, "Thorne's Keep"],
    [60, 'outpost', 11, 1873, 242, "Thorne's Watch"],
    [61, 'village', 11, 2185, 560, "Harrow"],
    [62, 'village', 11, 1916, 448, "Yarrow"],
    [63, 'village', 11, 1995, 257, "Wren"],
  ] as [number, NodeType, number, number, number, string][],
  roads: [
    [0, 1], [0, 11], [1, 3], [2, 3], [2, 5], [2, 6], [3, 23], [4, 6], [6, 14], [7, 8],
    [7, 10], [7, 11], [7, 12], [9, 12], [11, 23], [12, 28], [13, 14], [13, 16], [13, 17], [13, 18],
    [15, 17], [17, 34], [18, 39], [19, 20], [19, 22], [19, 23], [19, 24], [21, 24], [22, 40], [24, 44],
    [25, 26], [25, 28], [25, 29], [27, 29], [28, 45], [30, 31], [30, 33], [30, 34], [30, 35], [32, 34],
    [33, 48], [36, 37], [36, 39], [36, 40], [37, 51], [37, 56], [38, 40], [41, 42], [41, 44], [41, 45],
    [41, 46], [43, 46], [44, 57], [47, 48], [47, 50], [47, 51], [47, 52], [49, 51], [52, 61], [53, 54],
    [53, 56], [53, 57], [55, 57], [56, 62], [58, 59], [58, 61], [58, 62], [58, 63], [60, 63],
  ] as [number, number][],
  /** Rivers, as polylines from the hills to the sea. */
  rivers: [
    [[1250, 640], [1190, 790], [1250, 930], [1185, 1110], [1240, 1260], [1215, 1440]],
    [[1810, 690], [1930, 560], [2020, 420], [2140, 300], [2290, 170]],
    [[560, 420], [420, 520], [330, 640], [190, 700], [80, 720]],
  ] as [number, number][][],
};

/** Name parts for castle Lords and keep Captains (placeholders, PLAN 17). */
const LORD_NAMES = ['Edric', 'Maud', 'Osric', 'Ysolde', 'Cedran', 'Aveline', 'Garrow', 'Brannoc', 'Sabine', 'Torvald', 'Rhoswen', 'Garrick'];
const CAPTAIN_NAMES = ['Varn', 'Hesk', 'Mora', 'Dain', 'Ulla', 'Breck', 'Sorn', 'Kett', 'Ivo', 'Teal', 'Grue', 'Nell'];

interface Territory {
  id: number; name: string; tier: number; scenery: Scenery;
  corners: number[];
  poly: { x: number; y: number }[];   // the border, wiggled
  cx: number; cy: number;             // label spot
  nodes: MapNode[];
  neighbors: number[];
}

interface MapNode {
  id: number; type: NodeType; territory: number;
  x: number; y: number; name: string;
  owner: Team; level: number;
}

class Campaign {
  territories: Territory[] = [];
  nodes: MapNode[] = [];
  roads: [number, number][] = CONTINENT.roads;
  /** Road graph: neighbours of each node. */
  links: number[][] = [];
  /** Shortest road distance between any two nodes (Floyd–Warshall at load), and the next hop. */
  dist: Float32Array;
  hop: Int16Array;
  /** Coast edges (border edges with sea on one side), as wiggled polylines. */
  coast: { x: number; y: number }[][] = [];
  /** Inner borders, as wiggled polylines with the two territories they part. */
  borders: { pts: { x: number; y: number }[]; a: number; b: number }[] = [];

  constructor() {
    const V = CONTINENT.vertices;
    // which territories use each edge
    const edgeUse = new Map<string, number[]>();
    const key = (a: number, b: number) => a < b ? `${a}-${b}` : `${b}-${a}`;
    for (const t of CONTINENT.territories) {
      for (let k = 0; k < 4; k++) {
        const a = t.corners[k], b = t.corners[(k + 1) % 4], kk = key(a, b);
        if (!edgeUse.has(kk)) edgeUse.set(kk, []);
        edgeUse.get(kk)!.push(t.id);
      }
    }
    const edgePts = new Map<string, { x: number; y: number }[]>();
    for (const [kk, users] of edgeUse) {
      const [a, b] = kk.split('-').map(Number);
      const pts = Campaign.wiggle(V[a], V[b], a * 31 + b * 17, users.length === 1);
      edgePts.set(kk, pts);
      if (users.length === 1) this.coast.push(pts);
      else this.borders.push({ pts, a: users[0], b: users[1] });
    }
    for (const t of CONTINENT.territories) {
      const poly: { x: number; y: number }[] = [];
      for (let k = 0; k < 4; k++) {
        const a = t.corners[k], b = t.corners[(k + 1) % 4];
        let pts = edgePts.get(key(a, b))!;
        if (a > b) pts = pts.slice().reverse();
        for (let i = 0; i < pts.length - 1; i++) poly.push(pts[i]);
      }
      const cx = t.corners.reduce((s, v) => s + V[v][0], 0) / 4, cy = t.corners.reduce((s, v) => s + V[v][1], 0) / 4;
      const neighbors: number[] = [];
      for (const [, users] of edgeUse) if (users.length === 2 && users.includes(t.id)) neighbors.push(users[0] === t.id ? users[1] : users[0]);
      this.territories.push({ id: t.id, name: t.name, tier: t.tier, scenery: t.scenery as Scenery, corners: t.corners, poly, cx, cy, nodes: [], neighbors });
    }
    for (const [id, type, tr, x, y, name] of CONTINENT.nodes) {
      const n: MapNode = { id, type, territory: tr, x, y, name, owner: 'enemy', level: 1 };
      this.nodes.push(n);
      this.territories[tr].nodes.push(n);
    }
    // label spots: where the name's box (as drawn at the whole-continent zoom) covers the fewest node
    // icons, then nearest the middle. ~7 px a letter at 10 px bold Georgia; icons ~15 px across at that zoom.
    const fit = Math.min(VIEW_W / CONTINENT.w, VIEW_H / CONTINENT.h);
    for (const t of this.territories) {
      const hw = (t.name.length * 7 + 8) / fit / 2, hh = 22 / fit / 2, icon = 15 / fit;
      let best = { x: t.cx, y: t.cy }, bs = Infinity;
      for (let i = -8; i <= 8; i++) for (let j = -8; j <= 8; j++) {
        const x = t.cx + i * 28, y = t.cy + j * 24;
        if (![[x - hw, y - hh], [x + hw, y - hh], [x - hw, y + hh], [x + hw, y + hh]].every(([px, py]) => Campaign.inPoly(px, py, t.poly))) continue;
        let hits = 0;
        for (const n of this.nodes) {
          const dx = Math.max(0, Math.abs(n.x - x) - hw), dy = Math.max(0, Math.abs(n.y - 4 - y) - hh);
          if (dx * dx + dy * dy < icon * icon) hits++;
        }
        // ...and, softly, away from the border (so a name never reads as its neighbour's)
        let edge = Infinity;
        for (const q of t.poly) edge = Math.min(edge, Math.hypot((q.x - x) * 0.5, q.y - y));
        const score = hits * 1e6 + Math.hypot(x - t.cx, y - t.cy) - 3 * Math.min(edge, 160);
        if (score < bs) { bs = score; best = { x, y }; }
      }
      t.cx = best.x; t.cy = best.y;
    }
    // roads: adjacency, then all-pairs shortest paths
    const N = this.nodes.length;
    this.links = this.nodes.map(() => []);
    this.dist = new Float32Array(N * N).fill(Infinity);
    this.hop = new Int16Array(N * N).fill(-1);
    for (let i = 0; i < N; i++) { this.dist[i * N + i] = 0; this.hop[i * N + i] = i; }
    for (const [a, b] of this.roads) {
      this.links[a].push(b); this.links[b].push(a);
      const d = dist(this.nodes[a].x, this.nodes[a].y, this.nodes[b].x, this.nodes[b].y);
      this.dist[a * N + b] = this.dist[b * N + a] = d;
      this.hop[a * N + b] = b; this.hop[b * N + a] = a;
    }
    for (let k = 0; k < N; k++) for (let i = 0; i < N; i++) {
      const ik = this.dist[i * N + k];
      if (ik === Infinity) continue;
      for (let j = 0; j < N; j++) {
        const d = ik + this.dist[k * N + j];
        if (d < this.dist[i * N + j]) { this.dist[i * N + j] = d; this.hop[i * N + j] = this.hop[i * N + k]; }
      }
    }
    this.reset();
  }

  /** Is (x, y) inside the polygon? */
  static inPoly(x: number, y: number, poly: { x: number; y: number }[]): boolean {
    let inside = false;
    for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
      const a = poly[i], b = poly[j];
      if ((a.y > y) !== (b.y > y) && x < ((b.x - a.x) * (y - a.y)) / (b.y - a.y) + a.x) inside = !inside;
    }
    return inside;
  }

  /**
   * An edge from a to b with a fixed wiggle: two sines seeded by the edge,
   * tapering to zero at the ends so neighbouring edges meet. The coast
   * wiggles more than inland borders.
   */
  static wiggle(a: number[], b: number[], seed: number, coast: boolean): { x: number; y: number }[] {
    const n = coast ? WAR.mapCoastSteps : WAR.mapBorderSteps, amp = coast ? WAR.mapCoastWiggle : WAR.mapBorderWiggle;
    const dx = b[0] - a[0], dy = b[1] - a[1], len = Math.hypot(dx, dy) || 1;
    const nx = -dy / len, ny = dx / len;
    const p1 = (seed * 0.731) % 6.283, p2 = (seed * 1.913) % 6.283, f1 = 2 + (seed % 3), f2 = 5 + (seed % 4);
    const out: { x: number; y: number }[] = [];
    for (let i = 0; i <= n; i++) {
      const t = i / n;
      const o = amp * Math.sin(Math.PI * t) * (Math.sin(Math.PI * f1 * t + p1) * 0.65 + Math.sin(Math.PI * f2 * t + p2) * 0.35);
      out.push({ x: a[0] + dx * t + nx * o, y: a[1] + dy * t + ny * o });
    }
    return out;
  }

  /** PLAN 4: you hold the Last Camp (a level-1 castle and its village); the Dominion holds the rest. */
  reset() {
    for (const n of this.nodes) {
      const t = this.territories[n.territory];
      n.owner = t.id === WAR.startTerritory ? 'player' : 'enemy';
      n.level = n.type === 'outpost' ? 1 : n.owner === 'player' ? 1
        : clamp(n.type === 'castle' ? WAR.castleStartLevel[t.tier - 1] : WAR.nodeStartLevel[t.tier - 1], 1, 3);
    }
  }

  castleOf(t: number): MapNode { return this.territories[t].nodes.find((n) => n.type === 'castle')!; }
  /** Holding the castle is holding the territory (PLAN 5.1). */
  holds(t: number, side: Team): boolean { return this.castleOf(t).owner === side; }
  territoriesHeld(side: Team): number { return this.territories.filter((t) => this.holds(t.id, side)).length; }

  /**
   * PLAN 5.1, the frontier rule: an enemy node can be attacked if you hold
   * any node in its territory, or hold a territory bordering it.
   */
  canAttack(n: MapNode): boolean {
    if (n.owner === 'player') return false;
    const t = this.territories[n.territory];
    if (t.nodes.some((m) => m.owner === 'player')) return true;
    return t.neighbors.some((k) => this.holds(k, 'player'));
  }

  /** Small nodes (villages, outposts) the player holds in a territory. */
  private thinned(t: number): number {
    return this.territories[t].nodes.filter((m) => m.owner === 'player' && (m.type === 'village' || m.type === 'outpost')).length;
  }

  /** The defenders a node fields when attacked (PLAN 5.1 / 5.2), before battle reinforcements. */
  garrison(n: MapNode): number {
    const t = this.territories[n.territory];
    const keep = t.nodes.find((m) => m.type === 'keep');
    switch (n.type) {
      case 'village': return WAR.villageGarrison + WAR.villageGarrisonPerLevel * (n.level - 1);
      case 'outpost': return WAR.outpostGarrison;
      case 'keep': return WAR.keepGarrison + WAR.keepDefenders[n.level - 1];
      case 'castle': {
        let g = WAR.castleGarrison[n.level - 1];
        if (keep && keep.owner !== 'player') g *= 1 + WAR.keepGarrisonBonus;              // the keep still stands for them: +50%
        g *= 1 - Math.min(WAR.thinMax, WAR.thinPerNode * this.thinned(n.territory));     // garrison thinning
        return Math.round(g);
      }
    }
  }

  /** Battle tier for a node: its territory's, +1 for a castle or keep while the Dominion holds the outpost. */
  battleTier(n: MapNode): number {
    const t = this.territories[n.territory];
    const op = t.nodes.find((m) => m.type === 'outpost');
    const up = (n.type === 'castle' || n.type === 'keep') && op && op.owner !== 'player' ? 1 : 0;
    return clamp(t.tier + up, 1, 5);
  }

  /** The battle type attacking a node starts (PLAN 5.1). */
  static battleKind(n: MapNode): BattleKind {
    return n.type === 'castle' ? 'castle' : n.type === 'keep' ? 'keep' : n.type === 'outpost' ? 'outpost' : 'village';
  }

  /** Everything a battle needs to attack this node. */
  battleSpec(n: MapNode): BattleSpec {
    const t = this.territories[n.territory];
    const kind = Campaign.battleKind(n), tier = this.battleTier(n);
    const keep = t.nodes.find((m) => m.type === 'keep');
    const elites = ['shade', 'caster', 'flyer', 'bruiser', 'shade'].slice(0, 1 + Math.floor(tier / 2));
    const spec: BattleSpec = {
      kind, name: n.name, tier, scenery: t.scenery, seed: 1000 + n.id * 7919,
      foes: foeMix(this.garrison(n)), foeElites: elites, commander: null, allies: {},
      reinforce: foeMix(WAR.battleReinforce[kind]),
      nodeId: n.id,
    };
    if (kind === 'village') spec.houses = 2 + n.level;
    if (kind === 'keep') spec.captainName = `Captain ${CAPTAIN_NAMES[t.id % CAPTAIN_NAMES.length]}`;
    if (kind === 'castle') {
      spec.lordName = t.id === WAR.capitalTerritory ? 'Warlord Garrick Thorne' : `Lord ${LORD_NAMES[t.id % LORD_NAMES.length]} of ${t.name}`;
      spec.ironGate = !!keep && keep.owner !== 'player';
      spec.gateMult = WAR.castleGateLevel[n.level - 1];
    }
    return spec;
  }

  /** PLAN 5.3: a captured node flips to you at max(1, level - 1). */
  capture(n: MapNode) {
    n.owner = 'player';
    n.level = Math.max(1, n.level - 1);
  }

  /** War state for the save: [owner (1 = player), level] per node. */
  save(): number[][] { return this.nodes.map((n) => [n.owner === 'player' ? 1 : 0, n.level]); }

  /** Restore from a save, ignoring anything that doesn't fit this continent. */
  load(s: unknown) {
    this.reset();
    if (!Array.isArray(s) || s.length !== this.nodes.length) return;
    s.forEach((row, i) => {
      if (!Array.isArray(row)) return;
      const n = this.nodes[i];
      n.owner = row[0] === 1 ? 'player' : 'enemy';
      n.level = n.type === 'outpost' ? 1 : clamp(row[1] | 0, 1, 3);
    });
  }

  /** Every node reachable from every other by road? (PLAN 14, Phase 6) */
  connected(): boolean {
    const N = this.nodes.length;
    for (let j = 0; j < N; j++) if (this.dist[j] === Infinity) return false;
    return true;
  }
}
