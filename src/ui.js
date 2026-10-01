import { ATTRIBUTES, POWERS, levelCost } from './stats.js';
import { WEAPONS } from './weapons.js';
import { HELMETS, itemInfo, itemColor } from './gear.js';
import { WORLD_HALF, GRACES, ARENAS, regionAt } from './world.js';

// Alles wat je op het scherm ziet (behalve de 3D-wereld): balken, munten, menu's, banners en de minimap.

const $ = (id) => document.getElementById(id);

export class UI {
  constructor(stats) {
    this.stats = stats;
    this.el = {
      hpFill: $('hp-fill'), hpLag: $('hp-lag'), hpText: $('hp-text'),
      stFill: $('st-fill'), level: $('level'),
      runes: $('runes'), runesGain: $('runes-gain'),
      flasks: $('flasks'), weapon: $('equip-weapon'), helmet: $('equip-helmet'),
      powers: $('powers'), prompt: $('prompt'),
      boss: $('boss'), bossName: $('boss-name'), bossFill: $('boss-fill'), bossLag: $('boss-lag'),
      banner: $('banner'), bannerText: $('banner-text'), bannerSub: $('banner-sub'),
      toast: $('toast'), region: $('region'),
      menu: $('menu'), menuTitle: $('menu-title'), menuBody: $('menu-body'),
      lockHint: $('lock-hint'),
      minimap: $('minimap'),
    };
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
  }

  // ---------- HUD elke frame ----------

  update(dt, player, boss, time) {
    const hp = player.health / player.maxHealth;
    // De "lag"-balk zakt langzaam na: zo zie je hoeveel schade je kreeg
    this.hpLag = Math.max(hp, this.hpLag - dt * 0.4);
    this.el.hpFill.style.width = `${hp * 100}%`;
    this.el.hpLag.style.width = `${this.hpLag * 100}%`;
    this.el.hpText.textContent = `${Math.ceil(player.health)} / ${player.maxHealth}`;
    $('hp-bar').style.width = `${Math.min(46, 14 + player.maxHealth / 12)}vw`;
    this.el.stFill.style.width = `${(player.stamina / player.maxStamina) * 100}%`;
    $('st-bar').style.width = `${Math.min(40, 10 + player.maxStamina / 10)}vw`;
    this.el.level.textContent = `Level ${this.stats.level}`;
    this.el.runes.textContent = this.stats.runes.toLocaleString('nl-NL');
    this.el.flasks.textContent = `🧪 ${player.flasks} / ${this.stats.data.flasksMax}`;
    this.el.weapon.textContent = `⚔ ${WEAPONS[player.sword.weaponKey].name}${player.fireTimer > 0 ? ' 🔥' : ''}`;
    this.el.weapon.style.color = itemColor({ kind: 'weapon', key: player.sword.weaponKey });
    this.el.helmet.textContent = `⛑ ${HELMETS[player.helmetKey].name}`;

    // Krachten met hun afkoeltijd
    const unlocked = this.stats.unlockedPowers();
    const cooldowns = { dash: player.dashCooldown, spin: player.spinCooldown, fire: player.fireTimer > 0 ? 0 : player.fireCooldown };
    this.el.powers.innerHTML = unlocked
      .map((key) => {
        const p = POWERS[key];
        const cd = cooldowns[key] ?? 0;
        const active = key === 'fire' && player.fireTimer > 0;
        return `<div class="power ${cd > 0 ? 'cooling' : ''} ${active ? 'active' : ''}"><b>${p.key}</b><span>${p.name}</span>${cd > 0 ? `<i>${cd.toFixed(1)}</i>` : ''}</div>`;
      })
      .join('');

    // Munten erbij: "+14" naast je teller
    if (this.runesGainTimer > 0) {
      this.runesGainTimer -= dt;
      this.el.runesGain.textContent = `+${this.runesGainAmount}`;
      this.el.runesGain.style.opacity = Math.min(1, this.runesGainTimer * 2);
      if (this.runesGainTimer <= 0) this.runesGainAmount = 0;
    }

    // Boss-balk
    if (boss) {
      this.el.boss.classList.remove('hidden');
      this.el.bossName.textContent = boss.name;
      const b = boss.hp / boss.info.hp;
      this.bossLag = Math.max(b, this.bossLag - dt * 0.3);
      this.el.bossFill.style.width = `${b * 100}%`;
      this.el.bossLag.style.width = `${this.bossLag * 100}%`;
    } else {
      this.el.boss.classList.add('hidden');
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

    this.drawMinimap(player, time);
  }

  addRunes(amount) {
    this.runesGainAmount += amount;
    this.runesGainTimer = 2;
  }

  prompt(text) {
    this.el.prompt.classList.toggle('hidden', !text);
    if (text) this.el.prompt.innerHTML = text;
  }

  /** Grote tekst in het midden, Elden Ring-stijl. kind: 'gold' | 'death' | 'power' */
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
  checkRegion(pos, names) {
    const region = regionAt(pos.x, pos.z);
    if (region !== this.currentRegion) {
      if (this.currentRegion !== null) {
        this.el.region.textContent = names[region];
        this.regionTimer = 4;
      }
      this.currentRegion = region;
    }
  }

  // ---------- Menu's ----------

  closeMenu() {
    this.menuOpen = null;
    this.el.menu.classList.add('hidden');
  }

  /** Menu bij een Plek van Genade: levelen, reizen, verlaten. */
  openGraceMenu(grace, actions) {
    this.menuOpen = 'grace';
    this.el.menu.classList.remove('hidden');
    this.el.menuTitle.textContent = grace.name;
    const render = (tab = 'main') => {
      if (tab === 'main') {
        this.el.menuBody.innerHTML = `
          <button data-act="level">⬆ Level omhoog</button>
          <button data-act="travel">🗺 Reizen</button>
          <button data-act="inventory">🎒 Uitrusting</button>
          <button data-act="powers">✨ Krachten</button>
          <button data-act="leave">Verder gaan</button>`;
      } else if (tab === 'level') {
        const cost = levelCost(this.stats.level);
        const can = this.stats.runes >= cost;
        this.el.menuBody.innerHTML = `
          <p class="menu-info">Level <b>${this.stats.level}</b> · Munten <b>${this.stats.runes}</b> · Volgend level kost <b class="${can ? 'ok' : 'bad'}">${cost}</b></p>
          ${Object.entries(ATTRIBUTES)
            .map(([key, a]) => `<button data-up="${key}" ${can ? '' : 'disabled'}><span>${a.name} <b>${this.stats.data[key]}</b></span><small>${a.info}</small></button>`)
            .join('')}
          <p class="menu-info">Leven ${this.stats.maxHealth} · Stamina ${this.stats.maxStamina} · Schade ×${this.stats.damageMultiplier.toFixed(1)}</p>
          <button data-act="back">← Terug</button>`;
      } else if (tab === 'travel') {
        this.el.menuBody.innerHTML =
          GRACES.filter((g) => this.stats.data.discovered.includes(g.id))
            .map((g) => `<button data-travel="${g.id}" ${g.id === grace.id ? 'disabled' : ''}>${g.name}</button>`)
            .join('') + `<button data-act="back">← Terug</button>`;
      } else if (tab === 'inventory') {
        this.el.menuBody.innerHTML = this.inventoryHtml() + `<button data-act="back">← Terug</button>`;
      } else if (tab === 'powers') {
        this.el.menuBody.innerHTML = this.powersHtml() + `<button data-act="back">← Terug</button>`;
      }
    };
    render();
    this.el.menuBody.onclick = (e) => {
      const b = e.target.closest('button');
      if (!b || b.disabled) return;
      if (b.dataset.act === 'leave') actions.leave();
      else if (b.dataset.act === 'back') render('main');
      else if (b.dataset.act) render(b.dataset.act);
      else if (b.dataset.up) {
        const before = this.stats.unlockedPowers();
        if (this.stats.levelUp(b.dataset.up)) actions.leveled(before);
        render('level');
      } else if (b.dataset.travel) actions.travel(b.dataset.travel);
      else if (b.dataset.equip) {
        actions.equip(JSON.parse(b.dataset.equip));
        render('inventory');
      }
    };
  }

  /** Uitrusting (I of Tab), ook buiten een Genade-plek. */
  openInventory(actions) {
    this.menuOpen = 'inventory';
    this.el.menu.classList.remove('hidden');
    this.el.menuTitle.textContent = 'Uitrusting';
    const render = () => {
      this.el.menuBody.innerHTML = this.inventoryHtml() + this.powersHtml() +
        `<button data-act="close">Sluiten (I)</button><button data-act="wipe" class="danger">Nieuw spel beginnen</button>`;
    };
    render();
    this.el.menuBody.onclick = (e) => {
      const b = e.target.closest('button');
      if (!b) return;
      if (b.dataset.act === 'close') actions.close();
      else if (b.dataset.act === 'wipe') {
        if (confirm('Weet je het zeker? Al je voortgang wordt gewist.')) actions.wipe();
      } else if (b.dataset.equip) {
        actions.equip(JSON.parse(b.dataset.equip));
        render();
      }
    };
  }

  inventoryHtml() {
    const d = this.stats.data;
    const row = (item) => {
      const info = itemInfo(item);
      const equipped = (item.kind === 'weapon' && d.weapon === item.key) || (item.kind === 'helmet' && d.helmet === item.key);
      const stat = item.kind === 'weapon' ? `${info.damage}${info.pellets ? ` × ${info.pellets}` : ''} schade${info.ranged ? ' · afstand' : ''}` : `${Math.round(info.defense * 100)}% bescherming`;
      return `<button data-equip='${JSON.stringify(item)}' class="item ${equipped ? 'equipped' : ''}">
        <span style="color:${itemColor(item)}">${item.kind === 'weapon' ? '⚔' : '⛑'} ${info.name}</span>
        <small>${stat} · ${info.info}</small>${equipped ? '<em>uitgerust</em>' : ''}</button>`;
    };
    const diamonds = `<p class="menu-info">💎 Diamanten gevonden: <b>${(d.diamonds ?? []).length} / 12</b> · Kisten geopend: <b>${d.chests.length}</b></p>`;
    return diamonds + `<h3>Wapens</h3>${d.inventory.filter((i) => i.kind === 'weapon').map(row).join('')}
      <h3>Helmen</h3>${d.inventory.filter((i) => i.kind === 'helmet').map(row).join('')}`;
  }

  powersHtml() {
    return `<h3>Krachten</h3>` + Object.entries(POWERS)
      .map(([key, p]) => {
        const has = this.stats.hasPower(key);
        const how = p.unlock.level ? `Vanaf level ${p.unlock.level}` : `Versla ${p.unlock.boss === 'koning' ? 'Koning Slijm' : 'De Gevallen Ridder'}`;
        return `<div class="power-row ${has ? '' : 'locked'}"><b>${has ? p.key : '🔒'}</b><span>${p.name}</span><small>${has ? p.info : how}</small></div>`;
      })
      .join('');
  }

  // ---------- Minimap ----------

  drawMinimap(player, time) {
    const ctx = this.mapCtx;
    const size = this.el.minimap.width;
    const view = 70; // zoveel meter breed laat de kaart zien
    const scale = size / view;
    const px = player.position.x;
    const pz = player.position.z;
    const toMap = (x, z) => [size / 2 + (x - px) * scale, size / 2 + (z - pz) * scale];

    ctx.clearRect(0, 0, size, size);
    ctx.save();
    ctx.beginPath();
    ctx.arc(size / 2, size / 2, size / 2 - 2, 0, Math.PI * 2);
    ctx.clip();
    // Gebieden als gekleurde vlakjes
    const step = 6;
    const colors = { weide: '#4f8f4e', woud: '#2c4f2c', hoogland: '#7c776a' };
    for (let x = px - view / 2 - step; x < px + view / 2 + step; x += step) {
      for (let z = pz - view / 2 - step; z < pz + view / 2 + step; z += step) {
        const gx = Math.floor(x / step) * step;
        const gz = Math.floor(z / step) * step;
        ctx.fillStyle = Math.abs(gx) > WORLD_HALF - 6 || Math.abs(gz) > WORLD_HALF - 6 ? '#555' : colors[regionAt(gx, gz)];
        const [mx, my] = toMap(gx, gz);
        ctx.fillRect(mx, my, step * scale + 1, step * scale + 1);
      }
    }
    // Arena's (doodshoofd) en graces (gouden punt)
    ctx.font = 'bold 14px sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    for (const a of ARENAS) {
      const [mx, my] = toMap(a.center.x, a.center.z);
      ctx.fillStyle = this.stats.data.bosses.includes(a.id) ? 'rgba(255,255,255,0.4)' : '#ff5a5a';
      ctx.fillText('☠', mx, my);
    }
    for (const g of GRACES) {
      if (!this.stats.data.discovered.includes(g.id)) continue;
      const [mx, my] = toMap(g.position.x, g.position.z);
      ctx.fillStyle = '#ffd76a';
      ctx.beginPath();
      ctx.arc(mx, my, 3.5 + Math.sin(time * 3), 0, Math.PI * 2);
      ctx.fill();
    }
    const lost = this.stats.data.lostRunes;
    if (lost) {
      const [mx, my] = toMap(lost.x, lost.z);
      ctx.fillStyle = '#8dffb0';
      ctx.beginPath();
      ctx.arc(mx, my, 4, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();

    // De speler: pijltje in kijkrichting
    ctx.save();
    ctx.translate(size / 2, size / 2);
    ctx.rotate(-player.mesh.rotation.y + Math.PI);
    ctx.fillStyle = '#fff';
    ctx.strokeStyle = '#000';
    ctx.beginPath();
    ctx.moveTo(0, -8);
    ctx.lineTo(6, 6);
    ctx.lineTo(0, 3);
    ctx.lineTo(-6, 6);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
    ctx.restore();
    // Rand en "N" voor het noorden
    ctx.strokeStyle = 'rgba(255, 215, 106, 0.8)';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(size / 2, size / 2, size / 2 - 2, 0, Math.PI * 2);
    ctx.stroke();
    ctx.fillStyle = '#ffd76a';
    ctx.fillText('N', size / 2, 10);
  }
}
