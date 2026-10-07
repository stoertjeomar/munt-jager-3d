import * as THREE from 'three';
import { LEVELS, LEVEL_INDEX, IN_CASTLE } from './levels.js';
import { CHECKPOINTS } from './world.js';
import { CHARACTERS, otherPlayable } from './player.js';
import { play } from './audio.js';
import { OMAR } from './omarFighter.js'; // (dit laadt ook Omar zelf, zodat hij bij de bosses staat)

// Omar de Baas: alles rondom het gevecht tegen Omar.
//
//  1. In elk level staat Omar (npcs.js). Druk op E bij hem, dan daagt hij je uit: "Ja" of "Nee".
//  2. Ja? Dan neemt hij je mee (paarse wervelwind) naar zijn Gekke Kasteel (index.html?level=omar).
//  3. In het kasteel: een filmpje. De camera vliegt over het kasteel naar Omar op zijn troon, hij schept op,
//     springt met een salto de arena in en trekt jou erbij. Dan begint het gevecht.
//  4. Winnen: vuurwerk, munten, de Kroon van Omar. Verliezen: Omar lacht je uit, je mag meteen opnieuw.
//     Daarna (of met "Opgeven" in het pauzescherm) ga je terug naar je level, naast Omar.
//
// Je raakt nooit iets kwijt als je verliest. Omar zelf (hoe hij vecht) staat in omarFighter.js,
// het kasteel in castle.js.

const $ = (id) => document.getElementById(id);
const smooth = (t) => {
  const k = THREE.MathUtils.clamp(t, 0, 1);
  return k * k * (3 - 2 * k);
};
const V = (x, y, z) => new THREE.Vector3(x, y, z);

// Extra stijl voor het filmpje (zwarte balken, overgang, overslaan-knop)
const STYLE = `
#omar-fade { position: fixed; inset: 0; z-index: 25; pointer-events: none; opacity: 0; display: flex; flex-direction: column;
  align-items: center; justify-content: center; gap: 12px; text-align: center; padding: 16px;
  background: radial-gradient(circle at 50% 45%, #3a0d5a 0%, #14031f 65%, #000 100%); }
#omar-fade b { font-weight: normal; font-size: clamp(26px, 4.5vw, 46px); letter-spacing: 4px; color: #d9a3ff; text-shadow: 0 0 20px rgba(176, 77, 255, 0.8); }
#omar-fade small { font-size: 18px; letter-spacing: 2px; color: #ffd76a; }
.omar-balk { position: fixed; left: 0; right: 0; height: 11vh; background: #000; z-index: 15; pointer-events: none; transform: scaleY(0); transition: transform 0.5s; }
.omar-balk.boven { top: 0; transform-origin: top; }
.omar-balk.onder { bottom: 0; transform-origin: bottom; }
body.omar-film .omar-balk { transform: scaleY(1); }
body.omar-film #bars, body.omar-film #minimap, body.omar-film #equip, body.omar-film #runes-box,
body.omar-film #quests, body.omar-film #prompt, body.omar-film #toast { visibility: hidden; }
#omar-skip { display: none; position: fixed; right: 22px; bottom: calc(11vh + 12px); z-index: 16; pointer-events: none;
  font-size: 15px; letter-spacing: 1px; color: #e8d9ff; text-shadow: 0 1px 4px #000; }
#omar-skip b { color: #ffd76a; }
body.omar-film.omar-overslaan #omar-skip { display: block; }
#omar-pauze { display: none; position: fixed; left: 50%; top: 18vh; transform: translateX(-50%); z-index: 26; pointer-events: none;
  padding: 10px 22px; background: rgba(20, 5, 30, 0.8); border: 1px solid #c77dff; color: #ead6ff; font-size: 20px; letter-spacing: 2px; }
body.omar-pauze #omar-pauze { display: block; }
.banner-omar #banner-text { color: #d9a3ff; text-shadow: 0 0 20px rgba(176, 77, 255, 0.7); }
#omar-leave { padding: 8px 26px; background: rgba(40, 10, 60, 0.85); border: 1px solid #c77dff; color: #ead6ff;
  font: inherit; font-size: 17px; letter-spacing: 1px; cursor: pointer; }
#omar-leave:hover { filter: brightness(1.25); }
#lock-hint #omar-castle-info { max-width: 640px; font-size: 19px; letter-spacing: 1px; color: #d9a3ff; }
body.omar-kasteel #lock-hint h1 { font-size: clamp(28px, 5.5vw, 58px); letter-spacing: 6px; color: #e8c4ff; text-shadow: 0 0 24px rgba(176, 77, 255, 0.7); }
`;

// Wat Omar zegt als je bij hem komt in een level
const CHALLENGE_LINES = {
  eerste: [
    'Hé! Jij daar! Ja, jij, met dat kleine zwaardje!',
    'Ik ben <b>OMAR</b>. De baas van dit hele spel. Ik heb <b>álle krachten</b> én het <b>Diamanten zwaard</b>.',
    'Ik woon in mijn <b>Gekke Kasteel</b>. Wie durft, mag daar tegen mij vechten. Hehe.',
  ],
  verloren: [
    'Hahaha, jij weer! Doet je billetje nog pijn van de vorige keer?',
    'Wil je nóg een keer verliezen? Dat mag hoor. Ik word er nooit moe van.',
  ],
  gewonnen: [
    'Jij... JIJ hebt mij verslagen. Dat was gewoon geluk!',
    'Ik heb geoefend. Heel veel. Wil je revanche, of ben je bang?',
  ],
};

// Wat Omar zegt op zijn troon. gestures = wat hij doet bij elke zin.
const THRONE_LINES = {
  lang: {
    lines: [
      'Hehe! Hehehe! Welkom in mijn <b>Gekke Kasteel</b>!',
      'Ik ben <b>OMAR</b>. De baas. De allerbeste. De sterkste van de hele wereld. En van Mars.',
      'Ik kan <b>dashen</b>, <b>rollen</b>, een <b>wervelslag</b>, een <b>dubbele sprong</b>, een <b>grondslag</b>... en kijk: mijn <b>Diamanten zwaard</b>!',
      'En jij? Jij miezerig mannetje durft MIJ uit te dagen? Hahaha! Mijn goudvis is nog sterker dan jij!',
      'Oké dan. Kom maar op als je durft!',
    ],
    gestures: ['lachen', 'zitten', 'zwaard', 'wijzen', 'zwaard'],
  },
  kortVerloren: {
    lines: ['Hahaha! Ben je daar alweer? Nog steeds even miezerig, zie ik.', 'Kom maar op dan. Ik ben altijd klaar.'],
    gestures: ['lachen', 'wijzen'],
  },
  kortGewonnen: {
    lines: ['Jij weer?! Vorige keer had je gewoon geluk.', 'Deze keer word ik niet verslagen. Kom maar op!'],
    gestures: ['zitten', 'zwaard'],
  },
  kort: {
    lines: ['Hehe! Kom je toch nog terug? Dapper hoor... of dom!', 'Kom maar op dan. Ik ben altijd klaar.'],
    gestures: ['lachen', 'wijzen'],
  },
  herkansing: {
    lines: ['Nog een keer? Jij geeft nooit op, hè? Hehe.', 'Prima! Dan versla ik je gewoon nóg een keer!'],
    gestures: ['lachen', 'zwaard'],
  },
};

// Wat je ziet als je terug bent in je level: [melding, wat Omar roept]
const RETURN_TEXTS = {
  gewonnen: ['🏆 Je hebt <b>Omar</b> verslagen! Hij staat hier weer... en hij wil revanche.', 'Revanche! Ik wil revanche!'],
  verloren: ['Omar: <i>"Hahaha! Kom terug als je sterker bent, mannetje!"</i><br><small>Je kunt hem altijd opnieuw uitdagen.</small>', 'Hahaha! Kom maar terug, hoor!'],
  gevlucht: ['Omar: <i>"Weggelopen? Bangerik! Hahaha!"</i>', 'Bangerik! Hahaha!'],
  terug: ['Omar: <i>"Hè? Ga je nu al weg? Saai!"</i>', 'Saai!'],
};

export class OmarFlow {
  /**
   * @param {object} ctx  { scene, camera, cameraRig, input, state, stats, ui, player, bosses, npcs, sites, world,
   *                        effects, pickups, decor, giveKills, giveRunes, announceNewPowers } uit main.js
   */
  constructor(ctx) {
    Object.assign(this, ctx);
    // Oude save zonder Omar? Dan beginnen we gewoon bij nul.
    this.stats.data.omar = { wins: 0, losses: 0, visits: 0, seen: false, trip: null, back: null, ...this.stats.data.omar };
    this.phase = 'rust';
    this.t = 0;
    this.fighter = null;
    this.npc = null;
    this.fade = null; // { from, to, time, t }: overgang van het paarse scherm
    this.createDom();
    if (IN_CASTLE) this.setupCastle();
    else this.setupLevel();
  }

  /** De Omar-gegevens in de save. */
  get d() {
    return this.stats.data.omar;
  }

  /** Naam van het level waar je vandaan kwam (en naartoe teruggaat). */
  get homeName() {
    return LEVELS[this.d.trip?.level ?? LEVEL_INDEX]?.name ?? LEVELS[0].name;
  }

  createDom() {
    const style = document.createElement('style');
    style.id = 'omar-style';
    style.textContent = STYLE;
    document.head.append(style);
    this.fadeEl = document.createElement('div');
    this.fadeEl.id = 'omar-fade';
    this.fadeEl.innerHTML = '<b></b><small></small>';
    const top = document.createElement('div');
    top.className = 'omar-balk boven';
    const bottom = document.createElement('div');
    bottom.className = 'omar-balk onder';
    const skip = document.createElement('div');
    skip.id = 'omar-skip';
    skip.innerHTML = '<b>Spatie</b> / <b>E</b> = overslaan';
    const pause = document.createElement('div');
    pause.id = 'omar-pauze';
    pause.textContent = '⏸ Pauze — klik om verder te kijken';
    document.body.append(top, bottom, skip, pause, this.fadeEl);
  }

  /** Het paarse overgangsscherm (0 = weg, 1 = helemaal dicht). */
  setFade(opacity, title = null, sub = null) {
    this.fadeEl.style.opacity = opacity;
    if (title !== null) this.fadeEl.querySelector('b').textContent = title;
    if (sub !== null) this.fadeEl.querySelector('small').textContent = sub;
  }

  /** Langzaam van het ene naar het andere overgangsscherm (wordt in update bijgewerkt). */
  fadeTo(to, time) {
    this.fade = { from: Number(this.fadeEl.style.opacity) || 0, to, time, t: 0 };
  }

  /** Een grote tekst in beeld (banner) snel laten verdwijnen. */
  hideBanner() {
    this.ui.bannerTimer = Math.min(this.ui.bannerTimer, 0.3);
  }

  /** Filmstand: zwarte balken boven en onder, geen balken en minimap in beeld. */
  setFilm(on, skippable = false) {
    document.body.classList.toggle('omar-film', on);
    document.body.classList.toggle('omar-overslaan', on && skippable);
  }

  /** Camera op een plek zetten en ergens naar laten kijken (met het schudden van effects erbij). */
  aim(pos, look) {
    this.camera.position.copy(pos);
    const s = this.effects.shakeAmount;
    if (s > 0.001) this.camera.position.add(V((Math.random() - 0.5) * s, (Math.random() - 0.5) * s, (Math.random() - 0.5) * s));
    this.camera.lookAt(look);
  }

  /** Een camerashot van a naar b. k = hoe ver (0 → 1), zacht beginnen en eindigen. */
  shot(k, fromPos, toPos, fromLook, toLook) {
    const e = smooth(k);
    this.aim(fromPos.clone().lerp(toPos, e), fromLook.clone().lerp(toLook, e));
  }

  /** Is er op een overslaan-toets gedrukt? */
  skipPressed() {
    const { input, state } = this;
    const pressed = input.wasPressed('Space') || input.wasPressed('KeyE') || input.wasPressed('Enter') || state.attackRequested;
    state.attackRequested = false; // een klik in het filmpje wordt geen zwaardslag
    return pressed && this.t > 0.2; // de toets van de vorige zin telt niet mee
  }

  // ======================================================================
  // In een gewoon level: Omar staat er en daagt je uit
  // ======================================================================

  setupLevel() {
    this.npc = this.npcs.omar;
    const d = this.d;
    // Kom je terug uit het kasteel? (of had je het kasteel dichtgeklikt?) Dan krijg je je checkpoint terug.
    const back = d.back ?? (d.trip ? { ...d.trip, result: null } : null);
    if (back && back.level === LEVEL_INDEX) {
      if (CHECKPOINTS.some((c) => c.id === back.checkpoint)) this.stats.data.checkpoint = back.checkpoint;
      if (back.result && this.npc) {
        this.placeNextToOmar();
        this.pendingResult = back.result;
      }
    }
    if (d.back || d.trip) {
      d.back = null;
      d.trip = null;
      this.stats.save();
    }
  }

  /** Zet de speler naast Omar, met de camera achter je zodat je hem ziet. */
  placeNextToOmar() {
    const o = this.npc.position;
    const [, , sx, sz] = LEVELS[LEVEL_INDEX].checkpoints[0];
    const dir = V(sx - o.x, 0, sz + 2.5 - o.z);
    if (dir.lengthSq() < 0.01) dir.set(0, 0, 1);
    dir.normalize();
    const spot = o.clone().addScaledVector(dir, 2.8).setY(0);
    const { player, cameraRig } = this;
    player.position.copy(spot);
    player.velocity.set(0, 0, 0);
    player.mesh.rotation.y = Math.atan2(o.x - spot.x, o.z - spot.z);
    cameraRig.yaw = Math.atan2(spot.x - o.x, spot.z - o.z);
    cameraRig.snapTo(player.position);
  }

  /** E bij Omar (via talkTo in main.js): hij daagt je uit. */
  challenge(npc) {
    if (this.phase !== 'rust') return;
    const d = this.d;
    play('pickup');
    this.ui.prompt(null);
    const lines = d.wins > 0 ? CHALLENGE_LINES.gewonnen : d.losses > 0 ? CHALLENGE_LINES.verloren : CHALLENGE_LINES.eerste;
    this.phase = 'uitdagen';
    this.ui.openDialog('Omar', lines, () => this.openChoice(npc));
  }

  /** Ja of nee: durf je tegen Omar te vechten? */
  openChoice(npc) {
    const { stats, ui } = this;
    const d = this.d;
    this.phase = 'kiezen';
    document.exitPointerLock?.();
    const html = `Omar neemt je mee naar zijn <b>Gekke Kasteel</b>. Daar vecht je tegen hem in de arena.
      <br><small>Omar is héél sterk: hij kan dashen, rollen, een wervelslag, een dubbele sprong met grondslag én zijn zwaard in brand zetten.
      Verlies je? Geen probleem: je komt gewoon hier terug en je raakt niks kwijt.</small>
      <br><br>Jij: level <b>${stats.level}</b> · Omar: level <b>${OMAR.level}</b> · Gewonnen <b>${d.wins}</b> · Verloren <b>${d.losses}</b>`;
    ui.openLevelComplete('DAAG OMAR UIT?', html, [
      ['⚔ Ja, ik ben klaar voor Omar! (J)', () => this.startTransport(npc)],
      ['Nee, nog niet (N)', () => this.decline(npc)],
    ]);
  }

  decline(npc) {
    this.ui.closeMenu();
    this.cameraRig.lock();
    npc.say('Hehe, dat dacht ik al! Kom maar terug als je durft.', 3);
    this.phase = 'rust';
  }

  /** "Ja!": Omar neemt je mee in een paarse wervelwind. */
  startTransport(npc) {
    if (this.phase === 'reizen') return;
    const { ui, stats } = this;
    ui.closeMenu();
    ui.menuOpen = 'cutscene'; // het spel staat stil en je kunt niks doen
    this.hideBanner();
    this.setFilm(true, false);
    npc.cheer = true;
    npc.bubble.visible = false;
    play('whoosh');
    this.phase = 'reizen';
    this.t = 0;
    this.laughed = false;
    this.leaving = false;
    // Onthoud waar je was: daar kom je straks weer terug
    this.d.trip = { level: LEVEL_INDEX, checkpoint: stats.data.checkpoint };
    stats.data.currentLevel = LEVEL_INDEX;
    stats.save();
  }

  updateTransport(dt) {
    const { player, effects, npc, cameraRig } = this;
    this.t += dt;
    const t = this.t;
    const p = player.position;
    // Paars-gouden wervelwind om je heen
    for (let i = 0; i < 3; i++) {
      const a = t * 8 + i * 2.1;
      const at = V(p.x + Math.cos(a) * 1.3, p.y + 0.2 + ((t * 1.7 + i * 0.6) % 1.8), p.z + Math.sin(a) * 1.3);
      effects.burst(at, i % 2 ? 0xffd23a : 0xb04dff, { count: 2, speed: 1.5, size: 0.1, life: 0.6, gravity: -0.2 });
    }
    effects.update(dt); // het spel staat stil, dus de effecten laten we hier zelf bewegen
    effects.shake(0.15 + Math.min(1, t / 2.6) * 0.25);
    p.y = Math.min(1.2, t * 0.6); // je zweeft omhoog
    npc.update(dt, performance.now() / 1000, p);
    // De camera draait om je heen (hoog genoeg om over kraampjes en hekjes heen te kijken)
    const angle = cameraRig.yaw + t * 0.8;
    this.aim(V(p.x + Math.sin(angle) * 5, p.y + 3 + t * 0.8, p.z + Math.cos(angle) * 5), V(p.x, p.y + 1, p.z));
    if (t >= 0.4 && !this.laughed) {
      this.laughed = true;
      play('laugh');
      npc.say('Hehe! Kom maar mee, mannetje!', 2.5);
    }
    this.setFade(smooth((t - 1.2) / 1.0), 'Omar neemt je mee naar zijn kasteel...', 'Hou je vast!');
    if (t >= 2.6 && !this.leaving) {
      this.leaving = true;
      this.stats.save();
      location.href = `${location.pathname}?level=omar`;
    }
  }

  updateLevel(dt) {
    const { cameraRig, state, ui, input, player } = this;
    const running = cameraRig.locked || state.forceRun;
    if (this.phase === 'reizen') {
      this.updateTransport(dt);
      return;
    }
    if (!this.npc) return;
    // Net terug uit het kasteel: wat zegt Omar? (de melding pas na de grote level-titel)
    if (this.pendingResult && running) {
      const [toast, shout] = RETURN_TEXTS[this.pendingResult] ?? RETURN_TEXTS.terug;
      this.resultTime = (this.resultTime ?? 0) + dt;
      if (!this.resultShouted) {
        this.resultShouted = true;
        this.npc.say(shout, 4);
      }
      if (this.resultTime > 4.6) {
        ui.toast(toast, 6);
        this.pendingResult = null;
      }
    }
    // De eerste keer dat je Omar ziet: uitleg (pas na de grote level-titel)
    if (running) this.runTime = (this.runTime ?? 0) + dt;
    const dist = player.position.distanceTo(this.npc.position);
    if (!this.d.seen && this.runTime > 4.6 && !ui.menuOpen && dist < 14) {
      this.d.seen = true;
      this.stats.save();
      ui.toast('Dat is <b>Omar</b>, de baas van het spel! Durf je hem uit te dagen?<br>Loop naar hem toe en druk op <b>E</b>.', 6);
    }
    // Kiezen met het toetsenbord: J = ja, N = nee
    if (this.phase === 'kiezen') {
      if (ui.menuOpen !== 'level') this.phase = 'rust';
      else if (input.wasPressed('KeyJ')) this.startTransport(this.npc);
      else if (input.wasPressed('KeyN')) this.decline(this.npc);
    } else if (this.phase === 'uitdagen' && ui.menuOpen !== 'dialog') {
      this.phase = 'rust';
    }
  }

  // ======================================================================
  // In het kasteel van Omar
  // ======================================================================

  setupCastle() {
    const { world, stats, state, sites, player, cameraRig } = this;
    this.fighter = this.bosses.find((b) => b.id === 'omar');
    this.fighter.effects = this.effects;
    this.fighter.prepare(stats);
    this.fighter.setThrone(world.castle.seat);
    this.wonThisVisit = false;
    state.introShown = true; // geen "level"-banner van main.js
    for (const c of sites.checkpoints) c.group.visible = false; // geen vlag in het kasteel
    player.respawnAt(world.castle.spawn);
    player.mesh.rotation.y = Math.PI;
    cameraRig.yaw = 0;
    cameraRig.snapTo(player.position);
    // Twee gouden Omar-beelden naast de troon
    world.castle.addStatues?.(CHARACTERS.find((c) => c.id === otherPlayable(stats.data.character))?.file);

    // De uitleg voor nieuwe spelers ("volg het pad...") uit main.js hoort niet in het kasteel
    const toast = this.ui.toast.bind(this.ui);
    this.ui.toast = (html, duration) => (html.includes('Volg het pad') ? undefined : toast(html, duration));

    // Het startscherm wordt het kasteel-scherm (geen held of level kiezen hier)
    const hint = $('lock-hint');
    document.body.classList.add('omar-kasteel');
    hint.querySelector('h1').textContent = 'HET GEKKE KASTEEL VAN OMAR';
    for (const id of ['pick-title', 'char-select', 'level-title', 'level-select']) {
      const el = $(id);
      if (el) el.style.display = 'none';
    }
    this.infoEl = document.createElement('p');
    this.infoEl.id = 'omar-castle-info';
    hint.querySelector('h1').after(this.infoEl);
    const startBtn = $('start-btn');
    startBtn.textContent = '⚔ Naar binnen!';
    this.leaveBtn = document.createElement('button');
    this.leaveBtn.id = 'omar-leave';
    this.leaveBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      const d = this.phase;
      this.returnHome(this.wonThisVisit ? 'gewonnen' : d === 'gevecht' ? 'gevlucht' : d === 'verloren' ? 'verloren' : 'terug');
    });
    startBtn.after(this.leaveBtn);
    this.updateLeaveButton();
    this.setFade(1, '', ''); // paars-zwart achter het startscherm
    this.phase = 'wachten';
  }

  updateLeaveButton() {
    if (!this.leaveBtn) return;
    // Tekst op het pauzescherm (Esc) past bij wat er nu gebeurt
    const info = this.wonThisVisit
      ? 'Jij hebt Omar verslagen! Kijk nog even rond, of ga terug.'
      : this.phase === 'gevecht'
        ? 'Pauze! Omar wacht ongeduldig en tikt met zijn voet...'
        : this.phase === 'verloren'
          ? 'Omar ligt nog steeds dubbel van het lachen...'
          : 'Omar heeft je meegenomen naar zijn kasteel. Hij wacht op zijn troon...';
    if (this.infoEl.textContent !== info) this.infoEl.textContent = info;
    const name = this.homeName;
    const text = this.wonThisVisit || this.phase === 'verloren' ? `↩ Terug naar ${name}` : this.phase === 'gevecht' ? `🏳 Opgeven — terug naar ${name}` : `🏳 Toch maar niet — terug naar ${name}`;
    if (this.leaveBtn.textContent !== text) this.leaveBtn.textContent = text;
  }

  /** Het filmpje begint. kind: 'lang' (eerste keer), 'kort' (later) of 'herkansing' (meteen nog een keer). */
  startCutscene(kind) {
    const d = this.d;
    this.kind = kind;
    d.visits++;
    this.stats.save();
    this.ui.menuOpen = 'cutscene';
    this.fadeTo(0, kind === 'herkansing' ? 0.5 : 0.8);
    if (kind === 'herkansing') {
      this.startTalk();
      return;
    }
    this.setFilm(true, true);
    this.phase = 'aankomst';
    this.t = 0;
    this.bannerShown = false;
    this.flared = false;
  }

  /** Deel 1: de camera vliegt over het kasteel naar de troon. */
  updateArrival() {
    const t = this.t;
    const short = this.kind !== 'lang';
    const end = short ? 2.5 : 6.4;
    if (!this.bannerShown && t >= (short ? 0.1 : 0.4)) {
      this.bannerShown = true;
      this.ui.banner('HET GEKKE KASTEEL VAN OMAR', 'Welkom in mijn huis, mannetje!', 'omar', 3);
    }
    // Vuurschalen bij de troon laaien op
    const flareAt = short ? 1.2 : 4.5;
    if (!this.flared && t >= flareAt) {
      this.flared = true;
      play('charge');
      for (const b of this.world.castle.braziers.slice(-2)) this.effects.burst(b, 0xff7a1a, { count: 30, speed: 4, size: 0.14, life: 0.9, up: 4, gravity: -0.1 });
    }
    if (!short && t < 3.2) this.shot(t / 3.2, V(-30, 24, 52), V(24, 16, 30), V(0, 2, 10), V(0, 3, -8));
    else {
      const k = short ? t / end : (t - 3.2) / 3.2;
      this.shot(k, V(8, 3.5, 10), V(1.8, 3.6, -17.5), V(0, 2, -20), V(0, 3.1, -26.6));
    }
    if (t >= end || this.skipPressed()) this.startTalk();
  }

  /** Deel 2: Omar op zijn troon schept op (een gesprek). */
  startTalk() {
    const d = this.d;
    const key = this.kind === 'lang' ? 'lang' : this.kind === 'herkansing' ? 'herkansing' : d.wins > 0 ? 'kortGewonnen' : d.losses > 0 ? 'kortVerloren' : 'kort';
    this.talk = THRONE_LINES[key];
    this.phase = 'praten';
    this.t = 0;
    this.talkLine = -1;
    this.setFilm(true, false); // het gesprek heeft zijn eigen "E verder"
    this.hideBanner();
    this.ui.openDialog('Omar', this.talk.lines, () => this.startLeap());
  }

  updateTalk() {
    const { ui, fighter } = this;
    const index = ui.dialog?.index ?? this.talkLine;
    if (index !== this.talkLine) {
      this.talkLine = index;
      fighter.gesture = this.talk.gestures[index] ?? 'zitten';
      if (fighter.gesture === 'lachen') play('laugh');
      if (fighter.gesture === 'zwaard') play('charge');
    }
    // Omar bovenin beeld (onderin staat het tekstvak)
    this.shot(this.t / 8, V(0.75, 2.75, -21.9), V(0.45, 2.65, -22.6), V(0, 1.9, -26.6), V(0, 1.95, -26.6));
  }

  /** Deel 3: Omar springt van zijn troon de arena in en trekt jou erbij. */
  startLeap() {
    this.ui.menuOpen = 'cutscene';
    this.setFilm(true, true);
    this.phase = 'sprong';
    this.t = 0;
    this.landed = false;
    this.fighter.gesture = 'zitten';
    this.fighter.playIntro(this.world.castle.landing);
    play('jump');
  }

  updateLeap() {
    const { fighter, effects, player, world } = this;
    const t = this.t;
    const omarLook = fighter.position.clone().setY(fighter.position.y + 1.2);
    if (t < 0.45) this.shot(t / 0.45, V(0.45, 2.65, -22.6), V(8.5, 4.5, -7), V(0, 1.95, -26.6), omarLook);
    else if (t < 1.45) this.aim(V(8.5, 4.5, -7), omarLook);
    if (t >= 1.45 && !this.landed) {
      // Boem! Omar landt, en trekt je met paarse toverkracht naar zich toe
      this.landed = true;
      const land = world.castle.landing;
      effects.shockwave(land, 0xb04dff, 6);
      effects.burst(land.clone().setY(0.4), 0xb04dff, { count: 40, speed: 8, size: 0.16, life: 0.8, up: 3 });
      effects.shake(0.6);
      effects.floatText(land.clone().setY(2.6), 'KOM HIER!', '#d9a3ff', 0.7);
      play('slam');
      play('whoosh');
      const from = land.clone().setY(1.2);
      const to = player.position.clone().setY(1);
      for (let i = 1; i <= 8; i++) effects.burst(from.clone().lerp(to, i / 9), 0xd9a3ff, { count: 4, speed: 1.5, size: 0.12, life: 0.6, up: 0.5, gravity: 0 });
      // Nu al wakker maken: zo begint main.js het gevecht niet vanzelf als jij de arena in vliegt
      if (!fighter.awake) fighter.wake();
    }
    if (t >= 1.45) {
      const k = smooth((t - 1.45) / 0.55);
      const spawn = world.castle.spawn;
      const spot = world.castle.fightSpot;
      player.position.lerpVectors(spawn, spot, k);
      player.position.y = 3 * Math.sin(Math.PI * k);
      player.mesh.rotation.y = Math.PI;
      if (k < 1) effects.burst(player.position.clone().setY(player.position.y + 0.9), Math.random() < 0.5 ? 0xb04dff : 0xd9a3ff, { count: 2, speed: 1, size: 0.1, life: 0.5, gravity: 0 });
      this.shot((t - 1.45) / 0.55, V(0, 6, 31), V(0, 3.2, 12), V(0, 1.2, -6), V(0, 1.2, -6));
    }
    if (t >= 2.4) this.startFight();
    else if (this.skipPressed()) {
      this.fighter.finishIntro();
      if (!fighter.awake) fighter.wake();
      this.startFight();
    }
  }

  /** Deel 4: vechten! */
  startFight() {
    const { player, fighter, state, ui, cameraRig, world } = this;
    player.position.copy(world.castle.fightSpot);
    player.velocity.set(0, 0, 0);
    player.mesh.rotation.y = Math.PI;
    fighter.finishIntro();
    if (!fighter.awake) fighter.wake();
    state.activeBoss = fighter; // de boss-balk komt in beeld
    state.lockTarget = null;
    ui.menuOpen = null;
    this.setFilm(false);
    this.fade = null;
    this.setFade(0);
    cameraRig.yaw = 0;
    cameraRig.pitch = 0.35;
    cameraRig.snapTo(player.position);
    ui.banner('OMAR', 'De Baas van Alles — versla hem als je durft!', 'omar', 3.5);
    this.tipShown = this.d.wins + this.d.losses > 0; // de tip alleen bij je allereerste gevecht (na de banner)
    this.phase = 'gevecht';
    this.t = 0;
    this.phase2Shown = false;
  }

  /** Omar verslagen (via onBossDefeated in main.js). */
  onWin(boss) {
    const { state, stats, ui, effects } = this;
    const d = this.d;
    const first = d.wins === 0;
    state.activeBoss = null;
    state.lockTarget = null;
    play('win');
    effects.shake(0.6);
    ui.banner('OMAR VERSLAGEN!', 'Wat?! Jij hebt de baas verslagen!', 'gold', 5);
    this.powersBefore = stats.unlockedPowers();
    this.levelBefore = stats.level;
    this.newPerks = this.giveKills(first ? 25 : 6, false) ?? [];
    this.giveRunes(first ? 3000 : 500);
    this.pickups.coinBurst(boss.center, 100);
    if (first) stats.addItem({ kind: 'helmet', key: 'kroon' });
    d.wins++;
    this.wonThisVisit = true;
    this.firstWin = first;
    stats.save();
    this.phase = 'gewonnen';
    this.t = 0;
    this.fireworkTimer = 0;
    this.winTalked = false;
  }

  updateWin(dt) {
    const { effects, ui } = this;
    // Vuurwerk boven de arena
    if (this.t < 6) {
      this.fireworkTimer -= dt;
      if (this.fireworkTimer <= 0) {
        this.fireworkTimer = 0.35;
        const a = Math.random() * Math.PI * 2;
        const r = Math.random() * 12;
        const colors = [0xffd23a, 0xb04dff, 0xff6bd5, 0x5ff7de];
        effects.burst(V(Math.sin(a) * r, 7 + Math.random() * 4, Math.cos(a) * r), colors[Math.floor(Math.random() * colors.length)], { count: 50, speed: 11, size: 0.3, life: 1.3, up: 1, gravity: 0.35 });
        if (Math.random() < 0.4) play('coin');
      }
    }
    if (this.t >= 3 && !this.winTalked && !ui.menuOpen) {
      this.winTalked = true;
      const lines = this.firstWin
        ? ['Au! Hé! Dat... dat kan helemaal niet!', 'Ik ben toch de baas? De allerbeste?!', 'Oké, oké... JIJ wint. Deze keer! Hier, neem mijn reservekroon maar. Ik heb er nog honderd.']
        : ['Wát? Alweer?!', 'Jij bent echt goed, mannetje. Eh... grote man. Eh... baas.'];
      ui.openDialog('Omar', lines, () => {
        this.announceNewPowers(this.powersBefore, 0, this.newPerks);
        this.winMenu();
      });
    }
  }

  winMenu() {
    const { stats, ui, cameraRig } = this;
    document.exitPointerLock?.();
    const html = `Jij hebt <b>Omar de Baas</b> verslagen. Nu ben JIJ de baas!
      <br>Beloning: ${this.firstWin ? '<b>+3000 munten</b> en de <b>Kroon van Omar</b> (35% bescherming, zet hem op met <b>I</b>)' : '<b>+500 munten</b>'}
      ${stats.level > this.levelBefore ? `<br>⬆ Je bent nu <b>level ${stats.level}</b>!` : ''}
      <br><small>Overwinningen op Omar: ${this.d.wins}</small>`;
    ui.openLevelComplete('OMAR VERSLAGEN!', html, [
      [`↩ Terug naar ${this.homeName}`, () => this.returnHome('gewonnen')],
      ['Nog even rondkijken in het kasteel', () => {
        ui.closeMenu();
        cameraRig.lock();
        ui.toast('Wil je terug? Druk op <b>Esc</b> en kies <b>Terug</b>.', 5);
      }],
    ]);
  }

  /** De speler is "dood" in het kasteel (via die() in main.js). Geeft true terug: dan doet main.js niks. */
  onDeath() {
    if (!IN_CASTLE) return false;
    const { state, stats, ui } = this;
    state.deathTimer = Infinity; // niet terug naar een checkpoint: Omar lacht je eerst uit
    if (this.phase === 'verloren') return true;
    play('lose');
    this.d.losses++;
    stats.save();
    ui.banner('OMAR WINT!', '"Hahaha! Kom terug als je sterker bent, mannetje!"', 'death', 4);
    this.phase = 'verloren';
    this.t = 0;
    this.loseTalked = false;
    this.orbitStart = null;
    return true;
  }

  updateLose() {
    const { fighter, ui } = this;
    if (this.t >= 0.8) {
      // De camera draait om de lachende Omar heen
      const o = fighter.position;
      if (this.orbitStart === null) this.orbitStart = Math.atan2(this.player.position.x - o.x, this.player.position.z - o.z);
      const a = this.orbitStart + (this.t - 0.8) * 0.5;
      this.aim(V(o.x + Math.sin(a) * 4.5, 2.2, o.z + Math.cos(a) * 4.5), V(o.x, 1.6, o.z));
    }
    if (this.t >= 3.6 && !this.loseTalked && !ui.menuOpen) {
      this.loseTalked = true;
      ui.openDialog('Omar', ['Hahaha! HAHAHA!', 'Kom terug als je sterker bent, mannetje!'], () => this.loseMenu());
    }
  }

  loseMenu() {
    const { fighter, ui } = this;
    document.exitPointerLock?.();
    const pct = Math.max(1, Math.round((fighter.hp / fighter.info.hp) * 100));
    const html = `Omar was te sterk... deze keer.<br>Omar had nog <b>${pct}%</b> leven over.
      ${pct < 40 ? '<br><b>Je was al heel dichtbij!</b>' : ''}
      <br><small>Je bent niks kwijtgeraakt. Je kunt Omar altijd opnieuw uitdagen.</small>`;
    ui.openLevelComplete('VERLOREN...', html, [
      ['🔁 Nog een keer!', () => this.rematch()],
      [`↩ Terug naar ${this.homeName}`, () => this.returnHome('verloren')],
    ]);
  }

  /** Meteen nog een keer tegen Omar (zonder opnieuw te laden). */
  rematch() {
    const { ui, cameraRig, state, effects, player, world, fighter } = this;
    ui.closeMenu();
    cameraRig.lock();
    state.deathTimer = 0;
    state.activeBoss = null;
    state.lockTarget = null;
    effects.clear();
    player.respawnAt(world.castle.spawn);
    player.mesh.rotation.y = Math.PI;
    cameraRig.yaw = 0;
    cameraRig.snapTo(player.position);
    fighter.resetFight();
    this.setFade(0.7);
    this.startCutscene('herkansing');
  }

  /** Terug naar je eigen level (naast Omar). result: 'gewonnen' | 'verloren' | 'gevlucht' | 'terug' */
  returnHome(result) {
    if (this.leaving) return;
    this.leaving = true;
    const { ui, stats } = this;
    const d = this.d;
    const level = d.trip?.level ?? LEVEL_INDEX;
    ui.closeMenu();
    ui.menuOpen = 'cutscene'; // spel stil, en het startscherm blijft weg
    $('lock-hint').classList.add('hidden');
    this.phase = 'weg';
    this.fade = null;
    this.fadeEl.style.transition = 'opacity 0.6s';
    this.setFade(1, `Terug naar ${LEVELS[level].name}...`, result === 'gewonnen' ? 'Als de nieuwe baas!' : '');
    d.back = { level, checkpoint: d.trip?.checkpoint ?? null, result };
    d.trip = null;
    stats.data.currentLevel = level;
    stats.save();
    setTimeout(() => {
      stats.save();
      location.href = location.pathname;
    }, 700);
  }

  updateCastle(dt) {
    const { cameraRig, state, ui, effects, fighter, decor } = this;
    const running = cameraRig.locked || state.forceRun;
    // Wolken paars kleuren (zodra ze geladen zijn)
    if (!this.cloudsTinted && decor?.clouds?.length) {
      this.cloudsTinted = true;
      for (const c of decor.clouds) c.mesh.traverse((m) => {
        if (!m.isMesh) return;
        m.material.color.set(0x9a6ad0);
        m.material.opacity = 0.6;
      });
    }
    // Het spel staat stil door een menu of filmpje: dan laten wij Omar en de effecten bewegen
    const cutscene = ['aankomst', 'praten', 'sprong'].includes(this.phase);
    const after = this.phase === 'gewonnen' || this.phase === 'verloren';
    const tick = ui.menuOpen && ((cutscene && running) || (after && (running || ui.menuOpen === 'level')));
    if (tick) {
      effects.update(dt);
      fighter.cutsceneTick(dt);
    }
    // Overgang van het paarse scherm
    if (this.fade && (running || !cutscene)) {
      this.fade.t += dt;
      this.setFade(THREE.MathUtils.lerp(this.fade.from, this.fade.to, smooth(this.fade.t / this.fade.time)));
      if (this.fade.t >= this.fade.time) this.fade = null;
    }
    // Esc gedrukt tijdens het filmpje? Dan staat alles stil: laat zien hoe je verder gaat.
    document.body.classList.toggle('omar-pauze', !running && (cutscene || ui.menuOpen === 'dialog'));
    switch (this.phase) {
      case 'wachten':
        if (running) this.startCutscene(this.d.visits === 0 ? 'lang' : 'kort');
        break;
      case 'aankomst':
        if (!running) break;
        this.t += dt;
        this.updateArrival();
        break;
      case 'praten':
        if (!running) break;
        this.t += dt;
        this.updateTalk();
        break;
      case 'sprong':
        if (!running) break;
        this.t += dt;
        this.updateLeap();
        break;
      case 'gevecht':
        if (running) this.t += dt;
        if (!this.tipShown && this.t > 3.8) {
          this.tipShown = true;
          ui.toast('Tip: druk op <b>Q</b> om je camera op Omar vast te zetten.<br>Hij laat altijd eerst zien wat hij gaat doen!', 6);
        }
        if (fighter.phase2 && !this.phase2Shown) {
          this.phase2Shown = true;
          ui.banner('OMAR WORDT BOOS!', 'Zijn zwaard staat in brand en hij is nog sneller!', 'omar', 3);
        }
        break;
      case 'gewonnen':
        if (running || ui.menuOpen) this.t += dt;
        this.updateWin(dt);
        break;
      case 'verloren':
        if (running || ui.menuOpen) this.t += dt;
        this.updateLose();
        break;
      default:
        break;
    }
    this.updateLeaveButton();
  }

  /** Elke frame (na ui.update in main.js). Mag de camera overnemen. */
  update(dt) {
    if (IN_CASTLE) this.updateCastle(dt);
    else this.updateLevel(dt);
  }

  // ---------- Handig voor testen (in de console: game.omar.win()) ----------

  /** Filmpje overslaan en meteen vechten. */
  skipToFight() {
    if (!IN_CASTLE || this.phase === 'gevecht') return;
    const { ui } = this;
    if (ui.menuOpen === 'dialog') {
      ui.dialog = null;
      ui.el.dialog.classList.add('hidden');
    }
    this.kind ??= 'kort';
    if (this.phase === 'wachten') {
      this.d.visits++;
      this.fade = null;
    }
    this.fighter.playIntro(this.world.castle.landing);
    this.startFight();
  }

  /** Meteen winnen. */
  win() {
    if (!IN_CASTLE) return;
    if (!this.fighter.awake) this.skipToFight();
    const p = this.fighter.puppet;
    p.invulnerable = p.rollTimer = p.dashTimer = 0; // niet wegrollen nu
    const result = this.fighter.hit(this.fighter.position.clone(), `test-${Math.random()}`, this.fighter.hp);
    if (result?.killed) this.onWin(this.fighter);
  }

  /** Meteen verliezen. */
  lose() {
    if (!IN_CASTLE) return;
    if (!this.fighter.awake) this.skipToFight();
    this.player.health = 0;
  }
}
