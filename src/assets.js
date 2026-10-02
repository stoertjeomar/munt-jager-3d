import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';

// Laadt 3D-modellen (.glb) en onthoudt ze, zodat elk bestand maar één keer gedownload wordt.
const loader = new GLTFLoader();
const cache = {};

/** Geeft een Promise met het geladen model (gltf). */
export function loadGLB(url) {
  cache[url] ??= loader.loadAsync(url);
  return cache[url];
}
