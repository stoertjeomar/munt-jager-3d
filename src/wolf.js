import * as THREE from 'three';
import { makeEye } from './omarFighter.js';

// Bliksemwolven: wolven van wolk en onweer. Sky (skyFighter.js) roept ze op als hij boos is.
// Een wolf is gemaakt van simpele vormen (geen 3D-model nodig): een lijf van wolkige bollen,
// een spitse snuit, puntoren, een pluimstaart en gele bliksem-aders. Met gloeiende rode ogen, net als Sky.

// Wolkig lichtgrijs, een beetje doorzichtig, en de aders gloeien geel
const FUR = { color: 0xc8d2e0, emissive: 0x2a3550, roughness: 0.9, transparent: true, opacity: 0.92 };
const VEIN = { color: 0xffe066, toneMapped: false };

/**
 * Bouwt één bliksemwolf. Geeft { mesh, mats, legs, tail } terug.
 * mats = materialen die mee-faden bij het verschijnen; legs/tail bewegen tijdens het rennen (animateWolf).
 * De wolf kijkt naar +z en staat met zijn pootjes op y = 0.
 */
export function buildWolf(size = 1) {
  const fur = new THREE.MeshStandardMaterial({ ...FUR });
  const vein = new THREE.MeshBasicMaterial({ ...VEIN, transparent: true });
  const mesh = new THREE.Group();
  const body = new THREE.Group();
  body.scale.setScalar(size);
  mesh.add(body);
  const add = (geo, mat, x, y, z, parent = body) => {
    const m = new THREE.Mesh(geo, mat);
    m.position.set(x, y, z);
    m.castShadow = true;
    parent.add(m);
    return m;
  };

  // Lijf: een rij wolkenbollen (dik bij de borst, smaller naar achteren)
  const ball = new THREE.SphereGeometry(1, 12, 9);
  for (const [z, r, y] of [[0.45, 0.36, 0.78], [0.1, 0.33, 0.74], [-0.25, 0.3, 0.72], [-0.52, 0.27, 0.74]]) {
    const b = add(ball, fur, 0, y, z);
    b.scale.set(r, r * 0.95, r * 1.1);
  }
  // Kop met snuit en oren
  const head = new THREE.Group();
  head.position.set(0, 1.02, 0.78);
  body.add(head);
  add(ball, fur, 0, 0, 0, head).scale.setScalar(0.26);
  const snout = add(new THREE.ConeGeometry(0.13, 0.42, 8), fur, 0, -0.06, 0.28, head);
  snout.rotation.x = Math.PI / 2;
  for (const s of [-1, 1]) {
    const ear = add(new THREE.ConeGeometry(0.08, 0.24, 6), fur, s * 0.13, 0.24, -0.02, head);
    ear.rotation.z = -s * 0.25;
  }
  // Rode ogen
  for (const s of [-1, 1]) {
    const eye = makeEye();
    eye.scale.setScalar(0.16);
    eye.position.set(s * 0.1, 0.06, 0.2);
    head.add(eye);
  }
  // Poten (draaien om de heup: dat is het rennen)
  const legGeo = new THREE.CylinderGeometry(0.07, 0.05, 0.62, 6);
  legGeo.translate(0, -0.31, 0);
  const legs = [];
  for (const [x, z] of [[-0.17, 0.45], [0.17, 0.45], [-0.15, -0.5], [0.15, -0.5]]) {
    const leg = add(legGeo, fur, x, 0.66, z);
    legs.push(leg);
  }
  // Pluimstaart
  const tail = new THREE.Group();
  tail.position.set(0, 0.86, -0.72);
  body.add(tail);
  const tailMesh = add(new THREE.ConeGeometry(0.13, 0.6, 7), fur, 0, 0, -0.26, tail);
  tailMesh.rotation.x = -Math.PI / 2 - 0.4;
  // Gele bliksem-aders over zijn rug (een zigzag van dunne staafjes)
  const zig = [[0, 1.12, 0.55], [0.08, 1.06, 0.3], [-0.06, 1.08, 0.05], [0.07, 1.03, -0.2], [-0.05, 1.04, -0.45], [0.04, 0.98, -0.62]];
  const vGeo = new THREE.CylinderGeometry(0.022, 0.022, 1, 4);
  for (let i = 0; i < zig.length - 1; i++) {
    const a = new THREE.Vector3(...zig[i]);
    const b = new THREE.Vector3(...zig[i + 1]);
    const v = new THREE.Mesh(vGeo, vein);
    v.position.copy(a).lerp(b, 0.5);
    v.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), b.clone().sub(a).normalize());
    v.scale.y = a.distanceTo(b);
    body.add(v);
  }
  return { mesh, mats: [fur, vein], legs, tail };
}

/** Rennen: poten heen en weer, staart zwiepen, een beetje op en neer. `run` = 0 (stil) tot 1 (volle vaart). */
export function animateWolf(wolf, time, run = 1) {
  const swing = Math.sin(time * 18) * 0.9 * run;
  wolf.legs.forEach((leg, i) => {
    leg.rotation.x = (i === 0 || i === 3 ? 1 : -1) * swing;
  });
  wolf.tail.rotation.x = 0.3 + Math.sin(time * 14) * 0.25;
  wolf.tail.rotation.y = Math.sin(time * 9) * 0.4;
  wolf.mesh.children[0].position.y = Math.abs(Math.sin(time * 18)) * 0.12 * run;
}
