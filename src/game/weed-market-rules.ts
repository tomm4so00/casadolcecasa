// Il prezzo dell'erba dallo spacciatore: domanda contro offerta, uguale in tutti i condomini.
// Il server ogni 15 minuti calcola il riferimento (mediana degli scambi fra giocatori) e la spinta
// (erba comprata e scambiata contro erba raccolta, rispetto alla settimana prima) e li pubblica
// in sims_weed_market; il gioco ne ricava il prezzo della bustina. Niente browser qui.
import { BAG_GRAMS, bagFloorPrice } from './weed-rules.js';

const DAY = 24 * 3_600_000;

/** Prezzo di una bustina quando gli scambi fra giocatori sono troppo pochi per dire qualcosa. */
export const NORMAL_BAG_PRICE = 25;
/** Una bustina non costa mai più di così (prima della retata). */
export const MAX_BAG_PRICE = 60;
/** La spinta della borsa (al massimo ±15% per lato) qui pesa tre volte tanto. */
const PUSH_GAIN = 3;
/** Venditori diversi che servono per fidarsi della mediana degli scambi. */
export const MIN_SELLERS = 3;

/** Uno scambio d'erba accettato, scritto da chi compra in sims_weed_trades/<giorno>/<offerta>. */
export interface WeedTrade {
  g: number;
  price: number;
  seller: string;
  buyer: string;
  t: number;
}

/** Quello che pubblica il server. */
export interface WeedMarket {
  /** Prezzo di riferimento di una bustina (Đ). */
  ref: number;
  /** Domanda meno offerta (logaritmo, circa tra −0,3 e +0,3). */
  push: number;
  t: number;
}

const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));

/**
 * Il riferimento dagli scambi delle ultime 24 ore: la mediana del prezzo per bustina. Non contano
 * i regali, ogni coppia venditore–compratore conta una volta al giorno e ogni prezzo è limitato fra
 * minimo e massimo; servono almeno MIN_SELLERS venditori diversi, se no null.
 */
export function tradeReference(trades: readonly WeedTrade[], now: number): number | null {
  const floor = bagFloorPrice();
  const seen = new Set<string>();
  const sellers = new Set<string>();
  const prices: number[] = [];
  for (const tr of [...trades].sort((a, b) => a.t - b.t)) {
    if (!(tr.g > 0) || !(tr.price > 0) || now - tr.t > DAY || tr.t > now) continue;
    if (tr.seller === tr.buyer) continue;
    const pair = `${tr.seller}|${tr.buyer}|${Math.floor(tr.t / DAY)}`;
    if (seen.has(pair)) continue;
    seen.add(pair);
    sellers.add(tr.seller);
    prices.push(clamp((tr.price / tr.g) * BAG_GRAMS, floor, MAX_BAG_PRICE));
  }
  if (sellers.size < MIN_SELLERS) return null;
  prices.sort((a, b) => a - b);
  const mid = Math.floor(prices.length / 2);
  return prices.length % 2 ? prices[mid] : (prices[mid - 1] + prices[mid]) / 2;
}

/** Domanda (erba comprata e scambiata) meno offerta (erba raccolta), come le spinte della borsa. */
export const weedPush = (demand: number, supply: number): number =>
  Math.round((demand - supply) * 1e6) / 1e6;

/** Quanto costa una bustina adesso (prima di ricarichi, sconti e retate dello spacciatore). */
export function bagPrice(market: WeedMarket | null | undefined): number {
  const ref = market?.ref ?? NORMAL_BAG_PRICE;
  const push = market?.push ?? 0;
  return Math.round(clamp(ref * Math.exp(push * PUSH_GAIN), bagFloorPrice(), MAX_BAG_PRICE));
}

export function decodeWeedMarket(value: unknown): WeedMarket | null {
  if (!value || typeof value !== 'object') return null;
  const v = value as Record<string, unknown>;
  const ok = (n: unknown): n is number => typeof n === 'number' && Number.isFinite(n);
  if (!ok(v.ref) || !ok(v.push) || !ok(v.t)) return null;
  return { ref: clamp(v.ref, 1, MAX_BAG_PRICE), push: clamp(v.push, -1, 1), t: v.t };
}

/** Gli scambi letti dal database (giorno → offerta → scambio), scartando quelli non validi. */
export function decodeWeedTrades(value: unknown): WeedTrade[] {
  const out: WeedTrade[] = [];
  if (!value || typeof value !== 'object') return out;
  for (const day of Object.values(value as Record<string, unknown>)) {
    if (!day || typeof day !== 'object') continue;
    for (const raw of Object.values(day as Record<string, unknown>)) {
      const r = raw as Record<string, unknown>;
      if (
        r &&
        Number.isSafeInteger(r.g) &&
        Number.isSafeInteger(r.price) &&
        typeof r.seller === 'string' &&
        typeof r.buyer === 'string' &&
        typeof r.t === 'number'
      )
        out.push({
          g: r.g as number,
          price: r.price as number,
          seller: r.seller,
          buyer: r.buyer,
          t: r.t,
        });
    }
  }
  return out;
}
