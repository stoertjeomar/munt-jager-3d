import * as THREE from 'three';

export const GROUND_SIZE = 60;

// Alle blokken in het level: [x, y, z, breedte, hoogte, diepte, kleur]
// (x, y, z) is het midden van het blok. Pas dit aan om je eigen level te bouwen!
const BLOCKS = [
  // Trap naar boven
  [6, 0.5, 0, 3, 1, 3, 0xe07a5f],
  [9, 1.0, -3, 3, 2, 3, 0xe07a5f],
  [12, 1.5, -6, 3, 3, 3, 0xe07a5f],
  [12, 2.0, -11, 3, 4, 3, 0xe07a5f],
  // Zwevende platforms
  [7, 5.0, -14, 3, 0.5, 3, 0x81b29a],
  [2, 6.0, -16, 3, 0.5, 3, 0x81b29a],
  [-3, 7.0, -14, 3, 0.5, 3, 0x81b29a],
  // Losse blokken en muren
  [-8, 0.7, 4, 2, 1.4, 2, 0xf2cc8f],
  [-12, 1.5, -2, 6, 3, 1, 0x3d405b],
  [-15, 0.5, -8, 4, 1, 4, 0xf2cc8f],
  [-18, 1, -12, 3, 2, 3, 0xf2cc8f],
  [0, 0.75, -6, 2, 1.5, 2, 0x9c89b8],
];

// Plekken van de munten [x, y, z] (y = hoogte van het midden van de munt)
const COINS = [
  [0, 1, 0],
  [-4, 1, 6],
  [6, 2, 0],
  [12, 4, -6],
  [12, 5, -11],
  [7, 6.5, -14],
  [2, 7.5, -16],
  [-3, 8.5, -14],
  [-8, 2.6, 4],
  [-15, 2, -8],
  [-18, 3.2, -12],
  [0, 2.5, -6],
  [15, 1, 12],
  [-20, 1, 18],
  [22, 1, -22],
];

export function createWorld(scene) {
  // Lucht en mist
  scene.background = new THREE.Color(0x87ceeb);
  scene.fog = new THREE.Fog(0x87ceeb, 40, 110);

  // Licht
  scene.add(new THREE.HemisphereLight(0xffffff, 0x556b2f, 0.9));

  const sun = new THREE.DirectionalLight(0xffffff, 1.6);
  sun.position.set(20, 35, 15);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  const s = GROUND_SIZE / 2 + 5;
  Object.assign(sun.shadow.camera, { left: -s, right: s, top: s, bottom: -s, near: 1, far: 100 });
  scene.add(sun);

  // Vloer
  const ground = new THREE.Mesh(
    new THREE.BoxGeometry(GROUND_SIZE, 1, GROUND_SIZE),
    new THREE.MeshStandardMaterial({ color: 0x6abf69, roughness: 0.9 })
  );
  ground.position.y = -0.5;
  ground.receiveShadow = true;
  scene.add(ground);

  const grid = new THREE.GridHelper(GROUND_SIZE, GROUND_SIZE / 2, 0x000000, 0x000000);
  grid.material.opacity = 0.12;
  grid.material.transparent = true;
  grid.position.y = 0.01;
  scene.add(grid);

  // Blokken + hun botsingsvakken (colliders)
  const colliders = [];
  for (const [x, y, z, w, h, d, color] of BLOCKS) {
    const block = new THREE.Mesh(
      new THREE.BoxGeometry(w, h, d),
      new THREE.MeshStandardMaterial({ color, roughness: 0.7 })
    );
    block.position.set(x, y, z);
    block.castShadow = true;
    block.receiveShadow = true;
    scene.add(block);
    colliders.push(new THREE.Box3().setFromObject(block));
  }

  // Munten
  const coinGeo = new THREE.CylinderGeometry(0.4, 0.4, 0.1, 24);
  coinGeo.rotateX(Math.PI / 2); // rechtop zetten
  const coinMat = new THREE.MeshStandardMaterial({
    color: 0xffd700,
    metalness: 0.3,
    roughness: 0.3,
    emissive: 0x996600,
    emissiveIntensity: 0.6,
  });

  const coins = COINS.map(([x, y, z], i) => {
    const mesh = new THREE.Mesh(coinGeo, coinMat);
    mesh.position.set(x, y, z);
    mesh.castShadow = true;
    scene.add(mesh);
    return { mesh, baseY: y, phase: i * 0.7, collected: false };
  });

  return { colliders, coins, groundHalfSize: GROUND_SIZE / 2 };
}

/** Laat de munten draaien en een beetje op en neer zweven. */
export function animateCoins(coins, time) {
  for (const coin of coins) {
    if (coin.collected) continue;
    coin.mesh.rotation.y = time * 2 + coin.phase;
    coin.mesh.position.y = coin.baseY + Math.sin(time * 3 + coin.phase) * 0.15;
  }
}
