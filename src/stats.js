// Alles wat je verdient en bewaart: level, eigenschappen, munten, uitrusting, krachten.
// Wordt opgeslagen in de browser (localStorage), zodat je later verder kunt spelen.

import { SAVE_KEY } from './levels.js';

// Eigenschappen die je met munten kunt verhogen bij een Plek van Genade
export const ATTRIBUTES = {
  vig: { name: 'Vitaliteit', info: 'Meer levenspunten' },
  str: { name: 'Kracht', info: 'Meer schade met je wapen' },
  end: { name: 'Uithouding', info: 'Meer stamina voor slaan, rollen en krachten' },
};

// Krachten die je vrijspeelt door sterker te worden of bosses te verslaan
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

/** Hoeveel munten het kost om van `level` naar `level + 1` te gaan. */
export function levelCost(level) {
  return Math.round(30 * Math.pow(1.25, level - 1));
}

function freshSave() {
  return {
    level: 1,
    vig: 5,
    str: 5,
    end: 5,
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
  get maxHealth() { return 80 + this.data.vig * 14; }
  get maxStamina() { return 60 + this.data.end * 8; }
  get damageMultiplier() { return 1 + (this.data.str - 5) * 0.1; }

  addRunes(amount) {
    this.data.runes += amount;
  }

  /** Eén punt in een eigenschap zetten (als je genoeg munten hebt). Geeft true terug als het lukte. */
  levelUp(attribute) {
    const cost = levelCost(this.data.level);
    if (this.data.runes < cost) return false;
    this.data.runes -= cost;
    this.data.level++;
    this.data[attribute]++;
    this.save();
    return true;
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
