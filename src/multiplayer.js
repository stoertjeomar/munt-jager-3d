import * as THREE from 'three';
import { Player } from './player.js';
import { Dragon } from './dragon.js';
import { play } from './audio.js';

// ======================================================================
// Samen spelen via internet (met PeerJS: computers praten direct met elkaar, "WebRTC")
// ======================================================================
// Eén speler maakt een kamer en krijgt een code (bijv. MUNT-7K3P). De vriend typt die code in, en dan:
//   - zie je elkaar in de wereld lopen, springen, slaan en op de draak vliegen
//   - kun je in de Arena een DUEL doen: wie het eerst geen leven meer heeft, verliest
// Elke speler heeft zijn eigen vijanden, kisten en munten (die worden niet gedeeld): je speelt samen in dezelfde
// wereld, maar ieder in zijn eigen avontuur.
// De verbinding loopt via de gratis PeerJS-server (0.peerjs.com) om elkaar te vinden; daarna gaat alles direct.
// Om te testen met een eigen server: index.html?peer=localhost:9000

const PREFIX = 'munt-jager-3d-';
const SEND_EVERY = 1 / 15; // zo vaak sturen we waar je bent (15 keer per seconde)
const LETTERS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // geen 0/O en 1/I (die lijken op elkaar)
export const DUEL = { prize: 150, countdown: 3 };

/** PeerJS laden (alleen als je samen wilt spelen). */
let peerLib = null;
function loadPeerJS() {
  if (window.peerjs) return Promise.resolve(window.peerjs);
  peerLib ??= new Promise((resolve, reject) => {
    const s = document.createElement('script');
    s.src = 'lib/peerjs.min.js';
    s.onload = () => (window.peerjs ? resolve(window.peerjs) : reject(new Error('PeerJS niet gevonden')));
    s.onerror = () => reject(new Error('Kon lib/peerjs.min.js niet laden'));
    document.head.appendChild(s);
  });
  return peerLib;
}

/** Instellingen voor de PeerJS-server (?peer=host:poort om een eigen server te gebruiken). */
function serverOptions() {
  const custom = new URLSearchParams(location.search).get('peer');
  if (!custom) return { debug: 0 };
  const [host, port] = custom.split(':');
  return { host, port: Number(port) || 9000, path: '/', secure: false, debug: 0 };
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
    this.name = hello.name ?? 'Vriend';
    this.player = new Player(scene, new RemoteStats(hello.character ?? 'soldaat'));
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
    if (s.w !== p.sword.weaponKey) p.sword.setWeapon(s.w);
    if (s.h !== p.helmetKey) p.setHelmet(s.h);
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
   * @param {object} game  { scene, player, stats, ui, effects, dragon, arena, onDuelStart(), onDuelEnd(won) }
   */
  constructor(game) {
    this.game = game;
    this.peer = null;
    this.conn = null;
    this.remote = null;
    this.code = null;
    this.status = 'uit'; // uit | laden | wachten | verbinden | verbonden | fout
    this.error = '';
    this.sendTimer = 0;
    this.duel = null; // { phase: 'aftellen' | 'vechten' | 'klaar', t }
    this.hitIds = new Set();
  }

  get connected() {
    return this.status === 'verbonden' && !!this.conn?.open;
  }

  /** Je naam (die zie je vriend boven je hoofd). */
  get myName() {
    return this.game.stats.data.name || 'Speler';
  }

  makeCode() {
    let code = '';
    for (let i = 0; i < 4; i++) code += LETTERS[Math.floor(Math.random() * LETTERS.length)];
    return code;
  }

  /** Een kamer maken: je krijgt een code die je aan je vriend geeft. */
  async host() {
    this.leave();
    this.status = 'laden';
    this.changed();
    try {
      const { Peer } = await loadPeerJS();
      this.code = this.makeCode();
      this.peer = new Peer(PREFIX + this.code, serverOptions());
      this.peer.on('open', () => {
        this.status = 'wachten';
        this.changed();
      });
      this.peer.on('connection', (conn) => {
        if (this.conn) {
          conn.on('open', () => conn.close()); // er is al iemand: kamer vol
          return;
        }
        this.useConnection(conn);
      });
      this.peer.on('error', (e) => this.fail(e));
    } catch (e) {
      this.fail(e);
    }
  }

  /** Meedoen met de code van je vriend. */
  async join(code) {
    code = String(code).toUpperCase().replace(/[^A-Z0-9]/g, '').replace(/^MUNT/, '');
    if (code.length < 4) {
      this.fail({ type: 'code' });
      return;
    }
    this.leave();
    this.status = 'laden';
    this.changed();
    try {
      const { Peer } = await loadPeerJS();
      this.code = code;
      this.peer = new Peer(undefined, serverOptions());
      this.peer.on('open', () => {
        this.status = 'verbinden';
        this.changed();
        this.useConnection(this.peer.connect(PREFIX + code, { serialization: 'json', reliable: true }));
      });
      this.peer.on('error', (e) => this.fail(e));
    } catch (e) {
      this.fail(e);
    }
  }

  useConnection(conn) {
    this.conn = conn;
    conn.on('open', () => {
      this.status = 'verbonden';
      this.send({ t: 'hallo', name: this.myName, character: this.game.player.characterId });
      this.changed();
    });
    conn.on('data', (msg) => this.receive(msg));
    conn.on('close', () => this.lost());
    conn.on('error', () => this.lost());
  }

  /** Iets mislukt (geen internet, verkeerde code...). */
  fail(e) {
    const why = {
      'peer-unavailable': 'Die kamer bestaat niet (meer). Klopt de code?',
      network: 'Geen verbinding met de server. Heb je internet?',
      'server-error': 'De server doet even niet mee. Probeer het later nog eens.',
      'browser-incompatible': 'Deze browser kan niet samen spelen. Probeer Chrome of Edge.',
      'unavailable-id': 'Die code is al bezet. Maak een nieuwe kamer.',
      code: 'Typ de code van je vriend (4 letters/cijfers).',
    }[e?.type] ?? `Er ging iets mis${e?.message ? `: ${e.message}` : ''}.`;
    this.leave();
    this.status = 'fout';
    this.error = why;
    this.changed();
  }

  /** De verbinding is weg. */
  lost() {
    if (this.status !== 'verbonden') return;
    const name = this.remote?.name ?? 'Je vriend';
    if (this.duel) this.endDuel(null);
    this.leave();
    this.game.ui.toast(`🌐 <b>${name}</b> is weg. De verbinding is verbroken.`, 4);
  }

  /** Stoppen met samen spelen. */
  leave() {
    try {
      this.conn?.close();
    } catch {
      // al dicht
    }
    try {
      this.peer?.destroy();
    } catch {
      // al weg
    }
    this.conn = null;
    this.peer = null;
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
    if (this.conn?.open) this.conn.send(msg);
  }

  receive(msg) {
    if (!msg || typeof msg !== 'object') return;
    const { ui, player, effects } = this.game;
    if (msg.t === 'hallo') {
      this.remote?.remove();
      this.remote = new RemotePlayer(this.game.scene, msg);
      play('flag');
      ui.toast(`🌐 <b>${this.remote.name}</b> speelt nu met je mee!`, 4);
      this.changed();
    } else if (msg.t === 'toestand') {
      // (Hebben we zijn "hallo" gemist? Dan maken we zijn poppetje nu)
      if (!this.remote) this.receive({ t: 'hallo', name: msg.n, character: msg.c });
      this.remote?.receive(msg);
    } else if (msg.t === 'klap') {
      // Je vriend raakte jou (alleen in een duel)
      if (this.duel?.phase !== 'vechten') return;
      const from = new THREE.Vector3().fromArray(msg.from);
      const taken = player.hurt(from, msg.damage);
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
