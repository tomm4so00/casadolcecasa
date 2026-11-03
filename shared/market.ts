export const MARKET_INTERVAL_MS = 60000;
export const MARKET_PUBLISH_INTERVAL_MS = 15 * MARKET_INTERVAL_MS;
export const MARKET_MAX_AGE_MS = 3 * MARKET_PUBLISH_INTERVAL_MS;
export const MARKET_EPOCH = Date.UTC(2026, 9, 1);
export const BUSINESSES = [
  {
    id: 'shop',
    name: 'Mini-shop online',
    emoji: '🛒',
    color: '#27ae60',
    risk: 'Rischio basso',
    desc: 'Vendi prodotti su internet: guadagni piccoli ma regolari.',
    seed: 101,
    theta: 0.0008,
    sigma: 0.0008,
    daily: 0.004,
  },
  {
    id: 'app',
    name: 'Startup di app',
    emoji: '📱',
    color: '#2e86de',
    risk: 'Rischio medio',
    desc: "Un'app che può decollare oppure ristagnare.",
    seed: 202,
    theta: 0.0006,
    sigma: 0.0025,
    daily: 0.008,
  },
  {
    id: 'crypto',
    name: 'Cripto-meme coin',
    emoji: '🪙',
    color: '#e67e22',
    risk: 'Rischio alto',
    desc: 'Sale e scende come un ottovolante: puoi vincere o perdere molto.',
    seed: 303,
    theta: 0.0004,
    sigma: 0.0055,
    daily: 0.012,
  },
] as const;
export type Business = (typeof BUSINESSES)[number];
export type BusinessId = Business['id'];
export interface MarketQuote {
  price: number;
  log: number;
  history: Record<string, number>;
}
/** Crollo o boom della borsa: per un'ora tutte le quotazioni scendono o salgono del 20%. */
export interface MarketEvent {
  kind: 'boom' | 'crash';
  /** Inizio e fine (ms, ora del server): l'effetto vale per le quotazioni pubblicate in [start, end). */
  start: number;
  end: number;
}
export interface MarketSnapshot {
  version: 1;
  minute: number;
  updatedAt: number;
  quotes: Record<BusinessId, MarketQuote>;
  /** Ultimo evento (in corso o passato: serve anche per la pausa fra un evento e l'altro). */
  event?: MarketEvent;
}
export const MARKET_EVENT_MS = 3_600_000;
export const MARKET_EVENT_EFFECT = 0.2;
/** Probabilità che un evento parta a ogni pubblicazione (ogni 15 minuti): in media uno ogni 12 ore… */
export const MARKET_EVENT_CHANCE = 1 / 48;
/** …ma mai prima di 12 ore dalla fine del precedente. */
export const MARKET_EVENT_COOLDOWN_MS = 12 * 3_600_000;

/** L'ultimo evento, se è scritto bene. */
export function marketEvent(snapshot: MarketSnapshot | null | undefined): MarketEvent | null {
  const e: unknown = snapshot?.event;
  if (!record(e)) return null;
  if (e.kind !== 'boom' && e.kind !== 'crash') return null;
  if (!Number.isSafeInteger(e.start) || !Number.isSafeInteger(e.end)) return null;
  if ((e.end as number) <= (e.start as number)) return null;
  return e as unknown as MarketEvent;
}
/** Evento che vale per le quotazioni di quell'istante (null se non ce n'è). */
export function eventAt(snapshot: MarketSnapshot, at: number): MarketEvent | null {
  const e = marketEvent(snapshot);
  return e && at >= e.start && at < e.end ? e : null;
}
/** Moltiplicatore dei prezzi in quell'istante: 1.2 nel boom, 0.8 nel crollo, altrimenti 1. */
export function eventFactor(snapshot: MarketSnapshot, at: number): number {
  const e = eventAt(snapshot, at);
  return !e ? 1 : e.kind === 'boom' ? 1 + MARKET_EVENT_EFFECT : 1 - MARKET_EVENT_EFFECT;
}
/** Decide (sul server) se a questa pubblicazione parte un evento. `roll` e `kindRoll` fra 0 e 1. */
export function rollMarketEvent(
  previous: MarketEvent | null,
  minute: number,
  roll: number,
  kindRoll: number,
): MarketEvent | null {
  const start = minute * MARKET_INTERVAL_MS;
  if (previous && start < previous.end + MARKET_EVENT_COOLDOWN_MS) return null;
  if (!(roll < MARKET_EVENT_CHANCE)) return null;
  return { kind: kindRoll < 0.5 ? 'crash' : 'boom', start, end: start + MARKET_EVENT_MS };
}
export function hash01(a: number, b: number): number {
  let h = Math.imul(a ^ 0x9e3779b9, 0x85ebca6b) ^ Math.imul(b + 0x7f4a7c15, 0xc2b2ae35);
  h ^= h >>> 15;
  h = Math.imul(h, 0x2c1b3c6d);
  h ^= h >>> 12;
  h = Math.imul(h, 0x297a2d39);
  h ^= h >>> 15;
  return (h >>> 0) / 4294967296;
}
export function legacyNoise(seed: number, minute: number): number {
  return (
    (hash01(seed, minute * 4) +
      hash01(seed, minute * 4 + 1) +
      hash01(seed, minute * 4 + 2) +
      hash01(seed, minute * 4 + 3) -
      2) *
    Math.sqrt(3)
  );
}
const record = (value: unknown): value is Record<string, unknown> =>
  value !== null && typeof value === 'object' && !Array.isArray(value);
export function decodeMarket(value: unknown): MarketSnapshot | null {
  if (
    !record(value) ||
    value.version !== 1 ||
    !Number.isSafeInteger(value.minute) ||
    (value.minute as number) < 0 ||
    value.updatedAt !== (value.minute as number) * MARKET_INTERVAL_MS ||
    !record(value.quotes)
  )
    return null;
  for (const business of BUSINESSES) {
    const quote = value.quotes[business.id];
    if (
      !record(quote) ||
      typeof quote.price !== 'number' ||
      !Number.isFinite(quote.price) ||
      quote.price <= 0 ||
      typeof quote.log !== 'number' ||
      !Number.isFinite(quote.log) ||
      !record(quote.history) ||
      Object.keys(quote.history).length > 100
    )
      return null;
    if (
      !Object.entries(quote.history).every(
        ([key, price]) =>
          /^\d+$/.test(key) &&
          Number.isSafeInteger(Number(key)) &&
          Number(key) <= (value.minute as number) &&
          typeof price === 'number' &&
          Number.isFinite(price) &&
          price > 0,
      )
    )
      return null;
  }
  return value as unknown as MarketSnapshot;
}
function price(business: Business, minute: number, log: number): number {
  const sinceEpoch = Math.max(0, minute - MARKET_EPOCH / MARKET_INTERVAL_MS);
  // Keep the v8 trend, with finite limits on this fictional market.
  return Math.max(
    0.01,
    Math.min(1e9, Math.exp(log + (sinceEpoch * Math.log1p(business.daily)) / 1440) * 100),
  );
}
function bootstrap(minute: number): MarketSnapshot {
  const quotes = {} as Record<BusinessId, MarketQuote>;
  const elapsed = Math.max(0, minute - MARKET_EPOCH / MARKET_INTERVAL_MS);
  for (const business of BUSINESSES) {
    let log = 0;
    const history: Record<string, number> = {};
    // Reproduce the old sequence only once, on the server, to preserve existing portfolios.
    for (let k = 0; k <= elapsed; k++) {
      if (k) log = log * (1 - business.theta) + business.sigma * legacyNoise(business.seed, k);
      const at = minute - elapsed + k;
      if (at >= minute - 1440 && at % 15 === 0) history[at] = price(business, at, log);
    }
    quotes[business.id] = { log, price: price(business, minute, log), history };
  }
  return { version: 1, minute, updatedAt: minute * MARKET_INTERVAL_MS, quotes };
}
/** Null means already processed: retries and overlapping invocations cannot advance twice. */
export function advanceMarket(
  value: unknown,
  now: number,
  noise: (id: BusinessId) => number,
  eventRolls?: { roll: number; kind: number },
): MarketSnapshot | null {
  if (!Number.isFinite(now) || now < MARKET_EPOCH) throw new Error('Invalid market time');
  const minute =
    Math.floor(now / MARKET_PUBLISH_INTERVAL_MS) *
    (MARKET_PUBLISH_INTERVAL_MS / MARKET_INTERVAL_MS);
  const current = decodeMarket(value);
  if (value !== null && value !== undefined && !current)
    throw new Error('Invalid market data: refusing to overwrite');
  if (!current) return bootstrap(minute);
  if (current.minute >= minute) return null;
  const next = structuredClone(current);
  const gap = minute - current.minute;
  for (const business of BUSINESSES) {
    const quote = next.quotes[business.id];
    const decay = 1 - business.theta;
    const sample = noise(business.id);
    if (!Number.isFinite(sample)) throw new Error('Invalid market noise');
    quote.log =
      quote.log * decay ** gap +
      business.sigma * sample * Math.sqrt((1 - decay ** (2 * gap)) / (1 - decay ** 2));
    quote.price = price(business, minute, quote.log);
    // One sample per 15-minute bucket; history remains bounded to the last 24 hours.
    quote.history[Math.floor(minute / 15) * 15] = quote.price;
    for (const key of Object.keys(quote.history))
      if (Number(key) < minute - 1440) delete quote.history[key];
  }
  next.minute = minute;
  next.updatedAt = minute * MARKET_INTERVAL_MS;
  const previous = marketEvent(next);
  if (!previous) delete next.event;
  if (eventRolls) {
    const started = rollMarketEvent(previous, minute, eventRolls.roll, eventRolls.kind);
    if (started) next.event = started;
  }
  return next;
}
/** Quotazione in un istante, compreso l'effetto di un crollo o di un boom della borsa. */
export function marketPriceAt(snapshot: MarketSnapshot, id: BusinessId, at: number): number {
  return basePriceAt(snapshot, id, at) * eventFactor(snapshot, Math.min(at, snapshot.updatedAt));
}
function basePriceAt(snapshot: MarketSnapshot, id: BusinessId, at: number): number {
  const quote = snapshot.quotes[id];
  if (at >= snapshot.updatedAt) return quote.price;
  const entries = Object.entries(quote.history).sort((a, b) => Number(a[0]) - Number(b[0]));
  let previous = entries[0]?.[1] ?? quote.price;
  for (const [minute, price] of entries) {
    if (Number(minute) * MARKET_INTERVAL_MS > at) break;
    previous = price;
  }
  return previous;
}
