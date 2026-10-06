import * as THREE from 'three';
import { createWeaponMesh } from './weapons.js';
import { createHelmetMesh } from './gear.js';

// Plekken in de wereld waar je iets mee kunt: Plekken van Genade en kisten.

const INTERACT_RANGE = 2.6;

// ---------- Plek van Genade ----------

class Grace {
  constructor(scene, def) {
    this.id = def.id;
    this.name = def.name;
    this.position = def.position.clone();
    this.group = new THREE.Group();
    this.group.position.copy(this.position);
    scene.add(this.group);

    // Kring van stenen
    const stoneMat = new THREE.MeshStandardMaterial({ color: 0x8d8a85, roughness: 0.9, flatShading: true });
    for (let i = 0; i < 7; i++) {
      const a = (i / 7) * Math.PI * 2;
      const stone = new THREE.Mesh(new THREE.DodecahedronGeometry(0.28, 0), stoneMat);
      stone.position.set(Math.sin(a) * 1.1, 0.12, Math.cos(a) * 1.1);
      stone.castShadow = true;
      this.group.add(stone);
    }
    // Gouden licht in het midden
    const glowMat = new THREE.MeshBasicMaterial({ color: 0xffd76a, transparent: true, opacity: 0.9, toneMapped: false });
    this.core = new THREE.Mesh(new THREE.OctahedronGeometry(0.22, 0), glowMat);
    this.core.position.y = 1.1;
    this.group.add(this.core);
    this.halo = new THREE.Mesh(
      new THREE.SphereGeometry(0.6, 16, 12),
      new THREE.MeshBasicMaterial({ color: 0xffc94a, transparent: true, opacity: 0.18, depthWrite: false, toneMapped: false })
    );
    this.halo.position.y = 1.1;
    this.group.add(this.halo);
    // Lichtstraal naar boven, zodat je hem van ver ziet
    this.beam = new THREE.Mesh(
      new THREE.CylinderGeometry(0.15, 0.4, 30, 12, 1, true),
      new THREE.MeshBasicMaterial({ color: 0xffd76a, transparent: true, opacity: 0.12, side: THREE.DoubleSide, depthWrite: false, toneMapped: false })
    );
    this.beam.position.y = 15;
    this.group.add(this.beam);

    // Opstijgende vonkjes
    const count = 24;
    this.sparkGeo = new THREE.BufferGeometry();
    this.sparkGeo.setAttribute('position', new THREE.Float32BufferAttribute(new Float32Array(count * 3), 3));
    this.sparkData = Array.from({ length: count }, () => ({ a: Math.random() * 6.28, r: Math.random() * 0.5, y: Math.random() * 2.5, s: 0.4 + Math.random() * 0.6 }));
    this.sparks = new THREE.Points(this.sparkGeo, new THREE.PointsMaterial({ color: 0xffe08a, size: 0.09, transparent: true, opacity: 0.9, depthWrite: false, toneMapped: false }));
    this.group.add(this.sparks);
  }

  update(dt, time, discovered) {
    this.core.rotation.y = time * 1.5;
    this.core.position.y = 1.1 + Math.sin(time * 2) * 0.08;
    this.halo.scale.setScalar(1 + Math.sin(time * 3) * 0.15);
    this.beam.visible = discovered;
    const pos = this.sparkGeo.attributes.position;
    this.sparkData.forEach((p, i) => {
      p.y += dt * p.s;
      if (p.y > 2.6) p.y = 0.2;
      pos.setXYZ(i, Math.sin(p.a + time * 0.5) * p.r, p.y, Math.cos(p.a + time * 0.5) * p.r);
    });
    pos.needsUpdate = true;
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
   * @param {object} defs  { graces, chests } uit world.js
   * @param {import('./stats.js').Stats} stats
   */
  constructor(scene, defs, stats) {
    this.stats = stats;
    this.graces = defs.graces.map((g) => new Grace(scene, g));
    this.chests = defs.chests.map((c) => new Chest(scene, c, stats.data.chests.includes(c.id)));
  }

  grace(id) {
    return this.graces.find((g) => g.id === id);
  }

  /** Waar kun je nu iets mee? Geeft { kind, target } of null. */
  nearbyInteraction(pos) {
    for (const g of this.graces) {
      if (Math.hypot(g.position.x - pos.x, g.position.z - pos.z) < INTERACT_RANGE && Math.abs(pos.y - g.position.y) < 1.5) return { kind: 'grace', target: g };
    }
    for (const c of this.chests) {
      if (c.opened) continue;
      if (Math.hypot(c.position.x - pos.x, c.position.z - pos.z) < INTERACT_RANGE && Math.abs(pos.y - c.position.y) < 1.5) return { kind: 'chest', target: c };
    }
    return null;
  }

  /** Graces die je ontdekt als je er dichtbij komt. Geeft de nieuw ontdekte terug (of null). */
  discover(pos) {
    for (const g of this.graces) {
      if (this.stats.data.discovered.includes(g.id)) continue;
      if (Math.hypot(g.position.x - pos.x, g.position.z - pos.z) < 9) {
        this.stats.data.discovered.push(g.id);
        this.stats.save();
        return g;
      }
    }
    return null;
  }

  update(dt, time) {
    for (const g of this.graces) g.update(dt, time, this.stats.data.discovered.includes(g.id));
    for (const c of this.chests) c.update(dt, time);
  }
}
