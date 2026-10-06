import * as THREE from 'three';

// Een "third person" camera die om de speler heen draait.
// Klik in het spel: de muis wordt "vastgezet" en gewoon bewegen = rondkijken.
// Esc maakt de muis weer vrij. Scrollen = zoomen.
const MOUSE_SENSITIVITY = 0.0025;
const MAX_MOUSE_JUMP = 250; // grotere sprongen in één muisbeweging zijn een browser-foutje (Chrome), die negeren we
const PITCH_MIN = -0.95; // zo ver kun je omhoog kijken (negatief = camera onder je hoofd, kijkt omhoog)
const PITCH_MAX = 1.3; // zo ver kun je van bovenaf kijken
const ORBIT_MIN = -0.08; // lager dan dit gaat de camera niet (anders zakt hij door de grond); daarna kantelt hij alleen nog omhoog
const SHOULDER = 0.75; // met een afstandswapen schuift de camera over je rechterschouder, zodat je het vizier ziet

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

    this.shoulder = 0;

    domElement.addEventListener('pointerdown', () => {
      if (!this.locked) this.lock();
    });
    document.addEventListener('mousemove', (e) => {
      if (!this.locked) return;
      // Soms geeft de browser één enorme muis-sprong door (vooral net na het vastzetten): dan zou het beeld
      // ineens naar links of rechts schieten. Zulke sprongen slaan we over.
      if (Math.abs(e.movementX) > MAX_MOUSE_JUMP || Math.abs(e.movementY) > MAX_MOUSE_JUMP) return;
      if (Math.abs(e.movementX) + Math.abs(e.movementY) > 2) this.mouseIdle = 0;
      this.yaw -= e.movementX * MOUSE_SENSITIVITY;
      this.pitch += e.movementY * MOUSE_SENSITIVITY;
      this.pitch = THREE.MathUtils.clamp(this.pitch, PITCH_MIN, PITCH_MAX);
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

  /** Muis vastzetten. "unadjustedMovement" = ruwe muisbeweging, zonder de sprongen van Windows-muisversnelling. */
  lock() {
    try {
      const result = this.domElement.requestPointerLock({ unadjustedMovement: true });
      // Oudere browsers kennen die optie niet: dan gewoon zonder
      result?.catch?.(() => this.domElement.requestPointerLock()?.catch?.(() => {}));
    } catch {
      this.domElement.requestPointerLock();
    }
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
   * @param {object} [follow]  { facing: kijkhoek van de speler, moving, lockTarget: Vector3, aiming: afstandswapen in je hand }
   */
  update(dt, followPosition, follow = {}) {
    this.mouseIdle += dt;
    let goalYaw = null;
    let speed = 0;
    if (follow.lockTarget) {
      // Vastgezet op een vijand: kijk over je schouder naar het doel
      const dx = follow.lockTarget.x - followPosition.x;
      const dz = follow.lockTarget.z - followPosition.z;
      // Staat het doel (bijna) recht boven of onder je? Dan springt de hoek alle kanten op: niet draaien.
      if (dx * dx + dz * dz > 2.5) goalYaw = Math.atan2(-dx, -dz);
      speed = 7;
      // Hoog doel (zoals een vliegende boss)? Dan kijkt de camera mee omhoog
      const above = follow.lockTarget.y - (followPosition.y + 1.2);
      const goalPitch = THREE.MathUtils.clamp(0.35 - above * 0.05, 0.05, 0.6);
      this.pitch += (goalPitch - this.pitch) * Math.min(1, 3 * dt);
      this.lookUp = THREE.MathUtils.clamp(above * 0.45, 0, 4);
    } else if (follow.moving && !follow.aiming && this.mouseIdle > 1.2) {
      // Muis stil en je loopt (ongeveer) van de camera af: de camera draait rustig achter je hoofd aan.
      // Loop je opzij of naar de camera toe, dan niet: anders blijft de camera rondtollen.
      const behind = follow.facing + Math.PI;
      const diff = Math.atan2(Math.sin(behind - this.yaw), Math.cos(behind - this.yaw));
      if (Math.abs(diff) < 1.1) {
        goalYaw = behind;
        speed = 1.5;
      }
    }
    if (goalYaw !== null) {
      let diff = goalYaw - this.yaw;
      diff = Math.atan2(Math.sin(diff), Math.cos(diff));
      this.yaw += diff * Math.min(1, speed * dt);
    }

    // Soepel achter de speler aan bewegen (met een afstandswapen: over je rechterschouder)
    this.shoulder += ((follow.aiming ? SHOULDER : 0) - this.shoulder) * Math.min(1, 8 * dt);
    const goal = followPosition.clone().add(new THREE.Vector3(0, 1.2, 0)).addScaledVector(this.right, this.shoulder);
    this.target.lerp(goal, 1 - Math.exp(-10 * dt));

    // Omhoog kijken: de camera zakt tot vlak boven de grond en kantelt daarna verder omhoog
    const orbitPitch = Math.max(this.pitch, ORBIT_MIN);
    const tilt = orbitPitch - this.pitch; // > 0 als je verder omhoog kijkt dan de camera kan zakken
    const d = Math.min(this.distance, follow.maxDistance ?? Infinity); // binnen in een huis: dichterbij
    const offset = new THREE.Vector3(
      Math.sin(this.yaw) * Math.cos(orbitPitch) * d,
      Math.sin(orbitPitch) * d,
      Math.cos(this.yaw) * Math.cos(orbitPitch) * d
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
    this.camera.position.y = Math.max(this.camera.position.y, followPosition.y + 0.35);
    if (!follow.lockTarget) this.lookUp = 0;
    this.smoothLookUp = (this.smoothLookUp ?? 0) + (this.lookUp - (this.smoothLookUp ?? 0)) * Math.min(1, 4 * dt);
    // Het kijkpunt gaat omhoog met de extra kanteling (zelfde afstand als de camera, dus de hoek klopt precies)
    const flatDist = Math.hypot(offset.x, offset.z);
    const tiltUp = Math.tan(tilt) * flatDist;
    this.camera.lookAt(this.target.x, this.target.y + this.smoothLookUp + tiltUp, this.target.z);
  }

  snapTo(position) {
    this.target.copy(position).add(new THREE.Vector3(0, 1.2, 0));
  }
}
