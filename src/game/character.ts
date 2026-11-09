import { openDialog } from './interface.js';
import { eatDish } from './food.js';
import { FOOD_STACK_MAX } from './food-rules.js';
import { purchaseItem, sellItem, spendMoney } from './economy.js';
import { resaleValue } from './resale-rules.js';
import { PET_OF_KEY, renamePet, startDogWalk } from './pets.js';
import type { GameValue } from './context.js';
import { game } from './context.js';
import { lifetime, dom, browser } from './runtime.js';
import { nameHash } from './render/scenes.js';
import { drawPlayerAvatar } from './render/avatars.js';
import { toast } from './missions.js';
import { hasRoom, isMyRoomNow, saveGame } from './saves.js';
import { sfx } from './audio.js';
import { closeModal } from './render/primitives.js';
import {
  backToCourtyardGate,
  changeSafePin,
  getCurrentFurnitureMap,
  setFurniturePosition,
} from './world.js';
import { buyLimited, limitedLeft, myCopy, ownsLimited } from './limited.js';
import { recordActivity } from './activity.js';
export function itemById(id?: GameValue): GameValue {
  return game.shopCatalog.find((i?: GameValue): GameValue => i.id === id) || null;
}

export function ownsItem(id?: GameValue): GameValue {
  const it: GameValue = itemById(id);
  if (it?.limited) return ownsLimited(id); // edizione limitata: decide il registro delle copie
  return !!it && (!!it.starter || !!game.player.ownedItems[id]);
}

export function lookString(look: GameValue = game.player.equipped): GameValue {
  return game.SLOTS.map((sl?: GameValue): GameValue => look[sl])
    .filter(Boolean)
    .join(',');
}

export function parseLook(str?: GameValue): GameValue {
  const look: GameValue = {};
  String(str || '')
    .split(',')
    .forEach((id?: GameValue): GameValue => {
      const it: GameValue = itemById(id);
      if (it) look[it.slot] = id;
    });
  return look;
}

// Trasforma { slot: id } negli oggetti del catalogo, riempiendo i pezzi mancanti con quelli base
export function resolveLook(look?: GameValue): GameValue {
  const r: GameValue = {};
  game.SLOTS.forEach((sl?: GameValue): GameValue => {
    r[sl] = look && look[sl] ? itemById(look[sl]) : null;
  });
  ['top', 'pants', 'shoes'].forEach((sl?: GameValue): GameValue => {
    if (!r[sl]) r[sl] = itemById(game.DEFAULT_LOOK[sl]);
  });
  return r;
}

// Giocatori con la versione vecchia: avevano solo il colore della maglia e una lista di accessori
export function legacyLook(op?: GameValue): GameValue {
  const r: GameValue = resolveLook({});
  r.top = Object.assign({}, r.top, { color: op.outfit || '#e91e63' });
  const acc: GameValue = op.acc || '';
  if (acc.includes('glasses')) r.glasses = itemById('item_glasses');
  if (acc.includes('crown')) r.hat = itemById('item_crown');
  else if (acc.includes('hat')) r.hat = itemById('item_hat');
  return r;
}

export function botLook(name?: GameValue): GameValue {
  if (game.botLooks[name]) return game.botLooks[name];
  const h: GameValue = nameHash(name);
  const pick: GameValue = (slot?: GameValue, k?: GameValue): GameValue => {
    const list: GameValue = game.shopCatalog.filter(
      (i?: GameValue): GameValue => i.slot === slot && i.price < 100,
    );
    return list[(h >> k) % list.length].id;
  };
  return (game.botLooks[name] = resolveLook({
    top: pick('top', 1),
    pants: pick('pants', 3),
    shoes: pick('shoes', 5),
    hat: h % 3 === 0 ? pick('hat', 7) : null,
    glasses: h % 4 === 1 ? pick('glasses', 9) : null,
    neck: h % 5 === 2 ? pick('neck', 11) : null,
  }));
}

export function parseBody(str?: GameValue): GameValue {
  const p: GameValue = String(str || '').split('.');
  // i personaggi creati prima della scelta del genere non hanno l'ultimo numero: maschi
  if (p.length === game.BODY_KEYS.length - 1) p.push('0');
  if (p.length !== game.BODY_KEYS.length) return null;
  const b: GameValue = {};
  for (let i: GameValue = 0; i < game.BODY_KEYS.length; i++) {
    const n: GameValue = parseInt(p[i], 10);
    if (!(n >= 0 && n < game.BODY_PARTS[game.BODY_KEYS[i]].opts.length)) return null;
    b[game.BODY_KEYS[i]] = n;
  }
  return b;
}

export function bodyFromName(name?: GameValue): GameValue {
  const h: GameValue = nameHash(name || '');
  return {
    skin: game.OLD_SKIN_IDX[h % 5],
    hairStyle: 0,
    hairColor: game.OLD_HAIR_IDX[(h >> 3) % 7],
    eyeColor: 0,
    eyeShape: 0,
    mouth: 0,
    freckles: 0,
    beard: 0,
    gender: 0,
  };
}

export function currentBody(..._args: GameValue[]): GameValue {
  return game.myBody || bodyFromName(game.player.myData.nick);
}

export function myLook(..._args: GameValue[]): GameValue {
  const l: GameValue = resolveLook(game.player.equipped);
  l.body = currentBody();
  return l;
}

export function freeRoomsInApt(a?: GameValue): GameValue {
  let n: GameValue = 0;
  for (let i: GameValue = a * game.ROOMS_PER_APT; i < (a + 1) * game.ROOMS_PER_APT; i++)
    if (!(game.roomsState[i] && game.roomsState[i].owner)) n++;
  return n;
}

export function aptLabel(a?: GameValue): GameValue {
  const mine: GameValue =
    game.myAssignedRoomIdx !== null &&
    game.myAssignedRoomIdx >= 0 &&
    game.aptOfRoom(game.myAssignedRoomIdx) === a;
  return `${mine ? '🏠 Il tuo appartamento ' : 'Appartamento '}${a + 1} · ${freeRoomsInApt(a)} stanze libere`;
}

// ---------- Anteprima del personaggio (canvas piccolo dentro le finestre) ----------
export function drawAvatarPreview(cv?: GameValue, look?: GameValue, t?: GameValue): GameValue {
  const savedCtx: GameValue = game.view.ctx;
  game.view.ctx = cv.getContext('2d');
  game.viewOverride = { cx: cv.width / 2, cy: cv.height * 0.86, scale: cv.height / 92 };
  try {
    game.view.ctx.clearRect(0, 0, cv.width, cv.height);
    game.view.ctx.fillStyle = 'rgba(255,255,255,0.08)';
    game.view.ctx.beginPath();
    game.view.ctx.ellipse(
      cv.width / 2,
      cv.height * 0.86,
      cv.width * 0.32,
      cv.width * 0.1,
      0,
      0,
      6.3,
    );
    game.view.ctx.fill();
    drawPlayerAvatar(0, 0, '', t, look, false, '');
  } finally {
    game.view.ctx = savedCtx;
    game.viewOverride = null;
  }
}

export function startPreviewLoop(..._args: GameValue[]): GameValue {
  if (game.previewRaf) return;
  const loop: GameValue = (): GameValue => {
    const shopOpen: GameValue = !dom('clothes-modal').classList.contains('hidden');
    const wdOpen: GameValue = !dom('wardrobe-modal').classList.contains('hidden');
    if (!shopOpen && !wdOpen) {
      game.previewRaf = null;
      return;
    }
    const t: GameValue = performance.now() / 1000;
    if (shopOpen) drawAvatarPreview(dom('clothes-preview'), previewShopLook(), t);
    if (wdOpen) drawAvatarPreview(dom('wardrobe-preview'), myLook(), t);
    game.previewRaf = lifetime.requestAnimationFrame(loop);
  };
  game.previewRaf = lifetime.requestAnimationFrame(loop);
}

export function itemSwatch(it?: GameValue): GameValue {
  const c2: GameValue = it.color2 || game.darken(it.color, 0.25);
  let bg: GameValue = `linear-gradient(135deg, ${it.color}, ${game.darken(it.color, 0.2)})`;
  if (it.style === 'stripes')
    bg = `repeating-linear-gradient(0deg, ${it.color} 0 5px, ${c2} 5px 10px)`;
  else if (it.style === 'camo' || it.style === 'hawaii')
    bg = `radial-gradient(circle at 30% 40%, ${c2} 0 6px, transparent 7px), radial-gradient(circle at 70% 60%, ${c2} 0 5px, transparent 6px), ${it.color}`;
  else if (it.style === 'suit' || it.style === 'sport' || it.style === 'jacket')
    bg = `linear-gradient(90deg, ${it.color} 0 42%, ${c2} 42% 58%, ${it.color} 58%)`;
  return `<div class="swatch" style="background:${bg}">${it.name.match(/\p{Extended_Pictographic}/u) ? it.name.match(/\p{Extended_Pictographic}/u)[0] : ''}</div>`;
}

// Fascia di altezza del manichino (da z0 a z1) inquadrata nella miniatura di ogni categoria.
const THUMB_FRAME: Record<string, [number, number]> = {
  top: [16, 50],
  pants: [-1, 27],
  shoes: [-2, 10],
  hat: [48, 84],
  glasses: [51, 65],
  neck: [30, 57],
};

function itemThumbHtml(it: GameValue): string {
  return `<canvas class="swatch-cv" width="240" height="150" data-thumb="${it.id}"></canvas>`;
}

// Disegna il capo indossato da un manichino, inquadrato sulla parte del corpo giusta.
function drawItemThumb(cv: HTMLCanvasElement, it: GameValue): void {
  const look: GameValue = resolveLook({ [it.slot]: it.id });
  look.mannequin = true;
  const [z0, z1] = THUMB_FRAME[it.slot] || [0, 70];
  const scale = Math.min((cv.height * 0.82) / (z1 - z0), cv.width / 30);
  const savedCtx: GameValue = game.view.ctx;
  const ctx = cv.getContext('2d');
  if (!ctx) return;
  game.view.ctx = ctx;
  game.viewOverride = { cx: cv.width / 2, cy: cv.height / 2 + ((z0 + z1) / 2) * scale, scale };
  try {
    ctx.clearRect(0, 0, cv.width, cv.height);
    drawPlayerAvatar(0, 0, '', 0, look, false, '', { noShadow: true });
  } finally {
    game.view.ctx = savedCtx;
    game.viewOverride = null;
  }
}

function paintItemThumbs(box: HTMLElement): void {
  box.querySelectorAll<HTMLCanvasElement>('canvas[data-thumb]').forEach((cv) => {
    const it: GameValue = itemById(cv.dataset.thumb);
    if (it) drawItemThumb(cv, it);
  });
}

export function renderTabs(
  containerId?: GameValue,
  active?: GameValue,
  onPick?: GameValue,
  counts?: GameValue,
): GameValue {
  const box: GameValue = dom(containerId);
  box.innerHTML = '';
  game.SLOTS.forEach((sl?: GameValue): GameValue => {
    const b: GameValue = document.createElement('button');
    b.className = 'tab' + (sl === active ? ' active' : '');
    b.textContent = `${game.SLOT_INFO[sl].icon} ${game.SLOT_INFO[sl].label}${counts ? ' (' + counts[sl] + ')' : ''}`;
    b.onclick = (): GameValue => onPick(sl);
    box.appendChild(b);
  });
}

export function openClothesShop(slot: GameValue = 'top', online: GameValue = false): GameValue {
  game.shopState = { slot: slot || 'top', tryOn: null, online };
  dom('clothes-title').textContent = online ? '🌐 modaonline.it' : '👗 Boutique Dolce Casa';
  renderClothesShop();
  dom('clothes-modal').classList.remove('hidden');
  startPreviewLoop();
}

export function previewShopLook(..._args: GameValue[]): GameValue {
  const look: GameValue = Object.assign({}, game.player.equipped);
  const it: GameValue = itemById(game.shopState.tryOn);
  if (it) look[it.slot] = it.id;
  const r: GameValue = resolveLook(look);
  r.body = currentBody();
  return r;
}

export function renderClothesShop(..._args: GameValue[]): GameValue {
  dom('clothes-money').textContent = `💰 ${game.moneyLevel} Đ`;
  renderTabs('clothes-tabs', game.shopState.slot, (sl?: GameValue): GameValue => {
    game.shopState.slot = sl;
    game.shopState.tryOn = null;
    renderClothesShop();
  });
  const list: GameValue = dom('clothes-list');
  list.innerHTML = '';
  game.shopCatalog
    .filter((it?: GameValue): GameValue => it.slot === game.shopState.slot && !it.starter)
    .forEach((it?: GameValue): GameValue => {
      const owned: GameValue = ownsItem(it.id);
      const card: GameValue = document.createElement('div');
      card.className =
        'item-card' +
        (game.shopState.tryOn === it.id ? ' selected' : '') +
        (it.limited ? ' ltd' : '');
      // edizione limitata: copie rimaste, niente rivendita al negozio (si vende agli altri giocatori)
      const left = it.limited ? limitedLeft(it.id) : 0;
      const status = it.limited
        ? owned
          ? `<div class="owned-tag">💎 Tua: copia #${myCopy(it.id)}/${it.limited}</div>`
          : `<div class="ltd-tag">💎 Edizione limitata · ${left ? `ne restano ${left} su ${it.limited}` : 'esaurita'}</div><div class="price">💰 ${it.price.toLocaleString('it-IT')} Đ</div>`
        : owned
          ? `<div class="owned-tag">✓ Nel tuo armadio</div>`
          : `<div class="price">💰 ${it.price} Đ</div>`;
      const action = owned
        ? it.limited
          ? ''
          : `<button type="button" class="sell" data-act="sell">💸 Rivendi ${resaleValue(it.price)} Đ</button>`
        : it.limited && !left
          ? ''
          : '<button type="button" class="buy" data-act="buy">Compra</button>';
      card.innerHTML =
        `${itemThumbHtml(it)}<div>${it.name}</div>` +
        status +
        `<div class="btn-row"><button type="button" data-act="try">👀 Prova</button>${action}</div>`;
      card.onclick = (e?: GameValue): GameValue => {
        const act: GameValue = e.target.dataset && e.target.dataset.act;
        if (act === 'buy' && it.limited) void buyLimited(it.id, it.price);
        else if (act === 'buy') buyClothing(it.id);
        else if (act === 'sell') void sellClothing(it.id);
        else {
          game.shopState.tryOn = game.shopState.tryOn === it.id ? null : it.id;
          renderClothesShop();
        }
      };
      list.appendChild(card);
    });
  paintItemThumbs(list);
}

export async function buyClothing(id: string): Promise<void> {
  const it: GameValue = itemById(id);
  if (!it || ownsItem(id) || it.limited) return;
  if (game.moneyLevel < it.price) {
    toast(`❌ Ti servono ${it.price} Đ per ${it.name}.`);
    return;
  }
  if (!(await purchaseItem('ownedItems', id, it.price))) return;
  game.shopState.tryOn = id;
  toast(`✅ Hai comprato ${it.name}! Indossalo dall'armadio della tua stanza 🚪`, 3500);
  saveGame(true);
  renderClothesShop();
}

/** Rivende un vestito comprato: si riprende l'85% del prezzo; se lo indossavi torna quello base. */
async function sellClothing(id: string): Promise<void> {
  const it: GameValue = itemById(id);
  if (!it || it.starter || !game.player.ownedItems[id]) return;
  const refund = resaleValue(it.price);
  const res: GameValue = await openDialog({
    title: `💸 Rivendere ${it.name}?`,
    text: `L'avevi pagato ${it.price} Đ: rivendendolo ricevi ${refund} Đ (il 15% in meno).`,
    buttons: [
      { label: 'Annulla', value: null },
      { label: `Rivendi (${refund} Đ)`, value: 'sell', color: '#e67e22' },
    ],
  });
  if (res.action !== 'sell') return;
  if (!(await sellItem('ownedItems', id, refund))) return;
  if (game.player.equipped[it.slot] === id)
    game.player.equipped[it.slot] = game.DEFAULT_LOOK[it.slot];
  sfx('coin');
  toast(`💸 Hai rivenduto ${it.name}: +${refund} Đ in cassaforte.`, 3500);
  saveGame(true);
  renderClothesShop();
}

export function wardrobeOpenAmount(..._args: GameValue[]): GameValue {
  const k: GameValue = Math.min(1, (performance.now() - game.wardrobeAnim.t0) / 450);
  if (game.wardrobeAnim.state === 'opening' || game.wardrobeAnim.state === 'open')
    return 1 - Math.pow(1 - k, 3);
  if (game.wardrobeAnim.state === 'closing') return Math.pow(1 - k, 3);
  return 0;
}

export function openWardrobe(..._args: GameValue[]): GameValue {
  if (game.wardrobeAnim.state === 'opening' || game.wardrobeAnim.state === 'open') return;
  game.wardrobeAnim = { state: 'opening', t0: performance.now() };
  sfx('wardrobe');
  lifetime.setTimeout((): GameValue => {
    if (game.wardrobeAnim.state !== 'opening') return;
    game.wardrobeAnim.state = 'open';
    openWardrobeModal();
  }, 480);
}

export function closeWardrobe(..._args: GameValue[]): GameValue {
  closeModal('wardrobe-modal');
  game.wardrobeAnim = { state: 'closing', t0: performance.now() };
  sfx('wardrobe');
  lifetime.setTimeout((): GameValue => {
    if (game.wardrobeAnim.state === 'closing') game.wardrobeAnim.state = 'closed';
  }, 500);
}

export function openWardrobeModal(..._args: GameValue[]): GameValue {
  const panel: GameValue = document.querySelector('#wardrobe-modal .shop-panel');
  panel.classList.remove('opening');
  void panel.offsetWidth; // riavvia l'animazione CSS
  panel.classList.add('opening');
  renderWardrobe();
  dom('wardrobe-modal').classList.remove('hidden');
  startPreviewLoop();
}

export function renderWardrobe(..._args: GameValue[]): GameValue {
  const counts: GameValue = {};
  game.SLOTS.forEach(
    (sl?: GameValue): GameValue =>
      (counts[sl] = game.shopCatalog.filter(
        (i?: GameValue): GameValue => i.slot === sl && ownsItem(i.id),
      ).length),
  );
  const total: GameValue = game.SLOTS.reduce(
    (n?: GameValue, sl?: GameValue): GameValue => n + counts[sl],
    0,
  );
  dom('wardrobe-count').textContent = `${total} capi`;
  renderTabs(
    'wardrobe-tabs',
    game.wardrobeSlot,
    (sl?: GameValue): GameValue => {
      game.wardrobeSlot = sl;
      renderWardrobe();
    },
    counts,
  );
  const box: GameValue = dom('wardrobe-items-container');
  box.innerHTML = '';
  const items: GameValue = game.shopCatalog.filter(
    (i?: GameValue): GameValue => i.slot === game.wardrobeSlot && ownsItem(i.id),
  );
  if (game.OPTIONAL_SLOTS.includes(game.wardrobeSlot))
    items.unshift({ id: null, slot: game.wardrobeSlot, name: 'Niente', color: '#57606f' });
  items.forEach((it?: GameValue): GameValue => {
    const on: GameValue =
      game.player.equipped[game.wardrobeSlot] === it.id ||
      (!it.id && !game.player.equipped[game.wardrobeSlot]);
    const card: GameValue = document.createElement('div');
    card.className = 'item-card' + (on ? ' selected' : '');
    card.innerHTML =
      `${it.id ? itemThumbHtml(it) : '<div class="swatch" style="background:#2f3542">🚫</div>'}<div>${it.name}</div>` +
      `<div class="btn-row"><button type="button" class="${on ? 'on' : ''}">${on ? 'Indossato ✓' : 'Indossa'}</button></div>`;
    card.onclick = (): GameValue => equipItem(game.wardrobeSlot, it.id);
    box.appendChild(card);
  });
  paintItemThumbs(box);
  if (items.length <= (game.OPTIONAL_SLOTS.includes(game.wardrobeSlot) ? 1 : 0)) {
    const p: GameValue = document.createElement('div');
    p.style.cssText = 'grid-column: 1 / -1; color: #aaa; font-size: 0.8rem; padding: 8px;';
    p.textContent =
      '🛍️ Non hai ancora niente qui: passa dal Negozio di Vestiti (uscita del condominio, nel cortile) o compra online dal PC!';
    box.appendChild(p);
  }
}

export function equipItem(slot?: GameValue, id?: GameValue): GameValue {
  if (game.player.equipped[slot] === id) return;
  game.player.equipped[slot] = id;
  game.player.stats.outfits = (game.player.stats.outfits || 0) + 1;
  sfx('click');
  renderWardrobe();
  saveGame(false);
}

export function returnHomeFromActivity(..._args: GameValue[]): GameValue {
  if (performance.now() < game.smokeUntil) return;
  if (hasRoom()) game.currentApt = game.aptOfRoom(game.myAssignedRoomIdx);
  backToCourtyardGate();
  dom('btn-return-home').classList.add('hidden');
}

/** Il secondo pulsante vicino a un oggetto; `which` è '2' per il terzo (solo la cuccia del cane). */
export async function handleSubAction(which?: GameValue): Promise<void> {
  if (
    game.view.activeEnvironment === 'PLAYER_ROOM' &&
    PET_OF_KEY[game.activeTargetProp] &&
    isMyRoomNow()
  ) {
    const kind = PET_OF_KEY[game.activeTargetProp];
    // il cane ha due pulsanti in più: passeggiata e nome; gli altri solo il nome
    if (kind === 'dog' && which !== '2') {
      startDogWalk();
      dom('btn-act-sub').classList.add('hidden');
      dom('btn-act-sub2').classList.add('hidden');
    } else await renamePet(kind);
    return;
  }
  if (
    game.view.activeEnvironment === 'PLAYER_ROOM' &&
    game.activeTargetProp === 'safe' &&
    isMyRoomNow()
  ) {
    changeSafePin();
    return;
  }
  // al fornello, con cibo da cucinare e piatti pronti: il secondo pulsante li mangia
  if (game.view.activeEnvironment === 'KITCHEN' && game.activeTargetProp === 'stove') {
    eatDish();
    return;
  }
  if (
    game.view.activeEnvironment === 'KITCHEN' &&
    game.activeTargetProp === 'fridge' &&
    game.view.fridgeIsOpen
  ) {
    if (game.player.rawFood >= FOOD_STACK_MAX) {
      toast(`🎒 Nello zaino hai già ${FOOD_STACK_MAX} pezzi di cibo crudo: cucinane un po'!`);
      return;
    }
    if (game.moneyLevel < 5) {
      toast('Non hai abbastanza soldi per prendere il cibo! Ti servono 5 Đ.');
      return;
    }
    if (!(await spendMoney(5))) return;
    recordActivity('pizza');
    game.player.rawFood++;
    toast(`Hai preso del cibo! (-5 Đ) 🍎 Nello zaino: ${game.player.rawFood}`);
    saveGame(false);
  }
}

/** Accende o spegne la modalità Arreda (solo nella propria stanza). */
export function setArrangeMode(on: boolean): void {
  game.arrangeMode = on;
  const b: GameValue = dom('btn-arrange');
  b.classList.toggle('on', on);
  b.textContent = on ? '✅ Fatto' : '🛠️ Arreda';
  if (on) toast('🛠️ Avvicinati a un mobile per spostarlo', 2500);
}

export function startMovingFurniture(..._args: GameValue[]): GameValue {
  if (!game.activeTargetProp) return;
  game.isMovingFurnitureMode = true;
  game.isDraggingFurniture = false;
  game.movingPropKey = game.activeTargetProp;
  dom('pop-interaction').classList.add('hidden');
  dom('btn-place-furniture').classList.remove('hidden');
  const moving = game.movingPropKey ? getCurrentFurnitureMap()[game.movingPropKey] : undefined;
  dom('btn-rotate-furniture').classList.toggle('hidden', !moving || !!moving.wallItem);
  const isTouch: GameValue = 'ontouchstart' in browser || navigator.maxTouchPoints > 0;
  toast(
    isTouch
      ? '🖐️ Trascina il mobile col dito, giralo con 🔄 Ruota, poi premi 📌 Lascia Mobile'
      : '🖐️ Trascina il mobile col mouse oppure usa WASD/frecce, giralo con R. Poi premi 📌 Lascia Mobile o E',
    4500,
  );
}

export function placeFurniture(..._args: GameValue[]): GameValue {
  game.isMovingFurnitureMode = false;
  game.isDraggingFurniture = false;
  game.movingPropKey = null;
  dom('btn-place-furniture').classList.add('hidden');
  dom('btn-rotate-furniture').classList.add('hidden');
  toast('✅ Mobile posizionato con successo!');
  saveGame(true); // salva subito la posizione (e la pubblica per chi visita la stanza)
}

// Gira di un quarto di giro il mobile che si sta spostando (davanti verso i 4 assi).
export function rotateFurniture(..._args: GameValue[]): GameValue {
  if (!game.isMovingFurnitureMode || !game.movingPropKey) return;
  const obj = getCurrentFurnitureMap()[game.movingPropKey];
  if (!obj || obj.wallItem) return;
  obj.rot = ((obj.rot || 0) + 1) % 4;
  setFurniturePosition(obj, obj.x, obj.y); // l'ingombro cambia: resta dentro la stanza
  sfx('click');
}
