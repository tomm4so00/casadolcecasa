// Mercato dei quadri (senza dipendenze dal browser, così è testabile).
import { PAINTING_SLOTS, type PaintingSlot, isValidPainting } from './painting-rules.js';

export const SALE_PRICE_MIN = 1;
export const SALE_PRICE_MAX = 100_000;
/** Primo e ultimo momento possibile per l'offerta di un collezionista dopo la messa in vendita. */
export const BOT_DELAY_MIN_MS = 3 * 3600 * 1000;
export const BOT_DELAY_MAX_MS = 72 * 3600 * 1000;

/** Offerte dei collezionisti: crescono con i quadri già venduti. */
export const BOT_TIERS = [
  { fromSold: 0, min: 10, max: 50 },
  { fromSold: 3, min: 30, max: 90 },
  { fromSold: 7, min: 70, max: 150 },
  { fromSold: 15, min: 150, max: 300 },
] as const;

export interface SaleListing {
  price: number;
  /** Momento della messa in vendita. */
  t: number;
  /** Quando arriva la prossima offerta di un collezionista. */
  nextOfferAt: number;
  /** Quante offerte sono già state rifiutate (cambia importo e momento della successiva). */
  round: number;
}

export function isValidPrice(price: unknown): price is number {
  return (
    Number.isSafeInteger(price) &&
    (price as number) >= SALE_PRICE_MIN &&
    (price as number) <= SALE_PRICE_MAX
  );
}

export function botTier(sold: number) {
  return [...BOT_TIERS].reverse().find((tier) => sold >= tier.fromSold) ?? BOT_TIERS[0];
}

/** Numero pseudo-casuale stabile in [0, 1): stessi dati, stesso risultato. */
export function seeded(...parts: (number | string)[]): number {
  let h = 2166136261;
  for (const ch of parts.join('|')) {
    h ^= ch.charCodeAt(0);
    h = Math.imul(h, 16777619);
  }
  h ^= h >>> 13;
  h = Math.imul(h, 1274126177);
  h ^= h >>> 16;
  return (h >>> 0) / 4294967296;
}

/** Momento della prossima offerta: fra qualche ora e qualche giorno. */
export function nextOfferTime(from: number, seedKey: string, round: number): number {
  const k = seeded('delay', seedKey, round);
  return from + Math.round(BOT_DELAY_MIN_MS + k * (BOT_DELAY_MAX_MS - BOT_DELAY_MIN_MS));
}

/** Importo dell'offerta del collezionista, in base ai quadri già venduti. */
export function botOfferAmount(sold: number, seedKey: string, round: number): number {
  const tier = botTier(sold);
  return Math.round(tier.min + seeded('offer', seedKey, round) * (tier.max - tier.min));
}

export function newListing(price: number, now: number, seedKey: string): SaleListing {
  return { price, t: now, nextOfferAt: nextOfferTime(now, seedKey, 0), round: 0 };
}

/** Chiave che rende unici importi e tempi delle offerte di un annuncio. */
export const listingSeed = (roomIdx: number, slot: PaintingSlot, t: number) =>
  `${roomIdx}:${slot}:${t}`;

export function decodeListing(value: unknown): SaleListing | null {
  if (!value || typeof value !== 'object') return null;
  const v = value as Record<string, unknown>;
  if (!isValidPrice(v.price) || !Number.isFinite(v.t) || !Number.isFinite(v.nextOfferAt))
    return null;
  return {
    price: v.price,
    t: v.t as number,
    nextOfferAt: v.nextOfferAt as number,
    round: Number.isSafeInteger(v.round) ? (v.round as number) : 0,
  };
}

export interface MarketItem {
  roomIdx: number;
  slot: PaintingSlot;
  ownerId: string;
  owner: string;
  code: string;
  listing: SaleListing;
}

/** Tutti i quadri in vendita: annunci validi con il quadro ancora appeso. */
export function marketItems(rooms: unknown[]): MarketItem[] {
  const items: MarketItem[] = [];
  rooms.forEach((room, roomIdx) => {
    if (!room || typeof room !== 'object') return;
    const r = room as Record<string, unknown>;
    if (typeof r.ownerId !== 'string') return;
    const sale = (r.sale || {}) as Record<string, unknown>;
    const paintings = (r.paintings || {}) as Record<string, unknown>;
    for (const slot of PAINTING_SLOTS) {
      const listing = decodeListing(sale[slot]);
      const code = paintings[slot];
      if (listing && isValidPainting(code))
        items.push({
          roomIdx,
          slot,
          ownerId: r.ownerId,
          owner: typeof r.owner === 'string' ? r.owner : 'Artista',
          code,
          listing,
        });
    }
  });
  return items.sort((a, b) => b.listing.t - a.listing.t);
}
