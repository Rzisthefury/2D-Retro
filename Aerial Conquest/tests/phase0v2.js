// PLAN v2 Phase 0 (strip) checks: headless Chromium, desktop + emulated iPhone 13.
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

async function canvasPoint(page, x, y) {
  const r = await page.evaluate(() => { const b = document.getElementById('game').getBoundingClientRect(); return { x: b.left, y: b.top, w: b.width, h: b.height }; });
  return { x: r.x + (x / 960) * r.w, y: r.y + (y / 540) * r.h };
}
async function hold(page, key, ms) { await page.keyboard.down(key); await wait(ms); await page.keyboard.up(key); }

/** One enemy right in front of the knight, everything else cleared. */
async function dummy(page, id, dx = 50) {
  return page.evaluate(([id, dx]) => {
    const p = GAME.player;
    GAME.enemies.length = 0; GAME.army.clear(); GAME.projectiles.length = 0; GAME.waveIntro = 0; GAME.respawnT = 99;
    p.state = 'idle'; p.iframes = 0;
    const e = new Enemy(ENEMIES[id], p.x + dx, p.y, 4, 1);
    e.aggro = false; e.wanderT = 999; e.maxHp = e.hp = 5000;   // passive dummy: never hits back
    GAME.enemies.push(e);
    p.facing = 0; p.lock = e;
    return e.hp;
  }, [id, dx]);
}
const hpOf = (page) => page.evaluate(() => GAME.enemies[0] ? GAME.enemies[0].hp : -1);

async function desktop(browser) {
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 } });
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(String(e)));
  page.on('console', (m) => { if (m.type() === 'error' && !ignorable(m.text())) errors.push(m.text()); });
  // seed storage once (no init script: it re-runs on every reload)
  await page.goto(URL);
  await page.evaluate(() => { localStorage.clear(); localStorage.setItem('aerial-finisher-save-v2', '{"level":77}'); });
  await page.reload();
  await wait(800);

  // ---- the strip
  const gone = await page.evaluate(() => ({
    world: typeof WORLD_MAP, loc: typeof LOCATION_LIST, dungeon: typeof dungeonRooms, asc: typeof makeAscendant,
    freshWorld: typeof freshWorld, expToNext: typeof expToNext, maxLevel: typeof MAX_LEVEL, zone: typeof ZONE_MUSIC,
    statsForLevel: typeof statsForLevel, playerLevel: 'level' in GAME.player, playerExp: 'exp' in GAME.player,
    gameWorld: 'world' in GAME, gameDungeon: 'dungeon' in GAME, scripts: document.scripts.length,
  }));
  check('no overworld / region / dungeon / Ascendant code', gone.world === 'undefined' && gone.loc === 'undefined' && gone.dungeon === 'undefined' && gone.asc === 'undefined' && gone.freshWorld === 'undefined' && gone.zone === 'undefined', JSON.stringify(gone));
  check('no level / EXP code', gone.expToNext === 'undefined' && gone.maxLevel === 'undefined' && gone.statsForLevel === 'undefined' && !gone.playerLevel && !gone.playerExp);
  check('Game has no world / dungeon state', !gone.gameWorld && !gone.gameDungeon);
  check('title screen, AERIAL CONQUEST', (await page.evaluate(() => GAME.screen)) === 'title' && (await page.title()) === 'Aerial Conquest');
  await page.screenshot({ path: OUT + '/v2-title.png' });

  // ---- title -> test battlefield
  await titleStart(page); await wait(300); await page.evaluate(() => { if (GAME.screen === 'campaign') GAME.startBattle(testSpec()); }); await wait(300);
  const st = await page.evaluate(() => ({ screen: GAME.screen, enemies: GAME.enemies.filter((e) => e.alive).length, field: GAME.field, hp: GAME.player.hp, max: GAME.player.stats.maxHp }));
  check('Start -> test battlefield with Shades', st.screen === 'battle' && st.enemies > 0, JSON.stringify(st));
  await wait(1800);
  await page.screenshot({ path: OUT + '/v2-field.png' });

  // ---- camera scrolls with the field
  await page.evaluate(() => { GAME.enemies.length = 0; GAME.army.clear(); GAME.respawnT = 99; });
  const c0 = await page.evaluate(() => GAME.camX);
  await hold(page, 'KeyD', 2200);
  const c1 = await page.evaluate(() => ({ cam: GAME.camX, x: GAME.player.x }));
  check('battlefield scrolls (camera follows the knight)', c1.cam > c0 + 100, `camX ${Math.round(c0)} -> ${Math.round(c1.cam)}, knight x ${Math.round(c1.x)}`);
  await hold(page, 'KeyD', 4000);
  const edge = await page.evaluate(() => ({ x: GAME.player.x, max: GAME.field.w, r: GAME.player.radius }));
  check('knight is held inside the field', edge.x <= edge.max - edge.r + 0.5, JSON.stringify(edge));
  await hold(page, 'KeyA', 2500);

  // ---- combat, unchanged from AF (god mode so test dummies can't interrupt the knight)
  await page.evaluate(() => { GAME.god = true; });
  let h0 = await dummy(page, 'shade');
  for (let i = 0; i < 4; i++) { await page.keyboard.press('KeyJ'); await wait(150); }
  await wait(600);
  let h1 = await hpOf(page);
  const combo = await page.evaluate(() => GAME.comboCount);
  check('ground combo lands hits', h1 < h0, `${h0} -> ${h1}`);

  await wait(800);
  h0 = await dummy(page, 'shade', 40);
  await page.keyboard.press('KeyK'); await wait(150);
  const zj = await page.evaluate(() => GAME.player.z);
  for (let i = 0; i < 3; i++) { await page.keyboard.press('KeyJ'); await wait(140); }
  await wait(500);
  h1 = await hpOf(page);
  check('air combo: airborne attacks land', zj > 0 && h1 < h0, `z ${zj.toFixed(1)}, ${h0} -> ${h1}`);
  await wait(900);

  // Whirl: learn it with SP, then the finisher hits a ring of enemies
  const sp0 = await page.evaluate(() => GAME.apFree());
  await page.evaluate(() => { GAME.learnTalent('whirl'); });
  const sp1 = await page.evaluate(() => ({ free: GAME.apFree(), has: GAME.player.hasT('whirl') }));
  check('talents cost skill points (SP)', sp0 === 5 && sp1.has && sp1.free === 3, `${sp0} -> ${sp1.free}`);
  await page.evaluate(() => {
    const p = GAME.player; GAME.enemies.length = 0; GAME.army.clear(); GAME.projectiles.length = 0; GAME.waveIntro = 0; GAME.respawnT = 99; p.lock = null;
    for (let k = 0; k < 6; k++) { const a = k / 6 * Math.PI * 2; const e = new Enemy(ENEMIES.shade, p.x + Math.cos(a) * 45, p.y + Math.sin(a) * 45, 4, 1); e.aggro = false; e.wanderT = 999; e.maxHp = e.hp = 5000; GAME.enemies.push(e); }
  });
  let sawWhirl = false;
  await page.evaluate(() => { GAME.player.state = 'idle'; GAME.player.iframes = 0; });
  for (let i = 0; i < 16 && !sawWhirl; i++) {
    await page.keyboard.press('KeyJ'); await wait(120);
    if (await page.evaluate(() => !!(GAME.player.attackDef && GAME.player.attackDef.radial))) sawWhirl = true;
  }
  await wait(1200);
  const whirlHits = await page.evaluate(() => GAME.enemies.filter((e) => e.hp < 5000).length);
  check('Whirl finisher sweeps all around', sawWhirl && whirlHits >= 5, `radial seen ${sawWhirl}, ${whirlHits}/6 hit`);

  // dash
  await page.evaluate(() => { GAME.enemies.length = 0; GAME.army.clear(); GAME.player.skillPoints += 1; GAME.learnTalent('dash'); GAME.player.dashCharges = GAME.player.maxDash(); });
  const d0 = await page.evaluate(() => GAME.player.dashCharges);
  await page.keyboard.down('KeyD'); await page.keyboard.press('ShiftLeft'); await wait(100); await page.keyboard.up('KeyD');
  const d1 = await page.evaluate(() => GAME.player.dashCharges);
  check('dash spends a charge', d0 >= 1 && d1 < d0, `${d0} -> ${d1}`);
  await wait(600);

  // spells
  h0 = await dummy(page, 'shade', 160);
  await page.evaluate(() => { GAME.player.mp = GAME.player.stats.maxMp; });
  const mp0 = await page.evaluate(() => GAME.player.mp);
  await page.keyboard.press('Digit1'); await wait(900);
  const mp1 = await page.evaluate(() => GAME.player.mp);
  h1 = await hpOf(page);
  check('Fire spell spends MP and hits', mp1 < mp0 && h1 < h0, `MP ${mp0} -> ${mp1}, HP ${h0} -> ${h1}`);

  // guard: a bruiser blocks from the front
  await wait(500);
  await dummy(page, 'bruiser', 45);
  await page.evaluate(() => { const e = GAME.enemies[0]; e.facing = Math.PI; e.state = 'chase'; e.cooldown = 999; });
  await page.keyboard.press('KeyJ'); await wait(250);
  const gf = await page.evaluate(() => GAME.floats.some((f) => f.text === 'GUARD'));
  check('guard: bruiser blocks a frontal hit', gf);
  await wait(900);

  // ---- groups keep coming
  await page.evaluate(() => { GAME.enemies.length = 0; GAME.army.clear(); GAME.respawnT = 0; GAME.groupsCleared = 0; });
  await wait(300);
  const gc = await page.evaluate(() => GAME.groupsCleared);
  await wait(3200);
  const regroup = await page.evaluate(() => GAME.enemies.filter((e) => e.alive).length);
  check('cleared group -> next group spawns', gc === 1 && regroup > 0, `cleared ${gc}, new group ${regroup}`);

  // ---- menus: 5 tabs since Phase 11 (Knight added), forge with materials, status
  await page.keyboard.press('Tab'); await wait(200);
  for (let t = 0; t < 5; t++) { await page.keyboard.press('Digit' + (t + 1)); await wait(150); }
  const menu = await page.evaluate(() => ({ open: GAME.menuOpen, tab: GAME.menuTab, tabs: MENU_TABS }));
  check('pause menu: 5 tabs (Gear, Forge, Talents, Knight, Status)', menu.open && menu.tabs === 5 && menu.tab === 4, JSON.stringify(menu));
  await page.screenshot({ path: OUT + '/v2-status.png' });
  await page.keyboard.press('Digit2'); await wait(150);
  await page.screenshot({ path: OUT + '/v2-forge.png' });
  const forge = await page.evaluate(() => {
    for (const m of MAT_ORDER) GAME.player.inv[m] = 50;
    GAME.player.gold = 1000;
    const e = GAME.synthEntries().find((x) => x.id === 'w2');
    GAME.craft(e);
    const refused = !GAME.player.ownedWeapons.includes('w2');
    // Phase 11: forging is done on the map at a castle (phase11.js covers it); hand over the blade for the death check
    GAME.player.ownedWeapons.push('w2'); GAME.equip({ kind: 'w', w: weaponById('w2'), a: null });
    return { refused, owned: GAME.player.ownedWeapons.includes('w2'), weapon: GAME.player.weapon.id };
  });
  check('forge in battle is refused (Phase 11: at a castle, from the map); equipping gear works', forge.refused && forge.weapon === 'w2', JSON.stringify(forge));
  await page.keyboard.press('Escape'); await wait(150);

  // ---- music
  const mus = await page.evaluate(() => ({ title: GAME.musicFor()[0], name: GAME.music.trackName }));
  check('AF score still plays in battle', mus.title === 'forest' && !!mus.name, JSON.stringify(mus));

  // ---- death -> field restarts, progress kept
  await page.evaluate(() => { GAME.god = false; });
  await page.evaluate(() => { GAME.player.secondWindUsed = true; GAME.player.takeHit(GAME, 99999, 0, 0, 0); });
  await wait(1500);
  await page.keyboard.press('KeyR'); await wait(400);
  const rec = await page.evaluate(() => ({ screen: GAME.screen, alive: GAME.player.alive, hp: GAME.player.hp, max: GAME.player.stats.maxHp, w2: GAME.player.ownedWeapons.includes('w2'), whirl: GAME.player.hasT('whirl') }));
  check('death restarts the field, keeps gear and talents', rec.screen === 'battle' && rec.alive && rec.hp === rec.max && rec.w2 && rec.whirl, JSON.stringify(rec));

  // ---- saves
  const sv = await page.evaluate(() => ({ af: localStorage.getItem('aerial-finisher-save-v2'), ac: JSON.parse(localStorage.getItem('aerial-conquest-slot1') || 'null') }));
  check('save: slot1 holds SP/upgrades, no level/EXP/world', !!sv.ac && 'skillPoints' in sv.ac && 'upgrades' in sv.ac && !('level' in sv.ac) && !('world' in sv.ac), sv.ac && Object.keys(sv.ac).join(','));
  check('AF save untouched', sv.af === '{"level":77}');
  await page.evaluate(() => { GAME.player.upgrades.might = 3; GAME.player.refreshStats(false); GAME.save(); });
  const strBefore = await page.evaluate(() => GAME.player.stats.str);
  const lsBefore = await page.evaluate(() => ({ keys: Object.keys(localStorage), slot: localStorage.getItem('aerial-conquest-slot1') }));
  await page.reload(); await wait(800);
  const lsAfter = await page.evaluate(() => ({ keys: Object.keys(localStorage), slot: localStorage.getItem('aerial-conquest-slot1') }));
  console.log('DIAG before', JSON.stringify(lsBefore).slice(0, 300));
  console.log('DIAG after ', JSON.stringify(lsAfter).slice(0, 300));
  const after = await page.evaluate(() => ({ rows: GAME.titleRows(), might: GAME.player.upgrades.might, str: GAME.player.stats.str, whirl: GAME.player.hasT('whirl'), free: GAME.apFree() }));
  check('save round-trips through reload (upgrades raise stats)', after.rows[0] === 'Continue' && after.might === 3 && after.str === strBefore && after.str > 6 && after.whirl, JSON.stringify(after));

  check('desktop: no page errors', errors.length === 0, errors.slice(0, 5).join(' | '));
  await ctx.close();
}

async function phone(browser) {
  const ctx = await browser.newContext({ ...devices['iPhone 13 landscape'] });
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(String(e)));
  page.on('console', (m) => { if (m.type() === 'error' && !ignorable(m.text())) errors.push(m.text()); });
  await page.goto(URL);
  await wait(800);
  check('phone: touch mode', await page.evaluate(() => IS_TOUCH));
  const r = await canvasPoint(page, 336 + 144, 258 + 20);
  await page.touchscreen.tap(r.x, r.y); await wait(500); await page.evaluate(() => { if (GAME.screen === 'campaign') GAME.startBattle(testSpec()); }); await wait(300);
  check('phone: tap Start -> battlefield', (await page.evaluate(() => GAME.screen)) === 'battle');
  const h0 = await dummy(page, 'shade');
  const atk = await canvasPoint(page, 866, 448);
  for (let i = 0; i < 5; i++) { await page.touchscreen.tap(atk.x, atk.y); await wait(160); }
  await wait(400);
  check('phone: ATK button hits', (await hpOf(page)) < h0);
  await page.evaluate(() => { GAME.enemies.length = 0; GAME.army.clear(); });
  const p0 = await page.evaluate(() => GAME.player.x);
  const c = await canvasPoint(page, 118, 424), c2 = await canvasPoint(page, 170, 424);
  const cdp = await ctx.newCDPSession(page);
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: c.x, y: c.y, id: 1 }] });
  for (let k = 1; k <= 5; k++) { await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: c.x + (c2.x - c.x) * k / 5, y: c.y, id: 1 }] }); await wait(30); }
  await wait(800);
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  const p1 = await page.evaluate(() => GAME.player.x);
  check('phone: stick moves the knight', p1 - p0 > 40, `dx ${Math.round(p1 - p0)}`);
  await page.screenshot({ path: OUT + '/v2-phone-field.png' });
  // menu button, then a tab tap
  const mb = await canvasPoint(page, 916, 118);
  await page.touchscreen.tap(mb.x, mb.y); await wait(300);
  const tab = await canvasPoint(page, 26 + 3 * (116 + 8) + 58, 18 + 14);
  await page.touchscreen.tap(tab.x, tab.y); await wait(300);
  const m = await page.evaluate(() => ({ open: GAME.menuOpen, tab: GAME.menuTab }));
  check('phone: MENU button + tab tap', m.open && m.tab === 3, JSON.stringify(m));
  await page.screenshot({ path: OUT + '/v2-phone-menu.png' });
  const close = await canvasPoint(page, VIEW_W_ = 960 - 39, 32);
  await page.touchscreen.tap(close.x, close.y); await wait(300);
  check('phone: close box closes the menu', !(await page.evaluate(() => GAME.menuOpen)));
  check('phone: no page errors', errors.length === 0, errors.slice(0, 5).join(' | '));
  await ctx.close();
}

let VIEW_W_;
(async () => {
  const browser = await chromium.launch();
  try { await desktop(browser); await phone(browser); }
  catch (e) { check('script ran to completion', false, String(e && e.stack || e)); }
  await browser.close();
  const fails = results.filter((r) => !r.ok);
  console.log(`\n${results.length - fails.length}/${results.length} passed`);
  process.exit(fails.length ? 1 : 0);
})();
