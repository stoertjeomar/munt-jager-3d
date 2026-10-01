import * as THREE from 'three';

// Effecten die het spel "sappig" maken: deeltjes, zwevende schade-getallen,
// schokgolven op de grond en het schudden van de camera.

const MAX_PARTICLES = 400;
const GRAVITY = 14;

export class Effects {
  constructor(scene) {
    this.scene = scene;
    this.shakeAmount = 0;

    // ---------- Deeltjes: één InstancedMesh met kleine blokjes, dat is snel ----------
    this.particles = [];
    this.particleMesh = new THREE.InstancedMesh(
      new THREE.BoxGeometry(1, 1, 1),
      new THREE.MeshBasicMaterial({ toneMapped: false }),
      MAX_PARTICLES
    );
    this.particleMesh.frustumCulled = false;
    this.particleMesh.count = 0;
    this.particleMesh.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(MAX_PARTICLES * 3), 3);
    scene.add(this.particleMesh);

    this.texts = []; // zwevende getallen
    this.rings = []; // schokgolven
    this.warnings = []; // rode waarschuwings-cirkels op de grond
    this.tmpMatrix = new THREE.Matrix4();
    this.tmpQuat = new THREE.Quaternion();
    this.tmpColor = new THREE.Color();
  }

  /**
   * Een explosie van blokjes.
   * @param {THREE.Vector3} pos
   * @param {number} color
   * @param {object} opts  count, speed, size, life, up (extra omhoog), gravity (0..1)
   */
  burst(pos, color, { count = 14, speed = 5, size = 0.12, life = 0.6, up = 2, gravity = 1 } = {}) {
    for (let i = 0; i < count && this.particles.length < MAX_PARTICLES; i++) {
      const dir = new THREE.Vector3(Math.random() - 0.5, Math.random() - 0.3, Math.random() - 0.5).normalize();
      this.particles.push({
        pos: pos.clone(),
        vel: dir.multiplyScalar(speed * (0.4 + Math.random() * 0.6)).add(new THREE.Vector3(0, up, 0)),
        rot: new THREE.Euler(Math.random() * 6, Math.random() * 6, 0),
        spin: (Math.random() - 0.5) * 20,
        size: size * (0.6 + Math.random() * 0.8),
        life,
        age: 0,
        gravity,
        color: new THREE.Color(color).offsetHSL(0, 0, (Math.random() - 0.5) * 0.2),
      });
    }
  }

  /** Vonkjes: kleine, snelle, lichte deeltjes (bijv. als het zwaard iets raakt). */
  sparks(pos, color = 0xffffff) {
    this.burst(pos, color, { count: 10, speed: 9, size: 0.06, life: 0.25, up: 1, gravity: 0.3 });
  }

  /** Zwevende tekst, bijvoorbeeld een schade-getal. */
  floatText(pos, text, color = '#ffffff', size = 0.5) {
    const canvas = document.createElement('canvas');
    canvas.width = 256;
    canvas.height = 128;
    const ctx = canvas.getContext('2d');
    ctx.font = 'bold 84px system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.lineWidth = 12;
    ctx.strokeStyle = 'rgba(0, 0, 0, 0.75)';
    ctx.strokeText(text, 128, 64);
    ctx.fillStyle = color;
    ctx.fillText(text, 128, 64);

    const texture = new THREE.CanvasTexture(canvas);
    texture.colorSpace = THREE.SRGBColorSpace;
    const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: texture, depthTest: false, transparent: true }));
    sprite.renderOrder = 10;
    sprite.position.copy(pos);
    sprite.scale.set(size * 2, size, 1);
    this.scene.add(sprite);
    this.texts.push({ sprite, age: 0, life: 0.8, size, drift: (Math.random() - 0.5) * 0.8 });
  }

  /** Een ring die zich over de grond uitbreidt (bijv. als een golem op de grond slaat). */
  shockwave(pos, color = 0xffffff, maxRadius = 3) {
    const ring = new THREE.Mesh(
      new THREE.RingGeometry(0.85, 1, 48),
      new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.8, side: THREE.DoubleSide, depthWrite: false })
    );
    ring.rotation.x = -Math.PI / 2;
    ring.position.copy(pos).setY(pos.y + 0.05);
    this.scene.add(ring);
    this.rings.push({ ring, age: 0, life: 0.45, maxRadius });
  }

  /**
   * Rode cirkel op de grond die zich vult: "hier gaat zo iets raken!"
   * @param {number} duration  hoe lang tot de klap (seconden)
   */
  warnCircle(pos, radius, duration) {
    const group = new THREE.Group();
    group.position.set(pos.x, pos.y + 0.04, pos.z);
    const edge = new THREE.Mesh(
      new THREE.RingGeometry(radius * 0.94, radius, 48),
      new THREE.MeshBasicMaterial({ color: 0xff2a2a, transparent: true, opacity: 0.9, side: THREE.DoubleSide, depthWrite: false, toneMapped: false })
    );
    const fill = new THREE.Mesh(
      new THREE.CircleGeometry(radius, 48),
      new THREE.MeshBasicMaterial({ color: 0xff2a2a, transparent: true, opacity: 0.25, side: THREE.DoubleSide, depthWrite: false, toneMapped: false })
    );
    edge.rotation.x = fill.rotation.x = -Math.PI / 2;
    fill.position.y = 0.01;
    group.add(edge, fill);
    this.scene.add(group);
    this.warnings.push({ group, fill, edge, age: 0, life: duration });
  }

  /** Laat de camera schudden. */
  shake(amount) {
    this.shakeAmount = Math.max(this.shakeAmount, amount);
  }

  /** Camera-schok toepassen (na het normaal plaatsen van de camera). */
  applyShake(camera, dt) {
    if (this.shakeAmount <= 0.001) return;
    const a = this.shakeAmount;
    camera.position.x += (Math.random() - 0.5) * a;
    camera.position.y += (Math.random() - 0.5) * a;
    camera.position.z += (Math.random() - 0.5) * a;
    this.shakeAmount *= Math.exp(-14 * dt);
  }

  update(dt, camera) {
    // Deeltjes
    let n = 0;
    for (let i = this.particles.length - 1; i >= 0; i--) {
      const p = this.particles[i];
      p.age += dt;
      if (p.age >= p.life) {
        this.particles.splice(i, 1);
        continue;
      }
      p.vel.y -= GRAVITY * p.gravity * dt;
      p.vel.multiplyScalar(Math.exp(-2 * dt)); // luchtweerstand
      p.pos.addScaledVector(p.vel, dt);
      if (p.pos.y < 0.03 && p.vel.y < 0) {
        p.pos.y = 0.03; // stuiteren op de grond
        p.vel.y *= -0.3;
        p.vel.x *= 0.6;
        p.vel.z *= 0.6;
      }
      p.rot.x += p.spin * dt;
      p.rot.y += p.spin * dt * 0.7;
      const s = p.size * (1 - p.age / p.life);
      this.tmpQuat.setFromEuler(p.rot);
      this.tmpMatrix.compose(p.pos, this.tmpQuat, new THREE.Vector3(s, s, s));
      this.particleMesh.setMatrixAt(n, this.tmpMatrix);
      this.particleMesh.setColorAt(n, p.color);
      n++;
    }
    this.particleMesh.count = n;
    this.particleMesh.instanceMatrix.needsUpdate = true;
    if (this.particleMesh.instanceColor) this.particleMesh.instanceColor.needsUpdate = true;

    // Zwevende teksten: omhoog en vervagen, met een klein "plop"-effect aan het begin
    for (let i = this.texts.length - 1; i >= 0; i--) {
      const t = this.texts[i];
      t.age += dt;
      const k = t.age / t.life;
      if (k >= 1) {
        this.scene.remove(t.sprite);
        t.sprite.material.map.dispose();
        t.sprite.material.dispose();
        this.texts.splice(i, 1);
        continue;
      }
      t.sprite.position.y += dt * 1.6;
      t.sprite.position.x += dt * t.drift;
      const pop = k < 0.15 ? 1 + (1 - k / 0.15) * 0.6 : 1;
      t.sprite.scale.set(t.size * 2 * pop, t.size * pop, 1);
      t.sprite.material.opacity = k < 0.6 ? 1 : 1 - (k - 0.6) / 0.4;
    }

    // Waarschuwings-cirkels: vullen zich van binnen naar buiten, en knipperen op het eind
    for (let i = this.warnings.length - 1; i >= 0; i--) {
      const w = this.warnings[i];
      w.age += dt;
      const k = w.age / w.life;
      if (k >= 1) {
        this.scene.remove(w.group);
        this.warnings.splice(i, 1);
        continue;
      }
      w.fill.scale.setScalar(Math.max(0.01, k));
      w.edge.material.opacity = k > 0.75 ? 0.5 + 0.5 * Math.sin(w.age * 40) : 0.9;
    }

    // Schokgolven
    for (let i = this.rings.length - 1; i >= 0; i--) {
      const r = this.rings[i];
      r.age += dt;
      const k = r.age / r.life;
      if (k >= 1) {
        this.scene.remove(r.ring);
        r.ring.geometry.dispose();
        r.ring.material.dispose();
        this.rings.splice(i, 1);
        continue;
      }
      const radius = 0.3 + (r.maxRadius - 0.3) * (1 - Math.pow(1 - k, 3));
      r.ring.scale.setScalar(radius);
      r.ring.material.opacity = 0.8 * (1 - k);
    }
  }

  clear() {
    this.particles.length = 0;
    for (const w of this.warnings) this.scene.remove(w.group);
    this.warnings.length = 0;
    for (const t of this.texts) this.scene.remove(t.sprite);
    for (const r of this.rings) this.scene.remove(r.ring);
    this.texts.length = 0;
    this.rings.length = 0;
    this.shakeAmount = 0;
  }
}
