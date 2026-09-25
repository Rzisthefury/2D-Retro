/* =========================================================================
 * main.ts — the Game: fixed-timestep loop, the world state machine
 * (location -> travel -> location, location -> battle -> location),
 * progression, saving, and glue.
 * ========================================================================= */

interface MenuRow { label: string; right?: string; enabled: boolean; act: () => void; color?: string; }

interface GearEntry { kind: 'w' | 'a'; w: WeaponDef | null; a: ArmorDef | null; }
type SynthState = 'owned' | 'ready' | 'lack';
interface SynthEntry { kind: 'w' | 'a'; id: string; name: string; recipe: Recipe; state: SynthState; }

/**
 * title    — the front menu
 * location — standing in a place: safe, pick what to do from the panel
 * travel   — on the road; enemies keep coming until you arrive
 * battle   — a wave battle: a boss fight or a Wave Trial
 * Crafting is the forge overlay opened from a location that has a station.
 */
type GameScreen = 'title' | 'location' | 'travel' | 'battle';

interface BattleState {
  kind: 'boss' | 'trial';
  boss: BossDefinition | null;
  superboss: boolean;
  tier: number;             // enemy tier: the location's, or the trial tier
  totalWaves: number;       // boss battles: minion waves + the boss wave; trials: endless (0)
  bossEnemy: Enemy | null;
}

interface SaveData {
  level: number; exp: number; bestWave: number;
  inv: Inventory; weapons: string[]; armors: string[];
  weapon: string; armor: string; talents: TalentSet;
  potions: number; ethers: number;
  world: WorldSave;
}

const SAVE_KEY = 'aerial-finisher-save-v2';

function freshSave(): SaveData {
  return {
    level: 1, exp: 0, bestWave: 1,
    inv: {}, weapons: ['w1'], armors: ['a1'],
    weapon: 'w1', armor: 'a1', talents: {},
    potions: 3, ethers: 2,
    world: worldToSave(freshWorld()),
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
      // Saves from before the open world have no `world`: they start at the hub
      // with their level, gear and materials intact.
      d.world = worldToSave(worldFromSave(j.world));
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

  // ---- the world
  world: WorldState = freshWorld();
  travel: TravelState | null = null;
  battle: BattleState | null = null;
  placeIndex = 0;              // cursor in the location panel
  trialTier = 1;               // Wave Trial tier picked in the panel
  mapIndex = 0;                // cursor on the world map
  forgeOpen = false;           // the station's forge overlay is up
  scroll = 0;                  // road scroll, for the travel backdrop

  wave = 1;
  bestWave = 1;                // best Wave Trial wave, any tier
  restPoint = false;
  restTimer = 0;
  betweenWaves = 0;
  battleOver = 0;              // counts down after a battle is won, then back to the location

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

  waveIntro = 0;               // grace period before the wave activates
  touchSpell = 0;              // which spell the MAG button casts

  menuOpen = false;
  menuTab = 0;                 // 0 gear · 1 synthesis · 2 talents · 3 status · 4 map
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
    this.world = worldFromSave(save.world);
    this.mapIndex = LOCATION_LIST.indexOf(this.place);
    this.trialTier = maxWaveTier(this.world);
    this.bannerT = 0;
  }

  /** Where you are standing, or where you last stood. */
  get place(): WorldLocation { return locById(this.world.currentLocation); }

  /** Whose look and enemies the arena is using right now. */
  scene(): WorldLocation {
    if (this.screen === 'travel' && this.travel) return roadScene(this.travel);
    return this.place;
  }

  inCombat(): boolean { return this.screen === 'travel' || this.screen === 'battle'; }

  atStation(): boolean { return this.screen === 'location' && this.place.hasCraftingStation; }

  hasSave(): boolean {
    const p = this.player;
    return p.level > 1 || this.bestWave > 1 || p.ownedWeapons.length > 1
      || p.ownedArmors.length > 1 || Object.keys(p.talents).length > 0
      || this.world.completedBosses.size > 0 || this.world.discoveredLocations.size > 1;
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
    }
  }

  private pickTitle(label: string) {
    this.sfx.cast(560);
    switch (label) {
      case 'Continue':
      case 'Start':
        this.enterWorld();
        break;
      case 'New Game':
        this.resetSave();
        this.enterWorld();
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

  enterWorld() {
    this.titleMode = 'root';
    this.arrive(this.world.currentLocation, false);
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
    this.input.uiMode = this.menuOpen || this.screen === 'title' || this.screen === 'location';

    if (TUNING.musicVolume !== this.lastMusicVol) {
      this.lastMusicVol = TUNING.musicVolume;
      this.music.setVolume(TUNING.musicVolume);
    }

    if (this.screen === 'title') {
      this.time += dt;
      if (this.bannerT > 0) this.bannerT -= dt;
      this.updateVfx(dt);
      this.music.target = 0;
      this.handleTitle();
      this.input.endTick();
      return;
    }

    // Global toggles work even while paused or dead.
    if (this.input.wasPressed('pause') && this.player.alive && this.inCombat()) this.paused = !this.paused;
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

    if (this.screen === 'location') {
      this.handlePlace();
      this.player.update(this, dt);
      for (const p of this.pickups) p.update(this, dt);
      this.cull();
      this.input.endTick();
      return;
    }

    // Hitstop freezes the simulation but keeps the picture alive.
    if (this.hitstopFrames > 0) { this.hitstopFrames--; this.input.endTick(); return; }

    if (!this.player.alive) {
      this.deathT += dt;
      for (const e of this.enemies) e.update(this, dt);
      this.cull();
      this.input.endTick();
      return;
    }

    // Turn back on the road, or retreat from a battle: B, or tap the button.
    const tap = this.input.takeTap();
    const tappedBack = !!tap && tap.x >= BACK_BTN.x && tap.x <= BACK_BTN.x + BACK_BTN.w
      && tap.y >= BACK_BTN.y && tap.y <= BACK_BTN.y + BACK_BTN.h;
    if (this.input.wasPressed('back') || tappedBack) this.goBack();

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
    if (this.screen === 'travel') this.updateTravel(dt);
    else this.updateBattle(dt);
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
    if (this.menuOpen || this.restPoint || this.screen === 'location' || this.battleOver > 0) want = 0;
    else if (!this.player.alive) want = 1;
    else {
      const alive = this.enemies.filter((e) => e.alive).length;
      if (alive <= 2) want = 1;
      else want = 2;
      if (alive >= 6 || this.comboCount >= 12) want = 3;
      const bossUp = !!this.battle?.bossEnemy?.alive;
      if (bossUp || this.player.hp < this.player.stats.maxHp * 0.25) want = 4;
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

    for (const f of this.floats) { f.z += f.vy * dt; f.vy -= 120 * dt; f.life -= dt; }
    this.floats = this.floats.filter((f) => f.life > 0);

    for (const s of this.slashes) s.life -= dt;
    this.slashes = this.slashes.filter((s) => s.life > 0);

    for (const r of this.rings) r.life -= dt;
    this.rings = this.rings.filter((r) => r.life > 0);
  }

  /* --------------------------------------------------------------- world */

  /** Land somewhere: it becomes the current location and is discovered. */
  arrive(id: string, announce: boolean) {
    const loc = locById(id);
    this.world.currentLocation = loc.id;
    this.world.discoveredLocations.add(loc.id);
    this.screen = 'location';
    this.travel = null;
    this.battle = null;
    this.battleOver = 0;
    this.restPoint = false;
    this.betweenWaves = 0;
    this.waveIntro = 0;
    this.paused = false;
    // loot left on the floor is swept into your pack rather than lost
    for (const p of this.pickups) if (!p.collected) { p.collected = true; this.collect(p); }
    this.pickups.length = 0;
    for (const e of this.enemies) if (e.alive) this.ring(e.x, e.y, e.z, 6, 50, '#ffffff');
    this.enemies.length = 0;
    this.projectiles.length = 0;
    this.player.lock = null;
    this.player.x = VIEW_W / 2 + 90;
    this.player.y = VIEW_H / 2 + 40;
    this.player.vx = this.player.vy = 0;
    // Havens and forges are safe ground: rest there and you are made whole,
    // and the quartermaster tops your pack back up.
    if (loc.tier === 0 || loc.hasCraftingStation) {
      this.player.hp = this.player.stats.maxHp;
      this.player.mp = this.player.stats.maxMp;
      this.player.charging = false;
      this.player.potions = Math.max(this.player.potions, 3);
      this.player.ethers = Math.max(this.player.ethers, 2);
    }
    this.placeIndex = 0;
    this.mapIndex = LOCATION_LIST.indexOf(loc);
    this.trialTier = clamp(this.trialTier, 1, maxWaveTier(this.world));
    if (announce) {
      this.banner(loc.name.toUpperCase(),
        loc.hasCraftingStation ? `${loc.stationName}  ·  HP / MP restored, items restocked`
          : `Tier ${loc.tier}  ·  recommended Lv ${recommendedLevel(loc)}`,
        loc.look.accent);
    }
    this.save();
  }

  /** Set out along a road from the current location. */
  travelTo(id: string): boolean {
    if (this.screen !== 'location') { this.toast('FINISH WHAT YOU ARE DOING FIRST'); return false; }
    const here = this.world.currentLocation;
    if (id === here) { this.toast('YOU ARE ALREADY HERE'); return false; }
    if (!isAreaUnlocked(this.world, id)) { this.toast(lockedAreaText(id).toUpperCase()); return false; }
    if (!roadTime(here, id)) { this.toast('NO ROAD FROM HERE — TRAVEL THROUGH A NEIGHBOUR'); return false; }
    this.closeMenu();
    this.travel = newTravel(here, id);
    this.screen = 'travel';
    this.enemies.length = 0;
    this.projectiles.length = 0;
    this.player.x = this.arena.x + 90;
    this.player.y = this.arena.y + this.arena.h / 2;
    this.waveIntro = 0;
    this.banner('ON THE ROAD', `to ${locById(id).name}  ·  ${Math.round(this.travel.duration)}s`, locById(id).look.accent);
    this.sfx.cast(640);
    return true;
  }

  private updateTravel(dt: number) {
    const t = this.travel;
    if (!t) return;
    if (tickTravel(this, t, dt)) this.finishTravel();
  }

  private finishTravel() {
    const t = this.travel!;
    // The road pays: EXP for the distance, scaled by how dangerous it was.
    const tier = roadScene(t).tier;
    const bonus = Math.round(t.duration * 2 * TIER_SCALING.xpMultiplier(Math.max(1, tier)) * TUNING.expMult);
    this.arrive(t.to, true);
    if (bonus > 0) this.grantExp(bonus, this.player.x, this.player.y, 20);
  }

  /** B / the on-screen button: turn around on a road, or leave a battle. */
  private goBack() {
    if (this.screen === 'travel' && this.travel) {
      reverseTravel(this.travel);
      this.toast(`TURNING BACK TO ${locById(this.travel.to).name.toUpperCase()}`);
      this.sfx.guard();
    } else if (this.screen === 'battle' && this.battleOver <= 0) {
      this.arrive(this.world.currentLocation, false);
      this.banner('RETREATED', 'Anything you picked up is yours to keep', '#9fd8ff');
    }
  }

  /** The action list shown while standing in a location. */
  placeRows(): MenuRow[] {
    const l = this.place;
    const w = this.world;
    const rows: MenuRow[] = [];
    for (const b of l.bosses) {
      const done = bossDefeated(w, b.id);
      rows.push({
        label: `${done ? '\u2713' : '\u2620'} ${b.name}`,
        right: done ? 'again' : `Lv ${this.bossLevel(b)}`,
        enabled: true, color: done ? '#69e29a' : b.accent,
        act: () => this.startBoss(b, false),
      });
    }
    if (l.tier > 0) {
      const t = this.trialTier;
      rows.push({
        label: 'Wave Trial', right: `◀ Tier ${t} ▶`, enabled: true,
        act: () => this.startTrial(t),
      });
    }
    if (l.hasCraftingStation) {
      rows.push({ label: l.stationName || 'Forge', right: 'FORGE', enabled: true, act: () => this.openForge(), color: l.look.accent });
    }
    rows.push({ label: 'Travel', right: 'MAP', enabled: true, act: () => this.openMenu(4) });
    if (l.id !== HUB_ID) {
      rows.push({ label: 'Road home', right: `${l.hubDistance}s`, enabled: true, act: () => this.travelTo(HUB_ID) });
    }
    rows.push({ label: 'Gear & talents', right: '', enabled: true, act: () => this.openMenu(0) });
    rows.push({ label: 'Save', right: '', enabled: true, act: () => { this.save(); this.toast('GAME SAVED'); this.sfx.cast(700); } });
    void w;
    return rows;
  }

  private handlePlace() {
    const inp = this.input;
    const rows = this.placeRows();
    if (this.placeIndex >= rows.length) this.placeIndex = 0;
    const tap = inp.takeTap();
    if (tap) {
      const i = this.placeRowAt(tap.x, tap.y, rows.length);
      if (i >= 0) {
        const r = rows[i];
        // the trial row's arrows are their own targets
        if (r.label === 'Wave Trial' && tap.x > PLACE_PANEL.x + PLACE_PANEL.w - 120) {
          this.nudgeTrial(tap.x < PLACE_PANEL.x + PLACE_PANEL.w - 60 ? -1 : 1);
          this.placeIndex = i;
          return;
        }
        if (this.placeIndex === i || IS_TOUCH === false) { this.placeIndex = i; if (r.enabled) r.act(); }
        else { this.placeIndex = i; this.sfx.guard(); }
        return;
      }
    }
    if (inp.wasPressed('down')) { this.placeIndex = (this.placeIndex + 1) % rows.length; this.sfx.guard(); }
    if (inp.wasPressed('up')) { this.placeIndex = (this.placeIndex - 1 + rows.length) % rows.length; this.sfx.guard(); }
    const cur = rows[this.placeIndex];
    if (cur && cur.label === 'Wave Trial') {
      if (inp.wasPressed('left')) this.nudgeTrial(-1);
      if (inp.wasPressed('right')) this.nudgeTrial(1);
    }
    if (inp.wasPressed('confirm') && cur) {
      if (cur.enabled) cur.act(); else this.toast('NOT AVAILABLE');
    }
  }

  /** Row index under a point in the location panel, or -1. */
  placeRowAt(x: number, y: number, n: number): number {
    const top = PLACE_PANEL.y + 52;
    if (x < PLACE_PANEL.x || x > PLACE_PANEL.x + PLACE_PANEL.w || y < top) return -1;
    const i = Math.floor((y - top) / PLACE_PANEL.rowH);
    return i >= 0 && i < n ? i : -1;
  }

  private nudgeTrial(d: number) {
    const tiers = [...this.world.unlockedWaveTiers].sort((a, b) => a - b);
    const i = Math.max(0, tiers.indexOf(this.trialTier));
    this.trialTier = tiers[clamp(i + d, 0, tiers.length - 1)];
    this.sfx.guard();
  }

  openMenu(tab: number) {
    this.menuOpen = true;
    this.menuTab = tab;
    this.menuIndex = 0;
    if (tab === 4) this.mapIndex = LOCATION_LIST.indexOf(this.place);
    this.input.clearBuffer();
  }

  closeMenu() {
    this.menuOpen = false;
    this.forgeOpen = false;
  }

  openForge() {
    if (!this.atStation()) { this.toast('NO FORGE HERE'); return; }
    this.openMenu(1);
    this.forgeOpen = true;
    this.sfx.cast(420);
  }

  /* ------------------------------------------------------------- battles */

  startTrial(tier: number) {
    if (this.screen !== 'location') return;
    if (this.place.tier === 0) { this.toast('NO TRIALS IN THE HAVEN'); return; }
    if (!this.world.unlockedWaveTiers.has(tier)) { this.toast(lockedTierText(tier).toUpperCase()); return; }
    this.battle = { kind: 'trial', boss: null, superboss: false, tier, totalWaves: 0, bossEnemy: null };
    this.beginBattle();
    this.banner(`WAVE TRIAL ${tier}`, `${this.place.name}  ·  endless — press B to leave`, this.place.look.accent);
  }

  bossLevel(b: BossDefinition): number { return TIER_LEVELS[clamp(b.tier, 1, 10)][1]; }

  /** A boss battle: two waves of the area's enemies, then the boss itself. */
  startBoss(b: BossDefinition, superboss: boolean) {
    if (this.screen !== 'location') return;
    if (bossHome(b.id) !== this.world.currentLocation) { this.toast('THAT BOSS IS ELSEWHERE'); return; }
    this.battle = { kind: 'boss', boss: b, superboss, tier: b.tier, totalWaves: 3, bossEnemy: null };
    this.beginBattle();
    this.banner(b.name.toUpperCase(), `${b.title}  ·  2 waves, then the boss`, b.accent);
  }

  private spawnBoss() {
    const bt = this.battle!;
    const b = bt.boss!;
    const a = this.arena;
    const e = new Enemy(bossEnemyDef(b), a.x + a.w / 2, a.y + 70, this.bossLevel(b), b.tier);
    e.boss = b;
    if (bt.superboss) makeAscendant(e, b);
    this.enemies.push(e);
    bt.bossEnemy = e;
    this.ring(e.x, e.y, 0, 12, 140, b.accent);
    // deeper bosses bring a guard or two
    const guards = b.tier >= 7 ? 2 : b.tier >= 4 ? 1 : 0;
    for (let i = 0; i < guards; i++) {
      const pos = this.spawnPoint(i * 2 + 1, 4);
      const id = pick(this.place.enemyTypes);
      this.enemies.push(new Enemy(ENEMIES[id], pos.x, pos.y, this.levelFor(bt.tier), bt.tier));
    }
  }

  /** The boss is down: record it, open what it opens, drop its spoils. */
  private winBoss() {
    const bt = this.battle!;
    const b = bt.boss!;
    const first = !bossDefeated(this.world, b.id);
    const opened = defeatBoss(this.world, b);
    const e = bt.bossEnemy!;
    const mult = bt.superboss ? b.superboss.dropMultiplier : 1;
    for (const m of b.uniqueMaterials) {
      this.pickups.push(new Pickup(e.x, e.y, 30, 'mat', m, Math.round(rndInt(2, 4) * mult)));
    }
    for (const d of rollDrops(ENEMIES[pick(this.place.enemyTypes)].id, b.tier + 2, 2 * mult)) {
      this.pickups.push(new Pickup(e.x, e.y, 30, d.kind, d.id, d.count));
    }
    if (b.tier >= 5) this.pickups.push(new Pickup(e.x, e.y, 30, 'mat', 'core', Math.round(rndInt(1, 2) * mult)));
    this.pickups.push(new Pickup(e.x, e.y, 30, 'potion', null, 1));
    if (bt.superboss) winAscendant(this, b, e);
    this.battleOver = 4.5;
    this.sfx.levelUp();
    const sub = opened.length ? `Unlocked: ${opened.join('  ·  ')}` : first ? 'Its spoils are yours' : 'Farmed again';
    this.banner(bt.superboss ? 'ASCENDANT FELLED' : 'BOSS DEFEATED', sub, b.accent);
    this.save();
  }

  private beginBattle() {
    this.screen = 'battle';
    this.restPoint = false;
    this.betweenWaves = 0;
    this.battleOver = 0;
    this.player.x = VIEW_W / 2;
    this.player.y = VIEW_H / 2 + 40;
    this.startWave(1);
  }

  waveScale(): number {
    return 1 + TUNING.waveScaling * (this.wave - 1);
  }

  /** Enemy costs for filling a wave from the location's native enemy types. */
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

  /** Level for an enemy fighting at `tier`: drawn from that tier's band. */
  private levelFor(tier: number): number {
    const band = TIER_LEVELS[clamp(tier, 1, 10)];
    return rndInt(band[0], band[1]);
  }

  startWave(n: number) {
    const b = this.battle!;
    this.wave = n;
    this.player.secondWindUsed = false;
    this.waveIntro = Math.max(0, TUNING.waveIntro);
    this.enemies.length = 0;
    this.projectiles.length = 0;
    this.player.lock = null;
    if (b.kind === 'boss' && n >= b.totalWaves) { this.spawnBoss(); this.save(); return; }
    const ids = this.composition(b.kind === 'boss' ? n + 1 : n, this.place.enemyTypes);
    const extra = b.kind === 'boss' ? 1 : this.waveScale();
    for (let i = 0; i < ids.length; i++) {
      const pos = this.spawnPoint(i, ids.length);
      this.enemies.push(new Enemy(ENEMIES[ids[i]], pos.x, pos.y, this.levelFor(b.tier), b.tier, extra));
      this.ring(pos.x, pos.y, 0, 8, 60, '#8fb4ff');
    }
    if (b.kind === 'trial') {
      if (n > (this.world.trialBest[b.tier] || 0)) this.world.trialBest[b.tier] = n;
      if (n > this.bestWave) this.bestWave = n;
    }
    this.save();
  }

  spawnPoint(i: number, total: number) {
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

  private updateBattle(dt: number) {
    const b = this.battle;
    if (!b) return;
    if (this.battleOver > 0) {
      this.battleOver -= dt;
      if (this.battleOver <= 0) this.arrive(this.world.currentLocation, false);
      return;
    }
    const anyAlive = this.enemies.some((e) => e.alive);
    if (anyAlive) return;

    if (b.kind === 'boss' && this.wave >= b.totalWaves) { this.winBoss(); return; }

    if (this.betweenWaves <= 0 && !this.restPoint) {
      // wave just cleared
      this.sfx.wave();
      const isRest = b.kind === 'trial' && this.wave % 5 === 0;
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
      if (b.kind === 'boss' && this.wave >= b.totalWaves) {
        this.banner(b.boss!.name.toUpperCase(), b.superboss ? 'ASCENDANT' : b.boss!.title, b.boss!.accent);
      } else this.banner(`WAVE ${this.wave}`, 'Get ready', '#8fb4ff');
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

  /** An enemy bolt, aimed at the player plus `spread` radians. Scales with the caster. */
  spawnEnemyBolt(e: Enemy, spread = 0) {
    const p = this.player;
    const ang = Math.atan2(p.y - e.y, p.x - e.x) + spread;
    const sp = 300;
    this.projectiles.push(new Projectile({
      x: e.x + Math.cos(ang) * 18, y: e.y + Math.sin(ang) * 18, z: e.z + e.def.height * 0.7,
      vx: Math.cos(ang) * sp, vy: Math.sin(ang) * sp,
      radius: e.boss ? 8 : 6, life: 2.4, color: e.def.accent, owner: 'enemy',
      power: e.def.power * 0.9 * (e.str / e.def.str),
      mag: e.str * 0.6,
    }));
    this.sfx.cast(260);
  }

  /** A boss's area attack landing at (x, y). Being in the air clears it. */
  bossShock(e: Enemy, x: number, y: number, r: number, mult: number) {
    const p = this.player;
    if (!p.alive || p.z > 26 || dist(x, y, p.x, p.y) > r + p.radius) return;
    if (this.god) { this.floatText(p.x, p.y, p.z + 40, 'GOD', '#7fe8ff', 14); return; }
    const res = physDamage(e.def.power * mult * TUNING.enemyDamageMult * (e.str / e.def.str), e.str, p.stats.def);
    p.takeHit(this, res.dmg, Math.atan2(p.y - y, p.x - x), 320, 26);
    this.burst(p.x, p.y, p.z + 20, 10, '#ff8a80');
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
      const r = magicDamage(proj.power * TUNING.enemyDamageMult, proj.mag, p.stats.mres);
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
      if (inp.wasPressed(('spell' + (i + 1)) as Action)) { this.menuTab = i; if (i !== 1) this.forgeOpen = false; }
    }

    const cycle = (d: number) => {
      this.menuTab = (this.menuTab + d + MENU_TABS) % MENU_TABS;
      if (this.menuTab !== 1) this.forgeOpen = false;
    };

    if (this.menuTab === 2) {
      if (inp.wasPressed('left')) { this.talentBranch = (this.talentBranch + 2) % 3; this.talentIndex = 0; this.sfx.guard(); }
      if (inp.wasPressed('right')) { this.talentBranch = (this.talentBranch + 1) % 3; this.talentIndex = 0; this.sfx.guard(); }
      const list = talentsIn(BRANCHES[this.talentBranch].id);
      if (inp.wasPressed('down')) { this.talentIndex = (this.talentIndex + 1) % list.length; this.sfx.guard(); }
      if (inp.wasPressed('up')) { this.talentIndex = (this.talentIndex - 1 + list.length) % list.length; this.sfx.guard(); }
      if (inp.wasPressed('confirm')) this.learnTalent(list[this.talentIndex].id);
      return;
    }

    if (this.menuTab === 4) {
      // the world map: arrows walk the cursor between places
      if (inp.wasPressed('left')) this.moveMapCursor(-1, 0);
      if (inp.wasPressed('right')) this.moveMapCursor(1, 0);
      if (inp.wasPressed('up')) this.moveMapCursor(0, -1);
      if (inp.wasPressed('down')) this.moveMapCursor(0, 1);
      if (inp.wasPressed('confirm')) this.travelTo(LOCATION_LIST[this.mapIndex].id);
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

  /** Step the map cursor to the nearest place roughly in direction (dx, dy). */
  private moveMapCursor(dx: number, dy: number) {
    const from = mapPoint(LOCATION_LIST[this.mapIndex]);
    let best = -1, bestScore = Infinity;
    LOCATION_LIST.forEach((l, i) => {
      if (i === this.mapIndex) return;
      const p = mapPoint(l);
      const vx = p.x - from.x, vy = p.y - from.y;
      const d = Math.hypot(vx, vy);
      const along = (vx * dx + vy * dy) / d;       // cosine to the pressed direction
      if (along < 0.35) return;
      const score = d / along;
      if (score < bestScore) { bestScore = score; best = i; }
    });
    if (best >= 0) { this.mapIndex = best; this.sfx.guard(); }
  }

  equip(e: GearEntry) {
    const p = this.player;
    if (e.kind === 'w' && e.w) { p.weapon = e.w; this.toast('EQUIPPED ' + e.w.name.toUpperCase()); }
    if (e.kind === 'a' && e.a) { p.armor = e.a; this.toast('EQUIPPED ' + e.a.name.toUpperCase()); }
    p.refreshStats(false);
    this.sfx.cast(520);
    this.save();
  }

  /** Forging only happens at a crafting station. */
  craft(e: SynthEntry) {
    const p = this.player;
    if (!this.atStation()) { this.toast('FIND A CRAFTING STATION TO FORGE'); return; }
    if (e.state === 'owned') { this.toast('ALREADY FORGED'); return; }
    if (e.state === 'lack') { this.toast('NOT ENOUGH MATERIALS'); return; }
    spend(p.inv, e.recipe.needs);
    if (e.kind === 'w') { p.ownedWeapons.push(e.id); p.weapon = weaponById(e.id); }
    else { p.ownedArmors.push(e.id); p.armor = armorById(e.id); }
    p.refreshStats(false);
    this.sfx.levelUp();
    this.banner('FORGED', `${e.name} — ${this.place.stationName || 'forge'}`, this.place.look.accent);
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
    if (this.travel) this.travel.kills++;
    this.sfx.die();
    this.burst(e.x, e.y, e.z + e.def.height * 0.5, 22, e.def.accent);
    this.ring(e.x, e.y, e.z, 8, 70, e.def.accent);
    this.shake(4 * TUNING.shakeScale);
    this.hitstop(4 * TUNING.hitstopScale);
    if (this.player.lock === e) this.player.lock = null;

    const luck = TUNING.dropRate * (this.player.hasT('scavenger') ? 1.55 : 1);
    for (const d of rollDrops(e.def.id, e.tier, luck)) {
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

  /**
   * Back on your feet after a defeat. Levels, gear, materials and talents all
   * persist — you wake at the last safe place: where the road started, or the
   * location the battle was in.
   */
  recoverFromDeath() {
    const safe = this.screen === 'travel' && this.travel ? this.travel.from : this.world.currentLocation;
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
    this.arrive(safe, false);
    this.player.hp = this.player.stats.maxHp;
    this.player.mp = this.player.stats.maxMp;
    this.banner('DEFEATED', `You come to in ${locById(safe).name}. Nothing was lost.`, '#ff9d9d');
  }

  /* --------------------------------------------------- touch menu taps */

  /** Hit-test a tap against the pause menu. Returns true if it was consumed. */
  private tapBigMenu(tap: { x: number; y: number }): boolean {
    for (let i = 0; i < MENU_TABS; i++) {
      const tx = MENU_TAB.x + i * (MENU_TAB.w + MENU_TAB.gap);
      if (tap.x >= tx && tap.x <= tx + MENU_TAB.w && tap.y >= MENU_TAB.y && tap.y <= MENU_TAB.y + MENU_TAB.h) {
        this.menuTab = i;
        if (i !== 1) this.forgeOpen = false;
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
    if (this.menuTab === 4) {
      // tap a place to select it, tap it again to set out
      for (let i = 0; i < LOCATION_LIST.length; i++) {
        const p = mapPoint(LOCATION_LIST[i]);
        if (Math.hypot(tap.x - p.x, tap.y - p.y) <= 20) {
          if (this.mapIndex === i) this.travelTo(LOCATION_LIST[i].id);
          else { this.mapIndex = i; this.sfx.guard(); }
          return true;
        }
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

  /** Save anywhere: this runs on every meaningful change, and from the panel. */
  save() {
    const p = this.player;
    writeSave({
      level: p.level, exp: p.exp, bestWave: this.bestWave,
      inv: p.inv, weapons: p.ownedWeapons, armors: p.ownedArmors,
      weapon: p.weapon.id, armor: p.armor.id, talents: p.talents,
      potions: p.potions, ethers: p.ethers,
      world: worldToSave(this.world),
    });
  }

  resetSave() {
    writeSave(freshSave());
    this.bestWave = 1;
    this.world = freshWorld();
    this.trialTier = 1;
    this.player = new Player();
    applySave(this.player, loadSave());
    this.toast('SAVE RESET');
  }

  /* ----------------------------------------------------------------- fx */

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

/** Screen position of a place on the world map (MAP tab). */
function mapPoint(l: WorldLocation): { x: number; y: number } {
  return {
    x: MAP_BOX.x + 34 + l.map.x * (MAP_BOX.w - 68),
    y: MAP_BOX.y + 40 + l.map.y * (MAP_BOX.h - 80),
  };
}

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
    + '<button data-act="areas">Unlock all areas + tiers</button>'
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
        case 'skip':
          if (g.screen === 'battle' && g.battle?.kind === 'trial') { g.startWave(g.wave + 5); g.banner(`WAVE ${g.wave}`, '', '#8fb4ff'); }
          else g.toast('ONLY IN A WAVE TRIAL');
          break;
        case 'mats':
          for (const m of MAT_ORDER) g.player.inv[m] = (g.player.inv[m] || 0) + 50;
          g.toast('MATERIALS ADDED'); g.save();
          break;
        case 'ap':
          for (let i = 0; i < 10; i++) g.grantExp(expToNext(g.player.level), g.player.x, g.player.y, 20);
          break;
        case 'areas':
          for (const l of LOCATION_LIST) g.world.unlockedAreas.add(l.id);
          for (let t = 1; t <= 10; t++) g.world.unlockedWaveTiers.add(t);
          g.toast('ALL AREAS AND TIERS OPEN'); g.save();
          break;
        case 'god': g.god = !g.god; btn.textContent = `God mode: ${g.god ? 'on' : 'off'}`; break;
        case 'reset': g.resetSave(); if (g.screen !== 'title') g.arrive(HUB_ID, true); break;
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
