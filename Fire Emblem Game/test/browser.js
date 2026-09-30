/* Drive the built game in a real browser: click through title -> difficulty ->
   dialogue -> preparations -> battle, take a move, attack, undo, end the turn,
   and fail on any console error. Run: node test/browser.js */

const { chromium } = require('playwright');
const path = require('path');
const fs = require('fs');

const FILE = 'file://' + path.join(__dirname, '..', 'dist', 'Sundered Crown.html');
const SHOTS = path.join(__dirname, '..', 'dist', 'shots');

(async () => {
  if (!fs.existsSync(SHOTS)) fs.mkdirSync(SHOTS, { recursive: true });
  const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' });
  let fails = 0;
  const errors = [];

  async function run(label, width, height) {
    const ctx = await browser.newContext({ viewport: { width, height }, deviceScaleFactor: 2 });
    const page = await ctx.newPage();
    // the sandbox has no egress to fonts.googleapis.com; a blocked webfont is an
    // environment limit, not a page fault, and the fallback stacks cover it
    const NETWORK_NOISE = /ERR_TUNNEL_CONNECTION_FAILED|ERR_NAME_NOT_RESOLVED|fonts\.(googleapis|gstatic)\.com/;
    page.on('console', m => {
      if (m.type() !== 'error') return;
      if (NETWORK_NOISE.test(m.text())) return;
      errors.push(label + ': ' + m.text());
    });
    page.on('pageerror', e => { errors.push(label + ' PAGEERROR: ' + e.message); });

    await page.goto(FILE);
    await page.waitForTimeout(500);

    const shot = n => page.screenshot({ path: path.join(SHOTS, label + '-' + n + '.png') });

    await shot('1-title');

    // New Campaign
    await page.getByRole('button', { name: 'New Campaign' }).click();
    await page.waitForTimeout(300);
    await shot('2-difficulty');

    // Normal
    await page.locator('.diff-card').first().click();
    await page.waitForTimeout(300);

    // click through the opening dialogue
    for (let i = 0; i < 10; i++) {
      const dlg = page.locator('.dialog-box');
      if (await dlg.count() === 0) break;
      if (i === 0) {
        await shot('3-dialogue');
        // the speaker portrait must actually be drawn, not a blank box
        const por = await page.evaluate(() => {
          const cv = document.querySelector('.dlg-por canvas');
          if (!cv) return { missing: true };
          const g = cv.getContext('2d');
          const d = g.getImageData(0, 0, cv.width, cv.height).data;
          const seen = {};
          let opaque = 0;
          for (let k = 0; k < d.length; k += 4) {
            if (d[k + 3] < 20) continue;
            opaque++;
            seen[d[k] + ',' + d[k + 1] + ',' + d[k + 2]] = 1;
          }
          return { w: cv.width, h: cv.height, colours: Object.keys(seen).length, fill: opaque / (cv.width * cv.height) };
        });
        if (por.missing) errors.push(label + ': the dialogue speaker has no portrait canvas');
        else {
          if (por.colours < 8) errors.push(label + ': the portrait uses only ' + por.colours + ' colours - it is not a detailed face');
          if (por.fill < 0.25) errors.push(label + ': the portrait canvas is mostly empty (' + Math.round(por.fill * 100) + '% drawn)');
        }
      }
      await page.locator('.modal-back').last().click({ position: { x: 20, y: 20 } });
      await page.waitForTimeout(140);
    }

    await page.waitForTimeout(300);
    await shot('4-prep');

    // check the prep screen rendered units
    const cards = await page.locator('.unit-card').count();
    if (cards < 4) { errors.push(label + ': prep screen shows ' + cards + ' units, expected 4'); }

    // open a unit info sheet and back out
    await page.locator('.unit-card .btn', { hasText: 'Info' }).first().click();
    await page.waitForTimeout(250);
    await shot('5-unitinfo');
    const statRows = await page.locator('.st').count();
    if (statRows < 9) errors.push(label + ': stat sheet shows ' + statRows + ' stats, expected 10');
    await page.getByRole('button', { name: 'Close' }).last().click();
    await page.waitForTimeout(200);

    // shop
    await page.getByRole('button', { name: 'Shop' }).click();
    await page.waitForTimeout(250);
    await shot('8-shop');
    const goldBefore = await page.locator('.shop-gold').textContent();
    await page.locator('.shop-card').first().click();
    await page.waitForTimeout(200);
    const goldAfter = await page.locator('.shop-gold').textContent();
    if (goldBefore === goldAfter) errors.push(label + ': buying did not change gold');

    // selling: from the convoy, and from what a deployed unit is carrying
    const sold = await page.evaluate(async () => {
      const g = () => parseInt(document.querySelector('.shop-gold').textContent.replace(/\D/g, ''), 10);
      const sellBtns = () => [...document.querySelectorAll('.btn')].filter(x => /^Sell \d+g$/.test(x.textContent));
      const chips = () => [...document.querySelectorAll('.chip')];
      const out = { sources: chips().map(c => c.textContent) };
      // convoy first
      let before = g();
      let bs = sellBtns();
      out.convoyOffered = bs.length;
      if (bs.length) {
        bs[0].click();
        await new Promise(r => setTimeout(r, 150));
        out.convoyGain = g() - before;
      }
      // then a unit's own bag
      const unitChip = chips()[1];
      if (!unitChip) return out;
      unitChip.click();
      await new Promise(r => setTimeout(r, 150));
      bs = sellBtns();
      out.unitOffered = bs.length;
      if (bs.length) {
        before = g();
        bs[0].click();
        await new Promise(r => setTimeout(r, 150));
        out.unitGain = g() - before;
      }
      return out;
    });
    if ((sold.sources || []).length < 2) errors.push(label + ': the shop offers no unit to sell from (' + JSON.stringify(sold.sources) + ')');
    if (!sold.convoyOffered) errors.push(label + ': nothing in the convoy could be sold');
    else if (!(sold.convoyGain > 0)) errors.push(label + ': selling from the convoy paid nothing');
    if (!sold.unitOffered) errors.push(label + ": a deployed unit's items were not offered for sale");
    else if (!(sold.unitGain > 0)) errors.push(label + ': selling a unit\'s weapon paid nothing');

    await page.getByRole('button', { name: 'Done' }).click();
    await page.waitForTimeout(250);

    // start the chapter
    await page.getByRole('button', { name: 'Begin Chapter' }).click();
    await page.waitForTimeout(900);
    await shot('9-battle');

    // the map canvas must have drawn something other than the background
    const painted = await page.evaluate(() => {
      const c = document.getElementById('map');
      const g = c.getContext('2d');
      const d = g.getImageData(0, 0, c.width, c.height).data;
      const seen = new Set();
      for (let i = 0; i < d.length; i += 4 * 97) seen.add(d[i] + ',' + d[i + 1] + ',' + d[i + 2]);
      return seen.size;
    });
    if (painted < 8) errors.push(label + ': map canvas only has ' + painted + ' distinct colours - not drawing');

    // engine state sanity
    const st = await page.evaluate(() => {
      const s = window.FE.G.state;
      return {
        units: s.units.length,
        players: s.units.filter(u => u.faction === 'player').length,
        enemies: s.units.filter(u => u.faction === 'enemy').length,
        turn: s.turn, phase: s.phase,
        w: s.map.w, h: s.map.h
      };
    });
    if (st.players !== 4) errors.push(label + ': deployed ' + st.players + ' players, expected 4');
    if (st.enemies < 6) errors.push(label + ': ' + st.enemies + ' enemies on the field');

    // select a unit by tapping its tile, then move it
    const moved = await page.evaluate(async () => {
      const FE = window.FE, G = FE.G;
      const u = G.state.units.find(x => x.faction === 'player' && x.id === 'bram');
      FE.centerOn(G.state, u.x, u.y);
      const wrap = document.getElementById('map-wrap');
      const r = wrap.getBoundingClientRect();
      const ts = FE.tileSize();
      const sx = u.x * ts - FE.R.camX + ts / 2 + r.left;
      const sy = u.y * ts - FE.R.camY + ts / 2 + r.top;
      function tap(x, y) {
        ['pointerdown', 'pointerup'].forEach(t => {
          wrap.dispatchEvent(new PointerEvent(t, { clientX: x, clientY: y, bubbles: true, isPrimary: true }));
        });
      }
      tap(sx, sy);
      await new Promise(r2 => setTimeout(r2, 120));
      const selected = G.selected === u.uid && G.mode === 'move';
      const overlayCount = G.overlay ? Object.keys(G.overlay).length : 0;
      return { selected, overlayCount, ux: u.x, uy: u.y };
    });
    if (!moved.selected) errors.push(label + ': tapping a unit did not select it');
    if (moved.overlayCount < 5) errors.push(label + ': movement overlay has ' + moved.overlayCount + ' tiles');
    await shot('10-moverange');

    // move it a tile and confirm the action menu opens
    const menu = await page.evaluate(async () => {
      const FE = window.FE, G = FE.G;
      const u = G.selectedUnit;
      const dest = Object.keys(G.stand).map(k => k.split(',').map(Number))
        .filter(([x, y]) => !(x === u.x && y === u.y))
        .sort((a, b) => (G.stand[a[0] + ',' + a[1]] - G.stand[b[0] + ',' + b[1]]))[2];
      const wrap = document.getElementById('map-wrap');
      const r = wrap.getBoundingClientRect();
      const ts = FE.tileSize();
      function tap(x, y) {
        ['pointerdown', 'pointerup'].forEach(t => {
          wrap.dispatchEvent(new PointerEvent(t, { clientX: x, clientY: y, bubbles: true, isPrimary: true }));
        });
      }
      tap(dest[0] * ts - FE.R.camX + ts / 2 + r.left, dest[1] * ts - FE.R.camY + ts / 2 + r.top);
      await new Promise(r2 => setTimeout(r2, 900));
      return {
        open: document.getElementById('actionmenu').classList.contains('open'),
        buttons: [...document.querySelectorAll('#actionmenu .btn')].map(b => b.textContent),
        at: [u.x, u.y], dest,
        undoDepth: window.FE.Undo.depth(G.state)
      };
    });
    if (!menu.open) errors.push(label + ': action menu did not open after moving');
    if (!menu.buttons.includes('Wait')) errors.push(label + ': action menu missing Wait: ' + menu.buttons.join('/'));
    await shot('11-actionmenu');

    // Wait, then verify undo restores the unit
    await page.evaluate(() => {
      [...document.querySelectorAll('#actionmenu .btn')].find(b => b.textContent === 'Wait').click();
    });
    await page.waitForTimeout(400);

    const undone = await page.evaluate(async () => {
      const FE = window.FE, G = FE.G;
      const before = G.state.units.find(u => u.id === 'bram');
      const posBefore = [before.x, before.y, before.acted];
      document.getElementById('btn-undo').click();
      await new Promise(r => setTimeout(r, 300));
      const after = G.state.units.find(u => u.id === 'bram');
      return { posBefore, posAfter: [after.x, after.y, after.acted] };
    });
    if (JSON.stringify(undone.posBefore) === JSON.stringify(undone.posAfter)) {
      errors.push(label + ': undo did not revert the move');
    }
    await shot('12-afterundo');

    // ---- click accuracy: a real pointer event at a tile centre must hit
    // that tile, at several places across the board, not just the middle
    const aim = await page.evaluate(async () => {
      const FE = window.FE, G = FE.G;
      const wrap = document.getElementById('map-wrap');
      const r = wrap.getBoundingClientRect();
      const ts = FE.tileSize();
      const out = [];
      const spots = [];
      for (let i = 0; i < 12; i++) {
        const x = 1 + ((i * 5) % (G.state.map.w - 2));
        const y = 1 + ((i * 3) % (G.state.map.h - 2));
        spots.push([x, y]);
      }
      for (const [tx, ty] of spots) {
        FE.centerOn(G.state, tx, ty);
        const sx = tx * ts - FE.R.camX + ts / 2;
        const sy = ty * ts - FE.R.camY + ts / 2;
        if (sx < 0 || sy < 0 || sx > r.width || sy > r.height) continue;
        ['pointerdown', 'pointerup'].forEach(t => {
          wrap.dispatchEvent(new PointerEvent(t, {
            clientX: sx + r.left, clientY: sy + r.top, bubbles: true, isPrimary: true
          }));
        });
        await new Promise(res => setTimeout(res, 30));
        out.push({ want: [tx, ty], got: [G.cursor.x, G.cursor.y] });
      }
      return out;
    });
    const missed = aim.filter(a => a.want[0] !== a.got[0] || a.want[1] !== a.got[1]);
    if (missed.length) {
      errors.push(label + ': ' + missed.length + '/' + aim.length + ' clicks hit the wrong tile, e.g. '
        + JSON.stringify(missed[0]));
    }

    // the canvas backing store must match its CSS box or everything is offset
    const fit = await page.evaluate(() => {
      const c = document.getElementById('map');
      const r = c.getBoundingClientRect();
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      return { bw: c.width, bh: c.height, cw: Math.round(r.width * dpr), ch: Math.round(r.height * dpr) };
    });
    if (Math.abs(fit.bw - fit.cw) > 2 || Math.abs(fit.bh - fit.ch) > 2) {
      errors.push(label + ': canvas backing ' + fit.bw + 'x' + fit.bh + ' does not match its box ' + fit.cw + 'x' + fit.ch);
    }

    // ---- staff: no option at full health, one click to heal when wounded
    const staff = await page.evaluate(async () => {
      const FE = window.FE, G = FE.G;
      const mira = G.state.units.find(u => u.id === 'mira');
      const dorn = G.state.units.find(u => u.id === 'dorn');
      if (!mira || !dorn) return { skip: true };

      // stand them next to each other, everyone at full health
      G.state.units.forEach(u => { if (u.faction === 'player') u.hp = u.maxhp; });
      dorn.x = mira.x + 1; dorn.y = mira.y;
      FE.recomputeSupports(G.state);

      const atFull = window.FE.G._testStaffTargets
        ? window.FE.G._testStaffTargets(mira).length
        : null;

      dorn.hp = Math.max(1, dorn.maxhp - 9);
      const wounded = window.FE.G._testStaffTargets(mira).length;
      const before = dorn.hp;

      // run the real action flow: open the menu, hit Staff, click the ally
      mira.acted = false; mira.moved = true;
      G.selectedUnit = mira; G.selected = mira.uid;
      window.FE.G._testOpenMenu(mira);
      const labels = [...document.querySelectorAll('#actionmenu .btn')].map(b => b.textContent);
      const staffBtn = [...document.querySelectorAll('#actionmenu .btn')].find(b => b.textContent === 'Staff');
      if (!staffBtn) return { atFull, wounded, labels, healed: false, reason: 'no Staff button' };
      staffBtn.click();
      await new Promise(r => setTimeout(r, 150));
      const mode = G.mode, hasPending = !!G.pendingTarget;

      // click the wounded ally on the map
      const wrap = document.getElementById('map-wrap');
      const r2 = wrap.getBoundingClientRect();
      const ts = FE.tileSize();
      FE.centerOn(G.state, dorn.x, dorn.y);
      const sx = dorn.x * ts - FE.R.camX + ts / 2 + r2.left;
      const sy = dorn.y * ts - FE.R.camY + ts / 2 + r2.top;
      ['pointerdown', 'pointerup'].forEach(t => {
        wrap.dispatchEvent(new PointerEvent(t, { clientX: sx, clientY: sy, bubbles: true, isPrimary: true }));
      });
      await new Promise(r3 => setTimeout(r3, 700));
      return { atFull, wounded, labels, mode, hasPending, before, after: dorn.hp, healed: dorn.hp > before };
    });
    if (!staff.skip) {
      if (staff.atFull !== 0) errors.push(label + ': staff offered ' + staff.atFull + ' targets at full health, expected 0');
      if (staff.wounded < 1) errors.push(label + ': staff offered no target for a wounded ally');
      if (!staff.healed) errors.push(label + ': clicking the ally did not heal (' + JSON.stringify(staff) + ')');
    }
    await shot('13-staff');

    // ---- an enemy that can reach a unit must attack, even into a bad counter
    const aggression = await page.evaluate(() => {
      const FE = window.FE, G = FE.G;
      const st = G.state;
      const foe = st.units.find(u => u.faction === 'enemy' && !u.boss && u.alive);
      const target = st.units.find(u => u.faction === 'player' && u.alive);
      if (!foe || !target) return { skip: true };
      // park it right next to a unit that will counter hard, and hurt it badly
      foe.x = target.x + 1; foe.y = target.y;
      foe.hp = 1;
      foe.ai = 'aggressive'; foe.awake = true;
      FE.recomputeSupports(st);
      const act = FE.aiDecide(st, foe);
      return { type: act && act.type, hp: foe.hp };
    });
    if (!aggression.skip && aggression.type !== 'attack') {
      errors.push(label + ': a 1 HP enemy standing next to a unit chose "' + aggression.type + '" instead of attacking');
    }

    // ---- the arena now stands on the map: walk a unit in and fight
    const arena = await page.evaluate(async () => {
      const FE = window.FE, G = FE.G;
      // chapter 2 is the one with an arena on it
      G._testBeginChapter(1, ['seren', 'dorn', 'mira', 'bram', 'rook', 'edran']);
      await new Promise(r => setTimeout(r, 700));
      const st = G.state;
      let tile = null;
      for (let y = 0; y < st.map.h; y++)
        for (let x = 0; x < st.map.w; x++)
          if (FE.TERRAIN[st.map.tiles[y][x]].arena) tile = { x, y };
      if (!tile) return { noTile: true };

      const u = st.units.find(z => z.id === 'dorn' && z.faction === 'player');
      if (!u) return { noUnit: true };
      u.x = tile.x; u.y = tile.y;
      u.moved = true; u.acted = false;
      FE.recomputeSupports(st);
      FE.centerOn(st, u.x, u.y);
      G.selectedUnit = u; G.selected = u.uid;
      G._testOpenMenu(u);
      const labels = [...document.querySelectorAll('#actionmenu .btn')].map(b => b.textContent);
      return { tile, labels, roundsBefore: FE.arenaRoundsLeft(st, u), hpBefore: u.hp, expBefore: u.exp };
    });
    if (arena.noTile) errors.push(label + ': chapter 2 has no arena tile');
    else if (arena.noUnit) errors.push(label + ': could not place a unit on the arena');
    else {
      const hasArena = arena.labels.some(l => l.indexOf('Arena') === 0);
      if (!hasArena) errors.push(label + ': no Arena action on the arena tile: ' + arena.labels.join('/'));
      if (arena.roundsBefore !== 7) errors.push(label + ': expected 7 arena rounds, got ' + arena.roundsBefore);
    }
    await shot('14-arena-menu');

    // open the bout and check the pre-fight panel shows both sides' numbers
    const bout = await page.evaluate(async () => {
      const btn = [...document.querySelectorAll('#actionmenu .btn')].find(b => b.textContent.indexOf('Arena') === 0);
      if (!btn) return { skip: true };
      btn.click();
      await new Promise(r => setTimeout(r, 400));
      const sides = document.querySelectorAll('.av-side').length;
      const rows = document.querySelectorAll('.av-side .row').length;
      const foe = document.querySelector('.av-side.them .av-c');
      return { sides, rows, foe: foe && foe.textContent };
    });
    if (!bout.skip) {
      if (bout.sides !== 2) errors.push(label + ': arena panel showed ' + bout.sides + ' fighters, expected 2');
      if (bout.rows < 6) errors.push(label + ': arena panel is missing the forecast rows (' + bout.rows + ')');
    }
    await shot('15-arena-offer');

    // fight, and confirm the duel scene actually animates
    const duel = await page.evaluate(async () => {
      const fight = [...document.querySelectorAll('.btn')].find(b => b.textContent === 'Fight');
      if (!fight) return { skip: true };
      const FE = window.FE, G = FE.G;
      const u = G.state.units.find(z => z.id === 'dorn');
      const hpBefore = u.hp, expBefore = u.exp, lvlBefore = u.level;
      const roundsBefore = FE.arenaRoundsLeft(G.state, u);
      fight.click();
      await new Promise(r => setTimeout(r, 300));

      const cv = document.querySelector('.duel-canvas');
      if (!cv) return { noCanvas: true };
      function snap() {
        const g = cv.getContext('2d');
        const d = g.getImageData(0, 0, cv.width, cv.height).data;
        let h = 0;
        for (let i = 0; i < d.length; i += 4 * 211) h = (h * 31 + d[i] + d[i + 1] * 3) >>> 0;
        return h;
      }
      const frames = [];
      for (let i = 0; i < 8; i++) {
        frames.push(snap());
        await new Promise(r => setTimeout(r, 160));
      }
      const distinct = new Set(frames).size;
      return {
        distinct, hpBefore, expBefore, lvlBefore, roundsBefore,
        canvasW: cv.width, canvasH: cv.height
      };
    });
    if (!duel.skip) {
      if (duel.noCanvas) errors.push(label + ': the duel scene never appeared');
      else if (duel.distinct < 3) errors.push(label + ': duel canvas is static across 8 frames (' + duel.distinct + ' distinct) - not animating');
    }
    await shot('16-duel');

    // let it finish and check the bout actually changed the unit
    const settled = await page.evaluate(async () => {
      if (window.FE.duelSkip) window.FE.duelSkip();
      await new Promise(r => setTimeout(r, 900));
      // step through any level-up modal
      for (let i = 0; i < 4; i++) {
        const cont = [...document.querySelectorAll('.btn')].find(b => b.textContent === 'Continue');
        if (!cont) break;
        cont.click();
        await new Promise(r => setTimeout(r, 250));
      }
      const FE = window.FE, G = FE.G;
      const u = G.state.units.find(z => z.id === 'dorn');
      return {
        roundsAfter: FE.arenaRoundsLeft(G.state, u),
        hp: u.hp, maxhp: u.maxhp, exp: u.exp, level: u.level,
        acted: u.acted,
        resultShown: !!document.querySelector('.modal-h')
      };
    });
    if (!duel.skip && !duel.noCanvas) {
      if (settled.roundsAfter !== duel.roundsBefore - 1) {
        errors.push(label + ': arena round was not spent (' + duel.roundsBefore + ' -> ' + settled.roundsAfter + ')');
      }
      const changed = settled.hp !== duel.hpBefore || settled.exp !== duel.expBefore || settled.level !== duel.lvlBefore;
      if (!changed) errors.push(label + ': the bout changed nothing about the unit - no damage, no experience');
      if (settled.acted) errors.push(label + ': the arena consumed the unit\'s action, it is meant to be free');
    }
    await shot('17-arena-result');

    // back to chapter 1 for the rest of the checks
    const leftArena = await page.evaluate(async () => {
      const leave = [...document.querySelectorAll('.btn')].find(b => b.textContent === 'Leave the arena');
      if (leave) leave.click();
      await new Promise(r => setTimeout(r, 400));
      const stuck = window.FE.G.busy;
      window.FE.G._testBeginChapter(0, ['seren', 'dorn', 'mira', 'bram']);
      await new Promise(r => setTimeout(r, 600));
      return { stuck };
    });
    if (leftArena && leftArena.stuck) errors.push(label + ': leaving the arena left the game stuck busy');

    // ---- the action menu must never be clipped by the pane, including at the
    // very bottom of the map where it used to disappear under the info bar
    const menuFit = await page.evaluate(async () => {
      const FE = window.FE, G = FE.G;
      const wrap = document.getElementById('map-wrap');
      const menu = document.getElementById('actionmenu');
      const out = [];
      const u = G.state.units.find(z => z.faction === 'player' && z.alive);
      const spots = [[2, G.state.map.h - 1], [2, 0], [G.state.map.w - 1, G.state.map.h - 1], [8, 6]];
      for (const [x, y] of spots) {
        u.x = x; u.y = y; u.acted = false; u.moved = true;
        FE.recomputeSupports(G.state);
        FE.centerOn(G.state, x, y);
        G.selectedUnit = u; G.selected = u.uid;
        G._testOpenMenu(u);
        await new Promise(r => setTimeout(r, 60));
        const mr = menu.getBoundingClientRect();
        const wr = wrap.getBoundingClientRect();
        out.push({
          at: [x, y],
          insideTop: mr.top >= wr.top - 1,
          insideBottom: mr.bottom <= wr.bottom + 1,
          insideLeft: mr.left >= wr.left - 1,
          insideRight: mr.right <= wr.right + 1,
          h: Math.round(mr.height)
        });
      }
      return out;
    });
    menuFit.forEach(m => {
      if (!m.insideTop || !m.insideBottom || !m.insideLeft || !m.insideRight) {
        errors.push(label + ': action menu at tile ' + m.at.join(',') + ' escapes the map pane ' + JSON.stringify(m));
      }
    });
    await shot('18-menufit');

    // ---- zoom: two-finger slide zooms, trackpad pinch does not
    const zoom = await page.evaluate(async () => {
      const FE = window.FE;
      const wrap = document.getElementById('map-wrap');
      function wheel(dy, ctrl) {
        wrap.dispatchEvent(new WheelEvent('wheel', {
          deltaY: dy, ctrlKey: !!ctrl, bubbles: true, cancelable: true
        }));
      }
      const start = FE.R.zoom;
      wheel(-120, false); wheel(-120, false);
      const afterSlide = FE.R.zoom;
      const mid = FE.R.zoom;
      wheel(-120, true); wheel(-120, true); wheel(120, true);
      const afterPinch = FE.R.zoom;
      return { start, afterSlide, mid, afterPinch };
    });
    if (zoom.afterSlide === zoom.start) errors.push(label + ': two-finger slide did not zoom');
    if (zoom.afterPinch !== zoom.mid) errors.push(label + ': trackpad pinch still zooms (' + zoom.mid + ' -> ' + zoom.afterPinch + ')');

    // ---- the forecast must name the weapon the enemy is holding
    const wep = await page.evaluate(async () => {
      const FE = window.FE, G = FE.G;
      const me = G.state.units.find(z => z.faction === 'player' && z.alive && FE.equipped(z));
      const foe = G.state.units.find(z => z.faction === 'enemy' && z.alive);
      foe.x = me.x + 1; foe.y = me.y;
      foe.awake = true;
      FE.recomputeSupports(G.state);
      FE.centerOn(G.state, me.x, me.y);
      me.acted = false; me.moved = true;
      G.selectedUnit = me; G.selected = me.uid;
      G._testOpenMenu(me);
      const atk = [...document.querySelectorAll('#actionmenu .btn')].find(b => b.textContent === 'Attack');
      if (!atk) return { skip: true };
      atk.click();
      await new Promise(r => setTimeout(r, 300));
      const names = [...document.querySelectorAll('.fc-wep-n')].map(n => n.textContent);
      const tags = [...document.querySelectorAll('.fc-tag')].map(n => n.textContent);
      const foeWep = FE.itemData(FE.equipped(foe));
      return { names, tags, expect: foeWep && foeWep.name };
    });
    if (!wep.skip) {
      if (!wep.names || wep.names.length < 2) {
        errors.push(label + ': forecast does not show both weapons (' + JSON.stringify(wep.names) + ')');
      } else if (wep.expect && wep.names.indexOf(wep.expect) === -1) {
        errors.push(label + ": forecast omits the enemy's weapon " + wep.expect + ' (' + wep.names.join(', ') + ')');
      }
      const bareTriangle = (wep.tags || []).some(t => /triangle\s*[+\u2212-]\s*$/.test(t));
      if (bareTriangle) errors.push(label + ': forecast still shows a bare "triangle +/-" tag');
    }
    await shot('19-forecast');
    await page.evaluate(() => {
      const back = [...document.querySelectorAll('.fc-bar .btn')].find(b => b.textContent === 'Back');
      if (back) back.click();
    });
    await page.waitForTimeout(200);

    // ---- the forecast warns about doubling, both ways round
    const dbl = await page.evaluate(async () => {
      const FE = window.FE, G = FE.G;
      function stage(fastSide) {
        const me = G.state.units.find(z => z.faction === 'player' && z.alive && FE.equipped(z));
        const foe = G.state.units.find(z => z.faction === 'enemy' && z.alive);
        if (!me || !foe) return null;
        me.hp = me.maxhp; foe.hp = foe.maxhp;
        foe.x = me.x + 1; foe.y = me.y; foe.awake = true;
        me.spd = fastSide === 'me' ? 30 : 1;
        foe.spd = fastSide === 'me' ? 1 : 30;
        FE.recomputeSupports(G.state);
        FE.centerOn(G.state, me.x, me.y);
        me.acted = false; me.moved = true;
        G.selectedUnit = me; G.selected = me.uid;
        G._testOpenMenu(me);
        const atk = [...document.querySelectorAll('#actionmenu .btn')].find(x => x.textContent === 'Attack');
        if (!atk) return null;
        atk.click();
        return true;
      }
      function readAndClose() {
        const n = document.querySelector('.fc-double');
        const out = n ? { text: n.textContent, good: n.classList.contains('good'), bad: n.classList.contains('bad') } : null;
        const back = [...document.querySelectorAll('.fc-bar .btn')].find(x => x.textContent === 'Back');
        if (back) back.click();
        return out;
      }
      if (!stage('me')) return { skip: true };
      await new Promise(r => setTimeout(r, 250));
      const mine = readAndClose();
      await new Promise(r => setTimeout(r, 200));
      if (!stage('foe')) return { skip: true };
      await new Promise(r => setTimeout(r, 250));
      const theirs = readAndClose();
      await new Promise(r => setTimeout(r, 200));
      return { skip: false, mine, theirs };
    });
    if (!dbl.skip) {
      if (!dbl.mine) errors.push(label + ': the forecast does not say when you will strike twice');
      else if (!/twice/i.test(dbl.mine.text) || !dbl.mine.good) {
        errors.push(label + ': your doubling badge reads "' + dbl.mine.text + '"');
      }
      if (!dbl.theirs) errors.push(label + ': the forecast does not warn when the enemy strikes back twice');
      else if (!/twice/i.test(dbl.theirs.text) || !dbl.theirs.bad) {
        errors.push(label + ': the enemy doubling badge reads "' + dbl.theirs.text + '"');
      }
    }

    // ---- the panel gets out of the way of a unit near the bottom of the map
    const flip = await page.evaluate(async () => {
      const FE = window.FE, G = FE.G;
      const heal = G.state.units.find(z => z.faction === 'player' && z.alive && FE.canStaff && FE.canStaff(z));
      const me = heal || G.state.units.find(z => z.faction === 'player' && z.alive && FE.equipped(z));
      const foe = G.state.units.find(z => z.faction === 'enemy' && z.alive);
      if (!me || !foe) return { skip: true };
      const out = {};
      function place(y) {
        me.x = 6; me.y = y;
        foe.x = 7; foe.y = y; foe.awake = true; foe.hp = foe.maxhp;
        me.hp = me.maxhp; me.acted = false; me.moved = true;
        FE.recomputeSupports(G.state);
        FE.centerOn(G.state, me.x, me.y);
        G.selectedUnit = me; G.selected = me.uid;
        G._testOpenMenu(me);
        const atk = [...document.querySelectorAll('#actionmenu .btn')].find(x => x.textContent === 'Attack');
        if (!atk) return false;
        atk.click();
        return true;
      }
      function closeIt() {
        const back = [...document.querySelectorAll('.fc-bar .btn')].find(x => x.textContent === 'Back');
        if (back) back.click();
      }
      if (!place(G.state.map.h - 2)) return { skip: true };
      await new Promise(r => setTimeout(r, 250));
      out.low = document.getElementById('forecast').classList.contains('at-top');
      closeIt();
      await new Promise(r => setTimeout(r, 200));
      if (!place(1)) return { skip: true };
      await new Promise(r => setTimeout(r, 250));
      out.high = document.getElementById('forecast').classList.contains('at-top');
      closeIt();
      await new Promise(r => setTimeout(r, 200));
      return out;
    });
    if (flip.skip) {
      errors.push(label + ': the panel-position check could not run - no attack was offered');
    } else {
      if (!flip.low) errors.push(label + ': the panel stayed at the bottom over a unit near the bottom of the map');
      if (flip.high) errors.push(label + ': the panel jumped to the top for a unit near the top of the map');
    }

    // ---- a player attack plays the full battle scene, and Off skips it
    async function stageAttack() {
      return page.evaluate(async () => {
        const FE = window.FE, G = FE.G;
        const me = G.state.units.find(z => z.faction === 'player' && z.alive && FE.equipped(z));
        const foe = G.state.units.find(z => z.faction === 'enemy' && z.alive && z.hp > 0);
        if (!me || !foe) return { skip: true };
        me.hp = me.maxhp; foe.hp = foe.maxhp;
        foe.x = me.x + 1; foe.y = me.y; foe.awake = true;
        // make the swing land: a genuine miss is not what this test is about
        foe.spd = 0; foe.lck = 0; foe.def = 0; foe.res = 0;
        me.skl = 40; me.lck = 40; me.str = 20; me.mag = 20;
        FE.recomputeSupports(G.state);
        FE.centerOn(G.state, me.x, me.y);
        me.acted = false; me.moved = true;
        G.selectedUnit = me; G.selected = me.uid;
        G._testOpenMenu(me);
        const atk = [...document.querySelectorAll('#actionmenu .btn')].find(b => b.textContent === 'Attack');
        if (!atk) return { skip: true };
        atk.click();
        await new Promise(r => setTimeout(r, 250));
        const go = [...document.querySelectorAll('.fc-bar .btn')].find(b => b.textContent === 'Attack');
        if (!go) return { skip: true };
        // the forecast may have opened on a different adjacent enemy - read who
        const cur = G.cursor || {};
        const aimed = G.state.units.find(z => z.faction === 'enemy' && z.alive && z.x === cur.x && z.y === cur.y) || foe;
        const out = { skip: false, foeUid: aimed.uid, foeHp: aimed.hp, meUid: me.uid };
        go.click();
        return out;
      });
    }

    const scene = await stageAttack();
    if (!scene.skip) {
      const anim = await page.evaluate(async () => {
        await new Promise(r => setTimeout(r, 220));
        const box = document.querySelector('.battle-scene');
        const cv = box && box.querySelector('.duel-canvas');
        if (!cv) return { noScene: true };
        const g = cv.getContext('2d');
        const frames = new Set();
        for (let i = 0; i < 8; i++) {
          const d = g.getImageData(0, 0, cv.width, cv.height).data;
          let h = 0;
          for (let k = 0; k < d.length; k += 997) h = (h * 31 + d[k]) | 0;
          frames.add(h);
          await new Promise(r => setTimeout(r, 160));
        }
        return { distinct: frames.size, w: cv.width, h: cv.height };
      });
      if (anim.noScene) errors.push(label + ': a player attack did not open the battle scene');
      else if (anim.distinct < 3) {
        errors.push(label + ': the battle scene is static across 8 frames (' + anim.distinct + ' distinct)');
      }
      await shot('20-battlescene');

      // tap to skip, then the attack must actually resolve and the unit finish
      const resolved = await page.evaluate(async (info) => {
        if (window.FE.duelSkip) window.FE.duelSkip();
        for (let i = 0; i < 60 && (window.FE.G.busy || document.querySelector('.battle-scene')); i++) {
          await new Promise(r => setTimeout(r, 120));
        }
        const FE = window.FE, G = FE.G;
        const foe = G.state.units.find(u => u.uid === info.foeUid);
        const me = G.state.units.find(u => u.uid === info.meUid);
        return {
          open: !!document.querySelector('.battle-scene'),
          busy: G.busy,
          hurt: !foe.alive || foe.hp < info.foeHp,
          acted: !!me.acted
        };
      }, scene);
      if (resolved.open) errors.push(label + ': the battle scene stayed open after skipping');
      if (resolved.busy) errors.push(label + ': the game stayed busy after the battle scene');
      if (!resolved.hurt) errors.push(label + ': the attack did the enemy no damage after the scene');
      if (!resolved.acted) errors.push(label + ': the attacker never finished its turn after the scene');
    }

    // ---- Off bypasses the scene entirely
    await page.evaluate(() => { try { localStorage.setItem('sundered-crown-anim', 'off'); } catch (e) { } });
    const off = await stageAttack();
    if (!off.skip) {
      const res = await page.evaluate(async (info) => {
        let sawScene = false;
        for (let i = 0; i < 40 && window.FE.G.busy; i++) {
          if (document.querySelector('.battle-scene')) sawScene = true;
          await new Promise(r => setTimeout(r, 100));
        }
        if (document.querySelector('.battle-scene')) sawScene = true;
        const foe = window.FE.G.state.units.find(u => u.uid === info.foeUid);
        return { sawScene, hurt: !foe.alive || foe.hp < info.foeHp, busy: window.FE.G.busy };
      }, off);
      if (res.sawScene) errors.push(label + ': animations set to Off still opened the battle scene');
      if (!res.hurt) errors.push(label + ': with animations off the attack did no damage');
      if (res.busy) errors.push(label + ': with animations off the attack never settled');
    }
    await page.evaluate(() => { try { localStorage.setItem('sundered-crown-anim', 'full'); } catch (e) { } });

    // ---- the convoy, reachable mid-battle through the lord
    const supply = await page.evaluate(async () => {
      const FE = window.FE, G = FE.G;
      const st = G.state;
      const lord = st.units.find(u => u.faction === 'player' && u.lord && u.alive);
      const other = st.units.find(u => u.faction === 'player' && !u.lord && u.alive);
      if (!lord || !other) return { skip: true };

      // something worth fetching, and a unit who can use it
      st.convoy.push(FE.mkItem('ironsword'));
      st.convoy.push(FE.mkItem('vulnerary'));
      const convoyBefore = st.convoy.length;

      // park the other unit two tiles off: out of reach of the baggage
      other.x = lord.x + 3; other.y = lord.y;
      FE.recomputeSupports(st);
      const farAccess = !!G._testSupplyAccess(st, other);

      // and now next to her
      other.x = lord.x + 1; other.y = lord.y;
      FE.recomputeSupports(st);
      const nearAccess = !!G._testSupplyAccess(st, other);
      const lordAccess = !!G._testSupplyAccess(st, lord);

      // open the menu on the adjacent unit and use Supply for real
      other.acted = false; other.moved = true;
      G.selectedUnit = other; G.selected = other.uid;
      FE.centerOn(st, other.x, other.y);
      G._testOpenMenu(other);
      const labels = [...document.querySelectorAll('#actionmenu .btn')].map(b => b.textContent);
      const btn = [...document.querySelectorAll('#actionmenu .btn')].find(b => b.textContent === 'Supply');
      if (!btn) return { skip: false, farAccess, nearAccess, lordAccess, labels, opened: false };
      btn.click();
      await new Promise(r => setTimeout(r, 250));

      const carriedBefore = other.items.length;
      const take = [...document.querySelectorAll('.modal .btn')].find(b => b.textContent === 'Take');
      if (take) take.click();
      await new Promise(r => setTimeout(r, 200));
      const carriedAfter = other.items.length;
      const convoyAfter = st.convoy.length;

      const done = [...document.querySelectorAll('.modal .btn')].find(b => b.textContent === 'Done');
      if (done) done.click();
      await new Promise(r => setTimeout(r, 250));

      return {
        skip: false, farAccess, nearAccess, lordAccess, labels, opened: true,
        convoyBefore, convoyAfter, carriedBefore, carriedAfter,
        acted: !!other.acted,
        stillOpen: !!document.querySelector('.modal-back')
      };
    });
    if (!supply.skip) {
      if (supply.farAccess) errors.push(label + ': a unit three tiles from the lord could still reach the convoy');
      if (!supply.nearAccess) errors.push(label + ': a unit standing next to the lord could not reach the convoy');
      if (!supply.lordAccess) errors.push(label + ': the lord could not reach her own convoy');
      if (!supply.opened) {
        errors.push(label + ': no Supply action next to the lord (' + JSON.stringify(supply.labels) + ')');
      } else {
        if (supply.carriedAfter !== supply.carriedBefore + 1) {
          errors.push(label + ': taking from the convoy did not add an item ('
            + supply.carriedBefore + ' -> ' + supply.carriedAfter + ')');
        }
        if (supply.convoyAfter !== supply.convoyBefore - 1) {
          errors.push(label + ': the convoy did not lose the item that was taken ('
            + supply.convoyBefore + ' -> ' + supply.convoyAfter + ')');
        }
        if (!supply.acted) errors.push(label + ': using the convoy did not cost the unit its turn');
        if (supply.stillOpen) errors.push(label + ': the supply screen stayed open after Done');
      }
    }
    await shot('21-supply');

    // danger zone toggle
    const danger = await page.evaluate(async () => {
      document.getElementById('btn-danger').click();
      await new Promise(r => setTimeout(r, 200));
      const n = window.FE.G.overlay ? Object.keys(window.FE.G.overlay).length : 0;
      return n;
    });
    if (danger < 5) errors.push(label + ': danger zone painted ' + danger + ' tiles');
    await shot('13-dangerzone');

    // end the turn and let the enemy phase run
    await page.evaluate(() => { document.getElementById('btn-danger').click(); });
    await page.getByRole('button', { name: 'End Turn' }).click();
    // the enemy phase must never stop to play a battle scene
    let enemyScene = false;
    for (let i = 0; i < 60; i++) {
      if (await page.locator('.battle-scene').count()) enemyScene = true;
      await page.waitForTimeout(100);
    }
    if (enemyScene) errors.push(label + ': the enemy phase opened a battle scene');
    const afterEnemy = await page.evaluate(() => ({
      turn: window.FE.G.state.turn,
      phase: window.FE.G.state.phase,
      busy: window.FE.G.busy
    }));
    if (afterEnemy.turn < 2) errors.push(label + ': turn did not advance past the enemy phase (turn ' + afterEnemy.turn + ')');
    if (afterEnemy.busy) errors.push(label + ': still busy after the enemy phase - it hung');
    await shot('14-turn2');

    // ---- undo must reach back over the enemy phase into the turn before it
    const rewind = await page.evaluate(async () => {
      const FE = window.FE, G = FE.G;
      const btn = document.getElementById('btn-undo');
      const out = {
        turn: G.state.turn,
        enabled: !btn.disabled,
        label: btn.textContent,
        crosses: FE.Undo.crossesTurn(G.state),
        thisTurn: FE.Undo.thisTurn(G.state),
        depth: FE.Undo.depth(G.state)
      };
      if (btn.disabled) return out;
      /* remember the board as the enemy left it */
      const wasHp = G.state.units.filter(u => u.faction === 'player')
        .map(u => u.id + ':' + u.hp + ':' + (u.alive ? 1 : 0)).join(',');
      btn.click();
      await new Promise(r => setTimeout(r, 400));
      out.turnAfter = G.state.turn;
      out.phaseAfter = G.state.phase;
      out.busyAfter = G.busy;
      out.hpChanged = wasHp !== G.state.units.filter(u => u.faction === 'player')
        .map(u => u.id + ':' + u.hp + ':' + (u.alive ? 1 : 0)).join(',');
      out.endEnabled = !document.getElementById('btn-end').disabled;
      /* and the board still draws */
      const cv = document.getElementById('map');
      const g = cv.getContext('2d');
      const d = g.getImageData(0, 0, cv.width, cv.height).data;
      const seen = {};
      for (let i = 0; i < d.length; i += 4 * 97) seen[d[i] + ',' + d[i + 1] + ',' + d[i + 2]] = 1;
      out.drew = Object.keys(seen).length;
      return out;
    });
    if (!rewind.enabled) {
      errors.push(label + ': undo was disabled at the start of turn ' + rewind.turn
        + ' (depth ' + rewind.depth + ') - it cannot reach the previous turn');
    } else {
      if (!rewind.crosses) errors.push(label + ': undo at turn start did not report crossing a turn');
      if (rewind.thisTurn !== 0) errors.push(label + ': ' + rewind.thisTurn + ' actions counted in a turn nothing has happened in');
      if (!/Turn/.test(rewind.label)) errors.push(label + ': the undo button did not say it would undo a turn (got "' + rewind.label + '")');
      if (rewind.turnAfter !== rewind.turn - 1) {
        errors.push(label + ': undo left the game on turn ' + rewind.turnAfter + ', expected ' + (rewind.turn - 1));
      }
      if (rewind.phaseAfter !== 'player') errors.push(label + ': undo across a turn left the phase as ' + rewind.phaseAfter);
      if (rewind.busyAfter) errors.push(label + ': the game was still busy after undoing a turn');
      if (!rewind.endEnabled) errors.push(label + ': End Turn was unavailable after undoing back a turn');
      if (rewind.drew < 8) errors.push(label + ': the map went blank after undoing a turn');
    }
    await shot('14b-undoturn');

    // put the game back where the rest of the run expects it
    if (rewind.enabled && rewind.turnAfter === rewind.turn - 1) {
      await page.getByRole('button', { name: 'End Turn' }).click();
      for (let i = 0; i < 60; i++) {
        const t = await page.evaluate(() => window.FE.G.state.turn + ':' + (window.FE.G.busy ? 1 : 0));
        if (t === rewind.turn + ':0') break;
        await page.waitForTimeout(100);
      }
      const back = await page.evaluate(() => ({ turn: window.FE.G.state.turn, busy: window.FE.G.busy }));
      if (back.turn !== rewind.turn || back.busy) {
        errors.push(label + ': replaying the rewound turn did not land back on turn ' + rewind.turn
          + ' (got ' + back.turn + ', busy ' + back.busy + ')');
      }
    }

    // ---- the fair must not carry late-game stock early
    const stock = await page.evaluate(() => {
      const FE = window.FE;
      const lists = FE.SHOP_STOCK_LIST();
      const late = ['herocrest', 'knightcrest', 'guidingring', 'orionsbolt', 'elysianwhip', 'oceanseal', 'lordsseal'];
      const silver = ['silversword', 'silverlance', 'silveraxe', 'silverbow'];
      const reach = ['spear', 'tomahawk'];
      const out = { tiers: [], firstPromo: -1, firstSilver: -1, firstReach: -1, tierCount: lists.length };
      for (let ch = 0; ch < FE.CHAPTERS.length; ch++) {
        const t = FE.shopTier(ch);
        const list = lists[Math.min(t, lists.length - 1)];
        out.tiers.push(t);
        if (out.firstPromo < 0 && list.some(k => late.indexOf(k) !== -1)) out.firstPromo = ch + 1;
        if (out.firstSilver < 0 && list.some(k => silver.indexOf(k) !== -1)) out.firstSilver = ch + 1;
        if (out.firstReach < 0 && list.some(k => reach.indexOf(k) !== -1)) out.firstReach = ch + 1;
      }
      out.monotonic = out.tiers.every((t, i) => i === 0 || t >= out.tiers[i - 1]);
      return out;
    });
    if (!stock.monotonic) errors.push(label + ': shop tiers go backwards (' + stock.tiers.join(',') + ')');
    if (stock.firstSilver < 7) errors.push(label + ': silver weapons are on sale from chapter ' + stock.firstSilver);
    if (stock.firstPromo < 10) errors.push(label + ': promotion items are on sale from chapter ' + stock.firstPromo);
    if (stock.tierCount !== 6) errors.push(label + ': expected six shop tiers, got ' + stock.tierCount);
    if (stock.firstReach !== 17) errors.push(label + ': reach weapons are on sale from chapter ' + stock.firstReach + ', expected 17');

    // ---- clearing a chapter has to land on the world map, not the next prep
    const cleared = await page.evaluate(async () => {
      const FE = window.FE, G = FE.G;
      const st = G.state;
      st.units.forEach(u => { if (u.faction === 'enemy') { u.alive = false; u.hp = 0; } });
      const me = st.units.find(u => u.faction === 'player' && u.alive);
      if (!me) return { skip: true };
      me.acted = false;
      G.selectedUnit = me; G.selected = me.uid;
      G._testOpenMenu(me);
      const wait = [...document.querySelectorAll('#actionmenu .btn')].find(b => b.textContent === 'Wait');
      if (!wait) return { skip: true };
      wait.click();
      await new Promise(r => setTimeout(r, 1600));
      const resultTitle = (document.querySelector('.modal-h') || {}).textContent || '';
      const cont = [...document.querySelectorAll('.modal .btn')].find(b => b.textContent === 'Continue');
      if (!cont) return { skip: false, resultTitle, reached: false };
      cont.click();
      await new Promise(r => setTimeout(r, 400));
      // click through the closing dialogue
      for (let i = 0; i < 12; i++) {
        const dlg = document.querySelector('.dialog-box');
        if (!dlg) break;
        dlg.closest('.modal-back').click();
        await new Promise(r => setTimeout(r, 160));
      }
      await new Promise(r => setTimeout(r, 500));
      return {
        skip: false, resultTitle, reached: !!document.querySelector('.world-box'),
        chapterIndex: G.campaign.chapterIndex,
        inBattleChrome: document.getElementById('game').classList.contains('in-battle')
      };
    });
    if (!cleared.skip) {
      if (!/Clear/i.test(cleared.resultTitle)) {
        errors.push(label + ': clearing every enemy did not end the chapter (' + cleared.resultTitle + ')');
      }
      if (!cleared.reached) errors.push(label + ': clearing a chapter did not land on the world map');
      if (cleared.chapterIndex !== 1) errors.push(label + ': the campaign did not advance a chapter (' + cleared.chapterIndex + ')');
      if (cleared.inBattleChrome) errors.push(label + ': the battle chrome was still up on the world map');
    }
    await shot('22-cleared');

    // ---- the world map: nodes, a shop, the Spire, and a skirmish you can start
    const world = await page.evaluate(async () => {
      const FE = window.FE, G = FE.G;
      // stand the campaign a few chapters in so the map has something on it
      G.campaign.chapterIndex = 13;
      G.campaign.spireBest = 2;
      G.worldRegion = null;   // as if we had just crossed the pass
      FE.CHAPTERS[13].available.forEach(id => {
        if (!G.campaign.roster[id]) G.campaign.roster[id] = FE.makeRosterUnit(id);
      });
      document.querySelectorAll('.modal-back').forEach(n => n.remove());
      G._testWorldMap();
      await new Promise(r => setTimeout(r, 350));

      const nodes = [...document.querySelectorAll('.wnode')];
      const out = {
        total: nodes.length,
        next: nodes.filter(n => n.classList.contains('next')).length,
        done: nodes.filter(n => n.classList.contains('done')).length,
        locked: nodes.filter(n => n.classList.contains('locked')).length,
        skirmish: nodes.filter(n => n.classList.contains('skirmish')).length,
        spire: nodes.filter(n => n.classList.contains('spire')).length,
        canvasPainted: 0
      };
      out.regions = [...document.querySelectorAll('.chip')].map(c => c.textContent.trim());
      // nothing from the other region may appear on this pane
      const shown = nodes.map(n => (n.querySelector('.wn-label') || {}).textContent);
      const varnNames = FE.WORLD_NODES.concat(FE.SKIRMISH_SITES)
        .filter(n => (n.region || 'marches') === 'marches').map(n => n.name);
      out.leaked = shown.some(nm => varnNames.indexOf(nm) !== -1);

      const cv = document.querySelector('.world-canvas');
      if (cv) {
        const g = cv.getContext('2d');
        const d = g.getImageData(0, 0, cv.width, cv.height).data;
        const seen = {};
        for (let i = 0; i < d.length; i += 4 * 97) seen[d[i] + ',' + d[i + 1] + ',' + d[i + 2]] = 1;
        out.canvasPainted = Object.keys(seen).length;
      }

      // the other region has to be one click away, and has to draw its own nodes
      const marchesTab = [...document.querySelectorAll('.chip')].find(c => /Marches/.test(c.textContent));
      if (marchesTab) {
        marchesTab.click();
        await new Promise(r => setTimeout(r, 350));
        out.marchesNodes = document.querySelectorAll('.wnode').length;
        out.marchesSpire = document.querySelectorAll('.wnode.spire').length;
        out.marchesDone = document.querySelectorAll('.wnode.done').length;
        const back = [...document.querySelectorAll('.chip')].find(c => /Varn/.test(c.textContent));
        if (back) { back.click(); await new Promise(r => setTimeout(r, 350)); }
      }

      // a skirmish node must offer a battle, and starting it must reach prep
      const sk = [...document.querySelectorAll('.wnode')].find(n => n.classList.contains('skirmish'));
      if (!sk) return out;
      sk.click();
      await new Promise(r => setTimeout(r, 200));
      out.blurb = (document.querySelector('.world-info .wi-t') || {}).textContent || '';
      const ride = [...document.querySelectorAll('.world-info .btn')].find(b => b.textContent === 'Ride out');
      out.hasRide = !!ride;
      if (!ride) return out;
      ride.click();
      await new Promise(r => setTimeout(r, 350));
      out.prepTitle = (document.querySelector('.prep-box .modal-h') || {}).textContent || '';
      out.isSkirmish = !!(G.chapter && G.chapter.skirmish);
      out.enemyCount = G.chapter ? G.chapter.enemies.length : 0;
      out.hasTreasure = G.chapter ? (G.chapter.chests.length + G.chapter.villages.length) : -1;
      return out;
    });
    if (world.total < 5) errors.push(label + ': the Varn region drew only ' + world.total + ' nodes');
    if (world.next !== 1) errors.push(label + ': the world map shows ' + world.next + ' next chapters, expected 1');
    if (world.done !== 1) errors.push(label + ': the Varn region shows ' + world.done + ' cleared chapters, expected 1');
    if (!world.locked) errors.push(label + ': the world map shows nothing still locked');
    if (!world.regions || world.regions.length !== 2) {
      errors.push(label + ': expected two world map regions at chapter 14, got ' + JSON.stringify(world.regions));
    }
    if (world.marchesNodes < 20) errors.push(label + ': switching back to the marches drew only ' + world.marchesNodes + ' nodes');
    if (world.leaked) errors.push(label + ': a node from the other region was drawn on this one');
    if (!world.skirmish) errors.push(label + ': no skirmish sites appeared on the world map');
    if (world.spire) errors.push(label + ': the Hollow Spire leaked into the Varn region');
    if (!world.marchesSpire) errors.push(label + ': the Hollow Spire is missing from the marches');
    if (world.marchesDone !== 12) errors.push(label + ': the marches show ' + world.marchesDone + ' cleared chapters, expected 12');
    if (world.canvasPainted < 5) errors.push(label + ': the world map backdrop is blank (' + world.canvasPainted + ' colours)');
    if (!world.hasRide) errors.push(label + ': a skirmish site offered no battle');
    else {
      if (!world.isSkirmish) errors.push(label + ': riding out did not start a skirmish');
      if (!world.enemyCount) errors.push(label + ': the skirmish was generated with no enemies');
      if (world.hasTreasure !== 0) errors.push(label + ': the skirmish carries campaign treasure');
      if (!/./.test(world.prepTitle)) errors.push(label + ': the skirmish did not reach a preparations screen');
    }
    await shot('22-worldmap');

    // ---- the citadel: a third region, and only once you have earned it
    const citadel = await page.evaluate(async () => {
      const FE = window.FE, G = FE.G;
      G.campaign.chapterIndex = 19;
      G.worldRegion = null;
      FE.CHAPTERS[19].available.forEach(id => {
        if (!G.campaign.roster[id]) G.campaign.roster[id] = FE.makeRosterUnit(id);
      });
      document.querySelectorAll('.modal-back').forEach(n => n.remove());
      G._testWorldMap();
      await new Promise(r => setTimeout(r, 350));
      const nodes = [...document.querySelectorAll('.wnode')];
      const labels = nodes.map(n => (n.querySelector('.wn-label') || {}).textContent);
      const other = FE.WORLD_NODES.concat(FE.SKIRMISH_SITES)
        .filter(n => (n.region || 'marches') !== 'citadel').map(n => n.name);
      return {
        regions: [...document.querySelectorAll('.chip')].map(c => c.textContent.trim()),
        total: nodes.length,
        next: nodes.filter(n => n.classList.contains('next')).length,
        labels: labels,
        leaked: labels.some(nm => other.indexOf(nm) !== -1)
      };
    });
    if (!citadel.regions || citadel.regions.length !== 3) {
      errors.push(label + ': expected three regions once the citadel is open, got ' + JSON.stringify(citadel.regions));
    }
    if (citadel.total < 5) errors.push(label + ': the citadel drew only ' + citadel.total + ' nodes');
    if (citadel.next !== 1) errors.push(label + ': the citadel shows ' + citadel.next + ' next chapters, expected 1');
    if (citadel.leaked) errors.push(label + ': a node from another region was drawn on the citadel pane');
    if (citadel.labels.indexOf('The Last Signature') === -1) {
      errors.push(label + ': the final chapter is missing from the citadel pane');
    }
    await shot('23-citadel');

    // ---- the crown goes on: a real strike must transform the boss mid-battle
    const crown = await page.evaluate(async () => {
      const FE = window.FE, G = FE.G;
      document.querySelectorAll('.modal-back').forEach(n => n.remove());
      const idx = FE.CHAPTERS.findIndex(c => c.id === 'ch20');
      G.campaign.chapterIndex = idx;
      FE.CHAPTERS[idx].available.forEach(id => {
        if (!G.campaign.roster[id]) G.campaign.roster[id] = FE.makeRosterUnit(id);
      });
      const st = FE.startChapter(G.campaign, FE.CHAPTERS[idx].available.slice(0, FE.CHAPTERS[idx].slots));
      G.state = st; G.chapter = FE.CHAPTERS[idx]; G.ended = false;
      const boss = st.units.find(u => u.boss);
      const hit = st.units.find(u => u.faction === 'player' && FE.equipped(u));
      hit.str = 60; hit.skl = 60; hit.spd = 60;
      const before = { cls: boss.cls, name: boss.name, units: st.units.length };
      let saw = false, log = [];
      for (let i = 0; i < 40 && !saw; i++) {
        boss.hp = 1; boss.def = 0; boss.res = 0; boss.lck = 0;
        hit.x = boss.x; hit.y = boss.y + 1; hit.hp = hit.maxhp;
        log = FE.resolveCombat(st, hit, boss, FE.equipped(hit));
        saw = log.some(ev => ev.type === 'phase2');
        st._phaseBreak = false;
      }
      // and the renderer must survive the class swapping under it
      let drew = 0;
      try {
        FE.draw(st, { cursor: { x: 0, y: 0 }, selected: null, overlay: null, path: null });
        const cv = document.getElementById('map');
        if (cv) {
          const g = cv.getContext('2d');
          const d = g.getImageData(0, 0, cv.width, cv.height).data;
          const seen = {};
          for (let i = 0; i < d.length; i += 4 * 97) seen[d[i] + ',' + d[i + 1] + ',' + d[i + 2]] = 1;
          drew = Object.keys(seen).length;
        }
      } catch (e) { return { error: String(e) }; }
      return {
        saw: saw, before: before, alive: boss.alive, cls: boss.cls,
        full: boss.hp === boss.maxhp, spawned: st.units.length - before.units,
        won: FE.checkResult(st) === 'win', drew: drew,
        scene: (log.filter(ev => ev.type === 'phase2')[0] || {}).scene
      };
    });
    if (crown.error) errors.push(label + ': the second phase threw: ' + crown.error);
    else {
      if (!crown.saw) errors.push(label + ': a killing blow on the emperor did not trigger the second phase');
      if (!crown.alive) errors.push(label + ': the emperor died on the first bar');
      if (crown.cls === crown.before.cls) errors.push(label + ': the emperor did not change class');
      if (!crown.full) errors.push(label + ': the second phase did not start at full health');
      if (crown.spawned <= 0) errors.push(label + ': the second phase escort never arrived');
      if (crown.won) errors.push(label + ': the chapter was won by emptying the first bar');
      if (crown.scene !== 'ch20_crown') errors.push(label + ': the second phase did not name its scene');
      if (crown.drew < 5) errors.push(label + ': the map went blank after the class swap');
    }

    // ---- the epilogue: one choice, two endings, and a card at the end of each
    const ending = await page.evaluate(async () => {
      const FE = window.FE, G = FE.G;
      document.querySelectorAll('.modal-back').forEach(n => n.remove());
      G.ended = false; G.busy = false;
      G._testEpilogue();
      await new Promise(r => setTimeout(r, 250));
      const btns = [...document.querySelectorAll('.modal-back .btn')].map(b => b.textContent.trim());
      const out = { choices: btns.length, labels: btns };
      if (!btns.length) return out;
      document.querySelectorAll('.modal-back .btn')[0].click();
      await new Promise(r => setTimeout(r, 250));
      // click through the epilogue text
      for (let i = 0; i < 20; i++) {
        const dlg = document.querySelector('.dialog-box');
        if (!dlg) break;
        dlg.click();
        await new Promise(r => setTimeout(r, 60));
      }
      await new Promise(r => setTimeout(r, 250));
      out.ending = G.campaign.ending || null;
      out.card = (document.querySelector('.modal-back .modal-h') || {}).textContent || '';
      out.rows = document.querySelectorAll('.modal-back .row').length;
      return out;
    });
    if (ending.choices !== 2) {
      errors.push(label + ': the epilogue offered ' + ending.choices + ' choices, expected 2 (' + JSON.stringify(ending.labels) + ')');
    }
    if (!ending.ending) errors.push(label + ': choosing an ending did not record it on the campaign');
    if (!/Crown|Accord/.test(ending.card || '')) {
      errors.push(label + ': the ending card never appeared (got "' + ending.card + '")');
    }
    if (!ending.rows) errors.push(label + ': the ending card has no campaign summary');
    await shot('24-ending');

    console.log('  ' + label + '  ' + st.w + 'x' + st.h + ' map, ' + st.players + ' players vs ' + st.enemies
      + ' enemies, reached turn ' + afterEnemy.turn + ', ' + painted + ' colours drawn');

    await ctx.close();
  }

  await run('desktop', 1280, 800);
  await run('phone', 390, 844);

  await browser.close();

  if (errors.length) {
    console.log('\nFAILURES:');
    errors.forEach(e => console.log('  ' + e));
    process.exit(1);
  }
  console.log('\n  browser checks passed; screenshots in dist/shots');
})();
