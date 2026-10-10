import * as THREE from 'three';
import { collidersNear } from './spatial.js';
import { play } from './audio.js';

// ======================================================================
// Vuurtand de draak: vlieg over de hele wereld!
// ======================================================================
// Je krijgt hem als je de eerste boss (Budget Mario) hebt verslagen. Druk dan op B: Vuurtand komt
// aanvliegen en je springt op zijn rug.
//   WASD  = vliegen (de kant op waar de camera kijkt)   Spatie = omhoog
//   Muis  = omhoog kijken is stijgen, omlaag kijken is dalen   Shift = extra snel
//   Klik / F = vuur spuwen   B = afstappen (ook hoog in de lucht: dan val je naar beneden)
// De draak durft niet in een boss-arena (bosses versla je zelf), en vijanden die hij verbrandt
// geven wel munten maar tellen niet mee voor je level: sterker worden doe je zelf!
// Hij is helemaal in code gebouwd uit simpele vormen (bollen, kegels, driehoeken).

export const DRAGON = {
  speed: 17, // vliegen (meter per seconde)
  boost: 30, // vliegen met Shift
  walk: 7, // lopen op de grond
  climb: 11, // omhoog met Spatie
  maxHeight: 42, // hoger kan hij niet
  fireRange: 14, // zo ver komt het vuur (hoog in de lucht verder: tot op de grond)
  fireCone: 0.8, // hoe breed het vuur is (cos van de halve hoek: 0.8 is ongeveer 37 graden)
  fireTime: 0.75, // zo lang spuwt hij vuur
  fireCost: 35, // vuur per keer spuwen (hij heeft er 100)
  fireRegen: 14, // zoveel vuur komt er per seconde terug
  radius: 1.7, // hoe dik (voor botsen tegen bomen en huizen)
};

const UP = new THREE.Vector3(0, 1, 0);
const tmp = new THREE.Vector3();
const tmp2 = new THREE.Vector3();

// Kleuren van de draak. Met sterren koop je een andere kleur in de sterrenwinkel; de Schaduwdraak (de eindbaas) is paars.
export const DRAGON_SKINS = {
  vuur: { name: 'Vuurrood', body: 0xb8261c, dark: 0x6e1410, belly: 0xf0b860, wing: 0x9a2318, bone: 0xf3ead2, eye: 0xffe14a, eyeGlow: 0xffb000 },
  ijs: { name: 'IJsblauw', body: 0x2a7ac8, dark: 0x123a6a, belly: 0xd8f4ff, wing: 0x3a90d8, bone: 0xffffff, eye: 0x9ffcff, eyeGlow: 0x30e8ff },
  goud: { name: 'Goud', body: 0xd8a01c, dark: 0x7a5410, belly: 0xfff0b0, wing: 0xe8b830, bone: 0xffffff, eye: 0xff6a20, eyeGlow: 0xff3a00 },
  schaduw: { name: 'Schaduw', body: 0x2a1238, dark: 0x120818, belly: 0x6a3a8a, wing: 0x4a1a6a, bone: 0xc8a8e8, eye: 0xd060ff, eyeGlow: 0xa020ff },
};

/** Het draken-model, helemaal van simpele vormen. De voorkant is +z. `withSaddle` = met een zadel (alleen Vuurtand). */
export function buildDragon(skin = DRAGON_SKINS.vuur, withSaddle = true) {
  const root = new THREE.Group(); // plek en richting
  const body = new THREE.Group(); // kantelt bij het vliegen (neus omhoog/omlaag, schuin in de bocht)
  root.add(body);
  const mat = (color, extra = {}) => new THREE.MeshStandardMaterial({ color, roughness: 0.6, flatShading: true, ...extra });
  const red = mat(skin.body, { metalness: 0.1 });
  const dark = mat(skin.dark);
  const belly = mat(skin.belly, { roughness: 0.7 });
  const bone = mat(skin.bone, { roughness: 0.5 });
  const wingMat = mat(skin.wing, { side: THREE.DoubleSide, roughness: 0.75 });
  const leather = mat(0x5a3a22, { roughness: 0.85 });
  const gold = mat(0xe0b040, { metalness: 0.6, roughness: 0.35 });
  const eyeMat = new THREE.MeshStandardMaterial({ color: skin.eye, emissive: skin.eyeGlow, emissiveIntensity: 2.2 });
  const ball = new THREE.IcosahedronGeometry(1, 1);
  const add = (parent, geo, material, [x, y, z], [sx, sy, sz] = [1, 1, 1], [rx, ry, rz] = [0, 0, 0]) => {
    const m = new THREE.Mesh(geo, material);
    m.position.set(x, y, z);
    m.scale.set(sx, sy, sz);
    m.rotation.set(rx, ry, rz);
    m.castShadow = true;
    parent.add(m);
    return m;
  };

  // Lijf met een gele buik
  add(body, ball, red, [0, 2.3, 0], [1.15, 1.0, 2.0]);
  add(body, ball, belly, [0, 1.95, 0.15], [0.95, 0.8, 1.75]);
  // Stekels op de rug (niet waar het zadel zit)
  const spike = new THREE.ConeGeometry(0.16, 0.55, 5);
  for (const z of [-1.7, -1.2, 1.25, 1.7]) add(body, spike, bone, [0, 2.3 + Math.sqrt(1 - (z / 2.05) ** 2) * 0.98, z], [1, 1, 1], [-0.3, 0, 0]);
  // Nek: drie stukjes schuin omhoog naar voren
  for (let i = 0; i < 3; i++) add(body, ball, red, [0, 2.75 + i * 0.45, 1.75 + i * 0.5], [0.58 - i * 0.05, 0.55, 0.72]);
  for (let i = 0; i < 3; i++) add(body, spike, bone, [0, 3.25 + i * 0.45, 1.6 + i * 0.5], [0.7, 0.7, 0.7], [-0.5, 0, 0]);

  // Kop met hoorns, gloeiende ogen en een bek die open kan
  const head = new THREE.Group();
  head.position.set(0, 4.15, 3.35);
  body.add(head);
  add(head, ball, red, [0, 0, 0], [0.62, 0.55, 0.78]);
  add(head, new THREE.BoxGeometry(0.72, 0.38, 0.95), red, [0, -0.08, 0.75]);
  const jaw = new THREE.Group();
  jaw.position.set(0, -0.28, 0.3);
  head.add(jaw);
  add(jaw, new THREE.BoxGeometry(0.62, 0.16, 0.9), dark, [0, -0.05, 0.42]);
  const tooth = new THREE.ConeGeometry(0.05, 0.18, 4);
  for (const s of [-1, 1]) for (const z of [0.7, 1.05]) add(head, tooth, bone, [s * 0.27, -0.33, z], [1, 1, 1], [Math.PI, 0, 0]);
  for (const s of [-1, 1]) {
    add(head, new THREE.ConeGeometry(0.13, 0.95, 6), bone, [s * 0.3, 0.42, -0.42], [1, 1, 1], [-2.15, 0, s * -0.3]);
    add(head, new THREE.SphereGeometry(0.11, 8, 6), eyeMat, [s * 0.36, 0.14, 0.38]);
    add(head, new THREE.ConeGeometry(0.06, 0.25, 4), bone, [s * 0.2, 0.2, 1.05], [1, 1, 1], [-0.6, 0, 0]); // neushoorntjes
  }
  const mouth = new THREE.Object3D(); // hier komt het vuur uit
  mouth.position.set(0, -0.25, 1.3);
  head.add(mouth);

  // Staart: zeven stukjes die steeds kleiner worden; elk hangt aan het vorige (dan kan hij golven)
  const tail = [];
  let parent = body;
  for (let i = 0; i < 7; i++) {
    const seg = new THREE.Group();
    seg.position.set(0, i === 0 ? 2.2 : 0, i === 0 ? -1.75 : -0.62);
    parent.add(seg);
    const r = 0.5 * (1 - i * 0.11);
    add(seg, ball, red, [0, 0, -0.3], [r, r * 0.9, 0.48]);
    if (i % 2 === 0) add(seg, spike, bone, [0, r * 0.85, -0.3], [0.7, 0.7, 0.7], [-0.4, 0, 0]);
    tail.push(seg);
    parent = seg;
  }
  add(parent, new THREE.ConeGeometry(0.35, 0.7, 4), dark, [0, 0, -0.85], [1, 0.35, 1], [-Math.PI / 2, 0, 0]); // pijlpunt aan het eind

  // Vier poten met klauwen
  const legs = [];
  for (const [x, z] of [[-0.72, 1.0], [0.72, 1.0], [-0.72, -1.0], [0.72, -1.0]]) {
    const leg = new THREE.Group();
    leg.position.set(x, 1.75, z);
    body.add(leg);
    add(leg, new THREE.CylinderGeometry(0.3, 0.2, 1.4, 7), red, [0, -0.6, 0]);
    add(leg, new THREE.BoxGeometry(0.45, 0.22, 0.6), dark, [0, -1.35, 0.12]);
    for (const cx of [-0.14, 0, 0.14]) add(leg, new THREE.ConeGeometry(0.05, 0.2, 4), bone, [cx, -1.4, 0.48], [1, 1, 1], [Math.PI / 2, 0, 0]);
    legs.push(leg);
  }

  // Vleugels: botten met vlies ertussen. Ze draaien om de schouder (op en neer flappen).
  const wings = [];
  for (const s of [-1, 1]) {
    const wing = new THREE.Group();
    wing.position.set(s * 0.85, 3.0, 0.7);
    body.add(wing);
    const O = [0, 0, 0];
    const A = [s * 2.2, 0.45, 0.35]; // elleboog
    const B = [s * 4.9, 0.25, -0.5]; // punt
    const C = [s * 3.8, 0, -1.9];
    const D = [s * 2.4, 0, -2.4];
    const E = [s * 0.8, 0, -1.7];
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute([...O, ...A, ...B, ...O, ...B, ...C, ...O, ...C, ...D, ...O, ...D, ...E, ...A, ...C, ...D].flat(), 3));
    geo.computeVertexNormals();
    const membrane = new THREE.Mesh(geo, wingMat);
    membrane.castShadow = true;
    wing.add(membrane);
    // Botten langs de rand (dunne cilinders van punt naar punt)
    const boneBetween = (p, q, thick) => {
      const a = new THREE.Vector3(...p);
      const b = new THREE.Vector3(...q);
      const len = a.distanceTo(b);
      const m = add(wing, new THREE.CylinderGeometry(thick * 0.7, thick, len, 6), dark, [0, 0, 0]);
      m.position.copy(a).add(b).multiplyScalar(0.5);
      m.quaternion.setFromUnitVectors(UP, b.clone().sub(a).normalize());
    };
    boneBetween(O, A, 0.16);
    boneBetween(A, B, 0.11);
    boneBetween(A, C, 0.06);
    boneBetween(A, D, 0.06);
    add(wing, new THREE.ConeGeometry(0.08, 0.35, 4), bone, A, [1, 1, 1], [0, 0, s * -1.2]); // klauwtje op de elleboog
    wings.push({ group: wing, side: s });
  }

  // Zadel met gouden knop (de speler zit erop)
  if (withSaddle) {
    add(body, new THREE.BoxGeometry(1.05, 0.22, 1.15), leather, [0, 3.22, 0.3]);
    add(body, new THREE.BoxGeometry(1.3, 0.06, 0.18), leather, [0, 3.05, 0.3], [1, 1, 1], [0, 0, 0]);
    add(body, new THREE.SphereGeometry(0.11, 8, 6), gold, [0, 3.42, 0.85]);
  }
  const saddle = new THREE.Object3D();
  saddle.position.set(0, 3.33, 0.25);
  body.add(saddle);

  root.traverse((c) => {
    if (c.isMesh) c.userData.noAO = true;
  });
  return { root, body, head, jaw, mouth, tail, legs, wings, saddle, materials: { body: red, dark, belly, bone, wing: wingMat, eye: eyeMat } };
}

/** Andere kleuren voor een draak (zie DRAGON_SKINS). */
export function paintDragon(parts, skin) {
  const m = parts.materials;
  m.body.color.set(skin.body);
  m.dark.color.set(skin.dark);
  m.belly.color.set(skin.belly);
  m.bone.color.set(skin.bone);
  m.wing.color.set(skin.wing);
  m.eye.color.set(skin.eye);
  m.eye.emissive.set(skin.eyeGlow);
}

/**
 * Vleugels flappen, staart golven, poten lopen of intrekken, bek open bij vuur.
 * `self` heeft: parts, time, flapPhase, velocity, breathing (de rijdraak én de Schaduwdraak gebruiken dit).
 */
export function animateDragon(self, dt, flying, speed, sounds = true) {
  const { wings, tail, legs, jaw, head } = self.parts;
  if (flying) {
    // Sneller flappen bij omhoog gaan, rustig zweven als hij snel vliegt
    const rate = self.velocity.y > 2 ? 9 : speed > 20 ? 4.5 : 6.5;
    const before = Math.sin(self.flapPhase);
    self.flapPhase += dt * rate;
    const flap = Math.sin(self.flapPhase);
    for (const w of wings) {
      w.group.rotation.z = w.side * (0.25 + flap * 0.75);
      w.group.rotation.y = w.side * 0.1;
    }
    if (sounds && before > 0 && flap <= 0) play('flap'); // bij elke neerwaartse slag
    // Op en neer deinen met de vleugelslag
    self.parts.body.position.y = -flap * 0.18;
  } else {
    // Op de grond: vleugels ingeklapt
    for (const w of wings) {
      w.group.rotation.z += (w.side * -0.55 - w.group.rotation.z) * Math.min(1, 6 * dt);
      w.group.rotation.y += (w.side * 0.9 - w.group.rotation.y) * Math.min(1, 6 * dt); // naar achteren gevouwen
    }
    self.parts.body.position.y = 0;
  }
  // Staart golft
  tail.forEach((seg, i) => {
    seg.rotation.y = Math.sin(self.time * 2.4 - i * 0.6) * 0.16;
    seg.rotation.x = (flying ? 0.05 : -0.08) + Math.sin(self.time * 1.7 - i * 0.5) * 0.05;
  });
  // Poten: lopen op de grond, ingetrokken in de lucht
  const walk = !flying && speed > 0.5;
  legs.forEach((leg, i) => {
    const pair = i === 0 || i === 3 ? 0 : Math.PI; // schuin tegenover elkaar stappen samen (zoals een hond)
    const goal = flying ? -0.9 : walk ? Math.sin(self.time * 9 + pair) * 0.5 : 0;
    leg.rotation.x += (goal - leg.rotation.x) * Math.min(1, 10 * dt);
  });
  // Bek open bij vuur spuwen, kop een beetje omlaag
  const open = self.breathing > 0 ? 0.55 : 0;
  jaw.rotation.x += (open - jaw.rotation.x) * Math.min(1, 14 * dt);
  head.rotation.x += ((self.breathing > 0 ? 0.25 : 0) + Math.sin(self.time * 1.3) * 0.04 - head.rotation.x) * Math.min(1, 8 * dt);
}

export class Dragon {
  constructor(scene, skin = 'vuur') {
    this.parts = buildDragon(DRAGON_SKINS[skin] ?? DRAGON_SKINS.vuur);
    this.mesh = this.parts.root;
    this.mesh.visible = false;
    scene.add(this.mesh);
    this.state = 'weg'; // weg | komt | rijden | vertrekt
    this.velocity = new THREE.Vector3();
    this.fire = 100; // vuur in de buik (0 - 100)
    this.breathing = 0; // > 0: spuwt nu vuur
    this.breathTick = 0;
    this.breathId = 0;
    this.time = 0;
    this.flapPhase = 0;
    this.flapLoud = 0; // voor het vleugelgeluid
    this.yaw = 0;
    this.pitch = 0;
    this.roll = 0;
    this.blocked = 0; // > 0: net tegen een arena aan gevlogen (voor het berichtje)
  }

  get position() {
    return this.mesh.position;
  }

  get riding() {
    return this.state === 'rijden';
  }

  /** Is hij er (aan het komen, rijden of weggaan)? */
  get active() {
    return this.state !== 'weg';
  }

  /** Waar de speler zit (in de wereld). */
  saddlePosition(target = new THREE.Vector3()) {
    this.mesh.updateMatrixWorld(true);
    return this.parts.saddle.getWorldPosition(target);
  }

  /** Waar het vuur uit komt, en welke kant het op gaat. */
  mouthPosition(target = new THREE.Vector3()) {
    this.mesh.updateMatrixWorld(true);
    return this.parts.mouth.getWorldPosition(target);
  }

  /** Het vuur mikt op de grond een stukje voor de draak: hoe hoger hij vliegt, hoe steiler naar beneden. */
  breathDirection(target = new THREE.Vector3()) {
    const mouth = this.mouthPosition(tmp);
    const ahead = 5 + this.position.y * 0.7; // zo ver voor de draak komt het vuur op de grond
    const groundY = this.position.y > 1 ? 0 : 0.8; // op de grond: recht vooruit (op borsthoogte)
    return target.set(this.position.x + Math.sin(this.yaw) * ahead, groundY, this.position.z + Math.cos(this.yaw) * ahead).sub(mouth).normalize();
  }

  /** Hoe ver het vuur komt: tot op de grond, ook als hij hoog vliegt. */
  get fireRange() {
    return DRAGON.fireRange + this.position.y * 1.2;
  }

  /** Roep de draak: hij vliegt van achter de speler aan en landt naast hem (groundY = hoe hoog de grond daar is, bijv. op een luchteiland). */
  summon(playerPos, facingYaw, groundY = 0) {
    if (this.active) return false;
    const back = new THREE.Vector3(-Math.sin(facingYaw), 0, -Math.cos(facingYaw));
    const side = new THREE.Vector3(Math.cos(facingYaw), 0, -Math.sin(facingYaw));
    this.landAt = playerPos.clone().addScaledVector(side, groundY > 0 ? 1.5 : 3.2).setY(groundY);
    this.from = this.landAt.clone().addScaledVector(back, 45).setY(groundY + 28);
    this.position.copy(this.from);
    this.yaw = facingYaw;
    this.velocity.set(0, 0, 0);
    this.t = 0;
    this.state = 'komt';
    this.mesh.visible = true;
    play('roar');
    return true;
  }

  /** Klaar met aanvliegen? Dan kan de speler erop springen. */
  get arrived() {
    return this.state === 'komt' && this.t >= 2.2;
  }

  mount() {
    this.state = 'rijden';
    this.velocity.set(0, 0, 0);
  }

  /** Afstappen: de draak vliegt omhoog en weg. */
  dismiss() {
    if (!this.riding && this.state !== 'komt') return;
    this.state = 'vertrekt';
    this.t = 0;
    this.velocity.set(Math.sin(this.yaw) * 10, 9, Math.cos(this.yaw) * 10);
    this.breathing = 0;
    play('flap');
  }

  /** Een andere kleur (uit de sterrenwinkel). */
  setSkin(key) {
    paintDragon(this.parts, DRAGON_SKINS[key] ?? DRAGON_SKINS.vuur);
  }

  /** Meteen weg (bijvoorbeeld bij snelreizen). */
  hide() {
    this.state = 'weg';
    this.mesh.visible = false;
    this.breathing = 0;
  }

  /** Vuur spuwen (als er genoeg vuur in zijn buik zit). */
  breathe() {
    if (!this.riding || this.breathing > 0 || this.fire < DRAGON.fireCost) return false;
    this.fire -= DRAGON.fireCost;
    this.breathing = DRAGON.fireTime;
    this.breathTick = 0;
    play('breath');
    return true;
  }

  /**
   * Elke frame. ctrl = { move: Vector3 (plat, wereldrichting), up, boost, pitch (van de camera) } — alleen bij rijden.
   * world = { colliders, bounds, arenas: [{ center, radius, closed }] }
   * Geeft true terug als het vuur deze frame iets mag raken (een "tik").
   */
  update(dt, ctrl, world, effects) {
    if (this.state === 'weg') return false;
    this.time += dt;
    this.fire = Math.min(100, this.fire + DRAGON.fireRegen * dt);
    let flying = true;
    if (this.state === 'komt') {
      // Een bocht van ver weg in de lucht naar de landingsplek
      this.t += dt;
      const k = Math.min(1, this.t / 2.2);
      const e = 1 - (1 - k) ** 3; // eerst snel, dan rustig landen
      const prev = this.position.clone();
      this.position.lerpVectors(this.from, this.landAt, e);
      this.position.y = THREE.MathUtils.lerp(this.from.y, this.landAt.y, 1 - (1 - k) ** 2);
      this.velocity.copy(this.position).sub(prev).divideScalar(Math.max(dt, 1e-3));
      flying = k < 0.97;
    } else if (this.state === 'vertrekt') {
      this.t += dt;
      this.velocity.y += 4 * dt;
      this.position.addScaledVector(this.velocity, dt);
      if (this.t > 4) {
        this.state = 'weg';
        this.mesh.visible = false;
        return false;
      }
    } else if (this.state === 'rijden') {
      flying = this.ride(dt, ctrl, world);
    }

    // Kijkrichting volgt de vliegrichting
    const flat = Math.hypot(this.velocity.x, this.velocity.z);
    let turn = 0;
    if (flat > 1) {
      const goal = Math.atan2(this.velocity.x, this.velocity.z);
      turn = Math.atan2(Math.sin(goal - this.yaw), Math.cos(goal - this.yaw));
      this.yaw += turn * Math.min(1, 4 * dt);
    }
    // Neus omhoog/omlaag en schuin hangen in de bocht
    const goalPitch = flying ? -Math.atan2(this.velocity.y, Math.max(flat, 4)) * 0.8 : 0;
    const goalRoll = flying ? THREE.MathUtils.clamp(-turn * 0.9, -0.6, 0.6) : 0;
    this.pitch += (goalPitch - this.pitch) * Math.min(1, 5 * dt);
    this.roll += (goalRoll - this.roll) * Math.min(1, 4 * dt);
    this.mesh.rotation.set(0, this.yaw, 0);
    this.parts.body.rotation.set(this.pitch, 0, this.roll);
    this.animate(dt, flying, flat);

    // Vuur spuwen: vlammen uit de bek, en elke 0,18 s een "tik" die vijanden raakt
    let tick = false;
    if (this.breathing > 0) {
      this.breathing -= dt;
      this.breathTick -= dt;
      const dir = this.breathDirection(tmp2);
      const mouth = this.mouthPosition(tmp);
      const speed = 22 + this.position.y * 1.6; // hoog in de lucht moeten de vlammen verder
      effects.burst(mouth, Math.random() < 0.5 ? 0xff6a1a : 0xffc23a, { count: 6, speed, size: 0.35, life: 0.6, up: 0, gravity: 0.05, dir, spread: 0.3 });
      if (Math.random() < 0.5) effects.burst(mouth, 0x3a2a2a, { count: 1, speed: speed * 0.45, size: 0.5, life: 0.8, up: 2, gravity: -0.1, dir, spread: 0.4 });
      if (this.breathTick <= 0) {
        this.breathTick = 0.18;
        this.breathId++;
        tick = true;
      }
    }
    return tick;
  }

  /** Besturen tijdens het rijden. Geeft terug of hij vliegt (niet op de grond staat). */
  ride(dt, ctrl, world) {
    const pos = this.position;
    const moving = ctrl.move.lengthSq() > 0.01;
    // De grond: meestal 0, maar bovenop een luchteiland (islands.js) hoger
    const ground = world.groundAt ? world.groundAt(pos.x, pos.z, pos.y) : 0;
    const onGround = pos.y <= ground + 0.02;
    const flying = !onGround || ctrl.up;
    // Horizontaal: rustig optrekken en afremmen
    const speed = !moving ? 0 : flying ? (ctrl.boost ? DRAGON.boost : DRAGON.speed) : DRAGON.walk;
    tmp.copy(ctrl.move).setY(0);
    if (moving) tmp.normalize().multiplyScalar(speed);
    const accel = moving ? 2.2 : 1.6;
    this.velocity.x += (tmp.x - this.velocity.x) * Math.min(1, accel * dt);
    this.velocity.z += (tmp.z - this.velocity.z) * Math.min(1, accel * dt);
    // Verticaal: Spatie = omhoog, omlaag kijken = dalen, niks doen = langzaam zakken
    let vy = 0;
    if (ctrl.up) vy += DRAGON.climb;
    if (moving && !onGround) vy += -(ctrl.pitch - 0.45) * 18;
    if (!moving && !ctrl.up && !onGround) vy -= 3;
    vy = THREE.MathUtils.clamp(vy, -15, DRAGON.climb + 2);
    this.velocity.y += (vy - this.velocity.y) * Math.min(1, 3 * dt);
    pos.addScaledVector(this.velocity, dt);
    if (pos.y <= ground) {
      pos.y = ground;
      this.velocity.y = Math.max(0, this.velocity.y);
    }
    if (pos.y > DRAGON.maxHeight) {
      pos.y = DRAGON.maxHeight;
      this.velocity.y = Math.min(0, this.velocity.y);
    }
    // Niet buiten de wereld
    pos.x = THREE.MathUtils.clamp(pos.x, -world.bounds.x, world.bounds.x);
    pos.z = THREE.MathUtils.clamp(pos.z, -world.bounds.z, world.bounds.z);
    // Niet door bomen, huizen en muren (als een bol rond zijn lijf)
    const center = tmp.set(pos.x, pos.y + 2.2, pos.z);
    for (const box of collidersNear(world.colliders, pos.x, pos.z, DRAGON.radius + 1, (this.nearList ??= []))) {
      if (box.max.y < pos.y + 0.6) continue; // eronder: daar vliegt hij overheen
      const near = box.clampPoint(center, tmp2);
      const d = near.distanceTo(center);
      if (d >= DRAGON.radius) continue;
      if (d < 1e-4) {
        pos.y = box.max.y + 0.1; // helemaal erin: er bovenop
        continue;
      }
      const push = center.clone().sub(near).setLength(DRAGON.radius - d);
      pos.add(push);
      center.add(push);
    }
    // Niet in een boss-arena waar de boss nog leeft
    this.blocked = Math.max(0, this.blocked - dt);
    for (const a of world.arenas) {
      if (!a.closed) continue;
      const dx = pos.x - a.center.x;
      const dz = pos.z - a.center.z;
      const d = Math.hypot(dx, dz);
      const min = a.radius + 4;
      if (d < min && pos.y < 30) {
        const k = min / Math.max(d, 0.01);
        pos.x = a.center.x + dx * k;
        pos.z = a.center.z + dz * k;
        if (this.blocked <= 0) this.justBlocked = true;
        this.blocked = 3;
      }
    }
    return pos.y > ground + 0.02;
  }

  animate(dt, flying, speed) {
    animateDragon(this, dt, flying, speed);
  }

  /** Raakt het vuur dit punt? (binnen bereik en in de vuurkegel) */
  inBreath(point) {
    const dir = this.breathDirection(new THREE.Vector3());
    const to = this.mouthPosition(tmp2).negate().add(point);
    const d = to.length();
    if (d > this.fireRange || d < 0.01) return false;
    return to.divideScalar(d).dot(dir) > DRAGON.fireCone;
  }
}
