// PLAN v2 Phase 6 (campaign map) checks: headless Chromium, desktop + emulated iPhone 13.
const { chromium, devices } = require('playwright');
const path = require('path');
const URL = 'file://' + path.resolve(process.argv[2]);
const OUT = process.argv[3];
const results = [];
const check = (name, ok, info = '') => { results.push({ name, ok, info }); console.log((ok ? 'PASS ' : 'FAIL ') + name + (info ? '  — ' + info : '')); };
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const ignorable = (t) => /fonts\.(googleapis|gstatic)|ERR_|net::/.test(t);

/** Page px of a logical (960x540) point. */
async function geom(page) {
  return page.evaluate(() => { const r = document.getElementById('game').getBoundingClientRect(); return { x: r.left, y: r.top, w: r.width, h: r.height }; });
}
const toPage = (b, x, y) => ({ x: b.x + x / 960 * b.w, y: b.y + y / 540 * b.h });
const nodeScreen = (page, id) => page.evaluate((id) => { const n = GAME.camp.nodes[id]; return GAME.mapToScreen(n.x, n.y); }, id);
const byName = (page, name) => page.evaluate((name) => GAME.camp.nodes.find((n) => n.name === name).id, name);

async function desktop(browser) {
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 } });
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(String(e)));
  page.on('console', (m) => { if (m.type() === 'error' && !ignorable(m.text())) errors.push(m.text()); });
  await page.goto(URL);
  await page.evaluate(() => localStorage.clear());
  await page.reload(); await wait(700);
  await page.keyboard.press('Enter'); await wait(500);
  const b = await geom(page);

  // ---- the continent (PLAN 4 / 5.1)
  const lay = await page.evaluate(() => {
    const c = GAME.camp;
    const per = c.territories.map((t) => {
      const k = (ty) => t.nodes.filter((n) => n.type === ty).length;
      return { name: t.name, tier: t.tier, castle: k('castle'), keep: k('keep'), village: k('village'), outpost: k('outpost'), owner: t.nodes.map((n) => n.owner) };
    });
    return { screen: GAME.screen, territories: c.territories.length, nodes: c.nodes.length, per };
  });
  const start = lay.per[0], rest = lay.per.slice(1);
  check('New Game -> the campaign map: 12 territories', lay.screen === 'campaign' && lay.territories === 12, `${lay.territories} territories, ${lay.nodes} nodes`);
  check('start: you hold the Last Camp (level-1 castle + one village); the Dominion holds the rest',
    start.castle === 1 && start.village === 1 && start.owner.every((o) => o === 'player') && rest.every((t) => t.owner.every((o) => o === 'enemy')), JSON.stringify(start));
  check('every other territory: 1 castle, 1 keep, 2-3 villages, 1 outpost',
    rest.every((t) => t.castle === 1 && t.keep === 1 && t.village >= 2 && t.village <= 3 && t.outpost === 1), JSON.stringify(rest.map((t) => `${t.name}:${t.village}v`)));
  const tiers = await page.evaluate(() => {
    // tier never drops with road distance from the start, 1 next door, 5 at the capital
    const c = GAME.camp, s = c.castleOf(WAR.startTerritory).id, N = c.nodes.length;
    const rows = c.territories.map((t) => ({ t: t.tier, d: Math.round(c.dist[s * N + c.castleOf(t.id).id]) })).sort((a, b) => a.d - b.d);
    return { rows, capital: c.territories[WAR.capitalTerritory].tier, counts: [1, 2, 3, 4, 5].map((k) => c.territories.filter((t) => t.tier === k).length) };
  });
  check('tiers 1-5 rise with distance from the start; the capital is tier 5', tiers.capital === 5 && tiers.counts.every((n) => n > 0) && tiers.rows.every((r, i) => i === 0 || r.t >= tiers.rows[i - 1].t - 1), JSON.stringify(tiers));

  // ---- DONE: every node reachable by road
  const roads = await page.evaluate(() => {
    const c = GAME.camp, seen = new Set([0]), q = [0];
    while (q.length) { const a = q.shift(); for (const b of c.links[a]) if (!seen.has(b)) { seen.add(b); q.push(b); } }
    const N = c.nodes.length; let finite = 0; for (let i = 0; i < N * N; i++) if (c.dist[i] < Infinity) finite++;
    // and the road a path takes is made of real roads
    const s = 0, t = c.castleOf(WAR.capitalTerritory).id; const path = [s]; let k = s; let ok = true;
    while (k !== t && path.length < 99) { const nx = c.hop[k * N + t]; if (!c.links[k].includes(nx)) ok = false; path.push(nx); k = nx; }
    return { reached: seen.size, N, finite, roads: c.roads.length, path: path.length, pathOk: ok && k === t };
  });
  check('DONE: every node reachable by road (BFS from the Last Camp, and all-pairs paths)', roads.reached === roads.N && roads.finite === roads.N * roads.N && roads.pathOk, JSON.stringify(roads));

  // ---- DONE: the frontier rule (PLAN 5.1)
  const fr = await page.evaluate(() => {
    const c = GAME.camp, nm = (t) => c.territories[t].name;
    const atk = () => [...new Set(c.nodes.filter((n) => c.canAttack(n)).map((n) => nm(n.territory)))].sort();
    const out = { start: atk(), startAllNodes: c.territories.filter((t) => [1, 2].includes(t.id)).every((t) => t.nodes.every((n) => c.canAttack(n))) };
    // take Greywatch March's castle: its neighbours open up
    const save = c.save();
    c.capture(c.castleOf(2)); out.afterGreywatch = atk();
    c.load(save);
    // hold one village deep in Saltmarsh: Saltmarsh opens (partly held), but not Saltmarsh's neighbours
    const v = c.territories[3].nodes.find((n) => n.type === 'village'); v.owner = 'player';
    out.partly = atk(); out.ashfen = c.territories[6].nodes.some((n) => c.canAttack(n));
    out.ownNode = c.canAttack(v);
    c.load(save);
    return out;
  });
  check('frontier at the start: only the two territories bordering the Last Camp, every node in them',
    fr.start.join(',') === 'Greywatch March,Millbrook Vale' && fr.startAllNodes, JSON.stringify(fr.start));
  check('frontier: taking a castle opens the territories bordering it',
    fr.afterGreywatch.join(',') === 'Greywatch March,Hollin Reach,Millbrook Vale,Thornwall', JSON.stringify(fr.afterGreywatch));
  check('frontier: holding any node in a territory opens it ("partly hold"), not its neighbours; your own nodes are not targets',
    fr.partly.includes('Saltmarsh') && !fr.ashfen && !fr.ownNode, JSON.stringify(fr));

  // ---- garrisons, thinning, iron gate, the outpost's +1 tier (PLAN 5.1 / 5.2)
  const gm = await page.evaluate(() => {
    const c = GAME.camp, save = c.save(), t = c.territories[1], castle = c.castleOf(1);
    const kp = t.nodes.find((n) => n.type === 'keep'), op = t.nodes.find((n) => n.type === 'outpost'), vs = t.nodes.filter((n) => n.type === 'village');
    const r = { lvl: castle.level, withKeep: c.garrison(castle), tierWithOutpost: c.battleTier(castle), iron: c.battleSpec(castle).ironGate };
    kp.owner = 'player'; r.keepTaken = c.garrison(castle); r.ironAfter = c.battleSpec(castle).ironGate;
    vs[0].owner = 'player'; r.oneSmall = c.garrison(castle);
    vs[1].owner = 'player'; r.twoSmall = c.garrison(castle);
    op.owner = 'player'; r.three = c.garrison(castle); r.tierAfter = c.battleTier(castle);
    c.load(save);
    return r;
  });
  check('castle garrison: L1 40, +50% while the keep is theirs; thinning 15% per village/outpost you hold',
    gm.lvl === 1 && gm.withKeep === 60 && gm.keepTaken === 40 && gm.oneSmall === 34 && gm.twoSmall === 28 && gm.three === 22, JSON.stringify(gm));
  check('their keep = iron gate; their outpost = +1 battle tier for the castle', gm.iron === true && gm.ironAfter === false && gm.tierWithOutpost === 2 && gm.tierAfter === 1, JSON.stringify(gm));

  await page.screenshot({ path: OUT + '/p6-map-far.png' });

  // ---- mouse: click a node -> its panel; click Attack -> its battle
  const watch = await byName(page, 'Millbrook Watch');
  let p = await nodeScreen(page, watch), q = toPage(b, p.x, p.y);
  await page.mouse.click(q.x, q.y); await wait(250);
  const sel = await page.evaluate(() => ({ sel: GAME.mapSel, btns: GAME.mapButtons().map((x) => x.label + (x.enabled ? '' : '(off)')) }));
  check('click a node -> it is selected and its panel offers Attack', sel.sel === watch && sel.btns[0] === 'Attack', JSON.stringify(sel));
  await page.screenshot({ path: OUT + '/p6-panel.png' });
  const ab = await page.evaluate(() => { const n = GAME.mapButtons().length, a = GAME.mapButtonAt(0, n); return { x: a.x + (a.w || MAP_BTN.w) / 2, y: a.y + MAP_BTN.h / 2 }; });
  q = toPage(b, ab.x, ab.y); await page.mouse.click(q.x, q.y); await wait(400);
  const bt = await page.evaluate(() => ({ screen: GAME.screen, kind: GAME.battle.spec.kind, node: GAME.battle.spec.nodeId, name: GAME.battle.spec.name, tier: GAME.battle.spec.tier }));
  check('Attack -> the node\'s battle (outpost capture, its name and tier)', bt.screen === 'battle' && bt.kind === 'outpost' && bt.node === watch && bt.name === 'Millbrook Watch', JSON.stringify(bt));

  // ---- win -> the node is yours (level - 1, min 1), saved; back on the map looking at it
  await page.evaluate(() => GAME.finishBattle('win'));
  await wait(800); await page.keyboard.press('Enter'); await wait(400);
  const won = await page.evaluate((id) => { const n = GAME.camp.nodes[id]; const sv = JSON.parse(localStorage.getItem('aerial-conquest-slot1')); return { screen: GAME.screen, owner: n.owner, level: n.level, sel: GAME.mapSel, banner: GAME.bannerMsg, saved: sv.war[id] }; }, watch);
  check('DONE: attack -> battle -> win -> the node flips to you, saved; back on the map with it selected',
    won.screen === 'campaign' && won.owner === 'player' && won.level === 1 && won.sel === watch && /TAKEN/.test(won.banner) && won.saved[0] === 1, JSON.stringify(won));
  const lv = await page.evaluate(() => {
    // PLAN 5.3: a level-2 node comes over at level 1, a level-3 at level 2
    const c = GAME.camp, n = c.nodes.find((x) => x.type === 'castle' && x.level === 3), m = c.nodes.find((x) => x.type === 'keep' && x.level === 2);
    const s = c.save(); c.capture(n); c.capture(m); const r = [n.level, m.level]; c.load(s); return r;
  });
  check('captured nodes come over a level down (L3 -> 2, L2 -> 1)', lv[0] === 2 && lv[1] === 1, JSON.stringify(lv));

  // ---- lose and retreat leave the node unchanged
  const fen = await byName(page, 'Fennick');
  await page.evaluate((id) => { GAME.attackNode(GAME.camp.nodes[id]); }, fen);
  await page.evaluate(() => { GAME.god = false; GAME.player.takeHit(GAME, 1e6, 0, 0, 0); });
  await wait(3000); await page.keyboard.press('Enter'); await wait(400);
  const lost = await page.evaluate((id) => ({ screen: GAME.screen, owner: GAME.camp.nodes[id].owner, result: GAME.battle.result }), fen);
  check('DONE: lose -> back to the map, the node unchanged', lost.screen === 'campaign' && lost.result === 'lose' && lost.owner === 'enemy', JSON.stringify(lost));
  await page.evaluate((id) => { GAME.attackNode(GAME.camp.nodes[id]); GAME.player.x = 20; }, fen);
  await page.keyboard.down('KeyA'); await wait(700); await page.keyboard.up('KeyA'); await wait(1200);
  await page.keyboard.press('Enter'); await wait(400);
  const ret = await page.evaluate((id) => ({ screen: GAME.screen, owner: GAME.camp.nodes[id].owner, result: GAME.battle.result }), fen);
  check('retreat (walk off your edge) -> back to the map, the node unchanged', ret.screen === 'campaign' && ret.result === 'retreat' && ret.owner === 'enemy', JSON.stringify(ret));

  // ---- out of reach: no attack
  const raven = await byName(page, 'Ravenmoor Castle');
  await page.evaluate(() => { GAME.mapSel = -1; });
  p = await nodeScreen(page, raven); q = toPage(b, p.x, p.y);
  await page.mouse.click(q.x, q.y); await wait(200);
  await page.keyboard.press('Enter'); await wait(300);
  const far = await page.evaluate((id) => ({ sel: GAME.mapSel, screen: GAME.screen, attack: GAME.mapButtons().find((x) => x.label === 'Attack'), toast: GAME.toastMsg }), raven);
  check('a node out of reach: Attack is disabled; Enter just says why', far.sel === raven && far.screen === 'campaign' && far.attack && !far.attack.enabled && /REACH/.test(far.toast), JSON.stringify(far));

  // ---- keyboard: arrows move the selection, Z zooms, WASD pans, Esc closes then leaves
  await page.keyboard.press('Escape'); await wait(150);
  const k0 = await page.evaluate(() => GAME.mapSel);
  await page.keyboard.press('ArrowLeft'); await wait(120);
  const k1 = await page.evaluate(() => GAME.mapSel);
  await page.keyboard.press('ArrowDown'); await wait(120);
  const k2 = await page.evaluate(() => GAME.mapSel);
  check('keyboard: Esc closes the panel; arrows pick a node, then step to another', k0 === -1 && k1 >= 0 && k2 >= 0 && k2 !== k1, JSON.stringify([k0, k1, k2]));
  await page.keyboard.press('KeyZ'); await wait(500);
  const z = await page.evaluate(() => ({ zoom: GAME.mapZoom, s: GAME.mapScale() }));
  const x0 = await page.evaluate(() => GAME.mapX);
  await page.keyboard.down('KeyD'); await wait(400); await page.keyboard.up('KeyD');
  const x1 = await page.evaluate(() => GAME.mapX);
  check('keyboard: Z zooms to the close-up; WASD pans', z.zoom === 1 && Math.abs(z.s - 0.95) < 0.01 && x1 > x0 + 50, JSON.stringify({ z, x0, x1 }));
  await page.screenshot({ path: OUT + '/p6-map-near.png' });
  // mouse drag pans, the wheel zooms back out
  const c0 = await page.evaluate(() => ({ x: GAME.mapX, y: GAME.mapY }));
  q = toPage(b, 300, 300);
  await page.mouse.move(q.x, q.y); await page.mouse.down(); await page.mouse.move(q.x + 120, q.y + 60, { steps: 6 }); await page.mouse.up(); await wait(150);
  const c1 = await page.evaluate(() => ({ x: GAME.mapX, y: GAME.mapY, sel: GAME.mapSel }));
  await page.mouse.wheel(0, 300); await wait(500);
  const zOut = await page.evaluate(() => GAME.mapZoom);
  check('mouse: dragging pans the map (and doesn\'t select); the wheel zooms out', c1.x < c0.x - 50 && c1.y < c0.y - 20 && zOut === 0, JSON.stringify({ c0, c1, zOut }));
  await page.keyboard.press('Escape'); await wait(100); await page.keyboard.press('Escape'); await wait(200);
  check('Esc with nothing selected -> title', (await page.evaluate(() => GAME.screen)) === 'title');

  // ---- taking a castle: the territory is yours (tint, count), and it survives a reload
  await page.keyboard.press('Enter'); await wait(400);
  const gw = await page.evaluate(() => GAME.camp.castleOf(2).id);
  await page.evaluate((id) => { GAME.attackNode(GAME.camp.nodes[id]); GAME.finishBattle('win'); }, gw);
  await wait(800); await page.keyboard.press('Enter'); await wait(400);
  const t2 = await page.evaluate(() => ({ held: GAME.camp.territoriesHeld('player'), banner: GAME.bannerSub, title: GAME.titleRows() }));
  await page.reload(); await wait(700);
  const rows = await page.evaluate(() => GAME.titleRows());
  await page.keyboard.press('Enter'); await wait(500);
  const after = await page.evaluate((id) => ({ screen: GAME.screen, castle: GAME.camp.nodes[id].owner, held: GAME.camp.territoriesHeld('player') }), gw);
  check('take a castle -> its territory is yours; reload -> Continue -> the map as you left it',
    t2.held === 2 && /Greywatch March is yours/.test(t2.banner) && rows[0] === 'Continue' && after.screen === 'campaign' && after.castle === 'player' && after.held === 2, JSON.stringify({ t2, rows, after }));
  await page.screenshot({ path: OUT + '/p6-map-after.png' });
  // a corrupt war save is ignored, not fatal
  const bad = await page.evaluate(() => { const s = JSON.parse(localStorage.getItem('aerial-conquest-slot1')); s.war = [[1, 9], 'x']; localStorage.setItem('aerial-conquest-slot1', JSON.stringify(s)); GAME.enterCampaign(); return { held: GAME.camp.territoriesHeld('player'), nodes: GAME.camp.nodes.length }; });
  check('a war save that doesn\'t fit the continent is dropped (fresh war), not fatal', bad.held === 1 && bad.nodes === 64, JSON.stringify(bad));

  // ---- map frame cost
  await page.evaluate(() => { GAME.perfWork.fill(0); GAME.perfIdx = 0; GAME.mapZoomTo = 1; });
  await wait(2500);
  const perf = await page.evaluate(() => { const n = GAME.perfIdx, w = Array.from(GAME.perfWork.slice(0, n)).sort((a, b) => a - b); return { frames: n, p50: +w[Math.floor(n * 0.5)].toFixed(2), p95: +w[Math.floor(n * 0.95)].toFixed(2) }; });
  check('map: drawing it costs little (desktop p95 frame work)', perf.frames > 100 && perf.p95 < 8, JSON.stringify(perf));

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
  check('phone: tap Start -> the campaign map', (await page.evaluate(() => GAME.screen)) === 'campaign');
  await page.screenshot({ path: OUT + '/p6-phone-far.png' });
  // DONE: tappable on the phone. Every node, at the whole-continent zoom, by a real tap on its icon
  const ids = await page.evaluate(() => GAME.camp.nodes.map((n) => n.id));
  const miss = [];
  for (const id of ids) {
    await page.evaluate(() => { GAME.mapSel = -1; });
    const p = await nodeScreen(page, id); s = toPage(b, p.x, p.y);
    await page.touchscreen.tap(s.x, s.y); await wait(60);
    if ((await page.evaluate(() => GAME.mapSel)) !== id) miss.push(id);
  }
  check('DONE (phone): every one of the 64 nodes selects with a tap on its icon, whole-continent zoom', miss.length === 0, miss.length ? 'missed ' + miss.join(',') : '64/64');
  const ic = await page.evaluate(() => {
    // how big things are on this screen (css px): node spacing and text
    const c = GAME.camp, r = document.getElementById('game').getBoundingClientRect(), k = r.width / 960;
    let gap = Infinity;
    for (const a of c.nodes) for (const m of c.nodes) if (a !== m) gap = Math.min(gap, Math.hypot(a.x - m.x, a.y - m.y) * GAME.mapScale(0) * k);
    return { cssPerLogical: +k.toFixed(2), minNodeGapCss: Math.round(gap), labelCss: +(10 * k).toFixed(1), nearGapCss: Math.round(gap / GAME.mapScale(0) * GAME.mapScale(1)) };
  });
  console.log('INFO phone sizes', JSON.stringify(ic));
  // tap a frontier node -> panel -> tap Attack -> battle
  const gwatch = await page.evaluate(() => GAME.camp.nodes.find((n) => n.name === 'Greywatch Watch').id);
  await page.evaluate(() => { GAME.mapSel = -1; });
  let p = await nodeScreen(page, gwatch); s = toPage(b, p.x, p.y);
  await page.touchscreen.tap(s.x, s.y); await wait(250);
  await page.screenshot({ path: OUT + '/p6-phone-panel.png' });
  const ab = await page.evaluate(() => { const n = GAME.mapButtons().length, a = GAME.mapButtonAt(0, n); return { x: a.x + (a.w || MAP_BTN.w) / 2, y: a.y + MAP_BTN.h / 2 }; });
  s = toPage(b, ab.x, ab.y); await page.touchscreen.tap(s.x, s.y); await wait(500);
  const st = await page.evaluate(() => ({ screen: GAME.screen, kind: GAME.battle.spec.kind, node: GAME.battle.spec.nodeId }));
  check('phone: tap a node -> panel -> tap Attack -> its battle', st.screen === 'battle' && st.kind === 'outpost' && st.node === gwatch, JSON.stringify(st));
  await page.evaluate(() => GAME.finishBattle('win')); await wait(900);
  s = toPage(b, 480, 300); await page.touchscreen.tap(s.x, s.y); await wait(400);
  const back = await page.evaluate((id) => ({ screen: GAME.screen, owner: GAME.camp.nodes[id].owner }), gwatch);
  check('phone: win -> tap the results -> map, node yours', back.screen === 'campaign' && back.owner === 'player', JSON.stringify(back));
  // pinch to zoom, drag to pan (two-finger / one-finger touch pointers)
  const touch = async (type, id, x, y) => page.evaluate(([type, id, x, y]) => {
    const cv = document.getElementById('game');
    cv.dispatchEvent(new PointerEvent(type, { pointerId: id, pointerType: 'touch', clientX: x, clientY: y, bubbles: true, cancelable: true, isPrimary: id === 11 }));
  }, [type, id, x, y]);
  await page.evaluate(() => { GAME.mapSel = -1; });
  const m = toPage(b, 400, 300);
  await touch('pointerdown', 11, m.x - 20, m.y); await touch('pointerdown', 12, m.x + 20, m.y);
  for (let k = 1; k <= 8; k++) { await touch('pointermove', 11, m.x - 20 - k * 12, m.y); await touch('pointermove', 12, m.x + 20 + k * 12, m.y); }
  await touch('pointerup', 11, m.x - 116, m.y); await touch('pointerup', 12, m.x + 116, m.y);
  await wait(500);
  const zin = await page.evaluate(() => ({ zoom: GAME.mapZoom, sel: GAME.mapSel }));
  const c0 = await page.evaluate(() => ({ x: GAME.mapX, y: GAME.mapY }));
  await touch('pointerdown', 13, m.x, m.y);
  for (let k = 1; k <= 6; k++) await touch('pointermove', 13, m.x - k * 20, m.y - k * 10);
  await touch('pointerup', 13, m.x - 120, m.y - 60); await wait(150);
  const c1 = await page.evaluate(() => ({ x: GAME.mapX, y: GAME.mapY, sel: GAME.mapSel }));
  check('phone: pinch zooms in; a one-finger drag pans without selecting', zin.zoom === 1 && zin.sel === -1 && c1.x > c0.x + 30 && c1.sel === -1, JSON.stringify({ zin, c0, c1 }));
  await page.screenshot({ path: OUT + '/p6-phone-near.png' });
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
