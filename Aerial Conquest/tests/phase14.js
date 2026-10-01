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
