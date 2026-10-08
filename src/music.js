import { getAudio } from './audio.js';

// Muziek! Net als de geluidseffecten zelfgemaakt met de Web Audio API: geen muziekbestanden nodig.
// Elk liedje staat hieronder als "bladmuziek" in tekst. Een kleine sequencer speelt de noten op tijd af.
//
//   Noten:  'C5' = de C in octaaf 5, 'F#4' = Fis, 'Bb3' = Bes.   '-' = noot langer aanhouden   '.' = stilte
//   Akkoordpatronen (bas, arpeggio's): R = grondtoon (laag), O = grondtoon een octaaf hoger, 5 = kwint,
//   1 3 5 8 7 = tonen van het akkoord, b2 en b6 = een halve toon boven de grondtoon/kwint (eng!), c = het hele akkoord tegelijk
//   Drums: x = slaan, . = stil
//   div = hoeveel tekens er in één maat staan (8 = achtste noten, 16 = zestiende noten)
//   intro = zoveel maten aan het begin spelen maar één keer (tracks met intro: true spelen alleen dan)
//   file  = een echt muziekbestand (mp3) in plaats van de bladmuziek. Lukt het laden niet, dan speelt de bladmuziek.
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

// Echte muziek (mp3, zie de Credits in de README). Lukt het laden niet? Dan speelt de zelfgemaakte muziek hieronder.
//   fileStart = hier begint het nummer (seconden)   fileLoop = [van, tot]: aan het eind springt hij terug naar 'van'
//   fightAt   = (Omar) als het gevecht begint en het nummer is nog niet zo ver, dan springt hij hierheen
const BOSS_FILE = 'music/boss-battle.mp3'; // "Where Is Your God Now" door RokNardin: alle gewone bosses
const OMAR_FILE = 'music/omar-boss.mp3'; // "EPIC Boss Fight music" door Carameii: alleen tegen Omar
const DARK_FILE = 'music/black-ops.mp3'; // "Black Ops: Resurrection" door Garzehar: Spookwoud en Rotshoogland

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
    file: DARK_FILE, fileGain: 0.75,
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
    file: DARK_FILE, fileGain: 0.75,
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

  // Gewone bosses: zwaar en dreigend. Eerst een grote klap als je de arena in komt, dan het gevecht.
  boss: {
    file: BOSS_FILE, fileGain: 1, fileStart: 20, fileLoop: [34, 168], // (de eerste 20 seconden slaan we over)
    bpm: 128, gain: 0.72, intro: 2,
    chords: ['Em', 'Em', 'Em', 'Em', 'Cm', 'Cm', 'Am', 'Am', 'F#dim', 'B7'],
    tracks: [
      // ---- Je komt binnen: BOEM ----
      { intro: true, inst: 'choirLow', vol: 0.1, div: 1, oct: 3, pattern: 'c', fx: true },
      { intro: true, inst: 'choir', vol: 0.08, div: 1, oct: 4, pattern: 'c', fx: true },
      { intro: true, inst: 'tuba', vol: 0.16, div: 1, pattern: 'R' },
      { intro: true, inst: 'drums', vol: 0.75, div: 16, kit: {
        subdrop: 'x...............|................', taiko: 'x...............|x.x.x.x.x.x.xxxx', crash: 'x...............|................',
        riser: '................|x...............', osnare: '................|xxxxxxxxxxxxxxxx' } },
      // ---- Het gevecht ----
      { inst: 'choir', vol: 0.08, div: 2, fx: true, notes: `
        B4 - | C5 B4 | G4 - | Ab4 G4 | E4 - | F4 E4 | C5 A4 | D#4 F#4` },
      { inst: 'horns', vol: 0.1, div: 2, shift: -12, fx: true, sameAs: 4 },
      { inst: 'choirLow', vol: 0.08, div: 1, oct: 3, pattern: 'c', fx: true },
      { inst: 'tuba', vol: 0.13, div: 1, pattern: 'R' },
      { inst: 'cello', vol: 0.1, div: 16, pattern: 'R . R R b2 . R . R . R R b2 . O .' },
      { inst: 'trombone', vol: 0.07, div: 8, oct: 3, pattern: 'c - . . . . c .' },
      { inst: 'timpani', vol: 0.2, div: 8, pattern: 'R . . . R . R .' },
      { inst: 'drums', vol: 0.66, div: 16, kit: {
        taiko: 'x.......x.x.....', bigsnare: '........x.......',
        crash: 'x...............|................', subdrop: `x${'.'.repeat(127)}`,
        riser: `${'.'.repeat(112)}x...............`, whisper: `${'.'.repeat(64)}x${'.'.repeat(63)}` } },
    ],
  },

  // Het Schaduwrijk: een langzaam, eng koor en een kerkorgel, met een hartslag eronder
  schaduw: {
    bpm: 66, gain: 0.62,
    chords: ['Dm', 'Bb', 'Gm', 'A', 'Dm', 'F', 'Gm', 'A7'],
    tracks: [
      { inst: 'organ', vol: 0.06, div: 1, pattern: 'c' },
      { inst: 'choirLow', vol: 0.08, div: 1, oct: 3, pattern: 'c', fx: true },
      { inst: 'choir', vol: 0.06, div: 2, fx: true, notes: `
        D5 - | F5 E5 | D5 - | C#5 - | D5 - | A4 C5 | Bb4 G4 | A4 -` },
      { inst: 'bell', vol: 0.07, div: 4, fx: true, notes: `
        A5 . . . | . . F5 . | G5 . . . | . . E5 . | A5 . . . | . . C6 . | Bb5 . . . | A5 . . .` },
      { inst: 'sub', vol: 0.22, div: 1, pattern: 'R' },
      { inst: 'cello', vol: 0.06, div: 8, pattern: 'R . . b2 R . . .' },
      { inst: 'drums', vol: 0.45, div: 8, kit: { kick: 'x..x....', tom: '....x...' } },
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

  // DE ENGSTE MUZIEK VAN HET SPEL, tegen Omar. Als het gevecht begint: een enorme klap met koor, dan stilte
  // met een hartslag, nog een klap en een roffel... en dan barst het los. Alleen enge (mineur) akkoorden,
  // een langzaam koor met lange noten, zware lage koperblazers en een tuba, dreigende strijkers en trommels.
  // Op stand 1 (als hij boos wordt) gaat alles sneller en harder: snelle strijkers en trommels,
  // een hoog vrouwenkoor, krassende violen, gefluister... en Omar die lacht.
  omar: {
    // Tijdens het filmpje (stand -1) komt het nummer al zachtjes op; als het gevecht begint gaat hij vol.
    // Als hij boos is (stand 1) speelt het bestand 7% sneller.
    file: OMAR_FILE, fileGain: 1, fileFaster: 1.07, fileLoop: [22, 169], fightAt: 19.5,
    bpm: 132, faster: 1.15, gain: 0.74, intro: 4,
    chords: [
      'Cm', 'Cm', 'Abm', 'Cm', // het begin
      'Cm', 'Cm', 'Abm', 'Abm', 'Cm', 'Cm', 'F#m', 'F#m', 'Fm', 'Fm', 'Dbm', 'Dbm', 'Abm', 'Abm', 'Bdim', 'Bdim',
    ],
    tracks: [
      // ---- Je komt binnen... ----
      { intro: true, inst: 'choirLow', vol: 0.11, div: 1, oct: 3, pattern: 'c', fx: true },
      { intro: true, inst: 'choir', vol: 0.08, div: 1, oct: 4, pattern: 'c', fx: true },
      { intro: true, inst: 'tuba', vol: 0.16, div: 1, pattern: 'R' },
      { intro: true, inst: 'toll', vol: 0.13, div: 1, pattern: 'O', fx: true },
      { intro: true, inst: 'drums', vol: 0.78, div: 16, kit: {
        subdrop: 'x...............|................|x...............|................',
        taiko: 'x...............|................|x...............|x.x.x.x.x.x.xxxx',
        crash: 'x...............|................|x...............|................',
        heart: '................|x..x......x..x..|................|................',
        whisper: '................|x...............|................|................',
        riser: '................|................|................|x...............',
        osnare: '................|................|................|xxxxxxxxxxxxxxxx' } },
      // ---- Het gevecht ----
      // Het koor zingt de melodie: lange, enge noten (halve en hele noten)
      { inst: 'choir', vol: 0.085, div: 2, fx: true, notes: `
        G4 - | Ab4 G4 | Eb5 - | D5 Eb5 | C5 - | Db5 C5 | C#5 - | D5 C#5 |
        C5 - | Db5 Ab4 | Ab4 - | G4 Ab4 | Eb5 - | Cb5 Bb4 | Ab4 - | D4 B3` },
      // Lage hoorns spelen hetzelfde, een octaaf lager
      { inst: 'horns', vol: 0.1, div: 2, shift: -12, fx: true, sameAs: 5 },
      // Als hij boos is: een hoog vrouwenkoor erbij
      { inst: 'choirHi', vol: 0.055, div: 2, min: 1, shift: 12, fx: true, sameAs: 5 },
      { inst: 'choirLow', vol: 0.09, div: 1, oct: 3, pattern: 'c', fx: true },
      { inst: 'tuba', vol: 0.14, div: 1, pattern: 'R' },
      { inst: 'drone', vol: 0.09, div: 1, pattern: 'R' },
      // Dreigende lage strijkers (met een enge halve toon, b2)
      { inst: 'cello', vol: 0.1, div: 16, max: 0, pattern: 'R . R R b2 . R . R . R R b2 . O .' },
      { inst: 'cello', vol: 0.1, div: 16, min: 1, pattern: 'R R R R b2 R R R R R R R b2 R O R' },
      // Zware koperstoten
      { inst: 'trombone', vol: 0.07, div: 8, max: 0, oct: 3, pattern: 'c - . . . . c .' },
      { inst: 'trombone', vol: 0.07, div: 8, min: 1, oct: 3, pattern: 'c . . c . . c .' },
      { inst: 'timpani', vol: 0.2, div: 8, max: 0, pattern: 'R . . . R . R .' },
      { inst: 'timpani', vol: 0.14, div: 16, min: 1, pattern: 'R . R . R . R . R R R . R . R R' },
      // Een diepe kerkklok, elke 4 maten
      { inst: 'toll', vol: 0.1, div: 1, fx: true, notes: 'C3 . . . C3 . . . F3 . . . Ab2 . . .' },
      // Krassende violen (als hij boos is)
      { inst: 'screech', vol: 0.02, div: 1, min: 1, oct: 5, pattern: '8' },
      { inst: 'drums', vol: 0.66, div: 16, max: 0, kit: {
        taiko: 'x.......x.x.....', bigsnare: '........x.......',
        crash: 'x...............|................', subdrop: `x${'.'.repeat(127)}`,
        riser: `${'.'.repeat(112)}x...............`, whisper: `${'.'.repeat(80)}x${'.'.repeat(47)}` } },
      { inst: 'drums', vol: 0.58, div: 16, min: 1, kit: {
        taiko: 'x.x.x.x.x.x.x.x.', boom: 'x.......x.......', bigsnare: '....x.......x...',
        crash: 'x...............|................', subdrop: `x${'.'.repeat(63)}`,
        riser: `${'.'.repeat(112)}x...............`, whisper: `${'.'.repeat(48)}x${'.'.repeat(79)}`,
        laugh: `${'.'.repeat(240)}x${'.'.repeat(15)}` } },
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

// Vervorming: maakt een geluid ruw en grommend (voor de enge bas en het brullende koper)
const curves = {};
function distortion(a, amount) {
  if (!curves[amount]) {
    const c = new Float32Array(1024);
    for (let i = 0; i < c.length; i++) c[i] = Math.tanh((i / 511.5 - 1) * amount);
    curves[amount] = c;
  }
  const ws = a.ctx.createWaveShaper();
  ws.curve = curves[amount];
  return ws;
}

/** Omhullende: zacht beginnen, aanhouden en uitsterven. Geeft de volumeknop terug. */
function envelope(a, t, dur, vol, attack, release) {
  const g = a.ctx.createGain();
  g.gain.setValueAtTime(0.0001, t);
  g.gain.linearRampToValueAtTime(vol, t + attack);
  g.gain.setValueAtTime(vol, t + Math.max(attack, dur - release));
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur + release);
  return g;
}

/** Een paar zaagtand-golven (een beetje ontstemd: dan klinkt het voller) die allemaal naar `into` gaan. */
function saws(a, f, t, stop, into, detunes, type = 'sawtooth') {
  for (const d of detunes) {
    const o = a.ctx.createOscillator();
    o.type = type;
    o.frequency.value = f;
    o.detune.value = d;
    o.connect(into);
    o.start(t);
    o.stop(stop);
  }
}

function filter(a, type, f, q = 1) {
  const node = a.ctx.createBiquadFilter();
  node.type = type;
  node.frequency.value = f;
  node.Q.value = q;
  return node;
}

// Klinkers voor het koor: de "mond" (filters) waar het geluid doorheen gaat
const VOWELS = {
  a: [[800, 1], [1150, 0.6], [2900, 0.2]],
  o: [[450, 1], [800, 0.55], [2830, 0.12]],
};

/** Een koor: vier stemmen die net niet gelijk zingen (met een beetje trilling), door een "mond". */
function voices(a, f, t, d, v, out, vowel, vibratoHz = 5) {
  const attack = Math.min(0.35, d * 0.3);
  const g = envelope(a, t, d, v * 3.2, attack, Math.min(0.6, d * 0.4));
  const mouth = a.ctx.createGain();
  for (const [freq, level] of vowel) {
    const bp = filter(a, 'bandpass', freq, freq < 1000 ? 5 : 8);
    const lvl = a.ctx.createGain();
    lvl.gain.value = level;
    mouth.connect(bp).connect(lvl).connect(g);
  }
  const lfo = a.ctx.createOscillator();
  const depth = a.ctx.createGain();
  lfo.frequency.value = vibratoHz;
  depth.gain.value = f * 0.007;
  lfo.start(t);
  lfo.stop(t + d + 0.7);
  lfo.connect(depth);
  for (const det of [-16, -6, 6, 16]) {
    const o = a.ctx.createOscillator();
    o.type = 'sawtooth';
    o.frequency.value = f;
    o.detune.value = det;
    depth.connect(o.frequency);
    o.connect(mouth);
    o.start(t);
    o.stop(t + d + 0.7);
  }
  g.connect(out);
}

const INSTRUMENTS = {
  // Brullend koper: ruw, en het "gaat open" aan het begin van elke noot
  brass: (a, f, t, d, v, out) => {
    const g = envelope(a, t, d, v, 0.02, 0.1);
    const lp = filter(a, 'lowpass', 300, 3);
    lp.frequency.setValueAtTime(300, t);
    lp.frequency.exponentialRampToValueAtTime(2600, t + 0.06);
    lp.frequency.exponentialRampToValueAtTime(1300, t + 0.3);
    const ws = distortion(a, 2.5);
    saws(a, f, t, t + d + 0.2, ws, [-9, 9]);
    ws.connect(lp).connect(g).connect(out);
  },
  // Grommende bas: vervormd en laag
  growl: (a, f, t, d, v, out) => {
    const g = envelope(a, t, d, v, 0.004, 0.04);
    const ws = distortion(a, 6);
    saws(a, f, t, t + d + 0.1, ws, [-12, 12]);
    ws.connect(filter(a, 'lowpass', 900, 2)).connect(g).connect(out);
  },
  // Diep brommen onder alles (het filter beweegt langzaam heen en weer)
  drone: (a, f, t, d, v, out) => {
    const g = envelope(a, t, d, v, 0.4, 0.6);
    const lp = filter(a, 'lowpass', 260, 8);
    const lfo = a.ctx.createOscillator();
    const depth = a.ctx.createGain();
    lfo.frequency.value = 0.35;
    depth.gain.value = 120;
    lfo.connect(depth).connect(lp.frequency);
    lfo.start(t);
    lfo.stop(t + d + 0.7);
    saws(a, f, t, t + d + 0.7, lp, [-6, 6]);
    lp.connect(g).connect(out);
  },
  // Spookkoor: "aaah" (zaagtanden door twee filters die klinken als een mond)
  choir: (a, f, t, d, v, out) => {
    const g = envelope(a, t, d, v * 3, 0.5, 0.8);
    const mouth = a.ctx.createGain();
    const f1 = filter(a, 'bandpass', 700, 4);
    const f2 = filter(a, 'bandpass', 1150, 5);
    const f2gain = a.ctx.createGain();
    f2gain.gain.value = 0.6;
    mouth.connect(f1).connect(g);
    mouth.connect(f2).connect(f2gain).connect(g);
    saws(a, f, t, t + d + 0.9, mouth, [-14, 0, 14]);
    g.connect(out);
  },
  // Een diepe kerkklok (de tonen van een klok passen niet precies bij elkaar: daarom klinkt het zo spookachtig)
  toll: (a, f, t, d, v, out) => {
    for (const [ratio, vol, decay] of [[1, 1, 3.5], [2, 0.45, 2.5], [2.76, 0.35, 1.8], [5.4, 0.18, 0.9], [8.9, 0.08, 0.4]]) {
      pling(a, 'sine', f * ratio, t, decay, v * vol, out);
    }
    hiss(a, t, 0.08, v * 0.4, out, 'bandpass', 3000, 1);
  },
  // Lage strijkers (cello's en contrabassen): kort en hard aangestreken, met een diepe toon eronder
  cello: (a, f, t, d, v, out) => {
    const g = envelope(a, t, d, v, 0.008, 0.06);
    const lp = filter(a, 'lowpass', 1400, 0.7);
    saws(a, f, t, t + d + 0.1, lp, [-10, 0, 10]);
    lp.connect(g).connect(out);
    osc(a, 'sine', f / 2, t, d, v * 0.6, out, { attack: 0.008, release: 0.06 });
  },
  // Hoorns: donker en dreigend koper (zacht beginnen, dan zwelt het aan)
  horns: (a, f, t, d, v, out) => {
    const g = envelope(a, t, d, v, 0.12, 0.25);
    const lp = filter(a, 'lowpass', 300, 1.2);
    lp.frequency.setValueAtTime(300, t);
    lp.frequency.exponentialRampToValueAtTime(1200, t + 0.25);
    lp.frequency.exponentialRampToValueAtTime(800, t + 0.8);
    saws(a, f, t, t + d + 0.3, lp, [-8, 0, 8]);
    lp.connect(g).connect(out);
  },
  // Tuba: heel laag koper dat je in je buik voelt
  tuba: (a, f, t, d, v, out) => {
    const g = envelope(a, t, d, v, 0.12, 0.3);
    const lp = filter(a, 'lowpass', 450, 1);
    saws(a, f, t, t + d + 0.4, lp, [-5, 5]);
    lp.connect(g).connect(out);
    osc(a, 'sine', f, t, d, v * 0.8, out, { attack: 0.12, release: 0.3 });
  },
  // Trombones: ruwe, harde stoten
  trombone: (a, f, t, d, v, out) => {
    const g = envelope(a, t, d, v, 0.02, 0.1);
    const lp = filter(a, 'lowpass', 300, 2);
    lp.frequency.setValueAtTime(300, t);
    lp.frequency.exponentialRampToValueAtTime(2200, t + 0.05);
    lp.frequency.exponentialRampToValueAtTime(900, t + 0.25);
    const ws = distortion(a, 1.5);
    saws(a, f, t, t + d + 0.15, ws, [-6, 6]);
    ws.connect(lp).connect(g).connect(out);
  },
  // Koren: "aaah" (gewoon), "oooh" (laag mannenkoor) en hoog vrouwenkoor
  choir: (a, f, t, d, v, out) => voices(a, f, t, d, v, out, VOWELS.a),
  choirLow: (a, f, t, d, v, out) => voices(a, f, t, d, v, out, VOWELS.o),
  choirHi: (a, f, t, d, v, out) => voices(a, f, t, d, v, out, VOWELS.a, 7),
  // Pauken: een grote trom met een toonhoogte
  timpani: (a, f, t, d, v, out) => {
    const o = a.ctx.createOscillator();
    const g = a.ctx.createGain();
    o.frequency.setValueAtTime(f * 1.04, t);
    o.frequency.exponentialRampToValueAtTime(f, t + 0.08);
    g.gain.setValueAtTime(v, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 1.1);
    o.connect(g).connect(out);
    o.start(t);
    o.stop(t + 1.2);
    pling(a, 'sine', f * 1.5, t, 0.5, v * 0.3, out);
    hiss(a, t, 0.08, v * 0.5, out, 'lowpass', 400);
  },
  // Krassende violen: drie noten vlak naast elkaar die langzaam omhoog glijden en trillen (heel eng)
  screech: (a, f, t, d, v, out) => {
    const g = envelope(a, t, d, v, 0.3, 0.3);
    const trem = a.ctx.createGain();
    const lfo = a.ctx.createOscillator();
    const depth = a.ctx.createGain();
    lfo.frequency.value = 13;
    depth.gain.value = 0.5;
    lfo.connect(depth).connect(trem.gain);
    lfo.start(t);
    lfo.stop(t + d + 0.4);
    const hp = filter(a, 'highpass', 1500, 0.7);
    for (const k of [1, 1.059, 1.122]) {
      const o = a.ctx.createOscillator();
      o.type = 'sawtooth';
      o.frequency.setValueAtTime(f * k, t);
      o.frequency.exponentialRampToValueAtTime(f * k * 1.06, t + d);
      o.connect(hp);
      o.start(t);
      o.stop(t + d + 0.4);
    }
    hp.connect(trem).connect(g).connect(out);
  },
  // Gillende violen (heel snel heen en weer tussen twee noten)
  strings: (a, f, t, d, v, out) => osc(a, 'sawtooth', f, t, d, v, out, { attack: 0.005, release: 0.03, filter: 3000 }),
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
  // Zware bassdrum: BOEM (met een tikje erbovenop)
  boom: (a, t, v, out) => {
    const o = a.ctx.createOscillator();
    const g = a.ctx.createGain();
    o.frequency.setValueAtTime(120, t);
    o.frequency.exponentialRampToValueAtTime(32, t + 0.3);
    g.gain.setValueAtTime(v, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.55);
    o.connect(g).connect(out);
    o.start(t);
    o.stop(t + 0.6);
    hiss(a, t, 0.015, v * 0.3, out, 'highpass', 3000);
  },
  // Snelle, strakke bassdrum (voor de dubbele bassdrum als Omar boos is)
  dbl: (a, t, v, out) => {
    const o = a.ctx.createOscillator();
    const g = a.ctx.createGain();
    o.frequency.setValueAtTime(130, t);
    o.frequency.exponentialRampToValueAtTime(55, t + 0.06);
    g.gain.setValueAtTime(v * 0.6, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.12);
    o.connect(g).connect(out);
    o.start(t);
    o.stop(t + 0.15);
  },
  // Hartslag: doem... (heel laag)
  heart: (a, t, v, out) => {
    const o = a.ctx.createOscillator();
    const g = a.ctx.createGain();
    o.frequency.setValueAtTime(62, t);
    o.frequency.exponentialRampToValueAtTime(38, t + 0.18);
    g.gain.setValueAtTime(v * 0.9, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.3);
    o.connect(g).connect(out);
    o.start(t);
    o.stop(t + 0.35);
    hiss(a, t, 0.06, v * 0.25, out, 'lowpass', 200);
  },
  // Taiko: een enorme Japanse trom (DOEM)
  taiko: (a, t, v, out) => {
    const o = a.ctx.createOscillator();
    const g = a.ctx.createGain();
    o.frequency.setValueAtTime(95, t);
    o.frequency.exponentialRampToValueAtTime(48, t + 0.35);
    g.gain.setValueAtTime(v, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.5);
    o.connect(g).connect(out);
    o.start(t);
    o.stop(t + 0.55);
    hiss(a, t, 0.1, v * 0.5, out, 'lowpass', 300);
  },
  // Orkest-snaredrum (strak, voor roffels)
  osnare: (a, t, v, out) => {
    hiss(a, t, 0.15, v * 0.35, out, 'bandpass', 2600, 0.8);
    hiss(a, t, 0.06, v * 0.15, out, 'highpass', 6000);
  },
  // Heel diepe dreun die je voelt (aan het begin van een stuk)
  subdrop: (a, t, v, out) => {
    const o = a.ctx.createOscillator();
    const g = a.ctx.createGain();
    o.frequency.setValueAtTime(58, t);
    o.frequency.exponentialRampToValueAtTime(26, t + 1.3);
    g.gain.setValueAtTime(v * 1.1, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 1.7);
    o.connect(g).connect(out);
    o.start(t);
    o.stop(t + 1.8);
  },
  // Aanzwellend gesis: "er komt iets aan!" (precies één maat lang)
  riser: (a, t, v, out, bar) => {
    const src = a.ctx.createBufferSource();
    src.buffer = a.noise;
    src.loop = true;
    const hp = filter(a, 'highpass', 400, 1);
    hp.frequency.setValueAtTime(400, t);
    hp.frequency.exponentialRampToValueAtTime(6000, t + bar);
    const g = a.ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(v * 0.35, t + bar * 0.95);
    g.gain.linearRampToValueAtTime(0.0001, t + bar);
    src.connect(hp).connect(g).connect(out);
    src.start(t);
    src.stop(t + bar + 0.05);
  },
  // Gefluister: ruis die als een stem klinkt, ergens links of rechts van je
  whisper: (a, t, v, out) => {
    const src = a.ctx.createBufferSource();
    src.buffer = a.noise;
    src.loop = true;
    const bp = filter(a, 'bandpass', 2500, 7);
    const g = a.ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    let k = t;
    for (let i = 0; i < 9; i++) {
      bp.frequency.setValueAtTime(1800 + Math.random() * 2200, k);
      g.gain.linearRampToValueAtTime(v * (0.15 + Math.random() * 0.25), k + 0.05);
      g.gain.linearRampToValueAtTime(v * 0.02, k + 0.13);
      k += 0.14;
    }
    g.gain.linearRampToValueAtTime(0.0001, k + 0.1);
    let node = src.connect(bp).connect(g);
    if (a.ctx.createStereoPanner) {
      const pan = a.ctx.createStereoPanner();
      pan.pan.value = Math.random() < 0.5 ? -0.7 : 0.7;
      node = node.connect(pan);
    }
    node.connect(out);
    src.start(t);
    src.stop(k + 0.2);
  },
  // Omar lacht, diep en eng: "HA... HA... HA... HAAA"
  laugh: (a, t, v, out) => {
    for (let i = 0; i < 4; i++) {
      const at = t + i * 0.22;
      const len = i === 3 ? 0.4 : 0.13;
      const f = 118 - i * 9;
      voices(a, f, at, len, v * 0.25, out, VOWELS.a, 6);
      hiss(a, at, len, v * 0.05, out, 'bandpass', 1200, 2);
    }
  },
  // Grote, harde snaredrum
  bigsnare: (a, t, v, out) => {
    hiss(a, t, 0.32, v * 0.6, out, 'bandpass', 1600, 0.5);
    hiss(a, t, 0.12, v * 0.25, out, 'highpass', 5000);
    pling(a, 'triangle', 170, t, 0.15, v * 0.5, out);
  },
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
// Muziekbestanden (mp3)
// ======================================================================

const files = {}; // { pad: { el, source, ok } }  ok: null = nog bezig, true = gelukt, false = mislukt

/** Een muziekbestand klaarzetten (één keer). Het geluid gaat door de Web Audio API, zodat M en N ook hiervoor werken. */
function loadFile(a, path) {
  let f = files[path];
  if (!f) {
    const el = new Audio(path);
    el.loop = true;
    el.preload = 'auto';
    f = { el, source: null, ok: null };
    files[path] = f;
    el.addEventListener('canplaythrough', () => { if (f.ok === null) f.ok = true; });
    el.addEventListener('error', () => { f.ok = false; });
  }
  if (!f.source) f.source = a.ctx.createMediaElementSource(f.el);
  return f;
}

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
    // De boss-muziek alvast laden, dan speelt hij meteen als het gevecht begint
    setTimeout(() => {
      const a = getAudio();
      for (const name of this.preloads ?? []) if (a && SONGS[name]?.file) loadFile(a, SONGS[name].file);
    }, 1500);
  }

  /** Dit liedje alvast laden (als het een muziekbestand is), zodat het meteen kan spelen. */
  preload(name) {
    (this.preloads ??= []).push(name);
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
    if (s.file) {
      if (s.file.ok !== false) {
        this.tickFile(a, s);
        return;
      }
      // Het bestand lukte niet: dan toch de zelfgemaakte muziek
      s.file = null;
      s.gain.gain.cancelScheduledValues(now);
      s.gain.gain.setValueAtTime(s.def.gain, now);
      s.next = now + 0.05;
    }
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
    this.out.gain.value = 0.75; // muziek-volume (hoger = harder)
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
    this.song = { name, def, gain, send, step: 0, next: a.ctx.currentTime + 0.08, file: null };
    if (def.file && files[def.file]?.ok !== false) this.startFile(a, this.song);
  }

  /** Het mp3-bestand vanaf het begin laten spelen (in plaats van de bladmuziek). */
  startFile(a, s) {
    const f = loadFile(a, s.def.file);
    const def = s.def;
    f.source.disconnect();
    f.source.connect(s.gain);
    const now = a.ctx.currentTime;
    s.gain.gain.cancelScheduledValues(now);
    s.gain.gain.setValueAtTime(0.0001, now);
    f.el.loop = !def.fileLoop;
    f.el.currentTime = def.fileStart ?? 0;
    f.el.playbackRate = 1;
    f.el.play().catch(() => { f.ok = false; });
    s.file = f;
    s.fileLevel = this.level;
    // Moet hij later beginnen? Dan stil blijven tot hij daarheen kan springen (als het bestand nog laadt kan dat niet meteen)
    s.seekTo = def.fileStart || null;
    s.seekWait = 0;
    if (!s.seekTo) this.fadeInFile(a, s);
  }

  /** Bestand aanzetten: bij stand -1 (Omar praat nog) heel langzaam zachtjes opkomen, anders snel vol. */
  fadeInFile(a, s) {
    const now = a.ctx.currentTime;
    const full = s.def.fileGain ?? 1;
    s.gain.gain.cancelScheduledValues(now);
    s.gain.gain.setValueAtTime(0.0001, now);
    if (this.level < 0) s.gain.gain.linearRampToValueAtTime(full * 0.45, now + 10);
    else s.gain.gain.linearRampToValueAtTime(full, now + 0.3);
  }

  /** Naar een plek in het bestand springen, zodra dat kan. Geeft true als het gelukt is. */
  seekFile(el, time) {
    const r = el.seekable;
    for (let i = 0; i < r.length; i++) {
      if (r.start(i) <= time && r.end(i) >= time) {
        el.currentTime = time;
        return true;
      }
    }
    return Math.abs(el.currentTime - time) < 0.5;
  }

  /** Elke tik: herhalen, sneller als Omar boos is, en vol als het gevecht begint. */
  tickFile(a, s) {
    const { el } = s.file;
    const def = s.def;
    if (s.seekTo != null) {
      s.seekWait += 0.04;
      if (this.seekFile(el, s.seekTo) || s.seekWait > 6) {
        s.seekTo = null;
        this.fadeInFile(a, s);
      }
      return;
    }
    if (s.jumpTo != null) {
      // Naar het spannende stuk springen (opnieuw proberen tot het bestand ver genoeg geladen is)
      s.jumpWait += 0.04;
      if (el.currentTime >= s.jumpTo || this.seekFile(el, s.jumpTo) || s.jumpWait > 8) s.jumpTo = null;
    }
    el.playbackRate = this.level > 0 ? def.fileFaster ?? 1 : 1; // Omar boos: sneller
    if (def.fileLoop && (el.currentTime >= def.fileLoop[1] || el.ended)) {
      if (!this.seekFile(el, def.fileLoop[0])) el.currentTime = 0; // (kan hij niet springen? dan gewoon opnieuw)
      if (el.paused) el.play().catch(() => {});
    }
    if (this.level !== s.fileLevel) {
      // Van "zachtjes opkomen" naar het gevecht: nu vol (en meteen naar het spannende stuk)
      const now = a.ctx.currentTime;
      s.gain.gain.cancelScheduledValues(now);
      s.gain.gain.setValueAtTime(Math.max(0.0001, s.gain.gain.value), now);
      s.gain.gain.linearRampToValueAtTime((def.fileGain ?? 1) * (this.level < 0 ? 0.45 : 1), now + 1.2);
      if (s.fileLevel < 0 && this.level >= 0 && def.fightAt && el.currentTime < def.fightAt) {
        s.jumpTo = def.fightAt;
        s.jumpWait = 0;
      }
      s.fileLevel = this.level;
    }
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
    if (s.file) {
      const f = s.file;
      setTimeout(() => { if (this.song?.file !== f) f.el.pause(); }, fade * 1000 + 100);
    }
    this.song = null;
  }

  playStep(a, s, t) {
    const def = s.def;
    // Sommige liedjes hebben een begin (intro) dat maar één keer speelt; daarna herhaalt de rest zich
    const intro = def.intro ?? 0;
    const total = Math.floor(s.step / STEPS);
    const inIntro = total < intro;
    const chordBar = inIntro ? total : intro + ((total - intro) % (def.chords.length - intro));
    const bar = inIntro ? total : chordBar - intro; // maat binnen het stuk (begin of herhaling)
    const inBar = s.step % STEPS;
    const stepTime = 60 / (def.bpm * (this.level > 0 ? def.faster ?? 1 : 1)) / 4;
    const ch = def.chordInfo[chordBar];
    for (const track of def.tracks) {
      if (!!track.intro !== inIntro) continue;
      const level = Math.max(0, this.level);
      if (level < (track.min ?? 0) || level > (track.max ?? 9)) continue;
      const every = STEPS / track.div;
      if (inBar % every) continue;
      const out = track.fx ? s.send : s.gain;
      if (track.kit) {
        for (const [drum, tokens] of Object.entries(track.kitTokens)) {
          const i = (bar * STEPS + inBar) / every;
          if (tokens[i % tokens.length] === 'x') DRUMS[drum](a, t, track.vol, out, stepTime * STEPS);
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
      const tones = { 1: 0, 3: ch.third, 5: ch.fifth, 7: ch.seventh ?? 12, 8: 12, b2: 1, b6: 8 };
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
