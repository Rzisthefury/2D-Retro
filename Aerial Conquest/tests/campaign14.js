// Phase 14 balance harness: a whole campaign on autopilot, from New Game to the warlord, with the Dominion AI on.
// Usage: node campaign14.js aerial-conquest.html [difficulty] [maxHours]
// Strategy (a plain, sensible player): small nodes before keeps and castles, lowest tier first; attack when the
// warband is nearly full; join the defense of your castles; spend gold on castles, villages, gear, then knight
// upgrades, keeping a buffer for recruiting; learn the cheapest talents (Command first). Battles are fought by the
// debug autopilot (botLordFirst, so Lords get recruited). Prints one line per battle and a summary as JSON.
const { chromium } = require('playwright');
const path = require('path');
const URL = 'file://' + path.resolve(process.argv[2]);
const DIFF = process.argv[3] || 'normal';
const MAX_H = +(process.argv[4] || 6);

(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
  const errors = [];
  page.on('pageerror', (e) => errors.push(String(e)));
  await page.goto(URL); await page.evaluate(() => localStorage.clear()); await page.reload(); await new Promise((r) => setTimeout(r, 600));
  await page.evaluate((diff) => {
    GAME.startNewGame(1, diff); GAME.story = null;
    const w = GAME.war; w._tick = w.tick; w.tick = () => {};
    window.__C = { mapT: 0, battleT: 0, battles: [], deaths: 0, joined: 0 };
    const C = window.__C;
    const TYPE = { village: 0, outpost: 1, keep: 2, castle: 3 };
    C.spend = () => {
      const p = GAME.player, c = GAME.camp, w = GAME.war, buf = 80;
      // talents: Command first, then the rest, cheapest first
      for (let again = true; again;) {
        again = false;
        const free = GAME.apFree();
        const can = TALENTS.filter((t) => canLearn(p.talents, t, free)).sort((a, b) => (a.branch === 'command' ? -10 : 0) + a.cost - ((b.branch === 'command' ? -10 : 0) + b.cost));
        if (can.length) { GAME.learnTalent(can[0].id); again = true; }
      }
      // castles, then villages
      for (const type of ['castle', 'village']) for (const n of c.nodes) {
        if (n.owner !== 'player' || n.type !== type) continue;
        const cost = w.upgradeCost(n);
        if (cost && p.gold >= cost + buf) w.upgrade(n, p);
      }
      // gear: the next tier of each if it's ready (forging needs the map, which this is)
      for (const e of GAME.synthEntries()) {
        if (e.state !== 'ready') continue;
        const cur = e.kind === 'w' ? p.weapon.tier : p.armor.tier, def = e.kind === 'w' ? weaponById(e.id) : armorById(e.id);
        if (def.tier === cur + 1) GAME.craft(e);
      }
      // knight upgrades: the cheapest rank, keeping a bigger buffer
      for (let k = 0; k < 30; k++) {
        const opts = KNIGHT_UPGRADES.map((u) => [u.id, GAME.upgradeCost(u.id)]).filter(([, c]) => c > 0).sort((a, b) => a[1] - b[1]);
        if (!opts.length || p.gold < opts[0][1] + buf * 3) break;
        GAME.buyUpgrade(opts[0][0]);
      }
    };
    C.target = () => {
      const c = GAME.camp;
      const opts = c.nodes.filter((n) => n.owner === 'enemy' && c.canAttack(n));
      opts.sort((a, b) => (c.territories[a.territory].tier * 10 + TYPE[a.type]) - (c.territories[b.territory].tier * 10 + TYPE[b.type]));
      return opts[0] || null;
    };
    C.fight = (start) => {
      const before = { wb: troopTotal(GAME.war.warband), cap: GAME.warbandCap() };
      start();
      const b = GAME.battle;
      GAME.autopilot = true; GAME.botLordFirst = true; GAME.god = false;
      GAME.simulate(1500);
      const r = { kind: b.spec.kind, tier: b.spec.tier, name: b.spec.name, result: b.result || 'timeout', t: Math.round(b.time), wb: before.wb, cap: before.cap,
        foes: b.startFoes, hp: Math.round(GAME.player.hp), ranks: Object.values(GAME.player.upgrades).join('/'), gear: `${GAME.player.weapon.tier}/${GAME.player.armor.tier}` };
      if (!b.result) GAME.finishBattle('retreat');
      if (r.result === 'lose') C.deaths++;
      if (GAME.pendingRecruit) GAME.decideRecruit(true);
      C.battleT += b.time;
      GAME.enterCampaign(); GAME.story = null;
      C.battles.push(r);
      return r;
    };
    C.turn = () => {
      const c = GAME.camp, w = GAME.war, p = GAME.player;
      if (c.castleOf(WAR.capitalTerritory).owner === 'player') return { done: true };
      GAME.syncWar();
      C.spend();
      // your castle under attack: go and defend it
      const f = w.fights.find((x) => x.node >= 0 && c.nodes[x.node].owner === 'player' && w.joinSpec(x));
      if (f && troopTotal(w.warband) >= 6) { C.joined++; return { battle: C.fight(() => GAME.joinFight(f)) }; }
      // castles with troops to spare send armies at small nodes they can beat (keeping 6 at home)
      for (const home of c.nodes.filter((x) => x.type === 'castle' && x.owner === 'player')) {
        const g = w.garrison[home.id]; if (!g || troopTotal(g) < 14 || troopTotal(w.warband) < GAME.warbandCap() - 2) continue;
        const send = { ...g }; let keep = 6;
        for (const k of ['sword', 'spear', 'archer', 'shield']) { const d = Math.min(keep, send[k]); send[k] -= d; keep -= d; }
        send.ram = 0;
        const str = War.strength(send, 1, w.mult('player', null));
        const tgts = c.nodes.filter((x) => x.owner === 'enemy' && x.type !== 'castle' && c.canAttack(x) && !w.armies.some((a) => a.team === 'player' && a.target === x.id))
          .map((x) => ({ x, need: w.nodeStrength(x) * 1.6 / Math.max(1, c.battleTier(x)) }))
          .filter((o) => War.strength(send, c.battleTier(o.x), w.mult('player', null)) > w.nodeStrength(o.x) * 1.3)
          .sort((a, b) => c.dist[home.id * c.nodes.length + a.x.id] - c.dist[home.id * c.nodes.length + b.x.id]);
        if (tgts.length && str > 0 && w.sendArmy(home, send, tgts[0].x)) C.sent = (C.sent || 0) + 1;
      }
      const cap = GAME.warbandCap(), wb = troopTotal(w.warband);
      const n = C.target();
      if (n && wb >= Math.max(cap - 2, Math.ceil(cap * 0.85))) return { battle: C.fight(() => GAME.attackNode(n)) };
      // wait on the map: 15 s of war time (stop early if one of your nodes comes under attack)
      for (let k = 0; k < 60; k++) {
        w._tick.call(w, 0.25, p);
        for (const r of w.results) if (r.node >= 0 && r.winner === 'enemy' && c.nodes[r.node].owner === 'enemy') C.lost = (C.lost || 0) + 1;
        w.results = [];
        if (w.fights.some((x) => x.node >= 0 && c.nodes[x.node].owner === 'player')) { C.mapT += (k + 1) / 4; return { map: true }; }
      }
      C.mapT += 15;
      return { map: true };
    };
  }, DIFF);
  const t0 = Date.now();
  let lastLog = 0;
  for (let i = 0; i < 100000; i++) {
    const r = await page.evaluate(() => window.__C.turn());
    if (r.done) break;
    if (r.battle) console.log('BATTLE ' + JSON.stringify(r.battle));
    const s = await page.evaluate(() => ({ mapT: window.__C.mapT, battleT: Math.round(window.__C.battleT), held: GAME.camp.territoriesHeld('player'), gold: GAME.player.gold, wb: troopTotal(GAME.war.warband), cap: GAME.warbandCap(), offensives: GAME.war.activeOffensives(), lost: window.__C.lost || 0, joined: window.__C.joined, sent: window.__C.sent || 0 }));
    if (s.mapT + s.battleT > MAX_H * 3600) { console.log('TIMEOUT', JSON.stringify(s)); break; }
    if (s.mapT - lastLog >= 600) { lastLog = s.mapT; console.log('MAP ' + JSON.stringify(s)); }
  }
  const sum = await page.evaluate(() => {
    const C = window.__C, by = {};
    for (const b of C.battles) { (by[b.kind] = by[b.kind] || []).push(b); }
    const med = (xs) => { const v = xs.slice().sort((a, b) => a - b); return v.length ? v[Math.floor(v.length / 2)] : null; };
    for (const k of Object.keys(by)) { const xs = by[k]; const w = xs.filter((b) => b.result === 'win'); by[k] = { n: xs.length, wins: w.length, medWin: med(w.map((b) => b.t)), lo: w.length ? Math.min(...w.map((b) => b.t)) : null, hi: w.length ? Math.max(...w.map((b) => b.t)) : null, losses: xs.length - w.length }; }
    return { won: GAME.camp.castleOf(WAR.capitalTerritory).owner === 'player', totalMin: Math.round((C.mapT + C.battleT) / 60), mapMin: Math.round(C.mapT / 60), battleMin: Math.round(C.battleT / 60),
      battles: C.battles.length, wins: C.battles.filter((b) => b.result === 'win').length, deaths: C.deaths, joined: C.joined, lost: C.lost || 0, sent: C.sent || 0, held: GAME.camp.territoriesHeld('player'),
      ranks: Object.values(GAME.player.upgrades).join('/'), gear: `${GAME.player.weapon.tier}/${GAME.player.armor.tier}`, sp: GAME.player.skillPoints, generals: GAME.war.mine().length, goldEarned: Math.round(GAME.war.stats.gold), byKind: by };
  });
  console.log('SUMMARY ' + JSON.stringify(sum));
  console.log(`wall ${Math.round((Date.now() - t0) / 1000)} s`);
  if (errors.length) console.log('ERRORS', errors.slice(0, 5));
  await browser.close();
})();
