import * as THREE from 'three';
import { BOSS_CLASSES } from './bosses.js';
import { OmarFighter, OmarStats, OMAR, pick, LEAP_END } from './omarFighter.js';
import { makeBolt, makeBoltBetween } from './lightning.js';
import { buildWolf, animateWolf } from './wolf.js';
import { applyStormSkin } from './skyLook.js';
import { play } from './audio.js';

// Sky: de Heer van de Storm, en de nieuwe baas van het spel. Hij woont in het Wolkenrijk (skyworld.js)
// op een troon van wolken. Hij vecht net als Omar (hij IS een Omar-vechter, zie omarFighter.js),
// maar met zijn eigen krachten:
//
//  - Wolkenteleport: hij wordt een wolk, zweeft weg... en verschijnt VÓÓR of ACHTER je. Je weet nooit welke!
//  - Gele bliksem: hij steekt NightWalker omhoog en de bliksem slaat in rond jou.
//  - Bliksemwolven: wolven van wolk en onweer verschijnen met een blikseminslag en stormen op je af.
//  - Hij is sneller dan Omar, heeft rode ogen, een wolken-aura met bliksem erin, en zijn zwaard zapt bij elke klap.
//
// Het filmpje en het gevecht eromheen (aankomen, praten, winnen, verliezen) regelt sky.js.

// ---------- Instellingen: alles wat anders is dan bij Omar ----------
export const SKY = {
  ...OMAR,
  level: 40,
  size: 1.1,
  hp: { hits: 40, perLevel: 0.3, minHits: 30, min: 650 },
  speed: [1.75, 1.95], // nog sneller dan Omar!
  damagePct: { ...OMAR.damagePct, wolf: 0.12 },
  cooldown: { ...OMAR.cooldown, teleport: [2.8, 1.9] }, // hij teleporteert vaker
  teleportDist: 2.2, // zo ver vóór of achter je verschijnt hij
  teleportGone: 0.38, // zo lang is hij een wolk (seconden): kijk waar de wolk heen gaat!
  teleportDodge: [0.45, 0.6],
  bliksem: { ...OMAR.bliksem, strikes: [4, 6], cooldown: [7, 5] },
  // Bliksemwolven: zoveel wolven [fase 1, fase 2], hoe snel ze rennen en hoe lang
  wolven: { count: [2, 3], appear: 0.85, speed: 15, dashTime: 0.75, cooldown: [13, 9], chance: [0.3, 0.6] },
  moves: { bliksem: true, schaduwen: false, vuur: false },
  colors: {
    main: 0xffd23a, // geel als de bliksem
    light: 0xfff3b0,
    glow: 0xffe066,
    spark: 0xfff0a0,
    dark: 0x3a4458, // donkergrijs als een onweerswolk
    text: '#ffe680',
    fog: 'vec3(0.75, 0.85, 1.0)', // een wolkenmuur (blauwwit)
    phase2: 0xffffff, // boos: zijn aders worden wit-heet
    bolt: 'geel',
  },
  // Wolken-aura: grote zachte wolkjes (donker en dreigend als hij boos is)
  // (puff = zachte wolkjes in plaats van blokjes, zie effects.js)
  aura: { colors: [0xe8eef8, 0xb8c4d8, 0x8a96aa], boos: [0x5a6478, 0x3a4458, 0xd8e0f0], size: [0.75, 0.9], every: [0.05, 0.035], life: 1.1, puff: true },
  swingSound: 'zap', // zijn zwaard knettert bij elke klap
};

const TAUNTS = {
  uitdagen: ['Kom maar, ik wacht wel.', 'Is dit alles? Ik ben nog niet eens warm!', 'Durf je niet? De storm wacht op niemand.'],
  raak: ['Zap!', 'Geraakt!', 'Te traag!', 'Boem!', 'Kzzzt!'],
  mis: ['Mis! Ik ben een wolk!', 'Hier ben ik niet meer!', 'Te langzaam!', 'Wolkje weg!'],
  au: ['Au! Niet slecht...', 'Hé! Dat prikte!', 'Oké, dat voelde ik.'],
  praten: [
    'Hoor je dat gerommel? Dat ben ik.', 'Ik ben de storm!', 'Vóór je of achter je? Raad maar!',
    'NightWalker heeft honger...', 'Kom op, laat eens zien wat je kan!', 'Ik ben de nieuwe baas van deze game!',
    'Ik schrijf de code. Ik ben de code!', 'Ken je mijn wolven al?', 'Elke wolk hier luistert naar mij.',
    'Omar was nog maar het begin...',
  ],
  boos: [
    'NU WORDT HET ONWEER!', 'Voel de storm!', 'Mijn wolven ruiken je!', 'De hemel scheurt open!',
    'Jij bent dapper... maar de storm is sterker!',
  ],
  start: ['Laat de storm beginnen!'],
  drankjeWeg: ['Hé! Mijn drankje!'],
  verslagen: ['Oef... sterretjes... en wolkjes...'],
  loslaten: ['Ruimte! Ik heb ruimte nodig!'],
  nietDrinken: ['Geen tijd om te drinken!'],
  slokje: ['Even opladen...', 'Een slokje regenwater!', 'Momentje!'],
  bijnaDood: ['Wacht... wie heeft deze speler gemaakt?!'],
  genade: ['Bijna! Drink maar gauw iets, ik wacht wel.'],
  nogEens: ['Nog een keer!'],
  vuur: [],
  bliksem: ['BLIKSEM!', 'Kijk omhoog!', 'De hemel is van mij!'],
  schaduwen: [],
  wolven: ['Wolven! PAK HEM!', 'Kom, mijn bliksemwolven!', 'Auwoeoeoe!'],
  teleportVoor: ['Vóór je!', 'Hier!', 'Boe!'],
  teleportAchter: ['Achter je!', 'Kijk achter je!', 'Psst... hier!'],
  teleport: ['Poef!'],
  winnen: ['De storm wint altijd!'],
  fase2: ['NU WORDT HET ECHT ONWEER!'],
  geheeld: ['Opgeladen! Zzzzt!'],
};

const tmp = new THREE.Vector3();
const UP = new THREE.Vector3(0, 1, 0);
const flatDist = (a, b) => Math.hypot(a.x - b.x, a.z - b.z);
// Wolkenkleuren: wit, lichtgrijs en blauwgrijs
const CLOUD = [0xf4f7fc, 0xd8e0ec, 0xb4c0d4];

export class SkyFighter extends OmarFighter {
  constructor(scene, arena) {
    super(scene, arena, 'sky');
    this.wolves = []; // bliksemwolven: { wolf, t, dir, hit }
    this.sparkle = 0; // af en toe een vonk of bliksempje in zijn aura
  }

  get cfg() { return SKY; }
  get taunts() { return TAUNTS; }
  get tagStyle() { return { text: 'Sky', stroke: '#1a2a4a', fill: '#ffe066' }; }

  /** Sky is altijd de Soldaat, met NightWalker en zonder helm. */
  makeStats() { return new OmarStats('soldaat', SKY, 'nightwalker', 'geen'); }
  costumeFor() { return 'soldaat'; }

  /** Donkere stormhuid met gele bliksemaders (skyLook.js). Zijn zwaard NightWalker houdt zijn eigen kleuren. */
  styleMaterials(mats, model) {
    applyStormSkin(model, this.puppet.sword.grip);
  }

  resetFight() {
    super.resetFight();
    if (!this.puppet) return;
    this.cd.wolven = 5;
    this.teleportSide = 'achter';
  }

  // ---------- Het filmpje: van de wolkentroon als bliksem de arena in ----------

  /** In plaats van een salto: hij wordt een wolk, vliegt naar de arena en slaat in als bliksem. */
  animateMode(dt) {
    if (this.mode !== 'sprong') {
      super.animateMode(dt);
      return;
    }
    this.introT += dt;
    if (this.introT >= LEAP_END) {
      this.finishIntro();
      this.introStrike();
      return;
    }
    // Een wolk die in een boog van de troon naar de landingsplek zweeft
    this.mesh.visible = false;
    const u = (this.introT - 0.45) / (LEAP_END - 0.45);
    const at = this.standPosition.lerp(this.landing, u);
    at.y = 1.5 * (1 - u) + 6 * 4 * u * (1 - u) + 1;
    if (this.effects && Math.random() < 0.9) {
      this.effects.puff(at, pick(CLOUD), { count: 2, speed: 0.5, size: 1.1, life: 0.8, up: 0.2 });
      if (Math.random() < 0.3) this.effects.burst(at, 0xffe066, { count: 2, speed: 2, size: 0.08, life: 0.3, up: 0, gravity: 0 });
    }
  }

  /** BOEM: de bliksem slaat in op de landingsplek, en daar staat hij. */
  introStrike() {
    const at = this.landing.clone().setY(0);
    this.bolts.add(makeBolt(at, { color: 'geel', width: 2.2, branches: 4, height: 24 }), 0.35);
    play('donder');
    play('zap');
    if (!this.effects) return;
    this.effects.shockwave(at, 0xffe066, 6);
    this.effects.burst(at.clone().setY(0.5), 0xfff3b0, { count: 40, speed: 9, size: 0.15, life: 0.7, up: 3 });
    this.effects.puff(at.clone().setY(1), pick(CLOUD), { count: 18, speed: 4, size: 1.4, life: 1.1, up: 0.6 });
    this.effects.shake(0.7);
  }

  /** Overslaan: meteen in de arena staan (zichtbaar). */
  finishIntro() {
    super.finishIntro();
    this.mesh.visible = true;
  }

  cutsceneTick(dt) {
    super.cutsceneTick(dt);
    this.bolts.update(dt); // (de bliksempjes van zijn aura en de inslag verdwijnen ook in het filmpje)
  }

  // ---------- Wolkenteleport: vóór of achter je ----------

  /** Poef: hij wordt een wolk. Hij roept waar hij heen gaat... maar dat is soms gelogen! */
  vanish(ctx) {
    this.teleportSide = Math.random() < 0.5 ? 'voor' : 'achter';
    this.cloudFrom = this.position.clone();
    super.vanish(ctx);
    // Eerlijk is eerlijk: 3 van de 4 keer zegt hij de waarheid
    const honest = Math.random() < 0.75;
    const side = honest ? this.teleportSide : this.teleportSide === 'voor' ? 'achter' : 'voor';
    this.say(pick(side === 'voor' ? this.taunts.teleportVoor : this.taunts.teleportAchter), 1.4, true);
  }

  /** Waar hij straks verschijnt: vóór of achter de speler (maar wel in de arena). */
  spotFor(player) {
    const side = this.teleportSide === 'voor' ? player.facing : player.facing.negate();
    const turn = Math.random() < 0.5 ? 1 : -1;
    const spot = new THREE.Vector3();
    for (const a of [0, 0.4, 0.9, 1.4, 2]) {
      spot.copy(player.position).addScaledVector(side.clone().applyAxisAngle(UP, a * turn), this.cfg.teleportDist);
      if (flatDist(spot, this.arena.center) < this.arena.radius - 1.2) return spot.setY(this.position.y);
    }
    return spot.copy(player.position).addScaledVector(tmp.copy(this.arena.center).sub(player.position).setY(0).normalize(), this.cfg.teleportDist).setY(this.position.y);
  }

  /** En daar is hij weer, uit een wolk (de naam blijft appearBehind, ook als hij vóór je staat). */
  appearBehind(ctx, ph) {
    const player = ctx.player;
    const spot = this.spotFor(player);
    this.position.copy(spot);
    this.puppet.velocity.set(0, 0, 0);
    this.puppet.knockback?.set(0, 0, 0);
    tmp.copy(player.position).sub(spot);
    this.mesh.rotation.y = Math.atan2(tmp.x, tmp.z);
    this.mesh.visible = true;
    this.poof(ctx.effects, spot);
    this.telegraph('glint');
    this.setState('achter', this.cfg.windup.teleport[ph]);
  }

  /** Een wolk met gele vonken en een knetterend bliksempje (verdwijnen en verschijnen). */
  poof(effects, at) {
    const c = at.clone().setY(at.y + 1);
    effects.puff(c, CLOUD[0], { count: 14, speed: 2.5, size: 1.2, life: 0.9, up: 0.5 });
    effects.puff(c, CLOUD[2], { count: 8, speed: 1.5, size: 1.4, life: 1, up: 0.3 });
    effects.burst(c, 0xffe066, { count: 16, speed: 6, size: 0.08, life: 0.35, up: 1, gravity: 0 });
    effects.shockwave(at, 0xe8eef8, 1.8);
    const a = c.clone().add(new THREE.Vector3((Math.random() - 0.5) * 1.6, 0.8, (Math.random() - 0.5) * 1.6));
    this.bolts.add(makeBoltBetween(a, c.clone().setY(at.y), { color: 'geel', width: 0.6, wiggle: 0.35, segments: 5 }), 0.12);
    play('poef');
    play('zap');
  }

  // ---------- Het brein: wolkreis, en de wolven ----------

  brain(dt, ctx, c, dist, dir, ph, threat) {
    if (this.state === 'weg' && this.cloudFrom) {
      // Een wolkje zweeft naar waar hij straks verschijnt: als je goed kijkt, zie je waar hij heen gaat!
      const k = Math.min(1, this.stateT / this.cfg.teleportGone);
      const side = this.teleportSide === 'voor' ? ctx.player.facing : ctx.player.facing.negate();
      const to = ctx.player.position.clone().addScaledVector(side, this.cfg.teleportDist);
      const at = this.cloudFrom.clone().lerp(to, k).setY(this.position.y + 1.2 + Math.sin(k * Math.PI));
      ctx.effects.puff(at, pick(CLOUD), { count: 1, speed: 0.4, size: 1.1, life: 0.6, up: 0 });
    }
    if (this.state === 'wolvenWindup') {
      // Armen wijd, NightWalker knettert: de wolven komen eraan
      this.patch = 'wenken';
      this.bladeSparks(dt, 0xffe066, 0.04);
      if (this.timer <= 0) {
        this.summonWolves(ctx, ph);
        this.setState('neutraal');
        this.cd.gap = this.cfg.gap[ph];
      }
      return;
    }
    super.brain(dt, ctx, c, dist, dir, ph, threat);
  }

  extraMoves(add, dist, ph) {
    if (this.cd.wolven <= 0 && this.puppet.onGround) add('wolven', this.cfg.wolven.chance[ph]);
  }

  startExtra(move, ph) {
    if (move !== 'wolven') return;
    this.cd.wolven = this.cfg.wolven.cooldown[ph];
    this.setState('wolvenWindup', 0.75);
    this.say(pick(this.taunts.wolven), 1.8, true);
    play('charge');
    this.log('wolven');
  }

  /** Fase 2: boos! De aders worden wit-heet en de bliksem slaat om hem heen in. */
  onPhase2(ctx) {
    super.onPhase2(ctx);
    for (let i = 0; i < 4; i++) {
      const a = (i / 4) * Math.PI * 2;
      const at = this.position.clone().add(new THREE.Vector3(Math.sin(a) * 2.5, 0, Math.cos(a) * 2.5)).setY(0);
      this.bolts.add(makeBolt(at, { color: 'geel', width: 1.3, branches: 2 }), 0.3);
    }
    play('donder');
  }

  // ---------- Bliksemwolven (wolf.js) ----------

  /** De wolven verschijnen in een kring om de speler, elk met een blikseminslag. */
  summonWolves(ctx, ph) {
    const player = ctx.player;
    const n = this.cfg.wolven.count[ph];
    const start = Math.random() * Math.PI * 2;
    for (let i = 0; i < n; i++) {
      const a = start + (i / n) * Math.PI * 2;
      const pos = player.position.clone().setY(this.position.y).add(new THREE.Vector3(Math.sin(a) * 6.5, 0, Math.cos(a) * 6.5));
      const off = pos.clone().sub(this.arena.center).setY(0);
      if (off.length() > this.arena.radius - 1) pos.sub(off.setLength(off.length() - (this.arena.radius - 1)));
      const wolf = buildWolf(1.05);
      wolf.mesh.position.copy(pos);
      for (const m of wolf.mats) m.opacity = 0;
      this.scene.add(wolf.mesh);
      this.bolts.add(makeBolt(pos, { color: 'geel', width: 1.2, branches: 1 }), 0.22);
      ctx.effects.shockwave(pos, 0xffe066, 1.6);
      ctx.effects.puff(pos.clone().setY(pos.y + 0.8), pick(CLOUD), { count: 10, speed: 2.5, size: 1.2, life: 0.9, up: 0.6 });
      this.wolves.push({ wolf, t: 0, dir: null, hit: false });
    }
    play('donder');
    play('zap');
  }

  updateMagic(dt, ctx) {
    super.updateMagic(dt, ctx);
    const W = this.cfg.wolven;
    const player = ctx.player;
    for (let i = this.wolves.length - 1; i >= 0; i--) {
      const w = this.wolves[i];
      const mesh = w.wolf.mesh;
      w.t += dt;
      if (w.t < W.appear) {
        // Verschijnen en grommen: ze kijken naar jou
        for (const m of w.wolf.mats) m.opacity = Math.min(m === w.wolf.mats[0] ? 0.92 : 1, w.t / 0.4);
        tmp.copy(player.position).sub(mesh.position).setY(0);
        mesh.rotation.y = Math.atan2(tmp.x, tmp.z);
        animateWolf(w.wolf, w.t, 0.15);
        continue;
      }
      if (!w.dir) {
        w.dir = player.position.clone().sub(mesh.position).setY(0).normalize();
        mesh.rotation.y = Math.atan2(w.dir.x, w.dir.z);
        play('dash');
      }
      mesh.position.addScaledVector(w.dir, W.speed * dt);
      animateWolf(w.wolf, w.t, 1);
      if (Math.random() < 0.5) ctx.effects.puff(mesh.position.clone().setY(mesh.position.y + 0.8), CLOUD[1], { size: 0.7, life: 0.5, up: 0.3, opacity: 0.6 });
      if (Math.random() < 0.2) ctx.effects.burst(mesh.position.clone().setY(mesh.position.y + 0.8), 0xffe066, { count: 1, speed: 1, size: 0.06, life: 0.3, up: 0.3, gravity: 0 });
      if (!w.hit && flatDist(mesh.position, player.position) < 1.1 && Math.abs(player.position.y - mesh.position.y) < 1.6) {
        w.hit = true;
        if (this.hurt(ctx, 'wolf')) play('zap');
      }
      if (w.t > W.appear + W.dashTime) {
        // Weg in een wolkje
        ctx.effects.puff(mesh.position.clone().setY(mesh.position.y + 0.8), CLOUD[0], { count: 8, speed: 2.5, size: 1, life: 0.7, up: 0.5 });
        this.scene.remove(mesh);
        this.wolves.splice(i, 1);
      }
    }
  }

  clearMagic() {
    super.clearMagic();
    for (const w of this.wolves ?? []) this.scene.remove(w.wolf.mesh);
    if (this.wolves) this.wolves.length = 0;
  }

  // ---------- Hoe hij eruitziet: wolken-aura met bliksem, en een knetterend zwaard ----------

  updateLook(dt, effects) {
    super.updateLook(dt, effects);
    if (!effects || this.mode === 'troon' || !this.mesh.visible || this.mode === 'verslagen') return;
    this.sparkle -= dt;
    if (this.sparkle > 0) return;
    this.sparkle = (this.phase2 ? 0.25 : 0.45) * (0.6 + Math.random() * 0.8);
    // Een klein bliksempje dat door zijn wolken-aura springt
    const a = Math.random() * Math.PI * 2;
    const from = this.position.clone().add(new THREE.Vector3(Math.sin(a) * 0.55, 0.4 + Math.random() * 1.4, Math.cos(a) * 0.55));
    const to = from.clone().add(new THREE.Vector3((Math.random() - 0.5) * 0.8, -0.3 - Math.random() * 0.6, (Math.random() - 0.5) * 0.8));
    this.bolts.add(makeBoltBetween(from, to, { color: 'geel', width: 0.3, wiggle: 0.22, segments: 4 }), 0.08);
    effects.burst(to, 0xffe066, { count: 3, speed: 2, size: 0.06, life: 0.25, up: 0.5, gravity: 0 });
  }

  /** Zwaard-windje, en gele vonken langs NightWalker. */
  updateTrail() {
    super.updateTrail();
    const p = this.puppet;
    if (!this.effects || Math.random() > (this.phase2 ? 0.5 : 0.25)) return;
    this.mesh.updateMatrixWorld(true);
    const base = new THREE.Vector3();
    const tip = new THREE.Vector3();
    p.sword.getBladeWorld(base, tip);
    this.effects.burst(base.lerp(tip, Math.random()), 0xffe066, { count: 1, speed: 1.2, size: 0.06, life: 0.25, up: 0.5, gravity: 0 });
  }
}

// Sky meldt zich aan bij de bosses: de arena met id 'sky' (in het Wolkenrijk) krijgt hem
BOSS_CLASSES.sky = SkyFighter;
