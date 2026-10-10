# Munt Jager 3D

Een **open-wereld actie-RPG** in de browser, gemaakt met **JavaScript** en **[Three.js](https://threejs.org/)**.
Kies je held en trek door één grote wereld met 5 gebieden: versla vijanden voor munten en XP, help de dorpelingen
met zij-quests, koop spullen bij de koopman, vlieg op je **draak** naar de **Hemeleilanden** hoog in de lucht, train je
**huisdieren** in de **Arena** en versla de boss van elk gebied. Pas op: Omar stuurt soms zijn **schaduwleger** op je af!
En als alle bosses verslagen zijn, gaat de **Schaduwpoort** open... en daarna jaag je op **trofeeën**, **premies**,
**Kampioenen** en **woedende bosses**. Of speel **samen online** met een vriend en daag hem uit voor een **duel**!

> 👑 **Ikzelf, Omar, zit ook in de game!** Ik heb dit spel gemaakt en ik woon in Muntdorp.
> Daag me uit en ik neem je mee naar mijn Gekke Kasteel. Niemand heeft mij ooit verslagen...
> **dus probeer me maar eens te verslaan!**

![Screenshot van Munt Jager 3D](docs/screenshot.png)

> 🎉 **Klaar!** Dit is de laatste versie van Munt Jager 3D. Alles zit erin, en het spel is zo soepel mogelijk gemaakt.
> Veel plezier met spelen!

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
| Muis | Rondkijken (de camera draait ook vanzelf achter je aan). Te snel of te sloom? Op het startscherm (Esc) zet je de **muis-snelheid** met − en + |
| Shift | Kort tikken = rollen (onkwetsbaar), ingedrukt houden = sprinten |
| Spatie | Springen (in de lucht nog eens = dubbele sprong) |
| Klik / F | Slaan (F in de lucht = grondslag) |
| Q | Vastzetten op een vijand (lock-on). Nog een keer Q, of de muis flink opzij bewegen = weer los |
| R | Flesje drinken (leven terug) |
| E | Praten met een NPC / winkelen bij de koopman / kist openen / huisdier aaien / de Arena / het Windaltaar |
| C | Dash |
| V | Wervelslag |
| X | Vuurzwaard |
| I of Tab | Uitrusting (wapens, helmen, krachten) |
| T | Wereldkaart + snelreizen naar een vlag waar je al was |
| B | Vuurtand de draak roepen / afstappen (na de eerste boss) |
| K | Trofeeënkast (je trofeeën, sterren en rang) |
| O | Samen spelen (online): kamer maken, meedoen met een code, duel |
| H | Claude, je computer-maatje: volgen, wachten, terug naar Muntdorp, of een duel |
| M | Geluid aan/uit |
| N | Muziek aan/uit (wordt onthouden) |
| G | Graphics: Laag / Normaal / Hoog (wordt onthouden) |
| Scrollen | In- en uitzoomen (je begint helemaal ingezoomd) |
| Esc | Pauze / muis vrij |
| Enter | Admin-menu (met de geheime code) |

**Op de draak:** WASD = vliegen · Spatie = omhoog · kijk omlaag met de muis = dalen · Shift = extra snel ·
klik / F = vuur spuwen · B = afstappen (hoog in de lucht val je naar beneden, dat doet geen pijn).

## Wat zit erin

- **Eén grote open wereld** met 5 gebieden naast elkaar (geen losse levels meer: je kunt overal heen lopen).
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
- **Knokkie het Boks-Dinootje**: koop een **Dino-ei** bij de koopman. Knokkie woont in **Muntdorp** en loopt daar los
  rond (net als Pluis de kat). Ze komen naar je toe als je in de buurt bent, je kunt ze **aaien (E)**, en in de **Arena**
  vechten ze tegen monsters. Winnen maakt ze sterker (en groter), tot level 10
- **De Arena** naast Muntdorp (E bij de poort): een rond colosseum met tribunes, vlaggen, fakkels en een gong.
  - **Golven overleven**: jij tegen steeds meer en sterkere monsters (munten per golf, een ⭐ per 5 golven; doodgaan kost hier niks)
  - **Huisdiergevecht**: Knokkie of Pluis tegen een monster
  - **Monstergevecht**: twee monsters vechten tegen elkaar en jij **wedt** munten op de winnaar (goed gegokt = dubbel terug)
  - **Duel tegen Claude**: 8 niveaus, van 😊 Makkelijk tot ☠️ ONMOGELIJK. Win een niveau om het volgende te openen
  - **Duel**: online tegen een vriend (zie *Samen spelen*)
- **De Hemeleilanden** ☁: vijf zwevende eilanden hoog boven de Ruïnevallei, waar je **alleen met Vuurtand** komt. Met
  roze wolkenbomen, een waterval die naar beneden valt, kristallen, een regenboog, stapstenen om over te springen,
  Wolkengeesten en een Stormgolem. Op elk eiland staat een kist met een **speciaal wapen**, er liggen 3 diamanten, er staat
  een vlag (dan kun je erheen snelreizen) en het **Windaltaar** geeft je de *Zegen van de Wind*: 90 seconden lang meer
  schade en sneller lopen
- **Wapens met een speciale kracht**: de **Gifdolk** (vergiftigt), het **IJszwaard** (bevriest: vijanden lopen langzaam),
  het **Bliksemzwaard** (de bliksem springt over naar andere vijanden), het **Vampierzwaard** (je krijgt leven terug)
  en de **Wolkenspeer** (héél lang bereik, en een windstoot blaast vijanden weg)
- **Claude, je computer-maatje** 🤖: een held die door de computer wordt bestuurd. Hij staat in **Muntdorp, vlak voor
  waar je begint** (🤖 op de kaart). Praat met hem (**E**) en kies of hij met je meegaat. Dan loopt hij achter je aan,
  vecht mee tegen vijanden in de buurt (ook bij bosses, maar dan wat zachter), flitst naar je toe als hij achterblijft en
  wacht even als jij op je draak vliegt. Hij kletst in tekstwolkjes ("Daar! Een slijmpje!", "Mooie klap!").
  Met **H** zeg je dat hij moet volgen, wachten of teruggaan naar Muntdorp. In de **Arena** kun je tegen hem vechten:
  **8 niveaus** (Makkelijk, Normaal, Moeilijk, Expert, Meester, Kampioen, Legende en ONMOGELIJK). Hoe hoger, hoe sterker
  en slimmer: hij slaat combo's, slaat terug als jij mist, doet een wervelslag, pakt een vuurzwaard, dasht naar je toe,
  drinkt flesjes en laat zich niet meer wegduwen. Verliezen kost niks, winnen geeft munten (tot ● 5000).
  Vijanden die Claude verslaat geven munten, maar tellen niet mee voor je level
- **Samen spelen (online)** 🌐: druk op **O** (of *Samen spelen* op het startscherm). Eén speler maakt een kamer en krijgt
  een code (bijv. MUNT-7K3P), de ander typt die code in. Dan zie je elkaar lopen, springen, slaan en op de draak vliegen,
  en in de Arena kun je een **duel** doen (de winnaar krijgt munten). Vijanden, kisten en munten heeft ieder voor zich.
  Dit werkt met [PeerJS](https://peerjs.com): de computers vinden elkaar via de gratis PeerJS-server en praten daarna direct
- **Echte animaties voor je held**: slaan (een combo van verschillende slagen, en met zware wapens een grote hamerslag),
  dashen, afzetten bij het springen, een **salto** bij de dubbele sprong, een **superheldenlanding** na de grondslag,
  geraakt worden, drinken, bukken en omvallen als je doodgaat. Ze komen uit de *Universal Animation Library 2* en worden
  in de code "vertaald" naar het skelet van Eve en de Soldaat (`src/retarget.js`). Lopen en rennen doet onze eigen animator,
  en als je slaat terwijl je loopt, lopen je benen gewoon door
- **Een nieuwe look**: een levelrondje met je rang, glimmende levensbalken, een krachtenbalk met plaatjes en
  afkoel-taartpuntjes, een minimap met kompas en de naam van het gebied, een wereldkaart met lintjes en mist over gebieden
  waar je nog niet was, en menu's met kaartjes (wapens in de kleur van hoe zeldzaam ze zijn)
- **Omar-invasies**: af en toe valt Omars schaduwleger Muntdorp of een ander kamp aan (volg de paarse lichtstraal!).
  Versla drie golven schaduwkrijgers op tijd en je krijgt een flinke beloning
- **De Schaduwdraak**: een enorme paarse draak in het Schaduwrijk. Hij vliegt rondjes en schiet paarse vuurballen,
  duikt naar beneden (dan kun je hem raken!), spuwt vuur en zwiept met zijn staart, en in fase 2 roept hij Zombiepoppen op.
  Versla hem voor het **Drakenzwaard** en schaduwkleuren voor je eigen draak
- **Na alle bosses is er nog genoeg te doen** (het einddoel: word een 🌟 **LEGENDE**):
  - **Trofeeën (K)**: 30 prestaties (alle diamanten vinden, Omar verslaan, 1000 vijanden, Knokkie level 10...).
    Elke trofee geeft ⭐ **sterren**, en je rang groeit van Avonturier tot Legende
  - **Premiebord** in Muntdorp (en bij elke koopman): steeds drie nieuwe opdrachten voor munten en sterren
  - **Kampioenen** 👑: gouden vijanden met een kroon, veel sterker, en ze geven een ster
  - **Woedende bosses** 😡: een boss die je versloeg komt na een paar minuten terug, met meer leven en harder.
    Versla hem voor 2 sterren
  - **Sterrenwinkel** bij de koopman: het **Sterrenzwaard** (het sterkste wapen), **Pluis de kat**, nieuwe kleuren
    voor Vuurtand, Sterrenappels en snoepjes voor je huisdier
- **Pluis de kat**: een tweede huisdier (zelfgebouwd in code). Snel en ze krabt vijanden
- **Nieuwe vijanden met echte animaties** (uit de *Universal Animation Library* van Quaternius): de **Zombiepop** ligt
  op de grond en kruipt overeind als je dichtbij komt, en de **Ninjapop** springt met een ninjasprong op je af,
  hakt drie keer met zijn katana en blokt soms je klappen (GEBLOKT!)
- **Muntdorp leeft**: dorpelingen die oogsten, zaaien, water geven, hout hakken, met een lantaarn rondstaan of bellen,
  en **dragers** die met een krat, groente, hout, een pompoen of een zak door het dorp lopen (sta je in de weg, dan wachten
  ze en knikken ze gedag)
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
  Met **G** kies je *Laag* (snel, voor oudere laptops), *Normaal* of *Hoog* (met extra donkere hoekjes, "ambient occlusion").
  Kies je zelf niks, dan kijkt het spel steeds of het soepel loopt; zo niet, dan gaan de graphics vanzelf een stand omlaag
- **Soepel spelen**: alles wat ver weg in de mist staat (bomen, plantjes, huizen, vijanden) wordt niet getekend, en de
  bomen en plantjes zijn verdeeld in vakken, zodat alleen die dichtbij getekend worden. Bij het begin staat er "Laden…" op
  de knop tot alles binnen is; dan worden alle plaatjes en shaders alvast klaargezet, zodat het spel niet hapert als je
  begint. De muziek wordt verder vooruit ingepland, zodat hij niet stopt als het spel even hapert.
  Botsingen (met bomen, muren, stenen) worden alleen gecheckt voor de dingen vlak bij je, Claude, je huisdier, de vijanden
  en de camera (in vakjes van 8 meter), in plaats van voor alle duizenden blokken van de hele wereld. Vlaggen wapperen alleen
  als je in de buurt bent, en het koor in de muziek is lichter (het geluid in het Schaduwrijk hapert niet meer)
- **Hapert het spel toch?** Druk op **G** tot er *Laag* staat, sluit andere tabbladen en zet in je browser
  *hardwareversnelling* aan (Chrome/Edge: Instellingen → Systeem). Rondkijken sloom? Zet de muis-snelheid hoger op het startscherm
- Je poppetje blijft altijd recht: landen midden in een salto of een dash midden in een koprol laat hem niet meer scheef
  of ondersteboven staan, en na een slag staan de heupen en de nek weer goed (je loopt niet meer scheef)
- **Kampioenen** beginnen op een vrij plekje, lopen rond, botsen net zo groot als ze eruitzien en springen over iets heen
  als ze echt vastzitten
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
  (die krijg je als je Omar verslaat) en de **Schaduwkatana** (van Rames) — plus 3 helmen. Te vinden in kisten, bij quests en bij bosses
- **Vijanden**: slijmpjes, slijmballen, spoken, rotsgolems, zombies, Spierbonken, Mecha-Wachters, **Boks-Dino's**
  (spring op hun hoofd: BOING!), **Bigfoots**, Omars **schaduwkrijgers** en de **bullys** van Rames (skeletten). Alle vijanden zijn een stuk sterker geworden
- **4 bosses** met een mistmuur, boss-balk en een tweede fase: Koning Slijm, De Gevallen Ridder,
  Steenreus Gorath en Budget Mario. Ze hebben meer leven, doen meer schade en zijn sneller
- **Rames, de Heer van de Ondoden**: een geheime, héél sterke boss op **het Knekelhof**, een kerkhof in het Spookwoud
  (neem het zijpad bij de vlag *Woudruïne*; op de kaart staat een paars ✝). Hij is een ondode samoerai met een
  **Schaduwkatana** vol duistere magie en hij praat zoals de echte Rames typt ("neef je gaat niet halen").
  Hij heeft **vier filmpjes**: hij wordt wakker op zijn troon van bot en de bliksem slaat in op zijn katana, hij roept zijn
  **bullys** (skeletten die uit de graven kruipen), hij valt "dood" neer maar staat groen en razend weer op
  (*Rames de Herrezene*), en zijn echte einde. Zijn aanvallen: katana-combo met een dreun, de **Schaduwsnede** (hij flitst dwars
  door je heen), een waaier van magie, **botstekels** onder je voeten, de **Schaduwstap** (poef, achter je!) en als hij
  herrezen is de **Zielenstorm**. Versla hem en je krijgt de **Schaduwkatana**: het snelste wapen van het spel
- In Muntdorp staan een **oefenpop** (sla erop om je schade te zien, hij valt nooit om) en **Zorp de Alien** (praat met hem!)
- 3 verstopte **diamanten** per gebied, hartjes, munten die naar je toe vliegen
- **Omar, de maker van het spel**, woont in Muntdorp. Daag hem uit (E) en hij neemt je mee naar zijn **Gekke Kasteel**:
  eerst een filmpje op zijn troon, dan een gevecht in de arena tussen duistere ritueel-altaren en samoerai-wachters.
  Hij draagt het personage dat jij níet koos, heeft **gloeiende rode ogen**, een duistere aura, de **Zeis van de Dood** en
  álle krachten: dash, wervelslag, dubbele sprong met grondslag, vuurzwaard, rollen en zelf flesjes drinken. Hij kan
  **teleporteren** ("Achter je!"), de **bliksem** laten inslaan en als hij boos is roept hij **schaduwklonen** op die op je
  af stormen. Verlies je? Dan ben je niks kwijt. Win je? Dan krijg je de **Kroon van Omar**, zijn **Zeis** en een gek feest
- **Sky, de Heer van de Storm** (de eindbaas): in het Rotshoogland woont **Opa Donder** met de quest *De storm van Sky*.
  **Wolkenwachten** (zwevende onweerswolkjes) laten soms een **Wolkenkelk** vallen. Met 4 kelken brengt de **Donderpoort**
  je naar het **Wolkenrijk**: een wolkenplateau onder een onweerslucht vol bliksem en donder. Sky zit op een troon van
  wolken, wordt een wolk en slaat als bliksem de arena in. In de grote balk onderin heet hij
  **SKY, THUNDERBORN DEVIL OF THE SEVERED HEAVENS**. Hij draagt een gele **haori** met witte driehoekjes, heeft een
  stormhuid met gele bliksemaders, rode ogen en een wolken-aura. Hij is **doodstil**, hand op zijn zwaard in de schede...
  en dan **bliksemsnel**: elke aanval begint met een waarschuwing, en daarna staat hij even uit te blazen (dán slaan!).
  Zijn aanvallen: **Thunderclap and Flash** (door de knieën, de muziek valt stil, een zoem, "ting!"... en in één flits staat
  hij achter je, met een bliksemspoor), **Chain Lightning** (3 flitsen achter elkaar), **Heaven's Fall** (hij springt uit
  beeld, de bliksem slaat in in rode cirkels en hij landt met een schokgolf) en **Storm Crescent** (een waaier
  bliksemsikkels: ren ertussendoor of rol erdoorheen). Raak je hem vaak terwijl hij stilstaat, dan **wankelt** hij.
  Op de helft van zijn leven slaat de bliksem in op hem: **witte ogen**, wit-hete aders, een donkere lucht, snellere
  aanvallen en 6 flitsen per ketting. Alle getallen staan in `src/skyConfig.js`.
  Win je? Altijd **1500 munten**, en 1 op de 10 keer laat hij zijn bliksemzwaard
  **NightWalker** vallen: elke klap zapt, elke 3e raak-klap slaat de bliksem in en met **C** word je even een wolk
- **Muziek** (zie Credits): bij **alle boss-gevechten** speelt *Where Is Your God Now* (bij Rames komt hij al zachtjes op
  tijdens zijn filmpje, en gaat hij sneller als hij herrezen is), tegen **Omar** zijn eigen epische
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
├── lib/              → Three.js (r170) + loaders, PeerJS (samen spelen) + licenties
├── models/           → 3D-modellen (personages, wapens, helmen, bosses, KayKit, Kenney; extra/ = de nieuwe modellen)
├── textures/         → Kenney Retro Textures (grond, muren, daken, ramen)
├── sounds/           → geluiden uit het Kenney Starter Kit
├── music/            → muziek (mp3): boss-muziek, Omars muziek en de duistere levelmuziek
├── images/           → portretten voor het startscherm
└── src/
    ├── main.js       → start alles op, game loop, gevechten, winkel, doodgaan
    ├── graphics.js   → hoe het getekend wordt: gloed, kleuren, gladde randjes, de standen Laag/Normaal/Hoog (G)
    ├── culling.js    → wat ver weg in de mist staat niet tekenen (dan loopt het spel soepel)
    ├── spatial.js    → snel de bomen, muren en stenen vlak bij iets vinden (voor de botsingen)
    ├── blobs.js      → zachte schaduw-vlekjes onder de speler, vijanden en mensen
    ├── grass.js      → dicht, wuivend gras rond de speler (alleen op Normaal en Hoog)
    ├── levels.js     → de 5 gebieden: pad, vijanden, kisten, NPC's, huizen (pas hier je gebieden aan!) en hoe ze samen de open wereld vormen
    ├── world.js      → bouwt de wereld: grond, paden, huizen, ruïnes, natuur, arena's, het Knekelhof, mist, dag en nacht
    ├── npcs.js       → NPC's en hun zij-quests
    ├── decor.js      → planten, stenen, bolle wolken, riet bij de vijvers en dieren
    ├── player.js     → speler: bewegen, rollen, krachten, flesjes, personages
    ├── animator.js   → laat het poppetje bewegen (lopen, slaan, richten, drinken...)
    ├── mixamo.js     → vertaalt die bewegingen naar een Mixamo-skelet
    ├── retarget.js   → echte animaties (slaan, springen, landen...) van de etalagepop overzetten op je held
    ├── character.js  → het Strohoed-poppetje uit simpele vormen
    ├── weapons.js    → alle wapens · gear.js → helmen
    ├── sword.js      → het wapen in de hand · trail.js → het zwaard-windje
    ├── projectiles.js→ energie- en vuurballen van vijanden
    ├── enemies.js    → vijanden en hun aanvallen · bosses.js → de vier bosses
    ├── dragon.js     → Vuurtand de draak: gebouwd van simpele vormen, vliegen en vuur spuwen
    ├── pet.js        → Knokkie en Pluis: lopen los rond in Muntdorp
    ├── arena.js      → de Arena: golven, huisdiergevechten, wedden op monsters en het duel
    ├── islands.js    → de Hemeleilanden: zwevende eilanden, het Windaltaar en de bewakers
    ├── multiplayer.js→ samen spelen via internet (PeerJS): je vriend zien en het duel
    ├── buddy.js      → Claude, je computer-maatje: NPC in Muntdorp, meelopen, meevechten, kletsen en het duel (8 niveaus)
    ├── invasions.js  → Omar-invasies: golven schaduwkrijgers bij een kamp
    ├── shadowDragon.js → de eindbaas: de Schaduwdraak
    ├── goals.js      → trofeeën, sterren, rangen en het Premiebord
    ├── champions.js  → gouden Kampioenen met een kroon
    ├── villagers.js  → dorpelingen met animaties en het Premiebord in Muntdorp
    ├── sites.js      → checkpoint-vlaggen en kisten
    ├── pickups.js    → munten, hartjes, diamanten
    ├── stats.js      → level (door vijanden te verslaan), bonussen, krachten, opslaan
    ├── admin.js      → het admin-menu (Enter + code): sterkte, oneindig stamina/geld/levels, alle items
    ├── ui.js         → balken, menu's, banners, minimap en de wereldkaart
    ├── effects.js    → deeltjes, schokgolven, waarschuwingscirkels
    ├── omar.js       → alles rond Omar: uitdagen, het kasteel-filmpje, winnen (feest!) en verliezen
    ├── omarFighter.js→ Omar zelf in het gevecht: zijn brein, aanvallen, teleporteren en praatjes
    ├── castle.js     → het Gekke Kasteel van Omar met de arena en zijn troon
    ├── sky.js        → alles rond Sky: Opa Donder, Wolkenkelken, de Donderpoort, het filmpje en de beloning
    ├── skyFighter.js → Sky zelf in het gevecht: stil → waarschuwen → aanval → uitblazen, zijn vier aanvallen en fase 2
    ├── skyConfig.js  → alle getallen van het gevecht tegen Sky (leven, schade, tijden, kansen): pas hier aan!
    ├── skyworld.js   → het Wolkenrijk met onweer · skyLook.js → Sky's stormhuid · haori.js → zijn jasje
    ├── wolf.js       → bliksemwolven (niet meer in gebruik sinds Sky's nieuwe gevecht)
    ├── nightwalkerModel.js → het cartoon-model van NightWalker
    ├── lightning.js  → bliksemschichten (Omar, Sky, NightWalker en het onweer)
    ├── nightwalker.js→ de krachten van NightWalker: zap, blikseminslag en de wolk-dash
    ├── rames.js      → alles rond Rames: zijn filmpjes, wat hij zegt en je beloning
    ├── ramesFighter.js→ Rames zelf in het gevecht: zijn model, aanvallen, bullys en opstaan uit de dood
    ├── music.js      → de muziek: liedjes als "bladmuziek" in tekst en een kleine sequencer
    ├── audio.js      → geluiden · camera.js · input.js · assets.js
```

## Zelf aanpassen

- **Gebieden** → `LEVELS` in `src/levels.js` (welke vijanden, kisten, NPC's, huizen en welke boss). Begin in een gebied met `?level=3` achter de link
- **Draak, huisdier en invasies** → `DRAGON` in `src/dragon.js`, `PET`/`PETS` in `src/pet.js` en `INVASION` in `src/invasions.js`
- **De Arena** → `ARENA`, `WAVES` en `FIGHTERS` in `src/arena.js` · **De Hemeleilanden** → `ISLAND_LAYOUT` in `src/levels.js` en `ALTAR` in `src/islands.js`
- **Animaties van je held** → `CLIPS` bovenaan `src/player.js` (welke animatie bij welke actie, en welk stukje ervan)
- **Claude, je maatje** → `BUDDY` (hoe sterk, hoe ver) en `BUDDY_DUEL` (de 8 duel-niveaus: leven, schade, combo's, wervelslag, ...) in `src/buddy.js`; wat hij zegt staat in `LINES`
- **Samen spelen** → `src/multiplayer.js` (test met een eigen PeerJS-server: `index.html?peer=localhost:9000`)
- **Trofeeën, premies en de sterrenwinkel** → `TROPHIES` in `src/goals.js` en `STAR_ITEMS` in `src/stats.js`
- **Kampioenen en woedende bosses** → `CHAMPION` in `src/champions.js` en `RAGE` in `src/bosses.js`
- **Quests** → `QUESTS` bovenaan `src/npcs.js`
- **Vijanden** → `ENEMY_TYPES` bovenaan `src/enemies.js`. Alle vijanden sterker of zwakker: `ENEMY_POWER` (en voor de
  bosses `BOSS_POWER` in `src/bosses.js`)
- **Wapens** → `WEAPONS` in `src/weapons.js` · **Helmen** → `HELMETS` in `src/gear.js`
- **Krachten en levelen** → `POWERS`, `PERKS` en `killsNeeded` in `src/stats.js`
- **Personages** → `CHARACTERS` en `PLAYABLE` bovenaan `src/player.js`
- **Omar sterker of zwakker maken** → `OMAR` bovenaan `src/omarFighter.js`. Test het kasteel met `?level=omar`
- **Sky sterker of zwakker maken** → `SKY_BOSS` in `src/skyConfig.js` (leven, schade, hoe lang hij waarschuwt, hoeveel
  flitsen, kansen per aanval...), de beloning en kelken in `SKY_LOOT` in `src/sky.js`. Eigen geluiden voor Sky (bijv. een
  echte donderklap) zet je in `sounds/` en geef je op bij `audio.files` in `src/skyConfig.js`.
  Test het Wolkenrijk met `?level=sky`
- **Rames sterker of zwakker maken** → `RAMES` bovenaan `src/ramesFighter.js` (zijn leven: `BOSS_INFO` in `src/bosses.js`).
  Wat hij zegt → `LINES` bovenaan `src/rames.js` (en `BARKS` in `src/ramesFighter.js`). Testen: begin met `?level=3`, en typ
  in de console (F12) `game.rames.skipToFight()` of `game.rames.setHp(0.01)` (één klap en hij "sterft")
- **Muziek** → `SONGS` in `src/music.js`: schrijf je eigen liedje met noten als `C5 - E5 G5`
- **Admin-menu** → druk op **Enter** en typ `123123`. Kies hoe sterk je bent (*Normaal*, *Matig sterk* = 300 leven,
  *OP!!!* = alles op max), zet oneindig stamina, geld en levels aan, en pak elk wapen en elke helm die je wilt.
  Het wordt bewaard in je save. De code staat in `ADMIN_CODE` (`src/admin.js`), de sterktes in `ADMIN_KRACHT` (`src/stats.js`)
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
- Etalagepoppen en hun animaties (Zombiepop, Ninjapop, dorpelingen, en de animaties van je held): *Universal Animation Library 2* door
  [Quaternius](https://quaternius.com) — CC0
- Samen spelen: [PeerJS](https://peerjs.com) door Michelle Bu, Eric Zhang en anderen — MIT ([lib/peerjs-LICENSE.txt](lib/peerjs-LICENSE.txt))
- Budget Mario door Teh_LaughingMan, Buff man door joney_lol, MS Gundam RX-78-2 door Tipatat Chennavasin
  (fan-modellen; Mario en Gundam zijn van Nintendo en Bandai — alleen voor eigen plezier)

## Licentie

MIT — zie [LICENSE](LICENSE). Three.js valt onder zijn eigen MIT-licentie ([lib/THREE-LICENSE](lib/THREE-LICENSE)).
De gebruikte modellen, texturen en muziek vallen onder de licenties hierboven.
