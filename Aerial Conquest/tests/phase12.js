// PLAN v2 Phase 12 (story, difficulty, NG+, victory, 3 slots) checks: headless Chromium, desktop + emulated iPhone 13.
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
const key = async (page, k, n = 1) => { for (let i = 0; i < n; i++) { await page.keyboard.press(k); await wait(70); } };
const state = (page) => page.evaluate(() => ({ screen: GAME.screen, mode: GAME.titleMode, idx: GAME.titleIndex, rows: GAME.titleRows(), slot: GAME.slot, story: GAME.story && GAME.story.title }));
const freeze = (page) => page.evaluate(() => { const w = GAME.war; w.tick = () => {}; WAR.reinforceChance = 0; });

async function desktop(browser) {
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 } });
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(String(e)));
  page.on('console', (m) => { if (m.type() === 'error' && !ignorable(m.text())) errors.push(m.text()); });
  await page.goto(URL);
  await page.evaluate(() => { localStorage.clear(); localStorage.setItem('aerial-finisher-save-v2', '{"keep":"me"}'); });
  await page.reload(); await wait(700);

  // ---- title -> slot picker -> difficulty -> intro card -> map
  const t0 = await state(page);
  await key(page, 'Enter');
  const t1 = await state(page);
  await page.screenshot({ path: OUT + '/p12-slots-empty.png' });
  await key(page, 'ArrowDown'); await key(page, 'Enter');            // Slot 2
  const t2 = await state(page);
  await key(page, 'ArrowDown'); await key(page, 'Enter');            // Hard
  await wait(200);
  const t3 = await state(page);
  await page.screenshot({ path: OUT + '/p12-intro.png' });
  const intro = await page.evaluate(() => ({ lines: GAME.story ? GAME.story.lines.join(' ') : '', diff: GAME.war.difficulty, slot2: !!localStorage.getItem('aerial-conquest-slot2'), slot1: !!localStorage.getItem('aerial-conquest-slot1') }));
  await key(page, 'Enter');
  const t4 = await state(page);
  check('fresh title: Play is the only way in; Enter opens the slot picker (3 slots + Back)', t0.rows.join() === 'Play,Options,How to Play' && t1.mode === 'slots' && t1.rows.join() === 'Slot 1,Slot 2,Slot 3,Back', JSON.stringify({ t0, t1 }));
  check('an empty slot goes straight to Easy / Normal / Hard (Normal preselected)', t2.mode === 'difficulty' && t2.idx === 1 && t2.rows.join() === 'Easy,Normal,Hard,Back', JSON.stringify(t2));
  check('Hard in slot 2: the intro card over the map, then the map; only slot 2 written', t3.screen === 'campaign' && t3.story === 'THE VERDANT REACH' && /last knight/.test(intro.lines) && intro.diff === 'hard' && intro.slot2 && !intro.slot1 && t4.screen === 'campaign' && !t4.story && t4.slot === 2, JSON.stringify({ t3, t4, intro }));

  // ---- difficulty and NG+ in battle and on the clock
  await freeze(page);
  const diff = await page.evaluate(() => {
    const c = GAME.camp, w = GAME.war, n = c.territories[1].nodes.find((m) => m.type === 'village');
    GAME.attackNode(n);
    const hard = { foeDmg: GAME.army.foeDmg, foeHp: GAME.army.foeHp, clock: w.clockInterval() };
    const e = GAME.enemies.find((x) => x.team === 'enemy');
    GAME.enterCampaign(); GAME.war.tick = () => {};
    w.difficulty = 'easy'; GAME.attackNode(n);
    const easy = { foeDmg: GAME.army.foeDmg, clock: GAME.war.clockInterval() };
    GAME.enterCampaign(); GAME.war.tick = () => {};
    GAME.battleFrom = 'sandbox'; GAME.startBattle(villageSpec()); const sandbox = GAME.army.foeDmg;
    GAME.enterCampaign(); GAME.war.tick = () => {};
    return { hard, easy, sandbox, diff: GAME.war.difficulty };
  });
  check('Hard: Dominion damage x1.3 in your battles, war clock 110 s; Easy x0.7, 240 s; the debug list fights at x1', diff.hard.foeDmg === 1.3 && diff.hard.foeHp === 1 && diff.hard.clock === 110 && diff.easy.foeDmg === 0.7 && diff.easy.clock === 240 && diff.sandbox === 1 && diff.diff === 'hard', JSON.stringify(diff));

  // ---- the scripted fast run: everything but the warlord's seat, then the seat live
  const run = await page.evaluate(() => {
    const c = GAME.camp, w = GAME.war, p = GAME.player;
    p.gold = 0;
    for (const n of c.nodes) if (n.owner === 'enemy' && !(n.type === 'castle' && n.territory === WAR.capitalTerritory)) { c.capture(n); w.onCapture(n); }
    w.recruit(w.general('lord-1'));
    GAME.syncWar(); GAME.save();
    return { held: c.territoriesHeld('player'), sp: p.skillPoints };
  });
  await wait(300);
  const lines = await page.evaluate(() => ({ flags: GAME.storyFlags.slice().sort().join(), line: GAME.storyLine && GAME.storyLine.text }));
  await page.screenshot({ path: OUT + '/p12-story-line.png' });
  check('story lines for the first keep, castle and general (portrait line, not a blocking card)', lines.flags === 'castle,general,keep' && !!lines.line, JSON.stringify(lines));
  const fight = await page.evaluate(() => {
    const c = GAME.camp, seat = c.castleOf(WAR.capitalTerritory);
    GAME.attackNode(seat); GAME.god = true;
    const b = GAME.battle;
    GAME.simulate(2);
    for (let k = 0; k < 60 && GAME.comboCount < 3; k++) GAME.registerHit();
    b.lord.applyDamage(GAME, 1e8, 0, 0, 0, 0);
    b.throne.damage(GAME, 1e9); GAME.simulate(0.5);
    return { result: b.result, warlord: b.spec.warlord };
  });
  await wait(900); await key(page, 'Enter'); await wait(300);
  const end = await state(page);
  await page.screenshot({ path: OUT + '/p12-ending.png' });
  await key(page, 'Enter'); await wait(200);
  const vic = await page.evaluate(() => ({ screen: GAME.screen, rows: GAME.victoryRows(), ng: GAME.war.ng }));
  await page.screenshot({ path: OUT + '/p12-victory.png' });
  const vr = Object.fromEntries(vic.rows);
  check('DONE: start -> warlord -> ending card -> victory screen', fight.result === 'win' && fight.warlord && end.screen === 'campaign' && end.story === 'THE WARLORD FALLS' && vic.screen === 'victory', JSON.stringify({ fight, end, screen: vic.screen }));
  check('victory screen lists every PLAN 13 tally', vic.rows.length === 9 && vr['Battles won / lost'] === '1 / 0' && +vr['Nodes captured'] === 64 - 2 && vr['Generals recruited / defected / rescued'] === '1 / 0 / 0' && +vr['Gold earned'] > 0 && vr['Difficulty'] === 'Hard' && vr['New Game+ cycle'] === 'first campaign' && +vr['Highest combo'] >= 3 && /^\d+:\d\d:\d\d$/.test(vr['Total time']), JSON.stringify(vic.rows));

  // ---- New Game+
  const before = await page.evaluate(() => { const p = GAME.player; p.upgrades.might = 3; p.ownedWeapons.push('w3'); p.inv.core = 4; p.talents.dash = true; GAME.save(); return { up: p.upgrades.might, sp: p.skillPoints, w: p.ownedWeapons.join(), core: p.inv.core }; });
  await key(page, 'Enter'); await wait(300);
  const ng = await page.evaluate(() => {
    const p = GAME.player, c = GAME.camp, w = GAME.war;
    return { screen: GAME.screen, story: GAME.story && GAME.story.title, ng: w.ng, gold: p.gold, up: p.upgrades.might, sp: p.skillPoints, w: p.ownedWeapons.join(), core: p.inv.core, dash: !!p.talents.dash,
      held: c.territoriesHeld('player'), generals: w.generals.every((g) => g.status === 'lord'), clock: w.clockInterval(), diff: w.difficulty, stats: w.stats.won + w.stats.captured, mult: w.ngMult() };
  });
  await page.screenshot({ path: OUT + '/p12-ngplus.png' });
  await key(page, 'Enter');
  check('DONE: New Game+ keeps upgrades, talents, gear, materials, SP; resets land, generals, gold, tallies', ng.screen === 'campaign' && ng.story === 'NEW GAME+ 1' && ng.ng === 1 && ng.gold === 0 && ng.up === before.up && ng.sp === before.sp && ng.w === before.w && ng.core === before.core && ng.dash && ng.held === 1 && ng.generals && ng.stats === 0 && ng.diff === 'hard', JSON.stringify({ before, ng }));
  await freeze(page);
  const ngb = await page.evaluate(() => {
    const c = GAME.camp, w = GAME.war, n = c.territories[1].nodes.find((m) => m.type === 'village');
    const simE = w.mult('enemy', null);
    GAME.attackNode(n);
    const r = { foeHp: GAME.army.foeHp, foeDmg: +GAME.army.foeDmg.toFixed(3), clock: +w.clockInterval().toFixed(2), simE: +simE.toFixed(3) };
    const a = GAME.army; for (let i = 0; i < a.cap; i++) if (a.alive[i] && a.team[i] === 1 && a.type[i] === 0) { r.swordHp = a.maxHp[i]; break; }
    GAME.enterCampaign(); GAME.war.tick = () => {};
    return r;
  });
  check('NG+1: Dominion HP x1.5, damage x1.5 (x1.3 Hard = x1.95), sim strength x1.5, war clock x0.8 (110 -> 88 s)', ngb.foeHp === 1.5 && ngb.foeDmg === 1.95 && ngb.clock === 88 && Math.abs(ngb.simE - 0.8 * 1.5) < 1e-9, JSON.stringify(ngb));

  // ---- slots isolated, Continue = newest, reload round trip
  const s2 = await page.evaluate(() => { const c = GAME.camp, w = GAME.war; const v = c.territories[1].nodes.find((m) => m.type === 'village'); c.capture(v); w.onCapture(v); GAME.player.gold = 777; GAME.save(); return { camp: JSON.stringify(c.save()), gold: GAME.player.gold }; });
  await page.evaluate(() => { GAME.screen = 'title'; GAME.titleMode = 'root'; GAME.titleIndex = 0; });
  await wait(100);
  await key(page, 'ArrowDown'); await key(page, 'Enter');            // Play
  const ps = await state(page);
  await page.screenshot({ path: OUT + '/p12-slots.png' });
  await key(page, 'ArrowDown'); await key(page, 'Enter'); await key(page, 'Enter');  // the picker opens on slot 2: down to slot 3 -> Normal (preselected)
  await wait(200); await key(page, 'Enter');
  const s3 = await page.evaluate(() => { GAME.war.tick = () => {}; GAME.player.gold = 5; GAME.save(); return { slot: GAME.slot, diff: GAME.war.difficulty, ng: GAME.war.ng, gold: GAME.player.gold, up: GAME.player.upgrades.might }; });
  const iso = await page.evaluate(() => { const j = (n) => JSON.parse(localStorage.getItem('aerial-conquest-slot' + n) || 'null'); const a = j(2), b = j(3); return { s2gold: a.gold, s2ng: a.ng, s3gold: b.gold, s3ng: b.ng, s3up: b.upgrades.might, s1: j(1), af: localStorage.getItem('aerial-finisher-save-v2') }; });
  check('slot picker shows the used slot\'s summary; a second game in slot 3 starts clean', ps.mode === 'slots' && ps.idx === 1 && s3.slot === 3 && s3.diff === 'normal' && s3.ng === 0 && s3.up === 0, JSON.stringify({ ps, s3 }));
  check('DONE: slots isolated: slot 2 (NG+1, 777 g) untouched by slot 3 (5 g); slot 1 empty; Aerial Finisher\'s save untouched', iso.s2gold === 777 && iso.s2ng === 1 && iso.s3gold === 5 && iso.s3ng === 0 && iso.s3up === 0 && iso.s1 === null && iso.af === '{"keep":"me"}', JSON.stringify(iso));

  await page.reload(); await wait(700);
  const rl = await state(page);
  await key(page, 'Enter'); await wait(300);   // Continue -> the newest (slot 3)
  const c3 = await page.evaluate(() => ({ slot: GAME.slot, gold: GAME.player.gold }));
  // back to slot 2 through the picker
  await page.evaluate(() => { GAME.screen = 'title'; GAME.titleMode = 'root'; GAME.titleIndex = 1; }); await wait(80);
  await key(page, 'Enter'); await key(page, 'ArrowUp'); await key(page, 'Enter');
  const sm = await state(page);
  await key(page, 'Enter'); await wait(300);
  const c2 = await page.evaluate(() => ({ slot: GAME.slot, gold: GAME.player.gold, camp: JSON.stringify(GAME.camp.save()), ng: GAME.war.ng, diff: GAME.war.difficulty, up: GAME.player.upgrades.might, story: GAME.storyFlags.length }));
  check('reload: Continue opens the newest slot (3)', rl.rows[0] === 'Continue' && c3.slot === 3 && c3.gold === 5, JSON.stringify({ rl, c3 }));
  check('DONE: slot 2 round-trips through a reload: land, gold, NG+, difficulty, upgrades, story', sm.mode === 'slot' && sm.rows.join() === 'Continue,New Game,Back' && c2.slot === 2 && c2.gold === 777 && c2.camp === s2.camp && c2.ng === 1 && c2.diff === 'hard' && c2.up === 3 && c2.story === 3, JSON.stringify({ sm, c2 }));

  // ---- Options: difficulty for the current slot
  await page.evaluate(() => { GAME.screen = 'title'; GAME.titleMode = 'options'; GAME.optionIndex = 2; }); await wait(80);
  await key(page, 'ArrowLeft');
  const od = await page.evaluate(() => ({ s2: JSON.parse(localStorage.getItem('aerial-conquest-slot2')).difficulty, s3: JSON.parse(localStorage.getItem('aerial-conquest-slot3')).difficulty, rows: GAME.titleRows().join() }));
  await page.screenshot({ path: OUT + '/p12-options.png' });
  check('Options: Difficulty changes the current slot only (Hard -> Normal in slot 2)', od.s2 === 'normal' && od.s3 === 'normal' && od.rows === 'Music volume,Sound volume,Difficulty,Hero,Blade,Back', JSON.stringify(od));
  await key(page, 'Escape');

  // ---- New Game over a used slot asks for a difficulty and wipes only it
  await page.evaluate(() => { GAME.titleMode = 'slots'; GAME.titleIndex = 1; }); await wait(60);
  await key(page, 'Enter'); await key(page, 'ArrowDown'); await key(page, 'Enter');   // slot 2 -> New Game
  const ow = await state(page);
  await key(page, 'ArrowUp'); await key(page, 'Enter'); await wait(200);              // Easy
  const owr = await page.evaluate(() => { const j = JSON.parse(localStorage.getItem('aerial-conquest-slot2')); return { ng: j.ng, gold: j.gold, diff: j.difficulty, up: j.upgrades.might, s3: JSON.parse(localStorage.getItem('aerial-conquest-slot3')).gold }; });
  check('New Game on a used slot: difficulty picker, then a fresh slot 2 (Easy); slot 3 untouched', ow.mode === 'difficulty' && owr.ng === 0 && owr.gold === 0 && owr.diff === 'easy' && owr.up === 0 && owr.s3 === 5, JSON.stringify({ ow, owr }));

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
  const b = await geom(page);
  const tapRow = async (i) => { const r = await page.evaluate((i) => GAME.titleRowAt(i), i); const s = toPage(b, r.x + r.w / 2, r.y + r.h / 2); await page.touchscreen.tap(s.x, s.y); await wait(250); };
  await tapRow(0);                 // Play
  const a = await state(page);
  await page.screenshot({ path: OUT + '/p12-phone-slots.png' });
  await tapRow(0);                 // Slot 1
  await tapRow(1);                 // Normal
  const c = await state(page);
  let s = toPage(b, 480, 300); await page.touchscreen.tap(s.x, s.y); await wait(250);
  const d = await state(page);
  check('phone: tap Play -> Slot 1 -> Normal -> intro card -> tap -> map', a.mode === 'slots' && c.screen === 'campaign' && c.story === 'THE VERDANT REACH' && d.screen === 'campaign' && !d.story && d.slot === 1, JSON.stringify({ a, c, d }));
  // victory screen buttons by tap
  await page.evaluate(() => { GAME.war.tick = () => {}; GAME.enterVictory(); }); await wait(150);
  await page.screenshot({ path: OUT + '/p12-phone-victory.png' });
  const vb = await page.evaluate(() => ({ x: VICTORY_BTN.x0 + VICTORY_BTN.w + VICTORY_BTN.gap + VICTORY_BTN.w / 2, y: VICTORY_BTN.y + VICTORY_BTN.h / 2 }));
  s = toPage(b, vb.x, vb.y); await page.touchscreen.tap(s.x, s.y); await wait(250);
  const t = await state(page);
  check('phone: victory screen, tap Title -> the title', t.screen === 'title' && t.mode === 'root', JSON.stringify(t));
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
