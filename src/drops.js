import * as THREE from 'three';

// Hartjes die vijanden laten vallen. Loop erdoorheen om een leven terug te krijgen.

const HEART_LIFE = 15; // na zoveel seconden verdwijnt een hartje weer
const PICK_RANGE = 1.1;

function buildHeart() {
  // Een hartje uit twee bollen en een kegel
  const mat = new THREE.MeshStandardMaterial({ color: 0xff3b5c, emissive: 0xff1e46, emissiveIntensity: 0.5, roughness: 0.3 });
  const group = new THREE.Group();
  for (const side of [-1, 1]) {
    const lobe = new THREE.Mesh(new THREE.SphereGeometry(0.17, 16, 12), mat);
    lobe.position.set(side * 0.13, 0.08, 0);
    group.add(lobe);
  }
  const tip = new THREE.Mesh(new THREE.ConeGeometry(0.25, 0.36, 16), mat);
  tip.rotation.z = Math.PI;
  tip.position.y = -0.15;
  tip.scale.z = 0.7;
  group.add(tip);
  group.traverse((c) => (c.castShadow = true));
  return group;
}

export class Drops {
  constructor(scene) {
    this.scene = scene;
    this.hearts = [];
  }

  spawnHeart(position) {
    const mesh = buildHeart();
    mesh.position.copy(position).setY(Math.max(position.y, 0) + 0.7);
    this.scene.add(mesh);
    // Een klein sprongetje omhoog als hij verschijnt
    this.hearts.push({ mesh, age: 0, baseY: mesh.position.y, vy: 4 });
  }

  /**
   * @param {THREE.Vector3} playerPos
   * @param {(heart) => boolean} onPick  geeft true terug als het hartje opgepakt mag worden
   */
  update(dt, time, playerPos, onPick) {
    for (let i = this.hearts.length - 1; i >= 0; i--) {
      const h = this.hearts[i];
      h.age += dt;

      // Eerst omhoog stuiteren, daarna zweven en draaien
      if (h.vy !== 0) {
        h.vy -= 14 * dt;
        h.mesh.position.y += h.vy * dt;
        if (h.mesh.position.y <= h.baseY && h.vy < 0) {
          h.mesh.position.y = h.baseY;
          h.vy = 0;
        }
      } else {
        h.mesh.position.y = h.baseY + Math.sin(time * 3 + i) * 0.1;
      }
      h.mesh.rotation.y = time * 2.5;

      // Knipperen vlak voordat hij verdwijnt
      h.mesh.visible = h.age < HEART_LIFE - 3 || Math.floor(h.age * 8) % 2 === 0;

      const center = playerPos.clone().setY(playerPos.y + 0.8);
      const close = h.mesh.position.distanceTo(center) < PICK_RANGE;
      if ((close && onPick(h)) || h.age > HEART_LIFE) {
        this.scene.remove(h.mesh);
        this.hearts.splice(i, 1);
      }
    }
  }

  clear() {
    for (const h of this.hearts) this.scene.remove(h.mesh);
    this.hearts.length = 0;
  }
}
