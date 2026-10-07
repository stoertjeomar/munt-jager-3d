import { getAudio } from './audio.js';

// Muziek! Net als de geluidseffecten zelfgemaakt met de Web Audio API: geen muziekbestanden nodig.
// Elk liedje staat hieronder als "bladmuziek" in tekst. Een kleine sequencer speelt de noten op tijd af.
//
//   Noten:  'C5' = de C in octaaf 5, 'F#4' = Fis, 'Bb3' = Bes.   '-' = noot langer aanhouden   '.' = stilte
//   Akkoordpatronen (bas, arpeggio's): R = grondtoon (laag), O = grondtoon een octaaf hoger, 5 = kwint,
//   1 3 5 8 7 = tonen van het akkoord, c = het hele akkoord tegelijk
//   Drums: x = slaan, . = stil
//   div = hoeveel tekens er in één maat staan (8 = achtste noten, 16 = zestiende noten)
//
// Druk op N om de muziek aan of uit te zetten (M zet al het geluid uit).

const NOTE = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 };
const midi = (name) => {
  const m = /^([A-G])([#b]?)(-?\d)$/.exec(name);
  if (!m) throw new Error(`Rare noot: ${name}`);
  return 12 * (Number(m[3]) + 1) + NOTE[m[1]] + (m[2] === '#' ? 1 : m[2] === 'b' ? -1 : 0);
};
const freq = (m) => 440 * 2 ** ((m - 69) / 12);

/** 'Am' → grondtoon (octaaf 3) en de tonen erboven. 'G7' heeft ook een septiem, 'Bdim' is verminderd. */
function chord(name) {
  const m = /^([A-G][#b]?)(m|dim)?(7?)$/.exec(name);
  const root = midi(`${m[1]}3`);
  const third = m[2] ? 3 : 4;
  const fifth = m[2] === 'dim' ? 6 : 7;
  return { root, third, fifth, seventh: m[3] ? 10 : null };
}

// ======================================================================
// De liedjes
// ======================================================================

const SONGS = {
  // Groene Weide: vrolijk wandelen door het gras
  weide: {
    bpm: 108, gain: 0.55,
    chords: ['C', 'Am', 'F', 'G', 'C', 'Em', 'F', 'G'],
    tracks: [
      { inst: 'flute', vol: 0.16, div: 8, fx: true, notes: `
        E5 - G5 - A5 G5 E5 - | C5 - E5 - D5 C5 A4 - | F4 A4 C5 - D5 C5 A4 - | G4 - B4 - D5 - - . |
        E5 - G5 - C6 - B5 A5 | G5 - E5 - B4 - E5 - | F5 E5 D5 C5 A4 - C5 - | B4 - D5 - C5 - - .` },
      { inst: 'bass', vol: 0.22, div: 8, pattern: 'R . 5 . O . 5 .' },
      { inst: 'pluck', vol: 0.07, div: 4, oct: 4, pattern: '. c . c', fx: true },
      { inst: 'drums', vol: 0.5, div: 16, kit: { kick: 'x.......x.......', rim: '....x.......x...', hat: '..x...x...x...x.' } },
    ],
  },

  // Ruïnevallei: op avontuur tussen de oude stenen
  vallei: {
    bpm: 96, gain: 0.55,
    chords: ['G', 'D', 'Em', 'C', 'G', 'D', 'C', 'D'],
    tracks: [
      { inst: 'lead', vol: 0.1, div: 8, fx: true, notes: `
        D5 - B4 - G4 - B4 D5 | F#5 - E5 D5 A4 - D5 - | E5 - G5 - F#5 E5 B4 - | C5 - E5 - G5 - E5 - |
        D5 - G5 - B5 - A5 G5 | F#5 - A5 - D5 - F#5 - | E5 D5 C5 - G4 - C5 E5 | D5 - - - A4 - - .` },
      { inst: 'bass', vol: 0.22, div: 8, pattern: 'R . . R O . 5 .' },
      { inst: 'pad', vol: 0.05, div: 1, oct: 4, pattern: 'c' },
      { inst: 'drums', vol: 0.5, div: 16, kit: { kick: 'x.....x.x.......', snare: '....x.......x...', hat: 'x.x.x.x.x.x.x.x.' } },
    ],
  },

  // Spookwoud: griezelig en mysterieus
  woud: {
    bpm: 84, gain: 0.6,
    chords: ['Am', 'F', 'Dm', 'E', 'Am', 'F', 'E7', 'E'],
    tracks: [
      { inst: 'bell', vol: 0.12, div: 8, fx: true, notes: `
        A4 - - C5 E5 - - - | F5 - E5 - C5 - - - | D5 - F5 - A5 - G5 F5 | E5 - - - G#4 - B4 - |
        A4 - C5 - E5 - A5 - | G5 - F5 - E5 - C5 - | B4 - D5 - G#5 - F5 E5 | E5 - - - - - . .` },
      { inst: 'pluck', vol: 0.08, div: 8, oct: 3, pattern: '1 5 8 3 1 5 8 3', fx: true },
      { inst: 'sub', vol: 0.25, div: 2, pattern: 'R -' },
      { inst: 'drums', vol: 0.45, div: 16, kit: { kick: 'x..x............', tick: '....x.......x...' } },
    ],
  },

  // Rotshoogland: groots en stoer, hoog in de bergen
  hoogland: {
    bpm: 116, gain: 0.55,
    chords: ['Dm', 'C', 'Bb', 'C', 'Dm', 'C', 'Bb', 'A'],
    tracks: [
      { inst: 'lead', vol: 0.1, div: 8, fx: true, notes: `
        D5 - F5 - A5 - G5 F5 | E5 - G5 - E5 - C5 - | D5 - F5 - Bb5 - A5 G5 | A5 - G5 - E5 - - . |
        F5 - A5 - D6 - C6 A5 | G5 - E5 - C5 - E5 G5 | F5 - D5 - Bb4 - D5 F5 | E5 - C#5 - A4 - - .` },
      { inst: 'bass', vol: 0.22, div: 8, pattern: 'R . R O R . R O' },
      { inst: 'pad', vol: 0.05, div: 1, oct: 4, pattern: 'c' },
      { inst: 'drums', vol: 0.5, div: 16, kit: { kick: 'x.......x.x.....', snare: '....x.......x...', hat: 'x.x.x.x.x.x.x.x.' } },
    ],
  },

  // Gewone bosses: spannend en snel
  boss: {
    bpm: 144, gain: 0.6,
    chords: ['Em', 'Em', 'C', 'D', 'Em', 'Em', 'C', 'B'],
    tracks: [
      { inst: 'saw', vol: 0.09, div: 8, fx: true, notes: `
        E5 - B4 - E5 F#5 G5 - | F#5 - E5 - D5 - B4 - | C5 - E5 - G5 - E5 C5 | D5 - F#5 - A5 - F#5 D5 |
        E5 - G5 - B5 - A5 G5 | F#5 - G5 - A5 - B5 - | C6 - B5 - A5 - G5 E5 | D#5 - F#5 - B5 - - .` },
      { inst: 'bass', vol: 0.24, div: 8, pattern: 'R R O R R R O R' },
      { inst: 'drums', vol: 0.55, div: 16, kit: {
        kick: 'x...x...x...x...', snare: '....x.......x...', hat: 'x.x.x.x.x.x.x.x.',
        crash: 'x...............|................|................|................' } },
    ],
  },

  // Het Gekke Kasteel van Omar: spannend orgel terwijl hij op zijn troon zit
  kasteel: {
    bpm: 72, gain: 0.6,
    chords: ['Cm', 'Ab', 'Fm', 'G', 'Cm', 'Ab', 'Db', 'G'],
    tracks: [
      { inst: 'organ', vol: 0.07, div: 1, pattern: 'c' },
      { inst: 'bell', vol: 0.11, div: 4, fx: true, notes: `
        C5 - Eb5 G5 | Ab5 - G5 Eb5 | F5 - Ab5 C6 | B5 - - - | C6 - G5 Eb5 | C5 - Eb5 Ab5 | F5 - Db5 Ab4 | G4 - B4 D5` },
      { inst: 'sub', vol: 0.25, div: 1, pattern: 'R' },
      { inst: 'drums', vol: 0.5, div: 4, kit: { tom: 'x...', kick: 'x.x.' } },
    ],
  },

  // GEKKE BOSS-MUZIEK tegen Omar! Op stand 1 (als hij boos wordt) gaat alles sneller en harder.
  omar: {
    bpm: 156, faster: 1.12, gain: 0.65,
    chords: ['Cm', 'Cm', 'Ab', 'G', 'Cm', 'Cm', 'Fm', 'G', 'Ab', 'Bb', 'Gm', 'Cm', 'Ab', 'Bb', 'G', 'G7'],
    tracks: [
      { inst: 'lead', vol: 0.11, div: 8, fx: true, notes: `
        C5 - G5 - C6 - B5 C6 | G5 Eb5 C5 Eb5 G5 - Ab5 G5 | Ab5 - C6 - Eb6 - C6 Ab5 | B5 - D6 - G6 - F6 D6 |
        C6 - G5 - Eb5 - C5 Eb5 | G5 - C6 - Eb6 - D6 C6 | Ab5 - F5 - C5 - F5 Ab5 | G5 F5 Eb5 D5 B4 - G4 - |
        C5 - Eb5 - Ab5 - G5 Ab5 | D5 - F5 - Bb5 - A5 Bb5 | G5 - Bb5 - D6 - C6 Bb5 | C6 - - - G5 - Eb5 - |
        Eb6 D6 C6 D6 Eb6 - C6 - | F6 Eb6 D6 Eb6 F6 - D6 - | G6 F6 D6 B5 G5 F5 D5 B4 | G4 - B4 - D5 - F5 -` },
      // Als hij boos is: een tweede stem eronder
      { inst: 'saw', vol: 0.06, div: 8, min: 1, shift: -12, fx: true, sameAs: 0 },
      { inst: 'bass', vol: 0.24, div: 8, max: 0, pattern: 'R O R O R O 5 O' },
      { inst: 'bass', vol: 0.24, div: 16, min: 1, pattern: 'R R O R R O R R R O R R 5 5 O O' },
      // Hoempapa-orgel: daar wordt het gek van
      { inst: 'organ', vol: 0.05, div: 8, oct: 4, pattern: '. c . c . c . c' },
      { inst: 'drums', vol: 0.6, div: 16, max: 0, kit: {
        kick: 'x...x...x...x...', snare: '....x.......x...', hat: 'x.x.x.x.x.x.x.x.',
        crash: 'x...............|................|................|................' } },
      { inst: 'drums', vol: 0.65, div: 16, min: 1, kit: {
        kick: 'x.x.x...x.x.x...', snare: '....x.......x..x', hat: 'xxxxxxxxxxxxxxxx',
        crash: 'x...............|................|x...............|................',
        tom: '................|................|................|........x.x.xxxx' } },
    ],
  },

  // Feest! Je hebt Omar verslagen
  feest: {
    bpm: 128, gain: 0.65,
    chords: ['C', 'G', 'Am', 'F', 'C', 'G', 'Am', 'F'],
    tracks: [
      { inst: 'lead', vol: 0.11, div: 8, fx: true, notes: `
        G5 - E5 - G5 - C6 - | B5 - D6 - B5 - G5 - | A5 - C6 - E6 - C6 A5 | F5 - A5 - C6 - A5 - |
        E6 D6 C6 D6 E6 - G6 - | D6 C6 B5 C6 D6 - G5 - | C6 B5 A5 B5 C6 - E6 - | F6 - E6 - D6 - C6 -` },
      { inst: 'bass', vol: 0.24, div: 8, pattern: 'R O R O R O R O' },
      { inst: 'pluck', vol: 0.06, div: 8, oct: 4, pattern: '. c . c . c . c', fx: true },
      { inst: 'drums', vol: 0.6, div: 16, kit: {
        kick: 'x...x...x...x...', clap: '....x.......x...', open: '..x...x...x...x.',
        crash: 'x...............|................|................|................' } },
    ],
  },
};

// Tekst-bladmuziek omzetten naar lijstjes (één keer, bij het laden)
for (const song of Object.values(SONGS)) prepare(song);
function prepare(song) {
  song.chordInfo = song.chords.map(chord);
  for (const track of song.tracks) {
    if (track.notes) track.tokens = track.notes.trim().split(/[\s|]+/).filter(Boolean);
    if (track.pattern) track.tokens = track.pattern.trim().split(/\s+/);
    if (track.kit) {
      track.kitTokens = {};
      for (const [drum, text] of Object.entries(track.kit)) track.kitTokens[drum] = text.replace(/\|/g, '').split('');
    }
    if (track.sameAs !== undefined) track.tokens = song.tracks[track.sameAs].tokens;
  }
}

// ======================================================================
// Instrumenten
// ======================================================================

/** Een toon met een omhullende (zacht beginnen, aanhouden, uitsterven). */
function osc(a, type, f, t, dur, vol, out, { attack = 0.01, release = 0.08, detune = 0, filter = null, q = 1, vibrato = 0 } = {}) {
  const o = a.ctx.createOscillator();
  o.type = type;
  o.frequency.value = f;
  o.detune.value = detune;
  if (vibrato) {
    const lfo = a.ctx.createOscillator();
    const depth = a.ctx.createGain();
    lfo.frequency.value = 5.5;
    depth.gain.value = f * vibrato;
    lfo.connect(depth).connect(o.frequency);
    lfo.start(t);
    lfo.stop(t + dur + release + 0.05);
  }
  const g = a.ctx.createGain();
  g.gain.setValueAtTime(0.0001, t);
  g.gain.linearRampToValueAtTime(vol, t + attack);
  g.gain.setValueAtTime(vol, t + Math.max(attack, dur - release));
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur + release);
  let node = o;
  if (filter) {
    const lp = a.ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.value = filter;
    lp.Q.value = q;
    node = node.connect(lp);
  }
  node.connect(g).connect(out);
  o.start(t);
  o.stop(t + dur + release + 0.05);
}

/** Een tikje dat snel uitsterft (getokkeld, of een belletje). */
function pling(a, type, f, t, decay, vol, out) {
  const o = a.ctx.createOscillator();
  o.type = type;
  o.frequency.value = f;
  const g = a.ctx.createGain();
  g.gain.setValueAtTime(vol, t);
  g.gain.exponentialRampToValueAtTime(0.0001, t + decay);
  o.connect(g).connect(out);
  o.start(t);
  o.stop(t + decay + 0.05);
}

/** Ruis (voor drums). */
function hiss(a, t, dur, vol, out, type, f, q = 1) {
  const src = a.ctx.createBufferSource();
  src.buffer = a.noise;
  const filter = a.ctx.createBiquadFilter();
  filter.type = type;
  filter.frequency.value = f;
  filter.Q.value = q;
  const g = a.ctx.createGain();
  g.gain.setValueAtTime(vol, t);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  src.connect(filter).connect(g).connect(out);
  src.start(t, Math.random() * 0.5);
  src.stop(t + dur + 0.05);
}

const INSTRUMENTS = {
  lead: (a, f, t, d, v, out) => {
    osc(a, 'square', f, t, d, v * 0.6, out, { detune: -7, filter: 2600 });
    osc(a, 'square', f, t, d, v * 0.6, out, { detune: 7, filter: 2600 });
  },
  saw: (a, f, t, d, v, out) => {
    osc(a, 'sawtooth', f, t, d, v * 0.6, out, { detune: -8, filter: 3200 });
    osc(a, 'sawtooth', f, t, d, v * 0.6, out, { detune: 8, filter: 3200 });
  },
  flute: (a, f, t, d, v, out) => osc(a, 'triangle', f, t, d, v * 1.4, out, { attack: 0.04, vibrato: 0.006 }),
  pluck: (a, f, t, d, v, out) => pling(a, 'triangle', f, t, 0.35, v * 1.5, out),
  bell: (a, f, t, d, v, out) => {
    pling(a, 'sine', f, t, 1.2, v, out);
    pling(a, 'sine', f * 2.01, t, 0.6, v * 0.35, out);
    pling(a, 'sine', f * 3.98, t, 0.25, v * 0.15, out);
  },
  bass: (a, f, t, d, v, out) => osc(a, 'sawtooth', f, t, d, v, out, { filter: 520, q: 4, release: 0.04 }),
  sub: (a, f, t, d, v, out) => osc(a, 'triangle', f, t, d, v * 1.3, out, { attack: 0.05, release: 0.3 }),
  pad: (a, f, t, d, v, out) => {
    osc(a, 'sawtooth', f, t, d, v * 0.5, out, { attack: 0.35, release: 0.5, detune: -10, filter: 900 });
    osc(a, 'sawtooth', f, t, d, v * 0.5, out, { attack: 0.35, release: 0.5, detune: 10, filter: 900 });
  },
  organ: (a, f, t, d, v, out) => {
    osc(a, 'sine', f, t, d, v, out, { attack: 0.02, release: 0.1 });
    osc(a, 'sine', f * 2, t, d, v * 0.5, out, { attack: 0.02, release: 0.1 });
    osc(a, 'square', f * 0.5, t, d, v * 0.25, out, { attack: 0.02, release: 0.1, filter: 1200 });
  },
};

const DRUMS = {
  kick: (a, t, v, out) => {
    const o = a.ctx.createOscillator();
    const g = a.ctx.createGain();
    o.frequency.setValueAtTime(150, t);
    o.frequency.exponentialRampToValueAtTime(42, t + 0.14);
    g.gain.setValueAtTime(v * 0.9, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.3);
    o.connect(g).connect(out);
    o.start(t);
    o.stop(t + 0.35);
  },
  snare: (a, t, v, out) => {
    hiss(a, t, 0.16, v * 0.45, out, 'bandpass', 1800, 0.7);
    pling(a, 'triangle', 190, t, 0.1, v * 0.4, out);
  },
  clap: (a, t, v, out) => {
    for (const k of [0, 0.012, 0.024]) hiss(a, t + k, 0.1, v * 0.35, out, 'bandpass', 1400, 1.5);
  },
  rim: (a, t, v, out) => pling(a, 'square', 1700, t, 0.03, v * 0.12, out),
  tick: (a, t, v, out) => hiss(a, t, 0.03, v * 0.15, out, 'highpass', 6000),
  hat: (a, t, v, out) => hiss(a, t, 0.04, v * 0.16, out, 'highpass', 7500),
  open: (a, t, v, out) => hiss(a, t, 0.22, v * 0.16, out, 'highpass', 7000),
  crash: (a, t, v, out) => hiss(a, t, 1.4, v * 0.22, out, 'highpass', 4500),
  tom: (a, t, v, out) => {
    const o = a.ctx.createOscillator();
    const g = a.ctx.createGain();
    o.frequency.setValueAtTime(220, t);
    o.frequency.exponentialRampToValueAtTime(90, t + 0.25);
    g.gain.setValueAtTime(v * 0.6, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.35);
    o.connect(g).connect(out);
    o.start(t);
    o.stop(t + 0.4);
  },
};

// ======================================================================
// De sequencer
// ======================================================================

const STEPS = 16; // de sequencer telt in zestiende noten
const AHEAD = 0.25; // zoveel seconden vooruit plannen we noten in (dan hapert het niet als het spel even hangt)

export class Music {
  constructor() {
    this.enabled = true;
    try {
      this.enabled = localStorage.getItem('munt-jager-3d-muziek') !== 'uit';
    } catch {
      // geen opslag: dan staat de muziek gewoon aan
    }
    this.want = null; // welk liedje er zou moeten spelen
    this.level = 0; // hoe heftig (0 of 1)
    this.song = null; // { name, def, gain, step, next }
    this.out = null;
  }

  /** Muziek aan of uit (N). Geeft terug of hij nu aan staat. */
  toggle() {
    this.enabled = !this.enabled;
    try {
      localStorage.setItem('munt-jager-3d-muziek', this.enabled ? 'aan' : 'uit');
    } catch {
      // niet erg
    }
    if (!this.enabled) this.stop(0.3);
    return this.enabled;
  }

  /** Welk liedje moet er spelen? (null = stilte). level = hoe heftig (bij Omar: 1 als hij boos is). */
  play(name, level = 0) {
    this.want = name;
    this.level = level;
  }

  /** Elke frame aanroepen. De noten zelf worden met een eigen klokje ingepland (ook als het spel even hapert). */
  update() {
    if (this.timer || !getAudio()) return;
    this.timer = setInterval(() => this.tick(), 40);
    this.tick();
  }

  /** Wisselt zo nodig van liedje en plant de volgende noten in. */
  tick() {
    const a = getAudio();
    if (!a) return;
    if (!this.out) this.setup(a);
    const want = this.enabled ? this.want : null;
    if ((this.song?.name ?? null) !== want) {
      this.stop(want ? 0.6 : 1.2);
      if (want) this.start(a, want);
    }
    const s = this.song;
    if (!s) return;
    const now = a.ctx.currentTime;
    if (s.next < now - 0.3) s.next = now + 0.05; // tab was even weg: niet alles tegelijk inhalen
    while (s.next < now + AHEAD) {
      this.playStep(a, s, s.next);
      const bpm = s.def.bpm * (this.level > 0 ? s.def.faster ?? 1 : 1);
      s.next += 60 / bpm / 4;
      s.step++;
    }
  }

  setup(a) {
    // Muziek gaat via een eigen volumeknop, met een echo voor de melodie (dat klinkt ruimtelijker)
    this.out = a.ctx.createGain();
    this.out.gain.value = 0.55;
    this.out.connect(a.master);
    this.fx = a.ctx.createGain();
    const delay = a.ctx.createDelay(1);
    delay.delayTime.value = 0.28;
    const feedback = a.ctx.createGain();
    feedback.gain.value = 0.28;
    const wet = a.ctx.createGain();
    wet.gain.value = 0.25;
    this.fx.connect(delay);
    delay.connect(feedback).connect(delay);
    delay.connect(wet).connect(this.out);
  }

  start(a, name) {
    const def = SONGS[name];
    const gain = a.ctx.createGain();
    gain.gain.setValueAtTime(0.0001, a.ctx.currentTime);
    gain.gain.linearRampToValueAtTime(def.gain, a.ctx.currentTime + 0.4);
    gain.connect(this.out);
    const send = a.ctx.createGain();
    send.connect(gain);
    send.connect(this.fx);
    this.song = { name, def, gain, send, step: 0, next: a.ctx.currentTime + 0.08 };
  }

  /** Huidige liedje zacht laten wegsterven. */
  stop(fade = 0.6) {
    const s = this.song;
    if (!s) return;
    const a = getAudio();
    if (a) {
      const t = a.ctx.currentTime;
      s.gain.gain.cancelScheduledValues(t);
      s.gain.gain.setValueAtTime(s.gain.gain.value, t);
      s.gain.gain.linearRampToValueAtTime(0.0001, t + fade);
      setTimeout(() => s.gain.disconnect(), (fade + 2) * 1000);
    }
    this.song = null;
  }

  playStep(a, s, t) {
    const def = s.def;
    const bars = def.chords.length;
    const bar = Math.floor(s.step / STEPS) % bars;
    const inBar = s.step % STEPS;
    const stepTime = 60 / (def.bpm * (this.level > 0 ? def.faster ?? 1 : 1)) / 4;
    const ch = def.chordInfo[bar];
    for (const track of def.tracks) {
      if (this.level < (track.min ?? 0) || this.level > (track.max ?? 9)) continue;
      const every = STEPS / track.div;
      if (inBar % every) continue;
      const out = track.fx ? s.send : s.gain;
      if (track.kit) {
        for (const [drum, tokens] of Object.entries(track.kitTokens)) {
          const i = (bar * STEPS + inBar) / every;
          if (tokens[i % tokens.length] === 'x') DRUMS[drum](a, t, track.vol, out);
        }
        continue;
      }
      const tokens = track.tokens;
      // Melodie: loopt door over alle maten. Patroon: elke maat opnieuw (op het akkoord van die maat).
      const i = track.notes || track.sameAs !== undefined ? (bar * track.div + inBar / every) % tokens.length : (inBar / every) % tokens.length;
      const token = tokens[i];
      if (token === '.' || token === '-') continue;
      let hold = 1;
      while (tokens[(i + hold) % tokens.length] === '-' && hold < tokens.length) hold++;
      const dur = hold * every * stepTime * 0.92;
      const play = INSTRUMENTS[track.inst];
      const shift = track.shift ?? 0;
      if (track.notes || track.sameAs !== undefined) {
        play(a, freq(midi(token) + shift), t, dur, track.vol, out);
        continue;
      }
      const base = ch.root + 12 * ((track.oct ?? 3) - 3);
      const tones = { 1: 0, 3: ch.third, 5: ch.fifth, 7: ch.seventh ?? 12, 8: 12 };
      if (token === 'c') {
        for (const k of [0, ch.third, ch.fifth]) play(a, freq(base + k), t, dur, track.vol, out);
      } else if (token === 'R') play(a, freq(ch.root - 12), t, dur, track.vol, out);
      else if (token === 'O') play(a, freq(ch.root), t, dur, track.vol, out);
      else if (token in tones) {
        const isBass = track.inst === 'bass' || track.inst === 'sub';
        play(a, freq((isBass ? ch.root - 12 : base) + tones[token]), t, dur, track.vol, out);
      }
    }
  }
}

export const SONG_NAMES = Object.keys(SONGS);
