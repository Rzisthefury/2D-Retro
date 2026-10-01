// PLAN v2 Phase 5 (outpost, keep, castle siege, convoy, defense, rescue) checks: headless Chromium, desktop + emulated iPhone 13.
const { chromium, devices } = require('playwright');
const path = require('path');
const URL = 'file://' + path.resolve(process.argv[2]);
const OUT = process.argv[3];
const TIMING_RUNS = +(process.env.RUNS || 2);
const results = [];
const check = (name, ok, info = '') => { results.push({ name, ok, info }); console.log((ok ? 'PASS ' : 'FAIL ') + name + (info ? '  — ' + info : '')); };
const info = (name, text) => console.log('INFO ' + name + '  — ' + text);
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

/** Start a battle type fresh (from the map stub), the knight under god mode unless told otherwise. */
const begin = (page, kind, god = true) => page.evaluate(([k, god]) => {
  GAME.enterSandbox(); GAME.startBattle(window[k + 'Spec']()); GAME.god = god; GAME.autopilot = false;
  const b = GAME.battle;
  return { kind: b.spec.kind, w: b.w, h: b.h, foes: GAME.foeStrength(), objective: b.objective };
}, [kind, god]);
const sim = (page, s) => page.evaluate((s) => GAME.simulate(s), s);
const res = (page) => page.evaluate(() => ({ result: GAME.battle.result, outcome: GAME.battle.outcome, notes: GAME.battle.notes, time: +GAME.battle.time.toFixed(1), gold: GAME.battle.spoils.gold }));
/** Kill every Dominion unit and elite (reserve too) — as if the army fought them down. */
const killFoes = (page, keep = []) => page.evaluate((keep) => {
  const a = GAME.army; a.reserve[TEAM_ENEMY] = { sword: 0, spear: 0, archer: 0, shield: 0, ram: 0, hound: 0 };
  for (let i = 0; i < a.cap; i++) if (a.alive[i] && a.team[i] === TEAM_ENEMY) a.hurt(GAME, i, 1e7, 0, 0, false);
  for (const e of GAME.enemies) if (e.alive && e.team === 'enemy' && !keep.some((k) => GAME.battle[k] === e)) e.applyDamage(GAME, 1e7, 0, 0, 0, 0);
}, keep);
/** The knight falls (god off). */
const knightFalls = (page) => page.evaluate(() => { GAME.god = false; GAME.player.takeHit(GAME, 1e6, 0, 0, 0); return GAME.simulate(WAR.deathToResults + 0.5); });

async function desktop(browser) {
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 } });
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(String(e)));
  page.on('console', (m) => { if (m.type() === 'error' && !ignorable(m.text())) errors.push(m.text()); });
  await page.goto(URL);
  await page.evaluate(() => localStorage.clear());
  await page.reload(); await wait(700);
  await titleStart(page);

  // ---- the map stub offers every type, and Enter on each row starts it at its PLAN 10.2 size
  const rows = await page.evaluate(() => GAME.campaignRows().map((r) => r.spec ? r.spec.kind : null));
  check('map stub: one row per battle type + the warlord (Phase 11) + test field + back', rows.join(',') === 'village,outpost,keep,castle,convoy,field,defense,rescue,castle,test,', rows.join(','));
  const size = { outpost: [2000, 1200], keep: [2000, 1600], castle: [3200, 1800], convoy: [3600, 1000], defense: [2400, 1400], rescue: [3200, 1800] };
  for (const [k, [w, h]] of Object.entries(size)) {
    const i = rows.indexOf(k);
    await page.evaluate((i) => { GAME.enterSandbox(); GAME.campIndex = i; }, i);
    await wait(80); await page.keyboard.press('Enter'); await wait(250);
    const s = await page.evaluate(() => ({ screen: GAME.screen, kind: GAME.battle.spec.kind, w: GAME.battle.w, h: GAME.battle.h }));
    check(`${k}: Enter on its row starts it at ${w}x${h}`, s.screen === 'battle' && s.kind === k && s.w === w && s.h === h, JSON.stringify(s));
  }
  await page.screenshot({ path: OUT + '/p5-rescue-start.png' });

  // ---- structure rules (PLAN 10.1)
  await begin(page, 'castle');
  const rules = await page.evaluate(() => {
    TUNING.variance = 0; const cc = TUNING.critChance; TUNING.critChance = 0;
    const b = GAME.battle, p = GAME.player, gate = b.gates[0], t = b.throne;
    const out = {};
    out.ironRatio = +(gate.maxHp / Math.round(WAR.gateHp * TIER_SCALING.hpMultiplier(b.spec.tier))).toFixed(2);
    // knight: one swing at a gate vs at a house-type structure
    const house = new Structure('building', 'enemy', p.x + 50, p.y + 30, 112, 78, 9999);
    b.structures.push(house);
    p.facing = Math.atan2(house.y - house.h / 2 - p.y, house.x - p.x);
    GAME.hitStructures(GROUND_COMBO[0], p, new Set());
    const dHouse = 9999 - house.hp;
    b.structures.pop();
    p.x = gate.x - 60; p.y = gate.cy; p.facing = 0;
    const g0 = gate.hp; GAME.hitStructures(GROUND_COMBO[0], p, new Set());
    out.knightGateRatio = +((g0 - gate.hp) / dHouse).toFixed(2);
    // units: a ram vs a swordsman against the gate; a ram can't hurt the throne
    const a = GAME.army;
    const ram = a.spawn('ram', 'player', gate.x - 40, gate.cy, 1), sw = a.spawn('sword', 'player', gate.x - 40, gate.cy + 20, 1);
    let h = gate.hp; GAME.unitStrike(a, ram, gate); out.ramGate = +((h - gate.hp) / a.atk[ram]).toFixed(2);
    h = gate.hp; GAME.unitStrike(a, sw, gate); out.swordGate = +((h - gate.hp) / a.atk[sw]).toFixed(2);
    h = t.hp; GAME.unitStrike(a, ram, t); out.ramThrone = h - t.hp;
    // walls: no damage from anything, and solid
    const wall = b.structures.find((s) => s.kind === 'wall');
    out.wallHit = wall.damage(GAME, 1e6) || wall.hp < 1e9 - 1;
    const o = { x: wall.x, y: wall.cy, radius: 10 }; b.collide(o);
    out.wallPushes = !wall.contains(o.x, o.y);
    TUNING.critChance = cc;
    return out;
  });
  check('castle with its keep still Dominion: iron gate = gate HP x1.6', rules.ironRatio === 1.6, JSON.stringify(rules));
  check('knight does x0.3 to gates (vs x1 to buildings)', Math.abs(rules.knightGateRatio - 0.3) < 0.03, String(rules.knightGateRatio));
  check('rams x4 vs gates, other units x0.3, rams can\'t hurt the throne', Math.abs(rules.ramGate - 4) < 0.05 && Math.abs(rules.swordGate - 0.3) < 0.12 && rules.ramThrone === 0, JSON.stringify(rules));
  check('walls are indestructible and solid', !rules.wallHit && rules.wallPushes, JSON.stringify(rules));

  // ---- walls and gates: nothing walks through a shut gate; once it falls, the way is open
  const nav = await page.evaluate(() => {
    const b = GAME.battle, [outer, inner] = b.gates, t = b.throne;
    const out = { before: b.reachable(110, b.h / 2, t.x, t.y), courtBefore: b.reachable(110, b.h / 2, (outer.x + inner.x) / 2, b.h / 2) };
    outer.damage(GAME, 1e9);
    out.courtAfter = b.reachable(110, b.h / 2, (outer.x + inner.x) / 2, b.h / 2);
    out.roomStill = b.reachable(110, b.h / 2, t.x, t.y);
    inner.damage(GAME, 1e9);
    out.roomAfter = b.reachable(110, b.h / 2, t.x, t.y);
    out.objective = b.objective;
    return out;
  });
  check('castle: shut gates seal the courtyard and throne room; each broken gate opens the next', !nav.before && !nav.courtBefore && nav.courtAfter && !nav.roomStill && nav.roomAfter && /throne/i.test(nav.objective), JSON.stringify(nav));
  const walk = await page.evaluate(() => {
    // with both gates down, Charge takes the warband through both gateways into the throne room
    GAME.army.reserve[TEAM_ENEMY] = { sword: 0, spear: 0, archer: 0, shield: 0, ram: 0, hound: 0 };
    for (let i = 0; i < GAME.army.cap; i++) if (GAME.army.alive[i] && GAME.army.team[i] === TEAM_ENEMY) GAME.army.hurt(GAME, i, 1e7, 0, 0, false);
    for (const e of GAME.enemies) if (e.alive && e.team === 'enemy') e.applyDamage(GAME, 1e7, 0, 0, 0, 0);   // the Lord too: nothing left to fight but the throne
    GAME.issueOrder('charge');
    GAME.simulate(40);
    const b = GAME.battle, a = GAME.army;
    let inRoom = 0, live = 0;
    for (let i = 0; i < a.cap; i++) if (a.alive[i] && a.team[i] === TEAM_PLAYER) { live++; if (b.zone(a.x[i], a.y[i]) === 2) inRoom++; }
    return { inRoom, live, throne: Math.round(b.throne.hp), max: b.throne.maxHp };
  });
  check('castle: the army walks through the broken gates to the throne and hits it', walk.inRoom > walk.live * 0.5 && walk.throne < walk.max, JSON.stringify(walk));

  // ================================================================ per type: win and lose

  // ---- outpost
  await begin(page, 'outpost');
  await killFoes(page);
  const op = await page.evaluate(() => {
    const b = GAME.battle, r = b.ring, p = GAME.player;
    p.x = r.x; p.y = r.y;
    GAME.simulate(3);
    const p1 = r.progress;
    // an enemy steps into the ring: progress pauses
    const a = GAME.army, i = a.spawn('shield', 'enemy', r.x + 40, r.y, 1);
    a.hp[i] = 1e7;
    GAME.simulate(2);
    const p2 = r.progress, contested = r.contested;
    a.hurt(GAME, i, 1e8, 0, 0, false);
    GAME.simulate(1);
    const p3 = r.progress;
    return { p1: +p1.toFixed(2), p2: +p2.toFixed(2), p3: +p3.toFixed(2), contested };
  });
  check('outpost: progress pauses while an enemy is in the ring, then resumes (not reset)', op.p1 > 2.5 && op.p2 === op.p1 && op.contested && op.p3 > op.p2, JSON.stringify(op));
  await sim(page, 10);
  let r = await res(page);
  check('outpost: 10 s in the ring with no enemy inside wins', r.result === 'win', JSON.stringify(r));
  await begin(page, 'outpost');
  await page.evaluate(() => { const b = GAME.battle, p = GAME.player; p.x = b.ring.x - 200; p.y = b.ring.y + 300; });
  await sim(page, 15);
  r = await res(page);
  check('outpost: standing outside the ring takes nothing', r.result === null && (await page.evaluate(() => GAME.battle.ring.progress)) === 0, JSON.stringify(r));
  await knightFalls(page);
  r = await res(page);
  check('outpost: the knight falls -> lose', r.result === 'lose', JSON.stringify(r));

  // ---- keep
  await begin(page, 'keep');
  const kp = await page.evaluate(() => {
    const b = GAME.battle;
    b.gates[0].damage(GAME, 1e9);
    GAME.simulate(1);
    return { afterGate: GAME.battle.result, objective: b.objective, captain: b.captain.alive };
  });
  check('keep: breaking the gate alone is not the win; the objective turns to the Captain', kp.afterGate === null && /captain|varn/i.test(kp.objective) && kp.captain, JSON.stringify(kp));
  await page.evaluate(() => GAME.battle.captain.applyDamage(GAME, 1e7, 0, 0, 0, 0));
  await sim(page, 1);
  r = await res(page);
  check('keep: gate broken AND Captain defeated -> win', r.result === 'win', JSON.stringify(r));
  await begin(page, 'keep');
  await page.evaluate(() => GAME.battle.captain.applyDamage(GAME, 1e7, 0, 0, 0, 0));
  await sim(page, 2);
  r = await res(page);
  check('keep: Captain down with the gate standing is not the win', r.result === null, JSON.stringify(r));
  await knightFalls(page);
  r = await res(page);
  check('keep: the knight falls -> lose', r.result === 'lose', JSON.stringify(r));

  // ---- castle: Lord first (recruitable) vs throne first (the Lord flees)
  await begin(page, 'castle');
  const lf = await page.evaluate(() => {
    const b = GAME.battle;
    b.lord.applyDamage(GAME, 1e7, 0, 0, 0, 0);
    GAME.simulate(0.5);
    const mid = { result: b.result, lordBeatenFirst: b.lordBeatenFirst };
    b.throne.damage(GAME, 1e9);
    GAME.simulate(0.2);
    return { mid, result: b.result, lordBeatenFirst: b.lordBeatenFirst, lordFled: b.lordFled, notes: b.notes };
  });
  check('castle, Lord first: beating the Lord is not the win; then the throne wins it and the Lord is recruitable',
    lf.mid.result === null && lf.mid.lordBeatenFirst && lf.result === 'win' && lf.lordBeatenFirst && !lf.lordFled && /recruit/i.test(lf.notes.join(' ')), JSON.stringify(lf));
  await begin(page, 'castle');
  const tf = await page.evaluate(() => {
    const b = GAME.battle;
    b.throne.damage(GAME, 1e9);
    GAME.simulate(0.2);
    return { result: b.result, lordBeatenFirst: b.lordBeatenFirst, lordFled: b.lordFled, lordAlive: b.lord.alive, fleeing: b.lord.fleeing, notes: b.notes };
  });
  check('castle, throne first: destroying the throne wins; the living Lord flees and is not recruitable',
    tf.result === 'win' && tf.lordFled && !tf.lordBeatenFirst && tf.fleeing && /fled/i.test(tf.notes.join(' ')), JSON.stringify(tf));
  await begin(page, 'castle');
  await knightFalls(page);
  r = await res(page);
  check('castle: the knight falls -> lose', r.result === 'lose', JSON.stringify(r));

  // ---- convoy
  await begin(page, 'convoy');
  const cv0 = await page.evaluate(() => { const b = GAME.battle; return { wagons: b.wagons.length, xs: b.wagons.map((w) => Math.round(w.x)), cargo: b.cargo, exit: b.exitSide, start: [GAME.player.x, GAME.player.y] }; });
  await sim(page, 5);
  const cv1 = await page.evaluate(() => GAME.battle.wagons.map((w) => Math.round(w.x)));
  check('convoy: wagons roll east along the road; the knight starts on the north verge (exit: top)', cv1.every((x, k) => x > cv0.xs[k]) && cv0.exit === 'top' && cv0.start[1] < 100, JSON.stringify({ cv0, cv1 }));
  await page.evaluate(() => { for (const w of GAME.battle.wagons) w.damage(GAME, 1e9); });
  await sim(page, 0.5);
  r = await res(page);
  check('convoy: every wagon destroyed -> win, the cargo added to the spoils', r.result === 'win' && r.gold >= cv0.cargo && /cargo/.test(r.notes.join(' ')), JSON.stringify(r));
  await begin(page, 'convoy');
  await page.evaluate(() => { const b = GAME.battle; b.wagons[0].damage(GAME, 1e9); b.wagons[1].x = b.w - 30; });
  await sim(page, 3);
  r = await res(page);
  check('convoy: a wagon reaching the far edge -> lose', r.result === 'lose' && /got away/.test(r.outcome), JSON.stringify(r));
  await begin(page, 'convoy');
  await page.evaluate(() => { GAME.player.y = 20; });
  await page.keyboard.down('KeyW'); await sim(page, 0.6); await page.keyboard.up('KeyW');
  r = await res(page);
  check('convoy: pushing into your own (top) edge leaves the battle', r.result === 'retreat', JSON.stringify(r));
  await begin(page, 'convoy');
  await knightFalls(page);
  r = await res(page);
  check('convoy: the knight falls -> lose', r.result === 'lose', JSON.stringify(r));

  // ---- defense
  const df0 = await begin(page, 'defense');
  const dfo = await page.evaluate(() => { const b = GAME.battle; return { houses: b.houses.length, mine: b.houses.every((h) => h.team === 'player'), kx: GAME.player.x, hx: b.houses.map((h) => Math.round(h.x)) }; });
  check('defense: the village layout, roles reversed (houses are yours, you start among them)', dfo.mine && dfo.houses >= 3 && dfo.kx > Math.min(...dfo.hx) - 100 && dfo.kx < Math.max(...dfo.hx) + 100, JSON.stringify({ df0, dfo }));
  await page.evaluate(() => { const b = GAME.battle; b.time = WAR.defenseHold - 0.5; });
  await sim(page, 1);
  r = await res(page);
  check('defense: hold 3:00 with a house standing -> win', r.result === 'win' && /held/.test(r.outcome), JSON.stringify(r));
  await begin(page, 'defense');
  await page.evaluate(() => { GAME.battle.leader.applyDamage(GAME, 1e7, 0, 0, 0, 0); const a = GAME.army; a.reserve[TEAM_ENEMY] = { sword: 0, spear: 0, archer: 0, shield: 0, ram: 0, hound: 0 }; let n = 0; for (let i = 0; i < a.cap; i++) if (a.alive[i] && a.team[i] === TEAM_ENEMY && n++ % 4 !== 0) a.hurt(GAME, i, 1e7, 0, 0, false); });
  await sim(page, 1.5);
  r = await res(page);
  check('defense: commander down and under 40% -> the attackers rout -> win', r.result === 'win' && /rout/i.test(r.outcome), JSON.stringify(r));
  await begin(page, 'defense');
  await page.evaluate(() => { for (const h of GAME.battle.houses) h.damage(GAME, 1e9); });
  await sim(page, 0.5);
  r = await res(page);
  check('defense: every house burned -> lose', r.result === 'lose' && /lost/.test(r.outcome), JSON.stringify(r));
  const raid = await page.evaluate(() => {
    // the Dominion goes for your houses when no defender is in sight; rams hit them
    GAME.enterSandbox(); GAME.startBattle(defenseSpec()); GAME.god = true;
    const b = GAME.battle, p = GAME.player; p.x = 60; p.y = 60;
    GAME.issueOrder('hold');
    const a = GAME.army; for (let i = 0; i < a.cap; i++) if (a.alive[i] && a.team[i] === TEAM_PLAYER) a.hurt(GAME, i, 1e7, 0, 0, false);
    GAME.simulate(60);
    return { hurt: b.houses.filter((h) => h.hp < h.maxHp).length, result: b.result };
  });
  check('defense: undefended, the attackers burn your houses', raid.hurt > 0, JSON.stringify(raid));
  await begin(page, 'defense');
  await knightFalls(page);
  r = await res(page);
  check('defense: the knight falls -> lose', r.result === 'lose', JSON.stringify(r));

  // ---- rescue
  await begin(page, 'rescue');
  await killFoes(page, ['lord']);
  const rs = await page.evaluate(() => {
    const b = GAME.battle, c = b.cell, p = GAME.player;
    const sealedGate = !b.reachable(110, b.h / 2, c.x, c.y) === false;   // breaches: the cell is reachable with every gate shut
    p.x = c.x; p.y = c.y + 20;
    GAME.simulate(4);
    const half = { progress: +c.progress.toFixed(1), general: !!b.general };
    GAME.simulate(5);
    const alarm = GAME.army.reserveCount('enemy') + GAME.army.live('enemy');
    return { alarm, sealedGate, half, freed: !!b.general, ally: b.general && b.general.team, escort: b.general && b.general.escort, objective: b.objective, gates: b.gates.every((g) => g.alive) };
  });
  check('rescue: the breaches reach the cell with every gate shut; 8 s in its ring frees the general (allied, sticks with you) and raises the alarm',
    rs.alarm > 50 && rs.sealedGate && rs.half.progress >= 3.5 && !rs.half.general && rs.freed && rs.ally === 'player' && rs.escort && rs.gates, JSON.stringify(rs));
  await page.evaluate(() => { const p = GAME.player, gen = GAME.battle.general; p.x = 20; p.y = GAME.battle.h / 2; gen.x = 120; gen.y = p.y; });
  await page.keyboard.down('KeyA'); await sim(page, 0.6); await page.keyboard.up('KeyA');
  r = await res(page);
  check('rescue: reaching your edge with the general alive -> win', r.result === 'win' && /rescued/.test(r.outcome), JSON.stringify(r));
  await begin(page, 'rescue');
  await killFoes(page, ['lord']);
  await page.evaluate(() => { const b = GAME.battle, c = b.cell, p = GAME.player; p.x = c.x; p.y = c.y + 20; GAME.simulate(9); b.general.applyDamage(GAME, 1e7, 0, 0, 0, 0); });
  await sim(page, 0.5);
  r = await res(page);
  check('rescue: the general dies -> lose', r.result === 'lose' && /fell/.test(r.outcome), JSON.stringify(r));
  await begin(page, 'rescue');
  await page.evaluate(() => { GAME.player.x = 20; });
  await page.keyboard.down('KeyA'); await sim(page, 0.6); await page.keyboard.up('KeyA');
  r = await res(page);
  check('rescue: leaving without the general is a retreat, not a win', r.result === 'retreat', JSON.stringify(r));
  await begin(page, 'rescue');
  await knightFalls(page);
  r = await res(page);
  check('rescue: the knight falls -> lose', r.result === 'lose', JSON.stringify(r));

  // ---- results screen and back to the map
  await page.evaluate(() => { GAME.enterSandbox(); GAME.startBattle(castleSpec()); GAME.god = true; GAME.battle.lord.applyDamage(GAME, 1e7, 0, 0, 0, 0); GAME.battle.throne.damage(GAME, 1e9); GAME.simulate(0.5); });
  await wait(900);
  await page.screenshot({ path: OUT + '/p5-results-castle.png' });
  await page.keyboard.press('Enter'); await wait(300);
  check('results -> Enter -> back to the battle list', (await page.evaluate(() => GAME.screen)) === 'sandbox');

  // ================================================================ timing (autopilot, default troops)
  const band = { outpost: [80, 160], keep: [120, 240], castle: [240, 360], convoy: [80, 160], defense: [120, 180], rescue: [120, 240], village: [80, 160], field: [120, 180] };
  for (const k of Object.keys(band)) {
    const times = [];
    for (let n = 0; n < TIMING_RUNS; n++) {
      const t = await page.evaluate((k) => {
        GAME.enterSandbox(); GAME.startBattle(window[k + 'Spec']());
        const r = GAME.battle.spec.tier === 1 ? 1 : 4;   // knight upgrades assumed for the tier (rank 1 at tier 1, 4 at tier 2)
        for (const u of Object.keys(GAME.player.upgrades)) GAME.player.upgrades[u] = r;
        GAME.player.refreshStats(true);
        GAME.god = false; GAME.autopilot = true;
        GAME.simulate(600);
        GAME.autopilot = false;
        return { r: GAME.battle.result, t: Math.round(GAME.battle.time) };
      }, k);
      times.push(t);
    }
    const [lo, hi] = band[k];
    const ok = times.every((t) => t.r === 'win' && t.t >= lo && t.t <= hi);
    info(`timing ${k} (band ${lo}-${hi} s)`, times.map((t) => `${t.r} ${t.t}s`).join(', ') + (ok ? '  IN BAND' : '  OUT OF BAND'));
    results.push({ name: `timing ${k}`, ok, info: JSON.stringify(times), timing: true });
  }
  await page.evaluate(() => { for (const u of Object.keys(GAME.player.upgrades)) GAME.player.upgrades[u] = 0; GAME.player.refreshStats(true); GAME.enterSandbox(); });

  check('desktop: no page errors', errors.length === 0, errors.slice(0, 5).join(' | '));
  await ctx.close();
}

async function phone(browser) {
  const ctx = await browser.newContext({ ...devices['iPhone 13 landscape'] });
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(String(e)));
  page.on('console', (m) => { if (m.type() === 'error' && !ignorable(m.text())) errors.push(m.text()); });
  await page.goto(URL); await wait(800);
  const b = await page.evaluate(() => { const r = document.getElementById('game').getBoundingClientRect(); return { x: r.left, y: r.top, w: r.width, h: r.height }; });
  const pt = (x, y) => ({ x: b.x + x / 960 * b.w, y: b.y + y / 540 * b.h });
  let s; await titleTapStart(page);
  await page.evaluate(() => GAME.enterSandbox()); await wait(200);
  // tap the castle siege row
  const at = await page.evaluate(() => { const i = GAME.campaignRows().findIndex((r) => r.spec && r.spec.kind === 'castle'); const a = GAME.campRowAt(i); return { x: a.x + CAMP_ROW.w / 2, y: a.y + CAMP_ROW.h / 2 }; });
  s = pt(at.x, at.y); await page.touchscreen.tap(s.x, s.y); await wait(1200);
  const st = await page.evaluate(() => ({ screen: GAME.screen, kind: GAME.battle.spec.kind, cap: Army.liveCap(), live: GAME.army.live('enemy'), reserve: GAME.army.reserveCount('enemy') }));
  check('phone: tap the castle row -> siege starts at the phone live cap (60), the rest in reserve', st.screen === 'battle' && st.kind === 'castle' && st.cap === 60 && st.live <= 60 && st.reserve > 0, JSON.stringify(st));
  // play the siege's courtyard fight live (drawn) for a few seconds: frame times
  await page.evaluate(() => { GAME.god = true; const b = GAME.battle; b.gates[0].damage(GAME, 1e9); GAME.player.x = b.gates[0].x + 80; GAME.player.y = b.h / 2; GAME.autopilot = true; GAME.perfWork.fill(0); GAME.perfIdx = 0; });
  await wait(6000);
  const perf = await page.evaluate(() => { const n = GAME.perfIdx, w = Array.from(GAME.perfWork.slice(0, n)).sort((a, b) => a - b); return { frames: n, p50: +w[Math.floor(n * 0.5)].toFixed(1), p95: +w[Math.floor(n * 0.95)].toFixed(1), live: GAME.army.live('player') + GAME.army.live('enemy') }; });
  info('phone: castle courtyard fight, frame work ms', JSON.stringify(perf));
  check('phone: siege fight runs (frames drawn, p95 frame work under 16.7 ms)', perf.frames > 200 && perf.p95 < 16.7, JSON.stringify(perf));
  await page.screenshot({ path: OUT + '/p5-phone-castle.png' });
  await page.evaluate(() => { GAME.autopilot = false; GAME.battle.lord.applyDamage(GAME, 1e7, 0, 0, 0, 0); GAME.battle.gates[1].damage(GAME, 1e9); GAME.battle.throne.damage(GAME, 1e9); });
  await wait(1300);
  s = pt(480, 300); await page.touchscreen.tap(s.x, s.y); await wait(300);
  check('phone: siege won -> tap the results -> back to the battle list', (await page.evaluate(() => GAME.screen)) === 'sandbox');
  check('phone: no page errors', errors.length === 0, errors.slice(0, 5).join(' | '));
  await ctx.close();
}

(async () => {
  const browser = await chromium.launch();
  try { await desktop(browser); await phone(browser); }
  catch (e) { check('script ran to completion', false, String(e && e.stack || e)); }
  await browser.close();
  const fails = results.filter((r) => !r.ok && !r.timing), tfails = results.filter((r) => !r.ok && r.timing);
  console.log(`\n${results.filter((r) => !r.timing).length - fails.length}/${results.filter((r) => !r.timing).length} functional checks passed; timing in band ${results.filter((r) => r.timing && r.ok).length}/${results.filter((r) => r.timing).length}`);
  process.exit(fails.length ? 1 : 0);
})();
