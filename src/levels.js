// De gebieden van Munt Jager. Elk gebied is een pad van het begin naar de boss-arena,
// met halverwege een checkpoint-vlag. Samen vormen ze één grote OPEN WERELD (zie onderaan):
// ze liggen naast elkaar als een slang, en paden verbinden ze. Je kunt overal heen lopen.
//
// Pas deze lijsten aan om je eigen levels te maken!
//   half      = hoe groot het level is: x van -half.x tot half.x, z van -half.z tot half.z
//   theme     = 'weide' (gras), 'woud' (donker bos) of 'hoogland' (rotsen)
//   music     = welk liedje er speelt (zie music.js)
//   path      = punten van het pad, van start naar boss
//   checkpoints = [id, naam, x, z]  (de eerste is het begin; als je doodgaat kom je terug bij de laatste die je haalde)
//   spawns    = [soort, aantal]  → worden langs het pad verdeeld
//   chests    = [id, x, y, z, voorwerp]
//   npcs      = [personage, x, z, quest]  (zie quests.js)
//               ['omar', x, z] is Omar zelf: hij geeft geen quest, maar daagt je uit (zie omar.js).
//   dummies   = [x, z]  oefenpoppen: daar kun je op slaan om je schade te zien (ze vallen nooit om)
//               Hij staat in elk level vlak bij het begin.
//   blocks    = losse stenen blokken / platforms [x, y, z, breedte, hoogte, diepte, kleur]
//   houses    = huizen (alleen in level 1: Muntdorp)

export const SAVE_KEY = 'munt-jager-3d-save-v3';

export const LEVELS = [
  {
    name: 'Groene Weide',
    subtitle: 'Level 1',
    theme: 'weide',
    music: 'weide',
    half: { x: 36, z: 100 },
    boss: 'mario',
    path: [[4, 92], [8, 72], [6, 44], [-6, 16], [-10, -14], [0, -40], [0, -62]],
    checkpoints: [['l1-start', 'Muntdorp', 6, 88], ['l1-mid', 'Weidepoort', -9, 0]],
    spawns: [['slijmpje', 10], ['slijmbal', 5], ['boksdino', 2], ['zombie', 2]],
    chests: [
      ['l1-dorp', -11, 0, 74, { kind: 'weapon', key: 'dolk' }], // binnen in het grote huis in Muntdorp!
      ['l1-boog', 26, 0, 20, { kind: 'weapon', key: 'bijl' }],
      ['l1-fles', -28, 0, -30, { kind: 'flask' }],
    ],
    diamonds: [['l1-d1', 30, 0, 80], ['l1-d2', -30, 0, 10], ['l1-d3', 28, 0, -50]],
    npcs: [['mila', -4, 76, 'mila-tuin'], ['strohoed', 18, 52, 'strohoed-sterren'], ['omar', 11, 77], ['alien', -8, 64]],
    dummies: [[-2, 88]], // een oefenpop bij het begin: sla erop om je schade te zien
    questItems: { 'strohoed-sterren': [[-26, 40], [24, -6], [-24, -52], [30, 34]] },
    village: { center: [-14, 62] },
    houses: [
      // [x, z, breedte, diepte, hoogte, muur-textuur, dak-textuur] — je kunt door de deur naar binnen lopen
      [-24, 55, 8, 7, 3.4, 'wall_timber_structure', 'roof_clay_red_center'],
      [-25, 68, 7, 6, 3.2, 'wall_brick_small_sand', 'roof_thatch_center'],
      [-3, 54, 7, 6, 3.4, 'wall_brick_small_sand', 'roof_clay_red_center'],
      [-14, 75, 9, 7, 3.8, 'wall_brick_stone_center', 'roof_clay_red_center'],
    ],
    blocks: [],
    animals: [['duck', [[-14, 50], [20, 30], [10, 80]], 6], ['dog', [[-14, 60], [0, 84]], 3]],
    trees: 70,
  },
  {
    name: 'Ruïnevallei',
    subtitle: 'Level 2',
    theme: 'weide',
    music: 'vallei',
    tint: [1.15, 1.2, 0.95],
    half: { x: 36, z: 100 },
    boss: 'koning',
    path: [[-4, 92], [-14, 66], [-16, 36], [0, 22], [14, -10], [6, -40], [0, -62]],
    checkpoints: [['l2-start', 'Valleipoort', -4, 88], ['l2-mid', 'Oude Ruïne', 16, -18]],
    spawns: [['slijmbal', 8], ['slijmpje', 4], ['boksdino', 3], ['spierbonk', 2], ['golem', 1]],
    chests: [
      ['l2-platform', -3, 7.25, -14 + 24, { kind: 'weapon', key: 'katana' }], // bovenop het hoogste platform!
      ['l2-knots', 28, 0, 60, { kind: 'weapon', key: 'club' }],
      ['l2-kap', -28, 0, -36, { kind: 'helmet', key: 'kap' }],
      ['l2-fles', 26, 0, -48, { kind: 'flask' }],
    ],
    diamonds: [['l2-d1', 2, 6.25, -16 + 24], ['l2-d2', -30, 0, 80], ['l2-d3', 30, 0, -4]],
    npcs: [['robot', -24, 50, 'robot-batterijen'], ['omar', -3.5, 79]],
    questItems: { 'robot-batterijen': [[24, 78], [-28, 12], [28, 36], [-26, -12], [22, -54]] },
    // De oude parkour-ruïne (24 meter naar het zuiden geschoven)
    blocks: [
      [6, 0.5, 24, 3, 1, 3], [9, 1.0, 21, 3, 2, 3], [12, 1.5, 18, 3, 3, 3], [12, 2.0, 13, 3, 4, 3],
      [7, 5.0, 10, 3, 0.5, 3], [2, 6.0, 8, 3, 0.5, 3], [-3, 7.0, 10, 3, 0.5, 3],
      [-8, 0.7, 28, 2, 1.4, 2], [-12, 1.5, 22, 6, 3, 1], [-15, 0.5, 16, 4, 1, 4], [-18, 1, 12, 3, 2, 3],
      [-26, 1.5, 70, 8, 3, 1], [-30, 1, 76, 1, 2, 6], [24, 1.5, -26, 1, 3, 7], [30, 1, -30, 6, 2, 1],
    ],
    animals: [['duck', [[20, 70], [-20, 40]], 4]],
    trees: 50,
  },
  {
    name: 'Spookwoud',
    subtitle: 'Level 3',
    theme: 'woud',
    music: 'woud',
    half: { x: 36, z: 100 },
    boss: 'ridder',
    path: [[0, 92], [14, 70], [10, 40], [-14, 18], [-12, -12], [8, -38], [0, -62]],
    checkpoints: [['l3-start', 'Rand van het Woud', 0, 88], ['l3-mid', 'Woudruïne', -14, 4]],
    spawns: [['spook', 6], ['zombie', 7], ['slijmbal', 3], ['bigfoot', 2]],
    chests: [
      ['l3-sluip', 28, 0, 22, { kind: 'weapon', key: 'ijszwaard' }],
      ['l3-fles', -28, 0, 60, { kind: 'flask' }],
      ['l3-fles2', 28, 0, -46, { kind: 'flask' }],
    ],
    diamonds: [['l3-d1', -30, 0, 90], ['l3-d2', 30, 0, 56], ['l3-d3', -30, 0, -40]],
    npcs: [['ridder', 22, 82, 'ridder-zombies'], ['omar', 1.5, 80]],
    questItems: {},
    blocks: [[-26, 1.2, 36, 6, 2.4, 1], [-30, 1.2, 40, 1, 2.4, 6], [24, 1.5, -10, 8, 3, 1]],
    animals: [['bear', [[-24, 60], [24, 0], [-24, -30]], 4]],
    trees: 170,
  },
  {
    name: 'Rotshoogland',
    subtitle: 'Level 4 · Finale',
    theme: 'hoogland',
    music: 'hoogland',
    half: { x: 38, z: 100 },
    boss: 'reus',
    path: [[0, 92], [-14, 64], [-8, 34], [14, 10], [14, -20], [0, -44], [0, -60]],
    checkpoints: [['l4-start', 'Voet van het Hoogland', 0, 88], ['l4-mid', 'Rotsentop', 16, 0]],
    spawns: [['golem', 4], ['mecha', 3], ['spierbonk', 3], ['bigfoot', 2], ['spook', 2]],
    chests: [
      ['l4-sluip', -30, 0, 10, { kind: 'weapon', key: 'zonnezwaard' }],
      ['l4-fles', 30, 0, 50, { kind: 'flask' }],
      ['l4-fles2', -30, 0, -44, { kind: 'weapon', key: 'demonenzwaard' }],
    ],
    diamonds: [['l4-d1', 32, 0, 88], ['l4-d2', -29, 0, 44], ['l4-d3', 32, 0, -30]], // (niet te ver naar links: daar is de Schaduwpoort)
    npcs: [['mila', -20, 80, 'mila-mecha'], ['omar', -0.5, 80]],
    questItems: {},
    blocks: [[28, 1.5, 20, 1, 3, 7], [22, 1, 28, 6, 2, 1]],
    animals: [],
    trees: 25,
  },
  {
    // Het geheime vijfde gebied: de Schaduwpoort gaat pas open als je de andere vier bosses hebt verslagen.
    // Hier wonen Omars ergste vijanden (de etalagepoppen) en zijn allerlaatste geheim: de Schaduwdraak.
    name: 'Schaduwrijk',
    subtitle: 'Gebied 5 · Het allerlaatste',
    theme: 'schaduw',
    music: 'schaduw',
    half: { x: 36, z: 100 },
    boss: 'schaduwdraak',
    locked: true,
    path: [[0, 92], [12, 66], [-6, 40], [-16, 14], [2, -14], [12, -40], [0, -62]],
    checkpoints: [['l5-start', 'Schaduwpoort', 0, 88], ['l5-mid', 'Kristalveld', -17, 0]],
    spawns: [['zombiepop', 9], ['ninjapop', 6], ['schaduw', 4], ['spook', 3], ['bigfoot', 2]],
    chests: [
      ['l5-appel', 28, 0, 34, { kind: 'flask' }],
      ['l5-appel2', -28, 0, -34, { kind: 'flask' }],
      ['l5-hamer', -28, 0, 64, { kind: 'weapon', key: 'hamer' }],
    ],
    diamonds: [['l5-d1', 30, 0, 86], ['l5-d2', -31, 0, 24], ['l5-d3', 30, 0, -24]],
    npcs: [],
    questItems: {},
    // Zwarte ruïnes van obsidiaan
    blocks: [[-24, 1.6, 50, 6, 3.2, 1], [-27, 1.6, 54, 1, 3.2, 7], [22, 2, -8, 1, 4, 8], [26, 1.2, -12, 7, 2.4, 1], [-10, 0.8, -40, 3, 1.6, 3]],
    animals: [],
    trees: 55,
  },
];

// ======================================================================
// De open wereld: alle gebieden aan elkaar
// ======================================================================
// De gebieden liggen naast elkaar (van west naar oost). Elk tweede gebied is omgedraaid, zodat het eind van
// het ene gebied naast het begin van het volgende ligt (een slang):
//
//    noord   [Weide: boss]  [Vallei: start]   [Woud: boss]  [Hoogland: start]
//              ↑ pad           ↓ pad            ↑ pad          ↓ pad
//    zuid    [Weide: start] [Vallei: boss]    [Woud: start] [Hoogland: boss]
//
// Paden verbinden het eind van elk gebied met het begin van het volgende. Alles uit LEVELS hierboven
// (vlaggen, kisten, vijanden, mensen, huizen...) wordt gewoon op de goede plek in de wereld gezet.
export const REGION_WIDTH = 76; // zo breed is één gebied (meter)

function buildOpenWorld() {
  const regions = LEVELS.map((level, i) => {
    const flip = i % 2 === 1; // omgedraaid: het pad loopt van noord naar zuid
    const ox = (i - (LEVELS.length - 1) / 2) * REGION_WIDTH; // midden van het gebied (x)
    const t = (x, z) => [ox + (flip ? -x : x), flip ? -z : z]; // plek in het level → plek in de wereld
    return {
      index: i, level, name: level.name, subtitle: level.subtitle, theme: level.theme, music: level.music,
      tint: level.tint, boss: level.boss, trees: level.trees, flip, ox, t,
      x0: ox - REGION_WIDTH / 2, x1: ox + REGION_WIDTH / 2, start: level.checkpoints[0][0],
    };
  });
  const world = {
    name: 'De wereld van Munt Jager', subtitle: 'Open wereld', open: true, theme: 'weide', music: 'weide', boss: null,
    half: { x: (REGION_WIDTH * LEVELS.length) / 2, z: 100 },
    regions, paths: [], arenas: [], checkpoints: [], chests: [], diamonds: [], npcs: [], dummies: [],
    questItems: {}, houses: [], blocks: [], animals: [], village: null, trees: 0, path: [],
  };
  for (const r of regions) {
    const L = r.level;
    const t = r.t;
    world.paths.push(L.path.map(([x, z]) => t(x, z)));
    const [ax, az] = t(0, -78);
    world.arenas.push({ id: L.boss, x: ax, z: az, radius: 18, open: r.flip ? -1 : 1, region: r.index });
    world.checkpoints.push(...L.checkpoints.map(([id, name, x, z]) => [id, name, ...t(x, z)]));
    world.chests.push(...L.chests.map(([id, x, y, z, item]) => { const [X, Z] = t(x, z); return [id, X, y, Z, item]; }));
    world.diamonds.push(...L.diamonds.map(([id, x, y, z]) => { const [X, Z] = t(x, z); return [id, X, y, Z]; }));
    // Omar staat maar één keer in de wereld: in Muntdorp
    world.npcs.push(...L.npcs.filter((n) => n[0] !== 'omar' || r.index === 0).map(([who, x, z, q]) => [who, ...t(x, z), q]));
    world.dummies.push(...(L.dummies ?? []).map(([x, z]) => t(x, z)));
    for (const [q, spots] of Object.entries(L.questItems ?? {})) world.questItems[q] = spots.map(([x, z]) => t(x, z));
    world.houses.push(...(L.houses ?? []).map(([x, z, ...rest]) => [...t(x, z), ...rest]));
    world.blocks.push(...(L.blocks ?? []).map(([x, y, z, ...rest]) => { const [X, Z] = t(x, z); return [X, y, Z, ...rest]; }));
    world.animals.push(...(L.animals ?? []).map(([kind, homes, n]) => [kind, homes.map(([x, z]) => t(x, z)), n]));
    if (L.village) world.village = { center: t(...L.village.center) };
  }
  // Verbindingspaden: van vlak voor de boss-arena van het ene gebied naar het begin van het volgende
  for (let i = 0; i < regions.length - 1; i++) {
    const a = world.paths[i];
    const b = world.paths[i + 1];
    world.paths.push([a[a.length - 2], b[0]]);
  }
  return world;
}

export const WORLD = buildOpenWorld();
export const REGIONS = WORLD.regions;

/** In welk gebied (0, 1, 2, 3) ligt dit punt? (de grens is een beetje golvend, dat ziet er natuurlijker uit) */
export function regionIndexAt(x, z) {
  const wobble = Math.sin(z * 0.08) * 4 + Math.sin(z * 0.21) * 2;
  const i = Math.floor((x + wobble + WORLD.half.x) / REGION_WIDTH);
  return Math.min(REGIONS.length - 1, Math.max(0, i));
}

/** Het gebied dat op slot zit tot de andere bosses verslagen zijn (het Schaduwrijk), of null. */
export const LOCKED_REGION = REGIONS.find((r) => r.level.locked) ?? null;
/** Zover kun je lopen zolang de Schaduwpoort dicht is (een stukje vóór de golvende grens). */
export const GATE_X = LOCKED_REGION ? LOCKED_REGION.x0 - 6.5 : Infinity;

/** In welk gebied ligt deze vlag? */
export function regionOfCheckpoint(id) {
  const i = LEVELS.findIndex((l) => l.checkpoints.some((c) => c[0] === id));
  return i < 0 ? 0 : i;
}

/** ?level=2 in de adresbalk (om te testen): begin aan het begin van dat gebied. Anders null. */
export const URL_REGION = (() => {
  const n = Number(new URLSearchParams(location.search).get('level'));
  return n >= 1 && n <= LEVELS.length ? n - 1 : null;
})();

/** In welk gebied ben je nu? (waar je laatste vlag staat, of ?level=... om te testen) */
export function currentLevelIndex() {
  if (URL_REGION !== null) return URL_REGION;
  try {
    const save = JSON.parse(localStorage.getItem(SAVE_KEY));
    return save?.checkpoint ? regionOfCheckpoint(save.checkpoint) : 0;
  } catch {
    return 0;
  }
}

// Het Gekke Kasteel van Omar: een geheim level. Het staat NIET in LEVELS, dus je kunt het niet kiezen
// en het speelt niks vrij. Omar neemt je erheen (index.html?level=omar) en brengt je daarna terug.
// De wereld zelf wordt gebouwd in castle.js, Omar zelf staat in omarFighter.js.
export const CASTLE = {
  name: 'Het Gekke Kasteel van Omar',
  subtitle: 'Geheim kasteel',
  theme: 'kasteel',
  music: 'kasteel',
  castle: true,
  half: { x: 31, z: 35 },
  boss: 'omar',
  arena: { x: 0, z: 0, radius: 15 }, // de arena staat midden op de binnenplaats
  path: [],
  checkpoints: [['omar-poort', 'Kasteelpoort', 0, 22]],
  spawns: [],
  chests: [],
  diamonds: [],
  npcs: [],
  questItems: {},
  blocks: [],
  animals: [],
  trees: 0,
};

/** Zitten we in het kasteel van Omar? (?level=omar in de adresbalk) */
export const IN_CASTLE = new URLSearchParams(location.search).get('level') === 'omar';

// LEVEL_INDEX = het gebied waar je (bij het laden) bent. In het kasteel: waar je vandaan kwam.
export const LEVEL_INDEX = currentLevelIndex();
export const LEVEL = IN_CASTLE ? CASTLE : WORLD;
