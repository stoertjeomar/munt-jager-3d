import * as THREE from 'three';
import { loadGLB } from './assets.js';
import { clone as cloneSkinned } from 'three/addons/utils/SkeletonUtils.js';
import { createMixamoRig } from './mixamo.js';
import { CharacterAnimator } from './animator.js';

// Het Gekke Kasteel van Omar: een kasteel op een rotseiland midden in een meer van lava,
// onder een paarse lucht. Binnen de muren: een ronde arena, een rode loper en een gouden troon.
// Omar zelf zit op die troon (omarFighter.js); het filmpje en het gevecht regelt omar.js.
//
// Alles staat rond het midden (0, 0). Het noorden is -z: daar staat de troon.
// Je komt binnen bij de poort in het zuiden en kijkt naar het noorden.

// Belangrijke plekken (in meters)
export const CASTLE_POINTS = {
  spawn: [0, 0, 24.5], // hier sta je als je aankomt (net buiten de arena)
  seat: [0, 2.2, -26.6], // bovenkant van het kussen op de troon
  landing: [0, 0, -6], // hier landt Omar na zijn sprong van de troon
  fightSpot: [0, 0, 5], // hier trekt Omar jou naartoe met zijn toverkracht
  gate: [0, 0, 35], // de (dichte) poort
  throneFront: [0, 1.5, -25], // vóór de troon, op het bovenste trapje
};

const ARENA_RADIUS = 15;
const WALL_X = 30; // binnenkant van de muren links en rechts
const WALL_Z = 34; // binnenkant van de muren voor en achter
const WALL_H = 8; // hoogte van de muren
const WALL_T = 2; // dikte van de muren
const DAIS_TOP = 1.5; // hoogte van het bovenste trapje bij de troon

const v3 = (a) => new THREE.Vector3(...a);

/** De textuur van een vlak (of cirkel) een paar keer laten herhalen, in plaats van uitrekken. */
function uvScale(geo, sx, sy = sx) {
  const uv = geo.attributes.uv;
  for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * sx, uv.getY(i) * sy);
  return geo;
}

/** Een plat ding op de vloer (tapijt, mozaïek) dat nooit door de vloer heen "flikkert". */
function decal(geo, material, y, layer = 1) {
  material.polygonOffset = true;
  material.polygonOffsetFactor = -layer;
  material.polygonOffsetUnits = -layer * 2;
  const mesh = new THREE.Mesh(geo, material);
  mesh.rotation.x = -Math.PI / 2;
  mesh.position.y = y;
  mesh.receiveShadow = true;
  return mesh;
}

/** Een doek met een gouden O (voor de vaandels en de vlaggetjes op de torens). */
function drawFlag(width, height, notch) {
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = '#3a0d5a';
  ctx.beginPath();
  ctx.moveTo(0, 0);
  ctx.lineTo(width, 0);
  if (notch) {
    // Onderkant met een zwaluwstaart (een V eruit geknipt)
    ctx.lineTo(width, height);
    ctx.lineTo(width / 2, height * 0.84);
    ctx.lineTo(0, height);
  } else {
    ctx.lineTo(width, height);
    ctx.lineTo(0, height);
  }
  ctx.closePath();
  ctx.fill();
  ctx.lineWidth = width * 0.06;
  ctx.strokeStyle = '#ffc83d';
  ctx.stroke();
  // Een kroontje bovenaan
  if (notch) {
    const cx = width / 2;
    const cy = height * 0.14;
    const s = width * 0.22;
    ctx.fillStyle = '#ffc83d';
    ctx.beginPath();
    ctx.moveTo(cx - s, cy + s * 0.5);
    ctx.lineTo(cx - s, cy - s * 0.3);
    ctx.lineTo(cx - s * 0.5, cy + s * 0.1);
    ctx.lineTo(cx, cy - s * 0.5);
    ctx.lineTo(cx + s * 0.5, cy + s * 0.1);
    ctx.lineTo(cx + s, cy - s * 0.3);
    ctx.lineTo(cx + s, cy + s * 0.5);
    ctx.closePath();
    ctx.fill();
  }
  // De grote gouden O van Omar
  ctx.font = `bold ${Math.round(Math.min(width * 1.05, height * 0.6))}px Georgia, serif`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.lineWidth = width * 0.05;
  ctx.strokeStyle = '#7a4a00';
  ctx.strokeText('O', width / 2, height * (notch ? 0.52 : 0.52));
  ctx.fillStyle = '#ffd23a';
  ctx.fillText('O', width / 2, height * (notch ? 0.52 : 0.52));
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = 4;
  return texture;
}

/**
 * Bouwt het hele kasteel. Geeft hetzelfde soort object terug als createWorld in world.js
 * (colliders, bounds, updateSun, ...) plus `castle` met de belangrijke plekken.
 * @param {THREE.Scene} scene
 * @param {object} helpers  { tex, texturedBox } uit world.js (zo hoeven we world.js niet te importeren)
 */
export function createCastleWorld(scene, { tex, texturedBox }) {
  const colliders = [];
  const flickerFlames = []; // { mesh, base } vlammetjes die flakkeren
  const flickerLights = []; // { light, base } lampen die flakkeren
  const waving = []; // vaandels en vlaggetjes die wapperen
  const braziers = []; // plekken van de vuurschalen (voor vonken in het filmpje)
  const merlons = []; // kantelen bovenop muren en torens (één InstancedMesh)

  const stoneMat = new THREE.MeshStandardMaterial({ map: tex('wall_stone'), roughness: 0.92, color: 0xb8a8c4 });
  const brickMat = new THREE.MeshStandardMaterial({ map: tex('wall_brick_stone_center'), roughness: 0.9, color: 0xc8b8d0 });
  const gold = new THREE.MeshStandardMaterial({ color: 0xffc83d, metalness: 0.35, roughness: 0.35, emissive: 0x3a2500 });
  const purple = new THREE.MeshStandardMaterial({ color: 0x6a2a9a, roughness: 0.6, emissive: 0x1a0628 });
  const iron = new THREE.MeshStandardMaterial({ color: 0x2a2a30, metalness: 0.6, roughness: 0.5 });
  const flameOuter = new THREE.MeshBasicMaterial({ color: 0xff7a1a, toneMapped: false });
  const flameInner = new THREE.MeshBasicMaterial({ color: 0xffd23a, toneMapped: false });
  const flameGeo = new THREE.ConeGeometry(0.22, 0.7, 7);
  flameGeo.translate(0, 0.35, 0); // punt omhoog, voet op 0 (dan flakkert hij vanaf de voet)

  const add = (mesh, x, y, z, collide = false) => {
    mesh.position.set(x, y, z);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    scene.add(mesh);
    if (collide) {
      mesh.updateMatrixWorld(true);
      colliders.push(new THREE.Box3().setFromObject(mesh));
    }
    return mesh;
  };

  /** Een vlammetje (buiten oranje, binnen geel) dat flakkert. */
  const addFlame = (parent, x, y, z, size = 1) => {
    for (const [mat, s] of [[flameOuter, 1], [flameInner, 0.6]]) {
      const f = new THREE.Mesh(flameGeo, mat);
      f.position.set(x, y, z);
      f.scale.setScalar(size * s);
      parent.add(f);
      flickerFlames.push({ mesh: f, base: size * s, phase: Math.random() * 10 });
    }
  };

  // ---------- Paarse lucht met een grote maan en sterren ----------
  const sky = new THREE.Mesh(
    new THREE.SphereGeometry(200, 32, 16),
    new THREE.ShaderMaterial({
      side: THREE.BackSide,
      depthWrite: false,
      fog: false,
      uniforms: { moonDir: { value: new THREE.Vector3(-0.35, 0.42, -1).normalize() } },
      vertexShader: `varying vec3 vPos; void main() { vPos = position; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
      // Onderaan gloeit de lucht oranje van de lava, daarboven paars en bovenin bijna zwart
      fragmentShader: `uniform vec3 moonDir; varying vec3 vPos;
        void main() {
          vec3 dir = normalize(vPos);
          float h = dir.y;
          vec3 lava = vec3(1.0, 0.353, 0.227);
          vec3 mid = vec3(0.353, 0.102, 0.416);
          vec3 top = vec3(0.102, 0.024, 0.212);
          vec3 col = mix(lava, mid, smoothstep(-0.05, 0.22, h));
          col = mix(col, top, smoothstep(0.22, 0.85, h));
          // De maan: een grote lichtpaarse schijf met een zachte gloed
          float m = dot(dir, normalize(moonDir));
          col += vec3(0.88, 0.75, 1.0) * smoothstep(0.9965, 0.9975, m) * 1.6;
          col += vec3(0.6, 0.4, 0.9) * pow(max(m, 0.0), 60.0) * 0.45;
          gl_FragColor = vec4(col, 1.0);
          #include <colorspace_fragment>
        }`,
    })
  );
  sky.renderOrder = -10;
  scene.add(sky);

  const starPos = [];
  for (let i = 0; i < 600; i++) {
    const a = Math.random() * Math.PI * 2;
    const h = 0.18 + Math.random() * 0.82;
    const r = Math.sqrt(1 - h * h);
    starPos.push(Math.cos(a) * r * 180, h * 180, Math.sin(a) * r * 180);
  }
  const starGeo = new THREE.BufferGeometry();
  starGeo.setAttribute('position', new THREE.Float32BufferAttribute(starPos, 3));
  const stars = new THREE.Points(starGeo, new THREE.PointsMaterial({ color: 0xffeeff, size: 1.3, transparent: true, opacity: 0.9, depthWrite: false, fog: false, toneMapped: false }));
  stars.frustumCulled = false;
  scene.add(stars);
  scene.fog = new THREE.Fog(0x4a1a4a, 45, 160);

  // ---------- Licht: zacht paars van boven, rood van de lava van onder, en de maan ----------
  const hemi = new THREE.HemisphereLight(0xc8a8ff, 0x8a2a1a, 1.15);
  scene.add(hemi);
  const moon = new THREE.DirectionalLight(0xe8d8ff, 1.5);
  moon.castShadow = true;
  moon.shadow.mapSize.set(2048, 2048);
  moon.shadow.bias = -0.0005;
  moon.shadow.normalBias = 0.03;
  Object.assign(moon.shadow.camera, { left: -40, right: 40, top: 40, bottom: -40, near: 1, far: 120 });
  scene.add(moon, moon.target);
  const moonDir = new THREE.Vector3(0.4, 1, 0.5).normalize();
  // Een paar gekleurde lampen (zonder schaduw, dat is te zwaar): vuur bij de troon en paars boven de arena
  const arenaLight = new THREE.PointLight(0xb04dff, 60, 38, 2);
  arenaLight.position.set(0, 10, 0);
  scene.add(arenaLight);
  flickerLights.push({ light: arenaLight, base: 60 });

  // ---------- Het lavameer ----------
  const lava = new THREE.Mesh(
    new THREE.PlaneGeometry(400, 400),
    new THREE.ShaderMaterial({
      uniforms: { time: { value: 0 }, haze: { value: new THREE.Color(0x4a1a4a) } },
      vertexShader: `varying vec3 vWorld; void main() { vec4 w = modelMatrix * vec4(position, 1.0); vWorld = w.xyz; gl_Position = projectionMatrix * viewMatrix * w; }`,
      // Twee lagen "ruis" die langzaam stromen: donkerrood, oranje en gele vlekken die gloeien
      fragmentShader: `uniform float time; uniform vec3 haze; varying vec3 vWorld;
        float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
        float noise(vec2 p) {
          vec2 i = floor(p); vec2 f = fract(p); f = f * f * (3.0 - 2.0 * f);
          return mix(mix(hash(i), hash(i + vec2(1.0, 0.0)), f.x), mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0, 1.0)), f.x), f.y);
        }
        void main() {
          vec2 p = vWorld.xz;
          float n = noise(p * 0.07 + vec2(time * 0.05, time * 0.03)) * 0.6 + noise(p * 0.23 - vec2(time * 0.11, -time * 0.07)) * 0.4;
          vec3 col = mix(vec3(0.353, 0.039, 0.0), vec3(1.0, 0.353, 0.102), smoothstep(0.35, 0.65, n));
          col = mix(col, vec3(1.0, 0.824, 0.227) * 1.4, smoothstep(0.68, 0.85, n));
          float d = length(vWorld - cameraPosition);
          col = mix(col, haze * 1.6, smoothstep(70.0, 190.0, d) * 0.85);
          gl_FragColor = vec4(col, 1.0);
          #include <colorspace_fragment>
        }`,
    })
  );
  lava.rotation.x = -Math.PI / 2;
  lava.position.y = -1.2;
  scene.add(lava);

  // ---------- Het rotseiland waar het kasteel op staat ----------
  const rockMat = new THREE.MeshStandardMaterial({ map: tex('wall_rock'), roughness: 1, color: 0x8a6a7a });
  const islandSide = new THREE.Mesh(uvScale(new THREE.CylinderGeometry(44, 48, 3, 40, 1, true), 60, 0.8), rockMat);
  islandSide.position.y = -1.55;
  islandSide.receiveShadow = true;
  scene.add(islandSide);
  const islandTop = new THREE.Mesh(uvScale(new THREE.CircleGeometry(44, 40), 24), rockMat);
  islandTop.rotation.x = -Math.PI / 2;
  islandTop.position.y = -0.06;
  islandTop.receiveShadow = true;
  scene.add(islandTop);

  // ---------- Binnenplaats en rode loper ----------
  const courtMat = new THREE.MeshStandardMaterial({ map: tex('floor_stone_sand_random'), roughness: 0.95, color: 0xb8a8c8 });
  const court = new THREE.Mesh(uvScale(new THREE.PlaneGeometry(WALL_X * 2 + 2, WALL_Z * 2 + 2), 21, 23), courtMat);
  court.rotation.x = -Math.PI / 2;
  court.receiveShadow = true;
  scene.add(court);

  const carpetMat = new THREE.MeshStandardMaterial({ color: 0x9a1a2a, roughness: 0.85 });
  const edgeMat = new THREE.MeshStandardMaterial({ color: 0xffc83d, metalness: 0.3, roughness: 0.4, emissive: 0x2a1800 });
  // De loper gaat van de arena over de trapjes tot aan de troon: [van z, tot z, hoogte]
  for (const [z0, z1, y] of [[-15.4, -19.5, 0], [-19.5, -21.5, 0.5], [-21.5, -23.5, 1.0], [-23.5, -25.65, 1.5]]) {
    const len = z0 - z1;
    const carpet = decal(new THREE.PlaneGeometry(3, len), carpetMat.clone(), y + 0.012, 2);
    carpet.position.z = (z0 + z1) / 2;
    scene.add(carpet);
    for (const side of [-1, 1]) {
      const edge = decal(new THREE.PlaneGeometry(0.16, len), edgeMat.clone(), y + 0.016, 3);
      edge.position.set(side * 1.5, edge.position.y, (z0 + z1) / 2);
      scene.add(edge);
    }
  }

  // ---------- De arena: stenen cirkel met een gouden rand en een grote O in het midden ----------
  const arenaMat = new THREE.MeshStandardMaterial({ map: tex('floor_stone_pattern'), roughness: 0.85, color: 0xd8c8b0 });
  scene.add(decal(uvScale(new THREE.CircleGeometry(ARENA_RADIUS + 0.6, 64), 8), arenaMat, 0.01, 1));
  scene.add(decal(new THREE.RingGeometry(ARENA_RADIUS + 0.2, ARENA_RADIUS + 0.8, 64), gold.clone(), 0.02, 2));
  scene.add(decal(new THREE.CircleGeometry(4.6, 48), new THREE.MeshStandardMaterial({ color: 0x5a1a8a, emissive: 0x220833, roughness: 0.5 }), 0.025, 3));
  scene.add(decal(new THREE.RingGeometry(3.0, 4.0, 48), new THREE.MeshStandardMaterial({ color: 0xffc83d, emissive: 0x5a3a00, metalness: 0.3, roughness: 0.35 }), 0.03, 4));
  const curb = new THREE.Mesh(new THREE.TorusGeometry(ARENA_RADIUS + 0.85, 0.14, 6, 72), new THREE.MeshStandardMaterial({ color: 0x8a7a9a, roughness: 0.8 }));
  curb.rotation.x = -Math.PI / 2;
  curb.position.y = 0.06;
  curb.receiveShadow = true;
  scene.add(curb);

  // ---------- Muren met kantelen ----------
  const wall = (w, h, d, x, y, z) => add(texturedBox(w, h, d, stoneMat, 2), x, y, z, true);
  wall(WALL_T, WALL_H, WALL_Z * 2 + 4, -(WALL_X + 1), WALL_H / 2, 0); // links (west)
  wall(WALL_T, WALL_H, WALL_Z * 2 + 4, WALL_X + 1, WALL_H / 2, 0); // rechts (oost)
  wall(WALL_X * 2, WALL_H, WALL_T, 0, WALL_H / 2, -(WALL_Z + 1)); // achter (noord, achter de troon)
  // Voorkant (zuid) met een opening voor de poort
  const gateHalf = 3;
  const sideW = WALL_X - gateHalf;
  wall(sideW, WALL_H, WALL_T, -(gateHalf + sideW / 2), WALL_H / 2, WALL_Z + 1);
  wall(sideW, WALL_H, WALL_T, gateHalf + sideW / 2, WALL_H / 2, WALL_Z + 1);
  add(texturedBox(gateHalf * 2, 2.5, WALL_T, stoneMat, 2), 0, WALL_H - 1.25, WALL_Z + 1); // boven de poort

  // Kantelen: om de 2,4 meter een blok bovenop de muur
  const merlon = (x, z, rotY) => merlons.push(new THREE.Matrix4().compose(new THREE.Vector3(x, WALL_H + 0.6, z), new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), rotY), new THREE.Vector3(1, 1, 1)));
  for (let x = -WALL_X + 1.2; x <= WALL_X - 1.2; x += 2.4) {
    merlon(x, -(WALL_Z + 1), 0);
    merlon(x, WALL_Z + 1, 0);
  }
  for (let z = -WALL_Z + 1.2; z <= WALL_Z - 1.2; z += 2.4) {
    merlon(-(WALL_X + 1), z, Math.PI / 2);
    merlon(WALL_X + 1, z, Math.PI / 2);
  }

  // ---------- De poort: een dicht ijzeren valhek met een houten deur erachter ----------
  const door = texturedBox(gateHalf * 2, WALL_H - 2.5, 0.3, new THREE.MeshStandardMaterial({ map: tex('timber_square_planks'), roughness: 0.9, color: 0x8a6a5a }), 1.5);
  add(door, 0, (WALL_H - 2.5) / 2, WALL_Z + 1.6);
  const barGeo = new THREE.CylinderGeometry(0.06, 0.06, WALL_H - 2.5, 6);
  for (let x = -gateHalf + 0.3; x <= gateHalf - 0.3 + 0.01; x += 0.5) add(new THREE.Mesh(barGeo, iron), x, (WALL_H - 2.5) / 2, WALL_Z + 0.4);
  const crossGeo = new THREE.BoxGeometry(gateHalf * 2, 0.12, 0.12);
  for (const y of [0.8, 2.2, 3.6, 5.0]) add(new THREE.Mesh(crossGeo, iron), 0, y, WALL_Z + 0.4);
  colliders.push(new THREE.Box3(new THREE.Vector3(-gateHalf, 0, WALL_Z), new THREE.Vector3(gateHalf, WALL_H, WALL_Z + 2)));

  // ---------- Fakkels aan de binnenkant van de muren ----------
  const bracketGeo = new THREE.BoxGeometry(0.16, 0.5, 0.4);
  const cupGeo = new THREE.CylinderGeometry(0.22, 0.12, 0.25, 8);
  const torch = (x, z, nx, nz) => {
    const g = new THREE.Group();
    g.position.set(x + nx * 0.25, 3.4, z + nz * 0.25);
    g.rotation.y = Math.atan2(nx, nz);
    const bracket = new THREE.Mesh(bracketGeo, iron);
    bracket.position.set(0, -0.1, -0.1);
    const cup = new THREE.Mesh(cupGeo, iron);
    cup.position.set(0, 0.2, 0.12);
    g.add(bracket, cup);
    addFlame(g, 0, 0.3, 0.12, 0.8);
    scene.add(g);
  };
  for (const x of [-20, -12, 12, 20]) torch(x, -WALL_Z, 0, 1);
  for (const x of [-24, -16, -8, -5, 5, 8, 16, 24]) torch(x, WALL_Z, 0, -1);
  for (const z of [-26, -10, 10, 26]) {
    torch(-WALL_X, z, 1, 0);
    torch(WALL_X, z, -1, 0);
  }

  // ---------- Torens met paarse daken en vlaggetjes ----------
  const pennantTex = drawFlag(128, 72, false);
  const pennantMat = new THREE.MeshStandardMaterial({ map: pennantTex, side: THREE.DoubleSide, roughness: 0.8, emissive: 0x1a0628 });
  const tower = (x, z, radius, height) => {
    const body = new THREE.Mesh(uvScale(new THREE.CylinderGeometry(radius, radius * 1.1, height, 20), Math.round((Math.PI * 2 * radius) / 2.5), height / 2.5), stoneMat);
    add(body, x, height / 2, z);
    colliders.push(new THREE.Box3(new THREE.Vector3(x - radius, 0, z - radius), new THREE.Vector3(x + radius, height, z + radius)));
    // Kantelen in een kring
    for (let i = 0; i < 12; i++) {
      const a = (i / 12) * Math.PI * 2;
      merlons.push(new THREE.Matrix4().compose(
        new THREE.Vector3(x + Math.sin(a) * (radius - 0.35), height + 0.6, z + Math.cos(a) * (radius - 0.35)),
        new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), a),
        new THREE.Vector3(radius / 5, 1, 0.55)
      ));
    }
    // Een smallere nek met een puntdak, een gouden bol en een wapperend vlaggetje
    const neck = add(new THREE.Mesh(new THREE.CylinderGeometry(radius * 0.8, radius * 0.8, 1.6, 16), brickMat), x, height + 0.8, z);
    neck.castShadow = false;
    const roofH = radius * 1.5;
    add(new THREE.Mesh(new THREE.ConeGeometry(radius * 0.95, roofH, 20), purple), x, height + 1.6 + roofH / 2, z);
    const top = height + 1.6 + roofH;
    add(new THREE.Mesh(new THREE.SphereGeometry(radius * 0.11, 12, 10), gold), x, top + 0.15, z);
    add(new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 2.2, 6), iron), x, top + 1.1, z);
    const flagPivot = new THREE.Group();
    flagPivot.position.set(x, top + 1.75, z);
    const flag = new THREE.Mesh(new THREE.PlaneGeometry(1.6, 0.9), pennantMat);
    flag.position.x = 0.8;
    flagPivot.add(flag);
    scene.add(flagPivot);
    waving.push({ object: flagPivot, axis: 'y', amount: 0.35, speed: 2.4, base: 0, phase: x + z });
  };
  for (const x of [-(WALL_X + 1), WALL_X + 1]) for (const z of [-(WALL_Z + 1), WALL_Z + 1]) tower(x, z, 4, 16);
  tower(-5.5, WALL_Z + 1, 2.6, 12);
  tower(5.5, WALL_Z + 1, 2.6, 12);

  // Alle kantelen in één keer tekenen (dat is snel)
  const merlonMesh = new THREE.InstancedMesh(new THREE.BoxGeometry(1.2, 1.2, 2.2), stoneMat, merlons.length);
  merlons.forEach((m, i) => merlonMesh.setMatrixAt(i, m));
  merlonMesh.castShadow = true;
  merlonMesh.receiveShadow = true;
  scene.add(merlonMesh);

  // ---------- Het podium met drie trapjes, en de gouden troon ----------
  const step = (w, d, y0, z) => add(texturedBox(w, 0.5, d, brickMat, 1.5), 0, y0 + 0.25, z, true);
  step(14, 10, 0, -24.5);
  step(11, 8, 0.5, -25.5);
  step(8, 6, 1.0, -26.5);

  const seat = v3(CASTLE_POINTS.seat);
  add(new THREE.Mesh(new THREE.BoxGeometry(2.4, 0.6, 1.8), gold), 0, DAIS_TOP + 0.3, seat.z);
  add(new THREE.Mesh(new THREE.BoxGeometry(2.2, 0.1, 1.6), new THREE.MeshStandardMaterial({ color: 0x7a2aaa, roughness: 0.7, emissive: 0x1a0628 })), 0, seat.y - 0.05, seat.z + 0.05);
  add(new THREE.Mesh(new THREE.BoxGeometry(2.8, 5, 0.5), gold), 0, DAIS_TOP + 2.5, seat.z - 1.3);
  add(new THREE.Mesh(new THREE.BoxGeometry(2.2, 3.6, 0.1), purple), 0, DAIS_TOP + 2.6, seat.z - 1.02); // paars kussen in de rugleuning
  for (const side of [-1, 1]) add(new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.8, 1.6), gold), side * 1.4, DAIS_TOP + 1.0, seat.z);
  const bigO = add(new THREE.Mesh(new THREE.TorusGeometry(1.2, 0.28, 12, 32), gold), 0, 7.6, seat.z - 1.3);
  bigO.castShadow = true;
  // Een kroon bovenop de grote O
  const crown = new THREE.Group();
  crown.add(new THREE.Mesh(new THREE.CylinderGeometry(0.8, 0.7, 0.5, 16, 1, true), gold));
  for (let i = 0; i < 5; i++) {
    const spike = new THREE.Mesh(new THREE.ConeGeometry(0.16, 0.6, 6), gold);
    const a = (i / 5) * Math.PI * 2;
    spike.position.set(Math.sin(a) * 0.75, 0.5, Math.cos(a) * 0.75);
    crown.add(spike);
    const gem = new THREE.Mesh(new THREE.SphereGeometry(0.09, 8, 6), new THREE.MeshBasicMaterial({ color: 0xd060ff, toneMapped: false }));
    gem.position.set(Math.sin(a) * 0.79, 0, Math.cos(a) * 0.79);
    crown.add(gem);
  }
  crown.position.set(0, 9.1, seat.z - 1.3);
  scene.add(crown);
  colliders.push(new THREE.Box3(new THREE.Vector3(-1.6, DAIS_TOP, seat.z - 1.55), new THREE.Vector3(1.6, DAIS_TOP + 5, seat.z + 0.9)));

  // Sokkels voor twee gouden standbeelden van Omar (de beelden zelf: addStatues)
  const pedestals = [];
  for (const side of [-1, 1]) {
    const p = add(texturedBox(2.2, 1.5, 2.2, brickMat, 1.5), side * 9, 0.75, -26.5, true);
    pedestals.push(new THREE.Vector3(p.position.x, 1.5, p.position.z));
  }

  // ---------- Vaandels met de O van Omar ----------
  const bannerTex = drawFlag(128, 256, true);
  const bannerMat = new THREE.MeshStandardMaterial({ map: bannerTex, side: THREE.DoubleSide, roughness: 0.8, alphaTest: 0.5, emissive: 0x2a0a40, emissiveMap: bannerTex });
  const banner = (x, z, rotY, w, h, topY) => {
    const pivot = new THREE.Group();
    pivot.position.set(x, topY, z);
    pivot.rotation.y = rotY;
    const cloth = new THREE.Mesh(new THREE.PlaneGeometry(w, h), bannerMat);
    cloth.position.set(0, -h / 2, 0.08);
    cloth.castShadow = true;
    pivot.add(cloth);
    const rod = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, w + 0.4, 6), gold);
    rod.rotation.z = Math.PI / 2;
    rod.position.z = 0.08;
    pivot.add(rod);
    scene.add(pivot);
    waving.push({ object: pivot, axis: 'x', amount: 0.06, speed: 1.7, base: 0, phase: waving.length });
  };
  for (const x of [-24, -16, -8, 8, 16, 24]) banner(x, -WALL_Z, 0, 1.6, 3.2, WALL_H - 1);
  for (const x of [-4.5, 4.5]) banner(x, -WALL_Z, 0, 2, 7, WALL_H - 0.5);
  for (const z of [-20, 0, 20]) {
    banner(-WALL_X, z, Math.PI / 2, 1.6, 3.2, WALL_H - 1);
    banner(WALL_X, z, -Math.PI / 2, 1.6, 3.2, WALL_H - 1);
  }

  // ---------- Vuurschalen rond de arena en bij de troon ----------
  const pedestalGeo = new THREE.CylinderGeometry(0.25, 0.35, 1.4, 10);
  const bowlGeo = new THREE.CylinderGeometry(0.8, 0.4, 0.5, 14);
  const brazier = (x, y, z, size) => {
    const g = new THREE.Group();
    g.position.set(x, y, z);
    g.scale.setScalar(size);
    const foot = new THREE.Mesh(pedestalGeo, iron);
    foot.position.y = 0.7;
    const bowl = new THREE.Mesh(bowlGeo, iron);
    bowl.position.y = 1.6;
    foot.castShadow = bowl.castShadow = true;
    g.add(foot, bowl);
    addFlame(g, 0, 1.8, 0, 1.6);
    addFlame(g, 0.3, 1.75, 0.15, 1.1);
    addFlame(g, -0.25, 1.75, -0.2, 1.2);
    scene.add(g);
    colliders.push(new THREE.Box3(new THREE.Vector3(x - 0.45 * size, y, z - 0.45 * size), new THREE.Vector3(x + 0.45 * size, y + 1.9 * size, z + 0.45 * size)));
    braziers.push(new THREE.Vector3(x, y + 2.3 * size, z));
  };
  for (let i = 0; i < 4; i++) {
    const a = Math.PI / 4 + (i * Math.PI) / 2;
    brazier(Math.sin(a) * 17.5, 0, Math.cos(a) * 17.5, 1);
  }
  for (const side of [-1, 1]) {
    brazier(side * 3.4, DAIS_TOP, -24, 1.3);
    // Vuurgloed bij de troon
    const light = new THREE.PointLight(0xff8a3a, 30, 18, 2);
    light.position.set(side * 3.4, DAIS_TOP + 3.2, -24);
    scene.add(light);
    flickerLights.push({ light, base: 30 });
  }

  // ---------- Gouden standbeelden van Omar (optioneel, zodra zijn personage geladen is) ----------
  // ---------- Twee duistere ritueel-altaren naast de arena en twee samoerai-wachters bij de ingang ----------
  // (3D-modellen uit models/extra; ze komen erbij zodra ze geladen zijn)
  const placeModel = (file, height, x, z, rotY, solid = true) => {
    loadGLB(file).then((gltf) => {
      const model = gltf.scene.clone(true);
      model.rotation.y = rotY;
      model.updateMatrixWorld(true);
      const box = new THREE.Box3().setFromObject(model);
      const scale = height / (box.max.y - box.min.y);
      model.scale.multiplyScalar(scale);
      model.updateMatrixWorld(true);
      box.setFromObject(model);
      const center = box.getCenter(new THREE.Vector3());
      model.position.set(x - center.x, -box.min.y, z - center.z);
      model.traverse((c) => {
        if (!c.isMesh) return;
        c.castShadow = true;
        c.receiveShadow = true;
      });
      scene.add(model);
      if (solid) {
        model.updateMatrixWorld(true);
        colliders.push(new THREE.Box3().setFromObject(model));
      }
    }).catch(() => {});
  };
  for (const side of [-1, 1]) {
    placeModel('models/extra/ritueel.glb', 5, side * 23, 0, -side * Math.PI / 2); // naar de arena gedraaid
    placeModel('models/extra/samoerai.glb', 2.6, side * 5, 20, 0); // kijken naar jou als je binnenkomt
    // Blauw vuur van het altaar
    const glow = new THREE.PointLight(0x5aa8ff, 25, 14, 2);
    glow.position.set(side * 23, 5, 0);
    scene.add(glow);
    flickerLights.push({ light: glow, base: 25 });
  }

  let statuesAdded = false;
  /** Zet twee gouden Omar-beelden op de sokkels. `file` = het personage dat Omar draagt. */
  function addStatues(file) {
    if (statuesAdded || !file) return;
    statuesAdded = true;
    const statueGold = new THREE.MeshStandardMaterial({ color: 0xffc83d, metalness: 0.35, roughness: 0.3, emissive: 0x4a3000 });
    loadGLB(file).then((gltf) => {
      for (const [i, spot] of pedestals.entries()) {
        let skinned = false;
        gltf.scene.traverse((c) => (skinned ||= c.isSkinnedMesh));
        const model = skinned ? cloneSkinned(gltf.scene) : gltf.scene.clone(true);
        model.updateMatrixWorld(true);
        const box = new THREE.Box3().setFromObject(model);
        const scale = 5.2 / (box.max.y - box.min.y);
        model.scale.setScalar(scale);
        model.updateMatrixWorld(true);
        box.setFromObject(model);
        const center = box.getCenter(new THREE.Vector3());
        model.position.set(spot.x - center.x, spot.y - box.min.y, spot.z - center.z);
        model.rotation.y = i === 0 ? 0.35 : -0.35; // een beetje naar de arena gedraaid
        model.traverse((c) => {
          if (!c.isMesh) return;
          c.material = statueGold;
          c.castShadow = true;
          c.receiveShadow = true;
          if (c.isSkinnedMesh) c.frustumCulled = false;
        });
        scene.add(model);
        // Een stoere houding in plaats van de T-houding: zwaard-arm omhoog, andere hand in de zij
        model.updateMatrixWorld(true);
        const rig = createMixamoRig(model);
        if (rig) {
          new CharacterAnimator(rig).update(0.016, { moving: false, onGround: true, attack: null, pickup: null });
          rig.armR.rotation.set(-0.2, 0, -2.75);
          rig.elbowR.rotation.x = -0.25;
          rig.armL.rotation.set(-0.3, 0, 0.75);
          rig.elbowL.rotation.x = -1.7;
          rig.hips.rotation.set(-0.08, i === 0 ? 0.15 : -0.15, 0);
          rig.apply();
        }
      }
    }).catch(() => {});
  }

  return {
    colliders,
    bounds: { x: WALL_X - 0.5, z: WALL_Z - 0.5 }, // verder kun je niet lopen (de muren)
    night: 0.85, // het is altijd nacht in het kasteel (de pluisjes worden vuurvliegjes)
    lampsOn: 1, // het warme lichtje bij de speler is altijd aan (main.js)
    exposure: 1.25, // beeld iets feller: het kasteel is donker (graphics.js)
    timeOfDay: 0.95,
    sunDir: moonDir, // waar het licht vandaan komt (hier: de maan)
    isMoon: true,
    /** In het kasteel zijn geen huizen. */
    insideHouse() {
      return false;
    },
    castle: {
      spawn: v3(CASTLE_POINTS.spawn),
      seat,
      landing: v3(CASTLE_POINTS.landing),
      fightSpot: v3(CASTLE_POINTS.fightSpot),
      gate: v3(CASTLE_POINTS.gate),
      throneFront: v3(CASTLE_POINTS.throneFront),
      center: new THREE.Vector3(0, 0, 0),
      braziers,
      addStatues,
      partyLights: flickerLights.map((f) => f.light), // voor het feest als je Omar verslaat (omar.js)
    },
    /**
     * Elke frame: lucht en maanlicht reizen mee met de speler, de lava stroomt, vuur flakkert en vaandels wapperen.
     * Dit gebruikt de echte klok, zodat het kasteel ook leeft als het spel stilstaat (tijdens het filmpje).
     */
    updateSun(playerPos) {
      const t = performance.now() / 1000;
      sky.position.copy(playerPos);
      stars.position.copy(playerPos);
      stars.material.opacity = 0.75 + Math.sin(t * 1.3) * 0.15;
      moon.target.position.copy(playerPos);
      moon.position.copy(playerPos).addScaledVector(moonDir, 55);
      lava.material.uniforms.time.value = t;
      for (const f of flickerFlames) {
        const s = f.base * (0.85 + Math.random() * 0.3);
        f.mesh.scale.set(f.base * (0.9 + Math.sin(t * 13 + f.phase) * 0.08), s, f.base * (0.9 + Math.cos(t * 11 + f.phase) * 0.08));
      }
      for (const l of flickerLights) l.light.intensity = l.base * (0.85 + Math.sin(t * 9 + l.base) * 0.08 + Math.random() * 0.1);
      for (const w of waving) w.object.rotation[w.axis] = w.base + Math.sin(t * w.speed + w.phase) * w.amount;
    },
  };
}
