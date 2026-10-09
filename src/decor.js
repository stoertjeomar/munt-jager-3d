import * as THREE from 'three';
import { loadGLB } from './assets.js';
import { isFree, seededRandom, BOUNDS, addWind, SKY_UNIFORMS, PONDS, regionAt } from './world.js';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { LEVEL, REGIONS } from './levels.js';
import { culler } from './culling.js';

// Extra aankleding van de wereld met modellen uit de KayKit- en Kenney-pakketten:
// planten, stenen, grasplukjes, wolken en rondscharrelende dieren.

/**
 * Zet heel veel kopieën van een model neer met InstancedMesh (één tekenopdracht per onderdeel = snel).
 * @param {Array<THREE.Matrix4>} transforms
 */
function scatter(scene, gltf, transforms, { shadows = false, wind = 0, tint = null, maxDist = Infinity } = {}) {
  gltf.scene.updateMatrixWorld(true);
  // Andere kleur (bijv. de grasplukjes: minder mintgroen, meer echt gras)
  if (tint) gltf.scene.traverse((c) => c.isMesh && c.material.color?.multiply(tint));
  // Niet te glanzend: met licht uit de lucht zien gladde planten en stenen er anders uit als plastic
  gltf.scene.traverse((c) => {
    if (c.isMesh && c.material.roughness !== undefined) c.material.roughness = Math.max(c.material.roughness, 0.8);
  });
  // Gras en planten wiegen in de wind
  if (wind) gltf.scene.traverse((c) => c.isMesh && addWind(c.material, { strength: wind, speed: 2.2 }));
  // In vakken van 40 x 40 meter verdelen: dan tekent de computer alleen de vakken die in beeld zijn
  const CELL = 40;
  const cells = new Map();
  const p = new THREE.Vector3();
  for (const t of transforms) {
    p.setFromMatrixPosition(t);
    const key = `${Math.floor(p.x / CELL)},${Math.floor(p.z / CELL)}`;
    if (!cells.has(key)) cells.set(key, []);
    cells.get(key).push(t);
  }
  gltf.scene.traverse((child) => {
    if (!child.isMesh) return;
    for (const list of cells.values()) {
      const inst = new THREE.InstancedMesh(child.geometry, child.material, list.length);
      const m = new THREE.Matrix4();
      list.forEach((t, i) => inst.setMatrixAt(i, m.multiplyMatrices(t, child.matrixWorld)));
      inst.computeBoundingSphere();
      inst.castShadow = shadows;
      inst.receiveShadow = true;
      inst.userData.cell = true;
      scene.add(inst);
      culler.add(inst, { maxDist }); // ver weg (in de mist, of kleine plantjes al eerder): niet tekenen
    }
  });
}

/**
 * Willekeurige plekken in de wereld (die vrij zijn, en eventueel alleen in een bepaald soort gebied).
 * `count` = hoeveel per gebied: in de open wereld komen er dus meer als er meer van die gebieden zijn.
 */
function spots(rand, count, { regions = null, scaleMin = 1, scaleMax = 1, margin = 0 } = {}) {
  const list = [];
  const themes = LEVEL.regions ? REGIONS.map((r) => r.theme) : [LEVEL.theme];
  const matching = regions ? themes.filter((t) => regions.includes(t)).length : themes.length;
  count *= matching;
  for (let tries = 0; list.length < count && tries < count * 30; tries++) {
    const x = (rand() - 0.5) * (BOUNDS.x * 2 - 4);
    const z = (rand() - 0.5) * (BOUNDS.z * 2 - 4);
    if (regions && !regions.includes(regionAt(x, z))) continue;
    if (!isFree(x, z, margin)) continue;
    const s = scaleMin + rand() * (scaleMax - scaleMin);
    list.push(new THREE.Matrix4().compose(new THREE.Vector3(x, 0, z), new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), rand() * Math.PI * 2), new THREE.Vector3(s, s, s)));
  }
  return list;
}

// ---------- Wolken ----------

/** Een bolle wolk: een paar ronde bollen naast elkaar (laag-poly), met een plattere onderkant. */
function puffyCloudGeometry(rand) {
  const parts = [];
  const n = 5 + Math.floor(rand() * 4);
  for (let i = 0; i < n; i++) {
    const middle = 1 - Math.abs(i - (n - 1) / 2) / n; // in het midden de grootste bollen
    const r = 0.45 + rand() * 0.35 + middle * 0.45;
    const g = new THREE.IcosahedronGeometry(1, 1);
    g.scale(r * 1.15, r * 0.85, r);
    g.translate((i - (n - 1) / 2) * 0.72 + (rand() - 0.5) * 0.3, r * 0.35 + rand() * 0.2, (rand() - 0.5) * 0.7);
    parts.push(g);
  }
  const geo = mergeGeometries(parts);
  // Onderkant plat maken, zoals echte stapelwolken
  const pos = geo.attributes.position;
  for (let i = 0; i < pos.count; i++) if (pos.getY(i) < 0) pos.setY(i, pos.getY(i) * 0.25);
  geo.computeVertexNormals();
  return geo;
}

/**
 * Eén materiaal voor alle wolken: wit en zonnig van boven, blauwgrijs van onderen (in de kleur van de lucht),
 * roze bij zonsondergang en donker 's nachts.
 */
function createCloudMaterial() {
  const sky = SKY_UNIFORMS ?? {
    // In Omars kasteel is er geen gewone lucht: dan paarse wolken
    top: { value: new THREE.Color(0x2a1050) }, horizon: { value: new THREE.Color(0x6a3a8a) }, sunColor: { value: new THREE.Color(0xffffff) },
  };
  return new THREE.ShaderMaterial({
    transparent: true,
    depthWrite: false,
    fog: false,
    uniforms: {
      top: sky.top, horizon: sky.horizon, sunColor: sky.sunColor,
      cloudLight: { value: 1 }, tint: { value: new THREE.Color(1, 1, 1) }, opacity: { value: 0.95 },
    },
    vertexShader: `varying vec3 vN; void main() { vN = normalize(mat3(modelMatrix) * normal); gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
    fragmentShader: `uniform vec3 top; uniform vec3 horizon; uniform vec3 sunColor; uniform float cloudLight; uniform vec3 tint; uniform float opacity; varying vec3 vN;
      void main() {
        float up = normalize(vN).y * 0.5 + 0.5;
        vec3 lit = mix(vec3(1.0), sunColor, 0.25) * 1.05;   // boven: zonnig wit
        vec3 shade = mix(horizon, top, 0.35) * 0.82;         // onder: in de kleur van de lucht, wat donkerder
        gl_FragColor = vec4(mix(shade, lit, smoothstep(0.2, 0.9, up)) * cloudLight * tint, opacity);
        #include <colorspace_fragment>
      }`,
  });
}

// ---------- Dieren die rondscharrelen (doen niks, maken de wereld levendig) ----------

class Animal {
  constructor(scene, model, home, radius, rand) {
    this.mesh = model;
    this.home = home.clone();
    this.radius = radius;
    this.rand = rand;
    this.mesh.position.copy(home);
    this.target = home.clone();
    this.wait = rand() * 3;
    this.phase = rand() * 10;
    scene.add(this.mesh);
  }

  update(dt, time, playerPos) {
    // Wegrennen als de speler heel dichtbij komt
    const fromPlayer = this.mesh.position.clone().sub(playerPos).setY(0);
    if (fromPlayer.length() < 3) {
      this.target.copy(this.mesh.position).add(fromPlayer.setLength(5));
      this.wait = 0;
    }
    if (this.wait > 0) {
      this.wait -= dt;
      this.mesh.position.y = 0;
      return;
    }
    const to = this.target.clone().sub(this.mesh.position).setY(0);
    if (to.length() < 0.3) {
      // Nieuw doel kiezen in de buurt van huis
      const a = this.rand() * Math.PI * 2;
      const r = this.rand() * this.radius;
      this.target.set(this.home.x + Math.sin(a) * r, 0, this.home.z + Math.cos(a) * r);
      this.wait = 1 + this.rand() * 3;
      return;
    }
    to.normalize();
    this.mesh.position.addScaledVector(to, dt * 2.2);
    this.mesh.position.y = Math.abs(Math.sin(time * 12 + this.phase)) * 0.12; // huppelen
    let diff = Math.atan2(to.x, to.z) - this.mesh.rotation.y;
    diff = Math.atan2(Math.sin(diff), Math.cos(diff));
    this.mesh.rotation.y += diff * Math.min(1, 8 * dt);
  }
}

export class Decor {
  constructor(scene) {
    this.scene = scene;
    this.clouds = [];
    this.animals = [];
    this.createMotes();
    this.load();
  }

  /** Zwevende pluisjes in de lucht rond de speler: overdag stuifmeel, 's nachts vuurvliegjes. */
  createMotes() {
    const COUNT = 220;
    this.moteBox = 36; // zo groot is het blok lucht rond de speler waarin ze zweven
    this.moteData = Array.from({ length: COUNT }, () => ({
      x: (Math.random() - 0.5) * this.moteBox, y: 0.3 + Math.random() * 4, z: (Math.random() - 0.5) * this.moteBox,
      phase: Math.random() * 10, speed: 0.3 + Math.random() * 0.6,
    }));
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(new Float32Array(COUNT * 3), 3));
    // Rond, zacht lichtpuntje (getekend op een klein canvas)
    const canvas = document.createElement('canvas');
    canvas.width = canvas.height = 32;
    const ctx = canvas.getContext('2d');
    const g = ctx.createRadialGradient(16, 16, 0, 16, 16, 16);
    g.addColorStop(0, 'rgba(255,255,255,1)');
    g.addColorStop(0.35, 'rgba(255,255,255,0.6)');
    g.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, 32, 32);
    this.motes = new THREE.Points(geo, new THREE.PointsMaterial({
      map: new THREE.CanvasTexture(canvas), color: 0xfff3c4, size: 0.12, transparent: true, opacity: 0.7,
      depthWrite: false, blending: THREE.AdditiveBlending, toneMapped: false,
    }));
    this.motes.frustumCulled = false;
    this.scene.add(this.motes);
  }

  updateMotes(dt, time, playerPos, night) {
    const pos = this.motes.geometry.attributes.position;
    const half = this.moteBox / 2;
    this.moteData.forEach((m, i) => {
      m.x += Math.sin(time * 0.5 * m.speed + m.phase) * dt * 0.4 + dt * 0.25; // drijft langzaam mee met de wind
      m.z += Math.cos(time * 0.4 * m.speed + m.phase) * dt * 0.4;
      // Blijf in een blok rond de speler (wat eruit valt, komt aan de andere kant terug)
      let wx = m.x - playerPos.x;
      let wz = m.z - playerPos.z;
      if (wx > half) m.x -= this.moteBox; else if (wx < -half) m.x += this.moteBox;
      if (wz > half) m.z -= this.moteBox; else if (wz < -half) m.z += this.moteBox;
      pos.setXYZ(i, m.x, m.y + Math.sin(time * m.speed + m.phase) * 0.35, m.z);
    });
    pos.needsUpdate = true;
    // 's Nachts: groter, feller en geelgroen (vuurvliegjes) en ze knipperen samen een beetje
    const mat = this.motes.material;
    mat.size = 0.1 + night * 0.12;
    mat.color.setRGB(1 - night * 0.25, 0.95, 0.75 - night * 0.35);
    mat.opacity = 0.45 + night * (0.45 + Math.sin(time * 3) * 0.1);
  }

  async load() {
    const scene = this.scene;
    const rand = seededRandom(99);
    const [grass, grassSmall, plantA, plantB, rocksA, rocksB, rocksDesA, rocksDesB, detail, duck, dog, bear] = await Promise.all(
      [
        'models/kenney/grass.glb', 'models/kenney/grass-small.glb',
        'models/kaykit/plantA_forest.glb', 'models/kaykit/plantB_forest.glb',
        'models/kaykit/rocksA_forest.glb', 'models/kaykit/rocksB_forest.glb',
        'models/kaykit/rocksA_desert.glb', 'models/kaykit/rocksB_desert.glb',
        'models/kaykit/detail_forest.glb',
        'models/kaykit/character_duck.glb', 'models/kaykit/character_dog.glb', 'models/kaykit/character_bear.glb',
      ].map((url) => loadGLB(url).catch(() => null))
    );

    const green = ['weide', 'woud'];
    // Grasplukjes en planten (het dichte gras zelf staat in grass.js)
    const grassTint = new THREE.Color(0.78, 0.95, 0.55);
    if (grass) scatter(scene, grass, spots(rand, 550, { regions: green, scaleMin: 1.4, scaleMax: 2.4 }), { wind: 0.35, tint: grassTint, maxDist: 45 });
    if (grassSmall) scatter(scene, grassSmall, spots(rand, 550, { regions: green, scaleMin: 1.4, scaleMax: 2.2 }), { wind: 0.35, tint: grassTint, maxDist: 45 });
    if (plantA) scatter(scene, plantA, spots(rand, 120, { regions: green, scaleMin: 0.9, scaleMax: 1.6 }), { wind: 0.25, maxDist: 60 });
    if (plantB) scatter(scene, plantB, spots(rand, 120, { regions: green, scaleMin: 0.8, scaleMax: 1.5 }), { wind: 0.25, maxDist: 60 });
    if (detail) scatter(scene, detail, spots(rand, 70, { regions: green, scaleMin: 1, scaleMax: 1.6 }), { maxDist: 60 });
    // Riet en planten langs de rand van de vijvers
    if (plantB && PONDS.length) {
      const reeds = [];
      for (const [px, pz, pr] of PONDS) {
        for (let i = 0; i < 10; i++) {
          const a = (i / 10) * Math.PI * 2 + rand() * 0.5;
          const d = pr + 0.1 + rand() * 0.6;
          const sc = 0.9 + rand() * 0.6;
          reeds.push(new THREE.Matrix4().compose(new THREE.Vector3(px + Math.sin(a) * d, 0, pz + Math.cos(a) * d), new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), rand() * 6.28), new THREE.Vector3(sc, sc * 1.3, sc)));
        }
      }
      scatter(scene, plantB, reeds); // (de wind zit al in het materiaal van plantB)
    }
    if (rocksA) scatter(scene, rocksA, spots(rand, 25, { regions: green, scaleMin: 0.8, scaleMax: 1.5 }), { shadows: true });
    if (rocksB) scatter(scene, rocksB, spots(rand, 25, { regions: green, scaleMin: 0.8, scaleMax: 1.5 }), { shadows: true });
    if (rocksDesA) scatter(scene, rocksDesA, spots(rand, 40, { regions: ['hoogland', 'schaduw'], scaleMin: 1, scaleMax: 2 }), { shadows: true });
    if (rocksDesB) scatter(scene, rocksDesB, spots(rand, 40, { regions: ['hoogland', 'schaduw'], scaleMin: 1, scaleMax: 2 }), { shadows: true });

    // Bolle wolken die langzaam voorbij drijven (8 vormen, steeds anders gedraaid en geschaald)
    this.cloudMat = createCloudMaterial();
    const cloudShapes = Array.from({ length: 8 }, () => puffyCloudGeometry(rand));
    this.cloudSpan = Math.max(170, BOUNDS.x + 60); // wolken drijven van -cloudSpan naar +cloudSpan (en beginnen dan opnieuw)
    const cloudCount = Math.round(this.cloudSpan / 5.5);
    for (let i = 0; i < cloudCount; i++) {
      const c = new THREE.Mesh(cloudShapes[i % cloudShapes.length], this.cloudMat);
      const s = 4 + rand() * 6;
      c.scale.set(s * (1 + rand() * 0.6), s * (0.8 + rand() * 0.4), s);
      c.rotation.y = rand() * Math.PI * 2;
      c.position.set((rand() - 0.5) * 2 * this.cloudSpan, 42 + rand() * 28, (rand() - 0.5) * 320);
      c.userData.noAO = true;
      scene.add(c);
      this.clouds.push({ mesh: c, speed: 0.6 + rand() * 1.2 });
    }

    // Dieren: welke en waar staat per level in levels.js
    const addAnimals = (gltf, count, homes, scale) => {
      if (!gltf) return;
      for (let i = 0; i < count; i++) {
        const home = homes[i % homes.length];
        const m = gltf.scene.clone();
        m.scale.setScalar(scale);
        m.traverse((c) => (c.castShadow = !!c.isMesh));
        this.animals.push(new Animal(scene, m, new THREE.Vector3(home[0] + (rand() - 0.5) * 6, 0, home[1] + (rand() - 0.5) * 6), 6, rand));
      }
    };
    const models = { duck: [duck, 0.9], dog: [dog, 1], bear: [bear, 1.6] };
    for (const [kind, homes, count] of LEVEL.animals) addAnimals(models[kind][0], count, homes, models[kind][1]);
  }

  /** Alle wolken een andere kleur geven (bijvoorbeeld paars in Omars kasteel). */
  tintClouds(color, opacity = 0.95) {
    if (!this.cloudMat) return;
    this.cloudMat.uniforms.tint.value.set(color);
    this.cloudMat.uniforms.opacity.value = opacity;
  }

  update(dt, time, playerPos, night = 0) {
    this.updateMotes(dt, time, playerPos, night);
    // 's Nachts zijn de wolken donker (anders gloeien ze wit in de donkere lucht)
    if (this.cloudMat) this.cloudMat.uniforms.cloudLight.value = THREE.MathUtils.lerp(1, 0.22, night);
    for (const c of this.clouds) {
      c.mesh.position.x += c.speed * dt;
      if (c.mesh.position.x > this.cloudSpan) c.mesh.position.x = -this.cloudSpan;
    }
    for (const a of this.animals) {
      if (a.mesh.position.distanceTo(playerPos) < 60) a.update(dt, time, playerPos);
    }
  }
}
