import * as THREE from 'three';

// Laat het poppetje bewegen: lopen, slaan, springen en iets oppakken.
// Werkt met elk poppetje dat deze onderdelen heeft (een "rig"):
//   hips  = bovenlijf (draait om de heupen)   armL / armR = armen (draaien om de schouder)
//   legL / legR = benen (draaien om de heup)  handR = de rechterhand, daar zit het wapen in
// Alle armen en benen hangen in rust recht naar beneden (-Y), de voorkant is +Z.
// Hoeken zijn in radialen: 1.57 is een kwart slag.

// Houding van de rechterarm (met het wapen) in rust: een beetje naar voren, elleboog licht gebogen,
// en de pols zo gekanteld dat het wapen schuin omhoog wijst
const READY_ARM = { x: -0.35, z: 0, elbow: -0.45, wrist: -0.1 };

// De slag: [moment (0 → 1), arm.x, arm.z, pols, bovenlijf draaien, bovenlijf voorover, elleboog, uitvalspas]
// Een horizontale slag van rechts naar links: eerst de arm (met het wapen) opzij naar rechts
// uithalen met gebogen elleboog, dan met een stap naar voren in een grote boog vóór je langs naar links zwaaien,
// en even uitzwaaien voordat je weer klaar staat.
// (arm.x = -1.4 betekent: arm bijna horizontaal; arm.z bepaalt dan de richting: - is rechts, + is links)
const ATTACK_KEYS = [
  [0.0, READY_ARM.x, READY_ARM.z, READY_ARM.wrist, 0, 0, READY_ARM.elbow, 0],
  [0.3, -1.35, -1.55, 1.15, -0.6, -0.05, -0.75, 0.25], // uithalen naar rechts, gewicht naar achteren
  [0.62, -1.35, 1.0, 1.3, 0.5, 0.14, -0.05, 1], // zwaai naar links met gestrekte arm: raak!
  [0.82, -1.15, 1.3, 1.2, 0.62, 0.12, -0.35, 0.9], // uitzwaaien
  [1.0, READY_ARM.x, READY_ARM.z, READY_ARM.wrist, 0, 0, READY_ARM.elbow, 0], // terug
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
    // Knieën en ellebogen zijn er niet bij elk poppetje: dan draaien we "lucht"
    for (const key of ['kneeL', 'kneeR', 'elbowL', 'elbowR']) rig[key] ??= new THREE.Object3D();
    this.walkPhase = 0;
    this.walkAmount = 0; // 0 = stilstaan, 1 = volop lopen (vloeit soepel over)
    this.runAmount = 0; // 0 = lopen, 1 = rennen
    this.airAmount = 0; // 0 = op de grond, 1 = in de lucht
    this.time = 0;
    this.baseHipsY = rig.hips.position.y;
    this.landDip = 0; // > 0 net na een landing: even door de knieën veren
    this.wasOnGround = true;
    this.lastVy = 0;
    this.bank = 0; // meeleunen in een bocht
    this.lean = 0; // voorover bij optrekken, achterover bij afremmen
    this.prevWalk = 0;
  }

  /**
   * @param {number} dt
   * @param {object} s  { moving, run, onGround, vy (snelheid omhoog), turn (draaisnelheid), attack (0..1 of null), pickup (0..1 of null), ... }
   */
  update(dt, s) {
    const { hips, armL, armR, legL, legR, handR, kneeL, kneeR, elbowL, elbowR } = this.rig;
    this.time += dt;
    const blend = (current, target, speed) => current + (target - current) * Math.min(1, speed * dt);
    this.walkAmount = blend(this.walkAmount, s.moving && s.onGround ? 1 : 0, 10);
    this.runAmount = blend(this.runAmount, s.run && s.moving ? 1 : 0, 6);
    this.airAmount = blend(this.airAmount, s.onGround ? 0 : 1, 12);
    const run = this.runAmount;
    if (s.moving) this.walkPhase += dt * (9.5 + 4 * run); // rennen = snellere passen

    const w = this.walkAmount;
    const air = this.airAmount;

    // Landen: hoe harder je neerkomt, hoe dieper je door de knieën veert
    const vy = s.vy ?? 0;
    if (!s.onGround) this.lastVy = vy;
    if (s.onGround && !this.wasOnGround) this.landDip = THREE.MathUtils.clamp(-this.lastVy / 14, 0.25, 1);
    this.wasOnGround = s.onGround;
    this.landDip = Math.max(0, this.landDip - dt * 3.5);
    const dip = Math.sin(Math.min(1, this.landDip) * Math.PI * 0.5) * this.landDip; // snel omlaag, rustig omhoog
    // In de lucht: omhoog = benen opgetrokken, vallen = benen gestrekt en armen omhoog voor balans
    const fall = air * THREE.MathUtils.clamp(-vy / 9, 0, 1);
    const rise = air * (1 - fall);
    // Meeleunen in bochten en bij optrekken/afremmen
    this.bank = blend(this.bank, THREE.MathUtils.clamp((s.turn ?? 0) * -0.05, -0.22, 0.22) * w, 8);
    this.lean = blend(this.lean, THREE.MathUtils.clamp((w - this.prevWalk) / Math.max(dt, 1e-3), -3, 3) * 0.06, 10);
    this.prevWalk = w;

    const swing = Math.sin(this.walkPhase);
    const swingV = Math.cos(this.walkPhase); // < 0: linkerbeen gaat naar voren
    const stride = 0.55 + 0.35 * run; // grotere passen tijdens rennen
    const unit = this.rig.unit;

    // ---------- Benen: heup zwaait, knie buigt als het been naar voren komt ----------
    legL.rotation.x = swing * stride * w - 0.75 * rise - 0.15 * fall - 0.35 * dip;
    legR.rotation.x = -swing * stride * w + 0.3 * rise + 0.2 * fall - 0.2 * dip;
    const kneeBend = 0.55 + 0.75 * run;
    // De knie buigt vooral als het been naar voren zwaait (voet van de grond), en een beetje bij het neerzetten
    kneeL.rotation.x = (0.1 + kneeBend * Math.max(0, -swingV) + 0.12 * Math.max(0, swing)) * w + 1.15 * rise + 0.25 * fall + 0.8 * dip;
    kneeR.rotation.x = (0.1 + kneeBend * Math.max(0, swingV) + 0.12 * Math.max(0, -swing)) * w + 0.6 * rise + 0.35 * fall + 0.6 * dip;

    // ---------- Bovenlijf: wiegen en veren tijdens lopen, ademen en gewicht verplaatsen tijdens stilstaan ----------
    const idle = 1 - w;
    const breathe = Math.sin(this.time * 2.2) * 0.012 * idle;
    const sway = Math.sin(this.time * 0.8) * idle; // langzaam van het ene been op het andere
    hips.position.y = this.baseHipsY + (Math.abs(swingV) * (0.04 + 0.06 * run) - 0.035 * run) * w * unit + breathe * unit - 0.12 * dip * unit;
    hips.rotation.y = swing * (0.12 + 0.1 * run) * w;
    hips.rotation.x = (0.07 + 0.22 * run) * w + this.lean + 0.25 * dip - 0.08 * fall; // voorover leunen, vooral tijdens rennen
    hips.rotation.z = swing * 0.035 * w + this.bank + sway * 0.025;
    legL.rotation.z = -sway * 0.03;
    legR.rotation.z = -sway * 0.03;

    // ---------- Linkerarm: zwaait tegengesteld aan het linkerbeen, pompt tijdens rennen ----------
    armL.rotation.x = -swing * (0.6 + 0.4 * run) * w - 0.5 * rise - 0.9 * fall + 0.2 * dip + Math.sin(this.time * 2.2) * 0.03 * idle;
    armL.rotation.z = 0.08 + 0.6 * rise + 0.9 * fall + 0.1 * dip; // armen uit elkaar tijdens een sprong
    elbowL.rotation.x = -(0.2 + 0.25 * w + 1.1 * run * w) - 0.3 * air;

    // ---------- Rechterarm: houdt het wapen klaar ----------
    armR.rotation.x = READY_ARM.x + swing * (0.15 + 0.25 * run) * w - 0.4 * rise - 0.6 * fall - 0.2 * run + 0.15 * dip;
    armR.rotation.z = READY_ARM.z - 0.4 * air;
    elbowR.rotation.x = READY_ARM.elbow - 0.35 * run * w;
    handR.rotation.x = READY_ARM.wrist - 0.5 * run * w; // tijdens rennen wijst het wapen naar achteren

    // ---------- Slaan ----------
    if (s.attack !== null) {
      const [, ax, az, wrist, twist, lean, elbow, lunge] = sampleKeys(ATTACK_KEYS, s.attack);
      armR.rotation.x = ax;
      armR.rotation.z = az;
      elbowR.rotation.x = elbow;
      handR.rotation.x = wrist;
      hips.rotation.y += twist;
      hips.rotation.x += lean;
      // Andere arm: eerst naar voren (mikken), dan naar achteren voor balans
      armL.rotation.x = THREE.MathUtils.lerp(armL.rotation.x, -0.6 + 0.9 * lunge, 0.7);
      armL.rotation.z = THREE.MathUtils.lerp(armL.rotation.z, 0.35 * lunge, 0.7);
      elbowL.rotation.x = -0.6;
      // Uitvalspas: linkervoet naar voren, rechts naar achteren, door de knieën
      const l = lunge * (1 - w * 0.5);
      legL.rotation.x += -0.45 * l;
      kneeL.rotation.x += 0.45 * l;
      legR.rotation.x += 0.3 * l;
      kneeR.rotation.x += 0.2 * l;
      hips.position.y -= 0.06 * l * unit;
    }

    // ---------- Oppakken: door de knieën en met de rechterhand naar de grond reiken ----------
    if (s.pickup !== null) {
      const reach = Math.sin(s.pickup * Math.PI); // 0 → 1 → 0
      hips.rotation.x += 0.6 * reach;
      hips.position.y -= 0.3 * reach * unit;
      armR.rotation.x = THREE.MathUtils.lerp(armR.rotation.x, -0.9, reach);
      armR.rotation.z = THREE.MathUtils.lerp(armR.rotation.z, 0.15, reach);
      elbowR.rotation.x = THREE.MathUtils.lerp(elbowR.rotation.x, -0.1, reach);
      handR.rotation.x = THREE.MathUtils.lerp(handR.rotation.x, 0.3, reach);
      legL.rotation.x += -0.8 * reach;
      kneeL.rotation.x += 1.2 * reach;
      legR.rotation.x += -0.3 * reach;
      kneeR.rotation.x += 0.9 * reach;
    }

    // ---------- Flesje drinken: linkerhand naar de mond ----------
    if (s.drink) {
      const lift = Math.sin(Math.min(1, s.drink * 1.4) * Math.PI);
      armL.rotation.x = THREE.MathUtils.lerp(armL.rotation.x, -1.3, lift);
      armL.rotation.z = THREE.MathUtils.lerp(armL.rotation.z, -0.35, lift);
      elbowL.rotation.x = THREE.MathUtils.lerp(elbowL.rotation.x, -2.1, lift);
      hips.rotation.x -= 0.15 * lift; // hoofd een beetje naar achteren
    }

    // ---------- Wervelslag: wapen recht opzij gestrekt ----------
    if (s.spin) {
      armR.rotation.x = -1.45;
      armR.rotation.z = -1.4;
      elbowR.rotation.x = 0;
      handR.rotation.x = 1.4;
      armL.rotation.z = 1.2;
      kneeL.rotation.x = kneeR.rotation.x = 0.4;
    }

    // ---------- Rollen / dashen / grondslag: ineengedoken ----------
    if (s.tuck) {
      legL.rotation.x = -1.3;
      legR.rotation.x = -1.1;
      kneeL.rotation.x = 1.9;
      kneeR.rotation.x = 1.8;
      armL.rotation.x = -1;
      armR.rotation.x = -0.8;
      elbowL.rotation.x = -1.2;
      hips.rotation.x = 0.5;
    }

    // ---------- NPC's: zwaaien naar de speler ----------
    if (s.wave) {
      armR.rotation.x = -0.3;
      armR.rotation.z = -2.6;
      elbowR.rotation.x = -0.2;
      armR.rotation.x += Math.sin(this.time * 9) * 0.25;
    }
  }
}
