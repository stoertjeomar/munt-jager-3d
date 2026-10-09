import * as THREE from 'three';

// Dingen ver weg in de mist tekenen we niet: die zie je toch niet, en het scheelt de videokaart heel veel werk.
// (De mist is helemaal dicht bij scene.fog.far: alles daarachter is precies de kleur van de mist.)
//
// Hoe het werkt: van elk ding onthouden we hoe groot het is (een bol eromheen). Elke frame kijken we
// hoe ver die bol van de camera is. Te ver? Dan zetten we hem even uit.
// De game zelf mag `visible` gewoon blijven gebruiken (een vijand die doodgaat, een kist die opengaat):
// wij zetten een eigen "te ver"-vlaggetje, en `visible` is alleen waar als allebei goed is.

const MARGIN = 6; // een paar meter extra, dan zie je nooit iets "aanfloepen"
const CELL = 40; // bomen, stenen en bloemen verdelen we in vakken van 40 x 40 meter

const hideable = new WeakSet();

/** `visible` van dit ding = wat de game wil EN niet te ver weg. */
function makeHideable(obj) {
  if (hideable.has(obj)) return;
  hideable.add(obj);
  let own = obj.visible;
  obj.farHidden = false;
  Object.defineProperty(obj, 'visible', {
    get() {
      return own && !this.farHidden;
    },
    set(v) {
      own = v;
    },
    configurable: true,
  });
}

/** Zit er iets in dat je van heel ver moet kunnen zien (lucht, wolken, bergen) of dat zelf beweegt zonder vaste vorm? */
function mustStay(obj) {
  let stay = false;
  obj.traverse((o) => {
    if (stay) return;
    if (o.isPoints || o.isLine || o.isLight) stay = true;
    else if (o.isMesh || o.isSprite) {
      // (deeltjes en sporen: hun vorm verandert steeds. Poppetjes met botten mogen wel: die blijven ongeveer even groot)
      if (o.frustumCulled === false && !o.isSkinnedMesh) stay = true;
      else if (o.isInstancedMesh && !o.userData.cell) stay = true; // alleen onze eigen vakken
      const mats = Array.isArray(o.material) ? o.material : [o.material];
      if (mats.some((m) => m && m.fog === false)) stay = true; // lucht, wolken, bergen in de verte: die hoef je niet te vervagen
    }
  });
  return stay;
}

export class FarCuller {
  constructor() {
    this.items = [];
    this.known = new Set();
    this.stays = new WeakSet(); // dingen die altijd moeten blijven (lucht, wolken, de grond)
    this.split = new WeakSet(); // groepen die we al in hun onderdelen hebben bekeken
    this.box = new THREE.Box3();
    this.sphere = new THREE.Sphere();
    this.tmp = new THREE.Vector3();
  }

  /**
   * Dit ding meenemen. maxDist = verder dan dit is hij altijd uit (kleine plantjes: al eerder),
   * anders alleen als hij in de mist verdwijnt.
   */
  add(obj, { maxDist = Infinity } = {}) {
    if (this.known.has(obj)) return;
    this.known.add(obj);
    obj.updateMatrixWorld(true);
    if (obj.isInstancedMesh) {
      if (!obj.boundingSphere) obj.computeBoundingSphere();
      this.sphere.copy(obj.boundingSphere).applyMatrix4(obj.matrixWorld);
    } else {
      this.box.setFromObject(obj);
      this.box.getBoundingSphere(this.sphere);
    }
    if (this.box.isEmpty() && !obj.isInstancedMesh || !Number.isFinite(this.sphere.radius)) {
      this.known.delete(obj); // (nog) niks om te tekenen: later nog eens proberen
      return;
    }
    const at = new THREE.Vector3().setFromMatrixPosition(obj.matrixWorld);
    // Kleine dingen (een paaltje, een kist, een slijmpje) zie je van ver toch bijna niet: die gaan al eerder uit
    if (maxDist === Infinity && !obj.isInstancedMesh) maxDist = this.sphere.radius < 0.8 ? 60 : this.sphere.radius < 2 ? 100 : Infinity;
    makeHideable(obj);
    this.items.push({
      obj,
      center: this.sphere.center.clone(),
      radius: this.sphere.radius,
      // Als hij beweegt: dan rekenen we vanaf zijn eigen plek, met een bol die altijd groot genoeg is
      at,
      reach: at.distanceTo(this.sphere.center) + this.sphere.radius,
      moving: false,
      maxDist,
    });
  }

  /**
   * Alles wat er nu in de wereld staat meenemen (behalve wat er altijd moet blijven).
   * Grote groepen (bijvoorbeeld een hele stad in één groep) splitsen we op in hun onderdelen.
   */
  addScene(scene, skip = []) {
    const skipSet = new Set(skip.filter(Boolean));
    const visit = (obj, depth) => {
      if (skipSet.has(obj) || this.known.has(obj) || this.stays.has(obj) || mustStay(obj)) {
        if (!skipSet.has(obj) && !this.known.has(obj)) this.stays.add(obj); // (de volgende keer niet opnieuw uitzoeken)
        // Een groep met iets erin dat moet blijven: dan misschien wel de andere onderdelen
        if (!skipSet.has(obj) && !this.known.has(obj) && obj.children.length && !obj.isMesh && depth < 3 && !this.split.has(obj)) {
          this.split.add(obj);
          for (const c of obj.children) visit(c, depth + 1);
        }
        return;
      }
      if (obj.isLight || obj.isCamera) return;
      this.box.setFromObject(obj);
      if (this.box.isEmpty()) return;
      this.box.getBoundingSphere(this.sphere);
      // Heel groot (de grond, een hele stad)? Dan de onderdelen apart, of laten staan
      if (this.sphere.radius > 60) {
        if (!obj.isMesh && obj.children.length && depth < 3) for (const c of obj.children) visit(c, depth + 1);
        else this.stays.add(obj);
        return;
      }
      this.add(obj);
    };
    for (const c of [...scene.children]) visit(c, 0);
  }

  /** Opnieuw opmeten hoe groot alles is (als er modellen bij zijn gekomen, bijvoorbeeld na het laden). */
  refresh() {
    for (const it of this.items) {
      if (it.obj.isInstancedMesh) continue; // (die veranderen niet)
      it.obj.updateMatrixWorld(true);
      this.box.setFromObject(it.obj);
      if (this.box.isEmpty()) continue;
      this.box.getBoundingSphere(this.sphere);
      if (!Number.isFinite(this.sphere.radius)) continue;
      it.at.setFromMatrixPosition(it.obj.matrixWorld);
      it.center.copy(this.sphere.center);
      it.radius = this.sphere.radius;
      it.reach = it.at.distanceTo(this.sphere.center) + this.sphere.radius;
    }
  }

  /** Elke frame: wat is te ver weg? */
  update(camera, fog) {
    const cam = camera.position;
    const fogFar = fog ? fog.far + MARGIN : Infinity;
    const m = this.tmp;
    let gone = false;
    for (const it of this.items) {
      if (!it.obj.parent) {
        gone = true; // uit de wereld gehaald: niet meer bijhouden
        continue;
      }
      const e = it.obj.matrixWorld.elements;
      let d;
      // Beweegt hij (een vijand, een dorpeling)? Dan vanaf waar hij nu is
      if (it.moving || e[12] !== it.at.x || e[13] !== it.at.y || e[14] !== it.at.z) {
        it.moving = true;
        d = m.set(e[12], e[13], e[14]).distanceTo(cam) - it.reach;
      } else d = it.center.distanceTo(cam) - it.radius;
      it.obj.farHidden = d > Math.min(fogFar, it.maxDist);
    }
    if (gone) {
      this.items = this.items.filter((it) => {
        if (it.obj.parent) return true;
        it.obj.farHidden = false;
        this.known.delete(it.obj);
        return false;
      });
    }
  }
}

/**
 * Eén grote InstancedMesh (bijvoorbeeld alle bomen van de hele wereld) opdelen in vakken van 40 x 40 meter.
 * Dan tekent de computer alleen de vakken die dichtbij en in beeld zijn (ook voor de schaduw).
 * Geeft de nieuwe stukken terug (die staan al in de scene; de oude is weg).
 */
export function splitInstanced(mesh, scene, { maxDist = Infinity, culler = null } = {}) {
  const cells = new Map();
  const m = new THREE.Matrix4();
  const p = new THREE.Vector3();
  for (let i = 0; i < mesh.count; i++) {
    mesh.getMatrixAt(i, m);
    p.setFromMatrixPosition(m);
    const key = `${Math.floor(p.x / CELL)},${Math.floor(p.z / CELL)}`;
    if (!cells.has(key)) cells.set(key, []);
    cells.get(key).push(i);
  }
  const parts = [];
  const color = new THREE.Color();
  for (const list of cells.values()) {
    const part = new THREE.InstancedMesh(mesh.geometry, mesh.material, list.length);
    list.forEach((src, i) => {
      mesh.getMatrixAt(src, m);
      part.setMatrixAt(i, m);
      if (mesh.instanceColor) {
        mesh.getColorAt(src, color);
        part.setColorAt(i, color);
      }
    });
    part.castShadow = mesh.castShadow;
    part.receiveShadow = mesh.receiveShadow;
    part.renderOrder = mesh.renderOrder;
    part.userData.cell = true;
    part.computeBoundingSphere();
    scene.add(part);
    culler?.add(part, { maxDist });
    parts.push(part);
  }
  mesh.removeFromParent();
  return parts;
}

/** Eén culler voor het hele spel (world.js en decor.js zetten hun bomen en plantjes er meteen in). */
export const culler = new FarCuller();
