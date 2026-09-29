/* ------------------------------------------------------------------
   CHAPTERS
   Map legend:
     . plain    , road     f forest   t thicket   h hill
     m mountain ^ peak     F fort     G gate      T throne
     v village  H house    x ruin     _ floor     I pillar
     # wall     c cliff    ~ water    r river     = bridge
     D door     C chest    A armory   V vendor    R arena
------------------------------------------------------------------ */
(function (FE) {
  'use strict';

  var LEGEND = {
    '.': 'plain', ',': 'road', 'f': 'forest', 't': 'thicket', 'h': 'hill',
    'm': 'mountain', '^': 'peak', 'F': 'fort', 'G': 'gate', 'T': 'throne',
    'v': 'village', 'H': 'house', 'x': 'ruin', '_': 'floor', 'I': 'pillar',
    '#': 'wall', 'c': 'cliff', '~': 'water', 'r': 'river', '=': 'bridge',
    'D': 'door', 'C': 'chest', 'A': 'armory', 'V': 'vendor', 'R': 'arena'
  };
  FE.LEGEND = LEGEND;

  /* helper: enemy definition */
  function e(cls, level, x, y, items, opts) {
    var o = { cls: cls, level: level, x: x, y: y, items: items || [], ai: 'dormant' };
    if (opts) for (var k in opts) o[k] = opts[k];
    return o;
  }

  var CH = [

    /* ============================ CHAPTER 1 ============================ */
    {
      id: 'ch1',
      number: 1,
      name: 'Greywater Burns',
      objective: 'rout',
      objectiveText: 'Defeat all enemies',
      fog: 0,
      map: [
        '############...ffmmm',
        '#__________#..fff..m',
        '#____##____#...f....',
        '#____##____D........',
        '#__________#...hh...',
        '####__######..hhh..f',
        '......,,,,....f.....',
        '~~~~~~====..........',
        '~~~~~~,,,,....ff....',
        '..f...,,,,....f....F',
        '.ff...........fff.v.',
        '..f........hh...ff..',
        '...........hhh..F...',
        '....ff........mmm...'
      ],
      /* player deployment tiles, in priority order */
      starts: [
        { x: 2, y: 3 }, { x: 3, y: 3 }, { x: 2, y: 2 }, { x: 3, y: 2 },
        { x: 8, y: 3 }, { x: 9, y: 3 }, { x: 8, y: 2 }, { x: 9, y: 2 },
        { x: 2, y: 4 }, { x: 9, y: 4 }
      ],
      forced: ['seren', 'dorn', 'mira', 'bram'],
      available: ['seren', 'dorn', 'mira', 'bram'],
      slots: 4,
      /* Six and a boss. This is the tutorial: four level-1 units cannot trade
         with eleven axes, and the chapter has to teach the triangle, not the
         reload button. */
      enemies: [
        e('brigand', 1, 12, 6, ['ironaxe'], { ai: 'aggressive' }),
        e('brigand', 1, 13, 3, ['ironaxe']),
        e('brigand', 2, 15, 8, ['handaxe']),
        e('archer', 1, 19, 9, ['ironbow']),
        e('brigand', 2, 14, 12, ['ironaxe', 'vulnerary']),
        e('brigand', 2, 17, 10, ['ironaxe'])   /* guards the house; no raider in the tutorial */
      ],
      boss: { key: 'gorr', x: 16, y: 12, ai: 'boss' },
      /* recruitable enemies */
      npcs: [
        { id: 'rook', x: 12, y: 9, faction: 'enemy', ai: 'passive', talkWith: ['seren'] }
      ],
      villages: [
        { x: 18, y: 10, event: 'ch1_house' }
      ],
      chests: [],
      reinforcements: [],
      tutorial: true,
      hardExtra: [
        e('brigand', 2, 16, 2, ['ironaxe']),
        e('brigand', 2, 11, 13, ['handaxe'])
      ]
    },

    /* ============================ CHAPTER 2 ============================ */
    {
      id: 'ch2',
      number: 2,
      name: 'Ardwyn Crossing',
      objective: 'seize',
      objectiveText: 'Seize the gate with Seren',
      fog: 0,
      /* The main hall is entered through the gap in the south wall, so the gate
         is always reachable. The door on the west wall gates the treasure
         chamber only — a locked door should cost you loot, never the chapter. */
      map: [
        '..ff....~~....##########',
        '.f......~~....#CC#_____#',
        '........~~....#__#_____#',
        '..v.....~~....D__#__G__#',
        '........~~....#__#_____#',
        '..f.....~~....#CC#_____#',
        '........~~....####..####',
        '..ff....~~..............',
        '........==..............',
        '...,,,,,==,,,,..........',
        '...,....~~....ff........',
        '...,....~~....f.........',
        '...,....~~.....hh.......',
        '...,...........hhh......',
        '...,......f....hh..v....',
        '...,.....ff.............',
        '..ff.....f.......ff..R..',
        'mmm.............mmmmmmmm'
      ],
      starts: [
        { x: 1, y: 14 }, { x: 2, y: 14 }, { x: 1, y: 15 }, { x: 2, y: 15 },
        { x: 1, y: 13 }, { x: 2, y: 13 }, { x: 0, y: 14 }, { x: 0, y: 15 },
        { x: 4, y: 14 }, { x: 4, y: 15 }, { x: 3, y: 16 }, { x: 4, y: 16 }
      ],
      forced: ['seren'],
      available: ['seren', 'dorn', 'mira', 'bram', 'rook', 'edran'],
      joins: [{ id: 'edran', x: 5, y: 13 }],
      slots: 6,
      enemies: [
        /* bridge guard */
        e('soldier', 3, 10, 7, ['ironlance']),
        e('soldier', 3, 11, 9, ['ironlance']),
        e('archer', 3, 12, 8, ['ironbow']),
        /* fortress garrison, all inside the main hall */
        e('soldier', 4, 19, 2, ['ironlance']),
        e('knight', 4, 21, 2, ['ironlance'], { ai: 'guard' }),
        e('archer', 4, 22, 4, ['ironbow'], { ai: 'guard' }),
        e('mage', 4, 21, 1, ['fire']),
        /* field */
        e('mercenary', 4, 16, 11, ['ironsword']),
        /* village raiders — these move the moment the chapter starts, and the
           two villages are on opposite corners, so you cannot save both without
           splitting the party */
        /* 3 turns from the north village; your fastest unit needs 2 */
        e('brigand', 3, 11, 8, ['ironaxe'], { ai: 'raider', village: { x: 2, y: 3 } }),
        /* 5 turns from the south village; your fastest unit needs 4 */
        e('brigand', 3, 11, 0, ['ironaxe'], { ai: 'raider', village: { x: 19, y: 14 } })
      ],
      boss: { key: 'halvard', x: 20, y: 3, ai: 'boss' },
      npcs: [
        { id: 'cass', x: 14, y: 12, faction: 'enemy', ai: 'dormant', talkWith: ['seren'] }
      ],
      villages: [
        { x: 2, y: 3, event: 'ch2_north' },
        { x: 19, y: 14, event: 'ch2_south' }
      ],
      chests: [
        { x: 15, y: 1, item: 'killeraxe' },
        { x: 16, y: 1, item: 'guidingring' },
        { x: 15, y: 5, item: 'speedwing' },
        { x: 16, y: 5, item: 'silversword' }
      ],
      doors: [{ x: 14, y: 3 }],
      reinforcements: [
        { turn: 5, list: [e('soldier', 4, 23, 8, ['ironlance'], { ai: 'aggressive' }), e('soldier', 4, 23, 9, ['javelin'], { ai: 'aggressive' })] },
        { turn: 8, list: [e('cavalier', 4, 23, 12, ['ironlance'], { ai: 'aggressive' })] }
      ],
      hardExtra: [
        e('soldier', 4, 19, 4, ['ironlance']),
        e('mercenary', 4, 13, 10, ['ironsword']),
        e('soldier', 3, 18, 13, ['javelin'])
      ]
    },

    /* ============================ CHAPTER 3 ============================ */
    {
      id: 'ch3',
      number: 3,
      name: 'The Ashmoor Line',
      objective: 'survive',
      objectiveText: 'Survive 10 turns',
      survive: 10,
      fog: 13,          /* fog applies to columns >= 13 */
      map: [
        'mmm.......ffff........',
        'mm....................',
        'm....hh......ff.......',
        '....hhh...............',
        '.....h................',
        '..f..........,,.......',
        '........FFF...........',
        '........FFF...........',
        '.......hFFFh..........',
        '......hh...hh.........',
        '....ff.......ff.......',
        '...f..................',
        '......ff......ff......',
        '......................',
        'mm......ffff.......mmm',
        'mmmm..............mmmm'
      ],
      starts: [
        { x: 8, y: 6 }, { x: 9, y: 6 }, { x: 10, y: 6 },
        { x: 8, y: 7 }, { x: 9, y: 7 }, { x: 10, y: 7 },
        { x: 8, y: 8 }, { x: 9, y: 8 }, { x: 10, y: 8 },
        { x: 7, y: 8 }, { x: 11, y: 8 }, { x: 9, y: 9 }
      ],
      forced: ['seren', 'ilya'],
      available: ['seren', 'dorn', 'mira', 'bram', 'rook', 'edran', 'nessa', 'cass', 'ilya', 'petra'],
      joins: [{ id: 'ilya', x: 9, y: 9 }, { id: 'petra', x: 8, y: 9 }],
      slots: 8,
      /* spaced out to the map edges: the fort has to be held for ten turns,
         so the first wave must arrive as a wave, not as an opening alpha strike */
      enemies: [
        e('wyvernrider', 6, 1, 1, ['ironlance'], { ai: 'aggressive' }),
        e('wyvernrider', 6, 20, 1, ['ironlance'], { ai: 'aggressive' }),
        e('soldier', 5, 0, 8, ['ironlance'], { ai: 'aggressive' }),
        e('soldier', 5, 21, 8, ['javelin'], { ai: 'aggressive' }),
        e('archer', 5, 2, 14, ['ironbow'], { ai: 'aggressive' }),
        e('mercenary', 5, 19, 13, ['ironsword'], { ai: 'aggressive' })
      ],
      boss: { key: 'sirin', x: 21, y: 2, ai: 'aggressive' },
      npcs: [
        { id: 'garrick', x: 5, y: 14, faction: 'enemy', ai: 'dormant', talkWith: ['seren'] }
      ],
      villages: [],
      chests: [],
      reinforcements: [
        { turn: 3, list: [e('soldier', 5, 0, 5, ['ironlance'], { ai: 'aggressive' }), e('soldier', 5, 21, 10, ['ironlance'], { ai: 'aggressive' })] },
        { turn: 4, list: [e('wyvernrider', 6, 21, 0, ['javelin'], { ai: 'aggressive' })] },
        { turn: 5, list: [e('brigand', 5, 0, 13, ['ironaxe'], { ai: 'aggressive' }), e('archer', 5, 21, 13, ['ironbow'], { ai: 'aggressive' })] },
        { turn: 5, list: [e('wyvernrider', 6, 0, 1, ['ironlance'], { ai: 'aggressive' }), e('mercenary', 6, 21, 6, ['steelsword'], { ai: 'aggressive' })] },
        { turn: 6, list: [e('soldier', 6, 11, 15, ['javelin'], { ai: 'aggressive' })] },
        { turn: 7, list: [e('wyvernrider', 7, 21, 3, ['steellance'], { ai: 'aggressive' }), e('brigand', 6, 0, 10, ['handaxe'], { ai: 'aggressive' })] },
        { turn: 8, list: [e('cavalier', 6, 4, 15, ['ironlance'], { ai: 'aggressive' })] },
        { turn: 9, list: [e('wyvernrider', 7, 0, 3, ['javelin'], { ai: 'aggressive' })] }
      ],
      hardExtra: [
        e('wyvernrider', 7, 15, 3, ['javelin'], { ai: 'aggressive' }),
        e('archer', 6, 6, 3, ['steelbow'], { ai: 'aggressive' }),
        e('soldier', 6, 13, 13, ['ironlance'], { ai: 'aggressive' }),
        e('mercenary', 6, 3, 10, ['ironsword'], { ai: 'aggressive' })
      ]
    }
,
    /* ============================ CHAPTER 4 ============================ */
    {
      id: 'ch4',
      number: 4,
      name: 'The Ashfold',
      objective: 'boss',
      objectiveText: 'Defeat Brother Ansel',
      fog: 0,
      /* The chapel is entered through the gap in its south wall; the door on the
         west wall gates the reliquary chests only. Never make a door the only way in. */
      map: [
        'm....ff......###########',
        '.....f.......#____C_C__#',
        '..hh.........#_________#',
        '.hhh.........D____T____#',
        '..h..........#_________#',
        '.....ff......#__I___I__#',
        '......f......#_________#',
        '.............#_________#',
        '.............####___####',
        '....v............,,,....',
        '.................,,,....',
        '..ff.............,,,....',
        '...f....hh.......,,.....',
        '........hhh......,,.....',
        '.........h.......,,....R',
        'mm....ff..........mmmmmm'
      ],
      starts: [
        { x: 1, y: 13 }, { x: 2, y: 13 }, { x: 3, y: 13 }, { x: 4, y: 13 },
        { x: 1, y: 12 }, { x: 2, y: 12 }, { x: 5, y: 13 }, { x: 6, y: 13 },
        { x: 0, y: 13 }, { x: 7, y: 13 }, { x: 4, y: 12 }, { x: 5, y: 12 }
      ],
      forced: ['seren'],
      available: ['seren', 'dorn', 'mira', 'bram', 'rook', 'edran', 'nessa', 'cass', 'ilya', 'petra', 'garrick', 'corin'],
      slots: 8,
      enemies: [
        /* the cloister garrison */
        e('shaman', 9, 19, 6, ['flux']),
        e('shaman', 9, 15, 7, ['flux']),
        e('soldier', 9, 17, 8, ['ironlance']),
        e('soldier', 9, 19, 8, ['javelin']),
        e('knight', 10, 18, 4, ['steellance'], { ai: 'guard' }),
        e('archer', 9, 21, 2, ['ironbow'], { ai: 'guard' }),
        e('archer', 9, 15, 2, ['ironbow'], { ai: 'guard' }),
        /* the yard */
        e('mercenary', 9, 18, 10, ['ironsword'], { ai: 'aggressive' }),
        e('mercenary', 9, 16, 12, ['steelsword']),
        /* 2 turns from the village; your fastest unit needs 2 as well */
        e('brigand', 9, 12, 11, ['ironaxe'], { ai: 'raider', village: { x: 4, y: 9 } })
      ],
      boss: { key: 'ansel', x: 18, y: 3, ai: 'boss' },
      npcs: [
        { id: 'corin', x: 21, y: 7, faction: 'enemy', ai: 'passive', talkWith: ['seren', 'mira'] }
      ],
      villages: [
        { x: 4, y: 9, event: 'ch4_croft' }
      ],
      chests: [
        { x: 18, y: 1, item: 'guidingring' },
        { x: 20, y: 1, item: 'killerlance' }
      ],
      doors: [{ x: 13, y: 3 }],
      reinforcements: [
        { turn: 4, list: [e('mercenary', 9, 23, 12, ['ironsword'], { ai: 'aggressive' }), e('brigand', 9, 0, 10, ['handaxe'], { ai: 'aggressive' })] },
        { turn: 7, list: [e('cavalier', 9, 23, 10, ['ironlance'], { ai: 'aggressive' })] }
      ],
      hardExtra: [
        e('shaman', 10, 17, 5, ['flux']),
        e('archer', 10, 22, 6, ['steelbow']),
        e('soldier', 10, 18, 9, ['steellance'])
      ]
    },

    /* ============================ CHAPTER 5 ============================ */
    {
      id: 'ch5',
      number: 5,
      name: 'Salt Marsh Road',
      objective: 'seize',
      objectiveText: 'Seize the gate with Seren',
      fog: 0,
      /* Open water down the west side: the pirates cross it and you cannot,
         so the marsh flank is a threat you answer with bows, not bodies. */
      map: [
        'mmmm..........mmmmmmmm',
        'mm...ff.......########',
        '.....f........#__C___#',
        '..............#__G___#',
        '..............#______#',
        '..............###___##',
        '..~~~.........,,,,,,,,',
        '.~~~~~........,,......',
        '.~~~~~~.......,,......',
        '..~~~~~.......,,......',
        '...~~~........,,......',
        '..............,,......',
        '...tt.........,,...v..',
        '..ttt.........,,......',
        '...t~~~.......,,......',
        '....~~~~......,,......',
        '...~~~~.......,,....R.',
        '..............,,......'
      ],
      starts: [
        { x: 14, y: 17 }, { x: 15, y: 17 }, { x: 13, y: 17 }, { x: 16, y: 17 },
        { x: 12, y: 17 }, { x: 17, y: 17 }, { x: 14, y: 16 }, { x: 15, y: 16 },
        { x: 13, y: 16 }, { x: 16, y: 16 }, { x: 11, y: 17 }, { x: 18, y: 17 }
      ],
      forced: ['seren'],
      available: ['seren', 'dorn', 'mira', 'bram', 'rook', 'edran', 'nessa', 'cass', 'ilya', 'petra', 'garrick', 'corin', 'yrsa'],
      slots: 9,
      enemies: [
        /* the marsh — these walk on water and you do not */
        e('pirate', 10, 4, 8, ['ironaxe'], { ai: 'aggressive' }),
        e('pirate', 10, 5, 15, ['handaxe'], { ai: 'aggressive' }),
        /* the causeway */
        e('mercenary', 11, 15, 8, ['ironsword']),
        e('mercenary', 11, 14, 11, ['steelsword']),
        e('cavalier', 10, 15, 13, ['ironlance']),
        /* the gatehouse */
        e('soldier', 10, 17, 4, ['ironlance']),
        e('soldier', 10, 19, 4, ['javelin']),
        e('archer', 10, 16, 2, ['steelbow'], { ai: 'guard' }),
        e('knight', 10, 19, 2, ['steellance'], { ai: 'guard' }),
        e('mage', 10, 18, 4, ['thunder']),
        /* 2 turns from the village; a mounted unit needs 2 as well */
        e('brigand', 10, 20, 6, ['ironaxe'], { ai: 'raider', village: { x: 19, y: 12 } })
      ],
      boss: { key: 'roald', x: 17, y: 3, ai: 'boss' },
      npcs: [
        { id: 'yrsa', x: 3, y: 13, faction: 'enemy', ai: 'passive', talkWith: ['seren', 'petra'] }
      ],
      villages: [
        { x: 19, y: 12, event: 'ch5_ferryman' }
      ],
      chests: [
        { x: 17, y: 2, item: 'physic' }
      ],
      doors: [],
      reinforcements: [
        { turn: 5, list: [e('soldier', 10, 21, 6, ['ironlance'], { ai: 'aggressive' })] },
        { turn: 8, list: [e('cavalier', 11, 10, 0, ['steellance'], { ai: 'aggressive' })] }
      ],
      hardExtra: [
        e('pirate', 11, 3, 9, ['steelaxe'], { ai: 'aggressive' }),
        e('soldier', 11, 16, 4, ['steellance']),
        e('mercenary', 11, 15, 10, ['ironsword'])
      ]
    },

    /* ============================ CHAPTER 6 ============================ */
    {
      id: 'ch6',
      number: 6,
      name: "The Thane's Gate",
      objective: 'boss',
      objectiveText: 'Defeat Emory Thane',
      fog: 0,
      /* A keep laid out the way Greywater was, because the man holding it built
         both. The hall is open from the south; the two doors gate treasure only. */
      map: [
        '########################',
        '#_C_C_#__________#_C_C_#',
        '#_____D____T_____D_____#',
        '#_____#__I____I__#_____#',
        '#_____#__________#_____#',
        '#######__________#######',
        '#######__________#######',
        '#######__________#######',
        '#######__________#######',
        '##########____##########',
        '..........,,,,..........',
        '...ff.....,,,,......hh..',
        '..fff.....,,,,.....hhh..',
        '...f......,,,,......h...',
        '..v.......,,,,..........',
        '..........,,,,.....v....',
        '..ff......,,,,......ff..',
        'mm........,,,,........mm'
      ],
      starts: [
        { x: 10, y: 17 }, { x: 11, y: 17 }, { x: 12, y: 17 }, { x: 13, y: 17 },
        { x: 9, y: 17 }, { x: 14, y: 17 }, { x: 10, y: 16 }, { x: 11, y: 16 },
        { x: 12, y: 16 }, { x: 13, y: 16 }, { x: 8, y: 17 }, { x: 15, y: 17 }
      ],
      forced: ['seren'],
      available: ['seren', 'dorn', 'mira', 'bram', 'rook', 'edran', 'nessa', 'cass', 'ilya', 'petra', 'garrick', 'corin', 'yrsa', 'odile'],
      slots: 10,
      enemies: [
        e('knight', 11, 8, 3, ['steellance'], { ai: 'guard' }),
        e('knight', 11, 15, 3, ['steellance'], { ai: 'guard' }),
        e('soldier', 11, 10, 4, ['ironlance']),
        e('soldier', 11, 13, 4, ['javelin']),
        e('archer', 11, 9, 6, ['steelbow']),
        e('archer', 11, 14, 6, ['ironbow']),
        e('mage', 11, 11, 5, ['thunder']),
        e('mercenary', 11, 11, 8, ['steelsword']),
        e('cavalier', 11, 11, 11, ['steellance'], { ai: 'aggressive' }),
        e('mercenary', 11, 18, 12, ['ironsword']),
        /* both villages are a genuine race, on opposite sides of the road */
        e('brigand', 11, 8, 10, ['ironaxe'], { ai: 'raider', village: { x: 2, y: 14 } }),
        e('brigand', 11, 22, 11, ['handaxe'], { ai: 'raider', village: { x: 19, y: 15 } })
      ],
      boss: { key: 'emory', x: 11, y: 2, ai: 'boss' },
      npcs: [
        { id: 'odile', x: 20, y: 13, faction: 'enemy', ai: 'passive', talkWith: ['seren', 'mira'] }
      ],
      villages: [
        { x: 2, y: 14, event: 'ch6_west' },
        { x: 19, y: 15, event: 'ch6_east' }
      ],
      chests: [
        { x: 2, y: 1, item: 'silverlance' },
        { x: 4, y: 1, item: 'dracoshield' },
        { x: 19, y: 1, item: 'knightcrest' },
        { x: 21, y: 1, item: 'elixir' }
      ],
      doors: [{ x: 6, y: 2 }, { x: 17, y: 2 }],
      reinforcements: [
        { turn: 5, list: [e('soldier', 11, 0, 10, ['steellance'], { ai: 'aggressive' }), e('soldier', 11, 23, 10, ['javelin'], { ai: 'aggressive' })] },
        { turn: 8, list: [e('cavalier', 12, 0, 16, ['steellance'], { ai: 'aggressive' })] }
      ],
      hardExtra: [
        e('knight', 12, 11, 4, ['steellance'], { ai: 'guard' }),
        e('archer', 12, 12, 8, ['steelbow']),
        e('mercenary', 12, 6, 12, ['steelsword'])
      ]
    },

    /* ============================ CHAPTER 7 ============================ */
    {
      id: 'ch7',
      number: 7,
      name: 'Gallows Harbour',
      objective: 'rout',
      objectiveText: 'Clear the harbour',
      fog: 0,
      /* Everything north of the quay is open water. The pirates own it, your
         flier can cross it, and everyone else fights along a strip of planking.
         Drusa is on the east ship, up a one-tile gangway with an archer parked
         on it: you cannot walk past her guard, and her guard cannot counter at
         melee. The chest on the west ship is reachable by a flier alone — it is
         the reward for having brought Ilya rather than one more sword. */
      map: [
        '~~~~~~~~~~~~~~~~~~~~~~~~',
        '~~~~~~~~~~~~~~~~~~~~~~~~',
        '~~~~====~~~~~~====~~~~~~',
        '~~~~=C_=~~~~~~=__=~~~~~~',
        '~~~~=__=~~~~~~=__=~~~~~~',
        '~~~~====~~~~~~====~~~~~~',
        '~~~~~~~~~~~~~~~=~~~~~~~~',
        '====================~~~~',
        '____F_________F_____~~~~',
        '____________________~~~~',
        '..#####....#####....~~~~',
        '..#_C_#....#_C_#....~~~~',
        '..#___#....#___#....~~~~',
        '..##D##....##D##....~~~~',
        '..,,,,,,,,,,,,,,,,,,~~~~',
        '..v.................~~~~'
      ],
      starts: [
        { x: 4, y: 15 }, { x: 5, y: 15 }, { x: 6, y: 15 }, { x: 7, y: 15 },
        { x: 3, y: 15 }, { x: 8, y: 15 }, { x: 4, y: 14 }, { x: 5, y: 14 },
        { x: 6, y: 14 }, { x: 7, y: 14 }, { x: 9, y: 15 }, { x: 3, y: 14 }
      ],
      forced: ['seren'],
      available: ['seren', 'dorn', 'mira', 'bram', 'rook', 'edran', 'nessa', 'cass', 'ilya', 'petra', 'garrick', 'corin', 'yrsa', 'odile', 'kell'],
      slots: 10,
      enemies: [
        /* on the water, where you cannot follow */
        e('pirate', 12, 8, 3, ['steelaxe'], { ai: 'aggressive' }),
        e('pirate', 12, 11, 5, ['handaxe'], { ai: 'aggressive' }),
        e('pirate', 12, 21, 8, ['steelaxe'], { ai: 'aggressive' }),
        e('pirate', 12, 2, 6, ['handaxe'], { ai: 'aggressive' }),
        /* the gangway and the deck */
        e('archer', 12, 15, 5, ['killerbow'], { ai: 'guard' }),
        e('pirate', 12, 16, 3, ['steelaxe'], { ai: 'guard' }),
        e('pirate', 12, 16, 4, ['handaxe'], { ai: 'guard' }),
        /* the quay */
        e('soldier', 12, 14, 8, ['javelin'], { ai: 'guard' }),
        e('archer', 12, 6, 8, ['steelbow'], { ai: 'guard' }),
        e('mercenary', 12, 9, 9, ['steelsword']),
        e('mercenary', 12, 12, 7, ['killingedge']),
        e('brigand', 12, 4, 9, ['steelaxe']),
        e('shaman', 12, 11, 8, ['flux']),
        e('soldier', 12, 7, 9, ['ironlance'])
      ],
      boss: { key: 'drusa', x: 15, y: 3, ai: 'boss' },
      npcs: [
        { id: 'kell', x: 18, y: 9, faction: 'enemy', ai: 'passive', talkWith: ['seren', 'rook'] }
      ],
      villages: [
        { x: 2, y: 15, event: 'ch7_dockhand' }
      ],
      chests: [
        { x: 4, y: 11, item: 'silverbow' },
        { x: 13, y: 11, item: 'orionsbolt' },
        /* on the west ship: a flier gets this, nobody else does */
        { x: 5, y: 3, item: 'elysianwhip' }
      ],
      doors: [{ x: 4, y: 13 }, { x: 13, y: 13 }],
      reinforcements: [
        { turn: 4, list: [e('pirate', 12, 0, 2, ['steelaxe'], { ai: 'aggressive' }), e('pirate', 12, 23, 4, ['handaxe'], { ai: 'aggressive' })] },
        { turn: 7, list: [e('pirate', 13, 0, 5, ['silveraxe'], { ai: 'aggressive' })] },
        { turn: 10, list: [e('archer', 13, 19, 9, ['killerbow'], { ai: 'aggressive' })] }
      ],
      hardExtra: [
        e('pirate', 13, 5, 2, ['steelaxe'], { ai: 'aggressive' }),
        e('archer', 13, 10, 9, ['steelbow']),
        e('mercenary', 13, 15, 9, ['steelsword']),
        e('shaman', 13, 8, 8, ['flux'])
      ]
    },

    /* ============================ CHAPTER 8 ============================ */
    {
      id: 'ch8',
      number: 8,
      name: 'The Broken Oath',
      objective: 'boss',
      objectiveText: 'Defeat Wing-Marshal Oren',
      fog: 0,
      /* Open highland. Everything that matters here flies, so the fight is about
         where your archers stand, not where your line is. */
      map: [
        'mmm....^^^.....mmm....',
        'mm......^......mm.....',
        'm.....hhh.......mm....',
        '......hh.........m....',
        '..ff.............h....',
        '...f......###.........',
        '..........#T#.........',
        '..........#_#.........',
        '..........___.........',
        '....ff................',
        '..x..........v........',
        '......................',
        '...hh.........ff......',
        '..hhh.........f.......',
        '...h..............R...',
        'mm..............mmmmmm'
      ],
      starts: [
        { x: 8, y: 14 }, { x: 9, y: 14 }, { x: 10, y: 14 }, { x: 11, y: 14 },
        { x: 7, y: 14 }, { x: 12, y: 14 }, { x: 8, y: 13 }, { x: 9, y: 13 },
        { x: 10, y: 13 }, { x: 11, y: 13 }, { x: 6, y: 14 }, { x: 13, y: 14 }
      ],
      forced: ['seren'],
      available: ['seren', 'dorn', 'mira', 'bram', 'rook', 'edran', 'nessa', 'cass', 'ilya', 'petra', 'garrick', 'corin', 'yrsa', 'odile', 'kell', 'sirin'],
      slots: 11,
      enemies: [
        e('wyvernrider', 13, 3, 2, ['steellance'], { ai: 'aggressive' }),
        e('wyvernrider', 13, 18, 2, ['javelin'], { ai: 'aggressive' }),
        e('wyvernrider', 13, 1, 9, ['steellance'], { ai: 'aggressive' }),
        e('wyvernrider', 13, 20, 9, ['javelin'], { ai: 'aggressive' }),
        e('archer', 13, 8, 8, ['steelbow'], { ai: 'guard' }),
        e('archer', 13, 14, 8, ['steelbow'], { ai: 'guard' }),
        e('soldier', 13, 10, 8, ['steellance']),
        e('soldier', 13, 11, 8, ['javelin']),
        e('knight', 13, 11, 7, ['steellance'], { ai: 'guard' }),
        e('mercenary', 13, 5, 11, ['steelsword']),
        e('mercenary', 13, 16, 11, ['killingedge']),
        e('shaman', 13, 11, 9, ['flux'])
      ],
      boss: { key: 'oren', x: 11, y: 6, ai: 'boss' },
      npcs: [
        { id: 'sirin', x: 18, y: 4, faction: 'enemy', ai: 'passive', talkWith: ['seren'] }
      ],
      villages: [
        { x: 13, y: 10, event: 'ch8_shepherd' }
      ],
      chests: [],
      doors: [],
      reinforcements: [
        { turn: 4, list: [e('wyvernrider', 13, 0, 4, ['steellance'], { ai: 'aggressive' }), e('wyvernrider', 13, 21, 4, ['javelin'], { ai: 'aggressive' })] },
        { turn: 7, list: [e('wyvernrider', 14, 0, 11, ['silverlance'], { ai: 'aggressive' })] },
        { turn: 10, list: [e('wyvernrider', 14, 21, 11, ['steellance'], { ai: 'aggressive' })] }
      ],
      hardExtra: [
        e('wyvernrider', 14, 6, 3, ['steellance'], { ai: 'aggressive' }),
        e('archer', 14, 11, 10, ['killerbow']),
        e('mercenary', 14, 9, 11, ['steelsword']),
        e('soldier', 14, 12, 8, ['silverlance'])
      ]
    }
,
    /* ============================ CHAPTER 9 ============================ */
    {
      id: 'ch9',
      number: 9,
      name: 'The Grain Road',
      objective: 'seize',
      objectiveText: 'Seize the waystation gate',
      fog: 0,
      /* The first chapter where the enemy fields promoted units. The waystation
         is small and the road is long: the fight is about how much of their
         column you can catch before it reaches the gate. */
      map: [
        'mmm.....ffff......mmmmmm',
        'mm.......ff.......mmmmmm',
        'm.....hh..........mm....',
        '......h.....#######.....',
        '............#__C__#.....',
        '.....ff.....#__G__#.....',
        '............#_____#.....',
        '............###_###.....',
        ',,,,,,,,,,,,,,,,,,,,,,,,',
        '.......v................',
        '....ff.........hh.......',
        '...f...........hhh......',
        '................h.......',
        '..hh....................',
        '.hhh.............R......',
        'mm.....ff..........mmmmm'
      ],
      starts: [
        { x: 2, y: 12 }, { x: 3, y: 12 }, { x: 4, y: 12 }, { x: 5, y: 12 },
        { x: 4, y: 13 }, { x: 5, y: 13 }, { x: 6, y: 13 }, { x: 7, y: 13 },
        { x: 6, y: 12 }, { x: 7, y: 12 }, { x: 8, y: 13 }, { x: 8, y: 12 }
      ],
      forced: ['seren'],
      available: ['seren', 'dorn', 'mira', 'bram', 'rook', 'edran', 'nessa', 'cass', 'ilya', 'petra', 'garrick', 'corin', 'yrsa', 'odile', 'kell', 'sirin', 'talis'],
      slots: 11,
      enemies: [
        /* the waystation itself */
        e('general', 2, 15, 6, ['steellance'], { ai: 'guard' }),
        e('sniper', 2, 14, 4, ['steelbow'], { ai: 'guard' }),
        e('soldier', 16, 16, 6, ['silverlance']),
        e('mage', 16, 13, 5, ['elfire']),
        /* the column on the road */
        e('paladin', 2, 20, 8, ['steellance'], { ai: 'aggressive' }),
        e('cavalier', 16, 18, 8, ['steellance'], { ai: 'aggressive' }),
        e('cavalier', 16, 21, 8, ['ironsword'], { ai: 'aggressive' }),
        e('archer', 16, 19, 10, ['steelbow']),
        e('mercenary', 16, 17, 11, ['steelsword']),
        e('knight', 16, 13, 8, ['steellance'], { ai: 'guard' }),
        e('shaman', 16, 11, 10, ['flux']),
        /* 2 turns from the village; a mounted unit needs 2 as well */
        e('brigand', 16, 3, 8, ['steelaxe'], { ai: 'raider', village: { x: 7, y: 9 } })
      ],
      boss: { key: 'bern', x: 15, y: 5, ai: 'boss' },
      npcs: [
        { id: 'talis', x: 21, y: 13, faction: 'enemy', ai: 'passive', talkWith: ['seren', 'nessa'] }
      ],
      villages: [
        { x: 7, y: 9, event: 'ch9_carter' }
      ],
      chests: [
        { x: 15, y: 4, item: 'guidingring' }
      ],
      doors: [],
      reinforcements: [
        { turn: 5, list: [e('cavalier', 16, 23, 8, ['steellance'], { ai: 'aggressive' }), e('archer', 16, 23, 9, ['steelbow'], { ai: 'aggressive' })] },
        { turn: 9, list: [e('paladin', 2, 23, 10, ['steellance'], { ai: 'aggressive' })] }
      ],
      hardExtra: [
        e('sniper', 3, 16, 4, ['steelbow'], { ai: 'guard' }),
        e('swordmaster', 2, 16, 10, ['killingedge'], { ai: 'aggressive' }),
        e('soldier', 17, 12, 8, ['silverlance'])
      ]
    },

    /* ============================ CHAPTER 10 =========================== */
    {
      id: 'ch10',
      number: 10,
      name: 'Cinderwatch',
      objective: 'boss',
      objectiveText: 'Defeat Ser Malken',
      fog: 0,
      /* A burnt forest with a keep in the middle of it. Two villages on opposite
         flanks, one raider each, so saving both means splitting the party. */
      map: [
        'mmmmm..........mmmmmmm',
        '..x....########....x..',
        '.......#C____C#.......',
        '.......#___T__#.......',
        '.......#______#.......',
        '.......#_I__I_#.......',
        '.......###__###.......',
        '...x..........x.......',
        '......ff....ff........',
        '.....f........f.......',
        '..v.................v.',
        '......................',
        '....hh........hh......',
        '...hhh........hhh.....',
        '....h..........h......',
        '......................',
        '..ff..............ff..',
        'mm..................mm'
      ],
      starts: [
        { x: 9, y: 17 }, { x: 10, y: 17 }, { x: 11, y: 17 }, { x: 12, y: 17 },
        { x: 8, y: 17 }, { x: 13, y: 17 }, { x: 9, y: 16 }, { x: 10, y: 16 },
        { x: 11, y: 16 }, { x: 12, y: 16 }, { x: 7, y: 17 }, { x: 14, y: 17 }
      ],
      forced: ['seren'],
      available: ['seren', 'dorn', 'mira', 'bram', 'rook', 'edran', 'nessa', 'cass', 'ilya', 'petra', 'garrick', 'corin', 'yrsa', 'odile', 'kell', 'sirin', 'talis', 'roswyn'],
      slots: 12,
      enemies: [
        /* the keep */
        e('general', 3, 10, 4, ['silverlance'], { ai: 'guard' }),
        e('sniper', 3, 9, 2, ['steelbow'], { ai: 'guard' }),
        e('sniper', 3, 12, 2, ['steelbow'], { ai: 'guard' }),
        e('sage', 2, 11, 5, ['elfire']),
        e('soldier', 17, 10, 6, ['silverlance']),
        e('soldier', 17, 11, 6, ['javelin']),
        /* the burnt ground */
        e('hero', 2, 6, 9, ['steelsword'], { ai: 'aggressive' }),
        e('wyvernrider', 17, 15, 8, ['silverlance'], { ai: 'aggressive' }),
        e('mercenary', 17, 4, 12, ['killingedge']),
        e('archer', 17, 17, 12, ['killerbow']),
        /* one raider each, and the villages are eighteen tiles apart */
        e('brigand', 17, 13, 8, ['steelaxe'], { ai: 'raider', village: { x: 2, y: 10 } }),
        e('brigand', 17, 8, 8, ['handaxe'], { ai: 'raider', village: { x: 20, y: 10 } })
      ],
      boss: { key: 'malken', x: 11, y: 3, ai: 'boss' },
      npcs: [
        { id: 'roswyn', x: 3, y: 7, faction: 'enemy', ai: 'passive', talkWith: ['seren', 'dorn'] }
      ],
      villages: [
        { x: 2, y: 10, event: 'ch10_west' },
        { x: 20, y: 10, event: 'ch10_east' }
      ],
      chests: [
        { x: 8, y: 2, item: 'herocrest' },
        { x: 13, y: 2, item: 'silveraxe' }
      ],
      doors: [],
      reinforcements: [
        { turn: 5, list: [e('wyvernrider', 17, 0, 0, ['steellance'], { ai: 'aggressive' }), e('wyvernrider', 17, 21, 0, ['javelin'], { ai: 'aggressive' })] },
        { turn: 9, list: [e('paladin', 3, 19, 17, ['silverlance'], { ai: 'aggressive' })] }
      ],
      hardExtra: [
        e('general', 3, 11, 4, ['silverlance'], { ai: 'guard' }),
        e('swordmaster', 3, 8, 9, ['killingedge'], { ai: 'aggressive' }),
        e('druid', 2, 13, 9, ['flux']),
        e('sniper', 3, 5, 13, ['killerbow'])
      ]
    },

    /* ============================ CHAPTER 11 =========================== */
    {
      id: 'ch11',
      number: 11,
      name: 'The Ember Cloister',
      objective: 'survive',
      objectiveText: 'Hold the cloister for 12 turns',
      survive: 12,
      fog: 0,
      /* You start inside and they come from every edge. The four fort tiles in
         the middle heal 20% a turn, which is the whole reason the walls are
         worth standing behind rather than fighting in front of. */
      map: [
        'mm....f......f....mmmm',
        'm.........hh..........',
        '..........h...........',
        '......................',
        '....############......',
        '....#__C____C__#......',
        '....#__________#......',
        '....#___FFFF___#......',
        '....#___FFFF___#......',
        '....#__________#......',
        '....#####__#####......',
        '......................',
        '...ff..........ff.....',
        '..f................f..',
        '.........v............',
        'mm..................mm'
      ],
      starts: [
        { x: 8, y: 7 }, { x: 9, y: 7 }, { x: 10, y: 7 }, { x: 11, y: 7 },
        { x: 8, y: 8 }, { x: 9, y: 8 }, { x: 10, y: 8 }, { x: 11, y: 8 },
        { x: 7, y: 7 }, { x: 12, y: 7 }, { x: 7, y: 8 }, { x: 12, y: 8 }
      ],
      forced: ['seren'],
      available: ['seren', 'dorn', 'mira', 'bram', 'rook', 'edran', 'nessa', 'cass', 'ilya', 'petra', 'garrick', 'corin', 'yrsa', 'odile', 'kell', 'sirin', 'talis', 'roswyn', 'thessaly'],
      slots: 12,
      enemies: [
        e('warrior', 3, 3, 2, ['silveraxe'], { ai: 'aggressive' }),
        e('warrior', 3, 18, 2, ['steelaxe'], { ai: 'aggressive' }),
        e('swordmaster', 3, 2, 12, ['killingedge'], { ai: 'aggressive' }),
        e('swordmaster', 3, 19, 12, ['steelsword'], { ai: 'aggressive' }),
        e('sniper', 3, 1, 6, ['killerbow'], { ai: 'aggressive' }),
        e('sniper', 3, 20, 6, ['steelbow'], { ai: 'aggressive' }),
        e('sage', 3, 5, 14, ['elfire'], { ai: 'aggressive' }),
        e('mage', 18, 16, 14, ['elfire'], { ai: 'aggressive' }),
        e('soldier', 18, 9, 2, ['silverlance'], { ai: 'aggressive' }),
        e('soldier', 18, 12, 2, ['javelin'], { ai: 'aggressive' }),
        e('knight', 18, 8, 13, ['silverlance'], { ai: 'aggressive' }),
        e('knight', 18, 13, 13, ['steellance'], { ai: 'aggressive' })
      ],
      boss: { key: 'reyl', x: 10, y: 1, ai: 'boss' },
      npcs: [
        { id: 'thessaly', x: 13, y: 9, faction: 'npc', ai: 'passive', talkWith: ['seren', 'corin', 'mira'] }
      ],
      villages: [
        { x: 9, y: 14, event: 'ch11_bellringer' }
      ],
      chests: [
        { x: 7, y: 5, item: 'silverbow' },
        { x: 12, y: 5, item: 'oceanseal' }
      ],
      doors: [],
      reinforcements: [
        { turn: 3, list: [e('wyvernrider', 18, 0, 0, ['silverlance'], { ai: 'aggressive' }), e('wyvernrider', 18, 21, 0, ['javelin'], { ai: 'aggressive' })] },
        { turn: 5, list: [e('hero', 3, 0, 15, ['steelsword'], { ai: 'aggressive' }), e('hero', 3, 21, 15, ['silversword'], { ai: 'aggressive' })] },
        { turn: 7, list: [e('paladin', 3, 0, 8, ['silverlance'], { ai: 'aggressive' }), e('paladin', 3, 21, 8, ['steellance'], { ai: 'aggressive' })] },
        { turn: 9, list: [e('wyvernlord', 2, 10, 0, ['silverlance'], { ai: 'aggressive' })] },
        { turn: 11, list: [e('warrior', 4, 0, 3, ['silveraxe'], { ai: 'aggressive' }), e('sniper', 4, 21, 3, ['silverbow'], { ai: 'aggressive' })] }
      ],
      hardExtra: [
        e('druid', 3, 3, 3, ['luna'], { ai: 'aggressive' }),
        e('greatknight', 3, 18, 13, ['silveraxe'], { ai: 'aggressive' }),
        e('sniper', 4, 10, 13, ['killerbow'], { ai: 'aggressive' })
      ]
    },

    /* ============================ CHAPTER 12 =========================== */
    {
      id: 'ch12',
      number: 12,
      name: 'The Kestrel Gate',
      objective: 'seize',
      objectiveText: 'Seize the gate with Seren',
      fog: 0,
      /* Solk does not sit on the throne. You can take the gate without ever
         reaching him, and he rides for the capital on turn sixteen either way:
         the choice is whether his drop is worth the detour. */
      map: [
        '########################',
        '#_C__#__________#__C___#',
        '#____D__________D______#',
        '#____#_____T____#______#',
        '#____#__________#______#',
        '######__I____I__########',
        '.....#__________#.......',
        '.....#__________#.......',
        '.....#####__#####.......',
        '........,,,,,,,,........',
        '...mm...,,,,,,,,...mm...',
        '..mmm...,,,,,,,,...mmm..',
        '...mm...,,,,,,,,...mm...',
        '........,,,,,,,,........',
        '....v.......v...........',
        '..ff................ff..',
        '........R...............',
        'mmm..................mmm'
      ],
      starts: [
        { x: 10, y: 17 }, { x: 11, y: 17 }, { x: 12, y: 17 }, { x: 13, y: 17 },
        { x: 9, y: 17 }, { x: 14, y: 17 }, { x: 10, y: 16 }, { x: 11, y: 16 },
        { x: 12, y: 16 }, { x: 13, y: 16 }, { x: 8, y: 17 }, { x: 15, y: 17 }
      ],
      forced: ['seren'],
      available: ['seren', 'dorn', 'mira', 'bram', 'rook', 'edran', 'nessa', 'cass', 'ilya', 'petra', 'garrick', 'corin', 'yrsa', 'odile', 'kell', 'sirin', 'talis', 'roswyn', 'thessaly'],
      slots: 12,
      enemies: [
        /* the throne room */
        e('general', 4, 10, 3, ['silverlance'], { ai: 'guard' }),
        e('general', 4, 12, 3, ['silverlance'], { ai: 'guard' }),
        e('sniper', 4, 8, 4, ['silverbow'], { ai: 'guard' }),
        e('sniper', 4, 14, 4, ['killerbow'], { ai: 'guard' }),
        e('sage', 3, 11, 4, ['elfire']),
        /* the hall below it */
        e('hero', 4, 10, 6, ['silversword']),
        e('hero', 4, 11, 7, ['steelsword']),
        e('swordmaster', 4, 13, 6, ['killingedge']),
        e('greatknight', 3, 9, 7, ['silveraxe'], { ai: 'guard' }),
        /* the pass */
        e('paladin', 4, 11, 10, ['silverlance'], { ai: 'aggressive' }),
        e('paladin', 4, 12, 12, ['horseslayer'], { ai: 'aggressive' }),
        e('wyvernlord', 3, 4, 10, ['silverlance'], { ai: 'aggressive' }),
        e('wyvernlord', 3, 19, 12, ['javelin'], { ai: 'aggressive' }),
        /* one raider each; both villages are a genuine race from the road */
        e('brigand', 19, 14, 13, ['silveraxe'], { ai: 'raider', village: { x: 4, y: 14 } }),
        e('warrior', 4, 16, 13, ['steelaxe'], { ai: 'raider', village: { x: 12, y: 14 } })
      ],
      boss: { key: 'solk', x: 19, y: 3, ai: 'boss' },
      npcs: [],
      villages: [
        { x: 4, y: 14, event: 'ch12_west' },
        { x: 12, y: 14, event: 'ch12_pass' }
      ],
      chests: [
        { x: 2, y: 1, item: 'orionsbolt' },
        { x: 19, y: 1, item: 'silversword' }
      ],
      doors: [{ x: 5, y: 2 }, { x: 16, y: 2 }],
      reinforcements: [
        { turn: 4, list: [e('wyvernlord', 3, 0, 9, ['silverlance'], { ai: 'aggressive' }), e('wyvernlord', 3, 23, 9, ['javelin'], { ai: 'aggressive' })] },
        { turn: 8, list: [e('paladin', 4, 0, 13, ['silverlance'], { ai: 'aggressive' }), e('paladin', 4, 23, 13, ['steellance'], { ai: 'aggressive' })] },
        { turn: 12, list: [e('general', 4, 11, 8, ['silverlance'], { ai: 'aggressive' })] }
      ],
      hardExtra: [
        e('general', 5, 11, 3, ['silverlance'], { ai: 'guard' }),
        e('sage', 4, 10, 4, ['elfire']),
        e('swordmaster', 5, 12, 6, ['killingedge']),
        e('sniper', 5, 11, 11, ['silverbow'], { ai: 'aggressive' })
      ]
    }
,
    /* ============================ CHAPTER 13 =========================== */
    {
      id: 'ch13',
      number: 13,
      name: 'The North Road',
      objective: 'boss',
      objectiveText: 'Defeat Field-Marshal Corran',
      fog: 0,
      /* From here the opposition is promoted almost to a unit. Open ground, no
         walls to hide behind, and a field marshal on a pair of forts in the
         middle of it. This is the chapter that asks whether you promoted. */
      map: [
        'mmm......ffff.........mmmm',
        'mm......ff.........hh..mmm',
        'm..................hhh...m',
        '........ff..........hh....',
        '....hh....................',
        '...hhh.......FF...........',
        '....h........FF...........',
        '..........................',
        '..v...................v...',
        '..........................',
        '......ff..........ff......',
        '.....fff...........f......',
        '..........................',
        '...hh.............hh......',
        '..hhh......R......hhh.....',
        'mmm..................mmmmm'
      ],
      starts: [
        { x: 11, y: 13 }, { x: 12, y: 13 }, { x: 13, y: 13 }, { x: 14, y: 13 },
        { x: 10, y: 13 }, { x: 15, y: 13 }, { x: 11, y: 12 }, { x: 12, y: 12 },
        { x: 13, y: 12 }, { x: 14, y: 12 }, { x: 9, y: 13 }, { x: 16, y: 13 }
      ],
      forced: ['seren'],
      available: ['seren', 'dorn', 'mira', 'bram', 'rook', 'edran', 'nessa', 'cass', 'ilya', 'petra', 'garrick', 'corin', 'yrsa', 'odile', 'kell', 'sirin', 'talis', 'roswyn', 'thessaly'],
      slots: 12,
      enemies: [
        e('general', 5, 14, 5, ['silverlance'], { ai: 'guard' }),
        e('sniper', 5, 12, 4, ['silverbow'], { ai: 'guard' }),
        e('sniper', 5, 16, 4, ['killerbow'], { ai: 'guard' }),
        e('paladin', 5, 9, 6, ['silverlance'], { ai: 'aggressive' }),
        e('paladin', 5, 18, 6, ['horseslayer'], { ai: 'aggressive' }),
        e('hero', 5, 11, 7, ['silversword']),
        e('hero', 5, 16, 7, ['steelsword']),
        e('swordmaster', 5, 13, 8, ['killingedge'], { ai: 'aggressive' }),
        e('sage', 4, 14, 3, ['elfire']),
        e('wyvernlord', 4, 4, 2, ['silverlance'], { ai: 'aggressive' }),
        e('wyvernlord', 4, 21, 2, ['javelin'], { ai: 'aggressive' }),
        /* one raider each; the villages sit on opposite flanks of the field */
        e('warrior', 5, 13, 11, ['silveraxe'], { ai: 'raider', village: { x: 2, y: 8 } }),
        e('warrior', 5, 16, 10, ['steelaxe'], { ai: 'raider', village: { x: 22, y: 8 } })
      ],
      boss: { key: 'corran', x: 13, y: 5, ai: 'boss' },
      npcs: [],
      villages: [
        { x: 2, y: 8, event: 'ch13_west' },
        { x: 22, y: 8, event: 'ch13_east' }
      ],
      chests: [],
      doors: [],
      reinforcements: [
        { turn: 5, list: [e('paladin', 5, 0, 7, ['silverlance'], { ai: 'aggressive' }), e('paladin', 5, 25, 7, ['steellance'], { ai: 'aggressive' })] },
        { turn: 9, list: [e('greatknight', 4, 13, 0, ['silveraxe'], { ai: 'aggressive' })] }
      ],
      hardExtra: [
        e('general', 6, 12, 5, ['silverlance'], { ai: 'guard' }),
        e('swordmaster', 6, 14, 8, ['killingedge'], { ai: 'aggressive' }),
        e('sniper', 6, 13, 10, ['silverbow']),
        e('sage', 5, 13, 3, ['bolting'])
      ]
    },

    /* ============================ CHAPTER 14 =========================== */
    {
      id: 'ch14',
      number: 14,
      name: "Solk's Line",
      objective: 'seize',
      objectiveText: 'Seize the throne with Seren',
      fog: 0,
      /* Solk kept his word and did not run twice. One bridge, two tiles wide,
         with forts on the far bank to heal whatever is standing on them. */
      map: [
        '########################',
        '#_C__#____________#__C_#',
        '#____D_____T______D____#',
        '#____#____________#____#',
        '######____I__I____######',
        '.....#____________#.....',
        '.....######__######.....',
        '.....................FF.',
        '~~~~~~~~==~~~~~~~~~~~FF.',
        '~~~~~~~~==~~~~~~~~~~~~~~',
        '........,,..............',
        '..ff....,,.......v......',
        '........,,..............',
        '...hh...,,.........hh...',
        '..hhh...,,........hhh...',
        '........,,..............',
        '....R...,,..............',
        'mmm..................mmm'
      ],
      starts: [
        { x: 8, y: 17 }, { x: 9, y: 17 }, { x: 7, y: 17 }, { x: 10, y: 17 },
        { x: 6, y: 17 }, { x: 11, y: 17 }, { x: 8, y: 16 }, { x: 9, y: 16 },
        { x: 7, y: 16 }, { x: 10, y: 16 }, { x: 5, y: 17 }, { x: 12, y: 17 }
      ],
      forced: ['seren'],
      available: ['seren', 'dorn', 'mira', 'bram', 'rook', 'edran', 'nessa', 'cass', 'ilya', 'petra', 'garrick', 'corin', 'yrsa', 'odile', 'kell', 'sirin', 'talis', 'roswyn', 'thessaly'],
      slots: 12,
      enemies: [
        /* the throne room */
        e('general', 6, 10, 3, ['silverlance'], { ai: 'guard' }),
        e('general', 6, 13, 3, ['silverlance'], { ai: 'guard' }),
        e('sniper', 6, 8, 3, ['silverbow'], { ai: 'guard' }),
        e('sage', 5, 11, 3, ['elfire']),
        /* the hall */
        e('hero', 6, 11, 5, ['silversword']),
        e('swordmaster', 6, 12, 5, ['killingedge']),
        e('greatknight', 5, 11, 7, ['silveraxe'], { ai: 'guard' }),
        /* the far bank, on the forts */
        e('sniper', 6, 21, 7, ['killerbow'], { ai: 'guard' }),
        e('warrior', 6, 22, 8, ['silveraxe'], { ai: 'guard' }),
        /* the crossing */
        e('paladin', 6, 8, 10, ['silverlance'], { ai: 'aggressive' }),
        e('paladin', 6, 9, 12, ['horseslayer'], { ai: 'aggressive' }),
        e('wyvernlord', 5, 18, 12, ['silverlance'], { ai: 'aggressive' }),
        /* 3 turns from the village; a mounted unit needs 3 as well */
        e('warrior', 6, 3, 10, ['silveraxe'], { ai: 'raider', village: { x: 17, y: 11 } })
      ],
      boss: { key: 'solk2', x: 11, y: 2, ai: 'boss' },
      npcs: [],
      villages: [
        { x: 17, y: 11, event: 'ch14_ferry' }
      ],
      chests: [
        { x: 2, y: 1, item: 'silverlance' },
        { x: 21, y: 1, item: 'talisman' }
      ],
      doors: [{ x: 5, y: 2 }, { x: 18, y: 2 }],
      reinforcements: [
        { turn: 4, list: [e('wyvernlord', 5, 0, 8, ['silverlance'], { ai: 'aggressive' }), e('wyvernlord', 5, 23, 9, ['javelin'], { ai: 'aggressive' })] },
        { turn: 8, list: [e('paladin', 6, 0, 16, ['silverlance'], { ai: 'aggressive' }), e('paladin', 6, 23, 16, ['steellance'], { ai: 'aggressive' })] },
        { turn: 12, list: [e('general', 6, 11, 5, ['silverlance'], { ai: 'aggressive' })] }
      ],
      hardExtra: [
        e('general', 7, 11, 4, ['silverlance'], { ai: 'guard' }),
        e('sniper', 7, 14, 3, ['killerbow'], { ai: 'guard' }),
        e('swordmaster', 7, 10, 5, ['killingedge']),
        e('druid', 5, 12, 7, ['luna'])
      ]
    },

    /* ============================ CHAPTER 15 =========================== */
    {
      id: 'ch15',
      number: 15,
      name: 'The Outer Wards',
      objective: 'rout',
      objectiveText: 'Clear the ward',
      fog: 0,
      /* Streets. Every block is a wall and every junction is a place to be
         surrounded, which is what a swordmaster who knows the alleys wants. */
      map: [
        '####____####____####____',
        '####____####____####____',
        '________________________',
        '________________________',
        '####____####____####____',
        '####____####____####____',
        '________________________',
        '________________________',
        '####____##CC##___I##____',
        '####____##__##____##____',
        '________________________',
        '________________________',
        '####____####____####____',
        '####____####____####____',
        '___v________________v___',
        '________________________',
        '####_R__####____####____',
        '________________________'
      ],
      starts: [
        { x: 4, y: 17 }, { x: 5, y: 17 }, { x: 6, y: 17 }, { x: 7, y: 17 },
        { x: 3, y: 17 }, { x: 8, y: 17 }, { x: 12, y: 17 }, { x: 13, y: 17 },
        { x: 14, y: 17 }, { x: 15, y: 17 }, { x: 2, y: 17 }, { x: 9, y: 17 }
      ],
      forced: ['seren'],
      available: ['seren', 'dorn', 'mira', 'bram', 'rook', 'edran', 'nessa', 'cass', 'ilya', 'petra', 'garrick', 'corin', 'yrsa', 'odile', 'kell', 'sirin', 'talis', 'roswyn', 'thessaly', 'ivane'],
      slots: 12,
      enemies: [
        e('swordmaster', 6, 5, 11, ['killingedge'], { ai: 'aggressive' }),
        e('swordmaster', 6, 18, 11, ['silversword'], { ai: 'aggressive' }),
        e('assassin', 5, 13, 14, ['killingedge'], { ai: 'aggressive' }),
        e('hero', 6, 6, 7, ['silversword'], { ai: 'aggressive' }),
        e('hero', 6, 17, 7, ['steelsword'], { ai: 'aggressive' }),
        e('sniper', 6, 5, 3, ['silverbow'], { ai: 'guard' }),
        e('sniper', 6, 18, 3, ['killerbow'], { ai: 'guard' }),
        e('sage', 5, 13, 3, ['elfire'], { ai: 'aggressive' }),
        e('druid', 5, 6, 3, ['luna'], { ai: 'aggressive' }),
        e('general', 6, 11, 6, ['silverlance'], { ai: 'guard' }),
        e('warrior', 6, 21, 10, ['silveraxe'], { ai: 'aggressive' }),
        e('paladin', 6, 2, 10, ['silverlance'], { ai: 'aggressive' })
      ],
      boss: { key: 'bellis', x: 11, y: 7, ai: 'boss' },
      npcs: [
        { id: 'ivane', x: 20, y: 14, faction: 'enemy', ai: 'passive', talkWith: ['seren', 'thessaly', 'petra'] }
      ],
      villages: [
        { x: 3, y: 14, event: 'ch15_locksmith' },
        { x: 20, y: 14, event: 'ch15_archivist' }
      ],
      chests: [
        { x: 10, y: 8, item: 'silversword' },
        { x: 11, y: 8, item: 'goddessicon' }
      ],
      doors: [],
      reinforcements: [
        { turn: 4, list: [e('swordmaster', 6, 2, 2, ['silversword'], { ai: 'aggressive' }), e('swordmaster', 6, 21, 2, ['killingedge'], { ai: 'aggressive' })] },
        { turn: 8, list: [e('hero', 6, 2, 15, ['silversword'], { ai: 'aggressive' }), e('hero', 6, 21, 15, ['steelsword'], { ai: 'aggressive' })] },
        { turn: 12, list: [e('assassin', 6, 11, 2, ['killingedge'], { ai: 'aggressive' })] }
      ],
      hardExtra: [
        e('assassin', 6, 6, 15, ['killingedge'], { ai: 'aggressive' }),
        e('sniper', 7, 14, 6, ['silverbow'], { ai: 'guard' }),
        e('druid', 6, 17, 3, ['luna'], { ai: 'aggressive' }),
        e('greatknight', 5, 11, 11, ['silveraxe'], { ai: 'aggressive' })
      ]
    },

    /* ============================ CHAPTER 16 =========================== */
    {
      id: 'ch16',
      number: 16,
      name: 'The Forge',
      objective: 'boss',
      objectiveText: 'Defeat Magister Vahl',
      fog: 0,
      /* Vahl holds the middle chamber with a siege tome, so standing still in
         the open hall costs you. The foundry below is a pocket, not a route:
         both ways up the hall run round it. */
      map: [
        '######################',
        '#____________________#',
        '#__C____#######___C__#',
        '#_______#_____#______#',
        '#___I___#__T__#___I__#',
        '#_______#_____#______#',
        '#_______##_D_##______#',
        '#____________________#',
        '#__I___I_____I___I___#',
        '#____________________#',
        '#___##############___#',
        '#___#____________#___#',
        '#___#____________#___#',
        '#___##____##____##___#',
        '#____________________#',
        '#__I_____I__I_____I__#',
        '#________________R___#',
        '######################'
      ],
      starts: [
        { x: 8, y: 16 }, { x: 9, y: 16 }, { x: 10, y: 16 }, { x: 11, y: 16 },
        { x: 7, y: 16 }, { x: 12, y: 16 }, { x: 8, y: 15 }, { x: 10, y: 15 },
        { x: 11, y: 15 }, { x: 13, y: 15 }, { x: 6, y: 16 }, { x: 13, y: 16 }
      ],
      forced: ['seren'],
      available: ['seren', 'dorn', 'mira', 'bram', 'rook', 'edran', 'nessa', 'cass', 'ilya', 'petra', 'garrick', 'corin', 'yrsa', 'odile', 'kell', 'sirin', 'talis', 'roswyn', 'thessaly', 'ivane'],
      slots: 12,
      enemies: [
        /* the chamber */
        e('general', 7, 10, 5, ['silverlance'], { ai: 'guard' }),
        e('general', 7, 12, 5, ['silverlance'], { ai: 'guard' }),
        e('sniper', 7, 10, 3, ['silverbow'], { ai: 'guard' }),
        e('sniper', 7, 12, 3, ['killerbow'], { ai: 'guard' }),
        /* the hall */
        e('hero', 7, 5, 8, ['silversword']),
        e('hero', 7, 16, 8, ['silversword']),
        e('swordmaster', 7, 8, 8, ['killingedge']),
        e('swordmaster', 7, 13, 8, ['silversword']),
        e('druid', 6, 3, 8, ['luna']),
        e('sage', 6, 18, 8, ['elfire']),
        e('paladin', 7, 2, 14, ['silverlance'], { ai: 'aggressive' }),
        e('paladin', 7, 19, 14, ['horseslayer'], { ai: 'aggressive' }),
        /* the foundry pocket, which you never have to enter */
        e('warrior', 7, 8, 12, ['silveraxe'], { ai: 'guard' }),
        e('warrior', 7, 13, 12, ['killeraxe'], { ai: 'guard' })
      ],
      boss: { key: 'vahl', x: 11, y: 4, ai: 'boss' },
      npcs: [],
      villages: [],
      chests: [
        { x: 3, y: 2, item: 'elixir' },
        { x: 18, y: 2, item: 'energyring' }
      ],
      doors: [{ x: 11, y: 6 }],
      reinforcements: [
        { turn: 4, list: [e('hero', 7, 1, 16, ['silversword'], { ai: 'aggressive' }), e('hero', 7, 20, 16, ['steelsword'], { ai: 'aggressive' })] },
        { turn: 8, list: [e('swordmaster', 7, 1, 9, ['killingedge'], { ai: 'aggressive' }), e('swordmaster', 7, 20, 9, ['silversword'], { ai: 'aggressive' })] },
        { turn: 12, list: [e('general', 7, 11, 7, ['silverlance'], { ai: 'aggressive' })] }
      ],
      hardExtra: [
        e('general', 8, 11, 5, ['silverlance'], { ai: 'guard' }),
        e('druid', 7, 11, 8, ['luna']),
        e('sniper', 8, 11, 9, ['silverbow']),
        e('greatknight', 6, 6, 14, ['silveraxe'], { ai: 'aggressive' })
      ]
    },

    /* ============================ CHAPTER 17 =========================== */
    {
      id: 'ch17',
      number: 17,
      name: 'The Sealed Level',
      objective: 'survive',
      objectiveText: 'Survive 12 turns',
      survive: 12,
      fog: 0,
      /* The doors drop with the crown still on the anvil. Two four-tile mouths
         into the chamber and nothing else: this is a chapter about holding a
         doorway, so the siege tomes outside are the price of pure turtling. */
      map: [
        '########################',
        '#F____##________##____F#',
        '#_____##___II___##_____#',
        '#__I_______________I___#',
        '#####_###______###_#####',
        '#___________II_________#',
        '#_I__#####____#####__I_#',
        '#____#___C____C___#____#',
        '#____#______T_____#____#',
        '#____#____________#____#',
        '#_I__#####____#####__I_#',
        '#___________II_________#',
        '#####_###______###_#####',
        '#__I_______________I___#',
        '#_____##___II___##_____#',
        '#F____##________##____F#',
        '#______________________#',
        '########################'
      ],
      starts: [
        { x: 10, y: 9 }, { x: 11, y: 9 }, { x: 12, y: 9 }, { x: 13, y: 9 },
        { x: 10, y: 8 }, { x: 11, y: 8 }, { x: 13, y: 8 }, { x: 14, y: 8 },
        { x: 9, y: 8 }, { x: 10, y: 7 }, { x: 11, y: 7 }, { x: 12, y: 7 }
      ],
      forced: ['seren'],
      available: ['seren', 'dorn', 'mira', 'bram', 'rook', 'edran', 'nessa', 'cass', 'ilya', 'petra', 'garrick', 'corin', 'yrsa', 'odile', 'kell', 'sirin', 'talis', 'roswyn', 'thessaly', 'ivane'],
      slots: 12,
      enemies: [
        e('general', 12, 10, 3, ['silverlance'], { ai: 'guard' }),
        e('general', 12, 13, 3, ['spear'], { ai: 'guard' }),
        e('sniper', 12, 9, 2, ['silverbow'], { ai: 'guard' }),
        e('sniper', 12, 14, 2, ['killerbow'], { ai: 'guard' }),
        e('druid', 12, 11, 2, ['bolting', 'flux'], { ai: 'guard' }),
        e('swordmaster', 12, 8, 3, ['killingedge'], { ai: 'aggressive' }),
        e('hero', 12, 15, 3, ['silversword'], { ai: 'aggressive' }),
        e('paladin', 12, 3, 3, ['silverlance'], { ai: 'aggressive' }),
        e('paladin', 12, 20, 3, ['horseslayer'], { ai: 'aggressive' }),
        e('general', 12, 10, 13, ['spear'], { ai: 'guard' }),
        e('general', 12, 13, 13, ['silverlance'], { ai: 'guard' }),
        e('bishop', 12, 12, 14, ['purge', 'divine'], { ai: 'guard' }),
        e('warrior', 12, 8, 13, ['silveraxe'], { ai: 'aggressive' }),
        e('warrior', 12, 15, 13, ['tomahawk'], { ai: 'aggressive' }),
        e('greatknight', 12, 3, 13, ['silveraxe'], { ai: 'aggressive' }),
        e('greatknight', 12, 20, 13, ['silverlance'], { ai: 'aggressive' }),
        e('assassin', 12, 2, 6, ['killingedge'], { ai: 'aggressive' }),
        e('assassin', 12, 21, 10, ['silversword'], { ai: 'aggressive' })
      ],
      boss: { key: 'draugh', x: 11, y: 5, ai: 'boss' },
      npcs: [],
      villages: [],
      chests: [
        { x: 9, y: 7, item: 'elixir' },
        { x: 14, y: 7, item: 'talisman' }
      ],
      doors: [],
      reinforcements: [
        { turn: 3, list: [
          e('hero', 12, 1, 1, ['silversword'], { ai: 'aggressive' }),
          e('hero', 12, 22, 1, ['steelsword'], { ai: 'aggressive' })
        ] },
        { turn: 5, list: [
          e('warrior', 12, 1, 16, ['silveraxe'], { ai: 'aggressive' }),
          e('warrior', 12, 22, 16, ['killeraxe'], { ai: 'aggressive' })
        ] },
        { turn: 7, list: [
          e('wyvernlord', 13, 1, 1, ['spear'], { ai: 'aggressive' }),
          e('wyvernlord', 13, 22, 16, ['silverlance'], { ai: 'aggressive' })
        ] },
        { turn: 9, list: [
          e('swordmaster', 13, 1, 16, ['killingedge'], { ai: 'aggressive' }),
          e('swordmaster', 13, 22, 1, ['silversword'], { ai: 'aggressive' })
        ] },
        { turn: 11, list: [
          e('greatknight', 13, 1, 1, ['tomahawk'], { ai: 'aggressive' }),
          e('greatknight', 13, 22, 16, ['silveraxe'], { ai: 'aggressive' })
        ] }
      ],
      hardExtra: [
        e('general', 14, 11, 3, ['silverlance'], { ai: 'guard' }),
        e('sniper', 14, 12, 13, ['silverbow'], { ai: 'guard' }),
        e('druid', 13, 11, 14, ['bolting'], { ai: 'guard' }),
        e('wyvernlord', 13, 20, 6, ['spear'], { ai: 'aggressive' })
      ]
    },

    /* ============================ CHAPTER 18 =========================== */
    {
      id: 'ch18',
      number: 18,
      name: 'The Water Stair',
      objective: 'seize',
      objectiveText: 'Seize the cistern gate',
      fog: 1,
      /* Dark, and nothing crosses the cisterns but the bridges and whatever has
         wings. Fog covers the whole level (fog: 1 = clear west of column 1,
         i.e. nowhere), which is what the Torch Staff in the strongroom is for.
         The lower channel is one row deep on purpose: two rows of single-file
         under flier pressure made the walk to the gate longer than the fight. */
      map: [
        '######################',
        '######____G____#######',
        '######_##___##_#######',
        '#____I_#_____#_I_____#',
        '#_III__#_____#__III__#',
        '#______#_____#_______#',
        '#~~~~=~~~~~~~~~~=~~~~#',
        '#~~~~=~~~~~~~~~~=~~~~#',
        '#_F______I__I______F_#',
        '#____###########_____#',
        '#____#___C___C_#_____#',
        '#_I__#_________#__I__#',
        '#____#####_#####_____#',
        '#____________________#',
        '#~~~~~=~~~~~~~=~~~~~~#',
        '#____________________#',
        '#_I__F____I__I____F__#',
        '######################'
      ],
      starts: [
        { x: 9, y: 16 }, { x: 10, y: 16 }, { x: 11, y: 16 }, { x: 12, y: 16 },
        { x: 8, y: 16 }, { x: 13, y: 16 }, { x: 9, y: 15 }, { x: 12, y: 15 },
        { x: 7, y: 16 }, { x: 14, y: 16 }, { x: 10, y: 15 }, { x: 11, y: 15 }
      ],
      forced: ['seren'],
      available: ['seren', 'dorn', 'mira', 'bram', 'rook', 'edran', 'nessa', 'cass', 'ilya', 'petra', 'garrick', 'corin', 'yrsa', 'odile', 'kell', 'sirin', 'talis', 'roswyn', 'thessaly', 'ivane'],
      slots: 12,
      enemies: [
        e('general', 14, 9, 2, ['spear'], { ai: 'guard' }),
        e('general', 14, 11, 2, ['silverlance'], { ai: 'guard' }),
        e('sniper', 14, 8, 3, ['silverbow'], { ai: 'guard' }),
        e('sniper', 14, 12, 3, ['killerbow'], { ai: 'guard' }),
        e('bishop', 14, 10, 4, ['purge', 'divine'], { ai: 'guard' }),
        e('swordmaster', 14, 10, 5, ['killingedge'], { ai: 'guard' }),
        e('hero', 14, 2, 4, ['silversword'], { ai: 'aggressive' }),
        e('hero', 14, 19, 4, ['tomahawk'], { ai: 'aggressive' }),
        e('sage', 14, 3, 3, ['elfire'], { ai: 'guard' }),
        e('sage', 14, 18, 3, ['elfire'], { ai: 'guard' }),
        e('wyvernlord', 14, 7, 7, ['spear'], { ai: 'aggressive' }),
        e('wyvernlord', 14, 14, 7, ['silverlance'], { ai: 'aggressive' }),
        e('wyvernknight', 14, 10, 14, ['silverlance'], { ai: 'aggressive' }),
        e('wyvernknight', 14, 11, 14, ['tomahawk'], { ai: 'aggressive' }),
        e('falcoknight', 14, 4, 14, ['spear'], { ai: 'aggressive' }),
        e('falcoknight', 14, 17, 14, ['silverlance'], { ai: 'aggressive' }),
        e('warrior', 14, 8, 11, ['silveraxe'], { ai: 'guard' }),
        e('warrior', 14, 12, 11, ['killeraxe'], { ai: 'guard' }),
        e('rogue', 14, 10, 11, ['silversword'], { ai: 'guard' }),
        e('greatknight', 14, 3, 8, ['silverlance'], { ai: 'aggressive' }),
        e('greatknight', 14, 18, 8, ['silveraxe'], { ai: 'aggressive' }),
        e('sniper', 14, 10, 8, ['longbow'], { ai: 'guard' }),
        e('hero', 14, 5, 16, ['silversword'], { ai: 'aggressive' }),
        e('hero', 14, 16, 16, ['steelsword'], { ai: 'aggressive' }),
        e('paladin', 14, 2, 15, ['spear'], { ai: 'aggressive' }),
        e('paladin', 14, 19, 15, ['horseslayer'], { ai: 'aggressive' })
      ],
      boss: { key: 'veyn', x: 10, y: 1, ai: 'boss' },
      npcs: [],
      villages: [],
      chests: [
        { x: 9, y: 10, item: 'torch' },
        { x: 13, y: 10, item: 'purge' }
      ],
      doors: [],
      reinforcements: [
        { turn: 4, list: [
          e('wyvernknight', 14, 1, 13, ['silverlance'], { ai: 'aggressive' }),
          e('wyvernknight', 14, 20, 13, ['tomahawk'], { ai: 'aggressive' })
        ] },
        { turn: 8, list: [
          e('falcoknight', 15, 1, 6, ['spear'], { ai: 'aggressive' }),
          e('falcoknight', 15, 20, 7, ['silverlance'], { ai: 'aggressive' })
        ] },
        { turn: 12, list: [
          e('wyvernlord', 15, 1, 15, ['spear'], { ai: 'aggressive' }),
          e('wyvernlord', 15, 20, 15, ['silverlance'], { ai: 'aggressive' })
        ] }
      ],
      hardExtra: [
        e('sniper', 16, 9, 3, ['silverbow'], { ai: 'guard' }),
        e('druid', 15, 11, 4, ['fenrir'], { ai: 'guard' }),
        e('wyvernlord', 15, 7, 14, ['spear'], { ai: 'aggressive' }),
        e('general', 16, 10, 12, ['silverlance'], { ai: 'guard' })
      ]
    },

    /* ============================ CHAPTER 19 =========================== */
    {
      id: 'ch19',
      number: 19,
      name: 'The Hall of Consents',
      objective: 'boss',
      objectiveText: 'Defeat Lord Marshal Strade',
      fog: 0,
      /* A nave that narrows three times on the way to the dais, with siege in
         both aisles. You can walk the aisles and put the siege down, or eat it
         and go straight up. Both are real answers; the second is faster. */
      map: [
        '########################',
        '#######____TT____#######',
        '#_____#__________#_____#',
        '#_III_#_I______I_#_III_#',
        '#_____#__________#_____#',
        '#__C__##________##__C__#',
        '#______#________#______#',
        '#______#_I____I_#______#',
        '#______#________#______#',
        '#______##______##______#',
        '#_I_____#______#_____I_#',
        '#_______#______#_______#',
        '#_______##____##_______#',
        '#______________________#',
        '#__I____I____I____I____#',
        '#F____________________F#',
        '#______________________#',
        '########################'
      ],
      starts: [
        { x: 10, y: 16 }, { x: 11, y: 16 }, { x: 12, y: 16 }, { x: 13, y: 16 },
        { x: 9, y: 16 }, { x: 14, y: 16 }, { x: 10, y: 15 }, { x: 13, y: 15 },
        { x: 8, y: 16 }, { x: 15, y: 16 }, { x: 11, y: 15 }, { x: 12, y: 15 }
      ],
      forced: ['seren'],
      available: ['seren', 'dorn', 'mira', 'bram', 'rook', 'edran', 'nessa', 'cass', 'ilya', 'petra', 'garrick', 'corin', 'yrsa', 'odile', 'kell', 'sirin', 'talis', 'roswyn', 'thessaly', 'ivane'],
      slots: 12,
      enemies: [
        e('general', 16, 10, 1, ['spear'], { ai: 'guard' }),
        e('general', 16, 13, 1, ['silverlance'], { ai: 'guard' }),
        e('sniper', 16, 8, 2, ['silverbow'], { ai: 'guard' }),
        e('sniper', 16, 15, 2, ['killerbow'], { ai: 'guard' }),
        e('bishop', 16, 9, 2, ['divine', 'physic'], { ai: 'guard' }),
        e('swordmaster', 16, 9, 3, ['killingedge'], { ai: 'guard' }),
        e('swordmaster', 16, 15, 3, ['silversword'], { ai: 'guard' }),
        e('hero', 16, 9, 6, ['silversword'], { ai: 'guard' }),
        e('hero', 16, 14, 6, ['tomahawk'], { ai: 'guard' }),
        e('greatknight', 16, 9, 7, ['silverlance'], { ai: 'guard' }),
        e('greatknight', 16, 14, 7, ['silveraxe'], { ai: 'guard' }),
        e('general', 16, 10, 9, ['spear'], { ai: 'guard' }),
        e('general', 16, 13, 9, ['silverlance'], { ai: 'guard' }),
        e('warrior', 16, 10, 11, ['tomahawk'], { ai: 'aggressive' }),
        e('warrior', 16, 13, 11, ['silveraxe'], { ai: 'aggressive' }),
        e('wyvernlord', 16, 11, 12, ['spear'], { ai: 'aggressive' }),
        e('wyvernlord', 16, 12, 12, ['silverlance'], { ai: 'aggressive' }),
        e('bishop', 16, 3, 2, ['purge', 'divine'], { ai: 'guard' }),
        e('bishop', 16, 20, 2, ['divine', 'physic'], { ai: 'guard' }),
        e('druid', 16, 2, 10, ['bolting', 'fenrir'], { ai: 'guard' }),
        e('druid', 16, 21, 10, ['fenrir', 'flux'], { ai: 'guard' }),
        e('sniper', 16, 3, 3, ['longbow'], { ai: 'guard' }),
        e('assassin', 16, 2, 14, ['killingedge'], { ai: 'aggressive' }),
        e('assassin', 16, 21, 14, ['silversword'], { ai: 'aggressive' }),
        e('paladin', 16, 4, 13, ['spear'], { ai: 'aggressive' }),
        e('paladin', 16, 19, 13, ['horseslayer'], { ai: 'aggressive' })
      ],
      boss: { key: 'strade', x: 11, y: 1, ai: 'boss' },
      npcs: [],
      villages: [],
      chests: [
        { x: 3, y: 5, item: 'dawnmarch' },
        { x: 20, y: 5, item: 'goddessicon' }
      ],
      doors: [],
      reinforcements: [
        { turn: 4, list: [
          e('wyvernlord', 16, 1, 16, ['spear'], { ai: 'aggressive' }),
          e('wyvernlord', 16, 22, 16, ['silverlance'], { ai: 'aggressive' })
        ] },
        { turn: 8, list: [
          e('hero', 16, 1, 16, ['silversword'], { ai: 'aggressive' }),
          e('hero', 16, 22, 16, ['tomahawk'], { ai: 'aggressive' })
        ] },
        { turn: 12, list: [
          e('greatknight', 17, 1, 16, ['silveraxe'], { ai: 'aggressive' }),
          e('greatknight', 17, 22, 16, ['silverlance'], { ai: 'aggressive' })
        ] }
      ],
      hardExtra: [
        e('general', 18, 11, 2, ['silverlance'], { ai: 'guard' }),
        e('druid', 17, 12, 2, ['fenrir'], { ai: 'guard' }),
        e('sniper', 18, 11, 9, ['silverbow'], { ai: 'guard' }),
        e('wyvernlord', 17, 4, 5, ['spear'], { ai: 'aggressive' })
      ]
    },

    /* ============================ CHAPTER 20 =========================== */
    {
      id: 'ch20',
      number: 20,
      name: 'The Last Signature',
      objective: 'boss',
      objectiveText: 'Defeat Emperor Dravan',
      fog: 0,
      /* The throne room. You come up into it through two three-tile mouths, which
         is the whole reason the last chapter is survivable: in an open room
         fourteen aggressive promoted units reach the party on turn one and the
         fight is decided before it starts. Dravan does not die the first time:
         at zero he puts the crown on, and what stands up is a druid with a dark
         tome and more HP than he had. See FE.enterPhase2. */
      map: [
        '####################',
        '########_TT_########',
        '#_____##____##_____#',
        '#_III_#______#_III_#',
        '#_____#_I__I_#_____#',
        '#__C__#______#__C__#',
        '#_____#______#_____#',
        '#_____##____##_____#',
        '#__________________#',
        '#__I____I__I____I__#',
        '#__F____________F__#',
        '#____I________I____#',
        '####___######___####',
        '#______F____F______#',
        '#__________________#',
        '####################'
      ],
      starts: [
        { x: 5, y: 14 }, { x: 6, y: 14 }, { x: 7, y: 14 }, { x: 8, y: 14 },
        { x: 11, y: 14 }, { x: 12, y: 14 }, { x: 13, y: 14 }, { x: 14, y: 14 },
        { x: 5, y: 13 }, { x: 6, y: 13 }, { x: 13, y: 13 }, { x: 14, y: 13 }
      ],
      forced: ['seren'],
      available: ['seren', 'dorn', 'mira', 'bram', 'rook', 'edran', 'nessa', 'cass', 'ilya', 'petra', 'garrick', 'corin', 'yrsa', 'odile', 'kell', 'sirin', 'talis', 'roswyn', 'thessaly', 'ivane'],
      slots: 12,
      enemies: [
        e('general', 20, 8, 2, ['spear'], { ai: 'guard' }),
        e('general', 20, 11, 2, ['silverlance'], { ai: 'guard' }),
        e('sniper', 20, 8, 4, ['silverbow'], { ai: 'guard' }),
        e('sniper', 20, 11, 4, ['killerbow'], { ai: 'guard' }),
        e('bishop', 20, 9, 3, ['divine', 'physic'], { ai: 'guard' }),
        e('druid', 20, 10, 3, ['fenrir', 'nosferatu'], { ai: 'guard' }),
        e('swordmaster', 20, 8, 6, ['killingedge'], { ai: 'guard' }),
        e('swordmaster', 20, 11, 6, ['silversword'], { ai: 'guard' }),
        e('bishop', 20, 2, 6, ['purge', 'divine'], { ai: 'guard' }),
        e('bishop', 20, 17, 6, ['divine', 'physic'], { ai: 'guard' }),
        e('sage', 20, 3, 3, ['elfire', 'thunder'], { ai: 'guard' }),
        e('sage', 20, 16, 3, ['elfire', 'thunder'], { ai: 'guard' }),
        e('hero', 18, 2, 4, ['silversword'], { ai: 'aggressive' }),
        e('hero', 18, 17, 4, ['tomahawk'], { ai: 'aggressive' }),
        e('greatknight', 18, 8, 9, ['silveraxe'], { ai: 'aggressive' }),
        e('greatknight', 18, 11, 9, ['silverlance'], { ai: 'aggressive' }),
        e('general', 18, 9, 8, ['spear'], { ai: 'guard' }),
        e('general', 18, 10, 8, ['silverlance'], { ai: 'guard' }),
        e('wyvernlord', 18, 3, 10, ['spear'], { ai: 'aggressive' }),
        e('wyvernlord', 18, 16, 10, ['silverlance'], { ai: 'aggressive' }),
        e('assassin', 18, 6, 12, ['killingedge'], { ai: 'aggressive' })
      ],
      boss: { key: 'dravan', x: 9, y: 1, ai: 'boss' },
      npcs: [],
      villages: [],
      chests: [
        { x: 3, y: 5, item: 'elixir' },
        { x: 16, y: 5, item: 'dracoshield' }
      ],
      doors: [],
      /* the crown goes on: the same man, a second time, with company */
      phase2: {
        scene: 'ch20_crown',
        enemies: [
          e('druid', 20, 8, 2, ['fenrir'], { ai: 'aggressive' }),
          e('druid', 20, 11, 2, ['fenrir'], { ai: 'aggressive' })
        ]
      },
      reinforcements: [
        { turn: 4, list: [
          e('wyvernlord', 18, 1, 14, ['spear'], { ai: 'aggressive' }),
          e('wyvernlord', 18, 18, 14, ['silverlance'], { ai: 'aggressive' })
        ] },
        { turn: 8, list: [
          e('hero', 18, 1, 14, ['silversword'], { ai: 'aggressive' }),
          e('hero', 18, 18, 14, ['tomahawk'], { ai: 'aggressive' })
        ] }
      ],
      hardExtra: [
        e('general', 20, 9, 2, ['silverlance'], { ai: 'guard' }),
        e('druid', 20, 10, 2, ['fenrir'], { ai: 'guard' }),
        e('sniper', 20, 9, 9, ['silverbow'], { ai: 'guard' }),
        e('wyvernlord', 20, 7, 11, ['spear'], { ai: 'aggressive' })
      ]
    }
  ];

  FE.CHAPTERS = CH;

  /* parse a chapter map into a tile grid */
  FE.parseMap = function (rows) {
    var h = rows.length, w = rows[0].length, grid = [], y, x;
    for (y = 0; y < h; y++) {
      if (rows[y].length !== w) {
        throw new Error('map row ' + y + ' is ' + rows[y].length + ' wide, expected ' + w);
      }
      grid[y] = [];
      for (x = 0; x < w; x++) {
        var ch = rows[y][x];
        var key = LEGEND[ch];
        if (!key) throw new Error('unknown map char "' + ch + '" at ' + x + ',' + y);
        grid[y][x] = key;
      }
    }
    return { w: w, h: h, tiles: grid };
  };

})(window.FE = window.FE || {});
