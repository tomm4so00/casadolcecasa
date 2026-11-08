// Galleria d'Arte: dal laboratorio artistico si entra in una sala bianca dove sono esposti i dieci
// quadri all'asta con più cuoricini (auction-rules.ts). Al centro, su un leggio, il catalogo delle
// opere: tutti i quadri all'asta nel condominio, da votare e per cui fare offerte.
import { game } from './context.js';
import type { GameValue } from './context.js';
import { dom } from './runtime.js';
import { type Auction, galleryDay, pickExhibition } from './auction-rules.js';
import { paintingTitle } from './painting-titles.js';
import { paintingImage } from './render/scenes.js';
import { openArtSite } from './art-market.js';
import { sfx } from './audio.js';
import { escapeHtmlSafe as escapeHtml } from './needs.js';
import { EXHIBIT_LIMIT } from '../../shared/auction-expiry.js';
import {
  auctionById,
  auctionHungPainting,
  auctions,
  onAuctionsChange,
  placeBid,
  toggleVote,
} from './auctions.js';

export const GALLERY_ENV = 'galleria';
const TITLE = "Galleria d'Arte 🖼️";

// La mostra si ricalcola solo quando cambiano le aste o il giorno (si disegna a ogni fotogramma).
let cache: { open: Auction[]; day: number; pieces: Auction[] } | null = null;

/** I quadri in mostra: i dieci all'asta con più cuoricini, nell'ordine dei posti. */
export function exhibition(): Auction[] {
  const open = auctions();
  const day = galleryDay(Date.now() + (game.session?.serverOffset || 0));
  if (cache?.open !== open || cache.day !== day)
    cache = { open, day, pieces: pickExhibition(open, day) };
  return cache.pieces;
}

/** Il quadro al posto `i` della mostra, oppure null se il posto aspetta ancora un quadro. */
export const pieceAt = (i: number): Auction | null => exhibition()[i] ?? null;

/** Dal laboratorio artistico, attraverso la porta di fondo. */
export function enterGallery(): void {
  game.view.activeEnvironment = GALLERY_ENV;
  game.view.currentRoomTitle = TITLE;
  dom('btn-return-home').classList.add('hidden');
  game.playerPos = { x: 0, y: 150 };
}

/** Di nuovo nel laboratorio, davanti alla porta della galleria. */
export function leaveGallery(): void {
  sfx('door');
  const door: GameValue = game.artStudioFurniture.galleryDoor;
  game.view.activeEnvironment = 'laboratorio';
  game.view.currentRoomTitle = 'Laboratorio Artistico 🎨';
  game.playerPos = { x: door?.x ?? 0, y: -120 };
}

/** Il testo del pulsante vicino a un quadro della mostra. */
export function galleryPrompt(slot: number): { text: string; locked?: boolean } {
  const piece = pieceAt(slot);
  if (!piece) return { text: '🖼️ Posto in attesa di un quadro', locked: true };
  const title = paintingTitle(piece.code);
  return { text: title ? `🖼️ Guarda «${title}»` : `🖼️ Guarda il quadro di ${piece.name}` };
}

export const viewGalleryPiece = (slot: number): void => {
  const piece = pieceAt(slot);
  if (piece) viewPiece(piece.id);
};

// ---------------------------------------------------------------- scheda e catalogo

const isMine = (a: Auction) => a.by === game.session.myPlayerId;
const dindini = (n: number) => `${n.toLocaleString('it-IT')} Đ`;

/** Il quadro dipinto su un canvas grande `w`×`h` (i quadretti restano netti). */
function canvasOf(code: string, w: number, h: number): HTMLCanvasElement {
  const cv = document.createElement('canvas');
  cv.width = w;
  cv.height = h;
  const ctx = cv.getContext('2d');
  const img = paintingImage(code);
  if (ctx && img) {
    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(img, 0, 0, w, h);
  }
  return cv;
}

/** Pulsanti del cuoricino e dell'offerta, uguali nella scheda e nel catalogo. */
function actionButtons(a: Auction): HTMLElement[] {
  const out: HTMLElement[] = [];
  const voted = a.voters.has(game.session.myPlayerId);
  const heart = document.createElement('button');
  heart.type = 'button';
  heart.className = 'btn-primary art-heart' + (voted ? ' voted' : '');
  heart.textContent = isMine(a) ? `❤️ ${a.voters.size}` : voted ? '❤️ Votato' : '🤍 Vota';
  heart.disabled = isMine(a);
  heart.title = isMine(a) ? 'I tuoi quadri li votano gli altri' : 'Dai o togli il tuo cuoricino';
  heart.onclick = () => void toggleVote(a);
  out.push(heart);
  if (!isMine(a)) {
    const offer = document.createElement('button');
    offer.type = 'button';
    offer.className = 'btn-primary art-offer';
    offer.textContent = "💰 Fai un'offerta";
    offer.onclick = () => void placeBid(a);
    out.push(offer);
  }
  return out;
}

const bestOffer = (a: Auction) =>
  a.bid
    ? `Offerta migliore: ${dindini(a.bid.amt)} (${a.bid.by === game.session.myPlayerId ? 'tu' : escapeHtml(a.bid.name)})`
    : 'Nessuna offerta: fai la prima!';

/** Il quadro da vicino, come una scheda di museo; si aggiorna con cuoricini e offerte. */
export function viewPiece(id: string): void {
  const el = modal('gallery-modal');
  const close = () => {
    stop();
    el.classList.add('hidden');
  };
  const render = () => {
    const a = auctionById(id);
    // venduto o ritirato mentre lo si guardava
    if (!a || a.sold) {
      close();
      return;
    }
    const title = paintingTitle(a.code);
    el.innerHTML =
      `<div class="card gallery-card">` +
      `<div class="gallery-view"></div>` +
      `<div class="gallery-label">` +
      `<div class="gallery-title">${title ? escapeHtml(title) : 'Senza titolo'}</div>` +
      `<div class="gallery-artist">${escapeHtml(a.name)}${isMine(a) ? ' (tu)' : ''}</div>` +
      `<div class="gallery-hearts">❤️ ${a.voters.size} ${a.voters.size === 1 ? 'cuoricino' : 'cuoricini'}</div>` +
      `<div class="gallery-meta">Pittura digitale su tela 80 × 60 · All'asta</div>` +
      `<div class="gallery-price">● ${bestOffer(a)}</div>` +
      `</div>` +
      `<div class="gallery-buttons"></div>` +
      `<div class="gallery-buttons"></div></div>`;
    el.querySelector('.gallery-view')!.appendChild(canvasOf(a.code, 320, 240));
    const [row1, row2] = [...el.querySelectorAll('.gallery-buttons')];
    actionButtons(a).forEach((b) => row1.appendChild(b));
    const site = document.createElement('button');
    site.type = 'button';
    site.className = 'btn-primary';
    site.style.background = '#2d3436';
    site.textContent = '🌐 quadrivendo.it';
    site.onclick = () => {
      close();
      closeCatalog();
      openArtSite();
    };
    row2.appendChild(site);
    const shut = document.createElement('button');
    shut.type = 'button';
    shut.className = 'btn-primary';
    shut.style.background = '#57606f';
    shut.textContent = 'Chiudi';
    shut.onclick = close;
    row2.appendChild(shut);
  };
  const stop = onAuctionsChange(render);
  el.onclick = (e) => {
    if (e.target === el) close();
  };
  render();
  if (auctionById(id)) el.classList.remove('hidden');
}

let closeCatalog = () => {};

/** Il catalogo delle opere: tutti i quadri all'asta nel condominio, dal più votato. */
export function openCatalog(): void {
  const el = modal('catalog-modal');
  const close = () => {
    stop();
    el.classList.add('hidden');
  };
  closeCatalog = close;
  const render = () => {
    const scroll = el.querySelector('.catalog-pages')?.scrollTop ?? 0;
    const entries = auctions();
    const shown = new Set(exhibition().map((p) => p.id));
    el.innerHTML =
      `<div class="card catalog-book">` +
      `<div class="catalog-head">` +
      `<div class="catalog-kicker">Galleria d'Arte · Casa dolce casa</div>` +
      `<h3>Catalogo delle opere d'arte</h3>` +
      `<div class="catalog-sub">${entries.length} ${entries.length === 1 ? 'opera' : 'opere'} all'asta su ${EXHIBIT_LIMIT} posti · i dieci quadri con più ❤️ sono esposti in galleria</div>` +
      `<button type="button" class="btn-primary catalog-sell">🔨 Metti all'asta un quadro della tua stanza</button>` +
      `</div><div class="catalog-pages"></div>` +
      `<button type="button" class="btn-primary catalog-close">Chiudi il catalogo</button></div>`;
    const pages = el.querySelector<HTMLElement>('.catalog-pages')!;
    if (!entries.length)
      pages.innerHTML =
        '<p class="catalog-empty">Nessun quadro all\'asta: dipingine uno nel Laboratorio Artistico e mettilo all\'asta.</p>';
    entries.forEach((a, i) => {
      const title = paintingTitle(a.code);
      const item = document.createElement('div');
      item.className = 'catalog-entry';
      const frame = document.createElement('button');
      frame.type = 'button';
      frame.className = 'catalog-frame';
      frame.title = 'Guarda da vicino';
      frame.appendChild(canvasOf(a.code, 160, 120));
      frame.onclick = () => viewPiece(a.id);
      item.appendChild(frame);
      const info = document.createElement('div');
      info.className = 'catalog-info';
      info.innerHTML =
        `<div class="catalog-no">N. ${i + 1}${shown.has(a.id) ? ' · <span class="catalog-shown">in galleria</span>' : ''}</div>` +
        `<div class="catalog-title">${title ? escapeHtml(title) : 'Senza titolo'}</div>` +
        `<div class="catalog-artist">${escapeHtml(a.name)}${isMine(a) ? ' (tu)' : ''}</div>` +
        `<div class="catalog-hearts">❤️ ${a.voters.size}</div>` +
        `<div class="catalog-price">${bestOffer(a)}</div>`;
      const row = document.createElement('div');
      row.className = 'catalog-actions';
      actionButtons(a).forEach((b) => row.appendChild(b));
      info.appendChild(row);
      item.appendChild(info);
      pages.appendChild(item);
    });
    pages.scrollTop = scroll;
    el.querySelector<HTMLButtonElement>('.catalog-close')!.onclick = close;
    el.querySelector<HTMLButtonElement>('.catalog-sell')!.onclick = () =>
      void auctionHungPainting();
  };
  const stop = onAuctionsChange(render);
  el.onclick = (e) => {
    if (e.target === el) close();
  };
  sfx('click');
  render();
  el.classList.remove('hidden');
}

function modal(id: string): HTMLElement {
  let el = document.getElementById(id);
  if (!el) {
    el = document.createElement('div');
    el.id = id;
    el.className = 'fullscreen-modal hidden';
    document.body.appendChild(el);
  }
  return el;
}
