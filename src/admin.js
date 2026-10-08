// Het admin-menu: druk op Enter, typ de code (123123) en je kunt alles.
//  - Hoe sterk ben je? Normaal, Matig sterk (300 leven) of OP!!! (alles op max). Zie ADMIN_KRACHT in stats.js.
//  - Oneindig stamina, oneindig geld en oneindig levels (elke verslagen vijand = een level erbij).
//  - Elk wapen en elke helm uit het spel pakken (en meteen uitrusten).
// Alles wordt bewaard in je save (stats.data.admin), dus het staat er nog als je het spel opnieuw start.

import { ADMIN_KRACHT } from './stats.js';
import { WEAPONS } from './weapons.js';
import { HELMETS, itemColor } from './gear.js';
import { play } from './audio.js';

// De geheime code (na Enter)
export const ADMIN_CODE = '123123';

// Wat de knoppen bij "Extra" geven
const EXTRA = { levels: 10, kelken: 4 };

// De aan/uit-knoppen bij "Oneindig"
const ONEINDIG = {
  stamina: { name: 'Oneindig stamina', info: 'Rollen, dashen, sprinten en slaan zo vaak je wilt.' },
  geld: { name: 'Oneindig geld', info: 'Je munten zijn ∞: alles in de winkel is gratis.' },
  levels: { name: 'Oneindig levels', info: 'Elke vijand die je verslaat is meteen een level erbij.' },
};

export class Admin {
  /** equip(item) = een wapen of helm uitrusten (main.js), close() = terug naar het spel */
  constructor({ stats, player, ui, equip, close }) {
    this.stats = stats;
    this.player = player;
    this.ui = ui;
    this.equip = equip;
    this.onClose = close;
  }

  /** Enter: een vakje voor de geheime code. */
  askCode() {
    const { ui } = this;
    this.show('Admin');
    document.exitPointerLock?.();
    ui.el.menuBody.innerHTML = `<p class="menu-info">Typ de code.</p>
      <input class="admin-code" type="password" inputmode="numeric" maxlength="12" autocomplete="off">
      <button data-act="close">Annuleren (Esc)</button>`;
    const field = ui.el.menuBody.querySelector('input');
    field.focus();
    // Goed getypt? Dan gaat het menu meteen open.
    field.oninput = () => {
      if (field.value === ADMIN_CODE) this.open();
    };
    field.onkeydown = (e) => {
      e.stopPropagation(); // typen in het vakje is geen M, G, Enter of Esc voor het spel
      if (e.code === 'Escape') this.close();
      if (e.code === 'Enter' || e.code === 'NumpadEnter') {
        this.close();
        ui.toast('🔒 Verkeerde code.', 2);
      }
    };
    ui.el.menuBody.onclick = (e) => {
      if (e.target.closest('button')?.dataset.act === 'close') this.close();
    };
  }

  /** Het admin-menu zelf. */
  open() {
    play('levelUp');
    this.show('Admin-menu');
    this.render();
    this.ui.el.menuBody.onclick = (e) => this.click(e.target.closest('button'));
  }

  close() {
    this.ui.closeMenu();
    this.onClose();
  }

  show(title) {
    const { ui } = this;
    ui.menuOpen = 'admin';
    play('menuOpen');
    ui.el.menu.classList.remove('hidden');
    ui.el.menuTitle.textContent = title;
  }

  render() {
    const st = this.stats;
    const a = st.admin;
    const d = st.data;
    const status = `<p class="menu-info">Leven <b>${st.maxHealth}</b> · Stamina <b>${a.stamina ? '∞' : st.maxStamina}</b> · Schade ×<b>${st.damageMultiplier.toFixed(2)}</b>
      · Munten <b>${st.runes.toLocaleString('nl-NL')}</b> · Level <b>${st.level}</b></p>`;
    const kracht = Object.entries(ADMIN_KRACHT).map(([key, k]) => {
      const chosen = a.kracht === key;
      return `<button data-kracht="${key}" class="item ${chosen ? 'equipped' : ''}"><span>${k.name}</span><small>${k.info}</small>${chosen ? '<em>gekozen</em>' : ''}</button>`;
    }).join('');
    const oneindig = Object.entries(ONEINDIG).map(([key, o]) =>
      `<button data-oneindig="${key}" class="item ${a[key] ? 'equipped' : ''}"><span>${o.name}</span><small>${o.info}</small><em class="${a[key] ? '' : 'bad'}">${a[key] ? 'AAN' : 'uit'}</em></button>`).join('');
    const item = (kind, key, info, stat) => {
      const it = { kind, key };
      const equipped = d[kind] === key;
      const has = st.hasItem(it);
      return `<button data-item='${JSON.stringify(it)}' class="item ${equipped ? 'equipped' : ''}">
        <span style="color:${itemColor(it)}">${kind === 'weapon' ? '⚔' : '⛑'} ${info.name}</span>
        <small>${stat}${has ? ' · in je uitrusting' : ''}</small>${equipped ? '<em>uitgerust</em>' : ''}</button>`;
    };
    const weapons = Object.entries(WEAPONS).map(([key, w]) => item('weapon', key, w, `${w.damage} schade`)).join('');
    const helmets = Object.entries(HELMETS).map(([key, h]) => item('helmet', key, h, `${Math.round(h.defense * 100)}% bescherming`)).join('');
    this.ui.el.menuBody.innerHTML = status +
      `<h3>Hoe sterk ben je?</h3>${kracht}
      <h3>Oneindig</h3>${oneindig}
      <h3>Wapens</h3><p class="menu-info">Klik = pakken en meteen uitrusten.</p>${weapons}
      <h3>Helmen</h3>${helmets}
      <h3>Extra</h3>
      <button data-act="alles"><span>🎒 Alles pakken</span><small>Alle wapens en helmen in je uitrusting (I).</small></button>
      <button data-act="levels"><span>⭐ +${EXTRA.levels} levels</span><small>Nu level ${st.level}.</small></button>
      <button data-act="kelken"><span>⚡ +${EXTRA.kelken} Wolkenkelken</span><small>Genoeg voor één reis met de Donderpoort naar Sky. Je hebt er ${d.sky.kelken}.</small></button>
      <button data-act="heal"><span>❤ Leven en flesjes vol</span></button>
      <button data-act="close">Sluiten (Esc)</button>
      <button data-act="reset" class="danger">Admin uit: alles terug naar normaal</button>`;
  }

  click(b) {
    if (!b) return;
    const { stats, player } = this;
    const a = stats.admin;
    const act = b.dataset.act;
    if (act === 'close') return this.close();
    if (b.dataset.kracht) a.kracht = b.dataset.kracht;
    else if (b.dataset.oneindig) a[b.dataset.oneindig] = !a[b.dataset.oneindig];
    else if (b.dataset.item) {
      const it = JSON.parse(b.dataset.item);
      stats.addItem(it);
      this.equip(it);
    } else if (act === 'alles') {
      for (const key of Object.keys(WEAPONS)) stats.addItem({ kind: 'weapon', key });
      for (const key of Object.keys(HELMETS)) stats.addItem({ kind: 'helmet', key });
      this.ui.toast('🎒 Alle wapens en helmen zitten in je uitrusting (<b>I</b>).', 3);
    } else if (act === 'levels') stats.data.level += EXTRA.levels;
    else if (act === 'kelken') stats.data.sky.kelken += EXTRA.kelken;
    else if (act === 'reset') Object.assign(a, { kracht: 'normaal', stamina: false, geld: false, levels: false });
    // Sterker (of zwakker) geworden: leven en stamina meteen vol (of niet meer dan je nu kunt hebben)
    if (b.dataset.kracht || b.dataset.oneindig || act === 'levels' || act === 'heal' || act === 'reset') {
      player.health = player.maxHealth;
      player.stamina = player.maxStamina;
      if (act === 'heal') player.flasks = stats.flasksMax;
    }
    stats.save();
    play('pickup');
    this.render();
  }
}
