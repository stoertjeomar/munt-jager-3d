import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';

// Laadt 3D-modellen (.glb) en onthoudt ze, zodat elk bestand maar één keer gedownload wordt.
const loader = new GLTFLoader();
const cache = {};
let busy = 0; // zoveel modellen zijn nog aan het laden

/** Geeft een Promise met het geladen model (gltf). */
export function loadGLB(url) {
  if (!cache[url]) {
    busy++;
    cache[url] = loader.loadAsync(url);
    cache[url].finally(() => busy--).catch(() => {});
  }
  return cache[url];
}

/** Hoeveel modellen zijn er nog aan het laden? (0 = alles is binnen) */
export function modelsLoading() {
  return busy;
}
