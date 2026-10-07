import * as THREE from 'three';
import { loadGLB } from './assets.js';
import { WEAPONS, RARITY_COLORS } from './weapons.js';
import { APPLE_HEALTH } from './stats.js';

// Helmen: hoe hoger de verdediging (defense), hoe minder schade je krijgt.
// 0.2 betekent: 20% minder schade.
export const HELMETS = {
  geen: { name: 'Geen helm', rarity: 'gewoon', defense: 0, info: 'Je hoofd is bloot. Pas op!' },
  ijzer: { name: 'IJzeren helm', rarity: 'zeldzaam', defense: 0.12, file: 'models/helmen/Helmet1.glb', info: 'Stevig ijzer. 12% minder schade.' },
  kap: { name: 'Ridderkap', rarity: 'episch', defense: 0.2, file: 'models/helmen/Helmet2.glb', info: 'Een kap van maliën. 20% minder schade.' },
  goud: { name: 'Gouden helm', rarity: 'legendarisch', defense: 0.3, file: 'models/helmen/Helmet3.glb', info: 'De kroon van Koning Slijm, omgesmeed. 30% minder schade.' },
  // tint = de helm krijgt deze kleur (de kroon van Omar is paars-goud)
  kroon: { name: 'Kroon van Omar', rarity: 'legendarisch', defense: 0.35, file: 'models/helmen/Helmet3.glb', tint: 0xc77dff, info: 'Gewonnen van Omar zelf! 35% minder schade. Nu ben JIJ de baas.' },
};

/** Beschrijving van een voorwerp: { kind: 'weapon' | 'helmet' | 'flask', key } */
export function itemInfo(item) {
  if (item.kind === 'weapon') return WEAPONS[item.key];
  if (item.kind === 'helmet') return HELMETS[item.key];
  return { name: 'Gouden Appel', rarity: 'legendarisch', info: `+${APPLE_HEALTH} levenspunten, voor altijd!` };
}

export function itemColor(item) {
  return RARITY_COLORS[itemInfo(item).rarity] ?? '#ffffff';
}

/** Maakt een 3D-helm (in de maat van het originele ridder-model). */
export function createHelmetMesh(key) {
  const helmet = HELMETS[key];
  const group = new THREE.Group();
  if (!helmet.file) return group;
  loadGLB(helmet.file).then((gltf) => {
    const model = gltf.scene.clone();
    model.traverse((child) => {
      if (!child.isMesh) return;
      child.castShadow = true;
      if (helmet.tint) {
        // Eigen kopie van het materiaal, anders krijgt de gouden helm ook deze kleur
        child.material = child.material.clone();
        child.material.color?.lerp(new THREE.Color(helmet.tint), 0.55);
        if (child.material.emissive) child.material.emissive = new THREE.Color(helmet.tint).multiplyScalar(0.25);
      }
    });
    group.add(model);
  });
  return group;
}
