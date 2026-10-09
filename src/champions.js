import * as THREE from 'three';
import { play } from './audio.js';
import { REGIONS } from './levels.js';
import { ENEMY_TYPES } from './enemies.js';

// ======================================================================
// Kampioenen: gouden vijanden met een kroon
// ======================================================================
// In elk gebied waar je al bent geweest loopt af en toe één Kampioen rond: een gewone vijand,
// maar groter, goud, met een kroon, VEEL meer leven en hij slaat harder. Op de minimap zie je hem als 👑.
// Versla je hem, dan krijg je een hoop munten en een ⭐ ster. Een paar minuten later komt er een nieuwe.

export const CHAMPION = {
  hp: 3.2, // keer zoveel leven
  damage: 1.5, // keer zoveel schade (zie main.js)
  size: 1.35, // keer zo groot
  runes: 5, // keer zoveel munten
  firstAfter: 45, // na zoveel seconden komt de eerste in een gebied
  every: [150, 240], // daarna steeds tussen deze aantallen seconden na het verslaan
};

/** Een gouden kroon (zweeft boven zijn hoofd en draait rond). */
function makeCrown() {
  const crown = new THREE.Group();
  const gold = new THREE.MeshStandardMaterial({ color: 0xffd23a, emissive: 0x8a6a00, emissiveIntensity: 0.9, metalness: 0.7, roughness: 0.3 });
  const ring = new THREE.Mesh(new THREE.CylinderGeometry(0.28, 0.3, 0.16, 12, 1, true), gold);
  ring.material.side = THREE.DoubleSide;
  crown.add(ring);
  for (let i = 0; i < 5; i++) {
    const a = (i / 5) * Math.PI * 2;
    const tip = new THREE.Mesh(new THREE.ConeGeometry(0.07, 0.2, 4), gold);
    tip.position.set(Math.sin(a) * 0.27, 0.17, Math.cos(a) * 0.27);
    crown.add(tip);
  }
  const gem = new THREE.Mesh(new THREE.OctahedronGeometry(0.07, 0), new THREE.MeshBasicMaterial({ color: 0xff3a6a, toneMapped: false }));
  gem.position.set(0, 0.05, 0.3);
  crown.add(gem);
  return crown;
}

export class Champions {
  /**
   * @param {object} game  { stats, effects, addEnemy(type, x, z), removeEnemy(e), ui }
   */
  constructor(game) {
    this.game = game;
    this.list = []; // { region, enemy, timer }
    this.slots = REGIONS.map((r) => ({ region: r, enemy: null, timer: CHAMPION.firstAfter + r.index * 20 }));
  }

  /** Elke frame. ok = mag er nu een kampioen bijkomen? (niet in Omars kasteel e.d.) */
  update(dt, playerPos, ok) {
    const flags = this.game.stats.data.flags;
    for (const slot of this.slots) {
      const e = slot.enemy;
      if (e) {
        // De kroon draait en zweeft
        if (e.crown) {
          e.crown.rotation.y += dt * 1.5;
          e.crown.position.y = e.type.height * CHAMPION.size + 0.35 + Math.sin(performance.now() / 300) * 0.06;
          e.crown.visible = e.alive;
        }
        if (Math.random() < 0.15 && e.alive && e.mesh.visible) {
          this.game.effects.burst(e.center, 0xffd23a, { count: 1, speed: 1, size: 0.08, life: 0.6, up: 1.2, gravity: 0 });
        }
        if (!e.alive && e.dying <= 0) {
          // Verslagen (en klaar met omvallen): weghalen, en over een tijdje komt er een nieuwe
          this.game.removeEnemy(e);
          slot.enemy = null;
          slot.timer = CHAMPION.every[0] + Math.random() * (CHAMPION.every[1] - CHAMPION.every[0]);
        }
        continue;
      }
      if (!ok || !flags.includes(slot.region.start)) continue;
      slot.timer -= dt;
      if (slot.timer <= 0) this.spawn(slot, playerPos);
    }
  }

  /** Een kampioen neerzetten: ergens langs het pad van het gebied, niet vlak bij de speler. */
  spawn(slot, playerPos) {
    const r = slot.region;
    const kinds = r.level.spawns.map(([k]) => k).filter((k) => !ENEMY_TYPES[k].dummy && !ENEMY_TYPES[k].flies);
    const kind = kinds[Math.floor(Math.random() * kinds.length)];
    const path = r.level.path;
    let x = 0;
    let z = 0;
    for (let tries = 0; tries < 20; tries++) {
      const i = 1 + Math.floor(Math.random() * (path.length - 3));
      const [lx, lz] = path[i];
      [x, z] = r.t(lx + (Math.random() - 0.5) * 16, lz + (Math.random() - 0.5) * 10);
      if (Math.hypot(x - playerPos.x, z - playerPos.z) > 25) break;
    }
    const e = this.game.addEnemy(kind, x, z);
    e.summoned = false;
    e.champion = true;
    e.hpScale = CHAMPION.hp;
    e.hp = e.maxHp;
    e.body.scale.setScalar(CHAMPION.size);
    e.healthBar.position.y = e.type.height * CHAMPION.size + 0.45;
    e.healthBar.scale.setScalar(1.3);
    // Goud glanzen (zodra het model er is), en een kroon
    e.crown = makeCrown();
    e.mesh.add(e.crown);
    e.goldTimer = setInterval(() => {
      const mats = e.model?.materials ?? [];
      if (!mats.length && e.type.model) return;
      for (const m of mats) {
        m.emissive?.set(0x6a4a00);
        if (m.emissive) m.emissiveIntensity = 0.7;
      }
      e.baseGlow = mats.map((m) => ({ color: m.emissive.clone(), intensity: m.emissiveIntensity }));
      clearInterval(e.goldTimer);
    }, 300);
    slot.enemy = e;
    return e;
  }

  /** Een kampioen is verslagen: meer munten (de ster geeft main.js). */
  bonusRunes(e) {
    return Math.round(e.type.runes * (CHAMPION.runes - 1));
  }

  /** Voor de minimap: een gouden kroon waar ze lopen. */
  mapMarkers() {
    return this.slots.filter((s) => s.enemy?.alive).map((s) => ({ x: s.enemy.position.x, z: s.enemy.position.z, icon: '👑', color: '#ffd23a' }));
  }

  /** Na doodgaan zijn alle vijanden weer heel: de kampioenen ook. */
  resetAll() {
    for (const s of this.slots) if (s.enemy?.alive) s.enemy.hp = s.enemy.maxHp;
  }

  /** Bij het verslaan: een geluidje en goud. */
  celebrate(e) {
    play('win');
    this.game.effects.burst(e.center, 0xffd23a, { count: 40, speed: 6, size: 0.14, life: 1, up: 4 });
  }
}
