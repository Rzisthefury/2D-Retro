/* ------------------------------------------------------------------
   GBA-STYLE SCORE
   Two pulse channels, a triangle bass and a noise channel, sequenced
   from 16th-note patterns. Player phase and enemy phase share a motif;
   the enemy version is the same march gone wrong, which is most of why
   the phase swap feels like Fire Emblem.
------------------------------------------------------------------ */
(function (FE) {
  'use strict';

  var ctx = null, master = null, timer = null;
  var current = null, step = 0, nextTime = 0, playing = false;
  var enabled = true, volume = 0.5;

  var NOTES = { C: 0, 'C#': 1, D: 2, 'D#': 3, E: 4, F: 5, 'F#': 6, G: 7, 'G#': 8, A: 9, 'A#': 10, B: 11 };

  function freq(name) {
    if (!name || name === '-') return 0;
    var m = /^([A-G]#?)(-?\d)$/.exec(name);
    if (!m) return 0;
    var semi = NOTES[m[1]] + (parseInt(m[2], 10) + 1) * 12;
    return 440 * Math.pow(2, (semi - 69) / 12);
  }

  /* n(note, duration in 16ths) */
  function n(note, dur) { return [note, dur]; }

  /* expand a pattern into a per-step array */
  function expand(pat) {
    var out = [];
    pat.forEach(function (e) {
      out.push({ note: e[0], start: true, dur: e[1] });
      for (var i = 1; i < e[1]; i++) out.push({ note: e[0], start: false });
    });
    return out;
  }

  /* drums: k kick, s snare, h hat, . rest — one char per 16th */
  function drums(str) { return str.split(''); }

  /* ---------------- tracks ---------------- */

  var TRACKS = {

    /* ---- player phase: Estrel March, D minor ---- */
    player: {
      bpm: 132, wave1: 'square', wave2: 'square', duty: 0.5,
      lead: [
        n('D5',4), n('A4',2), n('D5',2), n('F5',4), n('E5',4),
        n('D5',4), n('A4',2), n('C5',2), n('E5',4), n('D5',4),
        n('F5',4), n('E5',2), n('D5',2), n('C5',4), n('A4',4),
        n('A#4',4), n('C5',4), n('D5',8),
        n('A5',4), n('G5',2), n('F5',2), n('E5',4), n('D5',4),
        n('F5',4), n('E5',2), n('D5',2), n('C5',8),
        n('D5',2), n('E5',2), n('F5',4), n('G5',4), n('A5',4),
        n('D5',10), n('-',6)
      ],
      harmony: [
        n('F4',4), n('D4',2), n('F4',2), n('A4',4), n('G4',4),
        n('F4',4), n('D4',2), n('E4',2), n('G4',4), n('F4',4),
        n('A4',4), n('G4',2), n('F4',2), n('E4',4), n('C4',4),
        n('D4',4), n('E4',4), n('F4',8),
        n('F5',4), n('D5',2), n('A4',2), n('G4',4), n('F4',4),
        n('A4',4), n('G4',2), n('F4',2), n('E4',8),
        n('F4',2), n('G4',2), n('A4',4), n('A#4',4), n('C5',4),
        n('F4',10), n('-',6)
      ],
      bass: [
        n('D3',8), n('A2',8), n('D3',8), n('A2',8),
        n('F3',8), n('C3',8), n('A#2',8), n('A2',8),
        n('D3',8), n('A2',8), n('F3',8), n('C3',8),
        n('A#2',8), n('A2',8), n('D3',16)
      ],
      drums: drums(
        'k.h.s.h.k.h.s.h.' + 'k.h.s.h.k.hks.h.' +
        'k.h.s.h.k.h.s.h.' + 'k.h.s.h.kks.s.s.' +
        'k.h.s.h.k.h.s.h.' + 'k.h.s.h.k.hks.h.' +
        'k.h.s.h.k.h.s.h.' + 'k.h.s.hks.s.ssss'
      )
    },

    /* ---- enemy phase: the same march, gone wrong ---- */
    enemy: {
      bpm: 112, wave1: 'square', wave2: 'triangle', duty: 0.25,
      lead: [
        n('D4',6), n('D#4',2), n('D4',4), n('A3',4),
        n('A#3',6), n('A3',2), n('G3',4), n('F3',4),
        n('D4',6), n('D#4',2), n('F4',4), n('D4',4),
        n('C#4',8), n('D4',8),
        n('F4',6), n('G4',2), n('A4',4), n('F4',4),
        n('D#4',6), n('D4',2), n('C4',8),
        n('A#3',4), n('C4',4), n('D4',4), n('D#4',4),
        n('D4',12), n('-',4)
      ],
      harmony: [
        n('A3',6), n('A#3',2), n('A3',4), n('F3',4),
        n('F3',6), n('E3',2), n('D3',4), n('C3',4),
        n('A3',6), n('A#3',2), n('C4',4), n('A3',4),
        n('A3',8), n('A3',8),
        n('C4',6), n('D4',2), n('F4',4), n('C4',4),
        n('A3',6), n('A#3',2), n('G3',8),
        n('F3',4), n('G3',4), n('A3',4), n('A#3',4),
        n('A3',12), n('-',4)
      ],
      bass: [
        n('D2',16), n('A#1',16), n('D2',16), n('A1',16),
        n('D2',16), n('A#1',16), n('G1',8), n('A1',8), n('D2',16)
      ],
      drums: drums(
        'k...s...k...s...' + 'k...s...k...s.s.' +
        'k...s...k...s...' + 'k...s...kk..ssss' +
        'k...s...k...s...' + 'k...s...k...s.s.' +
        'k...s...k...s...' + 'k...s...kkkkssss'
      )
    },

    /* ---- boss ---- */
    boss: {
      bpm: 152, wave1: 'sawtooth', wave2: 'square', duty: 0.5,
      lead: [
        n('D5',2), n('D5',2), n('F5',2), n('D5',2), n('A5',4), n('G#5',4),
        n('G5',2), n('G5',2), n('A#5',2), n('G5',2), n('D5',8),
        n('D5',2), n('D5',2), n('F5',2), n('D5',2), n('A5',4), n('A#5',4),
        n('A5',4), n('G5',4), n('F5',4), n('E5',4),
        n('F5',2), n('G5',2), n('A5',4), n('A#5',2), n('A5',2), n('G5',4),
        n('F5',2), n('E5',2), n('D5',4), n('C#5',4), n('D5',4),
        n('A5',2), n('G5',2), n('F5',2), n('E5',2), n('D5',8),
        n('D5',4), n('A4',4), n('D5',8)
      ],
      harmony: [
        n('A4',2), n('A4',2), n('D5',2), n('A4',2), n('F5',4), n('E5',4),
        n('D5',2), n('D5',2), n('G5',2), n('D5',2), n('A4',8),
        n('A4',2), n('A4',2), n('D5',2), n('A4',2), n('F5',4), n('G5',4),
        n('F5',4), n('D5',4), n('C5',4), n('A4',4),
        n('C5',2), n('D5',2), n('F5',4), n('G5',2), n('F5',2), n('D5',4),
        n('C5',2), n('A4',2), n('A4',4), n('A4',4), n('A4',4),
        n('F5',2), n('D5',2), n('C5',2), n('A4',2), n('A4',8),
        n('A4',4), n('F4',4), n('A4',8)
      ],
      bass: [
        n('D2',4), n('D2',2), n('D2',2), n('D2',4), n('C2',4),
        n('A#1',4), n('A#1',2), n('A#1',2), n('A1',8),
        n('D2',4), n('D2',2), n('D2',2), n('D2',4), n('C2',4),
        n('A#1',8), n('A1',8),
        n('A#1',8), n('C2',8),
        n('D2',8), n('A1',8),
        n('D2',4), n('C2',4), n('A#1',4), n('A1',4),
        n('D2',16)
      ],
      drums: drums(
        'khkhskhkkhkhskhk' + 'khkhskhkkhkhssss' +
        'khkhskhkkhkhskhk' + 'khkhskhkkkkkssss' +
        'khkhskhkkhkhskhk' + 'khkhskhkkhkhssss' +
        'khkhskhkkhkhskhk' + 'kkkksssskhkhssss'
      )
    },

    /* ---- preparations ---- */
    prep: {
      bpm: 92, wave1: 'triangle', wave2: 'triangle', duty: 0.5,
      lead: [
        n('A4',6), n('C5',2), n('D5',8),
        n('C5',6), n('A4',2), n('G4',8),
        n('F4',6), n('G4',2), n('A4',8),
        n('G4',8), n('E4',8),
        n('A4',6), n('C5',2), n('E5',8),
        n('D5',6), n('C5',2), n('A4',8),
        n('G4',4), n('A4',4), n('C5',4), n('D5',4),
        n('A4',16)
      ],
      harmony: [
        n('F4',8), n('A4',8), n('E4',8), n('D4',8),
        n('D4',8), n('F4',8), n('C4',8), n('C4',8),
        n('F4',8), n('A4',8), n('A4',8), n('F4',8),
        n('E4',8), n('F4',8), n('F4',16)
      ],
      bass: [
        n('D3',16), n('C3',16), n('A#2',16), n('C3',16),
        n('D3',16), n('A#2',16), n('C3',16), n('D3',16)
      ],
      drums: drums(new Array(9).join('................'))
    },

    /* ---- shop ---- */
    shop: {
      bpm: 116, wave1: 'square', wave2: 'square', duty: 0.5,
      lead: [
        n('G4',2), n('B4',2), n('D5',4), n('B4',2), n('G4',2), n('A4',4),
        n('F#4',2), n('A4',2), n('C5',4), n('A4',4), n('D4',4),
        n('G4',2), n('B4',2), n('D5',4), n('E5',4), n('D5',4),
        n('C5',4), n('B4',4), n('G4',8)
      ],
      harmony: [
        n('D4',2), n('G4',2), n('B4',4), n('G4',2), n('D4',2), n('F#4',4),
        n('D4',2), n('F#4',2), n('A4',4), n('F#4',4), n('A3',4),
        n('D4',2), n('G4',2), n('B4',4), n('C5',4), n('B4',4),
        n('A4',4), n('G4',4), n('D4',8)
      ],
      bass: [
        n('G2',8), n('D3',8), n('D2',8), n('A2',8),
        n('G2',8), n('D3',8), n('C3',8), n('G2',8)
      ],
      drums: drums('k.h.s.h.k.h.s.h.k.h.s.h.k.h.s.h.k.h.s.h.k.h.s.h.')
    },

    /* ---- arena ---- */
    arena: {
      bpm: 144, wave1: 'square', wave2: 'sawtooth', duty: 0.5,
      lead: [
        n('E5',2), n('E5',2), n('G5',4), n('E5',2), n('D5',2), n('B4',4),
        n('C5',2), n('C5',2), n('E5',4), n('C5',4), n('A4',4),
        n('E5',2), n('E5',2), n('G5',4), n('A5',4), n('G5',4),
        n('E5',4), n('D5',4), n('E5',8)
      ],
      harmony: [
        n('B4',2), n('B4',2), n('E5',4), n('B4',2), n('A4',2), n('G4',4),
        n('A4',2), n('A4',2), n('C5',4), n('A4',4), n('E4',4),
        n('B4',2), n('B4',2), n('E5',4), n('E5',4), n('B4',4),
        n('B4',4), n('A4',4), n('B4',8)
      ],
      bass: [
        n('E2',4), n('E2',4), n('G2',4), n('B2',4),
        n('A2',4), n('A2',4), n('C3',4), n('E3',4),
        n('E2',4), n('E2',4), n('G2',4), n('A2',4),
        n('B2',8), n('E2',8)
      ],
      drums: drums('khkhskhkkhkhskhkkhkhskhkkhkhssss' + 'khkhskhkkhkhskhkkhkhskhkkkkkssss')
    },

    /* ---- short cues ---- */
    victory: {
      bpm: 140, once: true, wave1: 'square', wave2: 'square', duty: 0.5,
      lead: [n('D5',2), n('F5',2), n('A5',2), n('D6',6), n('C6',2), n('A5',2), n('D6',12)],
      harmony: [n('A4',2), n('D5',2), n('F5',2), n('A5',6), n('A5',2), n('F5',2), n('A5',12)],
      bass: [n('D3',8), n('A2',4), n('D3',16)],
      drums: drums('kkkkssss........kkkkssssssss....')
    },
    defeat: {
      bpm: 76, once: true, wave1: 'triangle', wave2: 'triangle', duty: 0.5,
      lead: [n('D4',8), n('C4',8), n('A#3',8), n('A3',16)],
      harmony: [n('F3',8), n('A3',8), n('F3',8), n('E3',16)],
      bass: [n('D2',16), n('A#1',16), n('A1',16)],
      drums: drums(new Array(4).join('................'))
    },
    title: {
      bpm: 104, wave1: 'square', wave2: 'triangle', duty: 0.5,
      lead: [
        n('D5',8), n('A5',8), n('G5',4), n('F5',4), n('E5',8),
        n('D5',8), n('F5',8), n('E5',4), n('D5',4), n('C5',8),
        n('A#4',8), n('C5',8), n('D5',16),
        n('A4',8), n('D5',8), n('F5',8), n('D5',8)
      ],
      harmony: [
        n('F4',8), n('D5',8), n('A#4',4), n('A4',4), n('G4',8),
        n('F4',8), n('A4',8), n('G4',4), n('F4',4), n('E4',8),
        n('D4',8), n('E4',8), n('F4',16),
        n('D4',8), n('A4',8), n('A4',8), n('F4',8)
      ],
      bass: [
        n('D2',16), n('C2',16), n('A#1',16), n('A1',16),
        n('A#1',16), n('C2',16), n('D2',16), n('D2',16)
      ],
      drums: drums(new Array(9).join('k.......s.......'))
    }
  };

  /* pre-expand */
  Object.keys(TRACKS).forEach(function (k) {
    var t = TRACKS[k];
    t._lead = expand(t.lead || []);
    t._harm = expand(t.harmony || []);
    t._bass = expand(t.bass || []);
    t._len = Math.max(t._lead.length, t._harm.length, t._bass.length, (t.drums || []).length);
  });

  /* ---------------- synth ---------------- */

  function ensure() {
    if (ctx) return true;
    var AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return false;
    ctx = new AC();
    master = ctx.createGain();
    master.gain.value = volume;
    master.connect(ctx.destination);
    return true;
  }

  function tone(f, t, dur, type, gain) {
    if (!f) return;
    var o = ctx.createOscillator();
    var g = ctx.createGain();
    o.type = type;
    o.frequency.setValueAtTime(f, t);
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(gain, t + 0.008);
    g.gain.setValueAtTime(gain, t + dur * 0.7);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g); g.connect(master);
    o.start(t); o.stop(t + dur + 0.02);
  }

  var noiseBuf = null;
  function noise(t, dur, gain, lo) {
    if (!noiseBuf) {
      noiseBuf = ctx.createBuffer(1, ctx.sampleRate * 0.4, ctx.sampleRate);
      var d = noiseBuf.getChannelData(0);
      for (var i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    }
    var s = ctx.createBufferSource();
    s.buffer = noiseBuf;
    var f = ctx.createBiquadFilter();
    f.type = lo ? 'lowpass' : 'highpass';
    f.frequency.value = lo ? 180 : 3200;
    var g = ctx.createGain();
    g.gain.setValueAtTime(gain, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    s.connect(f); f.connect(g); g.connect(master);
    s.start(t); s.stop(t + dur + 0.02);
  }

  function scheduleStep(track, i, t) {
    var sixteenth = 60 / track.bpm / 4;
    var L = track._lead[i], H = track._harm[i], B = track._bass[i];
    if (L && L.start && L.note !== '-') tone(freq(L.note), t, sixteenth * L.dur * 0.95, track.wave1 || 'square', 0.16);
    if (H && H.start && H.note !== '-') tone(freq(H.note), t, sixteenth * H.dur * 0.95, track.wave2 || 'square', 0.10);
    if (B && B.start && B.note !== '-') tone(freq(B.note), t, sixteenth * B.dur * 0.95, 'triangle', 0.22);
    var d = track.drums && track.drums[i];
    if (d === 'k') noise(t, 0.09, 0.30, true);
    else if (d === 's') noise(t, 0.07, 0.16, false);
    else if (d === 'h') noise(t, 0.03, 0.05, false);
  }

  function tick() {
    if (!playing || !current) return;
    var track = TRACKS[current];
    var sixteenth = 60 / track.bpm / 4;
    while (nextTime < ctx.currentTime + 0.25) {
      scheduleStep(track, step, nextTime);
      nextTime += sixteenth;
      step++;
      if (step >= track._len) {
        if (track.once) { playing = false; return; }
        step = 0;
      }
    }
  }

  /* ---------------- public ---------------- */

  FE.Music = {
    available: function () { return !!(window.AudioContext || window.webkitAudioContext); },
    unlock: function () {
      if (!ensure()) return;
      if (ctx.state === 'suspended') ctx.resume();
    },
    play: function (name) {
      if (!enabled) { current = name; return; }
      if (!ensure()) return;
      if (ctx.state === 'suspended') ctx.resume();
      if (current === name && playing) return;
      if (!TRACKS[name]) return;
      current = name;
      step = 0;
      nextTime = ctx.currentTime + 0.05;
      playing = true;
      if (timer) clearInterval(timer);
      timer = setInterval(tick, 40);
      tick();
    },
    stop: function () {
      playing = false;
      if (timer) { clearInterval(timer); timer = null; }
    },
    setEnabled: function (v) {
      enabled = v;
      if (!v) this.stop();
      else if (current) this.play(current);
    },
    isEnabled: function () { return enabled; },
    setVolume: function (v) {
      volume = v;
      if (master) master.gain.value = v;
    },
    getVolume: function () { return volume; },
    nowPlaying: function () { return current; },
    tracks: function () { return Object.keys(TRACKS); }
  };

  /* ---------------- sound effects ---------------- */

  FE.Sfx = {
    hit: function () {
      if (!enabled || !ensure()) return;
      var t = ctx.currentTime;
      noise(t, 0.10, 0.20, true);
      tone(160, t, 0.08, 'square', 0.12);
    },
    crit: function () {
      if (!enabled || !ensure()) return;
      var t = ctx.currentTime;
      noise(t, 0.16, 0.28, true);
      tone(320, t, 0.06, 'sawtooth', 0.16);
      tone(160, t + 0.05, 0.14, 'sawtooth', 0.16);
    },
    miss: function () {
      if (!enabled || !ensure()) return;
      noise(ctx.currentTime, 0.07, 0.10, false);
    },
    death: function () {
      if (!enabled || !ensure()) return;
      var t = ctx.currentTime;
      tone(220, t, 0.10, 'square', 0.14);
      tone(165, t + 0.09, 0.10, 'square', 0.14);
      tone(110, t + 0.18, 0.26, 'square', 0.14);
    },
    heal: function () {
      if (!enabled || !ensure()) return;
      var t = ctx.currentTime;
      tone(523, t, 0.09, 'triangle', 0.14);
      tone(659, t + 0.07, 0.09, 'triangle', 0.14);
      tone(784, t + 0.14, 0.16, 'triangle', 0.14);
    },
    levelup: function () {
      if (!enabled || !ensure()) return;
      var t = ctx.currentTime;
      [523, 659, 784, 1047].forEach(function (f, i) {
        tone(f, t + i * 0.08, 0.14, 'square', 0.15);
      });
    },
    select: function () {
      if (!enabled || !ensure()) return;
      tone(880, ctx.currentTime, 0.04, 'square', 0.08);
    },
    cancel: function () {
      if (!enabled || !ensure()) return;
      tone(330, ctx.currentTime, 0.05, 'square', 0.08);
    },
    move: function () {
      if (!enabled || !ensure()) return;
      tone(440, ctx.currentTime, 0.03, 'triangle', 0.06);
    }
  };

})(window.FE = window.FE || {});
