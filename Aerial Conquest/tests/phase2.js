// PLAN v2 Phase 2 (mass units) checks: headless Chromium, desktop + emulated iPhone 13.
const { chromium, devices } = require('playwright');
const path = require('path');
const URL = 'file://' + path.resolve(process.argv[2]);
const OUT = process.argv[3];
const results = [];
const check = (name, ok, info = '') => { results.push({ name, ok, info }); console.log((ok ? 'PASS ' : 'FAIL ') + name + (info ? '  — ' + info : '')); };
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const ignorable = (t) => /fonts\.(googleapis|gstatic)|ERR_|net::/.test(t);

/** Frame work (sim + draw) and frame gaps over `ms`, from the game's own ring buffer. */
async function measure(page, ms) {
  await page.evaluate(() => { GAME.perfWork.fill(0); GAME.perfGap.fill(0); GAME.perfIdx = 0; });
  await wait(ms);
  return page.evaluate(() => {
    const n = GAME.perfIdx;
    const w = Array.from(GAME.perfWork.slice(0, n)), gp = Array.from(GAME.perfGap.slice(0, n));
    const s = w.slice().sort((a, b) => a - b);
    const avg = (v) => v.reduce((a, b) => a + b, 0) / Math.max(1, v.length);
    return {
      frames: n, live: GAME.army.liveCount.slice(),
      workAvg: +avg(w).toFixed(2), workP99: +(s[Math.floor(s.length * 0.99)] || 0).toFixed(2), workMax: +(s[s.length - 1] || 0).toFixed(2),
      gapAvg: +avg(gp).toFixed(2), fps: +(1000 / avg(gp)).toFixed(1),
      over16: w.filter((v) => v > 16.7).length, over25: w.filter((v) => v > 25).length,
    };
  });
}

/** Clear everything and drop the knight mid-field. */
async function clean(page, god = true) {
  await page.evaluate((god) => {
    const p = GAME.player, f = GAME.field;
    GAME.enemies.length = 0; GAME.projectiles.length = 0; GAME.army.clear();
    GAME.respawnT = 999; GAME.waveIntro = 0; GAME.god = god;
    p.lock = null; p.state = 'idle'; p.iframes = 0; p.hp = p.stats.maxHp;
    p.x = f.x + f.w / 2; p.y = f.y + f.h / 2; p.facing = 0;
  }, god);
  await wait(50);
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
  await page.keyboard.press('Enter'); await wait(1200); await page.evaluate(() => { if (GAME.screen === 'campaign') GAME.startBattle(testSpec()); }); await wait(300);

  // ---- test field fields armies
  const tf = await page.evaluate(() => ({ foeMinions: GAME.army.live('enemy'), allyMinions: GAME.army.live('player'), foes: GAME.foesAlive(), allies: GAME.alliesAlive() }));
  check('test field: Dominion minions + allied minions (the 12-strong warband)', tf.foeMinions >= 20 && tf.allyMinions === 12, JSON.stringify(tf));

  // ---- DONE-WHEN: 200 live units at 60 fps on desktop
  await clean(page);
  await page.evaluate(() => { GAME.massTest(100); for (let i = 0; i < GAME.army.cap; i++) if (GAME.army.alive[i]) GAME.army.hp[i] = GAME.army.maxHp[i] = 1e6; });
  await wait(1500);   // let the lines close and the fight start (units can't die: constant load)
  const pd = await measure(page, 6000);
  check('DONE: 200 live units, desktop — frame work fits 60 fps', pd.live[0] + pd.live[1] === 200 && pd.workP99 < 16.7 && pd.over25 === 0 && pd.fps > 55,
    JSON.stringify(pd));
  await page.screenshot({ path: OUT + '/p2-200.png' });

  // ---- DONE-WHEN: Whirl through 20 minions doesn't hitch
  await clean(page);
  await page.evaluate(() => {
    const p = GAME.player; p.talents.whirl = true;
    for (let k = 0; k < 20; k++) { const a = k / 20 * Math.PI * 2, r = 34 + (k % 2) * 14; GAME.army.spawn('sword', 'enemy', p.x + Math.cos(a) * r, p.y + Math.sin(a) * r, 1); }
  });
  await wait(100);
  await page.evaluate(() => { GAME.perfWork.fill(0); GAME.perfIdx = 0; window.__maxStop = 0; window.__sawWhirl = false;
    const orig = GAME.tick.bind(GAME);
    GAME.tick = (dt) => { const before = GAME.hitstopFrames; orig(dt); const d = GAME.hitstopFrames - before; if (d > window.__maxStop) window.__maxStop = d;
      if (GAME.player.attackDef && GAME.player.attackDef.radial) window.__sawWhirl = true; };
  });
  for (let i = 0; i < 16; i++) { await page.keyboard.press('KeyJ'); await wait(110); if (await page.evaluate(() => window.__sawWhirl)) break; }
  await wait(1500);
  const wr = await page.evaluate(() => {
    const n = GAME.perfIdx, w = Array.from(GAME.perfWork.slice(0, n));
    return { sawWhirl: window.__sawWhirl, left: GAME.army.live('enemy'), workMax: +Math.max(...w).toFixed(2), over25: w.filter((v) => v > 25).length, maxStopAdded: window.__maxStop };
  });
  check('DONE: Whirl through 20 minions — no frame over 25 ms', wr.sawWhirl && wr.over25 === 0 && wr.left < 20, JSON.stringify(wr));

  // ---- hitstop cap: 20 kills in one call add at most WAR.minionHitstopCap frames; 1 kill adds 1
  await clean(page);
  const cap = await page.evaluate(() => {
    const p = GAME.player;
    const spawnRing = (n) => { for (let k = 0; k < n; k++) { const a = k / n * Math.PI * 2; const i = GAME.army.spawn('sword', 'enemy', p.x + Math.cos(a) * 36, p.y + Math.sin(a) * 36, 1); GAME.army.hp[i] = 1; } };
    GAME.army.update(GAME, 0);            // build the grid
    const whirl = { ...WHIRL, arc: Math.PI * 2 };
    spawnRing(20); GAME.army.update(GAME, 0);
    GAME.hitstopFrames = 0; GAME.minionStop = 0;
    GAME.hitMinions(whirl, p, new Set());
    const twenty = { stop: GAME.hitstopFrames, left: GAME.army.live('enemy') };
    GAME.army.clear(); spawnRing(1); GAME.army.update(GAME, 0);
    GAME.hitstopFrames = 0; GAME.minionStop = 0;
    GAME.hitMinions(whirl, p, new Set());
    return { twenty, one: GAME.hitstopFrames, capSetting: WAR.minionHitstopCap };
  });
  check('hitstop cap: 20 kills in one sim frame -> 2 frames; 1 kill -> 1 frame', cap.twenty.left === 0 && cap.twenty.stop === 2 && cap.one === 1, JSON.stringify(cap));

  // ---- feel target: a normal swing kills a swordsman in 2 hits
  const feel = await page.evaluate(() => {
    const p = GAME.player, def = GROUND_COMBO[0];
    const armor = UNITS.sword.def * TIER_SCALING.defenseMultiplier(1), hp = UNITS.sword.hp * TIER_SCALING.hpMultiplier(1);
    let need2 = 0, need1 = 0, more = 0;
    for (let k = 0; k < 2000; k++) {
      const a = physDamage(def.power * TUNING.playerDamageMult * p.weapon.powerMult, p.stats.str, armor).dmg;
      const b = physDamage(def.power * TUNING.playerDamageMult * p.weapon.powerMult, p.stats.str, armor).dmg;
      if (a >= hp) need1++; else if (a + b >= hp) need2++; else more++;
    }
    return { hp, oneHit: need1, twoHits: need2, moreThanTwo: more };
  });
  check('feel: knight\'s normal swing kills a tier-1 swordsman in <= 2 hits', feel.moreThanTwo === 0 && feel.twoHits > feel.oneHit * 5, JSON.stringify(feel));
  await clean(page);
  await page.evaluate(() => { const p = GAME.player; GAME.army.spawn('sword', 'enemy', p.x + 30, p.y, 1); GAME.army.update(GAME, 0); });
  let hits = 0;
  for (; hits < 4; hits++) { if (await page.evaluate(() => GAME.army.live('enemy')) === 0) break; await page.keyboard.press('KeyJ'); await wait(260); }
  check('live: a swordsman dies to the knight\'s opening combo (<= 2 presses)', hits <= 2, `${hits} presses`);

  // ---- minions hurt the knight (god off), and the knight's i-frames stop a crowd stun-locking
  await clean(page, false);
  const hurt = await page.evaluate(async () => {
    const p = GAME.player; const hp0 = p.hp;
    for (let k = 0; k < 8; k++) { const a = k / 8 * Math.PI * 2; GAME.army.spawn('sword', 'enemy', p.x + Math.cos(a) * 28, p.y + Math.sin(a) * 28, 1); }
    await new Promise((r) => setTimeout(r, 3000));
    return { hp0, hp1: p.hp, alive: p.alive };
  });
  check('minions hurt the knight (8 swordsmen, 3 s)', hurt.hp1 < hurt.hp0 && hurt.alive, JSON.stringify(hurt));

  // ---- unit rules
  await clean(page);
  const rules = await page.evaluate(() => {
    const a = GAME.army, p = GAME.player;
    const s = a.spawn('shield', 'enemy', p.x + 300, p.y, 1);
    a.facing[s] = Math.PI;   // facing left, toward an attacker on its left
    const hp0 = a.hp[s];
    a.hurt(GAME, s, 20, 0, 0, false);                 // hit travelling +x: from the front
    const front = hp0 - a.hp[s];
    const hp1 = a.hp[s];
    a.hurt(GAME, s, 20, Math.PI, 0, false);           // hit travelling -x: from behind
    const back = hp1 - a.hp[s];
    // spearman vs hound: x2
    const sp = a.spawn('spear', 'player', p.x - 300, p.y, 1);
    const hd = a.spawn('hound', 'enemy', p.x - 280, p.y, 1);
    const sw = a.spawn('sword', 'enemy', p.x - 280, p.y + 40, 1);
    let vsHound = 0, vsSword = 0;
    TUNING.variance = 0; const cc = TUNING.critChance; TUNING.critChance = 0;
    a.hp[hd] = 999; a.hp[sw] = 999; a.armor[hd] = 0; a.armor[sw] = 0;
    GAME.unitStrike(a, sp, a.ref(hd)); vsHound = 999 - a.hp[hd];
    GAME.unitStrike(a, sp, a.ref(sw)); vsSword = 999 - a.hp[sw];
    TUNING.variance = 0.08; TUNING.critChance = cc;
    return { front, back, vsHound, vsSword };
  });
  check('shieldbearer: frontal hits -70%', rules.front === 6 && rules.back === 20, JSON.stringify(rules));
  check('spearman: x2 vs beasts', Math.abs(rules.vsHound - rules.vsSword * 2) <= 1, `vs hound ${rules.vsHound}, vs sword ${rules.vsSword}`);

  await clean(page);
  const ram = await page.evaluate(async () => {
    const a = GAME.army, p = GAME.player;
    const r = a.spawn('ram', 'enemy', p.x + 200, p.y, 1);
    for (let k = 0; k < 6; k++) a.spawn('sword', 'player', p.x + 120, p.y - 60 + k * 24, 1);
    const x0 = a.x[r];
    a.hurt(GAME, r, 1, 0, 400, false);
    const kicked = Math.hypot(a.vx[r], a.vy[r]);
    await new Promise((res) => setTimeout(res, 2000));
    return { target: a.tgt[r], moved: Math.round(Math.abs(a.x[r] - x0)), kicked: Math.round(kicked) };
  });
  check('siege ram: never targets units, shrugs off knockback, walks on', ram.target === null && ram.kicked === 0 && ram.moved > 20, JSON.stringify(ram));

  await clean(page);
  const arch = await page.evaluate(async () => {
    const a = GAME.army, p = GAME.player;
    const ar = a.spawn('archer', 'player', p.x - 250, p.y, 1);
    const tg = a.spawn('shield', 'enemy', p.x - 50, p.y, 1);
    a.hp[tg] = a.maxHp[tg] = 500; a.facing[tg] = 0;   // facing away: no shield cut
    let shots = 0;
    for (let t = 0; t < 40; t++) { await new Promise((r) => setTimeout(r, 100)); shots = Math.max(shots, a.arrows); }
    return { shots, targetHp: a.hp[tg] };
  });
  check('archers fire arrows that hit', arch.shots > 0 && arch.targetHp < 500, JSON.stringify(arch));

  // ---- elites and minions fight each other
  await clean(page);
  const el = await page.evaluate(async () => {
    const a = GAME.army, p = GAME.player;
    const ally = new Enemy(ENEMIES.shade, p.x + 300, p.y, 4, 1); ally.team = 'player'; ally.maxHp = ally.hp = 3000; GAME.enemies.push(ally);
    const foes = []; for (let k = 0; k < 4; k++) foes.push(a.spawn('sword', 'enemy', p.x + 380, p.y - 40 + k * 26, 1));
    const foe = new Enemy(ENEMIES.shade, p.x - 300, p.y, 4, 1); foe.maxHp = foe.hp = 3000; GAME.enemies.push(foe);
    const mine = []; for (let k = 0; k < 4; k++) mine.push(a.spawn('sword', 'player', p.x - 380, p.y - 40 + k * 26, 1));
    p.x += 1000;   // knight out of it
    GAME.order = 'charge';   // (Phase 3) under the default Follow the allied minions would run to the knight instead
    const hp = (ids) => ids.reduce((s, i) => s + (a.alive[i] ? a.hp[i] : 0), 0);
    const f0 = hp(foes), m0 = hp(mine);
    await new Promise((r) => setTimeout(r, 6000));
    return { allyTargetsMinion: ally.target instanceof MinionRef || hp(foes) === 0, foeTargetsMinion: foe.target instanceof MinionRef || hp(mine) === 0,
      foeMinionHp: [f0, hp(foes)], allyMinionHp: [m0, hp(mine)], allyEliteHp: ally.hp, foeEliteHp: foe.hp };
  });
  check('allied elite targets and damages Dominion minions', el.allyTargetsMinion && el.foeMinionHp[1] < el.foeMinionHp[0], JSON.stringify(el));
  check('Dominion elite targets and damages allied minions', el.foeTargetsMinion && el.allyMinionHp[1] < el.allyMinionHp[0]);
  check('minions damage elites', el.allyEliteHp < 3000 && el.foeEliteHp < 3000, `ally ${el.allyEliteHp}, foe ${el.foeEliteHp}`);

  // ---- the knight never hurts allied minions; Fire and Thunder hit Dominion minions
  await clean(page);
  await page.evaluate(() => {
    const a = GAME.army, p = GAME.player; p.talents.whirl = true;
    for (let k = 0; k < 6; k++) { const ang = k / 6 * Math.PI * 2; a.spawn('shield', 'player', p.x + Math.cos(ang) * 40, p.y + Math.sin(ang) * 40, 1); }
    for (let i = 0; i < a.cap; i++) if (a.alive[i]) { a.cd[i] = 999; }
    a.update(GAME, 0);
  });
  for (let i = 0; i < 8; i++) { await page.keyboard.press('KeyJ'); await wait(120); }
  await page.keyboard.press('Digit3'); await wait(600);
  const fr = await page.evaluate(() => { const a = GAME.army; let full = 0, n = 0; for (let i = 0; i < a.cap; i++) if (a.alive[i]) { n++; if (a.hp[i] === a.maxHp[i]) full++; } return { n, full }; });
  check('knight\'s combo, Whirl and Thunder never hit allied minions', fr.n === 6 && fr.full === 6, JSON.stringify(fr));
  await clean(page);
  const mag = await page.evaluate(async () => {
    const a = GAME.army, p = GAME.player; p.mp = p.stats.maxMp;
    const t1 = a.spawn('shield', 'enemy', p.x + 200, p.y, 1); a.hp[t1] = a.maxHp[t1] = 400; a.cd[t1] = 999;
    a.update(GAME, 0);
    GAME.fireSpell(SPELLS[0], p);
    await new Promise((r) => setTimeout(r, 900));
    const afterFire = a.hp[t1];
    p.mp = p.stats.maxMp; p.charging = false;
    GAME.fireSpell(SPELLS.find((s) => s.kind === 'strike'), p);
    return { start: 400, afterFire, afterThunder: a.hp[t1] };
  });
  check('Fire and Thunder hit Dominion minions', mag.afterFire < 400 && mag.afterThunder < mag.afterFire, JSON.stringify(mag));

  // ---- live cap and grid correctness
  await clean(page);
  const capd = await page.evaluate(() => {
    let ok = 0; for (let k = 0; k < 130; k++) if (GAME.army.spawn('sword', 'enemy', 100 + (k % 20) * 20, 100 + Math.floor(k / 20) * 20, 1) >= 0) ok++;
    return { spawned: ok, cap: Army.liveCap() };
  });
  check('live cap: 100 Dominion minions max on desktop', capd.spawned === 100 && capd.cap === 100, JSON.stringify(capd));
  await clean(page);
  const grid = await page.evaluate(() => {
    const a = GAME.army, f = GAME.field;
    for (let k = 0; k < 90; k++) { a.spawn('sword', 'enemy', f.x + 40 + Math.random() * (f.w - 80), f.y + 40 + Math.random() * (f.h - 80), 1); a.spawn('sword', 'player', f.x + 40 + Math.random() * (f.w - 80), f.y + 40 + Math.random() * (f.h - 80), 1); }
    a.update(GAME, 0);
    let mism = 0;
    for (let t = 0; t < 200; t++) {
      const x = f.x + Math.random() * f.w, y = f.y + Math.random() * f.h, r = 50 + Math.random() * 500;
      let bj = -1, bd = r * r;
      for (let i = 0; i < a.cap; i++) { if (!a.alive[i] || a.team[i] !== TEAM_ENEMY) continue; const d = (a.x[i] - x) ** 2 + (a.y[i] - y) ** 2; if (d < bd) { bd = d; bj = i; } }
      if (a.nearestHostile('player', x, y, r) !== bj) mism++;
    }
    return { queries: 200, mismatches: mism };
  });
  check('grid: nearest-hostile matches brute force (200 random queries)', grid.mismatches === 0, JSON.stringify(grid));

  check('desktop: no page errors', errors.length === 0, errors.slice(0, 5).join(' | '));
  await ctx.close();
}

async function phone(browser, throttle) {
  const ctx = await browser.newContext({ ...devices['iPhone 13 landscape'] });
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(String(e)));
  page.on('console', (m) => { if (m.type() === 'error' && !ignorable(m.text())) errors.push(m.text()); });
  if (throttle > 1) { const cdp = await ctx.newCDPSession(page); await cdp.send('Emulation.setCPUThrottlingRate', { rate: throttle }); }
  await page.goto(URL); await wait(900);
  const b = await page.evaluate(() => { const r = document.getElementById('game').getBoundingClientRect(); return { x: r.left, y: r.top, w: r.width, h: r.height }; });
  const s = { x: b.x + 480 / 960 * b.w, y: b.y + 278 / 540 * b.h };
  await page.touchscreen.tap(s.x, s.y); await wait(1000); await page.evaluate(() => { if (GAME.screen === 'campaign') GAME.startBattle(testSpec()); }); await wait(300);
  const tag = throttle > 1 ? ` (CPU x${throttle} throttle)` : ' (unthrottled)';
  await clean(page);
  const cap = await page.evaluate(() => Army.liveCap());
  await page.evaluate(() => { GAME.massTest(100); for (let i = 0; i < GAME.army.cap; i++) if (GAME.army.alive[i]) GAME.army.hp[i] = GAME.army.maxHp[i] = 1e6; });   // asks for 100; the phone cap holds it to 60 a side
  await wait(1500);
  const pm = await measure(page, 6000);
  const ok = cap === 60 && pm.live[0] + pm.live[1] === 120 && pm.workP99 < 16.7 && pm.over25 === 0 && pm.fps > 55;
  if (throttle === 1) check('DONE: 120 live units, emulated iPhone 13' + tag + ' — 60 fps', ok, JSON.stringify(pm));
  else console.log(`INFO 120 live units, emulated iPhone 13${tag}: ${pm.fps} fps, work avg ${pm.workAvg} ms, p99 ${pm.workP99} ms`);
  if (throttle > 1) await page.screenshot({ path: OUT + '/p2-phone-120.png' });
  check('phone' + tag + ': no page errors', errors.length === 0, errors.slice(0, 5).join(' | '));
  await ctx.close();
}

(async () => {
  const browser = await chromium.launch();
  try { await desktop(browser); await phone(browser, 1); await phone(browser, 2); await phone(browser, 4); }
  catch (e) { check('script ran to completion', false, String(e && e.stack || e)); }
  await browser.close();
  const fails = results.filter((r) => !r.ok);
  console.log(`\n${results.length - fails.length}/${results.length} passed`);
  process.exit(fails.length ? 1 : 0);
})();
