# Munt Jager 3D

Een **open-wereld actie-RPG** in de browser, in de stijl van Elden Ring, gemaakt met **JavaScript** en **[Three.js](https://threejs.org/)**.
Kies je held, versla vijanden voor munten, word sterker bij de Plekken van Genade, vind wapens en krachten,
en versla de vier bosses.

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
| Klik / F | Slaan of schieten (F in de lucht = grondslag) |
| Q | Vastzetten op een vijand (lock-on) |
| R | Flesje drinken (leven terug) |
| E | Rusten bij een Plek van Genade / kist openen |
| C | Dash |
| V | Wervelslag |
| X | Vuurzwaard |
| I of Tab | Uitrusting (wapens, helmen, krachten) |
| M | Geluid aan/uit |
| Esc | Pauze / muis vrij |

## Wat zit erin

- **Kies je held**: Ridder, Eve, Soldaat, Mila, Robot of Strohoed — allemaal met dezelfde animaties
  (lopen, slaan, rollen, drinken, richten), ook de Mixamo-personages met een echt skelet
- **Open wereld** van 240 × 240 meter: Groene Weide, het dorp Muntdorp, het Spookwoud en het Rotshoogland,
  met paden, ruïnes, bomen, dieren, wolken, een minimap en een **dag-en-nachtritme** met sterren
- **Elden Ring-stijl**: munten verdienen, levelen bij Plekken van Genade (Vitaliteit, Kracht, Uithouding),
  rusten brengt vijanden terug, doodgaan = je munten blijven liggen waar je viel
- **Gevechten**: leven en stamina, rollen met onkwetsbaarheid, lock-on, flesjes, zwaard-windje,
  vonken, schade-getallen, camera-schok en hitstop
- **5 krachten**: Dash, Dubbele sprong, Wervelslag, Grondslag en Vuurzwaard (vrijspelen door te levelen en bosses te verslaan)
- **Wapens**: kort zwaard, ridderzwaard, katana, knots, diamanten zwaard, revolver, shotgun, machinegeweer,
  sluipschuttersgeweer en boog — plus 3 helmen. Te vinden in kisten en bij bosses
- **Vijanden**: slijmpjes, slijmballen, spoken, rotsgolems, zombies, Spierbonken en Mecha-Wachters
- **4 bosses** met een mistmuur, boss-balk en een tweede fase: Koning Slijm, De Gevallen Ridder,
  Steenreus Gorath en Budget Mario
- 12 verstopte **diamanten**, hartjes, munten die naar je toe vliegen
- Geluidseffecten en **opslaan** in de browser (verder spelen waar je was)

## Projectstructuur

```
munt-jager-3d/
├── index.html        → pagina, HUD en startscherm
├── style.css         → opmaak (Elden Ring-stijl)
├── lib/              → Three.js (r170) + loaders + licentie
├── models/           → 3D-modellen (personages, wapens, helmen, bosses, KayKit, Kenney)
├── textures/         → Kenney Retro Textures (grond, muren, daken, ramen)
├── sounds/           → geluiden uit het Kenney Starter Kit
├── images/           → portretten voor het startscherm
└── src/
    ├── main.js       → start alles op, game loop, gevechten, rusten, doodgaan
    ├── world.js      → de open wereld: grond, paden, dorp, ruïnes, arena's, dag en nacht
    ├── decor.js      → planten, stenen, wolken, vlaggen en dieren
    ├── player.js     → speler: bewegen, rollen, krachten, flesjes, personages
    ├── animator.js   → laat het poppetje bewegen (lopen, slaan, richten, drinken...)
    ├── mixamo.js     → vertaalt die bewegingen naar een Mixamo-skelet
    ├── character.js  → het Strohoed-poppetje uit simpele vormen
    ├── weapons.js    → alle wapens · gear.js → helmen
    ├── sword.js      → het wapen in de hand · trail.js → het zwaard-windje
    ├── projectiles.js→ kogels, pijlen, energie- en vuurballen
    ├── enemies.js    → vijanden en hun aanvallen · bosses.js → de vier bosses
    ├── sites.js      → Plekken van Genade, kisten, verloren munten
    ├── pickups.js    → munten, hartjes, diamanten
    ├── stats.js      → level, eigenschappen, krachten, opslaan
    ├── ui.js         → balken, menu's, banners, minimap
    ├── effects.js    → deeltjes, schokgolven, waarschuwingscirkels
    ├── audio.js      → geluiden · camera.js · input.js · assets.js
```

## Zelf aanpassen

- **Vijanden** → `ENEMY_TYPES` en `SPAWNS` bovenaan `src/enemies.js`
- **Wapens** → `WEAPONS` in `src/weapons.js` · **Helmen** → `HELMETS` in `src/gear.js`
- **Krachten en levelen** → `POWERS` en `levelCost` in `src/stats.js`
- **Wereld** → `GRACES`, `ARENAS`, `CHESTS` en `HOUSES` bovenaan `src/world.js`
- **Personages** → `CHARACTERS` bovenaan `src/player.js`
- **Opnieuw beginnen** → uitrusting (I) → *Nieuw spel beginnen*

## Credits

- Ridder, helmen, zwaarden, knots en zombie: [Quaternius](https://quaternius.com) — CC0
- Mini-Game Variety Pack (planten, stenen, dieren, boog, hart, diamant): [KayKit / Kay Lousberg](https://kaylousberg.com) — CC0
- Starter Kit 3D Platformer (munt, wolken, gras, vlaggen, robot, geluiden): [Kenney](https://kenney.nl) — MIT
- Retro Textures Fantasy: [Kenney](https://kenney.nl) — CC0
- Ultimate Guns Pack (geweren)
- Personages Eve, Soldaat en Mila: via Mixamo
- Budget Mario door Teh_LaughingMan, Buff man door joney_lol, MS Gundam RX-78-2 door Tipatat Chennavasin
  (fan-modellen; Mario en Gundam zijn van Nintendo en Bandai — alleen voor eigen plezier)

## Licentie

MIT — zie [LICENSE](LICENSE). Three.js valt onder zijn eigen MIT-licentie ([lib/THREE-LICENSE](lib/THREE-LICENSE)).
De gebruikte modellen en texturen vallen onder de licenties hierboven.
