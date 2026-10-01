import * as THREE from 'three';
import { loadGLB } from './assets.js';
import { isFree, regionAt, seededRandom, GRACES, WORLD_HALF, VILLAGE_CENTER } from './world.js';

// Extra aankleding van de wereld met modellen uit de KayKit- en Kenney-pakketten:
// planten, stenen, grasplukjes, wolken, vlaggen bij de Plekken van Genade en rondscharrelende dieren.

/**
 * Zet heel veel kopieën van een model neer met InstancedMesh (één tekenopdracht per onderdeel = snel).
 * @param {Array<THREE.Matrix4>} transforms
 */
function scatter(scene, gltf, transforms, { shadows = false } = {}) {
  gltf.scene.updateMatrixWorld(true);
  gltf.scene.traverse((child) => {
    if (!child.isMesh || transforms.length === 0) return;
    const inst = new THREE.InstancedMesh(child.geometry, child.material, transforms.length);
    const m = new THREE.Matrix4();
    transforms.forEach((t, i) => inst.setMatrixAt(i, m.multiplyMatrices(t, child.matrixWorld)));
    inst.castShadow = shadows;
    inst.receiveShadow = true;
    scene.add(inst);
  });
}

/** Willekeurige plekken in de wereld (die vrij zijn, en eventueel in een bepaald gebied). */
function spots(rand, count, { regions = null, scaleMin = 1, scaleMax = 1, margin = 0 } = {}) {
  const list = [];
  for (let tries = 0; list.length < count && tries < count * 30; tries++) {
    const x = (rand() - 0.5) * (WORLD_HALF * 2 - 10);
    const z = (rand() - 0.5) * (WORLD_HALF * 2 - 10);
    if (regions && !regions.includes(regionAt(x, z))) continue;
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
    this.load();
  }

  async load() {
    const scene = this.scene;
    const rand = seededRandom(99);
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
    if (grass) scatter(scene, grass, spots(rand, 900, { regions: green, scaleMin: 1.4, scaleMax: 2.4 }));
    if (grassSmall) scatter(scene, grassSmall, spots(rand, 900, { regions: green, scaleMin: 1.4, scaleMax: 2.2 }));
    if (plantA) scatter(scene, plantA, spots(rand, 220, { regions: green, scaleMin: 0.8, scaleMax: 1.4 }));
    if (plantB) scatter(scene, plantB, spots(rand, 220, { regions: green, scaleMin: 0.8, scaleMax: 1.4 }));
    if (detail) scatter(scene, detail, spots(rand, 260, { regions: green, scaleMin: 1, scaleMax: 1.6 }));
    if (rocksA) scatter(scene, rocksA, spots(rand, 120, { regions: green, scaleMin: 0.8, scaleMax: 1.5 }), { shadows: true });
    if (rocksB) scatter(scene, rocksB, spots(rand, 120, { regions: green, scaleMin: 0.8, scaleMax: 1.5 }), { shadows: true });
    if (rocksDesA) scatter(scene, rocksDesA, spots(rand, 160, { regions: ['hoogland'], scaleMin: 1, scaleMax: 2 }), { shadows: true });
    if (rocksDesB) scatter(scene, rocksDesB, spots(rand, 160, { regions: ['hoogland'], scaleMin: 1, scaleMax: 2 }), { shadows: true });

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

    // Dieren: eenden en honden in de weide en het dorp, beren in het bos
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
    const v = VILLAGE_CENTER;
    addAnimals(duck, 6, [[-8, 30], [12, 40], [v.x + 6, v.z - 4]], 0.9);
    addAnimals(dog, 3, [[v.x, v.z + 4], [v.x - 5, v.z], [6, 22]], 1);
    addAnimals(bear, 4, [[-60, 50], [-90, -5], [-75, 70], [-105, 35]], 1.6);
  }

  update(dt, time, playerPos) {
    for (const c of this.clouds) {
      c.mesh.position.x += c.speed * dt;
      if (c.mesh.position.x > 160) c.mesh.position.x = -160;
    }
    for (const a of this.animals) {
      if (a.mesh.position.distanceTo(playerPos) < 60) a.update(dt, time, playerPos);
    }
  }
}
