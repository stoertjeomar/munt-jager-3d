import * as THREE from 'three';

// Zachte ronde schaduw-vlekjes onder de speler, vijanden, bosses, mensen en dieren.
// Dan zie je goed waar iemand op de grond staat (ook als hij springt of zweeft), en "zweeft" niemand meer.
// Ze zitten allemaal in één InstancedMesh: één tekenopdracht voor allemaal, dus het kost bijna niks.
const MAX = 64;

export class BlobShadows {
  constructor(scene) {
    // Rond vlekje: donker in het midden, doorzichtig aan de rand (getekend op een klein canvas)
    const canvas = document.createElement('canvas');
    canvas.width = canvas.height = 64;
    const ctx = canvas.getContext('2d');
    const g = ctx.createRadialGradient(32, 32, 0, 32, 32, 32);
    g.addColorStop(0, 'rgba(0,0,0,0.42)');
    g.addColorStop(0.5, 'rgba(0,0,0,0.24)');
    g.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, 64, 64);
    const material = new THREE.MeshBasicMaterial({
      map: new THREE.CanvasTexture(canvas), color: 0x000000, transparent: true, depthWrite: false,
      polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2, // net boven de grond tekenen (geen geflikker)
    });
    this.mesh = new THREE.InstancedMesh(new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2), material, MAX);
    this.mesh.renderOrder = 1;
    this.mesh.frustumCulled = false;
    this.mesh.userData.noAO = true;
    this.mesh.count = 0;
    scene.add(this.mesh);
    this.matrix = new THREE.Matrix4();
    this.at = new THREE.Vector3();
    this.size = new THREE.Vector3();
    this.rotation = new THREE.Quaternion();
  }

  /** Begin van een nieuwe frame: alle vlekjes weg. */
  begin() {
    this.mesh.count = 0;
  }

  /**
   * Een vlekje onder iemand.
   * @param {THREE.Vector3} position  waar hij is
   * @param {number} size  hoe breed het vlekje is (meter)
   * @param {number} groundY  hoe hoog de grond onder hem is
   */
  add(position, size, groundY = 0) {
    if (this.mesh.count >= MAX) return;
    const height = Math.max(0, position.y - groundY);
    if (height > 12) return; // heel hoog in de lucht: geen vlekje meer
    // Hoe hoger iemand springt of vliegt, hoe kleiner het vlekje
    const s = size * THREE.MathUtils.clamp(1 - height / 8, 0.3, 1);
    this.at.set(position.x, groundY + 0.03, position.z);
    this.size.set(s, 1, s);
    this.matrix.compose(this.at, this.rotation, this.size);
    this.mesh.setMatrixAt(this.mesh.count++, this.matrix);
  }

  /** Klaar met deze frame: de nieuwe plekjes doorgeven aan de videokaart. */
  end() {
    this.mesh.instanceMatrix.needsUpdate = true;
  }
}
