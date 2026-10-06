// Alles wat je verdient en bewaart: level, munten, uitrusting, krachten.
// Wordt opgeslagen in de browser (localStorage), zodat je later verder kunt spelen.
//
// Levelen gaat vanzelf: hoe meer vijanden je verslaat, hoe hoger je level.
// Elk level maakt je sterker (meer leven, stamina en schade) en sommige levels spelen iets nieuws vrij.

import { SAVE_KEY, LEVELS } from './levels.js';
import { WEAPONS } from './weapons.js';

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

// De winkel van Koopman Kobus (bij het begin van elk level). price = wat het kost; elke volgende keer wordt het duurder.
// Een item met repeat koop je zo vaak als je wilt (altijd dezelfde prijs).
export const SHOP_ITEMS = {
  soep: { name: 'Herstel-soep', icon: '🍲', price: [40], repeat: true, info: 'Meteen al je leven en flesjes terug.' },
  zaadje: { name: 'Gouden Zaadje', icon: '🧪', price: [200, 450, 800], info: 'Je kunt één flesje meer meenemen.' },
  hart: { name: 'Hartversterker', icon: '❤', price: [150, 300, 500, 800, 1200], info: '+20 levenspunten.' },
  slijpen: { name: 'Wapen slijpen', icon: '⚔', price: [150, 300, 500, 800, 1200], info: '+10% schade met al je wapens.' },
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
    checkpoint: null, // hier kom je terug als je doodgaat (null = begin van het level)
    bosses: [], // verslagen bosses
    chests: [], // geopende kisten
    diamonds: [], // gevonden diamanten
    shop: {}, // hoe vaak je iets in de winkel kocht: { zaadje: 1, hart: 2, ... }
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
  get maxHealth() { return 150 + (this.data.level - 1) * PER_LEVEL.health + this.bought('hart') * 20; }
  get maxStamina() { return 100 + (this.data.level - 1) * PER_LEVEL.stamina; }
  get damageMultiplier() { return 1 + (this.data.level - 1) * PER_LEVEL.damage + this.bought('slijpen') * 0.1; }
  get flasksMax() { return this.data.flasksMax + this.perkBonus('flasks') + this.bought('zaadje'); }
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

  /** Hoe vaak heb je dit in de winkel gekocht? */
  bought(key) {
    return this.data.shop?.[key] ?? 0;
  }

  /** Wat kost dit nu? null = uitverkocht. */
  shopPrice(key) {
    const item = SHOP_ITEMS[key];
    if (item.repeat) return item.price[0];
    return item.price[this.bought(key)] ?? null;
  }

  /** Iets kopen (als je genoeg munten hebt). Geeft true terug als het lukte. */
  buy(key) {
    const price = this.shopPrice(key);
    if (price === null || this.data.runes < price) return false;
    this.data.runes -= price;
    this.data.shop = { ...this.data.shop, [key]: this.bought(key) + 1 };
    this.save();
    return true;
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
      // Oude save met munten die nog ergens op de grond lagen? Die krijg je gewoon terug.
      if (this.data.lostRunes) {
        this.data.runes += this.data.lostRunes.amount ?? 0;
        delete this.data.lostRunes;
      }
      this.removeOldWeapons();
    } catch {
      // geen of kapotte save: nieuw spel
    }
  }

  /**
   * Schietwapens bestaan niet meer. Uit je inventaris halen, en wat je uit een kist of van de robot kreeg,
   * wordt het nieuwe slagwapen dat daar nu ligt.
   */
  removeOldWeapons() {
    const d = this.data;
    d.inventory = d.inventory.filter((i) => i.kind !== 'weapon' || WEAPONS[i.key]);
    if (!WEAPONS[d.weapon]) d.weapon = 'shortsword';
    for (const level of LEVELS) {
      for (const [id, , , , item] of level.chests) if (item.kind === 'weapon' && d.chests.includes(id)) this.addItem(item);
    }
    if (d.quests['robot-batterijen']?.state === 'beloond') this.addItem({ kind: 'weapon', key: 'hamer' });
    delete d.discovered;
    delete d.lastGrace;
  }

  /** Helemaal opnieuw beginnen. */
  wipe() {
    this.data = freshSave();
    this.save();
  }
}
