import * as THREE from 'three';
import { buildSlime, buildGolem } from './enemies.js';
import { loadGLB } from './assets.js';
import { createWeaponMesh } from './weapons.js';
import { createHelmetMesh } from './gear.js';
import { SwordTrail } from './trail.js';
import { play } from './audio.js';

// De vier bosses: aan het eind van elk level één. De boss woont in een arena (zie ARENAS in world.js).
// Loop je de arena in, dan gaat er een mistmuur omhoog en begint het gevecht.
// Elke boss heeft een eigen set aanvallen, en wordt bij de helft van zijn leven sneller en gemener (fase 2).
// Omar de Baas woont niet in een level maar in zijn eigen kasteel: hij staat in omarFighter.js
// en meldt zich zelf aan in BOSS_CLASSES (onderaan dit bestand).

export const BOSS_INFO = {
  koning: { name: 'Koning Slijm', title: 'Heerser van de Ruïnevallei', hp: 900, runes: 600 },
  ridder: { name: 'De Gevallen Ridder', title: 'Bewaker van het Spookwoud', hp: 1100, runes: 900 },
  reus: { name: 'Steenreus Gorath', title: 'Hart van het Hoogland', hp: 1800, runes: 2000 },
  mario: { name: 'Budget Mario', title: 'De Vliegende Loodgieter', hp: 650, runes: 300 },
  omar: { name: 'Omar de Baas', title: 'De Baas van Alles', hp: 1600, runes: 3000 }, // hp hangt af van jouw level (omarFighter.js)
};

const tmp = new THREE.Vector3();

function angleTo(from, to) {
  return Math.atan2(to.x - from.x, to.z - from.z);
}

function turnTowards(object, angle, speed, dt) {
  let diff = angle - object.rotation.y;
  diff = Math.atan2(Math.sin(diff), Math.cos(diff));
  object.rotation.y += diff * Math.min(1, speed * dt);
}

function flatDist(a, b) {
  return Math.hypot(a.x - b.x, a.z - b.z);
}

/** De gouden mistmuur rondom een arena. */
function createFogWall(arena) {
  const material = new THREE.ShaderMaterial({
    transparent: true,
    depthWrite: false,
    side: THREE.DoubleSide,
    uniforms: { time: { value: 0 }, opacity: { value: 0 } },
    vertexShader: `varying vec2 vUv; void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
    fragmentShader: `uniform float time; uniform float opacity; varying vec2 vUv;
      void main() {
        float wave = sin(vUv.x * 60.0 + time * 1.5) * 0.5 + sin(vUv.x * 23.0 - time * 2.3 + vUv.y * 6.0) * 0.5;
        float a = (1.0 - vUv.y) * (0.45 + 0.25 * wave) * opacity;
        gl_FragColor = vec4(mix(vec3(1.0, 0.85, 0.45), vec3(1.0), vUv.y), a);
        #include <colorspace_fragment>
      }`,
  });
  const wall = new THREE.Mesh(new THREE.CylinderGeometry(arena.radius + 0.4, arena.radius + 0.4, 7, 64, 1, true), material);
  wall.position.copy(arena.center).setY(3.5);
  wall.visible = false;
  return wall;
}

export class Boss {
  constructor(scene, arena, id) {
    this.id = id;
    this.info = BOSS_INFO[id];
    this.name = this.info.name;
    this.arena = arena;
    this.scene = scene;
    this.mesh = new THREE.Group();
    scene.add(this.mesh);
    this.fog = createFogWall(arena);
    scene.add(this.fog);
    this.materials = [];
    this.events = []; // geplande gebeurtenissen: { t, fn }
    this.dead = false;
    this.resetFight();
  }

  get position() {
    return this.mesh.position;
  }

  get alive() {
    return !this.dead && this.hp > 0;
  }

  get center() {
    return this.position.clone().setY(this.position.y + this.type.height * 0.5);
  }

  /** Bewaar de normale gloei van de materialen, voor het wit oplichten bij een klap. */
  rememberMaterials(materials) {
    this.materials = materials.map((m) => ({ m, color: m.emissive.clone(), intensity: m.emissiveIntensity }));
  }

  resetFight() {
    this.hp = this.info.hp;
    this.awake = false;
    this.phase2 = false;
    this.state = 'idle';
    this.timer = 0;
    this.cooldown = 1.5;
    this.flash = 0;
    this.lastSwingId = null;
    this.recentSwings = []; // de laatste klappen die al geraakt hebben
    this.events.length = 0;
    this.position.copy(this.arena.center).add(new THREE.Vector3(0, 0, -this.arena.radius * 0.4));
    this.mesh.rotation.set(0, 0, 0);
    this.mesh.scale.setScalar(1);
    this.mesh.visible = !this.dead;
    this.fog.visible = false;
    this.fogOpacity = 0;
  }

  /** Het gevecht begint! */
  wake() {
    this.awake = true;
    this.fog.visible = true;
    play('charge');
  }

  setDefeated() {
    this.dead = true;
    this.hp = 0;
    this.mesh.visible = false;
    this.fog.visible = false;
  }

  hit(from, swingId, damage) {
    // Elke klap telt maar één keer, ook als je slaat én tegelijk een wervelslag doet (dan wisselen de nummers elkaar af)
    if (!this.alive || !this.awake || this.recentSwings.includes(swingId)) return null;
    this.lastSwingId = swingId;
    this.recentSwings.push(swingId);
    if (this.recentSwings.length > 8) this.recentSwings.shift();
    this.hp = Math.max(0, this.hp - damage);
    this.flash = 0.1;
    const killed = this.hp <= 0;
    if (killed) {
      this.dead = true;
      this.dying = 1.5;
      this.events.length = 0;
    }
    return { damage, killed };
  }

  /** Iets inplannen: `fn` wordt over `delay` seconden uitgevoerd. */
  schedule(delay, fn) {
    this.events.push({ t: delay, fn });
  }

  update(dt, ctx) {
    this.time = (this.time ?? 0) + dt;
    // Mistmuur in- en uitfaden
    this.fogOpacity += ((this.awake && !this.dead ? 1 : 0) - this.fogOpacity) * Math.min(1, 3 * dt);
    this.fog.material.uniforms.opacity.value = this.fogOpacity;
    this.fog.material.uniforms.time.value = this.time;
    if (this.fogOpacity < 0.01 && !this.awake) this.fog.visible = false;

    // Wit oplichten na een klap
    this.flash = Math.max(0, this.flash - dt);
    for (const { m, color, intensity } of this.materials) {
      m.emissive.copy(this.flash > 0 ? WHITE : color);
      m.emissiveIntensity = this.flash > 0 ? 0.8 : intensity;
    }

    // Doodgaan: langzaam wegzakken en vervagen in gouden licht
    if (this.dying > 0) {
      this.dying -= dt;
      const k = Math.max(0, this.dying / 1.5);
      this.mesh.scale.setScalar(0.4 + 0.6 * k);
      this.mesh.rotation.y += dt * (1 - k) * 6;
      if (Math.random() < 0.6) ctx.effects.burst(this.center, 0xffd76a, { count: 2, speed: 3, size: 0.15, life: 0.8, up: 4, gravity: -0.2 });
      if (this.dying <= 0) this.mesh.visible = false;
      return;
    }
    if (!this.alive || !this.awake) {
      this.idleAnimation?.(dt);
      return;
    }

    // Fase 2 bij de helft van het leven
    if (!this.phase2 && this.hp <= this.info.hp / 2) {
      this.phase2 = true;
      play('charge');
      ctx.effects.shake(0.4);
      ctx.effects.burst(this.center, 0xff3b3b, { count: 40, speed: 8, size: 0.2, life: 0.9, up: 3 });
      this.onPhase2?.(ctx);
    }

    for (let i = this.events.length - 1; i >= 0; i--) {
      const e = this.events[i];
      e.t -= dt;
      if (e.t <= 0) {
        this.events.splice(i, 1);
        e.fn();
      }
    }

    this.think(dt, ctx);

    // Binnen de arena blijven
    const d = flatDist(this.position, this.arena.center);
    const max = this.arena.radius - this.type.radius;
    if (d > max) {
      tmp.copy(this.position).sub(this.arena.center).setY(0).multiplyScalar(max / d);
      this.position.x = this.arena.center.x + tmp.x;
      this.position.z = this.arena.center.z + tmp.z;
    }
  }

  /** Klap op de grond: schokgolf + schade voor de speler als die te dichtbij staat. */
  groundImpact(ctx, pos, radius, damage, color = 0xd8c9a8) {
    play('slam');
    ctx.effects.shockwave(pos, color, radius);
    ctx.effects.burst(pos.clone().setY(0.3), 0x9a8f7a, { count: 26, speed: 7, size: 0.2, life: 0.7, up: 2 });
    const playerDist = flatDist(ctx.player.position, pos);
    ctx.effects.shake(playerDist < radius * 2 ? 0.6 : 0.25);
    if (playerDist < radius + 0.4 && ctx.player.position.y < pos.y + 1.5) ctx.hurtPlayer(pos, damage);
  }
}

const WHITE = new THREE.Color(0xffffff);

// ======================================================================
// Boss 1: Koning Slijm — springt hoog op je af en roept slijmpjes op
// ======================================================================
class KingSlime extends Boss {
  constructor(scene, arena) {
    super(scene, arena, 'koning');
    this.type = { name: this.name, radius: 2.2, height: 3.2, color: 0x4fcf6a, damage: 20, stompable: false };
    const { body, materials } = buildSlime(this.type, true);
    this.body = body;
    this.mesh.add(body);
    // Een gouden kroon
    const gold = new THREE.MeshStandardMaterial({ color: 0xffc83d, metalness: 0.6, roughness: 0.3, emissive: 0x000000 });
    const crown = new THREE.Group();
    crown.add(new THREE.Mesh(new THREE.CylinderGeometry(0.75, 0.8, 0.35, 16, 1, true), gold));
    for (let i = 0; i < 6; i++) {
      const spike = new THREE.Mesh(new THREE.ConeGeometry(0.14, 0.45, 6), gold);
      const a = (i / 6) * Math.PI * 2;
      spike.position.set(Math.sin(a) * 0.75, 0.38, Math.cos(a) * 0.75);
      crown.add(spike);
    }
    crown.position.y = this.type.height * 0.42;
    body.add(crown);
    this.rememberMaterials([...materials, gold]);
    this.summoned = 0;
  }

  resetFight() {
    super.resetFight();
    this.summonsDone = 0;
  }

  idleAnimation() {
    if (!this.body) return;
    const s = 1 + Math.sin((this.time ?? 0) * 2) * 0.03;
    this.body.scale.set(1 / s, s, 1 / s);
    this.body.position.y = this.type.height / 2;
  }

  think(dt, ctx) {
    const player = ctx.player.position;
    const dist = flatDist(this.position, player);
    const h = this.type.height;
    this.timer -= dt;

    switch (this.state) {
      case 'idle':
      case 'chase': {
        this.state = 'chase';
        // Huppen richting de speler
        const hop = Math.abs(Math.sin(this.time * (this.phase2 ? 7 : 5)));
        this.body.position.y = h / 2 + hop * 0.5;
        const squash = 1 - (1 - hop) * 0.15;
        this.body.scale.set(1 / Math.sqrt(squash), squash, 1 / Math.sqrt(squash));
        turnTowards(this.mesh, angleTo(this.position, player), 4, dt);
        if (dist > 2.5) {
          tmp.copy(player).sub(this.position).setY(0).normalize();
          this.position.addScaledVector(tmp, (this.phase2 ? 4 : 3) * dt);
        }
        this.cooldown -= dt;
        // Slijmpjes oproepen bij 66% en 33% leven
        const thresholds = [0.66, 0.33];
        if (this.summonsDone < 2 && this.hp / this.info.hp < thresholds[this.summonsDone]) {
          this.summonsDone++;
          this.state = 'summon';
          this.timer = 1;
          play('charge');
          break;
        }
        if (this.cooldown <= 0) {
          if (dist > 6 || Math.random() < 0.55) {
            this.state = 'jumpWindup';
            this.timer = this.phase2 ? 0.4 : 0.55;
            this.jumpsLeft = this.phase2 ? 2 : 1;
          } else {
            this.state = 'smashWindup';
            this.timer = 0.6;
            ctx.effects.warnCircle(this.position, 3.8, 0.6);
          }
        }
        break;
      }
      case 'summon': {
        this.body.scale.set(1.15, 0.85 + Math.sin(this.time * 30) * 0.05, 1.15);
        if (this.timer <= 0) {
          for (let i = 0; i < 3; i++) {
            const a = (i / 3) * Math.PI * 2 + Math.random();
            const x = this.position.x + Math.sin(a) * 3.5;
            const z = this.position.z + Math.cos(a) * 3.5;
            ctx.spawnEnemy('slijmpje', x, z);
            ctx.effects.burst(new THREE.Vector3(x, 0.5, z), 0x6fd36a, { count: 12 });
          }
          this.state = 'chase';
          this.cooldown = 1;
        }
        break;
      }
      case 'jumpWindup': {
        this.body.scale.set(1.25, 0.7, 1.25);
        this.body.position.y = h * 0.35;
        if (this.timer <= 0) {
          this.state = 'air';
          this.airTime = 1.0;
          this.timer = this.airTime;
          this.jumpFrom = this.position.clone();
          this.jumpTo = player.clone().setY(0);
          ctx.effects.warnCircle(this.jumpTo, 4.2, this.airTime);
          play('jump');
        }
        break;
      }
      case 'air': {
        const t = 1 - this.timer / this.airTime;
        this.position.lerpVectors(this.jumpFrom, this.jumpTo, t);
        this.position.y = 9 * 4 * t * (1 - t);
        this.body.scale.set(0.9, 1.2, 0.9);
        this.body.position.y = h / 2;
        if (this.timer <= 0) {
          this.position.y = 0;
          this.groundImpact(ctx, this.position, 4.2, 34, 0x9be89a);
          this.jumpsLeft--;
          if (this.jumpsLeft > 0) {
            this.state = 'jumpWindup';
            this.timer = 0.35;
          } else {
            this.state = 'recover';
            this.timer = 0.9;
          }
        }
        break;
      }
      case 'smashWindup': {
        this.body.scale.set(0.85, 1.25, 0.85);
        if (this.timer <= 0) {
          this.groundImpact(ctx, this.position, 3.8, 24, 0x9be89a);
          this.state = 'recover';
          this.timer = 0.7;
        }
        break;
      }
      case 'recover': {
        // Even plat en kwetsbaar: dit is je kans!
        this.body.scale.lerp(new THREE.Vector3(1.2, 0.8, 1.2), Math.min(1, 10 * dt));
        this.body.position.y = h * 0.4;
        if (this.timer <= 0) {
          this.state = 'chase';
          this.cooldown = this.phase2 ? 1.2 : 2;
        }
        break;
      }
    }
  }
}

// ======================================================================
// Boss 2: De Gevallen Ridder — combo's, een stoot naar voren en een sprong
// ======================================================================
const KNIGHT_SIZE = 2.8; // meter hoog

class FallenKnight extends Boss {
  constructor(scene, arena) {
    super(scene, arena, 'ridder');
    this.type = { name: this.name, radius: 0.9, height: KNIGHT_SIZE, color: 0x8a1c1c, damage: 15, stompable: false };
    this.trail = new SwordTrail(scene);
    this.trail.setColor(0xff3030);
    this.rig = null;
    this.pose = { armRx: -0.35, armRz: 0, wrist: -0.55, armLx: 0, armLz: 0.1, twist: 0, lean: 0 };

    loadGLB('models/speler.glb').then((gltf) => {
      const model = gltf.scene.clone(true);
      // Eigen, donkerrode materialen (anders verandert de speler ook mee!)
      const mats = [];
      model.traverse((child) => {
        if (!child.isMesh) return;
        child.material = child.material.clone();
        child.material.color.multiply(new THREE.Color(0.9, 0.35, 0.35));
        child.material.emissive = new THREE.Color(0x330000);
        child.material.emissiveIntensity = 1;
        child.castShadow = true;
        mats.push(child.material);
      });
      model.updateMatrixWorld(true);
      const box = new THREE.Box3().setFromObject(model);
      const scale = KNIGHT_SIZE / (box.max.y - box.min.y);
      model.scale.setScalar(scale);
      model.position.y = -box.min.y * scale;
      this.mesh.add(model);
      this.rememberMaterials(mats);

      const part = (name) => model.getObjectByName(name);
      this.rig = { hips: part('Hips'), armL: part('ArmL'), armR: part('ArmR'), legL: part('LegL'), legR: part('LegR'), handR: part('HandR') };
      this.baseHipsY = this.rig.hips.position.y;
      part('HeadSlot')?.add(createHelmetMesh('kap'));
      // Een enorm diamanten zwaard
      this.grip = new THREE.Group();
      this.grip.rotation.x = Math.PI / 2;
      this.grip.scale.setScalar((1 / scale) * 1.9);
      this.grip.add(createWeaponMesh('diamant'));
      this.rig.handR.add(this.grip);
    });
  }

  resetFight() {
    super.resetFight();
    this.combo = 0;
    this.trail?.cut();
  }

  /** Pose soepel richting een doel-houding bewegen. */
  blendPose(target, speed, dt) {
    const k = Math.min(1, speed * dt);
    for (const key of Object.keys(target)) this.pose[key] += (target[key] - this.pose[key]) * k;
  }

  applyPose(walk) {
    if (!this.rig) return;
    const { hips, armL, armR, legL, legR, handR } = this.rig;
    const p = this.pose;
    const swing = Math.sin(this.time * 9) * walk;
    legL.rotation.x = swing * 0.5;
    legR.rotation.x = -swing * 0.5;
    armR.rotation.x = p.armRx;
    armR.rotation.z = p.armRz;
    handR.rotation.x = p.wrist;
    armL.rotation.x = p.armLx - swing * 0.4;
    armL.rotation.z = p.armLz;
    hips.rotation.y = p.twist;
    hips.rotation.x = p.lean;
  }

  idleAnimation(dt) {
    if (!this.rig) return;
    // Wacht geknield, met het zwaard in de grond
    this.blendPose({ armRx: -0.6, armRz: 0, wrist: 1.4, armLx: -0.4, armLz: 0.3, twist: 0, lean: 0.35 }, 4, dt);
    this.applyPose(0);
  }

  bladeSample() {
    if (!this.grip) return;
    this.mesh.updateMatrixWorld(true);
    const base = this.grip.localToWorld(new THREE.Vector3(0, 0.3, 0));
    const tip = this.grip.localToWorld(new THREE.Vector3(0, 1.0, 0));
    this.trail.addSample(base, tip);
  }

  /** Raakt het zwaard de speler? (in een boog vóór de ridder) */
  slashHits(ctx, range, damage) {
    if (this.hitThisAttack) return;
    const toPlayer = ctx.player.position.clone().sub(this.position).setY(0);
    const dist = toPlayer.length();
    const facing = new THREE.Vector3(Math.sin(this.mesh.rotation.y), 0, Math.cos(this.mesh.rotation.y));
    if (dist < range && (dist < 1.2 || toPlayer.normalize().dot(facing) > -0.1) && ctx.player.position.y < 2.5) {
      if (ctx.hurtPlayer(this.position, damage)) this.hitThisAttack = true;
    }
  }

  think(dt, ctx) {
    this.trail.update(dt);
    if (!this.rig) return;
    const player = ctx.player.position;
    const dist = flatDist(this.position, player);
    const speedUp = this.phase2 ? 1.35 : 1;
    this.timer -= dt * speedUp;
    let walk = 0;

    switch (this.state) {
      case 'idle':
      case 'walk': {
        this.state = 'walk';
        turnTowards(this.mesh, angleTo(this.position, player), 5, dt);
        this.blendPose({ armRx: -0.4, armRz: -0.2, wrist: -0.5, armLx: 0, armLz: 0.15, twist: 0, lean: 0.08 }, 8, dt);
        if (dist > 3.2) {
          tmp.copy(player).sub(this.position).setY(0).normalize();
          this.position.addScaledVector(tmp, (this.phase2 ? 4 : 3.1) * dt);
          walk = 1;
        }
        this.cooldown -= dt * speedUp;
        if (this.cooldown <= 0) {
          const r = Math.random();
          if (dist < 4.5) this.startAttack(r < 0.7 ? 'combo' : 'leap', ctx);
          else if (dist < 13) this.startAttack(r < 0.55 ? 'lunge' : 'leap', ctx);
          else if (r < 0.4) this.startAttack('leap', ctx);
        }
        break;
      }
      case 'slashWindup': {
        // Uithalen naar de kant waar de slag begint
        turnTowards(this.mesh, angleTo(this.position, player), 6, dt);
        const s = this.slashDir;
        this.blendPose({ armRx: -1.35, armRz: s > 0 ? -1.6 : 1.2, wrist: 1.2, armLx: -0.3, armLz: 0.4, twist: s > 0 ? -0.6 : 0.5, lean: 0 }, 10, dt);
        if (this.timer <= 0) {
          this.state = 'slash';
          this.timer = 0.24;
          this.hitThisAttack = false;
          this.trail.cut();
          play('heavySwing');
          tmp.set(Math.sin(this.mesh.rotation.y), 0, Math.cos(this.mesh.rotation.y));
          this.position.addScaledVector(tmp, 1.2); // stapje naar voren
        }
        break;
      }
      case 'slash': {
        const s = this.slashDir;
        this.blendPose({ armRx: -1.35, armRz: s > 0 ? 1.2 : -1.6, wrist: 1.3, twist: s > 0 ? 0.6 : -0.6 }, 22, dt);
        this.bladeSample();
        this.slashHits(ctx, 4.8, 26);
        if (this.timer <= 0) {
          this.combo--;
          if (this.combo > 0) {
            this.slashDir = -this.slashDir;
            this.state = 'slashWindup';
            this.timer = 0.3;
          } else {
            this.state = 'recover';
            this.timer = 0.8;
          }
        }
        break;
      }
      case 'lungeWindup': {
        turnTowards(this.mesh, angleTo(this.position, player), 6, dt);
        this.blendPose({ armRx: 0.5, armRz: -0.3, wrist: 1.4, armLx: -0.8, armLz: 0.3, twist: -0.5, lean: 0.25 }, 8, dt);
        if (this.timer <= 0) {
          this.state = 'lunge';
          this.timer = 0.42;
          this.hitThisAttack = false;
          this.trail.cut();
          this.lungeDir = new THREE.Vector3(Math.sin(this.mesh.rotation.y), 0, Math.cos(this.mesh.rotation.y));
          play('heavySwing');
        }
        break;
      }
      case 'lunge': {
        this.blendPose({ armRx: -1.55, armRz: 0, wrist: 1.57, twist: 0.3, lean: 0.3 }, 25, dt);
        this.position.addScaledVector(this.lungeDir, 15 * dt);
        this.bladeSample();
        if (flatDist(this.position, player) < 2.6) this.slashHits(ctx, 2.6, 32);
        if (this.timer <= 0) {
          this.state = 'recover';
          this.timer = 0.7;
        }
        break;
      }
      case 'leapWindup': {
        this.blendPose({ armRx: -2.8, armRz: -0.2, wrist: 0.6, armLx: -2.6, armLz: 0.2, twist: 0, lean: 0.35 }, 10, dt);
        if (this.timer <= 0) {
          this.state = 'leap';
          this.airTime = 0.9;
          this.timer = this.airTime;
          this.jumpFrom = this.position.clone();
          this.jumpTo = player.clone().setY(0);
          ctx.effects.warnCircle(this.jumpTo, 3.4, this.airTime / speedUp);
          play('jump');
        }
        break;
      }
      case 'leap': {
        const t = Math.min(1, 1 - this.timer / this.airTime);
        this.position.lerpVectors(this.jumpFrom, this.jumpTo, t);
        this.position.y = 7 * 4 * t * (1 - t);
        this.blendPose({ armRx: t < 0.6 ? -2.9 : -0.6, lean: t < 0.6 ? -0.2 : 0.5 }, 14, dt);
        if (this.timer <= 0) {
          this.position.y = 0;
          this.groundImpact(ctx, this.position, 3.4, 34, 0xff8a6a);
          this.state = 'recover';
          this.timer = 0.9;
        }
        break;
      }
      case 'recover': {
        this.blendPose({ armRx: -0.3, armRz: 0, wrist: 0.8, armLx: 0, armLz: 0.2, twist: 0, lean: 0.2 }, 6, dt);
        if (this.timer <= 0) {
          this.state = 'walk';
          this.cooldown = this.phase2 ? 0.5 : 1.1;
        }
        break;
      }
    }
    this.rig.hips.position.y = this.baseHipsY + Math.abs(Math.sin(this.time * 9)) * walk * 0.05 / (this.mesh.children[0]?.scale.x ?? 1);
    this.applyPose(walk);
  }

  startAttack(kind, ctx) {
    this.hitThisAttack = false;
    if (kind === 'combo') {
      this.state = 'slashWindup';
      this.timer = 0.5;
      this.combo = this.phase2 ? 3 : 2;
      this.slashDir = 1;
    } else if (kind === 'lunge') {
      this.state = 'lungeWindup';
      this.timer = 0.65;
    } else {
      this.state = 'leapWindup';
      this.timer = 0.5;
    }
    if (kind !== 'leap') play('charge');
  }

  onPhase2() {
    this.trail.setColor(0xff7a1a);
    for (const { m } of this.materials) m.emissive?.set(0x661100);
    this.materials.forEach((entry) => entry.color.set(0x661100));
  }
}

// ======================================================================
// Boss 3: Steenreus Gorath — schokgolven, rotsblokken gooien, stampen
// ======================================================================
const GIANT_SCALE = 2.3;

class StoneGiant extends Boss {
  constructor(scene, arena) {
    super(scene, arena, 'reus');
    this.type = { name: this.name, radius: 2.0, height: 2 * GIANT_SCALE, color: 0x7d7468, damage: 20, stompable: false };
    const model = buildGolem({ color: 0x7d7468 });
    this.model = model;
    this.body = model.body;
    this.body.scale.setScalar(GIANT_SCALE);
    this.mesh.add(this.body);
    for (const p of model.pebbles) p.visible = false; // de reus gooit liever echte rotsblokken
    this.rememberMaterials(model.materials);
    this.rocks = [];
  }

  resetFight() {
    super.resetFight();
    for (const r of this.rocks ?? []) this.scene.remove(r.mesh);
    if (this.rocks) this.rocks.length = 0;
    if (this.model) this.model.eyeMat.color.set(0xffa630);
  }

  idleAnimation() {
    if (!this.model) return;
    // Zit stil als een rots... tot je dichtbij komt
    for (const arm of this.model.arms) arm.rotation.x = 0.2;
    this.model.eyeMat.emissiveIntensity = 0.3;
  }

  onPhase2() {
    this.model.eyeMat.color.set(0xff2a2a);
    this.model.eyeMat.emissive.set(0xff0000);
  }

  armsTo(x, dt, speed = 10) {
    for (const arm of this.model.arms) arm.rotation.x += (x - arm.rotation.x) * Math.min(1, speed * dt);
  }

  throwRock(ctx, target) {
    const hand = this.position.clone().add(new THREE.Vector3(0, 4.5, 0));
    const mesh = new THREE.Mesh(new THREE.DodecahedronGeometry(0.8, 0), new THREE.MeshStandardMaterial({ color: 0x8a8278, flatShading: true }));
    mesh.castShadow = true;
    mesh.position.copy(hand);
    this.scene.add(mesh);
    const flight = 1.1;
    ctx.effects.warnCircle(target, 2.6, flight);
    this.rocks.push({ mesh, from: hand, to: target.clone(), t: 0, flight });
    play('heavySwing');
  }

  think(dt, ctx) {
    const player = ctx.player.position;
    const dist = flatDist(this.position, player);
    const { arms, eyeMat } = this.model;
    this.timer -= dt;
    eyeMat.emissiveIntensity = (this.phase2 ? 4 : 2) + Math.sin(this.time * 6);

    // Rotsblokken in de lucht
    for (let i = this.rocks.length - 1; i >= 0; i--) {
      const r = this.rocks[i];
      r.t += dt;
      const k = Math.min(1, r.t / r.flight);
      r.mesh.position.lerpVectors(r.from, r.to, k);
      r.mesh.position.y = THREE.MathUtils.lerp(r.from.y, 0.8, k) + 10 * 4 * k * (1 - k);
      r.mesh.rotation.x += dt * 8;
      if (k >= 1) {
        this.scene.remove(r.mesh);
        r.mesh.geometry.dispose();
        this.rocks.splice(i, 1);
        this.groundImpact(ctx, r.to, 2.6, 30);
      }
    }

    switch (this.state) {
      case 'idle':
      case 'walk': {
        this.state = 'walk';
        turnTowards(this.mesh, angleTo(this.position, player), 2.5, dt);
        const step = Math.sin(this.time * 4);
        arms[0].rotation.x = step * 0.35;
        arms[1].rotation.x = -step * 0.35;
        this.body.rotation.z = step * 0.05;
        if (dist > 4) {
          tmp.copy(player).sub(this.position).setY(0).normalize();
          this.position.addScaledVector(tmp, (this.phase2 ? 2.6 : 1.9) * dt);
          if (Math.abs(step) > 0.97 && !this.stepped) {
            ctx.effects.shake(0.08); // dreun bij elke stap
            this.stepped = true;
          } else if (Math.abs(step) < 0.9) this.stepped = false;
        }
        this.cooldown -= dt;
        if (this.cooldown <= 0) {
          if (dist < 4.5) {
            this.state = 'stompWindup';
            this.timer = 0.5;
            ctx.effects.warnCircle(this.position, 4.4, 0.5);
          } else if (dist < 10 && Math.random() < 0.6) {
            this.state = 'slamWindup';
            this.timer = this.phase2 ? 0.8 : 1.05;
            ctx.effects.warnCircle(this.position, 7, this.timer);
            play('charge');
          } else {
            this.state = 'throwWindup';
            this.timer = 0.8;
          }
        }
        break;
      }
      case 'stompWindup': {
        this.body.rotation.z = THREE.MathUtils.lerp(this.body.rotation.z, 0.25, Math.min(1, 10 * dt));
        if (this.timer <= 0) {
          this.body.rotation.z = 0;
          this.groundImpact(ctx, this.position, 4.4, 24);
          this.state = 'recover';
          this.timer = 0.6;
        }
        break;
      }
      case 'slamWindup': {
        this.armsTo(-2.9, dt);
        this.body.rotation.x = THREE.MathUtils.lerp(this.body.rotation.x, -0.2, Math.min(1, 6 * dt));
        this.body.position.x = (Math.random() - 0.5) * 0.08;
        if (this.timer <= 0) {
          this.body.position.x = 0;
          this.armsTo(0.6, 1);
          this.body.rotation.x = 0.3;
          this.groundImpact(ctx, this.position, 7, 40);
          if (this.phase2) {
            // Fase 2: de grond barst open onder de speler, drie keer achter elkaar
            for (let i = 0; i < 3; i++) {
              this.schedule(0.35 + i * 0.55, () => {
                const at = ctx.player.position.clone().setY(0);
                ctx.effects.warnCircle(at, 2.4, 0.55);
                this.schedule(0.55, () => this.groundImpact(ctx, at, 2.4, 22, 0xff7b3b));
              });
            }
          }
          this.state = 'recover';
          this.timer = this.phase2 ? 1.0 : 1.2;
        }
        break;
      }
      case 'throwWindup': {
        turnTowards(this.mesh, angleTo(this.position, player), 4, dt);
        arms[1].rotation.x += (-2.6 - arms[1].rotation.x) * Math.min(1, 8 * dt);
        if (this.timer <= 0) {
          arms[1].rotation.x = 0.4;
          const lead = ctx.player.velocity.clone().setY(0).multiplyScalar(0.6);
          const target = player.clone().setY(0).add(lead);
          this.throwRock(ctx, target);
          if (this.phase2) {
            for (const side of [-1, 1]) {
              const off = new THREE.Vector3(Math.cos(this.mesh.rotation.y), 0, -Math.sin(this.mesh.rotation.y)).multiplyScalar(side * 3.5);
              this.throwRock(ctx, target.clone().add(off));
            }
          }
          this.state = 'recover';
          this.timer = 0.8;
        }
        break;
      }
      case 'recover': {
        this.armsTo(0, dt, 4);
        this.body.rotation.x = THREE.MathUtils.lerp(this.body.rotation.x, 0, Math.min(1, 4 * dt));
        if (this.timer <= 0) {
          this.state = 'walk';
          this.cooldown = this.phase2 ? 0.9 : 1.5;
        }
        break;
      }
    }
  }
}

// ======================================================================
// Boss 4: Budget Mario — vliegt als Superman, duikt op je af, stampt op de grond en gooit vuurballen.
// Met een zwaard raak je hem alleen als hij op de grond is.
// ======================================================================
const MARIO_LENGTH = 3.6;
const FLY_HEIGHT = 5;

class FlyingMario extends Boss {
  constructor(scene, arena) {
    super(scene, arena, 'mario');
    this.type = { name: this.name, radius: 1.4, height: 2, color: 0xe23b2e, damage: 20, stompable: false };
    this.pivot = new THREE.Group(); // draait het model: liggend (vliegen) of rechtop (staan)
    this.mesh.add(this.pivot);
    this.standing = 1; // 1 = rechtop, 0 = vliegend
    loadGLB('models/bosses/mario.glb').then((gltf) => {
      const model = gltf.scene.clone(true);
      model.updateMatrixWorld(true);
      const box = new THREE.Box3().setFromObject(model);
      const size = box.getSize(new THREE.Vector3());
      const center = box.getCenter(new THREE.Vector3());
      const s = MARIO_LENGTH / size.z;
      model.scale.setScalar(s);
      model.position.copy(center).multiplyScalar(-s); // midden van het model in het draaipunt
      const mats = [];
      model.traverse((c) => {
        if (!c.isMesh) return;
        c.castShadow = true;
        c.material = c.material.clone();
        mats.push(c.material);
      });
      this.pivot.add(model);
      this.rememberMaterials(mats.filter((m) => m.emissive));
    });
  }

  resetFight() {
    super.resetFight();
    this.orbit = 0;
    this.standing = 1;
    this.vel = new THREE.Vector3();
  }

  /** Model rechtop (1) of liggend in vliegstand (0). */
  applyStance(dt, target) {
    this.standing += (target - this.standing) * Math.min(1, 6 * dt);
    this.pivot.rotation.x = -Math.PI / 2 * this.standing;
    this.pivot.position.y = (MARIO_LENGTH / 2) * this.standing + 0.6 * (1 - this.standing);
  }

  idleAnimation(dt) {
    this.applyStance(dt ?? 0.016, 1);
    this.pivot.rotation.z = Math.sin((this.time ?? 0) * 2) * 0.05;
  }

  think(dt, ctx) {
    const player = ctx.player.position;
    const dist = flatDist(this.position, player);
    const speedUp = this.phase2 ? 1.3 : 1;
    this.timer -= dt * speedUp;

    switch (this.state) {
      case 'idle':
        this.state = 'takeoff';
        this.timer = 1;
        break;
      case 'takeoff': {
        this.applyStance(dt, 0);
        this.position.y += (FLY_HEIGHT - this.position.y) * Math.min(1, 3 * dt);
        if (Math.random() < 0.4) ctx.effects.burst(this.position.clone(), 0xffffff, { count: 1, speed: 1, size: 0.2, life: 0.5, up: -1, gravity: 0 });
        if (this.timer <= 0) {
          this.state = 'fly';
          this.cooldown = 1.5;
        }
        break;
      }
      case 'fly': {
        // Rondjes vliegen om de speler heen
        this.applyStance(dt, 0);
        this.orbit += dt * (this.phase2 ? 0.9 : 0.6);
        const goal = player.clone().add(new THREE.Vector3(Math.sin(this.orbit) * 10, 0, Math.cos(this.orbit) * 10));
        goal.y = FLY_HEIGHT + Math.sin(this.time * 2) * 0.7;
        const before = this.position.clone();
        this.position.lerp(goal, Math.min(1, 1.6 * dt));
        const vel = this.position.clone().sub(before);
        if (vel.lengthSq() > 1e-6) turnTowards(this.mesh, Math.atan2(vel.x, vel.z), 5, dt);
        this.pivot.rotation.z = Math.sin(this.time * 3) * 0.25; // schuin hangen in de bocht
        this.cooldown -= dt * speedUp;
        if (this.cooldown <= 0) {
          const r = Math.random();
          if (r < 0.4) {
            this.state = 'diveAim';
            this.timer = 0.7;
          } else if (r < 0.72) {
            this.state = 'poundRise';
            this.timer = 1.1;
          } else {
            this.state = 'fireballs';
            this.timer = 0.4;
            this.shotsLeft = this.phase2 ? 5 : 3;
          }
          play('charge');
        }
        break;
      }
      case 'diveAim': {
        // Hangt stil en kijkt je aan... en dan: duiken!
        this.applyStance(dt, 0);
        turnTowards(this.mesh, angleTo(this.position, player), 8, dt);
        this.pivot.rotation.z = Math.sin(this.time * 40) * 0.08;
        if (this.timer <= 0) {
          this.diveTarget = player.clone().setY(0.6);
          ctx.effects.warnCircle(this.diveTarget.clone().setY(0), 2.4, 0.5);
          this.vel = this.diveTarget.clone().sub(this.position).setLength(24);
          this.state = 'dive';
          this.timer = 1.2;
          this.hitThisAttack = false;
          play('heavySwing');
        }
        break;
      }
      case 'dive': {
        this.position.addScaledVector(this.vel, dt);
        this.pivot.rotation.z += dt * 14; // tollen als een kurkentrekker
        if (!this.hitThisAttack && this.center.distanceTo(player.clone().setY(player.y + 0.9)) < 2) {
          if (ctx.hurtPlayer(this.position, 22)) this.hitThisAttack = true;
        }
        if (this.position.y <= 0.3 || this.timer <= 0) {
          this.position.y = 0;
          this.groundImpact(ctx, this.position, 2.6, 0, 0xff8a6a);
          this.state = 'skid';
          this.timer = 1.1;
          this.vel.y = 0;
        }
        break;
      }
      case 'skid': {
        // Glijdt over de grond: kwetsbaar!
        this.pivot.rotation.z *= 0.9;
        this.applyStance(dt, 0.15);
        this.position.addScaledVector(this.vel, dt * Math.max(0, this.timer) * 0.6);
        if (Math.random() < 0.5) ctx.effects.burst(this.position.clone().setY(0.2), 0xb8a58c, { count: 2, speed: 2, size: 0.15, life: 0.4, up: 1 });
        if (this.timer <= 0) {
          this.state = 'takeoff';
          this.timer = 1;
        }
        break;
      }
      case 'poundRise': {
        // Vliegt hoog boven je hoofd en volgt je...
        this.applyStance(dt, 0.6);
        const goal = player.clone().setY(10);
        this.position.lerp(goal, Math.min(1, 4 * dt));
        this.pivot.rotation.z += dt * 10;
        if (this.timer <= 0) {
          this.state = 'poundHang';
          this.timer = 0.5;
          this.poundAt = this.position.clone().setY(0);
          ctx.effects.warnCircle(this.poundAt, 3.8, 0.5 / speedUp + 0.3);
        }
        break;
      }
      case 'poundHang': {
        this.applyStance(dt, 1);
        this.pivot.rotation.z = 0;
        if (this.timer <= 0) this.state = 'poundFall';
        break;
      }
      case 'poundFall': {
        this.position.y -= 32 * dt;
        if (this.position.y <= 0) {
          this.position.y = 0;
          this.groundImpact(ctx, this.position, 3.8, 36, 0xff5a3a);
          this.state = 'stunned';
          this.timer = this.phase2 ? 1.4 : 1.9;
        }
        break;
      }
      case 'stunned': {
        // Duizelig op de grond: sla hem nu!
        this.applyStance(dt, 1);
        this.pivot.rotation.z = Math.sin(this.time * 10) * 0.12;
        if (Math.random() < 0.3) ctx.effects.burst(this.position.clone().setY(MARIO_LENGTH + 0.3), 0xffe066, { count: 1, speed: 1, size: 0.14, life: 0.5, up: 0.5, gravity: 0 });
        if (this.timer <= 0) {
          this.state = 'takeoff';
          this.timer = 1;
        }
        break;
      }
      case 'fireballs': {
        this.applyStance(dt, 0.3);
        turnTowards(this.mesh, angleTo(this.position, player), 6, dt);
        if (this.timer <= 0) {
          const from = this.center;
          const to = player.clone().add(ctx.player.velocity.clone().setY(0).multiplyScalar(0.5));
          const dir = to.sub(from);
          const flat = Math.hypot(dir.x, dir.z);
          dir.y = flat * 0.35; // een boogje
          ctx.projectiles.spawn({ from, dir, speed: Math.min(16, 6 + flat * 0.6), damage: 14, kind: 'fire', gravity: 9, bounces: 2, radius: 0.4 });
          play('swing');
          this.shotsLeft--;
          this.timer = 0.35;
          if (this.shotsLeft <= 0) {
            this.state = 'fly';
            this.cooldown = this.phase2 ? 1 : 1.8;
          }
        }
        break;
      }
    }
  }
}

// Welke boss hoort bij welke arena-id. Omar (omarFighter.js) zet zichzelf hier ook bij.
export const BOSS_CLASSES = { koning: KingSlime, ridder: FallenKnight, reus: StoneGiant, mario: FlyingMario };

/** Maak alle bosses. `defeated` = lijst met id's van bosses die al verslagen zijn (uit de save). */
export function createBosses(scene, arenas, defeated) {
  return arenas.map((arena) => {
    const boss = new BOSS_CLASSES[arena.id](scene, arena);
    if (defeated.includes(arena.id)) boss.setDefeated();
    return boss;
  });
}
