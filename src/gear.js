import * as THREE from 'three';
import { loadGLB } from './assets.js';
import { WEAPONS, RARITY_COLORS } from './weapons.js';

// Helmen: hoe hoger de verdediging (defense), hoe minder schade je krijgt.
// 0.2 betekent: 20% minder schade.
export const HELMETS = {
  geen: { name: 'Geen helm', rarity: 'gewoon', defense: 0, info: 'Je hoofd is bloot. Pas op!' },
  ijzer: { name: 'IJzeren helm', rarity: 'zeldzaam', defense: 0.12, file: 'models/helmen/Helmet1.glb', info: 'Stevig ijzer. 12% minder schade.' },
  kap: { name: 'Ridderkap', rarity: 'episch', defense: 0.2, file: 'models/helmen/Helmet2.glb', info: 'Een kap van maliën. 20% minder schade.' },
  goud: { name: 'Gouden helm', rarity: 'legendarisch', defense: 0.3, file: 'models/helmen/Helmet3.glb', info: 'De kroon van Koning Slijm, omgesmeed. 30% minder schade.' },
};

/** Beschrijving van een voorwerp: { kind: 'weapon' | 'helmet' | 'flask', key } */
export function itemInfo(item) {
  if (item.kind === 'weapon') return WEAPONS[item.key];
  if (item.kind === 'helmet') return HELMETS[item.key];
  return { name: 'Gouden Zaadje', rarity: 'legendarisch', info: 'Je kunt één flesje meer meenemen.' };
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
      if (child.isMesh) child.castShadow = true;
    });
    group.add(model);
  });
  return group;
}
