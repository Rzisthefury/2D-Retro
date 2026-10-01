// PLAN v2 Phase 9 (the Dominion's campaign AI) checks: headless Chromium, desktop + emulated iPhone 13.
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
const btn = (page, label) => page.evaluate((label) => { const bs = GAME.mapButtons(), i = bs.findIndex((b) => b.label.startsWith(label)); if (i < 0) return null; const a = GAME.mapButtonAt(i, bs.length); return { x: a.x + (a.w || MAP_BTN.w) / 2, y: a.y + MAP_BTN.h / 2, enabled: bs[i].enabled }; }, label);
/** Freeze the live map; tests drive war time. A fresh war each time (difficulty d). */
const fresh = (page, d = 'normal') => page.evaluate((d) => {
  localStorage.removeItem('aerial-conquest-slot1'); GAME.resetSave(); GAME.enterCampaign();
  const w = GAME.war; if (!w._tick) { w._tick = w.tick; w.tick = () => {}; }
  w.difficulty = d; w.reset();
  w.convoys = []; w.enemyConvoyT = 1e9; for (const n of GAME.camp.nodes) w.convoyT[n.id] = 1e9;
}, d);
/** Hold the first k territories (their castles) for you, nearest the start first; returns held. */
const hold = (page, k) => page.evaluate((k) => {
  const c = GAME.camp, N = c.nodes.length, s = c.castleOf(0).id;
  const ts = c.territories.filter((t) => t.id !== WAR.capitalTerritory).sort((a, b) => c.dist[s * N + c.castleOf(a.id).id] - c.dist[s * N + c.castleOf(b.id).id]);
  ts.forEach((t, i) => { c.castleOf(t.id).owner = i < k ? 'player' : 'enemy'; });
  return c.territoriesHeld('player');
}, k);
const run = (page, s, fn) => page.evaluate(([s]) => { const w = GAME.war; for (let k = 0; k < Math.round(s * 60); k++) w._tick.call(w, 1 / 60, GAME.player); }, [s]);

async function desktop(browser) {
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 } });
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(String(e)));
  page.on('console', (m) => { if (m.type() === 'error' && !ignorable(m.text())) errors.push(m.text()); });
  await page.goto(URL); await page.evaluate(() => localStorage.clear()); await page.reload(); await wait(700);
  await page.keyboard.press('Enter'); await wait(400);
  const b = await geom(page);

  // ---- the war clock and the offensive cap, all three difficulties (PLAN 8, PLAN 15 checklist)
  const table = {};
  for (const d of ['easy', 'normal', 'hard']) {
    await fresh(page, d);
    table[d] = {};
    for (const k of [1, 3, 4, 6, 8, 11]) {
      const held = await hold(page, k);
      table[d][held] = await page.evaluate(() => [Math.round(GAME.war.clockInterval() * 10) / 10, GAME.war.offensiveCap()]);
    }
  }
  const T = { easy: 240, normal: 160, hard: 110 }, want = (d, h) => [Math.round(T[d] * Math.max(0.6, 1 - 0.1 * Math.floor(h / 3)) * 10) / 10, Math.min(d === 'hard' ? 4 : 3, 1 + Math.floor(h / 4))];
  const okTable = ['easy', 'normal', 'hard'].every((d) => Object.entries(table[d]).every(([h, v]) => v[0] === want(d, +h)[0] && v[1] === want(d, +h)[1]));
  check('war clock: Easy 240 / Normal 160 / Hard 110 s, 10% shorter per 3 territories held (floor 60%); cap 1 + held/4, max 3 (Hard 4)', okTable && table.normal[1][0] === 160 && table.hard[11][1] === 3 && table.easy[3][0] === 216, JSON.stringify(table));
  const capHard = await page.evaluate(() => { const c = GAME.camp; for (const t of c.territories) c.castleOf(t.id).owner = 'player'; GAME.war.difficulty = 'hard'; const r = [c.territoriesHeld('player'), GAME.war.offensiveCap(), +GAME.war.clockInterval().toFixed(1)]; for (const t of c.territories) c.castleOf(t.id).owner = t.id === 0 ? 'player' : 'enemy'; return r; });
  check('the formulas at all 12 held (Hard): cap 1 + 12/4 = 4 (Hard\'s ceiling); the clock at its 60% floor (66 s)', capHard[0] === 12 && capHard[1] === 4 && capHard[2] === 66, JSON.stringify(capHard));

  // ---- DONE: telegraph 30 s before departure
  await fresh(page);
  const tel = await page.evaluate(() => {
    const w = GAME.war, t = w._tick, out = { clock0: w.clock };
    let k = 0;
    while (!w.musters.length && k < 60 * 400) { t.call(w, 1 / 60, GAME.player); k++; }
    out.musterAt = +(k / 60).toFixed(2);
    const m = w.musters[0]; out.muster = m && { from: GAME.camp.nodes[m.from].name, to: GAME.camp.nodes[m.target].name, size: m.size, t: m.t };
    out.event = w.events.find((e) => e.kind === 'muster') ? true : false;
    // 29.9 s later: still mustering, nobody on the road
    for (let j = 0; j < Math.round(29.9 * 60); j++) t.call(w, 1 / 60, GAME.player);
    out.at299 = { musters: w.musters.length, armies: w.armies.filter((a) => a.team === 'enemy').length };
    for (let j = 0; j < 12; j++) t.call(w, 1 / 60, GAME.player);
    const a = w.armies.find((x) => x.team === 'enemy');
    out.at301 = { musters: w.musters.length, army: a && { offensive: a.offensive, n: troopTotal(a.units), to: GAME.camp.nodes[a.target].name } };
    return out;
  });
  await page.evaluate(() => { GAME.war.events = [{ kind: 'muster', node: GAME.camp.castleOf(1).id, target: 0 }]; GAME.war.tick = GAME.war._tick; });
  await wait(400);
  const ban = await page.evaluate(() => ({ msg: GAME.bannerMsg, sub: GAME.bannerSub }));
  await page.evaluate(() => { GAME.war.tick = () => {}; });
  await page.screenshot({ path: OUT + '/p9-telegraph.png' });
  check('DONE: telegraph: the first muster comes when the clock runs out (160 s, Normal), announced on the map',
    tel.clock0 === 160 && Math.abs(tel.musterAt - 160) < 0.05 && tel.event && /MUSTERS AT/.test(ban.msg) && /30 s/.test(ban.sub), JSON.stringify({ tel, ban }));
  check('DONE: ...and the army departs 30 s later, not before (29.9 s: still mustering; 30.1 s: on the road, an offensive)',
    tel.at299.musters === 1 && tel.at299.armies === 0 && tel.at301.musters === 0 && tel.at301.army && tel.at301.army.offensive && tel.at301.army.n === tel.muster.size, JSON.stringify(tel));

  // ---- DONE: the concurrent cap holds over long runs
  const cc = [];
  for (const [d, k] of [['normal', 1], ['normal', 4], ['hard', 8]]) {
    await fresh(page, d); await hold(page, k);
    cc.push(await page.evaluate(([d, k]) => {
      const w = GAME.war, t = w._tick, cap = w.offensiveCap();
      // keep their castles stocked so they can always muster, and your nodes holding (the test is the cap, not the fighting)
      let max = 0, musters = 0, last = 0;
      for (let s = 0; s < 60 * 60 * 25; s++) {
        if (s % 60 === 0) w.clock = Math.min(w.clock, 0.001);   // the clock fires every second: only the cap can stop them
        if (s % 600 === 0) for (const n of GAME.camp.nodes) if (n.type === 'castle' && n.owner === 'enemy') w.nodeForce[n.id] = { ...emptyReserve(), sword: 400 };
        if (s % 600 === 0) { GAME.player.gold = 0; for (const n of GAME.camp.nodes) if (n.type === 'castle' && n.owner === 'player') w.garrison[n.id] = { ...emptyReserve(), shield: 300 }; }
        t.call(w, 1 / 60, GAME.player);
        const a = w.activeOffensives(); if (a > max) max = a;
        if (w.musters.length > last) musters++;
        last = w.musters.length;
      }
      return { d, held: GAME.camp.territoriesHeld('player'), cap, max, musters };
    }, [d, k]));
  }
  check('DONE: concurrent offensives never exceed the cap, even with the clock firing every second (25 min each: Normal 1 / 4 territories, Hard 8)', cc.every((r) => r.max <= r.cap && r.max === r.cap && r.musters >= 2), JSON.stringify(cc));

  // ---- DONE: grace - no offensive targets a territory for 90 s after you take its castle
  await fresh(page);
  const gr = await page.evaluate(() => {
    const w = GAME.war, c = GAME.camp, t = w._tick, out = {};
    // make the Last Camp a fortress, so Greywatch's freshly taken castle is the obvious target
    w.garrison[0] = { ...emptyReserve(), shield: 500 };
    const gc = c.castleOf(2); c.capture(gc); w.onCapture(gc);
    w.garrison[gc.id] = emptyReserve();
    out.grace0 = w.grace[2];
    const targets = [];
    for (let s = 0; s < 89 * 60; s += 60) { t.call(w, 1, GAME.player); const p = w.planOffensive(); if (p) targets.push(c.nodes[p.target].territory); }
    out.during = [...new Set(targets)];
    for (let s = 0; s < 2 * 60; s += 60) t.call(w, 1, GAME.player);
    const p = w.planOffensive(); out.after = p && c.nodes[p.target].name; out.grace1 = w.grace[2];
    return out;
  });
  check('DONE: grace: 90 s after you take a castle, nothing targets its territory; then it\'s fair game (and the obvious target)',
    gr.grace0 === 90 && !gr.during.includes(2) && gr.grace1 === 0 && gr.after === 'Greywatch Castle', JSON.stringify(gr));

  // ---- targeting and army size (PLAN 8)
  await fresh(page);
  const sz = await page.evaluate(() => {
    const w = GAME.war, c = GAME.camp, out = [];
    w.garrison[0] = w.recruitList(40, 0);
    // only the Last Camp castle to aim at: its village is out of play
    c.nodes[1].owner = 'enemy';
    for (let k = 0; k < 40; k++) {
      const p = w.planOffensive(); if (!p) break;
      const tgt = c.nodes[p.target], str = w.nodeStrength(tgt);
      const per = War.strength(foeMixFull(1), c.battleTier(tgt), w.mult('enemy', null));
      out.push({ to: tgt.name, ratio: +(p.size * per / str).toFixed(2), size: p.size, src: c.nodes[p.from].name });
    }
    return out;
  });
  const ratios = sz.map((s) => s.ratio);
  check('army size: 70-110% of the target\'s defending strength (within one unit), from their nearest castle',
    sz.length === 40 && sz.every((s) => s.to === 'The Last Camp') && Math.min(...ratios) >= 0.68 && Math.max(...ratios) <= 1.13 && Math.max(...ratios) - Math.min(...ratios) > 0.2, JSON.stringify({ min: Math.min(...ratios), max: Math.max(...ratios), src: sz[0] && sz[0].src, size: sz[0] && sz[0].size }));
  const pick = await page.evaluate(() => {
    // value / distance / strength: an undefended village beats a garrisoned castle at the same distance
    const w = GAME.war, c = GAME.camp; c.nodes[1].owner = 'player';
    w.garrison[0] = w.recruitList(40, 0);
    const p = w.planOffensive(); return p && c.nodes[p.target].name;
  });
  check('targets: an undefended village (2 / its strength) beats a garrisoned castle', pick === 'Emberfield', JSON.stringify(pick));
  const clamp = await page.evaluate(() => {
    const w = GAME.war, c = GAME.camp; w.garrison[0] = w.recruitList(40, 0); c.nodes[1].owner = 'enemy';
    for (const n of c.nodes) if (n.type === 'castle' && n.owner === 'enemy') w.nodeForce[n.id] = { ...emptyReserve(), sword: 20 };
    const p = w.planOffensive(); c.nodes[1].owner = 'player'; return p && { size: p.size, max: Math.floor(20 * WAR.offensiveDraw) };
  });
  check('...clamped by the mustering garrison (at most 80% of it)', clamp && clamp.size === clamp.max, JSON.stringify(clamp));

  // ---- DONE: offensives stop after the capital falls
  await fresh(page);
  const cap = await page.evaluate(() => {
    const w = GAME.war, c = GAME.camp, t = w._tick;
    w.clock = 1; for (let k = 0; k < 120; k++) t.call(w, 1 / 60, GAME.player);
    const before = w.musters.length;
    c.castleOf(WAR.capitalTerritory).owner = 'player';
    t.call(w, 1 / 60, GAME.player);
    const won = w.won, ev = w.events.some((e) => e.kind === 'won'), cleared = w.musters.length;
    let spawned = 0;
    for (let s = 0; s < 60 * 60 * 20; s++) { t.call(w, 1 / 60, GAME.player); spawned = Math.max(spawned, w.musters.length + w.armies.filter((a) => a.team === 'enemy' && a.offensive).length); }
    return { before, won, ev, cleared, spawned };
  });
  check('DONE: the capital falls -> the war is won, the muster in progress is called off, no offensives for the next 20 min',
    cap.before === 1 && cap.won && cap.ev && cap.cleared === 0 && cap.spawned === 0, JSON.stringify(cap));

  // ---- their economy: income x difficulty, worn garrisons refill
  const eco = {};
  for (const d of ['easy', 'normal', 'hard']) {
    await fresh(page, d);
    eco[d] = await page.evaluate(() => {
      const w = GAME.war, c = GAME.camp, t = w._tick;
      const inc = c.nodes.filter((n) => n.owner === 'enemy' && n.type === 'village').reduce((s, n) => s + w.income(n), 0);
      w.clock = 1e9;
      t.call(w, 60, GAME.player);
      return { perMin: Math.round(w.enemyGold), villages: inc };
    });
  }
  check('their income: their villages\' gold per minute x 0.8 / 1 / 1.25', eco.normal.perMin === eco.normal.villages && eco.easy.perMin === Math.round(eco.normal.villages * 0.8) && eco.hard.perMin === Math.round(eco.normal.villages * 1.25), JSON.stringify(eco));
  await fresh(page);
  const ref = await page.evaluate(() => {
    const w = GAME.war, c = GAME.camp, t = w._tick, n = c.castleOf(1);
    w.clock = 1e9; w.nodeForce[n.id] = { ...emptyReserve(), sword: 10 }; w.enemyGold = 1000;
    const inc = c.nodes.filter((x) => x.owner === 'enemy' && x.type === 'village').reduce((s, x) => s + w.income(x), 0);
    for (let k = 0; k < 60 * 60; k++) t.call(w, 1 / 60, GAME.player);
    return { after: troopTotal(w.nodeForce[n.id]), spent: Math.round(1000 + inc - w.enemyGold) };
  });
  check('their worn garrisons refill (6 troops/min) out of their gold first', ref.after === 16 && ref.spent > 0, JSON.stringify(ref));

  // ---- PLAN 8: besiege their castle and the nearest other castle may send one reinforcement
  await fresh(page);
  const rf = await page.evaluate(() => {
    const w = GAME.war, c = GAME.camp, t = w._tick, rnd = Math.random; Math.random = () => 0;
    w.clock = 1e9;
    const keep = c.nodes.find((n) => n.name === 'Greywatch Keep'), cs = c.castleOf(2);
    // straight at the castle, from its own keep's road
    c.nodes.filter((n) => n.territory === 2 && n.type !== 'castle').forEach((n) => { n.owner = 'player'; });
    w.garrison[0] = w.recruitList(150, 0);
    const a = w.sendArmy(c.nodes[0], w.recruitList(150, 0), cs);
    let help = null;
    for (let k = 0; k < 60 * 120 && !help; k++) { t.call(w, 1 / 60, GAME.player); help = w.armies.find((x) => x.team === 'enemy' && x.order === 'reinforce'); }
    Math.random = rnd;
    const out = { help: help && { from: c.nodes[help.path[0]].name, to: c.nodes[help.target].name, n: troopTotal(help.units) }, event: w.events.some((e) => e.kind === 'reinforce'), siege: w.fights.some((f) => f.node === cs.id) };
    // hold the siege still (as if the knight had joined it) while the help marches in
    const f = w.fights.find((x) => x.node === cs.id); if (f) f.joined = true;
    const d0 = troopTotal(w.defendersOf(cs)), hn = help ? troopTotal(help.units) : 0;
    for (let k = 0; k < 60 * 300 && help && w.armies.includes(help); k++) t.call(w, 1 / 60, GAME.player);
    out.merged = help && !w.armies.includes(help) && troopTotal(w.defendersOf(cs)) === d0 + hn;
    return out;
  });
  check('besieging their castle: the nearest other castle sends one reinforcement army, which joins the defense', rf.help && rf.help.to === 'Greywatch Castle' && rf.event && rf.siege && rf.merged, JSON.stringify(rf));

  // ---- defending live: their offensive hits your castle -> UNDER ATTACK -> Join -> a defense battle with your garrison
  await fresh(page);
  const df = await page.evaluate(() => {
    const w = GAME.war, c = GAME.camp, t = w._tick; w.clock = 1e9;
    w.garrison[0] = w.recruitList(30, 0); GAME.player.gold = 0;
    const a = w.spawnEnemyArmy(c.castleOf(2).id, 0, { ...emptyReserve(), sword: 60 }); a.offensive = true;
    for (let k = 0; k < 60 * 200 && !w.fights.length; k++) t.call(w, 1 / 60, GAME.player);
    const f = w.fights[0];
    return { fight: f && f.id, attacked: w.events.some((e) => e.kind === 'attacked' && e.node === 0), gar: troopTotal(w.garrison[0]) };
  });
  await page.evaluate(() => { GAME.war.tick = GAME.war._tick; }); await wait(250); await page.evaluate(() => { GAME.war.tick = () => {}; });
  const ub = await page.evaluate(() => GAME.bannerMsg);
  await page.evaluate((id) => { GAME.mapSel = -1; GAME.mapFight = id; }, df.fight);
  let m = await btn(page, 'Join'); let q = toPage(b, m.x, m.y); await page.mouse.click(q.x, q.y); await wait(300);
  const db = await page.evaluate(() => ({ screen: GAME.screen, kind: GAME.battle.spec.kind, foes: Object.values(GAME.battle.spec.foes).reduce((a, x) => a + x, 0), allies: Object.values(GAME.battle.spec.allies).reduce((a, x) => a + x, 0), houses: GAME.battle.houses.length, mine: GAME.battle.houses.every((h) => h.team === 'player') }));
  check('DONE (defend): their army at your castle -> "UNDER ATTACK" -> Join -> a defense battle: their army vs you, the warband and your garrison',
    df.fight && df.attacked && /UNDER ATTACK/.test(ub) && db.screen === 'battle' && db.kind === 'defense' && db.foes > 0 && db.foes <= 60 && db.allies === df.gar && db.mine, JSON.stringify({ df, ub, db }));
  await page.evaluate(() => { GAME.god = true; GAME.finishBattle('win'); });
  await wait(800); await page.keyboard.press('Enter'); await wait(300);
  await page.evaluate(() => { if (!GAME.war._tick) { GAME.war._tick = GAME.war.tick; GAME.war.tick = () => {}; } });
  const dw = await page.evaluate(() => ({ owner: GAME.camp.nodes[0].owner, armies: GAME.war.armies.filter((a) => a.team === 'enemy').length, fights: GAME.war.fights.length, notes: GAME.battle.notes.join(' | ') }));
  check('...win the defense -> their army is broken, the castle stays yours (and no "is yours" note)', dw.owner === 'player' && dw.armies === 0 && dw.fights === 0 && !/is yours/.test(dw.notes), JSON.stringify(dw));

  // ---- their armies catch your convoys
  await fresh(page);
  const cv = await page.evaluate(() => {
    const w = GAME.war, c = GAME.camp, t = w._tick; w.clock = 1e9;
    const ember = c.nodes.find((n) => n.name === 'Emberfield');
    w.convoys.push({ id: 77, team: 'player', path: [ember.id, 0], leg: 0, t: 0, cargo: 99 });
    w.spawnEnemyArmy(c.links[0].find((i) => c.nodes[i].owner === 'enemy') ?? c.castleOf(2).id, ember.id, { ...emptyReserve(), sword: 5 });
    const a = w.armies[0]; a.path = [0, ember.id]; a.leg = 0; a.t = 0.05;
    let lost = false;
    for (let k = 0; k < 60 * 30 && !lost; k++) { t.call(w, 1 / 60, GAME.player); lost = w.events.some((e) => e.kind === 'convoyLost'); }
    return { lost, gone: !w.convoys.some((x) => x.id === 77), delivered: w.delivered };
  });
  check('a Dominion army on the road catches your convoy: its gold is lost', cv.lost && cv.gone && cv.delivered === 0, JSON.stringify(cv));

  // ---- saves
  await fresh(page, 'hard');
  const sv = await page.evaluate(() => {
    const w = GAME.war, t = w._tick; w.clock = 0.5;
    for (let k = 0; k < 60; k++) t.call(w, 1 / 60, GAME.player);
    w.grace[3] = 42; w.enemyGold = 321;
    GAME.save();
    return { d: w.difficulty, musters: w.musters.length, clock: Math.round(w.clock), grace: w.grace[3], gold: 321 };
  });
  await page.reload(); await wait(600); await page.keyboard.press('Enter'); await wait(300);
  const sv2 = await page.evaluate(() => { const w = GAME.war; return { d: w.difficulty, musters: w.musters.length, clock: Math.round(w.clock), grace: Math.round(w.grace[3]), gold: Math.round(w.enemyGold) }; });
  check('difficulty, the war clock, musters, grace and their gold survive a reload', sv2.d === 'hard' && sv2.musters === 1 && Math.abs(sv2.clock - sv.clock) <= 1 && Math.abs(sv2.grace - 42) <= 1 && Math.abs(sv2.gold - 321) <= 15, JSON.stringify({ sv, sv2 }));
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
  await page.evaluate(() => { GAME.war.clock = 0.2; });
  await wait(1200);
  const st = await page.evaluate(() => ({ musters: GAME.war.musters.length, banner: GAME.bannerMsg }));
  await page.screenshot({ path: OUT + '/p9-phone-muster.png' });
  check('phone: the clock runs out on the live map -> a muster, announced', st.musters === 1 && /MUSTERS/.test(st.banner), JSON.stringify(st));
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
