import * as THREE from 'three';
import { makeBolt, makeBoltBetween, Bolts } from './lightning.js';
import { WEAPONS } from './weapons.js';
import { play } from './audio.js';

// NightWalker: het bliksemzwaard van Sky (zeldzame buit, zie sky.js). Het wapen zelf staat in weapons.js;
// hier staan zijn extra krachten, als jij hem vasthoudt:
//
//  - Zap! Elke klap (M1 / klik) knettert van de stroom.
//  - Elke 3e klap die raak is: de bliksem slaat in op je vijand (en raakt ook wie ernaast staat).
//  - Een wolken-aura om je heen, met gele vonkjes.
//  - Dash (C): je wordt even een wolk! Je lijf verdwijnt en een wolkje met bliksem schiet vooruit.

// ---------- Instellingen ----------
export const NIGHTWALKER = {
  every: 3, // elke zoveelste raak-klap slaat de bliksem in
  strikeDamage: 0.8, // de bliksem doet zoveel keer jouw gewone schade
  strikeRadius: 2.6, // zo ver om de inslag heen raakt hij ook andere vijanden
};

const CLOUD = [0xf4f7fc, 0xd8e0ec, 0xb4c0d4];
const pick = (list) => list[Math.floor(Math.random() * list.length)];

export class NightWalker {
  /** @param {object} ctx  { scene, player, effects } */
  constructor({ scene, player, effects }) {
    this.player = player;
    this.effects = effects;
    this.bolts = new Bolts(scene);
    this.hits = 0; // raak-klappen (bij elke 3e: bliksem!)
    this.auraTimer = 0;
    this.wasDashing = false;
  }

  /** Heb je NightWalker in je hand? */
  get active() {
    return !!WEAPONS[this.player.sword.weaponKey]?.lightning;
  }

  /** Je slaat (via handleActions in main.js): zap! */
  onSwing() {
    if (!this.active) return;
    play('zap');
    // Een vonkenregen van het lemmet
    this.player.mesh.updateMatrixWorld(true);
    const base = new THREE.Vector3();
    const tip = new THREE.Vector3();
    this.player.sword.getBladeWorld(base, tip);
    this.effects.burst(tip, 0xffe066, { count: 6, speed: 3, size: 0.07, life: 0.3, up: 0.5, gravity: 0 });
  }

  /**
   * Je zwaard raakte iets. Geeft true terug als het nu de 3e keer is: dan slaat de bliksem in (main.js doet de schade).
   */
  countHit() {
    if (!this.active) return false;
    this.hits++;
    if (this.hits < NIGHTWALKER.every) return false;
    this.hits = 0;
    return true;
  }

  /** BOEM: de bliksem slaat in op deze plek (alleen het plaatje en het geluid; de schade doet main.js). */
  strike(pos) {
    const at = pos.clone().setY(0);
    this.bolts.add(makeBolt(at, { color: 'geel', width: 1.6, branches: 2, height: 16 }), 0.25);
    play('donder');
    play('zap');
    this.effects.shockwave(at, 0xffe066, NIGHTWALKER.strikeRadius);
    this.effects.burst(at.clone().setY(0.4), 0xfff3b0, { count: 26, speed: 7, size: 0.12, life: 0.5, up: 3 });
    this.effects.puff(at.clone().setY(1), pick(CLOUD), { count: 6, speed: 2, size: 1, life: 0.7, up: 0.6 });
    this.effects.shake(0.3);
  }

  /** Een wolk met een knetterend bliksempje (aan het begin en eind van de wolk-dash). */
  poof(at) {
    const c = at.clone().setY(at.y + 0.9);
    this.effects.puff(c, CLOUD[0], { count: 10, speed: 2.5, size: 1, life: 0.7, up: 0.4 });
    this.effects.burst(c, 0xffe066, { count: 10, speed: 5, size: 0.07, life: 0.3, up: 0.5, gravity: 0 });
    const from = c.clone().add(new THREE.Vector3((Math.random() - 0.5) * 1.2, 0.7, (Math.random() - 0.5) * 1.2));
    this.bolts.add(makeBoltBetween(from, c.clone().setY(at.y), { color: 'geel', width: 0.5, wiggle: 0.3, segments: 5 }), 0.1);
  }

  /** Elke frame: de wolk-dash, de aura en de bliksems. */
  update(dt) {
    const p = this.player;
    this.bolts.update(dt);
    const active = this.active;
    // Wolk-dash: tijdens de dash is je lijf weg, en schiet er een wolkje vooruit
    const dashing = active && p.dashTimer > 0;
    p.inner.visible = !dashing;
    if (dashing && !this.wasDashing) {
      this.poof(p.position);
      play('poef');
      play('zap');
    }
    if (dashing && dt > 0) {
      const at = p.position.clone().setY(p.position.y + 0.9);
      this.effects.puff(at, pick(CLOUD), { count: 2, speed: 0.6, size: 1.1, life: 0.55, up: 0.2 });
      if (Math.random() < 0.5) this.effects.burst(at, 0xffe066, { count: 2, speed: 3, size: 0.06, life: 0.25, up: 0, gravity: 0 });
    }
    if (!dashing && this.wasDashing) this.poof(p.position);
    this.wasDashing = dashing;
    if (!active || dt <= 0 || !p.mesh.visible) return;
    // Wolken-aura met gele vonkjes
    this.auraTimer -= dt;
    if (this.auraTimer > 0) return;
    this.auraTimer = 0.09;
    const a = Math.random() * Math.PI * 2;
    const r = 0.35 + Math.random() * 0.3;
    const at = p.position.clone().add(new THREE.Vector3(Math.sin(a) * r, 0.1 + Math.random() * 1.4, Math.cos(a) * r));
    if (Math.random() < 0.75) this.effects.puff(at, pick(CLOUD), { size: 0.32, life: 0.9, up: 0.5, opacity: 0.35 });
    else this.effects.burst(at, 0xffe066, { count: 2, speed: 1.5, size: 0.05, life: 0.3, up: 0.6, gravity: 0 });
  }
}
