import * as THREE from 'three';

// Alles wat vijanden door de lucht laten vliegen: energieballen van de Mecha en vuurballen van Mario.
// Ze raken alleen de speler.

const MAX_LIFE = 3;

// Vormen en materialen worden gedeeld door alle projectielen (anders lekt er geheugen weg)
const shared = {};
function sharedGeo(key, make) {
  shared[key] ??= make();
  return shared[key];
}

export class Projectiles {
  constructor(scene) {
    this.scene = scene;
    this.list = [];
  }

  /**
   * @param {object} p
   *   from, dir (Vector3), speed, damage
   *   kind: 'energy' | 'fire'
   *   radius (raak-afstand), gravity (0 = rechtdoor), bounces (hoe vaak stuiteren op de grond)
   */
  spawn(p) {
    const proj = {
      pos: p.from.clone(),
      vel: p.dir.clone().normalize().multiplyScalar(p.speed),
      damage: p.damage,
      kind: p.kind,
      radius: p.radius ?? 0.4,
      gravity: p.gravity ?? 0,
      bounces: p.bounces ?? 0,
      id: `proj-${Math.random()}`,
      age: 0,
      life: p.life ?? MAX_LIFE,
    };
    proj.mesh = this.buildMesh(p.kind, p.color);
    proj.mesh.position.copy(proj.pos);
    this.scene.add(proj.mesh);
    this.list.push(proj);
    return proj;
  }

  buildMesh(kind, color) {
    // Energie- en vuurballen: een gloeiende bol met een zachte gloed eromheen
    const c = color ?? (kind === 'fire' ? 0xff7a1a : 0x5ff0ff);
    const holder = new THREE.Group();
    const small = kind === 'fire' ? 0.35 : 0.45;
    const big = kind === 'fire' ? 0.6 : 0.8;
    holder.add(new THREE.Mesh(
      sharedGeo(`core${small}`, () => new THREE.SphereGeometry(small, 14, 10)),
      sharedGeo('coreMat', () => new THREE.MeshBasicMaterial({ color: 0xffffff, toneMapped: false }))
    ));
    holder.add(new THREE.Mesh(
      sharedGeo(`glow${big}`, () => new THREE.SphereGeometry(big, 14, 10)),
      sharedGeo(`glowMat${c}`, () => new THREE.MeshBasicMaterial({ color: c, transparent: true, opacity: 0.45, depthWrite: false, toneMapped: false }))
    ));
    return holder;
  }

  remove(i) {
    this.scene.remove(this.list[i].mesh);
    this.list.splice(i, 1);
  }

  clear() {
    for (const p of this.list) this.scene.remove(p.mesh);
    this.list.length = 0;
  }

  /**
   * @param {object} ctx  { player, hurtPlayer(from, dmg), colliders, effects }
   */
  update(dt, ctx) {
    for (let i = this.list.length - 1; i >= 0; i--) {
      const p = this.list[i];
      p.age += dt;
      p.vel.y -= p.gravity * dt;
      const step = p.vel.clone().multiplyScalar(dt);
      p.pos.add(step);
      p.mesh.position.copy(p.pos);
      if (p.vel.lengthSq() > 0.01) p.mesh.lookAt(p.pos.clone().add(p.vel));

      // Spoor van vonkjes
      if (p.kind === 'fire' && Math.random() < 0.6) ctx.effects.burst(p.pos, Math.random() < 0.5 ? 0xff7a1a : 0xffd23a, { count: 1, speed: 0.5, size: 0.12, life: 0.3, up: 0.5, gravity: 0 });
      if (p.kind === 'energy' && Math.random() < 0.5) ctx.effects.burst(p.pos, 0x5ff0ff, { count: 1, speed: 0.4, size: 0.1, life: 0.25, up: 0, gravity: 0 });

      let dead = p.age > p.life;

      // Grond: stuiteren (vuurballen) of ontploffen
      if (p.pos.y < 0.15) {
        if (p.bounces > 0) {
          p.bounces--;
          p.pos.y = 0.15;
          p.vel.y = Math.abs(p.vel.y) * 0.7;
        } else dead = true;
      }

      // Muren, bomen, rotsen
      if (!dead) {
        for (const box of ctx.colliders) {
          if (box.containsPoint(p.pos)) {
            dead = true;
            break;
          }
        }
      }

      if (!dead) {
        const pl = ctx.player.position;
        const center = new THREE.Vector3(pl.x, pl.y + 0.9, pl.z);
        if (center.distanceTo(p.pos) < 0.7 + p.radius) {
          ctx.hurtPlayer(p.pos, p.damage);
          dead = true;
        }
      }

      if (dead) {
        const color = p.kind === 'fire' ? 0xff7a1a : p.kind === 'energy' ? 0x5ff0ff : 0xffe27a;
        ctx.effects.burst(p.pos, color, { count: 14, speed: 4, size: 0.1, life: 0.35 });
        if (p.kind === 'energy' || p.kind === 'fire') ctx.effects.shockwave(p.pos.clone().setY(Math.max(0, p.pos.y - 0.5)), color, 1.6);
        this.remove(i);
      }
    }
  }
}
