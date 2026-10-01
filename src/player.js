import * as THREE from 'three';
import { loadGLB } from './assets.js';
import { Sword } from './sword.js';
import { buildCharacter } from './character.js';
import { CharacterAnimator } from './animator.js';
import { HELMETS, createHelmetMesh } from './gear.js';
import { POWERS } from './stats.js';

// Instellingen van de speler — speel hiermee om het gevoel te veranderen!
const SPEED = 6.5; // loopsnelheid (meter per seconde)
const SPRINT = 1.6; // zoveel keer sneller als je sprint (Shift ingedrukt houden)
const JUMP_SPEED = 9; // hoe hard je omhoog springt
const GRAVITY = 25; // zwaartekracht
const RADIUS = 0.45; // dikte van de speler
const HEIGHT = 1.6; // lengte van de speler
const INVULNERABLE_TIME = 0.6; // na een klap ben je even onkwetsbaar
const STAMINA_REGEN = 32; // stamina per seconde terug
const STAMINA_DELAY = 0.6; // zo lang na iets doen voordat stamina terugkomt

const ROLL = { time: 0.5, speed: 9.5, stamina: 16, iframes: [0.03, 0.38] }; // rollen (Shift kort indrukken)
const DASH = { time: 0.22, speed: 27 };
const SPIN_TIME = 0.55;
const DRINK = { time: 0.95, healAt: 0.5, heal: 0.45 }; // een flesje drinken: 45% van je leven terug
const SLAM_SPEED = 32;

// Eigen 3D-poppetje: zet een .glb-bestand op deze plek.
// Staat het bestand er niet, dan speel je met het poppetje uit character.js.
const MODEL_URL = 'models/speler.glb';
const MODEL_TURN = 0; // kijkt het model de verkeerde kant op? Probeer Math.PI of Math.PI / 2
const MODEL_HAND = [-0.34, 0.55, 0.14]; // alleen voor modellen zonder rig: waar de rechterhand zit
const PICKUP_TIME = 0.6; // hoe lang bukken en oppakken duurt (seconden)

export class Player {
  /**
   * @param {THREE.Scene} scene
   * @param {import('./stats.js').Stats} stats
   */
  constructor(scene, stats) {
    this.stats = stats;
    this.mesh = new THREE.Group(); // positie + draaiing (kijkrichting)
    this.body = new THREE.Group(); // draait bij rollen en de wervelslag (om het midden van het lijf)
    this.body.position.y = 0.8;
    this.inner = new THREE.Group();
    this.inner.position.y = -0.8;
    this.mesh.add(this.body);
    this.body.add(this.inner);
    this.sword = new Sword();

    // Het poppetje uit character.js (wordt vervangen als er een 3D-model is)
    const character = buildCharacter();
    this.placeholder = character.group;
    this.inner.add(this.placeholder);
    this.useRig(character.rig);

    scene.add(this.mesh);

    this.velocity = new THREE.Vector3();
    this.knockback = new THREE.Vector3();
    this.onGround = false;
    this.moving = false;
    this.mixer = null;
    this.actions = {};
    this.currentAction = null;
    this.spawnPoint = new THREE.Vector3(0, 0, 8);
    this.reset();
    this.loadModel();
  }

  get position() {
    return this.mesh.position;
  }

  get maxHealth() {
    return this.stats.maxHealth;
  }

  get maxStamina() {
    return this.stats.maxStamina;
  }

  get alive() {
    return this.health > 0;
  }

  /** Richting waarin de speler kijkt (op de grond). */
  get facing() {
    return new THREE.Vector3(Math.sin(this.mesh.rotation.y), 0, Math.cos(this.mesh.rotation.y));
  }

  /** Bezig met iets waardoor je niet kunt slaan of rollen? */
  get isBusy() {
    return this.pickupTimer > 0 || this.rollTimer > 0 || this.dashTimer > 0 || this.drinkTimer > 0 || this.spinTimer > 0 || this.slamming || this.resting;
  }

  /** Kan nu geen schade krijgen? (rollen, dashen, net geraakt) */
  get invincible() {
    const rollT = ROLL.time - this.rollTimer;
    const rolling = this.rollTimer > 0 && rollT > ROLL.iframes[0] && rollT < ROLL.iframes[1];
    return rolling || this.dashTimer > 0 || this.invulnerable > 0;
  }

  /** Volledig herstellen en neerzetten op een plek (bijv. bij een Plek van Genade). */
  respawnAt(position) {
    this.spawnPoint.copy(position);
    this.reset();
  }

  reset() {
    this.health = this.maxHealth;
    this.stamina = this.maxStamina;
    this.staminaDelay = 0;
    this.flasks = this.stats.data.flasksMax;
    this.invulnerable = 0;
    this.pickupTimer = this.rollTimer = this.dashTimer = this.drinkTimer = this.spinTimer = 0;
    this.dashCooldown = this.spinCooldown = this.fireCooldown = this.fireTimer = 0;
    this.slamming = false;
    this.airJumps = 0;
    this.airDashes = 0;
    this.resting = false;
    this.onGrab = null;
    this.events = []; // bijv. 'roll', 'dash', 'spinHit', 'slamLand', 'heal' — main.js reageert daarop
    this.mesh.visible = true;
    this.body.rotation.set(0, 0, 0);
    this.sword.reset();
    this.sword.setWeapon(this.stats.data.weapon);
    this.setHelmet(this.stats.data.helmet);
    this.position.copy(this.spawnPoint);
    this.velocity.set(0, 0, 0);
    this.knockback.set(0, 0, 0);
    this.mesh.rotation.y = Math.PI; // kijk de wereld in
  }

  /** Gebruik een rig (armen, benen, heupen, hand): het wapen gaat in de hand en de animator laat alles bewegen. */
  useRig(rig) {
    this.rig = rig;
    this.animator = new CharacterAnimator(rig);
    this.sword.attachTo(rig.handR, rig.unit);
  }

  setHelmet(key) {
    this.helmetKey = key;
    if (!this.headSlot) return;
    this.headSlot.clear();
    this.headSlot.add(createHelmetMesh(key));
  }

  get defense() {
    return HELMETS[this.helmetKey]?.defense ?? 0;
  }

  /** Schade die jouw wapen nu doet (met Kracht en Vuurzwaard). */
  get attackDamage() {
    const fire = this.fireTimer > 0 ? 1.5 : 1;
    return Math.round(this.sword.damage * this.stats.damageMultiplier * fire);
  }

  /** Probeer het eigen 3D-model te laden. */
  loadModel() {
    loadGLB(MODEL_URL).then(
      (gltf) => {
        const model = gltf.scene.clone(true);
        model.rotation.y = MODEL_TURN;

        // Even groot maken als de speler, met de voeten op de grond en het midden in het midden
        model.updateMatrixWorld(true);
        const box = new THREE.Box3().setFromObject(model);
        const size = box.getSize(new THREE.Vector3());
        const scale = HEIGHT / size.y;
        model.scale.setScalar(scale);
        model.updateMatrixWorld(true);
        box.setFromObject(model);
        const center = box.getCenter(new THREE.Vector3());
        model.position.set(-center.x, -box.min.y, -center.z);

        model.traverse((child) => {
          if (child.isMesh) {
            child.castShadow = true;
            child.receiveShadow = true;
          }
        });

        this.inner.remove(this.placeholder);
        this.inner.add(model);
        this.model = model;
        this.modelBaseY = model.position.y;

        // Heeft het model losse onderdelen met deze namen? Dan kunnen we het zelf laten bewegen.
        const part = (name) => model.getObjectByName(name);
        if (part('Hips') && part('ArmL') && part('ArmR') && part('LegL') && part('LegR') && part('HandR')) {
          this.useRig({
            hips: part('Hips'), armL: part('ArmL'), armR: part('ArmR'), legL: part('LegL'), legR: part('LegR'), handR: part('HandR'),
            unit: 1 / scale,
          });
          this.headSlot = part('HeadSlot') ?? null;
          this.setHelmet(this.helmetKey);
          return;
        }

        // Anders: wapen in een vaste "hand" naast het model
        this.rig = null;
        const hand = new THREE.Group();
        hand.position.fromArray(MODEL_HAND);
        this.inner.add(hand);
        this.sword.attachTo(hand);
        if (gltf.animations.length > 0) {
          this.mixer = new THREE.AnimationMixer(model);
          const find = (pattern) => gltf.animations.find((clip) => pattern.test(clip.name));
          const clips = { idle: find(/idle|stand/i), walk: find(/run|walk/i) ?? gltf.animations[0], jump: find(/jump/i) };
          for (const [name, clip] of Object.entries(clips)) if (clip) this.actions[name] = this.mixer.clipAction(clip);
        }
      },
      (error) => console.info(`Kon ${MODEL_URL} niet laden, je speelt met het standaard poppetje.`, error)
    );
  }

  // ---------------- Acties ----------------

  useStamina(amount) {
    if (this.stamina < 1) return false;
    this.stamina = Math.max(0, this.stamina - amount);
    this.staminaDelay = STAMINA_DELAY;
    return true;
  }

  /** Slaan met je wapen. */
  tryAttack() {
    if (this.isBusy || this.sword.attackProgress !== null) return false;
    if (!this.useStamina(this.sword.stamina)) return false;
    return this.sword.swing();
  }

  tryRoll(direction) {
    if (this.isBusy || !this.onGround || this.sword.attackProgress !== null) return false;
    if (!this.useStamina(ROLL.stamina)) return false;
    this.rollTimer = ROLL.time;
    this.rollDir = direction.lengthSq() > 0 ? direction.clone().normalize() : this.facing;
    this.mesh.rotation.y = Math.atan2(this.rollDir.x, this.rollDir.z);
    this.events.push('roll');
    return true;
  }

  tryDash(direction) {
    if (!this.stats.hasPower('dash') || this.dashCooldown > 0 || this.pickupTimer > 0 || this.drinkTimer > 0 || this.resting) return false;
    if (!this.onGround && this.airDashes > 0) return false;
    if (!this.useStamina(POWERS.dash.stamina)) return false;
    this.dashTimer = DASH.time;
    this.dashCooldown = POWERS.dash.cooldown;
    this.dashDir = direction.lengthSq() > 0 ? direction.clone().normalize() : this.facing;
    this.mesh.rotation.y = Math.atan2(this.dashDir.x, this.dashDir.z);
    this.rollTimer = 0;
    if (!this.onGround) this.airDashes++;
    this.events.push('dash');
    return true;
  }

  trySpin() {
    if (!this.stats.hasPower('spin') || this.spinCooldown > 0 || this.isBusy) return false;
    if (!this.useStamina(POWERS.spin.stamina)) return false;
    this.spinTimer = SPIN_TIME;
    this.spinCooldown = POWERS.spin.cooldown;
    this.spinId = `spin-${Math.random()}`;
    this.events.push('spin');
    return true;
  }

  trySlam() {
    if (!this.stats.hasPower('slam') || this.onGround || this.slamming || this.isBusy) return false;
    if (!this.useStamina(POWERS.slam.stamina)) return false;
    this.slamming = true;
    this.velocity.y = -SLAM_SPEED;
    this.events.push('slamStart');
    return true;
  }

  tryFire() {
    if (!this.stats.hasPower('fire') || this.fireCooldown > 0 || this.isBusy) return false;
    if (!this.useStamina(POWERS.fire.stamina)) return false;
    this.fireTimer = POWERS.fire.duration;
    this.fireCooldown = POWERS.fire.cooldown;
    this.events.push('fire');
    return true;
  }

  tryDrink() {
    if (this.isBusy || this.flasks <= 0 || this.sword.attackProgress !== null) return false;
    this.flasks--;
    this.drinkTimer = DRINK.time;
    this.healed = false;
    return true;
  }

  /** Bukken om iets op te pakken. `onGrab` wordt uitgevoerd als de hand bij de grond is. */
  startPickup(onGrab) {
    if (this.isBusy) return;
    this.pickupTimer = PICKUP_TIME;
    this.onGrab = onGrab;
  }

  /** Geraakt. Geeft het aantal schadepunten terug (0 als je onkwetsbaar was). */
  hurt(from, damage) {
    if (this.invincible || !this.alive) return 0;
    const taken = Math.max(1, Math.round(damage * (1 - this.defense)));
    this.health = Math.max(0, this.health - taken);
    this.invulnerable = INVULNERABLE_TIME;
    this.drinkTimer = 0; // drinken wordt onderbroken
    this.pickupTimer = 0;

    // Wegstoten, met een klein sprongetje
    const away = this.position.clone().sub(from).setY(0);
    if (away.lengthSq() < 1e-6) away.copy(this.facing).negate();
    this.knockback.copy(away.normalize().multiplyScalar(9));
    if (!this.slamming) {
      this.velocity.y = Math.max(this.velocity.y, 4);
      this.onGround = false;
    }
    return taken;
  }

  /** Na het springen op een vijand: omhoog stuiteren. */
  bounce() {
    this.velocity.y = JUMP_SPEED * 0.75;
    this.onGround = false;
    this.airJumps = 0;
  }

  // ---------------- Elke frame ----------------

  /**
   * @param {number} dt
   * @param {object} controls  { move: Vector3 (wereldrichting), sprint, jumpPressed }
   */
  update(dt, controls, colliders, worldHalf) {
    const move = controls.move.clone();
    const hasMove = move.lengthSq() > 0;
    if (hasMove) move.normalize();

    // Timers
    for (const key of ['invulnerable', 'dashCooldown', 'spinCooldown', 'fireCooldown', 'fireTimer']) this[key] = Math.max(0, this[key] - dt);
    this.sword.update(dt);

    // Stamina komt vanzelf terug (niet tijdens sprinten of acties)
    this.staminaDelay -= dt;
    const sprinting = controls.sprint && hasMove && this.onGround && !this.isBusy && this.stamina > 0;
    if (sprinting) {
      this.stamina = Math.max(0, this.stamina - 14 * dt);
      this.staminaDelay = 0.3;
    } else if (this.staminaDelay <= 0 && !this.isBusy) {
      this.stamina = Math.min(this.maxStamina, this.stamina + STAMINA_REGEN * dt);
    }

    // Knipperen als je net geraakt bent
    this.mesh.visible = this.invulnerable <= 0 || this.rollTimer > 0 || Math.floor(this.invulnerable * 14) % 2 === 0;

    // ---------- Snelheid bepalen ----------
    let speed = SPEED * (sprinting ? SPRINT : 1);
    if (this.sword.attackProgress !== null) speed *= 0.35; // langzamer tijdens een slag
    if (this.drinkTimer > 0 || this.pickupTimer > 0) speed *= 0.3;
    if (this.resting) speed = 0;
    let horizontal = move.clone().multiplyScalar(speed);

    if (this.rollTimer > 0) {
      this.rollTimer -= dt;
      const k = 1 - this.rollTimer / ROLL.time;
      horizontal = this.rollDir.clone().multiplyScalar(ROLL.speed * (1 - k * 0.6));
      this.body.rotation.x = k * Math.PI * 2; // een hele koprol
      if (this.rollTimer <= 0) this.body.rotation.x = 0;
    } else if (this.dashTimer > 0) {
      this.dashTimer -= dt;
      horizontal = this.dashDir.clone().multiplyScalar(DASH.speed);
      this.velocity.y = 0; // dash gaat recht vooruit, ook in de lucht
    } else if (hasMove && !this.resting && this.spinTimer <= 0) {
      // Draai de speler soepel in de looprichting (niet als je naar een vijand gelockt bent en slaat)
      const look = controls.faceTarget && this.sword.attackProgress !== null ? controls.faceTarget : move;
      const targetAngle = Math.atan2(look.x, look.z);
      let diff = targetAngle - this.mesh.rotation.y;
      diff = Math.atan2(Math.sin(diff), Math.cos(diff));
      this.mesh.rotation.y += diff * Math.min(1, 14 * dt);
    }
    if (controls.faceTarget && this.sword.attackProgress !== null && this.rollTimer <= 0 && this.dashTimer <= 0) {
      // Met lock-on draai je bij het slaan naar je doel toe
      const targetAngle = Math.atan2(controls.faceTarget.x, controls.faceTarget.z);
      let diff = targetAngle - this.mesh.rotation.y;
      this.mesh.rotation.y += Math.atan2(Math.sin(diff), Math.cos(diff)) * Math.min(1, 12 * dt);
    }

    // Wervelslag: twee keer rondtollen
    if (this.spinTimer > 0) {
      this.spinTimer -= dt;
      const k = 1 - this.spinTimer / SPIN_TIME;
      this.body.rotation.y = k * Math.PI * 4;
      horizontal.multiplyScalar(0.5);
      if (this.spinTimer <= 0) this.body.rotation.y = 0;
    }

    this.velocity.x = horizontal.x + this.knockback.x;
    this.velocity.z = horizontal.z + this.knockback.z;
    this.knockback.multiplyScalar(Math.exp(-7 * dt));

    // ---------- Springen (en dubbele sprong) ----------
    this.jumped = false;
    if (controls.jumpPressed && !this.isBusy) {
      if (this.onGround) {
        this.velocity.y = JUMP_SPEED;
        this.onGround = false;
        this.jumped = true;
      } else if (this.stats.hasPower('doubleJump') && this.airJumps === 0 && this.useStamina(POWERS.doubleJump.stamina)) {
        this.velocity.y = JUMP_SPEED * 0.9;
        this.airJumps++;
        this.jumped = true;
        this.events.push('doubleJump');
      }
    }

    // ---------- Zwaartekracht ----------
    if (this.dashTimer <= 0) this.velocity.y -= GRAVITY * dt;

    // ---------- Bewegen + botsingen (per as apart, dat is het simpelst) ----------
    const pos = this.position;
    pos.x += this.velocity.x * dt;
    this.resolveHorizontal('x', colliders);
    pos.z += this.velocity.z * dt;
    this.resolveHorizontal('z', colliders);
    pos.x = THREE.MathUtils.clamp(pos.x, -worldHalf, worldHalf);
    pos.z = THREE.MathUtils.clamp(pos.z, -worldHalf, worldHalf);

    const prevY = pos.y;
    const wasInAir = !this.onGround;
    pos.y += this.velocity.y * dt;
    this.onGround = false;
    this.resolveVertical(prevY, colliders);
    if (this.onGround) {
      this.airJumps = 0;
      this.airDashes = 0;
      if (this.slamming) {
        this.slamming = false;
        this.events.push('slamLand');
      } else if (wasInAir) this.events.push('land');
    }

    // ---------- Flesje drinken ----------
    if (this.drinkTimer > 0) {
      this.drinkTimer -= dt;
      if (!this.healed && DRINK.time - this.drinkTimer >= DRINK.healAt) {
        this.healed = true;
        this.health = Math.min(this.maxHealth, this.health + Math.round(this.maxHealth * DRINK.heal));
        this.events.push('heal');
      }
    }

    // ---------- Animatie ----------
    this.moving = hasMove && !this.resting;
    this.updateAnimation(dt);
  }

  updateAnimation(dt) {
    if (this.pickupTimer > 0) {
      this.pickupTimer -= dt;
      if (this.onGrab && this.pickupTimer <= PICKUP_TIME / 2) {
        this.onGrab(); // hand is beneden: nu pakken we het echt
        this.onGrab = null;
      }
    }
    const pickup = this.pickupTimer > 0 ? 1 - this.pickupTimer / PICKUP_TIME : null;
    const drink = this.drinkTimer > 0 ? 1 - this.drinkTimer / DRINK.time : null;

    if (this.rig) {
      this.animator.update(dt, {
        moving: this.moving && this.rollTimer <= 0,
        onGround: this.onGround || this.rollTimer > 0,
        attack: this.sword.attackProgress,
        pickup,
        drink,
        spin: this.spinTimer > 0,
        rest: this.resting,
        tuck: this.rollTimer > 0 || this.dashTimer > 0 || this.slamming,
      });
      return;
    }
    if (!this.mixer) {
      this.walkPhase = (this.walkPhase ?? 0) + (this.moving ? dt * 11 : 0);
      this.model.position.y = this.modelBaseY + Math.abs(Math.sin(this.walkPhase)) * 0.08 * (this.moving && this.onGround ? 1 : 0);
      return;
    }
    let name = 'idle';
    if (!this.onGround && this.actions.jump) name = 'jump';
    else if (this.moving) name = 'walk';
    const next = this.actions[name] ?? null;
    if (next !== this.currentAction) {
      this.currentAction?.fadeOut(0.2);
      next?.reset().fadeIn(0.2).play();
      this.currentAction = next;
    }
    this.mixer.update(dt);
  }

  /** Bounding box van de speler op zijn huidige positie. */
  getBox() {
    const p = this.position;
    return new THREE.Box3(
      new THREE.Vector3(p.x - RADIUS, p.y, p.z - RADIUS),
      new THREE.Vector3(p.x + RADIUS, p.y + HEIGHT, p.z + RADIUS)
    );
  }

  resolveHorizontal(axis, colliders) {
    const STEP = 0.05; // kleine marge zodat je niet "blijft haken" als je op een blok staat
    for (const box of colliders) {
      const me = this.getBox();
      me.min.y += STEP;
      if (!overlaps(me, box)) continue;

      const center = (box.min[axis] + box.max[axis]) / 2;
      if (this.position[axis] < center) {
        this.position[axis] = box.min[axis] - RADIUS;
      } else {
        this.position[axis] = box.max[axis] + RADIUS;
      }
    }
  }

  resolveVertical(prevY, colliders) {
    const pos = this.position;
    const EPS = 0.001;

    // Blokken
    for (const box of colliders) {
      if (!overlaps(this.getBox(), box)) continue;

      if (this.velocity.y <= 0 && prevY >= box.max.y - EPS) {
        // Landen bovenop een blok
        pos.y = box.max.y;
        this.velocity.y = 0;
        this.onGround = true;
      } else if (this.velocity.y > 0 && prevY + HEIGHT <= box.min.y + EPS) {
        // Hoofd stoten tegen de onderkant
        pos.y = box.min.y - HEIGHT;
        this.velocity.y = 0;
      }
    }

    // De grond (de wereld is overal begaanbaar)
    if (pos.y <= 0) {
      pos.y = 0;
      this.velocity.y = 0;
      this.onGround = true;
    }
  }
}

/** Overlappen twee boxen echt? (alleen aanraken telt niet) */
function overlaps(a, b) {
  return (
    a.min.x < b.max.x && a.max.x > b.min.x &&
    a.min.y < b.max.y && a.max.y > b.min.y &&
    a.min.z < b.max.z && a.max.z > b.min.z
  );
}
