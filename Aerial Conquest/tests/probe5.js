// Phase 5 probe: autopilot each battle type, print the outcome and time.
const { chromium } = require('playwright');
const path = require('path');
const URL = 'file://' + path.resolve(process.argv[2]);
const kinds = (process.argv[3] || 'outpost,keep,castle,convoy,defense,rescue,village,field').split(',');
const runs = +(process.argv[4] || 1);
(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
  const errors = [];
  page.on('pageerror', (e) => errors.push(String(e)));
  await page.goto(URL);
  await page.evaluate(() => localStorage.clear());
  await page.reload(); await new Promise((r) => setTimeout(r, 600));
  await page.keyboard.press('Enter'); await new Promise((r) => setTimeout(r, 200));
  for (const k of kinds) for (let r = 0; r < runs; r++) {
    const out = await page.evaluate(([k, god, upg]) => {
      const lordFirst = !k.endsWith('!'); k = k.replace('!', '');
      GAME.enterCampaign();
      GAME.startBattle(window[k + 'Spec']());
      GAME.autopilot = true; GAME.botLordFirst = lordFirst; GAME.god = god;
      if (upg) { const r = GAME.battle.spec.tier === 1 ? upg[0] : upg[1]; for (const u of Object.keys(GAME.player.upgrades)) GAME.player.upgrades[u] = r; GAME.player.refreshStats(true); }
      const log = [];
      for (let t = 0; t < 600 && !GAME.battle.result; t += 15) {
        GAME.simulate(15);
        const b = GAME.battle, p = GAME.player;
        log.push(`${Math.round(b.time)}s hp${Math.round(p.hp)} pot${p.potions} foes${GAME.foeStrength()} al${GAME.alliesAlive()} prog${b.progress(GAME).toFixed(2)} @${Math.round(p.x)},${Math.round(p.y)}`);
      }
      const b = GAME.battle;
      return { k, kills: b.kills, routed: GAME.army.routedCount[1], start: b.startFoes, result: b.result, time: +b.time.toFixed(1), outcome: b.outcome, notes: b.notes, lordFirst: b.lordBeatenFirst, fled: b.lordFled, log };
    }, [k, !!process.env.GOD, process.env.UPG ? process.env.UPG.split(',').map(Number) : null]);
    console.log(JSON.stringify({ ...out, log: undefined }));
    console.log('   ' + out.log.join('\n   '));
  }
  if (errors.length) console.log('ERRORS', errors.slice(0, 5));
  await browser.close();
})();
