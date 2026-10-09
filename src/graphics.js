import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';
import { GTAOPass } from 'three/addons/postprocessing/GTAOPass.js';
import { FXAAShader } from 'three/addons/shaders/FXAAShader.js';

// Hoe de game getekend wordt: gladde randjes (anti-aliasing), gloed rond felle dingen, kleuren, schaduwen.
// G = mooier of sneller: kies wat je computer aankan. Je keuze wordt onthouden in de browser.
//   pixelRatio = hoe scherp (meer pixels = mooier maar trager), msaa = gladde randjes,
//   shadowSize/shadowHalf = hoe scherp de schaduwen zijn en hoe ver ze reiken (meter),
//   env = licht uit de lucht (glanzende dingen weerspiegelen de lucht), bloom = gloed,
//   ao = extra donker in hoekjes en onder dingen (zwaar!), grass/grassRadius = voor dicht gras rond de speler
export const QUALITY = {
  laag: { naam: 'Laag', pixelRatio: 1, msaa: 0, shadowSize: 1024, shadowHalf: 24, env: false, bloom: false, ao: false, grass: 0, grassRadius: 0 },
  normaal: { naam: 'Normaal', pixelRatio: 1.25, msaa: 4, shadowSize: 2048, shadowHalf: 30, env: true, bloom: true, ao: false, grass: 24000, grassRadius: 18 },
  hoog: { naam: 'Hoog', pixelRatio: 2, msaa: 4, shadowSize: 4096, shadowHalf: 34, env: true, bloom: true, ao: true, grass: 50000, grassRadius: 24 },
};
const ORDER = ['laag', 'normaal', 'hoog'];
const SAVE_KEY = 'munt-jager-3d-grafisch';

function loadQuality() {
  try {
    const key = localStorage.getItem(SAVE_KEY);
    return QUALITY[key] ? key : null;
  } catch {
    return null; // privé-venster of opslaan geblokkeerd: dan gewoon Normaal
  }
}

function saveQuality(key) {
  try {
    localStorage.setItem(SAVE_KEY, key);
  } catch {
    // niet erg: dan onthouden we het niet
  }
}

// Kleuren net wat levendiger, koele schaduwen en warm licht, een zachte donkere rand (vignet)
// en een gloed als je in de zon kijkt. 's Nachts: minder contrast en zwart wordt donkerblauw,
// zodat je in het donker nog dingen ziet (net als echte ogen die aan het donker wennen).
const GRADE_SHADER = {
  uniforms: {
    tDiffuse: { value: null },
    night: { value: 0 }, // 0 = dag, 1 = nacht
    sunUv: { value: new THREE.Vector2(0.5, 2) }, // waar de zon op het scherm staat
    sunGlare: { value: 0 }, // hoe sterk de zon-gloed is (0 = geen zon in beeld)
    aspect: { value: 1 },
  },
  vertexShader: `varying vec2 vUv; void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
  fragmentShader: `uniform sampler2D tDiffuse; uniform float night; uniform vec2 sunUv; uniform float sunGlare; uniform float aspect; varying vec2 vUv;
    void main() {
      vec3 c = texture2D(tDiffuse, vUv).rgb;
      float l = dot(c, vec3(0.2126, 0.7152, 0.0722));
      c = mix(vec3(l), c, mix(1.1, 0.85, night));                                    // verzadiging ('s nachts minder: in het donker zie je minder kleur)
      c = mix(c, mix(c, c * vec3(1.04, 1.0, 0.95), smoothstep(0.2, 0.7, l)), 1.0 - night); // licht is net wat warmer
      c *= mix(vec3(1.0), vec3(0.97, 1.0, 1.06), night);                                // 's nachts een tikje blauwer
      c = (c - 0.5) * mix(1.06, 1.0, night) + 0.5;                                      // contrast ('s nachts niet: dat maakt donker nog donkerder)
      c += vec3(0.012, 0.018, 0.036) * night * (1.0 - c);                               // 's nachts wordt zwart donkerblauw
      // Zon-gloed: alleen als de zon echt te zien is (niet achter een boom of huis)
      vec2 dd = (vUv - sunUv) * vec2(aspect, 1.0);
      float vis = smoothstep(0.85, 0.98, dot(texture2D(tDiffuse, clamp(sunUv, 0.001, 0.999)).rgb, vec3(0.333)));
      c += vec3(1.0, 0.85, 0.6) * pow(max(0.0, 1.0 - length(dd) / 0.7), 3.0) * 0.22 * sunGlare * vis;
      vec2 d = vUv - 0.5;
      c *= 1.0 - smoothstep(0.4, 0.95, length(d * vec2(1.2, 1.0))) * mix(0.28, 0.16, night); // vignet ('s nachts zachter)
      gl_FragColor = vec4(clamp(c, 0.0, 1.0), 1.0);
    }`,
};

/**
 * Zet de nabewerking op (gloed, kleuren, anti-aliasing) en de kwaliteits-standen.
 * @returns {{ composer, bloom, grade, apply, cycle, render, measure, onChange, key, preset }}
 */
export function createGraphics({ renderer, scene, camera, world, ui }) {
  // "Neutral" kleuren: de lucht blijft blauw en het gras groen (de oude stand maakte alles wat grijs-wit)
  renderer.toneMapping = THREE.NeutralToneMapping;
  renderer.toneMappingExposure = world.exposure ?? 1;
  world.initEnvironment?.(renderer);

  const composer = new EffectComposer(renderer);
  composer.addPass(new RenderPass(scene, camera));
  // Felle dingen (vuur, lampen, de zon, zwaard-windjes) krijgen een zachte gloed
  const bloom = new UnrealBloomPass(new THREE.Vector2(window.innerWidth / 2, window.innerHeight / 2), 0.35, 0.5, 0.92);
  composer.addPass(bloom);
  composer.addPass(new OutputPass());
  // Goedkope gladde randjes voor Laag (de andere standen gebruiken MSAA, dat is mooier)
  const fxaa = new ShaderPass(FXAAShader);
  composer.addPass(fxaa);
  const grade = new ShaderPass(GRADE_SHADER);
  composer.addPass(grade);

  let gtao = null; // ambient occlusion (alleen op Hoog), wordt pas gemaakt als je hem nodig hebt
  const listeners = [];
  let key = 'normaal';
  // Nog nooit gekozen? Dan kijken we in de eerste seconden of de computer het bijhoudt.
  let speedCheck = loadQuality() ? null : { wait: 1.5, time: 0, frames: 0 };

  function createGTAO() {
    const size = renderer.getDrawingBufferSize(new THREE.Vector2());
    gtao = new GTAOPass(scene, camera, Math.round(size.x / 2), Math.round(size.y / 2));
    gtao.updateGtaoMaterial({ radius: 1.2, distanceExponent: 1.5, thickness: 1.5, scale: 1, samples: 12, distanceFallOff: 1, screenSpaceRadius: false });
    gtao.updatePdMaterial({ lumaPhi: 10, depthPhi: 2, normalPhi: 3, radius: 6, rings: 2, samples: 8 });
    gtao.blendIntensity = 1;
    // Op halve grootte rekenen: scheelt veel werk en je ziet het verschil bijna niet
    const baseSetSize = gtao.setSize.bind(gtao);
    gtao.setSize = (w, h) => baseSetSize(Math.max(1, Math.round(w / 2)), Math.max(1, Math.round(h / 2)));
    // Doorzichtige dingen (lucht, gloed, slijm, sprites, gras) doen niet mee, anders krijgen ze rare donkere randen
    const baseHide = gtao.overrideVisibility.bind(gtao);
    gtao.overrideVisibility = function () {
      baseHide();
      this.scene.traverse((o) => {
        const m = o.material;
        if (o.isSprite || o.userData.noAO || (m && (Array.isArray(m) || m.transparent || m.depthWrite === false || m.isShaderMaterial))) o.visible = false;
      });
    };
    composer.insertPass(gtao, 1); // na het tekenen van de wereld, voor de gloed
  }

  /** Alles weer passend maken bij de grootte van het venster. */
  function resize() {
    const w = window.innerWidth;
    const h = window.innerHeight;
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
    renderer.setSize(w, h);
    composer.setSize(w, h);
    const pr = renderer.getPixelRatio();
    fxaa.material.uniforms.resolution.value.set(1 / (w * pr), 1 / (h * pr));
  }
  window.addEventListener('resize', resize);

  /** Een kwaliteits-stand aanzetten. */
  function apply(newKey) {
    key = QUALITY[newKey] ? newKey : 'normaal';
    const p = QUALITY[key];
    const pr = Math.min(window.devicePixelRatio || 1, p.pixelRatio);
    renderer.setPixelRatio(pr);
    composer.setPixelRatio(pr);
    // Gladde randjes: MSAA op de beelden waar de wereld in getekend wordt (anders doet "antialias" niks na de nabewerking)
    // (kan de videokaart het niet, dan valt hij terug op FXAA: ook gladde randjes, maar iets vager)
    const msaaOk = renderer.extensions.has('EXT_color_buffer_float');
    const samples = msaaOk ? Math.min(p.msaa, renderer.capabilities.maxSamples ?? 0) : 0;
    for (const rt of [composer.renderTarget1, composer.renderTarget2]) {
      if (rt.samples === samples) continue;
      rt.samples = samples;
      rt.dispose(); // wordt bij de volgende frame opnieuw gemaakt
    }
    fxaa.enabled = samples === 0;
    bloom.enabled = p.bloom;
    world.setShadowQuality?.(p.shadowSize, p.shadowHalf);
    world.setEnvironment?.(p.env);
    if (p.ao && !gtao) createGTAO();
    if (gtao) gtao.enabled = p.ao;
    resize();
    const nameEl = document.getElementById('gfx-name');
    if (nameEl) nameEl.textContent = p.naam;
    for (const fn of listeners) fn(p, key);
  }

  /** Volgende stand (G): Laag → Normaal → Hoog → Laag ... */
  function cycle() {
    const next = ORDER[(ORDER.indexOf(key) + 1) % ORDER.length];
    set(next);
    ui?.toast(`🎨 Graphics: <b>${QUALITY[next].naam}</b><br><small>Druk G om te wisselen</small>`, 2);
  }

  /** Een stand kiezen en onthouden. */
  function set(newKey) {
    speedCheck = null; // zelf gekozen: niet meer automatisch omlaag
    saveQuality(newKey);
    apply(newKey);
  }

  /**
   * Elke frame: hoe lang duurde deze frame? Als je nog nooit zelf een stand koos en de computer
   * het in de eerste seconden niet bijhoudt (minder dan 25 beelden per seconde), gaan we één stand omlaag.
   */
  function measure(frameTime, playing) {
    if (!speedCheck || !playing || frameTime > 0.5) return; // tab even weg geweest: telt niet
    if (speedCheck.wait > 0) {
      speedCheck.wait -= frameTime; // de eerste anderhalve seconde overslaan (dan wordt er nog van alles klaargezet)
      return;
    }
    speedCheck.time += frameTime;
    speedCheck.frames++;
    if (speedCheck.time < 5) return;
    const average = speedCheck.time / speedCheck.frames;
    speedCheck = null;
    const index = ORDER.indexOf(key);
    if (average > 0.04 && index > 0) {
      set(ORDER[index - 1]);
      ui?.toast(`Je computer is wat langzaam: graphics op <b>${QUALITY[key].naam}</b> gezet<br><small>Druk G om te wisselen</small>`, 4);
    }
  }

  const sunScreen = new THREE.Vector3();

  /** De wereld tekenen (met alle nabewerking). */
  function render() {
    // 's Nachts wat feller: je ogen wennen aan het donker. (world.gloom < 1 = alles donkerder: het Knekelhof van Rames)
    renderer.toneMappingExposure = (world.exposure ?? 1) * (world.gloom ?? 1);
    const night = world.night ?? 0;
    grade.uniforms.night.value = night;
    // Waar staat de zon op het scherm? Daar komt een warme gloed (niet bij de maan)
    grade.uniforms.aspect.value = camera.aspect;
    let glare = 0;
    if (world.sunDir && !world.isMoon) {
      sunScreen.copy(world.sunDir).multiplyScalar(150).add(camera.position).project(camera);
      grade.uniforms.sunUv.value.set(sunScreen.x * 0.5 + 0.5, sunScreen.y * 0.5 + 0.5);
      if (sunScreen.z < 1 && Math.abs(sunScreen.x) < 1.4 && Math.abs(sunScreen.y) < 1.4) glare = 1 - night;
    }
    grade.uniforms.sunGlare.value = glare;
    composer.render();
  }

  apply(loadQuality() ?? 'normaal');

  return {
    composer,
    bloom,
    grade,
    get gtao() {
      return gtao;
    },
    /** De naam van de huidige stand ('laag', 'normaal' of 'hoog'). */
    get key() {
      return key;
    },
    /** De instellingen van de huidige stand (bijvoorbeeld preset.grass voor gras). */
    get preset() {
      return QUALITY[key];
    },
    /** Laat een functie weten als de stand verandert: fn(preset, key). Hij wordt meteen ook één keer aangeroepen. */
    onChange(fn) {
      listeners.push(fn);
      fn(QUALITY[key], key);
    },
    apply,
    set,
    cycle,
    measure,
    render,
    resize,
  };
}
