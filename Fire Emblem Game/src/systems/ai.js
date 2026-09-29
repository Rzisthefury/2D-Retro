/* ------------------------------------------------------------------
   ENEMY AI
     aggressive — charges anything it can reach
     dormant    — holds until a player unit enters its threat range
     guard      — never leaves its starting tile's neighbourhood
     boss       — never leaves the throne, counters anything adjacent
     raider     — beelines for villages, ignores you
     passive    — does nothing (recruitable NPCs standing around)
------------------------------------------------------------------ */
(function (FE) {
  'use strict';

  function scoreTarget(state, u, target, item, fromX, fromY) {
    var saveX = u.x, saveY = u.y;
    u.x = fromX; u.y = fromY;
    var fc = FE.forecast(state, u, target, item);
    u.x = saveX; u.y = saveY;
    if (!fc || !fc.atk) return null;

    var out = FE.expectedDamage(fc);
    var score = out;

    /* killing is worth a great deal */
    var hits = fc.atk.doubles ? 2 : 1;
    if (fc.atk.dmg * hits >= target.hp) score += 50 * (fc.atk.hit / 100);

    /* prefer squishy, wounded, and high-value targets */
    score += (target.maxhp - target.hp) * 0.3;
    if (target.lord) score += 8;

    /* what the counter would cost me */
    if (fc.def) {
      var back = FE.expectedDamage({ atk: fc.def });
      score -= back * 0.8;
      if (back >= u.hp) score -= 25;
    }
    return { score: score, fc: fc, item: item, x: fromX, y: fromY, target: target };
  }

  function bestAttack(state, u, stand, targets) {
    var weapons = FE.usableWeapons(u);
    if (!weapons.length) return null;
    var best = null;
    var positions = Object.keys(stand);

    for (var t = 0; t < targets.length; t++) {
      var target = targets[t];
      for (var w = 0; w < weapons.length; w++) {
        var d = FE.itemData(weapons[w]);
        for (var p = 0; p < positions.length; p++) {
          var pp = positions[p].split(','), px = +pp[0], py = +pp[1];
          var dist = Math.abs(px - target.x) + Math.abs(py - target.y);
          if (dist < d.rng[0] || dist > d.rng[1]) continue;
          var s = scoreTarget(state, u, target, weapons[w], px, py);
          if (!s) continue;
          /* prefer staying further away when the weapon allows it */
          s.score += dist * 0.1;
          if (!best || s.score > best.score) best = s;
        }
      }
    }
    /* The score picks WHICH attack, never whether to attack. An enemy that can
       reach one of your units commits, even when the counter will hurt. */
    return best;
  }

  /* walk as far toward a tile as this turn allows, steering by real path cost
     rather than straight-line distance so terrain cannot deadlock the unit */
  function stepToward(state, u, stand, tx, ty) {
    var field = FE.distanceField(state, u, tx, ty);
    var here = FE.posKey(u.x, u.y);
    var bestK = null, bestD = field[here] === undefined ? 1e9 : field[here], bestCost = 1e9;
    Object.keys(stand).forEach(function (k) {
      var f = field[k];
      if (f === undefined) return;
      if (f < bestD || (f === bestD && bestK && stand[k] < bestCost)) {
        var p = k.split(',');
        bestD = f; bestK = { x: +p[0], y: +p[1] }; bestCost = stand[k];
      }
    });
    /* nothing closer is reachable — fall back to straight-line so it still shuffles */
    if (!bestK) {
      var fbD = 1e9;
      Object.keys(stand).forEach(function (k) {
        var p = k.split(','), x = +p[0], y = +p[1];
        var d = Math.abs(x - tx) + Math.abs(y - ty);
        if (d < fbD) { fbD = d; bestK = { x: x, y: y }; }
      });
    }
    return bestK;
  }

  /* nearest unit this one is actually hostile to */
  function nearestHostile(state, u) {
    var best = null, bd = 1e9;
    state.units.forEach(function (o) {
      if (!o.alive || !FE.hostile(u, o)) return;
      var d = FE.dist(u, o);
      if (d < bd) { bd = d; best = o; }
    });
    return best;
  }

  /* Which village this raider is going for. An authored assignment wins, so a
     chapter can guarantee a fair race; otherwise pick by real path cost, since
     straight-line distance lies badly when a river sits in between. */
  function nearestVillage(state, u) {
    var live = (state.villages || []).filter(function (v) { return !v.done; });
    if (!live.length) return null;

    if (u.targetVillage) {
      var assigned = null;
      live.forEach(function (v) {
        if (v.x === u.targetVillage.x && v.y === u.targetVillage.y) assigned = v;
      });
      if (assigned) return assigned;
    }

    var best = null, bd = 1e9;
    live.forEach(function (v) {
      var field = FE.distanceField(state, u, v.x, v.y);
      var cost = field[FE.posKey(u.x, u.y)];
      if (cost === undefined) cost = 1e8 + Math.abs(v.x - u.x) + Math.abs(v.y - u.y);
      if (cost < bd) { bd = cost; best = v; }
    });
    return best;
  }

  /* decide one enemy unit's whole turn; returns an action object */
  FE.aiDecide = function (state, u) {
    var mode = u.ai || 'dormant';
    if (mode === 'passive') return { type: 'wait' };

    var reach = FE.reachable(state, u);
    var stand = FE.standable(state, u, reach);
    stand[FE.posKey(u.x, u.y)] = reach[FE.posKey(u.x, u.y)] || 0;

    var targets = state.units.filter(function (o) {
      return o.alive && FE.hostile(u, o);
    });

    /* ---- raider: go break a village ---- */
    if (mode === 'raider') {
      var v = nearestVillage(state, u);
      if (v) {
        if (u.x === v.x && u.y === v.y) return { type: 'raze', village: v };
        var k = FE.posKey(v.x, v.y);
        if (stand[k] !== undefined) return { type: 'move', x: v.x, y: v.y, then: { type: 'raze', village: v } };
        var st = stepToward(state, u, stand, v.x, v.y);
        if (st) return { type: 'move', x: st.x, y: st.y };
        return { type: 'wait' };
      }
      mode = 'aggressive';
    }

    /* ---- boss: never leaves ---- */
    if (mode === 'boss') {
      /* Reach is whatever the boss is actually holding, not a hardcoded two.
         A siege tome has a range of ten, and a boss that cannot use it is just
         a throne with extra defence. */
      var ranges = FE.attackRanges(u);
      var reachMax = ranges.length ? Math.max.apply(null, ranges) : 1;
      var adj = targets.filter(function (o) { return FE.dist(u, o) <= reachMax; });
      var only = {};
      only[FE.posKey(u.x, u.y)] = 0;
      var atk = bestAttack(state, u, only, adj);
      if (atk) return { type: 'attack', x: u.x, y: u.y, target: atk.target, item: atk.item };
      return { type: 'wait' };
    }

    /* ---- guard: only acts near home ---- */
    if (mode === 'guard') {
      var homeStand = {};
      Object.keys(stand).forEach(function (k) {
        var p = k.split(','), x = +p[0], y = +p[1];
        if (Math.abs(x - u.homeX) + Math.abs(y - u.homeY) <= 3) homeStand[k] = stand[k];
      });
      var ga = bestAttack(state, u, homeStand, targets);
      if (ga) return { type: 'attack', x: ga.x, y: ga.y, target: ga.target, item: ga.item };
      return { type: 'wait' };
    }

    /* ---- dormant: wake when a player enters my threat ---- */
    if (mode === 'dormant' && !u.awake) {
      var threat = FE.threatTiles(state, u, true);
      var woke = targets.some(function (o) { return threat[FE.posKey(o.x, o.y)]; });
      if (!woke) return { type: 'wait' };
      u.awake = true;
    }

    /* ---- aggressive / woken ---- */
    var a = bestAttack(state, u, stand, targets);
    if (a) return { type: 'attack', x: a.x, y: a.y, target: a.target, item: a.item };

    /* nothing in reach — advance, but a healer heals instead */
    var staff = FE.equippedStaff(u);
    if (staff) {
      var hurt = state.units.filter(function (o) {
        return o.alive && o.faction === u.faction && o.hp < o.maxhp;
      });
      if (hurt.length) {
        hurt.sort(function (p, q) { return (p.hp / p.maxhp) - (q.hp / q.maxhp); });
        var h = hurt[0];
        var sr = FE.staffRanges(u);
        var spots = Object.keys(stand);
        for (var i = 0; i < spots.length; i++) {
          var sp = spots[i].split(','), sx = +sp[0], sy = +sp[1];
          var dd = Math.abs(sx - h.x) + Math.abs(sy - h.y);
          if (sr.indexOf(dd) !== -1) return { type: 'staff', x: sx, y: sy, target: h, item: staff };
        }
      }
    }

    /* head for the nearest target we can actually walk to. Without this a unit
       will march at whoever is closest as the crow flies and then stand on a
       riverbank forever because the only bridge is behind it. */
    var sorted = targets.slice().sort(function (p, q) { return FE.dist(u, p) - FE.dist(u, q); });
    for (var t2 = 0; t2 < sorted.length; t2++) {
      var cand = sorted[t2];
      var field = FE.distanceField(state, u, cand.x, cand.y);
      if (field[FE.posKey(u.x, u.y)] === undefined) continue;   /* unreachable */
      var s2 = stepToward(state, u, stand, cand.x, cand.y);
      if (s2 && (s2.x !== u.x || s2.y !== u.y)) return { type: 'move', x: s2.x, y: s2.y };
      break;
    }
    var np = nearestHostile(state, u);
    if (np) {
      var s3 = stepToward(state, u, stand, np.x, np.y);
      if (s3 && (s3.x !== u.x || s3.y !== u.y)) return { type: 'move', x: s3.x, y: s3.y };
    }
    return { type: 'wait' };
  };

})(window.FE = window.FE || {});
