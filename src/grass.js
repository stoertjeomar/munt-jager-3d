import * as THREE from 'three';
import { WIND } from './world.js';

// Dicht gras rond de speler: tienduizenden sprietjes in één tekenopdracht (dat is snel).
// Het veld reist mee met de speler: sprietjes die te ver achter je liggen, verschijnen weer voor je.
// Ze wuiven in de wind, buigen opzij als je erdoorheen loopt en groeien niet op het pad,
// in de arena, in huizen of bij kisten (dat zegt de "grasmasker"-plaat uit world.js).
// Hoeveel sprietjes er zijn hangt af van de graphics-stand (G): op Laag is er geen gras.

const BLADE_HEIGHT = 0.32; // hoogte van één sprietje (wordt nog 0.6 tot 1.4 keer zo groot)
const BLADE_WIDTH = 0.05;

// Kleuren van het gras per soort level: [donker, licht] (en hoeveel gras er is)
const THEMES = {
  weide: { dark: [0.12, 0.28, 0.07], light: [0.26, 0.42, 0.1], amount: 1, flowers: 0.03 },
  woud: { dark: [0.08, 0.2, 0.07], light: [0.16, 0.3, 0.1], amount: 1, flowers: 0.008 },
  hoogland: { dark: [0.17, 0.22, 0.09], light: [0.32, 0.36, 0.15], amount: 0.45, flowers: 0.004 },
};

export class GrassField {
  /**
   * @param {THREE.Scene} scene
   * @param {object} opts  { theme, mask: { texture, min: [x, z], size: [w, d] }, max: hoeveel sprietjes er maximaal kunnen zijn }
   */
  constructor(scene, { theme = 'weide', mask, max = 50000 }) {
    this.theme = THEMES[theme] ?? THEMES.weide;
    // Eén sprietje: 5 punten, 3 driehoekjes (smal en spits naar boven)
    const w = BLADE_WIDTH;
    const blade = new THREE.BufferGeometry();
    blade.setAttribute('position', new THREE.Float32BufferAttribute([-w, 0, 0, w, 0, 0, -0.6 * w, 0.16, 0, 0.6 * w, 0.16, 0, 0, BLADE_HEIGHT, 0], 3));
    blade.setAttribute('normal', new THREE.Float32BufferAttribute([0, 0, 1, 0, 0, 1, 0, 0, 1, 0, 0, 1, 0, 0, 1], 3));
    blade.setIndex([0, 1, 2, 2, 1, 3, 2, 3, 4]);

    const geo = new THREE.InstancedBufferGeometry().copy(blade);
    // Per sprietje: plek (x, z tussen -1 en 1, wordt keer de straal gedaan), draaiing en grootte
    const offsets = new Float32Array(max * 4);
    let seed = 7;
    const rand = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
    for (let i = 0; i < max; i++) {
      offsets[i * 4] = rand() * 2 - 1;
      offsets[i * 4 + 1] = rand() * 2 - 1;
      offsets[i * 4 + 2] = rand() * Math.PI;
      offsets[i * 4 + 3] = 0.6 + rand() * 0.8;
    }
    geo.setAttribute('offset', new THREE.InstancedBufferAttribute(offsets, 4));
    geo.instanceCount = 0;
    this.max = max;
    this.geometry = geo;

    this.uniforms = {
      uTime: WIND,
      uCenter: { value: new THREE.Vector2() },
      uPlayer: { value: new THREE.Vector2() },
      uRadius: { value: 18 },
      uMask: { value: mask.texture },
      uMaskMin: { value: new THREE.Vector2(...mask.min) },
      uMaskSize: { value: new THREE.Vector2(...mask.size) },
      uDark: { value: new THREE.Vector3(...this.theme.dark) },
      uLight: { value: new THREE.Vector3(...this.theme.light) },
      uFlowers: { value: this.theme.flowers },
    };

    const material = new THREE.MeshStandardMaterial({ roughness: 0.9, side: THREE.DoubleSide });
    material.onBeforeCompile = (shader) => {
      Object.assign(shader.uniforms, this.uniforms);
      shader.vertexShader = shader.vertexShader
        .replace(
          '#include <common>',
          `#include <common>
          attribute vec4 offset;
          uniform float uTime; uniform vec2 uCenter; uniform vec2 uPlayer; uniform float uRadius;
          uniform sampler2D uMask; uniform vec2 uMaskMin; uniform vec2 uMaskSize;
          uniform vec3 uDark; uniform vec3 uLight; uniform float uFlowers;
          varying vec3 vGrassCol; varying float vTip;
          float gHash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
          float gNoise(vec2 p) {
            vec2 i = floor(p); vec2 f = fract(p); f = f * f * (3.0 - 2.0 * f);
            return mix(mix(gHash(i), gHash(i + vec2(1, 0)), f.x), mix(gHash(i + vec2(0, 1)), gHash(i + vec2(1, 1)), f.x), f.y);
          }`
        )
        .replace(
          '#include <beginnormal_vertex>',
          `vec3 objectNormal = vec3(sin(offset.z), 0.0, cos(offset.z));
          objectNormal = normalize(mix(objectNormal, vec3(0.0, 1.0, 0.0), 0.7)); // net zo belicht als de grond eronder`
        )
        .replace(
          '#include <begin_vertex>',
          `// Waar staat dit sprietje? Het veld is een tegel rond de speler die steeds meeschuift (dan "ploppen" ze nooit).
          vec2 rel = mod(offset.xy * uRadius - uCenter + uRadius, 2.0 * uRadius) - uRadius;
          vec2 world = uCenter + rel;
          float fade = 1.0 - smoothstep(0.65, 1.0, length(rel) / uRadius); // aan de rand worden ze kleiner
          float mask = texture2D(uMask, (world - uMaskMin) / uMaskSize).r;  // geen gras op het pad e.d.
          float h = offset.w * fade * mask;
          vec3 transformed = position * vec3(1.0, h, 1.0);
          transformed.x *= mix(0.6, 1.0, h);
          float c = cos(offset.z); float s = sin(offset.z);
          transformed.xz = vec2(c * transformed.x + s * transformed.z, -s * transformed.x + c * transformed.z);
          float tip = position.y / ${BLADE_HEIGHT.toFixed(2)};
          vTip = tip;
          // Wind: een rustige golf en een snellere trilling
          float wv = sin(uTime * 1.8 + world.x * 0.35 + world.y * 0.25) * 0.5 + sin(uTime * 3.1 + world.x * 1.3) * 0.18;
          transformed.xz += vec2(0.18, 0.1) * wv * tip * tip * h;
          // Je loopt erdoorheen: het gras buigt opzij
          vec2 away = world - uPlayer;
          float push = 1.0 - smoothstep(0.0, 0.9, length(away));
          transformed.xz += normalize(away + 1e-4) * push * tip * 0.3;
          transformed.y *= 1.0 - push * 0.5;
          transformed.xz += world;
          // Kleur: grote vlekken lichter en donkerder gras (zoals de grond), soms een bloemetje bovenop
          float n = gNoise(world / 2.5 * 0.09) * 0.7 + gHash(offset.xy * 91.0) * 0.3;
          vGrassCol = mix(uDark, uLight, n);
          float fl = gHash(offset.xy * 53.0);
          if (fl < uFlowers && tip > 0.6) {
            float k = gHash(offset.xy * 17.0);
            vGrassCol = k < 0.25 ? vec3(0.9, 0.3, 0.5) : k < 0.5 ? vec3(0.95, 0.8, 0.2) : k < 0.75 ? vec3(0.9, 0.9, 0.9) : vec3(0.55, 0.35, 0.9);
          }`
        );
      shader.fragmentShader = shader.fragmentShader
        .replace('#include <common>', '#include <common>\nvarying vec3 vGrassCol; varying float vTip;')
        .replace('#include <color_fragment>', '#include <color_fragment>\n  diffuseColor.rgb = vGrassCol * mix(0.6, 1.12, vTip); // onderaan donkerder, bovenaan licht');
    };
    material.customProgramCacheKey = () => 'grassfield';

    this.mesh = new THREE.Mesh(geo, material);
    this.mesh.frustumCulled = false; // de sprietjes worden pas in de shader op hun plek gezet
    this.mesh.receiveShadow = true;
    this.mesh.castShadow = false;
    this.mesh.userData.noAO = true;
    this.mesh.visible = false;
    scene.add(this.mesh);
  }

  /** Hoeveel sprietjes (0 = geen gras) en hoe ver om je heen (meter). */
  setCount(count, radius) {
    const n = Math.min(this.max, Math.round(count * this.theme.amount));
    this.geometry.instanceCount = n;
    this.uniforms.uRadius.value = radius || 1;
    this.mesh.visible = n > 0;
  }

  /** Elke frame: het veld schuift mee met de speler. */
  update(playerPos) {
    this.uniforms.uCenter.value.set(playerPos.x, playerPos.z);
    this.uniforms.uPlayer.value.set(playerPos.x, playerPos.z);
  }
}
