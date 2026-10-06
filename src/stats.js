// Alles wat je verdient en bewaart: level, munten, uitrusting, krachten.
// Wordt opgeslagen in de browser (localStorage), zodat je later verder kunt spelen.
//
// Levelen gaat vanzelf: hoe meer vijanden je verslaat, hoe hoger je level.
// Elk level maakt je sterker (meer leven, stamina en schade) en sommige levels spelen iets nieuws vrij.

import { SAVE_KEY } from './levels.js';

// Zoveel sterker word je per level
const PER_LEVEL = { health: 12, stamina: 6, damage: 0.08 };

// Hoeveel vijanden een boss waard is (de eerste keer, en daarna)
export const BOSS_KILLS = { first: 10, again: 3 };

// Krachten die je vrijspeelt door te levelen of bosses te verslaan
export const POWERS = {
  dash: {
    name: 'Dash', key: 'C', unlock: { level: 3 }, stamina: 15, cooldown: 0.9,
    info: 'Flits vooruit, ook in de lucht. Tijdens de dash ben je onkwetsbaar.',
  },
  doubleJump: {
    name: 'Dubbele sprong', key: 'Spatie in de lucht', unlock: { boss: 'koning' }, stamina: 8,
    info: 'Spring nog een keer terwijl je in de lucht bent.',
  },
  spin: {
    name: 'Wervelslag', key: 'V', unlock: { level: 6 }, stamina: 30, cooldown: 2.5,
    info: 'Draai rond met je wapen en raak alles om je heen.',
  },
  slam: {
    name: 'Grondslag', key: 'F in de lucht', unlock: { boss: 'ridder' }, stamina: 25,
    info: 'Beuk vanuit de lucht op de grond: een schokgolf raakt alle vijanden om je heen.',
  },
  fire: {
    name: 'Vuurzwaard', key: 'X', unlock: { level: 9 }, stamina: 20, cooldown: 18, duration: 10,
    info: 'Je wapen vat vlam: 50% meer schade, 10 seconden lang.',
  },
};

// Bonussen die je vrijspeelt door te levelen (naast de krachten hierboven)
//   flasks = extra flesjes · speed = sneller lopen · defense = minder schade · heal = flesjes helen meer
export const PERKS = {
  flask1: { name: 'Extra flesje', level: 2, flasks: 1, info: 'Je kunt één flesje meer meenemen.' },
  speed: { name: 'Snelle benen', level: 4, speed: 0.1, info: 'Je loopt 10% sneller.' },
  flask2: { name: 'Extra flesje', level: 5, flasks: 1, info: 'Je kunt nog een flesje meer meenemen.' },
  skin: { name: 'Taaie huid', level: 7, defense: 0.1, info: 'Je krijgt 10% minder schade.' },
  heal: { name: 'Sterke flesjes', level: 8, heal: 0.15, info: 'Een flesje geeft 60% leven terug in plaats van 45%.' },
  flask3: { name: 'Extra flesje', level: 10, flasks: 1, info: 'Je kunt nog een flesje meer meenemen.' },
  master: { name: 'Meester-jager', level: 12, speed: 0.1, defense: 0.1, info: 'Nog 10% sneller en 10% minder schade.' },
};

/** Hoeveel vijanden je moet verslaan om van `level` naar `level + 1` te gaan. */
export function killsNeeded(level) {
  return 3 + level * 2;
}

function freshSave() {
  return {
    level: 1,
    xp: 0, // verslagen vijanden sinds je laatste level
    kills: 0, // alle verslagen vijanden ooit
    runes: 0, // munten
    character: 'eve', // alleen Eve en Soldaat zijn speelbaar
    currentLevel: 0, // welk level speel je nu (0 = level 1)
    unlockedLevel: 0, // tot en met dit level mag je kiezen
    quests: {}, // zij-quests: { id: { state: 'actief' | 'klaar' | 'beloond', count } }
    questItems: [], // opgepakte quest-voorwerpen (sterren, batterijen)
    weapon: 'shortsword',
    helmet: 'geen',
    inventory: [{ kind: 'weapon', key: 'shortsword' }, { kind: 'helmet', key: 'geen' }],
    flasksMax: 3,
    discovered: [], // ontdekte Plekken van Genade
    lastGrace: null, // hier kom je terug als je doodgaat (null = begin van het level)
    bosses: [], // verslagen bosses
    chests: [], // geopende kisten
    diamonds: [], // gevonden diamanten
    lostRunes: null, // { level, x, y, z, amount } munten die je liet vallen toen je doodging
    victory: false,
  };
}

export class Stats {
  constructor() {
    this.data = freshSave();
    this.load();
  }

  get level() { return this.data.level; }
  get runes() { return this.data.runes; }
  get xp() { return this.data.xp; }
  get xpNeeded() { return killsNeeded(this.data.level); }
  get maxHealth() { return 150 + (this.data.level - 1) * PER_LEVEL.health; }
  get maxStamina() { return 100 + (this.data.level - 1) * PER_LEVEL.stamina; }
  get damageMultiplier() { return 1 + (this.data.level - 1) * PER_LEVEL.damage; }
  get flasksMax() { return this.data.flasksMax + this.perkBonus('flasks'); }
  get speedMultiplier() { return 1 + this.perkBonus('speed'); }
  get defenseBonus() { return this.perkBonus('defense'); }
  get healBonus() { return this.perkBonus('heal'); }

  addRunes(amount) {
    this.data.runes += amount;
  }

  /** Vijanden verslagen: telt op naar je volgende level. Geeft het aantal nieuwe levels terug. */
  addKills(amount) {
    this.data.kills += amount;
    this.data.xp += amount;
    let gained = 0;
    while (this.data.xp >= this.xpNeeded) {
      this.data.xp -= this.xpNeeded;
      this.data.level++;
      gained++;
    }
    this.save();
    return gained;
  }

  hasPerk(key) {
    return this.data.level >= PERKS[key].level;
  }

  unlockedPerks() {
    return Object.keys(PERKS).filter((key) => this.hasPerk(key));
  }

  /** Alle vrijgespeelde bonussen van één soort bij elkaar opgeteld (bijv. 'flasks'). */
  perkBonus(prop) {
    return this.unlockedPerks().reduce((sum, key) => sum + (PERKS[key][prop] ?? 0), 0);
  }

  hasPower(key) {
    const unlock = POWERS[key].unlock;
    if (unlock.level) return this.data.level >= unlock.level;
    return this.data.bosses.includes(unlock.boss);
  }

  unlockedPowers() {
    return Object.keys(POWERS).filter((key) => this.hasPower(key));
  }

  hasItem(item) {
    return this.data.inventory.some((i) => i.kind === item.kind && i.key === item.key);
  }

  addItem(item) {
    if (item.kind === 'flask') {
      this.data.flasksMax++;
      return;
    }
    if (!this.hasItem(item)) this.data.inventory.push({ kind: item.kind, key: item.key });
  }

  save() {
    try {
      localStorage.setItem(SAVE_KEY, JSON.stringify(this.data));
    } catch {
      // opslaan lukt niet (bijv. privé-venster): dan spelen we gewoon zonder
    }
  }

  load() {
    try {
      const saved = JSON.parse(localStorage.getItem(SAVE_KEY));
      if (saved) this.data = { ...freshSave(), ...saved };
    } catch {
      // geen of kapotte save: nieuw spel
    }
  }

  /** Helemaal opnieuw beginnen. */
  wipe() {
    this.data = freshSave();
    this.save();
  }
}
