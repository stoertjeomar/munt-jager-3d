import * as THREE from 'three';

// Een "third person" camera die om de speler heen draait.
// Klik in het spel: de muis wordt "vastgezet" en gewoon bewegen = rondkijken.
// Esc maakt de muis weer vrij. Scrollen = zoomen.
const MOUSE_SENSITIVITY = 0.0025;

export class CameraRig {
  constructor(camera, domElement) {
    this.camera = camera;
    this.yaw = 0; // horizontale hoek (radialen)
    this.pitch = 0.45; // verticale hoek (radialen)
    this.distance = 7.5;
    this.target = new THREE.Vector3();
    this.domElement = domElement;
    this.ray = new THREE.Ray();
    this.hitPoint = new THREE.Vector3();
    this.lookUp = 0;
    this.mouseIdle = 0; // hoe lang de muis al stil is (dan draait de camera vanzelf achter je)

    domElement.addEventListener('pointerdown', () => {
      if (!this.locked) domElement.requestPointerLock();
    });
    document.addEventListener('mousemove', (e) => {
      if (!this.locked) return;
      if (Math.abs(e.movementX) + Math.abs(e.movementY) > 2) this.mouseIdle = 0;
      this.yaw -= e.movementX * MOUSE_SENSITIVITY;
      this.pitch += e.movementY * MOUSE_SENSITIVITY;
      this.pitch = THREE.MathUtils.clamp(this.pitch, 0.05, 1.3);
    });
    domElement.addEventListener(
      'wheel',
      (e) => {
        e.preventDefault();
        this.distance = THREE.MathUtils.clamp(this.distance + e.deltaY * 0.01, 4, 20);
      },
      { passive: false }
    );
  }

  /** Zit de muis vast in het spel? */
  get locked() {
    return document.pointerLockElement === this.domElement;
  }

  /** Richting "vooruit" vanaf de camera, op de grond (x, z). */
  get forward() {
    return new THREE.Vector3(-Math.sin(this.yaw), 0, -Math.cos(this.yaw));
  }

  /** Richting "rechts" vanaf de camera, op de grond (x, z). */
  get right() {
    return new THREE.Vector3(Math.cos(this.yaw), 0, -Math.sin(this.yaw));
  }

  /**
   * @param {object} [follow]  { facing: kijkhoek van de speler, moving, lockTarget: Vector3 }
   */
  update(dt, followPosition, follow = {}) {
    this.mouseIdle += dt;
    let goalYaw = null;
    let speed = 0;
    if (follow.lockTarget) {
      // Vastgezet op een vijand: kijk over je schouder naar het doel
      const dx = follow.lockTarget.x - followPosition.x;
      const dz = follow.lockTarget.z - followPosition.z;
      goalYaw = Math.atan2(-dx, -dz);
      speed = 7;
      // Hoog doel (zoals een vliegende boss)? Dan kijkt de camera mee omhoog
      const above = follow.lockTarget.y - (followPosition.y + 1.2);
      const goalPitch = THREE.MathUtils.clamp(0.35 - above * 0.05, 0.05, 0.6);
      this.pitch += (goalPitch - this.pitch) * Math.min(1, 3 * dt);
      this.lookUp = THREE.MathUtils.clamp(above * 0.45, 0, 4);
    } else if (follow.moving && this.mouseIdle > 0.7) {
      // Muis stil en je loopt: de camera draait rustig achter je hoofd aan
      goalYaw = follow.facing + Math.PI;
      speed = 1.8;
    }
    if (goalYaw !== null) {
      let diff = goalYaw - this.yaw;
      diff = Math.atan2(Math.sin(diff), Math.cos(diff));
      this.yaw += diff * Math.min(1, speed * dt);
    }

    // Soepel achter de speler aan bewegen
    const goal = followPosition.clone().add(new THREE.Vector3(0, 1.2, 0));
    this.target.lerp(goal, 1 - Math.exp(-10 * dt));

    const d = this.distance;
    const offset = new THREE.Vector3(
      Math.sin(this.yaw) * Math.cos(this.pitch) * d,
      Math.sin(this.pitch) * d,
      Math.cos(this.yaw) * Math.cos(this.pitch) * d
    );

    // Camera-botsing: staat er iets (pilaar, boom) tussen jou en de camera? Dan schuift hij dichterbij.
    if (follow.colliders) {
      const dir = offset.clone().normalize();
      this.ray.set(this.target, dir);
      let nearest = d;
      for (const box of follow.colliders) {
        if (box.distanceToPoint(this.target) > nearest) continue;
        const hit = this.ray.intersectBox(box, this.hitPoint);
        if (hit) nearest = Math.min(nearest, hit.distanceTo(this.target) - 0.3);
      }
      this.smoothDistance = Math.min(this.smoothDistance ?? d, Math.max(1.2, nearest));
      this.smoothDistance += (Math.max(1.2, nearest) - this.smoothDistance) * Math.min(1, 4 * dt);
      offset.setLength(this.smoothDistance);
    }

    this.camera.position.copy(this.target).add(offset);
    if (!follow.lockTarget) this.lookUp = 0;
    this.smoothLookUp = (this.smoothLookUp ?? 0) + (this.lookUp - (this.smoothLookUp ?? 0)) * Math.min(1, 4 * dt);
    this.camera.lookAt(this.target.x, this.target.y + this.smoothLookUp, this.target.z);
  }

  snapTo(position) {
    this.target.copy(position).add(new THREE.Vector3(0, 1.2, 0));
  }
}
