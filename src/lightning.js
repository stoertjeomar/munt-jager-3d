import * as THREE from 'three';

// Bliksem! Gedeeld door Omar (zijn bliksem-aanval), Sky (zijn flitsen en inslagen), Sky's NightWalker
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

// ---------- Bliksemspoor: blijft even hangen, flikkert en vervaagt (Sky's flits, zie skyFighter.js) ----------

// Een zachte gloed: hoe schuiner je naar de rand van het buisje kijkt, hoe doorzichtiger (dan lijkt het wazig).
// softness = hoe snel het naar de rand toe vervaagt (hoger = zachter). Werkt ook zonder bloom (lage graphics).
const GLOW_VERTEX = /* glsl */ `
varying float vFacing;
void main() {
  mat4 m = modelViewMatrix * instanceMatrix;
  vec4 mv = m * vec4(position, 1.0);
  vFacing = abs(dot(normalize(mat3(m) * normal), normalize(-mv.xyz)));
  gl_Position = projectionMatrix * mv;
}`;
const GLOW_FRAGMENT = /* glsl */ `
uniform vec3 color;
uniform float opacity;
uniform float softness;
varying float vFacing;
void main() {
  gl_FragColor = vec4(color, pow(vFacing, softness) * opacity);
  #include <colorspace_fragment>
}`;

const SIDE = new THREE.Vector3();
const LIFT = new THREE.Vector3();
const DIR = new THREE.Vector3();
const M4 = new THREE.Matrix4();
const QUAT = new THREE.Quaternion();
const SCALE = new THREE.Vector3();
const MID = new THREE.Vector3();

/**
 * Een bliksemspoor van `from` naar `to`. Het zigzag-patroon wordt steeds opnieuw gemaakt (dan flikkert het),
 * met 1 of 2 zijtakjes. Het wordt drie keer getekend: een dikke zachte gele gloed, een dunnere gele gloed
 * en een dunne witte kern erbovenop (alles optellend: "additive blending", dan straalt het).
 * Elke laag is één InstancedMesh: alle stukjes in één keer tekenen is snel.
 */
export class LightningTrail {
  /**
   * @param {object} o  life, flicker (zo vaak een nieuwe zigzag), depth (hoe vaak het pad in tweeën), wiggle,
   *                    branches [min, max], glowWidth, coreWidth, color ('geel' | 'paars' | 'blauw')
   */
  constructor(scene, from, to, { life = 0.6, flicker = 0.05, depth = 4, wiggle = 0.22, branches = [1, 2], glowWidth = 0.34, coreWidth = 0.06, color = 'geel' } = {}) {
    const c = BOLT_COLORS[color] ?? BOLT_COLORS.geel;
    this.scene = scene;
    this.from = from.clone();
    this.to = to.clone();
    this.life = life;
    this.age = 0;
    this.flicker = flicker;
    this.flickerT = 0;
    this.depth = depth;
    this.wiggle = wiggle;
    this.branchCount = branches[0] + Math.floor(Math.random() * (branches[1] - branches[0] + 1));
    this.segments = 2 ** depth + this.branchCount * 3; // hoofdpad + 3 stukjes per zijtakje
    const layer = (color, opacity, width, softness) => {
      const mat = new THREE.ShaderMaterial({
        uniforms: { color: { value: new THREE.Color(color) }, opacity: { value: opacity }, softness: { value: softness } },
        vertexShader: GLOW_VERTEX,
        fragmentShader: GLOW_FRAGMENT,
        transparent: true,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
      });
      const mesh = new THREE.InstancedMesh(BOLT_GEO, mat, this.segments);
      mesh.frustumCulled = false;
      return { mesh, base: opacity, width };
    };
    // Een brede, heel zachte gloed, een smallere gele gloed en een dunne witte kern
    this.layers = [layer(c.glow, 0.35, glowWidth * 2.2, 3), layer(c.glow, 0.7, glowWidth, 1.5), layer(c.core, 1, coreWidth, 0.4)];
    this.group = new THREE.Group();
    for (const l of this.layers) this.group.add(l.mesh);
    scene.add(this.group);
    this.rebuild();
  }

  get done() {
    return this.age >= this.life;
  }

  /** Langer laten blijven (bijv. tot het einde van een ketting flitsen). */
  extend(seconds) {
    this.life = Math.max(this.life, this.age + seconds);
  }

  /** Een nieuw zigzag-patroon: steeds het midden van elk stuk een beetje opzij duwen (dwars op het pad). */
  rebuild() {
    DIR.copy(this.to).sub(this.from);
    const length = DIR.length();
    DIR.normalize();
    SIDE.set(DIR.z, 0, -DIR.x);
    if (SIDE.lengthSq() < 1e-6) SIDE.set(1, 0, 0);
    SIDE.normalize();
    LIFT.crossVectors(SIDE, DIR).normalize();
    let points = [this.from.clone(), this.to.clone()];
    let size = length;
    for (let d = 0; d < this.depth; d++) {
      const next = [points[0]];
      for (let i = 0; i < points.length - 1; i++) {
        const mid = points[i].clone().lerp(points[i + 1], 0.5);
        const push = size * this.wiggle;
        mid.addScaledVector(SIDE, (Math.random() - 0.5) * 2 * push).addScaledVector(LIFT, (Math.random() - 0.5) * push);
        next.push(mid, points[i + 1]);
      }
      points = next;
      size /= 2;
    }
    let n = 0;
    for (let i = 0; i < points.length - 1; i++) this.setSegment(n++, points[i], points[i + 1], 1);
    // Zijtakjes: vanaf een punt op het pad schuin weg, in drie korte zigzagstukjes
    for (let b = 0; b < this.branchCount; b++) {
      let a = points[2 + Math.floor(Math.random() * (points.length - 4))];
      const out = DIR.clone().multiplyScalar(0.6).addScaledVector(SIDE, (Math.random() < 0.5 ? -1 : 1) * (0.6 + Math.random() * 0.6)).addScaledVector(LIFT, (Math.random() - 0.6) * 0.8).normalize();
      const step = length * (0.06 + Math.random() * 0.05);
      for (let k = 0; k < 3; k++) {
        const next = a.clone().addScaledVector(out, step).addScaledVector(SIDE, (Math.random() - 0.5) * step * 0.6);
        this.setSegment(n++, a, next, 0.55);
        a = next;
      }
    }
    for (const l of this.layers) {
      l.mesh.count = n;
      l.mesh.instanceMatrix.needsUpdate = true;
    }
  }

  setSegment(i, a, b, thick) {
    const len = a.distanceTo(b);
    MID.copy(a).lerp(b, 0.5);
    QUAT.setFromUnitVectors(UP, len > 1e-5 ? DIR.copy(b).sub(a).divideScalar(len) : UP);
    for (const l of this.layers) {
      // (iets langer dan het stuk zelf: dan sluiten de knikken in de zigzag mooi aan)
      SCALE.set(l.width * thick, Math.max(1e-4, len + l.width * thick), l.width * thick);
      l.mesh.setMatrixAt(i, M4.compose(MID, QUAT, SCALE));
    }
    DIR.copy(this.to).sub(this.from).normalize(); // (DIR is weer de richting van het hele pad)
  }

  update(dt) {
    this.age += dt;
    this.flickerT -= dt;
    if (this.flickerT <= 0) {
      this.flickerT = this.flicker;
      this.rebuild();
    }
    const k = Math.max(0, 1 - this.age / this.life);
    const fade = k * k * (0.75 + Math.random() * 0.25); // langzaam weg, en een beetje flikkeren
    for (const l of this.layers) l.mesh.material.uniforms.opacity.value = l.base * fade;
  }

  dispose() {
    this.scene.remove(this.group);
    for (const l of this.layers) {
      l.mesh.material.dispose();
      l.mesh.dispose();
    }
  }
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
