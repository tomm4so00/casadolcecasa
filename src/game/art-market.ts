import { artistOffer, levelOf } from './personality-rules.js';
import { postGossip } from './gossip.js';
import { askPaintingTitle, canNamePainting, quotedTitle } from './painting-titles.js';
import { notePersonality } from './personality.js';
import { escapeHtmlSafe } from './needs.js';
import type { GameValue } from './context.js';
import { game } from './context.js';
import { dom, lifetime } from './runtime.js';
import { toast } from './missions.js';
import { openDialog } from './interface.js';
import { saveGame, hasRoom, withTimeout } from './saves.js';
import { sfx } from './audio.js';
import { sendNotify } from './needs.js';
import { sendSocial } from './social.js';
import { paintingImage } from './render/scenes.js';
import { chooseSlotToReplace } from './paint-studio.js';
import {
  type MarketItem,
  SALE_PRICE_MAX,
  SALE_PRICE_MIN,
  botOfferAmount,
  botTier,
  decodeListing,
  isValidPrice,
  listingSeed,
  marketItems,
  newListing,
  nextOfferTime,
} from './art-market-rules.js';
import {
  PAINTING_SLOTS,
  type PaintingSlot,
  firstFreeSlot,
  roomPaintings,
} from './painting-rules.js';
import { worldNode } from './world-db.js';

const euro = (n: number) => `${n.toLocaleString('it-IT')} €`;
const sold = () => game.player.stats.paintingsSold || 0;
/** Livello da Artista (0 = non lo è): più è alto, più offrono i collezionisti. */
const isArtist = () => levelOf(game.player.personality, 'artist');
let tab: 'gallery' | 'mine' = 'gallery';
let offerOpen = false;

/** Indice della propria stanza (-1 se non se ne ha una). */
const myIdx = (): number => game.myAssignedRoomIdx ?? -1;
const myRoomPath = () => `${worldNode('rooms_state')}/${myIdx()}`;
const myRoom = (): GameValue => game.roomsState[myIdx()];

// ---------------------------------------------------------------- sito

export function openArtSite(): void {
  dom('art-modal').classList.remove('hidden');
  renderArtSite();
}

export function renderArtSite(): void {
  const modal = dom('art-modal');
  if (!modal || modal.classList.contains('hidden')) return;
  const tier = botTier(sold());
  dom('art-summary').innerHTML =
    `🖼️ Quadri venduti: <b>${sold()}</b> · Offerte dei collezionisti: <b>${artistOffer(tier.min, isArtist())}–${artistOffer(tier.max, isArtist())} €</b>` +
    (isArtist() ? ' <span style="color:#fdcb6e">(🎨 +25% da Artista)</span>' : '') +
    `<br><span style="color:#aaa">Più quadri vendi, più alte diventano le offerte.</span>`;
  for (const b of document.querySelectorAll<HTMLButtonElement>('[data-art-tab]'))
    b.classList.toggle('active', b.dataset.artTab === tab);
  const list = dom('art-list');
  list.innerHTML = '';
  if (tab === 'gallery') renderGallery(list);
  else renderMine(list);
}

function thumb(code: string): HTMLCanvasElement {
  const cv = document.createElement('canvas');
  cv.width = 160;
  cv.height = 120;
  cv.className = 'art-thumb';
  const img = paintingImage(code);
  const ctx = cv.getContext('2d');
  if (img && ctx) {
    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(img, 0, 0, cv.width, cv.height);
  }
  return cv;
}

function card(code: string, title: string, lines: string[]): HTMLDivElement {
  const el = document.createElement('div');
  el.className = 'art-card';
  const frame = document.createElement('div');
  frame.className = 'art-frame';
  frame.appendChild(thumb(code));
  el.appendChild(frame);
  const info = document.createElement('div');
  info.className = 'art-info';
  info.innerHTML = `<b>${title}</b>` + lines.map((l) => `<div>${l}</div>`).join('');
  el.appendChild(info);
  return el;
}

function button(label: string, color: string, onClick: () => void): HTMLButtonElement {
  const b = document.createElement('button');
  b.type = 'button';
  b.className = 'art-btn';
  b.style.background = color;
  b.textContent = label;
  b.onclick = onClick;
  return b;
}

function renderGallery(list: HTMLElement): void {
  const items = marketItems(game.roomsState);
  if (!items.length) {
    list.innerHTML =
      '<p class="art-empty">Nessun quadro in vendita al momento. Dipingine uno nel Laboratorio Artistico e mettilo in vendita!</p>';
    return;
  }
  for (const item of items) {
    const mine = item.ownerId === game.session.myPlayerId;
    const name = escapeHtmlSafe(quotedTitle(item.code));
    const el = card(item.code, name || (mine ? 'Il tuo quadro' : 'Senza titolo'), [
      mine ? 'Il tuo quadro' : `di ${escapeHtmlSafe(item.owner)}`,
      `💰 <b>${euro(item.listing.price)}</b>`,
    ]);
    if (!mine) el.appendChild(button('🛒 Compra', '#2ed573', () => void buyPainting(item)));
    list.appendChild(el);
  }
}

function renderMine(list: HTMLElement): void {
  if (!hasRoom()) {
    list.innerHTML =
      '<p class="art-empty">Ti serve una stanza per appendere e vendere i quadri.</p>';
    return;
  }
  const room = myRoom();
  const hung = roomPaintings(room);
  const slots = PAINTING_SLOTS.filter((slot) => hung[slot]);
  if (!slots.length) {
    list.innerHTML =
      '<p class="art-empty">Non hai quadri appesi. Dipingine uno nel Laboratorio Artistico!</p>';
    return;
  }
  for (const slot of slots) {
    const listing = decodeListing(room?.sale?.[slot]);
    const code = hung[slot]!;
    const el = card(code, escapeHtmlSafe(quotedTitle(code)) || 'Senza titolo', [
      listing ? `🏷️ In vendita a <b>${euro(listing.price)}</b>` : 'Appeso nella tua stanza',
    ]);
    if (canNamePainting(code))
      el.appendChild(
        button(quotedTitle(code) ? '✏️ Cambia nome' : '✏️ Dai un nome', '#6c5ce7', async () => {
          await askPaintingTitle(code, 'Come si chiama questo quadro?');
          renderArtSite();
        }),
      );
    if (listing)
      el.appendChild(button('↩️ Ritira dalla vendita', '#636e72', () => void unlist(slot)));
    else {
      const input = document.createElement('input');
      input.type = 'number';
      input.min = String(SALE_PRICE_MIN);
      input.max = String(SALE_PRICE_MAX);
      input.placeholder = 'Prezzo in €';
      input.className = 'art-price';
      el.appendChild(input);
      el.appendChild(
        button(
          '🏷️ Metti in vendita',
          '#e17055',
          () => void listPainting(slot, Number(input.value)),
        ),
      );
    }
    list.appendChild(el);
  }
}

export function setArtTab(next: string): void {
  tab = next === 'mine' ? 'mine' : 'gallery';
  renderArtSite();
}

// ---------------------------------------------------------------- vendita

async function listPainting(slot: PaintingSlot, price: number): Promise<void> {
  if (!isValidPrice(price)) {
    toast(`Scegli un prezzo intero fra ${SALE_PRICE_MIN} e ${euro(SALE_PRICE_MAX)}.`, 3500);
    return;
  }
  const now = Date.now();
  try {
    await game.session.db
      .ref(`${myRoomPath()}/sale/${slot}`)
      .set(newListing(price, now, listingSeed(myIdx(), slot, now)));
    sfx('coin');
    toast(
      `🏷️ Quadro in vendita a ${euro(price)}. Gli altri giocatori lo vedono su quadrivendo.it e prima o poi arriverà anche l'offerta di un collezionista.`,
      5000,
    );
  } catch (error) {
    console.warn('[arte]', error);
    toast('Messa in vendita non riuscita. Riprova quando sei connesso.', 4000);
  }
  renderArtSite();
}

async function unlist(slot: PaintingSlot): Promise<void> {
  try {
    await game.session.db.ref(`${myRoomPath()}/sale/${slot}`).remove();
    toast('Il quadro non è più in vendita.', 2500);
  } catch (error) {
    console.warn('[arte]', error);
  }
  renderArtSite();
}

// ---------------------------------------------------------------- acquisto da un altro giocatore

async function buyPainting(item: MarketItem): Promise<void> {
  if (!hasRoom()) {
    toast('🏠 Ti serve una stanza dove appendere il quadro.', 3500);
    return;
  }
  if (game.moneyLevel < item.listing.price) {
    toast(`❌ Ti servono ${euro(item.listing.price)} in cassaforte.`, 3500);
    return;
  }
  const ok: GameValue = await openDialog({
    title: '🛒 Comprare il quadro?',
    text: `Quadro di ${item.owner} a ${euro(item.listing.price)}. Verrà appeso nella tua stanza.`,
    buttons: [
      { label: 'Annulla', value: null, color: '#57606f' },
      { label: `Compra (${euro(item.listing.price)})`, value: 'buy', color: '#2ed573' },
    ],
  });
  if (ok.action !== 'buy') return;
  const target = firstFreeSlot(myRoom()) ?? (await chooseSlotToReplace());
  if (!target) return;
  const me = myIdx();
  let committed = false;
  try {
    const reference = game.session.db.ref(worldNode('rooms_state'));
    await reference.get();
    const result = await withTimeout(
      reference.transaction((rooms: GameValue) => {
        if (!rooms) return undefined;
        const seller = rooms[item.roomIdx],
          buyer = rooms[me];
        if (!seller || !buyer || seller.ownerId !== item.ownerId) return undefined;
        if (buyer.ownerId !== game.session.myPlayerId) return undefined;
        const listing = decodeListing(seller.sale?.[item.slot]);
        const code = seller.paintings?.[item.slot];
        // l'annuncio deve essere ancora lo stesso, con lo stesso prezzo
        if (!listing || listing.t !== item.listing.t || listing.price !== item.listing.price)
          return undefined;
        if (typeof code !== 'string' || !(buyer.vaultMoney >= listing.price)) return undefined;
        const sellerPaintings = { ...(seller.paintings || {}) };
        delete sellerPaintings[item.slot];
        const sellerSale = { ...(seller.sale || {}) };
        delete sellerSale[item.slot];
        const buyerSale = { ...(buyer.sale || {}) };
        delete buyerSale[target];
        rooms[item.roomIdx] = {
          ...seller,
          vaultMoney: seller.vaultMoney + listing.price,
          paintings: sellerPaintings,
          sale: sellerSale,
        };
        rooms[me] = {
          ...rooms[me],
          vaultMoney: buyer.vaultMoney - listing.price,
          paintings: { ...(buyer.paintings || {}), [target]: code },
          sale: buyerSale,
        };
        return rooms;
      }),
      10000,
    );
    committed = !!result?.committed;
  } catch (error) {
    console.warn('[arte]', error);
  }
  if (!committed) {
    toast('Acquisto non riuscito: il quadro potrebbe essere già stato venduto.', 4000);
    renderArtSite();
    return;
  }
  await sendSocial(item.ownerId, { type: 'artSold', amt: item.listing.price });
  game.player.stats.paintingsBought = (game.player.stats.paintingsBought || 0) + 1;
  notePersonality('buyPainting');
  saveGame(true);
  sfx('success');
  toast(`🖼️ Hai comprato il quadro di ${item.owner}! È appeso nella tua stanza.`, 4500);
  postGossip(
    `${game.player.myData.nick} ha comprato ${quotedTitle(item.code) || 'un quadro'} di ${item.owner} per ${euro(item.listing.price)} 🖼️`,
    [item.ownerId],
  );
  renderArtSite();
}

/** Il venditore riceve l'avviso che un giocatore ha comprato il suo quadro. */
export function onArtSold(buyer: string, amount: number): void {
  game.player.stats.paintingsSold = sold() + 1;
  notePersonality('sellPainting');
  saveGame(false);
  const text = `🖼️ ${buyer} ha comprato il tuo quadro per ${euro(amount)}!`;
  toast(text, 6000);
  sendNotify('Quadro venduto!', text, 'art-sold');
  renderArtSite();
}

// ---------------------------------------------------------------- offerte dei collezionisti

/** Controlla gli annunci: se è arrivato il momento, un collezionista fa la sua offerta. */
async function checkBotOffers(): Promise<void> {
  if (offerOpen || game.dialogResolve || !hasRoom() || game.player.isDead) return;
  const room = myRoom();
  const hung = roomPaintings(room);
  const now = Date.now();
  for (const slot of PAINTING_SLOTS) {
    const listing = decodeListing(room?.sale?.[slot]);
    if (!listing || !hung[slot] || now < listing.nextOfferAt) continue;
    offerOpen = true;
    try {
      await showBotOffer(slot, listing);
    } finally {
      offerOpen = false;
    }
    return; // una offerta alla volta
  }
}

async function showBotOffer(slot: PaintingSlot, listing: GameValue): Promise<void> {
  const seed = listingSeed(myIdx(), slot, listing.t);
  // l'Artista riceve offerte più alte
  const amount = artistOffer(botOfferAmount(sold(), seed, listing.round), isArtist());
  // il quadro si chiama col suo titolo; senza titolo è semplicemente "il tuo quadro"
  const title = quotedTitle(roomPaintings(myRoom())[slot]);
  const what = title ? `il tuo quadro ${title}` : 'il tuo quadro';
  sendNotify(
    '🖼️ Offerta per il tuo quadro',
    `Un collezionista offre ${euro(amount)} per ${what}.`,
    'art-offer',
  );
  sfx('mission');
  const res: GameValue = await openDialog({
    title: '🎩 Offerta di un collezionista',
    text:
      `Un collezionista ha visto ${what} su quadrivendo.it e offre ${euro(amount)}.\n\n` +
      `Il tuo prezzo di vendita è ${euro(listing.price)}. Se accetti, il quadro lascia la tua stanza; ` +
      `se rifiuti resta in vendita e più avanti potrebbe arrivare un'altra offerta.`,
    buttons: [
      { label: 'Rifiuta', value: 'no', color: '#57606f' },
      { label: `Accetta (${euro(amount)})`, value: 'yes', color: '#2ed573' },
    ],
  });
  if (res.action === 'yes') await acceptBotOffer(slot, listing, amount);
  else await declineBotOffer(slot, listing, seed);
  renderArtSite();
}

async function acceptBotOffer(slot: PaintingSlot, listing: GameValue, amount: number) {
  let committed = false;
  // il nome si legge prima della vendita, quando il quadro è ancora appeso
  const name = quotedTitle(roomPaintings(myRoom())[slot]);
  try {
    const reference = game.session.db.ref(myRoomPath());
    await reference.get();
    const result = await withTimeout(
      reference.transaction((room: GameValue) => {
        if (!room || room.ownerId !== game.session.myPlayerId) return undefined;
        const current = decodeListing(room.sale?.[slot]);
        if (!current || current.t !== listing.t || !room.paintings?.[slot]) return undefined;
        const paintings = { ...room.paintings };
        delete paintings[slot];
        const sale = { ...(room.sale || {}) };
        delete sale[slot];
        return { ...room, vaultMoney: (room.vaultMoney || 0) + amount, paintings, sale };
      }),
      10000,
    );
    committed = !!result?.committed;
  } catch (error) {
    console.warn('[arte]', error);
  }
  if (!committed) {
    toast('Vendita non riuscita: riprova quando sei connesso.', 4000);
    return;
  }
  game.player.stats.paintingsSold = sold() + 1;
  notePersonality('sellPainting');
  saveGame(true);
  sfx('coin');
  postGossip(
    `${game.player.myData.nick} ha venduto ${name || 'un quadro'} a un collezionista per ${euro(amount)} 🖼️`,
  );
  const tier = botTier(sold());
  toast(
    `💰 Quadro venduto al collezionista per ${euro(amount)}! Quadri venduti: ${sold()} (prossime offerte ${artistOffer(tier.min, isArtist())}–${artistOffer(tier.max, isArtist())} €).`,
    6000,
  );
}

async function declineBotOffer(slot: PaintingSlot, listing: GameValue, seed: string) {
  const round = (listing.round || 0) + 1;
  try {
    await game.session.db.ref(`${myRoomPath()}/sale/${slot}`).update({
      round,
      nextOfferAt: nextOfferTime(Date.now(), seed, round),
    });
  } catch (error) {
    console.warn('[arte]', error);
  }
  toast('Offerta rifiutata: il quadro resta in vendita.', 3000);
}

/** Avvia il controllo periodico delle offerte (una volta per sessione). */
export function startArtMarket(): void {
  lifetime.setTimeout(() => void checkBotOffers(), 4000);
  lifetime.setInterval(() => void checkBotOffers(), 20000);
}
