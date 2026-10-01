// PLAN v2 Phase 13 (music war layer, touch polish, phone caps) checks: headless Chromium, desktop + emulated iPhone 13.
const { chromium, devices } = require('playwright');
const path = require('path');
const URL = 'file://' + path.resolve(process.argv[2]);
const OUT = process.argv[3];
const results = [];
const check = (name, ok, info = '') => { results.push({ name, ok, info }); console.log((ok ? 'PASS ' : 'FAIL ') + name + (info ? '  — ' + info : '')); };
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const ignorable = (t) => /fonts\.(googleapis|gstatic)|ERR_|net::/.test(t);
const geom = (page) => page.evaluate(() => { const r = document.getElementById('game').getBoundingClientRect(); return { x: r.left, y: r.top, w: r.width, h: r.height }; });
const toPage = (b, x, y) => ({ x: b.x + x / 960 * b.w, y: b.y + y / 540 * b.h });
async function titleStart(page) {
  for (let k = 0; k < 8; k++) {
    if (await page.evaluate(() => GAME.screen === 'campaign' && !GAME.story)) return;
    await page.keyboard.press('Enter'); await wait(250);
  }
}
async function titleTapStart(page) {
  for (let k = 0; k < 8; k++) {
    const at = await page.evaluate(() => {
      if (GAME.screen === 'campaign') return GAME.story ? { x: 480, y: 300 } : null;
      const r = GAME.titleRowAt(GAME.titleMode === 'difficulty' ? 1 : 0); return { x: r.x + r.w / 2, y: r.y + r.h / 2 };
    });
    if (!at) return;
    const b = await geom(page); const s = toPage(b, at.x, at.y);
    await page.touchscreen.tap(s.x, s.y); await wait(300);
  }
}
const lv = (page) => page.evaluate(() => ({ level: GAME.musicLevel(), track: GAME.musicFor()[0] }));

async function desktop(browser) {
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 } });
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(String(e)));
  page.on('console', (m) => { if (m.type() === 'error' && !ignorable(m.text())) errors.push(m.text()); });
  await page.goto(URL); await page.evaluate(() => localStorage.clear()); await page.reload(); await wait(700);
  const L = {};
  L.title = await lv(page);
  await titleStart(page);
  await page.evaluate(() => { const w = GAME.war; w.tick = () => {}; WAR.reinforceChance = 0; });
  L.map = await lv(page);
  L.threat = await page.evaluate(() => { const c = GAME.camp, w = GAME.war; w.musters = [{ from: c.castleOf(1).id, target: c.castleOf(0).id, size: 10, t: 30 }]; const r = { level: GAME.musicLevel(), track: GAME.musicFor()[0] }; w.musters = []; return r; });
  L.army = await page.evaluate(() => { const c = GAME.camp, w = GAME.war; const a = w.spawnEnemyArmy(c.castleOf(1).id, c.castleOf(0).id, { ...emptyReserve(), sword: 10 }); const r = GAME.musicLevel(); w.armies = []; return { level: r, made: !!a }; });
  L.calm = await lv(page);
  check('map: 0 when calm (theme "Above the Storm"), 1 with a muster or an army coming for your land; title 0', L.title.level === 0 && L.title.track === 'title' && L.map.level === 0 && L.map.track === 'sky' && L.threat.level === 1 && L.army.made && L.army.level === 1 && L.calm.level === 0, JSON.stringify(L));

  // a village raid: 2, then 3 at 60+ live units, back to 2 only under 50
  const vb = await page.evaluate(() => {
    const c = GAME.camp, n = c.territories[1].nodes.find((m) => m.type === 'village');
    GAME.attackNode(n); GAME.god = true;
    const a = GAME.army, out = { start: GAME.musicLevel(), track: GAME.musicFor()[0], scenery: GAME.battle.spec.scenery };
    const live = () => a.live('player') + a.live('enemy');
    // trim to under 50, then add to 60+
    const kill = (n) => { for (let i = 0; i < a.cap && live() > n; i++) if (a.alive[i]) a.hurt(GAME, i, 1e9, 0, 0, false); };
    kill(40); out.at40 = [live(), GAME.musicLevel()];
    while (live() < 62) a.spawn('sword', 'enemy', GAME.battle.w * 0.7, GAME.battle.h / 2, 1);
    out.at62 = [live(), GAME.musicLevel()];
    kill(55); out.at55 = [live(), GAME.musicLevel()];
    kill(48); out.at48 = [live(), GAME.musicLevel()];
    return out;
  });
  check('battle: 2 at the start (the scenery\'s theme)', vb.start === 2 && vb.track === (vb.scenery === 'forest' ? 'forest' : vb.scenery), JSON.stringify(vb));
  check('60+ live units -> 3; it holds at 55 and drops back to 2 under 50', vb.at40[1] === 2 && vb.at62[1] === 3 && vb.at55[1] === 3 && vb.at48[1] === 2, JSON.stringify(vb));

  // the war layer, live: start the music and let a bar line pass at 3
  const live3 = await page.evaluate(async () => {
    GAME.music.start();
    const a = GAME.army;
    while (a.live('player') + a.live('enemy') < 70) a.spawn('sword', 'enemy', GAME.battle.w * 0.7, GAME.battle.h / 2, 1);
    GAME.simulate(0.05);
    await new Promise((r) => setTimeout(r, 4000));
    return { target: GAME.music.target, war: GAME.music.warLevel, running: GAME.music.running };
  });
  check('the live score applies it: at 3 the war layer is up (bus 0.95) after a bar line', live3.target === 3 && live3.war === 0.95, JSON.stringify(live3));
  await page.evaluate(() => GAME.enterCampaign());
  await page.evaluate(() => { GAME.war.tick = () => {}; });

  // castle siege: past the outer gate -> 3; the Lord in the fight -> 4 (boss theme)
  const cs = await page.evaluate(() => {
    const c = GAME.camp, n = c.castleOf(1);
    GAME.attackNode(n); GAME.god = true;
    const b = GAME.battle, a = GAME.army, out = {};
    a.clear(); for (const k of Object.keys(a.reserve[1])) a.reserve[1][k] = 0;
    for (let i = 0; i < 20; i++) a.spawn('sword', 'enemy', b.w * 0.6, b.h / 2, 1);
    GAME.simulate(0.05);
    out.gateUp = GAME.musicLevel();
    b.gates[0].damage(GAME, 1e9); GAME.simulate(0.05);
    out.inner = GAME.musicLevel();
    b.lord.aggro = true; GAME.simulate(0.05);
    out.lord = GAME.musicLevel(); out.track = GAME.musicFor()[0];
    b.lord.applyDamage(GAME, 1e8, 0, 0, 0, 0); GAME.simulate(0.05);
    out.after = GAME.musicLevel();
    return out;
  });
  check('siege: 2 at the outer gate, 3 once it\'s broken (inner gate), 4 with the Lord in the fight (boss theme), back to 3 when the Lord is down', cs.gateUp === 2 && cs.inner === 3 && cs.lord === 4 && cs.track === 'boss' && cs.after === 3, JSON.stringify(cs));
  await page.evaluate(() => GAME.enterCampaign());
  await page.evaluate(() => { GAME.war.tick = () => {}; });
  const wl = await page.evaluate(() => {
    const c = GAME.camp, n = c.castleOf(WAR.capitalTerritory), spec = c.battleSpec(n); GAME.war.dressCastle(spec, n);
    GAME.battleFrom = 'map'; GAME.startBattle(spec); GAME.god = true;
    const b = GAME.battle, before = GAME.musicLevel();
    for (const g of b.gates) g.damage(GAME, 1e9);
    GAME.simulate(0.05);
    return { before, gatesDown: GAME.musicLevel(), track: GAME.musicFor()[0] };
  });
  check('the warlord\'s seat: 4 (boss theme) once his gates are down', wl.gatesDown === 4 && wl.track === 'boss', JSON.stringify(wl));
  await page.evaluate(() => GAME.enterCampaign());

  // the war layer offline: nothing at 0, a march at 1-4; it raises the mix but stays under the tune
  const off = await page.evaluate(async () => {
    const out = {}, bufs = {}, rnd = Math.random;
    for (const L of [0, 1, 2, 3, 4]) {
      // seeded noise and reverb, so two renders differ only by the layers
      let seed = 12345; Math.random = () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647; };
      const buf = await Music.render('forest', 6, false, 1, L);
      Math.random = rnd;
      bufs[L] = buf.getChannelData(0);
      let s = 0; const d = bufs[L]; for (let i = 0; i < d.length; i++) s += d[i] * d[i];
      out[L] = { notes: Music.lastWarNotes, rms: +Math.sqrt(s / d.length).toFixed(4) };
    }
    // what the war layer adds at 1 (same seed, same tune, only the layer differs) vs the mix it sits in
    let dd = 0; const a = bufs[1], b = bufs[0]; for (let i = 0; i < a.length; i++) dd += (a[i] - b[i]) * (a[i] - b[i]);
    out.added = +Math.sqrt(dd / a.length).toFixed(4);
    return out;
  });
  check('war layer: no events at 0; snare march, roll and low brass scheduled at 1-4 (offline render)', off[0].notes === 0 && [1, 2, 3, 4].every((k) => off[k].notes >= 15), JSON.stringify(off));
  check('...and it adds to the mix under the tune: same seed, level 1 is louder than 0, the added signal well below the mix', off[1].rms > off[0].rms && off.added > 0.005 && off.added < off[0].rms * 0.6, JSON.stringify(off));

  check('desktop: no page errors', errors.length === 0, errors.slice(0, 5).join(' | '));
  await ctx.close();
}

async function phone(browser) {
  const ctx = await browser.newContext({ ...devices['iPhone 13 landscape'] });
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(String(e)));
  page.on('console', (m) => { if (m.type() === 'error' && !ignorable(m.text())) errors.push(m.text()); });
  await page.goto(URL); await page.evaluate(() => localStorage.clear()); await page.reload(); await wait(800);
  await titleTapStart(page);
  await page.evaluate(() => { const w = GAME.war; w.tick = () => {}; WAR.reinforceChance = 0; });
  const b = await geom(page);

  // tap Millbrook Castle on the map, then Attack
  const nodeAt = await page.evaluate(() => { const n = GAME.camp.castleOf(1); GAME.mapZoomTo = GAME.mapZoom = 1; GAME.mapX = n.x; GAME.mapY = n.y; GAME.clampMap(); return GAME.mapToScreen(n.x, n.y); });
  let s = toPage(b, nodeAt.x, nodeAt.y); await page.touchscreen.tap(s.x, s.y); await wait(300);
  const sel = await page.evaluate(() => ({ sel: GAME.mapSel, want: GAME.camp.castleOf(1).id }));
  const atk = await page.evaluate(() => { const bs = GAME.mapButtons(), i = bs.findIndex((x) => x.label === 'Attack'); if (i < 0) return null; const a = GAME.mapButtonAt(i, bs.length); return { x: a.x + a.w / 2, y: a.y + MAP_BTN.h / 2 }; });
  if (atk) { s = toPage(b, atk.x, atk.y); await page.touchscreen.tap(s.x, s.y); await wait(600); }
  const st = await page.evaluate(() => ({ screen: GAME.screen, kind: GAME.battle.spec.kind, cap: Army.liveCap(), live: GAME.army.liveCount.slice(), reserve: GAME.army.reserveCount('enemy') }));
  check('phone: tap a castle on the map, tap Attack -> the siege', sel.sel === sel.want && !!atk && st.screen === 'battle' && st.kind === 'castle', JSON.stringify({ sel, atk, st }));
  check('phone cap: 60 live per side, the rest waiting in reserve', st.cap === 60 && st.live[0] <= 60 && st.live[1] === 60 && st.reserve > 0, JSON.stringify(st));

  // touch controls mid-siege: ATK, CMD
  await wait(1800);   // past the wave intro
  const tb = await page.evaluate(() => Object.fromEntries(TOUCH_BTNS.map((t) => [t.id, { x: t.x, y: t.y }])));
  const o0 = await page.evaluate(() => GAME.order);
  s = toPage(b, tb.command.x, tb.command.y); await page.touchscreen.tap(s.x, s.y); await wait(200);
  const o1 = await page.evaluate(() => GAME.order);
  s = toPage(b, tb.attack.x, tb.attack.y); await page.touchscreen.tap(s.x, s.y); await wait(60);
  const at = await page.evaluate(() => ({ state: GAME.player.state, combo: GAME.player.comboIndex }));
  check('phone: CMD tap cycles the order; ATK tap swings', o0 !== o1 && /attack/.test(at.state), JSON.stringify({ o0, o1, at }));

  // play it: autopilot (god on, so the knight survives to show the whole siege), real time for a stretch, then fast
  await page.evaluate(() => { GAME.god = true; GAME.autopilot = true; GAME.perfWork.fill(0); GAME.perfGap.fill(0); GAME.perfIdx = 0; });
  await wait(8000);   // the perf ring holds 600 frames
  const perf = await page.evaluate(() => {
    const n = GAME.perfIdx, w = Array.from(GAME.perfWork.slice(0, n)).sort((a, b) => a - b), g = Array.from(GAME.perfGap.slice(0, n));
    const avgGap = g.reduce((s, x) => s + x, 0) / Math.max(1, n);
    return { frames: n, workAvg: +(w.reduce((s, x) => s + x, 0) / Math.max(1, n)).toFixed(2), workP99: +(w[Math.floor(n * 0.99)] || 0).toFixed(2), fps: +(1000 / avgGap).toFixed(1), live: GAME.army.liveCount.slice(), music: GAME.musicLevel(), objective: GAME.battle.objective };
  });
  await page.screenshot({ path: OUT + '/p13-phone-siege.png' });
  check('phone: the siege runs at 60 fps on the emulated iPhone (frame work p99 under 16.7 ms)', perf.frames > 400 && perf.frames < 600 && perf.workP99 < 16.7 && perf.fps > 55, JSON.stringify(perf));
  const done = await page.evaluate(() => { const t = GAME.simulate(900); const b = GAME.battle; return { result: b.result, t: Math.round(b.time), objective: b.outcome, lordFirst: b.lordBeatenFirst }; });
  await page.screenshot({ path: OUT + '/p13-phone-result.png' });
  await wait(900);
  // the Lord was beaten first: tap Recruit, then tap back to the map
  const rec = await page.evaluate(() => GAME.pendingRecruit ? { x: RECRUIT_BTN.x0 + RECRUIT_BTN.w / 2, y: RECRUIT_BTN.y + RECRUIT_BTN.h / 2 } : null);
  if (rec) { s = toPage(b, rec.x, rec.y); await page.touchscreen.tap(s.x, s.y); await wait(400); }
  s = toPage(b, 480, 300); await page.touchscreen.tap(s.x, s.y); await wait(500);
  const back = await page.evaluate(() => ({ screen: GAME.screen, owner: GAME.camp.castleOf(1).owner }));
  check('DONE: a full castle siege plays to the end on the emulated phone, and the tap back takes the castle', done.result === 'win' && back.screen === 'campaign' && back.owner === 'player', JSON.stringify({ done, back }));

  // portrait: the rotate prompt, and the game holds still behind it
  await page.evaluate(() => { const n = GAME.camp.territories[2].nodes.find((m) => m.type === 'village'); GAME.attackNode(n); GAME.god = true; GAME.autopilot = true; });
  await wait(2500);
  await page.setViewportSize({ width: 390, height: 844 }); await wait(400);
  const p0 = await page.evaluate(() => ({ t: GAME.battle.time, portrait: GAME.portrait, stage: getComputedStyle(document.getElementById('stage')).display, rotate: getComputedStyle(document.getElementById('rotate')).display }));
  await wait(1200);
  const p1 = await page.evaluate(() => GAME.battle.time);
  await page.screenshot({ path: OUT + '/p13-phone-portrait.png' });
  await page.setViewportSize({ width: 844, height: 390 }); await wait(800);
  const p2 = await page.evaluate(() => ({ t: GAME.battle.time, portrait: GAME.portrait }));
  check('phone portrait: the rotate prompt replaces the game, and battle time stands still; landscape resumes it', p0.portrait && p0.stage === 'none' && p0.rotate === 'flex' && p1 === p0.t && !p2.portrait && p2.t > p1, JSON.stringify({ p0, p1, p2 }));
  check('phone: no page errors', errors.length === 0, errors.slice(0, 5).join(' | '));
  await ctx.close();
}

(async () => {
  const browser = await chromium.launch();
  try { await desktop(browser); await phone(browser); }
  catch (e) { check('script ran to completion', false, String(e && e.stack || e)); }
  await browser.close();
  const fails = results.filter((r) => !r.ok);
  console.log(`\n${results.length - fails.length}/${results.length} passed`);
  process.exit(fails.length ? 1 : 0);
})();
