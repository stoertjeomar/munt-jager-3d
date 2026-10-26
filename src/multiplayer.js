import * as THREE from 'three';
import { Player } from './player.js';
import { Dragon } from './dragon.js';
import { play } from './audio.js';
import { WEAPONS } from './weapons.js';
import { HELMETS } from './gear.js';
import { FriendLink, PROTO, TEST_PARAMS } from './netlink.js';

// ======================================================================
// Samen spelen via internet (computers praten direct met elkaar, "WebRTC")
// ======================================================================
// Eén speler maakt een kamer en krijgt een code (bijv. MUNT-7K3P). De vriend typt die code in
// (of opent de link die de kamermaker stuurt), en dan:
//   - zie je elkaar in de wereld lopen, springen, slaan en op de draak vliegen
//   - kun je in de Arena een DUEL doen: wie het eerst geen leven meer heeft, verliest
// Elke speler heeft zijn eigen vijanden, kisten en munten (die worden niet gedeeld): je speelt samen in dezelfde
// wereld, maar ieder in zijn eigen avontuur.
// Hoe jullie elkaar vinden (drie manieren tegelijk, met een reserve) staat in netlink.js.

const SEND_EVERY = 1 / 15; // zo vaak sturen we waar je bent (15 keer per seconde)
const LETTERS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // geen 0/O en 1/I (die lijken op elkaar)
const TRAVEL = 30; // de meedoener reist meteen naar de kamermaker als die verder weg is dan dit (meter)
export const DUEL = { prize: 150, countdown: 3 };

/** Wat er mis kan gaan, en wat je dan kunt doen (staat in het menu). */
export const PROBLEMS = {
  code: { text: 'Typ de code van je vriend: 4 letters en cijfers (bijvoorbeeld MUNT-7K3P).' },
  niemand: {
    text: 'Je vriend is niet gevonden.',
    tips: [
      'Klopt de code? (Er zit nooit een O, 0, I of 1 in.)',
      'Staat het spel van je vriend nog open, met de code in beeld?',
      'Laad allebei de pagina opnieuw (Ctrl+F5) en maak een nieuwe kamer.',
    ],
  },
  netwerk: {
    text: 'Jullie vonden elkaar wel, maar het netwerk liet de verbinding niet toe.',
    tips: [
      'Probeer het nog een keer: soms lukt het de tweede keer wel.',
      'Op school of op het werk is dit vaak geblokkeerd: probeer het thuis.',
      'Of gebruik de hotspot van een telefoon.',
    ],
  },
  offline: {
    text: 'Geen enkele server is bereikbaar.',
    tips: ['Heb je internet?', 'Op school of op het werk is dit vaak geblokkeerd: probeer het thuis of met een hotspot.'],
  },
  vol: { text: 'In die kamer speelt al iemand mee.', tips: ['Vraag je vriend om een nieuwe kamer te maken.'] },
  browser: { text: 'Deze browser kan niet samen spelen.', tips: ['Probeer Chrome, Edge of Firefox.'] },
};

/** Een naam van je vriend die veilig in beeld kan (geen rare tekens, niet te lang). */
function cleanName(name) {
  return String(name ?? '').replace(/[<>&"'`]/g, '').trim().slice(0, 14) || 'Vriend';
}

/** Nep-"stats" voor het poppetje van je vriend (Player leest alleen deze dingen). */
class RemoteStats {
  constructor(character) {
    this.data = { character, weapon: 'shortsword', helmet: 'geen', level: 1 };
  }
  get level() { return this.data.level; }
  get maxHealth() { return 100; }
  get maxStamina() { return 100; }
  get flasksMax() { return 3; }
  get damageMultiplier() { return 1; }
  get speedMultiplier() { return 1; }
  get defenseBonus() { return 0; }
  get healBonus() { return 0; }
  hasPower() { return true; }
}

/** Naambordje boven het hoofd van je vriend. */
function makeNameTag(text) {
  const canvas = document.createElement('canvas');
  canvas.width = 256;
  canvas.height = 64;
  const ctx = canvas.getContext('2d');
  ctx.font = 'bold 34px Trebuchet MS, sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillStyle = 'rgba(10, 20, 40, 0.65)';
  ctx.beginPath();
  ctx.roundRect(8, 8, 240, 48, 24);
  ctx.fill();
  ctx.lineWidth = 6;
  ctx.strokeStyle = '#0a1a30';
  ctx.strokeText(text, 128, 33);
  ctx.fillStyle = '#9be7ff';
  ctx.fillText(text, 128, 33);
  const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: new THREE.CanvasTexture(canvas), depthTest: false, transparent: true }));
  sprite.scale.set(1.6, 0.4, 1);
  sprite.renderOrder = 10;
  return sprite;
}

/** Het poppetje van je vriend: een echte Player, maar bestuurd door wat er via internet binnenkomt. */
class RemotePlayer {
  constructor(scene, hello) {
    this.scene = scene;
    this.name = cleanName(hello.name);
    this.player = new Player(scene, new RemoteStats(String(hello.character ?? 'soldaat')));
    this.tag = makeNameTag(`🌐 ${this.name}`);
    scene.add(this.tag);
    this.dragon = null;
    this.state = null;
    this.lastSwing = null;
    this.target = new THREE.Vector3();
    this.health = 100;
    this.maxHealth = 100;
    this.seat = new THREE.Vector3();
  }

  get position() {
    return this.player.position;
  }

  get center() {
    return this.player.position.clone().setY(this.player.position.y + 0.9);
  }

  /** Nieuwe toestand van je vriend (15 keer per seconde). */
  receive(s) {
    if (!Array.isArray(s.p) || s.p.length !== 3 || !s.p.every(Number.isFinite)) return; // (kapot bericht)
    const first = !this.state;
    this.state = s;
    this.target.fromArray(s.p);
    if (first) this.player.position.copy(this.target);
    this.health = s.hp;
    this.maxHealth = s.mhp;
  }

  update(dt) {
    const s = this.state;
    const p = this.player;
    if (!s) {
      p.mesh.visible = false;
      this.tag.visible = false;
      return;
    }
    p.mesh.visible = !s.hide;
    // Soepel naar de plek waar hij nu is (anders zie je hem schokken)
    const far = p.position.distanceTo(this.target) > 8;
    if (far) p.position.copy(this.target);
    else p.position.lerp(this.target, 1 - Math.exp(-14 * dt));
    // (een wapen of helm die wij niet kennen, uit een andere versie van het spel? Dan houden we de oude)
    if (s.w !== p.sword.weaponKey && WEAPONS[s.w]) p.sword.setWeapon(s.w);
    if (s.h !== p.helmetKey && HELMETS[s.h]) p.setHelmet(s.h);
    p.fireTimer = s.fire ? 1 : 0;
    // Op de draak?
    if (s.dr) {
      if (!this.dragon) this.dragon = new Dragon(this.scene, s.dr.skin);
      const d = this.dragon;
      d.mesh.visible = true;
      d.position.lerp(new THREE.Vector3().fromArray(s.dr.p), far ? 1 : 1 - Math.exp(-14 * dt));
      d.yaw = s.dr.yaw;
      d.mesh.rotation.set(0, d.yaw, 0);
      d.parts.body.rotation.set(s.dr.pitch, 0, s.dr.roll);
      d.animate(dt, s.dr.fly, s.dr.speed);
      p.ride(dt, d.saddlePosition(this.seat), d.yaw);
    } else {
      if (this.dragon) this.dragon.mesh.visible = false;
      let diff = s.r - p.mesh.rotation.y;
      p.mesh.rotation.y += Math.atan2(Math.sin(diff), Math.cos(diff)) * Math.min(1, 16 * dt);
      p.moving = s.m;
      p.sprinting = s.sp;
      p.onGround = s.g;
      p.velocity.y = s.vy;
      // Een nieuwe slag? Dan slaat zijn poppetje ook
      if (s.sw !== this.lastSwing) {
        if (this.lastSwing !== null) {
          p.sword.timer = 0;
          p.sword.swing();
          p.combo = s.cb;
        }
        this.lastSwing = s.sw;
      }
      p.sword.update(dt);
      p.rollTimer = s.roll;
      p.dashTimer = s.dash;
      p.spinTimer = s.spin;
      p.drinkTimer = s.drink;
      p.flipTimer = s.flip;
      p.slamming = s.slam;
      p.body.rotation.set(s.bx, s.by, 0);
      p.updateAnimation(dt);
    }
    this.tag.visible = !s.hide;
    this.tag.position.copy(p.position).setY(p.position.y + 2.25);
  }

  remove() {
    this.scene.remove(this.player.mesh);
    this.scene.remove(this.tag);
    if (this.dragon) this.scene.remove(this.dragon.mesh);
  }
}

export class Multiplayer {
  /**
   * @param {object} game  { scene, player, stats, ui, effects, dragon, arena, onDuelStart(), onDuelEnd(won), goToFriend(auto) }
   */
  constructor(game) {
    this.game = game;
    this.link = null; // de verbinding met je vriend (netlink.js)
    this.remote = null;
    this.code = null;
    this.isHost = false; // jij hebt de kamer gemaakt
    this.status = 'uit'; // uit | wachten | verbinden | verbonden | fout
    this.error = ''; // wat er mis ging (een van PROBLEMS)
    this.sendTimer = 0;
    this.travelled = false;
    this.duel = null; // { phase: 'aftellen' | 'vechten' | 'klaar', t }
    this.hitIds = new Set();
  }

  get connected() {
    return this.status === 'verbonden' && !!this.link?.open;
  }

  /** Je naam (die zie je vriend boven je hoofd). */
  get myName() {
    return this.game.stats.data.name || 'Speler';
  }

  /** De link die je naar je vriend kunt sturen: wie hem opent, doet meteen mee. */
  get shareLink() {
    const here = new URLSearchParams(location.search);
    const query = new URLSearchParams();
    for (const key of TEST_PARAMS) if (here.has(key)) query.set(key, here.get(key));
    query.set('kamer', this.code ?? '');
    return `${location.origin}${location.pathname}?${query}`;
  }

  makeCode() {
    let code = '';
    for (let i = 0; i < 4; i++) code += LETTERS[Math.floor(Math.random() * LETTERS.length)];
    return code;
  }

  /** Een kamer maken: je krijgt een code die je aan je vriend geeft. */
  host() {
    this.leave();
    this.isHost = true;
    this.code = this.makeCode();
    this.status = 'wachten';
    this.connect();
  }

  /** Meedoen met de code van je vriend. */
  join(code) {
    code = String(code ?? '').toUpperCase().replace(/[^A-Z0-9]/g, '').replace(/^MUNT/, '');
    if (code.length !== 4) {
      this.leave();
      this.problem('code');
      return;
    }
    this.leave();
    this.isHost = false;
    this.code = code;
    this.status = 'verbinden';
    this.connect();
  }

  /** Op zoek naar je vriend (via alle manieren tegelijk, zie netlink.js). */
  connect() {
    this.error = '';
    this.link = new FriendLink(this.code, this.isHost, {
      open: () => {
        this.status = 'verbonden';
        this.travelled = false;
        this.send({ t: 'hallo', name: this.myName, character: this.game.player.characterId, v: PROTO });
        this.changed();
      },
      message: (msg) => this.receive(msg),
      close: () => this.lost(),
      fail: (type) => {
        this.link = null;
        this.leave();
        this.problem(type);
      },
      change: () => this.changed(),
      codeTaken: () => this.host(), // (heel zeldzaam: iemand anders heeft dezelfde code)
    });
    this.changed();
    this.link.start();
  }

  /** Iets mislukt (verkeerde code, niemand gevonden...). */
  problem(type) {
    this.status = 'fout';
    this.error = type;
    this.changed();
    // Zit je niet in het menu (je speelt al)? Dan een berichtje in beeld
    if (this.game.ui.menuOpen !== 'online') this.game.ui.toast(`🌐 ${PROBLEMS[type]?.text ?? 'Samen spelen lukte niet.'} <small>(O = samen spelen)</small>`, 6);
  }

  /** De verbinding met je vriend is weg. */
  lost() {
    const name = this.remote?.name ?? 'Je vriend';
    if (this.duel) this.endDuel(null);
    this.remote?.remove();
    this.remote = null;
    if (this.isHost && this.link) {
      // Je kamer blijft open: met dezelfde code kan je vriend opnieuw meedoen
      this.link.reset();
      this.status = 'wachten';
      this.changed();
      this.game.ui.toast(`🌐 <b>${name}</b> is weg. Je kamer <b>MUNT-${this.code}</b> blijft open: met dezelfde code kan je vriend weer meedoen.`, 5);
    } else {
      this.leave();
      this.game.ui.toast(`🌐 <b>${name}</b> is weg. De verbinding is verbroken.`, 4);
    }
  }

  /** Stoppen met samen spelen. */
  leave() {
    if (this.duel) this.endDuel(null);
    this.link?.close();
    this.link = null;
    this.remote?.remove();
    this.remote = null;
    this.duel = null;
    this.status = 'uit';
    this.code = null;
    this.changed();
  }

  /** Het menu opnieuw tekenen als het open is. */
  changed() {
    this.onChange?.();
  }

  send(msg) {
    if (this.link?.open) this.link.send(msg);
  }

  receive(msg) {
    if (!msg || typeof msg !== 'object') return;
    const { ui, player, effects } = this.game;
    if (msg.t === 'hallo') {
      this.remote?.remove();
      this.remote = new RemotePlayer(this.game.scene, msg);
      play('flag');
      ui.toast(`🌐 <b>${this.remote.name}</b> speelt nu met je mee!`, 4);
      // Een andere versie van het spel? Dan werkt misschien niet alles: allebei de nieuwste laden
      const v = Number(msg.v) || 1;
      if (v !== PROTO) {
        const why = v < PROTO ? `<b>${this.remote.name}</b> heeft een oudere versie van het spel` : 'Jij hebt een oudere versie van het spel';
        setTimeout(() => ui.toast(`⚠ ${why}. Laad allebei de pagina opnieuw (<b>Ctrl+F5</b>) voor de nieuwste versie.`, 8), 4000);
      }
      this.changed();
    } else if (msg.t === 'toestand') {
      // (Hebben we zijn "hallo" gemist? Dan maken we zijn poppetje nu)
      if (!this.remote) this.receive({ t: 'hallo', name: msg.n, character: msg.c, v: PROTO });
      this.remote?.receive(msg);
      // Net meegedaan? Dan reis je meteen naar de kamermaker toe (anders moet je elkaar eerst zoeken)
      if (!this.isHost && !this.travelled && this.remote?.state) {
        this.travelled = true;
        if (this.remote.position.distanceTo(player.position) > TRAVEL) this.game.goToFriend?.(true);
      }
    } else if (msg.t === 'klap') {
      // Je vriend raakte jou (alleen in een duel)
      if (this.duel?.phase !== 'vechten' || !Array.isArray(msg.from)) return;
      const from = new THREE.Vector3().fromArray(msg.from);
      const taken = player.hurt(from, Math.min(Number(msg.damage) || 0, 500));
      if (taken) {
        play('hurt');
        effects.shake(0.2);
        effects.floatText(player.position.clone().setY(player.position.y + 2), `-${taken}`, '#ff6a6a', 0.45);
      }
    } else if (msg.t === 'duel') {
      this.startDuel(false);
    } else if (msg.t === 'verloren') {
      // Je vriend ging neer: jij wint!
      if (this.duel) this.endDuel(true);
    }
  }

  /** Waar ben je en wat doe je? (15 keer per seconde naar je vriend) */
  myState() {
    const p = this.game.player;
    const d = this.game.dragon;
    const r2 = (v) => Math.round(v * 100) / 100;
    const s = {
      t: 'toestand',
      n: this.myName, c: p.characterId,
      p: p.position.toArray().map(r2),
      r: r2(p.mesh.rotation.y),
      m: p.moving, sp: p.sprinting, g: p.onGround, vy: r2(p.velocity.y),
      sw: p.sword.swingId, cb: p.combo ?? 0, w: p.sword.weaponKey, h: p.helmetKey, fire: p.fireTimer > 0,
      roll: r2(p.rollTimer), dash: r2(p.dashTimer), spin: r2(p.spinTimer), drink: r2(p.drinkTimer), flip: r2(p.flipTimer ?? 0), slam: p.slamming,
      bx: r2(p.body.rotation.x), by: r2(p.body.rotation.y),
      hp: Math.ceil(p.health), mhp: p.maxHealth,
      hide: !p.mesh.visible && !d?.riding,
    };
    if (d?.riding) {
      const flat = Math.hypot(d.velocity.x, d.velocity.z);
      s.dr = { p: d.position.toArray().map(r2), yaw: r2(d.yaw), pitch: r2(d.pitch), roll: r2(d.roll), fly: d.position.y > 0.05, speed: r2(flat), skin: this.game.stats.data.dragonSkin ?? 'vuur' };
    }
    return s;
  }

  // ---------------- Duel ----------------

  /** Een duel beginnen (in de Arena). byMe = jij drukte op de knop (dan krijgt je vriend een berichtje). */
  startDuel(byMe = true) {
    if (!this.connected || !this.remote) {
      this.game.ui.toast('🌐 Er speelt nog niemand met je mee.', 3);
      return false;
    }
    if (this.duel) return false;
    if (byMe) this.send({ t: 'duel' });
    this.duel = { phase: 'aftellen', t: DUEL.countdown, side: byMe ? 1 : -1 };
    this.hitIds.clear();
    this.game.onDuelStart?.(this.duel.side);
    play('gong');
    return true;
  }

  /** Klaar met het duel. won = true (jij wint), false (jij verliest), null (gestopt). */
  endDuel(won) {
    if (!this.duel) return;
    this.duel = null;
    this.game.onDuelEnd?.(won, this.remote?.name ?? 'je vriend');
  }

  /** Jij bent in het duel verslagen (main.js roept dit aan in plaats van gewoon doodgaan). */
  iLost() {
    this.send({ t: 'verloren' });
    this.endDuel(false);
  }

  /** Raak je je vriend met je zwaard? (alleen tijdens het duel) */
  checkHit(player, damage, kind = 'slag', id = player.sword.swingId) {
    const r = this.remote;
    if (this.duel?.phase !== 'vechten' || !r) return null;
    const key = `${kind}-${id}`;
    if (this.hitIds.has(key)) return null;
    const to = r.position.clone().sub(player.position);
    if (Math.abs(to.y) > 1.8) return null;
    to.y = 0;
    const dist = to.length();
    const reach = kind === 'slag' ? player.sword.range + 0.45 : kind === 'wervel' ? 3.6 : 5.4;
    if (dist > reach) return null;
    if (kind === 'slag' && dist > 1.6 && to.normalize().dot(player.facing) < 0) return null;
    this.hitIds.add(key);
    this.send({ t: 'klap', damage, from: player.position.toArray() });
    return r;
  }

  /** Elke frame. */
  update(dt) {
    if (this.duel) {
      const d = this.duel;
      d.t -= dt;
      if (d.phase === 'aftellen') {
        const n = Math.ceil(d.t);
        if (n !== d.shown && n > 0) {
          d.shown = n;
          this.game.ui.banner(`${n}`, `Duel tegen ${this.remote?.name ?? 'je vriend'}!`, 'gold', 0.9);
          play('click');
        }
        if (d.t <= 0) {
          d.phase = 'vechten';
          this.game.ui.banner('VECHTEN!', 'Wie het eerst geen leven meer heeft, verliest', 'death', 1.5);
          play('gong');
        }
      }
    }
    if (!this.connected) return;
    this.sendTimer -= dt;
    if (this.sendTimer <= 0) {
      this.sendTimer = SEND_EVERY;
      this.send(this.myState());
    }
    this.remote?.update(dt);
  }

  /** Voor de minimap: waar je vriend is. */
  mapMarkers() {
    if (!this.remote?.state) return [];
    return [{ x: this.remote.position.x, z: this.remote.position.z, icon: '●', color: '#5ad8ff' }];
  }

  /** De gezondheidsbalk bovenin tijdens het duel (net als bij een boss). */
  get hud() {
    if (!this.duel || !this.remote) return null;
    return { name: `🌐 ${this.remote.name}`, hp: this.remote.health, maxHp: this.remote.maxHealth };
  }
}
