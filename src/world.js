import * as THREE from 'three';

// De open wereld: drie gebieden, paden, ruïnes, boss-arena's, Plekken van Genade en kisten.
// Pas de lijsten hieronder aan om de wereld te veranderen!

export const WORLD_HALF = 120; // de wereld loopt van -120 tot 120
export const WALKABLE_HALF = 114; // verder kun je niet lopen (daar staan de rotsen)

// Plekken van Genade: rusten, levelen, reizen. [id, naam, x, z]
export const GRACES = [
  ['weide', 'Groene Weide', 0, 16],
  ['poort', 'Slijmpoort', 0, -48],
  ['woud', 'Rand van het Spookwoud', -55, 6],
  ['ruine', 'Woudruïne', -78, -22],
  ['hoogland', 'Voet van het Hoogland', 55, 6],
  ['top', 'Rotsentop', 74, 38],
].map(([id, name, x, z]) => ({ id, name, position: new THREE.Vector3(x, 0, z) }));

// Boss-arena's: [id, x, z, straal]
export const ARENAS = [
  ['koning', 0, -78, 17],
  ['ridder', -96, -48, 16],
  ['reus', 92, 66, 19],
].map(([id, x, z, radius]) => ({ id, center: new THREE.Vector3(x, 0, z), radius }));

// Kisten: [id, x, y, z, voorwerp]. y = hoogte waar de kist op staat.
export const CHESTS = [
  ['c-platform', -3, 7.25, -14, { kind: 'weapon', key: 'sword' }], // bovenop het hoogste platform!
  ['c-weide', 22, 0, 27, { kind: 'helmet', key: 'ijzer' }],
  ['c-woud', -72, 0, 40, { kind: 'weapon', key: 'katana' }],
  ['c-diep', -102, 0, 14, { kind: 'flask' }],
  ['c-noord', -32, 0, -62, { kind: 'flask' }],
  ['c-golem', 82, 0, -32, { kind: 'weapon', key: 'club' }],
  ['c-hoog', 50, 0, -64, { kind: 'helmet', key: 'kap' }],
].map(([id, x, y, z, item]) => ({ id, position: new THREE.Vector3(x, y, z), item }));

// Muntdorp: huizen rond een dorpsplein. [x, z, breedte, diepte, hoogte, muur, dak]
export const VILLAGE_CENTER = new THREE.Vector3(-28, 0, 47);
const HOUSES = [
  [-38, 40, 6, 5, 3.2, 'wall_timber_structure', 'roof_clay_red_center'],
  [-39, 53, 5, 5, 3, 'wall_brick_small_sand', 'roof_thatch_center'],
  [-17, 40, 5, 6, 3.4, 'wall_brick_small_sand', 'roof_clay_red_center'],
  [-17, 54, 6, 5, 3, 'wall_timber_structure_cross', 'roof_thatch_center'],
  [-28, 61, 7, 5, 3.6, 'wall_brick_stone_center', 'roof_clay_red_center'],
];

// Paden tussen plekken (lijnstukken), zodat je de weg kunt vinden
const PATHS = [
  [[0, 16], [-28, 47]],
  [[0, 16], [0, -48]], [[0, -48], [0, -62]],
  [[0, 16], [-55, 6]], [[-55, 6], [-78, -22]], [[-78, -22], [-90, -36]],
  [[0, 16], [55, 6]], [[55, 6], [74, 38]], [[74, 38], [84, 54]],
  [[-55, 6], [-72, 40]], [[55, 6], [82, -32]], [[0, -48], [-32, -62]],
];

// De oude parkour-ruïne in de Weide: [x, y, z, breedte, hoogte, diepte, kleur]
const BLOCKS = [
  [6, 0.5, 0, 3, 1, 3, 0xb8a58c],
  [9, 1.0, -3, 3, 2, 3, 0xb8a58c],
  [12, 1.5, -6, 3, 3, 3, 0xa8957c],
  [12, 2.0, -11, 3, 4, 3, 0xa8957c],
  [7, 5.0, -14, 3, 0.5, 3, 0x9c9c9c],
  [2, 6.0, -16, 3, 0.5, 3, 0x9c9c9c],
  [-3, 7.0, -14, 3, 0.5, 3, 0x9c9c9c],
  [-8, 0.7, 4, 2, 1.4, 2, 0xb8a58c],
  [-12, 1.5, -2, 6, 3, 1, 0x8d8a85],
  [-15, 0.5, -8, 4, 1, 4, 0xb8a58c],
  [-18, 1, -12, 3, 2, 3, 0xb8a58c],
  [0, 0.75, -6, 2, 1.5, 2, 0x8d8a85],
  // Ruïnes in het bos en het hoogland
  [-70, 1.2, 36, 6, 2.4, 1, 0x6f6a63],
  [-74, 1.2, 40, 1, 2.4, 6, 0x6f6a63],
  [-30, 1.5, -66, 8, 3, 1, 0x7d7a74],
  [-36, 1, -60, 1, 2, 6, 0x7d7a74],
  [78, 1.5, -36, 1, 3, 7, 0x8a8478],
  [86, 1, -28, 6, 2, 1, 0x8a8478],
];

// Voorspelbare "random" getallen, zodat bomen elke keer op dezelfde plek staan
export function seededRandom(seed) {
  return () => {
    seed = (seed * 16807) % 2147483647;
    return (seed - 1) / 2147483646;
  };
}

// ---------- Texturen (Kenney Retro Textures Fantasy) ----------
const textureLoader = new THREE.TextureLoader();
const textureCache = {};

/** Laadt een textuur uit textures/ (pixel-art: scherp, en herhalend). */
export function tex(name) {
  if (!textureCache[name]) {
    const t = textureLoader.load(`textures/${name}.png`);
    t.wrapS = t.wrapT = THREE.RepeatWrapping;
    t.colorSpace = THREE.SRGBColorSpace;
    t.magFilter = THREE.NearestFilter;
    t.anisotropy = 8;
    textureCache[name] = t;
  }
  return textureCache[name];
}

/** Een blok waarvan de textuur netjes herhaalt (elke `tile` meter één keer), in plaats van uitgerekt. */
export function texturedBox(w, h, d, material, tile = 2) {
  const geo = new THREE.BoxGeometry(w, h, d);
  const uv = geo.attributes.uv;
  const faceSize = [[d, h], [d, h], [w, d], [w, d], [w, h], [w, h]]; // +x, -x, +y, -y, +z, -z
  for (let i = 0; i < uv.count; i++) {
    const [fu, fv] = faceSize[Math.floor(i / 4)];
    uv.setXY(i, (uv.getX(i) * fu) / tile, (uv.getY(i) * fv) / tile);
  }
  const mesh = new THREE.Mesh(geo, material);
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  return mesh;
}

const materialCache = {};
function texMat(name, extra = {}) {
  const key = name + JSON.stringify(extra);
  materialCache[key] ??= new THREE.MeshStandardMaterial({ map: tex(name), roughness: 0.9, ...extra });
  return materialCache[key];
}

/** In welk gebied ligt dit punt? */
export function regionAt(x, z) {
  const wobble = Math.sin(z * 0.08) * 6 + Math.sin(z * 0.21) * 3;
  if (x + wobble < -40) return 'woud';
  if (x + wobble > 40) return 'hoogland';
  return 'weide';
}

export const REGION_NAMES = { weide: 'Groene Weide', woud: 'Spookwoud', hoogland: 'Rotshoogland' };

function distToSegment(px, pz, [ax, az], [bx, bz]) {
  const dx = bx - ax;
  const dz = bz - az;
  const t = Math.max(0, Math.min(1, ((px - ax) * dx + (pz - az) * dz) / (dx * dx + dz * dz)));
  return Math.hypot(px - (ax + dx * t), pz - (az + dz * t));
}

function distToPath(x, z) {
  let d = Infinity;
  for (const [a, b] of PATHS) d = Math.min(d, distToSegment(x, z, a, b));
  return d;
}

/** Is hier ruimte voor een boom of steen? (niet op paden, arena's, genade-plekken, kisten of de ruïne) */
export function isFree(x, z, margin = 0) {
  if (Math.abs(x) > WALKABLE_HALF - 2 || Math.abs(z) > WALKABLE_HALF - 2) return false;
  if (distToPath(x, z) < 4 + margin) return false;
  if (Math.abs(x) < 23 && Math.abs(z) < 21) return false; // parkour-ruïne
  if (Math.hypot(x - VILLAGE_CENTER.x, z - VILLAGE_CENTER.z) < 22) return false; // Muntdorp
  for (const a of ARENAS) if (Math.hypot(x - a.center.x, z - a.center.z) < a.radius + 5) return false;
  for (const g of GRACES) if (Math.hypot(x - g.position.x, z - g.position.z) < 8) return false;
  for (const c of CHESTS) if (Math.hypot(x - c.position.x, z - c.position.z) < 4) return false;
  for (const b of BLOCKS) if (Math.abs(x - b[0]) < b[3] / 2 + 2 && Math.abs(z - b[2]) < b[5] / 2 + 2) return false;
  return true;
}

/** Een lucht die van diepblauw (boven) naar lichtblauw (horizon) loopt. */
function createSky(scene) {
  const sky = new THREE.Mesh(
    new THREE.SphereGeometry(300, 32, 16),
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

/** De grond: één groot vlak dat 4 texturen mengt (gras, aarde, rots, stenen vloer). */
function createGround(scene) {
  const size = WORLD_HALF * 2;
  const geo = new THREE.PlaneGeometry(size, size, 160, 160);
  geo.rotateX(-Math.PI / 2);
  const pos = geo.attributes.position;
  const colors = [];
  const blends = [];
  const rand = seededRandom(7);
  const tint = { weide: new THREE.Color(1.6, 1.6, 1.35), woud: new THREE.Color(0.85, 1.0, 0.8), hoogland: new THREE.Color(1.05, 1.0, 0.92) };
  const c = new THREE.Color();
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i);
    const z = pos.getZ(i);
    const region = regionAt(x, z);
    c.copy(tint[region]).offsetHSL(0, 0, (rand() - 0.5) * 0.06);
    // gewicht per textuur: [gras, aarde, rots, stenen vloer]
    let w = region === 'hoogland' ? [0.35, 0, 0.65, 0] : [1, 0, 0, 0];
    const p = Math.min(distToPath(x, z), Math.hypot(x - VILLAGE_CENTER.x, z - VILLAGE_CENTER.z) - 7);
    if (p < 2.6) {
      const k = 1 - Math.max(0, p) / 2.6;
      w = w.map((v, j) => v * (1 - k) + (j === 1 ? k : 0));
      c.lerp(new THREE.Color(1, 1, 1), k);
    }
    for (const a of ARENAS) {
      const d = Math.hypot(x - a.center.x, z - a.center.z);
      if (d < a.radius + 1) {
        const k = Math.min(1, (a.radius + 1 - d) / 2);
        w = w.map((v, j) => v * (1 - k) + (j === 3 ? k : 0));
        c.lerp(new THREE.Color(0.85, 0.85, 0.85), k);
      }
    }
    colors.push(c.r, c.g, c.b);
    blends.push(...w);
  }
  geo.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
  geo.setAttribute('blend', new THREE.Float32BufferAttribute(blends, 4));

  const material = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.95 });
  material.onBeforeCompile = (shader) => {
    shader.uniforms.tGrass = { value: tex('floor_ground_grass') };
    shader.uniforms.tDirt = { value: tex('floor_ground_dirt') };
    shader.uniforms.tRock = { value: tex('wall_rock') };
    shader.uniforms.tStone = { value: tex('floor_stone_pattern') };
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nattribute vec4 blend;\nvarying vec4 vBlend;\nvarying vec2 vGroundUv;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvBlend = blend;\nvGroundUv = position.xz / 2.5;');
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', '#include <common>\nuniform sampler2D tGrass, tDirt, tRock, tStone;\nvarying vec4 vBlend;\nvarying vec2 vGroundUv;')
      .replace(
        '#include <map_fragment>',
        `vec3 groundTex = texture2D(tGrass, vGroundUv).rgb * vBlend.x + texture2D(tDirt, vGroundUv).rgb * vBlend.y
          + texture2D(tRock, vGroundUv * 0.6).rgb * vBlend.z + texture2D(tStone, vGroundUv).rgb * vBlend.w;
        diffuseColor.rgb *= groundTex;`
      );
  };
  const ground = new THREE.Mesh(geo, material);
  ground.receiveShadow = true;
  scene.add(ground);
}

/** Een huis met muren, een puntdak, een deur, ramen met licht en een schoorsteen. */
function createHouse(scene, colliders, [x, z, w, d, h, wallName, roofName]) {
  const house = new THREE.Group();
  // Deur aan de kant van het dorpsplein (in stappen van 90 graden, zodat de botsing klopt)
  const angle = Math.atan2(VILLAGE_CENTER.x - x, VILLAGE_CENTER.z - z);
  const rot = Math.round(angle / (Math.PI / 2)) * (Math.PI / 2);
  house.position.set(x, 0, z);
  house.rotation.y = rot;
  const wallMat = texMat(wallName);
  const walls = texturedBox(w, h, d, wallMat, 2);
  walls.position.y = h / 2;
  house.add(walls);

  // Puntdak: twee schuine vlakken en twee driehoekige gevels
  const rh = d * 0.45;
  const slope = Math.atan2(rh, d / 2);
  const slopeLen = Math.hypot(d / 2, rh);
  const roofMat = texMat(roofName);
  for (const side of [-1, 1]) {
    const roof = texturedBox(w + 0.7, 0.14, slopeLen + 0.45, roofMat, 1.5);
    roof.position.set(0, h + rh / 2 + 0.08, (side * d) / 4 + side * 0.08);
    roof.rotation.x = side * slope;
    house.add(roof);
    const shape = new THREE.Shape([new THREE.Vector2(-d / 2, 0), new THREE.Vector2(d / 2, 0), new THREE.Vector2(0, rh)]);
    const gableGeo = new THREE.ShapeGeometry(shape);
    const guv = gableGeo.attributes.uv;
    for (let i = 0; i < guv.count; i++) guv.setXY(i, gableGeo.attributes.position.getX(i) / 2, gableGeo.attributes.position.getY(i) / 2);
    const gable = new THREE.Mesh(gableGeo, wallMat);
    gable.position.set((side * w) / 2, h, 0);
    gable.rotation.y = side * (Math.PI / 2);
    gable.castShadow = true;
    house.add(gable);
  }
  // Schoorsteen
  const chimney = texturedBox(0.6, 1.6, 0.6, texMat('wall_brick_stone_center'), 1);
  chimney.position.set(w * 0.25, h + rh * 0.7, -d * 0.15);
  house.add(chimney);

  // Deur en ramen (vlakjes net vóór de muur); de ramen gloeien warm
  const plane = (texName, pw, ph, px, py, pz, ry, glow) => {
    const m = new THREE.Mesh(
      new THREE.PlaneGeometry(pw, ph),
      new THREE.MeshStandardMaterial({ map: tex(texName), roughness: 0.8, emissive: glow ? 0xffc46b : 0x000000, emissiveMap: glow ? tex(texName) : null, emissiveIntensity: glow ? 0.6 : 0 })
    );
    m.position.set(px, py, pz);
    m.rotation.y = ry;
    house.add(m);
  };
  plane('door_wood_handle', 1.1, 2.1, 0, 1.05, d / 2 + 0.02, 0, false);
  plane('window_square_divided_lit', 0.9, 0.9, -w * 0.3, h * 0.6, d / 2 + 0.02, 0, true);
  plane('window_square_divided_lit', 0.9, 0.9, w * 0.3, h * 0.6, d / 2 + 0.02, 0, true);
  plane('window_round_divided_lit', 0.8, 0.8, w / 2 + 0.02, h * 0.6, 0, Math.PI / 2, true);
  plane('window_round_divided_lit', 0.8, 0.8, -w / 2 - 0.02, h * 0.6, 0, -Math.PI / 2, true);
  plane('window_square_divided_lit', 0.9, 0.9, 0, h * 0.6, -d / 2 - 0.02, Math.PI, true);
  scene.add(house);

  // Botsingsvak (gedraaid huis: breedte en diepte wisselen)
  const turned = Math.abs(Math.sin(rot)) > 0.5;
  const hw = (turned ? d : w) / 2;
  const hd = (turned ? w : d) / 2;
  colliders.push(new THREE.Box3(new THREE.Vector3(x - hw, 0, z - hd), new THREE.Vector3(x + hw, h + rh, z + hd)));
}

/** De dorpsput in het midden van Muntdorp. */
function createWell(scene, colliders) {
  const c = VILLAGE_CENTER;
  const stone = texMat('wall_brick_stone_center');
  const ring = new THREE.Mesh(new THREE.CylinderGeometry(1.2, 1.3, 1, 16, 1, true), stone);
  ring.position.set(c.x, 0.5, c.z);
  ring.material.side = THREE.DoubleSide;
  const water = new THREE.Mesh(new THREE.CircleGeometry(1.15, 16), new THREE.MeshStandardMaterial({ color: 0x2f6f9f, roughness: 0.2, metalness: 0.2 }));
  water.rotation.x = -Math.PI / 2;
  water.position.set(c.x, 0.6, c.z);
  const wood = texMat('timber_square_planks');
  const posts = [-1, 1].map((s) => {
    const p = texturedBox(0.18, 2.4, 0.18, wood, 1);
    p.position.set(c.x + s * 1.1, 1.2, c.z);
    return p;
  });
  const roof = texturedBox(2.8, 0.15, 1.8, texMat('roof_thatch_center'), 1);
  roof.position.set(c.x, 2.45, c.z);
  ring.castShadow = true;
  scene.add(ring, water, ...posts, roof);
  colliders.push(new THREE.Box3(new THREE.Vector3(c.x - 1.3, 0, c.z - 1.3), new THREE.Vector3(c.x + 1.3, 1, c.z + 1.3)));
}

/** Bomen (heel veel, dus met InstancedMesh), stenen, bloemen, paddenstoelen. */
function createNature(scene, colliders) {
  const rand = seededRandom(42);
  const trees = []; // [x, z, size, kind]
  const tryPlace = (count, area, kind, minSize, maxSize) => {
    for (let i = 0, tries = 0; i < count && tries < count * 20; tries++) {
      const x = area.x0 + rand() * (area.x1 - area.x0);
      const z = area.z0 + rand() * (area.z1 - area.z0);
      if (!isFree(x, z)) continue;
      if (area.region && regionAt(x, z) !== area.region) continue;
      if (trees.some((t) => Math.hypot(t[0] - x, t[1] - z) < 3.2)) continue;
      trees.push([x, z, minSize + rand() * (maxSize - minSize), kind]);
      i++;
    }
  };
  tryPlace(280, { x0: -118, x1: -38, z0: -118, z1: 118, region: 'woud' }, 'dark', 1.0, 1.6);
  tryPlace(50, { x0: -45, x1: 45, z0: -110, z1: 110, region: 'weide' }, 'green', 0.8, 1.3);
  tryPlace(30, { x0: 38, x1: 118, z0: -118, z1: 118, region: 'hoogland' }, 'pine', 0.8, 1.2);

  // Boomstammen en kruinen: elk één InstancedMesh
  const trunkMesh = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.22, 0.3, 1.6, 7), new THREE.MeshStandardMaterial({ color: 0x6b4226, roughness: 0.9 }), trees.length);
  const leafColors = { dark: [0x24502c, 0x2d5e33, 0x1f4527], green: [0x3f9b4a, 0x4fae52, 0x2f8a45], pine: [0x3a6b48, 0x46775a] };
  const leafMesh = new THREE.InstancedMesh(new THREE.ConeGeometry(1.3, 1.6, 8), new THREE.MeshStandardMaterial({ roughness: 0.8, flatShading: true }), trees.length * 3);
  trunkMesh.castShadow = true;
  leafMesh.castShadow = true;
  leafMesh.receiveShadow = true;
  const m = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  const color = new THREE.Color();
  trees.forEach(([x, z, s, kind], i) => {
    m.compose(new THREE.Vector3(x, 0.8 * s, z), q.identity(), new THREE.Vector3(s, s, s));
    trunkMesh.setMatrixAt(i, m);
    const palette = leafColors[kind];
    for (let j = 0; j < 3; j++) {
      const layer = 1 - j * 0.25;
      q.setFromAxisAngle(new THREE.Vector3(0, 1, 0), rand() * Math.PI);
      m.compose(new THREE.Vector3(x, (1.8 + j * 0.85) * s, z), q, new THREE.Vector3(s * layer, s, s * layer));
      leafMesh.setMatrixAt(i * 3 + j, m);
      leafMesh.setColorAt(i * 3 + j, color.set(palette[Math.floor(rand() * palette.length)]));
    }
    const r = 0.32 * s;
    colliders.push(new THREE.Box3(new THREE.Vector3(x - r, 0, z - r), new THREE.Vector3(x + r, 4 * s, z + r)));
  });
  scene.add(trunkMesh, leafMesh);

  // Rotsblokken in het hoogland (groot = botsing) en kleine steentjes overal
  const rockMat = new THREE.MeshStandardMaterial({ color: 0x8f8a80, roughness: 0.95, flatShading: true });
  const boulders = [];
  for (let tries = 0; boulders.length < 55 && tries < 2000; tries++) {
    const x = 40 + rand() * 78;
    const z = -118 + rand() * 236;
    if (regionAt(x, z) !== 'hoogland' || !isFree(x, z, 1)) continue;
    boulders.push([x, z, 1 + rand() * 1.8]);
  }
  const boulderMesh = new THREE.InstancedMesh(new THREE.DodecahedronGeometry(1, 0), rockMat, boulders.length);
  boulders.forEach(([x, z, s], i) => {
    q.setFromEuler(new THREE.Euler(rand() * 3, rand() * 3, rand() * 3));
    m.compose(new THREE.Vector3(x, s * 0.45, z), q, new THREE.Vector3(s, s * 0.8, s));
    boulderMesh.setMatrixAt(i, m);
    const r = s * 0.75;
    colliders.push(new THREE.Box3(new THREE.Vector3(x - r, 0, z - r), new THREE.Vector3(x + r, s * 1.1, z + r)));
  });
  boulderMesh.castShadow = true;
  boulderMesh.receiveShadow = true;
  scene.add(boulderMesh);

  // Een muur van grote rotsen rondom de wereld
  const edge = [];
  for (let a = -WORLD_HALF; a <= WORLD_HALF; a += 7) {
    for (const [x, z] of [[a, -WORLD_HALF + 2], [a, WORLD_HALF - 2], [-WORLD_HALF + 2, a], [WORLD_HALF - 2, a]]) edge.push([x, z, 5 + rand() * 4]);
  }
  const edgeMesh = new THREE.InstancedMesh(new THREE.DodecahedronGeometry(1, 0), rockMat, edge.length);
  edge.forEach(([x, z, s], i) => {
    q.setFromEuler(new THREE.Euler(rand() * 3, rand() * 3, rand() * 3));
    m.compose(new THREE.Vector3(x, s * 0.3, z), q, new THREE.Vector3(s, s * 1.2, s));
    edgeMesh.setMatrixAt(i, m);
  });
  scene.add(edgeMesh);

  // Bloemetjes in de weide, paddenstoelen in het bos
  const flowerColors = [0xff6b9d, 0xffe066, 0xffffff, 0x9d7bff, 0xff8c42].map((c) => new THREE.Color(c));
  const flowers = new THREE.InstancedMesh(new THREE.IcosahedronGeometry(0.06, 0), new THREE.MeshStandardMaterial({ roughness: 0.6 }), 900);
  let n = 0;
  for (let tries = 0; n < 900 && tries < 5000; tries++) {
    const x = (rand() - 0.5) * 220;
    const z = (rand() - 0.5) * 220;
    if (regionAt(x, z) !== 'weide') continue;
    m.makeTranslation(x, 0.06, z);
    flowers.setMatrixAt(n, m);
    flowers.setColorAt(n, flowerColors[Math.floor(rand() * flowerColors.length)]);
    n++;
  }
  flowers.count = n;
  scene.add(flowers);

  const capMat = new THREE.MeshStandardMaterial({ color: 0xd93b3b, roughness: 0.5 });
  const caps = new THREE.InstancedMesh(new THREE.SphereGeometry(0.2, 10, 6, 0, Math.PI * 2, 0, Math.PI / 2), capMat, 160);
  const stems = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.06, 0.08, 0.25, 6), new THREE.MeshStandardMaterial({ color: 0xf2e8d5 }), 160);
  n = 0;
  for (let tries = 0; n < 160 && tries < 4000; tries++) {
    const x = -118 + rand() * 80;
    const z = (rand() - 0.5) * 230;
    if (regionAt(x, z) !== 'woud' || !isFree(x, z)) continue;
    const s = 0.7 + rand() * 0.8;
    m.compose(new THREE.Vector3(x, 0.24 * s, z), q.identity(), new THREE.Vector3(s, s, s));
    caps.setMatrixAt(n, m);
    m.compose(new THREE.Vector3(x, 0.12 * s, z), q.identity(), new THREE.Vector3(s, s, s));
    stems.setMatrixAt(n, m);
    n++;
  }
  caps.count = stems.count = n;
  scene.add(caps, stems);
}

/** Boss-arena: stenen vloer en een kring van (gebroken) pilaren. */
function createArena(scene, colliders, arena) {
  const mat = texMat('wall_brick_stone_center');
  const count = 12;
  for (let i = 0; i < count; i++) {
    const a = (i / count) * Math.PI * 2;
    const x = arena.center.x + Math.sin(a) * (arena.radius + 1.5);
    const z = arena.center.z + Math.cos(a) * (arena.radius + 1.5);
    const h = i % 3 === 0 ? 2 : 5 + (i % 2) * 1.5; // sommige zijn afgebroken
    const pillar = texturedBox(1.4, h, 1.4, mat, 1.4);
    pillar.position.set(x, h / 2, z);
    scene.add(pillar);
    colliders.push(new THREE.Box3().setFromObject(pillar));
  }
}

export function createWorld(scene) {
  createSky(scene);
  scene.fog = new THREE.Fog(0xcdeaff, 50, 140);

  scene.add(new THREE.HemisphereLight(0xffffff, 0x556b2f, 0.9));
  const sun = new THREE.DirectionalLight(0xffffff, 1.6);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  Object.assign(sun.shadow.camera, { left: -40, right: 40, top: 40, bottom: -40, near: 1, far: 120 });
  scene.add(sun, sun.target);

  createGround(scene);

  const colliders = [];
  for (const [x, y, z, w, h, d, color] of BLOCKS) {
    // Dunne zwevende platforms van hout, de rest van steen
    const material = h <= 0.5 ? texMat('floor_wood_planks') : texMat(color === 0x8d8a85 || color === 0x6f6a63 ? 'wall_stone' : 'wall_brick_stone_center');
    const block = texturedBox(w, h, d, material, 2);
    block.position.set(x, y, z);
    scene.add(block);
    colliders.push(new THREE.Box3().setFromObject(block));
  }

  createNature(scene, colliders);
  for (const house of HOUSES) createHouse(scene, colliders, house);
  createWell(scene, colliders);
  for (const arena of ARENAS) createArena(scene, colliders, arena);

  return {
    colliders,
    groundHalfSize: WALKABLE_HALF,
    /** Laat de zon (en zijn schaduw) met de speler meelopen. */
    updateSun(playerPos) {
      sun.target.position.copy(playerPos);
      sun.position.copy(playerPos).add(new THREE.Vector3(25, 45, 18));
    },
  };
}
