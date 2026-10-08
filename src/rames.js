import * as THREE from 'three';
import { play } from './audio.js';
import { BOSS_INFO } from './bosses.js';
import { BOSS_KILLS } from './stats.js';
import { WEAPONS } from './weapons.js';
import { RAMES } from './ramesFighter.js'; // (dit laadt ook Rames zelf, zodat hij bij de bosses staat)

// Rames: alles rondom het gevecht tegen Rames, de Heer van de Ondoden. Vooral: de filmpjes.
//
//  1. Loop in het Spookwoud het zijpad bij de Woudruïne af, naar het Knekelhof. Rames zit daar "dood" op zijn troon.
//  2. Stap je het kerkhof op? Dan begint het eerste filmpje: de vuurschalen laaien op, zijn ogen gaan branden,
//     hij schept op, trekt zijn Schaduwkatana uit de grond en de bliksem slaat in. Dan begint het gevecht.
//  3. Onder de helft van zijn leven: een kort filmpje waarin hij zijn bullys (skeletten) uit de graven roept.
//  4. Is zijn leven op? Dan valt hij neer en lijkt het alsof je gewonnen hebt... maar hij is ondood.
//     Hij staat lachend weer op (groen en razend) en het gevecht gaat verder.
//  5. Versla je hem daarna écht, dan knielt hij, geeft hij toe dat je beter bent en valt hij uit elkaar.
//     Je krijgt munten, zijn Schaduwkatana en een Gouden Appel.
//
// Ga je dood, dan raak je niks kwijt: je komt terug bij je checkpoint en mag het opnieuw proberen
// (dan krijg je een kort filmpje). Rames zelf (hoe hij vecht) staat in ramesFighter.js, het kerkhof in world.js.

const smooth = (t) => {
  const k = THREE.MathUtils.clamp(t, 0, 1);
  return k * k * (3 - 2 * k);
};
const pick = (list) => list[Math.floor(Math.random() * list.length)];
const GREEN = 0x5dff7a;
const PURPLE = 0x9b4dff;

// ---------- Alles wat Rames zegt ----------
// Hij praat zoals de echte Rames typt: zonder hoofdletters en punten, met veel "neef" en "zovan".
// Elke zin is [houding, tekst]. De houding (zie POSES in ramesFighter.js) bepaalt ook hoe de camera staat.
const LINES = {
  // De eerste keer dat je het Knekelhof op loopt
  lang: [
    ['wakker', 'ewa neef... wie maakt mij wakker'],
    ['wijs', 'zovan jij komt zomaar <b>mijn</b> kerkhof oplopen met dat zwaardje van je'],
    ['lach', 'neef je gaat niet halen tegen mij ik ben <b>undead</b> je kan mij niet eens dood maken'],
    ['armen', 'en ik heb mijn <b>bullys</b> die je gaan pakken die liggen hier overal onder de grond'],
    ['reik', 'en kijk deze <b>schaduwkatana</b> dan vol dark magic neef een tik en je bent weg'],
    ['voorover', 'maar kom dan laat zien wat je kan'],
  ],
  // Je komt terug nadat je verloren hebt
  verloren: [
    [['lach', 'haha neef ben je er alweer'], ['wijs', 'ik zei toch je gaat niet halen tegen mij']],
    [['wijs', 'zovan hoe vaak wil je nog verliezen bro'], ['armen', 'mijn bullys hebben nog steeds honger neef']],
    [['lach', 'neef serieus nog een keer'], ['voorover', 'ok kom dan maar ik heb de hele dag ik ben toch al dood']],
  ],
  // Je komt terug nadat je hem al eens versloeg
  gewonnen: [
    [['wakker', 'ewa neef jij weer'], ['wijs', 'vorige keer was geluk ik was niet eens serieus']],
    [['voorover', 'zovan jij hebt mijn katana gepakt geef terug bro'], ['wijs', 'deze keer ga je echt niet halen']],
  ],
  // Onder de helft van zijn leven
  bullys: [
    ['planten', 'ok ok neef je kan wel een beetje vechten'],
    ['roepen', 'maar nu is het klaar... <b>BULLYS</b> pak hem'],
  ],
  // Zijn leven is op... dacht je
  herrijzen: [
    ['gevallen', 'hahaha'],
    ['knielen', 'neef... je dacht echt dat je klaar was'],
    ['zweven', 'ik zei toch ik ben <b>undead</b> je kan mij niet killen'],
    ['zweven', 'zovan nu word ik pas echt boos'],
  ],
  // Echt verslagen (de eerste keer, en daarna)
  einde: [
    ['knielen', 'neef...'],
    ['knielen', 'hoe dan ik ben undead dit kan helemaal niet'],
    ['knielen', 'ok ok jij hebt gewonnen... deze keer'],
    ['knielen', 'pak mijn <b>katana</b> maar die heb je verdiend'],
    ['knielen', 'maar zeg tegen niemand dat ik van jou verloren heb'],
  ],
  eindeWeer: [
    ['knielen', 'neef alweer...'],
    ['knielen', 'ok ik geef het toe jij bent gewoon beter'],
    ['knielen', 'maar ik kom toch weer terug ik ben undead bro'],
  ],
  // Jij gaat dood
  dood: [
    'neef ik zei toch je gaat niet halen',
    'zovan was dat alles',
    'mijn bullys hebben je gepakt bro',
    'kom maar terug neef ik ga nergens heen ik ben al dood',
  ],
};

// In deze stappen staat het spel stil en hebben wij de camera
const FILM = ['aankomst', 'praten', 'opstaan', 'bullys', 'bullysPraat', 'bullysKomen', 'val', 'valPraat', 'herrijs', 'einde', 'eindePraat', 'eindeStof'];

export class RamesFlow {
  /**
   * @param {object} ctx  { camera, cameraRig, input, state, stats, ui, player, bosses, world, effects, pickups, projectiles, dragon,
   *                        omar (voor de zwarte film-balken), giveKills, giveRunes, announceNewPowers, removeSummons } uit main.js
   */
  constructor(ctx) {
    Object.assign(this, ctx);
    this.boss = this.bosses.find((b) => b.id === 'rames') ?? null; // (in Omars kasteel is Rames er niet)
    this.phase = 'rust';
    this.t = 0;
    this.lineT = 0;
    this.fired = new Set();
    this.dark = this.darkGoal = 0;
    if (!this.boss) return;
    this.L = this.boss.layout;
    // Oude save zonder Rames? Dan beginnen we gewoon bij nul.
    this.stats.data.rames = { seen: false, wins: 0, losses: 0, ...this.stats.data.rames };
    // Duisternis rond het beeld (tussen de 3D-wereld en de balken en knoppen in)
    this.darkEl = document.createElement('div');
    this.darkEl.id = 'rames-dark';
    document.getElementById('bars').before(this.darkEl);
  }

  /** De Rames-gegevens in de save. */
  get d() {
    return this.stats.data.rames;
  }

  // ---------- Hulpjes voor de filmpjes ----------

  /** Naar een volgende stap van een filmpje. */
  go(phase) {
    this.phase = phase;
    this.t = 0;
    this.fired.clear();
  }

  /** Iets precies één keer doen, zodra deze stap `time` seconden bezig is. */
  at(time, fn) {
    if (this.t < time || this.fired.has(time)) return;
    this.fired.add(time);
    fn();
  }

  /** Een plek gezien vanaf de troon: vooruit (richting de poort), omhoog, en naar rechts (voor wie naar de troon kijkt). */
  T(fwd, up = 0, right = 0) {
    return this.L.throne.clone().addScaledVector(this.L.forward, fwd).addScaledVector(this.L.side, right).setY(up);
  }

  /** Camera op een plek zetten en ergens naar laten kijken (met het schudden van effects erbij). */
  aim(pos, look) {
    this.camPos = pos;
    this.camLook = look;
    this.camera.position.copy(pos);
    const s = this.effects.shakeAmount;
    if (s > 0.001) this.camera.position.add(new THREE.Vector3((Math.random() - 0.5) * s, (Math.random() - 0.5) * s, (Math.random() - 0.5) * s));
    this.camera.position.y = Math.max(0.25, this.camera.position.y);
    this.camera.lookAt(look);
  }

  /** Een camerashot van a naar b. k = hoe ver (0 → 1), zacht beginnen en eindigen. */
  shot(k, fromPos, toPos, fromLook, toLook = fromLook) {
    const e = smooth(k);
    this.aim(fromPos.clone().lerp(toPos, e), fromLook.clone().lerp(toLook, e));
  }

  /** De camera draait om Rames heen. angle = waar de camera staat, look = hoe hoog hij kijkt. */
  orbit(angle, radius, height, look) {
    const p = this.boss.position;
    this.aim(new THREE.Vector3(p.x + Math.sin(angle) * radius, height, p.z + Math.cos(angle) * radius), new THREE.Vector3(p.x, look, p.z));
  }

  /**
   * Een filmpje midden in het gevecht: Rames staat stil en draait zich naar jou toe.
   * this.front = de kant waar hij heen kijkt; daar draait de camera omheen (zo zie je altijd zijn gezicht).
   */
  freezeBoss(pose, speed = 5) {
    const { boss, player } = this;
    boss.mode = 'film';
    boss.mesh.visible = true;
    boss.position.y = 0;
    boss.mesh.rotation.y = Math.atan2(player.position.x - boss.position.x, player.position.z - boss.position.z);
    boss.perform(pose, speed);
    this.front = boss.mesh.rotation.y;
  }

  /** Een filmpje begint: het spel staat stil, zwarte balken in beeld. */
  beginFilm(skippable) {
    this.ui.menuOpen = 'cutscene';
    this.ui.prompt(null);
    this.omar.setFilm(true, skippable);
  }

  /** Het filmpje is klaar: jij mag weer spelen. */
  endFilm() {
    this.ui.menuOpen = null;
    this.omar.setFilm(false);
    this.cameraRig.snapTo(this.player.position);
  }

  /** Is er op een overslaan-toets gedrukt? */
  skipPressed() {
    const { input, state } = this;
    const pressed = input.wasPressed('Space') || input.wasPressed('KeyE') || input.wasPressed('Enter') || state.attackRequested;
    state.attackRequested = false; // een klik in het filmpje wordt geen zwaardslag
    return pressed && this.t > 0.3;
  }

  /** Een felle flits over het hele scherm (bliksem!). */
  flash() {
    const el = document.createElement('div');
    el.id = 'rames-flash';
    document.body.append(el);
    setTimeout(() => el.remove(), 650);
  }

  /** Rames praat: een gesprek, met bij elke zin een andere houding. */
  talk(lines, next, onDone) {
    this.lines = lines;
    this.line = -1;
    this.gesture = null;
    this.omar.setFilm(true, false); // het gesprek heeft zijn eigen "E verder"
    this.go(next);
    this.ui.openDialog('Rames', lines.map((l) => l[1]), () => {
      this.ui.menuOpen = 'cutscene';
      onDone();
    });
  }

  /** Is er een nieuwe zin begonnen? Dan geeft dit de houding van die zin terug (anders null). */
  newLine() {
    const index = this.ui.dialog?.index ?? this.line;
    if (index === this.line) return null;
    this.line = index;
    this.lineT = 0;
    this.gesture = this.lines[index][0];
    return this.gesture;
  }

  /** Een zuil van groen vuur uit een graf: hier komt zo een bully uit. */
  pillar(spot) {
    const { effects } = this;
    effects.burst(spot.clone().setY(0.3), GREEN, { count: 30, speed: 3, size: 0.18, life: 1, up: 7, gravity: 0.15 });
    effects.burst(spot.clone().setY(0.3), 0x3a2f2a, { count: 12, speed: 5, size: 0.2, life: 0.7, up: 3 });
    effects.shockwave(spot, GREEN, 2);
    effects.shake(0.15);
    play('poef');
  }

  // ---------- 1. Het eerste filmpje: Rames wordt wakker ----------

  /** Kom je in de buurt van het Knekelhof? Dan zie je de naam, en de eerste keer een waarschuwing. */
  updateRest() {
    const { boss, player, ui } = this;
    const near = Math.hypot(player.position.x - boss.arena.center.x, player.position.z - boss.arena.center.z) < boss.arena.radius + 9;
    if (near && !this.near && !ui.menuOpen) {
      ui.showRegion(boss.arena.name);
      if (!this.d.seen && !this.warned) {
        this.warned = true;
        ui.toast('☠ <b>Het Knekelhof</b>: hier slaapt <b>Rames</b>, de Heer van de Ondoden.<br><small>Hij is veel sterker dan de andere bosses. Loop door de poort als je durft...</small>', 6);
      }
    }
    this.near = near;
  }

  /** De speler loopt het Knekelhof op (via updateBossFights in main.js). */
  enter() {
    if (!this.boss || this.phase !== 'rust' || this.boss.dead || this.boss.awake) return;
    if (this.dragon.riding || !this.player.alive) return; // eerst afstappen: dit doe je zelf
    this.kind = this.d.seen ? 'kort' : 'lang';
    this.beginFilm(true);
    this.placePlayer();
    this.darkGoal = 0.6;
    this.tipShown = this.d.seen;
    play('whoosh');
    this.go('aankomst');
  }

  /** Jij staat tussen de poort en het midden, en kijkt naar de troon. */
  placePlayer() {
    const { player, state, L } = this;
    player.position.copy(L.fightSpot);
    player.velocity.set(0, 0, 0);
    player.knockback.set(0, 0, 0);
    player.mesh.rotation.y = L.yaw + Math.PI;
    state.lockTarget = null;
  }

  /** Zijn ogen gaan branden: hij is wakker! */
  ignite() {
    const { boss, effects } = this;
    boss.eyeGoal = 1;
    boss.lightFlash = 0.8;
    boss.perform('wakker', 4);
    this.flash();
    effects.shake(0.5);
    effects.burst(this.T(0.3, 2.4), PURPLE, { count: 30, speed: 5, size: 0.12, life: 0.8, up: 2, gravity: 0 });
    play('gong');
    play('donder');
  }

  updateArrival() {
    const { effects, L } = this;
    const t = this.t;
    if (this.kind === 'lang') {
      // De camera sluipt laag tussen de grafstenen door naar de troon; de vuurschalen laaien één voor één op
      L.braziers.forEach((spot, i) => this.at(0.7 + i * 0.5, () => {
        effects.burst(spot, GREEN, { count: 26, speed: 4, size: 0.16, life: 0.9, up: 5, gravity: -0.1 });
        play('fire');
      }));
      if (t < 3.4) this.shot(t / 3.4, this.T(21, 0.6, -5), this.T(10.5, 1.9, -2.2), this.T(0, 2.3), this.T(0, 2.4));
      else this.shot((t - 3.4) / 2.8, this.T(2.7, 2.05, 0.9), this.T(2, 2.15, 0.5), this.T(0.3, 2.4)); // heel dichtbij: zijn schedel
      this.at(4.5, () => this.ignite());
      if (t >= 6.2) this.startTalk();
    } else {
      this.shot(t / 2.2, this.T(13, 1.2, -3), this.T(6.5, 2.1, -1.6), this.T(0, 2.3), this.T(0, 2.4));
      this.at(0.8, () => this.ignite());
      if (t >= 2.2) this.startTalk();
    }
    if (this.skipPressed()) this.startFight();
  }

  startTalk() {
    const d = this.d;
    const lines = this.kind === 'lang' ? LINES.lang : pick(d.wins > 0 ? LINES.gewonnen : LINES.verloren);
    if (this.boss.eyeGoal < 1) this.ignite();
    this.talk(lines, 'praten', () => this.startStand());
  }

  /** Rames op zijn troon schept op. Bij elke zin een andere houding en een ander shot. */
  updateTalk() {
    const { boss, effects, L } = this;
    const gesture = this.newLine();
    if (gesture) {
      boss.perform(gesture, 5, gesture === 'lach' ? 1 : 0);
      if (gesture === 'lach') play('laugh');
      if (gesture === 'armen') play('charge');
      if (gesture === 'reik') play('glint');
    }
    const k = this.lineT / 6;
    switch (this.gesture) {
      case 'wijs': // hij wijst recht naar jou (de camera)
        this.shot(k, this.T(4.7, 1.5, 1.1), this.T(4, 1.6, 0.9), this.T(0.3, 2.1, 0.1));
        break;
      case 'lach': // van onderen: hij lacht je uit
        this.shot(k, this.T(2.7, 1, -0.9), this.T(2.3, 1.1, -0.7), this.T(0.2, 2.3));
        break;
      case 'armen': // van bovenaf: overal groen vuur boven de graven
        this.shot(k, L.at(7, 9, 8), L.at(5, 8, 9.5), L.at(-3, 0.5, 0));
        for (const spot of L.graves) {
          if (Math.random() < 0.3) effects.burst(spot.clone().setY(0.2), GREEN, { count: 2, speed: 1.5, size: 0.14, life: 0.7, up: 4, gravity: -0.1 });
        }
        break;
      case 'reik': // zijn katana, in de grond naast de troon
        this.shot(k, this.T(4.6, 1.3, -3.4), this.T(4.1, 1.5, -3), this.T(1.2, 1.5, -1.2));
        if (Math.random() < 0.4) effects.burst(boss.planted.position.clone().setY(Math.random() * 1.6), PURPLE, { count: 1, speed: 0.6, size: 0.09, life: 0.6, up: 1.2, gravity: -0.1 });
        break;
      case 'voorover':
        this.shot(k, this.T(5.4, 1.7, 0.5), this.T(4.4, 1.9, 0.3), this.T(0.3, 2.05));
        break;
      default:
        this.shot(k, this.T(5, 2.3, -1.8), this.T(4.3, 2.35, -1.4), this.T(0, 1.8));
    }
  }

  /** Hij staat op, trekt zijn katana uit de grond, de bliksem slaat in... en hij slaat hem naar beneden. */
  startStand() {
    const { boss, L } = this;
    this.omar.setFilm(true, true);
    boss.mode = 'film';
    boss.perform('grijp', 6);
    this.standFrom = boss.position.clone();
    this.standMid = L.throne.clone().addScaledVector(L.forward, 1.75);
    this.standTo = L.throne.clone().addScaledVector(L.forward, 2.6);
    play('jump');
    this.go('opstaan');
  }

  updateStand() {
    const { boss, effects, player } = this;
    const t = this.t;
    if (t < 1.5) boss.position.lerpVectors(this.standFrom, this.standMid, smooth(t / 0.5));
    else boss.position.lerpVectors(this.standMid, this.standTo, smooth((t - 1.5) / 0.45));
    this.at(0.6, () => {
      effects.burst(boss.planted.position.clone().setY(0.3), PURPLE, { count: 24, speed: 6, size: 0.1, life: 0.5, up: 3 });
      effects.sparks(boss.planted.position, 0xffffff);
      boss.takeKatana();
      boss.perform('heffen', 9);
      play('glint');
      play('heavySwing');
    });
    this.at(1.3, () => {
      // De bliksem slaat in op zijn katana
      this.flash();
      boss.lightFlash = 1;
      effects.shake(0.7);
      effects.burst(boss.position.clone().setY(5.2), PURPLE, { count: 40, speed: 9, size: 0.14, life: 0.7, up: 0, gravity: 0.4 });
      play('donder');
    });
    this.at(1.85, () => {
      boss.perform('neerslaan', 18);
      play('heavySwing');
    });
    this.at(2.05, () => {
      effects.shockwave(boss.position, PURPLE, 12);
      effects.burst(boss.position.clone().setY(0.4), PURPLE, { count: 40, speed: 9, size: 0.16, life: 0.8, up: 2 });
      effects.shake(0.6);
      play('slam');
      if (!boss.awake) boss.wake(); // de mistmuur gaat omhoog
      boss.mode = 'film';
      boss.perform('neerslaan', 18);
    });
    this.at(2.5, () => boss.perform('klaar', 5));
    if (t < 2.05) this.shot(t / 2.05, this.T(7.6, 0.8, -2.8), this.T(6.6, 1, -2.1), this.T(1.6, 2.3, -0.5), this.T(2.2, 2.9, -0.3)); // van onderen: wat is hij groot
    else {
      // Van achter jou: daar staat hij, en hij komt eraan
      const p = player.position;
      const back = p.clone().addScaledVector(this.L.forward, 4.2).addScaledVector(this.L.side, 1.3);
      this.shot((t - 2.05) / 0.9, back.clone().setY(3.4), back.clone().setY(2.6), boss.position.clone().setY(2));
    }
    if (t >= 3 || this.skipPressed()) this.startFight();
  }

  // ---------- 2. Het gevecht ----------

  startFight() {
    const { boss, player, state, ui, cameraRig, stats, L } = this;
    const d = this.d;
    if (ui.menuOpen === 'dialog') {
      ui.dialog = null;
      ui.el.dialog.classList.add('hidden');
    }
    boss.standReady();
    if (boss.awake) boss.fight();
    else boss.wake();
    this.placePlayer();
    state.activeBoss = boss; // de boss-balk komt in beeld
    this.endFilm();
    cameraRig.yaw = L.yaw;
    cameraRig.pitch = 0.3;
    cameraRig.snapTo(player.position);
    this.darkGoal = 0.35;
    ui.banner('RAMES', `${BOSS_INFO.rames.title} — "neef je gaat niet halen"`, 'rames', 3.5);
    play('gong');
    if (!d.seen) {
      d.seen = true;
      stats.save();
    }
    this.phase = 'gevecht';
    this.t = 0;
  }

  updateFight(dt, running) {
    const { boss, ui } = this;
    if (!boss.awake) {
      // Jij ging dood: alles is teruggezet, Rames zit weer op zijn troon
      this.phase = 'rust';
      this.darkGoal = 0;
      return;
    }
    if (!this.player.alive) return; // (jij bent net dood: geen filmpje meer)
    if (boss.down) return this.startFall();
    if (boss.wants === 'bullys') return this.startBullys();
    if (running && !ui.menuOpen) this.t += dt;
    if (!this.tipShown && this.t > 4) {
      this.tipShown = true;
      ui.toast('Tip: Rames laat altijd eerst zien wat hij gaat doen (let op de <b>rode cirkels</b>!). Sla hem als hij staat uit te hijgen.<br><small>Zijn bullys laten soms een hartje vallen.</small>', 7);
    }
  }

  /** Na een filmpje midden in het gevecht: verder vechten. */
  resumeFight() {
    this.boss.fight();
    this.endFilm();
    this.phase = 'gevecht';
  }

  // ---------- 3. Onder de helft: "BULLYS pak hem" ----------

  startBullys() {
    const { boss, effects } = this;
    boss.wants = null;
    boss.marks = boss.marks.filter((mark) => mark < boss.hp / boss.info.hp); // (deze bullys tellen ook voor wat hij al had moeten roepen)
    this.beginFilm(false);
    this.freezeBoss('planten', 9);
    effects.shockwave(boss.position, PURPLE, 3.5);
    effects.shake(0.4);
    play('slam');
    this.go('bullys');
  }

  updateBullys() {
    this.orbit(this.front + 0.95 - this.t * 0.45, 5.4, 2.3, 2);
    if (this.t >= 1) this.talk(LINES.bullys, 'bullysPraat', () => {
      this.spots = this.boss.pickGraves(RAMES.bullys.count[1], this.player.position);
      this.go('bullysKomen');
    });
  }

  updateBullysTalk() {
    const gesture = this.newLine();
    if (gesture) {
      this.boss.perform(gesture, 7);
      if (gesture === 'roepen') {
        play('laugh');
        play('charge');
      }
    }
    if (this.gesture === 'roepen') this.orbit(this.front - 0.4 - this.lineT * 0.05, 3.9, 1.1, 2.7); // van onderen: hij brult om zijn bullys
    else this.orbit(this.front + 0.5 + this.lineT * 0.05, 4.8, 2.1, 2.2);
  }

  updateBullysRise() {
    const { boss, L, ui } = this;
    // Van hoog boven de poort: uit de graven schiet groen vuur
    this.shot(this.t / 1.7, L.at(13, 10, 9), L.at(11.5, 11.5, 7.5), L.at(0, 0.5, 0));
    this.spots.forEach((spot, i) => this.at(0.15 + i * 0.22, () => this.pillar(spot)));
    if (this.t >= 1.7) {
      boss.raiseBullys(this.spots);
      ui.banner('DE BULLYS VAN RAMES', 'Ze kruipen uit hun graven!', 'rames', 2.6);
      this.resumeFight();
    }
  }

  // ---------- 4. Zijn leven is op... maar hij is ondood ----------

  startFall() {
    const { boss, state, effects } = this;
    this.wasLocked = state.lockTarget === boss;
    this.beginFilm(false);
    this.projectiles.clear();
    this.freezeBoss('knielen', 5);
    boss.eyeGoal = 0.35;
    effects.shake(0.4);
    play('defeat');
    this.go('val');
  }

  updateFall() {
    const { boss, effects, ui } = this;
    const t = this.t;
    this.orbit(this.front + 1.0 - t * 0.12, 6.2 - Math.min(t, 3) * 0.35, 1.3, 1);
    this.at(0.9, () => boss.perform('gevallen', 6));
    this.at(1.25, () => {
      boss.eyeGoal = 0;
      effects.burst(boss.position.clone().setY(0.2), 0x9a8f7a, { count: 24, speed: 5, size: 0.18, life: 0.7, up: 2 });
      effects.shake(0.35);
      play('slam');
    });
    // Het lijkt alsof je gewonnen hebt...
    this.at(2, () => {
      ui.banner('VIJAND GEVELD', boss.info.name, 'gold', 5);
      play('win');
    });
    // ...maar dan
    this.at(3.9, () => {
      ui.bannerTimer = Math.min(ui.bannerTimer, 0.2);
      this.darkGoal = 0.95;
      boss.setLook(true);
      boss.eyeGoal = 0.8;
      effects.shake(0.3);
      play('laugh');
    });
    if (t >= 4.7) this.talk(LINES.herrijzen, 'valPraat', () => this.startRise());
  }

  updateFallTalk() {
    const { boss, effects } = this;
    const gesture = this.newLine();
    if (gesture === 'gevallen') {
      boss.perform('gevallen', 6, 1.5);
      play('laugh');
    } else if (gesture === 'knielen') {
      boss.perform('knielen', 3);
      boss.eyeGoal = 1;
      play('charge');
    } else if (gesture === 'zweven') {
      boss.perform('zweven', 2.5);
      play('whoosh');
    }
    const p = boss.position;
    if (this.gesture === 'gevallen') {
      // Heel laag bij de grond: twee groene ogen in het donker
      const f = new THREE.Vector3(Math.sin(boss.mesh.rotation.y), 0, Math.cos(boss.mesh.rotation.y));
      const side = new THREE.Vector3(f.z, 0, -f.x);
      this.aim(p.clone().addScaledVector(f, 5.2).addScaledVector(side, 1.6 - this.lineT * 0.1).setY(0.5), p.clone().addScaledVector(f, 2.2).setY(0.5));
    } else if (this.gesture === 'knielen') this.orbit(this.front + 0.55 + this.lineT * 0.06, 5, 1.6, 1.7);
    else {
      // Hij zweeft omhoog: botten en zieltjes vliegen naar hem toe (de camera kijkt van onderen, eerst links en dan rechts)
      this.orbit(this.front + (this.line === 2 ? -0.5 : 0.35) + this.lineT * 0.08, 5.8, 0.8, 3.3);
      effects.shake(0.06);
      if (Math.random() < 0.6) {
        const b = Math.random() * Math.PI * 2;
        effects.burst(new THREE.Vector3(p.x + Math.sin(b) * 2.5, 0.2, p.z + Math.cos(b) * 2.5), Math.random() < 0.5 ? GREEN : 0xe6dfc8, { count: 1, speed: 1, size: 0.14, life: 1, up: 5, gravity: -0.1 });
      }
    }
  }

  /** BOEM: hij is terug. Zijn leven vult weer aan en zijn bullys komen erbij. */
  startRise() {
    const { boss, effects } = this;
    boss.rise();
    this.spots = boss.pickGraves(RAMES.bullys.count[2], this.player.position);
    for (const spot of this.spots) this.pillar(spot);
    this.flash();
    effects.shockwave(boss.position, GREEN, 14);
    effects.shockwave(boss.position, GREEN, 7);
    effects.burst(boss.position.clone().setY(2.5), GREEN, { count: 60, speed: 12, size: 0.18, life: 0.9, up: 2, gravity: 0.2 });
    effects.shake(0.9);
    play('donder');
    play('gong');
    this.riseFrom = this.camPos.clone();
    this.go('herrijs');
  }

  updateRise(dt) {
    const { boss, player, state, ui } = this;
    const full = Math.round(boss.info.hp * RAMES.rebirth);
    boss.hp = Math.min(full, boss.hp + (full * dt) / 1.3); // zijn levensbalk loopt weer vol
    // De camera vliegt terug naar achter jou
    const p = player.position;
    const away = p.clone().sub(boss.position).setY(0).normalize();
    this.shot(this.t / 1.5, this.riseFrom, p.clone().addScaledVector(away, 4.5).setY(3.2), boss.position.clone().setY(3.3), boss.position.clone().setY(2.2));
    this.at(0.25, () => ui.banner('RAMES DE HERREZENE', '"ik zei toch... undead neef"', 'herrezen', 3.2));
    this.at(1.2, () => boss.perform('klaar', 5));
    if (this.t >= 1.9) {
      boss.hp = full;
      boss.raiseBullys(this.spots);
      this.darkGoal = 0.35;
      this.resumeFight();
      this.cameraRig.yaw = Math.atan2(away.x, away.z);
      if (this.wasLocked) state.lockTarget = boss;
    }
  }

  // ---------- 5. Echt verslagen ----------

  /** Rames is echt verslagen (via onBossDefeated in main.js). */
  onWin(boss) {
    const { stats, state, effects } = this;
    const d = this.d;
    const first = d.wins === 0;
    state.activeBoss = null;
    state.lockTarget = null;
    this.projectiles.clear();
    // De beloning krijg je meteen (en hij wordt opgeslagen), ook als je het filmpje niet afkijkt
    this.powersBefore = stats.unlockedPowers();
    this.levelBefore = stats.level;
    this.newPerks = this.giveKills((first ? BOSS_KILLS.first : BOSS_KILLS.again) * 2, false) ?? [];
    this.reward = first ? BOSS_INFO.rames.runes : Math.round(BOSS_INFO.rames.runes / 3);
    this.giveRunes(this.reward);
    if (first) {
      stats.addItem({ kind: 'weapon', key: 'schaduwkatana' });
      stats.addItem({ kind: 'flask' }); // een Gouden Appel
    }
    if (!stats.data.bosses.includes(boss.id)) stats.data.bosses.push(boss.id);
    d.wins++;
    this.firstWin = first;
    stats.save();
    // Zonder Rames vallen zijn bullys uit elkaar
    for (const bully of boss.bullys) {
      if (bully.alive) effects.burst(bully.center, 0xe6dfc8, { count: 18, speed: 6, size: 0.14, life: 0.8, up: 3 });
    }
    this.removeSummons();
    this.beginFilm(false);
    this.freezeBoss('knielen', 5);
    boss.eyeGoal = 0.5;
    this.darkGoal = 0.6;
    effects.shake(0.5);
    play('defeat');
    this.go('einde');
  }

  updateEnd() {
    this.orbit(this.front + 0.9 - this.t * 0.3, 5.6, 1.5, 1.5);
    if (this.t >= 1.1) this.talk(this.firstWin ? LINES.einde : LINES.eindeWeer, 'eindePraat', () => {
      play('whoosh');
      this.go('eindeStof');
    });
  }

  updateEndTalk() {
    const { boss } = this;
    this.newLine();
    boss.eyeGoal = 0.35 + Math.sin(this.lineT * 7) * 0.2; // zijn ogen flakkeren: het is bijna voorbij
    this.orbit(this.front + 0.5 - this.line * 0.22 + this.lineT * 0.04, 4.4, 1.2, 1.6); // elke zin een stukje verder om hem heen
  }

  /** Hij valt uit elkaar in honderden zieltjes. Alleen zijn katana blijft achter. */
  updateEndDust(dt) {
    const { boss, effects, ui } = this;
    const t = this.t;
    const k = smooth(t / 1.8);
    this.orbit(this.front - 0.4 + t * 0.2, 5 + t * 0.6, 1.6 + t * 0.4, 1.6);
    if (t < 1.8) {
      boss.mesh.scale.setScalar(1 - k * 0.9);
      boss.eyeGoal = 1 - k;
      for (let i = 0; i < 3; i++) {
        const at = boss.position.clone().add(new THREE.Vector3((Math.random() - 0.5) * 1.6, Math.random() * 3 * (1 - k * 0.8), (Math.random() - 0.5) * 1.6));
        effects.burst(at, Math.random() < 0.5 ? boss.look : PURPLE, { count: 2, speed: 1.2, size: 0.12, life: 1.1, up: 3.5, gravity: -0.12 });
      }
    }
    this.at(1.8, () => {
      boss.mesh.visible = false;
      boss.eyeGlow = boss.eyeGoal = 0;
      // Zijn katana blijft in de grond staan
      boss.planted.position.copy(boss.position).setY(1.72);
      boss.planted.visible = true;
      effects.shockwave(boss.position, boss.look, 6);
      play('shine');
    });
    this.at(2.1, () => {
      ui.banner('VIJAND GEVELD', `Rames, ${BOSS_INFO.rames.title}`, 'gold', 4.5);
      this.pickups.coinBurst(boss.center, 100);
      play('win');
    });
    boss.light.intensity = Math.max(2, boss.light.intensity - dt * 20);
    if (t >= 4.6) this.finish();
  }

  finish() {
    const { stats, ui, cameraRig } = this;
    this.endFilm();
    this.darkGoal = 0;
    this.phase = 'klaar';
    this.announceNewPowers(this.powersBefore, 0, this.newPerks);
    document.exitPointerLock?.();
    const katana = WEAPONS.schaduwkatana;
    const html = `Het Knekelhof is eindelijk stil. Jij hebt <b>Rames</b> verslagen, en hij was nog wel ondood!
      <br>Beloning: <b>+${this.reward} munten</b>${this.firstWin ? `, de <b>${katana.name}</b> (${katana.damage} schade, het snelste wapen: pak hem met <b>I</b>) en een <b>Gouden Appel</b>` : ''}
      ${stats.level > this.levelBefore ? `<br>⬆ Je bent nu <b>level ${stats.level}</b>!` : ''}
      <br><small>Overwinningen op Rames: ${this.d.wins}. Hij komt altijd weer terug... hij is ondood.</small>`;
    ui.openLevelComplete('RAMES VERSLAGEN!', html, [['Verder spelen', () => {
      ui.closeMenu();
      cameraRig.lock();
    }]]);
  }

  // ---------- Haken voor main.js ----------

  /** Jij gaat dood in het gevecht (via die() in main.js): Rames lacht je uit. Geeft zijn tekst terug (of null). */
  onPlayerDeath() {
    if (this.phase !== 'gevecht') return null;
    this.d.losses++;
    this.stats.save();
    play('laugh');
    return `Rames: "${pick(LINES.dood)}"`;
  }

  /** Welke muziek hoort er nu? [liedje, hoe heftig], of null als wij er niks over te zeggen hebben. */
  musicWanted() {
    switch (this.phase) {
      case 'rust':
      case 'klaar':
        return null;
      case 'aankomst':
      case 'praten':
      case 'opstaan':
        return ['rames', -1]; // tijdens het filmpje komt zijn muziek al zachtjes op
      case 'val':
      case 'valPraat':
      case 'einde':
      case 'eindePraat':
      case 'eindeStof':
        return [null, 0]; // doodse stilte
      default:
        return ['rames', this.boss.reborn ? 1 : 0]; // herrezen = sneller
    }
  }

  /** Elke frame (na ui.update in main.js). In een filmpje nemen wij de camera over. */
  update(dt) {
    const { boss, cameraRig, state } = this;
    if (!boss) return;
    const running = cameraRig.locked || state.forceRun;
    const filming = FILM.includes(this.phase);
    // De duisternis rond het beeld schuift langzaam mee
    this.dark += (this.darkGoal - this.dark) * Math.min(1, 2.5 * dt);
    this.darkEl.style.opacity = this.dark.toFixed(3);
    this.world.gloom = 1 - Math.min(1, this.dark * 1.6) * 0.5; // de hele wereld wordt donkerder: dan gloeit zijn magie nog feller
    // Esc gedrukt tijdens een filmpje? Dan staat alles stil (het bordje "Pauze" komt uit omar.js)
    document.body.classList.toggle('omar-pauze', filming && !running);
    if (filming) {
      if (!boss.awake && !['aankomst', 'praten', 'opstaan'].includes(this.phase)) {
        // Rames is teruggezet terwijl er een filmpje liep (jij ging net dood): stoppen
        this.endFilm();
        this.phase = 'rust';
        this.darkGoal = 0;
        return;
      }
      if (!running) {
        if (this.camPos) this.aim(this.camPos, this.camLook);
        return;
      }
      // Het spel staat stil: dan laten wij Rames en de effecten bewegen
      this.t += dt;
      this.lineT += dt;
      this.effects.update(dt);
      boss.cutsceneTick(dt, this.effects);
    }
    switch (this.phase) {
      case 'rust': this.updateRest(); break;
      case 'gevecht': this.updateFight(dt, running); break;
      case 'aankomst': this.updateArrival(); break;
      case 'praten': this.updateTalk(); break;
      case 'opstaan': this.updateStand(); break;
      case 'bullys': this.updateBullys(); break;
      case 'bullysPraat': this.updateBullysTalk(); break;
      case 'bullysKomen': this.updateBullysRise(); break;
      case 'val': this.updateFall(); break;
      case 'valPraat': this.updateFallTalk(); break;
      case 'herrijs': this.updateRise(dt); break;
      case 'einde': this.updateEnd(); break;
      case 'eindePraat': this.updateEndTalk(); break;
      case 'eindeStof': this.updateEndDust(dt); break;
      default: break;
    }
  }

  // ---------- Handig voor testen (in de console: game.rames.skipToFight()) ----------

  /** Filmpje overslaan en meteen vechten. */
  skipToFight() {
    if (!this.boss || this.boss.dead || this.phase === 'gevecht') return;
    this.kind ??= 'kort';
    this.startFight();
  }

  /** Zijn leven op een stand zetten (0 - 1). Bijvoorbeeld game.rames.setHp(0.01): één klap en hij "sterft". */
  setHp(fraction) {
    if (this.boss) this.boss.hp = Math.max(1, Math.round(this.boss.info.hp * fraction));
  }
}
