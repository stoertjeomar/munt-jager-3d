import * as THREE from 'three';
import { loadGLB } from './assets.js';
import { clone as cloneSkinned } from 'three/addons/utils/SkeletonUtils.js';
import { CharacterAnimator } from './animator.js';
import { createMixamoRig } from './mixamo.js';
import { buildCharacter } from './character.js';
import { Sword } from './sword.js';
import { createHelmetMesh } from './gear.js';
import { LEVEL } from './levels.js';

// NPC's: personages die in de wereld wonen. Praat met ze (E) en ze geven je een zij-quest.
// Welke NPC waar staat, staat per level in levels.js (npcs = [personage, x, z, quest]).

const PEOPLE = {
  mila: { name: 'Mila', file: 'models/personages/mila.glb', height: 1.45 },
  strohoed: { name: 'Strohoed', file: null, height: 1.6 },
  robot: { name: 'Robot B-0P', file: 'models/robot.glb', height: 1.25 },
  ridder: { name: 'Sir Roestbout', file: 'models/speler.glb', height: 1.7, weapon: 'sword', helmet: 'ijzer' },
};

/**
 * De zij-quests. goal.kind = 'kill' (versla `count` vijanden van soort `type`) of 'collect' (raap `count` dingen op).
 * reward = munten en voorwerpen. De teksten: offer (als je de quest krijgt), busy (nog bezig), done (inleveren), after (daarna).
 */
export const QUESTS = {
  'mila-tuin': {
    title: 'Slijm in de moestuin',
    goal: { kind: 'kill', type: 'slijmpje', count: 6 },
    reward: { runes: 80, items: [{ kind: 'flask' }] },
    offer: ['Hé, jij daar! Ben jij een avonturier?', 'Die groene slijmpjes eten al mijn wortels op...', 'Versla er <b>6</b> voor me, dan krijg je een extra <b>flesje</b>!'],
    busy: 'Nog niet klaar? Ik hoor ze smakken in de tuin...',
    done: ['Je hebt ze echt verslagen! Mijn wortels zijn gered.', 'Hier, een extra flesje. Drink het met <b>R</b> als je pijn hebt.'],
    after: 'Pas op voor de vliegende loodgieter in het noorden. Hij gooit met vuur!',
  },
  'strohoed-sterren': {
    title: 'Vallende sterren',
    goal: { kind: 'collect', count: 4, item: 'star', label: 'sterren' },
    reward: { runes: 60, items: [{ kind: 'weapon', key: 'sword' }] },
    offer: ['Yo! Ik ben Strohoed, het allereerste poppetje van deze game.', 'Vannacht zijn er <b>4 sterren</b> uit de lucht gevallen, ergens in de weide.', 'Breng ze naar mij, dan geef ik je mijn oude <b>Ridderzwaard</b>!'],
    busy: 'Kijk goed rond, sterren glinsteren. Ze liggen vaak aan de rand van de weide.',
    done: ['Wauw, alle vier! Ze zijn nog warm.', 'Hier, mijn Ridderzwaard. Lang en sterk. Open je uitrusting met <b>I</b>.'],
    after: 'Ik ga lekker in het gras liggen en naar de sterren kijken.',
  },
  'robot-batterijen': {
    title: 'Lege batterij',
    goal: { kind: 'collect', count: 5, item: 'battery', label: 'batterijen' },
    reward: { runes: 150, items: [{ kind: 'weapon', key: 'shotgun' }] },
    offer: ['BIEP. BOEP. Batterij... bijna... leeg...', 'Ik heb mijn <b>5 reserve-batterijen</b> verloren in de ruïnes.', 'Breng ze terug en je krijgt mijn <b>Hagelgeweer</b>. BIEP.'],
    busy: 'Energie: 3 procent. Zoek... de groene... lampjes...',
    done: ['BATTERIJ VOL! Ik voel me als nieuw!', 'Alsjeblieft: mijn Hagelgeweer. Veel hagel, veel plezier. BOEP!'],
    after: 'Systeemcontrole: alles in orde. Bedankt, vriend.',
  },
  'ridder-zombies': {
    title: 'De ondode wacht',
    goal: { kind: 'kill', type: 'zombie', count: 6 },
    reward: { runes: 300, items: [{ kind: 'flask' }] },
    offer: ['Halt, reiziger. Ik ben Sir Roestbout, de laatste wachter van dit woud.', 'De doden zijn opgestaan. Mijn oude harnas is te roestig om ze te stoppen.', 'Versla <b>6 zombies</b>, en ik geef je mijn laatste <b>helende flesje</b>.'],
    busy: 'Hoor je dat gekreun? Er lopen er nog genoeg rond.',
    done: ['Het woud is weer een beetje stiller. Je bent dapper.', 'Neem dit flesje. En pas op voor mijn oude meester, De Gevallen Ridder...'],
    after: 'Ga. Het licht van de Genade zal je beschermen.',
  },
  'mila-mecha': {
    title: 'Metalen reuzen',
    goal: { kind: 'kill', type: 'mecha', count: 3 },
    reward: { runes: 600, items: [{ kind: 'flask' }] },
    offer: ['Jij weer! Ik ben je achterna gereisd, haha.', 'Hier in het hoogland lopen enorme <b>Mecha-Wachters</b> rond. Ze schieten met lasers!', 'Versla er <b>3</b>, dan krijg je <b>600 munten</b> en een flesje.'],
    busy: 'Rol opzij als hun ogen rood worden!',
    done: ['Drie mecha\'s! Jij bent echt de beste Munt Jager.', 'Hier, alles wat ik heb gespaard. Versla Gorath!'],
    after: 'Ik wacht hier op je. Succes bovenop de berg!',
  },
};

/** Kopie van een model; skeletten (Mixamo) hebben een speciale kopie nodig. */
function cloneModel(scene) {
  let skinned = false;
  scene.traverse((c) => (skinned ||= c.isSkinnedMesh));
  return skinned ? cloneSkinned(scene) : scene.clone(true);
}

/** Een tekstbordje boven het hoofd: "!" (nieuwe quest), "?" (inleveren) of "…" (bezig). */
function makeMarker() {
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = 64;
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: texture, transparent: true, depthWrite: false, toneMapped: false }));
  sprite.scale.set(0.7, 0.7, 1);
  sprite.renderOrder = 5;
  sprite.userData.draw = (text, color) => {
    const ctx = canvas.getContext('2d');
    ctx.clearRect(0, 0, 64, 64);
    if (text) {
      ctx.font = 'bold 54px system-ui, sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.lineWidth = 8;
      ctx.strokeStyle = 'rgba(0,0,0,0.8)';
      ctx.strokeText(text, 32, 34);
      ctx.fillStyle = color;
      ctx.fillText(text, 32, 34);
    }
    texture.needsUpdate = true;
  };
  return sprite;
}

class NPC {
  constructor(scene, [who, x, z, questId], colliders) {
    this.id = who;
    this.person = PEOPLE[who];
    this.name = this.person.name;
    this.questId = questId;
    this.mesh = new THREE.Group();
    this.mesh.position.set(x, 0, z);
    this.mesh.rotation.y = Math.random() * Math.PI * 2;
    this.inner = new THREE.Group();
    this.mesh.add(this.inner);
    this.marker = makeMarker();
    this.marker.position.y = this.person.height + 0.55;
    this.mesh.add(this.marker);
    this.markerText = null;
    this.rig = null;
    this.waving = 0;
    scene.add(this.mesh);
    // Je kunt niet door een NPC heen lopen (en vijanden ook niet)
    colliders.push(new THREE.Box3(new THREE.Vector3(x - 0.35, 0, z - 0.35), new THREE.Vector3(x + 0.35, this.person.height, z + 0.35)));
    this.load();
  }

  get position() {
    return this.mesh.position;
  }

  useRig(rig) {
    this.rig = rig;
    this.animator = new CharacterAnimator(rig);
    if (this.person.weapon) {
      this.sword = new Sword();
      this.sword.attachTo(rig.gripParent ?? rig.handR, rig.unit);
      this.sword.setWeapon(this.person.weapon);
    }
  }

  async load() {
    const height = this.person.height;
    if (!this.person.file) {
      const c = buildCharacter();
      this.inner.add(c.group);
      this.useRig(c.rig);
      return;
    }
    let gltf;
    try {
      gltf = await loadGLB(this.person.file);
    } catch {
      return;
    }
    const model = cloneModel(gltf.scene);
    model.updateMatrixWorld(true);
    const box = new THREE.Box3().setFromObject(model);
    const scale = height / box.getSize(new THREE.Vector3()).y;
    model.scale.setScalar(scale);
    model.updateMatrixWorld(true);
    box.setFromObject(model);
    const center = box.getCenter(new THREE.Vector3());
    model.position.set(-center.x, -box.min.y, -center.z);
    model.traverse((child) => {
      if (!child.isMesh) return;
      child.castShadow = true;
      child.receiveShadow = true;
      if (child.isSkinnedMesh) child.frustumCulled = false;
    });
    this.inner.add(model);
    this.mesh.updateMatrixWorld(true);

    const part = (name) => model.getObjectByName(name);
    let headSlot = null;
    if (part('Hips') && part('ArmL') && part('ArmR') && part('LegL') && part('LegR') && part('HandR')) {
      this.useRig({ hips: part('Hips'), armL: part('ArmL'), armR: part('ArmR'), legL: part('LegL'), legR: part('LegR'), handR: part('HandR'), unit: 1 / scale });
      headSlot = part('HeadSlot');
    } else {
      const rig = createMixamoRig(model);
      if (rig) {
        this.useRig(rig);
        headSlot = rig.headSlot;
      }
    }
    if (headSlot && this.person.helmet) headSlot.add(createHelmetMesh(this.person.helmet));
  }

  update(dt, time, playerPos, quests) {
    const to = playerPos.clone().sub(this.position).setY(0);
    const dist = to.length();
    // Naar de speler kijken als hij dichtbij is
    if (dist < 9) {
      let diff = Math.atan2(to.x, to.z) - this.mesh.rotation.y;
      diff = Math.atan2(Math.sin(diff), Math.cos(diff));
      this.mesh.rotation.y += diff * Math.min(1, 4 * dt);
    }
    // Teken boven het hoofd
    const state = quests.state(this.questId);
    const [text, color] = state === 'nieuw' ? ['!', '#ffd23a'] : state === 'klaar' ? ['?', '#ffd23a'] : state === 'actief' ? ['…', '#cfcfcf'] : [null, null];
    if (text !== this.markerText) {
      this.markerText = text;
      this.marker.userData.draw(text, color);
    }
    this.marker.position.y = this.person.height + 0.55 + Math.sin(time * 3) * 0.08;
    // Zwaaien als je in de buurt komt en hij een quest voor je heeft
    const wantWave = dist < 12 && dist > 2.5 && (state === 'nieuw' || state === 'klaar');
    if (this.rig && dist < 50) {
      this.animator.update(dt, { moving: false, onGround: true, attack: null, pickup: null, wave: wantWave });
      this.rig.apply?.();
    }
  }
}

/** Dingen om op te rapen voor een quest (sterren, batterijen). */
function buildQuestItem(kind, starModel) {
  if (kind === 'star' && starModel) {
    const m = starModel.scene.clone();
    m.scale.setScalar(0.9);
    m.traverse((c) => {
      if (c.isMesh) {
        c.material = c.material.clone();
        c.material.emissive = new THREE.Color(0xffc93a);
        c.material.emissiveIntensity = 0.8;
      }
    });
    return m;
  }
  // Batterij: groene cilinder met een knopje en een gloeiend lampje
  const g = new THREE.Group();
  const body = new THREE.Mesh(new THREE.CylinderGeometry(0.18, 0.18, 0.55, 16), new THREE.MeshStandardMaterial({ color: 0x2fd36a, emissive: 0x1a8f45, emissiveIntensity: 0.6, roughness: 0.4 }));
  const cap = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.07, 0.08, 12), new THREE.MeshStandardMaterial({ color: 0xdddddd, metalness: 0.6, roughness: 0.3 }));
  cap.position.y = 0.31;
  const band = new THREE.Mesh(new THREE.CylinderGeometry(0.185, 0.185, 0.14, 16), new THREE.MeshStandardMaterial({ color: 0x222222 }));
  band.position.y = -0.18;
  g.add(body, cap, band);
  g.traverse((c) => (c.castShadow = !!c.isMesh));
  return g;
}

export class NPCs {
  /**
   * @param {THREE.Scene} scene
   * @param {import('./stats.js').Stats} stats
   * @param {THREE.Box3[]} colliders
   */
  constructor(scene, stats, colliders) {
    this.scene = scene;
    this.stats = stats;
    this.list = LEVEL.npcs.map((def) => new NPC(scene, def, colliders));
    this.items = []; // quest-voorwerpen in de wereld
    loadGLB('models/kaykit/star.glb').catch(() => null).then((star) => {
      for (const [questId, spots] of Object.entries(LEVEL.questItems ?? {})) {
        spots.forEach(([x, z], i) => {
          const id = `${questId}-${i}`;
          const mesh = buildQuestItem(QUESTS[questId].goal.item, star);
          mesh.position.set(x, 0.8, z);
          mesh.visible = false;
          scene.add(mesh);
          this.items.push({ id, questId, mesh, x, z });
        });
      }
    });
  }

  /** Waar staat deze quest? 'nieuw' | 'actief' | 'klaar' (doel gehaald, nog inleveren) | 'beloond' */
  state(questId) {
    return this.stats.data.quests[questId]?.state ?? 'nieuw';
  }

  progress(questId) {
    const q = this.stats.data.quests[questId];
    return q ? q.count : 0;
  }

  /** Welke NPC staat er dichtbij genoeg om mee te praten? */
  nearby(pos) {
    return this.list.find((n) => Math.hypot(n.position.x - pos.x, n.position.z - pos.z) < 2.6 && pos.y < 1.5) ?? null;
  }

  /**
   * Praten met een NPC. Geeft { lines, reward } terug: de tekst die de NPC zegt, en eventueel een beloning.
   */
  talk(npc) {
    const id = npc.questId;
    const quest = QUESTS[id];
    const data = this.stats.data.quests;
    const state = this.state(id);
    if (state === 'nieuw') {
      data[id] = { state: 'actief', count: 0 };
      // Had je de voorwerpen al gevonden? Tel ze mee
      if (quest.goal.kind === 'collect') data[id].count = this.stats.data.questItems.filter((i) => i.startsWith(id)).length;
      this.checkDone(id);
      this.stats.save();
      return { lines: [...quest.offer, `<i>Nieuwe quest: ${quest.title}</i>`], started: quest };
    }
    if (state === 'actief') return { lines: [`${quest.busy} <small>(${this.progress(id)} / ${quest.goal.count})</small>`] };
    if (state === 'klaar') {
      data[id].state = 'beloond';
      this.stats.save();
      return { lines: quest.done, reward: quest.reward };
    }
    return { lines: [quest.after] };
  }

  checkDone(id) {
    const q = this.stats.data.quests[id];
    if (q && q.state === 'actief' && q.count >= QUESTS[id].goal.count) {
      q.state = 'klaar';
      return true;
    }
    return false;
  }

  /** Een vijand is verslagen: telt hij mee voor een quest? Geeft de quest terug die nu klaar is (of null). */
  onKill(typeKey) {
    let finished = null;
    for (const [id, q] of Object.entries(this.stats.data.quests)) {
      const quest = QUESTS[id];
      if (q.state !== 'actief' || quest?.goal.kind !== 'kill' || quest.goal.type !== typeKey) continue;
      q.count++;
      if (this.checkDone(id)) finished = quest;
    }
    return finished;
  }

  /** De quests die je nu doet, voor in beeld: [{ title, text }] */
  tracker() {
    return Object.entries(this.stats.data.quests)
      .filter(([id, q]) => QUESTS[id] && (q.state === 'actief' || q.state === 'klaar'))
      .map(([id, q]) => {
        const quest = QUESTS[id];
        const what = quest.goal.kind === 'kill' ? `${quest.goal.type === 'slijmpje' ? 'Slijmpjes' : quest.goal.type === 'zombie' ? 'Zombies' : 'Mecha-Wachters'} verslaan` : `${quest.goal.label} vinden`;
        return { title: quest.title, text: q.state === 'klaar' ? 'Ga terug om je beloning te halen!' : `${what}: ${Math.min(q.count, quest.goal.count)} / ${quest.goal.count}`, done: q.state === 'klaar' };
      });
  }

  /** Markeringen voor de minimap. */
  mapMarkers() {
    const marks = this.list.map((n) => {
      const s = this.state(n.questId);
      return { x: n.position.x, z: n.position.z, icon: s === 'nieuw' ? '!' : s === 'klaar' ? '?' : '●', color: s === 'beloond' || s === 'actief' ? '#cfcfcf' : '#ffd23a' };
    });
    for (const it of this.items) if (it.mesh.visible) marks.push({ x: it.x, z: it.z, icon: '★', color: '#ffe680' });
    return marks;
  }

  /**
   * Elke frame: NPC's laten bewegen, quest-voorwerpen laten draaien en oppakken.
   * Geeft { picked, finished } terug als je net iets opraapte.
   */
  update(dt, time, playerPos) {
    for (const n of this.list) n.update(dt, time, playerPos, this);
    let result = null;
    for (const it of this.items) {
      const active = this.state(it.questId) === 'actief' && !this.stats.data.questItems.includes(it.id);
      it.mesh.visible = active;
      if (!active) continue;
      it.mesh.rotation.y = time * 2;
      it.mesh.position.y = 0.8 + Math.sin(time * 3 + it.x) * 0.15;
      if (Math.hypot(playerPos.x - it.x, playerPos.z - it.z) < 1.3 && Math.abs(playerPos.y + 0.8 - it.mesh.position.y) < 2) {
        this.stats.data.questItems.push(it.id);
        const q = this.stats.data.quests[it.questId];
        q.count++;
        const finished = this.checkDone(it.questId) ? QUESTS[it.questId] : null;
        this.stats.save();
        result = { picked: it, quest: QUESTS[it.questId], count: q.count, finished };
      }
    }
    return result;
  }
}
