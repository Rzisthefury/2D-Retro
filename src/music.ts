/* =========================================================================
 * music.ts — melodic neoclassical metal, synthesised live.
 *
 * Melody-first: the twin leads and the harpsichord carry the tune, the
 * guitar is a bed underneath them, and there are no blast beats anywhere.
 * Five intensity layers still ride the fight, but the top of the ladder is
 * "driving", not "assault". Sections rotate in a reshuffled order so the
 * loop never lands the same way twice.
 * ========================================================================= */

const SCALE = [0, 2, 3, 5, 7, 8, 11]; // A harmonic minor
const ROOT_HZ = 55;                    // A1

function scaleHz(deg: number, oct: number): number {
  const o = Math.floor(deg / 7);
  const d = ((deg % 7) + 7) % 7;
  return ROOT_HZ * Math.pow(2, (SCALE[d] + (oct + o) * 12) / 12);
}

function semiHz(semi: number, oct: number): number {
  return ROOT_HZ * Math.pow(2, (semi + oct * 12) / 12);
}

/* ------------------------------------------------------------- patterns */

// 16 slots per bar. 0 rest · 1 muted chug · 2 sustained power chord ·
// 3 octave pop · 4 tremolo. The guitar sits under the melody, so most of
// these are sparse on purpose.
const RIFFS: number[][] = [
  [2, 0, 0, 0, 0, 0, 0, 0, 2, 0, 0, 0, 0, 0, 0, 0], // sustained, twice a bar
  [1, 0, 1, 0, 1, 0, 1, 1, 1, 0, 1, 0, 2, 0, 0, 0], // light gallop
  [4, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4], // tremolo — used sparingly
  [2, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1, 1], // half-time
  [1, 0, 0, 1, 0, 1, 0, 0, 2, 0, 0, 0, 0, 1, 0, 0], // syncopated
  [2, 0, 1, 0, 1, 0, 1, 0, 2, 0, 1, 0, 1, 0, 1, 1], // driving eighths
];

interface Section {
  id: string;
  chords: number[];   // one root offset (semitones from key) per bar
  riff: number[];     // index into RIFFS, per bar
  lead: boolean;      // the melody plays here regardless of intensity
  sweep: boolean;     // neoclassical run instead of a sung melody
  half: boolean;      // half-time feel
}

const SECTIONS: Record<string, Section> = {
  A: { id: 'A', chords: [0, 0, 8, 10], riff: [0, 0, 5, 5], lead: true, sweep: false, half: false },
  B: { id: 'B', chords: [0, 3, 5, 7], riff: [1, 1, 0, 5], lead: true, sweep: false, half: false },
  C: { id: 'C', chords: [8, 10, 0, 0], riff: [2, 2, 5, 5], lead: true, sweep: false, half: false },
  D: { id: 'D', chords: [0, 5, 8, 3], riff: [0, 0, 5, 1], lead: true, sweep: false, half: false },
  E: { id: 'E', chords: [0, 0, 10, 8], riff: [3, 3, 3, 4], lead: false, sweep: false, half: true },
  F: { id: 'F', chords: [0, 8, 5, 11], riff: [5, 5, 2, 2], lead: true, sweep: true, half: false },
};

// Lead phrases as [scale degree, length in 16ths]; degrees run past 7 for the
// octave above. These are the tune — everything else accompanies them.
const PHRASES: number[][][] = [
  [[7, 2], [6, 2], [4, 2], [6, 2], [7, 4], [9, 4]],
  [[9, 2], [8, 1], [7, 1], [6, 2], [4, 2], [7, 4], [6, 4]],
  [[4, 4], [6, 2], [7, 2], [9, 4], [8, 2], [7, 2]],
  [[11, 2], [9, 2], [7, 2], [6, 2], [7, 2], [9, 2], [11, 4]],
  [[7, 4], [9, 4], [8, 2], [7, 2], [6, 4]],
  [[6, 2], [7, 2], [9, 4], [11, 2], [9, 2], [7, 4]],
];

/* --------------------------------------------------------------- engine */

interface Voice { a: OscillatorNode; b: OscillatorNode; g: GainNode; }

class Music {
  private ctx: AudioContext | null = null;
  private started = false;
  muted = false;
  volume = 0.3;

  bpm = 132;
  private step = 0;
  private nextTime = 0;
  private timer: number | null = null;

  target = 1;          // requested intensity 0-4
  private level = 1;   // applied at bar boundaries
  private order: string[] = [];
  private orderIdx = 0;
  private phraseIdx = 0;

  private master!: GainNode;
  private busGtr!: GainNode;
  private busLead!: GainNode;
  private busBass!: GainNode;
  private busKeys!: GainNode;
  private busDrum!: GainNode;

  private gRoot!: Voice;
  private gFifth!: Voice;
  private bass!: Voice;
  private lead1!: Voice;
  private lead2!: Voice;
  private noise!: AudioBuffer;

  get sectionId(): string { return this.order[this.orderIdx] || 'A'; }
  get intensity(): number { return this.level; }
  get running(): boolean { return this.started && !this.muted; }

  /* ---------------------------------------------------------- lifecycle */

  start() {
    if (this.started) return;
    const ctx = sharedAudio();
    if (!ctx) return;
    this.ctx = ctx;
    this.build(ctx);
    this.reshuffle();
    this.started = true;
    this.nextTime = ctx.currentTime + 0.1;
    this.timer = window.setInterval(() => this.pump(), 25);
  }

  stop() {
    if (this.timer !== null) { clearInterval(this.timer); this.timer = null; }
    this.started = false;
    if (this.master) this.master.gain.value = 0;
  }

  setMuted(m: boolean) {
    this.muted = m;
    if (this.master && this.ctx) {
      this.master.gain.setTargetAtTime(m ? 0 : this.volume, this.ctx.currentTime, 0.05);
    }
  }

  setVolume(v: number) {
    this.volume = clamp(v, 0, 1);
    if (this.master && this.ctx && !this.muted) {
      this.master.gain.setTargetAtTime(this.volume, this.ctx.currentTime, 0.05);
    }
  }

  /* --------------------------------------------------------------- graph */

  private drive(amount: number): WaveShaperNode {
    const ws = this.ctx!.createWaveShaper();
    const n = 1024;
    const curve = new Float32Array(n);
    const k = amount;
    for (let i = 0; i < n; i++) {
      const x = (i / (n - 1)) * 2 - 1;
      curve[i] = ((1 + k) * x) / (1 + k * Math.abs(x));
    }
    ws.curve = curve;
    ws.oversample = '2x';
    return ws;
  }

  /** Cabinet sim: roll off the fizz up top and the mud down low. */
  private cab(lo: number, hi: number): [BiquadFilterNode, BiquadFilterNode] {
    const hp = this.ctx!.createBiquadFilter();
    hp.type = 'highpass'; hp.frequency.value = lo;
    const lp = this.ctx!.createBiquadFilter();
    lp.type = 'lowpass'; lp.frequency.value = hi; lp.Q.value = 0.7;
    hp.connect(lp);
    return [hp, lp];
  }

  private makeVoice(bus: AudioNode, type: OscillatorType, detune: number): Voice {
    const ctx = this.ctx!;
    const g = ctx.createGain();
    g.gain.value = 0;
    const a = ctx.createOscillator();
    const b = ctx.createOscillator();
    a.type = type; b.type = type;
    a.detune.value = -detune; b.detune.value = detune;
    a.frequency.value = 110; b.frequency.value = 110;
    a.connect(g); b.connect(g);
    g.connect(bus);
    a.start(); b.start();
    return { a, b, g };
  }

  private build(ctx: AudioContext) {
    this.master = ctx.createGain();
    this.master.gain.value = this.muted ? 0 : this.volume;
    const comp = ctx.createDynamicsCompressor();
    comp.threshold.value = -18;
    comp.ratio.value = 4;
    comp.attack.value = 0.004;
    comp.release.value = 0.2;
    this.master.connect(comp);
    comp.connect(ctx.destination);

    // rhythm guitar — moderate drive, it is accompaniment not the hook
    this.busGtr = ctx.createGain(); this.busGtr.gain.value = 0;
    const gDrive = this.drive(26);
    const [gHp, gLp] = this.cab(100, 2800);
    this.busGtr.connect(gDrive); gDrive.connect(gHp); gLp.connect(this.master);
    this.gRoot = this.makeVoice(this.busGtr, 'sawtooth', 7);
    this.gFifth = this.makeVoice(this.busGtr, 'sawtooth', 10);

    // lead — the melody. Light drive, generous echo, sits on top of the mix.
    this.busLead = ctx.createGain(); this.busLead.gain.value = 0;
    const lDrive = this.drive(14);
    const [lHp, lLp] = this.cab(200, 5000);
    const delay = ctx.createDelay(1);
    delay.delayTime.value = (60 / this.bpm) * 0.75; // dotted eighth
    const fb = ctx.createGain(); fb.gain.value = 0.28;
    const wet = ctx.createGain(); wet.gain.value = 0.34;
    this.busLead.connect(lDrive); lDrive.connect(lHp);
    lLp.connect(this.master);
    lLp.connect(delay); delay.connect(fb); fb.connect(delay); delay.connect(wet); wet.connect(this.master);
    this.lead1 = this.makeVoice(this.busLead, 'square', 3);
    this.lead2 = this.makeVoice(this.busLead, 'square', 8);

    // bass
    this.busBass = ctx.createGain(); this.busBass.gain.value = 0;
    const bDrive = this.drive(7);
    const [bHp, bLp] = this.cab(38, 1500);
    this.busBass.connect(bDrive); bDrive.connect(bHp); bLp.connect(this.master);
    this.bass = this.makeVoice(this.busBass, 'sawtooth', 3);

    // keys — harpsichord plucks and a string pad
    this.busKeys = ctx.createGain(); this.busKeys.gain.value = 0;
    const kLp = ctx.createBiquadFilter();
    kLp.type = 'lowpass'; kLp.frequency.value = 5000;
    this.busKeys.connect(kLp); kLp.connect(this.master);

    // drums
    this.busDrum = ctx.createGain(); this.busDrum.gain.value = 0;
    this.busDrum.connect(this.master);

    const len = Math.floor(ctx.sampleRate * 1);
    this.noise = ctx.createBuffer(1, len, ctx.sampleRate);
    const d = this.noise.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
  }

  /* ------------------------------------------------------------ schedule */

  private reshuffle() {
    // Melodic sections dominate the pool; the sweep section appears once.
    const pool = ['A', 'B', 'D', 'A', 'C', 'B', 'E', 'D', 'A', 'F'];
    for (let i = pool.length - 1; i > 0; i--) {
      const j = 1 + Math.floor(Math.random() * i);
      const t = pool[i]; pool[i] = pool[j]; pool[j] = t;
    }
    pool.unshift('A');
    this.order = pool.filter((s, i) => i === 0 || s !== pool[i - 1]);
    this.orderIdx = 0;
  }

  private pump() {
    const ctx = this.ctx;
    if (!ctx || !this.started) return;
    if (ctx.state === 'suspended') { ctx.resume().catch(() => {}); return; }
    const stepDur = 60 / this.bpm / 4;
    let guard = 0;
    while (this.nextTime < ctx.currentTime + 0.2 && guard++ < 64) {
      this.scheduleStep(this.step, this.nextTime, stepDur);
      this.nextTime += stepDur;
      this.step++;
    }
  }

  private scheduleStep(step: number, t: number, stepDur: number) {
    const inBar = step % 16;
    const bar = Math.floor(step / 16) % 4;

    if (step % 16 === 0 && bar === 0) {
      if (step > 0) {
        this.orderIdx++;
        if (this.orderIdx >= this.order.length) this.reshuffle();
      }
      this.phraseIdx = (this.phraseIdx + 1) % PHRASES.length;
    }
    if (inBar === 0) this.applyLevel(t);

    const sec = SECTIONS[this.sectionId] || SECTIONS.A;
    const chord = sec.chords[bar];
    const L = this.level;

    this.scheduleGuitar(sec, chord, bar, inBar, t, stepDur, L);
    this.scheduleBass(sec, chord, inBar, t, stepDur, L);
    this.scheduleDrums(sec, inBar, t, L);
    this.scheduleKeys(sec, chord, inBar, t, stepDur, L);
    if (L >= 2 || sec.lead) this.scheduleLead(sec, chord, bar, inBar, t, stepDur, L);
  }

  /**
   * Layer gains, set on bar lines only. The guitar tops out well below the
   * lead — melody first was the brief, so the mix enforces it.
   */
  private applyLevel(t: number) {
    this.level = Math.round(clamp(this.target, 0, 4));
    const L = this.level;
    const set = (n: GainNode, v: number) => n.gain.setTargetAtTime(v, t, 0.12);
    set(this.busGtr, L <= 0 ? 0 : L === 1 ? 0.10 : L === 2 ? 0.15 : L === 3 ? 0.19 : 0.21);
    set(this.busBass, L <= 0 ? 0.05 : 0.24);
    set(this.busDrum, L <= 0 ? 0 : L === 1 ? 0.24 : L === 2 ? 0.36 : 0.42);
    set(this.busKeys, L <= 0 ? 0.40 : L === 1 ? 0.30 : L === 2 ? 0.24 : 0.18);
    set(this.busLead, L <= 0 ? 0.10 : L === 1 ? 0.16 : L === 2 ? 0.22 : 0.26);
  }

  private note(v: Voice, freq: number, t: number, dur: number, peak: number, mute: boolean) {
    v.a.frequency.setValueAtTime(freq, t);
    v.b.frequency.setValueAtTime(freq, t);
    const g = v.g.gain;
    g.cancelScheduledValues(t);
    g.setValueAtTime(Math.max(0.0001, g.value), t);
    g.linearRampToValueAtTime(peak, t + 0.006);
    if (mute) {
      g.exponentialRampToValueAtTime(Math.max(0.0001, peak * 0.25), t + 0.035);
      g.exponentialRampToValueAtTime(0.0001, t + Math.min(dur, 0.085));
    } else {
      g.setValueAtTime(peak, t + Math.max(0.01, dur * 0.6));
      g.exponentialRampToValueAtTime(0.0001, t + dur);
    }
  }

  private scheduleGuitar(sec: Section, chord: number, bar: number, inBar: number, t: number, stepDur: number, L: number) {
    if (L <= 0) return;
    let pat = RIFFS[sec.riff[bar]];
    // Tremolo is the most aggressive thing the guitar does — only at the top.
    if (L < 3 && pat === RIFFS[2]) pat = RIFFS[5];
    const v = pat[inBar];
    if (!v) return;
    if (L === 1 && v === 1 && inBar % 4 !== 0) return; // thin the mutes out when calm

    const rootF = semiHz(chord, 1);
    const fifthF = semiHz(chord + 7, 1);
    const sustained = v === 2;
    const dur = sustained ? stepDur * 6 : v === 4 ? stepDur * 0.9 : stepDur * 0.8;
    const mute = v === 1;
    const peak = sustained ? 0.30 : v === 3 ? 0.24 : 0.22;

    this.note(this.gRoot, v === 3 ? rootF * 2 : rootF, t, dur, peak, mute);
    this.note(this.gFifth, v === 3 ? fifthF * 2 : fifthF, t, dur, peak * 0.7, mute);
  }

  private scheduleBass(sec: Section, chord: number, inBar: number, t: number, stepDur: number, L: number) {
    if (L <= 0 && inBar % 8 !== 0) return;
    if (inBar % 2 !== 0) return;              // straight eighths, no 16th runs
    if (sec.half && inBar % 4 !== 0) return;
    const f = semiHz(chord, 0);
    this.note(this.bass, f, t, stepDur * 1.7, 0.5, false);
  }

  private hit(bufGain: number, t: number, dur: number, hp: number, lp: number) {
    const ctx = this.ctx!;
    const src = ctx.createBufferSource();
    src.buffer = this.noise;
    const f1 = ctx.createBiquadFilter(); f1.type = 'highpass'; f1.frequency.value = hp;
    const f2 = ctx.createBiquadFilter(); f2.type = 'lowpass'; f2.frequency.value = lp;
    const g = ctx.createGain();
    g.gain.setValueAtTime(bufGain, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    src.connect(f1); f1.connect(f2); f2.connect(g); g.connect(this.busDrum);
    src.start(t, Math.random() * 0.5);
    src.stop(t + dur + 0.02);
  }

  private kick(t: number) {
    const ctx = this.ctx!;
    const o = ctx.createOscillator();
    const g = ctx.createGain();
    o.type = 'sine';
    o.frequency.setValueAtTime(145, t);
    o.frequency.exponentialRampToValueAtTime(46, t + 0.08);
    g.gain.setValueAtTime(0.9, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.14);
    o.connect(g); g.connect(this.busDrum);
    o.start(t); o.stop(t + 0.16);
  }

  private snare(t: number, ghost: boolean) {
    const ctx = this.ctx!;
    this.hit(ghost ? 0.10 : 0.44, t, ghost ? 0.04 : 0.15, 1400, 8500);
    const o = ctx.createOscillator();
    const g = ctx.createGain();
    o.type = 'triangle';
    o.frequency.setValueAtTime(195, t);
    o.frequency.exponentialRampToValueAtTime(150, t + 0.07);
    g.gain.setValueAtTime(ghost ? 0.05 : 0.18, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.08);
    o.connect(g); g.connect(this.busDrum);
    o.start(t); o.stop(t + 0.1);
  }

  /** A groove at every level. No blast beats — the top of the ladder drives. */
  private scheduleDrums(sec: Section, inBar: number, t: number, L: number) {
    if (L <= 0) return;

    if (sec.half) {
      if (inBar === 0 || inBar === 6) this.kick(t);
      if (inBar === 8) this.snare(t, false);
      if (inBar % 4 === 0) this.hit(0.09, t, 0.2, 4000, 14000);
      return;
    }

    if (L === 1) {
      if (inBar === 0 || inBar === 8) this.kick(t);
      if (inBar === 8) this.snare(t, false);
      if (inBar % 4 === 0) this.hit(0.06, t, 0.05, 7000, 15000);
      if (inBar === 0) this.hit(0.10, t, 0.4, 3500, 13000);
      return;
    }

    // backbeat on 2 and 4, ride on eighths
    if (inBar === 4 || inBar === 12) this.snare(t, false);
    else if (L >= 3 && (inBar === 7 || inBar === 15)) this.snare(t, true);

    let kickHere = inBar === 0 || inBar === 6 || inBar === 8 || inBar === 14;
    if (L >= 3 && (inBar === 2 || inBar === 10)) kickHere = true;
    if (L >= 4 && (inBar === 3 || inBar === 11)) kickHere = true; // double-kick fill, not a blast
    if (kickHere) this.kick(t);

    if (inBar % 2 === 0) this.hit(L >= 3 ? 0.07 : 0.055, t, 0.05, 7000, 15000);
    if (inBar === 0) this.hit(L >= 3 ? 0.15 : 0.11, t, 0.45, 3400, 13000);
  }

  private scheduleKeys(sec: Section, chord: number, inBar: number, t: number, stepDur: number, L: number) {
    const ctx = this.ctx!;
    if (L <= 2) {
      // harpsichord: broken chord in eighths — the baroque half of the brief,
      // and it stays audible well into combat now rather than only at rest.
      if (inBar % 2 === 0) {
        const tones = [0, 3, 7, 12, 7, 3];
        const semi = chord + tones[(inBar / 2) % tones.length];
        const o = ctx.createOscillator();
        const g = ctx.createGain();
        o.type = 'square';
        o.frequency.value = semiHz(semi, 3);
        g.gain.setValueAtTime(0.0001, t);
        g.gain.linearRampToValueAtTime(0.09, t + 0.005);
        g.gain.exponentialRampToValueAtTime(0.0001, t + stepDur * 3);
        o.connect(g); g.connect(this.busKeys);
        o.start(t); o.stop(t + stepDur * 3.2);
      }
    }
    if (inBar === 0) {
      // string pad holding the chord underneath everything
      for (const semi of [chord, chord + 7, chord + 12]) {
        const o = ctx.createOscillator();
        const g = ctx.createGain();
        o.type = 'sawtooth';
        o.frequency.value = semiHz(semi, 2);
        o.detune.value = rnd(-6, 6);
        const bar = stepDur * 16;
        g.gain.setValueAtTime(0.0001, t);
        g.gain.linearRampToValueAtTime(0.06, t + bar * 0.35);
        g.gain.linearRampToValueAtTime(0.0001, t + bar * 1.05);
        o.connect(g); g.connect(this.busKeys);
        o.start(t); o.stop(t + bar * 1.1);
      }
    }
  }

  private scheduleLead(sec: Section, chord: number, bar: number, inBar: number, t: number, stepDur: number, L: number) {
    if (sec.sweep && L >= 3) {
      // Neoclassical run — eighths with rests, not a wall of sixteenths.
      if (inBar % 2 !== 0) return;
      const shape = [0, 3, 7, 12, 15, 12, 7, 3];
      const semi = chord + shape[(inBar / 2) % shape.length];
      this.note(this.lead1, semiHz(semi, 3), t, stepDur * 1.8, 0.26, false);
      this.note(this.lead2, semiHz(semi + 3, 3), t, stepDur * 1.8, 0.15, false);
      return;
    }

    // The tune, harmonised a third above.
    const phrase = PHRASES[(this.phraseIdx + bar) % PHRASES.length];
    let cursor = 0;
    for (const [deg, len] of phrase) {
      if (cursor === inBar) {
        this.note(this.lead1, scaleHz(deg, 2), t, stepDur * len * 0.95, 0.30, false);
        this.note(this.lead2, scaleHz(deg + 2, 2), t, stepDur * len * 0.95, L >= 3 ? 0.19 : 0.14, false);
        return;
      }
      cursor += len;
      if (cursor > inBar) return;
    }
  }
}
