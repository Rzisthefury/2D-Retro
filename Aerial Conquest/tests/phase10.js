// PLAN v2 Phase 10 (generals and loyalty) checks: headless Chromium, desktop + emulated iPhone 13.
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
/** A fresh war, the live map frozen (tests drive war time with W.t), the Dominion AI off. */
const fresh = (page) => page.evaluate(() => {
  localStorage.removeItem('aerial-conquest-slot1'); GAME.resetSave(); GAME.enterCampaign(); GAME.mapMode = 'browse';
  const w = GAME.war; if (!w._tick) { w._tick = w.tick; w.tick = () => {}; w.tickAI = () => {}; }
  w.convoys = []; w.enemyConvoyT = 1e9; for (const n of GAME.camp.nodes) w.convoyT[n.id] = 1e9; WAR.reinforceChance = 0;
});
const T = (page, s) => page.evaluate((s) => { const w = GAME.war; for (let k = 0; k < Math.round(s * 60); k++) w._tick.call(w, 1 / 60, GAME.player); }, s);
/** Back to the map after a results screen (and re-freeze). */
async function back(page) { await wait(800); await page.keyboard.press('Enter'); await wait(300); await page.evaluate(() => { const w = GAME.war; if (!w._tick) { w._tick = w.tick; w.tick = () => {}; w.tickAI = () => {}; } }); }

async function desktop(browser) {
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 } });
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(String(e)));
  page.on('console', (m) => { if (m.type() === 'error' && !ignorable(m.text())) errors.push(m.text()); });
  await page.goto(URL); await page.evaluate(() => localStorage.clear()); await page.reload(); await wait(700);
  await titleStart(page);
  // the playtest update grew keep garrisons (50 -> 120); these sim / join checks were sized for 50, and test mechanics, not keep size
  await page.evaluate(() => { WAR.keepGarrison = 50; });
  const b = await geom(page);
  await fresh(page);

  // ---- the Lords (PLAN 9.1)
  const lords = await page.evaluate(() => {
    const w = GAME.war, c = GAME.camp;
    return { n: w.generals.length, all: w.generals.every((g) => g.status === 'lord' && c.nodes[g.at].type === 'castle' && c.nodes[g.at].territory === +g.id.split('-')[1]),
      patterns: [...new Set(w.generals.map((g) => g.pattern))].sort(), levels: w.generals.map((g) => [c.territories[+g.id.split('-')[1]].tier, g.level]),
      capital: !!w.lordAt(c.castleOf(WAR.capitalTerritory).id), start: !!w.lordAt(c.castleOf(0).id) };
  });
  check('a Lord in every territory castle but yours and the warlord\'s: 10, four patterns, level by tier', lords.n === 10 && lords.all && lords.patterns.join() === 'brute,skylord,sorcerer,stalker' && lords.levels.every(([t, l]) => l === [4, 7, 10, 13, 16][t - 1]) && !lords.capital && !lords.start, JSON.stringify(lords));
  const lb = await page.evaluate(() => {
    const c = GAME.camp, n = c.castleOf(1), lord = GAME.war.lordAt(n.id);
    GAME.attackNode(n);
    const e = GAME.battle.lord;
    const r = { name: e.def.name, want: lord.name, pattern: e.boss.pattern, wantP: lord.pattern, level: e.level, wantL: lord.level, moves: e.boss.moves.join() };
    GAME.enterCampaign(); return r;
  });
  await page.evaluate(() => { const w = GAME.war; if (!w._tick) { w._tick = w.tick; w.tick = () => {}; w.tickAI = () => {}; } });
  check('a castle siege fields that castle\'s own Lord (name, pattern, moves, level)', lb.name === lb.want && lb.pattern === lb.wantP && lb.level === lb.wantL, JSON.stringify(lb));

  // ---- recruit / release / throne first
  const siege = async (lordFirst) => {
    await page.evaluate((lordFirst) => {
      const n = GAME.camp.castleOf(1); GAME.attackNode(n); GAME.god = true;
      if (lordFirst) GAME.battle.lord.applyDamage(GAME, 1e7, 0, 0, 0, 0);
      GAME.battle.throne.damage(GAME, 1e9); GAME.simulate(0.5);
    }, lordFirst);
    await wait(800);
  };
  await siege(true);
  const rc0 = await page.evaluate(() => ({ pending: GAME.pendingRecruit, gold: GAME.player.gold, spoils: GAME.battle.spoils.gold }));
  await page.keyboard.press('Enter'); await wait(250);
  const rc1 = await page.evaluate(() => { const g = GAME.war.general('lord-1'); return { pending: GAME.pendingRecruit, status: g.status, loyalty: g.loyalty, level: g.level, recruited: g.recruited, banner: GAME.bannerMsg }; });
  await back(page);
  check('DONE: beat the Lord first -> Recruit (Enter) -> a general at loyalty 50, their Lord\'s level, in reserve', rc0.pending === 'lord-1' && rc1.pending === null && rc1.status === 'reserve' && rc1.loyalty === 50 && rc1.level === 4 && rc1.recruited === 1 && /JOINS YOU/.test(rc1.banner), JSON.stringify({ rc0, rc1 }));
  await fresh(page);
  await siege(true);
  const rel0 = await page.evaluate(() => ({ gold: GAME.player.gold, spoils: GAME.battle.spoils.gold }));
  await page.keyboard.press('ArrowRight'); await wait(60);
  const pick = await page.evaluate(() => GAME.recruitPick);
  const rb = await page.evaluate(() => { const r = RECRUIT_BTN; return { x: r.x0 + r.w + r.gap + r.w / 2, y: r.y + r.h / 2 }; });
  let q = toPage(b, rb.x, rb.y); await page.mouse.click(q.x, q.y); await wait(200);
  const rel1 = await page.evaluate(() => ({ gold: GAME.player.gold, spoils: GAME.battle.spoils.gold, status: GAME.war.general('lord-1').status }));
  await back(page);
  check('...or Release (tap) -> double spoils, the Lord gone', pick === 1 && rel1.gold === rel0.gold + rel0.spoils && rel1.spoils === rel0.spoils * 2 && rel1.status === 'gone', JSON.stringify({ rel0, rel1 }));
  await fresh(page);
  await siege(false);
  const tf = await page.evaluate(() => ({ pending: GAME.pendingRecruit, status: GAME.war.general('lord-1').status }));
  await back(page);
  check('throne first -> the Lord flees: no Recruit, gone', tf.pending === null && tf.status === 'gone', JSON.stringify(tf));

  // ---- cap, assignment, command
  await fresh(page);
  const cap = await page.evaluate(() => {
    const w = GAME.war, c = GAME.camp, g1 = w.general('lord-1'), g2 = w.general('lord-2');
    w.recruit(g1); w.recruit(g2);
    w.garrison[0] = w.recruitList(40, 0);
    const r = { cap1: w.generalCap(), a1: w.assignCastle(0, g1.id) };
    // the second can't lead an army while the first holds your only castle
    const a = w.sendArmy(c.nodes[0], w.recruitList(5, 0), c.nodes.find((n) => n.name === 'Millbrook Keep'), g2.id);
    r.a2 = !!(a && a.general); r.at = w.generalAt(0).id; w.armies = []; w.garrison[0] = w.recruitList(40, 0);
    const n = c.castleOf(1); c.capture(n); w.onCapture(n);
    r.cap2 = w.generalCap(); r.b = w.assignCastle(n.id, g2.id); r.active = w.activeGenerals();
    c.load(c.save());
    return r;
  });
  check('active cap: 1 per castle you hold (a second general waits in reserve until you hold a second castle)', cap.cap1 === 1 && cap.a1 && !cap.a2 && cap.at === 'lord-1' && cap.cap2 === 2 && cap.b && cap.active === 2, JSON.stringify(cap));
  await fresh(page);
  const cmd = await page.evaluate(() => {
    const w = GAME.war, g = w.general('lord-3'); w.recruit(g); g.level = 10;
    const u = { ...emptyReserve(), sword: 50 };
    return { cmd: +command(g).toFixed(2), withG: +w.mult('player', g.id).toFixed(3), without: +w.mult('player', null).toFixed(3), cap: command({ ...g, level: 20 }) };
  });
  check('command = 0.10 + 0.01 x level (L10: +20%, max 0.30): an army with a general x1.2, without x0.8 (both x0.9 your troops)', cmd.cmd === 0.2 && cmd.withG === 1.08 && cmd.without === 0.72 && cmd.cap === 0.3, JSON.stringify(cmd));
  const nodeCmd = await page.evaluate(() => {
    const w = GAME.war, c = GAME.camp, g = w.general('lord-1'); w.recruit(g); w.garrison[0] = w.recruitList(30, 0);
    const before = w.nodeStrength(c.nodes[0]); w.assignCastle(0, g.id); const after = w.nodeStrength(c.nodes[0]);
    const lordCastle = c.castleOf(2), lordStr = w.nodeStrength(lordCastle), lord = w.lordAt(lordCastle.id);
    return { ratio: +(after / before).toFixed(3), want: +(1 + command(g)).toFixed(3), lordAdds: !!lord };
  });
  check('a general in your castle adds their command to its defense (PLAN 9.2)', nodeCmd.ratio === nodeCmd.want, JSON.stringify(nodeCmd));

  // ---- PLAN 9.4, row by row
  await fresh(page);
  const rows = await page.evaluate(() => {
    const w = GAME.war, c = GAME.camp, t = w._tick, out = {};
    const g = w.general('lord-4'); w.recruit(g);
    // a sim victory with the general present: +6 (and a level)
    w.garrison[0] = w.recruitList(150, 0);
    const keep = c.nodes.find((n) => n.name === 'Millbrook Keep');
    let a = w.sendArmy(c.nodes[0], w.recruitList(140, 0), keep, g.id);
    const l0 = g.loyalty, lv0 = g.level;
    for (let k = 0; k < 60 * 300 && keep.owner === 'enemy'; k++) t.call(w, 1 / 60, GAME.player);
    out.win = { owner: keep.owner, d: g.loyalty - l0, level: g.level - lv0 };
    for (let k = 0; k < 60 * 120 && w.armies.length; k++) t.call(w, 1 / 60, GAME.player);
    // a sim defeat with the general present: -10, and captured -15, held at the nearest Dominion castle
    out.status0 = g.status;
    w.garrison[0] = w.recruitList(20, 0);
    const l1 = g.loyalty;
    a = w.sendArmy(c.nodes[0], w.recruitList(10, 0), c.castleOf(1), g.id);
    for (let k = 0; k < 60 * 400 && g.status === 'army'; k++) t.call(w, 1 / 60, GAME.player);
    out.lose = { d: +(g.loyalty - l1).toFixed(2), status: g.status, at: g.at >= 0 ? c.nodes[g.at].name : null };
    // captive: -1 per 20 s
    const l2 = g.loyalty;
    for (let k = 0; k < 60 * 60; k++) t.call(w, 1 / 60, GAME.player);
    out.drain = +(l2 - g.loyalty).toFixed(2);
    // rescued: +25
    const l3 = g.loyalty; w.rescue(g);
    out.rescue = { d: +(g.loyalty - l3).toFixed(2), status: g.status };
    // Warlord's Presence: gains x1.5
    GAME.player.talents.presence = true; w.loyaltyMult = GAME.player.hasT('presence') ? WAR.presenceMult : 1;
    const l4 = g.loyalty; w.loyalty(g, WAR.loyaltyWin); out.presence = +(g.loyalty - l4).toFixed(2);
    const l5 = g.loyalty; w.loyalty(g, WAR.loyaltyDefeat); out.presenceLoss = +(g.loyalty - l5).toFixed(2);
    delete GAME.player.talents.presence; w.loyaltyMult = 1;
    return out;
  });
  check('PLAN 9.4 row: victory with the general present (sim) +6, and they level', rows.win.owner === 'player' && rows.win.d === 6 && rows.win.level === 1, JSON.stringify(rows.win));
  check('PLAN 9.4 rows: defeat with the general present -10, captured -15 (held at the nearest Dominion castle)', rows.status0 === 'reserve' && rows.lose.d === -25 && rows.lose.status === 'captive' && rows.lose.at, JSON.stringify(rows.lose));
  check('PLAN 9.4 row: then -1 per 20 s captive (60 s: -3)', rows.drain === 3, JSON.stringify(rows.drain));
  check('PLAN 9.4 row: rescued by you +25, back in the reserve', rows.rescue.d === 25 && rows.rescue.status === 'reserve', JSON.stringify(rows.rescue));
  check('PLAN 9.4 row: Warlord\'s Presence: gains x1.5 (+6 -> +9), losses unchanged', rows.presence === 9 && rows.presenceLoss === -10, JSON.stringify(rows));

  // live: +12 (fighting beside you) replaces +6; the general is on the field
  await fresh(page);
  const live = await page.evaluate(() => {
    const w = GAME.war, c = GAME.camp, t = w._tick, g = w.general('lord-4'); w.recruit(g);
    w.garrison[0] = w.recruitList(150, 0);
    const keep = c.nodes.find((n) => n.name === 'Millbrook Keep');
    w.sendArmy(c.nodes[0], w.recruitList(40, 0), keep, g.id);
    for (let k = 0; k < 60 * 200 && !w.fights.length; k++) t.call(w, 1 / 60, GAME.player);
    const f = w.fights[0], l0 = g.loyalty;
    GAME.joinFight(f);
    const e = GAME.battleGeneral;
    const r = { onField: !!e && e.team === 'player' && e.generalId === g.id && !!e.boss && e.def.name === g.name, l0 };
    // knocked down mid-battle, then the battle is won: they get back up (not dead, not captured)
    e.applyDamage(GAME, 1e7, 0, 0, 0, 0);
    r.downBanner = GAME.bannerMsg;
    GAME.finishBattle('win');
    r.d = g.loyalty - l0; r.status = g.status;
    return r;
  });
  await back(page);
  check('PLAN 9.4 row: victory where you and the general fight in the same live battle: +12, replacing the +6; on the field as an allied boss', live.onField && live.d === 12 && /IS DOWN/.test(live.downBanner) && live.status !== 'captive', JSON.stringify(live));
  const liveLose = await page.evaluate(() => {
    const w = GAME.war, c = GAME.camp, t = w._tick, g = w.general('lord-4');
    g.status = 'reserve'; g.army = -1; w.armies = []; w.fights = [];
    w.garrison[0] = w.recruitList(150, 0);
    w.sendArmy(c.nodes[0], w.recruitList(40, 0), c.castleOf(1), g.id);
    for (let k = 0; k < 60 * 200 && !w.fights.length; k++) t.call(w, 1 / 60, GAME.player);
    const l0 = g.loyalty; GAME.joinFight(w.fights[0]); GAME.finishBattle('lose');
    return { d: g.loyalty - l0, status: g.status };
  });
  await back(page);
  check('a live defeat with the general: -10 and captured -15', liveLose.d === -25 && liveLose.status === 'captive', JSON.stringify(liveLose));

  // ---- the <=25 warning
  await fresh(page);
  const warn = await page.evaluate(() => {
    const w = GAME.war, g = w.general('lord-2'); w.recruit(g); g.loyalty = 30;
    w.loyalty(g, -6);
    const ev = w.events.find((e) => e.kind === 'lowLoyalty'); const n1 = w.events.filter((e) => e.kind === 'lowLoyalty').length;
    w.loyalty(g, -1); const n2 = w.events.filter((e) => e.kind === 'lowLoyalty').length;
    w.tick = w._tick; return { loyalty: g.loyalty, ev: !!ev, once: n1 === 1 && n2 === 1 };
  });
  await wait(250);
  const wb = await page.evaluate(() => { GAME.war.tick = () => {}; GAME.mapMode = 'generals'; return { msg: GAME.bannerMsg, sub: GAME.bannerSub }; });
  await wait(200); await page.screenshot({ path: OUT + '/p10-warning.png' });
  check('PLAN 9.4: at 25 or under -> a warning with the general\'s line (once), red in the roster', warn.ev && warn.once && warn.loyalty === 23 && /LOYALTY 23/.test(wb.msg) && /whose war/.test(wb.sub), JSON.stringify({ warn, wb }));

  // ---- DONE: defection
  await fresh(page);
  const dc = await page.evaluate(() => {
    const w = GAME.war, c = GAME.camp, t = w._tick, g = w.general('lord-1'); w.recruit(g);
    const n = c.castleOf(1); c.capture(n); w.onCapture(n);
    w.garrison[n.id] = w.recruitList(33, 0); w.assignCastle(n.id, g.id);
    g.loyalty = 0.5; w.loyalty(g, -1);
    t.call(w, 1 / 60, GAME.player);
    return { owner: n.owner, status: g.status, lordHere: w.lordAt(n.id) && w.lordAt(n.id).id, theirGarrison: troopTotal(w.defendersOf(n)), yours: w.garrison[n.id], banner: w.events.some((e) => e.kind === 'defected') };
  });
  check('DONE: a garrisoned general at 0 defects: the castle AND its garrison flip to the Dominion, and they are its Lord again', dc.owner === 'enemy' && dc.status === 'lord' && dc.lordHere === 'lord-1' && dc.theirGarrison === 33 && dc.yours === null && dc.banner, JSON.stringify(dc));
  const da = await page.evaluate(() => {
    const w = GAME.war, c = GAME.camp, t = w._tick, g = w.general('lord-2'); w.recruit(g);
    w.garrison[0] = w.recruitList(60, 0);
    const a = w.sendArmy(c.nodes[0], w.recruitList(25, 0), c.castleOf(2), g.id);
    t.call(w, 1, GAME.player);
    g.loyalty = 0; t.call(w, 1 / 60, GAME.player);
    return { team: a.team, status: g.status, heading: c.nodes[a.target].owner, n: troopTotal(a.units) };
  });
  check('DONE: a general leading an army at 0 defects: the army joins the Dominion', da.team === 'enemy' && da.status === 'lord' && da.heading === 'enemy' && da.n === 25, JSON.stringify(da));
  const dcap = await page.evaluate(() => {
    const w = GAME.war, c = GAME.camp, t = w._tick, g = w.general('lord-3'); w.recruit(g);
    const cell = c.castleOf(4).id; g.status = 'captive'; g.at = cell; g.loyalty = 0.5;
    for (let k = 0; k < 60 * 21; k++) t.call(w, 1 / 60, GAME.player);
    return { status: g.status, lordAt: w.lordAt(cell) && w.lordAt(cell).id };
  });
  check('DONE: a captive general at 0 joins the castle holding them (its Lord now)', dcap.status === 'lord' && dcap.lordAt === 'lord-3', JSON.stringify(dcap));
  // never mid-battle: the check runs on the map only
  const mid = await page.evaluate(() => {
    const w = GAME.war, c = GAME.camp, g = w.general('lord-5'); w.recruit(g); w.assignCastle(0, g.id);
    g.loyalty = 0;
    GAME.war.tick = GAME.war._tick;   // the live game loop runs from here
    GAME.attackNode(c.nodes.find((n) => n.name === 'Fennick'));
    return { screen: GAME.screen };
  });
  await wait(1500);
  const midS = await page.evaluate(() => ({ status: GAME.war.general('lord-5').status, owner: GAME.camp.nodes[0].owner, screen: GAME.screen }));
  await page.evaluate(() => { GAME.god = true; GAME.finishBattle('win'); });
  await wait(800); await page.keyboard.press('Enter'); await wait(500);
  const after = await page.evaluate(() => ({ status: GAME.war.general('lord-5').status, owner: GAME.camp.nodes[0].owner, screen: GAME.screen }));
  check('never mid-battle: at 0 during a battle they hold; back on the map, they defect (with the Last Camp)', midS.screen === 'battle' && midS.status === 'castle' && midS.owner === 'player' && after.screen === 'campaign' && after.status === 'lord' && after.owner === 'enemy', JSON.stringify({ midS, after }));
  await page.evaluate(() => { const w = GAME.war; w._tick = w.tick; w.tick = () => {}; w.tickAI = () => {}; });

  // ---- DONE: re-recruit starts at 30
  await fresh(page);
  const rr = await page.evaluate(() => {
    const w = GAME.war, c = GAME.camp, t = w._tick, g = w.general('lord-1'); w.recruit(g);
    const n = c.castleOf(1); c.capture(n); w.onCapture(n); w.assignCastle(n.id, g.id);
    g.loyalty = 0; t.call(w, 1 / 60, GAME.player);
    return { status: g.status, owner: n.owner, lord: w.lordAt(n.id) && w.lordAt(n.id).id };
  });
  await page.evaluate(() => { const n = GAME.camp.castleOf(1); GAME.attackNode(n); GAME.god = true; GAME.battle.lord.applyDamage(GAME, 1e7, 0, 0, 0, 0); GAME.battle.throne.damage(GAME, 1e9); GAME.simulate(0.5); });
  await wait(800);
  const rr1 = await page.evaluate(() => ({ pending: GAME.pendingRecruit, lordName: GAME.battle.spec.lordName }));
  await page.keyboard.press('Enter'); await wait(200);
  const rr2 = await page.evaluate(() => { const g = GAME.war.general('lord-1'); return { status: g.status, loyalty: g.loyalty, recruited: g.recruited }; });
  await back(page);
  check('DONE: the defector holds their castle again; beaten first in its siege and recruited -> loyalty starts at 30', rr.status === 'lord' && rr.owner === 'enemy' && rr.lord === 'lord-1' && rr1.pending === 'lord-1' && rr2.status === 'reserve' && rr2.loyalty === 30 && rr2.recruited === 2, JSON.stringify({ rr, rr1, rr2 }));

  // ---- capture and rescue: the cage, Rescue raid, taking the castle
  await fresh(page);
  const cr = await page.evaluate(() => {
    const w = GAME.war, c = GAME.camp, g = w.general('lord-3'); w.recruit(g);
    const cell = c.castleOf(1); g.status = 'captive'; g.at = cell.id; g.loyalty = 40;
    GAME.mapSel = cell.id;
    return { btns: GAME.mapButtons().map((x) => x.label + (x.enabled ? '' : '(off)')) };
  });
  await wait(150); await page.screenshot({ path: OUT + '/p10-cage.png' });
  let m = await btn(page, 'Rescue raid'); q = toPage(b, m.x, m.y); await page.mouse.click(q.x, q.y); await wait(300);
  const raid = await page.evaluate(() => ({ kind: GAME.battle.spec.kind, gen: GAME.battle.spec.generalName, id: GAME.battle.spec.rescueId }));
  await page.evaluate(() => { const b = GAME.battle, cl = b.cell; GAME.god = true; for (const e of GAME.enemies) if (e.team === 'enemy') e.applyDamage(GAME, 1e7, 0, 0, 0, 0); GAME.army.reserve[TEAM_ENEMY] = emptyReserve(); for (let i = 0; i < GAME.army.cap; i++) if (GAME.army.alive[i] && GAME.army.team[i] === TEAM_ENEMY) GAME.army.hurt(GAME, i, 1e7, 0, 0, false); GAME.player.x = cl.x; GAME.player.y = cl.y + 20; GAME.simulate(9); });
  const freed = await page.evaluate(() => ({ ally: GAME.battle.general && GAME.battle.general.generalId, name: GAME.battle.general && GAME.battle.general.def.name }));
  await page.evaluate(() => { GAME.player.x = 20; GAME.player.y = GAME.battle.h / 2; GAME.battle.general.x = 100; GAME.battle.general.y = GAME.player.y; });
  await page.keyboard.down('KeyA'); await wait(700); await page.keyboard.up('KeyA'); await wait(200);
  const rres = await page.evaluate(() => ({ result: GAME.battle.result, outcome: GAME.battle.outcome, status: GAME.war.general('lord-3').status, loyalty: GAME.war.general('lord-3').loyalty, castle: GAME.camp.castleOf(1).owner }));
  await back(page);
  check('PLAN 9.3: a Dominion castle holding your general shows a Rescue raid; it fields the real general; out alive -> rescued +25, castle untaken',
    cr.btns.some((x) => x === 'Rescue raid: Lord Ysolde') && raid.kind === 'rescue' && raid.id === 'lord-3' && freed.ally === 'lord-3' && rres.result === 'win' && rres.status === 'reserve' && rres.loyalty === 65 && rres.castle === 'enemy', JSON.stringify({ cr, raid, freed, rres }));
  const take = await page.evaluate(() => {
    const w = GAME.war, c = GAME.camp, g = w.general('lord-3'); const cell = c.castleOf(1); g.status = 'captive'; g.at = cell.id; g.loyalty = 40;
    GAME.attackNode(cell); GAME.god = true; GAME.battle.throne.damage(GAME, 1e9); GAME.simulate(0.5);
    return { status: g.status, loyalty: g.loyalty, notes: GAME.battle.notes.join(' | ') };
  });
  await back(page);
  check('PLAN 9.3: taking the castle that holds them frees them too (+25)', take.status === 'reserve' && take.loyalty === 65 && /freed/.test(take.notes), JSON.stringify(take));

  // ---- the map: assign from the castle panel, lead from the send panel, the roster by G
  await fresh(page);
  await page.evaluate(() => { const w = GAME.war; w.recruit(w.general('lord-1')); w.garrison[0] = w.recruitList(40, 0); GAME.mapSel = 0; });
  m = await btn(page, 'General'); q = toPage(b, m.x, m.y); await page.mouse.click(q.x, q.y); await wait(120);
  const asg = await page.evaluate(() => ({ at: GAME.war.generalAt(0) && GAME.war.generalAt(0).id, label: GAME.mapButtons()[0].label }));
  await page.mouse.click(q.x, q.y); await wait(120);
  const unasg = await page.evaluate(() => !!GAME.war.generalAt(0));
  m = await btn(page, 'Send army'); q = toPage(b, m.x, m.y); await page.mouse.click(q.x, q.y); await wait(120);
  m = await btn(page, 'General'); q = toPage(b, m.x, m.y); await page.mouse.click(q.x, q.y); await wait(120);
  m = await btn(page, 'Choose target'); q = toPage(b, m.x, m.y); await page.mouse.click(q.x, q.y); await wait(120);
  const tgt = await page.evaluate(() => { const n = GAME.camp.nodes.find((x) => x.name === 'Millbrook Keep'); return GAME.mapToScreen(n.x, n.y); });
  q = toPage(b, tgt.x, tgt.y); await page.mouse.click(q.x, q.y); await wait(150);
  const led = await page.evaluate(() => { const a = GAME.war.armies[0]; return a && { general: a.general, status: GAME.war.general('lord-1').status }; });
  await page.keyboard.press('KeyG'); await wait(150);
  const roster = await page.evaluate(() => GAME.mapMode);
  check('map: the castle panel\'s General button assigns / unassigns; the Send panel\'s General picker leads the army; G opens the roster',
    asg.at === 'lord-1' && /Lord Maud/.test(asg.label) && !unasg && led && led.general === 'lord-1' && led.status === 'army' && roster === 'generals', JSON.stringify({ asg, unasg, led, roster }));

  // ---- saves
  const sv = await page.evaluate(() => { const w = GAME.war; w.general('lord-2').status = 'captive'; w.general('lord-2').at = GAME.camp.castleOf(3).id; w.general('lord-2').loyalty = 17.5; GAME.save(); return w.generals.map((g) => [g.id, g.status, g.at, Math.round(g.loyalty), g.level, g.recruited]); });
  await page.reload(); await wait(600); await page.keyboard.press('Enter'); await wait(300);
  const sv2 = await page.evaluate(() => GAME.war.generals.map((g) => [g.id, g.status, g.at, Math.round(g.loyalty), g.level, g.recruited]));
  check('generals (status, place, loyalty, level, times recruited) and the army a general leads survive a reload', JSON.stringify(sv) === JSON.stringify(sv2), JSON.stringify(sv2));
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
  await page.evaluate(() => { GAME.war.recruit(GAME.war.general('lord-1')); });
  s = toPage(b, MAP_GEN_HIT_X(), 22);
  check('phone: no page errors', errors.length === 0, errors.slice(0, 5).join(' | '));
  await ctx.close();
}
function MAP_GEN_HIT_X() { return 560 + 70; }

(async () => {
  const browser = await chromium.launch();
  try { await desktop(browser); await phoneRoster(browser); }
  catch (e) { check('script ran to completion', false, String(e && e.stack || e)); }
  await browser.close();
  const fails = results.filter((r) => !r.ok);
  console.log(`\n${results.length - fails.length}/${results.length} passed`);
  process.exit(fails.length ? 1 : 0);
})();

async function phoneRoster(browser) {
  const ctx = await browser.newContext({ ...devices['iPhone 13 landscape'] });
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(String(e)));
  page.on('console', (m) => { if (m.type() === 'error' && !ignorable(m.text())) errors.push(m.text()); });
  await page.goto(URL); await page.evaluate(() => localStorage.clear()); await page.reload(); await wait(800);
  const b = await geom(page);
  let s; await titleTapStart(page);
  await page.evaluate(() => { GAME.war.recruit(GAME.war.general('lord-1')); });
  const hit = await page.evaluate(() => ({ x: MAP_GEN_HIT.x + MAP_GEN_HIT.w / 2, y: 22 }));
  s = toPage(b, hit.x, hit.y); await page.touchscreen.tap(s.x, s.y); await wait(250);
  const mode = await page.evaluate(() => GAME.mapMode);
  await page.screenshot({ path: OUT + '/p10-phone-roster.png' });
  check('phone: tap the top bar\'s generals button -> the roster', mode === 'generals', mode);
  check('phone: no page errors', errors.length === 0, errors.slice(0, 5).join(' | '));
  await ctx.close();
}
