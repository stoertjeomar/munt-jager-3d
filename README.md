# Munt Jager 3D

Een 3D-platformgame in de browser, gemaakt met **JavaScript** en **[Three.js](https://threejs.org/)**.
Loop rond, spring over blokken en zwevende platforms en verzamel alle 15 munten zo snel mogelijk.

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
| Muis slepen     | Camera draaien   |
| Scrollen        | Zoomen           |
| R               | Opnieuw beginnen |

## Wat zit erin

- Third-person camera die om de speler draait (muis) en soepel meebeweegt
- Beweging relatief aan de camera, met zwaartekracht en springen
- Eigen botsingsdetectie (AABB): landen op blokken, hoofd stoten, langs muren schuiven
- Van de wereld vallen → terug naar start
- Munten verzamelen, timer en win-scherm
- Realtime schaduwen en mist

## Projectstructuur

```
munt-jager-3d/
├── index.html      → pagina + HUD, laadt Three.js via een import map
├── style.css       → opmaak van de HUD
├── lib/            → Three.js (r170) + licentie
└── src/
    ├── main.js     → start alles op, game loop, score en winnen
    ├── player.js   → speler: lopen, springen, zwaartekracht, botsingen
    ├── world.js    → level: vloer, licht, blokken en munten
    ├── camera.js   → third-person camera
    └── input.js    → toetsenbord uitlezen
```

## Zelf aanpassen

- **Sneller lopen / hoger springen** → constanten bovenaan `src/player.js` (`SPEED`, `JUMP_SPEED`, `GRAVITY`)
- **Eigen level bouwen** → de lijsten `BLOCKS` en `COINS` bovenaan `src/world.js`
- **Debuggen** → open de console (F12) en typ bijvoorbeeld `game.player.position`

## Roadmap

- [ ] Vijanden die heen en weer lopen
- [ ] Bewegende platforms
- [ ] Geluidseffecten
- [ ] 3D-model als speler (`GLTFLoader`)
- [ ] Meerdere levels en een opgeslagen beste tijd

## Licentie

MIT — zie [LICENSE](LICENSE). Three.js valt onder zijn eigen MIT-licentie ([lib/THREE-LICENSE](lib/THREE-LICENSE)).
