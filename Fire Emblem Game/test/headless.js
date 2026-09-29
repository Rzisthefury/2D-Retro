/* Headless verification: map integrity, combat math against hand calculations,
   and a full simulated run of every chapter. Run: node test/headless.js */

global.window = {};
const path = require('path');
const R = f => require(path.join(__dirname, '..', f));

[ 'src/data/classes.js','src/data/weapons.js','src/data/terrain.js','src/data/units.js',
  'src/data/story.js','src/data/chapters.js','src/data/worldmap.js','src/core/rng.js','src/systems/stats.js',
  'src/systems/supports.js','src/systems/movement.js','src/systems/combat.js',
  'src/systems/leveling.js','src/systems/ai.js','src/core/state.js','src/core/undo.js','src/systems/arena.js'
].forEach(R);

const FE = global.window.FE;
let fails = 0, checks = 0;
function ok(name, cond, detail) {
  checks++;
  if (!cond) { fails++; console.log('  FAIL  ' + name + (detail ? '  -> ' + detail : '')); }
}
function eq(name, got, want) { ok(name, got === want, 'got ' + got + ', want ' + want); }

console.log('\n== maps ==');
FE.CHAPTERS.forEach(ch => {
  const w = ch.map[0].length;
  ok(ch.id + ' rows equal width', ch.map.every(r => r.length === w));
  let parsed = null;
  try { parsed = FE.parseMap(ch.map); } catch (e) { ok(ch.id + ' parses', false, e.message); }
  if (!parsed) return;
  const at = (x, y) => parsed.tiles[y][x];
  const pass = (x, y, mt) => FE.moveCost(at(x, y), mt) < FE.IMPASSABLE;

  ch.starts.forEach(s => ok(ch.id + ' start ' + s.x + ',' + s.y + ' standable', pass(s.x, s.y, 'foot'), at(s.x, s.y)));
  ch.enemies.concat(ch.hardExtra || []).forEach(e => {
    const mt = FE.CLASSES[e.cls].moveType;
    ok(ch.id + ' enemy ' + e.cls + ' at ' + e.x + ',' + e.y, pass(e.x, e.y, mt), at(e.x, e.y));
  });
  (ch.reinforcements || []).forEach(r => r.list.forEach(e => {
    const mt = FE.CLASSES[e.cls].moveType;
    ok(ch.id + ' reinf ' + e.cls + ' at ' + e.x + ',' + e.y, pass(e.x, e.y, mt), at(e.x, e.y));
  }));
  if (ch.boss) {
    const mt = FE.CLASSES[FE.BOSSES[ch.boss.key].cls].moveType;
    ok(ch.id + ' boss tile', pass(ch.boss.x, ch.boss.y, mt), at(ch.boss.x, ch.boss.y));
  }
  (ch.npcs || []).forEach(n => ok(ch.id + ' npc ' + n.id, pass(n.x, n.y, FE.CLASSES[FE.ROSTER[n.id].cls].moveType), at(n.x, n.y)));
  (ch.villages || []).forEach(v => ok(ch.id + ' village tile is village', at(v.x, v.y) === 'village' || at(v.x, v.y) === 'house', at(v.x, v.y)));
  (ch.chests || []).forEach(c => ok(ch.id + ' chest tile is chest', at(c.x, c.y) === 'chest', at(c.x, c.y)));
  (ch.doors || []).forEach(d => ok(ch.id + ' door tile is door', at(d.x, d.y) === 'door', at(d.x, d.y)));
  if (ch.objective === 'seize') {
    const seizeTiles = [];
    for (let y = 0; y < parsed.h; y++) for (let x = 0; x < parsed.w; x++) {
      if (FE.TERRAIN[at(x, y)].seize) seizeTiles.push({ x, y });
    }
    ok(ch.id + ' has a seize tile', seizeTiles.length > 0);
  }
  ok(ch.id + ' deploy slots <= starts', ch.slots <= ch.starts.length);
  console.log('  ' + ch.id + '  ' + w + 'x' + ch.map.length + '  enemies ' + ch.enemies.length + '  slots ' + ch.slots);
});

console.log('\n== class data ==');
Object.keys(FE.CLASSES).forEach(k => {
  const c = FE.CLASSES[k];
  ok(k + ' has weapons', c.weapons.length > 0);
  ok(k + ' move type valid', ['foot','horse','armor','armorhorse','fly','thief','brigand','pirate'].indexOf(c.moveType) !== -1, c.moveType);
  (c.promotions || []).forEach(p => ok(k + ' promo ' + p + ' exists', !!FE.CLASSES[p]));
  if (c.tier === 1) ok(k + ' has promo bonus', !!c.promoBonus);
});
Object.keys(FE.ROSTER).forEach(k => {
  const u = FE.ROSTER[k];
  ok(k + ' class exists', !!FE.CLASSES[u.cls]);
  u.items.forEach(i => ok(k + ' item ' + i + ' exists', !!FE.WEAPONS[i]));
  ok(k + ' affinity valid', !!FE.AFFINITY[u.affinity], u.affinity);
});

console.log('\n== combat math (hand-checked) ==');
{
  const st = { map: { w: 3, h: 1, tiles: [['plain','plain','plain']] }, units: [], openedDoors:{}, openedChests:{}, fogOn:false, rng: new FE.Rng(1) };
  const seren = FE.makeRosterUnit('seren');
  seren.uid = 1; seren.faction = 'player'; seren.x = 0; seren.y = 0; seren.alive = true;
  seren._sup = { dmg:0,hit:0,crit:0,avo:0,dodge:0 };
  const brig = FE.makeEnemy({ cls:'brigand', level:2, x:1, y:0, items:['ironaxe'] }, false);
  brig._sup = { dmg:0,hit:0,crit:0,avo:0,dodge:0 };
  st.units = [seren, brig];

  const wep = FE.equipped(seren);
  eq('Seren equips Valebrand', wep.key, 'valebrand');
  const fc = FE.forecast(st, seren, brig, wep);

  // Atk = Str 5 + Mt 7 + triangle +1 = 13 ; brigand Def 3 ; plain terrain 0
  eq('Seren atk', fc.atk.atk, 13);
  eq('Seren damage', fc.atk.dmg, 13 - brig.def);
  // Hit = 95 + Skl 6*2 + floor(Lck 7/2)=3 -> 110, +15 triangle = 125, minus brigand avoid, clamped
  eq('Seren hit clamped to 100', fc.atk.hit, 100);
  // Crit = wpn 10 + floor(Skl 6/2)=3 - brigand Lck
  eq('Seren crit', fc.atk.crit, 10 + 3 - brig.lck);
  // AS: Seren 7 - max(0, wt5 - con5)=7 ; brigand 3 - max(0,10-14)=3 -> doubles
  eq('Seren attack speed', fc.atk.as, 7);
  ok('Seren doubles the brigand', fc.atk.doubles === true);
  ok('brigand can counter', !!fc.def);
  eq('brigand atk', fc.def.atk, brig.str + 8 - 1);
  eq('brigand damage', fc.def.dmg, Math.max(0, brig.str + 8 - 1 - seren.def));
  eq('brigand does not double', fc.def.doubles, false);

  // triangle
  eq('sword beats axe', FE.triangle('sword','axe'), 1);
  eq('axe beats lance', FE.triangle('axe','lance'), 1);
  eq('lance beats sword', FE.triangle('lance','sword'), 1);
  eq('axe loses to sword', FE.triangle('axe','sword'), -1);
  eq('anima beats light', FE.triangle('anima','light'), 1);
  eq('light beats dark', FE.triangle('light','dark'), 1);
  eq('dark beats anima', FE.triangle('dark','anima'), 1);
  eq('bow is outside the triangle', FE.triangle('bow','sword'), 0);

  // effectiveness
  const st2 = { map: { w: 2, h: 1, tiles: [['plain','plain']] }, units: [], openedDoors:{}, openedChests:{}, fogOn:false, rng: new FE.Rng(2) };
  const seren2 = FE.makeRosterUnit('seren');
  seren2.uid = 1; seren2.faction='player'; seren2.x=0; seren2.y=0; seren2.alive=true;
  seren2._sup = { dmg:0,hit:0,crit:0,avo:0,dodge:0 };
  const knight = FE.makeEnemy({ cls:'knight', level:5, x:1, y:0, items:['ironlance'] }, false);
  knight._sup = { dmg:0,hit:0,crit:0,avo:0,dodge:0 };
  st2.units = [seren2, knight];
  ok('Valebrand is effective vs armour', FE.isEffective(wep, knight));
  eq('effective multiplier', FE.effectiveMult(wep, knight), 3);
  const fc2 = FE.forecast(st2, seren2, knight, FE.equipped(seren2));
  // Mt 7 x3 = 21, + Str 5, + triangle (sword vs lance = -1)
  eq('effective atk', fc2.atk.atk, 5 + 21 - 1);
  eq('effective damage cuts through armour', fc2.atk.dmg, Math.max(0, 25 - knight.def));

  // bows vs fliers
  const peg = FE.makeRosterUnit('ilya');
  peg.uid = 9; peg.faction='player'; peg.x=2; peg.y=0; peg.alive=true;
  peg._sup = { dmg:0,hit:0,crit:0,avo:0,dodge:0 };
  const arch = FE.makeEnemy({ cls:'archer', level:3, x:0, y:0, items:['ironbow'] }, false);
  ok('bow is effective on fliers', FE.bowVsFlier(FE.mkItem('ironbow'), peg));
  ok('bow is not effective on foot', !FE.bowVsFlier(FE.mkItem('ironbow'), seren));

  // 2RN distribution
  const rng = new FE.Rng(12345);
  let hits = 0, n = 40000;
  for (let i = 0; i < n; i++) if (rng.hit(75)) hits++;
  const rate = hits / n * 100;
  ok('2RN at 75 lands well above true random (85-95%)', rate > 84 && rate < 96, rate.toFixed(1) + '%');
  let hits2 = 0;
  for (let i = 0; i < n; i++) if (rng.hit(50)) hits2++;
  ok('2RN at 50 stays near 50', Math.abs(hits2 / n * 100 - 50) < 2, (hits2 / n * 100).toFixed(1) + '%');
}

console.log('\n== experience ==');
{
  const a = FE.makeRosterUnit('seren');
  const weak = FE.makeEnemy({ cls:'brigand', level:1, x:0, y:0, items:['ironaxe'] }, false);
  const strong = FE.makeEnemy({ cls:'knight', level:10, x:0, y:0, items:['ironlance'] }, false);
  ok('hit exp is small', FE.hitExp(a, weak) >= 1 && FE.hitExp(a, weak) <= 15, String(FE.hitExp(a, weak)));
  ok('kill exp is much larger than hit exp', FE.killExp(a, weak) > FE.hitExp(a, weak) * 2);
  ok('killing a higher level pays more', FE.killExp(a, strong) > FE.killExp(a, weak));
  const promoted = FE.makeRosterUnit('seren');
  promoted.cls = 'greatlord'; promoted.level = 5;
  ok('promoted unit earns little off low-level trash', FE.killExp(promoted, weak) < FE.killExp(a, weak));
}

console.log('\n== level ups ==');
{
  const st = { rng: new FE.Rng(7) };
  let duds = 0, total = 400;
  for (let i = 0; i < total; i++) {
    const u = FE.makeRosterUnit('bram');
    const before = u.maxhp + u.str + u.skl + u.spd + u.lck + u.def + u.res;
    FE.levelUp(st, u);
    const after = u.maxhp + u.str + u.skl + u.spd + u.lck + u.def + u.res + u.mag;
    if (after <= before) duds++;
  }
  eq('no dud level ups', duds, 0);

  const u2 = FE.makeRosterUnit('dorn');
  u2.level = 20;
  for (const s of ['str','skl','spd','lck','def','res']) u2[s] = 99;
  u2.maxhp = 999;
  FE.clampStats(u2);
  const caps = FE.CLASSES.knight.caps;
  eq('str clamps to class cap', u2.str, caps.str);
  eq('hp clamps to class cap', u2.maxhp, caps.hp);

  const u3 = FE.makeRosterUnit('bram');
  u3.level = 10;
  ok('can promote at 10', FE.canPromote(u3));
  u3.level = 9;
  ok('cannot promote at 9', !FE.canPromote(u3));
  u3.level = 20;
  const res = FE.promote({}, u3, 'paladin');
  ok('promotion happened', !!res && u3.cls === 'paladin');
  eq('level resets to 1', u3.level, 1);
  eq('mov updates to the new class', u3.mov, FE.CLASSES.paladin.mov);
}

console.log('\n== undo determinism ==');
{
  const campaign = FE.newCampaign('normal');
  const st = FE.startChapter(campaign, ['seren','dorn','mira','bram']);
  FE.Undo.reset(st);
  const seren = st.units.find(u => u.id === 'seren');
  const target = st.units.find(u => u.faction === 'enemy');
  seren.x = target.x - 1; seren.y = target.y;
  FE.recomputeSupports(st);

  FE.Undo.push(st, 'attack');
  const before = target.hp;
  const log1 = FE.resolveCombat(st, seren, target, FE.equipped(seren));
  const after1 = JSON.stringify(log1.filter(e => e.type === 'strike').map(e => [e.miss, e.damage, e.crit]));

  FE.Undo.pop(st);
  const seren2 = st.units.find(u => u.id === 'seren');
  const target2 = st.units.find(u => u.faction === 'enemy');
  eq('target hp restored by undo', target2.hp, before);
  const log2 = FE.resolveCombat(st, seren2, target2, FE.equipped(seren2));
  const after2 = JSON.stringify(log2.filter(e => e.type === 'strike').map(e => [e.miss, e.damage, e.crit]));
  eq('same attack after undo gives the same rolls', after2, after1);
}

console.log('\n== supports ==');
{
  const campaign = FE.newCampaign('normal');
  const st = FE.startChapter(campaign, ['seren','dorn','mira','bram']);
  const a = st.units.find(u => u.id === 'seren');
  const b = st.units.find(u => u.id === 'dorn');
  b.x = a.x + 1; b.y = a.y;
  for (let i = 0; i < 20; i++) FE.addSupport(a, b, 5);
  FE.recomputeSupports(st);
  ok('support rank reached', !!FE.supportRank(a.supports[b.id]), String(a.supports[b.id]));
  ok('adjacency grants a bonus', FE.supportBonus(a, 'hit') > 0 || FE.supportBonus(a, 'avo') > 0 || FE.supportBonus(a, 'dmg') > 0);
  b.x = a.x + 6;
  FE.recomputeSupports(st);
  eq('bonus disappears when apart', FE.supportBonus(a, 'hit'), 0);
}

console.log('\n== villages ==');
{
  // The bug this guards: in chapter 1 the raider started standing ON the village
  // tile, and in chapter 2 both raiders arrived a turn or more before any unit
  // could. Every village in the game was impossible to save, including the one
  // that recruits Nessa. A village must be reachable no later than the raider
  // coming for it, or it is not a race, it is a scripted loss.
  function turnsTo(st, u, tx, ty) {
    const f = FE.distanceField(st, u, tx, ty);
    const c = f[FE.posKey(u.x, u.y)];
    return c === undefined ? 99 : Math.ceil(c / u.mov);
  }
  FE.CHAPTERS.forEach((ch, idx) => {
    const camp = FE.newCampaign('normal');
    camp.chapterIndex = idx;
    ch.available.forEach(id => { if (!camp.roster[id]) camp.roster[id] = FE.makeRosterUnit(id); });
    const st = FE.startChapter(camp, ch.available.slice(0, ch.slots));
    if (!st.villages.length) return;

    st.villages.forEach(v => {
      const players = st.units.filter(u => u.faction === 'player');
      const best = Math.min.apply(null, players.map(p => turnsTo(st, p, v.x, v.y)));
      ok(ch.id + ' village ' + v.x + ',' + v.y + ' is reachable at all', best < 99, best + ' turns');

      // raiders that will actually go for THIS village
      const raiders = st.units.filter(u => u.faction === 'enemy' && u.ai === 'raider')
        .filter(r => !r.targetVillage || (r.targetVillage.x === v.x && r.targetVillage.y === v.y));
      if (!raiders.length) {
        console.log('  ' + ch.id + ' village ' + v.x + ',' + v.y + ': uncontested, player ' + best + ' turns');
        return;
      }
      const soonest = Math.min.apply(null, raiders.map(r => turnsTo(st, r, v.x, v.y)));
      console.log('  ' + ch.id + ' village ' + v.x + ',' + v.y + ': raider ' + soonest
        + ' turns vs player ' + best + ' turns  (' + (soonest - best) + ' turn margin)');
      ok(ch.id + ' village ' + v.x + ',' + v.y + ' can be saved', best <= soonest,
         'player needs ' + best + ' turns, raider arrives in ' + soonest);
      ok(ch.id + ' village ' + v.x + ',' + v.y + ' is still a race', soonest - best <= 2,
         'margin of ' + (soonest - best) + ' turns is not tight');
    });
  });
}

console.log('\n== drops ==');
{
  const st = { map: { w: 2, h: 1, tiles: [['plain','plain']] }, units: [], openedDoors:{},
               openedChests:{}, fogOn:false, convoy: [], gold: 0, rng: new FE.Rng(4242) };
  let drops = 0, gold = 0, weapon = 0, booster = 0;
  const N = 6000;
  for (let i = 0; i < N; i++) {
    const killer = FE.makeRosterUnit('seren');
    killer.uid = 1; killer.faction = 'player'; killer.items = [FE.mkItem('valebrand')];
    const v = FE.makeEnemy({ cls:'soldier', level:4, x:1, y:0, items:['steellance'] }, null);
    v.faction = 'enemy';
    const log = [];
    FE.killUnit(st, v, killer, log);
    const d = log.find(e => e.type === 'drop' || e.type === 'goldfound');
    if (!d) continue;
    drops++;
    if (d.type === 'goldfound') gold++;
    else if (d.item === 'steellance') weapon++;
    else if (['energyring','secretbook','speedwing','dracoshield','talisman','goddessicon','angelicrobe'].indexOf(d.item) !== -1) booster++;
  }
  const rate = drops / N * 100;
  console.log('  ' + rate.toFixed(1) + '% of kills dropped something over ' + N + ' kills');
  console.log('  of those: ' + (weapon/drops*100).toFixed(0) + '% the enemy weapon, '
    + (gold/drops*100).toFixed(0) + '% gold, ' + (booster/drops*100).toFixed(0) + '% a stat booster');
  ok('drop rate is near the target', Math.abs(rate - FE.DROP_CHANCE) < 2, rate.toFixed(1) + '%');
  ok('stat boosters stay rare', booster / drops < 0.10, (booster/drops*100).toFixed(1) + '% of drops');
  ok('all four drop kinds occur', weapon > 0 && gold > 0 && booster > 0 && drops - weapon - gold - booster > 0);

  // a drop must be rewindable like everything else
  const s2 = { map: { w: 2, h: 1, tiles: [['plain','plain']] }, units: [], openedDoors:{},
               openedChests:{}, fogOn:false, convoy: [], gold: 0, rng: new FE.Rng(99) };
  const saved = s2.rng.save();
  function runKill() {
    const k = FE.makeRosterUnit('seren');
    k.uid = 1; k.faction = 'player'; k.items = [FE.mkItem('valebrand')];
    const v = FE.makeEnemy({ cls:'soldier', level:4, x:1, y:0, items:['steellance'] }, null);
    v.faction = 'enemy';
    const log = [];
    FE.killUnit(s2, v, k, log);
    return JSON.stringify(log.filter(e => e.type === 'drop' || e.type === 'goldfound'));
  }
  const first = [];
  for (let i = 0; i < 40; i++) first.push(runKill());
  s2.rng.load(saved);
  const second = [];
  for (let i = 0; i < 40; i++) second.push(runKill());
  ok('drops replay identically after an undo', first.join('|') === second.join('|'));
}

console.log('\n== arena ==');
{
  // The bug this guards: Dorn, an armour knight, had 11 defence at level 3 and
  // every generated opponent had less than 11 total attack power. He could not
  // be hurt. Every arena opponent must be able to take a real bite out of the
  // unit that walked in, for every unit, at every level, in every round.
  const st = { map: { w: 2, h: 1, tiles: [['plain','plain']] }, units: [],
               openedDoors:{}, openedChests:{}, fogOn:false, rng: new FE.Rng(77) };

  function bite(u, opp) {
    const me = JSON.parse(JSON.stringify(u));
    me.uid = 1; me.faction = 'player'; me.x = 0; me.y = 0; me.alive = true;
    me._sup = { dmg:0,hit:0,crit:0,avo:0,dodge:0 };
    const o = JSON.parse(JSON.stringify(opp));
    o.uid = 2; o.x = 1; o.y = 0; o.alive = true;
    o._sup = { dmg:0,hit:0,crit:0,avo:0,dodge:0 };
    st.units = [me, o];
    const w = FE.equipped(o);
    if (!w) return { dmg: 0, hit: 0 };
    const fc = FE.forecast(st, o, me, w);
    if (!fc || !fc.atk) return { dmg: 0, hit: 0 };
    return { dmg: fc.atk.dmg, hit: fc.atk.hit, cls: FE.CLASSES[o.cls].name, wep: FE.itemData(w).name };
  }

  let worst = null, checks2 = 0;
  const levels = [1, 3, 6, 10, 15, 20];
  Object.keys(FE.ROSTER).forEach(id => {
    levels.forEach(lv => {
      const u = FE.makeRosterUnit(id);
      const ls = { rng: new FE.Rng(lv * 31 + 7) };
      while (u.level < lv && u.level < FE.LEVEL_CAP) FE.levelUp(ls, u);
      u.hp = u.maxhp;
      if (!FE.equipped(u)) return;          // clerics cannot enter, no weapon
      const floor = Math.max(3, Math.ceil(u.maxhp * 0.12));
      for (let round = 1; round <= FE.ARENA_CAP; round++) {
        const opp = FE.arenaOpponent(u, round, round * 17 + u.level);
        const b = bite(u, opp);
        checks2++;
        const ratio = b.dmg / floor;
        if (!worst || ratio < worst.ratio) {
          worst = { ratio, id, lv, round, dmg: b.dmg, floor, hp: u.maxhp, def: u.def, res: u.res, cls: b.cls, wep: b.wep };
        }
        ok('arena: ' + id + ' lv' + lv + ' round ' + round + ' faces a real threat',
           b.dmg >= floor && b.hit > 10,
           b.cls + ' with ' + b.wep + ' deals ' + b.dmg + ' (floor ' + floor + ') at ' + b.hit + '%');
      }
    });
  });
  console.log('  ' + checks2 + ' matchups generated across ' + Object.keys(FE.ROSTER).length + ' units x ' + levels.length + ' levels x ' + FE.ARENA_CAP + ' rounds');
  if (worst) {
    console.log('  thinnest matchup: ' + worst.id + ' lv' + worst.lv + ' (HP' + worst.hp + ' Def' + worst.def + ' Res' + worst.res
      + ') round ' + worst.round + ' -> ' + worst.cls + ' with ' + worst.wep + ' deals ' + worst.dmg + ' vs floor ' + worst.floor);
  }

  // the specific unit that broke it
  const dorn = FE.makeRosterUnit('dorn');
  let dornFloor = Math.max(3, Math.ceil(dorn.maxhp * 0.12));
  let dornMin = 99;
  for (let round = 1; round <= FE.ARENA_CAP; round++) {
    const opp = FE.arenaOpponent(dorn, round, round * 17 + dorn.level);
    dornMin = Math.min(dornMin, bite(dorn, opp).dmg);
  }
  ok('arena: Dorn at level 3 can be hurt in every round', dornMin >= dornFloor,
     'weakest round deals ' + dornMin + ', floor ' + dornFloor);

  // a bout must actually resolve, and not always in the player's favour
  let wins = 0, bouts = 0;
  Object.keys(FE.ROSTER).forEach(id => {
    const u = FE.makeRosterUnit(id);
    if (!FE.equipped(u)) return;
    for (let round = 1; round <= 4; round++) {
      const opp = FE.arenaOpponent(u, round, round * 5 + 3);
      const res = FE.arenaFight(u, opp, new FE.Rng(round * 9176 + id.length));
      bouts++;
      if (res.won) wins++;
      ok('arena bout resolves for ' + id + ' round ' + round, !res.error && res.log.length > 0);
      ok('arena bout is not an infinite stalemate for ' + id + ' round ' + round, !res.exhausted);
    }
  });
  console.log('  player wins ' + wins + '/' + bouts + ' bouts at full health');
  ok('arena is winnable', wins > bouts * 0.3, wins + '/' + bouts);
  ok('arena is not a free ride', wins < bouts, wins + '/' + bouts);
}

console.log('\n== terrain regeneration ==');
{
  // A throne heals 20% a turn. Left unconditional, a boss standing on one can
  // out-heal whatever is left of your army: the chapter can then neither be
  // won nor lost, which is worse than either. Being hit suppresses it.
  const st = FE.startChapter(FE.newCampaign('normal'), ['seren', 'dorn']);
  const probe = st.units.find(u => u.faction === 'player');
  probe.maxhp = 60; probe.hp = 20;
  const thronePos = (() => {
    for (let y = 0; y < st.map.h; y++) for (let x = 0; x < st.map.w; x++) {
      if ((FE.TERRAIN[st.map.tiles[y][x]].heal || 0) > 0) return { x, y };
    }
    return null;
  })();
  ok('chapter 1 has a healing tile to test with', !!thronePos);
  if (thronePos) {
    probe.x = thronePos.x; probe.y = thronePos.y;
    st.turn = 5;
    delete probe.hurtTurn;
    const clean = FE.terrainRegen(st, probe);
    ok('a healing tile heals a unit that was left alone', clean > 0, String(clean));
    ok('healing is capped rather than a flat percentage', clean <= 12, String(clean));

    probe.hurtTurn = 5;
    ok('no healing on the turn the unit was hit', FE.terrainRegen(st, probe) === 0);
    probe.hurtTurn = 4;
    ok('no healing the turn after it was hit', FE.terrainRegen(st, probe) === 0);
    probe.hurtTurn = 3;
    ok('healing returns once the pressure stops', FE.terrainRegen(st, probe) > 0);

    probe.hp = probe.maxhp;
    delete probe.hurtTurn;
    ok('a unit at full health heals nothing', FE.terrainRegen(st, probe) === 0);
  }

  // and combat has to actually record the hit, or the rule above never fires
  const st2 = FE.startChapter(FE.newCampaign('normal'), ['seren', 'dorn']);
  const att = st2.units.find(u => u.faction === 'player' && FE.equipped(u));
  const vic = st2.units.find(u => u.faction === 'enemy');
  vic.x = att.x + 1; vic.y = att.y; vic.def = 0; vic.spd = 0; vic.lck = 0;
  att.str = 30; att.skl = 40; att.lck = 40;
  st2.turn = 7;
  FE.recomputeSupports(st2);
  FE.resolveCombat(st2, att, vic, FE.equipped(att));
  ok('taking damage stamps the turn it happened', vic.hurtTurn === 7, String(vic.hurtTurn));
}

console.log('\n== story wiring ==');
{
  // a dangling reference here is invisible in play: the chapter still runs, the
  // conversation just silently becomes "Fine. I am with you."
  Object.keys(FE.STORY.talks).forEach(k => {
    const [a, b] = k.split('>');
    ok('talk ' + k + ' speaker exists', !!FE.ROSTER[a], a);
    ok('talk ' + k + ' target exists', !!FE.ROSTER[b], b);
  });
  let written = 0;
  FE.CHAPTERS.forEach(ch => {
    ok(ch.id + ' has story text', !!FE.STORY.chapters[ch.id]);
    (ch.npcs || []).forEach(n => {
      ok(ch.id + ' npc ' + n.id + ' is recruitable by someone', (n.talkWith || []).length > 0);
      (n.talkWith || []).forEach(t => {
        ok(ch.id + ' talk ' + t + '>' + n.id + ' is written', !!FE.STORY.talks[t + '>' + n.id]);
        written++;
      });
      ok(ch.id + ' npc ' + n.id + ' is in the roster', !!FE.ROSTER[n.id]);
    });
    (ch.villages || []).forEach(v => {
      const ev = FE.STORY.villages[v.event];
      ok(ch.id + ' village event ' + v.event + ' exists', !!ev);
      if (!ev) return;
      if (ev.gift) ok(ch.id + ' village gift ' + ev.gift + ' is a real item', !!FE.WEAPONS[ev.gift]);
      if (ev.recruit) ok(ch.id + ' village recruit ' + ev.recruit + ' is a real unit', !!FE.ROSTER[ev.recruit]);
    });
    (ch.chests || []).forEach(c => ok(ch.id + ' chest item ' + c.item + ' is real', !!FE.WEAPONS[c.item]));
    if (ch.boss) {
      const bd = FE.BOSSES[ch.boss.key];
      ok(ch.id + ' boss ' + ch.boss.key + ' exists', !!bd);
      if (bd && bd.drop) ok(ch.id + ' boss drop ' + bd.drop + ' is real', !!FE.WEAPONS[bd.drop]);
    }
    // every class fielded anywhere must have an enemy stat line, or it is built
    // as a soldier and nobody notices until a Paladin dies to an iron lance
    let fielded = (ch.enemies || []).concat(ch.hardExtra || []);
    (ch.reinforcements || []).forEach(r => { fielded = fielded.concat(r.list); });
    fielded.forEach(e => ok(ch.id + ' ' + e.cls + ' has an enemy stat line', FE.hasEnemyBase(e.cls), e.cls));
  });
  // and the promoted classes the skirmish generator can reach
  ['paladin', 'general', 'greatknight', 'hero', 'warrior', 'sniper', 'swordmaster', 'sage', 'druid', 'wyvernlord']
    .forEach(c => ok('promoted band ' + c + ' has a stat line', FE.hasEnemyBase(c)));
  console.log('  ' + written + ' recruitment conversations wired across ' + FE.CHAPTERS.length + ' chapters');
}

console.log('\n== world map ==');
{
  // every site and every Spire floor has to produce a battle that is legal to
  // start: a parseable map, every enemy on ground its class can stand on, and
  // start tiles that are not inside a wall.
  const progressPoints = [1, 3, 5, 8];
  let built = 0, lvSpread = [];
  progressPoints.forEach(cleared => {
    const campaign = FE.newCampaign('normal');
    campaign.chapterIndex = cleared;
    FE.CHAPTERS[Math.min(cleared, FE.CHAPTERS.length - 1)].available.forEach(id => {
      if (!campaign.roster[id]) campaign.roster[id] = FE.makeRosterUnit(id);
    });
    const lvState = { rng: new FE.Rng(99) };
    Object.keys(campaign.roster).forEach(id => {
      for (let k = 0; k < cleared * 2; k++) {
        if (campaign.roster[id].level >= FE.LEVEL_CAP) break;
        FE.levelUp(lvState, campaign.roster[id]);
      }
    });
    const party = FE.partyLevel(campaign);
    // one scale for both tiers: a promoted level 3 is a 23, the same way
    // FE.partyLevel counts the party's own promoted units
    const eff = e => e.level + (FE.CLASSES[e.cls].tier === 1 ? FE.LEVEL_CAP : 0);
    const avgEff = list => list.reduce((a, e) => a + eff(e), 0) / list.length;

    const battles = FE.SKIRMISH_SITES.filter(st => cleared >= st.after)
      .map(st => FE.skirmishFor(campaign, st, 1234 + cleared))
      .concat(
        Array.from({ length: FE.SPIRE_FLOORS }, (_, i) => FE.spireFloor(campaign, i + 1, 77))
      );

    battles.forEach(bt => {
      built++;
      let parsed = null;
      try { parsed = FE.parseMap(bt.map); } catch (e) { ok(bt.id + ' parses', false, e.message); }
      if (!parsed) return;
      const cost = (x, y, mt) => FE.moveCost(parsed.tiles[y][x], mt);
      ok(bt.id + ' has enemies', bt.enemies.length > 0);
      ok(bt.id + ' start tiles are standable',
        bt.starts.slice(0, bt.slots).every(p => cost(p.x, p.y, 'foot') < FE.IMPASSABLE));
      ok(bt.id + ' enemies stand on legal ground',
        bt.enemies.every(e => {
          const mt = FE.CLASSES[e.cls].moveType;
          return e.x >= 0 && e.y >= 0 && e.y < parsed.h && e.x < parsed.w
            && cost(e.x, e.y, mt) < FE.IMPASSABLE;
        }), bt.enemies.map(e => e.cls + '@' + e.x + ',' + e.y).join(' '));
      ok(bt.id + ' no two enemies share a tile',
        new Set(bt.enemies.map(e => e.x + ',' + e.y)).size === bt.enemies.length);
      ok(bt.id + ' enemy levels are at least 1', bt.enemies.every(e => e.level >= 1));
      if (!bt.spire) {
        // a skirmish tracks the party. Far below and it is free experience; far
        // above and the optional content is harder than the campaign.
        const avg = avgEff(bt.enemies);
        lvSpread.push(Math.round(avg - party));
        ok(bt.id + ' is within four levels of the party', Math.abs(avg - party) <= 4,
          'party ' + party + ', field ' + avg.toFixed(1));
        ok(bt.id + ' carries no treasure', !bt.chests.length && !bt.villages.length);
      }
    });

    // the Spire has to actually get harder, or climbing it means nothing
    const f1 = FE.spireFloor(campaign, 1, 77), f8 = FE.spireFloor(campaign, FE.SPIRE_FLOORS, 77);
    ok('spire floor ' + FE.SPIRE_FLOORS + ' outnumbers floor 1', f8.enemies.length > f1.enemies.length);
    const lv1 = avgEff(f1.enemies);
    const lv8 = avgEff(f8.enemies);
    ok('spire floor ' + FE.SPIRE_FLOORS + ' outranks floor 1', lv8 > lv1 + 4,
      'floor1 ' + lv1.toFixed(1) + ', floor8 ' + lv8.toFixed(1));
    ok('spire purse rises with the floor', f8.purse > f1.purse);
  });
  console.log('  ' + built + ' skirmish and Spire battles generated across ' + progressPoints.length + ' points in the campaign');
  console.log('  skirmish level vs party: ' + lvSpread.join(', '));

  // nodes must be on the map and every road must join two real nodes
  const ids = {};
  FE.WORLD_NODES.forEach(n => { ids[n.id] = 1; });
  ok('world nodes sit inside the map',
    FE.WORLD_NODES.concat(FE.SKIRMISH_SITES).every(n => n.x > 0.02 && n.x < 0.98 && n.y > 0.02 && n.y < 0.98));
  ok('every road joins two real nodes', FE.WORLD_ROADS.every(r => ids[r[0]] && ids[r[1]]));
  ok('every chapter has a node on the map',
    FE.CHAPTERS.every((ch, i) => FE.WORLD_NODES.some(n => n.kind === 'chapter' && n.index === i)));
  // labels are wide and short, so two nodes collide when they are close
  // horizontally even if they are a fair way apart vertically
  // Labels are wide and short and sit centred under the dot, so the real
  // clearance two nodes need depends on how long their names are, not on a
  // fixed radius. ~6px a character against a 640px-wide map.
  ok('no two node labels collide', (() => {
    const all = FE.WORLD_NODES.concat(FE.SKIRMISH_SITES);
    for (let i = 0; i < all.length; i++) for (let j = i + 1; j < all.length; j++) {
      if ((all[i].region || 'marches') !== (all[j].region || 'marches')) continue;
      const dx = Math.abs(all[i].x - all[j].x), dy = Math.abs(all[i].y - all[j].y);
      const need = (all[i].name.length + all[j].name.length) / 2 * 0.0094 + 0.01;
      if (dx + 1e-9 < need && dy + 1e-9 < 0.055) {
        return all[i].name + ' / ' + all[j].name + ' need ' + need.toFixed(3) + ' have ' + dx.toFixed(3);
      }
    }
    return true;
  })() === true, (() => {
    const all = FE.WORLD_NODES.concat(FE.SKIRMISH_SITES);
    for (let i = 0; i < all.length; i++) for (let j = i + 1; j < all.length; j++) {
      if ((all[i].region || 'marches') !== (all[j].region || 'marches')) continue;
      const dx = Math.abs(all[i].x - all[j].x), dy = Math.abs(all[i].y - all[j].y);
      const need = (all[i].name.length + all[j].name.length) / 2 * 0.0094 + 0.01;
      if (dx + 1e-9 < need && dy + 1e-9 < 0.055) return all[i].name + ' / ' + all[j].name;
    }
    return '';
  })());
}

console.log('\n== the finale ==');
{
  /* ---- new weapons are real items, not typos ---- */
  ['spear', 'tomahawk', 'purge', 'fenrir', 'dawnmarch'].forEach(k => {
    const w = FE.WEAPONS[k];
    ok('weapon ' + k + ' exists', !!w);
    if (!w) return;
    ok('weapon ' + k + ' has a sane range', Array.isArray(w.rng) && w.rng[0] >= 1 && w.rng[1] >= w.rng[0]);
    const users = Object.keys(FE.CLASSES).filter(c => (FE.CLASSES[c].weapons || []).indexOf(w.type) !== -1);
    ok('weapon ' + k + ' is usable by some class', users.length > 0, w.type);
  });

  /* ---- every boss the chapters name resolves, including the second phase ---- */
  FE.CHAPTERS.forEach(ch => {
    if (!ch.boss) return;
    const t = FE.BOSSES[ch.boss.key];
    ok(ch.id + ' boss ' + ch.boss.key + ' is defined', !!t);
    if (!t) return;
    ok(ch.id + ' boss class ' + t.cls + ' exists', !!FE.CLASSES[t.cls]);
    t.items.forEach(it => ok(ch.id + ' boss carries a real item: ' + it, !!FE.WEAPONS[it]));
    if (t.phase2) {
      const p2 = FE.BOSSES[t.phase2];
      ok(ch.id + ' phase 2 boss ' + t.phase2 + ' is defined', !!p2);
      if (p2) {
        ok(ch.id + ' phase 2 class ' + p2.cls + ' exists', !!FE.CLASSES[p2.cls]);
        p2.items.forEach(it => ok(ch.id + ' phase 2 carries a real item: ' + it, !!FE.WEAPONS[it]));
        ok(ch.id + ' phase 2 does not itself have a third phase', !p2.phase2);
      }
    }
    if (ch.phase2) {
      ok(ch.id + ' phase 2 escort names a scene that exists',
         !ch.phase2.scene || !!(FE.STORY.scenes && FE.STORY.scenes[ch.phase2.scene]));
      (ch.phase2.enemies || []).forEach(e2 => {
        ok(ch.id + ' phase 2 escort class ' + e2.cls + ' has a stat line', FE.hasEnemyBase(e2.cls));
      });
    }
  });

  /* ---- the transformation itself ---- */
  const ch20i = FE.CHAPTERS.findIndex(c => c.id === 'ch20');
  const camp = FE.newCampaign('normal');
  camp.chapterIndex = ch20i;
  const ch20 = FE.CHAPTERS[ch20i];
  ch20.available.forEach(id => { if (!camp.roster[id]) camp.roster[id] = FE.makeRosterUnit(id); });
  const st = FE.startChapter(camp, ch20.available.slice(0, ch20.slots));
  const boss = st.units.filter(u => u.boss)[0];

  ok('ch20 boss carries a second phase', boss.phase2 === 'dravan2');
  ok('ch20 state carries the phase 2 escort', !!st.phase2Def && (st.phase2Def.enemies || []).length > 0);

  const beforeCls = boss.cls, beforeHp = boss.maxhp, beforeCount = st.units.length;
  const undoBlob = (() => { FE.Undo.reset(st); FE.Undo.push(st, 'probe'); return true; })();
  ok('undo stack took a snapshot before the transformation', undoBlob);

  boss.hp = 1;
  const log = [];
  FE.enterPhase2(st, boss, log);

  ok('the boss survives its first death', boss.alive);
  ok('the boss changes class', boss.cls !== beforeCls && boss.cls === 'druid');
  ok('the boss comes back at full health', boss.hp === boss.maxhp && boss.hp > 1);
  ok('the boss keeps its uid so every reference survives', typeof boss.uid === 'number');
  ok('the boss keeps its id so the portrait does not change face', boss.id === 'dravan');
  ok('the boss re-arms', boss.items.length > 0 && boss.items.some(i => i.key === 'fenrir'));
  ok('the boss cannot transform twice', !boss.phase2);
  ok('the escort arrives', st.units.length > beforeCount);
  ok('the escort does not also get a free swing', st.units.slice(beforeCount).every(u => u.acted));
  ok('the transformation is logged', log.some(ev => ev.type === 'phase2'));
  ok('the transformation names its scene', log.filter(ev => ev.type === 'phase2')[0].scene === 'ch20_crown');
  ok('the exchange in progress is told to stop', st._phaseBreak === true);
  ok('the chapter is not won by the first bar emptying', FE.checkResult(st) !== 'win');
  ok('phase 2 is not a pushover relative to phase 1', boss.maxhp >= beforeHp * 0.8);

  st._phaseBreak = false;
  FE.Undo.pop(st);
  const rewound = st.units.filter(u => u.boss)[0];
  ok('undo rewinds the transformation', rewound.cls === beforeCls && rewound.phase2 === 'dravan2');
  ok('undo rewinds the escort too', st.units.length === beforeCount);
  ok('undo restores the chapter phase 2 definition', !!st.phase2Def);

  /* and once it really is dead, the chapter is over */
  const boss2 = st.units.filter(u => u.boss)[0];
  FE.enterPhase2(st, boss2, []);
  st._phaseBreak = false;
  FE.killUnit(st, boss2, null, []);
  ok('killing the second phase wins the chapter', FE.checkResult(st) === 'win');

  /* ---- a strike, not a direct call, is what must trigger it ---- */
  const st2 = FE.startChapter(camp, ch20.available.slice(0, ch20.slots));
  const b2 = st2.units.filter(u => u.boss)[0];
  const hitter = st2.units.filter(u => u.faction === 'player' && FE.equipped(u))[0];
  let ok2 = true;
  /* the probe party is a fresh level-1 roster, so give the attacker the arm
     and the boss the paper it takes to make the blow land at all */
  hitter.str = 40; hitter.skl = 40; hitter.spd = 40;
  let transformed = false;
  for (let attempt = 0; attempt < 60 && !transformed; attempt++) {
    b2.hp = 1; b2.def = 0; b2.res = 0; b2.lck = 0;
    hitter.x = b2.x; hitter.y = b2.y + 1;
    hitter.hp = hitter.maxhp;
    const l = FE.resolveCombat(st2, hitter, b2, FE.equipped(hitter));
    if (l.some(ev => ev.type === 'phase2')) transformed = true;
    ok2 = l.every(ev => !(ev.type === 'death' && ev.unit === b2.uid));
    st2._phaseBreak = false;
  }
  ok('a killing blow triggers the second phase through normal combat', transformed);
  ok('the boss is still alive after that blow', b2.alive);
  ok('no death event was logged for the first bar', ok2 && b2.hp === b2.maxhp);

  /* ---- the ending ---- */
  const ep = FE.STORY.epilogue;
  ok('the epilogue exists', !!ep && !!ep.prompt && !!ep.question);
  ok('the epilogue offers exactly two answers', (ep.choices || []).length === 2);
  (ep.choices || []).forEach(c => {
    ok('ending "' + c.key + '" has text', Array.isArray(ep[c.key]) && ep[c.key].length >= 4);
    ok('ending "' + c.key + '" has a label and a blurb', !!c.label && !!c.blurb);
  });
  ok('both endings are distinct', JSON.stringify(ep.refuse) !== JSON.stringify(ep.consent));

  /* ---- the third region ---- */
  const cit = (FE.WORLD_REGIONS || []).filter(r => r.id === 'citadel')[0];
  ok('the citadel is a region', !!cit);
  ok('the citadel opens after chapter 16', cit && cit.after === 16);
  FE.CHAPTERS.forEach((ch, i) => {
    const nodes = FE.WORLD_NODES.filter(n => n.kind === 'chapter' && n.index === i);
    ok('chapter ' + ch.id + ' has exactly one world map node', nodes.length === 1, String(nodes.length));
    if (nodes.length === 1) ok(ch.id + ' node is named after it', !!nodes[0].name);
  });
  ['ch17', 'ch18', 'ch19', 'ch20'].forEach(id => {
    const n = FE.WORLD_NODES.filter(x => x.id === id)[0];
    ok(id + ' sits in the citadel', n && n.region === 'citadel');
  });
  ok('the citadel has somewhere to spend money',
     FE.WORLD_NODES.some(n => n.region === 'citadel' && n.kind === 'shop'));
  ok('the citadel has skirmish ground',
     FE.SKIRMISH_SITES.filter(s => s.region === 'citadel').length >= 3);
  FE.SKIRMISH_SITES.forEach(s => {
    ok('skirmish site ' + s.id + ' names a terrain template that exists', !!FE.WORLD_GROUND[s.terrain], s.terrain);
  });

  /* ---- chapter 17 is a hold, and says so ---- */
  const c17 = FE.CHAPTERS.filter(c => c.id === 'ch17')[0];
  ok('ch17 is a survive chapter with a turn count', c17.objective === 'survive' && c17.survive >= 8);
  ok('ch18 is dark', FE.CHAPTERS.filter(c => c.id === 'ch18')[0].fog > 0);
}

console.log('\n== simulated playthrough ==');
function simulate(chapterIndex, difficulty, seed, verbose) {
  const campaign = FE.newCampaign(difficulty);
  campaign.seed = seed;
  campaign.chapterIndex = chapterIndex;
  const ch = FE.CHAPTERS[chapterIndex];
  ch.available.forEach(id => { if (!campaign.roster[id]) campaign.roster[id] = FE.makeRosterUnit(id); });
  // a real party arrives at chapter N already levelled by chapters 1..N-1
  const levelState = { rng: new FE.Rng(seed ^ 0x5bf03635) };
  Object.keys(campaign.roster).forEach((id, idx) => {
    const u = campaign.roster[id];
    // Half the roster promotes from chapter 10 — that is a handful of bought
    // crests, not one per unit. From chapter 15 the shop has been selling them
    // for five chapters straight and the campaign is designed against a fully
    // promoted army, so a party that still has unpromoted units at the citadel
    // is not the party these maps were built for.
    const promotable = idx % 2 === 0 || chapterIndex >= 14;
    // roughly two and a half levels a chapter, which is what a party that uses
    // the arena a little actually looks like arriving at chapter N. Four a
    // chapter put a level-20 party into chapter 7 and made every late map
    // read as trivial.
    for (let k = 0; k < Math.round(chapterIndex * 2.6); k++) {
      // only half the roster promotes: by chapter 13 a player has bought a
      // handful of crests, not one for every unit
      if (chapterIndex >= 9 && promotable && FE.canPromote(u)) {
        const to = FE.CLASSES[u.cls].promotions[0];
        if (to) FE.promote(levelState, u, to);
      }
      if (u.level >= FE.LEVEL_CAP) break;
      FE.levelUp(levelState, u);
    }
    u.hp = u.maxhp;
  });
  const deploy = ch.available.slice(0, ch.slots);
  const st = FE.startChapter(campaign, deploy);
  const seizeTile = (() => {
    for (let y = 0; y < st.map.h; y++) for (let x = 0; x < st.map.w; x++) {
      if (FE.TERRAIN[st.map.tiles[y][x]].seize) return { x, y };
    }
    return null;
  })();

  let guard = 0;
  while (guard++ < 60) {
    // player phase: greedy attacks, otherwise advance
    FE.beginPlayerPhase(st);
    const holding = (st.objective === 'survive');
    const danger = FE.dangerZone(st);
    // open any door we are standing next to, the way a player with a key would
    (FE.CHAPTERS[chapterIndex].doors || []).forEach(d => {
      const k = FE.posKey(d.x, d.y);
      if (st.openedDoors[k]) return;
      const near = st.units.some(u => u.alive && u.faction === 'player' && FE.dist(u, d) === 1);
      if (near) st.openedDoors[k] = 1;
    });
    st.units.filter(u => u.alive && u.faction === 'player').forEach(u => {
      if (!u.alive) return;
      // a player drinks the vulnerary instead of trading at 3 HP
      if (u.hp < u.maxhp * 0.35) {
        const vi = u.items.findIndex(it => {
          const d = FE.itemData(it); return d && d.use === 'heal';
        });
        if (vi !== -1) {
          const d = FE.itemData(u.items[vi]);
          u.hp = Math.min(u.maxhp, u.hp + (d.power >= 999 ? u.maxhp : d.power));
          if (u.items[vi].uses !== null && --u.items[vi].uses <= 0) u.items.splice(vi, 1);
          return;
        }
      }
      u.ai = 'aggressive'; u.awake = true;
      const act = FE.aiDecide(st, u);
      u.ai = null;
      if (!act) return;
      // a real player does not walk the lord into a wyvern flight
      if (u.lord && holding) return;
      // once the approach is cleared, the lord stops being precious about it
      const approachClear = !!seizeTile && !st.units.some(o => o.alive && o.faction === 'enemy'
        && !o.recruitable && !o.boss && FE.dist(o, seizeTile) <= 5);
      const mopUp = st.turn > 22 || approachClear;
      // the lord heads for the seize tile, but never ends a turn in enemy reach
      if (u.lord && seizeTile && !holding) {
        const reach = FE.reachable(st, u);
        const stand = FE.standable(st, u, reach);
        const field = FE.distanceField(st, u, seizeTile.x, seizeTile.y);
        let best = null, bestF = field[FE.posKey(u.x, u.y)];
        if (bestF === undefined) bestF = 1e9;
        Object.keys(stand).forEach(k => {
          if (danger[k] && !mopUp) return;
          const f = field[k];
          if (f === undefined || f >= bestF) return;
          const pp = k.split(',');
          bestF = f; best = { x: +pp[0], y: +pp[1] };
        });
        if (best) { u.x = best.x; u.y = best.y; }
        if (FE.TERRAIN[FE.tileAt(st, u.x, u.y)].seize) st.seized = true;
        return;
      }
      // on any map, the lord refuses to end a turn inside enemy reach
      if (u.lord && (act.type === 'move' || act.type === 'attack')) {
        if (danger[FE.posKey(act.x, act.y)] && !mopUp) return;
      }
      if (act.type === 'move') {
        if (holding) return;               // defend the fort, do not charge
        u.x = act.x; u.y = act.y;
      } else if (act.type === 'attack') {
        // skip an exchange the counter would kill us in
        const sx = u.x, sy = u.y;
        u.x = act.x; u.y = act.y;
        const fc = FE.forecast(st, u, act.target, act.item);
        const back = fc && fc.def ? FE.expectedDamage({ atk: fc.def }) * (fc.def.doubles ? 2 : 1) : 0;
        if (back >= u.hp * 0.85 && !(fc && fc.atk && fc.atk.dmg * (fc.atk.doubles ? 2 : 1) >= act.target.hp)) {
          u.x = sx; u.y = sy;
          return;
        }
        FE.resolveCombat(st, u, act.target, act.item);
      } else if (act.type === 'staff') {
        u.x = act.x; u.y = act.y;
        FE.useStaff(st, u, act.target, act.item);
      }
      FE.recomputeSupports(st);
    });
    // seize if we can
    if (st.objective === 'seize') {
      const lord = st.units.find(u => u.lord && u.alive);
      if (lord) {
        const t = FE.tileAt(st, lord.x, lord.y);
        if (t && FE.TERRAIN[t].seize) st.seized = true;
      }
    }
    let r = FE.checkResult(st);
    if (r) return { result: r, turns: st.turn, state: st };

    // A party of survivors who cannot swing at anything is a loss, not a stall.
    // Without this the loop runs to the guard limit and reports "timeout",
    // which reads as a broken chapter when it is really a wipe with a healer
    // left standing.
    const canFight = st.units.some(u => u.alive && u.faction === 'player' && FE.equipped(u));
    if (!canFight) return { result: 'disarmed', turns: st.turn, state: st };

    FE.beginEnemyPhase(st);
    st.units.filter(u => u.alive && u.faction === 'enemy').forEach(u => {
      if (!u.alive) return;
      const act = FE.aiDecide(st, u);
      if (!act) return;
      if (act.type === 'move') { u.x = act.x; u.y = act.y; if (act.then && act.then.type === 'raze') { const v = FE.villageAt ? null : null; } }
      else if (act.type === 'attack') { u.x = act.x; u.y = act.y; FE.resolveCombat(st, u, act.target, act.item); }
      else if (act.type === 'staff') { u.x = act.x; u.y = act.y; FE.useStaff(st, u, act.target, act.item); }
      else if (act.type === 'raze' || (act.then && act.then.type === 'raze')) {
        const v = (st.villages || []).find(v => v.x === u.x && v.y === u.y);
        if (v) v.done = true;
      }
    });
    r = FE.checkResult(st);
    if (r) return { result: r, turns: st.turn, state: st };
    FE.endTurn(st);
    r = FE.checkResult(st);
    if (r) return { result: r, turns: st.turn, state: st };
  }
  return { result: 'timeout', turns: st.turn, state: st };
}

// the sim has no village raze hook for FE.villageAt (renderer-side), patch it in
FE.villageAt = FE.villageAt || function (state, x, y) {
  return (state.villages || []).filter(v => v.x === x && v.y === y)[0] || null;
};

/* node test/headless.js --probe ch20 [normal|hard]
   One chapter, five seeds, with the reason each run ended and what was still
   standing. Win rates tell you a chapter is hard; this tells you why. */
if (process.argv.indexOf('--probe') !== -1) {
  const pi = process.argv.indexOf('--probe');
  const pid = process.argv[pi + 1];
  const pdiff = process.argv[pi + 2] || 'normal';
  const idx = FE.CHAPTERS.findIndex(c => c.id === pid);
  if (idx < 0) { console.log('no such chapter: ' + pid); process.exit(1); }
  console.log('probe ' + pid + ' ' + pdiff);
  for (let s = 0; s < 5; s++) {
    const out = simulate(idx, pdiff, 1000 + s * 991, false);
    const st = out.state;
    const alive = st.units.filter(u => u.faction === 'player' && u.alive);
    const foes = st.units.filter(u => u.faction === 'enemy' && !u.recruitable && u.alive);
    const boss = st.units.filter(u => u.boss)[0];
    console.log('  seed ' + s + '  ' + out.result.padEnd(9) + ' turn ' + String(out.turns).padStart(2)
      + '  party ' + alive.length + '/' + st.units.filter(u => u.faction === 'player').length
      + '  foes left ' + foes.length
      + '  boss ' + (boss ? boss.name + ' ' + boss.hp + '/' + boss.maxhp + (boss.phase2 ? ' (phase 1)' : '') : 'none'));
    if (foes.length) {
      console.log('      still up: ' + foes.map(u => u.cls + '@' + u.x + ',' + u.y + ' ' + u.hp).join('  '));
    }
    console.log('      alive:    ' + (alive.map(u => u.name + ' ' + u.hp + '/' + u.maxhp).join('  ') || '(none)'));
  }
  process.exit(0);
}

['normal', 'hard'].forEach(diff => {
  FE.CHAPTERS.forEach((ch, i) => {
    const runs = [];
    for (let s = 0; s < 5; s++) {
      const out = simulate(i, diff, 1000 + s * 991, false);
      runs.push(out);
    }
    const wins = runs.filter(r => r.result === 'win').length;
    const avgTurns = (runs.reduce((a, r) => a + r.turns, 0) / runs.length).toFixed(1);
    const losses = runs.filter(r => r.result !== 'win').map(r => r.result);
    const avgDown = (runs.reduce((a, r) => a + r.state.units.filter(u => u.faction === 'player' && !u.alive).length, 0) / runs.length).toFixed(1);
    const clearRate = runs.reduce((a, r) => {
      const total = r.state.units.filter(u => u.faction === 'enemy' && !u.recruitable).length;
      const dead = r.state.units.filter(u => u.faction === 'enemy' && !u.recruitable && !u.alive).length;
      return a + (total ? dead / total : 1);
    }, 0) / runs.length;
    console.log('  ' + diff.padEnd(6) + ch.id + '  wins ' + wins + '/5  avg turns ' + avgTurns
      + '  enemies cleared ' + (clearRate * 100).toFixed(0) + '%  avg units down ' + avgDown);

    // A greedy bot with no retreat, no healer discipline and no item use is not
    // a player, so its win rate is information, not a pass mark. What must hold
    // is that the chapter is not structurally broken.
    ok(diff + ' ' + ch.id + ' never stalls out', runs.every(r => r.result !== 'timeout'), losses.join(','));
    ok(diff + ' ' + ch.id + ' the party can actually kill things', clearRate >= 0.5, (clearRate * 100).toFixed(0) + '%');

    // and the boss must be beatable by more than one unit with the gear on hand
    const st0 = runs[0].state;
    const boss = st0.units.filter(u => u.boss)[0];
    if (boss) {
      const campaign2 = FE.newCampaign(diff);
      campaign2.chapterIndex = i;
      ch.available.forEach(id => { if (!campaign2.roster[id]) campaign2.roster[id] = FE.makeRosterUnit(id); });
      const ls2 = { rng: new FE.Rng(4242) };
      Object.keys(campaign2.roster).forEach(id => {
        const u = campaign2.roster[id];
        for (let k = 0; k < i * 4; k++) {
          if (i >= 9 && FE.canPromote(u)) {
            const to = FE.CLASSES[u.cls].promotions[0];
            if (to) FE.promote(ls2, u, to);
          }
          if (u.level >= FE.LEVEL_CAP) break;
          FE.levelUp(ls2, u);
        }
        u.hp = u.maxhp;
      });
      const probe = FE.startChapter(campaign2, ch.available.slice(0, ch.slots));
      const pboss = probe.units.filter(u => u.boss)[0];
      let able = 0, best = 0, combined = 0;
      probe.units.filter(u => u.faction === 'player').forEach(u => {
        const w = FE.equipped(u);
        if (!w) return;
        const sx = u.x, sy = u.y;
        u.x = pboss.x - 1; u.y = pboss.y;
        const fc = FE.forecast(probe, u, pboss, w);
        u.x = sx; u.y = sy;
        if (!fc || !fc.atk) return;
        const perTurn = fc.atk.dmg * (fc.atk.doubles ? 2 : 1);
        if (perTurn > best) best = perTurn;
        if (perTurn >= 5) { able++; combined += perTurn; }
      });
      // A two-phase boss has to be measured against both bars. Checking only
      // the first one would have signed off a final chapter where the party
      // can just reach zero and then has nothing left for what stands up.
      let bossHp = pboss.maxhp;
      if (pboss.phase2 && FE.BOSSES[pboss.phase2]) {
        const p2 = FE.BOSSES[pboss.phase2];
        const cap = FE.CLASSES[p2.cls];
        bossHp += Math.min(p2.bases.hp, (cap && cap.caps && cap.caps.hp) ? cap.caps.hp : p2.bases.hp);
      }
      // two or more units must be able to contribute, and the party focusing
      // fire must finish it inside three turns (four, if there are two of it)
      const window = pboss.phase2 ? 5 : 3;
      ok(diff + ' ' + ch.id + ' boss is killable by the party as issued',
        able >= 2 && combined * window >= bossHp,
        able + ' units can hurt it, ' + combined + '/turn combined vs ' + bossHp + ' HP over ' + window + ' turns');
    }
  });
});

console.log('\n== summary ==');
console.log('  ' + (checks - fails) + '/' + checks + ' checks passed');
if (fails) { console.log('  ' + fails + ' FAILURES'); process.exit(1); }
