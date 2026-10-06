import * as THREE from 'three';

// Een gloeiend "zwaard-windje" dat achter het lemmet aan komt tijdens een slag.
// Elke frame onthouden we waar de onderkant en de punt van het lemmet zijn. Daartussen
// spannen we een lint. Met een Catmull-Rom-kromme maken we het lint mooi rond,
// en oudere stukjes vervagen, zodat het een strakke, zachte veeg wordt.

const LIFE = 0.2; // hoe lang een stukje van het windje zichtbaar blijft (seconden)
const MAX_SAMPLES = 40;
const SUBDIVISIONS = 6; // extra tussenpunten per frame: maakt de boog glad

const vertexShader = /* glsl */ `
  attribute float fade;   // 1 = net gemaakt, 0 = oud
  attribute float edge;   // 0 = bij het handvat, 1 = bij de punt
  varying float vFade;
  varying float vEdge;
  void main() {
    vFade = fade;
    vEdge = edge;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

const fragmentShader = /* glsl */ `
  uniform vec3 uColor;
  uniform float uOpacity;
  varying float vFade;
  varying float vEdge;
  void main() {
    // Feller bij de punt, zachter bij het handvat; een witte kern bij de punt van het nieuwste stuk
    float alpha = smoothstep(0.0, 0.55, vEdge) * pow(vFade, 1.3) * uOpacity * 0.9;
    float core = smoothstep(0.8, 1.0, vEdge) * pow(vFade, 0.6);
    vec3 color = mix(uColor, vec3(1.0), core * 0.8);
    gl_FragColor = vec4(color, alpha);
    #include <colorspace_fragment>
  }
`;

function catmullRom(p0, p1, p2, p3, t, out) {
  const t2 = t * t;
  const t3 = t2 * t;
  return out.set(
    0.5 * (2 * p1.x + (-p0.x + p2.x) * t + (2 * p0.x - 5 * p1.x + 4 * p2.x - p3.x) * t2 + (-p0.x + 3 * p1.x - 3 * p2.x + p3.x) * t3),
    0.5 * (2 * p1.y + (-p0.y + p2.y) * t + (2 * p0.y - 5 * p1.y + 4 * p2.y - p3.y) * t2 + (-p0.y + 3 * p1.y - 3 * p2.y + p3.y) * t3),
    0.5 * (2 * p1.z + (-p0.z + p2.z) * t + (2 * p0.z - 5 * p1.z + 4 * p2.z - p3.z) * t2 + (-p0.z + 3 * p1.z - 3 * p2.z + p3.z) * t3)
  );
}

export class SwordTrail {
  constructor(scene) {
    this.samples = []; // { base, tip, time }
    this.time = 0;

    const maxVerts = MAX_SAMPLES * SUBDIVISIONS * 2;
    const geometry = new THREE.BufferGeometry();
    this.positions = new Float32Array(maxVerts * 3);
    this.fades = new Float32Array(maxVerts);
    this.edges = new Float32Array(maxVerts);
    geometry.setAttribute('position', new THREE.BufferAttribute(this.positions, 3).setUsage(THREE.DynamicDrawUsage));
    geometry.setAttribute('fade', new THREE.BufferAttribute(this.fades, 1).setUsage(THREE.DynamicDrawUsage));
    geometry.setAttribute('edge', new THREE.BufferAttribute(this.edges, 1).setUsage(THREE.DynamicDrawUsage));

    // Driehoeken: tussen elk paar opeenvolgende (handvat, punt)-paren twee driehoeken
    const indices = [];
    for (let i = 0; i < maxVerts / 2 - 1; i++) {
      const a = i * 2;
      indices.push(a, a + 1, a + 2, a + 1, a + 3, a + 2);
    }
    geometry.setIndex(indices);
    geometry.setDrawRange(0, 0);

    this.material = new THREE.ShaderMaterial({
      vertexShader,
      fragmentShader,
      uniforms: { uColor: { value: new THREE.Color(0xffffff) }, uOpacity: { value: 1 } },
      transparent: true,
      depthWrite: false,
      side: THREE.DoubleSide,
      blending: THREE.NormalBlending,
    });
    this.mesh = new THREE.Mesh(geometry, this.material);
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = 5;
    scene.add(this.mesh);
  }

  setColor(color) {
    this.material.uniforms.uColor.value.set(color);
  }

  /** Nieuw punt toevoegen: waar het lemmet nu is (onderkant en punt, in wereld-coördinaten). */
  addSample(base, tip) {
    this.samples.push({ base: base.clone(), tip: tip.clone(), time: this.time });
    if (this.samples.length > MAX_SAMPLES) this.samples.shift();
  }

  /** Begin van een nieuwe slag: oude veeg niet verbinden met de nieuwe. */
  cut() {
    this.samples.length = 0;
  }

  update(dt) {
    this.time += dt;
    while (this.samples.length && this.time - this.samples[0].time > LIFE) this.samples.shift();

    const s = this.samples;
    const geometry = this.mesh.geometry;
    if (s.length < 2) {
      geometry.setDrawRange(0, 0);
      return;
    }

    // Gladde boog door alle punten
    const base = new THREE.Vector3();
    const tip = new THREE.Vector3();
    let v = 0;
    const write = (b, t, time) => {
      const fade = 1 - (this.time - time) / LIFE;
      this.positions.set([b.x, b.y, b.z], v * 3);
      this.fades[v] = fade;
      this.edges[v] = 0;
      v++;
      this.positions.set([t.x, t.y, t.z], v * 3);
      this.fades[v] = fade;
      this.edges[v] = 1;
      v++;
    };
    for (let i = 0; i < s.length - 1; i++) {
      const p0 = s[Math.max(0, i - 1)];
      const p1 = s[i];
      const p2 = s[i + 1];
      const p3 = s[Math.min(s.length - 1, i + 2)];
      for (let j = 0; j < SUBDIVISIONS; j++) {
        const t = j / SUBDIVISIONS;
        catmullRom(p0.base, p1.base, p2.base, p3.base, t, base);
        catmullRom(p0.tip, p1.tip, p2.tip, p3.tip, t, tip);
        write(base, tip, p1.time + (p2.time - p1.time) * t);
      }
    }
    const last = s[s.length - 1];
    write(last.base, last.tip, last.time);

    geometry.attributes.position.needsUpdate = true;
    geometry.attributes.fade.needsUpdate = true;
    geometry.attributes.edge.needsUpdate = true;
    geometry.setDrawRange(0, (v / 2 - 1) * 6);
  }
}
