/* ------------------------------------------------------------------
   GAME CONTROLLER
------------------------------------------------------------------ */
(function (FE) {
  'use strict';

  var UI, $, el, clear;

  var G = {
    campaign: null,
    state: null,
    scene: 'title',
    mode: 'idle',
    cursor: { x: 0, y: 0 },
    selected: null,
    selectedUnit: null,
    overlay: null,
    path: null,
    reach: null,
    stand: null,
    danger: false,
    busy: false,
    pendingTarget: null,
    deploy: [],
    dialogQueue: null,
    dialogDone: null,
    lastGains: null
  };
  FE.G = G;

  var SAVE_KEY = 'sundered-crown-save-v1';

  /* The battle currently being prepared or played. Normally this is just the
     campaign's next chapter, but a skirmish or a Spire floor is a chapter-shaped
     object that was built a second ago, so everything downstream reads it from
     here rather than looking it up by index. */
  function curChapter() {
    return G.chapter || FE.CHAPTERS[G.campaign.chapterIndex];
  }
  var ANIM_KEY = 'sundered-crown-anim';

  /* Full / Fast / Off. Animations play only for attacks YOU start — the enemy
     phase stays on the map, because eight enemies each cutting to a scene is
     the thing that makes people switch animations off in the first place. */
  function animMode() {
    try {
      var v = localStorage.getItem(ANIM_KEY);
      if (v === 'off' || v === 'fast' || v === 'full') return v;
    } catch (e) { }
    return 'full';
  }
  function setAnimMode(v) {
    try { localStorage.setItem(ANIM_KEY, v); } catch (e) { }
  }
  function animSpeed() { return animMode() === 'fast' ? 0.55 : 1; }
  FE.animMode = animMode;

  /* ================= boot ================= */

  function boot() {
    UI = FE.UI; $ = UI.$; el = UI.el; clear = UI.clear;
    FE.initRenderer($('map'));
    FE.resizeCanvas();
    window.addEventListener('resize', syncCanvas);
    /* The canvas lives in a flex box whose height changes whenever the battle
       chrome appears, the HUD wraps, or the phone rotates. If the backing store
       is not resynced the browser scales the canvas to fit its CSS box and every
       click lands a tile or two off. Watch the box itself. */
    if (window.ResizeObserver) {
      new ResizeObserver(syncCanvas).observe($('map-wrap'));
    }
    bindInput();
    bindToolbar();
    showTitle();
    requestAnimationFrame(loop);
  }

  function syncCanvas() {
    var wrap = $('map-wrap');
    if (!wrap) return;
    var w = Math.round(wrap.clientWidth), h = Math.round(wrap.clientHeight);
    if (!w || !h) return;
    if (w === FE.R.viewW && h === FE.R.viewH) return;
    FE.resizeCanvas();
    if (G.state) FE.clampCamera(G.state);
  }

  function loop() {
    if (G.state && (G.scene === 'battle')) {
      FE.draw(G.state, { cursor: G.cursor, selected: G.selected, overlay: G.overlay, path: G.path });
    }
    requestAnimationFrame(loop);
  }

  /* ================= title ================= */

  function showTitle() {
    G.scene = 'title';
    var m = UI.modal(null, true);
    m._box.classList.add('title-box');
    var b = m._body;

    b.appendChild(el('div', 'title-main', FE.STORY.title));
    b.appendChild(el('div', 'title-sub', FE.STORY.subtitle));

    var saved = loadSaveMeta();
    var btns = el('div', 'title-btns');

    btns.appendChild(UI.button('New Campaign', 'primary', function () {
      closeModal(m);
      chooseDifficulty();
    }));
    if (saved) {
      btns.appendChild(UI.button('Continue — Chapter ' + saved.chapter + (saved.inBattle ? ' (in battle)' : ''), '', function () {
        closeModal(m);
        doLoad();
      }));
    }
    btns.appendChild(UI.button('How to Play', '', function () { showHelp(); }));
    b.appendChild(btns);

    b.appendChild(el('div', 'title-foot', 'A tactics campaign. Player phase, enemy phase, and one bad decision away from losing somebody for the rest of the map.'));

    openModal(m);
    FE.Music.play('title');
  }

  function chooseDifficulty() {
    var m = UI.modal('Choose Difficulty');
    var b = m._body;
    b.appendChild(el('p', 'note', 'This is set once, for the whole campaign.'));

    function opt(key, name, desc) {
      var card = el('div', 'diff-card');
      card.appendChild(el('div', 'diff-n', name));
      card.appendChild(el('div', 'diff-d', desc));
      card.addEventListener('click', function () {
        FE.Sfx.select();
        closeModal(m);
        G.campaign = FE.newCampaign(key);
        startChapterFlow();
      });
      b.appendChild(card);
    }
    opt('normal', 'Normal', 'The campaign as designed. Enemies at listed levels with iron and steel weapons.');
    opt('hard', 'Hard', 'Enemies two levels higher, a weapon tier better, and more of them. Survive chapters run tighter.');
    openModal(m);
  }

  function showHelp() {
    var m = UI.modal('How to Play', true);
    var b = m._body;
    var sections = [
      ['Turns', 'Move all your units, then end the turn and the enemy moves. When you attack, you strike first and the defender hits back if it can reach you.'],
      ['The triangle', 'Swords beat axes, axes beat lances, lances beat swords. Winning the matchup is +1 damage and +15 hit. Magic has its own: anima beats light, light beats dark, dark beats anima.'],
      ['Doubling', 'If your attack speed is 4 or more above theirs, you hit twice. Heavy weapons cut your attack speed unless your build (Con) can carry them.'],
      ['The forecast', 'Select a target and the panel shows damage, hit chance, crit chance and whether either side doubles. Hit rolls are averaged over two dice, so 85 behaves like 85.'],
      ['Undo', 'Unlimited, step by step, during your own turn. The dice are locked — redo the same attack the same way and you get the same result. Undo fixes bad positioning, not bad luck.'],
      ['Supply', 'Seren carries the convoy. She can reach it anywhere, and so can any unit standing next to her — pick Supply from the action menu to swap weapons mid-battle. It costs that unit its turn.'],
      ['The world map', 'Between chapters you stand on the map of the marches. Chapters move the campaign; skirmishes, the fair and the Hollow Spire are optional and always there.'],
      ['Danger zone', 'The red button paints every tile the enemy can reach next turn. Use it before you move, not after.'],
      ['Death', 'A unit that falls is out for the rest of the chapter and comes back for the next one. If Seren falls, the chapter restarts.'],
      ['Levels', 'A little experience per hit, a lot per kill, and healers level by healing. Each stat rolls its own growth rate. Cap 20, then promote.']
    ];
    sections.forEach(function (s) {
      b.appendChild(el('h4', null, s[0]));
      b.appendChild(el('p', null, s[1]));
    });
    b.appendChild(UI.button('Back', 'primary', function () { closeModal(m); }));
    openModal(m);
  }

  /* ================= chapter flow ================= */

  function startChapterFlow() {
    var ch = FE.CHAPTERS[G.campaign.chapterIndex];
    if (!ch) { showCampaignComplete(); return; }
    G.chapter = ch;
    var text = FE.STORY.chapters[ch.id];
    runDialogue(text ? text.pre : [], function () { showPrep(); });
  }

  function showCampaignComplete() {
    /* a save from before the last chapters existed can still land here */
    showEndingCard(G.campaign.ending || 'refuse');
  }

  /* ---------------- the epilogue ---------------- */

  /* The crown is whole and the last consent is Seren's. This is the only
     branch in the campaign, and it branches after the fighting is over. */
  function showEpilogue() {
    var ep = FE.STORY.epilogue;
    G.scene = 'epilogue';
    var m = UI.modal('The Third Consent', false);
    var b = m._body;
    b.appendChild(el('p', null, ep.prompt));
    b.appendChild(el('h4', null, ep.question));
    ep.choices.forEach(function (c) {
      b.appendChild(UI.button(c.label, 'primary', function () {
        FE.Sfx.select();
        closeModal(m);
        G.campaign.ending = c.key;
        saveCampaign();
        runDialogue(ep[c.key] || [], function () { showEndingCard(c.key); });
      }));
      b.appendChild(el('p', 'bio', c.blurb));
    });
    openModal(m);
    FE.Music.play('victory');
  }

  function showEndingCard(key) {
    var refused = key !== 'consent';
    var m = UI.modal(refused ? 'The Crown Refused' : 'The Accord of the Forge', true);
    var b = m._body;
    b.appendChild(el('p', null, refused
      ? 'Broken a second time, in front of witnesses, by the only house entitled to break it.'
      : 'Whole, lawful, kept in a plain room in Greywater, and refusable by any of the three.'));
    b.appendChild(UI.row('Chapters cleared', String(FE.CHAPTERS.length)));
    b.appendChild(UI.row('Total turns', String(G.campaign.turnsTotal)));
    b.appendChild(UI.row('Difficulty', G.campaign.difficulty === 'hard' ? 'Hard' : 'Normal'));
    b.appendChild(UI.row('Gold remaining', String(G.campaign.gold)));

    var roster = UI.panel('The company, at the end');
    Object.keys(G.campaign.roster || {}).forEach(function (id) {
      var r = G.campaign.roster[id];
      if (!r || !FE.CLASSES[r.cls]) return;
      var line = el('div', 'res-u');
      line.appendChild(UI.sprite(r.cls, 'player', 28));
      line.appendChild(el('span', 'ru-n', r.name || id));
      line.appendChild(el('span', 'ru-c', FE.CLASSES[r.cls].name + ' Lv' + r.level));
      roster._body.appendChild(line);
    });
    b.appendChild(roster);

    b.appendChild(UI.button('Back to Title', 'primary', function () {
      closeModal(m);
      G.scene = null;
      showTitle();
    }));
    openModal(m);
    FE.Music.play('victory');
  }
  G._testEpilogue = showEpilogue;
  G._testEndingCard = showEndingCard;

  /* ================= dialogue ================= */

  function runDialogue(lines, done) {
    if (!lines || !lines.length) { done(); return; }
    G.scene = 'dialogue';
    var i = 0;
    var m = UI.modal(null, true);
    m._box.classList.add('dialog-box');
    var b = m._body;
    var whoEl = el('div', 'dlg-who');
    var txtEl = el('div', 'dlg-text');
    var portrait = el('div', 'dlg-por');
    var hint = el('div', 'dlg-hint', 'tap to continue');
    b.appendChild(portrait);
    b.appendChild(whoEl);
    b.appendChild(txtEl);
    b.appendChild(hint);

    function render() {
      var l = lines[i];
      whoEl.textContent = l.who || '';
      txtEl.textContent = l.text;
      clear(portrait);
      var speaker = findSpeakerClass(l.who);
      if (speaker) {
        var cv = FE.portrait(speaker.key, speaker.cls, speaker.faction, 3);
        var img = el('canvas', 'por-big');
        img.width = cv.width; img.height = cv.height;
        img.getContext('2d').drawImage(cv, 0, 0);
        portrait.appendChild(img);
      }
    }
    function advance() {
      i++;
      if (i >= lines.length) {
        m.removeEventListener('click', advance);
        closeModal(m);
        done();
        return;
      }
      render();
    }
    m.addEventListener('click', advance);
    render();
    openModal(m);
  }

  function findSpeakerClass(name) {
    if (!name) return null;
    var lower = name.toLowerCase();
    var ids = Object.keys(FE.ROSTER);
    for (var i = 0; i < ids.length; i++) {
      if (FE.ROSTER[ids[i]].name.toLowerCase() === lower) {
        return { key: ids[i], cls: FE.ROSTER[ids[i]].cls, faction: 'player' };
      }
    }
    var bids = Object.keys(FE.BOSSES);
    for (var j = 0; j < bids.length; j++) {
      if (FE.BOSSES[bids[j]].name.toLowerCase() === lower) {
        return { key: bids[j], cls: FE.BOSSES[bids[j]].cls, faction: 'boss' };
      }
    }
    if (lower === 'alaric') return { key: 'alaric', cls: 'paladin', faction: 'player' };
    if (lower === 'villager') return { key: 'villager', cls: 'cleric', faction: 'npc' };
    if (lower === 'steward') return { key: 'steward', cls: 'cleric', faction: 'npc' };
    return null;
  }

  /* ================= the world map ================= */

  /* Everything between chapters happens here: walk to the next chapter when you
     are ready, or go and pick a fight you were not ordered into first. */

  var WORLD_W = 640, WORLD_H = 360;

  function worldCleared() { return G.campaign.chapterIndex; }

  /* which regions the campaign has reached, and which one to open on */
  function worldRegions() {
    return (FE.WORLD_REGIONS || [{ id: 'marches', name: 'The Marches', after: 0 }])
      .filter(function (r) { return worldCleared() >= (r.after || 0); });
  }
  function defaultRegion() {
    var next = FE.WORLD_NODES.filter(function (n) {
      return n.kind === 'chapter' && n.index === G.campaign.chapterIndex;
    })[0];
    if (next) return next.region || 'marches';
    var open = worldRegions();
    return open.length ? open[open.length - 1].id : 'marches';
  }

  function worldNodes(region) {
    var out = [];
    FE.WORLD_NODES.forEach(function (n) {
      if ((n.region || 'marches') !== region) return;
      if (n.kind === 'chapter') {
        var state = n.index < G.campaign.chapterIndex ? 'done'
          : (n.index === G.campaign.chapterIndex ? 'next' : 'locked');
        out.push({ node: n, state: state });
      } else if (worldCleared() >= (n.after || 0)) {
        out.push({ node: n, state: 'open' });
      }
    });
    FE.SKIRMISH_SITES.forEach(function (site) {
      if ((site.region || 'marches') !== region) return;
      if (worldCleared() < site.after) return;
      out.push({ node: { id: site.id, kind: 'skirmish', x: site.x, y: site.y, name: site.name, site: site }, state: 'open' });
    });
    return out;
  }

  function drawWorld(cv, nodes, region) {
    var g = cv.getContext('2d');
    var sc = cv.width / WORLD_W;
    g.setTransform(sc, 0, 0, sc, 0, 0);
    g.imageSmoothingEnabled = false;

    /* parchment */
    var sky = g.createLinearGradient(0, 0, 0, WORLD_H);
    sky.addColorStop(0, '#e8dbb8');
    sky.addColorStop(1, '#d6c79f');
    g.fillStyle = sky;
    g.fillRect(0, 0, WORLD_W, WORLD_H);

    /* a deterministic speckle so it reads as paper rather than a gradient */
    for (var i = 0; i < 900; i++) {
      var h = (i * 374761393) >>> 0;
      h = ((h ^ (h >>> 13)) * 1274126177) >>> 0;
      var px = h % WORLD_W, py = (h >>> 9) % WORLD_H;
      g.fillStyle = (h >>> 20) % 2 ? 'rgba(120,96,60,0.07)' : 'rgba(255,248,220,0.10)';
      g.fillRect(px, py, 2, 2);
    }

    /* The marches end in a coast; Varn is inland, mountainous and walled, so
       it gets crags and a city wall instead. */
    if (region === 'varn') {
      g.strokeStyle = 'rgba(96,78,52,0.5)';
      g.lineWidth = 1.6;
      for (var cx = 0; cx < 11; cx++) {
        for (var cy = 0; cy < 2; cy++) {
          var qx = 30 + cx * 56 + (cy % 2) * 26;
          var qy = 300 + cy * 30;
          g.beginPath();
          g.moveTo(qx - 10, qy + 7);
          g.lineTo(qx - 3, qy - 7);
          g.lineTo(qx + 3, qy + 2);
          g.lineTo(qx + 10, qy - 9);
          g.lineTo(qx + 15, qy + 7);
          g.stroke();
        }
      }
      g.strokeStyle = 'rgba(86,66,44,0.75)';
      g.lineWidth = 3;
      g.beginPath();
      g.moveTo(WORLD_W * 0.38, -6);
      g.quadraticCurveTo(WORLD_W * 0.70, WORLD_H * 0.26, WORLD_W + 6, WORLD_H * 0.30);
      g.stroke();
      g.lineWidth = 1;
      for (var t = 0; t <= 14; t++) {
        var pp = t / 14;
        var bx = (1 - pp) * (1 - pp) * WORLD_W * 0.38 + 2 * (1 - pp) * pp * WORLD_W * 0.70 + pp * pp * (WORLD_W + 6);
        var by = (1 - pp) * (1 - pp) * -6 + 2 * (1 - pp) * pp * WORLD_H * 0.26 + pp * pp * WORLD_H * 0.30;
        g.strokeRect(bx - 3, by - 3, 6, 6);
      }
    }
    /* The citadel is not countryside at all: it is a floor plan, so it gets
       courtyard blocks and hatched masonry and neither a coast nor a hill. */
    if (region === 'citadel') {
      g.strokeStyle = 'rgba(86,66,44,0.55)';
      g.lineWidth = 2;
      [[0.06, 0.08, 0.36, 0.30], [0.50, 0.06, 0.42, 0.34],
       [0.08, 0.52, 0.30, 0.38], [0.46, 0.56, 0.46, 0.34]].forEach(function (r) {
        g.strokeRect(WORLD_W * r[0], WORLD_H * r[1], WORLD_W * r[2], WORLD_H * r[3]);
      });
      g.strokeStyle = 'rgba(105,84,52,0.22)';
      g.lineWidth = 1;
      for (var qy = 0; qy < WORLD_H; qy += 14) {
        g.beginPath(); g.moveTo(0, qy); g.lineTo(WORLD_W, qy); g.stroke();
      }
      g.strokeStyle = 'rgba(86,66,44,0.8)';
      g.lineWidth = 3;
      g.strokeRect(6, 6, WORLD_W - 12, WORLD_H - 12);
    }
    if (region !== 'varn' && region !== 'citadel') {
      g.fillStyle = '#9fb7c4';
      g.beginPath();
      g.moveTo(WORLD_W, WORLD_H);
      g.lineTo(WORLD_W, WORLD_H * 0.42);
      g.quadraticCurveTo(WORLD_W * 0.82, WORLD_H * 0.74, WORLD_W * 0.62, WORLD_H);
      g.closePath();
      g.fill();
      g.strokeStyle = 'rgba(70,100,120,0.5)';
      g.lineWidth = 1.5;
      g.stroke();
    }

    /* hill country in the north-west, drawn as little chevrons the way an old
       campaign map would, rather than as texture */
    g.strokeStyle = 'rgba(105,84,52,0.55)';
    g.lineWidth = 1.4;
    for (var hx = 0; region !== 'citadel' && hx < 9; hx++) {
      for (var hy = 0; hy < 3; hy++) {
        var bx = 40 + hx * 30 + (hy % 2) * 15;
        var by = 42 + hy * 26;
        if (bx > WORLD_W * 0.62) continue;
        g.beginPath();
        g.moveTo(bx - 7, by + 5);
        g.lineTo(bx, by - 5);
        g.lineTo(bx + 7, by + 5);
        g.stroke();
      }
    }
    /* marsh tufts in the middle south */
    g.strokeStyle = 'rgba(80,110,80,0.45)';
    for (var mx = 0; region !== 'citadel' && mx < 7; mx++) {
      var tx = 300 + mx * 24, ty = 250 + (mx % 3) * 16;
      g.beginPath();
      g.moveTo(tx - 6, ty); g.lineTo(tx + 6, ty);
      g.moveTo(tx, ty); g.lineTo(tx - 3, ty - 6);
      g.moveTo(tx, ty); g.lineTo(tx + 3, ty - 6);
      g.stroke();
    }

    /* roads */
    var byId = {};
    FE.WORLD_NODES.forEach(function (n) { byId[n.id] = n; });
    var open = {};
    nodes.forEach(function (n) { open[n.node.id] = n.state; });
    g.lineCap = 'round';
    FE.WORLD_ROADS.forEach(function (r) {
      var a = byId[r[0]], z = byId[r[1]];
      if (!a || !z) return;
      if ((a.region || 'marches') !== region || (z.region || 'marches') !== region) return;
      var live = open[r[0]] && open[r[1]] && open[r[0]] !== 'locked' && open[r[1]] !== 'locked';
      g.strokeStyle = live ? 'rgba(96,72,40,0.85)' : 'rgba(120,104,80,0.28)';
      g.lineWidth = live ? 2.4 : 1.6;
      g.setLineDash(live ? [7, 5] : [3, 6]);
      g.beginPath();
      g.moveTo(a.x * WORLD_W, a.y * WORLD_H);
      g.lineTo(z.x * WORLD_W, z.y * WORLD_H);
      g.stroke();
    });
    g.setLineDash([]);

    /* a compass rose, because every campaign map has one */
    g.save();
    g.translate(WORLD_W - 46, 46);
    g.strokeStyle = 'rgba(96,72,40,0.8)';
    g.fillStyle = 'rgba(96,72,40,0.8)';
    g.lineWidth = 1.4;
    g.beginPath(); g.arc(0, 0, 16, 0, Math.PI * 2); g.stroke();
    g.beginPath();
    g.moveTo(0, -20); g.lineTo(4, 0); g.lineTo(0, 20); g.lineTo(-4, 0); g.closePath();
    g.fill();
    g.font = 'bold 10px ui-monospace, Menlo, monospace';
    g.textAlign = 'center';
    g.fillText('N', 0, -24);
    g.restore();
  }

  function showWorldMap() {
    G.scene = 'world';
    G.chapter = null;
    $('game').classList.remove('in-battle');
    FE.Music.play('prep');

    var regions = worldRegions();
    var region = G.worldRegion;
    if (!region || !regions.some(function (r) { return r.id === region; })) region = defaultRegion();
    G.worldRegion = region;

    var WORLD_TITLE = { varn: 'The Varn Interior', citadel: 'The Iron Citadel' };
    var m = UI.modal(WORLD_TITLE[region] || 'The Marches of Aurelund', true);
    m._box.classList.add('world-box');
    var b = m._body;
    var nodes = worldNodes(region);
    var nextCh = FE.CHAPTERS[G.campaign.chapterIndex];

    var head = el('div', 'prep-head');
    head.appendChild(el('div', 'prep-obj', nextCh
      ? 'Next: Chapter ' + nextCh.number + ' — ' + nextCh.name
      : 'Every built chapter is behind you.'));
    head.appendChild(el('div', 'prep-gold', 'Gold ' + G.campaign.gold
      + '   ·   Party level ~' + FE.partyLevel(G.campaign)));
    b.appendChild(head);

    /* region tabs, once there is more than one place to be */
    if (regions.length > 1) {
      var tabs = el('div', 'chip-row');
      regions.forEach(function (r) {
        var c = el('div', 'chip' + (r.id === region ? ' on' : ''), r.name);
        var hasNext = FE.WORLD_NODES.some(function (n) {
          return n.kind === 'chapter' && n.index === G.campaign.chapterIndex && (n.region || 'marches') === r.id;
        });
        if (hasNext && r.id !== region) c.appendChild(el('span', 'chip-dot'));
        c.addEventListener('click', function () {
          FE.Sfx.select();
          G.worldRegion = r.id;
          closeModal(m);
          showWorldMap();
        });
        tabs.appendChild(c);
      });
      b.appendChild(tabs);
    }

    var wrap = el('div', 'world-wrap');
    var cv = el('canvas', 'world-canvas');
    cv.width = WORLD_W * 2; cv.height = WORLD_H * 2;
    wrap.appendChild(cv);
    drawWorld(cv, nodes, region);

    var info = el('div', 'world-info');
    function say(title, text) {
      clear(info);
      info.appendChild(el('div', 'wi-n', title));
      info.appendChild(el('div', 'wi-t', text));
      var bar = el('div', 'fc-bar');
      info.appendChild(bar);
      return bar;
    }
    say('The march east', 'Pick where to go. Chapters move the campaign; everything else is optional.');

    nodes.forEach(function (entry) {
      var n = entry.node;
      var btn = el('button', 'wnode ' + n.kind + ' ' + entry.state);
      btn.style.left = (n.x * 100) + '%';
      btn.style.top = (n.y * 100) + '%';
      /* a centred label runs off the pane at the edges of the map, so the two
         outermost columns hang their label inwards instead */
      if (n.x < 0.13) btn.classList.add('edge-l');
      else if (n.x > 0.87) btn.classList.add('edge-r');
      btn.appendChild(el('span', 'wn-dot'));
      btn.appendChild(el('span', 'wn-label', n.name));
      btn.addEventListener('click', function () {
        FE.Sfx.select();
        [].forEach.call(wrap.querySelectorAll('.wnode'), function (o) { o.classList.remove('on'); });
        btn.classList.add('on');
        pickWorldNode(m, entry, say);
      });
      wrap.appendChild(btn);
    });
    b.appendChild(wrap);
    b.appendChild(info);

    var bar = el('div', 'prep-bar');
    bar.appendChild(UI.button('Supply', '', function () { closeModal(m); showConvoy(function () { showWorldMap(); }); }));
    bar.appendChild(UI.button('Save', '', function () { doSave(false); }));
    if (!nextCh) {
      bar.appendChild(UI.button('The campaign so far', '', function () { closeModal(m); showCampaignComplete(); }));
    }
    bar.appendChild(UI.button('Title', 'cancel', function () { closeModal(m); showTitle(); }));
    b.appendChild(bar);

    openModal(m);
  }

  function pickWorldNode(m, entry, say) {
    var n = entry.node, bar;

    if (n.kind === 'chapter') {
      var ch = FE.CHAPTERS[n.index];
      if (entry.state === 'locked') {
        say(n.name, 'Not yet. The road there runs through whatever is still in front of you.');
        return;
      }
      if (entry.state === 'done') {
        say(n.name, 'Chapter ' + ch.number + ', already behind you. ' + ch.objectiveText + '.');
        return;
      }
      bar = say(n.name, ch.objectiveText + '. This one moves the campaign forward.');
      bar.appendChild(UI.button('March on ' + n.name, 'primary', function () {
        closeModal(m);
        startChapterFlow();
      }));
      return;
    }

    if (n.kind === 'shop') {
      bar = say(n.name, n.blurb || '');
      bar.appendChild(UI.button('Visit the fair', 'primary', function () {
        closeModal(m);
        showShop(function () { showWorldMap(); });
      }));
      return;
    }

    if (n.kind === 'spire') {
      var best = G.campaign.spireBest || 0;
      var top = Math.min(FE.SPIRE_FLOORS, best + 1);
      bar = say(n.name, (n.blurb || '') + ' Cleared to floor ' + best + ' of ' + FE.SPIRE_FLOORS + '.');
      for (var f = 1; f <= top; f++) {
        (function (floor) {
          bar.appendChild(UI.button('Floor ' + floor, floor === top ? 'primary' : '', function () {
            closeModal(m);
            startSkirmish(FE.spireFloor(G.campaign, floor, G.campaign.seed + floor * 97));
          }));
        })(f);
      }
      return;
    }

    /* a skirmish site */
    var site = n.site;
    var battle = FE.skirmishFor(G.campaign, site, G.campaign.seed + worldCleared() * 31 + site.id.length);
    var avg = Math.round(battle.enemies.reduce(function (a, e) { return a + e.level; }, 0) / battle.enemies.length);
    bar = say(n.name, battle.enemies.length + ' of them, around level ' + avg
      + '. No treasure here — a purse, and whatever your units learn on the way.');
    bar.appendChild(UI.button('Ride out', 'primary', function () {
      closeModal(m);
      startSkirmish(battle);
    }));
  }

  function startSkirmish(battle) {
    G.chapter = battle;
    G.campaign.arenaRounds = {};
    showPrep();
  }

  /* ================= preparations ================= */

  function showPrep() {
    G.scene = 'prep';
    FE.Music.play('prep');
    var ch = curChapter();

    /* default deployment: forced units first, then the rest by level */
    var avail = ch.available.filter(function (id) { return G.campaign.roster[id]; });
    var forced = ch.forced.filter(function (id) { return G.campaign.roster[id]; });
    forced.forEach(function (id) { if (!G.campaign.roster[id]) G.campaign.roster[id] = FE.makeRosterUnit(id); });
    G.deploy = forced.slice();
    avail.forEach(function (id) {
      if (G.deploy.length >= ch.slots) return;
      if (G.deploy.indexOf(id) === -1) G.deploy.push(id);
    });

    renderPrep();
  }

  function renderPrep() {
    var ch = curChapter();
    var m = UI.modal(ch.skirmish ? ch.name : ('Chapter ' + ch.number + ' — ' + ch.name), true);
    m._box.classList.add('prep-box');
    var b = m._body;

    var head = el('div', 'prep-head');
    head.appendChild(el('div', 'prep-obj', 'Objective: ' + ch.objectiveText));
    head.appendChild(el('div', 'prep-gold', 'Gold ' + G.campaign.gold + '   ·   Deploy ' + G.deploy.length + '/' + ch.slots));
    b.appendChild(head);

    var list = el('div', 'prep-list');
    var avail = ch.available.filter(function (id) { return G.campaign.roster[id]; });
    avail.forEach(function (id) {
      var u = G.campaign.roster[id];
      var on = G.deploy.indexOf(id) !== -1;
      var locked = ch.forced.indexOf(id) !== -1;
      var card = el('div', 'unit-card' + (on ? ' on' : '') + (locked ? ' locked' : ''));
      card.appendChild(UI.sprite(u.cls, 'player', 36));
      var info = el('div', 'uc-info');
      info.appendChild(el('div', 'uc-n', u.name + (locked ? '  ★' : '')));
      info.appendChild(el('div', 'uc-c', FE.CLASSES[u.cls].name + '  Lv' + u.level));
      var bars = el('div', 'uc-bars');
      bars.appendChild(UI.hpBar(u.hp, u.maxhp));
      bars.appendChild(UI.expBar(u.exp));
      info.appendChild(bars);
      card.appendChild(info);

      var acts = el('div', 'uc-acts');
      acts.appendChild(UI.button('Info', 'tiny', function (ev) { ev.stopPropagation(); showUnitInfo(u, 'player'); }));
      card.appendChild(acts);

      card.addEventListener('click', function () {
        if (locked) { UI.toast(u.name + ' must deploy this chapter.'); return; }
        FE.Sfx.select();
        var i = G.deploy.indexOf(id);
        if (i !== -1) G.deploy.splice(i, 1);
        else {
          if (G.deploy.length >= ch.slots) { UI.toast('No deployment slots left.'); return; }
          G.deploy.push(id);
        }
        closeModal(m);
        renderPrep();
      });
      list.appendChild(card);
    });
    b.appendChild(list);

    var bar = el('div', 'prep-bar');
    bar.appendChild(UI.button('Supply', '', function () { closeModal(m); showConvoy(function () { renderPrep(); }); }));
    bar.appendChild(UI.button('Shop', '', function () { closeModal(m); showShop(function () { renderPrep(); }); }));
    bar.appendChild(UI.button('Save', '', function () { doSave(false); }));
    bar.appendChild(UI.button('Begin Chapter', 'primary', function () {
      if (!G.deploy.length) { UI.toast('Deploy at least one unit.'); return; }
      closeModal(m);
      beginBattle();
    }));
    b.appendChild(bar);

    openModal(m);
  }

  /* ---------------- convoy / trading ---------------- */

  function showConvoy(back) {
    var m = UI.modal('Supply', true);
    var b = m._body;
    var chosenId = G.deploy[0];

    function render() {
      clear(b);
      var pick = el('div', 'chip-row');
      G.deploy.forEach(function (id) {
        var u = G.campaign.roster[id];
        var c = el('div', 'chip' + (id === chosenId ? ' on' : ''), u.name);
        c.addEventListener('click', function () { FE.Sfx.select(); chosenId = id; render(); });
        pick.appendChild(c);
      });
      b.appendChild(pick);

      var u = G.campaign.roster[chosenId];
      var cols = el('div', 'two-col');

      var left = UI.panel(u.name + '  (' + u.items.length + '/5)');
      u.items.forEach(function (it, idx) {
        var line = UI.itemLine(it);
        line.appendChild(UI.button('→', 'tiny', function () {
          G.campaign.convoy.push(u.items.splice(idx, 1)[0]);
          render();
        }));
        left._body.appendChild(line);
      });
      cols.appendChild(left);

      var right = UI.panel('Convoy (' + G.campaign.convoy.length + ')');
      G.campaign.convoy.forEach(function (it, idx) {
        var line = UI.itemLine(it);
        line.appendChild(UI.button('←', 'tiny', function () {
          if (u.items.length >= 5) { UI.toast(u.name + ' is carrying five items already.'); return; }
          u.items.push(G.campaign.convoy.splice(idx, 1)[0]);
          render();
        }));
        right._body.appendChild(line);
      });
      cols.appendChild(right);
      b.appendChild(cols);

      b.appendChild(UI.button('Done', 'primary', function () { closeModal(m); back(); }));
    }
    render();
    openModal(m);
  }

  /* ---------------- shop ---------------- */

  var SHOP_STOCK = [
    ['ironsword', 'ironlance', 'ironaxe', 'ironbow', 'javelin', 'handaxe', 'vulnerary', 'heal', 'fire', 'lightning'],
    ['steelsword', 'steellance', 'steelaxe', 'steelbow', 'slimsword', 'armorslayer', 'vulnerary', 'heal', 'mend', 'thunder', 'chestkey', 'doorkey'],
    ['steelsword', 'steellance', 'steelaxe', 'steelbow', 'killingedge', 'killeraxe', 'horseslayer', 'elixir', 'mend', 'purewater', 'shine', 'elfire'],
    /* from chapter 7: silver appears, and so does the first promotion item you
       can simply buy rather than find */
    ['silversword', 'silverlance', 'silveraxe', 'silverbow', 'killingedge', 'killeraxe', 'killerlance', 'killerbow',
      'hammer', 'armorslayer', 'horseslayer', 'elixir', 'physic', 'restore', 'divine', 'elfire', 'flux'],
    /* from chapter 10: the shop is where a promotion stops being luck */
    ['silversword', 'silverlance', 'silveraxe', 'silverbow', 'killingedge', 'killeraxe', 'killerlance', 'killerbow',
      'hammer', 'armorslayer', 'horseslayer', 'luna', 'divine', 'physic', 'barrier', 'elixir', 'purewater',
      'herocrest', 'knightcrest', 'guidingring', 'orionsbolt', 'elysianwhip', 'oceanseal'],
    /* from chapter 17: the citadel's own under-market. Reach weapons at silver
       weight, and the two siege tomes, because the last four chapters are
       fought in rooms where you cannot always walk to the problem. */
    ['silversword', 'silverlance', 'silveraxe', 'silverbow', 'killingedge', 'killeraxe', 'killerlance', 'killerbow',
      'spear', 'tomahawk', 'longbow', 'hammer', 'armorslayer', 'horseslayer',
      'bolting', 'purge', 'fenrir', 'luna', 'divine', 'physic', 'barrier', 'restore', 'elixir', 'purewater',
      'herocrest', 'knightcrest', 'guidingring', 'orionsbolt', 'elysianwhip', 'oceanseal']
  ];

  /* Which stock list the fair is carrying. This has to be explicit: the list
     index used to be the chapter index clamped to the end of the array, so
     adding two later tiers quietly put silver weapons in the chapter-4 shop and
     buyable promotion items in the chapter-5 one. */
  function shopTier(chapterIndex) {
    if (chapterIndex >= 16) return 5;     /* chapter 17 onward */
    if (chapterIndex >= 9) return 4;      /* chapter 10 onward */
    if (chapterIndex >= 6) return 3;      /* chapter 7 onward  */
    if (chapterIndex >= 3) return 2;      /* chapter 4 onward  */
    if (chapterIndex >= 1) return 1;      /* chapter 2 onward  */
    return 0;
  }
  FE.shopTier = shopTier;
  FE.SHOP_STOCK_LIST = function () { return SHOP_STOCK; };

  function showShop(back) {
    FE.Music.play('shop');
    var m = UI.modal('Armory & Vendor', true);
    var b = m._body;
    var stock = SHOP_STOCK[Math.min(shopTier(G.campaign.chapterIndex), SHOP_STOCK.length - 1)];
    var sellFrom = null;          /* null = convoy, otherwise a unit id */

    function render() {
      clear(b);
      b.appendChild(el('div', 'shop-gold', 'Gold: ' + G.campaign.gold));
      var grid = el('div', 'shop-grid');
      stock.forEach(function (k) {
        var d = FE.WEAPONS[k];
        var card = el('div', 'shop-card');
        card.appendChild(el('div', 'sc-n', d.name));
        var stats = el('div', 'sc-s');
        if (d.type === 'staff') stats.textContent = 'Staff  Wt ' + d.wt;
        else if (d.type === 'item') stats.textContent = 'Item';
        else stats.textContent = FE.typeName(d.type) + '  Mt ' + d.mt + '  Hit ' + d.hit + '  Wt ' + d.wt + (d.crit ? '  Crit ' + d.crit : '');
        card.appendChild(stats);
        card.appendChild(el('div', 'sc-p', d.price + 'g'));
        card.addEventListener('click', function () {
          if (G.campaign.gold < d.price) { UI.toast('Not enough gold.'); return; }
          FE.Sfx.select();
          G.campaign.gold -= d.price;
          G.campaign.convoy.push(FE.mkItem(k));
          UI.toast(d.name + ' → convoy');
          render();
        });
        grid.appendChild(card);
      });
      b.appendChild(grid);

      /* Selling: from the convoy AND from what your units are carrying, which
         is where the weapon you actually want rid of usually is. */
      var sell = UI.panel('Sell');
      var srcChips = el('div', 'chip-row');
      var sources = [{ id: null, name: 'Convoy' }].concat(
        G.deploy.map(function (id) { return { id: id, name: G.campaign.roster[id].name }; })
      );
      sources.forEach(function (src) {
        var chip = el('div', 'chip' + (sellFrom === src.id ? ' on' : ''), src.name);
        chip.addEventListener('click', function () { FE.Sfx.select(); sellFrom = src.id; render(); });
        srcChips.appendChild(chip);
      });
      sell._body.appendChild(srcChips);

      var bag = sellFrom === null ? G.campaign.convoy : G.campaign.roster[sellFrom].items;
      var sellable = 0;
      bag.forEach(function (it, idx) {
        var d = FE.itemData(it);
        if (!d) return;
        var line = UI.itemLine(it);
        if (d.story || d.personal) {
          line.appendChild(el('span', 'note', 'cannot be sold'));
          sell._body.appendChild(line);
          return;
        }
        sellable++;
        /* a part-used weapon is worth less than a fresh one */
        var full = d.price || 0;
        var frac = (it.uses === null || !d.uses) ? 1 : Math.max(0.25, it.uses / d.uses);
        var price = Math.max(1, Math.floor(full / 2 * frac));
        line.appendChild(UI.button('Sell ' + price + 'g', 'tiny', function () {
          G.campaign.gold += price;
          bag.splice(idx, 1);
          UI.toast('Sold ' + d.name + ' for ' + price + 'g');
          render();
        }));
        sell._body.appendChild(line);
      });
      if (!bag.length) sell._body.appendChild(el('div', 'note', 'Nothing here to sell.'));
      else if (!sellable) sell._body.appendChild(el('div', 'note', 'Nothing here can be sold.'));
      b.appendChild(sell);
      b.appendChild(UI.button('Done', 'primary', function () { closeModal(m); FE.Music.play('prep'); back(); }));
    }
    render();
    openModal(m);
  }

  /* ---------------- arena ---------------- */

  /* The arena used to live here, on the preparations screen. It now stands on
     the map as a building you walk a unit into mid-battle — see doArena below. */

  /* ================= battle ================= */

  function beginBattle() {
    G.state = FE.startChapter(G.campaign, G.deploy);
    G.scene = 'battle';
    G.mode = 'idle';
    G.selected = null; G.selectedUnit = null;
    G.overlay = null; G.path = null;
    FE.Undo.reset(G.state);
    FE.Undo.push(G.state, 'turn start');
    var first = G.state.units.filter(function (u) { return u.faction === 'player'; })[0];
    if (first) { G.cursor = { x: first.x, y: first.y }; }
    /* show the battle chrome FIRST so the canvas is measured at its real size */
    $('game').classList.add('in-battle');
    FE.resizeCanvas();
    fitZoom();
    FE.centerOn(G.state, G.cursor.x, G.cursor.y);
    updateHud();
    updateTileInfo();
    FE.Music.play('player');
    if (curChapter().tutorial) {
      setTimeout(function () { UI.toast('Tap a unit to move. The red button shows where the enemy can reach.'); }, 700);
    }
  }

  /* Fill the viewport rather than shrinking the whole map into it. A phone is
     narrow and tall, and a 20-tile map scaled to fit its width leaves the board
     as an unreadable strip with black bands above and below. Cover, then pan. */
  function fitZoom() {
    var s = G.state;
    var R = FE.R;
    var fitW = R.viewW / (s.map.w * R.tile);
    var fitH = R.viewH / (s.map.h * R.tile);
    var want = Math.max(fitW, fitH);
    R.zoom = Math.max(0.7, Math.min(1.5, want));
  }

  function updateHud() {
    var s = G.state;
    if (!s) return;
    var ch = curChapter();
    $('hud-ch').textContent = ch.skirmish ? ch.name : ('Ch ' + ch.number + ' · ' + ch.name);
    var obj = ch.objectiveText;
    if (s.objective === 'survive') obj = 'Survive ' + Math.max(0, s.survive - s.turn + 1) + ' more turn(s)';
    $('hud-obj').textContent = obj;
    $('hud-turn').textContent = 'Turn ' + s.turn + ' · ' + (s.phase === 'player' ? 'Your phase' : 'Enemy phase');
    $('hud-turn').className = s.phase === 'player' ? 'player-phase' : 'enemy-phase';
    var undoBtn = $('btn-undo');
    undoBtn.disabled = !FE.Undo.canUndo(G.state) || G.busy;
    undoBtn.textContent = 'Undo' + (FE.Undo.depth(G.state) > 1 ? ' (' + (FE.Undo.depth(G.state) - 1) + ')' : '');
    $('btn-end').disabled = s.phase !== 'player' || G.busy;
  }

  /* ---------------- tile info panel ---------------- */

  function updateTileInfo() {
    var s = G.state, p = $('tileinfo');
    if (!s) return;
    clear(p);
    var t = FE.tileAt(s, G.cursor.x, G.cursor.y);
    if (!t) return;
    var td = FE.TERRAIN[t];
    var row = el('div', 'ti-terr');
    row.appendChild(el('span', 'ti-n', td.name));
    var bits = [];
    if (td.avo) bits.push('Avo +' + td.avo);
    if (td.def) bits.push('Def +' + td.def);
    if (td.heal) bits.push('Heal');
    row.appendChild(el('span', 'ti-b', bits.join('  ')));
    p.appendChild(row);

    var u = FE.unitAt(s, G.cursor.x, G.cursor.y);
    if (u && u.alive && FE.unitVisible(s, u)) {
      var card = el('div', 'ti-unit ' + u.faction + (u.boss ? ' boss' : ''));
      card.appendChild(UI.sprite(u.cls, u.boss ? 'boss' : (u.recruitable && u.faction === 'enemy' ? 'npc' : u.faction), 32));
      var info = el('div', 'ti-info');
      info.appendChild(el('div', 'ti-un', u.name + '  Lv' + u.level));
      info.appendChild(el('div', 'ti-uc', FE.CLASSES[u.cls].name));
      info.appendChild(UI.hpBar(u.hp, u.maxhp));
      info.appendChild(el('div', 'ti-hp', u.hp + ' / ' + u.maxhp));
      card.appendChild(info);
      var btn = UI.button('Stats', 'tiny', function () { showUnitInfo(u, u.faction); });
      card.appendChild(btn);
      p.appendChild(card);
    }
  }

  /* ---------------- selection & movement ---------------- */

  function tapTile(x, y) {
    var s = G.state;
    if (!s || G.busy || s.phase !== 'player') return;
    if (!FE.inBounds(s, x, y)) return;
    G.cursor = { x: x, y: y };
    updateTileInfo();

    if (G.mode === 'idle') {
      var u = FE.unitAt(s, x, y);
      if (u && u.alive && u.faction === 'player' && !u.acted) {
        selectUnit(u);
      } else if (u && u.alive) {
        showRangePreview(u);
      } else {
        clearSelection();
      }
      return;
    }

    if (G.mode === 'move') {
      var k = FE.posKey(x, y);
      if (G.stand[k] !== undefined) {
        commitMove(G.selectedUnit, x, y);
      } else {
        var other = FE.unitAt(s, x, y);
        if (other && other.alive && other.faction === 'player' && !other.acted) selectUnit(other);
        else clearSelection();
      }
      return;
    }

    if (G.mode === 'target') {
      if (!G.pendingTarget) return;
      var t = FE.unitAt(s, x, y);
      if (t && G.pendingTarget.valid(t)) G.pendingTarget.pick(t);
      /* a tap on empty ground just moves the cursor - backing out is the
         Back button, so a near-miss never throws away the action */
    }
  }

  function selectUnit(u) {
    FE.Sfx.select();
    G.selected = u.uid;
    G.selectedUnit = u;
    G.mode = 'move';
    G.reach = FE.reachable(G.state, u);
    G.stand = FE.standable(G.state, u, G.reach);
    G.stand[FE.posKey(u.x, u.y)] = 0;
    buildMoveOverlay(u);
    G.path = null;
    updateTileInfo();
  }

  function buildMoveOverlay(u) {
    var ov = {};
    /* danger sits underneath, so you can check what reaches you while you are
       still deciding where to go rather than having to deselect first */
    if (G.danger) {
      var dz = FE.dangerZone(G.state);
      Object.keys(dz).forEach(function (k) { ov[k] = 'danger'; });
    }
    Object.keys(G.stand).forEach(function (k) { ov[k] = 'move'; });
    var ranges = FE.attackRanges(u);
    if (ranges.length) {
      Object.keys(G.stand).forEach(function (k) {
        var p = k.split(','), x = +p[0], y = +p[1];
        var tiles = FE.rangeTiles(G.state, x, y, ranges);
        Object.keys(tiles).forEach(function (t) { if (!ov[t] || ov[t] === 'danger') ov[t] = 'attack'; });
      });
    }
    var sranges = FE.staffRanges(u);
    if (sranges.length) {
      Object.keys(G.stand).forEach(function (k) {
        var p = k.split(','), x = +p[0], y = +p[1];
        var tiles = FE.rangeTiles(G.state, x, y, sranges);
        Object.keys(tiles).forEach(function (t) { if (!ov[t] || ov[t] === 'danger') ov[t] = 'staff'; });
      });
    }
    G.overlay = ov;
  }

  function showRangePreview(u) {
    G.selected = u.uid;
    G.selectedUnit = null;
    G.mode = 'idle';
    var t = FE.threatTiles(G.state, u, true);
    var ov = {};
    Object.keys(t).forEach(function (k) { ov[k] = 'danger'; });
    G.overlay = ov;
    G.path = null;
  }

  function clearSelection() {
    G.selected = null;
    G.selectedUnit = null;
    G.mode = 'idle';
    G.overlay = G.danger ? dangerOverlay() : null;
    G.path = null;
    closeActionMenu();
  }

  function dangerOverlay() {
    var d = FE.dangerZone(G.state);
    var ov = {};
    Object.keys(d).forEach(function (k) { ov[k] = 'danger'; });
    return ov;
  }

  function commitMove(u, x, y) {
    FE.Undo.push(G.state, 'move ' + u.name);
    var path = FE.pathTo(G.state, u, G.reach, x, y) || [{ x: x, y: y }];
    G.busy = true;
    G.overlay = null;
    G.path = null;
    animatePath(u, path, function () {
      u.x = x; u.y = y;
      u.moved = true;
      FE.R.moveAnim = null;
      FE.recomputeSupports(G.state);
      FE.updateFog(G.state);
      G.busy = false;
      G.cursor = { x: x, y: y };
      openActionMenu(u);
      updateHud();
      updateTileInfo();
    });
  }

  function animatePath(u, path, done) {
    var i = 0;
    FE.R.moveAnim = { unit: u.uid, x: u.x, y: u.y };
    function stepOne() {
      if (i >= path.length) { done(); return; }
      FE.R.moveAnim.x = path[i].x;
      FE.R.moveAnim.y = path[i].y;
      FE.ensureVisible(G.state, path[i].x, path[i].y);
      if (i > 0) FE.Sfx.move();
      i++;
      setTimeout(stepOne, 70);
    }
    stepOne();
  }

  /* ---------------- action menu ---------------- */

  function openActionMenu(u) {
    var s = G.state;
    G.mode = 'menu';
    var menu = $('actionmenu');
    clear(menu);
    menu.classList.add('open');

    var acts = [];

    /* attack */
    var atkTargets = findAttackTargets(u);
    if (atkTargets.length) acts.push(['Attack', function () { beginAttack(u, atkTargets); }]);

    /* staff */
    var staff = FE.equippedStaff(u);
    if (staff) {
      var healTargets = findStaffTargets(u);
      if (healTargets.length) acts.push(['Staff', function () { beginStaff(u, healTargets); }]);
    }

    /* talk */
    var talkTargets = findTalkTargets(u);
    if (talkTargets.length) acts.push(['Talk', function () { doTalk(u, talkTargets[0]); }]);

    /* village */
    var v = FE.villageAt(s, u.x, u.y);
    if (v && !v.done) acts.push(['Visit', function () { doVisit(u, v); }]);

    /* chest */
    var c = adjacentChest(s, u);
    if (c) acts.push(['Chest', function () { doChest(u, c); }]);

    /* door */
    var d = adjacentDoor(s, u);
    if (d) acts.push(['Door', function () { doDoor(u, d); }]);

    /* arena — a building on the map, entered by standing on it */
    var here = FE.tileAt(s, u.x, u.y);
    if (here && FE.TERRAIN[here].arena) {
      var left = FE.arenaRoundsLeft(G.state, u);
      if (left > 0 && FE.equipped(u)) {
        acts.push(['Arena (' + left + ')', function () { doArena(u); }]);
      }
    }

    /* seize */
    if (s.objective === 'seize' && u.lord) {
      var t = FE.tileAt(s, u.x, u.y);
      if (t && FE.TERRAIN[t].seize) acts.push(['Seize', function () { doSeize(u); }]);
    }

    /* supply — the lord carries the convoy, and anyone standing next to her
       can reach into it, the way Sacred Stones handles it */
    var quarter = supplyAccess(s, u);
    if (quarter) acts.push(['Supply', function () { beginSupply(u, quarter); }]);

    /* trade */
    var tradeTargets = adjacentAllies(s, u);
    if (tradeTargets.length) acts.push(['Trade', function () { beginTrade(u, tradeTargets); }]);

    acts.push(['Item', function () { showInventory(u, true); }]);
    acts.push(['Wait', function () { finishUnit(u); }]);

    acts.forEach(function (a) {
      menu.appendChild(UI.button(a[0], 'act', a[1]));
    });
    var back = UI.button('Back', 'act cancel', function () {
      FE.Undo.pop(G.state);
      closeActionMenu();
      clearSelection();
      updateHud();
      updateTileInfo();
    });
    menu.appendChild(back);

    positionMenu(menu, u);
  }

  /* Place the action menu against the selected unit without clipping it on the
     panel below or burying the unit underneath it. The old version guessed the
     menu's height from the button count, so a taller menu ran off the bottom of
     the map pane and was cut off by overflow:hidden. Measure it instead, then
     try each side and keep whichever fits. */
  function positionMenu(menu, u) {
    var ts = FE.tileSize();
    var R = FE.R;
    var rect = $('map-wrap').getBoundingClientRect();
    var pad = 6;

    menu.style.left = '-9999px';
    menu.style.top = '0px';
    var mw = menu.offsetWidth || 116;
    var mh = menu.offsetHeight || 120;

    var ux = u.x * ts - R.camX;
    var uy = u.y * ts - R.camY;

    var spots = [
      { x: ux + ts + pad, y: uy - (mh - ts) / 2 },
      { x: ux - mw - pad, y: uy - (mh - ts) / 2 },
      { x: ux - (mw - ts) / 2, y: uy + ts + pad },
      { x: ux - (mw - ts) / 2, y: uy - mh - pad }
    ];

    var chosen = null;
    for (var i = 0; i < spots.length; i++) {
      var sp = spots[i];
      var x = Math.max(pad, Math.min(rect.width - mw - pad, sp.x));
      var y = Math.max(pad, Math.min(rect.height - mh - pad, sp.y));
      var covers = x < ux + ts && x + mw > ux && y < uy + ts && y + mh > uy;
      if (!covers) { chosen = { x: x, y: y }; break; }
    }
    if (!chosen) {
      chosen = {
        x: Math.max(pad, Math.min(rect.width - mw - pad, ux + ts + pad)),
        y: Math.max(pad, Math.min(rect.height - mh - pad, uy))
      };
    }

    if (mh > rect.height - pad * 2) {
      menu.style.maxHeight = (rect.height - pad * 2) + 'px';
      menu.style.overflowY = 'auto';
      chosen.y = pad;
    } else {
      menu.style.maxHeight = '';
      menu.style.overflowY = '';
    }

    menu.style.left = Math.round(chosen.x) + 'px';
    menu.style.top = Math.round(chosen.y) + 'px';
  }

  function closeActionMenu() {
    var menu = $('actionmenu');
    menu.classList.remove('open');
    clear(menu);
  }

  function finishUnit(u) {
    u.acted = true;
    u.moved = true;
    closeActionMenu();
    clearSelection();
    FE.recomputeSupports(G.state);
    FE.updateFog(G.state);
    updateHud();
    updateTileInfo();
    afterAction();
  }

  /* ---------------- targets ---------------- */

  function findAttackTargets(u) {
    var s = G.state;
    var weapons = FE.usableWeapons(u);
    var out = [];
    s.units.forEach(function (o) {
      if (!o.alive || !FE.hostile(u, o)) return;
      if (!FE.unitVisible(s, o)) return;
      var dist = FE.dist(u, o);
      var ok = weapons.some(function (it) {
        var d = FE.itemData(it);
        return dist >= d.rng[0] && dist <= d.rng[1];
      });
      if (ok) out.push(o);
    });
    return out;
  }

  /* Which allies this unit could actually do something for. A heal staff on a
     unit at full HP is a wasted use, so those are not targets and the Staff
     action does not appear at all when nobody needs it. */
  function findStaffTargets(u) {
    var s = G.state;
    var out = [];
    var staves = (u.items || []).filter(function (it) {
      var d = FE.itemData(it);
      return d && d.type === 'staff';
    });
    if (!staves.length) return out;
    if (FE.CLASSES[u.cls].weapons.indexOf('staff') === -1) return out;

    s.units.forEach(function (o) {
      if (!o.alive || o.faction !== u.faction) return;
      var dist = FE.dist(u, o);
      var usable = staves.some(function (it) {
        var d = FE.itemData(it);
        if (dist < d.rng[0] || dist > d.rng[1]) return false;
        if (d.staff === 'heal') return o.hp < o.maxhp;
        if (d.staff === 'barrier') return true;
        if (d.staff === 'restore') return !!o.status;
        return false;
      });
      if (usable) out.push(o);
    });
    return out;
  }

  /* the best staff this unit can use on that target right now */
  function bestStaffFor(u, target) {
    var dist = FE.dist(u, target);
    var best = null, bestVal = -1;
    (u.items || []).forEach(function (it) {
      var d = FE.itemData(it);
      if (!d || d.type !== 'staff') return;
      if (dist < d.rng[0] || dist > d.rng[1]) return;
      if (d.staff === 'heal') {
        if (target.hp >= target.maxhp) return;
        /* prefer the staff that heals closest to what is actually missing,
           so a Mend is not burned on a scratch when a Heal would do */
        var missing = target.maxhp - target.hp;
        var amount = Math.min(FE.healAmount(u, it), missing);
        var waste = FE.healAmount(u, it) - amount;
        var val = amount * 10 - waste;
        if (val > bestVal) { bestVal = val; best = it; }
      } else if (d.staff === 'restore') {
        if (!target.status) return;
        if (bestVal < 1) { bestVal = 1; best = it; }
      } else if (d.staff === 'barrier') {
        if (bestVal < 0) { bestVal = 0; best = it; }
      }
    });
    return best;
  }

  function findTalkTargets(u) {
    var s = G.state;
    var out = [];
    s.units.forEach(function (o) {
      if (!o.alive || !o.recruitable) return;
      if (FE.dist(u, o) !== 1) return;
      if ((o.talkWith || []).indexOf(u.id) === -1) return;
      out.push(o);
    });
    return out;
  }

  function adjacentAllies(s, u) {
    var out = [];
    s.units.forEach(function (o) {
      if (!o.alive || o === u || o.faction !== 'player') return;
      if (FE.dist(u, o) === 1) out.push(o);
    });
    return out;
  }

  /* Who is holding the convoy for this unit. The lord carries it herself;
     anyone else has to be standing next to her. Returns the unit granting the
     access, or null. */
  function supplyAccess(s, u) {
    if (!u.alive) return null;
    if (u.lord) return u;
    var found = null;
    s.units.forEach(function (o) {
      if (found || !o.alive || o.faction !== 'player' || !o.lord) return;
      if (FE.dist(u, o) === 1) found = o;
    });
    return found;
  }
  FE.supplyAccess = supplyAccess;

  function adjacentChest(s, u) {
    var found = null;
    (s.chests || []).forEach(function (c) {
      if (c.done) return;
      if (FE.dist(u, c) > 1 && !(u.x === c.x && u.y === c.y)) return;
      if (!canOpen(u, 'chest')) return;
      found = c;
    });
    return found;
  }

  function adjacentDoor(s, u) {
    var found = null;
    for (var i = 0; i < FE.DIRS.length; i++) {
      var x = u.x + FE.DIRS[i][0], y = u.y + FE.DIRS[i][1];
      var t = FE.tileAt(s, x, y);
      if (t !== 'door') continue;
      if (s.openedDoors[FE.posKey(x, y)]) continue;
      if (!canOpen(u, 'door')) continue;
      found = { x: x, y: y };
      break;
    }
    return found;
  }

  function canOpen(u, kind) {
    var cl = FE.CLASSES[u.cls];
    if (cl.lockpick) {
      if (cl.keyless) return true;
      return u.items.some(function (it) { return it.key === 'lockpick'; }) || cl.keyless;
    }
    return u.items.some(function (it) { return it.key === (kind === 'door' ? 'doorkey' : 'chestkey'); });
  }

  function consumeOpener(u, kind) {
    var cl = FE.CLASSES[u.cls];
    if (cl.keyless) return;
    var wantKey = kind === 'door' ? 'doorkey' : 'chestkey';
    var idx = -1;
    if (cl.lockpick) {
      idx = u.items.findIndex(function (it) { return it.key === 'lockpick'; });
    }
    if (idx === -1) idx = u.items.findIndex(function (it) { return it.key === wantKey; });
    if (idx === -1) return;
    var it = u.items[idx];
    if (it.uses !== null) {
      it.uses--;
      if (it.uses <= 0) u.items.splice(idx, 1);
    }
  }

  /* ---------------- attack flow ---------------- */

  function beginAttack(u, targets) {
    closeActionMenu();
    G.mode = 'target';
    var weapons = FE.usableWeapons(u);
    var wIndex = 0;

    function usableFor(target) {
      var dist = FE.dist(u, target);
      return weapons.filter(function (it) {
        var d = FE.itemData(it);
        return dist >= d.rng[0] && dist <= d.rng[1];
      });
    }

    var idx = 0;
    G.pendingTarget = {
      valid: function (t) { return targets.indexOf(t) !== -1; },
      pick: function (t) { idx = targets.indexOf(t); wIndex = 0; show(); }
    };
    function show() {
      var target = targets[idx];
      var ws = usableFor(target);
      if (wIndex >= ws.length) wIndex = 0;
      var item = ws[wIndex];
      G.cursor = { x: target.x, y: target.y };
      FE.ensureVisible(G.state, target.x, target.y);
      var ov = {};
      ov[FE.posKey(target.x, target.y)] = 'attack';
      ov[FE.posKey(u.x, u.y)] = 'move';
      G.overlay = ov;
      showForecast(u, target, item, ws, targets.length > 1, function (dir) {
        if (dir === 'target') { idx = (idx + 1) % targets.length; wIndex = 0; show(); }
        else if (dir === 'weapon') { wIndex = (wIndex + 1) % ws.length; show(); }
        else if (dir === 'confirm') { hideForecast(); executeAttack(u, target, item); }
        else { hideForecast(); cancelTargeting(); openActionMenu(u); }
      });
    }
    show();
  }

  function showForecast(u, target, item, weapons, multi, cb) {
    var fc = FE.forecast(G.state, u, target, item);
    var p = $('forecast');
    clear(p);
    p.classList.add('open');
    placePanel(u.x, Math.max(u.y, target.y));
    if (!fc) return;

    var grid = el('div', 'fc-grid');

    function col(unit, sideData, faction) {
      var c = el('div', 'fc-col ' + faction);
      c.appendChild(el('div', 'fc-name', unit.name));
      /* what they are actually holding - you should never have to guess */
      var held = faction === 'me' ? item : FE.counterWeapon(unit, fc.distance);
      var anyHeld = held || FE.equipped(unit);
      if (anyHeld) {
        var hd = FE.itemData(anyHeld);
        var wrow = el('div', 'fc-wep');
        wrow.appendChild(el('span', 'item-t ' + hd.type, FE.typeGlyph(hd.type)));
        wrow.appendChild(el('span', 'fc-wep-n', hd.name));
        if (!held) wrow.appendChild(el('span', 'fc-wep-o', 'out of reach'));
        c.appendChild(wrow);
      } else {
        c.appendChild(el('div', 'fc-wep-o', 'unarmed'));
      }
      var hpRow = el('div', 'fc-hp');
      hpRow.appendChild(UI.hpBar(unit.hp, unit.maxhp));
      hpRow.appendChild(el('span', null, unit.hp + '/' + unit.maxhp));
      c.appendChild(hpRow);
      if (sideData) {
        var hits = sideData.doubles ? 2 : 1;
        c.appendChild(UI.row('Dmg', String(sideData.dmg) + (sideData.doubles ? ' \u00d7 2' : '')));
        if (sideData.doubles) {
          var dt = el('div', 'fc-double ' + (faction === 'me' ? 'good' : 'bad'));
          dt.appendChild(el('div', 'fc-double-t', faction === 'me' ? 'You strike twice' : 'Strikes back twice'));
          dt.appendChild(el('div', 'fc-double-s', (sideData.dmg * 2) + ' damage over the exchange'));
          c.appendChild(dt);
        }
        c.appendChild(UI.row('Hit', sideData.hit + '%'));
        c.appendChild(UI.row('Crit', sideData.crit + '%'));
        /* spell the triangle out rather than showing a bare + or - */
        if (sideData.triangle !== 0) {
          var mineT = FE.itemData(sideData.item).type;
          var otherW = (faction === 'me')
            ? FE.counterWeapon(target, fc.distance)
            : item;
          var otherT = otherW ? FE.itemData(otherW).type : null;
          var verb = sideData.triangle > 0 ? ' beats ' : ' loses to ';
          var bonus = sideData.triangle > 0
            ? '+' + FE.TRIANGLE_MT + ' dmg, +' + FE.TRIANGLE_HIT + ' hit'
            : '−' + FE.TRIANGLE_MT + ' dmg, −' + FE.TRIANGLE_HIT + ' hit';
          var line = FE.typeName(mineT) + (otherT
            ? verb + FE.typeName(otherT)
            : (sideData.triangle > 0 ? ' has the advantage' : ' is at a disadvantage'));
          var tag = el('div', 'fc-tag ' + (sideData.triangle > 0 ? 'good' : 'bad'));
          tag.appendChild(el('div', null, line));
          tag.appendChild(el('div', 'fc-tag-b', bonus));
          c.appendChild(tag);
        }
        if (sideData.effective) {
          var et = el('div', 'fc-tag good');
          et.appendChild(el('div', null, 'Effective weapon'));
          et.appendChild(el('div', 'fc-tag-b', 'triple weapon might'));
          c.appendChild(et);
        }
      } else {
        c.appendChild(el('div', 'fc-nocounter', 'cannot counter'));
      }
      return c;
    }

    grid.appendChild(col(u, fc.atk, 'me'));
    var mid = el('div', 'fc-mid');
    mid.appendChild(el('div', 'fc-w', FE.itemData(item).name));
    var total = fc.atk.dmg * (fc.atk.doubles ? 2 : 1);
    mid.appendChild(el('div', 'fc-lethal', total >= target.hp ? 'LETHAL' : total + ' of ' + target.hp));
    grid.appendChild(mid);
    grid.appendChild(col(target, fc.def, 'them'));
    p.appendChild(grid);

    var bar = el('div', 'fc-bar');
    bar.appendChild(UI.button('Attack', 'primary', function () { cb('confirm'); }));
    if (weapons.length > 1) bar.appendChild(UI.button('Weapon', '', function () { cb('weapon'); }));
    if (multi) bar.appendChild(UI.button('Next target', '', function () { cb('target'); }));
    bar.appendChild(UI.button('Back', 'cancel', function () { cb('cancel'); }));
    p.appendChild(bar);
  }

  /* Put the panel wherever it is not sitting on top of the unit you are acting
     with. It is pinned to the bottom of the map pane by default, which covers
     your own healer whenever she is standing in the lower half of the map. */
  function placePanel(anchorX, anchorY) {
    var p = $('forecast');
    var ts = FE.tileSize();
    var rect = $('map-wrap').getBoundingClientRect();
    var sy = anchorY * ts - FE.R.camY;
    p.classList.toggle('at-top', sy > rect.height * 0.45);
  }

  function hideForecast() {
    var p = $('forecast');
    p.classList.remove('open');
    clear(p);
    G.pendingTarget = null;
  }

  function executeAttack(u, target, item) {
    G.busy = true;
    G.mode = 'busy';
    G.overlay = null;

    var startYou = u.hp, startFoe = target.hp;
    var distance = FE.dist(u, target);
    var terrain = FE.tileAt(G.state, target.x, target.y);
    var log = FE.resolveCombat(G.state, u, target, item);

    function settle() {
      G.busy = false;
      finishUnit(u);
    }

    if (animMode() === 'off') {
      playCombatLog(log, settle);
      return;
    }
    showBattleScene({
      you: u, foe: target, log: log,
      youHp: startYou, foeHp: startFoe,
      distance: distance, terrain: terrain
    }, function () {
      /* the scene showed the blows; run the log for deaths, drops and levels */
      playCombatLog(log, settle, { silent: true });
    });
  }

  /* the full-screen battle scene for an attack on the map */
  function showBattleScene(o, done) {
    var m = UI.modal(null, true);
    m._box.classList.add('duel-box');
    m._box.classList.add('battle-scene');
    var b = m._body;
    var cv = el('canvas', 'duel-canvas');
    cv.width = FE.DUEL_W * 2;
    cv.height = FE.DUEL_H * 2;
    b.appendChild(cv);
    b.appendChild(el('div', 'duel-hint', 'tap to skip'));

    /* tapping anywhere cuts to the result */
    m.addEventListener('click', function () { if (FE.duelSkip) FE.duelSkip(); });
    openModal(m);

    FE.playDuel(cv, {
      you: { cls: o.you.cls, faction: 'player', name: o.you.name, hp: o.youHp, maxhp: o.you.maxhp },
      foe: {
        cls: o.foe.cls,
        faction: o.foe.boss ? 'boss' : (o.foe.recruitable ? 'npc' : 'enemy'),
        name: o.foe.name, hp: o.foeHp, maxhp: o.foe.maxhp
      },
      log: o.log,
      uidYou: o.you.uid,
      uidFoe: o.foe.uid,
      distance: o.distance,
      scene: FE.sceneForTerrain(o.terrain),
      speed: animSpeed(),
      onDone: function () { closeModal(m); done(); }
    });
  }

  function playCombatLog(log, done, opts) {
    var silent = !!(opts && opts.silent);
    var i = 0;
    function next() {
      if (i >= log.length) {
        showQueuedLevelUps(log, done);
        return;
      }
      var ev = log[i++];
      /* the battle scene already showed the blows; skip straight past them */
      if (silent && ev.type === 'strike') { next(); return; }
      var u = unitByUid(ev.unit !== undefined ? ev.unit : ev.attacker);
      if (ev.type === 'strike') {
        var att = unitByUid(ev.attacker), def = unitByUid(ev.defender);
        if (ev.miss) {
          FE.Sfx.miss();
          if (def) FE.addPopup(def.x, def.y, 'MISS', '#dddddd');
        } else {
          if (ev.crit) { FE.Sfx.crit(); FE.R.shake = 7; }
          else FE.Sfx.hit();
          if (def) FE.addPopup(def.x, def.y, String(ev.damage), ev.crit ? '#ffd24d' : '#ffffff');
          if (ev.drain && att) FE.addPopup(att.x, att.y, '+' + ev.drain, '#9de89d');
        }
        setTimeout(next, 420);
        return;
      }
      if (ev.type === 'death') {
        FE.Sfx.death();
        var d = unitByUid(ev.unit);
        UI.toast((ev.faction === 'player' ? ev.name + ' is out for this chapter.' : ev.name + ' falls.'), ev.faction === 'player' ? 'bad' : '');
        setTimeout(next, 340);
        return;
      }
      if (ev.type === 'phase2') {
        /* a two-phase boss stands back up. Shake the room, then play the
           scene if the chapter has one, then carry on with the log. */
        FE.Sfx.crit();
        FE.R.shake = 14;
        var pu = unitByUid(ev.unit);
        if (pu) FE.addPopup(pu.x, pu.y, 'THE CROWN', '#ffd24d');
        UI.toast(ev.name + ' rises.', 'bad');
        var scene = (ev.scene && FE.STORY.scenes) ? FE.STORY.scenes[ev.scene] : null;
        if (scene && scene.length) {
          setTimeout(function () {
            runDialogue(scene, function () { G.scene = 'battle'; next(); });
          }, 600);
        } else {
          setTimeout(next, 800);
        }
        return;
      }
      if (ev.type === 'heal') {
        FE.Sfx.heal();
        var t = unitByUid(ev.target);
        if (t) FE.addPopup(t.x, t.y, '+' + ev.amount, '#8ef0a0');
        setTimeout(next, 380);
        return;
      }
      if (ev.type === 'break') {
        UI.toast(FE.WEAPONS[ev.weapon].name + ' broke.');
        setTimeout(next, 200);
        return;
      }
      if (ev.type === 'drop') {
        var name = (FE.WEAPONS[ev.item] || FE.EXTRA_ITEMS[ev.item]).name;
        FE.addPopup(ev.x, ev.y, name, '#ffd24d');
        UI.toast(ev.toConvoy ? name + ' dropped — sent to the convoy' : name + ' dropped!', 'good');
        FE.Sfx.levelup();
        setTimeout(next, 420);
        return;
      }
      if (ev.type === 'goldfound') {
        FE.addPopup(ev.x, ev.y, ev.amount + 'g', '#ffd24d');
        UI.toast('Found ' + ev.amount + ' gold', 'good');
        FE.Sfx.select();
        setTimeout(next, 380);
        return;
      }
      if (ev.type === 'pickup') {
        UI.toast('Took ' + (FE.WEAPONS[ev.item] || FE.EXTRA_ITEMS[ev.item]).name + '.');
        setTimeout(next, 250);
        return;
      }
      next();
    }
    next();
  }

  function showQueuedLevelUps(log, done, resolve) {
    var ups = log.filter(function (e) { return e.type === 'levelup'; });
    if (!ups.length) { done(); return; }
    var i = 0;
    function nextUp() {
      if (i >= ups.length) { done(); return; }
      var ev = ups[i++];
      var u = resolve ? resolve(ev) : unitByUid(ev.unit);
      if (!u) { nextUp(); return; }
      FE.Sfx.levelup();
      var m = UI.modal(null);
      m._box.classList.add('lvl-box');
      var b = m._body;
      var lcv = FE.portrait(u.id, u.cls, 'player', 2);
      var limg = el('canvas', 'por-sheet');
      limg.width = lcv.width; limg.height = lcv.height;
      limg.getContext('2d').drawImage(lcv, 0, 0);
      b.appendChild(limg);
      b.appendChild(el('div', 'lvl-n', u.name + ' — Level ' + ev.level));
      var grid = el('div', 'lvl-grid');
      var names = { hp: 'HP', str: 'Str', mag: 'Mag', skl: 'Skl', spd: 'Spd', lck: 'Lck', def: 'Def', res: 'Res' };
      Object.keys(names).forEach(function (s) {
        var g = ev.gains[s] || 0;
        var cell = el('div', 'lvl-cell' + (g ? ' up' : ''));
        cell.appendChild(el('span', 'lc-n', names[s]));
        var cur = (s === 'hp') ? u.maxhp : u[s];
        cell.appendChild(el('span', 'lc-v', String(cur)));
        cell.appendChild(el('span', 'lc-g', g ? '+' + g : ''));
        grid.appendChild(cell);
      });
      b.appendChild(grid);
      b.appendChild(UI.button('Continue', 'primary', function () { closeModal(m); nextUp(); }));
      openModal(m);
    }
    nextUp();
  }

  function unitByUid(uid) {
    if (uid === undefined || uid === null) return null;
    for (var i = 0; i < G.state.units.length; i++) if (G.state.units[i].uid === uid) return G.state.units[i];
    return null;
  }

  function cancelTargeting() {
    hideForecast();
    G.mode = 'menu';
    if (G.selectedUnit) openActionMenu(G.selectedUnit);
  }

  /* ---------------- staff flow ---------------- */

  function beginStaff(u, targets) {
    closeActionMenu();
    G.mode = 'target';

    function useOn(target) {
      var item = bestStaffFor(u, target);
      if (!item) return;
      hideForecast();
      G.pendingTarget = null;
      G.busy = true;
      G.mode = 'busy';
      G.overlay = null;
      var log = FE.useStaff(G.state, u, target, item);
      playCombatLog(log, function () { G.busy = false; finishUnit(u); });
    }

    /* clicking the ally is the whole interaction */
    G.pendingTarget = {
      valid: function (t) { return targets.indexOf(t) !== -1 && !!bestStaffFor(u, t); },
      pick: useOn
    };

    /* light up everyone who can be helped, and offer them as buttons too, so
       this works the same by click, by keyboard and on a phone */
    var ov = {};
    targets.forEach(function (t) { ov[FE.posKey(t.x, t.y)] = 'staff'; });
    ov[FE.posKey(u.x, u.y)] = 'move';
    G.overlay = ov;

    var first = targets[0];
    G.cursor = { x: first.x, y: first.y };
    FE.ensureVisible(G.state, first.x, first.y);

    var p = $('forecast');
    clear(p);
    p.classList.add('open');
    /* anchor on the healer and everyone she can reach, so the list never
       lands on top of the people it is describing */
    var lowest = u.y;
    targets.forEach(function (t) { lowest = Math.max(lowest, t.y); });
    placePanel(u.x, lowest);
    var box = el('div', 'fc-staff');
    box.appendChild(el('div', 'fc-w', 'Choose who to heal'));
    targets.forEach(function (t) {
      var item = bestStaffFor(u, t);
      if (!item) return;
      var d = FE.itemData(item);
      var amt = d.staff === 'heal'
        ? Math.min(FE.healAmount(u, item), t.maxhp - t.hp)
        : 0;
      var line = el('div', 'staff-pick');
      line.appendChild(el('span', 'sp-n', t.name));
      line.appendChild(el('span', 'sp-hp', t.hp + '/' + t.maxhp));
      line.appendChild(el('span', 'sp-a', d.staff === 'heal' ? '+' + amt : d.staff));
      line.appendChild(el('span', 'sp-w', d.name));
      line.addEventListener('click', function () { FE.Sfx.select(); useOn(t); });
      p.appendChild(line);
    });
    p.insertBefore(box, p.firstChild);

    var bar = el('div', 'fc-bar');
    bar.appendChild(UI.button('Back', 'cancel', function () { hideForecast(); cancelTargeting(); }));
    p.appendChild(bar);
  }

  /* ---------------- other actions ---------------- */

  function doTalk(u, target) {
    closeActionMenu();
    var key = u.id + '>' + target.id;
    var lines = FE.STORY.talks[key] || [{ who: target.name, text: 'Fine. I am with you.' }];
    G.busy = true;
    runDialogue(lines, function () {
      G.scene = 'battle';
      target.faction = 'player';
      target.recruitable = false;
      target.ai = null;
      target.expLocked = false;
      target.acted = true;
      target.moved = true;
      target.supports = target.supports || {};
      if (G.campaign.recruited.indexOf(target.id) === -1) G.campaign.recruited.push(target.id);
      if (!G.campaign.roster[target.id]) G.campaign.roster[target.id] = FE.makeRosterUnit(target.id);
      UI.toast(target.name + ' joined.', 'good');
      FE.recomputeSupports(G.state);
      G.busy = false;
      finishUnit(u);
    });
  }

  function doVisit(u, v) {
    closeActionMenu();
    FE.Undo.push(G.state, 'visit');
    var ev = FE.STORY.villages[v.event] || { lines: [{ who: 'Villager', text: 'Bless you.' }] };
    v.done = true;
    G.busy = true;
    runDialogue(ev.lines || [], function () {
      G.scene = 'battle';
      if (ev.gold) { G.state.gold += ev.gold; UI.toast('+' + ev.gold + ' gold', 'good'); }
      if (ev.gift) {
        if (u.items.length < 5) u.items.push(FE.mkItem(ev.gift));
        else G.state.convoy.push(FE.mkItem(ev.gift));
        UI.toast('Received ' + FE.WEAPONS[ev.gift].name, 'good');
      }
      if (ev.recruit) {
        var id = ev.recruit;
        if (!G.campaign.roster[id]) G.campaign.roster[id] = FE.makeRosterUnit(id);
        if (G.campaign.recruited.indexOf(id) === -1) G.campaign.recruited.push(id);
        var nu = JSON.parse(JSON.stringify(G.campaign.roster[id]));
        nu.uid = FE.nextUid();
        nu.faction = 'player';
        nu.alive = true; nu.hp = nu.maxhp;
        nu.acted = true; nu.moved = true;
        var spot = freeNeighbour(G.state, u.x, u.y, nu);
        nu.x = spot.x; nu.y = spot.y;
        G.state.units.push(nu);
        UI.toast(nu.name + ' joined.', 'good');
      }
      G.busy = false;
      finishUnit(u);
    });
  }

  function freeNeighbour(s, x, y, u) {
    for (var i = 0; i < FE.DIRS.length; i++) {
      var nx = x + FE.DIRS[i][0], ny = y + FE.DIRS[i][1];
      if (!FE.inBounds(s, nx, ny)) continue;
      if (FE.unitAt(s, nx, ny)) continue;
      var t = FE.tileAt(s, nx, ny);
      if (FE.moveCost(t, FE.CLASSES[u.cls].moveType) >= FE.IMPASSABLE) continue;
      return { x: nx, y: ny };
    }
    return { x: x, y: y };
  }

  function doChest(u, c) {
    closeActionMenu();
    FE.Undo.push(G.state, 'chest');
    consumeOpener(u, 'chest');
    c.done = true;
    G.state.openedChests[FE.posKey(c.x, c.y)] = 1;
    if (u.items.length < 5) u.items.push(FE.mkItem(c.item));
    else G.state.convoy.push(FE.mkItem(c.item));
    UI.toast('Found ' + FE.WEAPONS[c.item].name + '.', 'good');
    FE.Sfx.levelup();
    finishUnit(u);
  }

  function doDoor(u, d) {
    closeActionMenu();
    FE.Undo.push(G.state, 'door');
    consumeOpener(u, 'door');
    G.state.openedDoors[FE.posKey(d.x, d.y)] = 1;
    UI.toast('The door opens.');
    finishUnit(u);
  }

  /* ---------------- the arena, on the map ---------------- */

  function doArena(u) {
    closeActionMenu();
    G.mode = 'busy';
    G.busy = true;
    FE.Music.play('arena');
    openArenaRound(u);
  }

  function leaveArena(u) {
    G.busy = false;
    FE.Music.play(G.state.phase === 'player' ? 'player' : 'enemy');
    FE.recomputeSupports(G.state);
    updateHud();
    updateTileInfo();
    /* entering the arena costs nothing, so the unit still has its action */
    if (u.alive && !u.acted) {
      G.mode = 'menu';
      openActionMenu(u);
    } else {
      clearSelection();
    }
  }

  function openArenaRound(u) {
    var left = FE.arenaRoundsLeft(G.state, u);
    if (left <= 0 || u.hp <= 1) { leaveArena(u); return; }

    var roundNo = FE.ARENA_CAP - left + 1;
    var opp = FE.arenaOpponent(u, roundNo, roundNo * 17 + u.level);
    var purse = FE.arenaPurse(u, roundNo);
    var pv = FE.arenaPreview(u, opp);

    var m = UI.modal('The Arena — Round ' + roundNo, true);
    m._box.classList.add('arena-box');
    var b = m._body;

    b.appendChild(el('div', 'arena-purse', 'Purse ' + purse + 'g   ·   ' + left + ' bout' + (left === 1 ? '' : 's') + ' left for ' + u.name));

    var card = el('div', 'arena-vs');
    function sideCard(unit, faction, side, data, weapon) {
      var c = el('div', 'av-side ' + side);
      c.appendChild(UI.sprite(unit.cls, faction, 44));
      var info = el('div', 'av-info');
      info.appendChild(el('div', 'av-n', unit.name));
      info.appendChild(el('div', 'av-c', FE.CLASSES[unit.cls].name + '  Lv' + unit.level));
      var hp = el('div', 'av-hp');
      hp.appendChild(UI.hpBar(unit.hp, unit.maxhp));
      hp.appendChild(el('span', null, unit.hp + '/' + unit.maxhp));
      info.appendChild(hp);
      if (data) {
        info.appendChild(UI.row('Dmg', String(data.dmg) + (data.doubles ? ' ×2' : '')));
        info.appendChild(UI.row('Hit', data.hit + '%'));
        info.appendChild(UI.row('Crit', data.crit + '%'));
      }
      info.appendChild(el('div', 'av-w', weapon || ''));
      c.appendChild(info);
      return c;
    }
    card.appendChild(sideCard(u, 'player', 'me', pv && pv.me, pv && pv.myWeapon));
    card.appendChild(el('div', 'av-vs', 'VS'));
    card.appendChild(sideCard(opp, 'enemy', 'them', pv && pv.them, pv && pv.oppWeapon));
    b.appendChild(card);

    if (pv && pv.them && pv.them.dmg * (pv.them.doubles ? 2 : 1) >= u.hp) {
      b.appendChild(el('div', 'arena-warn', 'This one can put ' + u.name + ' down in a single exchange.'));
    }

    var bar = el('div', 'fc-bar');
    bar.appendChild(UI.button('Fight', 'primary', function () {
      closeModal(m);
      runArenaBout(u, opp, purse, roundNo);
    }));
    bar.appendChild(UI.button('Walk away', 'cancel', function () {
      closeModal(m);
      leaveArena(u);
    }));
    b.appendChild(bar);
    openModal(m);
  }

  function runArenaBout(u, opp, purse, roundNo) {
    /* snapshot first: undo backs out the whole bout, dice and all */
    FE.Undo.push(G.state, 'arena');
    FE.arenaSpendRound(G.state, u);

    var startHp = u.hp, oppHp = opp.maxhp;
    var res = FE.arenaFight(u, opp, G.state.rng);
    if (res.error) { UI.toast(u.name + ' has no usable weapon.'); leaveArena(u); return; }

    var m = UI.modal('The Arena — Round ' + roundNo, true);
    m._box.classList.add('duel-box');
    var b = m._body;
    var cv = el('canvas', 'duel-canvas');
    cv.width = FE.DUEL_W * 2;
    cv.height = FE.DUEL_H * 2;
    b.appendChild(cv);

    var bar = el('div', 'fc-bar');
    bar.appendChild(UI.button('Skip', 'cancel', function () { if (FE.duelSkip) FE.duelSkip(); }));
    b.appendChild(bar);
    m.addEventListener('click', function () { if (FE.duelSkip) FE.duelSkip(); });
    openModal(m);

    FE.playDuel(cv, {
      you: { cls: u.cls, faction: 'player', name: u.name, hp: startHp, maxhp: u.maxhp },
      foe: { cls: opp.cls, name: FE.CLASSES[opp.cls].name, hp: oppHp, maxhp: opp.maxhp },
      log: res.log,
      uidYou: 1,
      uidFoe: 2,
      distance: 1,
      scene: 'arena',
      speed: animSpeed(),
      onDone: function () {
        closeModal(m);
        settleArena(u, res, purse, roundNo);
      }
    });
  }

  function settleArena(u, res, purse, roundNo) {
    var me = res.me;
    /* carry the bout back onto the real unit */
    ['level', 'exp', 'maxhp', 'str', 'mag', 'skl', 'spd', 'lck', 'def', 'res', 'con', 'cls', 'mov'].forEach(function (k) {
      u[k] = me[k];
    });
    u.items = JSON.parse(JSON.stringify(me.items));
    u.hp = res.won ? Math.max(1, me.hp) : 1;

    showQueuedLevelUps(res.log, function () {
      var m = UI.modal(res.won ? 'Bout won' : 'Knocked down', false);
      var b = m._body;
      if (res.won) {
        G.state.gold += purse;
        b.appendChild(UI.row('Purse', '+' + purse + 'g'));
        var gained = res.log.filter(function (e) { return e.type === 'exp'; })
          .reduce(function (a, e) { return a + e.amount; }, 0);
        b.appendChild(UI.row('Experience', '+' + gained));
        b.appendChild(UI.row(u.name + "'s HP", u.hp + '/' + u.maxhp));
        FE.Sfx.levelup();
      } else {
        b.appendChild(el('p', 'bad-note', u.name + ' went down. Dragged out at 1 HP, and the enemy is still coming.'));
        b.appendChild(el('p', 'note', 'Undo rewinds the bout if you would rather not have risked it.'));
        FE.Sfx.death();
      }
      var left = FE.arenaRoundsLeft(G.state, u);
      var bar = el('div', 'fc-bar');
      if (res.won && left > 0 && u.hp > 1) {
        bar.appendChild(UI.button('Next bout (' + left + ')', 'primary', function () {
          closeModal(m); openArenaRound(u);
        }));
      }
      bar.appendChild(UI.button('Leave the arena', res.won ? '' : 'primary', function () {
        closeModal(m); leaveArena(u);
      }));
      b.appendChild(bar);
      openModal(m);
    }, function () { return u; });
  }

  function doSeize(u) {
    closeActionMenu();
    G.state.seized = true;
    finishUnit(u);
  }

  /* The convoy, opened mid-battle. Same two-column shape as Trade, but the
     other side is the baggage train rather than an ally, and it is bottomless.
     Taking a weapon out mid-fight is the whole point, so this ends the unit's
     turn exactly as trading does. */
  function beginSupply(u, holder) {
    closeActionMenu();
    FE.Undo.push(G.state, 'supply');
    var m = UI.modal('Supply', true);
    var b = m._body;
    var filter = 'all';

    function render() {
      clear(b);
      if (holder !== u) {
        b.appendChild(el('div', 'note', u.name + ' is reaching into ' + holder.name + "'s baggage."));
      }

      var chips = el('div', 'chip-row');
      [['all', 'Everything'], ['weapon', 'Weapons'], ['staff', 'Staves'], ['item', 'Items']].forEach(function (f) {
        var c = el('div', 'chip' + (filter === f[0] ? ' on' : ''), f[1]);
        c.addEventListener('click', function () { FE.Sfx.select(); filter = f[0]; render(); });
        chips.appendChild(c);
      });
      b.appendChild(chips);

      var cols = el('div', 'two-col');

      var mine = UI.panel(u.name + '  (' + u.items.length + '/5)');
      u.items.forEach(function (it, idx) {
        var line = UI.itemLine(it);
        line.appendChild(UI.button('Store', 'tiny', function () {
          FE.Sfx.select();
          G.state.convoy.push(u.items.splice(idx, 1)[0]);
          render();
        }));
        mine._body.appendChild(line);
      });
      if (!u.items.length) mine._body.appendChild(el('div', 'note', 'Carrying nothing.'));
      cols.appendChild(mine);

      var shown = [];
      G.state.convoy.forEach(function (it, idx) {
        var d = FE.itemData(it);
        if (!d) return;
        if (filter === 'weapon' && (d.type === 'item' || d.type === 'staff')) return;
        if (filter === 'staff' && d.type !== 'staff') return;
        if (filter === 'item' && d.type !== 'item') return;
        shown.push({ it: it, idx: idx, d: d });
      });
      /* usable first: a sword she cannot swing is not what she is looking for */
      var cl = FE.CLASSES[u.cls];
      function usable(d) {
        if (d.type === 'item') return true;
        if (d.personal && d.personal !== u.id) return false;
        return cl.weapons.indexOf(d.type) !== -1;
      }
      shown.sort(function (a, z) { return (usable(z.d) ? 1 : 0) - (usable(a.d) ? 1 : 0); });

      var conv = UI.panel('Convoy (' + G.state.convoy.length + ')');
      shown.forEach(function (row) {
        var ok = usable(row.d);
        var line = UI.itemLine(row.it, { dim: !ok });
        if (!ok) line.appendChild(el('span', 'note', u.name + ' cannot use this'));
        line.appendChild(UI.button('Take', 'tiny', function () {
          if (u.items.length >= 5) { UI.toast(u.name + ' is carrying five items already.'); return; }
          FE.Sfx.select();
          u.items.push(G.state.convoy.splice(row.idx, 1)[0]);
          render();
        }));
        conv._body.appendChild(line);
      });
      if (!shown.length) {
        conv._body.appendChild(el('div', 'note',
          G.state.convoy.length ? 'Nothing of that kind in the convoy.' : 'The convoy is empty.'));
      }
      cols.appendChild(conv);
      b.appendChild(cols);

      var bar = el('div', 'fc-bar');
      bar.appendChild(UI.button('Done', 'primary', function () {
        closeModal(m);
        finishUnit(u);
      }));
      bar.appendChild(UI.button('Cancel', 'cancel', function () {
        closeModal(m);
        FE.Undo.pop(G.state);
        clearSelection();
        updateHud();
        updateTileInfo();
      }));
      b.appendChild(bar);
    }
    render();
    openModal(m);
  }

  function beginTrade(u, allies) {
    closeActionMenu();
    var other = allies[0];
    var m = UI.modal('Trade', true);
    var b = m._body;
    function render() {
      clear(b);
      if (allies.length > 1) {
        var chips = el('div', 'chip-row');
        allies.forEach(function (a) {
          var c = el('div', 'chip' + (a === other ? ' on' : ''), a.name);
          c.addEventListener('click', function () { other = a; render(); });
          chips.appendChild(c);
        });
        b.appendChild(chips);
      }
      var cols = el('div', 'two-col');
      [[u, other], [other, u]].forEach(function (pair) {
        var from = pair[0], to = pair[1];
        var p = UI.panel(from.name + ' (' + from.items.length + '/5)');
        from.items.forEach(function (it, idx) {
          var line = UI.itemLine(it);
          line.appendChild(UI.button('⇄', 'tiny', function () {
            if (to.items.length >= 5) { UI.toast(to.name + ' is full.'); return; }
            to.items.push(from.items.splice(idx, 1)[0]);
            render();
          }));
          p._body.appendChild(line);
        });
        cols.appendChild(p);
      });
      b.appendChild(cols);
      b.appendChild(UI.button('Done', 'primary', function () {
        closeModal(m);
        u.acted = true; u.moved = true;
        FE.addSupport(u, other, 3);
        finishUnit(u);
      }));
    }
    FE.Undo.push(G.state, 'trade');
    render();
    openModal(m);
  }

  function showInventory(u, canUse) {
    var m = UI.modal(u.name + "'s items", false);
    var b = m._body;
    function render() {
      clear(b);
      u.items.forEach(function (it, idx) {
        var d = FE.itemData(it) || FE.EXTRA_ITEMS[it.key];
        var line = UI.itemLine(it);
        if (canUse && d && d.type === 'item' && d.use && d.use !== 'none') {
          line.appendChild(UI.button('Use', 'tiny', function () {
            useItem(u, idx, function () { closeModal(m); });
          }));
        }
        if (canUse && d && (d.type !== 'item') && idx > 0) {
          line.appendChild(UI.button('Equip', 'tiny', function () {
            var it2 = u.items.splice(idx, 1)[0];
            u.items.unshift(it2);
            render();
          }));
        }
        if (d && d.desc) line.appendChild(el('div', 'item-d', d.desc));
        b.appendChild(line);
      });
      if (!u.items.length) b.appendChild(el('div', 'note', 'Carrying nothing.'));
      b.appendChild(UI.button('Close', '', function () { closeModal(m); }));
    }
    render();
    openModal(m);
  }

  function useItem(u, idx, done) {
    var it = u.items[idx];
    var d = FE.itemData(it);
    if (!d) return;
    FE.Undo.push(G.state, 'item');
    if (d.use === 'heal') {
      var amt = Math.min(d.power >= 999 ? u.maxhp : d.power, u.maxhp - u.hp);
      u.hp += amt;
      FE.addPopup(u.x, u.y, '+' + amt, '#8ef0a0');
      FE.Sfx.heal();
      UI.toast(u.name + ' recovered ' + amt + ' HP.');
    } else if (d.use === 'res') {
      u.res += 7; u.resBuff = (u.resBuff || 0) + 7; u.resBuffTurns = 5;
      UI.toast('Resistance up.');
    } else if (d.use === 'boost') {
      var r = FE.applyBooster(u, it);
      UI.toast(u.name + "'s " + r.stat + ' +' + r.amount + '.', 'good');
      FE.Sfx.levelup();
    } else if (d.use === 'promote') {
      doPromote(u, function () { done(); finishUnit(u); });
      /* the promotion flow consumes the item itself */
      it.uses = 0;
      cleanupItem(u, idx);
      return;
    } else { return; }
    cleanupItemUse(u, idx);
    done();
    finishUnit(u);
  }

  function cleanupItemUse(u, idx) {
    var it = u.items[idx];
    if (!it) return;
    if (it.uses !== null) {
      it.uses--;
      if (it.uses <= 0) u.items.splice(idx, 1);
    }
  }
  function cleanupItem(u, idx) {
    if (u.items[idx]) u.items.splice(idx, 1);
  }

  function doPromote(u, done) {
    if (!FE.canPromote(u)) { UI.toast(u.name + ' must reach level ' + FE.PROMOTE_MIN + ' first.'); done(); return; }
    var cl = FE.CLASSES[u.cls];
    var m = UI.modal('Promotion — ' + u.name, true);
    var b = m._body;
    b.appendChild(el('p', 'note', 'Choose a path. This is permanent, and level resets to 1 in the new class.'));
    cl.promotions.forEach(function (key) {
      var to = FE.CLASSES[key];
      var card = el('div', 'promo-card');
      card.appendChild(UI.sprite(key, 'player', 44));
      var info = el('div', 'pc-info');
      info.appendChild(el('div', 'pc-n', to.name));
      info.appendChild(el('div', 'pc-w', to.weapons.map(FE.typeName).join(' · ') + '   Mov ' + to.mov));
      var bon = to.promoBonus || {};
      var parts = [];
      ['hp', 'str', 'mag', 'skl', 'spd', 'def', 'res', 'con'].forEach(function (s) {
        if (bon[s]) parts.push(s.toUpperCase() + ' +' + bon[s]);
      });
      info.appendChild(el('div', 'pc-b', parts.join('  ')));
      card.appendChild(info);
      card.addEventListener('click', function () {
        FE.Sfx.levelup();
        FE.promote(G.state, u, key);
        closeModal(m);
        UI.toast(u.name + ' is now a ' + to.name + '.', 'good');
        done();
      });
      b.appendChild(card);
    });
    b.appendChild(UI.button('Not yet', 'cancel', function () { closeModal(m); done(); }));
    openModal(m);
  }

  /* ---------------- unit info ---------------- */

  function showUnitInfo(u, faction) {
    var m = UI.modal(null, true);
    m._box.classList.add('info-box');
    var b = m._body;

    var head = el('div', 'info-head');
    var pcv = FE.portrait(u.id, u.cls, u.boss ? 'boss' : (faction || 'player'), 2);
    var pimg = el('canvas', 'por-sheet');
    pimg.width = pcv.width; pimg.height = pcv.height;
    pimg.getContext('2d').drawImage(pcv, 0, 0);
    head.appendChild(pimg);
    var ht = el('div', 'ih-t');
    ht.appendChild(el('div', 'ih-n', u.full || u.name));
    ht.appendChild(el('div', 'ih-c', FE.CLASSES[u.cls].name + '   Level ' + u.level + (u.title ? '   ·   ' + u.title : '')));
    var bars = el('div', 'ih-bars');
    var hpline = el('div', 'ih-hp');
    hpline.appendChild(UI.hpBar(u.hp, u.maxhp));
    hpline.appendChild(el('span', null, u.hp + '/' + u.maxhp));
    bars.appendChild(hpline);
    if (faction === 'player') {
      var exline = el('div', 'ih-exp');
      exline.appendChild(UI.expBar(u.exp));
      exline.appendChild(el('span', null, 'EXP ' + u.exp));
      bars.appendChild(exline);
    }
    ht.appendChild(bars);
    head.appendChild(ht);
    b.appendChild(head);

    /* the full stat sheet */
    var caps = FE.CLASSES[u.cls].caps;
    var eq = FE.equipped(u);
    var sheet = el('div', 'sheet');
    function stat(label, val, cap) {
      var c = el('div', 'st');
      c.appendChild(el('span', 'st-n', label));
      c.appendChild(el('span', 'st-v', String(val)));
      if (cap !== undefined) {
        var bar = el('div', 'st-bar');
        var f = el('div', 'st-bar-f');
        f.style.width = Math.min(100, (val / cap) * 100) + '%';
        if (val >= cap) f.classList.add('maxed');
        bar.appendChild(f);
        c.appendChild(bar);
        c.appendChild(el('span', 'st-c', '/' + cap));
      }
      sheet.appendChild(c);
    }
    stat('HP', u.maxhp, caps.hp);
    stat('Str', u.str, caps.str);
    stat('Mag', u.mag, caps.mag);
    stat('Skl', u.skl, caps.skl);
    stat('Spd', u.spd, caps.spd);
    stat('Lck', u.lck, caps.lck);
    stat('Def', u.def, caps.def);
    stat('Res', u.res, caps.res);
    stat('Con', u.con, caps.con);
    stat('Mov', u.mov);
    b.appendChild(sheet);

    var derived = el('div', 'derived');
    var terr = G.state ? FE.tileAt(G.state, u.x, u.y) : null;
    derived.appendChild(UI.row('Attack', String(eq ? FE.atk(u, eq) : 0)));
    derived.appendChild(UI.row('Hit', String(eq ? FE.hitStat(u, eq) : 0)));
    derived.appendChild(UI.row('Crit', String(eq ? FE.critStat(u, eq) : 0)));
    derived.appendChild(UI.row('Avoid', String(FE.avoidStat(u, eq, terr))));
    derived.appendChild(UI.row('Dodge', String(FE.dodgeStat(u))));
    derived.appendChild(UI.row('Atk Spd', String(FE.attackSpeed(u, eq))));
    derived.appendChild(UI.row('Affinity', FE.AFFINITY_NAME[u.affinity] || '—'));
    b.appendChild(derived);

    var inv = UI.panel('Inventory');
    (u.items || []).forEach(function (it) { inv._body.appendChild(UI.itemLine(it)); });
    if (!u.items || !u.items.length) inv._body.appendChild(el('div', 'note', 'Carrying nothing.'));
    b.appendChild(inv);

    if (faction === 'player') {
      var gp = UI.panel('Growth rates');
      var gr = el('div', 'growths');
      ['hp', 'str', 'mag', 'skl', 'spd', 'lck', 'def', 'res'].forEach(function (s) {
        var c = el('div', 'gr');
        c.appendChild(el('span', 'gr-n', s.toUpperCase()));
        c.appendChild(el('span', 'gr-v', (u.growth[s] || 0) + '%'));
        gr.appendChild(c);
      });
      gp._body.appendChild(gr);
      b.appendChild(gp);

      if (G.state) {
        var sup = FE.supportList(u, G.state).filter(function (s) { return s.rank; });
        if (sup.length) {
          var sp = UI.panel('Supports');
          sup.forEach(function (s) { sp._body.appendChild(UI.row(s.name, s.rank)); });
          b.appendChild(sp);
        }
      }

      if (FE.canPromote(u)) {
        var pi = FE.promotionItemFor(u);
        var has = (u.items || []).some(function (it) { return it.key === pi; });
        if (has) {
          b.appendChild(UI.button('Promote', 'primary', function () {
            closeModal(m);
            var idx = u.items.findIndex(function (it) { return it.key === pi; });
            doPromote(u, function () {
              if (idx !== -1) u.items.splice(idx, 1);
            });
          }));
        } else {
          b.appendChild(el('div', 'note', 'Ready to promote. Needs a ' + FE.WEAPONS[pi].name + '.'));
        }
      }
    }

    if (u.bio) b.appendChild(el('p', 'bio', u.bio));
    if (u.quote) b.appendChild(el('p', 'quote', '“' + u.quote + '”'));

    b.appendChild(UI.button('Close', '', function () { closeModal(m); }));
    openModal(m);
  }

  /* ---------------- turn flow ---------------- */

  function afterAction() {
    var r = FE.checkResult(G.state);
    if (r) { endBattle(r); return; }
    /* auto end turn when everyone has acted */
    var any = G.state.units.some(function (u) { return u.alive && u.faction === 'player' && !u.acted; });
    if (!any) setTimeout(endPlayerTurn, 450);
  }

  function endPlayerTurn() {
    if (G.state.phase !== 'player' || G.busy) return;
    closeActionMenu();
    clearSelection();
    FE.tickSupports(G.state, 2);
    FE.beginEnemyPhase(G.state);
    FE.Undo.clear(G.state);
    updateHud();
    FE.Music.play('enemy');
    flashBanner('ENEMY PHASE', 'enemy', function () { runEnemyPhase(); });
  }

  function runEnemyPhase() {
    G.busy = true;
    var queue = G.state.units.filter(function (u) { return u.alive && u.faction === 'enemy'; });
    var i = 0;

    function nextUnit() {
      if (i >= queue.length) { finishEnemyPhase(); return; }
      var u = queue[i++];
      if (!u.alive) { nextUnit(); return; }
      var act = FE.aiDecide(G.state, u);
      if (!act || act.type === 'wait') { nextUnit(); return; }

      if (act.type === 'move') {
        var reach = FE.reachable(G.state, u);
        var path = FE.pathTo(G.state, u, reach, act.x, act.y) || [{ x: act.x, y: act.y }];
        FE.ensureVisible(G.state, act.x, act.y);
        animatePath(u, path, function () {
          u.x = act.x; u.y = act.y;
          FE.R.moveAnim = null;
          FE.updateFog(G.state);
          if (act.then && act.then.type === 'raze') razeVillage(act.then.village);
          setTimeout(nextUnit, 90);
        });
        return;
      }

      if (act.type === 'raze') { razeVillage(act.village); setTimeout(nextUnit, 300); return; }

      if (act.type === 'attack') {
        var reach2 = FE.reachable(G.state, u);
        var path2 = FE.pathTo(G.state, u, reach2, act.x, act.y) || [{ x: act.x, y: act.y }];
        FE.ensureVisible(G.state, act.x, act.y);
        animatePath(u, path2, function () {
          u.x = act.x; u.y = act.y;
          FE.R.moveAnim = null;
          FE.updateFog(G.state);
          var log = FE.resolveCombat(G.state, u, act.target, act.item);
          playCombatLog(log, function () {
            var r = FE.checkResult(G.state);
            if (r) { endBattle(r); return; }
            setTimeout(nextUnit, 120);
          });
        });
        return;
      }

      if (act.type === 'staff') {
        var reach3 = FE.reachable(G.state, u);
        var path3 = FE.pathTo(G.state, u, reach3, act.x, act.y) || [{ x: act.x, y: act.y }];
        animatePath(u, path3, function () {
          u.x = act.x; u.y = act.y;
          FE.R.moveAnim = null;
          var log = FE.useStaff(G.state, u, act.target, act.item);
          playCombatLog(log, function () { setTimeout(nextUnit, 120); });
        });
        return;
      }
      nextUnit();
    }
    nextUnit();
  }

  function razeVillage(v) {
    var real = FE.villageAt(G.state, v.x, v.y);
    if (!real || real.done) return;
    real.done = true;
    real.razed = true;
    FE.R.shake = 8;
    FE.addPopup(v.x, v.y, 'BURNED', '#ff7a5a');
    UI.toast('A village was destroyed.', 'bad');
  }

  function finishEnemyPhase() {
    var r = FE.checkResult(G.state);
    if (r) { endBattle(r); return; }
    FE.endTurn(G.state);
    r = FE.checkResult(G.state);
    if (r) { endBattle(r); return; }
    FE.beginPlayerPhase(G.state);
    FE.Undo.reset(G.state);
    FE.Undo.push(G.state, 'turn start');
    G.busy = false;
    updateHud();
    updateTileInfo();
    FE.Music.play('player');
    flashBanner('PLAYER PHASE', 'player', function () { });
    autoSave();
  }

  function flashBanner(text, kind, done) {
    var bn = $('banner');
    bn.textContent = text;
    bn.className = 'show ' + kind;
    setTimeout(function () {
      bn.className = '';
      if (done) done();
    }, 900);
  }

  /* ---------------- battle end ---------------- */

  function endBattle(result) {
    if (G.ended) return;
    G.ended = true;
    G.busy = true;
    closeActionMenu();
    hideForecast();

    if (result === 'win') {
      FE.Music.play('victory');
      flashBanner('CHAPTER CLEAR', 'player', function () { showResults(true); });
    } else {
      FE.Music.play('defeat');
      flashBanner(result === 'lordfell' ? 'SEREN HAS FALLEN' : 'DEFEAT', 'enemy', function () { showResults(false, result); });
    }
  }

  function showResults(won, reason) {
    var s = G.state;
    var ch = curChapter();
    var skirmish = !!ch.skirmish;
    var title = skirmish
      ? (won ? ch.name + ' cleared' : 'Driven off')
      : (won ? 'Chapter ' + ch.number + ' Clear' : 'Chapter Failed');
    var m = UI.modal(title, true);
    var b = m._body;

    if (!won) {
      b.appendChild(el('p', 'bad-note',
        skirmish ? 'The field is theirs. Nobody is lost for good \u2014 walk back and try it again.'
          : (reason === 'lordfell' ? FE.STORY.gameOver.lord : FE.STORY.gameOver.objective)));
      b.appendChild(UI.button(skirmish ? 'Try again' : 'Retry Chapter', 'primary', function () {
        closeModal(m);
        G.ended = false;
        G.busy = false;
        showPrep();
      }));
      if (skirmish) {
        b.appendChild(UI.button('Back to the map', '', function () {
          closeModal(m); G.ended = false; G.busy = false;
          $('game').classList.remove('in-battle');
          G.chapter = null;
          showWorldMap();
        }));
      }
      b.appendChild(UI.button('Back to Title', '', function () {
        closeModal(m); G.ended = false; G.busy = false;
        $('game').classList.remove('in-battle');
        showTitle();
      }));
      openModal(m);
      return;
    }

    b.appendChild(UI.row('Turns taken', String(s.turn)));
    var lost = (s.benched || []).length;
    b.appendChild(UI.row('Units benched', String(lost)));
    var razed = (s.villages || []).filter(function (v) { return v.razed; }).length;
    if (s.villages && s.villages.length) b.appendChild(UI.row('Villages lost', String(razed)));

    var gold = skirmish
      ? (ch.purse || 0) + Math.max(0, (14 - s.turn)) * 15
      : 600 + ch.number * 400 + Math.max(0, (20 - s.turn)) * 25;
    s.gold += gold;
    b.appendChild(UI.row('Gold earned', String(gold)));

    var roster = UI.panel('Your units');
    s.units.filter(function (u) { return u.faction === 'player'; }).forEach(function (u) {
      var line = el('div', 'res-u');
      line.appendChild(UI.sprite(u.cls, 'player', 28));
      line.appendChild(el('span', 'ru-n', u.name));
      line.appendChild(el('span', 'ru-c', FE.CLASSES[u.cls].name + ' Lv' + u.level));
      line.appendChild(el('span', 'ru-s', u.alive ? '' : 'benched'));
      roster._body.appendChild(line);
    });
    b.appendChild(roster);

    b.appendChild(UI.button('Continue', 'primary', function () {
      closeModal(m);
      FE.commitChapter(G.campaign, s);
      G.campaign.arenaRounds = {};
      G.ended = false;
      G.busy = false;
      $('game').classList.remove('in-battle');

      if (skirmish) {
        /* a skirmish leaves the campaign exactly where it was, minus whatever
           it cost you and plus whatever you learned */
        if (ch.spire) {
          G.campaign.spireBest = Math.max(G.campaign.spireBest || 0, ch.spire);
        }
        G.chapter = null;
        saveCampaign();
        showWorldMap();
        return;
      }

      G.campaign.chapterIndex++;
      G.chapter = null;
      /* crossing into a new region should land you there rather than leaving
         you looking at the map you just finished */
      G.worldRegion = null;
      var text = FE.STORY.chapters[ch.id];
      var finale = ch.number >= FE.CHAPTERS.length;
      runDialogue(text ? text.post : [], function () {
        saveCampaign();
        if (finale) { showEpilogue(); return; }
        showWorldMap();
      });
    }));
    openModal(m);
  }

  /* ---------------- save / load ---------------- */

  function saveBlob(inBattle) {
    return JSON.stringify({
      v: 1,
      campaign: G.campaign,
      inBattle: inBattle,
      battle: inBattle ? {
        snapshot: FE.snapshotState(G.state),
        chapterIndex: G.state.chapterIndex,
        deploy: G.deploy,
        objective: G.state.objective,
        survive: G.state.survive
      } : null
    });
  }

  function doSave(inBattle) {
    try {
      localStorage.setItem(SAVE_KEY, saveBlob(inBattle));
      UI.toast('Saved.', 'good');
    } catch (e) { UI.toast('Could not save in this browser.'); }
  }
  function saveCampaign() { try { localStorage.setItem(SAVE_KEY, saveBlob(false)); } catch (e) { } }
  function autoSave() { try { localStorage.setItem(SAVE_KEY, saveBlob(true)); } catch (e) { } }

  function loadSaveMeta() {
    try {
      var raw = localStorage.getItem(SAVE_KEY);
      if (!raw) return null;
      var o = JSON.parse(raw);
      return { chapter: (o.campaign.chapterIndex + 1), inBattle: !!o.inBattle };
    } catch (e) { return null; }
  }

  function doLoad() {
    try {
      var o = JSON.parse(localStorage.getItem(SAVE_KEY));
      G.campaign = o.campaign;
      if (o.inBattle && o.battle) {
        G.deploy = o.battle.deploy;
        G.state = FE.startChapter(G.campaign, G.deploy);
        FE.restoreState(G.state, o.battle.snapshot);
        FE.recomputeSupports(G.state);
        FE.updateFog(G.state);
        G.scene = 'battle';
        G.mode = 'idle';
        G.ended = false; G.busy = false;
        FE.Undo.reset(G.state);
        FE.Undo.push(G.state, 'turn start');
        $('game').classList.add('in-battle');
        FE.resizeCanvas();
        fitZoom();
        var first = G.state.units.filter(function (u) { return u.faction === 'player' && u.alive; })[0];
        if (first) { G.cursor = { x: first.x, y: first.y }; FE.centerOn(G.state, first.x, first.y); }
        updateHud(); updateTileInfo();
        FE.Music.play(G.state.phase === 'player' ? 'player' : 'enemy');
      } else if (G.campaign.chapterIndex > 0) {
        showWorldMap();
      } else {
        startChapterFlow();
      }
    } catch (e) {
      UI.toast('Save could not be read.');
      showTitle();
    }
  }

  /* ---------------- input ---------------- */

  function bindInput() {
    var wrap = $('map-wrap');
    var down = null, moved = false, pinch = null;

    wrap.addEventListener('pointerdown', function (ev) {
      if (ev.pointerType === 'touch' && ev.isPrimary === false) return;
      down = { x: ev.clientX, y: ev.clientY, camX: FE.R.camX, camY: FE.R.camY, t: Date.now() };
      moved = false;
    });
    wrap.addEventListener('pointermove', function (ev) {
      if (!down) return;
      var dx = ev.clientX - down.x, dy = ev.clientY - down.y;
      if (Math.abs(dx) + Math.abs(dy) > 10) moved = true;
      if (moved) {
        FE.R.camX = down.camX - dx;
        FE.R.camY = down.camY - dy;
        if (G.state) FE.clampCamera(G.state);
      }
    });
    wrap.addEventListener('pointerup', function (ev) {
      if (!down) return;
      if (!moved && G.scene === 'battle') {
        var r = wrap.getBoundingClientRect();
        var t = FE.screenToTile(ev.clientX - r.left, ev.clientY - r.top);
        tapTile(t.x, t.y);
      }
      down = null;
    });
    wrap.addEventListener('pointercancel', function () { down = null; });

    wrap.addEventListener('wheel', function (ev) {
      ev.preventDefault();
      /* A trackpad pinch arrives as a wheel event with ctrlKey set; a two-finger
         slide arrives without it. Zoom on the slide only, so pinching on a
         laptop does nothing. Real touchscreens still pinch via the handlers
         below, which is the natural gesture on a phone. */
      if (ev.ctrlKey) return;
      /* Scale by how far the fingers actually moved rather than a fixed step
         per event. A trackpad fires a stream of small deltas, so a fixed 12%
         per event ran away instantly. */
      var f = Math.exp(-ev.deltaY * 0.0015);
      zoomBy(Math.max(0.93, Math.min(1.075, f)));
    }, { passive: false });

    /* pinch */
    wrap.addEventListener('touchstart', function (ev) {
      if (ev.touches.length === 2) {
        pinch = { d: touchDist(ev), zoom: FE.R.zoom };
        down = null;
      }
    }, { passive: true });
    wrap.addEventListener('touchmove', function (ev) {
      if (pinch && ev.touches.length === 2) {
        ev.preventDefault();
        var d = touchDist(ev);
        var z = pinch.zoom * (d / pinch.d);
        setZoom(z);
      }
    }, { passive: false });
    wrap.addEventListener('touchend', function (ev) {
      if (ev.touches.length < 2) pinch = null;
    });

    /* keyboard */
    document.addEventListener('keydown', function (ev) {
      if (G.scene !== 'battle') return;
      var k = ev.key;
      if (k === 'ArrowUp' || k === 'w') moveCursor(0, -1);
      else if (k === 'ArrowDown' || k === 's') moveCursor(0, 1);
      else if (k === 'ArrowLeft' || k === 'a') moveCursor(-1, 0);
      else if (k === 'ArrowRight' || k === 'd') moveCursor(1, 0);
      else if (k === 'Enter' || k === ' ') { ev.preventDefault(); tapTile(G.cursor.x, G.cursor.y); }
      else if (k === 'Escape' || k === 'x') { if (FE.Undo.canUndo(G.state)) doUndo(); else clearSelection(); }
      else if (k === 'z') doUndo();
      else if (k === 'e') endPlayerTurn();
      else if (k === 'r') toggleDanger();
      else if (k === '+' || k === '=') zoomBy(1.15);
      else if (k === '-') zoomBy(0.87);
    });
  }

  function touchDist(ev) {
    var a = ev.touches[0], b = ev.touches[1];
    return Math.hypot(a.clientX - b.clientX, a.clientY - b.clientY);
  }

  function setZoom(z) {
    var R = FE.R;
    var cx = R.camX + R.viewW / 2, cy = R.camY + R.viewH / 2;
    var ts0 = FE.tileSize();
    R.zoom = Math.max(R.minZoom, Math.min(R.maxZoom, z));
    var ts1 = FE.tileSize();
    var scale = ts1 / ts0;
    R.camX = cx * scale - R.viewW / 2;
    R.camY = cy * scale - R.viewH / 2;
    if (G.state) FE.clampCamera(G.state);
  }
  function zoomBy(f) { setZoom(FE.R.zoom * f); }

  function moveCursor(dx, dy) {
    if (!G.state) return;
    G.cursor.x = Math.max(0, Math.min(G.state.map.w - 1, G.cursor.x + dx));
    G.cursor.y = Math.max(0, Math.min(G.state.map.h - 1, G.cursor.y + dy));
    FE.ensureVisible(G.state, G.cursor.x, G.cursor.y);
    updateTileInfo();
  }

  function doUndo() {
    if (!FE.Undo.canUndo(G.state) || G.busy) return;
    hideForecast();
    closeActionMenu();
    FE.Undo.pop(G.state);
    G.selected = null; G.selectedUnit = null;
    G.mode = 'idle';
    G.overlay = G.danger ? dangerOverlay() : null;
    G.path = null;
    FE.Sfx.cancel();
    updateHud();
    updateTileInfo();
  }

  function toggleDanger() {
    G.danger = !G.danger;
    $('btn-danger').classList.toggle('on', G.danger);
    refreshOverlay();
  }

  /* repaint whatever overlay suits the current mode, danger included */
  function refreshOverlay() {
    if (G.mode === 'move' && G.selectedUnit) { buildMoveOverlay(G.selectedUnit); return; }
    if (G.mode === 'idle' || G.mode === 'menu') {
      G.overlay = G.danger ? dangerOverlay() : null;
    }
  }

  function bindToolbar() {
    $('btn-end').addEventListener('click', function () {
      if (G.state && G.state.phase === 'player' && !G.busy) endPlayerTurn();
    });
    $('btn-undo').addEventListener('click', doUndo);
    $('btn-danger').addEventListener('click', toggleDanger);
    $('btn-menu').addEventListener('click', showBattleMenu);
    $('btn-zin').addEventListener('click', function () { zoomBy(1.18); });
    $('btn-zout').addEventListener('click', function () { zoomBy(0.85); });
  }

  function showBattleMenu() {
    var m = UI.modal('Menu');
    var b = m._body;
    b.appendChild(UI.button('Unit list', '', function () { closeModal(m); showUnitList(); }));
    b.appendChild(UI.button('Objective', '', function () {
      UI.toast(curChapter().objectiveText);
    }));
    b.appendChild(UI.button('Suspend & save', '', function () { doSave(true); closeModal(m); }));
    var modes = { full: 'Full', fast: 'Fast', off: 'Off' };
    b.appendChild(UI.button('Battle animations: ' + modes[animMode()], '', function () {
      var order = ['full', 'fast', 'off'];
      setAnimMode(order[(order.indexOf(animMode()) + 1) % order.length]);
      closeModal(m); showBattleMenu();
    }));
    b.appendChild(UI.button(FE.Music.isEnabled() ? 'Music: on' : 'Music: off', '', function () {
      FE.Music.setEnabled(!FE.Music.isEnabled());
      closeModal(m); showBattleMenu();
    }));
    b.appendChild(UI.button('How to play', '', function () { closeModal(m); showHelp(); }));
    b.appendChild(UI.button('Restart chapter', 'warn', function () {
      closeModal(m);
      G.ended = false; G.busy = false;
      $('game').classList.remove('in-battle');
      showPrep();
    }));
    b.appendChild(UI.button('Close', 'cancel', function () { closeModal(m); }));
    openModal(m);
  }

  function showUnitList() {
    var m = UI.modal('Units on the field', true);
    var b = m._body;
    ['player', 'enemy'].forEach(function (f) {
      var p = UI.panel(f === 'player' ? 'Yours' : 'Enemy');
      G.state.units.filter(function (u) { return u.faction === f; }).forEach(function (u) {
        if (f === 'enemy' && !FE.unitVisible(G.state, u)) return;
        var line = el('div', 'res-u' + (u.alive ? '' : ' dead'));
        line.appendChild(UI.sprite(u.cls, u.boss ? 'boss' : f, 26));
        line.appendChild(el('span', 'ru-n', u.name));
        line.appendChild(el('span', 'ru-c', FE.CLASSES[u.cls].name + ' Lv' + u.level));
        line.appendChild(el('span', 'ru-s', u.alive ? u.hp + '/' + u.maxhp : 'down'));
        line.addEventListener('click', function () {
          closeModal(m);
          if (u.alive) { G.cursor = { x: u.x, y: u.y }; FE.centerOn(G.state, u.x, u.y); updateTileInfo(); }
          showUnitInfo(u, f);
        });
        p._body.appendChild(line);
      });
      b.appendChild(p);
    });
    b.appendChild(UI.button('Close', '', function () { closeModal(m); }));
    openModal(m);
  }

  /* ---------------- modal plumbing ---------------- */

  var modalStack = [];
  function openModal(m) {
    document.body.appendChild(m);
    modalStack.push(m);
    requestAnimationFrame(function () { m.classList.add('in'); });
    FE.Music.unlock();
  }
  function closeModal(m) {
    var i = modalStack.indexOf(m);
    if (i !== -1) modalStack.splice(i, 1);
    m.classList.remove('in');
    setTimeout(function () { if (m.parentNode) m.parentNode.removeChild(m); }, 160);
  }

  /* test hooks: the browser suite drives the real action flow through these
     rather than reimplementing it */
  G._testStaffTargets = findStaffTargets;
  G._testWorldMap = showWorldMap;
  G._testStartSkirmish = startSkirmish;
  G._testSupplyAccess = supplyAccess;
  G._testOpenMenu = openActionMenu;
  G._testBeginChapter = function (idx, deploy) {
    G.campaign.chapterIndex = idx;
    G.deploy = deploy;
    G.ended = false;
    beginBattle();
  };

  FE.boot = boot;
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();

})(window.FE = window.FE || {});
