import * as THREE from 'three';
import { LEVEL } from './levels.js';

// De wereld van het huidige level: grond, pad, huizen (waar je in kunt!), ruïnes, natuur,
// de boss-arena, de checkpoints en de kisten. Wat er in elk level staat, staat in levels.js.

export const BOUNDS = LEVEL.half; // het level loopt van -BOUNDS.x tot BOUNDS.x (en z)
export const WALKABLE = { x: BOUNDS.x - 1.5, z: BOUNDS.z - 1.5 }; // verder kun je niet lopen

const v3 = (x, z, y = 0) => new THREE.Vector3(x, y, z);

// Checkpoints: de eerste is het begin van het level, de tweede een vlag halverwege
export const CHECKPOINTS = LEVEL.checkpoints.map(([id, name, x, z]) => ({ id, name, position: v3(x, z) }));

// De boss-arena staat altijd aan het eind (noorden) van het level
export const ARENAS = [{ id: LEVEL.boss, center: v3(0, -78), radius: 18 }];

export const CHESTS = LEVEL.chests.map(([id, x, y, z, item]) => ({ id, position: v3(x, z, y), item }));

export const VILLAGE_CENTER = LEVEL.village ? v3(LEVEL.village.center[0], LEVEL.village.center[1]) : null;

// Het pad als losse lijnstukken
const PATHS = LEVEL.path.slice(1).map((p, i) => [LEVEL.path[i], p]);

/** In welk "gebied" ligt dit punt? In een level is dat overal hetzelfde thema. */
export function regionAt() {
  return LEVEL.theme;
}

export const REGION_NAMES = { weide: LEVEL.name, woud: LEVEL.name, hoogland: LEVEL.name };

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

/** Laadt een textuur uit textures/ (pixel-art: scherp, en herhalend). smooth = zacht in plaats van pixelig (voor de grond). */
export function tex(name, smooth = false) {
  const key = name + (smooth ? ':smooth' : '');
  if (!textureCache[key]) {
    const t = textureLoader.load(`textures/${name}.png`);
    t.wrapS = t.wrapT = THREE.RepeatWrapping;
    t.colorSpace = THREE.SRGBColorSpace;
    t.magFilter = smooth ? THREE.LinearFilter : THREE.NearestFilter;
    t.anisotropy = 8;
    textureCache[key] = t;
  }
  return textureCache[key];
}

// ---------- Wind ----------
// Eén klok voor alles wat in de wind beweegt (bomen, gras, planten).
export const WIND = { value: 0 };

/**
 * Laat een materiaal meewiegen in de wind. Hoe hoger een punt (y), hoe meer het beweegt.
 * @param {object} opts  strength = hoe ver, base = vanaf welke hoogte (lokaal) het begint te bewegen,
 *                       lift = hoeveel de hoogte van het hele exemplaar meetelt (hoge boombladeren wiegen meer)
 */
export function addWind(material, { strength = 0.15, base = 0, speed = 1.6, lift = 0 } = {}) {
  const before = material.onBeforeCompile;
  material.onBeforeCompile = (shader, renderer) => {
    before?.call(material, shader, renderer);
    shader.uniforms.windTime = WIND;
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nuniform float windTime;')
      .replace(
        '#include <begin_vertex>',
        `#include <begin_vertex>
        {
          vec3 windOrigin = vec3(0.0);
          #ifdef USE_INSTANCING
            windOrigin = instanceMatrix[3].xyz;
          #endif
          float windH = max(0.0, transformed.y - ${base.toFixed(3)}) + windOrigin.y * ${lift.toFixed(3)};
          float windPhase = windTime * ${speed.toFixed(3)} + windOrigin.x * 0.21 + windOrigin.z * 0.17;
          float gust = 0.65 + 0.35 * sin(windTime * 0.37 + windOrigin.x * 0.03);
          transformed.x += sin(windPhase) * windH * ${strength.toFixed(3)} * gust;
          transformed.z += cos(windPhase * 0.8 + 1.3) * windH * ${(strength * 0.6).toFixed(3)} * gust;
        }`
      );
  };
  material.customProgramCacheKey = () => `wind-${strength}-${base}-${speed}-${lift}`;
  return material;
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

function distToSegment(px, pz, [ax, az], [bx, bz]) {
  const dx = bx - ax;
  const dz = bz - az;
  const t = Math.max(0, Math.min(1, ((px - ax) * dx + (pz - az) * dz) / (dx * dx + dz * dz)));
  return Math.hypot(px - (ax + dx * t), pz - (az + dz * t));
}

export function distToPath(x, z) {
  let d = Infinity;
  for (const [a, b] of PATHS) d = Math.min(d, distToSegment(x, z, a, b));
  return d;
}

/** Ligt dit punt binnen een huis (met wat ruimte eromheen)? */
function inHouse(x, z, margin = 0) {
  return (LEVEL.houses ?? []).some(([hx, hz, w, d]) => Math.abs(x - hx) < Math.max(w, d) / 2 + 1.5 + margin && Math.abs(z - hz) < Math.max(w, d) / 2 + 1.5 + margin);
}

/** Is hier ruimte voor een boom of steen? (niet op het pad, in de arena, bij checkpoints, kisten, huizen...) */
export function isFree(x, z, margin = 0) {
  if (Math.abs(x) > WALKABLE.x - 1 || Math.abs(z) > WALKABLE.z - 1) return false;
  if (distToPath(x, z) < 4 + margin) return false;
  if (VILLAGE_CENTER && Math.hypot(x - VILLAGE_CENTER.x, z - VILLAGE_CENTER.z) < 18) return false;
  if (inHouse(x, z, margin)) return false;
  for (const a of ARENAS) if (Math.hypot(x - a.center.x, z - a.center.z) < a.radius + 5) return false;
  for (const c of CHECKPOINTS) if (Math.hypot(x - c.position.x, z - c.position.z) < 8) return false;
  for (const c of CHESTS) if (Math.hypot(x - c.position.x, z - c.position.z) < 4) return false;
  for (const [nx, nz] of (LEVEL.npcs ?? []).map((n) => [n[1], n[2]])) if (Math.hypot(x - nx, z - nz) < 4) return false;
  for (const spots of Object.values(LEVEL.questItems ?? {})) for (const [qx, qz] of spots) if (Math.hypot(x - qx, z - qz) < 3) return false;
  for (const b of LEVEL.blocks ?? []) if (Math.abs(x - b[0]) < b[3] / 2 + 2 && Math.abs(z - b[2]) < b[5] / 2 + 2) return false;
  return true;
}

// ---------- Dag en nacht ----------
const DAY_LENGTH = 360; // een hele dag duurt 6 minuten
const glowingWindows = [];
const glowingLamps = [];
const glowingFires = [];

// Kleuren op bepaalde momenten van de dag; daartussen vloeien ze in elkaar over
const DAY_KEYS = [
  { t: 0.0, top: 0x0a1030, horizon: 0x1b2850, sun: 0x8fa8ff, sunPower: 0.45, ambient: 0.35, skyLight: 0x6a7fc0, stars: 1 }, // nacht
  { t: 0.22, top: 0x1d2f6a, horizon: 0xf2a37a, sun: 0xffb27a, sunPower: 0.9, ambient: 0.55, skyLight: 0xffc9a0, stars: 0.3 }, // zonsopgang
  { t: 0.3, top: 0x3d7fd9, horizon: 0xcdeaff, sun: 0xffffff, sunPower: 1.6, ambient: 0.9, skyLight: 0xffffff, stars: 0 }, // ochtend
  { t: 0.7, top: 0x3d7fd9, horizon: 0xcdeaff, sun: 0xffffff, sunPower: 1.6, ambient: 0.9, skyLight: 0xffffff, stars: 0 }, // middag
  { t: 0.78, top: 0x4a3a7a, horizon: 0xff9a5c, sun: 0xff8a4a, sunPower: 1.0, ambient: 0.6, skyLight: 0xffb08a, stars: 0.2 }, // zonsondergang
  { t: 0.86, top: 0x0a1030, horizon: 0x1b2850, sun: 0x8fa8ff, sunPower: 0.45, ambient: 0.35, skyLight: 0x6a7fc0, stars: 1 }, // nacht
  { t: 1.0, top: 0x0a1030, horizon: 0x1b2850, sun: 0x8fa8ff, sunPower: 0.45, ambient: 0.35, skyLight: 0x6a7fc0, stars: 1 },
];

function dayLook(t) {
  let i = 1;
  while (i < DAY_KEYS.length - 1 && DAY_KEYS[i].t < t) i++;
  const a = DAY_KEYS[i - 1];
  const b = DAY_KEYS[i];
  const k = THREE.MathUtils.smoothstep(t, a.t, b.t);
  const col = (key) => new THREE.Color(a[key]).lerp(new THREE.Color(b[key]), k);
  const num = (key) => a[key] + (b[key] - a[key]) * k;
  return { top: col('top'), horizon: col('horizon'), sun: col('sun'), skyLight: col('skyLight'), sunPower: num('sunPower'), ambient: num('ambient'), stars: num('stars') };
}

/** Sterren aan de hemel (alleen 's nachts zichtbaar). */
function createStars(scene) {
  const rand = seededRandom(5);
  const positions = [];
  for (let i = 0; i < 700; i++) {
    const a = rand() * Math.PI * 2;
    const h = 0.12 + rand() * 0.88; // alleen boven de horizon
    const r = Math.sqrt(1 - h * h);
    positions.push(Math.cos(a) * r * 180, h * 180, Math.sin(a) * r * 180);
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  const stars = new THREE.Points(geo, new THREE.PointsMaterial({ color: 0xffffff, size: 1.3, sizeAttenuation: true, transparent: true, opacity: 0, depthWrite: false, fog: false, toneMapped: false }));
  stars.frustumCulled = false;
  scene.add(stars);
  return stars;
}

/** Een lucht die van diepblauw (boven) naar lichtblauw (horizon) loopt. */
function createSky(scene) {
  const sky = new THREE.Mesh(
    new THREE.SphereGeometry(200, 32, 16),
    new THREE.ShaderMaterial({
      side: THREE.BackSide,
      depthWrite: false,
      fog: false,
      uniforms: {
        top: { value: new THREE.Color(0x3d7fd9) },
        horizon: { value: new THREE.Color(0xcdeaff) },
        sunDir: { value: new THREE.Vector3(0, 1, 0) },
        sunColor: { value: new THREE.Color(0xffffff) },
        sunSize: { value: 1 }, // 1 = zon, kleiner = maan
      },
      vertexShader: `varying vec3 vPos; void main() { vPos = position; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
      // Kleurverloop van horizon naar boven, met een zon (of maan) met een zachte gloed eromheen
      fragmentShader: `uniform vec3 top; uniform vec3 horizon; uniform vec3 sunDir; uniform vec3 sunColor; uniform float sunSize; varying vec3 vPos;
        void main() {
          vec3 dir = normalize(vPos);
          float h = clamp(dir.y, 0.0, 1.0);
          vec3 col = mix(horizon, top, pow(h, 0.55));
          float s = max(dot(dir, normalize(sunDir)), 0.0);
          col += sunColor * (smoothstep(0.9993 - 0.0004 * (1.0 - sunSize), 0.9997, s) * 2.5 * sunSize + smoothstep(0.9988, 0.9995, s) * (1.0 - sunSize) * 1.2);
          col += sunColor * (pow(s, 24.0) * 0.35 + pow(s, 4.0) * 0.12) * sunSize;
          col = mix(col, horizon * 1.05, (1.0 - smoothstep(0.0, 0.12, dir.y)) * 0.6); // nevel bij de horizon
          gl_FragColor = vec4(col, 1.0);
        #include <colorspace_fragment>
        }`,
    })
  );
  scene.add(sky);
  return sky;
}

/** De grond: één groot vlak dat 4 texturen mengt (gras, aarde, rots, stenen vloer). */
function createGround(scene) {
  const w = BOUNDS.x * 2 + 80;
  const d = BOUNDS.z * 2 + 80;
  const geo = new THREE.PlaneGeometry(w, d, Math.round(w / 1.4), Math.round(d / 1.4));
  geo.rotateX(-Math.PI / 2);
  const pos = geo.attributes.position;
  const colors = [];
  const blends = [];
  const rand = seededRandom(7);
  const base = { weide: [1.6, 1.6, 1.35], woud: [0.82, 0.98, 0.78], hoogland: [1.05, 1.0, 0.92] }[LEVEL.theme];
  const tint = new THREE.Color(...(LEVEL.tint ? base.map((v, i) => v * LEVEL.tint[i]) : base));
  const c = new THREE.Color();
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i);
    const z = pos.getZ(i);
    c.copy(tint).offsetHSL(0, 0, (rand() - 0.5) * 0.06);
    // gewicht per textuur: [gras, aarde, rots, stenen vloer]
    let wgt = LEVEL.theme === 'hoogland' ? [0.35, 0, 0.65, 0] : [1, 0, 0, 0];
    let p = distToPath(x, z);
    if (VILLAGE_CENTER) p = Math.min(p, Math.hypot(x - VILLAGE_CENTER.x, z - VILLAGE_CENTER.z) - 7);
    if (p < 2.6) {
      const k = 1 - Math.max(0, p) / 2.6;
      wgt = wgt.map((v, j) => v * (1 - k) + (j === 1 ? k : 0));
      c.lerp(new THREE.Color(1, 1, 1), k);
    }
    for (const a of ARENAS) {
      const dist = Math.hypot(x - a.center.x, z - a.center.z);
      if (dist < a.radius + 1) {
        const k = Math.min(1, (a.radius + 1 - dist) / 2);
        wgt = wgt.map((v, j) => v * (1 - k) + (j === 3 ? k : 0));
        c.lerp(new THREE.Color(0.85, 0.85, 0.85), k);
      }
    }
    colors.push(c.r, c.g, c.b);
    blends.push(...wgt);
  }
  geo.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
  geo.setAttribute('blend', new THREE.Float32BufferAttribute(blends, 4));

  const material = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.95 });
  material.onBeforeCompile = (shader) => {
    shader.uniforms.tGrass = { value: tex('floor_ground_grass', true) };
    shader.uniforms.tDirt = { value: tex('floor_ground_dirt', true) };
    shader.uniforms.tRock = { value: tex('wall_rock', true) };
    shader.uniforms.tStone = { value: tex('floor_stone_pattern') };
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nattribute vec4 blend;\nvarying vec4 vBlend;\nvarying vec2 vGroundUv;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvBlend = blend;\nvGroundUv = position.xz / 2.5;');
    shader.fragmentShader = shader.fragmentShader
      .replace(
        '#include <common>',
        `#include <common>
        uniform sampler2D tGrass, tDirt, tRock, tStone;
        varying vec4 vBlend;
        varying vec2 vGroundUv;
        // Zachte ruis: grote vlekken lichter/donkerder gras, zodat de grond niet overal hetzelfde is
        float gHash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
        float gNoise(vec2 p) {
          vec2 i = floor(p); vec2 f = fract(p); f = f * f * (3.0 - 2.0 * f);
          return mix(mix(gHash(i), gHash(i + vec2(1, 0)), f.x), mix(gHash(i + vec2(0, 1)), gHash(i + vec2(1, 1)), f.x), f.y);
        }
        // Textuur op twee schalen mengen: dan zie je geen herhalend patroon meer
        vec3 gTex(sampler2D t, vec2 uv) { return mix(texture2D(t, uv).rgb, texture2D(t, uv * 0.31 + 0.37).rgb, 0.45); }`
      )
      .replace(
        '#include <map_fragment>',
        `vec3 groundTex = gTex(tGrass, vGroundUv) * vBlend.x + gTex(tDirt, vGroundUv) * vBlend.y
          + gTex(tRock, vGroundUv * 0.6) * vBlend.z + texture2D(tStone, vGroundUv).rgb * vBlend.w;
        // Minder harde pixel-contrast, en grote vlekken: droog/geel gras en donker, sappig gras
        groundTex = mix(vec3(dot(groundTex, vec3(0.333))), groundTex, 1.15);
        groundTex = mix(groundTex, vec3(dot(groundTex, vec3(0.333))) * vec3(1.0, 1.05, 0.9), 0.25);
        float gPatch = gNoise(vGroundUv * 0.09) * 0.65 + gNoise(vGroundUv * 0.35) * 0.35;
        float grassy = vBlend.x;
        groundTex *= mix(vec3(1.0), mix(vec3(0.92, 1.02, 0.86), vec3(1.32, 1.24, 0.9), gPatch), grassy);
        diffuseColor.rgb *= groundTex;`
      );
  };
  const ground = new THREE.Mesh(geo, material);
  ground.receiveShadow = true;
  scene.add(ground);
}

// Daken van huizen: verdwijnen als je naar binnen loopt, zodat je het interieur ziet
const houseRoofs = [];

/**
 * Een huis waar je in kunt: muren met een deuropening, een houten vloer, meubels,
 * ramen met licht, een schoorsteen en een puntdak.
 */
function createHouse(scene, colliders, [x, z, w, d, h, wallName, roofName], index) {
  const house = new THREE.Group();
  // Deur aan de kant van het dorpsplein (in stappen van 90 graden, zodat de botsing klopt)
  const target = VILLAGE_CENTER ?? v3(0, 0);
  const angle = Math.atan2(target.x - x, target.z - z);
  const rot = Math.round(angle / (Math.PI / 2)) * (Math.PI / 2);
  house.position.set(x, 0, z);
  house.rotation.y = rot;
  const wallMat = texMat(wallName);
  const t = 0.25; // muurdikte
  const door = 1.7; // breedte van de deuropening
  const wallPieces = [];
  const wall = (pw, ph, pd, px, py, pz) => {
    const m = texturedBox(pw, ph, pd, wallMat, 2);
    m.position.set(px, py, pz);
    house.add(m);
    wallPieces.push(m);
  };
  wall(w, h, t, 0, h / 2, -d / 2 + t / 2); // achtermuur
  wall(t, h, d, -w / 2 + t / 2, h / 2, 0); // zijmuren
  wall(t, h, d, w / 2 - t / 2, h / 2, 0);
  const side = (w - door) / 2;
  wall(side, h, t, -w / 2 + side / 2, h / 2, d / 2 - t / 2); // voorkant links en rechts van de deur
  wall(side, h, t, w / 2 - side / 2, h / 2, d / 2 - t / 2);
  wall(door, h - 2.3, t, 0, 2.3 + (h - 2.3) / 2, d / 2 - t / 2); // boven de deur

  // Houten vloer
  const floor = new THREE.Mesh(new THREE.PlaneGeometry(w - t * 2, d - t * 2), new THREE.MeshStandardMaterial({ map: tex('floor_wood_planks'), roughness: 0.85 }));
  floor.geometry.attributes.uv.array.forEach((v, i, arr) => (arr[i] = v * (i % 2 === 0 ? w / 2 : d / 2)));
  floor.rotation.x = -Math.PI / 2;
  floor.position.y = 0.02;
  floor.receiveShadow = true;
  house.add(floor);

  // Meubels: tafel met krukjes, een bed, een kast, een haard
  const wood = texMat('timber_square_planks');
  const box = (bw, bh, bd, bx, by, bz, mat = wood) => {
    const m = texturedBox(bw, bh, bd, mat, 1);
    m.position.set(bx, by, bz);
    house.add(m);
    return m;
  };
  // Onzichtbare botsingsvakken voor de grote meubels (je loopt er niet doorheen)
  const solid = (bw, bh, bd, bx, bz) => {
    const m = new THREE.Mesh(new THREE.BoxGeometry(bw, bh, bd));
    m.position.set(bx, bh / 2, bz);
    m.visible = false;
    house.add(m);
    wallPieces.push(m);
  };
  solid(1.4, 0.84, 0.9, -w * 0.15, -d * 0.05); // tafel
  solid(1.1, 0.55, 2.0, w / 2 - t - 0.6, -d / 2 + t + 1.05); // bed
  solid(1.4, 1.8, 0.45, -w / 2 + t + 0.75, -d / 2 + t + 0.25); // kast
  solid(1.4, 1.1, 0.5, 0, -d / 2 + t + 0.25); // haard
  box(1.4, 0.08, 0.9, -w * 0.15, 0.8, -d * 0.05); // tafelblad
  for (const [lx, lz] of [[-0.6, -0.35], [0.6, -0.35], [-0.6, 0.35], [0.6, 0.35]]) box(0.08, 0.8, 0.08, -w * 0.15 + lx, 0.4, -d * 0.05 + lz);
  box(0.45, 0.45, 0.45, -w * 0.15 - 1.0, 0.23, -d * 0.05);
  box(0.45, 0.45, 0.45, -w * 0.15 + 1.0, 0.23, -d * 0.05);
  const bedX = w / 2 - t - 0.6;
  box(1.1, 0.45, 2.0, bedX, 0.23, -d / 2 + t + 1.05);
  const blanket = new THREE.Mesh(new THREE.BoxGeometry(1.05, 0.1, 1.4), new THREE.MeshStandardMaterial({ color: [0xb5443b, 0x3b6fb5, 0x6a9b3b, 0x9b6a3b][index % 4], roughness: 0.9 }));
  blanket.position.set(bedX, 0.5, -d / 2 + t + 1.3);
  house.add(blanket);
  const pillow = new THREE.Mesh(new THREE.BoxGeometry(0.8, 0.12, 0.4), new THREE.MeshStandardMaterial({ color: 0xf2ece0 }));
  pillow.position.set(bedX, 0.52, -d / 2 + t + 0.3);
  house.add(pillow);
  box(1.4, 1.8, 0.45, -w / 2 + t + 0.75, 0.9, -d / 2 + t + 0.25); // kast
  // Haard met een gloeiend vuurtje
  box(1.4, 1.1, 0.5, 0, 0.55, -d / 2 + t + 0.25, texMat('wall_brick_stone_center'));
  const fire = new THREE.Mesh(new THREE.ConeGeometry(0.22, 0.45, 6), new THREE.MeshBasicMaterial({ color: 0xffa040, toneMapped: false }));
  fire.position.set(0, 0.35, -d / 2 + t + 0.55);
  house.add(fire);
  glowingFires.push(fire);

  // Puntdak met gevels
  const rh = d * 0.45;
  const slope = Math.atan2(rh, d / 2);
  const slopeLen = Math.hypot(d / 2, rh);
  const roofMat = texMat(roofName);
  const roofGroup = new THREE.Group();
  for (const s of [-1, 1]) {
    const roof = texturedBox(w + 0.7, 0.14, slopeLen + 0.45, roofMat, 1.5);
    roof.position.set(0, h + rh / 2 + 0.08, (s * d) / 4 + s * 0.08);
    roof.rotation.x = s * slope;
    roofGroup.add(roof);
    const shape = new THREE.Shape([new THREE.Vector2(-d / 2, 0), new THREE.Vector2(d / 2, 0), new THREE.Vector2(0, rh)]);
    const gableGeo = new THREE.ShapeGeometry(shape);
    const guv = gableGeo.attributes.uv;
    for (let i = 0; i < guv.count; i++) guv.setXY(i, gableGeo.attributes.position.getX(i) / 2, gableGeo.attributes.position.getY(i) / 2);
    const gable = new THREE.Mesh(gableGeo, new THREE.MeshStandardMaterial({ map: tex(wallName), roughness: 0.9, side: THREE.DoubleSide }));
    gable.position.set((s * w) / 2, h, 0);
    gable.rotation.y = s * (Math.PI / 2);
    gable.castShadow = true;
    roofGroup.add(gable);
  }
  const chimney = texturedBox(0.6, 1.6, 0.6, texMat('wall_brick_stone_center'), 1);
  chimney.position.set(w * 0.25, h + rh * 0.7, -d * 0.15);
  roofGroup.add(chimney);
  house.add(roofGroup);

  // Ramen (aan de buitenkant en de binnenkant); ze gloeien warm, vooral 's nachts
  const plane = (texName, pw, ph, px, py, pz, ry, glow) => {
    const m = new THREE.Mesh(
      new THREE.PlaneGeometry(pw, ph),
      new THREE.MeshStandardMaterial({ map: tex(texName), roughness: 0.8, emissive: glow ? 0xffc46b : 0x000000, emissiveMap: glow ? tex(texName) : null, emissiveIntensity: glow ? 0.6 : 0 })
    );
    if (glow) glowingWindows.push(m.material);
    m.position.set(px, py, pz);
    m.rotation.y = ry;
    house.add(m);
  };
  for (const [px, pz, ry, inside] of [
    [-w * 0.32, d / 2 + 0.01, 0], [w * 0.32, d / 2 + 0.01, 0],
    [w / 2 + 0.01, 0, Math.PI / 2], [-w / 2 - 0.01, 0, -Math.PI / 2], [0, -d / 2 - 0.01, Math.PI],
    [w / 2 - t - 0.01, 0, -Math.PI / 2, true], [-w / 2 + t + 0.01, 0, Math.PI / 2, true],
  ]) plane(inside || Math.abs(ry) === Math.PI / 2 ? 'window_round_divided_lit' : 'window_square_divided_lit', 0.9, 0.9, px, h * 0.6, pz, ry, true);
  // Een openstaande deur naast de opening
  plane('door_wood_handle', 1.1, 2.1, -door / 2 - 0.05, 1.05, d / 2 + 0.55, Math.PI / 2, false);
  scene.add(house);

  // Botsingsvakken van alle muurstukken (het huis draait in stappen van 90 graden, dus dat klopt)
  house.updateMatrixWorld(true);
  for (const piece of wallPieces) colliders.push(new THREE.Box3().setFromObject(piece));
  const inner = new THREE.Box3().setFromObject(floor);
  inner.min.y = -1;
  inner.max.y = h; // binnen = boven de vloer en onder het dak
  houseRoofs.push({ roof: roofGroup, inner });
}

/** De dorpsput in het midden van Muntdorp. */
function createWell(scene, colliders) {
  const c = VILLAGE_CENTER;
  const stone = texMat('wall_brick_stone_center');
  const ring = new THREE.Mesh(new THREE.CylinderGeometry(1.2, 1.3, 1, 16, 1, true), new THREE.MeshStandardMaterial({ map: tex('wall_brick_stone_center'), roughness: 0.9, side: THREE.DoubleSide }));
  ring.position.set(c.x, 0.5, c.z);
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
  void stone;
  colliders.push(new THREE.Box3(new THREE.Vector3(c.x - 1.3, 0, c.z - 1.3), new THREE.Vector3(c.x + 1.3, 1, c.z + 1.3)));
}

/** Lantaarnpalen langs het pad: 's nachts gloeien ze. */
function createLanterns(scene, colliders) {
  const wood = texMat('timber_square_planks');
  const glassMat = new THREE.MeshStandardMaterial({ color: 0xffd27a, emissive: 0xffb347, emissiveIntensity: 1.2, roughness: 0.4 });
  glowingLamps.push(glassMat);
  const pts = LEVEL.path;
  for (let i = 0; i < pts.length - 1; i++) {
    const [ax, az] = pts[i];
    const [bx, bz] = pts[i + 1];
    const len = Math.hypot(bx - ax, bz - az);
    for (let s = 6; s < len; s += 16) {
      const k = s / len;
      const nx = -(bz - az) / len;
      const nz = (bx - ax) / len;
      const side = (i + Math.floor(s / 16)) % 2 ? 1 : -1;
      const x = ax + (bx - ax) * k + nx * 3.3 * side;
      const z = az + (bz - az) * k + nz * 3.3 * side;
      if (Math.hypot(x - ARENAS[0].center.x, z - ARENAS[0].center.z) < ARENAS[0].radius + 3) continue;
      const post = texturedBox(0.16, 2.6, 0.16, wood, 1);
      post.position.set(x, 1.3, z);
      const lamp = new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.42, 0.34), glassMat);
      lamp.position.set(x, 2.75, z);
      const cap = texturedBox(0.46, 0.08, 0.46, wood, 1);
      cap.position.set(x, 3.0, z);
      scene.add(post, lamp, cap);
      colliders.push(new THREE.Box3(new THREE.Vector3(x - 0.12, 0, z - 0.12), new THREE.Vector3(x + 0.12, 2.6, z + 0.12)));
    }
  }
}

/** Bomen (met InstancedMesh), rotsblokken, een bosrand rondom het level, bloemen en paddenstoelen. */
function createNature(scene, colliders) {
  const rand = seededRandom(42 + LEVEL.subtitle.length);
  const kind = { weide: 'green', woud: 'dark', hoogland: 'pine' }[LEVEL.theme];
  const trees = []; // [x, z, size, kind, collide]
  for (let i = 0, tries = 0; i < LEVEL.trees && tries < LEVEL.trees * 30; tries++) {
    const x = (rand() * 2 - 1) * WALKABLE.x;
    const z = (rand() * 2 - 1) * WALKABLE.z;
    if (!isFree(x, z)) continue;
    if (trees.some((t) => Math.hypot(t[0] - x, t[1] - z) < 3.2)) continue;
    trees.push([x, z, (LEVEL.theme === 'woud' ? 1.1 : 0.8) + rand() * 0.6, kind, true]);
    i++;
  }
  // Bosrand buiten het level (alleen voor de sier: je kunt er toch niet komen)
  const borderCount = LEVEL.theme === 'hoogland' ? 90 : 320;
  for (let i = 0; i < borderCount; i++) {
    const sideX = rand() < BOUNDS.z / (BOUNDS.x + BOUNDS.z);
    const out = 3 + rand() * 22;
    let x;
    let z;
    if (sideX) {
      x = (rand() < 0.5 ? -1 : 1) * (BOUNDS.x + out);
      z = (rand() * 2 - 1) * (BOUNDS.z + 20);
    } else {
      z = (rand() < 0.5 ? -1 : 1) * (BOUNDS.z + out);
      x = (rand() * 2 - 1) * (BOUNDS.x + 20);
    }
    trees.push([x, z, 1 + rand() * 0.8, kind, false]);
  }

  const trunkMesh = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.22, 0.3, 1.6, 7), new THREE.MeshStandardMaterial({ color: 0x6b4226, roughness: 0.9 }), trees.length);
  const leafColors = { dark: [0x24502c, 0x2d5e33, 0x1f4527], green: [0x3f9b4a, 0x4fae52, 0x2f8a45], pine: [0x3a6b48, 0x46775a] };
  const roundColors = [0x5aa845, 0x6fb84a, 0x4c9a3e, 0x86c24f];
  // Naaldbomen (3 kegels) en, in de weide, ook ronde loofbomen (bolle bladerdaken); allebei wiegen in de wind
  const leafMesh = new THREE.InstancedMesh(new THREE.ConeGeometry(1.3, 1.6, 8), addWind(new THREE.MeshStandardMaterial({ roughness: 0.8, flatShading: true }), { strength: 0.045, base: -0.8, speed: 1.3, lift: 0.6 }), trees.length * 3);
  const roundMesh = new THREE.InstancedMesh(new THREE.IcosahedronGeometry(1, 1), addWind(new THREE.MeshStandardMaterial({ roughness: 0.85, flatShading: true }), { strength: 0.045, base: -1, speed: 1.1, lift: 0.6 }), trees.length * 4);
  trunkMesh.castShadow = true;
  leafMesh.castShadow = roundMesh.castShadow = true;
  leafMesh.receiveShadow = roundMesh.receiveShadow = true;
  const m = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  const color = new THREE.Color();
  let cones = 0;
  let blobs = 0;
  trees.forEach(([x, z, s, k, collide], i) => {
    m.compose(new THREE.Vector3(x, 0.8 * s, z), q.identity(), new THREE.Vector3(s, s, s));
    trunkMesh.setMatrixAt(i, m);
    if (k === 'green' && rand() < 0.55) {
      // Loofboom: een paar bollen bladeren bovenop de stam
      const tint = roundColors[Math.floor(rand() * roundColors.length)];
      for (let j = 0; j < 4; j++) {
        const a = rand() * Math.PI * 2;
        const off = j === 0 ? 0 : 0.55 * s;
        const r = (j === 0 ? 1.25 : 0.85 + rand() * 0.25) * s;
        q.setFromEuler(new THREE.Euler(rand() * 3, rand() * 3, rand() * 3));
        m.compose(new THREE.Vector3(x + Math.sin(a) * off, (j === 0 ? 2.5 : 2.0 + rand() * 0.9) * s, z + Math.cos(a) * off), q, new THREE.Vector3(r, r * 0.9, r));
        roundMesh.setMatrixAt(blobs, m);
        roundMesh.setColorAt(blobs++, color.set(tint).offsetHSL((rand() - 0.5) * 0.03, 0, (rand() - 0.5) * 0.08));
      }
    } else {
      const palette = leafColors[k];
      for (let j = 0; j < 3; j++) {
        const layer = 1 - j * 0.25;
        q.setFromAxisAngle(new THREE.Vector3(0, 1, 0), rand() * Math.PI);
        m.compose(new THREE.Vector3(x, (1.8 + j * 0.85) * s, z), q, new THREE.Vector3(s * layer, s, s * layer));
        leafMesh.setMatrixAt(cones, m);
        leafMesh.setColorAt(cones++, color.set(palette[Math.floor(rand() * palette.length)]));
      }
    }
    if (collide) {
      const r = 0.32 * s;
      colliders.push(new THREE.Box3(new THREE.Vector3(x - r, 0, z - r), new THREE.Vector3(x + r, 4 * s, z + r)));
    }
  });
  leafMesh.count = cones;
  roundMesh.count = blobs;
  scene.add(trunkMesh, leafMesh, roundMesh);

  // Rotsblokken (in het hoogland veel, elders een paar) en een rotsrand langs de kant van het level
  const rockMat = new THREE.MeshStandardMaterial({ color: 0x8f8a80, roughness: 0.95, flatShading: true });
  const boulders = [];
  const boulderCount = LEVEL.theme === 'hoogland' ? 40 : 10;
  for (let tries = 0; boulders.length < boulderCount && tries < 2000; tries++) {
    const x = (rand() * 2 - 1) * WALKABLE.x;
    const z = (rand() * 2 - 1) * WALKABLE.z;
    if (!isFree(x, z, 1)) continue;
    boulders.push([x, z, 1 + rand() * 1.6, true]);
  }
  for (let a = -BOUNDS.z; a <= BOUNDS.z; a += 4.5) for (const sx of [-1, 1]) boulders.push([sx * (BOUNDS.x + 1.5), a, 1.6 + rand() * 1.4, false]);
  for (let a = -BOUNDS.x; a <= BOUNDS.x; a += 4.5) for (const sz of [-1, 1]) boulders.push([a, sz * (BOUNDS.z + 1.5), 1.6 + rand() * 1.4, false]);
  const boulderMesh = new THREE.InstancedMesh(new THREE.DodecahedronGeometry(1, 0), rockMat, boulders.length);
  boulders.forEach(([x, z, s, collide], i) => {
    q.setFromEuler(new THREE.Euler(rand() * 3, rand() * 3, rand() * 3));
    m.compose(new THREE.Vector3(x, s * 0.45, z), q, new THREE.Vector3(s, s * 0.8, s));
    boulderMesh.setMatrixAt(i, m);
    if (collide) {
      const r = s * 0.75;
      colliders.push(new THREE.Box3(new THREE.Vector3(x - r, 0, z - r), new THREE.Vector3(x + r, s * 1.1, z + r)));
    }
  });
  boulderMesh.castShadow = true;
  boulderMesh.receiveShadow = true;
  scene.add(boulderMesh);

  // Bloemetjes (weide) of paddenstoelen (woud)
  if (LEVEL.theme === 'weide') {
    const flowerColors = [0xff6b9d, 0xffe066, 0xffffff, 0x9d7bff, 0xff8c42].map((cc) => new THREE.Color(cc));
    const flowers = new THREE.InstancedMesh(new THREE.IcosahedronGeometry(0.06, 0), new THREE.MeshStandardMaterial({ roughness: 0.6 }), 700);
    for (let n = 0; n < 700; n++) {
      m.makeTranslation((rand() * 2 - 1) * WALKABLE.x, 0.06, (rand() * 2 - 1) * WALKABLE.z);
      flowers.setMatrixAt(n, m);
      flowers.setColorAt(n, flowerColors[Math.floor(rand() * flowerColors.length)]);
    }
    scene.add(flowers);
  } else if (LEVEL.theme === 'woud') {
    const caps = new THREE.InstancedMesh(new THREE.SphereGeometry(0.2, 10, 6, 0, Math.PI * 2, 0, Math.PI / 2), new THREE.MeshStandardMaterial({ color: 0xd93b3b, roughness: 0.5, emissive: 0x330000 }), 140);
    const stems = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.06, 0.08, 0.25, 6), new THREE.MeshStandardMaterial({ color: 0xf2e8d5 }), 140);
    let n = 0;
    for (let tries = 0; n < 140 && tries < 3000; tries++) {
      const x = (rand() * 2 - 1) * WALKABLE.x;
      const z = (rand() * 2 - 1) * WALKABLE.z;
      if (!isFree(x, z)) continue;
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
}

/** Boss-arena: stenen vloer en een kring van (gebroken) pilaren. */
function createArena(scene, colliders, arena) {
  const mat = texMat('wall_brick_stone_center');
  const count = 12;
  for (let i = 0; i < count; i++) {
    const a = (i / count) * Math.PI * 2;
    const x = arena.center.x + Math.sin(a) * (arena.radius + 1.5);
    const z = arena.center.z + Math.cos(a) * (arena.radius + 1.5);
    if (Math.cos(a) > 0.95) continue; // opening aan de kant van het pad
    const h = i % 3 === 0 ? 2 : 5 + (i % 2) * 1.5; // sommige zijn afgebroken
    const pillar = texturedBox(1.4, h, 1.4, mat, 1.4);
    pillar.position.set(x, h / 2, z);
    scene.add(pillar);
    colliders.push(new THREE.Box3().setFromObject(pillar));
  }
}

export function createWorld(scene) {
  const sky = createSky(scene);
  const fogNear = LEVEL.theme === 'woud' ? 25 : 50;
  scene.fog = new THREE.Fog(0xcdeaff, fogNear, fogNear + 90);

  const hemi = new THREE.HemisphereLight(0xffffff, 0x556b2f, 0.9);
  scene.add(hemi);
  const sun = new THREE.DirectionalLight(0xffffff, 1.6);
  const stars = createStars(scene);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  sun.shadow.bias = -0.0005;
  sun.shadow.normalBias = 0.03;
  Object.assign(sun.shadow.camera, { left: -40, right: 40, top: 40, bottom: -40, near: 1, far: 120 });
  scene.add(sun, sun.target);

  createGround(scene);

  const colliders = [];
  for (const [x, y, z, w, h, d] of LEVEL.blocks ?? []) {
    // Dunne zwevende platforms van hout, de rest van steen
    const material = h <= 0.5 ? texMat('floor_wood_planks') : texMat(h >= 3 ? 'wall_stone' : 'wall_brick_stone_center');
    const block = texturedBox(w, h, d, material, 2);
    block.position.set(x, y, z);
    scene.add(block);
    colliders.push(new THREE.Box3().setFromObject(block));
  }

  createNature(scene, colliders);
  (LEVEL.houses ?? []).forEach((house, i) => createHouse(scene, colliders, house, i));
  if (VILLAGE_CENTER) createWell(scene, colliders);
  createLanterns(scene, colliders);
  for (const arena of ARENAS) createArena(scene, colliders, arena);

  return {
    colliders,
    bounds: WALKABLE,
    /** Staat dit punt binnen in een huis? (dan komt de camera dichterbij) */
    insideHouse(pos) {
      return houseRoofs.some((h) => h.inner.containsPoint(pos));
    },
    /** Hoe laat is het? 0 = middernacht, 0.25 = ochtend, 0.5 = middag, 0.75 = avond. */
    timeOfDay: 0.3,
    /** Laat de zon (en zijn schaduw) met de speler meelopen, en laat de dag verstrijken. */
    updateSun(playerPos, dt = 0) {
      this.timeOfDay = (this.timeOfDay + dt / DAY_LENGTH) % 1;
      WIND.value += dt;
      const look = dayLook(this.timeOfDay);
      // Zon (overdag) of maan (nacht) draait over de hemel
      const angle = (this.timeOfDay - 0.25) * Math.PI * 2;
      const dir = new THREE.Vector3(Math.cos(angle) * 0.8, Math.sin(angle), 0.45);
      const isMoon = dir.y < 0.15;
      if (isMoon) dir.set(-dir.x, Math.max(0.35, -dir.y), dir.z); // 's nachts schijnt de maan van de andere kant
      sky.material.uniforms.sunDir.value.copy(dir).normalize();
      sky.material.uniforms.sunColor.value.copy(isMoon ? new THREE.Color(0xdfe8ff) : look.sun);
      sky.material.uniforms.sunSize.value = isMoon ? 0.25 : 1;
      sun.target.position.copy(playerPos);
      sun.position.copy(playerPos).addScaledVector(dir.normalize(), 55);
      sun.color.copy(look.sun);
      sun.intensity = look.sunPower;
      hemi.intensity = look.ambient;
      hemi.color.copy(look.skyLight);
      sky.material.uniforms.top.value.copy(look.top);
      sky.material.uniforms.horizon.value.copy(look.horizon);
      scene.fog.color.copy(look.horizon);
      stars.material.opacity = look.stars;
      this.night = look.stars; // 0 = dag, 1 = nacht
      stars.position.copy(playerPos);
      sky.position.copy(playerPos); // de lucht reist mee, anders valt hij buiten beeld (zwart gat!)
      for (const m of glowingWindows) m.emissiveIntensity = 0.4 + look.stars * 1.6; // ramen gloeien 's nachts
      for (const m of glowingLamps) m.emissiveIntensity = 0.3 + look.stars * 2.5;
      for (const f of glowingFires) f.scale.y = 0.8 + Math.random() * 0.4; // flakkerend haardvuur
      // Dak weg als je in een huis staat, zodat je naar binnen kunt kijken
      for (const h of houseRoofs) h.roof.visible = !h.inner.containsPoint(playerPos);
    },
  };
}
