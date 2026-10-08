# Munt Jager 3D

Een **open-wereld actie-RPG** in de browser, gemaakt met **JavaScript** en **[Three.js](https://threejs.org/)**.
Kies je held en trek door één grote wereld met 4 gebieden: versla vijanden voor munten en XP, help de dorpelingen
met zij-quests, koop spullen bij de koopman, vlieg op je **draak**, vecht samen met je **huisdier** en versla de
boss van elk gebied. Pas op: Omar stuurt soms zijn **schaduwleger** op je af! En als alle bosses verslagen zijn,
gaat de **Schaduwpoort** open... en daarna jaag je op **trofeeën**, **premies**, **Kampioenen** en **woedende bosses**.

> 👑 **Ikzelf, Omar, zit ook in de game!** Ik heb dit spel gemaakt en ik woon in Muntdorp.
> Daag me uit en ik neem je mee naar mijn Gekke Kasteel. Niemand heeft mij ooit verslagen...
> **dus probeer me maar eens te verslaan!**

![Screenshot van Munt Jager 3D](docs/screenshot.png)

## Direct spelen

**[Speel Munt Jager 3D in je browser](https://stoertjeomar.github.io/munt-jager-3d/)** — niks installeren.

## Zelf draaien (na clonen)

```bash
git clone https://github.com/stoertjeomar/munt-jager-3d.git
cd munt-jager-3d
```

De game gebruikt JavaScript-modules, dus hij moet via een (lokale) webserver geopend worden.
Dubbelklikken op `index.html` werkt **niet**. Kies één van deze opties:

| Optie | Hoe |
| ----- | --- |
| **VS Code** | Installeer de extensie *Live Server* → rechtsklik op `index.html` → **Open with Live Server** |
| **Node.js** | `npx serve` → open de link die verschijnt |
| **Python** | `python -m http.server 8000` → open <http://localhost:8000> |

Three.js zit al in de map `lib/`, dus er hoeft niks geïnstalleerd te worden en het werkt ook offline.

## Besturing

| Toets | Actie |
| ----- | ----- |
| WASD / pijltjes | Lopen |
| Muis | Rondkijken (de camera draait ook vanzelf achter je aan) |
| Shift | Kort tikken = rollen (onkwetsbaar), ingedrukt houden = sprinten |
| Spatie | Springen (in de lucht nog eens = dubbele sprong) |
| Klik / F | Slaan (F in de lucht = grondslag) |
| Q | Vastzetten op een vijand (lock-on) |
| R | Flesje drinken (leven terug) |
| E | Praten met een NPC / winkelen bij de koopman / kist openen |
| C | Dash |
| V | Wervelslag |
| X | Vuurzwaard |
| I of Tab | Uitrusting (wapens, helmen, krachten) |
| T | Wereldkaart + snelreizen naar een vlag waar je al was |
| B | Vuurtand de draak roepen / afstappen (na de eerste boss) |
| K | Trofeeënkast (je trofeeën, sterren en rang) |
| P | Ander huisdier met je mee (als je er meer hebt) |
| M | Geluid aan/uit |
| N | Muziek aan/uit (wordt onthouden) |
| G | Graphics: Laag / Normaal / Hoog (wordt onthouden) |
| Scrollen | In- en uitzoomen (je begint helemaal ingezoomd) |
| Esc | Pauze / muis vrij |

**Op de draak:** WASD = vliegen · Spatie = omhoog · kijk omlaag met de muis = dalen · Shift = extra snel ·
klik / F = vuur spuwen · B = afstappen (hoog in de lucht val je naar beneden, dat doet geen pijn).

## Wat zit erin

- **Eén grote open wereld** met 4 gebieden naast elkaar (geen losse levels meer: je kunt overal heen lopen).
  Elk gebied heeft een pad naar zijn boss-arena, met een vlag aan het begin en halverwege, en paden die de gebieden verbinden:
  1. **Groene Weide** met het dorp Muntdorp → boss **Budget Mario**
  2. **Ruïnevallei** met een parkour-ruïne → boss **Koning Slijm**
  3. **Spookwoud** (donker en mistig) → boss **De Gevallen Ridder**
  4. **Rotshoogland** → boss **Steenreus Gorath**
  5. **Schaduwrijk** (geheim!) → eindbaas **De Schaduwdraak**. De **Schaduwpoort** gaat pas open als de vier andere
     bosses verslagen zijn. Paarse mist, gloeiende kristallen, paarse dennen en enge muziek

  Loop je een ander gebied in, dan zie je de naam en veranderen de muziek, de mist, het gras en de geluiden.
  Te vroeg in een moeilijk gebied? Dan krijg je een waarschuwing. Versla een boss → *GEBIED VEILIG* → het volgende gebied gaat open.
- **Wereldkaart en snelreizen (T)**: elke vlag waar je langs liep wordt goud. Op de kaart zie je de hele wereld en reis je
  in één keer naar een gouden vlag. Op het startscherm kies je in welk (open) gebied je begint
- **Vuurtand de draak (B)**: versla Budget Mario en je krijgt een eigen draak! Hij komt aanvliegen, jij springt op zijn rug
  en je vliegt over de hele wereld. Hij spuwt vuur, maar durft niet in een boss-arena, en vijanden die hij verbrandt
  geven wel munten maar tellen niet mee voor je level (sterker worden doe je zelf)
- **Knokkie het Boks-Dinootje**: koop een **Dino-ei** bij de koopman. Knokkie loopt overal met je mee, stoot vijanden
  met zijn bokshandschoenen en wordt sterker (en groter) van elke 5 vijanden die hij verslaat, tot level 10
- **Omar-invasies**: af en toe valt Omars schaduwleger Muntdorp of een ander kamp aan (volg de paarse lichtstraal!).
  Versla drie golven schaduwkrijgers op tijd en je krijgt een flinke beloning
- **De Schaduwdraak**: een enorme paarse draak in het Schaduwrijk. Hij vliegt rondjes en schiet paarse vuurballen,
  duikt naar beneden (dan kun je hem raken!), spuwt vuur en zwiept met zijn staart, en in fase 2 roept hij Zombiepoppen op.
  Versla hem voor het **Drakenzwaard** en schaduwkleuren voor je eigen draak
- **Na alle bosses is er nog genoeg te doen** (het einddoel: word een 🌟 **LEGENDE**):
  - **Trofeeën (K)**: 28 prestaties (alle diamanten vinden, Omar verslaan, 1000 vijanden, Knokkie level 10...).
    Elke trofee geeft ⭐ **sterren**, en je rang groeit van Avonturier tot Legende
  - **Premiebord** in Muntdorp (en bij elke koopman): steeds drie nieuwe opdrachten voor munten en sterren
  - **Kampioenen** 👑: gouden vijanden met een kroon, veel sterker, en ze geven een ster
  - **Woedende bosses** 😡: een boss die je versloeg komt na een paar minuten terug, met meer leven en harder.
    Versla hem voor 2 sterren
  - **Sterrenwinkel** bij de koopman: het **Sterrenzwaard** (het sterkste wapen), **Pluis de kat**, nieuwe kleuren
    voor Vuurtand, Sterrenappels en snoepjes voor je huisdier
- **Pluis de kat**: een tweede huisdier (zelfgebouwd in code). Snel en ze krabt vijanden. Wissel met **P**
- **Nieuwe vijanden met echte animaties** (uit de *Universal Animation Library* van Quaternius): de **Zombiepop** ligt
  op de grond en kruipt overeind als je dichtbij komt, en de **Ninjapop** springt met een ninjasprong op je af,
  hakt drie keer met zijn katana en blokt soms je klappen (GEBLOKT!)
- **Muntdorp leeft**: dorpelingen die oogsten, zaaien, water geven, hout hakken, met een lantaarn rondstaan of bellen
- **Kies je held**: Eve of Soldaat (Mixamo-personages met een echt skelet: knieën, ellebogen, rennen, uitvalspas bij het slaan)
- **NPC's met zij-quests**: Mila, Strohoed, Robot B-0P en Sir Roestbout wonen in de wereld. Praat met ze (E) als er een **!** boven
  hun hoofd staat, doe de quest (vijanden verslaan of sterren/batterijen zoeken) en haal je beloning op bij het **?**
- **Huizen waar je in kunt**: loop door de deur naar binnen — met meubels, een haardvuur en het dak verdwijnt zodat je binnen kunt kijken
- **Een levende wereld**: dicht gras dat wuift in de wind en opzij buigt als je erdoorheen loopt, bergen in de verte,
  bolle wolken die meekleuren met de zonsondergang, vijvers met riet, populieren, dennen met gekartelde takken en
  bladeren waar de zon doorheen schijnt, zwevend stuifmeel overdag en vuurvliegjes 's nachts, een zon en maan aan de hemel
- Levendige vijanden: glanzende slijmpjes die knipperen en je met hun ogen volgen, spoken met een gloed, golems met gloeiende scheuren
- Lantaarns langs de paden, een bos rond de wereld, minimap met de paden, **dag-en-nachtritme** met sterren en een zachte **gloed** (bloom)
- 's Nachts is het donkerblauw maanlicht in plaats van pikzwart: de lantaarns verlichten de grond en een warm lichtje bij jou laat je de weg en de vijanden zien
- **Mooiere graphics**: gladde randjes, licht uit de lucht (glanzende dingen weerspiegelen de lucht), schaduwen die niet kriebelen,
  zachte schaduw-vlekjes onder iedereen, nevel laag bij de grond en een zon die een beetje schittert.
  Met **G** kies je *Laag* (snel, voor oudere laptops), *Normaal* of *Hoog* (met extra donkere hoekjes, "ambient occlusion")
- Vijanden (ook spoken) lopen niet meer door muren, bomen of stenen heen
- **Levelen door te vechten**: elke verslagen vijand telt mee (een boss telt voor 10). Elk level geeft wat meer leven,
  stamina en schade, en op sommige levels speel je een kracht of bonus vrij (meer leven, sneller lopen, minder schade).
  Je leven groeit expres niet te snel (anders wordt het te makkelijk): +6 per level, en je hebt steeds meer vijanden nodig.
  Je voortgang staat onder je levensbalk en in het menu *Level & krachten*.
- **Checkpoint-vlaggen**: aan het begin en halverwege elk gebied staat een vlag. Loop erlangs en hij wordt goud: als je
  doodgaat kom je bij de laatste vlag terug (je munten houd je gewoon), en je kunt er later heen snelreizen
- **Koopman Kobus** staat met zijn kraampje bij het begin van elk gebied: Herstel-soep, Gouden Zaadje (flesjes helen meer),
  Hartversterker (+10 leven), Wapen slijpen (+10% schade) en het Dino-ei
- **Gevechten**: leven en stamina, rollen met onkwetsbaarheid, lock-on, flesjes (maximaal 3 in het hele spel), zwaard-windje,
  vonken, schade-getallen, camera-schok en hitstop
- **5 krachten**: Dash, Dubbele sprong, Wervelslag, Grondslag en Vuurzwaard (vrijspelen door te levelen en bosses te verslaan)
- **Wapens** (alleen slagwapens): kort zwaard, dolk, bijl, ridderzwaard, katana, knots, strijdhamer, IJszwaard,
  Zonnezwaard, het diamanten zwaard, het **Demonenzwaard** (in een kist in het Rotshoogland) en de **Zeis van de Dood**
  (die krijg je als je Omar verslaat) — plus 3 helmen. Te vinden in kisten, bij quests en bij bosses
- **Vijanden**: slijmpjes, slijmballen, spoken, rotsgolems, zombies, Spierbonken, Mecha-Wachters, **Boks-Dino's**
  (spring op hun hoofd: BOING!), **Bigfoots** en Omars **schaduwkrijgers**. Alle vijanden zijn een stuk sterker geworden
- **4 bosses** met een mistmuur, boss-balk en een tweede fase: Koning Slijm, De Gevallen Ridder,
  Steenreus Gorath en Budget Mario. Ze hebben meer leven, doen meer schade en zijn sneller
- In Muntdorp staan een **oefenpop** (sla erop om je schade te zien, hij valt nooit om) en **Zorp de Alien** (praat met hem!)
- 3 verstopte **diamanten** per gebied, hartjes, munten die naar je toe vliegen
- **Omar, de maker van het spel**, woont in Muntdorp. Daag hem uit (E) en hij neemt je mee naar zijn **Gekke Kasteel**:
  eerst een filmpje op zijn troon, dan een gevecht in de arena tussen duistere ritueel-altaren en samoerai-wachters.
  Hij draagt het personage dat jij níet koos, heeft **gloeiende rode ogen**, een duistere aura, de **Zeis van de Dood** en
  álle krachten: dash, wervelslag, dubbele sprong met grondslag, vuurzwaard, rollen en zelf flesjes drinken. Hij kan
  **teleporteren** ("Achter je!"), de **bliksem** laten inslaan en als hij boos is roept hij **schaduwklonen** op die op je
  af stormen. Verlies je? Dan ben je niks kwijt. Win je? Dan krijg je de **Kroon van Omar**, zijn **Zeis** en een gek feest
- **Muziek** (zie Credits): bij **alle boss-gevechten** speelt *Where Is Your God Now*, tegen **Omar** zijn eigen epische
  boss-muziek, die al zachtjes opkomt terwijl hij praat en sneller gaat als hij boos wordt. In het Spookwoud en het
  Rotshoogland speelt duistere muziek, en de Weide en de Ruïnevallei hebben een zelfgemaakt deuntje (gemaakt in de code).
  De muziek wisselt vanzelf als je een ander gebied in loopt
- **Geluidseffecten** (lekker hard!): zwaarden, een anime-teleport bij het dashen en snelreizen, BOING als je op een vijand
  springt, een (zachte) anime-punch als je een vijand verslaat, een brullende draak met vleugelslagen en vuur,
  WOW bij een nieuw level, FAAAH als je doodgaat, glitter bij een kist, donder bij
  Omars bliksem, praatgeluidjes als iemand iets zegt, vogeltjes overdag, krekels 's nachts, een uil en wind in de bergen
- Maximaal **3 flesjes** in het hele spel (net als Omar), dus drink ze slim
- **Opslaan** in de browser (verder spelen waar je was)

## Projectstructuur

```
munt-jager-3d/
├── index.html        → pagina, HUD en startscherm
├── style.css         → opmaak
├── lib/              → Three.js (r170) + loaders + licentie
├── models/           → 3D-modellen (personages, wapens, helmen, bosses, KayKit, Kenney; extra/ = de nieuwe modellen)
├── textures/         → Kenney Retro Textures (grond, muren, daken, ramen)
├── sounds/           → geluiden uit het Kenney Starter Kit
├── music/            → muziek (mp3): boss-muziek, Omars muziek en de duistere levelmuziek
├── images/           → portretten voor het startscherm
└── src/
    ├── main.js       → start alles op, game loop, gevechten, winkel, doodgaan
    ├── graphics.js   → hoe het getekend wordt: gloed, kleuren, gladde randjes, de standen Laag/Normaal/Hoog (G)
    ├── blobs.js      → zachte schaduw-vlekjes onder de speler, vijanden en mensen
    ├── grass.js      → dicht, wuivend gras rond de speler (alleen op Normaal en Hoog)
    ├── levels.js     → de 4 gebieden: pad, vijanden, kisten, NPC's, huizen (pas hier je gebieden aan!) en hoe ze samen de open wereld vormen
    ├── world.js      → bouwt de wereld: grond, paden, huizen, ruïnes, natuur, arena's, mist, dag en nacht
    ├── npcs.js       → NPC's en hun zij-quests
    ├── decor.js      → planten, stenen, bolle wolken, riet bij de vijvers en dieren
    ├── player.js     → speler: bewegen, rollen, krachten, flesjes, personages
    ├── animator.js   → laat het poppetje bewegen (lopen, slaan, richten, drinken...)
    ├── mixamo.js     → vertaalt die bewegingen naar een Mixamo-skelet
    ├── character.js  → het Strohoed-poppetje uit simpele vormen
    ├── weapons.js    → alle wapens · gear.js → helmen
    ├── sword.js      → het wapen in de hand · trail.js → het zwaard-windje
    ├── projectiles.js→ energie- en vuurballen van vijanden
    ├── enemies.js    → vijanden en hun aanvallen · bosses.js → de vier bosses
    ├── dragon.js     → Vuurtand de draak: gebouwd van simpele vormen, vliegen en vuur spuwen
    ├── pet.js        → Knokkie het Boks-Dinootje dat met je meevecht
    ├── invasions.js  → Omar-invasies: golven schaduwkrijgers bij een kamp
    ├── shadowDragon.js → de eindbaas: de Schaduwdraak
    ├── goals.js      → trofeeën, sterren, rangen en het Premiebord
    ├── champions.js  → gouden Kampioenen met een kroon
    ├── villagers.js  → dorpelingen met animaties en het Premiebord in Muntdorp
    ├── sites.js      → checkpoint-vlaggen en kisten
    ├── pickups.js    → munten, hartjes, diamanten
    ├── stats.js      → level (door vijanden te verslaan), bonussen, krachten, opslaan
    ├── ui.js         → balken, menu's, banners, minimap en de wereldkaart
    ├── effects.js    → deeltjes, schokgolven, waarschuwingscirkels
    ├── omar.js       → alles rond Omar: uitdagen, het kasteel-filmpje, winnen (feest!) en verliezen
    ├── omarFighter.js→ Omar zelf in het gevecht: zijn brein, aanvallen, teleporteren en praatjes
    ├── castle.js     → het Gekke Kasteel van Omar met de arena en zijn troon
    ├── music.js      → de muziek: liedjes als "bladmuziek" in tekst en een kleine sequencer
    ├── audio.js      → geluiden · camera.js · input.js · assets.js
```

## Zelf aanpassen

- **Gebieden** → `LEVELS` in `src/levels.js` (welke vijanden, kisten, NPC's, huizen en welke boss). Begin in een gebied met `?level=3` achter de link
- **Draak, huisdier en invasies** → `DRAGON` in `src/dragon.js`, `PET`/`PETS` in `src/pet.js` en `INVASION` in `src/invasions.js`
- **Trofeeën, premies en de sterrenwinkel** → `TROPHIES` in `src/goals.js` en `STAR_ITEMS` in `src/stats.js`
- **Kampioenen en woedende bosses** → `CHAMPION` in `src/champions.js` en `RAGE` in `src/bosses.js`
- **Quests** → `QUESTS` bovenaan `src/npcs.js`
- **Vijanden** → `ENEMY_TYPES` bovenaan `src/enemies.js`. Alle vijanden sterker of zwakker: `ENEMY_POWER` (en voor de
  bosses `BOSS_POWER` in `src/bosses.js`)
- **Wapens** → `WEAPONS` in `src/weapons.js` · **Helmen** → `HELMETS` in `src/gear.js`
- **Krachten en levelen** → `POWERS`, `PERKS` en `killsNeeded` in `src/stats.js`
- **Personages** → `CHARACTERS` en `PLAYABLE` bovenaan `src/player.js`
- **Omar sterker of zwakker maken** → `OMAR` bovenaan `src/omarFighter.js`. Test het kasteel met `?level=omar`
- **Muziek** → `SONGS` in `src/music.js`: schrijf je eigen liedje met noten als `C5 - E5 G5`
- **Opnieuw beginnen** → uitrusting (I) → *Nieuw spel beginnen*

## Credits

- Ridder, helmen, zwaarden, knots en zombie: [Quaternius](https://quaternius.com) — CC0
- Mini-Game Variety Pack (planten, stenen, dieren, hart, diamant): [KayKit / Kay Lousberg](https://kaylousberg.com) — CC0
- Starter Kit 3D Platformer (munt, gras, vlaggen, robot, geluiden): [Kenney](https://kenney.nl) — MIT
- Retro Textures Fantasy: [Kenney](https://kenney.nl) — CC0
- Muziek (gratis te gebruiken volgens de makers):
  - Boss-muziek: *Where Is Your God Now* door **RokNardin** (via Epic Music World, YouTube)
  - Omars muziek: *I wrote EPIC Boss Fight music for a Video Game* door **Carameii** (YouTube)
  - Spookwoud en Rotshoogland: *Black Ops: Resurrection – Dark Cinematic Tactical Music* door **Garzehar** (Free to Use)
- Geluiden: Boing Boing, Anime punch, Wow Anime meme en FAAAH van [QuickSounds.com](https://quicksounds.com);
  anime shine door alexis_gaming_cam en thunder for anime door lordsonny (Pixabay)
- Extra 3D-modellen (Pixabay): magic ritual, glowing green reaper weapon, fantasy weapon en cosmic peace alien door
  pixellabs, samurai en bigfoot door nickpanek, male door promptplay, dinosaurs door tiny_planet_friends_3d en male door dezyne_3d
- Personages Eve, Soldaat en Mila: via Mixamo
- Etalagepoppen en hun animaties (Zombiepop, Ninjapop, dorpelingen): *Universal Animation Library 2* door
  [Quaternius](https://quaternius.com) — CC0
- Budget Mario door Teh_LaughingMan, Buff man door joney_lol, MS Gundam RX-78-2 door Tipatat Chennavasin
  (fan-modellen; Mario en Gundam zijn van Nintendo en Bandai — alleen voor eigen plezier)

## Licentie

MIT — zie [LICENSE](LICENSE). Three.js valt onder zijn eigen MIT-licentie ([lib/THREE-LICENSE](lib/THREE-LICENSE)).
De gebruikte modellen, texturen en muziek vallen onder de licenties hierboven.
