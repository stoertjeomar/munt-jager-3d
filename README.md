# Munt Jager 3D

Een 3D-platformgame in de browser, gemaakt met **JavaScript** en **[Three.js](https://threejs.org/)**.
Loop rond, spring over blokken en zwevende platforms en verzamel alle 15 munten zo snel mogelijk.
Pas op voor de boze slijmballen — sla ze met je zwaard of spring erop!

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

| Toets           | Actie            |
| --------------- | ---------------- |
| WASD / pijltjes | Lopen            |
| Spatie          | Springen         |
| F / klik        | Slaan met je wapen |
| E               | Wapen oppakken (je oude wapen blijft liggen) |
| Muis bewegen    | Rondkijken (klik eerst in het spel) |
| Esc             | Muis weer vrij   |
| Scrollen        | Zoomen           |
| M               | Geluid aan/uit   |
| R               | Opnieuw beginnen |

## Wat zit erin

- Third-person camera: muis vastgezet in het spel (pointer lock), gewoon bewegen om rond te kijken
- Beweging relatief aan de camera, met zwaartekracht en springen
- Eigen botsingsdetectie (AABB): landen op blokken, hoofd stoten, langs muren schuiven
- Van de wereld vallen → terug naar start
- Munten verzamelen, timer en win-scherm
- Bewegend poppetje: armen en benen zwaaien tijdens het lopen, uithalen en slaan met het wapen in de hand,
  armen uit elkaar bij springen, bukken om een wapen op te pakken (`src/animator.js`)
- Diamanten zwaard van blokjes (pixel art, zelf te tekenen in `src/sword.js`) met zwaai-animatie: twee klappen en een vijand is verslagen
- 4 soorten vijanden, van makkelijk tot moeilijk:
  - **Slijmpje** (groen, 1 leven): klein en traag
  - **Slijmbal** (rood, 2 levens): boos en sneller
  - **Spook** (paars, 3 levens): vliegt door muren en volgt je tot op de platforms
  - **Rotsgolem** (8 levens): langzaam en zwaar, laadt op en slaat een schokgolf in de grond
- Levensbalk en schade-getallen boven vijanden, en hartjes die ze laten vallen
- Gloeiend zwaard-windje achter elke slag (kleur per wapen), vonken, spetters, camera-schok en "hitstop"
- Geluidseffecten, gemaakt met de Web Audio API (geen geluidsbestanden)
- Lucht met kleurverloop, bomen, stenen en bloemetjes
- 5 wapens: begin met het diamanten zwaard, vind in de wereld het ridderzwaard, kort zwaard, de knots en (bovenop het hoogste platform) de katana.
  Elk wapen heeft eigen schade, bereik en snelheid; de knots verslaat een vijand in één klap
- 5 levens: een vijand raken kost een hartje (met terugstoot), op een vijand springen verslaat hem meteen
- Realtime schaduwen en mist

## Projectstructuur

```
munt-jager-3d/
├── index.html      → pagina + HUD, laadt Three.js via een import map
├── style.css       → opmaak van de HUD
├── lib/            → Three.js (r170) + GLTFLoader + licentie
├── models/         → zet hier speler.glb neer voor je eigen poppetje
└── src/
    ├── main.js     → start alles op, game loop, score, gevechten en winnen
    ├── character.js → het poppetje: strohoed, rood hemd, blauwe broek, lopende armen en benen
    ├── player.js   → speler: lopen, springen, zwaartekracht, botsingen, levens
    ├── animator.js → laat het poppetje bewegen: lopen, slaan, springen, oppakken
    ├── sword.js    → het wapen in de hand: welk wapen en de timing van een slag
    ├── weapons.js  → alle wapens: schade, bereik, snelheid en 3D-model
    ├── pickups.js  → wapens die in de wereld liggen om op te pakken
    ├── enemies.js  → vijanden: soorten, looproutes, achtervolgen, golem-aanval
    ├── effects.js  → deeltjes, schade-getallen, schokgolven, camera-schok
    ├── trail.js    → het gloeiende zwaard-windje
    ├── audio.js    → geluidseffecten (Web Audio)
    ├── drops.js    → hartjes die vijanden laten vallen
    ├── world.js    → level: vloer, licht, blokken en munten
    ├── camera.js   → third-person camera
    └── input.js    → toetsenbord uitlezen
```

## Zelf aanpassen

- **Sneller lopen / hoger springen** → constanten bovenaan `src/player.js` (`SPEED`, `JUMP_SPEED`, `GRAVITY`)
- **Eigen level bouwen** → de lijsten `BLOCKS` en `COINS` bovenaan `src/world.js`
- **Poppetje aanpassen** → kleuren en vormen in `src/character.js`
- **Eigen 3D-poppetje** → exporteer je model als **.glb** (bijv. uit Tripo) en zet het in `models/speler.glb`.
  Het wordt vanzelf op de goede grootte gezet; heeft het animaties (idle / walk / run / jump), dan worden die afgespeeld.
  Kijkt het de verkeerde kant op? Pas `MODEL_TURN` aan bovenaan `src/player.js`; zit het zwaard niet in de hand, pas dan `MODEL_HAND` aan.
  Wil je het poppetje uit `character.js` terug? Verwijder (of hernoem) `models/speler.glb`.
- **Wapens aanpassen** → `WEAPONS` in `src/weapons.js` (schade, bereik, snelheid) en `PICKUP_SPOTS` in `src/pickups.js` (waar ze liggen)
- **Vijanden aanpassen** → `ENEMY_TYPES` (levens, snelheid, schade) en `SPAWNS` (waar ze lopen) bovenaan `src/enemies.js`
- **Debuggen** → open de console (F12) en typ bijvoorbeeld `game.player.position`

## Roadmap

- [x] Vijanden die heen en weer lopen
- [x] Zwaard
- [ ] Bewegende platforms
- [x] Geluidseffecten
- [x] 3D-model als speler (`GLTFLoader`)
- [ ] Meerdere levels en een opgeslagen beste tijd

## Credits

- Ridder (`models/speler.glb`) en wapens (`models/wapens/`): **Knight Pack** door [Quaternius](https://quaternius.com) — CC0 1.0 (public domain)

## Licentie

MIT — zie [LICENSE](LICENSE). Three.js valt onder zijn eigen MIT-licentie ([lib/THREE-LICENSE](lib/THREE-LICENSE)).
