import * as THREE from 'three';
import { play } from './audio.js';
import { LEVELS, REGIONS, WORLD } from './levels.js';

// ======================================================================
// Omar-invasies: Omars schaduwleger valt een dorp of kamp aan!
// ======================================================================
// Af en toe (een paar minuten na elkaar) stuurt Omar zijn schaduwkrijgers naar het kamp dat het dichtst
// bij je is. Er komen drie golven; versla ze allemaal en je krijgt een flinke beloning.
// Ben je te laat (of ga je dood), dan gaan de schaduwen er lachend vandoor.
// Een paarse lichtstraal laat zien waar het is (ook op de minimap: ⚔).

export const INVASION = {
  firstAfter: 150, // zoveel seconden spelen voor de eerste invasie
  every: [240, 360], // daarna steeds tussen deze aantallen seconden
  waves: [3, 4, 5], // schaduwkrijgers per golf (in latere gebieden een paar meer)
  timeLimit: 240, // zo lang heb je (seconden)
  reward: 120, // munten (plus 80 per gebied verder)
};

const OMAR_LINES = [
  'Hahaha! Mijn schaduwen nemen {kamp} over! Kom ze maar tegenhouden... als je durft!',
  'Schaduwen, val aan! {kamp} is nu van MIJ!',
  'Ik verveelde me een beetje... dus ik stuur wat schaduwen naar {kamp}. Hihihi!',
];

/** Alle kampen die kunnen worden aangevallen: Muntdorp en het begin van elk gebied (bij de koopman). */
function camps() {
  return REGIONS.map((r) => {
    const [id, name, x, z] = LEVELS[r.index].checkpoints[0];
    if (r.index === 0 && WORLD.village) return { name: 'Muntdorp', flag: id, region: 0, x: WORLD.village.center[0], z: WORLD.village.center[1] };
    const [wx, wz] = r.t(x, z - 8); // een stukje voorbij de vlag, op het pad
    return { name, flag: id, region: r.index, x: wx, z: wz };
  });
}

export class Invasions {
  /**
   * @param {object} game  { scene, ui, stats, effects, addEnemy(type, x, z), removeEnemy(enemy), giveRunes(n) }
   */
  constructor(game) {
    this.game = game;
    this.camps = camps();
    this.timer = INVASION.firstAfter;
    this.active = null; // { camp, wave, waves, left, time, enemies }
    // De paarse lichtstraal boven het kamp
    this.beacon = new THREE.Mesh(
      new THREE.CylinderGeometry(1.4, 2.2, 70, 16, 1, true),
      new THREE.MeshBasicMaterial({ color: 0xa03aff, transparent: true, opacity: 0.35, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide, fog: false, toneMapped: false })
    );
    this.beacon.visible = false;
    this.beacon.userData.noAO = true;
    game.scene.add(this.beacon);
  }

  /**
   * Elke frame. ok = mag er nu een invasie beginnen? (niet in een menu, boss-gevecht, Omars kasteel...)
   */
  update(dt, playerPos, ok) {
    const a = this.active;
    if (!a) {
      if (!ok) return;
      this.timer -= dt;
      if (this.timer <= 0) this.start(playerPos);
      return;
    }
    a.time += dt;
    this.beacon.material.opacity = 0.25 + Math.sin(a.time * 4) * 0.1;
    this.beacon.rotation.y += dt;
    // Schaduwen die nog moeten verschijnen (één voor één, met paarse rook)
    for (const s of a.queue) s.t -= dt;
    while (a.queue.length && a.queue[0].t <= 0) this.spawn(a.queue.shift());
    // Golf verslagen? Dan de volgende, of gewonnen!
    if (!a.queue.length && a.enemies.every((e) => !e.alive)) {
      if (a.wave < a.waves.length - 1) this.nextWave();
      else this.finish(true);
      return;
    }
    if (a.time > INVASION.timeLimit) this.finish(false, 'te laat');
  }

  /** Een invasie beginnen bij het kamp dat het dichtst bij je is (in een gebied waar je al bent geweest). */
  start(playerPos, camp = null) {
    if (this.active) return false;
    const open = this.camps.filter((c) => this.game.stats.data.flags.includes(c.flag));
    const list = open.length ? open : this.camps.slice(0, 1);
    camp ??= list.reduce((best, c) => (Math.hypot(c.x - playerPos.x, c.z - playerPos.z) < Math.hypot(best.x - playerPos.x, best.z - playerPos.z) ? c : best));
    const extra = camp.region;
    this.active = { camp, wave: -1, waves: INVASION.waves.map((n) => n + extra), time: 0, enemies: [], queue: [] };
    this.beacon.position.set(camp.x, 35, camp.z);
    this.beacon.visible = true;
    const { ui } = this.game;
    play('laugh');
    play('gong');
    ui.banner('OMAR-INVASIE!', `Omars schaduwleger valt ${camp.name} aan! Volg de paarse lichtstraal.`, 'death', 5);
    const line = OMAR_LINES[Math.floor(Math.random() * OMAR_LINES.length)].replace('{kamp}', camp.name);
    ui.toast(`<b style="color:#c77dff">Omar:</b> "${line}"`, 6);
    this.nextWave();
    return true;
  }

  nextWave() {
    const a = this.active;
    a.wave++;
    const n = a.waves[a.wave];
    for (let i = 0; i < n; i++) {
      const angle = (i / n) * Math.PI * 2 + Math.random() * 0.6;
      const r = 5 + Math.random() * 6;
      a.queue.push({ t: (a.wave === 0 ? 1.5 : 0.8) + i * 0.45, x: a.camp.x + Math.sin(angle) * r, z: a.camp.z + Math.cos(angle) * r });
    }
    if (a.wave > 0) {
      play('laugh');
      this.game.ui.toast(`⚔ <b>Golf ${a.wave + 1} van ${a.waves.length}!</b> Nog meer schaduwen...`, 3);
    }
  }

  spawn({ x, z }) {
    const a = this.active;
    const e = this.game.addEnemy('schaduw', x, z);
    e.invader = true;
    e.summoned = false; // (ze tellen gewoon mee voor je level en geven munten)
    a.enemies.push(e);
    this.game.effects.burst(new THREE.Vector3(x, 1, z), 0x2a0a3a, { count: 24, speed: 3, size: 0.3, life: 0.7, up: 1.5, gravity: 0 });
    this.game.effects.burst(new THREE.Vector3(x, 1, z), 0xa03aff, { count: 10, speed: 4, size: 0.12, life: 0.5, up: 2 });
    play('poef');
  }

  /** Klaar: gewonnen (alle golven verslagen) of verloren (te laat, of je ging dood). */
  finish(won, why = '') {
    const a = this.active;
    if (!a) return;
    const { ui, stats, effects } = this.game;
    for (const e of a.enemies) {
      if (e.alive) effects.burst(e.center, 0x2a0a3a, { count: 16, speed: 3, size: 0.25, life: 0.6, up: 1.5, gravity: 0 });
      this.game.removeEnemy(e);
    }
    this.active = null;
    this.beacon.visible = false;
    this.timer = INVASION.every[0] + Math.random() * (INVASION.every[1] - INVASION.every[0]);
    if (won) {
      const runes = INVASION.reward + a.camp.region * 80;
      this.game.giveRunes(runes);
      stats.data.invasions = (stats.data.invasions ?? 0) + 1;
      stats.save();
      this.game.onWin?.();
      play('win');
      ui.banner('INVASIE VERSLAGEN!', `${a.camp.name} is gered! +${runes} munten`, 'gold', 5);
      ui.toast('<b style="color:#c77dff">Omar:</b> "Grrr... Dat was nog maar een klein stukje van mijn leger! Volgende keer win ík!"', 5);
    } else {
      play('laugh');
      ui.toast(`<b style="color:#c77dff">Omar:</b> "Hahaha! ${why === 'dood' ? 'Je bent omgevallen!' : 'Te langzaam!'} Mijn schaduwen gaan er lekker vandoor!"<br><small>De invasie is voorbij. Volgende keer beter!</small>`, 5);
    }
  }

  /** Voor de minimap: het kamp (⚔) en de schaduwen (paarse bolletjes). */
  mapMarkers() {
    const a = this.active;
    if (!a) return [];
    return [
      { x: a.camp.x, z: a.camp.z, icon: '⚔', color: '#c77dff' },
      ...a.enemies.filter((e) => e.alive).map((e) => ({ x: e.position.x, z: e.position.z, icon: '•', color: '#b04dff' })),
    ];
  }

  /** Voor het lijstje met quests (rechtsboven). */
  tracker() {
    const a = this.active;
    if (!a) return [];
    const left = a.enemies.filter((e) => e.alive).length + a.queue.length;
    const time = Math.max(0, Math.ceil(INVASION.timeLimit - a.time));
    return [{
      title: `Omar-invasie: ${a.camp.name}`,
      text: `Golf ${a.wave + 1} / ${a.waves.length} · nog ${left} schaduwen · ${Math.floor(time / 60)}:${String(time % 60).padStart(2, '0')}`,
      done: false,
    }];
  }
}
