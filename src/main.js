import * as THREE from 'three';
import { Input } from './input.js';
import { CameraRig } from './camera.js';
import { createGraphics } from './graphics.js';
import { BlobShadows } from './blobs.js';
import { Player, PLAYABLE } from './player.js';
import { createWorld, CHECKPOINTS, ARENAS, CHESTS } from './world.js';
import { LEVELS, LEVEL, LEVEL_INDEX } from './levels.js';
import { NPCs } from './npcs.js';
import { createEnemies, spawnEnemy } from './enemies.js';
import { createBosses, BOSS_INFO } from './bosses.js';
import { Sites } from './sites.js';
import { Decor } from './decor.js';
import { Stats, POWERS, PERKS, BOSS_KILLS, SHOP_ITEMS } from './stats.js';
import { itemInfo } from './gear.js';
import { Effects } from './effects.js';
import { SwordTrail } from './trail.js';
import { UI } from './ui.js';
import { play, unlockAudio, toggleMute, setFootsteps } from './audio.js';
import { Pickups, DIAMONDS } from './pickups.js';
import { Projectiles } from './projectiles.js';
import { OmarFlow } from './omar.js';

// ---------- Basis: renderer, scene, camera ----------
// Geen "antialias" hier: alles gaat eerst door de nabewerking, daar zitten de gladde randjes (zie graphics.js).
// "high-performance": laptops met twee videokaarten kiezen dan de snelle.
const renderer = new THREE.WebGLRenderer({ antialias: false, powerPreference: 'high-performance' });
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
document.body.prepend(renderer.domElement);

const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(60, window.innerWidth / window.innerHeight, 0.1, 230); // verder dan 230 m tekenen we niet (mist)

// ---------- Game-objecten ----------
const stats = new Stats();
// Nieuw level (of een oude save)? Begin bij het begin van dit level.
if (!CHECKPOINTS.some((c) => c.id === stats.data.checkpoint)) stats.data.checkpoint = CHECKPOINTS[0].id;
stats.data.currentLevel = LEVEL_INDEX;
const ui = new UI(stats);
const input = new Input();
const world = createWorld(scene);
const sites = new Sites(scene, { checkpoints: CHECKPOINTS, chests: CHESTS }, stats);
const decor = new Decor(scene);
const pickups = new Pickups(scene, stats);
const projectiles = new Projectiles(scene);
const player = new Player(scene, stats);
const enemies = createEnemies(scene);
const bosses = createBosses(scene, ARENAS, []); // de boss van dit level is er altijd (ook als je hem al eens versloeg)
const npcs = new NPCs(scene, stats, world.colliders);
const effects = new Effects(scene);
const trail = new SwordTrail(scene);
const cameraRig = new CameraRig(camera, renderer.domElement);
// Nabewerking (gloed, kleuren, gladde randjes) en de graphics-standen (G)
const gfx = createGraphics({ renderer, scene, camera, world, ui });
const composer = gfx.composer;
const blobs = new BlobShadows(scene);

// 's Nachts een zacht, warm lichtje net boven en achter je (aan de kant van de camera):
// dan zie je jezelf, het pad en vijanden vlak bij je goed. Geen schaduw, dus het kost bijna niks.
// Het lampje is er altijd (overdag op 0): zo hoeft de computer nooit opnieuw shaders te maken.
const nightLight = {
  light: new THREE.PointLight(0xffe2b8, 0, 12, 1.5), // kleur, sterkte, bereik (m), afname
  strength: 5, // hoe fel het lichtje 's nachts is
};
scene.add(nightLight.light);
const toCamera = new THREE.Vector3();

const state = {
  hitstop: 0, // heel even stilstaan bij een klap: dan voelt het krachtiger
  deathTimer: 0,
  activeBoss: null,
  lockTarget: null,
  attackRequested: false,
  forceRun: false, // voor tests: doorspelen zonder dat de muis vastzit
  saveTimer: 0,
};

/** Waar je terugkomt bij een checkpoint (net naast de vlag). */
function checkpointSpawn(id) {
  const checkpoint = sites.checkpoint(id) ?? sites.checkpoints[0];
  return checkpoint.position.clone().add(new THREE.Vector3(0, 0, 2.5));
}

player.respawnAt(checkpointSpawn(stats.data.checkpoint));
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

/**
 * Vijanden verslagen: telt mee voor je level. Geeft de nieuwe bonussen terug (of null als je niet omhoog ging).
 * `announce` = meteen een LEVEL-banner laten zien (bij een boss staat het op het LEVEL VOLTOOID-scherm).
 */
function giveKills(amount, announce = true) {
  const before = stats.unlockedPowers();
  const perksBefore = stats.unlockedPerks();
  if (!stats.addKills(amount)) return null;
  // Sterker geworden: meteen weer vol leven en stamina, en de nieuwe flesjes erbij
  const newPerks = stats.unlockedPerks().filter((k) => !perksBefore.includes(k));
  player.health = player.maxHealth;
  player.stamina = player.maxStamina;
  player.flasks += newPerks.reduce((n, k) => n + (PERKS[k].flasks ?? 0), 0);
  play('win');
  effects.burst(player.position.clone().setY(player.position.y + 1.2), 0xffd76a, { count: 40, speed: 5, size: 0.12, life: 1, up: 4 });
  if (announce) {
    ui.banner(`LEVEL ${stats.level}`, 'Je bent sterker geworden! Meer leven, stamina en schade.', 'gold', 3.5);
    announceNewPowers(before, 3.6, newPerks);
  }
  return newPerks;
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

/** Vijanden terug tot leven (na doodgaan). */
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
  const finished = target.typeKey ? npcs.onKill(target.typeKey) : null;
  if (finished) questReady(finished);
  if (!target.summoned) {
    giveKills(1);
    giveRunes(target.type.runes);
    pickups.coinBurst(target.center, target.type.runes);
    if (Math.random() < 0.2) pickups.dropHeart(target.position);
  }
  if (state.lockTarget === target) state.lockTarget = null;
}

// Beloningen voor het verslaan van een boss (alleen de eerste keer)
const BOSS_REWARDS = {
  mario: [{ kind: 'helmet', key: 'ijzer' }, { kind: 'flask' }],
  koning: [{ kind: 'helmet', key: 'goud' }, { kind: 'flask' }],
  ridder: [{ kind: 'weapon', key: 'diamant' }],
  reus: [],
};

function onBossDefeated(boss) {
  if (boss.id === 'omar') return omar.onWin(boss); // Omar verslagen: eigen feest, beloning en terugreis (omar.js)
  const firstTime = !stats.data.bosses.includes(boss.id);
  play('win');
  effects.shake(0.5);
  ui.banner('VIJAND GEVELD', boss.name, 'gold', 5);
  const before = stats.unlockedPowers();
  const levelBefore = stats.level;
  // Een boss telt als een heleboel verslagen vijanden
  const newPerks = giveKills(firstTime ? BOSS_KILLS.first : BOSS_KILLS.again, false) ?? [];
  giveRunes(firstTime ? BOSS_INFO[boss.id].runes : Math.round(BOSS_INFO[boss.id].runes / 3));
  pickups.coinBurst(boss.center, 100);
  const rewards = firstTime ? BOSS_REWARDS[boss.id] : [];
  if (firstTime) stats.data.bosses.push(boss.id);
  for (const item of rewards) stats.addItem(item);
  stats.data.unlockedLevel = Math.max(stats.data.unlockedLevel, Math.min(LEVELS.length - 1, LEVEL_INDEX + 1));
  state.activeBoss = null;
  state.lockTarget = null;
  removeSummons();
  stats.save();

  setTimeout(() => {
    announceNewPowers(before, 0, newPerks);
    showLevelComplete(rewards.map((i) => itemInfo(i).name), stats.level > levelBefore);
  }, 4500);
}

/** "LEVEL VOLTOOID": door naar het volgende level (of het einde van het spel). */
function showLevelComplete(rewards, leveledUp = false) {
  const last = LEVEL_INDEX === LEVELS.length - 1;
  if (last) {
    stats.data.victory = true;
    stats.save();
  }
  document.exitPointerLock?.();
  const next = LEVELS[LEVEL_INDEX + 1];
  const html = `${last ? 'Alle vier de bosses zijn verslagen. <b>Jij bent de echte Munt Jager!</b>' : `Je hebt <b>${LEVEL.name}</b> gehaald!`}
    ${rewards.length ? `<br>Beloning: <b>${rewards.join(', ')}</b>` : ''}
    ${leveledUp ? `<br>⬆ Je bent nu <b>level ${stats.level}</b>!` : ''}
    ${next ? `<br><br>Volgende: <b>${next.subtitle} — ${next.name}</b>` : ''}`;
  const buttons = [];
  if (next) buttons.push([`▶ Naar ${next.name}`, () => goToLevel(LEVEL_INDEX + 1)]);
  buttons.push(['Nog even rondlopen', () => {
    ui.closeMenu();
    cameraRig.lock();
  }]);
  ui.openLevelComplete(last ? 'DE WERELD IS GERED' : 'LEVEL VOLTOOID', html, buttons);
}

/** Ander level laden: opslaan en de pagina opnieuw laden met het nieuwe level. */
function goToLevel(index) {
  stats.data.currentLevel = index;
  stats.data.checkpoint = null;
  stats.save();
  if (location.search) location.href = location.pathname; // ?level=... uit de adresbalk halen
  else location.reload();
}

/** Een quest is af: terug naar de NPC! */
function questReady(quest) {
  play('pickup');
  ui.toast(`✔ <b>${quest.title}</b> voltooid!<br><small>Ga terug om je beloning te halen.</small>`, 4);
}

/** De winkel van de koopman openen (na een begroeting). */
function openShop(npc) {
  play('pickup');
  ui.prompt(null);
  ui.openDialog(npc.name, [npcs.shopGreeting()], () => {
    document.exitPointerLock?.();
    ui.openShop(npc.name, {
      buy: (key) => {
        if (!stats.buy(key)) return;
        play('pickup');
        const item = SHOP_ITEMS[key];
        if (key === 'soep') {
          player.health = player.maxHealth;
          player.stamina = player.maxStamina;
          player.flasks = stats.flasksMax;
          play('heal');
        } else if (key === 'zaadje') player.flasks++;
        else if (key === 'hart') player.health += 20;
        effects.burst(player.position.clone().setY(player.position.y + 1.2), 0xffd76a, { count: 20, speed: 3, size: 0.09, life: 0.7, up: 3 });
        ui.toast(`Gekocht: <b>${item.icon} ${item.name}</b>`, 2.5);
      },
      close: closeShop,
    });
  });
}

function closeShop() {
  ui.closeMenu();
  cameraRig.lock();
}

/** Praten met een NPC. */
function talkTo(npc) {
  if (npc.omar) return omar.challenge(npc); // Omar geeft geen quest: hij daagt je uit (omar.js)
  if (npc.shop) {
    openShop(npc);
    return;
  }
  const result = npcs.talk(npc);
  play('pickup');
  ui.prompt(null);
  ui.openDialog(npc.name, result.lines, () => {
    if (result.started) ui.toast(`Nieuwe quest: <b>${result.started.title}</b>`, 3);
    if (result.reward) {
      giveRunes(result.reward.runes);
      for (const item of result.reward.items) stats.addItem(item);
      stats.save();
      play('win');
      effects.burst(player.position.clone().setY(player.position.y + 1.2), 0xffd76a, { count: 30, speed: 4, size: 0.1, life: 0.9, up: 3 });
      const names = result.reward.items.map((i) => itemInfo(i).name);
      ui.toast(`Beloning: <b>+${result.reward.runes} munten</b>${names.length ? ` en <b>${names.join(', ')}</b>` : ''}`, 5);
    }
  });
}

/** Laat zien welke krachten (en level-bonussen) je net hebt vrijgespeeld, één voor één. */
function announceNewPowers(before, delay = 0, newPerks = []) {
  const fresh = stats.unlockedPowers().filter((k) => !before.includes(k));
  const banners = [
    ...fresh.map((key) => [`NIEUWE KRACHT: ${POWERS[key].name.toUpperCase()}`, `${POWERS[key].key} — ${POWERS[key].info}`]),
    ...newPerks.map((key) => [`NIEUWE BONUS: ${PERKS[key].name.toUpperCase()}`, PERKS[key].info]),
  ];
  banners.forEach(([text, sub], i) => {
    setTimeout(() => {
      play('pickup');
      ui.banner(text, sub, 'power', 4.5);
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
  if (omar.onDeath()) return; // in Omars kasteel ga je niet echt dood: Omar lacht je uit en je mag terug
  state.deathTimer = 4;
  play('lose');
  ui.banner('JE BENT GESTORVEN', 'Je komt terug bij het laatste checkpoint.', 'death', 3.8);
}

function respawnAfterDeath() {
  respawnWorld();
  player.respawnAt(checkpointSpawn(stats.data.checkpoint));
  player.invulnerable = 2; // even veilig na het terugkomen
  cameraRig.snapTo(player.position);
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
    cameraRig.lock();
    return;
  }
  if (ui.menuOpen) return;
  document.exitPointerLock?.();
  ui.openInventory({
    close: () => {
      ui.closeMenu();
      cameraRig.lock();
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
  if (e.button === 0 && cameraRig.locked) {
    state.attackRequested = true;
  }
});

// ---------- Startscherm: kies je held ----------
const lockHintEl = document.getElementById('lock-hint');
const charSelectEl = document.getElementById('char-select');
const startBtn = document.getElementById('start-btn');
let gameStarted = false;

function renderCharacterSelect() {
  charSelectEl.innerHTML = PLAYABLE.map((c) => `
    <button class="char-card ${player.characterId === c.id ? 'selected' : ''}" data-id="${c.id}">
      <img src="images/personages/${c.id}.png" alt="" onerror="this.style.visibility='hidden'">
      <b>${c.name}</b><small>${c.info}</small>
    </button>`).join('');
}
renderCharacterSelect();

charSelectEl.addEventListener('click', (e) => {
  const card = e.target.closest('.char-card');
  if (!card) return;
  unlockAudio();
  play('pickup');
  stats.data.character = card.dataset.id;
  stats.save();
  player.setCharacter(card.dataset.id);
  renderCharacterSelect();
});

// Level kiezen: alleen levels die je al hebt vrijgespeeld
const levelSelectEl = document.getElementById('level-select');
function renderLevelSelect() {
  levelSelectEl.innerHTML = LEVELS.map((l, i) => `
    <button class="level-card ${i === LEVEL_INDEX ? 'selected' : ''}" data-level="${i}" ${i > stats.data.unlockedLevel ? 'disabled' : ''}>
      <b>${i > stats.data.unlockedLevel ? '🔒 ' : stats.data.bosses.includes(l.boss) ? '✔ ' : ''}${l.name}</b><small>${l.subtitle} · boss: ${BOSS_INFO[l.boss].name}</small>
    </button>`).join('');
}
renderLevelSelect();
levelSelectEl.addEventListener('click', (e) => {
  const card = e.target.closest('.level-card');
  if (!card || card.disabled || gameStarted) return;
  const index = Number(card.dataset.level);
  if (index !== LEVEL_INDEX) goToLevel(index);
});

startBtn.addEventListener('click', () => {
  unlockAudio();
  gameStarted = true;
  cameraRig.lock();
});

document.addEventListener('pointerlockchange', () => {
  lockHintEl.classList.toggle('hidden', cameraRig.locked || !!ui.menuOpen);
  // Na het begin is dit scherm ook het pauzescherm (dan kun je geen level meer kiezen)
  startBtn.textContent = gameStarted ? 'Doorgaan' : 'Spelen';
  levelSelectEl.classList.toggle('hidden', gameStarted);
  document.getElementById('level-title').classList.toggle('hidden', gameStarted);
  if (gameStarted && cameraRig.locked && !state.introShown) {
    state.introShown = true;
    ui.banner(LEVEL.name.toUpperCase(), `${LEVEL.subtitle} — versla ${BOSS_INFO[LEVEL.boss].name} aan het eind van het pad`, 'gold', 4.5);
  }
});

window.addEventListener('keydown', (e) => {
  unlockAudio();
  if (e.code === 'KeyM') toggleMute();
  if (e.code === 'KeyG' && !e.repeat) gfx.cycle(); // G = mooier of sneller: kies wat je computer aankan
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

  // E: praten of een kist openen
  const npc = player.isBusy ? null : npcs.nearby(player.position);
  if (npc) {
    ui.prompt(npc.shop ? `<b>E</b> Winkelen bij ${npc.name}` : `<b>E</b> Praat met ${npc.name}`);
    if (input.wasPressed('KeyE')) talkTo(npc);
    return;
  }
  const near = player.isBusy ? null : sites.nearbyInteraction(player.position);
  ui.prompt(near ? '<b>E</b> Kist openen' : null);
  if (near && input.wasPressed('KeyE')) {
    ui.prompt(null);
    openChest(near.target);
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
// Omar staat in elk level en neemt je mee naar zijn Gekke Kasteel (alles daarover staat in omar.js)
const omar = new OmarFlow({ scene, camera, cameraRig, input, state, stats, ui, player, bosses, npcs, sites, world, effects, pickups, decor, giveKills, giveRunes, announceNewPowers });

function gameLoop() {
  // realDt = tijd sinds vorige frame. Begrensd zodat een lag-piek je niet door de vloer laat vallen.
  const frameTime = clock.getDelta();
  const realDt = Math.min(frameTime, 0.05);
  // Tijdens een "hitstop" of een menu staat het spel even stil (de camera niet)
  // Pauze: in een menu (behalve rusten), of op het start-/pauzescherm (muis niet vast)
  const paused = !!ui.menuOpen || (!cameraRig.locked && !state.forceRun);
  const dt = state.hitstop > 0 || paused ? 0 : realDt;
  state.hitstop -= realDt;
  const elapsed = clock.elapsedTime;

  const move = readMove();
  const menuAtStart = ui.menuOpen; // welk menu was er open toen deze frame begon
  // In een gesprek: E, Spatie of klikken = volgende zin
  const inDialog = ui.menuOpen === 'dialog';
  if (inDialog && (input.wasPressed('KeyE') || input.wasPressed('Space') || input.wasPressed('Enter') || state.attackRequested)) {
    state.attackRequested = false;
    ui.advanceDialog();
  }
  // Uitrusting open: I, Tab of Esc sluit hem weer; de winkel sluit met Esc of E.
  // In die frame doen we verder niks, anders opent dezelfde toetsdruk het menu meteen opnieuw.
  const closeInventory = menuAtStart === 'inventory' && (input.wasPressed('KeyI') || input.wasPressed('Tab') || input.wasPressed('Escape'));
  const closeShopKey = menuAtStart === 'shop' && (input.wasPressed('Escape') || input.wasPressed('KeyE'));
  if (closeInventory) toggleInventory();
  if (closeShopKey) closeShop();
  const canAct = player.alive && !ui.menuOpen && !inDialog && state.deathTimer <= 0 && !paused && !closeInventory && !closeShopKey;
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
    }, world.colliders, world.bounds);
    if (player.jumped) play('jump');
    handlePlayerEvents();
    swordHits();
    spinHits();
    enemyContact();
    updateBossFights();

    // Bij een checkpoint-vlag langs gelopen? Dan kom je hier terug als je doodgaat.
    const reached = sites.reachCheckpoint(player.position);
    if (reached) {
      play('pickup');
      effects.burst(reached.position.clone().setY(2.6), 0xffd76a, { count: 30, speed: 4, size: 0.1, life: 0.9, up: 3 });
      ui.toast(`🚩 <b>Checkpoint: ${reached.name}</b><br><small>Als je doodgaat, kom je hier terug.</small>`, 3);
    }
  } else if (state.deathTimer > 0) {
    state.deathTimer -= realDt;
    if (state.deathTimer <= 0) respawnAfterDeath();
  }
  if (!player.alive && state.deathTimer <= 0) die();

  const enemyCtx = {
    time: elapsed, player, colliders: world.colliders, bounds: world.bounds, camera, onSlam: onGolemSlam,
    hurtPlayer, projectiles, effects,
    night: world.night ?? 0, // 0 = dag, 1 = nacht (vijanden kunnen dan wat gloeien)
  };
  for (const enemy of enemies) enemy.update(dt, enemyCtx);
  for (const boss of bosses) boss.update(dt, bossCtx);
  projectiles.update(dt, {
    player, hurtPlayer, colliders: world.colliders, effects,
  });
  // Is de boss dood door iets anders dan een klap? (bijv. schade terwijl je doodging)
  if (state.activeBoss && (!state.activeBoss.awake || state.activeBoss.dead)) state.activeBoss = null;

  sites.update(dt, elapsed);
  const picked = npcs.update(dt, elapsed, player.position);
  if (picked) {
    play('coin');
    effects.burst(picked.picked.mesh.position.clone(), picked.picked.questId.includes('sterren') ? 0xffd76a : 0x4dff8f, { count: 18, speed: 4, size: 0.09, life: 0.6, up: 2 });
    if (picked.finished) questReady(picked.finished);
    else ui.toast(`${picked.quest.goal.label[0].toUpperCase() + picked.quest.goal.label.slice(1)}: <b>${picked.count} / ${picked.quest.goal.count}</b>`, 2);
  }
  ui.setQuests(npcs.tracker());
  ui.markers = npcs.mapMarkers();
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
      const here = DIAMONDS.filter((x) => stats.data.diamonds.includes(x.id)).length;
      ui.toast(`💎 <b>Diamant gevonden!</b> +${value} munten<br><small>${here} / ${DIAMONDS.length} diamanten in dit level</small>`, 4);
    },
  });
  const walking = player.moving && player.onGround && player.rollTimer <= 0 && !ui.menuOpen && player.alive && !paused;
  setFootsteps(walking, input.heldFor('ShiftLeft') > 0.22 || input.heldFor('ShiftRight') > 0.22);
  decor.update(dt, elapsed, player.position, world.night ?? 0);
  updateTrail(dt);
  effects.update(dt);
  world.updateSun(player.position, dt, cameraRig.forward);

  cameraRig.update(realDt, player.position, {
    facing: player.mesh.rotation.y,
    moving: player.moving && !paused,
    lockTarget: state.lockTarget?.center ?? null,
    colliders: world.colliders,
    maxDistance: world.insideHouse(player.position) ? 2.8 : null,
  });
  effects.applyShake(camera, realDt);
  updateNightLight();
  updateBlobShadows();

  // Lock-on markering
  lockMarker.visible = !!state.lockTarget;
  if (state.lockTarget) {
    lockMarker.position.copy(state.lockTarget.center);
    lockMarker.quaternion.copy(camera.quaternion);
  }

  ui.update(realDt, player, state.activeBoss, elapsed);
  omar.update(realDt); // Omar: keuzes, reizen en tussenfilmpjes (mag de camera overnemen)

  // Af en toe automatisch opslaan
  state.saveTimer += realDt;
  if (state.saveTimer > 10) {
    state.saveTimer = 0;
    stats.save();
  }

  gfx.measure(frameTime, gameStarted && !paused);
  gfx.render();
  input.endFrame();
}

/** Het warme lichtje bij de speler: boven en achter je, en alleen als het donker is. */
function updateNightLight() {
  toCamera.copy(camera.position).sub(player.position).setY(0);
  if (toCamera.lengthSq() > 0.01) toCamera.setLength(1.2);
  nightLight.light.position.copy(player.position).add(toCamera).setY(player.position.y + 2.4);
  nightLight.light.intensity = nightLight.strength * (world.lampsOn ?? 0); // gaat al aan in de schemering
}

// Schaduw-vlekjes: waar stond de speler het laatst op iets? (dan blijft zijn vlekje daar als hij springt)
let playerGroundY = 0;

/** Zachte schaduw-vlekjes onder iedereen die in de buurt is. */
function updateBlobShadows() {
  const near = (p) => Math.abs(p.x - player.position.x) < 40 && Math.abs(p.z - player.position.z) < 40;
  blobs.begin();
  if (player.onGround) playerGroundY = player.position.y;
  if (player.mesh.visible) blobs.add(player.position, 1.1, Math.min(playerGroundY, player.position.y));
  for (const e of enemies) {
    if (!e.alive || !e.mesh.visible || !near(e.position)) continue;
    blobs.add(e.position, e.type.radius * 2.4, 0); // vijanden lopen altijd op de grond (spoken zweven erboven)
  }
  for (const b of bosses) if (b.alive && b.mesh.visible && near(b.position)) blobs.add(b.position, b.type.radius * 2.4, 0);
  for (const n of npcs.list) if (near(n.position)) blobs.add(n.position, 1.1, 0);
  for (const a of decor.animals) if (near(a.mesh.position)) blobs.add(a.mesh.position, 0.9, 0);
  blobs.end();
}

renderer.setAnimationLoop(gameLoop);

// Eerste keer spelen? Een kleine uitleg.
if (stats.level === 1 && stats.runes === 0 && stats.data.bosses.length === 0) {
  document.addEventListener('pointerlockchange', function intro() {
    if (!cameraRig.locked) return;
    document.removeEventListener('pointerlockchange', intro);
    setTimeout(() => ui.toast('Volg het pad naar het noorden en versla de boss.<br>Praat met mensen (<b>E</b>) voor zij-quests, en versla vijanden om in level te stijgen en sterker te worden.<br>Loop langs de <b>vlaggen</b>: dat zijn checkpoints.', 8), 5000);
  });
}

// Handig voor debuggen in de browser-console (F12): typ bijvoorbeeld `game.player.position`
window.game = { scene, player, enemies, bosses, sites, npcs, stats, ui, world, state, camera, cameraRig, renderer, composer, gfx, nightLight, effects, trail, onDefeated, loop: gameLoop };
window.game.omar = omar;
