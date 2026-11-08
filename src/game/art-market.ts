// quadrivendo.it: il sito delle aste dei quadri, come il catalogo della Galleria d'Arte ma con la
// grafica di un sito internet. "All'asta": tutti i quadri in vendita, da votare e per cui fare
// offerte. "I miei quadri": le mie aste (accetto l'offerta migliore o ritiro il quadro), le mie
// offerte e i quadri appesi in casa, che sono miei per sempre. Le aste stanno in auctions.ts.
import { artistOffer, levelOf } from './personality-rules.js';
import { askPaintingTitle, canNamePainting, quotedTitle } from './painting-titles.js';
import { escapeHtmlSafe } from './needs.js';
import { game } from './context.js';
import { dom } from './runtime.js';
import { hasRoom } from './saves.js';
import { paintingImage } from './render/scenes.js';
import { botTier } from './art-market-rules.js';
import { PAINTING_SLOTS, roomPaintings } from './painting-rules.js';
import type { Auction } from './auction-rules.js';
import {
  acceptBid,
  auctionHungPainting,
  auctions,
  auctionsSoldToMe,
  completePurchase,
  discardAuction,
  myExpiring,
  onAuctionsChange,
  placeBid,
  startAuctions,
  toggleVote,
  withdrawAuction,
} from './auctions.js';

const dindini = (n: number) => `${n.toLocaleString('it-IT')} Đ`;
const sold = () => game.player.stats.paintingsSold || 0;
/** Livello da Artista (0 = non lo è): più è alto, più offrono i collezionisti. */
const isArtist = () => levelOf(game.player.personality, 'artist');
const me = () => game.session.myPlayerId;
let tab: 'gallery' | 'mine' = 'gallery';

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
    `🔨 Qui i quadri si vendono all'asta: <b>il prezzo lo fanno le offerte dei giocatori</b> e il pittore accetta quella che preferisce.` +
    `<br>🖼️ Quadri venduti: <b>${sold()}</b> · Offerte dei collezionisti: <b>${artistOffer(tier.min, isArtist())}–${artistOffer(tier.max, isArtist())} Đ</b>` +
    (isArtist() ? ' <span style="color:#fdcb6e">(🎨 +25% da Artista)</span>' : '');
  for (const b of document.querySelectorAll<HTMLButtonElement>('[data-art-tab]'))
    b.classList.toggle('active', b.dataset.artTab === tab);
  const list = dom('art-list');
  const scroll = list.scrollTop;
  list.innerHTML = '';
  if (tab === 'gallery') renderAuctions(list);
  else renderMine(list);
  list.scrollTop = scroll;
}

export function setArtTab(next: string): void {
  tab = next === 'mine' ? 'mine' : 'gallery';
  renderArtSite();
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
  b.className = 'btn-primary art-btn';
  b.style.background = color;
  b.textContent = label;
  b.onclick = onClick;
  return b;
}

const titleOf = (a: Auction) => escapeHtmlSafe(quotedTitle(a.code)) || 'Senza titolo';
const bestLine = (a: Auction) =>
  a.bid
    ? `💰 Offerta migliore: <b>${dindini(a.bid.amt)}</b> (${a.bid.by === me() ? 'tu' : escapeHtmlSafe(a.bid.name)})`
    : '💰 Nessuna offerta: fai la prima!';

function voteButton(a: Auction): HTMLButtonElement {
  const mine = a.by === me();
  const voted = a.voters.has(me());
  const n = a.voters.size;
  const b = button(
    mine ? `❤️ ${n}` : voted ? `❤️ Votato (${n})` : `🤍 Vota (${n})`,
    voted ? '#d63031' : '#e84393',
    () => void toggleVote(a),
  );
  b.disabled = mine;
  return b;
}

function renderAuctions(list: HTMLElement): void {
  const items = auctions();
  if (!items.length) {
    list.innerHTML =
      '<p class="art-empty">Nessun quadro all’asta al momento. Dipingine uno nel Laboratorio Artistico e mettilo all’asta!</p>';
    return;
  }
  for (const a of items) {
    const mine = a.by === me();
    const el = card(a.code, titleOf(a), [
      mine ? 'Il tuo quadro' : `di ${escapeHtmlSafe(a.name)}`,
      bestLine(a),
    ]);
    el.appendChild(voteButton(a));
    if (!mine) el.appendChild(button("💰 Fai un'offerta", '#2ed573', () => void placeBid(a)));
    list.appendChild(el);
  }
}

function section(list: HTMLElement, text: string, empty?: string): void {
  const h = document.createElement('div');
  h.className = 'art-section';
  h.textContent = text;
  list.appendChild(h);
  if (empty) list.insertAdjacentHTML('beforeend', `<p class="art-empty">${empty}</p>`);
}

function renameButton(code: string): HTMLButtonElement | null {
  if (!canNamePainting(code)) return null;
  return button(quotedTitle(code) ? '✏️ Cambia nome' : '✏️ Dai un nome', '#6c5ce7', async () => {
    await askPaintingTitle(code, 'Come si chiama questo quadro?');
    renderArtSite();
  });
}

function renderMine(list: HTMLElement): void {
  if (!hasRoom()) {
    list.innerHTML =
      '<p class="art-empty">Ti serve una stanza per dipingere e comprare quadri.</p>';
    return;
  }
  const mineOpen = auctions().filter((a) => a.by === me());
  section(
    list,
    "🔨 I miei quadri all'asta",
    mineOpen.length
      ? undefined
      : 'Nessuno. Quando finisci un quadro nel Laboratorio Artistico puoi metterlo all’asta.',
  );
  for (const a of mineOpen) {
    const el = card(a.code, titleOf(a), [`❤️ ${a.voters.size} cuoricini`, bestLine(a)]);
    if (a.bid)
      el.appendChild(
        button(`🤝 Accetta ${dindini(a.bid.amt)}`, '#2ed573', () => void acceptBid(a)),
      );
    const rename = renameButton(a.code);
    if (rename) el.appendChild(rename);
    el.appendChild(button('🖼️ Ritira e appendi in casa', '#636e72', () => void withdrawAuction(a)));
    list.appendChild(el);
  }
  // spazio espositivo terminato: da appendere o buttare entro la scadenza
  const expiring = myExpiring();
  if (expiring.length) section(list, '⏳ Spazio espositivo terminato: appendili o buttali');
  for (const a of expiring) {
    const el = card(a.code, titleOf(a), [
      `⏳ Va tolto entro <b>${new Date(a.expiresAt!).toLocaleDateString('it-IT', { day: 'numeric', month: 'long' })}</b>, poi viene buttato`,
    ]);
    el.appendChild(button('🖼️ Appendi in camera', '#2ed573', () => void withdrawAuction(a, false)));
    el.appendChild(button('🗑️ Butta via', '#636e72', () => void discardAuction(a)));
    list.appendChild(el);
  }
  // offerte accettate dal pittore e non ancora pagate, e quelle in cui sono il migliore
  const toPay = auctionsSoldToMe();
  const bidding = auctions().filter((a) => a.bid?.by === me());
  if (toPay.length || bidding.length) section(list, '💰 Le mie offerte');
  for (const a of toPay) {
    const el = card(a.code, titleOf(a), [
      `di ${escapeHtmlSafe(a.name)}`,
      a.sold!.paid
        ? `✅ Comprato per <b>${dindini(a.sold!.amt)}</b>: è tuo, manca solo da appenderlo`
        : `🤝 Offerta accettata: <b>${dindini(a.sold!.amt)}</b>`,
    ]);
    // pagato al pittore quando ha accettato: resta solo da scegliere dove appenderlo
    el.appendChild(
      a.sold!.paid
        ? button('🖼️ Appendi in casa', '#2ed573', () => void completePurchase(a))
        : button('🛒 Paga e appendi', '#2ed573', () => void completePurchase(a)),
    );
    list.appendChild(el);
  }
  for (const a of bidding)
    list.appendChild(
      card(a.code, titleOf(a), [
        `di ${escapeHtmlSafe(a.name)}`,
        `💰 La tua è l'offerta migliore: <b>${dindini(a.bid!.amt)}</b>`,
      ]),
    );
  const hung = roomPaintings(game.roomsState[game.myAssignedRoomIdx ?? -1]);
  const slots = PAINTING_SLOTS.filter((slot) => hung[slot]);
  section(
    list,
    '🏠 Appesi in casa (tuoi: nessuno può fare offerte, a meno che li metti tu all’asta)',
    slots.length ? undefined : 'Nessun quadro appeso nella tua stanza.',
  );
  for (const slot of slots) {
    const code = hung[slot]!;
    const el = card(code, escapeHtmlSafe(quotedTitle(code)) || 'Senza titolo', [
      'Appeso nella tua stanza',
    ]);
    const rename = renameButton(code);
    if (rename) el.appendChild(rename);
    el.appendChild(button("🔨 Metti all'asta", '#e17055', () => void auctionHungPainting(slot)));
    list.appendChild(el);
  }
}

/** Avvia le aste (una volta per sessione): il sito si aggiorna da solo quando cambiano. */
export function startArtMarket(): void {
  startAuctions();
  onAuctionsChange(renderArtSite);
}
