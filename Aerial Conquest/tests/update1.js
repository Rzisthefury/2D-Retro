// Post-Phase-14 update (Michael's playtest): invisible keep wall, a longer keep fight, earned spells, Thunder around the knight.
// Usage: node update1.js aerial-conquest.html shots
const { chromium } = require('playwright');
const path = require('path');
const URL = 'file://' + path.resolve(process.argv[2]);
const OUT = process.argv[3];
const results = [];
const check = (name, ok, info = '') => { results.push({ name, ok, info }); console.log((ok ? 'PASS ' : 'FAIL ') + name + (info ? '  — ' + info : '')); };
const wait = (ms) => new Promise((r) => setTimeout(r, ms));

(async () => {
  const browser = await chromium.launch();
  const errors = [];
  try {
    const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
    page.on('pageerror', (e) => errors.push(String(e)));
    await page.goto(URL); await page.evaluate(() => localStorage.clear()); await page.reload(); await wait(600);
    const fresh = () => page.evaluate(() => { GAME.startNewGame(1, 'normal'); GAME.story = null; GAME.war.tick = () => {}; });

    // ---- the invisible wall: a long wall whose anchor is off screen still draws
    await fresh();
    const wall = await page.evaluate(() => {
      const c = GAME.camp; GAME.attackNode(c.territories[1].nodes.find((m) => m.type === 'keep'));
      const b = GAME.battle, walls = b.structures.filter((s) => s.kind === 'wall');
      // the keep's right wall: vertical, anchored at its bottom end; look at its top half only
      const v = walls.filter((s) => s.h > s.w).sort((a, b2) => b2.x - a.x)[0];
      const drawn = new Set(); const orig = GAME.renderer.drawStructure.bind(GAME.renderer);
      GAME.renderer.drawStructure = (c2, s, g) => { drawn.add(s); return orig(c2, s, g); };
      GAME.camX = v.x - VIEW_W / 2; GAME.camY = v.y - v.h - 40;   // the wall's top on screen, its bottom anchor well below
      GAME.follow = () => {};
      GAME.renderer.draw(GAME);
      GAME.renderer.drawStructure = orig;
      return { anchorBelow: v.y > GAME.camY + VIEW_H + 160, drawn: drawn.has(v), h: v.h };
    });
    await page.screenshot({ path: OUT + '/u1-wall.png' });
    check('a keep wall with its anchor off screen but its body in view is drawn (was culled: the invisible wall)', wall.anchorBelow && wall.drawn, JSON.stringify(wall));
    await page.evaluate(() => GAME.enterCampaign());

    // ---- earned spells
    await fresh();
    const sp = await page.evaluate(() => {
      const c = GAME.camp, w = GAME.war, p = GAME.player, out = { start: p.spells.slice() };
      // a map battle: locked
      GAME.attackNode(c.territories[1].nodes.find((m) => m.type === 'village'));
      p.mp = p.stats.maxMp;
      const before = p.mp; const ok = p.tryCast(GAME, SPELLS[0]);
      out.lockedCast = { ok, mpSpent: before - p.mp, toast: GAME.toastMsg || GAME.toastText || '' };
      GAME.enterCampaign(); GAME.war.tick = () => {};
      const take = (n) => { c.capture(n); w.onCapture(n); GAME.syncWar(); return GAME.player.spells.slice().sort().join(); };
      out.afterKeep = take(c.territories[1].nodes.find((m) => m.type === 'keep'));
      out.afterCastle = take(c.castleOf(1));
      out.afterTier3 = take(c.castleOf(c.territories.find((t) => t.tier === 3).id));
      out.afterTier4 = take(c.castleOf(c.territories.find((t) => t.tier === 4).id));
      GAME.save();
      return out;
    });
    check('a new game knows no spells; casting one in a map battle is refused (no MP spent) with how to learn it', sp.start.length === 0 && !sp.lockedCast.ok && sp.lockedCast.mpSpent === 0, JSON.stringify(sp));
    check('earned by first captures: keep -> Fire, castle -> Cure, tier-3 castle -> Blizzard, tier-4 castle -> Thunder', sp.afterKeep === 'fire' && sp.afterCastle === 'cure,fire' && sp.afterTier3 === 'blizzard,cure,fire' && sp.afterTier4 === 'blizzard,cure,fire,thunder', JSON.stringify(sp));
    await page.reload(); await wait(600);
    const rl = await page.evaluate(() => { GAME.continueSlot(1); GAME.war.tick = () => {}; return GAME.player.spells.slice().sort().join(); });
    check('learned spells survive a reload', rl === 'blizzard,cure,fire,thunder', rl);
    const ng = await page.evaluate(() => { GAME.newGamePlus(); GAME.story = null; GAME.war.tick = () => {}; return { spells: GAME.player.spells.slice().sort().join(), ng: GAME.war.ng }; });
    check('...and New Game+ keeps them', ng.ng === 1 && ng.spells === 'blizzard,cure,fire,thunder', JSON.stringify(ng));
    const tf = await page.evaluate(() => { GAME.startNewGame(1, 'normal'); GAME.story = null; GAME.startBattle(testSpec()); return SPELLS.every((s) => GAME.spellKnown(s.id)); });
    check('the test field still has all four (for practice)', tf);

    // ---- Thunder: every enemy in a ring around the knight
    const th = await page.evaluate(() => {
      const out = {};
      for (const surge of [false, true]) {
        GAME.startNewGame(1, 'normal'); GAME.story = null; GAME.war.tick = () => {};
        const p = GAME.player; p.spells = ['thunder']; if (surge) p.talents.surge = true;
        GAME.battleFrom = 'map'; GAME.startBattle(fieldSpec());
        const a = GAME.army; a.clear(); for (const k of Object.keys(a.reserve[1])) a.reserve[1][k] = 0;
        GAME.enemies.length = 0;
        const near = [], mid = [], far = [];
        for (let k = 0; k < 16; k++) { const ang = k / 16 * Math.PI * 2; near.push(a.spawn('shield', 'enemy', p.x + Math.cos(ang) * 150, p.y + Math.sin(ang) * 150, 1)); }
        for (let k = 0; k < 6; k++) { const ang = k / 6 * Math.PI * 2; mid.push(a.spawn('shield', 'enemy', p.x + Math.cos(ang) * 250, p.y + Math.sin(ang) * 250, 1)); }
        for (let k = 0; k < 6; k++) { const ang = k / 6 * Math.PI * 2; far.push(a.spawn('shield', 'enemy', p.x + Math.cos(ang) * 340, p.y + Math.sin(ang) * 340, 1)); }
        a.rebuildGrid(GAME.field);
        const hp = (js) => js.map((j) => a.hp[j]);
        const n0 = hp(near), m0 = hp(mid), f0 = hp(far);
        p.mp = p.stats.maxMp; p.charging = false;
        GAME.resolveSpell ? GAME.resolveSpell(SPELLS[2], p) : null;
        if (!GAME.resolveSpell) { p.tryCast(GAME, SPELLS[2]); GAME.simulate(0.6); }
        const hitN = hp(near).filter((h, i) => h < n0[i]).length, hitM = hp(mid).filter((h, i) => h < m0[i]).length, hitF = hp(far).filter((h, i) => h < f0[i]).length;
        out[surge ? 'surge' : 'base'] = { near: `${hitN}/16`, mid: `${hitM}/6`, far: `${hitF}/6` };
      }
      return out;
    });
    check('Thunder hits every enemy within 200 px of you (16/16 at 150 px), none beyond (250 / 340 px)', th.base.near === '16/16' && th.base.mid === '0/6' && th.base.far === '0/6', JSON.stringify(th));
    check('Storm Surge widens the ring to 280 px (250 px now hit, 340 px still not)', th.surge.near === '16/16' && th.surge.mid === '6/6' && th.surge.far === '0/6', JSON.stringify(th));

    // ---- the keep: the Captain alone no longer wins it; the garrison must break
    const kp = await page.evaluate(() => {
      GAME.startNewGame(1, 'normal'); GAME.story = null; GAME.war.tick = () => {};
      const c = GAME.camp; GAME.attackNode(c.territories[1].nodes.find((m) => m.type === 'keep'));
      const b = GAME.battle; GAME.god = true;
      for (const g of b.gates) g.damage(GAME, 1e9);
      b.captain.applyDamage(GAME, 1e8, 0, 0, 0, 0); GAME.simulate(0.5);
      const mid = { result: b.result, objective: b.objective, foes: GAME.foeStrength(), start: b.startFoes };
      // break the garrison: kill down to under 25%
      const a = GAME.army;
      for (const k of Object.keys(a.reserve[1])) a.reserve[1][k] = 0;
      for (let i = 0; i < a.cap; i++) if (a.alive[i] && a.team[i] === 1) a.hurt(GAME, i, 1e9, 0, 0, false);
      for (const e of GAME.enemies) if (e.team === 'enemy') e.applyDamage(GAME, 1e8, 0, 0, 0, 0);
      GAME.simulate(0.5);
      return { mid, end: { result: b.result, outcome: b.outcome } };
    });
    check('keep: Captain down with the garrison standing is not the win ("Break the garrison"); breaking it is', kp.mid.result === null && kp.mid.objective === 'Break the garrison' && kp.end.result === 'win' && /garrison broken/.test(kp.end.outcome), JSON.stringify(kp));
    await page.evaluate(() => GAME.enterCampaign());
    const kt = await page.evaluate(() => {
      const out = [];
      for (let r = 0; r < 3; r++) {
        GAME.startNewGame(1, 'normal'); GAME.story = null; GAME.war.tick = () => {};
        const c = GAME.camp, n = c.territories[1].nodes.find((m) => m.type === 'keep');
        c.territories[1].nodes.find((m) => m.type === 'outpost').owner = 'player';
        GAME.war.warband = GAME.war.recruitList(30, 0); const p = GAME.player; p.upgrades = { vitality: 1, might: 1, arcana: 1 }; p.refreshStats(true);
        GAME.attackNode(n); const b = GAME.battle; GAME.god = false; GAME.autopilot = true;
        GAME.simulate(600); out.push({ r: b.result, t: Math.round(b.time), foes: b.startFoes });
        GAME.enterCampaign();
      }
      return out;
    });
    check('keep timing: Millbrook (tier 1) with ~30 troops is won in 2-4 min (PLAN: ~3 min)', kt.every((k) => k.r === 'win' && k.t >= 120 && k.t <= 240), JSON.stringify(kt));
    check('no page errors', errors.length === 0, errors.slice(0, 5).join(' | '));
  } catch (e) { check('script ran to completion', false, String(e && e.stack || e)); }
  await browser.close();
  const fails = results.filter((r) => !r.ok);
  console.log(`\n${results.length - fails.length}/${results.length} passed`);
  process.exit(fails.length ? 1 : 0);
})();
