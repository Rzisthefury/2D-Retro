// PLAN v2 Phase 8 (armies, off-screen sim, join, intercept) checks: headless Chromium, desktop + emulated iPhone 13.
const { chromium, devices } = require('playwright');
const path = require('path');
const URL = 'file://' + path.resolve(process.argv[2]);
const OUT = process.argv[3];
const results = [];
const check = (name, ok, info = '') => { results.push({ name, ok, info }); console.log((ok ? 'PASS ' : 'FAIL ') + name + (info ? '  — ' + info : '')); };
const wait = (ms) => new Promise((r) => setTimeout(r, ms));

// Phase 12: the title goes Play -> slot -> difficulty -> intro card (or Continue with a save); these walk it to the map.
async function titleStart(page) {
  for (let k = 0; k < 8; k++) {
    if (await page.evaluate(() => GAME.screen === 'campaign' && !GAME.story)) return;
    await page.keyboard.press('Enter'); await new Promise((r) => setTimeout(r, 250));
  }
}
async function titleTapStart(page) {
  for (let k = 0; k < 8; k++) {
    const at = await page.evaluate(() => {
      if (GAME.screen === 'campaign') return GAME.story ? { x: 480, y: 300 } : null;
      const r = GAME.titleRowAt(GAME.titleMode === 'difficulty' ? 1 : 0); return { x: r.x + r.w / 2, y: r.y + r.h / 2 };
    });
    if (!at) return;
    const b = await page.evaluate(() => { const r = document.getElementById('game').getBoundingClientRect(); return { x: r.left, y: r.top, w: r.width, h: r.height }; });
    await page.touchscreen.tap(b.x + at.x / 960 * b.w, b.y + at.y / 540 * b.h); await new Promise((r) => setTimeout(r, 300));
  }
}
const ignorable = (t) => /fonts\.(googleapis|gstatic)|ERR_|net::/.test(t);
const geom = (page) => page.evaluate(() => { const r = document.getElementById('game').getBoundingClientRect(); return { x: r.left, y: r.top, w: r.width, h: r.height }; });
const toPage = (b, x, y) => ({ x: b.x + x / 960 * b.w, y: b.y + y / 540 * b.h });
const btn = (page, label) => page.evaluate((label) => { const bs = GAME.mapButtons(), i = bs.findIndex((b) => b.label.startsWith(label)); if (i < 0) return null; const a = GAME.mapButtonAt(i, bs.length); return { x: a.x + (a.w || MAP_BTN.w) / 2, y: a.y + MAP_BTN.h / 2, enabled: bs[i].enabled, label: bs[i].label }; }, label);
const hit = (page, label) => page.evaluate((label) => { const h = GAME.sendHits().find((x) => x.label === label); return h ? { x: h.x + h.w / 2, y: h.y + h.h / 2 } : null; }, label);
const nodeXY = (page, name) => page.evaluate((name) => { const n = GAME.camp.nodes.find((x) => x.name === name); return GAME.mapToScreen(n.x, n.y); }, name);
/** Freeze the live map between steps: the tests drive war time themselves. */
const freeze = (page) => page.evaluate(() => { if (!GAME.war._tick) { GAME.war._tick = GAME.war.tick; GAME.war.tick = () => {}; } });
const run = (page, s) => page.evaluate((s) => { const w = GAME.war; const t = w._tick || w.tick; for (let k = 0; k < Math.round(s * 60); k++) t.call(w, 1 / 60, GAME.player); }, s);

async function desktop(browser) {
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 } });
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(String(e)));
  page.on('console', (m) => { if (m.type() === 'error' && !ignorable(m.text())) errors.push(m.text()); });
  await page.goto(URL); await page.evaluate(() => localStorage.clear()); await page.reload(); await wait(700);
  await titleStart(page);
  await page.evaluate(() => { GAME.war.tickAI = () => {}; WAR.reinforceChance = 0; });   // the Dominion's AI (Phase 9) is off in this suite
  await freeze(page);
  const b = await geom(page);
  await page.evaluate(() => { const w = GAME.war; w.garrison[0] = w.recruitList(150, 0); w.convoys = []; w.enemyConvoyT = 1e9; for (const n of GAME.camp.nodes) w.convoyT[n.id] = 1e9; });

  // ---- DONE: send an army (castle panel -> Send army -> troops -> target)
  let p = await nodeXY(page, 'The Last Camp'), q = toPage(b, p.x, p.y);
  await page.mouse.click(q.x, q.y); await wait(120);
  let m = await btn(page, 'Send army'); q = toPage(b, m.x, m.y); await page.mouse.click(q.x, q.y); await wait(120);
  const half = await page.evaluate(() => ({ mode: GAME.mapMode, n: troopTotal(GAME.sendUnits) }));
  m = await hit(page, 'All'); q = toPage(b, m.x, m.y); await page.mouse.click(q.x, q.y); await wait(80);
  const all = await page.evaluate(() => troopTotal(GAME.sendUnits));
  // swordsmen -5 twice
  const minus = await page.evaluate(() => { const h = GAME.sendHits()[0]; return { x: h.x + h.w / 2, y: h.y + h.h / 2 }; });
  q = toPage(b, minus.x, minus.y); await page.mouse.click(q.x, q.y); await wait(60); await page.mouse.click(q.x, q.y); await wait(80);
  const picked = await page.evaluate(() => ({ ...GAME.sendUnits, total: troopTotal(GAME.sendUnits), gar: { ...GAME.war.garrison[0] } }));
  check('castle panel -> Send army -> troops per type (Half to start, All, -/+)', half.mode === 'send' && half.n >= 73 && half.n <= 75 && all === 150 && picked.total === 140 && picked.sword === picked.gar.sword - 10, JSON.stringify({ half, all, picked }));
  m = await btn(page, 'Choose target'); q = toPage(b, m.x, m.y); await page.mouse.click(q.x, q.y); await wait(80);
  // a village of yours is refused, an enemy node is taken
  p = await nodeXY(page, 'Emberfield'); q = toPage(b, p.x, p.y); await page.mouse.click(q.x, q.y); await wait(80);
  const refused = await page.evaluate(() => ({ mode: GAME.mapMode, armies: GAME.war.armies.length, toast: GAME.toastMsg }));
  const clear = await page.evaluate(() => {
    // an enemy village whose road from the Last Camp crosses only your nodes
    const w = GAME.war, c = GAME.camp;
    const v = c.nodes.filter((n) => n.type === 'village' && n.owner === 'enemy').find((n) => { const p = w.path(0, n.id); return p.length > 2 && p.slice(1, -1).every((i) => c.nodes[i].owner === 'player'); })
      || c.nodes.filter((n) => n.owner === 'enemy').find((n) => { const p = w.path(0, n.id); return p.slice(1, -1).every((i) => c.nodes[i].owner === 'player'); });
    return v.name;
  });
  p = await nodeXY(page, clear); q = toPage(b, p.x, p.y); await page.mouse.click(q.x, q.y); await wait(120);
  const sent = await page.evaluate(() => { const a = GAME.war.armies[0]; return a && { team: a.team, total: troopTotal(a.units), order: a.order, target: GAME.camp.nodes[a.target].name, path: a.path.map((i) => GAME.camp.nodes[i].name), gar: troopTotal(GAME.war.garrison[0]), sel: GAME.mapArmy === a.id }; });
  await page.screenshot({ path: OUT + '/p8-sent.png' });
  check('DONE: Choose target -> an enemy node: the army leaves the garrison (150 -> 10) and marches; your village is refused as a target',
    refused.mode === 'target' && refused.armies === 0 && /CASTLE/.test(refused.toast) && sent && sent.total === 140 && sent.order === 'attack' && sent.target === clear && sent.gar === 10 && sent.sel, JSON.stringify({ refused, sent }));

  // ---- DONE: it walks the road, and the sim resolves the fight
  const walk = [];
  for (let k = 0; k < 4; k++) { await run(page, 3); walk.push(await page.evaluate(() => { const a = GAME.war.armies[0]; if (!a) return null; const q = GAME.war.armyPos(a); return { x: Math.round(q.x), y: Math.round(q.y), leg: a.leg, fight: a.fight }; })); }
  const moved = walk.filter(Boolean).every((w, i, arr) => i === 0 || w.x !== arr[i - 1].x || w.y !== arr[i - 1].y || w.fight >= 0);
  let fightAt = null;
  for (let k = 0; k < 40 && !fightAt; k++) { await run(page, 1); fightAt = await page.evaluate(() => { const f = GAME.war.fights[0]; return f ? { node: GAME.camp.nodes[f.node].name, att: Math.round(GAME.war.attStrength(f)), def: Math.round(GAME.war.defStrength(f)) } : null; }); }
  check('the army walks the road (position changes along its path) and stops to fight at the first enemy node', moved && fightAt !== null, JSON.stringify({ walk, fightAt }));
  let over = null;
  for (let k = 0; k < 120 && !over; k++) { await run(page, 1); over = await page.evaluate(() => GAME.war.fights.length ? null : { owner: GAME.camp.nodes.find((n) => n.name === fightAtName).owner }).catch(() => null); if (over === null) over = await page.evaluate((nm) => GAME.war.fights.length ? null : { owner: GAME.camp.nodes.find((n) => n.name === nm).owner, armies: GAME.war.armies.map((a) => ({ team: a.team, n: troopTotal(a.units), to: GAME.camp.nodes[a.target].name })) }, fightAt.node); }
  check('DONE: the sim resolves it: 140 troops beat the garrison; the node is yours and the survivors head for your castle',
    over && over.owner === 'player' && over.armies.length === 1 && over.armies[0].to === 'The Last Camp', JSON.stringify({ fightAt, over }));
  await run(page, 60);
  const home = await page.evaluate(() => ({ armies: GAME.war.armies.length, gar: troopTotal(GAME.war.garrison[0]) }));
  check('...they reach the castle and join its garrison', home.armies === 0 && home.gar > 10, JSON.stringify(home));

  // ---- PLAN 15: equal strength -> the fortified defender wins; 2:1 -> the attacker wins
  const sim = await page.evaluate(() => {
    const w = GAME.war, c = GAME.camp, t = w._tick;
    const castle = c.castleOf(1), start = c.castleOf(0);
    const go = (attackers, defenders) => {
      w.armies = []; w.fights = []; c.load(c.save());
      w.nodeForce[castle.id] = { ...emptyReserve(), sword: defenders };
      const a = { id: 500, team: 'player', general: null, units: { ...emptyReserve(), sword: attackers }, path: [c.nodes.find((n) => c.links[n.id].includes(castle.id) && n.territory === 1).id, castle.id], leg: 0, t: 0.999, target: castle.id, order: 'attack', fight: -1 };
      w.armies.push(a);
      for (let k = 0; k < 60 * 400 && (w.fights.length || w.armies.some((x) => x.fight < 0 && x.leg === 0)); k++) t.call(w, 1 / 60, GAME.player);
      const f = w.results[w.results.length - 1]; w.results = [];
      return { winner: f ? f.winner : null, owner: castle.owner };
    };
    // strengths: your troops x0.9 (PLAN 11.2) x0.8 (no general); theirs x1; the castle's fortification on top
    const fort = w.fortification(castle);
    const equal = go(50, 36);        // 50 x 0.72 = 36 = 36: equal strength before the walls
    castle.owner = 'enemy'; castle.level = 1;
    const two = go(100, 36);         // 72 vs 36
    castle.owner = 'enemy'; castle.level = 1;
    return { fort, equal, two };
  });
  check('PLAN 15 sim: equal strength -> the fortified defender (castle x1.4) wins; 2:1 -> the attacker wins', Math.abs(sim.fort - 1.4) < 1e-9 && sim.equal.winner === 'enemy' && sim.two.winner === 'player', JSON.stringify(sim));
  const breakAt = await page.evaluate(() => {
    // a side breaks at 20% of its starting strength (not wiped out)
    const w = GAME.war, c = GAME.camp, t = w._tick; w.armies = []; w.fights = []; w.results = [];
    const a1 = { id: 601, team: 'player', general: null, units: { ...emptyReserve(), sword: 60 }, path: [0, c.links[0][0]], leg: 0, t: 0.5, target: c.links[0][0], order: 'attack', fight: -1 };
    const pa = w.armyPos(a1);
    const e1 = { id: 602, team: 'enemy', general: null, units: { ...emptyReserve(), sword: 20 }, path: [c.links[0][0], 0], leg: 0, t: 0.5, target: 0, order: 'attack', fight: -1 };
    w.armies.push(a1, e1);
    t.call(w, 1 / 60, GAME.player);
    const f = w.fights[0], made = !!f && f.node === -1;
    let left = null;
    for (let k = 0; k < 60 * 200 && w.fights.length; k++) { const s = e1.units.sword; t.call(w, 1 / 60, GAME.player); if (!w.fights.length) left = s; }
    return { made, winner: w.results[0] && w.results[0].winner, enemyLeftAtBreak: left, mine: troopTotal(a1.units), mineMarches: a1.fight === -1 && !a1.gone };
  });
  check('two hostile armies meeting on a road fight; the loser breaks at 20% (not wiped out), the winner marches on',
    breakAt.made && breakAt.winner === 'player' && breakAt.enemyLeftAtBreak > 0 && breakAt.enemyLeftAtBreak <= 5 && breakAt.mineMarches, JSON.stringify(breakAt));
  await page.evaluate(() => { GAME.war.armies = []; GAME.war.fights = []; GAME.war.results = []; });

  // ---- DONE: joining carries the current counts and structure HP
  const jf = await page.evaluate(() => {
    const w = GAME.war, c = GAME.camp, t = w._tick;
    w.garrison[0] = w.recruitList(80, 0);
    const keep = c.nodes.find((n) => n.name === 'Millbrook Castle');
    const a = w.sendArmy(c.nodes[0], w.recruitList(70, 0), keep);
    for (let k = 0; k < 60 * 120 && !w.fights.length; k++) t.call(w, 1 / 60, GAME.player);
    for (let k = 0; k < 60 * 10; k++) t.call(w, 1 / 60, GAME.player);
    const f = w.fights[0];
    return { node: f && c.nodes[f.node].name, structure: f && +f.structure.toFixed(3), att: f && { ...a.units }, def: f && { ...w.defendersOf(keep) }, full: c.garrison(keep), id: f && f.id };
  });
  await page.evaluate((id) => { GAME.mapSel = -1; GAME.mapFight = id; }, jf.id);
  m = await btn(page, 'Join'); q = toPage(b, m.x, m.y); await page.mouse.click(q.x, q.y); await wait(300);
  const jb = await page.evaluate(() => {
    const b = GAME.battle, a = GAME.army, s = b.spec;
    return { screen: GAME.screen, kind: s.kind, fight: s.fightId, foes: s.foes, allies: s.allies, wear: +b.wear().toFixed(3), playerUnits: a.live('player') + a.reserveCount('player'), warband: troopTotal(GAME.war.warband), gate: Math.round(b.gates[0].hp), gateMax: b.gates[0].maxHp };
  });
  const sum = (u) => Object.values(u).reduce((x, y) => x + y, 0);
  check('DONE: Join (a siege) -> the battle starts with the fight\'s current counts (defenders, your army beside the warband) and structure HP',
    jb.screen === 'battle' && jb.kind === 'castle' && jb.fight === jf.id && sum(jb.foes) === sum(jf.def) && sum(jf.def) < jf.full && sum(jb.allies) === sum(jf.att)
    && jb.playerUnits === jb.warband + sum(jf.att) && jf.structure < 1 && Math.abs(jb.wear - jf.structure) < 0.002 && jb.gate < jb.gateMax, JSON.stringify({ jf, jb }));
  await page.screenshot({ path: OUT + '/p8-joined.png' });
  // withdraw: back to the sim with what's left
  const back = await page.evaluate(() => {
    const a = GAME.army; let k = 0;
    for (let i = 0; i < a.cap && k < 20; i++) if (a.alive[i] && a.team[i] === TEAM_ENEMY) { a.hurt(GAME, i, 1e7, 0, 0, false); k++; }
    GAME.battle.gates[0].damage(GAME, Math.round(GAME.battle.gates[0].hp / 2));
    const wear = GAME.battle.wear();
    GAME.finishBattle('retreat');
    return { wear: +wear.toFixed(3) };
  });
  await wait(800); await page.keyboard.press('Enter'); await wait(300);
  await freeze(page);
  const after = await page.evaluate((id) => { const f = GAME.war.fights.find((x) => x.id === id), keep = GAME.camp.nodes.find((n) => n.name === 'Millbrook Castle'); return f && { joined: f.joined, structure: +f.structure.toFixed(3), def: troopTotal(GAME.war.defendersOf(keep)), att: troopTotal(GAME.war.armies.find((x) => x.id === f.attackers[0]).units), owner: keep.owner }; }, jf.id);
  check('withdrawing hands it back to the sim: the fight goes on with the survivors and the damaged walls',
    after && !after.joined && Math.abs(after.structure - back.wear) < 0.002 && after.def < sum(jf.def) && after.owner === 'enemy', JSON.stringify({ back, after }));
  // join again and win: the keep is yours
  await page.evaluate((id) => { GAME.mapSel = -1; GAME.mapFight = id; GAME.joinFight(GAME.war.fights.find((x) => x.id === id)); GAME.finishBattle('win'); }, jf.id);
  await wait(800); await page.keyboard.press('Enter'); await wait(300);
  await freeze(page);
  const won = await page.evaluate(() => { const cs = GAME.camp.nodes.find((n) => n.name === 'Millbrook Castle'); return { owner: cs.owner, fights: GAME.war.fights.length, armies: GAME.war.armies.length, garrison: troopTotal(GAME.war.garrison[cs.id] || emptyReserve()), banner: GAME.bannerMsg, held: GAME.camp.territoriesHeld('player') }; });
  check('join and win -> the castle is yours (its territory too); your army garrisons it', won.owner === 'player' && won.fights === 0 && won.armies === 0 && won.garrison > 0 && won.held === 2 && /TAKEN/.test(won.banner), JSON.stringify(won));
  await page.evaluate(() => { GAME.war.armies = []; });

  // ---- DONE: intercept starts a field battle
  const ea = await page.evaluate(() => {
    // a long march: from Hollin Castle on the Last Camp
    const c = GAME.camp, a = GAME.war.spawnEnemyArmy(c.nodes.find((n) => n.name === 'Hollin Castle').id, 0, { ...emptyReserve(), ...foeMix(40) });
    return a && { id: a.id, n: troopTotal(a.units), from: GAME.camp.nodes[a.path[0]].name, to: GAME.camp.nodes[a.target].name };
  });
  let near = false;
  for (let k = 0; k < 60 && !near; k++) { await run(page, 0.2); near = await page.evaluate((id) => { const a = GAME.war.armies.find((x) => x.id === id); return !!a && GAME.war.canIntercept(a) && a.t > 0.3 && a.t < 0.7; }, ea.id); }
  await page.evaluate((id) => { GAME.mapSel = -1; GAME.mapFight = -1; GAME.mapArmy = -1; GAME.mapZoomTo = GAME.mapZoom = 1; const q = GAME.war.armyPos(GAME.war.armies.find((x) => x.id === id)); GAME.mapX = q.x; GAME.mapY = q.y; }, ea.id);
  await wait(60);
  const ap = await page.evaluate((id) => { const q = GAME.war.armyPos(GAME.war.armies.find((x) => x.id === id)); return GAME.mapToScreen(q.x, q.y); }, ea.id);
  q = toPage(b, ap.x, ap.y - 8); await page.mouse.click(q.x, q.y); await wait(120);
  const asel = await page.evaluate(() => ({ army: GAME.mapArmy, btns: GAME.mapButtons().map((x) => x.label + (x.enabled ? '' : '(off)')) }));
  await page.screenshot({ path: OUT + '/p8-intercept-panel.png' });
  m = await btn(page, 'Intercept'); q = toPage(b, m.x, m.y); await page.mouse.click(q.x, q.y); await wait(300);
  const ib = await page.evaluate(() => ({ screen: GAME.screen, kind: GAME.battle.spec.kind, foes: Object.values(GAME.battle.spec.foes).reduce((a, b) => a + b, 0), army: GAME.battle.spec.armyId, strength: GAME.foeStrength() }));
  check('DONE: a Dominion army near your land -> click it -> Intercept -> a field battle against exactly its troops',
    ea && near && asel.army === ea.id && asel.btns[0] === 'Intercept' && ib.screen === 'battle' && ib.kind === 'field' && ib.foes === ea.n && ib.army === ea.id, JSON.stringify({ ea, asel, ib }));
  await page.evaluate(() => { const a = GAME.army; let k = 0; for (let i = 0; i < a.cap && k < 15; i++) if (a.alive[i] && a.team[i] === TEAM_ENEMY) { a.hurt(GAME, i, 1e7, 0, 0, false); k++; } GAME.finishBattle('retreat'); });
  await wait(800); await page.keyboard.press('Enter'); await wait(300); await freeze(page);
  const after2 = await page.evaluate((id) => { const a = GAME.war.armies.find((x) => x.id === id); return a && troopTotal(a.units); }, ea.id);
  await page.evaluate((id) => { GAME.intercept(GAME.war.armies.find((x) => x.id === id)); GAME.finishBattle('win'); }, ea.id);
  await wait(800); await page.keyboard.press('Enter'); await wait(300); await freeze(page);
  const gone = await page.evaluate((id) => !GAME.war.armies.some((x) => x.id === id), ea.id);
  check('withdrawing from an intercept leaves the army its survivors; winning breaks it', after2 === ea.n - 15 && gone, JSON.stringify({ after2, gone }));

  // ---- the Dominion attacking you off-screen: your castle's garrison holds (walls); an empty village falls
  const def = await page.evaluate(() => {
    const w = GAME.war, c = GAME.camp, t = w._tick; w.armies = []; w.fights = []; w.results = [];
    w.garrison[0] = w.recruitList(40, 0); GAME.player.gold = 0;   // no recruiting to refill it
    const src = c.nodes.find((n) => n.name === 'Greywatch Castle').id;
    w.spawnEnemyArmy(src, 0, { ...emptyReserve(), sword: 30 });
    for (let k = 0; k < 60 * 400 && (w.armies.length || w.fights.length); k++) t.call(w, 1 / 60, GAME.player);
    const r1 = { owner: c.nodes[0].owner, gar: troopTotal(w.garrison[0]) };
    const v = c.nodes.find((n) => n.name === 'Emberfield');
    // from a Dominion node with a straight road to it (armies stop at the first hostile node on their way)
    const nb = c.links[v.id].map((i) => c.nodes[i]).find((n) => n.type !== 'castle');
    nb.owner = 'enemy';
    w.spawnEnemyArmy(nb.id, v.id, { ...emptyReserve(), sword: 10 });
    for (let k = 0; k < 60 * 400 && (w.armies.length || w.fights.length) && v.owner === 'player'; k++) t.call(w, 1 / 60, GAME.player);
    return { castle: r1, village: v.owner };
  });
  check('Dominion army vs your castle: the fortified garrison holds; vs an undefended village of yours: it falls', def.castle.owner === 'player' && def.castle.gar < 40 && def.village === 'enemy', JSON.stringify(def));

  // ---- armies and fights survive a reload
  const sv = await page.evaluate(() => {
    const w = GAME.war, c = GAME.camp; w.armies = []; w.fights = []; w.garrison[0] = w.recruitList(60, 0);
    w.sendArmy(c.nodes[0], w.recruitList(20, 0), c.nodes.find((n) => n.name === 'Millbrook Castle'));
    w.spawnEnemyArmy(c.nodes.find((n) => n.name === 'Greywatch Castle').id, 0, { ...emptyReserve(), sword: 12 });
    for (let k = 0; k < 60 * 3; k++) w._tick.call(w, 1 / 60, GAME.player);
    GAME.save();
    return w.armies.map((a) => [a.team, troopTotal(a.units), a.path.join('-'), a.leg]);
  });
  await page.reload(); await wait(600); await page.keyboard.press('Enter'); await wait(300); await page.evaluate(() => { GAME.war.tickAI = () => {}; WAR.reinforceChance = 0; });
  const sv2 = await page.evaluate(() => GAME.war.armies.map((a) => [a.team, troopTotal(a.units), a.path.join('-'), a.leg]));
  check('armies on the road come back after a reload', JSON.stringify(sv2) === JSON.stringify(sv), JSON.stringify({ sv, sv2 }));
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
  let s; await titleTapStart(page);
  await page.evaluate(() => { GAME.war.tickAI = () => {}; WAR.reinforceChance = 0; });
  await freeze(page);
  await page.evaluate(() => { GAME.war.garrison[0] = GAME.war.recruitList(30, 0); });
  let p = await nodeXY(page, 'The Last Camp'); s = toPage(b, p.x, p.y); await page.touchscreen.tap(s.x, s.y); await wait(200);
  let m = await btn(page, 'Send army'); s = toPage(b, m.x, m.y); await page.touchscreen.tap(s.x, s.y); await wait(200);
  m = await hit(page, 'All'); s = toPage(b, m.x, m.y); await page.touchscreen.tap(s.x, s.y); await wait(150);
  await page.screenshot({ path: OUT + '/p8-phone-send.png' });
  m = await btn(page, 'Choose target'); s = toPage(b, m.x, m.y); await page.touchscreen.tap(s.x, s.y); await wait(200);
  p = await nodeXY(page, 'Oakhurst'); s = toPage(b, p.x, p.y); await page.touchscreen.tap(s.x, s.y); await wait(200);
  const r = await page.evaluate(() => { const a = GAME.war.armies[0]; return a && { n: troopTotal(a.units), to: GAME.camp.nodes[a.target].name, gar: troopTotal(GAME.war.garrison[0]) }; });
  check('phone: tap castle -> Send army -> All -> Choose target -> tap an enemy node -> the army marches', r && r.n === 30 && r.to === 'Oakhurst' && r.gar === 0, JSON.stringify(r));
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
