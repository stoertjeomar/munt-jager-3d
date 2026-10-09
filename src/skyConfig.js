// Alle instellingen van het gevecht tegen Sky, op één plek. Hiermee maak je hem makkelijker of moeilijker.
// Hoe hij vecht staat in skyFighter.js; daar staan geen losse getallen, alles komt hiervandaan.
//
// Sky is doodstil... en dan opeens bliksemsnel. Hij staat met zijn hand op zijn zwaard (in de schede)
// en elke aanval begint vanuit die stilte: stil → laten zien wat hij gaat doen → aanval → even uitblazen.
//
// Tijden zijn in seconden, afstanden in meters.
// Bij twee getallen [a, b] is a voor fase 1 en b voor fase 2 (onder de helft van zijn leven).
// Schade is een deel van JOUW leven (0.2 = 20%): zo is Sky op elk level even eng.

export const SKY_BOSS = {
  // De naam in de grote balk onderin (Elden Ring-stijl)
  name: 'SKY, THUNDERBORN DEVIL OF THE SEVERED HEAVENS',

  // Leven: zoveel klappen met JOUW wapen kan hij hebben (hoe hoger jouw level, hoe minder klappen). min = minimaal leven.
  maxHealth: { hits: 40, perLevel: 0.3, minHits: 30, min: 650 },
  phase2Threshold: 0.5, // fase 2 begint onder dit deel van zijn leven (0.5 = de helft)
  phase2Damage: 1.2, // in fase 2 doet alles 20% meer pijn
  telegraphSpeed: [1, 0.75], // fase 2: alle waarschuwingen duren 25% korter

  // Hoeveel van jouw leven elke aanval kost
  damage: {
    flits: 0.22, // Move 1: Thunderclap and Flash
    keten: 0.12, // Move 2: Chain Lightning (per flits)
    inslag: 0.14, // Move 3: Heaven's Fall, een bliksem in een cirkel
    landing: 0.18, // Move 3: de schokgolf als hij landt
    sikkel: 0.12, // Move 4: Storm Crescent (per sikkel)
  },

  // ---------- Stilstaan (idle) en kiezen ----------
  idle: {
    wait: [[1.1, 1.8], [0.6, 1.1]], // zo lang staat hij stil voordat hij iets doet (tussen deze twee getallen)
    firstWait: 1.6, // aan het begin van het gevecht
    turnRate: 1.6, // hoe snel hij zich naar je toe draait (langzaam: hij is kalm)
    breathe: 0.025, // hoe ver zijn lijf op en neer gaat bij het ademen
    breatheSpeed: 1.7,
    crackle: [0.32, 0.12], // zo vaak een klein vonkje om hem heen (fase 2: vaker)
    poseBlend: 0.12, // zo snel gaat hij van stilstaan naar de houding van een aanval
  },
  // Welke aanval? Kans per afstand tot jou: [dichtbij, midden, ver]
  choose: {
    near: 4.5, // dichterbij dan dit = dichtbij
    far: 10, // verder dan dit = ver
    weights: {
      flits: [3, 3, 2],
      keten: [1, 2, 2.5],
      hemelval: [2, 1.5, 2],
      sikkel: [1.2, 2.5, 3],
    },
    maxRepeat: 2, // nooit vaker dan dit dezelfde aanval achter elkaar
  },

  // ---------- Move 1: Thunderclap and Flash (de "eerste vorm") ----------
  flits: {
    telegraph: 0.8, // door de knieën, hand op het zwaard, vonkjes bij zijn benen
    // Zo lang vóór de flits ligt zijn richting vast (met een "ting!"). Stap DAN opzij!
    // (0 = precies op het moment van de flits: dan is opzij stappen onmogelijk en helpt alleen rollen nog)
    lock: 0.25,
    travel: 0.08, // zo lang duurt de flits zelf (in een rechte lijn, onzichtbaar)
    overshoot: 3, // zo ver vóórbij jou komt hij uit (met zijn rug naar je toe)
    edge: 1.2, // zo ver blijft hij van de rand van de arena
    hitRadius: 0.9, // zo dik is de raaklijn (een "capsule" over het hele pad)
    hitHeight: 2.0, // spring je hoger dan dit, dan flitst hij onder je door
    recovery: 1.2, // daarna staat hij stil: DAN moet je slaan!
    sheatheAt: 0.55, // op dit deel van het uitblazen gaat het zwaard terug in de schede (bij alle aanvallen)
    sheatheBlend: 0.3, // zo lang (deel van het uitblazen) duurt het wegsteken
    legSparks: 0.05, // zo vaak vonkjes bij zijn benen tijdens het klaarzitten
  },

  // ---------- Move 2: Chain Lightning ----------
  keten: {
    flashes: [3, 6], // zoveel flitsen achter elkaar
    between: [0.3, 0.2], // zo lang staat hij stil tussen twee flitsen (dan mikt hij opnieuw)
    recovery: 1.4,
  },

  // ---------- Move 3: Heaven's Fall ----------
  hemelval: {
    telegraph: 0.55, // diep door de knieën voor de sprong
    jumpSpeed: 30, // hoe hard hij omhoog springt
    gone: 0.4, // na zoveel seconden is hij uit beeld
    circles: [[4, 5], [5, 6]], // zoveel cirkels (tussen deze getallen); één ligt altijd onder jou
    radius: 2.0, // zo groot is elke cirkel
    spread: [3, 7.5], // zo ver liggen de andere cirkels van jou af
    gap: 3.2, // zo ver liggen de cirkels minstens uit elkaar
    delay: 1.2, // na zoveel seconden slaat de bliksem in alle cirkels in
    landDelay: 0.45, // daarna komt hij neer op de laatste cirkel
    dropHeight: 11, // vanaf deze hoogte valt hij naar beneden
    dropSpeed: 34,
    shockRadius: 4.5, // zo ver gaat de schokgolf als hij landt (spring erover!)
    recovery: 1.3,
  },

  // ---------- Move 4: Storm Crescent ----------
  sikkel: {
    telegraph: 0.7, // zwaard trekken en opzij houden
    slash: 0.18, // zo snel gaat de slag
    count: [3, 5], // zoveel bliksemsikkels in een waaier
    slashes: [1, 2], // zoveel slagen (fase 2: twee)
    between: 0.4, // pauze tussen twee slagen
    angle: 0.42, // hoek tussen de sikkels (radialen): genoeg ruimte om ertussendoor te rennen
    speed: 15,
    range: 30, // zo ver vliegen ze
    width: 1.8, // zo breed is een sikkel
    thickness: 0.55, // zo dik is de raakzone (plus jouw lijf)
    height: 1.0, // zo hoog vliegen ze (spring erover, of rol erdoorheen)
    tall: 0.4, // zo hoog is een sikkel zelf (dan zie je hem goed aankomen)
    recovery: 1.0,
  },

  // ---------- Wankelen (stagger): sla hem vaak genoeg terwijl hij stilstaat ----------
  stagger: {
    poise: 0.09, // zoveel van zijn leven in `window` seconden...
    window: 2.5,
    time: 1.6, // ...en hij wankelt zo lang (gratis klappen!)
    cooldown: 6, // niet vaker dan dit
    after: 0.4, // daarna staat hij nog zo lang stil
  },

  // ---------- Fase 2: de storm barst los ----------
  phase2: {
    time: 2.8, // zo lang duurt het (hij kan dan niet geraakt worden)
    strikeEvery: 0.32, // zo vaak slaat de bliksem in op hem
    roarAt: 1.7, // dan brult hij en gaan zijn ogen en aders wit gloeien
    veinGlow: 2.6, // zo veel feller gloeien zijn aders daarna
    sparkEvery: 0.05, // altijd vonken om hem heen
    musicDuck: 0.3, // de muziek gaat even zachter
    after: 0.5, // daarna staat hij nog zo lang stil
  },

  // ---------- Hoe het voelt: flits, schudden, hitstop, bliksemspoor ----------
  feel: {
    whiteAlpha: 0.6, // het witte scherm bij een flits (0 = niks, 1 = helemaal wit)
    whiteFade: 0.15, // zo snel is het wit weer weg
    strikeWhite: 0.22, // een kleinere flits bij elke blikseminslag
    shake: 0.45,
    hitStop: 0.05, // het spel staat heel even stil als een flits jou raakt
    // Om epilepsie-gevoelige spelers te sparen: in een ketting flitst het scherm alleen bij de eerste en de laatste flits
    chainWhite: 'eerste-laatste',
  },
  trail: {
    life: 0.6, // zo lang blijft het bliksemspoor hangen
    flicker: 0.05, // zo vaak springt het zigzag-patroon opnieuw
    depth: 4, // hoe vaak het pad in tweeën gedeeld wordt (4 = 16 stukjes)
    wiggle: 0.13, // hoe ver de zigzag uitslaat (deel van de lengte van een stuk)
    branches: [1, 2], // zoveel zijtakjes
    glowWidth: 0.11, // dikte van de gele gloed
    coreWidth: 0.03, // dikte van de witte kern
    height: 1.0, // op deze hoogte loopt het spoor (borsthoogte)
  },

  // ---------- Geluid ----------
  audio: {
    musicDuck: 0.1, // tijdens het klaarzitten gaat de muziek naar 10%...
    duckFade: 0.2, // ...in 0.2 seconden
    musicBack: 0.9, // en daarna in zoveel seconden weer terug
    rumbleDelay: 0.08, // het gerommel na de donderklap
    // Eigen geluidsbestanden (relatief pad, bijv. 'sounds/sky/donderklap.mp3').
    // null = geen bestand: dan maakt audio.js het geluid zelf (zie skyCrack enz. daar).
    files: { skyBuzz: null, skyCrack: null, skyRumble: null, skySheathe: null, skyRoar: null },
  },

  // Wat hij soms zegt (maar niet vaak: hij is kalm)
  talk: [9, 14],
};
