// PLAN v2 Phase 1 (teams) checks: headless Chromium, desktop + emulated iPhone 13.
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

/** Clear the field and place units. spec: [{id, team, dx, dy}] relative to the knight. Returns their indices. */
async function setup(page, spec, opts = {}) {
  return page.evaluate(([spec, opts]) => {
    const p = GAME.player;
    GAME.enemies.length = 0; GAME.army.clear(); GAME.projectiles.length = 0; GAME.waveIntro = 0; GAME.respawnT = 999;
    p.lock = null; p.state = 'idle'; p.iframes = 0;
    GAME.god = opts.god !== false;
    if (opts.knightAt) { p.x = opts.knightAt[0]; p.y = opts.knightAt[1]; }
    for (const s of spec) {
      const e = new Enemy(ENEMIES[s.id], p.x + s.dx, p.y + (s.dy || 0), 4, 1);
      e.team = s.team; e.state = 'chase';
      if (s.hp) e.maxHp = e.hp = s.hp;
      GAME.enemies.push(e);
    }
    return GAME.enemies.length;
  }, [spec, opts]);
}

async function desktop(browser) {
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 } });
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(String(e)));
  page.on('console', (m) => { if (m.type() === 'error' && !ignorable(m.text())) errors.push(m.text()); });
  await page.goto(URL);
  await page.evaluate(() => localStorage.clear());
  await page.reload(); await wait(700);
  await titleStart(page); await wait(300); await page.evaluate(() => { if (GAME.screen === 'campaign') GAME.startBattle(testSpec()); }); await wait(300);

  // ---- test field: two allies beside the knight
  const tf = await page.evaluate(() => ({
    allies: GAME.enemies.filter((e) => e.alive && e.team === 'player').length,
    foes: GAME.foesAlive(),
  }));
  check('test field: 2 allied Shades + a Dominion group', tf.allies === 2 && tf.foes > 0, JSON.stringify(tf));
  await wait(1500);
  await page.screenshot({ path: OUT + '/p1-field.png' });

  // ---- DONE-WHEN 1: an allied Shade fights hostile Shades (knight far away, out of it)
  await setup(page, [
    { id: 'shade', team: 'player', dx: 600, dy: 0, hp: 3000 },
    { id: 'shade', team: 'enemy', dx: 660, dy: 0 },
    { id: 'shade', team: 'enemy', dx: 670, dy: 40 },
  ], { knightAt: [200, 600] });
  // keep references: dead units are culled from GAME.enemies after 0.5 s
  const before = await page.evaluate(() => { window.__units = GAME.enemies.slice(); return GAME.enemies.map((e) => e.hp); });
  await wait(9000);
  const ally1 = await page.evaluate(() => {
    const a = window.__units[0];
    const foes = window.__units.slice(1);
    return {
      allyTarget: a.target ? (a.target instanceof Enemy ? a.target.team : 'knight') : null,
      foeHp: foes.map((e) => e.alive ? e.hp : 0),
      foeDead: foes.filter((e) => !e.alive).length,
      foeTargets: foes.filter((e) => e.alive).map((e) => e.target === a ? 'ally' : e.target === GAME.player ? 'knight' : String(e.target)),
      allyHp: a.hp,
      knightHp: GAME.player.hp,
    };
  });
  const foeDamaged = ally1.foeHp.some((h, i) => h < before[i + 1]);
  check('DONE: allied Shade damages hostile Shades', foeDamaged, JSON.stringify(ally1));
  check('allied Shade kills at least one hostile Shade (9 s)', ally1.foeDead >= 1, `${ally1.foeDead} dead`);

  // ---- DONE-WHEN 2: hostile AI targets allies as well as the knight
  check('DONE: hostiles fight the ally when it is the nearest hostile', ally1.allyHp < 3000 && (ally1.foeDead === 2 || ally1.foeTargets.every((t) => t === 'ally')), `ally HP 3000 -> ${ally1.allyHp}, targets ${ally1.foeTargets}`);
  await setup(page, [
    { id: 'shade', team: 'player', dx: 650, dy: 0, hp: 3000 },
    { id: 'shade', team: 'enemy', dx: 250, dy: 0 },   // knight 250 away, ally 400 away
  ], { knightAt: [900, 600] });
  await wait(400);
  const t2 = await page.evaluate(() => { const f = GAME.enemies[1]; return f.target === GAME.player ? 'knight' : f.target === GAME.enemies[0] ? 'ally' : String(f.target); });
  await page.evaluate(() => { const p = GAME.player; p.x -= 400; });   // knight steps back: knight 650 away, ally 400
  await wait(600);
  const t3 = await page.evaluate(() => { const f = GAME.enemies[1]; return f.target === GAME.player ? 'knight' : f.target === GAME.enemies[0] ? 'ally' : String(f.target); });
  check('DONE: hostile retargets knight <-> ally by distance', t2 === 'knight' && t3 === 'ally', `knight closer: ${t2}; ally closer: ${t3}`);

  // ---- the knight never hurts allies
  await setup(page, [{ id: 'shade', team: 'player', dx: 40, dy: 0, hp: 1000 }]);
  await page.evaluate(() => { GAME.player.facing = 0; GAME.enemies[0].state = 'stagger'; GAME.enemies[0].stateFrame = 999; });
  for (let i = 0; i < 4; i++) { await page.keyboard.press('KeyJ'); await wait(150); }
  await page.keyboard.press('Digit1'); await wait(300);
  await page.keyboard.press('Digit3'); await wait(800);
  const friendly = await page.evaluate(() => ({ hp: GAME.enemies[0].hp, lock: GAME.player.lock }));
  await page.keyboard.press('KeyL'); await wait(100);
  const lockAfter = await page.evaluate(() => GAME.player.lock);
  check('knight combo, Fire and Thunder never hit an ally', friendly.hp === 1000, `ally HP ${friendly.hp}`);
  check('lock-on skips allies', lockAfter === null);

  // ---- bolts respect teams: hostile caster hits the ally; allied caster hits the foe, never the knight
  await setup(page, [
    { id: 'shade', team: 'player', dx: 500, dy: 0, hp: 3000 },
    { id: 'caster', team: 'enemy', dx: 700, dy: 0, hp: 3000 },
  ], { god: false });
  await page.evaluate(() => { GAME.player.x -= 400; });
  await wait(5000);
  const bolt1 = await page.evaluate(() => ({ ally: GAME.enemies[0].hp, kn: GAME.player.hp, max: GAME.player.stats.maxHp }));
  check('hostile caster bolts / fights the ally', bolt1.ally < 3000, JSON.stringify(bolt1));
  await setup(page, [
    { id: 'caster', team: 'player', dx: 0, dy: 60, hp: 3000 },
    { id: 'shade', team: 'enemy', dx: 220, dy: 60, hp: 3000 },
  ], { god: false });
  await page.evaluate(() => { GAME.enemies[1].cooldown = 99999; GAME.player.hp = GAME.player.stats.maxHp; });
  await wait(5000);
  const bolt2 = await page.evaluate(() => ({ foe: GAME.enemies[1].hp, kn: GAME.player.hp, max: GAME.player.stats.maxHp, shots: GAME.projectiles.map((p) => p.team) }));
  check('allied caster bolts hit the foe, not the knight', bolt2.foe < 3000 && bolt2.kn === bolt2.max, JSON.stringify(bolt2));

  // ---- a boss slam hits allies too
  await setup(page, [{ id: 'shade', team: 'player', dx: 400, dy: 0, hp: 3000 }]);
  const slam = await page.evaluate(() => {
    const p = GAME.player;
    const b = { id: 'test-lord', name: 'Test Lord', title: '', tier: 1, stats: { hp: 900, attack: 12, defense: 8 }, uniqueMaterials: [], pattern: 'brute', moves: ['slam'], color: '#553', accent: '#fa4' };
    const boss = new Enemy(bossEnemyDef(b), p.x + 460, p.y, 8, 1);
    boss.boss = b; boss.team = 'enemy';
    GAME.enemies.push(boss);
    const ally = GAME.enemies[0];
    const hp0 = ally.hp;
    GAME.bossShock(boss, ally.x, ally.y, 150, 1.5);
    return { hp0, hp1: ally.hp };
  });
  check('boss shockwave damages allies', slam.hp1 < slam.hp0, JSON.stringify(slam));

  // ---- allies with nothing to fight fall in beside the knight
  await setup(page, [{ id: 'shade', team: 'player', dx: 600, dy: 200 }]);
  await wait(4000);
  const follow = await page.evaluate(() => { const a = GAME.enemies[0], p = GAME.player; return Math.round(dist(a.x, a.y, p.x, p.y)); });
  check('idle ally follows the knight', follow < WAR_follow_ok(), `distance ${follow}`);

  // ---- allies keep up while the knight walks
  await setup(page, [{ id: 'shade', team: 'player', dx: -60, dy: 0 }], { knightAt: [300, 600] });
  await page.keyboard.down('KeyD'); await wait(3000);
  const walking = await page.evaluate(() => { const a = GAME.enemies[0], p = GAME.player; return { d: Math.round(dist(a.x, a.y, p.x, p.y)), kx: Math.round(p.x) }; });
  await page.keyboard.up('KeyD');
  check('allies keep up with a walking knight (3 s)', walking.d < 2 * 160 + 40 && walking.kx > 800, JSON.stringify(walking));

  // ---- group clears on foes only; allies topped up with the next group
  await page.evaluate(() => {
    GAME.enemies.length = 0; GAME.army.clear(); GAME.respawnT = 0; GAME.groupsCleared = 0;
    const p = GAME.player; const a = new Enemy(ENEMIES.shade, p.x - 40, p.y, 4, 1); a.team = 'player'; GAME.enemies.push(a);
  });
  await wait(300);
  const gc = await page.evaluate(() => GAME.groupsCleared);
  await wait(3200);
  const next = await page.evaluate(() => ({ foes: GAME.foesAlive(), allies: GAME.enemies.filter((e) => e.alive && e.team === 'player').length }));
  check('group cleared while an ally lives; next group tops allies back to 2', gc === 1 && next.foes > 0 && next.allies === 2, `cleared ${gc}, ${JSON.stringify(next)}`);
  await wait(2500);
  await page.screenshot({ path: OUT + '/p1-fight.png' });

  check('desktop: no page errors', errors.length === 0, errors.slice(0, 5).join(' | '));
  await ctx.close();
}
function WAR_follow_ok() { return 160 + 40; }

async function phone(browser) {
  const ctx = await browser.newContext({ ...devices['iPhone 13 landscape'] });
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(String(e)));
  page.on('console', (m) => { if (m.type() === 'error' && !ignorable(m.text())) errors.push(m.text()); });
  await page.goto(URL); await wait(700);
  const b = await page.evaluate(() => { const r = document.getElementById('game').getBoundingClientRect(); return { x: r.left, y: r.top, w: r.width, h: r.height }; });
  const pt = (x, y) => ({ x: b.x + x / 960 * b.w, y: b.y + y / 540 * b.h });
  await titleTapStart(page); await wait(300); await page.evaluate(() => { if (GAME.screen === 'campaign') GAME.startBattle(testSpec()); }); await wait(300);
  const st = await page.evaluate(() => ({ screen: GAME.screen, allies: GAME.enemies.filter((e) => e.team === 'player').length }));
  check('phone: test field with allies', st.screen === 'battle' && st.allies === 2, JSON.stringify(st));
  // touch auto lock-on never picks an ally
  await page.evaluate(() => {
    const p = GAME.player; GAME.enemies.length = 0; GAME.army.clear(); GAME.respawnT = 999; p.lock = null;
    const a = new Enemy(ENEMIES.shade, p.x + 40, p.y, 4, 1); a.team = 'player'; GAME.enemies.push(a);
    const f = new Enemy(ENEMIES.shade, p.x + 300, p.y, 4, 1); GAME.enemies.push(f);
  });
  await wait(300);
  const lock = await page.evaluate(() => GAME.player.lock ? GAME.player.lock.team : null);
  check('phone: auto lock-on picks the foe, not the ally', lock === 'enemy', String(lock));
  await wait(2000);
  await page.screenshot({ path: OUT + '/p1-phone.png' });
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
