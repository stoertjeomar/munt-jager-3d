import * as THREE from 'three';
import { loadGLB } from './assets.js';
import { play } from './audio.js';

// ======================================================================
// Huisdieren die met je meevechten
// ======================================================================
//  - Knokkie het Boks-Dinootje: koop een Dino-ei bij de koopman. Hij stoot vijanden met zijn bokshandschoenen.
//  - Pluis de kat: koop haar in de sterrenwinkel. Ze is sneller en krabt vaker (maar iets zachter).
// Ze lopen overal met je mee, en elke vijand die ze verslaan telt mee: zo worden ze sterker (en een beetje groter).
// Er loopt er één tegelijk met je mee: wissel met P. Ze kunnen niet doodgaan.

export const PET = {
  speed: 7.5, // lopen (meter per seconde); rennen als hij ver achter je is
  sight: 9, // vijanden binnen deze afstand vallen hem op
  leash: 14, // verder dan dit van jou gaat hij niet weg om te vechten
  cooldown: 0.85, // tijd tussen twee stoten (seconden)
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
   * @param {import('./stats.js').Stats} stats  (stats.data.pets = { knokkie: { level, kills }, ... }, stats.data.activePet)
   */
  constructor(scene, stats) {
    this.stats = stats;
    // Oude save: toen was er alleen Knokkie (stats.data.pet)
    const d = stats.data;
    d.pets ??= {};
    if (d.pet) {
      d.pets.knokkie ??= d.pet;
      d.activePet ??= 'knokkie';
      delete d.pet;
    }
    this.mesh = new THREE.Group();
    this.body = new THREE.Group(); // wiebelt en leunt (de stoot)
    this.mesh.add(this.body);
    this.models = { knokkie: new THREE.Group(), pluis: buildCat() };
    for (const m of Object.values(this.models)) this.body.add(m);
    this.label = makeLabel();
    this.mesh.add(this.label);
    this.mesh.visible = false;
    scene.add(this.mesh);
    this.cooldown = 0;
    this.punch = 0; // > 0: bezig met een stoot
    this.hops = 0;
    this.target = null;
    this.attackId = 0;
    this.time = 0;
    this.happy = 0; // > 0: springt blij (net uit het ei, of een level omhoog)
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
      this.models.knokkie.add(turned);
    }).catch(() => {
      // Geen model? Dan een groen bolletje
      const blob = new THREE.Mesh(new THREE.IcosahedronGeometry(0.45, 1), new THREE.MeshStandardMaterial({ color: 0x3fd0c0, flatShading: true }));
      blob.position.y = 0.45;
      this.models.knokkie.add(blob);
    });
    this.refresh();
  }

  /** Welk huisdier loopt nu met je mee? ('knokkie', 'pluis' of null) */
  get kind() {
    const d = this.stats.data;
    return d.pets[d.activePet] ? d.activePet : Object.keys(d.pets)[0] ?? null;
  }

  /** Instellingen van dit huisdier (PET met de eigen dingen uit PETS erover). */
  get cfg() {
    return { ...PET, ...PETS[this.kind ?? 'knokkie'] };
  }

  get name() {
    return this.cfg.name;
  }

  get data() {
    return this.kind ? this.stats.data.pets[this.kind] : null;
  }

  get owned() {
    return !!this.data;
  }

  /** Heb je meer dan één huisdier? (dan kun je wisselen met P) */
  get canSwitch() {
    return Object.keys(this.stats.data.pets).length > 1;
  }

  /** P: een ander huisdier met je mee laten lopen. Geeft het nieuwe huisdier terug (of null). */
  switchPet() {
    const kinds = Object.keys(this.stats.data.pets);
    if (kinds.length < 2) return null;
    this.stats.data.activePet = kinds[(kinds.indexOf(this.kind) + 1) % kinds.length];
    this.target = null;
    this.happy = 1;
    this.refresh();
    play('pet');
    return this.kind;
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

  /** Grootte, model en bordje bijwerken (na een level omhoog of wisselen). */
  refresh() {
    const cat = this.kind === 'pluis';
    const size = (cat ? 1.1 : 0.75) + (this.level - 1) * (cat ? 0.05 : 0.06); // ze groeien een beetje met hun level
    this.size = size;
    this.body.scale.setScalar(size);
    for (const [kind, model] of Object.entries(this.models)) model.visible = kind === (this.kind ?? 'knokkie');
    const top = cat ? 0.8 : 1;
    this.label.position.y = size * top + 0.35;
    this.label.userData.draw(`${this.name} · Lv ${this.level}`, this.cfg.color);
    this.mesh.visible = this.owned && !this.away;
  }

  /** Een nieuw huisdier! (Knokkie uit het Dino-ei, Pluis uit de sterrenwinkel). Hij loopt meteen met je mee. */
  hatch(at, kind = 'knokkie') {
    this.stats.data.pets[kind] ??= { level: 1, kills: 0 };
    this.stats.data.activePet = kind;
    this.stats.save();
    this.position.copy(at).setY(0);
    this.happy = 1.5;
    this.refresh();
    play('pet');
  }

  /** Zijn plekje naast de speler: rechts naast je, een klein stukje erachter (niet tussen jou en de camera). */
  spotNear(pos, yaw, target = new THREE.Vector3()) {
    return target.set(pos.x - Math.cos(yaw) * 1.6 - Math.sin(yaw) * 0.4, 0, pos.z + Math.sin(yaw) * 1.6 - Math.cos(yaw) * 0.4);
  }

  /** Meteen naast de speler zetten (na snelreizen, of als hij te ver achter is geraakt). */
  placeNear(pos, yaw = 0) {
    this.spotNear(pos, yaw, this.position);
    this.mesh.rotation.y = yaw;
    this.target = null;
  }

  /** Knokkie verslaat een vijand: telt mee voor zijn level. Geeft true als hij een level omhoog ging. */
  addKill() {
    const d = this.data;
    if (!d) return false;
    d.kills++;
    if (d.level >= PET.maxLevel || d.kills < d.level * PET.killsPerLevel) return false;
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
   * Elke frame. ctx = { player, targets (vijanden en wakkere bosses), colliders, away (in Omars kasteel of zo: verstoppen) }
   * Geeft { target, damage, id } terug op het moment dat een stoot raak is (main.js doet de schade), anders null.
   */
  update(dt, ctx) {
    this.away = !!ctx.away;
    this.mesh.visible = this.owned && !this.away;
    if (!this.mesh.visible) return null;
    this.time += dt;
    this.cooldown -= dt;
    this.happy = Math.max(0, this.happy - dt);
    const player = ctx.player;
    const pos = this.position;
    const toPlayer = Math.hypot(player.position.x - pos.x, player.position.z - pos.z);
    // Heel ver weg (snelreizen, of je vliegt op de draak)? Dan komt hij je achterna als je weer op de grond staat
    if (toPlayer > 35 && player.position.y < 1.5) {
      this.placeNear(player.position, player.mesh.rotation.y);
      play('pet');
    }

    // Een doel kiezen: de dichtstbijzijnde vijand bij hem, niet te ver van jou
    if (this.target && (!this.target.alive || this.target.awake === false || this.distTo(this.target) > this.cfg.sight * 1.6)) this.target = null;
    if (!this.target && this.cooldown < 0.3) {
      let best = null;
      let bestD = this.cfg.sight;
      for (const t of ctx.targets) {
        if (!t.alive || t.type?.dummy) continue;
        if (Math.hypot(t.position.x - player.position.x, t.position.z - player.position.z) > this.cfg.leash) continue;
        if (t.position.y > 2.5) continue; // vliegt te hoog
        const d = this.distTo(t);
        if (d < bestD) {
          best = t;
          bestD = d;
        }
      }
      this.target = best;
    }

    // Waar wil ik heen?
    let goal = null;
    let speed = this.cfg.speed;
    let hit = null;
    if (this.target) {
      const reach = (this.target.type?.radius ?? 0.6) + this.cfg.radius + 0.55;
      const d = this.distTo(this.target);
      if (d > reach) goal = this.target.position;
      else {
        this.face(this.target.position, dt, 14);
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
        hit = { target: this.target, damage: this.damage, id: `${this.kind}-${this.attackId}` };
      }
      speed *= 1.4;
    } else if (toPlayer > 2.8) {
      // Met je mee (naast je)
      goal = this.spotNear(player.position, player.mesh.rotation.y, tmp);
      if (toPlayer > 8) speed *= 1.9; // rennen om bij te blijven
    }
    let moving = false;
    if (goal) {
      const dx = goal.x - pos.x;
      const dz = goal.z - pos.z;
      const d = Math.hypot(dx, dz);
      if (d > 0.3) {
        const step = Math.min(d, speed * dt);
        pos.x += (dx / d) * step;
        pos.z += (dz / d) * step;
        this.face(goal, dt, 10);
        moving = true;
      }
    }
    this.pushOutOfBlocks(ctx.colliders);
    this.punch = Math.max(0, this.punch - dt);

    // Animatie: huppelen bij het lopen, naar voren leunen bij een stoot, blij springen
    if (moving) this.hops += dt * 13;
    const hop = moving ? Math.abs(Math.sin(this.hops)) * 0.18 : 0;
    const jump = this.happy > 0 ? Math.abs(Math.sin(this.happy * 9)) * 0.5 : 0;
    this.body.position.y = hop + jump;
    const lunge = this.punch > 0 ? Math.sin((1 - this.punch / 0.32) * Math.PI) : 0;
    this.body.position.z = lunge * 0.35;
    this.body.rotation.x = lunge * 0.35 + (moving ? 0.08 : 0);
    this.body.rotation.z = moving ? Math.sin(this.hops) * 0.08 : Math.sin(this.time * 2) * 0.03;
    // De kat: pootjes lopen en de staart zwiept
    const cat = this.models.pluis.userData.parts;
    if (this.kind === 'pluis') {
      this.body.position.y = jump + (moving ? Math.abs(Math.sin(this.hops)) * 0.05 : 0);
      cat.legs.forEach((leg, i) => (leg.rotation.x = moving ? Math.sin(this.hops + (i === 0 || i === 3 ? 0 : Math.PI)) * 0.6 : 0));
      cat.tail.forEach((seg, i) => (seg.rotation.z = Math.sin(this.time * 3 - i * 0.5) * 0.18));
      cat.head.rotation.y = Math.sin(this.time * 0.7) * 0.25;
    }
    return hit;
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
    for (const b of colliders) {
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
