import * as THREE from 'three';
import { LEVEL, REGIONS, REGION_WIDTH, regionIndexAt, GATE_X } from './levels.js';
import { createCastleWorld } from './castle.js';

// De open wereld: grond, paden, huizen (waar je in kunt!), ruïnes, natuur,
// de boss-arena's, de checkpoints en de kisten. Wat er in elk gebied staat, staat in levels.js.

export const BOUNDS = LEVEL.half; // de wereld loopt van -BOUNDS.x tot BOUNDS.x (en z)
export const WALKABLE = { x: BOUNDS.x - 1.5, z: BOUNDS.z - 1.5 }; // verder kun je niet lopen

const v3 = (x, z, y = 0) => new THREE.Vector3(x, y, z);

// Checkpoints: per gebied één aan het begin en een vlag halverwege
export const CHECKPOINTS = LEVEL.checkpoints.map(([id, name, x, z, y = 0]) => ({ id, name, position: v3(x, z, y) }));

// De boss-arena's: aan het eind van het pad van elk gebied één. `open` = aan welke kant de ingang is (+z of -z).
// In Omars kasteel staat er één arena midden op de binnenplaats.
export const ARENAS = LEVEL.arenas
  ? LEVEL.arenas.map((a) => ({ id: a.id, center: v3(a.x, a.z), radius: a.radius, open: a.open, region: a.region }))
  : [{ id: LEVEL.boss, center: v3(LEVEL.arena.x, LEVEL.arena.z), radius: LEVEL.arena.radius, open: 1 }];

export const CHESTS = LEVEL.chests.map(([id, x, y, z, item]) => ({ id, position: v3(x, z, y), item }));

export const VILLAGE_CENTER = LEVEL.village ? v3(LEVEL.village.center[0], LEVEL.village.center[1]) : null;
// De Arena (een rond colosseum naast Muntdorp, zie arena.js): daar komen geen bomen, stenen of gras
export const COLOSSEUM = LEVEL.colosseum ? { center: v3(LEVEL.colosseum.center[0], LEVEL.colosseum.center[1]), radius: LEVEL.colosseum.radius } : null;

// Alle paden (en de verbindingspaden tussen de gebieden) als losse lijnstukken
const PATHS = (LEVEL.paths ?? [LEVEL.path]).flatMap((path) => path.slice(1).map((p, i) => [path[i], p]));

/** In welk gebied ligt dit punt? (het hele gebied-object uit levels.js, of null in Omars kasteel) */
export function regionInfoAt(x, z) {
  return LEVEL.regions ? REGIONS[regionIndexAt(x, z)] : null;
}

/** Welk soort land is het hier? 'weide', 'woud' of 'hoogland' (in het kasteel: 'kasteel'). */
export function regionAt(x, z) {
  return regionInfoAt(x, z)?.theme ?? LEVEL.theme;
}

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

// ---------- Mist die bij de grond dikker is ----------
// Verre dingen laag bij de grond verdwijnen in de nevel, boomtoppen niet zo snel. Dat geeft diepte.
// (Dit verandert het mist-stukje van álle materialen, dus het moet gebeuren voordat er iets getekend wordt.)
const FOG_LOW = LEVEL.theme === 'woud' ? 0.07 : 0.1; // hoeveel extra nevel er vlak boven de grond hangt
THREE.ShaderChunk.fog_pars_vertex = '#ifdef USE_FOG\n\tvarying float vFogDepth;\n\tvarying float vFogHeight;\n#endif';
THREE.ShaderChunk.fog_vertex = '#ifdef USE_FOG\n\tvFogDepth = - mvPosition.z;\n\tvFogHeight = ( transpose( mat3( viewMatrix ) ) * ( mvPosition.xyz - viewMatrix[ 3 ].xyz ) ).y;\n#endif';
THREE.ShaderChunk.fog_pars_fragment += '\n#ifdef USE_FOG\n\tvarying float vFogHeight;\n#endif';
THREE.ShaderChunk.fog_fragment = `#ifdef USE_FOG
  #ifdef FOG_EXP2
    float fogFactor = 1.0 - exp( - fogDensity * fogDensity * vFogDepth * vFogDepth );
  #else
    float fogFactor = smoothstep( fogNear, fogFar, vFogDepth );
    float fogLow = exp( - max( vFogHeight, 0.0 ) * 0.12 ); // 1 op de grond, 0 hoog in de lucht
    fogFactor = clamp( fogFactor * ( 0.7 + 0.5 * fogLow ) + fogLow * ${FOG_LOW.toFixed(3)} * smoothstep( 8.0, 45.0, vFogDepth ), 0.0, 1.0 );
  #endif
  gl_FragColor.rgb = mix( gl_FragColor.rgb, fogColor, fogFactor );
#endif`;

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

/**
 * Mooiere bladeren: onderaan donker en bovenaan licht en warm (zon), een zachte gloed aan de rand,
 * en als je tegen de zon in kijkt schijnt het licht door de bladeren heen. Werkt samen met addWind.
 */
export function addLeafShading(material) {
  const before = material.onBeforeCompile;
  material.onBeforeCompile = (shader, renderer) => {
    before?.call(material, shader, renderer);
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nvarying float vLeafH;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvLeafH = normalize(position + vec3(0.0, 0.001, 0.0)).y;');
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', '#include <common>\nvarying float vLeafH;')
      .replace(
        '#include <color_fragment>',
        `#include <color_fragment>
        diffuseColor.rgb *= mix(0.55, 1.18, smoothstep(-0.9, 0.9, vLeafH));
        diffuseColor.rgb = mix(diffuseColor.rgb, diffuseColor.rgb * vec3(1.05, 1.12, 0.85), smoothstep(0.2, 1.0, vLeafH) * 0.5);`
      )
      .replace(
        '#include <emissivemap_fragment>',
        `#include <emissivemap_fragment>
        totalEmissiveRadiance += diffuseColor.rgb * pow(1.0 - saturate(dot(normal, normalize(vViewPosition))), 3.0) * 0.12;`
      )
      .replace(
        '#include <lights_fragment_end>',
        `#include <lights_fragment_end>
        #if NUM_DIR_LIGHTS > 0
          float leafBack = pow(saturate(dot(normalize(-vViewPosition), directionalLights[0].direction)), 4.0);
          reflectedLight.directDiffuse += diffuseColor.rgb * directionalLights[0].color * leafBack * 0.35;
        #endif`
      );
  };
  const key = material.customProgramCacheKey?.bind(material);
  material.customProgramCacheKey = () => (key ? key() : '') + '-leaf';
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

// Vijvers: [x, z, straal]. Ze worden pas gemaakt als de bomen en stenen er al staan (zie createPonds).
export const PONDS = [];

/** Is hier ruimte voor een boom of steen? (niet op het pad, in de arena, bij checkpoints, kisten, huizen, in vijvers...) */
export function isFree(x, z, margin = 0) {
  if (Math.abs(x) > WALKABLE.x - 1 || Math.abs(z) > WALKABLE.z - 1) return false;
  for (const [px, pz, pr] of PONDS) if (Math.hypot(x - px, z - pz) < pr + 1 + margin) return false;
  if (distToPath(x, z) < 4 + margin) return false;
  if (VILLAGE_CENTER && Math.hypot(x - VILLAGE_CENTER.x, z - VILLAGE_CENTER.z) < 18) return false;
  if (COLOSSEUM && Math.hypot(x - COLOSSEUM.center.x, z - COLOSSEUM.center.z) < COLOSSEUM.radius + 7) return false;
  if (inHouse(x, z, margin)) return false;
  for (const a of ARENAS) if (Math.hypot(x - a.center.x, z - a.center.z) < a.radius + 5) return false;
  for (const c of CHECKPOINTS) if (Math.hypot(x - c.position.x, z - c.position.z) < 8) return false;
  for (const c of CHESTS) if (Math.hypot(x - c.position.x, z - c.position.z) < 4) return false;
  for (const [nx, nz] of (LEVEL.npcs ?? []).map((n) => [n[1], n[2]])) if (Math.hypot(x - nx, z - nz) < 4) return false;
  for (const spots of Object.values(LEVEL.questItems ?? {})) for (const [qx, qz] of spots) if (Math.hypot(x - qx, z - qz) < 3) return false;
  for (const b of LEVEL.blocks ?? []) if (Math.abs(x - b[0]) < b[3] / 2 + 2 && Math.abs(z - b[2]) < b[5] / 2 + 2) return false;
  return true;
}

/**
 * Waar mag dicht gras groeien? Een plaatje over het hele level (2 pixels per meter): wit = gras, zwart = geen gras.
 * Geen gras op het pad, het dorpsplein, in de boss-arena, in huizen, onder blokken en bij vlaggen en kisten.
 * Gebruikt door grass.js.
 */
export function grassMask() {
  const RES = 2; // pixels per meter
  const margin = 10;
  const min = [-BOUNDS.x - margin, -BOUNDS.z - margin];
  const size = [(BOUNDS.x + margin) * 2, (BOUNDS.z + margin) * 2];
  const w = Math.ceil(size[0] * RES);
  const h = Math.ceil(size[1] * RES);
  const data = new Uint8Array(w * h);
  for (let j = 0; j < h; j++) {
    for (let i = 0; i < w; i++) {
      const x = min[0] + (i + 0.5) / RES;
      const z = min[1] + (j + 0.5) / RES;
      let k = THREE.MathUtils.smoothstep(distToPath(x, z), 2.4, 3.4); // het pad
      if (VILLAGE_CENTER && Math.hypot(x - VILLAGE_CENTER.x, z - VILLAGE_CENTER.z) < 8) k = 0;
      if (COLOSSEUM && Math.hypot(x - COLOSSEUM.center.x, z - COLOSSEUM.center.z) < COLOSSEUM.radius + 2.5) k = 0;
      for (const a of ARENAS) k *= THREE.MathUtils.smoothstep(Math.hypot(x - a.center.x, z - a.center.z), a.radius + 1, a.radius + 2.5);
      if (inHouse(x, z, -1.4)) k = 0;
      for (const b of LEVEL.blocks ?? []) if (b[1] - b[4] / 2 < 0.3 && Math.abs(x - b[0]) < b[3] / 2 + 0.2 && Math.abs(z - b[2]) < b[5] / 2 + 0.2) k = 0;
      for (const c of CHECKPOINTS) if (Math.hypot(x - c.position.x - 1.4, z - c.position.z) < 1.2) k = 0;
      for (const c of CHESTS) if (Math.hypot(x - c.position.x, z - c.position.z) < 1.1) k = 0;
      for (const [px, pz, pr] of PONDS) k *= THREE.MathUtils.smoothstep(Math.hypot(x - px, z - pz), pr * 0.95, pr + 0.4); // niet in het water
      data[j * w + i] = Math.round(k * 255);
    }
  }
  const texture = new THREE.DataTexture(data, w, h, THREE.RedFormat, THREE.UnsignedByteType);
  texture.magFilter = texture.minFilter = THREE.LinearFilter;
  texture.needsUpdate = true;
  return { texture, min, size };
}

// ---------- Dag en nacht ----------
const DAY_LENGTH = 360; // een hele dag duurt 6 minuten
// Licht uit de lucht (Normaal/Hoog): hoe sterk overdag en 's nachts, en hoeveel de hemisfeer dan nog meedoet
// (te veranderen vanuit de browser-console: game.world.lightTuning)
const LIGHT_TUNING = {
  envDay: 0.7, envNight: 1.2, // licht uit de lucht
  envHemi: 0.6, // hoeveel de hemisfeer dan nog meedoet
  lantern: 5, // hoe fel een lantaarn 's nachts de grond verlicht
};
const GROUND_ENV = new THREE.Color(0.3, 0.3, 0.14); // kleur van de grond in het "fotootje" van de lucht
const MOON_COLOR = new THREE.Color(0xdfe8ff);
const glowingWindows = [];
const glowingLamps = [];
const glowingFires = [];

// Kleuren op bepaalde momenten van de dag; daartussen vloeien ze in elkaar over.
// fog = kleur van de mist, ground = licht dat van de grond terugkaatst,
// exposure = hoe gevoelig de "camera" is ('s nachts hoger, net als je ogen die aan het donker wennen).
// 's Nachts is het donkerblauw (maanlicht), niet pikzwart: je moet de weg en de vijanden nog kunnen zien.
const NIGHT = { top: 0x0d1a48, horizon: 0x2a3f78, fog: 0x22335f, sun: 0xa9b4ff, sunPower: 1.15, ambient: 1.25, skyLight: 0x8590d8, ground: 0x2a3548, exposure: 1.4, stars: 1 };
const DAY = { top: 0x2f6fd6, horizon: 0xb4dcf7, fog: 0xb4dcf7, sun: 0xffffff, sunPower: 1.6, ambient: 0.9, skyLight: 0xffffff, ground: 0x556b2f, exposure: 1.15, stars: 0 };
export const DAY_KEYS = [
  { t: 0.0, ...NIGHT }, // nacht
  { t: 0.22, top: 0x2a3f80, horizon: 0xf2a37a, fog: 0xb98f88, sun: 0xffb27a, sunPower: 1.35, ambient: 1.35, skyLight: 0xffc9a0, ground: 0x5a4a3c, exposure: 1.3, stars: 0.3 }, // zonsopgang
  { t: 0.3, ...DAY }, // ochtend
  { t: 0.7, ...DAY }, // middag
  { t: 0.78, top: 0x4a3a7a, horizon: 0xff9a5c, fog: 0xb88470, sun: 0xffa66a, sunPower: 1.7, ambient: 1.4, skyLight: 0xf0c0a8, ground: 0x5a4a3c, exposure: 1.3, stars: 0.2 }, // zonsondergang
  { t: 0.86, ...NIGHT }, // nacht
  { t: 1.0, ...NIGHT },
];

const COLOR_KEYS = ['top', 'horizon', 'fog', 'sun', 'skyLight', 'ground'];
const NUMBER_KEYS = ['sunPower', 'ambient', 'exposure', 'stars'];

/** Hoe de wereld eruitziet op tijdstip t (0..1): kleuren en lichtsterktes. */
function dayLook(t) {
  let i = 1;
  while (i < DAY_KEYS.length - 1 && DAY_KEYS[i].t < t) i++;
  const a = DAY_KEYS[i - 1];
  const b = DAY_KEYS[i];
  const k = THREE.MathUtils.smoothstep(t, a.t, b.t);
  const look = {};
  for (const key of COLOR_KEYS) look[key] = new THREE.Color(a[key]).lerp(new THREE.Color(b[key]), k);
  for (const key of NUMBER_KEYS) look[key] = a[key] + (b[key] - a[key]) * k;
  return look;
}

/** Een zacht rond lichtvlekje (wit in het midden, doorzichtig aan de rand), voor gloed rond lampen. */
function glowTexture() {
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = 64;
  const ctx = canvas.getContext('2d');
  const g = ctx.createRadialGradient(32, 32, 0, 32, 32, 32);
  g.addColorStop(0, 'rgba(255,255,255,1)');
  g.addColorStop(0.25, 'rgba(255,255,255,0.45)');
  g.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 64, 64);
  return new THREE.CanvasTexture(canvas);
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

/**
 * De kleuren van de lucht (top, horizon, sunDir, sunColor, sunSize). Andere dingen aan de hemel
 * (wolken, bergen in de verte) kunnen deze gebruiken, dan kleuren ze vanzelf mee met de dag en nacht.
 */
export let SKY_UNIFORMS = null;

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
          // De zon is heel fel (meer dan wit), dan krijgt hij een zachte gloed eromheen; de maan is rustiger
          col += sunColor * (smoothstep(0.9993 - 0.0004 * (1.0 - sunSize), 0.9997, s) * 6.0 * sunSize + smoothstep(0.9988, 0.9995, s) * (1.0 - sunSize) * 1.2);
          col += sunColor * (pow(s, 24.0) * 0.35 + pow(s, 4.0) * 0.12) * sunSize;
          col += sunColor * pow(s, 3.0) * 0.18 * (1.0 - h) * sunSize; // warme waas laag bij de horizon, aan de kant van de zon
          col = mix(col, horizon * 1.05, (1.0 - smoothstep(0.0, 0.12, dir.y)) * 0.6); // nevel bij de horizon
          #ifdef ENV_SKY
            // Voor het licht uit de lucht: minder blauw en wat warmer, anders wordt alles blauwgroen
            col = mix(col, vec3(dot(col, vec3(0.2126, 0.7152, 0.0722))) * vec3(1.1, 1.0, 0.82), 0.6);
          #endif
          gl_FragColor = vec4(col, 1.0);
        #include <colorspace_fragment>
        }`,
    })
  );
  sky.renderOrder = -2; // de lucht eerst tekenen: alles (ook bergen in de verte) komt eroverheen
  sky.frustumCulled = false;
  SKY_UNIFORMS = sky.material.uniforms;
  scene.add(sky);
  return sky;
}

/**
 * Bergen in de verte: twee ringen van bergsilhouetten rond de wereld (alleen voor de sier, je kunt er niet komen).
 * Ze lopen mee met de speler (net als de lucht) en krijgen de kleur van de horizon: hoe verder weg, hoe blauwer.
 * In het hoogland zijn ze hoger en hebben ze sneeuw op de toppen.
 */
function createMountains(scene, skyUniforms) {
  const group = new THREE.Group();
  const light = { value: 1 };
  const rand = seededRandom(1234 + LEVEL.subtitle.length * 7);
  const high = LEVEL.theme === 'hoogland';
  const woud = LEVEL.theme === 'woud';
  const rings = [
    // straal, stukjes, laagste en hoogste top, kleur, hoeveel nevel ervoor hangt
    { r: 178, n: 160, hMin: high ? 30 : 18, hMax: high ? 72 : 46, color: high ? 0x8a8478 : 0x6f86a8, haze: high ? 0.42 : 0.6, snow: high },
    { r: 152, n: 140, hMin: high ? 14 : 7, hMax: high ? 36 : 22, color: high ? 0x6b6458 : woud ? 0x2f4a3a : 0x4f6e58, haze: high ? 0.28 : 0.4, snow: false },
  ];
  for (const ring of rings) {
    // Grilige toppen: een paar golven van verschillende grootte bij elkaar opgeteld
    const waves = Array.from({ length: 12 }, (_, i) => ({ f: 1 + i * 1.7 + rand() * 2, ph: rand() * Math.PI * 2, amp: 1 / (1 + i * 0.45) }));
    const pos = [];
    const idx = [];
    for (let i = 0; i <= ring.n; i++) {
      const a = (i / ring.n) * Math.PI * 2;
      let w = 0;
      for (const wave of waves) w += Math.sin(a * wave.f + wave.ph) * wave.amp;
      const h = ring.hMin + (ring.hMax - ring.hMin) * THREE.MathUtils.clamp(0.5 + w / 5, 0, 1);
      pos.push(Math.sin(a) * ring.r, -10, Math.cos(a) * ring.r, Math.sin(a) * ring.r, h, Math.cos(a) * ring.r);
      if (i < ring.n) {
        const k = i * 2;
        idx.push(k, k + 2, k + 1, k + 1, k + 2, k + 3);
      }
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    geo.setIndex(idx);
    const mat = new THREE.ShaderMaterial({
      side: THREE.DoubleSide,
      depthWrite: false,
      fog: false,
      defines: ring.snow ? { SNOW: '' } : {},
      uniforms: { color: { value: new THREE.Color(ring.color) }, haze: { value: ring.haze }, light, horizon: skyUniforms.horizon, top: skyUniforms.top },
      vertexShader: `varying float vH; void main() { vH = position.y; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
      fragmentShader: `uniform vec3 color; uniform float haze; uniform float light; uniform vec3 horizon; uniform vec3 top; varying float vH;
        void main() {
          vec3 c = color * light;
          #ifdef SNOW
            c = mix(c, vec3(0.92, 0.94, 0.98) * light, smoothstep(48.0, 54.0, vH) * 0.85); // sneeuw op de toppen
          #endif
          float k = haze + (1.0 - smoothstep(0.0, 40.0, vH)) * (1.0 - haze) * 0.55; // de voet van de berg verdwijnt in de nevel
          c = mix(c, horizon, clamp(k, 0.0, 1.0));
          gl_FragColor = vec4(c, 1.0);
          #include <colorspace_fragment>
        }`,
    });
    const mesh = new THREE.Mesh(geo, mat);
    mesh.renderOrder = -1; // na de lucht, voor al het andere (de lucht schrijft geen diepte)
    mesh.frustumCulled = false;
    mesh.userData.noAO = true;
    group.add(mesh);
  }
  scene.add(group);
  return { group, light };
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
  // Kleur en textuur-mengsel van elk gebied (wat warmer: geen blauwgroen gras)
  const BASE = { weide: [1.76, 1.63, 1.05], woud: [0.88, 0.99, 0.64], hoogland: [1.18, 1.06, 0.78], schaduw: [0.95, 0.62, 1.25] };
  const looks = REGIONS.map((r) => ({
    tint: BASE[r.theme].map((v, i) => v * (r.tint?.[i] ?? 1)),
    // gewicht per textuur: [gras, aarde, rots, stenen vloer]
    wgt: r.theme === 'hoogland' ? [0.35, 0, 0.65, 0] : r.theme === 'schaduw' ? [0.55, 0.15, 0.3, 0] : [1, 0, 0, 0],
  }));
  // Bij de grens tussen twee gebieden lopen de kleuren zacht in elkaar over (we middelen een paar punten links en rechts)
  const SAMPLES = [-9, -4.5, 0, 4.5, 9];
  const c = new THREE.Color();
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i);
    const z = pos.getZ(i);
    const mix = [0, 0, 0];
    let wgt = [0, 0, 0, 0];
    for (const dx of SAMPLES) {
      const look = looks[regionIndexAt(x + dx, z)];
      look.tint.forEach((v, j) => (mix[j] += v / SAMPLES.length));
      wgt = wgt.map((v, j) => v + look.wgt[j] / SAMPLES.length);
    }
    c.setRGB(...mix).offsetHSL(0, 0, (rand() - 0.5) * 0.06);
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
  return geo;
}

/**
 * Zachte donkere randjes op de grond rond bomen, rotsen, muren en blokken ("ambient occlusion"):
 * vlak naast iets groots komt minder licht uit de lucht. Dan "staan" dingen echt op de grond.
 * We rekenen het één keer uit bij het laden en kleuren de grond daar iets donkerder: tijdens het spelen kost het niks.
 */
function bakeGroundAO(geo, colliders) {
  const { width, height: depth, widthSegments: segW, heightSegments: segD } = geo.parameters;
  const pos = geo.attributes.position;
  const color = geo.attributes.color;
  const shade = new Float32Array(color.count).fill(1);
  const toIx = (x) => Math.round(((x + width / 2) / width) * segW);
  const toIz = (z) => Math.round(((z + depth / 2) / depth) * segD);
  for (const box of colliders) {
    if (box.min.y > 0.3) continue; // zweeft boven de grond (een platform): geen randje
    const sizeX = box.max.x - box.min.x;
    const sizeZ = box.max.z - box.min.z;
    if (Math.max(sizeX, sizeZ) < 0.4) continue; // heel dun (een lantaarnpaal): te klein om te zien
    const reach = THREE.MathUtils.clamp(0.4 + (box.max.y - box.min.y) * 0.3, 0.8, 2.2); // hoe ver het donker over de grond loopt (meter)
    const strength = 0.32 * THREE.MathUtils.clamp(Math.min(sizeX, sizeZ) / 0.6, 0.6, 1); // dunne muren iets minder
    const ix0 = Math.max(0, toIx(box.min.x - reach) - 1);
    const ix1 = Math.min(segW, toIx(box.max.x + reach) + 1);
    const iz0 = Math.max(0, toIz(box.min.z - reach) - 1);
    const iz1 = Math.min(segD, toIz(box.max.z + reach) + 1);
    for (let iz = iz0; iz <= iz1; iz++) {
      for (let ix = ix0; ix <= ix1; ix++) {
        const i = iz * (segW + 1) + ix;
        const x = pos.getX(i);
        const z = pos.getZ(i);
        const d = Math.hypot(Math.max(box.min.x - x, 0, x - box.max.x), Math.max(box.min.z - z, 0, z - box.max.z));
        if (d < reach) shade[i] *= 1 - strength * Math.pow(1 - d / reach, 1.5);
      }
    }
  }
  for (let i = 0; i < color.count; i++) {
    const k = Math.max(0.6, shade[i]);
    color.setXYZ(i, color.getX(i) * k, color.getY(i) * k, color.getZ(i) * k);
  }
  color.needsUpdate = true;
}

/**
 * Een paar vijvers op open plekken (waar geen boom, steen, pad of huis is). Plat water dat de lucht weerspiegelt
 * en een beetje kabbelt, met een donkere modderrand. Je kunt er gewoon doorheen lopen (het is ondiep).
 * Geeft het water-materiaal terug (de golfjes bewegen in updateSun).
 */
function createPonds(scene, colliders, groundGeo) {
  const rand = seededRandom(4242);
  // In elk gebied een paar vijvers (in het hoogland maar één)
  for (const region of REGIONS) {
    const wanted = region.theme === 'hoogland' ? 1 : 2;
    let found = 0;
    for (let tries = 0; found < wanted && tries < 600; tries++) {
      const r = 3 + rand() * 2;
      const x = region.ox + (rand() * 2 - 1) * (REGION_WIDTH / 2 - r - 6);
      const z = (rand() * 2 - 1) * (WALKABLE.z - r - 10);
      if (!isFree(x, z, r + 2)) continue;
      const clear = colliders.every((b) => b.distanceToPoint(new THREE.Vector3(x, Math.min(Math.max(0, b.min.y), b.max.y), z)) > r + 1.5);
      if (!clear || PONDS.some(([px, pz, pr]) => Math.hypot(x - px, z - pz) < pr + r + 15)) continue;
      PONDS.push([x, z, r]);
      found++;
    }
  }
  // Golfjes: een klein "normal map"-plaatje met zachte ruis (getekend in code)
  const N = 128;
  const height = new Float32Array(N * N);
  for (let j = 0; j < N; j++) {
    for (let i = 0; i < N; i++) {
      let hgt = 0;
      for (let k = 1; k <= 4; k++) hgt += Math.sin(((i * k * 3) / N) * Math.PI * 2 + k * 1.7) * Math.cos(((j * (5 - k) * 2) / N) * Math.PI * 2 + k) / k;
      height[j * N + i] = hgt;
    }
  }
  const nd = new Uint8Array(N * N * 4);
  for (let j = 0; j < N; j++) {
    for (let i = 0; i < N; i++) {
      const dx = height[j * N + ((i + 1) % N)] - height[j * N + ((i + N - 1) % N)];
      const dz = height[((j + 1) % N) * N + i] - height[((j + N - 1) % N) * N + i];
      const v = new THREE.Vector3(-dx, -dz, 2).normalize();
      nd.set([(v.x * 0.5 + 0.5) * 255, (v.y * 0.5 + 0.5) * 255, (v.z * 0.5 + 0.5) * 255, 255], (j * N + i) * 4);
    }
  }
  const normalMap = new THREE.DataTexture(nd, N, N);
  normalMap.wrapS = normalMap.wrapT = THREE.RepeatWrapping;
  normalMap.magFilter = THREE.LinearFilter;
  normalMap.minFilter = THREE.LinearMipmapLinearFilter;
  normalMap.generateMipmaps = true;
  normalMap.repeat.set(3, 3);
  normalMap.needsUpdate = true;
  const water = new THREE.MeshStandardMaterial({
    color: 0x2b6a8a, roughness: 0.06, metalness: 0.1, transparent: true, opacity: 0.88,
    normalMap, normalScale: new THREE.Vector2(0.35, 0.35), polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2,
  });
  const darkWater = water.clone(); // in het Spookwoud is het water donker
  darkWater.color.set(0x1e4a4a);
  const purpleWater = water.clone(); // en in het Schaduwrijk paars
  purpleWater.color.set(0x3a1460);
  for (const [x, z, r] of PONDS) {
    // Een ronde vijver met een hobbelige rand
    const geo = new THREE.CircleGeometry(r, 28);
    const pos = geo.attributes.position;
    for (let i = 1; i < pos.count; i++) {
      const k = 1 + Math.sin(i * 2.3 + x) * 0.07 + Math.sin(i * 0.9 + z) * 0.05;
      pos.setXY(i, pos.getX(i) * k, pos.getY(i) * k);
    }
    geo.rotateX(-Math.PI / 2);
    const theme = regionAt(x, z);
    const mesh = new THREE.Mesh(geo, theme === 'woud' ? darkWater : theme === 'schaduw' ? purpleWater : water);
    mesh.position.set(x, 0.025, z);
    mesh.receiveShadow = true;
    mesh.userData.noAO = true;
    scene.add(mesh);
  }
  // Modderrand: de grond rond de vijver wat donkerder en bruiner
  const gp = groundGeo.attributes.position;
  const gc = groundGeo.attributes.color;
  for (let i = 0; i < gp.count; i++) {
    for (const [x, z, r] of PONDS) {
      const d = Math.hypot(gp.getX(i) - x, gp.getZ(i) - z);
      if (d > r + 1.6) continue;
      const k = 1 - 0.35 * (1 - THREE.MathUtils.smoothstep(d, r - 0.5, r + 1.6));
      gc.setXYZ(i, gc.getX(i) * k, gc.getY(i) * k * 0.95, gc.getZ(i) * k * 0.85);
    }
  }
  gc.needsUpdate = true;
  return water;
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

// Waar de lantaarns staan (voor de plas licht eromheen), en hun gloed-vlekjes
const lanternSpots = [];
let lanternHaloMat = null;

/** Lantaarnpalen langs het pad: 's nachts gloeien ze en geven ze licht op de grond. */
function createLanterns(scene, colliders) {
  const wood = texMat('timber_square_planks');
  const glassMat = new THREE.MeshStandardMaterial({ color: 0xffd27a, emissive: 0xffb347, emissiveIntensity: 1.2, roughness: 0.4 });
  glowingLamps.push(glassMat);
  // Een zacht lichtvlekje rond elke lamp ('s nachts zie je dan van ver waar het pad loopt)
  lanternHaloMat = new THREE.SpriteMaterial({ map: glowTexture(), color: 0xffb347, blending: THREE.AdditiveBlending, depthWrite: false, transparent: true, opacity: 0, fog: false });
  PATHS.forEach(([[ax, az], [bx, bz]], i) => {
    const len = Math.hypot(bx - ax, bz - az);
    for (let s = 6; s < len; s += 16) {
      const k = s / len;
      const nx = -(bz - az) / len;
      const nz = (bx - ax) / len;
      const side = (i + Math.floor(s / 16)) % 2 ? 1 : -1;
      const x = ax + (bx - ax) * k + nx * 3.3 * side;
      const z = az + (bz - az) * k + nz * 3.3 * side;
      if (ARENAS.some((a) => Math.hypot(x - a.center.x, z - a.center.z) < a.radius + 3)) continue;
      if (lanternSpots.some((l) => Math.hypot(x - l.x, z - l.z) < 6)) continue; // waar paden samenkomen niet twee vlak naast elkaar
      const post = texturedBox(0.16, 2.6, 0.16, wood, 1);
      post.position.set(x, 1.3, z);
      const lamp = new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.42, 0.34), glassMat);
      lamp.position.set(x, 2.75, z);
      const cap = texturedBox(0.46, 0.08, 0.46, wood, 1);
      cap.position.set(x, 3.0, z);
      const halo = new THREE.Sprite(lanternHaloMat);
      halo.position.set(x, 2.75, z);
      halo.scale.setScalar(1.8);
      halo.userData.noAO = true;
      scene.add(post, lamp, cap, halo);
      lanternSpots.push(new THREE.Vector3(x, 2.6, z));
      colliders.push(new THREE.Box3(new THREE.Vector3(x - 0.12, 0, z - 0.12), new THREE.Vector3(x + 0.12, 2.6, z + 0.12)));
    }
  });
}

/** Bomen (met InstancedMesh), rotsblokken, een bosrand rondom de wereld, bloemen en paddenstoelen. */
function createNature(scene, colliders) {
  const rand = seededRandom(42);
  const KIND = { weide: 'green', woud: 'dark', hoogland: 'pine', schaduw: 'shadow' }; // welke bomen in welk soort gebied
  const trees = []; // [x, z, size, kind, collide]
  // Een willekeurige plek in een gebied (en echt in dat gebied: de grens golft een beetje)
  const inRegion = (region, edge = 0) => {
    for (;;) {
      const x = region.ox + (rand() * 2 - 1) * (REGION_WIDTH / 2 - edge);
      const z = (rand() * 2 - 1) * (WALKABLE.z - edge);
      if (regionIndexAt(x, z) === region.index) return [x, z];
    }
  };
  for (const region of REGIONS) {
    for (let i = 0, tries = 0; i < region.trees && tries < region.trees * 30; tries++) {
      const [x, z] = inRegion(region);
      if (!isFree(x, z)) continue;
      if (trees.some((t) => Math.hypot(t[0] - x, t[1] - z) < 3.2)) continue;
      trees.push([x, z, (region.theme === 'woud' || region.theme === 'schaduw' ? 1.1 : 0.8) + rand() * 0.6, KIND[region.theme], true]);
      i++;
    }
  }
  // Bosrand buiten de wereld (alleen voor de sier: je kunt er toch niet komen). In het hoogland minder bomen.
  const borderCount = Math.round((BOUNDS.x + BOUNDS.z) * 1.2);
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
    const theme = regionAt(THREE.MathUtils.clamp(x, -BOUNDS.x, BOUNDS.x), z);
    if (theme === 'hoogland' && rand() < 0.7) continue;
    trees.push([x, z, 1 + rand() * 0.8, KIND[theme], false]);
  }

  // Vormen en kleurtjes komen uit een eigen toevalsgenerator, zodat de bomen zelf op dezelfde plek blijven staan
  const look = seededRandom(777);
  // Stam met een bredere voet (wortels)
  const trunkMesh = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.2, 0.34, 1.6, 7), addLeafShading(new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.9 })), trees.length);
  const leafColors = { dark: [0x24502c, 0x2d5e33, 0x1f4527], green: [0x3f9b4a, 0x4fae52, 0x2f8a45], pine: [0x3a6b48, 0x46775a], shadow: [0x3b2450, 0x2e1b40, 0x4a2a5e] };
  const roundColors = [0x5aa845, 0x6fb84a, 0x4c9a3e, 0x86c24f];
  const layersOf = (k) => (k === 'green' ? 3 : 4); // dennen in het bos en het hoogland krijgen 4 lagen
  // Dennenlaag met een gekartelde onderrand (om en om een punt naar buiten en omlaag)
  const coneGeo = new THREE.ConeGeometry(1.3, 1.6, 10);
  const cp = coneGeo.attributes.position;
  for (let i = 0; i < cp.count; i++) {
    if (cp.getY(i) > -0.79) continue;
    const a = Math.atan2(cp.getZ(i), cp.getX(i));
    const k = Math.round((a / (Math.PI * 2)) * 10) % 2 === 0 ? 1.15 : 0.95;
    cp.setXYZ(i, cp.getX(i) * k, cp.getY(i) - (k > 1 ? 0.1 : 0), cp.getZ(i) * k);
  }
  coneGeo.computeVertexNormals();
  // Bobbelige bladerbol: elke hoek een stukje naar binnen of buiten
  const roundGeo = new THREE.IcosahedronGeometry(1, 1);
  const rp = roundGeo.attributes.position;
  const bump = (x, y, z) => 1 + (Math.abs(Math.sin(x * 12.9898 + y * 78.233 + z * 37.719) * 43758.5453) % 1 - 0.5) * 0.26;
  for (let i = 0; i < rp.count; i++) {
    const k = bump(Math.round(rp.getX(i) * 100), Math.round(rp.getY(i) * 100), Math.round(rp.getZ(i) * 100)); // zelfde hoek = zelfde bobbel
    rp.setXYZ(i, rp.getX(i) * k, rp.getY(i) * k, rp.getZ(i) * k);
  }
  roundGeo.computeVertexNormals();
  // Naaldbomen (kegels) en, in de weide, ook ronde loofbomen en slanke populieren; ze wiegen allemaal in de wind
  const leafMesh = new THREE.InstancedMesh(coneGeo, addLeafShading(addWind(new THREE.MeshStandardMaterial({ roughness: 0.8, flatShading: true }), { strength: 0.045, base: -0.8, speed: 1.3, lift: 0.6 })), trees.length * 4);
  const roundMesh = new THREE.InstancedMesh(roundGeo, addLeafShading(addWind(new THREE.MeshStandardMaterial({ roughness: 0.85, flatShading: true }), { strength: 0.045, base: -1, speed: 1.1, lift: 0.6 })), trees.length * 4);
  trunkMesh.castShadow = true;
  leafMesh.castShadow = roundMesh.castShadow = true;
  leafMesh.receiveShadow = roundMesh.receiveShadow = true;
  const m = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  const color = new THREE.Color();
  let cones = 0;
  let blobs = 0;
  const BARK = new THREE.Color(0x6b4226);
  const BIRCH = new THREE.Color(0xd9d4c7);
  trees.forEach(([x, z, s, k, collide], i) => {
    m.compose(new THREE.Vector3(x, 0.8 * s, z), q.identity(), new THREE.Vector3(s, s, s));
    trunkMesh.setMatrixAt(i, m);
    trunkMesh.setColorAt(i, color.copy(BARK).offsetHSL(0, 0, (look() - 0.5) * 0.06));
    const roundTree = k === 'green' && rand() < 0.55;
    if (!roundTree && k === 'green' && look() < 0.45) {
      // Populier: hoge, slanke bladerkruin op een dunne witte (berken)stam
      for (let j = 0; j < 6; j++) rand(); // net zoveel toevalsgetallen als een den: dan blijven de stenen op hun plek
      m.compose(new THREE.Vector3(x, 1.1 * s, z), q.identity(), new THREE.Vector3(s * 0.7, s * 1.4, s * 0.7));
      trunkMesh.setMatrixAt(i, m);
      trunkMesh.setColorAt(i, BIRCH);
      const tint = roundColors[Math.floor(look() * roundColors.length)];
      for (let j = 0; j < 2; j++) {
        q.setFromEuler(new THREE.Euler(0, look() * 3, 0));
        m.compose(new THREE.Vector3(x, (2.9 + j * 1.1) * s, z), q, new THREE.Vector3(0.75 * s * (1 - j * 0.25), 1.6 * s, 0.75 * s * (1 - j * 0.25)));
        roundMesh.setMatrixAt(blobs, m);
        roundMesh.setColorAt(blobs++, color.set(tint).offsetHSL((look() - 0.5) * 0.04, 0, (look() - 0.5) * 0.08));
      }
    } else if (roundTree) {
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
      const layers = layersOf(k);
      const step = layers === 4 ? 0.7 : 0.85;
      for (let j = 0; j < layers; j++) {
        const layer = 1 - j * (layers === 4 ? 0.2 : 0.25);
        // (rand() blijft één keer per laag, zodat de rest van het level hetzelfde blijft)
        q.setFromEuler(new THREE.Euler((look() - 0.5) * 0.12, j < 3 ? rand() * Math.PI : look() * Math.PI, (look() - 0.5) * 0.12));
        m.compose(new THREE.Vector3(x, (1.8 + j * step) * s, z), q, new THREE.Vector3(s * layer, s, s * layer));
        leafMesh.setMatrixAt(cones, m);
        leafMesh.setColorAt(cones++, color.set(palette[Math.floor((j < 3 ? rand() : look()) * palette.length)]).offsetHSL((look() - 0.5) * 0.04, (look() - 0.5) * 0.1, (look() - 0.5) * 0.08));
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

  // Rotsblokken (in het hoogland veel, elders een paar) en een rotsrand langs de rand van de wereld
  const rockMat = new THREE.MeshStandardMaterial({ color: 0x8f8a80, roughness: 0.95, flatShading: true });
  const boulders = [];
  for (const region of REGIONS) {
    const wanted = region.theme === 'hoogland' ? 40 : region.theme === 'schaduw' ? 22 : 10;
    for (let n = 0, tries = 0; n < wanted && tries < 2000; tries++) {
      const [x, z] = inRegion(region, 2);
      if (!isFree(x, z, 1)) continue;
      boulders.push([x, z, 1 + rand() * 1.6, true]);
      n++;
    }
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

  // Bloemetjes (in de weides) en paddenstoelen (in het woud)
  const weides = REGIONS.filter((r) => r.theme === 'weide');
  const wouden = REGIONS.filter((r) => r.theme === 'woud');
  if (weides.length) {
    const flowerColors = [0xff6b9d, 0xffe066, 0xffffff, 0x9d7bff, 0xff8c42].map((cc) => new THREE.Color(cc));
    const count = 700 * weides.length;
    const flowers = new THREE.InstancedMesh(new THREE.IcosahedronGeometry(0.06, 0), new THREE.MeshStandardMaterial({ roughness: 0.6 }), count);
    for (let n = 0; n < count; n++) {
      const [x, z] = inRegion(weides[n % weides.length], 1.5);
      m.makeTranslation(x, 0.06, z);
      flowers.setMatrixAt(n, m);
      flowers.setColorAt(n, flowerColors[Math.floor(rand() * flowerColors.length)]);
    }
    scene.add(flowers);
  }
  if (wouden.length) {
    const count = 140 * wouden.length;
    const caps = new THREE.InstancedMesh(new THREE.SphereGeometry(0.2, 10, 6, 0, Math.PI * 2, 0, Math.PI / 2), new THREE.MeshStandardMaterial({ color: 0xd93b3b, roughness: 0.5, emissive: 0x330000 }), count);
    const stems = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.06, 0.08, 0.25, 6), new THREE.MeshStandardMaterial({ color: 0xf2e8d5 }), count);
    let n = 0;
    for (let tries = 0; n < count && tries < count * 20; tries++) {
      const [x, z] = inRegion(wouden[n % wouden.length], 1.5);
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
  // Gloeiende paarse kristallen (Schaduwrijk). De grote kun je niet doorheen lopen.
  const schaduw = REGIONS.filter((r) => r.theme === 'schaduw');
  if (schaduw.length) {
    const count = 80 * schaduw.length;
    const crystalMat = new THREE.MeshStandardMaterial({ color: 0xb070ff, emissive: 0x7a20e0, emissiveIntensity: 1.4, roughness: 0.2, metalness: 0.1, flatShading: true });
    const crystals = new THREE.InstancedMesh(new THREE.OctahedronGeometry(1, 0), crystalMat, count);
    let n = 0;
    for (let tries = 0; n < count && tries < count * 20; tries++) {
      const [x, z] = inRegion(schaduw[n % schaduw.length], 2);
      if (!isFree(x, z, 0.5)) continue;
      // Een groepje van 1 tot 3 kristallen die schuin uit de grond steken
      const big = rand() < 0.3;
      const s = big ? 0.9 + rand() * 0.8 : 0.3 + rand() * 0.35;
      q.setFromEuler(new THREE.Euler((rand() - 0.5) * 0.5, rand() * 3, (rand() - 0.5) * 0.5));
      m.compose(new THREE.Vector3(x, s * 1.2, z), q, new THREE.Vector3(s * 0.45, s * 1.6, s * 0.45));
      crystals.setMatrixAt(n++, m);
      if (big) colliders.push(new THREE.Box3(new THREE.Vector3(x - s * 0.4, 0, z - s * 0.4), new THREE.Vector3(x + s * 0.4, s * 2.6, z + s * 0.4)));
    }
    crystals.count = n;
    crystals.castShadow = true;
    scene.add(crystals);
  }
}

/**
 * De Schaduwpoort: een muur van paars licht tussen het Rotshoogland en het Schaduwrijk.
 * Hij gaat pas open als je de andere vier bosses hebt verslagen (main.js houdt je tegen zolang hij dicht is).
 */
function createGate(scene, colliders) {
  if (!Number.isFinite(GATE_X)) return null;
  const depth = BOUNDS.z * 2 + 4;
  const material = new THREE.ShaderMaterial({
    transparent: true, depthWrite: false, side: THREE.DoubleSide, blending: THREE.AdditiveBlending, fog: false,
    uniforms: { time: { value: 0 }, opacity: { value: 1 } },
    vertexShader: `varying vec2 vUv; void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
    fragmentShader: `uniform float time; uniform float opacity; varying vec2 vUv;
      void main() {
        float wave = sin(vUv.x * 160.0 + time * 2.0) * 0.5 + sin(vUv.x * 57.0 - time * 1.3 + vUv.y * 6.0) * 0.5;
        float fade = (1.0 - vUv.y) * (0.55 + 0.25 * wave);
        vec3 col = mix(vec3(0.45, 0.1, 0.9), vec3(0.9, 0.5, 1.0), smoothstep(0.3, 1.0, wave));
        gl_FragColor = vec4(col * fade, 1.0) * opacity;
      }`,
  });
  const wall = new THREE.Mesh(new THREE.PlaneGeometry(depth, 14), material);
  wall.rotation.y = Math.PI / 2;
  wall.position.set(GATE_X + 0.3, 7, 0);
  wall.userData.noAO = true;
  scene.add(wall);
  // Twee zwarte pilaren met paarse vlammen waar het pad door de poort gaat
  const crossing = [];
  for (const path of LEVEL.paths ?? []) {
    for (let i = 1; i < path.length; i++) {
      const [ax, az] = path[i - 1];
      const [bx, bz] = path[i];
      if ((ax - GATE_X) * (bx - GATE_X) < 0) crossing.push(az + ((GATE_X - ax) / (bx - ax)) * (bz - az));
    }
  }
  const stone = texMat('wall_stone', { color: 0x3a2a48 });
  const flameMat = new THREE.MeshBasicMaterial({ color: 0xc070ff, toneMapped: false });
  for (const z of crossing) {
    for (const side of [-1, 1]) {
      const pillar = texturedBox(1.4, 7, 1.4, stone, 1.4);
      pillar.position.set(GATE_X, 3.5, z + side * 4.2);
      scene.add(pillar);
      colliders.push(new THREE.Box3().setFromObject(pillar));
      const flame = new THREE.Mesh(new THREE.OctahedronGeometry(0.45, 0), flameMat);
      flame.position.set(GATE_X, 7.6, z + side * 4.2);
      scene.add(flame);
    }
    const top = texturedBox(1.6, 1.2, 9.8, stone, 1.4);
    top.position.set(GATE_X, 7.4, z);
    scene.add(top);
  }
  let open = false;
  return {
    get open() {
      return open;
    },
    /** Poort open (of weer dicht). */
    setOpen(value) {
      open = value;
      if (open) material.uniforms.opacity.value = Math.min(material.uniforms.opacity.value, 1);
    },
    update(dt) {
      material.uniforms.time.value += dt;
      const goal = open ? 0 : 1;
      material.uniforms.opacity.value += (goal - material.uniforms.opacity.value) * Math.min(1, dt * 0.8);
      wall.visible = material.uniforms.opacity.value > 0.01;
    },
  };
}

/** Boss-arena: stenen vloer en een kring van (gebroken) pilaren. */
function createArena(scene, colliders, arena) {
  const mat = texMat('wall_brick_stone_center');
  const count = 12;
  for (let i = 0; i < count; i++) {
    const a = (i / count) * Math.PI * 2;
    const x = arena.center.x + Math.sin(a) * (arena.radius + 1.5);
    const z = arena.center.z + Math.cos(a) * (arena.radius + 1.5);
    if (Math.cos(a) * (arena.open ?? 1) > 0.95) continue; // opening aan de kant van het pad
    const h = i % 3 === 0 ? 2 : 5 + (i % 2) * 1.5; // sommige zijn afgebroken
    const pillar = texturedBox(1.4, h, 1.4, mat, 1.4);
    pillar.position.set(x, h / 2, z);
    scene.add(pillar);
    colliders.push(new THREE.Box3().setFromObject(pillar));
  }
}

export function createWorld(scene) {
  if (LEVEL.castle) return createCastleWorld(scene, { tex, texturedBox }); // Omars Gekke Kasteel bouwt zijn eigen wereld (castle.js)
  const sky = createSky(scene);
  const mountains = createMountains(scene, sky.material.uniforms);
  // Mist: in het Spookwoud dikker (main.js verandert hem als je een ander gebied in loopt, zie setFog)
  scene.fog = new THREE.Fog(0xcdeaff, 50, 140);

  const hemi = new THREE.HemisphereLight(0xffffff, 0x556b2f, 0.9);
  scene.add(hemi);
  const sun = new THREE.DirectionalLight(0xffffff, 1.6);
  const stars = createStars(scene);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  sun.shadow.bias = -0.0004;
  sun.shadow.normalBias = 0.02;
  Object.assign(sun.shadow.camera, { left: -30, right: 30, top: 30, bottom: -30, near: 1, far: 140 });
  scene.add(sun, sun.target);
  let shadowHalf = 30; // de schaduw-doos is 2 x shadowHalf meter breed (rond de speler)

  // De 3 lantaarns die het dichtst bij je staan geven 's nachts echt licht op de grond.
  // Meer lampen maakt het spel trager, dus we schuiven deze 3 lampjes steeds naar de dichtstbijzijnde lantaarns.
  // Ze zijn er altijd (overdag op 0): lampen erbij doen of weghalen laat de computer alle shaders opnieuw maken (hapering).
  const lanternLights = [0, 1, 2].map(() => {
    const light = new THREE.PointLight(0xffb060, 0, 11, 1.5); // kleur, sterkte, bereik (m), afname
    scene.add(light);
    return light;
  });

  // ---------- Licht uit de lucht (environment) ----------
  // We maken een klein "fotootje" van de lucht rondom (6 kanten) en laten alle materialen daar zacht door
  // belicht worden: glanzende dingen (metaal, slijm) weerspiegelen dan de lucht in plaats van zwart te zijn.
  // Het fotootje wordt ververst als de tijd van de dag een stukje verder is (goedkoop: de lucht is maar een bol).
  const envScene = new THREE.Scene();
  // Zelfde lucht (zelfde kleuren, gedeeld), maar een stukje minder blauw (zie ENV_SKY in de lucht-shader)
  const envSkyMat = new THREE.ShaderMaterial({
    uniforms: sky.material.uniforms, vertexShader: sky.material.vertexShader, fragmentShader: sky.material.fragmentShader,
    defines: { ENV_SKY: '' }, side: THREE.BackSide, depthWrite: false,
  });
  envScene.add(new THREE.Mesh(new THREE.SphereGeometry(10, 32, 16), envSkyMat));
  const envGround = new THREE.Mesh(new THREE.CircleGeometry(40, 24).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ color: 0x4d4d24 }));
  envGround.position.y = -1.5; // onderkant = grond, anders wordt alles van onderen bleek belicht
  envScene.add(envGround);
  const env = { renderer: null, pmrem: null, cubeRT: null, cubeCam: null, target: null, time: -1, on: false };
  const envNightGround = new THREE.Color();
  const refreshEnv = (timeOfDay, look) => {
    if (!env.on || !env.renderer) return;
    if (!env.pmrem) {
      env.pmrem = new THREE.PMREMGenerator(env.renderer);
      env.cubeRT = new THREE.WebGLCubeRenderTarget(64, { type: THREE.HalfFloatType });
      env.cubeCam = new THREE.CubeCamera(0.1, 100, env.cubeRT);
    }
    // Overdag een zonnige grond, 's nachts de donkerblauwe grond-kleur van de nacht
    envNightGround.copy(look.ground).multiplyScalar(0.8);
    envGround.material.color.copy(GROUND_ENV).multiplyScalar(0.3 + sun.intensity * 0.5).lerp(envNightGround, look.stars);
    env.cubeCam.update(env.renderer, envScene);
    env.target = env.pmrem.fromCubemap(env.cubeRT.texture, env.target); // 1e keer null = aanmaken, daarna hergebruiken
    env.time = timeOfDay;
    scene.environment = env.target.texture;
  };

  // Hulpjes voor de schaduw (zodat hij niet "kriebelt" als je loopt)
  const lightDir = new THREE.Vector3(0, 1, 0);
  let lightTime = -1;
  const shadowCenter = new THREE.Vector3();
  const lightRot = new THREE.Matrix4();
  const lightRotInv = new THREE.Matrix4();
  const ZERO = new THREE.Vector3();
  const NOON_HEIGHT = new THREE.Vector3(0, 1, 0.45).normalize().y; // zo hoog staat de zon om 12 uur
  const UP = new THREE.Vector3(0, 1, 0);

  const groundGeo = createGround(scene);

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
  const gate = createGate(scene, colliders);
  bakeGroundAO(groundGeo, colliders); // pas nu: alles wat op de grond staat is er
  const pondWater = createPonds(scene, colliders, groundGeo); // ook pas nu: vijvers alleen waar niks staat

  const fogPurple = new THREE.Color(0x4a2a6a);
  const skyPurple = new THREE.Color(0x1a0a2a);
  let purple = 0; // 0 = gewone mist, 1 = paarse mist (Schaduwrijk)
  return {
    colliders,
    bounds: WALKABLE,
    gate,
    /** Staat dit punt binnen in een huis? (dan komt de camera dichterbij) */
    insideHouse(pos) {
      return houseRoofs.some((h) => h.inner.containsPoint(pos));
    },
    /** Hoe laat is het? 0 = middernacht, 0.25 = ochtend, 0.5 = middag, 0.75 = avond. */
    timeOfDay: 0.3,
    night: 0, // 0 = dag, 1 = nacht
    lampsOn: 0, // 0 = lampen uit, 1 = lampen helemaal aan (al vanaf de schemering)
    exposure: DAY.exposure, // hoe fel het beeld is (main.js geeft dit door aan de renderer)
    sunDir: new THREE.Vector3(0, 1, 0), // waar de zon (of maan) aan de hemel staat
    isMoon: false,
    look: dayLook(0.3), // alle kleuren van dit moment (voor wolken, bergen, ...)
    lightTuning: LIGHT_TUNING,

    /** Mist van het gebied waar je bent: in het Spookwoud dikker. Schuift langzaam mee (geen sprong). */
    updateFog(theme, dt, altitude = 0) {
      let near = theme === 'woud' ? 25 : theme === 'schaduw' ? 30 : 50;
      if (altitude > 14) near = Math.max(near, 80); // hoog in de lucht (bij de Hemeleilanden) is het helder
      scene.fog.near += (near - scene.fog.near) * Math.min(1, dt * 0.6);
      scene.fog.far = scene.fog.near + 90;
      // In het Schaduwrijk zijn de mist en de lucht paars
      purple += ((theme === 'schaduw' ? 1 : 0) - purple) * Math.min(1, dt * 0.6);
      if (purple > 0.001) {
        scene.fog.color.lerp(fogPurple, purple * 0.7);
        sky.material.uniforms.horizon.value.lerp(fogPurple, purple * 0.6);
        sky.material.uniforms.top.value.lerp(skyPurple, purple * 0.5);
      }
      gate?.update(dt);
    },

    /** Licht uit de lucht klaarzetten (heeft de renderer nodig om het "fotootje" van de lucht te maken). */
    initEnvironment(renderer) {
      env.renderer = renderer;
    },

    /** Licht uit de lucht aan (mooier) of uit (sneller). */
    setEnvironment(on) {
      env.on = on;
      env.time = -1; // bij de volgende updateSun een nieuw fotootje maken (dan kloppen de kleuren van de lucht al)
      if (!on) scene.environment = null;
    },

    /** Hoe scherp de schaduwen zijn: grootte van de schaduw-plaat (pixels) en hoe ver hij reikt (meter). */
    setShadowQuality(size, half) {
      shadowHalf = half;
      Object.assign(sun.shadow.camera, { left: -half, right: half, top: half, bottom: -half });
      sun.shadow.camera.updateProjectionMatrix();
      if (sun.shadow.mapSize.x !== size) {
        sun.shadow.mapSize.set(size, size);
        sun.shadow.map?.dispose();
        sun.shadow.map = null; // wordt bij de volgende frame opnieuw gemaakt in de nieuwe maat
      }
      lightTime = -1;
    },

    /**
     * Laat de zon (en zijn schaduw) met de speler meelopen, en laat de dag verstrijken.
     * @param {THREE.Vector3} [viewDir]  waar de camera heen kijkt (op de grond): daar komt meer schaduw
     */
    updateSun(playerPos, dt = 0, viewDir = null) {
      this.timeOfDay = (this.timeOfDay + dt / DAY_LENGTH) % 1;
      WIND.value += dt;
      const look = dayLook(this.timeOfDay);
      this.look = look;
      // Zon (overdag) of maan (nacht) draait over de hemel
      const angle = (this.timeOfDay - 0.25) * Math.PI * 2;
      const dir = new THREE.Vector3(Math.cos(angle) * 0.8, Math.sin(angle), 0.45);
      const isMoon = dir.y < 0.15;
      if (isMoon) dir.set(-dir.x, Math.max(0.35, -dir.y), dir.z); // 's nachts schijnt de maan van de andere kant
      dir.normalize();
      this.sunDir.copy(dir);
      this.isMoon = isMoon;
      sky.material.uniforms.sunDir.value.copy(dir);
      sky.material.uniforms.sunColor.value.copy(isMoon ? MOON_COLOR : look.sun);
      sky.material.uniforms.sunSize.value = isMoon ? 0.25 : 1;

      // Het licht komt altijd van minstens ~35 graden hoog (anders wordt de grond bij zonsondergang heel donker)
      // en draait soepel door: geen schaduw-sprong als de zon de maan wordt.
      // We draaien het licht in kleine stapjes, anders "kriebelen" de schaduwranden de hele tijd.
      if (lightTime < 0 || Math.abs(this.timeOfDay - lightTime) > 0.0015) {
        lightTime = this.timeOfDay;
        lightDir.set(Math.cos(angle) * 0.8, Math.max(Math.abs(Math.sin(angle)), 0.6), 0.45).normalize();
        lightRot.lookAt(lightDir, ZERO, UP);
        lightRotInv.copy(lightRot).transpose();
      }
      // De schaduw-doos staat rond de speler, een stukje naar voren (waar je naartoe kijkt)
      shadowCenter.set(playerPos.x, 0, playerPos.z);
      if (viewDir) shadowCenter.addScaledVector(viewDir, shadowHalf * 0.4);
      // Vastklikken op het raster van schaduw-pixels: dan schuiven de randen niet als je loopt
      const texel = (2 * shadowHalf) / sun.shadow.mapSize.x;
      shadowCenter.applyMatrix4(lightRotInv);
      shadowCenter.x = Math.round(shadowCenter.x / texel) * texel;
      shadowCenter.y = Math.round(shadowCenter.y / texel) * texel;
      shadowCenter.applyMatrix4(lightRot);
      sun.target.position.copy(shadowCenter);
      sun.position.copy(shadowCenter).addScaledVector(lightDir, 60);

      sun.color.copy(look.sun);
      // Schuin licht geeft minder licht op de grond. Dat vullen we een stukje aan, anders wordt het al
      // donker terwijl de zon nog fel is (en zo is de maan om 9 uur 's avonds bijna even fel als om middernacht).
      sun.intensity = look.sunPower * Math.min(1.45, NOON_HEIGHT / lightDir.y);
      hemi.color.copy(look.skyLight);
      hemi.groundColor.copy(look.ground);
      // Met licht uit de lucht aan, komt een deel van het zachte licht daarvandaan (dus de hemisfeer wat zachter)
      hemi.intensity = env.on ? look.ambient * LIGHT_TUNING.envHemi : look.ambient;
      scene.environmentIntensity = THREE.MathUtils.lerp(LIGHT_TUNING.envDay, LIGHT_TUNING.envNight, look.stars);
      sky.material.uniforms.top.value.copy(look.top);
      sky.material.uniforms.horizon.value.copy(look.horizon);
      scene.fog.color.copy(look.fog);
      stars.material.opacity = look.stars;
      this.night = look.stars; // 0 = dag, 1 = nacht
      this.exposure = look.exposure;
      stars.position.copy(playerPos);
      sky.position.copy(playerPos); // de lucht reist mee, anders valt hij buiten beeld (zwart gat!)
      mountains.group.position.set(playerPos.x, 0, playerPos.z); // de bergen ook (ze zijn altijd even ver weg)
      pondWater.normalMap.offset.x += dt * 0.02; // kabbelend water
      pondWater.normalMap.offset.y += dt * 0.013;
      mountains.light.value = 0.25 + look.ambient * 0.75 * (1 - look.stars * 0.55); // 's nachts donkere silhouetten
      // Het fotootje van de lucht verversen als de dag een stukje verder is (ongeveer elke 1,5 seconde)
      if (env.on && (env.time < 0 || Math.abs(this.timeOfDay - env.time) > 0.004)) refreshEnv(this.timeOfDay, look);

      for (const m of glowingWindows) m.emissiveIntensity = 0.4 + look.stars * 1.6; // ramen gloeien 's nachts
      for (const m of glowingLamps) m.emissiveIntensity = 0.3 + look.stars * 2.5;
      if (lanternHaloMat) {
        lanternHaloMat.opacity = look.stars * 0.7;
        lanternHaloMat.visible = look.stars > 0.01; // overdag niet tekenen (scheelt werk)
      }
      for (const f of glowingFires) f.scale.y = 0.8 + Math.random() * 0.4; // flakkerend haardvuur
      // Lampen gaan al aan in de schemering (dan wordt het nooit eerst donkerder en daarna weer lichter)
      const dark = Math.min(1, look.stars / 0.6);
      this.lampsOn = dark;
      // De dichtstbijzijnde lantaarns krijgen een echt lampje (ver weg gaat het langzaam uit, dan floept het nooit ineens aan)
      const nearest = lanternSpots.slice().sort((a, b) => a.distanceToSquared(playerPos) - b.distanceToSquared(playerPos));
      lanternLights.forEach((light, i) => {
        const spot = nearest[i];
        if (!spot) {
          light.intensity = 0;
          return;
        }
        light.position.copy(spot);
        const d = Math.hypot(spot.x - playerPos.x, spot.z - playerPos.z);
        light.intensity = LIGHT_TUNING.lantern * dark * (1 - THREE.MathUtils.smoothstep(d, 18, 26));
      });
      // Dak weg als je in een huis staat, zodat je naar binnen kunt kijken
      for (const h of houseRoofs) h.roof.visible = !h.inner.containsPoint(playerPos);
    },
  };
}
