import * as THREE from 'three';
import { play } from './audio.js';
import { ENEMY_TYPES } from './enemies.js';
import { COLOSSEUM } from './world.js';
import { PETS } from './pet.js';

// ======================================================================
// De Arena: een rond colosseum naast Muntdorp
// ======================================================================
// Druk bij de poort op E en kies wat je wilt doen:
//   ⚔ Golven      — jij tegen steeds meer monsters. Hoeveel golven overleef jij? (doodgaan kost hier niks)
//   🐾 Huisdier   — laat Knokkie of Pluis vechten tegen een monster. Winnen ze, dan worden ze sterker.
//   👾 Monsters   — twee monsters vechten tegen elkaar. Wed munten op wie er wint!
//   🌐 Online     — vecht tegen een vriend (zie multiplayer.js)
// Tijdens een huisdier- of monstergevecht kijk je vanaf de tribune (je kunt niet naar binnen).

export const ARENA = {
  waveReward: 40, // munten per overleefde golf (keer het golfnummer)
  bets: [50, 150, 400], // hoeveel munten je kunt inzetten
};

// Welke monsters er meedoen (geen schietende Mecha: die raakt alleen jou)
const FIGHTERS = ['slijmbal', 'boksdino', 'zombie', 'spook', 'zombiepop', 'golem', 'spierbonk', 'ninjapop', 'schaduw', 'bigfoot'];
// Tegenstander van je huisdier, per level (hoe hoger, hoe sterker)
const PET_FOES = ['slijmpje', 'slijmbal', 'zombie', 'boksdino', 'spook', 'zombiepop', 'golem', 'spierbonk', 'ninjapop', 'bigfoot'];
// Golven: welke monsters er in golf 1, 2, 3... komen (daarna de laatste rij, steeds meer)
const WAVES = [
  ['slijmpje', 'slijmbal'],
  ['slijmbal', 'zombie'],
  ['zombie', 'boksdino', 'spook'],
  ['zombiepop', 'boksdino', 'spook'],
  ['golem', 'zombiepop', 'schaduw'],
  ['ninjapop', 'spierbonk', 'schaduw'],
  ['ninjapop', 'golem', 'bigfoot', 'zombiepop'],
];
// Deze monsters doen zelf schade met een aanval; de rest door je aan te raken (dat doet de arena hieronder)
const OWN_ATTACK = ['zombie', 'spierbonk', 'ninja'];

const tmp = new THREE.Vector3();

export class Arena {
  /**
   * @param {object} game  { scene, stats, ui, effects, colliders, addEnemy, removeEnemy, player, pets, goals, giveRunes, giveStars }
   */
  constructor(game) {
    this.game = game;
    this.mode = null; // null | 'waves' | 'pet' | 'monsters' | 'duel'
    this.monsters = []; // monsters in de arena
    this.timer = 0;
    this.matchup = null; // voor het wedden: [typeA, typeB]
    if (!COLOSSEUM) return;
    this.center = COLOSSEUM.center.clone();
    this.radius = COLOSSEUM.radius;
    // De ingang wijst naar het pad (in Muntdorp: naar het westen)
    this.entranceDir = new THREE.Vector3(-1, 0, 0);
    this.gate = this.center.clone().addScaledVector(this.entranceDir, this.radius + 1.2);
    this.build(game.scene, game.colliders);
  }

  get exists() {
    return !!this.center;
  }

  /** Is er nu iets bezig in de arena? */
  get busy() {
    return !!this.mode;
  }

  // ======================================================================
  // Bouwen: zandvloer, lage muur, tribunes, pilaren met vlaggen, de poort
  // ======================================================================
  build(scene, colliders) {
    const c = this.center;
    const R = this.radius;
    const stone = new THREE.MeshStandardMaterial({ color: 0xc9b89a, roughness: 0.9 });
    const darkStone = new THREE.MeshStandardMaterial({ color: 0x8f7f68, roughness: 0.95 });
    const sand = new THREE.Mesh(new THREE.CircleGeometry(R + 0.2, 48), new THREE.MeshStandardMaterial({ color: 0xdcc58e, roughness: 1 }));
    sand.rotation.x = -Math.PI / 2;
    sand.position.set(c.x, 0.03, c.z);
    sand.receiveShadow = true;
    sand.userData.noAO = true;
    scene.add(sand);
    // Een cirkel in het zand
    const ring = new THREE.Mesh(new THREE.RingGeometry(3, 3.3, 48), new THREE.MeshStandardMaterial({ color: 0xa8864e, roughness: 1 }));
    ring.rotation.x = -Math.PI / 2;
    ring.position.set(c.x, 0.04, c.z);
    scene.add(ring);
    const gapAngle = Math.atan2(this.entranceDir.x, this.entranceDir.z);
    const inGap = (a) => Math.abs(Math.atan2(Math.sin(a - gapAngle), Math.cos(a - gapAngle))) < 0.32;
    const box = (w, h, d, mat, x, y, z, rotY, collide = true) => {
      const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
      m.position.set(x, y, z);
      m.rotation.y = rotY;
      m.castShadow = true;
      m.receiveShadow = true;
      scene.add(m);
      if (collide) colliders.push(new THREE.Box3().setFromObject(m));
      return m;
    };
    // Lage muur rondom (je kunt eroverheen kijken) en twee rijen tribune
    const N = 28;
    for (let i = 0; i < N; i++) {
      const a = (i / N) * Math.PI * 2;
      if (inGap(a)) continue;
      const seg = (2 * Math.PI * (R + 0.5)) / N + 0.1;
      box(seg, 1.1, 0.6, stone, c.x + Math.sin(a) * (R + 0.5), 0.55, c.z + Math.cos(a) * (R + 0.5), a);
      const seg2 = (2 * Math.PI * (R + 1.8)) / N + 0.1;
      box(seg2, 0.6, 1.4, darkStone, c.x + Math.sin(a) * (R + 1.8), 0.3, c.z + Math.cos(a) * (R + 1.8), a);
      const seg3 = (2 * Math.PI * (R + 3.1)) / N + 0.1;
      box(seg3, 1.2, 1.4, stone, c.x + Math.sin(a) * (R + 3.1), 0.6, c.z + Math.cos(a) * (R + 3.1), a);
    }
    // Hoge pilaren met vlaggen en fakkels
    const flagColors = [0xc0302a, 0xe0b030, 0x2a5ac0, 0x3a9a3a];
    const fire = new THREE.MeshBasicMaterial({ color: 0xffa040, toneMapped: false });
    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * Math.PI * 2 + Math.PI / 8;
      if (inGap(a)) continue;
      const x = c.x + Math.sin(a) * (R + 4.2);
      const z = c.z + Math.cos(a) * (R + 4.2);
      box(0.8, 6, 0.8, stone, x, 3, z, a);
      const flag = new THREE.Mesh(new THREE.PlaneGeometry(1, 2.2), new THREE.MeshStandardMaterial({ color: flagColors[i % 4], side: THREE.DoubleSide, roughness: 0.8 }));
      flag.position.set(x - Math.sin(a) * 0.45, 4.4, z - Math.cos(a) * 0.45);
      flag.rotation.y = a;
      scene.add(flag);
      const torch = new THREE.Mesh(new THREE.OctahedronGeometry(0.22, 0), fire);
      torch.position.set(x, 6.3, z);
      scene.add(torch);
    }
    // De poort: twee pilaren met een boog en een bord
    const side = new THREE.Vector3(-this.entranceDir.z, 0, this.entranceDir.x);
    const gx = c.x + this.entranceDir.x * (R + 1.5);
    const gz = c.z + this.entranceDir.z * (R + 1.5);
    for (const s of [-1, 1]) box(1, 4.6, 1, darkStone, gx + side.x * s * 2.6, 2.3, gz + side.z * s * 2.6, gapAngle);
    box(6.2, 0.8, 1.1, darkStone, gx, 4.9, gz, gapAngle + Math.PI / 2, false);
    const canvas = document.createElement('canvas');
    canvas.width = 512;
    canvas.height = 128;
    const ctx = canvas.getContext('2d');
    ctx.fillStyle = '#3a2416';
    ctx.fillRect(0, 0, 512, 128);
    ctx.strokeStyle = '#e0b030';
    ctx.lineWidth = 8;
    ctx.strokeRect(6, 6, 500, 116);
    ctx.fillStyle = '#ffd76a';
    ctx.font = 'bold 72px Georgia, serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('⚔ ARENA ⚔', 256, 68);
    const tex = new THREE.CanvasTexture(canvas);
    tex.colorSpace = THREE.SRGBColorSpace;
    const sign = new THREE.Mesh(new THREE.PlaneGeometry(4, 1), new THREE.MeshStandardMaterial({ map: tex, roughness: 0.8, emissive: 0x332211, side: THREE.DoubleSide }));
    sign.position.set(gx + this.entranceDir.x * 0.6, 4.9, gz + this.entranceDir.z * 0.6);
    sign.rotation.y = gapAngle;
    scene.add(sign);
    // Een gong naast de poort
    const gong = new THREE.Mesh(new THREE.CylinderGeometry(0.9, 0.9, 0.12, 24), new THREE.MeshStandardMaterial({ color: 0xd8a83a, metalness: 0.7, roughness: 0.3 }));
    gong.rotation.x = Math.PI / 2;
    gong.rotation.z = gapAngle;
    gong.position.set(gx + this.entranceDir.x * 2 + side.x * 4.4, 1.6, gz + this.entranceDir.z * 2 + side.z * 4.4);
    scene.add(gong);
    // Gouden muur van licht als er iets bezig is (zodat er niemand in of uit kan)
    this.wall = new THREE.Mesh(
      new THREE.CylinderGeometry(R + 0.1, R + 0.1, 5, 48, 1, true),
      new THREE.MeshBasicMaterial({ color: 0xffd76a, transparent: true, opacity: 0.18, side: THREE.DoubleSide, depthWrite: false, blending: THREE.AdditiveBlending, fog: false })
    );
    this.wall.position.set(c.x, 2.5, c.z);
    this.wall.visible = false;
    this.wall.userData.noAO = true;
    scene.add(this.wall);
  }

  /** Sta je bij de poort? (dan kun je met E het arena-menu openen) */
  nearGate(pos) {
    return this.exists && !this.busy && Math.hypot(pos.x - this.gate.x, pos.z - this.gate.z) < 3.2 && pos.y < 1.5;
  }

  /** Een plek in de arena: hoek (radialen) en afstand tot het midden. */
  spot(angle, dist) {
    return this.center.clone().add(tmp.set(Math.sin(angle) * dist, 0, Math.cos(angle) * dist));
  }

  // ======================================================================
  // Het menu (ui.openArena) en de spelstanden starten
  // ======================================================================
  /** Twee willekeurige monsters om op te wedden. */
  newMatchup() {
    const a = FIGHTERS[Math.floor(Math.random() * FIGHTERS.length)];
    let b = a;
    while (b === a) b = FIGHTERS[Math.floor(Math.random() * FIGHTERS.length)];
    this.matchup = [a, b];
    return this.matchup;
  }

  /** De tegenstander voor een huisdier (past bij zijn level). */
  petFoe(pet) {
    return PET_FOES[Math.min(PET_FOES.length - 1, pet.level - 1)];
  }

  /** Alles wat het menu moet weten. */
  menuInfo() {
    if (!this.matchup) this.newMatchup();
    const d = this.game.stats.data;
    const info = (k) => ({ key: k, name: ENEMY_TYPES[k].name, hp: ENEMY_TYPES[k].hp, damage: ENEMY_TYPES[k].damage });
    return {
      best: d.arenaBest ?? 0,
      runes: d.runes,
      pets: this.game.pets.filter((p) => p.owned).map((p) => ({ kind: p.kind, name: p.name, icon: PETS[p.kind].icon, level: p.level, hp: p.maxHp, damage: p.damage, foe: info(this.petFoe(p)) })),
      matchup: this.matchup.map(info),
      bets: ARENA.bets,
    };
  }

  /** Een monster in de arena zetten. */
  spawnMonster(type, at, foe = null) {
    const e = this.game.addEnemy(type, at.x, at.z);
    e.arena = true;
    e.arenaFoe = foe; // tegen wie vecht hij? (null = tegen jou)
    e.arenaLocked = !!foe; // jij kunt hem niet raken (huisdier- en monstergevechten)
    e.woken = true; // Zombiepoppen staan meteen op
    e.contactCd = 1;
    this.monsters.push(e);
    this.game.effects.burst(at.clone().setY(1), 0xffd76a, { count: 20, speed: 3, size: 0.12, life: 0.6, up: 2 });
    return e;
  }

  /** ⚔ Golven: jij tegen steeds meer monsters. */
  startWaves() {
    this.begin('waves');
    this.wave = 0;
    this.earned = 0;
    this.nextWave();
  }

  nextWave() {
    this.wavePause = false;
    this.wave++;
    const kinds = WAVES[Math.min(WAVES.length - 1, this.wave - 1)];
    const count = 2 + this.wave + Math.max(0, this.wave - WAVES.length); // steeds meer
    for (let i = 0; i < count; i++) {
      const a = (i / count) * Math.PI * 2 + Math.random();
      this.spawnMonster(kinds[i % kinds.length], this.spot(a, this.radius * 0.75));
    }
    play('gong');
    this.game.ui.banner(`GOLF ${this.wave}`, `${count} monsters! (je beste: golf ${this.game.stats.data.arenaBest ?? 0})`, 'gold', 2.5);
  }

  /** 🐾 Huisdiergevecht. */
  startPetFight(kind) {
    const pet = this.game.pets.find((p) => p.kind === kind && p.owned);
    if (!pet) return;
    this.begin('pet');
    this.pet = pet;
    const foe = this.spawnMonster(this.petFoe(pet), this.spot(0, 3), pet);
    pet.startFight(foe, this.spot(Math.PI, 3));
    this.game.ui.banner(`${pet.name.toUpperCase()} vs ${foe.type.name.toUpperCase()}`, 'Huisdiergevecht! Kijk vanaf de tribune.', 'gold', 3);
    play('gong');
  }

  /** 👾 Monstergevecht: wed op een van de twee. */
  startMonsterFight(betOn, amount) {
    const [a, b] = this.matchup ?? this.newMatchup();
    const stats = this.game.stats;
    if (stats.data.runes < amount) return false;
    stats.data.runes -= amount;
    this.begin('monsters');
    this.bet = { on: betOn, amount };
    const ma = this.spawnMonster(a, this.spot(0, 3), null);
    const mb = this.spawnMonster(b, this.spot(Math.PI, 3), ma);
    ma.arenaFoe = mb;
    ma.arenaLocked = true;
    this.fighters = [ma, mb];
    this.game.ui.banner(`${ma.type.name.toUpperCase()} vs ${mb.type.name.toUpperCase()}`, `Jij wedt ● ${amount} op ${ENEMY_TYPES[betOn].name}!`, 'gold', 3);
    play('gong');
    return true;
  }

  begin(mode) {
    this.mode = mode;
    this.timer = 0;
    this.ended = false;
    this.wall.visible = true;
  }

  /** Klaar: alles opruimen. */
  finish() {
    for (const e of this.monsters) this.game.removeEnemy(e);
    this.monsters = [];
    this.fighters = null;
    if (this.pet) {
      this.pet.startFight(null);
      this.pet.position.copy(this.pet.home);
      this.pet = null;
    }
    this.mode = null;
    this.wall.visible = false;
    this.newMatchup();
  }

  /** Over een paar seconden opruimen (eerst even juichen of treuren). */
  endIn(seconds) {
    this.ended = true;
    this.timer = seconds;
  }

  // ======================================================================
  // Elke frame (vóórdat de vijanden bewegen)
  // ======================================================================
  /**
   * @param {object} enemyCtx  dezelfde ctx als voor de gewone vijanden (main.js)
   * @param {object} player
   */
  update(dt, enemyCtx, player) {
    if (!this.exists) return;
    if (this.mode) this.wall.material.opacity = 0.14 + Math.sin(performance.now() / 300) * 0.05;
    if (!this.mode || dt <= 0) return;
    // Monsters die tegen elkaar (of tegen je huisdier) vechten krijgen hun eigen "speler": hun tegenstander
    for (const e of this.monsters) {
      if (!e.arenaFoe) {
        e.arenaCtx = null;
        continue;
      }
      const foe = e.arenaFoe;
      e.arenaCtx = {
        ...enemyCtx,
        player: foe,
        hurtPlayer: (from, damage) => this.hurtFoe(foe, from, damage),
        onSlam: (m, radius, damage) => {
          this.game.effects.shockwave(m.position, 0xd8c9a8, radius);
          if (Math.hypot(foe.position.x - m.position.x, foe.position.z - m.position.z) < radius) this.hurtFoe(foe, m.position, damage);
        },
        projectiles: { spawn() {} },
      };
      // Monsters zonder eigen aanval doen schade door tegen hun tegenstander aan te botsen
      e.contactCd -= dt;
      const own = OWN_ATTACK.includes(e.type.ai ?? e.typeKey) || e.typeKey === 'golem';
      if (!own && e.alive && foe.alive && e.contactCd <= 0) {
        const reach = e.type.radius + (foe.type?.radius ?? foe.cfg?.radius ?? 0.4) + 0.3;
        if (Math.hypot(foe.position.x - e.position.x, foe.position.z - e.position.z) < reach) {
          e.contactCd = 1;
          this.hurtFoe(foe, e.position, e.type.contactDamage ?? e.type.damage);
        }
      }
    }
    // Iedereen binnen de arena houden
    for (const e of this.monsters) this.keepInside(e.position, e.type.radius);
    if (this.pet) this.keepInside(this.pet.position, 0.5);
    this.keepPlayer(player);

    if (this.ended) {
      this.timer -= dt;
      if (this.timer <= 0) this.finish();
      return;
    }
    if (this.mode === 'waves') this.updateWaves(dt);
    else if (this.mode === 'pet') this.updatePetFight();
    else if (this.mode === 'monsters') this.updateMonsterFight();
  }

  /** Schade aan een monster of huisdier in de arena. */
  hurtFoe(foe, from, damage) {
    if (!foe.alive) return false;
    if (foe.cfg) {
      foe.hurt(from, damage); // een huisdier
      this.game.effects.floatText(foe.center.setY(foe.size + 0.6), `-${damage}`, '#ff6b6b', 0.45);
      return true;
    }
    const r = foe.hit(from, `arena-${Math.random()}`, damage);
    if (r && !r.blocked) {
      this.game.effects.burst(foe.center, foe.type.color, { count: 6, speed: 4, size: 0.1, life: 0.4 });
      this.game.effects.floatText(foe.center.setY(foe.position.y + foe.type.height + 0.3), `${r.damage}`, '#ffffff', 0.45);
    } else if (r?.blocked) this.game.effects.floatText(foe.center.setY(foe.position.y + foe.type.height + 0.3), 'GEBLOKT!', '#9be7ff', 0.4);
    return !!r;
  }

  /** Een stoot van een huisdier (main.js geeft hem door). */
  petHit(pet, hit) {
    if (!this.mode || hit.target !== this.monsters[0]) return;
    const r = hit.target.hit(pet.position, hit.id, hit.damage);
    if (!r) return;
    play('hit');
    this.game.effects.sparks(hit.target.center, 0x7dffe0);
    this.game.effects.floatText(hit.target.center.setY(hit.target.type.height + 0.4), r.blocked ? 'GEBLOKT!' : `${r.damage}`, r.blocked ? '#9be7ff' : '#7dffe0', 0.45);
  }

  keepInside(pos, r) {
    const max = this.radius - r - 0.2;
    const dx = pos.x - this.center.x;
    const dz = pos.z - this.center.z;
    const d = Math.hypot(dx, dz);
    if (d > max) {
      pos.x = this.center.x + (dx / d) * max;
      pos.z = this.center.z + (dz / d) * max;
    }
  }

  /** Golven: jij blijft binnen. Huisdier- en monstergevechten: jij blijft buiten (op de tribune). */
  keepPlayer(player) {
    const pos = player.position;
    const dx = pos.x - this.center.x;
    const dz = pos.z - this.center.z;
    const d = Math.hypot(dx, dz) || 0.001;
    if (this.mode === 'waves' || this.mode === 'duel' || this.mode === 'maatje') {
      const max = this.radius - 0.6;
      if (d > max) {
        pos.x = this.center.x + (dx / d) * max;
        pos.z = this.center.z + (dz / d) * max;
      }
    } else if (d < this.radius + 0.4 && pos.y < 3) {
      pos.x = this.center.x + (dx / d) * (this.radius + 0.4);
      pos.z = this.center.z + (dz / d) * (this.radius + 0.4);
    }
  }

  updateWaves() {
    if (this.wavePause || this.monsters.some((e) => e.alive)) return;
    // Golf overleefd!
    const runes = ARENA.waveReward * this.wave;
    this.game.giveRunes(runes);
    this.earned += runes;
    const d = this.game.stats.data;
    if (this.wave > (d.arenaBest ?? 0)) d.arenaBest = this.wave;
    if (this.wave === 5) this.game.goals.onArena('arena');
    if (this.wave % 5 === 0) this.game.giveStars(1);
    this.game.stats.save();
    play('win');
    this.game.ui.toast(`⚔ <b>Golf ${this.wave} overleefd!</b> +${runes} munten${this.wave % 5 === 0 ? ' en +1 ⭐' : ''}`, 2.5);
    for (const e of this.monsters) this.game.removeEnemy(e);
    this.monsters = [];
    setTimeout(() => {
      if (this.mode === 'waves' && !this.ended) this.nextWave();
    }, 3000);
    this.wavePause = true;
  }

  updatePetFight() {
    const foe = this.monsters[0];
    const pet = this.pet;
    if (!foe || !pet) return this.finish();
    if (!foe.alive) {
      // Gewonnen!
      const runes = 40 + pet.level * 15;
      this.game.giveRunes(runes);
      const up = pet.addKill();
      this.game.goals.onPetWin();
      this.game.stats.save();
      play('win');
      this.game.ui.banner(`${pet.name.toUpperCase()} WINT!`, `+${runes} munten${up ? ` · ${pet.name} is nu level ${pet.level}!` : ''}`, 'gold', 4);
      this.endIn(3.5);
    } else if (!pet.alive) {
      play('lose');
      this.game.ui.banner(`${pet.name.toUpperCase()} IS FLAUWGEVALLEN`, `${foe.type.name} was te sterk. Train je huisdier met snoepjes, of probeer het nog eens!`, 'death', 4);
      this.endIn(3.5);
    }
  }

  updateMonsterFight() {
    const [a, b] = this.fighters ?? [];
    if (!a || !b) return this.finish();
    if (a.alive && b.alive) return;
    const winner = a.alive ? a : b;
    const won = winner.typeKey === this.bet.on;
    if (won) {
      this.game.giveRunes(this.bet.amount * 2);
      play('win');
      this.game.ui.banner(`${winner.type.name.toUpperCase()} WINT!`, `Je had goed gewed: +${this.bet.amount * 2} munten!`, 'gold', 4);
    } else {
      play('lose');
      this.game.ui.banner(`${winner.type.name.toUpperCase()} WINT!`, `Helaas, je inzet (● ${this.bet.amount}) ben je kwijt.`, 'death', 4);
    }
    this.game.stats.save();
    this.endIn(3.5);
  }

  /** Doodgaan in de arena kost niks: je komt terug bij de poort. Geeft true als de arena het afhandelt. */
  onPlayerDeath() {
    if (this.mode !== 'waves') return false;
    play('lose');
    this.game.ui.banner('VERSLAGEN IN DE ARENA', `Je haalde golf ${this.wave} en verdiende ● ${this.earned}. (Je beste: golf ${this.game.stats.data.arenaBest ?? 0})`, 'death', 4);
    this.finish();
    return true;
  }

  /** Uit de arena gaan tijdens de golven (bijv. snelreizen): stoppen. */
  quit() {
    if (this.mode) this.finish();
  }

  /** De gezondheidsbalk bovenin (net als bij een boss): de tegenstander. */
  get hud() {
    if (this.mode === 'pet' && this.pet && this.monsters[0]) {
      const f = this.monsters[0];
      return { name: `${f.type.name} (${this.pet.name}: ${Math.ceil(this.pet.hp)} / ${this.pet.maxHp})`, hp: f.hp, maxHp: f.maxHp };
    }
    if (this.mode === 'monsters' && this.fighters) {
      const [a, b] = this.fighters;
      return { name: `${a.type.name} ${Math.ceil(a.hp)} — ${Math.ceil(b.hp)} ${b.type.name}`, hp: a.hp, maxHp: a.hp + b.hp };
    }
    return null;
  }

  /** Voor de minimap. */
  mapMarkers() {
    return this.exists ? [{ x: this.center.x, z: this.center.z, icon: '⚔', color: '#ffd76a' }] : [];
  }
}
