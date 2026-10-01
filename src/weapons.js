import * as THREE from 'three';
import { loadGLB } from './assets.js';

// Alle wapens in het spel. Pas de getallen aan om ze sterker of sneller te maken!
//   damage    = schade per klap (wordt nog groter met je Kracht-level)
//   stamina   = hoeveel uithouding één slag kost
//   range     = hoe ver het wapen reikt
//   swingTime = hoe lang een slag duurt (kleiner = sneller slaan)
//   rarity    = gewoon / zeldzaam / episch / legendarisch (bepaalt de kleur in je inventaris)
//   file      = 3D-model (.glb) in models/wapens/, met het handvat in het midden
//   scale     = hoe groot het model wordt
//   blade     = [begin, punt] van het lemmet (afstand vanaf de hand), voor het zwaard-windje
//   trail     = kleur van het zwaard-windje
export const WEAPONS = {
  shortsword: {
    name: 'Kort zwaard', rarity: 'gewoon', damage: 14, stamina: 10, range: 2.1, swingTime: 0.24,
    file: 'models/wapens/ShortSword.glb', scale: 0.3, blade: [0.25, 0.87], trail: 0xffd36b,
    info: 'Snel en licht. Een prima begin.',
  },
  sword: {
    name: 'Ridderzwaard', rarity: 'zeldzaam', damage: 21, stamina: 14, range: 2.7, swingTime: 0.36,
    file: 'models/wapens/Sword.glb', scale: 0.3, blade: [0.35, 1.16], trail: 0xb8dcff,
    info: 'Een betrouwbaar zwaard met een lange kling.',
  },
  katana: {
    name: 'Katana', rarity: 'episch', damage: 24, stamina: 12, range: 2.8, swingTime: 0.26,
    file: 'models/wapens/Katana.glb', scale: 0.33, blade: [0.3, 1.1], trail: 0xff4f7a,
    info: 'Razendsnel en scherp. Lang bereik.',
  },
  club: {
    name: 'Knots', rarity: 'episch', damage: 34, stamina: 22, range: 2.3, swingTime: 0.5,
    file: 'models/wapens/Club.glb', scale: 0.42, blade: [0.35, 0.87], trail: 0xff8a2b,
    info: 'Langzaam maar loeihard.',
  },
  diamant: {
    name: 'Diamanten zwaard', rarity: 'legendarisch', damage: 40, stamina: 15, range: 2.6, swingTime: 0.32,
    blade: [0.3, 1.0], trail: 0x5ff7de,
    info: 'Het zwaard van de Gevallen Ridder. Het sterkste wapen dat er is.',
  },
};

export const START_WEAPON = 'shortsword';

export const RARITY_COLORS = { gewoon: '#d8d8d8', zeldzaam: '#6fb7ff', episch: '#c77dff', legendarisch: '#ffb340' };

/**
 * Maakt een 3D-wapen. Het handvat zit op (0, 0, 0) en het wapen wijst langs +Y.
 * Modellen worden op de achtergrond geladen en verschijnen zodra ze binnen zijn.
 */
export function createWeaponMesh(key, scaleMultiplier = 1) {
  const weapon = WEAPONS[key];
  if (!weapon.file) {
    const block = buildBlockSword();
    block.scale.setScalar(scaleMultiplier);
    return block;
  }

  const group = new THREE.Group();
  loadGLB(weapon.file).then(
    (gltf) => {
      const model = gltf.scene.clone();
      model.scale.setScalar(weapon.scale * scaleMultiplier);
      model.traverse((child) => {
        if (child.isMesh) child.castShadow = true;
      });
      group.add(model);
    },
    (error) => console.warn(`Kon ${weapon.file} niet laden`, error)
  );
  return group;
}

// Het zwaard is "pixel art" van blokjes, net als een diamanten zwaard in Minecraft.
// Elke letter is één blokje; de bovenste regel is de punt. Teken je eigen zwaard!
//   d = donkergroene rand   m = turquoise   l = lichtblauw
//   g = goud                b = donker goud   . = leeg
const SWORD_PIXELS = [
  '.....d.....',
  '....dld....',
  '...dllmd...',
  '...dlmld...',
  '...dmlld...',
  '...dllmd...',
  '...dlmld...',
  '...dmlld...',
  '...dllmd...',
  '...dlmld...',
  '...dmlld...',
  '...dllmd...',
  '...dlmld...',
  '...dmlld...',
  'dd.dlmld.dd',
  'dldllmlldld',
  'dlllmmmllld',
  'ddddddddddd',
  '....gbg....',
  '....bgb....',
  '....gbg....',
  '...ddldd...',
  '...dlmld...',
  '....ddd....',
];
const PIXEL = 0.052; // grootte van één blokje
const HANDLE_ROW = 19; // deze regel zit in de hand

const PIXEL_COLORS = {
  d: { color: 0x0d4a3c, roughness: 0.6 },
  m: { color: 0x2fa58f, roughness: 0.35, emissive: 0x0b3b33 },
  l: { color: 0x8ff0dc, roughness: 0.25, emissive: 0x1d5c50 },
  g: { color: 0xd9a52b, roughness: 0.4, metalness: 0.4 },
  b: { color: 0x8a5a14, roughness: 0.6 },
};

/** Bouwt het zwaard uit blokjes. Per kleur één InstancedMesh, dat is snel. */
function buildBlockSword() {
  const group = new THREE.Group();
  const cube = new THREE.BoxGeometry(PIXEL, PIXEL, PIXEL * 1.4);
  const width = SWORD_PIXELS[0].length;

  for (const [letter, settings] of Object.entries(PIXEL_COLORS)) {
    const spots = [];
    SWORD_PIXELS.forEach((row, r) => {
      [...row].forEach((ch, c) => {
        if (ch === letter) spots.push([c, r]);
      });
    });
    if (spots.length === 0) continue;

    const mesh = new THREE.InstancedMesh(cube, new THREE.MeshStandardMaterial({ flatShading: true, ...settings }), spots.length);
    const m = new THREE.Matrix4();
    spots.forEach(([c, r], i) => {
      m.makeTranslation((c - (width - 1) / 2) * PIXEL, (HANDLE_ROW - r) * PIXEL, 0);
      mesh.setMatrixAt(i, m);
    });
    mesh.castShadow = true;
    group.add(mesh);
  }
  return group;
}
