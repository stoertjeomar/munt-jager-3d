import * as THREE from 'three';
import { LEVELS, LEVEL, LEVEL_INDEX, IN_SKY, IN_SPECIAL } from './levels.js';
import { CHECKPOINTS } from './world.js';
import { OmarFlow } from './omar.js';
import { QUESTS } from './npcs.js';
import { play } from './audio.js';
import { SKY } from './skyFighter.js'; // (dit laadt ook Sky zelf, zodat hij bij de bosses staat)

// Sky: alles rondom de quest en het gevecht tegen Sky, de Heer van de Storm.
//
//  1. In het Rotshoogland woont Opa Donder (npcs.js). Hij geeft je de quest "De storm van Sky".
//  2. De Wolkenwachten in het hoogland (zwevende onweerswolkjes) laten soms een Wolkenkelk vallen (1 op 4).
//  3. Met 4 Wolkenkelken stap je op de Donderpoort naast Opa Donder (E): een bliksem slaat in en je
//     reist naar het Wolkenrijk (index.html?level=sky, gebouwd in skyworld.js).
//  4. Daar: een filmpje. Sky zit op zijn wolkentroon, schept op, wordt een wolk en slaat als bliksem de arena in.
//  5. Winnen: altijd 1500 munten, en 1 op de 10 keer laat Sky zijn bliksemzwaard NightWalker vallen.
//     Verliezen: Sky lacht je uit. Nog een keer kost weer 4 Wolkenkelken.
//
// Het meeste werkt precies zoals bij Omar, daarom bouwt dit verder op OmarFlow (omar.js).
// Sky zelf (hoe hij vecht) staat in skyFighter.js, het Wolkenrijk in skyworld.js.

// ---------- Instellingen ----------
const QUEST = 'donder-sky';
export const SKY_LOOT = {
  kelken: QUESTS[QUEST].goal.kelken, // zoveel Wolkenkelken kost één reis (of één herkansing)
  kelkChance: 0.25, // kans dat een Wolkenwacht een Wolkenkelk laat vallen
  runes: 1500, // munten als je Sky verslaat (elke keer!)
  nightwalker: 0.1, // kans dat Sky NightWalker laat vallen
  respawn: 45, // na zoveel seconden komt een verslagen Wolkenwacht terug (als je ver genoeg weg bent)
};
// Waar je terugkomt na het Wolkenrijk: het begin van het Rotshoogland (daar staan Opa Donder en zijn poort)
const HOME = LEVELS.findIndex((l) => l.npcs.some((n) => n[0] === 'donder'));
const HOME_NAME = LEVELS[HOME].checkpoints[0][1];

const $ = (id) => document.getElementById(id);
const smooth = (t) => {
  const k = THREE.MathUtils.clamp(t, 0, 1);
  return k * k * (3 - 2 * k);
};
const V = (x, y, z) => new THREE.Vector3(x, y, z);
const CLOUD = [0xf4f7fc, 0xd8e0ec, 0xb4c0d4];

// Extra stijl: gele banners, het stormscherm en de knop om terug te gaan
const STYLE = `
.banner-sky #banner-text { color: #ffe680; text-shadow: 0 0 22px rgba(255, 210, 58, 0.8), 0 0 4px #000; }
#omar-fade.sky { background: radial-gradient(circle at 50% 45%, #3a4a6e 0%, #121828 65%, #000 100%); }
#omar-fade.sky b { color: #ffe680; text-shadow: 0 0 20px rgba(255, 210, 58, 0.8); }
#omar-fade.sky small { color: #cfe0ff; }
#sky-leave { padding: 8px 26px; background: rgba(20, 28, 48, 0.85); border: 1px solid #ffd23a; color: #fff3c4;
  font: inherit; font-size: 17px; letter-spacing: 1px; cursor: pointer; }
#sky-leave:hover { filter: brightness(1.25); }
body.sky-rijk #lock-hint h1 { color: #fff3c4; text-shadow: 0 0 24px rgba(255, 210, 58, 0.7); }
body.sky-rijk #lock-hint #omar-castle-info { color: #cfe0ff; }
`;

// Wat Sky zegt op zijn wolkentroon. gestures = wat hij doet bij elke zin.
const THRONE_LINES = {
  lang: {
    lines: [
      'Zo... iemand heeft de Donderpoort gevonden. Welkom in mijn <b>Wolkenrijk</b>.',
      'Ik ben <b>SKY</b>. Heer van de Storm. De <b>nieuwe baas</b> van deze game.',
      'Omar heeft dit spel gebouwd... maar ik heb de <b>bliksem</b> erin gestopt. Hoor je hem rommelen?',
      'Ik word een <b>wolk</b> en verschijn <b>vóór</b> of <b>achter</b> je. Mijn <b>bliksemwolven</b> hebben honger. En dit is <b>NightWalker</b>.',
      'Versla mij, en je krijgt <b>1500 munten</b>. En wie weet... laat ik NightWalker vallen. Hehe. Héél misschien.',
      'Genoeg gepraat. Laat de storm beginnen!',
    ],
    gestures: ['zitten', 'wijzen', 'lachen', 'zwaard', 'lachen', 'zwaard'],
  },
  kortVerloren: {
    lines: ['Jij weer? De vorige keer was je zo snel weg als een windvlaag.', 'Ik hoop dat je deze keer beter oplet. Vóór... of achter?'],
    gestures: ['lachen', 'wijzen'],
  },
  kortGewonnen: {
    lines: ['Aha. De speler die mij versloeg. Ik heb nagedacht... en geoefend.', 'Deze keer is de storm sterker. Kom maar!'],
    gestures: ['zitten', 'zwaard'],
  },
  kort: {
    lines: ['Terug in mijn Wolkenrijk? Dapper.', 'Kom maar op. De storm wacht niet.'],
    gestures: ['wijzen', 'zwaard'],
  },
  herkansing: {
    lines: ['Nog een keer? Je hebt lef, dat moet ik toegeven.', 'Goed. Dan blaas ik je nóg een keer omver!'],
    gestures: ['lachen', 'zwaard'],
  },
};

// Wat je ziet als je terug bent bij Opa Donder
const RETURN_TEXTS = {
  gewonnen: '⚡ Je hebt <b>Sky</b> verslagen! Opa Donder is trots op je.<br><small>Ga naar hem toe voor je beloning (als je die nog niet had).</small>',
  verloren: 'Opa Donder: <i>"Weggeblazen door de storm? Verzamel nieuwe Wolkenkelken en probeer het nog eens!"</i>',
  gevlucht: 'Opa Donder: <i>"Zo snel terug? Sky is ook wel héél eng, hè."</i>',
  terug: 'Opa Donder: <i>"Hè? Ben je er nu al weer?"</i>',
};

export class SkyFlow extends OmarFlow {
  /**
   * @param {object} ctx  hetzelfde als OmarFlow (omar.js), plus enemies (voor de Wolkenwachten)
   */
  constructor(ctx) {
    super(ctx);
    this.cloudTint = [0x6a7488, 0.95]; // donkere onweerswolken (in het Wolkenrijk)
  }

  initSave() {
    this.stats.data.sky = { wins: 0, losses: 0, visits: 0, seen: false, trip: null, back: null, kelken: 0, drops: 0, ...this.stats.data.sky };
  }

  get d() {
    return this.stats.data.sky;
  }

  get homeName() {
    return HOME_NAME;
  }

  get inArena() {
    return IN_SKY;
  }

  get spots() {
    return this.world.sky;
  }

  get bannerKind() {
    return 'sky';
  }

  get fightTexts() {
    return {
      tip: 'Tip: kijk naar het <b>wolkje</b> als Sky verdwijnt: daar komt hij tevoorschijn, <b>vóór</b> of <b>achter</b> je!<br>Rode cirkels = daar slaat de bliksem in. Rol opzij als de wolven komen!',
      boos: ['SKY WORDT BOOS!', 'De storm barst los: zijn aders gloeien wit en hij is nog sneller!'],
    };
  }

  createDom() {
    super.createDom();
    if ($('sky-style')) return;
    const style = document.createElement('style');
    style.id = 'sky-style';
    style.textContent = STYLE;
    document.head.append(style);
  }

  setup() {
    this.respawns = []; // verslagen Wolkenwachten die straks terugkomen: { enemy, t }
    if (IN_SKY) this.setupCastle();
    else if (!IN_SPECIAL) this.setupLevel();
  }

  /** Hoeveel Wolkenkelken heb je? */
  get kelken() {
    return this.d.kelken;
  }

  /** De quest van Opa Donder: 'nieuw' | 'actief' | 'klaar' | 'beloond' */
  get questState() {
    return this.stats.data.quests[QUEST]?.state ?? 'nieuw';
  }

  // ======================================================================
  // In de open wereld: Opa Donder, de Donderpoort en de Wolkenwachten
  // ======================================================================

  setupLevel() {
    this.npc = this.npcs.list.find((n) => n.id === 'donder') ?? null;
    if (LEVEL.portal) this.buildPortal(V(LEVEL.portal[0], 0, LEVEL.portal[1]));
    const d = this.d;
    // Kom je terug uit het Wolkenrijk (of had je het dichtgeklikt)? Dan krijg je je checkpoint terug.
    const back = d.back ?? (d.trip ? { ...d.trip, result: null } : null);
    if (back) {
      if (CHECKPOINTS.some((c) => c.id === back.checkpoint)) this.stats.data.checkpoint = back.checkpoint;
      if (back.result && this.portal) {
        this.placeAtPortal();
        this.pendingResult = back.result;
      }
    }
    if (d.back || d.trip) {
      d.back = null;
      d.trip = null;
      this.stats.save();
    }
  }

  /** De Donderpoort: een stenen schijf met een wervelende wolk, en een boog van bliksem erboven. */
  buildPortal(pos) {
    const g = new THREE.Group();
    g.position.copy(pos);
    const stone = new THREE.MeshStandardMaterial({ color: 0x8a8f99, roughness: 0.9 });
    const glow = new THREE.MeshBasicMaterial({ color: 0xffd23a, toneMapped: false });
    const disk = new THREE.Mesh(new THREE.CylinderGeometry(2.3, 2.5, 0.16, 32), stone);
    disk.position.y = 0.08;
    disk.receiveShadow = true;
    g.add(disk);
    const ring = new THREE.Mesh(new THREE.TorusGeometry(2.05, 0.06, 6, 48), glow);
    ring.rotation.x = Math.PI / 2;
    ring.position.y = 0.18;
    g.add(ring);
    // Twee stenen zuilen met een boog van bliksem
    for (const s of [-1, 1]) {
      const pillar = new THREE.Mesh(new THREE.BoxGeometry(0.6, 3.6, 0.6), stone);
      pillar.position.set(s * 2.1, 1.8, 0);
      pillar.castShadow = true;
      g.add(pillar);
      this.world.colliders.push(new THREE.Box3().setFromCenterAndSize(pos.clone().add(V(s * 2.1, 1.8, 0)), V(0.6, 3.6, 0.6)));
    }
    const arch = new THREE.Mesh(new THREE.TorusGeometry(2.1, 0.09, 6, 32, Math.PI), glow);
    arch.position.y = 3.6;
    g.add(arch);
    // De wervelende wolk (een plaatje met een spiraal dat ronddraait)
    const c = document.createElement('canvas');
    c.width = c.height = 128;
    const ctx = c.getContext('2d');
    ctx.translate(64, 64);
    for (let i = 0; i < 260; i++) {
      const a = i * 0.18;
      const r = i * 0.23;
      ctx.fillStyle = `rgba(${200 + (i % 50)}, ${210 + (i % 40)}, 255, ${0.5 - i / 600})`;
      ctx.beginPath();
      ctx.arc(Math.cos(a) * r, Math.sin(a) * r, 5 + i * 0.03, 0, Math.PI * 2);
      ctx.fill();
    }
    const swirl = new THREE.Mesh(new THREE.CircleGeometry(1.9, 32), new THREE.MeshBasicMaterial({ map: new THREE.CanvasTexture(c), transparent: true, depthWrite: false, toneMapped: false }));
    swirl.rotation.x = -Math.PI / 2;
    swirl.position.y = 0.2;
    g.add(swirl);
    this.scene.add(g);
    this.portal = { pos, group: g, swirl, ring, arch, sparkT: 0 };
  }

  /** Zet de speler naast de poort, met de camera zo dat je Opa Donder ziet. */
  placeAtPortal() {
    const { player, cameraRig } = this;
    const look = this.npc?.position ?? this.portal.pos;
    const spot = this.portal.pos.clone().add(V(0, 0, 3.2));
    player.position.copy(spot);
    player.velocity.set(0, 0, 0);
    player.mesh.rotation.y = Math.atan2(look.x - spot.x, look.z - spot.z);
    cameraRig.yaw = Math.atan2(spot.x - look.x, spot.z - look.z);
    cameraRig.snapTo(player.position);
  }

  /** Sta je op de Donderpoort? */
  nearPortal(pos) {
    return !!this.portal && Math.hypot(pos.x - this.portal.pos.x, pos.z - this.portal.pos.z) < 2.3 && pos.y < 1.5 && this.phase === 'rust';
  }

  /** De tekst onderin als je op de poort staat. */
  portalPrompt() {
    return `<b>E</b> Donderpoort naar het Wolkenrijk · ⚡ Wolkenkelken: <b>${this.kelken} / ${SKY_LOOT.kelken}</b>`;
  }

  /** E op de Donderpoort. */
  usePortal() {
    const { ui } = this;
    if (this.questState === 'nieuw') {
      play('click');
      ui.toast('De poort zoemt, maar er gebeurt niks.<br><small>Praat eerst met <b>Opa Donder</b>.</small>', 4);
      return;
    }
    if (this.kelken < SKY_LOOT.kelken) {
      play('click');
      ui.toast(`⚡ De Donderpoort heeft <b>${SKY_LOOT.kelken} Wolkenkelken</b> nodig. Jij hebt er <b>${this.kelken}</b>.<br><small>De <b>Wolkenwachten</b> hier in het hoogland laten ze soms vallen.</small>`, 5);
      return;
    }
    this.openChoice();
  }

  /** Ja of nee: naar het Wolkenrijk? */
  openChoice() {
    const { stats, ui } = this;
    const d = this.d;
    this.phase = 'kiezen';
    document.exitPointerLock?.();
    const html = `De Donderpoort brengt je naar het <b>Wolkenrijk</b>. Daar vecht je tegen <b>Sky</b>, de Heer van de Storm.
      <br><small>Sky is nog sterker dan Omar: hij teleporteert als een wolk (vóór of achter je!), laat de bliksem inslaan en roept bliksemwolven op.
      De reis kost <b>${SKY_LOOT.kelken} Wolkenkelken</b>. Verlies je? Dan kom je gewoon hier terug en raak je verder niks kwijt.</small>
      <br><br>Jij: level <b>${stats.level}</b> · Sky: level <b>${SKY.level}</b> · Wolkenkelken <b>${this.kelken}</b> · Gewonnen <b>${d.wins}</b> · Verloren <b>${d.losses}</b>`;
    ui.openLevelComplete('NAAR HET WOLKENRIJK?', html, [
      [`⚡ Ja, breng me naar Sky! (J)`, () => this.startTransport()],
      ['Nee, nog niet (N)', () => this.decline()],
    ]);
  }

  decline() {
    this.ui.closeMenu();
    this.cameraRig.lock();
    this.phase = 'rust';
  }

  /** "Ja!": de kelken gaan op, en de bliksem slaat in op de poort. */
  startTransport() {
    if (this.phase === 'reizen') return;
    const { ui, stats } = this;
    ui.closeMenu();
    ui.menuOpen = 'cutscene'; // het spel staat stil en je kunt niks doen
    this.hideBanner();
    this.setFilm(true, false);
    this.fadeEl.classList.add('sky');
    play('charge');
    this.phase = 'reizen';
    this.t = 0;
    this.struck = false;
    this.leaving = false;
    this.d.kelken -= SKY_LOOT.kelken;
    this.d.trip = { level: HOME, checkpoint: stats.data.checkpoint };
    stats.data.currentLevel = LEVEL_INDEX;
    stats.save();
  }

  updateTransport(dt) {
    const { player, effects, cameraRig } = this;
    this.t += dt;
    const t = this.t;
    const p = player.position;
    // Een wervelstorm van wolkjes en gele vonken om je heen
    for (let i = 0; i < 3; i++) {
      const a = -t * 7 + i * 2.1;
      const at = V(p.x + Math.cos(a) * 1.5, p.y + 0.2 + ((t * 1.5 + i * 0.6) % 2), p.z + Math.sin(a) * 1.5);
      if (i === 2) effects.burst(at, 0xffd23a, { count: 2, speed: 1.2, size: 0.1, life: 0.6, gravity: -0.2 });
      else effects.puff(at, CLOUD[i], { count: 2, speed: 1, size: 0.9, life: 0.7, up: 0.2 });
    }
    effects.update(dt); // het spel staat stil, dus de effecten laten we hier zelf bewegen
    effects.shake(0.1 + Math.min(1, t / 2.6) * 0.25);
    p.y = Math.min(1.2, t * 0.6);
    if (t >= 1.5 && !this.struck) {
      // KRAK: de bliksem slaat in op jou!
      this.struck = true;
      play('donder');
      play('zap');
      effects.shockwave(this.portal.pos, 0xffe066, 5);
      effects.burst(p.clone().setY(p.y + 1), 0xfff3b0, { count: 40, speed: 8, size: 0.14, life: 0.7, up: 3 });
      this.flash();
    }
    const angle = cameraRig.yaw - t * 0.8;
    this.aim(V(p.x + Math.sin(angle) * 5, p.y + 3 + t * 0.8, p.z + Math.cos(angle) * 5), V(p.x, p.y + 1, p.z));
    this.setFade(smooth((t - 1.6) / 0.9), 'De Donderpoort brengt je naar het Wolkenrijk...', 'Sky wacht op je.');
    if (t >= 2.6 && !this.leaving) {
      this.leaving = true;
      this.stats.save();
      location.href = `${location.pathname}?level=sky`;
    }
  }

  /** Een witte flits over je hele scherm (de bliksem!). */
  flash() {
    const el = document.createElement('div');
    el.id = 'omar-flash';
    document.body.append(el);
    setTimeout(() => el.remove(), 800);
  }

  /** Een Wolkenwacht is verslagen (via onDefeated in main.js): misschien een Wolkenkelk! */
  onEnemyDefeated(enemy) {
    if (enemy.typeKey !== 'wolkenwacht') return;
    this.respawns.push({ enemy, t: SKY_LOOT.respawn });
    if (Math.random() >= SKY_LOOT.kelkChance) return;
    this.d.kelken++;
    this.stats.save();
    const at = enemy.center;
    this.effects.burst(at, 0xffd23a, { count: 24, speed: 4, size: 0.12, life: 0.8, up: 3 });
    this.effects.puff(at, CLOUD[0], { count: 8, speed: 2, size: 1, life: 0.9, up: 0.6 });
    this.effects.floatText(at.clone().setY(at.y + 1), '+1 Wolkenkelk', '#ffe680', 0.55);
    play('shine');
    const enough = this.kelken >= SKY_LOOT.kelken;
    const quest = this.questState;
    const hint = quest === 'nieuw' ? '<br><small>Wat moet je daarmee? Vraag het aan <b>Opa Donder</b>, bij het begin van het hoogland.</small>'
      : enough ? '<br><small>Genoeg! Ga naar de <b>Donderpoort</b> bij Opa Donder.</small>' : '';
    this.ui.toast(`🏆 <b>Wolkenkelk!</b> Je hebt er nu <b>${this.kelken} / ${SKY_LOOT.kelken}</b>${hint}`, 4);
  }

  /** Markering voor de minimap: de Donderpoort. */
  mapMarkers() {
    return this.portal ? [{ x: this.portal.pos.x, z: this.portal.pos.z, icon: '⚡', color: '#ffd23a' }] : [];
  }

  updateLevel(dt) {
    const { cameraRig, state, ui, input, player } = this;
    const running = cameraRig.locked || state.forceRun;
    if (this.phase === 'reizen') {
      this.updateTransport(dt);
      return;
    }
    // De poort draait en knettert (extra fel als je genoeg kelken hebt)
    if (this.portal) {
      const P = this.portal;
      const ready = this.kelken >= SKY_LOOT.kelken && this.questState !== 'nieuw';
      P.swirl.rotation.z -= dt * (ready ? 2.5 : 0.8);
      P.sparkT -= dt;
      if (P.sparkT <= 0 && running && player.position.distanceTo(P.pos) < 40) {
        P.sparkT = ready ? 0.08 : 0.35;
        const a = Math.random() * Math.PI;
        this.effects.burst(P.pos.clone().add(V(Math.cos(a) * 2.1, 3.6 * Math.sin(a) + 0.2, 0)), 0xffe066, { count: 1, speed: 1, size: 0.08, life: 0.35, up: 0.3, gravity: 0 });
        if (ready) this.effects.puff(P.pos.clone().add(V((Math.random() - 0.5) * 2, 0.4, (Math.random() - 0.5) * 2)), CLOUD[0], { size: 0.8, life: 1.2, up: 1.2, opacity: 0.7 });
      }
    }
    // Verslagen Wolkenwachten komen na een tijdje terug (niet waar je bij staat)
    if (running && !ui.menuOpen) {
      for (let i = this.respawns.length - 1; i >= 0; i--) {
        const r = this.respawns[i];
        r.t -= dt;
        if (r.enemy.alive) this.respawns.splice(i, 1); // al terug (bijv. omdat je doodging)
        else if (r.t <= 0 && player.position.distanceTo(r.enemy.pointA) > 30) {
          r.enemy.reset();
          this.respawns.splice(i, 1);
        }
      }
    }
    // Net terug uit het Wolkenrijk: een berichtje (pas na de grote level-titel)
    if (this.pendingResult && running) {
      this.resultTime = (this.resultTime ?? 0) + dt;
      if (this.resultTime > 4.6) {
        ui.toast(RETURN_TEXTS[this.pendingResult] ?? RETURN_TEXTS.terug, 6);
        this.pendingResult = null;
      }
    }
    // Kiezen met het toetsenbord: J = ja, N = nee
    if (this.phase === 'kiezen') {
      if (ui.menuOpen !== 'level') this.phase = 'rust';
      else if (input.wasPressed('KeyJ')) this.startTransport();
      else if (input.wasPressed('KeyN')) this.decline();
    }
  }

  // ======================================================================
  // In het Wolkenrijk
  // ======================================================================

  setupCastle() {
    const { stats, state, sites, player, cameraRig } = this;
    this.fighter = this.bosses.find((b) => b.id === 'sky');
    this.fighter.effects = this.effects;
    this.fighter.prepare(stats);
    this.fighter.setThrone(this.spots.seat);
    this.wonThisVisit = false;
    state.introShown = true; // geen "level"-banner van main.js
    for (const c of sites.checkpoints) c.group.visible = false; // geen vlag in het Wolkenrijk
    player.respawnAt(this.spots.spawn);
    player.mesh.rotation.y = Math.PI;
    cameraRig.yaw = 0;
    cameraRig.snapTo(player.position);

    // De uitleg voor nieuwe spelers ("volg het pad...") uit main.js hoort hier niet
    const toast = this.ui.toast.bind(this.ui);
    this.ui.toast = (html, duration) => (html.includes('Volg het pad') ? undefined : toast(html, duration));

    // Het startscherm wordt het Wolkenrijk-scherm
    const hint = $('lock-hint');
    document.body.classList.add('omar-kasteel', 'sky-rijk');
    hint.querySelector('h1').textContent = 'HET WOLKENRIJK VAN SKY';
    for (const id of ['pick-title', 'char-select', 'level-title', 'level-select']) {
      const el = $(id);
      if (el) el.style.display = 'none';
    }
    this.infoEl = document.createElement('p');
    this.infoEl.id = 'omar-castle-info';
    hint.querySelector('h1').after(this.infoEl);
    const startBtn = $('start-btn');
    startBtn.textContent = '⚡ Het Wolkenrijk in!';
    this.leaveBtn = document.createElement('button');
    this.leaveBtn.id = 'sky-leave';
    this.leaveBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      const d = this.phase;
      this.returnHome(this.wonThisVisit ? 'gewonnen' : d === 'gevecht' ? 'gevlucht' : d === 'verloren' ? 'verloren' : 'terug');
    });
    startBtn.after(this.leaveBtn);
    this.updateLeaveButton();
    this.fadeEl.classList.add('sky');
    this.setFade(1, '', '');
    this.phase = 'wachten';
  }

  updateLeaveButton() {
    if (!this.leaveBtn) return;
    const info = this.wonThisVisit
      ? 'Jij hebt Sky verslagen! Kijk nog even rond, of ga terug.'
      : this.phase === 'gevecht'
        ? 'Pauze! Sky wacht... en de donder rommelt ongeduldig.'
        : this.phase === 'verloren'
          ? 'Sky lacht. Het klinkt als donder.'
          : 'De Donderpoort heeft je naar het Wolkenrijk gebracht. Sky wacht op zijn wolkentroon...';
    if (this.infoEl.textContent !== info) this.infoEl.textContent = info;
    const name = this.homeName;
    const text = this.wonThisVisit || this.phase === 'verloren' ? `↩ Terug naar ${name}` : this.phase === 'gevecht' ? `🏳 Opgeven — terug naar ${name}` : `🏳 Toch maar niet — terug naar ${name}`;
    if (this.leaveBtn.textContent !== text) this.leaveBtn.textContent = text;
  }

  /** Deel 1: de camera stijgt op uit de wolkenzee en vliegt naar de wolkentroon. */
  updateArrival() {
    const t = this.t;
    const short = this.kind !== 'lang';
    const end = short ? 2.5 : 6.4;
    if (!this.bannerShown && t >= (short ? 0.1 : 0.4)) {
      this.bannerShown = true;
      this.ui.banner('HET WOLKENRIJK VAN SKY', 'Hoog boven de storm...', 'sky', 3);
    }
    // Een bliksem slaat in vlak achter de troon
    const strikeAt = short ? 1.2 : 4.5;
    if (!this.flared && t >= strikeAt) {
      this.flared = true;
      this.spots.strike?.(V(0, 0, -45));
      play('donder');
      for (const c of this.spots.crystals ?? []) this.effects.burst(c, 0xffe066, { count: 12, speed: 3, size: 0.1, life: 0.6, up: 1, gravity: 0 });
    }
    if (!short && t < 3.2) this.shot(t / 3.2, V(-34, -4, 58), V(24, 16, 30), V(0, 2, 10), V(0, 3, -8));
    else {
      const k = short ? t / end : (t - 3.2) / 3.2;
      this.shot(k, V(8, 3.5, 10), V(1.8, 3.6, -17.5), V(0, 2, -20), V(0, 3.1, -26.6));
    }
    if (t >= end || this.skipPressed()) this.startTalk();
  }

  /** Deel 2: Sky op zijn wolkentroon. */
  startTalk() {
    const d = this.d;
    const key = this.kind === 'lang' ? 'lang' : this.kind === 'herkansing' ? 'herkansing' : d.wins > 0 ? 'kortGewonnen' : d.losses > 0 ? 'kortVerloren' : 'kort';
    this.talk = THRONE_LINES[key];
    this.phase = 'praten';
    this.t = 0;
    this.talkLine = -1;
    this.setFilm(true, false);
    this.hideBanner();
    this.ui.openDialog('Sky', this.talk.lines, () => this.startLeap());
  }

  updateTalk() {
    const { ui, fighter } = this;
    const index = ui.dialog?.index ?? this.talkLine;
    if (index !== this.talkLine) {
      this.talkLine = index;
      fighter.gesture = this.talk.gestures[index] ?? 'zitten';
      if (fighter.gesture === 'lachen') play('laugh');
      if (fighter.gesture === 'zwaard') play('zap');
    }
    this.shot(this.t / 8, V(0.75, 2.75, -21.9), V(0.45, 2.65, -22.6), V(0, 1.9, -26.6), V(0, 1.95, -26.6));
  }

  /** Deel 3: Sky wordt een wolk en slaat als bliksem de arena in. Dan trekt hij jou erbij. */
  startLeap() {
    this.ui.menuOpen = 'cutscene';
    this.setFilm(true, true);
    this.phase = 'sprong';
    this.t = 0;
    this.landed = false;
    this.fighter.gesture = 'zitten';
    this.fighter.playIntro(this.spots.landing);
    play('whoosh');
  }

  updateLeap() {
    const { fighter, effects, player } = this;
    const t = this.t;
    const land = this.spots.landing;
    if (t < 0.45) this.shot(t / 0.45, V(0.45, 2.65, -22.6), V(8.5, 4.5, -7), V(0, 1.95, -26.6), fighter.position.clone().setY(fighter.position.y + 1.2));
    else if (t < 1.45) this.aim(V(8.5, 4.5, -7), V(0, 2, -16).lerp(land.clone().setY(1), smooth((t - 0.45) / 1)));
    if (t >= 1.45 && !this.landed) {
      // Sky is ingeslagen (zie introStrike in skyFighter.js), en trekt jou met een windstoot naar zich toe
      this.landed = true;
      effects.floatText(land.clone().setY(2.8), 'KOM HIER!', '#ffe680', 0.7);
      this.flash();
      play('whoosh');
      const from = land.clone().setY(1.2);
      const to = player.position.clone().setY(1);
      for (let i = 1; i <= 8; i++) effects.puff(from.clone().lerp(to, i / 9), CLOUD[i % 3], { count: 2, speed: 1.2, size: 1, life: 0.7, up: 0.3 });
      if (!fighter.awake) fighter.wake();
    }
    if (t >= 1.45) {
      const k = smooth((t - 1.45) / 0.55);
      const spawn = this.spots.spawn;
      const spot = this.spots.fightSpot;
      player.position.lerpVectors(spawn, spot, k);
      player.position.y = 3 * Math.sin(Math.PI * k);
      player.mesh.rotation.y = Math.PI;
      if (k < 1) effects.puff(player.position.clone().setY(player.position.y + 0.9), CLOUD[0], { size: 0.9, life: 0.5 });
      this.shot((t - 1.45) / 0.55, V(0, 6, 31), V(0, 3.2, 12), V(0, 1.2, -6), V(0, 1.2, -6));
    }
    if (t >= 2.4) this.startFight();
    else if (this.skipPressed()) {
      fighter.finishIntro();
      if (!fighter.awake) fighter.wake();
      this.startFight();
    }
  }

  /** Deel 4: vechten! */
  startFight() {
    const { player, fighter, state, ui, cameraRig } = this;
    player.position.copy(this.spots.fightSpot);
    player.velocity.set(0, 0, 0);
    player.mesh.rotation.y = Math.PI;
    fighter.finishIntro();
    if (!fighter.awake) fighter.wake();
    state.activeBoss = fighter;
    state.lockTarget = null;
    ui.menuOpen = null;
    this.setFilm(false);
    this.fade = null;
    this.setFade(0);
    cameraRig.yaw = 0;
    cameraRig.pitch = 0.35;
    cameraRig.snapTo(player.position);
    ui.banner('SKY', 'Heer van de Storm — de nieuwe baas van het spel!', 'sky', 3.5);
    play('gong');
    play('donder');
    this.tipShown = this.d.wins + this.d.losses > 0;
    this.phase = 'gevecht';
    this.t = 0;
    this.phase2Shown = false;
  }

  /** Welke muziek hoort er in het Wolkenrijk? (main.js speelt hem af, zie music.js) */
  musicWanted() {
    if (this.phase === 'gevecht') return ['sky', this.fighter.phase2 ? 1 : 0];
    if (this.phase === 'gewonnen') return ['feest', 0];
    if (this.phase === 'verloren') return [null, 0];
    return ['wolken', 0]; // terwijl hij op zijn troon zit: zweverig, met verre donder
  }

  /** Sky verslagen (via onBossDefeated in main.js). */
  onWin(boss) {
    const { state, stats, ui, effects } = this;
    const d = this.d;
    const first = d.wins === 0;
    state.activeBoss = null;
    state.lockTarget = null;
    play('win');
    effects.shake(0.6);
    ui.banner('JIJ HEBT SKY VERSLAGEN!', first ? 'De storm is gaan liggen!' : 'Alweer! Jij bent sterker dan de storm!', 'sky', 4.2);
    this.startParty();
    this.powersBefore = stats.unlockedPowers();
    this.levelBefore = stats.level;
    this.newPerks = this.giveKills(first ? 25 : 6, false) ?? [];
    this.giveRunes(SKY_LOOT.runes);
    this.pickups.coinBurst(boss.center, 100);
    // De grote vraag: laat hij NightWalker vallen?
    const item = { kind: 'weapon', key: 'nightwalker' };
    this.dropped = !stats.hasItem(item) && Math.random() < SKY_LOOT.nightwalker;
    if (this.dropped) {
      stats.addItem(item);
      d.drops++;
    }
    // De quest van Opa Donder is klaar
    const q = stats.data.quests[QUEST];
    if (q?.state === 'actief') {
      q.count = 1;
      q.state = 'klaar';
    }
    d.wins++;
    this.wonThisVisit = true;
    this.firstWin = first;
    stats.save();
    this.phase = 'gewonnen';
    this.t = 0;
    this.fireworkTimer = 0;
    this.winTalked = false;
  }

  updateWin(dt, live) {
    const { effects, ui } = this;
    this.updateParty(live ? dt : 0);
    // Vuurwerk... van bliksem!
    if (this.t < 6) {
      this.fireworkTimer -= dt;
      if (this.fireworkTimer <= 0) {
        this.fireworkTimer = 0.16;
        const a = Math.random() * Math.PI * 2;
        const r = Math.random() * 12;
        const colors = [0xffd23a, 0xfff3b0, 0x9be7ff, 0xffffff];
        effects.burst(V(Math.sin(a) * r, 7 + Math.random() * 5, Math.cos(a) * r), colors[Math.floor(Math.random() * colors.length)], { count: 70, speed: 12, size: 0.32, life: 1.4, up: 1, gravity: 0.35 });
        if (Math.random() < 0.4) play('coin');
      }
    }
    if (this.dropped && !this.dropShown && this.t >= 1.2) {
      // NightWalker valt uit de lucht, met een enorme bliksem
      this.dropShown = true;
      this.spots.strike?.(this.player.position.clone());
      play('donder');
      play('zap');
      this.flash();
      ui.banner('NIGHTWALKER!', 'Sky liet zijn bliksemzwaard vallen! Pak het met I', 'sky', 4.5);
    }
    if (this.t >= 4.8 && !this.winTalked && !ui.menuOpen) {
      this.winTalked = true;
      const lines = this.firstWin
        ? ['Wat... de storm is... gaan liggen?', 'Jij hebt mij verslagen. <b>Mij</b>. De Heer van de Storm!', 'Oké. Ik geef het toe. Jij bent echt goed.']
        : ['Alweer?! Hoe dóé je dat?', 'Ik moet echt nog meer oefenen...'];
      lines.push(this.dropped
        ? 'En... mijn <b>NightWalker</b>. Hij ligt bij jou. Hij heeft jou gekozen. Zorg goed voor hem!'
        : `Hier: <b>${SKY_LOOT.runes} munten</b>. Maar NightWalker? Die hou ik lekker zelf. Hehe. Misschien de volgende keer!`);
      ui.openDialog('Sky', lines, () => {
        this.announceNewPowers(this.powersBefore, 0, this.newPerks);
        this.winMenu();
      });
    }
  }

  winMenu() {
    const { stats, ui, cameraRig } = this;
    document.exitPointerLock?.();
    this.dropShown = false;
    const html = `Jij hebt <b>Sky</b> verslagen, de Heer van de Storm!
      <br>Beloning: <b>+${SKY_LOOT.runes} munten</b>${this.dropped ? ' én <b>NightWalker</b>, het bliksemzwaard van Sky! Pak het met <b>I</b>' : ''}
      ${stats.level > this.levelBefore ? `<br>⬆ Je bent nu <b>level ${stats.level}</b>!` : ''}
      ${this.questState === 'klaar' ? '<br>Ga terug naar <b>Opa Donder</b> voor je quest-beloning!' : ''}
      <br><small>Overwinningen op Sky: ${this.d.wins} · Wolkenkelken: ${this.kelken}</small>`;
    ui.openLevelComplete('SKY VERSLAGEN!', html, [
      [`↩ Terug naar ${this.homeName}`, () => this.returnHome('gewonnen')],
      ['Nog even rondkijken in het Wolkenrijk', () => {
        ui.closeMenu();
        cameraRig.lock();
        ui.toast('Wil je terug? Druk op <b>Esc</b> en kies <b>Terug</b>.', 5);
      }],
    ]);
  }

  /** De speler is "dood" in het Wolkenrijk (via die() in main.js). Geeft true terug: dan doet main.js niks. */
  onDeath() {
    if (!this.inArena) return false;
    const { state, stats, ui } = this;
    state.deathTimer = Infinity;
    if (this.phase === 'verloren') return true;
    play('lose');
    this.d.losses++;
    stats.save();
    ui.banner('SKY WINT!', '"De storm wint altijd. Hehe."', 'death', 4);
    this.phase = 'verloren';
    this.t = 0;
    this.loseTalked = false;
    this.orbitStart = null;
    return true;
  }

  updateLose() {
    const { fighter, ui } = this;
    if (this.t >= 0.8) {
      const o = fighter.position;
      if (this.orbitStart === null) this.orbitStart = Math.atan2(this.player.position.x - o.x, this.player.position.z - o.z);
      const a = this.orbitStart + (this.t - 0.8) * 0.5;
      this.aim(V(o.x + Math.sin(a) * 4.5, 2.2, o.z + Math.cos(a) * 4.5), V(o.x, 1.6, o.z));
    }
    if (this.t >= 3.6 && !this.loseTalked && !ui.menuOpen) {
      this.loseTalked = true;
      ui.openDialog('Sky', ['Hahaha! Weggeblazen!', 'Kom terug als je de storm aankunt.'], () => this.loseMenu());
    }
  }

  loseMenu() {
    const { fighter, ui } = this;
    document.exitPointerLock?.();
    const pct = Math.max(1, Math.round((fighter.hp / fighter.info.hp) * 100));
    const enough = this.kelken >= SKY_LOOT.kelken;
    const html = `Sky was te sterk... deze keer.<br>Sky had nog <b>${pct}%</b> leven over.
      ${pct < 40 ? '<br><b>Je was al heel dichtbij!</b>' : ''}
      <br><small>Je bent niks kwijtgeraakt. Nog een keer kost <b>${SKY_LOOT.kelken} Wolkenkelken</b> (je hebt er ${this.kelken}).</small>`;
    const buttons = [];
    if (enough) buttons.push([`🔁 Nog een keer! (−${SKY_LOOT.kelken} Wolkenkelken)`, () => this.rematch()]);
    buttons.push([`↩ Terug naar ${this.homeName}`, () => this.returnHome('verloren')]);
    ui.openLevelComplete('VERLOREN...', html, buttons);
  }

  /** Meteen nog een keer (dat kost weer kelken). */
  rematch() {
    if (this.kelken < SKY_LOOT.kelken) return;
    this.d.kelken -= SKY_LOOT.kelken;
    this.stats.save();
    super.rematch();
  }
}
