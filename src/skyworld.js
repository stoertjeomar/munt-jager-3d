import * as THREE from 'three';
import { makeBoltBetween, Bolts } from './lightning.js';
import { play } from './audio.js';

// Het Wolkenrijk van Sky: een groot plateau van wolken hoog boven een zee van wolken,
// onder een donkere onweerslucht. Overal flitst de bliksem, en de donder rommelt in de verte.
// Midden op het plateau ligt een ronde arena met een gele bliksem-rune, en in het noorden
// staat Sky's troon van wolken. Sky zelf staat in skyFighter.js; het filmpje en het gevecht regelt sky.js.
//
// Alles staat rond het midden (0, 0), net als in Omars kasteel (castle.js). Het noorden is -z: daar staat de troon.

// Belangrijke plekken (in meters)
export const SKY_POINTS = {
  spawn: [0, 0, 27], // hier kom je aan (uit de Donderpoort)
  seat: [0, 2.2, -26.6], // bovenkant van het wolkenkussen op de troon
  landing: [0, 0, -6], // hier slaat Sky in als bliksem
  fightSpot: [0, 0, 5], // hier trekt Sky jou naartoe
};

const ARENA_RADIUS = 15;
const PLATEAU_RADIUS = 54; // zo groot is het wolkenplateau (je kunt tot de rand lopen)
const DAIS_TOP = 1.5; // hoogte van het bovenste wolkentrapje bij de troon

const v3 = (a) => new THREE.Vector3(...a);

/** Een plat ding op de vloer dat nooit door de vloer heen "flikkert". */
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

/** Een gele bliksemschicht op een donkere schijf (de rune midden in de arena). */
function drawRune(size = 512) {
  const c = document.createElement('canvas');
  c.width = c.height = size;
  const g = c.getContext('2d');
  const s = size / 512;
  g.clearRect(0, 0, size, size);
  g.translate(size / 2, size / 2);
  g.scale(s, s);
  // Buitenste ring met kleine streepjes (zoals een klok)
  g.strokeStyle = '#ffd23a';
  g.lineWidth = 10;
  g.beginPath();
  g.arc(0, 0, 236, 0, Math.PI * 2);
  g.stroke();
  for (let i = 0; i < 24; i++) {
    const a = (i / 24) * Math.PI * 2;
    g.lineWidth = i % 2 ? 4 : 8;
    g.beginPath();
    g.moveTo(Math.cos(a) * 205, Math.sin(a) * 205);
    g.lineTo(Math.cos(a) * 228, Math.sin(a) * 228);
    g.stroke();
  }
  // De bliksemschicht
  g.shadowColor = '#ffe066';
  g.shadowBlur = 30;
  g.fillStyle = '#ffd23a';
  g.beginPath();
  g.moveTo(30, -190);
  g.lineTo(-80, 20);
  g.lineTo(-5, 20);
  g.lineTo(-45, 190);
  g.lineTo(85, -40);
  g.lineTo(10, -40);
  g.lineTo(70, -190);
  g.closePath();
  g.fill();
  g.shadowBlur = 0;
  g.fillStyle = '#fff6c8';
  g.beginPath();
  g.moveTo(40, -170);
  g.lineTo(-50, 8);
  g.lineTo(-20, 8);
  g.closePath();
  g.fill();
  const texture = new THREE.CanvasTexture(c);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = 4;
  return texture;
}

/** Een zacht vlekkerig wolkenplaatje (grijs-wit), voor de vloer van het plateau. */
function drawCloudFloor(size = 256) {
  const c = document.createElement('canvas');
  c.width = c.height = size;
  const g = c.getContext('2d');
  g.fillStyle = '#d9e0ec';
  g.fillRect(0, 0, size, size);
  for (let i = 0; i < 160; i++) {
    const x = Math.random() * size;
    const y = Math.random() * size;
    const r = 8 + Math.random() * 30;
    const light = Math.random() < 0.5;
    const grad = g.createRadialGradient(x, y, 0, x, y, r);
    grad.addColorStop(0, light ? 'rgba(255,255,255,0.22)' : 'rgba(160,175,200,0.14)');
    grad.addColorStop(1, 'rgba(0,0,0,0)');
    g.fillStyle = grad;
    // Ook aan de andere kant tekenen: dan loopt het plaatje naadloos door als het herhaald wordt
    for (const dx of [-size, 0, size]) for (const dy of [-size, 0, size]) g.fillRect(x - r + dx, y - r + dy, r * 2, r * 2);
  }
  const texture = new THREE.CanvasTexture(c);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
  return texture;
}

/**
 * Bouwt het hele Wolkenrijk. Geeft hetzelfde soort object terug als createWorld in world.js
 * (colliders, bounds, updateSun, ...) plus `sky` met de belangrijke plekken.
 */
export function createSkyWorld(scene) {
  const colliders = [];
  const glowLights = []; // { light, base } gele lampjes op de wolkenzuilen
  const crystals = []; // zwevende bliksemkristallen (draaien en dobberen)
  const drifting = []; // wolkeneilandjes die langzaam rondzweven
  const puffs = []; // alle wolkenbollen: [x, y, z, sx, sy, sz] (één InstancedMesh)

  const cloudMat = new THREE.MeshStandardMaterial({ color: 0xe6ecf5, roughness: 1, emissive: 0x2a3348, emissiveIntensity: 0.6 });
  const darkCloudMat = new THREE.MeshStandardMaterial({ color: 0x8a96ac, roughness: 1, emissive: 0x1a2030, emissiveIntensity: 0.5 });
  const yellow = new THREE.MeshBasicMaterial({ color: 0xffd23a, toneMapped: false });

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
  /** Een bolle wolk van een paar bollen bij elkaar. */
  const cloud = (x, y, z, size = 1, n = 5) => {
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2 + Math.random();
      const r = size * (0.4 + Math.random() * 0.6);
      const s = size * (0.6 + Math.random() * 0.5);
      puffs.push([x + Math.cos(a) * r, y + (Math.random() - 0.3) * size * 0.5, z + Math.sin(a) * r, s * 1.2, s * 0.8, s]);
    }
  };

  // ---------- Onweerslucht: donkere wolken die langzaam draaien, en flitsen als de bliksem inslaat ----------
  const sky = new THREE.Mesh(
    new THREE.SphereGeometry(200, 32, 16),
    new THREE.ShaderMaterial({
      side: THREE.BackSide,
      depthWrite: false,
      fog: false,
      uniforms: { time: { value: 0 }, flash: { value: 0 }, flashDir: { value: new THREE.Vector3(0, 0.3, -1).normalize() } },
      vertexShader: `varying vec3 vPos; void main() { vPos = position; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
      fragmentShader: `uniform float time; uniform float flash; uniform vec3 flashDir; varying vec3 vPos;
        float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
        float noise(vec2 p) {
          vec2 i = floor(p); vec2 f = fract(p); f = f * f * (3.0 - 2.0 * f);
          return mix(mix(hash(i), hash(i + vec2(1.0, 0.0)), f.x), mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0, 1.0)), f.x), f.y);
        }
        float fbm(vec2 p) { float v = 0.0; float a = 0.5; for (int i = 0; i < 5; i++) { v += a * noise(p); p *= 2.03; a *= 0.5; } return v; }
        void main() {
          vec3 dir = normalize(vPos);
          float h = dir.y;
          // Onderaan licht blauwgrijs (de wolkenzee), daarboven donker leigrijs met een paarse gloed
          vec3 low = vec3(0.55, 0.6, 0.72);
          vec3 mid = vec3(0.22, 0.25, 0.36);
          vec3 top = vec3(0.07, 0.08, 0.14);
          vec3 col = mix(low, mid, smoothstep(-0.1, 0.25, h));
          col = mix(col, top, smoothstep(0.25, 0.9, h));
          // Wolken die draaien boven je hoofd
          vec2 uv = dir.xz / max(0.18, h + 0.25) * 1.6;
          float c = fbm(uv + vec2(time * 0.02, time * 0.013));
          float c2 = fbm(uv * 2.3 - vec2(time * 0.035, 0.0));
          float clouds = smoothstep(0.45, 0.8, c * 0.7 + c2 * 0.4);
          col = mix(col, vec3(0.32, 0.35, 0.46), clouds * smoothstep(-0.05, 0.2, h) * 0.8);
          col *= 0.85 + 0.25 * c2;
          // Bliksemflits: de wolken lichten op (vooral waar de bliksem insloeg)
          float near = pow(max(dot(dir, normalize(flashDir)), 0.0), 6.0);
          col += vec3(0.75, 0.78, 1.0) * flash * (0.25 + clouds * 0.6 + near * 1.2);
          gl_FragColor = vec4(col, 1.0);
          #include <colorspace_fragment>
        }`,
    })
  );
  sky.renderOrder = -10;
  scene.add(sky);
  scene.fog = new THREE.Fog(0x8a94aa, 55, 175);
  const fogColor = new THREE.Color(0x8a94aa);
  const fogFlash = new THREE.Color(0xd8e0ff);

  // ---------- Licht: grijs onweerslicht, en een flits bij elke bliksem ----------
  const hemi = new THREE.HemisphereLight(0xb8c4e0, 0x5a6078, 1.25);
  scene.add(hemi);
  const sun = new THREE.DirectionalLight(0xdde4ff, 1.3);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  sun.shadow.bias = -0.0005;
  sun.shadow.normalBias = 0.03;
  Object.assign(sun.shadow.camera, { left: -40, right: 40, top: 40, bottom: -40, near: 1, far: 120 });
  scene.add(sun, sun.target);
  const sunDir = new THREE.Vector3(-0.3, 1, 0.45).normalize();
  const flashLight = new THREE.DirectionalLight(0xe8eeff, 0);
  scene.add(flashLight, flashLight.target);
  // Gele gloed boven de arena
  const arenaLight = new THREE.PointLight(0xffd23a, 35, 34, 2);
  arenaLight.position.set(0, 9, 0);
  scene.add(arenaLight);
  glowLights.push({ light: arenaLight, base: 35 });

  // ---------- De wolkenzee diep beneden ----------
  const sea = new THREE.Mesh(
    new THREE.PlaneGeometry(500, 500),
    new THREE.ShaderMaterial({
      uniforms: { time: { value: 0 }, flash: { value: 0 }, haze: { value: fogColor.clone() } },
      vertexShader: `varying vec3 vWorld; void main() { vec4 w = modelMatrix * vec4(position, 1.0); vWorld = w.xyz; gl_Position = projectionMatrix * viewMatrix * w; }`,
      fragmentShader: `uniform float time; uniform float flash; uniform vec3 haze; varying vec3 vWorld;
        float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
        float noise(vec2 p) {
          vec2 i = floor(p); vec2 f = fract(p); f = f * f * (3.0 - 2.0 * f);
          return mix(mix(hash(i), hash(i + vec2(1.0, 0.0)), f.x), mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0, 1.0)), f.x), f.y);
        }
        void main() {
          vec2 p = vWorld.xz;
          float n = noise(p * 0.03 + vec2(time * 0.02, 0.0)) * 0.6 + noise(p * 0.09 - vec2(0.0, time * 0.03)) * 0.4;
          vec3 col = mix(vec3(0.42, 0.47, 0.6), vec3(0.85, 0.89, 0.96), smoothstep(0.3, 0.75, n));
          col += vec3(0.6, 0.65, 0.9) * flash * 0.5;
          float d = length(vWorld - cameraPosition);
          col = mix(col, haze, smoothstep(60.0, 200.0, d) * 0.9);
          gl_FragColor = vec4(col, 1.0);
          #include <colorspace_fragment>
        }`,
    })
  );
  sea.rotation.x = -Math.PI / 2;
  sea.position.y = -9;
  scene.add(sea);

  // ---------- Het wolkenplateau ----------
  const floorTex = drawCloudFloor();
  floorTex.repeat.set(9, 9);
  const floor = new THREE.Mesh(new THREE.CircleGeometry(PLATEAU_RADIUS, 64), new THREE.MeshStandardMaterial({ map: floorTex, roughness: 1, color: 0xf0f3fa, emissive: 0x1a2030, emissiveIntensity: 0.4 }));
  floor.rotation.x = -Math.PI / 2;
  floor.receiveShadow = true;
  scene.add(floor);
  const underside = new THREE.Mesh(new THREE.CylinderGeometry(PLATEAU_RADIUS, PLATEAU_RADIUS * 0.6, 7, 48, 1, true), darkCloudMat);
  underside.position.y = -3.6;
  scene.add(underside);
  // Bolle randen rondom (zo zie je dat het een wolk is) en wolkjes eronder
  for (let i = 0; i < 70; i++) {
    const a = (i / 70) * Math.PI * 2;
    const r = PLATEAU_RADIUS - 1 + Math.random() * 3;
    cloud(Math.cos(a) * r, -0.6 + Math.random() * 0.8, Math.sin(a) * r, 2.2 + Math.random() * 1.6, 3);
    if (i % 2) cloud(Math.cos(a) * (r - 6), -5.5 - Math.random() * 2, Math.sin(a) * (r - 6), 3 + Math.random() * 2, 3);
  }
  // Wat bolletjes op het plateau zelf (zachte heuveltjes, niet in de arena en niet op het pad)
  for (let i = 0; i < 40; i++) {
    const a = Math.random() * Math.PI * 2;
    const r = 22 + Math.random() * (PLATEAU_RADIUS - 28);
    const x = Math.cos(a) * r;
    const z = Math.sin(a) * r;
    if (Math.abs(x) < 5 && z > 15) continue; // het pad vanaf de poort
    if (z < -16 && Math.abs(x) < 10) continue; // de troon
    cloud(x, -0.3, z, 0.9 + Math.random() * 0.9, 4);
  }

  // ---------- De arena: een ring van gele bliksem en een rune in het midden ----------
  scene.add(decal(new THREE.CircleGeometry(ARENA_RADIUS + 0.6, 64), new THREE.MeshStandardMaterial({ map: floorTex, color: 0xb8c2d6, roughness: 1, emissive: 0x141a28, emissiveIntensity: 0.6 }), 0.01, 1));
  scene.add(decal(new THREE.RingGeometry(ARENA_RADIUS + 0.2, ARENA_RADIUS + 0.75, 72), yellow.clone(), 0.02, 2));
  const runeMat = new THREE.MeshBasicMaterial({ map: drawRune(), transparent: true, toneMapped: false });
  const rune = decal(new THREE.CircleGeometry(5.2, 48), runeMat, 0.03, 3);
  scene.add(rune);
  // Kleine bliksem-tekens rond de rand (zoals de cijfers op een klok)
  const markGeo = new THREE.PlaneGeometry(0.5, 1.4);
  for (let i = 0; i < 12; i++) {
    const a = (i / 12) * Math.PI * 2;
    const m = decal(markGeo, yellow.clone(), 0.025, 2);
    m.position.set(Math.sin(a) * (ARENA_RADIUS - 1.2), m.position.y, Math.cos(a) * (ARENA_RADIUS - 1.2));
    m.rotation.z = a;
    scene.add(m);
  }

  // ---------- Wolkenzuilen rond de arena, met zwevende bliksemkristallen ----------
  const crystalGeo = new THREE.OctahedronGeometry(0.6, 0);
  const crystalMat = new THREE.MeshBasicMaterial({ color: 0xffe066, toneMapped: false });
  for (let i = 0; i < 8; i++) {
    const a = Math.PI / 8 + (i / 8) * Math.PI * 2;
    const x = Math.sin(a) * 18.5;
    const z = Math.cos(a) * 18.5;
    const h = 5 + (i % 2) * 2;
    // Een zuil van wolkenbollen (stevig: je kunt er niet doorheen)
    for (let y = 0; y < h; y += 1.1) puffs.push([x + (Math.random() - 0.5) * 0.3, y + 0.5, z + (Math.random() - 0.5) * 0.3, 1.2, 0.8, 1.2]);
    puffs.push([x, h + 0.2, z, 1.6, 0.7, 1.6]);
    colliders.push(new THREE.Box3(new THREE.Vector3(x - 1, 0, z - 1), new THREE.Vector3(x + 1, h + 0.6, z + 1)));
    const crystal = add(new THREE.Mesh(crystalGeo, crystalMat), x, h + 1.8, z);
    crystal.castShadow = false;
    crystals.push({ mesh: crystal, base: h + 1.8, phase: i });
    if (i % 2 === 0) {
      const light = new THREE.PointLight(0xffd23a, 14, 14, 2);
      light.position.set(x, h + 1.8, z);
      scene.add(light);
      glowLights.push({ light, base: 14 });
    }
  }

  // ---------- Sky's troon van wolken (in het noorden), op drie wolkentrapjes ----------
  const step = (w, d, y0, z) => {
    add(new THREE.Mesh(new THREE.BoxGeometry(w, 0.5, d), cloudMat), 0, y0 + 0.25, z, true);
    for (let x = -w / 2; x <= w / 2; x += 1.6) puffs.push([x, y0 + 0.35, z + d / 2, 0.55, 0.4, 0.5]); // bolle voorkant
  };
  step(14, 10, 0, -24.5);
  step(11, 8, 0.5, -25.5);
  step(8, 6, 1.0, -26.5);
  const seat = v3(SKY_POINTS.seat);
  add(new THREE.Mesh(new THREE.BoxGeometry(2.4, 0.6, 1.8), cloudMat), 0, DAIS_TOP + 0.3, seat.z);
  // Rugleuning en armleuningen: dikke wolken
  for (let y = 0; y < 4.5; y += 0.8) puffs.push([0, DAIS_TOP + 1 + y, seat.z - 1.3, 1.8 - y * 0.15, 0.9, 0.7]);
  for (const s of [-1, 1]) puffs.push([s * 1.4, DAIS_TOP + 1, seat.z, 0.6, 0.6, 1]);
  colliders.push(new THREE.Box3(new THREE.Vector3(-1.6, DAIS_TOP, seat.z - 1.55), new THREE.Vector3(1.6, DAIS_TOP + 5, seat.z + 0.9)));
  // Een grote gloeiende bliksemschicht boven de troon (hetzelfde teken als in de arena)
  const emblem = new THREE.Mesh(new THREE.PlaneGeometry(4.2, 4.2), new THREE.MeshBasicMaterial({ map: drawRune(), transparent: true, toneMapped: false, side: THREE.DoubleSide, depthWrite: false }));
  emblem.position.set(0, 8.4, seat.z - 1.6);
  scene.add(emblem);
  const throneLight = new THREE.PointLight(0xffe066, 30, 18, 2);
  throneLight.position.set(0, 6, seat.z + 1);
  scene.add(throneLight);
  glowLights.push({ light: throneLight, base: 30 });

  // ---------- De Donderpoort (waar je aankomt): twee wolkenzuilen met een boog van bliksem ----------
  for (const s of [-1, 1]) {
    for (let y = 0; y < 5; y += 1) puffs.push([s * 3, y + 0.5, 31, 0.9, 0.7, 0.9]);
    colliders.push(new THREE.Box3(new THREE.Vector3(s * 3 - 0.8, 0, 30.2), new THREE.Vector3(s * 3 + 0.8, 5.5, 31.8)));
  }
  const arch = new THREE.Mesh(new THREE.TorusGeometry(3, 0.12, 8, 32, Math.PI), crystalMat);
  arch.position.set(0, 5, 31);
  scene.add(arch);

  // ---------- Wolkeneilandjes die in de verte zweven ----------
  for (let i = 0; i < 14; i++) {
    const a = (i / 14) * Math.PI * 2 + Math.random() * 0.3;
    const r = 75 + Math.random() * 55;
    const g = new THREE.Group();
    const n = 4 + Math.floor(Math.random() * 4);
    for (let k = 0; k < n; k++) {
      const b = new THREE.Mesh(new THREE.SphereGeometry(1, 14, 10), k % 3 ? cloudMat : darkCloudMat);
      const s = 2.5 + Math.random() * 3;
      b.scale.set(s * 1.3, s * 0.7, s);
      b.position.set((Math.random() - 0.5) * 8, (Math.random() - 0.5) * 2, (Math.random() - 0.5) * 6);
      g.add(b);
    }
    g.position.set(Math.cos(a) * r, -4 + Math.random() * 22, Math.sin(a) * r);
    scene.add(g);
    drifting.push({ group: g, angle: a, radius: r, speed: (0.004 + Math.random() * 0.006) * (i % 2 ? 1 : -1), y: g.position.y, phase: Math.random() * 10 });
  }

  // Alle wolkenbollen in één keer tekenen (dat is snel)
  const puffMesh = new THREE.InstancedMesh(new THREE.SphereGeometry(1, 14, 10), cloudMat, puffs.length);
  const m4 = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  puffs.forEach(([x, y, z, sx, sy, sz], i) => puffMesh.setMatrixAt(i, m4.compose(new THREE.Vector3(x, y, z), q, new THREE.Vector3(sx, sy, sz))));
  puffMesh.castShadow = true;
  puffMesh.receiveShadow = true;
  scene.add(puffMesh);

  // ---------- Onweer: de bliksem slaat in (vooral in de verte) en de donder rommelt ----------
  const bolts = new Bolts(scene);
  const storm = { next: 2, flash: 0, thunder: [] }; // thunder = donder die nog moet klinken: { t, sound }
  let lastTime = performance.now() / 1000;

  /** Een bliksem slaat in, ergens om je heen. Hoe verder weg, hoe later je de donder hoort. */
  function strike(playerPos) {
    const a = Math.random() * Math.PI * 2;
    const far = Math.random() < 0.85;
    const r = far ? 70 + Math.random() * 80 : 30 + Math.random() * 15;
    const to = new THREE.Vector3(playerPos.x + Math.cos(a) * r, far ? -9 : -2, playerPos.z + Math.sin(a) * r);
    const from = to.clone().add(new THREE.Vector3((Math.random() - 0.5) * 20, 70 + Math.random() * 20, (Math.random() - 0.5) * 20));
    bolts.add(makeBoltBetween(from, to, { color: Math.random() < 0.7 ? 'blauw' : 'geel', width: far ? 4 : 2.5, wiggle: 7, segments: 14, branches: 3 }), 0.28);
    storm.flash = far ? 0.7 : 1.2;
    sky.material.uniforms.flashDir.value.copy(to).sub(playerPos).setY(25).normalize();
    flashLight.position.copy(playerPos).add(sky.material.uniforms.flashDir.value.clone().multiplyScalar(40));
    flashLight.target.position.copy(playerPos);
    storm.thunder.push({ t: r / 110, sound: far ? 'rommel' : 'donder' });
  }

  return {
    colliders,
    bounds: { x: 35, z: 39 }, // verder kun je niet lopen (dan val je van de wolk!)
    night: 0.45, // donker onweer: de pluisjes worden lichtjes
    lampsOn: 0.6, // het warme lichtje bij de speler is half aan (main.js)
    exposure: 1.2,
    timeOfDay: 0.8,
    sunDir,
    isMoon: true, // geen zon-gloed in beeld: de zon zit achter de wolken
    /** In het Wolkenrijk zijn geen huizen. */
    insideHouse() {
      return false;
    },
    sky: {
      spawn: v3(SKY_POINTS.spawn),
      seat,
      landing: v3(SKY_POINTS.landing),
      fightSpot: v3(SKY_POINTS.fightSpot),
      center: new THREE.Vector3(0, 0, 0),
      crystals: crystals.map((c) => c.mesh.position),
      partyLights: glowLights.map((g) => g.light), // voor het feest als je Sky verslaat (sky.js)
      /** Nu meteen een bliksem (voor het filmpje). */
      strike: (pos) => strike(pos),
    },
    /**
     * Elke frame: lucht en licht reizen mee met de speler, wolken drijven, kristallen dobberen,
     * en de bliksem flitst. Dit gebruikt de echte klok, zodat het onweer ook doorgaat als het spel stilstaat.
     */
    updateSun(playerPos) {
      const t = performance.now() / 1000;
      const dt = Math.min(0.1, t - lastTime);
      lastTime = t;
      sky.position.copy(playerPos);
      sky.material.uniforms.time.value = t;
      sea.material.uniforms.time.value = t;
      sun.target.position.copy(playerPos);
      sun.position.copy(playerPos).addScaledVector(sunDir, 55);
      for (const c of crystals) {
        c.mesh.position.y = c.base + Math.sin(t * 1.6 + c.phase) * 0.25;
        c.mesh.rotation.y = t * 1.2 + c.phase;
      }
      for (const d of drifting) {
        d.angle += d.speed * dt;
        d.group.position.set(Math.cos(d.angle) * d.radius, d.y + Math.sin(t * 0.3 + d.phase) * 1.2, Math.sin(d.angle) * d.radius);
      }
      for (const l of glowLights) l.light.intensity = l.base * (0.85 + Math.sin(t * 5 + l.base) * 0.1 + (Math.random() < 0.03 ? 0.6 : 0));
      // Onweer (niet als het tabblad weg is: dan hoor je de donder niet ineens allemaal tegelijk)
      if (!document.hidden) {
        storm.next -= dt;
        if (storm.next <= 0) {
          storm.next = 3 + Math.random() * 6;
          strike(playerPos);
          if (Math.random() < 0.35) storm.next = 0.15 + Math.random() * 0.3; // soms twee vlak na elkaar
        }
        for (let i = storm.thunder.length - 1; i >= 0; i--) {
          storm.thunder[i].t -= dt;
          if (storm.thunder[i].t <= 0) {
            play(storm.thunder[i].sound);
            storm.thunder.splice(i, 1);
          }
        }
      }
      storm.flash = Math.max(0, storm.flash - dt * 4);
      const f = storm.flash * (0.7 + Math.random() * 0.3); // flikkeren
      sky.material.uniforms.flash.value = f;
      sea.material.uniforms.flash.value = f;
      flashLight.intensity = f * 3;
      scene.fog.color.copy(fogColor).lerp(fogFlash, Math.min(1, f * 0.5));
      bolts.update(dt);
    },
  };
}
