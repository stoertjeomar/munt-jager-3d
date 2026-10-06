import * as THREE from 'three';
import { loadGLB } from './assets.js';
import { isFree, seededRandom, GRACES, BOUNDS, addWind } from './world.js';
import { LEVEL, LEVEL_INDEX } from './levels.js';

// Extra aankleding van de wereld met modellen uit de KayKit- en Kenney-pakketten:
// planten, stenen, grasplukjes, wolken, vlaggen bij de Plekken van Genade en rondscharrelende dieren.

/**
 * Zet heel veel kopieën van een model neer met InstancedMesh (één tekenopdracht per onderdeel = snel).
 * @param {Array<THREE.Matrix4>} transforms
 */
function scatter(scene, gltf, transforms, { shadows = false, wind = 0 } = {}) {
  gltf.scene.updateMatrixWorld(true);
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
      scene.add(inst);
    }
  });
}

/** Willekeurige plekken in de wereld (die vrij zijn, en eventueel in een bepaald gebied). */
function spots(rand, count, { regions = null, scaleMin = 1, scaleMax = 1, margin = 0 } = {}) {
  const list = [];
  if (regions && !regions.includes(LEVEL.theme)) return list;
  for (let tries = 0; list.length < count && tries < count * 30; tries++) {
    const x = (rand() - 0.5) * (BOUNDS.x * 2 - 4);
    const z = (rand() - 0.5) * (BOUNDS.z * 2 - 4);
    if (!isFree(x, z, margin)) continue;
    const s = scaleMin + rand() * (scaleMax - scaleMin);
    list.push(new THREE.Matrix4().compose(new THREE.Vector3(x, 0, z), new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), rand() * Math.PI * 2), new THREE.Vector3(s, s, s)));
  }
  return list;
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
    const rand = seededRandom(99 + LEVEL_INDEX * 31);
    const [grass, grassSmall, plantA, plantB, rocksA, rocksB, rocksDesA, rocksDesB, detail, cloud, flag, duck, dog, bear] = await Promise.all(
      [
        'models/kenney/grass.glb', 'models/kenney/grass-small.glb',
        'models/kaykit/plantA_forest.glb', 'models/kaykit/plantB_forest.glb',
        'models/kaykit/rocksA_forest.glb', 'models/kaykit/rocksB_forest.glb',
        'models/kaykit/rocksA_desert.glb', 'models/kaykit/rocksB_desert.glb',
        'models/kaykit/detail_forest.glb', 'models/kenney/cloud.glb', 'models/kaykit/flag_teamYellow.glb',
        'models/kaykit/character_duck.glb', 'models/kaykit/character_dog.glb', 'models/kaykit/character_bear.glb',
      ].map((url) => loadGLB(url).catch(() => null))
    );

    const green = ['weide', 'woud'];
    if (grass) scatter(scene, grass, spots(rand, 900, { regions: green, scaleMin: 1.4, scaleMax: 2.4 }), { wind: 0.35 });
    if (grassSmall) scatter(scene, grassSmall, spots(rand, 900, { regions: green, scaleMin: 1.4, scaleMax: 2.2 }), { wind: 0.35 });
    if (plantA) scatter(scene, plantA, spots(rand, 90, { regions: green, scaleMin: 0.9, scaleMax: 1.5 }), { wind: 0.25 });
    if (plantB) scatter(scene, plantB, spots(rand, 90, { regions: green, scaleMin: 0.8, scaleMax: 1.4 }), { wind: 0.25 });
    if (detail) scatter(scene, detail, spots(rand, 110, { regions: green, scaleMin: 1, scaleMax: 1.6 }));
    if (rocksA) scatter(scene, rocksA, spots(rand, 25, { regions: green, scaleMin: 0.8, scaleMax: 1.5 }), { shadows: true });
    if (rocksB) scatter(scene, rocksB, spots(rand, 25, { regions: green, scaleMin: 0.8, scaleMax: 1.5 }), { shadows: true });
    if (rocksDesA) scatter(scene, rocksDesA, spots(rand, 50, { regions: ['hoogland'], scaleMin: 1, scaleMax: 2 }), { shadows: true });
    if (rocksDesB) scatter(scene, rocksDesB, spots(rand, 50, { regions: ['hoogland'], scaleMin: 1, scaleMax: 2 }), { shadows: true });

    // Vlaggen bij elke Plek van Genade
    if (flag) {
      for (const g of GRACES) {
        const f = flag.scene.clone();
        f.scale.setScalar(1.6);
        f.position.copy(g.position).add(new THREE.Vector3(1.8, 0, -1.2));
        f.traverse((c) => (c.castShadow = !!c.isMesh));
        scene.add(f);
      }
    }

    // Wolken die langzaam voorbij drijven
    if (cloud) {
      for (let i = 0; i < 28; i++) {
        const c = cloud.scene.clone();
        const s = 6 + rand() * 10;
        c.scale.set(s * (1.2 + rand()), s * 0.5, s);
        c.position.set((rand() - 0.5) * 300, 38 + rand() * 25, (rand() - 0.5) * 300);
        c.traverse((m) => {
          if (m.isMesh) m.material = new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.92, fog: false });
        });
        scene.add(c);
        this.clouds.push({ mesh: c, speed: 0.6 + rand() * 1.2 });
      }
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

  update(dt, time, playerPos, night = 0) {
    this.updateMotes(dt, time, playerPos, night);
    for (const c of this.clouds) {
      c.mesh.position.x += c.speed * dt;
      if (c.mesh.position.x > 160) c.mesh.position.x = -160;
    }
    for (const a of this.animals) {
      if (a.mesh.position.distanceTo(playerPos) < 60) a.update(dt, time, playerPos);
    }
  }
}
