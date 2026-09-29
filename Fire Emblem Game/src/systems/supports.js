/* ------------------------------------------------------------------
   SUPPORTS
   Points accrue for ending a turn adjacent and for fighting in the same
   battle. C / B / A grant stacking combat bonuses while adjacent,
   weighted by affinity. Conversations are a later pass; the mechanics
   work without a word of dialogue.
------------------------------------------------------------------ */
(function (FE) {
  'use strict';

  /* per-rank contribution of each affinity, in "points" */
  var AFFINITY = {
    fire:    { dmg: 0.5, hit: 2.5, crit: 0,   avo: 0,   dodge: 0 },
    wind:    { dmg: 0,   hit: 2.5, crit: 2.5, avo: 2.5, dodge: 0 },
    thunder: { dmg: 0,   hit: 0,   crit: 2.5, avo: 2.5, dodge: 2.5 },
    ice:     { dmg: 0.5, hit: 0,   crit: 0,   avo: 0,   dodge: 2.5 },
    light:   { dmg: 0,   hit: 2.5, crit: 0,   avo: 2.5, dodge: 2.5 },
    dark:    { dmg: 0.5, hit: 2.5, crit: 2.5, avo: 0,   dodge: 0 },
    anima:   { dmg: 0.5, hit: 1.5, crit: 1.5, avo: 1.5, dodge: 1.5 }
  };
  FE.AFFINITY = AFFINITY;

  FE.AFFINITY_NAME = {
    fire: 'Fire', wind: 'Wind', thunder: 'Thunder', ice: 'Ice',
    light: 'Light', dark: 'Dark', anima: 'Anima'
  };

  var THRESHOLD = { C: 25, B: 60, A: 110 };
  FE.SUPPORT_THRESHOLD = THRESHOLD;
  FE.MAX_PARTNERS = 5;

  FE.supportRank = function (points) {
    if (points >= THRESHOLD.A) return 'A';
    if (points >= THRESHOLD.B) return 'B';
    if (points >= THRESHOLD.C) return 'C';
    return null;
  };

  var RANKVAL = { C: 1, B: 2, A: 3 };

  /* recompute every player unit's adjacency bonus block */
  FE.recomputeSupports = function (state) {
    var units = state.units;
    var byPos = {};
    units.forEach(function (u) { if (u.alive) byPos[u.x + ',' + u.y] = u; });

    units.forEach(function (u) {
      u._sup = { dmg: 0, hit: 0, crit: 0, avo: 0, dodge: 0 };
      if (!u.alive || !u.supports) return;
      var adj = [[1, 0], [-1, 0], [0, 1], [0, -1]];
      for (var i = 0; i < adj.length; i++) {
        var o = byPos[(u.x + adj[i][0]) + ',' + (u.y + adj[i][1])];
        if (!o || o.faction !== u.faction) continue;
        var pts = u.supports[o.id];
        if (!pts) continue;
        var rank = FE.supportRank(pts);
        if (!rank) continue;
        var mult = RANKVAL[rank];
        var a = AFFINITY[u.affinity] || AFFINITY.anima;
        var b = AFFINITY[o.affinity] || AFFINITY.anima;
        ['dmg', 'hit', 'crit', 'avo', 'dodge'].forEach(function (k) {
          u._sup[k] += (a[k] + b[k]) * mult;
        });
      }
      ['dmg', 'hit', 'crit', 'avo', 'dodge'].forEach(function (k) {
        u._sup[k] = Math.floor(u._sup[k]);
      });
    });
  };

  FE.supportBonus = function (u, kind) {
    return (u._sup && u._sup[kind]) || 0;
  };

  /* award points to every adjacent same-faction pair — called at end of player phase */
  FE.tickSupports = function (state, amount) {
    var byPos = {};
    state.units.forEach(function (u) { if (u.alive) byPos[u.x + ',' + u.y] = u; });
    var adj = [[1, 0], [0, 1]];   /* each pair counted once */
    state.units.forEach(function (u) {
      if (!u.alive || u.faction !== 'player' || !u.supports) return;
      for (var i = 0; i < adj.length; i++) {
        var o = byPos[(u.x + adj[i][0]) + ',' + (u.y + adj[i][1])];
        if (!o || o.faction !== 'player' || !o.supports) continue;
        FE.addSupport(u, o, amount);
      }
    });
  };

  FE.addSupport = function (a, b, amount) {
    if (!a.supports || !b.supports) return;
    var aPartners = Object.keys(a.supports).filter(function (k) { return FE.supportRank(a.supports[k]); });
    var bPartners = Object.keys(b.supports).filter(function (k) { return FE.supportRank(b.supports[k]); });
    var aHas = a.supports[b.id] !== undefined && FE.supportRank(a.supports[b.id]);
    var bHas = b.supports[a.id] !== undefined && FE.supportRank(b.supports[a.id]);
    if (!aHas && aPartners.length >= FE.MAX_PARTNERS) return;
    if (!bHas && bPartners.length >= FE.MAX_PARTNERS) return;

    var before = FE.supportRank(a.supports[b.id] || 0);
    a.supports[b.id] = (a.supports[b.id] || 0) + amount;
    b.supports[a.id] = (b.supports[a.id] || 0) + amount;
    /* only one A rank per unit */
    if (a.supports[b.id] >= FE.SUPPORT_THRESHOLD.A) {
      var hasA = Object.keys(a.supports).some(function (k) { return k !== b.id && a.supports[k] >= FE.SUPPORT_THRESHOLD.A; });
      var hasA2 = Object.keys(b.supports).some(function (k) { return k !== a.id && b.supports[k] >= FE.SUPPORT_THRESHOLD.A; });
      if (hasA || hasA2) {
        a.supports[b.id] = FE.SUPPORT_THRESHOLD.A - 1;
        b.supports[a.id] = FE.SUPPORT_THRESHOLD.A - 1;
      }
    }
    var after = FE.supportRank(a.supports[b.id]);
    if (after && after !== before) return { a: a, b: b, rank: after };
    return null;
  };

  FE.supportList = function (u, state) {
    var out = [];
    if (!u.supports) return out;
    Object.keys(u.supports).forEach(function (id) {
      var rank = FE.supportRank(u.supports[id]);
      var other = null;
      for (var i = 0; i < state.units.length; i++) if (state.units[i].id === id) { other = state.units[i]; break; }
      out.push({ id: id, name: other ? other.name : id, points: u.supports[id], rank: rank });
    });
    out.sort(function (a, b) { return b.points - a.points; });
    return out;
  };

})(window.FE = window.FE || {});
