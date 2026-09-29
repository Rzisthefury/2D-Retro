/* ------------------------------------------------------------------
   DERIVED STATS
   Atk, Attack Speed, Hit, Avoid, Crit, Dodge — GBA formulas.
------------------------------------------------------------------ */
(function (FE) {
  'use strict';

  var MAGIC_TYPES = { anima: 1, light: 1, dark: 1 };

  FE.isMagicType = function (t) { return !!MAGIC_TYPES[t]; };

  FE.equipped = function (u) {
    if (!u.items || !u.items.length) return null;
    var cl = FE.CLASSES[u.cls];
    for (var i = 0; i < u.items.length; i++) {
      var d = FE.itemData(u.items[i]);
      if (!d) continue;
      if (d.type === 'item' || d.type === 'staff') continue;
      if (cl.weapons.indexOf(d.type) === -1) continue;
      if (d.personal && d.personal !== u.id) continue;
      return u.items[i];
    }
    return null;
  };

  /* first usable staff in the inventory */
  FE.equippedStaff = function (u) {
    var cl = FE.CLASSES[u.cls];
    if (cl.weapons.indexOf('staff') === -1) return null;
    for (var i = 0; i < u.items.length; i++) {
      var d = FE.itemData(u.items[i]);
      if (d && d.type === 'staff') return u.items[i];
    }
    return null;
  };

  /* every weapon this unit could attack with */
  FE.usableWeapons = function (u) {
    var cl = FE.CLASSES[u.cls], out = [];
    (u.items || []).forEach(function (it) {
      var d = FE.itemData(it);
      if (!d || d.type === 'item' || d.type === 'staff') return;
      if (cl.weapons.indexOf(d.type) === -1) return;
      if (d.personal && d.personal !== u.id) return;
      out.push(it);
    });
    return out;
  };

  /* full attack range set from all usable weapons */
  FE.attackRanges = function (u) {
    var set = {};
    FE.usableWeapons(u).forEach(function (it) {
      var d = FE.itemData(it);
      for (var r = d.rng[0]; r <= Math.min(d.rng[1], 10); r++) set[r] = 1;
    });
    return Object.keys(set).map(Number);
  };

  FE.staffRanges = function (u) {
    var set = {};
    (u.items || []).forEach(function (it) {
      var d = FE.itemData(it);
      if (!d || d.type !== 'staff') return;
      if (FE.CLASSES[u.cls].weapons.indexOf('staff') === -1) return;
      for (var r = d.rng[0]; r <= Math.min(d.rng[1], 10); r++) set[r] = 1;
    });
    return Object.keys(set).map(Number);
  };

  /* --------------- derived --------------- */

  FE.attackSpeed = function (u, item) {
    var d = item ? FE.itemData(item) : null;
    var wt = d ? d.wt : 0;
    return u.spd - Math.max(0, wt - u.con);
  };

  FE.atk = function (u, item) {
    var d = item ? FE.itemData(item) : null;
    if (!d) return 0;
    var base = d.magic ? u.mag : u.str;
    return base + d.mt;
  };

  FE.hitStat = function (u, item) {
    var d = item ? FE.itemData(item) : null;
    if (!d) return 0;
    return d.hit + u.skl * 2 + Math.floor(u.lck / 2) + FE.supportBonus(u, 'hit');
  };

  FE.avoidStat = function (u, item, terrainKey) {
    var as = FE.attackSpeed(u, item);
    var terr = terrainKey ? (FE.TERRAIN[terrainKey].avo || 0) : 0;
    return as * 2 + u.lck + terr + FE.supportBonus(u, 'avo');
  };

  FE.critStat = function (u, item) {
    var d = item ? FE.itemData(item) : null;
    if (!d) return 0;
    var cl = FE.CLASSES[u.cls];
    return d.crit + Math.floor(u.skl / 2) + (cl.crit || 0) + FE.supportBonus(u, 'crit');
  };

  FE.dodgeStat = function (u) {
    return u.lck + FE.supportBonus(u, 'dodge');
  };

  /* max HP is stored on the unit as .maxhp */
  FE.healAmount = function (u, item) {
    var d = FE.itemData(item);
    if (!d) return 0;
    if (d.power >= 999) return u.maxhp;
    return (d.power || 0) + u.mag;
  };

  /* is this weapon effective against that unit's class move type? */
  FE.isEffective = function (item, target) {
    var d = FE.itemData(item);
    if (!d || !d.effective) return false;
    var mt = FE.CLASSES[target.cls].moveType;
    if (d.effective.indexOf(mt) !== -1) return true;
    /* bows are always effective against fliers */
    return false;
  };

  FE.bowVsFlier = function (item, target) {
    var d = FE.itemData(item);
    if (!d || d.type !== 'bow') return false;
    return FE.CLASSES[target.cls].moveType === 'fly';
  };

  FE.effectiveMult = function (item, target) {
    return (FE.isEffective(item, target) || FE.bowVsFlier(item, target)) ? 3 : 1;
  };

  /* recalculate maxhp-dependent things after a stat change */
  FE.clampStats = function (u) {
    var caps = FE.CLASSES[u.cls].caps;
    ['str', 'mag', 'skl', 'spd', 'lck', 'def', 'res', 'con'].forEach(function (s) {
      if (u[s] > caps[s]) u[s] = caps[s];
      if (u[s] < 0) u[s] = 0;
    });
    if (u.maxhp > caps.hp) u.maxhp = caps.hp;
    if (u.hp > u.maxhp) u.hp = u.maxhp;
  };

})(window.FE = window.FE || {});
