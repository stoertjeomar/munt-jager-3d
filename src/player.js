import * as THREE from 'three';
import { loadGLB } from './assets.js';
import { clone as cloneSkinned } from 'three/addons/utils/SkeletonUtils.js';
import { Sword } from './sword.js';
import { buildCharacter } from './character.js';
import { CharacterAnimator } from './animator.js';
import { HELMETS, createHelmetMesh } from './gear.js';
import { POWERS } from './stats.js';
import { createMixamoRig } from './mixamo.js';
import { ClipPlayer } from './retarget.js';
import { collidersNear } from './spatial.js';

// Personages waaruit je kunt kiezen (aan het begin van het spel, of later in het startscherm met Esc)
// Alle personages. Alleen Eve en Soldaat kun je zelf spelen; de rest woont in de wereld als NPC (zie npcs.js).
export const CHARACTERS = [
  { id: 'ridder', name: 'Ridder', file: 'models/speler.glb', info: 'Een stoere ridder in zwart harnas. Past alle helmen.' },
  { id: 'eve', name: 'Eve', file: 'models/personages/eve.glb', info: 'Ruimtepiraat met een litteken en lef.' },
  { id: 'soldaat', name: 'Soldaat', file: 'models/personages/soldaat.glb', info: 'Getrainde soldaat in kogelvrij vest.' },
  { id: 'mila', name: 'Mila', file: 'models/personages/mila.glb', info: 'Klein, snel en dapper, met turquoise haar.' },
  { id: 'robot', name: 'Robot', file: 'models/robot.glb', height: 1.25, info: 'Een vrolijke robot uit het Kenney-pakket.' },
  { id: 'strohoed', name: 'Strohoed', file: null, info: 'Het allereerste poppetje van deze game!' },
];
export const PLAYABLE = CHARACTERS.filter((c) => ['eve', 'soldaat'].includes(c.id));
export const otherPlayable = (id) => PLAYABLE.find((c) => c.id !== (PLAYABLE.some((p) => p.id === id) ? id : PLAYABLE[0].id))?.id ?? 'soldaat'; // Omar draagt altijd het andere personage

// Instellingen van de speler — speel hiermee om het gevoel te veranderen!
const SPEED = 6.5; // loopsnelheid (meter per seconde)
const SPRINT = 1.6; // zoveel keer sneller als je sprint (Shift ingedrukt houden)
const JUMP_SPEED = 9; // hoe hard je omhoog springt
const GRAVITY = 25; // zwaartekracht
const RADIUS = 0.45; // dikte van de speler
const HEIGHT = 1.6; // lengte van de speler
const INVULNERABLE_TIME = 0.6; // na een klap ben je even onkwetsbaar
const STAMINA_REGEN = 32; // stamina per seconde terug
const STAMINA_DELAY = 0.6; // zo lang na iets doen voordat stamina terugkomt

const ROLL = { time: 0.5, speed: 9.5, stamina: 16, iframes: [0.03, 0.38] }; // rollen (Shift kort indrukken)
const DASH = { time: 0.22, speed: 27 };
const SPIN_TIME = 0.55;
const DRINK = { time: 0.95, healAt: 0.5, heal: 0.45 }; // een flesje drinken: 45% van je leven terug
const SLAM_SPEED = 32;

const MODEL_TURN = 0; // kijkt het model de verkeerde kant op? Probeer Math.PI of Math.PI / 2
const MODEL_HAND = [-0.34, 0.55, 0.14]; // alleen voor modellen zonder rig: waar de rechterhand zit
const PICKUP_TIME = 0.6; // hoe lang bukken en oppakken duurt (seconden)
const FLIP_TIME = 0.45; // salto bij de dubbele sprong

// Echte animaties (uit de Universal Animation Library 2, zie retarget.js) voor als je iets doet.
// Lopen en rennen doet onze eigen animator; deze komen er bovenop.
//   name = animatie   from/to = welk stuk (0 = begin, 1 = eind)   time = hoe lang (seconden)
//   mask = welke botten ('full' = alles, 'upper' = alleen bovenlijf)   root = mogen de heupen zakken/verschuiven
const CLIPS = {
  slashA: { name: 'Sword_Regular_A', from: 0, to: 1 }, // slag van rechtsonder naar linksboven
  slashB: { name: 'Sword_Regular_B', from: 0, to: 1 }, // slag van boven naar beneden
  smash: { name: 'Sword_Heavy_Combo', from: 0.14, to: 0.3 }, // zware wapens: hoog optillen en neer meppen
  dash: { name: 'Sword_Dash', from: 0.3, to: 0.6, root: 'none' }, // uitval naar voren
  jump: { name: 'NinjaJump_Start', from: 0.14, to: 0.45, time: 0.28, root: 'none' }, // afzetten
  air: { name: 'NinjaJump_Idle_Loop', from: 0, to: 1, time: 2, root: 'none', loop: true }, // knie omhoog in de lucht
  land: { name: 'NinjaJump_Land', from: 0.12, to: 0.62, time: 0.5, root: 'down' }, // door de knieën na een hoge sprong
  heroLand: { name: 'NinjaJump_Land', from: 0.1, to: 0.62, time: 0.7, root: 'down' }, // na de grondslag
  hurt: { name: 'Hit_Knockback', from: 0, to: 0.14, time: 0.28, mask: 'upper', weight: 0.85 }, // auw!
  die: { name: 'Hit_Knockback', from: 0, to: 0.98, time: 1.2, root: 'all' }, // achterover vallen
  drink: { name: 'Consume', from: 0.05, to: 0.95, mask: 'upper', mirror: true }, // drinken met je linkerhand
  pickup: { name: 'Chest_Open', from: 0, to: 0.6, root: 'down', weight: 0.85 }, // bukken
};
const HEAVY = ['club', 'hamer', 'bijl'];

/** Kopie van een model; skeletten (Mixamo) hebben een speciale kopie nodig. */
function cloneModel(scene) {
  let skinned = false;
  scene.traverse((c) => (skinned ||= c.isSkinnedMesh));
  return skinned ? cloneSkinned(scene) : scene.clone(true);
}

export class Player {
  /**
   * @param {THREE.Scene} scene
   * @param {import('./stats.js').Stats} stats
   */
  constructor(scene, stats) {
    this.stats = stats;
    this.mesh = new THREE.Group(); // positie + draaiing (kijkrichting)
    this.body = new THREE.Group(); // draait bij rollen en de wervelslag (om het midden van het lijf)
    this.body.position.y = 0.8;
    this.inner = new THREE.Group();
    this.inner.position.y = -0.8;
    this.mesh.add(this.body);
    this.body.add(this.inner);
    this.sword = new Sword();

    // Het poppetje uit character.js (wordt vervangen als er een 3D-model is)
    const character = buildCharacter();
    this.placeholder = character.group;
    this.placeholderRig = character.rig;
    this.inner.add(this.placeholder);
    this.useRig(character.rig);

    scene.add(this.mesh);

    this.velocity = new THREE.Vector3();
    this.knockback = new THREE.Vector3();
    this.onGround = false;
    this.moving = false;
    this.mixer = null;
    this.actions = {};
    this.currentAction = null;
    this.spawnPoint = new THREE.Vector3(0, 0, 8);
    this.reset();
    this.setCharacter(stats.data.character ?? 'eve');
  }

  /** Ander personage kiezen (zie CHARACTERS). */
  setCharacter(id) {
    const character = PLAYABLE.find((c) => c.id === id) ?? PLAYABLE[0];
    this.characterId = character.id;
    this.loadToken = (this.loadToken ?? 0) + 1;
    if (!character.file) {
      this.showModel(this.placeholder);
      this.model = null;
      this.mixer = null;
      this.headSlot = null;
      this.useRig(this.placeholderRig);
      return;
    }
    this.loadModel(character.file, this.loadToken, character.height ?? HEIGHT);
  }

  /** Haal het huidige model weg en laat dit zien. */
  showModel(object) {
    if (this.model) this.inner.remove(this.model);
    this.inner.remove(this.placeholder);
    if (this.fallbackHand) {
      this.inner.remove(this.fallbackHand);
      this.fallbackHand = null;
    }
    this.inner.add(object);
  }

  get position() {
    return this.mesh.position;
  }

  get maxHealth() {
    return this.stats.maxHealth;
  }

  get maxStamina() {
    return this.stats.maxStamina;
  }

  get alive() {
    return this.health > 0;
  }

  /** Richting waarin de speler kijkt (op de grond). */
  get facing() {
    return new THREE.Vector3(Math.sin(this.mesh.rotation.y), 0, Math.cos(this.mesh.rotation.y));
  }

  /** Bezig met iets waardoor je niet kunt slaan of rollen? */
  get isBusy() {
    return this.pickupTimer > 0 || this.rollTimer > 0 || this.dashTimer > 0 || this.drinkTimer > 0 || this.spinTimer > 0 || this.slamming;
  }

  /** Kan nu geen schade krijgen? (rollen, dashen, net geraakt) */
  get invincible() {
    const rollT = ROLL.time - this.rollTimer;
    const rolling = this.rollTimer > 0 && rollT > ROLL.iframes[0] && rollT < ROLL.iframes[1];
    return rolling || this.dashTimer > 0 || this.invulnerable > 0;
  }

  /** Volledig herstellen en neerzetten op een plek (bijv. bij een checkpoint). */
  respawnAt(position) {
    this.spawnPoint.copy(position);
    this.reset();
  }

  reset() {
    this.health = this.maxHealth;
    this.stamina = this.maxStamina;
    this.staminaDelay = 0;
    this.flasks = this.stats.flasksMax;
    this.invulnerable = 0;
    this.pickupTimer = this.rollTimer = this.dashTimer = this.drinkTimer = this.spinTimer = 0;
    this.dashCooldown = this.spinCooldown = this.fireCooldown = this.fireTimer = 0;
    this.slamming = false;
    this.airJumps = 0;
    this.airDashes = 0;
    this.onGrab = null;
    this.oneShot = null; // een korte echte animatie (springen, landen, auw)
    this.flipTimer = 0;
    this.combo = 0;
    this.clock ??= 0; // speeltijd (seconden), voor combo's
    this.lastSwingEnd = -1;
    this.deathTime = 0;
    this.events = []; // bijv. 'roll', 'dash', 'spinHit', 'slamLand', 'heal' — main.js reageert daarop
    this.mesh.visible = true;
    this.body.rotation.set(0, 0, 0);
    this.sword.reset();
    this.sword.setWeapon(this.stats.data.weapon);
    this.setHelmet(this.stats.data.helmet);
    this.position.copy(this.spawnPoint);
    this.velocity.set(0, 0, 0);
    this.knockback.set(0, 0, 0);
    this.mesh.rotation.y = Math.PI; // kijk de wereld in
  }

  /** Gebruik een rig (armen, benen, heupen, hand): het wapen gaat in de hand en de animator laat alles bewegen. */
  useRig(rig) {
    this.rig = rig;
    this.animator = new CharacterAnimator(rig);
    this.clips = null;
    this.sword.attachTo(rig.gripParent ?? rig.handR, rig.unit);
  }

  setHelmet(key) {
    this.helmetKey = key;
    if (!this.headSlot) return;
    this.headSlot.clear();
    this.headSlot.add(createHelmetMesh(key));
  }

  get defense() {
    return Math.min(0.75, (HELMETS[this.helmetKey]?.defense ?? 0) + this.stats.defenseBonus);
  }

  /** Schade die jouw wapen nu doet (met je level en Vuurzwaard). */
  get attackDamage() {
    const fire = this.fireTimer > 0 ? 1.5 : 1;
    return Math.round(this.sword.damage * this.stats.damageMultiplier * fire * (this.boost?.damage ?? 1));
  }

  /** Een 3D-personage laden. */
  loadModel(url, token, height = HEIGHT) {
    loadGLB(url).then(
      (gltf) => {
        if (token !== this.loadToken) return; // intussen al een ander personage gekozen
        const model = cloneModel(gltf.scene);
        model.rotation.y = MODEL_TURN;

        // Even groot maken als de speler, met de voeten op de grond en het midden in het midden
        model.updateMatrixWorld(true);
        const box = new THREE.Box3().setFromObject(model);
        const size = box.getSize(new THREE.Vector3());
        const scale = height / size.y;
        model.scale.setScalar(scale);
        model.updateMatrixWorld(true);
        box.setFromObject(model);
        const center = box.getCenter(new THREE.Vector3());
        model.position.set(-center.x, -box.min.y, -center.z);

        model.traverse((child) => {
          if (child.isMesh) {
            child.castShadow = true;
            child.receiveShadow = true;
            if (child.isSkinnedMesh) child.frustumCulled = false; // anders verdwijnt hij soms
          }
        });

        this.showModel(model);
        this.model = model;
        this.mixer = null;
        this.modelBaseY = model.position.y;

        // Heeft het model losse onderdelen met deze namen? Dan kunnen we het zelf laten bewegen.
        const part = (name) => model.getObjectByName(name);
        if (part('Hips') && part('ArmL') && part('ArmR') && part('LegL') && part('LegR') && part('HandR')) {
          this.useRig({
            hips: part('Hips'), armL: part('ArmL'), armR: part('ArmR'), legL: part('LegL'), legR: part('LegR'), handR: part('HandR'),
            unit: 1 / scale,
          });
          this.headSlot = part('HeadSlot') ?? null;
          this.setHelmet(this.helmetKey);
          return;
        }

        // Een Mixamo-personage (met skelet)? Dan vertalen we onze animaties naar zijn botten.
        const mixamoRig = createMixamoRig(model);
        if (mixamoRig) {
          this.useRig(mixamoRig);
          this.headSlot = mixamoRig.headSlot;
          this.setHelmet(this.helmetKey);
          // Echte animaties erbij (als die geladen zijn)
          ClipPlayer.create(mixamoRig.skeleton).then((clips) => {
            if (token === this.loadToken && this.rig === mixamoRig && clips.ok) this.clips = clips;
          }).catch((e) => console.info('Geen echte animaties:', e));
          return;
        }

        // Anders: wapen in een vaste "hand" naast het model
        this.rig = null;
        this.headSlot = null;
        const hand = new THREE.Group();
        hand.position.fromArray(MODEL_HAND);
        this.inner.add(hand);
        this.fallbackHand = hand;
        this.sword.attachTo(hand);
        if (gltf.animations.length > 0) {
          this.mixer = new THREE.AnimationMixer(model);
          const find = (pattern) => gltf.animations.find((clip) => pattern.test(clip.name));
          const clips = { idle: find(/idle|stand/i), walk: find(/run|walk/i) ?? gltf.animations[0], jump: find(/jump/i) };
          for (const [name, clip] of Object.entries(clips)) if (clip) this.actions[name] = this.mixer.clipAction(clip);
        }
      },
      (error) => console.info(`Kon ${url} niet laden, je speelt met het standaard poppetje.`, error)
    );
  }

  // ---------------- Acties ----------------

  useStamina(amount) {
    if (this.stats.infiniteStamina) return true; // admin: oneindig stamina
    if (this.stamina < 1) return false;
    this.stamina = Math.max(0, this.stamina - amount);
    this.staminaDelay = STAMINA_DELAY;
    return true;
  }

  /** Slaan met je wapen. */
  tryAttack() {
    if (this.isBusy || this.sword.attackProgress !== null) return false;
    if (!this.useStamina(this.sword.stamina)) return false;
    if (!this.sword.swing()) return false;
    // Snel achter elkaar slaan = een combo: om en om een andere slag
    const now = this.clock;
    this.combo = now - this.lastSwingEnd < 0.45 ? this.combo + 1 : 0;
    this.lastSwingEnd = now + this.sword.swingTime;
    return true;
  }

  tryRoll(direction) {
    if (this.isBusy || !this.onGround || this.sword.attackProgress !== null) return false;
    if (!this.useStamina(ROLL.stamina)) return false;
    this.rollTimer = ROLL.time;
    this.rollDir = direction.lengthSq() > 0 ? direction.clone().normalize() : this.facing;
    this.mesh.rotation.y = Math.atan2(this.rollDir.x, this.rollDir.z);
    this.events.push('roll');
    return true;
  }

  /**
   * Het lijf draait alleen tijdens een koprol, een salto of de wervelslag. We rekenen het elke frame opnieuw uit
   * uit de timers: stopt zo'n beweging halverwege (je landt midden in een salto, of dasht midden in een koprol),
   * dan staat je poppetje meteen weer recht. Zo kan hij nooit scheef of ondersteboven blijven staan.
   */
  bodyTurn() {
    const rolling = this.rollTimer > 0;
    const flipping = this.flipTimer > 0;
    const spinning = this.spinTimer > 0;
    if (!rolling && !flipping && !spinning && !this.bodyTurned) return;
    let x = 0;
    if (rolling) x = (1 - this.rollTimer / ROLL.time) * Math.PI * 2; // een hele koprol
    else if (flipping) {
      const k = 1 - this.flipTimer / FLIP_TIME;
      x = k * k * (3 - 2 * k) * Math.PI * 2; // salto: rustig beginnen, snel draaien, rustig uitkomen
    }
    this.body.rotation.set(x, spinning ? (1 - this.spinTimer / SPIN_TIME) * Math.PI * 4 : 0, 0); // wervelslag: twee keer rond
    this.bodyTurned = rolling || flipping || spinning;
  }

  tryDash(direction) {
    if (!this.stats.hasPower('dash') || this.dashCooldown > 0 || this.pickupTimer > 0 || this.drinkTimer > 0) return false;
    if (!this.onGround && this.airDashes > 0) return false;
    if (!this.useStamina(POWERS.dash.stamina)) return false;
    this.dashTimer = DASH.time;
    this.dashCooldown = POWERS.dash.cooldown;
    this.dashDir = direction.lengthSq() > 0 ? direction.clone().normalize() : this.facing;
    this.mesh.rotation.y = Math.atan2(this.dashDir.x, this.dashDir.z);
    this.rollTimer = 0;
    if (!this.onGround) this.airDashes++;
    this.events.push('dash');
    return true;
  }

  trySpin() {
    if (!this.stats.hasPower('spin') || this.spinCooldown > 0 || this.isBusy) return false;
    if (!this.useStamina(POWERS.spin.stamina)) return false;
    this.spinTimer = SPIN_TIME;
    this.spinCooldown = POWERS.spin.cooldown;
    this.spinId = `spin-${Math.random()}`;
    this.events.push('spin');
    return true;
  }

  trySlam() {
    if (!this.stats.hasPower('slam') || this.onGround || this.slamming || this.isBusy) return false;
    if (!this.useStamina(POWERS.slam.stamina)) return false;
    this.slamming = true;
    this.velocity.y = -SLAM_SPEED;
    this.events.push('slamStart');
    return true;
  }

  tryFire() {
    if (!this.stats.hasPower('fire') || this.fireCooldown > 0 || this.isBusy) return false;
    if (!this.useStamina(POWERS.fire.stamina)) return false;
    this.fireTimer = POWERS.fire.duration;
    this.fireCooldown = POWERS.fire.cooldown;
    this.events.push('fire');
    return true;
  }

  tryDrink() {
    if (this.isBusy || this.flasks <= 0 || this.sword.attackProgress !== null) return false;
    this.flasks--;
    this.drinkTimer = DRINK.time;
    this.healed = false;
    this.events.push('drink');
    return true;
  }

  /** Bukken om iets op te pakken. `onGrab` wordt uitgevoerd als de hand bij de grond is. */
  startPickup(onGrab) {
    if (this.isBusy) return;
    this.pickupTimer = PICKUP_TIME;
    this.onGrab = onGrab;
  }

  /** Geraakt. Geeft het aantal schadepunten terug (0 als je onkwetsbaar was). */
  hurt(from, damage) {
    if (this.invincible || !this.alive) return 0;
    const taken = Math.max(1, Math.round(damage * (1 - this.defense)));
    this.health = Math.max(0, this.health - taken);
    this.invulnerable = INVULNERABLE_TIME;
    this.drinkTimer = 0; // drinken wordt onderbroken
    this.pickupTimer = 0;
    this.playOnce('hurt');

    // Wegstoten, met een klein sprongetje
    const away = this.position.clone().sub(from).setY(0);
    if (away.lengthSq() < 1e-6) away.copy(this.facing).negate();
    this.knockback.copy(away.normalize().multiplyScalar(9));
    if (!this.slamming) {
      this.velocity.y = Math.max(this.velocity.y, 4);
      this.onGround = false;
    }
    return taken;
  }

  /** Na het springen op een vijand: omhoog stuiteren. */
  bounce() {
    this.velocity.y = JUMP_SPEED * 0.75;
    this.onGround = false;
    this.airJumps = 0;
  }

  // ---------------- Elke frame ----------------

  /**
   * @param {number} dt
   * @param {object} controls  { move: Vector3 (wereldrichting), sprint, jumpPressed }
   */
  /** @param {{x: number, z: number}} bounds  verder dan dit kun je niet lopen */
  update(dt, controls, colliders, bounds) {
    const move = controls.move.clone();
    const hasMove = move.lengthSq() > 0;
    if (hasMove) move.normalize();

    // Timers
    this.clock += dt;
    for (const key of ['invulnerable', 'dashCooldown', 'spinCooldown', 'fireCooldown', 'fireTimer']) this[key] = Math.max(0, this[key] - dt);
    this.sword.update(dt);

    // Stamina komt vanzelf terug (niet tijdens sprinten of acties)
    this.staminaDelay -= dt;
    const sprinting = controls.sprint && hasMove && this.onGround && !this.isBusy && this.stamina > 0;
    if (sprinting) {
      this.stamina = Math.max(0, this.stamina - 14 * dt);
      this.staminaDelay = 0.3;
    } else if (this.staminaDelay <= 0 && !this.isBusy) {
      this.stamina = Math.min(this.maxStamina, this.stamina + STAMINA_REGEN * dt);
    }
    if (this.stats.infiniteStamina) this.stamina = this.maxStamina;

    // Knipperen als je net geraakt bent
    this.mesh.visible = this.invulnerable <= 0 || this.rollTimer > 0 || Math.floor(this.invulnerable * 14) % 2 === 0;

    // ---------- Snelheid bepalen ----------
    let speed = SPEED * this.stats.speedMultiplier * (this.boost?.speed ?? 1) * (sprinting ? SPRINT : 1);
    if (this.sword.attackProgress !== null) speed *= 0.35; // langzamer tijdens een slag
    if (this.drinkTimer > 0 || this.pickupTimer > 0) speed *= 0.3;
    let horizontal = move.clone().multiplyScalar(speed);

    if (this.rollTimer > 0) {
      this.rollTimer -= dt;
      const k = 1 - this.rollTimer / ROLL.time;
      horizontal = this.rollDir.clone().multiplyScalar(ROLL.speed * (1 - k * 0.6)); // (de koprol zelf: zie bodyTurn)
    } else if (this.dashTimer > 0) {
      this.dashTimer -= dt;
      horizontal = this.dashDir.clone().multiplyScalar(DASH.speed);
      this.velocity.y = 0; // dash gaat recht vooruit, ook in de lucht
    } else if (hasMove && this.spinTimer <= 0) {
      // Draai de speler soepel in de looprichting (niet als je naar een vijand gelockt bent en slaat)
      const look = controls.faceTarget && this.sword.attackProgress !== null ? controls.faceTarget : move;
      const targetAngle = Math.atan2(look.x, look.z);
      let diff = targetAngle - this.mesh.rotation.y;
      diff = Math.atan2(Math.sin(diff), Math.cos(diff));
      this.mesh.rotation.y += diff * Math.min(1, 14 * dt);
    }
    if (controls.faceTarget && this.sword.attackProgress !== null && this.rollTimer <= 0 && this.dashTimer <= 0) {
      // Met lock-on draai je bij het slaan naar je doel toe
      const targetAngle = Math.atan2(controls.faceTarget.x, controls.faceTarget.z);
      let diff = targetAngle - this.mesh.rotation.y;
      this.mesh.rotation.y += Math.atan2(Math.sin(diff), Math.cos(diff)) * Math.min(1, 12 * dt);
    }

    // Wervelslag: twee keer rondtollen
    if (this.spinTimer > 0) {
      this.spinTimer -= dt;
      horizontal.multiplyScalar(0.5);
    }

    this.velocity.x = horizontal.x + this.knockback.x;
    this.velocity.z = horizontal.z + this.knockback.z;
    this.knockback.multiplyScalar(Math.exp(-7 * dt));

    // ---------- Springen (en dubbele sprong) ----------
    this.jumped = false;
    if (controls.jumpPressed && !this.isBusy) {
      if (this.onGround) {
        this.velocity.y = JUMP_SPEED;
        this.onGround = false;
        this.jumped = true;
        this.playOnce('jump');
      } else if (this.stats.hasPower('doubleJump') && this.airJumps === 0 && this.useStamina(POWERS.doubleJump.stamina)) {
        this.velocity.y = JUMP_SPEED * 0.9;
        this.airJumps++;
        this.jumped = true;
        this.flipTimer = FLIP_TIME; // salto!
        this.events.push('doubleJump');
      }
    }

    // ---------- Zwaartekracht ----------
    if (this.dashTimer <= 0) this.velocity.y -= GRAVITY * dt;

    // ---------- Bewegen + botsingen (per as apart, dat is het simpelst) ----------
    const pos = this.position;
    // Alleen de blokken vlak bij je bekijken (niet alle duizenden van de hele wereld, zie spatial.js)
    const reach = RADIUS + 1 + (Math.abs(this.velocity.x) + Math.abs(this.velocity.z)) * dt;
    colliders = collidersNear(colliders, pos.x, pos.z, reach, (this.nearColliders ??= []));
    pos.x += this.velocity.x * dt;
    this.resolveHorizontal('x', colliders);
    pos.z += this.velocity.z * dt;
    this.resolveHorizontal('z', colliders);
    pos.x = THREE.MathUtils.clamp(pos.x, -bounds.x, bounds.x);
    pos.z = THREE.MathUtils.clamp(pos.z, -bounds.z, bounds.z);

    const prevY = pos.y;
    const wasInAir = !this.onGround;
    const fallSpeed = -this.velocity.y;
    pos.y += this.velocity.y * dt;
    this.onGround = false;
    this.resolveVertical(prevY, colliders);
    if (this.onGround) {
      this.airJumps = 0;
      this.airDashes = 0;
      if (this.slamming) {
        this.slamming = false;
        this.events.push('slamLand');
        this.playOnce('heroLand'); // superheldenlanding
      } else if (wasInAir) {
        this.events.push('land');
        if (fallSpeed > 13 && !hasMove) this.playOnce('land');
        else if (this.oneShot?.key === 'jump') this.oneShot = null;
      }
      this.flipTimer = 0;
    }

    // Salto bij de dubbele sprong (het hele lijf draait één keer voorover)
    if (this.flipTimer > 0) this.flipTimer = Math.max(0, this.flipTimer - dt);
    this.bodyTurn();

    this.updateDrink(dt);

    // ---------- Animatie ----------
    this.moving = hasMove;
    this.sprinting = sprinting;
    this.updateAnimation(dt);
  }

  /** Flesje drinken: halverwege komt het leven terug. */
  updateDrink(dt) {
    if (this.drinkTimer <= 0) return;
    this.drinkTimer -= dt;
    if (!this.healed && DRINK.time - this.drinkTimer >= DRINK.healAt) {
      this.healed = true;
      this.health = Math.min(this.maxHealth, this.health + Math.round(this.maxHealth * (DRINK.heal + this.stats.healBonus)));
      this.events.push('heal');
    }
  }

  /**
   * Op de draak zitten (in plaats van update): de draak bepaalt waar je bent, jij zit in het zadel.
   * @param {THREE.Vector3} seat  waar het zadel is (in de wereld)
   * @param {number} yaw  welke kant de draak op kijkt
   */
  ride(dt, seat, yaw) {
    for (const key of ['invulnerable', 'dashCooldown', 'spinCooldown', 'fireCooldown', 'fireTimer']) this[key] = Math.max(0, this[key] - dt);
    this.sword.update(dt);
    this.staminaDelay -= dt;
    if (this.staminaDelay <= 0) this.stamina = Math.min(this.maxStamina, this.stamina + STAMINA_REGEN * dt);
    this.rollTimer = this.dashTimer = this.spinTimer = this.pickupTimer = 0;
    this.slamming = false;
    this.body.rotation.set(0, 0, 0);
    this.mesh.visible = this.invulnerable <= 0 || Math.floor(this.invulnerable * 14) % 2 === 0;
    this.position.copy(seat).y -= 0.8; // je heupen op het zadel
    this.velocity.set(0, 0, 0);
    this.knockback.set(0, 0, 0);
    this.mesh.rotation.y = yaw;
    this.onGround = true;
    this.jumped = false;
    this.moving = false;
    this.sprinting = false;
    this.updateDrink(dt);
    if (this.rig) {
      this.animator.update(dt, { moving: false, vy: 0, turn: 0, run: false, onGround: true, attack: null, pickup: null, drink: this.drinkTimer > 0 ? 1 - this.drinkTimer / DRINK.time : null, spin: false, tuck: false, ride: true });
      this.rig.apply?.();
      this.oneShot = null;
      this.clips?.apply(dt, null);
    }
  }

  /** Een korte echte animatie één keer afspelen (zie CLIPS), bijv. 'hurt' of 'land'. */
  playOnce(key) {
    if (!this.clips) return;
    this.oneShot = { key, t: 0, restart: true };
  }

  /** Hoe je eruitziet als je net dood bent: achterover vallen en blijven liggen. */
  animateDeath(dt) {
    if (!this.rig) return;
    this.deathTime += dt;
    this.body.rotation.set(0, 0, 0);
    this.animator.update(dt, { moving: false, vy: 0, turn: 0, run: false, onGround: true, attack: null, pickup: null, drink: null, spin: false, tuck: false });
    this.rig.apply?.();
    const c = CLIPS.die;
    const k = Math.min(1, this.deathTime / c.time);
    this.clips?.apply(dt, this.clipWant(c, k, { fadeIn: 0.05 }));
  }

  /** Wat de ClipPlayer moet afspelen voor animatie c op moment k (0 → 1). */
  clipWant(c, k, extra) {
    const clip = this.clips;
    const dur = clip.duration(c.name);
    let f = c.from + (c.to - c.from) * k;
    if (c.loop) f %= 1;
    return { name: c.name, time: f * dur, weight: c.weight ?? 1, mask: c.mask ?? 'full', root: c.root ?? 'all', mirror: c.mirror, ...extra };
  }

  /** Welke echte animatie er nu bij hoort (of null: dan alleen onze eigen animator). */
  chooseClip(dt) {
    const sword = this.sword;
    const moving = this.moving && this.onGround;
    // Een korte animatie die nog loopt (springen, landen, geraakt worden)
    let once = null;
    if (this.oneShot) {
      const c = CLIPS[this.oneShot.key];
      this.oneShot.t += dt;
      const k = this.oneShot.t / c.time;
      const cancel = (this.oneShot.key === 'land' || this.oneShot.key === 'heroLand') && this.moving;
      if (k >= 1 || cancel) this.oneShot = null;
      else {
        once = this.clipWant(c, k, { restart: this.oneShot.restart });
        this.oneShot.restart = false;
      }
    }
    if (this.rollTimer > 0 || this.spinTimer > 0 || this.flipTimer > 0 || this.slamming) return null; // die doet onze animator
    if (sword.attackProgress !== null) {
      const key = HEAVY.includes(sword.weaponKey) ? 'smash' : this.combo % 2 ? 'slashB' : 'slashA';
      const restart = this.lastClipSwing !== sword.swingId;
      this.lastClipSwing = sword.swingId;
      return this.clipWant(CLIPS[key], sword.attackProgress, {
        restart,
        mask: moving || !this.onGround ? 'upper' : 'full', // lopend slaan: je benen lopen gewoon door
        fadeIn: 0.05,
        fadeOut: 0.18,
      });
    }
    if (this.dashTimer > 0) return this.clipWant(CLIPS.dash, 1 - this.dashTimer / DASH.time, { fadeIn: 0.03, fadeOut: 0.2 });
    if (this.drinkTimer > 0) return this.clipWant(CLIPS.drink, 1 - this.drinkTimer / DRINK.time, { fadeIn: 0.15, fadeOut: 0.2 });
    if (this.pickupTimer > 0) return this.clipWant(CLIPS.pickup, 1 - this.pickupTimer / PICKUP_TIME, { mask: moving ? 'upper' : 'full', fadeIn: 0.1 });
    if (once) return once;
    // In de lucht na een sprong: knie omhoog zolang je stijgt
    if (!this.onGround && this.velocity.y > -3 && this.airJumps === 0) {
      return this.clipWant(CLIPS.air, (this.clock / CLIPS.air.time) % 1, { weight: 0.8, fadeIn: 0.12, fadeOut: 0.3 });
    }
    return null;
  }

  updateAnimation(dt) {
    if (this.pickupTimer > 0) {
      this.pickupTimer -= dt;
      if (this.onGrab && this.pickupTimer <= PICKUP_TIME / 2) {
        this.onGrab(); // hand is beneden: nu pakken we het echt
        this.onGrab = null;
      }
    }
    const pickup = this.pickupTimer > 0 ? 1 - this.pickupTimer / PICKUP_TIME : null;
    const drink = this.drinkTimer > 0 ? 1 - this.drinkTimer / DRINK.time : null;

    if (this.rig) {
      // Hoe snel draait de speler? (voor meeleunen in bochten)
      const yaw = this.mesh.rotation.y;
      const turn = this.prevYaw === undefined ? 0 : Math.atan2(Math.sin(yaw - this.prevYaw), Math.cos(yaw - this.prevYaw)) / Math.max(dt, 1e-3);
      this.prevYaw = yaw;
      this.animator.update(dt, {
        moving: this.moving && this.rollTimer <= 0,
        vy: this.velocity.y,
        turn: this.rollTimer > 0 || this.dashTimer > 0 ? 0 : turn,
        run: this.sprinting && this.sword.attackProgress === null,
        onGround: this.onGround || this.rollTimer > 0,
        attack: this.sword.attackProgress,
        pickup,
        drink,
        spin: this.spinTimer > 0,
        tuck: this.rollTimer > 0 || (this.dashTimer > 0 && !this.clips) || this.slamming || this.flipTimer > 0,
      });
      this.rig.apply?.(); // Mixamo-skelet bijwerken
      if (this.clips) this.clips.apply(dt, this.chooseClip(dt)); // en de echte animaties erover
      return;
    }
    if (!this.mixer) {
      this.walkPhase = (this.walkPhase ?? 0) + (this.moving ? dt * 11 : 0);
      this.model.position.y = this.modelBaseY + Math.abs(Math.sin(this.walkPhase)) * 0.08 * (this.moving && this.onGround ? 1 : 0);
      return;
    }
    let name = 'idle';
    if (!this.onGround && this.actions.jump) name = 'jump';
    else if (this.moving) name = 'walk';
    const next = this.actions[name] ?? null;
    if (next !== this.currentAction) {
      this.currentAction?.fadeOut(0.2);
      next?.reset().fadeIn(0.2).play();
      this.currentAction = next;
    }
    this.mixer.update(dt);
  }

  /** Bounding box van de speler op zijn huidige positie (in `target`, dan hoeft er niet steeds een nieuwe gemaakt te worden). */
  getBox(target = new THREE.Box3()) {
    const p = this.position;
    target.min.set(p.x - RADIUS, p.y, p.z - RADIUS);
    target.max.set(p.x + RADIUS, p.y + HEIGHT, p.z + RADIUS);
    return target;
  }

  resolveHorizontal(axis, colliders) {
    const STEP = 0.05; // kleine marge zodat je niet "blijft haken" als je op een blok staat
    for (const box of colliders) {
      const me = this.getBox((this.tmpBox ??= new THREE.Box3()));
      me.min.y += STEP;
      if (!overlaps(me, box)) continue;

      const center = (box.min[axis] + box.max[axis]) / 2;
      if (this.position[axis] < center) {
        this.position[axis] = box.min[axis] - RADIUS;
      } else {
        this.position[axis] = box.max[axis] + RADIUS;
      }
    }
  }

  resolveVertical(prevY, colliders) {
    const pos = this.position;
    const EPS = 0.001;

    // Blokken
    for (const box of colliders) {
      if (!overlaps(this.getBox((this.tmpBox ??= new THREE.Box3())), box)) continue;

      if (this.velocity.y <= 0 && prevY >= box.max.y - EPS) {
        // Landen bovenop een blok
        pos.y = box.max.y;
        this.velocity.y = 0;
        this.onGround = true;
      } else if (this.velocity.y > 0 && prevY + HEIGHT <= box.min.y + EPS) {
        // Hoofd stoten tegen de onderkant
        pos.y = box.min.y - HEIGHT;
        this.velocity.y = 0;
      }
    }

    // De grond (de wereld is overal begaanbaar)
    if (pos.y <= 0) {
      pos.y = 0;
      this.velocity.y = 0;
      this.onGround = true;
    }
  }
}

/** Overlappen twee boxen echt? (alleen aanraken telt niet) */
function overlaps(a, b) {
  return (
    a.min.x < b.max.x && a.max.x > b.min.x &&
    a.min.y < b.max.y && a.max.y > b.min.y &&
    a.min.z < b.max.z && a.max.z > b.min.z
  );
}
