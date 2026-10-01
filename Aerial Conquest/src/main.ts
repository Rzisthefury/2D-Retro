/* =========================================================================
 * main.ts — the Game: fixed-timestep loop, screens, progression, saving
 * and glue.
 *
 * Phase 0 (PLAN v2) strips Aerial Finisher down to the knight and its
 * combat. Until the campaign map exists (Phase 6), New Game drops you on a
 * test battlefield: open ground and endless groups of Shades.
 * ========================================================================= */

interface MenuRow { label: string; right?: string; enabled: boolean; act: () => void; color?: string; }

interface GearEntry { kind: 'w' | 'a'; w: WeaponDef | null; a: ArmorDef | null; }
type SynthState = 'owned' | 'ready' | 'lack';
interface SynthEntry { kind: 'w' | 'a'; id: string; name: string; recipe: Recipe; state: SynthState; }

/**
 * title   — the front menu
 * battle  — a scrolling battlefield (Phase 0: the test field)
 * campaign and victory arrive in later phases.
 */
type GameScreen = 'title' | 'battle';

interface SaveData {
  skillPoints: number; upgrades: KnightUpgrades;
  inv: Inventory; weapons: string[]; armors: string[];
  weapon: string; armor: string; talents: TalentSet;
  potions: number; ethers: number;
  hero: HeroStyle; blade: BladeStyle;
}

// Phase 12 adds the slot picker (slot1..3); until then everything lives in slot 1.
// Never read or write Aerial Finisher's `aerial-finisher-save-*` keys.
const SAVE_KEY = 'aerial-conquest-slot1';

function freshSave(): SaveData {
  return {
    skillPoints: WAR.startSkillPoints, upgrades: freshUpgrades(),
    inv: {}, weapons: ['w1'], armors: ['a1'],
    weapon: 'w1', armor: 'a1', talents: {},
    potions: 3, ethers: 2,
    hero: 'wayfarer', blade: 'longsword',
  };
}

function loadSave(): SaveData {
  const d = freshSave();
  try {
    const raw = localStorage.getItem(SAVE_KEY);
    if (raw) {
      const j = JSON.parse(raw) || {};
      if (typeof j.skillPoints === 'number') d.skillPoints = Math.max(0, j.skillPoints | 0);
      if (j.upgrades && typeof j.upgrades === 'object') {
        for (const k of Object.keys(d.upgrades) as (keyof KnightUpgrades)[]) {
          d.upgrades[k] = clamp(j.upgrades[k] | 0, 0, WAR.upgradeRanks);
        }
      }
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
      // never hold more talents than the points that bought them
      d.skillPoints = Math.max(d.skillPoints, apSpent(d.talents));
      if (HERO_STYLES.some((h) => h.id === j.hero)) d.hero = j.hero;
      if (BLADE_STYLES.some((b) => b.id === j.blade)) d.blade = j.blade;
    }
  } catch { /* private mode, blocked storage — play on regardless */ }
  return d;
}

/** Push a save blob onto a player instance. */
function applySave(p: Player, d: SaveData) {
  p.skillPoints = d.skillPoints;
  p.upgrades = { ...d.upgrades };
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

  /** The playable rectangle of the current battlefield, in world px. */
  field = { x: 0, y: 0, w: WAR.testField.w, h: WAR.testField.h };

  time = 0;
  accumulator = 0;
  lastTs = 0;
  hitstopFrames = 0;
  shakeAmount = 0;
  paused = false;
  god = false;

  // how the hero and sword are drawn (Options on the title screen)
  heroStyle: HeroStyle = 'wayfarer';
  bladeStyle: BladeStyle = 'longsword';

  camX = 0; camY = 0;
  respawnT = 0;                // test field: countdown to the next group
  groupsCleared = 0;           // test field: groups beaten this visit

  comboCount = 0;
  comboTimer = 0;
  comboDisplay = 0;

  menuMode: 'root' | 'magic' | 'items' = 'root';
  menuIndex = 0;

  // title / options / how-to-play live in front of everything
  screen: GameScreen = 'title';
  titleMode: 'root' | 'options' | 'help' = 'root';
  titleIndex = 0;
  optionIndex = 0;

  waveIntro = 0;               // grace period before a fresh group activates
  touchSpell = 0;              // which spell the MAG button casts

  menuOpen = false;
  menuTab = 0;                 // 0 gear · 1 forge · 2 talents · 3 status
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
    this.heroStyle = save.hero;
    this.bladeStyle = save.blade;
    this.placePlayer();
    this.bannerT = 0;
    this.follow(true);
  }

  inCombat(): boolean { return this.screen !== 'title'; }

  hasSave(): boolean {
    const p = this.player;
    return p.ownedWeapons.length > 1 || p.ownedArmors.length > 1 || Object.keys(p.talents).length > 0
      || Object.values(p.upgrades).some((r) => r > 0) || MAT_ORDER.some((m) => (p.inv[m] || 0) > 0);
  }

  titleRows(): string[] {
    if (this.titleMode === 'options') return ['Music volume', 'Sound volume', 'Hero', 'Blade', 'Back'];
    if (this.titleMode === 'help') return ['Back'];
    return this.hasSave() ? ['Continue', 'New Game', 'Options', 'How to Play']
                          : ['Start', 'Options', 'How to Play'];
  }

  private handleTitle() {
    const inp = this.input;
    const rows = this.titleRows();
    let cur = this.titleMode === 'options' ? this.optionIndex : this.titleIndex;

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
    } else if (row === 2) {
      const i = HERO_STYLES.findIndex((h) => h.id === this.heroStyle);
      this.heroStyle = HERO_STYLES[(i + dir + HERO_STYLES.length) % HERO_STYLES.length].id;
      this.sfx.guard();
      this.save();
    } else if (row === 3) {
      const i = BLADE_STYLES.findIndex((b) => b.id === this.bladeStyle);
      this.bladeStyle = BLADE_STYLES[(i + dir + BLADE_STYLES.length) % BLADE_STYLES.length].id;
      this.sfx.guard();
      this.save();
    }
  }

  private pickTitle(label: string) {
    this.sfx.cast(560);
    switch (label) {
      case 'Continue':
      case 'Start':
        this.enterBattle();
        break;
      case 'New Game':
        this.resetSave();
        this.enterBattle();
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
      case 'Hero': this.nudgeOption(2, 1); break;
      case 'Blade': this.nudgeOption(3, 1); break;
    }
  }

  /** Into the test battlefield (the campaign map replaces this in Phase 6). */
  enterBattle() {
    this.titleMode = 'root';
    this.screen = 'battle';
    this.startTestField();
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

    if (TUNING.musicVolume !== this.lastMusicVol) {
      this.lastMusicVol = TUNING.musicVolume;
      this.music.setVolume(TUNING.musicVolume);
    }

    if (this.screen === 'title') {
      this.time += dt;
      if (this.bannerT > 0) this.bannerT -= dt;
      this.updateVfx(dt);
      this.syncMusic();
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
    if (this.input.wasPressed('menu') && this.player.alive) {
      if (this.menuOpen) this.closeMenu(); else this.openMenu(this.menuTab);
      this.input.clearBuffer();
    }
    this.syncMusic();
    if (this.menuOpen) { this.handleBigMenu(); this.input.endTick(); return; }
    if (!this.player.alive && this.deathT > 0.9) {
      const tapped = !!this.input.takeTap();
      if (this.input.wasPressed('restart') || tapped || this.input.wasPressed('confirm')) {
        this.recoverFromDeath(); this.input.endTick(); return;
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
    if (this.hitstopFrames > 0) { this.hitstopFrames--; this.follow(false); this.input.endTick(); return; }

    if (!this.player.alive) {
      this.deathT += dt;
      for (const e of this.enemies) e.update(this, dt);
      this.cull();
      this.input.endTick();
      return;
    }

    this.input.takeTap();   // taps outside the touch controls do nothing on the field
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
    this.updateTestField(dt);
    this.follow(false);
    this.input.endTick();
  }

  /** The camera follows the knight, clamped to the battlefield. */
  follow(snap: boolean) {
    const f = this.field;
    const tx = clamp(this.player.x - VIEW_W / 2, f.x, Math.max(f.x, f.x + f.w - VIEW_W));
    const ty = clamp(this.player.y - VIEW_H / 2, f.y, Math.max(f.y, f.y + f.h - VIEW_H));
    if (snap) { this.camX = tx; this.camY = ty; return; }
    this.camX = lerp(this.camX, tx, 0.2);
    this.camY = lerp(this.camY, ty, 0.2);
  }

  private cull() {
    this.enemies = this.enemies.filter((e) => e.alive || e.deathT < 0.5);
    this.projectiles = this.projectiles.filter((p) => !p.dead);
    this.pickups = this.pickups.filter((p) => !p.collected && p.life > 0);
  }

  /** Pick the theme for the screen, and whether the combat layer is up. */
  private syncMusic() {
    const [id, transpose, tempo] = this.musicFor();
    this.music.setTrack(id, transpose, tempo);
    this.music.duck(this.menuOpen || this.paused);
    const p = this.player;
    const fighting = p.alive && this.enemies.some((e) => e.alive && e.aggro && e.team === 'enemy');
    this.music.target = fighting ? 3 : 0;
  }

  /** [theme, transpose, tempo] for the current screen. Phase 13 maps the war contexts properly. */
  musicFor(): [string, number, number] {
    if (this.screen === 'title') return ['title', 0, 1];
    return ['forest', 0, 1];
  }

  private updateVfx(dt: number) {
    for (const p of this.particles) {
      p.x += p.vx * dt; p.y += p.vy * dt; p.z += p.vz * dt;
      p.vz -= p.gravity * dt;
      if (p.z < 0) { p.z = 0; p.vz *= -0.35; p.vx *= 0.7; p.vy *= 0.7; }
      p.life -= dt;
    }
    this.particles = this.particles.filter((p) => p.life > 0);

    for (const f of this.floats) { f.z += f.vy * dt; f.vy -= 120 * dt; f.life -= dt; }
    this.floats = this.floats.filter((f) => f.life > 0);

    for (const s of this.slashes) s.life -= dt;
    this.slashes = this.slashes.filter((s) => s.life > 0);

    for (const r of this.rings) r.life -= dt;
    this.rings = this.rings.filter((r) => r.life > 0);
  }

  /* ---------------------------------------------------------- test field */

  /** Stand the knight in the middle-left of the field. */
  private placePlayer() {
    const p = this.player;
    p.x = this.field.x + this.field.w * 0.3;
    p.y = this.field.y + this.field.h / 2;
    p.vx = p.vy = 0; p.z = 0;
  }

  /** A fresh test field: knight in place, full HP/MP, supplies topped up, first group out. */
  startTestField() {
    const p = this.player;
    this.field = { x: 0, y: 0, w: WAR.testField.w, h: WAR.testField.h };
    this.enemies.length = 0;
    this.projectiles.length = 0;
    this.pickups.length = 0;
    p.lock = null;
    this.placePlayer();
    p.refreshStats(true);
    p.potions = Math.max(p.potions, 3);
    p.ethers = Math.max(p.ethers, 2);
    this.groupsCleared = 0;
    this.spawnTestGroup();
    this.follow(true);
    this.banner('TEST FIELD', 'combat sandbox  ·  two allied Shades fight beside you', '#8fb4ff');
  }

  /** Top the knight's allied Shades back up to `WAR.testAllies`, beside the knight. */
  private topUpAllies() {
    const p = this.player, f = this.field;
    let have = this.enemies.filter((e) => e.alive && e.team === 'player').length;
    for (; have < WAR.testAllies; have++) {
      const x = clamp(p.x - 50 + rnd(-20, 20), f.x + 40, f.x + f.w - 40);
      const y = clamp(p.y + (have % 2 ? 50 : -50), f.y + 40, f.y + f.h - 40);
      const a = new Enemy(ENEMIES.shade, x, y, WAR.testFieldLevel, WAR.testFieldTier);
      a.team = 'player';
      a.facing = 0;
      this.enemies.push(a);
      this.ring(x, y, 0, 8, 60, PAL.ally);
    }
  }

  /** The next group of Shades, around the knight but not on top of them, plus allies topped up. */
  private spawnTestGroup() {
    this.topUpAllies();
    const ids = this.composition(this.groupsCleared + 1, ['shade', 'caster', 'flyer', 'bruiser']);
    const p = this.player, f = this.field;
    for (let i = 0; i < ids.length; i++) {
      const ang = (i / ids.length) * Math.PI * 2 + rnd(-0.3, 0.3);
      const r = rnd(260, 380);
      const x = clamp(p.x + Math.cos(ang) * r, f.x + 40, f.x + f.w - 40);
      const y = clamp(p.y + Math.sin(ang) * r * 0.7, f.y + 40, f.y + f.h - 40);
      const e = new Enemy(ENEMIES[ids[i]], x, y, WAR.testFieldLevel, WAR.testFieldTier);
      e.aggro = true;
      this.enemies.push(e);
      this.ring(x, y, 0, 8, 60, '#8fb4ff');
    }
    this.waveIntro = Math.max(0, TUNING.waveIntro);
  }

  private updateTestField(dt: number) {
    if (this.foesAlive() > 0) return;
    if (this.respawnT <= 0) {
      this.groupsCleared++;
      this.respawnT = WAR.testRespawnDelay;
      this.sfx.wave();
      this.banner('GROUP CLEARED', `${this.groupsCleared} so far  ·  next group incoming`, '#4fe08a');
      return;
    }
    this.respawnT -= dt;
    if (this.respawnT <= 0) { this.respawnT = 0; this.spawnTestGroup(); }
  }

  /** Enemy costs for filling a group from a set of enemy types. */
  private composition(wave: number, types: string[]): string[] {
    let budget = 3 + Math.min(wave, 14) * 1.3;
    const table: Record<string, { cost: number; cap: number }> = {
      shade: { cost: 1, cap: 6 }, caster: { cost: 2.2, cap: 3 },
      flyer: { cost: 2.4, cap: 3 }, bruiser: { cost: 4.5, cap: 2 },
    };
    const pool = types.filter((id) => table[id]).map((id) => ({ id, ...table[id] }));
    if (!pool.length) return ['shade'];
    const used: Record<string, number> = {};
    const out: string[] = [];
    let guard = 0;
    while (budget > 0.9 && out.length < 9 && guard++ < 60) {
      const affordable = pool.filter((p) => p.cost <= budget + 0.6 && (used[p.id] || 0) < p.cap);
      if (!affordable.length) break;
      const choice = pick(affordable);
      out.push(choice.id);
      used[choice.id] = (used[choice.id] || 0) + 1;
      budget -= choice.cost;
    }
    if (!out.length) out.push(pool[0].id);
    return out;
  }

  /* ---------------------------------------------------------- collisions */

  /** Keep something inside the battlefield. */
  clampToArena(o: { x: number; y: number; radius: number }) {
    const f = this.field;
    o.x = clamp(o.x, f.x + o.radius, f.x + f.w - o.radius);
    o.y = clamp(o.y, f.y + o.radius, f.y + f.h - o.radius);
  }

  /** The space projectiles may fly in before they are discarded. */
  bounds(): { x: number; y: number; w: number; h: number } { return this.field; }

  /** Nothing on the open test field stops a shot (walls and gates arrive in Phase 4-5). */
  blocksShot(_x: number, _y: number): boolean { return false; }

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

  /* ---------------------------------------------------------------- teams */

  /** Everything alive that `team` may fight: the knight and allies for the Dominion, the Dominion for allies. */
  hostilesOf(team: Team): Combatant[] {
    const out: Combatant[] = [];
    if (team === 'enemy' && this.player.alive) out.push(this.player);
    for (const e of this.enemies) if (e.alive && e.team !== team) out.push(e);
    return out;
  }

  /** Dominion units still standing (allies don't count). */
  foesAlive(): number { return this.enemies.filter((e) => e.alive && e.team === 'enemy').length; }

  /** A unit's hit on another unit: physical, scaled by the attacker, light poise damage. */
  private unitHitsUnit(src: Enemy, t: Enemy, mult: number, angle: number, knockback: number) {
    const r = physDamage(src.def.power * mult * WAR.unitDamageMult * (src.str / src.def.str), src.str, t.edef);
    t.applyDamage(this, r.dmg, WAR.unitPoiseDamage * mult, angle, knockback, 0);
    this.floatText(t.x + rnd(-6, 6), t.y, t.z + t.def.height + 8, String(r.dmg), t.team === 'player' ? '#ff9d9d' : '#cfe0ff', 13);
    this.burst(t.x, t.y, t.z + t.def.height * 0.5, 6, t.team === 'player' ? '#ff8a80' : '#8fb4ff');
  }

  /** The knight takes a Dominion unit's physical hit (god mode shrugs it off). */
  private unitHitsKnight(e: Enemy, mult: number, angle: number, knockback: number, stun: number) {
    const p = this.player;
    if (this.god) { this.floatText(p.x, p.y, p.z + 40, 'GOD', '#7fe8ff', 14); return; }
    const r = physDamage(e.def.power * mult * TUNING.enemyDamageMult * (e.str / e.def.str), e.str, p.stats.def);
    p.takeHit(this, r.dmg, angle, knockback, stun);
    this.burst(p.x, p.y, p.z + 20, 8, '#ff8a80');
  }

  /** A unit's melee swing: lands on every hostile in its arc (the knight, allies, or Dominion units). */
  enemyStrike(e: Enemy, reach: number, mult: number) {
    let hit = false;
    for (const t of this.hostilesOf(e.team)) {
      if (!inArc(e.x, e.y, e.z, e.facing, reach, 1.0, t.x, t.y, t.z, t.radius)) continue;
      hit = true;
      const ang = Math.atan2(t.y - e.y, t.x - e.x);
      if (t instanceof Player) this.unitHitsKnight(e, mult, ang, 240, 22);
      else this.unitHitsUnit(e, t, mult, ang, 160);
    }
    if (hit) e.hasHitThisSwing = true;
  }

  /** A unit's bolt, aimed at its target plus `spread` radians. Scales with the caster. */
  spawnEnemyBolt(e: Enemy, spread = 0) {
    const t = e.target;
    const ang = (t ? Math.atan2(t.y - e.y, t.x - e.x) : e.facing) + spread;
    const sp = 300;
    this.projectiles.push(new Projectile({
      x: e.x + Math.cos(ang) * 18, y: e.y + Math.sin(ang) * 18, z: e.z + e.def.height * 0.7,
      vx: Math.cos(ang) * sp, vy: Math.sin(ang) * sp,
      radius: e.boss ? 8 : 6, life: 2.4, color: e.def.accent, owner: 'enemy', team: e.team,
      power: e.def.power * 0.9 * (e.str / e.def.str),
      mag: e.str * 0.6,
    }));
    this.sfx.cast(260);
  }

  /** A boss's area attack landing at (x, y): hits every hostile on the ground in the ring. Being in the air clears it. */
  bossShock(e: Enemy, x: number, y: number, r: number, mult: number) {
    for (const t of this.hostilesOf(e.team)) {
      if (t.z > 26 + (t instanceof Enemy ? t.def.hover : 0) || dist(x, y, t.x, t.y) > r + t.radius) continue;
      const ang = Math.atan2(t.y - y, t.x - x);
      if (t instanceof Player) this.unitHitsKnight(e, mult, ang, 320, 26);
      else this.unitHitsUnit(e, t, mult, ang, 220);
    }
  }

  projectileCollide(proj: Projectile) {
    if (proj.owner === 'player') {
      // the knight's spells: Dominion units only
      for (const e of this.enemies) {
        if (!e.alive || e.team === proj.team || proj.hits.has(e)) continue;
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
      return;
    }
    // a unit's bolt: the first hostile it touches
    for (const t of this.hostilesOf(proj.team)) {
      const h = t instanceof Player ? 18 : t.def.height * 0.5;
      if (Math.abs(t.z + h - proj.z) > 56) continue;
      if (dist(proj.x, proj.y, t.x, t.y) > t.radius + proj.radius + 4) continue;
      if (t instanceof Player && this.god) continue;   // god mode: shots pass through the knight
      proj.dead = true;
      const ang = Math.atan2(t.y - proj.y, t.x - proj.x);
      if (t instanceof Player) {
        const r = magicDamage(proj.power * TUNING.enemyDamageMult, proj.mag, t.stats.mres);
        t.takeHit(this, r.dmg, ang, 170, 16);
      } else {
        const r = magicDamage(proj.power * WAR.unitDamageMult, proj.mag, t.mres);
        t.applyDamage(this, r.dmg, WAR.unitPoiseDamage, ang, 90, 0);
        this.floatText(t.x, t.y, t.z + t.def.height + 8, String(r.dmg), proj.color, 13);
      }
      this.burst(proj.x, proj.y, proj.z, 10, proj.color);
      return;
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
        .filter((e) => e.alive && e.team === 'enemy' && dist(e.x, e.y, p.x, p.y) < (surge ? 330 : 260))
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
      if (!e.alive || e.team !== 'enemy') continue;
      const d = dist(x, y, e.x, e.y);
      if (d < bd) { bd = d; best = e; }
    }
    return best;
  }

  /* ------------------------------------------------------- pause menu */

  /** Skill points not yet spent on talents. */
  apFree(): number { return this.player.skillPoints - apSpent(this.player.talents); }

  gearEntries(): GearEntry[] {
    const p = this.player;
    const out: GearEntry[] = [];
    for (const id of p.ownedWeapons) out.push({ kind: 'w', w: weaponById(id), a: null });
    for (const id of p.ownedArmors) out.push({ kind: 'a', w: null, a: armorById(id) });
    return out;
  }

  /** Every recipe, always: nothing is gated on level or on owning a lower tier. */
  synthEntries(): SynthEntry[] {
    const p = this.player;
    const out: SynthEntry[] = [];
    const add = (kind: 'w' | 'a', id: string, name: string, recipe: Recipe, owned: boolean) => {
      const state: SynthState = owned ? 'owned' : canAfford(p.inv, recipe.needs) ? 'ready' : 'lack';
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
    if (inp.wasPressed('cancel')) { this.closeMenu(); return; }

    for (let i = 0; i < MENU_TABS; i++) {
      if (inp.wasPressed(('spell' + (i + 1)) as Action)) this.menuTab = i;
    }

    const cycle = (d: number) => { this.menuTab = (this.menuTab + d + MENU_TABS) % MENU_TABS; };

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

  openMenu(tab: number) {
    this.menuOpen = true;
    this.menuTab = clamp(tab, 0, MENU_TABS - 1);
    this.menuIndex = 0;
    this.input.clearBuffer();
  }

  closeMenu() { this.menuOpen = false; }

  equip(e: GearEntry) {
    const p = this.player;
    if (e.kind === 'w' && e.w) { p.weapon = e.w; this.toast('EQUIPPED ' + e.w.name.toUpperCase()); }
    if (e.kind === 'a' && e.a) { p.armor = e.a; this.toast('EQUIPPED ' + e.a.name.toUpperCase()); }
    p.refreshStats(false);
    this.sfx.cast(520);
    this.save();
  }

  /** Forge anywhere for now; Phase 11 moves the forge to castles you hold and adds the gold fee. */
  craft(e: SynthEntry) {
    const p = this.player;
    if (e.state === 'owned') { this.toast('ALREADY FORGED'); return; }
    if (e.state === 'lack') { this.toast('NOT ENOUGH MATERIALS'); return; }
    spend(p.inv, e.recipe.needs);
    if (e.kind === 'w') { p.ownedWeapons.push(e.id); p.weapon = weaponById(e.id); }
    else { p.ownedArmors.push(e.id); p.armor = armorById(e.id); }
    p.refreshStats(false);
    this.sfx.levelUp();
    this.banner('FORGED', e.name, '#ffd54a');
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
    if (this.apFree() < t.cost) { this.toast('NOT ENOUGH SP'); return; }
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

  /** No EXP and no field drops in v2: spoils are paid on the results screen (Phase 4+). */
  onEnemyDeath(e: Enemy) {
    this.sfx.die();
    this.burst(e.x, e.y, e.z + e.def.height * 0.5, 22, e.def.accent);
    this.ring(e.x, e.y, e.z, 8, 70, e.def.accent);
    this.shake(4 * TUNING.shakeScale);
    this.hitstop(4 * TUNING.hitstopScale);
    if (this.player.lock === e) this.player.lock = null;
  }

  onPlayerDeath() {
    this.deathT = 0;
    this.shake(14);
    this.hitstop(12);
    this.save();
  }

  /** Back on your feet: the test field starts over. (Phase 4: back to the map, warband lost.) */
  recoverFromDeath() {
    this.player = new Player();
    applySave(this.player, loadSave());
    this.particles.length = 0;
    this.floats.length = 0;
    this.deathT = 0;
    this.comboCount = 0;
    this.menuMode = 'root';
    this.menuIndex = 0;
    this.startTestField();
    this.banner('DEFEATED', 'The test field starts over. Gear, talents and materials are kept.', '#ff9d9d');
  }

  /* --------------------------------------------------- touch menu taps */

  /** Hit-test a tap against the pause menu. Returns true if it was consumed. */
  private tapBigMenu(tap: { x: number; y: number }): boolean {
    for (let i = 0; i < MENU_TABS; i++) {
      const tx = MENU_TAB.x + i * (MENU_TAB.w + MENU_TAB.gap);
      if (tap.x >= tx && tap.x <= tx + MENU_TAB.w && tap.y >= MENU_TAB.y && tap.y <= MENU_TAB.y + MENU_TAB.h) {
        this.menuTab = i;
        this.sfx.guard(); return true;
      }
    }
    // a close box in the top-right corner
    if (tap.x > VIEW_W - 60 && tap.y < 52) { this.closeMenu(); return true; }

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
      const i = Math.floor((tap.y - MENU_LIST.y - MENU_LIST.pad) / SYNTH_ROW_H);
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

  /** Save: runs on every meaningful change, and from the panel. */
  save() {
    const p = this.player;
    writeSave({
      skillPoints: p.skillPoints, upgrades: p.upgrades,
      inv: p.inv, weapons: p.ownedWeapons, armors: p.ownedArmors,
      weapon: p.weapon.id, armor: p.armor.id, talents: p.talents,
      potions: p.potions, ethers: p.ethers,
      hero: this.heroStyle, blade: this.bladeStyle,
    });
  }

  resetSave() {
    writeSave(freshSave());
    this.enemies.length = 0;
    this.player = new Player();
    applySave(this.player, loadSave());
    this.placePlayer();
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
    + '<button data-act="upgrade">+1 rank all upgrades</button>'
    + '<button data-act="kill">Clear enemies</button>'
    + '<button data-act="mats">+50 all materials</button>'
    + '<button data-act="sp">+10 SP</button>'
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
        case 'upgrade':
          for (const k of Object.keys(g.player.upgrades) as (keyof KnightUpgrades)[]) {
            g.player.upgrades[k] = Math.min(WAR.upgradeRanks, g.player.upgrades[k] + 1);
          }
          g.player.refreshStats(false);
          g.toast('UPGRADES +1'); g.save();
          break;
        case 'kill':
          for (const e of g.enemies) if (e.alive) e.applyDamage(g, 999999, 0, 0, 0, 0);
          break;
        case 'mats':
          for (const m of MAT_ORDER) g.player.inv[m] = (g.player.inv[m] || 0) + 50;
          g.toast('MATERIALS ADDED'); g.save();
          break;
        case 'sp':
          g.player.skillPoints += 10;
          g.toast('+10 SP'); g.save();
          break;
        case 'god': g.god = !g.god; btn.textContent = `God mode: ${g.god ? 'on' : 'off'}`; break;
        case 'reset': g.resetSave(); if (g.screen !== 'title') g.enterBattle(); break;
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
