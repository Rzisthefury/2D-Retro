/* =========================================================================
 * core.ts — math helpers, RNG, buffered input, and a tiny WebAudio synth.
 * ========================================================================= */

/* ------------------------------------------------------------------ math */

function clamp(v: number, lo: number, hi: number): number {
  return v < lo ? lo : v > hi ? hi : v;
}

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

/** Shortest-path angle interpolation, so turning never takes the long way. */
function angleLerp(a: number, b: number, t: number): number {
  let d = ((b - a + Math.PI) % (Math.PI * 2)) - Math.PI;
  if (d < -Math.PI) d += Math.PI * 2;
  return a + d * clamp(t, 0, 1);
}

function angleDiff(a: number, b: number): number {
  let d = ((b - a + Math.PI) % (Math.PI * 2)) - Math.PI;
  if (d < -Math.PI) d += Math.PI * 2;
  return d;
}

function dist(ax: number, ay: number, bx: number, by: number): number {
  const dx = bx - ax, dy = by - ay;
  return Math.sqrt(dx * dx + dy * dy);
}

function rnd(a: number, b: number): number {
  return a + Math.random() * (b - a);
}

function rndInt(a: number, b: number): number {
  return Math.floor(rnd(a, b + 1));
}

function pick<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)];
}

function pickWeighted<T extends { weight: number }>(arr: T[]): T {
  let total = 0;
  for (const a of arr) total += a.weight;
  let r = Math.random() * total;
  for (const a of arr) { r -= a.weight; if (r < 0) return a; }
  return arr[arr.length - 1];
}

/* ----------------------------------------------------------------- input */

// Coarse pointer means a phone or tablet: the game switches to touch controls,
// auto lock-on and a fullscreen layout.
const IS_TOUCH = (() => {
  try {
    return window.matchMedia('(pointer: coarse)').matches || 'ontouchstart' in window;
  } catch { return false; }
})();

type Action =
  | 'attack' | 'jump' | 'lock' | 'dash' | 'menu' | 'magic'
  | 'up' | 'down' | 'left' | 'right'
  | 'confirm' | 'cancel'
  | 'spell1' | 'spell2' | 'spell3' | 'spell4' | 'spell5'
  | 'item' | 'pause' | 'debug' | 'restart' | 'mute';

const KEYMAP: Record<string, Action> = {
  KeyJ: 'attack', Space: 'jump', KeyK: 'jump', KeyL: 'lock',
  ShiftLeft: 'dash', ShiftRight: 'dash', Tab: 'menu',
  ArrowUp: 'up', ArrowDown: 'down', ArrowLeft: 'left', ArrowRight: 'right',
  Enter: 'confirm', Escape: 'cancel', Backspace: 'cancel',
  Digit1: 'spell1', Digit2: 'spell2', Digit3: 'spell3', Digit4: 'spell4', Digit5: 'spell5',
  KeyQ: 'item', KeyP: 'pause', Backquote: 'debug', KeyR: 'restart', KeyM: 'mute',
};

// Movement is read separately so WASD can coexist with the arrow-key menu.
const MOVE_KEYS = { up: ['KeyW'], down: ['KeyS'], left: ['KeyA'], right: ['KeyD'] };

interface BufferedInput { action: Action; frame: number; }

class InputState {
  held = new Set<string>();
  pressed = new Set<Action>();      // edge, cleared every tick
  buffer: BufferedInput[] = [];
  frame = 0;
  gamepadIndex = -1;
  private prevPad: boolean[] = [];
  padAxis = { x: 0, y: 0 };

  // touch
  private canvas: HTMLCanvasElement | null = null;
  stick = { active: false, id: -1, ox: 0, oy: 0, x: 0, y: 0 };
  heldBtns = new Map<number, string>();   // pointerId -> button id
  litBtns = new Set<string>();            // for rendering
  touchChip = -1;                         // spell chip tapped this tick, -1 = none
  uiMode = false;                         // a full-screen UI owns the taps
  lastTap: { x: number; y: number } | null = null;

  attach(target: HTMLElement | Window) {
    window.addEventListener('keydown', (e) => {
      if (e.repeat) return;
      const code = e.code;
      if (KEYMAP[code] || this.isMoveKey(code)) e.preventDefault();
      this.held.add(code);
      const a = KEYMAP[code];
      if (a) this.press(a);
    });
    window.addEventListener('keyup', (e) => this.held.delete(e.code));
    window.addEventListener('blur', () => this.held.clear());
    window.addEventListener('gamepadconnected', (e: any) => { this.gamepadIndex = e.gamepad.index; });
    window.addEventListener('gamepaddisconnected', () => { this.gamepadIndex = -1; });
    if (target instanceof HTMLCanvasElement) this.attachTouch(target);
  }

  /* ----------------------------------------------------------- touch */

  private toLogical(e: PointerEvent): { x: number; y: number } {
    const c = this.canvas!;
    const r = c.getBoundingClientRect();
    return {
      x: ((e.clientX - r.left) / Math.max(1, r.width)) * VIEW_W,
      y: ((e.clientY - r.top) / Math.max(1, r.height)) * VIEW_H,
    };
  }

  private buttonAt(x: number, y: number): string | null {
    for (const b of TOUCH_BTNS) {
      if (Math.hypot(x - b.x, y - b.y) <= b.r + 8) return b.id;
    }
    if (Math.hypot(x - TOUCH_MENU.x, y - TOUCH_MENU.y) <= TOUCH_MENU.r + 10) return 'menu';
    for (let i = 0; i < 4; i++) {
      const cy = TOUCH_CHIPS.y + i * TOUCH_CHIPS.dy;
      if (Math.hypot(x - TOUCH_CHIPS.x, y - cy) <= TOUCH_CHIPS.r + 10) return 'chip' + i;
    }
    return null;
  }

  attachTouch(canvas: HTMLCanvasElement) {
    this.canvas = canvas;

    canvas.addEventListener('pointerdown', (e) => {
      const p = this.toLogical(e);
      this.lastTap = { x: p.x, y: p.y };
      if (this.uiMode) return;            // menus read lastTap instead
      if (e.pointerType === 'mouse' && !IS_TOUCH) return;  // no thumbstick for a mouse
      e.preventDefault();
      // Safari throws here for pointers it no longer considers active, and an
      // uncaught throw would swallow the rest of the press.
      try { canvas.setPointerCapture(e.pointerId); } catch { /* not fatal */ }
      const hit = this.buttonAt(p.x, p.y);

      if (hit) {
        this.heldBtns.set(e.pointerId, hit);
        this.litBtns.add(hit);
        if (hit.startsWith('chip')) this.touchChip = parseInt(hit.slice(4), 10);
        else this.press(hit as Action);
        return;
      }
      // Anywhere else on the left side is a floating thumbstick: the base
      // appears under your thumb rather than making you find a fixed circle.
      if (p.x < VIEW_W * 0.5 && !this.stick.active) {
        this.stick.active = true;
        this.stick.id = e.pointerId;
        this.stick.ox = p.x; this.stick.oy = p.y;
        this.stick.x = 0; this.stick.y = 0;
      }
    }, { passive: false });

    const move = (e: PointerEvent) => {
      if (!this.stick.active || e.pointerId !== this.stick.id) return;
      e.preventDefault();
      const p = this.toLogical(e);
      let dx = p.x - this.stick.ox;
      let dy = p.y - this.stick.oy;
      const m = Math.hypot(dx, dy);
      const r = TOUCH_STICK.r;
      if (m > r) { dx = (dx / m) * r; dy = (dy / m) * r; }
      const nx = dx / r, ny = dy / r;
      const nm = Math.hypot(nx, ny);
      if (nm < TOUCH_STICK.dead) { this.stick.x = 0; this.stick.y = 0; }
      else { this.stick.x = nx; this.stick.y = ny; }
    };
    canvas.addEventListener('pointermove', move, { passive: false });

    const up = (e: PointerEvent) => {
      if (this.stick.active && e.pointerId === this.stick.id) {
        this.stick.active = false; this.stick.id = -1; this.stick.x = 0; this.stick.y = 0;
      }
      const b = this.heldBtns.get(e.pointerId);
      if (b !== undefined) { this.heldBtns.delete(e.pointerId); this.litBtns.delete(b); }
    };
    canvas.addEventListener('pointerup', up);
    canvas.addEventListener('pointercancel', up);
    canvas.addEventListener('contextmenu', (e) => e.preventDefault());
  }

  /** Holding ATK keeps the combo going without machine-gun tapping. */
  pollTouch() {
    if (!this.heldBtns.size) return;
    const held = new Set(this.heldBtns.values());
    if (held.has('attack') && this.frame % 9 === 0) this.press('attack');
    if (held.has('dash') && this.frame % 20 === 0) this.press('dash');
  }

  touchHeld(id: string): boolean { return this.litBtns.has(id); }

  /** Read and clear the most recent tap, for whichever UI is on screen. */
  takeTap(): { x: number; y: number } | null {
    const t = this.lastTap;
    this.lastTap = null;
    return t;
  }

  private isMoveKey(code: string): boolean {
    return MOVE_KEYS.up.includes(code) || MOVE_KEYS.down.includes(code)
      || MOVE_KEYS.left.includes(code) || MOVE_KEYS.right.includes(code);
  }

  press(a: Action) {
    this.pressed.add(a);
    this.buffer.push({ action: a, frame: this.frame });
    if (this.buffer.length > 40) this.buffer.shift();
  }

  /** Poll gamepad and synthesise edge presses so pad and keyboard behave alike. */
  pollPad() {
    if (this.gamepadIndex < 0 || !navigator.getGamepads) return;
    const gp = navigator.getGamepads()[this.gamepadIndex];
    if (!gp) return;
    const map: [number, Action][] = [
      [0, 'jump'], [2, 'attack'], [1, 'cancel'], [3, 'confirm'],
      [12, 'up'], [13, 'down'], [14, 'left'], [15, 'right'],
      [6, 'lock'], [7, 'dash'], [5, 'dash'], [4, 'spell1'], [9, 'pause'], [8, 'menu'],
    ];
    for (const [btn, action] of map) {
      const down = !!gp.buttons[btn] && gp.buttons[btn].pressed;
      if (down && !this.prevPad[btn]) this.press(action);
      this.prevPad[btn] = down;
    }
    const dz = (v: number) => (Math.abs(v) < 0.22 ? 0 : v);
    this.padAxis.x = dz(gp.axes[0] || 0);
    this.padAxis.y = dz(gp.axes[1] || 0);
  }

  /** Consume a buffered press if it happened inside the buffer window. */
  consume(action: Action): boolean {
    const window = TUNING.bufferFrames;
    for (let i = this.buffer.length - 1; i >= 0; i--) {
      const b = this.buffer[i];
      if (b.action === action && this.frame - b.frame <= window) {
        this.buffer.splice(i, 1);
        return true;
      }
    }
    return false;
  }

  peek(action: Action): boolean {
    const window = TUNING.bufferFrames;
    return this.buffer.some((b) => b.action === action && this.frame - b.frame <= window);
  }

  clearBuffer() { this.buffer.length = 0; }

  wasPressed(a: Action): boolean { return this.pressed.has(a); }

  isHeld(code: string): boolean { return this.held.has(code); }

  /** Normalised movement vector from WASD, the pad stick, or a thumb. */
  moveVector(): { x: number; y: number } {
    if (this.stick.active && (this.stick.x || this.stick.y)) {
      return { x: this.stick.x, y: this.stick.y };
    }
    let x = 0, y = 0;
    if (MOVE_KEYS.left.some((k) => this.held.has(k))) x -= 1;
    if (MOVE_KEYS.right.some((k) => this.held.has(k))) x += 1;
    if (MOVE_KEYS.up.some((k) => this.held.has(k))) y -= 1;
    if (MOVE_KEYS.down.some((k) => this.held.has(k))) y += 1;
    if (x === 0 && y === 0) { x = this.padAxis.x; y = this.padAxis.y; }
    const m = Math.hypot(x, y);
    if (m > 1) { x /= m; y /= m; }
    return { x, y };
  }

  endTick() {
    this.pressed.clear();
    this.touchChip = -1;
    this.frame++;
    // Drop stale buffered inputs so they can't fire much later.
    const cutoff = this.frame - Math.max(TUNING.bufferFrames, 30);
    while (this.buffer.length && this.buffer[0].frame < cutoff) this.buffer.shift();
  }
}

/* ----------------------------------------------------------------- audio */

// One AudioContext for the whole page — sound effects and the music engine
// share it, because browsers cap how many a document may hold open.
let SHARED_AC: AudioContext | null = null;

function sharedAudio(): AudioContext | null {
  if (!SHARED_AC) {
    try {
      const Ctor = (window as any).AudioContext || (window as any).webkitAudioContext;
      if (!Ctor) return null;
      SHARED_AC = new Ctor();
    } catch { return null; }
  }
  if (SHARED_AC && SHARED_AC.state === 'suspended') SHARED_AC.resume().catch(() => {});
  return SHARED_AC;
}

class Sfx {
  private ctx: AudioContext | null = null;
  muted = false;

  private ensure(): AudioContext | null {
    if (this.muted) return null;
    this.ctx = sharedAudio();
    return this.ctx;
  }

  unlock() { this.ensure(); }

  private tone(freq: number, dur: number, type: OscillatorType, gain: number, slide = 0) {
    const ctx = this.ensure();
    if (!ctx) return;
    gain *= TUNING.sfxVolume;
    const t = ctx.currentTime;
    const o = ctx.createOscillator();
    const g = ctx.createGain();
    o.type = type;
    o.frequency.setValueAtTime(freq, t);
    if (slide) o.frequency.exponentialRampToValueAtTime(Math.max(30, freq + slide), t + dur);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(gain, t + 0.005);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g); g.connect(ctx.destination);
    o.start(t); o.stop(t + dur + 0.02);
  }

  private noise(dur: number, gain: number, hp: number) {
    const ctx = this.ensure();
    if (!ctx) return;
    gain *= TUNING.sfxVolume;
    const t = ctx.currentTime;
    const len = Math.max(1, Math.floor(ctx.sampleRate * dur));
    const buf = ctx.createBuffer(1, len, ctx.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / len);
    const src = ctx.createBufferSource();
    src.buffer = buf;
    const f = ctx.createBiquadFilter();
    f.type = 'highpass'; f.frequency.value = hp;
    const g = ctx.createGain();
    g.gain.setValueAtTime(gain, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    src.connect(f); f.connect(g); g.connect(ctx.destination);
    src.start(t);
  }

  swing() { this.noise(0.07, 0.05, 1600); }
  hit(heavy = false) {
    this.noise(heavy ? 0.16 : 0.08, heavy ? 0.16 : 0.09, heavy ? 380 : 900);
    this.tone(heavy ? 120 : 210, heavy ? 0.14 : 0.06, 'square', heavy ? 0.09 : 0.05, -60);
  }
  guard() { this.tone(880, 0.09, 'square', 0.06, 300); }
  hurt() { this.tone(150, 0.2, 'sawtooth', 0.1, -80); }
  cast(freq: number) { this.tone(freq, 0.22, 'triangle', 0.08, 320); }
  jump() { this.tone(420, 0.09, 'sine', 0.05, 200); }
  die() { this.tone(320, 0.3, 'sawtooth', 0.09, -240); }
  levelUp() {
    [523, 659, 784, 1047].forEach((f, i) => setTimeout(() => this.tone(f, 0.18, 'triangle', 0.08), i * 80));
  }
  wave() {
    [392, 523].forEach((f, i) => setTimeout(() => this.tone(f, 0.2, 'sine', 0.07), i * 110));
  }
}

/* ------------------------------------------------------------- vfx types */

interface Particle {
  x: number; y: number; z: number;
  vx: number; vy: number; vz: number;
  life: number; maxLife: number;
  size: number; color: string; gravity: number;
}

interface FloatText {
  x: number; y: number; z: number;
  vy: number; life: number; maxLife: number;
  text: string; color: string; size: number;
}

interface SlashFx {
  x: number; y: number; z: number;
  angle: number; arc: number; range: number;
  life: number; maxLife: number; color: string; width: number;
}

interface RingFx {
  x: number; y: number; z: number;
  r: number; maxR: number; life: number; maxLife: number; color: string;
}
