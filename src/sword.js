import * as THREE from 'three';

// Instellingen van het zwaard
const SWING_TIME = 0.28; // hoe lang een slag duurt (seconden)
const COOLDOWN = 0.15; // pauze na een slag voordat je weer kunt slaan
export const SWORD_RANGE = 2.3; // hoe ver het zwaard reikt

// Rusthouding en slag-hoeken (radialen)
const REST_YAW = -0.35;
const REST_PITCH = 0.3;
const SWING_FROM = -1.4; // rechts van de speler
const SWING_TO = 1.5; // links van de speler
const SWING_PITCH = 1.45; // bijna horizontaal naar voren

export class Sword {
  /** @param {THREE.Object3D} holder  het object waar het zwaard aan vastzit (de speler) */
  constructor(holder) {
    // Twee draaipunten in elkaar: yaw (links/rechts) en pitch (omhoog/naar voren)
    this.yawPivot = new THREE.Group();
    this.yawPivot.position.set(-0.55, 0.85, 0.1); // rechterhand (+Z is de voorkant)
    this.pitchPivot = new THREE.Group();
    this.yawPivot.add(this.pitchPivot);
    holder.add(this.yawPivot);

    const metal = new THREE.MeshStandardMaterial({ color: 0xdfe6ee, metalness: 0.8, roughness: 0.25 });
    const gold = new THREE.MeshStandardMaterial({ color: 0xd4a017, metalness: 0.6, roughness: 0.35 });
    const leather = new THREE.MeshStandardMaterial({ color: 0x6b3e1f, roughness: 0.8 });

    // Het zwaard wijst langs +Y vanaf het handvat
    const parts = [
      [new THREE.CylinderGeometry(0.045, 0.045, 0.28, 8), leather, 0.0], // handvat
      [new THREE.SphereGeometry(0.07, 10, 10), gold, -0.16], // knop onderaan
      [new THREE.BoxGeometry(0.42, 0.07, 0.1), gold, 0.16], // pareerstang
      [new THREE.BoxGeometry(0.11, 1.0, 0.035), metal, 0.69], // kling
      [new THREE.ConeGeometry(0.078, 0.18, 4), metal, 1.28], // punt
    ];
    for (const [geo, mat, y] of parts) {
      const mesh = new THREE.Mesh(geo, mat);
      mesh.position.y = y;
      mesh.castShadow = true;
      this.pitchPivot.add(mesh);
    }
    // De punt (kegel met 4 kanten) plat draaien zodat hij op de kling aansluit
    this.pitchPivot.children[4].rotation.y = Math.PI / 4;
    this.pitchPivot.children[4].scale.z = 0.4;

    // Een doorzichtige "zwiep"-boog die even zichtbaar is tijdens een slag
    const trailGeo = new THREE.RingGeometry(0.6, SWORD_RANGE - 0.3, 24, 1, 0, SWING_TO - SWING_FROM);
    trailGeo.rotateX(-Math.PI / 2); // plat leggen
    this.trail = new THREE.Mesh(
      trailGeo,
      new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0, side: THREE.DoubleSide, depthWrite: false })
    );
    this.trail.position.set(0, 0.85, 0);
    // RingGeometry begint op de +X as; draai zodat de boog van rechts naar links voor de speler loopt
    this.trail.rotation.y = -Math.PI / 2 + SWING_FROM;
    holder.add(this.trail);

    this.timer = 0; // > 0 betekent: bezig met slaan (of afkoelen)
    this.swingId = 0; // elke slag krijgt een nummer, zodat een vijand maar één keer per slag geraakt wordt
    this.reset();
  }

  reset() {
    this.timer = 0;
    this.yawPivot.rotation.y = REST_YAW;
    this.pitchPivot.rotation.x = REST_PITCH;
    this.trail.material.opacity = 0;
  }

  /** Probeer een slag te beginnen. Geeft true terug als het lukte. */
  swing() {
    if (this.timer > 0) return false;
    this.timer = SWING_TIME + COOLDOWN;
    this.swingId++;
    return true;
  }

  /** Is het zwaard nu aan het raken? (het middelste deel van de slag) */
  get isHitting() {
    const t = this.progress;
    return t > 0.1 && t < 0.85;
  }

  /** 0 → 1 tijdens de slag, daarna 1 (of 0 als er niet geslagen wordt). */
  get progress() {
    if (this.timer <= 0) return 0;
    const elapsed = SWING_TIME + COOLDOWN - this.timer;
    return Math.min(1, elapsed / SWING_TIME);
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
