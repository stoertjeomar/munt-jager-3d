import * as THREE from 'three';
import { play } from './audio.js';
import { loadGLB } from './assets.js';
import { clone as cloneSkinned } from 'three/addons/utils/SkeletonUtils.js';

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

const LEASH = 16; // verder dan dit van huis geeft een vijand het op en gaat terug
const ACTIVE_RANGE = 70; // vijanden verder weg dan dit staan stil (scheelt rekenwerk)

// Waar de vijanden lopen: [soort, x1, z1, x2, z2] — ze lopen heen en weer tussen die twee punten
export const SPAWNS = [
  // Groene Weide: vooral slijmpjes, een paar slijmballen
  ['slijmpje', -7, 3, -4, 5], ['slijmpje', 8, 5, 10, 8], ['slijmpje', -11, 10, -7, 13], ['slijmpje', 14, 30, 18, 34],
  ['slijmpje', -24, 20, -20, 26], ['slijmpje', 26, 12, 30, 16], ['slijmpje', 18, 40, 24, 44], ['slijmpje', -8, 34, -4, 38],
  ['slijmbal', -7, -1, -2, -1], ['slijmbal', 3, -10, 8, -10], ['slijmbal', 25, -20, 30, -26], ['slijmbal', -28, -16, -24, -22],
  // Pad naar Koning Slijm
  ['slijmbal', -4, -30, 4, -30], ['slijmbal', 5, -40, 9, -36], ['slijmpje', -6, -38, -3, -42], ['slijmpje', 6, -55, 9, -58],
  ['slijmbal', -8, -58, -5, -54],
  // Spookwoud: spoken en slijmballen
  ['spook', -50, 25, -50, 40], ['spook', -62, -5, -70, 5], ['spook', -85, 20, -90, 30], ['spook', -100, -10, -95, 0],
  ['spook', -66, 55, -74, 62], ['spook', -88, -70, -80, -76], ['slijmbal', -45, -12, -50, -18], ['slijmbal', -60, 30, -64, 26],
  ['slijmbal', -92, 8, -96, 14], ['slijmbal', -70, -36, -74, -30], ['spook', -82, -30, -86, -26], ['slijmbal', -110, 40, -104, 46],
  // Noordelijke ruïnes
  ['slijmbal', -28, -54, -24, -58], ['spook', -38, -70, -30, -74], ['slijmpje', -20, -66, -16, -70],
  // Rotshoogland: golems en spoken
  ['golem', 66, -10, 70, -4], ['golem', 82, 20, 88, 14], ['golem', 76, -40, 86, -40], ['golem', 100, -10, 104, 0],
  ['golem', 62, 56, 66, 62], ['spook', 50, -25, 58, -30], ['spook', 95, 40, 100, 30], ['spook', 70, 80, 78, 86],
  ['slijmbal', 48, 20, 52, 26], ['slijmbal', 58, -50, 62, -56], ['golem', 52, -66, 46, -60], ['spook', 104, -60, 96, -66],
  // Zombies in het Spookwoud en bij de noordelijke ruïnes
  ['zombie', -58, 18, -66, 22], ['zombie', -80, 10, -76, 2], ['zombie', -95, 45, -88, 50], ['zombie', -70, -60, -64, -66],
  ['zombie', -108, -30, -100, -36], ['zombie', -52, -40, -58, -46], ['zombie', -40, -60, -44, -52], ['zombie', -24, -76, -16, -72],
  // Spierbonken in het hoogland
  ['spierbonk', 68, 22, 74, 18], ['spierbonk', 92, -20, 98, -26], ['spierbonk', 60, 70, 66, 76],
  // Mecha-Wachters: bewaken de weg naar Steenreus Gorath en de noordoosthoek
  ['mecha', 80, 46, 86, 42], ['mecha', 96, -86, 90, -92], ['mecha', 30, -90, 36, -96],
];

// Golem-aanval: opladen en dan op de grond slaan
const SLAM_RANGE = 2.6; // binnen deze afstand begint hij op te laden
const SLAM_RADIUS = 3.2; // zo ver reikt de schokgolf
const WINDUP_TIME = 0.8;
const RECOVER_TIME = 0.7;
const SLAM_COOLDOWN = 1.6;

const DEATH_TIME = 0.45;
const WHITE = new THREE.Color(0xffffff);

function mat(color, extra = {}) {
  return new THREE.MeshStandardMaterial({ color, roughness: 0.5, emissive: 0xffffff, emissiveIntensity: 0, ...extra });
}

function addEyes(parent, { spread, y, z, size, angry = false, color = 0xffffff, pupil = 0x111111 }) {
  const eyeGeo = new THREE.SphereGeometry(size, 12, 12);
  const pupilGeo = new THREE.SphereGeometry(size * 0.5, 8, 8);
  for (const side of [-1, 1]) {
    const eye = new THREE.Mesh(eyeGeo, new THREE.MeshStandardMaterial({ color }));
    eye.position.set(side * spread, y, z);
    const p = new THREE.Mesh(pupilGeo, new THREE.MeshStandardMaterial({ color: pupil }));
    p.position.z = size * 0.65;
    eye.add(p);
    parent.add(eye);
    if (angry) {
      const brow = new THREE.Mesh(new THREE.BoxGeometry(size * 1.9, size * 0.4, size * 0.4), new THREE.MeshStandardMaterial({ color: 0x111111 }));
      brow.position.set(side * spread, y + size * 1.35, z + size * 0.3);
      brow.rotation.z = side * 0.45; // schuin naar binnen = boos
      parent.add(brow);
    }
  }
}

// ---------- Modellen ----------

export function buildSlime(type, angry) {
  const body = new THREE.Group(); // stuitert en squasht
  const bodyMat = mat(type.color, { roughness: 0.35, transparent: true, opacity: 0.92 });
  const blob = new THREE.Mesh(new THREE.SphereGeometry(type.radius, 22, 16), bodyMat);
  blob.scale.y = type.height / 2 / type.radius;
  blob.castShadow = true;
  body.add(blob);
  // glimmend lichtje bovenop
  const shine = new THREE.Mesh(new THREE.SphereGeometry(type.radius * 0.18, 8, 8), new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.6 }));
  shine.position.set(-type.radius * 0.35, type.height * 0.3, type.radius * 0.45);
  body.add(shine);
  addEyes(body, {
    spread: type.radius * 0.33, y: type.height * 0.12, z: type.radius * 0.83,
    size: type.radius * (angry ? 0.2 : 0.26), angry,
  });
  return { body, materials: [bodyMat] };
}

function buildGhost(type) {
  const body = new THREE.Group();
  const bodyMat = mat(type.color, { roughness: 0.2, transparent: true, opacity: 0.8, emissive: type.color, emissiveIntensity: 0.2 });
  const head = new THREE.Mesh(new THREE.SphereGeometry(type.radius, 22, 16, 0, Math.PI * 2, 0, Math.PI / 2), bodyMat);
  head.position.y = type.height * 0.55;
  const skirt = new THREE.Mesh(new THREE.CylinderGeometry(type.radius, type.radius * 0.75, type.height * 0.55, 22, 1, true), bodyMat);
  skirt.position.y = type.height * 0.275;
  // golvende onderrand: kleine kegeltjes
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * Math.PI * 2;
    const tip = new THREE.Mesh(new THREE.ConeGeometry(type.radius * 0.2, type.height * 0.22, 6), bodyMat);
    tip.position.set(Math.sin(a) * type.radius * 0.7, -type.height * 0.08, Math.cos(a) * type.radius * 0.7);
    tip.rotation.x = Math.PI;
    body.add(tip);
  }
  body.add(head, skirt);
  // donkere ogen en een "O"-mond
  addEyes(body, { spread: type.radius * 0.35, y: type.height * 0.6, z: type.radius * 0.85, size: type.radius * 0.17, color: 0x1a1030, pupil: 0xffffff });
  const mouth = new THREE.Mesh(new THREE.TorusGeometry(type.radius * 0.12, type.radius * 0.04, 8, 16), new THREE.MeshBasicMaterial({ color: 0x1a1030 }));
  mouth.position.set(0, type.height * 0.38, type.radius * 0.93);
  body.add(mouth);
  return { body, materials: [bodyMat] };
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
  return { body, materials: [stone, dark, moss], eyes, eyeMat, arms };
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
    this.mesh.rotation.set(0, 0, 0);
    this.healthBar.visible = false;
    this.phase = Math.random() * Math.PI * 2;
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
    this.hp = Math.max(0, this.hp - damage);
    this.flash = 0.12;
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
   * @param {object} ctx { time, player, colliders, groundHalfSize, camera, effects, onSlam }
   */
  update(dt, ctx) {
    const type = this.type;
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
      if (this.dying <= 0) this.mesh.visible = false;
      return;
    }
    if (!this.alive) return;
    if (this.position.distanceTo(ctx.player.position) > ACTIVE_RANGE) return;

    const playerPos = ctx.player.position;
    const toPlayer = playerPos.clone().sub(this.position);
    const flatToPlayer = toPlayer.clone().setY(0);
    const distToPlayer = flatToPlayer.length();
    const distFromHome = this.position.clone().setY(0).distanceTo(this.home);
    const reachable = type.flies || playerPos.y < this.position.y + 2.5; // niet achter je aan als je hoog op een blok staat
    this.chasing = ctx.player.alive && !ctx.player.resting && distToPlayer < type.sight && distFromHome < LEASH && reachable;

    // ---------- Eigen aanvallen van de nieuwe vijanden ----------
    if (this.typeKey === 'zombie' || this.typeKey === 'spierbonk' || this.typeKey === 'mecha') {
      this.attackCooldown -= dt;
      if (this.specialAttack(dt, ctx, distToPlayer, flatToPlayer)) {
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
    if (this.chasing) {
      dir = type.flies ? toPlayer.clone().add(new THREE.Vector3(0, 0.6, 0)) : flatToPlayer.clone();
      speed = type.chaseSpeed;
      if (this.typeKey === 'mecha') {
        // De Mecha schiet liever van een afstandje
        if (distToPlayer < 8) dir.negate();
        else if (distToPlayer < 13) speed = 0;
      }
      if (!type.flies && distToPlayer < type.radius + 0.35) speed = 0; // niet in de speler kruipen
    } else {
      const goal = this.goingToB ? this.pointB : this.pointA;
      dir = goal.clone().sub(this.position);
      if (type.flies) dir.y = 1.2 - this.position.y;
      else dir.y = 0;
      if (dir.clone().setY(0).length() < 0.2) this.goingToB = !this.goingToB;
      speed = type.patrolSpeed;
    }
    if (dir.lengthSq() > 1e-6) dir.normalize();

    // ---------- Bewegen (plus terugstoot van een klap) ----------
    this.velocity.copy(dir).multiplyScalar(speed).add(this.knockback);
    this.knockback.multiplyScalar(Math.exp(-8 * dt));
    this.position.addScaledVector(this.velocity, dt);

    if (type.flies) {
      // Spoken zweven door muren heen, maar niet door de grond
      this.position.y = Math.max(0.4, this.position.y);
    } else {
      this.position.y = 0;
      this.pushOutOfBlocks(ctx.colliders);
    }
    const limit = ctx.groundHalfSize - type.radius;
    this.position.x = THREE.MathUtils.clamp(this.position.x, -limit, limit);
    this.position.z = THREE.MathUtils.clamp(this.position.z, -limit, limit);

    // ---------- Draaien naar de looprichting ----------
    const look = this.chasing ? flatToPlayer : dir.clone().setY(0);
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
    } else if (type.model) this.animateModel(ctx.time, speed);
    else if (this.typeKey === 'golem') this.animateGolem(dt, ctx.time);
    else if (type.flies) this.animateGhost(ctx.time);
    else this.animateSlime(ctx.time);
  }

  /** Modellen zonder eigen animaties: wiegen en wippen tijdens het lopen. */
  animateModel(time, speed) {
    const moving = speed > 0 ? 1 : 0;
    const step = Math.sin(time * (this.chasing ? 7 : 5) + this.phase);
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
          ctx.projectiles.spawn({ from: gun, dir: target.add(lead).sub(gun), speed: 22, damage: this.type.damage, owner: 'enemy', kind: 'energy', radius: 0.5 });
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

  animateSlime(time) {
    const hopSpeed = this.chasing ? 13 : 8;
    const hop = Math.abs(Math.sin(time * hopSpeed + this.phase));
    const h = this.type.height;
    this.body.position.y = h / 2 + hop * h * 0.25;
    const squash = 1 - (1 - hop) * 0.18;
    this.body.scale.set(1 / Math.sqrt(squash), squash, 1 / Math.sqrt(squash));
  }

  animateGhost(time) {
    this.body.position.y = Math.sin(time * 2.5 + this.phase) * 0.15;
    this.body.rotation.z = Math.sin(time * 1.7 + this.phase) * 0.12;
    this.model.materials[0].opacity = 0.65 + Math.sin(time * 3 + this.phase) * 0.15;
  }

  animateGolem(dt, time) {
    const { arms, eyeMat } = this.model;
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
      const step = Math.sin(time * (this.chasing ? 6 : 4) + this.phase);
      arms[0].rotation.x = step * 0.4;
      arms[1].rotation.x = -step * 0.4;
      this.body.rotation.z = step * 0.06;
      this.body.rotation.x = THREE.MathUtils.lerp(this.body.rotation.x, 0, Math.min(1, 8 * dt));
      this.body.position.y = Math.abs(step) * 0.06;
      eyeMat.emissiveIntensity = 1.5;
    }
  }

  /** Simpele botsing: duw de vijand uit blokken die op de grond staan. */
  pushOutOfBlocks(colliders) {
    const p = this.position;
    const r = this.type.radius;
    for (const box of colliders) {
      if (box.min.y > this.type.height || box.max.y < 0) continue; // zwevende blokken negeren
      const minX = box.min.x - r;
      const maxX = box.max.x + r;
      const minZ = box.min.z - r;
      const maxZ = box.max.z + r;
      if (p.x <= minX || p.x >= maxX || p.z <= minZ || p.z >= maxZ) continue;

      // Duw naar de dichtstbijzijnde kant
      const pushes = [
        [minX - p.x, 'x'],
        [maxX - p.x, 'x'],
        [minZ - p.z, 'z'],
        [maxZ - p.z, 'z'],
      ];
      pushes.sort((a, b) => Math.abs(a[0]) - Math.abs(b[0]));
      const [amount, axis] = pushes[0];
      p[axis] += amount;
    }
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
