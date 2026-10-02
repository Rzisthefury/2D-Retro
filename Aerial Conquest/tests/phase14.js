// PLAN v2 Phase 14 (balance + index.html card) checks: headless Chromium.
// Usage: node phase14.js aerial-conquest.html shots
const { chromium } = require('playwright');
const path = require('path');
const { execFileSync } = require('child_process');
const GAME_FILE = path.resolve(process.argv[2]);
const URL = 'file://' + GAME_FILE;
const INDEX = path.resolve(path.dirname(GAME_FILE), '..', 'index.html');
const OUT = process.argv[3];
const results = [];
const check = (name, ok, info = '') => { results.push({ name, ok, info }); console.log((ok ? 'PASS ' : 'FAIL ') + name + (info ? '  — ' + info : '')); };
const wait = (ms) => new Promise((r) => setTimeout(r, ms));

(async () => {
  const browser = await chromium.launch();
  try {
    // ---- the landing page links the game
    const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
    await page.goto('file://' + INDEX); await wait(400);
    const card = await page.evaluate(() => { const a = [...document.querySelectorAll('a.game-card')].find((x) => /Aerial Conquest/.test(x.textContent)); return a ? { href: a.getAttribute('href'), text: a.querySelector('p').textContent } : null; });
    await page.screenshot({ path: OUT + '/p14-index.png' });
    if (card) { await page.click(`a[href="${card.href}"]`); await wait(900); }
    const landed = await page.evaluate(() => ({ title: document.title, game: typeof GAME !== 'undefined' && GAME.screen }));
    check('DONE: the landing page has an Aerial Conquest card, and clicking it opens the game', !!card && card.href === 'Aerial Conquest/aerial-conquest.html' && !/In development/.test(card.text) && landed.title === 'Aerial Conquest' && landed.game === 'title', JSON.stringify({ card, landed }));
    await page.close();

    // ---- balance rules: militia, the last castle
    const p2 = await browser.newPage({ viewport: { width: 1280, height: 800 } });
    await p2.goto(URL); await p2.evaluate(() => localStorage.clear()); await p2.reload(); await wait(600);
    const rules = await p2.evaluate(() => {
      GAME.startNewGame(1, 'normal'); GAME.story = null;
      const c = GAME.camp, w = GAME.war; w.tick = () => {};
      const v = c.territories[1].nodes.find((m) => m.type === 'village'), k = c.territories[1].nodes.find((m) => m.type === 'keep');
      c.capture(v); w.onCapture(v); c.capture(k); w.onCapture(k);
      const out = { village: troopTotal(w.defendersOf(v)), keep: troopTotal(w.defendersOf(k)), full: [w.militiaFull(v), w.militiaFull(k)] };
      // worn down, it drifts back at WAR.militiaRefill a minute
      w.nodeForce[v.id] = emptyReserve();
      w.tickAI = () => {}; for (let i = 0; i < 61 * 4; i++) w.__proto__.tick.call(w, 0.25, GAME.player);   // 61 s: 60 leaves float dust short of the 2nd
      out.after60 = troopTotal(w.defendersOf(v));
      // the Dominion never plans an offensive against your only castle
      w.tickAI = War.prototype.tickAI;
      c.nodes.forEach((n) => { if (n.owner === 'player' && n.type !== 'castle') { n.owner = 'enemy'; w.nodeForce[n.id] = null; } });
      w.garrison[c.castleOf(0).id] = emptyReserve();
      const plan = w.planOffensive();
      out.plan = plan ? c.nodes[plan.target].type + ':' + c.nodes[plan.target].owner : null;
      return out;
    });
    check('your villages and keeps raise a militia (6 / 12 at L1) that drifts back 2 a minute', rules.village === 6 && rules.keep === 12 && rules.full.join() === '6,12' && rules.after60 === 2, JSON.stringify(rules));
    check('the Dominion never targets your last castle (an empty Last Camp is no target)', rules.plan === null, JSON.stringify(rules));

    // ---- keep gates (Michael, after Phase 14): quicker to break; nothing swarms or is hit through them while they stand
    const kg = await p2.evaluate(() => {
      const out = {};
      const start = () => { GAME.startNewGame(1, 'normal'); GAME.story = null; GAME.war.tick = () => {}; const c = GAME.camp; GAME.attackNode(c.territories[1].nodes.find((m) => m.type === 'keep')); return GAME.battle; };
      // the first keep a new game meets (Millbrook, tier 2 while its outpost stands), knight + the 12-strong warband, autopilot
      let b = start(), g = b.gates[0];
      GAME.god = true; GAME.autopilot = true;
      while (g.alive && b.time < 300) GAME.simulate(1);
      out.gate = { hp: g.maxHp, tier: b.spec.tier, downAt: Math.round(b.time) };
      // your warband pressed against the gate: the garrison stays at its posts
      b = start(); g = b.gates[0]; const a = GAME.army, P = GAME.player, cy = b.h / 2; GAME.god = true; GAME.autopilot = false; g.hp = g.maxHp = 1e9;
      GAME.simulate(2);
      for (let t = 0; t < 30; t++) { P.x = g.x - 30; P.y = cy; for (let i = 0; i < a.cap; i++) if (a.alive[i] && a.team[i] === 0) { a.x[i] = g.x - 26 - Math.random() * 20; a.y[i] = cy + (Math.random() - 0.5) * 80; } GAME.simulate(0.5); }
      let near = 0; for (let i = 0; i < a.cap; i++) if (a.alive[i] && a.team[i] === 1 && b.zone(a.x[i], a.y[i]) === 1 && a.x[i] < g.x + 120 && Math.abs(a.y[i] - cy) < 120) near++;
      out.swarm = near;
      // point blank through the shut gate: swing and Whirl do nothing; once it's down they land
      const hit = (def) => { const j = a.spawn('sword', 'enemy', g.x + 22, cy, b.spec.tier), hp0 = a.hp[j]; P.x = g.x - 22; P.y = cy; P.facing = 0; a.rebuildGrid(GAME.field); GAME.hitMinions(def, P, new Set()); const r = hp0 - a.hp[j]; a.hurt(GAME, j, 1e9, 0, 0, false); return Math.round(r); };
      out.through = [hit(GROUND_COMBO[0]), hit(WHIRL)];
      g.damage(GAME, 1e9); out.open = hit(GROUND_COMBO[0]);
      GAME.enterCampaign();
      return out;
    });
    check('keep gate: Millbrook\'s (tier 2) falls inside 60 s to the knight and a new game\'s 12-strong warband', kg.gate.tier === 2 && kg.gate.downAt <= 60, JSON.stringify(kg.gate));
    check('keep gate: with your troops pressed against it, no defenders crowd its inside', kg.swarm === 0, JSON.stringify(kg));
    check('keep gate: point blank through it, a swing and a Whirl do no damage; once it\'s down the swing lands', kg.through[0] === 0 && kg.through[1] === 0 && kg.open > 0, JSON.stringify(kg));
    await p2.close();
  } catch (e) { check('script ran to completion', false, String(e && e.stack || e)); }
  await browser.close();

  // ---- a whole campaign on autopilot (Normal, Dominion AI on): campaign14.js
  const out = execFileSync('node', [path.join(__dirname, 'campaign14.js'), GAME_FILE, 'normal', '6'], { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024, env: process.env });
  const line = out.split('\n').find((l) => l.startsWith('SUMMARY '));
  const s = line ? JSON.parse(line.slice(8)) : null;
  if (s) console.log('INFO campaign: ' + JSON.stringify({ totalMin: s.totalMin, mapMin: s.mapMin, battleMin: s.battleMin, battles: s.battles, deaths: s.deaths, ranks: s.ranks, gear: s.gear, byKind: s.byKind }));
  check('DONE (autopilot): a Normal campaign is won, start to warlord, inside 4 hours', !!s && s.won && s.totalMin <= 240, s ? `${s.totalMin} min, ${s.deaths} deaths` : 'no summary');

  const fails = results.filter((r) => !r.ok);
  console.log(`\n${results.length - fails.length}/${results.length} passed`);
  process.exit(fails.length ? 1 : 0);
})();
