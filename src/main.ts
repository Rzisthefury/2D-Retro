/* =========================================================================
 * main.ts — the Game: fixed-timestep loop, waves, progression, and glue.
 * ========================================================================= */

interface MenuRow { label: string; right?: string; enabled: boolean; act: () => void; }

interface GearEntry { kind: 'w' | 'a'; w: WeaponDef | null; a: ArmorDef | null; }
type SynthState = 'owned' | 'ready' | 'lack' | 'locked';
interface SynthEntry { kind: 'w' | 'a'; id: string; name: string; recipe: Recipe; state: SynthState; }

interface SaveData {
  level: number; exp: number; bestWave: number;
  inv: Inventory; weapons: string[]; armors: string[];
  weapon: string; armor: string; talents: TalentSet;
  potions: number; ethers: number;
}

const SAVE_KEY = 'aerial-finisher-save-v2';

function freshSave(): SaveData {
  return {
    level: 1, exp: 0, bestWave: 1,
    inv: {}, weapons: ['w1'], armors: ['a1'],
    weapon: 'w1', armor: 'a1', talents: {},
    potions: 3, ethers: 2,
  };
}

function loadSave(): SaveData {
  const d = freshSave();
  try {
    const raw = localStorage.getItem(SAVE_KEY);
    if (raw) {
      const j = JSON.parse(raw) || {};
      d.level = clamp(j.level | 0 || 1, 1, MAX_LEVEL);
      d.exp = Math.max(0, j.exp | 0);
      d.bestWave = Math.max(1, j.bestWave | 0);
      d.potions = Math.max(0, j.potions | 0);
      d.ethers = Math.max(0, j.ethers | 0);
      if (j.inv && typeof j.inv === 'object') {
        for (const k of MAT_ORDER) d.inv[k] = Math.max(0, (j.inv[k] | 0) || 0);
      }
      if (Array.isArray(j.weapons) && j.weapons.length) {
        d.weapons = j.weapons.filter((id: string) => WEAPONS.some((w) => w.id === id));
      }
      if (Array.isArray(j.armors) && j.armors.length) {
        d.armors = j.armors.filter((id: string) => ARMORS.some((a) => a.id === id));
      }
      if (!d.weapons.length) d.weapons = ['w1'];
      if (!d.armors.length) d.armors = ['a1'];
      if (d.weapons.indexOf(j.weapon) >= 0) d.weapon = j.weapon;
      if (d.armors.indexOf(j.armor) >= 0) d.armor = j.armor;
      if (j.talents && typeof j.talents === 'object') {
        for (const t of TALENTS) if (j.talents[t.id]) d.talents[t.id] = true;
      }
    }
  } catch { /* private mode, blocked storage — play on regardless */ }
  return d;
}

/** Push a save blob onto a player instance. */
function applySave(p: Player, d: SaveData) {
  p.level = d.level;
  p.exp = d.exp;
  p.inv = { ...d.inv };
  p.ownedWeapons = d.weapons.slice();
  p.ownedArmors = d.armors.slice();
  p.weapon = weaponById(d.weapon);
  p.armor = armorById(d.armor);
  p.talents = { ...d.talents };
  p.potions = d.potions;
  p.ethers = d.ethers;
  p.dashCharges = p.maxDash();
  p.refreshStats(true);
}

function writeSave(d: SaveData) {
  try { localStorage.setItem(SAVE_KEY, JSON.stringify(d)); } catch { /* ignore */ }
}

class Game {
  input = new InputState();
  sfx = new Sfx();
  music = new Music();
  renderer: Renderer;

  player = new Player();
  enemies: Enemy[] = [];
  projectiles: Projectile[] = [];
  particles: Particle[] = [];
  floats: FloatText[] = [];
  slashes: SlashFx[] = [];
  rings: RingFx[] = [];
  pickups: Pickup[] = [];

  arena = { x: 60, y: 90, w: VIEW_W - 120, h: VIEW_H - 170 };

  time = 0;
  accumulator = 0;
  lastTs = 0;
  hitstopFrames = 0;
  shakeAmount = 0;
  paused = false;
  god = false;

  wave = 1;
  bestWave = 1;
  restPoint = false;
  restTimer = 0;
  betweenWaves = 0;

  comboCount = 0;
  comboTimer = 0;
  comboDisplay = 0;

  menuMode: 'root' | 'magic' | 'items' = 'root';
  menuIndex = 0;

  // full-screen pause menu
  // title / options / how-to-play live in front of everything
  screen: 'title' | 'play' = 'title';
  titleMode: 'root' | 'options' | 'help' = 'root';
  titleIndex = 0;
  optionIndex = 0;

  waveIntro = 0;               // grace period before the wave activates
  touchSpell = 0;              // which spell the MAG button casts

  menuOpen = false;
  menuTab = 0;                 // 0 gear · 1 synthesis · 2 talents · 3 status
  gearIndex = 0;
  synthIndex = 0;
  talentBranch = 0;
  talentIndex = 0;
  lastMusicVol = -1;

  toastMsg = '';
  toastT = 0;
  bannerMsg = '';
  bannerSub = '';
  bannerColor = '#ffd54a';
  bannerT = 0;

  deathT = 0;

  constructor(canvas: HTMLCanvasElement) {
    this.renderer = new Renderer(canvas);
    this.input.attach(canvas);

    const save = loadSave();
    applySave(this.player, save);
    this.bestWave = save.bestWave;

    // Wave 1 spawns immediately but stays frozen behind the title screen,
    // so the menu has the arena as a backdrop instead of an empty box.
    this.startWave(1);
    this.bannerT = 0;
  }

  hasSave(): boolean {
    const p = this.player;
    return p.level > 1 || this.bestWave > 1 || p.ownedWeapons.length > 1
      || p.ownedArmors.length > 1 || Object.keys(p.talents).length > 0;
  }

  titleRows(): string[] {
    if (this.titleMode === 'options') return ['Music volume', 'Sound volume', 'Back'];
    if (this.titleMode === 'help') return ['Back'];
    return this.hasSave() ? ['Continue', 'New Game', 'Options', 'How to Play']
                          : ['Start', 'Options', 'How to Play'];
  }

  private handleTitle() {
    const inp = this.input;
    const rows = this.titleRows();
    const idx = this.titleMode === 'options' ? 'optionIndex' : 'titleIndex';
    let cur = this.titleMode === 'options' ? this.optionIndex : this.titleIndex;

    // taps: find the row under the finger
    const tap = inp.takeTap();
    let activate = false;
    if (this.titleMode === 'help') {
      // one screen of text — anything at all takes you back
      if (tap || inp.wasPressed('confirm') || inp.wasPressed('cancel')
        || inp.wasPressed('attack') || inp.wasPressed('jump')) {
        this.titleMode = 'root'; this.titleIndex = 0; this.sfx.guard();
      }
      return;
    }
    if (tap) {
      for (let i = 0; i < rows.length; i++) {
        const ry = TITLE_ROW.y0 + i * (TITLE_ROW.h + TITLE_ROW.gap);
        if (tap.x >= TITLE_ROW.x && tap.x <= TITLE_ROW.x + TITLE_ROW.w
          && tap.y >= ry && tap.y <= ry + TITLE_ROW.h) {
          cur = i;
          activate = true;
        }
      }
      // on the options screen, tapping the left or right third nudges the slider
      if (!activate && this.titleMode === 'options') {
        const ry = TITLE_ROW.y0 + cur * (TITLE_ROW.h + TITLE_ROW.gap);
        if (tap.y >= ry - 20 && tap.y <= ry + TITLE_ROW.h + 20) {
          this.nudgeOption(cur, tap.x < VIEW_W / 2 ? -1 : 1);
        }
      }
    }

    if (inp.wasPressed('down')) { cur = (cur + 1) % rows.length; this.sfx.guard(); }
    if (inp.wasPressed('up')) { cur = (cur - 1 + rows.length) % rows.length; this.sfx.guard(); }
    if (this.titleMode === 'options') {
      if (inp.wasPressed('left')) this.nudgeOption(cur, -1);
      if (inp.wasPressed('right')) this.nudgeOption(cur, 1);
    }
    if (this.titleMode === 'options') this.optionIndex = cur; else this.titleIndex = cur;
    void idx;

    if (inp.wasPressed('cancel') && this.titleMode !== 'root') {
      this.titleMode = 'root'; this.titleIndex = 0; return;
    }
    if (activate || inp.wasPressed('confirm') || inp.wasPressed('attack') || inp.wasPressed('jump')) {
      this.pickTitle(rows[cur]);
    }
  }

  private nudgeOption(row: number, dir: number) {
    if (row === 0) {
      TUNING.musicVolume = clamp(+(TUNING.musicVolume + dir * 0.05).toFixed(2), 0, 1);
      this.music.setVolume(TUNING.musicVolume);
      this.lastMusicVol = TUNING.musicVolume;
    } else if (row === 1) {
      TUNING.sfxVolume = clamp(+(TUNING.sfxVolume + dir * 0.05).toFixed(2), 0, 1);
      this.sfx.guard();
    }
  }

  private pickTitle(label: string) {
    this.sfx.cast(560);
    switch (label) {
      case 'Continue':
      case 'Start':
        this.beginRun();
        break;
      case 'New Game':
        this.resetSave();
        this.beginRun();
        break;
      case 'Options':
        this.titleMode = 'options'; this.optionIndex = 0;
        break;
      case 'How to Play':
        this.titleMode = 'help'; this.titleIndex = 0;
        break;
      case 'Back':
        this.titleMode = 'root'; this.titleIndex = 0;
        break;
      case 'Music volume': this.nudgeOption(0, 1); break;
      case 'Sound volume': this.nudgeOption(1, 1); break;
    }
  }

  beginRun() {
    this.screen = 'play';
    this.titleMode = 'root';
    this.deathT = 0;
    this.restPoint = false;
    this.betweenWaves = 0;
    this.startWave(1);
    this.input.clearBuffer();
  }

  /* ----------------------------------------------------------- main loop */

  start() {
    this.lastTs = performance.now();
    const frame = (ts: number) => {
      const dtReal = Math.min(0.25, (ts - this.lastTs) / 1000);
      this.lastTs = ts;
      this.accumulator += dtReal;
      let guard = 0;
      while (this.accumulator >= TICK && guard++ < 6) {
        this.tick(TICK);
        this.accumulator -= TICK;
      }
      this.renderer.draw(this);
      requestAnimationFrame(frame);
    };
    requestAnimationFrame(frame);
  }

  tick(dt: number) {
    this.input.pollPad();
    this.input.pollTouch();
    this.input.uiMode = this.menuOpen || this.screen === 'title';

    if (this.screen === 'title') {
      this.time += dt;
      if (this.bannerT > 0) this.bannerT -= dt;
      this.updateVfx(dt);
      this.music.target = 0;
      if (TUNING.musicVolume !== this.lastMusicVol) {
        this.lastMusicVol = TUNING.musicVolume;
        this.music.setVolume(TUNING.musicVolume);
      }
      this.handleTitle();
      this.input.endTick();
      return;
    }

    // Global toggles work even while paused or dead.
    if (this.input.wasPressed('pause') && this.player.alive) this.paused = !this.paused;
    if (this.input.wasPressed('mute')) {
      this.sfx.muted = !this.sfx.muted;
      this.music.setMuted(this.sfx.muted);
      this.toast(this.sfx.muted ? 'SOUND OFF' : 'SOUND ON');
    }
    if (TUNING.musicVolume !== this.lastMusicVol) {
      this.lastMusicVol = TUNING.musicVolume;
      this.music.setVolume(TUNING.musicVolume);
    }
    if (this.input.wasPressed('menu') && this.player.alive) {
      this.menuOpen = !this.menuOpen;
      this.menuIndex = 0;
      this.input.clearBuffer();
    }
    this.syncMusic();
    if (this.menuOpen) { this.handleBigMenu(); this.input.endTick(); return; }
    if (!this.player.alive && this.deathT > 0.9) {
      const tapped = IS_TOUCH && !!this.input.takeTap();
      if (this.input.wasPressed('restart') || tapped || this.input.wasPressed('confirm')) {
        this.restart(); this.input.endTick(); return;
      }
    }

    if (this.paused) { this.input.endTick(); return; }

    this.time += dt;
    if (this.toastT > 0) this.toastT -= dt;
    if (this.bannerT > 0) this.bannerT -= dt;
    if (this.comboDisplay > 0) this.comboDisplay--;
    if (this.comboTimer > 0 && --this.comboTimer === 0) this.comboCount = 0;
    this.shakeAmount *= Math.pow(0.86, dt * 60);

    this.updateVfx(dt);

    // Hitstop freezes the simulation but keeps the picture alive.
    if (this.hitstopFrames > 0) { this.hitstopFrames--; this.input.endTick(); return; }

    if (!this.player.alive) {
      this.deathT += dt;
      for (const e of this.enemies) e.update(this, dt);
      this.cull();
      this.input.endTick();
      return;
    }

    if (this.input.touchChip >= 0) {
      this.touchSpell = this.input.touchChip;
      this.sfx.guard();
    }
    if (this.input.consume('magic')) this.player.tryCast(this, SPELLS[this.touchSpell]);

    this.handleMenu();
    this.player.update(this, dt);
    this.player.pollMagic(this);

    // Grace period: you get a moment to read the spawn and reposition before
    // anything moves. Enemies are drawn but inert.
    if (this.waveIntro > 0) {
      this.waveIntro -= dt;
      if (this.waveIntro <= 0) {
        this.banner('GO', '', '#ffd54a');
        this.sfx.wave();
      }
    } else {
      for (const e of this.enemies) e.update(this, dt);
    }
    for (const p of this.projectiles) p.update(this, dt);
    for (const p of this.pickups) p.update(this, dt);

    this.cull();
    this.updateWaves(dt);
    this.input.endTick();
  }

  private cull() {
    this.enemies = this.enemies.filter((e) => e.alive || e.deathT < 0.5);
    this.projectiles = this.projectiles.filter((p) => !p.dead);
    this.pickups = this.pickups.filter((p) => !p.collected && p.life > 0);
  }

  /** Intensity for the score, resolved from what is actually happening. */
  private syncMusic() {
    let want: number;
    if (this.menuOpen || this.restPoint) want = 0;
    else if (!this.player.alive) want = 1;
    else {
      const alive = this.enemies.filter((e) => e.alive).length;
      // Thresholds are set so the score actually visits every layer — five
      // enemies is an ordinary wave, not a crisis, so it can't sit on 3 forever.
      if (alive <= 2) want = 1;
      else want = 2;
      if (alive >= 6 || this.comboCount >= 12) want = 3;
      if ((this.wave % 5 === 0 && alive >= 3) || this.player.hp < this.player.stats.maxHp * 0.25) want = 4;
    }
    this.music.target = want;
  }

  private updateVfx(dt: number) {
    for (const p of this.particles) {
      p.x += p.vx * dt; p.y += p.vy * dt; p.z += p.vz * dt;
      p.vz -= p.gravity * dt;
      if (p.z < 0) { p.z = 0; p.vz *= -0.35; p.vx *= 0.7; p.vy *= 0.7; }
      p.life -= dt;
    }
    this.particles = this.particles.filter((p) => p.life > 0);

    for (const f of this.floats) { f.y -= 0; f.z += f.vy * dt; f.vy -= 120 * dt; f.life -= dt; }
    this.floats = this.floats.filter((f) => f.life > 0);

    for (const s of this.slashes) s.life -= dt;
    this.slashes = this.slashes.filter((s) => s.life > 0);

    for (const r of this.rings) r.life -= dt;
    this.rings = this.rings.filter((r) => r.life > 0);
  }

  /* --------------------------------------------------------------- waves */

  waveScale(): number {
    return 1 + TUNING.waveScaling * (this.wave - 1);
  }

  private composition(wave: number): string[] {
    let budget = 3 + wave * 1.5;
    const pool: { id: string; cost: number; min: number; cap: number }[] = [
      { id: 'shade', cost: 1, min: 1, cap: 6 },
      { id: 'caster', cost: 2.2, min: 3, cap: 3 },
      { id: 'flyer', cost: 2.4, min: 4, cap: 3 },
      { id: 'bruiser', cost: 4.5, min: 5, cap: 2 },
    ].filter((p) => wave >= p.min);
    const used: Record<string, number> = {};

    const out: string[] = [];
    // Guarantee at least one of the newest unlocked type, so waves feel fresh.
    const newest = pool[pool.length - 1];
    if (wave >= newest.min && wave <= newest.min + 1) {
      out.push(newest.id); used[newest.id] = 1; budget -= newest.cost;
    }

    let guard = 0;
    while (budget > 0.9 && out.length < 10 && guard++ < 60) {
      const affordable = pool.filter((p) => p.cost <= budget + 0.6 && (used[p.id] || 0) < p.cap);
      if (!affordable.length) break;
      const choice = pick(affordable);
      out.push(choice.id);
      used[choice.id] = (used[choice.id] || 0) + 1;
      budget -= choice.cost;
    }
    if (!out.length) out.push('shade');
    return out;
  }

  startWave(n: number) {
    this.wave = n;
    this.player.secondWindUsed = false;
    this.waveIntro = Math.max(0, TUNING.waveIntro);
    this.enemies.length = 0;
    this.projectiles.length = 0;
    this.player.lock = null;
    const ids = this.composition(n);
    const scale = this.waveScale();
    for (let i = 0; i < ids.length; i++) {
      const pos = this.spawnPoint(i, ids.length);
      const e = new Enemy(ENEMIES[ids[i]], pos.x, pos.y, scale);
      this.enemies.push(e);
      this.ring(pos.x, pos.y, 0, 8, 60, '#8fb4ff');
    }
    if (n > this.bestWave) { this.bestWave = n; }
    this.save();
  }

  private spawnPoint(i: number, total: number) {
    const a = this.arena;
    const cx = a.x + a.w / 2, cy = a.y + a.h / 2;
    const ang = (i / total) * Math.PI * 2 + rnd(-0.25, 0.25);
    const rx = a.w * 0.38, ry = a.h * 0.36;
    let x = cx + Math.cos(ang) * rx;
    let y = cy + Math.sin(ang) * ry;
    // never drop an enemy right on top of the player
    if (dist(x, y, this.player.x, this.player.y) < 110) {
      x = cx - Math.cos(ang) * rx;
      y = cy - Math.sin(ang) * ry;
    }
    return {
      x: clamp(x, a.x + 30, a.x + a.w - 30),
      y: clamp(y, a.y + 30, a.y + a.h - 30),
    };
  }

  private updateWaves(dt: number) {
    const anyAlive = this.enemies.some((e) => e.alive);
    if (anyAlive) return;

    if (this.betweenWaves <= 0 && !this.restPoint) {
      // wave just cleared
      const isRest = this.wave % 5 === 0;
      this.sfx.wave();
      if (isRest) {
        this.restPoint = true;
        this.restTimer = 5;
        this.player.hp = this.player.stats.maxHp;
        this.player.mp = this.player.stats.maxMp;
        this.player.charging = false;
        this.player.potions = Math.max(this.player.potions, 3);
        this.player.ethers = Math.max(this.player.ethers, 2);
        this.banner('REST POINT', 'HP / MP restored, items resupplied', '#7fe8ff');
      } else {
        this.betweenWaves = 2.2;
        this.banner(`WAVE ${this.wave} CLEAR`, '', '#4fe08a');
      }
      this.save();
      return;
    }

    if (this.restPoint) {
      this.restTimer -= dt;
      if (this.restTimer <= 0) {
        this.restPoint = false;
        this.startWave(this.wave + 1);
        this.banner(`WAVE ${this.wave}`, 'Get ready', '#8fb4ff');
      }
      return;
    }

    this.betweenWaves -= dt;
    if (this.betweenWaves <= 0) {
      this.startWave(this.wave + 1);
      this.banner(`WAVE ${this.wave}`, 'Get ready', '#8fb4ff');
    }
  }

  /* ---------------------------------------------------------- collisions */

  clampToArena(o: { x: number; y: number; radius: number }) {
    const a = this.arena;
    o.x = clamp(o.x, a.x + o.radius, a.x + a.w - o.radius);
    o.y = clamp(o.y, a.y + o.radius, a.y + a.h - o.radius);
  }

  /** Cheap separation so enemies don't stack into a single blob. */
  separate(e: Enemy) {
    for (const o of this.enemies) {
      if (o === e || !o.alive) continue;
      if (Math.abs(o.z - e.z) > 40) continue;
      const d = dist(e.x, e.y, o.x, o.y);
      const min = e.radius + o.radius;
      if (d > 0.001 && d < min) {
        const push = (min - d) / min;
        const ang = Math.atan2(e.y - o.y, e.x - o.x);
        e.x += Math.cos(ang) * push * 2.2;
        e.y += Math.sin(ang) * push * 2.2;
      }
    }
  }

  /* -------------------------------------------------------------- damage */

  hitEnemy(e: Enemy, def: AttackDef, p: Player) {
    const guardMult = e.guardCheck(p.x, p.y, def);
    const angle = Math.atan2(e.y - p.y, e.x - p.x);

    if (guardMult < 1) {
      this.sfx.guard();
      this.hitstop(3);
      this.shake(2 * TUNING.shakeScale);
      this.floatText(e.x, e.y, e.z + e.def.height + 6, 'GUARD', '#9fd8ff', 13);
      // Guarding shoves the attacker back — you have to go around or break it.
      p.vx = -Math.cos(angle) * 190;
      p.vy = -Math.sin(angle) * 190;
      const r = physDamage(def.power * guardMult * p.weapon.powerMult, p.stats.str, e.edef);
      e.applyDamage(this, r.dmg, def.poise * 0.25, angle, 20, 0);
      // A counter-swing punishes mashing into the shield.
      if (Math.random() < 0.5 && e.state === 'chase') { (e as any).state = 'telegraph'; (e as any).stateFrame = 0; (e as any).hasHitThisSwing = false; }
      return;
    }

    const edge = p.hasT('edge') ? 1.12 : 1;
    const r = physDamage(def.power * TUNING.playerDamageMult * p.weapon.powerMult * edge, p.stats.str, e.edef);
    e.applyDamage(this, r.dmg, def.poise * p.weapon.poiseMult, angle, def.knockback, def.launch);

    // Arcane Edge feeds the gauge back off melee, so magic stays in rotation.
    if (p.hasT('arcedge') && !p.charging) p.mp = Math.min(p.stats.maxMp, p.mp + 1);

    this.registerHit();
    this.hitstop(def.hitstop * TUNING.hitstopScale);
    this.shake(def.shake * TUNING.shakeScale);
    this.sfx.hit(def.finisher);
    this.floatText(e.x + rnd(-8, 8), e.y, e.z + e.def.height + 10, String(r.dmg), r.crit ? '#ffd54a' : '#ffffff', r.crit ? 24 : 18);
    if (r.crit) this.floatText(e.x, e.y, e.z + e.def.height + 30, 'CRIT', '#ffd54a', 12);

    this.slashes.push({
      x: (p.x + e.x) / 2, y: (p.y + e.y) / 2, z: (p.z + e.z) / 2 + 18,
      angle: p.facing, arc: Math.min(def.arc, 1.6), range: p.reach(def) * 0.8,
      life: 0.14, maxLife: 0.14, color: def.finisher ? p.weapon.blade.edge : '#dce9ff',
      width: def.finisher ? 9 : 5,
    });
    this.burst(e.x, e.y, e.z + e.def.height * 0.5, def.finisher ? 14 : 7, def.finisher ? '#ffd54a' : '#cfe0ff');
    if (def.finisher) this.ring(e.x, e.y, e.z + 10, 12, 90, '#ffd54a');
  }

  /** An enemy's melee swing, resolved against the player. */
  enemyStrike(e: Enemy, reach: number, mult: number) {
    const p = this.player;
    if (!p.alive) return;
    if (!inArc(e.x, e.y, e.z, e.facing, reach, 1.0, p.x, p.y, p.z, p.radius)) return;
    e.hasHitThisSwing = true;
    if (this.god) { this.floatText(p.x, p.y, p.z + 40, 'GOD', '#7fe8ff', 14); return; }
    const r = physDamage(e.def.power * mult * TUNING.enemyDamageMult * (e.str / e.def.str), e.str, p.stats.def);
    const ang = Math.atan2(p.y - e.y, p.x - e.x);
    p.takeHit(this, r.dmg, ang, 240, 22);
    this.burst(p.x, p.y, p.z + 20, 8, '#ff8a80');
  }

  spawnEnemyBolt(e: Enemy) {
    const p = this.player;
    const ang = Math.atan2(p.y - e.y, p.x - e.x);
    const sp = 300;
    this.projectiles.push(new Projectile({
      x: e.x + Math.cos(ang) * 18, y: e.y + Math.sin(ang) * 18, z: e.z + e.def.height * 0.7,
      vx: Math.cos(ang) * sp, vy: Math.sin(ang) * sp,
      radius: 6, life: 2.4, color: e.def.accent, owner: 'enemy',
      power: e.def.power * 0.9,
    }));
    this.sfx.cast(260);
  }

  projectileCollide(proj: Projectile) {
    if (proj.owner === 'player') {
      for (const e of this.enemies) {
        if (!e.alive || proj.hits.has(e)) continue;
        if (Math.abs(e.z + e.def.height * 0.5 - proj.z) > 56) continue;
        if (dist(proj.x, proj.y, e.x, e.y) > e.radius + proj.radius + 4) continue;
        proj.hits.add(e);
        const r = magicDamage(proj.power, this.player.stats.mag, e.mres);
        const ang = Math.atan2(e.y - proj.y, e.x - proj.x);
        e.applyDamage(this, r.dmg, 16, ang, 90, 0);
        if (proj.slowOnHit) e.slow = 120;
        this.registerHit();
        this.hitstop(3 * TUNING.hitstopScale);
        this.floatText(e.x, e.y, e.z + e.def.height + 10, String(r.dmg), proj.color, 18);
        this.burst(proj.x, proj.y, proj.z, 10, proj.color);
        this.sfx.hit(false);
        if (!proj.pierce) { proj.dead = true; return; }
      }
    } else {
      const p = this.player;
      if (!p.alive || this.god) return;
      if (Math.abs(p.z + 18 - proj.z) > 56) return;
      if (dist(proj.x, proj.y, p.x, p.y) > p.radius + proj.radius + 4) return;
      proj.dead = true;
      const r = magicDamage(proj.power * TUNING.enemyDamageMult, 8, p.stats.mres);
      p.takeHit(this, r.dmg, Math.atan2(p.y - proj.y, p.x - proj.x), 170, 16);
      this.burst(proj.x, proj.y, proj.z, 10, proj.color);
    }
  }

  /* --------------------------------------------------------------- magic */

  fireSpell(s: SpellDef, p: Player) {
    const target = p.lock && p.lock.alive ? p.lock : this.nearestEnemy(p.x, p.y, 500);
    const ang = target ? Math.atan2(target.y - p.y, target.x - p.x) : p.facing;

    const fm = p.hasT('focus') ? 1.18 : 1;
    if (s.kind === 'heal') {
      const amount = Math.round(s.power * fm * (1 + p.stats.mag / 10) * TUNING.spellPowerMult);
      p.heal(this, amount);
      this.ring(p.x, p.y, 0, 10, 90, s.color);
      this.burst(p.x, p.y, 24, 18, s.color);
      return;
    }

    if (s.kind === 'strike') {
      // Thunder: bolts on up to three nearby enemies.
      const surge = p.hasT('surge');
      const targets = this.enemies
        .filter((e) => e.alive && dist(e.x, e.y, p.x, p.y) < (surge ? 330 : 260))
        .sort((a, b) => dist(a.x, a.y, p.x, p.y) - dist(b.x, b.y, p.x, p.y))
        .slice(0, surge ? 5 : 3);
      if (!targets.length) { this.toast('NO TARGET'); return; }
      for (const e of targets) {
        const r = magicDamage(s.power * fm, p.stats.mag, e.mres);
        e.applyDamage(this, r.dmg, 26, Math.atan2(e.y - p.y, e.x - p.x), 60, 0);
        this.floatText(e.x, e.y, e.z + e.def.height + 10, String(r.dmg), s.color, 18);
        this.burst(e.x, e.y, e.z + 10, 16, s.color);
        this.ring(e.x, e.y, e.z, 6, 70, s.color);
        // vertical bolt
        for (let i = 0; i < 12; i++) {
          this.particles.push({
            x: e.x + rnd(-4, 4), y: e.y + rnd(-3, 3), z: i * 22,
            vx: rnd(-20, 20), vy: rnd(-20, 20), vz: rnd(-40, 40),
            life: 0.22, maxLife: 0.22, size: 5, color: s.color, gravity: 0,
          });
        }
        this.registerHit();
      }
      this.shake(7 * TUNING.shakeScale);
      this.hitstop(5 * TUNING.hitstopScale);
      return;
    }

    const sp = s.kind === 'pierce' ? 620 : 400;
    this.projectiles.push(new Projectile({
      x: p.x + Math.cos(ang) * 20, y: p.y + Math.sin(ang) * 20, z: p.z + 22,
      vx: Math.cos(ang) * sp, vy: Math.sin(ang) * sp,
      radius: s.kind === 'pierce' ? 5 : 8,
      life: 2.2, color: s.color, owner: 'player', power: s.power * fm,
      pierce: s.kind === 'pierce',
      homing: s.kind === 'projectile' ? 5 : 0,
      target,
      slowOnHit: s.kind === 'pierce',
    }));
  }

  nearestEnemy(x: number, y: number, maxD: number): Enemy | null {
    let best: Enemy | null = null;
    let bd = maxD;
    for (const e of this.enemies) {
      if (!e.alive) continue;
      const d = dist(x, y, e.x, e.y);
      if (d < bd) { bd = d; best = e; }
    }
    return best;
  }

  /* ------------------------------------------------------- pause menu */

  apFree(): number { return apPerLevel(this.player.level) - apSpent(this.player.talents); }

  gearEntries(): GearEntry[] {
    const p = this.player;
    const out: GearEntry[] = [];
    for (const id of p.ownedWeapons) out.push({ kind: 'w', w: weaponById(id), a: null });
    for (const id of p.ownedArmors) out.push({ kind: 'a', w: null, a: armorById(id) });
    return out;
  }

  synthEntries(): SynthEntry[] {
    const p = this.player;
    const out: SynthEntry[] = [];
    const add = (kind: 'w' | 'a', id: string, name: string, recipe: Recipe, owned: boolean) => {
      let state: SynthState;
      if (owned) state = 'owned';
      else if (recipe.requires && !(kind === 'w' ? p.ownedWeapons : p.ownedArmors).includes(recipe.requires)) state = 'locked';
      else if (!canAfford(p.inv, recipe.needs)) state = 'lack';
      else state = 'ready';
      out.push({ kind, id, name, recipe, state });
    };
    for (const w of WEAPONS) if (w.recipe) add('w', w.id, w.name, w.recipe, p.ownedWeapons.includes(w.id));
    for (const a of ARMORS) if (a.recipe) add('a', a.id, a.name, a.recipe, p.ownedArmors.includes(a.id));
    return out;
  }

  private handleBigMenu() {
    const inp = this.input;
    const tap = inp.takeTap();
    if (tap && this.tapBigMenu(tap)) return;
    if (inp.wasPressed('cancel')) { this.menuOpen = false; return; }

    for (let i = 0; i < 4; i++) {
      if (inp.wasPressed(('spell' + (i + 1)) as Action)) this.menuTab = i;
    }

    const cycle = (d: number) => { this.menuTab = (this.menuTab + d + 4) % 4; };

    if (this.menuTab === 2) {
      if (inp.wasPressed('left')) { this.talentBranch = (this.talentBranch + 2) % 3; this.talentIndex = 0; this.sfx.guard(); }
      if (inp.wasPressed('right')) { this.talentBranch = (this.talentBranch + 1) % 3; this.talentIndex = 0; this.sfx.guard(); }
      const list = talentsIn(BRANCHES[this.talentBranch].id);
      if (inp.wasPressed('down')) { this.talentIndex = (this.talentIndex + 1) % list.length; this.sfx.guard(); }
      if (inp.wasPressed('up')) { this.talentIndex = (this.talentIndex - 1 + list.length) % list.length; this.sfx.guard(); }
      if (inp.wasPressed('confirm')) this.learnTalent(list[this.talentIndex].id);
      return;
    }

    if (inp.wasPressed('left')) { cycle(-1); this.sfx.guard(); }
    if (inp.wasPressed('right')) { cycle(1); this.sfx.guard(); }

    if (this.menuTab === 0) {
      const n = Math.max(1, this.gearEntries().length);
      if (inp.wasPressed('down')) { this.gearIndex = (this.gearIndex + 1) % n; this.sfx.guard(); }
      if (inp.wasPressed('up')) { this.gearIndex = (this.gearIndex - 1 + n) % n; this.sfx.guard(); }
      if (inp.wasPressed('confirm')) {
        const e = this.gearEntries()[this.gearIndex];
        if (e) this.equip(e);
      }
    } else if (this.menuTab === 1) {
      const n = Math.max(1, this.synthEntries().length);
      if (inp.wasPressed('down')) { this.synthIndex = (this.synthIndex + 1) % n; this.sfx.guard(); }
      if (inp.wasPressed('up')) { this.synthIndex = (this.synthIndex - 1 + n) % n; this.sfx.guard(); }
      if (inp.wasPressed('confirm')) {
        const e = this.synthEntries()[this.synthIndex];
        if (e) this.craft(e);
      }
    }
  }

  equip(e: GearEntry) {
    const p = this.player;
    if (e.kind === 'w' && e.w) { p.weapon = e.w; this.toast('EQUIPPED ' + e.w.name.toUpperCase()); }
    if (e.kind === 'a' && e.a) { p.armor = e.a; this.toast('EQUIPPED ' + e.a.name.toUpperCase()); }
    p.refreshStats(false);
    this.sfx.cast(520);
    this.save();
  }

  craft(e: SynthEntry) {
    const p = this.player;
    if (e.state === 'owned') { this.toast('ALREADY FORGED'); return; }
    if (e.state === 'locked') { this.toast('FORGE THE PREVIOUS TIER FIRST'); return; }
    if (e.state === 'lack') { this.toast('NOT ENOUGH MATERIALS'); return; }
    spend(p.inv, e.recipe.needs);
    if (e.kind === 'w') { p.ownedWeapons.push(e.id); p.weapon = weaponById(e.id); }
    else { p.ownedArmors.push(e.id); p.armor = armorById(e.id); }
    p.refreshStats(false);
    this.sfx.levelUp();
    this.banner('SYNTHESIS', e.name + ' forged and equipped', '#ffd54a');
    this.save();
  }

  learnTalent(id: string) {
    const t = talentById(id);
    if (!t) return;
    const p = this.player;
    if (p.talents[id]) { this.toast('ALREADY LEARNED'); return; }
    if (t.needs && !p.talents[t.needs]) {
      this.toast('REQUIRES ' + (talentById(t.needs)?.name || '').toUpperCase());
      return;
    }
    if (this.apFree() < t.cost) { this.toast('NOT ENOUGH AP'); return; }
    p.talents[id] = true;
    p.refreshStats(false);
    p.dashCharges = p.maxDash();
    this.sfx.levelUp();
    this.banner('LEARNED', t.name, BRANCHES.find((b) => b.id === t.branch)!.color);
    this.save();
  }

  /* ---------------------------------------------------------------- menu */

  menuRows(): MenuRow[] {
    const p = this.player;
    if (this.menuMode === 'magic') {
      const rows: MenuRow[] = SPELLS.map((s) => ({
        label: s.name,
        right: s.drainAll ? 'ALL' : String(s.cost),
        enabled: p.canCast(s),
        act: () => { p.tryCast(this, s); this.menuMode = 'root'; this.menuIndex = 1; },
      }));
      rows.push({ label: 'Back', enabled: true, act: () => { this.menuMode = 'root'; this.menuIndex = 1; } });
      return rows;
    }
    if (this.menuMode === 'items') {
      return [
        { label: 'Potion', right: 'x' + p.potions, enabled: p.potions > 0, act: () => { this.useItem(); this.menuMode = 'root'; this.menuIndex = 2; } },
        { label: 'Ether', right: 'x' + p.ethers, enabled: p.ethers > 0, act: () => { this.useEther(); this.menuMode = 'root'; this.menuIndex = 2; } },
        { label: 'Back', enabled: true, act: () => { this.menuMode = 'root'; this.menuIndex = 2; } },
      ];
    }
    return [
      { label: 'Attack', enabled: true, act: () => this.player.startAttack(this) },
      { label: 'Magic', right: '>', enabled: !p.charging, act: () => { this.menuMode = 'magic'; this.menuIndex = 0; } },
      { label: 'Items', right: '>', enabled: p.potions + p.ethers > 0, act: () => { this.menuMode = 'items'; this.menuIndex = 0; } },
    ];
  }

  private handleMenu() {
    const rows = this.menuRows();
    if (this.input.wasPressed('down')) { this.menuIndex = (this.menuIndex + 1) % rows.length; this.sfx.guard(); }
    if (this.input.wasPressed('up')) { this.menuIndex = (this.menuIndex - 1 + rows.length) % rows.length; this.sfx.guard(); }
    if (this.input.wasPressed('cancel') && this.menuMode !== 'root') { this.menuMode = 'root'; this.menuIndex = 0; }
    if (this.input.wasPressed('confirm')) {
      const r = rows[this.menuIndex];
      if (r && r.enabled) r.act();
      else this.toast('CAN’T USE');
    }
  }

  useItem() {
    const p = this.player;
    if (p.potions <= 0) { this.toast('NO POTIONS'); return; }
    p.potions--;
    p.heal(this, 70);
    this.ring(p.x, p.y, 0, 8, 70, PAL.hp);
    this.sfx.cast(700);
  }

  useEther() {
    const p = this.player;
    if (p.ethers <= 0) { this.toast('NO ETHERS'); return; }
    p.ethers--;
    p.charging = false;
    p.mp = p.stats.maxMp;
    this.ring(p.x, p.y, 0, 8, 70, PAL.mp);
    this.floatText(p.x, p.y, 40, 'MP FULL', PAL.mp, 16);
    this.sfx.cast(500);
  }

  /* --------------------------------------------------------- progression */

  onEnemyDeath(e: Enemy) {
    this.sfx.die();
    this.burst(e.x, e.y, e.z + e.def.height * 0.5, 22, e.def.accent);
    this.ring(e.x, e.y, e.z, 8, 70, e.def.accent);
    this.shake(4 * TUNING.shakeScale);
    this.hitstop(4 * TUNING.hitstopScale);
    if (this.player.lock === e) this.player.lock = null;

    const luck = TUNING.dropRate * (this.player.hasT('scavenger') ? 1.55 : 1);
    for (const d of rollDrops(e.def.id, this.wave, luck)) {
      this.pickups.push(new Pickup(e.x, e.y, e.z + 12, d.kind, d.id, d.count));
    }
    this.grantExp(e.exp, e.x, e.y, e.z);
  }

  grantExp(amount: number, x: number, y: number, z: number) {
    const p = this.player;
    if (p.level >= MAX_LEVEL) return;
    p.exp += amount;
    this.floatText(x, y, z + 54, `+${amount} EXP`, PAL.exp, 13);
    let guard = 0;
    while (p.level < MAX_LEVEL && p.exp >= expToNext(p.level) && guard++ < 50) {
      p.exp -= expToNext(p.level);
      p.level++;
      p.refreshStats(false);
      this.sfx.levelUp();
      this.banner('LEVEL UP', `Level ${p.level}  ·  ${this.statLine()}`, '#ffd54a');
      this.ring(p.x, p.y, 0, 10, 140, '#ffd54a');
      this.burst(p.x, p.y, 30, 30, '#ffd54a');
    }
    this.save();
  }

  private statLine(): string {
    const s = this.player.stats;
    return `HP ${s.maxHp}  MP ${s.maxMp}  STR ${s.str.toFixed(0)}  MAG ${s.mag.toFixed(0)}  DEF ${s.def.toFixed(0)}`;
  }

  onPlayerDeath() {
    this.deathT = 0;
    this.shake(14);
    this.hitstop(12);
    this.save();
  }

  restart() {
    // Levels, gear, materials and talents all persist — that is the grind.
    this.player = new Player();
    applySave(this.player, loadSave());
    this.projectiles.length = 0;
    this.pickups.length = 0;
    this.particles.length = 0;
    this.floats.length = 0;
    this.deathT = 0;
    this.comboCount = 0;
    this.menuMode = 'root';
    this.menuIndex = 0;
    this.restPoint = false;
    this.betweenWaves = 0;
    this.startWave(1);
    this.banner('WAVE 1', `Level ${this.player.level} — go again`, '#8fb4ff');
  }

  /* --------------------------------------------------- touch menu taps */

  /** Hit-test a tap against the pause menu. Returns true if it was consumed. */
  private tapBigMenu(tap: { x: number; y: number }): boolean {
    for (let i = 0; i < 4; i++) {
      const tx = MENU_TAB.x + i * (MENU_TAB.w + MENU_TAB.gap);
      if (tap.x >= tx && tap.x <= tx + MENU_TAB.w && tap.y >= MENU_TAB.y && tap.y <= MENU_TAB.y + MENU_TAB.h) {
        this.menuTab = i; this.sfx.guard(); return true;
      }
    }
    // a close box in the top-right corner
    if (tap.x > VIEW_W - 60 && tap.y < 52) { this.menuOpen = false; return true; }

    const rowIndex = () => Math.floor((tap.y - MENU_LIST.y - MENU_LIST.pad) / MENU_LIST.rowH);
    const inList = tap.x >= MENU_LIST.x && tap.x <= MENU_LIST.x + MENU_LIST.w && tap.y > MENU_LIST.y;

    if (this.menuTab === 0 && inList) {
      const i = rowIndex();
      const list = this.gearEntries();
      if (i >= 0 && i < list.length) {
        // tap to select, tap again to commit — no accidental equips
        if (this.gearIndex === i) this.equip(list[i]); else { this.gearIndex = i; this.sfx.guard(); }
        return true;
      }
    }
    if (this.menuTab === 1 && inList) {
      const i = rowIndex();
      const list = this.synthEntries();
      if (i >= 0 && i < list.length) {
        if (this.synthIndex === i) this.craft(list[i]); else { this.synthIndex = i; this.sfx.guard(); }
        return true;
      }
    }
    if (this.menuTab === 2) {
      const colW = (VIEW_W - 52 - 20) / 3;
      for (let b = 0; b < 3; b++) {
        const x = 26 + b * (colW + 10);
        if (tap.x < x || tap.x > x + colW) continue;
        const i = Math.floor((tap.y - (MENU_LIST.y + 40)) / 26);
        const list = talentsIn(BRANCHES[b].id);
        if (i >= 0 && i < list.length) {
          if (this.talentBranch === b && this.talentIndex === i) this.learnTalent(list[i].id);
          else { this.talentBranch = b; this.talentIndex = i; this.sfx.guard(); }
          return true;
        }
      }
    }
    return false;
  }

  save() {
    const p = this.player;
    writeSave({
      level: p.level, exp: p.exp, bestWave: this.bestWave,
      inv: p.inv, weapons: p.ownedWeapons, armors: p.ownedArmors,
      weapon: p.weapon.id, armor: p.armor.id, talents: p.talents,
      potions: p.potions, ethers: p.ethers,
    });
  }

  resetSave() {
    writeSave(freshSave());
    this.bestWave = 1;
    this.restart();
    this.toast('SAVE RESET');
  }

  /* ----------------------------------------------------------------- fx */

  collect(p: Pickup) {
    const pl = this.player;
    if (p.kind === 'potion') {
      pl.potions++;
      this.floatText(pl.x, pl.y, pl.z + 46, '+POTION', PAL.hp, 13);
    } else if (p.kind === 'ether') {
      pl.ethers++;
      this.floatText(pl.x, pl.y, pl.z + 46, '+ETHER', PAL.mp, 13);
    } else {
      const m = MATS[p.matId as MatId];
      pl.inv[m.id] = (pl.inv[m.id] || 0) + p.count;
      this.floatText(pl.x + rnd(-10, 10), pl.y, pl.z + 46, `+${p.count} ${m.name}`, m.color, 12);
    }
    this.burst(p.x, p.y, p.z, 5, p.color);
    this.sfx.guard();
    this.save();
  }

  dashTrail(p: Player) {
    for (let i = 0; i < 4; i++) {
      this.particles.push({
        x: p.x + rnd(-6, 6), y: p.y + rnd(-4, 4), z: p.z + rnd(4, 32),
        vx: -p.dashVX * rnd(20, 70), vy: -p.dashVY * rnd(20, 70), vz: rnd(-10, 30),
        life: 0.26, maxLife: 0.26, size: rnd(3, 6), color: '#8fb4ff', gravity: 0,
      });
    }
  }

  whirlFx(p: Player, def: AttackDef) {
    const r = p.reach(def);
    const a = p.facing;
    this.particles.push({
      x: p.x + Math.cos(a) * r * 0.9, y: p.y + Math.sin(a) * r * 0.55, z: p.z + 20,
      vx: Math.cos(a + 1.6) * 90, vy: Math.sin(a + 1.6) * 60, vz: rnd(0, 40),
      life: 0.22, maxLife: 0.22, size: 5, color: p.weapon.blade.edge, gravity: 0,
    });
    if (p.attackFrame % 9 === 0) this.ring(p.x, p.y, p.z + 6, r * 0.5, r * 1.1, p.weapon.blade.edge);
  }

  registerHit() {
    this.comboCount++;
    this.comboTimer = 100;
    this.comboDisplay = 60;
  }

  hitstop(frames: number) {
    this.hitstopFrames = Math.max(this.hitstopFrames, Math.round(frames));
  }

  shake(amount: number) {
    this.shakeAmount = Math.min(24, this.shakeAmount + amount);
  }

  toast(msg: string) {
    this.toastMsg = msg;
    this.toastT = 1.1;
  }

  banner(msg: string, sub: string, color: string) {
    this.bannerMsg = msg;
    this.bannerSub = sub;
    this.bannerColor = color;
    this.bannerT = 1.9;
  }

  floatText(x: number, y: number, z: number, text: string, color: string, size: number) {
    this.floats.push({ x, y, z, vy: 96, life: 0.8, maxLife: 0.8, text, color, size });
    if (this.floats.length > 60) this.floats.shift();
  }

  burst(x: number, y: number, z: number, count: number, color: string) {
    for (let i = 0; i < count; i++) {
      const a = rnd(0, Math.PI * 2);
      const sp = rnd(40, 210);
      this.particles.push({
        x, y, z,
        vx: Math.cos(a) * sp, vy: Math.sin(a) * sp * 0.6, vz: rnd(30, 220),
        life: rnd(0.25, 0.55), maxLife: 0.55,
        size: rnd(2.5, 6), color, gravity: 620,
      });
    }
    if (this.particles.length > 400) this.particles.splice(0, this.particles.length - 400);
  }

  ring(x: number, y: number, z: number, r: number, maxR: number, color: string) {
    this.rings.push({ x, y, z, r, maxR, life: 0.4, maxLife: 0.4, color });
  }
}

/* ==================================================== debug tuning panel */

function buildDebugPanel(g: Game) {
  const panel = document.getElementById('debug')!;
  const groups: Record<string, Tunable[]> = {};
  for (const t of TUNABLES) (groups[t.group] ||= []).push(t);

  let html = '<div class="dbg-head">TUNING <span class="dbg-hint">` to hide</span></div>';
  html += '<div class="dbg-actions">'
    + '<button data-act="heal">Full heal</button>'
    + '<button data-act="level">+1 level</button>'
    + '<button data-act="level10">+10 levels</button>'
    + '<button data-act="kill">Clear wave</button>'
    + '<button data-act="skip">Skip to wave +5</button>'
    + '<button data-act="mats">+50 all materials</button>'
    + '<button data-act="ap">+10 AP (levels)</button>'
    + '<button data-act="god">God mode: off</button>'
    + '<button data-act="reset">Reset save</button>'
    + '<button data-act="defaults">Reset tuning</button>'
    + '</div>';
  for (const gname of Object.keys(groups)) {
    html += `<div class="dbg-group">${gname}</div>`;
    for (const t of groups[gname]) {
      const v = (TUNING as any)[t.key];
      html += `<label class="dbg-row"><span>${t.label}</span>`
        + `<input type="range" data-key="${t.key}" min="${t.min}" max="${t.max}" step="${t.step}" value="${v}">`
        + `<output data-out="${t.key}">${v}</output></label>`;
    }
  }
  panel.innerHTML = html;

  panel.querySelectorAll<HTMLInputElement>('input[type=range]').forEach((el) => {
    el.addEventListener('input', () => {
      const key = el.dataset.key as TuningKey;
      const v = parseFloat(el.value);
      (TUNING as any)[key] = v;
      const out = panel.querySelector(`output[data-out="${key}"]`);
      if (out) out.textContent = String(v);
    });
  });

  const defaults = JSON.parse(JSON.stringify(TUNING));
  panel.querySelectorAll<HTMLButtonElement>('button').forEach((btn) => {
    btn.addEventListener('click', () => {
      switch (btn.dataset.act) {
        case 'heal':
          g.player.hp = g.player.stats.maxHp;
          g.player.mp = g.player.stats.maxMp;
          g.player.charging = false;
          break;
        case 'level': g.grantExp(expToNext(g.player.level), g.player.x, g.player.y, 20); break;
        case 'level10':
          for (let i = 0; i < 10; i++) g.grantExp(expToNext(g.player.level), g.player.x, g.player.y, 20);
          break;
        case 'kill':
          for (const e of g.enemies) if (e.alive) e.applyDamage(g, 999999, 0, 0, 0, 0);
          break;
        case 'skip': g.startWave(g.wave + 5); g.banner(`WAVE ${g.wave}`, '', '#8fb4ff'); break;
        case 'mats':
          for (const m of MAT_ORDER) g.player.inv[m] = (g.player.inv[m] || 0) + 50;
          g.toast('MATERIALS ADDED'); g.save();
          break;
        case 'ap':
          for (let i = 0; i < 10; i++) g.grantExp(expToNext(g.player.level), g.player.x, g.player.y, 20);
          break;
        case 'god': g.god = !g.god; btn.textContent = `God mode: ${g.god ? 'on' : 'off'}`; break;
        case 'reset': g.resetSave(); break;
        case 'defaults':
          for (const k of Object.keys(defaults)) (TUNING as any)[k] = defaults[k];
          panel.querySelectorAll<HTMLInputElement>('input[type=range]').forEach((el) => {
            const key = el.dataset.key!;
            el.value = String((TUNING as any)[key]);
            const out = panel.querySelector(`output[data-out="${key}"]`);
            if (out) out.textContent = el.value;
          });
          break;
      }
      (document.activeElement as HTMLElement | null)?.blur();
    });
  });
}

/* ============================================================== bootstrap */

let GAME: Game | null = null;

function boot() {
  const canvas = document.getElementById('game') as HTMLCanvasElement;
  const g = new Game(canvas);
  GAME = g;
  buildDebugPanel(g);

  const panel = document.getElementById('debug')!;
  window.addEventListener('keydown', (e) => {
    if (e.code === 'Backquote') {
      e.preventDefault();
      panel.classList.toggle('open');
    }
  });

  const unlock = () => { g.sfx.unlock(); g.music.setVolume(TUNING.musicVolume); g.music.start(); };
  window.addEventListener('pointerdown', unlock, { once: true });
  window.addEventListener('keydown', unlock, { once: true });

  g.start();
}

if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
else boot();
