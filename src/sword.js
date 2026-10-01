import * as THREE from 'three';
import { WEAPONS, START_WEAPON, createWeaponMesh } from './weapons.js';

// De hand met het wapen: houdt het wapen vast en doet de zwaai-animatie.
// Welke wapens er zijn (en hoe sterk ze zijn) staat in weapons.js.

const COOLDOWN = 0.15; // pauze na een slag voordat je weer kunt slaan

// Rusthouding en slag-hoeken (radialen)
const REST_YAW = -0.35;
const REST_PITCH = 0.3;
const SWING_FROM = -1.4; // rechts van de speler
const SWING_TO = 1.5; // links van de speler
const SWING_PITCH = 1.45; // bijna horizontaal naar voren

export class Sword {
  /** @param {THREE.Object3D} holder  het object waar het wapen aan vastzit (de speler) */
  constructor(holder) {
    // Twee draaipunten in elkaar: yaw (links/rechts) en pitch (omhoog/naar voren)
    this.yawPivot = new THREE.Group();
    this.yawPivot.position.set(-0.3, 0.8, 0.26); // rechterhand (+Z is de voorkant)
    this.pitchPivot = new THREE.Group();
    this.yawPivot.add(this.pitchPivot);
    holder.add(this.yawPivot);

    // Een doorzichtige "zwiep"-boog die even zichtbaar is tijdens een slag
    this.trail = new THREE.Mesh(
      new THREE.BufferGeometry(),
      new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0, side: THREE.DoubleSide, depthWrite: false })
    );
    this.trail.position.set(0, 0.85, 0);
    // RingGeometry begint op de +X as; draai zodat de boog van rechts naar links voor de speler loopt
    this.trail.rotation.y = -Math.PI / 2 + SWING_FROM;
    holder.add(this.trail);

    this.weaponMesh = null;
    this.timer = 0; // > 0 betekent: bezig met slaan (of afkoelen)
    this.swingId = 0; // elke slag krijgt een nummer, zodat een vijand maar één keer per slag geraakt wordt
    this.reset();
  }

  /** Ander wapen in je hand nemen (een sleutel uit WEAPONS, bijv. 'katana'). */
  setWeapon(key) {
    this.weaponKey = key;
    const weapon = WEAPONS[key];
    this.name = weapon.name;
    this.damage = weapon.damage;
    this.range = weapon.range;
    this.swingTime = weapon.swingTime;

    if (this.weaponMesh) this.pitchPivot.remove(this.weaponMesh);
    this.weaponMesh = createWeaponMesh(key);
    this.pitchPivot.add(this.weaponMesh);

    this.trail.geometry.dispose();
    this.trail.geometry = new THREE.RingGeometry(0.6, this.range - 0.3, 24, 1, 0, SWING_TO - SWING_FROM);
    this.trail.geometry.rotateX(-Math.PI / 2); // plat leggen
  }

  reset() {
    this.timer = 0;
    this.yawPivot.rotation.y = REST_YAW;
    this.pitchPivot.rotation.x = REST_PITCH;
    this.trail.material.opacity = 0;
    if (this.weaponKey !== START_WEAPON) this.setWeapon(START_WEAPON);
  }

  /** Probeer een slag te beginnen. Geeft true terug als het lukte. */
  swing() {
    if (this.timer > 0) return false;
    this.timer = this.swingTime + COOLDOWN;
    this.swingId++;
    return true;
  }

  /** Is het wapen nu aan het raken? (het middelste deel van de slag) */
  get isHitting() {
    const t = this.progress;
    return t > 0.1 && t < 0.85;
  }

  /** 0 → 1 tijdens de slag, daarna 1 (of 0 als er niet geslagen wordt). */
  get progress() {
    if (this.timer <= 0) return 0;
    const elapsed = this.swingTime + COOLDOWN - this.timer;
    return Math.min(1, elapsed / this.swingTime);
  }

  update(dt) {
    if (this.timer <= 0) {
      // Soepel terug naar de rusthouding
      const k = 1 - Math.exp(-15 * dt);
      this.yawPivot.rotation.y += (REST_YAW - this.yawPivot.rotation.y) * k;
      this.pitchPivot.rotation.x += (REST_PITCH - this.pitchPivot.rotation.x) * k;
      return;
    }

    this.timer -= dt;
    const t = this.progress;
    const eased = 1 - Math.pow(1 - t, 3); // snel beginnen, rustig eindigen

    if (t < 1) {
      this.yawPivot.rotation.y = SWING_FROM + (SWING_TO - SWING_FROM) * eased;
      this.pitchPivot.rotation.x = SWING_PITCH;
    }
    this.trail.material.opacity = t < 1 ? 0.35 * Math.sin(t * Math.PI) : 0;
  }
}
