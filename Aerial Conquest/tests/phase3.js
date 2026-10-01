// PLAN v2 Phase 3 (warband + command wheel + streaming) checks: headless Chromium, desktop + emulated iPhone 13.
const { chromium, devices } = require('playwright');
const path = require('path');
const URL = 'file://' + path.resolve(process.argv[2]);
const OUT = process.argv[3];
const results = [];
const check = (name, ok, info = '') => { results.push({ name, ok, info }); console.log((ok ? 'PASS ' : 'FAIL ') + name + (info ? '  — ' + info : '')); };
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const ignorable = (t) => /fonts\.(googleapis|gstatic)|ERR_|net::/.test(t);
const order = (page) => page.evaluate(() => GAME.order);

/** Clear the field: knight mid-field, god mode, nothing else. */
async function clean(page) {
  await page.evaluate(() => {
    const p = GAME.player, f = GAME.field;
    GAME.enemies.length = 0; GAME.projectiles.length = 0; GAME.army.clear();
    GAME.respawnT = 999; GAME.waveIntro = 0; GAME.god = true;
    p.lock = null; p.state = 'idle'; p.iframes = 0; p.x = f.x + f.w / 2; p.y = f.y + f.h / 2;
    GAME.order = 'follow';
  });
  await wait(50);
}

/** A warband of n swordsmen around the knight. */
async function warband(page, n) {
  await page.evaluate((n) => { const p = GAME.player; for (let k = 0; k < n; k++) GAME.army.spawn('sword', 'player', p.x - 40 + (k % 4) * 20, p.y - 30 + Math.floor(k / 4) * 20, 1); }, n);
}

async function desktop(browser) {
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 } });
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(String(e)));
  page.on('console', (m) => { if (m.type() === 'error' && !ignorable(m.text())) errors.push(m.text()); });
  await page.goto(URL);
  await page.evaluate(() => localStorage.clear());
  await page.reload(); await wait(700);
  await page.keyboard.press('Enter'); await wait(800); await page.evaluate(() => { if (GAME.screen === 'campaign') GAME.startBattle(testSpec()); }); await wait(300);

  const tf = await page.evaluate(() => ({ warband: GAME.army.live('player'), cap: GAME.warbandCap(), order: GAME.order }));
  check('test field: warband of 12 (base cap), order Follow', tf.warband === 12 && tf.cap === 12 && tf.order === 'follow', JSON.stringify(tf));

  // ---- keyboard: tap Q cycles; hold Q + direction picks; the knight doesn't walk while choosing
  await clean(page);
  await page.keyboard.press('KeyQ'); await wait(100);
  const afterTap = await order(page);
  const picks = {};
  for (const [key, want] of [['KeyW', 'charge'], ['KeyD', 'focus'], ['KeyS', 'hold'], ['KeyA', 'follow']]) {
    const x0 = await page.evaluate(() => GAME.player.x);
    await page.keyboard.down('KeyQ'); await wait(80);
    await page.keyboard.down(key); await wait(300);
    const wheel = await page.evaluate(() => ({ open: GAME.wheelOpen, dir: GAME.wheelDir }));
    await page.keyboard.up(key); await wait(30);
    await page.keyboard.up('KeyQ'); await wait(100);
    const moved = Math.abs((await page.evaluate(() => GAME.player.x)) - x0);
    picks[key] = { got: await order(page), want, wheel, moved: Math.round(moved) };
  }
  check('keyboard: tap Q cycles Follow -> Charge', afterTap === 'charge', afterTap);
  check('keyboard: hold Q + W/D/S/A gives Charge/Focus/Hold/Follow', Object.values(picks).every((p) => p.got === p.want && p.wheel.open), JSON.stringify(picks));
  check('keyboard: the knight stands still while the wheel is open', Object.values(picks).every((p) => p.moved < 3), Object.values(picks).map((p) => p.moved).join(','));
  await page.keyboard.press('KeyQ'); await wait(80);
  check('keyboard: tap again keeps cycling (Follow -> Charge)', (await order(page)) === 'charge');

  // ---- gamepad: LB + stick (pad stubbed: Playwright cannot plug in a real one)
  await clean(page);
  await page.evaluate(() => {
    const btn = () => ({ pressed: false, value: 0 });
    window.__pad = { buttons: Array.from({ length: 17 }, btn), axes: [0, 0, 0, 0], connected: true, index: 0, id: 'stub' };
    navigator.getGamepads = () => [window.__pad];
    GAME.input.gamepadIndex = 0;
  });
  const pad = {};
  for (const [ax, ay, want] of [[0, -1, 'charge'], [1, 0, 'focus'], [0, 1, 'hold'], [-1, 0, 'follow']]) {
    await page.evaluate(() => { window.__pad.buttons[4].pressed = true; });
    await wait(80);
    await page.evaluate(([ax, ay]) => { window.__pad.axes[0] = ax; window.__pad.axes[1] = ay; }, [ax, ay]);
    await wait(250);
    await page.evaluate(() => { window.__pad.axes[0] = 0; window.__pad.axes[1] = 0; window.__pad.buttons[4].pressed = false; });
    await wait(120);
    pad[want] = await order(page);
  }
  await page.evaluate(() => { window.__pad.buttons[4].pressed = true; });
  await wait(60);
  await page.evaluate(() => { window.__pad.buttons[4].pressed = false; });
  await wait(100);
  const padTap = await order(page);
  await page.evaluate(() => { GAME.input.gamepadIndex = -1; });
  check('gamepad: LB + stick up/right/down/left gives Charge/Focus/Hold/Follow', Object.entries(pad).every(([w, g]) => w === g), JSON.stringify(pad));
  check('gamepad: tap LB cycles', padTap === 'charge', padTap);

  // ---- Potion moved to E; Q no longer drinks
  await clean(page);
  const pot0 = await page.evaluate(() => { GAME.player.hp = 30; GAME.player.potions = 3; return GAME.player.potions; });
  await page.keyboard.press('KeyQ'); await wait(150);
  const potQ = await page.evaluate(() => GAME.player.potions);
  await page.keyboard.press('KeyE'); await wait(300);
  const potE = await page.evaluate(() => ({ n: GAME.player.potions, hp: GAME.player.hp }));
  check('Potion on E (Q no longer drinks)', potQ === pot0 && potE.n === pot0 - 1 && potE.hp > 30, `Q: ${pot0}->${potQ}; E: ${potQ}->${potE.n}, HP 30->${potE.hp}`);

  // ---- Follow: the warband stays with the knight and doesn't chase a far foe
  await clean(page);
  await warband(page, 12);
  await page.evaluate(() => {
    const p = GAME.player;
    const f = new Enemy(ENEMIES.shade, p.x + 700, p.y, 4, 1); f.aggro = false; f.wanderT = 999; f.maxHp = f.hp = 5000; GAME.enemies.push(f);
  });
  await page.evaluate(() => { GAME.player.x -= 300; });
  await page.keyboard.down('KeyA'); await wait(1500); await page.keyboard.up('KeyA');
  await wait(1500);
  const fol = await page.evaluate(() => {
    const a = GAME.army, p = GAME.player; let worst = 0;
    for (let i = 0; i < a.cap; i++) if (a.alive[i] && a.team[i] === TEAM_PLAYER) worst = Math.max(worst, dist(a.x[i], a.y[i], p.x, p.y));
    return { worst: Math.round(worst), foeHp: GAME.enemies[0].hp };
  });
  check('Follow: warband stays within range of the knight and leaves a far foe alone', fol.worst <= 220 + 40 && fol.foeHp === 5000, JSON.stringify(fol));
  await page.screenshot({ path: OUT + '/p3-follow.png' });

  // ---- Charge: the warband goes for it (foe moved to 500 px: past Follow's leash, a walkable charge)
  await page.evaluate(() => { const f = GAME.enemies[0], p = GAME.player; f.x = p.x + 500; f.y = p.y; });
  await wait(1500);
  const stillFollow = await page.evaluate(() => GAME.enemies[0].hp);
  await page.evaluate(() => GAME.issueOrder('charge'));
  await wait(7000);
  const chg = await page.evaluate(() => ({ foeHp: GAME.enemies[0].hp }));
  check('Charge: warband engages a foe that Follow ignored', stillFollow === 5000 && chg.foeHp < 5000, `under Follow ${stillFollow}; after Charge ${chg.foeHp}`);

  // ---- Hold: the warband stays where it was told while the knight walks off
  await clean(page);
  await warband(page, 12);
  await wait(300);
  await page.evaluate(() => GAME.issueOrder('hold'));
  const anchors = await page.evaluate(() => { const a = GAME.army, o = []; for (let i = 0; i < a.cap; i++) if (a.alive[i]) o.push([i, a.x[i], a.y[i]]); return o; });
  await page.keyboard.down('KeyD'); await wait(2500); await page.keyboard.up('KeyD');
  await wait(800);
  const hold = await page.evaluate((anchors) => {
    const a = GAME.army; let worst = 0;
    for (const [i, x, y] of anchors) worst = Math.max(worst, dist(a.x[i], a.y[i], x, y));
    return { worst: Math.round(worst), knightMoved: Math.round(GAME.player.x - anchors[0][1]) };
  }, anchors);
  check('Hold: warband keeps its spot while the knight walks away', hold.worst < 40 && hold.knightMoved > 300, JSON.stringify(hold));
  await page.evaluate(() => GAME.issueOrder('follow'));
  await wait(3500);
  const back = await page.evaluate(() => { const a = GAME.army, p = GAME.player; let worst = 0; for (let i = 0; i < a.cap; i++) if (a.alive[i]) worst = Math.max(worst, dist(a.x[i], a.y[i], p.x, p.y)); return Math.round(worst); });
  check('Follow after Hold: the warband catches back up', back <= 260, `furthest ${back}px`);

  // ---- Focus: every unit (and the allied elite) on the lock-on target; without a lock, the nearest hostile
  await clean(page);
  await warband(page, 10);
  const foc = await page.evaluate(async () => {
    const p = GAME.player;
    const near = new Enemy(ENEMIES.shade, p.x + 150, p.y, 4, 1); near.maxHp = near.hp = 9999; near.aggro = false; near.wanderT = 999;
    const far = new Enemy(ENEMIES.bruiser, p.x + 420, p.y + 120, 4, 1); far.maxHp = far.hp = 9999; far.aggro = false; far.wanderT = 999;
    const gen = new Enemy(ENEMIES.shade, p.x - 60, p.y + 40, 4, 1); gen.team = 'player';
    GAME.enemies.push(near, far, gen);
    p.lock = far;
    GAME.issueOrder('focus');
    await new Promise((r) => setTimeout(r, 400));
    const a = GAME.army; let onFar = 0, n = 0;
    for (let i = 0; i < a.cap; i++) if (a.alive[i]) { n++; if (a.tgt[i] === far) onFar++; }
    const genOnFar = gen.target === far;
    p.lock = null;
    await new Promise((r) => setTimeout(r, 400));
    let onNear = 0;
    for (let i = 0; i < a.cap; i++) if (a.alive[i] && a.tgt[i] === near) onNear++;
    return { n, onFar, genOnFar, onNearNoLock: onNear, genOnNear: gen.target === near };
  });
  check('Focus: every warband unit targets the lock-on target', foc.onFar === foc.n && foc.n === 10, JSON.stringify(foc));
  check('Focus: the allied elite (general) obeys too', foc.genOnFar);
  check('Focus without a lock: the hostile nearest the knight', foc.onNearNoLock === foc.n && foc.genOnNear);

  // ---- DONE-WHEN: reserves stream in when the live count drops
  await clean(page);
  const st = await page.evaluate(async () => {
    const a = GAME.army, f = GAME.field;
    a.setEdge('enemy', f.x + f.w - 40, f.y + f.h / 2, 200);
    for (let k = 0; k < 100; k++) a.spawn('sword', 'enemy', f.x + f.w - 300 + (k % 10) * 20, f.y + 300 + Math.floor(k / 10) * 20, 1);
    a.addReserve('enemy', 'sword', 30);
    for (let i = 0; i < a.cap; i++) if (a.alive[i]) a.cd[i] = 999;
    const t0 = performance.now();
    const log = [];
    // nothing should stream while at the cap
    await new Promise((r) => setTimeout(r, 2000));
    log.push({ t: 2.0, live: a.live('enemy'), res: a.reserveCount('enemy') });
    // kill 20
    let killed = 0;
    for (let i = 0; i < a.cap && killed < 20; i++) if (a.alive[i] && a.team[i] === TEAM_ENEMY) { a.hurt(GAME, i, 1e6, 0, 0, false); killed++; }
    const tk = performance.now();
    log.push({ t: 'kill', live: a.live('enemy'), res: a.reserveCount('enemy') });
    const seen = [];
    let last = a.live('enemy');
    const known = new Set(); for (let i = 0; i < a.cap; i++) if (a.alive[i]) known.add(a.uid[i]);
    let nearEdge = 0, fresh = 0;
    while (performance.now() - tk < 5200) {
      await new Promise((r) => setTimeout(r, 50));
      // newcomers: where each one is the first time we see it
      for (let i = 0; i < a.cap; i++) if (a.alive[i] && !known.has(a.uid[i])) {
        known.add(a.uid[i]); fresh++;
        if (Math.abs(a.x[i] - (f.x + f.w - 40)) < 40) nearEdge++;
      }
      const l = a.live('enemy');
      if (l !== last) { seen.push({ dt: +((performance.now() - tk) / 1000).toFixed(2), live: l, res: a.reserveCount('enemy') }); last = l; }
    }
    return { log, seen, fresh, nearEdge };
  });
  const steps = st.seen;
  const ok = st.log[0].live === 100 && st.log[0].res === 30 && st.log[1].live === 80
    && steps.length >= 3 && steps.every((s, k) => s.live === 80 + 6 * (k + 1) || (k === steps.length - 1 && s.live === 100))
    && Math.abs(steps[0].dt - 1.5) < 0.35 && Math.abs(steps[1].dt - 3.0) < 0.35;
  check('DONE: reserves stream in when the live count drops (6 per 1.5 s, none at the cap)', ok, JSON.stringify(st));
  check('streamed units arrive at their side\'s edge', st.fresh > 0 && st.nearEdge === st.fresh, `${st.nearEdge}/${st.fresh} near the edge`);

  // ---- a test-field group past the live cap waits in reserve, and the group only clears when the reserve is spent
  await page.evaluate(() => { GAME.startTestField(); for (let k = 0; k < 6; k++) { GAME.groupsCleared++; } });
  await page.evaluate(() => { GAME.enemies.length = 0; GAME.army.clear(); GAME.respawnT = 0.01; });
  await wait(400);
  const grp = await page.evaluate(() => ({ live: GAME.army.live('enemy'), res: GAME.army.reserveCount('enemy'), foes: GAME.foesAlive() }));
  check('a big group overflows into reserve; reserve counts toward the group', grp.live === 100 && grp.res > 0 && grp.foes >= grp.live + grp.res, JSON.stringify(grp));
  await page.screenshot({ path: OUT + '/p3-wheel-hud.png' });

  check('desktop: no page errors', errors.length === 0, errors.slice(0, 5).join(' | '));
  await ctx.close();
}

async function phone(browser) {
  const ctx = await browser.newContext({ ...devices['iPhone 13 landscape'] });
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(String(e)));
  page.on('console', (m) => { if (m.type() === 'error' && !ignorable(m.text())) errors.push(m.text()); });
  await page.goto(URL); await wait(800);
  const b = await page.evaluate(() => { const r = document.getElementById('game').getBoundingClientRect(); return { x: r.left, y: r.top, w: r.width, h: r.height }; });
  const pt = (x, y) => ({ x: b.x + x / 960 * b.w, y: b.y + y / 540 * b.h });
  const s = pt(480, 278); await page.touchscreen.tap(s.x, s.y); await wait(800); await page.evaluate(() => { if (GAME.screen === 'campaign') GAME.startBattle(testSpec()); }); await wait(300);
  await clean(page);
  const cdp = await ctx.newCDPSession(page);
  const cmd = pt(672, 456);
  // tap CMD: cycles
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: cmd.x, y: cmd.y, id: 7 }] });
  await wait(80);
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  await wait(120);
  const tapped = await order(page);
  // drag to each slice
  const got = {};
  for (const [dx, dy, want] of [[0, -60, 'charge'], [60, 0, 'focus'], [0, 60, 'hold'], [-60, 0, 'follow']]) {
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: cmd.x, y: cmd.y, id: 7 }] });
    await wait(60);
    for (let k = 1; k <= 4; k++) { await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: cmd.x + dx * k / 4 * b.w / 960, y: cmd.y + dy * k / 4 * b.h / 540, id: 7 }] }); await wait(25); }
    const open = await page.evaluate(() => ({ open: GAME.wheelOpen, dir: GAME.wheelDir }));
    if (want === 'focus') await page.screenshot({ path: OUT + '/p3-radial.png' });
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
    await wait(120);
    got[want] = { got: await order(page), open };
  }
  check('touch: tap CMD cycles', tapped === 'charge', tapped);
  check('touch: CMD radial drag up/right/down/left gives Charge/Focus/Hold/Follow', Object.entries(got).every(([w, v]) => v.got === w && v.open.open), JSON.stringify(got));
  // the stick still walks the knight while the other thumb works the radial
  const x0 = await page.evaluate(() => GAME.player.x);
  const st = pt(118, 424), st2 = pt(180, 424);
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: st.x, y: st.y, id: 1 }] });
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: st2.x, y: st2.y, id: 1 }] });
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: st2.x, y: st2.y, id: 1 }, { x: cmd.x, y: cmd.y, id: 7 }] });
  await wait(600);
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  const x1 = await page.evaluate(() => GAME.player.x);
  check('touch: the knight keeps walking while the radial is open', x1 - x0 > 30, `dx ${Math.round(x1 - x0)}`);
  // phone streaming under the 60 cap
  await clean(page);
  const ps = await page.evaluate(async () => {
    const a = GAME.army, f = GAME.field;
    a.setEdge('enemy', f.x + f.w - 40, f.y + f.h / 2, 200);
    for (let k = 0; k < 80; k++) if (a.spawn('sword', 'enemy', f.x + f.w - 300 + (k % 10) * 20, f.y + 300 + Math.floor(k / 10) * 20, 1) < 0) a.addReserve('enemy', 'sword');
    for (let i = 0; i < a.cap; i++) if (a.alive[i]) a.cd[i] = 999;
    const live0 = a.live('enemy'), res0 = a.reserveCount('enemy');
    let killed = 0;
    for (let i = 0; i < a.cap && killed < 12; i++) if (a.alive[i] && a.team[i] === TEAM_ENEMY) { a.hurt(GAME, i, 1e6, 0, 0, false); killed++; }
    await new Promise((r) => setTimeout(r, 3400));
    return { live0, res0, after: a.live('enemy'), resAfter: a.reserveCount('enemy') };
  });
  check('phone: 60-per-side cap, overflow in reserve, streams back to 60', ps.live0 === 60 && ps.res0 === 20 && ps.after === 60 && ps.resAfter === 8, JSON.stringify(ps));
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
