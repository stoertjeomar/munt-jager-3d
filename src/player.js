import * as THREE from 'three';
import { Sword } from './sword.js';

// Instellingen van de speler — speel hiermee om het gevoel te veranderen!
const SPEED = 7; // loopsnelheid (eenheden per seconde)
const JUMP_SPEED = 9; // hoe hard je omhoog springt
const GRAVITY = 25; // zwaartekracht
const RADIUS = 0.45; // dikte van de speler
const HEIGHT = 1.6; // lengte van de speler
const FALL_LIMIT = -25; // onder deze hoogte: respawn
export const MAX_HEALTH = 3; // aantal levens (hartjes)
const INVULNERABLE_TIME = 1.2; // na een klap ben je even onkwetsbaar

export class Player {
  constructor(scene) {
    this.mesh = new THREE.Group();

    // Lichaam: een capsule
    const body = new THREE.Mesh(
      new THREE.CapsuleGeometry(RADIUS, HEIGHT - RADIUS * 2, 8, 16),
      new THREE.MeshStandardMaterial({ color: 0x4f8cff, roughness: 0.5 })
    );
    body.position.y = HEIGHT / 2;
    body.castShadow = true;
    this.mesh.add(body);

    // Ogen, zodat je ziet welke kant de speler op kijkt (+Z = voorkant)
    const eyeGeo = new THREE.SphereGeometry(0.09, 12, 12);
    const eyeMat = new THREE.MeshStandardMaterial({ color: 0xffffff });
    const pupilGeo = new THREE.SphereGeometry(0.045, 8, 8);
    const pupilMat = new THREE.MeshStandardMaterial({ color: 0x111111 });
    for (const side of [-1, 1]) {
      const eye = new THREE.Mesh(eyeGeo, eyeMat);
      eye.position.set(side * 0.17, HEIGHT - 0.4, RADIUS - 0.04);
      const pupil = new THREE.Mesh(pupilGeo, pupilMat);
      pupil.position.z = 0.07;
      eye.add(pupil);
      this.mesh.add(eye);
    }

    this.sword = new Sword(this.mesh);

    scene.add(this.mesh);

    this.velocity = new THREE.Vector3();
    this.knockback = new THREE.Vector3();
    this.onGround = false;
    this.spawnPoint = new THREE.Vector3(0, 0, 8);
    this.reset();
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
  hurt(from) {
    if (this.invulnerable > 0 || !this.alive) return false;
    this.health--;
    this.invulnerable = INVULNERABLE_TIME;

    // Wegstoten van de vijand, met een klein sprongetje
    const away = this.position.clone().sub(from).setY(0);
    if (away.lengthSq() < 1e-6) away.copy(this.facing).negate();
    this.knockback.copy(away.normalize().multiplyScalar(12));
    this.velocity.y = 6;
    this.onGround = false;
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
    if (this.onGround && input.isDown('Space')) {
      this.velocity.y = JUMP_SPEED;
      this.onGround = false;
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
