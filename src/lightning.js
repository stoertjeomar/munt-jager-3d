import * as THREE from 'three';

// Bliksem! Gedeeld door Omar (zijn bliksem-aanval), Sky (en zijn wolven), Sky's NightWalker
// en het onweer in het Wolkenrijk. Een bliksemschicht is een zigzag van gloeiende buisjes:
// een felle witte kern met een zachte gekleurde gloed eromheen.

const BOLT_GEO = new THREE.CylinderGeometry(1, 1, 1, 6, 1, true);
const UP = new THREE.Vector3(0, 1, 0);
const materials = {}; // per kleur één setje materialen (kern + gloed)

function boltMaterials(core, glow) {
  const key = `${core}-${glow}`;
  materials[key] ??= {
    core: new THREE.MeshBasicMaterial({ color: core, toneMapped: false, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false }),
    glow: new THREE.MeshBasicMaterial({ color: glow, toneMapped: false, transparent: true, opacity: 0.35, blending: THREE.AdditiveBlending, depthWrite: false }),
  };
  return materials[key];
}

// Kleuren: Omars bliksem is paars, die van Sky geel
export const BOLT_COLORS = {
  paars: { core: 0xf2e6ff, glow: 0x9a4dff },
  geel: { core: 0xfffbe0, glow: 0xffc21a },
  blauw: { core: 0xeaf6ff, glow: 0x4da6ff },
};

/**
 * Een bliksemschicht van `from` naar `to`.
 * @param {object} o  { color: 'paars' | 'geel' | 'blauw', width (dikte), wiggle (hoe zigzag), segments, branches }
 */
export function makeBoltBetween(from, to, { color = 'paars', width = 1, wiggle = 0.7, segments = 9, branches = 0 } = {}) {
  const c = BOLT_COLORS[color] ?? BOLT_COLORS.paars;
  const { core, glow } = boltMaterials(c.core, c.glow);
  const group = new THREE.Group();
  const points = [];
  for (let i = 0; i <= segments; i++) {
    const p = from.clone().lerp(to, i / segments);
    if (i > 0 && i < segments) p.add(new THREE.Vector3((Math.random() - 0.5) * wiggle, (Math.random() - 0.5) * wiggle * 0.4, (Math.random() - 0.5) * wiggle));
    points.push(p);
  }
  const addSegment = (a, b, w) => {
    const len = a.distanceTo(b);
    if (len < 1e-4) return;
    const dir = b.clone().sub(a).normalize();
    for (const [mat, r] of [[core, 0.07 * w], [glow, 0.28 * w]]) {
      const seg = new THREE.Mesh(BOLT_GEO, mat);
      seg.position.copy(a).lerp(b, 0.5);
      seg.quaternion.setFromUnitVectors(UP, dir);
      seg.scale.set(r, len, r);
      group.add(seg);
    }
  };
  for (let i = 0; i < points.length - 1; i++) addSegment(points[i], points[i + 1], width);
  // Zijtakjes: kleine zigzagjes die van de hoofdschicht af schieten
  for (let b = 0; b < branches; b++) {
    const start = points[1 + Math.floor(Math.random() * (points.length - 3))];
    let a = start;
    const step = from.distanceTo(to) / segments;
    const out = new THREE.Vector3(Math.random() - 0.5, -0.4 - Math.random() * 0.4, Math.random() - 0.5).normalize();
    for (let k = 0; k < 3; k++) {
      const next = a.clone().addScaledVector(out, step * 0.8).add(new THREE.Vector3((Math.random() - 0.5) * wiggle, 0, (Math.random() - 0.5) * wiggle));
      addSegment(a, next, width * 0.5);
      a = next;
    }
  }
  return group;
}

/** Een bliksemschicht uit de lucht naar de grond (zoals Omars bliksem). */
export function makeBolt(ground, { height = 18, ...o } = {}) {
  return makeBoltBetween(ground.clone().setY(ground.y + height), ground.clone(), o);
}

/**
 * Houdt bliksemschichten bij: ze flikkeren even en verdwijnen dan vanzelf.
 * bolts.add(mesh, 0.25) → na 0.25 seconden weg.
 */
export class Bolts {
  constructor(scene) {
    this.scene = scene;
    this.list = [];
  }

  add(mesh, life = 0.25) {
    this.scene.add(mesh);
    this.list.push({ mesh, life });
    return mesh;
  }

  update(dt) {
    for (let i = this.list.length - 1; i >= 0; i--) {
      const b = this.list[i];
      b.life -= dt;
      b.mesh.visible = b.life > 0 && Math.random() < 0.8; // flikkeren
      if (b.life <= 0) {
        this.scene.remove(b.mesh);
        this.list.splice(i, 1);
      }
    }
  }

  clear() {
    for (const b of this.list) this.scene.remove(b.mesh);
    this.list.length = 0;
  }
}
