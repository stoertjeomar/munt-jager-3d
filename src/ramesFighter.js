import * as THREE from 'three';
import { Boss, BOSS_CLASSES, BOSS_POWER } from './bosses.js';
import { createWeaponMesh, WEAPONS } from './weapons.js';
import { graveyardLayout } from './world.js';
import { makeBubble } from './npcs.js';
import { SwordTrail } from './trail.js';
import { play } from './audio.js';

// Rames: de Heer van de Ondoden. Een geheime boss op het Knekelhof in het Spookwoud (zie levels.js en world.js).
// Hij is een ondode samoerai: een schedel met gloeiende ogen onder een helm met hoorns, een gescheurde cape
// en een zwarte Schaduwkatana vol duistere magie. Hij is helemaal in code gebouwd uit simpele vormen.
//
// Wat hij kan:
//   - Katana-combo: een paar snelle slagen en dan een dreun op de grond
//   - Schaduwsnede: hij duikt in elkaar en flitst in een rechte lijn dwars door je heen (rode cirkels laten de lijn zien)
//   - Duistere magie: een waaier van paarse ballen uit zijn linkerhand
//   - Botstekels: hij steekt zijn katana in de grond en onder jouw voeten schieten stekels van bot omhoog
//   - Bullys: hij roept skeletten op die uit de graven kruipen en je met z'n allen komen pakken
//   - Schaduwstap (onder de helft van zijn leven): poef, weg... en dan staat hij achter je
//   - Hij is ONDOOD: als zijn leven op is valt hij neer, maar hij staat nog één keer op, groen en razend.
//     Dan kan hij ook de Zielenstorm: een draaiende spiraal van magie (spring eroverheen of rol erdoor).
//
// Eerlijk vechten: elke aanval zie je aankomen (een houding, een geluid, rode cirkels op de grond),
// en na elke aanval staat hij even stil: DAN moet je slaan.
//
// De filmpjes (wakker worden op zijn troon, de bullys, opstaan uit de dood en zijn einde) regelt rames.js.

// ---------- Instellingen: hiermee maak je Rames makkelijker of moeilijker ----------
// Bij drie getallen [a, b, c] is a voor het begin, b voor onder de helft van zijn leven en c voor als hij is herrezen.
// (Zijn leven en munten staan in BOSS_INFO in bosses.js. Schade en snelheid gaan daarna nog keer BOSS_POWER.)
export const RAMES = {
  size: 1.45, // hoe groot hij is (1 = zo groot als jij)
  rebirth: 0.45, // zoveel van zijn leven krijgt hij terug als hij uit de dood opstaat
  speed: [3.3, 3.9, 4.7], // hoe snel hij loopt
  tempo: [1, 1.15, 1.3], // hoe snel al zijn aanvallen gaan
  rest: [1.25, 0.9, 0.6], // pauze tussen twee aanvallen (seconden)
  recover: [0.95, 0.75, 0.6], // zo lang staat hij na een aanval stil: dan kun jij slaan!
  combo: { slashes: [2, 3, 4], range: 4.6, damage: 24, smash: 32, smashRadius: 3.2 },
  iai: { dashes: [1, 2, 3], windup: 0.75, again: 0.55, past: 7, length: 17, width: 1.7, damage: 34 }, // de Schaduwsnede: hij stopt `past` meter achter je
  bolts: { count: [3, 5, 5], volleys: [1, 1, 2], speed: 15, damage: 15 },
  spikes: { count: [3, 5, 7], every: 0.5, delay: 0.65, radius: 2.3, damage: 26 },
  // Bullys: at = bij zoveel van zijn leven roept hij ze. Herrezen roept hij ook nieuwe als ze allemaal op zijn (na `again` seconden).
  bullys: { count: [3, 4, 4], max: 6, at: [0.75, 0.25], reborn: [0.3, 0.12], again: 15 },
  teleport: { behind: 2.8, gone: 0.25, windup: 0.42 },
  storm: { time: 4.2, every: 0.16, turn: 0.3, arms: 3, speed: 10.5, damage: 13, tired: 3.4, cooldown: 17 },
};

const PURPLE = 0x9b4dff; // zijn magie in het begin
const GREEN = 0x5dff7a; // ...en als hij uit de dood is opgestaan
const HIP = 0.97; // hoogte van zijn heupen (in het model, voor het groter maken)
const tmp = new THREE.Vector3();

// Wat hij roept tijdens het gevecht (in zijn tekstwolkje)
const BARKS = {
  combo: ['pak aan neef', 'zovan sta dan stil', 'kom hier bro'],
  iai: ['kijk uit neef', 'te sloom man', 'zovan je ziet me niet eens'],
  bolts: ['dark magic neef', 'vang dan', 'deze is voor jou bro'],
  spikes: ['kijk naar de grond neef', 'onder je bro', 'mijn kerkhof mijn regels'],
  bullys: ['BULLYS pak hem', 'bullys waar zijn jullie', 'kom op mannen pak die gast'],
  teleport: ['achter je neef', 'boe', 'zovan hier ben ik'],
  storm: ['nu ben je klaar neef', 'zielenstorm bro ren maar'],
  moe: ['wacht ff neef even pauze', 'zovan ik moet ff zitten'],
  raak: ['haha die zat', 'ik zei toch neef', 'makkelijk man', 'je gaat niet halen bro'],
  au: ['au neef rustig', 'zovan dat kietelt alleen', 'voel ik niks van bro', 'ey niet zo hard'],
  herrezen: ['ik kan niet eens dood bro', 'undead neef undead', 'je gaat echt niet halen'],
};
const pick = (list) => list[Math.floor(Math.random() * list.length)];

function angleTo(from, to) {
  return Math.atan2(to.x - from.x, to.z - from.z);
}

function turnTowards(object, angle, speed, dt) {
  let diff = angle - object.rotation.y;
  diff = Math.atan2(Math.sin(diff), Math.cos(diff));
  object.rotation.y += diff * Math.min(1, speed * dt);
}

function flatDist(a, b) {
  return Math.hypot(a.x - b.x, a.z - b.z);
}

/** Afstand (over de grond) van punt p tot het lijnstuk a-b. */
function distToLine(p, a, b) {
  const dx = b.x - a.x;
  const dz = b.z - a.z;
  const len = dx * dx + dz * dz;
  const t = len < 1e-6 ? 0 : THREE.MathUtils.clamp(((p.x - a.x) * dx + (p.z - a.z) * dz) / len, 0, 1);
  return Math.hypot(p.x - (a.x + dx * t), p.z - (a.z + dz * t));
}

// ---------- Houdingen ----------
// Een houding is een lijstje hoeken (radialen). Wat er niet in staat, gaat terug naar REST.
//   y = hoe ver hij zakt · float = zweven · fall = voorover vallen · lean/twist/roll = zijn bovenlijf
//   arm..x = arm naar voren (min) of achteren · arm..z = arm opzij · wrist = pols (de katana omhoog of omlaag)
//   thigh/shin = bovenbeen en onderbeen (knie)
const REST = {
  y: 0, float: 0, fall: 0, lean: 0.05, twist: 0, roll: 0, headX: 0, headY: 0, jaw: 0,
  armRx: -0.3, armRz: -0.18, wrist: -0.5, armLx: 0.05, armLz: 0.16, thighL: 0, thighR: 0, shinL: 0, shinR: 0,
};
const SIT = { y: -0.19, lean: 0.12, armRx: -0.3, armRz: -0.32, wrist: 0, armLx: -0.3, armLz: 0.32, thighL: -1.45, thighR: -1.45, shinL: 1.45, shinR: 1.45 };
const KNEEL = { y: -0.42, lean: 0.5, headX: 0.5, armRx: -1.0, armRz: 0.2, wrist: 2.55, armLx: 0.1, armLz: 0.3, thighL: -1.5, shinL: 1.6, thighR: 0.15, shinR: 1.45 };
export const POSES = {
  klaar: { lean: 0.1, armRx: -0.45, armRz: -0.25, wrist: -0.75, armLx: -0.1, armLz: 0.2, thighL: -0.12, thighR: 0.1 }, // klaar om te vechten
  // Op de troon
  zit: { ...SIT, headX: 0.55 }, // slapend (dood?), hoofd omlaag
  wakker: { ...SIT, lean: 0.02, headX: 0.05 },
  wijs: { ...SIT, lean: 0.22, headX: 0.02, armLx: -1.45, armLz: -0.12 }, // wijst naar jou
  lach: { ...SIT, lean: -0.2, headX: -0.4, jaw: 0.35 },
  armen: { ...SIT, lean: -0.05, headX: -0.2, armLx: -0.9, armLz: 1.1, armRx: -0.9, armRz: -1.1, jaw: 0.3 }, // armen wijd: "mijn bullys"
  reik: { ...SIT, lean: 0.1, twist: -0.35, headY: -0.55, armRx: -1.15, armRz: -0.85 }, // kijkt naar zijn katana
  voorover: { ...SIT, lean: 0.4, headX: -0.1, armLx: -0.7, armLz: 0.1 },
  // Staand, in de filmpjes
  grijp: { lean: 0.3, twist: -0.5, headY: -0.4, armRx: -0.7, armRz: -1.0, wrist: 0.6, thighL: -0.2, thighR: 0.15 },
  heffen: { lean: -0.12, headX: -0.3, armRx: -2.95, armRz: -0.1, wrist: 1.4, armLx: -0.3, armLz: 0.55, jaw: 0.3 }, // katana hoog in de lucht
  neerslaan: { lean: 0.42, twist: 0.3, armRx: -0.75, armRz: 0.25, wrist: 0.95, armLx: -0.2, armLz: 0.5, thighL: -0.4, shinL: 0.5, thighR: 0.3 },
  planten: { y: -0.1, lean: 0.45, armRx: -0.95, armRz: 0.25, wrist: 2.55, armLx: -0.95, armLz: -0.25, thighL: -0.5, shinL: 0.9, thighR: 0.2, shinR: 0.5 }, // katana in de grond
  roepen: { lean: -0.15, headX: -0.4, jaw: 0.5, armLx: -2.7, armLz: 0.5, armRx: -0.6, armRz: -0.9, wrist: -0.4 }, // linkerhand omhoog: bullys!
  knielen: KNEEL, // op één knie, steunend op zijn katana
  gevallen: { fall: 1.5, y: 0.1, headX: -0.3, armRx: -2.6, armRz: -0.5, wrist: 1.5, armLx: -2.4, armLz: 0.6 }, // plat op zijn gezicht
  zweven: { float: 1.1, lean: -0.2, headX: -0.5, jaw: 0.4, armRx: -0.6, armRz: -1.25, wrist: -0.3, armLx: -0.6, armLz: 1.25, thighL: 0.15, thighR: -0.05, shinL: 0.5, shinR: 0.3 },
};

/**
 * Het model van Rames, van simpele vormen. De voorkant is +z, zijn voeten staan op y = 0.
 * Geeft ook de "rig" terug: de onderdelen die kunnen bewegen.
 */
function buildRames() {
  const root = new THREE.Group();
  const mat = (color, extra = {}) => new THREE.MeshStandardMaterial({ color, roughness: 0.6, emissive: 0x000000, ...extra });
  const armor = mat(0x1b1626, { metalness: 0.55, roughness: 0.4 });
  const cloth = mat(0x130f1c, { roughness: 0.95, side: THREE.DoubleSide });
  const bone = mat(0xe6dfc8, { roughness: 0.65 });
  const gold = mat(0xb39b5a, { metalness: 0.6, roughness: 0.35 });
  const trim = mat(0x6a3fd0, { metalness: 0.4, roughness: 0.35, emissive: 0x3a1a8a, emissiveIntensity: 0.7 }); // gloeiende randjes
  const hollow = new THREE.MeshBasicMaterial({ color: 0x050308 }); // oogkassen, de holte in zijn borst
  const eyeMat = new THREE.MeshStandardMaterial({ color: 0x000000, emissive: PURPLE, emissiveIntensity: 0 });
  const soulMat = eyeMat.clone(); // zijn ziel: gloeit tussen zijn ribben
  const add = (parent, geo, material, [x, y, z], [rx, ry, rz] = [0, 0, 0], [sx, sy, sz] = [1, 1, 1]) => {
    const m = new THREE.Mesh(geo, material);
    m.position.set(x, y, z);
    m.rotation.set(rx, ry, rz);
    m.scale.set(sx, sy, sz);
    m.castShadow = material !== hollow;
    parent.add(m);
    return m;
  };
  const rig = { root };

  // ---------- Benen: een wijde zwarte broek (hakama), met voeten van bot. Ze draaien om de heup en de knie. ----------
  for (const [name, s] of [['L', 1], ['R', -1]]) {
    const thigh = new THREE.Group();
    thigh.position.set(s * 0.14, HIP, 0);
    root.add(thigh);
    add(thigh, new THREE.CylinderGeometry(0.15, 0.17, 0.5, 8), cloth, [0, -0.24, 0]);
    const shin = new THREE.Group();
    shin.position.y = -0.47;
    thigh.add(shin);
    add(shin, new THREE.CylinderGeometry(0.16, 0.2, 0.42, 8), cloth, [0, -0.2, 0]);
    add(shin, new THREE.CylinderGeometry(0.035, 0.03, 0.12, 6), bone, [0, -0.43, 0]);
    add(shin, new THREE.BoxGeometry(0.13, 0.06, 0.3), bone, [0, -0.47, 0.07]);
    rig[`thigh${name}`] = thigh;
    rig[`shin${name}`] = shin;
  }

  // ---------- Bovenlijf: draait om de heupen ----------
  const hips = new THREE.Group();
  hips.position.y = HIP;
  root.add(hips);
  rig.hips = hips;
  add(hips, new THREE.CylinderGeometry(0.22, 0.27, 0.22, 10), cloth, [0, -0.08, 0]);
  add(hips, new THREE.CylinderGeometry(0.25, 0.26, 0.11, 12), trim, [0, 0.04, 0]); // paarse gordel
  for (const [x, z, ry] of [[0, 0.24, 0], [0, -0.24, Math.PI], [0.25, 0, Math.PI / 2], [-0.25, 0, -Math.PI / 2]]) {
    // platen die aan zijn gordel hangen
    add(hips, new THREE.BoxGeometry(0.24, 0.32, 0.04), armor, [x, -0.2, z], [0.12, ry, 0]);
    add(hips, new THREE.BoxGeometry(0.25, 0.03, 0.045), trim, [x * 1.04, -0.35, z * 1.04], [0.12, ry, 0]);
  }
  // Borstharnas met een gat erin: daar zie je zijn ribben en zijn gloeiende ziel
  add(hips, new THREE.BoxGeometry(0.52, 0.54, 0.3), armor, [0, 0.36, 0]);
  add(hips, new THREE.BoxGeometry(0.54, 0.035, 0.32), trim, [0, 0.61, 0]);
  add(hips, new THREE.BoxGeometry(0.54, 0.035, 0.32), trim, [0, 0.11, 0]);
  add(hips, new THREE.BoxGeometry(0.24, 0.3, 0.02), hollow, [0, 0.4, 0.151]);
  add(hips, new THREE.SphereGeometry(0.06, 12, 10), soulMat, [0, 0.4, 0.15]);
  add(hips, new THREE.BoxGeometry(0.025, 0.28, 0.025), bone, [0, 0.4, 0.172]); // borstbeen
  for (let i = 0; i < 3; i++) {
    for (const s of [-1, 1]) add(hips, new THREE.BoxGeometry(0.11, 0.024, 0.024), bone, [s * 0.062, 0.49 - i * 0.085, 0.168], [0, 0, s * 0.3]);
  }
  add(hips, new THREE.CylinderGeometry(0.04, 0.045, 0.14, 6), bone, [0, 0.69, 0]); // nek

  // Schouderplaten en armen van bot (met zwarte polsbeschermers)
  for (const [name, s] of [['L', 1], ['R', -1]]) {
    for (let i = 0; i < 3; i++) {
      add(hips, new THREE.BoxGeometry(0.27, 0.05, 0.32 - i * 0.02), armor, [s * (0.36 + i * 0.045), 0.66 - i * 0.075, 0], [0, 0, -s * (0.3 + i * 0.16)]);
    }
    add(hips, new THREE.BoxGeometry(0.28, 0.02, 0.33), trim, [s * 0.36, 0.69, 0], [0, 0, -s * 0.3]);
    const arm = new THREE.Group();
    arm.position.set(s * 0.36, 0.57, 0);
    hips.add(arm);
    add(arm, new THREE.CylinderGeometry(0.04, 0.034, 0.3, 6), bone, [0, -0.15, 0]);
    add(arm, new THREE.SphereGeometry(0.05, 8, 6), bone, [0, -0.31, 0]);
    add(arm, new THREE.CylinderGeometry(0.066, 0.055, 0.26, 8), armor, [0, -0.46, 0]);
    add(arm, new THREE.CylinderGeometry(0.07, 0.07, 0.03, 8), trim, [0, -0.35, 0]);
    add(arm, new THREE.BoxGeometry(0.08, 0.1, 0.05), bone, [0, -0.64, 0]); // hand
    rig[`arm${name}`] = arm;
  }
  rig.handR = new THREE.Group(); // hier zit de katana
  rig.handR.position.y = -0.64;
  rig.armR.add(rig.handR);
  rig.handL = new THREE.Group(); // hier komt zijn magie uit
  rig.handL.position.y = -0.7;
  rig.armL.add(rig.handL);

  // ---------- Hoofd: een schedel met gloeiende ogen, een kaak die open kan en een helm met hoorns ----------
  const head = new THREE.Group();
  head.position.y = 0.78;
  hips.add(head);
  rig.head = head;
  add(head, new THREE.SphereGeometry(0.15, 16, 12), bone, [0, 0.1, 0], [0, 0, 0], [1, 1.12, 1.08]);
  add(head, new THREE.BoxGeometry(0.17, 0.08, 0.15), bone, [0, -0.02, 0.035]);
  add(head, new THREE.BoxGeometry(0.12, 0.022, 0.02), bone, [0, -0.062, 0.11]); // boventanden
  add(head, new THREE.ConeGeometry(0.022, 0.05, 4), hollow, [0, 0.025, 0.157]); // neusgat
  for (const s of [-1, 1]) {
    add(head, new THREE.SphereGeometry(0.05, 10, 8), hollow, [s * 0.062, 0.09, 0.122]);
    add(head, new THREE.SphereGeometry(0.03, 10, 8), eyeMat, [s * 0.062, 0.09, 0.148]);
  }
  const jaw = new THREE.Group();
  jaw.position.set(0, -0.05, -0.02);
  head.add(jaw);
  rig.jaw = jaw;
  add(jaw, new THREE.BoxGeometry(0.15, 0.045, 0.15), bone, [0, -0.04, 0.065]);
  add(jaw, new THREE.BoxGeometry(0.11, 0.02, 0.02), bone, [0, -0.012, 0.135]);
  // Kabuto (samoerai-helm): een koepel, een klep, nekplaten en een halve maan van goud
  add(head, new THREE.SphereGeometry(0.178, 16, 10, 0, Math.PI * 2, 0, Math.PI * 0.5), armor, [0, 0.17, 0], [0, 0, 0], [1, 1.05, 1.08]);
  add(head, new THREE.BoxGeometry(0.3, 0.02, 0.09), armor, [0, 0.19, 0.17], [-0.25, 0, 0]);
  add(head, new THREE.CylinderGeometry(0.2, 0.27, 0.15, 12, 1, true, Math.PI - 1.9, 3.8), armor, [0, 0.07, 0]);
  add(head, new THREE.CylinderGeometry(0.25, 0.32, 0.13, 12, 1, true, Math.PI - 1.8, 3.6), armor, [0, -0.03, 0]);
  add(head, new THREE.TorusGeometry(0.2, 0.017, 6, 20, Math.PI * 1.15), gold, [0, 0.47, 0.15], [0, 0, Math.PI * 0.925]);
  add(head, new THREE.SphereGeometry(0.03, 8, 8), soulMat, [0, 0.275, 0.185]);

  // ---------- Cape: gescheurde stroken stof die wapperen ----------
  rig.capes = [];
  for (let i = -2; i <= 2; i++) {
    const strip = new THREE.Group();
    strip.position.set(i * 0.105, 0.62, -0.17);
    strip.rotation.y = i * 0.1;
    hips.add(strip);
    const length = 1.05 - Math.abs(i) * 0.1 - (i === 1 ? 0.12 : 0);
    add(strip, new THREE.PlaneGeometry(0.12, length), cloth, [0, -length / 2, 0]);
    rig.capes.push(strip);
  }

  root.traverse((c) => {
    if (c.isMesh) c.userData.noAO = true;
  });
  return { root, rig, eyeMat, soulMat, trim, materials: [armor, cloth, bone, gold, trim] };
}

// Botstekels en de streep van de Schaduwsnede delen hun vorm (anders lekt er geheugen weg)
const SPIKE_GEO = new THREE.ConeGeometry(0.2, 1.6, 5).translate(0, 0.8, 0);
const SPIKE_MAT = new THREE.MeshStandardMaterial({ color: 0xe6dfc8, roughness: 0.6 });
const STREAK_GEO = new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2);

export class RamesFighter extends Boss {
  constructor(scene, arena) {
    super(scene, arena, 'rames');
    this.type = { name: this.name, radius: 0.9, height: 1.9 * RAMES.size, color: PURPLE, damage: 18, stompable: false };
    this.layout = graveyardLayout(arena);
    const built = buildRames();
    this.rig = built.rig;
    this.eyeMat = built.eyeMat;
    this.soulMat = built.soulMat;
    this.trimMat = built.trim;
    this.model = built.root;
    this.model.scale.setScalar(RAMES.size);
    this.mesh.add(this.model);
    this.rememberMaterials(built.materials);

    // De Schaduwkatana in zijn hand, en dezelfde katana in de grond naast zijn troon (voor het filmpje)
    this.grip = new THREE.Group();
    this.grip.rotation.x = Math.PI / 2;
    this.grip.scale.setScalar(1.15);
    this.grip.add(createWeaponMesh('schaduwkatana'));
    this.rig.handR.add(this.grip);
    this.planted = new THREE.Group();
    this.planted.add(createWeaponMesh('schaduwkatana', RAMES.size * 1.15));
    this.planted.rotation.set(Math.PI, 0, 0.1); // de punt in de grond
    this.planted.traverse((c) => (c.userData.noAO = true));
    scene.add(this.planted);
    this.trail = new SwordTrail(scene);

    // Een bol duistere magie in zijn linkerhand (groeit als hij gaat toveren)
    this.orb = new THREE.Mesh(new THREE.SphereGeometry(0.16, 14, 10), new THREE.MeshBasicMaterial({ color: PURPLE, transparent: true, opacity: 0.85, toneMapped: false }));
    this.orb.visible = false;
    this.rig.handL.add(this.orb);

    this.bubble = makeBubble();
    this.bubble.position.y = this.type.height + 1.25;
    this.mesh.add(this.bubble);
    // Zijn magie geeft licht (dit lampje is er altijd, dan hoeft de computer nooit opnieuw shaders te maken)
    this.light = new THREE.PointLight(PURPLE, 0, 30, 1.5);
    scene.add(this.light);

    this.pose = { ...REST };
    this.spikes = []; // botstekels die uit de grond steken
    this.streaks = []; // gloeiende strepen na een Schaduwsnede
    this.resetFight();
  }

  /** 0 = het begin, 1 = onder de helft van zijn leven, 2 = herrezen uit de dood. */
  get stage() {
    return this.reborn ? 2 : this.phase2 ? 1 : 0;
  }

  resetFight() {
    super.resetFight();
    this.name = this.info.name;
    this.reborn = false; // is hij al een keer uit de dood opgestaan?
    this.down = false; // neergevallen (nep-dood): rames.js laat hem weer opstaan
    this.ending = false; // echt verslagen: rames.js speelt zijn laatste filmpje
    this.wants = null; // een filmpje dat rames.js moet starten ('bullys')
    this.ghost = 0; // > 0: even niet te raken (hij is weg, of flitst voorbij)
    this.marks = [...RAMES.bullys.at]; // bij zoveel leven roept hij nog bullys
    this.bullys = [];
    this.bullyTimer = 0;
    this.stormCd = 6;
    this.lastAttack = null;
    this.hitThisAttack = false;
    this.sayCd = 0;
    if (!this.rig) return; // (de eerste keer, vanuit Boss: dan bestaat zijn model nog niet)
    this.clearMagic();
    this.trail.cut();
    this.mesh.scale.setScalar(1);
    this.setLook(false);
    this.sitDown();
  }

  // ---------- Hoe hij eruitziet ----------

  /** Paars (het begin) of groen (herrezen): ogen, ziel, katana, licht en mistmuur. */
  setLook(reborn) {
    const color = reborn ? GREEN : PURPLE;
    this.look = color;
    this.type.color = color;
    this.eyeMat.emissive.set(color);
    this.soulMat.emissive.set(color);
    this.orb.material.color.set(color);
    this.trail.setColor(color);
    this.light.color.set(color);
    this.fog.material.uniforms.tint.value.set(color);
    this.trimMat.color.set(reborn ? 0x3fd06a : 0x6a3fd0);
    for (const entry of this.materials) if (entry.m === this.trimMat) entry.color.set(reborn ? 0x1f7a35 : 0x3a1a8a);
    for (const holder of [this.grip, this.planted]) {
      holder.traverse((c) => {
        if (c.isMesh && c.material.name === 'Metal') c.material.emissive.set(reborn ? 0x35ff6a : 0x8a3dff);
      });
    }
  }

  /** Terug op zijn troon: hij lijkt dood, met zijn katana in de grond naast hem. */
  sitDown() {
    const L = this.layout;
    this.mode = 'troon'; // 'troon' = wacht op zijn troon · 'film' = rames.js bestuurt hem · 'gevecht'
    this.act = null;
    this.laugh = 0;
    this.position.copy(L.throne).addScaledVector(L.forward, 0.12);
    this.mesh.rotation.set(0, L.yaw, 0);
    this.mesh.visible = !this.dead;
    Object.assign(this.pose, REST, POSES.zit);
    this.eyeGlow = this.eyeGoal = 0;
    this.orbSize = 0;
    this.lightFlash = 0;
    this.capeLift = 0;
    this.stride = 0;
    this.planted.position.copy(L.throne).addScaledVector(L.forward, 1.75).addScaledVector(L.side, -1.5).setY(1.72);
    this.planted.visible = !this.dead;
    this.grip.visible = false;
    this.bubble.visible = false;
    this.bubbleTimer = 0;
    this.applyPose(0);
  }

  /** De katana uit de grond in zijn hand. */
  takeKatana() {
    this.planted.visible = false;
    this.grip.visible = true;
  }

  /** Staand voor zijn troon, klaar om te vechten (rames.js, als het filmpje wordt overgeslagen). */
  standReady() {
    const L = this.layout;
    this.mode = 'film';
    this.position.copy(L.throne).addScaledVector(L.forward, 2.6);
    this.mesh.rotation.set(0, L.yaw, 0);
    Object.assign(this.pose, REST, POSES.klaar);
    this.act = POSES.klaar;
    this.laugh = 0;
    this.eyeGlow = this.eyeGoal = 1;
    this.takeKatana();
    this.applyPose(0);
  }

  wake() {
    super.wake();
    this.fight();
  }

  /** (Weer) gaan vechten, na een filmpje. */
  fight() {
    this.mode = 'gevecht';
    this.state = 'walk';
    this.cooldown = 1.1;
    this.act = null;
    this.laugh = 0;
    this.down = false;
    this.wants = null;
    this.eyeGoal = 1;
    this.orbSize = 0;
    this.position.y = 0;
    this.mesh.visible = true;
    this.takeKatana();
  }

  /** Hij staat op uit de dood: groen, sneller, en met nieuwe trucs (rames.js vult zijn leven weer aan). */
  rise() {
    this.reborn = true;
    this.phase2 = true;
    this.name = 'Rames de Herrezene';
    this.marks = [...RAMES.bullys.reborn];
    this.bullyTimer = 0;
    this.stormCd = 7;
    this.setLook(true);
    this.lightFlash = 1;
  }

  /** Een houding uit POSES aannemen (in een filmpje). laugh = hoe hard hij schudt van het lachen (0 = niet). */
  perform(name, speed = 5, laugh = 0) {
    this.act = POSES[name];
    this.actSpeed = speed;
    this.laugh = laugh;
  }

  /** Houding soepel richting een doel bewegen; alles wat er niet in staat gaat terug naar REST. */
  blendPose(target, speed, dt) {
    const k = Math.min(1, speed * dt);
    for (const key of Object.keys(REST)) this.pose[key] += ((target[key] ?? REST[key]) - this.pose[key]) * k;
  }

  /** De houding op het model zetten. walk = hoe hard hij loopt (0 - 1). */
  applyPose(walk = 0) {
    const p = this.pose;
    const r = this.rig;
    const swing = Math.sin(this.stride) * walk;
    const shake = this.laugh > 0 ? Math.sin((this.time ?? 0) * 24) * this.laugh : 0; // schudden van het lachen
    this.model.position.y = (p.y + p.float + Math.abs(swing) * 0.03 + shake * 0.012) * RAMES.size;
    this.model.rotation.x = p.fall;
    r.hips.rotation.set(p.lean + shake * 0.04, p.twist, p.roll);
    r.thighL.rotation.x = p.thighL + swing * 0.6;
    r.thighR.rotation.x = p.thighR - swing * 0.6;
    r.shinL.rotation.x = p.shinL + Math.max(0, swing) * 0.7;
    r.shinR.rotation.x = p.shinR + Math.max(0, -swing) * 0.7;
    r.armR.rotation.set(p.armRx, 0, p.armRz);
    r.handR.rotation.x = p.wrist;
    r.armL.rotation.set(p.armLx - swing * 0.35, 0, p.armLz);
    r.head.rotation.set(p.headX, p.headY, 0);
    r.jaw.rotation.x = p.jaw + Math.max(0, shake) * 0.45;
  }

  /** Alles wat altijd beweegt: cape, gloeiende ogen, zijn licht, magie-deeltjes, tekstwolkje, stekels. */
  animateExtras(dt, effects) {
    const t = this.time ?? 0;
    this.capeLift += ((this.moving ? 0.5 : 0) - this.capeLift) * Math.min(1, 5 * dt);
    this.rig.capes.forEach((strip, i) => {
      strip.rotation.x = 0.1 + this.capeLift + Math.sin(t * 2.3 + i * 0.9) * (0.06 + this.capeLift * 0.15);
    });
    this.eyeGlow += (this.eyeGoal - this.eyeGlow) * Math.min(1, 6 * dt);
    this.eyeMat.emissiveIntensity = this.eyeGlow * (5 + Math.sin(t * 11) * 0.8);
    this.soulMat.emissiveIntensity = this.eyeGlow * (3 + Math.sin(t * 3) * 1.2);
    this.lightFlash = Math.max(0, this.lightFlash - dt * 2.2);
    this.light.position.set(this.position.x, 4.2, this.position.z);
    this.light.intensity = 3 + this.eyeGlow * 14 + this.lightFlash * 130;
    this.orb.visible = this.orbSize > 0.03;
    this.orb.scale.setScalar(Math.max(0.03, this.orbSize) * (1 + Math.sin(t * 30) * 0.08));
    this.sayCd = Math.max(0, this.sayCd - dt);
    if (this.bubbleTimer > 0) {
      this.bubbleTimer -= dt;
      if (this.bubbleTimer <= 0) this.bubble.visible = false;
    }
    // Zieltjes die om hem heen opstijgen (als zijn ogen branden)
    if (effects && dt > 0 && this.eyeGlow > 0.5 && this.mesh.visible) {
      this.auraT = (this.auraT ?? 0) - dt;
      if (this.auraT <= 0) {
        this.auraT = 0.1;
        const a = Math.random() * Math.PI * 2;
        tmp.set(this.position.x + Math.sin(a) * 0.9, this.position.y + 0.2 + Math.random() * 1.2, this.position.z + Math.cos(a) * 0.9);
        effects.burst(tmp, this.look, { count: 1, speed: 0.4, size: 0.1, life: 0.9, up: 1.8, gravity: -0.12 });
      }
    }
    this.updateMagic(dt);
  }

  // ---------- Praten ----------

  /** Iets roepen in zijn tekstwolkje. Niet te vaak (behalve als het belangrijk is). */
  say(text, seconds = 2.2, force = false) {
    if (!force && this.sayCd > 0) return;
    this.bubble.userData.draw(text);
    this.bubble.visible = true;
    this.bubbleTimer = seconds;
    this.sayCd = seconds + 2;
  }

  bark(kind, chance = 1) {
    if (Math.random() < chance) this.say(pick(BARKS[kind]));
  }

  // ---------- De filmpjes (rames.js) ----------

  /** Het spel staat stil door een filmpje: dan laat rames.js hem hiermee bewegen. */
  cutsceneTick(dt, effects) {
    this.time = (this.time ?? 0) + dt;
    this.flash = Math.max(0, this.flash - dt);
    if (this.act) this.blendPose(this.act, this.actSpeed ?? 5, dt);
    this.applyPose(0);
    this.trail.update(dt);
    this.animateExtras(dt, effects);
  }

  idleAnimation(dt = 0) {
    if (!this.rig || this.mode !== 'troon') return;
    // Hij zit doodstil op zijn troon... alleen zijn hoofd beweegt een heel klein beetje
    this.pose.headX = POSES.zit.headX + Math.sin((this.time ?? 0) * 0.8) * 0.025;
    this.applyPose(0);
    this.animateExtras(dt, null);
  }

  // ---------- Geraakt worden ----------

  hit(from, swingId, damage) {
    if (this.ghost > 0 || this.down || this.mode !== 'gevecht') return null;
    if (!this.reborn && damage >= this.hp) {
      // Zijn leven is op... maar hij is ondood. Hij valt neer, en rames.js laat hem weer opstaan.
      if (!this.alive || !this.awake || this.recentSwings.includes(swingId)) return null;
      this.recentSwings.push(swingId);
      this.hp = 0;
      this.flash = 0.1;
      this.down = true;
      this.events.length = 0;
      this.clearMagic();
      this.trail.cut();
      return { damage, killed: false };
    }
    const result = super.hit(from, swingId, damage);
    if (result?.killed) {
      this.ending = true;
      this.dying = 0; // niet zomaar verdwijnen: rames.js speelt zijn laatste filmpje
      this.clearMagic();
    } else if (result && this.state !== 'tired') this.bark('au', 0.15);
    return result;
  }

  // ---------- Hulpjes voor zijn aanvallen ----------

  /** Hoeveel echte seconden duurt `t` voor hem? (hij is sneller dan de klok: BOSS_POWER en zijn tempo) */
  real(t, withTempo = true) {
    return t / (BOSS_POWER.speed * (withTempo ? RAMES.tempo[this.stage] : 1));
  }

  /** Een punt binnen de arena houden. */
  clampToArena(point) {
    const max = this.arena.radius - this.type.radius - 0.3;
    const d = flatDist(point, this.arena.center);
    if (d > max) point.sub(this.arena.center).setY(0).multiplyScalar(max / d).add(this.arena.center);
    return point.setY(0);
  }

  bladeSample() {
    this.mesh.updateMatrixWorld(true);
    const [from, to] = WEAPONS.schaduwkatana.blade;
    this.trail.addSample(this.grip.localToWorld(new THREE.Vector3(0, from, 0)), this.grip.localToWorld(new THREE.Vector3(0, to, 0)));
  }

  /** Raakt de katana de speler? (in een boog vóór hem) */
  slashHits(ctx, range, damage) {
    if (this.hitThisAttack) return;
    const toPlayer = ctx.player.position.clone().sub(this.position).setY(0);
    const dist = toPlayer.length();
    const facing = tmp.set(Math.sin(this.mesh.rotation.y), 0, Math.cos(this.mesh.rotation.y));
    if (dist < range && (dist < 1.2 || toPlayer.normalize().dot(facing) > -0.1) && ctx.player.position.y < 2.5) this.strike(ctx, this.position, damage);
  }

  /** De speler pijn doen (één keer per aanval), en er iets over roepen. */
  strike(ctx, from, damage) {
    if (!ctx.hurtPlayer(from, damage)) return false;
    this.hitThisAttack = true;
    this.bark('raak', 0.4);
    return true;
  }

  /** Paarse (of groene) rookwolk: hier verdwijnt of verschijnt hij. */
  poof(effects, at) {
    const p = at.clone().setY(at.y + 1.6);
    effects.burst(p, 0x1c0a2e, { count: 26, speed: 4, size: 0.3, life: 0.6, up: 1, gravity: 0 });
    effects.burst(p, this.look, { count: 14, speed: 6, size: 0.14, life: 0.5, up: 1, gravity: 0 });
  }

  /** Stekels van bot schieten hier uit de grond (alleen om te zien: de schade doet groundImpact). */
  spawnSpikes(at, radius) {
    const group = new THREE.Group();
    group.position.copy(at).setY(0);
    for (let i = 0; i < 7; i++) {
      const spike = new THREE.Mesh(SPIKE_GEO, SPIKE_MAT);
      spike.castShadow = true;
      if (i === 0) spike.scale.set(1.3, 1.5, 1.3);
      else {
        const a = (i / 6) * Math.PI * 2 + Math.random();
        spike.position.set(Math.sin(a) * radius * 0.5, 0, Math.cos(a) * radius * 0.5);
        spike.rotation.set(Math.cos(a) * 0.45, 0, -Math.sin(a) * 0.45); // schuin naar buiten
        spike.scale.setScalar(0.7 + Math.random() * 0.5);
      }
      group.add(spike);
    }
    group.scale.y = 0.01;
    this.scene.add(group);
    this.spikes.push({ group, t: 0 });
  }

  /** Een gloeiende streep over de grond: daar sneed hij net doorheen. */
  addStreak(from, to) {
    const mesh = new THREE.Mesh(STREAK_GEO, new THREE.MeshBasicMaterial({
      color: this.look, transparent: true, opacity: 0.85, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide, toneMapped: false,
    }));
    mesh.position.copy(from).lerp(to, 0.5).setY(0.9);
    mesh.rotation.y = Math.atan2(-(to.z - from.z), to.x - from.x);
    mesh.scale.set(from.distanceTo(to), 1, 0.5);
    mesh.userData.noAO = true;
    this.scene.add(mesh);
    this.streaks.push({ mesh, t: 0 });
  }

  /** Stekels komen op, blijven even staan en zakken weer weg; strepen vervagen. */
  updateMagic(dt) {
    for (let i = this.spikes.length - 1; i >= 0; i--) {
      const s = this.spikes[i];
      s.t += dt;
      s.group.scale.y = Math.max(0.01, Math.min(1, s.t / 0.08) * (1 - THREE.MathUtils.smoothstep(s.t, 0.75, 1.1)));
      if (s.t >= 1.1) {
        this.scene.remove(s.group);
        this.spikes.splice(i, 1);
      }
    }
    for (let i = this.streaks.length - 1; i >= 0; i--) {
      const s = this.streaks[i];
      s.t += dt;
      const k = s.t / 0.45;
      s.mesh.material.opacity = 0.85 * (1 - k);
      s.mesh.scale.z = 0.5 + k * 1.2;
      if (k >= 1) {
        this.scene.remove(s.mesh);
        s.mesh.material.dispose();
        this.streaks.splice(i, 1);
      }
    }
  }

  clearMagic() {
    for (const s of this.spikes) this.scene.remove(s.group);
    for (const s of this.streaks) {
      this.scene.remove(s.mesh);
      s.mesh.material.dispose();
    }
    this.spikes.length = 0;
    this.streaks.length = 0;
    this.orbSize = 0;
  }

  // ---------- Bullys ----------

  /** De bullys die nog leven. */
  aliveBullys() {
    this.bullys = this.bullys.filter((e) => e.alive);
    return this.bullys.length;
  }

  /** Kies n graven waar bullys uit komen (liever niet het graf waar de speler op staat). */
  pickGraves(n, playerPos) {
    const spots = this.layout.graves
      .map((spot) => ({ spot, score: Math.random() + (playerPos && flatDist(spot, playerPos) < 3 ? -2 : 0) }))
      .sort((a, b) => b.score - a.score)
      .map((g) => g.spot);
    return spots.slice(0, Math.max(0, Math.min(n, RAMES.bullys.max - this.aliveBullys())));
  }

  /** Een skelet kruipt hier uit de grond. */
  spawnBully(ctx, spot) {
    if (this.aliveBullys() >= RAMES.bullys.max) return;
    this.bullys.push(ctx.spawnEnemy('skelet', spot.x, spot.z));
    ctx.effects.burst(spot.clone().setY(0.3), 0x3a2f2a, { count: 14, speed: 5, size: 0.2, life: 0.7, up: 3 }); // aarde
    ctx.effects.burst(spot.clone().setY(0.6), GREEN, { count: 16, speed: 4, size: 0.12, life: 0.8, up: 4, gravity: -0.1 });
    ctx.effects.shockwave(spot, GREEN, 1.6);
    play('poef');
  }

  /** Meteen bullys laten opstaan uit deze graven (rames.js, aan het eind van een filmpje). */
  raiseBullys(spots) {
    if (!this.ctx) return;
    for (const spot of spots) this.spawnBully(this.ctx, spot);
    this.bullyTimer = 0;
  }

  /** Moet hij nu bullys roepen? */
  bullysDue() {
    if (this.aliveBullys() >= RAMES.bullys.max) return false;
    if (this.marks.length && this.hp / this.info.hp < this.marks[0]) {
      this.marks.shift();
      return true;
    }
    return this.reborn && this.bullys.length === 0 && this.bullyTimer > RAMES.bullys.again;
  }

  // ---------- Het gevecht ----------

  update(dt, ctx) {
    this.ctx = ctx;
    super.update(dt, ctx);
  }

  onPhase2() {
    this.wants = 'bullys'; // rames.js speelt het filmpje: "BULLYS pak hem"
  }

  /** Welke aanval nu? Hangt af van hoe ver je weg staat (en nooit twee keer dezelfde achter elkaar). */
  choose(dist, st) {
    if (this.bullysDue()) return 'summon';
    if (st === 2 && this.stormCd <= 0) return 'storm';
    let options;
    if (dist < 5) options = [['combo', 5], ['spikes', 2], ['bolts', 1], ['teleport', st ? 1 : 0]];
    else if (dist < 12) options = [['iai', 4], ['bolts', 3], ['spikes', 2], ['combo', 1]];
    else options = [['iai', 4], ['bolts', 3], ['teleport', st ? 3 : 0]];
    options = options.filter(([kind, weight]) => weight > 0 && kind !== this.lastAttack);
    let roll = Math.random() * options.reduce((sum, o) => sum + o[1], 0);
    for (const [kind, weight] of options) {
      roll -= weight;
      if (roll <= 0) return kind;
    }
    return options[0][0];
  }

  startAttack(kind, ctx) {
    const st = this.stage;
    this.lastAttack = kind;
    this.hitThisAttack = false;
    if (kind === 'combo') {
      this.slashes = RAMES.combo.slashes[st];
      this.smash = true;
      this.slashDir = 1;
      this.state = 'slashWindup';
      this.timer = 0.45;
      play('charge');
      this.bark('combo', 0.35);
    } else if (kind === 'iai') {
      this.iaiLeft = RAMES.iai.dashes[st];
      this.aimIai(ctx, true);
      this.bark('iai', 0.4);
    } else if (kind === 'bolts') {
      this.volleys = RAMES.bolts.volleys[st];
      this.state = 'castWindup';
      this.timer = 0.6;
      play('charge');
      this.bark('bolts', 0.35);
    } else if (kind === 'spikes') {
      this.state = 'spikeWindup';
      this.timer = 0.6;
      play('charge');
      this.bark('spikes', 0.4);
    } else if (kind === 'summon') {
      this.state = 'summon';
      this.timer = 1;
      this.rising = this.pickGraves(RAMES.bullys.count[st], ctx.player.position);
      play('charge');
      play('laugh');
      this.say(pick(BARKS.bullys), 2.4, true);
    } else if (kind === 'teleport') {
      this.state = 'vanish';
      this.timer = RAMES.teleport.gone;
      this.ghost = RAMES.teleport.gone + 0.15;
      this.poof(ctx.effects, this.position);
      this.mesh.visible = false;
      play('dash');
    } else if (kind === 'storm') {
      // Zielenstorm: hij verschijnt in het midden en stijgt op
      this.poof(ctx.effects, this.position);
      this.position.copy(this.arena.center).setY(0);
      this.poof(ctx.effects, this.position);
      this.ghost = 0.4;
      this.state = 'stormRise';
      this.timer = 1.2;
      this.lightFlash = 0.5;
      play('whoosh');
      play('charge');
      this.say(pick(BARKS.storm), 2.6, true);
    }
  }

  /** Schaduwsnede: mikken. Rode cirkels laten zien waar hij doorheen gaat flitsen. */
  aimIai(ctx, first) {
    this.state = 'iaiWindup';
    this.timer = first ? RAMES.iai.windup : RAMES.iai.again;
    this.iaiFrom = this.position.clone().setY(0);
    const dir = ctx.player.position.clone().sub(this.position).setY(0);
    if (dir.lengthSq() < 0.01) dir.set(Math.sin(this.mesh.rotation.y), 0, Math.cos(this.mesh.rotation.y));
    const length = Math.min(RAMES.iai.length, dir.length() + RAMES.iai.past);
    dir.normalize();
    this.iaiTo = this.clampToArena(this.iaiFrom.clone().addScaledVector(dir, length));
    const n = Math.max(2, Math.ceil(this.iaiFrom.distanceTo(this.iaiTo) / 3));
    for (let i = 0; i < n; i++) ctx.effects.warnCircle(this.iaiFrom.clone().lerp(this.iaiTo, (i + 0.5) / n), RAMES.iai.width, this.real(this.timer));
    this.mesh.rotation.y = Math.atan2(dir.x, dir.z);
    play('glint');
  }

  /** De dreun aan het eind van zijn combo: schokgolf en stekels. Onder de helft van zijn leven ook een golf van magie. */
  smashImpact(ctx) {
    const st = this.stage;
    this.groundImpact(ctx, this.smashAt, RAMES.combo.smashRadius, RAMES.combo.smash, this.look);
    this.spawnSpikes(this.smashAt, RAMES.combo.smashRadius * 0.6);
    if (st >= 1) {
      const yaw = this.mesh.rotation.y;
      for (const a of [-0.5, 0, 0.5]) {
        const dir = new THREE.Vector3(Math.sin(yaw + a), 0, Math.cos(yaw + a));
        ctx.projectiles.spawn({ from: this.smashAt.clone().setY(1), dir, speed: 12, damage: RAMES.bolts.damage, kind: 'dark', color: this.look, radius: 0.45, life: 1.6 });
      }
    }
    this.state = 'recover';
    this.timer = RAMES.recover[st];
  }

  /** Een waaier van duistere magie uit zijn linkerhand. */
  fireBolts(ctx) {
    const n = RAMES.bolts.count[this.stage];
    this.mesh.updateMatrixWorld(true);
    const from = this.orb.getWorldPosition(new THREE.Vector3());
    const p = ctx.player;
    const aim = p.position.clone().add(p.velocity.clone().setY(0).multiplyScalar(0.3)).setY(p.position.y + 0.9).sub(from);
    for (let i = 0; i < n; i++) {
      const a = (i - (n - 1) / 2) * 0.2;
      const dir = new THREE.Vector3(aim.x * Math.cos(a) - aim.z * Math.sin(a), aim.y, aim.x * Math.sin(a) + aim.z * Math.cos(a));
      ctx.projectiles.spawn({ from, dir, speed: RAMES.bolts.speed, damage: RAMES.bolts.damage, kind: 'dark', color: this.look, radius: 0.45 });
    }
    this.orbSize = 0;
    this.lightFlash = 0.25;
    play('laser');
  }

  /** Stekels van bot onder de speler: eerst een rode cirkel, dan BOEM. */
  callSpike(ctx) {
    const p = ctx.player;
    const at = this.clampToArena(p.position.clone().add(p.velocity.clone().setY(0).multiplyScalar(0.25)));
    ctx.effects.warnCircle(at, RAMES.spikes.radius, this.real(RAMES.spikes.delay, false));
    this.schedule(RAMES.spikes.delay, () => {
      this.groundImpact(ctx, at, RAMES.spikes.radius, RAMES.spikes.damage, this.look);
      this.spawnSpikes(at, RAMES.spikes.radius);
    });
  }

  /** Na de Schaduwstap: poef, hij staat achter je en haalt meteen uit. */
  appearBehind(ctx) {
    const p = ctx.player;
    this.position.copy(this.clampToArena(p.position.clone().addScaledVector(p.facing, -RAMES.teleport.behind)));
    this.mesh.visible = true;
    this.mesh.rotation.y = angleTo(this.position, p.position);
    this.poof(ctx.effects, this.position);
    play('glint');
    this.slashes = 1;
    this.smash = false;
    this.slashDir = 1;
    this.state = 'slashWindup';
    this.timer = RAMES.teleport.windup;
    this.say(pick(BARKS.teleport), 1.6);
  }

  think(dt, ctx) {
    const st = this.stage;
    const tempo = RAMES.tempo[st];
    const player = ctx.player.position;
    const dist = flatDist(this.position, player);
    this.timer -= dt * tempo;
    this.stormCd -= dt;
    this.bullyTimer += dt;
    this.ghost = Math.max(0, this.ghost - dt);
    this.trail.update(dt);
    let walk = 0;

    switch (this.state) {
      case 'idle':
      case 'walk': {
        this.state = 'walk';
        turnTowards(this.mesh, angleTo(this.position, player), 6, dt);
        this.blendPose(POSES.klaar, 8, dt);
        if (dist > 3.2) {
          tmp.copy(player).sub(this.position).setY(0).normalize();
          this.position.addScaledVector(tmp, RAMES.speed[st] * dt);
          walk = 1;
        }
        this.cooldown -= dt * tempo;
        if (this.cooldown <= 0) this.startAttack(this.choose(dist, st), ctx);
        else if (st === 2) this.bark('herrezen', dt * 0.12);
        break;
      }

      // ----- Katana-combo: slag, slag... en een dreun op de grond -----
      case 'slashWindup': {
        turnTowards(this.mesh, angleTo(this.position, player), 7, dt);
        const s = this.slashDir;
        this.blendPose({ lean: 0.12, twist: s > 0 ? -0.7 : 0.6, armRx: -1.4, armRz: s > 0 ? -1.7 : 1.1, wrist: 1.15, armLx: -0.4, armLz: 0.5, thighL: -0.25, thighR: 0.2 }, 12, dt);
        if (this.timer <= 0) {
          this.state = 'slash';
          this.timer = 0.2;
          this.hitThisAttack = false;
          this.trail.cut();
          play('heavySwing');
          if (dist > 2.2) {
            tmp.set(Math.sin(this.mesh.rotation.y), 0, Math.cos(this.mesh.rotation.y));
            this.position.addScaledVector(tmp, 1.5); // stap naar voren
          }
        }
        break;
      }
      case 'slash': {
        const s = this.slashDir;
        this.blendPose({ lean: 0.2, twist: s > 0 ? 0.6 : -0.7, armRx: -1.4, armRz: s > 0 ? 1.1 : -1.7, wrist: 1.25, armLx: -0.2, armLz: 0.6, thighL: -0.35, thighR: 0.3 }, 24, dt);
        this.bladeSample();
        this.slashHits(ctx, RAMES.combo.range, RAMES.combo.damage);
        if (this.timer <= 0) {
          this.slashes--;
          if (this.slashes > 0) {
            this.slashDir = -this.slashDir;
            this.state = 'slashWindup';
            this.timer = 0.26;
          } else if (this.smash) {
            this.state = 'smashWindup';
            this.timer = 0.5;
            tmp.set(Math.sin(this.mesh.rotation.y), 0, Math.cos(this.mesh.rotation.y));
            this.smashAt = this.clampToArena(this.position.clone().addScaledVector(tmp, 2.6));
            ctx.effects.warnCircle(this.smashAt, RAMES.combo.smashRadius, this.real(this.timer));
            play('charge');
          } else {
            this.state = 'recover';
            this.timer = RAMES.recover[st];
          }
        }
        break;
      }
      case 'smashWindup': {
        this.blendPose({ lean: -0.2, headX: -0.2, armRx: -2.9, armRz: 0.1, wrist: 0.5, armLx: -2.7, armLz: -0.15 }, 12, dt);
        if (this.timer <= 0) {
          Object.assign(this.pose, { lean: 0.5, armRx: -0.6, armLx: -0.6, wrist: 1.3 });
          this.smashImpact(ctx);
        }
        break;
      }

      // ----- Schaduwsnede: in elkaar duiken... en dwars door je heen flitsen -----
      case 'iaiWindup': {
        this.blendPose({ y: -0.12, lean: 0.4, twist: 0.75, headX: -0.2, armRx: -0.5, armRz: 1.0, wrist: 0.2, armLx: -0.4, armLz: -0.3, thighL: -0.6, shinL: 0.8, thighR: 0.35, shinR: 0.5 }, 10, dt);
        if (this.timer <= 0) {
          this.state = 'iaiDash';
          this.dashK = 0;
          this.hitThisAttack = false;
          this.ghost = 0.2;
          this.trail.cut();
          play('dash');
          play('heavySwing');
        }
        break;
      }
      case 'iaiDash': {
        const before = this.position.clone();
        this.dashK = Math.min(1, this.dashK + dt / 0.15);
        this.position.lerpVectors(this.iaiFrom, this.iaiTo, this.dashK);
        this.blendPose({ lean: 0.35, twist: -0.7, armRx: -1.5, armRz: -1.5, wrist: 1.3, thighL: -0.5, thighR: 0.5 }, 30, dt);
        this.bladeSample();
        ctx.effects.burst(this.center, this.look, { count: 3, speed: 2, size: 0.16, life: 0.35, up: 0, gravity: 0 });
        if (!this.hitThisAttack && player.y < 2.2 && distToLine(player, before, this.position) < RAMES.iai.width + 0.3) this.strike(ctx, before, RAMES.iai.damage);
        walk = 1;
        if (this.dashK >= 1) {
          const from = this.iaiFrom.clone();
          const to = this.iaiTo.clone();
          this.addStreak(from, to);
          // Even later "snijdt" de lucht pas open (zoals in een anime)
          this.schedule(0.2, () => {
            for (let i = 0; i <= 6; i++) ctx.effects.burst(from.clone().lerp(to, i / 6).setY(1), this.look, { count: 6, speed: 5, size: 0.1, life: 0.4, up: 1, gravity: 0.2 });
            ctx.effects.shake(0.2);
            play('hit');
          });
          this.state = 'iaiHold';
          this.timer = 0.32;
        }
        break;
      }
      case 'iaiHold': {
        this.blendPose({ lean: 0.3, twist: -0.6, armRx: -1.4, armRz: -1.4, wrist: 1.3, thighL: -0.5, shinL: 0.5, thighR: 0.4 }, 10, dt);
        if (this.timer <= 0) {
          this.iaiLeft--;
          if (this.iaiLeft > 0) this.aimIai(ctx, false);
          else {
            this.state = 'recover';
            this.timer = RAMES.recover[st];
          }
        }
        break;
      }

      // ----- Duistere magie: een bol groeit in zijn linkerhand, en dan een waaier van ballen -----
      case 'castWindup': {
        turnTowards(this.mesh, angleTo(this.position, player), 6, dt);
        this.blendPose({ lean: -0.05, twist: -0.3, headX: -0.1, armLx: -1.6, armLz: 0.15, armRx: -0.2, armRz: -0.5, wrist: 0.3 }, 10, dt);
        this.orbSize = Math.min(1, this.orbSize + dt * tempo * 2.2);
        if (this.timer <= 0) {
          this.fireBolts(ctx);
          this.volleys--;
          if (this.volleys > 0) this.timer = 0.55;
          else {
            this.state = 'recover';
            this.timer = RAMES.recover[st] * 0.7;
          }
        }
        break;
      }

      // ----- Botstekels: katana in de grond, en onder jouw voeten schieten stekels omhoog -----
      case 'spikeWindup': {
        turnTowards(this.mesh, angleTo(this.position, player), 5, dt);
        this.blendPose({ lean: -0.1, armRx: -2.7, armRz: 0.25, wrist: 1.5, armLx: -2.6, armLz: -0.2 }, 10, dt);
        if (this.timer <= 0) {
          this.state = 'spikeChannel';
          this.spikesLeft = RAMES.spikes.count[st];
          this.spikeT = 0;
          this.timer = this.spikesLeft * RAMES.spikes.every + 0.5;
          play('slam');
          ctx.effects.shockwave(this.position, this.look, 2.6);
          ctx.effects.shake(0.25);
        }
        break;
      }
      case 'spikeChannel': {
        this.blendPose(POSES.planten, 14, dt);
        this.spikeT -= dt * tempo;
        if (this.spikesLeft > 0 && this.spikeT <= 0) {
          this.spikeT = RAMES.spikes.every;
          this.spikesLeft--;
          this.callSpike(ctx);
        }
        if (this.timer <= 0) {
          this.state = 'recover';
          this.timer = RAMES.recover[st] * 0.5;
        }
        break;
      }

      // ----- Bullys: groen vuur boven de graven... en daar komen ze -----
      case 'summon': {
        turnTowards(this.mesh, angleTo(this.position, player), 4, dt);
        this.blendPose(POSES.roepen, 10, dt);
        for (const spot of this.rising) {
          if (Math.random() < 0.5) ctx.effects.burst(spot.clone().setY(0.2), GREEN, { count: 2, speed: 2, size: 0.14, life: 0.6, up: 4, gravity: -0.1 });
        }
        if (this.timer <= 0) {
          for (const spot of this.rising) this.spawnBully(ctx, spot);
          this.bullyTimer = 0;
          this.state = 'recover';
          this.timer = RAMES.recover[st] * 0.5;
        }
        break;
      }

      // ----- Schaduwstap: weg... en achter je weer terug -----
      case 'vanish': {
        if (this.timer <= 0) this.appearBehind(ctx);
        break;
      }

      // ----- Zielenstorm (alleen herrezen): zweven in het midden en een draaiende spiraal van magie -----
      case 'stormRise': {
        this.blendPose(POSES.zweven, 6, dt);
        this.orbSize = Math.min(1.6, this.orbSize + dt * 2);
        if (this.timer <= 0) {
          this.state = 'storm';
          this.timer = RAMES.storm.time;
          this.shotT = 0;
          this.stormAngle = Math.random() * Math.PI * 2;
          this.stormDir = Math.random() < 0.5 ? 1 : -1;
          this.lightFlash = 0.6;
          play('gong');
        }
        break;
      }
      case 'storm': {
        const S = RAMES.storm;
        this.blendPose(POSES.zweven, 6, dt);
        this.mesh.rotation.y += dt * 2.4 * this.stormDir;
        this.shotT -= dt * tempo;
        while (this.shotT <= 0) {
          this.shotT += S.every;
          this.stormAngle += S.turn * this.stormDir;
          for (let k = 0; k < S.arms; k++) {
            const a = this.stormAngle + (k / S.arms) * Math.PI * 2;
            const dir = new THREE.Vector3(Math.sin(a), 0, Math.cos(a));
            ctx.projectiles.spawn({ from: this.position.clone().setY(1).addScaledVector(dir, 1.2), dir, speed: S.speed, damage: S.damage, kind: 'dark', color: this.look, radius: 0.4, life: 2.6 });
          }
          play('swing');
        }
        if (this.timer <= 0) {
          // Uitgeput: hij zakt op één knie. Dit is je grote kans!
          this.state = 'tired';
          this.timer = S.tired;
          this.stormCd = S.cooldown;
          this.orbSize = 0;
          this.say(pick(BARKS.moe), 2.6, true);
        }
        break;
      }
      case 'tired': {
        this.blendPose(POSES.knielen, 5, dt);
        if (Math.random() < 0.3) ctx.effects.burst(this.position.clone().setY(this.type.height * 0.8), 0xffe066, { count: 1, speed: 1, size: 0.14, life: 0.5, up: 0.5, gravity: 0 });
        if (this.timer <= 0) {
          this.state = 'walk';
          this.cooldown = 0.5;
        }
        break;
      }

      case 'recover': {
        // Even op adem komen: nu kun jij slaan!
        this.blendPose({ lean: 0.32, headX: 0.25, armRx: -0.5, armRz: 0, wrist: 1.2, armLx: 0, armLz: 0.2, thighL: -0.15, thighR: 0.1 }, 7, dt);
        if (this.timer <= 0) {
          this.state = 'walk';
          this.cooldown = RAMES.rest[st];
        }
        break;
      }
    }

    this.moving = walk > 0;
    this.stride += dt * 8.5 * walk;
    this.applyPose(this.state === 'iaiDash' ? 0 : walk);
    this.animateExtras(dt, ctx.effects);
  }
}

BOSS_CLASSES.rames = RamesFighter;
