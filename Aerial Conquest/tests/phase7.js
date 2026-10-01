// PLAN v2 Phase 7 (war state & economy) checks: headless Chromium, desktop + emulated iPhone 13.
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
/** Run map time forward (the economy ticks as it does on the map: 1/60 s steps). */
const mapTime = (page, s) => page.evaluate((s) => { for (let k = 0; k < Math.round(s * 60); k++) GAME.war.tick(1 / 60, GAME.player); }, s);
/** Attack a node through the real flow and win it (results -> back to the map). */
async function takeNode(page, name) {
  await page.evaluate((name) => { const n = GAME.camp.nodes.find((x) => x.name === name); GAME.attackNode(n); GAME.god = true; }, name);
  await page.evaluate(() => GAME.finishBattle('win'));
  await wait(750); await page.keyboard.press('Enter'); await wait(250);
}
const btn = (page, label) => page.evaluate((label) => { const bs = GAME.mapButtons(), i = bs.findIndex((b) => b.label.startsWith(label)); if (i < 0) return null; const a = GAME.mapButtonAt(i, bs.length); return { x: a.x + (a.w || MAP_BTN.w) / 2, y: a.y + MAP_BTN.h / 2, enabled: bs[i].enabled, label: bs[i].label }; }, label);

async function desktop(browser) {
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 } });
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(String(e)));
  page.on('console', (m) => { if (m.type() === 'error' && !ignorable(m.text())) errors.push(m.text()); });
  await page.goto(URL); await page.evaluate(() => localStorage.clear()); await page.reload(); await wait(700);
  await page.keyboard.press('Enter'); await wait(400);
  await page.evaluate(() => { GAME.war.tickAI = () => {}; WAR.reinforceChance = 0; });   // the Dominion's AI (Phase 9) is off in this suite
  const b = await geom(page);

  const s0 = await page.evaluate(() => ({ gold: GAME.player.gold, gar: troopTotal(GAME.war.garrison[0]), wb: troopTotal(GAME.war.warband), cap: GAME.warbandCap() }));
  check('start: treasury 0, the Last Camp garrisons 24, warband 12 / 12', s0.gold === 0 && s0.gar === 24 && s0.wb === 12 && s0.cap === 12, JSON.stringify(s0));

  // ---- DONE 1: capture a village
  await takeNode(page, 'Fennick');
  const v = await page.evaluate(() => { const n = GAME.camp.nodes.find((x) => x.name === 'Fennick'); return { id: n.id, owner: n.owner, level: n.level, income: GAME.war.income(n), stock: GAME.war.stock[n.id], next: GAME.war.convoyT[n.id] }; });
  check('DONE: capture a village (Fennick) -> yours, level 1, earning 20 gold/min into its store', v.owner === 'player' && v.level === 1 && v.income === 20 && v.stock < 0.5 && v.next > 59, JSON.stringify(v));

  // ---- DONE 2: its convoy delivers gold (in one synchronous run: the live map can't move gold underneath)
  const flow = await page.evaluate((id) => {
    const w = GAME.war, p = GAME.player, T = 1 / 60;
    const ember = GAME.camp.nodes.find((x) => x.name === 'Emberfield').id;
    w.convoys = []; w.convoyT[ember] = 1e9;            // only Fennick's convoy in this test
    w.garrison[0] = w.recruitList(40, 0);              // castle full: no recruiting to spend gold
    w.stock[id] = 0; w.convoyT[id] = 60;
    for (let k = 0; k < 30 * 60; k++) w.tick(T, p);
    const half = +w.stock[id].toFixed(2);
    for (let k = 0; k < 30 * 60 + 2; k++) w.tick(T, p);
    const c = w.convoys.find((x) => x.team === 'player' && x.path[0] === id);
    const sent = c ? { cargo: c.cargo, to: GAME.camp.nodes[c.path[c.path.length - 1]].name, legs: c.path.length - 1, stock: +w.stock[id].toFixed(2) } : null;
    const g0 = p.gold, d0 = w.delivered; let t = 0;
    while (w.convoys.some((x) => x.team === 'player') && t < 120) { w.tick(T, p); t += T; }
    return { half, sent, g0, gold: p.gold, delivered: w.delivered - d0, trip: +t.toFixed(1) };
  }, v.id);
  const half = { stock: flow.half }, sent = flow.sent, arrived = { gold: flow.gold, delivered: flow.delivered, trip: flow.trip }, g0 = flow.g0, gMid = 0;
  check('village store: 30 s -> 10 gold; at 60 s its convoy leaves with the 20 gold for your nearest castle',
    Math.abs(half.stock - 10) < 0.2 && sent && sent.cargo === 20 && sent.to === 'The Last Camp' && sent.stock < 1, JSON.stringify({ half, sent }));
  await page.screenshot({ path: OUT + '/p7-convoy-on-road.png' });
  check('DONE: the convoy rides the road to the castle and its gold enters the treasury', arrived.delivered === 20 && arrived.gold === g0 + 20 && arrived.trip > 5, JSON.stringify({ g0, arrived }));

  // ---- DONE 3: the castle produces troops (paying gold), to its cap; nothing without gold; a ram every 30
  const prod = await page.evaluate(() => {
    const w = GAME.war, p = GAME.player, n = GAME.camp.nodes[0];
    const r = {};
    w.convoys = []; for (const x of GAME.camp.nodes) if (x.type === 'village') w.convoyT[x.id] = 1e9;   // no deliveries in this test
    p.gold = 0; w.garrison[0] = w.recruitList(10, 0); w.prod[0] = 0;
    for (let k = 0; k < 60 * 60; k++) w.tick(1 / 60, p);
    r.noGold = troopTotal(w.garrison[0]);
    p.gold = 1000; const before = troopTotal(w.garrison[0]), gold0 = p.gold, mix0 = { ...w.garrison[0] };
    for (let k = 0; k < 60 * 60; k++) w.tick(1 / 60, p);
    const g = w.garrison[0]; r.perMin = troopTotal(g) - before;
    let cost = 0; for (const k of UNIT_ORDER) cost += (g[k] - mix0[k]) * WAR.troopCost[k];
    r.spent = gold0 - p.gold; r.cost = cost;
    w.sinceRam[0] = 29; const rams = g.ram;
    for (let k = 0; k < 20 * 60; k++) w.tick(1 / 60, p);
    r.ram = g.ram - rams;
    for (let k = 0; k < 600 * 60; k++) w.tick(1 / 60, p);
    r.full = troopTotal(g); r.cap = w.cap(n);
    const m = troopTotal(g) - g.ram; r.mix = ['sword', 'spear', 'archer', 'shield'].map((k) => +(g[k] / m).toFixed(2));
    return r;
  });
  check('DONE: the castle recruits 6 troops/min (L1), paying each one\'s cost; with no gold it waits',
    prod.noGold === 10 && prod.perMin === 6 && prod.spent === prod.cost, JSON.stringify(prod));
  check('a ram after 30 troops; the garrison stops at its cap (40); the default mix is 40/20/25/15',
    prod.ram === 1 && prod.full === prod.cap && prod.cap === 40 && Math.abs(prod.mix[0] - 0.4) < 0.06 && Math.abs(prod.mix[3] - 0.15) < 0.06, JSON.stringify(prod));

  // the castle panel: mix cycles, numbers shown
  await page.evaluate(() => { GAME.mapSel = 0; GAME.mapConvoy = -1; });
  let m = await btn(page, 'Mix');
  let q = toPage(b, m.x, m.y); await page.mouse.click(q.x, q.y); await wait(150);
  const mix1 = await page.evaluate(() => GAME.war.mix[0]);
  check('castle panel: Mix cycles the recruit mix (Balanced -> Infantry)', m.label === 'Mix: Balanced' && mix1 === 1, JSON.stringify({ m, mix1 }));
  await page.evaluate(() => { GAME.war.mix[0] = 0; });

  // ---- DONE 4: upgrades work (PLAN 5.2 costs x tier)
  await page.evaluate(() => { GAME.player.gold = 120; GAME.mapSel = GAME.camp.nodes.find((x) => x.name === 'Fennick').id; });
  m = await btn(page, 'Upgrade');
  q = toPage(b, m.x, m.y); await page.mouse.click(q.x, q.y); await wait(150);
  const poor = await page.evaluate(() => ({ level: GAME.camp.nodes.find((x) => x.name === 'Fennick').level, toast: GAME.toastMsg, gold: GAME.player.gold }));
  check('upgrade without the gold: refused, says what it needs', !m.enabled && /150/.test(m.label) && poor.level === 1 && poor.gold === 120 && /NEED 150/.test(poor.toast), JSON.stringify({ m, poor }));
  await page.evaluate(() => { GAME.player.gold = 1000; });
  q = toPage(b, m.x, m.y); await page.mouse.click(q.x, q.y); await wait(150);
  const up = await page.evaluate(() => { const n = GAME.camp.nodes.find((x) => x.name === 'Fennick'); return { level: n.level, gold: GAME.player.gold, income: GAME.war.income(n), saved: JSON.parse(localStorage.getItem('aerial-conquest-slot1')).war[n.id] }; });
  check('DONE: upgrade works: Fennick to L2 for 150 gold, income 20 -> 35/min, saved', up.level === 2 && up.gold === 850 && up.income === 35 && up.saved[1] === 2, JSON.stringify(up));
  const costs = await page.evaluate(() => {
    const w = GAME.war, c = GAME.camp, s = c.save(), out = {};
    const t2 = c.nodes.find((n) => n.type === 'castle' && c.territories[n.territory].tier === 2);
    t2.level = 1; out.castleT2 = w.upgradeCost(t2);              // 300 x 1.5
    const k5 = c.nodes.find((n) => n.type === 'keep' && c.territories[n.territory].tier === 5);
    k5.level = 2; out.keepT5L3 = w.upgradeCost(k5);              // 700 x 4
    out.outpost = w.upgradeCost(c.nodes.find((n) => n.type === 'outpost'));
    c.load(s); return out;
  });
  check('upgrade costs: PLAN 5.2 x the tier multiplier (castle tier 2: 450, keep tier 5 to L3: 2800); outposts don\'t level', costs.castleT2 === 450 && costs.keepT5L3 === 2800 && costs.outpost === 0, JSON.stringify(costs));
  const cast = await page.evaluate(() => {
    const w = GAME.war, p = GAME.player, n = GAME.camp.nodes[0]; p.gold = 2000;
    const r = { cap1: w.cap(n), prod1: w.production(n), wb1: GAME.warbandCap() };
    w.upgrade(n, p); r.cap2 = w.cap(n); r.prod2 = w.production(n);
    w.upgrade(n, p); r.level = n.level; r.wb3 = GAME.warbandCap(); r.gold = p.gold; r.max = w.upgradeCost(n);
    return r;
  });
  check('castle upgrades: L2 cap 80 / 10 per min; L3 adds +3 warband cap; 300 + 800 gold; no L4',
    cast.cap1 === 40 && cast.cap2 === 80 && cast.prod2 === 10 && cast.level === 3 && cast.wb1 === 12 && cast.wb3 === 15 && cast.gold === 900 && cast.max === 0, JSON.stringify(cast));

  // ---- the warband: fights from the war state, comes home as survivors, lost on a defeat, refills from the garrison
  const wbFight = await page.evaluate(() => {
    const w = GAME.war; w.garrison[0] = w.recruitList(40, 0); w.refillWarband();
    const n = GAME.camp.nodes.find((x) => x.name === 'Ashby'); GAME.attackNode(n); GAME.god = true;
    const live = GAME.army.live('player') + GAME.army.reserveCount('player');
    // lose four of them, then win
    let k = 0; for (let i = 0; i < GAME.army.cap && k < 4; i++) if (GAME.army.alive[i] && GAME.army.team[i] === TEAM_PLAYER) { GAME.army.hurt(GAME, i, 1e7, 0, 0, false); k++; }
    GAME.finishBattle('win');
    return { live, cap: GAME.warbandCap(), home: troopTotal(w.warband), note: GAME.battle.notes.join(' | ') };
  });
  await wait(700); await page.keyboard.press('Enter'); await wait(250);
  const refill = await page.evaluate(() => ({ wb: troopTotal(GAME.war.warband), gar: troopTotal(GAME.war.garrison[0]) }));
  check('warband: the battle fields exactly your warband; survivors come home; back on the map it refills from the garrison',
    wbFight.live === wbFight.cap && wbFight.home === wbFight.cap - 4 && /warband home/.test(wbFight.note) && refill.wb === wbFight.cap && refill.gar < 40, JSON.stringify({ wbFight, refill }));
  const lose = await page.evaluate(() => {
    const w = GAME.war; w.garrison[0] = emptyReserve();
    const n = GAME.camp.nodes.find((x) => x.name === 'Oakhurst'); GAME.attackNode(n);
    GAME.finishBattle('lose');
    return { wb: troopTotal(w.warband), note: GAME.battle.notes.join(' | ') };
  });
  await wait(700); await page.keyboard.press('Enter'); await wait(250);
  const after = await page.evaluate(() => ({ wb: troopTotal(GAME.war.warband) }));
  check('a defeat loses the warband; with an empty garrison it stays empty', lose.wb === 0 && /lost/.test(lose.note) && after.wb === 0, JSON.stringify({ lose, after }));

  // ---- DONE 5: garrison thinning math, through real captures (PLAN 5.1)
  await page.evaluate(() => { const w = GAME.war; w.garrison[0] = w.recruitList(40, 0); w.refillWarband(); });
  const castleId = await page.evaluate(() => GAME.camp.castleOf(1).id);
  const show = () => page.evaluate((id) => { const n = GAME.camp.nodes[id], s = GAME.camp.battleSpec(n); return { def: GAME.camp.garrison(n), spec: Object.values(s.foes).reduce((a, x) => a + x, 0), iron: !!s.ironGate, tier: s.tier }; }, castleId);
  // Fennick and Ashby are already yours (taken above)
  const th = [await show()];
  await takeNode(page, 'Millbrook Watch'); th.push(await show());
  await takeNode(page, 'Millbrook Keep'); th.push(await show());
  check('DONE: thinning through real captures (Millbrook Castle, L1 40, keep +50%): Fennick + Ashby held 42; + the watch 33; + the keep (no more +50%) 22; the battle fields that many',
    th[0].def === 42 && th[1].def === 33 && th[2].def === 22 && th.every((t) => t.spec === t.def), JSON.stringify(th));
  check('...and the outpost\'s +1 tier and the keep\'s iron gate go with them', th[0].tier === 2 && th[1].tier === 1 && th[1].iron && !th[2].iron, JSON.stringify(th));
  const cap60 = await page.evaluate(() => {
    const c = GAME.camp, s = c.save(), t = c.territories.find((x) => x.nodes.filter((n) => n.type === 'village').length === 3), cs = c.castleOf(t.id);
    for (const n of t.nodes) if (n.type === 'village' || n.type === 'outpost') n.owner = 'player';
    const r = { small: t.nodes.filter((n) => n.owner === 'player').length, def: c.garrison(cs), lvl: cs.level };
    c.load(s); return r;
  });
  check('thinning stops at 60% (4 small nodes held): 40 x 1.5 x 0.4 = 24', cap60.small === 4 && cap60.lvl === 1 && cap60.def === 24, JSON.stringify(cap60));

  // ---- Dominion convoys: ambush one at your frontier and take its cargo
  const amb = await page.evaluate(() => {
    const w = GAME.war, c = GAME.camp;
    w.convoys = w.convoys.filter((x) => x.team === 'player');
    // one on a road at the frontier (Greywatch March), one deep in their land
    const a = c.nodes.find((n) => n.name === 'Greywatch Watch').id, nb = c.links[a][0];
    const far = c.nodes.find((n) => n.name === 'Wren').id, fb = c.links[far][0];
    w.convoys.push({ id: 901, team: 'enemy', path: [a, nb], leg: 0, t: 0.3, cargo: 120 });
    w.convoys.push({ id: 902, team: 'enemy', path: [far, fb], leg: 0, t: 0.3, cargo: 300 });
    return { near: w.canAmbush(w.convoys.find((x) => x.id === 901)), far: w.canAmbush(w.convoys.find((x) => x.id === 902)), mine: w.convoys.filter((x) => x.team === 'player').every((x) => !w.canAmbush(x)) };
  });
  check('ambush: a Dominion convoy at your frontier can be ambushed; one deep in their land can\'t; yours never', amb.near && !amb.far && amb.mine, JSON.stringify(amb));
  // click it -> panel -> Ambush
  await page.evaluate(() => { GAME.mapSel = -1; GAME.mapConvoy = -1; GAME.mapZoomTo = GAME.mapZoom = 1; const q = GAME.war.convoyPos(GAME.war.convoys.find((x) => x.id === 901)); GAME.mapX = q.x; GAME.mapY = q.y; });
  await wait(100);
  const cp = await page.evaluate(() => { const q = GAME.war.convoyPos(GAME.war.convoys.find((x) => x.id === 901)); return GAME.mapToScreen(q.x, q.y); });
  q = toPage(b, cp.x, cp.y - 3); await page.mouse.click(q.x, q.y); await wait(150);
  const selc = await page.evaluate(() => ({ cv: GAME.mapConvoy, btns: GAME.mapButtons().map((x) => x.label + (x.enabled ? '' : '(off)')) }));
  await page.screenshot({ path: OUT + '/p7-ambush-panel.png' });
  m = await btn(page, 'Ambush');
  q = toPage(b, m.x, m.y); await page.mouse.click(q.x, q.y); await wait(300);
  const ab = await page.evaluate(() => ({ screen: GAME.screen, kind: GAME.battle.spec.kind, cargo: GAME.battle.cargo, convoy: GAME.battle.spec.convoyId }));
  check('click the convoy -> its panel -> Ambush -> a convoy battle carrying its 120 gold', selc.cv === 901 && selc.btns[0] === 'Ambush' && ab.screen === 'battle' && ab.kind === 'convoy' && ab.cargo === 120 && ab.convoy === 901, JSON.stringify({ selc, ab }));
  const gold0 = await page.evaluate(() => GAME.player.gold);
  await page.evaluate(() => { GAME.god = true; for (const w of GAME.battle.wagons) w.damage(GAME, 1e9); GAME.simulate(0.5); });
  await wait(800); await page.keyboard.press('Enter'); await wait(250);
  const got = await page.evaluate(() => ({ gold: GAME.player.gold, gone: !GAME.war.convoys.some((x) => x.id === 901), spoils: GAME.battle.spoils.gold, banner: GAME.bannerMsg }));
  check('win the ambush -> the cargo is in the spoils (and the treasury); the convoy is gone from the map', got.gone && got.spoils >= 120 && got.gold === gold0 + got.spoils && /CONVOY/.test(got.banner), JSON.stringify({ gold0, got }));

  // ---- the war survives a reload (stores, garrisons, convoys on the road, warband, levels)
  const before = await page.evaluate(() => {
    const w = GAME.war;
    w.convoys.push({ id: 950, team: 'player', path: [1, 0], leg: 0, t: 0.5, cargo: 77 });
    GAME.save();
    return { stock: w.stock.map((x) => Math.round(x)).join(','), gar: troopTotal(w.garrison[0]), wb: troopTotal(w.warband), convoys: w.convoys.length, gold: GAME.player.gold, lvl: GAME.camp.nodes[0].level };
  });
  await page.reload(); await wait(600); await page.keyboard.press('Enter'); await wait(400); await page.evaluate(() => { GAME.war.tickAI = () => {}; WAR.reinforceChance = 0; });
  await page.evaluate(() => { GAME.war.tickAI = () => {}; WAR.reinforceChance = 0; });   // the Dominion's AI (Phase 9) is off in this suite
  const after2 = await page.evaluate(() => { const w = GAME.war; return { stock: w.stock.map((x) => Math.round(x)).join(','), gar: troopTotal(w.garrison[0]), wb: troopTotal(w.warband), convoys: w.convoys.length, gold: GAME.player.gold, lvl: GAME.camp.nodes[0].level, c950: !!w.convoys.find((c) => c.cargo === 77) }; });
  const near = (a, b) => a.split(',').every((x, i) => Math.abs(+x - +b.split(',')[i]) <= 1);
  check('save/reload: village stores, garrisons, convoys on the road, warband, node levels and gold all come back',
    near(after2.stock, before.stock) && after2.gar >= before.gar && after2.gar <= before.gar + 1 && after2.wb === before.wb && after2.c950 && Math.abs(after2.gold - before.gold) <= 10 && after2.lvl === before.lvl, JSON.stringify({ before, after2 }));
  const bad = await page.evaluate(() => { const s = JSON.parse(localStorage.getItem('aerial-conquest-slot1')); s.econ = { stock: 'x', garrison: [1, 2], convoys: [[1, [0, 63], 0, 0, 5], [0, [999, 1], 0, 0, 5]], warband: [1, 2] }; localStorage.setItem('aerial-conquest-slot1', JSON.stringify(s)); GAME.enterCampaign(); return { convoys: GAME.war.convoys.length, gar: troopTotal(GAME.war.garrison[0]) }; });
  check('a mangled economy save is dropped piece by piece (bad convoys skipped), not fatal', bad.convoys === 0 && bad.gar >= 0, JSON.stringify(bad));
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
  let s = toPage(b, 480, 278); await page.touchscreen.tap(s.x, s.y); await wait(600);
  await page.evaluate(() => { GAME.war.tickAI = () => {}; WAR.reinforceChance = 0; });
  await page.evaluate(() => { GAME.player.gold = 400; GAME.mapSel = -1; });
  const cp = await page.evaluate(() => { const n = GAME.camp.nodes[0]; return GAME.mapToScreen(n.x, n.y); });
  s = toPage(b, cp.x, cp.y); await page.touchscreen.tap(s.x, s.y); await wait(250);
  const m = await btn(page, 'Upgrade');
  s = toPage(b, m.x, m.y); await page.touchscreen.tap(s.x, s.y); await wait(250);
  const r = await page.evaluate(() => ({ sel: GAME.mapSel, level: GAME.camp.nodes[0].level, gold: GAME.player.gold }));
  await page.screenshot({ path: OUT + '/p7-phone-castle.png' });
  check('phone: tap your castle -> panel -> tap Upgrade -> level 2, 300 gold paid', r.sel === 0 && r.level === 2 && r.gold === 100, JSON.stringify(r));
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
