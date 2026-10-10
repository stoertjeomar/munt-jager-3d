// Snel de blokken (bomen, muren, stenen, huizen) vinden die vlak bij iets staan.
// De wereld heeft duizenden blokken. Vroeger keek iedereen (jij, Claude, je huisdier, elke vijand, de camera)
// elke frame naar ál die blokken, ook die aan de andere kant van de wereld. Dat maakte het spel traag.
// Nu verdelen we de wereld in vakjes van 8 x 8 meter en onthouden we per vakje welke blokken erin staan:
// dan hoef je alleen de vakjes om je heen te bekijken.

const CELL = 8; // meter per vakje
const BIG = 64; // blokken die over meer dan zoveel vakjes liggen (een lange muur) bekijken we altijd
const grids = new WeakMap(); // lijst met blokken → { count, cells, big }
let stamp = 0; // om te zorgen dat een blok dat in meer vakjes ligt maar één keer in de lijst komt

const key = (cx, cz) => cx * 100003 + cz;

/** Het rooster voor deze lijst blokken (opnieuw gemaakt als er blokken bij zijn gekomen). */
function gridOf(colliders) {
  let g = grids.get(colliders);
  if (g && g.count === colliders.length) return g;
  g = { count: colliders.length, cells: new Map(), big: [] };
  for (const box of colliders) {
    if (box.isEmpty()) continue;
    const x0 = Math.floor(box.min.x / CELL);
    const x1 = Math.floor(box.max.x / CELL);
    const z0 = Math.floor(box.min.z / CELL);
    const z1 = Math.floor(box.max.z / CELL);
    if ((x1 - x0 + 1) * (z1 - z0 + 1) > BIG) {
      g.big.push(box);
      continue;
    }
    for (let cx = x0; cx <= x1; cx++) {
      for (let cz = z0; cz <= z1; cz++) {
        const k = key(cx, cz);
        let list = g.cells.get(k);
        if (!list) g.cells.set(k, (list = []));
        list.push(box);
      }
    }
  }
  grids.set(colliders, g);
  return g;
}

/**
 * De blokken in de buurt van (x, z), binnen r meter (alleen om doorheen te lopen: verander de lijst niet).
 * Meestal is dat `out` (een lijst die je steeds opnieuw mag gebruiken). Een korte lijst (al gefilterd,
 * of een klein level) geven we gewoon zelf terug: daar is niks te winnen.
 */
export function collidersNear(colliders, x, z, r, out = []) {
  if (!colliders || colliders.length <= 64) return colliders ?? out;
  out.length = 0;
  const g = gridOf(colliders);
  const s = ++stamp;
  const x0 = Math.floor((x - r) / CELL);
  const x1 = Math.floor((x + r) / CELL);
  const z0 = Math.floor((z - r) / CELL);
  const z1 = Math.floor((z + r) / CELL);
  for (let cx = x0; cx <= x1; cx++) {
    for (let cz = z0; cz <= z1; cz++) {
      const list = g.cells.get(key(cx, cz));
      if (!list) continue;
      for (const b of list) {
        if (b._near === s) continue;
        b._near = s;
        out.push(b);
      }
    }
  }
  for (const b of g.big) out.push(b);
  return out;
}
