/* ------------------------------------------------------------------
   RECRUITABLE ROSTER
   bases  = actual stats at the listed starting level
   growth = per-stat % chance to gain +1 on level up
------------------------------------------------------------------ */
(function (FE) {
  'use strict';

  function b(hp, str, mag, skl, spd, lck, def, res, con) {
    return { hp: hp, str: str, mag: mag, skl: skl, spd: spd, lck: lck, def: def, res: res, con: con };
  }
  function g(hp, str, mag, skl, spd, lck, def, res) {
    return { hp: hp, str: str, mag: mag, skl: skl, spd: spd, lck: lck, def: def, res: res };
  }

  var R = {

    seren: {
      name: 'Seren', full: 'Seren Valehart', title: 'Heir of Greywater',
      cls: 'lord', level: 1, affinity: 'light', lord: true,
      bases: b(18, 5, 1, 6, 7, 7, 5, 1, 5),
      growth: g(70, 45, 20, 50, 55, 60, 30, 30),
      items: ['valebrand', 'vulnerary'],
      bio: 'Second child of the Marquess, and heir to nothing in particular until this morning. Good with a blade, badly out of her depth at everything else.'
    },

    dorn: {
      name: 'Dorn', full: 'Dorn Hollis', title: "Shieldbearer",
      cls: 'knight', level: 3, affinity: 'ice',
      bases: b(22, 8, 0, 5, 4, 3, 11, 1, 14),
      growth: g(85, 50, 5, 40, 25, 25, 50, 20),
      items: ['ironlance', 'vulnerary'],
      bio: "Held her father's shield for thirty years. Slow, immovable, and says about six words a chapter. Calls her Marquess now, which she hates."
    },

    mira: {
      name: 'Mira', full: 'Mira Ashgrove', title: 'Village Healer',
      cls: 'cleric', level: 1, affinity: 'anima',
      bases: b(16, 1, 4, 4, 5, 6, 2, 6, 5),
      growth: g(60, 10, 55, 45, 50, 55, 15, 50),
      items: ['heal', 'vulnerary'],
      bio: 'Greywater’s healer. Complains about the war constantly and has never once considered leaving.'
    },

    bram: {
      name: 'Bram', full: 'Bram Teague', title: 'Knight of Greywater',
      cls: 'cavalier', level: 2, affinity: 'fire',
      bases: b(20, 7, 0, 6, 7, 4, 7, 1, 9),
      growth: g(75, 50, 5, 45, 45, 35, 35, 25),
      items: ['ironsword', 'ironlance'],
      bio: 'Nineteen, newly spurred, desperate to be useful. Will charge anything if you let him.'
    },

    rook: {
      name: 'Rook', full: 'Rook', title: 'Caldmark Bandit',
      cls: 'thief', level: 2, affinity: 'dark',
      bases: b(17, 4, 0, 8, 11, 5, 3, 1, 6),
      growth: g(65, 35, 5, 55, 65, 50, 20, 25),
      items: ['ironsword', 'lockpick'],
      bio: 'On the other side this morning. Perfectly honest about being a coward, which is more than most.'
    },

    edran: {
      name: 'Edran', full: 'Edran Coyle', title: 'Company Captain',
      cls: 'mercenary', level: 5, affinity: 'fire',
      bases: b(26, 9, 0, 11, 10, 5, 7, 2, 10),
      growth: g(80, 50, 5, 55, 50, 30, 30, 25),
      items: ['steelsword', 'ironsword', 'vulnerary'],
      bio: 'Hired last spring and never fully paid. Stays because the contract is not fulfilled. That is the only reason he will admit to.'
    },

    nessa: {
      name: 'Nessa', full: 'Nessa Crowe', title: 'Greywater Poacher',
      cls: 'archer', level: 2, affinity: 'wind',
      bases: b(18, 5, 0, 8, 7, 4, 4, 1, 7),
      growth: g(65, 45, 5, 60, 50, 40, 25, 25),
      items: ['ironbow', 'vulnerary'],
      bio: 'Has been illegally shooting Valehart deer for six years and is entirely unbothered to be meeting the heir.'
    },

    cass: {
      name: 'Cass', full: 'Cass Ferrow', title: 'Drifter',
      cls: 'myrmidon', level: 3, affinity: 'thunder',
      bases: b(19, 5, 0, 12, 13, 6, 4, 2, 5),
      growth: g(60, 40, 5, 65, 65, 45, 20, 30),
      items: ['killingedge'],
      bio: 'No surname offered, and a Killing Edge she should not be able to afford.'
    },

    ilya: {
      name: 'Ilya', full: 'Ilya Vance', title: 'Estrel Courier',
      cls: 'pegasusknight', level: 3, affinity: 'wind',
      bases: b(19, 6, 0, 8, 12, 7, 6, 8, 6),
      growth: g(65, 40, 5, 50, 60, 50, 25, 50),
      items: ['slimlance', 'javelin'],
      bio: 'Royal courier carrying a message that stopped mattering three days ago. Attached herself to Seren for want of orders.'
    },

    petra: {
      name: 'Petra', full: 'Petra Quill', title: 'Academy Apprentice',
      cls: 'mage', level: 2, affinity: 'anima',
      bases: b(17, 1, 6, 6, 7, 5, 3, 4, 5),
      growth: g(60, 10, 60, 50, 50, 40, 20, 45),
      items: ['fire', 'vulnerary'],
      bio: 'Expelled two months early for setting a thing on fire. Delighted to be in a war.'
    },

    garrick: {
      name: 'Garrick', full: 'Garrick Stone', title: 'Caldmark Axeman',
      cls: 'fighter', level: 4, affinity: 'thunder',
      bases: b(27, 10, 0, 6, 6, 3, 6, 0, 13),
      growth: g(85, 60, 5, 40, 40, 30, 30, 15),
      items: ['ironaxe', 'handaxe'],
      bio: 'Took Varn coin, watched what Varn did with it, and gave the coin back.'
    },

    corin: {
      name: 'Corin', full: 'Corin Ashe', title: 'Brother of the Ashfold',
      cls: 'monk', level: 5, affinity: 'light',
      bases: b(21, 1, 7, 8, 8, 6, 4, 8, 6),
      growth: g(60, 10, 60, 55, 50, 45, 20, 55),
      items: ['lightning', 'vulnerary'],
      bio: 'Spent eleven years copying other people\u2019s books and has opinions about all of them. Discovered light magic works on people last Tuesday.'
    },

    yrsa: {
      name: 'Yrsa', full: 'Yrsa Dunn', title: 'Varn Deserter',
      cls: 'shaman', level: 7, affinity: 'dark',
      bases: b(24, 1, 9, 7, 6, 3, 6, 8, 9),
      growth: g(65, 10, 60, 45, 40, 30, 25, 50),
      items: ['flux', 'vulnerary'],
      bio: 'Conscripted out of a Varn poorhouse for having the wrong kind of talent. Walked away between one order and the next.'
    },

    odile: {
      name: 'Odile', full: 'Odile Renn', title: 'Field Surgeon',
      cls: 'troubadour', level: 6, affinity: 'ice',
      bases: b(21, 1, 7, 8, 11, 8, 5, 9, 6),
      growth: g(60, 10, 50, 50, 55, 50, 20, 55),
      items: ['heal', 'vulnerary'],
      bio: 'Halvard Renn\u2019s younger sister. Has stitched up both armies and is running out of patience with the distinction.'
    },

    kell: {
      name: 'Kell', full: 'Kell Bosun', title: 'Gallows Harbour Pirate',
      cls: 'pirate', level: 8, affinity: 'thunder',
      bases: b(31, 12, 0, 9, 9, 4, 8, 1, 14),
      growth: g(85, 55, 5, 45, 45, 25, 30, 15),
      items: ['steelaxe', 'handaxe'],
      bio: 'Robs Varn shipping for a living and resents being called a patriot for it. Walks on water, near enough.'
    },

    sirin: {
      name: 'Sirin', full: 'Sirin Vale', title: 'Wing-Captain, Broken Oath',
      cls: 'wyvernrider', level: 12, affinity: 'wind',
      bases: b(35, 14, 0, 13, 13, 7, 14, 4, 14),
      growth: g(70, 45, 5, 40, 40, 25, 35, 20),
      items: ['steellance', 'javelin', 'vulnerary'],
      bio: 'Flew away from you once on a schedule she did not write. The second time she read the orders first.'
    },

    talis: {
      name: 'Talis', full: 'Talis Vayne', title: 'Kestrel Road Ranger',
      cls: 'sniper', level: 2, affinity: 'wind',
      bases: b(30, 14, 0, 16, 13, 6, 11, 6, 12),
      growth: g(70, 45, 5, 55, 45, 35, 25, 25),
      items: ['steelbow', 'ironbow', 'vulnerary'],
      bio: 'Paid by the Kestrel road wardens to shoot wyverns, and by nobody at all for the last eleven months.'
    },

    roswyn: {
      name: 'Roswyn', full: 'Roswyn Dace', title: 'Knight of the Cinderwatch',
      cls: 'paladin', level: 3, affinity: 'ice',
      bases: b(34, 14, 0, 12, 12, 7, 13, 7, 13),
      growth: g(75, 45, 5, 40, 40, 35, 30, 25),
      items: ['steellance', 'ironsword', 'vulnerary'],
      bio: 'Twenty years a Varn border knight. Was handed an order about a village and handed it back.'
    },

    thessaly: {
      name: 'Thessaly', full: 'Abbess Thessaly Marne', title: 'Of the Ember Cloister',
      cls: 'bishop', level: 4, affinity: 'light',
      bases: b(30, 2, 15, 13, 12, 9, 9, 16, 9),
      growth: g(60, 5, 50, 45, 45, 50, 20, 50),
      items: ['mend', 'shine', 'vulnerary'],
      bio: 'Has buried two abbots, three bishops and one emperor, and speaks about all of them in the same tone.'
    },

    ivane: {
      name: 'Ivane', full: 'Ivane Kesk', title: 'Imperial Archivist',
      cls: 'mageknight', level: 5, affinity: 'anima',
      bases: b(32, 8, 14, 13, 13, 8, 12, 14, 12),
      growth: g(65, 15, 50, 45, 45, 40, 25, 45),
      items: ['elfire', 'heal', 'vulnerary'],
      bio: 'The emperor\u2019s younger sister, and the only person alive who has read the third seal and admits it.'
    }
  };

  Object.keys(R).forEach(function (k) { R[k].id = k; });
  FE.ROSTER = R;

  /* ---------------- BOSSES ---------------- */
  FE.BOSSES = {
    gorr: {
      name: 'Gorr', full: 'Gorr', title: 'Brigand Chief',
      cls: 'bandit', level: 5, affinity: 'fire', boss: true,
      /* tutorial boss: has to be threatening and has to die in about two turns
         of focused fire from three level-1 units standing on plain ground */
      bases: b(28, 9, 0, 6, 5, 2, 6, 1, 15),
      growth: g(70, 40, 0, 30, 25, 20, 30, 10),
      items: ['ironaxe', 'vulnerary'],
      drop: 'valesignet',
      bio: 'Loud, greedy, and hired by somebody whose name he was never told.',
      quote: 'Big house, big silver. Kill the girl and we go home rich!'
    },
    halvard: {
      name: 'Halvard', full: 'Captain Halvard Renn', title: 'Varn Regular',
      cls: 'knight', level: 8, affinity: 'ice', boss: true,
      bases: b(30, 13, 0, 10, 7, 4, 9, 3, 16),
      growth: g(75, 45, 0, 35, 25, 20, 40, 15),
      items: ['steellance', 'javelin'],
      drop: 'doorkey',
      bio: 'Professional. Polite. Entirely willing to burn a village on schedule.',
      quote: 'The crossing is Imperial ground as of dawn. Step onto it and I will treat you as I am ordered to.'
    },
    sirin: {
      name: 'Sirin', full: 'Wing-Captain Sirin Vale', title: 'Varn Wyvern Flight',
      cls: 'wyvernrider', level: 10, affinity: 'wind', boss: true, withdraws: 10,
      bases: b(33, 14, 0, 12, 12, 6, 13, 3, 14),
      growth: g(75, 50, 0, 40, 40, 25, 40, 15),
      items: ['steellance', 'javelin'],
      bio: 'Flies away at turn 10 whatever you do. Remember the face.',
      quote: 'Hold your line if you like. I have until the tenth bell and no longer.'
    },
    ansel: {
      name: 'Ansel', full: 'Brother Ansel', title: 'Keeper of the Ashfold',
      cls: 'shaman', level: 11, affinity: 'dark', boss: true,
      bases: b(34, 1, 15, 11, 8, 5, 8, 12, 10),
      growth: g(70, 5, 45, 35, 25, 20, 25, 35),
      items: ['flux', 'vulnerary'],
      drop: 'guidingring',
      bio: 'Sold the Ashfold\u2019s relics to Varn one at a time, and told himself each was the last.',
      quote: 'The order kept nothing here worth dying for. I checked. Repeatedly.'
    },
    roald: {
      name: 'Roald', full: 'Roald Kerr', title: 'Free Company Captain',
      cls: 'mercenary', level: 13, affinity: 'fire', boss: true,
      bases: b(38, 15, 0, 15, 13, 6, 11, 4, 13),
      growth: g(75, 45, 0, 40, 35, 20, 30, 15),
      items: ['killingedge', 'vulnerary'],
      drop: 'herocrest',
      bio: 'Underbid Edran\u2019s company for this contract and has been insufferable about it since.',
      quote: 'Coyle. You always did take the work that paid in gratitude.'
    },
    emory: {
      name: 'Emory', full: 'Emory Thane', title: 'Castellan of Greywater',
      cls: 'paladin', level: 2, affinity: 'ice', boss: true,
      bases: b(38, 15, 0, 15, 13, 8, 13, 7, 14),
      growth: g(75, 45, 0, 35, 30, 20, 35, 20),
      items: ['steellance', 'javelin', 'vulnerary'],
      drop: 'knightcrest',
      bio: 'Held your father\u2019s keys for twenty years. Used them once.',
      quote: 'Your father would not bend and so your father is ash. I bent. Greywater still stands.'
    },
    drusa: {
      name: 'Drusa', full: 'Captain Drusa', title: 'Gallows Harbour',
      cls: 'pirate', level: 15, affinity: 'thunder', boss: true,
      bases: b(44, 18, 0, 13, 12, 5, 12, 3, 17),
      growth: g(80, 50, 0, 35, 30, 20, 30, 10),
      items: ['silveraxe', 'handaxe'],
      drop: 'oceanseal',
      bio: 'Takes Varn coin to sink Varn\u2019s rivals and calls it good business.',
      quote: 'Harbour\u2019s mine. Tide\u2019s mine. You are standing in both.'
    },
    oren: {
      name: 'Oren', full: 'Wing-Marshal Oren Kesk', title: 'Varn Southern Flight',
      cls: 'wyvernlord', level: 3, affinity: 'fire', boss: true,
      bases: b(44, 17, 0, 16, 15, 6, 15, 6, 16),
      growth: g(80, 50, 0, 40, 35, 20, 35, 15),
      items: ['silverlance', 'javelin', 'elixir'],
      drop: 'elysianwhip',
      bio: 'Wrote the schedule Sirin was flying to. Considers her a maintenance problem.',
      quote: 'Vale. You were given a clock and a line. You have broken both.'
    },
    bern: {
      name: 'Bern', full: 'Quartermaster Ovard Bern', title: 'Varn Supply Command',
      cls: 'general', level: 1, affinity: 'ice', boss: true,
      bases: b(40, 16, 0, 12, 8, 5, 17, 6, 18),
      growth: g(75, 40, 0, 35, 20, 20, 35, 15),
      items: ['steellance', 'javelin', 'vulnerary'],
      drop: 'herocrest',
      bio: 'Moved the crown piece past four border posts inside a grain writ and is extremely pleased about it.',
      quote: 'Flour, barley, salt, and one crate nobody is paid enough to ask about. Move along.'
    },
    malken: {
      name: 'Malken', full: 'Ser Malken Roth', title: 'Warden of the Cinderwatch',
      cls: 'paladin', level: 4, affinity: 'fire', boss: true,
      bases: b(42, 17, 0, 15, 14, 6, 15, 8, 14),
      growth: g(75, 45, 0, 35, 35, 20, 30, 20),
      items: ['silverlance', 'horseslayer'],
      drop: 'knightcrest',
      bio: 'Burned the forest to deny it to raiders, then kept burning it because the order never arrived to stop.',
      quote: 'Dace! You swore the same oath I did. Get off that horse and remember it.'
    },
    reyl: {
      name: 'Reyl', full: 'Cantor Reyl', title: 'Varn Ecclesiastical Office',
      cls: 'druid', level: 4, affinity: 'dark', boss: true,
      bases: b(38, 3, 19, 15, 12, 5, 12, 16, 12),
      growth: g(70, 5, 45, 40, 30, 20, 25, 35),
      items: ['flux', 'vulnerary'],
      drop: 'guidingring',
      bio: 'Burns archives for a living. Considers it a form of editing.',
      quote: 'Three pieces, one crown, and one very tidy history in which it was never broken at all.'
    },
    solk: {
      name: 'Solk', full: 'Grand Marshal Iven Solk', title: 'The Kestrel Gate',
      cls: 'general', level: 8, affinity: 'ice', boss: true, withdraws: 16,
      bases: b(46, 19, 0, 16, 11, 7, 18, 8, 20),
      growth: g(80, 45, 0, 35, 25, 20, 35, 15),
      items: ['silverlance', 'javelin', 'elixir'],
      drop: 'elysianwhip',
      bio: 'Will not hold a gate he has already lost. Rides for the capital the moment the arithmetic turns.',
      quote: 'You are four chapters and one army short of the capital, girl. I will wait for you there.'
    },
    corran: {
      name: 'Corran', full: 'Field-Marshal Corran Ide', title: 'Varn North Army',
      cls: 'greatknight', level: 8, affinity: 'ice', boss: true,
      bases: b(50, 21, 0, 17, 13, 7, 20, 9, 22),
      growth: g(80, 45, 0, 35, 25, 20, 35, 15),
      items: ['silveraxe', 'horseslayer', 'elixir'],
      drop: 'dracoshield',
      bio: 'Has never lost a field battle and has never fought one he did not choose.',
      quote: 'Nine days of road and an army at the end of it. You were always going to arrive tired.'
    },
    solk2: {
      name: 'Solk', full: 'Grand Marshal Iven Solk', title: 'The Last Line',
      cls: 'general', level: 14, affinity: 'ice', boss: true,
      bases: b(50, 22, 0, 19, 13, 8, 19, 10, 22),
      growth: g(80, 45, 0, 35, 25, 20, 35, 15),
      items: ['silverlance', 'javelin', 'elixir'],
      drop: 'angelicrobe',
      bio: 'Out of road, out of arithmetic, and entirely out of the habit of running.',
      quote: 'I told you I would wait. I did not say I would be glad of it.'
    },
    bellis: {
      name: 'Bellis', full: 'Ward-Captain Bellis Orne', title: 'The Outer Wards',
      cls: 'swordmaster', level: 11, affinity: 'thunder', boss: true,
      bases: b(46, 20, 0, 26, 25, 9, 16, 12, 16),
      growth: g(75, 40, 0, 45, 45, 25, 25, 20),
      items: ['killingedge', 'silversword'],
      drop: 'speedwing',
      bio: 'Knows every alley in the outer city and intends to use all of them.',
      quote: 'You brought an army into a street. I only need the street.'
    },
    vahl: {
      name: 'Vahl', full: 'Magister Vahl Kesk', title: 'Keeper of the Forge',
      cls: 'sage', level: 13, affinity: 'fire', boss: true,
      bases: b(48, 6, 26, 22, 18, 8, 15, 22, 14),
      growth: g(70, 5, 45, 40, 30, 20, 25, 40),
      items: ['bolting', 'elfire', 'elixir'],
      drop: 'secretbook',
      bio: 'Has spent eleven years joining three pieces of metal and will not be hurried at the last.',
      quote: 'Another hour. One more hour and there is no crown to argue over, only a crown.'
    },

    /* ---- the citadel: chapters 17-20 ---- */
    draugh: {
      name: 'Draugh', full: 'Ferren Draugh', title: 'Captain of the Household',
      cls: 'general', level: 15, affinity: 'ice', boss: true,
      bases: b(58, 23, 0, 19, 13, 10, 25, 12, 19),
      growth: g(75, 45, 0, 35, 25, 20, 40, 20),
      items: ['silverlance', 'spear', 'elixir'],
      drop: 'angelicrobe',
      bio: 'Thirty years on the door of a room he has never been invited into.',
      quote: 'Nobody carries that off this level. Not you, not the Magister, not his own sister.'
    },
    veyn: {
      name: 'Veyn', full: 'Hald Veyn', title: 'Sluicemaster',
      cls: 'greatknight', level: 16, affinity: 'anima', boss: true,
      bases: b(60, 25, 0, 20, 15, 9, 24, 11, 19),
      growth: g(75, 45, 0, 35, 30, 20, 40, 20),
      items: ['silveraxe', 'tomahawk', 'elixir'],
      drop: 'speedwing',
      bio: 'Holds the cisterns, and would drown the lower city to keep the stair dry.',
      quote: 'Open the gates and let it in. They can swim to him if they want him so badly.'
    },
    strade: {
      name: 'Strade', full: 'Aurick Strade', title: 'Lord Marshal of Varn',
      cls: 'wyvernlord', level: 19, affinity: 'fire', boss: true,
      bases: b(66, 28, 0, 23, 20, 12, 26, 13, 20),
      growth: g(80, 50, 0, 40, 40, 25, 40, 25),
      items: ['silverlance', 'spear', 'elixir'],
      drop: 'dracoshield',
      bio: 'Has fought the empire\u2019s wars for thirty years on the understanding that somebody upstairs knew why.',
      quote: 'Sign it and I will stand my flights down within the hour. That is not a threat, girl. It is the only offer anyone here will make you.'
    },
    dravan: {
      name: 'Dravan', full: 'Dravan Kesk', title: 'Emperor of Varn',
      cls: 'greatlord', level: 20, affinity: 'dark', boss: true,
      bases: b(66, 26, 0, 24, 18, 14, 23, 16, 20),
      growth: g(80, 50, 0, 45, 45, 30, 40, 35),
      items: ['silversword', 'spear', 'elixir'],
      phase2: 'dravan2',
      bio: 'Eleven years of letters to a marquess who kept saying no, and one afternoon left to stop asking.',
      quote: 'You came all this way to refuse me in person. I find that almost affectionate.'
    },
    /* second phase of the same man: he does not die the first time */
    dravan2: {
      name: 'Dravan', full: 'Dravan Kesk, Crowned', title: 'The Third Consent',
      cls: 'druid', level: 20, affinity: 'dark', boss: true,
      bases: b(70, 8, 26, 26, 18, 10, 20, 24, 20),
      growth: g(85, 10, 55, 45, 45, 25, 35, 45),
      items: ['fenrir', 'nosferatu', 'luna'],
      bio: 'A crown joined without its third consent, worn anyway, by a man who read what that costs and did it regardless.',
      quote: 'Two signatures and a forgery. It will hold. It only has to hold until there is nobody left who remembers the third.'
    }
  };

  /* ---------------- ENEMY GENERATION ---------------- */
  var ENEMY_GROWTH = g(60, 35, 30, 30, 30, 20, 25, 15);

  /* generic stat lines by class at level 1, scaled up by level */
  var ENEMY_BASE = {
    soldier:      b(18, 5, 0, 3, 3, 1, 4, 0, 10),
    brigand:      b(21, 6, 0, 3, 3, 0, 3, 0, 14),
    pirate:       b(20, 6, 0, 4, 4, 0, 3, 0, 13),
    mercenary:    b(19, 5, 0, 6, 6, 2, 4, 1, 10),
    myrmidon:     b(17, 4, 0, 8, 9, 3, 3, 1, 6),
    archer:       b(17, 4, 0, 5, 5, 1, 3, 1, 7),
    knight:       b(20, 6, 0, 3, 2, 1, 9, 0, 14),
    cavalier:     b(19, 5, 0, 4, 5, 2, 5, 0, 10),
    fighter:      b(21, 6, 0, 3, 4, 1, 3, 0, 13),
    shaman:       b(16, 0, 5, 3, 2, 1, 2, 4, 8),
    mage:         b(16, 0, 5, 4, 4, 1, 2, 4, 6),
    wyvernrider:  b(22, 7, 0, 5, 5, 1, 8, 0, 12),
    bandit:       b(23, 7, 0, 4, 4, 1, 4, 0, 15),
    thief:        b(16, 3, 0, 5, 8, 2, 2, 0, 6),

    /* promoted tier. Level 1 here is roughly level 20 of the tier below, so a
       promoted enemy at level 3 is a serious piece of the mid-game and not a
       soldier with a different sprite. Without these, FE.makeEnemyStats fell
       back to the soldier line and a Paladin fought like a conscript. */
    paladin:      b(30, 12, 0, 10, 10, 4, 12, 5, 12),
    greatknight:  b(34, 14, 0, 11, 8, 3, 15, 5, 16),
    general:      b(35, 15, 0, 9, 7, 3, 17, 5, 17),
    hero:         b(31, 14, 0, 14, 13, 4, 12, 6, 13),
    warrior:      b(34, 15, 0, 10, 9, 3, 11, 3, 16),
    swordmaster:  b(28, 12, 0, 16, 15, 4, 9, 5, 10),
    assassin:     b(27, 11, 0, 16, 16, 4, 8, 5, 9),
    rogue:        b(28, 11, 0, 14, 15, 4, 9, 4, 9),
    sniper:       b(29, 13, 0, 15, 12, 3, 10, 5, 12),
    ranger:       b(30, 12, 0, 12, 12, 4, 11, 7, 12),
    falcoknight:  b(29, 12, 0, 13, 14, 5, 10, 15, 10),
    wyvernknight: b(33, 14, 0, 13, 13, 3, 14, 5, 14),
    wyvernlord:   b(35, 16, 0, 12, 11, 3, 15, 4, 15),
    sage:         b(28, 3, 14, 12, 12, 4, 8, 12, 10),
    bishop:       b(28, 3, 15, 13, 11, 5, 8, 15, 10),
    druid:        b(29, 3, 16, 12, 10, 3, 9, 13, 11),
    summoner:     b(28, 3, 14, 12, 12, 3, 8, 12, 10),
    mageknight:   b(29, 6, 12, 11, 11, 4, 10, 12, 11),
    valkyrie:     b(27, 3, 13, 11, 12, 5, 8, 14, 9),
    greatlord:    b(32, 13, 0, 13, 13, 6, 12, 8, 12)
  };

  /* so a missing line can never be silent again */
  FE.hasEnemyBase = function (clsKey) { return !!ENEMY_BASE[clsKey]; };

  /* deterministic-ish enemy stat line: base + level-1 * growth/100, rounded */
  FE.makeEnemyStats = function (clsKey, level) {
    var base = ENEMY_BASE[clsKey] || ENEMY_BASE.soldier;
    var out = {};
    var lv = Math.max(0, level - 1);
    ['hp', 'str', 'mag', 'skl', 'spd', 'lck', 'def', 'res'].forEach(function (s) {
      out[s] = Math.floor(base[s] + lv * (ENEMY_GROWTH[s] / 100));
    });
    out.con = base.con;
    return out;
  };

  FE.ENEMY_GROWTH = ENEMY_GROWTH;

})(window.FE = window.FE || {});
