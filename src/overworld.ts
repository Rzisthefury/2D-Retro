/* =========================================================================
 * overworld.ts — the open world: one big tile map, a camera that follows
 * you, and enemies scattered across it.
 *
 * The world is a 5x3 grid of regions (the areas from location.ts). Each
 * region is REG_W x REG_H tiles with cliffs around its edge; neighbouring
 * regions are joined by a passage, and a passage into a locked region is
 * sealed by a magic barrier until its dungeon's final boss falls.
 * Everything is generated from a fixed seed, so the map never changes.
 * ========================================================================= */

const TILE = 40;
const REG_W = 32;
const REG_H = 20;
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

type BuildingKind = 'dungeon' | 'forge' | 'colosseum';

interface Building {
  kind: BuildingKind;
  region: string;
  tx: number; ty: number; tw: number; th: number;   // footprint in tiles
  doorX: number; doorY: number;                      // pixel point you stand on to use it
}

interface Passage { a: string; b: string; tiles: number[]; }

interface Spawner {
  region: string;
  x: number; y: number;
  enemy: Enemy | null;
  cooldown: number;          // seconds until it may spawn again
}

interface OverworldMap {
  tiles: Uint8Array;
  region: Int8Array;         // index into REGION_IDS, -1 for mountains
  passageOf: Int16Array;     // passage index per tile, -1 if none
  passages: Passage[];
  buildings: Building[];
  spawnPoints: { region: string; x: number; y: number }[];
  variant: Uint8Array;       // per-tile random byte, for decoration
}

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
  Haven: 0.1, Forest: 0.12, Coast: 0.45, Ruins: 0.15, Desert: 0,
  Volcano: 0.4, Tundra: 0.25, Sky: 0.35, Rift: 0.35,
};
const CLUTTER: Record<Theme, number> = {
  Haven: 10, Forest: 34, Coast: 24, Ruins: 26, Desert: 18,
  Volcano: 26, Tundra: 24, Sky: 24, Rift: 28,
};

function buildOverworld(): OverworldMap {
  const n = WORLD_TW * WORLD_TH;
  const tiles = new Uint8Array(n).fill(T_WALL);
  const region = new Int8Array(n).fill(-1);
  const passageOf = new Int16Array(n).fill(-1);
  const variant = new Uint8Array(n);
  const rnd0 = seeded(1337);
  for (let i = 0; i < n; i++) variant[i] = Math.floor(rnd0() * 256);
  const at = (tx: number, ty: number) => ty * WORLD_TW + tx;
  const set = (tx: number, ty: number, v: number) => {
    if (tx >= 0 && ty >= 0 && tx < WORLD_TW && ty < WORLD_TH) tiles[at(tx, ty)] = v;
  };

  // 1. regions: open ground inside a ring of cliffs
  for (let ry = 0; ry < GRID_H; ry++) for (let rx = 0; rx < GRID_W; rx++) {
    const id = REGION_GRID[ry][rx];
    const ox = rx * REG_W, oy = ry * REG_H;
    for (let y = 0; y < REG_H; y++) for (let x = 0; x < REG_W; x++) {
      const i = at(ox + x, oy + y);
      if (!id) continue;
      region[i] = REGION_IDS.indexOf(id);
      const edge = x === 0 || y === 0 || x === REG_W - 1 || y === REG_H - 1;
      tiles[i] = edge ? T_WALL : T_GROUND;
    }
  }

  // 2. clutter: clusters of trees / rocks / pillars and pools of liquid
  for (const id of REGION_IDS) {
    const { rx, ry } = regionCell(id);
    const loc = locById(id);
    const r = seeded(100 + REGION_IDS.indexOf(id) * 17);
    const ox = rx * REG_W, oy = ry * REG_H;
    for (let k = 0; k < CLUTTER[loc.theme]; k++) {
      const cx = ox + 2 + Math.floor(r() * (REG_W - 4));
      const cy = oy + 2 + Math.floor(r() * (REG_H - 4));
      const liquid = r() < LIQUID_SHARE[loc.theme];
      const rad = liquid ? 1 + Math.floor(r() * 2) : Math.floor(r() * 2);
      for (let y = -rad; y <= rad; y++) for (let x = -rad; x <= rad; x++) {
        if (x * x + y * y > rad * rad + (liquid ? 1 : 0)) continue;
        if (r() < 0.2 && (x || y)) continue;   // ragged edges
        const tx = cx + x, ty = cy + y;
        if (tx <= ox || ty <= oy || tx >= ox + REG_W - 1 || ty >= oy + REG_H - 1) continue;
        set(tx, ty, liquid ? T_LIQUID : T_SOLID);
      }
    }
  }

  // 3. passages between neighbouring regions, carved through both cliffs
  const passages: Passage[] = [];
  const doorsOf: Record<string, { x: number; y: number }[]> = {};
  for (const id of REGION_IDS) doorsOf[id] = [];
  const rp = seeded(4242);
  for (let ry = 0; ry < GRID_H; ry++) for (let rx = 0; rx < GRID_W; rx++) {
    const a = REGION_GRID[ry][rx];
    if (!a) continue;
    const east = rx + 1 < GRID_W ? REGION_GRID[ry][rx + 1] : null;
    const south = ry + 1 < GRID_H ? REGION_GRID[ry + 1][rx] : null;
    if (east) {
      const py = ry * REG_H + 8 + Math.floor(rp() * 2);
      const xa = rx * REG_W + REG_W - 1, xb = xa + 1;
      const p: Passage = { a, b: east, tiles: [] };
      for (let y = py; y < py + 4; y++) for (const x of [xa, xb]) { set(x, y, T_PATH); p.tiles.push(at(x, y)); }
      passages.push(p);
      doorsOf[a].push({ x: xa, y: py + 1 });
      doorsOf[east].push({ x: xb, y: py + 1 });
    }
    if (south) {
      const px = rx * REG_W + 12 + Math.floor(rp() * 6);
      const ya = ry * REG_H + REG_H - 1, yb = ya + 1;
      const p: Passage = { a, b: south, tiles: [] };
      for (let x = px; x < px + 4; x++) for (const y of [ya, yb]) { set(x, y, T_PATH); p.tiles.push(at(x, y)); }
      passages.push(p);
      doorsOf[a].push({ x: px + 1, y: ya });
      doorsOf[south].push({ x: px + 1, y: yb });
    }
  }
  passages.forEach((p, i) => { for (const t of p.tiles) passageOf[t] = i; });

  // 4. roads: every passage and building joins the middle of its region
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

  const buildings: Building[] = [];
  for (const id of REGION_IDS) {
    const { rx, ry } = regionCell(id);
    const ox = rx * REG_W, oy = ry * REG_H;
    const cx = ox + 16, cy = oy + 10;
    const loc = locById(id);
    for (const d of doorsOf[id]) {
      // walk in from the passage a couple of tiles before turning
      const inX = d.x === ox ? ox + 2 : d.x === ox + REG_W - 1 ? ox + REG_W - 3 : d.x;
      const inY = d.y === oy ? oy + 2 : d.y === oy + REG_H - 1 ? oy + REG_H - 3 : d.y;
      carve(d.x, d.y, inX, inY);
      carve(inX, inY, cx, cy);
    }
    // the dungeon (or, in the Haven, the colosseum) sits top-right; doors face down
    const bigKind: BuildingKind = loc.tier === 0 ? 'colosseum' : 'dungeon';
    buildings.push(placeBuilding(bigKind, id, ox + 22, oy + 3, 5, 4, 'down'));
    carve(ox + 24, oy + 8, cx, cy);
    // a town with a forge, bottom-left; door faces up
    if (loc.hasCraftingStation) {
      buildings.push(placeBuilding('forge', id, ox + 4, oy + 14, 5, 3, 'up'));
      carve(ox + 6, oy + 12, cx, cy);
    }
  }
  function placeBuilding(kind: BuildingKind, id: string, tx: number, ty: number, tw: number, th: number, face: 'up' | 'down'): Building {
    // clear a yard around it, then stamp the footprint
    for (let y = ty - 2; y < ty + th + 2; y++) for (let x = tx - 2; x < tx + tw + 2; x++) {
      if (tiles[at(x, y)] === T_SOLID || tiles[at(x, y)] === T_LIQUID) tiles[at(x, y)] = T_GROUND;
    }
    for (let y = ty; y < ty + th; y++) for (let x = tx; x < tx + tw; x++) tiles[at(x, y)] = T_BUILD;
    const dx = tx + Math.floor(tw / 2);
    const dy = face === 'down' ? ty + th : ty - 1;
    return {
      kind, region: id, tx, ty, tw, th,
      doorX: dx * TILE + TILE / 2, doorY: dy * TILE + TILE / 2,
    };
  }

  // 5. enemy spawn points: open ground, away from buildings and roads' ends
  const spawnPoints: { region: string; x: number; y: number }[] = [];
  for (const id of REGION_IDS) {
    if (locById(id).tier === 0) continue;    // the Haven is safe
    const { rx, ry } = regionCell(id);
    const r = seeded(900 + REGION_IDS.indexOf(id) * 31);
    const ox = rx * REG_W, oy = ry * REG_H;
    let tries = 0;
    let count = 0;
    while (count < 9 && tries++ < 400) {
      const tx = ox + 2 + Math.floor(r() * (REG_W - 4));
      const ty = oy + 2 + Math.floor(r() * (REG_H - 4));
      const t = tiles[at(tx, ty)];
      if (t !== T_GROUND && t !== T_PATH) continue;
      const px = tx * TILE + TILE / 2, py = ty * TILE + TILE / 2;
      if (buildings.some((b) => dist(px, py, b.doorX, b.doorY) < 6 * TILE)) continue;
      if (spawnPoints.some((s) => dist(px, py, s.x, s.y) < 4 * TILE)) continue;
      spawnPoints.push({ region: id, x: px, y: py });
      count++;
    }
  }

  // Drop any spawn point walled off in a pocket (flood from the Haven, all passages open).
  const reach = new Uint8Array(n);
  const hub = buildings.find((b) => b.kind === 'forge' && b.region === HUB_ID)!;
  const stack = [[Math.floor(hub.doorX / TILE), Math.floor(hub.doorY / TILE)]];
  reach[at(stack[0][0], stack[0][1])] = 1;
  while (stack.length) {
    const [x, y] = stack.pop()!;
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const nx = x + dx, ny = y + dy;
      if (nx < 0 || ny < 0 || nx >= WORLD_TW || ny >= WORLD_TH) continue;
      const i = at(nx, ny), t = tiles[i];
      if (reach[i] || (t !== T_GROUND && t !== T_PATH)) continue;
      reach[i] = 1;
      stack.push([nx, ny]);
    }
  }
  const reachable = spawnPoints.filter((sp) => reach[at(Math.floor(sp.x / TILE), Math.floor(sp.y / TILE))]);

  return { tiles, region, passageOf, passages, buildings, spawnPoints: reachable, variant };
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
        s.cooldown = RESPAWN_TIME;
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
