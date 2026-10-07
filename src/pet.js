import * as THREE from 'three';
import { loadGLB } from './assets.js';
import { play } from './audio.js';

// ======================================================================
// Knokkie: je eigen Boks-Dinootje
// ======================================================================
// Koop een Dino-ei bij de koopman: er komt Knokkie uit. Hij loopt overal met je mee en vecht mee:
// hij stoot vijanden in de buurt met zijn bokshandschoenen. Elke vijand die hij verslaat telt mee,
// en zo wordt hij steeds sterker (en een beetje groter). Hij kan niet doodgaan.

export const PET = {
  name: 'Knokkie',
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
  sprite.userData.draw = (text) => {
    const ctx = canvas.getContext('2d');
    ctx.clearRect(0, 0, 256, 64);
    ctx.font = 'bold 30px sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.lineWidth = 6;
    ctx.strokeStyle = 'rgba(0, 0, 0, 0.75)';
    ctx.strokeText(text, 128, 32);
    ctx.fillStyle = '#9dff7a';
    ctx.fillText(text, 128, 32);
    texture.needsUpdate = true;
  };
  return sprite;
}

export class Pet {
  /**
   * @param {THREE.Scene} scene
   * @param {import('./stats.js').Stats} stats  (stats.data.pet = { level, kills } als je hem hebt)
   */
  constructor(scene, stats) {
    this.stats = stats;
    this.mesh = new THREE.Group();
    this.body = new THREE.Group(); // wiebelt en leunt (de stoot)
    this.mesh.add(this.body);
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
      this.body.add(turned);
    }).catch(() => {
      // Geen model? Dan een groen bolletje met oogjes
      const blob = new THREE.Mesh(new THREE.IcosahedronGeometry(0.45, 1), new THREE.MeshStandardMaterial({ color: 0x3fd0c0, flatShading: true }));
      blob.position.y = 0.45;
      this.body.add(blob);
    });
    this.refresh();
  }

  get data() {
    return this.stats.data.pet ?? null;
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
    return PET.damage + (this.level - 1) * PET.perLevel;
  }

  /** Grootte en bordje bijwerken (na een level omhoog). */
  refresh() {
    const size = 0.75 + (this.level - 1) * 0.06; // groeit van 0,75 tot ruim 1,3 meter
    this.size = size;
    this.body.scale.setScalar(size);
    this.label.position.y = size + 0.35;
    this.label.userData.draw(`${PET.name} · Lv ${this.level}`);
    this.mesh.visible = this.owned && !this.away;
  }

  /** Uit het ei: Knokkie is er! */
  hatch(at) {
    this.stats.data.pet = { level: 1, kills: 0 };
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
    if (this.target && (!this.target.alive || this.target.awake === false || this.distTo(this.target) > PET.sight * 1.6)) this.target = null;
    if (!this.target && this.cooldown < 0.3) {
      let best = null;
      let bestD = PET.sight;
      for (const t of ctx.targets) {
        if (!t.alive || t.type?.dummy) continue;
        if (Math.hypot(t.position.x - player.position.x, t.position.z - player.position.z) > PET.leash) continue;
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
    let speed = PET.speed;
    let hit = null;
    if (this.target) {
      const reach = (this.target.type?.radius ?? 0.6) + PET.radius + 0.55;
      const d = this.distTo(this.target);
      if (d > reach) goal = this.target.position;
      else {
        this.face(this.target.position, dt, 14);
        if (this.cooldown <= 0 && this.punch <= 0) {
          this.punch = 0.32;
          this.cooldown = PET.cooldown;
          this.hitDone = false;
          play('petGrr');
        }
      }
      if (this.punch > 0 && !this.hitDone && this.punch < 0.18) {
        this.hitDone = true;
        this.attackId++;
        hit = { target: this.target, damage: this.damage, id: `knokkie-${this.attackId}` };
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
    const r = PET.radius;
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
