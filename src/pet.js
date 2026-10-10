import * as THREE from 'three';
import { collidersNear } from './spatial.js';
import { loadGLB } from './assets.js';
import { play } from './audio.js';

// ======================================================================
// Huisdieren: ze wonen in Muntdorp en lopen daar lekker los rond
// ======================================================================
//  - Knokkie het Boks-Dinootje: koop een Dino-ei bij de koopman.
//  - Pluis de kat: koop haar in de sterrenwinkel.
// Ze scharrelen rond het dorpsplein. Kom je bij ze, dan komen ze naar je toe: druk op E om ze te aaien.
// In de ARENA (arena.js) kun je ze laten vechten tegen een monster: winnen ze, dan worden ze sterker
// (en een beetje groter), tot level 10. In de arena kunnen ze flauwvallen, maar daarna zijn ze gewoon weer thuis.

export const PET = {
  speed: 7.5, // rennen in de arena (meter per seconde)
  stroll: 2.2, // rustig wandelen in het dorp
  roam: 11, // zo ver van het dorpsplein lopen ze rond (meter)
  cooldown: 0.85, // tijd tussen twee stoten (seconden)
  hp: 70, // leven in de arena op level 1
  hpPerLevel: 22, // zoveel leven erbij per level
  damage: 8, // schade op level 1
  perLevel: 3, // zoveel schade erbij per level
  killsPerLevel: 5, // zoveel vijanden verslaan voor een level omhoog
  maxLevel: 10,
  radius: 0.4,
};

// Elk huisdier, met wat anders is dan hierboven
export const PETS = {
  knokkie: { name: 'Knokkie', icon: '🦖', color: '#9dff7a' },
  pluis: { name: 'Pluis', icon: '🐱', color: '#ffd08a', speed: 9, cooldown: 0.55, damage: 6, perLevel: 2.5, radius: 0.35 },
};

/** Pluis de kat, gebouwd van simpele vormen (oranje met een witte buik en snorharen). */
function buildCat() {
  const g = new THREE.Group();
  const mat = (color, extra = {}) => new THREE.MeshStandardMaterial({ color, roughness: 0.8, flatShading: true, ...extra });
  const orange = mat(0xe8893a);
  const dark = mat(0xb85a1a);
  const white = mat(0xfff4e6);
  const pink = mat(0xff9fb0);
  const eye = mat(0x6dff7a, { emissive: 0x1a8a2a, emissiveIntensity: 0.8, roughness: 0.3 });
  const black = mat(0x111111);
  const ball = new THREE.IcosahedronGeometry(1, 1);
  const add = (parent, geo, material, [x, y, z], [sx, sy, sz] = [1, 1, 1], [rx, ry, rz] = [0, 0, 0]) => {
    const m = new THREE.Mesh(geo, material);
    m.position.set(x, y, z);
    m.scale.set(sx, sy, sz);
    m.rotation.set(rx, ry, rz);
    m.castShadow = true;
    parent.add(m);
    return m;
  };
  add(g, ball, orange, [0, 0.36, 0], [0.22, 0.2, 0.42]); // lijf
  add(g, ball, white, [0, 0.3, 0.05], [0.17, 0.15, 0.34]); // buik
  for (const z of [-0.2, 0, 0.2]) add(g, new THREE.BoxGeometry(0.3, 0.03, 0.06), dark, [0, 0.55, z]); // strepen
  const head = new THREE.Group();
  head.position.set(0, 0.56, 0.4);
  g.add(head);
  add(head, ball, orange, [0, 0, 0], [0.19, 0.17, 0.17]);
  add(head, ball, white, [0, -0.05, 0.11], [0.1, 0.07, 0.07]); // snoet
  add(head, new THREE.SphereGeometry(0.025, 6, 4), pink, [0, -0.01, 0.18]); // neusje
  for (const s of [-1, 1]) {
    add(head, new THREE.ConeGeometry(0.07, 0.14, 4), orange, [s * 0.1, 0.17, -0.01], [1, 1, 0.6], [0, 0, s * -0.3]); // oren
    add(head, new THREE.ConeGeometry(0.04, 0.08, 4), pink, [s * 0.1, 0.16, 0.02], [1, 1, 0.4], [0, 0, s * -0.3]);
    add(head, new THREE.SphereGeometry(0.035, 8, 6), eye, [s * 0.075, 0.03, 0.14]); // ogen
    add(head, new THREE.SphereGeometry(0.016, 6, 4), black, [s * 0.075, 0.03, 0.172]);
    for (const tilt of [-0.15, 0.15]) add(head, new THREE.BoxGeometry(0.14, 0.004, 0.004), white, [s * 0.12, -0.04 + tilt * 0.1, 0.14], [1, 1, 1], [0, s * 0.3, tilt]); // snorharen
  }
  // Poten
  const legs = [];
  for (const [x, z] of [[-0.11, 0.24], [0.11, 0.24], [-0.11, -0.24], [0.11, -0.24]]) {
    const leg = new THREE.Group();
    leg.position.set(x, 0.3, z);
    g.add(leg);
    add(leg, new THREE.CylinderGeometry(0.045, 0.04, 0.3, 6), orange, [0, -0.15, 0]);
    add(leg, ball, white, [0, -0.29, 0.02], [0.05, 0.03, 0.06]); // witte sokjes
    legs.push(leg);
  }
  // Staart: omhoog gekruld, met donkere ringen
  const tail = [];
  let parent = g;
  for (let i = 0; i < 6; i++) {
    const seg = new THREE.Group();
    seg.position.set(0, i === 0 ? 0.42 : 0.1, i === 0 ? -0.38 : 0);
    seg.rotation.x = i === 0 ? -0.6 : -0.22;
    parent.add(seg);
    add(seg, new THREE.CylinderGeometry(0.035, 0.04, 0.12, 6), i % 2 ? dark : orange, [0, 0.05, 0]);
    tail.push(seg);
    parent = seg;
  }
  g.userData.parts = { head, legs, tail };
  return g;
}

const tmp = new THREE.Vector3();

/** Een bordje met tekst dat altijd naar de camera kijkt (Knokkie en zijn level). */
function makeLabel() {
  const canvas = document.createElement('canvas');
  canvas.width = 256;
  canvas.height = 64;
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: texture, depthWrite: false, transparent: true }));
  sprite.scale.set(1.2, 0.3, 1);
  sprite.renderOrder = 5;
  sprite.userData.draw = (text, color = '#9dff7a') => {
    const ctx = canvas.getContext('2d');
    ctx.clearRect(0, 0, 256, 64);
    ctx.font = 'bold 30px sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.lineWidth = 6;
    ctx.strokeStyle = 'rgba(0, 0, 0, 0.75)';
    ctx.strokeText(text, 128, 32);
    ctx.fillStyle = color;
    ctx.fillText(text, 128, 32);
    texture.needsUpdate = true;
  };
  return sprite;
}

export class Pet {
  /**
   * @param {THREE.Scene} scene
   * @param {import('./stats.js').Stats} stats  (stats.data.pets = { knokkie: { level, kills }, pluis: ... })
   * @param {string} kind  'knokkie' of 'pluis'
   * @param {THREE.Vector3} home  het dorpsplein: daar lopen ze omheen
   */
  constructor(scene, stats, kind, home) {
    this.stats = stats;
    this.kind = kind;
    this.home = home.clone();
    // Oude save: toen was er alleen Knokkie (stats.data.pet)
    const d = stats.data;
    d.pets ??= {};
    if (d.pet) {
      d.pets.knokkie ??= d.pet;
      delete d.pet;
    }
    delete d.activePet;
    this.mesh = new THREE.Group();
    this.body = new THREE.Group(); // wiebelt en leunt (de stoot)
    this.mesh.add(this.body);
    this.label = makeLabel();
    this.mesh.add(this.label);
    this.mesh.visible = false;
    scene.add(this.mesh);
    // Wat de vijanden in de arena van hem willen weten (net als van de speler)
    this.velocity = new THREE.Vector3();
    this.knockback = new THREE.Vector3();
    this.onGround = true;
    this.hp = this.maxHp;
    this.fighting = null; // in de arena: { target }
    this.cooldown = 0;
    this.punch = 0; // > 0: bezig met een stoot
    this.hops = 0;
    this.attackId = 0;
    this.time = Math.random() * 10;
    this.happy = 0; // > 0: springt blij (net nieuw, geaaid, of een level omhoog)
    this.wait = Math.random() * 3; // even stilstaan voor hij verder wandelt
    this.goal = null;
    if (kind === 'pluis') {
      this.model = buildCat();
      this.body.add(this.model);
    } else {
      this.model = new THREE.Group();
      this.body.add(this.model);
      loadGLB('models/extra/boks-dino.glb').then((gltf) => {
        const obj = gltf.scene.clone(true);
        const turned = new THREE.Group(); // het model kijkt opzij: een kwartslag draaien
        turned.add(obj);
        obj.rotation.y = Math.PI / 2;
        turned.updateMatrixWorld(true);
        const box = new THREE.Box3().setFromObject(turned);
        const s = 1 / (box.max.y - box.min.y); // 1 meter hoog (daarna geschaald per level)
        const center = box.getCenter(new THREE.Vector3());
        turned.scale.setScalar(s);
        turned.position.set(-center.x * s, -box.min.y * s, -center.z * s);
        turned.traverse((c) => {
          if (!c.isMesh) return;
          c.castShadow = true;
          // Een eigen kleur: blauwgroen, zodat je hem niet verwart met de boze Boks-Dino's
          c.material = c.material.clone();
          c.material.color?.lerp(new THREE.Color(0x3fd0c0), 0.45);
        });
        this.model.add(turned);
      }).catch(() => {
        const blob = new THREE.Mesh(new THREE.IcosahedronGeometry(0.45, 1), new THREE.MeshStandardMaterial({ color: 0x3fd0c0, flatShading: true }));
        blob.position.y = 0.45;
        this.model.add(blob);
      });
    }
    this.position.copy(this.home).add(new THREE.Vector3((Math.random() - 0.5) * 8, 0, (Math.random() - 0.5) * 8));
    this.refresh();
  }

  /** Instellingen van dit huisdier (PET met de eigen dingen uit PETS erover). */
  get cfg() {
    return { ...PET, ...PETS[this.kind] };
  }

  get name() {
    return this.cfg.name;
  }

  get data() {
    return this.stats.data.pets?.[this.kind] ?? null;
  }

  get owned() {
    return !!this.data;
  }

  get position() {
    return this.mesh.position;
  }

  get level() {
    return this.data?.level ?? 1;
  }

  get damage() {
    return Math.round(this.cfg.damage + (this.level - 1) * this.cfg.perLevel);
  }

  get maxHp() {
    return Math.round(this.cfg.hp + (this.level - 1) * this.cfg.hpPerLevel);
  }

  /** In de arena: nog niet flauwgevallen? */
  get alive() {
    return this.hp > 0;
  }

  /** Midden van zijn lijf (voor effecten). */
  get center() {
    return this.position.clone().setY(this.position.y + this.size * 0.5);
  }

  /** Grootte en bordje bijwerken (na een level omhoog). */
  refresh() {
    const cat = this.kind === 'pluis';
    const size = (cat ? 1.1 : 0.75) + (this.level - 1) * (cat ? 0.05 : 0.06); // ze groeien een beetje met hun level
    this.size = size;
    this.body.scale.setScalar(size);
    this.label.position.y = size * (cat ? 0.8 : 1) + 0.35;
    this.label.userData.draw(`${this.name} · Lv ${this.level}`, this.cfg.color);
    this.mesh.visible = this.owned && !this.away;
  }

  /** Een nieuw huisdier! Het verschijnt waar jij staat en loopt daarna rond in Muntdorp. */
  hatch(at) {
    this.stats.data.pets[this.kind] ??= { level: 1, kills: 0 };
    this.stats.save();
    this.position.copy(at).setY(0);
    this.happy = 1.5;
    this.hp = this.maxHp;
    this.refresh();
    play(this.kind === 'pluis' ? 'miauw' : 'pet');
  }

  /** Aaien! (E) */
  stroke() {
    this.happy = 1.4;
    this.wait = 2;
    play(this.kind === 'pluis' ? 'miauw' : 'pet');
  }

  /** In de arena geraakt (door een monster). Geeft de schade terug. */
  hurt(from, damage) {
    if (!this.alive) return 0;
    this.hp = Math.max(0, this.hp - damage);
    const away = this.position.clone().sub(from).setY(0);
    if (away.lengthSq() > 1e-6) this.knockback.copy(away.normalize().multiplyScalar(6));
    return damage;
  }

  /** Arena: vechten tegen dit monster (of null = terug naar huis). */
  startFight(target, at) {
    this.fighting = target ? { target } : null;
    this.hp = this.maxHp;
    if (at) this.position.copy(at);
    this.mesh.rotation.x = 0;
  }

  /** Een gevecht gewonnen: telt mee voor zijn level. Geeft true als hij een level omhoog ging. */
  addKill() {
    const d = this.data;
    if (!d) return false;
    d.kills++;
    if (d.level >= PET.maxLevel || d.kills < Math.ceil(d.level / 2)) return false; // (in de arena gaat het sneller)
    this.levelUp();
    return true;
  }

  /** Een level omhoog (door vechten, of met een huisdiersnoepje). */
  levelUp() {
    const d = this.data;
    if (!d || d.level >= PET.maxLevel) return false;
    d.kills = 0;
    d.level++;
    this.happy = 1.2;
    this.refresh();
    play('pet');
    return true;
  }

  /**
   * Elke frame. ctx = { player, colliders, away (in Omars kasteel: verstoppen) }
   * In de arena geeft hij { target, damage, id } terug op het moment dat een stoot raak is (arena.js doet de schade).
   */
  update(dt, ctx) {
    this.away = !!ctx.away;
    this.mesh.visible = this.owned && !this.away;
    if (!this.mesh.visible) return null;
    this.time += dt;
    this.cooldown -= dt;
    this.happy = Math.max(0, this.happy - dt);
    const pos = this.position;
    let goal = null;
    let speed = this.cfg.stroll;
    let hit = null;
    let lying = false;

    if (this.fighting) {
      // ---------- In de arena: vechten! ----------
      const target = this.fighting.target;
      if (!this.alive) lying = true; // flauwgevallen
      else if (target?.alive) {
        speed = this.cfg.speed;
        const reach = (target.type?.radius ?? 0.6) + this.cfg.radius + 0.55;
        const d = this.distTo(target);
        if (d > reach) goal = target.position;
        else {
          this.face(target.position, dt, 14);
          if (this.cooldown <= 0 && this.punch <= 0) {
            this.punch = 0.32;
            this.cooldown = this.cfg.cooldown;
            this.hitDone = false;
            play(this.kind === 'pluis' ? 'miauw' : 'petGrr');
          }
        }
        if (this.punch > 0 && !this.hitDone && this.punch < 0.18) {
          this.hitDone = true;
          this.attackId++;
          hit = { target, damage: this.damage, id: `${this.kind}-${this.attackId}` };
        }
      } else this.happy = Math.max(this.happy, 0.5); // gewonnen: blij springen
    } else {
      // ---------- In het dorp: rondscharrelen ----------
      const player = ctx.player;
      const toPlayer = Math.hypot(player.position.x - pos.x, player.position.z - pos.z);
      if (toPlayer < 6 && player.position.y < 1.5) {
        // Jij bent er! Kom eens kijken (maar niet tegen je aan)
        if (toPlayer > 1.8) goal = player.position;
        else this.face(player.position, dt, 6);
      } else {
        this.wait -= dt;
        if (!this.goal && this.wait <= 0) {
          const a = Math.random() * Math.PI * 2;
          const r = 2 + Math.random() * this.cfg.roam;
          this.goal = this.home.clone().add(new THREE.Vector3(Math.sin(a) * r, 0, Math.cos(a) * r));
        }
        goal = this.goal;
      }
    }

    let moving = false;
    if (goal) {
      const dx = goal.x - pos.x;
      const dz = goal.z - pos.z;
      const d = Math.hypot(dx, dz);
      if (d > 0.4) {
        const step = Math.min(d, speed * dt);
        pos.x += (dx / d) * step;
        pos.z += (dz / d) * step;
        this.face(goal, dt, 8);
        moving = true;
      } else if (goal === this.goal) {
        this.goal = null;
        this.wait = 1.5 + Math.random() * 4;
      }
    }
    pos.addScaledVector(this.knockback, dt);
    this.knockback.multiplyScalar(Math.exp(-8 * dt));
    if (this.stuck(moving, dt)) this.goal = null;
    this.pushOutOfBlocks(ctx.colliders);
    this.punch = Math.max(0, this.punch - dt);

    // Animatie: huppelen bij het lopen, naar voren leunen bij een stoot, blij springen, omvallen als hij flauwvalt
    if (moving) this.hops += dt * (speed > 4 ? 13 : 8);
    const hop = moving ? Math.abs(Math.sin(this.hops)) * (speed > 4 ? 0.18 : 0.08) : 0;
    const jump = this.happy > 0 ? Math.abs(Math.sin(this.happy * 9)) * 0.5 : 0;
    this.body.position.y = hop + jump;
    const lunge = this.punch > 0 ? Math.sin((1 - this.punch / 0.32) * Math.PI) : 0;
    this.body.position.z = lunge * 0.35;
    this.body.rotation.x = lunge * 0.35 + (moving ? 0.08 : 0);
    this.body.rotation.z = lying ? Math.PI / 2 : moving ? Math.sin(this.hops) * 0.08 : Math.sin(this.time * 2) * 0.03;
    if (lying) this.body.position.y = 0.2;
    // De kat: pootjes lopen en de staart zwiept
    if (this.kind === 'pluis') {
      const cat = this.model.userData.parts;
      if (!lying) this.body.position.y = jump + (moving ? Math.abs(Math.sin(this.hops)) * 0.05 : 0);
      cat.legs.forEach((leg, i) => (leg.rotation.x = moving ? Math.sin(this.hops + (i === 0 || i === 3 ? 0 : Math.PI)) * 0.6 : 0));
      cat.tail.forEach((seg, i) => (seg.rotation.z = Math.sin(this.time * (this.happy > 0 ? 8 : 3) - i * 0.5) * 0.18));
      cat.head.rotation.y = Math.sin(this.time * 0.7) * 0.25;
    }
    return hit;
  }

  /** Loopt hij al een tijdje tegen iets aan? Dan een ander plekje kiezen. */
  stuck(moving, dt) {
    const moved = this.lastPos ? this.position.distanceTo(this.lastPos) : 1;
    this.lastPos = this.position.clone();
    this.stuckT = moving && moved < 0.3 * dt * this.cfg.stroll ? (this.stuckT ?? 0) + dt : 0;
    return this.stuckT > 1;
  }

  distTo(t) {
    return Math.hypot(t.position.x - this.position.x, t.position.z - this.position.z);
  }

  face(p, dt, rate) {
    const goal = Math.atan2(p.x - this.position.x, p.z - this.position.z);
    const diff = Math.atan2(Math.sin(goal - this.mesh.rotation.y), Math.cos(goal - this.mesh.rotation.y));
    this.mesh.rotation.y += diff * Math.min(1, rate * dt);
  }

  /** Niet door bomen, stenen en muren lopen. */
  pushOutOfBlocks(colliders) {
    const pos = this.position;
    const r = this.cfg.radius;
    for (const b of collidersNear(colliders, pos.x, pos.z, r + 1, (this.nearList ??= []))) {
      if (b.min.y > 0.8 || b.max.y < 0.05) continue;
      const cx = THREE.MathUtils.clamp(pos.x, b.min.x, b.max.x);
      const cz = THREE.MathUtils.clamp(pos.z, b.min.z, b.max.z);
      const dx = pos.x - cx;
      const dz = pos.z - cz;
      const d = Math.hypot(dx, dz);
      if (d >= r) continue;
      if (d < 1e-4) {
        // Helemaal erin: naar de dichtstbijzijnde kant
        const out = [b.max.x - pos.x, pos.x - b.min.x, b.max.z - pos.z, pos.z - b.min.z];
        const k = out.indexOf(Math.min(...out));
        if (k === 0) pos.x = b.max.x + r;
        else if (k === 1) pos.x = b.min.x - r;
        else if (k === 2) pos.z = b.max.z + r;
        else pos.z = b.min.z - r;
        continue;
      }
      pos.x = cx + (dx / d) * r;
      pos.z = cz + (dz / d) * r;
    }
  }
}
