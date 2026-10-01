import * as THREE from 'three';
import { createWeaponMesh } from './weapons.js';

// Wapens die in de wereld liggen: [x, y, z, wapen]  (y = hoogte van de grond/het blok waar het op ligt)
// Loop ernaartoe en druk op E om het te pakken. Je oude wapen blijft dan op die plek liggen.
const PICKUP_SPOTS = [
  [5, 0, 9, 'sword'], // vlak bij de start
  [-16.2, 1, -9.2, 'shortsword'], // op het lage blok links
  [20, 0, 20, 'club'], // ver weg in de hoek
  [-3.9, 7.25, -14.6, 'katana'], // op het hoogste zwevende platform!
];

const PICKUP_RANGE = 1.6; // hoe dichtbij je moet staan om iets op te pakken

class Pickup {
  constructor(scene, [x, y, z, key]) {
    this.startKey = key;
    this.group = new THREE.Group();
    this.group.position.set(x, y, z);
    scene.add(this.group);

    // Gloeiende ring op de grond
    this.ring = new THREE.Mesh(
      new THREE.RingGeometry(0.45, 0.7, 32),
      new THREE.MeshBasicMaterial({ color: 0xffe066, transparent: true, opacity: 0.7, side: THREE.DoubleSide, depthWrite: false })
    );
    this.ring.rotation.x = -Math.PI / 2;
    this.ring.position.y = 0.03;
    this.group.add(this.ring);

    // Lichtstraal omhoog, zodat je het wapen van ver kunt zien
    const beam = new THREE.Mesh(
      new THREE.CylinderGeometry(0.35, 0.35, 4, 16, 1, true),
      new THREE.MeshBasicMaterial({ color: 0xffe066, transparent: true, opacity: 0.12, side: THREE.DoubleSide, depthWrite: false })
    );
    beam.position.y = 2;
    this.group.add(beam);

    // Het zwevende, draaiende wapen
    this.spinner = new THREE.Group();
    this.spinner.position.y = 0.6;
    this.group.add(this.spinner);

    this.setWeapon(key);
  }

  get position() {
    return this.group.position;
  }

  setWeapon(key) {
    this.key = key;
    this.spinner.clear();
    const mesh = createWeaponMesh(key);
    mesh.rotation.z = 0.25; // een beetje schuin, ziet er leuker uit
    this.spinner.add(mesh);
  }

  update(time) {
    this.spinner.rotation.y = time * 1.5;
    this.spinner.position.y = 0.6 + Math.sin(time * 2.5) * 0.12;
    this.ring.material.opacity = 0.5 + Math.sin(time * 4) * 0.25;
  }
}

export function createPickups(scene) {
  return PICKUP_SPOTS.map((spot) => new Pickup(scene, spot));
}

/** Zet alle wapens terug op hun beginplek. */
export function resetPickups(pickups) {
  for (const pickup of pickups) pickup.setWeapon(pickup.startKey);
}

/** Het wapen waar de speler nu dichtbij staat (of null). */
export function findNearbyPickup(pickups, playerPos) {
  for (const pickup of pickups) {
    const dx = pickup.position.x - playerPos.x;
    const dz = pickup.position.z - playerPos.z;
    const dy = playerPos.y - pickup.position.y;
    if (Math.hypot(dx, dz) < PICKUP_RANGE && dy > -0.5 && dy < 1.5) return pickup;
  }
  return null;
}

/** Wissel: de speler pakt het wapen, en zijn oude wapen komt op die plek te liggen. */
export function swapWeapon(pickup, sword) {
  const old = sword.weaponKey;
  sword.setWeapon(pickup.key);
  pickup.setWeapon(old);
}

