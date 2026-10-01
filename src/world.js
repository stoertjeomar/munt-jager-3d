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

// Voorspelbare "random" getallen, zodat bomen elke keer op dezelfde plek staan
function seededRandom(seed) {
  return () => {
    seed = (seed * 16807) % 2147483647;
    return (seed - 1) / 2147483646;
  };
}

/** Een lucht die van diepblauw (boven) naar lichtblauw (horizon) loopt. */
function createSky(scene) {
  const sky = new THREE.Mesh(
    new THREE.SphereGeometry(160, 32, 16),
    new THREE.ShaderMaterial({
      side: THREE.BackSide,
      depthWrite: false,
      fog: false,
      uniforms: { top: { value: new THREE.Color(0x3d7fd9) }, horizon: { value: new THREE.Color(0xcdeaff) } },
      vertexShader: `varying vec3 vPos; void main() { vPos = position; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
      fragmentShader: `uniform vec3 top; uniform vec3 horizon; varying vec3 vPos;
        void main() { float h = clamp(normalize(vPos).y, 0.0, 1.0); gl_FragColor = vec4(mix(horizon, top, pow(h, 0.6)), 1.0);
        #include <colorspace_fragment>
        }`,
    })
  );
  scene.add(sky);
  return sky;
}

/** Bomen, stenen en bloemetjes. Bomen krijgen een botsingsvak, zodat je er niet doorheen loopt. */
function createDecorations(scene, colliders) {
  const rand = seededRandom(42);
  const trunkMat = new THREE.MeshStandardMaterial({ color: 0x7a4b2a, roughness: 0.9 });
  const leafMats = [0x3f9b4a, 0x4fae52, 0x2f8a45].map((color) => new THREE.MeshStandardMaterial({ color, roughness: 0.8, flatShading: true }));
  const rockMat = new THREE.MeshStandardMaterial({ color: 0x9aa0a6, roughness: 0.95, flatShading: true });

  const addTree = (x, z, size) => {
    const tree = new THREE.Group();
    const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.22 * size, 0.3 * size, 1.6 * size, 7), trunkMat);
    trunk.position.y = 0.8 * size;
    trunk.castShadow = true;
    tree.add(trunk);
    const mat = leafMats[Math.floor(rand() * leafMats.length)];
    for (let i = 0; i < 3; i++) {
      const leaves = new THREE.Mesh(new THREE.ConeGeometry((1.3 - i * 0.3) * size, 1.4 * size, 8), mat);
      leaves.position.y = (1.7 + i * 0.75) * size;
      leaves.rotation.y = rand() * Math.PI;
      leaves.castShadow = true;
      leaves.receiveShadow = true;
      tree.add(leaves);
    }
    tree.position.set(x, 0, z);
    scene.add(tree);
    const r = 0.3 * size;
    colliders.push(new THREE.Box3(new THREE.Vector3(x - r, 0, z - r), new THREE.Vector3(x + r, 3.5 * size, z + r)));
  };

  // Een rand van bomen langs de buitenkant van het veld
  for (let a = -27; a <= 27; a += 4.5) {
    for (const [x, z] of [[a, -27.5], [a, 27.5], [-27.5, a], [27.5, a]]) {
      addTree(x + (rand() - 0.5) * 2, z + (rand() - 0.5) * 2, 0.8 + rand() * 0.6);
    }
  }
  // Een paar losse bomen in het veld
  for (const [x, z] of [[-14, 24], [9, 24], [25, 9], [-25, 4], [6, -25], [-12, -24]]) addTree(x, z, 1 + rand() * 0.3);

  // Stenen (zonder botsing, gewoon voor de sier)
  for (let i = 0; i < 30; i++) {
    const rock = new THREE.Mesh(new THREE.DodecahedronGeometry(0.2 + rand() * 0.35, 0), rockMat);
    rock.position.set((rand() - 0.5) * 52, 0.05, (rand() - 0.5) * 52);
    rock.rotation.set(rand() * 3, rand() * 3, rand() * 3);
    rock.scale.y = 0.6;
    rock.castShadow = true;
    rock.receiveShadow = true;
    scene.add(rock);
  }

  // Bloemetjes: honderden in één InstancedMesh
  const flowerColors = [0xff6b9d, 0xffe066, 0xffffff, 0x9d7bff, 0xff8c42].map((c) => new THREE.Color(c));
  const flowers = new THREE.InstancedMesh(new THREE.IcosahedronGeometry(0.05, 0), new THREE.MeshStandardMaterial({ roughness: 0.6 }), 400);
  const m = new THREE.Matrix4();
  for (let i = 0; i < 400; i++) {
    m.makeTranslation((rand() - 0.5) * 56, 0.05, (rand() - 0.5) * 56);
    flowers.setMatrixAt(i, m);
    flowers.setColorAt(i, flowerColors[Math.floor(rand() * flowerColors.length)]);
  }
  scene.add(flowers);
}

export function createWorld(scene) {
  // Lucht en mist (de mist heeft dezelfde kleur als de horizon)
  createSky(scene);
  scene.fog = new THREE.Fog(0xcdeaff, 45, 120);

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

  createDecorations(scene, colliders);

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
