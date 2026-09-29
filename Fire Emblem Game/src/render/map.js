/* ------------------------------------------------------------------
   MAP RENDERER
   Canvas draw of terrain, overlays, units, HP bars and floating text.
   Camera pans and zooms; on a phone the map is bigger than the screen
   and that is the whole point, so pinch-zoom is built in from the start.
------------------------------------------------------------------ */
(function (FE) {
  'use strict';

  var R = {
    canvas: null, g: null,
    tile: 32,
    camX: 0, camY: 0,
    zoom: 1,
    minZoom: 0.5, maxZoom: 2.5,
    anim: 0,
    popups: [],
    moveAnim: null,
    shake: 0
  };

  FE.R = R;

  FE.initRenderer = function (canvas) {
    R.canvas = canvas;
    R.g = canvas.getContext('2d');
    R.g.imageSmoothingEnabled = false;
  };

  FE.resizeCanvas = function () {
    var c = R.canvas;
    if (!c) return;
    var dpr = Math.min(window.devicePixelRatio || 1, 2);
    var w = c.clientWidth, h = c.clientHeight;
    c.width = Math.floor(w * dpr);
    c.height = Math.floor(h * dpr);
    R.g.setTransform(dpr, 0, 0, dpr, 0, 0);
    R.g.imageSmoothingEnabled = false;
    R.viewW = w; R.viewH = h;
  };

  FE.tileSize = function () { return Math.round(R.tile * R.zoom); };

  FE.clampCamera = function (state) {
    var ts = FE.tileSize();
    var mapW = state.map.w * ts, mapH = state.map.h * ts;
    if (mapW <= R.viewW) R.camX = (mapW - R.viewW) / 2;
    else R.camX = Math.max(0, Math.min(mapW - R.viewW, R.camX));
    if (mapH <= R.viewH) R.camY = (mapH - R.viewH) / 2;
    else R.camY = Math.max(0, Math.min(mapH - R.viewH, R.camY));
  };

  FE.centerOn = function (state, x, y) {
    var ts = FE.tileSize();
    R.camX = x * ts + ts / 2 - R.viewW / 2;
    R.camY = y * ts + ts / 2 - R.viewH / 2;
    FE.clampCamera(state);
  };

  FE.ensureVisible = function (state, x, y) {
    var ts = FE.tileSize();
    var px = x * ts, py = y * ts;
    var pad = ts * 2;
    if (px - R.camX < pad) R.camX = px - pad;
    if (px - R.camX > R.viewW - pad - ts) R.camX = px - R.viewW + pad + ts;
    if (py - R.camY < pad) R.camY = py - pad;
    if (py - R.camY > R.viewH - pad - ts) R.camY = py - R.viewH + pad + ts;
    FE.clampCamera(state);
  };

  FE.screenToTile = function (sx, sy) {
    var ts = FE.tileSize();
    return { x: Math.floor((sx + R.camX) / ts), y: Math.floor((sy + R.camY) / ts) };
  };

  FE.addPopup = function (x, y, text, color, delay) {
    R.popups.push({ x: x, y: y, text: text, color: color || '#fff', t: -(delay || 0), life: 46 });
  };

  /* ---------------- draw ---------------- */

  FE.draw = function (state, ui) {
    var g = R.g;
    if (!g || !state) return;
    var ts = FE.tileSize();
    R.anim++;

    g.fillStyle = '#0b0d14';
    g.fillRect(0, 0, R.viewW, R.viewH);

    var sh = 0;
    if (R.shake > 0) { sh = (R.anim % 2 ? 1 : -1) * Math.min(3, R.shake); R.shake--; }

    var x0 = Math.max(0, Math.floor(R.camX / ts));
    var y0 = Math.max(0, Math.floor(R.camY / ts));
    var x1 = Math.min(state.map.w - 1, Math.ceil((R.camX + R.viewW) / ts));
    var y1 = Math.min(state.map.h - 1, Math.ceil((R.camY + R.viewH) / ts));

    var ox = -R.camX + sh, oy = -R.camY;

    /* terrain */
    for (var y = y0; y <= y1; y++) {
      for (var x = x0; x <= x1; x++) {
        var t = state.map.tiles[y][x];
        if (t === 'door' && state.openedDoors[FE.posKey(x, y)]) t = 'floor';
        if (t === 'chest' && state.openedChests[FE.posKey(x, y)]) t = 'floor';
        if (t === 'village') {
          var v = FE.villageAt(state, x, y);
          if (v && v.done) t = 'ruin';
        }
        g.drawImage(FE.tileCanvas(t, x, y, 1), Math.round(x * ts + ox), Math.round(y * ts + oy), ts, ts);
      }
    }

    /* movement / attack / danger overlays */
    if (ui.overlay) {
      for (var k in ui.overlay) {
        var p = k.split(','), px = +p[0], py = +p[1];
        if (px < x0 - 1 || px > x1 + 1 || py < y0 - 1 || py > y1 + 1) continue;
        var kind = ui.overlay[k];
        g.fillStyle = kind === 'move' ? 'rgba(70,120,235,0.42)'
          : kind === 'attack' ? 'rgba(220,60,50,0.42)'
            : kind === 'staff' ? 'rgba(90,210,140,0.42)'
              : 'rgba(235,70,60,0.26)';
        g.fillRect(Math.round(px * ts + ox), Math.round(py * ts + oy), ts, ts);
      }
    }

    /* path preview */
    if (ui.path && ui.path.length > 1) {
      g.strokeStyle = 'rgba(255,240,140,0.95)';
      g.lineWidth = Math.max(2, ts * 0.12);
      g.lineJoin = 'round'; g.lineCap = 'round';
      g.beginPath();
      ui.path.forEach(function (pt, i) {
        var cx = pt.x * ts + ox + ts / 2, cy = pt.y * ts + oy + ts / 2;
        if (i === 0) g.moveTo(cx, cy); else g.lineTo(cx, cy);
      });
      g.stroke();
    }

    /* fog */
    if (state.fogOn) {
      for (var fy = y0; fy <= y1; fy++) {
        for (var fx = x0; fx <= x1; fx++) {
          if (FE.isVisible(state, fx, fy)) continue;
          g.fillStyle = 'rgba(6,8,16,0.72)';
          g.fillRect(Math.round(fx * ts + ox), Math.round(fy * ts + oy), ts, ts);
        }
      }
    }

    /* units */
    var order = state.units.slice().sort(function (a, b) { return a.y - b.y; });
    order.forEach(function (u) {
      if (!u.alive) return;
      if (!FE.unitVisible(state, u)) return;
      var ux = u.x, uy = u.y;
      if (R.moveAnim && R.moveAnim.unit === u.uid) { ux = R.moveAnim.x; uy = R.moveAnim.y; }
      if (ux < x0 - 2 || ux > x1 + 2 || uy < y0 - 2 || uy > y1 + 2) return;

      var dx = Math.round(ux * ts + ox), dy = Math.round(uy * ts + oy);
      var fac = u.boss ? 'boss' : u.faction;
      if (u.recruitable && u.faction === 'enemy') fac = 'npc';

      /* greyed out when finished */
      var done = (u.faction === 'player' && u.acted);
      var frame = done ? 0 : (Math.floor(R.anim / 26) % 2);
      var spr = FE.spriteCanvas(u.cls, fac, 1, frame);

      /* shadow */
      g.fillStyle = 'rgba(0,0,0,0.25)';
      g.beginPath();
      g.ellipse(dx + ts / 2, dy + ts * 0.9, ts * 0.28, ts * 0.1, 0, 0, Math.PI * 2);
      g.fill();

      if (done) g.globalAlpha = 0.55;
      g.drawImage(spr, dx, dy - Math.round(ts * 0.12), ts, ts);
      g.globalAlpha = 1;

      /* selection ring */
      if (ui.selected === u.uid) {
        g.strokeStyle = '#ffe680';
        g.lineWidth = Math.max(2, ts * 0.07);
        g.strokeRect(dx + 1, dy + 1, ts - 2, ts - 2);
      }

      /* HP bar */
      var bw = ts * 0.74, bh = Math.max(3, ts * 0.09);
      var bx = dx + (ts - bw) / 2, by = dy + ts - bh - 1;
      g.fillStyle = 'rgba(0,0,0,0.7)';
      g.fillRect(bx - 1, by - 1, bw + 2, bh + 2);
      var frac = Math.max(0, u.hp / u.maxhp);
      g.fillStyle = u.faction === 'player' ? '#4fd06a' : (fac === 'npc' ? '#3aa8a0' : '#e0544a');
      g.fillRect(bx, by, bw * frac, bh);

      /* markers */
      if (u.boss) { g.fillStyle = '#ffd34d'; g.fillRect(dx + ts - 7, dy + 2, 5, 5); }
      if (u.recruitable && u.faction === 'enemy') { g.fillStyle = '#7ef0e0'; g.fillRect(dx + 2, dy + 2, 5, 5); }
    });

    /* objective markers */
    (state.villages || []).forEach(function (v) {
      if (v.done) return;
      var vx = Math.round(v.x * ts + ox), vy = Math.round(v.y * ts + oy);
      var pulse = 0.5 + 0.5 * Math.sin(R.anim / 16);
      g.strokeStyle = 'rgba(120,230,160,' + (0.4 + pulse * 0.5) + ')';
      g.lineWidth = 2;
      g.strokeRect(vx + 2, vy + 2, ts - 4, ts - 4);
    });
    (state.chests || []).forEach(function (c) {
      if (c.done) return;
      var cx = Math.round(c.x * ts + ox), cy = Math.round(c.y * ts + oy);
      var pulse = 0.5 + 0.5 * Math.sin(R.anim / 16 + 1);
      g.strokeStyle = 'rgba(240,210,110,' + (0.4 + pulse * 0.5) + ')';
      g.lineWidth = 2;
      g.strokeRect(cx + 2, cy + 2, ts - 4, ts - 4);
    });

    /* cursor */
    if (ui.cursor) {
      var cx2 = Math.round(ui.cursor.x * ts + ox), cy2 = Math.round(ui.cursor.y * ts + oy);
      g.strokeStyle = '#ffffff';
      g.lineWidth = 2;
      var wob = Math.sin(R.anim / 12) * 1.5;
      g.strokeRect(cx2 + 1 - wob, cy2 + 1 - wob, ts - 2 + wob * 2, ts - 2 + wob * 2);
    }

    /* floating damage text */
    R.popups = R.popups.filter(function (p) {
      p.t++;
      if (p.t < 0) return true;
      if (p.t > p.life) return false;
      var a = p.t > p.life - 12 ? (p.life - p.t) / 12 : 1;
      var rise = Math.min(p.t, 22) * 0.9;
      var px2 = p.x * ts + ox + ts / 2;
      var py2 = p.y * ts + oy + ts * 0.3 - rise;
      g.save();
      g.globalAlpha = a;
      g.font = 'bold ' + Math.round(ts * 0.52) + 'px ui-monospace, Menlo, monospace';
      g.textAlign = 'center';
      g.lineWidth = 4;
      g.strokeStyle = 'rgba(0,0,0,0.85)';
      g.strokeText(p.text, px2, py2);
      g.fillStyle = p.color;
      g.fillText(p.text, px2, py2);
      g.restore();
      return true;
    });
  };

  FE.villageAt = function (state, x, y) {
    var out = null;
    (state.villages || []).forEach(function (v) { if (v.x === x && v.y === y) out = v; });
    return out;
  };
  FE.chestAt = function (state, x, y) {
    var out = null;
    (state.chests || []).forEach(function (c) { if (c.x === x && c.y === y) out = c; });
    return out;
  };

})(window.FE = window.FE || {});
