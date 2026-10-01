import * as THREE from 'three';
import { Input } from './input.js';
import { CameraRig } from './camera.js';
import { Player } from './player.js';
import { createWorld, GRACES, ARENAS, CHESTS, REGION_NAMES, WALKABLE_HALF } from './world.js';
import { createEnemies, spawnEnemy } from './enemies.js';
import { createBosses, BOSS_INFO } from './bosses.js';
import { Sites } from './sites.js';
import { Decor } from './decor.js';
import { Stats, POWERS } from './stats.js';
import { itemInfo } from './gear.js';
import { Effects } from './effects.js';
import { SwordTrail } from './trail.js';
import { UI } from './ui.js';
import { play, unlockAudio, toggleMute, setFootsteps } from './audio.js';
import { Pickups, DIAMONDS } from './pickups.js';
import { Projectiles } from './projectiles.js';

// ---------- Basis: renderer, scene, camera ----------
const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.toneMapping = THREE.ACESFilmicToneMapping; // mooiere, zachtere kleuren
renderer.toneMappingExposure = 1.15;
document.body.prepend(renderer.domElement);

const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(60, window.innerWidth / window.innerHeight, 0.1, 400);

window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});

// ---------- Game-objecten ----------
const stats = new Stats();
const ui = new UI(stats);
const input = new Input();
const world = createWorld(scene);
const sites = new Sites(scene, { graces: GRACES, chests: CHESTS }, stats);
const decor = new Decor(scene);
const pickups = new Pickups(scene, stats);
const projectiles = new Projectiles(scene);
const player = new Player(scene, stats);
const enemies = createEnemies(scene);
const bosses = createBosses(scene, ARENAS, stats.data.bosses);
const effects = new Effects(scene);
const trail = new SwordTrail(scene);
const cameraRig = new CameraRig(camera, renderer.domElement);

const state = {
  hitstop: 0, // heel even stilstaan bij een klap: dan voelt het krachtiger
  deathTimer: 0,
  activeBoss: null,
  lockTarget: null,
  attackRequested: false,
  saveTimer: 0,
};

/** Waar je terugkomt bij een Plek van Genade (net naast het licht). */
function graceSpawn(id) {
  const grace = sites.grace(id) ?? sites.grace('weide');
  return grace.position.clone().add(new THREE.Vector3(0, 0, 2.5));
}

player.respawnAt(graceSpawn(stats.data.lastGrace));
cameraRig.snapTo(player.position);
cameraRig.yaw = 0;

// Lock-on markering: een rood bolletje op je doel
const lockMarker = new THREE.Mesh(
  new THREE.RingGeometry(0.12, 0.2, 24),
  new THREE.MeshBasicMaterial({ color: 0xff3b3b, depthTest: false, transparent: true, toneMapped: false })
);
lockMarker.renderOrder = 20;
lockMarker.visible = false;
scene.add(lockMarker);

// ---------- Hulpjes ----------

/** Alles wat je kunt raken: gewone vijanden en wakkere bosses. */
function targets() {
  return [...enemies.filter((e) => e.alive), ...bosses.filter((b) => b.alive && b.awake)];
}

function hurtPlayer(from, damage) {
  const taken = player.hurt(from, damage);
  if (!taken) return false;
  play('hurt');
  effects.shake(Math.min(0.6, 0.2 + taken / 80));
  const at = player.position.clone().setY(player.position.y + 1);
  effects.burst(at, 0xff3355, { count: 12, speed: 5, size: 0.1, life: 0.5 });
  effects.floatText(at.setY(at.y + 0.7), `-${taken}`, '#ff4d5e', 0.55);
  return true;
}

function giveRunes(amount) {
  stats.addRunes(amount);
  ui.addRunes(amount);
}

function addSummon(typeKey, x, z) {
  const e = spawnEnemy(scene, typeKey, x, z);
  enemies.push(e);
  return e;
}

function removeSummons() {
  for (let i = enemies.length - 1; i >= 0; i--) {
    if (!enemies[i].summoned) continue;
    scene.remove(enemies[i].mesh);
    enemies.splice(i, 1);
  }
}

/** Vijanden terug tot leven (na rusten of doodgaan), net als in Elden Ring. */
function respawnWorld() {
  removeSummons();
  pickups.clearHearts();
  projectiles.clear();
  for (const e of enemies) e.reset();
  for (const b of bosses) if (!b.dead) b.resetFight();
  state.activeBoss = null;
  state.lockTarget = null;
  effects.clear();
  trail.cut();
}

/** Iets geraakt: effecten + munten als hij verslagen is. */
function onHit(target, result, color) {
  const at = target.center;
  effects.sparks(at, color);
  effects.burst(at, target.type.color, { count: 8, speed: 5, size: 0.12, life: 0.5 });
  effects.floatText(at.clone().setY(at.y + target.type.height * 0.6), `${result.damage}`, player.fireTimer > 0 ? '#ff9a3c' : '#ffffff');
  play('hit');
  state.hitstop = result.killed ? 0.09 : 0.05;
  effects.shake(result.killed ? 0.25 : 0.12);
  if (result.killed) onDefeated(target);
}

function onDefeated(target) {
  if (bosses.includes(target)) {
    onBossDefeated(target);
    return;
  }
  play('defeat');
  effects.burst(target.center, target.type.color, { count: 26, speed: 7, size: 0.16, life: 0.8, up: 3 });
  effects.burst(target.center, 0xffd700, { count: 8, speed: 3, size: 0.08, life: 0.6, up: 4 });
  if (!target.summoned) {
    giveRunes(target.type.runes);
    pickups.coinBurst(target.center, target.type.runes);
    if (Math.random() < 0.2) pickups.dropHeart(target.position);
  }
  if (state.lockTarget === target) state.lockTarget = null;
}

const BOSS_REWARDS = {
  koning: [{ kind: 'helmet', key: 'goud' }, { kind: 'flask' }],
  ridder: [{ kind: 'weapon', key: 'diamant' }],
  reus: [],
};

function onBossDefeated(boss) {
  const before = stats.unlockedPowers();
  play('win');
  effects.shake(0.5);
  ui.banner('VIJAND GEVELD', boss.name, 'gold', 5);
  giveRunes(BOSS_INFO[boss.id].runes);
  pickups.coinBurst(boss.center, 100);
  stats.data.bosses.push(boss.id);
  for (const item of BOSS_REWARDS[boss.id]) stats.addItem(item);
  state.activeBoss = null;
  state.lockTarget = null;
  removeSummons();
  stats.save();

  const rewards = BOSS_REWARDS[boss.id].map((i) => itemInfo(i).name);
  setTimeout(() => {
    if (rewards.length) ui.toast(`Beloning: <b>${rewards.join(', ')}</b><br><small>Open je uitrusting met I</small>`, 5);
    announceNewPowers(before, 1.5);
    if (['koning', 'ridder', 'reus'].every((id) => stats.data.bosses.includes(id)) && !stats.data.victory) {
      stats.data.victory = true;
      stats.save();
      setTimeout(() => ui.banner('DE WERELD IS GERED', 'Alle drie de bosses zijn verslagen. Jij bent de echte Munt Jager!', 'gold', 8), 4000);
    }
  }, 5000);
}

/** Laat zien welke krachten je net hebt vrijgespeeld. */
function announceNewPowers(before, delay = 0) {
  const fresh = stats.unlockedPowers().filter((k) => !before.includes(k));
  fresh.forEach((key, i) => {
    setTimeout(() => {
      play('pickup');
      ui.banner(`NIEUWE KRACHT: ${POWERS[key].name.toUpperCase()}`, `${POWERS[key].key} — ${POWERS[key].info}`, 'power', 4.5);
    }, (delay + i * 4.8) * 1000);
  });
}

// ---------- Gevecht ----------

function swordHits() {
  if (!player.sword.isHitting) return;
  const facing = player.facing;
  const chest = player.position.y + 0.9;
  for (const target of targets()) {
    const toTarget = target.position.clone().sub(player.position);
    if (Math.abs(target.center.y - chest) > target.type.height / 2 + 1.2) continue; // te ver boven of onder je
    toTarget.y = 0;
    const dist = toTarget.length();
    if (dist > player.sword.range + target.type.radius) continue;
    // Alleen wat vóór je (of vlak naast je) staat wordt geraakt
    if (dist > 1.2 + target.type.radius && toTarget.normalize().dot(facing) < 0) continue;
    const result = target.hit(player.position, player.sword.swingId, player.attackDamage);
    if (result) onHit(target, result, player.fireTimer > 0 ? 0xff8a2b : player.sword.trailColor);
  }
}

function spinHits() {
  if (player.spinTimer <= 0) return;
  for (const target of targets()) {
    const d = target.position.clone().setY(0).distanceTo(player.position.clone().setY(0));
    if (d > 3.2 + target.type.radius || Math.abs(target.center.y - player.position.y - 0.9) > target.type.height / 2 + 1.5) continue;
    const result = target.hit(player.position, player.spinId, Math.round(player.attackDamage * 1.2));
    if (result) onHit(target, result, 0x9be7ff);
  }
}

function slamLanded() {
  play('slam');
  effects.shockwave(player.position, 0x9be7ff, 5);
  effects.burst(player.position.clone().setY(0.3), 0x9be7ff, { count: 30, speed: 8, size: 0.14, life: 0.6, up: 2 });
  effects.shake(0.45);
  const id = `slam-${Math.random()}`;
  for (const target of targets()) {
    const d = target.position.clone().setY(0).distanceTo(player.position.clone().setY(0));
    if (d > 5 + target.type.radius) continue;
    const result = target.hit(player.position, id, Math.round(player.attackDamage * 1.6));
    if (result) onHit(target, result, 0x9be7ff);
  }
}

function enemyContact() {
  for (const enemy of [...enemies, ...bosses]) {
    if (!enemy.alive || enemy.awake === false || enemy.type.noContact) continue;
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
      onDefeated(enemy);
    } else {
      hurtPlayer(enemy.position, type.contactDamage ?? type.damage);
    }
  }
}

/** De golem slaat op de grond: schokgolf, en pijn als je te dichtbij staat. */
function onGolemSlam(enemy, radius, damage) {
  play('slam');
  effects.shockwave(enemy.position, 0xd8c9a8, radius);
  effects.burst(enemy.position.clone().setY(0.2), 0x9a8f7a, { count: 30, speed: 7, size: 0.18, life: 0.7, up: 2 });
  const dist = player.position.clone().setY(0).distanceTo(enemy.position.clone().setY(0));
  effects.shake(dist < radius * 2 ? 0.45 : 0.15);
  if (dist < radius && player.position.y < enemy.position.y + 0.8) hurtPlayer(enemy.position, damage);
}

// ---------- Doodgaan, rusten, reizen ----------

function die() {
  state.deathTimer = 4;
  play('lose');
  ui.banner('JE BENT GESTORVEN', stats.runes > 0 ? 'Je munten liggen nog waar je viel...' : '', 'death', 3.8);
  // Munten laten vallen; vorige verloren munten zijn nu echt weg
  if (stats.runes > 0) {
    stats.data.lostRunes = { x: player.position.x, y: player.position.y, z: player.position.z, amount: stats.runes };
    stats.data.runes = 0;
  } else {
    stats.data.lostRunes = null;
  }
  sites.lostRunes.show(stats.data.lostRunes);
  stats.save();
}

function respawnAfterDeath() {
  respawnWorld();
  player.respawnAt(graceSpawn(stats.data.lastGrace));
  cameraRig.snapTo(player.position);
}

function rest(grace) {
  stats.data.lastGrace = grace.id;
  stats.save();
  respawnWorld();
  player.respawnAt(player.position.clone());
  player.mesh.rotation.y = Math.atan2(grace.position.x - player.position.x, grace.position.z - player.position.z);
  player.resting = true;
  play('heal');
  document.exitPointerLock?.();
  ui.openGraceMenu(grace, {
    leave: () => {
      player.resting = false;
      ui.closeMenu();
      renderer.domElement.requestPointerLock();
    },
    travel: (id) => {
      stats.data.lastGrace = id;
      stats.save();
      player.resting = false;
      ui.closeMenu();
      player.respawnAt(graceSpawn(id));
      cameraRig.snapTo(player.position);
      renderer.domElement.requestPointerLock();
      ui.toast(`Gereisd naar <b>${sites.grace(id).name}</b>`);
    },
    leveled: (before) => {
      play('pickup');
      player.health = player.maxHealth;
      player.stamina = player.maxStamina;
      announceNewPowers(before);
    },
    equip,
  });
}

function equip(item) {
  if (item.kind === 'weapon') {
    stats.data.weapon = item.key;
    player.sword.setWeapon(item.key);
  } else if (item.kind === 'helmet') {
    stats.data.helmet = item.key;
    player.setHelmet(item.key);
  }
  stats.save();
}

function openChest(chest) {
  player.startPickup(() => {
    chest.open();
    stats.addItem(chest.item);
    stats.data.chests.push(chest.id);
    stats.save();
    play('pickup');
    effects.burst(chest.position.clone().setY(chest.position.y + 1), 0xffd76a, { count: 24, speed: 4, size: 0.1, life: 0.8, up: 3 });
    const info = itemInfo(chest.item);
    ui.toast(`Gevonden: <b style="color:${info.rarity === 'legendarisch' ? '#ffb340' : '#f3d27a'}">${info.name}</b><br><small>${info.info}${chest.item.kind === 'flask' ? '' : ' — open je uitrusting met I'}</small>`, 5);
  });
}

function toggleInventory() {
  if (ui.menuOpen === 'inventory') {
    ui.closeMenu();
    renderer.domElement.requestPointerLock();
    return;
  }
  if (ui.menuOpen) return;
  document.exitPointerLock?.();
  ui.openInventory({
    close: () => {
      ui.closeMenu();
      renderer.domElement.requestPointerLock();
    },
    equip,
    wipe: () => {
      stats.wipe();
      location.reload();
    },
  });
}

// ---------- Lock-on (Q) ----------

function toggleLock() {
  if (state.lockTarget) {
    state.lockTarget = null;
    return;
  }
  const camForward = new THREE.Vector3();
  camera.getWorldDirection(camForward);
  let best = null;
  let bestScore = Infinity;
  for (const t of targets()) {
    const to = t.center.sub(camera.position);
    const dist = t.position.distanceTo(player.position);
    if (dist > 24) continue;
    const dot = to.normalize().dot(camForward);
    if (dot < 0.3) continue;
    const score = dist * (1.5 - dot); // dichtbij en midden in beeld wint
    if (score < bestScore) {
      best = t;
      bestScore = score;
    }
  }
  state.lockTarget = best;
}

// ---------- Invoer ----------

renderer.domElement.addEventListener('pointerdown', (e) => {
  unlockAudio(); // geluid mag pas na een klik
  // De eerste klik zet alleen de muis vast; daarna is klikken = slaan
  if (e.button === 0 && cameraRig.locked) state.attackRequested = true;
});

const lockHintEl = document.getElementById('lock-hint');
document.addEventListener('pointerlockchange', () => {
  lockHintEl.classList.toggle('hidden', cameraRig.locked || !!ui.menuOpen);
});

window.addEventListener('keydown', (e) => {
  unlockAudio();
  if (e.code === 'KeyM') toggleMute();
});

/** Welke kant wil de speler op? (WASD, ten opzichte van de camera) */
function readMove() {
  const f = (input.isDown('KeyW', 'ArrowUp') ? 1 : 0) - (input.isDown('KeyS', 'ArrowDown') ? 1 : 0);
  const r = (input.isDown('KeyD', 'ArrowRight') ? 1 : 0) - (input.isDown('KeyA', 'ArrowLeft') ? 1 : 0);
  return cameraRig.forward.multiplyScalar(f).add(cameraRig.right.multiplyScalar(r));
}

function handleActions(move) {
  const attack = input.wasPressed('KeyF') || state.attackRequested;
  state.attackRequested = false;

  // Shift: kort tikken = rollen, ingedrukt houden = sprinten
  const shiftUp = input.wasReleased('ShiftLeft') ?? input.wasReleased('ShiftRight');
  if (shiftUp !== null && shiftUp < 0.22 && player.tryRoll(move)) play('swing');

  if (attack) {
    if (!player.onGround && player.position.y > 1.2 && player.trySlam()) play('heavySwing');
    else if (player.tryAttack()) {
      play(player.sword.weaponKey === 'club' ? 'heavySwing' : 'swing');
      trail.cut();
    }
  }
  if (input.wasPressed('KeyC') && player.tryDash(move)) play('swing');
  if (input.wasPressed('KeyV') && player.trySpin()) {
    play('heavySwing');
    trail.cut();
  }
  if (input.wasPressed('KeyX') && player.tryFire()) play('charge');
  if (input.wasPressed('KeyR')) player.tryDrink();
  if (input.wasPressed('KeyQ')) toggleLock();
  if (input.wasPressed('KeyI') || input.wasPressed('Tab')) toggleInventory();

  // E: rusten of een kist openen
  const near = player.isBusy ? null : sites.nearbyInteraction(player.position);
  if (near?.kind === 'grace') ui.prompt(`<b>E</b> Rusten bij ${near.target.name}`);
  else if (near?.kind === 'chest') ui.prompt('<b>E</b> Kist openen');
  else ui.prompt(null);
  if (near && input.wasPressed('KeyE')) {
    ui.prompt(null);
    if (near.kind === 'grace') rest(near.target);
    else openChest(near.target);
  }
}

/** Gebeurtenissen van de speler (rollen, dash, landen na een grondslag...) */
function handlePlayerEvents() {
  for (const ev of player.events) {
    if (ev === 'dash') {
      effects.burst(player.position.clone().setY(player.position.y + 0.9), 0x9be7ff, { count: 16, speed: 3, size: 0.1, life: 0.35, gravity: 0 });
    } else if (ev === 'doubleJump') {
      play('jump');
      effects.shockwave(player.position, 0xffffff, 1.2);
    } else if (ev === 'slamLand') {
      slamLanded();
    } else if (ev === 'heal') {
      play('heal');
      const at = player.position.clone().setY(player.position.y + 1);
      effects.burst(at, 0x7dff9a, { count: 18, speed: 3, size: 0.09, life: 0.7, up: 3, gravity: -0.3 });
      effects.floatText(at.setY(at.y + 0.9), `+${Math.round(player.maxHealth * 0.45)}`, '#7dff9a', 0.55);
    } else if (ev === 'land') {
      play('land');
    } else if (ev === 'fire') {
      ui.toast('🔥 <b>Vuurzwaard!</b> 50% meer schade', 2);
    }
  }
  player.events.length = 0;
}

// ---------- Effecten bij het wapen ----------

function updateTrail(dt) {
  const t = player.sword.attackProgress;
  if ((t !== null && t > 0.2 && t < 0.9) || player.spinTimer > 0) {
    player.mesh.updateMatrixWorld(true);
    const base = new THREE.Vector3();
    const tip = new THREE.Vector3();
    player.sword.getBladeWorld(base, tip);
    trail.setColor(player.fireTimer > 0 ? 0xff7a1a : player.spinTimer > 0 ? 0x9be7ff : player.sword.trailColor);
    trail.addSample(base, tip);
  }
  trail.update(dt);

  // Vlammetjes langs het wapen tijdens Vuurzwaard
  if (player.fireTimer > 0 && dt > 0 && Math.random() < 0.7) {
    player.mesh.updateMatrixWorld(true);
    const base = new THREE.Vector3();
    const tip = new THREE.Vector3();
    player.sword.getBladeWorld(base, tip);
    const at = base.lerp(tip, Math.random());
    effects.burst(at, Math.random() < 0.5 ? 0xff7a1a : 0xffd23a, { count: 1, speed: 0.6, size: 0.09, life: 0.4, up: 1.6, gravity: -0.2 });
  }
}

// ---------- Bosses: arena in = gevecht ----------

function updateBossFights() {
  if (!state.activeBoss) {
    for (const b of bosses) {
      if (b.dead || b.awake) continue;
      const d = player.position.clone().setY(0).distanceTo(b.arena.center);
      if (d < b.arena.radius - 1.5) {
        b.wake();
        state.activeBoss = b;
        ui.banner(b.name.toUpperCase(), BOSS_INFO[b.id].title, 'gold', 3);
      }
    }
  }
  // Tijdens het gevecht kun je niet door de mistmuur naar buiten
  const boss = state.activeBoss;
  if (boss && boss.awake && !boss.dead) {
    const offset = player.position.clone().sub(boss.arena.center).setY(0);
    const max = boss.arena.radius - 0.6;
    if (offset.length() > max) {
      offset.setLength(max);
      player.position.x = boss.arena.center.x + offset.x;
      player.position.z = boss.arena.center.z + offset.z;
    }
  }
}

// ---------- Game loop ----------
const clock = new THREE.Clock();
const bossCtx = { player, effects, hurtPlayer, spawnEnemy: addSummon, camera, projectiles };

function gameLoop() {
  // realDt = tijd sinds vorige frame. Begrensd zodat een lag-piek je niet door de vloer laat vallen.
  const realDt = Math.min(clock.getDelta(), 0.05);
  // Tijdens een "hitstop" of een menu staat het spel even stil (de camera niet)
  const paused = !!ui.menuOpen && ui.menuOpen !== 'grace';
  const dt = state.hitstop > 0 || paused ? 0 : realDt;
  state.hitstop -= realDt;
  const elapsed = clock.elapsedTime;

  const move = readMove();
  const canAct = player.alive && !ui.menuOpen && state.deathTimer <= 0;
  if (canAct) handleActions(move);
  else ui.prompt(null);

  // Lock-on doel nog geldig?
  const lock = state.lockTarget;
  if (lock && (!lock.alive || lock.position.distanceTo(player.position) > 30)) state.lockTarget = null;

  if (player.alive && state.deathTimer <= 0) {
    const sprintHeld = input.heldFor('ShiftLeft') > 0.22 || input.heldFor('ShiftRight') > 0.22;
    const faceTarget = state.lockTarget ? state.lockTarget.position.clone().sub(player.position).setY(0) : null;
    player.update(dt, {
      move: canAct ? move : new THREE.Vector3(),
      sprint: canAct && sprintHeld,
      jumpPressed: canAct && input.wasPressed('Space'),
      faceTarget,
    }, world.colliders, WALKABLE_HALF);
    if (player.jumped) play('jump');
    handlePlayerEvents();
    swordHits();
    spinHits();
    enemyContact();
    updateBossFights();

    const found = sites.discover(player.position);
    if (found) {
      play('heal');
      ui.banner('PLEK VAN GENADE GEVONDEN', found.name, 'gold', 3.5);
    }
    const recovered = sites.touchLostRunes(player.position);
    if (recovered) {
      giveRunes(recovered);
      stats.data.lostRunes = null;
      stats.save();
      play('pickup');
      ui.toast(`Je munten terug: <b>+${recovered}</b>`);
    }
  } else if (state.deathTimer > 0) {
    state.deathTimer -= realDt;
    if (state.deathTimer <= 0) respawnAfterDeath();
  }
  if (!player.alive && state.deathTimer <= 0) die();

  const enemyCtx = {
    time: elapsed, player, colliders: world.colliders, groundHalfSize: WALKABLE_HALF, camera, onSlam: onGolemSlam,
    hurtPlayer, projectiles, effects,
  };
  for (const enemy of enemies) enemy.update(dt, enemyCtx);
  for (const boss of bosses) boss.update(dt, bossCtx);
  projectiles.update(dt, {
    targets, player, hurtPlayer, colliders: world.colliders, effects,
    onPlayerHit: (target, result, proj) => onHit(target, result, proj.kind === 'arrow' ? 0xffd27a : 0xffe27a),
  });
  // Is de boss dood door iets anders dan een klap? (bijv. schade terwijl je doodging)
  if (state.activeBoss && (!state.activeBoss.awake || state.activeBoss.dead)) state.activeBoss = null;

  sites.update(dt, elapsed);
  pickups.update(dt, elapsed, player, {
    onCoin: () => play('coin'),
    onHeart: (fraction) => {
      if (player.health >= player.maxHealth) return false;
      const heal = Math.round(player.maxHealth * fraction);
      player.health = Math.min(player.maxHealth, player.health + heal);
      play('heal');
      effects.floatText(player.position.clone().setY(player.position.y + 2), `+${heal}`, '#ff6b9d', 0.55);
      return true;
    },
    onDiamond: (d, value) => {
      giveRunes(value);
      stats.save();
      play('pickup');
      effects.burst(d.position.clone().setY(d.position.y + 1), 0x5aa8ff, { count: 24, speed: 5, size: 0.12, life: 0.8, up: 3 });
      ui.toast(`💎 <b>Diamant gevonden!</b> +${value} munten<br><small>${stats.data.diamonds.length} / ${DIAMONDS.length} diamanten</small>`, 4);
    },
  });
  const walking = player.moving && player.onGround && player.rollTimer <= 0 && !ui.menuOpen && player.alive;
  setFootsteps(walking, input.heldFor('ShiftLeft') > 0.22 || input.heldFor('ShiftRight') > 0.22);
  decor.update(dt, elapsed, player.position);
  updateTrail(dt);
  effects.update(dt);
  world.updateSun(player.position);

  cameraRig.update(realDt, player.position, {
    facing: player.mesh.rotation.y,
    moving: player.moving && !paused,
    lockTarget: state.lockTarget?.center ?? null,
    colliders: world.colliders,
  });
  effects.applyShake(camera, realDt);

  // Lock-on markering
  lockMarker.visible = !!state.lockTarget;
  if (state.lockTarget) {
    lockMarker.position.copy(state.lockTarget.center);
    lockMarker.quaternion.copy(camera.quaternion);
  }

  ui.update(realDt, player, state.activeBoss, elapsed);
  ui.checkRegion(player.position, REGION_NAMES);

  // Af en toe automatisch opslaan
  state.saveTimer += realDt;
  if (state.saveTimer > 10) {
    state.saveTimer = 0;
    stats.save();
  }

  renderer.render(scene, camera);
  input.endFrame();
}

renderer.setAnimationLoop(gameLoop);

// Eerste keer spelen? Een kleine uitleg.
if (stats.level === 1 && stats.runes === 0 && stats.data.bosses.length === 0) {
  document.addEventListener('pointerlockchange', function intro() {
    if (!cameraRig.locked) return;
    document.removeEventListener('pointerlockchange', intro);
    setTimeout(() => ui.toast('Versla vijanden voor <b>munten</b>.<br>Rust bij de gouden <b>Plek van Genade</b> (E) om sterker te worden.', 7), 800);
  });
}

// Handig voor debuggen in de browser-console (F12): typ bijvoorbeeld `game.player.position`
window.game = { scene, player, enemies, bosses, sites, stats, ui, world, state, camera, cameraRig, renderer, effects, trail, loop: gameLoop };
