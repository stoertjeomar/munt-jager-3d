// Alles wat je verdient en bewaart: level, munten, uitrusting, krachten.
// Wordt opgeslagen in de browser (localStorage), zodat je later verder kunt spelen.
//
// Levelen gaat vanzelf: hoe meer vijanden je verslaat, hoe hoger je level.
// Elk level maakt je sterker (meer leven, stamina en schade) en sommige levels spelen iets nieuws vrij.

import { SAVE_KEY, LEVELS } from './levels.js';
import { WEAPONS } from './weapons.js';

// Zoveel sterker word je per level
const PER_LEVEL = { health: 6, stamina: 6, damage: 0.08 };

// Meer flesjes dan dit heb je nooit, in het hele spel (Omar heeft er ook 3)
export const MAX_FLASKS = 3;
// Een Gouden Appel (uit een kist, van een boss of een quest) geeft je voor altijd zoveel extra leven
export const APPLE_HEALTH = 8;

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
//   health = meer leven · speed = sneller lopen · defense = minder schade · heal = flesjes helen meer
// (Extra flesjes bestaan niet: je hebt er altijd maximaal MAX_FLASKS.)
export const PERKS = {
  hart1: { name: 'Sterk hart', level: 2, health: 10, info: '+10 levenspunten.' },
  speed: { name: 'Snelle benen', level: 4, speed: 0.1, info: 'Je loopt 10% sneller.' },
  hart2: { name: 'Groot hart', level: 5, health: 12, info: '+12 levenspunten.' },
  skin: { name: 'Taaie huid', level: 7, defense: 0.1, info: 'Je krijgt 10% minder schade.' },
  heal: { name: 'Sterke flesjes', level: 8, heal: 0.15, info: 'Een flesje geeft 15% meer leven terug.' },
  hart3: { name: 'Leeuwenhart', level: 10, health: 15, info: '+15 levenspunten.' },
  master: { name: 'Meester-jager', level: 12, speed: 0.1, defense: 0.1, info: 'Nog 10% sneller en 10% minder schade.' },
};

// De winkel van Koopman Kobus (bij het begin van elk gebied). price = wat het kost; elke volgende keer wordt het duurder.
// Een item met repeat koop je zo vaak als je wilt (altijd dezelfde prijs).
export const SHOP_ITEMS = {
  soep: { name: 'Herstel-soep', icon: '🍲', price: [40], repeat: true, info: 'Meteen al je leven en flesjes terug.' },
  zaadje: { name: 'Gouden Zaadje', icon: '🧪', price: [200, 450, 800], info: 'Je flesjes helen 10% meer.' },
  hart: { name: 'Hartversterker', icon: '❤', price: [150, 300, 500, 800, 1200], info: '+10 levenspunten.' },
  slijpen: { name: 'Wapen slijpen', icon: '⚔', price: [150, 300, 500, 800, 1200], info: '+10% schade met al je wapens.' },
  dino: { name: 'Dino-ei', icon: '🥚', price: [250], info: 'Er komt Knokkie uit: een Boks-Dinootje dat met je meeloopt en meevecht!' },
};

/** Hoeveel vijanden je moet verslaan om van `level` naar `level + 1` te gaan. */
export function killsNeeded(level) {
  return 4 + level * 3; // (zo word je niet te snel sterk)
}

function freshSave() {
  return {
    level: 1,
    xp: 0, // verslagen vijanden sinds je laatste level
    kills: 0, // alle verslagen vijanden ooit
    runes: 0, // munten
    character: 'eve', // alleen Eve en Soldaat zijn speelbaar
    currentLevel: 0, // in welk gebied ben je nu (0 = de Groene Weide)
    unlockedLevel: 0, // tot en met dit gebied is open (de boss ervoor is verslagen)
    quests: {}, // zij-quests: { id: { state: 'actief' | 'klaar' | 'beloond', count } }
    questItems: [], // opgepakte quest-voorwerpen (sterren, batterijen)
    weapon: 'shortsword',
    helmet: 'geen',
    inventory: [{ kind: 'weapon', key: 'shortsword' }, { kind: 'helmet', key: 'geen' }],
    flasksMax: 3, // (oud: zo ging je vroeger met extra flesjes om, nu altijd MAX_FLASKS)
    apples: 0, // gevonden Gouden Appels: elk +15 leven
    checkpoint: null, // hier kom je terug als je doodgaat (null = begin van de wereld)
    flags: [], // alle vlaggen waar je al langs liep: daar kun je heen snelreizen (T)
    pet: null, // Knokkie het Boks-Dinootje: { level, kills } (als je het Dino-ei hebt gekocht)
    bosses: [], // verslagen bosses
    chests: [], // geopende kisten
    diamonds: [], // gevonden diamanten
    shop: {}, // hoe vaak je iets in de winkel kocht: { zaadje: 1, hart: 2, ... }
    // Omar (zie omar.js): hoe vaak je van hem won of verloor, en waar je vandaan kwam
    omar: {
      wins: 0, // zo vaak heb jij Omar verslagen
      losses: 0, // zo vaak won Omar
      visits: 0, // zo vaak was je in zijn kasteel (0 = je krijgt het lange filmpje)
      seen: false, // heb je de uitleg over Omar al gezien?
      trip: null, // { level, checkpoint }: waar je was toen Omar je meenam
      back: null, // { level, checkpoint, result }: zo kom je terug in je level
    },
    // Sky (zie sky.js): net als bij Omar, plus je Wolkenkelken (die kosten een reis met de Donderpoort)
    sky: {
      wins: 0, losses: 0, visits: 0, seen: false, trip: null, back: null,
      kelken: 0, // Wolkenkelken (van de Wolkenwachten in het Rotshoogland)
      drops: 0, // zo vaak liet Sky NightWalker vallen
    },
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
  get maxHealth() { return 150 + (this.data.level - 1) * PER_LEVEL.health + this.bought('hart') * 10 + this.perkBonus('health') + this.data.apples * APPLE_HEALTH; }
  get maxStamina() { return 100 + (this.data.level - 1) * PER_LEVEL.stamina; }
  get damageMultiplier() { return 1 + (this.data.level - 1) * PER_LEVEL.damage + this.bought('slijpen') * 0.1; }
  get flasksMax() { return MAX_FLASKS; }
  get speedMultiplier() { return 1 + this.perkBonus('speed'); }
  get defenseBonus() { return this.perkBonus('defense'); }
  get healBonus() { return this.perkBonus('heal') + this.bought('zaadje') * 0.1; }

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
      this.data.apples++; // een "flesje" uit een kist of quest is nu een Gouden Appel (zie gear.js)
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
      // Oude save met extra flesjes? Je houdt er 3, de rest worden Gouden Appels.
      if (this.data.flasksMax > MAX_FLASKS) {
        this.data.apples += this.data.flasksMax - MAX_FLASKS;
        this.data.flasksMax = MAX_FLASKS;
      }
      // Oude save (van voor de open wereld): de vlaggen van de gebieden die je al haalde mag je meteen gebruiken
      if (!saved?.flags) {
        this.data.flags = LEVELS.filter((l, i) => i <= this.data.unlockedLevel).map((l) => l.checkpoints[0][0]);
        if (this.data.checkpoint && !this.data.flags.includes(this.data.checkpoint)) this.data.flags.push(this.data.checkpoint);
      }
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
