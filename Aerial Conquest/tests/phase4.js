// PLAN v2 Phase 4 (battle framework + Field battle + Village raid) checks: headless Chromium, desktop + emulated iPhone 13.
const { chromium, devices } = require('playwright');
const path = require('path');
const URL = 'file://' + path.resolve(process.argv[2]);
const OUT = process.argv[3];
const results = [];
const check = (name, ok, info = '') => { results.push({ name, ok, info }); console.log((ok ? 'PASS ' : 'FAIL ') + name + (info ? '  — ' + info : '')); };
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const ignorable = (t) => /fonts\.(googleapis|gstatic)|ERR_|net::/.test(t);
const state = (page) => page.evaluate(() => ({ screen: GAME.screen, kind: GAME.battle.spec.kind, result: GAME.battle.result }));

/** From the campaign stub, start row i. */
async function start(page, i) {
  // a row index, or a label prefix (the list grows: Phase 11 added the warlord)
  await page.evaluate((i) => { GAME.enterSandbox(); GAME.campIndex = typeof i === 'number' ? i : GAME.campaignRows().findIndex((r) => r.label.startsWith(i)); }, i);
  await wait(100);
  await page.keyboard.press('Enter'); await wait(300);
}

/** Back from the results screen to the map. */
async function leaveResults(page) {
  await wait(700);
  await page.keyboard.press('Enter'); await wait(250);
}

/** Kill every Dominion unit, elite and reserve (as if the army fought it down). */
const killAllFoes = (page) => page.evaluate(() => {
  const a = GAME.army; a.reserve[TEAM_ENEMY] = { sword: 0, spear: 0, archer: 0, shield: 0, ram: 0, hound: 0 };
  for (let i = 0; i < a.cap; i++) if (a.alive[i] && a.team[i] === TEAM_ENEMY) a.hurt(GAME, i, 1e6, 0, 0, false);
  for (const e of GAME.enemies) if (e.alive && e.team === 'enemy') e.applyDamage(GAME, 1e6, 0, 0, 0, 0);
});

async function desktop(browser) {
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 } });
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(String(e)));
  page.on('console', (m) => { if (m.type() === 'error' && !ignorable(m.text())) errors.push(m.text()); });
  await page.goto(URL);
  await page.evaluate(() => localStorage.clear());
  await page.reload(); await wait(700);

  // ---- title -> campaign stub
  await page.keyboard.press('Enter'); await wait(300);
  const camp = await page.evaluate(() => ({ screen: GAME.screen, rows: GAME.campaignRows().map((r) => r.label) }));
  check('New game lands on the campaign map; the battle list has every type', camp.screen === 'campaign' && ['Village', 'Outpost', 'Keep', 'Castle', 'Convoy', 'Field', 'Defense', 'Rescue', 'Test field'].every((k) => camp.rows.some((r) => r.startsWith(k))), JSON.stringify(camp));

  // ---- village raid: layout
  await start(page, 0);
  const vl = await page.evaluate(() => ({ st: GAME.screen, kind: GAME.battle.spec.kind, w: GAME.field.w, h: GAME.field.h,
    houses: GAME.battle.structures.filter((s) => s.kind === 'building').length, hp: GAME.battle.structures[0].maxHp,
    knightX: GAME.player.x, warband: GAME.army.live('player'), foes: GAME.foeStrength(), objective: GAME.battle.objective }));
  check('village raid: 2400x1400, 3-5 houses, knight at their edge with the warband', vl.kind === 'village' && vl.w === 2400 && vl.h === 1400 && vl.houses >= 3 && vl.houses <= 5 && vl.knightX < 200 && vl.warband === 12 && vl.foes > 30, JSON.stringify(vl));
  const layoutA = await page.evaluate(() => GAME.battle.structures.map((s) => [Math.round(s.x), Math.round(s.y)]).join(';'));

  // ---- structure damage rules (PLAN 10.1)
  const rules = await page.evaluate(() => {
    TUNING.variance = 0; const cc = TUNING.critChance; TUNING.critChance = 0;
    const p = GAME.player, h = GAME.battle.structures[0];
    const before = h.hp;
    const def = GROUND_COMBO[0];
    p.x = h.x; p.y = h.y + 30; p.facing = -Math.PI / 2;
    GAME.hitStructures(def, p, new Set());
    const knightOnHouse = before - h.hp;
    const base = physDamage(def.power * TUNING.playerDamageMult * p.weapon.powerMult, p.stats.str, 0).dmg;
    const gate = new Structure('gate', 'enemy', h.x, h.y, 80, 30, 9999);
    GAME.battle.structures.push(gate);
    const g0 = gate.hp; GAME.hitStructures(def, p, new Set([h])); const knightOnGate = g0 - gate.hp;
    // Fire: x2 on a house vs the same bolt's base
    const fire = new Projectile({ x: h.x, y: h.y - 20, z: 20, vx: 0, vy: 0, radius: 8, life: 1, color: '#f00', owner: 'player', power: 30 });
    fire.isFire = true;
    const h1 = h.hp; GAME.projectileCollide(fire); const fireOnHouse = h1 - h.hp;
    const fireBase = magicDamage(30, p.stats.mag, 0).dmg;
    // a ram on a gate: x4
    const a = GAME.army; const ri = a.spawn('ram', 'player', gate.x - 40, gate.y, 1); a.atk[ri] = 10;
    const g1 = gate.hp; GAME.unitStrike(a, ri, gate); const ramOnGate = g1 - gate.hp;
    GAME.battle.structures.pop(); a.hurt(GAME, ri, 1e6, 0, 0, false);
    TUNING.variance = 0.08; TUNING.critChance = cc;
    return { base, knightOnHouse, knightOnGate, fireBase, fireOnHouse, ramOnGate };
  });
  check('knight: x1 on a house, x0.3 on a gate', rules.knightOnHouse === rules.base && rules.knightOnGate === Math.round(rules.base * 0.3), JSON.stringify(rules));
  check('Fire: x2 on a house', rules.fireOnHouse === rules.fireBase * 2, `${rules.fireBase} -> ${rules.fireOnHouse}`);
  check('siege ram: x4 on a gate', rules.ramOnGate === 40, `10 -> ${rules.ramOnGate}`);

  // ---- houses are solid
  const solid = await page.evaluate(async () => {
    const p = GAME.player, h = GAME.battle.structures[1];
    p.x = h.x; p.y = h.y + 40;
    await new Promise((r) => setTimeout(r, 50));
    return { hx: h.x, hy: h.y, top: h.y - h.h };
  });
  await page.keyboard.down('KeyW'); await wait(900); await page.keyboard.up('KeyW');
  const inside = await page.evaluate((s) => { const p = GAME.player; return { py: Math.round(p.y), stoppedBelow: p.y >= s.hy - 2 }; }, solid);
  check('houses are solid (the knight cannot walk through one)', inside.stoppedBelow, JSON.stringify({ ...solid, ...inside }));

  // ---- Charge goes for the objective when no unit is in sight; Focus without a lock picks the nearest structure
  const obj = await page.evaluate(async () => {
    GAME.god = true;
    const a = GAME.army, b = GAME.battle;
    for (let i = 0; i < a.cap; i++) if (a.alive[i] && a.team[i] === TEAM_ENEMY) a.hurt(GAME, i, 1e6, 0, 0, false);
    a.reserve[TEAM_ENEMY] = { sword: 0, spear: 0, archer: 0, shield: 0, ram: 0, hound: 0 };
    for (const e of GAME.enemies) if (e.team === 'enemy') e.applyDamage(GAME, 1e6, 0, 0, 0, 0);
    GAME.player.lock = null;
    GAME.issueOrder('focus');
    await new Promise((r) => setTimeout(r, 300));
    const ft = GAME.focusTarget();
    GAME.issueOrder('charge');
    // bring the warband up to the village (it starts ~1100 px away)
    const hx = Math.min(...b.structures.map((h) => h.x));
    for (let i = 0; i < a.cap; i++) if (a.alive[i] && a.team[i] === TEAM_PLAYER) a.x[i] = hx - 220 + (i % 5) * 10;
    const hp0 = b.structures.reduce((s, h) => s + h.hp, 0);
    await new Promise((r) => setTimeout(r, 9000));
    const hp1 = b.structures.reduce((s, h) => s + h.hp, 0);
    let onHouse = 0;
    for (let i = 0; i < a.cap; i++) if (a.alive[i] && a.tgt[i] instanceof Structure) onHouse++;
    return { focusIsStructure: ft instanceof Structure, hp0, hp1, onHouse, result: b.result };
  });
  check('Focus with no lock-on: the nearest hostile structure', obj.focusIsStructure);
  check('Charge with nothing in sight: the warband burns houses', obj.hp1 < obj.hp0 && obj.onHouse > 0, JSON.stringify(obj));

  // ---- DONE-WHEN: village raid winnable — burn every house
  await page.evaluate(() => { for (const s of GAME.battle.structures) if (s.alive) s.damage(GAME, 1e6); });
  await wait(300);
  const vw = await page.evaluate(() => ({ result: GAME.battle.result, spoils: GAME.battle.spoils, gold: GAME.player.gold, progress: GAME.battle.progress(GAME) }));
  check('DONE: village raid won by burning every house', vw.result === 'win' && vw.progress === 1 && vw.spoils.gold > 0 && vw.gold === vw.spoils.gold, JSON.stringify(vw));
  await page.screenshot({ path: OUT + '/p4-results-win.png' });
  await leaveResults(page);
  const back = await page.evaluate(() => ({ screen: GAME.screen, gold: GAME.player.gold, saved: JSON.parse(localStorage.getItem('aerial-conquest-slot1')).gold }));
  check('results -> back to the map; spoils saved', back.screen === 'sandbox' && back.gold === vw.gold && back.saved === vw.gold, JSON.stringify(back));

  // the same node lays out the same way
  await start(page, 0);
  const layoutB = await page.evaluate(() => GAME.battle.structures.map((s) => [Math.round(s.x), Math.round(s.y)]).join(';'));
  check('village layout is seeded (same node, same layout)', layoutA === layoutB);

  // ---- DONE-WHEN: village raid losable — the knight falls -> results -> map stub
  await page.evaluate(() => { GAME.god = false; const p = GAME.player; p.secondWindUsed = true; p.iframes = 0; p.takeHit(GAME, 1e6, 0, 0, 0); });
  await wait(2200);
  const vlose = await state(page);
  await page.screenshot({ path: OUT + '/p4-results-lose.png' });
  await leaveResults(page);
  const afterLose = await page.evaluate(() => ({ screen: GAME.screen, alive: GAME.player.alive, hp: GAME.player.hp }));
  check('DONE: village raid lost when the knight falls (results, then the map stub)', vlose.result === 'lose' && afterLose.screen === 'sandbox' && afterLose.alive, JSON.stringify({ vlose, afterLose }));

  // ---- DONE-WHEN: exit edge — walk off your own edge to leave
  await start(page, 0);
  await wait(400);
  await page.keyboard.down('KeyA'); await wait(1400); await page.keyboard.up('KeyA');
  await wait(200);
  const ex = await page.evaluate(() => ({ result: GAME.battle.result, x: Math.round(GAME.player.x), gold: GAME.player.gold }));
  check('DONE: walking into your own edge leaves the battle (withdrawn, no spoils)', ex.result === 'retreat' && ex.gold === vw.gold, JSON.stringify(ex));
  await leaveResults(page);

  // ---- field battle: layout
  await start(page, 5);
  const fl = await page.evaluate(() => ({ kind: GAME.battle.spec.kind, w: GAME.field.w, h: GAME.field.h, leader: !!(GAME.battle.leader && GAME.battle.leader.leader), foes: GAME.foeStrength(), allies: GAME.army.live('player') }));
  check('field battle: 2800x1400 open ground, a Dominion commander, your warband + an allied army', fl.kind === 'field' && fl.w === 2800 && fl.h === 1400 && fl.leader && fl.foes >= 70 && fl.allies === 12 + 26, JSON.stringify(fl));
  await wait(1500);
  await page.screenshot({ path: OUT + '/p4-field.png' });

  // ---- rout: commander alive -> no rout even under 40%; commander down -> rout -> win
  const rout = await page.evaluate(async () => {
    const a = GAME.army, b = GAME.battle; GAME.god = true;
    a.reserve[TEAM_ENEMY] = { sword: 0, spear: 0, archer: 0, shield: 0, ram: 0, hound: 0 };   // Phase 5 reinforcements: out of this test
    const start = b.startFoes;
    let killed = 0;
    for (let i = 0; i < a.cap && GAME.foeStrength() > start * 0.3; i++) if (a.alive[i] && a.team[i] === TEAM_ENEMY) { a.hurt(GAME, i, 1e6, 0, 0, false); killed++; }
    await new Promise((r) => setTimeout(r, 1200));
    const withLeader = { result: b.result, routed: b.routed, strength: GAME.foeStrength(), start };
    b.leader.applyDamage(GAME, 1e6, 0, 0, 0, 0);
    await new Promise((r) => setTimeout(r, 1200));
    return { withLeader, after: { result: b.result, routed: b.routed } };
  });
  check('rout: no rout while the commander lives (even under 40%)', rout.withLeader.result === null && rout.withLeader.routed === null, JSON.stringify(rout.withLeader));
  check('DONE: field battle won by rout once the commander falls', rout.after.result === 'win' && rout.after.routed === 'enemy', JSON.stringify(rout.after));
  await leaveResults(page);

  // ---- field battle won by destroying the army
  await start(page, 5);
  await killAllFoes(page);
  await wait(500);
  const fd = await state(page);
  check('DONE: field battle won by destroying the army', fd.result === 'win', JSON.stringify(fd));
  await leaveResults(page);

  // ---- field battle lost
  await start(page, 5);
  await page.evaluate(() => { GAME.god = false; const p = GAME.player; p.secondWindUsed = true; p.iframes = 0; p.takeHit(GAME, 1e6, 0, 0, 0); });
  await wait(2200);
  const flose = await state(page);
  await leaveResults(page);
  check('DONE: field battle lost when the knight falls', flose.result === 'lose' && (await state(page)).screen === 'sandbox', JSON.stringify(flose));

  // ---- routed units run for their edge and leave without counting as kills
  await start(page, 5);
  const fled = await page.evaluate(async () => {
    const a = GAME.army; GAME.god = true;
    GAME.battle.leader.applyDamage(GAME, 1e6, 0, 0, 0, 0);
    const kills0 = GAME.battle.kills.byArmy + GAME.battle.kills.byKnight;
    GAME.battle.startFoes = 0;   // a forced rout: keep the battle open so the runners can be watched leaving
    a.routSide('enemy');
    await new Promise((r) => setTimeout(r, 10000));   // ~800 px to their edge, after the 1.6 s start freeze
    return { routed: a.routedCount[TEAM_ENEMY], kills: GAME.battle.kills.byArmy + GAME.battle.kills.byKnight - kills0 };
  });
  check('routed Dominion units leave at their edge (counted as routed, not killed)', fled.routed > 20, JSON.stringify(fled));

  // ---- the test field still works from the stub
  await page.evaluate(() => GAME.enterSandbox());
  await start(page, 'Test field');
  const tst = await page.evaluate(() => ({ kind: GAME.battle.spec.kind, foes: GAME.foesAlive() }));
  check('test field still reachable from the stub', tst.kind === 'test' && tst.foes > 0, JSON.stringify(tst));

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
  let s = pt(480, 278); await page.touchscreen.tap(s.x, s.y); await wait(500);
  const camp = await page.evaluate(() => GAME.screen);
  await page.evaluate(() => GAME.enterSandbox()); await wait(200);
  // tap the Field battle row
  const fr = await page.evaluate(() => { const i = GAME.campaignRows().findIndex((r) => r.label.startsWith('Field')), a = GAME.campRowAt(i); return { x: a.x + CAMP_ROW.w / 2, y: a.y + CAMP_ROW.h / 2 }; });
  s = pt(fr.x, fr.y); await page.touchscreen.tap(s.x, s.y); await wait(1200);
  const st = await state(page);
  check('phone: Start -> map; battle list -> tap Field battle', camp === 'campaign' && st.screen === 'battle' && st.kind === 'field', JSON.stringify({ camp, st }));
  await page.screenshot({ path: OUT + '/p4-phone-field.png' });
  await killAllFoes(page);
  await wait(1200);
  s = pt(480, 300); await page.touchscreen.tap(s.x, s.y); await wait(300);
  check('phone: win -> tap the results -> back to the map', (await state(page)).screen === 'sandbox');
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
