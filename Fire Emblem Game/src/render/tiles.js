/* ------------------------------------------------------------------
   TILESET
   GBA colour depth, flat fills with hand-placed detail pixels.
   Each terrain bakes to a small set of variants, picked by position so
   a field of forest does not look like wallpaper.
------------------------------------------------------------------ */
(function (FE) {
  'use strict';

  var T = 16;                 /* tiles are authored at 16px and scaled up */
  var cache = {};

  function hash(x, y, salt) {
    var h = (x * 374761393 + y * 668265263 + (salt || 0) * 2246822519) >>> 0;
    h = (h ^ (h >>> 13)) * 1274126177 >>> 0;
    return (h ^ (h >>> 16)) >>> 0;
  }

  var PAL = {
    grass1: '#6aa04a', grass2: '#588a3e', grass3: '#7cb457',
    dirt1: '#b08a54', dirt2: '#977142',
    tree1: '#2f6b33', tree2: '#23522a', tree3: '#3d8440',
    rock1: '#8b8577', rock2: '#6d685d', rock3: '#a8a294',
    stone1: '#9aa0ae', stone2: '#767c8a', stone3: '#b6bcc9',
    wall1: '#5a5f6d', wall2: '#40444f',
    water1: '#3f74c0', water2: '#2f5a9c', water3: '#6699d8',
    wood1: '#8a5a32', wood2: '#6b4526', roof1: '#b2503c', roof2: '#8c3a2b',
    floor1: '#cfc5ab', floor2: '#b3a88e',
    gold1: '#d9b450', gold2: '#a98a35'
  };

  function px(g, x, y, c) { g.fillStyle = c; g.fillRect(x, y, 1, 1); }
  function rect(g, x, y, w, h, c) { g.fillStyle = c; g.fillRect(x, y, w, h); }

  /* speckle a tile deterministically */
  function speckle(g, x0, y0, w, h, colors, n, seed) {
    for (var i = 0; i < n; i++) {
      var hv = hash(i + 1, seed, i * 7 + 3);
      var sx = x0 + (hv % w);
      var sy = y0 + ((hv >>> 8) % h);
      px(g, sx, sy, colors[(hv >>> 16) % colors.length]);
    }
  }

  var PAINT = {
    plain: function (g, s) {
      rect(g, 0, 0, T, T, PAL.grass1);
      speckle(g, 0, 0, T, T, [PAL.grass2, PAL.grass3], 14, s);
    },
    road: function (g, s) {
      rect(g, 0, 0, T, T, PAL.dirt1);
      speckle(g, 0, 0, T, T, [PAL.dirt2], 10, s);
    },
    forest: function (g, s) {
      rect(g, 0, 0, T, T, PAL.grass2);
      speckle(g, 0, 0, T, T, [PAL.grass1], 8, s);
      /* two round canopies */
      rect(g, 2, 3, 6, 6, PAL.tree1); rect(g, 3, 2, 4, 8, PAL.tree1);
      rect(g, 3, 3, 3, 3, PAL.tree3);
      rect(g, 8, 6, 6, 6, PAL.tree2); rect(g, 9, 5, 4, 8, PAL.tree2);
      rect(g, 10, 6, 2, 2, PAL.tree1);
      rect(g, 4, 10, 2, 3, PAL.wood2);
      rect(g, 10, 12, 2, 2, PAL.wood2);
    },
    thicket: function (g, s) {
      PAINT.forest(g, s);
      rect(g, 0, 0, 5, 5, PAL.tree2);
      rect(g, 11, 1, 5, 5, PAL.tree1);
      speckle(g, 0, 0, T, T, [PAL.tree2, PAL.tree1], 20, s + 5);
    },
    hill: function (g, s) {
      rect(g, 0, 0, T, T, PAL.grass1);
      speckle(g, 0, 0, T, T, [PAL.grass3], 6, s);
      /* a rounded mound with a lit crest and a shadowed foot, so it reads as
         raised ground rather than a flat green square */
      rect(g, 1, 10, 14, 4, '#4a7534');
      rect(g, 2, 8, 12, 3, PAL.grass2);
      rect(g, 3, 6, 10, 3, PAL.grass2);
      rect(g, 5, 4, 6, 3, PAL.grass2);
      rect(g, 6, 3, 4, 2, PAL.grass3);
      rect(g, 5, 5, 5, 1, PAL.grass3);
      rect(g, 3, 7, 4, 1, PAL.grass3);
      rect(g, 1, 13, 14, 1, '#3d6029');
      px(g, 4, 11, PAL.tree2); px(g, 11, 9, PAL.tree2); px(g, 8, 12, PAL.tree2);
    },
    mountain: function (g, s) {
      rect(g, 0, 0, T, T, PAL.grass2);
      rect(g, 1, 8, 14, 7, PAL.rock2);
      rect(g, 3, 4, 10, 6, PAL.rock1);
      rect(g, 5, 2, 6, 4, PAL.rock1);
      rect(g, 6, 2, 3, 3, PAL.rock3);
      rect(g, 2, 9, 4, 3, PAL.rock3);
      speckle(g, 1, 4, 14, 10, [PAL.rock2], 8, s);
    },
    peak: function (g, s) {
      PAINT.mountain(g, s);
      rect(g, 6, 1, 4, 3, '#e8eef8');
      rect(g, 5, 3, 6, 2, '#cfd8e8');
    },
    fort: function (g, s) {
      rect(g, 0, 0, T, T, PAL.grass1);
      rect(g, 1, 3, 14, 11, PAL.stone2);
      rect(g, 2, 4, 12, 9, PAL.stone1);
      /* crenellations */
      rect(g, 1, 2, 2, 2, PAL.stone2); rect(g, 5, 2, 2, 2, PAL.stone2);
      rect(g, 9, 2, 2, 2, PAL.stone2); rect(g, 13, 2, 2, 2, PAL.stone2);
      rect(g, 6, 8, 4, 6, PAL.wall2);
      rect(g, 3, 5, 3, 2, PAL.stone3);
      speckle(g, 2, 4, 12, 9, [PAL.stone3], 6, s);
    },
    gate: function (g, s) {
      PAINT.fort(g, s);
      rect(g, 5, 6, 6, 8, PAL.wood2);
      rect(g, 6, 7, 4, 7, PAL.wood1);
      rect(g, 7, 10, 2, 1, PAL.gold1);
    },
    throne: function (g, s) {
      rect(g, 0, 0, T, T, PAL.floor2);
      rect(g, 1, 1, 14, 14, PAL.floor1);
      rect(g, 4, 2, 8, 11, '#7a2f4a');
      rect(g, 5, 3, 6, 4, '#a34a68');
      rect(g, 5, 8, 6, 5, '#8d3554');
      rect(g, 6, 3, 4, 2, PAL.gold1);
      rect(g, 3, 13, 10, 2, PAL.gold2);
    },
    village: function (g, s) {
      rect(g, 0, 0, T, T, PAL.grass1);
      speckle(g, 0, 0, T, T, [PAL.grass2], 8, s);
      rect(g, 2, 7, 12, 7, PAL.wood1);
      rect(g, 3, 8, 10, 5, PAL.wood2);
      rect(g, 1, 3, 14, 5, PAL.roof1);
      rect(g, 2, 4, 12, 3, PAL.roof2);
      rect(g, 6, 9, 4, 5, PAL.wood1);
      rect(g, 11, 1, 2, 3, PAL.stone2);
    },
    house: function (g, s) { PAINT.village(g, s); },
    ruin: function (g, s) {
      rect(g, 0, 0, T, T, PAL.grass2);
      rect(g, 2, 9, 12, 5, '#4a4038');
      rect(g, 3, 6, 4, 4, '#584c42');
      rect(g, 10, 7, 3, 3, '#584c42');
      speckle(g, 0, 0, T, T, ['#2c2622'], 14, s);
    },
    floor: function (g, s) {
      rect(g, 0, 0, T, T, PAL.floor1);
      rect(g, 0, 0, T, 1, PAL.floor2);
      rect(g, 0, 0, 1, T, PAL.floor2);
      rect(g, 8, 0, 1, T, PAL.floor2);
      rect(g, 0, 8, T, 1, PAL.floor2);
      speckle(g, 0, 0, T, T, [PAL.floor2], 5, s);
    },
    pillar: function (g, s) {
      PAINT.floor(g, s);
      rect(g, 5, 1, 6, 14, PAL.stone1);
      rect(g, 4, 1, 8, 2, PAL.stone3);
      rect(g, 4, 13, 8, 2, PAL.stone2);
      rect(g, 6, 3, 1, 10, PAL.stone3);
    },
    wall: function (g, s) {
      rect(g, 0, 0, T, T, PAL.wall2);
      rect(g, 1, 1, 6, 6, PAL.wall1);
      rect(g, 9, 1, 6, 6, PAL.wall1);
      rect(g, 1, 9, 6, 6, PAL.wall1);
      rect(g, 9, 9, 6, 6, PAL.wall1);
    },
    cliff: function (g, s) {
      rect(g, 0, 0, T, T, PAL.rock2);
      rect(g, 0, 0, T, 4, PAL.rock1);
      speckle(g, 0, 0, T, T, [PAL.rock3, '#514d45'], 18, s);
    },
    water: function (g, s) {
      rect(g, 0, 0, T, T, PAL.water1);
      rect(g, 0, 0, T, 5, PAL.water2);
      rect(g, 2, 6, 5, 1, PAL.water3);
      rect(g, 9, 10, 5, 1, PAL.water3);
      rect(g, 4, 13, 4, 1, PAL.water3);
      speckle(g, 0, 0, T, T, [PAL.water2], 6, s);
    },
    river: function (g, s) {
      PAINT.water(g, s);
      rect(g, 0, 0, T, 2, PAL.grass2);
      rect(g, 0, 14, T, 2, PAL.grass2);
    },
    bridge: function (g, s) {
      PAINT.water(g, s);
      rect(g, 0, 3, T, 10, PAL.wood2);
      rect(g, 0, 4, T, 8, PAL.wood1);
      for (var i = 0; i < 4; i++) rect(g, i * 4 + 1, 4, 1, 8, PAL.wood2);
      rect(g, 0, 3, T, 1, '#4a301c');
      rect(g, 0, 12, T, 1, '#4a301c');
    },
    door: function (g, s) {
      rect(g, 0, 0, T, T, PAL.wall2);
      rect(g, 2, 1, 12, 14, PAL.wood2);
      rect(g, 3, 2, 10, 12, PAL.wood1);
      rect(g, 3, 7, 10, 1, PAL.wood2);
      rect(g, 10, 8, 2, 2, PAL.gold1);
    },
    chest: function (g, s) {
      PAINT.floor(g, s);
      rect(g, 2, 5, 12, 9, PAL.wood2);
      rect(g, 3, 6, 10, 7, PAL.wood1);
      rect(g, 2, 5, 12, 2, PAL.gold2);
      rect(g, 7, 8, 2, 3, PAL.gold1);
      rect(g, 3, 4, 10, 2, PAL.wood2);
    },
    armory: function (g, s) {
      PAINT.village(g, s);
      rect(g, 6, 9, 1, 5, PAL.stone3);
      rect(g, 5, 10, 3, 1, PAL.stone1);
    },
    vendor: function (g, s) {
      PAINT.village(g, s);
      rect(g, 1, 3, 14, 5, '#3f63d0');
      rect(g, 2, 4, 12, 3, '#22366f');
    },
    arena: function (g, s) {
      rect(g, 0, 0, T, T, PAL.dirt1);
      rect(g, 1, 1, 14, 14, PAL.stone2);
      rect(g, 3, 3, 10, 10, PAL.dirt1);
      rect(g, 4, 4, 8, 8, PAL.dirt2);
      rect(g, 6, 6, 4, 4, PAL.gold2);
    }
  };

  /* one baked tile canvas */
  FE.tileCanvas = function (key, x, y, scale) {
    var variant = hash(x, y, 11) % 3;
    var id = key + '|' + variant + '|' + scale;
    if (cache[id]) return cache[id];

    var cv = document.createElement('canvas');
    cv.width = T; cv.height = T;
    var g = cv.getContext('2d');
    g.imageSmoothingEnabled = false;
    var fn = PAINT[key] || PAINT.plain;
    fn(g, variant * 37 + 1);

    if (scale === 1) { cache[id] = cv; return cv; }

    var out = document.createElement('canvas');
    out.width = T * scale; out.height = T * scale;
    var g2 = out.getContext('2d');
    g2.imageSmoothingEnabled = false;
    g2.drawImage(cv, 0, 0, T * scale, T * scale);
    cache[id] = out;
    return out;
  };

  FE.TILE_SRC = T;
  FE.clearTileCache = function () { cache = {}; };
  FE.TILE_PAL = PAL;

})(window.FE = window.FE || {});
