/* ------------------------------------------------------------------
   MOVEMENT
   Dijkstra over terrain costs, attack-range flood, danger zone.
------------------------------------------------------------------ */
(function (FE) {
  'use strict';

  var DIRS = [[0, -1], [1, 0], [0, 1], [-1, 0]];

  function key(x, y) { return x + ',' + y; }

  FE.inBounds = function (state, x, y) {
    return x >= 0 && y >= 0 && x < state.map.w && y < state.map.h;
  };

  FE.tileAt = function (state, x, y) {
    if (!FE.inBounds(state, x, y)) return null;
    return state.map.tiles[y][x];
  };

  FE.unitAt = function (state, x, y) {
    for (var i = 0; i < state.units.length; i++) {
      var u = state.units[i];
      if (u.alive && u.x === x && u.y === y) return u;
    }
    return null;
  };

  FE.hostile = function (a, b) {
    if (a.faction === b.faction) return false;
    if (a.faction === 'player' && b.faction === 'ally') return false;
    if (a.faction === 'ally' && b.faction === 'player') return false;
    if (b.faction === 'npc' || a.faction === 'npc') return false;
    return true;
  };

  /* movement costs for a unit, accounting for opened doors */
  function costAt(state, u, x, y) {
    var t = FE.tileAt(state, x, y);
    if (!t) return FE.IMPASSABLE;
    if (t === 'door' && state.openedDoors && state.openedDoors[key(x, y)]) t = 'floor';
    if (t === 'chest' && state.openedChests && state.openedChests[key(x, y)]) t = 'floor';
    var mt = FE.CLASSES[u.cls].moveType;
    return FE.moveCost(t, mt);
  }

  /* map of reachable tiles -> remaining movement */
  FE.reachable = function (state, u, ignoreUnits) {
    var mov = u.mov;
    var best = {};
    var start = key(u.x, u.y);
    best[start] = 0;
    var frontier = [{ x: u.x, y: u.y, c: 0 }];
    while (frontier.length) {
      /* small maps — linear scan for the cheapest node is fine */
      var bi = 0;
      for (var i = 1; i < frontier.length; i++) if (frontier[i].c < frontier[bi].c) bi = i;
      var cur = frontier.splice(bi, 1)[0];
      if (cur.c > (best[key(cur.x, cur.y)] === undefined ? 1e9 : best[key(cur.x, cur.y)])) continue;
      for (var d = 0; d < DIRS.length; d++) {
        var nx = cur.x + DIRS[d][0], ny = cur.y + DIRS[d][1];
        if (!FE.inBounds(state, nx, ny)) continue;
        var step = costAt(state, u, nx, ny);
        if (step >= FE.IMPASSABLE) continue;
        if (!ignoreUnits) {
          var occ = FE.unitAt(state, nx, ny);
          if (occ && FE.hostile(u, occ)) continue;    /* cannot pass through enemies */
        }
        var nc = cur.c + step;
        if (nc > mov) continue;
        var k = key(nx, ny);
        if (best[k] === undefined || nc < best[k]) {
          best[k] = nc;
          frontier.push({ x: nx, y: ny, c: nc });
        }
      }
    }
    return best;
  };

  /* tiles the unit can actually stop on (not occupied by another unit) */
  FE.standable = function (state, u, reach) {
    var out = {};
    Object.keys(reach).forEach(function (k) {
      var p = k.split(','), x = +p[0], y = +p[1];
      var occ = FE.unitAt(state, x, y);
      if (occ && occ !== u) return;
      out[k] = reach[k];
    });
    return out;
  };

  /* shortest path from the unit to (tx,ty) using the reach map */
  FE.pathTo = function (state, u, reach, tx, ty) {
    var target = key(tx, ty);
    if (reach[target] === undefined) return null;
    var path = [{ x: tx, y: ty }];
    var cx = tx, cy = ty;
    var guard = 0;
    while (!(cx === u.x && cy === u.y) && guard++ < 500) {
      var bestN = null, bestC = 1e9;
      for (var d = 0; d < DIRS.length; d++) {
        var nx = cx + DIRS[d][0], ny = cy + DIRS[d][1];
        var k = key(nx, ny);
        if (reach[k] === undefined) continue;
        var stepBack = costAt(state, u, cx, cy);
        if (reach[k] + stepBack !== reach[key(cx, cy)]) continue;
        if (reach[k] < bestC) { bestC = reach[k]; bestN = { x: nx, y: ny }; }
      }
      if (!bestN) break;
      path.unshift(bestN);
      cx = bestN.x; cy = bestN.y;
    }
    return path;
  };

  /* Dijkstra distance field from a goal tile, ignoring the movement cap and
     other units. The AI steers by this instead of straight-line distance, so
     a river or a wall between it and you does not deadlock it on the bank. */
  FE.distanceField = function (state, u, tx, ty) {
    var mt = FE.CLASSES[u.cls].moveType;
    var field = {};
    var gk = key(tx, ty);
    field[gk] = 0;
    var frontier = [{ x: tx, y: ty, c: 0 }];
    var head = 0;
    while (head < frontier.length) {
      /* cheapest-first; the cost range is tiny so a bucket scan is enough */
      var bi = head;
      for (var i = head + 1; i < frontier.length; i++) if (frontier[i].c < frontier[bi].c) bi = i;
      var tmp = frontier[head]; frontier[head] = frontier[bi]; frontier[bi] = tmp;
      var cur = frontier[head++];
      if (cur.c > field[key(cur.x, cur.y)]) continue;
      if (cur.c > 260) continue;
      for (var d = 0; d < DIRS.length; d++) {
        var nx = cur.x + DIRS[d][0], ny = cur.y + DIRS[d][1];
        if (!FE.inBounds(state, nx, ny)) continue;
        /* cost of ENTERING the neighbour when walking outward from the goal is
           the cost of the tile we are stepping off, since we walk this backwards */
        var step = costAt(state, u, cur.x, cur.y);
        if (step >= FE.IMPASSABLE) continue;
        var enter = costAt(state, u, nx, ny);
        if (enter >= FE.IMPASSABLE) continue;
        var nc = cur.c + enter;
        var k = key(nx, ny);
        if (field[k] === undefined || nc < field[k]) {
          field[k] = nc;
          frontier.push({ x: nx, y: ny, c: nc });
        }
      }
    }
    return field;
  };

  /* every tile within the given ranges of an origin */
  FE.rangeTiles = function (state, ox, oy, ranges) {
    var out = {};
    if (!ranges || !ranges.length) return out;
    var max = Math.max.apply(null, ranges);
    for (var dy = -max; dy <= max; dy++) {
      for (var dx = -max; dx <= max; dx++) {
        var dist = Math.abs(dx) + Math.abs(dy);
        if (ranges.indexOf(dist) === -1) continue;
        var x = ox + dx, y = oy + dy;
        if (!FE.inBounds(state, x, y)) continue;
        out[key(x, y)] = dist;
      }
    }
    return out;
  };

  /* all tiles this unit could attack, from anywhere it can move */
  FE.threatTiles = function (state, u, ignoreUnits) {
    var reach = FE.reachable(state, u, ignoreUnits);
    var ranges = FE.attackRanges(u);
    var out = {};
    Object.keys(reach).forEach(function (k) {
      var p = k.split(','), x = +p[0], y = +p[1];
      var tiles = FE.rangeTiles(state, x, y, ranges);
      Object.keys(tiles).forEach(function (t) { out[t] = 1; });
    });
    return out;
  };

  /* union of every living enemy's threat — the danger zone overlay */
  FE.dangerZone = function (state) {
    var out = {};
    state.units.forEach(function (u) {
      if (!u.alive || u.faction !== 'enemy') return;
      if (state.fogOn && !FE.isVisible(state, u.x, u.y)) return;
      var t = FE.threatTiles(state, u, true);
      Object.keys(t).forEach(function (k) { out[k] = 1; });
    });
    return out;
  };

  FE.dist = function (a, b) { return Math.abs(a.x - b.x) + Math.abs(a.y - b.y); };

  FE.DIRS = DIRS;
  FE.posKey = key;

})(window.FE = window.FE || {});
