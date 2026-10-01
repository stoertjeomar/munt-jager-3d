import * as THREE from 'three';

// Instellingen van de vijanden — speel hiermee om het moeilijker of makkelijker te maken!
const PATROL_SPEED = 2; // loopsnelheid tijdens heen en weer lopen
const CHASE_SPEED = 3.8; // loopsnelheid tijdens achtervolgen
const SIGHT_RANGE = 7; // binnen deze afstand gaat een vijand je achterna
const LEASH = 14; // verder dan dit van huis geeft hij het op en loopt hij terug
const MAX_HP = 2; // aantal zwaardklappen dat een vijand kan hebben
export const ENEMY_RADIUS = 0.6;
export const ENEMY_HEIGHT = 1.0;

// Looproutes van de vijanden: [x1, z1, x2, z2] — ze lopen heen en weer tussen die twee punten
const PATROLS = [
  [-7, -1, -2, -1],
  [3, -10, 8, -10],
  [15, 7, 15, 17],
  [-20, 12, -14, 20],
  [18, -18, 24, -24],
  [-23, -4, -23, -20],
];

class Enemy {
  constructor(scene, [x1, z1, x2, z2]) {
    this.pointA = new THREE.Vector3(x1, 0, z1);
    this.pointB = new THREE.Vector3(x2, 0, z2);

    this.mesh = new THREE.Group();

    // Lichaam: een platgedrukte bol (een soort slijmbal)
    this.bodyMat = new THREE.MeshStandardMaterial({ color: 0xd64545, roughness: 0.4, emissive: 0xffffff, emissiveIntensity: 0 });
    this.body = new THREE.Mesh(new THREE.SphereGeometry(ENEMY_RADIUS, 20, 16), this.bodyMat);
    this.body.scale.y = (ENEMY_HEIGHT / 2) / ENEMY_RADIUS;
    this.body.castShadow = true;
    this.bodyGroup = new THREE.Group(); // apart groepje zodat we kunnen stuiteren en squashen
    this.bodyGroup.add(this.body);
    this.mesh.add(this.bodyGroup);

    // Boze ogen met wenkbrauwen (+Z = voorkant)
    const eyeGeo = new THREE.SphereGeometry(0.12, 12, 12);
    const eyeMat = new THREE.MeshStandardMaterial({ color: 0xffffff });
    const pupilGeo = new THREE.SphereGeometry(0.06, 8, 8);
    const darkMat = new THREE.MeshStandardMaterial({ color: 0x111111 });
    const browGeo = new THREE.BoxGeometry(0.22, 0.05, 0.05);
    for (const side of [-1, 1]) {
      const eye = new THREE.Mesh(eyeGeo, eyeMat);
      eye.position.set(side * 0.2, 0.12, ENEMY_RADIUS - 0.1);
      const pupil = new THREE.Mesh(pupilGeo, darkMat);
      pupil.position.z = 0.08;
      eye.add(pupil);
      this.bodyGroup.add(eye);

      const brow = new THREE.Mesh(browGeo, darkMat);
      brow.position.set(side * 0.2, 0.28, ENEMY_RADIUS - 0.04);
      brow.rotation.z = side * 0.45; // schuin naar binnen = boos
      this.bodyGroup.add(brow);
    }

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

  reset() {
    this.hp = MAX_HP;
    this.dying = 0; // > 0: bezig met doodgaan-animatie
    this.flash = 0; // > 0: wit oplichten na een klap
    this.lastSwingId = -1;
    this.goingToB = true;
    this.chasing = false;
    this.position.copy(this.pointA);
    this.knockback.set(0, 0, 0);
    this.mesh.visible = true;
    this.mesh.scale.setScalar(1);
    this.mesh.rotation.set(0, 0, 0);
    this.bodyMat.emissiveIntensity = 0;
    this.hopPhase = Math.random() * Math.PI * 2;
  }

  /** Geraakt door een wapen. `from` = positie van de aanvaller, `damage` = schade van het wapen. */
  hit(from, swingId, damage = 1) {
    if (!this.alive || this.lastSwingId === swingId) return false;
    this.lastSwingId = swingId;
    this.hp = Math.max(0, this.hp - damage);
    this.flash = 0.15;

    const away = this.position.clone().sub(from).setY(0);
    if (away.lengthSq() < 1e-6) away.set(0, 0, 1);
    this.knockback.copy(away.normalize().multiplyScalar(this.hp > 0 ? 9 : 5));

    if (this.hp <= 0) this.dying = 0.45;
    return true;
  }

  /** Iemand is erop gesprongen: meteen verslagen. */
  stomp() {
    if (!this.alive) return;
    this.hp = 0;
    this.dying = 0.45;
    this.flash = 0.15;
    this.knockback.set(0, 0, 0);
  }

  update(dt, time, playerPos, colliders, groundHalfSize) {
    // Doodgaan: plat worden, ronddraaien en verdwijnen
    if (this.dying > 0) {
      this.dying -= dt;
      const t = Math.max(0, this.dying / 0.45);
      this.mesh.scale.set(1 + (1 - t) * 0.6, t, 1 + (1 - t) * 0.6);
      this.mesh.rotation.y += dt * 12;
      this.position.addScaledVector(this.knockback, dt);
      this.knockback.multiplyScalar(Math.exp(-8 * dt));
      if (this.dying <= 0) this.mesh.visible = false;
      this.updateFlash(dt);
      return;
    }
    if (!this.alive) return;

    // 1. Waar wil ik heen?
    const toPlayer = playerPos.clone().sub(this.position).setY(0);
    const distToPlayer = toPlayer.length();
    const distFromHome = this.position.distanceTo(this.pointA.clone().lerp(this.pointB, 0.5));
    // Alleen achtervolgen als de speler niet ver boven ons op een blok staat
    this.chasing = distToPlayer < SIGHT_RANGE && distFromHome < LEASH && playerPos.y < 2.5;

    let dir;
    let speed;
    if (this.chasing) {
      dir = toPlayer;
      speed = CHASE_SPEED;
    } else {
      const goal = this.goingToB ? this.pointB : this.pointA;
      dir = goal.clone().sub(this.position).setY(0);
      if (dir.length() < 0.2) this.goingToB = !this.goingToB;
      speed = PATROL_SPEED;
    }
    if (dir.lengthSq() > 1e-6) dir.normalize();

    // 2. Bewegen (plus terugstoot van een zwaardklap)
    this.velocity.copy(dir).multiplyScalar(speed).add(this.knockback);
    this.knockback.multiplyScalar(Math.exp(-8 * dt));

    this.position.x += this.velocity.x * dt;
    this.position.z += this.velocity.z * dt;
    this.pushOutOfBlocks(colliders);

    // Niet van de vloer af lopen
    const limit = groundHalfSize - ENEMY_RADIUS;
    this.position.x = THREE.MathUtils.clamp(this.position.x, -limit, limit);
    this.position.z = THREE.MathUtils.clamp(this.position.z, -limit, limit);

    // 3. Draaien naar de looprichting
    if (dir.lengthSq() > 0) {
      const targetAngle = Math.atan2(dir.x, dir.z);
      let diff = targetAngle - this.mesh.rotation.y;
      diff = Math.atan2(Math.sin(diff), Math.cos(diff));
      this.mesh.rotation.y += diff * Math.min(1, 10 * dt);
    }

    // 4. Stuiteren (sneller als hij je achterna zit)
    const hopSpeed = this.chasing ? 13 : 8;
    const hop = Math.abs(Math.sin(time * hopSpeed + this.hopPhase));
    this.bodyGroup.position.y = ENEMY_HEIGHT / 2 + hop * 0.25;
    const squash = 1 - (1 - hop) * 0.15;
    this.bodyGroup.scale.set(1 / Math.sqrt(squash), squash, 1 / Math.sqrt(squash));

    this.updateFlash(dt);
  }

  updateFlash(dt) {
    this.flash = Math.max(0, this.flash - dt);
    this.bodyMat.emissiveIntensity = this.flash > 0 ? 0.8 : 0;
  }

  /** Simpele botsing: duw de vijand uit blokken die op de grond staan. */
  pushOutOfBlocks(colliders) {
    const p = this.position;
    for (const box of colliders) {
      if (box.min.y > ENEMY_HEIGHT || box.max.y < 0) continue; // zwevende blokken negeren
      const minX = box.min.x - ENEMY_RADIUS;
      const maxX = box.max.x + ENEMY_RADIUS;
      const minZ = box.min.z - ENEMY_RADIUS;
      const maxZ = box.max.z + ENEMY_RADIUS;
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
  return PATROLS.map((patrol) => new Enemy(scene, patrol));
}
