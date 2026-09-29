/* ------------------------------------------------------------------
   BATTLE SCENE
   A side-view bout: the two fighters face off and trade blows, driven by
   the combat log the engine already produced. Nothing here decides the
   outcome — it is a replay, so what you watch is exactly what happened.

   Used by the arena and by every attack you initiate on the map. The
   backdrop is painted from the terrain the defender is standing on, so
   the duel reads as the same fight rather than a cutaway to nowhere.
------------------------------------------------------------------ */
(function (FE) {
  'use strict';

  var W = 320, H = 150;                 /* logical size, scaled up on draw */
  var GROUND = 116;
  var HOME_L = 78, HOME_R = 242;

  function ease(t) { return t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2; }

  /* deterministic scatter so backdrops do not shimmer between frames */
  function hash(i, salt) {
    var h = (i * 374761393 + salt * 668265263) >>> 0;
    h = (h ^ (h >>> 13)) * 1274126177 >>> 0;
    return (h ^ (h >>> 16)) >>> 0;
  }

  /* ---------------- backdrops ---------------- */

  function sky(g, top, bottom) {
    var grad = g.createLinearGradient(0, 0, 0, 76);
    grad.addColorStop(0, top);
    grad.addColorStop(1, bottom);
    g.fillStyle = grad;
    g.fillRect(-4, 0, W + 8, 80);
  }

  function ground(g, near, far, speckle) {
    g.fillStyle = far; g.fillRect(-4, 72, W + 8, 10);
    g.fillStyle = near; g.fillRect(-4, 80, W + 8, H - 80);
    g.fillStyle = speckle;
    for (var s = 0; s < 80; s++) {
      var hv = hash(s, 7);
      g.fillRect((hv % (W + 8)) - 4, 84 + ((hv >>> 8) % (H - 88)), 2, 1);
    }
  }

  var SCENES = {
    plain: function (g) {
      sky(g, '#4a6a9e', '#8fb0c8');
      ground(g, '#6aa04a', '#588a3e', '#7cb457');
      /* a few distant hills */
      g.fillStyle = '#4d7a3c';
      for (var i = 0; i < 4; i++) {
        var hx = i * 92 - 30;
        g.beginPath(); g.ellipse(hx, 80, 46, 16, 0, 0, Math.PI * 2); g.fill();
      }
    },
    forest: function (g) {
      sky(g, '#2c4a3a', '#5e8464');
      g.fillStyle = '#23522a';
      for (var i = 0; i < 12; i++) {
        var tx = i * 29 - 10, th = 30 + (hash(i, 3) % 22);
        g.fillRect(tx, 76 - th, 10, th);
        g.beginPath(); g.ellipse(tx + 5, 76 - th, 16, 13, 0, 0, Math.PI * 2); g.fill();
      }
      g.fillStyle = '#2f6b33';
      for (var j = 0; j < 8; j++) {
        var bx = j * 43 - 8;
        g.beginPath(); g.ellipse(bx, 70, 20, 15, 0, 0, Math.PI * 2); g.fill();
      }
      ground(g, '#4f7a3c', '#3d6029', '#5e8c48');
    },
    hill: function (g) {
      sky(g, '#54709e', '#9fbcd0');
      g.fillStyle = '#4a7534';
      g.beginPath(); g.ellipse(70, 96, 90, 34, 0, 0, Math.PI * 2); g.fill();
      g.beginPath(); g.ellipse(250, 100, 80, 30, 0, 0, Math.PI * 2); g.fill();
      ground(g, '#6aa04a', '#588a3e', '#7cb457');
    },
    mountain: function (g) {
      sky(g, '#3f4f70', '#8d9cb4');
      g.fillStyle = '#6d685d';
      for (var i = 0; i < 5; i++) {
        var mx = i * 76 - 20;
        g.beginPath();
        g.moveTo(mx, 80); g.lineTo(mx + 38, 20 + (hash(i, 9) % 14)); g.lineTo(mx + 76, 80);
        g.closePath(); g.fill();
      }
      g.fillStyle = '#a8a294';
      for (var j = 0; j < 5; j++) {
        var px = j * 76 - 20;
        g.beginPath();
        g.moveTo(px + 26, 42); g.lineTo(px + 38, 20 + (hash(j, 9) % 14)); g.lineTo(px + 50, 42);
        g.closePath(); g.fill();
      }
      ground(g, '#8b8577', '#6d685d', '#a8a294');
    },
    stone: function (g) {          /* fort, gate, throne */
      sky(g, '#2a2f42', '#4a5268');
      g.fillStyle = '#767c8a'; g.fillRect(-4, 20, W + 8, 58);
      g.fillStyle = '#9aa0ae';
      for (var y = 0; y < 3; y++) {
        for (var x = 0; x < 12; x++) {
          g.fillRect(x * 28 + (y % 2 ? 14 : 0) - 4, 22 + y * 19, 26, 17);
        }
      }
      g.fillStyle = '#5a5f6d';
      for (var c = 0; c < 8; c++) g.fillRect(c * 42 - 4, 14, 20, 8);
      ground(g, '#b3a88e', '#8f8672', '#cfc5ab');
    },
    interior: function (g) {
      g.fillStyle = '#2a2436'; g.fillRect(-4, 0, W + 8, 80);
      g.fillStyle = '#767c8a'; g.fillRect(-4, 16, W + 8, 62);
      g.fillStyle = '#9aa0ae';
      for (var i = 0; i < 6; i++) g.fillRect(i * 56 + 6, 22, 34, 50);
      g.fillStyle = '#40444f';
      for (var p = 0; p < 4; p++) g.fillRect(p * 84 + 30, 16, 12, 62);
      ground(g, '#cfc5ab', '#b3a88e', '#e0d8c2');
    },
    village: function (g) {
      sky(g, '#4a6a9e', '#9fb8c8');
      g.fillStyle = '#8a5a32';
      g.fillRect(16, 38, 60, 40);
      g.fillRect(210, 44, 66, 34);
      g.fillStyle = '#b2503c';
      g.beginPath(); g.moveTo(8, 40); g.lineTo(46, 16); g.lineTo(84, 40); g.closePath(); g.fill();
      g.beginPath(); g.moveTo(202, 46); g.lineTo(243, 22); g.lineTo(284, 46); g.closePath(); g.fill();
      g.fillStyle = '#6b4526';
      g.fillRect(38, 56, 16, 22); g.fillRect(236, 60, 16, 18);
      ground(g, '#6aa04a', '#588a3e', '#7cb457');
    },
    water: function (g) {
      sky(g, '#4a6a9e', '#a8c4d8');
      g.fillStyle = '#3f74c0'; g.fillRect(-4, 62, W + 8, 24);
      g.fillStyle = '#6699d8';
      for (var i = 0; i < 14; i++) g.fillRect((i * 37) % (W + 8) - 4, 66 + (i % 4) * 5, 14, 2);
      g.fillStyle = '#6b4526'; g.fillRect(-4, 84, W + 8, 8);
      g.fillStyle = '#8a5a32'; g.fillRect(-4, 86, W + 8, 5);
      for (var b2 = 0; b2 < 20; b2++) g.fillStyle = '#6b4526', g.fillRect(b2 * 17 - 4, 86, 2, 5);
      ground(g, '#8a5a32', '#6b4526', '#a07040');
      g.fillStyle = '#6b4526'; g.fillRect(-4, 92, W + 8, 2);
    },
    arena: function (g) {
      g.fillStyle = '#2a2436'; g.fillRect(-4, 0, W + 8, 62);
      for (var i = 0; i < 90; i++) {
        var hx = (i * 73) % (W + 8) - 4, hy = 10 + ((i * 37) % 44);
        g.fillStyle = ['#463b55', '#3b3247', '#524465', '#332c3f'][(i * 13) % 4];
        g.fillRect(hx, hy, 4, 4);
      }
      g.fillStyle = '#6d685d'; g.fillRect(-4, 62, W + 8, 14);
      g.fillStyle = '#8b8577'; g.fillRect(-4, 62, W + 8, 3);
      for (var b = -4; b < W + 8; b += 16) { g.fillStyle = '#57534a'; g.fillRect(b, 66, 1, 10); }
      ground(g, '#b08a54', '#977142', '#c49a62');
      g.fillStyle = 'rgba(0,0,0,0.12)'; g.fillRect(W / 2 - 1, 78, 2, H - 78);
    }
  };

  /* terrain key -> backdrop */
  var TERRAIN_SCENE = {
    plain: 'plain', road: 'plain', ruin: 'plain',
    forest: 'forest', thicket: 'forest',
    hill: 'hill',
    mountain: 'mountain', peak: 'mountain', cliff: 'mountain',
    fort: 'stone', gate: 'stone', throne: 'stone', wall: 'stone',
    floor: 'interior', pillar: 'interior', door: 'interior', chest: 'interior',
    village: 'village', house: 'village', armory: 'village', vendor: 'village',
    water: 'water', river: 'water', bridge: 'water',
    arena: 'arena'
  };
  FE.sceneForTerrain = function (t) { return TERRAIN_SCENE[t] || 'plain'; };

  function drawScene(g, shake, scene) {
    g.save();
    g.translate(shake, 0);
    (SCENES[scene] || SCENES.plain)(g);
    g.restore();
  }

  /* ---------------- fighters ---------------- */

  function drawFighter(g, spr, x, facingRight, bob, dim) {
    var size = 64;
    g.save();
    g.fillStyle = 'rgba(0,0,0,0.28)';
    g.beginPath();
    g.ellipse(x, GROUND + 2, 20, 6, 0, 0, Math.PI * 2);
    g.fill();
    g.translate(x, GROUND - size + 6 + bob);
    if (!facingRight) g.scale(-1, 1);
    if (dim) g.globalAlpha = 0.45;
    g.imageSmoothingEnabled = false;
    g.drawImage(spr, -size / 2, 0, size, size);
    g.restore();
  }

  function drawBar(g, x, y, w, name, hp, maxhp, right, colour) {
    var h = 7;
    g.save();
    g.font = 'bold 9px ui-monospace, Menlo, monospace';
    g.textAlign = right ? 'right' : 'left';
    g.fillStyle = 'rgba(0,0,0,0.75)';
    g.fillText(name, right ? x + w : x, y - 4);
    g.fillStyle = colour;
    g.fillText(name, right ? x + w - 0.5 : x + 0.5, y - 4.5);

    g.fillStyle = 'rgba(0,0,0,0.65)';
    g.fillRect(x - 1, y - 1, w + 2, h + 2);
    g.fillStyle = '#12161f';
    g.fillRect(x, y, w, h);
    var frac = Math.max(0, Math.min(1, hp / maxhp));
    g.fillStyle = frac < 0.25 ? '#e0544a' : (frac < 0.5 ? '#e8b23a' : '#4fd06a');
    g.fillRect(x, y, w * frac, h);
    g.fillStyle = 'rgba(255,255,255,0.22)';
    g.fillRect(x, y, w * frac, 2);

    g.font = '8px ui-monospace, Menlo, monospace';
    g.fillStyle = '#e8ecf5';
    g.fillText(Math.max(0, Math.ceil(hp)) + '/' + maxhp, right ? x + w : x, y + h + 8);
    g.restore();
  }

  /* ---------------- the player ---------------- */

  FE.playDuel = function (canvas, opts) {
    var g = canvas.getContext('2d');
    var you = opts.you, foe = opts.foe;
    var speed = opts.speed || 1;          /* <1 is faster */
    var scene = opts.scene || 'arena';
    var ranged = opts.distance && opts.distance > 1;

    var sprYou = FE.spriteCanvas(you.cls, you.faction || 'player', 1, 0);
    var sprFoe = FE.spriteCanvas(foe.cls, foe.faction || 'enemy', 1, 0);

    var steps = [];
    var hpYou = you.hp, hpFoe = foe.hp;
    steps.push({ kind: 'intro', dur: 420 * speed });

    (opts.log || []).forEach(function (ev) {
      if (ev.type === 'strike') {
        var youAttack = ev.attacker === opts.uidYou;
        var dmg = ev.miss ? 0 : ev.damage;
        if (!ev.miss) { if (youAttack) hpFoe -= dmg; else hpYou -= dmg; }
        steps.push({
          kind: 'strike',
          byYou: youAttack,
          miss: !!ev.miss,
          crit: !!ev.crit,
          damage: dmg,
          hpYou: Math.max(0, hpYou),
          hpFoe: Math.max(0, hpFoe),
          dur: (ev.crit ? 700 : (ev.miss ? 480 : 580)) * speed
        });
      } else if (ev.type === 'death') {
        steps.push({ kind: 'down', youDown: ev.unit === opts.uidYou, dur: 560 * speed });
      }
    });
    steps.push({ kind: 'outro', dur: 340 * speed });

    var si = 0, t0 = performance.now(), raf = null, done = false;
    var curHpYou = you.hp, curHpFoe = foe.hp;
    var shownHpYou = you.hp, shownHpFoe = foe.hp;
    var pops = [], shots = [];
    var downYou = false, downFoe = false;

    function finish() {
      if (done) return;
      done = true;
      if (raf) cancelAnimationFrame(raf);
      FE.duelSkip = null;
      if (opts.onDone) opts.onDone();
    }
    FE.duelSkip = finish;

    function frame(now) {
      if (done) return;
      var step = steps[si];
      if (!step) { finish(); return; }
      var p = Math.min(1, (now - t0) / step.dur);

      var shake = 0, lungeYou = 0, lungeFoe = 0, flash = 0;

      if (step.kind === 'strike') {
        var swing = p < 0.45 ? ease(p / 0.45) : 1 - ease((p - 0.45) / 0.55);
        if (ranged) {
          /* archers and mages hold position; the shot travels instead */
          if (step.byYou) lungeYou = swing * 8; else lungeFoe = -swing * 8;
        } else {
          var reach = step.miss ? 26 : 40;
          if (step.byYou) lungeYou = swing * reach; else lungeFoe = -swing * reach;
        }

        if (p >= 0.45 && !step._hit) {
          step._hit = true;
          if (ranged) {
            shots.push({ from: step.byYou ? HOME_L + 20 : HOME_R - 20, to: step.byYou ? HOME_R : HOME_L, t: 0 });
          }
          if (!step.miss) {
            curHpYou = step.hpYou; curHpFoe = step.hpFoe;
            pops.push({
              x: step.byYou ? HOME_R : HOME_L,
              text: step.crit ? step.damage + '!' : String(step.damage),
              colour: step.crit ? '#ffd24d' : '#ffffff',
              big: step.crit, t: 0
            });
            if (step.crit) FE.Sfx.crit(); else FE.Sfx.hit();
          } else {
            pops.push({ x: step.byYou ? HOME_R : HOME_L, text: 'MISS', colour: '#cdd3e2', big: false, t: 0 });
            FE.Sfx.miss();
          }
        }
        if (step._hit && !step.miss) {
          var since = (p - 0.45) / 0.55;
          if (step.crit) { shake = (1 - since) * 6 * (Math.random() > 0.5 ? 1 : -1); flash = Math.max(0, 0.55 - since); }
          else shake = (1 - since) * 2 * (Math.random() > 0.5 ? 1 : -1);
        }
      } else if (step.kind === 'intro') {
        lungeYou = -(1 - ease(p)) * 60;
        lungeFoe = (1 - ease(p)) * 60;
      } else if (step.kind === 'down') {
        if (step.youDown) downYou = true; else downFoe = true;
      }

      shownHpYou += (curHpYou - shownHpYou) * 0.22;
      shownHpFoe += (curHpFoe - shownHpFoe) * 0.22;
      if (Math.abs(shownHpYou - curHpYou) < 0.3) shownHpYou = curHpYou;
      if (Math.abs(shownHpFoe - curHpFoe) < 0.3) shownHpFoe = curHpFoe;

      var scale = canvas.width / W;
      g.setTransform(scale, 0, 0, scale, 0, 0);
      g.imageSmoothingEnabled = false;
      g.clearRect(0, 0, W, H);
      drawScene(g, shake, scene);

      var bobYou = downYou ? 10 : Math.sin(now / 260) * 1.2;
      var bobFoe = downFoe ? 10 : Math.sin(now / 240 + 1) * 1.2;
      drawFighter(g, sprYou, HOME_L + lungeYou, true, bobYou, downYou);
      drawFighter(g, sprFoe, HOME_R + lungeFoe, false, bobFoe, downFoe);

      /* arrows and bolts in flight */
      shots = shots.filter(function (sh) {
        sh.t += 0.16 / speed;
        if (sh.t > 1) return false;
        var sx = sh.from + (sh.to - sh.from) * sh.t;
        g.fillStyle = '#f0e6c8';
        g.fillRect(sx - 5, GROUND - 34, 10, 2);
        g.fillStyle = '#c8b88a';
        g.fillRect(sx + (sh.to > sh.from ? 4 : -6), GROUND - 35, 3, 4);
        return true;
      });

      if (flash > 0) {
        g.fillStyle = 'rgba(255,255,255,' + flash.toFixed(3) + ')';
        g.fillRect(0, 0, W, H);
      }

      drawBar(g, 12, 12, 104, you.name, shownHpYou, you.maxhp, false, '#9dc0ff');
      drawBar(g, W - 12 - 104, 12, 104, foe.name, shownHpFoe, foe.maxhp, true, '#ffa196');

      pops = pops.filter(function (pp) {
        pp.t += 16;
        if (pp.t > 900 * speed) return false;
        var rise = Math.min(pp.t, 420) / 420 * 26;
        var alpha = pp.t > 640 * speed ? 1 - (pp.t - 640 * speed) / (260 * speed) : 1;
        g.save();
        g.globalAlpha = Math.max(0, alpha);
        g.font = 'bold ' + (pp.big ? 22 : 16) + 'px ui-monospace, Menlo, monospace';
        g.textAlign = 'center';
        g.lineWidth = 4;
        g.strokeStyle = 'rgba(0,0,0,0.85)';
        g.strokeText(pp.text, pp.x, 78 - rise);
        g.fillStyle = pp.colour;
        g.fillText(pp.text, pp.x, 78 - rise);
        g.restore();
        return true;
      });

      if (step.crit && step._hit && p < 0.8) {
        g.save();
        g.font = 'bold 13px ui-monospace, Menlo, monospace';
        g.textAlign = 'center';
        g.lineWidth = 4;
        g.strokeStyle = 'rgba(0,0,0,0.85)';
        g.strokeText('CRITICAL', W / 2, 100);
        g.fillStyle = '#ffd24d';
        g.fillText('CRITICAL', W / 2, 100);
        g.restore();
      }

      if (p >= 1) {
        si++;
        t0 = now;
        if (si >= steps.length) { setTimeout(finish, 200 * speed); return; }
      }
      raf = requestAnimationFrame(frame);
    }

    raf = requestAnimationFrame(frame);
    return { stop: finish };
  };

  FE.DUEL_W = W;
  FE.DUEL_H = H;

})(window.FE = window.FE || {});
