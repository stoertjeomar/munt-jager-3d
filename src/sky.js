import * as THREE from 'three';
import { SKY } from './levels.js';
import { play } from './audio.js';

// ======================================================================
// Het Wolkenrijk: zwevende eilanden hoog in de lucht
// ======================================================================
// Je komt er alleen met Vuurtand de draak. Er zijn vijf eilanden (zie SKY in levels.js):
//   Hemelpoort  — het grootste eiland, met een vlag (snelreizen!), het Windaltaar en een waterval
//   Stormeiland — bewaakt door een Stormgolem en Wolkengeesten (spring erheen over de stapstenen!)
//   Wolkentuin  — roze wolkenbomen en Wolkengeesten
//   Zonnetop    — het allerhoogste eiland, alleen met de draak
//   Wolkenkei   — een piepklein rotsje met een diamant erop
// Op elk eiland staat een kist met een speciaal wapen (zie weapons.js: Gifdolk, Bliksemzwaard, Vampierzwaard, Wolkenspeer).
// Het Windaltaar geeft je de Zegen van de Wind: een tijdje meer schade en sneller lopen.

export const ALTAR = {
  buff: 90, // zo lang duurt de Zegen van de Wind (seconden)
  cooldown: 150, // zo lang moet je wachten voordat het altaar je weer zegent
  damage: 1.3, // keer zoveel schade
  speed: 1.2, // keer zo snel
};

// Vijanden op de eilanden: [eiland, soort, x, z (vanaf het midden van het eiland), kleur]
const GUARDS = [
  ['storm', 'golem', 0, 2, 'storm'],
  ['storm', 'spook', -4, -3, 'wolk'],
  ['storm', 'spook', 4, -2, 'wolk'],
  ['tuin', 'spook', 3, -4, 'wolk'],
  ['tuin', 'spook', -4, 2, 'wolk'],
  ['tuin', 'slijmbal', 2, 4, 'wolk'],
  ['top', 'spook', 0, 2, 'wolk'],
];
// Wolken-kleuren voor de vijanden: een Wolkengeest (wit-blauw) en een Stormgolem (donkerblauw met bliksem)
const LOOKS = {
  wolk: { color: 0xe8f6ff, emissive: 0x4a7aa0, intensity: 0.5 },
  storm: { color: 0x3a4a7a, emissive: 0x4a8aff, intensity: 0.45 },
};

const mat = (color, extra = {}) => new THREE.MeshStandardMaterial({ color, roughness: 0.85, flatShading: true, ...extra });

/** Een getal dat steeds hetzelfde is voor dezelfde plek (om rotsen "willekeurig" maar vast te maken). */
function hash(x, y, z) {
  const s = Math.sin(x * 12.9898 + y * 78.233 + z * 37.719) * 43758.5453;
  return s - Math.floor(s);
}

export class Sky {
  /**
   * @param {THREE.Scene} scene
   * @param {object} game  { colliders, addEnemy(type, x, z), stats, effects, ui, giveStars }
   */
  constructor(scene, game) {
    this.scene = scene;
    this.game = game;
    this.islands = SKY ? [...SKY.islands, ...SKY.stones] : [];
    this.group = new THREE.Group();
    this.time = 0;
    this.buffT = 0; // > 0: de Zegen van de Wind werkt nog
    this.altarCooldown = 0;
    this.hinted = false;
    this.guards = [];
    if (!SKY) return;
    scene.add(this.group);
    this.materials = {
      grass: mat(0x7fd05a),
      grass2: mat(0x9fe07a),
      dirt: mat(0x8a6a48),
      rock: mat(0xa0978c),
      rockDark: mat(0x7a7268),
      trunk: mat(0x8a6a4a),
      cloud: new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 1, transparent: true, opacity: 0.92, emissive: 0x8a96a8, emissiveIntensity: 0.25 }),
      pink: mat(0xffc8e8, { emissive: 0x5a2a4a, emissiveIntensity: 0.25 }),
      white: mat(0xffffff, { emissive: 0x6a7a8a, emissiveIntensity: 0.2 }),
      marble: mat(0xf2efe8, { roughness: 0.5 }),
      gold: mat(0xffd23a, { metalness: 0.6, roughness: 0.3, emissive: 0x6a4a00, emissiveIntensity: 0.6 }),
      crystal: mat(0x8ff0ff, { roughness: 0.15, emissive: 0x2aa0c0, emissiveIntensity: 0.9, transparent: true, opacity: 0.9 }),
    };
    for (const isl of this.islands) this.buildIsland(isl);
    this.buildAltar(SKY.islands[0]);
    this.buildWaterfall(SKY.islands[0]);
    this.buildTrees();
    this.buildClouds();
    this.buildRainbow();
    this.spawnGuards();
  }

  get main() {
    return SKY?.islands[0] ?? null;
  }

  // ---------------- Bouwen ----------------

  /** Eén eiland: gras bovenop, een rand aarde, en een puntige rots eronder. Plus botsdozen om op te lopen. */
  buildIsland(isl) {
    const m = this.materials;
    const R = isl.radius;
    const g = new THREE.Group();
    g.position.set(isl.x, isl.top, isl.z);
    const seg = Math.max(10, Math.round(R * 2.2));
    const top = new THREE.Mesh(new THREE.CylinderGeometry(R, R * 0.97, 0.6, seg), isl.stone ? m.grass2 : m.grass);
    top.position.y = -0.3;
    const dirt = new THREE.Mesh(new THREE.CylinderGeometry(R * 0.97, R * 0.86, 1.3, seg), m.dirt);
    dirt.position.y = -1.25;
    // De rots eronder: een omgekeerde kegel met hobbels
    const coneH = R * (isl.stone ? 1.6 : 1.45);
    const coneGeo = new THREE.ConeGeometry(R * 0.88, coneH, seg, 5);
    const p = coneGeo.attributes.position;
    for (let i = 0; i < p.count; i++) {
      const x = p.getX(i);
      const y = p.getY(i);
      const z = p.getZ(i);
      if (y > coneH / 2 - 0.01) continue; // de bovenrand blijft rond (die zit tegen de aarde)
      const k = 0.78 + 0.4 * hash(Math.round(x * 10), Math.round(y * 10), Math.round(z * 10));
      p.setXYZ(i, x * k, y + (hash(z, x, y) - 0.5) * R * 0.15, z * k);
    }
    coneGeo.computeVertexNormals();
    const cone = new THREE.Mesh(coneGeo, m.rock);
    cone.rotation.x = Math.PI;
    cone.position.y = -1.9 - coneH / 2;
    for (const mesh of [top, dirt, cone]) {
      mesh.castShadow = true;
      mesh.receiveShadow = true;
    }
    g.add(top, dirt, cone);
    // Een paar losse rotsjes die eronder zweven
    if (!isl.stone) {
      for (let i = 0; i < Math.round(R / 2.5); i++) {
        const a = (i / Math.round(R / 2.5)) * Math.PI * 2 + R;
        const rock = new THREE.Mesh(new THREE.DodecahedronGeometry(0.4 + hash(i, R, 1) * 0.6, 0), m.rockDark);
        rock.position.set(Math.cos(a) * R * 0.95, -3 - hash(i, 2, R) * R * 0.8, Math.sin(a) * R * 0.95);
        rock.castShadow = true;
        g.add(rock);
        (this.floaters ??= []).push({ mesh: rock, base: rock.position.y, phase: i * 1.7 + R });
      }
      // Bloemetjes in het gras
      const flowers = new THREE.InstancedMesh(new THREE.IcosahedronGeometry(0.11, 0), new THREE.MeshStandardMaterial({ roughness: 0.6 }), Math.round(R * R * 0.5));
      const mtx = new THREE.Matrix4();
      const colors = [0xffffff, 0xffb8e0, 0xfff07a, 0xb8d8ff];
      for (let i = 0; i < flowers.count; i++) {
        const a = hash(i, R, 3) * Math.PI * 2;
        const d = Math.sqrt(hash(R, i, 7)) * (R - 0.8);
        mtx.makeTranslation(Math.cos(a) * d, 0.1, Math.sin(a) * d);
        flowers.setMatrixAt(i, mtx);
        flowers.setColorAt(i, new THREE.Color(colors[i % colors.length]));
      }
      g.add(flowers);
    }
    this.group.add(g);
    // Botsdozen: een kruis van twee dozen (dat lijkt op een rondje), en een kleinere doos onder het eiland voor de draak
    const c = this.game.colliders;
    const y0 = isl.top - 1.8;
    const box = (hx, hz, ya, yb) => c.push(new THREE.Box3(new THREE.Vector3(isl.x - hx, ya, isl.z - hz), new THREE.Vector3(isl.x + hx, yb, isl.z + hz)));
    if (isl.stone || R < 3) box(R * 0.78, R * 0.78, y0, isl.top);
    else {
      box(R * 0.97, R * 0.68, y0, isl.top);
      box(R * 0.68, R * 0.97, y0, isl.top);
      box(R * 0.5, R * 0.5, isl.top - 1.9 - coneH * 0.6, y0);
    }
  }

  /** Het Windaltaar: een ring van witte zuilen met een zwevende, draaiende windbol in het midden. */
  buildAltar(isl) {
    const m = this.materials;
    const g = new THREE.Group();
    g.position.set(isl.x, isl.top, isl.z);
    const floor = new THREE.Mesh(new THREE.CylinderGeometry(3.4, 3.6, 0.3, 24), m.marble);
    floor.position.y = 0.15;
    floor.receiveShadow = true;
    g.add(floor);
    for (let i = 0; i < 6; i++) {
      const a = (i / 6) * Math.PI * 2;
      const pillar = new THREE.Mesh(new THREE.CylinderGeometry(0.28, 0.32, 3.2, 8), m.marble);
      pillar.position.set(Math.cos(a) * 3, 1.9, Math.sin(a) * 3);
      pillar.castShadow = true;
      const cap = new THREE.Mesh(new THREE.BoxGeometry(0.8, 0.25, 0.8), m.gold);
      cap.position.set(pillar.position.x, 3.6, pillar.position.z);
      g.add(pillar, cap);
      const wx = isl.x + pillar.position.x;
      const wz = isl.z + pillar.position.z;
      this.game.colliders.push(new THREE.Box3(new THREE.Vector3(wx - 0.32, isl.top, wz - 0.32), new THREE.Vector3(wx + 0.32, isl.top + 3.7, wz + 0.32)));
    }
    // De windbol: een gloeiende bol met twee draaiende ringen
    this.orb = new THREE.Group();
    this.orb.position.y = 2.2;
    const core = new THREE.Mesh(new THREE.IcosahedronGeometry(0.55, 1), new THREE.MeshBasicMaterial({ color: 0xbff4ff, toneMapped: false }));
    const ringMat = new THREE.MeshBasicMaterial({ color: 0x8fe8ff, toneMapped: false, transparent: true, opacity: 0.8 });
    this.orbRings = [0, 1].map((i) => {
      const ring = new THREE.Mesh(new THREE.TorusGeometry(0.95 + i * 0.3, 0.04, 6, 40), ringMat);
      ring.rotation.x = i ? 1.1 : -0.4;
      this.orb.add(ring);
      return ring;
    });
    this.orb.add(core);
    this.orbCore = core;
    g.add(this.orb);
    // Kristallen rond het altaar
    for (let i = 0; i < 7; i++) {
      const a = (i / 7) * Math.PI * 2 + 0.3;
      const crystal = new THREE.Mesh(new THREE.OctahedronGeometry(0.35 + hash(i, 4, 4) * 0.35, 0), m.crystal);
      crystal.scale.y = 2.2;
      crystal.position.set(Math.cos(a) * (5.5 + hash(i, 1, 9) * 3), 0.6, Math.sin(a) * (5.5 + hash(i, 1, 9) * 3));
      crystal.rotation.set(hash(i, 2, 2) * 0.5, a, hash(i, 3, 1) * 0.5);
      g.add(crystal);
    }
    this.group.add(g);
    this.altar = new THREE.Vector3(isl.x, isl.top, isl.z);
  }

  /** Een waterval die van de rand van de Hemelpoort naar beneden valt. */
  buildWaterfall(isl) {
    const canvas = document.createElement('canvas');
    canvas.width = 32;
    canvas.height = 128;
    const ctx = canvas.getContext('2d');
    for (let y = 0; y < 128; y++) {
      for (let x = 0; x < 32; x++) {
        const v = 0.55 + 0.45 * Math.sin(x * 1.3 + Math.sin(y * 0.2) * 2) * Math.sin(y * 0.11 + x);
        ctx.fillStyle = `rgba(${200 + v * 55}, ${235 + v * 20}, 255, ${0.45 + v * 0.4})`;
        ctx.fillRect(x, y, 1, 1);
      }
    }
    const tex = new THREE.CanvasTexture(canvas);
    tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
    tex.repeat.set(1, 6);
    this.waterTex = tex;
    const a = -2.2; // aan welke kant van het eiland
    const x = isl.x + Math.cos(a) * (isl.radius - 0.1);
    const z = isl.z + Math.sin(a) * (isl.radius - 0.1);
    const fall = new THREE.Mesh(
      new THREE.PlaneGeometry(2.2, isl.top + 0.2),
      new THREE.MeshBasicMaterial({ map: tex, transparent: true, depthWrite: false, side: THREE.DoubleSide, fog: true }),
    );
    fall.position.set(x, isl.top / 2, z);
    fall.rotation.y = -a + Math.PI / 2;
    this.group.add(fall);
    // Het beekje bovenop het eiland dat naar de rand stroomt
    const stream = new THREE.Mesh(new THREE.PlaneGeometry(1.6, 5), new THREE.MeshBasicMaterial({ map: tex, transparent: true, depthWrite: false }));
    stream.rotation.x = -Math.PI / 2;
    stream.rotation.z = -a + Math.PI / 2;
    stream.position.set(isl.x + Math.cos(a) * (isl.radius - 2.6), isl.top + 0.03, isl.z + Math.sin(a) * (isl.radius - 2.6));
    this.group.add(stream);
    this.fallFoot = new THREE.Vector3(x, 0.5, z);
  }

  /** Wolkenbomen: een stammetje met dikke roze of witte wolken als bladeren. */
  buildTrees() {
    const m = this.materials;
    const spots = [
      ['poort', 7, 4, 'white'], ['poort', -8, 3, 'pink'], ['poort', 3, 9, 'pink'], ['poort', -6, -7, 'white'],
      ['tuin', 4, 3, 'pink'], ['tuin', -3, 5, 'pink'], ['tuin', -5, -3, 'white'], ['tuin', 1, -6, 'pink'],
      ['storm', -5, 4, 'white'],
    ];
    for (const [id, dx, dz, kind] of spots) {
      const isl = SKY.islands.find((i) => i.id === id);
      const x = isl.x + dx;
      const z = isl.z + dz;
      const tree = new THREE.Group();
      tree.position.set(x, isl.top, z);
      const h = 2 + hash(dx, dz, 1) * 1.2;
      const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.26, h, 7), m.trunk);
      trunk.position.y = h / 2;
      trunk.castShadow = true;
      tree.add(trunk);
      for (let i = 0; i < 4; i++) {
        const puff = new THREE.Mesh(new THREE.IcosahedronGeometry(0.8 + hash(i, dx, dz) * 0.5, 1), m[kind]);
        puff.position.set((hash(i, 1, dx) - 0.5) * 1.6, h + 0.3 + (hash(i, dz, 2) - 0.3) * 0.9, (hash(dz, i, 3) - 0.5) * 1.6);
        puff.castShadow = true;
        tree.add(puff);
      }
      this.group.add(tree);
      this.game.colliders.push(new THREE.Box3(new THREE.Vector3(x - 0.3, isl.top, z - 0.3), new THREE.Vector3(x + 0.3, isl.top + h, z + 0.3)));
    }
  }

  /** Dikke wolken rond (en onder) de eilanden. Eén InstancedMesh met bollen: dat is snel. */
  buildClouds() {
    const puffs = [];
    const add = (x, y, z, size) => {
      const n = 4 + Math.floor(hash(x, y, z) * 4);
      for (let i = 0; i < n; i++) {
        const s = size * (0.6 + hash(i, x, z) * 0.6);
        puffs.push([x + (i - n / 2) * size * 0.7, y + hash(i, y, 1) * size * 0.4, z + (hash(z, i, 2) - 0.5) * size, s]);
      }
    };
    for (const isl of SKY.islands) {
      const R = isl.radius;
      for (let k = 0; k < 3; k++) {
        const a = k * 2.1 + R;
        add(isl.x + Math.cos(a) * (R + 3), isl.top - 4 - k * 2.5, isl.z + Math.sin(a) * (R + 3), 2.2 + R * 0.12);
      }
    }
    // Wolken een eind weg (je ziet ze ook vanaf de grond)
    const c = SKY.islands[0];
    for (let k = 0; k < 10; k++) {
      const a = (k / 10) * Math.PI * 2;
      const d = 40 + hash(k, 3, 3) * 25;
      add(c.x + Math.cos(a) * d, 24 + hash(k, 5, 1) * 14, c.z + Math.sin(a) * d * 0.8, 3 + hash(k, 1, 7) * 2);
    }
    const mesh = new THREE.InstancedMesh(new THREE.IcosahedronGeometry(1, 2), this.materials.cloud, puffs.length);
    const mtx = new THREE.Matrix4();
    puffs.forEach(([x, y, z, s], i) => {
      mtx.makeScale(s, s * 0.65, s).setPosition(x, y, z);
      mesh.setMatrixAt(i, mtx);
    });
    mesh.frustumCulled = false;
    this.clouds = mesh;
    this.group.add(mesh);
  }

  /** Een grote regenboog over het Wolkenrijk. */
  buildRainbow() {
    const colors = [0xff4a4a, 0xff9a3a, 0xffe14a, 0x6ad84a, 0x4ab8ff, 0x6a5aff, 0xb05aff];
    const rainbow = new THREE.Group();
    colors.forEach((color, i) => {
      const band = new THREE.Mesh(
        new THREE.TorusGeometry(46 - i * 0.9, 0.45, 6, 64, Math.PI),
        new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.38, depthWrite: false, toneMapped: false, fog: false }),
      );
      rainbow.add(band);
    });
    const a = SKY.islands.find((i) => i.id === 'tuin');
    const b = SKY.islands.find((i) => i.id === 'storm');
    rainbow.position.set((a.x + b.x) / 2, 8, (a.z + b.z) / 2 + 12);
    rainbow.rotation.y = Math.atan2(b.x - a.x, b.z - a.z) + Math.PI / 2;
    this.group.add(rainbow);
  }

  /** De bewakers van de eilanden: Wolkengeesten en een Stormgolem. */
  spawnGuards() {
    for (const [id, kind, dx, dz, look] of GUARDS) {
      const isl = SKY.islands.find((i) => i.id === id);
      const e = this.game.addEnemy(kind, isl.x + dx, isl.z + dz);
      e.summoned = false; // ze horen bij de wereld (komen terug na rusten, tellen mee voor je level)
      e.floor = isl.top;
      e.island = { center: new THREE.Vector3(isl.x, isl.top, isl.z), radius: isl.radius };
      e.hpScale = kind === 'golem' ? 1.8 : 1.6;
      e.sky = true;
      e.reset();
      // Andere kleuren: wit-blauwe wolken, of een donkere storm
      const l = LOOKS[look];
      for (const m of e.model?.materials ?? []) {
        m.color?.set(l.color);
        m.emissive?.set(l.emissive);
        m.emissiveIntensity = l.intensity;
      }
      e.baseGlow = (e.model?.materials ?? []).map((m) => ({ color: m.emissive.clone(), intensity: m.emissiveIntensity }));
      this.guards.push(e);
    }
  }

  // ---------------- Spelen ----------------

  /** Hoe hoog is de grond hier? (bovenop een eiland, als je daarboven bent; anders 0) */
  groundAt(x, z, y = Infinity) {
    let ground = 0;
    for (const isl of this.islands) {
      if (y < isl.top - 2.5 || isl.top <= ground) continue;
      if (Math.hypot(x - isl.x, z - isl.z) < isl.radius * 0.95) ground = isl.top;
    }
    return ground;
  }

  /** Sta je op (of vlak boven) een eiland? Geeft het eiland terug, of null. */
  islandAt(pos) {
    for (const isl of this.islands) {
      if (pos.y >= isl.top - 0.5 && pos.y < isl.top + 4 && Math.hypot(pos.x - isl.x, pos.z - isl.z) < isl.radius + 0.5) return isl;
    }
    return null;
  }

  /** Sta je bij het Windaltaar? */
  nearAltar(pos) {
    return !!this.altar && Math.hypot(pos.x - this.altar.x, pos.z - this.altar.z) < 4.2 && Math.abs(pos.y - this.altar.y) < 2;
  }

  /** E bij het altaar: de Zegen van de Wind (en de eerste keer een ster). Geeft een tekstje terug voor in beeld. */
  useAltar(player) {
    if (this.altarCooldown > 0) return `🌬 Het Windaltaar rust nog even uit... (nog ${Math.ceil(this.altarCooldown)} s)`;
    this.buffT = ALTAR.buff;
    this.altarCooldown = ALTAR.cooldown;
    player.health = player.maxHealth;
    player.stamina = player.maxStamina;
    play('gust');
    play('shine');
    this.game.effects.shockwave(this.altar, 0x8fe8ff, 6);
    this.game.effects.burst(this.altar.clone().setY(this.altar.y + 2.2), 0xbff4ff, { count: 50, speed: 6, size: 0.12, life: 1, up: 3 });
    const d = this.game.stats.data;
    let extra = '';
    if (!d.skyAltar) {
      d.skyAltar = true;
      this.game.giveStars(1);
      extra = '<br>De eerste keer krijg je ook een ⭐!';
    }
    return `🌬 <b>Zegen van de Wind!</b> Je leven is vol, en ${ALTAR.buff} seconden lang doe je ${Math.round((ALTAR.damage - 1) * 100)}% meer schade en loop je sneller.${extra}`;
  }

  /** Voor de minimap en de wereldkaart. */
  mapMarkers() {
    if (!SKY) return [];
    return SKY.islands.map((i) => ({ x: i.x, z: i.z, icon: '☁', color: '#e8f6ff' }));
  }

  /**
   * Elke frame.
   * @param {object} player
   * @param {boolean} riding  zit je op de draak?
   */
  update(dt, player, riding) {
    if (!SKY) return;
    this.time += dt;
    this.buffT = Math.max(0, this.buffT - dt);
    this.altarCooldown = Math.max(0, this.altarCooldown - dt);
    // Windbol draait en zweeft; de waterval stroomt; rotsjes dobberen
    if (this.orb) {
      this.orb.position.y = 2.2 + Math.sin(this.time * 1.6) * 0.18;
      this.orb.rotation.y += dt * 0.8;
      this.orbRings[0].rotation.z += dt * 1.6;
      this.orbRings[1].rotation.z -= dt * 1.1;
      this.orbCore.scale.setScalar(this.altarCooldown > 0 ? 0.6 : 1 + Math.sin(this.time * 4) * 0.08);
    }
    if (this.waterTex) this.waterTex.offset.y += dt * 1.4;
    for (const f of this.floaters ?? []) f.mesh.position.y = f.base + Math.sin(this.time * 0.8 + f.phase) * 0.35;
    // Mist onderaan de waterval
    if (this.fallFoot && Math.random() < 0.3 && player.position.distanceTo(this.fallFoot) < 60) {
      this.game.effects.burst(this.fallFoot, 0xe8f6ff, { count: 1, speed: 1.5, size: 0.3, life: 1.2, up: 1.5, gravity: -0.1 });
    }
    // Hoog in de lucht boven de vallei? Dan een hint (één keer)
    const main = this.main;
    if (!this.hinted && riding && player.position.y > 16 && Math.hypot(player.position.x - main.x, player.position.z - main.z) < 90) {
      this.hinted = true;
      if (!this.game.stats.data.flags.includes('sky-start')) {
        this.game.ui.toast('☁ <b>Kijk daar!</b> Hoog boven de Ruïnevallei zweeft het <b>Wolkenrijk</b>.<br><small>Vlieg erheen en land op een eiland (laat Spatie los). Stap af met <b>B</b>.</small>', 6);
      }
    }
  }
}
