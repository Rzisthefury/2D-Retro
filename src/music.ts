/* =========================================================================
 * music.ts — the score. An orchestral, melody-first soundtrack in the
 * spirit of Kingdom Hearts, synthesised live: piano, strings, flute,
 * bells, harp and friends through a shared reverb.
 *
 * Every zone has its own theme (key, tempo, meter, instruments, tune).
 * Each theme is two 8-bar sections (A, B) that loop. Exploring, you hear
 * the tune over its accompaniment; when a fight starts, a combat layer
 * (drums, a driving bass, brass stabs) fades in on the next bar and the
 * melody moves to a brighter instrument — then fades back out after.
 *
 * Notation, so the tunes stay readable:
 *   chords   bars split by '|'; two chords in a bar split by a space.
 *            Roman numerals relative to the key: I ii iii IV V vi viio,
 *            with b/# prefixes and 7 / maj7 / sus4 / add9 suffixes.
 *   melody   bars split by '|'; each note is degree:eighths, e.g. 5:2.
 *            ' raises an octave, , lowers one, #/b alter; r is a rest.
 * ========================================================================= */

type Inst = 'piano' | 'bell' | 'flute' | 'strings' | 'brass' | 'harp' | 'marimba' | 'oud' | 'choir' | 'pad' | 'pizz' | 'bass';
type ArpStyle = 'flow' | 'waltz' | 'roll68' | 'slow' | 'ostinato' | 'low';

interface TrackDef {
  id: string;
  name: string;
  bpm: number;
  meter: 4 | 3 | 6;          // 4/4, 3/4, or 6/8 (felt in two)
  tonic: number;             // MIDI note of the melody's degree 1
  scale: number[];
  melody: Inst;              // who sings the tune while exploring
  lead: Inst;                // who sings it once a fight starts
  double?: Inst;             // joins the tune an octave down on alternate passes
  arp: Inst;
  arpStyle: ArpStyle;
  pad: Inst | null;
  shaker?: boolean;          // a little hand percussion even when calm
  alwaysCombat?: boolean;    // boss music never calms down
  A: { chords: string; melody: string };
  B: { chords: string; melody: string };
}

const MAJOR = [0, 2, 4, 5, 7, 9, 11];
const MINOR = [0, 2, 3, 5, 7, 8, 10];
const DORIAN = [0, 2, 3, 5, 7, 9, 10];
const LYDIAN = [0, 2, 4, 6, 7, 9, 11];
const PHRYG_DOM = [0, 1, 4, 5, 7, 8, 10];

const TRACKS: Record<string, TrackDef> = {
  // A piano lullaby: the first thing you hear.
  title: {
    id: 'title', name: "Heart's Lantern", bpm: 72, meter: 4, tonic: 74, scale: MAJOR,
    melody: 'piano', lead: 'piano', double: 'strings', arp: 'harp', arpStyle: 'flow', pad: 'pad',
    A: {
      chords: 'I | V | vi | iii | IV | I | ii | V',
      melody: "3:4 2:2 1:2 | 7,:2 1:2 2:4 | 3:3 4:1 3:2 2:2 | 3:6 r:2 | 4:4 5:2 6:2 | 5:3 4:1 3:4 | 2:2 3:2 4:2 6:2 | 5:6 r:2",
    },
    B: {
      chords: 'IV | V | iii | vi | ii | V | I | I',
      melody: "1':4 7:2 6:2 | 5:3 6:1 7:4 | 7:3 5:1 3:4 | 4:2 3:2 2:2 6,:2 | 2:3 3:1 4:4 | 5:2 4:2 3:2 2:2 | 3:4 1:4 | 1:6 r:2",
    },
  },
  // The Haven: a small-town waltz on celesta and pizzicato.
  haven: {
    id: 'haven', name: 'Lanterns of the Haven', bpm: 150, meter: 3, tonic: 77, scale: MAJOR,
    melody: 'bell', lead: 'flute', double: 'flute', arp: 'pizz', arpStyle: 'waltz', pad: 'pad',
    A: {
      chords: 'I | I | IV | I | ii | V | I | V',
      melody: "5:2 3:2 5:2 | 1':4 7:2 | 6:2 4:2 6:2 | 5:6 | 4:2 6:2 5:2 | 4:2 3:2 2:2 | 3:2 1:2 3:2 | 2:6",
    },
    B: {
      chords: 'vi | iii | IV | I | ii | V7 | I | I',
      melody: "6:3 5:1 6:2 | 7:2 5:2 3:2 | 4:2 5:2 6:2 | 1':4 5:2 | 6:2 5:2 4:2 | 3:2 2:2 7,:2 | 1:6 | r:6",
    },
  },
  // Forest: flute over a rippling harp, light on its feet.
  forest: {
    id: 'forest', name: 'Where the Old Trees Listen', bpm: 96, meter: 4, tonic: 79, scale: MAJOR,
    melody: 'flute', lead: 'strings', double: 'piano', arp: 'harp', arpStyle: 'flow', pad: 'pad',
    A: {
      chords: 'I | IV | vi | V | I | IV | ii V | I',
      melody: "5:2 6:1 5:1 3:2 5:2 | 6:3 5:1 4:2 3:2 | 3:2 5:2 1':4 | 7:2 6:2 5:4 | 5:2 6:1 5:1 3:2 1':2 | 2':3 1':1 6:2 1':2 | 6:2 1':2 7:2 2':2 | 1':6 r:2",
    },
    B: {
      chords: 'vi | IV | I | V | vi | IV | I V | I',
      melody: "3':4 2':2 1':2 | 1':3 7:1 6:4 | 5:2 1':2 3':4 | 2':6 r:2 | 3':3 2':1 1':2 7:2 | 6:2 1':2 4':4 | 3':2 1':2 2':2 7:2 | 1':6 r:2",
    },
  },
  // Coast: a lilting 6/8 on marimba and flute, with a shaker.
  coast: {
    id: 'coast', name: 'Saltglass Morning', bpm: 100, meter: 6, tonic: 81, scale: MAJOR,
    melody: 'flute', lead: 'strings', double: 'marimba', arp: 'marimba', arpStyle: 'roll68', pad: 'pad', shaker: true,
    A: {
      chords: 'I | vi | IV | V | I | vi | IV V | I',
      melody: "3:3 5:3 | 6:2 5:1 3:3 | 4:3 6:3 | 5:6 | 3:2 4:1 5:3 | 1':3 7:2 6:1 | 6:3 7:3 | 1':6",
    },
    B: {
      chords: 'IV | I | V | vi | IV | I | ii V | I',
      melody: "1':3 6:3 | 5:2 3:1 1:3 | 2:3 5:3 | 3:6 | 4:2 5:1 6:3 | 1':2 7:1 5:3 | 4:3 2:3 | 1:6",
    },
  },
  // Ruins: dorian strings over a slow piano — old stone, old memories.
  ruins: {
    id: 'ruins', name: 'Verses in Stone', bpm: 84, meter: 4, tonic: 62, scale: DORIAN,
    melody: 'strings', lead: 'strings', double: 'piano', arp: 'piano', arpStyle: 'flow', pad: 'pad',
    A: {
      chords: 'i | bVII | IV | i | i | bVII | bVI | V',
      melody: "5:4 3:2 1:2 | 2:2 3:2 4:4 | 6:3 5:1 4:4 | 5:6 r:2 | 1':4 7:2 6:2 | 5:3 4:1 3:4 | 3:4 1:4 | #7,:4 2:4",
    },
    B: {
      chords: 'bVI | bVII | i | i | bVI | bVII | V | V',
      melody: "1':4 7:2 1':2 | 2':4 1':2 7:2 | 1':3 7:1 5:4 | 3:2 4:2 5:4 | 4':4 3':2 1':2 | 2':4 5:4 | #7:4 2':4 | 5:6 r:2",
    },
  },
  // Desert: an oud-like pluck in phrygian dominant, hand drums underneath.
  desert: {
    id: 'desert', name: 'Glass and Wind', bpm: 100, meter: 4, tonic: 64, scale: PHRYG_DOM,
    melody: 'oud', lead: 'strings', double: 'flute', arp: 'harp', arpStyle: 'slow', pad: 'choir', shaker: true,
    A: {
      chords: 'I | bII | I | I | iv | bII | I | I',
      melody: "1:1 2:1 3:2 2:1 1:1 3:2 | 4:2 3:2 2:4 | 3:2 5:2 6:1 5:1 3:2 | 2:2 1:6 | 4:2 6:2 1':4 | 7:2 6:2 4:4 | 5:3 3:1 2:2 1:2 | 1:6 r:2",
    },
    B: {
      chords: 'bVI | bvii | bVI | bII | iv | bII | I | I',
      melody: "1':4 7:2 6:2 | 7:3 6:1 4:4 | 6:2 1':2 6:4 | 4:2 6:2 2:4 | 4:3 3:1 4:2 6:2 | 6:3 4:1 2:4 | 2:2 3:2 2:2 1:2 | 1:6 r:2",
    },
  },
  // Volcano: heroic and warm — a string ostinato and a noble horn line.
  volcano: {
    id: 'volcano', name: 'Embers Rising', bpm: 116, meter: 4, tonic: 72, scale: MINOR,
    melody: 'brass', lead: 'brass', double: 'strings', arp: 'strings', arpStyle: 'ostinato', pad: 'pad',
    A: {
      chords: 'i | bVI | bIII | bVII | i | bVI | iv | V',
      melody: "1:3 2:1 3:2 5:2 | 6:4 5:2 3:2 | 5:3 3:1 2:2 3:2 | 4:6 r:2 | 1':3 7:1 6:2 5:2 | 6:3 5:1 3:4 | 4:2 6:2 1':4 | #7:4 5:4",
    },
    B: {
      chords: 'bVI | bVII | i | i | bVI | bVII | V | V',
      melody: "3':4 2':2 1':2 | 2':3 1':1 7:4 | 1':4 5:4 | 3:2 4:2 5:4 | 6:2 1':2 3':4 | 4':3 3':1 2':4 | 2':4 #7:4 | 5:6 r:2",
    },
  },
  // Tundra: slow bells and piano, like breath on cold glass.
  tundra: {
    id: 'tundra', name: 'Frostveil Lullaby', bpm: 70, meter: 4, tonic: 71, scale: MINOR,
    melody: 'bell', lead: 'strings', double: 'piano', arp: 'harp', arpStyle: 'slow', pad: 'pad',
    A: {
      chords: 'i | bVII | bVI | bVII | i | iv | bVI | V',
      melody: "5:4 1':4 | 7:4 6:2 5:2 | 6:6 5:2 | 4:4 2:4 | 3:3 4:1 5:4 | 6:3 5:1 4:4 | 3:4 1:4 | 2:4 #7,:4",
    },
    B: {
      chords: 'bIII | bVII | bVI | i | bIII | bVII | iv V | i',
      melody: "3:2 5:2 7:4 | 2':4 7:4 | 6:4 5:2 3:2 | 1:6 r:2 | 5:3 6:1 7:4 | 1':4 7:2 6:2 | 6:2 4:2 2:4 | 1:6 r:2",
    },
  },
  // Sky: lydian and soaring — strings lifting over harp.
  sky: {
    id: 'sky', name: 'Above the Storm', bpm: 104, meter: 4, tonic: 75, scale: LYDIAN,
    melody: 'strings', lead: 'brass', double: 'flute', arp: 'harp', arpStyle: 'flow', pad: 'choir',
    A: {
      chords: 'I | II | I | II | vi | IV | V | V',
      melody: "5:4 3:2 5:2 | 6:3 5:1 4:4 | 3:3 2:1 1:4 | 2:2 4:2 6:4 | 1':4 7:2 6:2 | 6:4 1':4 | 7:3 6:1 5:4 | 2:6 r:2",
    },
    B: {
      chords: 'vi | V | IV | I | vi | II | IV V | I',
      melody: "3':4 2':2 1':2 | 2':3 1':1 7:4 | 6:4 1':4 | 5:6 r:2 | 1':3 2':1 3':4 | 4':4 2':4 | 1':4 7:4 | 1':6 r:2",
    },
  },
  // The Rift: strange and beautiful — bells and a choir in the dark.
  rift: {
    id: 'rift', name: 'The Space Between Stars', bpm: 76, meter: 4, tonic: 66, scale: MINOR,
    melody: 'bell', lead: 'strings', double: 'choir', arp: 'piano', arpStyle: 'slow', pad: 'choir',
    A: {
      chords: 'i | bVI | bIII | bVII | i | bVI | iv | iv',
      melody: "1:2 3:2 5:4 | 6:6 5:2 | 5:4 3:4 | 2:4 7,:4 | 1:2 5:2 1':4 | 1':2 7:2 6:4 | 4:4 6:2 1':2 | 7:6 r:2",
    },
    B: {
      chords: 'bVI | bVII | i | i | bVI | bVII | V | V',
      melody: "6:4 1':4 | 7:4 2':4 | 3':6 2':2 | 1':6 r:2 | 1':3 6:1 3':4 | 2':4 7:4 | #7:4 5:4 | 5:6 r:2",
    },
  },
  // Dungeons: low piano and cello, keeping its voice down.
  dungeon: {
    id: 'dungeon', name: 'Beneath', bpm: 92, meter: 4, tonic: 57, scale: MINOR,
    melody: 'strings', lead: 'brass', double: 'piano', arp: 'piano', arpStyle: 'low', pad: 'pad',
    A: {
      chords: 'i | i | bVI | bVI | iv | iv | V | V',
      melody: "1:6 2:2 | 3:6 r:2 | 3:4 2:2 1:2 | 6,:6 r:2 | 4:6 5:2 | 6:6 r:2 | 5:4 #7,:4 | 5,:6 r:2",
    },
    B: {
      chords: 'bVI | bVII | i | i | bVI | bVII | V | V',
      melody: "1':4 7:2 6:2 | 5:6 4:2 | 3:4 1:4 | 2:2 3:2 2:4 | 3:4 6:4 | 7:4 5:4 | #7:4 5:4 | 5:6 r:2",
    },
  },
  // Bosses (and the colosseum): everything at once, still with a tune.
  boss: {
    id: 'boss', name: 'Crown of Thorns', bpm: 144, meter: 4, tonic: 62, scale: MINOR,
    melody: 'brass', lead: 'brass', double: 'strings', arp: 'strings', arpStyle: 'ostinato', pad: 'choir', alwaysCombat: true,
    A: {
      chords: 'i | bVI | bVII | i | i | bVI | iv | V',
      melody: "1:3 1:1 2:2 3:2 | 6,:2 1:2 3:4 | 2:3 3:1 4:4 | 5:6 r:2 | 1':3 7:1 5:2 3:2 | 6:3 5:1 4:4 | 4:2 6:2 1':4 | #7:4 5:4",
    },
    B: {
      chords: 'bVI | bVII | bIII | bVI | iv | bVII | V | V',
      melody: "1':4 3':4 | 2':6 1':2 | 7:4 1':2 3':2 | 1':4 6:4 | 4:3 6:1 1':4 | 2':3 1':1 7:4 | #7:4 2':4 | 5:6 r:2",
    },
  },
};

/** Which theme plays where: [track, transpose in semitones, tempo multiplier]. */
const ZONE_MUSIC: Record<string, [string, number, number]> = {
  'hub': ['haven', 0, 1],
  'forest-1': ['forest', 0, 1], 'forest-2': ['forest', -2, 0.94],
  'coast-1': ['coast', 0, 1],
  'ruins-1': ['ruins', 0, 1], 'ruins-2': ['ruins', 2, 1.04],
  'desert-1': ['desert', 0, 1],
  'volcano-1': ['volcano', 0, 1], 'volcano-2': ['volcano', 1, 1.06],
  'tundra-1': ['tundra', 0, 1],
  'sky-1': ['sky', 0, 1], 'sky-2': ['sky', 2, 1.05],
  'rift-1': ['rift', 0, 1],
};

/* ----------------------------------------------------------- compiling */

interface CNote { at: number; len: number; semi: number | null; }      // in eighths
interface CChord { at: number; len: number; root: number; tones: number[]; }
interface CBar { chords: CChord[]; notes: CNote[]; }
interface CTrack { def: TrackDef; barLen: number; sections: CBar[][]; }

const NUMERALS: Record<string, number> = { i: 0, ii: 2, iii: 4, iv: 5, v: 7, vi: 9, vii: 11 };

function parseChord(sym: string): { root: number; tones: number[] } {
  const m = /^(b|#)?(vii|vi|v|iv|iii|ii|i|VII|VI|V|IV|III|II|I)(o|\+)?(maj7|7|sus4|sus2|add9|6)?$/.exec(sym);
  if (!m) throw new Error('bad chord ' + sym);
  const acc = m[1] === 'b' ? -1 : m[1] === '#' ? 1 : 0;
  const root = NUMERALS[m[2].toLowerCase()] + acc;
  const minor = m[2] === m[2].toLowerCase();
  let tones = m[3] === 'o' ? [0, 3, 6] : m[3] === '+' ? [0, 4, 8] : minor ? [0, 3, 7] : [0, 4, 7];
  switch (m[4]) {
    case 'maj7': tones = [...tones, 11]; break;
    case '7': tones = [...tones, 10]; break;
    case 'sus4': tones = [0, 5, 7]; break;
    case 'sus2': tones = [0, 2, 7]; break;
    case 'add9': tones = [...tones, 14]; break;
    case '6': tones = [...tones, 9]; break;
  }
  return { root, tones };
}

function parseNote(tok: string, scale: number[]): { semi: number | null; len: number } {
  const [head, lenS] = tok.split(':');
  const len = parseInt(lenS, 10);
  if (head === 'r') return { semi: null, len };
  const m = /^(#|b)?([1-7])([',]*)$/.exec(head);
  if (!m) throw new Error('bad note ' + tok);
  const acc = m[1] === '#' ? 1 : m[1] === 'b' ? -1 : 0;
  let oct = 0;
  for (const ch of m[3]) oct += ch === "'" ? 1 : -1;
  return { semi: scale[parseInt(m[2], 10) - 1] + acc + oct * 12, len };
}

function compileTrack(def: TrackDef): CTrack {
  const barLen = def.meter === 4 ? 8 : 6;
  const section = (sec: { chords: string; melody: string }): CBar[] => {
    const cb = sec.chords.split('|').map((b) => b.trim().split(/\s+/));
    const mb = sec.melody.split('|').map((b) => b.trim().split(/\s+/));
    return cb.map((chs, i) => {
      const per = barLen / chs.length;
      const chords = chs.map((c, k) => ({ at: k * per, len: per, ...parseChord(c) }));
      const notes: CNote[] = [];
      let at = 0;
      for (const tok of mb[i] || []) {
        const n = parseNote(tok, def.scale);
        notes.push({ at, len: n.len, semi: n.semi });
        at += n.len;
      }
      return { chords, notes };
    });
  };
  return { def, barLen, sections: [section(def.A), section(def.B)] };
}

const COMPILED: Record<string, CTrack> = {};
for (const id of Object.keys(TRACKS)) COMPILED[id] = compileTrack(TRACKS[id]);

function midiHz(m: number): number { return 440 * Math.pow(2, (m - 69) / 12); }

/* --------------------------------------------------------------- engine */

// Arpeggio shapes: chord-tone index per eighth (3 = root an octave up),
// -1 is silence, 9 strikes the whole chord.
const ARPS: Record<ArpStyle, number[]> = {
  flow: [0, 1, 2, 3, 2, 1, 2, 1],
  waltz: [-1, -1, 9, -1, 9, -1],
  roll68: [0, 1, 2, 3, 2, 1],
  slow: [0, -1, 1, -1, 2, -1, 1, -1],
  ostinato: [0, 0, 1, 0, 2, 0, 1, 0],
  low: [0, 2, 1, 3, 0, 2, 1, 3],
};

// Combat drums per meter, one slot per eighth.
const DRUMS: Record<string, { kick: number[]; snare: number[]; hat: number[] }> = {
  '4': { kick: [1, 0, 0, 0, 1, 0, 0, 1], snare: [0, 0, 1, 0, 0, 0, 1, 0], hat: [1, 1, 1, 1, 1, 1, 1, 1] },
  '3': { kick: [1, 0, 0, 0, 0, 0], snare: [0, 0, 1, 0, 1, 0], hat: [1, 1, 1, 1, 1, 1] },
  '6': { kick: [1, 0, 0, 0, 0, 0], snare: [0, 0, 0, 1, 0, 0], hat: [1, 1, 1, 1, 1, 1] },
  'boss': { kick: [1, 0, 0, 1, 1, 0, 0, 0], snare: [0, 0, 1, 0, 0, 0, 1, 0], hat: [1, 1, 1, 1, 1, 1, 1, 1] },
};

// Where the brass stabs land in a bar, in eighths.
const STABS: Record<number, number[]> = { 4: [0, 3, 6], 3: [0], 6: [0, 3] };

class Music {
  private ctx: BaseAudioContext | null = null;
  private started = false;
  private timer: number | null = null;
  muted = false;
  volume = 0.2;
  ducked = false;

  /** 0-4 as requested by the game; 2 and up brings in the combat layer. */
  target = 0;
  private combat = false;
  private combatTail = 0;      // bars left to keep scheduling the combat layer as it fades

  private master!: GainNode;
  private trackGain!: GainNode;
  private busMel!: GainNode;
  private busHarm!: GainNode;
  private busBass!: GainNode;
  private busCombat!: GainNode;
  private busPerc!: GainNode;
  private noise!: AudioBuffer;

  private track: CTrack = COMPILED.title;
  private transpose = 0;
  private tempo = 1;
  private trackKey = 'title:0:1';
  private pending: { id: string; transpose: number; tempo: number; at: number } | null = null;

  private sec = 0;
  private bar = 0;
  private eighth = 0;
  private loop = 0;
  private nextTime = 0;

  get running(): boolean { return this.started && !this.muted; }
  get trackName(): string { return this.track.def.name; }

  /* ---------------------------------------------------------- lifecycle */

  start() {
    if (this.started) return;
    const ctx = sharedAudio();
    if (!ctx) return;
    this.build(ctx);
    this.started = true;
    this.nextTime = ctx.currentTime + 0.12;
    this.timer = window.setInterval(() => this.pump(), 25);
  }

  stop() {
    if (this.timer !== null) { clearInterval(this.timer); this.timer = null; }
    this.started = false;
    if (this.master) this.master.gain.value = 0;
  }

  setMuted(m: boolean) { this.muted = m; this.applyVolume(); }
  setVolume(v: number) { this.volume = clamp(v, 0, 1); this.applyVolume(); }
  /** Pull the music down while a full-screen menu is up. */
  duck(on: boolean) { if (on !== this.ducked) { this.ducked = on; this.applyVolume(); } }

  private applyVolume() {
    if (!this.master || !this.ctx) return;
    const v = this.muted ? 0 : this.volume * MUSIC_MASTER * (this.ducked ? 0.55 : 1);
    this.master.gain.setTargetAtTime(v, this.ctx.currentTime, 0.08);
  }

  /** Change theme. The old one fades out and the new one starts on a fresh bar. */
  setTrack(id: string, transpose = 0, tempo = 1) {
    if (!COMPILED[id]) return;
    const key = `${id}:${transpose}:${tempo}`;
    if (key === this.trackKey || (this.pending && `${this.pending.id}:${this.pending.transpose}:${this.pending.tempo}` === key)) return;
    this.trackKey = key;
    if (!this.started || !this.ctx) {
      this.useTrack(id, transpose, tempo);
      return;
    }
    const now = this.ctx.currentTime;
    this.trackGain.gain.cancelScheduledValues(now);
    this.trackGain.gain.setTargetAtTime(0, now, 0.35);
    this.pending = { id, transpose, tempo, at: now + 1.3 };
  }

  private useTrack(id: string, transpose: number, tempo: number) {
    this.track = COMPILED[id];
    this.transpose = transpose;
    this.tempo = tempo;
    this.sec = 0; this.bar = 0; this.eighth = 0; this.loop = 0;
  }

  /* --------------------------------------------------------------- graph */

  private build(ctx: BaseAudioContext) {
    this.ctx = ctx;
    const comp = ctx.createDynamicsCompressor();
    comp.threshold.value = -20;
    comp.knee.value = 12;
    comp.ratio.value = 3;
    comp.attack.value = 0.01;
    comp.release.value = 0.3;
    this.master = ctx.createGain();
    this.master.gain.value = 0;
    comp.connect(this.master);
    this.master.connect(ctx.destination);

    this.trackGain = ctx.createGain();
    this.trackGain.gain.value = 1;
    this.trackGain.connect(comp);

    // A generated hall: decaying stereo noise as the impulse response.
    const rev = ctx.createConvolver();
    const len = Math.floor(ctx.sampleRate * 2.6);
    const ir = ctx.createBuffer(2, len, ctx.sampleRate);
    for (let ch = 0; ch < 2; ch++) {
      const d = ir.getChannelData(ch);
      for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, 3.4);
    }
    rev.buffer = ir;
    const revOut = ctx.createGain();
    revOut.gain.value = 0.55;
    rev.connect(revOut);
    revOut.connect(this.trackGain);

    const bus = (dry: number, send: number) => {
      const g = ctx.createGain();
      g.gain.value = dry;
      g.connect(this.trackGain);
      const s = ctx.createGain();
      s.gain.value = send;
      g.connect(s);
      s.connect(rev);
      return g;
    };
    this.busMel = bus(1, 0.38);
    this.busHarm = bus(0.85, 0.5);
    this.busBass = bus(0.9, 0.12);
    this.busCombat = bus(0, 0.22);
    this.busPerc = bus(1, 0.18);

    this.noise = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate);
    const nd = this.noise.getChannelData(0);
    for (let i = 0; i < nd.length; i++) nd[i] = Math.random() * 2 - 1;
    this.applyVolume();
  }

  /* ---------------------------------------------------------- scheduling */

  private eighthDur(): number { return 60 / (this.track.def.bpm * this.tempo) / 2; }

  private pump() {
    if (!this.ctx) return;
    this.scheduleUntil(this.ctx.currentTime + 0.2);
  }

  /** Schedule every eighth note that starts before `until`. */
  scheduleUntil(until: number) {
    while (this.nextTime < until) {
      if (this.pending && this.nextTime >= this.pending.at) {
        const p = this.pending;
        this.pending = null;
        this.useTrack(p.id, p.transpose, p.tempo);
        this.trackGain.gain.cancelScheduledValues(this.nextTime);
        this.trackGain.gain.setValueAtTime(0.0001, this.nextTime);
        this.trackGain.gain.linearRampToValueAtTime(1, this.nextTime + 1.4);
      }
      if (this.pending) { this.nextTime += 0.05; continue; }   // the gap while one fades out
      this.scheduleEighth(this.nextTime);
      this.nextTime += this.eighthDur();
    }
  }

  private scheduleEighth(t: number) {
    const tr = this.track;
    const def = tr.def;
    const bar = tr.sections[this.sec][this.bar];
    const e = this.eighth;
    const ed = this.eighthDur();
    const key = def.tonic + this.transpose;

    if (e === 0) {
      // Layers change on bar lines only, so nothing lurches mid-phrase.
      const want = !!def.alwaysCombat || this.target >= 2;
      this.combatTail = want ? 2 : Math.max(0, this.combatTail - 1);
      if (want !== this.combat || this.bar === 0) {
        this.combat = want;
        this.busCombat.gain.setTargetAtTime(want ? 1 : 0, t, ed * 2);
        this.busHarm.gain.setTargetAtTime(want ? 0.7 : 0.85, t, ed * 2);
      }
    }

    // harmony: pad on each chord change, then the arpeggio and bass
    const chord = bar.chords.find((c) => e >= c.at && e < c.at + c.len)!;
    const pitches = this.voice(chord, key - 12);
    const rootLow = this.low(chord.root, key - 24);
    if (e === chord.at) {
      if (def.pad) for (const m of pitches) this.play(def.pad, midiHz(m), t, chord.len * ed, 0.032, this.busHarm);
      if (def.arpStyle === 'waltz') this.play('pizz', midiHz(rootLow), t, ed * 2, 0.16, this.busBass);
      else if (def.meter === 6) this.play('bass', midiHz(rootLow), t, ed * 2.8, 0.12, this.busBass);
      else this.play('bass', midiHz(rootLow), t, chord.len * ed * 0.95, 0.11, this.busBass);
    }
    if (def.meter === 6 && e === 3 && chord.at === 0 && chord.len === 6) {
      this.play('bass', midiHz(rootLow + 7), t, ed * 2.8, 0.1, this.busBass);
    }
    const arpIx = ARPS[def.arpStyle][e % ARPS[def.arpStyle].length];
    if (arpIx === 9) {
      for (const m of pitches) this.play(def.arp, midiHz(m + 12), t, ed * 1.5, 0.045, this.busHarm);
    } else if (arpIx >= 0) {
      const tones = [...pitches].sort((a, b) => a - b);
      const m = arpIx === 3 ? tones[0] + 12 : tones[Math.min(arpIx, tones.length - 1)];
      const oct = def.arpStyle === 'low' ? -12 : def.arpStyle === 'ostinato' ? 0 : 12;
      this.play(def.arp, midiHz(m + oct), t, ed * 1.8, def.arpStyle === 'ostinato' ? 0.05 : 0.065, this.busHarm);
    }

    // the tune
    const breather = !this.combat && this.sec === 0 && this.loop % 3 === 2;   // every third pass, A rests
    for (const n of bar.notes) {
      if (n.at !== e || n.semi === null || breather) continue;
      const inst = this.combat ? def.lead : def.melody;
      const f = midiHz(key + n.semi);
      this.play(inst, f, t, n.len * ed * 0.96, LEVELS[inst], this.busMel);
      if (def.double && this.loop % 2 === 1) this.play(def.double, f / 2, t, n.len * ed * 0.96, LEVELS[def.double] * 0.55, this.busMel);
    }

    // combat layer: drums, a driving bass and brass stabs (always scheduled,
    // heard only while its bus is up)
    if (this.combatTail > 0) this.scheduleCombat(t, e, ed, pitches, rootLow);
    if (def.shaker) this.shaker(t, e % 2 === 0 ? 0.03 : 0.018);

    // advance
    this.eighth++;
    if (this.eighth >= tr.barLen) {
      this.eighth = 0;
      this.bar++;
      if (this.bar >= tr.sections[this.sec].length) {
        this.bar = 0;
        this.sec++;
        if (this.sec >= tr.sections.length) { this.sec = 0; this.loop++; }
      }
    }
  }

  private scheduleCombat(t: number, e: number, ed: number, pitches: number[], rootLow: number) {
    const def = this.track.def;
    const dr = DRUMS[def.alwaysCombat ? 'boss' : String(def.meter)];
    const slot = e % dr.kick.length;
    if (dr.kick[slot]) this.kick(t, 0.32);
    if (dr.snare[slot]) this.snare(t, 0.13);
    if (dr.hat[slot]) this.hat(t, e % 2 === 0 ? 0.035 : 0.022);
    this.play('bass', midiHz(rootLow + (e % 4 === 2 ? 12 : 0)), t, ed * 0.8, 0.09, this.busCombat);
    if (STABS[def.meter].includes(e)) {
      for (const m of pitches) this.play('brass', midiHz(m), t, ed * 1.2, 0.03, this.busCombat);
    }
    if (def.alwaysCombat && e === 0) this.timpani(midiHz(rootLow), t, 0.3);
  }

  /** Close-voiced chord tones around `center`, as MIDI notes. */
  private voice(ch: CChord, center: number): number[] {
    return ch.tones.map((tone) => {
      let m = center + ((ch.root + tone) % 12 + 12) % 12;
      while (m > center + 7) m -= 12;
      while (m < center - 5) m += 12;
      return m;
    });
  }

  private low(root: number, base: number): number {
    let m = base + ((root % 12) + 12) % 12;
    if (m > base + 7) m -= 12;
    return m;
  }

  /* ---------------------------------------------------------- instruments */

  private play(inst: Inst, f: number, t: number, d: number, v: number, out: AudioNode) {
    switch (inst) {
      case 'piano': return this.piano(f, t, d, v, out);
      case 'bell': return this.bell(f, t, v, out);
      case 'flute': return this.flute(f, t, d, v, out);
      case 'strings': return this.bowed(f, t, d, v, out, 'sawtooth', 2100, 0.1);
      case 'pad': return this.bowed(f, t, d, v, out, 'sawtooth', 1100, 0.45);
      case 'choir': return this.bowed(f, t, d, v, out, 'triangle', 1500, 0.6);
      case 'brass': return this.brass(f, t, d, v, out);
      case 'harp': return this.pluck(f, t, v, out, 'triangle', 0.7, 3400);
      case 'pizz': return this.pluck(f, t, v, out, 'triangle', 0.14, 1800);
      case 'marimba': return this.marimba(f, t, v, out);
      case 'oud': return this.oud(f, t, v, out);
      case 'bass': return this.bass(f, t, d, v, out);
    }
  }

  private osc(type: OscillatorType, f: number, t: number, stop: number, dest: AudioNode, detune = 0): OscillatorNode {
    const o = this.ctx!.createOscillator();
    o.type = type;
    o.frequency.setValueAtTime(f, t);
    if (detune) o.detune.setValueAtTime(detune, t);
    o.connect(dest);
    o.start(t);
    o.stop(stop);
    return o;
  }

  private gain(v: number, dest: AudioNode): GainNode {
    const g = this.ctx!.createGain();
    g.gain.value = v;
    g.connect(dest);
    return g;
  }

  private lowpass(f: number, dest: AudioNode, q = 0.7): BiquadFilterNode {
    const b = this.ctx!.createBiquadFilter();
    b.type = 'lowpass';
    b.frequency.value = f;
    b.Q.value = q;
    b.connect(dest);
    return b;
  }

  private piano(f: number, t: number, d: number, v: number, out: AudioNode) {
    const g = this.gain(0, out);
    const lp = this.lowpass(2600, g);
    lp.frequency.setTargetAtTime(900, t + 0.05, 0.8);
    const end = t + d + 1.4;
    this.osc('triangle', f, t, end, lp);
    this.osc('sine', f * 2, t, end, this.gain(0.28, lp), 3);
    this.osc('sine', f * 3, t, end, this.gain(0.08, lp), -4);
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(v, t + 0.004);
    g.gain.setTargetAtTime(v * 0.25, t + 0.004, 0.45);
    g.gain.setTargetAtTime(0, t + Math.max(d, 0.25), 0.28);
  }

  private bell(f: number, t: number, v: number, out: AudioNode) {
    const parts: [number, number, number][] = [[1, 1, 1.3], [2.76, 0.32, 0.45], [5.4, 0.1, 0.18]];
    for (const [ratio, amp, tau] of parts) {
      const g = this.gain(0, out);
      this.osc('sine', f * ratio, t, t + tau * 6, g);
      g.gain.setValueAtTime(0, t);
      g.gain.linearRampToValueAtTime(v * amp, t + 0.003);
      g.gain.setTargetAtTime(0, t + 0.003, tau);
    }
  }

  private flute(f: number, t: number, d: number, v: number, out: AudioNode) {
    const g = this.gain(0, out);
    const lp = this.lowpass(3000, g);
    const end = t + d + 0.5;
    const o1 = this.osc('sine', f, t, end, lp);
    const o2 = this.osc('triangle', f, t, end, this.gain(0.22, lp));
    this.vibrato([o1, o2], f, t + 0.22, end, 5.2, 0.006);
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(v, t + 0.07);
    g.gain.setTargetAtTime(v * 0.82, t + 0.07, 0.2);
    g.gain.setTargetAtTime(0, t + d, 0.09);
    // a breath at the start of each note
    const n = this.ctx!.createBufferSource();
    n.buffer = this.noise;
    const bp = this.ctx!.createBiquadFilter();
    bp.type = 'bandpass'; bp.frequency.value = f * 2; bp.Q.value = 2;
    const ng = this.gain(0, out);
    n.connect(bp); bp.connect(ng);
    ng.gain.setValueAtTime(v * 0.35, t);
    ng.gain.setTargetAtTime(0, t, 0.025);
    n.start(t); n.stop(t + 0.15);
  }

  private bowed(f: number, t: number, d: number, v: number, out: AudioNode, type: OscillatorType, cutoff: number, attack: number) {
    const g = this.gain(0, out);
    const lp = this.lowpass(cutoff, g);
    const end = t + d + attack * 2 + 0.6;
    const a = this.osc(type, f, t, end, lp, -7);
    const b = this.osc(type, f, t, end, lp, 7);
    const c = this.osc('triangle', f / 2, t, end, this.gain(0.3, lp));
    this.vibrato([a, b, c], f, t + 0.3, end, 5.4, 0.004);
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(v, t + attack);
    g.gain.setValueAtTime(v, t + Math.max(attack, d));
    g.gain.setTargetAtTime(0, t + Math.max(attack, d), attack * 0.8 + 0.12);
  }

  private brass(f: number, t: number, d: number, v: number, out: AudioNode) {
    const g = this.gain(0, out);
    const lp = this.lowpass(500, g, 1.1);
    lp.frequency.setValueAtTime(500, t);
    lp.frequency.linearRampToValueAtTime(2300, t + 0.07);
    lp.frequency.setTargetAtTime(1300, t + 0.07, 0.2);
    const end = t + d + 0.5;
    const a = this.osc('sawtooth', f, t, end, lp);
    const b = this.osc('square', f, t, end, this.gain(0.2, lp), 5);
    this.vibrato([a, b], f, t + 0.25, end, 5, 0.004);
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(v, t + 0.05);
    g.gain.setTargetAtTime(v * 0.78, t + 0.05, 0.15);
    g.gain.setTargetAtTime(0, t + d, 0.1);
  }

  private pluck(f: number, t: number, v: number, out: AudioNode, type: OscillatorType, tau: number, cutoff: number) {
    const g = this.gain(0, out);
    const lp = this.lowpass(cutoff, g);
    lp.frequency.setTargetAtTime(cutoff * 0.4, t, tau);
    this.osc(type, f, t, t + tau * 6, lp);
    this.osc('sine', f * 2, t, t + tau * 3, this.gain(0.18, lp));
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(v, t + 0.003);
    g.gain.setTargetAtTime(0, t + 0.003, tau);
  }

  private marimba(f: number, t: number, v: number, out: AudioNode) {
    const g = this.gain(0, out);
    this.osc('sine', f, t, t + 1.4, g);
    const hg = this.gain(0, out);
    this.osc('sine', f * 4, t, t + 0.3, hg);
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(v, t + 0.003);
    g.gain.setTargetAtTime(0, t + 0.003, 0.28);
    hg.gain.setValueAtTime(v * 0.2, t);
    hg.gain.setTargetAtTime(0, t, 0.04);
  }

  private oud(f: number, t: number, v: number, out: AudioNode) {
    const g = this.gain(0, out);
    const lp = this.lowpass(2400, g, 1.2);
    lp.frequency.setTargetAtTime(800, t, 0.25);
    const o = this.osc('sawtooth', f * 0.985, t, t + 2, lp);
    o.frequency.linearRampToValueAtTime(f, t + 0.035);
    this.osc('triangle', f * 2, t, t + 1, this.gain(0.15, lp));
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(v, t + 0.004);
    g.gain.setTargetAtTime(0, t + 0.004, 0.38);
  }

  private bass(f: number, t: number, d: number, v: number, out: AudioNode) {
    const g = this.gain(0, out);
    const lp = this.lowpass(520, g);
    const end = t + d + 0.4;
    this.osc('sine', f, t, end, lp);
    this.osc('triangle', f, t, end, this.gain(0.45, lp));
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(v, t + 0.012);
    g.gain.setTargetAtTime(v * 0.7, t + 0.012, 0.25);
    g.gain.setTargetAtTime(0, t + d, 0.07);
  }

  private vibrato(oscs: OscillatorNode[], f: number, t: number, end: number, rate: number, depth: number) {
    const lfo = this.ctx!.createOscillator();
    lfo.frequency.value = rate;
    const lg = this.ctx!.createGain();
    lg.gain.setValueAtTime(0, t);
    lg.gain.linearRampToValueAtTime(f * depth, t + 0.3);
    lfo.connect(lg);
    for (const o of oscs) lg.connect(o.frequency);
    lfo.start(t);
    lfo.stop(end);
  }

  /* ------------------------------------------------------------- drums */

  private noiseHit(t: number, v: number, type: BiquadFilterType, freq: number, q: number, tau: number, out: AudioNode) {
    const n = this.ctx!.createBufferSource();
    n.buffer = this.noise;
    const f = this.ctx!.createBiquadFilter();
    f.type = type; f.frequency.value = freq; f.Q.value = q;
    const g = this.gain(0, out);
    n.connect(f); f.connect(g);
    g.gain.setValueAtTime(v, t);
    g.gain.setTargetAtTime(0, t, tau);
    n.start(t, Math.random() * 0.5);
    n.stop(t + tau * 8);
  }

  private kick(t: number, v: number) {
    const g = this.gain(0, this.busCombat);
    const o = this.osc('sine', 110, t, t + 0.5, g);
    o.frequency.exponentialRampToValueAtTime(42, t + 0.12);
    g.gain.setValueAtTime(v, t);
    g.gain.setTargetAtTime(0, t, 0.09);
  }

  private snare(t: number, v: number) {
    this.noiseHit(t, v, 'bandpass', 1900, 0.8, 0.06, this.busCombat);
    const g = this.gain(0, this.busCombat);
    this.osc('triangle', 190, t, t + 0.25, g);
    g.gain.setValueAtTime(v * 0.6, t);
    g.gain.setTargetAtTime(0, t, 0.04);
  }

  private hat(t: number, v: number) { this.noiseHit(t, v, 'highpass', 7500, 0.7, 0.018, this.busCombat); }

  private shaker(t: number, v: number) { this.noiseHit(t, v, 'bandpass', 6200, 1.4, 0.03, this.busPerc); }

  private timpani(f: number, t: number, v: number) {
    const g = this.gain(0, this.busCombat);
    const o = this.osc('sine', f * 1.12, t, t + 2, g);
    o.frequency.exponentialRampToValueAtTime(f, t + 0.25);
    g.gain.setValueAtTime(v, t);
    g.gain.setTargetAtTime(0, t, 0.45);
    this.noiseHit(t, v * 0.4, 'lowpass', 300, 0.7, 0.05, this.busCombat);
  }

  /* ------------------------------------------------------------ preview */

  /** Render a theme offline (for testing and previews): returns the audio. */
  static async render(id: string, seconds: number, combat: boolean, volume = 1): Promise<AudioBuffer> {
    const sr = 32000;
    const ctx = new OfflineAudioContext(2, Math.floor(sr * seconds), sr);
    const m = new Music();
    m.volume = volume;
    m.build(ctx);
    m.useTrack(id, 0, 1);
    m.target = combat ? 3 : 0;
    m.nextTime = 0.05;
    m.scheduleUntil(seconds);
    return ctx.startRendering();
  }
}

/** Peak note levels per instrument, so every theme's tune sits at the same height. */
const LEVELS: Record<Inst, number> = {
  piano: 0.2, bell: 0.16, flute: 0.17, strings: 0.11, brass: 0.1, harp: 0.14,
  marimba: 0.16, oud: 0.15, choir: 0.08, pad: 0.05, pizz: 0.14, bass: 0.12,
};

/** Output trim: the volume slider is multiplied by this. */
const MUSIC_MASTER = 1.0;
