import { nextActivity } from './activity.js';
export const MARKET_INTERVAL_MS = 60000;
export const MARKET_PUBLISH_INTERVAL_MS = 15 * MARKET_INTERVAL_MS;
/**
 * Oltre quest'età le quotazioni sono considerate ferme e non si compra né si vende. Il server le
 * pubblica ogni 15 minuti, ma GitHub Actions esegue il lavoro programmato molto meno spesso (di
 * solito una volta all'ora, a volte con buchi di 80 minuti): con 45 minuti il mercato restava
 * chiuso per un quarto d'ora o più ogni ora. Due ore coprono i ritardi; se il server si ferma
 * davvero, dopo due ore si chiude lo stesso.
 */
export const MARKET_MAX_AGE_MS = 8 * MARKET_PUBLISH_INTERVAL_MS;
export const MARKET_EPOCH = Date.UTC(2026, 9, 1);
export const BUSINESSES = [
  {
    id: 'shop',
    driver: 'vestiti e mobili comprati',
    name: 'Mini-shop online',
    emoji: '🛒',
    color: '#27ae60',
    risk: 'Rischio basso',
    desc: 'Vendi prodotti su internet: guadagni piccoli ma regolari.',
    seed: 101,
    theta: 0.0008,
    sigma: 0.0008,
    daily: 0.004,
    liquidity: 40000,
  },
  {
    id: 'app',
    driver: 'chat e chiacchiere tra giocatori',
    name: 'Startup di app',
    emoji: '📱',
    color: '#2e86de',
    risk: 'Rischio medio',
    desc: "Un'app che può decollare oppure ristagnare.",
    seed: 202,
    theta: 0.0006,
    sigma: 0.0025,
    daily: 0.008,
    liquidity: 20000,
  },
  {
    id: 'crypto',
    driver: 'slot e morra cinese nella sala scommesse',
    name: 'Cripto-meme coin',
    emoji: '🪙',
    color: '#e67e22',
    risk: 'Rischio alto',
    desc: 'Sale e scende come un ottovolante: puoi vincere o perdere molto.',
    seed: 303,
    theta: 0.0004,
    sigma: 0.0055,
    daily: 0.012,
    liquidity: 8000,
  },
  {
    id: 'pizza',
    driver: 'turni al ristorante, cibo dal frigo, gelati e bar',
    name: 'Pizzeria del quartiere',
    emoji: '🍕',
    color: '#e17055',
    risk: 'Rischio basso',
    desc: 'La gente mangia sempre la pizza: crescita lenta ma sicura.',
    seed: 404,
    theta: 0.0009,
    sigma: 0.0007,
    daily: 0.003,
    liquidity: 45000,
  },
  {
    id: 'house',
    driver: 'traslochi dalla bacheca immobiliare',
    name: 'Immobiliare',
    emoji: '🏠',
    color: '#8e5a3c',
    risk: 'Rischio basso',
    desc: 'Case e appartamenti: si muovono piano, ma tengono il valore.',
    seed: 505,
    theta: 0.001,
    sigma: 0.0006,
    daily: 0.0035,
    liquidity: 60000,
  },
  {
    id: 'green',
    driver: 'versamenti ai progetti di gruppo',
    name: 'Energia verde',
    emoji: '⚡',
    color: '#00b894',
    risk: 'Rischio medio',
    desc: 'Pannelli solari e pale eoliche: il futuro, con qualche scossone.',
    seed: 606,
    theta: 0.0006,
    sigma: 0.0018,
    daily: 0.007,
    liquidity: 25000,
  },
  {
    id: 'games',
    driver: 'partite nella sala giochi',
    name: 'Studio di videogiochi',
    emoji: '🎮',
    color: '#6c5ce7',
    risk: 'Rischio medio',
    desc: 'Un gioco di successo fa volare le azioni, un flop le affonda.',
    seed: 707,
    theta: 0.0005,
    sigma: 0.0028,
    daily: 0.009,
    liquidity: 18000,
  },
  {
    id: 'antiques',
    driver: 'pezzi comprati al negozio di oggetti da collezione e compravendite all’usato',
    name: 'Antiquariato',
    emoji: '🏺',
    color: '#a0522d',
    risk: 'Rischio medio',
    desc: 'Pezzi rari e d’epoca: valgono quanto la voglia dei collezionisti.',
    seed: 1010,
    theta: 0.0006,
    sigma: 0.002,
    daily: 0.006,
    liquidity: 15000,
  },
  {
    id: 'space',
    driver: 'viaggi sulla luna',
    name: 'Turismo spaziale',
    emoji: '🚀',
    color: '#2d3436',
    risk: 'Rischio molto alto',
    desc: 'Viaggi sulla luna per tutti: si può guadagnare tantissimo o perdere quasi tutto.',
    seed: 909,
    theta: 0.0003,
    sigma: 0.007,
    daily: 0.014,
    liquidity: 6000,
  },
] as const;
/**
 * Attività tolte dalla borsa: la loro ultima quotazione resta ferma nel database e chi ci aveva
 * investito riceve in cassaforte il valore delle sue quote (retireBusinesses, server/src/maintenance.ts).
 */
export const RETIRED_BUSINESSES: Record<string, { name: string; emoji: string }> = {
  ev: { name: 'Auto elettriche', emoji: '🚗' },
};
/** Le tre attività di sempre: nel database ci sono da subito (le altre nascono al primo aggiornamento). */
export const ORIGINAL_BUSINESSES: readonly string[] = ['shop', 'app', 'crypto'];

// ---------------------------------------------------------------- domanda e offerta

/**
 * Commissione su ogni acquisto e ogni vendita. Serve anche a non far guadagnare di sicuro chi
 * compra tanto per far salire il prezzo e poi rivende subito.
 */
export const TRADE_FEE = 0.01;
/** Di quanto al massimo può muovere il prezzo la domanda (o l'offerta) in un quarto d'ora. */
export const MAX_FLOW_IMPACT = 0.02;

/** Quanto hanno investito in tutto i giocatori in un'attività. */
export interface Holding {
  units: number;
  holders: number;
}

/** Somma gli investimenti di tutti i giocatori (stanze del database), attività per attività. */
export function holdingsFromRooms(rooms: unknown): Record<string, Holding> {
  const out: Record<string, Holding> = {};
  for (const b of BUSINESSES) out[b.id] = { units: 0, holders: 0 };
  if (!rooms || typeof rooms !== 'object') return out;
  for (const room of Object.values(rooms as Record<string, unknown>)) {
    const invest = (room as { economy?: { invest?: unknown } } | null)?.economy?.invest;
    if (!invest || typeof invest !== 'object') continue;
    for (const b of BUSINESSES) {
      const units = (invest as Record<string, { units?: unknown }>)[b.id]?.units;
      if (typeof units === 'number' && Number.isFinite(units) && units > 0) {
        out[b.id].units += units;
        out[b.id].holders++;
      }
    }
  }
  return out;
}

/**
 * Effetto della domanda sul prezzo: quanti euro sono entrati (o usciti) nell'ultimo quarto d'ora,
 * diviso la liquidità dell'attività, al massimo ±2%. Restituisce il fattore (es. 1.01 = +1%).
 */
export function flowImpact(netFlowEuro: number, liquidity: number): number {
  if (!Number.isFinite(netFlowEuro) || !(liquidity > 0)) return 1;
  const k = Math.max(-MAX_FLOW_IMPACT, Math.min(MAX_FLOW_IMPACT, netFlowEuro / liquidity));
  return 1 + k;
}
export type Business = (typeof BUSINESSES)[number];
export type BusinessId = Business['id'];
export interface MarketQuote {
  price: number;
  log: number;
  history: Record<string, number>;
  /** Quote possedute in tutto dai giocatori all'ultimo aggiornamento, e da quanti giocatori. */
  held?: number;
  holders?: number;
  /** Euro comprati (positivi) o venduti (negativi) da tutti nell'ultimo quarto d'ora. */
  flow?: number;
  /** Spinta dell'attività dei giocatori nel gioco (logaritmo del fattore: 0.1 ≈ +10%). */
  act?: number;
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
    if (quote === undefined && !ORIGINAL_BUSINESSES.includes(business.id)) continue;
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
/** Prima quotazione di un'attività (anche di una appena aggiunta), con la storia delle ultime 24 ore. */
function bootstrapQuote(business: Business, minute: number): MarketQuote {
  const elapsed = Math.max(0, minute - MARKET_EPOCH / MARKET_INTERVAL_MS);
  let log = 0;
  const history: Record<string, number> = {};
  for (let k = 0; k <= elapsed; k++) {
    if (k) log = log * (1 - business.theta) + business.sigma * legacyNoise(business.seed, k);
    const at = minute - elapsed + k;
    if (at >= minute - 1440 && at % 15 === 0) history[at] = price(business, at, log);
  }
  return { log, price: price(business, minute, log), history };
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
  holdings?: Record<string, Holding>,
  activity?: Record<string, number>,
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
    // attività appena aggiunta al gioco: nasce adesso, con la sua storia
    if (!next.quotes[business.id]) {
      next.quotes[business.id] = bootstrapQuote(business, current.minute);
    }
    const quote = next.quotes[business.id];
    const before = quote.price;
    const decay = 1 - business.theta;
    const sample = noise(business.id);
    if (!Number.isFinite(sample)) throw new Error('Invalid market noise');
    quote.log =
      quote.log * decay ** gap +
      business.sigma * sample * Math.sqrt((1 - decay ** (2 * gap)) / (1 - decay ** 2));
    // domanda e offerta: se i giocatori hanno comprato più di quanto hanno venduto il prezzo sale
    const h = holdings?.[business.id];
    if (h) {
      const flow = quote.held !== undefined ? (h.units - quote.held) * before : 0;
      quote.log += Math.log(flowImpact(flow, business.liquidity));
      quote.flow = Math.round(flow);
      quote.held = Math.round(h.units * 1e6) / 1e6;
      quote.holders = h.holders;
    }
    // attività dei giocatori nel gioco (shared/activity.ts): la spinta si avvicina piano all'obiettivo
    const target = activity?.[business.id];
    if (target !== undefined) quote.act = nextActivity(quote.act, target);
    quote.price = price(business, minute, quote.log + (quote.act || 0));
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
  if (!quote) return 0; // attività nuova non ancora quotata
  if (at >= snapshot.updatedAt) return quote.price;
  const entries = Object.entries(quote.history).sort((a, b) => Number(a[0]) - Number(b[0]));
  let previous = entries[0]?.[1] ?? quote.price;
  for (const [minute, price] of entries) {
    if (Number(minute) * MARKET_INTERVAL_MS > at) break;
    previous = price;
  }
  return previous;
}
