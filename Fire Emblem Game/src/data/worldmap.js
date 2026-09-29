/* ------------------------------------------------------------------
   THE WORLD MAP
   Sacred Stones' overworld: between chapters you stand on a map of the
   marches, walk to the next chapter when you want to, and in the
   meantime revisit a shop or pick a fight you were not ordered into.

   Nodes are placed in normalised 0..1 coordinates so the map scales to
   whatever pane it is drawn in. Skirmishes and Spire floors are built
   on demand against the party's own level, so they stay worth fighting
   without ever being worth farming — see FE.skirmishFor.
------------------------------------------------------------------ */
(function (FE) {
  'use strict';

  /* Two regions. Twenty chapters will not fit on one pane without the labels
     climbing over each other, and the campaign crosses a border anyway: the
     marches are the road east, Varn is what is on the other side of the pass.
     Everything is normalised 0..1 within its own region. */
  var REGIONS = [
    { id: 'marches', name: 'The Marches', after: 0 },
    { id: 'varn',    name: 'Varn',       after: 12 },
    { id: 'citadel', name: 'The Iron Citadel', after: 16 }
  ];

  var NODES = [
    /* ---- the marches ---- */
    { id: 'ch1',  region: 'marches', kind: 'chapter', index: 0,  x: 0.07, y: 0.80, name: 'Greywater' },
    { id: 'ch2',  region: 'marches', kind: 'chapter', index: 1,  x: 0.17, y: 0.70, name: 'Ardwyn Crossing' },
    { id: 'ch3',  region: 'marches', kind: 'chapter', index: 2,  x: 0.24, y: 0.55, name: 'Ashmoor' },
    { id: 'ch4',  region: 'marches', kind: 'chapter', index: 3,  x: 0.33, y: 0.40, name: 'The Ashfold' },
    { id: 'ch5',  region: 'marches', kind: 'chapter', index: 4,  x: 0.40, y: 0.60, name: 'Salt Marsh' },
    { id: 'ch6',  region: 'marches', kind: 'chapter', index: 5,  x: 0.49, y: 0.45, name: "Thane's Gate" },
    { id: 'ch7',  region: 'marches', kind: 'chapter', index: 6,  x: 0.57, y: 0.72, name: 'Gallows Harbour' },
    { id: 'ch8',  region: 'marches', kind: 'chapter', index: 7,  x: 0.63, y: 0.52, name: 'Kestrel Rise' },
    { id: 'ch9',  region: 'marches', kind: 'chapter', index: 8,  x: 0.70, y: 0.34, name: 'The Grain Road' },
    { id: 'ch10', region: 'marches', kind: 'chapter', index: 9,  x: 0.78, y: 0.52, name: 'Cinderwatch' },
    { id: 'ch11', region: 'marches', kind: 'chapter', index: 10, x: 0.85, y: 0.36, name: 'Ember Cloister' },
    { id: 'ch12', region: 'marches', kind: 'chapter', index: 11, x: 0.90, y: 0.62, name: 'Kestrel Gate' },

    { id: 'shop', region: 'marches', kind: 'shop', x: 0.30, y: 0.82, name: 'Marchside Fair',
      after: 1, blurb: 'A travelling fair that follows the army at a safe distance. Its stock improves as the campaign does.' },
    { id: 'spire', region: 'marches', kind: 'spire', x: 0.12, y: 0.42, name: 'The Hollow Spire',
      after: 2, blurb: 'Eight floors of whatever the old war left standing. It does not get easier.' },

    /* ---- Varn, on the other side of the pass ---- */
    { id: 'ch13', region: 'varn', kind: 'chapter', index: 12, x: 0.12, y: 0.72, name: 'The North Road' },
    { id: 'ch14', region: 'varn', kind: 'chapter', index: 13, x: 0.30, y: 0.54, name: "Solk's Line" },
    { id: 'ch15', region: 'varn', kind: 'chapter', index: 14, x: 0.52, y: 0.36, name: 'The Outer Wards' },
    { id: 'ch16', region: 'varn', kind: 'chapter', index: 15, x: 0.70, y: 0.22, name: 'The Forge' },

    { id: 'shop2', region: 'varn', kind: 'shop', x: 0.26, y: 0.80, name: 'The Camp Followers',
      after: 12, blurb: 'Everything an army leaves behind, sold back to it at a markup.' },

    /* ---- inside the citadel: there is no more countryside after this ---- */
    { id: 'ch17', region: 'citadel', kind: 'chapter', index: 16, x: 0.18, y: 0.74, name: 'The Sealed Level' },
    { id: 'ch18', region: 'citadel', kind: 'chapter', index: 17, x: 0.38, y: 0.56, name: 'The Water Stair' },
    { id: 'ch19', region: 'citadel', kind: 'chapter', index: 18, x: 0.60, y: 0.36, name: 'Hall of Consents' },
    { id: 'ch20', region: 'citadel', kind: 'chapter', index: 19, x: 0.82, y: 0.18, name: 'The Last Signature' },

    { id: 'shop3', region: 'citadel', kind: 'shop', x: 0.14, y: 0.42, name: 'The Under-Market',
      after: 16, blurb: 'Half the citadel\u2019s servants have something to sell and nowhere left to spend it.' }
  ];

  var ROADS = [
    ['ch1', 'ch2'], ['ch2', 'ch3'], ['ch3', 'ch4'], ['ch4', 'ch5'],
    ['ch5', 'ch6'], ['ch6', 'ch7'], ['ch7', 'ch8'], ['ch8', 'ch9'],
    ['ch9', 'ch10'], ['ch10', 'ch11'], ['ch11', 'ch12'],
    ['ch2', 'shop'], ['ch5', 'shop'], ['ch3', 'spire'],
    ['ch13', 'ch14'], ['ch14', 'ch15'], ['ch15', 'ch16'], ['ch13', 'shop2'],
    ['ch17', 'ch18'], ['ch18', 'ch19'], ['ch19', 'ch20'], ['ch17', 'shop3']
  ];

  /* Skirmish sites sit on ground you have already crossed, one per chapter. */
  var SKIRMISH_SITES = [
    { id: 'sk_greywater', region: 'marches', after: 1,  x: 0.08, y: 0.92, name: 'Greywater Fields', terrain: 'field' },
    { id: 'sk_ardwyn',    region: 'marches', after: 2,  x: 0.26, y: 0.90, name: 'Ardwyn Fords',     terrain: 'river' },
    { id: 'sk_ashmoor',   region: 'marches', after: 3,  x: 0.13, y: 0.58, name: 'Ashmoor Waste',    terrain: 'moor' },
    { id: 'sk_ashfold',   region: 'marches', after: 4,  x: 0.30, y: 0.26, name: 'Ashfold Hills',    terrain: 'hills' },
    { id: 'sk_marsh',     region: 'marches', after: 5,  x: 0.44, y: 0.76, name: 'Saltings',         terrain: 'marsh' },
    { id: 'sk_thane',     region: 'marches', after: 6,  x: 0.53, y: 0.28, name: 'Thane Road',       terrain: 'field' },
    { id: 'sk_harbour',   region: 'marches', after: 7,  x: 0.66, y: 0.86, name: 'Gallows Sands',    terrain: 'marsh' },
    { id: 'sk_kestrel',   region: 'marches', after: 8,  x: 0.72, y: 0.18, name: 'Kestrel Scarp',    terrain: 'hills' },
    { id: 'sk_grain',     region: 'marches', after: 9,  x: 0.88, y: 0.18, name: 'Granary Flats',    terrain: 'field' },
    { id: 'sk_cinder',    region: 'marches', after: 10, x: 0.72, y: 0.66, name: 'Cinder Barrens',   terrain: 'moor' },
    { id: 'sk_ember',     region: 'marches', after: 11, x: 0.93, y: 0.74, name: 'Ember Terraces',   terrain: 'hills' },
    { id: 'sk_pass',      region: 'marches', after: 12, x: 0.60, y: 0.10, name: 'The High Pass',    terrain: 'moor' },

    { id: 'sk_north',     region: 'varn', after: 13, x: 0.16, y: 0.42, name: 'North Road Levies',  terrain: 'field' },
    { id: 'sk_line',      region: 'varn', after: 14, x: 0.46, y: 0.78, name: 'Solk\u2019s Fords',      terrain: 'river' },
    { id: 'sk_wards',     region: 'varn', after: 15, x: 0.62, y: 0.60, name: 'Ward Alleys',        terrain: 'field' },
    { id: 'sk_forge',     region: 'varn', after: 16, x: 0.84, y: 0.44, name: 'Forge Yards',        terrain: 'moor' },

    { id: 'sk_forgehall', region: 'citadel', after: 17, x: 0.42, y: 0.84, name: 'Forge Hall',        terrain: 'hall' },
    { id: 'sk_cisterns',  region: 'citadel', after: 18, x: 0.66, y: 0.66, name: 'The Cisterns',      terrain: 'river' },
    { id: 'sk_galleries', region: 'citadel', after: 19, x: 0.86, y: 0.46, name: 'Upper Galleries',   terrain: 'hall' }
  ];

  /* ---------------- skirmish ground ---------------- */

  /* 14x10 arenas, one per terrain flavour. Small on purpose: a skirmish is a
     fight, not a chapter, and it should cost ten minutes rather than forty. */
  var GROUND = {
    field: [
      '..f........f..',
      '.....hh.......',
      '..............',
      '....f.....ff..',
      '..............',
      '..hh......f...',
      '..............',
      '.f.......hh...',
      '..............',
      '..f....ff.....'
    ],
    river: [
      '..............',
      '...ff.....f...',
      '..............',
      '~~~~~==~~~~~~~',
      '~~~~~==~~~~~~~',
      '..............',
      '...f......ff..',
      '..............',
      '..hh..........',
      '.....f........'
    ],
    moor: [
      'mm..........mm',
      'm......^.....m',
      '.....hhh......',
      '......h.......',
      '..............',
      '...f......f...',
      '..............',
      '....hh...hh...',
      '..............',
      'mm..........mm'
    ],
    hills: [
      '.hh........hh.',
      'hhh.........hh',
      '.h....ff....h.',
      '......hh......',
      '..f........f..',
      '.....hhh......',
      '..hh.....hh...',
      '..............',
      '.f..........f.',
      '..h........h..'
    ],
    marsh: [
      '..t........t..',
      '.tt..~~~~..tt.',
      '....~~~~~~....',
      '...~~~~~~~~...',
      '..............',
      '..tt......tt..',
      '...~~~..~~~...',
      '..............',
      '..............',
      '..t........t..'
    ],
    /* citadel interiors: colonnades, so there is cover but nowhere to hide */
    hall: [
      '##############',
      '#____________#',
      '#_I__I__I__I_#',
      '#____________#',
      '#__##____##__#',
      '#__##____##__#',
      '#____________#',
      '#_I__I__I__I_#',
      '#____________#',
      '##############'
    ],
    /* the Spire: one room per floor, no cover, no escape */
    spire: [
      '##############',
      '#____________#',
      '#__I______I__#',
      '#____________#',
      '#____________#',
      '#____________#',
      '#__I______I__#',
      '#____________#',
      '#____________#',
      '##############'
    ]
  };

  var STARTS = [
    { x: 5, y: 8 }, { x: 6, y: 8 }, { x: 7, y: 8 }, { x: 8, y: 8 },
    { x: 4, y: 8 }, { x: 9, y: 8 }, { x: 5, y: 7 }, { x: 6, y: 7 },
    { x: 7, y: 7 }, { x: 8, y: 7 }, { x: 3, y: 8 }, { x: 10, y: 8 }
  ];
  /* the Spire's walls eat the outer column, so it gets its own set */
  var SPIRE_STARTS = [
    { x: 5, y: 8 }, { x: 6, y: 8 }, { x: 7, y: 8 }, { x: 8, y: 8 },
    { x: 4, y: 8 }, { x: 9, y: 8 }, { x: 5, y: 7 }, { x: 6, y: 7 },
    { x: 7, y: 7 }, { x: 8, y: 7 }, { x: 3, y: 8 }, { x: 10, y: 8 }
  ];

  /* enemy spots, ordered so a small band spreads out rather than stacking */
  var SPOTS = [
    { x: 6, y: 1 }, { x: 8, y: 1 }, { x: 4, y: 2 }, { x: 10, y: 2 },
    { x: 2, y: 3 }, { x: 11, y: 3 }, { x: 7, y: 2 }, { x: 5, y: 1 },
    { x: 9, y: 3 }, { x: 3, y: 1 }, { x: 12, y: 4 }, { x: 1, y: 4 }
  ];

  /* Promoted opposition, for when the party itself is promoted. Without this
     a level-22-effective army (fresh promotions) met level-8 conscripts,
     because the scaling read "past 20" as "eight levels into the next tier"
     and then built unpromoted units at that number. */
  var PROMOTED_BANDS = [
    { cls: 'paladin',     wep: ['steellance', 'silverlance', 'silverlance'] },
    { cls: 'general',     wep: ['steellance', 'silverlance', 'silverlance'] },
    { cls: 'greatknight', wep: ['steelaxe', 'silveraxe', 'silveraxe'] },
    { cls: 'hero',        wep: ['steelsword', 'silversword', 'silversword'] },
    { cls: 'warrior',     wep: ['steelaxe', 'silveraxe', 'killeraxe'] },
    { cls: 'sniper',      wep: ['steelbow', 'silverbow', 'killerbow'] },
    { cls: 'swordmaster', wep: ['steelsword', 'killingedge', 'silversword'] },
    { cls: 'sage',        wep: ['elfire', 'elfire', 'divine'] },
    { cls: 'druid',       wep: ['flux', 'luna', 'luna'] },
    { cls: 'wyvernlord',  wep: ['steellance', 'silverlance', 'silverlance'] }
  ];

  /* what shows up, by how far into the campaign you are */
  var BANDS = [
    { cls: 'brigand',   wep: ['ironaxe', 'steelaxe', 'silveraxe'] },
    { cls: 'soldier',   wep: ['ironlance', 'steellance', 'silverlance'] },
    { cls: 'mercenary', wep: ['ironsword', 'steelsword', 'silversword'] },
    { cls: 'archer',    wep: ['ironbow', 'steelbow', 'silverbow'] },
    { cls: 'myrmidon',  wep: ['ironsword', 'steelsword', 'killingedge'] },
    { cls: 'mage',      wep: ['fire', 'thunder', 'elfire'] },
    { cls: 'knight',    wep: ['ironlance', 'steellance', 'silverlance'] },
    { cls: 'shaman',    wep: ['flux', 'flux', 'luna'] },
    { cls: 'cavalier',  wep: ['ironlance', 'steellance', 'silverlance'] },
    { cls: 'fighter',   wep: ['ironaxe', 'steelaxe', 'killeraxe'] },
    { cls: 'wyvernrider', wep: ['ironlance', 'steellance', 'silverlance'] },
    { cls: 'pirate',    wep: ['ironaxe', 'steelaxe', 'silveraxe'] }
  ];

  /* the average level of the units you would actually field */
  FE.partyLevel = function (campaign) {
    var ids = Object.keys(campaign.roster);
    if (!ids.length) return 1;
    var lv = ids.map(function (id) {
      var u = campaign.roster[id];
      /* a unit cannot really be past the cap; clamp so a stray level never
         makes an unpromoted party look promoted */
      return Math.min(u.level, FE.LEVEL_CAP) + (FE.CLASSES[u.cls].tier === 1 ? FE.LEVEL_CAP : 0);
    }).sort(function (a, b) { return b - a; });
    /* the top half, because that is who gets deployed */
    var take = Math.max(1, Math.ceil(lv.length / 2));
    var sum = 0;
    for (var i = 0; i < take; i++) sum += lv[i];
    return Math.round(sum / take);
  };

  function pick(rng, arr) { return arr[rng.int(arr.length)]; }

  /* Power runs 1..40 on a single scale, where 21 is a freshly promoted unit.
     Above 20 the field promotes with you rather than staying unpromoted and
     irrelevant; below it, it does not. */
  function fieldFor(power, cleared, rng, count, tier, pool) {
    var promotedField = power > 20;
    var lvl = promotedField ? Math.min(FE.LEVEL_CAP, power - 20) : Math.min(FE.LEVEL_CAP, power);
    var bands = promotedField ? PROMOTED_BANDS : pool;
    return { promoted: promotedField, level: Math.max(1, lvl), bands: bands };
  }

  /* Put a unit down somewhere its class can actually stand. The spot list is
     the same for every terrain, so on the river and the saltings half of it is
     open water: without this, a knight spawns in a ford and the battle starts
     with a unit that cannot move. Spirals out from the intended tile. */
  function placeOn(grid, taken, cls, spot) {
    var mt = FE.CLASSES[cls].moveType;
    var h = grid.length, w = grid[0].length;
    function fits(x, y) {
      if (x < 0 || y < 0 || x >= w || y >= h) return false;
      if (taken[x + ',' + y]) return false;
      var key = FE.LEGEND[grid[y][x]];
      return key && FE.moveCost(key, mt) < FE.IMPASSABLE;
    }
    if (fits(spot.x, spot.y)) return { x: spot.x, y: spot.y };
    for (var r = 1; r <= Math.max(w, h); r++) {
      for (var dy = -r; dy <= r; dy++) {
        for (var dx = -r; dx <= r; dx++) {
          if (Math.max(Math.abs(dx), Math.abs(dy)) !== r) continue;
          /* stay in the enemy half: a relocated unit should not appear behind you */
          if (spot.y + dy > Math.floor(h / 2)) continue;
          if (fits(spot.x + dx, spot.y + dy)) return { x: spot.x + dx, y: spot.y + dy };
        }
      }
    }
    return null;
  }

  /* Build a battle that is worth the walk. Level tracks the party, count tracks
     how far in you are, and the reward is gold rather than treasure so a
     skirmish can never hand you something the campaign was saving. */
  FE.skirmishFor = function (campaign, site, seed) {
    var rng = new FE.Rng((seed || 1) >>> 0);
    var power = FE.partyLevel(campaign);
    var cleared = campaign.chapterIndex;
    var count = Math.min(SPOTS.length, 5 + Math.floor(cleared / 2));
    var tier = cleared >= 10 ? 2 : (cleared >= 4 ? 1 : 0);

    var ground = GROUND[site.terrain] || GROUND.field;
    var field = fieldFor(power, cleared, rng, count, tier,
      BANDS.slice(0, Math.min(BANDS.length, 4 + cleared)));
    var enemies = [];
    var taken = {};
    for (var i = 0; i < count; i++) {
      var band = pick(rng, field.bands);
      var at = placeOn(ground, taken, band.cls, SPOTS[i]);
      if (!at) continue;
      taken[at.x + ',' + at.y] = 1;
      var level = Math.max(1, Math.min(FE.LEVEL_CAP, field.level + rng.int(3) - 1));
      enemies.push({
        cls: band.cls, level: level, x: at.x, y: at.y,
        items: [band.wep[Math.min(tier, band.wep.length - 1)]],
        ai: 'aggressive'
      });
    }
    return {
      id: 'skirmish:' + site.id,
      number: 0,
      skirmish: true,
      name: site.name,
      objective: 'rout',
      objectiveText: 'Clear the field',
      fog: 0,
      map: ground,
      starts: STARTS,
      forced: [],
      available: Object.keys(campaign.roster),
      slots: Math.min(8, Object.keys(campaign.roster).length),
      enemies: enemies,
      boss: null,
      npcs: [], villages: [], chests: [], doors: [],
      reinforcements: [], hardExtra: [],
      /* a purse, not a prize: skirmishes never drop campaign treasure */
      purse: 200 + cleared * 120 + count * 40
    };
  };

  /* ---------------- the Spire ---------------- */

  FE.SPIRE_FLOORS = 8;

  /* Floor N is a fixed step above the party rather than a scaled copy of it, so
     climbing is a real decision: the top floors will kill an underlevelled army
     however many times it has walked the bottom one. */
  FE.spireFloor = function (campaign, floor, seed) {
    var rng = new FE.Rng(((seed || 1) ^ (floor * 7919)) >>> 0);
    var power = FE.partyLevel(campaign) + floor;
    var count = Math.min(SPOTS.length, 4 + floor);
    var tier = floor >= 6 ? 2 : (floor >= 3 ? 1 : 0);

    var field = fieldFor(power, campaign.chapterIndex, rng, count, tier,
      BANDS.slice(0, Math.min(BANDS.length, 5 + floor)));
    var enemies = [];
    var taken = {};
    for (var i = 0; i < count; i++) {
      var band = pick(rng, field.bands);
      var at = placeOn(GROUND.spire, taken, band.cls, SPOTS[i]);
      if (!at) continue;
      taken[at.x + ',' + at.y] = 1;
      enemies.push({
        cls: band.cls, level: Math.max(1, Math.min(FE.LEVEL_CAP, field.level + rng.int(2))),
        x: at.x, y: at.y,
        items: [band.wep[Math.min(tier, band.wep.length - 1)]],
        ai: 'aggressive'
      });
    }

    return {
      id: 'spire:' + floor,
      number: 0,
      skirmish: true,
      spire: floor,
      name: 'The Hollow Spire — Floor ' + floor,
      objective: 'rout',
      objectiveText: 'Clear the floor',
      fog: 0,
      map: GROUND.spire,
      starts: SPIRE_STARTS,
      forced: [],
      available: Object.keys(campaign.roster),
      slots: Math.min(8, Object.keys(campaign.roster).length),
      enemies: enemies,
      boss: null,
      npcs: [], villages: [], chests: [], doors: [],
      reinforcements: [], hardExtra: [],
      purse: 300 + floor * 250
    };
  };

  FE.WORLD_REGIONS = REGIONS;
  FE.WORLD_NODES = NODES;
  FE.WORLD_ROADS = ROADS;
  FE.SKIRMISH_SITES = SKIRMISH_SITES;
  FE.WORLD_GROUND = GROUND;

})(window.FE = window.FE || {});
