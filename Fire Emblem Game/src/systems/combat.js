/* ------------------------------------------------------------------
   COMBAT
   Forecast and resolution, GBA rules:
     Atk        = Str/Mag + Mt (x3 vs effective) + triangle
     Damage     = Atk - (Def or Res) - terrain Def
     Hit        = WHit + Skl*2 + Lck/2 + triangle +-15
     Displayed  = Hit - target Avoid, rolled 2RN
     Crit       = WCrit + Skl/2 + class - target Lck, x3 damage
     Doubling   = AS >= target AS + 4
------------------------------------------------------------------ */
(function (FE) {
  'use strict';

  function terrainDefOf(state, u) {
    var t = FE.tileAt(state, u.x, u.y);
    return t ? (FE.TERRAIN[t].def || 0) : 0;
  }
  function terrainAvoOf(state, u) {
    var t = FE.tileAt(state, u.x, u.y);
    return t ? (FE.TERRAIN[t].avo || 0) : 0;
  }

  /* weapon a unit would counter with at the given distance */
  FE.counterWeapon = function (u, distance) {
    var best = null, bestAtk = -1;
    FE.usableWeapons(u).forEach(function (it) {
      var d = FE.itemData(it);
      if (distance < d.rng[0] || distance > d.rng[1]) return;
      var a = (d.magic ? u.mag : u.str) + d.mt;
      if (a > bestAtk) { bestAtk = a; best = it; }
    });
    return best;
  };

  /* one side's numbers in a matchup */
  function side(state, att, def, item, distance) {
    if (!item) return null;
    var d = FE.itemData(item);
    if (!d) return null;

    var defItem = FE.counterWeapon(def, distance);
    var defType = defItem ? FE.itemData(defItem).type : null;
    var tri = FE.triangle(d.type, defType);

    var mult = FE.effectiveMult(item, def);
    var might = d.mt * mult;
    var base = d.magic ? att.mag : att.str;
    var atk = base + might + tri * FE.TRIANGLE_MT + FE.supportBonus(att, 'dmg');

    var resist;
    if (d.ignoreRes) resist = 0;
    else resist = d.magic ? def.res : def.def;
    var terr = terrainDefOf(state, def);
    if (FE.CLASSES[att.cls].pierce) terr = 0;

    var dmg = Math.max(0, atk - resist - terr);

    var hit = FE.hitStat(att, item) + tri * FE.TRIANGLE_HIT;
    var defAvo = FE.avoidStat(def, defItem, FE.tileAt(state, def.x, def.y));
    var acc = Math.max(0, Math.min(100, hit - defAvo));

    var crit = Math.max(0, FE.critStat(att, item) - FE.dodgeStat(def));

    var as = FE.attackSpeed(att, item);
    var defAs = FE.attackSpeed(def, defItem);

    return {
      unit: att, target: def, item: item, data: d,
      atk: atk, dmg: dmg, hit: acc, crit: crit,
      as: as, doubles: as >= defAs + 4,
      triangle: tri, effective: mult > 1,
      magic: !!d.magic
    };
  }

  /* full two-sided forecast */
  FE.forecast = function (state, att, def, item) {
    var distance = FE.dist(att, def);
    var a = side(state, att, def, item, distance);
    if (!a) return null;
    var defItem = FE.counterWeapon(def, distance);
    var b = defItem ? side(state, def, att, defItem, distance) : null;
    return { distance: distance, atk: a, def: b };
  };

  /* how many HP would a full exchange remove, roughly — used by the AI */
  FE.expectedDamage = function (fc) {
    if (!fc || !fc.atk) return 0;
    var hits = fc.atk.doubles ? 2 : 1;
    var perHit = fc.atk.dmg * (fc.atk.hit / 100);
    var critBonus = fc.atk.dmg * 2 * (fc.atk.hit / 100) * (fc.atk.crit / 100);
    return (perHit + critBonus) * hits;
  };

  /* ---------------- resolution ---------------- */

  function strike(state, s, log) {
    var att = s.unit, def = s.target;
    if (!att.alive || !def.alive) return;

    var ev = { type: 'strike', attacker: att.uid, defender: def.uid, weapon: s.item.key };

    if (!state.rng.hit(s.hit)) {
      ev.miss = true;
      log.push(ev);
      FE.spendUse(att, s.item, log);
      return;
    }

    var isCrit = s.crit > 0 && state.rng.chance(s.crit);
    var dmg = isCrit ? s.dmg * 3 : s.dmg;

    /* Assassin silencer: a crit against a non-boss is lethal */
    if (isCrit && FE.CLASSES[att.cls].silencer && !def.boss) dmg = def.hp;

    ev.crit = isCrit;
    ev.damage = dmg;
    def.hp -= dmg;
    /* terrain regeneration is suppressed for a round after taking a hit, so a
       boss on a throne cannot simply out-heal whatever is left of your army */
    if (dmg > 0) def.hurtTurn = state.turn;

    if (s.data.drain) {
      var healed = Math.min(dmg, att.maxhp - att.hp);
      att.hp += healed;
      ev.drain = healed;
    }

    if (def.hp <= 0) {
      def.hp = 0;
      /* a two-phase boss stands back up instead */
      if (def.phase2) ev.phase2 = true;
      else ev.killed = true;
    }
    log.push(ev);
    FE.spendUse(att, s.item, log);

    /* experience */
    if (att.faction === 'player') {
      FE.awardCombatExp(state, att, def, ev.killed, log);
    }

    if (ev.phase2) FE.enterPhase2(state, def, log);
    if (ev.killed) FE.killUnit(state, def, att, log);
  };

  FE.spendUse = function (u, item, log) {
    if (!item || item.uses === null) return;
    item.uses--;
    if (item.uses <= 0) {
      var idx = u.items.indexOf(item);
      if (idx !== -1) u.items.splice(idx, 1);
      log.push({ type: 'break', unit: u.uid, weapon: item.key });
    }
  };

  /* ---------------- drops ---------------- */

  FE.DROP_CHANCE = 10;          /* percent, on a kill by one of your units */

  var DROP_CONSUMABLES = ['vulnerary', 'vulnerary', 'vulnerary', 'doorkey', 'chestkey', 'purewater'];
  var DROP_BOOSTERS = ['energyring', 'secretbook', 'speedwing', 'dracoshield', 'talisman', 'goddessicon', 'angelicrobe'];

  /* What a fallen enemy leaves behind. Rolled on the battle RNG, so undo
     rewinds the drop along with everything else. */
  function rollDrop(state, victim) {
    var r = state.rng.roll100();

    /* the weapon it was actually swinging — the satisfying one */
    if (r < 45) {
      var wep = FE.equipped(victim);
      if (wep) {
        var d = FE.itemData(wep);
        if (d && d.type !== 'item' && !d.personal) {
          return { kind: 'item', key: wep.key };
        }
      }
      r = 45;   /* nothing worth taking; fall through to the rest */
    }
    if (r < 75) {
      return { kind: 'item', key: DROP_CONSUMABLES[state.rng.int(DROP_CONSUMABLES.length)] };
    }
    if (r < 95) {
      var purse = 120 + victim.level * 35 + state.rng.int(80);
      return { kind: 'gold', amount: purse };
    }
    return { kind: 'item', key: DROP_BOOSTERS[state.rng.int(DROP_BOOSTERS.length)] };
  }

  FE.killUnit = function (state, u, killer, log) {
    u.alive = false;
    u.hp = 0;
    log.push({ type: 'death', unit: u.uid, name: u.name, faction: u.faction });

    /* a seldom drop from an ordinary kill, on top of any scripted one */
    if (killer && killer.faction === 'player' && u.faction === 'enemy' && !u.drop && !u.recruitable && !u.arena) {
      if (state.rng.chance(FE.DROP_CHANCE)) {
        var got = rollDrop(state, u);
        if (got.kind === 'gold') {
          state.gold += got.amount;
          log.push({ type: 'goldfound', amount: got.amount, x: u.x, y: u.y });
        } else {
          var it = FE.mkItem(got.key);
          if (killer.items.length < 5) killer.items.push(it);
          else state.convoy.push(it);
          log.push({ type: 'drop', unit: killer.uid, item: got.key, toConvoy: killer.items.length >= 5, x: u.x, y: u.y });
        }
      }
    }

    /* drop a held item */
    if (u.drop) {
      state.pendingDrops = state.pendingDrops || [];
      state.pendingDrops.push({ item: u.drop, x: u.x, y: u.y, by: killer ? killer.uid : null });
      if (killer && killer.faction === 'player' && killer.items.length < 5) {
        killer.items.push(FE.mkItem(u.drop));
        log.push({ type: 'pickup', unit: killer.uid, item: u.drop });
      }
    }
    if (u.faction === 'player') {
      state.benched = state.benched || [];
      if (state.benched.indexOf(u.id) === -1) state.benched.push(u.id);
    }
  };

  /* run a whole exchange */
  FE.resolveCombat = function (state, att, def, item) {
    var log = [];
    var fc = FE.forecast(state, att, def, item);
    if (!fc) return log;

    var a = fc.atk, b = fc.def;

    strike(state, a, log);
    if (state._phaseBreak) { state._phaseBreak = false; return log; }

    if (def.alive && att.alive && b) {
      /* recompute the counter in case something changed */
      strike(state, b, log);
      if (state._phaseBreak) { state._phaseBreak = false; return log; }
    }

    if (att.alive && def.alive && a.doubles) {
      var a2 = FE.forecast(state, att, def, item);
      if (a2 && a2.atk) strike(state, a2.atk, log);
      if (state._phaseBreak) { state._phaseBreak = false; return log; }
    }
    if (att.alive && def.alive && b && b.doubles) {
      var counterItem = FE.counterWeapon(def, fc.distance);
      if (counterItem) {
        var b2 = FE.forecast(state, def, att, counterItem);
        if (b2 && b2.atk) strike(state, b2.atk, log);
      }
    }

    /* fighting together builds a bond */
    if (att.faction === 'player' && def.faction === 'enemy') {
      FE.nearbySupportTick(state, att, 2);
    }

    return log;
  };

  FE.nearbySupportTick = function (state, u, amount) {
    if (!u.supports) return;
    state.units.forEach(function (o) {
      if (o === u || !o.alive || o.faction !== 'player' || !o.supports) return;
      if (FE.dist(u, o) <= 3) FE.addSupport(u, o, amount);
    });
  };

  /* ---------------- staff use ---------------- */

  FE.useStaff = function (state, user, target, item) {
    var log = [];
    var d = FE.itemData(item);
    if (d.staff === 'heal') {
      var amt = Math.min(FE.healAmount(user, item), target.maxhp - target.hp);
      target.hp += amt;
      log.push({ type: 'heal', unit: user.uid, target: target.uid, amount: amt });
      if (user.faction === 'player') FE.awardStaffExp(state, user, amt, log);
    } else if (d.staff === 'restore') {
      target.statusTurns = 0; target.status = null;
      log.push({ type: 'restore', unit: user.uid, target: target.uid });
      if (user.faction === 'player') FE.awardStaffExp(state, user, 10, log);
    } else if (d.staff === 'barrier') {
      target.resBuff = (target.resBuff || 0) + 7;
      target.resBuffTurns = 5;
      target.res += 7;
      log.push({ type: 'barrier', unit: user.uid, target: target.uid });
      if (user.faction === 'player') FE.awardStaffExp(state, user, 10, log);
    } else if (d.staff === 'torch') {
      user.torchTurns = 10;
      log.push({ type: 'torch', unit: user.uid });
      if (user.faction === 'player') FE.awardStaffExp(state, user, 8, log);
    }
    FE.spendUse(user, item, log);
    return log;
  };

  FE.terrainDefOf = terrainDefOf;
  FE.terrainAvoOf = terrainAvoOf;

})(window.FE = window.FE || {});
