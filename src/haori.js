import * as THREE from 'three';
import { toon, outlineMaterial } from './nightwalkerModel.js';

// Sky's haori: een lang, open Japans jasje over zijn stormhuid, geel-oranje als de bliksem, met rijen
// witte driehoekjes onderaan (zoals schubben) die naar boven toe steeds minder worden. Wijde mouwen.
// Het jasje zit vast aan de botten van het model (rug en armen), dus het beweegt mee als Sky vecht.
//
// Waar de botten zitten rekenen we uit met de "rusthouding" van het skelet (de T-pose waarin het model
// gemaakt is). Zo past het jasje op elk Mixamo-personage, hoe groot het ook is.

let fabric = null;

/** Het stofje: een gele verloop-kleur met witte driehoekjes onderaan. */
function haoriTexture() {
  if (fabric) return fabric;
  const W = 512;
  const H = 256;
  const c = document.createElement('canvas');
  c.width = W;
  c.height = H;
  const g = c.getContext('2d');
  const grad = g.createLinearGradient(0, 0, 0, H);
  grad.addColorStop(0, '#ffcf3a');
  grad.addColorStop(1, '#ff9418');
  g.fillStyle = grad;
  g.fillRect(0, 0, W, H);
  // Rijen driehoekjes (punt omhoog), onderaan dicht op elkaar, hogerop steeds minder
  const size = 32;
  let seed = 7;
  const rand = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
  for (let row = 0; row < 6; row++) {
    const y = H - row * size;
    const shift = row % 2 ? size / 2 : 0;
    for (let x = -size; x < W + size; x += size) {
      if (rand() > 1 - row * 0.19) continue;
      g.fillStyle = row === 0 ? '#ffffff' : 'rgba(255,255,255,0.95)';
      g.beginPath();
      g.moveTo(x + shift, y);
      g.lineTo(x + shift + size, y);
      g.lineTo(x + shift + size / 2, y - size * 0.9);
      g.closePath();
      g.fill();
    }
  }
  // Een donkere zoom langs de onderrand
  g.fillStyle = '#b8560a';
  g.fillRect(0, H - 5, W, 5);
  fabric = new THREE.CanvasTexture(c);
  fabric.colorSpace = THREE.SRGBColorSpace;
  fabric.wrapS = THREE.RepeatWrapping;
  fabric.anisotropy = 4;
  return fabric;
}

/** Een stuk stof met omlijning. */
function cloth(geo, mat) {
  const g = new THREE.Group();
  const m = new THREE.Mesh(geo, mat);
  m.castShadow = true;
  g.add(m, new THREE.Mesh(geo, outlineMaterial(0.008)));
  return g;
}

/** Een mouw (of stuk mouw) van punt `a` naar punt `b`, wijder aan het eind, en een beetje afhangend. */
function sleeve(a, b, r0, r1, mat) {
  const dir = b.clone().sub(a);
  const geo = new THREE.CylinderGeometry(r0, r1, dir.length(), 16, 1, true);
  geo.scale(1, 1, 1.2); // een beetje plat (een hangende Japanse mouw)
  const g = cloth(geo, mat);
  g.position.copy(a).lerp(b, 0.5);
  // De bovenkant van de cilinder (+y) bij de schouder, de wijde opening bij `b`
  g.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir.clone().negate().normalize());
  return g;
}

/**
 * Trek dit model de haori aan. Werkt alleen bij een Mixamo-skelet (anders gebeurt er niks).
 * Geeft true terug als het gelukt is.
 */
export function dressHaori(model) {
  // Het stuk met het hele skelet (het hoofd heeft soms een eigen klein skeletje)
  let skinned = null;
  model.traverse((c) => {
    if (c.isSkinnedMesh && (!skinned || c.skeleton.bones.length > skinned.skeleton.bones.length)) skinned = c;
  });
  const space = model.parent; // "personage-ruimte" in meters: voeten op 0, kijkt naar +z
  if (!skinned || !space) return false;
  const bones = skinned.skeleton.bones;
  const find = (name) => bones.find((b) => b.name === `mixamorig${name}` || b.name === `mixamorig:${name}`);
  model.updateMatrixWorld(true);
  const toSpace = new THREE.Matrix4().copy(space.matrixWorld).invert().multiply(skinned.matrixWorld).multiply(new THREE.Matrix4().copy(skinned.bindMatrix).invert());
  /** Waar en hoe staat dit bot in rust? (als matrix in personage-ruimte) */
  const rest = (bone) => {
    const i = bones.indexOf(bone);
    return toSpace.clone().multiply(new THREE.Matrix4().copy(skinned.skeleton.boneInverses[i]).invert());
  };
  const pos = (bone) => new THREE.Vector3().setFromMatrixPosition(rest(bone));
  /** Een groepje aan dit bot waarin je kunt bouwen in personage-ruimte (meters). */
  const frameOn = (bone) => {
    const f = new THREE.Group();
    rest(bone).invert().decompose(f.position, f.quaternion, f.scale);
    bone.add(f);
    return f;
  };

  const B = {};
  for (const n of ['Hips', 'Spine', 'Spine2', 'LeftArm', 'LeftForeArm', 'LeftHand', 'RightArm', 'RightForeArm', 'RightHand']) B[n] = find(n);
  if (Object.values(B).some((b) => !b)) return false;

  const mat = toon(0xffffff, { map: haoriTexture(), side: THREE.DoubleSide });

  // ---------- Het lijf: open aan de voorkant, van de schouders tot net boven de knieën ----------
  const shoulderL = pos(B.LeftArm);
  const shoulderR = pos(B.RightArm);
  const hips = pos(B.Hips);
  const chest = pos(B.Spine2);
  const top = (shoulderL.y + shoulderR.y) / 2 + 0.03;
  const hem = hips.y - 0.42;
  const half = Math.abs(shoulderL.x - shoulderR.x) / 2;
  const height = top - hem;
  const bodyGeo = new THREE.CylinderGeometry(half * 0.92, half * 1.32, height, 28, 1, true, 0.42, Math.PI * 2 - 0.84);
  bodyGeo.scale(1, 1, 0.72); // een lijf is breder dan dik
  const texBody = mat.clone();
  texBody.map = haoriTexture().clone();
  texBody.map.repeat.set(3, 1);
  texBody.map.needsUpdate = true;
  const body = cloth(bodyGeo, texBody);
  body.position.set((shoulderL.x + shoulderR.x) / 2, hem + height / 2, chest.z - 0.01);
  frameOn(B.Spine).add(body);

  // ---------- De wijde mouwen: bovenarm en onderarm apart (dan buigen ze mee met de elleboog) ----------
  for (const side of ['Left', 'Right']) {
    const shoulder = pos(B[`${side}Arm`]);
    const elbow = pos(B[`${side}ForeArm`]);
    const wrist = pos(B[`${side}Hand`]);
    const upper = sleeve(shoulder, elbow, 0.07, 0.085, mat);
    frameOn(B[`${side}Arm`]).add(upper);
    const end = elbow.clone().lerp(wrist, 0.8);
    const lower = sleeve(elbow, end, 0.085, 0.115, mat);
    frameOn(B[`${side}ForeArm`]).add(lower);
  }
  return true;
}
