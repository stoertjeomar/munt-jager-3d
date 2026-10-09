import * as THREE from 'three';

// Het 3D-model van NightWalker, het bliksemzwaard van Sky. Geen blokjes, maar een cartoon-zwaard:
// zachte afgeronde vormen, "toon"-belichting (een paar vlakke kleurstappen, zoals in een tekenfilm)
// en een zwarte omlijning eromheen. Het lemmet is nachtzwart met een lichte snede, en er loopt een
// gloeiende gele bliksemschicht doorheen. Het handvat is omwikkeld, met een gouden stootplaat en knop.
//
// Net als de andere wapens: het handvat zit op (0, 0, 0) en het zwaard wijst langs +Y (zie weapons.js).

const BLADE = { base: 0.14, tip: 0.98, width: 0.12 }; // waar het lemmet begint en eindigt, en hoe breed (meter)

// Toon-belichting: drie kleurstappen (donker, midden, licht) in plaats van een vloeiende overgang
let gradient = null;
function toonGradient() {
  if (gradient) return gradient;
  gradient = new THREE.DataTexture(new Uint8Array([90, 170, 255]), 3, 1, THREE.RedFormat);
  gradient.minFilter = gradient.magFilter = THREE.NearestFilter;
  gradient.needsUpdate = true;
  return gradient;
}

/** Een cartoon-materiaal (ook gebruikt voor Sky's haori, zie haori.js). */
export const toon = (color, extra = {}) => new THREE.MeshToonMaterial({ color, gradientMap: toonGradient(), ...extra });

// De zwarte omlijning: dezelfde vorm, een tikje dikker, binnenstebuiten (dan zie je alleen de rand)
const outlines = {};
export function outlineMaterial(width = 0.007) {
  if (outlines[width]) return outlines[width];
  const m = new THREE.MeshBasicMaterial({ color: 0x05060c, side: THREE.BackSide });
  m.onBeforeCompile = (shader) => {
    shader.vertexShader = shader.vertexShader.replace('#include <begin_vertex>', `#include <begin_vertex>\ntransformed += normal * ${width.toFixed(4)};`);
  };
  m.customProgramCacheKey = () => `omlijning-${width}`;
  outlines[width] = m;
  return m;
}

/** Een onderdeel met omlijning. */
function part(geo, mat, outline = true) {
  const g = new THREE.Group();
  const mesh = new THREE.Mesh(geo, mat);
  mesh.castShadow = true;
  g.add(mesh);
  if (outline) g.add(new THREE.Mesh(geo, outlineMaterial()));
  return g;
}

/** De vorm van het lemmet (van opzij): een rechte rug, een licht gebogen snede en een schuine punt. */
function bladeShape(grow = 0) {
  const { base, tip, width } = BLADE;
  const w = width / 2 + grow;
  const s = new THREE.Shape();
  s.moveTo(-w, base - grow);
  s.lineTo(w, base - grow);
  // De snede bolt een beetje uit en loopt dan naar de punt
  s.bezierCurveTo(w + 0.012, base + 0.35, w + 0.008, tip - 0.25, w * 0.55, tip - 0.08 + grow * 0.5);
  s.lineTo(-w * 0.15, tip + grow);
  // De rug: bijna recht, met een klein knikje bij de punt
  s.lineTo(-w, tip - 0.14);
  s.closePath();
  return s;
}

/** Een gloeiende bliksemschicht in het lemmet (een zigzag-vorm). */
function boltShape() {
  const s = new THREE.Shape();
  const pts = [
    [0.004, 0.2], [0.02, 0.2], [0.006, 0.42], [0.026, 0.42], [-0.006, 0.7], [0.012, 0.7], [-0.012, 0.92],
    [0.0, 0.66], [-0.018, 0.66], [0.004, 0.38], [-0.014, 0.38],
  ];
  const k = 1.5; // zo veel breder dan de getallen hierboven
  s.moveTo(pts[0][0] * k, pts[0][1]);
  for (const [x, y] of pts.slice(1)) s.lineTo(x * k, y);
  s.closePath();
  return s;
}

/** Bouwt het hele zwaard. */
export function buildNightWalker(scale = 1) {
  const sword = new THREE.Group();
  const night = toon(0x101430);
  const steel = toon(0xd8e6ff, { emissive: 0x2a3550 });
  const gold = toon(0xffc83d, { emissive: 0x4a3000 });
  const wrap = toon(0x2a2f55);
  const glow = new THREE.MeshBasicMaterial({ color: 0xffe066, toneMapped: false });

  // ---------- Het lemmet: een lichte snede (iets groter, achter) en het zwarte lemmet ervoor ----------
  const bevel = { bevelEnabled: true, bevelSegments: 3, curveSegments: 16 };
  const edgeGeo = new THREE.ExtrudeGeometry(bladeShape(0.01), { depth: 0.006, bevelThickness: 0.004, bevelSize: 0.006, ...bevel });
  edgeGeo.translate(0, 0, -0.003);
  sword.add(part(edgeGeo, steel));
  const bladeGeo = new THREE.ExtrudeGeometry(bladeShape(), { depth: 0.012, bevelThickness: 0.006, bevelSize: 0.004, ...bevel });
  bladeGeo.translate(0, 0, -0.006);
  sword.add(part(bladeGeo, night, false));
  // De bliksemschicht, aan beide kanten van het lemmet
  const boltGeo = new THREE.ExtrudeGeometry(boltShape(), { depth: 0.002, bevelEnabled: false });
  for (const side of [-1, 1]) {
    const bolt = new THREE.Mesh(boltGeo, glow);
    bolt.position.z = side * 0.0135 - 0.001;
    sword.add(bolt);
  }
  // Een rijtje kleine gouden spijkertjes onderaan het lemmet
  for (let i = 0; i < 3; i++) {
    const stud = part(new THREE.SphereGeometry(0.009, 10, 8), gold, false);
    stud.position.set(-0.02, 0.17 + i * 0.03, 0);
    sword.add(stud);
  }

  // ---------- Stootplaat: een gouden ster-schijf met punten als bliksemflitsen ----------
  const guard = new THREE.Shape();
  const points = 8;
  for (let i = 0; i <= points * 2; i++) {
    const a = (i / (points * 2)) * Math.PI * 2;
    const r = i % 2 ? 0.07 : 0.1;
    if (i === 0) guard.moveTo(Math.cos(a) * r, Math.sin(a) * r);
    else guard.lineTo(Math.cos(a) * r, Math.sin(a) * r);
  }
  const guardGeo = new THREE.ExtrudeGeometry(guard, { depth: 0.02, bevelThickness: 0.006, bevelSize: 0.006, ...bevel });
  guardGeo.translate(0, 0, -0.01);
  guardGeo.rotateX(Math.PI / 2); // plat, dwars op het lemmet
  const g = part(guardGeo, gold);
  g.position.y = 0.12;
  g.scale.set(1, 1, 0.55); // een ovale stootplaat
  sword.add(g);
  const collar = part(new THREE.CylinderGeometry(0.03, 0.034, 0.04, 16), gold);
  collar.position.y = 0.155;
  sword.add(collar);

  // ---------- Het handvat: omwikkeld, met gouden ringetjes en een knop met een geel steentje ----------
  const grip = part(new THREE.CylinderGeometry(0.026, 0.024, 0.28, 16), wrap);
  grip.position.y = -0.03;
  sword.add(grip);
  for (let i = 0; i < 6; i++) {
    // Kruislings gewikkeld: schuine ringetjes die om en om de andere kant op staan
    const ring = new THREE.Mesh(new THREE.TorusGeometry(0.027, 0.006, 6, 18), toon(0x4a5590));
    ring.position.y = -0.15 + i * 0.045;
    ring.rotation.set(Math.PI / 2, i % 2 ? 0.35 : -0.35, 0);
    sword.add(ring);
  }
  const pommel = part(new THREE.SphereGeometry(0.036, 16, 12), gold);
  pommel.position.y = -0.19;
  pommel.scale.set(1, 0.8, 1);
  sword.add(pommel);
  const gem = new THREE.Mesh(new THREE.OctahedronGeometry(0.018, 0), glow);
  gem.position.y = -0.225;
  sword.add(gem);
  // Een geel koordje met een kwastje aan de knop
  const cord = new THREE.Mesh(new THREE.TorusGeometry(0.03, 0.005, 6, 16, Math.PI * 1.4), toon(0xffd23a));
  cord.position.set(0.02, -0.24, 0);
  cord.rotation.z = -1.2;
  sword.add(cord);
  const tassel = part(new THREE.ConeGeometry(0.022, 0.09, 10), toon(0xffb21a));
  tassel.position.set(0.05, -0.31, 0);
  sword.add(tassel);
  const knot = part(new THREE.SphereGeometry(0.014, 10, 8), toon(0xffd23a), false);
  knot.position.set(0.05, -0.265, 0);
  sword.add(knot);

  sword.scale.setScalar(scale);
  return sword;
}
