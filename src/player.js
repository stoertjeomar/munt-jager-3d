import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { Sword } from './sword.js';
import { buildCharacter } from './character.js';
import { CharacterAnimator } from './animator.js';

// Instellingen van de speler — speel hiermee om het gevoel te veranderen!
const SPEED = 7; // loopsnelheid (eenheden per seconde)
const JUMP_SPEED = 9; // hoe hard je omhoog springt
const GRAVITY = 25; // zwaartekracht
const RADIUS = 0.45; // dikte van de speler
const HEIGHT = 1.6; // lengte van de speler
const FALL_LIMIT = -25; // onder deze hoogte: respawn
export const MAX_HEALTH = 5; // aantal levens (hartjes)
const INVULNERABLE_TIME = 1.2; // na een klap ben je even onkwetsbaar

// Eigen 3D-poppetje: zet een .glb-bestand op deze plek (bijv. gemaakt met Tripo).
// Staat het bestand er niet, dan speel je met het poppetje uit character.js.
const MODEL_URL = 'models/speler.glb';
const MODEL_TURN = 0; // kijkt het model de verkeerde kant op? Probeer Math.PI of Math.PI / 2
const MODEL_HAND = [-0.34, 0.55, 0.14]; // alleen voor modellen zonder rig: waar de rechterhand zit
const PICKUP_TIME = 0.6; // hoe lang bukken en oppakken duurt (seconden)

export class Player {
  constructor(scene) {
    this.mesh = new THREE.Group();
    this.sword = new Sword();

    // Het poppetje uit character.js (wordt vervangen als er een 3D-model is)
    const character = buildCharacter();
    this.placeholder = character.group;
    this.mesh.add(this.placeholder);
    this.useRig(character.rig);

    scene.add(this.mesh);

    this.velocity = new THREE.Vector3();
    this.knockback = new THREE.Vector3();
    this.onGround = false;
    this.moving = false;
    this.pickupTimer = 0; // > 0: bezig met bukken om iets op te pakken
    this.onGrab = null; // wat er gebeurt als de hand de grond raakt
    this.spawnPoint = new THREE.Vector3(0, 0, 8);
    this.reset();

    this.mixer = null; // speelt de animaties van het model af (als het die heeft)
    this.actions = {};
    this.currentAction = null;
    this.loadModel();
  }

  /** Gebruik een rig (armen, benen, heupen, hand): het wapen gaat in de hand en de animator laat alles bewegen. */
  useRig(rig) {
    this.rig = rig;
    this.animator = new CharacterAnimator(rig);
    this.sword.attachTo(rig.handR, rig.unit);
  }

  /** Probeer het eigen 3D-model te laden. */
  loadModel() {
    new GLTFLoader().load(
      MODEL_URL,
      (gltf) => {
        const model = gltf.scene;
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

        this.mesh.remove(this.placeholder);
        this.mesh.add(model);
        this.model = model;
        this.modelBaseY = model.position.y;

        // Heeft het model losse onderdelen met deze namen? Dan kunnen we het zelf laten bewegen.
        const part = (name) => model.getObjectByName(name);
        if (part('Hips') && part('ArmL') && part('ArmR') && part('LegL') && part('LegR') && part('HandR')) {
          this.useRig({
            hips: part('Hips'),
            armL: part('ArmL'),
            armR: part('ArmR'),
            legL: part('LegL'),
            legR: part('LegR'),
            handR: part('HandR'),
            unit: 1 / scale,
          });
          return;
        }

        // Anders: wapen in een vaste "hand" naast het model
        this.rig = null;
        const hand = new THREE.Group();
        hand.position.fromArray(MODEL_HAND);
        this.mesh.add(hand);
        this.sword.attachTo(hand);

        // Animaties (als het model "gerigd" is, bijvoorbeeld idle / walk / run / jump)
        if (gltf.animations.length > 0) {
          this.mixer = new THREE.AnimationMixer(model);
          const find = (pattern) => gltf.animations.find((clip) => pattern.test(clip.name));
          const clips = {
            idle: find(/idle|stand/i),
            walk: find(/run|walk/i) ?? gltf.animations[0],
            jump: find(/jump/i),
          };
          for (const [name, clip] of Object.entries(clips)) {
            if (clip) this.actions[name] = this.mixer.clipAction(clip);
          }
          console.log('Animaties in het model:', gltf.animations.map((clip) => clip.name));
        }
      },
      undefined,
      (error) => console.info(`Kon ${MODEL_URL} niet laden, je speelt met het standaard poppetje.`, error)
    );
  }

  /** Bukken om iets op te pakken. `onGrab` wordt uitgevoerd als de hand bij de grond is. */
  startPickup(onGrab) {
    if (this.pickupTimer > 0) return;
    this.pickupTimer = PICKUP_TIME;
    this.onGrab = onGrab;
  }

  get isBusy() {
    return this.pickupTimer > 0;
  }

  /** Laat het poppetje bewegen: lopen, slaan, springen, oppakken. */
  updateAnimation(dt) {
    if (this.pickupTimer > 0) {
      this.pickupTimer -= dt;
      if (this.onGrab && this.pickupTimer <= PICKUP_TIME / 2) {
        this.onGrab(); // hand is beneden: nu wisselen we echt van wapen
        this.onGrab = null;
      }
    }
    const pickup = this.pickupTimer > 0 ? 1 - this.pickupTimer / PICKUP_TIME : null;

    if (this.rig) {
      this.animator.update(dt, { moving: this.moving, onGround: this.onGround, attack: this.sword.attackProgress, pickup });
      return;
    }
    if (!this.mixer) {
      // Model zonder rig en zonder animaties: een beetje op en neer wippen tijdens het lopen
      this.walkPhase = (this.walkPhase ?? 0) + (this.moving ? dt * 11 : 0);
      const bob = this.moving && this.onGround ? 1 : 0;
      this.model.position.y = this.modelBaseY + Math.abs(Math.sin(this.walkPhase)) * 0.08 * bob;
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

  get position() {
    return this.mesh.position;
  }

  respawn() {
    this.position.copy(this.spawnPoint);
    this.velocity.set(0, 0, 0);
    this.knockback.set(0, 0, 0);
    this.mesh.rotation.y = Math.PI; // kijk de wereld in
  }

  /** Helemaal opnieuw beginnen: terug naar start met volle levens. */
  reset() {
    this.health = MAX_HEALTH;
    this.invulnerable = 0;
    this.mesh.visible = true;
    this.sword.reset();
    this.pickupTimer = 0;
    this.onGrab = null;
    this.respawn();
  }

  /** Richting waarin de speler kijkt (op de grond). */
  get facing() {
    return new THREE.Vector3(Math.sin(this.mesh.rotation.y), 0, Math.cos(this.mesh.rotation.y));
  }

  get alive() {
    return this.health > 0;
  }

  /** Geraakt door een vijand op positie `from`. Geeft true terug als het pijn deed. */
  hurt(from, damage = 1) {
    if (this.invulnerable > 0 || !this.alive) return false;
    this.health = Math.max(0, this.health - damage);
    this.invulnerable = INVULNERABLE_TIME;

    // Wegstoten van de vijand, met een klein sprongetje
    const away = this.position.clone().sub(from).setY(0);
    if (away.lengthSq() < 1e-6) away.copy(this.facing).negate();
    this.knockback.copy(away.normalize().multiplyScalar(12));
    this.velocity.y = 6;
    this.onGround = false;
    return true;
  }

  /** Een leven erbij (bijv. van een hartje). Geeft false terug als je al vol zit. */
  heal(amount = 1) {
    if (this.health >= MAX_HEALTH) return false;
    this.health = Math.min(MAX_HEALTH, this.health + amount);
    return true;
  }

  /** Na het springen op een vijand: omhoog stuiteren. */
  bounce() {
    this.velocity.y = JUMP_SPEED * 0.75;
    this.onGround = false;
  }

  /**
   * @param {number} dt              tijd sinds vorige frame (seconden)
   * @param {import('./input.js').Input} input
   * @param {import('./camera.js').CameraRig} cameraRig
   * @param {THREE.Box3[]} colliders  blokken waar je tegenaan/op kunt staan
   * @param {number} groundHalfSize  halve breedte van de vloer
   */
  update(dt, input, cameraRig, colliders, groundHalfSize) {
    // 1. Input → bewegingsrichting (relatief aan de camera)
    const f = (input.isDown('KeyW', 'ArrowUp') ? 1 : 0) - (input.isDown('KeyS', 'ArrowDown') ? 1 : 0);
    const r = (input.isDown('KeyD', 'ArrowRight') ? 1 : 0) - (input.isDown('KeyA', 'ArrowLeft') ? 1 : 0);

    const move = cameraRig.forward.multiplyScalar(f).add(cameraRig.right.multiplyScalar(r));
    if (move.lengthSq() > 0) {
      move.normalize();
      // Draai de speler soepel in de looprichting
      const targetAngle = Math.atan2(move.x, move.z);
      let diff = targetAngle - this.mesh.rotation.y;
      diff = Math.atan2(Math.sin(diff), Math.cos(diff)); // kortste weg
      this.mesh.rotation.y += diff * Math.min(1, 15 * dt);
    }

    this.velocity.x = move.x * SPEED + this.knockback.x;
    this.velocity.z = move.z * SPEED + this.knockback.z;
    this.knockback.multiplyScalar(Math.exp(-6 * dt));

    // Zwaard + knipperen als je net geraakt bent
    this.sword.update(dt);
    if (this.invulnerable > 0) {
      this.invulnerable -= dt;
      this.mesh.visible = this.invulnerable <= 0 || Math.floor(this.invulnerable * 12) % 2 === 0;
    }

    // 2. Springen
    this.jumped = false;
    if (this.onGround && input.isDown('Space')) {
      this.velocity.y = JUMP_SPEED;
      this.onGround = false;
      this.jumped = true;
    }

    // 3. Zwaartekracht
    this.velocity.y -= GRAVITY * dt;

    // 4. Bewegen + botsingen (per as apart, dat is het simpelst)
    const pos = this.position;

    pos.x += this.velocity.x * dt;
    this.resolveHorizontal('x', colliders);

    pos.z += this.velocity.z * dt;
    this.resolveHorizontal('z', colliders);

    const prevY = pos.y;
    pos.y += this.velocity.y * dt;
    this.onGround = false;
    this.resolveVertical(prevY, colliders, groundHalfSize);

    // 5. Van de wereld gevallen?
    if (pos.y < FALL_LIMIT) this.respawn();

    // 6. Animatie van het poppetje
    this.moving = move.lengthSq() > 0;
    this.updateAnimation(dt);
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

  resolveVertical(prevY, colliders, groundHalfSize) {
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

    // De vloer (alleen als je boven de vloer bent, anders val je eraf!)
    const aboveGround = Math.abs(pos.x) <= groundHalfSize && Math.abs(pos.z) <= groundHalfSize;
    if (aboveGround && pos.y <= 0 && prevY >= -EPS) {
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
