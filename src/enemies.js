import * as THREE from 'three';
import { play } from './audio.js';

// Soorten vijanden — speel met deze getallen om ze makkelijker of moeilijker te maken!
//   hp            = levenspunten
//   radius/height = hoe groot ze zijn
//   patrolSpeed / chaseSpeed = loopsnelheid (heen en weer / achter je aan)
//   sight         = binnen deze afstand komen ze achter je aan
//   knockback     = hoe ver ze wegvliegen als je ze raakt (0 = helemaal niet)
//   damage        = schade als ze je raken (de golem: met zijn schokgolf)
//   stompable     = kun je erop springen om ze te verslaan?
//   runes         = hoeveel munten je krijgt als je ze verslaat
export const ENEMY_TYPES = {
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
    patrolSpeed: 1.1, chaseSpeed: 2.3, sight: 9, knockback: 0.15, damage: 30, stompable: false, runes: 80,
  },
};

const LEASH = 16; // verder dan dit van huis geeft een vijand het op en gaat terug
const ACTIVE_RANGE = 70; // vijanden verder weg dan dit staan stil (scheelt rekenwerk)

// Waar de vijanden lopen: [soort, x1, z1, x2, z2] — ze lopen heen en weer tussen die twee punten
export const SPAWNS = [
  // Groene Weide: vooral slijmpjes, een paar slijmballen
  ['slijmpje', -7, 3, -4, 5], ['slijmpje', 8, 5, 10, 8], ['slijmpje', -11, 10, -7, 13], ['slijmpje', 14, 30, 18, 34],
  ['slijmpje', -24, 20, -20, 26], ['slijmpje', 26, 12, 30, 16], ['slijmpje', 18, 40, 24, 44], ['slijmpje', -18, 40, -12, 44],
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
    const model =
      typeKey === 'spook' ? buildGhost(type) : typeKey === 'golem' ? buildGolem(type) : buildSlime(type, typeKey === 'slijmbal');
    this.model = model;
    this.body = model.body;
    this.baseGlow = model.materials.map((m) => ({ color: m.emissive.clone(), intensity: m.emissiveIntensity }));
    this.mesh.add(this.body);

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
    this.state = 'walk'; // golem: walk / windup / recover
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
    this.dying = DEATH_TIME;
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
    if (this.typeKey === 'golem') this.animateGolem(dt, ctx.time);
    else if (type.flies) this.animateGhost(ctx.time);
    else this.animateSlime(ctx.time);
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
