import * as THREE from 'three';

// Een "third person" camera die om de speler heen draait.
// Muis slepen = draaien, scrollen = zoomen.
export class CameraRig {
  constructor(camera, domElement) {
    this.camera = camera;
    this.yaw = 0; // horizontale hoek (radialen)
    this.pitch = 0.45; // verticale hoek (radialen)
    this.distance = 9;
    this.target = new THREE.Vector3();

    let dragging = false;

    domElement.addEventListener('pointerdown', (e) => {
      dragging = true;
      domElement.setPointerCapture(e.pointerId);
    });
    domElement.addEventListener('pointerup', () => (dragging = false));
    domElement.addEventListener('pointermove', (e) => {
      if (!dragging) return;
      this.yaw -= e.movementX * 0.005;
      this.pitch += e.movementY * 0.005;
      this.pitch = THREE.MathUtils.clamp(this.pitch, 0.05, 1.3);
    });
    domElement.addEventListener(
      'wheel',
      (e) => {
        e.preventDefault();
        this.distance = THREE.MathUtils.clamp(this.distance + e.deltaY * 0.01, 4, 20);
      },
      { passive: false }
    );
  }

  /** Richting "vooruit" vanaf de camera, op de grond (x, z). */
  get forward() {
    return new THREE.Vector3(-Math.sin(this.yaw), 0, -Math.cos(this.yaw));
  }

  /** Richting "rechts" vanaf de camera, op de grond (x, z). */
  get right() {
    return new THREE.Vector3(Math.cos(this.yaw), 0, -Math.sin(this.yaw));
  }

  update(dt, followPosition) {
    // Soepel achter de speler aan bewegen
    const goal = followPosition.clone().add(new THREE.Vector3(0, 1.2, 0));
    this.target.lerp(goal, 1 - Math.exp(-10 * dt));

    const d = this.distance;
    const offset = new THREE.Vector3(
      Math.sin(this.yaw) * Math.cos(this.pitch) * d,
      Math.sin(this.pitch) * d,
      Math.cos(this.yaw) * Math.cos(this.pitch) * d
    );

    this.camera.position.copy(this.target).add(offset);
    this.camera.lookAt(this.target);
  }

  snapTo(position) {
    this.target.copy(position).add(new THREE.Vector3(0, 1.2, 0));
  }
}
