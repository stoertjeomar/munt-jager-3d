import * as THREE from 'three';

// Laat het poppetje bewegen: lopen, slaan, springen en iets oppakken.
// Werkt met elk poppetje dat deze onderdelen heeft (een "rig"):
//   hips  = bovenlijf (draait om de heupen)   armL / armR = armen (draaien om de schouder)
//   legL / legR = benen (draaien om de heup)  handR = de rechterhand, daar zit het wapen in
// Alle armen en benen hangen in rust recht naar beneden (-Y), de voorkant is +Z.
// Hoeken zijn in radialen: 1.57 is een kwart slag.

// Houding van de rechterarm (met het wapen) in rust: een beetje naar voren,
// en de pols iets naar achteren gekanteld zodat het wapen schuin omhoog wijst
const READY_ARM = { x: -0.35, z: 0, wrist: -0.55 };

// De slag: [moment (0 → 1), arm.x, arm.z, pols, bovenlijf draaien, bovenlijf voorover]
// Eerst het wapen omhoog achter de schouder (uithalen), dan schuin naar beneden over je lijf heen.
const ATTACK_KEYS = [
  [0.0, READY_ARM.x, READY_ARM.z, READY_ARM.wrist, 0, 0],
  [0.3, -2.7, -0.55, -0.4, -0.45, -0.1], // uithalen
  [0.65, -0.5, 0.55, 0.6, 0.4, 0.25], // raak! wapen naar voren-beneden
  [1.0, READY_ARM.x, READY_ARM.z, READY_ARM.wrist, 0, 0], // terug
];

/** Zoek de waarden tussen twee sleutelmomenten (soepel overvloeien). */
function sampleKeys(keys, t) {
  for (let i = 1; i < keys.length; i++) {
    if (t <= keys[i][0]) {
      const a = keys[i - 1];
      const b = keys[i];
      let k = (t - a[0]) / (b[0] - a[0]);
      k = k * k * (3 - 2 * k); // smoothstep: zacht beginnen en eindigen
      return a.map((v, j) => v + (b[j] - v) * k);
    }
  }
  return keys[keys.length - 1];
}

export class CharacterAnimator {
  constructor(rig) {
    this.rig = rig;
    this.walkPhase = 0;
    this.walkAmount = 0; // 0 = stilstaan, 1 = volop lopen (vloeit soepel over)
    this.airAmount = 0; // 0 = op de grond, 1 = in de lucht
    this.time = 0;
    this.baseHipsY = rig.hips.position.y;
  }

  /**
   * @param {number} dt
   * @param {object} s  { moving, onGround, attack (0..1 of null), pickup (0..1 of null) }
   */
  update(dt, s) {
    const { hips, armL, armR, legL, legR, handR } = this.rig;
    this.time += dt;
    const blend = (current, target, speed) => current + (target - current) * Math.min(1, speed * dt);
    this.walkAmount = blend(this.walkAmount, s.moving && s.onGround ? 1 : 0, 10);
    this.airAmount = blend(this.airAmount, s.onGround ? 0 : 1, 12);
    if (s.moving) this.walkPhase += dt * 10;

    const w = this.walkAmount;
    const air = this.airAmount;
    const swing = Math.sin(this.walkPhase);

    // ---------- Benen ----------
    legL.rotation.x = swing * 0.55 * w + (-0.6 * air);
    legR.rotation.x = -swing * 0.55 * w + 0.35 * air;

    // ---------- Bovenlijf: wiegen tijdens lopen, ademen tijdens stilstaan ----------
    const breathe = Math.sin(this.time * 2.2) * 0.012 * (1 - w);
    hips.position.y = this.baseHipsY + Math.abs(Math.cos(this.walkPhase)) * 0.04 * w * this.rig.unit + breathe * this.rig.unit;
    hips.rotation.y = swing * 0.1 * w;
    hips.rotation.x = 0.06 * w; // een beetje voorover tijdens lopen
    hips.rotation.z = 0;

    // ---------- Linkerarm: zwaait tegengesteld aan het linkerbeen ----------
    armL.rotation.x = -swing * 0.6 * w - 0.5 * air + Math.sin(this.time * 2.2) * 0.03;
    armL.rotation.z = 0.08 + 0.7 * air; // armen uit elkaar tijdens een sprong

    // ---------- Rechterarm: houdt het wapen klaar ----------
    armR.rotation.x = READY_ARM.x + swing * 0.15 * w - 0.4 * air;
    armR.rotation.z = READY_ARM.z - 0.4 * air;
    handR.rotation.x = READY_ARM.wrist;

    // ---------- Slaan ----------
    if (s.attack !== null) {
      const [, ax, az, wrist, twist, lean] = sampleKeys(ATTACK_KEYS, s.attack);
      armR.rotation.x = ax;
      armR.rotation.z = az;
      handR.rotation.x = wrist;
      hips.rotation.y += twist;
      hips.rotation.x += lean;
      armL.rotation.x = THREE.MathUtils.lerp(armL.rotation.x, -0.5, 0.6); // andere arm naar voren voor balans
    }

    // ---------- Oppakken: bukken en met de rechterhand naar de grond reiken ----------
    if (s.pickup !== null) {
      const reach = Math.sin(s.pickup * Math.PI); // 0 → 1 → 0
      hips.rotation.x += 0.75 * reach;
      armR.rotation.x = THREE.MathUtils.lerp(armR.rotation.x, -0.9, reach);
      armR.rotation.z = THREE.MathUtils.lerp(armR.rotation.z, 0.15, reach);
      handR.rotation.x = THREE.MathUtils.lerp(handR.rotation.x, 0.3, reach);
      legL.rotation.x += -0.35 * reach; // door de knieën (ongeveer)
      legR.rotation.x += 0.25 * reach;
    }
  }
}
