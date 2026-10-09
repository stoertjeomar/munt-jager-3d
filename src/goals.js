import { LEVELS, REGIONS, WORLD, ISLANDS } from './levels.js';
import { ENEMY_TYPES } from './enemies.js';
import { BOSS_INFO } from './bosses.js';

// ======================================================================
// Doelen om naartoe te werken (ook als alle bosses al verslagen zijn!)
// ======================================================================
//  - TROFEEËN: prestaties die je één keer haalt. Elke trofee geeft ⭐ sterren.
//    Haal ze allemaal en je wordt een LEGENDE (met een gouden standbeeld in Muntdorp).
//  - PREMIES: drie opdrachten tegelijk op het Premiebord (in Muntdorp, en elke koopman heeft een kopie).
//    Klaar? Haal je beloning op (munten en sterren) en er komt meteen een nieuwe premie.
//  - STERRENWINKEL: met sterren koop je de allerbeste spullen (zie STAR_ITEMS in stats.js).

/** Alle zij-quests die er zijn (uit de mensen in LEVELS). */
const ALL_QUESTS = LEVELS.flatMap((l) => l.npcs.map((n) => n[3]).filter(Boolean));
// (WORLD = alle gebieden samen, plus de Hemeleilanden)
const ALL_DIAMONDS = WORLD.diamonds.length;
const ALL_CHESTS = WORLD.chests.length;
const ALL_FLAGS = WORLD.checkpoints.length;
const ISLAND_CHESTS = ISLANDS ? ISLANDS.chests.map((c) => c[0]) : [];
const MAIN_BOSSES = REGIONS.filter((r) => !r.level.locked).map((r) => r.boss);
const ALL_BOSSES = REGIONS.map((r) => r.boss);

const count = (d, key) => d.counts?.[key] ?? 0;
const flagsFound = (d) => WORLD.checkpoints.filter((c) => d.flags.includes(c[0])).length;

// Trofeeën: [id, plaatje, naam, uitleg, sterren, test(save), voortgang(save) = [zoveel, van]]
export const TROPHIES = [
  ['eerste-boss', '🏆', 'Eerste boss', 'Versla je eerste boss', 1, (d) => d.bosses.length >= 1],
  ['bossjager', '👑', 'Bossjager', 'Versla de vier bosses van de wereld', 2, (d) => MAIN_BOSSES.every((b) => d.bosses.includes(b)), (d) => [MAIN_BOSSES.filter((b) => d.bosses.includes(b)).length, MAIN_BOSSES.length]],
  ['drakendoder', '🐉', 'Drakendoder', 'Versla de Schaduwdraak in het Schaduwrijk', 3, (d) => d.bosses.includes('schaduwdraak')],
  ['omar', '♛', 'Sterker dan Omar', 'Versla Omar in zijn Gekke Kasteel', 3, (d) => (d.omar?.wins ?? 0) >= 1],
  ['level-10', '⬆', 'Level 10', 'Haal level 10', 1, (d) => d.level >= 10, (d) => [d.level, 10]],
  ['level-20', '⬆', 'Level 20', 'Haal level 20', 2, (d) => d.level >= 20, (d) => [d.level, 20]],
  ['level-30', '⬆', 'Level 30', 'Haal level 30', 3, (d) => d.level >= 30, (d) => [d.level, 30]],
  ['kills-100', '⚔', 'Vechter', 'Versla 100 vijanden', 1, (d) => d.kills >= 100, (d) => [d.kills, 100]],
  ['kills-500', '⚔', 'Krijger', 'Versla 500 vijanden', 2, (d) => d.kills >= 500, (d) => [d.kills, 500]],
  ['kills-1000', '⚔', 'Held van de wereld', 'Versla 1000 vijanden', 3, (d) => d.kills >= 1000, (d) => [d.kills, 1000]],
  ['ninjas', '🥷', 'Ninjaslachter', 'Versla 25 Ninjapoppen', 1, (d) => count(d, 'ninjapop') >= 25, (d) => [count(d, 'ninjapop'), 25]],
  ['diamanten', '💎', 'Diamantzoeker', 'Vind alle diamanten', 2, (d) => d.diamonds.length >= ALL_DIAMONDS, (d) => [d.diamonds.length, ALL_DIAMONDS]],
  ['kisten', '📦', 'Schatzoeker', 'Open alle kisten', 2, (d) => d.chests.length >= ALL_CHESTS, (d) => [d.chests.length, ALL_CHESTS]],
  ['vlaggen', '⚑', 'Ontdekkingsreiziger', 'Raak alle vlaggen aan', 1, (d) => flagsFound(d) >= ALL_FLAGS, (d) => [flagsFound(d), ALL_FLAGS]],
  ['quests', '✔', 'Helper van iedereen', 'Maak alle zij-quests af', 2, (d) => ALL_QUESTS.every((q) => d.quests[q]?.state === 'beloond'), (d) => [ALL_QUESTS.filter((q) => d.quests[q]?.state === 'beloond').length, ALL_QUESTS.length]],
  ['invasie-1', '👻', 'Dorpsheld', 'Sla een Omar-invasie af', 1, (d) => (d.invasions ?? 0) >= 1],
  ['invasie-5', '👻', 'Beschermer', 'Sla 5 Omar-invasies af', 2, (d) => (d.invasions ?? 0) >= 5, (d) => [d.invasions ?? 0, 5]],
  ['kampioen-1', '🥇', 'Kampioenendoder', 'Versla een Kampioen (een gouden vijand met een kroon)', 1, (d) => count(d, 'champions') >= 1],
  ['kampioen-10', '🥇', 'Kampioen der kampioenen', 'Versla 10 Kampioenen', 2, (d) => count(d, 'champions') >= 10, (d) => [count(d, 'champions'), 10]],
  ['woedend', '😡', 'Niet bang', 'Versla een woedende boss (een boss die terugkomt)', 1, (d) => (d.rage ?? []).length >= 1],
  ['woedend-alle', '😡', 'Onverslaanbaar', 'Versla alle vijf de bosses woedend', 3, (d) => ALL_BOSSES.every((b) => (d.rage ?? []).includes(b)), (d) => [(d.rage ?? []).length, ALL_BOSSES.length]],
  ['premies-5', '📜', 'Premiejager', 'Haal 5 premies op', 1, (d) => count(d, 'bounties') >= 5, (d) => [count(d, 'bounties'), 5]],
  ['premies-20', '📜', 'Meester-premiejager', 'Haal 20 premies op', 2, (d) => count(d, 'bounties') >= 20, (d) => [count(d, 'bounties'), 20]],
  ['drakenrijder', '🐉', 'Drakenrijder', 'Vlieg op Vuurtand de draak', 1, (d) => !!d.dragonTips],
  ['hemeleilanden', '☁', 'Hemelbestormer', 'Vlieg met Vuurtand naar de Hemeleilanden, hoog boven de Ruïnevallei', 1, (d) => d.flags.includes('eiland-start')],
  ['hemelschat', '⚡', 'Hemelse schatten', 'Open alle kisten op de Hemeleilanden', 2, (d) => ISLAND_CHESTS.every((id) => d.chests.includes(id)), (d) => [ISLAND_CHESTS.filter((id) => d.chests.includes(id)).length, ISLAND_CHESTS.length]],
  ['knokkie', '🦖', 'Beste maatjes', 'Train Knokkie tot level 10', 2, (d) => (d.pets?.knokkie?.level ?? 0) >= 10, (d) => [d.pets?.knokkie?.level ?? 0, 10]],
  ['pluis', '🐱', 'Kattenvriend', 'Adopteer Pluis de kat (sterrenwinkel)', 1, (d) => !!d.pets?.pluis],
  ['rijk', '💰', 'Rijkaard', 'Heb 5000 munten tegelijk', 1, (d) => d.runes >= 5000, (d) => [Math.min(d.runes, 5000), 5000]],
].map(([id, icon, name, info, stars, test, progress]) => ({ id, icon, name, info, stars, test, progress }));

// De allerlaatste trofee: alle andere halen
TROPHIES.push({ id: 'legende', icon: '🌟', name: 'LEGENDE', info: 'Haal alle andere trofeeën. Dan krijg je een gouden standbeeld in Muntdorp!', stars: 5,
  test: (d) => TROPHIES.every((t) => t.id === 'legende' || d.trophies.includes(t.id)),
  progress: (d) => [TROPHIES.filter((t) => t.id !== 'legende' && d.trophies.includes(t.id)).length, TROPHIES.length - 1] });

/** Hoeveel sterren er in totaal te verdienen zijn met trofeeën. */
export const TROPHY_STARS = TROPHIES.reduce((n, t) => n + t.stars, 0);

/** Je rang (hangt af van hoeveel sterren je ooit verdiende). */
export function rankOf(d) {
  const s = d.starsEarned ?? 0;
  if ((d.trophies ?? []).includes('legende')) return '🌟 Legende';
  if (s >= 35) return '💜 Grootmeester';
  if (s >= 18) return '🥇 Kampioen';
  if (s >= 6) return '🛡 Held';
  return '🗡 Avonturier';
}

// ======================================================================
// Premies
// ======================================================================
/** Wat er per soort premie verdiend wordt (beloning: munten, sterren). */
const BOUNTY_KINDS = {
  kill: { stars: 1 },
  champion: { stars: 2 },
  invasion: { stars: 2 },
  boss: { stars: 2 },
  coins: { stars: 1 },
  dragon: { stars: 1 },
  pet: { stars: 1 },
  arena: { stars: 2 },
};

export class Goals {
  /**
   * @param {import('./stats.js').Stats} stats
   * @param {object} hooks  { onTrophies(list), onBounty(bounty) } (main.js laat dan een melding zien)
   */
  constructor(stats, hooks) {
    this.stats = stats;
    this.hooks = hooks;
    this.timer = 1.5;
    const d = stats.data;
    d.trophies ??= [];
    d.stars ??= 0;
    d.starsEarned ??= 0;
    d.counts ??= {};
    d.rage ??= [];
    d.bounties ??= [];
    this.fillBounties();
  }

  get d() {
    return this.stats.data;
  }

  // ---------- Trofeeën ----------

  /** Af en toe kijken of je een nieuwe trofee hebt gehaald. */
  update(dt) {
    this.timer -= dt;
    if (this.timer > 0) return;
    this.timer = 1;
    const fresh = [];
    for (let round = 0; round < 2; round++) {
      // (twee rondes: de LEGENDE-trofee kan in dezelfde keer bij komen)
      for (const t of TROPHIES) {
        if (this.d.trophies.includes(t.id) || !t.test(this.d)) continue;
        this.d.trophies.push(t.id);
        this.d.stars += t.stars;
        this.d.starsEarned += t.stars;
        fresh.push(t);
      }
    }
    if (fresh.length) {
      this.stats.save();
      this.hooks.onTrophies?.(fresh);
    }
  }

  // ---------- Gebeurtenissen (main.js meldt ze) ----------

  /** Een vijand verslagen. info = { typeKey, champion, byDragon, byPet } */
  onKill({ typeKey, champion, byDragon, byPet }) {
    const c = this.d.counts;
    c[typeKey] = (c[typeKey] ?? 0) + 1;
    if (champion) c.champions = (c.champions ?? 0) + 1;
    this.progress((b) => (b.kind === 'kill' && b.target === typeKey) || (b.kind === 'champion' && champion) || (b.kind === 'dragon' && byDragon) || (b.kind === 'pet' && byPet));
  }

  onInvasion() {
    this.progress((b) => b.kind === 'invasion');
  }

  /** Je huisdier won een gevecht in de arena. */
  onPetWin() {
    this.progress((b) => b.kind === 'pet');
  }

  /** Je won in de arena (golven overleefd of een duel). */
  onArena(kind) {
    this.d.counts.arena = (this.d.counts.arena ?? 0) + 1;
    this.progress((b) => b.kind === 'arena' || (b.kind === kind));
  }

  onBoss(id, rage) {
    if (rage && !this.d.rage.includes(id)) this.d.rage.push(id);
    this.progress((b) => b.kind === 'boss' && b.target === id);
  }

  onCoins(amount) {
    this.progress((b) => b.kind === 'coins', amount);
  }

  /** Premies die hierbij passen een stapje verder zetten. */
  progress(match, amount = 1) {
    for (const b of this.d.bounties) {
      if (b.count >= b.n || !match(b)) continue;
      b.count = Math.min(b.n, b.count + amount);
      if (b.count >= b.n) this.hooks.onBounty?.(b);
    }
  }

  // ---------- Premies ----------

  /** Altijd drie premies klaarzetten. */
  fillBounties() {
    while (this.d.bounties.length < 3) this.d.bounties.push(this.makeBounty());
  }

  /** Een nieuwe premie bedenken die past bij hoe ver je bent. */
  makeBounty() {
    const d = this.d;
    const have = (kind) => d.bounties.some((b) => b.kind === kind);
    const open = REGIONS.filter((r) => d.flags.includes(r.start));
    const options = [];
    // Vijanden verslaan uit een gebied waar je al bent geweest
    const types = [...new Set(open.flatMap((r) => r.level.spawns.map(([k]) => k)))].filter((k) => !ENEMY_TYPES[k].dummy);
    for (let i = 0; i < 3; i++) options.push('kill');
    if (d.bosses.length && !have('boss')) options.push('boss');
    if (!have('champion')) options.push('champion');
    if (!have('invasion')) options.push('invasion');
    if (!have('coins')) options.push('coins');
    if (d.bosses.includes('mario') && !have('dragon')) options.push('dragon');
    if (d.pets && Object.keys(d.pets).length && !have('pet')) options.push('pet');
    if (!have('arena')) options.push('arena');
    const kind = options[Math.floor(Math.random() * options.length)];
    const level = Math.max(1, open.length);
    const bounty = { id: `premie-${Date.now()}-${Math.floor(Math.random() * 1000)}`, kind, count: 0, n: 1, target: null };
    if (kind === 'kill') {
      const pool = types.length ? types : ['slijmpje'];
      bounty.target = pool[Math.floor(Math.random() * pool.length)];
      bounty.n = 4 + Math.floor(Math.random() * 6);
    } else if (kind === 'boss') {
      const beaten = REGIONS.map((r) => r.boss).filter((b) => d.bosses.includes(b));
      bounty.target = beaten[Math.floor(Math.random() * beaten.length)];
    } else if (kind === 'coins') {
      bounty.n = 300 + Math.floor(Math.random() * 6) * 100;
    } else if (kind === 'dragon') {
      bounty.n = 6 + Math.floor(Math.random() * 5);
    } else if (kind === 'pet') {
      bounty.n = 1 + Math.floor(Math.random() * 3);
    }
    bounty.runes = Math.round((80 + level * 60 + (kind === 'kill' ? bounty.n * 10 : 120)) / 10) * 10;
    bounty.stars = BOUNTY_KINDS[kind].stars;
    return bounty;
  }

  /** Wat er op het premiebord staat. */
  bountyText(b) {
    switch (b.kind) {
      case 'kill': return `Versla ${b.n} × ${ENEMY_TYPES[b.target]?.name ?? b.target}`;
      case 'champion': return 'Versla een Kampioen 👑 (een gouden vijand met een kroon)';
      case 'invasion': return 'Sla een Omar-invasie af';
      case 'boss': return `Versla ${BOSS_INFO[b.target]?.name ?? b.target} (nog een keer: hij is nu woedend!)`;
      case 'coins': return `Verdien ${b.n} munten`;
      case 'dragon': return `Verbrand ${b.n} vijanden met Vuurtand de draak`;
      case 'pet': return `Laat je huisdier ${b.n} ${b.n === 1 ? 'gevecht' : 'gevechten'} winnen in de Arena`;
      case 'arena': return 'Overleef 5 golven in de Arena';
      default: return b.kind;
    }
  }

  /** Beloning van een klare premie ophalen. Geeft de beloning terug (of null). */
  claim(id) {
    const d = this.d;
    const i = d.bounties.findIndex((b) => b.id === id && b.count >= b.n);
    if (i < 0) return null;
    const [b] = d.bounties.splice(i, 1);
    d.stars += b.stars;
    d.starsEarned += b.stars;
    d.counts.bounties = (d.counts.bounties ?? 0) + 1;
    this.fillBounties();
    this.stats.save();
    return b;
  }
}
