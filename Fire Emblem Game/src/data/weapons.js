/* ------------------------------------------------------------------
   WEAPONS, STAVES AND ITEMS
   uses: null  -> infinite (Iron / Steel / Javelin / Hand Axe)
   uses: n     -> breaks after n (Silver / Killer / effective / legendary)
------------------------------------------------------------------ */
(function (FE) {
  'use strict';

  function w(o) { return o; }

  var W = {

    /* ---------------- SWORDS ---------------- */
    ironsword:   w({ name: 'Iron Sword',   type: 'sword', mt: 5,  hit: 90, crit: 0,  wt: 5,  rng: [1, 1], uses: null, price: 460 }),
    slimsword:   w({ name: 'Slim Sword',   type: 'sword', mt: 3,  hit: 100, crit: 5, wt: 2,  rng: [1, 1], uses: null, price: 480 }),
    steelsword:  w({ name: 'Steel Sword',  type: 'sword', mt: 8,  hit: 75, crit: 0,  wt: 10, rng: [1, 1], uses: null, price: 600 }),
    silversword: w({ name: 'Silver Sword', type: 'sword', mt: 13, hit: 80, crit: 0,  wt: 8,  rng: [1, 1], uses: 20,  price: 1500 }),
    killingedge: w({ name: 'Killing Edge', type: 'sword', mt: 9,  hit: 75, crit: 30, wt: 7,  rng: [1, 1], uses: 20,  price: 1300 }),
    armorslayer: w({ name: 'Armorslayer',  type: 'sword', mt: 8,  hit: 80, crit: 0,  wt: 11, rng: [1, 1], uses: 18,  price: 1250, effective: ['armor', 'armorhorse'] }),
    valebrand:   w({ name: 'Valebrand',    type: 'sword', mt: 7,  hit: 95, crit: 10, wt: 5,  rng: [1, 1], uses: 40,  price: 0, effective: ['armor', 'armorhorse', 'horse'], personal: 'seren', desc: 'The Valehart rapier. Effective against horse and armour.' }),
    dawnmarch:   w({ name: 'Dawnmarch',   type: 'sword', mt: 16, hit: 90, crit: 15, wt: 13, rng: [1, 1], uses: 25,  price: 0, effective: ['armor', 'armorhorse', 'horse'], desc: 'The Marshal\u2019s blade, forged from the fourth piece nobody admits existed.' }),

    /* ---------------- LANCES ---------------- */
    ironlance:   w({ name: 'Iron Lance',   type: 'lance', mt: 7,  hit: 80, crit: 0,  wt: 8,  rng: [1, 1], uses: null, price: 360 }),
    slimlance:   w({ name: 'Slim Lance',   type: 'lance', mt: 4,  hit: 85, crit: 5,  wt: 4,  rng: [1, 1], uses: null, price: 450 }),
    steellance:  w({ name: 'Steel Lance',  type: 'lance', mt: 10, hit: 70, crit: 0,  wt: 13, rng: [1, 1], uses: null, price: 480 }),
    silverlance: w({ name: 'Silver Lance', type: 'lance', mt: 14, hit: 75, crit: 0,  wt: 11, rng: [1, 1], uses: 20,  price: 1200 }),
    javelin:     w({ name: 'Javelin',      type: 'lance', mt: 6,  hit: 65, crit: 0,  wt: 11, rng: [1, 2], uses: null, price: 400, desc: 'Thrown. Strikes at one or two squares.' }),
    spear:       w({ name: 'Spear',       type: 'lance', mt: 12, hit: 70, crit: 0,  wt: 14, rng: [1, 2], uses: 15,  price: 2400, desc: 'A heavy thrown lance. Strikes at one or two squares.' }),
    killerlance: w({ name: 'Killer Lance', type: 'lance', mt: 10, hit: 70, crit: 30, wt: 9,  rng: [1, 1], uses: 20,  price: 1200 }),
    horseslayer: w({ name: 'Horseslayer',  type: 'lance', mt: 7,  hit: 70, crit: 0,  wt: 13, rng: [1, 1], uses: 16,  price: 1000, effective: ['horse', 'armorhorse'] }),

    /* ---------------- AXES ---------------- */
    ironaxe:     w({ name: 'Iron Axe',     type: 'axe',   mt: 8,  hit: 75, crit: 0,  wt: 10, rng: [1, 1], uses: null, price: 270 }),
    steelaxe:    w({ name: 'Steel Axe',    type: 'axe',   mt: 11, hit: 65, crit: 0,  wt: 15, rng: [1, 1], uses: null, price: 360 }),
    silveraxe:   w({ name: 'Silver Axe',   type: 'axe',   mt: 15, hit: 70, crit: 0,  wt: 12, rng: [1, 1], uses: 20,  price: 1000 }),
    handaxe:     w({ name: 'Hand Axe',     type: 'axe',   mt: 7,  hit: 60, crit: 0,  wt: 12, rng: [1, 2], uses: null, price: 300, desc: 'Thrown. Strikes at one or two squares.' }),
    tomahawk:    w({ name: 'Tomahawk',    type: 'axe',   mt: 13, hit: 65, crit: 0,  wt: 16, rng: [1, 2], uses: 15,  price: 2300, desc: 'Thrown, and heavy enough to matter. One or two squares.' }),
    killeraxe:   w({ name: 'Killer Axe',   type: 'axe',   mt: 11, hit: 65, crit: 30, wt: 10, rng: [1, 1], uses: 20,  price: 1000 }),
    hammer:      w({ name: 'Hammer',       type: 'axe',   mt: 10, hit: 55, crit: 0,  wt: 15, rng: [1, 1], uses: 20,  price: 800, effective: ['armor', 'armorhorse'] }),

    /* ---------------- BOWS ---------------- */
    ironbow:     w({ name: 'Iron Bow',     type: 'bow',   mt: 6,  hit: 85, crit: 0,  wt: 5,  rng: [2, 2], uses: null, price: 540 }),
    steelbow:    w({ name: 'Steel Bow',    type: 'bow',   mt: 9,  hit: 70, crit: 0,  wt: 9,  rng: [2, 2], uses: null, price: 560 }),
    silverbow:   w({ name: 'Silver Bow',   type: 'bow',   mt: 13, hit: 75, crit: 0,  wt: 6,  rng: [2, 2], uses: 20,  price: 1600 }),
    killerbow:   w({ name: 'Killer Bow',   type: 'bow',   mt: 9,  hit: 75, crit: 30, wt: 7,  rng: [2, 2], uses: 20,  price: 1400 }),
    longbow:     w({ name: 'Longbow',      type: 'bow',   mt: 5,  hit: 65, crit: 0,  wt: 10, rng: [2, 3], uses: 20,  price: 2000 }),

    /* ---------------- ANIMA ---------------- */
    fire:        w({ name: 'Fire',     type: 'anima', mt: 5,  hit: 90, crit: 0, wt: 4,  rng: [1, 2], uses: null, price: 560, magic: true }),
    thunder:     w({ name: 'Thunder',  type: 'anima', mt: 8,  hit: 80, crit: 5, wt: 6,  rng: [1, 2], uses: null, price: 700, magic: true }),
    elfire:      w({ name: 'Elfire',   type: 'anima', mt: 10, hit: 85, crit: 0, wt: 10, rng: [1, 2], uses: 20,  price: 1200, magic: true }),
    bolting:     w({ name: 'Bolting',  type: 'anima', mt: 12, hit: 60, crit: 0, wt: 20, rng: [3, 10], uses: 5, price: 2500, magic: true }),

    /* ---------------- LIGHT ---------------- */
    lightning:   w({ name: 'Lightning', type: 'light', mt: 4,  hit: 95, crit: 5,  wt: 4,  rng: [1, 2], uses: null, price: 630, magic: true }),
    shine:       w({ name: 'Shine',     type: 'light', mt: 6,  hit: 90, crit: 10, wt: 6,  rng: [1, 2], uses: null, price: 800, magic: true }),
    divine:      w({ name: 'Divine',    type: 'light', mt: 9,  hit: 85, crit: 5,  wt: 10, rng: [1, 2], uses: 20,  price: 1800, magic: true }),
    purge:       w({ name: 'Purge',     type: 'light', mt: 12, hit: 70, crit: 0, wt: 20, rng: [3, 10], uses: 5, price: 2800, magic: true }),

    /* ---------------- DARK ---------------- */
    flux:        w({ name: 'Flux',    type: 'dark', mt: 7,  hit: 80, crit: 0, wt: 8,  rng: [1, 2], uses: null, price: 700, magic: true }),
    luna:        w({ name: 'Luna',    type: 'dark', mt: 10, hit: 75, crit: 5, wt: 12, rng: [1, 2], uses: 20,  price: 2100, magic: true, desc: 'Ignores resistance entirely.', ignoreRes: true }),
    nosferatu:   w({ name: 'Nosferatu', type: 'dark', mt: 8, hit: 70, crit: 0, wt: 13, rng: [1, 2], uses: 15, price: 2400, magic: true, drain: true, desc: 'Restores HP equal to the damage dealt.' }),
    fenrir:      w({ name: 'Fenrir',  type: 'dark', mt: 15, hit: 70, crit: 5, wt: 16, rng: [1, 2], uses: 15, price: 3000, magic: true }),

    /* ---------------- STAVES ---------------- */
    heal:        w({ name: 'Heal',    type: 'staff', power: 10, wt: 2, rng: [1, 1], uses: 30, price: 400, staff: 'heal' }),
    mend:        w({ name: 'Mend',    type: 'staff', power: 20, wt: 4, rng: [1, 1], uses: 20, price: 1000, staff: 'heal' }),
    physic:      w({ name: 'Physic',  type: 'staff', power: 10, wt: 4, rng: [1, 10], uses: 15, price: 3000, staff: 'heal', desc: 'Heals from a distance.' }),
    restore:     w({ name: 'Restore', type: 'staff', wt: 4, rng: [1, 2], uses: 10, price: 2000, staff: 'restore' }),
    torch:       w({ name: 'Torch Staff', type: 'staff', wt: 4, rng: [1, 6], uses: 10, price: 800, staff: 'torch' }),
    barrier:     w({ name: 'Barrier', type: 'staff', wt: 4, rng: [1, 5], uses: 15, price: 2250, staff: 'barrier' }),

    /* ---------------- CONSUMABLES ---------------- */
    vulnerary:   w({ name: 'Vulnerary', type: 'item', uses: 3, price: 300, use: 'heal', power: 10, desc: 'Restores 10 HP.' }),
    elixir:      w({ name: 'Elixir',    type: 'item', uses: 3, price: 3000, use: 'heal', power: 999, desc: 'Restores all HP.' }),
    purewater:   w({ name: 'Pure Water', type: 'item', uses: 3, price: 900, use: 'res', desc: 'Raises resistance by 7 for a few turns.' }),
    doorkey:     w({ name: 'Door Key',  type: 'item', uses: 1, price: 50, use: 'door', desc: 'Opens one door.' }),
    chestkey:    w({ name: 'Chest Key', type: 'item', uses: 1, price: 300, use: 'chest', desc: 'Opens one chest.' }),
    lockpick:    w({ name: 'Lockpick',  type: 'item', uses: 15, price: 1200, use: 'lockpick', desc: 'Thieves only. Opens doors and chests.' }),

    /* stat boosters */
    energyring:  w({ name: 'Energy Ring', type: 'item', uses: 1, price: 8000, use: 'boost', stat: 'str', amount: 2 }),
    secretbook:  w({ name: 'Secret Book', type: 'item', uses: 1, price: 8000, use: 'boost', stat: 'skl', amount: 2 }),
    speedwing:   w({ name: 'Speedwing',   type: 'item', uses: 1, price: 8000, use: 'boost', stat: 'spd', amount: 2 }),
    dracoshield: w({ name: 'Dracoshield', type: 'item', uses: 1, price: 8000, use: 'boost', stat: 'def', amount: 2 }),
    talisman:    w({ name: 'Talisman',    type: 'item', uses: 1, price: 8000, use: 'boost', stat: 'res', amount: 2 }),
    goddessicon: w({ name: 'Goddess Icon', type: 'item', uses: 1, price: 8000, use: 'boost', stat: 'lck', amount: 2 }),
    angelicrobe: w({ name: 'Angelic Robe', type: 'item', uses: 1, price: 8000, use: 'boost', stat: 'hp', amount: 7 }),

    /* promotion items */
    herocrest:   w({ name: 'Hero Crest',   type: 'item', uses: 1, price: 10000, use: 'promote', forClasses: ['mercenary', 'myrmidon', 'fighter'] }),
    knightcrest: w({ name: 'Knight Crest', type: 'item', uses: 1, price: 10000, use: 'promote', forClasses: ['cavalier', 'knight', 'soldier'] }),
    orionsbolt:  w({ name: "Orion's Bolt", type: 'item', uses: 1, price: 10000, use: 'promote', forClasses: ['archer'] }),
    elysianwhip: w({ name: 'Elysian Whip', type: 'item', uses: 1, price: 10000, use: 'promote', forClasses: ['pegasusknight', 'wyvernrider'] }),
    guidingring: w({ name: 'Guiding Ring', type: 'item', uses: 1, price: 10000, use: 'promote', forClasses: ['mage', 'monk', 'shaman', 'cleric', 'troubadour'] }),
    oceanseal:   w({ name: 'Ocean Seal',   type: 'item', uses: 1, price: 10000, use: 'promote', forClasses: ['thief'] }),
    lordsseal:   w({ name: "Lord's Seal",  type: 'item', uses: 1, price: 0, use: 'promote', forClasses: ['lord'] })
  };

  Object.keys(W).forEach(function (k) {
    W[k].key = k;
    if (W[k].mt === undefined) W[k].mt = 0;
    if (W[k].hit === undefined) W[k].hit = 0;
    if (W[k].crit === undefined) W[k].crit = 0;
    if (W[k].wt === undefined) W[k].wt = 0;
    if (!W[k].rng) W[k].rng = [0, 0];
  });

  FE.WEAPONS = W;

  /* make an inventory entry */
  FE.mkItem = function (key) {
    var d = W[key];
    if (!d) throw new Error('unknown item ' + key);
    return { key: key, uses: d.uses === null ? null : d.uses };
  };

  FE.itemData = function (it) { return W[it.key]; };

  FE.isWeapon = function (it) {
    var d = W[it.key];
    return d && d.type !== 'item' && d.type !== 'staff';
  };
  FE.isStaff = function (it) { return W[it.key] && W[it.key].type === 'staff'; };

  /* ---------------- TRIANGLES ---------------- */
  // physical: sword > axe > lance > sword
  var PHYS = { sword: 'axe', axe: 'lance', lance: 'sword' };
  // magic: anima > light > dark > anima
  var MAGI = { anima: 'light', light: 'dark', dark: 'anima' };

  /* returns +1 / 0 / -1 for the attacker */
  FE.triangle = function (atkType, defType) {
    if (!atkType || !defType) return 0;
    if (PHYS[atkType] === defType) return 1;
    if (PHYS[defType] === atkType) return -1;
    if (MAGI[atkType] === defType) return 1;
    if (MAGI[defType] === atkType) return -1;
    return 0;
  };

  FE.TRIANGLE_MT = 1;
  FE.TRIANGLE_HIT = 15;

})(window.FE = window.FE || {});
