import * as THREE from 'three';
import { BOSS_CLASSES } from './bosses.js';
import { OmarFighter, OmarStats, OMAR, pick, LEAP_END } from './omarFighter.js';
import { makeBolt, makeBoltBetween, LightningTrail } from './lightning.js';
import { applyStormSkin } from './skyLook.js';
import { dressHaori } from './haori.js';
import { toon, outlineMaterial } from './nightwalkerModel.js';
import { play, duckMusic, loadSounds } from './audio.js';
import { SKY_BOSS as B } from './skyConfig.js';

// Sky: "SKY, THUNDERBORN DEVIL OF THE SEVERED HEAVENS". Hij woont in het Wolkenrijk (skyworld.js)
// op een troon van wolken. Hij heeft het lijf van een Omar-vechter (omarFighter.js: dezelfde pop, het filmpje,
// praten, uitlachen, verslagen op de grond), maar een heel eigen brein:
//
// Doodstil... en dan opeens bliksemsnel. Meestal staat hij stil met zijn hand op NightWalker (in de schede).
// Elke aanval gaat zo:
//   stil (idle) → kiezen → laten zien wat hij gaat doen (telegraph) → aanval → uitblazen (recovery: NU slaan!) → stil
// En verder: wankelen (stagger, als je hem vaak raakt terwijl hij stilstaat), fase 2 en verslagen.
//
// De vier aanvallen:
//  1. Thunderclap and Flash: door de knieën, hand op het zwaard... en in één flits staat hij achter je.
//  2. Chain Lightning: hetzelfde, maar 3 flitsen achter elkaar (fase 2: 6), elke keer opnieuw gemikt.
//  3. Heaven's Fall: hij springt uit beeld, de bliksem slaat in in gloeiende cirkels, en hij landt met een schokgolf.
//  4. Storm Crescent: een brede slag die bliksemsikkels in een waaier wegschiet (fase 2: twee slagen).
//
// Alle getallen staan in skyConfig.js. Het filmpje en het gevecht eromheen (aankomen, winnen, verliezen) regelt sky.js.

// ---------- Wat er anders is dan bij Omar (de rest staat in skyConfig.js) ----------
export const SKY = {
  ...OMAR,
  level: 40,
  size: 1.1,
  hp: B.maxHealth,
  speed: [1.75, 1.95],
  damagePct: B.damage,
  phase2Damage: B.phase2Damage,
  talk: B.talk,
  moves: { bliksem: false, schaduwen: false, vuur: false },
  colors: {
    main: 0xffd23a, // geel als de bliksem
    light: 0xfff3b0,
    glow: 0xffe066,
    spark: 0xfff0a0,
    dark: 0x3a4458, // donkergrijs als een onweerswolk
    text: '#ffe680',
    fog: 'vec3(0.75, 0.85, 1.0)', // een wolkenmuur (blauwwit)
    phase2: 0xffffff, // fase 2: zijn aders worden wit-heet
    bolt: 'geel',
  },
  // Wolken-aura: grote zachte wolkjes (donker en dreigend in fase 2)
  aura: { colors: [0xe8eef8, 0xb8c4d8, 0x8a96aa], boos: [0x5a6478, 0x3a4458, 0xd8e0f0], size: [0.75, 0.9], every: [0.07, 0.045], life: 1.1, puff: true },
  swingSound: 'zap',
};

const TAUNTS = {
  uitdagen: ['...'],
  raak: ['Te traag.', 'Eén flits.', 'Zag je dat?', 'Kzzzt.'],
  mis: ['Mis.'],
  au: ['Hm. Niet slecht.', 'Dat voelde ik.', 'Oké. Je bent snel.'],
  praten: ['...', 'Stil maar.', 'Hoor je dat gerommel? Dat ben ik.', 'Eén flits is genoeg.', 'Kijk goed. Of niet.', 'De storm wacht.'],
  boos: ['De hemel scheurt open.', 'Voel de storm.', 'Nu ben ik wakker.'],
  start: ['Eén flits is genoeg.'],
  drankjeWeg: ['...'],
  verslagen: ['Oef... sterretjes... en wolkjes...'],
  loslaten: ['...'],
  nietDrinken: ['...'],
  slokje: ['...'],
  bijnaDood: ['Wie heeft deze speler gemaakt?!'],
  genade: ['...'],
  nogEens: ['Nog een keer.'],
  vuur: [],
  bliksem: [],
  schaduwen: [],
  teleport: [],
  winnen: ['De storm wint altijd.'],
  fase2: ['Genoeg gespeeld.'],
  geheeld: ['...'],
  hemelval: ['Kijk omhoog.', 'De hemel valt.'],
  sikkel: ['Storm!', 'Snijd.'],
  wankelen: ['Wat...?!', 'Ugh!'],
};

const tmp = new THREE.Vector3();
const UP = new THREE.Vector3(0, 1, 0);
const flatDist = (a, b) => Math.hypot(a.x - b.x, a.z - b.z);
const rand = ([a, b]) => a + Math.random() * (b - a);
const randInt = ([a, b]) => a + Math.floor(Math.random() * (b - a + 1));
const smooth = (t) => {
  const k = THREE.MathUtils.clamp(t, 0, 1);
  return k * k * (3 - 2 * k);
};
// Wolkenkleuren: wit, lichtgrijs en blauwgrijs
const CLOUD = [0xf4f7fc, 0xd8e0ec, 0xb4c0d4];
// Toestanden waarin hij onzichtbaar is (flitsen, of hoog in de lucht): dan kun je hem niet raken
const HIDDEN = ['flits', 'hemel', 'wachtLanding'];
// Toestanden waarin hij kan wankelen als je hem vaak genoeg raakt
const CAN_STAGGER = ['stil', 'herstel'];

/** Hoe ver ligt punt p van het lijnstuk a-b (over de grond)? */
function distToSegment(p, a, b) {
  const abx = b.x - a.x;
  const abz = b.z - a.z;
  const len2 = abx * abx + abz * abz;
  const t = len2 > 1e-6 ? THREE.MathUtils.clamp(((p.x - a.x) * abx + (p.z - a.z) * abz) / len2, 0, 1) : 0;
  return Math.hypot(p.x - (a.x + abx * t), p.z - (a.z + abz * t));
}

/** Witte ogen (fase 2): hetzelfde gloeiende plaatje als de rode ogen, maar wit met een gele rand. */
let whiteEyeTexture = null;
function whiteEye() {
  if (whiteEyeTexture) return whiteEyeTexture;
  const c = document.createElement('canvas');
  c.width = c.height = 64;
  const g = c.getContext('2d');
  const grad = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  grad.addColorStop(0, 'rgba(255,255,255,1)');
  grad.addColorStop(0.35, 'rgba(255,255,240,1)');
  grad.addColorStop(0.65, 'rgba(255,230,120,0.4)');
  grad.addColorStop(1, 'rgba(255,220,80,0)');
  g.fillStyle = grad;
  g.fillRect(0, 0, 64, 64);
  whiteEyeTexture = new THREE.CanvasTexture(c);
  return whiteEyeTexture;
}

/** Een bliksemsikkel (Storm Crescent): een platte maan-vorm die naar voren (+z) bolt. */
let crescentGeo = null;
function makeCrescent() {
  if (!crescentGeo) {
    const S = B.sikkel;
    const w = S.width / 2;
    const depth = S.width * 0.38; // zo ver bolt hij naar voren
    const s = new THREE.Shape();
    s.moveTo(-w, 0);
    s.quadraticCurveTo(0, depth * 2, w, 0); // voorkant
    s.quadraticCurveTo(0, (depth - S.thickness) * 2, -w, 0); // achterkant (dunner aan de punten)
    crescentGeo = new THREE.ExtrudeGeometry(s, { depth: S.tall, bevelEnabled: false, curveSegments: 16 });
    crescentGeo.rotateX(Math.PI / 2); // liggend, de bolling naar +z (en S.tall hoog)
    crescentGeo.translate(0, S.tall / 2, -depth * 0.5);
  }
  const layer = (color, opacity, scale) => {
    const mesh = new THREE.Mesh(crescentGeo, new THREE.MeshBasicMaterial({ color, transparent: true, opacity, side: THREE.DoubleSide, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false }));
    mesh.scale.set(scale, 1, scale);
    return mesh;
  };
  const group = new THREE.Group();
  group.add(layer(0xffc21a, 0.5, 1.25), layer(0xffe680, 0.8, 1), layer(0xffffff, 0.9, 0.7));
  return group;
}

// ---------- Houdingen (bovenop de gewone animatie, zie applyPatch) ----------
// r = de "rig": armen, ellebogen, benen, knieën, heupen. Getallen zijn draaiingen in radialen.
const POSES = {
  // Stil, hand op het handvat bij zijn linkerheup, en rustig ademen
  stil(r, t, unit) {
    const breathe = Math.sin(t * B.idle.breatheSpeed);
    r.hips.rotation.x = 0.06 + breathe * 0.02;
    r.hips.position.y += breathe * B.idle.breathe * unit;
    r.armR.rotation.set(-0.38, 0, 0.62);
    r.elbowR.rotation.x = -1.25;
    r.armL.rotation.set(-0.3, 0, -0.05);
    r.elbowL.rotation.x = -0.75;
    r.kneeL.rotation.x = r.kneeR.rotation.x = 0.12;
  },
  // Diep door de knieën, hand op het handvat: zo meteen flitst hij!
  hurken(r, t, unit) {
    r.hips.rotation.x = 0.55;
    r.hips.position.y -= 0.22 * unit;
    r.legL.rotation.x = -0.95;
    r.kneeL.rotation.x = 1.15;
    r.legR.rotation.x = 0.35;
    r.kneeR.rotation.x = 0.95;
    r.armR.rotation.set(-0.8, 0, 0.75);
    r.elbowR.rotation.x = -1.15;
    r.armL.rotation.set(-0.55, 0, -0.1);
    r.elbowL.rotation.x = -0.9;
  },
  // Net geflitst: zwaard opzij gestrekt, lijf nog laag
  naFlits(r, t, unit) {
    r.hips.rotation.x = 0.3;
    r.hips.position.y -= 0.12 * unit;
    r.legL.rotation.x = -0.6;
    r.kneeL.rotation.x = 0.6;
    r.legR.rotation.x = 0.45;
    r.kneeR.rotation.x = 0.45;
    r.armR.rotation.set(-1.35, 0, -1.25);
    r.elbowR.rotation.x = -0.05;
    r.handR.rotation.x = 0.9;
    r.armL.rotation.set(-0.3, 0, 0.35);
  },
  // Klaar om omhoog te springen
  sprongKlaar(r, t, unit) {
    r.hips.rotation.x = 0.7;
    r.hips.position.y -= 0.32 * unit;
    r.legL.rotation.x = -1.1;
    r.kneeL.rotation.x = 1.6;
    r.legR.rotation.x = -0.3;
    r.kneeR.rotation.x = 1.3;
    r.armL.rotation.set(0.7, 0, 0.3);
    r.armR.rotation.set(0.7, 0, -0.3);
    r.elbowL.rotation.x = r.elbowR.rotation.x = -0.3;
  },
  // In de lucht: opgerold
  sprong(r) {
    r.legL.rotation.x = -1.2;
    r.legR.rotation.x = -0.8;
    r.kneeL.rotation.x = r.kneeR.rotation.x = 1.6;
    r.armL.rotation.set(-0.6, 0, 0.9);
    r.armR.rotation.set(-0.6, 0, -0.9);
  },
  // Naar beneden, zwaard boven zijn hoofd
  vallen(r) {
    r.armR.rotation.set(-2.6, 0, -0.2);
    r.elbowR.rotation.x = -0.4;
    r.handR.rotation.x = 0.6;
    r.armL.rotation.set(-2.4, 0, 0.3);
    r.elbowL.rotation.x = -0.5;
    r.legL.rotation.x = -0.9;
    r.kneeL.rotation.x = 1.2;
    r.kneeR.rotation.x = 0.6;
  },
  // Geland: op één knie, zwaard opzij naar beneden, andere hand op de grond
  naLanding(r, t, unit) {
    r.hips.rotation.x = 0.8;
    r.hips.position.y -= 0.45 * unit;
    r.legL.rotation.x = -1.3;
    r.kneeL.rotation.x = 2.0;
    r.legR.rotation.x = 0.5;
    r.kneeR.rotation.x = 1.6;
    r.armR.rotation.set(0.1, 0, -0.9);
    r.handR.rotation.x = -0.4;
    r.armL.rotation.set(-0.9, 0, 0.2);
    r.elbowL.rotation.x = -0.4;
  },
  // Zwaard getrokken en naar links weggedraaid: zo meteen een brede slag
  slagKlaar(r, t, unit) {
    r.hips.rotation.y = 0.7;
    r.hips.rotation.x = 0.2;
    r.hips.position.y -= 0.1 * unit;
    r.armR.rotation.set(-1.3, 0, 1.0);
    r.elbowR.rotation.x = -0.5;
    r.handR.rotation.x = 1.2;
    r.armL.rotation.set(-1.2, 0, 0.4);
    r.elbowL.rotation.x = -1.4;
    r.kneeL.rotation.x = r.kneeR.rotation.x = 0.5;
  },
  // Het eind van de slag: zwaard helemaal naar rechts
  slagEind(r, t, unit) {
    r.hips.rotation.y = -0.8;
    r.hips.rotation.x = 0.2;
    r.hips.position.y -= 0.1 * unit;
    r.armR.rotation.set(-1.45, 0, -1.4);
    r.elbowR.rotation.x = 0;
    r.handR.rotation.x = 1.3;
    r.armL.rotation.set(-0.3, 0, 0.6);
    r.kneeL.rotation.x = r.kneeR.rotation.x = 0.5;
  },
  // Wankelen: achterover, armen slap, wiebelen
  wankelen(r, t) {
    r.hips.rotation.x = -0.35 + Math.sin(t * 9) * 0.05;
    r.hips.rotation.z = Math.sin(t * 6) * 0.08;
    r.armR.rotation.set(0.3, 0, -0.5);
    r.armL.rotation.set(0.3, 0, 0.5);
    r.kneeL.rotation.x = r.kneeR.rotation.x = 0.4;
  },
  // Fase 2, het begin: armen een beetje open, hoofd omhoog, trillen
  storm(r, t) {
    r.hips.rotation.x = -0.25;
    r.hips.rotation.z = Math.sin(t * 40) * 0.03;
    r.armL.rotation.set(-0.4, 0, 0.6);
    r.armR.rotation.set(-0.4, 0, -0.6);
    r.kneeL.rotation.x = r.kneeR.rotation.x = 0.2;
  },
  // Fase 2: brullen met zijn armen wijd omhoog
  brul(r, t) {
    r.hips.rotation.x = -0.4;
    r.hips.rotation.z = Math.sin(t * 40) * 0.04;
    r.armL.rotation.set(-2.5, 0, 0.7);
    r.armR.rotation.set(-2.5, 0, -0.7);
    r.elbowL.rotation.x = r.elbowR.rotation.x = -0.2;
  },
};
const POSE_BONES = ['hips', 'armL', 'armR', 'elbowL', 'elbowR', 'handR', 'legL', 'legR', 'kneeL', 'kneeR'];

export class SkyFighter extends OmarFighter {
  constructor(scene, arena) {
    super(scene, arena, 'sky');
    this.barName = B.name; // de grote naam onderin (ui.js)
    this.barStyle = 'elden';
    this.trails = []; // bliksemsporen van zijn flitsen (lightning.js)
    this.crescents = []; // bliksemsikkels: { mesh, dir, travelled, hit }
    this.sparkle = 0;
    this.world = null; // het Wolkenrijk (zet sky.js): voor het donkere onweer in fase 2
    this.redEye = this.eyes.children[0].material.map;
    this.white = 0; // het witte scherm (0 = weg)
    this.buildSheath();
    loadSounds(B.audio.files);
    this.resetFight();
  }

  get cfg() { return SKY; }
  get taunts() { return TAUNTS; }
  get tagStyle() { return { text: 'Sky', stroke: '#1a2a4a', fill: '#ffe066' }; }
  /** Fase 2 begint onder dit deel van zijn leven (zie Boss.update in bosses.js). */
  get phase2At() { return B.phase2Threshold; }

  /** Sky is altijd de Soldaat, met NightWalker en zonder helm. */
  makeStats() { return new OmarStats('soldaat', SKY, 'nightwalker', 'geen'); }
  costumeFor() { return 'soldaat'; }

  /** Donkere stormhuid met gele bliksemaders (skyLook.js), en daaroverheen zijn gele haori (haori.js). */
  styleMaterials(mats, model) {
    applyStormSkin(model, this.puppet.sword.grip); // (zijn zwaard NightWalker houdt zijn eigen kleuren)
    dressHaori(model);
  }

  resetFight() {
    super.resetFight();
    if (!this.puppet || !this.sheath) return; // (de constructors van Boss en OmarFighter roepen dit al eerder aan)
    this.calmDown();
    this.setSheathed(false); // in het filmpje heeft hij NightWalker in zijn hand
    this.hidden = false;
    this.move = null;
    this.lockedAt = null; // waar hij heen flitst (ligt vast vlak voor de flits)
    this.history = []; // welke aanvallen hij net deed (nooit 3x dezelfde)
    this.poiseHits = []; // klappen van jou: { t, damage }
    this.cd.stagger = 0;
    this.roared = false;
    this.world?.setStorm(0);
    for (const eye of this.eyes.children) eye.material.map = this.redEye;
    // Fase-2 gloed weer normaal
    for (const e of this.materials) {
      if (e.base === undefined) continue;
      e.intensity = e.base;
      e.m.emissiveIntensity = e.base;
      delete e.base;
    }
  }

  // ---------- De schede: NightWalker hangt aan zijn linkerheup ----------

  buildSheath() {
    const slot = new THREE.Group();
    slot.position.set(0.17, 0.95, 0.04); // linkerheup (hij kijkt naar +z, links is +x)
    // Het lemmet wijst naar achteren en een beetje naar beneden; het handvat steekt naar voren
    slot.quaternion.setFromUnitVectors(UP, new THREE.Vector3(0.12, -0.38, -1).normalize());
    const scabbard = new THREE.Group();
    const body = new THREE.CylinderGeometry(0.045, 0.035, 0.9, 12);
    const skin = toon(0x1a2140, { emissive: 0x0a1020 });
    const sheathMesh = new THREE.Mesh(body, skin);
    sheathMesh.castShadow = true;
    scabbard.add(sheathMesh, new THREE.Mesh(body, outlineMaterial()));
    scabbard.position.y = 0.57;
    scabbard.scale.set(1, 1, 0.55); // plat, zoals een echte schede
    const gold = toon(0xffc83d, { emissive: 0x4a3000 });
    for (const [y, r] of [[0.12, 0.05], [1.0, 0.04]]) {
      const ring = new THREE.Mesh(new THREE.TorusGeometry(r, 0.012, 6, 16), gold);
      ring.rotation.x = Math.PI / 2;
      ring.position.y = y;
      ring.scale.set(1, 0.55, 1);
      slot.add(ring);
    }
    slot.add(scabbard);
    const blade = new THREE.Group(); // hier gaat het zwaard in als hij het wegsteekt
    slot.add(blade);
    this.puppet.inner.add(slot);
    this.sheath = { slot, blade };
  }

  /** Zwaard in de schede (true) of in zijn hand (false). */
  setSheathed(on) {
    const w = this.puppet.sword.weaponMesh;
    if (!w) return;
    // Na een reset is er een nieuw zwaard gemaakt: het oude uit de schede halen
    for (const c of [...this.sheath.blade.children]) if (c !== w) this.sheath.blade.remove(c);
    const parent = on ? this.sheath.blade : this.puppet.sword.grip;
    if (w.parent !== parent) parent.add(w);
    this.sheathed = on;
  }

  // ---------- Het filmpje: van de wolkentroon als bliksem de arena in ----------

  /** In plaats van een salto: hij wordt een wolk, vliegt naar de arena en slaat in als bliksem. */
  animateMode(dt) {
    if (this.mode !== 'sprong') {
      super.animateMode(dt);
      return;
    }
    this.introT += dt;
    if (this.introT >= LEAP_END) {
      this.finishIntro();
      this.introStrike();
      return;
    }
    // Een wolk die in een boog van de troon naar de landingsplek zweeft
    this.mesh.visible = false;
    const u = (this.introT - 0.45) / (LEAP_END - 0.45);
    const at = this.standPosition.lerp(this.landing, u);
    at.y = 1.5 * (1 - u) + 6 * 4 * u * (1 - u) + 1;
    if (this.effects && Math.random() < 0.9) {
      this.effects.puff(at, pick(CLOUD), { count: 2, speed: 0.5, size: 1.1, life: 0.8, up: 0.2 });
      if (Math.random() < 0.3) this.effects.burst(at, 0xffe066, { count: 2, speed: 2, size: 0.08, life: 0.3, up: 0, gravity: 0 });
    }
  }

  /** BOEM: de bliksem slaat in op de landingsplek, en daar staat hij. */
  introStrike() {
    const at = this.landing.clone().setY(0);
    this.bolts.add(makeBolt(at, { color: 'geel', width: 2.2, branches: 4, height: 24 }), 0.35);
    play('donder');
    play('zap');
    if (!this.effects) return;
    this.effects.shockwave(at, 0xffe066, 6);
    this.effects.burst(at.clone().setY(0.5), 0xfff3b0, { count: 40, speed: 9, size: 0.15, life: 0.7, up: 3 });
    this.effects.puff(at.clone().setY(1), pick(CLOUD), { count: 18, speed: 4, size: 1.4, life: 1.1, up: 0.6 });
    this.effects.shake(0.7);
  }

  /** Overslaan: meteen in de arena staan (zichtbaar). */
  finishIntro() {
    super.finishIntro();
    this.mesh.visible = true;
  }

  cutsceneTick(dt) {
    super.cutsceneTick(dt);
    this.bolts.update(dt); // (de bliksempjes van zijn aura en de inslag verdwijnen ook in het filmpje)
  }

  // ---------- Geraakt worden ----------

  hit(from, swingId, damage) {
    if (this.hidden || this.state === 'faseOvergang') return null; // onzichtbaar, of de storm beschermt hem
    const result = super.hit(from, swingId, damage);
    if (!result) return null;
    if (this.state !== 'wankelen') this.puppet.knockback.set(0, 0, 0); // hij staat als een rots
    if (result.killed) {
      this.calmDown();
      this.world?.setStorm(0);
      this.bolts.add(makeBolt(this.position.clone().setY(0), { color: 'geel', width: 2, branches: 3, height: 24 }), 0.35);
      play('donder');
      return result;
    }
    // Vaak genoeg geraakt terwijl hij stilstaat? Dan wankelt hij
    const now = this.time ?? 0;
    this.poiseHits.push({ t: now, damage });
    this.poiseHits = this.poiseHits.filter((h) => now - h.t < B.stagger.window);
    const total = this.poiseHits.reduce((sum, h) => sum + h.damage, 0);
    if (CAN_STAGGER.includes(this.state) && this.cd.stagger <= 0 && total >= this.info.hp * B.stagger.poise) {
      this.poiseHits.length = 0;
      this.cd.stagger = B.stagger.cooldown;
      this.setSheathed(true);
      this.say(pick(this.taunts.wankelen), 1.6, true);
      this.shout('!!', '#ffffff', 0.7);
      this.setState('wankelen', B.stagger.time);
      this.log('wankelen');
    }
    return result;
  }

  // ---------- Het brein ----------

  think(dt, ctx) {
    super.think(dt, ctx);
    if (this.hidden) this.mesh.visible = false; // (Player.update maakt de pop elke frame weer zichtbaar)
  }

  brain(dt, ctx, c, dist, dir, ph, threat) {
    const p = this.puppet;
    const player = ctx.player;
    const speed = B.telegraphSpeed[ph];
    this.face = true;
    this.turnRate = B.idle.turnRate;

    switch (this.state) {
      case 'start': {
        // Het gevecht begint: zwaard in de schede. Klik.
        this.setSheathed(true);
        play('skySheathe');
        this.say(pick(this.taunts.start), 2, true);
        this.setState('stil', B.idle.firstWait);
        break;
      }

      // ===== Stil (idle): hand op het zwaard, rustig ademen =====
      case 'stil': {
        this.patch = 'stil';
        if (this.timer <= 0) this.chooseMove(dist, ph, ctx);
        break;
      }

      // ===== Laten zien wat hij gaat doen (telegraph) =====
      case 'klaar': {
        const k = smooth(this.stateT / B.idle.poseBlend); // heel snel van stil naar de nieuwe houding
        if (this.move === 'flits' || this.move === 'keten') {
          this.patch = { a: 'stil', b: 'hurken', k };
          this.turnRate = 8; // hij draait mee... tot het allerlaatste moment
          this.legSparks(dt);
          this.aimFlash(ctx, B.flits.lock);
          if (this.timer <= 0) this.flitsen(ctx, ph);
        } else if (this.move === 'hemelval') {
          this.patch = { a: 'stil', b: 'sprongKlaar', k };
          this.legSparks(dt);
          if (this.timer <= 0) this.jump(ctx);
        } else if (this.move === 'sikkel') {
          this.patch = { a: 'stil', b: 'slagKlaar', k };
          this.turnRate = 6;
          this.bladeSparks(dt, 0xffe066, 0.04);
          if (this.timer <= 0) this.startSlash(1);
        }
        break;
      }

      // ===== Move 1 en 2: de flits zelf (onzichtbaar, in een rechte lijn) =====
      case 'flits': {
        this.face = false;
        const k = Math.min(1, this.stateT / B.flits.travel);
        this.position.lerpVectors(this.flashFrom, this.flashTo, k);
        if (this.timer <= 0) this.arrive(ctx, ph);
        break;
      }

      // Tussen twee flitsen van een ketting: heel even stil, opnieuw mikken
      case 'tussen': {
        this.patch = 'hurken';
        this.turnRate = 30;
        this.legSparks(dt);
        this.aimFlash(ctx, Math.min(B.flits.lock, this.stateTime * 0.6));
        if (this.timer <= 0) this.flitsen(ctx, ph);
        break;
      }

      // ===== Move 3: Heaven's Fall =====
      case 'omhoog': {
        this.face = false;
        this.patch = 'sprong';
        if (Math.random() < 0.6) ctx.effects.puff(this.position.clone().setY(this.position.y + 0.8), pick(CLOUD), { size: 0.9, life: 0.6, up: 0 });
        if (this.stateT >= B.hemelval.gone) this.hideInSky(ctx, ph);
        break;
      }

      case 'hemel': {
        this.face = false;
        if (this.timer <= 0) this.strikeCircles(ctx);
        break;
      }

      case 'wachtLanding': {
        this.face = false;
        if (this.timer <= 0) this.drop(ctx);
        break;
      }

      case 'vallen': {
        this.face = false;
        this.patch = 'vallen';
        if ((p.onGround && this.stateT > 0.02) || this.stateT > 1.5) this.land(ctx);
        break;
      }

      // ===== Move 4: Storm Crescent =====
      case 'slag': {
        this.face = false;
        const k = smooth(this.stateT / B.sikkel.slash);
        const [a, b] = this.slashSide > 0 ? ['slagKlaar', 'slagEind'] : ['slagEind', 'slagKlaar'];
        this.patch = { a, b, k };
        if (!this.slashFired && k >= 0.4) {
          this.slashFired = true;
          this.fireCrescents(ctx, ph);
        }
        if (this.timer <= 0) {
          this.slashesLeft--;
          if (this.slashesLeft > 0) this.setState('slagTussen', B.sikkel.between * speed);
          else this.startRecovery(B.sikkel.recovery, 'slagEind');
        }
        break;
      }

      case 'slagTussen': {
        // Even stil aan het eind van de slag, dan terug de andere kant op
        this.patch = 'slagEind';
        this.turnRate = 12;
        this.bladeSparks(dt, 0xffe066, 0.04);
        if (this.timer <= 0) this.startSlash(-1);
        break;
      }

      // ===== Uitblazen (recovery): NU kun je hem slaan! =====
      case 'herstel': {
        const R = this.recovery;
        const k = this.stateT / this.stateTime;
        // Na een flits staat hij met zijn rug naar je toe; anders draait hij heel langzaam mee
        if (R.backTurned) this.face = false;
        else this.turnRate = 1;
        // Langzaam terug naar de stille houding, en dan... klik: zwaard in de schede
        const blend = B.flits.sheatheBlend;
        this.patch = { a: R.pose, b: 'stil', k: smooth((k - (R.sheatheAt - blend)) / blend) };
        if (!this.sheathed && k >= R.sheatheAt) {
          this.setSheathed(true);
          play('skySheathe');
        }
        if (this.timer <= 0) this.toIdle(ph);
        break;
      }

      // ===== Wankelen (stagger) =====
      case 'wankelen': {
        this.face = false;
        this.patch = 'wankelen';
        if (Math.random() < 0.3) ctx.effects.burst(this.position.clone().setY(this.position.y + 2.1), 0xffe066, { count: 1, speed: 0.6, size: 0.1, life: 0.4, up: 0.4, gravity: 0 });
        if (this.timer <= 0) this.toIdle(ph, B.stagger.after);
        break;
      }

      // ===== Fase 2: de storm barst los (hij kan nu niet geraakt worden) =====
      case 'faseOvergang': {
        const P = B.phase2;
        this.turnRate = 3;
        this.patch = this.roared ? 'brul' : 'storm';
        this.strikeT = (this.strikeT ?? 0) - dt;
        if (this.strikeT <= 0) {
          // De bliksem slaat in op hem: hij laadt op
          this.strikeT = P.strikeEvery;
          this.bolts.add(makeBolt(this.position.clone().setY(this.position.y + 1.2), { color: 'geel', width: 1.8, branches: 3, height: 24 }), 0.22);
          ctx.effects.burst(this.center, 0xfff3b0, { count: 16, speed: 6, size: 0.1, life: 0.5, up: 2, gravity: 0.3 });
          ctx.effects.shake(0.25);
          play('zap');
        }
        if (!this.roared && this.stateT >= P.roarAt) this.roar(ctx);
        if (this.timer <= 0) {
          duckMusic(1, B.audio.musicBack);
          this.toIdle(ph, P.after);
        }
        break;
      }

      default:
        this.toIdle(ph);
        break;
    }
  }

  /** Terug naar stilstaan (en zo lang wachten, of een willekeurige tijd uit skyConfig.js). */
  toIdle(ph, wait = rand(B.idle.wait[ph])) {
    this.move = null;
    this.setState('stil', wait);
  }

  /** Kies een aanval: de kans hangt af van hoe ver je weg bent, en nooit 3x dezelfde achter elkaar. */
  chooseMove(dist, ph, ctx) {
    const C = B.choose;
    const band = dist < C.near ? 0 : dist > C.far ? 2 : 1;
    const recent = this.history.slice(-C.maxRepeat);
    const options = Object.entries(C.weights).map(([move, w]) => {
      const repeated = recent.length === C.maxRepeat && recent.every((m) => m === move);
      return [move, repeated ? 0 : w[band]];
    });
    let roll = Math.random() * options.reduce((sum, [, w]) => sum + w, 0);
    let move = options[0][0];
    for (const [m, w] of options) {
      roll -= w;
      if (roll <= 0) {
        move = m;
        break;
      }
    }
    this.history.push(move);
    if (this.history.length > 6) this.history.shift();
    this.move = move;
    this.log(move);
    const speed = B.telegraphSpeed[ph];
    if (move === 'flits' || move === 'keten') {
      // Doodstil... de muziek valt weg, en een zoem wordt hoger en hoger
      const time = B.flits.telegraph * speed;
      this.flashesLeft = move === 'keten' ? B.keten.flashes[ph] : 1;
      this.chainTrails = [];
      this.chainFlash = 0;
      this.lockedAt = null;
      duckMusic(B.audio.musicDuck, B.audio.duckFade);
      play('skyBuzz', { duration: time });
      this.setState('klaar', time);
    } else if (move === 'hemelval') {
      this.say(pick(this.taunts.hemelval), 1.6, true);
      play('charge');
      this.setState('klaar', B.hemelval.telegraph * speed);
    } else if (move === 'sikkel') {
      this.setSheathed(false); // zwaard trekken
      play('zap');
      if (Math.random() < 0.4) this.say(pick(this.taunts.sikkel), 1.4, true);
      this.slashesLeft = B.sikkel.slashes[ph];
      this.setState('klaar', B.sikkel.telegraph * speed);
    }
    ctx.effects.burst(this.center, 0xffe066, { count: 6, speed: 2, size: 0.07, life: 0.3, up: 0.5, gravity: 0 });
  }

  /** Vonkjes en kleine bliksempjes bij zijn benen (hij laadt op). */
  legSparks(dt) {
    this.legSparkT = (this.legSparkT ?? 0) - dt;
    if (this.legSparkT > 0 || !this.effects) return;
    this.legSparkT = B.flits.legSparks;
    const a = Math.random() * Math.PI * 2;
    const at = this.position.clone().add(new THREE.Vector3(Math.sin(a) * 0.35, 0.1 + Math.random() * 0.6, Math.cos(a) * 0.35));
    this.effects.burst(at, Math.random() < 0.5 ? 0xffe066 : 0xffffff, { count: 2, speed: 2.5, size: 0.06, life: 0.2, up: 0.5, gravity: 0 });
    if (Math.random() < 0.35) {
      const to = at.clone().add(new THREE.Vector3((Math.random() - 0.5) * 0.6, -0.3 - Math.random() * 0.3, (Math.random() - 0.5) * 0.6));
      this.bolts.add(makeBoltBetween(at, to, { color: 'geel', width: 0.25, wiggle: 0.18, segments: 3 }), 0.06);
    }
  }

  // ---------- Move 1 en 2: de flits ----------

  /**
   * Vlak voor de flits (`lead` seconden) ligt zijn richting vast: "ting!", en hij draait niet meer mee.
   * Tot dat moment volgt hij je; daarna kun je nog net opzij stappen.
   */
  aimFlash(ctx, lead) {
    if (this.lockedAt) {
      this.face = false;
      return;
    }
    if (this.timer > lead) return;
    this.lockedAt = ctx.player.position.clone();
    tmp.copy(this.lockedAt).sub(this.position);
    this.mesh.rotation.y = Math.atan2(tmp.x, tmp.z);
    this.face = false;
    play('glint');
    ctx.effects.burst(this.position.clone().setY(this.position.y + 1.5), 0xffffff, { count: 6, speed: 2, size: 0.07, life: 0.2, up: 0, gravity: 0 });
  }

  /** FLITS: in een rechte lijn naar waar je was toen zijn richting vastlag (zie aimFlash), en nog een stuk verder. */
  flitsen(ctx, ph) {
    const F = B.flits;
    const player = ctx.player;
    const from = this.position.clone();
    const target = this.lockedAt ?? player.position;
    this.lockedAt = null;
    const dir = target.clone().sub(from).setY(0);
    if (dir.lengthSq() < 1e-4) dir.copy(this.puppet.facing);
    dir.normalize();
    // Eindpunt: vóórbij jou, maar binnen de arena (anders stopt hij eerder op dezelfde lijn)
    const want = flatDist(from, target) + F.overshoot;
    const max = this.arena.radius - F.edge;
    const rel = from.clone().sub(this.arena.center).setY(0);
    const b = rel.dot(dir);
    const room = -b + Math.sqrt(Math.max(0, b * b - rel.lengthSq() + max * max)); // tot waar de lijn in de arena blijft
    const to = from.clone().addScaledVector(dir, Math.max(0, Math.min(want, room)));
    // Raakt hij? Eén keer kijken, over het hele pad (een "capsule": een dikke lijn)
    const kind = this.move === 'keten' ? 'keten' : 'flits';
    const close = distToSegment(player.position, from, to) < F.hitRadius;
    const low = player.position.y - this.position.y < F.hitHeight;
    if (close && low && this.hurt(ctx, kind)) ctx.hitstop?.(B.feel.hitStop);
    // KRAK: de donderklap, het witte scherm, het bliksemspoor
    play('skyCrack');
    const first = this.chainFlash === 0;
    const last = this.flashesLeft <= 1;
    if (this.move !== 'keten' || first || last) this.flashWhite(B.feel.whiteAlpha);
    ctx.effects.shake(B.feel.shake);
    const y = B.trail.height;
    const trail = new LightningTrail(this.scene, from.clone().setY(from.y + y), to.clone().setY(to.y + y), B.trail);
    this.trails.push(trail);
    this.chainTrails.push(trail);
    ctx.effects.burst(from.clone().setY(from.y + 0.9), 0xfff3b0, { count: 18, speed: 7, size: 0.1, life: 0.35, up: 1, gravity: 0 });
    ctx.effects.puff(from.clone().setY(from.y + 0.6), CLOUD[1], { count: 4, speed: 2, size: 0.9, life: 0.5, up: 0.3 });
    // Weg: hij is nu de bliksem
    this.setSheathed(false); // (het zwaard is al getrokken als hij weer verschijnt)
    this.hidden = true;
    this.mesh.visible = false;
    this.flashFrom = from;
    this.flashTo = to;
    this.flashDir = dir;
    this.flashesLeft--;
    this.chainFlash++;
    this.setState('flits', F.travel);
  }

  /** Daar is hij weer, vóórbij jou, met zijn rug naar je toe. */
  arrive(ctx, ph) {
    this.position.copy(this.flashTo);
    this.puppet.velocity.set(0, 0, 0);
    this.puppet.knockback.set(0, 0, 0);
    this.mesh.rotation.y = Math.atan2(this.flashDir.x, this.flashDir.z);
    this.mesh.visible = true;
    this.hidden = false;
    ctx.effects.shockwave(this.position, 0xffe066, 2);
    ctx.effects.burst(this.position.clone().setY(this.position.y + 0.9), 0xffe066, { count: 14, speed: 5, size: 0.08, life: 0.35, up: 1, gravity: 0 });
    if (this.flashesLeft > 0) {
      this.setState('tussen', B.keten.between[ph]);
      return;
    }
    // Klaar: de sporen van de hele ketting blijven samen nog even hangen, en dan rommelt de donder na
    for (const t of this.chainTrails) t.extend(B.trail.life);
    this.schedule(B.audio.rumbleDelay, () => play('skyRumble'));
    duckMusic(1, B.audio.musicBack);
    this.startRecovery(this.move === 'keten' ? B.keten.recovery : B.flits.recovery, 'naFlits', true);
  }

  /** Uitblazen: even stilstaan in de houding van de aanval, en dan langzaam het zwaard wegsteken. */
  startRecovery(time, pose, backTurned = false) {
    this.recovery = { pose, backTurned, sheatheAt: B.flits.sheatheAt };
    this.setState('herstel', time);
  }

  // ---------- Move 3: Heaven's Fall ----------

  /** Hij springt omhoog, uit beeld. */
  jump(ctx) {
    const p = this.puppet;
    p.velocity.y = B.hemelval.jumpSpeed;
    p.onGround = false;
    this.setSheathed(false);
    play('whoosh');
    play('zap');
    ctx.effects.shockwave(this.position, 0xffe066, 2.5);
    ctx.effects.puff(this.position.clone().setY(this.position.y + 0.4), CLOUD[0], { count: 10, speed: 3, size: 1.1, life: 0.8, up: 0.4 });
    this.setState('omhoog');
  }

  /** Hoog in de lucht (onzichtbaar): de cirkels verschijnen. Eén ligt altijd precies onder jou. */
  hideInSky(ctx, ph) {
    const H = B.hemelval;
    const player = ctx.player;
    this.hidden = true;
    this.mesh.visible = false;
    this.puppet.velocity.set(0, 0, 0);
    const inside = (pos) => {
      const off = pos.clone().sub(this.arena.center).setY(0);
      const max = this.arena.radius - H.radius - 0.3;
      if (off.length() > max) off.setLength(max);
      return this.arena.center.clone().add(off).setY(0);
    };
    const spots = [inside(player.position)];
    const n = randInt(H.circles[ph]);
    for (let tries = 0; spots.length < n && tries < 60; tries++) {
      const a = Math.random() * Math.PI * 2;
      const r = rand(H.spread);
      const spot = inside(player.position.clone().add(new THREE.Vector3(Math.sin(a) * r, 0, Math.cos(a) * r)));
      if (spots.every((s) => flatDist(s, spot) >= H.gap)) spots.push(spot);
    }
    for (const s of spots) ctx.effects.warnCircle(s, H.radius, H.delay);
    this.fallSpots = spots;
    play('charge');
    this.setState('hemel', H.delay);
  }

  /** BOEM: de bliksem slaat in in alle cirkels tegelijk. */
  strikeCircles(ctx) {
    const H = B.hemelval;
    const player = ctx.player;
    let hit = false;
    for (const s of this.fallSpots) {
      this.bolts.add(makeBolt(s, { color: 'geel', width: 1.6, branches: 2, height: 22 }), 0.3);
      ctx.effects.shockwave(s, 0xffe066, H.radius + 0.4);
      ctx.effects.burst(s.clone().setY(0.3), 0xfff3b0, { count: 16, speed: 7, size: 0.12, life: 0.5, up: 3 });
      if (!hit && flatDist(player.position, s) < H.radius + 0.1 && player.position.y < 3) hit = this.hurt(ctx, 'inslag');
    }
    play('skyCrack');
    play('donder');
    this.flashWhite(B.feel.strikeWhite);
    ctx.effects.shake(0.5);
    // Op de laatste cirkel komt hij zo meteen neer: een grote cirkel voor de schokgolf
    const land = this.fallSpots[this.fallSpots.length - 1];
    ctx.effects.warnCircle(land, H.shockRadius, H.landDelay + 0.3);
    this.setState('wachtLanding', H.landDelay);
  }

  /** Hij valt uit de lucht op de laatste cirkel. */
  drop(ctx) {
    const H = B.hemelval;
    const land = this.fallSpots[this.fallSpots.length - 1];
    this.position.copy(land).setY(H.dropHeight);
    this.puppet.velocity.set(0, -H.dropSpeed, 0);
    this.puppet.onGround = false;
    this.mesh.visible = true;
    this.hidden = false;
    tmp.copy(ctx.player.position).sub(land);
    this.mesh.rotation.y = Math.atan2(tmp.x, tmp.z);
    this.bolts.add(makeBoltBetween(land.clone().setY(24), land.clone().setY(H.dropHeight), { color: 'geel', width: 1.2, segments: 6 }), 0.2);
    play('whoosh');
    this.setState('vallen');
  }

  /** Geland: een schokgolf (spring erover, of sta buiten de cirkel!). */
  land(ctx) {
    const H = B.hemelval;
    const at = this.position.clone().setY(0);
    const player = ctx.player;
    play('slam');
    play('skyCrack');
    ctx.effects.shockwave(at, 0xffe066, H.shockRadius);
    ctx.effects.shockwave(at, 0xffffff, H.shockRadius * 0.6);
    ctx.effects.burst(at.clone().setY(0.3), 0xffe066, { count: 30, speed: 9, size: 0.14, life: 0.6, up: 2 });
    ctx.effects.puff(at.clone().setY(0.5), CLOUD[1], { count: 14, speed: 5, size: 1.2, life: 0.9, up: 0.3 });
    ctx.effects.shake(0.6);
    if (flatDist(player.position, at) <= H.shockRadius && player.position.y < 1.2) this.hurt(ctx, 'landing');
    this.fallSpots = null;
    this.startRecovery(H.recovery, 'naLanding');
  }

  // ---------- Move 4: Storm Crescent ----------

  startSlash(side) {
    this.slashSide = side;
    this.slashFired = false;
    this.setState('slag', B.sikkel.slash);
  }

  /** Een waaier van bliksemsikkels, recht op jou af (de tweede slag zit er net tussenin). */
  fireCrescents(ctx, ph) {
    const S = B.sikkel;
    const n = S.count[ph];
    const aim = ctx.player.position.clone().sub(this.position).setY(0);
    if (aim.lengthSq() < 1e-4) aim.copy(this.puppet.facing);
    aim.normalize();
    const offset = this.slashSide < 0 ? S.angle / 2 : 0;
    for (let i = 0; i < n; i++) {
      const dir = aim.clone().applyAxisAngle(UP, (i - (n - 1) / 2) * S.angle + offset);
      const mesh = makeCrescent();
      mesh.position.copy(this.position).addScaledVector(dir, 0.8).setY(this.position.y + S.height);
      mesh.rotation.y = Math.atan2(dir.x, dir.z);
      this.scene.add(mesh);
      this.crescents.push({ mesh, dir, travelled: 0, hit: false });
    }
    play('heavySwing');
    play('zap');
    ctx.effects.shake(0.2);
  }

  /** De sikkels vliegen. Raken ze je? (Rollen gaat erdoorheen, en ertussendoor rennen kan ook.) */
  updateCrescents(dt, ctx) {
    const S = B.sikkel;
    const player = ctx.player;
    for (let i = this.crescents.length - 1; i >= 0; i--) {
      const c = this.crescents[i];
      const step = S.speed * dt;
      c.mesh.position.addScaledVector(c.dir, step);
      c.travelled += step;
      for (const m of c.mesh.children) m.material.opacity *= 0.985 + Math.random() * 0.03; // flikkeren
      if (Math.random() < 0.5) ctx.effects.burst(c.mesh.position, 0xffe066, { count: 1, speed: 1, size: 0.07, life: 0.25, up: 0, gravity: 0 });
      if (!c.hit) {
        // Waar sta jij, gezien vanaf de sikkel? f = vooruit, s = opzij
        tmp.copy(player.position).sub(c.mesh.position).setY(0);
        const f = tmp.dot(c.dir);
        const s = tmp.x * c.dir.z - tmp.z * c.dir.x;
        const half = S.width / 2;
        const curve = S.width * 0.38 * 0.5 * (1 - Math.min(1, (s / half) ** 2)); // midden van de boog op die plek
        const inBand = Math.abs(s) < half + 0.35 && Math.abs(f - curve) < S.thickness / 2 + 0.4;
        const low = player.position.y < c.mesh.position.y + 0.4;
        if (inBand && low && this.hurt(ctx, 'sikkel')) {
          c.hit = true;
          play('zap');
        }
      }
      const out = flatDist(c.mesh.position, this.arena.center) > this.arena.radius + 0.5;
      if (c.travelled > S.range || out) {
        ctx.effects.burst(c.mesh.position, 0xffe066, { count: 10, speed: 4, size: 0.08, life: 0.3, up: 0.5, gravity: 0 });
        this.removeCrescent(i);
      }
    }
  }

  removeCrescent(i) {
    const c = this.crescents[i];
    this.scene.remove(c.mesh);
    for (const m of c.mesh.children) m.material.dispose();
    this.crescents.splice(i, 1);
  }

  // ---------- Fase 2 ----------

  /** Fase 2 (onder phase2Threshold van zijn leven): hij stopt, en de storm laadt hem op. */
  onPhase2(ctx) {
    this.abortMove();
    this.puppet.stats.phase = 1;
    this.setSheathed(true);
    this.say(pick(this.taunts.fase2), 2.5, true);
    duckMusic(B.phase2.musicDuck, 0.3);
    this.strikeT = 0;
    this.roared = false;
    this.setState('faseOvergang', B.phase2.time);
    this.log('fase2');
  }

  /** BRUL: witte ogen, wit-hete aders, en het hele Wolkenrijk wordt donker. */
  roar(ctx) {
    this.roared = true;
    play('skyRoar');
    play('donder');
    this.tintPhase2();
    for (const eye of this.eyes.children) eye.material.map = whiteEye();
    this.world?.setStorm(1);
    this.flashWhite(0.5);
    this.shout('GRRAAAH!', '#ffffff', 0.9);
    this.say(pick(this.taunts.boos), 2.5, true);
    ctx.effects.shockwave(this.position, 0xffffff, 7);
    ctx.effects.shockwave(this.position, 0xffe066, 5);
    ctx.effects.burst(this.center, 0xffffff, { count: 40, speed: 9, size: 0.14, life: 0.8, up: 3 });
    ctx.effects.shake(0.8);
  }

  /** Aders wit-heet en extra fel (Boss.update gebruikt e.intensity elke frame). */
  tintPhase2() {
    super.tintPhase2();
    for (const e of this.materials) {
      e.base ??= e.intensity;
      e.intensity = e.base * B.phase2.veinGlow;
    }
  }

  /** Een aanval afbreken (fase 2 begint): weer zichtbaar, op de grond. */
  abortMove() {
    if (this.hidden || this.position.y > 0.01) {
      this.position.y = 0;
      this.puppet.velocity.set(0, 0, 0);
    }
    this.hidden = false;
    this.mesh.visible = true;
    this.fallSpots = null;
    this.flashesLeft = 0;
    this.lockedAt = null;
    this.move = null;
  }

  /** Alles rustig: muziek weer vol, geen wit scherm, zichtbaar. */
  calmDown() {
    duckMusic(1, 0.5);
    this.white = 0;
    if (this.whiteEl) this.whiteEl.style.opacity = 0;
    this.hidden = false;
    if (this.mesh) this.mesh.visible = true;
  }

  /** De speler is verslagen: Sky lacht (met zijn zwaard omhoog). */
  laughAtPlayer(dt, ctx) {
    if (this.mode !== 'lachen') {
      this.calmDown();
      this.setSheathed(false);
    }
    super.laughAtPlayer(dt, ctx);
  }

  // ---------- Het witte scherm ----------

  flashWhite(alpha) {
    if (!this.whiteEl) {
      this.whiteEl = document.getElementById('sky-flits') ?? document.createElement('div');
      this.whiteEl.id = 'sky-flits';
      if (!this.whiteEl.parentNode) document.body.append(this.whiteEl);
    }
    this.white = Math.max(this.white, alpha);
    this.whiteEl.style.opacity = this.white;
  }

  updateWhite(dt) {
    if (this.white <= 0 || !this.whiteEl) return;
    this.white = Math.max(0, this.white - dt * (B.feel.whiteAlpha / B.feel.whiteFade));
    this.whiteEl.style.opacity = this.white;
  }

  // ---------- Elke frame: sporen, sikkels, het witte scherm ----------

  updateMagic(dt, ctx) {
    super.updateMagic(dt, ctx);
    for (let i = this.trails.length - 1; i >= 0; i--) {
      const t = this.trails[i];
      t.update(dt);
      if (t.done) {
        t.dispose();
        this.trails.splice(i, 1);
      }
    }
    this.updateCrescents(dt, ctx);
    this.updateWhite(dt);
  }

  clearMagic() {
    super.clearMagic();
    for (const t of this.trails ?? []) t.dispose();
    if (this.trails) this.trails.length = 0;
    while (this.crescents?.length) this.removeCrescent(0);
  }

  // ---------- Houdingen ----------

  /** Eigen houdingen (POSES hierboven), of een mengsel van twee: { a, b, k } (k = 0 → a, 1 → b). */
  applyPatch(dt) {
    const r = this.puppet.rig;
    const patch = this.patch;
    if (!patch || !r || !r.elbowL) {
      super.applyPatch(dt);
      return;
    }
    const t = this.time ?? 0;
    const unit = r.unit ?? 1;
    if (typeof patch === 'string') {
      if (!POSES[patch]) {
        super.applyPatch(dt);
        return;
      }
      POSES[patch](r, t, unit);
    } else {
      // Twee houdingen mengen: eerst allebei uitrekenen vanaf de gewone animatie, dan ertussenin
      const base = this.snapshot(r);
      POSES[patch.a](r, t, unit);
      const a = this.snapshot(r);
      this.restore(r, base);
      POSES[patch.b](r, t, unit);
      const b = this.snapshot(r);
      const k = THREE.MathUtils.clamp(patch.k, 0, 1);
      this.restore(r, a.map((v, i) => v + (b[i] - v) * k));
    }
    r.apply?.();
  }

  snapshot(r) {
    const out = [];
    for (const key of POSE_BONES) out.push(r[key].rotation.x, r[key].rotation.y, r[key].rotation.z);
    out.push(r.hips.position.y);
    return out;
  }

  restore(r, values) {
    let i = 0;
    for (const key of POSE_BONES) r[key].rotation.set(values[i++], values[i++], values[i++]);
    r.hips.position.y = values[i];
  }

  // ---------- Hoe hij eruitziet: wolken-aura, knetterende vonkjes, en in fase 2 altijd vonken ----------

  updateLook(dt, effects) {
    super.updateLook(dt, effects);
    if (!effects || this.mode === 'troon' || !this.mesh.visible || this.mode === 'verslagen') return;
    const ph = this.phase2 && this.roared ? 1 : 0;
    // Fase 2: altijd vonken om hem heen
    if (ph) {
      this.sparkT = (this.sparkT ?? 0) - dt;
      if (this.sparkT <= 0) {
        this.sparkT = B.phase2.sparkEvery;
        const a = Math.random() * Math.PI * 2;
        const at = this.position.clone().add(new THREE.Vector3(Math.sin(a) * 0.5, 0.2 + Math.random() * 1.8, Math.cos(a) * 0.5));
        effects.burst(at, Math.random() < 0.6 ? 0xffffff : 0xffe066, { count: 1, speed: 1.5, size: 0.06, life: 0.3, up: 0.6, gravity: 0 });
      }
    }
    this.sparkle -= dt;
    if (this.sparkle > 0) return;
    this.sparkle = B.idle.crackle[ph] * (0.6 + Math.random() * 0.8);
    // Een klein bliksempje dat door zijn wolken-aura springt
    const a = Math.random() * Math.PI * 2;
    const from = this.position.clone().add(new THREE.Vector3(Math.sin(a) * 0.55, 0.4 + Math.random() * 1.4, Math.cos(a) * 0.55));
    const to = from.clone().add(new THREE.Vector3((Math.random() - 0.5) * 0.8, -0.3 - Math.random() * 0.6, (Math.random() - 0.5) * 0.8));
    this.bolts.add(makeBoltBetween(from, to, { color: 'geel', width: 0.3, wiggle: 0.22, segments: 4 }), 0.08);
    effects.burst(to, 0xffe066, { count: 3, speed: 2, size: 0.06, life: 0.25, up: 0.5, gravity: 0 });
  }

  /** Gele vonken langs NightWalker (alleen als hij het in zijn hand heeft). */
  updateTrail() {
    super.updateTrail();
    const p = this.puppet;
    if (this.sheathed || !this.effects || !this.mesh.visible || Math.random() > (this.phase2 ? 0.5 : 0.25)) return;
    this.mesh.updateMatrixWorld(true);
    const base = new THREE.Vector3();
    const tip = new THREE.Vector3();
    p.sword.getBladeWorld(base, tip);
    this.effects.burst(base.lerp(tip, Math.random()), 0xffe066, { count: 1, speed: 1.2, size: 0.06, life: 0.25, up: 0.5, gravity: 0 });
  }
}

// Sky meldt zich aan bij de bosses: de arena met id 'sky' (in het Wolkenrijk) krijgt hem
BOSS_CLASSES.sky = SkyFighter;
