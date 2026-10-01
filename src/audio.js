// Geluidseffecten, gemaakt met de Web Audio API: geen geluidsbestanden nodig!
// Elk geluid wordt "gesynthetiseerd" uit simpele golven en ruis.
// Druk op M om het geluid aan/uit te zetten.

let ctx = null;
let master = null;
let noiseBuffer = null;
let muted = false;

/** De browser staat geluid pas toe na een klik of toets. Roep dit dan aan. */
export function unlockAudio() {
  if (!ctx) {
    ctx = new (window.AudioContext || window.webkitAudioContext)();
    master = ctx.createGain();
    master.gain.value = 0.5;
    master.connect(ctx.destination);

    // Een seconde witte ruis, voor zwiep- en klap-geluiden
    noiseBuffer = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate);
    const data = noiseBuffer.getChannelData(0);
    for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
  }
  if (ctx.state === 'suspended') ctx.resume();
}

export function toggleMute() {
  muted = !muted;
  if (master) master.gain.value = muted ? 0 : 0.5;
  return muted;
}

function ready() {
  return ctx && !muted && ctx.state === 'running';
}

/** Toon met een frequentie die verschuift van `from` naar `to`. */
function tone({ type = 'sine', from, to = from, duration, volume = 0.3, delay = 0 }) {
  const t = ctx.currentTime + delay;
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();
  osc.type = type;
  osc.frequency.setValueAtTime(from, t);
  osc.frequency.exponentialRampToValueAtTime(Math.max(1, to), t + duration);
  gain.gain.setValueAtTime(0.0001, t);
  gain.gain.exponentialRampToValueAtTime(volume, t + 0.01);
  gain.gain.exponentialRampToValueAtTime(0.0001, t + duration);
  osc.connect(gain).connect(master);
  osc.start(t);
  osc.stop(t + duration + 0.02);
}

/** Ruis door een filter (bandpass) waarvan de frequentie verschuift. */
function noise({ from, to = from, duration, volume = 0.3, q = 1, delay = 0 }) {
  const t = ctx.currentTime + delay;
  const src = ctx.createBufferSource();
  src.buffer = noiseBuffer;
  const filter = ctx.createBiquadFilter();
  filter.type = 'bandpass';
  filter.Q.value = q;
  filter.frequency.setValueAtTime(from, t);
  filter.frequency.exponentialRampToValueAtTime(to, t + duration);
  const gain = ctx.createGain();
  gain.gain.setValueAtTime(0.0001, t);
  gain.gain.exponentialRampToValueAtTime(volume, t + duration * 0.25);
  gain.gain.exponentialRampToValueAtTime(0.0001, t + duration);
  src.connect(filter).connect(gain).connect(master);
  src.start(t, Math.random() * 0.5);
  src.stop(t + duration + 0.02);
}

const SOUNDS = {
  // Zwaard door de lucht: ruis die snel van laag naar hoog en weer terug gaat
  swing: () => noise({ from: 500, to: 2600, duration: 0.18, volume: 0.35, q: 1.5 }),
  heavySwing: () => noise({ from: 250, to: 900, duration: 0.3, volume: 0.45, q: 1.2 }),
  // Raak: korte, harde klap + een lage dreun
  hit: () => {
    noise({ from: 2000, to: 400, duration: 0.12, volume: 0.5, q: 0.8 });
    tone({ type: 'triangle', from: 220, to: 70, duration: 0.15, volume: 0.45 });
  },
  // Vijand verslagen: "plop" naar beneden
  defeat: () => {
    tone({ type: 'square', from: 520, to: 90, duration: 0.25, volume: 0.15 });
    noise({ from: 1200, to: 200, duration: 0.25, volume: 0.25 });
  },
  // Munt: twee vrolijke piepjes
  coin: () => {
    tone({ type: 'square', from: 988, duration: 0.08, volume: 0.12 });
    tone({ type: 'square', from: 1319, duration: 0.25, volume: 0.12, delay: 0.07 });
  },
  // Pijn: lage zaagtand naar beneden
  hurt: () => tone({ type: 'sawtooth', from: 300, to: 80, duration: 0.3, volume: 0.25 }),
  // Wapen oppakken: oplopend akkoordje
  pickup: () => [523, 659, 784, 1047].forEach((f, i) => tone({ type: 'triangle', from: f, duration: 0.15, volume: 0.2, delay: i * 0.06 })),
  // Hartje: zacht en warm
  heal: () => [659, 880].forEach((f, i) => tone({ type: 'sine', from: f, duration: 0.25, volume: 0.25, delay: i * 0.08 })),
  // Springen
  jump: () => tone({ type: 'sine', from: 280, to: 560, duration: 0.15, volume: 0.15 }),
  // Golem slaat op de grond: diepe dreun
  slam: () => {
    tone({ type: 'sine', from: 120, to: 35, duration: 0.5, volume: 0.6 });
    noise({ from: 400, to: 80, duration: 0.4, volume: 0.4, q: 0.7 });
  },
  // Golem laadt op: brommend geluid omhoog
  charge: () => tone({ type: 'sawtooth', from: 60, to: 140, duration: 0.6, volume: 0.12 }),
  // Gewonnen!
  win: () => [523, 659, 784, 1047, 784, 1047].forEach((f, i) => tone({ type: 'square', from: f, duration: 0.18, volume: 0.12, delay: i * 0.11 })),
  lose: () => [392, 330, 262, 196].forEach((f, i) => tone({ type: 'triangle', from: f, duration: 0.3, volume: 0.2, delay: i * 0.18 })),
};

/** Speel een geluid, bijvoorbeeld play('hit'). */
export function play(name) {
  if (!ready()) return;
  SOUNDS[name]?.();
}
