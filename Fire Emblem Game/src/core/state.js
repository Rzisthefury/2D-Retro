/* ------------------------------------------------------------------
   CAMPAIGN AND BATTLE STATE
------------------------------------------------------------------ */
(function (FE) {
  'use strict';

  var uidSeq = 1;

  /* ---------------- campaign ---------------- */

  FE.newCampaign = function (difficulty) {
    var c = {
      difficulty: difficulty || 'normal',
      chapterIndex: 0,
      gold: 5000,
      convoy: [FE.mkItem('vulnerary'), FE.mkItem('vulnerary'), FE.mkItem('ironsword')],
      roster: {},
      recruited: ['seren', 'dorn', 'mira', 'bram'],
      arenaRounds: {},
      supports: {},
      turnsTotal: 0,
      seed: (Math.random() * 0xffffffff) >>> 0
    };
    c.recruited.forEach(function (id) { c.roster[id] = FE.makeRosterUnit(id); });
    return c;
  };

  FE.makeRosterUnit = function (id) {
    var t = FE.ROSTER[id];
    var cl = FE.CLASSES[t.cls];
    var u = {
      id: id, name: t.name, full: t.full, title: t.title, bio: t.bio,
      cls: t.cls, level: t.level, exp: 0,
      maxhp: t.bases.hp, hp: t.bases.hp,
      str: t.bases.str, mag: t.bases.mag, skl: t.bases.skl, spd: t.bases.spd,
      lck: t.bases.lck, def: t.bases.def, res: t.bases.res, con: t.bases.con,
      mov: cl.mov,
      growth: JSON.parse(JSON.stringify(t.growth)),
      affinity: t.affinity,
      lord: !!t.lord,
      items: t.items.map(function (k) { return FE.mkItem(k); }),
      supports: {}
    };
    return u;
  };

  /* ---------------- battle ---------------- */

  /* `override` lets a skirmish or a Spire floor be played through exactly the
     same battle code as a chapter, without pretending to be one. */
  FE.startChapter = function (campaign, deployIds, override) {
    var ch = override || FE.CHAPTERS[campaign.chapterIndex];
    var parsed = FE.parseMap(ch.map);
    var hard = campaign.difficulty === 'hard';
    /* Hard ramps in rather than landing all at once: chapter 1 gets one extra
       level and no weapon upgrades, because steel axes two-shot a level-1 lord
       and that is a difficulty setting, not a coin flip. */
    var hardOpts = {
      levelBump: hard ? Math.min(2, ch.number) : 0,
      upgrade: hard && ch.number >= 2,
      statBump: hard && ch.number >= 2
    };
    /* skirmish enemies are already built against the party's own level, so
       hard mode does not get to stack a second scaling pass on top */
    if (ch.skirmish) hardOpts = { levelBump: hard ? 1 : 0, upgrade: false, statBump: false };

    var state = {
      chapterIndex: campaign.chapterIndex,
      chapterId: ch.id,
      skirmish: !!ch.skirmish,
      purse: ch.purse || 0,
      map: parsed,
      units: [],
      turn: 1,
      phase: 'player',
      gold: campaign.gold,
      convoy: JSON.parse(JSON.stringify(campaign.convoy)),
      benched: [],
      openedDoors: {},
      openedChests: {},
      villages: (ch.villages || []).map(function (v) { return { x: v.x, y: v.y, event: v.event, done: false }; }),
      chests: (ch.chests || []).map(function (c) { return { x: c.x, y: c.y, item: c.item, done: false }; }),
      difficulty: campaign.difficulty,
      expRate: 1,
      objective: ch.objective,
      survive: ch.survive || 0,
      fogRange: ch.fog || 0,
      fogOn: (ch.fog || 0) > 0,
      visible: {},
      arenaRounds: {},
      log: [],
      pendingReinf: JSON.parse(JSON.stringify(ch.reinforcements || [])),
      phase2Def: ch.phase2 ? JSON.parse(JSON.stringify(ch.phase2)) : null,
      result: null,
      hardOpts: hardOpts,
      rng: new FE.Rng(campaign.seed + campaign.chapterIndex * 7919)
    };

    uidSeq = 1;

    /* deploy the player's units */
    var deployed = deployIds.slice(0, ch.slots);
    deployed.forEach(function (id, i) {
      var src = campaign.roster[id];
      if (!src) return;
      var u = JSON.parse(JSON.stringify(src));
      u.uid = uidSeq++;
      u.faction = 'player';
      u.x = ch.starts[i].x; u.y = ch.starts[i].y;
      u.alive = true;
      u.hp = u.maxhp;
      u.moved = false; u.acted = false;
      state.units.push(u);
    });

    /* mid-chapter joiners that start on the map */
    (ch.joins || []).forEach(function (j) {
      if (deployed.indexOf(j.id) !== -1) return;
      if (!campaign.roster[j.id]) campaign.roster[j.id] = FE.makeRosterUnit(j.id);
      var u = JSON.parse(JSON.stringify(campaign.roster[j.id]));
      u.uid = uidSeq++;
      u.faction = 'player';
      u.x = j.x; u.y = j.y;
      u.alive = true; u.hp = u.maxhp;
      u.moved = false; u.acted = false;
      state.units.push(u);
      if (campaign.recruited.indexOf(j.id) === -1) campaign.recruited.push(j.id);
    });

    /* enemies */
    var list = ch.enemies.slice();
    if (hard) list = list.concat(ch.hardExtra || []);
    list.forEach(function (ed) {
      state.units.push(FE.makeEnemy(ed, hardOpts));
    });

    /* boss */
    if (ch.boss) {
      state.units.push(FE.makeBoss(ch.boss, hardOpts));
    }

    /* recruitable enemies */
    (ch.npcs || []).forEach(function (n) {
      var u = FE.makeRosterUnit(n.id);
      u.uid = uidSeq++;
      u.faction = n.faction || 'enemy';
      u.x = n.x; u.y = n.y;
      u.alive = true; u.hp = u.maxhp;
      u.moved = false; u.acted = false;
      u.ai = n.ai || 'dormant';
      u.homeX = n.x; u.homeY = n.y;
      u.recruitable = true;
      u.talkWith = n.talkWith || [];
      u.expLocked = true;
      state.units.push(u);
    });

    FE.recomputeSupports(state);
    FE.updateFog(state);
    return state;
  };

  FE.makeEnemy = function (ed, opts) {
    opts = normOpts(opts);
    var lvl = ed.level + opts.levelBump;
    var s = FE.makeEnemyStats(ed.cls, lvl);
    var cl = FE.CLASSES[ed.cls];
    var u = {
      id: 'e' + uidSeq, uid: uidSeq++,
      name: cl.name, cls: ed.cls, level: lvl, exp: 0,
      maxhp: s.hp, hp: s.hp,
      str: s.str, mag: s.mag, skl: s.skl, spd: s.spd,
      lck: s.lck, def: s.def, res: s.res, con: s.con,
      mov: cl.mov, affinity: 'anima',
      faction: 'enemy', x: ed.x, y: ed.y, homeX: ed.x, homeY: ed.y,
      alive: true, moved: false, acted: false,
      ai: ed.ai || 'dormant', awake: (ed.ai === 'aggressive'),
      items: (ed.items || []).map(function (k) { return FE.mkItem(k); })
    };
    if (ed.drop) u.drop = ed.drop;
    if (ed.village) u.targetVillage = ed.village;
    if (opts.upgrade) FE.upgradeWeapons(u);
    FE.clampStats(u);
    return u;
  };

  /* accepts the old boolean form as well as the options object */
  function normOpts(o) {
    if (o === true) return { levelBump: 2, upgrade: true, statBump: true };
    if (!o) return { levelBump: 0, upgrade: false, statBump: false };
    return {
      levelBump: o.levelBump || 0,
      upgrade: !!o.upgrade,
      statBump: !!o.statBump
    };
  }
  FE.normEnemyOpts = normOpts;

  var UPGRADE = {
    ironsword: 'steelsword', ironlance: 'steellance', ironaxe: 'steelaxe',
    ironbow: 'steelbow', fire: 'thunder', lightning: 'shine', flux: 'flux'
  };
  FE.upgradeWeapons = function (u) {
    u.items.forEach(function (it) {
      if (UPGRADE[it.key]) {
        it.key = UPGRADE[it.key];
        var d = FE.WEAPONS[it.key];
        it.uses = d.uses === null ? null : d.uses;
      }
    });
  };

  FE.makeBoss = function (bd, opts) {
    opts = normOpts(opts);
    var hard = opts.statBump;
    var t = FE.BOSSES[bd.key];
    var cl = FE.CLASSES[t.cls];
    var lvl = t.level + opts.levelBump;
    var u = {
      id: bd.key, uid: uidSeq++,
      name: t.name, full: t.full, title: t.title, bio: t.bio, quote: t.quote,
      cls: t.cls, level: lvl, exp: 0,
      maxhp: t.bases.hp + (hard ? 5 : 0), hp: t.bases.hp + (hard ? 5 : 0),
      str: t.bases.str + (hard ? 2 : 0), mag: t.bases.mag, skl: t.bases.skl + (hard ? 1 : 0),
      spd: t.bases.spd + (hard ? 1 : 0), lck: t.bases.lck,
      def: t.bases.def + (hard ? 1 : 0), res: t.bases.res, con: t.bases.con,
      mov: cl.mov, affinity: t.affinity,
      faction: 'enemy', x: bd.x, y: bd.y, homeX: bd.x, homeY: bd.y,
      alive: true, moved: false, acted: false,
      ai: bd.ai || 'boss', awake: true, boss: true,
      withdraws: t.withdraws || 0,
      items: t.items.map(function (k) { return FE.mkItem(k); })
    };
    if (t.drop) u.drop = t.drop;
    /* a boss with a second phase does not die the first time round */
    if (t.phase2) u.phase2 = t.phase2;
    FE.clampStats(u);
    return u;
  };

  /* ----------------------------------------------------------------
     SECOND PHASE
     A boss carrying a phase2 key is not killed by the blow that empties
     its HP bar: it stands back up as the unit that key names, at full
     health, with new stats, a new class and new weapons, and the
     chapter's phase2 escort spawns around it. The same unit object is
     reused so the portrait, the uid and every reference to it survive,
     and so undo — which snapshots units wholesale — rewinds the
     transformation along with the blow that caused it.
  ---------------------------------------------------------------- */
  /* The escort's written-down tile may be occupied by a unit that is still
     standing there when the crown goes on, so spiral outward to the nearest
     tile this class can actually enter rather than silently not arriving. */
  function freeSpotNear(state, unit, x, y) {
    var moveType = FE.CLASSES[unit.cls].moveType;
    function usable(px, py) {
      if (!FE.inBounds(state, px, py)) return false;
      if (FE.unitAt(state, px, py)) return false;
      var t = FE.tileAt(state, px, py);
      if (!t) return false;
      if (FE.TERRAIN[t].door && !state.openedDoors[FE.posKey(px, py)]) return false;
      return FE.moveCost(t, moveType) < FE.IMPASSABLE;
    }
    if (usable(x, y)) return { x: x, y: y };
    for (var r = 1; r <= 6; r++) {
      for (var dy = -r; dy <= r; dy++) {
        for (var dx = -r; dx <= r; dx++) {
          if (Math.max(Math.abs(dx), Math.abs(dy)) !== r) continue;
          if (usable(x + dx, y + dy)) return { x: x + dx, y: y + dy };
        }
      }
    }
    return null;
  }

  FE.enterPhase2 = function (state, u, log) {
    var key = u.phase2;
    u.phase2 = null;
    var t = FE.BOSSES[key];
    if (!t) { return false; }
    var cl = FE.CLASSES[t.cls];
    var hard = !!(state.hardOpts && state.hardOpts.statBump);
    var bump = (state.hardOpts && state.hardOpts.levelBump) || 0;

    u.name = t.name; u.full = t.full; u.title = t.title;
    u.bio = t.bio; u.quote = t.quote;
    u.cls = t.cls;
    u.level = t.level + bump;
    u.maxhp = t.bases.hp + (hard ? 5 : 0);
    u.hp = u.maxhp;
    u.str = t.bases.str + (hard ? 2 : 0);
    u.mag = t.bases.mag;
    u.skl = t.bases.skl + (hard ? 1 : 0);
    u.spd = t.bases.spd + (hard ? 1 : 0);
    u.lck = t.bases.lck;
    u.def = t.bases.def + (hard ? 1 : 0);
    u.res = t.bases.res;
    u.con = t.bases.con;
    u.mov = cl.mov;
    u.affinity = t.affinity;
    u.items = t.items.map(function (k) { return FE.mkItem(k); });
    u.drop = t.drop || null;
    u.hurtTurn = undefined;
    u.alive = true;
    FE.clampStats(u);

    var def = state.phase2Def;
    state.phase2Def = null;
    var spawned = [];
    if (def && def.enemies) {
      def.enemies.forEach(function (ed) {
        var nu = FE.makeEnemy(ed, state.hardOpts);
        var spot = freeSpotNear(state, nu, ed.x, ed.y);
        if (!spot) return;                    /* nowhere to stand: it does not arrive */
        nu.x = spot.x; nu.y = spot.y;
        nu.homeX = spot.x; nu.homeY = spot.y;
        nu.moved = true; nu.acted = true;     /* they arrive, they do not also swing */
        state.units.push(nu);
        spawned.push(nu.uid);
      });
    }

    /* tell the exchange in progress to stop: the defender it was holding a
       counterattack for no longer owns that weapon */
    state._phaseBreak = true;

    log.push({
      type: 'phase2', unit: u.uid, name: u.name,
      scene: def ? def.scene : null, spawned: spawned
    });
    return true;
  };

  /* ---------------- fog of war ---------------- */

  FE.visionOf = function (u) {
    var cl = FE.CLASSES[u.cls];
    var v = cl.vision || 3;
    if (u.torchTurns > 0) v = Math.max(v, 6);
    return v;
  };

  FE.updateFog = function (state) {
    if (!state.fogOn) { state.visible = null; return; }
    var vis = {};
    state.units.forEach(function (u) {
      if (!u.alive || u.faction !== 'player') return;
      var r = FE.visionOf(u);
      for (var dy = -r; dy <= r; dy++) {
        for (var dx = -r; dx <= r; dx++) {
          if (Math.abs(dx) + Math.abs(dy) > r) continue;
          var x = u.x + dx, y = u.y + dy;
          if (!FE.inBounds(state, x, y)) continue;
          vis[FE.posKey(x, y)] = 1;
        }
      }
    });
    state.visible = vis;
  };

  FE.isVisible = function (state, x, y) {
    if (!state.fogOn) return true;
    if (x < state.fogRange) return true;       /* west half is clear ground */
    return !!(state.visible && state.visible[FE.posKey(x, y)]);
  };

  FE.unitVisible = function (state, u) {
    if (u.faction === 'player') return true;
    return FE.isVisible(state, u.x, u.y);
  };

  /* Forts, gates and thrones heal whoever is standing on them — but not while
     they are being fought. Without the second rule a throne boss regenerating
     20% a turn can out-heal a lone attacker forever: the chapter cannot be won
     and cannot be lost, which is the worst outcome a map can have. Being hit
     suppresses the tile's healing for that round and the next. */
  FE.terrainRegen = function (state, u) {
    var t = FE.tileAt(state, u.x, u.y);
    var heal = t ? (FE.TERRAIN[t].heal || 0) : 0;
    if (!heal) return 0;
    if (u.hurtTurn !== undefined && u.hurtTurn >= state.turn - 1) return 0;
    var amount = Math.min(Math.ceil(u.maxhp * heal), 12);
    var room = u.maxhp - u.hp;
    return Math.max(0, Math.min(amount, room));
  };

  /* ---------------- turn flow ---------------- */

  FE.beginPlayerPhase = function (state) {
    state.phase = 'player';
    state.units.forEach(function (u) {
      if (u.faction === 'player') { u.moved = false; u.acted = false; }
    });
    /* fort and gate regeneration */
    state.units.forEach(function (u) {
      if (!u.alive || u.faction !== 'player') return;
      u.hp += FE.terrainRegen(state, u);
      if (u.torchTurns > 0) u.torchTurns--;
      if (u.resBuffTurns > 0) {
        u.resBuffTurns--;
        if (u.resBuffTurns === 0 && u.resBuff) { u.res -= u.resBuff; u.resBuff = 0; }
      }
    });
    FE.recomputeSupports(state);
    FE.updateFog(state);
  };

  FE.beginEnemyPhase = function (state) {
    state.phase = 'enemy';
    state.units.forEach(function (u) {
      if (u.faction !== 'player') { u.moved = false; u.acted = false; }
    });
    state.units.forEach(function (u) {
      if (!u.alive || u.faction === 'player') return;
      u.hp += FE.terrainRegen(state, u);
    });
  };

  FE.endTurn = function (state) {
    state.turn++;
    /* reinforcements */
    var due = [];
    state.pendingReinf = (state.pendingReinf || []).filter(function (r) {
      if (r.turn <= state.turn) { due.push(r); return false; }
      return true;
    });
    due.forEach(function (r) {
      r.list.forEach(function (ed) {
        var occ = FE.unitAt(state, ed.x, ed.y);
        if (occ) return;
        state.units.push(FE.makeEnemy(ed, state.hardOpts));
      });
    });
    /* boss withdrawal */
    state.units.forEach(function (u) {
      if (u.alive && u.withdraws && state.turn > u.withdraws) {
        u.alive = false;
        u.withdrew = true;
      }
    });
  };

  /* ---------------- victory / defeat ---------------- */

  FE.checkResult = function (state) {
    var lord = null, anyPlayer = false;
    state.units.forEach(function (u) {
      if (u.faction !== 'player') return;
      if (u.lord) lord = u;
      if (u.alive) anyPlayer = true;
    });
    if (lord && !lord.alive) return 'lordfell';
    if (!anyPlayer) return 'wiped';

    if (state.objective === 'rout') {
      var left = state.units.some(function (u) { return u.alive && u.faction === 'enemy' && !u.recruitable; });
      if (!left) return 'win';
    } else if (state.objective === 'boss') {
      var boss = state.units.filter(function (u) { return u.boss; })[0];
      if (boss && !boss.alive) return 'win';
    } else if (state.objective === 'seize') {
      if (state.seized) return 'win';
    } else if (state.objective === 'survive') {
      if (state.turn > state.survive) return 'win';
    }
    return null;
  };

  /* write the battle back into the campaign */
  FE.commitChapter = function (campaign, state) {
    state.units.forEach(function (u) {
      if (u.faction !== 'player') return;
      if (!campaign.roster[u.id]) return;
      var r = campaign.roster[u.id];
      ['level', 'exp', 'maxhp', 'str', 'mag', 'skl', 'spd', 'lck', 'def', 'res', 'con', 'mov', 'cls'].forEach(function (k) {
        r[k] = u[k];
      });
      r.hp = r.maxhp;
      r.items = JSON.parse(JSON.stringify(u.items));
      r.supports = JSON.parse(JSON.stringify(u.supports || {}));
    });
    campaign.gold = state.gold;
    campaign.convoy = JSON.parse(JSON.stringify(state.convoy));
    campaign.turnsTotal += state.turn;
  };

  FE.nextUid = function () { return uidSeq++; };

})(window.FE = window.FE || {});
