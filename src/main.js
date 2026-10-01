import * as THREE from 'three';
import { Input } from './input.js';
import { CameraRig } from './camera.js';
import { Player } from './player.js';
import { createWorld, animateCoins } from './world.js';

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
const cameraRig = new CameraRig(camera, renderer.domElement);
cameraRig.snapTo(player.position);

// ---------- HUD ----------
const scoreEl = document.getElementById('score');
const timerEl = document.getElementById('timer');
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
  for (const coin of world.coins) {
    coin.collected = false;
    coin.mesh.visible = true;
  }
  player.respawn();
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
      <p>Druk op <b>R</b> om opnieuw te spelen</p>`;
    messageEl.classList.remove('hidden');
  }
}

function updateHud() {
  scoreEl.textContent = `Munten: ${state.score} / ${world.coins.length}`;
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
    collectCoins();
  }

  animateCoins(world.coins, elapsed);
  cameraRig.update(dt, player.position);
  updateHud();

  renderer.render(scene, camera);
  input.endFrame();
}

renderer.setAnimationLoop(gameLoop);

// Handig voor debuggen in de browser-console (F12): typ bijvoorbeeld `game.player.position`
window.game = { scene, player, world, state, camera };
