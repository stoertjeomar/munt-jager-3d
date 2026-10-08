import * as THREE from 'three';
import { loadGLB } from './assets.js';

// Alle wapens in het spel. Pas de getallen aan om ze sterker of sneller te maken!
//   damage    = schade per klap (wordt nog groter naarmate je level hoger is)
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
  // ---------- Blokjes-wapens (pixel art, zie PIXEL_ART onderaan) ----------
  //   pixels = welke tekening uit PIXEL_ART
  dolk: {
    name: 'Dolk', rarity: 'zeldzaam', damage: 12, stamina: 6, range: 1.8, swingTime: 0.17,
    pixels: 'dolk', blade: [0.12, 0.42], trail: 0xe8eef5,
    info: 'Klein maar supersnel. Prik prik prik!',
  },
  bijl: {
    name: 'Bijl', rarity: 'zeldzaam', damage: 26, stamina: 16, range: 2.3, swingTime: 0.4,
    pixels: 'bijl', blade: [0.35, 0.65], trail: 0xd0d6de,
    info: 'Hakt door alles heen. Iets langzamer dan een zwaard.',
  },
  hamer: {
    name: 'Strijdhamer', rarity: 'episch', damage: 38, stamina: 26, range: 2.4, swingTime: 0.56,
    pixels: 'hamer', blade: [0.45, 0.72], trail: 0xffc84a,
    info: 'Loodzwaar. Eén klap en ze vliegen weg.',
  },
  ijszwaard: {
    name: 'IJszwaard', rarity: 'episch', damage: 28, stamina: 12, range: 2.8, swingTime: 0.27,
    pixels: 'ijs', blade: [0.2, 0.92], trail: 0x8fe8ff,
    info: 'Gemaakt van eeuwig ijs. Snel, scherp en koud.',
  },
  zonnezwaard: {
    name: 'Zonnezwaard', rarity: 'legendarisch', damage: 36, stamina: 13, range: 2.9, swingTime: 0.3,
    pixels: 'zon', blade: [0.3, 1.0], trail: 0xffb340,
    info: 'Het gloeit als de zon. Bijna net zo sterk als het Diamanten zwaard.',
  },
  diamant: {
    name: 'Diamanten zwaard', rarity: 'legendarisch', damage: 40, stamina: 15, range: 2.6, swingTime: 0.32,
    pixels: 'diamant', blade: [0.3, 1.0], trail: 0x5ff7de,
    info: 'Het zwaard van de Gevallen Ridder. Een van de sterkste wapens die er zijn.',
  },
  // ---------- Extra 3D-wapens (models/extra) ----------
  //   grip = waar je het vasthoudt (hoogte in het model)   glow = de lichte stukjes gloeien op (0 = niet)
  demonenzwaard: {
    name: 'Demonenzwaard', rarity: 'legendarisch', damage: 43, stamina: 16, range: 2.9, swingTime: 0.33,
    file: 'models/extra/demonenzwaard.glb', scale: 0.95, grip: 0.14, glow: 0.7, blade: [0.4, 1.0], trail: 0xff2a3a,
    info: 'Gesmeed in vuur en duisternis. Nog sterker dan het Diamanten zwaard!',
  },
  zeis: {
    name: 'Zeis van de Dood', rarity: 'legendarisch', damage: 46, stamina: 18, range: 3.1, swingTime: 0.36,
    file: 'models/extra/zeis.glb', scale: 1.6, grip: -0.32, glow: 1.2, blade: [0.6, 1.35], trail: 0x3dff6a,
    info: 'De zeis van Omar zelf. Het sterkste wapen dat er is.',
  },
  // ---------- NightWalker: het bliksemzwaard van Sky (zeldzame buit, zie sky.js) ----------
  // De extra krachten (zap, blikseminslag bij elke 3e klap, wolk-dash) staan in nightwalker.js.
  nightwalker: {
    name: 'NightWalker', rarity: 'legendarisch', damage: 45, stamina: 13, range: 2.9, swingTime: 0.27,
    pixels: 'nacht', blade: [0.3, 1.0], trail: 0xffd23a, lightning: true,
    info: 'Het bliksemzwaard van Sky. Elke 3e klap slaat de bliksem in, en met C word je een wolk.',
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
    const block = buildBlockWeapon(PIXEL_ART[weapon.pixels]);
    block.scale.setScalar(scaleMultiplier);
    return block;
  }

  const group = new THREE.Group();
  loadGLB(weapon.file).then(
    (gltf) => {
      const model = gltf.scene.clone();
      model.scale.setScalar(weapon.scale * scaleMultiplier);
      model.position.y = -(weapon.grip ?? 0) * weapon.scale * scaleMultiplier; // het handvat in je hand
      model.traverse((child) => {
        if (!child.isMesh) return;
        child.castShadow = true;
        // Zonder omgevingsreflectie lijkt metaal zwart: iets lichter en minder metalig maken
        child.material = child.material.clone();
        child.material.metalness = Math.min(child.material.metalness, 0.35);
        const hsl = child.material.color.getHSL({});
        if (hsl.l < 0.18) child.material.color.setHSL(hsl.h, hsl.s, 0.18);
        // Gloeiende stukjes (de groene kling van de zeis, de rode runen van het demonenzwaard)
        if (weapon.glow && child.material.map) {
          child.material.emissiveMap = child.material.map;
          child.material.emissive?.set(0xffffff);
          child.material.emissiveIntensity = weapon.glow;
        }
      });
      group.add(model);
    },
    (error) => console.warn(`Kon ${weapon.file} niet laden`, error)
  );
  return group;
}

// Blokjes-wapens zijn "pixel art", net als in Minecraft. Elke letter is één blokje; de bovenste regel is de punt,
// en `hand` zegt welke regel in de hand zit. `colors` zegt welke kleur elke letter heeft (. = leeg).
// Teken je eigen wapen!
const STEEL = { s: { color: 0x7d8796, roughness: 0.35, metalness: 0.5 }, w: { color: 0xe3e9f0, roughness: 0.2, metalness: 0.4 } };
const WOOD = { h: { color: 0x6b4423, roughness: 0.8 } };
const GOLD = { g: { color: 0xd9a52b, roughness: 0.4, metalness: 0.4 }, b: { color: 0x8a5a14, roughness: 0.6 } };
const SWORD_SHAPE = [
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
const PIXEL_ART = {
  // NightWalker: een nachtzwart lemmet met een gele bliksemschicht erin. n = nachtblauw, k = zwart, y = bliksem, w = wit-heet
  nacht: {
    hand: 19,
    rows: [
      '.....k.....',
      '....kyk....',
      '...knynk...',
      '...knyyk...',
      '...knnyk...',
      '...kyynk...',
      '...kynnk...',
      '...knyyk...',
      '...knwyk...',
      '...kyynk...',
      '...kynnk...',
      '...knyyk...',
      '...knnyk...',
      '...kywnk...',
      'yk.kyynk.ky',
      'kykknynkkyk',
      'kkkkkyykkkk',
      'kkkkkkkkkkk',
      '....nyn....',
      '....yny....',
      '....nyn....',
      '...kkykk...',
      '...kyyyk...',
      '....kkk....',
    ],
    colors: {
      k: { color: 0x07080f, roughness: 0.5, metalness: 0.3 },
      n: { color: 0x1a2350, roughness: 0.3, emissive: 0x0a1030 },
      y: { color: 0xffd23a, roughness: 0.3, emissive: 0xffb000, emissiveIntensity: 1.2 },
      w: { color: 0xffffff, roughness: 0.2, emissive: 0xfff3b0, emissiveIntensity: 1.5 },
    },
  },
  // d = donkergroene rand, m = turquoise, l = lichtblauw, g/b = goud
  diamant: {
    hand: 19,
    rows: SWORD_SHAPE,
    colors: {
      d: { color: 0x0d4a3c, roughness: 0.6 },
      m: { color: 0x2fa58f, roughness: 0.35, emissive: 0x0b3b33 },
      l: { color: 0x8ff0dc, roughness: 0.25, emissive: 0x1d5c50 },
      ...GOLD,
    },
  },
  // Zelfde vorm, maar in de kleuren van de zon (gloeit een beetje)
  zon: {
    hand: 19,
    rows: SWORD_SHAPE,
    colors: {
      d: { color: 0x8a3a00, roughness: 0.6 },
      m: { color: 0xff8a1a, roughness: 0.3, emissive: 0x7a2a00 },
      l: { color: 0xffe27a, roughness: 0.25, emissive: 0x8a5a00 },
      g: { color: 0xfff0b0, roughness: 0.3, metalness: 0.5 },
      b: { color: 0xb8860b, roughness: 0.5 },
    },
  },
  dolk: {
    hand: 9,
    rows: [
      '...w...',
      '..sws..',
      '..sws..',
      '..sws..',
      '..sws..',
      '..sws..',
      '.ggggg.',
      '...h...',
      '...h...',
      '...h...',
      '..ggg..',
    ],
    colors: { ...STEEL, ...WOOD, ...GOLD },
  },
  bijl: {
    hand: 13,
    rows: [
      '..ssh....',
      '.swwhs...',
      'swwwhs...',
      'swwwh....',
      'swwwh....',
      '.swwh....',
      '..ssh....',
      '....h....',
      '....h....',
      '....h....',
      '....h....',
      '....h....',
      '....h....',
      '....h....',
      '...ggg...',
    ],
    colors: { ...STEEL, ...WOOD, ...GOLD },
  },
  hamer: {
    hand: 14,
    rows: [
      '.sssssss.',
      'swwwwwwws',
      'sgggggggs',
      'swwwwwwws',
      '.sssssss.',
      '....h....',
      '....h....',
      '....h....',
      '....h....',
      '....h....',
      '....h....',
      '....h....',
      '....h....',
      '....h....',
      '....h....',
      '...ggg...',
    ],
    colors: { ...STEEL, ...WOOD, ...GOLD },
  },
  // c = ijsblauw, l = licht ijs, w = wit, n = donkerblauw handvat
  ijs: {
    hand: 17,
    rows: [
      '....w....',
      '...lwl...',
      '...lwl...',
      '...cwl...',
      '...lwc...',
      '...lwl...',
      '...cwl...',
      '...lwl...',
      '...lwc...',
      '...lwl...',
      '...cwl...',
      '...lwl...',
      '...lwl...',
      'c..lwl..c',
      'cc.lcl.cc',
      'ccccccccc',
      '....n....',
      '....n....',
      '....n....',
      '...ccc...',
    ],
    colors: {
      c: { color: 0x3fb6ff, roughness: 0.2, emissive: 0x0a3a6a },
      l: { color: 0xbff4ff, roughness: 0.1, emissive: 0x2a6a8a },
      w: { color: 0xffffff, roughness: 0.1, emissive: 0x4a6a7a },
      n: { color: 0x1d2f5a, roughness: 0.6 },
    },
  },
};
const PIXEL = 0.052; // grootte van één blokje

/** Bouwt een wapen uit blokjes. Per kleur één InstancedMesh, dat is snel. */
function buildBlockWeapon(art) {
  const group = new THREE.Group();
  const cube = new THREE.BoxGeometry(PIXEL, PIXEL, PIXEL * 1.4);
  const width = art.rows[0].length;

  for (const [letter, settings] of Object.entries(art.colors)) {
    const spots = [];
    art.rows.forEach((row, r) => {
      [...row].forEach((ch, c) => {
        if (ch === letter) spots.push([c, r]);
      });
    });
    if (spots.length === 0) continue;

    const mesh = new THREE.InstancedMesh(cube, new THREE.MeshStandardMaterial({ flatShading: true, ...settings }), spots.length);
    const m = new THREE.Matrix4();
    spots.forEach(([c, r], i) => {
      m.makeTranslation((c - (width - 1) / 2) * PIXEL, (art.hand - r) * PIXEL, 0);
      mesh.setMatrixAt(i, m);
    });
    mesh.castShadow = true;
    group.add(mesh);
  }
  return group;
}
