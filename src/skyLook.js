import * as THREE from 'three';

// Hoe Sky eruitziet: een donkere stormhuid (onweerswolk-grijs) met gele bliksemaders die gloeien.
// De aders worden in de shader berekend uit de plek op zijn lijf (niet uit een plaatje: het model gebruikt
// een kleurenpalet als textuur, dan zou een plaatje met aders er raar uitzien). Zo lopen de aders als
// kronkelende lijnen over zijn hele lijf, en bewegen ze mee als hij beweegt.

// Kronkelige lijnen uit "ruis": waar de ruis precies in het midden zit, loopt een ader
const VEINS = /* glsl */ `
varying vec3 vVein;
uniform float veinScale;
float veinHash(vec3 p) { return fract(sin(dot(p, vec3(17.1, 113.7, 41.3))) * 43758.5453); }
float veinNoise(vec3 p) {
  vec3 i = floor(p); vec3 f = fract(p); f = f * f * (3.0 - 2.0 * f);
  return mix(
    mix(mix(veinHash(i), veinHash(i + vec3(1, 0, 0)), f.x), mix(veinHash(i + vec3(0, 1, 0)), veinHash(i + vec3(1, 1, 0)), f.x), f.y),
    mix(mix(veinHash(i + vec3(0, 0, 1)), veinHash(i + vec3(1, 0, 1)), f.x), mix(veinHash(i + vec3(0, 1, 1)), veinHash(i + vec3(1, 1, 1)), f.x), f.y),
    f.z);
}
float veinMask(vec3 p) {
  float n = veinNoise(p) * 0.65 + veinNoise(p * 2.3 + 7.0) * 0.35;
  float ridge = 1.0 - abs(n * 2.0 - 1.0);
  return smoothstep(0.94, 0.985, ridge);
}
`;

/**
 * Geef dit model de stormhuid. (De materialen zijn al eigen kopieën: zie syncMaterials in omarFighter.js.)
 * `skip` = een deel van het model dat zijn eigen kleuren houdt (zijn zwaard). vein = kleur van de aders.
 */
export function applyStormSkin(model, skip = null, vein = 0xffc21a) {
  const storm = new THREE.Color(0x2a3140);
  const size = new THREE.Vector3();
  const meshes = [];
  model.traverse((c) => {
    if (c.isMesh) meshes.push(c);
  });
  for (const mesh of meshes) {
    let inSkip = false;
    for (let o = mesh; o; o = o.parent) if (o === skip) inSkip = true;
    if (inSkip) continue;
    mesh.geometry.computeBoundingBox();
    // Ongeveer 14 kronkels over de hoogte van het lijf (het model kan in centimeters of meters zijn)
    const scale = 14 / Math.max(1e-3, mesh.geometry.boundingBox.getSize(size).y);
    for (const m of [].concat(mesh.material)) {
      if (!m.emissive) continue;
      m.color?.lerp(storm, 0.7);
      m.emissive.set(vein);
      m.emissiveIntensity = 1.4;
      m.onBeforeCompile = (shader) => {
        shader.uniforms.veinScale = { value: scale };
        // De plek op het lijf vóór het bewegen (skinning): dan schuiven de aders niet over zijn huid
        shader.vertexShader = shader.vertexShader
          .replace('#include <common>', '#include <common>\nvarying vec3 vVein;')
          .replace('#include <skinning_vertex>', 'vVein = transformed;\n#include <skinning_vertex>');
        shader.fragmentShader = shader.fragmentShader
          .replace('#include <common>', `#include <common>\n${VEINS}`)
          .replace('#include <emissivemap_fragment>', '#include <emissivemap_fragment>\ntotalEmissiveRadiance *= 0.04 + veinMask(vVein * veinScale);');
      };
      m.customProgramCacheKey = () => 'stormhuid';
      m.needsUpdate = true;
    }
  }
}
