// PLAN v2 Phase 11 (progression and bosses) checks: headless Chromium, desktop + emulated iPhone 13.
const { chromium, devices } = require('playwright');
const path = require('path');
const URL = 'file://' + path.resolve(process.argv[2]);
const OUT = process.argv[3];
const results = [];
const check = (name, ok, info = '') => { results.push({ name, ok, info }); console.log((ok ? 'PASS ' : 'FAIL ') + name + (info ? '  — ' + info : '')); };
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const ignorable = (t) => /fonts\.(googleapis|gstatic)|ERR_|net::/.test(t);
const geom = (page) => page.evaluate(() => { const r = document.getElementById('game').getBoundingClientRect(); return { x: r.left, y: r.top, w: r.width, h: r.height }; });
const toPage = (b, x, y) => ({ x: b.x + x / 960 * b.w, y: b.y + y / 540 * b.h });
const btn = (page, label) => page.evaluate((label) => { const bs = GAME.mapButtons(), i = bs.findIndex((b) => b.label.startsWith(label)); if (i < 0) return null; const a = GAME.mapButtonAt(i, bs.length); return { x: a.x + (a.w || MAP_BTN.w) / 2, y: a.y + MAP_BTN.h / 2, enabled: bs[i].enabled, label: bs[i].label }; }, label);
/** A fresh war, the live map frozen, the Dominion AI off. */
const fresh = (page) => page.evaluate(() => {
  localStorage.removeItem('aerial-conquest-slot1'); GAME.resetSave(); GAME.enterCampaign(); GAME.mapMode = 'browse'; GAME.menuOpen = false;
  const w = GAME.war; if (!w._tick) { w._tick = w.tick; w.tick = () => {}; w.tickAI = () => {}; }
  w.convoys = []; w.enemyConvoyT = 1e9; for (const n of GAME.camp.nodes) w.convoyT[n.id] = 1e9; WAR.reinforceChance = 0;
});
const refreeze = (page) => page.evaluate(() => { const w = GAME.war; if (!w._tick) { w._tick = w.tick; w.tick = () => {}; w.tickAI = () => {}; } });
const key = async (page, k, n = 1) => { for (let i = 0; i < n; i++) { await page.keyboard.press(k); await wait(50); } };

async function desktop(browser) {
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 } });
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(String(e)));
  page.on('console', (m) => { if (m.type() === 'error' && !ignorable(m.text())) errors.push(m.text()); });
  await page.goto(URL); await page.evaluate(() => localStorage.clear()); await page.reload(); await wait(700);
  await page.keyboard.press('Enter'); await wait(400);
  const b = await geom(page);
  await fresh(page);

  // ---- data: the tree, materials, gear
  const data = await page.evaluate(() => {
    const all = {}; for (const t of TALENTS) all[t.id] = true;
    const recipes = [...WEAPONS, ...ARMORS].filter((x) => x.recipe).map((x) => x.recipe);
    return {
      branches: BRANCHES.map((b) => b.id).join(), per: BRANCHES.map((b) => talentsIn(b.id).reduce((s, t) => s + t.cost, 0)), total: apSpent(all),
      command: talentsIn('command').map((t) => `${t.id}:${t.cost}${t.needs ? '<' + t.needs : ''}`).join(),
      mats: MAT_ORDER.length, commons: COMMON_MATS.join(), rares: RARE_MATS.join(), w: WEAPONS.length, a: ARMORS.length,
      recipesOk: recipes.every((r) => r.gold > 0 && Object.keys(r.needs).every((k) => MAT_ORDER.includes(k))),
      golds: WEAPONS.filter((x) => x.recipe).map((x) => x.recipe.gold).join(),
    };
  });
  check('talents: four branches, Blade 11 / Arcana 11 / Survival 10 / Command 10 = 42', data.branches === 'blade,arcana,survival,command' && data.per.join() === '11,11,10,10' && data.total === 42, JSON.stringify(data.per) + ' ' + data.total);
  check('Command branch is PLAN 12.2\'s six (costs and prerequisites)', data.command === 'banner:1,drill:1,steel:1,muster:2<banner,presence:2,host:3<muster', data.command);
  check('materials cut to 4 common + 3 rare; 6 weapon and 6 armour tiers; every recipe costs gold + known materials', data.mats === 7 && data.commons === 'shard,plate,sigil,iron' && data.rares === 'ember,crystal,core' && data.w === 6 && data.a === 6 && data.recipesOk, JSON.stringify(data));

  // ---- warband cap: 12 + talents 36 + L3 castles 12 = 60
  const cap = await page.evaluate(() => {
    const p = GAME.player, c = GAME.camp, out = [GAME.warbandCap()];
    p.skillPoints = 42;
    for (const id of ['banner', 'muster', 'host']) { GAME.learnTalent(id); out.push(GAME.warbandCap()); }
    const castles = c.nodes.filter((n) => n.type === 'castle' && n.territory !== WAR.capitalTerritory);
    for (let k = 0; k < 5; k++) { castles[k].owner = 'player'; castles[k].level = 3; out.push(GAME.warbandCap()); }
    return out;
  });
  check('DONE: warband cap 12 -> +8 Banner -> +12 Muster -> +16 Host -> +3 per L3 castle -> exactly 60, and no higher', cap.join() === '12,20,32,48,51,54,57,60,60', cap.join());

  // ---- SP from conquest: 5 + 22 + 11 + 4 = 42
  await fresh(page);
  const sp = await page.evaluate(() => {
    const c = GAME.camp, w = GAME.war, p = GAME.player;
    const start = p.skillPoints;
    const targets = c.nodes.filter((n) => (n.type === 'castle' || n.type === 'keep') && n.owner === 'enemy');
    const counts = { castle: targets.filter((n) => n.type === 'castle').length, keep: targets.filter((n) => n.type === 'keep').length };
    for (const n of targets) { c.capture(n); w.onCapture(n); }
    GAME.syncWar();
    const all = p.skillPoints;
    // lost and taken again: no second award
    const n = c.castleOf(1); n.owner = 'enemy'; c.capture(n); w.onCapture(n); GAME.syncWar();
    return { start, counts, all, again: p.skillPoints, villages: (() => { const v = c.nodes.find((x) => x.type === 'village' && x.owner === 'enemy'); if (v) { c.capture(v); w.onCapture(v); GAME.syncWar(); } return p.skillPoints; })() };
  });
  check('DONE: SP total = 42: start 5, +2 each of 11 castles, +1 each of 11 keeps, +4 for the capital (PLAN 12.2, keeps 11 not 12)', sp.start === 5 && sp.counts.castle === 11 && sp.counts.keep === 11 && sp.all === 42, JSON.stringify(sp));
  check('first capture only: a castle lost and retaken pays nothing again; villages pay no SP', sp.again === 42 && sp.villages === 42, JSON.stringify(sp));

  // a live keep capture: the results screen says +1 SP
  await fresh(page);
  const live = await page.evaluate(() => {
    const c = GAME.camp, n = c.territories[1].nodes.find((m) => m.type === 'keep'), before = GAME.player.skillPoints;
    GAME.attackNode(n); GAME.god = true;
    const bt = GAME.battle;
    for (const g of bt.gates) g.damage(GAME, 1e9);
    bt.captain.applyDamage(GAME, 1e8, 0, 0, 0, 0);
    GAME.simulate(0.5);
    return { before, after: GAME.player.skillPoints, notes: bt.notes.join(' | '), captain: bt.spec.captainName };
  });
  await wait(800); await page.keyboard.press('Enter'); await wait(300); await refreeze(page);
  check('a keep taken live: +1 SP, noted on the results screen; its Captain is named', live.after === live.before + 1 && /\+1 SP/.test(live.notes) && /^Captain \w+/.test(live.captain), JSON.stringify(live));

  // ---- knight upgrades: menu on the map, Knight tab, 100 x rank^2
  await fresh(page);
  await page.evaluate(() => { GAME.player.gold = 2000; });
  let q = await page.evaluate(() => ({ x: MAP_MENU_HIT.x + MAP_MENU_HIT.w / 2, y: MAP_MENU_HIT.y + MAP_MENU_HIT.h / 2 }));
  let s = toPage(b, q.x, q.y); await page.mouse.click(s.x, s.y); await wait(150);
  const opened = await page.evaluate(() => GAME.menuOpen);
  await key(page, 'Digit4'); await wait(80);
  const kt = await page.evaluate(() => GAME.menuTab);
  await page.screenshot({ path: OUT + '/p11-knight-tab.png' });
  await key(page, 'Enter'); await key(page, 'Enter');
  const up1 = await page.evaluate(() => ({ gold: GAME.player.gold, v: GAME.player.upgrades.vitality, hp: GAME.player.stats.maxHp }));
  await key(page, 'ArrowDown'); await key(page, 'Enter');
  const up2 = await page.evaluate(() => ({ gold: GAME.player.gold, m: GAME.player.upgrades.might, cost: GAME.upgradeCost('vitality') }));
  check('map MENU button opens the pause menu; 4 = Knight tab', opened && kt === 3, JSON.stringify({ opened, kt }));
  check('Knight tab: Enter buys a rank at 100 x rank^2 (100, then 400), next costs 900', up1.v === 2 && up1.gold === 1500 && up2.m === 1 && up2.gold === 1400 && up2.cost === 900, JSON.stringify({ up1, up2 }));
  const maxed = await page.evaluate(() => { const p = GAME.player; p.upgrades.arcana = 10; p.gold = 1e6; const g = p.gold; GAME.buyUpgrade('arcana'); return { cost: GAME.upgradeCost('arcana'), spent: g - p.gold, rank: p.upgrades.arcana }; });
  check('rank 10 is the cap: no cost, no purchase', maxed.cost === 0 && maxed.spent === 0 && maxed.rank === 10, JSON.stringify(maxed));
  await page.evaluate(() => { GAME.player.gold = 1400; });

  // ---- talents tab: 4 columns, learn Command by key and by tap
  await key(page, 'Digit3');
  const tal = await page.evaluate(() => { GAME.player.skillPoints = 5; GAME.talentBranch = 0; GAME.talentIndex = 0; return GAME.menuTab; });
  await key(page, 'ArrowLeft'); await wait(50);
  const br = await page.evaluate(() => GAME.talentBranch);
  await key(page, 'Enter');
  const l1 = await page.evaluate(() => ({ banner: !!GAME.player.talents.banner, cap: GAME.warbandCap() }));
  q = await page.evaluate(() => ({ x: 26 + 3 * (talentColW() + 10) + 40, y: MENU_LIST.y + 40 + 2 * 26 + 12 }));
  s = toPage(b, q.x, q.y); await page.mouse.click(s.x, s.y); await wait(80); await page.mouse.click(s.x, s.y); await wait(120);
  const l2 = await page.evaluate(() => ({ steel: !!GAME.player.talents.steel, free: GAME.apFree() }));
  await page.screenshot({ path: OUT + '/p11-talents.png' });
  check('Talents tab has 4 columns: Left wraps to Command, Enter learns Rally Banner (cap 20); a double tap learns Sharpened Steel', tal === 2 && br === 3 && l1.banner && l1.cap === 20 && l2.steel && l2.free === 3, JSON.stringify({ tal, br, l1, l2 }));

  // ---- forge: gold + materials, from the map
  await key(page, 'Digit2');
  const f0 = await page.evaluate(() => { const p = GAME.player; p.inv = { shard: 10, iron: 10, plate: 0, sigil: 0, ember: 0, crystal: 0, core: 0 }; p.gold = 1000; GAME.synthIndex = GAME.synthEntries().findIndex((e) => e.id === 'w2'); return { tab: GAME.menuTab, state: GAME.synthEntries()[GAME.synthIndex].state }; });
  await page.screenshot({ path: OUT + '/p11-forge.png' });
  await key(page, 'Enter');
  const f1 = await page.evaluate(() => { const p = GAME.player; return { gold: p.gold, shard: p.inv.shard, iron: p.inv.iron, owned: p.ownedWeapons.includes('w2'), weapon: p.weapon.id }; });
  check('DONE: forge spends gold + materials (Iron Fang: 150 gold, 4 shard, 3 iron)', f0.tab === 1 && f0.state === 'ready' && f1.gold === 850 && f1.shard === 6 && f1.iron === 7 && f1.owned && f1.weapon === 'w2', JSON.stringify({ f0, f1 }));
  const poor = await page.evaluate(() => { const p = GAME.player; p.gold = 100; const e = GAME.synthEntries().find((x) => x.id === 'a2'); p.inv.plate = 10; const st = e.state; GAME.craft(GAME.synthEntries().find((x) => x.id === 'a2')); return { st, owned: p.ownedArmors.includes('a2'), gold: p.gold, plate: p.inv.plate }; });
  check('materials but not the gold: not forgeable, nothing spent', poor.st === 'lack' && !poor.owned && poor.gold === 100 && poor.plate === 10, JSON.stringify(poor));
  await key(page, 'Escape');
  const closed = await page.evaluate(() => ({ open: GAME.menuOpen, screen: GAME.screen }));
  check('Escape closes the menu and stays on the map', !closed.open && closed.screen === 'campaign', JSON.stringify(closed));

  // castle panel Forge button
  await page.evaluate(() => { GAME.selectNodeForTest = null; GAME.mapSel = GAME.camp.castleOf(0).id; });
  const fb = await btn(page, 'Forge');
  await page.screenshot({ path: OUT + '/p11-castle-panel.png' });
  if (fb) { s = toPage(b, fb.x, fb.y); await page.mouse.click(s.x, s.y); await wait(120); }
  const ff = await page.evaluate(() => ({ open: GAME.menuOpen, tab: GAME.menuTab }));
  check('your castle\'s panel has Forge: opens the menu on the Forge tab', !!fb && ff.open && ff.tab === 1, JSON.stringify({ fb, ff }));
  await key(page, 'Escape');
  const inBattle = await page.evaluate(() => {
    const p = GAME.player; p.gold = 5000; p.inv.plate = 50; p.inv.shard = 50;
    GAME.attackNode(GAME.camp.territories[1].nodes.find((m) => m.type === 'village'));
    const e = GAME.synthEntries().find((x) => x.id === 'a2'); GAME.craft(e);
    const r = { can: GAME.canForge(), owned: p.ownedArmors.includes('a2'), gold: p.gold };
    GAME.enterCampaign(); return r;
  });
  await refreeze(page);
  check('no forging mid-battle (needs a castle, from the map)', !inBattle.can && !inBattle.owned && inBattle.gold === 5000, JSON.stringify(inBattle));

  // ---- reload: upgrades, talents, SP, first captures survive
  await fresh(page);
  const before = await page.evaluate(() => {
    const p = GAME.player, c = GAME.camp, w = GAME.war;
    p.gold = 5000; GAME.buyUpgrade('vitality'); GAME.buyUpgrade('vitality'); GAME.buyUpgrade('might');
    const k = c.territories[1].nodes.find((m) => m.type === 'keep'); c.capture(k); w.onCapture(k); GAME.syncWar();
    GAME.learnTalent('drill'); GAME.learnTalent('presence');
    GAME.save();
    return { up: { ...p.upgrades }, t: Object.keys(p.talents).filter((x) => p.talents[x]).sort().join(), sp: p.skillPoints, free: GAME.apFree(), gold: p.gold, taken: w.spTaken.length, hp: p.stats.maxHp };
  });
  await page.reload(); await wait(700); await page.keyboard.press('Enter'); await wait(400); await refreeze(page);
  const after = await page.evaluate(() => {
    const p = GAME.player, w = GAME.war;
    return { up: { ...p.upgrades }, t: Object.keys(p.talents).filter((x) => p.talents[x]).sort().join(), sp: p.skillPoints, free: GAME.apFree(), gold: p.gold, taken: w.spTaken.length, hp: p.stats.maxHp, loy: w.loyaltyMult === WAR.presenceMult, screen: GAME.screen };
  });
  check('DONE: upgrades, talents, SP and first captures survive a reload', JSON.stringify(before.up) === JSON.stringify(after.up) && before.t === after.t && before.sp === after.sp && before.free === after.free && before.gold === after.gold && before.taken === after.taken && before.hp === after.hp && after.loy, JSON.stringify({ before, after }));
  const retake = await page.evaluate(() => { const c = GAME.camp, w = GAME.war, k = c.territories[1].nodes.find((m) => m.type === 'keep'); const sp = GAME.player.skillPoints; k.owner = 'enemy'; c.capture(k); w.onCapture(k); GAME.syncWar(); return GAME.player.skillPoints - sp; });
  check('...and a keep taken before the reload pays no second SP after it', retake === 0, String(retake));

  // ---- Command talents in battle and in the sim
  await fresh(page);
  const cmd = await page.evaluate(() => {
    let p = GAME.player; const c = GAME.camp, w = GAME.war;
    const n = c.territories[1].nodes.find((m) => m.type === 'village');
    const unit = () => { const a = GAME.army; for (let i = 0; i < a.cap; i++) if (a.alive[i] && a.team[i] === 0 && a.type[i] === 0) return { hp: a.maxHp[i], atk: a.atk[i] }; };
    const sim = () => w.sideMult ? null : null;
    GAME.attackNode(n); const u0 = unit(), s0 = GAME.army.streamMult[0]; GAME.enterCampaign();
    p = GAME.player;   // the map reloads the knight from the save
    p.skillPoints = 42; for (const id of ['banner', 'drill', 'steel', 'muster', 'presence', 'host']) GAME.learnTalent(id);
    GAME.war.warband = GAME.war.recruitList(12, 0);
    GAME.attackNode(n); const u1 = unit(), s1 = GAME.army.streamMult[0];
    GAME.simulate(1.7);   // past the wave intro: the army reads the knight's position each frame
    // presence: a unit by the knight hits 20% harder than one far off
    const a = GAME.army; let near = -1, far = -1;
    for (let i = 0; i < a.cap; i++) if (a.alive[i] && a.team[i] === 0) { const d = Math.hypot(a.x[i] - p.x, a.y[i] - p.y); if (d < 250 && near < 0) near = i; }
    p = GAME.player;
    const pn = near >= 0 ? a.power(near) / a.atk[near] : 0;
    if (near >= 0) { p.x += 2000; GAME.simulate(0.02); p.x -= 0; }
    const pf = near >= 0 ? a.power(near) / a.atk[near] : 0;
    GAME.enterCampaign();
    return { u0, u1, s0, s1, pn: +pn.toFixed(3), pf: +pf.toFixed(3), troop: +GAME.war.troopMult().toFixed(4) };
  });
  await refreeze(page);
  check('Drillmaster + Grand Host: troop HP x1.3; Sharpened Steel: damage x1.15; Muster: reserves stream 30% faster', Math.abs(cmd.u1.hp / cmd.u0.hp - 1.3) < 0.02 && Math.abs(cmd.u1.atk / cmd.u0.atk - 1.15) < 0.001 && cmd.s0 === 1 && Math.abs(cmd.s1 - 1 / 1.3) < 1e-6, JSON.stringify(cmd));
  check('Warlord\'s Presence: your troops within 300 px of the knight hit +20%, not beyond', cmd.pn === 1.2 && cmd.pf === 1, JSON.stringify(cmd));
  check('the off-screen sim counts the same talents (x1.3 HP x 1.15 damage = x1.495)', cmd.troop === 1.495, String(cmd.troop));

  // ---- Thornhounds: packs of 6 at tier 4-5, and in the warlord's armies
  await fresh(page);
  const hounds = await page.evaluate(() => {
    const c = GAME.camp, w = GAME.war, out = {};
    for (const t of c.territories) { const n = c.castleOf(t.id); if (n.owner !== 'enemy') continue; out[t.id] = [c.battleTier(n), c.battleSpec(n).foes.hound || 0, w.defendersOf(n).hound]; }
    // a muster out of the warlord's land
    const cap = c.castleOf(WAR.capitalTerritory), target = c.castleOf(10); target.owner = 'player';
    w.musters = [{ from: cap.id, target: target.id, size: 10, t: 0 }];
    const before = w.armies.length; w.tickAI = War.prototype.tickAI; w.clock = 1e9; w.tickAI(0.01); w.tickAI = () => {};
    const army = w.armies[before];
    return { out, army: army ? army.units : null };
  });
  const tiers = Object.values(hounds.out);
  check('Thornhounds: 6 per pack, 1 pack at tier 4, 2 at tier 5, none below; garrisons hold them too', tiers.every(([t, h, d]) => h === [0, 0, 0, 6, 12][t - 1] && d === h) && tiers.some(([t]) => t === 5) && tiers.some(([t]) => t === 4), JSON.stringify(hounds.out));
  check('an army marching out of the warlord\'s land brings a pack', !!hounds.army && hounds.army.hound === 6, JSON.stringify(hounds.army));

  // ---- castle spoils: the Lord's rare, by territory tier
  await fresh(page);
  const rare = await page.evaluate(() => {
    const c = GAME.camp, n = c.castleOf(1);
    GAME.attackNode(n); GAME.god = true;
    GAME.battle.throne.damage(GAME, 1e9); GAME.simulate(0.5);
    const m = GAME.battle.spoils.mats;
    return { mats: m, commonsOnly: Object.keys(m).every((k) => COMMON_MATS.includes(k) || k === 'ember') };
  });
  await wait(800); await page.keyboard.press('Enter'); await wait(300); await refreeze(page);
  check('a tier-1 castle pays 2 Wisp Ember (its Lord\'s rare) on top of commons only', rare.mats.ember === 2 && rare.commonsOnly, JSON.stringify(rare));

  // ---- the warlord
  await fresh(page);
  const wl = await page.evaluate(() => {
    const c = GAME.camp, cap = c.castleOf(WAR.capitalTerritory), spec = c.battleSpec(cap); GAME.war.dressCastle(spec, cap);
    GAME.battleFrom = 'map'; GAME.startBattle(spec); GAME.god = true;
    const e = GAME.battle.lord, out = { warlord: spec.warlord, name: e.def.name, moves: e.boss.moves.join(), phases: [], hp: e.maxHp, hounds: spec.foes.hound };
    out.phases.push([e.phase, e.boss.pattern, e.def.ai]);
    e.aggro = true;
    GAME.simulate(2);   // past the wave intro (nothing moves for its first 1.6 s)
    for (const f of [0.7, 0.45, 0.2]) {
      e.hp = Math.round(e.maxHp * f); e.state = 'chase';
      GAME.simulate(0.1);
      out.phases.push([e.phase, e.def.ai, e.radius]);
    }
    return out;
  });
  check('the capital fields Warlord Garrick Thorne: Thornline + Howl, 12 Thornhounds', wl.warlord && wl.name === 'Warlord Garrick Thorne' && wl.moves === 'thorns,howl' && wl.hounds === 12, JSON.stringify(wl));
  check('all four patterns in phases: brute -> stalker -> sorcerer -> skylord at 75 / 50 / 25% HP', wl.phases.map((p) => p[0] + ':' + (p.length === 3 && typeof p[2] === 'string' ? p[2] : p[1])).join() === '0:bruiser,1:grunt,2:caster,3:flyer', JSON.stringify(wl.phases));
  const moves = await page.evaluate(() => {
    const e = GAME.battle.lord, p = GAME.player, a = GAME.army, hi = UNIT_ORDER.indexOf('hound');
    const count = () => { let n = 0; for (let i = 0; i < a.cap; i++) if (a.alive[i] && a.type[i] === hi && a.team[i] === 1) n++; return n; };
    // clear the field's hounds, then Howl
    for (let i = 0; i < a.cap; i++) if (a.alive[i] && a.type[i] === hi) a.hurt(GAME, i, 1e9, 0, 0, false);
    const h0 = count();
    e.x = p.x + 150; e.y = p.y; e.state = 'special'; e.move = 'howl'; e.moveFrame = 0; e.moveStep = 0;
    let h1 = -1; const howl = GAME.warlordHowl; GAME.warlordHowl = function (x) { howl.call(this, x); h1 = count(); };
    GAME.simulate(1.2);
    GAME.warlordHowl = howl;
    // Thornline: count the shocks
    let shocks = 0; const orig = GAME.bossShock; GAME.bossShock = function (...args) { shocks++; return orig.apply(this, args); };
    e.state = 'special'; e.move = 'thorns'; e.moveFrame = 0; e.moveStep = 0; e.facing = Math.PI;
    GAME.simulate(1.8);
    GAME.bossShock = orig;
    // beaten before the throne
    e.applyDamage(GAME, 1e8, 0, 0, 0, 0);
    return { h0, h1, shocks, banner: GAME.bannerMsg, sub: GAME.bannerSub };
  });
  await page.screenshot({ path: OUT + '/p11-warlord.png' });
  check('Howl calls a pack of 6 Thornhounds; Thornline is 6 shocks marching out', moves.h0 === 0 && moves.h1 === 6 && moves.shocks === 6, JSON.stringify(moves));
  check('beaten before the throne: "FALLS", not the Lord\'s recruit line', /GARRICK THORNE FALLS/.test(moves.banner) && !/recruit/i.test(moves.sub || ''), JSON.stringify(moves));
  const core = await page.evaluate(() => { GAME.battle.throne.damage(GAME, 1e9); GAME.simulate(0.5); return { mats: GAME.battle.spoils.mats, notes: GAME.battle.notes.join(' | '), pending: GAME.pendingRecruit }; });
  await wait(800); await page.keyboard.press('Enter'); await wait(300); await refreeze(page);
  check('the warlord pays 3 Void Core (the top rare); no recruit offer; +6 SP for the capital', core.mats.core === 3 && core.pending === null && /\+6 SP/.test(core.notes), JSON.stringify(core));

  // the debug list has the warlord too
  const sb = await page.evaluate(() => { GAME.enterSandbox(); const rows = GAME.campaignRows(); const i = rows.findIndex((r) => /warlord/i.test(r.label)); const at = GAME.campRowAt(i); return { i, n: rows.length, at, w: CAMP_ROW.w, bottom: GAME.campRowAt(rows.length - 1).y + CAMP_ROW.h }; });
  await page.screenshot({ path: OUT + '/p11-sandbox.png' });
  check('debug battle list: the warlord\'s battle, list still fits on screen', sb.i >= 0 && sb.bottom <= 540 - 20 && sb.at.x + sb.w <= 960, JSON.stringify(sb));

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
  let s = toPage(b, 480, 278); await page.touchscreen.tap(s.x, s.y); await wait(600);
  await page.evaluate(() => { const w = GAME.war; w._tick = w.tick; w.tick = () => {}; GAME.player.gold = 500; });
  const q = await page.evaluate(() => ({ x: MAP_MENU_HIT.x + MAP_MENU_HIT.w / 2, y: MAP_MENU_HIT.y + MAP_MENU_HIT.h / 2 }));
  s = toPage(b, q.x, q.y); await page.touchscreen.tap(s.x, s.y); await wait(250);
  const open = await page.evaluate(() => GAME.menuOpen);
  const tab = await page.evaluate(() => ({ x: MENU_TAB.x + 3 * (MENU_TAB.w + MENU_TAB.gap) + MENU_TAB.w / 2, y: MENU_TAB.y + MENU_TAB.h / 2 }));
  s = toPage(b, tab.x, tab.y); await page.touchscreen.tap(s.x, s.y); await wait(200);
  const row = await page.evaluate(() => { const r = knightRowAt(1); return { x: r.x + 200, y: r.y + 40 }; });
  s = toPage(b, row.x, row.y); await page.touchscreen.tap(s.x, s.y); await wait(200); await page.touchscreen.tap(s.x, s.y); await wait(250);
  const r = await page.evaluate(() => ({ tab: GAME.menuTab, might: GAME.player.upgrades.might, gold: GAME.player.gold }));
  await page.screenshot({ path: OUT + '/p11-phone-knight.png' });
  check('phone: tap MENU on the map, tap KNIGHT, tap Might twice -> rank 1 for 100 gold', open && r.tab === 3 && r.might === 1 && r.gold === 400, JSON.stringify({ open, r }));
  s = toPage(b, 940, 32); await page.touchscreen.tap(s.x, s.y); await wait(200);
  const closed = await page.evaluate(() => ({ open: GAME.menuOpen, screen: GAME.screen }));
  await page.screenshot({ path: OUT + '/p11-phone-map.png' });
  check('phone: the close box shuts the menu, back on the map', !closed.open && closed.screen === 'campaign', JSON.stringify(closed));
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
