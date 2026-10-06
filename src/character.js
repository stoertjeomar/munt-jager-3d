import * as THREE from 'three';

// Het poppetje van de speler, gebouwd uit simpele vormen:
// strohoed, rood hemd, blauwe korte broek en sandalen.
// +Z is de voorkant. De voeten staan op y = 0 en hij is ongeveer 1.6 hoog.

const COLORS = {
  skin: 0xf1c27d,
  hair: 0x161616,
  shirt: 0xc8262c,
  shorts: 0x2f5fb3,
  cuff: 0xf4f4f4,
  sash: 0xf2c94c,
  straw: 0xe9b949,
  band: 0xd93a2b,
  sandal: 0x8a5a2b,
  dark: 0x111111,
  white: 0xffffff,
};

/** Maakt een mesh met schaduw. */
function part(geometry, color, x = 0, y = 0, z = 0) {
  const mesh = new THREE.Mesh(geometry, new THREE.MeshStandardMaterial({ color, roughness: 0.7 }));
  mesh.position.set(x, y, z);
  mesh.castShadow = true;
  return mesh;
}

/** @param {object} colors  andere kleuren dan het standaard-poppetje (bijv. { shirt: 0x2f8a45 }) */
export function buildCharacter(colors = {}) {
  const C = { ...COLORS, ...colors };
  const group = new THREE.Group();
  const rig = { unit: 1 }; // de onderdelen die animator.js laat bewegen

  // Bovenlijf: draait om de heupen. Binnenin gebruiken we gewone hoogtes (upper staat op y = 0).
  const hips = new THREE.Group();
  hips.position.y = 0.72;
  group.add(hips);
  const upper = new THREE.Group();
  upper.position.y = -0.72;
  hips.add(upper);
  rig.hips = hips;

  // ---------- Benen (draaien om de heup) ----------
  for (const [name, side] of [['legL', 1], ['legR', -1]]) {
    const hip = new THREE.Group();
    hip.position.set(side * 0.11, 0.72, 0);
    // korte broek
    hip.add(part(new THREE.CylinderGeometry(0.1, 0.11, 0.3, 12), C.shorts, 0, -0.13, 0));
    // witte omslag onderaan de broek
    hip.add(part(new THREE.CylinderGeometry(0.115, 0.115, 0.06, 12), C.cuff, 0, -0.29, 0));
    // been
    hip.add(part(new THREE.CylinderGeometry(0.055, 0.05, 0.4, 10), C.skin, 0, -0.5, 0));
    // sandaal
    hip.add(part(new THREE.BoxGeometry(0.13, 0.04, 0.26), C.sandal, 0, -0.7, 0.04));
    group.add(hip);
    rig[name] = hip;
  }

  // ---------- Romp ----------
  upper.add(part(new THREE.CylinderGeometry(0.2, 0.19, 0.08, 16), C.sash, 0, 0.74, 0)); // gele sjerp
  upper.add(part(new THREE.BoxGeometry(0.4, 0.38, 0.24), C.shirt, 0, 0.96, 0)); // rood hemd
  upper.add(part(new THREE.BoxGeometry(0.1, 0.3, 0.02), C.skin, 0, 1.0, 0.121)); // open hemd: blote borst
  for (const y of [0.88, 0.96, 1.04]) {
    upper.add(part(new THREE.SphereGeometry(0.018, 8, 8), C.sash, 0.07, y, 0.125)); // knoopjes
  }

  // ---------- Armen (draaien om de schouder) ----------
  for (const [name, side] of [['armL', 1], ['armR', -1]]) {
    const shoulder = new THREE.Group();
    shoulder.position.set(side * 0.26, 1.1, 0);
    shoulder.add(part(new THREE.SphereGeometry(0.075, 12, 12), C.shirt, 0, 0, 0));
    shoulder.add(part(new THREE.CylinderGeometry(0.065, 0.06, 0.26, 10), C.shirt, 0, -0.14, 0)); // mouw
    shoulder.add(part(new THREE.CylinderGeometry(0.045, 0.04, 0.14, 10), C.skin, 0, -0.33, 0)); // onderarm
    shoulder.add(part(new THREE.SphereGeometry(0.055, 10, 10), C.skin, 0, -0.42, 0)); // hand
    upper.add(shoulder);
    rig[name] = shoulder;
    if (side === -1) {
      // Rechterhand: hier komt het wapen
      rig.handR = new THREE.Group();
      rig.handR.position.y = -0.42;
      shoulder.add(rig.handR);
    }
  }

  // ---------- Hoofd ----------
  const head = new THREE.Group();
  head.position.y = 1.33;
  upper.add(head);
  head.add(part(new THREE.SphereGeometry(0.19, 20, 16), C.skin)); // gezicht
  head.add(part(new THREE.CylinderGeometry(0.06, 0.07, 0.06, 10), C.skin, 0, -0.18, 0)); // nek

  // Zwart haar: een kapje over boven- en achterkant, plus een paar plukjes
  const hair = part(new THREE.SphereGeometry(0.2, 20, 12, 0, Math.PI * 2, 0, Math.PI * 0.55), C.hair);
  hair.rotation.x = -0.6; // naar achteren gekanteld: bedekt het achterhoofd, gezicht blijft vrij
  head.add(hair);
  for (const [x, y, z] of [[-0.09, 0.1, 0.15], [0, 0.12, 0.16], [0.09, 0.1, 0.15], [-0.18, 0.0, 0.05], [0.18, 0.0, 0.05]]) {
    const tuft = part(new THREE.ConeGeometry(0.035, 0.08, 6), C.hair, x, y, z);
    tuft.rotation.x = Math.PI; // puntje naar beneden
    head.add(tuft);
  }

  // Ogen, litteken onder het linkeroog en een grote grijns
  for (const side of [-1, 1]) {
    head.add(part(new THREE.SphereGeometry(0.03, 10, 10), C.dark, side * 0.07, 0.01, 0.17));
  }
  const scar = part(new THREE.BoxGeometry(0.05, 0.008, 0.01), C.dark, 0.08, -0.04, 0.178);
  scar.rotation.z = 0.2;
  head.add(scar);
  const smile = part(new THREE.CylinderGeometry(0.075, 0.075, 0.02, 16, 1, false, Math.PI / 2, Math.PI), C.white, 0, -0.07, 0.165);
  smile.rotation.x = Math.PI / 2; // halve cirkel = lachende mond
  smile.rotation.z = Math.PI;
  head.add(smile);

  // ---------- Strohoed ----------
  const hat = new THREE.Group();
  hat.position.set(0, 0.13, -0.01);
  hat.rotation.x = -0.12; // een beetje naar achteren
  hat.add(part(new THREE.CylinderGeometry(0.36, 0.37, 0.025, 28), C.straw)); // rand
  hat.add(part(new THREE.CylinderGeometry(0.2, 0.21, 0.16, 24), C.straw, 0, 0.09, 0)); // bol
  hat.add(part(new THREE.CylinderGeometry(0.213, 0.213, 0.05, 24), C.band, 0, 0.04, 0)); // rode band
  head.add(hat);

  return { group, rig };
}
