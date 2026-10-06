import * as THREE from 'three';
import { loadGLB } from './assets.js';
import { LEVEL } from './levels.js';

// Dingen die je oppakt door er doorheen te lopen:
//  - munten die uit verslagen vijanden spatten en naar je toe vliegen
//  - hartjes (KayKit) die vijanden soms laten vallen: een stuk leven terug
//  - verborgen diamanten (KayKit) overal in de wereld: veel munten!

// Verstopte diamanten: staan per level in levels.js. Zoek ze allemaal!
export const DIAMONDS = LEVEL.diamonds.map(([id, x, y, z]) => ({ id, position: new THREE.Vector3(x, y, z) }));
const DIAMOND_VALUE = 80;
const HEART_HEAL = 0.25; // 25% van je leven

export class Pickups {
  constructor(scene, stats) {
    this.scene = scene;
    this.stats = stats;
    this.coins = []; // vliegende munten (alleen voor het effect; de munten tel je meteen)
    this.hearts = [];
    this.diamonds = [];
    this.models = {};
    Promise.all(['models/kenney/coin.glb', 'models/kaykit/heart_teamRed.glb', 'models/kaykit/diamond_teamBlue.glb'].map((u) => loadGLB(u).catch(() => null))).then(
      ([coin, heart, diamond]) => {
        this.models = { coin, heart, diamond };
        for (const d of DIAMONDS) {
          if (stats.data.diamonds?.includes(d.id) || !diamond) continue;
          const mesh = diamond.scene.clone();
          mesh.scale.setScalar(0.6);
          mesh.position.copy(d.position).setY(d.position.y + 1);
          mesh.traverse((c) => {
            if (c.isMesh) {
              c.material = c.material.clone();
              c.material.emissive = new THREE.Color(0x2266ff);
              c.material.emissiveIntensity = 0.6;
              c.castShadow = true;
            }
          });
          scene.add(mesh);
          this.diamonds.push({ ...d, mesh });
        }
      }
    );
  }

  /** Munten laten wegspatten bij een verslagen vijand (ze vliegen daarna naar de speler). */
  coinBurst(position, amount) {
    if (!this.models.coin) return;
    const count = Math.min(12, Math.max(2, Math.round(amount / 8)));
    for (let i = 0; i < count; i++) {
      const mesh = this.models.coin.scene.clone();
      mesh.scale.setScalar(1.3);
      mesh.position.copy(position);
      this.scene.add(mesh);
      const a = Math.random() * Math.PI * 2;
      this.coins.push({ mesh, vel: new THREE.Vector3(Math.sin(a) * 3, 5 + Math.random() * 3, Math.cos(a) * 3), age: 0 });
    }
  }

  dropHeart(position) {
    if (!this.models.heart) return;
    const mesh = this.models.heart.scene.clone();
    mesh.scale.setScalar(0.55);
    mesh.position.copy(position).setY(1);
    this.scene.add(mesh);
    this.hearts.push({ mesh, age: 0 });
  }

  clearHearts() {
    for (const h of this.hearts) this.scene.remove(h.mesh);
    this.hearts.length = 0;
  }

  /**
   * @param {object} events  { onCoin(), onHeart() → true als opgepakt, onDiamond(diamond) }
   */
  update(dt, time, player, events) {
    const center = player.position.clone().setY(player.position.y + 0.9);

    // Munten: eerst omhoog spatten, dan naar de speler zuigen
    for (let i = this.coins.length - 1; i >= 0; i--) {
      const c = this.coins[i];
      c.age += dt;
      if (c.age < 0.45) {
        c.vel.y -= 18 * dt;
        c.mesh.position.addScaledVector(c.vel, dt);
        if (c.mesh.position.y < 0.2) c.mesh.position.y = 0.2;
      } else {
        const to = center.clone().sub(c.mesh.position);
        const speed = 8 + (c.age - 0.45) * 30;
        c.mesh.position.addScaledVector(to.normalize(), Math.min(speed * dt, to.length()));
      }
      c.mesh.rotation.y += dt * 12;
      if ((c.age > 0.45 && c.mesh.position.distanceTo(center) < 0.4) || c.age > 3) {
        this.scene.remove(c.mesh);
        this.coins.splice(i, 1);
        events.onCoin();
      }
    }

    // Hartjes: zweven, draaien, na 20 seconden weg
    for (let i = this.hearts.length - 1; i >= 0; i--) {
      const h = this.hearts[i];
      h.age += dt;
      h.mesh.rotation.y = time * 2.5;
      h.mesh.position.y = 1 + Math.sin(time * 3 + i) * 0.15;
      h.mesh.visible = h.age < 17 || Math.floor(h.age * 8) % 2 === 0;
      const close = h.mesh.position.distanceTo(center) < 1.2;
      if ((close && events.onHeart(HEART_HEAL)) || h.age > 20) {
        this.scene.remove(h.mesh);
        this.hearts.splice(i, 1);
      }
    }

    // Diamanten
    for (let i = this.diamonds.length - 1; i >= 0; i--) {
      const d = this.diamonds[i];
      d.mesh.rotation.y = time * 1.5;
      d.mesh.position.y = d.position.y + 1 + Math.sin(time * 2 + i) * 0.15;
      if (d.mesh.position.distanceTo(center) < 1.4) {
        this.scene.remove(d.mesh);
        this.diamonds.splice(i, 1);
        this.stats.data.diamonds = [...(this.stats.data.diamonds ?? []), d.id];
        events.onDiamond(d, DIAMOND_VALUE);
      }
    }
  }
}
