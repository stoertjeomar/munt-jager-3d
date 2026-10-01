import * as THREE from 'three';

// Mixamo-personages hebben een echt skelet (botten), en staan in een T-pose (armen opzij).
// Onze animator (animator.js) denkt in "armen hangen naar beneden" en draait gewoon armen en benen.
// Deze vertaler zet die draaiingen om naar de echte botten van een Mixamo-skelet.

const Q = () => new THREE.Quaternion();
const tmpQ = Q();
const tmpE = new THREE.Euler();

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

  model.updateMatrixWorld(true);
  // Het model draait mee met de speler, dus dit rekenen we elke frame opnieuw uit
  let modelQInv = model.getWorldQuaternion(Q()).invert();
  /** Draaiing van een bot ten opzichte van het model ("personage-ruimte"). */
  const charQ = (obj) => modelQInv.clone().multiply(obj.getWorldQuaternion(Q()));
  // Draaiingen in rust (T-pose)
  const rest = {};
  for (const [key, b] of Object.entries(bones)) rest[key] = charQ(b);
  // T-pose → armen naar beneden laten hangen
  const down = {
    armL: Q().setFromAxisAngle(new THREE.Vector3(0, 0, 1), -Math.PI / 2),
    armR: Q().setFromAxisAngle(new THREE.Vector3(0, 0, 1), Math.PI / 2),
    legL: Q(),
    legR: Q(),
    spine: Q(),
  };

  // "Proxy"-objecten: daar schrijft de animator zijn draaiingen in
  const proxy = { hips: new THREE.Object3D(), armL: new THREE.Object3D(), armR: new THREE.Object3D(), legL: new THREE.Object3D(), legR: new THREE.Object3D(), handR: new THREE.Object3D() };

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

  /** Zet een bot zó dat het in personage-ruimte de draaiing `target` heeft. */
  function setCharRotation(b, target) {
    const parentQ = b.parent ? charQ(b.parent) : Q();
    b.quaternion.copy(parentQ.invert().multiply(target));
    b.updateMatrixWorld(true);
  }

  return {
    ...proxy,
    gripParent: handFrame,
    headSlot,
    unit: 1 / worldScale,
    apply() {
      model.updateMatrixWorld(true);
      modelQInv = model.getWorldQuaternion(Q()).invert();
      // Volgorde: eerst de rug (de armen hangen eraan), dan armen en benen
      for (const key of ['spine', 'legL', 'legR', 'armL', 'armR']) {
        const p = key === 'spine' ? proxy.hips : proxy[key];
        tmpQ.setFromEuler(tmpE.copy(p.rotation));
        setCharRotation(bones[key], tmpQ.clone().multiply(down[key]).multiply(rest[key]));
      }
      // Hand-frame: draait mee met de arm (zoals bij de ridder) plus de pols
      const armQ = Q().setFromEuler(tmpE.copy(proxy.armR.rotation));
      const wristQ = Q().setFromEuler(tmpE.set(proxy.handR.rotation.x, 0, 0));
      const want = armQ.multiply(wristQ);
      handFrame.quaternion.copy(charQ(bones.hand).invert().multiply(want));
    },
  };
}
