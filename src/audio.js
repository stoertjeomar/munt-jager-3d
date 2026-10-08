// Geluidseffecten, gemaakt met de Web Audio API: geen geluidsbestanden nodig!
// Elk geluid wordt "gesynthetiseerd" uit simpele golven en ruis.
// Druk op M om het geluid aan/uit te zetten. (De muziek staat in music.js: N zet die aan/uit.)

let ctx = null;
let master = null;
let noiseBuffer = null;
let muted = false;

// Echte geluiden uit het Kenney Starter Kit (sounds/) en een paar extra (sounds/extra/, zie de Credits).
// Als ze geladen zijn, worden ze gebruikt in plaats van het zelfgemaakte geluid met dezelfde naam.
const SAMPLE_FILES = {
  jump: 'jump.ogg', coin: 'coin.ogg', land: 'land.ogg', defeat: 'break.ogg', lose: 'fall.ogg', steps: 'walking.ogg',
  boing: 'extra/boing.mp3', // op een vijand springen
  punch: 'extra/punch.mp3', // een vijand verslaan
  wow: 'extra/wow.mp3', // een level omhoog
  faaah: 'extra/faaah.mp3', // doodgaan
  shine: 'extra/shine.mp3', // een kist openen
  donder: 'extra/donder.mp3', // Omars bliksem
};
// Hoe hard elk geluidje klinkt (0 tot 1)
const SAMPLE_VOLUME = { lose: 0.8, boing: 1, punch: 0.15, defeat: 0.35, wow: 0.7, faaah: 0.6, shine: 0.7, donder: 0.9 };
const MASTER = 0.9; // hoofdvolume (hoger = harder)
const samples = {};
let footsteps = null;

async function loadSamples() {
  for (const [name, file] of Object.entries(SAMPLE_FILES)) {
    try {
      const data = await (await fetch(`sounds/${file}`)).arrayBuffer();
      samples[name] = await ctx.decodeAudioData(data);
    } catch {
      // geen probleem: dan gebruiken we het zelfgemaakte geluid
    }
  }
}

function playSample(name, volume = 0.6, rate = 1) {
  const src = ctx.createBufferSource();
  src.buffer = samples[name];
  src.playbackRate.value = rate * (0.95 + Math.random() * 0.1);
  const gain = ctx.createGain();
  gain.gain.value = volume;
  src.connect(gain).connect(master);
  src.start();
  return { src, gain };
}

/** Voetstappen aan (tijdens lopen) of uit. `fast` = sprinten. */
export function setFootsteps(on, fast = false) {
  if (!ready() || !samples.steps) {
    if (footsteps && !on) footsteps.src.stop();
    if (!on) footsteps = null;
    return;
  }
  if (on && !footsteps) {
    footsteps = playSample('steps', 0.35, fast ? 1.4 : 1);
    footsteps.src.loop = true;
  } else if (!on && footsteps) {
    footsteps.src.stop();
    footsteps = null;
  } else if (footsteps) {
    footsteps.src.playbackRate.value = fast ? 1.4 : 1;
  }
}

/** De browser staat geluid pas toe na een klik of toets. Roep dit dan aan. */
export function unlockAudio() {
  if (!ctx) {
    ctx = new (window.AudioContext || window.webkitAudioContext)();
    master = ctx.createGain();
    master.gain.value = MASTER;
    // Een begrenzer: alles mag hard, maar het gaat nooit kraken (ook niet als er veel tegelijk klinkt)
    const limiter = ctx.createDynamicsCompressor();
    limiter.threshold.value = -8;
    limiter.knee.value = 6;
    limiter.ratio.value = 12;
    limiter.attack.value = 0.003;
    limiter.release.value = 0.25;
    master.connect(limiter).connect(ctx.destination);

    // Een seconde witte ruis, voor zwiep- en klap-geluiden
    noiseBuffer = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate);
    const data = noiseBuffer.getChannelData(0);
    for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
    loadSamples();
  }
  if (ctx.state === 'suspended') ctx.resume();
}

export function toggleMute() {
  muted = !muted;
  if (master) master.gain.value = muted ? 0 : MASTER;
  return muted;
}

function ready() {
  return ctx && !muted && ctx.state === 'running';
}

/** Voor music.js: de geluidskaart, de hoofdvolumeknop en de ruis (of null als het geluid nog niet mag). */
export function getAudio() {
  return ctx && ctx.state === 'running' ? { ctx, master, noise: noiseBuffer } : null;
}

/** Toon met een frequentie die verschuift van `from` naar `to`. pan = links (-1) of rechts (1). */
function tone({ type = 'sine', from, to = from, duration, volume = 0.3, delay = 0, pan = 0 }) {
  const t = ctx.currentTime + delay;
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();
  osc.type = type;
  osc.frequency.setValueAtTime(from, t);
  osc.frequency.exponentialRampToValueAtTime(Math.max(1, to), t + duration);
  gain.gain.setValueAtTime(0.0001, t);
  gain.gain.exponentialRampToValueAtTime(volume, t + 0.01);
  gain.gain.exponentialRampToValueAtTime(0.0001, t + duration);
  if (pan && ctx.createStereoPanner) {
    const panner = ctx.createStereoPanner();
    panner.pan.value = pan;
    osc.connect(gain).connect(panner).connect(master);
  } else osc.connect(gain).connect(master);
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
  laser: () => tone({ type: 'sawtooth', from: 1400, to: 200, duration: 0.25, volume: 0.15 }),
  // Gewonnen!
  win: () => [523, 659, 784, 1047, 784, 1047].forEach((f, i) => tone({ type: 'square', from: f, duration: 0.18, volume: 0.12, delay: i * 0.11 })),
  lose: () => [392, 330, 262, 196].forEach((f, i) => tone({ type: 'triangle', from: f, duration: 0.3, volume: 0.2, delay: i * 0.18 })),
  // Omar lacht je uit: "ha-ha-ha-ha" naar beneden
  laugh: () => [520, 470, 430, 380].forEach((f, i) => tone({ type: 'square', from: f, to: f * 0.8, duration: 0.12, volume: 0.12, delay: i * 0.15 })),
  // Wind die aanzwelt (Omar neemt je mee)
  whoosh: () => noise({ from: 200, to: 3000, duration: 0.9, volume: 0.35, q: 1 }),
  // "Ting!": Omars zwaard glinstert vlak voordat hij aanvalt (dan weet je: nu opletten!)
  glint: () => tone({ type: 'triangle', from: 1900, to: 2600, duration: 0.14, volume: 0.13 }),
  // Menu's: klikje, openen (omhoog) en dicht (omlaag)
  click: () => tone({ type: 'square', from: 1300, to: 1100, duration: 0.035, volume: 0.05 }),
  menuOpen: () => {
    tone({ type: 'triangle', from: 420, to: 840, duration: 0.12, volume: 0.12 });
    noise({ from: 800, to: 3000, duration: 0.15, volume: 0.06, q: 1 });
  },
  menuClose: () => tone({ type: 'triangle', from: 800, to: 380, duration: 0.12, volume: 0.1 }),
  // Een gong als er een boss in beeld komt
  gong: () => {
    for (const [f, v] of [[98, 0.35], [196.5, 0.18], [293, 0.1], [415, 0.06]]) tone({ type: 'sine', from: f, to: f * 0.98, duration: 2.2, volume: v });
    noise({ from: 600, to: 200, duration: 0.6, volume: 0.15, q: 0.8 });
  },
  // Nieuw level: een vrolijk fanfaretje
  levelUp: () => [523, 659, 784, 1047, 1319].forEach((f, i) => {
    tone({ type: 'square', from: f, duration: i === 4 ? 0.5 : 0.12, volume: 0.1, delay: i * 0.09 });
    tone({ type: 'triangle', from: f / 2, duration: i === 4 ? 0.5 : 0.12, volume: 0.12, delay: i * 0.09 });
  }),
  // Dash: een anime-teleport! "Sjwiep... tsjing" (een hoge zwiep, een flits en een korte echo)
  dash: () => {
    noise({ from: 6000, to: 900, duration: 0.14, volume: 0.35, q: 1.2 });
    tone({ type: 'sine', from: 2600, to: 500, duration: 0.09, volume: 0.18 });
    tone({ type: 'triangle', from: 1800, to: 3200, duration: 0.07, volume: 0.1, delay: 0.06 });
    tone({ type: 'sine', from: 900, to: 300, duration: 0.18, volume: 0.08, delay: 0.1 });
  },
  // Vuurzwaard: vlammen die opflakkeren
  fire: () => {
    noise({ from: 300, to: 1500, duration: 0.6, volume: 0.35, q: 0.6 });
    tone({ type: 'sawtooth', from: 90, to: 160, duration: 0.5, volume: 0.08 });
  },
  // Flesje drinken: glug glug glug
  gulp: () => [0, 0.17, 0.34].forEach((d) => tone({ type: 'sine', from: 260, to: 140, duration: 0.1, volume: 0.2, delay: d })),
  // Kist open: krakend deksel en dan een schatten-tingel
  chest: () => {
    tone({ type: 'sawtooth', from: 140, to: 90, duration: 0.25, volume: 0.08 });
    [784, 988, 1175, 1568].forEach((f, i) => tone({ type: 'triangle', from: f, duration: 0.2, volume: 0.13, delay: 0.2 + i * 0.07 }));
  },
  // Checkpoint-vlag: fladder + ding
  flag: () => {
    noise({ from: 1500, to: 600, duration: 0.3, volume: 0.12, q: 2 });
    [659, 988].forEach((f, i) => tone({ type: 'triangle', from: f, duration: 0.3, volume: 0.15, delay: 0.1 + i * 0.12 }));
  },
  // "Poef!": Omar teleporteert (verdwijnt in paarse rook)
  poef: () => {
    noise({ from: 3200, to: 300, duration: 0.25, volume: 0.35, q: 2 });
    tone({ type: 'sine', from: 900, to: 180, duration: 0.22, volume: 0.15 });
  },
  // De draak brult: een diepe, rauwe grom die omhoog gaat en weer zakt
  roar: () => {
    tone({ type: 'sawtooth', from: 70, to: 140, duration: 0.5, volume: 0.22 });
    tone({ type: 'sawtooth', from: 140, to: 55, duration: 0.9, volume: 0.2, delay: 0.45 });
    tone({ type: 'square', from: 95, to: 75, duration: 1.2, volume: 0.07 });
    noise({ from: 400, to: 1200, duration: 0.6, volume: 0.3, q: 0.8 });
    noise({ from: 1100, to: 250, duration: 0.9, volume: 0.28, q: 0.8, delay: 0.45 });
  },
  // Vleugelslag: een zware "woesj"
  flap: () => noise({ from: 160, to: 520, duration: 0.35, volume: 0.32, q: 0.9 }),
  // Drakenvuur: een lange brullende vlam
  breath: () => {
    noise({ from: 250, to: 1800, duration: 0.8, volume: 0.45, q: 0.5 });
    noise({ from: 900, to: 400, duration: 0.8, volume: 0.25, q: 0.7, delay: 0.1 });
    tone({ type: 'sawtooth', from: 60, to: 110, duration: 0.8, volume: 0.12 });
  },
  // Het huisdiertje: een blij piepje (en een boos grommetje als het aanvalt)
  pet: () => [880, 1175].forEach((f, i) => tone({ type: 'triangle', from: f, to: f * 1.15, duration: 0.09, volume: 0.15, delay: i * 0.08 })),
  petGrr: () => tone({ type: 'sawtooth', from: 220, to: 160, duration: 0.18, volume: 0.1 }),
};

/**
 * Praatgeluidjes, als iemand iets zegt (zoals in sommige spelletjes: "blablabla" in piepjes).
 * Iedereen heeft zijn eigen stem: Omar praat diep en snel, Rames nog dieper en langzaam, een robot piept.
 */
export function talk(name = '', text = '') {
  if (!ready()) return;
  let h = 0;
  for (const ch of name) h = (h * 31 + ch.charCodeAt(0)) % 997;
  const omar = /omar/i.test(name);
  const rames = /rames/i.test(name); // Rames is ondood: zijn stem is nog dieper, en langzaam
  const robot = /robot|biep|bot/i.test(name);
  const base = rames ? 84 : omar ? 118 : 200 + (h % 9) * 26;
  const type = omar || rames ? 'sawtooth' : robot ? 'sine' : h % 2 ? 'square' : 'triangle';
  const letters = text.replace(/<[^>]+>/g, '').length;
  const n = Math.max(3, Math.min(14, Math.round(letters / 5)));
  const step = rames ? 0.09 : omar ? 0.065 : 0.075;
  for (let i = 0; i < n; i++) {
    const f = robot ? base * (i % 2 ? 2 : 1.5) : base * (0.85 + Math.random() * 0.5);
    tone({ type, from: f, to: f * (0.9 + Math.random() * 0.25), duration: step * 0.8, volume: rames ? 0.075 : omar ? 0.06 : type === 'square' ? 0.035 : 0.06, delay: i * step });
  }
}

// ---------- Geluiden van de wereld om je heen ----------
const amb = { bird: 2, cricket: 1, wind: 5, owl: 6, crackle: 0.3 };

/** Elke frame: vogeltjes overdag, krekels 's nachts, een uil in het Spookwoud, wind in de bergen, knetterende fakkels in het kasteel. */
export function updateAmbience(dt, { theme, night = 0 }) {
  if (!ready() || dt <= 0) return;
  for (const key in amb) amb[key] -= dt;
  const pan = () => Math.random() * 1.6 - 0.8;
  if (theme === 'kasteel') {
    if (amb.crackle <= 0) {
      amb.crackle = 0.12 + Math.random() * 0.5;
      noise({ from: 2000 + Math.random() * 2500, duration: 0.04, volume: 0.03, q: 3 });
    }
    return;
  }
  if (night < 0.5 && theme !== 'woud' && amb.bird <= 0) {
    amb.bird = 2.5 + Math.random() * 5;
    const p = pan();
    const f = 2500 + Math.random() * 1000;
    const n = 2 + Math.floor(Math.random() * 3);
    for (let i = 0; i < n; i++) tone({ type: 'sine', from: f, to: f * 1.35, duration: 0.06, volume: 0.03, delay: i * 0.09, pan: p });
  }
  if (night >= 0.5 && amb.cricket <= 0) {
    amb.cricket = 0.6 + Math.random() * 1.4;
    const p = pan();
    for (let i = 0; i < 5; i++) tone({ type: 'sine', from: 4300, duration: 0.025, volume: 0.012, delay: i * 0.045, pan: p });
  }
  if (theme === 'woud' && amb.owl <= 0) {
    amb.owl = 9 + Math.random() * 10;
    const p = pan();
    tone({ type: 'sine', from: 410, to: 370, duration: 0.35, volume: 0.05, pan: p });
    tone({ type: 'sine', from: 430, to: 360, duration: 0.55, volume: 0.05, delay: 0.5, pan: p });
  }
  if (theme === 'hoogland' && amb.wind <= 0) {
    amb.wind = 7 + Math.random() * 8;
    noise({ from: 250, to: 900, duration: 3, volume: 0.05, q: 0.5 });
  }
}

/** Speel een geluid, bijvoorbeeld play('hit'). */
export function play(name) {
  if (!ready()) return;
  if (samples[name]) playSample(name, SAMPLE_VOLUME[name] ?? 0.6);
  else SOUNDS[name]?.();
}
