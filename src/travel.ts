/* =========================================================================
 * travel.ts — being on the road between two locations.
 *
 * Progress runs on a clock. While you travel, the destination's native
 * enemies keep arriving (spawnRate per minute, forever, until you get
 * there), and 0-3 ambushes of 1-5 enemies are placed along the road. An
 * ambush holds you in place until it is cleared. Turn back at any point
 * and the trip reverses — the ambushes ahead of you are left behind.
 * ========================================================================= */

interface TravelState {
  from: string;
  to: string;
  progress: number;          // 0-1
  duration: number;          // seconds end to end
  elapsed: number;
  ambushes: number[];        // progress points still ahead, ascending
  ambush: Enemy[];           // the ambush you are fighting, if any
  spawnTimer: number;        // seconds until the next roadside enemy
  enemyWave: number;         // encounters so far on this trip
  kills: number;
}

function newTravel(from: string, to: string): TravelState {
  const n = rndInt(0, 3);
  const ambushes: number[] = [];
  for (let i = 0; i < n; i++) ambushes.push(rnd(0.18, 0.86));
  ambushes.sort((a, b) => a - b);
  return {
    from, to, progress: 0, duration: Math.max(4, roadTime(from, to)), elapsed: 0,
    ambushes, ambush: [], spawnTimer: 2.5, enemyWave: 0, kills: 0,
  };
}

/** The place whose enemies and look the road takes: the harder end of it. */
function roadScene(t: TravelState): WorldLocation {
  const a = locById(t.from), b = locById(t.to);
  return b.tier >= a.tier ? b : a;
}

/** Turn around: same road, the other way, from wherever you are on it. */
function reverseTravel(t: TravelState) {
  const f = t.from;
  t.from = t.to;
  t.to = f;
  t.progress = 1 - t.progress;
  t.ambushes = [];           // what lay ahead is behind you now
}

function secondsLeft(t: TravelState): number {
  return Math.max(0, (1 - t.progress) * t.duration);
}

function inAmbush(t: TravelState): boolean { return t.ambush.some((e) => e.alive); }

/** Most roadside enemies alive at once; deeper roads crowd you harder. */
function roadCap(tier: number): number { return 3 + Math.floor(tier / 3); }

/** Spawn one of the scene's native enemies at an arena edge, ahead of you by preference. */
function spawnRoadEnemy(g: Game, scene: WorldLocation): Enemy {
  const a = g.arena;
  const side = Math.random() < 0.6 ? 'ahead' : pick(['top', 'bottom', 'behind']);
  let x: number, y: number;
  if (side === 'ahead') { x = a.x + a.w - 30; y = rnd(a.y + 30, a.y + a.h - 30); }
  else if (side === 'behind') { x = a.x + 30; y = rnd(a.y + 30, a.y + a.h - 30); }
  else { x = rnd(a.x + 60, a.x + a.w - 60); y = side === 'top' ? a.y + 30 : a.y + a.h - 30; }
  if (dist(x, y, g.player.x, g.player.y) < 120) x = clamp(g.player.x + 220, a.x + 30, a.x + a.w - 30);
  const e = new Enemy(ENEMIES[pick(scene.enemyTypes)], x, y, rollEnemyLevel(scene), Math.max(1, scene.tier));
  g.enemies.push(e);
  g.ring(x, y, 0, 8, 50, scene.look.accent);
  return e;
}

/** One tick on the road. Returns true once you have arrived. */
function tickTravel(g: Game, t: TravelState, dt: number): boolean {
  const scene = roadScene(t);
  t.elapsed += dt;

  if (inAmbush(t)) {
    // the road is blocked until this lot is down
  } else {
    if (t.ambush.length) {
      t.ambush = [];
      g.banner('AMBUSH CLEARED', 'back on the road', '#4fe08a');
    }
    t.progress = Math.min(1, t.progress + dt / t.duration);
    g.scroll += dt * 90;
    if (t.ambushes.length && t.progress >= t.ambushes[0]) {
      t.ambushes.shift();
      t.enemyWave++;
      const n = rndInt(1, 5);
      for (let i = 0; i < n; i++) t.ambush.push(spawnRoadEnemy(g, scene));
      g.banner('AMBUSH!', `${n} ${n > 1 ? 'enemies block' : 'enemy blocks'} the road`, '#ff9d5c');
      g.sfx.wave();
    }
  }

  // The roadside never runs dry: as enemies fall, more come.
  t.spawnTimer -= dt;
  const rate = scene.spawnRate * TUNING.travelSpawnMult;
  if (t.spawnTimer <= 0 && rate > 0) {
    t.spawnTimer = (60 / rate) * rnd(0.6, 1.4);
    const alive = g.enemies.filter((e) => e.alive).length;
    if (alive < roadCap(scene.tier) && !inAmbush(t) && t.progress < 0.97) {
      spawnRoadEnemy(g, scene);
      t.enemyWave++;
    }
  }

  return t.progress >= 1;
}
