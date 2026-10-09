import * as THREE from 'three';
import { clone as cloneSkinned } from 'three/addons/utils/SkeletonUtils.js';
import { loadGLB } from './assets.js';
import { REGIONS } from './levels.js';

// ======================================================================
// Dorpelingen in Muntdorp: houten etalagepoppen die gewoon hun werk doen
// ======================================================================
// Ze komen uit de Universal Animation Library van Quaternius (CC0), net als de Zombiepop en de Ninjapop.
// Een boer die oogst, eentje die zaait, eentje die de plantjes water geeft, een houthakker,
// een wachter met een lantaarn en iemand die aan de telefoon hangt. Ze doen niks met jou: ze maken het dorp levendig.
// Plekken staan in het dorp zelf (zoals in levels.js), r.t() zet ze op de goede plek in de wereld.

const VILLAGERS = [
  // [animatie, x, z, kijkrichting (graden), kleur lijf, kleur gewrichten]
  ['Farm_Harvest', -17.5, 47, 90, 0xc8a46a, 0x6a8a3a],
  ['Farm_PlantSeed', -13, 50.5, 180, 0xb8c87a, 0x8a5a3a],
  ['Farm_Watering', -8.5, 46.5, 270, 0x9ab8d8, 0x3a5a8a],
  ['TreeChopping_Loop', -24, 74.6, 0, 0xd8a070, 0x5a3a2a],
  ['Idle_Lantern_Loop', 0, 68, 200, 0x8a7a9a, 0x3a2a4a],
  ['Idle_TalkingPhone_Loop', -19, 61.5, 120, 0xe0b0c0, 0x8a3a5a],
  ['Idle_FoldArms_Loop', -9, 58, 30, 0xa0c0a0, 0x3a6a3a],
];

// Dragers: ze lopen heen en weer door het dorp met een krat, een zak, een mand of een pompoen.
// [route (punten in het dorp), wat ze dragen, kleur lijf, kleur gewrichten]. Kom je in de weg staan, dan wachten ze en knikken ze gedag.
const WALKERS = [
  [[[-10, 62], [-14, 66], [-18, 64.5], [-16, 59.5], [-11, 60]], 'krat', 0xd8c8a0, 0x7a5a3a],
  [[[-13, 52], [-15.5, 57], [-12, 64], [-12, 69.5]], 'groente', 0xa8d888, 0x4a6a2a],
  [[[-20.5, 73.5], [-19.5, 70], [-17, 64], [-5, 63], [-3, 59.5]], 'hout', 0xe0b890, 0x6a3a2a],
  [[[2, 64], [6, 71], [2, 78], [-4, 72]], 'pompoen', 0xc8b0e0, 0x5a3a7a],
  [[[-6, 66], [-1, 61], [3, 58]], 'zak', 0xb0c8e0, 0x3a4a6a],
];
const WALK_SPEED = 1.15; // meter per seconde (past bij de loop-animatie)

/** Wat een drager vasthoudt (een simpel modelletje). */
function makeLoad(kind) {
  const g = new THREE.Group();
  const m = (color, extra = {}) => new THREE.MeshStandardMaterial({ color, roughness: 0.8, flatShading: true, ...extra });
  if (kind === 'krat' || kind === 'groente') {
    const crate = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.32, 0.36), m(0xb08050));
    g.add(crate);
    if (kind === 'groente') {
      for (let i = 0; i < 5; i++) {
        const veg = new THREE.Mesh(new THREE.IcosahedronGeometry(0.08, 0), m(i % 2 ? 0xff7a2a : 0x5ab83a));
        veg.position.set(-0.16 + i * 0.08, 0.2, (i % 2) * 0.08 - 0.04);
        g.add(veg);
      }
    }
  } else if (kind === 'hout') {
    for (let i = 0; i < 3; i++) {
      const log = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.07, 0.6, 7), m(0x7a5232));
      log.rotation.z = Math.PI / 2;
      log.position.set(0, (i === 2 ? 0.12 : 0), i === 2 ? 0 : i * 0.14 - 0.07);
      g.add(log);
    }
  } else if (kind === 'pompoen') {
    const p = new THREE.Mesh(new THREE.SphereGeometry(0.22, 10, 8), m(0xff8a1a));
    p.scale.y = 0.8;
    const stem = new THREE.Mesh(new THREE.CylinderGeometry(0.025, 0.03, 0.1, 5), m(0x4a7a2a));
    stem.position.y = 0.2;
    g.add(p, stem);
  } else {
    const sack = new THREE.Mesh(new THREE.SphereGeometry(0.24, 9, 7), m(0xd8c090));
    sack.scale.set(1, 1.15, 0.8);
    g.add(sack);
  }
  g.traverse((c) => (c.castShadow = !!c.isMesh));
  return g;
}

// Een akkertje met plantjes (bij de boeren), een boomstronk om op te hakken en een stapel hout
// (allemaal binnen het dorp: daar groeien geen bomen en ligt het pad niet)
const FIELD = { x: -13, z: 47, w: 6, d: 5 };
const STUMP = { x: -24, z: 76 };
const LOGS = { x: -21.5, z: 77.5 };
// Het Premiebord (bij het begin van Muntdorp, naast het pad)
const BOARD = { x: 0.5, z: 81, deg: 90 };

export class Villagers {
  constructor(scene, colliders) {
    this.list = [];
    this.scene = scene;
    const r = REGIONS[0];
    if (!r) return;
    // Je kunt niet door ze heen lopen
    for (const [, x, z] of VILLAGERS) {
      const [wx, wz] = r.t(x, z);
      colliders.push(new THREE.Box3(new THREE.Vector3(wx - 0.3, 0, wz - 0.3), new THREE.Vector3(wx + 0.3, 1.75, wz + 0.3)));
    }
    this.buildField(r);
    this.buildBoard(r, colliders);
    this.walkers = [];
    loadGLB('models/extra/pop.glb').then((gltf) => {
      for (const [anim, x, z, deg, body, joints] of VILLAGERS) {
        const clip = gltf.animations.find((c) => c.name === anim);
        if (!clip) continue;
        const model = cloneSkinned(gltf.scene);
        model.traverse((c) => {
          if (!c.isMesh) return;
          c.castShadow = true;
          c.frustumCulled = false;
          c.material = c.material.clone();
          c.material.color.set(c.material.name === 'M_Joints' ? joints : body);
        });
        // Even groot als de speler (1,75 m), voeten op de grond
        model.updateMatrixWorld(true);
        const box = new THREE.Box3().setFromObject(model);
        model.scale.setScalar(1.75 / (box.max.y - box.min.y));
        const holder = new THREE.Group();
        holder.add(model);
        const [wx, wz] = r.t(x, z);
        holder.position.set(wx, 0, wz);
        holder.rotation.y = THREE.MathUtils.degToRad(deg) + (r.flip ? Math.PI : 0);
        scene.add(holder);
        const mixer = new THREE.AnimationMixer(model);
        const action = mixer.clipAction(clip);
        action.play();
        action.time = Math.random() * clip.duration; // niet allemaal tegelijk
        this.list.push({ holder, mixer });
      }
      this.buildWalkers(gltf, r);
    }).catch(() => {});
  }

  /** Dragers die heen en weer door het dorp lopen (met de loop-met-iets-in-je-handen-animatie). */
  buildWalkers(gltf, r) {
    const carry = gltf.animations.find((c) => c.name === 'Walk_Carry_Loop');
    const nod = gltf.animations.find((c) => c.name === 'Yes');
    if (!carry) return;
    for (const [route, load, body, joints] of WALKERS) {
      const model = cloneSkinned(gltf.scene);
      model.traverse((c) => {
        if (!c.isMesh) return;
        c.castShadow = true;
        c.frustumCulled = false;
        c.material = c.material.clone();
        c.material.color.set(c.material.name === 'M_Joints' ? joints : body);
      });
      model.updateMatrixWorld(true);
      const box = new THREE.Box3().setFromObject(model);
      model.scale.setScalar(1.75 / (box.max.y - box.min.y));
      const holder = new THREE.Group();
      holder.add(model);
      const points = route.map(([x, z]) => {
        const [wx, wz] = r.t(x, z);
        return new THREE.Vector3(wx, 0, wz);
      });
      holder.position.copy(points[0]);
      this.scene.add(holder);
      const mixer = new THREE.AnimationMixer(model);
      const walk = mixer.clipAction(carry);
      walk.play();
      walk.time = Math.random() * carry.duration;
      const greet = nod ? mixer.clipAction(nod) : null;
      // Het ding dat hij draagt: tussen zijn handen (we rekenen uit waar die zitten in de loop-houding)
      mixer.update(0);
      model.updateMatrixWorld(true);
      const handR = model.getObjectByName('hand_r');
      const handL = model.getObjectByName('hand_l');
      const item = makeLoad(load);
      if (handR && handL) {
        const mid = handR.getWorldPosition(new THREE.Vector3()).add(handL.getWorldPosition(new THREE.Vector3())).multiplyScalar(0.5);
        handR.add(item);
        item.position.copy(handR.worldToLocal(mid));
        item.quaternion.copy(handR.getWorldQuaternion(new THREE.Quaternion()).invert().multiply(holder.getWorldQuaternion(new THREE.Quaternion())));
        item.scale.divideScalar(handR.getWorldScale(new THREE.Vector3()).x);
      }
      this.walkers.push({ holder, mixer, walk, greet, points, next: 1, dir: 1, loop: route.length > 4, wait: 0, greeting: false });
    }
  }

  /** Een drager een stukje verder laten lopen (of wachten als jij in de weg staat). */
  updateWalker(w, dt, playerPos) {
    const pos = w.holder.position;
    const goal = w.points[w.next];
    const to = goal.clone().sub(pos);
    const dist = to.length();
    // Sta jij vlak voor hem? Dan wacht hij even en knikt hij gedag
    const toPlayer = playerPos.clone().sub(pos).setY(0);
    const blocked = playerPos.y < 1.5 && toPlayer.length() < 1.6 && toPlayer.dot(to) > 0;
    if (blocked !== w.greeting && w.greet) {
      w.greeting = blocked;
      if (blocked) {
        w.walk.fadeOut(0.25);
        w.greet.reset().fadeIn(0.25).play();
      } else {
        w.greet.fadeOut(0.3);
        w.walk.reset().fadeIn(0.3).play();
      }
    }
    if (blocked) {
      // Kijk naar de speler
      const yaw = Math.atan2(toPlayer.x, toPlayer.z);
      w.holder.rotation.y += Math.atan2(Math.sin(yaw - w.holder.rotation.y), Math.cos(yaw - w.holder.rotation.y)) * Math.min(1, 4 * dt);
      return;
    }
    if (dist < 0.2) {
      // Volgende punt: rondjes lopen, of heen en terug
      if (w.loop) w.next = (w.next + 1) % w.points.length;
      else {
        if (w.next + w.dir >= w.points.length || w.next + w.dir < 0) w.dir = -w.dir;
        w.next += w.dir;
      }
      return;
    }
    pos.addScaledVector(to.divideScalar(dist), Math.min(dist, WALK_SPEED * dt));
    const yaw = Math.atan2(goal.x - pos.x, goal.z - pos.z);
    w.holder.rotation.y += Math.atan2(Math.sin(yaw - w.holder.rotation.y), Math.cos(yaw - w.holder.rotation.y)) * Math.min(1, 6 * dt);
  }

  /** Een bruin akkertje met rijen groene plantjes, en een stapel boomstammen. */
  buildField(r) {
    const [fx, fz] = r.t(FIELD.x, FIELD.z);
    const soil = new THREE.Mesh(new THREE.BoxGeometry(FIELD.w, 0.08, FIELD.d), new THREE.MeshStandardMaterial({ color: 0x5a3a22, roughness: 1 }));
    soil.position.set(fx, 0.04, fz);
    soil.receiveShadow = true;
    this.scene.add(soil);
    const plants = new THREE.InstancedMesh(new THREE.ConeGeometry(0.16, 0.45, 5), new THREE.MeshStandardMaterial({ color: 0x5aa83a, roughness: 0.8, flatShading: true }), 40);
    const m = new THREE.Matrix4();
    let n = 0;
    for (let row = 0; row < 4; row++) {
      for (let i = 0; i < 7; i++) {
        const s = 0.7 + Math.random() * 0.6;
        m.compose(new THREE.Vector3(fx - FIELD.w / 2 + 0.75 + i * 0.75, 0.25 * s, fz - FIELD.d / 2 + 0.8 + row * 1.15), new THREE.Quaternion(), new THREE.Vector3(s, s, s));
        plants.setMatrixAt(n++, m);
      }
    }
    plants.count = n;
    plants.castShadow = true;
    this.scene.add(plants);
    const [lx, lz] = r.t(LOGS.x, LOGS.z);
    const wood = new THREE.MeshStandardMaterial({ color: 0x7a5232, roughness: 0.9 });
    const [sx, sz] = r.t(STUMP.x, STUMP.z);
    const stump = new THREE.Mesh(new THREE.CylinderGeometry(0.35, 0.42, 0.5, 9), wood);
    stump.position.set(sx, 0.25, sz);
    stump.castShadow = true;
    this.scene.add(stump);
    for (let i = 0; i < 5; i++) {
      const log = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.22, 1.6, 8), wood);
      log.rotation.z = Math.PI / 2;
      log.position.set(lx, 0.22 + (i >= 3 ? 0.4 : 0), lz + (i % 3) * 0.46 - 0.46 + (i >= 3 ? 0.23 : 0));
      log.castShadow = true;
      this.scene.add(log);
    }
  }

  /** Het Premiebord: een houten bord met briefjes. Druk er op E om de premies te zien (main.js). */
  buildBoard(r, colliders) {
    const [x, z] = r.t(BOARD.x, BOARD.z);
    const g = new THREE.Group();
    g.position.set(x, 0, z);
    g.rotation.y = THREE.MathUtils.degToRad(BOARD.deg) + (r.flip ? Math.PI : 0);
    const wood = new THREE.MeshStandardMaterial({ color: 0x7a5232, roughness: 0.9 });
    const dark = new THREE.MeshStandardMaterial({ color: 0x4a3020, roughness: 0.9 });
    for (const sx of [-0.9, 0.9]) {
      const post = new THREE.Mesh(new THREE.BoxGeometry(0.14, 2.2, 0.14), dark);
      post.position.set(sx, 1.1, 0);
      post.castShadow = true;
      g.add(post);
    }
    const plank = new THREE.Mesh(new THREE.BoxGeometry(2, 1.1, 0.08), wood);
    plank.position.set(0, 1.45, 0);
    plank.castShadow = true;
    g.add(plank);
    const roof = new THREE.Mesh(new THREE.BoxGeometry(2.3, 0.1, 0.5), dark);
    roof.position.set(0, 2.15, 0);
    g.add(roof);
    // Briefjes (premies) in verschillende kleurtjes papier
    const papers = [0xfff4d6, 0xffe0a0, 0xf0f0ff];
    [[-0.55, 1.55, -0.05], [0.05, 1.4, 0.06], [0.6, 1.58, -0.04]].forEach(([px, py, rz], i) => {
      const paper = new THREE.Mesh(new THREE.PlaneGeometry(0.42, 0.55), new THREE.MeshStandardMaterial({ color: papers[i], roughness: 1, side: THREE.DoubleSide }));
      paper.position.set(px, py, 0.05);
      paper.rotation.z = rz;
      g.add(paper);
    });
    this.scene.add(g);
    colliders.push(new THREE.Box3(new THREE.Vector3(x - 1.1, 0, z - 1.1), new THREE.Vector3(x + 1.1, 2.2, z + 1.1)));
    this.board = { position: new THREE.Vector3(x, 0, z) };
  }

  /** Elke frame: alleen de dorpelingen bij jou in de buurt bewegen (scheelt rekenwerk). */
  update(dt, playerPos) {
    for (const v of this.list) {
      if (v.holder.position.distanceToSquared(playerPos) < 60 * 60) v.mixer.update(dt);
    }
    for (const w of this.walkers) {
      if (w.holder.position.distanceToSquared(playerPos) > 90 * 90) continue;
      this.updateWalker(w, dt, playerPos);
      w.mixer.update(dt);
    }
  }
}
