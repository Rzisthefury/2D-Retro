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
 * title     — the front menu
 * campaign  — the campaign map (Phase 6)
 * sandbox   — debug: one battle of each type and the test field (the Phase 4-5 stub)
 * battle    — a scrolling battlefield, ending in its results screen
 * victory   — the run's tallies after the warlord falls: New Game+ or the title (PLAN 13)
 */
type GameScreen = 'title' | 'campaign' | 'battle' | 'sandbox' | 'victory';

interface SaveData {
  skillPoints: number; upgrades: KnightUpgrades; gold: number;
  inv: Inventory; weapons: string[]; armors: string[];
  weapon: string; armor: string; talents: TalentSet;
  potions: number; ethers: number;
  hero: HeroStyle; blade: BladeStyle;
  war: number[][] | null;            // node owners and levels (Campaign.save); null = a fresh war
  econ: object | null;               // gold in the villages, garrisons, convoys, warband (War.save)
  difficulty: Difficulty;            // chosen at New Game, changeable in Options (PLAN 13)
  ng: number;                        // New Game+ cycle
  stats: RunStats | null;            // this run's tallies for the victory screen
  story: string[];                   // story lines already shown ('keep', 'castle', 'general')
  at: number;                        // when it was saved (the title's Continue picks the newest slot)
}

// Three slots (PLAN 13). Never read or write Aerial Finisher's `aerial-finisher-save-*` keys.
const SLOT_COUNT = 3;
const slotKey = (n: number) => `aerial-conquest-slot${n}`;
let SAVE_SLOT = 1;                   // the slot loadSave / writeSave use

/** What the slot picker shows for a slot, or null if it's empty. */
interface SlotInfo { land: number; time: number; ng: number; difficulty: Difficulty; won: boolean; at: number; }

function slotInfo(n: number): SlotInfo | null {
  try {
    const raw = localStorage.getItem(slotKey(n));
    if (!raw) return null;
    const j = JSON.parse(raw) || {};
    // territories held = castles you own in the saved war (the Last Camp's alone if none saved yet)
    let land = 1, won = false;
    if (Array.isArray(j.war) && j.war.length === CONTINENT.nodes.length) {
      land = 0;
      CONTINENT.nodes.forEach((row, i) => {
        if (row[1] !== 'castle' || !Array.isArray(j.war[i]) || j.war[i][0] !== 1) return;
        land++;
        if (row[2] === WAR.capitalTerritory) won = true;
      });
    }
    const diff: Difficulty = j.difficulty === 'easy' || j.difficulty === 'hard' ? j.difficulty : 'normal';
    return { land, time: Math.max(0, +(j.stats && j.stats.time) || 0), ng: Math.max(0, j.ng | 0), difficulty: diff, won, at: +j.at || 0 };
  } catch { return null; }
}

/** The most recently saved slot (1 if none). */
function lastSlot(): number {
  let best = 1, at = -1;
  for (let n = 1; n <= SLOT_COUNT; n++) { const s = slotInfo(n); if (s && s.at > at) { at = s.at; best = n; } }
  return best;
}

function freshSave(): SaveData {
  return {
    skillPoints: WAR.startSkillPoints, upgrades: freshUpgrades(), gold: 0,
    inv: {}, weapons: ['w1'], armors: ['a1'],
    weapon: 'w1', armor: 'a1', talents: {},
    potions: 3, ethers: 2,
    hero: 'wayfarer', blade: 'longsword',
    war: null, econ: null,
    difficulty: 'normal', ng: 0, stats: null, story: [], at: 0,
  };
}

function loadSave(): SaveData {
  const d = freshSave();
  try {
    const raw = localStorage.getItem(slotKey(SAVE_SLOT));
    if (raw) {
      const j = JSON.parse(raw) || {};
      if (typeof j.skillPoints === 'number') d.skillPoints = Math.max(0, j.skillPoints | 0);
      if (j.upgrades && typeof j.upgrades === 'object') {
        for (const k of Object.keys(d.upgrades) as (keyof KnightUpgrades)[]) {
          d.upgrades[k] = clamp(j.upgrades[k] | 0, 0, WAR.upgradeRanks);
        }
      }
      d.potions = Math.max(0, j.potions | 0);
      d.gold = Math.max(0, j.gold | 0);
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
      if (Array.isArray(j.war)) d.war = j.war;   // Campaign.load validates it against the continent
      if (j.econ && typeof j.econ === 'object') d.econ = j.econ;   // ...and War.load this
      const okDiff = (x: unknown): x is Difficulty => x === 'easy' || x === 'normal' || x === 'hard';
      if (okDiff(j.difficulty)) d.difficulty = j.difficulty;
      else if (j.econ && j.econ.ai && okDiff(j.econ.ai.difficulty)) d.difficulty = j.econ.ai.difficulty;
      d.ng = clamp(j.ng | 0, 0, 99);
      if (j.stats && typeof j.stats === 'object') {
        const s = freshStats();
        for (const k of Object.keys(s) as (keyof RunStats)[]) s[k] = Math.max(0, +j.stats[k] || 0);
        d.stats = s;
      }
      if (Array.isArray(j.story)) d.story = j.story.filter((x: unknown) => typeof x === 'string' && STORY_FIRSTS.includes(x as string));
      d.at = +j.at || 0;
    }
  } catch { /* private mode, blocked storage — play on regardless */ }
  return d;
}

/** Push a save blob onto a player instance. */
function applySave(p: Player, d: SaveData) {
  p.skillPoints = d.skillPoints;
  p.gold = d.gold;
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
  try { localStorage.setItem(slotKey(SAVE_SLOT), JSON.stringify(d)); } catch { /* ignore */ }
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

  army = new Army();
  battle: Battle = new Battle(testSpec());
  campIndex = 0;               // row picked on the campaign stub
  fadeT = 0;                   // battle entry fade
  private exitPushT = 0;       // how long the knight has pushed into their own edge
  private routT = 0;

  // orders (PLAN 11.4)
  order: Order = 'follow';
  wheelOpen = false;           // the order wheel is up
  wheelTouch = false;          // ...opened by the touch radial (vs. Q / LB)
  wheelT = 0;                  // how long Q / LB has been held
  wheelDir = -1;               // highlighted slice: 0 up (Charge), 1 right (Focus), 2 down (Hold), 3 left (Follow)
  wheelX = 0; wheelY = 0;      // where the wheel is drawn (screen px)
  private focusCache: Combatant | null = null;
  private focusFrame = -1;
  private minionStop = 0;      // hitstop frames minion kills have added this sim frame
  private minionSfxT = 0;      // rate limit on minion hit/death sounds
  perfWork = new Float32Array(600);   // ms of sim + draw per frame (ring buffer)
  perfGap = new Float32Array(600);    // ms between frames
  perfIdx = 0;

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
  titleMode: 'root' | 'options' | 'help' | 'slots' | 'slot' | 'difficulty' = 'root';
  titleIndex = 0;
  pendingSlot = 1;             // the slot being picked on the title's slot screens
  optionIndex = 0;

  waveIntro = 0;               // grace period before a fresh group activates
  touchSpell = 0;              // which spell the MAG button casts

  menuOpen = false;
  menuTab = 0;                 // 0 gear · 1 forge · 2 talents · 3 knight · 4 status
  gearIndex = 0;
  synthIndex = 0;
  knightIndex = 0;
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

    SAVE_SLOT = lastSlot();
    const save = loadSave();
    applySave(this.player, save);
    this.heroStyle = save.hero;
    this.bladeStyle = save.blade;
    this.placePlayer();
    this.bannerT = 0;
    this.follow(true);
  }

  inCombat(): boolean { return this.screen !== 'title'; }

  /** Is there a game in the current (newest) slot to Continue? */
  hasSave(): boolean { return !!slotInfo(SAVE_SLOT); }

  /** The slot the game is reading and writing (1-3). */
  get slot(): number { return SAVE_SLOT; }

  titleRows(): string[] {
    switch (this.titleMode) {
      case 'options': return ['Music volume', 'Sound volume', 'Difficulty', 'Hero', 'Blade', 'Back'];
      case 'help': return ['Back'];
      case 'slots': return ['Slot 1', 'Slot 2', 'Slot 3', 'Back'];
      case 'slot': return ['Continue', 'New Game', 'Back'];
      case 'difficulty': return ['Easy', 'Normal', 'Hard', 'Back'];
    }
    return this.hasSave() ? ['Continue', 'Play', 'Options', 'How to Play'] : ['Play', 'Options', 'How to Play'];
  }

  /** Where title row i sits: the slot picker's rows are taller (they carry a summary), options' tighter. */
  titleRowAt(i: number): { x: number; y: number; w: number; h: number } {
    const R = this.titleMode === 'slots' ? SLOT_ROW : this.titleMode === 'options' ? OPTION_ROW : TITLE_ROW;
    return { x: R.x, y: R.y0 + i * (R.h + R.gap), w: R.w, h: R.h };
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
        const r = this.titleRowAt(i);
        if (tap.x >= r.x && tap.x <= r.x + r.w && tap.y >= r.y && tap.y <= r.y + r.h) {
          cur = i;
          activate = true;
        }
      }
      // on the options screen, tapping either side of the selected row nudges it
      if (!activate && this.titleMode === 'options') {
        const r = this.titleRowAt(cur);
        if (tap.y >= r.y - 20 && tap.y <= r.y + r.h + 20) {
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
      if (this.titleMode === 'slot' || this.titleMode === 'difficulty') { this.titleMode = 'slots'; this.titleIndex = this.pendingSlot - 1; }
      else { this.titleMode = 'root'; this.titleIndex = 0; }
      return;
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
      // the current slot's difficulty (PLAN 13: changeable in Options); an empty slot chooses at New Game
      if (!slotInfo(SAVE_SLOT)) { this.toast('CHOOSE IT AT NEW GAME'); return; }
      const d = loadSave(), i = DIFFICULTIES.indexOf(d.difficulty);
      d.difficulty = DIFFICULTIES[(i + dir + DIFFICULTIES.length) % DIFFICULTIES.length];
      writeSave(d);
      this.war.difficulty = d.difficulty;
      this.sfx.guard();
    } else if (row === 3) {
      const i = HERO_STYLES.findIndex((h) => h.id === this.heroStyle);
      this.heroStyle = HERO_STYLES[(i + dir + HERO_STYLES.length) % HERO_STYLES.length].id;
      this.sfx.guard();
      this.saveLooks();
    } else if (row === 4) {
      const i = BLADE_STYLES.findIndex((b) => b.id === this.bladeStyle);
      this.bladeStyle = BLADE_STYLES[(i + dir + BLADE_STYLES.length) % BLADE_STYLES.length].id;
      this.sfx.guard();
      this.saveLooks();
    }
  }

  /** The title's looks go into the current slot's save, if it has one (a new game picks them up either way). */
  private saveLooks() {
    if (!slotInfo(SAVE_SLOT)) return;
    const d = loadSave();
    d.hero = this.heroStyle; d.blade = this.bladeStyle;
    writeSave(d);
  }

  /** Continue a slot's game. */
  continueSlot(n: number) {
    SAVE_SLOT = n;
    const d = loadSave();
    this.heroStyle = d.hero; this.bladeStyle = d.blade;
    this.enterCampaign();
  }

  /** A fresh war in slot n at this difficulty (overwriting what was there), opening on the intro card (PLAN 13). */
  startNewGame(n: number, difficulty: Difficulty) {
    SAVE_SLOT = n;
    const d = freshSave();
    d.difficulty = difficulty; d.hero = this.heroStyle; d.blade = this.bladeStyle; d.at = Date.now();
    writeSave(d);
    this.enterCampaign();
    this.save();
    this.story = { title: STORY.introTitle, lines: STORY.intro(this.camp.castleOf(WAR.capitalTerritory).name) };
  }

  private pickTitle(label: string) {
    this.sfx.cast(560);
    switch (label) {
      case 'Continue':
        this.continueSlot(this.titleMode === 'slot' ? this.pendingSlot : SAVE_SLOT);
        break;
      case 'Play':
        this.titleMode = 'slots'; this.titleIndex = SAVE_SLOT - 1;
        break;
      case 'Slot 1': case 'Slot 2': case 'Slot 3':
        this.pendingSlot = +label.slice(5);
        if (slotInfo(this.pendingSlot)) { this.titleMode = 'slot'; this.titleIndex = 0; }
        else { this.titleMode = 'difficulty'; this.titleIndex = 1; }
        break;
      case 'New Game':
        this.titleMode = 'difficulty'; this.titleIndex = 1;
        break;
      case 'Easy': case 'Normal': case 'Hard':
        this.startNewGame(this.pendingSlot, label.toLowerCase() as Difficulty);
        break;
      case 'Options':
        this.titleMode = 'options'; this.optionIndex = 0;
        break;
      case 'How to Play':
        this.titleMode = 'help'; this.titleIndex = 0;
        break;
      case 'Back':
        if (this.titleMode === 'slot' || this.titleMode === 'difficulty') { this.titleMode = 'slots'; this.titleIndex = this.pendingSlot - 1; }
        else { this.titleMode = 'root'; this.titleIndex = 0; }
        break;
      case 'Music volume': this.nudgeOption(0, 1); break;
      case 'Sound volume': this.nudgeOption(1, 1); break;
      case 'Difficulty': this.nudgeOption(2, 1); break;
      case 'Hero': this.nudgeOption(3, 1); break;
      case 'Blade': this.nudgeOption(4, 1); break;
    }
  }

  /* ------------------------------------------------ story and victory (PLAN 13) */

  /** A text card over the map (intro, ending, NG+): any key or tap moves on. */
  story: { title: string; lines: string[]; then?: () => void } | null = null;
  /** A short portrait line at the foot of the map (first keep, castle, general). */
  storyLine: { text: string; t: number } | null = null;
  storyFlags: string[] = [];
  victoryIndex = 0;
  private lastGold = 0;

  /** Gold earned (victory tally): every rise in the treasury since the last look. Also settled by save(). */
  private trackGold() {
    const g = this.player.gold;
    if (g > this.lastGold) this.war.stats.gold += g - this.lastGold;
    this.lastGold = g;
  }

  /** The story beats the map watches for: the firsts, and the warlord's seat falling. */
  private checkStory() {
    const c = this.camp, f = this.storyFlags;
    const first = (id: string, text: string) => { f.push(id); this.storyLine = { text, t: WAR.storyLineTime }; this.save(); };
    if (!f.includes('keep')) { const k = c.nodes.find((n) => n.type === 'keep' && n.owner === 'player'); if (k) first('keep', STORY.keep(k.name)); }
    if (!f.includes('castle')) { const k = c.nodes.find((n) => n.type === 'castle' && n.owner === 'player' && n.territory !== WAR.startTerritory); if (k) first('castle', STORY.castle(k.name)); }
    if (!f.includes('general')) { const g = this.war.mine()[0]; if (g) first('general', STORY.general(g.name)); }
    // the warlord's seat is yours: the ending card, then the victory screen
    const seat = c.castleOf(WAR.capitalTerritory);
    if (seat.owner === 'player') {
      this.war.won = true;
      this.save();
      this.story = { title: STORY.endingTitle, lines: STORY.ending(seat.name), then: () => this.enterVictory() };
    }
  }

  enterVictory() {
    this.screen = 'victory';
    this.victoryIndex = 0;
    this.story = null; this.storyLine = null; this.menuOpen = false;
    this.sfx.levelUp();
  }

  /** The victory screen's lines (PLAN 13). */
  victoryRows(): [string, string][] {
    const s = this.war.stats, w = this.war;
    return [
      ['Total time', fmtPlayTime(s.time)],
      ['Battles won / lost', `${s.won} / ${s.lost}`],
      ['Nodes captured', String(s.captured)],
      ['Generals recruited / defected / rescued', `${s.recruited} / ${s.defected} / ${s.rescued}`],
      ['Gold earned', String(Math.round(s.gold))],
      ['Troops lost in your battles', String(s.troopsLost)],
      ['Highest combo', String(s.bestCombo)],
      ['Difficulty', w.difficulty[0].toUpperCase() + w.difficulty.slice(1)],
      ['New Game+ cycle', w.ng ? String(w.ng) : 'first campaign'],
    ];
  }

  private handleVictory() {
    const inp = this.input;
    const tap = inp.takeTap() || inp.takeClick();
    let go = false;
    if (tap) for (let i = 0; i < 2; i++) {
      const x = VICTORY_BTN.x0 + i * (VICTORY_BTN.w + VICTORY_BTN.gap);
      if (tap.x >= x && tap.x <= x + VICTORY_BTN.w && tap.y >= VICTORY_BTN.y && tap.y <= VICTORY_BTN.y + VICTORY_BTN.h) { this.victoryIndex = i; go = true; }
    }
    if (inp.wasPressed('left') || inp.wasPressed('right') || inp.wasPressed('up') || inp.wasPressed('down')) { this.victoryIndex = 1 - this.victoryIndex; this.sfx.guard(); }
    if (go || inp.wasPressed('confirm') || inp.wasPressed('attack')) {
      if (this.victoryIndex === 0) this.newGamePlus();
      else { this.screen = 'title'; this.titleMode = 'root'; this.titleIndex = 0; this.sfx.guard(); }
    }
  }

  /**
   * New Game+ (PLAN 13): the knight keeps upgrades, talents, gear and materials (and SP);
   * the war, generals and gold start over; the Dominion is x1.5 stronger and its clock x0.8 per cycle.
   */
  newGamePlus() {
    this.save();
    const d = loadSave();
    d.gold = 0; d.war = null; d.econ = null; d.ng = this.war.ng + 1; d.stats = null; d.difficulty = this.war.difficulty;
    writeSave(d);
    this.enterCampaign();
    this.save();
    this.story = { title: `NEW GAME+ ${d.ng}`, lines: STORY.ngPlus(d.ng) };
  }

  /* --------------------------------------------------------- campaign map */

  camp = new Campaign();
  war = new War(this.camp);
  mapConvoy = -1;               // selected convoy id, or -1
  autosaveT = 0;
  battleWarband: Reserve = emptyReserve();   // the warband as it went into the current battle
  battleGeneral: Enemy | null = null;        // your general on the field, if one came
  pendingRecruit: string | null = null;      // a Lord beaten first, waiting on Recruit / Release at the results screen
  recruitPick = 0;                           // 0 Recruit, 1 Release
  /** Where the map is looking (map units, the view's centre) and how close (0 whole continent .. 1 close-up). */
  mapX = CONTINENT.w / 2; mapY = CONTINENT.h / 2;
  mapZoom = 0; mapZoomTo = 0;
  mapSel = -1;                  // selected node, or -1
  /** Where the last battle was started from: the map, or the debug battle list. */
  battleFrom: 'map' | 'sandbox' = 'map';

  /** Back to camp after anything: the knight on their feet, inventory from the save. */
  private freshCamp() {
    this.titleMode = 'root';
    this.menuOpen = false;
    this.paused = false;
    this.input.suppressMove = false;
    const keepHero = this.heroStyle, keepBlade = this.bladeStyle;
    this.player = new Player();
    applySave(this.player, loadSave());
    this.heroStyle = keepHero; this.bladeStyle = keepBlade;
    this.enemies.length = 0; this.projectiles.length = 0; this.pickups.length = 0; this.army.clear();
    this.deathT = 0;
    this.input.clearBuffer();
    this.input.takeClick(); this.input.takePan(); this.input.takeZoom();
  }

  /** The campaign map (PLAN 7.1). */
  enterCampaign() {
    this.freshCamp();
    this.screen = 'campaign';
    this.battleFrom = 'map';
    this.mapMode = 'browse';
    const sv = loadSave();
    this.camp.load(sv.war);
    // difficulty and NG+ first: a fresh war's clock depends on them
    this.war.difficulty = sv.difficulty; this.war.ng = sv.ng;
    this.war.load(sv.econ);
    this.war.difficulty = sv.difficulty; this.war.ng = sv.ng;
    if (sv.stats) this.war.stats = sv.stats;
    this.storyFlags = sv.story.slice();
    this.story = null; this.storyLine = null;
    this.lastGold = this.player.gold;
    this.syncWar();
    this.war.refillWarband();
    this.mapConvoy = -1;
  }

  /** Debug: the Phase 4-5 list of one battle of each type (and the test field), from the tuning panel. */
  enterSandbox() {
    this.freshCamp();
    this.screen = 'sandbox';
    this.battleFrom = 'sandbox';
  }

  /** Screen px per map unit at zoom z (0 = the whole continent fits, 1 = close-up). */
  mapScale(z = this.mapZoom): number {
    const fit = Math.min(VIEW_W / CONTINENT.w, VIEW_H / CONTINENT.h);
    return lerp(fit, WAR.mapZoomNear, z);
  }
  mapToScreen(x: number, y: number): { x: number; y: number } {
    const s = this.mapScale();
    return { x: (x - this.mapX) * s + VIEW_W / 2, y: (y - this.mapY) * s + VIEW_H / 2 };
  }
  screenToMap(x: number, y: number): { x: number; y: number } {
    const s = this.mapScale();
    return { x: (x - VIEW_W / 2) / s + this.mapX, y: (y - VIEW_H / 2) / s + this.mapY };
  }
  /** Keep the view on the continent (centred on it when it all fits). */
  private clampMap() {
    const s = this.mapScale(), hw = VIEW_W / 2 / s, hh = VIEW_H / 2 / s;
    this.mapX = CONTINENT.w <= hw * 2 ? CONTINENT.w / 2 : clamp(this.mapX, hw, CONTINENT.w - hw);
    this.mapY = CONTINENT.h <= hh * 2 ? CONTINENT.h / 2 : clamp(this.mapY, hh, CONTINENT.h - hh);
  }

  /** The node under a screen point (within the tap radius), or -1. */
  nodeAt(x: number, y: number): number {
    let best = -1, bd = WAR.mapNodeTap * WAR.mapNodeTap;
    for (const n of this.camp.nodes) {
      const p = this.mapToScreen(n.x, n.y), d = (p.x - x) ** 2 + (p.y - y) ** 2;
      if (d < bd) { bd = d; best = n.id; }
    }
    return best;
  }

  /** Selection on the map: one node, convoy, army or fight at a time (-1 = none). */
  mapArmy = -1;
  mapFight = -1;
  /** 'send': picking troops from a castle; 'target': choosing where they march. */
  mapMode: 'browse' | 'send' | 'target' | 'generals' = 'browse';
  sendGeneral: string | null = null;
  sendFrom = -1;
  sendUnits: Reserve = emptyReserve();

  private clearPick() { this.mapSel = -1; this.mapConvoy = -1; this.mapArmy = -1; this.mapFight = -1; }

  /** The panel's buttons for the selection (shared by drawing and hit-testing). */
  mapButtons(): { label: string; enabled: boolean; act: () => void; why?: string }[] {
    const out: { label: string; enabled: boolean; act: () => void; why?: string }[] = [];
    const close = { label: 'Close', enabled: true, act: () => { this.clearPick(); this.mapMode = 'browse'; } };
    if (this.mapMode === 'generals') return [{ label: 'Close', enabled: true, act: () => { this.mapMode = 'browse'; } }];
    if (this.mapMode === 'send') {
      const n = troopTotal(this.sendUnits);
      const opts = [null, ...this.war.assignable(this.sendFrom).map((g) => g.id)];
      const cur = this.war.general(this.sendGeneral);
      out.push({ label: `General: ${cur ? cur.name : 'none (-20%)'}`, enabled: opts.length > 1, act: () => { this.sendGeneral = opts[(opts.indexOf(this.sendGeneral) + 1) % opts.length]; this.sfx.guard(); }, why: this.war.mine().length ? 'NO GENERAL FREE (CAP: 1 PER CASTLE)' : 'NO GENERALS YET: BEAT A LORD FIRST' });
      out.push({ label: n ? `Choose target  ·  ${n} troops` : 'Choose target', enabled: n > 0, act: () => { this.mapMode = 'target'; this.mapSel = -1; this.toast('CHOOSE A TARGET'); }, why: 'PICK SOME TROOPS FIRST' });
      out.push({ label: 'Cancel', enabled: true, act: () => { this.mapMode = 'browse'; this.mapSel = this.sendFrom; } });
      return out;
    }
    if (this.mapMode === 'target') return [];
    const cv = this.selectedConvoy();
    if (cv) {
      if (cv.team === 'enemy') out.push({ label: 'Ambush', enabled: this.war.canAmbush(cv), act: () => this.ambush(cv), why: 'OUT OF REACH: IT MUST BE ON A ROAD AT YOUR FRONTIER' });
      out.push(close);
      return out;
    }
    const ar = this.selectedArmy();
    if (ar) {
      if (ar.team === 'enemy') out.push({ label: 'Intercept', enabled: this.war.canIntercept(ar), act: () => this.intercept(ar), why: 'OUT OF REACH: IT MUST BE IN OR NEXT TO YOUR LAND' });
      out.push(close);
      return out;
    }
    const f = this.selectedFight();
    if (f) {
      const spec = this.war.joinSpec(f);
      out.push({ label: 'Join', enabled: !!spec, act: () => this.joinFight(f), why: 'NOT YOUR FIGHT' });
      out.push(close);
      return out;
    }
    if (this.mapSel < 0) return [];
    const n = this.camp.nodes[this.mapSel];
    if (n.owner === 'enemy') {
      out.push({ label: 'Attack', enabled: this.camp.canAttack(n), act: () => this.attackNode(n), why: 'OUT OF REACH: TAKE A BORDERING TERRITORY FIRST' });
      // PLAN 9.3: get a general out of their cells without taking the castle
      const held = n.type === 'castle' ? this.war.captivesAt(n.id)[0] : undefined;
      if (held) out.push({ label: `Rescue raid: ${held.name}`, enabled: this.camp.canAttack(n), act: () => { this.sfx.cast(560); this.battleFrom = 'map'; this.startBattle(this.war.rescueSpecFor(n, held)); }, why: 'OUT OF REACH: TAKE A BORDERING TERRITORY FIRST' });
    } else {
      if (n.type === 'castle') {
        const cur = this.war.generalAt(n.id), opts = [null, ...this.war.assignable(n.id).map((g) => g.id)];
        out.push({ label: `General: ${cur ? cur.name : 'none'}`, enabled: opts.length > 1, act: () => { const next = opts[(opts.indexOf(cur ? cur.id : null) + 1) % opts.length]; this.war.assignCastle(n.id, next); this.sfx.guard(); this.save(); }, why: this.war.mine().length ? 'NO GENERAL FREE (CAP: 1 PER CASTLE)' : 'NO GENERALS YET: BEAT A LORD FIRST' });
        const g = this.war.garrison[n.id];
        out.push({ label: 'Send army', enabled: !!g && troopTotal(g) > 0, act: () => this.beginSend(n), why: 'NO TROOPS IN THE GARRISON' });
        out.push({ label: `Mix: ${RECRUIT_MIXES[this.war.mix[n.id]].name}`, enabled: true, act: () => { this.war.mix[n.id] = (this.war.mix[n.id] + 1) % RECRUIT_MIXES.length; this.sfx.guard(); } });
        out.push({ label: 'Forge', enabled: true, act: () => { this.sfx.guard(); this.openMenu(MENU_FORGE); } });
      }
      const cost = this.war.upgradeCost(n);
      if (n.type !== 'outpost') {
        out.push({
          label: cost ? `Upgrade L${n.level + 1} · ${cost} g` : 'Level 3 (max)', enabled: cost > 0 && this.player.gold >= cost,
          act: () => { if (this.war.upgrade(n, this.player)) { this.sfx.levelUp(); this.toast(`${n.name.toUpperCase()} NOW LEVEL ${n.level}`); this.save(); } },
          why: cost ? `NEED ${cost} GOLD` : 'ALREADY LEVEL 3',
        });
      }
    }
    out.push(close);
    return out;
  }

  /** The send panel's own controls: -/+ per troop type, and Half / All (PLAN 7.2). Rects shared with drawing. */
  sendHits(): { x: number; y: number; w: number; h: number; label: string; act: () => void }[] {
    if (this.mapMode !== 'send' || this.sendFrom < 0) return [];
    const g = this.war.garrison[this.sendFrom] || emptyReserve(), P = MAP_PANEL, S = MAP_SEND, out = [];
    const set = (k: UnitType, v: number) => { this.sendUnits[k] = clamp(v, 0, g[k]); this.sfx.guard(); };
    for (let i = 0; i < SEND_TYPES.length; i++) {
      const k = SEND_TYPES[i], y = P.y + S.y0 + i * S.rowH;
      out.push({ x: P.x + P.w - P.pad - S.btnW * 2 - 6, y, w: S.btnW, h: S.btnH, label: '-', act: () => set(k, this.sendUnits[k] - S.step) });
      out.push({ x: P.x + P.w - P.pad - S.btnW, y, w: S.btnW, h: S.btnH, label: '+', act: () => set(k, this.sendUnits[k] + S.step) });
    }
    const qy = P.y + S.y0 + SEND_TYPES.length * S.rowH + 6, qw = (P.w - P.pad * 2 - 8) / 2;
    out.push({ x: P.x + P.pad, y: qy, w: qw, h: S.quickH, label: 'Half', act: () => { for (const k of SEND_TYPES) this.sendUnits[k] = Math.floor(g[k] / 2); this.sfx.guard(); } });
    out.push({ x: P.x + P.pad + qw + 8, y: qy, w: qw, h: S.quickH, label: 'All', act: () => { for (const k of SEND_TYPES) this.sendUnits[k] = g[k]; this.sfx.guard(); } });
    return out;
  }

  private beginSend(n: MapNode) {
    this.mapMode = 'send'; this.sendFrom = n.id; this.sendUnits = emptyReserve(); this.sendGeneral = null;
    const g = this.war.garrison[n.id]!;
    for (const k of SEND_TYPES) this.sendUnits[k] = Math.floor(g[k] / 2);
    this.sfx.guard();
  }

  /** Target mode: an enemy node attacks it, one of your castles reinforces it. */
  private pickTarget(id: number) {
    if (id < 0) return;
    const from = this.camp.nodes[this.sendFrom], to = this.camp.nodes[id];
    if (to.owner === 'player' && to.type !== 'castle') { this.sfx.guard(); this.toast('REINFORCE ONE OF YOUR CASTLES, OR PICK AN ENEMY NODE'); return; }
    const a = this.war.sendArmy(from, this.sendUnits, to, this.sendGeneral);
    if (!a) { this.sfx.guard(); this.toast(to.id === from.id ? 'PICK ANOTHER NODE' : 'NO ROAD THERE'); return; }
    this.sfx.cast(520);
    this.toast(a.order === 'attack' ? `${troopTotal(a.units)} TROOPS MARCH ON ${to.name.toUpperCase()}` : `${troopTotal(a.units)} TROOPS TO ${to.name.toUpperCase()}`);
    this.mapMode = 'browse'; this.clearPick(); this.mapArmy = a.id;
    this.save();
  }

  selectedConvoy(): Convoy | null { return this.mapConvoy >= 0 ? this.war.convoys.find((c) => c.id === this.mapConvoy) || null : null; }
  selectedArmy(): MapArmy | null { return this.mapArmy >= 0 ? this.war.armies.find((a) => a.id === this.mapArmy) || null : null; }
  selectedFight(): Fight | null { return this.mapFight >= 0 ? this.war.fights.find((f) => f.id === this.mapFight) || null : null; }

  /** What's under a screen point: the nearest of fights, armies, convoys and nodes within the tap radius. */
  pickAt(x: number, y: number): { kind: 'fight' | 'army' | 'convoy' | 'node'; id: number } | null {
    let best: { kind: 'fight' | 'army' | 'convoy' | 'node'; id: number } | null = null, bd = WAR.mapNodeTap * WAR.mapNodeTap;
    const consider = (kind: 'fight' | 'army' | 'convoy' | 'node', id: number, mx: number, my: number, bias: number) => {
      const p = this.mapToScreen(mx, my), d = ((p.x - x) ** 2 + (p.y - y) ** 2) * bias;
      if (d < bd) { bd = d; best = { kind, id }; }
    };
    // things on the roads only win when clearly nearer than a node (nodes are the usual target)
    for (const f of this.war.fights) consider('fight', f.id, f.x, f.y - 14 / this.mapScale(), 0.8);
    for (const a of this.war.armies) if (a.fight < 0) { const q = this.war.armyPos(a); consider('army', a.id, q.x, q.y, 1.6); }
    for (const c of this.war.convoys) { const q = this.war.convoyPos(c); consider('convoy', c.id, q.x, q.y, 2); }
    for (const n of this.camp.nodes) consider('node', n.id, n.x, n.y, 1);
    return best;
  }

  /** The convoy under a screen point (within the tap radius), or -1. */
  convoyAt(x: number, y: number): number {
    let best = -1, bd = WAR.mapNodeTap * WAR.mapNodeTap;
    for (const c of this.war.convoys) {
      const q = this.war.convoyPos(c), p = this.mapToScreen(q.x, q.y), d = (p.x - x) ** 2 + (p.y - y) ** 2;
      if (d < bd) { bd = d; best = c.id; }
    }
    return best;
  }

  /** Ambush a Dominion convoy: a convoy battle for its cargo (PLAN 6). */
  ambush(c: Convoy) {
    if (!this.war.canAmbush(c)) return;
    this.sfx.cast(560);
    this.battleFrom = 'map';
    this.startBattle(this.war.ambushSpec(c));
  }
  /** Intercept a Dominion army near your land: a field battle against what it has (PLAN 7.1). */
  intercept(a: MapArmy) {
    if (!this.war.canIntercept(a)) return;
    this.sfx.cast(560);
    this.battleFrom = 'map';
    const t = this.camp.territories[this.camp.nodes[a.path[a.leg]].territory].tier;
    this.startBattle(this.war.fieldSpecFor(a, null, t));
  }
  /** Join a fight in progress (PLAN 7.3): the battle starts where the sim has got to. */
  joinFight(f: Fight) {
    const spec = this.war.joinSpec(f);
    if (!spec) return;
    this.sfx.cast(560);
    this.battleFrom = 'map';
    f.joined = true;
    this.startBattle(spec);
  }
  /** Top-left and width of panel button i of n: one per row, or two per row once there are MAP_BTN.pairFrom or more. */
  mapButtonAt(i: number, n: number): { x: number; y: number; w: number } {
    const x0 = MAP_PANEL.x + MAP_PANEL.pad, bottom = MAP_PANEL.y + MAP_PANEL.h - MAP_PANEL.pad + MAP_BTN.gap, step = MAP_BTN.h + MAP_BTN.gap;
    if (n < MAP_BTN.pairFrom) return { x: x0, y: bottom - (n - i) * step, w: MAP_BTN.w };
    const rows = Math.ceil(n / 2), w = (MAP_BTN.w - MAP_BTN.gap) / 2;
    return { x: x0 + (i % 2) * (w + MAP_BTN.gap), y: bottom - (rows - Math.floor(i / 2)) * step, w };
  }

  /** Attack a node: its battle, with your warband (PLAN 7.1). */
  attackNode(n: MapNode) {
    if (!this.camp.canAttack(n)) return;
    this.sfx.cast(560);
    this.battleFrom = 'map';
    const spec = this.camp.battleSpec(n);
    this.war.dressCastle(spec, n);
    this.startBattle(spec);
  }

  /** Select a node (or none) and bring it into view. */
  private selectNode(id: number) {
    this.clearPick();
    this.mapSel = id;
    if (id < 0) return;
    this.sfx.guard();
    const n = this.camp.nodes[id], p = this.mapToScreen(n.x, n.y);
    // keep it clear of the panel and the edges
    const s = this.mapScale();
    if (p.x > MAP_PANEL.x - 30) this.mapX += (p.x - (MAP_PANEL.x - 160)) / s;
    if (p.x < 60) this.mapX -= (60 - p.x) / s;
    if (p.y < 80) this.mapY -= (80 - p.y) / s;
    if (p.y > VIEW_H - 50) this.mapY += (p.y - (VIEW_H - 50)) / s;
  }

  /** Arrow keys / d-pad: the nearest node roughly that way from the selection. */
  private stepSelection(dx: number, dy: number) {
    const ns = this.camp.nodes;
    if (this.mapSel < 0) {
      // start from the node nearest the middle of the view
      const c = this.screenToMap(VIEW_W / 2, VIEW_H / 2);
      let best = 0, bd = Infinity;
      for (const n of ns) { const d = dist(n.x, n.y, c.x, c.y); if (d < bd) { bd = d; best = n.id; } }
      this.selectNode(best); return;
    }
    const from = ns[this.mapSel];
    let best = -1, bs = Infinity;
    for (const n of ns) {
      if (n === from) continue;
      const vx = n.x - from.x, vy = n.y - from.y, d = Math.hypot(vx, vy);
      const along = (vx * dx + vy * dy) / d;
      if (along < 0.5) continue;                       // within 60 degrees of the direction
      const score = d * (2 - along);
      if (score < bs) { bs = score; best = n.id; }
    }
    if (best >= 0) this.selectNode(best);
  }

  private handleMap(dt: number) {
    const inp = this.input;
    // a story card holds the map until it's read
    if (this.story) {
      const t = inp.takeTap(), c = inp.takeClick();
      if (t || c || inp.wasPressed('confirm') || inp.wasPressed('attack') || inp.wasPressed('jump') || inp.wasPressed('cancel')) {
        const then = this.story.then;
        this.story = null; this.sfx.guard();
        inp.clearBuffer();
        if (then) then();
      }
      return;
    }
    if (this.storyLine && (this.storyLine.t -= dt) <= 0) this.storyLine = null;
    // the pause menu works on the map too (PLAN 7.1), and pauses map time; the forge is only here
    if (inp.wasPressed('menu')) { if (this.menuOpen) this.closeMenu(); else this.openMenu(this.menuTab); inp.clearBuffer(); }
    if (!this.menuOpen) {
      const c = inp.takeClick();
      if (c && c.x >= MAP_MENU_HIT.x && c.x <= MAP_MENU_HIT.x + MAP_MENU_HIT.w && c.y >= MAP_MENU_HIT.y && c.y <= MAP_MENU_HIT.y + MAP_MENU_HIT.h) { this.openMenu(this.menuTab); inp.takeTap(); }
      else if (c) inp.pushClick(c);
    }
    if (this.menuOpen) { this.handleBigMenu(); return; }
    // map time: income, convoys, production, armies and their fights (PLAN 7: real time; battles pause it)
    this.war.tick(dt, this.player);
    if (this.mapConvoy >= 0 && !this.selectedConvoy()) this.mapConvoy = -1;   // it arrived
    if (this.mapArmy >= 0 && !this.selectedArmy()) this.mapArmy = -1;
    if (this.mapFight >= 0 && !this.selectedFight()) this.mapFight = -1;
    if ((this.mapMode === 'send' || this.mapMode === 'target') && (this.sendFrom < 0 || this.camp.nodes[this.sendFrom].owner !== 'player')) this.mapMode = 'browse';
    this.syncWar();
    if (inp.wasPressed('generals')) { this.mapMode = this.mapMode === 'generals' ? 'browse' : 'generals'; this.clearPick(); this.sfx.guard(); }
    // the Dominion's moves (PLAN 8), and your generals' fortunes (PLAN 9)
    for (const e of this.war.events) {
      const nm = (id: number) => this.camp.nodes[id].name;
      const gen = this.war.general(e.general || null);
      if (gen && e.kind === 'lowLoyalty') this.banner(`${gen.name.toUpperCase()}: LOYALTY ${Math.round(gen.loyalty)}`, generalLine(gen, 'low'), '#ff6b6b');
      if (gen && e.kind === 'captured') this.banner(`${gen.name.toUpperCase()} IS TAKEN`, `held at ${nm(e.node)}  ·  take it, or raid the cells`, '#ff6b6b');
      if (gen && e.kind === 'rescued') this.banner(`${gen.name.toUpperCase()} IS FREE`, generalLine(gen, 'rescue'), '#4fe08a');
      if (gen && e.kind === 'defected') this.banner(`${gen.name.toUpperCase()} DEFECTS`, generalLine(gen, 'defect'), '#ff6b6b');
      if (e.kind === 'muster') this.banner(`THE DOMINION MUSTERS AT ${nm(e.node).toUpperCase()}`, `they march on ${nm(e.target)} in ${WAR.telegraph} s`, '#ff9a8a');
      else if (e.kind === 'depart') this.toast(`THE DOMINION MARCHES ON ${nm(e.target).toUpperCase()}`);
      else if (e.kind === 'attacked') { this.banner(`${nm(e.node).toUpperCase()} UNDER ATTACK`, 'select the fight to join the defense', '#ff6b6b'); }
      else if (e.kind === 'reinforce') this.toast(`${nm(e.node).toUpperCase()} SENDS HELP TO ${nm(e.target).toUpperCase()}`);
      else if (e.kind === 'convoyLost') this.toast(`A CONVOY FROM ${nm(e.node).toUpperCase()} WAS TAKEN (${e.target} GOLD)`);
      else if (e.kind === 'sp') this.banner(`+${e.target} SKILL POINT${e.target > 1 ? 'S' : ''}`, `${nm(e.node)} is yours for the first time  ·  spend them in TALENTS`, '#ffd54a');
    }
    if (this.war.events.length) this.save();
    this.war.events = [];
    // news from the off-screen fights
    for (const r of this.war.results) {
      const where = r.node >= 0 ? this.camp.nodes[r.node].name : 'the road';
      if (r.node >= 0 && r.winner === 'player') this.banner(`${where.toUpperCase()} TAKEN`, 'your army carried it', '#4fe08a');
      else if (r.node >= 0 && r.winner === 'enemy' && this.camp.nodes[r.node].owner === 'enemy' && this.war.captured.includes(r.node)) this.banner(`${where.toUpperCase()} LOST`, 'the Dominion took it', '#ff6b6b');
      else this.toast(r.winner === 'player' ? `VICTORY AT ${where.toUpperCase()}` : `DEFEAT AT ${where.toUpperCase()}`);
    }
    if (this.war.results.length) this.save();
    this.war.results = []; this.war.captured = [];
    this.checkStory();
    if (this.story) return;
    this.autosaveT += dt;
    if (this.autosaveT >= WAR.autosaveEvery) { this.autosaveT = 0; this.save(); }
    // zoom: wheel, pinch, Z / L / LT
    const z = inp.takeZoom();
    if (z > 0) this.mapZoomTo = 1; else if (z < 0) this.mapZoomTo = 0;
    if (inp.wasPressed('zoom') || inp.wasPressed('lock')) this.mapZoomTo = this.mapZoomTo > 0.5 ? 0 : 1;
    const before = this.mapZoom;
    this.mapZoom += clamp(this.mapZoomTo - this.mapZoom, -dt / WAR.mapZoomTime, dt / WAR.mapZoomTime);
    if (before !== this.mapZoom && this.mapSel >= 0) {
      // zoom about the selection
      const n = this.camp.nodes[this.mapSel];
      this.mapX = lerp(this.mapX, n.x, 0.25); this.mapY = lerp(this.mapY, n.y, 0.25);
    }
    // pan: drag, stick or WASD
    const s = this.mapScale();
    const pan = inp.takePan();
    this.mapX -= pan.x / s; this.mapY -= pan.y / s;
    const mv = inp.moveVector();
    this.mapX += mv.x * WAR.mapPanSpeed * dt * (WAR.mapZoomNear / s) * 0.6;
    this.mapY += mv.y * WAR.mapPanSpeed * dt * (WAR.mapZoomNear / s) * 0.6;
    this.clampMap();

    // clicks: the panel's controls, then whatever is nearest on the map, then empty ground (closes the panel)
    const click = inp.takeClick();
    inp.takeTap();
    if (click) {
      let used = false;
      // the top bar's generals readout opens the roster
      if (click.y <= MAP_BAR.h && click.x >= MAP_GEN_HIT.x && click.x <= MAP_GEN_HIT.x + MAP_GEN_HIT.w) { this.mapMode = this.mapMode === 'generals' ? 'browse' : 'generals'; this.clearPick(); used = true; }
      for (const h of this.sendHits()) {
        if (click.x >= h.x && click.x <= h.x + h.w && click.y >= h.y && click.y <= h.y + h.h) { h.act(); used = true; }
      }
      const btns = this.mapButtons();
      for (let i = 0; i < btns.length && !used; i++) {
        const b = this.mapButtonAt(i, btns.length);
        if (click.x >= b.x && click.x <= b.x + b.w && click.y >= b.y && click.y <= b.y + MAP_BTN.h) {
          used = true;
          if (btns[i].enabled) btns[i].act(); else { this.sfx.guard(); this.toast(btns[i].why || ''); }
        }
      }
      if (this.screen !== 'campaign') return;
      const panelUp = this.mapMode === 'send' || this.mapMode === 'generals' || this.mapSel >= 0 || this.mapConvoy >= 0 || this.mapArmy >= 0 || this.mapFight >= 0;
      const inPanel = panelUp && click.x >= MAP_PANEL.x && click.y >= MAP_PANEL.y && click.y <= MAP_PANEL.y + MAP_PANEL.h;
      if (!used && !inPanel) {
        if (this.mapMode === 'target') this.pickTarget(this.nodeAt(click.x, click.y));
        else if (this.mapMode === 'browse' || this.mapMode === 'generals') {
          if (this.mapMode === 'generals') this.mapMode = 'browse';
          const hit: { kind: string; id: number } | null = this.pickAt(click.x, click.y);
          if (!hit || hit.kind === 'node') this.selectNode(hit ? hit.id : -1);
          else {
            this.clearPick(); this.sfx.guard();
            if (hit.kind === 'convoy') this.mapConvoy = hit.id; else if (hit.kind === 'army') this.mapArmy = hit.id; else this.mapFight = hit.id;
          }
        }
      }
    }
    if (inp.wasPressed('up')) this.stepSelection(0, -1);
    if (inp.wasPressed('down')) this.stepSelection(0, 1);
    if (inp.wasPressed('left')) this.stepSelection(-1, 0);
    if (inp.wasPressed('right')) this.stepSelection(1, 0);
    const go = inp.wasPressed('confirm') || inp.wasPressed('attack') || inp.wasPressed('jump');
    if (go && this.mapMode === 'target' && this.mapSel >= 0) { this.pickTarget(this.mapSel); return; }
    if (go && (this.mapConvoy >= 0 || this.mapArmy >= 0 || this.mapFight >= 0 || this.mapMode === 'send')) {
      const b0 = this.mapButtons()[0];
      if (b0.enabled) b0.act(); else { this.sfx.guard(); this.toast(b0.why || ''); }
      return;
    }
    if (go && this.mapSel >= 0) {
      const n = this.camp.nodes[this.mapSel];
      if (n.owner === 'enemy' && this.camp.canAttack(n)) this.attackNode(n);
      else { this.sfx.guard(); this.toast(n.owner === 'player' ? 'YOURS' : 'OUT OF REACH: TAKE A BORDERING TERRITORY FIRST'); }
      return;
    }
    if (inp.wasPressed('cancel') && this.mapMode === 'generals') { this.mapMode = 'browse'; return; }
    if (inp.wasPressed('cancel')) {
      if (this.mapMode === 'target') { this.mapMode = 'send'; this.mapSel = -1; }
      else if (this.mapMode === 'send') { this.mapMode = 'browse'; this.mapSel = this.sendFrom; }
      else if (this.mapSel >= 0 || this.mapConvoy >= 0 || this.mapArmy >= 0 || this.mapFight >= 0) this.clearPick();
      else { this.save(); this.screen = 'title'; this.titleIndex = 0; }
    }
  }

  /** Debug: a Dominion army marches from their castle nearest your land on your nearest node (their AI is Phase 9). */
  debugEnemyArmy(): MapArmy | null {
    const c = this.camp, N = c.nodes.length, home = c.castleOf(WAR.startTerritory).id;
    const from = c.nodes.filter((n) => n.type === 'castle' && n.owner === 'enemy').sort((a, b) => c.dist[a.id * N + home] - c.dist[b.id * N + home])[0];
    if (!from) return null;
    const to = c.nodes.filter((n) => n.owner === 'player').sort((a, b) => c.dist[from.id * N + a.id] - c.dist[from.id * N + b.id])[0];
    if (!to) return null;
    const a = this.war.spawnEnemyArmy(from.id, to.id, { ...emptyReserve(), ...foeMix(WAR.debugArmy) });
    if (a) this.toast(`A DOMINION ARMY MARCHES ON ${to.name.toUpperCase()}`);
    return a;
  }

  /* ------------------------------------------- debug battle list (Phase 4-5) */

  /** The battles on offer until the map exists: one of each type. */
  campaignRows(): { label: string; sub: string; spec: BattleSpec | null; act?: () => void }[] {
    return [
      { label: 'Village raid — Millbrook', sub: 'tier 1  ·  burn 4 houses  ·  ~2 min', spec: villageSpec() },
      { label: 'Outpost — Greywatch Tower', sub: 'tier 1  ·  hold the ring 10 s  ·  ~2 min', spec: outpostSpec() },
      { label: 'Keep assault — Thornwall', sub: 'tier 1  ·  gate, then the Captain  ·  ~3 min', spec: keepSpec() },
      { label: 'Castle siege — Hollin', sub: 'tier 2  ·  iron gates, throne, Lord  ·  4-6 min', spec: castleSpec() },
      { label: 'Convoy ambush', sub: 'tier 1  ·  stop 3 wagons  ·  ~2 min', spec: convoySpec() },
      { label: 'Field battle — Dominion column', sub: 'tier 1  ·  rout or destroy  ·  2-3 min', spec: fieldSpec() },
      { label: 'Defense — Millbrook (held)', sub: 'tier 1  ·  rout them or hold 3:00  ·  2-3 min', spec: defenseSpec() },
      { label: 'Rescue raid — Hollin cells', sub: 'tier 2  ·  free Sir Aldric, get out  ·  ~3 min', spec: rescueSpec() },
      { label: "The warlord — Thorne's Seat", sub: 'tier 5  ·  four phases, Thornhounds', spec: warlordSpec() },
      { label: 'Test field', sub: 'endless groups, combat sandbox', spec: testSpec() },
      { label: 'Back to title', sub: '', spec: null, act: () => { this.screen = 'title'; this.titleIndex = 0; } },
    ];
  }

  /** Top-left corner of campaign row i (two columns). */
  campRowAt(i: number): { x: number; y: number } {
    const col = Math.floor(i / CAMP_ROW.perCol), r = i % CAMP_ROW.perCol;
    return { x: CAMP_ROW.x + col * (CAMP_ROW.w + CAMP_ROW.colGap), y: CAMP_ROW.y0 + r * (CAMP_ROW.h + CAMP_ROW.gap) };
  }

  private handleSandbox() {
    const inp = this.input;
    const rows = this.campaignRows();
    const tap = inp.takeTap();
    let activate = false;
    if (tap) {
      for (let i = 0; i < rows.length; i++) {
        const at = this.campRowAt(i);
        if (tap.x >= at.x && tap.x <= at.x + CAMP_ROW.w && tap.y >= at.y && tap.y <= at.y + CAMP_ROW.h) {
          if (this.campIndex === i || IS_TOUCH) activate = true;
          this.campIndex = i;
        }
      }
    }
    if (inp.wasPressed('down')) { this.campIndex = (this.campIndex + 1) % rows.length; this.sfx.guard(); }
    if (inp.wasPressed('up')) { this.campIndex = (this.campIndex - 1 + rows.length) % rows.length; this.sfx.guard(); }
    if (inp.wasPressed('right') || inp.wasPressed('left')) {
      this.campIndex = (this.campIndex + CAMP_ROW.perCol) % (CAMP_ROW.perCol * 2);
      if (this.campIndex >= rows.length) this.campIndex = rows.length - 1;
      this.sfx.guard();
    }
    if (inp.wasPressed('cancel')) { this.screen = 'title'; return; }
    if (activate || inp.wasPressed('confirm') || inp.wasPressed('attack')) {
      const r = rows[this.campIndex];
      this.sfx.cast(560);
      if (r.spec) this.startBattle(r.spec); else if (r.act) r.act();
    }
  }

  /* ------------------------------------------------------------- battles */

  /**
   * Lay out and populate a battle: field, structures, the knight at their
   * edge with the warband, the Dominion where the type puts them (past the
   * live cap: reserve, streaming in from their edge).
   */
  startBattle(spec: BattleSpec) {
    const p = this.player;
    this.screen = 'battle';
    this.battle = new Battle(spec);
    const b = this.battle;
    this.field = { x: 0, y: 0, w: b.w, h: b.h };
    this.enemies.length = 0; this.projectiles.length = 0; this.pickups.length = 0;
    this.army.clear();
    this.army.streamTier = spec.tier;
    this.army.streamMult[TEAM_ENEMY] = WAR.battlePace[spec.kind] || 1;
    // the Dominion's NG+ strength and the difficulty's damage (PLAN 13); the debug list fights at base
    const ngm = this.battleFrom === 'map' ? this.war.ngMult() : 1, dmgm = this.battleFrom === 'map' ? WAR.enemyDamage[this.war.difficulty] : 1;
    this.army.foeHp = ngm; this.army.foeDmg = ngm * dmgm;
    // the Command talents (PLAN 12.2): your troops' HP and damage, Muster's faster stream, Warlord's Presence
    const tl = p.talents, cm = WAR.command;
    this.army.streamMult[TEAM_PLAYER] = tl.muster ? 1 / cm.musterStream : 1;
    this.army.troopHp = 1 + (tl.drill ? cm.drill : 0) + (tl.host ? cm.hostHp : 0);
    this.army.troopDmg = 1 + (tl.steel ? cm.steel : 0);
    this.army.presence.on = !!tl.presence;
    p.lock = null;
    this.order = 'follow';
    this.wheelOpen = false; this.wheelTouch = false; this.input.suppressMove = false;
    this.paused = false; this.menuOpen = false;
    this.exitPushT = 0; this.routT = 0;
    p.refreshStats(true);
    p.potions = Math.max(p.potions, 3);
    p.ethers = Math.max(p.ethers, 2);
    this.input.clearBuffer();

    if (spec.kind === 'test') {
      this.startTestField();
      this.fadeT = WAR.fadeTime;
      return;
    }

    // the knight's side: their edge, the warband beside them, any sent army behind
    p.x = b.start.x; p.y = b.start.y; p.vx = p.vy = 0; p.z = 0;
    const top = b.exitSide === 'top';
    p.facing = top ? Math.PI / 2 : 0;
    if (top) this.army.setEdge('player', b.start.x, 40, 20);
    else this.army.setEdge('player', 40, b.h / 2, b.h * 0.3);
    this.army.setEdge('enemy', b.foeEdge.x, b.foeEdge.y, b.foeEdge.spread);
    const fwd = (d: number) => top ? { x: b.start.x, y: b.start.y + d } : { x: b.start.x + d, y: b.start.y };
    let at = spec.kind === 'defense' ? { x: b.start.x - 60, y: b.start.y } : fwd(80);
    // the warband: your own troops from the map (the debug battle list just gets a full one)
    this.battleWarband = { ...this.war.warband };
    const wb = this.battleFrom === 'map' ? UNIT_ORDER.flatMap((k) => new Array(this.war.warband[k]).fill(k) as UnitType[]) : this.mixOf(this.warbandCap());
    this.spawnBlock(wb, 'player', at.x, at.y, spec.tier);
    const allies = unitList(spec.allies);
    at = spec.kind === 'defense' ? { x: b.start.x - 160, y: b.start.y + 120 } : fwd(190);
    if (allies.length) this.spawnBlock(allies, 'player', at.x, at.y, spec.tier);

    // the Dominion's side
    const foes = unitList(spec.foes);
    const cy = b.h / 2;
    const elite = (id: string, x: number, y: number, extra = 1, level = WAR.testFieldLevel) => {
      const e = new Enemy(ENEMIES[id], x, y, level, spec.tier, extra);
      e.homeX = x; e.homeY = y;
      this.enemies.push(e);
      return e;
    };
    const boss = (name: string, title: string, stats: { hp: number; attack: number; defense: number }, pattern: BossPattern, moves: BossMove[], color: string, accent: string, x: number, y: number, level = WAR.testFieldLevel) => {
      const def: BossDefinition = { id: name.toLowerCase().replace(/\W+/g, '-'), name, title, tier: spec.tier, stats, uniqueMaterials: [], pattern, moves, color, accent };
      const e = new Enemy(bossEnemyDef(def), x, y, level, spec.tier);
      e.boss = def; e.leader = true;
      e.homeX = x; e.homeY = y;
      this.enemies.push(e);
      b.leader = e;
      return e;
    };
    const spreadElites = (x: number, y: number) => spec.foeElites.forEach((id, k) => elite(id, x, y + (k - (spec.foeElites.length - 1) / 2) * 120));
    switch (spec.kind) {
      case 'village': {
        // the garrison stands among the houses
        const hx = b.houses.reduce((s, h) => s + h.x, 0) / Math.max(1, b.houses.length);
        this.spawnBlock(foes, 'enemy', hx - 120, cy, spec.tier);
        spreadElites(b.w * 0.6, cy);
        break;
      }
      case 'outpost': {
        const r = b.ring!;
        this.spawnBlock(foes, 'enemy', r.x - 40, r.y, spec.tier);
        spreadElites(r.x + 60, r.y - 120);
        break;
      }
      case 'keep': {
        const room = b.rooms[0];
        const kx = (room.x0 + room.x1) / 2, ky = (room.y0 + room.y1) / 2;
        this.spawnBlock(foes, 'enemy', kx - 40, ky, spec.tier);
        spreadElites(kx + 60, ky);
        // the Captain waits inside until someone comes close
        b.captain = boss(spec.captainName || 'Captain', 'Keep Captain', WAR.captainStats, 'stalker', ['rush'], '#5a3a2a', '#ffb347', room.x1 - 90, ky);
        b.captain.aggro = false;
        break;
      }
      case 'castle': case 'rescue': {
        const [court, hall] = b.rooms;
        const n = Math.round(foes.length * 0.6);
        this.spawnBlock(foes.slice(0, n), 'enemy', (court.x0 + court.x1) / 2, cy, spec.tier);
        this.spawnBlock(foes.slice(n), 'enemy', hall.x0 + 200, cy + 140, spec.tier);
        spreadElites((court.x0 + court.x1) / 2 + 120, cy);
        const t = b.throne!;
        // the castle's own Lord from the roster: their pattern, moves, colours and level (PLAN 9.1)
        const lg = this.battleFrom === 'map' ? this.war.general(spec.lordId || null) : null;
        if (spec.warlord) {
          // Warlord Garrick Thorne (PLAN 11.3): Thornline and Howl, and a new pattern every quarter of his HP
          b.lord = boss(spec.lordName || 'Warlord Garrick Thorne', 'Warlord of the Umbral Dominion', WAR.warlordStats, WAR.warlordPhases[0], ['thorns', 'howl'], '#2b1d1a', '#ff5a3c', t.x - 110, t.y, WAR.warlordLevel);
          b.lord.boss!.phases = WAR.warlordPhases; b.lord.boss!.phaseNames = WAR.warlordPhaseNames;
        } else b.lord = lg ? boss(lg.name, lg.title, WAR.lordStats, lg.pattern, lg.moves, lg.color, lg.accent, t.x - 110, t.y, lg.level)
          : boss(spec.lordName || 'the Lord', 'Castle Lord', WAR.lordStats, 'brute', ['slam', 'rush'], '#3d2f5c', '#c79bff', t.x - 110, t.y);
        b.lord.aggro = false;
        break;
      }
      case 'convoy': {
        // the escort walks with the wagons
        const ws = b.wagons;
        const wx = ws.reduce((s, w) => s + w.x, 0) / Math.max(1, ws.length);
        this.spawnBlock(foes, 'enemy', wx + 60, ws[0].y - 90, spec.tier);
        spreadElites(wx + 140, ws[0].y + 70);
        break;
      }
      default: {
        // field and defense: the column marches on from the far side
        this.spawnBlock(foes, 'enemy', b.w * (spec.kind === 'defense' ? 0.86 : 0.7), cy, spec.tier);
        spreadElites(b.w * (spec.kind === 'defense' ? 0.84 : 0.66), cy);
      }
    }
    if (spec.commander) {
      const c = elite(spec.commander, b.w * (spec.kind === 'defense' ? 0.95 : 0.74), cy, WAR.commanderMult, WAR.testFieldLevel + 2);
      c.leader = true;
      b.leader = c;
      // a defense's commander leads from the rear: go out to him to break the attack early
      if (spec.kind === 'defense') c.aggro = false;
    }
    // a rescue's reinforcements wait for the alarm (the general walking free)
    if (spec.kind !== 'rescue') for (const k of unitList(spec.reinforce || {})) this.army.addReserve('enemy', k);
    // your general (a joined army's, a defended castle's) fights beside you on their boss AI (PLAN 9.2)
    this.battleGeneral = null;
    const gen = this.battleFrom === 'map' ? this.war.general(spec.generalId || null) : null;
    if (gen) {
      const e = new Enemy(bossEnemyDef(generalBoss(gen, spec.tier)), p.x + (top ? 70 : 60), p.y + (top ? 60 : 70), gen.level, spec.tier);
      e.boss = generalBoss(gen, spec.tier); e.team = 'player'; e.generalId = gen.id;
      this.enemies.push(e);
      this.battleGeneral = e;
    }
    for (const e of this.enemies) if (e.team === 'enemy') { e.maxHp = Math.round(e.maxHp * ngm); e.hp = e.maxHp; e.str *= ngm * dmgm; }
    b.startFoes = this.foeStrength();
    b.startAllies = this.army.live('player') + this.army.reserveCount('player');
    if (spec.kind === 'convoy') b.notes.push(`${b.cargo} gold aboard`);
    this.waveIntro = Math.max(0, TUNING.waveIntro);
    this.fadeT = WAR.fadeTime;
    this.follow(true);
    this.banner(spec.name.toUpperCase(), b.objective, '#ffd54a');
  }

  /** Dominion strength still in the fight: live units, reserve and elites. */
  foeStrength(): number {
    return this.army.live('enemy') + this.army.reserveCount('enemy')
      + this.enemies.filter((e) => e.alive && e.team === 'enemy' && !e.fleeing).length;
  }

  /** Is anyone of `team` (knight, elites, units) inside the circle? */
  sideIn(team: Team, x: number, y: number, r: number): boolean {
    const p = this.player;
    if (team === 'player' && p.alive && dist(p.x, p.y, x, y) <= r) return true;
    for (const e of this.enemies) if (e.alive && !e.fleeing && e.team === team && dist(e.x, e.y, x, y) <= r) return true;
    const a = this.army, t = teamIndex(team);
    let found = false;
    a.query(x, y, r, (j) => {
      if (found || a.team[j] !== t || !a.alive[j]) return;
      if ((a.x[j] - x) ** 2 + (a.y[j] - y) ** 2 <= r * r) found = true;
    });
    return found;
  }

  /** Is the knight pushing into their own edge? */
  private pushingOut(): boolean {
    const p = this.player, mv = this.input.moveVector();
    return this.battle.exitSide === 'top'
      ? mv.y < -0.3 && p.y <= this.field.y + p.radius + 4
      : mv.x < -0.3 && p.x <= this.field.x + p.radius + 4;
  }

  /** Win / lose / rout / exit checks for a real battle (not the test field). */
  private updateBattleState(dt: number) {
    const b = this.battle, p = this.player, kind = b.spec.kind;
    if (b.result) return;
    // walking off your own edge leaves the battle (a rescue with the general alongside is the win)
    this.exitPushT = this.pushingOut() ? this.exitPushT + dt : 0;
    if (this.exitPushT >= WAR.exitPushTime) {
      if (kind === 'rescue' && b.general && b.general.alive) {
        b.outcome = `${b.spec.generalName || 'The general'} is out — rescued`;
        this.finishBattle('win');
      } else this.finishBattle('retreat');
      return;
    }
    switch (kind) {
      case 'village':
        if (b.houses.every((s) => !s.alive)) { b.outcome = `${b.spec.name} burned — the node is yours (ownership arrives with the map)`; this.finishBattle('win'); return; }
        break;
      case 'field':
        if (this.foeStrength() === 0) { b.outcome = 'The Dominion army is destroyed'; this.finishBattle('win'); return; }
        break;
      case 'outpost': {
        // in the ring with no enemy inside: progress; contested: paused, never reset (PLAN 10.2)
        const r = b.ring!;
        r.contested = this.sideIn('enemy', r.x, r.y, r.ringR);
        if (!r.contested && this.sideIn('player', r.x, r.y, r.ringR)) r.progress += dt;
        if (r.progress >= r.need) { b.outcome = `${b.spec.name} taken`; this.finishBattle('win'); return; }
        break;
      }
      case 'keep':
        if (b.gates.every((s) => !s.alive) && b.captain && !b.captain.alive) { b.outcome = `${b.spec.name} taken — ${b.spec.captainName || 'the Captain'} defeated`; this.finishBattle('win'); return; }
        break;
      case 'castle': {
        const t = b.throne!;
        if (!t.alive) {
          if (b.lord && b.lord.alive) {
            // the throne fell first: the Lord runs and can't be recruited
            b.lordFled = true;
            b.lord.fleeing = true; b.lord.leader = false;
            b.notes.push(`${b.spec.lordName || 'The Lord'} fled — not recruitable`);
          } else if (b.lordBeatenFirst && !b.spec.warlord) b.notes.push(`${b.spec.lordName || 'The Lord'} beaten first: Recruit or Release`);
          b.outcome = `${b.spec.name} taken — the throne is destroyed`;
          this.finishBattle('win'); return;
        }
        break;
      }
      case 'convoy': {
        for (const w of b.wagons) {
          if (!w.alive) continue;
          w.x += w.speed * dt;
          if (w.x - w.w / 2 > b.w) {
            w.escaped = true;
            b.outcome = `${w.label} got away with the cargo`;
            this.finishBattle('lose'); return;
          }
        }
        if (b.wagons.every((w) => w.hp <= 0)) {
          b.outcome = 'The convoy is broken — the cargo is yours';
          this.finishBattle('win'); return;
        }
        break;
      }
      case 'defense':
        if (b.houses.every((s) => !s.alive)) { b.outcome = `${b.spec.name} burned — the village is lost`; this.finishBattle('lose'); return; }
        if (this.foeStrength() === 0) { b.outcome = 'The attackers are destroyed'; this.finishBattle('win'); return; }
        if (b.time >= WAR.defenseHold) { b.outcome = `${b.spec.name} held for ${fmtTime(WAR.defenseHold)}`; this.finishBattle('win'); return; }
        break;
      case 'rescue': {
        const c = b.cell!;
        if (!b.general) {
          // held like the outpost's ring: an enemy inside pauses it (never resets)
          c.contested = this.sideIn('enemy', c.x, c.y, c.ringR);
          if (p.alive && !c.contested && dist(p.x, p.y, c.x, c.y) <= c.ringR) c.progress += dt;
          if (c.progress >= c.need) this.freeGeneral();
        } else if (!b.general.alive) {
          b.outcome = `${b.spec.generalName || 'The general'} fell`;
          this.finishBattle('lose'); return;
        }
        break;
      }
    }
    // rout (PLAN 10.1): leader down (or none) and under 40% strength -> the side flees
    this.routT -= dt;
    if (this.routT <= 0 && !b.routed) {
      this.routT = WAR.routCheckEvery;
      const leaderDown = !b.leader || !b.leader.alive;
      if (leaderDown && b.startFoes > 0 && this.foeStrength() < b.startFoes * WAR.routThreshold) {
        b.routed = 'enemy';
        this.army.routSide('enemy');
        for (const e of this.enemies) if (e.alive && e.team === 'enemy') e.fleeing = true;
        const rest: Partial<Record<BattleKind, string>> = {
          field: 'the field is yours', village: 'the garrison flees  ·  burn what is left', defense: 'the village is safe',
          outpost: 'take the ring', keep: 'finish the gate', castle: 'the throne is undefended', convoy: 'the wagons roll on alone', rescue: 'get the general out',
        };
        this.banner('THE DOMINION ROUTS', rest[kind] || '', '#4fe08a');
        this.sfx.wave();
        if (kind === 'field' || kind === 'defense') { b.outcome = 'The Dominion army routed'; this.finishBattle('win'); return; }
      }
    }
  }

  /** Rescue: the cell opens; the general joins the knight's side and follows them out. */
  private freeGeneral() {
    const b = this.battle, c = b.cell!;
    const real = this.battleFrom === 'map' ? this.war.general(b.spec.rescueId || null) : null;
    const g = real ? new Enemy(bossEnemyDef(generalBoss(real, b.spec.tier)), c.x, c.y + 40, real.level, b.spec.tier) : new Enemy(ENEMIES.bruiser, c.x, c.y + 40, WAR.testFieldLevel + 2, b.spec.tier, WAR.commanderMult);
    g.team = 'player';
    g.escort = true;
    if (real) { g.boss = generalBoss(real, b.spec.tier); g.generalId = real.id; }
    else g.def = { ...g.def, name: b.spec.generalName || 'General', color: '#2d4f7a', accent: PAL.ally };
    this.enemies.push(g);
    b.general = g;
    c.hp = 0;
    // the alarm: the throne room's guard pours out after you
    for (const k of unitList(b.spec.reinforce || {})) this.army.addReserve('enemy', k);
    b.startFoes = Math.max(b.startFoes, this.foeStrength());
    this.banner(`${(b.spec.generalName || 'the general').toUpperCase()} IS FREE`, 'the alarm is up  ·  get out: your edge, the general alive', '#4fe08a');
    this.sfx.levelUp();
  }

  /** Decide the battle: tally spoils on a win and show the results screen. */
  finishBattle(result: BattleResult) {
    const b = this.battle, p = this.player;
    if (b.result) return;
    b.result = result;
    b.resultT = 0;
    this.wheelOpen = false; this.input.suppressMove = false; this.input.bot = null;
    if (this.battleFrom === 'map') {
      const st = this.war.stats;
      if (result === 'win') st.won++; else st.lost++;
      st.troopsLost += b.losses.troops;
      // who's still standing on each side (a loss loses your side, PLAN 10.1)
      const a = this.army;
      const mine = { ...a.reserve[TEAM_PLAYER] }, theirs = { ...a.reserve[TEAM_ENEMY] };
      for (let i = 0; i < a.cap; i++) if (a.alive[i]) (a.team[i] === TEAM_PLAYER ? mine : theirs)[UNIT_ORDER[a.type[i]]]++;
      // the warband takes its own back first; the rest were the army you joined
      const wb = emptyReserve(), ally = emptyReserve();
      if (result !== 'lose') for (const k of UNIT_ORDER) { wb[k] = Math.min(mine[k], this.battleWarband[k]); ally[k] = mine[k] - wb[k]; }
      this.war.warbandBack(result === 'lose' ? null : wb);
      b.notes.push(result === 'lose' ? 'the warband is lost' : `warband home: ${troopTotal(this.war.warband)} of ${this.warbandCap()}`);
      // their losses as a share of what they fielded, per type: the garrison or army takes the same share
      // (the battle's extra reinforcements are indistinguishable on the field, so they share it too)
      const fielded = emptyReserve(), share = emptyReserve();
      for (const src of [b.spec.foes, b.spec.reinforce || {}]) for (const k of UNIT_ORDER) fielded[k] += (src as Partial<Reserve>)[k] || 0;
      for (const k of UNIT_ORDER) share[k] = fielded[k] ? clamp(theirs[k] / fielded[k], 0, 1) : 1;
      if (b.spec.generalId) this.war.liveGenerals.add(b.spec.generalId);
      if (b.spec.fightId !== undefined) {
        // a joined fight: its armies and the node carry on from here (PLAN 7.3)
        const node = this.war.resolveJoin(b.spec.fightId, result, ally, share, b.wear());
        if (result === 'win' && node >= 0) b.notes.push(`${this.camp.nodes[node].name} is yours`);
        else if (result === 'retreat') b.notes.push('the fight goes on without you');
      } else if (b.spec.armyId !== undefined) {
        this.war.resolveIntercept(b.spec.armyId, result, share);
        if (result === 'win') b.notes.push('the Dominion army is broken');
      }
      this.war.liveGenerals.clear();
      // first captures pay skill points (PLAN 12.2): say so here rather than as a banner on the map
      for (const e of this.war.events) if (e.kind === 'sp') b.notes.push(`+${e.target} SP: ${this.camp.nodes[e.node].name}, first capture`);
      this.war.events = this.war.events.filter((e) => e.kind !== 'sp');
      this.syncWar();
      if (b.spec.generalId) {
        const g = this.war.general(b.spec.generalId)!;
        b.notes.push(result === 'win' ? `${g.name}: loyalty ${Math.round(g.loyalty)} (fought beside you)` : result === 'lose' ? `${g.name} is taken` : `${g.name} withdraws with you`);
      }
      // a castle taken live: its Lord, beaten first, may be recruited (PLAN 9.1); its cells open
      if (result === 'win' && b.spec.kind === 'castle' && b.spec.nodeId !== undefined) {
        const lord = this.war.general(b.spec.lordId || null);
        if (lord && b.lordBeatenFirst) { this.pendingRecruit = lord.id; this.recruitPick = 0; }
        if (lord) { lord.status = 'gone'; lord.at = -1; }
        for (const c of this.war.captivesAt(b.spec.nodeId)) { this.war.rescue(c); b.notes.push(`${c.name} freed from the cells`); }
      }
      // a rescue raid that got them out
      if (result === 'win' && b.spec.rescueId) {
        const g = this.war.general(b.spec.rescueId);
        if (g) { this.war.rescue(g); b.outcome = `${g.name} is out — rescued (loyalty +${WAR.loyaltyRescued})`; }
      }
      this.save();
    }
    if (!b.outcome) b.outcome = result === 'win' ? 'Victory' : result === 'lose' ? 'You fell. Back to camp — the warband is lost, the node unchanged.' : 'You left the field. The attack is abandoned.';
    else if (result === 'lose' && !p.alive) b.outcome = 'You fell. Back to camp — the warband is lost, the node unchanged.';
    if (result === 'win') {
      const kills = b.kills.byKnight + b.kills.byArmy + b.kills.elites;
      b.spoils.gold = Math.round((WAR.spoilGold[b.spec.kind] || 0) * b.spec.tier + kills * WAR.spoilGoldPerKill);
      if (b.spec.kind === 'convoy') { b.spoils.gold += b.cargo; b.notes = b.notes.filter((s) => !/aboard/.test(s)); b.notes.push(`cargo taken: ${b.cargo} gold`); }
      if (b.spec.kind === 'rescue' && !b.spec.rescueId) b.notes.push(`${b.spec.generalName || 'The general'} rescued`);
      if (b.spec.nodeId !== undefined && b.spec.fightId === undefined && this.battleFrom === 'map') {
        // PLAN 5.3: the node is yours, a level down from the fighting
        const n = this.camp.nodes[b.spec.nodeId];
        this.camp.capture(n);
        this.war.onCapture(n);
        b.notes.push(n.type === 'castle' ? `${this.camp.territories[n.territory].name} is yours` : `${n.name} is yours (level ${n.level})`);
        for (const e of this.war.events) if (e.kind === 'sp') b.notes.push(`+${e.target} SP: first capture`);
        this.war.events = this.war.events.filter((e) => e.kind !== 'sp');
        this.syncWar();
      }
      // spoils (PLAN 12.3): 1-3 commons x tier; a castle's Lord pays its territory's rare, the warlord the top one
      const n = rndInt(WAR.spoilMats[0], WAR.spoilMats[1]) * b.spec.tier;
      for (let k = 0; k < n; k++) { const m = pick(COMMON_MATS); b.spoils.mats[m] = (b.spoils.mats[m] || 0) + 1; }
      if (b.spec.kind === 'castle') {
        const tt = b.spec.nodeId !== undefined ? this.camp.territories[this.camp.nodes[b.spec.nodeId].territory].tier : b.spec.tier;
        const rare = b.spec.warlord ? RARE_MATS[RARE_MATS.length - 1] : WAR.lordRare[clamp(tt, 1, 5) - 1];
        b.spoils.mats[rare] = (b.spoils.mats[rare] || 0) + (b.spec.warlord ? WAR.warlordRareCount : WAR.lordRareCount);
      }
      if (b.spec.convoyId !== undefined && this.battleFrom === 'map') this.war.convoys = this.war.convoys.filter((c) => c.id !== b.spec.convoyId);
      p.gold += b.spoils.gold;
      for (const m of Object.keys(b.spoils.mats) as MatId[]) p.inv[m] = (p.inv[m] || 0) + (b.spoils.mats[m] || 0);
      this.sfx.levelUp();
      this.save();
    } else {
      b.notes = b.notes.filter((s) => !/aboard/.test(s));
      this.sfx.die();
      // the war remembers a lost or abandoned battle too (the warband's fate)
      if (this.battleFrom === 'map') this.save();
    }
  }

  /** Recruit the Lord you beat (loyalty 50, or 30 if they'd defected before), or let them go for double spoils. */
  decideRecruit(recruit: boolean) {
    const g = this.war.general(this.pendingRecruit), b = this.battle, p = this.player;
    this.pendingRecruit = null;
    if (!g) return;
    if (recruit) {
      this.war.recruit(g);
      b.notes.push(generalLine(g, 'recruit'));
      this.banner(`${g.name.toUpperCase()} JOINS YOU`, `level ${g.level}  ·  loyalty ${g.loyalty}`, '#4fe08a');
    } else {
      // Release: the spoils again
      p.gold += b.spoils.gold;
      for (const m of Object.keys(b.spoils.mats) as MatId[]) p.inv[m] = (p.inv[m] || 0) + (b.spoils.mats[m] || 0);
      b.spoils.gold *= 2;
      for (const m of Object.keys(b.spoils.mats) as MatId[]) b.spoils.mats[m] = (b.spoils.mats[m] || 0) * 2;
      b.notes.push(`${g.name} released: double spoils`);
    }
    this.sfx.levelUp();
    this.battle.resultT = 0.3;   // a moment before Enter leaves
    this.save();
  }

  /* ------------------------------------------------------------ autopilot */

  /**
   * Debug autopilot: plays the knight through a battle with plain intent (walk
   * to the objective through the gates, hit what's in the way, drink a potion
   * when low) so the Phase 5 checks can time each type with default troops.
   * Not a player-facing feature.
   */
  autopilot = false;
  /** Castle: go for the Lord before the throne (the recruit route). */
  botLordFirst = true;

  private botDrive() {
    const b = this.battle, p = this.player, inp = this.input;
    inp.bot = null;
    if (!this.autopilot || b.spec.kind === 'test' || b.result || !p.alive) return;
    const kind = b.spec.kind;
    if (b.time < 0.1 && this.order === 'follow' && kind !== 'outpost' && kind !== 'rescue' && kind !== 'defense') this.issueOrder('charge');
    if (p.hp < p.stats.maxHp * 0.35 && p.potions > 0 && inp.frame % 30 === 0) inp.press('item');
    // a competent player heals with Cure too (Phase 14: the autopilot is the balance harness's stand-in)
    else if (p.hp < p.stats.maxHp * 0.5 && !p.charging && p.mp >= p.stats.maxMp * 0.99 && inp.frame % 30 === 0) inp.press('spell4');

    // the nearest hostile in the knight's way
    const near = (r: number, skip: Enemy | null = null): Combatant | null => {
      let best: Combatant | null = null, bd = r;
      for (const e of this.enemies) {
        if (!e.alive || e.team === 'player' || e.fleeing || e === skip || !e.aggro) continue;
        const d = dist(p.x, p.y, e.x, e.y);
        if (d < bd && b.reachable(p.x, p.y, e.x, e.y)) { bd = d; best = e; }
      }
      const j = this.army.nearestHostile('player', p.x, p.y, bd);
      if (j >= 0 && b.reachable(p.x, p.y, this.army.x[j], this.army.y[j])) best = this.army.ref(j);
      return best;
    };
    const anyFoe = (): Combatant | null => {
      const j = this.army.nearestHostile('player', p.x, p.y, 3000);
      let best: Combatant | null = j >= 0 ? this.army.ref(j) : null, bd = best ? dist(p.x, p.y, best.x, best.y) : Infinity;
      for (const e of this.enemies) {
        if (!e.alive || e.team === 'player' || e.fleeing) continue;
        const d = dist(p.x, p.y, e.x, e.y);
        if (d < bd) { bd = d; best = e; }
      }
      return best;
    };
    const nearestOf = (xs: Structure[]) => xs.filter((s) => s.alive).sort((a, c) => dist(p.x, p.y, a.x, a.y) - dist(p.x, p.y, c.x, c.y))[0] || null;

    // what this battle wants: something to hit, or a place to stand
    let goal: Combatant | null = null;
    let spot: { x: number; y: number } | null = null;
    let leave = false;
    let guard = 90;          // fight hostiles this close before walking on
    let skip: Enemy | null = null;
    switch (kind) {
      case 'village': goal = nearestOf(b.houses); break;
      case 'field': goal = b.leader && b.leader.alive ? b.leader : anyFoe(); break;
      case 'outpost': { const r = b.ring!; spot = { x: r.x, y: r.y }; guard = r.ringR + 20; break; }
      case 'keep': goal = nearestOf(b.gates) || (b.captain && b.captain.alive ? b.captain : null); break;
      case 'castle': {
        const t = b.throne!;
        goal = b.gates.find((s) => s.alive) || null;
        if (!goal) goal = this.botLordFirst && b.lord && b.lord.alive ? b.lord : t;
        if (!this.botLordFirst) skip = b.lord;
        break;
      }
      case 'convoy': goal = nearestOf(b.wagons); guard = 60; break;
      case 'defense': {
        const hs = b.houses.filter((s) => s.alive);
        const hx = hs.reduce((s, h) => s + h.x, 0) / Math.max(1, hs.length), hy = hs.reduce((s, h) => s + h.y, 0) / Math.max(1, hs.length);
        // stand with the houses: meet what comes close to them, don't run into the column
        goal = anyFoe();
        if (goal && dist(goal.x, goal.y, hx, hy) > 450) { goal = null; spot = { x: hx + 150, y: b.h / 2 }; }
        guard = 120;
        break;
      }
      case 'rescue': {
        const c = b.cell!;
        if (!b.general) { spot = { x: c.x, y: c.y + 20 }; guard = 70; skip = b.lord; }
        else { leave = true; guard = 50; skip = b.lord; }
        break;
      }
    }
    const threat = near(guard, skip);
    const target: Combatant | null = threat || goal;
    let tx: number, ty: number;
    if (leave) {
      // home: the knight's edge, the general in tow
      const gen = b.general!;
      if (dist(p.x, p.y, gen.x, gen.y) > 260) { tx = gen.x; ty = gen.y; } else { tx = -100; ty = p.y; }
      if (threat) { tx = threat.x; ty = threat.y; }
    } else if (target) { tx = target.x; ty = target instanceof Structure ? target.cy : target.y; }
    else if (spot) { tx = spot.x; ty = spot.y; }
    else { tx = p.x; ty = p.y; }

    // walk there through the doors; swing once in reach
    const w = b.via(p.x, p.y, tx, ty) || { x: tx, y: ty };
    const dx = w.x - p.x, dy = w.y - p.y, d = Math.hypot(dx, dy);
    const reach = 46 + (target ? target.radius : 0);
    const inReach = target && w.x === tx && w.y === ty && dist(p.x, p.y, tx, ty) < reach + (target instanceof Structure ? target.radius * 0.5 : 0);
    if (inReach) {
      inp.bot = { x: dx / Math.max(1, d) * 0.3, y: dy / Math.max(1, d) * 0.3 };
      if (inp.frame % 8 === 0) inp.press('attack');
    } else if (d > 8) inp.bot = { x: dx / d, y: dy / d };
  }

  /** Test hook: run the sim `seconds` ahead as fast as it will go (no drawing). Stops at a result. */
  simulate(seconds: number): number {
    let n = Math.round(seconds / TICK), k = 0;
    for (; k < n; k++) {
      if (this.screen !== 'battle' || this.battle.result) break;
      this.tick(TICK);
    }
    return k * TICK;
  }

  /* ----------------------------------------------------------- main loop */

  start() {
    this.lastTs = performance.now();
    const frame = (ts: number) => {
      // ask for the next frame first: one bad frame must never stop the loop
      requestAnimationFrame(frame);
      const t0 = performance.now();
      const dtReal = Math.min(0.25, (ts - this.lastTs) / 1000);
      this.lastTs = ts;
      this.accumulator += dtReal;
      let guard = 0;
      while (this.accumulator >= TICK && guard++ < 6) {
        this.tick(TICK);
        this.accumulator -= TICK;
      }
      this.renderer.draw(this);
      // frame work time (sim + draw), kept for the perf checks and the debug panel
      this.perfWork[this.perfIdx] = performance.now() - t0;
      this.perfGap[this.perfIdx] = dtReal * 1000;
      this.perfIdx = (this.perfIdx + 1) % this.perfWork.length;
    };
    requestAnimationFrame(frame);
  }

  tick(dt: number) {
    this.input.pollPad();
    this.input.pollTouch();
    // a phone held upright gets the rotate prompt (shell.html) and the game holds still behind it: nothing ticks
    this.portrait = IS_TOUCH && typeof window.matchMedia === 'function' && window.matchMedia('(orientation: portrait)').matches;
    if (this.portrait) { this.music.duck(true); this.input.endTick(); return; }
    this.input.uiMode = this.menuOpen || this.screen !== 'battle' || !!this.battle.result;

    if (TUNING.musicVolume !== this.lastMusicVol) {
      this.lastMusicVol = TUNING.musicVolume;
      this.music.setVolume(TUNING.musicVolume);
    }

    // the run's play time and gold coming in (PLAN 13 victory tallies): map, map battles; not paused
    const inRun = this.screen === 'campaign' || (this.screen === 'battle' && this.battleFrom === 'map');
    if (inRun && !this.paused && !this.story) this.war.stats.time += dt;
    if (inRun) this.trackGold(); else this.lastGold = this.player.gold;

    if (this.screen !== 'battle') {
      this.time += dt;
      if (this.bannerT > 0) this.bannerT -= dt;
      if (this.toastT > 0) this.toastT -= dt;
      this.updateVfx(dt);
      this.syncMusic();
      if (this.screen === 'title') this.handleTitle();
      else if (this.screen === 'sandbox') this.handleSandbox();
      else if (this.screen === 'victory') this.handleVictory();
      else this.handleMap(dt);
      this.input.endTick();
      return;
    }

    // the results screen: the field freezes; any confirm (or a tap) goes back to the map
    if (this.battle.result) {
      this.battle.resultT += dt;
      this.time += dt;
      this.updateVfx(dt);
      this.syncMusic();
      const tap = this.input.takeTap();
      if (this.pendingRecruit) {
        // PLAN 9.1: Recruit the beaten Lord, or Release them for double spoils
        const inp = this.input;
        if (inp.wasPressed('left') || inp.wasPressed('right')) { this.recruitPick = 1 - this.recruitPick; this.sfx.guard(); }
        let choose = -1;
        if (tap) for (let i = 0; i < 2; i++) { const r = RECRUIT_BTN; const x = r.x0 + i * (r.w + r.gap); if (tap.x >= x && tap.x <= x + r.w && tap.y >= r.y && tap.y <= r.y + r.h) choose = i; }
        if (this.battle.resultT > 0.6 && (inp.wasPressed('confirm') || inp.wasPressed('attack'))) choose = this.recruitPick;
        if (choose >= 0) this.decideRecruit(choose === 0);
        this.input.endTick();
        return;
      }
      if (this.battle.resultT > 0.6 && (tap || this.input.wasPressed('confirm') || this.input.wasPressed('attack') || this.input.wasPressed('restart'))) {
        const b = this.battle;
        if (this.battleFrom === 'sandbox') this.enterSandbox();
        else {
          this.enterCampaign();
          if (b.spec.convoyId !== undefined && b.result === 'win') this.banner('CONVOY TAKEN', `+${b.cargo} gold of their cargo`, '#ffd54a');
          if (b.spec.nodeId !== undefined) {
            // back on the map, looking at the node that was fought over
            const n = this.camp.nodes[b.spec.nodeId];
            this.mapSel = n.id; this.mapX = n.x; this.mapY = n.y; this.clampMap();
            if (b.result === 'win' && b.spec.kind !== 'defense' && !b.spec.rescueId) {
              const t = this.camp.territories[n.territory];
              this.banner(`${n.name.toUpperCase()} TAKEN`, n.type === 'castle' ? `${t.name} is yours` : 'the frontier moves', '#4fe08a');
            }
          }
        }
      }
      this.input.endTick();
      return;
    }
    if (this.fadeT > 0) this.fadeT -= dt;

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
    if (!this.player.alive && this.deathT > 0.9 && this.battle.spec.kind === 'test') {
      const tapped = !!this.input.takeTap();
      if (this.input.wasPressed('restart') || tapped || this.input.wasPressed('confirm')) {
        this.recoverFromDeath(); this.input.endTick(); return;
      }
    }

    if (this.paused) { this.input.endTick(); return; }

    this.time += dt;
    if (this.toastT > 0) this.toastT -= dt;
    if (this.orderT > 0) this.orderT -= dt;
    if (this.bannerT > 0) this.bannerT -= dt;
    if (this.comboDisplay > 0) this.comboDisplay--;
    if (this.comboTimer > 0 && --this.comboTimer === 0) this.comboCount = 0;
    this.shakeAmount *= Math.pow(0.86, dt * 60);

    this.updateVfx(dt);

    // Hitstop freezes the simulation but keeps the picture alive.
    if (this.hitstopFrames > 0) { this.hitstopFrames--; this.follow(false); this.input.endTick(); return; }
    this.minionStop = 0;
    if (this.minionSfxT > 0) this.minionSfxT -= dt;

    if (!this.player.alive) {
      this.deathT += dt;
      for (const e of this.enemies) e.update(this, dt);
      this.army.update(this, dt);
      this.cull();
      // in a real battle the fall ends it: retreat to camp, warband lost, node unchanged (PLAN 10.1)
      if (this.battle.spec.kind !== 'test' && this.deathT > WAR.deathToResults) this.finishBattle('lose');
      this.input.endTick();
      return;
    }

    this.input.takeTap();   // taps outside the touch controls do nothing on the field
    this.botDrive();
    this.updateWheel(dt);
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
      this.army.update(this, dt);
    }
    for (const p of this.projectiles) p.update(this, dt);
    for (const p of this.pickups) p.update(this, dt);

    this.cull();
    for (const s of this.battle.structures) { if (s.flash > 0) s.flash -= dt; if (!s.alive) s.burnT += dt; }
    if (this.battle.spec.kind === 'test') this.updateTestField(dt);
    else { this.battle.time += dt; this.updateBattleState(dt); }
    this.follow(false);
    this.input.endTick();
  }

  /* --------------------------------------------------------------- orders */

  /** Slice -> order. Up = Charge, right = Focus, down = Hold, left = Follow. */
  static readonly WHEEL: Order[] = ['charge', 'focus', 'hold', 'follow'];

  /** Which slice a direction points at, or -1 inside the dead zone. */
  private sliceOf(dx: number, dy: number, dead: number): number {
    if (Math.hypot(dx, dy) < dead) return -1;
    if (Math.abs(dy) >= Math.abs(dx)) return dy < 0 ? 0 : 2;
    return dx > 0 ? 1 : 3;
  }

  /**
   * Keyboard: hold Q + direction, release to give the order; tap Q to cycle.
   * Pad: the same with LB + stick. Touch: CMD opens a radial under the thumb,
   * drag to a slice and release (a tap with no drag cycles).
   */
  private updateWheel(dt: number) {
    const inp = this.input;
    const held = inp.isHeld('KeyQ') || inp.padLB;
    if (held && !this.wheelTouch) {
      if (!this.wheelOpen) { this.wheelOpen = true; this.wheelT = 0; this.wheelDir = -1; }
      this.wheelT += dt;
      inp.suppressMove = true;            // directions pick a slice instead of walking
      const v = inp.wheelVector();
      const s = this.sliceOf(v.x, v.y, 0.5);
      if (s >= 0) this.wheelDir = s;
      this.wheelX = this.player.x - this.camX; this.wheelY = this.player.y - this.camY - 30;
    } else if (this.wheelOpen && !this.wheelTouch) {
      if (this.wheelDir >= 0) this.issueOrder(Game.WHEEL[this.wheelDir]);
      else if (this.wheelT < WAR.wheelTapTime) this.cycleOrder();
      this.wheelOpen = false;
      inp.suppressMove = false;
    } else if (inp.wasPressed('command') && !this.wheelOpen) {
      // a tap of Q shorter than one frame: down and up between ticks, never seen as held
      this.cycleOrder();
    }
    if (inp.radial.active) {
      this.wheelOpen = true; this.wheelTouch = true;
      this.wheelX = inp.radial.ox; this.wheelY = inp.radial.oy;
      this.wheelDir = this.sliceOf(inp.radial.dx, inp.radial.dy, WAR.wheelDeadZone);
    }
    if (inp.radialRelease) {
      const r = inp.radialRelease;
      inp.radialRelease = null;
      const s = this.sliceOf(r.dx, r.dy, WAR.wheelDeadZone);
      if (s >= 0) this.issueOrder(Game.WHEEL[s]); else this.cycleOrder();
      this.wheelOpen = false; this.wheelTouch = false;
    }
  }

  cycleOrder() {
    this.issueOrder(ORDERS[(ORDERS.indexOf(this.order) + 1) % ORDERS.length]);
  }

  issueOrder(o: Order) {
    this.order = o;
    if (o === 'hold') this.army.anchorAll('player');
    this.focusFrame = -1;
    this.sfx.cast(o === 'charge' ? 720 : o === 'focus' ? 640 : o === 'hold' ? 420 : 520);
    this.orderT = WAR.orderBanner;
  }
  orderT = 0;

  /**
   * What Focus points everyone at: your lock-on target if you have one,
   * otherwise the nearest hostile structure, otherwise the hostile nearest the knight.
   * Worked out once per frame.
   */
  focusTarget(): Combatant | null {
    if (this.focusFrame === this.input.frame) return this.focusCache;
    this.focusFrame = this.input.frame;
    const p = this.player;
    let best: Combatant | null = p.lock && p.lock.alive ? p.lock : null;
    if (!best) best = this.battle.nearestStructure('player', p.x, p.y);   // PLAN 11.4: "or the nearest structure if none"
    if (!best) {
      let bd = Infinity;
      for (const e of this.enemies) {
        if (!e.alive || e.team !== 'enemy') continue;
        const d = dist(e.x, e.y, p.x, p.y);
        if (d < bd) { bd = d; best = e; }
      }
      const j = this.army.nearestHostile('player', p.x, p.y, Math.min(bd, 2000));
      if (j >= 0) best = this.army.ref(j);
    }
    this.focusCache = best;
    return best;
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
    const level = this.musicLevel();
    const [id, transpose, tempo] = this.musicFor(level);
    this.music.setTrack(id, transpose, tempo);
    this.music.duck(this.menuOpen || this.paused || !!this.story);
    this.music.target = level;
  }

  private musicBig = false;    // hysteresis for the 60+ live units step
  portrait = false;            // a phone held upright: the game is frozen behind the rotate prompt

  /**
   * The intensity ladder (PLAN 13): 0 the calm map (and title, victory); 1 the map under threat
   * (a muster or an army coming for your land, a fight at one of your nodes); 2 a battle;
   * 3 60+ live units (off again under 50) or a castle siege past its outer gate; 4 a Lord or the
   * warlord in the fight.
   */
  musicLevel(): number {
    if (this.screen === 'campaign') {
      const w = this.war, c = this.camp;
      const threat = w.musters.some((m) => c.nodes[m.target].owner === 'player')
        || w.armies.some((a) => a.team === 'enemy' && !a.gone && c.nodes[a.target] && c.nodes[a.target].owner === 'player')
        || w.fights.some((f) => f.node >= 0 && c.nodes[f.node].owner === 'player');
      return threat ? 1 : 0;
    }
    if (this.screen !== 'battle') return 0;
    const b = this.battle, p = this.player;
    if (b.result || !p.alive) return 0;
    if (b.spec.kind === 'test') {
      const fighting = this.army.live('enemy') > 0 || this.enemies.some((e) => e.alive && e.aggro && e.team === 'enemy');
      return fighting ? 2 : 0;
    }
    if (b.lord && b.lord.alive && !b.lord.fleeing && (b.lord.aggro || b.spec.warlord && b.gates.every((g) => !g.alive))) return 4;
    const live = this.army.live('player') + this.army.live('enemy');
    this.musicBig = this.musicBig ? live >= WAR.musicBigOff : live >= WAR.musicBigOn;
    const innerGate = b.spec.kind === 'castle' && b.gates.length > 0 && !b.gates[0].alive;
    return this.musicBig || innerGate ? 3 : 2;
  }

  /** [theme, transpose, tempo]: the title's theme, 'Above the Storm' for the map, the scenery's theme in battle, the boss theme at 4. */
  musicFor(level = this.musicLevel()): [string, number, number] {
    if (this.screen === 'title' || this.screen === 'victory') return ['title', 0, 1];
    if (this.screen === 'campaign') return ['sky', 0, 1];
    if (level >= 4) return ['boss', 0, 1];
    const s = this.battle ? this.battle.spec.scenery : 'forest';
    return [s === 'coast' || s === 'ruins' ? s : 'forest', 0, 1];
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
    if (this.battle.spec.kind !== 'test') this.battle = new Battle(testSpec());
    this.screen = 'battle';
    this.field = { x: 0, y: 0, w: WAR.testField.w, h: WAR.testField.h };
    this.enemies.length = 0;
    this.projectiles.length = 0;
    this.pickups.length = 0;
    this.army.clear();
    p.lock = null;
    this.order = 'follow';
    this.wheelOpen = false; this.wheelTouch = false; this.input.suppressMove = false;
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

  /** `n` unit types in the PLAN 6 recruit mix (40/20/25/15), exact counts, shuffled. */
  private mixOf(n: number): UnitType[] {
    const out: UnitType[] = [];
    const m = WAR.testMix;
    const counts: [UnitType, number][] = [['sword', m.sword], ['spear', m.spear], ['archer', m.archer], ['shield', m.shield]];
    let left = n;
    for (let k = 0; k < counts.length; k++) {
      const c = k === counts.length - 1 ? left : Math.round(n * counts[k][1]);
      for (let q = 0; q < c && left > 0; q++, left--) out.push(counts[k][0]);
    }
    for (let k = out.length - 1; k > 0; k--) { const r = rndInt(0, k); [out[k], out[r]] = [out[r], out[k]]; }
    return out;
  }

  /** The warband's size cap (PLAN 12.2: 12 base; talents and L3 castles add up to 60 in Phase 11). */
  warbandCap(): number { this.syncWar(); return this.war.warbandCap(); }

  /** Hand the war the knight's talents, and the knight the SP the war has awarded for first captures (PLAN 12.2). */
  syncWar() {
    const p = this.player, w = this.war;
    w.talents = p.talents;
    w.loyaltyMult = p.hasT('presence') ? WAR.presenceMult : 1;   // Warlord's Presence
    if (w.spPending > 0) { p.skillPoints += w.spPending; w.spPending = 0; }
  }

  /** Spawn `kinds` as a block of ranks around (cx, cy); archers at the back. Past the live cap they go to reserve. */
  private spawnBlock(kinds: UnitType[], side: Team, cx: number, cy: number, tier = WAR.testFieldTier) {
    const f = this.field;
    const sorted = kinds.slice().sort((a, b) => (a === 'archer' ? 1 : 0) - (b === 'archer' ? 1 : 0));
    const perRank = 8, gap = 26, back = side === 'player' ? -1 : 1;
    sorted.forEach((k, idx) => {
      const rank = Math.floor(idx / perRank), file = idx % perRank;
      const x = clamp(cx + back * rank * gap + rnd(-4, 4), f.x + 30, f.x + f.w - 30);
      const y = clamp(cy + (file - (perRank - 1) / 2) * gap + rnd(-4, 4), f.y + 30, f.y + f.h - 30);
      if (this.army.spawn(k, side, x, y, tier) < 0) this.army.addReserve(side, k);
    });
  }

  /** Debug / perf: clear the field and line up `n` allied minions against `n` Dominion minions. */
  massTest(n: number) {
    const p = this.player, f = this.field;
    this.enemies.length = 0; this.projectiles.length = 0; this.army.clear();
    this.respawnT = 999; this.waveIntro = 0; p.lock = null;
    p.x = f.x + f.w / 2; p.y = f.y + f.h / 2;
    const n2 = Math.min(n, Army.liveCap());
    this.spawnBlock(this.mixOf(n2), 'player', p.x - 160, p.y);
    this.spawnBlock(this.mixOf(n2), 'enemy', p.x + 260, p.y);
    this.follow(true);
  }

  /** The next group: Dominion minions and Shades ahead of the knight; allies (elite + minions) topped up. */
  private spawnTestGroup() {
    this.topUpAllies();
    const p = this.player, f = this.field;
    // the warband: topped back up to its cap, beside the knight
    const addWarband = Math.max(0, this.warbandCap() - this.army.live('player') - this.army.reserveCount('player'));
    if (addWarband) this.spawnBlock(this.mixOf(addWarband), 'player', clamp(p.x - 90, f.x + 60, f.x + f.w - 60), p.y);
    // the Dominion: a block ahead of the knight; past the live cap the rest wait in reserve at their edge
    const foes = WAR.testFoeMinions + WAR.testFoeMinionsPerGroup * this.groupsCleared;
    const fx = p.x + 520 < f.x + f.w - 120 ? p.x + 520 : p.x - 520;
    const enemyEdgeX = fx > p.x ? f.x + f.w - 40 : f.x + 40;
    this.army.setEdge('enemy', enemyEdgeX, p.y, 220);
    this.army.setEdge('player', fx > p.x ? f.x + 40 : f.x + f.w - 40, p.y, 220);
    this.spawnBlock(this.mixOf(foes), 'enemy', clamp(fx, f.x + 120, f.x + f.w - 120), p.y);
    const ids = this.composition(this.groupsCleared + 1, ['shade', 'caster', 'flyer', 'bruiser']).slice(0, 3);
    for (let i = 0; i < ids.length; i++) {
      // the Shades lead the Dominion block
      const x = clamp(fx + (fx > p.x ? -70 : 70) + rnd(-20, 20), f.x + 40, f.x + f.w - 40);
      const y = clamp(p.y + (i - (ids.length - 1) / 2) * 110, f.y + 40, f.y + f.h - 40);
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
    this.battle.collide(o);
  }

  /* ----------------------------------------------------------- structures */

  /** The knight's swing (or Whirl tick) against hostile structures in its arc: x1 buildings, x0.3 gates and thrones. */
  hitStructures(def: AttackDef, p: Player, hits: Set<Structure>) {
    const reach = p.reach(def);
    for (const s of this.battle.structures) {
      if (!s.targetable || s.team === 'player' || hits.has(s)) continue;
      if (!inArc(p.x, p.y, p.z, p.facing, reach, def.arc, s.x, s.y - s.h / 2, 0, s.radius * 0.8)) continue;
      hits.add(s);
      const edge = p.hasT('edge') ? 1.12 : 1;
      const r = physDamage(def.power * TUNING.playerDamageMult * p.weapon.powerMult * edge, p.stats.str, 0);
      const dmg = Math.max(1, Math.round(r.dmg * s.mult('knight')));
      s.damage(this, dmg);
      this.registerHit();
      this.floatText(s.x + rnd(-20, 20), s.y - s.h * 0.5, 40, String(dmg), '#ffcf8a', 14);
      this.burst(s.x + rnd(-s.w / 3, s.w / 3), s.y - s.h * 0.4, 30, 5, '#c89a5a');
      this.shake(2 * TUNING.shakeScale);
      if (this.minionSfxT <= 0) { this.sfx.hit(false); this.minionSfxT = 0.05; }
    }
  }

  /** A structure fell: houses burn (PLAN 10.2). */
  onStructureDestroyed(s: Structure) {
    this.burst(s.x, s.y - s.h / 2, 40, 30, '#ff9d4a');
    this.ring(s.x, s.y - s.h / 2, 0, 20, s.w, '#ff7a3d');
    this.shake(8 * TUNING.shakeScale);
    this.sfx.die();
    const b = this.battle;
    if (s.kind === 'building') {
      const hs = b.houses;
      const burned = hs.filter((x) => !x.alive).length;
      this.banner(`${s.label.toUpperCase()} BURNED`, `${burned} / ${hs.length}`, s.team === 'player' ? '#ff6b6b' : '#ff9d4a');
    } else if (s.kind === 'gate') {
      this.banner(`${s.label.toUpperCase()} BROKEN`, b.objective, '#ffd54a');
    } else if (s.kind === 'wagon') {
      const ws = b.wagons;
      this.banner(`${s.label.toUpperCase()} WRECKED`, `${ws.filter((x) => x.hp <= 0).length} / ${ws.length}`, '#ffd54a');
    }
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

  /** Nothing hits through a closed gate or a wall: attacker and target in different zones with no open way between. */
  blocked(ax: number, ay: number, tx: number, ty: number): boolean {
    const b = this.battle;
    return !!b && b.doors.length > 0 && !b.reachable(ax, ay, tx, ty);
  }

  hitEnemy(e: Enemy, def: AttackDef, p: Player) {
    if (this.blocked(p.x, p.y, e.x, e.y)) return;
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

  /** The knight and elites `team` may fight (minions are found through `army` queries). */
  hostilesOf(team: Team): (Player | Enemy)[] {
    const out: (Player | Enemy)[] = [];
    if (team === 'enemy' && this.player.alive) out.push(this.player);
    for (const e of this.enemies) if (e.alive && e.team !== team) out.push(e);
    return out;
  }

  /** Dominion units still standing (allies don't count). */
  foesAlive(): number { return this.enemies.filter((e) => e.alive && e.team === 'enemy').length + this.army.live('enemy') + this.army.reserveCount('enemy'); }

  /** Allies standing: elites and minions. */
  alliesAlive(): number { return this.enemies.filter((e) => e.alive && e.team === 'player').length + this.army.live('player'); }

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
      if (!inArc(e.x, e.y, e.z, e.facing, reach, 1.0, t.x, t.y, t.z, t.radius) || this.blocked(e.x, e.y, t.x, t.y)) continue;
      hit = true;
      const ang = Math.atan2(t.y - e.y, t.x - e.x);
      if (t instanceof Player) this.unitHitsKnight(e, mult, ang, 240, 22);
      else if (t instanceof Enemy) this.unitHitsUnit(e, t, mult, ang, 160);
    }
    for (const st of this.battle.structures) {
      if (!st.alive || st.team === e.team || st.kind === 'captureRing') continue;
      if (!inArc(e.x, e.y, e.z, e.facing, reach, 1.0, st.x, st.y - st.h / 2, 0, st.radius * 0.8)) continue;
      hit = true;
      st.damage(this, Math.max(1, Math.round(physDamage(e.def.power * mult * (e.str / e.def.str), e.str, 0).dmg * st.mult('unit'))));
    }
    // minions in the arc: an elite's swing mows through them
    const a = this.army, own = teamIndex(e.team);
    a.query(e.x, e.y, reach + 24, (j) => {
      if (a.team[j] === own || this.blocked(e.x, e.y, a.x[j], a.y[j])) return;
      if (!inArc(e.x, e.y, e.z, e.facing, reach, 1.0, a.x[j], a.y[j], 0, a.def(j).radius)) return;
      hit = true;
      const r = physDamage(e.def.power * mult * WAR.unitDamageMult * (e.str / e.def.str), e.str, a.armor[j]);
      a.hurt(this, j, r.dmg, Math.atan2(a.y[j] - e.y, a.x[j] - e.x), 160, false);
    });
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
      if (t.z > 26 + (t instanceof Enemy ? t.def.hover : 0) || dist(x, y, t.x, t.y) > r + t.radius || this.blocked(x, y, t.x, t.y)) continue;
      const ang = Math.atan2(t.y - y, t.x - x);
      if (t instanceof Player) this.unitHitsKnight(e, mult, ang, 320, 26);
      else if (t instanceof Enemy) this.unitHitsUnit(e, t, mult, ang, 220);
    }
    const a = this.army, own = teamIndex(e.team);
    a.query(x, y, r + 24, (j) => {
      if (a.team[j] === own || dist(x, y, a.x[j], a.y[j]) > r + a.def(j).radius || this.blocked(x, y, a.x[j], a.y[j])) return;
      const res = physDamage(e.def.power * mult * WAR.unitDamageMult * (e.str / e.def.str), e.str, a.armor[j]);
      a.hurt(this, j, res.dmg, Math.atan2(a.y[j] - y, a.x[j] - x), 220, false);
    });
  }

  projectileCollide(proj: Projectile) {
    // walls, houses and gates stop every shot; a hostile one takes the hit (Fire x2 on buildings)
    for (const st of this.battle.structures) {
      if (!st.solid || !st.contains(proj.x, proj.y, proj.radius)) continue;
      proj.dead = true;
      if (st.team !== proj.team) {
        const base = proj.owner === 'player' ? magicDamage(proj.power, this.player.stats.mag, 0).dmg : magicDamage(proj.power, proj.mag, 0).dmg;
        const dmg = Math.max(1, Math.round(base * st.mult(proj.isFire ? 'fire' : 'unit')));
        st.damage(this, dmg);
        if (proj.owner === 'player') { this.registerHit(); this.floatText(proj.x, st.y - st.h / 2, 40, String(dmg), proj.color, 15); }
      }
      this.burst(proj.x, proj.y, proj.z, 8, proj.color);
      return;
    }
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
      const a = this.army;
      a.query(proj.x, proj.y, proj.radius + 24, (j) => {
        if (a.team[j] !== TEAM_ENEMY || proj.minionHits.has(a.uid[j])) return;
        if (dist(proj.x, proj.y, a.x[j], a.y[j]) > a.def(j).radius + proj.radius + 4) return;
        proj.minionHits.add(a.uid[j]);
        const r = magicDamage(proj.power, this.player.stats.mag, a.armor[j]);
        const killed = a.hurt(this, j, r.dmg, Math.atan2(a.y[j] - proj.y, a.x[j] - proj.x), 60, true);
        this.registerHit();
        this.floatText(a.x[j], a.y[j], 30, String(r.dmg), proj.color, killed ? 15 : 12);
        this.burst(proj.x, proj.y, proj.z, 6, proj.color);
        if (!proj.pierce) { proj.dead = true; return true; }
      });
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
    const a = this.army;
    const j = a.nearestHostile(proj.team, proj.x, proj.y, proj.radius + 16);
    if (j >= 0 && dist(proj.x, proj.y, a.x[j], a.y[j]) <= a.def(j).radius + proj.radius + 4) {
      proj.dead = true;
      const r = magicDamage(proj.power * WAR.unitDamageMult, proj.mag, a.armor[j]);
      a.hurt(this, j, r.dmg, Math.atan2(a.y[j] - proj.y, a.x[j] - proj.x), 60, false);
      this.burst(proj.x, proj.y, proj.z, 8, proj.color);
    }
  }

  /* -------------------------------------------------------------- minions */

  /** Minion i's swing lands on its target (spearmen x2 vs beasts). */
  unitStrike(a: Army, i: number, t: Combatant) {
    const d = a.def(i);
    const ang = Math.atan2(t.y - a.y[i], t.x - a.x[i]);
    const power = a.power(i);
    if (t instanceof Structure) {
      const m = t.mult(d.id === 'ram' ? 'ram' : 'unit');
      if (!t.alive || t.team === teamName(a.team[i]) || m <= 0) return;
      t.damage(this, Math.max(1, Math.round(power * m)));
      return;
    }
    if (this.blocked(a.x[i], a.y[i], t.x, t.y)) return;   // the target moved behind a shut gate mid-swing
    if (t instanceof MinionRef) {
      if (!t.alive) return;
      const mult = a.def(t.i).beast && d.vsBeast ? d.vsBeast : 1;
      const r = physDamage(power * mult, 0, a.armor[t.i]);
      a.hurt(this, t.i, r.dmg, ang, 40, false);
    } else if (t instanceof Player) {
      if (!t.alive) return;
      if (this.god) { this.floatText(t.x, t.y, t.z + 40, 'GOD', '#7fe8ff', 14); return; }
      const r = physDamage(power * TUNING.enemyDamageMult, 0, t.stats.def);
      t.takeHit(this, r.dmg, ang, 110, 10);
    } else {
      if (!t.alive) return;
      const r = physDamage(power * WAR.unitDamageMult, 0, t.edef);
      t.applyDamage(this, r.dmg, 4, ang, 40, 0);
    }
  }

  /** An arrow at slot k: hits the first hostile it touches. Returns true if it is spent. */
  arrowHit(a: Army, k: number): boolean {
    const x = a.ax[k], y = a.ay[k], side = teamName(a.ateam[k]);
    for (const st of this.battle.structures) {
      if (!st.solid || !st.contains(x, y)) continue;
      if (st.team !== side) st.damage(this, Math.max(1, Math.round(a.admg[k] * st.mult('unit'))));
      return true;
    }
    const p = this.player;
    if (side === 'enemy' && p.alive && p.z < 40 && dist(x, y, p.x, p.y) < p.radius + 4) {
      if (this.god) return false;
      const r = physDamage(a.admg[k] * TUNING.enemyDamageMult, 0, p.stats.def);
      p.takeHit(this, r.dmg, Math.atan2(a.avy[k], a.avx[k]), 80, 6);
      return true;
    }
    for (const e of this.enemies) {
      if (!e.alive || e.team === side || e.z > 60 || dist(x, y, e.x, e.y) > e.radius + 4) continue;
      const r = physDamage(a.admg[k] * WAR.unitDamageMult, 0, e.edef);
      e.applyDamage(this, r.dmg, 2, Math.atan2(a.avy[k], a.avx[k]), 20, 0);
      return true;
    }
    const j = a.nearestHostile(side, x, y, 16);
    if (j >= 0 && dist(x, y, a.x[j], a.y[j]) <= a.def(j).radius + 3) {
      const r = physDamage(a.admg[k], 0, a.armor[j]);
      a.hurt(this, j, r.dmg, Math.atan2(a.avy[k], a.avx[k]), 30, false);
      return true;
    }
    return false;
  }

  /** The knight's swing (or Whirl tick) against every Dominion minion in its arc. */
  hitMinions(def: AttackDef, p: Player, hits: Set<number>) {
    const a = this.army;
    const reach = p.reach(def);
    let any = false;
    a.query(p.x, p.y, reach + 24, (j) => {
      if (a.team[j] !== TEAM_ENEMY || hits.has(a.uid[j]) || this.blocked(p.x, p.y, a.x[j], a.y[j])) return;
      if (!inArc(p.x, p.y, p.z, p.facing, reach, def.arc, a.x[j], a.y[j], 0, a.def(j).radius)) return;
      hits.add(a.uid[j]);
      any = true;
      const edge = p.hasT('edge') ? 1.12 : 1;
      const r = physDamage(def.power * TUNING.playerDamageMult * p.weapon.powerMult * edge, p.stats.str, a.armor[j]);
      const killed = a.hurt(this, j, r.dmg, Math.atan2(a.y[j] - p.y, a.x[j] - p.x), def.knockback * 0.6, true);
      this.registerHit();
      this.floatText(a.x[j] + rnd(-6, 6), a.y[j], 30, String(r.dmg), r.crit ? '#ffd54a' : '#ffffff', killed ? 15 : 12);
      if (!killed) this.burst(a.x[j], a.y[j], 14, 3, '#cfe0ff');
    });
    if (any) {
      // light feedback only: no per-hit hitstop on minions (kills add a capped frame each)
      this.shake(Math.min(3, def.shake * 0.4) * TUNING.shakeScale);
      if (this.minionSfxT <= 0) { this.sfx.hit(def.finisher); this.minionSfxT = 0.05; }
    }
  }

  /** The Tempest Whirl drags nearby Dominion minions in. */
  pullMinions(x: number, y: number, r: number, amount: number) {
    const a = this.army;
    a.query(x, y, r, (j) => {
      if (a.team[j] !== TEAM_ENEMY || a.def(j).ignoresUnits) return;
      const d = dist(x, y, a.x[j], a.y[j]);
      if (d > r || d < 12) return;
      const ang = Math.atan2(y - a.y[j], x - a.x[j]);
      a.x[j] += Math.cos(ang) * amount;
      a.y[j] += Math.sin(ang) * amount;
    });
  }

  /** A minion died. A knight kill adds a hitstop frame, capped per sim frame (PLAN 11.1). */
  onMinionDeath(a: Army, i: number, byKnight: boolean) {
    const b = this.battle;
    if (a.team[i] === TEAM_ENEMY) { if (byKnight) b.kills.byKnight++; else b.kills.byArmy++; }
    else b.losses.troops++;
    const col = a.team[i] === TEAM_PLAYER ? PAL.ally : PAL.dominion;
    this.burst(a.x[i], a.y[i], 12, 6, col);
    if (byKnight && this.minionStop < WAR.minionHitstopCap) {
      const add = Math.min(WAR.minionKillHitstop, WAR.minionHitstopCap - this.minionStop);
      this.hitstopFrames += add;
      this.minionStop += add;
    }
    if (this.minionSfxT <= 0) { this.sfx.die(); this.minionSfxT = 0.05; }
  }

  /* --------------------------------------------------------------- magic */

  fireSpell(s: SpellDef, p: Player) {
    const target = p.lock && p.lock.alive ? p.lock : this.nearestEnemy(p.x, p.y, 500);
    // no elite to home on: aim at the nearest Dominion minion instead
    const mj = target ? -1 : this.army.nearestHostile('player', p.x, p.y, 500);
    const ang = target ? Math.atan2(target.y - p.y, target.x - p.x)
      : mj >= 0 ? Math.atan2(this.army.y[mj] - p.y, this.army.x[mj] - p.x) : p.facing;

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
      // Thunder picks the nearest Dominion targets, elites and minions alike
      const range = surge ? 330 : 260;
      const pool: { x: number; y: number; z: number; h: number; res: number; hit: (r: DamageResult) => void }[] = [];
      for (const e of this.enemies) {
        if (!e.alive || e.team !== 'enemy' || dist(e.x, e.y, p.x, p.y) >= range || this.blocked(p.x, p.y, e.x, e.y)) continue;
        pool.push({ x: e.x, y: e.y, z: e.z, h: e.def.height, res: e.mres, hit: (r) => e.applyDamage(this, r.dmg, 26, Math.atan2(e.y - p.y, e.x - p.x), 60, 0) });
      }
      const a = this.army;
      a.query(p.x, p.y, range, (j) => {
        if (a.team[j] !== TEAM_ENEMY || dist(a.x[j], a.y[j], p.x, p.y) >= range || this.blocked(p.x, p.y, a.x[j], a.y[j])) return;
        pool.push({ x: a.x[j], y: a.y[j], z: 0, h: 16, res: a.armor[j], hit: (r) => { a.hurt(this, j, r.dmg, Math.atan2(a.y[j] - p.y, a.x[j] - p.x), 60, true); } });
      });
      const targets = pool.sort((m, n) => dist(m.x, m.y, p.x, p.y) - dist(n.x, n.y, p.x, p.y)).slice(0, surge ? 5 : 3);
      if (!targets.length) { this.toast('NO TARGET'); return; }
      for (const e of targets) {
        const r = magicDamage(s.power * fm, p.stats.mag, e.res);
        e.hit(r);
        this.floatText(e.x, e.y, e.z + e.h + 10, String(r.dmg), s.color, 18);
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
    const shot = new Projectile({
      x: p.x + Math.cos(ang) * 20, y: p.y + Math.sin(ang) * 20, z: p.z + 22,
      vx: Math.cos(ang) * sp, vy: Math.sin(ang) * sp,
      radius: s.kind === 'pierce' ? 5 : 8,
      life: 2.2, color: s.color, owner: 'player', power: s.power * fm,
      pierce: s.kind === 'pierce',
      homing: s.kind === 'projectile' ? 5 : 0,
      target,
      slowOnHit: s.kind === 'pierce',
    });
    shot.isFire = s.id === 'fire';
    this.projectiles.push(shot);
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
      const state: SynthState = owned ? 'owned' : canAfford(p.inv, recipe.needs) && p.gold >= recipe.gold ? 'ready' : 'lack';
      out.push({ kind, id, name, recipe, state });
    };
    for (const w of WEAPONS) if (w.recipe) add('w', w.id, w.name, w.recipe, p.ownedWeapons.includes(w.id));
    for (const a of ARMORS) if (a.recipe) add('a', a.id, a.name, a.recipe, p.ownedArmors.includes(a.id));
    return out;
  }

  private handleBigMenu() {
    const inp = this.input;
    const click = inp.takeClick();             // the map hands taps over as clicks
    const tap = inp.takeTap() || click;
    if (tap && this.tapBigMenu(tap)) return;
    if (inp.wasPressed('cancel')) { this.closeMenu(); return; }

    for (let i = 0; i < MENU_TABS; i++) {
      if (inp.wasPressed(('spell' + (i + 1)) as Action)) this.menuTab = i;
    }

    const cycle = (d: number) => { this.menuTab = (this.menuTab + d + MENU_TABS) % MENU_TABS; };

    if (this.menuTab === MENU_TALENTS) {
      const nb = BRANCHES.length;
      if (inp.wasPressed('left')) { this.talentBranch = (this.talentBranch + nb - 1) % nb; this.talentIndex = 0; this.sfx.guard(); }
      if (inp.wasPressed('right')) { this.talentBranch = (this.talentBranch + 1) % nb; this.talentIndex = 0; this.sfx.guard(); }
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
    } else if (this.menuTab === MENU_KNIGHT) {
      const n = KNIGHT_UPGRADES.length;
      if (inp.wasPressed('down')) { this.knightIndex = (this.knightIndex + 1) % n; this.sfx.guard(); }
      if (inp.wasPressed('up')) { this.knightIndex = (this.knightIndex - 1 + n) % n; this.sfx.guard(); }
      if (inp.wasPressed('confirm')) this.buyUpgrade(KNIGHT_UPGRADES[this.knightIndex].id);
    } else if (this.menuTab === MENU_FORGE) {
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

  /** PLAN 12.3: forging needs a castle you hold, so it's done from the map (the menu, or a castle's Forge button). */
  canForge(): boolean {
    return this.screen === 'campaign' && this.camp.nodes.some((n) => n.type === 'castle' && n.owner === 'player');
  }

  /** Forge for gold + materials (PLAN 12.3). */
  craft(e: SynthEntry) {
    const p = this.player;
    if (e.state === 'owned') { this.toast('ALREADY FORGED'); return; }
    if (!this.canForge()) { this.toast('FORGE AT A CASTLE: OPEN THE MENU ON THE MAP'); return; }
    if (p.gold < e.recipe.gold) { this.toast(`NEED ${e.recipe.gold} GOLD`); return; }
    if (e.state === 'lack') { this.toast('NOT ENOUGH MATERIALS'); return; }
    p.gold -= e.recipe.gold;
    spend(p.inv, e.recipe.needs);
    if (e.kind === 'w') { p.ownedWeapons.push(e.id); p.weapon = weaponById(e.id); }
    else { p.ownedArmors.push(e.id); p.armor = armorById(e.id); }
    p.refreshStats(false);
    this.sfx.levelUp();
    this.banner('FORGED', e.name, '#ffd54a');
    this.save();
  }

  /** Gold for the next rank of a knight upgrade: 100 x rank^2 (PLAN 12.1); 0 at max. */
  upgradeCost(k: keyof KnightUpgrades): number {
    const r = this.player.upgrades[k];
    return r >= WAR.upgradeRanks ? 0 : WAR.upgradeCost * (r + 1) * (r + 1);
  }

  buyUpgrade(k: keyof KnightUpgrades) {
    const p = this.player, cost = this.upgradeCost(k);
    if (!cost) { this.toast('ALREADY AT MAX RANK'); return; }
    if (p.gold < cost) { this.toast(`NEED ${cost} GOLD`); return; }
    p.gold -= cost;
    p.upgrades[k]++;
    p.refreshStats(false);
    this.sfx.levelUp();
    this.banner(`${KNIGHT_UPGRADES.find((u) => u.id === k)!.name.toUpperCase()} ${p.upgrades[k]}`, `${cost} gold`, '#ffd54a');
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
    if (e.generalId) this.banner(`${e.def.name.toUpperCase()} IS DOWN`, 'win, and they get back up', '#ffb070');
    const b = this.battle;
    if (e.team === 'enemy') b.kills.elites++; else b.losses.elites++;
    if (e === b.lord && b.throne && b.throne.alive && !b.result) {
      // PLAN 10.2: beating the Lord before the throne falls allows recruiting
      b.lordBeatenFirst = true;
      if (b.spec.warlord) this.banner(`${(b.spec.lordName || 'the warlord').toUpperCase()} FALLS`, 'now the throne', '#ffd54a');
      else this.banner(`${(b.spec.lordName || 'the Lord').toUpperCase()} YIELDS`, b.spec.kind === 'castle' ? 'beaten first: can be recruited  ·  now the throne' : 'the castle is leaderless', '#4fe08a');
    } else if (e === b.captain && !b.result) {
      this.banner(`${(b.spec.captainName || 'the Captain').toUpperCase()} FALLS`, b.gates.some((s) => s.alive) ? 'now break the gate' : '', '#4fe08a');
    } else if (e === b.leader && !b.result) {
      this.banner('THE COMMANDER FALLS', 'their army can break', '#4fe08a');
    }
    this.sfx.die();
    this.burst(e.x, e.y, e.z + e.def.height * 0.5, 22, e.def.accent);
    this.ring(e.x, e.y, e.z, 8, 70, e.def.accent);
    this.shake(4 * TUNING.shakeScale);
    this.hitstop(4 * TUNING.hitstopScale);
    if (this.player.lock === e) this.player.lock = null;
  }

  /** The warlord's Howl: a Thornhound pack at his side, while fewer than WAR.howlMaxHounds hounds are on the field. */
  warlordHowl(e: Enemy) {
    const a = this.army, hi = UNIT_ORDER.indexOf('hound');
    let n = 0;
    for (let i = 0; i < a.cap; i++) if (a.alive[i] && a.type[i] === hi && a.team[i] === TEAM_ENEMY) n++;
    if (n >= WAR.howlMaxHounds) return;
    for (let k = 0; k < WAR.houndPack; k++) {
      const ang = (k / WAR.houndPack) * Math.PI * 2;
      // the pack comes at his call even past the live cap (6 at most, WAR.howlMaxHounds on the field)
      if (a.spawn('hound', 'enemy', e.x + Math.cos(ang) * 70, e.y + Math.sin(ang) * 70, this.battle.spec.tier, true) < 0) a.addReserve('enemy', 'hound');
    }
    this.toast('THE HOUNDS ANSWER');
  }

  onPlayerDeath() {
    this.deathT = 0;
    this.shake(14);
    this.hitstop(12);
    this.save();
  }

  /** Test field only: back on your feet and the field starts over. (Real battles end in the results screen.) */
  recoverFromDeath() {
    this.player = new Player();
    applySave(this.player, loadSave());
    this.particles.length = 0;
    this.floats.length = 0;
    this.deathT = 0;
    this.comboCount = 0;
    this.menuMode = 'root';
    this.menuIndex = 0;
    this.input.suppressMove = false;
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
    if (this.menuTab === MENU_FORGE && inList) {
      const i = Math.floor((tap.y - MENU_LIST.y - MENU_LIST.pad) / SYNTH_ROW_H);
      const list = this.synthEntries();
      if (i >= 0 && i < list.length) {
        if (this.synthIndex === i) this.craft(list[i]); else { this.synthIndex = i; this.sfx.guard(); }
        return true;
      }
    }
    if (this.menuTab === MENU_KNIGHT) {
      for (let i = 0; i < KNIGHT_UPGRADES.length; i++) {
        const r = knightRowAt(i);
        if (tap.x < r.x || tap.x > r.x + KNIGHT_ROW.w || tap.y < r.y || tap.y > r.y + KNIGHT_ROW.h) continue;
        if (this.knightIndex === i) this.buyUpgrade(KNIGHT_UPGRADES[i].id); else { this.knightIndex = i; this.sfx.guard(); }
        return true;
      }
    }
    if (this.menuTab === MENU_TALENTS) {
      const nb = BRANCHES.length, colW = talentColW();
      for (let b = 0; b < nb; b++) {
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
    if (this.screen === 'campaign' || this.battleFrom === 'map') this.trackGold();
    writeSave({
      skillPoints: p.skillPoints, upgrades: p.upgrades, gold: p.gold,
      inv: p.inv, weapons: p.ownedWeapons, armors: p.ownedArmors,
      weapon: p.weapon.id, armor: p.armor.id, talents: p.talents,
      potions: p.potions, ethers: p.ethers,
      hero: this.heroStyle, blade: this.bladeStyle,
      war: this.camp.save(),
      econ: this.war.save(),
      difficulty: this.war.difficulty, ng: this.war.ng, stats: this.war.stats, story: this.storyFlags.slice(), at: Date.now(),
    });
  }

  resetSave() {
    writeSave(freshSave());
    this.camp.reset();
    this.war.reset();
    this.mapSel = -1; this.mapConvoy = -1; this.mapZoom = this.mapZoomTo = 0;
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
    if (this.screen === 'battle' && this.battleFrom === 'map' && this.comboCount > this.war.stats.bestCombo) this.war.stats.bestCombo = this.comboCount;
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
    + '<button data-act="mass">100 v 100 minions</button>'
    + '<button data-act="sandbox">Battle list (one of each)</button>'
    + '<button data-act="enemyArmy">Dominion army (map)</button>'
    + '<button data-act="mats">+50 all materials</button>'
    + '<button data-act="sp">+10 SP</button>'
    + '<button data-act="god">God mode: off</button>'
    + '<button data-act="auto">Autopilot: off</button>'
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
          for (const e of g.enemies) if (e.alive && e.team === 'enemy') e.applyDamage(g, 999999, 0, 0, 0, 0);
          for (let i = 0; i < g.army.cap; i++) if (g.army.alive[i] && g.army.team[i] === TEAM_ENEMY) g.army.hurt(g, i, 999999, 0, 0, false);
          break;
        case 'sandbox': g.enterSandbox(); break;
        case 'enemyArmy': if (g.screen === 'campaign') g.debugEnemyArmy(); else g.toast('OPEN THE MAP FIRST'); break;
        case 'mass': if (g.screen === 'battle') g.massTest(100); else g.toast('START A BATTLE FIRST'); break;
        case 'mats':
          for (const m of MAT_ORDER) g.player.inv[m] = (g.player.inv[m] || 0) + 50;
          g.toast('MATERIALS ADDED'); g.save();
          break;
        case 'sp':
          g.player.skillPoints += 10;
          g.toast('+10 SP'); g.save();
          break;
        case 'god': g.god = !g.god; btn.textContent = `God mode: ${g.god ? 'on' : 'off'}`; break;
        case 'auto': g.autopilot = !g.autopilot; btn.textContent = `Autopilot: ${g.autopilot ? 'on' : 'off'}`; break;
        case 'reset': g.resetSave(); if (g.screen !== 'title') g.enterCampaign(); break;
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
