/* =========================================================================
 * overworld.ts — the open world: one big tile map, a camera that follows
 * you, and enemies scattered across it.
 *
 * The world is a 5x3 grid of regions (the areas from location.ts). Each
 * region is REG_W x REG_H tiles with cliffs around its edge; neighbouring
 * regions are joined by a passage, and a passage into a locked region is
 * sealed by a magic barrier until its dungeon's final boss falls.
 *
 * A region holds a dungeon, two towns (one with a forge where the area has
 * a station), a landmark, treasure chests and ~110 enemy spawn points, a
 * few of them Elite. Everything is generated from fixed seeds, so the map
 * is the same on every load.
 * ========================================================================= */

const TILE = 40;
const REG_W = 128;
const REG_H = 80;
const GRID_W = 5;
const GRID_H = 3;
const WORLD_TW = REG_W * GRID_W;          // tiles
const WORLD_TH = REG_H * GRID_H;
const WORLD_PW = WORLD_TW * TILE;         // pixels
const WORLD_PH = WORLD_TH * TILE;

/** Where each area sits in the grid; null cells are impassable mountains. */
const REGION_GRID: (string | null)[][] = [
  ['forest-1', 'forest-2', 'volcano-1', 'volcano-2', 'sky-2'],
  ['hub', 'desert-1', null, 'sky-1', 'rift-1'],
  ['coast-1', 'ruins-1', 'ruins-2', 'tundra-1', null],
];

const T_GROUND = 0, T_PATH = 1, T_SOLID = 2, T_WALL = 3, T_LIQUID = 4, T_BUILD = 5;

type BuildingKind = 'dungeon' | 'forge' | 'town' | 'colosseum' | 'landmark';

interface Building {
  kind: BuildingKind;
  region: string;
  name: string;
  tx: number; ty: number; tw: number; th: number;   // footprint in tiles
  doorX: number; doorY: number;                      // pixel point you stand on to use it
}

interface Passage { a: string; b: string; tiles: number[]; }

interface Spawner {
  region: string;
  x: number; y: number;
  elite: boolean;
  enemy: Enemy | null;
  cooldown: number;          // seconds until it may spawn again
}

interface OverworldMap {
  tiles: Uint8Array;
  region: Int8Array;         // index into REGION_IDS, -1 for mountains
  passageOf: Int16Array;     // passage index per tile, -1 if none
  passages: Passage[];
  buildings: Building[];
  spawnPoints: { region: string; x: number; y: number; elite: boolean }[];
  chests: Chest[];
  variant: Uint8Array;       // per-tile random byte, for decoration
}

interface Chest { id: string; region: string; x: number; y: number; }

/** Map layout version: bumped when the world changes shape, so old saved positions are dropped. */
const MAP_VERSION = 4;

/** The Haven is a small valley inside its grid cell; the rest is mountain. */
const HAVEN_RECT = { x: 36, y: 22, w: 56, h: 36 };

const REGION_IDS: string[] = REGION_GRID.flat().filter((id): id is string => !!id);

function regionCell(id: string): { rx: number; ry: number } {
  for (let ry = 0; ry < GRID_H; ry++) for (let rx = 0; rx < GRID_W; rx++) {
    if (REGION_GRID[ry][rx] === id) return { rx, ry };
  }
  return { rx: 0, ry: 1 };
}

/** Deterministic RNG so the world is the same on every load. */
function seeded(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6D2B79F5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** How much of a region's clutter is liquid (water, lava, void) rather than rock or trees. */
const LIQUID_SHARE: Record<Theme, number> = {
  Haven: 0.1, Forest: 0.12, Coast: 0.45, Ruins: 0.15, Desert: 0.02,
  Volcano: 0.4, Tundra: 0.25, Sky: 0.35, Rift: 0.35,
};
/** Clutter clusters per region (scaled for 128x80) and big lakes. */
const CLUTTER: Record<Theme, number> = {
  Haven: 160, Forest: 560, Coast: 380, Ruins: 420, Desert: 280,
  Volcano: 420, Tundra: 380, Sky: 380, Rift: 440,
};
const LAKES: Record<Theme, number> = {
  Haven: 2, Forest: 5, Coast: 12, Ruins: 3, Desert: 1, Volcano: 9, Tundra: 7, Sky: 10, Rift: 9,
};

/** Each biome's set piece, and whether it is a lake crossed by a bridge. */
const LANDMARKS: Record<Theme, { name: string; lake: boolean }> = {
  Haven: { name: 'Lantern Fountain', lake: false },
  Forest: { name: 'The Eldest Tree', lake: false },
  Coast: { name: 'The Drowned Ship', lake: false },
  Ruins: { name: 'Fallen Colossus', lake: false },
  Desert: { name: 'Mirror Oasis', lake: true },
  Volcano: { name: 'Lake of Cinders', lake: true },
  Tundra: { name: 'The Still Lake', lake: true },
  Sky: { name: 'Wind Shrine', lake: false },
  Rift: { name: 'The Monolith', lake: false },
};

const TOWN_NAMES = ['Ashford', 'Brightwell', 'Cindervale', 'Dunmere', 'Elderholm', 'Fernwick', 'Glimmerdeep', 'Hollowmere',
  'Ironbrook', 'Juniper Rest', 'Kestrel Point', 'Lowmarsh', 'Mistral', 'Northwatch', 'Oakenshaw', 'Pale Harbour',
  'Quietwater', 'Rimeholt', 'Stormhaven', 'Thistledown', 'Umberfield', 'Verdant', 'Windrest', 'Yarrow', 'Zephyr Hill', 'Harrow Inn'];

function buildOverworld(): OverworldMap {
  const n = WORLD_TW * WORLD_TH;
  const tiles = new Uint8Array(n).fill(T_WALL);
  const region = new Int8Array(n).fill(-1);
  const passageOf = new Int16Array(n).fill(-1);
  const variant = new Uint8Array(n);
  const rnd0 = seeded(1337);
  for (let i = 0; i < n; i++) variant[i] = Math.floor(rnd0() * 256);
  const at = (tx: number, ty: number) => ty * WORLD_TW + tx;
  const inside = (tx: number, ty: number) => tx >= 0 && ty >= 0 && tx < WORLD_TW && ty < WORLD_TH;
  const set = (tx: number, ty: number, v: number) => { if (inside(tx, ty)) tiles[at(tx, ty)] = v; };

  // 1. regions: open ground inside a ring of cliffs
  for (let ry = 0; ry < GRID_H; ry++) for (let rx = 0; rx < GRID_W; rx++) {
    const id = REGION_GRID[ry][rx];
    if (!id) continue;
    const ox = rx * REG_W, oy = ry * REG_H;
    const R = id === HUB_ID ? HAVEN_RECT : { x: 0, y: 0, w: REG_W, h: REG_H };
    for (let y = 0; y < REG_H; y++) for (let x = 0; x < REG_W; x++) {
      const i = at(ox + x, oy + y);
      if (x < R.x || y < R.y || x >= R.x + R.w || y >= R.y + R.h) continue;   // mountain
      region[i] = REGION_IDS.indexOf(id);
      const edge = x === R.x || y === R.y || x === R.x + R.w - 1 || y === R.y + R.h - 1;
      tiles[i] = edge ? T_WALL : T_GROUND;
    }
  }

  // 2. clutter: lakes, then clusters of trees / rocks / pillars and small pools
  const blob = (cx: number, cy: number, rx: number, ry: number, v: number, ox: number, oy: number, r: () => number) => {
    for (let y = -ry; y <= ry; y++) for (let x = -rx; x <= rx; x++) {
      const k = (x * x) / (rx * rx + 0.5) + (y * y) / (ry * ry + 0.5);
      if (k > 1 + (r() - 0.5) * 0.35) continue;
      const tx = cx + x, ty = cy + y;
      if (tx <= ox || ty <= oy || tx >= ox + REG_W - 1 || ty >= oy + REG_H - 1) continue;
      if (tiles[at(tx, ty)] === T_WALL) continue;
      set(tx, ty, v);
    }
  };
  for (const id of REGION_IDS) {
    const { rx, ry } = regionCell(id);
    const loc = locById(id);
    const r = seeded(100 + REGION_IDS.indexOf(id) * 17);
    const ox = rx * REG_W, oy = ry * REG_H;
    for (let k = 0; k < LAKES[loc.theme]; k++) {
      const lrx = 3 + Math.floor(r() * 5), lry = 2 + Math.floor(r() * 4);
      blob(ox + 8 + Math.floor(r() * (REG_W - 16)), oy + 6 + Math.floor(r() * (REG_H - 12)), lrx, lry, T_LIQUID, ox, oy, r);
    }
    for (let k = 0; k < CLUTTER[loc.theme]; k++) {
      const cx = ox + 2 + Math.floor(r() * (REG_W - 4));
      const cy = oy + 2 + Math.floor(r() * (REG_H - 4));
      const liquid = r() < LIQUID_SHARE[loc.theme];
      const rad = liquid ? 1 + Math.floor(r() * 2) : Math.floor(r() * 2);
      blob(cx, cy, rad, rad, liquid ? T_LIQUID : T_SOLID, ox, oy, r);
    }
  }

  // 3. passages between neighbouring regions, carved through both cliffs
  const passages: Passage[] = [];
  const doorsOf: Record<string, { x: number; y: number }[]> = {};
  for (const id of REGION_IDS) doorsOf[id] = [];
  const rp = seeded(4242);
  const PW = 6;
  for (let ry = 0; ry < GRID_H; ry++) for (let rx = 0; rx < GRID_W; rx++) {
    const a = REGION_GRID[ry][rx];
    if (!a) continue;
    const east = rx + 1 < GRID_W ? REGION_GRID[ry][rx + 1] : null;
    const south = ry + 1 < GRID_H ? REGION_GRID[ry + 1][rx] : null;
    if (east) {
      const py = ry * REG_H + 34 + Math.floor(rp() * 8);
      const xa = rx * REG_W + REG_W - 1, xb = xa + 1;
      const p: Passage = { a, b: east, tiles: [] };
      for (let y = py; y < py + PW; y++) for (const x of [xa, xb]) { set(x, y, T_PATH); p.tiles.push(at(x, y)); }
      passages.push(p);
      doorsOf[a].push({ x: xa, y: py + 2 });
      doorsOf[east].push({ x: xb, y: py + 2 });
    }
    if (south) {
      const px = rx * REG_W + 56 + Math.floor(rp() * 12);
      const ya = ry * REG_H + REG_H - 1, yb = ya + 1;
      const p: Passage = { a, b: south, tiles: [] };
      for (let x = px; x < px + PW; x++) for (const y of [ya, yb]) { set(x, y, T_PATH); p.tiles.push(at(x, y)); }
      passages.push(p);
      doorsOf[a].push({ x: px + 2, y: ya });
      doorsOf[south].push({ x: px + 2, y: yb });
    }
  }
  passages.forEach((p, i) => { for (const t of p.tiles) passageOf[t] = i; });

  // 4. roads: every passage, town, dungeon and landmark joins the middle of its region
  const carve = (x0: number, y0: number, x1: number, y1: number) => {
    // an L: along x at y0, then along y at x1, three tiles wide
    const sx = Math.sign(x1 - x0) || 1, sy = Math.sign(y1 - y0) || 1;
    for (let x = x0; x !== x1 + sx; x += sx) for (let d = -1; d <= 1; d++) {
      const i = at(x, y0 + d);
      if (tiles[i] !== T_WALL || passageOf[i] >= 0) tiles[i] = T_PATH;
    }
    for (let y = y0; y !== y1 + sy; y += sy) for (let d = -1; d <= 1; d++) {
      const i = at(x1 + d, y);
      if (tiles[i] !== T_WALL || passageOf[i] >= 0) tiles[i] = T_PATH;
    }
  };

  // A road cut through the mountains around the Haven: opens walls and claims the tiles.
  const tunnel = (x0: number, y0: number, x1: number, y1: number) => {
    const hub = REGION_IDS.indexOf(HUB_ID);
    const open = (i: number) => { tiles[i] = T_PATH; if (region[i] < 0) region[i] = hub; };
    const sx = Math.sign(x1 - x0) || 1, sy = Math.sign(y1 - y0) || 1;
    for (let x = x0; x !== x1 + sx; x += sx) for (let d = -1; d <= 1; d++) open(at(x, y0 + d));
    for (let y = y0; y !== y1 + sy; y += sy) for (let d = -1; d <= 1; d++) open(at(x1 + d, y));
  };

  const buildings: Building[] = [];
  let townName = 0;
  function placeBuilding(kind: BuildingKind, id: string, name: string, tx: number, ty: number, tw: number, th: number, face: 'up' | 'down'): Building {
    // clear a yard around it, then stamp the footprint
    for (let y = ty - 3; y < ty + th + 3; y++) for (let x = tx - 3; x < tx + tw + 3; x++) {
      if (tiles[at(x, y)] === T_SOLID || tiles[at(x, y)] === T_LIQUID) tiles[at(x, y)] = T_GROUND;
    }
    for (let y = ty; y < ty + th; y++) for (let x = tx; x < tx + tw; x++) tiles[at(x, y)] = T_BUILD;
    const dx = tx + Math.floor(tw / 2);
    const dy = face === 'down' ? ty + th : ty - 1;
    const b: Building = { kind, region: id, name, tx, ty, tw, th, doorX: dx * TILE + TILE / 2, doorY: dy * TILE + TILE / 2 };
    buildings.push(b);
    return b;
  }

  for (const id of REGION_IDS) {
    const { rx, ry } = regionCell(id);
    const ox = rx * REG_W, oy = ry * REG_H;
    const cx = ox + 64, cy = oy + 40;
    const loc = locById(id);
    if (id === HUB_ID) {
      // the Haven: roads tunnel in from each passage; everything sits in the valley
      const ix = ox + HAVEN_RECT.x, iy = oy + HAVEN_RECT.y;
      const hx = ix + HAVEN_RECT.w / 2, hy = iy + HAVEN_RECT.h / 2;
      for (const d of doorsOf[id]) {
        const inX = d.x === ox + REG_W - 1 ? ox + REG_W - 4 : d.x;
        const inY = d.y === oy ? oy + 3 : d.y === oy + REG_H - 1 ? oy + REG_H - 4 : d.y;
        tunnel(d.x, d.y, inX, inY);
        tunnel(inX, inY, hx, hy);
      }
      placeBuilding('colosseum', id, 'Colosseum', ix + 38, iy + 3, 7, 5, 'down');
      carve(ix + 41, iy + 9, hx, hy);
      placeBuilding('forge', id, loc.stationName || 'Forge', ix + 6, iy + 26, 7, 4, 'up');
      carve(ix + 9, iy + 23, hx, hy);
      placeBuilding('town', id, 'Harrow Inn', ix + 40, iy + 26, 7, 4, 'up');
      carve(ix + 43, iy + 23, hx, hy);
      placeBuilding('landmark', id, LANDMARKS.Haven.name, ix + 8, iy + 4, 6, 5, 'down');
      carve(ix + 11, iy + 10, hx, hy);
      continue;
    }
    for (const d of doorsOf[id]) {
      const inX = d.x === ox ? ox + 3 : d.x === ox + REG_W - 1 ? ox + REG_W - 4 : d.x;
      const inY = d.y === oy ? oy + 3 : d.y === oy + REG_H - 1 ? oy + REG_H - 4 : d.y;
      carve(d.x, d.y, inX, inY);
      carve(inX, inY, cx, cy);
    }
    // the dungeon (or, in the Haven, the colosseum): top-right, door facing down
    if (loc.tier === 0) placeBuilding('colosseum', id, 'Colosseum', ox + 96, oy + 12, 7, 5, 'down');
    else placeBuilding('dungeon', id, `${loc.name} dungeon`, ox + 96, oy + 12, 7, 5, 'down');
    carve(ox + 99, oy + 18, cx, cy);
    // two towns along the bottom; the first has the forge where there is one
    placeBuilding(loc.hasCraftingStation ? 'forge' : 'town', id,
      loc.hasCraftingStation ? (loc.stationName || 'Forge') : TOWN_NAMES[townName++ % TOWN_NAMES.length], ox + 18, oy + 58, 7, 4, 'up');
    carve(ox + 21, oy + 55, cx, cy);
    placeBuilding('town', id, TOWN_NAMES[townName++ % TOWN_NAMES.length], ox + 100, oy + 60, 7, 4, 'up');
    carve(ox + 103, oy + 57, cx, cy);
    // the landmark: top-left
    const lm = LANDMARKS[loc.theme];
    if (lm.lake) {
      const lr = seeded(700 + REGION_IDS.indexOf(id));
      blob(ox + 26, oy + 18, 9, 6, T_LIQUID, ox, oy, lr);
      for (let x = ox + 15; x <= ox + 37; x++) for (let d = -1; d <= 0; d++) tiles[at(x, oy + 18 + d)] = T_PATH;   // the bridge
      buildings.push({ kind: 'landmark', region: id, name: lm.name, tx: ox + 26, ty: oy + 18, tw: 0, th: 0, doorX: (ox + 26) * TILE, doorY: (oy + 18) * TILE });
      carve(ox + 37, oy + 18, cx, cy);
    } else {
      placeBuilding('landmark', id, lm.name, ox + 23, oy + 15, 6, 5, 'down');
      carve(ox + 26, oy + 21, cx, cy);
    }
  }

  // Everything reachable from the Haven with every passage open.
  const reach = new Uint8Array(n);
  const hub = buildings.find((b) => b.kind === 'forge' && b.region === HUB_ID)!;
  const stack = [[Math.floor(hub.doorX / TILE), Math.floor(hub.doorY / TILE)]];
  reach[at(stack[0][0], stack[0][1])] = 1;
  while (stack.length) {
    const [x, y] = stack.pop()!;
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const nx = x + dx, ny = y + dy;
      if (!inside(nx, ny)) continue;
      const i = at(nx, ny), t = tiles[i];
      if (reach[i] || (t !== T_GROUND && t !== T_PATH)) continue;
      reach[i] = 1;
      stack.push([nx, ny]);
    }
  }

  // 5. enemy spawn points (a few Elite) and treasure chests, on reachable ground
  const spawnPoints: { region: string; x: number; y: number; elite: boolean }[] = [];
  const chests: Chest[] = [];
  const nearTown = (px: number, py: number, r: number) =>
    buildings.some((b) => b.kind !== 'landmark' && b.region && dist(px, py, b.doorX, b.doorY) < r);
  for (const id of REGION_IDS) {
    const { rx, ry } = regionCell(id);
    const r = seeded(900 + REGION_IDS.indexOf(id) * 31);
    const ox = rx * REG_W, oy = ry * REG_H;
    const pickSpot = (minGap: number, list: { x: number; y: number }[], avoid: number, tries: number) => {
      for (let k = 0; k < tries; k++) {
        const tx = ox + 3 + Math.floor(r() * (REG_W - 6));
        const ty = oy + 3 + Math.floor(r() * (REG_H - 6));
        const t = tiles[at(tx, ty)];
        if ((t !== T_GROUND && t !== T_PATH) || !reach[at(tx, ty)]) continue;
        const px = tx * TILE + TILE / 2, py = ty * TILE + TILE / 2;
        if (nearTown(px, py, avoid)) continue;
        if (list.some((s) => dist(px, py, s.x, s.y) < minGap)) continue;
        return { x: px, y: py };
      }
      return null;
    };
    if (locById(id).tier > 0) {
      for (let k = 0; k < 110; k++) {
        const p = pickSpot(5 * TILE, spawnPoints, 9 * TILE, 60);
        if (p) spawnPoints.push({ region: id, x: p.x, y: p.y, elite: k % 12 === 11 });
      }
    }
    const nChests = locById(id).tier > 0 ? 14 : 4;
    for (let k = 0; k < nChests; k++) {
      const p = pickSpot(12 * TILE, chests, 6 * TILE, 200);
      if (p) chests.push({ id: `${id}#${k}`, region: id, x: p.x, y: p.y });
    }
  }

  return { tiles, region, passageOf, passages, buildings, spawnPoints, chests, variant };
}

const WORLD_MAP: OverworldMap = buildOverworld();

// Neighbours come from the region grid in overworld.ts.
for (let ry = 0; ry < REGION_GRID.length; ry++) for (let rx = 0; rx < REGION_GRID[ry].length; rx++) {
  const id = REGION_GRID[ry][rx];
  if (!id) continue;
  for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
    const n = REGION_GRID[ry + dy]?.[rx + dx];
    if (n) LOCATION_MAP[id].connectedLocations.push(n);
  }
}


/* ------------------------------------------------------------- queries */

function tileAt(tx: number, ty: number): number {
  if (tx < 0 || ty < 0 || tx >= WORLD_TW || ty >= WORLD_TH) return T_WALL;
  return WORLD_MAP.tiles[ty * WORLD_TW + tx];
}

function regionAtPx(x: number, y: number): string | null {
  const tx = Math.floor(x / TILE), ty = Math.floor(y / TILE);
  if (tx < 0 || ty < 0 || tx >= WORLD_TW || ty >= WORLD_TH) return null;
  const r = WORLD_MAP.region[ty * WORLD_TW + tx];
  return r >= 0 ? REGION_IDS[r] : null;
}

/** A passage is sealed while either side of it is locked. */
function barrierUp(w: WorldState, tx: number, ty: number): boolean {
  if (tx < 0 || ty < 0 || tx >= WORLD_TW || ty >= WORLD_TH) return false;
  const p = WORLD_MAP.passageOf[ty * WORLD_TW + tx];
  if (p < 0) return false;
  const pa = WORLD_MAP.passages[p];
  return !w.unlockedAreas.has(pa.a) || !w.unlockedAreas.has(pa.b);
}

function solidAt(w: WorldState, tx: number, ty: number): boolean {
  const t = tileAt(tx, ty);
  if (t === T_SOLID || t === T_WALL || t === T_LIQUID || t === T_BUILD) return true;
  return barrierUp(w, tx, ty);
}

/** Push a circle out of any solid tiles it overlaps. */
function collideWorld(w: WorldState, o: { x: number; y: number; radius: number }) {
  for (let pass = 0; pass < 2; pass++) {
    const r = o.radius;
    const x0 = Math.floor((o.x - r) / TILE), x1 = Math.floor((o.x + r) / TILE);
    const y0 = Math.floor((o.y - r) / TILE), y1 = Math.floor((o.y + r) / TILE);
    for (let ty = y0; ty <= y1; ty++) for (let tx = x0; tx <= x1; tx++) {
      if (!solidAt(w, tx, ty)) continue;
      const nx = clamp(o.x, tx * TILE, tx * TILE + TILE);
      const ny = clamp(o.y, ty * TILE, ty * TILE + TILE);
      let dx = o.x - nx, dy = o.y - ny;
      let d = Math.hypot(dx, dy);
      if (d >= r) continue;
      if (d < 0.001) {
        // centre is inside the tile: shove out along the shallowest axis
        const cx = tx * TILE + TILE / 2, cy = ty * TILE + TILE / 2;
        dx = o.x - cx; dy = o.y - cy; d = Math.hypot(dx, dy) || 1;
      }
      o.x += (dx / d) * (r - Math.min(d, r));
      o.y += (dy / d) * (r - Math.min(d, r));
    }
  }
  o.x = clamp(o.x, o.radius, WORLD_PW - o.radius);
  o.y = clamp(o.y, o.radius, WORLD_PH - o.radius);
}

function buildingOf(kind: BuildingKind, region: string): Building | null {
  return WORLD_MAP.buildings.find((b) => b.kind === kind && b.region === region) || null;
}

/** Buildings you can warp to once you have been there. */
function isWaypoint(b: Building): boolean { return b.kind !== 'landmark'; }

/** Towns and forges: rest stops and checkpoints. */
function isTown(b: Building): boolean { return b.kind === 'forge' || b.kind === 'town'; }

/** Where a new game (and a lost checkpoint) begins: outside the Haven's forge. */
function havenStart(): { x: number; y: number } {
  const f = buildingOf('forge', HUB_ID)!;
  return { x: f.doorX, y: f.doorY - TILE };
}

/** Whether an entity can stand at a point (used to validate a saved position). */
function standable(w: WorldState, x: number, y: number): boolean {
  return !solidAt(w, Math.floor(x / TILE), Math.floor(y / TILE)) && !!regionAtPx(x, y)
    && w.unlockedAreas.has(regionAtPx(x, y)!);
}

/* ------------------------------------------------------------ spawning */

const SPAWN_NEAR = 1500;        // spawners closer than this may fill
const SPAWN_NOT_VISIBLE = 560;  // ...but never right on top of you
const DESPAWN_FAR = 2100;       // an idle enemy this far away is put back
const RESPAWN_TIME = 28;        // seconds before a killed enemy comes back

function makeSpawners(): Spawner[] {
  return WORLD_MAP.spawnPoints.map((p) => ({ ...p, enemy: null, cooldown: 0 }));
}

/** Elites: rarer, tougher, glowing, and much better loot. */
function makeElite(e: Enemy) {
  e.elite = true;
  e.maxHp = Math.round(e.maxHp * 2.6);
  e.hp = e.maxHp;
  e.str *= 1.35;
  e.edef *= 1.3;
  e.exp = Math.round(e.exp * 3);
  e.radius = Math.round(e.radius * 1.25);
  e.maxPoise = Math.round(e.maxPoise * 2);
  e.poise = e.maxPoise;
}

/**
 * Keep the world populated around the player: fill empty spawners that are
 * near but off-screen, recycle ones far away, and start respawn timers.
 */
function tickSpawners(g: Game, dt: number) {
  const p = g.player;
  for (const s of g.spawners) {
    if (s.enemy) {
      if (!s.enemy.alive) {
        s.enemy = null;
        s.cooldown = s.elite ? RESPAWN_TIME * 3 : RESPAWN_TIME;
      } else if (!s.enemy.aggro && dist(s.enemy.x, s.enemy.y, p.x, p.y) > DESPAWN_FAR) {
        const i = g.enemies.indexOf(s.enemy);
        if (i >= 0) g.enemies.splice(i, 1);
        s.enemy = null;
        s.cooldown = 0;
      }
      continue;
    }
    if (s.cooldown > 0) { s.cooldown -= dt; continue; }
    if (!g.world.unlockedAreas.has(s.region)) continue;
    const d = dist(s.x, s.y, p.x, p.y);
    if (d > SPAWN_NEAR || d < SPAWN_NOT_VISIBLE) continue;
    const loc = locById(s.region);
    const e = new Enemy(ENEMIES[pick(loc.enemyTypes)], s.x, s.y, rollEnemyLevel(loc), loc.tier);
    e.aggro = false;
    e.homeX = s.x; e.homeY = s.y;
    if (s.elite) makeElite(e);
    e.state = 'chase';
    s.enemy = e;
    g.enemies.push(e);
  }
}

/** The camera's top-left, following the player and stopping at the world edge. */
function cameraFor(x: number, y: number): { x: number; y: number } {
  return {
    x: clamp(x - VIEW_W / 2, 0, WORLD_PW - VIEW_W),
    y: clamp(y - VIEW_H / 2 - 20, 0, WORLD_PH - VIEW_H),
  };
}
