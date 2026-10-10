import * as THREE from 'three';

// Mixamo-personages hebben een echt skelet (botten), en staan in een T-pose (armen opzij).
// Onze animator (animator.js) denkt in "armen hangen naar beneden" en draait gewoon armen en benen.
// Deze vertaler zet die draaiingen om naar de echte botten van een Mixamo-skelet.

const Q = () => new THREE.Quaternion();
const tmpQ = Q();
const tmpE = new THREE.Euler();
// Hulp-draaiingen die we steeds opnieuw gebruiken (elke frame nieuwe maken geeft veel opruimwerk voor de browser)
const tq = [Q(), Q(), Q(), Q()];
const tmpWorldQ = Q();

/**
 * @param {THREE.Object3D} model  het geladen model (al geschaald en in de scene)
 * @returns rig voor animator.js, met een extra apply() die je elke frame na de animator aanroept
 */
export function createMixamoRig(model) {
  const bone = (name) => model.getObjectByName(`mixamorig${name}`) ?? model.getObjectByName(`mixamorig:${name}`);
  const bones = {
    spine: bone('Spine'),
    armL: bone('LeftArm'),
    armR: bone('RightArm'),
    legL: bone('LeftUpLeg'),
    legR: bone('RightUpLeg'),
    hand: bone('RightHand'),
    head: bone('Head'),
  };
  if (Object.values(bones).some((b) => !b)) return null;
  // Knieën en ellebogen (als het skelet ze heeft): dan kan het personage echt door de knieën
  const extra = { kneeL: bone('LeftLeg'), kneeR: bone('RightLeg'), elbowL: bone('LeftForeArm'), elbowR: bone('RightForeArm') };
  for (const [key, b] of Object.entries(extra)) if (b) bones[key] = b;

  model.updateMatrixWorld(true);
  // Het model draait mee met de speler, dus dit rekenen we elke frame opnieuw uit
  let modelQInv = model.getWorldQuaternion(Q()).invert();
  /** Draaiing van een bot ten opzichte van het model ("personage-ruimte"). */
  const charQ = (obj) => modelQInv.clone().multiply(obj.getWorldQuaternion(Q()));
  // Draaiingen in rust (T-pose)
  const rest = {};
  for (const [key, b] of Object.entries(bones)) rest[key] = charQ(b);
  // Ook van alle andere grote botten (voor echte animaties uit een bestand, zie retarget.js)
  const MIXAMO_BONES = ['Hips', 'Spine', 'Spine1', 'Spine2', 'Neck', 'Head', 'LeftShoulder', 'LeftArm', 'LeftForeArm', 'LeftHand',
    'RightShoulder', 'RightArm', 'RightForeArm', 'RightHand', 'LeftUpLeg', 'LeftLeg', 'LeftFoot', 'LeftToeBase', 'RightUpLeg', 'RightLeg', 'RightFoot', 'RightToeBase'];
  const restAll = {};
  const restLocal = {};
  const restPos = {};
  const modelQInv0 = modelQInv.clone();
  for (const name of MIXAMO_BONES) {
    const b = bone(name);
    if (!b) continue;
    restAll[name] = charQ(b);
    restLocal[name] = b.quaternion.clone();
    restPos[name] = b.getWorldPosition(new THREE.Vector3()).sub(model.getWorldPosition(new THREE.Vector3())).applyQuaternion(modelQInv0);
  }
  // Alle botten met hun rust-draaiing (elke frame zetten we ze eerst terug, zie apply)
  const resetBones = Object.keys(restLocal).map((name) => bone(name));
  const resetQs = Object.keys(restLocal).map((name) => restLocal[name]);
  // T-pose → armen naar beneden laten hangen
  const down = {
    armL: Q().setFromAxisAngle(new THREE.Vector3(0, 0, 1), -Math.PI / 2),
    armR: Q().setFromAxisAngle(new THREE.Vector3(0, 0, 1), Math.PI / 2),
    legL: Q(),
    legR: Q(),
    spine: Q(),
  };
  down.elbowL = down.armL;
  down.elbowR = down.armR;
  down.kneeL = down.kneeR = Q();
  const parentOf = { kneeL: 'legL', kneeR: 'legR', elbowL: 'armL', elbowR: 'armR' };

  // "Proxy"-objecten: daar schrijft de animator zijn draaiingen in
  const proxy = {};
  for (const key of ['hips', 'armL', 'armR', 'legL', 'legR', 'handR', 'kneeL', 'kneeR', 'elbowL', 'elbowR']) proxy[key] = new THREE.Object3D();
  let baseY = null; // hoogte van het model in rust (om het lijf te laten veren en door de knieën te gaan)

  // Het wapen hangt aan een eigen punt in de hand, met dezelfde assen als bij de ridder
  const handFrame = new THREE.Group();
  const handScale = bones.hand.getWorldScale(new THREE.Vector3()).x;
  handFrame.position.y = 0.07 / handScale; // iets richting de vingers
  bones.hand.add(handFrame);
  const worldScale = handFrame.getWorldScale(new THREE.Vector3()).x;

  // Plek voor een helm op het hoofd
  const headSlot = new THREE.Group();
  const headScale = bones.head.getWorldScale(new THREE.Vector3()).x;
  const headRestInv = rest.head.clone().invert();
  headSlot.quaternion.copy(headRestInv);
  headSlot.position.copy(new THREE.Vector3(0, 0.11, 0.015).applyQuaternion(headRestInv).divideScalar(headScale));
  headSlot.scale.setScalar(0.155 / headScale);
  bones.head.add(headSlot);

  /** Draaiing van een bot ten opzichte van het model, in `out` (zonder nieuwe aan te maken). */
  const charQInto = (obj, out) => out.copy(modelQInv).multiply(obj.getWorldQuaternion(tmpWorldQ));

  /** Zet een bot zó dat het in personage-ruimte de draaiing `target` heeft. */
  function setCharRotation(b, target) {
    const parentQ = b.parent ? charQInto(b.parent, tq[0]) : tq[0].identity();
    b.quaternion.copy(parentQ.invert().multiply(target));
    b.updateMatrixWorld(true);
  }

  return {
    ...proxy,
    gripParent: handFrame,
    headSlot,
    unit: 1 / worldScale,
    // Voor echte animaties (retarget.js): de botten, hoe ze in rust stonden, en hulpjes om ze te draaien
    skeleton: {
      model,
      bone,
      restAll,
      restLocal,
      restPos,
      handFrame,
      charQ: (obj) => {
        modelQInv = model.getWorldQuaternion(Q()).invert();
        return charQ(obj);
      },
      get baseY() {
        return baseY ?? model.position.y;
      },
    },
    apply() {
      // Eerst alle botten terug naar hun rust-stand. Een echte animatie (retarget.js) draait ook de heupen, de nek,
      // de handen en de voeten; zonder dit bleven die na een slag of sprong scheef staan (en liep je poppetje scheef).
      for (let i = 0; i < resetBones.length; i++) resetBones[i].quaternion.copy(resetQs[i]);
      model.updateMatrixWorld(true);
      modelQInv.copy(model.getWorldQuaternion(tmpWorldQ)).invert();
      // Op en neer veren: het hele model iets omhoog of omlaag
      baseY ??= model.position.y;
      model.position.y = baseY + proxy.hips.position.y / this.unit;
      // Volgorde: eerst de rug (de armen hangen eraan), dan armen en benen, dan ellebogen en knieën
      for (const key of ['spine', 'legL', 'legR', 'armL', 'armR', 'kneeL', 'kneeR', 'elbowL', 'elbowR']) {
        if (!bones[key]) continue;
        const p = key === 'spine' ? proxy.hips : proxy[key];
        tmpQ.setFromEuler(tmpE.copy(p.rotation));
        // Een onderbeen/onderarm draait mee met het bovenbeen/de bovenarm, plus zijn eigen buiging
        if (parentOf[key]) tmpQ.premultiply(tq[1].setFromEuler(tmpE.copy(proxy[parentOf[key]].rotation)));
        setCharRotation(bones[key], tq[2].copy(tmpQ).multiply(down[key]).multiply(rest[key]));
      }
      // Hand-frame: draait mee met de arm (zoals bij de ridder) plus elleboog en pols
      const armQ = tq[1].setFromEuler(tmpE.copy(proxy.armR.rotation));
      if (bones.elbowR) armQ.multiply(tq[2].setFromEuler(tmpE.set(proxy.elbowR.rotation.x, 0, 0)));
      const want = armQ.multiply(tq[2].setFromEuler(tmpE.set(proxy.handR.rotation.x, 0, 0)));
      handFrame.quaternion.copy(charQInto(bones.hand, tq[3]).invert().multiply(want));
    },
  };
}
