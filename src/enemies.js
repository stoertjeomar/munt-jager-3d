import * as THREE from 'three';
import { play } from './audio.js';
import { loadGLB } from './assets.js';
import { clone as cloneSkinned } from 'three/addons/utils/SkeletonUtils.js';
import { LEVEL, LEVEL_INDEX } from './levels.js';
import { seededRandom } from './world.js';

// Soorten vijanden — speel met deze getallen om ze makkelijker of moeilijker te maken!
//   hp            = levenspunten
//   radius/height = hoe groot ze zijn
//   patrolSpeed / chaseSpeed = loopsnelheid (heen en weer / achter je aan)
//   sight         = binnen deze afstand komen ze achter je aan
//   knockback     = hoe ver ze wegvliegen als je ze raakt (0 = helemaal niet)
//   damage        = schade als ze je raken (de golem: met zijn schokgolf)
//   stompable     = kun je erop springen om ze te verslaan?
//   runes         = hoeveel munten je krijgt als je ze verslaat
//   model         = 3D-model (.glb) in plaats van een zelfgebouwd poppetje
//   contactDamage = schade als je ze alleen aanraakt (noContact = aanraken doet geen pijn)
export const ENEMY_TYPES = {
  zombie: {
    name: 'Zombie', hp: 90, radius: 0.5, height: 1.7, color: 0x86a86b, model: 'models/zombie.glb', skinned: true,
    patrolSpeed: 1, chaseSpeed: 3.2, sight: 11, knockback: 0.8, damage: 22, noContact: true, stompable: false, runes: 32,
  },
  spierbonk: {
    name: 'Spierbonk', hp: 200, radius: 0.8, height: 2.6, color: 0xe8c890, model: 'models/bosses/buffman.glb',
    patrolSpeed: 1.3, chaseSpeed: 2.6, sight: 13, knockback: 0.3, damage: 34, contactDamage: 14, stompable: false, runes: 90,
  },
  mecha: {
    name: 'Mecha-Wachter', hp: 320, radius: 0.9, height: 3.2, color: 0xe8eef5, model: 'models/bosses/gundam.glb',
    patrolSpeed: 1, chaseSpeed: 1.6, sight: 22, knockback: 0.1, damage: 26, contactDamage: 12, stompable: false, runes: 140,
  },
  slijmpje: {
    name: 'Slijmpje', hp: 30, radius: 0.4, height: 0.65, color: 0x6fd36a,
    patrolSpeed: 1.5, chaseSpeed: 2.8, sight: 7, knockback: 1.3, damage: 10, stompable: true, runes: 6,
  },
  slijmbal: {
    name: 'Slijmbal', hp: 60, radius: 0.6, height: 1.0, color: 0xd64545,
    patrolSpeed: 2, chaseSpeed: 3.8, sight: 8, knockback: 1, damage: 16, stompable: true, runes: 14,
  },
  spook: {
    name: 'Spook', hp: 80, radius: 0.5, height: 1.1, color: 0xa98bff, flies: true,
    patrolSpeed: 1.8, chaseSpeed: 4.3, sight: 10, knockback: 1.2, damage: 18, stompable: false, runes: 28,
  },
  golem: {
    name: 'Rotsgolem', hp: 260, radius: 0.9, height: 2.0, color: 0x8a8f99,
    patrolSpeed: 1.1, chaseSpeed: 2.3, sight: 9, knockback: 0.15, damage: 30, contactDamage: 15, stompable: false, runes: 80,
  },
};

// Verder dan dit van huis geeft een vijand het op en loopt hij terug naar huis.
// Pas als hij weer thuis is, let hij weer op jou (anders staat hij te trillen bij een onzichtbare muur).
const LEASH = 20;
const ACTIVE_RANGE = 70; // vijanden verder weg dan dit staan stil (scheelt rekenwerk)
const STUCK_TIME = 0.6; // zo lang vastzitten, en dan probeert een vijand iets anders

/**
 * In welk blok staat een rondje (midden x,z, straal r, van hoogte y tot y+h)? Geeft het blok terug, of null.
 * Hoeken van blokken tellen als rond: dan glij je er makkelijk langs.
 */
function blockAt(x, z, r, y, h, colliders) {
  for (const b of colliders) {
    if (b.min.y > y + h || b.max.y < y + 0.05) continue; // boven of onder ons
    const cx = THREE.MathUtils.clamp(x, b.min.x, b.max.x); // dichtstbijzijnde punt van het blok
    const cz = THREE.MathUtils.clamp(z, b.min.z, b.max.z);
    if ((x - cx) ** 2 + (z - cz) ** 2 < r * r) return b;
  }
  return null;
}

// Waar de vijanden lopen: dat staat per level in levels.js (spawns = [soort, aantal]).
// Ze worden langs het pad verdeeld: makkelijke vijanden vooraan, sterke vijanden vlak voor de boss.
export function levelSpawns(level, seed = 7) {
  const rand = seededRandom(seed);
  const pts = level.path;
  const segs = pts.slice(1).map((p, i) => [pts[i], p, Math.hypot(p[0] - pts[i][0], p[1] - pts[i][1])]);
  const total = segs.reduce((n, s) => n + s[2], 0);
  const at = (t) => {
    let d = t * total;
    for (const [[ax, az], [bx, bz], len] of segs) {
      if (d <= len) return { x: ax + ((bx - ax) * d) / len, z: az + ((bz - az) * d) / len, dx: (bx - ax) / len, dz: (bz - az) / len };
      d -= len;
    }
    const [[ax, az], [bx, bz], len] = segs[segs.length - 1];
    return { x: bx, z: bz, dx: (bx - ax) / len, dz: (bz - az) / len };
  };
  const list = level.spawns.flatMap(([kind, n]) => Array.from({ length: n }, () => kind));
  list.sort((a, b) => ENEMY_TYPES[a].hp - ENEMY_TYPES[b].hp);
  const safe = level.checkpoints.map(([, , x, z]) => [x, z]);
  if (level.village) safe.push(level.village.center);
  return list.map((kind, i) => {
    for (let tries = 0; ; tries++) {
      const t = 0.12 + ((i + rand() * 0.8) / list.length) * 0.84;
      const p = at(t);
      const side = (rand() - 0.5) * 2 * Math.min(level.half.x - 6, 16);
      const x = THREE.MathUtils.clamp(p.x - p.dz * side, -level.half.x + 4, level.half.x - 4);
      const z = p.z + p.dx * side;
      const tooClose = safe.some(([sx, sz]) => Math.hypot(x - sx, z - sz) < (level.village && sx === level.village.center[0] ? 22 : 10));
      if (tooClose && tries < 20) continue;
      const a = rand() * Math.PI * 2;
      return [kind, x, z, x + Math.sin(a) * 4, z + Math.cos(a) * 4];
    }
  });
}
export const SPAWNS = levelSpawns(LEVEL, 7 + LEVEL_INDEX);

// Golem-aanval: opladen en dan op de grond slaan
const SLAM_RANGE = 2.6; // binnen deze afstand begint hij op te laden
const SLAM_RADIUS = 3.2; // zo ver reikt de schokgolf
const WINDUP_TIME = 0.8;
const RECOVER_TIME = 0.7;
const SLAM_COOLDOWN = 1.6;

const DEATH_TIME = 0.45;
const SPAWN_TIME = 0.5; // zo lang duurt het "opploppen" als een vijand (terug)komt
const WHITE = new THREE.Color(0xffffff);

function mat(color, extra = {}) {
  return new THREE.MeshStandardMaterial({ color, roughness: 0.5, emissive: 0xffffff, emissiveIntensity: 0, ...extra });
}

function addEyes(parent, { spread, y, z, size, angry = false, color = 0xffffff, pupil = 0x111111 }) {
  const eyeGeo = new THREE.SphereGeometry(size, 12, 12);
  const pupilGeo = new THREE.SphereGeometry(size * 0.5, 8, 8);
  const eyes = [];
  for (const side of [-1, 1]) {
    const eye = new THREE.Mesh(eyeGeo, new THREE.MeshStandardMaterial({ color, roughness: 0.25 }));
    eye.position.set(side * spread, y, z);
    const p = new THREE.Mesh(pupilGeo, new THREE.MeshStandardMaterial({ color: pupil, roughness: 0.2 }));
    p.position.z = size * 0.65;
    eye.add(p);
    // Klein glimlichtje in de pupil: dan lijken de ogen levend
    const glint = new THREE.Mesh(new THREE.SphereGeometry(size * 0.16, 6, 6), new THREE.MeshBasicMaterial({ color: 0xffffff }));
    glint.position.set(size * 0.15, size * 0.18, size * 0.42);
    p.add(glint);
    parent.add(eye);
    eyes.push({ eye, pupil: p, size });
    if (angry) {
      const brow = new THREE.Mesh(new THREE.BoxGeometry(size * 1.9, size * 0.4, size * 0.4), new THREE.MeshStandardMaterial({ color: 0x111111 }));
      brow.position.set(side * spread, y + size * 1.35, z + size * 0.3);
      brow.rotation.z = side * 0.45; // schuin naar binnen = boos
      parent.add(brow);
    }
  }
  return eyes;
}

// ---------- Modellen ----------

export function buildSlime(type, angry) {
  const body = new THREE.Group(); // stuitert en squasht
  // Glanzende gelei: doorzichtig, met een laklaagje en een beetje eigen gloed
  const bodyMat = new THREE.MeshPhysicalMaterial({
    color: type.color, roughness: 0.18, clearcoat: 1, clearcoatRoughness: 0.08, sheen: 0.6, sheenColor: new THREE.Color(0xffffff),
    transparent: true, opacity: 0.84, emissive: type.color, emissiveIntensity: 0.12,
  });
  const ry = type.height / 2 / type.radius;
  const blob = new THREE.Mesh(new THREE.SphereGeometry(type.radius, 28, 20), bodyMat);
  blob.scale.y = ry;
  blob.castShadow = true;
  // Donkere kern binnenin (zie je door de gelei heen) met een paar luchtbelletjes
  const core = new THREE.Mesh(new THREE.SphereGeometry(type.radius * 0.55, 16, 12), new THREE.MeshStandardMaterial({ color: new THREE.Color(type.color).multiplyScalar(0.45), roughness: 0.6 }));
  core.scale.y = ry;
  core.position.y = -type.height * 0.08;
  body.add(core, blob);
  const bubbleMat = new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.35 });
  for (let i = 0; i < 3; i++) {
    const b = new THREE.Mesh(new THREE.SphereGeometry(type.radius * (0.06 + i * 0.025), 6, 6), bubbleMat);
    b.position.set((i - 1) * type.radius * 0.35, -type.height * 0.15 + i * 0.05, type.radius * 0.2);
    body.add(b);
  }
  // glimmend lichtje bovenop
  const shine = new THREE.Mesh(new THREE.SphereGeometry(type.radius * 0.18, 8, 8), new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.75 }));
  shine.scale.set(1.4, 0.7, 1);
  shine.position.set(-type.radius * 0.38, type.height * 0.3, type.radius * 0.45);
  body.add(shine);
  const eyes = addEyes(body, {
    spread: type.radius * 0.33, y: type.height * 0.12, z: type.radius * 0.83,
    size: type.radius * (angry ? 0.2 : 0.26), angry,
  });
  // Mondje
  const mouth = new THREE.Mesh(new THREE.TorusGeometry(type.radius * 0.12, type.radius * 0.03, 6, 12, Math.PI), new THREE.MeshBasicMaterial({ color: 0x1a1a1a }));
  mouth.position.set(0, -type.height * 0.08, type.radius * 0.93);
  mouth.rotation.z = angry ? 0 : Math.PI; // boos = mondhoeken omlaag, blij = glimlach
  body.add(mouth);
  return { body, materials: [bodyMat], lookEyes: eyes };
}

function buildGhost(type) {
  const body = new THREE.Group();
  const bodyMat = mat(type.color, { roughness: 0.2, transparent: true, opacity: 0.8, emissive: type.color, emissiveIntensity: 0.2 });
  const head = new THREE.Mesh(new THREE.SphereGeometry(type.radius, 22, 16, 0, Math.PI * 2, 0, Math.PI / 2), bodyMat);
  head.position.y = type.height * 0.55;
  const skirt = new THREE.Mesh(new THREE.CylinderGeometry(type.radius, type.radius * 0.75, type.height * 0.55, 22, 1, true), bodyMat);
  skirt.position.y = type.height * 0.275;
  // golvende onderrand: kleine kegeltjes (die wapperen, zie animateGhost)
  const tips = [];
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * Math.PI * 2;
    const tip = new THREE.Mesh(new THREE.ConeGeometry(type.radius * 0.2, type.height * 0.22, 6), bodyMat);
    tip.position.set(Math.sin(a) * type.radius * 0.7, -type.height * 0.08, Math.cos(a) * type.radius * 0.7);
    tip.rotation.x = Math.PI;
    body.add(tip);
    tips.push(tip);
  }
  body.add(head, skirt);
  // Spookachtige gloed eromheen
  // (alleen de rand gloeit: hoe schuiner je ertegenaan kijkt, hoe feller)
  const halo = new THREE.Mesh(
    new THREE.SphereGeometry(type.radius * 1.2, 20, 14),
    new THREE.ShaderMaterial({
      uniforms: { color: { value: new THREE.Color(type.color) }, strength: { value: 0.6 } },
      vertexShader: `varying vec3 vN; varying vec3 vV;
        void main() { vec4 mv = modelViewMatrix * vec4(position, 1.0); vN = normalize(normalMatrix * normal); vV = normalize(-mv.xyz); gl_Position = projectionMatrix * mv; }`,
      fragmentShader: `uniform vec3 color; uniform float strength; varying vec3 vN; varying vec3 vV;
        void main() { float f = pow(1.0 - abs(dot(normalize(vN), normalize(vV))), 3.0); gl_FragColor = vec4(color * 1.4, f * strength); }`,
      transparent: true, blending: THREE.AdditiveBlending, depthWrite: false,
    })
  );
  halo.position.y = type.height * 0.4;
  halo.scale.y = 1.2;
  body.add(halo);
  // donkere ogen en een "O"-mond
  const eyes = addEyes(body, { spread: type.radius * 0.35, y: type.height * 0.6, z: type.radius * 0.85, size: type.radius * 0.17, color: 0x1a1030, pupil: 0xffffff });
  const mouth = new THREE.Mesh(new THREE.TorusGeometry(type.radius * 0.12, type.radius * 0.04, 8, 16), new THREE.MeshBasicMaterial({ color: 0x1a1030 }));
  mouth.position.set(0, type.height * 0.38, type.radius * 0.93);
  body.add(mouth);
  return { body, materials: [bodyMat], lookEyes: eyes, tips, halo, mouth };
}

export function buildGolem(type) {
  const body = new THREE.Group();
  const stone = mat(type.color, { roughness: 0.9, flatShading: true });
  const dark = mat(0x5d626b, { roughness: 0.95, flatShading: true });
  const moss = mat(0x5f9e48, { roughness: 1, flatShading: true });
  const eyeMat = new THREE.MeshStandardMaterial({ color: 0xffa630, emissive: 0xff7b00, emissiveIntensity: 1.5 });
  const box = (w, h, d, m, x, y, z, parent = body) => {
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), m);
    mesh.position.set(x, y, z);
    mesh.castShadow = true;
    parent.add(mesh);
    return mesh;
  };
  // benen
  box(0.45, 0.55, 0.5, dark, -0.35, 0.28, 0);
  box(0.45, 0.55, 0.5, dark, 0.35, 0.28, 0);
  // lijf en hoofd
  box(1.5, 1.0, 0.95, stone, 0, 1.05, 0);
  box(1.3, 0.12, 0.85, moss, 0, 1.6, -0.02); // mos op de schouders
  box(0.7, 0.5, 0.6, stone, 0, 1.75, 0.12);
  const eyes = [];
  for (const side of [-1, 1]) eyes.push(box(0.14, 0.08, 0.04, eyeMat, side * 0.17, 1.8, 0.43));
  // armen aan schouder-draaipunten
  const arms = [];
  for (const side of [-1, 1]) {
    const shoulder = new THREE.Group();
    shoulder.position.set(side * 0.95, 1.4, 0);
    box(0.45, 1.1, 0.5, stone, 0, -0.5, 0, shoulder);
    box(0.55, 0.45, 0.6, dark, 0, -1.1, 0.02, shoulder); // vuist
    body.add(shoulder);
    arms.push(shoulder);
  }
  // Gloeiende scheuren in zijn lijf (zelfde vuur als zijn ogen)
  for (const [w, h, x, y, rz] of [[0.06, 0.55, -0.3, 1.05, 0.5], [0.05, 0.4, 0.25, 1.15, -0.4], [0.05, 0.3, 0.05, 0.8, 0.2]]) {
    const crack = box(w, h, 0.03, eyeMat, x, y, 0.48);
    crack.rotation.z = rz;
    crack.castShadow = false;
  }
  // Steentjes die om hem heen zweven
  const pebbles = [];
  for (let i = 0; i < 4; i++) {
    const p = new THREE.Mesh(new THREE.DodecahedronGeometry(0.1 + (i % 2) * 0.05, 0), dark);
    p.castShadow = true;
    body.add(p);
    pebbles.push(p);
  }
  return { body, materials: [stone, dark, moss], eyes, eyeMat, arms, pebbles };
}

// ---------- Levensbalk boven de vijand ----------

function buildHealthBar(width) {
  const bar = new THREE.Group();
  const bg = new THREE.Mesh(new THREE.PlaneGeometry(width + 0.06, 0.16), new THREE.MeshBasicMaterial({ color: 0x111111, transparent: true, opacity: 0.7, toneMapped: false }));
  const fgGeo = new THREE.PlaneGeometry(width, 0.1);
  fgGeo.translate(width / 2, 0, 0); // linkerkant vast, zodat hij van rechts naar links krimpt
  const fg = new THREE.Mesh(fgGeo, new THREE.MeshBasicMaterial({ color: 0x5be36b, toneMapped: false }));
  fg.position.set(-width / 2, 0, 0.01);
  bar.add(bg, fg);
  bar.renderOrder = 8;
  return { bar, fg };
}

class Enemy {
  constructor(scene, typeKey, [x1, z1, x2, z2]) {
    this.typeKey = typeKey;
    this.type = ENEMY_TYPES[typeKey];
    const type = this.type;
    this.pointA = new THREE.Vector3(x1, 0, z1);
    this.pointB = new THREE.Vector3(x2, 0, z2);
    this.home = this.pointA.clone().lerp(this.pointB, 0.5);

    this.mesh = new THREE.Group();
    let model;
    if (type.model) model = { body: new THREE.Group(), materials: [] };
    else if (typeKey === 'spook') model = buildGhost(type);
    else if (typeKey === 'golem') model = buildGolem(type);
    else model = buildSlime(type, typeKey === 'slijmbal');
    this.model = model;
    this.body = model.body;
    this.baseGlow = model.materials.map((m) => ({ color: m.emissive.clone(), intensity: m.emissiveIntensity }));
    this.mesh.add(this.body);
    if (type.model) this.loadModel(scene);

    const { bar, fg } = buildHealthBar(Math.max(0.7, type.radius * 1.4));
    this.healthBar = bar;
    this.healthFg = fg;
    bar.position.y = type.height + 0.45;
    this.mesh.add(bar);

    scene.add(this.mesh);
    this.velocity = new THREE.Vector3();
    this.knockback = new THREE.Vector3();
    this.steerDir = new THREE.Vector3();
    this.nearBlocks = []; // blokken vlakbij (voor het vooruitkijken)
    this.patrolChecked = false; // zijn de patrouille-punten al nagekeken? (zie fitPatrol)
    this.reset();
  }

  /** Een 3D-model laden (zombie, Spierbonk, Mecha) en even groot maken als in ENEMY_TYPES staat. */
  loadModel(scene) {
    const type = this.type;
    loadGLB(type.model).then((gltf) => {
      const obj = type.skinned ? cloneSkinned(gltf.scene) : gltf.scene.clone(true);
      obj.updateMatrixWorld(true);
      const box = new THREE.Box3().setFromObject(obj);
      const s = type.height / (box.max.y - box.min.y);
      const center = box.getCenter(new THREE.Vector3());
      obj.scale.multiplyScalar(s);
      obj.position.set(-center.x * s, -box.min.y * s, -center.z * s);
      const materials = [];
      obj.traverse((c) => {
        if (!c.isMesh) return;
        c.castShadow = true;
        if (c.isSkinnedMesh) c.frustumCulled = false;
        c.material = Array.isArray(c.material) ? c.material.map((m) => m.clone()) : c.material.clone();
        materials.push(...(Array.isArray(c.material) ? c.material : [c.material]));
      });
      this.body.add(obj);
      this.model.materials = materials.filter((m) => m.emissive);
      this.baseGlow = this.model.materials.map((m) => ({ color: m.emissive.clone(), intensity: m.emissiveIntensity }));
      if (gltf.animations.length) {
        this.mixer = new THREE.AnimationMixer(obj);
        this.actions = {};
        for (const clip of gltf.animations) this.actions[clip.name] = this.mixer.clipAction(clip);
        this.playAnim('Idle');
      }
      if (this.typeKey === 'mecha') {
        // Rode richtstraal voordat hij schiet
        this.laser = new THREE.Line(
          new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(), new THREE.Vector3()]),
          new THREE.LineBasicMaterial({ color: 0xff2a2a, transparent: true, opacity: 0.8, toneMapped: false })
        );
        this.laser.visible = false;
        this.laser.frustumCulled = false;
        scene.add(this.laser);
      }
    });
  }

  /** Animatie afspelen (alleen modellen met animaties, zoals de zombie). */
  playAnim(name, once = false) {
    if (!this.actions?.[name] || (this.currentAnim === name && !once)) return;
    const next = this.actions[name];
    next.reset();
    next.setLoop(once ? THREE.LoopOnce : THREE.LoopRepeat, once ? 1 : Infinity);
    next.clampWhenFinished = once;
    next.fadeIn(0.15).play();
    if (this.currentAction && this.currentAction !== next) this.currentAction.fadeOut(0.15);
    this.currentAction = next;
    this.currentAnim = name;
  }

  get position() {
    return this.mesh.position;
  }

  get alive() {
    return this.hp > 0;
  }

  /** Midden van het lichaam (voor effecten). */
  get center() {
    return this.position.clone().setY(this.position.y + this.type.height * 0.5);
  }

  reset() {
    this.hp = this.type.hp;
    this.dying = 0;
    this.flash = 0;
    this.lastSwingId = -1;
    this.goingToB = true;
    this.chasing = false;
    this.returning = false; // opgegeven en op weg naar huis
    this.closeBy = false; // vlak bij de speler (dan staat hij stil)
    this.stuckT = 0; // hoe lang zit hij al vast?
    this.avoidT = 0; // zo lang blijft hij nog om iets heen lopen
    this.avoidSide = 0; // om iets heen: links (1) of rechts (-1)
    this.state = 'walk'; // golem: walk / windup / recover, andere soorten hebben hun eigen aanvallen
    this.attackCooldown = 1;
    this.anim = 0; // > 0: een eenmalige animatie (zoals "geraakt") speelt nog
    if (this.laser) this.laser.visible = false;
    if (this.mixer) {
      this.currentAnim = null;
      this.playAnim('Idle');
    }
    this.stateTimer = 0;
    this.slamCooldown = 0;
    this.position.copy(this.pointA);
    if (this.type.flies) this.position.y = 1.2;
    this.knockback.set(0, 0, 0);
    this.mesh.visible = true;
    this.mesh.scale.setScalar(1);
    this.spawnT = SPAWN_TIME;
    this.punch = 0;
    this.blinkTimer = 1 + Math.random() * 3;
    this.mesh.rotation.set(0, 0, 0);
    this.healthBar.visible = false;
    this.phase = Math.random() * Math.PI * 2;
    this.gait = 0; // hoe ver de loop-animatie is (wiegen, springen)
    this.setFlash(0);
  }

  /** Wit oplichten na een klap (amount > 0), of terug naar de normale kleur. */
  setFlash(amount) {
    this.model.materials.forEach((m, i) => {
      const base = this.baseGlow[i];
      m.emissive.copy(amount > 0 ? WHITE : base.color);
      m.emissiveIntensity = amount > 0 ? 0.9 : base.intensity;
    });
  }

  /**
   * Geraakt door een wapen. Geeft { damage, killed } terug, of null als dit niet telde.
   * @param {THREE.Vector3} from  positie van de aanvaller
   */
  hit(from, swingId, damage = 1) {
    if (!this.alive || this.lastSwingId === swingId) return null;
    this.lastSwingId = swingId;
    this.returning = false; // geraakt? dan geeft hij het niet op
    this.hp = Math.max(0, this.hp - damage);
    this.flash = 0.12;
    this.punch = 1; // "boing": even platgedrukt
    this.healthBar.visible = true;

    const away = this.position.clone().sub(from).setY(0);
    if (away.lengthSq() < 1e-6) away.set(0, 0, 1);
    this.knockback.copy(away.normalize().multiplyScalar((this.hp > 0 ? 9 : 6) * this.type.knockback));

    const killed = this.hp <= 0;
    if (killed) this.die();
    else if (this.mixer && this.state === 'walk') {
      this.playAnim('HitReact', true);
      this.anim = 0.5;
    }
    return { damage, killed };
  }

  /** Erop gesprongen: meteen verslagen (alleen als dat kan bij deze soort). */
  stomp() {
    if (!this.alive) return;
    this.hp = 0;
    this.knockback.set(0, 0, 0);
    this.die();
  }

  die() {
    this.dying = this.mixer ? 1.3 : DEATH_TIME;
    if (this.mixer) this.playAnim('Death', true);
    if (this.laser) this.laser.visible = false;
    this.flash = 0.12;
    this.healthBar.visible = false;
    this.state = 'walk';
  }

  /**
   * @param {object} ctx { time, player, colliders, bounds, camera, effects, onSlam }
   */
  update(dt, ctx) {
    const type = this.type;
    // De eerste keer: kijken of de patrouille-punten niet in een boom, steen of muur liggen (nu bestaan alle blokken)
    if (!this.patrolChecked) this.fitPatrol(ctx.colliders, ctx.bounds);
    this.flash = Math.max(0, this.flash - dt);
    this.setFlash(this.flash);
    this.healthBar.quaternion.copy(ctx.camera.quaternion); // altijd naar de camera gericht
    this.healthFg.scale.x = Math.max(0.001, this.hp / type.hp);
    this.healthFg.material.color.setHSL((this.hp / type.hp) * 0.33, 0.9, 0.45); // groen → rood

    // Doodgaan: plat worden, ronddraaien en verdwijnen
    if (this.dying > 0 && this.mixer) {
      // Zombie: doodgaan-animatie, en daarna wegzakken in de grond
      this.dying -= dt;
      this.mixer.update(dt);
      this.position.addScaledVector(this.knockback, dt);
      this.knockback.multiplyScalar(Math.exp(-8 * dt));
      this.pushOutOfBlocks(ctx.colliders); // niet in een boom wegglijden
      if (this.dying < 0.4) this.position.y -= dt * 2;
      if (this.dying <= 0) this.mesh.visible = false;
      return;
    }
    if (this.dying > 0) {
      this.dying -= dt;
      const t = Math.max(0, this.dying / DEATH_TIME);
      this.mesh.scale.set(1 + (1 - t) * 0.6, t, 1 + (1 - t) * 0.6);
      this.mesh.rotation.y += dt * 12;
      this.position.addScaledVector(this.knockback, dt);
      this.knockback.multiplyScalar(Math.exp(-8 * dt));
      this.pushOutOfBlocks(ctx.colliders);
      if (this.dying <= 0) this.mesh.visible = false;
      return;
    }
    if (!this.alive) return;
    if (this.position.distanceTo(ctx.player.position) > ACTIVE_RANGE) return;
    this.animateLife(dt, ctx);

    const playerPos = ctx.player.position;
    const toPlayer = playerPos.clone().sub(this.position);
    const flatToPlayer = toPlayer.clone().setY(0);
    const distToPlayer = flatToPlayer.length();
    const distFromHome = this.position.clone().setY(0).distanceTo(this.home);
    const giveUp = this.summoned ? 40 : LEASH; // opgeroepen slijmpjes lopen door de hele boss-arena achter je aan
    // Niet achter je aan als je hoog op een blok staat (maar wel als je alleen even springt)
    const reachable = type.flies || playerPos.y < this.position.y + 2.5 || (this.chasing && !ctx.player.onGround);
    if (this.returning && distFromHome < 3) this.returning = false; // weer thuis
    if (this.chasing) {
      // Al achter je aan? Dan pas stoppen als je echt ver weg bent (zo trilt hij niet heen en weer op één plek)
      this.chasing = ctx.player.alive && reachable && distToPlayer < type.sight * 1.5 && distFromHome < giveUp;
    } else {
      this.chasing = !this.returning && ctx.player.alive && reachable && distToPlayer < type.sight && distFromHome < giveUp;
    }
    if (!this.chasing && distFromHome >= giveUp) this.returning = true; // te ver weg: opgeven en terug naar huis

    // ---------- Eigen aanvallen van de nieuwe vijanden ----------
    if (this.typeKey === 'zombie' || this.typeKey === 'spierbonk' || this.typeKey === 'mecha') {
      this.attackCooldown -= dt;
      if (this.specialAttack(dt, ctx, distToPlayer, flatToPlayer)) {
        // Terugstoot meteen (niet bewaren tot na de aanval), en niet in muren of buiten het level
        this.position.addScaledVector(this.knockback, dt);
        this.knockback.multiplyScalar(Math.exp(-8 * dt));
        this.pushOutOfBlocks(ctx.colliders);
        this.clampToBounds(ctx.bounds);
        this.mixer?.update(dt);
        return;
      }
    }

    // ---------- Golem: opladen en slaan ----------
    if (this.typeKey === 'golem') {
      this.slamCooldown -= dt;
      if (this.state === 'walk' && this.chasing && distToPlayer < SLAM_RANGE && this.slamCooldown <= 0) {
        this.state = 'windup';
        this.stateTimer = WINDUP_TIME;
        play('charge');
      }
      if (this.state !== 'walk') {
        this.stateTimer -= dt;
        this.animateGolem(dt, ctx.time);
        this.position.addScaledVector(this.knockback, dt);
        this.knockback.multiplyScalar(Math.exp(-8 * dt));
        this.pushOutOfBlocks(ctx.colliders);
        this.clampToBounds(ctx.bounds);
        if (this.state === 'windup' && this.stateTimer <= 0) {
          this.state = 'recover';
          this.stateTimer = RECOVER_TIME;
          this.slamCooldown = SLAM_COOLDOWN;
          ctx.onSlam(this, SLAM_RADIUS, this.type.damage);
        } else if (this.state === 'recover' && this.stateTimer <= 0) {
          this.state = 'walk';
        }
        return;
      }
    }

    // ---------- Waar wil ik heen? ----------
    let dir;
    let speed;
    let reach; // hoe ver weg is waar ik heen loop? (zo ver hoef ik maar vooruit te kijken)
    let steerable = true; // mag hij om dingen heen lopen?
    if (this.chasing) {
      dir = type.flies ? toPlayer.clone().add(new THREE.Vector3(0, 0.6, 0)) : flatToPlayer.clone();
      speed = type.chaseSpeed;
      reach = Math.max(0.3, distToPlayer - type.radius - 0.3);
      if (this.typeKey === 'mecha') {
        // De Mecha schiet liever van een afstandje
        if (distToPlayer < 8) {
          dir.negate();
          reach = 3;
        } else if (distToPlayer < 13) speed = 0;
      }
      if (!type.flies) {
        // Niet in de speler kruipen (met een beetje speling, anders wiebelt hij tussen lopen en stilstaan)
        this.closeBy = distToPlayer < type.radius + (this.closeBy ? 0.5 : 0.35);
        if (this.closeBy) speed = 0;
        // Sta je bovenop een blok? Dan wacht hij eronder, in plaats van eromheen te blijven rennen
        if (playerPos.y > 0.3) {
          const under = blockAt(playerPos.x, playerPos.z, 0.3, this.position.y, type.height, ctx.colliders);
          if (under && blockAt(this.position.x, this.position.z, type.radius + 1.5, this.position.y, type.height, [under])) steerable = false;
        }
      }
    } else {
      const goal = this.goingToB ? this.pointB : this.pointA;
      dir = goal.clone().sub(this.position);
      if (type.flies) dir.y = 1.2 - this.position.y;
      else dir.y = 0;
      reach = Math.hypot(dir.x, dir.z);
      if (reach < 0.3) this.goingToB = !this.goingToB;
      speed = this.returning ? type.patrolSpeed * 1.6 : type.patrolSpeed; // op weg naar huis loopt hij wat sneller
      if (reach < 0.3 && this.pointA.distanceToSquared(this.pointB) < 0.01) speed = 0; // geen ruimte om heen en weer te lopen: op wacht staan
    }
    if (dir.lengthSq() > 1e-6) dir.normalize();

    // ---------- Om bomen, stenen en muren heen lopen ----------
    let steered = false;
    const flat = Math.hypot(dir.x, dir.z);
    if (speed > 0 && steerable && flat > 1e-3) {
      const want = this.steerDir.set(dir.x / flat, 0, dir.z / flat);
      steered = this.steer(want, Math.min(type.radius + 1.2, reach), ctx, dt);
      dir.x = want.x * flat;
      dir.z = want.z * flat;
    }

    // ---------- Bewegen (plus terugstoot van een klap) ----------
    const beforeX = this.position.x;
    const beforeZ = this.position.z;
    this.velocity.copy(dir).multiplyScalar(speed).add(this.knockback);
    this.knockback.multiplyScalar(Math.exp(-8 * dt));
    this.position.addScaledVector(this.velocity, dt);

    if (type.flies) this.position.y = Math.max(0.4, this.position.y); // zweven, maar niet door de grond
    else this.position.y = 0;
    this.pushOutOfBlocks(ctx.colliders); // niemand loopt (of zweeft) door muren, bomen en stenen
    this.clampToBounds(ctx.bounds);

    // ---------- Vast? ----------
    // Hij wil lopen maar komt bijna niet vooruit: dan de andere kant om proberen (of naar zijn andere patrouille-punt)
    const moved = Math.hypot(this.position.x - beforeX, this.position.z - beforeZ);
    if (speed > 0 && steerable && moved < speed * dt * 0.3) this.stuckT += dt;
    else this.stuckT = Math.max(0, this.stuckT - dt);
    if (this.stuckT > STUCK_TIME) {
      this.stuckT = 0;
      if (this.chasing || this.returning) {
        this.avoidSide = -(this.avoidSide || 1);
        this.avoidT = 1.2;
      } else this.goingToB = !this.goingToB;
    }

    // ---------- Draaien naar de looprichting ----------
    // Achter je aan: hij kijkt naar jou. Loopt hij ergens omheen, dan kijkt hij waar hij loopt (de Mecha blijft op jou mikken).
    const look = this.chasing && (!steered || this.typeKey === 'mecha') ? flatToPlayer : dir.clone().setY(0);
    if (look.lengthSq() > 1e-6) {
      const targetAngle = Math.atan2(look.x, look.z);
      let diff = targetAngle - this.mesh.rotation.y;
      diff = Math.atan2(Math.sin(diff), Math.cos(diff));
      this.mesh.rotation.y += diff * Math.min(1, 8 * dt);
    }

    // ---------- Animatie ----------
    if (this.mixer) {
      this.anim -= dt;
      if (this.anim <= 0) this.playAnim(speed === 0 ? 'Idle' : this.chasing ? 'Run' : 'Walk');
      this.mixer.update(dt);
    } else if (type.model) this.animateModel(dt, speed);
    else if (this.typeKey === 'golem') this.animateGolem(dt, ctx.time);
    else if (type.flies) this.animateGhost(ctx.time);
    else this.animateSlime(dt, ctx.time);
  }

  /** Patrouille-punten niet in (of achter) bomen, stenen, muren, of buiten het level. Gebeurt één keer. */
  fitPatrol(colliders, bounds) {
    this.patrolChecked = true;
    const r = this.type.radius + 0.3; // een beetje ruimte over
    const y = this.type.flies ? 1.2 : 0;
    const h = this.type.height;
    const free = (x, z) => Math.abs(x) < bounds.x - r && Math.abs(z) < bounds.z - r && !blockAt(x, z, r, y, h, colliders);
    // Kun je in een rechte lijn van a naar b lopen?
    const clearLine = (a, b) => {
      const n = Math.ceil(a.distanceTo(b) / 0.4);
      for (let i = 1; i <= n; i++) if (!free(a.x + ((b.x - a.x) * i) / n, a.z + ((b.z - a.z) * i) / n)) return false;
      return true;
    };
    const oldA = this.pointA.clone();
    if (!free(this.pointA.x, this.pointA.z)) {
      // In rondjes steeds verder zoeken naar een vrij plekje
      search: for (let s = 0.5; s <= 6; s += 0.5) {
        for (let k = 0; k < 12; k++) {
          const a = (k / 12) * Math.PI * 2;
          const x = oldA.x + Math.sin(a) * s;
          const z = oldA.z + Math.cos(a) * s;
          if (free(x, z)) {
            this.pointA.set(x, 0, z);
            break search;
          }
        }
      }
    }
    if (!free(this.pointB.x, this.pointB.z) || !clearLine(this.pointA, this.pointB)) {
      // Punt B zit in de weg: draai hem een stukje om punt A heen (of maak de looproute korter)
      const len = Math.max(0.5, this.pointA.distanceTo(this.pointB));
      const start = Math.atan2(this.pointB.x - this.pointA.x, this.pointB.z - this.pointA.z);
      const b = new THREE.Vector3();
      let found = false;
      for (const s of [len, len * 0.75, len * 0.5]) {
        for (let k = 1; k < 16 && !found; k++) {
          const a = start + (k % 2 ? 1 : -1) * Math.ceil(k / 2) * (Math.PI / 8);
          b.set(this.pointA.x + Math.sin(a) * s, 0, this.pointA.z + Math.cos(a) * s);
          if (free(b.x, b.z) && clearLine(this.pointA, b)) found = true;
        }
        if (found) break;
      }
      this.pointB.copy(found ? b : this.pointA); // nergens plek? dan staat hij op wacht
    }
    this.home.copy(this.pointA).lerp(this.pointB, 0.5);
    // Stond hij nog op zijn oude beginplek? Dan naar de nieuwe
    if (Math.hypot(this.position.x - oldA.x, this.position.z - oldA.z) < 0.01) {
      this.position.set(this.pointA.x, this.type.flies ? 1.2 : 0, this.pointA.z);
    }
  }

  /**
   * Kijk een stukje vooruit. Staat er iets in de weg, loop er dan schuin langs (en blijf even aan dezelfde kant).
   * Past `want` (de looprichting) aan en geeft true terug als hij moest uitwijken.
   */
  steer(want, look, ctx, dt) {
    const p = this.position;
    const r = this.type.radius;
    const h = this.type.height;
    const B = ctx.bounds;
    // Alleen blokken vlakbij bekijken (scheelt veel rekenwerk)
    const R = r + look + 0.5;
    const near = this.nearBlocks;
    near.length = 0;
    for (const b of ctx.colliders) {
      if (b.min.y > p.y + h || b.max.y < p.y + 0.05) continue;
      if (b.max.x < p.x - R || b.min.x > p.x + R || b.max.z < p.z - R || b.min.z > p.z + R) continue;
      near.push(b);
    }
    this.avoidT = Math.max(0, this.avoidT - dt);
    const atEdge = Math.abs(p.x) > B.x - R || Math.abs(p.z) > B.z - R;
    if (!near.length && !atEdge) {
      this.avoidT = 0;
      return false; // meestal: niks in de weg
    }
    // Is de weg in richting `want`, gedraaid over hoek a, vrij? (een tikje kleiner rondje, zodat langs een muur glijden mag)
    const rr = r - 0.03;
    const free = (x, z) => Math.abs(x) <= B.x - rr && Math.abs(z) <= B.z - rr && !blockAt(x, z, rr, p.y, h, near);
    const tryDir = (a) => {
      const c = Math.cos(a);
      const s = Math.sin(a);
      const x = want.x * c + want.z * s;
      const z = -want.x * s + want.z * c;
      for (const k of [0.4, 0.75, 1]) if (!free(p.x + x * look * k, p.z + z * look * k)) return null;
      return [x, z];
    };
    if (this.avoidT <= 0 && tryDir(0)) return false; // rechtdoor is vrij
    if (!this.avoidSide || this.avoidT <= 0) {
      // Welke kant om? Als maar één kant vrij is: die. Anders de kant waar het blok níet zit.
      const left = tryDir(0.8);
      const right = tryDir(-0.8);
      if (left && !right) this.avoidSide = 1;
      else if (right && !left) this.avoidSide = -1;
      else if (!this.avoidSide) {
        const block = blockAt(p.x + want.x * look, p.z + want.z * look, rr, p.y, h, near);
        const side = block ? (block.min.x + block.max.x) / 2 - p.x : 0;
        const ahead = block ? (block.min.z + block.max.z) / 2 - p.z : 0;
        this.avoidSide = side * want.z - ahead * want.x > 0 ? -1 : 1;
      }
    }
    for (const side of [this.avoidSide, -this.avoidSide]) {
      for (const a of [0.45, 0.9, 1.35, 1.8, 2.3]) {
        const d = tryDir(a * side);
        if (d) {
          this.avoidSide = side;
          this.avoidT = Math.max(this.avoidT, 0.25); // even volhouden, anders wiebelt hij heen en weer
          want.set(d[0], 0, d[1]);
          return true;
        }
      }
    }
    return false; // helemaal ingesloten: gewoon duwen (de botsing laat hem langs de muur glijden)
  }

  /** Opploppen bij het (terug)komen, "boing" na een klap, knipperen en je met de ogen volgen. */
  animateLife(dt, ctx) {
    this.spawnT = Math.max(0, this.spawnT - dt);
    this.punch = Math.max(0, this.punch - dt * 4);
    const k = 1 - this.spawnT / SPAWN_TIME;
    const grow = k >= 1 ? 1 : 1 + 2.7 * Math.pow(k - 1, 3) + 1.7 * Math.pow(k - 1, 2); // even te groot, dan terug
    const p = Math.sin(this.punch * Math.PI) * 0.22;
    this.mesh.scale.set(grow * (1 + p), grow * (1 - p), grow * (1 + p));

    const eyes = this.model.lookEyes; // ogen die kunnen kijken en knipperen (slijm en spook)
    if (!eyes) return;
    // Knipperen
    this.blinkTimer -= dt;
    const closed = this.blinkTimer < 0.12;
    if (this.blinkTimer <= 0) this.blinkTimer = 2 + Math.random() * 3;
    // Pupillen kijken naar de speler
    const target = this.body.worldToLocal(ctx.player.position.clone().setY(ctx.player.position.y + 1.2));
    for (const { eye, pupil, size } of eyes) {
      eye.scale.y = closed ? 0.12 : 1;
      const dir = target.clone().sub(eye.position).normalize();
      dir.z = Math.max(0.55, dir.z); // niet achter in het hoofd kijken
      pupil.position.copy(dir.normalize().multiplyScalar(size * 0.65));
    }
  }

  /** Modellen zonder eigen animaties: wiegen en wippen tijdens het lopen. */
  animateModel(dt, speed) {
    const moving = speed > 0 ? 1 : 0;
    this.gait += dt * (this.chasing ? 7 : 5); // sneller stappen als hij rent (zonder te haperen)
    const step = Math.sin(this.gait + this.phase);
    this.body.position.y = Math.abs(step) * 0.12 * moving;
    this.body.rotation.z = step * 0.06 * moving;
    this.body.rotation.x = THREE.MathUtils.lerp(this.body.rotation.x, 0.08 * moving, 0.1);
    this.body.scale.set(1, 1, 1);
  }

  /** Aanvallen van zombie, Spierbonk en Mecha. Geeft true terug als de aanval de beweging overneemt. */
  specialAttack(dt, ctx, dist, flatToPlayer) {
    const facePlayer = (speed = 8) => {
      let diff = Math.atan2(flatToPlayer.x, flatToPlayer.z) - this.mesh.rotation.y;
      diff = Math.atan2(Math.sin(diff), Math.cos(diff));
      this.mesh.rotation.y += diff * Math.min(1, speed * dt);
    };
    const inFront = (range) => {
      const facing = new THREE.Vector3(Math.sin(this.mesh.rotation.y), 0, Math.cos(this.mesh.rotation.y));
      return dist < range && (dist < 1 || flatToPlayer.clone().normalize().dot(facing) > 0.2);
    };
    this.stateTimer -= dt;

    // ----- Zombie: dichtbij komen en een vuistslag -----
    if (this.typeKey === 'zombie') {
      if (this.state === 'walk' && this.chasing && dist < 1.8 && this.attackCooldown <= 0) {
        this.state = 'punch';
        this.stateTimer = 0.77;
        this.hitDone = false;
        this.playAnim('Punch', true);
      }
      if (this.state === 'punch') {
        facePlayer(10);
        if (!this.hitDone && this.stateTimer < 0.42) {
          this.hitDone = true;
          if (inFront(2.3)) ctx.hurtPlayer(this.position, this.type.damage);
        }
        if (this.stateTimer <= 0) {
          this.state = 'walk';
          this.attackCooldown = 1.1;
        }
        return true;
      }
      return false;
    }

    // ----- Spierbonk: aanloop nemen en op je af stormen -----
    if (this.typeKey === 'spierbonk') {
      const flash = (on) => this.model.materials.forEach((m) => {
        m.emissive.set(on ? 0xff2200 : 0x000000);
        m.emissiveIntensity = on ? 0.5 : 0;
      });
      if (this.state === 'walk' && this.chasing && this.attackCooldown <= 0) {
        if (dist > 4 && dist < 14) {
          this.state = 'chargeWindup';
          this.stateTimer = 0.9;
          play('charge');
        } else if (dist < 2.6) {
          this.state = 'punchWindup';
          this.stateTimer = 0.55;
        }
      }
      if (this.state === 'chargeWindup') {
        facePlayer(10);
        this.body.scale.set(1.08, 0.86, 1.08); // ineen gedoken
        this.body.position.x = (Math.random() - 0.5) * 0.06;
        flash(Math.floor(this.stateTimer * 10) % 2 === 0);
        if (this.stateTimer <= 0) {
          this.state = 'charge';
          this.stateTimer = 0.8;
          this.hitDone = false;
          this.chargeDir = flatToPlayer.clone().normalize();
          flash(false);
          this.body.scale.set(1, 1, 1);
          this.body.position.x = 0;
        }
        return true;
      }
      if (this.state === 'charge') {
        this.body.rotation.x = 0.35; // voorover rennen
        const before = this.position.clone();
        this.position.addScaledVector(this.chargeDir, 15 * dt);
        this.pushOutOfBlocks(ctx.colliders);
        this.clampToBounds(ctx.bounds); // tegen de rand van het level aan rennen telt ook als botsen
        const blocked = before.distanceTo(this.position) < 15 * dt * 0.5;
        if (Math.random() < 0.5) ctx.effects.burst(this.position.clone().setY(0.2), 0xb8a58c, { count: 2, speed: 2, size: 0.15, life: 0.4, up: 1 });
        const touch = ctx.player.position.clone().setY(0).distanceTo(this.position.clone().setY(0)) < this.type.radius + 0.7;
        if (!this.hitDone && touch && ctx.player.position.y < this.type.height) {
          this.hitDone = true;
          if (ctx.hurtPlayer(this.position, this.type.damage)) ctx.player.knockback.addScaledVector(this.chargeDir, 14);
        }
        if (this.stateTimer <= 0 || blocked) {
          this.state = 'dizzy';
          this.stateTimer = blocked ? 2 : 1.2; // tegen een muur gerend: extra lang duizelig
          if (blocked) {
            play('slam');
            ctx.effects.shake(0.2);
          }
        }
        return true;
      }
      if (this.state === 'dizzy') {
        // Duizelig: wiebelen met sterretjes. Nu is je kans!
        this.body.rotation.x = 0;
        this.body.rotation.z = Math.sin(ctx.time * 12) * 0.15;
        if (Math.random() < 0.3) ctx.effects.burst(this.position.clone().setY(this.type.height + 0.3), 0xffe066, { count: 1, speed: 1, size: 0.12, life: 0.5, up: 0.5, gravity: 0 });
        if (this.stateTimer <= 0) {
          this.state = 'walk';
          this.attackCooldown = 2.5;
        }
        return true;
      }
      if (this.state === 'punchWindup') {
        facePlayer(8);
        this.body.rotation.x = THREE.MathUtils.lerp(this.body.rotation.x, -0.25, 0.2);
        if (this.stateTimer <= 0) {
          this.body.rotation.x = 0.35;
          play('heavySwing');
          if (inFront(3)) ctx.hurtPlayer(this.position, 24);
          this.state = 'walk';
          this.attackCooldown = 1.6;
        }
        return true;
      }
      return false;
    }

    // ----- Mecha-Wachter: richten met een laser, dan een energiebal schieten; stampen als je dichtbij komt -----
    if (this.typeKey === 'mecha') {
      if (this.state === 'walk' && this.chasing && this.attackCooldown <= 0) {
        if (dist < 3.6) {
          this.state = 'stomp';
          this.stateTimer = 0.7;
          ctx.effects.warnCircle(this.position, 3.8, 0.7);
        } else if (dist < 22) {
          this.state = 'aim';
          this.stateTimer = 0.9;
          this.shotsLeft = this.hp < this.type.hp / 2 ? 3 : 1;
          play('laser');
        }
      }
      const gun = this.position.clone().add(new THREE.Vector3(0, this.type.height * 0.6, 0));
      if (this.state === 'aim') {
        facePlayer(6);
        const target = ctx.player.position.clone().setY(ctx.player.position.y + 0.9);
        if (this.laser) {
          this.laser.visible = true;
          this.laser.geometry.setFromPoints([gun, target]);
          this.laser.material.opacity = 0.4 + 0.5 * Math.abs(Math.sin(ctx.time * 20));
        }
        if (this.stateTimer <= 0) {
          const lead = ctx.player.velocity.clone().setY(0).multiplyScalar(dist / 22);
          ctx.projectiles.spawn({ from: gun, dir: target.add(lead).sub(gun), speed: 22, damage: this.type.damage, kind: 'energy', radius: 0.5 });
          play('laser');
          this.shotsLeft--;
          if (this.shotsLeft > 0) this.stateTimer = 0.3;
          else {
            if (this.laser) this.laser.visible = false;
            this.state = 'walk';
            this.attackCooldown = 2.4;
          }
        }
        return true;
      }
      if (this.state === 'stomp') {
        this.body.rotation.z = THREE.MathUtils.lerp(this.body.rotation.z, 0.2, 0.2);
        if (this.stateTimer <= 0) {
          this.body.rotation.z = 0;
          ctx.onSlam(this, 3.8, 30);
          this.state = 'walk';
          this.attackCooldown = 1.8;
        }
        return true;
      }
      return false;
    }
    return false;
  }

  animateSlime(dt, time) {
    this.gait += dt * (this.chasing ? 13 : 8); // sneller springen als hij achter je aan zit (zonder te haperen)
    const hop = Math.abs(Math.sin(this.gait + this.phase));
    const h = this.type.height;
    this.body.position.y = h / 2 + hop * h * 0.25;
    const squash = 1 - (1 - hop) * 0.18;
    // Gelei-wiebel na elke landing
    const jiggle = Math.sin(time * 30 + this.phase) * 0.05 * (1 - hop);
    this.body.scale.set((1 + jiggle) / Math.sqrt(squash), squash * (1 - jiggle), (1 - jiggle) / Math.sqrt(squash));
    this.body.rotation.x = THREE.MathUtils.lerp(this.body.rotation.x, this.chasing ? 0.18 : 0.08, 0.1); // voorover als hij achter je aan zit
  }

  animateGhost(time) {
    this.body.position.y = Math.sin(time * 2.5 + this.phase) * 0.15;
    this.body.rotation.z = Math.sin(time * 1.7 + this.phase) * 0.12;
    this.model.materials[0].opacity = 0.65 + Math.sin(time * 3 + this.phase) * 0.15;
    // Wapperende onderrand en een ademende gloed
    this.model.tips.forEach((tip, i) => {
      tip.rotation.z = Math.sin(time * 6 + i * 1.3 + this.phase) * 0.35;
      tip.scale.y = 1 + Math.sin(time * 5 + i) * 0.2;
    });
    this.model.halo.material.uniforms.strength.value = 0.5 + Math.sin(time * 2 + this.phase) * 0.2 + (this.chasing ? 0.4 : 0);
    this.model.mouth.scale.setScalar(this.chasing ? 1.4 + Math.sin(time * 10) * 0.2 : 1); // "Boeoeoe!"
  }

  animateGolem(dt, time) {
    const { arms, eyeMat, pebbles } = this.model;
    // Zwevende steentjes draaien rond zijn schouders (sneller als hij boos wordt)
    const spin = this.state === 'windup' ? 5 : 1.2;
    pebbles.forEach((p, i) => {
      const a = time * spin + (i / pebbles.length) * Math.PI * 2 + this.phase;
      p.position.set(Math.sin(a) * 1.25, 1.9 + Math.sin(time * 2 + i) * 0.15, Math.cos(a) * 1.25);
      p.rotation.set(time * 2 + i, time * 1.5, 0);
    });
    if (this.state === 'windup') {
      // Armen omhoog, ogen feller, een beetje trillen
      const k = 1 - this.stateTimer / WINDUP_TIME;
      for (const arm of arms) arm.rotation.x = THREE.MathUtils.lerp(arm.rotation.x, -2.8, Math.min(1, 10 * dt));
      eyeMat.emissiveIntensity = 1.5 + k * 4;
      this.body.position.x = (Math.random() - 0.5) * 0.06 * k;
      this.body.rotation.x = -0.15 * k;
    } else if (this.state === 'recover') {
      for (const arm of arms) arm.rotation.x = THREE.MathUtils.lerp(arm.rotation.x, 0.5, Math.min(1, 25 * dt));
      eyeMat.emissiveIntensity = 1.5;
      this.body.position.x = 0;
      this.body.rotation.x = THREE.MathUtils.lerp(this.body.rotation.x, 0.25, Math.min(1, 20 * dt));
    } else {
      // Zwaar sjokken: heen en weer wiegen, armen zwaaien
      this.gait += dt * (this.chasing ? 6 : 4);
      const step = Math.sin(this.gait + this.phase);
      arms[0].rotation.x = step * 0.4;
      arms[1].rotation.x = -step * 0.4;
      this.body.rotation.z = step * 0.06;
      this.body.rotation.x = THREE.MathUtils.lerp(this.body.rotation.x, 0, Math.min(1, 8 * dt));
      this.body.position.y = Math.abs(step) * 0.06;
      eyeMat.emissiveIntensity = 1.5;
    }
  }

  /**
   * Botsing: duw de vijand (een rondje) uit blokken die op de grond staan.
   * Een paar rondes, want soms staan blokken tegen elkaar (uit het ene blok duwen kan je in het andere duwen).
   */
  pushOutOfBlocks(colliders) {
    const p = this.position;
    const r = this.type.radius;
    const top = p.y + this.type.height;
    for (let pass = 0; pass < 3; pass++) {
      let moved = false;
      for (const box of colliders) {
        if (box.min.y > top || box.max.y < p.y + 0.05) continue; // boven of onder ons: geen botsing
        if (p.x <= box.min.x - r || p.x >= box.max.x + r || p.z <= box.min.z - r || p.z >= box.max.z + r) continue;
        const cx = THREE.MathUtils.clamp(p.x, box.min.x, box.max.x); // dichtstbijzijnde punt van het blok
        const cz = THREE.MathUtils.clamp(p.z, box.min.z, box.max.z);
        const dx = p.x - cx;
        const dz = p.z - cz;
        const d = Math.hypot(dx, dz);
        if (d >= r - 1e-6) continue; // er net tegenaan of langs een (ronde) hoek: vrij
        if (d > 1e-6) {
          // Recht van het blok af duwen: zo glijdt hij langs muren en om hoeken heen
          p.x = cx + (dx / d) * r;
          p.z = cz + (dz / d) * r;
        } else {
          // Midden in het blok: naar de dichtstbijzijnde kant
          const pushes = [
            [box.min.x - r - p.x, 'x'],
            [box.max.x + r - p.x, 'x'],
            [box.min.z - r - p.z, 'z'],
            [box.max.z + r - p.z, 'z'],
          ];
          pushes.sort((a, b) => Math.abs(a[0]) - Math.abs(b[0]));
          p[pushes[0][1]] += pushes[0][0];
        }
        moved = true;
      }
      if (!moved) break;
    }
  }

  /** Binnen de rand van het level blijven. */
  clampToBounds(bounds) {
    const r = this.type.radius;
    this.position.x = THREE.MathUtils.clamp(this.position.x, -bounds.x + r, bounds.x - r);
    this.position.z = THREE.MathUtils.clamp(this.position.z, -bounds.z + r, bounds.z - r);
  }
}

export function createEnemies(scene) {
  return SPAWNS.map(([typeKey, ...patrol]) => new Enemy(scene, typeKey, patrol));
}

/** Een losse vijand op een plek neerzetten (bijv. slijmpjes die Koning Slijm oproept). */
export function spawnEnemy(scene, typeKey, x, z) {
  const enemy = new Enemy(scene, typeKey, [x, z, x + 0.5, z + 0.5]);
  enemy.summoned = true;
  return enemy;
}
