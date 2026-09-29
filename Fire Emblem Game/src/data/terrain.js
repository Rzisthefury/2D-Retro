/* ------------------------------------------------------------------
   TERRAIN
   cost per moveType. 99 = impassable.
   moveTypes: foot, horse, armor, armorhorse, fly, thief, brigand, pirate
------------------------------------------------------------------ */
(function (FE) {
  'use strict';

  var X = 99;

  function t(name, avo, def, cost, extra) {
    var o = {
      name: name, avo: avo, def: def,
      cost: cost, heal: 0, blocksVision: false
    };
    if (extra) for (var k in extra) o[k] = extra[k];
    return o;
  }

  /* cost order: foot, horse, armor, armorhorse, fly, thief, brigand, pirate */
  function c(foot, horse, armor, armorhorse, fly, thief, brigand, pirate) {
    return {
      foot: foot, horse: horse, armor: armor, armorhorse: armorhorse,
      fly: fly, thief: thief, brigand: brigand, pirate: pirate
    };
  }

  var T = {
    plain:    t('Plain',    0,  0, c(1, 1, 1, 1, 1, 1, 1, 1)),
    road:     t('Road',     0,  0, c(1, 1, 1, 1, 1, 1, 1, 1)),
    forest:   t('Forest',  20,  1, c(2, 3, 2, 3, 1, 2, 2, 2)),
    thicket:  t('Thicket', 30,  1, c(3, X, 3, X, 1, 2, 2, 3)),
    hill:     t('Hill',    20,  1, c(2, 3, 2, 3, 1, 2, 1, 2)),
    mountain: t('Mountain',30,  2, c(4, X, X, X, 1, 4, 1, 4)),
    peak:     t('Peak',    35,  3, c(X, X, X, X, 1, X, 2, X)),
    fort:     t('Fort',    20,  2, c(1, 1, 1, 1, 1, 1, 1, 1), { heal: 0.2 }),
    gate:     t('Gate',    20,  3, c(1, 1, 1, 1, 1, 1, 1, 1), { heal: 0.2, seize: true }),
    throne:   t('Throne',  30,  3, c(1, 1, 1, 1, 1, 1, 1, 1), { heal: 0.2, seize: true }),
    village:  t('Village',  0,  0, c(1, 1, 1, 1, 1, 1, 1, 1), { village: true }),
    ruin:     t('Ruined Village', 0, 0, c(1, 1, 1, 1, 1, 1, 1, 1)),
    house:    t('House',    0,  0, c(1, 1, 1, 1, 1, 1, 1, 1), { village: true }),
    floor:    t('Floor',    0,  0, c(1, 1, 1, 1, 1, 1, 1, 1)),
    pillar:   t('Pillar',  20,  1, c(1, 1, 1, 1, 1, 1, 1, 1)),
    wall:     t('Wall',     0,  0, c(X, X, X, X, X, X, X, X), { blocksVision: true }),
    cliff:    t('Cliff',    0,  0, c(X, X, X, X, X, X, X, X), { blocksVision: true }),
    water:    t('Water',    0,  0, c(X, X, X, X, 1, X, X, 1)),
    river:    t('River',   10,  0, c(X, X, X, X, 1, X, X, 1)),
    bridge:   t('Bridge',   0,  0, c(1, 1, 1, 1, 1, 1, 1, 1)),
    door:     t('Door',     0,  0, c(X, X, X, X, X, X, X, X), { door: true, blocksVision: true }),
    chest:    t('Chest',    0,  0, c(1, 1, 1, 1, 1, 1, 1, 1), { chest: true }),
    armory:   t('Armory',   0,  0, c(1, 1, 1, 1, 1, 1, 1, 1), { shop: 'armory' }),
    vendor:   t('Vendor',   0,  0, c(1, 1, 1, 1, 1, 1, 1, 1), { shop: 'vendor' }),
    arena:    t('Arena',    0,  0, c(1, 1, 1, 1, 1, 1, 1, 1), { arena: true })
  };

  Object.keys(T).forEach(function (k) { T[k].key = k; });

  FE.TERRAIN = T;

  FE.moveCost = function (terrainKey, moveType) {
    var td = T[terrainKey];
    if (!td) return X;
    var v = td.cost[moveType];
    return v === undefined ? 1 : v;
  };

  FE.IMPASSABLE = X;

})(window.FE = window.FE || {});
