import * as THREE from 'three';
import { Boss, BOSS_INFO, BOSS_CLASSES } from './bosses.js';
import { Player, otherPlayable } from './player.js';
import { SwordTrail } from './trail.js';
import { play } from './audio.js';
import { SAVE_KEY } from './levels.js';

// Omar de Baas: de baas van het hele spel. Hij woont in zijn Gekke Kasteel (castle.js) en vecht in de arena.
// Omar is een echte "speler": hij heeft hetzelfde lijf, dezelfde animaties en dezelfde krachten als jij
// (dash, wervelslag, dubbele sprong, grondslag, vuurzwaard, rollen, drinken). Alleen bestuurt de computer hem.
// Hij draagt altijd het personage dat jij NIET koos, de Kroon van Omar en het Diamanten zwaard.
//
// Het filmpje eromheen (troon, sprong, winnen, verliezen) regelt omar.js.

// ---------- Instellingen: hiermee maak je Omar makkelijker of moeilijker ----------
export const OMAR = {
  level: 15, // alleen om op te scheppen in de gesprekken
  size: 1.12, // Omar is iets groter dan jij
  hipHeight: 0.95, // hoogte van zijn heupen (om hem goed op de troon te laten zitten)
  hp: { base: 1200, perLevel: 80 }, // leven = base + perLevel × jouw level
  speed: [1.1, 1.25], // hoe snel hij loopt [fase 1, fase 2] (1 = net zo snel als jij)
  // Hoeveel van JOUW leven een klap kost (0.08 = 8%)
  damagePct: { slash: 0.08, dash: 0.1, spin: 0.12, slam: 0.15, burst: 0.05 },
  phase2Damage: 1.2, // in fase 2 doet alles 20% meer pijn
  fireDamage: 1.35, // met zijn vuurzwaard 35% meer
  comboHits: [2, 3], // zoveel klappen achter elkaar [fase 1, fase 2]
  windup: [0.4, 0.3], // zo lang laat hij eerst zien wat hij gaat doen (seconden)
  recover: [0.8, 0.6], // zo lang staat hij daarna stil: dan kun jij slaan!
  spinCooldown: [5, 3.5], // wervelslag
  dashCooldown: [4, 3], // dash
};

const tmp = new THREE.Vector3();
const ZERO_CONTROLS = { move: new THREE.Vector3(), sprint: false, jumpPressed: false, faceTarget: null };
const NO_BOUNDS = { x: 999, z: 999 }; // de arena houdt hem binnen (zie Boss.update)

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
 */
export class OmarStats {
  constructor(character) {
    this.data = { character, weapon: 'diamant', helmet: 'kroon', level: OMAR.level };
    this.phase = 0; // 0 = fase 1, 1 = fase 2
  }

  get level() { return OMAR.level; }
  get maxHealth() { return 9999; }
  get maxStamina() { return 999; }
  get flasksMax() { return 1; }
  get damageMultiplier() { return 1; }
  get speedMultiplier() { return OMAR.speed[this.phase]; }
  get defenseBonus() { return 0; }
  get healBonus() { return 0; }
  hasPower() { return true; }
}

/** Naambordje "OMAR" boven zijn hoofd. */
function makeNameTag() {
  const canvas = document.createElement('canvas');
  canvas.width = 256;
  canvas.height = 64;
  const ctx = canvas.getContext('2d');
  ctx.font = 'bold 44px system-ui, sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.lineWidth = 8;
  ctx.strokeStyle = '#5a1a8a';
  ctx.strokeText('OMAR', 128, 34);
  ctx.fillStyle = '#ffd23a';
  ctx.fillText('OMAR', 128, 34);
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
    // De "pop": een echte Player, maar bestuurd door de computer
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
    this.throne = new THREE.Vector3(0, 2.2, -26.6); // bovenkant van het kussen (wordt gezet door omar.js)
    this.landing = new THREE.Vector3(0, 0, -6);
    this.effects = null; // wordt gezet door omar.js (voor vonken als het spel stilstaat)
    this.moveLog = []; // welke aanvallen hij deed (handig om te testen)
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

  /** Klaarzetten voor een gevecht tegen deze speler: leven hangt af van jouw level, kostuum van jouw held. */
  prepare(stats) {
    this.info.hp = OMAR.hp.base + OMAR.hp.perLevel * stats.level;
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

  /** Alles terug zoals aan het begin: op de troon, vol leven, fase 1. */
  resetFight() {
    super.resetFight();
    if (!this.puppet) return; // (de Boss-constructor roept dit al aan voordat de pop er is)
    this.dead = false;
    this.dying = 0;
    this.hp = this.info.hp;
    this.puppet.stats.phase = 0;
    this.puppet.respawnAt(this.seatedPosition);
    this.mesh.rotation.y = 0; // kijkt naar de arena (het zuiden)
    this.mesh.scale.setScalar(OMAR.size);
    this.mesh.visible = true;
    this.mode = 'troon'; // troon | opstaan | sprong | klaar | vechten | lachen | verslagen
    this.nameTag.visible = false;
    this.gesture = 'zitten'; // op de troon: zitten | lachen | zwaard | wijzen
    this.introT = 0;
    this.state = 'start';
    this.timer = 1.2;
    this.cooldown = 0;
    this.spinCd = 2;
    this.dashCd = 2;
    this.swingsLeft = 0;
    this.lastSwordHit = null;
    this.lastSpinHit = null;
    this.lastDodgeId = null;
    this.tauntTimer = 0;
    this.laughTimer = 0;
    this.laughed = false;
    this.sparkTimer = 0;
    this.trail?.cut();
    // Fase-2 kleur weer weg
    this.materials.forEach((entry, i) => this.baseEmissive?.[i] && entry.color.copy(this.baseEmissive[i]));
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
  bladeSparks(dt, color) {
    this.sparkTimer -= dt;
    if (this.sparkTimer > 0 || !this.effects) return;
    this.sparkTimer = 0.1;
    this.mesh.updateMatrixWorld(true);
    const base = new THREE.Vector3();
    const tip = new THREE.Vector3();
    this.puppet.sword.getBladeWorld(base, tip);
    this.effects.burst(base.lerp(tip, 0.4 + Math.random() * 0.6), color, { count: 2, speed: 1.2, size: 0.07, life: 0.35, up: 0.5, gravity: 0 });
  }

  // ---------- Het gevecht ----------

  hit(from, swingId, damage) {
    // Aan het rollen of dashen? Dan mis je hem echt.
    if (this.alive && this.awake && this.puppet.invincible) {
      if (this.lastDodgeId !== swingId && this.effects) {
        this.lastDodgeId = swingId;
        this.effects.floatText(this.center.setY(this.position.y + 2.3), 'Mis!', '#cfcfcf', 0.45);
      }
      return null;
    }
    const result = super.hit(from, swingId, damage);
    if (!result) return null;
    const p = this.puppet;
    if (p.spinTimer <= 0 && p.dashTimer <= 0 && !p.slamming) {
      tmp.copy(this.position).sub(from).setY(0);
      if (tmp.lengthSq() > 1e-6) p.knockback.addScaledVector(tmp.normalize(), 3);
    }
    if (result.killed) {
      this.dying = 0; // niet verdwijnen zoals andere bosses: Omar gaat duizelig op de grond zitten
      this.mode = 'verslagen';
      this.state = null;
      this.trail.cut();
      p.fireTimer = 0;
      p.spinTimer = 0;
      p.dashTimer = 0;
      p.rollTimer = 0;
      p.body.rotation.set(0, 0, 0);
    }
    return result;
  }

  /** Schade voor de speler: een deel van zijn maximale leven (dan is elke klap even eng, op elk level). */
  damageFor(player, kind) {
    const pct = OMAR.damagePct[kind] * (this.phase2 ? OMAR.phase2Damage : 1) * (this.puppet.fireTimer > 0 ? OMAR.fireDamage : 1);
    return Math.max(1, Math.round(player.maxHealth * pct));
  }

  onPhase2(ctx) {
    this.puppet.stats.phase = 1;
    this.tintPhase2();
    this.puppet.fireTimer = 9999; // vanaf nu staat zijn zwaard altijd in brand
    ctx.effects.floatText(this.center.setY(this.position.y + 2.4), 'NU WORD IK BOOS!', '#ff5a5a', 0.8);
    ctx.effects.shockwave(this.position, 0xd04dff, 4);
    if (flatDist(ctx.player.position, this.position) < 4) ctx.hurtPlayer(this.position, this.damageFor(ctx.player, 'burst'));
    this.state = 'herstel';
    this.timer = 0.6;
  }

  think(dt, ctx) {
    if (!dt) return; // het spel staat stil (filmpje): niks doen
    this.effects = ctx.effects;
    this.syncMaterials();
    this.trail.update(dt);
    const p = this.puppet;
    const player = ctx.player;
    const to = player.position.clone().sub(this.position).setY(0);
    const dist = to.length();
    const ph = this.phase2 ? 1 : 0;
    const controls = { move: new THREE.Vector3(), sprint: false, jumpPressed: false, faceTarget: to.clone() };
    let face = true; // naar de speler draaien
    this.timer -= dt;
    this.cooldown -= dt;
    this.spinCd -= dt;
    this.dashCd -= dt;

    if (!player.alive) {
      // Gewonnen: lekker uitlachen
      this.mode = 'lachen';
      this.laughTimer -= dt;
      if (!this.laughed) {
        this.laughed = true;
        play('laugh');
      }
      if (this.laughTimer <= 0) {
        this.laughTimer = 0.7;
        ctx.effects.floatText(this.center.setY(this.position.y + 2.4), Math.random() < 0.5 ? 'HA!' : 'HAHA!', '#d9a3ff', 0.55);
      }
      if (p.onGround) {
        this.animateMode(dt);
        return;
      }
      p.update(dt, ZERO_CONTROLS, [], NO_BOUNDS);
      return;
    }
    this.mode = 'vechten';

    switch (this.state) {
      case 'start': {
        // Even wenken: "kom dan!" (hij valt nog niet aan)
        if (this.timer <= 0) {
          this.state = 'neutraal';
          this.cooldown = 0.4;
        }
        break;
      }
      case 'neutraal': {
        if (dist > 2.3) {
          controls.move.copy(to).normalize();
          controls.sprint = dist > 9;
        }
        if (this.cooldown > 0) break;
        if (dist < 3.4) {
          if (this.spinCd <= 0 && Math.random() < 0.35) {
            this.state = 'spinWindup';
            this.timer = OMAR.windup[ph] + 0.1;
            ctx.effects.warnCircle(this.position, 3.6, this.timer);
            play('charge');
          } else {
            this.state = 'comboWindup';
            this.timer = OMAR.windup[ph];
            this.swingsLeft = OMAR.comboHits[ph];
          }
        } else if (dist < 10 && this.dashCd <= 0 && Math.random() < 0.5) {
          this.state = 'dashWindup';
          this.timer = OMAR.windup[ph] + 0.05;
          play('charge');
        }
        break;
      }
      case 'comboWindup': {
        if (this.timer <= 0) this.state = 'combo';
        break;
      }
      case 'combo': {
        if (p.sword.attackProgress !== null || p.isBusy) break;
        if (this.swingsLeft > 0) {
          if (p.tryAttack()) {
            this.swingsLeft--;
            this.moveLog.push('slag');
            play('swing');
            this.trail.cut();
            if (dist > 1.4) controls.move.copy(to).normalize().multiplyScalar(0.6); // stapje naar voren
          }
        } else {
          this.state = 'herstel';
          this.timer = OMAR.recover[ph];
        }
        break;
      }
      case 'spinWindup': {
        if (this.timer <= 0 && p.trySpin()) {
          this.moveLog.push('wervelslag');
          play('heavySwing');
          this.trail.cut();
          this.spinCd = OMAR.spinCooldown[ph];
          this.state = 'spin';
        }
        break;
      }
      case 'spin': {
        face = false;
        if (p.spinTimer <= 0) {
          this.state = 'herstel';
          this.timer = OMAR.recover[ph];
        }
        break;
      }
      case 'dashWindup': {
        if (this.timer <= 0) {
          const aim = player.position.clone().addScaledVector(player.velocity, 0.15).sub(this.position).setY(0);
          if (p.tryDash(aim)) {
            this.moveLog.push('dash');
            play('swing');
            this.dashCd = OMAR.dashCooldown[ph];
            this.dashHit = false;
            this.state = 'dash';
          } else this.state = 'neutraal';
        }
        break;
      }
      case 'dash': {
        face = false;
        if (!this.dashHit && dist < 1.3 && ctx.hurtPlayer(this.position, this.damageFor(player, 'dash'))) this.dashHit = true;
        if (p.dashTimer <= 0) {
          this.state = 'combo';
          this.swingsLeft = 1;
        }
        break;
      }
      case 'herstel':
      default: {
        if (this.timer <= 0) {
          this.state = 'neutraal';
          this.cooldown = this.phase2 ? 0.5 : 0.9;
        }
        break;
      }
    }

    p.update(dt, controls, [], NO_BOUNDS);
    if (face && controls.move.lengthSq() === 0 && p.rollTimer <= 0 && p.dashTimer <= 0) {
      let diff = Math.atan2(to.x, to.z) - this.mesh.rotation.y;
      diff = Math.atan2(Math.sin(diff), Math.cos(diff));
      this.mesh.rotation.y += diff * Math.min(1, 10 * dt);
    }
    // Houdingen die laten zien wat er komt (bovenop de gewone animatie)
    if (this.state === 'comboWindup' || this.state === 'spinWindup' || this.state === 'dashWindup') {
      const r = p.rig;
      if (this.state === 'comboWindup') r.armR.rotation.set(-1.2, 0, -1.2);
      if (this.state === 'spinWindup') r.armR.rotation.set(-1.45, 0, -1.4);
      if (this.state === 'dashWindup') {
        r.hips.rotation.x = 0.45;
        r.kneeL.rotation.x = r.kneeR.rotation.x = 0.8;
        r.armR.rotation.set(0.4, 0, -0.3);
      }
      r.apply?.();
      this.bladeSparks(dt, 0xffffff);
    } else if (this.state === 'start') {
      // Wenken met zijn zwaard boven zijn hoofd
      const r = p.rig;
      r.armR.rotation.set(-0.3 + Math.sin((this.time ?? 0) * 9) * 0.25, 0, -2.6);
      r.elbowR.rotation.x = -0.2;
      r.apply?.();
    }

    this.handleEvents(ctx);
    this.hitChecks(ctx, dist);
    this.updateTrail(dt);
  }

  /** Dingen die de pop deed (dash, landen...): effecten erbij. */
  handleEvents(ctx) {
    const p = this.puppet;
    for (const ev of p.events) {
      if (ev === 'dash') ctx.effects.burst(this.position.clone().setY(this.position.y + 0.9), 0xb04dff, { count: 16, speed: 3, size: 0.1, life: 0.35, gravity: 0 });
      else if (ev === 'doubleJump') {
        play('jump');
        ctx.effects.shockwave(this.position, 0xd9a3ff, 1.2);
      } else if (ev === 'slamLand') {
        play('slam');
        ctx.effects.shockwave(this.position, 0xb04dff, 4.5);
        ctx.effects.shake(0.55);
        if (flatDist(ctx.player.position, this.position) < 4.9 && ctx.player.position.y < 1.6) ctx.hurtPlayer(this.position, this.damageFor(ctx.player, 'slam'));
      } else if (ev === 'heal') {
        const heal = Math.round(this.info.hp * 0.2);
        this.hp = Math.min(this.info.hp, this.hp + heal);
        play('heal');
        ctx.effects.floatText(this.center.setY(this.position.y + 2.3), `+${heal}`, '#7dff9a', 0.55);
      }
    }
    p.events.length = 0;
  }

  /** Raakt Omar de speler? */
  hitChecks(ctx, dist) {
    const p = this.puppet;
    const player = ctx.player;
    if (Math.abs(player.position.y - this.position.y) > 1.8) return;
    const sword = p.sword;
    if (sword.isHitting && this.lastSwordHit !== sword.swingId) {
      const toPlayer = player.position.clone().sub(this.position).setY(0);
      const facing = new THREE.Vector3(Math.sin(this.mesh.rotation.y), 0, Math.cos(this.mesh.rotation.y));
      if (dist <= sword.range * OMAR.size + 0.45 && (dist < 1.2 || toPlayer.normalize().dot(facing) > 0.1)) {
        if (ctx.hurtPlayer(this.position, this.damageFor(player, 'slash'))) this.lastSwordHit = sword.swingId;
      }
    }
    if (p.spinTimer > 0 && this.lastSpinHit !== p.spinId && dist <= 3.6 + 0.45) {
      if (ctx.hurtPlayer(this.position, this.damageFor(player, 'spin'))) this.lastSpinHit = p.spinId;
    }
  }

  /** Zwaard-windje en vlammetjes (net als bij de speler in main.js). */
  updateTrail(dt) {
    const p = this.puppet;
    const t = p.sword.attackProgress;
    if ((t !== null && t > 0.2 && t < 0.9) || p.spinTimer > 0 || p.fireTimer > 0) this.mesh.updateMatrixWorld(true);
    const base = new THREE.Vector3();
    const tip = new THREE.Vector3();
    if ((t !== null && t > 0.2 && t < 0.9) || p.spinTimer > 0) {
      p.sword.getBladeWorld(base, tip);
      this.trail.setColor(p.fireTimer > 0 ? 0xff7a1a : p.spinTimer > 0 ? 0xd9a3ff : 0xb04dff);
      this.trail.addSample(base, tip);
    }
    if (p.fireTimer > 0 && this.effects && Math.random() < 0.7) {
      p.sword.getBladeWorld(base, tip);
      this.effects.burst(base.lerp(tip, Math.random()), Math.random() < 0.5 ? 0xff7a1a : 0xffd23a, { count: 1, speed: 0.6, size: 0.09, life: 0.4, up: 1.6, gravity: -0.2 });
    }
  }
}

// Omar meldt zich aan bij de bosses: de arena met id 'omar' (in het kasteel) krijgt hem
BOSS_CLASSES.omar = OmarFighter;
