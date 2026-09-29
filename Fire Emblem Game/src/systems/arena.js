/* ------------------------------------------------------------------
   THE ARENA
   Opponents are built to threaten the specific unit that walked in.
   The old generator produced a fixed pool at the unit's own level with
   iron weapons, which meant an armour knight with 11 defence could not
   be scratched by anything it ever met. A matchup that cannot hurt you
   is not a gamble, so the generator now proves it can before returning.
------------------------------------------------------------------ */
(function (FE) {
  'use strict';

  FE.ARENA_CAP = 7;            /* rounds per unit per chapter */

  /* class -> the weapons it can be issued, cheapest tier first */
  var KIT = {
    mercenary: ['ironsword', 'steelsword', 'silversword', 'killingedge'],
    myrmidon:  ['ironsword', 'steelsword', 'killingedge', 'silversword'],
    soldier:   ['ironlance', 'steellance', 'silverlance', 'killerlance'],
    cavalier:  ['ironlance', 'steellance', 'silverlance', 'killerlance'],
    knight:    ['ironlance', 'steellance', 'silverlance', 'killerlance'],
    fighter:   ['ironaxe', 'steelaxe', 'silveraxe', 'killeraxe'],
    brigand:   ['ironaxe', 'steelaxe', 'silveraxe', 'killeraxe'],
    archer:    ['ironbow', 'steelbow', 'silverbow', 'killerbow'],
    mage:      ['fire', 'thunder', 'elfire', 'elfire'],
    shaman:    ['flux', 'flux', 'luna', 'luna']
  };

  /* specialists the arena reaches for when the plain kit bounces off */
  var COUNTER_KIT = {
    armor:      [['fighter', 'hammer'], ['mercenary', 'armorslayer'], ['mage', 'thunder'], ['shaman', 'luna']],
    armorhorse: [['fighter', 'hammer'], ['mercenary', 'armorslayer'], ['mage', 'thunder']],
    horse:      [['soldier', 'horseslayer'], ['mage', 'thunder'], ['fighter', 'steelaxe']],
    fly:        [['archer', 'steelbow'], ['archer', 'killerbow'], ['mage', 'thunder']],
    foot:       [['mage', 'thunder'], ['shaman', 'luna'], ['fighter', 'steelaxe']],
    thief:      [['mage', 'thunder'], ['fighter', 'steelaxe'], ['archer', 'steelbow']]
  };

  var POOL = ['mercenary', 'myrmidon', 'soldier', 'cavalier', 'knight', 'fighter', 'archer', 'mage', 'shaman'];

  /* a throwaway 1x2 arena floor used purely to run the combat maths */
  function sandbox() {
    return {
      map: { w: 2, h: 1, tiles: [['plain', 'plain']] },
      units: [], openedDoors: {}, openedChests: {}, fogOn: false,
      rng: new FE.Rng(1)
    };
  }

  function blank(u) {
    var c = JSON.parse(JSON.stringify(u));
    c._sup = { dmg: 0, hit: 0, crit: 0, avo: 0, dodge: 0 };
    return c;
  }

  function build(clsKey, level, weaponKey) {
    var o = FE.makeEnemy({ cls: clsKey, level: Math.max(1, level), x: 1, y: 0, items: [weaponKey] }, null);
    o._sup = { dmg: 0, hit: 0, crit: 0, avo: 0, dodge: 0 };
    o.faction = 'enemy';
    o.arena = true;
    return o;
  }

  /* what this pairing would actually do to the unit, per exchange */
  function threat(u, opp) {
    var st = sandbox();
    var me = blank(u);
    me.uid = 1; me.faction = 'player'; me.x = 0; me.y = 0; me.alive = true;
    opp.x = 1; opp.y = 0; opp.alive = true;
    st.units = [me, opp];

    var oppWep = FE.equipped(opp);
    var myWep = FE.equipped(me);
    if (!oppWep || !myWep) return null;

    var toMe = FE.forecast(st, opp, me, oppWep);
    var toThem = FE.forecast(st, me, opp, myWep);
    if (!toMe || !toThem) return null;

    var incoming = toMe.atk.dmg * (toMe.atk.doubles ? 2 : 1) * (toMe.atk.hit / 100);
    var outgoing = toThem.atk.dmg * (toThem.atk.doubles ? 2 : 1) * (toThem.atk.hit / 100);
    return {
      perHit: toMe.atk.dmg,
      incoming: incoming,
      outgoing: outgoing,
      oppHp: opp.maxhp,
      turnsToKillMe: incoming > 0 ? me.maxhp / incoming : 99,
      turnsToKillIt: outgoing > 0 ? opp.maxhp / outgoing : 99
    };
  }

  var TIER = [0, 0, 1, 1, 2, 2, 3];   /* weapon tier by round */

  /* Generate round N's opponent for this unit. Guarantees the opponent can
     deal real damage; escalates weapon, then class, then level until it can. */
  FE.arenaOpponent = function (u, round, seed) {
    var promoted = FE.CLASSES[u.cls].tier === 1;
    var baseLevel = u.level + 1 + Math.floor(round / 2) + (promoted ? 10 : 0);
    var tier = TIER[Math.min(round, TIER.length) - 1] || 0;
    var moveType = FE.CLASSES[u.cls].moveType;

    /* a hit that cannot remove at least this much is not a fight */
    var floorDamage = Math.max(3, Math.ceil(u.maxhp * 0.12));

    var candidates = [];

    /* the ordinary pool, rotated so the same unit does not meet the same
       opponent every visit */
    POOL.forEach(function (cls, i) {
      var kit = KIT[cls];
      if (!kit) return;
      var wep = kit[Math.min(tier, kit.length - 1)];
      candidates.push({ cls: cls, wep: wep, level: baseLevel, order: (i + round + (seed || 0)) % POOL.length });
    });
    candidates.sort(function (a, b) { return a.order - b.order; });

    /* specialists picked for this unit's weakness, tried when the pool fails */
    (COUNTER_KIT[moveType] || COUNTER_KIT.foot).forEach(function (pair) {
      candidates.push({ cls: pair[0], wep: pair[1], level: baseLevel, counter: true });
    });

    var best = null, bestScore = -1e9;

    for (var pass = 0; pass < 4; pass++) {
      for (var i = 0; i < candidates.length; i++) {
        var c = candidates[i];
        var opp = build(c.cls, c.level + pass * 2, c.wep);
        var t = threat(u, opp);
        if (!t) continue;

        /* a good arena bout: it can hurt you, you can still win, and it is
           not a coin flip that kills you outright */
        var lethalNow = t.perHit >= u.hp;
        var score = 0;
        if (t.perHit >= floorDamage) score += 100;
        else score -= (floorDamage - t.perHit) * 20;
        if (lethalNow) score -= 60;
        /* prefer fights that last two to four exchanges */
        score -= Math.abs(t.turnsToKillIt - 3) * 6;
        score -= Math.abs(t.turnsToKillMe - 4) * 4;
        if (c.counter) score -= 8;          /* plain matchups first */

        if (score > bestScore) { bestScore = score; best = opp; }
        /* good enough: stop hunting */
        if (t.perHit >= floorDamage && !lethalNow && t.turnsToKillIt <= 5) {
          return opp;
        }
      }
    }
    return best || build('mercenary', baseLevel, 'steelsword');
  };

  /* ---------------- the bout ---------------- */

  /* Runs a whole duel and returns the blow-by-blow log for the animation.
     Initiative alternates, so the player does not simply get first strike
     every single round. */
  FE.arenaFight = function (unit, opp, rng) {
    var st = sandbox();
    st.rng = rng || new FE.Rng((Date.now() ^ (unit.level * 7919)) >>> 0);

    var me = blank(unit);
    me.uid = 1; me.faction = 'player'; me.x = 0; me.y = 0; me.alive = true;
    me.expLocked = false;
    opp.uid = 2; opp.x = 1; opp.y = 0; opp.faction = 'enemy'; opp.alive = true;
    st.units = [me, opp];

    var myWep = FE.equipped(me);
    if (!myWep) return { error: 'no weapon' };

    var log = [];
    var guard = 0;
    var playerFirst = true;

    while (me.alive && opp.alive && guard++ < 10) {
      var a = playerFirst ? me : opp;
      var b = playerFirst ? opp : me;
      var wep = FE.equipped(a);
      if (!wep) break;
      log.push({ type: 'round', initiator: a.uid });
      log = log.concat(FE.resolveCombat(st, a, b, wep));
      playerFirst = !playerFirst;
    }

    return {
      won: !opp.alive && me.alive,
      me: me,
      opp: opp,
      log: log,
      exhausted: guard >= 10
    };
  };

  /* both sides' numbers, for the pre-fight panel */
  FE.arenaPreview = function (u, opp) {
    var st = sandbox();
    var me = blank(u);
    me.uid = 1; me.faction = 'player'; me.x = 0; me.y = 0; me.alive = true;
    var o = blank(opp);
    o.uid = 2; o.x = 1; o.y = 0; o.alive = true;
    st.units = [me, o];
    var myWep = FE.equipped(me), oppWep = FE.equipped(o);
    if (!myWep || !oppWep) return null;
    var mine = FE.forecast(st, me, o, myWep);
    var theirs = FE.forecast(st, o, me, oppWep);
    return {
      me: mine && mine.atk, them: theirs && theirs.atk,
      myWeapon: FE.itemData(myWep).name,
      oppWeapon: FE.itemData(oppWep).name
    };
  };

  /* gold is now a consolation, not the point — the unit walks in for the
     experience and walks out having risked its neck for it */
  FE.arenaPurse = function (u, round) {
    var base = 25 + u.level * 8;
    var decay = round <= 2 ? 1 : (round <= 4 ? 0.7 : 0.45);
    return Math.round(base * decay);
  };

  FE.arenaRoundsLeft = function (state, u) {
    var used = (state.arenaRounds && state.arenaRounds[u.id]) || 0;
    return Math.max(0, FE.ARENA_CAP - used);
  };

  FE.arenaSpendRound = function (state, u) {
    state.arenaRounds = state.arenaRounds || {};
    state.arenaRounds[u.id] = ((state.arenaRounds[u.id]) || 0) + 1;
  };

})(window.FE = window.FE || {});
