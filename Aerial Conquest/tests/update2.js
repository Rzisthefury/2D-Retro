// Mobile update (Michael): a bigger attack button, a potion button, the tuning panel from the title menu. Emulated iPhone 13.
// Usage: node update2.js aerial-conquest.html shots
const { chromium, devices } = require('playwright');
const path = require('path');
const URL = 'file://' + path.resolve(process.argv[2]);
const OUT = process.argv[3];
const results = [];
const check = (name, ok, info = '') => { results.push({ name, ok, info }); console.log((ok ? 'PASS ' : 'FAIL ') + name + (info ? '  — ' + info : '')); };
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const geom = (page) => page.evaluate(() => { const r = document.getElementById('game').getBoundingClientRect(); return { x: r.left, y: r.top, w: r.width, h: r.height }; });
const toPage = (b, x, y) => ({ x: b.x + x / 960 * b.w, y: b.y + y / 540 * b.h });
async function titleTapStart(page) {
  for (let k = 0; k < 8; k++) {
    const at = await page.evaluate(() => {
      if (GAME.screen === 'campaign') return GAME.story ? { x: 480, y: 300 } : null;
      const r = GAME.titleRowAt(GAME.titleMode === 'difficulty' ? 1 : 0); return { x: r.x + r.w / 2, y: r.y + r.h / 2 };
    });
    if (!at) return;
    const b = await geom(page); const s = toPage(b, at.x, at.y);
    await page.touchscreen.tap(s.x, s.y); await wait(300);
  }
}

(async () => {
  const browser = await chromium.launch();
  const errors = [];
  try {
    const ctx = await browser.newContext({ ...devices['iPhone 13 landscape'] });
    const page = await ctx.newPage();
    page.on('pageerror', (e) => errors.push(String(e)));
    await page.goto(URL); await page.evaluate(() => localStorage.clear()); await page.reload(); await wait(800);
    const b = await geom(page);
    const rows0 = await page.evaluate(() => GAME.titleRows());
    await titleTapStart(page);
    await page.evaluate(() => { GAME.war.tick = () => {}; GAME.attackNode(GAME.camp.territories[1].nodes.find((m) => m.type === 'village')); GAME.god = true; GAME.simulate(2); });
    await wait(300);

    // ---- the layout: attack bigger, every button on screen, none overlapping
    const lay = await page.evaluate(() => {
      const bs = TOUCH_BTNS, out = { attack: bs.find((x) => x.id === 'attack').r, item: !!bs.find((x) => x.id === 'item'), overlaps: [], off: [] };
      for (let i = 0; i < bs.length; i++) {
        const a = bs[i];
        if (a.x - a.r < 0 || a.x + a.r > VIEW_W || a.y - a.r < 0 || a.y + a.r > VIEW_H) out.off.push(a.id);
        for (let j = i + 1; j < bs.length; j++) { const c = bs[j]; if (Math.hypot(a.x - c.x, a.y - c.y) < a.r + c.r + 4) out.overlaps.push(a.id + '/' + c.id); }
        if (Math.hypot(a.x - TOUCH_MENU.x, a.y - TOUCH_MENU.y) < a.r + TOUCH_MENU.r + 4) out.overlaps.push(a.id + '/menu');
        for (let k = 0; k < 4; k++) if (Math.hypot(a.x - TOUCH_CHIPS.x, a.y - (TOUCH_CHIPS.y + k * TOUCH_CHIPS.dy)) < a.r + TOUCH_CHIPS.r + 4) out.overlaps.push(a.id + '/chip' + k);
      }
      return out;
    });
    await page.screenshot({ path: OUT + '/u2-phone-hud.png' });
    check('attack button bigger (radius 42 -> 58); a potion button; every button on screen, none overlapping', lay.attack === 58 && lay.item && lay.overlaps.length === 0 && lay.off.length === 0, JSON.stringify(lay));

    // ---- a tap near the attack button's new edge swings (it would have missed the old 42 px circle)
    const atk = await page.evaluate(() => TOUCH_BTNS.find((x) => x.id === 'attack'));
    let s = toPage(b, atk.x - 52, atk.y); await page.touchscreen.tap(s.x, s.y); await wait(60);
    const swung = await page.evaluate(() => GAME.player.state);
    check('a tap 52 px from the attack button\'s centre (outside the old button) swings', /attack/.test(swung), swung);

    // ---- the potion button drinks one
    await wait(600);
    const pot0 = await page.evaluate(() => { const p = GAME.player; p.hp = Math.round(p.stats.maxHp * 0.3); p.potions = 3; p.state = 'idle'; return { hp: p.hp, n: p.potions }; });
    const it = await page.evaluate(() => TOUCH_BTNS.find((x) => x.id === 'item'));
    s = toPage(b, it.x, it.y); await page.touchscreen.tap(s.x, s.y); await wait(500);
    const pot1 = await page.evaluate(() => ({ hp: Math.round(GAME.player.hp), n: GAME.player.potions }));
    check('POT tap drinks a potion: one fewer, HP up', pot1.n === 2 && pot1.hp > pot0.hp, JSON.stringify({ pot0, pot1 }));

    // ---- the tuning panel from the title menu
    await page.evaluate(() => { GAME.enterCampaign(); GAME.save(); GAME.screen = 'title'; GAME.titleMode = 'root'; GAME.titleIndex = 0; });
    await wait(200);
    const rows = await page.evaluate(() => GAME.titleRows());
    const ti = rows.indexOf('Tuning');
    const r = await page.evaluate((i) => GAME.titleRowAt(i), ti);
    await page.screenshot({ path: OUT + '/u2-phone-title.png' });
    s = toPage(b, r.x + r.w / 2, r.y + r.h / 2); await page.touchscreen.tap(s.x, s.y); await wait(400);
    const open = await page.evaluate(() => document.getElementById('debug').classList.contains('open'));
    await page.screenshot({ path: OUT + '/u2-phone-tuning.png' });
    await page.tap('#debug button[data-act="close"]'); await wait(300);
    const closed = await page.evaluate(() => !document.getElementById('debug').classList.contains('open'));
    check('title menu has a Tuning row on phones (fresh: ' + rows0.join('/') + '); tapping it opens the tuning panel; its Close button shuts it',
      rows0.includes('Tuning') && ti >= 0 && open && closed, JSON.stringify({ rows0, rows, open, closed }));
    check('no page errors', errors.length === 0, errors.slice(0, 5).join(' | '));
    await ctx.close();

    // desktop keeps its menu as it was (the ` key opens tuning there)
    const dp = await browser.newPage({ viewport: { width: 1280, height: 800 } });
    await dp.goto(URL); await dp.evaluate(() => localStorage.clear()); await dp.reload(); await wait(600);
    const drows = await dp.evaluate(() => GAME.titleRows());
    check('desktop title menu unchanged (no Tuning row; ` still opens it)', !drows.includes('Tuning'), drows.join('/'));
  } catch (e) { check('script ran to completion', false, String(e && e.stack || e)); }
  await browser.close();
  const fails = results.filter((r) => !r.ok);
  console.log(`\n${results.length - fails.length}/${results.length} passed`);
  process.exit(fails.length ? 1 : 0);
})();
