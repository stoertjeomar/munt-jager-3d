import * as THREE from 'three';
import { Input } from './input.js';
import { CameraRig } from './camera.js';
import { Player, MAX_HEALTH } from './player.js';
import { createWorld, animateCoins } from './world.js';
import { createEnemies, ENEMY_RADIUS, ENEMY_HEIGHT } from './enemies.js';
import { WEAPONS } from './weapons.js';
import { createPickups, resetPickups, findNearbyPickup, swapWeapon } from './pickups.js';

// ---------- Basis: renderer, scene, camera ----------
const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
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
};

function resetGame() {
  state.score = 0;
  state.time = 0;
  state.finished = false;
  for (const enemy of enemies) enemy.reset();
  resetPickups(pickups);
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
  }
}

// ---------- Zwaard: slaan met F, of klikken (als de muis vastzit in het spel) ----------
let attackRequested = false;
renderer.domElement.addEventListener('pointerdown', (e) => {
  // De eerste klik zet alleen de muis vast; daarna is klikken = slaan
  if (e.button === 0 && cameraRig.locked) attackRequested = true;
});

// Uitleg "klik om te spelen" tonen zolang de muis niet vastzit
const lockHintEl = document.getElementById('lock-hint');
document.addEventListener('pointerlockchange', () => {
  lockHintEl.classList.toggle('hidden', cameraRig.locked);
});

function swordAttack() {
  if ((input.wasPressed('KeyF') || attackRequested) && !player.isBusy) player.sword.swing();
  attackRequested = false;
  if (!player.sword.isHitting) return;

  const facing = player.facing;
  for (const enemy of enemies) {
    if (!enemy.alive) continue;
    const toEnemy = enemy.position.clone().sub(player.position);
    if (Math.abs(toEnemy.y) > 1.5) continue; // te ver boven of onder je
    toEnemy.y = 0;
    const dist = toEnemy.length();
    if (dist > player.sword.range + ENEMY_RADIUS) continue;
    // Alleen vijanden vóór je (of vlak naast je) worden geraakt
    if (dist > 1.2 && toEnemy.normalize().dot(facing) < 0) continue;
    enemy.hit(player.position, player.sword.swingId, player.sword.damage);
  }
}

function enemyContact() {
  for (const enemy of enemies) {
    if (!enemy.alive) continue;
    const dx = player.position.x - enemy.position.x;
    const dz = player.position.z - enemy.position.z;
    if (Math.hypot(dx, dz) > ENEMY_RADIUS + 0.45) continue;
    const feet = player.position.y;
    if (feet > ENEMY_HEIGHT + 0.1 || feet + 1.6 < 0) continue; // geen overlap in hoogte

    if (player.velocity.y < 0 && feet > ENEMY_HEIGHT * 0.5) {
      // Erop gesprongen!
      enemy.stomp();
      player.bounce();
    } else {
      player.hurt(enemy.position);
    }
  }

  if (!player.alive && !state.finished) {
    state.finished = true;
    messageEl.innerHTML = `
      <h1 class="lose">Game over</h1>
      <p>Je had ${state.score} van de ${world.coins.length} munten</p>
      <p>Druk op <b>R</b> om opnieuw te spelen</p>`;
    messageEl.classList.remove('hidden');
  }
}

// ---------- Wapens oppakken met E ----------
function weaponPickup() {
  const pickup = player.isBusy ? null : findNearbyPickup(pickups, player.position);
  if (pickup && input.wasPressed('KeyE')) {
    // Eerst bukken; als de hand bij de grond is, wisselen we echt van wapen
    player.startPickup(() => swapWeapon(pickup, player.sword));
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

function gameLoop() {
  // dt = tijd sinds vorige frame. Begrensd zodat een lag-piek je niet door de vloer laat vallen.
  const dt = Math.min(clock.getDelta(), 0.05);
  const elapsed = clock.elapsedTime;

  if (input.wasPressed('KeyR')) resetGame();

  if (!state.finished) {
    state.time += dt;
    player.update(dt, input, cameraRig, world.colliders, world.groundHalfSize);
    weaponPickup();
    swordAttack();
    collectCoins();
    enemyContact();
  }

  for (const enemy of enemies) {
    enemy.update(dt, elapsed, player.position, world.colliders, world.groundHalfSize);
  }

  animateCoins(world.coins, elapsed);
  for (const pickup of pickups) pickup.update(elapsed);
  cameraRig.update(dt, player.position);
  updateHud();

  renderer.render(scene, camera);
  input.endFrame();
}

renderer.setAnimationLoop(gameLoop);

// Handig voor debuggen in de browser-console (F12): typ bijvoorbeeld `game.player.position`
window.game = { scene, player, enemies, pickups, world, state, camera, renderer };
