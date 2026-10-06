import * as THREE from 'three';
import { WEAPONS, START_WEAPON, createWeaponMesh } from './weapons.js';

// Het wapen in de hand van de speler: welk wapen, en de timing van een slag.
// De arm-beweging zelf zit in animator.js. Welke wapens er zijn staat in weapons.js.

const COOLDOWN = 0.12; // pauze na een slag voordat je weer kunt slaan

export class Sword {
  constructor() {
    // "grip" zit in de hand. Het wapen wijst langs +Y; we draaien het zodat
    // het naar voren wijst als de arm naar beneden hangt.
    this.grip = new THREE.Group();
    this.grip.rotation.x = Math.PI / 2;

    this.weaponMesh = null;
    this.timer = 0; // > 0 betekent: bezig met slaan (of afkoelen)
    this.swingId = 0; // elke slag krijgt een nummer, zodat een vijand maar één keer per slag geraakt wordt
    this.reset();
  }

  /**
   * Stop het wapen in een hand.
   * @param {THREE.Object3D} hand
   * @param {number} unit  hoeveel eenheden van het model één meter in de wereld is (bij een geschaald model)
   */
  attachTo(hand, unit = 1) {
    hand.add(this.grip);
    this.grip.scale.setScalar(unit);
  }

  /** Ander wapen in je hand nemen (een sleutel uit WEAPONS, bijv. 'katana'). */
  setWeapon(key) {
    this.weaponKey = key;
    const weapon = WEAPONS[key];
    this.name = weapon.name;
    this.damage = weapon.damage;
    this.range = weapon.range;
    this.swingTime = weapon.swingTime;
    this.blade = weapon.blade ?? [0.05, weapon.muzzle ?? 0.8];
    this.trailColor = weapon.trail;
    this.stamina = weapon.stamina;
    this.weapon = weapon;
    this.ranged = weapon.ranged ?? null;

    if (this.weaponMesh) this.grip.remove(this.weaponMesh);
    this.weaponMesh = createWeaponMesh(key);
    this.grip.add(this.weaponMesh);
  }

  reset() {
    this.timer = 0;
    if (this.weaponKey !== START_WEAPON) this.setWeapon(START_WEAPON);
  }

  /** Probeer een slag te beginnen. Geeft true terug als het lukte. */
  swing() {
    if (this.timer > 0) return false;
    this.timer = this.swingTime + COOLDOWN;
    this.swingId++;
    return true;
  }

  /** Hoe ver de slag is: 0 → 1, of null als je niet aan het slaan bent. */
  get attackProgress() {
    const elapsed = this.swingTime + COOLDOWN - this.timer;
    if (this.timer <= 0 || elapsed >= this.swingTime) return null;
    return elapsed / this.swingTime;
  }

  /** Raakt het wapen nu? (het stuk van de slag waarin het naar beneden komt) */
  get isHitting() {
    const t = this.attackProgress;
    return t !== null && t > 0.35 && t < 0.8;
  }

  update(dt) {
    if (this.timer > 0) this.timer -= dt;
  }

  /** Waar het lemmet nu is in de wereld: onderkant en punt (voor het zwaard-windje). */
  getBladeWorld(base, tip) {
    this.grip.localToWorld(base.set(0, this.blade[0], 0));
    this.grip.localToWorld(tip.set(0, this.blade[1], 0));
  }
}
