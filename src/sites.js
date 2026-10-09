import * as THREE from 'three';
import { createWeaponMesh } from './weapons.js';
import { createHelmetMesh } from './gear.js';

// Plekken in de wereld: checkpoint-vlaggen en kisten.

const INTERACT_RANGE = 2.6;

// ---------- Checkpoint-vlag ----------
// Loop je erlangs, dan wordt de vlag goud en kom je hier terug als je doodgaat.

const FLAG_GREY = new THREE.Color(0xb8b8b8);
const FLAG_GOLD = new THREE.Color(0xffc93a);

class Checkpoint {
  constructor(scene, def) {
    this.id = def.id;
    this.name = def.name;
    this.position = def.position.clone();
    this.group = new THREE.Group();
    this.group.position.copy(this.position).add(new THREE.Vector3(1.4, 0, 0));
    scene.add(this.group);

    // Stenen voetje, paal en een knop bovenop
    const stone = new THREE.Mesh(new THREE.CylinderGeometry(0.45, 0.55, 0.25, 10), new THREE.MeshStandardMaterial({ color: 0x8d8a85, roughness: 0.9, flatShading: true }));
    stone.position.y = 0.12;
    const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.07, 3.2, 8), new THREE.MeshStandardMaterial({ color: 0xd8d8d8, metalness: 0.5, roughness: 0.35 }));
    pole.position.y = 1.6;
    this.knob = new THREE.Mesh(new THREE.SphereGeometry(0.13, 12, 10), new THREE.MeshStandardMaterial({ color: 0xffd76a, metalness: 0.5, roughness: 0.3, emissive: 0x000000 }));
    this.knob.position.y = 3.25;
    for (const m of [stone, pole, this.knob]) m.castShadow = true;
    this.group.add(stone, pole, this.knob);

    // De vlag zelf: een plat doek dat wappert (de punten bewegen in update)
    const geo = new THREE.PlaneGeometry(1.3, 0.8, 10, 4);
    geo.translate(0.65, 0, 0);
    this.flagBase = geo.attributes.position.array.slice();
    this.flagMat = new THREE.MeshStandardMaterial({ color: FLAG_GREY.clone(), roughness: 0.8, side: THREE.DoubleSide, emissive: 0x000000 });
    this.flag = new THREE.Mesh(geo, this.flagMat);
    this.flag.position.set(0.06, 2.75, 0);
    this.flag.castShadow = true;
    this.group.add(this.flag);
  }

  update(time, reached) {
    // Wapperen: hoe verder van de paal, hoe meer het doek golft
    const pos = this.flag.geometry.attributes.position;
    for (let i = 0; i < pos.count; i++) {
      const x = this.flagBase[i * 3];
      pos.setZ(i, Math.sin(time * 5 + x * 4) * 0.12 * x);
      pos.setY(i, this.flagBase[i * 3 + 1] - x * 0.05);
    }
    pos.needsUpdate = true;
    this.flag.geometry.computeVertexNormals();
    this.flagMat.color.lerp(reached ? FLAG_GOLD : FLAG_GREY, 0.1);
    this.flagMat.emissive.setHex(reached ? 0x3a2a00 : 0x000000);
    this.knob.material.emissive.setHex(reached ? 0x8a6a00 : 0x000000);
  }
}

// ---------- Kist ----------

class Chest {
  constructor(scene, def, opened) {
    this.id = def.id;
    this.item = def.item;
    this.position = def.position.clone();
    this.opened = opened;
    this.group = new THREE.Group();
    this.group.position.copy(this.position);
    scene.add(this.group);

    const wood = new THREE.MeshStandardMaterial({ color: 0x7a4a25, roughness: 0.8 });
    const gold = new THREE.MeshStandardMaterial({ color: 0xe0b040, metalness: 0.6, roughness: 0.35 });
    const box = new THREE.Mesh(new THREE.BoxGeometry(1.1, 0.6, 0.7), wood);
    box.position.y = 0.3;
    box.castShadow = true;
    this.group.add(box);
    for (const x of [-0.45, 0.45]) {
      const band = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.62, 0.72), gold);
      band.position.set(x, 0.3, 0);
      this.group.add(band);
    }
    // Deksel aan een scharnier achteraan
    this.lid = new THREE.Group();
    this.lid.position.set(0, 0.6, -0.35);
    const lidMesh = new THREE.Mesh(new THREE.BoxGeometry(1.12, 0.22, 0.72), wood);
    lidMesh.position.set(0, 0.11, 0.35);
    lidMesh.castShadow = true;
    const lock = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.18, 0.06), gold);
    lock.position.set(0, 0.02, 0.72);
    this.lid.add(lidMesh, lock);
    this.group.add(this.lid);

    // Gloed zolang hij dicht is
    this.glow = new THREE.Mesh(
      new THREE.RingGeometry(0.8, 1.1, 32),
      new THREE.MeshBasicMaterial({ color: 0xffd76a, transparent: true, opacity: 0.5, side: THREE.DoubleSide, depthWrite: false, toneMapped: false })
    );
    this.glow.rotation.x = -Math.PI / 2;
    this.glow.position.y = 0.03;
    this.group.add(this.glow);

    this.openTimer = 0;
    this.prize = null;
    this.setOpened(opened);
  }

  setOpened(opened) {
    this.opened = opened;
    this.lid.rotation.x = opened ? -1.9 : 0;
    this.glow.visible = !opened;
  }

  /** Deksel open en het voorwerp zweeft omhoog. */
  open() {
    this.opened = true;
    this.glow.visible = false;
    this.openTimer = 1.4;
    const item = this.item;
    if (item.kind === 'weapon') this.prize = createWeaponMesh(item.key);
    else if (item.kind === 'helmet') {
      this.prize = createHelmetMesh(item.key);
      this.prize.scale.setScalar(0.3);
    } else {
      this.prize = new THREE.Mesh(new THREE.IcosahedronGeometry(0.2, 0), new THREE.MeshBasicMaterial({ color: 0xffd76a, toneMapped: false }));
    }
    this.prize.position.set(0, 0.5, 0.1);
    this.group.add(this.prize);
  }

  update(dt, time) {
    if (!this.opened) this.glow.material.opacity = 0.35 + Math.sin(time * 3) * 0.2;
    if (this.openTimer > 0) {
      this.openTimer -= dt;
      const k = 1 - this.openTimer / 1.4;
      this.lid.rotation.x = -1.9 * Math.min(1, k * 4);
      this.prize.position.y = 0.5 + Math.min(1, k * 2) * 1.2;
      this.prize.rotation.y = time * 4;
      if (this.openTimer <= 0) {
        this.group.remove(this.prize);
        this.prize = null;
      }
    }
  }
}

export class Sites {
  /**
   * @param {THREE.Scene} scene
   * @param {object} defs  { checkpoints, chests } uit world.js
   * @param {import('./stats.js').Stats} stats
   */
  constructor(scene, defs, stats) {
    this.stats = stats;
    this.checkpoints = defs.checkpoints.map((c) => new Checkpoint(scene, c));
    this.chests = defs.chests.map((c) => new Chest(scene, c, stats.data.chests.includes(c.id)));
  }

  checkpoint(id) {
    return this.checkpoints.find((c) => c.id === id);
  }

  /** Staat er een kist dichtbij die je kunt openen? Geeft { kind, target } of null. */
  nearbyInteraction(pos) {
    for (const c of this.chests) {
      if (c.opened) continue;
      if (Math.hypot(c.position.x - pos.x, c.position.z - pos.z) < INTERACT_RANGE && Math.abs(pos.y - c.position.y) < 1.5) return { kind: 'chest', target: c };
    }
    return null;
  }

  /**
   * Kom je langs een vlag (die niet al je terugkom-plek is)? Dan wordt dat je nieuwe terugkom-plek,
   * en kun je er later heen snelreizen. Geeft { checkpoint, first } terug (first = nieuwe vlag), of null.
   */
  reachCheckpoint(pos) {
    const d = this.stats.data;
    for (const c of this.checkpoints) {
      if (c.id === d.checkpoint || Math.hypot(c.position.x - pos.x, c.position.z - pos.z) >= 4 || Math.abs(c.position.y - pos.y) > 3) continue;
      const first = !d.flags.includes(c.id);
      if (first) d.flags.push(c.id);
      d.checkpoint = c.id;
      this.stats.save();
      return { checkpoint: c, first };
    }
    return null;
  }

  update(dt, time) {
    const flags = this.stats.data.flags;
    this.checkpoints.forEach((c) => c.update(time, flags.includes(c.id) || c.id === this.stats.data.checkpoint));
    for (const c of this.chests) c.update(dt, time);
  }
}
