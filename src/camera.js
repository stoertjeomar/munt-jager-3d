import * as THREE from 'three';
import { collidersNear } from './spatial.js';

// Een "third person" camera die om de speler heen draait.
// Klik in het spel: de muis wordt "vastgezet" en gewoon bewegen = rondkijken.
// Esc maakt de muis weer vrij. Scrollen = zoomen.
const MOUSE_SENSITIVITY = 0.0025; // bij muis-snelheid 100% (zie sensitivity: op het startscherm kun je hem sneller of langzamer zetten)
const SENS_KEY = 'munt-jager-3d-muis';
const FLICK = 260; // zoveel pixels snel opzij bewegen (binnen ~0,3 seconde) zet het vastzetten op een vijand (Q) uit
const MAX_MOUSE_JUMP = 250; // grotere sprongen in één muisbeweging zijn een browser-foutje (Chrome), die negeren we
const PITCH_MIN = -0.95; // zo ver kun je omhoog kijken (negatief = camera onder je hoofd, kijkt omhoog)
const PITCH_MAX = 1.3; // zo ver kun je van bovenaf kijken
const ORBIT_MIN = -0.08; // lager dan dit gaat de camera niet (anders zakt hij door de grond); daarna kantelt hij alleen nog omhoog
export const ZOOM_MIN = 4; // zo dichtbij kan de camera komen (scrollen = zoomen)
export const ZOOM_MAX = 20; // zo ver kan hij weg

export class CameraRig {
  constructor(camera, domElement) {
    this.camera = camera;
    this.yaw = 0; // horizontale hoek (radialen)
    this.pitch = 0.45; // verticale hoek (radialen)
    this.distance = ZOOM_MIN; // bij het begin van het spel helemaal ingezoomd; met scrollen zoom je uit
    this.target = new THREE.Vector3();
    this.domElement = domElement;
    this.ray = new THREE.Ray();
    this.hitPoint = new THREE.Vector3();
    this.lookUp = 0;
    this.mouseIdle = 0; // hoe lang de muis al stil is (dan draait de camera vanzelf achter je)
    this.flick = 0; // hoeveel de muis net opzij bewoog (een flinke ruk = vastzetten op een vijand uit)
    this.breakLock = false;
    // Muis-snelheid (1 = 100%), onthouden in de browser
    this.sensitivity = 1;
    try {
      const saved = Number(localStorage.getItem(SENS_KEY));
      if (saved >= 0.3 && saved <= 3) this.sensitivity = saved;
    } catch {
      // geen opslag: dan gewoon 100%
    }


    domElement.addEventListener('pointerdown', () => {
      if (!this.locked) this.lock();
    });
    document.addEventListener('mousemove', (e) => {
      if (!this.locked) return;
      // Soms geeft de browser één enorme muis-sprong door (vooral net na het vastzetten): dan zou het beeld
      // ineens naar links of rechts schieten. Zulke sprongen slaan we over.
      if (Math.abs(e.movementX) > MAX_MOUSE_JUMP || Math.abs(e.movementY) > MAX_MOUSE_JUMP) return;
      if (Math.abs(e.movementX) + Math.abs(e.movementY) > 2) this.mouseIdle = 0;
      this.flick += Math.abs(e.movementX);
      if (this.flick > FLICK) this.breakLock = true;
      const s = MOUSE_SENSITIVITY * this.sensitivity;
      this.yaw -= e.movementX * s;
      this.pitch += e.movementY * s;
      this.pitch = THREE.MathUtils.clamp(this.pitch, PITCH_MIN, PITCH_MAX);
    });
    domElement.addEventListener(
      'wheel',
      (e) => {
        e.preventDefault();
        this.distance = THREE.MathUtils.clamp(this.distance + e.deltaY * 0.01, ZOOM_MIN, ZOOM_MAX);
      },
      { passive: false }
    );
  }

  /** Muis-snelheid veranderen (en onthouden). */
  setSensitivity(value) {
    this.sensitivity = Math.round(THREE.MathUtils.clamp(value, 0.3, 3) * 10) / 10;
    try {
      localStorage.setItem(SENS_KEY, String(this.sensitivity));
    } catch {
      // niet erg
    }
    return this.sensitivity;
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
   * @param {object} [follow]  { facing: kijkhoek van de speler, moving, lockTarget: Vector3 }
   */
  update(dt, followPosition, follow = {}) {
    this.mouseIdle += dt;
    this.flick = Math.max(0, this.flick - FLICK * 3.5 * dt); // (zakt weer weg: alleen een snelle ruk telt)
    let goalYaw = null;
    let speed = 0;
    if (follow.lockTarget) {
      // Vastgezet op een vijand: kijk over je schouder naar het doel
      const dx = follow.lockTarget.x - followPosition.x;
      const dz = follow.lockTarget.z - followPosition.z;
      // Staat het doel (bijna) recht boven of onder je? Dan springt de hoek alle kanten op: niet draaien.
      if (dx * dx + dz * dz > 2.5) goalYaw = Math.atan2(-dx, -dz);
      // Beweeg je zelf de muis? Dan trekt de camera minder hard naar het doel (anders voelt rondkijken sloom en stroef)
      speed = this.mouseIdle < 0.4 ? 2 : 7;
      // Hoog doel (zoals een vliegende boss)? Dan kijkt de camera mee omhoog
      const above = follow.lockTarget.y - (followPosition.y + 1.2);
      const goalPitch = THREE.MathUtils.clamp(0.35 - above * 0.05, 0.05, 0.6);
      this.pitch += (goalPitch - this.pitch) * Math.min(1, 3 * dt);
      this.lookUp = THREE.MathUtils.clamp(above * 0.45, 0, 4);
    } else if (follow.moving && this.mouseIdle > 1.2) {
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

    // Soepel achter de speler aan bewegen
    const goal = followPosition.clone().add(new THREE.Vector3(0, 1.2, 0));
    this.target.lerp(goal, 1 - Math.exp(-10 * dt));

    // Omhoog kijken: de camera zakt tot vlak boven de grond en kantelt daarna verder omhoog
    const orbitPitch = Math.max(this.pitch, ORBIT_MIN);
    const tilt = orbitPitch - this.pitch; // > 0 als je verder omhoog kijkt dan de camera kan zakken
    // Binnen in een huis: dichterbij. Op de draak: verder weg (anders zie je alleen zijn rug)
    const d = Math.max(follow.minDistance ?? 0, Math.min(this.distance, follow.maxDistance ?? Infinity));
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
      for (const box of collidersNear(follow.colliders, this.target.x, this.target.z, d + 1, (this.nearList ??= []))) {
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
