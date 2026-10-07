import * as THREE from 'three';
import { Boss, BOSS_INFO, BOSS_CLASSES } from './bosses.js';
import { Player, otherPlayable } from './player.js';
import { WEAPONS, START_WEAPON } from './weapons.js';
import { makeBubble } from './npcs.js';
import { SwordTrail } from './trail.js';
import { play } from './audio.js';
import { SAVE_KEY } from './levels.js';

// Omar: de maker van het spel. Hij woont in zijn Gekke Kasteel (castle.js) en vecht in de arena.
// Omar is een echte "speler": hij heeft hetzelfde lijf, dezelfde animaties en dezelfde krachten als jij
// (zwaard-combo's, dash, wervelslag, dubbele sprong + grondslag, vuurzwaard, rollen, sprinten en drinken).
// Alleen bestuurt de computer hem, in plaats van een toetsenbord.
// Hij draagt altijd het personage dat jij NIET koos, de Kroon van Omar en het Diamanten zwaard.
//
// Eerlijk vechten: elke aanval laat hij eerst zien (een houding, een "ting!" of gebrom, een ! boven zijn hoofd,
// en bij grote aanvallen een rode cirkel op de grond). Na elke aanval staat hij even te hijgen: DAN moet je slaan!
//
// Het filmpje eromheen (troon, sprong, winnen, verliezen) regelt omar.js.

// ---------- Instellingen: hiermee maak je Omar makkelijker of moeilijker ----------
// Bij twee getallen [a, b] is a voor fase 1 en b voor fase 2 (als hij boos is, onder de helft van zijn leven).
export const OMAR = {
  level: 30, // alleen om op te scheppen in de gesprekken
  size: 1.12, // Omar is iets groter dan jij
  hipHeight: 0.95, // hoogte van zijn heupen (om hem goed op de troon te laten zitten)
  // Leven: zoveel klappen met JOUW wapen kan Omar hebben. Hoe hoger jouw level, hoe minder klappen het zijn.
  hp: { hits: 36, perLevel: 0.4, minHits: 26, min: 520 },
  speed: [1.35, 1.55], // hoe snel hij loopt (1 = net zo snel als jij): hij is sneller dan jij!
  sprintFrom: 6, // verder weg dan dit (meter)? Dan sprint hij naar je toe
  swingSpeed: 0.78, // zijn zwaard zwaait sneller dan dat van jou (0.78 = in 78% van de tijd)
  // Hoeveel van JOUW leven een klap kost (0.11 = 11%). Zo is hij op elk level even eng.
  damagePct: { slag: 0.11, dash: 0.14, wervelslag: 0.16, grondslag: 0.2, boos: 0.08 },
  phase2Damage: 1.3, // in fase 2 doet alles 30% meer pijn
  fireDamage: 1.35, // met zijn vuurzwaard 35% meer
  // Zo lang laat hij eerst zien wat hij gaat doen (seconden): kort, maar je kunt het altijd zien aankomen
  windup: { combo: [0.3, 0.22], dash: [0.38, 0.28], spin: [0.4, 0.3], slam: [0.45, 0.35], fire: 0.45 },
  // Zo lang staat hij daarna te hijgen: dan kun jij slaan! (niet lang...)
  recover: { combo: [0.55, 0.4], dash: [0.55, 0.4], spin: [0.55, 0.4], slam: [0.75, 0.55] },
  // Zo lang moet hij wachten voordat hij een aanval nog een keer mag doen
  cooldown: { dash: [1.6, 1.0], spin: [2.6, 1.8], slam: [4, 2.8], dodge: [1.4, 0.9], taunt: [12, 99], mercy: 20, fire: 12, drink: [9, 7] },
  comboHits: [3, 4], // zoveel klappen achter elkaar
  dodgeChance: [0.45, 0.6], // kans dat hij wegrolt of wegdasht als jij slaat
  dashDodge: 0.65, // kans dat hij wegdasht in plaats van wegrolt
  counterChance: 0.6, // kans dat hij na het ontwijken meteen terugslaat
  spinAfterCombo: [0.3, 0.55], // kans op een wervelslag na zijn combo
  reaction: [0.06, 0.04], // zo snel ziet hij jouw klap aankomen (seconden)
  think: [0.25, 0.18], // zo vaak bedenkt hij een nieuwe aanval
  gap: [0.35, 0.25], // minimale pauze tussen twee aanvallen
  poise: [3, 2], // zoveel klappen in 1.6 seconden en hij wil weg (of slaat terug met een wervelslag)
  flasks: 3, // zoveel flesjes heeft hij (sla hem als hij drinkt: dan is dat flesje weg!)
  drinkBelow: 0.5, // onder de helft van zijn leven gaat hij drinken...
  drinkHeal: 0.2, // ...en krijgt dan 20% van zijn leven terug
  reach: 0.4, // zoveel verder dan zijn zwaard lang is raakt hij jou (jouw lijf is ook dik)
  spinRadius: 3.6, // zo ver raakt zijn wervelslag (de rode cirkel is precies zo groot)
  slamRadius: 4.2, // zo ver raakt zijn grondslag (spring erover, of ren de cirkel uit!)
};

const tmp = new THREE.Vector3();
const UP = new THREE.Vector3(0, 1, 0);
const GRAVITY = 25; // net als in player.js
const BASE_SPEED = 6.5; // loopsnelheid van een speler (player.js)
const ZERO_CONTROLS = { move: new THREE.Vector3(), sprint: false, jumpPressed: false, faceTarget: null };
const NO_BOUNDS = { x: 999, z: 999 }; // de arena houdt hem binnen (zie Boss.update)
// Hierin trekt hij zich niks aan van jouw klappen (hij wordt niet weggeduwd)
const SUPER_ARMOUR = ['spinWindup', 'spin', 'dash', 'sprong1', 'sprong2', 'zweven', 'hangen', 'vallen', 'boos'];
// Hierin kan hij jouw klappen zien aankomen en wegrollen
const CAN_DODGE = ['neutraal', 'aanlopen'];

const TAUNTS = {
  uitdagen: ['Durf je niet?', 'Kom dan!', 'Hehe! Ik sta hier hoor!', 'Mijn goudvis slaat harder!', 'Ik ga even zitten, hoor. Saai!'],
  raak: ['Hehe!', 'Te langzaam!', 'Pats!', 'Baas!', 'Boem!'],
  mis: ['Te langzaam!', 'Hihi, mis!', 'Hier ben ik!', 'Waar sla je op?'],
  au: ['Au! Valsspeler!', 'Hé! Dat deed pijn!', 'Auw! Niet zo hard!'],
};
const pick = (list) => list[Math.floor(Math.random() * list.length)];

/** Welk personage koos de speler? (uit de save; Omar neemt dan het andere) */
function savedCharacter() {
  try {
    return JSON.parse(localStorage.getItem(SAVE_KEY))?.character ?? 'eve';
  } catch {
    return 'eve';
  }
}

/** Afstand over de grond. */
function flatDist(a, b) {
  return Math.hypot(a.x - b.x, a.z - b.z);
}

/**
 * Nep-"stats" voor Omar: hij heeft alle krachten. Player leest alleen deze dingen.
 * Zijn echte leven is het boss-leven (hp); het leven van de pop doet niet mee.
 * Er wordt hier niks opgeslagen: de save van de echte speler blijft van Omar af.
 */
export class OmarStats {
  constructor(character) {
    this.data = { character, weapon: 'diamant', helmet: 'kroon', level: OMAR.level };
    this.phase = 0; // 0 = fase 1, 1 = fase 2
    this.boost = 1; // even sneller of langzamer (rustig rondlopen, ver springen)
  }

  get level() { return OMAR.level; }
  get maxHealth() { return 9999; }
  get maxStamina() { return 999; } // de computer houdt zichzelf in met de wachttijden hierboven
  get flasksMax() { return OMAR.flasks; }
  get damageMultiplier() { return 1; }
  get speedMultiplier() { return OMAR.speed[this.phase] * this.boost; }
  get defenseBonus() { return 0; }
  get healBonus() { return 0; }
  hasPower() { return true; } // dash, dubbele sprong, wervelslag, grondslag, vuurzwaard: alles!
}

/** Naambordje "Omar" boven zijn hoofd. */
function makeNameTag() {
  const canvas = document.createElement('canvas');
  canvas.width = 256;
  canvas.height = 64;
  const ctx = canvas.getContext('2d');
  ctx.font = 'bold 46px system-ui, sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.lineWidth = 8;
  ctx.strokeStyle = '#5a1a8a';
  ctx.strokeText('Omar', 128, 34);
  ctx.fillStyle = '#ffd23a';
  ctx.fillText('Omar', 128, 34);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: texture, transparent: true, depthWrite: false, toneMapped: false }));
  sprite.scale.set(1.5, 0.38, 1);
  sprite.position.y = 2.05;
  sprite.renderOrder = 6;
  return sprite;
}

const smooth = (t) => {
  const k = THREE.MathUtils.clamp(t, 0, 1);
  return k * k * (3 - 2 * k);
};

// Tijdlijn van zijn sprong van de troon (seconden): eerst opstaan, dan springen
const STAND_TIME = 0.45;
const LEAP_END = 1.45;

export class OmarFighter extends Boss {
  constructor(scene, arena) {
    super(scene, arena, 'omar');
    this.type = { name: 'Omar', radius: 0.5, height: 1.85, color: 0xb04dff, damage: 0, stompable: false, noContact: true };
    this.info = { ...BOSS_INFO.omar };
    // De "pop": een echte Player, maar bestuurd door de computer (een eigen exemplaar, los van jou)
    this.puppet = new Player(scene, new OmarStats(otherPlayable(savedCharacter())));
    scene.remove(this.mesh);
    this.mesh = this.puppet.mesh;
    this.trail = new SwordTrail(scene);
    // Een paarse mistmuur in plaats van een gouden (en wat doorzichtiger: de arena is kleiner, de camera staat er vaak achter)
    this.fog.material.fragmentShader = this.fog.material.fragmentShader
      .replace('vec3(1.0, 0.85, 0.45)', 'vec3(0.75, 0.35, 1.0)')
      .replace('* opacity;', '* opacity * 0.5;');
    this.nameTag = makeNameTag();
    this.mesh.add(this.nameTag);
    // Tekstwolkje voor zijn grappen tijdens het gevecht
    this.bubble = makeBubble();
    this.bubble.scale.set(2.6, 0.65, 1);
    this.bubble.position.y = 2.75;
    this.mesh.add(this.bubble);
    this.throne = new THREE.Vector3(0, 2.2, -26.6); // bovenkant van het kussen (wordt gezet door omar.js)
    this.landing = new THREE.Vector3(0, 0, -6);
    this.effects = null; // wordt gezet door omar.js (voor vonken als het spel stilstaat)
    this.resetFight();
  }

  /** Waar Omar staat als hij op zijn troon zit (zijn voeten hangen boven het trapje). */
  get seatedPosition() {
    return new THREE.Vector3(this.throne.x, this.throne.y - OMAR.hipHeight, this.throne.z + 0.15);
  }

  /** Waar Omar staat als hij net is opgestaan (vóór de troon). */
  get standPosition() {
    return new THREE.Vector3(this.throne.x, 1.5, this.throne.z + 1.4);
  }

  /** Klaarzetten voor een gevecht tegen deze speler: leven hangt af van jouw wapen en level, kostuum van jouw held. */
  prepare(stats) {
    const weapon = WEAPONS[stats.data.weapon] ?? WEAPONS[START_WEAPON];
    const hits = Math.max(OMAR.hp.minHits, OMAR.hp.hits - OMAR.hp.perLevel * (stats.level - 1));
    this.info.hp = Math.max(OMAR.hp.min, Math.round((weapon.damage * stats.damageMultiplier * hits) / 10) * 10);
    const want = otherPlayable(stats.data.character);
    if (want !== this.puppet.stats.data.character) {
      this.puppet.stats.data.character = want;
      this.puppet.setCharacter(want);
    }
    this.resetFight();
  }

  /** Waar staat de troon? (bovenkant van het kussen) */
  setThrone(seat) {
    this.throne.copy(seat);
    this.resetFight();
  }

  /** Alles terug zoals aan het begin: op de troon, vol leven, fase 1, flesje weer vol. */
  resetFight() {
    super.resetFight();
    if (!this.puppet) return; // (de Boss-constructor roept dit al aan voordat de pop er is)
    const p = this.puppet;
    this.dead = false;
    this.dying = 0;
    this.hp = this.info.hp;
    p.stats.phase = 0;
    p.stats.boost = 1;
    p.respawnAt(this.seatedPosition); // ook: vuurzwaard uit, flesjes vol, Diamanten zwaard en kroon
    p.sword.swingTime *= OMAR.swingSpeed; // Omar slaat sneller dan jij
    this.mesh.rotation.y = 0; // kijkt naar de arena (het zuiden)
    this.mesh.scale.setScalar(OMAR.size);
    this.mesh.visible = true;
    this.mode = 'troon'; // troon | opstaan | sprong | klaar | vechten | lachen | verslagen
    this.nameTag.visible = false;
    this.bubble.visible = false;
    this.bubbleTimer = 0;
    this.gesture = 'zitten'; // op de troon: zitten | lachen | zwaard | wijzen
    this.introT = 0;
    this.setState('start', 1.2);
    // Wachttijden (seconden). Aan het begin even rustig: geen aanval in de eerste seconde.
    this.cd = { think: 0, gap: 0.3, dash: 0.8, spin: 1.8, slam: 2.5, dodge: 0.6, taunt: 6, mercy: 0, fire: 2.5, drink: 0, say: 0, raak: 0 };
    this.swingsLeft = 0;
    this.after = OMAR.recover.combo[0];
    this.lastSwordHit = null;
    this.lastSpinHit = null;
    this.lastDodgeId = null;
    this.dashHit = false;
    this.recentHits = [];
    this.pending = null; // een geplande ontwijk-rol
    this.chained = false; // al een tweede grondslag gedaan?
    this.lastMove = null;
    this.seenSwing = null;
    this.seenSpin = null;
    this.seenSlam = false;
    this.seenDrink = false;
    this.sprinting = false;
    this.side = Math.random() < 0.5 ? 1 : -1;
    this.sideTimer = 2;
    this.laughTimer = 0;
    this.laughed = false;
    this.sparkTimer = 0;
    this.lowSaid = false;
    this.moveLog = []; // welke aanvallen hij deed (handig om te testen)
    this.dealt = {}; // hoeveel schade hij jou deed, per aanval (handig om te testen)
    this.taken = { total: 0, hits: 0, missed: 0 }; // hoeveel schade jij hem deed (en hoe vaak je mis sloeg)
    this.trail?.cut();
    // Fase-2 kleur weer weg, en de materialen opnieuw onthouden (zwaard en kroon zijn nieuw)
    this.materials.forEach((entry, i) => {
      if (!this.baseEmissive?.[i]) return;
      entry.color.copy(this.baseEmissive[i]);
      entry.m.emissive.copy(this.baseEmissive[i]);
    });
    this.knownModel = null;
  }

  setState(name, time = 0) {
    this.state = name;
    this.stateT = 0;
    this.timer = time;
    this.stateTime = time;
  }

  /** Eigen kopieën van de materialen (anders flitst de speler mee als Omar geraakt wordt). */
  syncMaterials() {
    const model = this.puppet.model;
    if (!model || model === this.knownModel) return;
    this.knownModel = model;
    const mats = [];
    model.traverse((c) => {
      if (!c.isMesh) return;
      c.material = Array.isArray(c.material) ? c.material.map((m) => m.clone()) : c.material.clone();
      for (const m of [].concat(c.material)) if (m.emissive) mats.push(m);
    });
    this.rememberMaterials(mats);
    this.baseEmissive = this.materials.map((e) => e.color.clone());
    if (this.phase2) this.tintPhase2();
  }

  tintPhase2() {
    for (const entry of this.materials) {
      entry.color.set(0x5a1030);
      entry.m.emissive.set(0x5a1030);
    }
  }

  // ---------- Praten ----------

  /** Iets zeggen in zijn tekstwolkje. Niet te vaak (behalve als het belangrijk is). */
  say(text, seconds = 2.2, force = false) {
    if (!force && this.cd.say > 0) return;
    this.bubble.userData.draw(text);
    this.bubble.visible = true;
    this.bubbleTimer = seconds;
    this.cd.say = seconds + 1.2;
  }

  tickBubble(dt) {
    if (this.bubbleTimer <= 0) return;
    this.bubbleTimer -= dt;
    if (this.bubbleTimer <= 0) this.bubble.visible = false;
  }

  /** Korte zwevende tekst boven zijn hoofd. */
  shout(text, color = '#d9a3ff', size = 0.55) {
    this.effects?.floatText(this.center.setY(this.position.y + 2.5), text, color, size);
  }

  /** "Let op, nu komt er iets!": een ! boven zijn hoofd en een ting. */
  telegraph(sound = 'glint') {
    this.shout('!', '#ffd23a', 0.7);
    play(sound);
  }

  log(move) {
    this.moveLog.push(move);
    if (this.moveLog.length > 400) this.moveLog.shift();
  }

  // ---------- Het filmpje (omar.js) ----------

  /** Begin met opstaan en van de troon springen; hij landt op `landing`. */
  playIntro(landing) {
    this.landing.copy(landing);
    this.mode = 'opstaan';
    this.introT = 0;
  }

  /** Overslaan: meteen staan op de landingsplek. */
  finishIntro() {
    this.introT = LEAP_END;
    this.mode = 'klaar';
    this.nameTag.visible = true;
    this.position.copy(this.landing);
    this.puppet.body.rotation.set(0, 0, 0);
    this.puppet.velocity.set(0, 0, 0);
    this.puppet.onGround = true;
    this.mesh.rotation.y = 0;
  }

  /** Bewegen terwijl het spel stilstaat (in een filmpje of menu). omar.js roept dit elke frame aan. */
  cutsceneTick(dt) {
    this.time = (this.time ?? 0) + dt;
    this.fogOpacity += ((this.awake && !this.dead ? 1 : 0) - this.fogOpacity) * Math.min(1, 3 * dt);
    this.fog.material.uniforms.opacity.value = this.fogOpacity;
    this.fog.material.uniforms.time.value = this.time;
    this.tickBubble(dt);
    this.idleAnimation(dt);
  }

  /** Niet aan het vechten (op de troon, in het filmpje, of verslagen). */
  idleAnimation(dt) {
    this.animateMode(dt);
    this.trail.update(dt); // anders blijft het laatste zwaard-windje hangen
  }

  /** Basis-animatie (stilstaan) en daarna onze eigen houding erover. */
  pose(dt, s, patch) {
    const p = this.puppet;
    p.animator.update(dt, { moving: false, onGround: true, attack: null, pickup: null, drink: null, spin: false, tuck: false, ...s });
    patch?.(p.rig);
    p.rig.apply?.();
  }

  animateMode(dt) {
    if (!dt) return;
    this.syncMaterials();
    this.nameTag.visible = this.mode !== 'troon' && this.mode !== 'opstaan'; // op de troon zie je hem van dichtbij
    const p = this.puppet;
    const t = this.time ?? 0;
    if (this.mode === 'opstaan' || this.mode === 'sprong') {
      this.introT += dt;
      if (this.introT >= LEAP_END) this.finishIntro();
      else this.mode = this.introT < STAND_TIME ? 'opstaan' : 'sprong';
    }
    switch (this.mode) {
      case 'troon': {
        this.position.copy(this.seatedPosition);
        this.mesh.rotation.y = 0;
        this.pose(dt, {}, (r) => {
          this.sitPose(r, 1);
          this.gesturePose(r, t);
        });
        if (this.gesture === 'zwaard') this.bladeSparks(dt, 0xffffff);
        break;
      }
      case 'opstaan': {
        const k = smooth(this.introT / STAND_TIME);
        this.position.lerpVectors(this.seatedPosition, this.standPosition, k);
        this.pose(dt, {}, (r) => this.sitPose(r, 1 - k));
        break;
      }
      case 'sprong': {
        const u = (this.introT - STAND_TIME) / (LEAP_END - STAND_TIME);
        const from = this.standPosition;
        this.position.lerpVectors(from, this.landing, u);
        this.position.y = from.y * (1 - u) + 7.5 * 4 * u * (1 - u);
        p.body.rotation.x = -Math.PI * 2 * smooth((u - 0.1) / 0.8); // een salto achterover
        this.pose(dt, { onGround: false, tuck: u > 0.15 && u < 0.85 });
        break;
      }
      case 'klaar': {
        // Staat in de arena en wenkt: "kom maar op!"
        this.position.y = 0;
        this.pose(dt, { wave: true });
        break;
      }
      case 'lachen': {
        this.pose(dt, {}, (r) => this.laughPose(r, t));
        break;
      }
      case 'verslagen': {
        if (!p.onGround && this.position.y > 0.01) {
          p.update(dt, ZERO_CONTROLS, [], NO_BOUNDS); // eerst nog naar beneden vallen
          p.events.length = 0;
          break;
        }
        // Op zijn billen op de grond, duizelig
        this.position.y += (-(OMAR.hipHeight - 0.25) - this.position.y) * Math.min(1, 6 * dt);
        p.body.rotation.set(0, 0, 0);
        this.pose(dt, {}, (r) => {
          r.legL.rotation.set(-1.4, 0, 0.15);
          r.legR.rotation.set(-1.4, 0, -0.15);
          r.kneeL.rotation.x = r.kneeR.rotation.x = 0.3;
          r.hips.rotation.x = -0.3;
          r.hips.rotation.z = Math.sin(t * 3) * 0.08; // wiebelen van duizeligheid
          r.armL.rotation.set(0.6, 0, 0.3);
          r.armR.rotation.set(0.6, 0, -0.3);
        });
        this.sparkTimer -= dt;
        if (this.sparkTimer <= 0 && this.effects) {
          this.sparkTimer = 0.12;
          const a = t * 5;
          const head = this.position.clone().add(new THREE.Vector3(Math.sin(a) * 0.45, 0.25 + OMAR.hipHeight + 0.95, Math.cos(a) * 0.45));
          this.effects.burst(head, 0xffe066, { count: 1, speed: 0.4, size: 0.14, life: 0.4, up: 0.3, gravity: 0 });
        }
        break;
      }
      default:
        break;
    }
  }

  /** Zithouding (k = 1 helemaal zitten, 0 = staan). */
  sitPose(r, k) {
    if (k <= 0) return;
    const lerp = (o, axis, v) => (o.rotation[axis] += (v - o.rotation[axis]) * k);
    lerp(r.legL, 'x', -1.5);
    lerp(r.legR, 'x', -1.5);
    lerp(r.kneeL, 'x', 1.5);
    lerp(r.kneeR, 'x', 1.5);
    lerp(r.hips, 'x', -0.1);
    lerp(r.armL, 'x', -0.6);
    lerp(r.armL, 'z', 0.15);
    lerp(r.elbowL, 'x', -0.9);
    // Zwaard rechtop naast zich (niet voor zijn gezicht)
    lerp(r.armR, 'x', -0.35);
    lerp(r.armR, 'z', -0.6);
    lerp(r.elbowR, 'x', -1.0);
    lerp(r.handR, 'x', 0.3);
  }

  /** Wat Omar doet op zijn troon terwijl hij praat. */
  gesturePose(r, t) {
    if (this.gesture === 'lachen') {
      r.hips.rotation.x = -0.25 + Math.sin(t * 30) * 0.05;
      r.armL.rotation.set(-0.5, 0, -0.3);
      r.elbowL.rotation.x = -1.6;
    } else if (this.gesture === 'zwaard') {
      r.armR.rotation.set(-2.9, 0, -0.1);
      r.elbowR.rotation.x = -0.1;
      r.handR.rotation.x = 0.2;
    } else if (this.gesture === 'wijzen') {
      r.armR.rotation.set(-1.5, 0, 0);
      r.elbowR.rotation.x = 0;
      r.handR.rotation.x = 1.4;
      r.hips.rotation.x = 0.1;
    }
  }

  /** Uitlachen: achterover, hand op de buik, zwaard omhoog. */
  laughPose(r, t) {
    r.hips.rotation.x = -0.25 + Math.sin(t * 30) * 0.04;
    r.armL.rotation.set(-0.5, 0, -0.3);
    r.elbowL.rotation.x = -1.6;
    r.armR.rotation.set(-2.6, 0, -0.3);
    r.elbowR.rotation.x = -0.2;
  }

  /** Glinsteringen langs het zwaard. */
  bladeSparks(dt, color, every = 0.1) {
    this.sparkTimer -= dt;
    if (this.sparkTimer > 0 || !this.effects) return;
    this.sparkTimer = every;
    this.mesh.updateMatrixWorld(true);
    const base = new THREE.Vector3();
    const tip = new THREE.Vector3();
    this.puppet.sword.getBladeWorld(base, tip);
    this.effects.burst(base.lerp(tip, 0.4 + Math.random() * 0.6), color, { count: 2, speed: 1.2, size: 0.07, life: 0.35, up: 0.5, gravity: 0 });
  }

  // ---------- Geraakt worden ----------

  hit(from, swingId, damage) {
    // Aan het rollen of dashen? Dan mis je hem echt.
    if (this.alive && this.awake && this.puppet.invincible) {
      if (this.lastDodgeId !== swingId) {
        this.lastDodgeId = swingId;
        this.taken.missed++;
        this.shout('Mis!', '#cfcfcf', 0.45);
        if (Math.random() < 0.35) this.say(pick(TAUNTS.mis));
      }
      return null;
    }
    const result = super.hit(from, swingId, damage);
    if (!result) return null;
    const p = this.puppet;
    this.taken.total += damage;
    this.taken.hits++;
    this.recentHits.push(this.time ?? 0);
    // Een beetje achteruit geduwd (niet tijdens zijn grote aanvallen: dan is hij te sterk)
    if (!SUPER_ARMOUR.includes(this.state) && !p.slamming && p.spinTimer <= 0 && p.dashTimer <= 0) {
      tmp.copy(this.position).sub(from).setY(0);
      if (tmp.lengthSq() > 1e-6) p.knockback.addScaledVector(tmp.normalize(), this.phase2 ? 2 : 3);
    }
    // Drinken wordt onderbroken (en zijn flesje is op!)
    if (p.drinkTimer > 0) {
      p.drinkTimer = 0;
      if (!p.healed) this.say('Mijn drankje!', 2, true);
    }
    if (!result.killed && damage >= this.info.hp * 0.08 && Math.random() < 0.6) this.say(pick(TAUNTS.au));
    if (result.killed) {
      this.dying = 0; // niet verdwijnen zoals andere bosses: Omar gaat duizelig op de grond zitten
      this.mode = 'verslagen';
      this.state = null;
      this.pending = null;
      this.trail.cut();
      p.fireTimer = 0;
      p.spinTimer = 0;
      p.dashTimer = 0;
      p.rollTimer = 0;
      p.drinkTimer = 0;
      p.slamming = false;
      p.body.rotation.set(0, 0, 0);
      p.stats.boost = 1;
      this.say('Au... sterretjes...', 4, true);
    }
    return result;
  }

  // ---------- Schade doen ----------

  /** Schade voor de speler: een deel van zijn maximale leven (dan is elke klap even eng, op elk level). */
  damageFor(player, kind) {
    const pct = OMAR.damagePct[kind] * (this.phase2 ? OMAR.phase2Damage : 1) * (this.puppet.fireTimer > 0 ? OMAR.fireDamage : 1);
    return Math.max(1, Math.round(player.maxHealth * pct));
  }

  /** Probeer de speler te raken (via main.js, dus rollen, dashen en je helm helpen gewoon). */
  hurt(ctx, kind) {
    const player = ctx.player;
    const before = player.health;
    if (!ctx.hurtPlayer(this.position, this.damageFor(player, kind))) return false;
    this.dealt[kind] = (this.dealt[kind] ?? 0) + (before - player.health);
    if (this.cd.raak <= 0 && player.alive) {
      this.cd.raak = 2.5;
      if (Math.random() < 0.5) this.say(pick(TAUNTS.raak), 1.6);
      else this.shout(pick(TAUNTS.raak));
    }
    return true;
  }

  /** Fase 2: Omar wordt boos! Eerst brullen (rode cirkel), dan een schokgolf. */
  onPhase2(ctx) {
    const p = this.puppet;
    p.stats.phase = 1;
    this.tintPhase2();
    p.fireTimer = 9999; // vanaf nu staat zijn zwaard altijd in brand
    this.pending = null;
    this.chained = false;
    this.trail.cut();
    this.say('NU WORD IK BOOS!', 2.5, true);
    this.shout('GRRR!', '#ff5a5a', 0.8);
    ctx.effects.warnCircle(this.position, 4, 0.6);
    this.setState('boos', 1.1);
    this.burstDone = false;
    this.log('boos');
  }

  // ---------- Het gevecht: elke frame ----------

  think(dt, ctx) {
    if (!dt) return; // het spel staat stil (filmpje): niks doen
    this.effects = ctx.effects;
    this.syncMaterials();
    this.trail.update(dt);
    this.tickBubble(dt);
    this.nameTag.visible = true;
    const p = this.puppet;
    const player = ctx.player;
    for (const key in this.cd) this.cd[key] -= dt;
    this.timer -= dt;
    this.stateT += dt;

    if (!player.alive) {
      this.laughAtPlayer(dt, ctx);
      return;
    }
    this.mode = 'vechten';

    const to = player.position.clone().sub(this.position).setY(0);
    const dist = to.length();
    const dir = dist > 1e-4 ? to.clone().divideScalar(dist) : p.facing;
    const ph = this.phase2 ? 1 : 0;
    const c = { move: new THREE.Vector3(), sprint: false, jumpPressed: false, faceTarget: dir.clone() };
    this.face = true; // na het bewegen naar de speler draaien?
    this.turnRate = 10;
    this.patch = null; // eigen houding bovenop de animatie
    p.stats.boost = 1;

    const threat = this.watchPlayer(player, dist);
    this.brain(dt, ctx, c, dist, dir, ph, threat);

    // Tijdens een klap draait hij mee tot de klap "vastligt": daarna kun je nog opzij stappen
    const swing = p.sword.attackProgress;
    if (swing !== null && swing > 0.3) c.faceTarget = null;
    // Zweven boven de grond (vlak voor de grondslag): de zwaartekracht even uit
    if (this.state === 'hangen') p.velocity.y = GRAVITY * dt;

    const sprinting = c.sprint && c.move.lengthSq() > 0 && p.onGround;
    if (sprinting && !this.sprinting) this.log('sprint');
    this.sprinting = sprinting;

    p.update(dt, c, [], NO_BOUNDS);

    if (this.face && p.rollTimer <= 0 && p.dashTimer <= 0 && p.spinTimer <= 0 && p.sword.attackProgress === null) {
      let diff = Math.atan2(dir.x, dir.z) - this.mesh.rotation.y;
      diff = Math.atan2(Math.sin(diff), Math.cos(diff));
      this.mesh.rotation.y += diff * Math.min(1, this.turnRate * dt);
    }
    this.applyPatch(dt);
    this.handleEvents(ctx);
    this.hitChecks(ctx);
    this.updateTrail();
    // Niet in de speler gaan staan
    const d = flatDist(player.position, this.position);
    if (d < 0.9 && p.dashTimer <= 0 && p.rollTimer <= 0 && p.onGround) {
      tmp.copy(this.position).sub(player.position).setY(0);
      if (tmp.lengthSq() < 1e-6) tmp.copy(p.facing).negate();
      this.position.addScaledVector(tmp.normalize(), 0.9 - d);
    }
  }

  /** Wat doet de speler? Geeft 'slag', 'wervel' of 'grondslag' terug als er net iets begint. */
  watchPlayer(player, dist) {
    const sword = player.sword;
    let threat = null;
    if (this.seenSwing === null) this.seenSwing = sword.swingId;
    if (sword.swingId !== this.seenSwing) {
      this.seenSwing = sword.swingId;
      if (sword.attackProgress !== null && sword.attackProgress < 0.45 && dist < sword.range + 1.4) threat = 'slag';
    }
    if (player.spinTimer > 0 && player.spinId !== this.seenSpin) {
      this.seenSpin = player.spinId;
      if (dist < 4.8) threat = 'wervel';
    }
    if (player.slamming && !this.seenSlam) {
      this.seenSlam = true;
      if (dist < 6.5) threat = 'grondslag';
    }
    if (!player.slamming) this.seenSlam = false;
    return threat;
  }

  /** Het brein: wat gaat Omar nu doen? */
  brain(dt, ctx, c, dist, dir, ph, threat) {
    const p = this.puppet;
    const player = ctx.player;
    const cd = this.cd;

    // Zie ik een klap aankomen? Soms rol ik weg (niet tijdens mijn eigen aanvallen, en niet als ik moe ben)
    if (threat && CAN_DODGE.includes(this.state) && !this.pending && cd.dodge <= 0) {
      const chance = threat === 'slag' ? OMAR.dodgeChance[ph] : OMAR.dodgeChance[ph] + 0.25;
      if (Math.random() < chance) this.pending = { t: OMAR.reaction[ph], threat };
      cd.dodge = OMAR.cooldown.dodge[ph];
    }
    if (this.pending) {
      this.pending.t -= dt;
      if (!CAN_DODGE.includes(this.state)) this.pending = null;
      else if (this.pending.t <= 0) {
        const threatNow = this.pending.threat;
        this.pending = null;
        if (this.dodge(dir, threatNow)) return;
      }
    }

    // Te vaak geraakt? Dan wil ik weg (of ik sla terug met een wervelslag)
    const now = this.time ?? 0;
    this.recentHits = this.recentHits.filter((t) => now - t < 1.6);
    const calm = this.state !== 'herstel' || this.stateT > this.stateTime * 0.4;
    if (this.recentHits.length >= OMAR.poise[ph] && calm && ['neutraal', 'aanlopen', 'herstel', 'uitdagen'].includes(this.state)) {
      this.recentHits.length = 0;
      if (dist < OMAR.spinRadius && p.spinCooldown <= 0 && p.onGround) {
        this.say('Laat me los!', 1.6, true);
        this.startSpin(ph, 0.32);
      } else this.dodge(dir, 'wervel');
      return;
    }

    switch (this.state) {
      case 'start': {
        // Even wenken: "kom dan!" (hij valt nog niet aan)
        this.patch = 'wenken';
        if (this.stateT <= dt) this.say('Kom dan, mannetje!', 2, true);
        if (this.timer <= 0) this.setState('neutraal');
        break;
      }

      case 'neutraal': {
        this.moveAround(c, dist, dir, ph, dt);
        // Jij drinkt een flesje? Daar komt Omar!
        if (player.drinkTimer > 0 && !this.seenDrink) {
          this.seenDrink = true;
          const mercy = cd.mercy > OMAR.cooldown.mercy - 3; // net "bijna!" geroepen: dan mag je even drinken
          if (!mercy && dist < 12 && p.dashCooldown <= 0 && Math.random() < (ph ? 0.95 : 0.8)) {
            this.say('Niet drinken!', 1.6, true);
            this.startDash(ph);
            break;
          }
        }
        if (player.drinkTimer <= 0) this.seenDrink = false;
        // Weinig leven over? Wegdashen en een slokje nemen (hij heeft een paar flesjes!)
        if (this.hp < this.info.hp * OMAR.drinkBelow && p.flasks > 0 && p.onGround && cd.drink <= 0) {
          cd.drink = OMAR.cooldown.drink[ph];
          this.say(pick(['Even een slokje...', 'Pauze! Hehe.', 'Ik heb nog meer flesjes hoor!']), 2, true);
          if (dist < 5 && p.dashCooldown <= 0) {
            p.tryDash(dir.clone().negate());
            this.log('ontwijk-dash');
          }
          this.setState('drinkenWeg', 1.4);
          break;
        }
        if (ph && !this.lowSaid && this.hp < this.info.hp * 0.2) {
          this.lowSaid = true;
          this.say('Wacht even... dit klopt niet!', 2.2, true);
        }
        // Jij bent bijna dood? Dan doet Omar even stoer (en kun jij drinken)
        if (!ph && player.health < player.maxHealth * 0.2 && cd.mercy <= 0) {
          cd.mercy = OMAR.cooldown.mercy;
          this.setState('uitdagen', 1.5);
          this.say('Bijna! Hehe. Drink maar gauw een flesje!', 2.4, true);
          this.log('uitdagen');
          break;
        }
        if (cd.think <= 0 && cd.gap <= 0) {
          cd.think = OMAR.think[ph];
          this.decide(dist, ph);
        }
        break;
      }

      case 'aanlopen': {
        // Naar je toe lopen (of rennen) en dan een combo
        c.move.copy(dir);
        c.sprint = dist > 5;
        this.face = false;
        if (dist <= 2.6) this.startCombo(ph);
        else if (this.timer <= 0) this.setState('neutraal');
        break;
      }

      case 'comboWindup': {
        // Zwaard naar achteren, het lemmet glinstert: zo meteen slaat hij!
        this.patch = 'uithalen';
        this.bladeSparks(dt, 0xffffff, 0.08);
        if (this.timer <= 0) {
          this.setState('combo');
          this.swingsLeft = OMAR.comboHits[ph];
        }
        break;
      }

      case 'combo': {
        const swing = p.sword.attackProgress;
        if (swing !== null) {
          // Een stapje naar voren tijdens de klap (in de richting waar hij al heen kijkt)
          if (swing < 0.5 && dist > 1.7) c.move.copy(p.facing);
          this.face = false;
          break;
        }
        if (p.isBusy) break;
        if (this.swingsLeft > 0) {
          if (p.tryAttack()) {
            this.swingsLeft--;
            this.log('slag');
            play('swing');
            this.trail.cut();
          }
          break;
        }
        // Klaar met slaan. Soms nog een wervelslag erachteraan (in fase 2 vaker)!
        if (dist < OMAR.spinRadius + 0.5 && p.spinCooldown <= 0 && Math.random() < OMAR.spinAfterCombo[ph]) {
          this.startSpin(ph, 0.32);
          break;
        }
        this.setState('herstel', this.after);
        break;
      }

      case 'dashWindup': {
        // Door de knieën, zwaard naar achteren, en een streep naar jou toe: "zo meteen flits ik!"
        this.patch = 'hurken';
        this.streakTimer = (this.streakTimer ?? 0) - dt;
        if (this.streakTimer <= 0) {
          this.streakTimer = 0.1;
          const from = this.position.clone().setY(0.25);
          const target = player.position.clone().setY(0.25);
          for (let i = 1; i <= 5; i++) ctx.effects.burst(from.clone().lerp(target, i / 6), 0x9be7ff, { count: 1, speed: 0.4, size: 0.1, life: 0.3, up: 0.2, gravity: 0 });
        }
        if (this.timer <= 0) {
          const aim = player.position.clone().addScaledVector(player.velocity, 0.15).sub(this.position).setY(0);
          if (p.tryDash(aim)) {
            this.log('dash');
            play('swing');
            this.dashHit = false;
            this.setState('dash');
          } else this.setState('neutraal');
        }
        break;
      }

      case 'dash': {
        this.face = false;
        if (!this.dashHit && dist < 1.3 && Math.abs(player.position.y - this.position.y) < 1.8 && this.hurt(ctx, 'dash')) this.dashHit = true;
        if (p.dashTimer <= 0) this.setState('dashSlag', 0.12);
        break;
      }

      case 'dashSlag': {
        // Na de dash snel omdraaien en nog één klap
        this.turnRate = 20;
        if (this.timer > 0) break;
        if (dist <= p.sword.range + OMAR.reach + 0.6 && p.tryAttack()) {
          this.log('slag');
          play('swing');
          this.trail.cut();
          this.swingsLeft = 0;
          this.after = OMAR.recover.dash[ph];
          this.setState('combo');
        } else if (dist < 8.5) {
          this.after = OMAR.recover.combo[ph];
          this.setState('aanlopen', 1.5);
        } else this.setState('herstel', OMAR.recover.dash[ph]);
        break;
      }

      case 'spinWindup': {
        // Zwaard opzij gestrekt, rode cirkel op de grond: zo meteen draait hij rond!
        this.patch = 'wervelKlaar';
        this.bladeSparks(dt, 0xd9a3ff, 0.06);
        if (this.timer <= 0) {
          if (p.trySpin()) {
            this.log('wervelslag');
            play('heavySwing');
            this.trail.cut();
            this.setState('spin');
          } else this.setState('herstel', 0.3);
        }
        break;
      }

      case 'spin': {
        this.face = false;
        if (p.spinTimer <= 0) this.setState('herstel', OMAR.recover.spin[ph]);
        break;
      }

      // ----- Dubbele sprong + grondslag -----
      case 'sprong1': {
        this.face = false;
        if (this.stateT <= dt) {
          c.jumpPressed = true;
          this.log('sprong');
          play('jump');
        }
        this.steerTo(c, this.target, 0.55 - this.stateT, ph);
        if (this.stateT >= 0.22) this.setState('sprong2');
        break;
      }

      case 'sprong2': {
        this.face = false;
        c.jumpPressed = true; // nog een keer: de dubbele sprong!
        this.steerTo(c, this.target, 0.33, ph);
        this.setState('zweven');
        break;
      }

      case 'zweven': {
        this.face = false;
        this.steerTo(c, this.target, Math.max(0.05, p.velocity.y / GRAVITY), ph);
        if (p.velocity.y <= 0.5 || this.stateT > 0.6) {
          // Bovenaan: even stil hangen met zijn zwaard omhoog, en een rode cirkel waar hij gaat landen
          const time = OMAR.windup.slam[ph];
          this.setState('hangen', time);
          ctx.effects.warnCircle(this.position.clone().setY(0), OMAR.slamRadius, time + 0.1);
          this.telegraph('charge');
        }
        break;
      }

      case 'hangen': {
        this.face = false;
        this.patch = 'zwaardOmhoog';
        this.bladeSparks(dt, 0xd04dff, 0.05);
        if (this.timer <= 0) {
          if (p.trySlam()) {
            this.log('grondslag');
            play('heavySwing');
          }
          this.slamLanded = false;
          this.setState('vallen');
        }
        break;
      }

      case 'vallen': {
        this.face = false;
        if (this.slamLanded || (p.onGround && this.stateT > 0.2)) {
          // In fase 2 soms nog een keer!
          if (ph && !this.chained && Math.random() < 0.5) {
            this.chained = true;
            this.startJumpSlam(ctx, ph, true);
          } else {
            this.chained = false;
            this.setState('herstel', OMAR.recover.slam[ph]);
          }
        }
        break;
      }

      case 'vuurWindup': {
        // Zwaard naar de hemel: het vat vlam!
        this.patch = 'zwaardOmhoog';
        if (Math.random() < 0.8) {
          this.mesh.updateMatrixWorld(true);
          const base = new THREE.Vector3();
          const tip = new THREE.Vector3();
          p.sword.getBladeWorld(base, tip);
          ctx.effects.burst(base.lerp(tip, Math.random()), Math.random() < 0.5 ? 0xff7a1a : 0xffd23a, { count: 2, speed: 1, size: 0.1, life: 0.45, up: 2, gravity: -0.2 });
        }
        if (this.timer <= 0) {
          if (p.tryFire()) {
            this.log('vuurzwaard');
            this.say('Mijn zwaard staat in de fik!', 2);
          }
          this.setState('neutraal');
          cd.gap = OMAR.gap[ph];
        }
        break;
      }

      case 'ontwijk': {
        // Wegrollen of wegdashen; daarna soms meteen terugslaan
        this.face = false;
        if (p.isBusy) break;
        if (this.counter && dist < 3.6) {
          this.counter = false;
          this.startCombo(ph, 0.7);
        } else {
          this.setState('neutraal');
          cd.gap = Math.max(cd.gap, 0.2);
        }
        break;
      }

      case 'drinkenWeg': {
        // Weg van jou, dan drinken
        this.face = false;
        if (!p.isBusy) {
          c.move.copy(dir).negate();
          c.sprint = true;
        }
        if ((dist >= 8 || this.timer <= 0) && !p.isBusy) {
          if (p.tryDrink()) {
            this.log('drinken');
            this.shout('Slokje!', '#7dff9a');
            this.setState('drinken');
          } else this.setState('neutraal');
        }
        break;
      }

      case 'drinken': {
        if (p.drinkTimer <= 0) {
          this.setState('neutraal');
          cd.gap = 0.3;
        }
        break;
      }

      case 'uitdagen': {
        // Stoer doen. Hij let even niet op: sla hem!
        this.patch = 'wenken';
        if (this.timer <= 0) {
          this.setState('neutraal');
          cd.gap = OMAR.gap[ph];
        }
        break;
      }

      case 'boos': {
        // Brullen met zijn armen omhoog, en dan BOEM: een schokgolf
        this.patch = 'boos';
        if (!this.burstDone && this.stateT >= 0.6) {
          this.burstDone = true;
          ctx.effects.shockwave(this.position, 0xd04dff, 4);
          ctx.effects.burst(this.center, 0xff3b6b, { count: 30, speed: 7, size: 0.16, life: 0.7, up: 2 });
          ctx.effects.shake(0.5);
          play('slam');
          if (dist < 4 && Math.abs(player.position.y - this.position.y) < 1.8) this.hurt(ctx, 'boos');
        }
        if (this.timer <= 0) {
          // En dan even weg om op adem te komen
          if (p.tryDash(dir.clone().negate())) this.log('ontwijk-dash');
          this.counter = false;
          this.setState('ontwijk');
        }
        break;
      }

      case 'herstel':
      default: {
        // Hijgen met zijn zwaard omlaag: nu is hij kwetsbaar!
        this.patch = 'moe';
        this.turnRate = 2.5; // draait langzaam: loop om hem heen!
        if (this.timer <= 0) {
          this.setState('neutraal');
          cd.gap = OMAR.gap[ph];
        }
        break;
      }
    }
  }

  /** Rondlopen als hij niet aanvalt: naar je toe sprinten, om je heen cirkelen of een stapje terug. */
  moveAround(c, dist, dir, ph, dt) {
    this.sideTimer -= dt;
    if (this.sideTimer <= 0) {
      this.side = -this.side;
      this.sideTimer = 2 + Math.random();
    }
    const tangent = new THREE.Vector3(dir.z, 0, -dir.x).multiplyScalar(this.side);
    if (dist > OMAR.sprintFrom) {
      c.move.copy(dir);
      c.sprint = true;
      this.face = false;
    } else if (dist > 3.2) {
      const radial = THREE.MathUtils.clamp((dist - 4.5) * 0.4, -0.6, 0.6);
      c.move.copy(tangent).multiplyScalar(0.8).addScaledVector(dir, radial);
      this.puppet.stats.boost = 0.6; // rustig om je heen lopen
    } else {
      c.move.copy(dir).multiplyScalar(-0.6).addScaledVector(tangent, 0.5);
      this.puppet.stats.boost = 0.5;
    }
  }

  /** Kies een aanval, afhankelijk van hoe ver je weg bent. */
  decide(dist, ph) {
    const p = this.puppet;
    const cd = this.cd;
    const options = [];
    const add = (move, weight) => options.push([move, move === this.lastMove ? weight * 0.5 : weight]);
    const canSpin = cd.spin <= 0 && p.spinCooldown <= 0;
    const canDash = cd.dash <= 0 && p.dashCooldown <= 0;
    const canSlam = cd.slam <= 0 && p.onGround;
    // Vuurzwaard aanzetten (in fase 2 staat hij altijd aan). Van dichtbij liever niet: dan kun jij hem slaan.
    if (!ph && cd.fire <= 0 && p.fireCooldown <= 0 && p.fireTimer <= 0) add('vuurzwaard', dist > 5 ? 1.2 : 0.5);
    if (dist <= 3.4) {
      add('combo', 0.45);
      if (canSpin) add('wervelslag', ph ? 0.55 : 0.45);
      if (canSlam) add('grondslag', 0.3);
      if (canDash) add('dash', 0.3); // dwars door je heen flitsen en van achteren slaan
      if (!ph && cd.taunt <= 0) add('uitdagen', 0.05);
    } else if (dist <= 8.5) {
      if (canDash) add('dash', 0.9);
      if (canSlam) add('grondslag', 0.45);
      add('aanlopen', 0.2);
    } else {
      if (canDash) add('dash', 0.8);
      if (canSlam) add('grondslag', 0.3);
      add(null, 0.25); // gewoon verder sprinten
    }
    let roll = Math.random() * options.reduce((sum, [, w]) => sum + w, 0);
    let move = null;
    for (const [m, w] of options) {
      roll -= w;
      if (roll <= 0) {
        move = m;
        break;
      }
    }
    if (!move) return;
    this.lastMove = move;
    if (move === 'combo') this.startCombo(ph);
    else if (move === 'wervelslag') this.startSpin(ph);
    else if (move === 'grondslag') this.startJumpSlam(null, ph);
    else if (move === 'dash') this.startDash(ph);
    else if (move === 'vuurzwaard') {
      cd.fire = OMAR.cooldown.fire;
      this.setState('vuurWindup', OMAR.windup.fire);
      this.shout('VUUR!', '#ff9a3c', 0.7);
      play('charge');
    }
    else if (move === 'aanlopen') {
      this.after = OMAR.recover.combo[ph];
      this.setState('aanlopen', 2);
    } else if (move === 'uitdagen') {
      cd.taunt = OMAR.cooldown.taunt[ph];
      this.setState('uitdagen', 1.2);
      this.say(pick(TAUNTS.uitdagen), 1.8);
      this.log('uitdagen');
    }
  }

  startCombo(ph, windupScale = 1) {
    this.after = OMAR.recover.combo[ph];
    this.setState('comboWindup', OMAR.windup.combo[ph] * windupScale);
    this.telegraph('glint');
    this.log('combo');
  }

  startSpin(ph, windup = OMAR.windup.spin[ph]) {
    this.cd.spin = OMAR.cooldown.spin[ph];
    this.setState('spinWindup', windup);
    this.effects?.warnCircle(this.position.clone().setY(0), OMAR.spinRadius, windup);
    this.telegraph('charge');
  }

  startDash(ph) {
    this.cd.dash = OMAR.cooldown.dash[ph];
    this.streakTimer = 0;
    this.setState('dashWindup', OMAR.windup.dash[ph]);
    this.telegraph('charge');
  }

  startJumpSlam(ctx, ph, again = false) {
    if (!again) this.cd.slam = OMAR.cooldown.slam[ph];
    // Mikken op waar jij straks bent (maar wel binnen de arena)
    const player = (ctx ?? this.lastCtx)?.player;
    const target = player ? player.position.clone().addScaledVector(player.velocity, 0.35).setY(0) : this.position.clone();
    const off = target.clone().sub(this.arena.center).setY(0);
    if (off.length() > this.arena.radius - 1.5) off.setLength(this.arena.radius - 1.5);
    this.target = this.arena.center.clone().add(off).setY(0);
    this.setState('sprong1');
  }

  /** In de lucht naar een plek sturen (een beetje extra snel als het ver is). */
  steerTo(c, target, timeLeft, ph) {
    if (!target) return;
    tmp.copy(target).sub(this.position).setY(0);
    const len = tmp.length();
    if (len < 0.3) return;
    c.move.copy(tmp).divideScalar(len);
    this.puppet.stats.boost = THREE.MathUtils.clamp(len / (Math.max(0.12, timeLeft) * BASE_SPEED * OMAR.speed[ph]), 0.2, 2.2);
  }

  /** Wegrollen (of wegdashen bij een grote aanval). */
  dodge(dir, threat) {
    const p = this.puppet;
    const away = dir.clone().negate();
    const side = Math.random() < 0.5 ? 1 : -1;
    let ok = false;
    if ((threat !== 'slag' || !p.onGround || Math.random() < OMAR.dashDodge) && p.dashCooldown <= 0) {
      ok = p.tryDash(away.clone().applyAxisAngle(UP, side * 0.4));
      if (ok) this.log('ontwijk-dash');
    }
    if (!ok) {
      ok = p.tryRoll(away.clone().applyAxisAngle(UP, side * (Math.PI / 3)));
      if (ok) this.log('rol');
    }
    if (!ok) return false;
    this.counter = threat === 'slag' && Math.random() < OMAR.counterChance;
    this.setState('ontwijk');
    return true;
  }

  /** De speler is dood: lekker uitlachen. */
  laughAtPlayer(dt, ctx) {
    const p = this.puppet;
    if (this.mode !== 'lachen') {
      this.mode = 'lachen';
      this.state = 'lachen';
      this.pending = null;
      this.trail.cut();
      p.spinTimer = p.rollTimer = p.dashTimer = p.drinkTimer = 0;
      p.body.rotation.set(0, 0, 0);
      p.stats.boost = 1;
      this.say('HAHAHA! Ik ben de baas!', 3, true);
    }
    if (!this.laughed) {
      this.laughed = true;
      play('laugh');
    }
    this.laughTimer -= dt;
    if (this.laughTimer <= 0) {
      this.laughTimer = 0.7;
      ctx.effects.floatText(this.center.setY(this.position.y + 2.4), Math.random() < 0.5 ? 'HA!' : 'HAHA!', '#d9a3ff', 0.55);
    }
    if (p.onGround) this.animateMode(dt);
    else {
      p.update(dt, ZERO_CONTROLS, [], NO_BOUNDS);
      p.events.length = 0;
    }
  }

  /** Eigen houdingen bovenop de gewone animatie (zo zie je wat hij gaat doen). */
  applyPatch(dt) {
    const r = this.puppet.rig;
    if (!this.patch || !r) return;
    const t = this.time ?? 0;
    switch (this.patch) {
      case 'wenken': // zwaard boven zijn hoofd heen en weer: "kom dan!"
        r.armR.rotation.set(-0.3 + Math.sin(t * 9) * 0.25, 0, -2.6);
        r.elbowR.rotation.x = -0.2;
        r.armL.rotation.set(-1.3, 0, 0.2); // en met zijn andere hand wenken
        r.elbowL.rotation.x = -1.2 - Math.sin(t * 10) * 0.5;
        break;
      case 'uithalen': // zwaard ver naar achteren
        r.armR.rotation.set(-1.2, 0, -1.4);
        r.elbowR.rotation.x = -0.9;
        r.handR.rotation.x = 1.0;
        r.hips.rotation.y = -0.45;
        r.armL.rotation.set(-0.8, 0, 0.3);
        break;
      case 'hurken': // door de knieën, klaar om te flitsen
        r.hips.rotation.x = 0.45;
        r.legL.rotation.x = -0.6;
        r.legR.rotation.x = 0.3;
        r.kneeL.rotation.x = r.kneeR.rotation.x = 0.9;
        r.armR.rotation.set(0.5, 0, -0.4);
        r.handR.rotation.x = -0.8;
        r.armL.rotation.set(-0.9, 0, 0.3);
        break;
      case 'wervelKlaar': // zwaard opzij gestrekt, lijf opgedraaid
        r.armR.rotation.set(-1.45, 0, -1.4);
        r.elbowR.rotation.x = 0;
        r.handR.rotation.x = 1.4;
        r.armL.rotation.z = 1.2;
        r.kneeL.rotation.x = r.kneeR.rotation.x = 0.45;
        r.hips.rotation.y = -0.7;
        break;
      case 'zwaardOmhoog': // zwaard recht naar de hemel
        r.armR.rotation.set(-2.9, 0, -0.1);
        r.elbowR.rotation.x = -0.1;
        r.handR.rotation.x = 0.2;
        break;
      case 'moe': // hijgen, zwaard omlaag
        r.hips.rotation.x = 0.35 + Math.sin(t * 7) * 0.06;
        r.armR.rotation.set(0.15, 0, -0.15);
        r.elbowR.rotation.x = -0.2;
        r.handR.rotation.x = -0.7;
        r.armL.rotation.set(0.25, 0, 0.2);
        r.kneeL.rotation.x = r.kneeR.rotation.x = 0.3;
        this.sweatTimer = (this.sweatTimer ?? 0) - dt;
        if (this.sweatTimer <= 0 && this.effects) {
          this.sweatTimer = 0.25;
          this.effects.burst(this.position.clone().setY(this.position.y + 2.05), 0x8fd8ff, { count: 1, speed: 1.2, size: 0.08, life: 0.5, up: 1.5 });
        }
        break;
      case 'boos': // armen omhoog en brullen (en trillen)
        r.armL.rotation.set(-2.7, 0, 0.5);
        r.armR.rotation.set(-2.7, 0, -0.5);
        r.elbowL.rotation.x = r.elbowR.rotation.x = -0.3;
        r.hips.rotation.x = -0.3;
        r.hips.rotation.z = Math.sin(t * 40) * 0.04;
        if (this.effects && Math.random() < 0.6) this.effects.burst(this.center, 0xff3b3b, { count: 1, speed: 3, size: 0.1, life: 0.4, up: 2 });
        break;
      default:
        break;
    }
    r.apply?.();
  }

  /** Dingen die de pop deed (dash, landen, drinken...): effecten erbij. */
  handleEvents(ctx) {
    const p = this.puppet;
    for (const ev of p.events) {
      if (ev === 'dash') ctx.effects.burst(this.position.clone().setY(this.position.y + 0.9), 0xb04dff, { count: 16, speed: 3, size: 0.1, life: 0.35, gravity: 0 });
      else if (ev === 'roll') play('swing');
      else if (ev === 'doubleJump') {
        play('jump');
        this.log('dubbele sprong');
        ctx.effects.shockwave(this.position, 0xd9a3ff, 1.2);
      } else if (ev === 'slamLand') this.slamImpact(ctx);
      else if (ev === 'heal') {
        const heal = Math.round(this.info.hp * OMAR.drinkHeal);
        this.hp = Math.min(this.info.hp, this.hp + heal);
        play('heal');
        ctx.effects.burst(this.center, 0x7dff9a, { count: 18, speed: 3, size: 0.09, life: 0.7, up: 3, gravity: -0.3 });
        ctx.effects.floatText(this.center.setY(this.position.y + 2.3), `+${heal}`, '#7dff9a', 0.55);
        this.say('Ahh, lekker! Nu ben ik weer sterk!', 2.2, true);
      } else if (ev === 'fire') {
        play('charge');
        ctx.effects.burst(this.center, 0xff7a1a, { count: 24, speed: 4, size: 0.12, life: 0.6, up: 3, gravity: -0.2 });
      }
    }
    p.events.length = 0;
  }

  /** BOEM: de grondslag komt neer. Spring erover of sta buiten de rode cirkel! */
  slamImpact(ctx) {
    const pos = this.position.clone().setY(0);
    this.slamLanded = true;
    play('slam');
    ctx.effects.shockwave(pos, 0xb04dff, OMAR.slamRadius);
    ctx.effects.burst(pos.clone().setY(0.3), 0xb04dff, { count: 26, speed: 8, size: 0.16, life: 0.7, up: 2 });
    ctx.effects.burst(pos.clone().setY(0.3), 0x9a8f7a, { count: 14, speed: 6, size: 0.18, life: 0.6, up: 2 });
    const player = ctx.player;
    const d = flatDist(player.position, pos);
    ctx.effects.shake(d < OMAR.slamRadius * 2 ? 0.55 : 0.2);
    if (d <= OMAR.slamRadius && player.position.y < 1.2) this.hurt(ctx, 'grondslag');
  }

  /** Raakt zijn zwaard of zijn wervelslag de speler? */
  hitChecks(ctx) {
    const p = this.puppet;
    const player = ctx.player;
    if (!player.alive || Math.abs(player.position.y - this.position.y) > 1.8) return;
    const toPlayer = player.position.clone().sub(this.position).setY(0);
    const dist = toPlayer.length();
    const sword = p.sword;
    if (sword.isHitting && this.lastSwordHit !== sword.swingId) {
      const facing = p.facing;
      if (dist <= sword.range + OMAR.reach && (dist < 1.2 || toPlayer.normalize().dot(facing) > 0.1)) {
        if (this.hurt(ctx, 'slag')) this.lastSwordHit = sword.swingId;
      }
    }
    if (p.spinTimer > 0 && this.lastSpinHit !== p.spinId && dist <= OMAR.spinRadius && Math.abs(player.position.y - this.position.y) < 1.6) {
      if (this.hurt(ctx, 'wervelslag')) this.lastSpinHit = p.spinId;
    }
  }

  /** Zwaard-windje en vlammetjes (net als bij de speler in main.js). */
  updateTrail() {
    const p = this.puppet;
    const t = p.sword.attackProgress;
    const swinging = (t !== null && t > 0.2 && t < 0.9) || p.spinTimer > 0;
    if (!swinging && p.fireTimer <= 0) return;
    this.mesh.updateMatrixWorld(true);
    const base = new THREE.Vector3();
    const tip = new THREE.Vector3();
    if (swinging) {
      p.sword.getBladeWorld(base, tip);
      this.trail.setColor(p.fireTimer > 0 ? 0xff7a1a : p.spinTimer > 0 ? 0xd9a3ff : 0xb04dff);
      this.trail.addSample(base, tip);
    }
    if (p.fireTimer > 0 && this.effects && Math.random() < 0.7) {
      p.sword.getBladeWorld(base, tip);
      this.effects.burst(base.lerp(tip, Math.random()), Math.random() < 0.5 ? 0xff7a1a : 0xffd23a, { count: 1, speed: 0.6, size: 0.09, life: 0.4, up: 1.6, gravity: -0.2 });
    }
  }

  update(dt, ctx) {
    this.lastCtx = ctx;
    super.update(dt, ctx);
  }
}

// Omar meldt zich aan bij de bosses: de arena met id 'omar' (in het kasteel) krijgt hem
BOSS_CLASSES.omar = OmarFighter;
