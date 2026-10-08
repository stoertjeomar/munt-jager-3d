import * as THREE from 'three';
import { Input } from './input.js';
import { CameraRig } from './camera.js';
import { createGraphics } from './graphics.js';
import { BlobShadows } from './blobs.js';
import { GrassField } from './grass.js';
import { Player, PLAYABLE } from './player.js';
import { createWorld, CHECKPOINTS, ARENAS, CHESTS, grassMask } from './world.js';
import { LEVELS, LEVEL, IN_CASTLE, REGIONS, REGION_WIDTH, URL_REGION, LOCKED_REGION, GATE_X, regionIndexAt, regionOfCheckpoint } from './levels.js';
import { NPCs } from './npcs.js';
import { createEnemies, spawnEnemy } from './enemies.js';
import { createBosses, BOSS_INFO, BOSS_POWER, RAGE } from './bosses.js';
import './shadowDragon.js'; // de eindbaas in het Schaduwrijk (meldt zichzelf aan bij de bosses)
import { Sites } from './sites.js';
import { Decor } from './decor.js';
import { Stats, POWERS, PERKS, BOSS_KILLS, SHOP_ITEMS, STAR_ITEMS, APPLE_HEALTH } from './stats.js';
import { itemInfo } from './gear.js';
import { Effects } from './effects.js';
import { SwordTrail } from './trail.js';
import { UI } from './ui.js';
import { play, unlockAudio, toggleMute, setFootsteps, updateAmbience } from './audio.js';
import { Music } from './music.js';
import { Pickups, DIAMONDS } from './pickups.js';
import { Projectiles } from './projectiles.js';
import { OmarFlow } from './omar.js';
import { Dragon } from './dragon.js';
import { Pet, PET, PETS } from './pet.js';
import { Invasions } from './invasions.js';
import { Goals } from './goals.js';
import { Champions, CHAMPION } from './champions.js';
import { Villagers } from './villagers.js';

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
// Om te testen: ?level=3 in de adresbalk = begin aan het begin van gebied 3
if (!IN_CASTLE && URL_REGION !== null) stats.data.checkpoint = LEVELS[URL_REGION].checkpoints[0][0];
// Nieuw spel (of een oude save)? Begin in Muntdorp.
if (!CHECKPOINTS.some((c) => c.id === stats.data.checkpoint)) stats.data.checkpoint = CHECKPOINTS[0].id;
if (!IN_CASTLE && !stats.data.flags.includes(stats.data.checkpoint)) stats.data.flags.push(stats.data.checkpoint);
const ui = new UI(stats);
// Doelen: trofeeën (met sterren) en premies (goals.js)
const goals = new Goals(stats, {
  onTrophies(list) {
    play('levelUp');
    const total = list.reduce((n, t) => n + t.stars, 0);
    ui.toast(list.length === 1
      ? `🏆 <b>Trofee: ${list[0].name}</b> ${list[0].icon}<br><small>${list[0].info} · +${total} ⭐ (bekijk ze met K)</small>`
      : `🏆 <b>${list.length} trofeeën verdiend!</b> +${total} ⭐<br><small>${list.map((t) => t.name).join(', ')} (bekijk ze met K)</small>`, 5);
  },
  onBounty(b) {
    play('pickup');
    ui.toast(`📜 <b>Premie klaar!</b> ${goals.bountyText(b)}<br><small>Haal je beloning op bij het Premiebord in Muntdorp of bij een koopman.</small>`, 4.5);
  },
});
const input = new Input();
const world = createWorld(scene);
const sites = new Sites(scene, { checkpoints: CHECKPOINTS, chests: CHESTS }, stats);
const decor = new Decor(scene);
const pickups = new Pickups(scene, stats);
const projectiles = new Projectiles(scene);
const player = new Player(scene, stats);
const enemies = createEnemies(scene);
const bosses = createBosses(scene, ARENAS, []); // de bosses zijn er altijd (ook als je ze al eens versloeg: dan krijg je minder)
const npcs = new NPCs(scene, stats, world.colliders);
const dragon = new Dragon(scene, stats.data.dragonSkin); // Vuurtand de draak: B (na de eerste boss)
const pet = new Pet(scene, stats); // Knokkie het Boks-Dinootje (Dino-ei) of Pluis de kat (sterrenwinkel)
const villagers = IN_CASTLE ? null : new Villagers(scene, world.colliders); // dorpelingen en het Premiebord in Muntdorp
const effects = new Effects(scene);
const trail = new SwordTrail(scene);
const cameraRig = new CameraRig(camera, renderer.domElement);
// Nabewerking (gloed, kleuren, gladde randjes) en de graphics-standen (G)
const gfx = createGraphics({ renderer, scene, camera, world, ui });
const composer = gfx.composer;
const blobs = new BlobShadows(scene);
// Dicht gras rond de speler (niet in Omars kasteel); hoeveel hangt af van de graphics-stand (G).
// Het gras krijgt de kleur van het gebied waar het groeit.
const grass = LEVEL.castle ? null : new GrassField(scene, {
  regions: { themes: REGIONS.map((r) => r.theme), width: REGION_WIDTH, halfX: LEVEL.half.x },
  mask: grassMask(),
});
if (grass) gfx.onChange((preset) => grass.setCount(preset.grass, preset.grassRadius));

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

/** Waar je terugkomt bij een checkpoint (net naast de vlag, aan de kant waar het pad vandaan komt). */
function checkpointSpawn(id) {
  const checkpoint = sites.checkpoint(id) ?? sites.checkpoints[0];
  const flip = !IN_CASTLE && REGIONS[regionOfCheckpoint(checkpoint.id)].flip;
  return checkpoint.position.clone().add(new THREE.Vector3(0, 0, flip ? -2.5 : 2.5));
}

/** Jij en de camera kijken de kant op waar het pad heen loopt (naar de boss van dit gebied). */
function lookAlongPath() {
  const flip = !IN_CASTLE && REGIONS[regionIndexAt(player.position.x, player.position.z)].flip;
  cameraRig.yaw = flip ? Math.PI : 0;
  player.mesh.rotation.y = flip ? 0 : Math.PI;
  cameraRig.snapTo(player.position);
}

player.respawnAt(checkpointSpawn(stats.data.checkpoint));
lookAlongPath();
pet.placeNear(player.position, player.mesh.rotation.y);

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
  if (amount > 0) goals.onCoins(amount);
}

/** Sterren erbij (om uit te geven in de sterrenwinkel). */
function giveStars(amount) {
  stats.data.stars = (stats.data.stars ?? 0) + amount;
  stats.data.starsEarned = (stats.data.starsEarned ?? 0) + amount;
}

/**
 * Vijanden verslagen: telt mee voor je level. Geeft de nieuwe bonussen terug (of null als je niet omhoog ging).
 * `announce` = meteen een LEVEL-banner laten zien (bij een boss staat het op het LEVEL VOLTOOID-scherm).
 */
function giveKills(amount, announce = true) {
  const before = stats.unlockedPowers();
  const perksBefore = stats.unlockedPerks();
  if (!stats.addKills(amount)) return null;
  // Sterker geworden: meteen weer vol leven en stamina
  const newPerks = stats.unlockedPerks().filter((k) => !perksBefore.includes(k));
  player.health = player.maxHealth;
  player.stamina = player.maxStamina;
  play('levelUp');
  play('wow');
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

/**
 * Iets geraakt: effecten + munten als hij verslagen is.
 * (state.byDragon / state.byPet: de draak of Knokkie raakte hem, niet jij: dan staat het spel niet even stil)
 */
function onHit(target, result, color) {
  const at = target.center;
  const helper = state.byDragon || state.byPet;
  if (result.blocked) {
    // Geblokt! (de Ninjapop hield zijn zwaard ervoor)
    effects.sparks(at, 0xffffff);
    effects.floatText(at.clone().setY(at.y + target.type.height * 0.6), 'GEBLOKT!', '#9be7ff', 0.5);
    play('clang');
    return;
  }
  effects.sparks(at, color);
  effects.burst(at, target.type.color, { count: 8, speed: 5, size: 0.12, life: 0.5 });
  effects.floatText(at.clone().setY(at.y + target.type.height * 0.6), `${result.damage}`, state.byPet ? '#7dffe0' : state.byDragon || player.fireTimer > 0 ? '#ff9a3c' : '#ffffff');
  play('hit');
  if (!helper) {
    state.hitstop = result.killed ? 0.09 : 0.05;
    effects.shake(result.killed ? 0.25 : 0.12);
  }
  if (result.killed) onDefeated(target);
}

function onDefeated(target) {
  if (bosses.includes(target)) {
    onBossDefeated(target);
    return;
  }
  play('defeat');
  play('punch');
  effects.burst(target.center, target.type.color, { count: 26, speed: 7, size: 0.16, life: 0.8, up: 3 });
  effects.burst(target.center, 0xffd700, { count: 8, speed: 3, size: 0.08, life: 0.6, up: 4 });
  const finished = target.typeKey ? npcs.onKill(target.typeKey) : null;
  if (finished) questReady(finished);
  if (state.byPet && pet.addKill()) ui.toast(`${PETS[pet.kind].icon} <b>${pet.name}</b> is nu <b>level ${pet.level}</b>! Doet nu ${pet.damage} schade.`, 3.5);
  if (!target.summoned) {
    if (!state.byDragon) giveKills(1); // de draak helpt, maar sterker worden doe je zelf
    goals.onKill({ typeKey: target.typeKey, champion: !!target.champion, byDragon: !!state.byDragon, byPet: !!state.byPet });
    if (target.champion) {
      // Een Kampioen! Veel meer munten en een ster
      const bonus = champions.bonusRunes(target);
      giveRunes(bonus);
      giveStars(1);
      champions.celebrate(target);
      ui.toast(`👑 <b>Kampioen verslagen!</b> +${target.type.runes + bonus} munten en +1 ⭐`, 4);
    }
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
  schaduwdraak: [{ kind: 'weapon', key: 'drakenzwaard' }],
};

// ---------- De Schaduwpoort (naar het Schaduwrijk, gebied 5) ----------
/** Is de Schaduwpoort open? Dat is zo als de vier bosses van de wereld verslagen zijn. */
function gateOpen() {
  return !LOCKED_REGION || REGIONS.every((r) => r === LOCKED_REGION || stats.data.bosses.includes(r.boss));
}

/** Welke bosses moet je nog verslaan om de poort te openen? */
function gateMissing() {
  return REGIONS.filter((r) => r !== LOCKED_REGION && !stats.data.bosses.includes(r.boss)).map((r) => BOSS_INFO[r.boss].name);
}

/** De poort gaat open: naar het begin van het Schaduwrijk kun je nu ook snelreizen. */
function openGate() {
  world.gate?.setOpen(true);
  if (LOCKED_REGION && !stats.data.flags.includes(LOCKED_REGION.start)) stats.data.flags.push(LOCKED_REGION.start);
}

let gateToast = 0;
/** Zolang de poort dicht is: jij, je draak en je huisdier kunnen er niet door (en de vijanden van het Schaduwrijk niet terug). */
function keepGateClosed(dt) {
  if (IN_CASTLE || !LOCKED_REGION || gateOpen()) return;
  gateToast -= dt;
  const max = GATE_X - 0.6;
  if (player.position.x > max) {
    player.position.x = max;
    if (gateToast <= 0) {
      gateToast = 8;
      play('gong');
      ui.toast(`🔒 <b>De Schaduwpoort is dicht.</b><br><small>Hij gaat pas open als je deze bosses hebt verslagen: ${gateMissing().join(', ')}.</small>`, 5);
    }
  }
  if (dragon.active && dragon.position.x > max - 2) dragon.position.x = max - 2;
  if (pet.position.x > max) pet.position.x = max;
  for (const e of enemies) if (e.home.x > GATE_X && e.position.x < GATE_X + 0.6) e.position.x = GATE_X + 0.6;
}

function onBossDefeated(boss) {
  if (boss.id === 'omar') return omar.onWin(boss); // Omar verslagen: eigen feest, beloning en terugreis (omar.js)
  const firstTime = !stats.data.bosses.includes(boss.id);
  const wasOpen = gateOpen();
  const rage = !!boss.rage;
  goals.onBoss(boss.id, rage);
  boss.respawnT = BOSS_RESPAWN; // over een paar minuten is hij terug (en dan woedend)
  play('win');
  effects.shake(0.5);
  ui.banner('VIJAND GEVELD', boss.name, 'gold', 5);
  const before = stats.unlockedPowers();
  const levelBefore = stats.level;
  // Een boss telt als een heleboel verslagen vijanden
  const newPerks = giveKills(firstTime ? BOSS_KILLS.first : BOSS_KILLS.again, false) ?? [];
  giveRunes(firstTime || rage ? BOSS_INFO[boss.id].runes : Math.round(BOSS_INFO[boss.id].runes / 3));
  pickups.coinBurst(boss.center, 100);
  const rewards = firstTime ? BOSS_REWARDS[boss.id] : [];
  if (firstTime) stats.data.bosses.push(boss.id);
  for (const item of rewards) stats.addItem(item);
  const rewardNames = rewards.map((i) => itemInfo(i).name);
  if (firstTime && boss.id === DRAGON_BOSS) rewardNames.push('🐉 Vuurtand de draak (druk op <b>B</b>!)');
  if (rage) {
    giveStars(2);
    rewardNames.push('⭐⭐ 2 sterren (je versloeg hem woedend!)');
  }
  if (firstTime && boss.id === 'schaduwdraak') {
    // De eindbaas: je draak mag zijn kleuren hebben
    stats.data.dragonSkins = [...new Set([...(stats.data.dragonSkins ?? []), 'schaduw'])];
    rewardNames.push('🐉 Schaduwkleuren voor Vuurtand (kies ze bij je uitrusting, I)');
  }
  // Het volgende gebied gaat open: naar het begin daarvan kun je meteen snelreizen
  const region = REGIONS[boss.arena.region ?? 0];
  const next = REGIONS[region.index + 1];
  stats.data.unlockedLevel = Math.max(stats.data.unlockedLevel, next ? next.index : region.index);
  if (next && !next.level.locked && !stats.data.flags.includes(next.start)) stats.data.flags.push(next.start);
  const gateJustOpened = !wasOpen && gateOpen();
  if (gateJustOpened) openGate();
  state.activeBoss = null;
  state.lockTarget = null;
  removeSummons();
  stats.save();

  setTimeout(() => {
    announceNewPowers(before, 0, newPerks);
    showRegionComplete(region, rewardNames, stats.level > levelBefore, { gateJustOpened, final: boss.id === 'schaduwdraak' && firstTime });
  }, 4500);
}

/** "GEBIED VEILIG": de boss van dit gebied is verslagen. Snel door naar het volgende gebied, of verder lopen. */
function showRegionComplete(region, rewards, leveledUp = false, { gateJustOpened = false, final = false } = {}) {
  const allDone = REGIONS.every((r) => stats.data.bosses.includes(r.boss));
  if (allDone) {
    stats.data.victory = true;
    stats.save();
  }
  document.exitPointerLock?.();
  // Waar kun je nu heen? (het volgende gebied, of het Schaduwrijk als de poort net open is)
  const next = gateJustOpened ? LOCKED_REGION : REGIONS[region.index + 1];
  const nextOpen = next && stats.data.flags.includes(next.start);
  let story = `<b>${region.name}</b> is weer veilig!`;
  if (final) {
    story = `De Schaduwdraak is verslagen. <b>De wereld is ECHT gered!</b><br>Omar: "WAT?! Ook mijn draak?! ... Oké, je bent goed. Maar ben je ook een <b>LEGENDE</b>?"
      <br><br>Nieuw doel: haal alle <b>trofeeën</b> (K) en word een 🌟 Legende. Verslagen bosses komen <b>woedend</b> terug,
      er lopen <b>Kampioenen</b> 👑 rond, en op het <b>Premiebord</b> staan steeds nieuwe opdrachten.`;
  } else if (gateJustOpened) {
    story = `Alle vier de bosses zijn verslagen... en ergens rommelt het. <b>De Schaduwpoort is open!</b>
      <br>Omar: "Hahaha! Denk je dat je klaar bent? In het <b>Schaduwrijk</b> woont mijn allerlaatste geheim: de <b>SCHADUWDRAAK</b>!"`;
  } else if (next?.level.locked && !nextOpen) {
    story += `<br><br>🔒 De Schaduwpoort gaat open als je ook deze bosses verslaat: <b>${gateMissing().join(', ')}</b>.`;
  }
  const html = `${story}
    ${rewards.length ? `<br>Beloning: <b>${rewards.join(', ')}</b>` : ''}
    ${leveledUp ? `<br>⬆ Je bent nu <b>level ${stats.level}</b>!` : ''}
    ${nextOpen && !final ? `<br><br>Volgende gebied: <b>${next.name}</b>. Volg het pad, of reis er meteen heen.` : ''}`;
  const buttons = [];
  if (nextOpen && !final) buttons.push([`▶ Snel naar ${next.name}`, () => {
    closeMenuAndPlay();
    travelTo(next.start);
  }]);
  if (final) buttons.push(['🏆 Bekijk je trofeeën', openTrophies]);
  buttons.push(['Zelf verder lopen', closeMenuAndPlay]);
  ui.openLevelComplete(final ? 'DE WERELD IS ECHT GERED' : gateJustOpened ? 'DE SCHADUWPOORT IS OPEN' : allDone ? 'DE WERELD IS GERED' : 'GEBIED VEILIG', html, buttons);
}

// ---------- Trofeeën (K), premies (Premiebord) en de sterrenwinkel ----------
function openTrophies() {
  document.exitPointerLock?.();
  ui.openTrophies({ close: closeMenuAndPlay });
}

function openBounties() {
  document.exitPointerLock?.();
  ui.openBounties({
    text: (b) => goals.bountyText(b),
    claim: (id) => {
      const b = goals.claim(id);
      if (!b) return;
      giveRunes(b.runes);
      play('win');
      effects.burst(player.position.clone().setY(player.position.y + 1.2), 0xffd76a, { count: 26, speed: 4, size: 0.1, life: 0.8, up: 3 });
      ui.toast(`📜 <b>Premie opgehaald!</b> +${b.runes} munten en +${b.stars} ⭐`, 3);
    },
    close: closeMenuAndPlay,
  });
}

function closeMenuAndPlay() {
  ui.closeMenu();
  cameraRig.lock();
}

/**
 * Snelreizen naar een vlag (waar je al eens was). Je houdt je leven en flesjes:
 * het is een reis, geen rustpunt. Die vlag wordt ook meteen je terugkom-plek.
 */
function travelTo(id) {
  const keep = { health: player.health, stamina: player.stamina, flasks: player.flasks };
  if (dragon.active) dragon.hide(); // de draak vliegt niet mee
  stats.data.checkpoint = id;
  if (!stats.data.flags.includes(id)) stats.data.flags.push(id);
  stats.save();
  player.respawnAt(checkpointSpawn(id));
  Object.assign(player, keep);
  state.lockTarget = null;
  trail.cut();
  lookAlongPath();
  pet.placeNear(player.position, player.mesh.rotation.y);
  play('dash');
  play('shine');
  effects.burst(player.position.clone().setY(1), 0x9be7ff, { count: 40, speed: 5, size: 0.12, life: 0.8, up: 4 });
}

// ---------- Vuurtand de draak (B) ----------
const DRAGON_BOSS = 'mario'; // na deze boss krijg je de draak
const NO_RIDE = { move: new THREE.Vector3(), up: false, boost: false, pitch: 0.45 };
const dragonWorld = {
  colliders: world.colliders,
  bounds: world.bounds,
  arenas: ARENAS.map((arena) => ({ center: arena.center, radius: arena.radius, closed: true })),
};
const seat = new THREE.Vector3();

/** B: de draak roepen (of afstappen). */
function toggleDragon() {
  if (IN_CASTLE) return;
  if (dragon.riding || dragon.state === 'komt') {
    getOffDragon();
    return;
  }
  if (!stats.data.bosses.includes(DRAGON_BOSS)) {
    ui.toast(`🐉 Je hebt nog geen draak!<br><small>Versla eerst ${BOSS_INFO[DRAGON_BOSS].name}, de boss van de ${REGIONS[0].name}: dan komt Vuurtand de draak je helpen.</small>`, 4);
    return;
  }
  if (state.activeBoss) {
    ui.toast('🐉 Vuurtand durft niet bij een boss-gevecht te komen!', 3);
    return;
  }
  if (world.insideHouse(player.position)) {
    ui.toast('🐉 Een draak past niet in een huis! Ga eerst naar buiten.', 3);
    return;
  }
  if (dragon.active) dragon.hide(); // hij was nog aan het wegvliegen: dan keert hij meteen om
  dragon.summon(player.position, cameraRig.yaw + Math.PI);
  ui.toast('🐉 <b>Vuurtand</b> komt eraan!', 2);
}

/** Van de draak af: hij vliegt weg (hoog in de lucht val je naar beneden, dat doet geen pijn). */
function getOffDragon() {
  const wasRiding = dragon.riding;
  dragon.dismiss();
  if (!wasRiding) return;
  player.velocity.set(0, 4, 0);
  player.onGround = false;
  player.mesh.visible = true;
  ui.prompt(null);
}

/** Elke frame: de draak bijwerken (aankomen, rijden, wegvliegen) en het vuur laten branden. */
function updateDragon(dt, move, canAct, sprintHeld) {
  if (!dragon.active) return;
  for (let i = 0; i < bosses.length; i++) dragonWorld.arenas[i].closed = !bosses[i].dead;
  const ctrl = dragon.riding && canAct ? { move, up: input.isDown('Space'), boost: sprintHeld, pitch: cameraRig.pitch } : NO_RIDE;
  const tick = dragon.update(dt, ctrl, dragonWorld, effects);
  if (dragon.arrived) {
    // Hij is er: hup, op zijn rug!
    dragon.mount();
    play('jump');
    effects.burst(player.position.clone().setY(1), 0xffd76a, { count: 20, speed: 4, size: 0.1, life: 0.6, up: 3 });
    if (!stats.data.dragonTips) {
      stats.data.dragonTips = true;
      stats.save();
      ui.toast('🐉 <b>Vuurtand!</b> WASD = vliegen · <b>Spatie</b> = omhoog · kijk omlaag met de muis = dalen · <b>Shift</b> = snel · <b>klik</b> = vuur · <b>B</b> = afstappen<br><small>Vijanden die Vuurtand verbrandt geven munten, maar tellen niet mee voor je level. In een boss-arena durft hij niet.</small>', 9);
    }
  }
  if (dragon.justBlocked) {
    dragon.justBlocked = false;
    ui.toast('🐉 Vuurtand durft niet in de boss-arena! Stap af met <b>B</b> en vecht zelf.', 3);
  }
  if (tick) dragonFire();
}

/** Drakenvuur: alles in de vuurkegel krijgt schade. */
function dragonFire() {
  const damage = Math.max(25, Math.round(player.attackDamage * 0.8));
  state.byDragon = true;
  for (const e of [...enemies]) {
    if (!e.alive || e.type.dummy || !dragon.inBreath(e.center)) continue;
    const result = e.hit(dragon.position, `draak-${dragon.breathId}`, damage);
    if (result) onHit(e, result, 0xff7a1a);
  }
  state.byDragon = false;
}

/** Een vijand weghalen (bijv. de schaduwen na een Omar-invasie). */
function removeEnemy(e) {
  const i = enemies.indexOf(e);
  if (i >= 0) enemies.splice(i, 1);
  scene.remove(e.mesh);
  if (e.laser) scene.remove(e.laser);
  if (state.lockTarget === e) state.lockTarget = null;
}

/** Wereldkaart (T): waar ben je, en snelreizen naar een vlag. */
function toggleWorldMap() {
  if (ui.menuOpen === 'map') {
    closeMenuAndPlay();
    return;
  }
  if (ui.menuOpen || IN_CASTLE) return;
  document.exitPointerLock?.();
  const fighting = state.activeBoss && !state.activeBoss.dead;
  ui.openWorldMap(player, {
    travel: fighting ? null : (id) => {
      closeMenuAndPlay();
      travelTo(id);
    },
    why: 'Tijdens een boss-gevecht kun je niet snelreizen!',
    close: closeMenuAndPlay,
  });
}

/** Een quest is af: terug naar de NPC! */
function questReady(quest) {
  play('pickup');
  ui.toast(`✔ <b>${quest.title}</b> voltooid!<br><small>Ga terug om je beloning te halen.</small>`, 4);
}

/** Een nieuw huisdier: Knokkie komt uit het Dino-ei, of Pluis de kat springt erbij. */
function hatchPet(kind = 'knokkie') {
  const at = player.position.clone().add(player.facing.multiplyScalar(1.6)).setY(0);
  pet.hatch(at, kind);
  const cat = kind === 'pluis';
  effects.burst(at.clone().setY(0.6), cat ? 0xffd08a : 0xf3ead2, { count: 26, speed: 4, size: 0.12, life: 0.8, up: 3 }); // eierschaal (of kattenhaar)
  effects.burst(at.clone().setY(0.8), cat ? 0xff9fb0 : 0x7dffe0, { count: 20, speed: 3, size: 0.08, life: 0.9, up: 3 });
  if (cat) play('miauw');
  const text = cat
    ? '🐱 <b>Pluis</b> de kat loopt nu met je mee! Ze is snel en krabt vijanden.'
    : '🦖 <b>Knokkie</b> is uit het ei gekropen! Hij loopt met je mee en stoot vijanden.';
  setTimeout(() => ui.toast(`${text}<br><small>Elke ${PET.killsPerLevel} vijanden die je huisdier verslaat, wordt het sterker.${pet.canSwitch ? ' Wissel van huisdier met <b>P</b>.' : ''}</small>`, 6), cat ? 600 : 2600);
}

/** P: een ander huisdier met je mee (als je er meer dan één hebt). */
function switchPet() {
  const kind = pet.switchPet();
  if (kind) {
    pet.placeNear(player.position, player.mesh.rotation.y);
    ui.toast(`${PETS[kind].icon} <b>${PETS[kind].name}</b> loopt nu met je mee`, 2);
  } else ui.toast(pet.owned ? 'Je hebt maar één huisdier. Pluis de kat koop je in de sterrenwinkel!' : 'Je hebt nog geen huisdier. Koop een Dino-ei bij de koopman!', 3);
}

// Draak-kleuren uit de sterrenwinkel
const DRAGON_SKIN_ITEMS = { draakIjs: 'ijs', draakGoud: 'goud', draakSchaduw: 'schaduw' };
function setDragonSkin(skin) {
  stats.data.dragonSkin = skin;
  dragon.setSkin(skin);
  stats.save();
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
        const item = SHOP_ITEMS[key] ?? STAR_ITEMS[key];
        if (key === 'soep') {
          player.health = player.maxHealth;
          player.stamina = player.maxStamina;
          player.flasks = stats.flasksMax;
          play('heal');
        } else if (key === 'hart') player.health += 10;
        else if (key === 'dino') hatchPet('knokkie');
        else if (key === 'pluis') hatchPet('pluis');
        else if (key === 'sterrenzwaard') stats.addItem({ kind: 'weapon', key: 'sterrenzwaard' });
        else if (key === 'appel') {
          stats.data.apples++;
          player.health += APPLE_HEALTH;
        } else if (key === 'snoepje') {
          if (!pet.owned || !pet.levelUp()) {
            // Geen huisdier (of hij is al level 10): geld terug
            stats.data.stars += STAR_ITEMS.snoepje.price[0];
            ui.toast(pet.owned ? `${pet.name} is al het hoogste level!` : 'Je hebt nog geen huisdier! Koop eerst een Dino-ei of Pluis.', 3);
            return;
          }
        } else if (DRAGON_SKIN_ITEMS[key]) {
          const skin = DRAGON_SKIN_ITEMS[key];
          stats.data.dragonSkins = [...new Set([...(stats.data.dragonSkins ?? []), skin])];
          setDragonSkin(skin);
        }
        stats.save();
        effects.burst(player.position.clone().setY(player.position.y + 1.2), 0xffd76a, { count: 20, speed: 3, size: 0.09, life: 0.7, up: 3 });
        ui.toast(`Gekocht: <b>${item.icon} ${item.name}</b>${key === 'sterrenzwaard' ? '<br><small>Pak hem bij je uitrusting (I)</small>' : ''}`, 2.5);
      },
      bounties: openBounties,
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
      play('boing');
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
  play('faaah');
  if (omar.onDeath()) return; // in Omars kasteel ga je niet echt dood: Omar lacht je uit en je mag terug
  if (dragon.riding) {
    dragon.dismiss();
    player.position.y = 0;
  }
  if (invasions.active) invasions.finish(false, 'dood');
  state.deathTimer = 4;
  play('lose');
  ui.banner('JE BENT GESTORVEN', 'Je komt terug bij het laatste checkpoint.', 'death', 3.8);
}

function respawnAfterDeath() {
  respawnWorld();
  player.respawnAt(checkpointSpawn(stats.data.checkpoint));
  player.invulnerable = 2; // even veilig na het terugkomen
  cameraRig.snapTo(player.position);
  pet.placeNear(player.position, player.mesh.rotation.y);
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
    play('chest');
    play('shine');
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
    trophies: openTrophies,
    skin: setDragonSkin,
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

// Waar wil je beginnen? Je kunt beginnen in elk gebied dat al open is (of gewoon waar je was)
const levelSelectEl = document.getElementById('level-select');
function renderLevelSelect() {
  if (IN_CASTLE) {
    // In Omars kasteel kies je niks: daar ben je gewoon
    levelSelectEl.classList.add('hidden');
    document.getElementById('level-title').classList.add('hidden');
    return;
  }
  const here = regionIndexAt(player.position.x, player.position.z);
  levelSelectEl.innerHTML = REGIONS.map((r) => {
    const open = stats.data.flags.includes(r.start);
    return `<button class="level-card ${r.index === here ? 'selected' : ''}" data-region="${r.index}" ${open ? '' : 'disabled'}>
      <b>${open ? (stats.data.bosses.includes(r.boss) ? '✔ ' : '') : '🔒 '}${r.name}</b><small>Gebied ${r.index + 1} · boss: ${BOSS_INFO[r.boss].name}</small>
    </button>`;
  }).join('');
}
renderLevelSelect();
levelSelectEl.addEventListener('click', (e) => {
  const card = e.target.closest('.level-card');
  if (!card || card.disabled || gameStarted) return;
  const r = REGIONS[Number(card.dataset.region)];
  if (regionIndexAt(player.position.x, player.position.z) !== r.index) travelTo(r.start);
  renderLevelSelect();
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
  levelSelectEl.classList.toggle('hidden', gameStarted || IN_CASTLE);
  document.getElementById('level-title').classList.toggle('hidden', gameStarted || IN_CASTLE);
  if (gameStarted && cameraRig.locked && !state.introShown) {
    state.introShown = true;
    if (IN_CASTLE) ui.banner(LEVEL.name.toUpperCase(), `${LEVEL.subtitle} — versla ${BOSS_INFO[LEVEL.boss].name}`, 'gold', 4.5);
    else {
      const r = REGIONS[regionIndexAt(player.position.x, player.position.z)];
      const goal = stats.data.bosses.includes(r.boss) ? `${BOSS_INFO[r.boss].name} heb je al verslagen ✔` : `versla ${BOSS_INFO[r.boss].name} aan het eind van het pad`;
      ui.banner(r.name.toUpperCase(), `Gebied ${r.index + 1} — ${goal} · T = kaart`, 'gold', 4.5);
    }
  }
});

window.addEventListener('keydown', (e) => {
  unlockAudio();
  if (e.code === 'KeyM') toggleMute();
  if (e.code === 'KeyN' && !e.repeat) ui.toast(music.toggle() ? '🎵 Muziek <b>aan</b> (N)' : '🔇 Muziek <b>uit</b> (N)', 2);
  if (e.code === 'KeyG' && !e.repeat) gfx.cycle(); // G = mooier of sneller: kies wat je computer aankan
});

/** Welke kant wil de speler op? (WASD, ten opzichte van de camera) */
function readMove() {
  const f = (input.isDown('KeyW', 'ArrowUp') ? 1 : 0) - (input.isDown('KeyS', 'ArrowDown') ? 1 : 0);
  const r = (input.isDown('KeyD', 'ArrowRight') ? 1 : 0) - (input.isDown('KeyA', 'ArrowLeft') ? 1 : 0);
  return cameraRig.forward.multiplyScalar(f).add(cameraRig.right.multiplyScalar(r));
}

function handleActions(move) {
  if (input.wasPressed('KeyB')) toggleDragon();
  if (input.wasPressed('KeyT')) toggleWorldMap();
  if (input.wasPressed('KeyK')) openTrophies();
  if (input.wasPressed('KeyP')) switchPet();
  const attack = input.wasPressed('KeyF') || state.attackRequested;
  state.attackRequested = false;

  // Op de draak: klikken = vuur spuwen
  if (dragon.riding) {
    if (attack) dragon.breathe();
    if (input.wasPressed('KeyR')) player.tryDrink();
    if (input.wasPressed('KeyI') || input.wasPressed('Tab')) toggleInventory();
    const fire = Math.floor(dragon.fire / 20);
    ui.prompt(`🔥 ${'▮'.repeat(fire)}${'▯'.repeat(5 - fire)} · <b>Klik</b> vuur · <b>Spatie</b> omhoog · <b>Shift</b> snel · <b>B</b> afstappen`, 'ride');
    return;
  }

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
  // Het Premiebord in Muntdorp
  const board = villagers?.board;
  if (board && !player.isBusy && player.position.y < 1.5 && Math.hypot(board.position.x - player.position.x, board.position.z - player.position.z) < 2.6) {
    const ready = (stats.data.bounties ?? []).filter((b) => b.count >= b.n).length;
    ui.prompt(`<b>E</b> Premiebord bekijken${ready ? ` — <b>${ready} klaar!</b>` : ''}`);
    if (input.wasPressed('KeyE')) openBounties();
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
      play('dash');
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
    } else if (ev === 'drink') {
      play('gulp');
    } else if (ev === 'fire') {
      play('fire');
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

// ---------- Muziek ----------
const music = new Music();
music.preload(IN_CASTLE ? 'omar' : 'boss');

/** Welk liedje past nu? Elk gebied heeft zijn eigen deuntje, bosses hebben enge muziek en Omar de engste. */
function updateMusic() {
  const boss = state.activeBoss;
  if (!gameStarted) music.play(null);
  else if (IN_CASTLE) music.play(...omar.musicWanted());
  else if (boss && boss.awake && !boss.dead) music.play('boss');
  else music.play(currentRegion()?.music ?? LEVEL.music ?? 'weide');
  music.update();
}

// ---------- Gebieden: waar ben je in de open wereld? ----------
const regionState = { index: -1, warned: [] };

/** Het gebied waar je nu bent (null in Omars kasteel). */
function currentRegion() {
  return IN_CASTLE ? null : REGIONS[Math.max(0, regionState.index)];
}

/** Loop je een ander gebied in? Dan zie je de naam, en verandert de muziek, de mist en de geluiden. */
function updateRegion(dt) {
  if (IN_CASTLE) return;
  const index = regionIndexAt(player.position.x, player.position.z);
  const r = REGIONS[index];
  if (index !== regionState.index) {
    const first = regionState.index < 0;
    regionState.index = index;
    stats.data.currentLevel = index;
    if (!first) {
      ui.showRegion(r.name);
      // Te vroeg in een moeilijk gebied? Dan krijg je een waarschuwing (één keer)
      const before = REGIONS[index - 1];
      if (before && !stats.data.bosses.includes(before.boss) && !regionState.warned.includes(index)) {
        regionState.warned.push(index);
        ui.toast(`⚠ <b>Pas op!</b> In ${r.name} zijn de vijanden heel sterk.<br><small>Versla eerst ${BOSS_INFO[before.boss].name} in ${before.name}.</small>`, 5);
      }
    }
  }
  world.updateFog(r.theme, dt);
}

// ---------- Bosses: arena in = gevecht ----------

function updateBossFights() {
  if (!state.activeBoss) {
    for (const b of bosses) {
      if (b.dead || b.awake) continue;
      const d = player.position.clone().setY(0).distanceTo(b.arena.center);
      if (d < b.arena.radius - 1.5) {
        // Al eens verslagen? Dan is hij nu WOEDEND (meer leven, harder en sneller, en hij geeft sterren)
        if (b.id !== 'omar') b.setRage(stats.data.bosses.includes(b.id));
        b.wake();
        state.activeBoss = b;
        if (b.rage) ui.banner(`😡 ${b.info.name.toUpperCase()}`, 'Hij is terug... en hij is WOEDEND! Versla hem voor 2 ⭐', 'death', 3.5);
        else ui.banner(b.name.toUpperCase(), BOSS_INFO[b.id].title, 'gold', 3);
        play('gong');
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
// Gewone bosses doen meer schade (ook met vuurballen) en zijn sneller: zie BOSS_POWER in bosses.js
const strongBossCtx = {
  ...bossCtx,
  hurtPlayer: (from, damage) => hurtPlayer(from, Math.round(damage * BOSS_POWER.damage)),
  projectiles: { spawn: (shot) => projectiles.spawn({ ...shot, damage: Math.round(shot.damage * BOSS_POWER.damage) }) },
};
// Een woedende boss (die je al eens versloeg) doet nog meer schade: zie RAGE in bosses.js
const rageBossCtx = {
  ...bossCtx,
  hurtPlayer: (from, damage) => hurtPlayer(from, Math.round(damage * BOSS_POWER.damage * RAGE.damage)),
  projectiles: { spawn: (shot) => projectiles.spawn({ ...shot, damage: Math.round(shot.damage * BOSS_POWER.damage * RAGE.damage) }) },
};
const BOSS_RESPAWN = 180; // zoveel seconden na het verslaan komt een boss terug in zijn arena (woedend)
// Omar woont in Muntdorp en neemt je mee naar zijn Gekke Kasteel (alles daarover staat in omar.js)
const omar = new OmarFlow({ scene, camera, cameraRig, input, state, stats, ui, player, bosses, npcs, sites, world, effects, pickups, decor, giveKills, giveRunes, announceNewPowers });
// Af en toe valt Omars schaduwleger een kamp aan (invasions.js)
const invasions = new Invasions({ scene, ui, stats, effects, giveRunes, addEnemy: addSummon, removeEnemy, onWin: () => goals.onInvasion() });
// Gouden Kampioenen in elk gebied waar je al bent geweest (champions.js)
const champions = new Champions({ stats, effects, addEnemy: addSummon, removeEnemy, ui });
// Staat de Schaduwpoort al open? (bij een oude save waarin de vier bosses al verslagen zijn)
if (gateOpen()) openGate();

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
  const closeMap = (menuAtStart === 'map' && (input.wasPressed('KeyT') || input.wasPressed('Escape')))
    || (menuAtStart === 'trophies' && (input.wasPressed('KeyK') || input.wasPressed('Escape')))
    || (menuAtStart === 'bounties' && (input.wasPressed('Escape') || input.wasPressed('KeyE')));
  if (closeInventory) toggleInventory();
  if (closeShopKey) closeShop();
  if (closeMap) closeMenuAndPlay();
  const canAct = player.alive && !ui.menuOpen && !inDialog && state.deathTimer <= 0 && !paused && !closeInventory && !closeShopKey && !closeMap;
  if (canAct) handleActions(move);
  else ui.prompt(null);

  // Lock-on doel nog geldig?
  const lock = state.lockTarget;
  if (lock && (!lock.alive || lock.position.distanceTo(player.position) > 30)) state.lockTarget = null;

  const sprintHeld = input.heldFor('ShiftLeft') > 0.22 || input.heldFor('ShiftRight') > 0.22;
  updateDragon(dt, move, canAct, sprintHeld);
  if (player.alive && state.deathTimer <= 0) {
    const faceTarget = state.lockTarget ? state.lockTarget.position.clone().sub(player.position).setY(0) : null;
    if (dragon.riding) player.ride(dt, dragon.saddlePosition(seat), dragon.yaw); // op de draak: hij vliegt, jij zit
    else {
      player.update(dt, {
        move: canAct ? move : new THREE.Vector3(),
        sprint: canAct && sprintHeld,
        jumpPressed: canAct && input.wasPressed('Space'),
        faceTarget,
      }, world.colliders, world.bounds);
    }
    if (player.jumped) play('jump');
    handlePlayerEvents();
    swordHits();
    spinHits();
    enemyContact();
    updateBossFights();

    // Bij een checkpoint-vlag langs gelopen? Dan kom je hier terug als je doodgaat.
    const reached = sites.reachCheckpoint(player.position);
    if (reached) {
      const { checkpoint, first } = reached;
      play('flag');
      effects.burst(checkpoint.position.clone().setY(2.6), 0xffd76a, { count: 30, speed: 4, size: 0.1, life: 0.9, up: 3 });
      ui.toast(`🚩 <b>Checkpoint: ${checkpoint.name}</b><br><small>Als je doodgaat, kom je hier terug.${first ? ' Met <b>T</b> kun je hier later heen snelreizen.' : ''}</small>`, first ? 4 : 3);
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
  // Kampioenen slaan harder (zie CHAMPION in champions.js)
  const championCtx = {
    ...enemyCtx,
    hurtPlayer: (from, damage) => hurtPlayer(from, Math.round(damage * CHAMPION.damage)),
    onSlam: (e, radius, damage) => onGolemSlam(e, radius, Math.round(damage * CHAMPION.damage)),
  };
  for (const enemy of enemies) enemy.update(dt, enemy.champion ? championCtx : enemyCtx);
  keepGateClosed(realDt);
  champions.update(dt, player.position, gameStarted && !IN_CASTLE);
  villagers?.update(dt, player.position);
  if (gameStarted) goals.update(realDt);
  // Knokkie vecht mee
  const petHit = pet.update(dt, { player, targets: targets(), colliders: world.colliders, away: IN_CASTLE });
  if (petHit) {
    const result = petHit.target.hit(pet.position, petHit.id, petHit.damage);
    if (result) {
      state.byPet = true;
      onHit(petHit.target, result, 0x7dffe0);
      state.byPet = false;
    }
  }
  // Omar-invasies (alleen als je gewoon aan het spelen bent)
  invasions.update(dt, player.position, gameStarted && !paused && !IN_CASTLE && !state.activeBoss && player.alive && state.deathTimer <= 0);
  for (const boss of bosses) {
    if (boss.id === 'omar') boss.update(dt, bossCtx);
    else boss.update(dt * BOSS_POWER.speed * (boss.rage ? RAGE.speed : 1), boss.rage ? rageBossCtx : strongBossCtx);
    if (boss.rage && boss.awake && !boss.dead && dt > 0 && Math.random() < 0.3) {
      effects.burst(boss.center, 0xff2a2a, { count: 1, speed: 2, size: 0.18, life: 0.6, up: 1.5, gravity: 0 }); // rode woede-damp
    }
    // Verslagen bosses komen na een tijdje terug in hun arena (niet als je erbij staat)
    if (boss.dead && boss.respawnT !== undefined && boss.id !== 'omar' && dt > 0) {
      boss.respawnT -= dt;
      const far = player.position.distanceTo(boss.arena.center) > boss.arena.radius + 25;
      if (boss.respawnT <= 0 && far) {
        boss.respawnT = undefined;
        boss.dead = false;
        boss.dying = 0;
        boss.resetFight();
        boss.mesh.visible = true;
      }
    }
  }
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
  ui.setQuests([...invasions.tracker(), ...npcs.tracker()]);
  ui.markers = [...npcs.mapMarkers(), ...invasions.mapMarkers(), ...champions.mapMarkers()];
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
      // Hoeveel diamanten heb je al in dit gebied?
      const region = regionIndexAt(d.position.x, d.position.z);
      const inRegion = DIAMONDS.filter((x) => IN_CASTLE || regionIndexAt(x.position.x, x.position.z) === region);
      const here = inRegion.filter((x) => stats.data.diamonds.includes(x.id)).length;
      ui.toast(`💎 <b>Diamant gevonden!</b> +${value} munten<br><small>${here} / ${inRegion.length} diamanten in ${IN_CASTLE ? 'het kasteel' : REGIONS[region].name}</small>`, 4);
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
    moving: (player.moving || (dragon.riding && move.lengthSq() > 0)) && !paused,
    lockTarget: state.lockTarget?.center ?? null,
    colliders: world.colliders,
    maxDistance: world.insideHouse(player.position) ? 2.8 : null,
    minDistance: dragon.riding ? 11 : null, // op de draak: verder weg, dan zie je hem helemaal
  });
  effects.applyShake(camera, realDt);
  updateNightLight();
  updateBlobShadows();
  grass?.update(player.position);

  // Lock-on markering
  lockMarker.visible = !!state.lockTarget;
  if (state.lockTarget) {
    lockMarker.position.copy(state.lockTarget.center);
    lockMarker.quaternion.copy(camera.quaternion);
  }

  ui.update(realDt, player, state.activeBoss, elapsed);
  omar.update(realDt); // Omar: keuzes, reizen en tussenfilmpjes (mag de camera overnemen)
  updateRegion(realDt);
  updateMusic();
  updateAmbience(dt, { theme: currentRegion()?.theme ?? LEVEL.theme, night: world.night ?? 0 });

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
  if (pet.mesh.visible && near(pet.position)) blobs.add(pet.position, 0.9 * pet.size, 0);
  if (dragon.mesh.visible && near(dragon.position)) blobs.add(dragon.position, 4.2, 0);
  blobs.end();
}

renderer.setAnimationLoop(gameLoop);

// Eerste keer spelen? Een kleine uitleg.
if (stats.level === 1 && stats.runes === 0 && stats.data.bosses.length === 0) {
  document.addEventListener('pointerlockchange', function intro() {
    if (!cameraRig.locked) return;
    document.removeEventListener('pointerlockchange', intro);
    setTimeout(() => ui.toast('Volg het pad naar het noorden en versla de boss. De hele wereld is open: je kunt overal heen lopen!<br>Praat met mensen (<b>E</b>) voor zij-quests, en versla vijanden om in level te stijgen en sterker te worden.<br>Loop langs de <b>vlaggen</b>: dat zijn checkpoints. Met <b>T</b> open je de kaart en reis je snel naar een vlag.', 9), 5000);
  });
}

// Handig voor debuggen in de browser-console (F12): typ bijvoorbeeld `game.player.position`
window.game = { scene, player, enemies, bosses, sites, npcs, stats, ui, world, state, camera, cameraRig, renderer, composer, gfx, nightLight, grass, decor, effects, trail, onDefeated, loop: gameLoop };
window.game.omar = omar;
Object.assign(window.game, { dragon, pet, invasions, travelTo, hatchPet, spawnEnemy: addSummon, goals, champions, villagers, gateOpen, openBounties, openTrophies });
window.game.music = music;
