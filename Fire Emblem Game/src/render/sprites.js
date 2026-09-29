/* ------------------------------------------------------------------
   GBA-STYLE MAP SPRITES
   16x16 palette-indexed pixel grids, composited from a body silhouette
   plus a weapon overlay, then baked per faction palette into canvases.
     0/.  transparent      1 outline       2 skin      3 skin shadow
     4 faction primary     5 faction dark  6 metal     7 metal dark
     8 hair               9 highlight
------------------------------------------------------------------ */
(function (FE) {
  'use strict';

  var S = 16;

  /* pad every row to exactly 16 characters */
  function grid(rows) {
    var out = [];
    for (var y = 0; y < S; y++) {
      var r = rows[y] || '';
      if (r.length < S) r = r + new Array(S - r.length + 1).join('.');
      out.push(r.substring(0, S));
    }
    return out;
  }

  /* ---------------- bodies ---------------- */

  var BODY = {
    foot: grid([
      '................',
      '.....111111.....',
      '....18888881....',
      '...1822222281...',
      '...1821221281...',
      '...1822222281...',
      '....18222281....',
      '....14444441....',
      '...1444444441...',
      '...1444554441...',
      '...1444554441...',
      '....14444441....',
      '....1771771.....',
      '....1771771.....',
      '....1771771.....',
      '.....11111......'
    ]),

    robed: grid([
      '................',
      '.....111111.....',
      '....14444441....',
      '...1442222441...',
      '...1441221441...',
      '...1442222441...',
      '....14422441....',
      '....14444441....',
      '...1444444441...',
      '...1449444941...',
      '..144444444441..',
      '..144444444441..',
      '.14444444444441.',
      '.14444444444441.',
      '.11111111111111.',
      '................'
    ]),

    armored: grid([
      '................',
      '....11111111....',
      '...1666666661...',
      '...1661111661...',
      '...1666666661...',
      '....16666661....',
      '..144444444441..',
      '..146444444641..',
      '..144444444441..',
      '..147744447741..',
      '..144444444441..',
      '...1444444441...',
      '....16611661....',
      '....16611661....',
      '....17711771....',
      '....11111111....'
    ]),

    mounted: grid([
      '................',
      '......111111....',
      '.....18888881...',
      '.....18222281...',
      '.....18212281...',
      '.....18222281...',
      '....144444441...',
      '....144444441...',
      '..15555555551...',
      '.1555555555551..',
      '.1555555555551..',
      '..15551.15551...',
      '..1551...1551...',
      '..1551...1551...',
      '..1771...1771...',
      '..1111...1111...'
    ]),

    flying: grid([
      '................',
      '......111111....',
      '.....18888881...',
      '.....18222281...',
      '.....18212281...',
      '.....18222281...',
      '....144444441...',
      '1991........1991',
      '.199.555555.991.',
      '..1.15555551.1..',
      '...1555555551...',
      '...15551.15551..',
      '...1551...1551..',
      '...1551...1551..',
      '...1771...1771..',
      '...1111...1111..'
    ])
  };

  /* ---------------- weapon overlays ---------------- */

  var WEAP = {
    /* a clear diagonal blade off the right shoulder */
    sword: grid([
      '',
      '...............9',
      '..............99',
      '.............99.',
      '............99..',
      '...........99...',
      '..........1991..',
      '...........17...',
      '...........17...'
    ]),
    /* long shaft with a bright head, reads at a glance next to a sword */
    lance: grid([
      '.............9..',
      '............999.',
      '.............9..',
      '.............7..',
      '.............7..',
      '.............7..',
      '.............7..',
      '.............7..',
      '.............7..',
      '.............7..',
      '.............7..',
      '.............7..'
    ]),
    /* heavy bit at the top, unmistakably not a sword */
    axe: grid([
      '',
      '..........1999..',
      '.........19999..',
      '.........19999..',
      '..........1999..',
      '...........17...',
      '...........17...',
      '...........17...',
      '...........17...',
      '...........17...'
    ]),
    bow: grid([
      '', '',
      '..........199...',
      '.........19.9...',
      '.........9..9...',
      '.........9..9...',
      '.........9..9...',
      '.........19.9...',
      '..........199...'
    ]),
    /* an open book carried at the waist */
    tome: grid([
      '', '', '', '', '', '', '', '',
      '.........19991..',
      '.........19191..',
      '.........19991..',
      '.........11111..'
    ]),
    /* orb on a rod */
    staff: grid([
      '...........9....',
      '..........999...',
      '.........99999..',
      '..........999...',
      '...........9....',
      '...........7....',
      '...........7....',
      '...........7....',
      '...........7....',
      '...........7....',
      '...........7....'
    ]),
    none: grid([])
  };

  /* class-specific silhouette accents, drawn under the weapon */
  var ACCENT = {
    /* the lord wears a cape so she is findable in a crowd */
    lord: grid([
      '', '', '', '', '', '',
      '...5............',
      '..55............',
      '..555...........',
      '..555...........',
      '..555...........',
      '...55...........'
    ]),
    greatlord: grid([
      '', '', '', '', '',
      '...5............',
      '..55............',
      '..555...........',
      '.5555...........',
      '.5555...........',
      '.5555...........',
      '..555...........'
    ]),
    /* armour classes carry a shield on the near arm */
    knight: grid([
      '', '', '', '', '', '',
      '.166............',
      '.16661..........',
      '.16961..........',
      '.16661..........',
      '.1661...........',
      '..11............'
    ]),
    general: grid([
      '', '', '', '', '',
      '.1661...........',
      '.16661..........',
      '.169961.........',
      '.169961.........',
      '.16661..........',
      '.1661...........',
      '..11............'
    ])
  };

  /* ---------------- class -> body + weapon ---------------- */

  var LOOK = {
    lord: ['foot', 'sword'], greatlord: ['foot', 'sword'],
    mercenary: ['foot', 'sword'], hero: ['foot', 'sword'],
    myrmidon: ['foot', 'sword'], swordmaster: ['foot', 'sword'],
    assassin: ['foot', 'sword'], thief: ['foot', 'sword'], rogue: ['foot', 'sword'],
    fighter: ['foot', 'axe'], warrior: ['foot', 'axe'],
    brigand: ['foot', 'axe'], pirate: ['foot', 'axe'], bandit: ['foot', 'axe'],
    archer: ['foot', 'bow'], sniper: ['foot', 'bow'],
    soldier: ['foot', 'lance'],
    knight: ['armored', 'lance'], general: ['armored', 'lance'],
    cavalier: ['mounted', 'lance'], paladin: ['mounted', 'lance'],
    greatknight: ['mounted', 'axe'], ranger: ['mounted', 'bow'],
    troubadour: ['mounted', 'staff'], valkyrie: ['mounted', 'staff'],
    mageknight: ['mounted', 'tome'],
    pegasusknight: ['flying', 'lance'], falcoknight: ['flying', 'lance'],
    wyvernrider: ['flying', 'lance'], wyvernlord: ['flying', 'axe'],
    wyvernknight: ['flying', 'lance'],
    mage: ['robed', 'tome'], sage: ['robed', 'tome'],
    monk: ['robed', 'tome'], bishop: ['robed', 'staff'],
    shaman: ['robed', 'tome'], druid: ['robed', 'tome'], summoner: ['robed', 'tome'],
    cleric: ['robed', 'staff']
  };

  /* ---------------- palettes ---------------- */

  var BASE_PAL = {
    '1': '#191526', '2': '#f2c89a', '3': '#c0824e',
    '6': '#c6cede', '7': '#6d7587', '8': '#8c4a28', '9': '#fbfbff'
  };

  var FACTION_PAL = {
    player: { '4': '#3f63d0', '5': '#22366f' },
    enemy:  { '4': '#cc4038', '5': '#76221e' },
    ally:   { '4': '#35a049', '5': '#1c6129' },
    npc:    { '4': '#3aa8a0', '5': '#1d5f5b' },
    boss:   { '4': '#9b3fb8', '5': '#561e69' }
  };

  /* The mount is palette slot 5, which is the faction's dark shade by default —
     a blue horse under a blue rider is one silhouette. Tint the animal per
     class instead so mounted units read as mounted at a glance. */
  var MOUNT_TINT = {
    cavalier:      { '5': '#8a5f36' },
    paladin:       { '5': '#9c6d3e' },
    greatknight:   { '5': '#6f5430' },
    ranger:        { '5': '#7e5732' },
    troubadour:    { '5': '#b08a5c' },
    valkyrie:      { '5': '#c29a68' },
    mageknight:    { '5': '#8a6a46' },
    pegasusknight: { '5': '#dfe4f2' },
    falcoknight:   { '5': '#eef1fb' },
    wyvernrider:   { '5': '#4a6b32' },
    wyvernlord:    { '5': '#3c5a26' },
    wyvernknight:  { '5': '#4a6b32' }
  };

  var cache = {};

  function paletteFor(clsKey, faction) {
    var p = {};
    for (var k in BASE_PAL) p[k] = BASE_PAL[k];
    var f = FACTION_PAL[faction] || FACTION_PAL.player;
    for (var k2 in f) p[k2] = f[k2];
    if (MOUNT_TINT[clsKey]) for (var k3 in MOUNT_TINT[clsKey]) p[k3] = MOUNT_TINT[clsKey][k3];
    return p;
  }

  function composite(clsKey) {
    var look = LOOK[clsKey] || ['foot', 'sword'];
    var body = BODY[look[0]] || BODY.foot;
    var weap = WEAP[look[1]] || WEAP.none;
    var acc = ACCENT[clsKey] || null;
    var out = [];
    for (var y = 0; y < S; y++) {
      var row = '';
      for (var x = 0; x < S; x++) {
        var w = weap[y][x];
        if (w !== '.' && w !== undefined) { row += w; continue; }
        var b = body[y][x];
        if (b !== '.' && b !== undefined) { row += b; continue; }
        var a = acc ? acc[y][x] : '.';
        row += (a !== '.' && a !== undefined) ? a : '.';
      }
      out.push(row);
    }
    return out;
  }

  /* bake one sprite into a canvas, scaled, with an optional vertical bob */
  FE.spriteCanvas = function (clsKey, faction, scale, frame) {
    var id = clsKey + '|' + faction + '|' + scale + '|' + (frame || 0);
    if (cache[id]) return cache[id];

    var px = composite(clsKey);
    var pal = paletteFor(clsKey, faction);
    var bob = frame ? 1 : 0;

    var cv = document.createElement('canvas');
    cv.width = S * scale;
    cv.height = S * scale;
    var g = cv.getContext('2d');
    g.imageSmoothingEnabled = false;

    for (var y = 0; y < S; y++) {
      for (var x = 0; x < S; x++) {
        var c = px[y][x];
        if (c === '.' || c === '0') continue;
        var col = pal[c];
        if (!col) continue;
        /* the bob lifts the upper half only, so feet stay planted */
        var dy = (bob && y < 12) ? -1 : 0;
        var ty = y + dy;
        if (ty < 0) continue;
        g.fillStyle = col;
        g.fillRect(x * scale, ty * scale, scale, scale);
      }
    }
    cache[id] = cv;
    return cv;
  };

  /* a small portrait: the sprite's head, blown up */
  FE.portraitCanvas = function (clsKey, faction, size) {
    var id = 'p' + clsKey + '|' + faction + '|' + size;
    if (cache[id]) return cache[id];
    var px = composite(clsKey);
    var pal = paletteFor(clsKey, faction);
    var src = 9;                      /* top 9 rows: head and shoulders */
    var scale = Math.floor(size / src);
    var cv = document.createElement('canvas');
    cv.width = S * scale; cv.height = src * scale;
    var g = cv.getContext('2d');
    g.imageSmoothingEnabled = false;
    for (var y = 0; y < src; y++) {
      for (var x = 0; x < S; x++) {
        var c = px[y][x];
        if (c === '.' || c === '0') continue;
        var col = pal[c];
        if (!col) continue;
        g.fillStyle = col;
        g.fillRect(x * scale, y * scale, scale, scale);
      }
    }
    cache[id] = cv;
    return cv;
  };

  FE.SPRITE_SIZE = S;
  FE.clearSpriteCache = function () { cache = {}; };

})(window.FE = window.FE || {});
