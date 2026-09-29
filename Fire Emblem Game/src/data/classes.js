/* ------------------------------------------------------------------
   CLASSES
   tier 0 = unpromoted, tier 1 = promoted.
   moveType drives terrain cost tables (see terrain.js).
   classPower feeds the experience formula (promoted units count +20).
------------------------------------------------------------------ */
(function (FE) {
  'use strict';

  // shorthand for stat caps
  function caps(hp, str, mag, skl, spd, lck, def, res, con) {
    return { hp: hp, str: str, mag: mag, skl: skl, spd: spd, lck: lck, def: def, res: res, con: con };
  }
  // promotion bonuses
  function bonus(hp, str, mag, skl, spd, def, res, con) {
    return { hp: hp, str: str, mag: mag, skl: skl, spd: spd, def: def, res: res, con: con };
  }

  var C = {

    /* ---------------- TIER 0 : PLAYER ---------------- */

    lord: {
      name: 'Lord', tier: 0, mov: 5, moveType: 'foot', weapons: ['sword'],
      caps: caps(60, 20, 15, 20, 20, 30, 20, 20, 20), crit: 0, classPower: 0,
      promotions: ['greatlord'], sprite: 'lord',
      desc: 'Noble heir. Balanced growth, and the campaign ends if she falls.'
    },
    mercenary: {
      name: 'Mercenary', tier: 0, mov: 5, moveType: 'foot', weapons: ['sword'],
      caps: caps(60, 21, 15, 24, 23, 30, 20, 18, 22), crit: 0, classPower: 0,
      promotions: ['hero', 'ranger'], sprite: 'mercenary',
      desc: 'Professional swordsman. Reliable damage, good skill.'
    },
    myrmidon: {
      name: 'Myrmidon', tier: 0, mov: 5, moveType: 'foot', weapons: ['sword'],
      caps: caps(60, 20, 15, 26, 26, 30, 17, 18, 18), crit: 0, classPower: 0,
      promotions: ['swordmaster', 'assassin'], sprite: 'myrmidon',
      desc: 'Fast duellist. Doubles almost everything, dies to a stiff breeze.'
    },
    cavalier: {
      name: 'Cavalier', tier: 0, mov: 7, moveType: 'horse', weapons: ['sword', 'lance'],
      caps: caps(60, 20, 15, 20, 20, 30, 20, 18, 22), crit: 0, classPower: 0,
      promotions: ['paladin', 'greatknight'], sprite: 'cavalier',
      desc: 'Mounted, two weapon types. The most flexible unit on the field.'
    },
    knight: {
      name: 'Knight', tier: 0, mov: 4, moveType: 'armor', weapons: ['lance'],
      caps: caps(60, 22, 15, 18, 16, 30, 25, 16, 26), crit: 0, classPower: 0,
      promotions: ['general', 'greatknight'], sprite: 'knight',
      desc: 'Walking wall. Physical attacks bounce; magic goes straight through.'
    },
    fighter: {
      name: 'Fighter', tier: 0, mov: 5, moveType: 'foot', weapons: ['axe'],
      caps: caps(60, 24, 15, 20, 20, 30, 19, 15, 25), crit: 0, classPower: 0,
      promotions: ['warrior', 'hero'], sprite: 'fighter',
      desc: 'Heavy axe damage, poor accuracy. Hits like a cart.'
    },
    archer: {
      name: 'Archer', tier: 0, mov: 5, moveType: 'foot', weapons: ['bow'],
      caps: caps(60, 20, 15, 22, 21, 30, 18, 18, 20), crit: 0, classPower: 0,
      promotions: ['sniper', 'ranger'], sprite: 'archer',
      desc: 'Range 2 only — never counterattacked at melee, never counters at melee.'
    },
    pegasusknight: {
      name: 'Pegasus Knight', tier: 0, mov: 7, moveType: 'fly', weapons: ['lance'],
      caps: caps(60, 20, 15, 22, 24, 30, 17, 24, 18), crit: 0, classPower: 0,
      promotions: ['falcoknight', 'wyvernknight'], sprite: 'pegasusknight',
      desc: 'Ignores all terrain. High resistance, and takes triple damage from bows.'
    },
    mage: {
      name: 'Mage', tier: 0, mov: 5, moveType: 'foot', weapons: ['anima'],
      caps: caps(60, 15, 21, 20, 21, 30, 15, 21, 18), crit: 0, classPower: 0,
      promotions: ['sage', 'mageknight'], sprite: 'mage',
      desc: 'Anima magic. Attacks resistance, which most armour does not have.'
    },
    monk: {
      name: 'Monk', tier: 0, mov: 5, moveType: 'foot', weapons: ['light'],
      caps: caps(60, 15, 21, 21, 20, 30, 14, 23, 18), crit: 0, classPower: 0,
      promotions: ['bishop', 'sage'], sprite: 'monk',
      desc: 'Light magic. Beats dark, loses to anima.'
    },
    shaman: {
      name: 'Shaman', tier: 0, mov: 5, moveType: 'foot', weapons: ['dark'],
      caps: caps(60, 15, 22, 19, 18, 30, 16, 22, 19), crit: 0, classPower: 0,
      promotions: ['druid', 'summoner'], sprite: 'shaman',
      desc: 'Dark magic. Slow, heavy tomes, brutal damage.'
    },
    cleric: {
      name: 'Cleric', tier: 0, mov: 5, moveType: 'foot', weapons: ['staff'],
      caps: caps(60, 15, 20, 18, 19, 30, 12, 22, 16), crit: 0, classPower: 0,
      promotions: ['bishop', 'valkyrie'], sprite: 'cleric',
      desc: 'Cannot attack at all. Levels entirely on healing, gains offence on promotion.'
    },
    troubadour: {
      name: 'Troubadour', tier: 0, mov: 7, moveType: 'horse', weapons: ['staff'],
      caps: caps(60, 15, 19, 19, 20, 30, 13, 23, 16), crit: 0, classPower: 0,
      promotions: ['valkyrie', 'mageknight'], sprite: 'troubadour',
      desc: 'Mounted healer. Cannot attack, but reaches anyone who needs her.'
    },
    thief: {
      name: 'Thief', tier: 0, mov: 6, moveType: 'thief', weapons: ['sword'],
      caps: caps(60, 18, 15, 22, 25, 30, 16, 17, 16), crit: 0, classPower: 0,
      promotions: ['rogue', 'assassin'], sprite: 'thief',
      desc: 'Opens chests and doors without keys, steals items, sees further in fog.',
      lockpick: true, steal: true, vision: 5
    },

    /* ---------------- TIER 1 : PROMOTED ---------------- */

    greatlord: {
      name: 'Great Lord', tier: 1, mov: 6, moveType: 'foot', weapons: ['sword', 'lance'],
      caps: caps(60, 25, 20, 27, 27, 30, 25, 24, 22), crit: 5, classPower: 20,
      promotions: [], sprite: 'greatlord',
      promoBonus: bonus(4, 3, 2, 3, 3, 4, 3, 2)
    },
    hero: {
      name: 'Hero', tier: 1, mov: 6, moveType: 'foot', weapons: ['sword', 'axe'],
      caps: caps(60, 26, 18, 29, 27, 30, 25, 23, 24), crit: 0, classPower: 20,
      promotions: [], sprite: 'hero',
      promoBonus: bonus(5, 3, 0, 3, 2, 3, 3, 2)
    },
    ranger: {
      name: 'Ranger', tier: 1, mov: 7, moveType: 'horse', weapons: ['sword', 'bow'],
      caps: caps(60, 24, 18, 26, 26, 30, 23, 25, 23), crit: 0, classPower: 20,
      promotions: [], sprite: 'ranger',
      promoBonus: bonus(4, 2, 0, 2, 3, 2, 4, 2)
    },
    swordmaster: {
      name: 'Swordmaster', tier: 1, mov: 6, moveType: 'foot', weapons: ['sword'],
      caps: caps(60, 24, 18, 30, 30, 30, 23, 23, 20), crit: 15, classPower: 20,
      promotions: [], sprite: 'swordmaster',
      promoBonus: bonus(3, 2, 0, 4, 4, 2, 3, 1)
    },
    assassin: {
      name: 'Assassin', tier: 1, mov: 6, moveType: 'thief', weapons: ['sword'],
      caps: caps(60, 22, 18, 30, 30, 30, 20, 23, 18), crit: 0, classPower: 20,
      promotions: [], sprite: 'assassin',
      promoBonus: bonus(3, 2, 0, 4, 4, 2, 3, 1),
      lockpick: true, steal: true, vision: 5, silencer: true
    },
    paladin: {
      name: 'Paladin', tier: 1, mov: 8, moveType: 'horse', weapons: ['sword', 'lance', 'axe'],
      caps: caps(60, 25, 20, 24, 24, 30, 25, 24, 24), crit: 0, classPower: 20,
      promotions: [], sprite: 'paladin',
      promoBonus: bonus(4, 2, 0, 2, 2, 3, 4, 2)
    },
    greatknight: {
      name: 'Great Knight', tier: 1, mov: 7, moveType: 'armorhorse', weapons: ['sword', 'lance', 'axe'],
      caps: caps(60, 27, 18, 24, 20, 30, 29, 22, 27), crit: 0, classPower: 20,
      promotions: [], sprite: 'greatknight',
      promoBonus: bonus(5, 4, 0, 2, 1, 5, 3, 3)
    },
    general: {
      name: 'General', tier: 1, mov: 5, moveType: 'armor', weapons: ['lance', 'axe'],
      caps: caps(60, 29, 18, 25, 22, 30, 30, 23, 28), crit: 0, classPower: 20,
      promotions: [], sprite: 'general',
      promoBonus: bonus(6, 4, 0, 3, 2, 5, 4, 3)
    },
    warrior: {
      name: 'Warrior', tier: 1, mov: 6, moveType: 'foot', weapons: ['axe', 'bow'],
      caps: caps(60, 30, 18, 26, 25, 30, 25, 21, 27), crit: 0, classPower: 20,
      promotions: [], sprite: 'warrior',
      promoBonus: bonus(6, 4, 0, 3, 2, 3, 3, 2)
    },
    sniper: {
      name: 'Sniper', tier: 1, mov: 6, moveType: 'foot', weapons: ['bow'],
      caps: caps(60, 25, 18, 30, 27, 30, 22, 23, 22), crit: 5, classPower: 20,
      promotions: [], sprite: 'sniper',
      promoBonus: bonus(4, 3, 0, 5, 3, 2, 3, 2)
    },
    falcoknight: {
      name: 'Falcoknight', tier: 1, mov: 8, moveType: 'fly', weapons: ['lance', 'staff'],
      caps: caps(60, 24, 20, 27, 28, 30, 22, 30, 20), crit: 0, classPower: 20,
      promotions: [], sprite: 'falcoknight',
      promoBonus: bonus(3, 3, 3, 3, 3, 3, 4, 1)
    },
    wyvernknight: {
      name: 'Wyvern Knight', tier: 1, mov: 8, moveType: 'fly', weapons: ['lance', 'axe'],
      caps: caps(60, 26, 18, 26, 26, 30, 26, 22, 24), crit: 0, classPower: 20,
      promotions: [], sprite: 'wyvernknight',
      promoBonus: bonus(4, 4, 0, 3, 2, 5, 2, 3), pierce: true
    },
    sage: {
      name: 'Sage', tier: 1, mov: 6, moveType: 'foot', weapons: ['anima', 'light', 'staff'],
      caps: caps(60, 18, 28, 27, 26, 30, 22, 28, 20), crit: 0, classPower: 20,
      promotions: [], sprite: 'sage',
      promoBonus: bonus(4, 0, 3, 3, 3, 3, 3, 2)
    },
    mageknight: {
      name: 'Mage Knight', tier: 1, mov: 7, moveType: 'horse', weapons: ['anima', 'light', 'staff'],
      caps: caps(60, 20, 25, 24, 24, 30, 23, 26, 21), crit: 0, classPower: 20,
      promotions: [], sprite: 'mageknight',
      promoBonus: bonus(4, 1, 2, 2, 2, 4, 3, 2)
    },
    bishop: {
      name: 'Bishop', tier: 1, mov: 6, moveType: 'foot', weapons: ['light', 'staff'],
      caps: caps(60, 18, 29, 27, 25, 30, 21, 30, 19), crit: 0, classPower: 20,
      promotions: [], sprite: 'bishop',
      promoBonus: bonus(4, 0, 4, 3, 2, 3, 4, 2), slayer: true
    },
    druid: {
      name: 'Druid', tier: 1, mov: 6, moveType: 'foot', weapons: ['dark', 'anima', 'staff'],
      caps: caps(60, 18, 30, 26, 24, 30, 22, 29, 21), crit: 0, classPower: 20,
      promotions: [], sprite: 'druid',
      promoBonus: bonus(4, 0, 4, 3, 3, 3, 3, 2)
    },
    summoner: {
      name: 'Summoner', tier: 1, mov: 6, moveType: 'foot', weapons: ['dark', 'staff'],
      caps: caps(60, 18, 28, 25, 25, 30, 20, 27, 20), crit: 0, classPower: 20,
      promotions: [], sprite: 'summoner',
      promoBonus: bonus(4, 0, 3, 3, 3, 2, 3, 2), summon: true
    },
    valkyrie: {
      name: 'Valkyrie', tier: 1, mov: 8, moveType: 'horse', weapons: ['staff', 'light'],
      caps: caps(60, 18, 26, 25, 25, 30, 20, 28, 18), crit: 0, classPower: 20,
      promotions: [], sprite: 'valkyrie',
      promoBonus: bonus(4, 1, 4, 3, 3, 3, 4, 2)
    },
    rogue: {
      name: 'Rogue', tier: 1, mov: 7, moveType: 'thief', weapons: ['sword'],
      caps: caps(60, 22, 18, 28, 29, 30, 20, 21, 18), crit: 5, classPower: 20,
      promotions: [], sprite: 'rogue',
      promoBonus: bonus(3, 3, 0, 3, 3, 3, 3, 1),
      lockpick: true, steal: true, vision: 5, keyless: true
    },

    /* ---------------- ENEMY-ONLY ---------------- */

    soldier: {
      name: 'Soldier', tier: 0, mov: 5, moveType: 'foot', weapons: ['lance'],
      caps: caps(60, 20, 15, 18, 18, 30, 19, 16, 22), crit: 0, classPower: 0,
      promotions: [], sprite: 'soldier', enemyOnly: true
    },
    brigand: {
      name: 'Brigand', tier: 0, mov: 5, moveType: 'brigand', weapons: ['axe'],
      caps: caps(60, 24, 15, 18, 18, 30, 18, 13, 26), crit: 0, classPower: 0,
      promotions: [], sprite: 'brigand', enemyOnly: true, raider: true
    },
    pirate: {
      name: 'Pirate', tier: 0, mov: 5, moveType: 'pirate', weapons: ['axe'],
      caps: caps(60, 23, 15, 19, 20, 30, 17, 13, 25), crit: 0, classPower: 0,
      promotions: [], sprite: 'pirate', enemyOnly: true, raider: true
    },
    wyvernrider: {
      name: 'Wyvern Rider', tier: 0, mov: 7, moveType: 'fly', weapons: ['lance'],
      caps: caps(60, 24, 15, 20, 20, 30, 23, 12, 24), crit: 0, classPower: 0,
      promotions: ['wyvernlord', 'wyvernknight'], sprite: 'wyvernrider'
    },
    wyvernlord: {
      name: 'Wyvern Lord', tier: 1, mov: 8, moveType: 'fly', weapons: ['lance', 'axe'],
      caps: caps(60, 28, 18, 25, 24, 30, 28, 20, 26), crit: 0, classPower: 20,
      promotions: [], sprite: 'wyvernlord',
      promoBonus: bonus(5, 4, 0, 3, 2, 4, 3, 3)
    },
    bandit: {
      name: 'Bandit Chief', tier: 0, mov: 5, moveType: 'brigand', weapons: ['axe'],
      caps: caps(60, 26, 15, 20, 19, 30, 20, 14, 27), crit: 0, classPower: 0,
      promotions: [], sprite: 'brigand', enemyOnly: true
    }
  };

  // key back-reference, and defaults
  Object.keys(C).forEach(function (k) {
    C[k].key = k;
    if (C[k].crit === undefined) C[k].crit = 0;
    if (!C[k].promoBonus) C[k].promoBonus = null;
  });

  FE.CLASSES = C;

  FE.classOf = function (unit) { return C[unit.cls]; };

  FE.canUse = function (unit, wtype) {
    var cl = C[unit.cls];
    return cl.weapons.indexOf(wtype) !== -1;
  };

})(window.FE = window.FE || {});
