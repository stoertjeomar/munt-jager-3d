import * as THREE from 'three';
import { clone as cloneSkinned } from 'three/addons/utils/SkeletonUtils.js';
import { loadGLB } from './assets.js';

// ======================================================================
// Echte animaties op de held (slaan, dash, springen, landen, drinken, ...)
// ======================================================================
// De animaties komen uit de Universal Animation Library 2 van Quaternius (CC0): opgenomen bewegingen
// van een houten etalagepop. Die pop heeft een ander skelet dan Eve en de Soldaat (Mixamo).
// Daarom "vertalen" we elke beweging: een onzichtbare pop speelt de animatie af, en wij kijken
// per bot hoeveel het gedraaid is vanuit de T-pose. Precies die draaiing geven we aan hetzelfde bot van de held.
// Zo blijft lopen en rennen van onze eigen animator (animator.js), en mengen we de echte beweging erdoorheen
// als je iets doet (weight 0 = alleen onze animator, 1 = alleen de echte animatie).

const FILE = 'models/extra/pop.glb';

// Bot van de pop → bot van Mixamo. Op volgorde: eerst de ouder, dan het kind.
const MAP = [
  ['pelvis', 'Hips'], ['spine_01', 'Spine'], ['spine_02', 'Spine1'], ['spine_03', 'Spine2'], ['neck_01', 'Neck'], ['Head', 'Head'],
  ['clavicle_l', 'LeftShoulder'], ['upperarm_l', 'LeftArm'], ['lowerarm_l', 'LeftForeArm'], ['hand_l', 'LeftHand'],
  ['clavicle_r', 'RightShoulder'], ['upperarm_r', 'RightArm'], ['lowerarm_r', 'RightForeArm'], ['hand_r', 'RightHand'],
  ['thigh_l', 'LeftUpLeg'], ['calf_l', 'LeftLeg'], ['foot_l', 'LeftFoot'], ['ball_l', 'LeftToeBase'],
  ['thigh_r', 'RightUpLeg'], ['calf_r', 'RightLeg'], ['foot_r', 'RightFoot'], ['ball_r', 'RightToeBase'],
];

// Welke botten doen mee (en hoe sterk) — bijv. 'upper' als je tijdens het lopen slaat: de benen blijven lopen
const UPPER = { Spine: 0.35, Spine1: 0.7, Spine2: 1, Neck: 1, Head: 1, LeftShoulder: 1, LeftArm: 1, LeftForeArm: 1, LeftHand: 1, RightShoulder: 1, RightArm: 1, RightForeArm: 1, RightHand: 1 };
export const MASKS = {
  full: Object.fromEntries(MAP.map(([, t]) => [t, 1])),
  upper: UPPER,
  // Alleen de rechterarm (met het wapen) en een beetje bovenlijf
  arm: { Spine1: 0.3, Spine2: 0.5, RightShoulder: 1, RightArm: 1, RightForeArm: 1, RightHand: 1 },
};

const Q = () => new THREE.Quaternion();
const V = () => new THREE.Vector3();

/** Een draaiing die de assen (links, omhoog) van een personage beschrijft. */
function frameOf(left, up) {
  const y = up.clone().normalize();
  const x = left.clone().addScaledVector(y, -left.dot(y)).normalize();
  const z = V().crossVectors(x, y);
  return Q().setFromRotationMatrix(new THREE.Matrix4().makeBasis(x, y, z));
}

export class ClipPlayer {
  /** Laadt de pop met animaties en maakt een ClipPlayer voor dit skelet (zie mixamo.js). */
  static async create(skeleton) {
    const gltf = await loadGLB(FILE);
    return new ClipPlayer(skeleton, gltf);
  }

  constructor(skeleton, gltf) {
    this.sk = skeleton;
    this.clips = Object.fromEntries(gltf.animations.map((c) => [c.name, c]));
    // De onzichtbare pop (zit niet in de scene)
    this.src = cloneSkinned(gltf.scene);
    this.mixer = new THREE.AnimationMixer(this.src);
    this.action = null; // de animatie die de pop nu afspeelt
    this.actionName = null;
    this.srcBone = {};
    this.tgtBone = {};
    this.pairs = [];
    for (const [s, t] of MAP) {
      const sb = this.src.getObjectByName(s);
      const tb = skeleton.bone(t);
      if (!sb || !tb || !skeleton.restAll[t]) continue;
      this.srcBone[t] = sb;
      this.tgtBone[t] = tb;
      this.pairs.push(t);
    }
    this.ok = this.pairs.includes('Hips') && this.pairs.includes('RightHand') && Boolean(this.clips.A_TPose);

    // T-pose van de pop: zo staan de botten "in rust"
    const refS = {};
    const refPos = {};
    if (this.ok) {
      this.sample('A_TPose', 0);
      for (const t of this.pairs) {
        refS[t] = this.srcBone[t].getWorldQuaternion(Q());
        refPos[t] = this.srcBone[t].getWorldPosition(V());
      }
      // Hoe staat de pop t.o.v. de held? (links en omhoog vergelijken)
      const tgtPos = skeleton.restPos;
      const fs = frameOf(refPos.LeftHand.clone().sub(refPos.RightHand), refPos.Head.clone().sub(refPos.Hips));
      const ft = frameOf(tgtPos.LeftHand.clone().sub(tgtPos.RightHand), tgtPos.Head.clone().sub(tgtPos.Hips));
      this.C = ft.multiply(fs.invert());
      // Grootteverschil (beenlengte), voor het op en neer gaan van de heupen
      const legS = refPos.Hips.y - Math.min(refPos.LeftFoot.y, refPos.RightFoot.y);
      const legT = tgtPos.Hips.y - Math.min(tgtPos.LeftFoot.y, tgtPos.RightFoot.y);
      this.ratio = legT / Math.max(1e-3, legS);
    }
    this.refHips = refPos.Hips;
    // Per bot vooraf uitrekenen: draaiing = C · popNu · (popRust⁻¹ · C⁻¹), en dan doel = draaiing · heldRust
    const Cinv = this.C?.clone().invert();
    this.pre = {};
    if (this.ok) for (const t of this.pairs) this.pre[t] = refS[t].clone().invert().multiply(Cinv);
    // Spiegelen (links ↔ rechts), bijv. drinken met je linkerhand omdat je zwaard rechts zit
    this.side = skeleton.restPos.LeftHand.clone().sub(skeleton.restPos.RightHand).normalize();
    this.partner = Object.fromEntries(this.pairs.map((t) => [t, t.replace(/^Left|^Right/, (m) => (m === 'Left' ? 'Right' : 'Left'))]));
    this.delta = {};
    for (const t of this.pairs) this.delta[t] = Q();
    this.nameOf = new Map(this.pairs.map((t) => [this.tgtBone[t], t]));

    this.model = skeleton.model;
    this.basePos = this.model.position.clone();
    this.weight = 0; // hoe sterk de echte animatie nu meedoet (vloeit soepel)
    this.current = null; // { name, time, mask, root, weight }
    this.from = null; // vorige houding (om soepel van de ene naar de andere animatie te gaan)
    this.fromWeight = 0;
    this.clipQ = {};
    for (const t of this.pairs) this.clipQ[t] = Q();
    this.clipHand = Q();
    this.rootOffset = V();
  }

  /** Hoe lang een animatie duurt (seconden). */
  duration(name) {
    return this.clips[name]?.duration ?? 0;
  }

  has(name) {
    return Boolean(this.clips[name]);
  }

  /** Zet de onzichtbare pop in de houding van animatie `name` op `time` seconden. */
  sample(name, time) {
    if (this.actionName !== name) {
      this.action?.stop();
      this.action = this.mixer.clipAction(this.clips[name]);
      this.action.play();
      this.actionName = name;
    }
    this.action.time = THREE.MathUtils.clamp(time, 0, this.clips[name].duration - 1e-4);
    this.mixer.update(0);
    this.src.updateMatrixWorld(true);
  }

  /** Een draaiing in de spiegel (links en rechts omgewisseld). */
  mirrorQ(q) {
    const n = this.side;
    const v = V().set(q.x, q.y, q.z);
    v.addScaledVector(n, -2 * v.dot(n));
    return Q().set(-v.x, -v.y, -v.z, q.w);
  }

  /**
   * Elke frame, ná de gewone animator (rig.apply()).
   * @param {number} dt
   * @param {object|null} want  { name, time (s), weight (0..1), mask ('full'|'upper'|'arm'), root ('all'|'down'|'none'), mirror, keepWeapon, fadeIn, fadeOut } of null
   */
  apply(dt, want) {
    if (!this.ok) return;
    const sk = this.sk;
    // Overvloeien
    const target = want ? want.weight ?? 1 : 0;
    const speed = target > this.weight ? 1 / Math.max(0.01, want?.fadeIn ?? 0.08) : 1 / Math.max(0.01, this.current?.fadeOut ?? 0.15);
    this.weight += Math.sign(target - this.weight) * Math.min(Math.abs(target - this.weight), speed * dt);
    if (want && (!this.current || want.name !== this.current.name || want.restart)) {
      // Nieuwe animatie: onthoud de oude houding zodat we er soepel uit komen
      if (this.current && this.weight > 0.05) {
        this.from = Object.fromEntries(this.pairs.map((t) => [t, this.clipQ[t].clone()]));
        this.fromHand = this.clipHand.clone();
        this.fromRoot = this.rootOffset.clone();
        this.fromWeight = 1;
      }
      this.current = { ...want };
    } else if (want) Object.assign(this.current, want);
    this.fromWeight = Math.max(0, this.fromWeight - dt / 0.12);
    if (this.weight <= 1e-3 || !this.current) {
      this.weight = 0;
      this.model.position.x = this.basePos.x;
      this.model.position.z = this.basePos.z;
      return;
    }

    // 1. De pop in de goede houding, en per bot uitrekenen hoe het bij de held moet staan
    const cur = this.current;
    this.sample(cur.name, cur.time);
    for (const t of this.pairs) this.delta[t].copy(this.C).multiply(this.srcBone[t].getWorldQuaternion(Q())).multiply(this.pre[t]);
    for (const t of this.pairs) {
      const d = cur.mirror ? this.mirrorQ(this.delta[this.partner[t]] ?? this.delta[t]) : this.delta[t];
      const q = this.clipQ[t].copy(d).multiply(sk.restAll[t]);
      if (this.from && this.fromWeight > 0) q.slerp(this.from[t], this.fromWeight);
    }
    // Het wapen: draait mee met de hand van de pop (de pop houdt zijn zwaard net als de Ninjapop).
    // Gespiegeld houdt de pop niks vast in die hand: dan blijft het wapen gewoon in je hand zitten zoals het zat.
    this.clipHand.copy(this.C).multiply(this.srcBone.RightHand.getWorldQuaternion(Q()));
    if (this.from && this.fromWeight > 0) this.clipHand.slerp(this.fromHand, this.fromWeight);
    // Heupen: hoeveel zakt (of verschuift) de pop t.o.v. rechtop staan?
    const hipNow = this.srcBone.Hips.getWorldPosition(V()).sub(this.refHips).applyQuaternion(this.C).multiplyScalar(this.ratio);
    if (cur.mirror) hipNow.addScaledVector(this.side, -2 * hipNow.dot(this.side));
    const root = cur.root ?? 'all';
    if (root === 'none') hipNow.set(0, 0, 0);
    if (root === 'down') hipNow.set(0, Math.min(0, hipNow.y), 0);
    hipNow.x = THREE.MathUtils.clamp(hipNow.x, -0.4, 0.4);
    hipNow.z = THREE.MathUtils.clamp(hipNow.z, -0.6, 0.6);
    this.rootOffset.copy(hipNow);
    if (this.from && this.fromWeight > 0) this.rootOffset.lerp(this.fromRoot, this.fromWeight);

    // 2. Mengen met wat onze animator al had gedaan (in personage-ruimte, ouder voor kind)
    const mask = MASKS[cur.mask ?? 'full'];
    const w = this.weight;
    const proc = {};
    const now = {};
    const hipsParent = sk.charQ(this.tgtBone.Hips.parent);
    for (const t of this.pairs) {
      const b = this.tgtBone[t];
      const parentProc = t === 'Hips' ? hipsParent : proc[this.nameOf.get(b.parent)] ?? sk.charQ(b.parent);
      proc[t] = parentProc.clone().multiply(b.quaternion);
    }
    // Alleen het bovenlijf? Dan draaien we de houding van de pop mee met onze eigen heupen
    // (anders staat je bovenlijf scheef als de pop met zijn heupen draait)
    const rel = mask.Hips ? null : proc.Hips.clone().multiply(this.clipQ.Hips.clone().invert());
    for (const t of this.pairs) {
      const b = this.tgtBone[t];
      const parentNow = t === 'Hips' ? hipsParent : now[this.nameOf.get(b.parent)] ?? sk.charQ(b.parent);
      const k = w * (mask[t] ?? 0);
      if (k <= 0) {
        now[t] = parentNow.clone().multiply(b.quaternion);
        continue;
      }
      const want = rel ? rel.clone().multiply(this.clipQ[t]) : this.clipQ[t];
      now[t] = proc[t].clone().slerp(want, k);
      b.quaternion.copy(parentNow.clone().invert().multiply(now[t]));
    }
    // Wapen in de hand
    const kh = cur.mirror || cur.keepWeapon ? 0 : w * (mask.RightHand ?? 0);
    if (kh > 0) {
      const local = now.RightHand.clone().invert().multiply(rel ? rel.clone().multiply(this.clipHand) : this.clipHand);
      sk.handFrame.quaternion.slerp(local, kh);
    }
    // Heupen omhoog/omlaag/opzij
    const off = this.rootOffset.clone().multiplyScalar(w * (mask.Hips ?? 0)).applyQuaternion(this.model.quaternion);
    this.model.position.x = this.basePos.x + off.x;
    this.model.position.y += off.y;
    this.model.position.z = this.basePos.z + off.z;
    this.model.updateMatrixWorld(true);
  }
}
