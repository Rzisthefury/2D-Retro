/* ------------------------------------------------------------------
   CHARACTER PORTRAITS
   64x76 pixel busts, drawn into an index buffer and blitted with a
   per-character palette, so every face is its own person rather than a
   blown-up crop of the map sprite.

   The head is a hand-tuned silhouette table rather than an ellipse, so
   the skull, cheekbone and jaw all sit where a face's do. Light comes
   from the upper left throughout: highlight on the brow and the left
   rim, mid tone across the right cheek, shadow under the jaw, the hair
   and the nose. The outline pass at the end is what makes it read as
   pixel art rather than vector shapes.
------------------------------------------------------------------ */
(function (FE) {
  'use strict';

  var W = 64, H = 76;
  var CX = 32;                 /* centre line of the face */
  var TOP = 9, CHIN = 49;      /* the skull's first and last row */

  /* palette slots */
  var T = 0,   OL = 1,
      SKH = 2, SK = 3, SKM = 4, SKD = 5, SKB = 6,     /* skin: lit .. shadow, blush */
      HL = 7,  HM = 8, HD = 9, HX = 10,               /* hair: lit .. darkest */
      CL = 11, CM = 12, CD = 13,                      /* cloth */
      ML = 14, MM = 15, MD = 16,                      /* metal */
      EW = 17, EI = 18, EP = 19,                      /* eye white, iris, pupil */
      AC = 20, ACD = 21,                              /* accent trim */
      LP = 22, LPD = 23;                              /* lips */

  /* half width of the head at each row, TOP..CHIN */
  var HALF = [
    5.5, 8.0, 9.8, 11.0, 12.0, 12.8, 13.4, 13.9, 14.3, 14.6,
    14.9, 15.1, 15.3, 15.4, 15.5, 15.5, 15.5, 15.5, 15.4, 15.3,
    15.2, 15.0, 14.8, 14.5, 14.2, 13.8, 13.4, 12.9, 12.4, 11.8,
    11.2, 10.5, 9.8, 9.1, 8.3, 7.5, 6.6, 5.6, 4.5, 3.2, 1.8
  ];

  function halfAt(y, square) {
    if (y < TOP || y > CHIN) return 0;
    var h = HALF[y - TOP];
    if (square && y >= 36) h = Math.max(h, 12.6 - (y - 36) * 0.62);
    return h;
  }

  /* half width of the hair mass: the skull plus a little puff, domed above */
  function hairHalf(y, puff) {
    puff = puff === undefined ? 1.6 : puff;
    if (y >= TOP) return halfAt(y, false) + puff;
    var top = TOP - 5;
    if (y < top) return 0;
    var base = halfAt(TOP, false) + puff + 3;
    var t = (TOP - y) / (TOP - top + 0.6);
    return base * Math.sqrt(Math.max(0, 1 - t * t));
  }

  /* ---------------- buffer ---------------- */

  function Buf() { this.d = new Uint8Array(W * H); }
  Buf.prototype.set = function (x, y, i) {
    x = Math.round(x); y = Math.round(y);
    if (x < 0 || y < 0 || x >= W || y >= H) return;
    this.d[y * W + x] = i;
  };
  Buf.prototype.get = function (x, y) {
    x = Math.round(x); y = Math.round(y);
    if (x < 0 || y < 0 || x >= W || y >= H) return T;
    return this.d[y * W + x];
  };
  Buf.prototype.rect = function (x, y, w, h, i) {
    for (var yy = 0; yy < h; yy++) for (var xx = 0; xx < w; xx++) this.set(x + xx, y + yy, i);
  };
  Buf.prototype.ell = function (cx, cy, rx, ry, i) {
    for (var y = Math.floor(cy - ry); y <= Math.ceil(cy + ry); y++) {
      for (var x = Math.floor(cx - rx); x <= Math.ceil(cx + rx); x++) {
        var dx = (x - cx) / rx, dy = (y - cy) / ry;
        if (dx * dx + dy * dy <= 1.02) this.set(x, y, i);
      }
    }
  };
  /* an ellipse that only paints where a given index already is */
  Buf.prototype.ellOver = function (cx, cy, rx, ry, over, i) {
    for (var y = Math.floor(cy - ry); y <= Math.ceil(cy + ry); y++) {
      for (var x = Math.floor(cx - rx); x <= Math.ceil(cx + rx); x++) {
        var dx = (x - cx) / rx, dy = (y - cy) / ry;
        if (dx * dx + dy * dy > 1.02) continue;
        if (this.get(x, y) === over) this.set(x, y, i);
      }
    }
  };
  Buf.prototype.shade = function (x, y, w, h, over, i) {
    for (var yy = 0; yy < h; yy++) for (var xx = 0; xx < w; xx++) {
      if (this.get(x + xx, y + yy) === over) this.set(x + xx, y + yy, i);
    }
  };
  /* horizontal span centred on CX */
  Buf.prototype.span = function (y, half, i) {
    var x0 = Math.round(CX - half), x1 = Math.round(CX + half);
    for (var x = x0; x <= x1; x++) this.set(x, y, i);
  };
  /* swap every pixel of one index inside a row band for another */
  Buf.prototype.swapBand = function (y0, y1, over, i) {
    for (var y = y0; y <= y1; y++) for (var x = 0; x < W; x++) {
      if (this.get(x, y) === over) this.set(x, y, i);
    }
  };

  /* ---------------- hair ----------------
     Each style is { back, front }: back is drawn behind the shoulders,
     front is the cap that sits on the skull. */

  /* set while a helmet, hood or hat is coming: the hair lies flat under it */
  var TIGHT = false;

  /* the cap common to every style: mass, highlight, edge shadow, strands */
  function cap(b, fringe, puff) {
    if (TIGHT) puff = Math.min(puff, 0.6);
    var y, x, h, top = TOP - 5;
    for (y = top; y <= 34; y++) {
      h = hairHalf(y, puff);
      if (h <= 0) continue;
      var x0 = Math.round(CX - h), x1 = Math.round(CX + h);
      for (x = x0; x <= x1; x++) {
        /* the fringe decides how far down the front the hair reaches */
        var lim = fringe(x);
        var sideLock = Math.abs(x - CX) > halfAt(Math.min(y, CHIN), false) - 0.4;
        if (y > lim && !sideLock) continue;
        if (y > 34) continue;
        b.set(x, y, HM);
      }
    }
    /* volume: a lit crescent up on the left, dark down the right */
    b.ellOver(CX - 7, TOP + 2, 10, 7, HM, HL);
    b.ellOver(CX - 9, TOP + 1, 6, 4, HL, HL);
    for (y = top; y <= 34; y++) {
      h = hairHalf(y, puff);
      if (h <= 0) continue;
      for (x = Math.round(CX + h) - 3; x <= Math.round(CX + h); x++) {
        if (b.get(x, y) === HM) b.set(x, y, HD);
      }
      if (b.get(Math.round(CX + h), y) === HD) b.set(Math.round(CX + h), y, HX);
    }
    /* strands: a few dark partings running down the lit side */
    for (x = CX - 14; x < CX + 12; x += 5) {
      for (y = TOP - 3; y <= 22; y++) {
        var v = b.get(x + Math.round((y - TOP) * 0.25), y);
        if (v === HL || v === HM) b.set(x + Math.round((y - TOP) * 0.25), y, v === HL ? HM : HD);
      }
    }
    /* the fringe edge itself reads darkest */
    for (x = 0; x < W; x++) {
      var f = fringe(x);
      if (b.get(x, f) === HM || b.get(x, f) === HL) b.set(x, f, HD);
      if (b.get(x, f - 1) === HL) b.set(x, f - 1, HM);
    }
  }

  /* fringe shapes: y of the lowest hair pixel at column x */
  function fringeSwept(x) { return 21 + Math.round((x - 14) * 0.10); }
  function fringeRagged(x) { return 20 + (x % 3 === 0 ? 2 : (x % 3 === 1 ? 0 : 1)); }
  function fringeParted(x) { return x < CX - 3 ? 22 - Math.round((CX - x) * 0.12) : 18 + Math.round((x - CX) * 0.16); }
  function fringeBrowLine(x) { return 20; }

  var HAIR = {
    short: {
      back: function () {},
      front: function (b) {
        cap(b, fringeSwept, 1.4);
        /* trimmed round the ear */
        b.rect(CX - 16, 30, 3, 5, HD);
        b.rect(CX + 14, 30, 3, 5, HX);
      }
    },
    long: {
      back: function (b) {
        var y, h;
        for (y = 14; y <= 70; y++) {
          h = (y < CHIN ? halfAt(y, false) : halfAt(CHIN, false)) + 5 + Math.max(0, (y - 44) * 0.30);
          b.span(y, h, HM);
        }
        for (y = 14; y <= 70; y++) {
          h = (y < CHIN ? halfAt(y, false) : halfAt(CHIN, false)) + 5 + Math.max(0, (y - 44) * 0.30);
          var xr = Math.round(CX + h);
          b.rect(xr - 3, y, 4, 1, HD);
          b.set(xr, y, HX);
          b.set(Math.round(CX - h), y, HM);
        }
        /* a couple of falling strands */
        for (y = 30; y <= 70; y++) {
          b.set(CX - 17 + Math.round(Math.sin(y * 0.22) * 1.4), y, HD);
          b.set(CX + 18 + Math.round(Math.sin(y * 0.19) * 1.4), y, HX);
        }
      },
      front: function (b) { cap(b, fringeParted, 1.8); }
    },
    ponytail: {
      back: function (b) {
        var y;
        for (y = 16; y <= 56; y++) {
          var w = 4 + Math.sin((y - 16) * 0.10) * 2.4;
          var cx = CX + 15 + Math.round((y - 16) * 0.16);
          b.ell(cx, y, w, 1.4, HM);
          b.ell(cx + w * 0.5, y, w * 0.5, 1.2, HD);
        }
        b.ell(CX + 22, 56, 3.5, 3, HD);
      },
      front: function (b) {
        cap(b, fringeSwept, 1.4);
        /* swept back and gathered */
        b.ell(CX + 13, 24, 4, 4, HM);
        b.ell(CX + 14, 24, 2.5, 2.5, HD);
        b.rect(CX - 17, 28, 3, 4, HD);
      }
    },
    braid: {
      back: function (b) {
        var i, y = 30;
        for (i = 0; i < 8; i++) {
          b.ell(CX - 18 - Math.round(i * 0.3), y, 4.2, 2.6, i % 2 ? HD : HM);
          b.set(CX - 22 - Math.round(i * 0.3), y, HX);
          y += 5;
        }
        b.ell(CX - 21, y - 1, 2.4, 2, AC);
      },
      front: function (b) {
        cap(b, fringeParted, 1.6);
        b.ell(CX - 15, 26, 4, 5, HM);
        b.ell(CX - 16, 27, 2.4, 3.4, HD);
      }
    },
    bob: {
      back: function () {},
      front: function (b) {
        cap(b, fringeBrowLine, 2.0);
        var y, h;
        for (y = 18; y <= 42; y++) {
          h = halfAt(y, false) + 2.2;
          b.rect(Math.round(CX - h), y, 4, 1, HM);
          b.rect(Math.round(CX + h) - 3, y, 4, 1, HD);
          b.set(Math.round(CX + h), y, HX);
        }
        /* the blunt cut at the jaw */
        for (y = 40; y <= 43; y++) {
          h = halfAt(40, false) + 2.2;
          b.rect(Math.round(CX - h), y, 4, 1, HD);
          b.rect(Math.round(CX + h) - 3, y, 4, 1, HX);
        }
      }
    },
    wild: {
      back: function (b) {
        var i;
        if (TIGHT) return;
        for (i = 0; i < 9; i++) {
          var a = -2.5 + i * 0.35;
          var lx = CX + Math.cos(a) * 20, ly = 18 + Math.sin(a) * 15;
          b.ell(lx, ly, 3.4, 3.0, HM);
          b.ell(lx + 1, ly + 1, 2, 1.8, HD);
        }
      },
      front: function (b) {
        cap(b, fringeRagged, 2.4);
        if (TIGHT) return;
        /* tufts breaking the silhouette */
        b.ell(CX - 12, TOP - 5, 4, 3.4, HM);
        b.ell(CX + 3, TOP - 7, 4.4, 3.6, HM);
        b.ell(CX + 13, TOP - 3, 3.6, 3, HD);
        b.ell(CX - 12, TOP - 6, 2.4, 2, HL);
        b.rect(CX - 18, 26, 4, 7, HD);
        b.rect(CX + 15, 26, 4, 7, HX);
      }
    },
    balding: {
      back: function () {},
      front: function (b) {
        var y, h;
        for (y = 16; y <= 34; y++) {
          h = halfAt(y, false) + 1.2;
          b.rect(Math.round(CX - h), y, 4, 1, HM);
          b.rect(Math.round(CX + h) - 3, y, 4, 1, HD);
        }
        /* a thin sweep still crossing the crown */
        for (var x = CX - 13; x <= CX + 12; x++) {
          var yy = 12 + Math.round(Math.abs(x - CX + 4) * 0.16);
          b.set(x, yy, HM); b.set(x, yy + 1, HD);
        }
        b.ell(CX - 14, 20, 3, 5, HM);
        b.ell(CX + 14, 20, 3, 5, HD);
      }
    },
    bald: { back: function () {}, front: function () {} }
  };

  /* ---------------- headgear ---------------- */

  var GEAR = {
    none: function () {},

    /* an open-faced helm with a nasal bar and cheek plates */
    helm: function (b) {
      var y, x, h;
      for (y = TOP - 5; y <= 27; y++) {
        h = hairHalf(y, 2.6);
        if (h <= 0) continue;
        for (x = Math.round(CX - h); x <= Math.round(CX + h); x++) b.set(x, y, ML);
      }
      /* dome shading */
      b.ellOver(CX - 7, TOP, 9, 6, ML, ML);
      for (y = TOP - 5; y <= 27; y++) {
        h = hairHalf(y, 2.6);
        if (h <= 0) continue;
        for (x = Math.round(CX + h) - 4; x <= Math.round(CX + h); x++) if (b.get(x, y) === ML) b.set(x, y, MM);
        b.set(Math.round(CX + h), y, MD);
      }
      b.ellOver(CX - 6, TOP - 1, 6, 4, ML, ML);
      /* brow rim */
      for (y = 24; y <= 27; y++) { h = hairHalf(y, 2.9); b.span(y, h, y === 24 ? MD : (y === 27 ? MD : MM)); }
      /* nasal bar */
      b.rect(CX - 1, 25, 3, 13, MM);
      b.rect(CX - 1, 25, 1, 13, ML);
      b.rect(CX + 1, 25, 1, 13, MD);
      /* cheek plates, hugging the outline */
      for (y = 27; y <= 38; y++) {
        h = halfAt(y, false) + 2.2;
        b.rect(Math.round(CX - h), y, 3, 1, MM);
        b.rect(Math.round(CX + h) - 2, y, 3, 1, MD);
      }
      /* rivets and crest */
      b.set(CX - 12, 26, AC); b.set(CX + 12, 26, AC); b.set(CX, 23, AC);
      b.rect(CX - 2, TOP - 9, 4, 6, AC);
      b.rect(CX - 1, TOP - 10, 2, 2, ACD);
      b.rect(CX - 2, TOP - 9, 1, 6, ACD);
    },

    /* a deep cloth hood: a ring of fabric, never painted over the face */
    hood: function (b) {
      var y, x;
      for (y = TOP - 7; y <= 70; y++) {
        var outer = y < TOP
          ? hairHalf(y, 5.5)
          : (y <= CHIN ? halfAt(y, false) : halfAt(CHIN, false)) + 5.5 + Math.max(0, (y - CHIN) * 0.55);
        if (outer <= 0) continue;
        var inner = (y >= 13 && y <= 46) ? halfAt(Math.min(y, CHIN), false) + 0.8 : -1;
        for (x = Math.round(CX - outer); x <= Math.round(CX + outer); x++) {
          if (inner > 0 && Math.abs(x - CX) <= inner) continue;
          b.set(x, y, CM);
        }
      }
      /* fold light and the shadowed inside edge */
      for (y = TOP - 7; y <= 70; y++) {
        for (x = 0; x < W; x++) {
          if (b.get(x, y) !== CM) continue;
          var d = x - CX;
          if (d < -6) b.set(x, y, CL);
          if (d > 8) b.set(x, y, CD);
        }
      }
      /* the rim that falls across the brow */
      for (y = 13; y <= 46; y++) {
        var inn = halfAt(Math.min(y, CHIN), false) + 0.8;
        b.set(Math.round(CX - inn) - 1, y, CD);
        b.set(Math.round(CX + inn) + 1, y, CD);
      }
      for (x = CX - 17; x <= CX + 17; x++) b.set(x, 14, CD);
      b.rect(CX - 17, 12, 35, 2, CM);
    },

    /* a worked band with a stone at the brow */
    circlet: function (b) {
      var y, x, h;
      for (y = 20; y <= 22; y++) {
        h = halfAt(y, false) + 1.4;
        for (x = Math.round(CX - h); x <= Math.round(CX + h); x++) b.set(x, y, y === 21 ? AC : ACD);
      }
      h = halfAt(21, false) + 1.4;
      for (x = Math.round(CX - h); x <= Math.round(CX - h) + 5; x++) b.set(x, 21, AC);
      /* the stone */
      b.ell(CX, 22, 3, 2.6, ACD);
      b.ell(CX, 22, 2, 1.8, ML);
      b.set(CX - 1, 21, EW);
      /* small points rising from the band */
      b.set(CX - 9, 19, AC); b.set(CX + 9, 19, ACD);
      b.set(CX - 14, 20, AC); b.set(CX + 14, 20, ACD);
    },

    /* cloth tied round the brow, knotted at the side */
    headband: function (b) {
      var y, x, h;
      for (y = 20; y <= 24; y++) {
        h = halfAt(y, false) + 1.4;
        for (x = Math.round(CX - h); x <= Math.round(CX + h); x++) {
          b.set(x, y, y === 20 || y === 24 ? ACD : AC);
        }
      }
      /* knot and trailing ends on the left */
      h = halfAt(22, false) + 1.4;
      b.ell(CX - h - 2, 22, 3, 3, AC);
      b.ell(CX - h - 2, 22, 1.6, 1.6, ACD);
      b.rect(Math.round(CX - h) - 5, 25, 4, 2, AC);
      b.rect(Math.round(CX - h) - 5, 28, 3, 2, ACD);
    },

    /* a soft hat with a wide brim */
    cowl: function (b) {
      var y, x, h;
      /* crown */
      for (y = TOP - 9; y <= 20; y++) {
        h = hairHalf(y, 2.2) * (y < TOP ? 1 : 1);
        if (y < TOP - 5) h = hairHalf(TOP - 5, 2.2) * (1 - (TOP - 5 - y) / 7);
        if (h <= 0) continue;
        for (x = Math.round(CX - h); x <= Math.round(CX + h); x++) b.set(x, y, CM);
      }
      b.ellOver(CX - 7, TOP - 3, 8, 6, CM, CL);
      for (y = TOP - 9; y <= 20; y++) {
        for (x = CX + 6; x < W; x++) if (b.get(x, y) === CM) b.set(x, y, CD);
      }
      /* brim */
      b.ell(CX, 21, 23, 4.2, CM);
      b.ell(CX - 6, 20, 15, 2.6, CL);
      b.rect(CX - 23, 23, 47, 2, CD);
      /* hatband */
      b.rect(CX - 17, 17, 34, 3, ACD);
      b.rect(CX - 17, 17, 34, 1, AC);
    }
  };

  /* ---------------- the bust ---------------- */

  function drawBody(b, spec) {
    var y, x, h;
    /* shoulders */
    for (y = 54; y < H; y++) {
      h = Math.min(31, 17 + (y - 54) * 1.45);
      for (x = Math.round(CX - h); x <= Math.round(CX + h); x++) b.set(x, y, CL);
    }
    /* light from the left: the right half falls off */
    for (y = 54; y < H; y++) {
      for (x = CX + 3; x < W; x++) if (b.get(x, y) === CL) b.set(x, y, CM);
      for (x = CX + 13; x < W; x++) if (b.get(x, y) === CM) b.set(x, y, CD);
    }
    /* a fold under each shoulder */
    for (y = 62; y < H; y++) {
      b.set(CX - 15 + Math.round((y - 62) * 0.35), y, CM);
      b.set(CX + 16 - Math.round((y - 62) * 0.15), y, CD);
    }

    /* collar */
    if (spec.collar !== 'plain') {
      for (y = 56; y <= 70; y++) {
        var spread = 6 + (y - 56) * 0.85;
        b.rect(Math.round(CX - spread) - 3, y, 4, 1, CD);
        b.rect(Math.round(CX + spread), y, 4, 1, CD);
        b.rect(Math.round(CX - spread) - 3, y, 1, 1, AC);
        b.rect(Math.round(CX + spread) + 3, y, 1, 1, ACD);
      }
      b.rect(CX - 12, 57, 25, 2, CD);
      b.rect(CX - 12, 57, 25, 1, AC);
    } else {
      b.rect(CX - 11, 57, 23, 2, CD);
    }

    if (spec.pauldron) {
      b.ell(11, 68, 12, 10, ML);
      b.ell(53, 68, 12, 10, ML);
      b.ellOver(8, 65, 8, 6, ML, ML);
      var px;
      for (y = 58; y < H; y++) {
        for (x = 0; x < W; x++) {
          if (b.get(x, y) !== ML) continue;
          px = x < 32 ? x - 4 : x - 48;
          if (px > 6) b.set(x, y, MM);
          if (px > 10) b.set(x, y, MD);
        }
      }
      /* banding and rivets */
      for (x = 0; x < W; x++) {
        if (b.get(x, 64) === ML || b.get(x, 64) === MM) b.set(x, 64, MD);
        if (b.get(x, 70) === ML || b.get(x, 70) === MM) b.set(x, 70, MD);
      }
      b.set(10, 61, AC); b.set(54, 61, AC);
      b.set(6, 67, ACD); b.set(58, 67, ACD);
    }
  }

  function drawHead(b, spec) {
    var y, x, h, sq = spec.jaw === 'square';

    /* neck */
    for (y = 44; y <= 60; y++) {
      var nw = 7 + Math.max(0, (y - 54) * 0.9);
      for (x = Math.round(CX - nw); x <= Math.round(CX + nw); x++) b.set(x, y, SKM);
    }
    /* the jaw throws a shadow across the throat */
    for (y = 44; y <= 49; y++) b.span(y, 7, SKD);
    for (y = 53; y <= 56; y++) {
      for (x = CX - 3; x <= CX + 8; x++) if (b.get(x, y) === SKM) b.set(x, y, SKD);
    }
    for (y = 50; y <= 60; y++) b.set(Math.round(CX - 7), y, SK);

    /* ears */
    b.ell(CX - 16, 33, 3.2, 5.4, SK);
    b.ell(CX + 16, 33, 3.2, 5.4, SKM);
    b.ell(CX - 15, 33, 1.6, 3.2, SKM);
    b.ell(CX + 15, 33, 1.6, 3.2, SKD);

    /* skull */
    for (y = TOP; y <= CHIN; y++) {
      h = halfAt(y, sq);
      for (x = Math.round(CX - h); x <= Math.round(CX + h); x++) b.set(x, y, SK);
    }

    /* form: shadow down the right, rim light down the left */
    for (y = TOP; y <= CHIN; y++) {
      h = halfAt(y, sq);
      var xr = Math.round(CX + h), xl = Math.round(CX - h);
      for (x = xr - 5; x <= xr; x++) if (b.get(x, y) === SK) b.set(x, y, SKM);
      for (x = xr - 2; x <= xr; x++) if (b.get(x, y) === SKM) b.set(x, y, SKD);
      if (y > 14 && y < 44 && b.get(xl, y) === SK) b.set(xl, y, SKH);
    }
    /* brow ridge and forehead catch the light */
    b.ellOver(CX - 4, 19, 11, 6, SK, SKH);
    b.ellOver(CX - 3, 17, 7, 3, SKH, SKH);
    /* temples recede */
    b.ellOver(CX - 14, 24, 4, 5, SK, SKM);
    b.ellOver(CX + 13, 24, 4, 5, SKM, SKD);
    /* cheekbones */
    b.ellOver(CX - 10, 34, 5, 3.4, SK, SKH);
    b.ellOver(CX + 9, 35, 5, 3.4, SKM, SKM);
    /* the hollow under each cheekbone */
    b.ellOver(CX - 11, 40, 4, 3, SK, SKM);
    b.ellOver(CX + 10, 40, 4, 3, SKM, SKD);
    /* chin */
    b.ellOver(CX, 45, 4.5, 3, SK, SKH);
    for (y = 46; y <= CHIN; y++) {
      h = halfAt(y, sq);
      for (x = Math.round(CX - h); x <= Math.round(CX + h); x++) if (b.get(x, y) === SK) b.set(x, y, SKM);
    }
    b.ellOver(CX - 1, 45, 3, 2, SKM, SKH);
    /* a little warmth on the cheeks */
    if (spec.blush !== false) {
      b.ellOver(CX - 11, 37, 3.4, 2.2, SKH, SKB);
      b.ellOver(CX + 10, 37, 3.4, 2.2, SKM, SKB);
    }
  }

  function drawFace(b, spec) {
    var x, y;

    /* --- brows --- */
    var browY = spec.brow === 'high' ? 24 : 25;
    var tilt = spec.brow === 'angry' ? 1 : 0;
    for (x = 0; x < 10; x++) {
      var ly = browY + (tilt ? Math.round(x * 0.30) : Math.round(Math.abs(x - 5) * 0.16));
      var ry = browY + (tilt ? Math.round((9 - x) * 0.30) : Math.round(Math.abs(x - 4) * 0.16));
      b.set(CX - 16 + x, ly, HD);
      b.set(CX - 16 + x, ly + 1, HD);
      b.set(CX - 16 + x, ly + 2, HX);
      b.set(CX + 7 + x, ry, HD);
      b.set(CX + 7 + x, ry + 1, HD);
      b.set(CX + 7 + x, ry + 2, HX);
    }

    /* --- eyes --- */
    var LX = CX - 12, RX = CX + 6;         /* left edge of each eye */
    var EYT = 29;
    function eye(x0, mirror) {
      var i;
      var EWD = 7;
      if (spec.eyes === 'closed') {
        for (i = 0; i < EWD; i++) b.set(x0 + i, EYT + 2, OL);
        b.set(x0 + (mirror ? EWD : -1), EYT + 1, OL);
        return;
      }
      /* the white, an almond three rows deep */
      for (i = 0; i < EWD; i++) {
        var lift = (i === 0 || i === EWD - 1) ? 1 : 0;
        for (y = EYT + 1 + lift; y <= EYT + 3 - lift; y++) b.set(x0 + i, y, EW);
      }
      /* iris and pupil */
      var ix = x0 + (mirror ? 1 : 2);
      b.rect(ix, EYT + 1, 4, 3, EI);
      b.rect(ix + 1, EYT + 1, 2, 2, EP);
      b.set(ix, EYT + 1, EW);             /* catchlight */
      /* lids */
      for (i = 0; i < EWD; i++) b.set(x0 + i, EYT + (i === 0 || i === EWD - 1 ? 1 : 0), OL);
      b.set(x0 - (mirror ? 0 : 1), EYT + 1, OL);
      b.set(x0 + EWD - 1 + (mirror ? 1 : 0), EYT + 1, OL);
      for (i = 1; i < EWD - 1; i++) b.set(x0 + i, EYT + 4, SKD);
      if (spec.lashes) {
        for (i = 0; i < EWD; i++) b.set(x0 + i, EYT - 1 + (i === 0 || i === EWD - 1 ? 1 : 0), OL);
        b.set(x0 + (mirror ? EWD : -1), EYT, OL);
        b.set(x0 + (mirror ? EWD + 1 : -2), EYT - 1, OL);
      }
    }
    eye(LX, false);
    eye(RX, true);

    /* --- nose --- */
    for (y = 27; y <= 37; y++) {
      b.set(CX - 2, y, SKH);
      b.set(CX + 1, y, SKM);
      b.set(CX + 2, y, y > 31 ? SKD : SKM);
    }
    b.ellOver(CX, 39, 3.4, 2.4, SK, SKH);
    b.ellOver(CX, 39, 3.4, 2.4, SKM, SKH);
    b.set(CX - 4, 40, SKD); b.set(CX - 3, 41, SKD);
    b.set(CX + 3, 40, SKD); b.set(CX + 2, 41, SKD);
    for (x = CX - 4; x <= CX + 3; x++) b.set(x, 42, SKD);
    b.set(CX + 4, 41, SKD);

    /* --- mouth --- */
    var my = 45, wide = 5;
    for (x = CX - wide; x <= CX + wide - 1; x++) {
      var dy = 0, edge = Math.abs(x - CX + 0.5) > wide - 1.5;
      if (spec.mouth === 'frown') dy = edge ? -1 : 0;
      if (spec.mouth === 'smirk') dy = x > CX + 1 ? -1 : 0;
      b.set(x, my + dy, LPD);
      if (!edge) b.set(x, my + dy + 1, LP);
    }
    /* philtrum and the shadow under the lower lip */
    b.set(CX - 1, 43, SKD); b.set(CX, 43, SKD);
    for (x = CX - 3; x <= CX + 2; x++) b.set(x, my + 2, SKD);

    /* --- facial hair --- */
    var sq = spec.jaw === 'square';
    if (spec.beard === 'full') {
      /* a U of hair: high at the sideburns, meeting under the chin */
      for (y = 32; y <= CHIN + 3; y++) {
        var h = halfAt(Math.min(y, CHIN), sq) + (y > CHIN ? -(y - CHIN) * 1.7 : 0);
        if (h <= 0) continue;
        var inner = y >= 45 ? 0 : Math.max(0, 13.5 - (y - 32) * 0.72);
        for (x = Math.round(CX - h); x <= Math.round(CX + h); x++) {
          if (Math.abs(x - CX) < inner) continue;
          var v = b.get(x, y);
          if (v === SK || v === SKH || v === SKM || v === SKD || v === SKB) b.set(x, y, HM);
        }
      }
      /* moustache: highest under the nose, falling away at the corners */
      for (x = CX - 7; x <= CX + 6; x++) {
        var d = Math.abs(x - CX + 0.5);
        var top = d <= 3 ? 41 : (d <= 5 ? 42 : 43);
        for (y = top; y <= 44; y++) {
          var m = b.get(x, y);
          if (m === SK || m === SKH || m === SKM || m === SKD || m === SKB) b.set(x, y, HM);
        }
      }
      /* the mouth, cut back into the hair */
      for (x = CX - 3; x <= CX + 2; x++) b.set(x, 45, LPD);
      for (x = CX - 2; x <= CX + 1; x++) b.set(x, 46, HX);
      /* volume */
      b.ellOver(CX - 8, 47, 6, 4, HM, HL);
      for (y = 32; y <= CHIN + 3; y++) for (x = CX + 5; x < W; x++) if (b.get(x, y) === HM) b.set(x, y, HD);
      for (y = CHIN; y <= CHIN + 3; y++) for (x = 0; x < W; x++) if (b.get(x, y) === HD) b.set(x, y, HX);
    } else if (spec.beard === 'stubble') {
      for (y = 38; y <= CHIN; y++) {
        for (x = CX - 16; x <= CX + 15; x++) {
          var g = b.get(x, y);
          if ((x * 7 + y * 13) % 3 !== 0) continue;
          if (g === SK || g === SKH) b.set(x, y, SKM);
          else if (g === SKM) b.set(x, y, SKD);
        }
      }
      for (y = 42; y <= 44; y++) for (x = CX - 7; x <= CX + 6; x++) {
        if ((x + y) % 2 === 0 && b.get(x, y) !== T && b.get(x, y) !== LP && b.get(x, y) !== LPD) b.set(x, y, SKD);
      }
    } else if (spec.beard === 'goatee') {
      /* A goatee is two narrow shapes with the mouth between them. Painting a
         slab from the nose to the chin — which is what this used to do — reads
         as a black bib, the same way the full beard once read as a bandana.
         Both loops only ever replace skin, so the lips survive. */
      function skinAt(px, py) {
        var v = b.get(px, py);
        return v === SK || v === SKH || v === SKM || v === SKD || v === SKB;
      }
      /* the moustache: a thin bar under the nose, falling away at the corners */
      for (x = CX - 6; x <= CX + 5; x++) {
        var gd = Math.abs(x - CX + 0.5);
        var gtop = gd <= 2 ? 42 : (gd <= 4 ? 43 : 44);
        for (y = gtop; y <= 44; y++) if (skinAt(x, y)) b.set(x, y, HM);
      }
      /* the tuft: below the lower lip, narrower than the mouth, running off
         the chin so the silhouette is longer than it is wide */
      for (y = 47; y <= CHIN + 3; y++) {
        var gw = y <= CHIN ? 3.2 : Math.max(0, 3.2 - (y - CHIN) * 1.3);
        if (gw <= 0) continue;
        for (x = Math.round(CX - gw); x <= Math.round(CX + gw); x++) {
          if (y > CHIN && !skinAt(x, y) && b.get(x, y) !== T) continue;
          if (y <= CHIN && !skinAt(x, y)) continue;
          b.set(x, y, HM);
        }
      }
      /* shade the far side so it has a light source like everything else */
      for (y = 42; y <= CHIN + 3; y++) {
        for (x = CX + 1; x <= CX + 8; x++) if (b.get(x, y) === HM) b.set(x, y, HD);
      }
    }

    /* --- distinguishing marks --- */
    if (spec.scar) {
      for (y = 22; y <= 38; y++) b.set(CX + 10 + Math.round((y - 22) * 0.12), y, SKD);
      b.set(CX + 12, 26, SKD); b.set(CX + 9, 32, SKD);
      b.set(CX + 11, 23, SKB); b.set(CX + 12, 35, SKB);
    }
    if (spec.freckles) {
      var fx = [-12, -9, -11, -7, 10, 12, 9, 13];
      var fy = [35, 36, 38, 34, 35, 37, 38, 34];
      for (var f = 0; f < fx.length; f++) b.set(CX + fx[f], fy[f], SKD);
    }
    if (spec.eyepatch) {
      for (y = 27; y <= 37; y++) for (x = CX + 3; x <= CX + 16; x++) b.set(x, y, MD);
      for (y = 28; y <= 30; y++) for (x = CX + 4; x <= CX + 15; x++) b.set(x, y, MM);
      for (x = CX - 16; x <= CX + 17; x++) b.set(x, 28, MD);
      b.ell(CX + 9, 32, 2.4, 2.2, ACD);
    }
  }

  function draw(spec) {
    var b = new Buf();
    var hair = HAIR[spec.hair] || HAIR.short;

    TIGHT = spec.gear === 'helm' || spec.gear === 'hood' || spec.gear === 'cowl';
    hair.back(b);
    drawBody(b, spec);
    drawHead(b, spec);
    hair.front(b);
    TIGHT = false;
    drawFace(b, spec);
    (GEAR[spec.gear] || GEAR.none)(b);

    /* outline: every transparent pixel touching the figure */
    var copy = new Uint8Array(b.d);
    function filled(x, y) {
      if (x < 0 || y < 0 || x >= W || y >= H) return false;
      return copy[y * W + x] !== T;
    }
    for (var oy = 0; oy < H; oy++) {
      for (var ox = 0; ox < W; ox++) {
        if (copy[oy * W + ox] !== T) continue;
        if (filled(ox - 1, oy) || filled(ox + 1, oy) || filled(ox, oy - 1) || filled(ox, oy + 1)) {
          b.set(ox, oy, OL);
        }
      }
    }
    return b;
  }

  /* ---------------- palettes ---------------- */

  var SKINS = {
    fair:   ['#ffe6c6', '#f6d2ac', '#dcab82', '#b07f5c', '#c9866f'],
    warm:   ['#fbd6ab', '#eebd93', '#cc9163', '#9e6a44', '#bf7a63'],
    tan:    ['#eeb98a', '#d8a172', '#b17a4d', '#835432', '#a76646'],
    deep:   ['#c4874f', '#a9703f', '#89562f', '#61391e', '#8a4e35'],
    pale:   ['#fff0dd', '#f6e0c6', '#dcbb9c', '#ad8a6c', '#c88f84']
  };
  var HAIRS = {
    auburn:  ['#d97f46', '#a9512a', '#71311a', '#48200f'],
    black:   ['#57506a', '#39334a', '#231f30', '#14111c'],
    brown:   ['#ae7a48', '#82562f', '#57371e', '#331f10'],
    blonde:  ['#ffe9a4', '#dcbc66', '#a5853c', '#6d5622'],
    grey:    ['#e2e5ee', '#b4b8c6', '#83889b', '#565a6c'],
    red:     ['#ee8a48', '#bd5726', '#843716', '#52200c'],
    silver:  ['#f4f8ff', '#c9d0e0', '#969eb2', '#666d80'],
    sandy:   ['#eecb8b', '#c39c56', '#93723a', '#614a22']
  };
  var IRIS = {
    green: ['#6cc072', '#2f6a41'], blue: ['#6d9be0', '#31548f'],
    brown: ['#a06a38', '#4f3016'], grey: ['#aab3c6', '#5b6375'],
    amber: ['#e0a94a', '#8a5f1c'], violet: ['#b07de0', '#5b3382']
  };

  function palette(spec) {
    var sk = SKINS[spec.skin] || SKINS.fair;
    var hr = HAIRS[spec.hairColour] || HAIRS.brown;
    var ir = IRIS[spec.eyeColour] || IRIS.brown;
    var p = [];
    p[T] = null;
    p[OL] = '#171326';
    p[SKH] = sk[0]; p[SK] = sk[1]; p[SKM] = sk[2]; p[SKD] = sk[3]; p[SKB] = sk[4];
    p[HL] = hr[0]; p[HM] = hr[1]; p[HD] = hr[2]; p[HX] = hr[3];
    p[CL] = spec.cloth || '#3f63d0';
    p[CM] = spec.clothMid || mix(spec.cloth || '#3f63d0', spec.clothDark || '#22366f', 0.55);
    p[CD] = spec.clothDark || '#22366f';
    p[ML] = '#dde3f0'; p[MM] = '#98a1b6'; p[MD] = '#5b6376';
    p[EW] = '#fbfcff'; p[EI] = ir[0]; p[EP] = ir[1];
    p[AC] = spec.accent || '#e8c46a';
    p[ACD] = shadeHex(spec.accent || '#e8c46a', -0.38);
    p[LP] = '#b4646a'; p[LPD] = '#7c3d46';
    return p;
  }

  function hexToRgb(h) {
    h = h.replace('#', '');
    return [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16)];
  }
  function toHex(r) {
    return '#' + r.map(function (v) {
      v = Math.max(0, Math.min(255, Math.round(v)));
      return (v < 16 ? '0' : '') + v.toString(16);
    }).join('');
  }
  function mix(a, b, t) {
    var A = hexToRgb(a), B = hexToRgb(b);
    return toHex([A[0] + (B[0] - A[0]) * t, A[1] + (B[1] - A[1]) * t, A[2] + (B[2] - A[2]) * t]);
  }
  function shadeHex(h, amt) {
    var c = hexToRgb(h);
    return toHex([c[0] * (1 + amt), c[1] * (1 + amt), c[2] * (1 + amt)]);
  }

  /* ---------------- the cast ---------------- */

  var CAST = {
    seren:  { skin:'fair', hair:'long',     hairColour:'auburn', eyeColour:'green', gear:'circlet',
              cloth:'#3f63d0', clothDark:'#22366f', accent:'#e8c46a', lashes:true, brow:'high', pauldron:true },
    dorn:   { skin:'tan',  hair:'balding',  hairColour:'grey',   eyeColour:'grey',  gear:'helm',
              cloth:'#4d5a86', clothDark:'#2e3550', accent:'#a8acb8',
              beard:'full', brow:'angry', jaw:'square', mouth:'frown', pauldron:true },
    mira:   { skin:'warm', hair:'bob',      hairColour:'brown',  eyeColour:'brown', gear:'cowl',
              cloth:'#e6e2d4', clothDark:'#b9b3a0', accent:'#7fb7c8', lashes:true, mouth:'smirk' },
    bram:   { skin:'fair', hair:'short',    hairColour:'sandy',  eyeColour:'blue',  gear:'none',
              cloth:'#3f63d0', clothDark:'#22366f', accent:'#e8c46a', brow:'high', pauldron:true },
    rook:   { skin:'tan',  hair:'wild',     hairColour:'black',  eyeColour:'amber', gear:'hood',
              cloth:'#4a4a58', clothDark:'#2b2b36', accent:'#8a7a4a', mouth:'smirk', beard:'stubble' },
    edran:  { skin:'tan',  hair:'short',    hairColour:'grey',   eyeColour:'grey',  gear:'none',
              cloth:'#7a5a3a', clothDark:'#4e3a26', accent:'#b08a54',
              beard:'stubble', scar:true, brow:'angry', jaw:'square', mouth:'frown', pauldron:true },
    nessa:  { skin:'fair', hair:'ponytail', hairColour:'red',    eyeColour:'green', gear:'headband',
              cloth:'#4a7a45', clothDark:'#2d4f2a', accent:'#c2a35a', freckles:true, lashes:true, mouth:'smirk' },
    cass:   { skin:'pale', hair:'long',     hairColour:'black',  eyeColour:'blue',  gear:'none',
              cloth:'#3a3550', clothDark:'#231f33', accent:'#9a6ac0', lashes:true, brow:'angry', mouth:'frown' },
    ilya:   { skin:'fair', hair:'ponytail', hairColour:'blonde', eyeColour:'blue',  gear:'circlet',
              cloth:'#dfe4f2', clothDark:'#a9b2ca', accent:'#e8c46a', lashes:true, brow:'high', pauldron:true },
    petra:  { skin:'warm', hair:'braid',    hairColour:'brown',  eyeColour:'violet', gear:'cowl',
              cloth:'#7a4a9a', clothDark:'#4e2d66', accent:'#e8c46a', lashes:true, brow:'high' },
    garrick:{ skin:'deep', hair:'bald',     hairColour:'black',  eyeColour:'brown', gear:'none',
              cloth:'#6b5030', clothDark:'#42301c', accent:'#b08a54',
              beard:'full', jaw:'square', brow:'angry', pauldron:true },

    /* bosses */
    gorr:    { skin:'tan',  hair:'wild',   hairColour:'red',    eyeColour:'amber', gear:'none',
               cloth:'#7a3028', clothDark:'#4a1c18', accent:'#c07a3a',
               beard:'full', scar:true, brow:'angry', jaw:'square', mouth:'frown' },
    halvard: { skin:'fair', hair:'short',  hairColour:'black',  eyeColour:'grey',  gear:'helm',
               cloth:'#8a3a34', clothDark:'#57221e', accent:'#c6cede',
               brow:'angry', jaw:'square', mouth:'frown', pauldron:true },
    sirin:   { skin:'pale', hair:'short',  hairColour:'silver', eyeColour:'violet', gear:'circlet',
               cloth:'#5a3a6a', clothDark:'#382344', accent:'#c6cede', lashes:true, brow:'angry' },

    draugh:  { skin:'fair', hair:'balding', hairColour:'grey', eyeColour:'grey',  gear:'helm',
               cloth:'#6a2f3c', clothDark:'#421c26', accent:'#c6b27a',
               beard:'stubble', brow:'angry', jaw:'square', mouth:'frown', pauldron:true },
    veyn:    { skin:'deep', hair:'bald',   hairColour:'black',  eyeColour:'brown', gear:'none',
               cloth:'#2f5a5e', clothDark:'#1b383b', accent:'#9ec7c2',
               beard:'goatee', jaw:'square', mouth:'frown', pauldron:true },
    strade:  { skin:'tan',  hair:'short',  hairColour:'grey',   eyeColour:'amber', gear:'circlet',
               cloth:'#6a2f3c', clothDark:'#421c26', accent:'#d8b45a',
               beard:'full', scar:true, brow:'angry', jaw:'square', pauldron:true },
    /* the Kesk siblings share a face: same skin, same black hair, same eyes */
    ivane:   { skin:'pale', hair:'braid',  hairColour:'black',  eyeColour:'violet', gear:'none',
               cloth:'#3c3f66', clothDark:'#23253f', accent:'#c0a0e0', lashes:true, brow:'high', collar:'plain' },
    dravan:  { skin:'pale', hair:'long',   hairColour:'black',  eyeColour:'violet', gear:'circlet',
               cloth:'#3a2350', clothDark:'#211430', accent:'#d8b45a',
               beard:'goatee', brow:'angry', jaw:'square', pauldron:true },

    /* story faces with no unit */
    alaric:  { skin:'tan',  hair:'balding', hairColour:'grey',  eyeColour:'brown', gear:'circlet',
               cloth:'#3f63d0', clothDark:'#22366f', accent:'#e8c46a',
               beard:'full', jaw:'square', pauldron:true },
    villager:{ skin:'warm', hair:'short',  hairColour:'brown',  eyeColour:'brown', gear:'none',
               cloth:'#8a7a5a', clothDark:'#5a4e38', accent:'#a09070', collar:'plain' },
    steward: { skin:'fair', hair:'balding', hairColour:'grey',  eyeColour:'grey',  gear:'none',
               cloth:'#5a5a6a', clothDark:'#3a3a46', accent:'#a8acb8', beard:'goatee', collar:'plain' }
  };

  /* generic faces for nameless enemies, by class */
  var BY_CLASS = {
    brigand:  { skin:'tan',  hair:'wild',    hairColour:'black', eyeColour:'brown', gear:'none', beard:'full', brow:'angry', jaw:'square', mouth:'frown' },
    bandit:   { skin:'tan',  hair:'wild',    hairColour:'red',   eyeColour:'amber', gear:'none', beard:'full', brow:'angry', jaw:'square', mouth:'frown' },
    soldier:  { skin:'fair', hair:'short',   hairColour:'brown', eyeColour:'grey',  gear:'helm', brow:'angry' },
    knight:   { skin:'fair', hair:'short',   hairColour:'grey',  eyeColour:'grey',  gear:'helm', jaw:'square', brow:'angry', pauldron:true },
    archer:   { skin:'warm', hair:'short',   hairColour:'sandy', eyeColour:'green', gear:'headband' },
    mercenary:{ skin:'tan',  hair:'short',   hairColour:'brown', eyeColour:'brown', gear:'none', beard:'stubble', jaw:'square' },
    myrmidon: { skin:'pale', hair:'ponytail', hairColour:'black', eyeColour:'blue', gear:'headband', brow:'angry' },
    fighter:  { skin:'deep', hair:'bald',    hairColour:'black', eyeColour:'brown', gear:'none', beard:'full', jaw:'square' },
    cavalier: { skin:'fair', hair:'short',   hairColour:'sandy', eyeColour:'blue',  gear:'helm', pauldron:true },
    mage:     { skin:'pale', hair:'bob',     hairColour:'silver', eyeColour:'violet', gear:'cowl' },
    shaman:   { skin:'pale', hair:'long',    hairColour:'black', eyeColour:'violet', gear:'hood', brow:'angry' },
    cleric:   { skin:'warm', hair:'bob',     hairColour:'brown', eyeColour:'brown', gear:'cowl', lashes:true },
    wyvernrider:{ skin:'tan', hair:'short',  hairColour:'black', eyeColour:'amber', gear:'helm', brow:'angry', pauldron:true }
  };

  var FACTION_CLOTH = {
    player: ['#3f63d0', '#22366f'],
    enemy:  ['#8a3a34', '#57221e'],
    npc:    ['#3aa8a0', '#1d5f5b'],
    boss:   ['#7a3a9a', '#4a2160']
  };

  /* ---------------- public ---------------- */

  var cache = {};

  function specFor(key, clsKey, faction) {
    var base = CAST[key];
    if (!base) {
      base = BY_CLASS[clsKey] || BY_CLASS.soldier;
      var fc = FACTION_CLOTH[faction] || FACTION_CLOTH.enemy;
      base = Object.assign({}, base, { cloth: fc[0], clothDark: fc[1], accent: '#c6cede' });
    }
    return base;
  }

  /* key: a unit id (seren), a story name (alaric), or null for a generic */
  FE.portrait = function (key, clsKey, faction, scale) {
    scale = scale || 3;
    var id = (key || '') + '|' + clsKey + '|' + faction + '|' + scale;
    if (cache[id]) return cache[id];

    var spec = specFor(key, clsKey, faction);
    var b = draw(spec);
    var pal = palette(spec);

    var cv = document.createElement('canvas');
    cv.width = W * scale;
    cv.height = H * scale;
    var g = cv.getContext('2d');
    g.imageSmoothingEnabled = false;

    for (var y = 0; y < H; y++) {
      for (var x = 0; x < W; x++) {
        var i = b.get(x, y);
        if (i === T) continue;
        var col = pal[i];
        if (!col) continue;
        g.fillStyle = col;
        g.fillRect(x * scale, y * scale, scale, scale);
      }
    }
    cache[id] = cv;
    return cv;
  };

  FE.hasPortrait = function (key) { return !!CAST[key]; };
  FE.PORTRAIT_W = W;
  FE.PORTRAIT_H = H;
  FE.clearPortraitCache = function () { cache = {}; };

})(window.FE = window.FE || {});
