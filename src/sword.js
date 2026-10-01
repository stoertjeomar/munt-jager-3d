import * as THREE from 'three';

// Instellingen van het zwaard
const SWING_TIME = 0.28; // hoe lang een slag duurt (seconden)
const COOLDOWN = 0.15; // pauze na een slag voordat je weer kunt slaan
export const SWORD_RANGE = 2.4; // hoe ver het zwaard reikt

// Rusthouding en slag-hoeken (radialen)
const REST_YAW = -0.35;
const REST_PITCH = 0.3;
const SWING_FROM = -1.4; // rechts van de speler
const SWING_TO = 1.5; // links van de speler
const SWING_PITCH = 1.45; // bijna horizontaal naar voren

// Het zwaard is "pixel art" van blokjes, net als een diamanten zwaard in Minecraft.
// Elke letter is één blokje; de bovenste regel is de punt. Teken je eigen zwaard!
//   d = donkergroene rand   m = turquoise   l = lichtblauw
//   g = goud                b = donker goud   . = leeg
const SWORD_PIXELS = [
  '.....d.....',
  '....dld....',
  '...dllmd...',
  '...dlmld...',
  '...dmlld...',
  '...dllmd...',
  '...dlmld...',
  '...dmlld...',
  '...dllmd...',
  '...dlmld...',
  '...dmlld...',
  '...dllmd...',
  '...dlmld...',
  '...dmlld...',
  'dd.dlmld.dd',
  'dldllmlldld',
  'dlllmmmllld',
  'ddddddddddd',
  '....gbg....',
  '....bgb....',
  '....gbg....',
  '...ddldd...',
  '...dlmld...',
  '....ddd....',
];
const PIXEL = 0.065; // grootte van één blokje
const HANDLE_ROW = 19; // deze regel zit in de hand

const PIXEL_COLORS = {
  d: { color: 0x0d4a3c, roughness: 0.6 },
  m: { color: 0x2fa58f, roughness: 0.35, emissive: 0x0b3b33 },
  l: { color: 0x8ff0dc, roughness: 0.25, emissive: 0x1d5c50 },
  g: { color: 0xd9a52b, roughness: 0.4, metalness: 0.4 },
  b: { color: 0x8a5a14, roughness: 0.6 },
};

/** Bouwt het zwaard uit blokjes. Per kleur één InstancedMesh, dat is snel. */
function buildBlockSword() {
  const group = new THREE.Group();
  const cube = new THREE.BoxGeometry(PIXEL, PIXEL, PIXEL * 1.4);
  const width = SWORD_PIXELS[0].length;

  for (const [letter, settings] of Object.entries(PIXEL_COLORS)) {
    const spots = [];
    SWORD_PIXELS.forEach((row, r) => {
      [...row].forEach((ch, c) => {
        if (ch === letter) spots.push([c, r]);
      });
    });
    if (spots.length === 0) continue;

    const mesh = new THREE.InstancedMesh(cube, new THREE.MeshStandardMaterial({ flatShading: true, ...settings }), spots.length);
    const m = new THREE.Matrix4();
    spots.forEach(([c, r], i) => {
      m.makeTranslation((c - (width - 1) / 2) * PIXEL, (HANDLE_ROW - r) * PIXEL, 0);
      mesh.setMatrixAt(i, m);
    });
    mesh.castShadow = true;
    group.add(mesh);
  }
  return group;
}

export class Sword {
  /** @param {THREE.Object3D} holder  het object waar het zwaard aan vastzit (de speler) */
  constructor(holder) {
    // Twee draaipunten in elkaar: yaw (links/rechts) en pitch (omhoog/naar voren)
    this.yawPivot = new THREE.Group();
    this.yawPivot.position.set(-0.55, 0.85, 0.1); // rechterhand (+Z is de voorkant)
    this.pitchPivot = new THREE.Group();
    this.yawPivot.add(this.pitchPivot);
    holder.add(this.yawPivot);

    // Het zwaard wijst langs +Y; het handvat zit in het draaipunt (de hand)
    this.pitchPivot.add(buildBlockSword());

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
