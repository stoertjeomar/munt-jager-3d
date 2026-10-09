import * as THREE from 'three';
import { Player, otherPlayable } from './player.js';
import { play } from './audio.js';

// ======================================================================
// Claude, je computer-maatje
// ======================================================================
// Een held die door de computer wordt bestuurd en met je meespeelt: hij loopt achter je aan, vecht mee tegen
// vijanden en kletst af en toe (in een tekstwolkje). Met H vraag je hem iets: volgen, wachten, even weggaan,
// of een oefenduel in de Arena (makkelijk, normaal of moeilijk).
// Hij is een echte Player (net als Omar), dus hij beweegt met dezelfde animaties als jij.
// Vijanden letten niet op hem: alleen in een duel kan hij geraakt worden.
// Vijanden die hij verslaat geven munten, maar tellen niet mee voor je level: sterker worden doe je zelf.

export const BUDDY = {
  name: 'Claude',
  weapon: 'katana', // zijn wapen
  damage: 0.5, // keer jouw schade (tegen gewone vijanden)
  bossDamage: 0.3, // keer jouw schade tegen bosses (anders is het te makkelijk)
  sight: 12, // vijanden binnen zoveel meter van jou valt hij aan
  followDist: 2.6, // zo ver blijft hij achter je
  teleportDist: 30, // verder weg (of als hij vastzit): hij flitst naar je toe
  talkEvery: [16, 30], // zoveel seconden tussen twee kletspraatjes
};

// Het oefenduel in de Arena. hp en damage hangen af van jouw leven (dan is het op elk level spannend).
//   hp = keer jouw leven · damage = deel van jouw leven per klap · think = hoe vaak hij nadenkt (seconden)
//   aggro = kans dat hij slaat als hij dichtbij is · dodge = kans dat hij wegrolt als jij slaat · reward = munten
export const BUDDY_DUEL = {
  makkelijk: { name: 'Makkelijk', hp: 0.8, damage: 0.05, think: 0.55, aggro: 0.45, dodge: 0.08, speed: 0.85, reward: 60 },
  normaal: { name: 'Normaal', hp: 1.2, damage: 0.08, think: 0.35, aggro: 0.65, dodge: 0.25, speed: 1, reward: 150 },
  moeilijk: { name: 'Moeilijk', hp: 1.8, damage: 0.11, think: 0.2, aggro: 0.85, dodge: 0.45, speed: 1.15, reward: 350 },
};

// Wat Claude zegt
const LINES = {
  hoi: ['Hoi! Ik ben Claude. Ik speel met je mee!', 'Daar ben ik weer! Waar gaan we heen?'],
  spot: ['Daar! Een {naam}!', 'Kijk uit, een {naam}!', 'Kom op, die {naam} pakken we samen!'],
  mijnKill: ['Hebbes!', 'Yes! Die is weg!', 'Pats!', 'Eentje minder!'],
  jouwKill: ['Mooie klap!', 'Wauw, goed zo!', 'Jij bent echt sterk!', 'Boem! Zo doe je dat!'],
  pasOp: ['Pas op! Drink een flesje (R)!', 'Je leven is bijna op!'],
  level: ['Level omhoog! Gefeliciteerd!', 'Je wordt steeds sterker!'],
  wacht: ['Wacht op mij!', 'Hé, niet zo snel!'],
  klets: [
    'Zullen we naar de Arena? Daar kun je een duel tegen mij doen!',
    'Wist je dat er eilanden in de lucht zweven? Boven de Ruïnevallei!',
    'Ik heb zin in een avontuur!',
    'Heb je de dragers in Muntdorp al gezien? Zij sjouwen de hele dag.',
    'Met H kun je mij iets vragen.',
    'Vind jij ook alle diamanten?',
    'Omar zegt dat niemand hem kan verslaan. Hmm...',
    'Ik vind jouw game echt leuk!',
  ],
  duel: ['Oké! Maar ik ga niet zachtjes doen!', 'Kom maar op!'],
  duelWin: ['Hihi, ik won! Nog een keer?', 'Goed geprobeerd! Revanche?'],
  duelLose: ['Jij bent echt te sterk voor mij!', 'Oei, verloren! Jij wint!'],
};
const pick = (list) => list[Math.floor(Math.random() * list.length)];

/** Nep-"stats" voor Claude: Player leest alleen deze dingen. Hij gebruikt jouw level, maar heeft eindeloos leven en stamina. */
class BuddyStats {
  constructor(real) {
    this.real = real;
    this.data = { character: otherPlayable(real.data.character), weapon: BUDDY.weapon, helmet: 'geen', level: 1 };
    this.boost = 1;
  }
  get level() { return this.real.level; }
  get maxHealth() { return 9999; }
  get maxStamina() { return 9999; }
  get flasksMax() { return 0; }
  get damageMultiplier() { return 1; }
  get speedMultiplier() { return this.boost; }
  get defenseBonus() { return 0; }
  get healBonus() { return 0; }
  get infiniteStamina() { return true; }
  hasPower(key) { return key === 'dash' || key === 'doubleJump'; }
}

/** Een plaatje met tekst (voor zijn naambordje en zijn tekstwolkje). */
function makeLabel(text, { bubble = false } = {}) {
  const canvas = document.createElement('canvas');
  const ctx = canvas.getContext('2d');
  const font = bubble ? 'bold 30px Trebuchet MS, sans-serif' : 'bold 34px Trebuchet MS, sans-serif';
  ctx.font = font;
  // Lange zinnen over meerdere regels
  const words = text.split(' ');
  const lines = [];
  let line = '';
  for (const w of words) {
    const test = line ? `${line} ${w}` : w;
    if (ctx.measureText(test).width > 420 && line) {
      lines.push(line);
      line = w;
    } else line = test;
  }
  lines.push(line);
  const width = Math.min(480, Math.max(...lines.map((l) => ctx.measureText(l).width)) + 44);
  const lineH = bubble ? 38 : 44;
  canvas.width = 512;
  canvas.height = bubble ? lines.length * lineH + 44 : 64;
  ctx.font = font;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  const x0 = (512 - width) / 2;
  if (bubble) {
    // Wit wolkje met een puntje naar beneden
    ctx.fillStyle = 'rgba(255, 255, 255, 0.95)';
    ctx.strokeStyle = '#2a4a6a';
    ctx.lineWidth = 4;
    ctx.beginPath();
    ctx.roundRect(x0, 4, width, canvas.height - 28, 20);
    ctx.fill();
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(256 - 14, canvas.height - 26);
    ctx.lineTo(256, canvas.height - 4);
    ctx.lineTo(256 + 14, canvas.height - 26);
    ctx.fill();
    ctx.fillStyle = '#1a2a3a';
    lines.forEach((l, i) => ctx.fillText(l, 256, 4 + lineH / 2 + 4 + i * lineH));
  } else {
    ctx.fillStyle = 'rgba(10, 30, 50, 0.65)';
    ctx.beginPath();
    ctx.roundRect(x0, 8, width, 48, 24);
    ctx.fill();
    ctx.lineWidth = 6;
    ctx.strokeStyle = '#0a1a30';
    ctx.strokeText(text, 256, 33);
    ctx.fillStyle = '#9be7ff';
    ctx.fillText(text, 256, 33);
  }
  const tex = new THREE.CanvasTexture(canvas);
  const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, depthTest: false, transparent: true }));
  sprite.scale.set(3.2, (3.2 * canvas.height) / 512, 1);
  sprite.renderOrder = 11;
  return sprite;
}

export class Buddy {
  /**
   * @param {object} game  { scene, player, stats, effects, ui, colliders, bounds }
   */
  constructor(game) {
    this.game = game;
    this.scene = game.scene;
    this.stats = new BuddyStats(game.stats);
    this.p = new Player(game.scene, this.stats);
    this.tag = makeLabel(`🤖 ${BUDDY.name}`);
    game.scene.add(this.tag);
    this.bubble = null;
    this.bubbleT = 0;
    const saved = game.stats.data.buddy ?? {};
    this.mode = saved.mode ?? 'volg'; // volg | wacht | weg
    this.target = null; // de vijand waar hij nu tegen vecht
    this.talkT = 6;
    this.cool = {}; // wachttijden per soort praatje
    this.stuckT = 0;
    this.hidden = false; // even weg (bijv. als jij op de draak vliegt)
    this.duel = null; // { level, hp, maxHp, think, hitIds }
    this.hitSwing = -1;
    this.lastId = null;
    this.move = new THREE.Vector3();
    this.firstTime = !game.stats.data.buddy;
    this.teleportTo(game.player.position, true);
    if (this.mode === 'weg') this.setVisible(false);
    // Het doelwit voor jouw zwaard tijdens het oefenduel (net als een vijand)
    const self = this;
    this.duelTarget = {
      isBuddy: true,
      type: { name: BUDDY.name, height: 1.7, radius: 0.45, color: 0x9be7ff },
      get alive() { return !!self.duel && self.duel.hp > 0; },
      get position() { return self.p.position; },
      get center() { return self.p.position.clone().setY(self.p.position.y + 0.9); },
      hit: (from, id, damage) => self.duelHit(from, id, damage),
    };
  }

  get position() {
    return this.p.position;
  }

  get active() {
    return this.mode !== 'weg';
  }

  save() {
    const d = this.game.stats.data;
    d.buddy = { ...(d.buddy ?? {}), mode: this.mode };
    this.game.stats.save();
  }

  /** volg | wacht | weg */
  setMode(mode) {
    const was = this.mode;
    this.mode = mode;
    if (mode === 'weg') {
      this.poof();
      this.setVisible(false);
    } else if (was === 'weg') {
      this.teleportTo(this.game.player.position);
      this.say(pick(LINES.hoi));
    } else if (mode === 'wacht') this.say('Oké, ik wacht hier!');
    else this.say('Ik kom eraan!');
    this.save();
  }

  setVisible(on) {
    this.p.mesh.visible = on;
    this.tag.visible = on;
    if (this.bubble) this.bubble.visible = on;
  }

  /** Iets zeggen (tekstwolkje boven zijn hoofd). */
  say(text, seconds = 3.2) {
    if (this.bubble) {
      this.scene.remove(this.bubble);
      this.bubble.material.map.dispose();
      this.bubble.material.dispose();
    }
    this.bubble = makeLabel(text, { bubble: true });
    this.scene.add(this.bubble);
    this.bubbleT = seconds;
  }

  /** Iets zeggen, maar niet te vaak hetzelfde soort ding. */
  chat(kind, seconds = 8, vars = {}) {
    if ((this.cool[kind] ?? 0) > 0 || !this.active || this.hidden) return;
    this.cool[kind] = seconds;
    let text = pick(LINES[kind]);
    for (const [k, v] of Object.entries(vars)) text = text.replace(`{${k}}`, v);
    this.say(text);
  }

  /** Poef! (wolkje en geluidje) */
  poof() {
    this.game.effects.burst(this.p.position.clone().setY(this.p.position.y + 0.9), 0x9be7ff, { count: 20, speed: 4, size: 0.12, life: 0.6, up: 2 });
    play('poef');
  }

  /** In één keer naar jou toe flitsen (achter je, een stukje opzij). */
  teleportTo(pos, quiet = false) {
    const player = this.game.player;
    const back = player.facing.clone().multiplyScalar(-1.6);
    const side = new THREE.Vector3(-back.z, 0, back.x).normalize().multiplyScalar(0.8);
    if (!quiet && this.p.mesh.visible) this.poof();
    this.p.position.copy(pos).add(back).add(side);
    this.p.velocity.set(0, 0, 0);
    this.p.knockback.set(0, 0, 0);
    this.p.mesh.rotation.y = player.mesh.rotation.y;
    this.stuckT = 0;
    if (!quiet) this.poof();
  }

  // ---------------- Elke frame ----------------

  /**
   * @param {object} ctx  { targets: [], hit(target, damage, id), hurtPlayer(from, damage), riding, keepInside(pos, r) }
   */
  update(dt, ctx) {
    if (dt <= 0) return;
    const player = this.game.player;
    for (const k in this.cool) this.cool[k] -= dt;
    // Tekstwolkje boven zijn hoofd
    if (this.bubble) {
      this.bubbleT -= dt;
      this.bubble.position.copy(this.p.position).setY(this.p.position.y + 2.75 + (this.bubble.scale.y - 0.5) / 2);
      this.bubble.material.opacity = Math.min(1, this.bubbleT * 3);
      if (this.bubbleT <= 0) {
        this.scene.remove(this.bubble);
        this.bubble = null;
      }
    }
    if (!this.active) return;
    // Jij vliegt op de draak: Claude wacht even (en komt terug als je weer landt)
    if (ctx.riding && !this.duel) {
      if (!this.hidden) {
        this.poof();
        this.hidden = true;
        this.setVisible(false);
      }
      return;
    }
    if (this.hidden) {
      if (!player.onGround) return;
      this.hidden = false;
      this.setVisible(true);
      this.teleportTo(player.position);
    }

    const controls = { move: this.move.set(0, 0, 0), sprint: false, jumpPressed: false, faceTarget: null };
    if (this.duel) this.thinkDuel(dt, controls, ctx);
    else this.thinkFollow(dt, controls, ctx);

    const before = this.p.position.clone();
    this.p.update(dt, controls, this.game.colliders, this.game.bounds);
    this.p.events.length = 0;
    if (this.duel) ctx.keepInside?.(this.p.position, 0.5);

    // Vast? (hij wil lopen maar komt niet vooruit) Eerst springen, dan naar je toe flitsen
    const wanted = controls.move.lengthSq() > 0.01;
    const moved = Math.hypot(this.p.position.x - before.x, this.p.position.z - before.z);
    if (wanted && moved < dt * 1.2) this.stuckT += dt;
    else this.stuckT = Math.max(0, this.stuckT - dt);
    if (!this.duel && this.stuckT > 2.5) this.teleportTo(player.position);

    // Zijn zwaard raakt iets?
    if (this.p.sword.isHitting) this.swordHits(ctx);

    // Naambordje
    this.tag.visible = this.p.mesh.visible || this.p.invulnerable > 0;
    this.tag.position.copy(this.p.position).setY(this.p.position.y + 2.25);
  }

  /** Gewoon samen spelen: achter je aan, en vijanden in de buurt aanvallen. */
  thinkFollow(dt, controls, ctx) {
    const player = this.game.player;
    const me = this.p.position;
    const toPlayer = player.position.clone().sub(me);
    const flat = Math.hypot(toPlayer.x, toPlayer.z);
    // Te ver weg, of jij bent ergens hoog (een eiland)? Dan flitst hij naar je toe
    if (this.mode === 'volg' && player.onGround && (flat > BUDDY.teleportDist || Math.abs(toPlayer.y) > 4)) {
      this.chat('wacht', 20);
      this.teleportTo(player.position);
      return;
    }
    // Een vijand zoeken: dicht bij jou (of bij hem, als hij moet wachten)
    const center = this.mode === 'wacht' ? me : player.position;
    const range = this.mode === 'wacht' ? 8 : BUDDY.sight;
    if (!this.target || !this.target.alive || this.target.position.distanceTo(center) > range + 4) {
      this.target = null;
      let best = Infinity;
      for (const t of ctx.targets) {
        if (!t.alive || t.isBuddy || t.type?.dummy || Math.abs(t.position.y - me.y) > 3) continue;
        const d = t.position.distanceTo(center);
        if (d < range && d < best) {
          best = d;
          this.target = t;
        }
      }
      if (this.target) this.chat('spot', 25, { naam: this.target.type?.name ?? this.target.name ?? 'vijand' });
    }
    // Leven bijna op? Waarschuwen
    if (player.health < player.maxHealth * 0.25 && player.alive) this.chat('pasOp', 20);

    if (this.target) {
      const to = this.target.position.clone().sub(me).setY(0);
      const d = to.length();
      const reach = this.p.sword.range + (this.target.type?.radius ?? 0.6) - 0.4;
      to.normalize();
      controls.faceTarget = to;
      if (d > reach) {
        controls.move.copy(to);
        controls.sprint = d > 5;
        if (d > 6 && d < 12 && this.p.dashCooldown <= 0 && Math.random() < 0.02) this.p.tryDash(to);
      } else {
        // Dichtbij: draaien en slaan
        this.p.mesh.rotation.y = Math.atan2(to.x, to.z);
        if (this.p.sword.attackProgress === null) this.p.tryAttack();
      }
      return;
    }
    if (this.mode === 'wacht') return;
    // Achter je aan lopen (een stukje achter en opzij)
    const back = player.facing.clone().multiplyScalar(-BUDDY.followDist);
    const side = new THREE.Vector3(-back.z, 0, back.x).normalize().multiplyScalar(1.1);
    const spot = player.position.clone().add(back).add(side);
    const to = spot.sub(me).setY(0);
    const d = to.length();
    if (d > 1) {
      controls.move.copy(to.normalize());
      controls.sprint = d > 6 || player.sprinting;
    }
    // Springt jij? Dan springt hij ook (soms)
    if (player.jumped && flat < 6 && Math.random() < 0.6) controls.jumpPressed = true;
    // Kletsen als het rustig is
    this.talkT -= dt;
    if (this.talkT <= 0) {
      this.talkT = BUDDY.talkEvery[0] + Math.random() * (BUDDY.talkEvery[1] - BUDDY.talkEvery[0]);
      if (flat < 10) this.chat('klets', 1);
    }
  }

  /** Zijn zwaard: wat staat er vóór hem? */
  swordHits(ctx) {
    const me = this.p.position;
    const facing = this.p.facing;
    const id = `claude-${this.p.sword.swingId}`;
    if (this.duel) {
      // In het duel raakt hij jou
      if (this.hitSwing === this.p.sword.swingId) return;
      const player = this.game.player;
      const to = player.position.clone().sub(me);
      if (Math.abs(to.y) > 1.6) return;
      to.y = 0;
      const d = to.length();
      if (d > this.p.sword.range + 0.45 || (d > 1.4 && to.normalize().dot(facing) < 0)) return;
      this.hitSwing = this.p.sword.swingId;
      ctx.hurtPlayer(me.clone(), Math.round(player.maxHealth * BUDDY_DUEL[this.duel.level].damage));
      return;
    }
    for (const t of ctx.targets) {
      if (!t.alive || t.isBuddy) continue;
      const to = t.position.clone().sub(me);
      if (Math.abs(t.center.y - (me.y + 0.9)) > (t.type?.height ?? 2) / 2 + 1.2) continue;
      to.y = 0;
      const d = to.length();
      if (d > this.p.sword.range + (t.type?.radius ?? 0.6)) continue;
      if (d > 1.2 + (t.type?.radius ?? 0.6) && to.normalize().dot(facing) < 0) continue;
      const result = ctx.hit(t, Math.max(1, Math.round(this.game.player.attackDamage * (t.info ? BUDDY.bossDamage : BUDDY.damage))), id);
      if (result?.killed) this.chat('mijnKill', 6);
    }
  }

  // ---------------- Het oefenduel ----------------

  /** Duel beginnen (de Arena zet jullie neer, zie main.js). */
  startDuel(level, at) {
    const cfg = BUDDY_DUEL[level];
    const maxHp = Math.round(this.game.player.maxHealth * cfg.hp);
    this.duel = { level, hp: maxHp, maxHp, think: 0, dodgeT: 0 };
    this.stats.boost = cfg.speed;
    this.hidden = false;
    this.setVisible(true);
    this.p.position.copy(at);
    this.p.velocity.set(0, 0, 0);
    this.p.invulnerable = 0;
    this.target = null;
    this.lastId = null;
    this.chat('duel', 1);
  }

  /** Klaar met het duel. */
  endDuel(iWon) {
    if (!this.duel) return;
    this.duel = null;
    this.stats.boost = 1;
    this.p.health = this.p.maxHealth;
    this.cool.duelWin = this.cool.duelLose = 0;
    this.chat(iWon ? 'duelWin' : 'duelLose', 1);
  }

  /** Jouw zwaard raakt Claude (alleen in het duel). Geeft { damage, killed } of null. */
  duelHit(from, id, damage) {
    const duel = this.duel;
    if (!duel || duel.hp <= 0 || this.lastId === id) return null;
    if (this.p.invincible) return null; // weggerold!
    this.lastId = id;
    duel.hp = Math.max(0, duel.hp - damage);
    this.p.hurt(from, damage); // terugstoot en "au"
    return { damage, killed: duel.hp <= 0 };
  }

  /** Het brein in het duel: naar je toe, slaan, en soms wegrollen als jij slaat. */
  thinkDuel(dt, controls, ctx) {
    const duel = this.duel;
    const cfg = BUDDY_DUEL[duel.level];
    const player = this.game.player;
    const to = player.position.clone().sub(this.p.position).setY(0);
    const d = to.length();
    to.normalize();
    controls.faceTarget = to;
    duel.think -= dt;
    duel.dodgeT -= dt;
    // Jij slaat en hij staat dichtbij: misschien wegrollen (één keer per slag)
    const swing = player.sword.attackProgress;
    if (swing !== null && swing < 0.35 && d < player.sword.range + 0.8 && duel.dodgeT <= 0 && this.p.onGround) {
      duel.dodgeT = player.sword.swingTime + 0.2;
      if (Math.random() < cfg.dodge) {
        const side = new THREE.Vector3(-to.z, 0, to.x).multiplyScalar(Math.random() < 0.5 ? 1 : -1);
        this.p.tryRoll(side.add(to.clone().multiplyScalar(-0.5)));
        return;
      }
    }
    const reach = this.p.sword.range - 0.2;
    if (d > reach) {
      controls.move.copy(to);
      controls.sprint = d > 6;
      if (d > 5 && d < 10 && this.p.dashCooldown <= 0 && Math.random() < cfg.aggro * 0.02) this.p.tryDash(to);
    } else {
      this.p.mesh.rotation.y = Math.atan2(to.x, to.z);
      if (duel.think <= 0) {
        duel.think = cfg.think;
        if (this.p.sword.attackProgress === null && Math.random() < cfg.aggro) this.p.tryAttack();
        else if (Math.random() < 0.3) controls.move.copy(to).multiplyScalar(-1); // even een stapje terug
      }
    }
  }

  /** De balk bovenin tijdens het duel. */
  get hud() {
    if (!this.duel) return null;
    return { name: `🤖 ${BUDDY.name} (${BUDDY_DUEL[this.duel.level].name})`, hp: this.duel.hp, maxHp: this.duel.maxHp };
  }

  /** Voor de minimap. */
  mapMarkers() {
    if (!this.active || this.hidden) return [];
    return [{ x: this.p.position.x, z: this.p.position.z, icon: '●', color: '#9be7ff' }];
  }

  // ---------------- Dingen die gebeuren ----------------

  /** Jij versloeg een vijand. */
  onPlayerKill() {
    if (Math.random() < 0.4) this.chat('jouwKill', 10);
  }

  /** Jij ging een level omhoog. */
  onLevelUp() {
    this.cool.level = 0;
    this.chat('level', 1);
  }

  /** De eerste keer (nieuw maatje): hallo zeggen. */
  greet() {
    this.chat('hoi', 1);
  }
}
