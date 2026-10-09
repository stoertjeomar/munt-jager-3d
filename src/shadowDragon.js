import * as THREE from 'three';
import { Boss, BOSS_CLASSES, angleTo, turnTowards, flatDist } from './bosses.js';
import { buildDragon, animateDragon, DRAGON_SKINS } from './dragon.js';
import { play } from './audio.js';

// ======================================================================
// De eindbaas: de Schaduwdraak (in de arena van het Schaduwrijk)
// ======================================================================
// Een enorme paarse draak, net zo gebouwd als Vuurtand (dragon.js) maar twee keer zo groot.
//   - Hij vliegt rondjes boven de arena en schiet paarse vuurballen.
//   - Hij duikt naar beneden en landt met een klap: dan kun je hem raken!
//   - Op de grond spuwt hij vuur recht vooruit en zwiept hij met zijn staart (spring of rol weg).
//   - In fase 2 (de helft van zijn leven) roept hij Zombiepoppen op en wordt hij sneller.
// In de lucht kun je hem niet raken: wacht tot hij landt.

const SIZE = 1.9; // zoveel keer zo groot als Vuurtand
const FLY_HEIGHT = 9;
const BREATH = { range: 10, cone: 0.78, damage: 12 }; // vuur op de grond: bereik, breedte, schade per tik

const tmp = new THREE.Vector3();

export class ShadowDragon extends Boss {
  constructor(scene, arena) {
    super(scene, arena, 'schaduwdraak');
    this.type = { name: this.name, radius: 3.2, height: 5.5, color: 0x7a2ab0, damage: 26, stompable: false };
    this.parts = buildDragon(DRAGON_SKINS.schaduw, false);
    this.parts.root.scale.setScalar(SIZE);
    this.mesh.add(this.parts.root);
    // Paarse gloed om hem heen (sterker als hij boos is)
    const mats = Object.values(this.parts.materials).filter((m) => m.emissive);
    for (const m of mats) if (m !== this.parts.materials.eye) m.emissive.set(0x1a0628);
    this.rememberMaterials(mats);
    this.flapPhase = 0;
    this.velocity = new THREE.Vector3();
    this.breathing = 0;
  }

  resetFight() {
    super.resetFight();
    this.orbit = 0;
    this.velocity = new THREE.Vector3();
    this.breathing = 0;
    this.summons = 0;
    if (this.parts) this.parts.root.rotation.set(0, 0, 0);
  }

  /** Hoe hoog zijn lijf is (om hem te kunnen raken moet hij op de grond staan). */
  get center() {
    return this.position.clone().setY(this.position.y + 2.6 * SIZE * 0.5);
  }

  idleAnimation(dt) {
    // Slaapt opgerold op de grond tot je de arena in komt
    this.time = (this.time ?? 0) + (dt ?? 0);
    animateDragon(this, dt ?? 0.016, false, 0, false);
  }

  think(dt, ctx) {
    const player = ctx.player.position;
    const speedUp = this.phase2 ? 1.25 : 1;
    this.timer -= dt * speedUp;
    const before = this.position.clone();
    let flying = true;

    switch (this.state) {
      case 'idle':
        this.state = 'takeoff';
        this.timer = 1.2;
        play('roar');
        break;
      case 'takeoff':
        this.position.y += (FLY_HEIGHT - this.position.y) * Math.min(1, 2.5 * dt);
        if (this.timer <= 0) {
          this.state = 'fly';
          this.cooldown = 1.5;
        }
        break;
      case 'fly': {
        // Rondjes boven de arena, en dan een aanval kiezen
        this.orbit += dt * (this.phase2 ? 0.75 : 0.55);
        const goal = this.arena.center.clone().add(tmp.set(Math.sin(this.orbit) * 11, 0, Math.cos(this.orbit) * 11));
        goal.y = FLY_HEIGHT + Math.sin(this.time * 1.5) * 1.2;
        this.position.lerp(goal, Math.min(1, 1.4 * dt));
        this.cooldown -= dt * speedUp;
        if (this.cooldown <= 0) {
          const r = Math.random();
          if (this.phase2 && this.summons < 3 && r < 0.25) {
            this.state = 'summon';
            this.timer = 2;
            this.summons++;
          } else if (r < 0.55) {
            this.state = 'diveAim';
            this.timer = 0.8;
          } else {
            this.state = 'fireballs';
            this.timer = 0.5;
            this.shotsLeft = this.phase2 ? 6 : 4;
          }
          play('roar');
        }
        break;
      }
      case 'fireballs': {
        // Paarse vuurballen op je af (net een beetje voor je uit gemikt)
        turnTowards(this.mesh, angleTo(this.position, player), 6, dt);
        if (this.timer <= 0) {
          const from = this.center.add(tmp.set(Math.sin(this.mesh.rotation.y) * 3, 1.5, Math.cos(this.mesh.rotation.y) * 3));
          const to = player.clone().add(ctx.player.velocity.clone().setY(0).multiplyScalar(0.4)).setY(0.6);
          ctx.projectiles.spawn({ from, dir: to.sub(from), speed: 17, damage: 16, kind: 'energy', color: 0xb04dff, radius: 0.6 });
          play('breath');
          this.breathing = 0.3;
          this.shotsLeft--;
          this.timer = 0.45;
          if (this.shotsLeft <= 0) {
            this.state = 'fly';
            this.cooldown = this.phase2 ? 1.2 : 2;
          }
        }
        break;
      }
      case 'diveAim':
        // Hangt stil, kijkt je aan... en duikt!
        turnTowards(this.mesh, angleTo(this.position, player), 8, dt);
        if (this.timer <= 0) {
          this.diveTarget = player.clone().setY(0);
          ctx.effects.warnCircle(this.diveTarget.clone(), 4.5, 0.7);
          this.state = 'dive';
          this.timer = 0.7;
          play('heavySwing');
        }
        break;
      case 'dive': {
        const k = Math.min(1, dt * 3.2);
        this.position.x += (this.diveTarget.x - this.position.x) * k;
        this.position.z += (this.diveTarget.z - this.position.z) * k;
        this.position.y = Math.max(0, this.position.y - 22 * dt);
        if (this.position.y <= 0) {
          this.position.y = 0;
          this.groundImpact(ctx, this.position, 4.5, 34, 0xb04dff);
          this.state = 'ground';
          this.timer = 0.6;
          this.moves = this.phase2 ? 3 : 2; // zoveel aanvallen op de grond, daarna weer opvliegen
        }
        break;
      }
      case 'ground':
        // Op de grond: nu kun je hem raken! Even wachten, dan vuur of zijn staart
        flying = false;
        turnTowards(this.mesh, angleTo(this.position, player), 2.5, dt);
        if (this.timer <= 0) {
          if (this.moves <= 0) {
            this.state = 'takeoff';
            this.timer = 1.2;
            play('flap');
          } else {
            this.moves--;
            const behind = this.isBehind(player);
            if (behind || flatDist(this.position, player) < 5) {
              this.state = 'tail';
              this.timer = 0.9;
              ctx.effects.warnCircle(this.position.clone().setY(0), 6.5, 0.6);
            } else {
              this.state = 'breathGround';
              this.timer = 1.6;
              this.breathTick = 0.5; // eerst even inademen
              play('roar');
            }
          }
        }
        break;
      case 'tail':
        // Rondzwiepen met zijn staart: alles om hem heen krijgt een klap
        flying = false;
        this.mesh.rotation.y += dt * (this.timer < 0.6 ? 10 : 0);
        if (this.timer < 0.3 && !this.tailHit) {
          this.tailHit = true;
          play('heavySwing');
          ctx.effects.shockwave(this.position, 0xb04dff, 6.5);
          if (flatDist(this.position, player) < 6.5 && player.y < 1.6) ctx.hurtPlayer(this.position, 30);
        }
        if (this.timer <= 0) {
          this.tailHit = false;
          this.state = 'ground';
          this.timer = 0.9;
        }
        break;
      case 'breathGround': {
        // Paars vuur recht vooruit (draait langzaam mee)
        flying = false;
        turnTowards(this.mesh, angleTo(this.position, player), 1.2, dt);
        this.breathTick -= dt;
        if (this.timer < 1.1) {
          this.breathing = 0.2;
          const mouth = this.mouthPosition();
          const dir = tmp.set(Math.sin(this.mesh.rotation.y), -0.25, Math.cos(this.mesh.rotation.y)).normalize();
          ctx.effects.burst(mouth, Math.random() < 0.5 ? 0xb04dff : 0xe0a0ff, { count: 5, speed: 20, size: 0.45, life: 0.55, up: 0, gravity: 0.05, dir, spread: 0.3 });
          if (this.breathTick <= 0) {
            this.breathTick = 0.25;
            const to = player.clone().setY(player.y + 0.9).sub(mouth);
            const d = to.length();
            if (d < BREATH.range && to.normalize().dot(dir) > BREATH.cone) ctx.hurtPlayer(mouth, BREATH.damage);
          }
        }
        if (this.timer <= 0) {
          this.state = 'ground';
          this.timer = 0.8;
        }
        break;
      }
      case 'summon':
        // Landt in het midden en roept Zombiepoppen op uit de grond
        this.position.lerp(this.arena.center.clone().setY(0), Math.min(1, 2 * dt));
        flying = this.position.y > 0.3;
        if (this.timer <= 0) {
          for (let i = 0; i < 3; i++) {
            const a = Math.random() * Math.PI * 2;
            const at = this.arena.center.clone().add(tmp.set(Math.sin(a) * 9, 0, Math.cos(a) * 9));
            const zombie = ctx.spawnEnemy('zombiepop', at.x, at.z);
            zombie.woken = true; // ze staan meteen op
            ctx.effects.burst(at.clone().setY(1), 0x2a0a3a, { count: 20, speed: 3, size: 0.3, life: 0.7, up: 2, gravity: 0 });
          }
          play('laugh');
          this.state = 'ground';
          this.timer = 0.5;
          this.moves = 1;
        }
        break;
    }

    // Vleugels, staart, poten en bek
    this.velocity.copy(this.position).sub(before).divideScalar(Math.max(dt, 1e-3));
    this.breathing = Math.max(0, this.breathing - dt);
    animateDragon(this, dt, flying, Math.hypot(this.velocity.x, this.velocity.z), flying && Math.random() < 0.5);
    // In fase 2: paarse rook om hem heen
    if (this.phase2 && Math.random() < 0.3) ctx.effects.burst(this.center, 0x5a1a8a, { count: 1, speed: 2, size: 0.4, life: 0.8, up: 1, gravity: 0 });
  }

  /** Staat dit punt achter hem? */
  isBehind(p) {
    const fx = Math.sin(this.mesh.rotation.y);
    const fz = Math.cos(this.mesh.rotation.y);
    return (p.x - this.position.x) * fx + (p.z - this.position.z) * fz < -1;
  }

  mouthPosition() {
    this.mesh.updateMatrixWorld(true);
    return this.parts.mouth.getWorldPosition(new THREE.Vector3());
  }

  onPhase2(ctx) {
    play('roar');
    ctx.effects.shake(0.6);
  }
}

BOSS_CLASSES.schaduwdraak = ShadowDragon;
