import * as THREE from 'three';
import { Input } from './input.js';
import { CameraRig } from './camera.js';
import { Player, MAX_HEALTH } from './player.js';
import { createWorld, animateCoins } from './world.js';
import { createEnemies } from './enemies.js';
import { Effects } from './effects.js';
import { SwordTrail } from './trail.js';
import { Drops } from './drops.js';
import { play, unlockAudio, toggleMute } from './audio.js';
import { WEAPONS } from './weapons.js';
import { createPickups, resetPickups, findNearbyPickup, swapWeapon } from './pickups.js';

// ---------- Basis: renderer, scene, camera ----------
const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.toneMapping = THREE.ACESFilmicToneMapping; // mooiere, zachtere kleuren
renderer.toneMappingExposure = 1.15;
document.body.appendChild(renderer.domElement);

const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(60, window.innerWidth / window.innerHeight, 0.1, 200);

window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});

// ---------- Game-objecten ----------
const input = new Input();
const world = createWorld(scene);
const player = new Player(scene);
const enemies = createEnemies(scene);
const pickups = createPickups(scene);
const effects = new Effects(scene);
const trail = new SwordTrail(scene);
const drops = new Drops(scene);
const cameraRig = new CameraRig(camera, renderer.domElement);
cameraRig.snapTo(player.position);

// ---------- HUD ----------
const scoreEl = document.getElementById('score');
const timerEl = document.getElementById('timer');
const healthEl = document.getElementById('health');
const enemiesEl = document.getElementById('enemies');
const weaponEl = document.getElementById('weapon');
const pickupHintEl = document.getElementById('pickup-hint');
const messageEl = document.getElementById('message');

// ---------- Game state ----------
const state = {
  score: 0,
  time: 0,
  finished: false,
  hitstop: 0, // heel even stilstaan bij een klap: dan voelt het krachtiger
};

function resetGame() {
  state.score = 0;
  state.time = 0;
  state.finished = false;
  for (const enemy of enemies) enemy.reset();
  resetPickups(pickups);
  effects.clear();
  drops.clear();
  trail.cut();
  for (const coin of world.coins) {
    coin.collected = false;
    coin.mesh.visible = true;
  }
  player.reset();
  cameraRig.snapTo(player.position);
  messageEl.classList.add('hidden');
}

function collectCoins() {
  const playerCenter = player.position.clone().add(new THREE.Vector3(0, 0.8, 0));
  for (const coin of world.coins) {
    if (coin.collected) continue;
    if (coin.mesh.position.distanceTo(playerCenter) < 1.1) {
      coin.collected = true;
      coin.mesh.visible = false;
      state.score++;
      play('coin');
      effects.burst(coin.mesh.position, 0xffd700, { count: 12, speed: 4, size: 0.1, life: 0.5, up: 3 });
    }
  }

  if (state.score === world.coins.length && !state.finished) {
    state.finished = true;
    messageEl.innerHTML = `
      <h1>Gewonnen!</h1>
      <p>Alle ${world.coins.length} munten in ${state.time.toFixed(1)} seconden</p>
      <p>Vijanden verslagen: ${enemies.filter((e) => !e.alive).length} / ${enemies.length}</p>
      <p>Druk op <b>R</b> om opnieuw te spelen</p>`;
    messageEl.classList.remove('hidden');
    play('win');
  }
}

// ---------- Zwaard: slaan met F, of klikken (als de muis vastzit in het spel) ----------
let attackRequested = false;
renderer.domElement.addEventListener('pointerdown', (e) => {
  unlockAudio(); // geluid mag pas na een klik
  // De eerste klik zet alleen de muis vast; daarna is klikken = slaan
  if (e.button === 0 && cameraRig.locked) attackRequested = true;
});

// Uitleg "klik om te spelen" tonen zolang de muis niet vastzit
const lockHintEl = document.getElementById('lock-hint');
document.addEventListener('pointerlockchange', () => {
  lockHintEl.classList.toggle('hidden', cameraRig.locked);
});

function swordAttack() {
  if ((input.wasPressed('KeyF') || attackRequested) && !player.isBusy && player.sword.swing()) {
    play(player.sword.weaponKey === 'club' ? 'heavySwing' : 'swing');
    trail.cut();
    trail.setColor(player.sword.trailColor);
  }
  attackRequested = false;
  if (!player.sword.isHitting) return;

  const facing = player.facing;
  const chest = player.position.y + 0.9;
  for (const enemy of enemies) {
    if (!enemy.alive) continue;
    const toEnemy = enemy.position.clone().sub(player.position);
    if (Math.abs(enemy.center.y - chest) > enemy.type.height / 2 + 1) continue; // te ver boven of onder je
    toEnemy.y = 0;
    const dist = toEnemy.length();
    if (dist > player.sword.range + enemy.type.radius) continue;
    // Alleen vijanden vóór je (of vlak naast je) worden geraakt
    if (dist > 1.2 && toEnemy.normalize().dot(facing) < 0) continue;

    const result = enemy.hit(player.position, player.sword.swingId, player.sword.damage);
    if (!result) continue;
    // Effecten: vonken, slijm-spetters, een schade-getal, schudden en heel even pauze
    const at = enemy.center;
    effects.sparks(at, player.sword.trailColor);
    effects.burst(at, enemy.type.color, { count: 8, speed: 5, size: 0.12, life: 0.5 });
    effects.floatText(at.clone().setY(at.y + enemy.type.height * 0.6), `${result.damage}`, result.damage > 1 ? '#ffb347' : '#ffffff');
    play('hit');
    state.hitstop = result.killed ? 0.09 : 0.05;
    effects.shake(result.killed ? 0.25 : 0.12);
    if (result.killed) onEnemyDefeated(enemy);
  }
}

function onEnemyDefeated(enemy) {
  play('defeat');
  effects.burst(enemy.center, enemy.type.color, { count: 26, speed: 7, size: 0.16, life: 0.8, up: 3 });
  effects.burst(enemy.center, 0xffffff, { count: 8, speed: 4, size: 0.08, life: 0.4 });
  if (Math.random() < enemy.type.heartChance) drops.spawnHeart(enemy.position);
}

/** De golem slaat op de grond: schokgolf, en pijn als je te dichtbij staat. */
function onGolemSlam(enemy, radius) {
  play('slam');
  effects.shockwave(enemy.position, 0xd8c9a8, radius);
  effects.burst(enemy.position.clone().setY(0.2), 0x9a8f7a, { count: 30, speed: 7, size: 0.18, life: 0.7, up: 2 });
  const dist = player.position.clone().setY(0).distanceTo(enemy.position.clone().setY(0));
  effects.shake(dist < radius * 2 ? 0.55 : 0.2);
  if (dist < radius && player.position.y < enemy.position.y + 0.8) hurtPlayer(enemy.position, enemy.type.damage);
}

function hurtPlayer(from, damage) {
  if (!player.hurt(from, damage)) return;
  play('hurt');
  effects.shake(0.35);
  const at = player.position.clone().setY(player.position.y + 1);
  effects.burst(at, 0xff3355, { count: 12, speed: 5, size: 0.1, life: 0.5 });
  effects.floatText(at.setY(at.y + 0.6), `-${damage}`, '#ff4d5e', 0.55);
}

function enemyContact() {
  for (const enemy of enemies) {
    if (!enemy.alive) continue;
    const type = enemy.type;
    const dx = player.position.x - enemy.position.x;
    const dz = player.position.z - enemy.position.z;
    if (Math.hypot(dx, dz) > type.radius + 0.45) continue;
    const feet = player.position.y;
    const bottom = enemy.position.y;
    if (feet > bottom + type.height + 0.1 || feet + 1.6 < bottom) continue; // geen overlap in hoogte

    if (type.stompable && player.velocity.y < 0 && feet > bottom + type.height * 0.5) {
      // Erop gesprongen!
      enemy.stomp();
      player.bounce();
      effects.shake(0.15);
      onEnemyDefeated(enemy);
    } else {
      hurtPlayer(enemy.position, type.damage);
    }
  }

  if (!player.alive && !state.finished) {
    state.finished = true;
    messageEl.innerHTML = `
      <h1 class="lose">Game over</h1>
      <p>Je had ${state.score} van de ${world.coins.length} munten</p>
      <p>Druk op <b>R</b> om opnieuw te spelen</p>`;
    messageEl.classList.remove('hidden');
    play('lose');
  }
}

/** Het zwaard-windje: volg het lemmet tijdens de slag. */
function updateTrail(dt) {
  const t = player.sword.attackProgress;
  if (t !== null && t > 0.2 && t < 0.9) {
    player.mesh.updateMatrixWorld(true);
    const base = new THREE.Vector3();
    const tip = new THREE.Vector3();
    player.sword.getBladeWorld(base, tip);
    trail.addSample(base, tip);
  }
  trail.update(dt);
}

// ---------- Wapens oppakken met E ----------
function weaponPickup() {
  const pickup = player.isBusy ? null : findNearbyPickup(pickups, player.position);
  if (pickup && input.wasPressed('KeyE')) {
    // Eerst bukken; als de hand bij de grond is, wisselen we echt van wapen
    player.startPickup(() => {
      swapWeapon(pickup, player.sword);
      play('pickup');
      effects.burst(pickup.position.clone().setY(pickup.position.y + 0.6), 0xffe066, { count: 16, speed: 4, size: 0.08, life: 0.5, up: 2 });
    });
  }

  pickupHintEl.classList.toggle('hidden', !pickup || player.isBusy);
  if (pickup) {
    pickupHintEl.innerHTML = `Druk op <b>E</b>: ${WEAPONS[pickup.key].name} pakken`;
  }
}

function updateHud() {
  scoreEl.textContent = `Munten: ${state.score} / ${world.coins.length}`;
  healthEl.textContent = '❤'.repeat(player.health) + '♡'.repeat(MAX_HEALTH - player.health);
  weaponEl.textContent = `Wapen: ${player.sword.name}`;
  enemiesEl.textContent = `Vijanden verslagen: ${enemies.filter((e) => !e.alive).length} / ${enemies.length}`;
  timerEl.textContent = `Tijd: ${state.time.toFixed(1)}s`;
}

// ---------- Game loop ----------
const clock = new THREE.Clock();

window.addEventListener('keydown', (e) => {
  unlockAudio();
  if (e.code === 'KeyM') toggleMute();
});

function gameLoop() {
  // realDt = tijd sinds vorige frame. Begrensd zodat een lag-piek je niet door de vloer laat vallen.
  const realDt = Math.min(clock.getDelta(), 0.05);
  // Tijdens een "hitstop" staat het spel heel even stil (de camera niet)
  const dt = state.hitstop > 0 ? 0 : realDt;
  state.hitstop -= realDt;
  const elapsed = clock.elapsedTime;

  if (input.wasPressed('KeyR')) resetGame();

  if (!state.finished) {
    state.time += dt;
    player.update(dt, input, cameraRig, world.colliders, world.groundHalfSize);
    if (player.jumped) play('jump');
    weaponPickup();
    swordAttack();
    collectCoins();
    enemyContact();
  }

  const enemyCtx = {
    time: elapsed, player, colliders: world.colliders, groundHalfSize: world.groundHalfSize, camera, onSlam: onGolemSlam,
  };
  for (const enemy of enemies) enemy.update(dt, enemyCtx);

  drops.update(dt, elapsed, player.position, () => {
    if (!player.heal()) return false; // al vol: laat het hartje liggen
    play('heal');
    effects.floatText(player.position.clone().setY(player.position.y + 2), '+1', '#ff6b9d', 0.55);
    effects.burst(player.position.clone().setY(player.position.y + 1), 0xff6b9d, { count: 14, speed: 3, size: 0.09, life: 0.6, up: 3 });
    return true;
  });

  animateCoins(world.coins, elapsed);
  for (const pickup of pickups) pickup.update(elapsed);
  updateTrail(dt);
  effects.update(dt);
  cameraRig.update(realDt, player.position);
  effects.applyShake(camera, realDt);
  updateHud();

  renderer.render(scene, camera);
  input.endFrame();
}

renderer.setAnimationLoop(gameLoop);

// Handig voor debuggen in de browser-console (F12): typ bijvoorbeeld `game.player.position`
window.game = { scene, player, enemies, pickups, world, state, camera, renderer, effects, trail, drops, loop: gameLoop };
