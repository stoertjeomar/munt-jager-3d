import { POWERS, PERKS, SHOP_ITEMS, STAR_ITEMS } from './stats.js';
import { TROPHIES, TROPHY_STARS, rankOf } from './goals.js';
import { DRAGON_SKINS } from './dragon.js';
import { WEAPONS } from './weapons.js';
import { HELMETS, itemInfo, itemColor } from './gear.js';
import { BOUNDS, CHECKPOINTS, ARENAS } from './world.js';
import { LEVEL, WORLD, REGIONS, regionOfCheckpoint, regionIndexAt } from './levels.js';
import { play, talk } from './audio.js';

// Alles wat je op het scherm ziet (behalve de 3D-wereld): balken, munten, menu's, banners, de minimap en de wereldkaart.

const $ = (id) => document.getElementById(id);

// Plaatjes en korte toetsen voor de krachtenbalk (linksonder)
const POWER_ICONS = {
  dash: { icon: '💨', key: 'C' },
  doubleJump: { icon: '🦘', key: '␣²' },
  spin: { icon: '🌀', key: 'V' },
  slam: { icon: '💥', key: 'F↓' },
  fire: { icon: '🔥', key: 'X' },
};
// Wat je met elk soort wapen ziet in je uitrusting
const WEAPON_ICONS = { club: '🏏', bijl: '🪓', hamer: '🔨', dolk: '🗡', zeis: '☠' };
const weaponIcon = (key) => WEAPON_ICONS[key] ?? '⚔';

/** De knoppen voor het oefenduel tegen Claude: alle niveaus (dicht 🔒 tot je het niveau ervoor hebt gewonnen). */
function buddyDuelRow(levels) {
  return `<div class="bet-row duel-levels">` + levels.map((l) => l.open
    ? `<button data-buddy="${l.key}">${l.icon} ${l.name}<br><small>● ${l.reward}${l.wins ? ` · ✔ ${l.wins}×` : ''}</small></button>`
    : `<button disabled title="Win eerst het niveau ervoor">🔒 ${l.name}<br><small>● ${l.reward}</small></button>`).join('') + `</div>`;
}

// Alleen iets in de balken veranderen als het echt anders is. Anders moet de browser elke frame
// alle knoppen en balken opnieuw opmeten en tekenen, en dat maakt het spel trager.
function setText(el, text) {
  text = String(text);
  if (el._text === text) return;
  el._text = text;
  el.textContent = text;
}
function setHTML(el, html) {
  if (el._html === html) return;
  el._html = html;
  el.innerHTML = html;
}
function setStyle(el, prop, value) {
  const key = `_${prop}`;
  if (el[key] === value) return;
  el[key] = value;
  if (prop.startsWith('--')) el.style.setProperty(prop, value);
  else el.style[prop] = value;
}

// Kleur van elk soort gebied op de kaart
const MAP_COLORS = { weide: '#4f8f4e', woud: '#2c4f2c', hoogland: '#7c776a', schaduw: '#3a2448', kasteel: '#3a2348' };

/**
 * De grond, de paden, de huizen en de arena's tekenen (voor de minimap en de grote wereldkaart).
 * toMap(x, z) = waar komt een punt uit de wereld op de kaart; scale = pixels per meter.
 */
function drawLand(ctx, toMap, scale, bosses) {
  // Elk gebied in zijn eigen kleur (in het kasteel is er maar één "gebied")
  const areas = LEVEL.regions ? REGIONS.map((r) => [r.x0, r.x1, r.tint ? '#5c8f45' : MAP_COLORS[r.theme]]) : [[-BOUNDS.x, BOUNDS.x, MAP_COLORS[LEVEL.theme]]];
  for (const [x0, x1, color] of areas) {
    const [bx, by] = toMap(x0, -BOUNDS.z);
    ctx.fillStyle = color;
    ctx.fillRect(bx, by, (x1 - x0) * scale, BOUNDS.z * 2 * scale);
  }
  ctx.strokeStyle = '#c8b58a';
  ctx.lineWidth = Math.max(2, 3.5 * scale);
  ctx.lineJoin = ctx.lineCap = 'round';
  for (const path of LEVEL.paths ?? [LEVEL.path]) {
    ctx.beginPath();
    path.forEach(([x, z], i) => (i ? ctx.lineTo(...toMap(x, z)) : ctx.moveTo(...toMap(x, z))));
    ctx.stroke();
  }
  ctx.lineWidth = 2;
  // Huizen als bruine blokjes
  ctx.fillStyle = '#8a5a3a';
  for (const [hx, hz, w, d] of LEVEL.houses ?? []) {
    const [mx, my] = toMap(hx - w / 2, hz - d / 2);
    ctx.fillRect(mx, my, w * scale, d * scale);
  }
  // Arena's (doodshoofd, of een vinkje als je die boss al versloeg; bij Omar een paarse kroon, het Knekelhof een paars kruis)
  for (const a of ARENAS) {
    const [mx, my] = toMap(a.center.x, a.center.z);
    const beaten = bosses.includes(a.id);
    const grave = a.kind === 'kerkhof';
    ctx.fillStyle = a.id === 'omar' || (grave && !beaten) ? '#c77dff' : beaten ? '#8dff9a' : '#ff5a5a';
    ctx.fillText(a.id === 'omar' ? '♛' : beaten ? '✔' : grave ? '✝' : '☠', mx, my);
  }
}

export class UI {
  constructor(stats) {
    this.stats = stats;
    // Klikje bij elke knop in een menu
    document.getElementById('menu')?.addEventListener('pointerdown', (e) => {
      if (e.target.closest('button')) play('click');
    });
    this.el = {
      hpFill: $('hp-fill'), hpLag: $('hp-lag'), hpText: $('hp-text'),
      stFill: $('st-fill'), level: $('level'), xpFill: $('xp-fill'),
      runes: $('runes'), runesGain: $('runes-gain'),
      flasks: $('flasks'), weapon: $('equip-weapon'), helmet: $('equip-helmet'),
      powers: $('powers'), prompt: $('prompt'),
      boss: $('boss'), bossName: $('boss-name'), bossFill: $('boss-fill'), bossLag: $('boss-lag'),
      banner: $('banner'), bannerText: $('banner-text'), bannerSub: $('banner-sub'),
      toast: $('toast'), region: $('region'),
      menu: $('menu'), menuTitle: $('menu-title'), menuBody: $('menu-body'),
      lockHint: $('lock-hint'),
      minimap: $('minimap'),
      quests: $('quests'),
      dialog: $('dialog'), dialogName: $('dialog-name'), dialogText: $('dialog-text'),
    };
    this.questsHtml = '';
    this.markers = [];
    this.hpLag = 1;
    this.bossLag = 1;
    this.menuOpen = null;
    this.bannerTimer = 0;
    this.toastTimer = 0;
    this.runesGainTimer = 0;
    this.runesGainAmount = 0;
    this.regionTimer = 0;
    this.currentRegion = null;
    this.mapCtx = this.el.minimap.getContext('2d');
    this.mapScale = this.el.minimap.width / 180; // scherpe minimap (2× zoveel pixels)
    this.night = 0;
    this.slotKeys = '';
    this.lastLevel = null;
    this.lastCooldown = {};
  }

  /** Een menu openen (met titel). wide = breed paneel (kaart, uitrusting). */
  showMenu(kind, title, wide = false) {
    this.menuOpen = kind;
    play('menuOpen');
    this.el.menu.classList.remove('hidden');
    this.el.menuTitle.textContent = title;
    $('menu-panel').classList.toggle('wide', wide);
    $('menu-panel').scrollTop = 0;
  }

  // ---------- HUD elke frame ----------

  update(dt, player, boss, time) {
    const hp = player.health / player.maxHealth;
    // De "lag"-balk zakt langzaam na: zo zie je hoeveel schade je kreeg
    this.hpLag = Math.max(hp, this.hpLag - dt * 0.4);
    setStyle(this.el.hpFill, 'width', `${(hp * 100).toFixed(1)}%`);
    setStyle(this.el.hpLag, 'width', `${(this.hpLag * 100).toFixed(1)}%`);
    setText(this.el.hpText, `${Math.ceil(player.health)} / ${player.maxHealth}`);
    setStyle($('hp-bar'), 'width', `${Math.min(40, 14 + player.maxHealth / 14)}vw`);
    $('hp-bar').classList.toggle('low', hp < 0.3 && player.health > 0);
    setStyle(this.el.stFill, 'width', `${((player.stamina / player.maxStamina) * 100).toFixed(1)}%`);
    setStyle($('st-bar'), 'width', `${Math.min(34, 10 + player.maxStamina / 12)}vw`);
    $('st-bar').classList.toggle('tired', player.stamina < 15);
    // Level: rondje met het getal (springt even op als je een level omhoog gaat)
    const lvl = this.stats.level;
    if (lvl !== this.lastLevel) {
      $('level-num').textContent = lvl;
      if (this.lastLevel !== null) {
        $('level-badge').classList.remove('up');
        void $('level-badge').offsetWidth;
        $('level-badge').classList.add('up');
      }
      this.lastLevel = lvl;
    }
    setHTML(this.el.level, `${rankOf(this.stats.data)} · <b>${this.stats.xp}</b> / ${this.stats.xpNeeded} tot level ${lvl + 1}`);
    setStyle(this.el.xpFill, 'width', `${((this.stats.xp / this.stats.xpNeeded) * 100).toFixed(1)}%`);
    if (this.lastRunes !== this.stats.runes) {
      this.lastRunes = this.stats.runes;
      setText(this.el.runes, this.stats.runes.toLocaleString('nl-NL'));
    }
    setText($('stars-count'), this.stats.data.stars ?? 0);
    const wKey = player.sword.weaponKey;
    setHTML(this.el.weapon, `${weaponIcon(wKey)} ${WEAPONS[wKey].name}${player.fireTimer > 0 ? ' 🔥' : ''}${player.boost ? ` <span style="color:#9be7ff">🌬 ${Math.ceil(player.boost.t)}s</span>` : ''}`);
    setStyle(this.el.weapon, 'color', itemColor({ kind: 'weapon', key: wKey }));
    this.el.weapon.classList.toggle('fire', player.fireTimer > 0);
    setText(this.el.helmet, player.helmetKey && player.helmetKey !== 'geen' ? `⛑ ${HELMETS[player.helmetKey].name}` : '');
    this.updateHotbar(player);

    // Munten erbij: "+14" naast je teller
    if (this.runesGainTimer > 0) {
      this.runesGainTimer -= dt;
      setText(this.el.runesGain, `+${this.runesGainAmount}`);
      setStyle(this.el.runesGain, 'opacity', Math.min(1, this.runesGainTimer * 2).toFixed(2));
      if (this.runesGainTimer <= 0) this.runesGainAmount = 0;
    }

    // Boss-balk
    if (boss) {
      this.el.boss.classList.remove('hidden');
      // Een boss kan een eigen naam en stijl voor de balk hebben (Sky: barName en barStyle 'elden', zie skyFighter.js)
      const name = boss.barName ?? boss.name;
      if (this.el.bossName.textContent !== name) this.el.bossName.textContent = name;
      if (this.el.boss.className !== (boss.barStyle ?? '')) this.el.boss.className = boss.barStyle ?? '';
      const b = boss.hp / (boss.maxHp ?? boss.info.hp);
      this.bossLag = Math.max(b, this.bossLag - dt * 0.3);
      setStyle(this.el.bossFill, 'width', `${(b * 100).toFixed(1)}%`);
      setStyle(this.el.bossLag, 'width', `${(this.bossLag * 100).toFixed(1)}%`);
    } else {
      if (!this.el.boss.classList.contains('hidden')) this.el.boss.classList.add('hidden');
      this.bossLag = 1;
    }

    // Banners en meldingen vervagen
    if (this.bannerTimer > 0) {
      this.bannerTimer -= dt;
      this.el.banner.style.opacity = Math.min(1, this.bannerTimer, (this.bannerDuration - this.bannerTimer) * 2);
      if (this.bannerTimer <= 0) this.el.banner.classList.add('hidden');
    }
    if (this.toastTimer > 0) {
      this.toastTimer -= dt;
      this.el.toast.style.opacity = Math.min(1, this.toastTimer);
      if (this.toastTimer <= 0) this.el.toast.classList.add('hidden');
    }
    if (this.regionTimer > 0) {
      this.regionTimer -= dt;
      this.el.region.style.opacity = Math.min(1, this.regionTimer, (4 - this.regionTimer) * 2);
    }

    // De minimap 30 keer per seconde tekenen is genoeg (scheelt werk)
    this.mapT = (this.mapT ?? 0) + dt;
    if (this.mapT >= 1 / 30 || dt === 0) {
      this.mapT = 0;
      this.drawMinimap(player, time);
    }
  }

  /** De krachtenbalk: flesjes en krachten, met een taartpunt die laat zien hoe lang je nog moet wachten. */
  updateHotbar(player) {
    const unlocked = this.stats.unlockedPowers();
    const keys = unlocked.join(',');
    if (keys !== this.slotKeys) {
      this.slotKeys = keys;
      this.el.powers.innerHTML = unlocked.map((key) => {
        const p = POWERS[key];
        const look = POWER_ICONS[key] ?? { icon: '✦', key: p.key };
        return `<div class="slot" data-power="${key}" title="${p.name}: ${p.info}"><span class="key">${look.key}</span><span class="ic">${look.icon}</span><span class="nm">${p.name}</span><span class="cd"></span></div>`;
      }).join('');
      this.slotEls = Object.fromEntries([...this.el.powers.children].map((el) => [el.dataset.power, el]));
      this.el.flasks.innerHTML = '<span class="key">R</span><span class="ic">🧪</span><span class="nm">Flesje</span><span class="count"></span>';
    }
    // Flesjes
    setText(this.el.flasks.querySelector('.count'), `${player.flasks}/${this.stats.flasksMax}`);
    this.el.flasks.classList.toggle('empty', player.flasks <= 0);
    this.el.flasks.classList.toggle('ready', player.flasks > 0);
    // Krachten
    const cooldowns = {
      dash: [player.dashCooldown, POWERS.dash.cooldown],
      spin: [player.spinCooldown, POWERS.spin.cooldown],
      fire: player.fireTimer > 0 ? [0, 1] : [player.fireCooldown, POWERS.fire.cooldown],
    };
    for (const [key, el] of Object.entries(this.slotEls ?? {})) {
      const [cd, max] = cooldowns[key] ?? [0, 1];
      const active = key === 'fire' && player.fireTimer > 0;
      setStyle(el, '--cd', (active ? 1 - player.fireTimer / POWERS.fire.duration : cd > 0 ? cd / max : 0).toFixed(3));
      setText(el.querySelector('.cd'), cd > 0 ? (cd >= 1 ? Math.ceil(cd) : cd.toFixed(1)) : active ? Math.ceil(player.fireTimer) : '');
      el.classList.toggle('active', active);
      el.classList.toggle('ready', cd <= 0 && !active);
      el.classList.toggle('nostamina', player.stamina < (POWERS[key].stamina ?? 0));
      // Net weer klaar? Even oplichten
      if (cd <= 0 && (this.lastCooldown[key] ?? 0) > 0) {
        el.classList.remove('flash');
        void el.offsetWidth;
        el.classList.add('flash');
      }
      this.lastCooldown[key] = cd;
    }
  }

  addRunes(amount) {
    this.runesGainAmount += amount;
    this.runesGainTimer = 2;
  }

  /** Tekstje onderin (bijv. "E Praat met Mila"). kind = 'ride': klein, helemaal onderin (op de draak). */
  prompt(text, kind = '') {
    this.el.prompt.classList.toggle('hidden', !text);
    this.el.prompt.classList.toggle('ride', kind === 'ride');
    if (text && this.el.prompt.innerHTML !== text) this.el.prompt.innerHTML = text;
  }

  /** Grote tekst in het midden. kind: 'gold' | 'death' | 'power' */
  banner(text, sub = '', kind = 'gold', duration = 3.5) {
    this.el.banner.className = `banner-${kind}`;
    this.el.bannerText.textContent = text;
    this.el.bannerSub.textContent = sub;
    this.bannerTimer = this.bannerDuration = duration;
  }

  toast(html, duration = 3) {
    this.el.toast.classList.remove('hidden');
    this.el.toast.innerHTML = html;
    this.toastTimer = duration;
  }

  /** Laat de naam van het gebied zien als je een nieuw gebied binnenloopt. */
  showRegion(name) {
    this.el.region.textContent = name;
    this.regionTimer = 4;
  }

  // ---------- Quests en gesprekken ----------

  /** Lijstje met je quests (rechts onder de minimap). */
  setQuests(list) {
    const html = list.map((q) => `<div class="quest ${q.done ? 'done' : ''}"><b>${q.done ? '✔' : '◆'} ${q.title}</b><small>${q.text}</small></div>`).join('');
    if (html === this.questsHtml) return;
    this.questsHtml = html;
    this.el.quests.innerHTML = html;
  }

  /** Een gesprek met een NPC: tekstwolkje onderin. E, Spatie of klikken = verder. */
  openDialog(name, lines, onDone) {
    this.menuOpen = 'dialog';
    this.dialog = { lines, index: 0, onDone };
    this.el.dialog.classList.remove('hidden');
    this.el.dialogName.textContent = name;
    this.el.dialogText.innerHTML = lines[0];
    talk(name, lines[0]); // praatgeluidjes
  }

  advanceDialog() {
    const d = this.dialog;
    if (!d) return;
    d.index++;
    if (d.index < d.lines.length) {
      this.el.dialogText.innerHTML = d.lines[d.index];
      talk(this.el.dialogName.textContent, d.lines[d.index]);
      return;
    }
    this.dialog = null;
    this.menuOpen = null;
    this.el.dialog.classList.add('hidden');
    d.onDone?.();
  }

  /** Scherm aan het eind van een level. buttons = [[tekst, functie], ...] */
  openLevelComplete(title, html, buttons) {
    this.showMenu('level', title);
    this.el.menuBody.innerHTML = `<div class="level-done">${html}</div>` + buttons.map(([text], i) => `<button data-i="${i}">${text}</button>`).join('');
    this.el.menuBody.onclick = (e) => {
      const b = e.target.closest('button');
      if (b) buttons[Number(b.dataset.i)][1]();
    };
  }

  // ---------- Menu's ----------

  closeMenu() {
    if (this.menuOpen && this.menuOpen !== 'dialog') play('menuClose');
    this.menuOpen = null;
    this.el.menu.classList.add('hidden');
  }

  /** De winkel van de koopman: munten uitgeven. actions = { buy(key), close() } */
  openShop(name, actions) {
    this.showMenu('shop', name);
    const render = () => {
      const st = this.stats;
      // Eén rij in de winkel (munten ● of sterren ⭐)
      const row = ([key, item], have, sign) => {
        const price = st.shopPrice(key);
        const soldOut = price === null;
        const count = item.repeat ? '' : ` · gekocht ${st.bought(key)} / ${item.price.length}`;
        return `<button data-buy="${key}" class="item" ${soldOut || have < price ? 'disabled' : ''}>
          <span>${item.icon} ${item.name}</span><small>${item.info}${count}</small>
          <em class="${!soldOut && have < price ? 'bad' : ''}">${soldOut ? 'Uitverkocht' : `${sign} ${price}`}</em></button>`;
      };
      const ready = (st.data.bounties ?? []).filter((b) => b.count >= b.n).length;
      this.el.menuBody.innerHTML = `<p class="menu-info">● Je hebt <b>${st.runes.toLocaleString('nl-NL')}</b> munten</p>` +
        Object.entries(SHOP_ITEMS).map((e) => row(e, st.runes, '●')).join('') +
        `<h3>⭐ Sterrenwinkel</h3><p class="menu-info">Je hebt <b>${st.data.stars ?? 0}</b> ⭐ sterren. Die verdien je met trofeeën (K) en premies.</p>` +
        Object.entries(STAR_ITEMS).map((e) => row(e, st.data.stars ?? 0, '⭐')).join('') +
        `<p class="menu-info">Leven ${st.maxHealth} · Schade ×${st.damageMultiplier.toFixed(2)} · Flesjes ${st.flasksMax}</p>
        <button data-act="bounties">📜 Premiebord${ready ? ` — <b>${ready} klaar!</b>` : ''}</button>
        <button data-act="close">Tot ziens! (Esc)</button>`;
    };
    render();
    this.el.menuBody.onclick = (e) => {
      const b = e.target.closest('button');
      if (!b || b.disabled) return;
      if (b.dataset.act === 'close') actions.close();
      else if (b.dataset.act === 'bounties') actions.bounties();
      else if (b.dataset.buy) {
        actions.buy(b.dataset.buy);
        render();
      }
    };
  }

  /**
   * Het Premiebord: drie opdrachten. Klaar? Beloning ophalen.
   * actions = { text(bounty), claim(id), close() }
   */
  openBounties(actions) {
    this.showMenu('bounties', '📜 Premiebord');
    const render = () => {
      const list = this.stats.data.bounties ?? [];
      this.el.menuBody.innerHTML = `<p class="menu-info">Doe deze opdrachten (overal in de wereld) en haal hier je beloning op. Er komt steeds een nieuwe bij!</p>` +
        list.map((b) => {
          const done = b.count >= b.n;
          const bar = `<span class="prog"><i style="width:${Math.round((Math.min(b.count, b.n) / b.n) * 100)}%"></i></span>`;
          return `<button class="item ${done ? 'equipped' : ''}" data-claim="${b.id}" ${done ? '' : 'disabled'}>
            <span>📜 ${actions.text(b)}</span><small>${done ? '<b>Klaar! Klik om je beloning op te halen.</b>' : `${Math.min(b.count, b.n)} / ${b.n}`} ${bar}</small>
            <em>● ${b.runes} + ⭐ ${b.stars}</em></button>`;
        }).join('') +
        `<p class="menu-info">⭐ Je hebt <b>${this.stats.data.stars ?? 0}</b> sterren · Premies opgehaald: <b>${this.stats.data.counts?.bounties ?? 0}</b></p>
        <button data-act="close">Sluiten (Esc)</button>`;
    };
    render();
    this.el.menuBody.onclick = (e) => {
      const b = e.target.closest('button');
      if (!b || b.disabled) return;
      if (b.dataset.act === 'close') actions.close();
      else if (b.dataset.claim) {
        actions.claim(b.dataset.claim);
        render();
      }
    };
  }

  /**
   * De Arena: kies wat je wilt doen.
   * info = arena.menuInfo(); actions = { waves(), pet(kind), bet(type, amount), reroll(), duel(), close() }
   */
  openArena(info, actions) {
    this.showMenu('arena', '⚔ De Arena');
    const render = (info) => {
      const [a, b] = info.matchup;
      const fighter = (m) => `<b>${m.name}</b> <small>❤ ${m.hp} · ⚔ ${m.damage}</small>`;
      this.el.menuBody.innerHTML = `<p class="menu-info">Welkom in de Arena! Wat wil je doen? Je hebt <b>● ${info.runes.toLocaleString('nl-NL')}</b> munten.</p>
        <h3>⚔ Golven overleven</h3>
        <button class="item" data-act="waves"><span>⚔ Jij tegen de monsters</span><small>Elke golf meer en sterkere monsters. Elke golf: munten; elke 5 golven: een ⭐. Doodgaan kost hier niks!</small><em>beste: golf ${info.best}</em></button>
        <h3>🐾 Huisdiergevecht</h3>` +
        (info.pets.length
          ? info.pets.map((p) => `<button class="item" data-pet="${p.kind}"><span>${p.icon} ${p.name} (Lv ${p.level}) tegen een ${p.foe.name}</span><small>${p.name}: ❤ ${p.hp} · ⚔ ${p.damage} — ${p.foe.name}: ❤ ${p.foe.hp} · ⚔ ${p.foe.damage}. Winnen maakt je huisdier sterker!</small></button>`).join('')
          : '<p class="menu-info">Je hebt nog geen huisdier. Koop een Dino-ei bij de koopman, of Pluis de kat in de sterrenwinkel.</p>') +
        `<h3>👾 Monstergevecht — wie wint er?</h3>
        <p class="menu-info">${fighter(a)} &nbsp;tegen&nbsp; ${fighter(b)}<br><small>Wed munten op het monster dat volgens jou wint. Goed gegokt? Dan krijg je het dubbele terug!</small></p>
        <div class="bet-row">` +
        [a, b].map((m) => info.bets.map((n) => `<button data-bet="${m.key}" data-amount="${n}" ${info.runes < n ? 'disabled' : ''}>● ${n} op ${m.name}</button>`).join('')).join('') +
        `</div><button data-act="reroll">🔄 Andere monsters</button>
        <h3>🤖 Duel tegen Claude</h3>
        <p class="menu-info"><small>Vecht tegen Claude! Verliezen kost niks, winnen geeft munten. Win een niveau om het volgende te openen: hoe hoger, hoe sterker en slimmer hij wordt (combo's, wervelslag, vuurzwaard, flesjes...).</small></p>
        ${buddyDuelRow(info.buddyLevels ?? [])}
        <h3>🌐 Online</h3>
        <button class="item" data-act="duel"><span>🌐 Duel tegen een vriend</span><small>Speel samen online en vecht tegen elkaar in de arena (zie "Samen spelen" op het startscherm).</small></button>
        <button data-act="close">Sluiten (Esc)</button>`;
    };
    render(info);
    this.el.menuBody.onclick = (e) => {
      const btn = e.target.closest('button');
      if (!btn || btn.disabled) return;
      if (btn.dataset.act === 'close') actions.close();
      else if (btn.dataset.act === 'waves') actions.waves();
      else if (btn.dataset.act === 'duel') actions.duel();
      else if (btn.dataset.act === 'reroll') render(actions.reroll());
      else if (btn.dataset.pet) actions.pet(btn.dataset.pet);
      else if (btn.dataset.buddy) actions.buddy?.(btn.dataset.buddy);
      else if (btn.dataset.bet) actions.bet(btn.dataset.bet, Number(btn.dataset.amount));
    };
  }

  /**
   * Samen spelen (online): een kamer maken, meedoen met een code, of een duel beginnen.
   * mp = de Multiplayer (multiplayer.js); actions = { host(), join(code), duel(), goto(), leave(), close(), name(text) }
   */
  openMultiplayer(mp, actions, duelPrize) {
    this.showMenu('online', '🌐 Samen spelen');
    const esc = (t) => String(t).replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);
    const render = () => {
      if (this.menuOpen !== 'online') return;
      const st = mp.status;
      const other = esc(mp.remote?.name ?? 'je vriend');
      let html = `<p class="menu-info">Speel samen met een vriend via internet! Jullie zien elkaar in de wereld en kunnen in de <b>Arena</b> een duel doen.
        <small>(Vijanden, kisten en munten heeft ieder voor zich.)</small></p>
        <label class="field">Jouw naam <input id="mp-name" maxlength="14" value="${esc(this.stats.data.name ?? '')}" placeholder="Speler"></label>`;
      if (st === 'verbonden') {
        html += `<div class="mp-status ok">✔ Verbonden met <b>${other}</b> (kamer MUNT-${esc(mp.code ?? '')})</div>
          <button class="item" data-act="duel"><span>⚔ Duel in de Arena</span><small>Jullie gaan allebei naar de Arena. Wie het eerst geen leven meer heeft, verliest. De winnaar krijgt ● ${duelPrize}.</small></button>
          <button class="item" data-act="goto"><span>🧭 Naar ${other} toe</span><small>Snel naar je vriend toe reizen</small></button>
          <button class="danger" data-act="leave">Stoppen met samen spelen</button>`;
      } else if (st === 'wachten') {
        html += `<div class="mp-code"><small>Jouw code</small><b>MUNT-${esc(mp.code)}</b><small>Geef deze code aan je vriend. Wachten tot je vriend meedoet...</small></div>
          <button data-act="leave">Annuleren</button>`;
      } else if (st === 'laden' || st === 'verbinden') {
        html += `<div class="mp-status">⏳ ${st === 'laden' ? 'Even laden...' : `Verbinden met kamer MUNT-${esc(mp.code)}...`}</div><button data-act="leave">Annuleren</button>`;
      } else {
        if (st === 'fout') html += `<div class="mp-status bad">⚠ ${esc(mp.error)}</div>`;
        html += `<h3>🏠 Een kamer maken</h3>
          <button class="item" data-act="host"><span>🏠 Nieuwe kamer</span><small>Je krijgt een code die je aan je vriend geeft</small></button>
          <h3>🤝 Meedoen met een vriend</h3>
          <div class="join-row"><input id="mp-code" maxlength="9" placeholder="MUNT-XXXX" autocomplete="off"><button data-act="join">Meedoen</button></div>`;
      }
      html += `<button data-act="close">Sluiten (Esc)</button>`;
      this.el.menuBody.innerHTML = html;
      // Typen in een tekstvak mag de game niet besturen (anders zet de M het geluid uit, enz.)
      for (const input of this.el.menuBody.querySelectorAll('input')) {
        for (const type of ['keydown', 'keyup']) input.addEventListener(type, (e) => e.stopPropagation());
        input.addEventListener('keydown', (e) => {
          if (e.key === 'Enter' && input.id === 'mp-code') actions.join(input.value);
          if (e.key === 'Escape') actions.close();
        });
      }
      this.el.menuBody.querySelector('#mp-name')?.addEventListener('input', (e) => actions.name(e.target.value));
    };
    mp.onChange = render;
    render();
    this.el.menuBody.onclick = (e) => {
      const b = e.target.closest('button');
      if (!b || b.disabled) return;
      const act = b.dataset.act;
      if (act === 'join') actions.join(this.el.menuBody.querySelector('#mp-code')?.value ?? '');
      else if (act && actions[act]) actions[act]();
    };
  }

  /**
   * Claude, je computer-maatje (H): volgen, wachten, even weg, of een oefenduel.
   * actions = { mode(m), duel(level), close() }
   */
  openBuddy(buddy, actions, levels) {
    this.showMenu('maatje', '🤖 Claude, je maatje');
    const d = this.stats.data.buddy ?? {};
    const mode = buddy.mode;
    const won = levels.filter((l) => l.wins > 0).length;
    const modeBtn = (m, icon, title, info) => `<button class="item ${mode === m ? 'equipped' : ''}" data-mode="${m}"><span>${icon} ${title}</span><small>${info}</small>${mode === m ? '<em>nu</em>' : ''}</button>`;
    this.el.menuBody.innerHTML = `<p class="menu-info">Claude speelt met je mee: hij loopt achter je aan en vecht tegen vijanden in de buurt.
      Vijanden die hij verslaat geven munten (maar sterker worden doe je zelf).</p>
      <h3>Wat moet Claude doen?</h3>` +
      modeBtn('volg', '👣', 'Volg mij', 'Hij loopt achter je aan, vecht mee en flitst naar je toe als hij achterblijft') +
      modeBtn('wacht', '✋', 'Wacht hier', 'Hij blijft staan (en vecht alleen tegen vijanden die heel dichtbij komen)') +
      modeBtn('npc', '🏠', 'Ga terug naar Muntdorp', 'Even alleen spelen? Hij wacht in Muntdorp. Praat met hem (E) om hem weer mee te nemen') +
      `<h3>⚔ Duel in de Arena</h3>
      <p class="menu-info"><small>Niveaus gewonnen: <b>${won} / ${levels.length}</b> · verloren: ${d.losses ?? 0}</small></p>` +
      buddyDuelRow(levels).replaceAll('data-buddy=', 'data-duel=') +
      `<button data-act="close">Sluiten (H)</button>`;
    this.el.menuBody.onclick = (e) => {
      const b = e.target.closest('button');
      if (!b || b.disabled) return;
      if (b.dataset.act === 'close') actions.close();
      else if (b.dataset.mode) actions.mode(b.dataset.mode);
      else if (b.dataset.duel) actions.duel(b.dataset.duel);
    };
  }

  /** De trofeeënkast (K): alle trofeeën, je sterren en je rang. */
  openTrophies(actions) {
    this.showMenu('trophies', '🏆 Trofeeënkast');
    const d = this.stats.data;
    const got = d.trophies ?? [];
    this.el.menuBody.innerHTML = `<p class="menu-info">Rang: <b>${rankOf(d)}</b> · Trofeeën <b>${got.length} / ${TROPHIES.length}</b> · ⭐ verdiend: <b>${d.starsEarned ?? 0}</b> (${TROPHY_STARS} met alle trofeeën) · nu: <b>${d.stars ?? 0}</b></p>
      <p class="menu-info">Doel: haal ze <b>allemaal</b> en word een 🌟 <b>LEGENDE</b>! Sterren geef je uit in de sterrenwinkel bij de koopman.</p>` +
      TROPHIES.map((t) => {
        const has = got.includes(t.id);
        const p = !has && t.progress ? t.progress(d) : null;
        const bar = p ? ` <span class="prog"><i style="width:${Math.round((Math.min(p[0], p[1]) / p[1]) * 100)}%"></i></span> ${Math.min(p[0], p[1])} / ${p[1]}` : '';
        return `<div class="power-row trophy ${has ? '' : 'locked'}"><b>${has ? t.icon : '🔒'}</b><span>${t.name}</span><small>${t.info} · ${'⭐'.repeat(t.stars)}${bar}</small></div>`;
      }).join('') +
      `<button data-act="close">Sluiten (K)</button>`;
    this.el.menuBody.onclick = (e) => {
      const b = e.target.closest('button');
      if (b?.dataset.act === 'close') actions.close();
    };
  }

  /** Uitrusting (I of Tab): wapens, helmen, je level en krachten. */
  openInventory(actions) {
    this.showMenu('inventory', '🎒 Uitrusting', true);
    const render = () => {
      const d = this.stats.data;
      // Kleuren van Vuurtand die je hebt (uit de sterrenwinkel)
      const skins = ['vuur', ...(d.dragonSkins ?? [])];
      const dragonHtml = d.bosses.includes('mario') ? `<h3>🐉 Vuurtand</h3>` + skins.map((k) =>
        `<button class="item ${(d.dragonSkin ?? 'vuur') === k ? 'equipped' : ''}" data-skin="${k}"><span>🐉 ${DRAGON_SKINS[k].name}</span><small>Kleur van je draak</small>${(d.dragonSkin ?? 'vuur') === k ? '<em>gekozen</em>' : ''}</button>`).join('') : '';
      const st = this.stats;
      this.el.menuBody.innerHTML = `<div class="stat-row"><span>Rang <b>${rankOf(d)}</b></span><span>Level <b>${st.level}</b></span><span>❤ <b>${st.maxHealth}</b></span><span>⚡ <b>${st.maxStamina}</b></span><span>⚔ <b>×${st.damageMultiplier.toFixed(2)}</b></span><span>⭐ <b>${d.stars ?? 0}</b></span><span>🏆 <b>${(d.trophies ?? []).length} / ${TROPHIES.length}</b></span></div>` +
        this.inventoryHtml() + dragonHtml + this.powersHtml() +
        `<button data-act="trophies">🏆 Trofeeënkast (K)</button><button data-act="close">Sluiten (I)</button><button data-act="wipe" class="danger">Nieuw spel beginnen</button>`;
    };
    render();
    this.el.menuBody.onclick = (e) => {
      const b = e.target.closest('button');
      if (!b) return;
      if (b.dataset.act === 'close') actions.close();
      else if (b.dataset.act === 'trophies') actions.trophies();
      else if (b.dataset.skin) {
        actions.skin(b.dataset.skin);
        render();
      } else if (b.dataset.act === 'wipe') {
        if (confirm('Weet je het zeker? Al je voortgang wordt gewist.')) actions.wipe();
      } else if (b.dataset.equip) {
        actions.equip(JSON.parse(b.dataset.equip));
        render();
      }
    };
  }

  inventoryHtml() {
    const d = this.stats.data;
    // Elk wapen en elke helm als een kaartje in een raster (rand in de kleur van hoe zeldzaam het is)
    const card = (item) => {
      const info = itemInfo(item);
      const equipped = (item.kind === 'weapon' && d.weapon === item.key) || (item.kind === 'helmet' && d.helmet === item.key);
      const stat = item.kind === 'weapon' ? `⚔ ${info.damage} schade` : `🛡 ${Math.round(info.defense * 100)}% bescherming`;
      const icon = item.kind === 'weapon' ? weaponIcon(item.key) : '⛑';
      return `<button data-equip='${JSON.stringify(item)}' class="card ${equipped ? 'equipped' : ''}" style="--rar:${itemColor(item)}" title="${info.info}">
        <span class="ic">${icon}</span><b>${info.name}</b><small>${stat}</small>${equipped ? '<em>aan</em>' : ''}</button>`;
    };
    const diamonds = `<div class="stat-row"><span>💎 Diamanten <b>${(d.diamonds ?? []).length} / ${WORLD.diamonds.length}</b></span><span>📦 Kisten <b>${d.chests.length}</b></span><span>☠ Bosses <b>${d.bosses.length} / ${REGIONS.length}</b></span>${d.sky?.kelken ? `<span>⚡ Wolkenkelken <b>${d.sky.kelken}</b></span>` : ''}</div>`;
    return diamonds + `<h3>⚔ Wapens</h3><div class="grid">${d.inventory.filter((i) => i.kind === 'weapon').map(card).join('')}</div>
      <h3>⛑ Helmen</h3><div class="grid">${d.inventory.filter((i) => i.kind === 'helmet').map(card).join('')}</div>`;
  }

  /** Je level, hoe sterk je bent en wat je nog kunt vrijspelen. */
  powersHtml() {
    const st = this.stats;
    const progress = `<p class="menu-info">Level <b>${st.level}</b> · Nog <b>${st.xpNeeded - st.xp}</b> vijanden tot level ${st.level + 1} · Totaal verslagen: <b>${st.data.kills}</b></p>
      <p class="menu-info">Leven ${st.maxHealth} · Stamina ${st.maxStamina} · Schade ×${st.damageMultiplier.toFixed(2)}</p>`;
    const unlocks = [
      ...Object.entries(POWERS).map(([key, p]) => ({
        has: st.hasPower(key), sort: p.unlock.level ?? 99, key: p.key, name: p.name, info: p.info,
        how: p.unlock.level ? `Vanaf level ${p.unlock.level}` : `Versla ${p.unlock.boss === 'koning' ? 'Koning Slijm' : 'De Gevallen Ridder'}`,
      })),
      ...Object.entries(PERKS).map(([key, p]) => ({
        has: st.hasPerk(key), sort: p.level, key: '★', name: p.name, info: p.info, how: `Vanaf level ${p.level}: ${p.info}`,
      })),
    ].sort((a, b) => a.sort - b.sort);
    return `<h3>Level</h3>${progress}<h3>Krachten en bonussen</h3>` + unlocks
      .map((u) => `<div class="power-row ${u.has ? '' : 'locked'}"><b>${u.has ? u.key : '🔒'}</b><span>${u.name}</span><small>${u.has ? u.info : u.how}</small></div>`)
      .join('');
  }

  // ---------- Minimap ----------

  /** Checkpoints: een vlaggetje (goud als je er al was: daar kun je heen snelreizen). */
  drawFlags(ctx, toMap) {
    if (LEVEL.special) return; // in Omars kasteel en het Wolkenrijk zijn er geen vlaggen
    const d = this.stats.data;
    for (const c of CHECKPOINTS) {
      const [mx, my] = toMap(c.position.x, c.position.z);
      ctx.fillStyle = d.flags.includes(c.id) || c.id === d.checkpoint ? '#ffd76a' : '#e8e8e8';
      ctx.fillText('⚑', mx, my);
    }
  }

  /**
   * De grote wereldkaart (T): alle gebieden, waar je bent, en knoppen om naar een vlag te snelreizen.
   * actions = { travel(id) | null (snelreizen kan nu niet), close(), why: waarom het niet kan }
   */
  openWorldMap(player, actions) {
    this.showMenu('map', '🗺 Wereldkaart', true);
    const d = this.stats.data;
    const flags = CHECKPOINTS.filter((c) => d.flags.includes(c.id) || c.id === d.checkpoint);
    const groups = REGIONS.map((r) => ({ r, flags: flags.filter((c) => regionOfCheckpoint(c.id) === r.index) })).filter((g) => g.flags.length);
    this.el.menuBody.innerHTML = `<canvas class="world-map" width="1680" height="${Math.round((1680 * BOUNDS.z) / BOUNDS.x)}"></canvas>
      <div class="map-legend"><span>➤ jij</span><span>⚑ vlag (goud = snelreizen)</span><span>☠ boss</span><span>✔ verslagen</span><span>👑 kampioen</span><span>⚔ arena</span><span>! opdracht</span></div>
      <p class="menu-info">${actions.travel ? 'Snelreizen: kies een vlag waar je al eens was.' : actions.why}</p><div class="map-flags">` +
      groups.map(({ r, flags: list }) => `<div><h3>${r.name}${d.bosses.includes(r.boss) ? ' ✔' : ''}</h3>` + list.map((c) =>
        `<button data-flag="${c.id}" ${actions.travel ? '' : 'disabled'}><span>⚑ ${c.name}</span>${c.id === d.checkpoint ? '<small>Hier kom je terug als je doodgaat</small>' : ''}</button>`).join('') + '</div>').join('') +
      `</div><button data-act="close">Sluiten (T)</button>`;
    // De kaart tekenen (2× zo scherp als hij op het scherm staat)
    const canvas = this.el.menuBody.querySelector('canvas');
    const ctx = canvas.getContext('2d');
    ctx.scale(2, 2);
    const W = canvas.width / 2;
    const H = canvas.height / 2;
    const scale = Math.min(W / (BOUNDS.x * 2), H / (BOUNDS.z * 2));
    const toMap = (x, z) => [W / 2 + x * scale, H / 2 + z * scale];
    ctx.font = 'bold 15px sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    drawLand(ctx, toMap, scale, d.bosses);
    // Gebieden waar je nog nooit was: in de mist
    if (LEVEL.regions) {
      for (const r of REGIONS) {
        if (d.flags.includes(r.start)) continue;
        const [bx, by] = toMap(r.x0, -BOUNDS.z);
        ctx.fillStyle = 'rgba(20, 16, 24, 0.55)';
        ctx.fillRect(bx, by, (r.x1 - r.x0) * scale, BOUNDS.z * 2 * scale);
      }
    }
    for (const n of this.markers ?? []) {
      const [mx, my] = toMap(n.x, n.z);
      ctx.fillStyle = n.color;
      ctx.fillText(n.icon, mx, my);
    }
    this.drawFlags(ctx, toMap);
    // De naam van elk gebied als een lintje bovenaan
    ctx.font = 'bold 13px Georgia, serif';
    for (const r of LEVEL.regions ? REGIONS : []) {
      const [mx] = toMap(r.ox, 0);
      const my = 16;
      const w = ctx.measureText(r.name).width + 22;
      ctx.fillStyle = 'rgba(20, 14, 8, 0.82)';
      ctx.strokeStyle = 'rgba(243, 210, 122, 0.8)';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.roundRect(mx - w / 2, my - 10, w, 20, 10);
      ctx.fill();
      ctx.stroke();
      ctx.fillStyle = d.bosses.includes(r.boss) ? '#9dffb5' : '#fff5d2';
      ctx.fillText(r.name, mx, my + 1);
    }
    // Zachte donkere rand (een beetje als een oude kaart)
    const vignette = ctx.createRadialGradient(W / 2, H / 2, H * 0.3, W / 2, H / 2, W * 0.62);
    vignette.addColorStop(0, 'rgba(0, 0, 0, 0)');
    vignette.addColorStop(1, 'rgba(0, 0, 0, 0.45)');
    ctx.fillStyle = vignette;
    ctx.fillRect(0, 0, W, H);
    // Jij: een pijltje in een gouden rondje
    const [px, py] = toMap(player.position.x, player.position.z);
    ctx.save();
    ctx.translate(px, py);
    ctx.fillStyle = 'rgba(243, 210, 122, 0.35)';
    ctx.beginPath();
    ctx.arc(0, 0, 13, 0, Math.PI * 2);
    ctx.fill();
    ctx.rotate(-player.mesh.rotation.y + Math.PI);
    ctx.fillStyle = '#fff';
    ctx.strokeStyle = '#000';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(0, -9);
    ctx.lineTo(7, 7);
    ctx.lineTo(0, 3);
    ctx.lineTo(-7, 7);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
    ctx.restore();
    this.el.menuBody.onclick = (e) => {
      const b = e.target.closest('button');
      if (!b || b.disabled) return;
      if (b.dataset.act === 'close') actions.close();
      else if (b.dataset.flag) actions.travel(b.dataset.flag);
    };
  }

  drawMinimap(player, time) {
    const ctx = this.mapCtx;
    ctx.setTransform(this.mapScale, 0, 0, this.mapScale, 0, 0);
    const size = 180;
    const r = size / 2;
    const view = 70; // zoveel meter breed laat de kaart zien
    const scale = size / view;
    const px = player.position.x;
    const pz = player.position.z;
    const toMap = (x, z) => [r + (x - px) * scale, r + (z - pz) * scale];

    ctx.clearRect(0, 0, size, size);
    ctx.save();
    ctx.beginPath();
    ctx.arc(r, r, r - 5, 0, Math.PI * 2);
    ctx.clip();
    ctx.font = 'bold 14px sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    // Grond, de paden, huizen en arena's
    ctx.fillStyle = '#2b3326';
    ctx.fillRect(0, 0, size, size);
    drawLand(ctx, toMap, scale, this.stats.data.bosses);
    // NPC's, kampioenen, quest-voorwerpen (met een donker randje, dan zie je ze altijd)
    ctx.lineWidth = 3;
    ctx.strokeStyle = 'rgba(0, 0, 0, 0.6)';
    for (const n of this.markers ?? []) {
      const [mx, my] = toMap(n.x, n.z);
      ctx.strokeText(n.icon, mx, my);
      ctx.fillStyle = n.color;
      ctx.fillText(n.icon, mx, my);
    }
    this.drawFlags(ctx, toMap);
    // 's Nachts is de kaart wat donkerder, en de rand is altijd een beetje schaduw
    const shade = ctx.createRadialGradient(r, r, r * 0.55, r, r, r);
    shade.addColorStop(0, `rgba(5, 8, 25, ${0.35 * this.night})`);
    shade.addColorStop(1, `rgba(0, 0, 0, ${0.45 + 0.3 * this.night})`);
    ctx.fillStyle = shade;
    ctx.fillRect(0, 0, size, size);
    ctx.restore();

    // De speler: pijltje in kijkrichting, met een kijk-kegeltje
    ctx.save();
    ctx.translate(r, r);
    ctx.rotate(-player.mesh.rotation.y + Math.PI);
    const cone = ctx.createRadialGradient(0, 0, 2, 0, 0, 34);
    cone.addColorStop(0, 'rgba(255, 245, 200, 0.35)');
    cone.addColorStop(1, 'rgba(255, 245, 200, 0)');
    ctx.fillStyle = cone;
    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.arc(0, 0, 34, -Math.PI / 2 - 0.55, -Math.PI / 2 + 0.55);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = '#fff';
    ctx.strokeStyle = '#000';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(0, -8);
    ctx.lineTo(6, 6);
    ctx.lineTo(0, 3);
    ctx.lineTo(-6, 6);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
    ctx.restore();

    // Gouden rand met een kompas (N, O, Z, W)
    const ring = ctx.createLinearGradient(0, 0, 0, size);
    ring.addColorStop(0, '#fff1b8');
    ring.addColorStop(0.5, '#c99a3a');
    ring.addColorStop(1, '#6a4a14');
    ctx.strokeStyle = ring;
    ctx.lineWidth = 5;
    ctx.beginPath();
    ctx.arc(r, r, r - 4, 0, Math.PI * 2);
    ctx.stroke();
    ctx.strokeStyle = 'rgba(0, 0, 0, 0.6)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.arc(r, r, r - 7, 0, Math.PI * 2);
    ctx.stroke();
    ctx.font = 'bold 11px sans-serif';
    for (const [letter, x, y] of [['N', r, 6], ['Z', r, size - 6], ['W', 6, r], ['O', size - 6, r]]) {
      ctx.fillStyle = '#1a1206';
      ctx.beginPath();
      ctx.arc(x, y, 7, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = letter === 'N' ? '#ff8a6a' : '#f3d27a';
      ctx.fillText(letter, x, y + 0.5);
    }

    // Onder de kaart: waar ben je, en is het dag of nacht?
    const name = LEVEL.special ? LEVEL.name : REGIONS[regionIndexAt(px, pz)]?.name ?? '';
    if (name !== this.mapName) {
      this.mapName = name;
      $('map-region').textContent = name;
    }
    const info = this.night > 0.5 ? '🌙 nacht' : this.night > 0.15 ? '🌇 schemer' : '☀ dag';
    if (info !== this.mapInfo) {
      this.mapInfo = info;
      $('map-info').textContent = info;
    }
  }
}
