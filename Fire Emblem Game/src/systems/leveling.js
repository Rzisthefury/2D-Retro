/* ------------------------------------------------------------------
   EXPERIENCE, LEVEL UP, PROMOTION
   100 exp = one level. Cap 20 per tier.
   Effective level = level + classPower (promoted counts +20), so a
   promoted unit farming level-3 soldiers earns almost nothing.
------------------------------------------------------------------ */
(function (FE) {
  'use strict';

  FE.LEVEL_CAP = 20;
  FE.PROMOTE_MIN = 10;

  function eff(u) { return u.level + (FE.CLASSES[u.cls].classPower || 0); }

  /* small exp for landing a hit */
  FE.hitExp = function (att, def) {
    var diff = eff(def) - eff(att);
    var x = Math.floor((31 + diff) / 3);
    return Math.max(1, Math.min(30, x));
  };

  /* the real payout */
  FE.killExp = function (att, def) {
    var da = eff(att), dd = eff(def);
    var base = FE.hitExp(att, def);
    var bonus = (dd * 3 + 20) - (da * 3 + 20);
    var total = base + 20 + Math.max(0, bonus);
    if (def.boss) total += 40;
    return Math.max(1, Math.min(100, total));
  };

  FE.awardCombatExp = function (state, att, def, killed, log) {
    if (att.faction !== 'player') return;
    if (att.expLocked) return;
    var amt = killed ? FE.killExp(att, def) : FE.hitExp(att, def);
    amt = Math.round(amt * (state.expRate || 1));
    FE.gainExp(state, att, amt, log);
  };

  FE.awardStaffExp = function (state, user, healed, log) {
    if (user.faction !== 'player') return;
    var amt = Math.max(8, Math.floor(healed * 1.8) + 10 - Math.floor(user.level / 2));
    amt = Math.round(amt * (state.expRate || 1));
    FE.gainExp(state, user, amt, log);
  };

  FE.gainExp = function (state, u, amount, log) {
    if (u.level >= FE.LEVEL_CAP && FE.CLASSES[u.cls].tier === 1) {
      /* capped: no more exp */
      return;
    }
    if (u.level >= FE.LEVEL_CAP && FE.CLASSES[u.cls].tier === 0) {
      /* sitting at 20 unpromoted — exp stops until promotion */
      u.exp = 99;
      return;
    }
    u.exp += amount;
    log.push({ type: 'exp', unit: u.uid, amount: amount });
    while (u.exp >= 100) {
      u.exp -= 100;
      var gains = FE.levelUp(state, u);
      log.push({ type: 'levelup', unit: u.uid, gains: gains, level: u.level });
      if (u.level >= FE.LEVEL_CAP) { u.exp = Math.min(u.exp, 99); break; }
    }
  };

  var STATS = ['hp', 'str', 'mag', 'skl', 'spd', 'lck', 'def', 'res'];

  FE.levelUp = function (state, u) {
    u.level++;
    var caps = FE.CLASSES[u.cls].caps;
    var gains = {};
    var any = false;

    STATS.forEach(function (s) {
      var cur = (s === 'hp') ? u.maxhp : u[s];
      var cap = caps[s];
      if (cur >= cap) { gains[s] = 0; return; }
      var rate = (u.growth && u.growth[s]) || 0;
      /* rates above 100 guarantee one point and roll for a second */
      var got = 0;
      if (rate >= 100) { got = 1; rate -= 100; }
      if (state.rng.chance(rate)) got++;
      gains[s] = got;
      if (got) any = true;
    });

    /* no dud levels: force the highest-growth uncapped stat */
    if (!any) {
      var bestStat = null, bestRate = -1;
      STATS.forEach(function (s) {
        var cur = (s === 'hp') ? u.maxhp : u[s];
        if (cur >= caps[s]) return;
        var r = (u.growth && u.growth[s]) || 0;
        if (r > bestRate) { bestRate = r; bestStat = s; }
      });
      if (bestStat) gains[bestStat] = 1;
    }

    STATS.forEach(function (s) {
      if (!gains[s]) return;
      if (s === 'hp') { u.maxhp += gains[s]; u.hp += gains[s]; }
      else u[s] += gains[s];
    });
    FE.clampStats(u);
    return gains;
  };

  /* ---------------- promotion ---------------- */

  FE.canPromote = function (u) {
    var cl = FE.CLASSES[u.cls];
    if (cl.tier !== 0) return false;
    if (u.level < FE.PROMOTE_MIN) return false;
    return cl.promotions && cl.promotions.length > 0;
  };

  FE.promotionItemFor = function (u) {
    var out = null;
    Object.keys(FE.WEAPONS).forEach(function (k) {
      var d = FE.WEAPONS[k];
      if (d.use === 'promote' && d.forClasses && d.forClasses.indexOf(u.cls) !== -1) out = k;
    });
    return out;
  };

  FE.promote = function (state, u, toClassKey) {
    var from = FE.CLASSES[u.cls];
    var to = FE.CLASSES[toClassKey];
    if (!to) return null;
    var bonus = to.promoBonus || {};
    u.cls = toClassKey;
    u.level = 1;
    u.exp = 0;
    u.maxhp += (bonus.hp || 0);
    u.hp = u.maxhp;
    ['str', 'mag', 'skl', 'spd', 'def', 'res', 'con'].forEach(function (s) {
      u[s] += (bonus[s] || 0);
    });
    u.mov = to.mov;
    FE.clampStats(u);
    return { from: from.name, to: to.name, bonus: bonus };
  };

  /* ---------------- stat boosters ---------------- */

  FE.applyBooster = function (u, item) {
    var d = FE.itemData(item);
    if (d.use !== 'boost') return null;
    var caps = FE.CLASSES[u.cls].caps;
    if (d.stat === 'hp') {
      var room = caps.hp - u.maxhp;
      var gain = Math.min(d.amount, room);
      u.maxhp += gain; u.hp += gain;
      return { stat: 'HP', amount: gain };
    }
    var room2 = caps[d.stat] - u[d.stat];
    var gain2 = Math.min(d.amount, room2);
    u[d.stat] += gain2;
    return { stat: d.stat.toUpperCase(), amount: gain2 };
  };

})(window.FE = window.FE || {});
