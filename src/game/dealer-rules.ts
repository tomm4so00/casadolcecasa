// Gli spacciatori: chi sono, dove e quando stanno, quanto chiedono e le retate della polizia.
// Tutto viene dal codice del condominio e dall'ora: chi gioca nello stesso condominio vede gli
// stessi prezzi e le stesse retate senza scrivere niente nel database. Il server usa le stesse
// regole per annunciare le retate nei pettegolezzi. Niente browser qui.

const HOUR = 3_600_000;
const DAY = 24 * HOUR;

export type DealerId = 'biondo' | 'mirko';
export type DealerPlace = 'bar' | 'discoteca';

export const DEALERS: Record<
  DealerId,
  {
    name: string;
    place: DealerPlace;
    /** Ore (locali) in cui c'è: dalla prima compresa all'ultima esclusa, anche a cavallo della mezzanotte. */
    from: number;
    to: number;
    /** Cosa vende. */
    sells: 'weed' | 'pill';
    /** Quanto alza (o abbassa) il prezzo rispetto al listino. */
    markup: number;
    lines: string[];
  }
> = {
  biondo: {
    name: 'Il Biondo',
    place: 'bar',
    from: 14,
    to: 2,
    sells: 'weed',
    markup: 1,
    lines: [
      'Roba buona, prezzo giusto.',
      'Per gli amici c’è sempre lo sconto.',
      'Niente domande 🤫',
    ],
  },
  mirko: {
    name: 'Mirko',
    place: 'discoteca',
    from: 22,
    to: 6,
    sells: 'pill',
    markup: 1.2,
    lines: [
      'Psst… stanotte ho le pillole giuste.',
      'Non chiedermi cosa c’è dentro.',
      'Tu sì che hai l’aria di uno che se ne intende.',
    ],
  },
};

/** Numero pseudo-casuale tra 0 e 1, sempre uguale per lo stesso testo. */
export function hash01(text: string): number {
  let h = 2166136261;
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  h ^= h >>> 15;
  h = Math.imul(h, 2246822507);
  h ^= h >>> 13;
  return (h >>> 0) / 4294967296;
}

/** C'è a quest'ora (locale, 0–23)? */
export function dealerOnDuty(id: DealerId, hour: number): boolean {
  const { from, to } = DEALERS[id];
  return from < to ? hour >= from && hour < to : hour >= from || hour < to;
}

// ---------------------------------------------------------------- retate

/**
 * Il tempo è diviso in blocchi di 9 giorni e in ogni blocco c'è una retata, che parte in uno dei
 * primi 5 giorni: in media una ogni 9 giorni, e fra una e l'altra passano almeno 5 giorni.
 */
const RAID_BLOCK_DAYS = 9;
const RAID_START_DAYS = 5;

export interface Raid {
  /** Il giorno (UTC) in cui è partita: serve al server per annunciarla una volta sola. */
  id: number;
  place: DealerPlace;
  start: number;
  end: number;
}

/** La retata di un blocco: da 12 a 24 ore, al bar o in discoteca. */
function raidOfBlock(world: string, block: number): Raid {
  const day =
    block * RAID_BLOCK_DAYS + Math.floor(hash01(`${world}|giorno|${block}`) * RAID_START_DAYS);
  const start = day * DAY + Math.floor(hash01(`${world}|ora|${day}`) * 24) * HOUR;
  const hours = 12 + Math.floor(hash01(`${world}|durata|${day}`) * 13);
  const place: DealerPlace = hash01(`${world}|posto|${day}`) < 0.5 ? 'bar' : 'discoteca';
  return { id: day, place, start, end: start + hours * HOUR };
}

/** La retata che parte quel giorno, se c'è. */
export function raidOfDay(world: string, day: number): Raid | null {
  const raid = raidOfBlock(world, Math.floor(day / RAID_BLOCK_DAYS));
  return raid.id === day ? raid : null;
}

/** La retata in corso adesso nel condominio, oppure null. */
export function activeRaid(world: string, now: number): Raid | null {
  const block = Math.floor(Math.floor(now / DAY) / RAID_BLOCK_DAYS);
  for (const b of [block, block - 1]) {
    const raid = raidOfBlock(world, b);
    if (raid.start <= now && now < raid.end) return raid;
  }
  return null;
}

// ---------------------------------------------------------------- prezzo delle pillole

/** Il listino della strada va da qui… */
const PILL_LOW = 15;
/** …a qui (prima del ricarico dello spacciatore). */
const PILL_HIGH = 38;

/**
 * Il listino della strada in quest'ora: si muove con gradualità perché è la media di tre ore
 * di fila, così un'ora non salta da un estremo all'altro.
 */
export function streetPillPrice(world: string, now: number): number {
  const h = Math.floor(now / HOUR);
  const mix =
    (hash01(`${world}|p|${h}`) + hash01(`${world}|p|${h - 1}`) + hash01(`${world}|p|${h - 2}`)) / 3;
  return PILL_LOW + (PILL_HIGH - PILL_LOW) * mix;
}

// ---------------------------------------------------------------- il rapporto con te

/** Dopo tanto senza comprare da lui, lo spacciatore si scorda di te. */
export const LOYALTY_FORGET_MS = 14 * DAY;
/** Ogni tanti acquisti da lui… */
const LOYALTY_STEP = 5;
/** …lo sconto sale di tanto, fino al massimo. */
const LOYALTY_DISCOUNT = 0.05;
const LOYALTY_MAX = 0.2;
/** Con la dipendenza al 100% il prezzo sale di tanto. */
const ADDICTION_MARKUP = 0.5;

export interface Loyalty {
  /** Acquisti fatti da lui (finché non si scorda di te). */
  n: number;
  /** Ultimo acquisto (ms). */
  last: number;
}
export type LoyaltyBook = Partial<Record<DealerId, Loyalty>>;

/** Gli acquisti che lo spacciatore ricorda ancora. */
export function remembered(book: LoyaltyBook | undefined, id: DealerId, now: number): number {
  const l = book?.[id];
  return l && now - l.last <= LOYALTY_FORGET_MS ? l.n : 0;
}

export function loyaltyDiscount(book: LoyaltyBook | undefined, id: DealerId, now: number): number {
  return Math.min(
    LOYALTY_MAX,
    Math.floor(remembered(book, id, now) / LOYALTY_STEP) * LOYALTY_DISCOUNT,
  );
}

/** Dopo un acquisto. */
export function afterPurchase(
  book: LoyaltyBook | undefined,
  id: DealerId,
  now: number,
): LoyaltyBook {
  return { ...(book ?? {}), [id]: { n: remembered(book, id, now) + 1, last: now } };
}

export function decodeLoyalty(value: unknown): LoyaltyBook {
  const out: LoyaltyBook = {};
  if (!value || typeof value !== 'object') return out;
  for (const id of Object.keys(DEALERS) as DealerId[]) {
    const v = (value as Record<string, unknown>)[id] as Record<string, unknown> | undefined;
    if (v && Number.isSafeInteger(v.n) && (v.n as number) > 0 && typeof v.last === 'number')
      out[id] = { n: Math.min(10_000, v.n as number), last: v.last };
  }
  return out;
}

// ---------------------------------------------------------------- l'offerta

export interface DealerOffer {
  /** È al suo posto (non c'è se è fuori orario o se c'è una retata da lui). */
  present: boolean;
  /** Prezzo (Đ, intero) per una pillola o una bustina d'erba. */
  price: number;
  /** Il prezzo è raddoppiato per la retata nell'altro posto. */
  raid: boolean;
  /** Ricarico per la dipendenza e sconto fedeltà già applicati (per spiegarli). */
  addiction: number;
  discount: number;
}

/**
 * Quanto chiede lo spacciatore. `base` è il prezzo di partenza della merce: il listino delle
 * pillole o il prezzo di mercato della bustina d'erba. `hour` è l'ora locale del giocatore,
 * `dependency` la dipendenza (0–100).
 */
export function dealerOffer(
  id: DealerId,
  world: string,
  now: number,
  hour: number,
  base: number,
  dependency: number,
  book: LoyaltyBook | undefined,
): DealerOffer {
  const dealer = DEALERS[id];
  const raid = activeRaid(world, now);
  const busted = raid?.place === dealer.place;
  const addiction =
    dealer.sells === 'pill' ? (Math.min(100, Math.max(0, dependency)) / 100) * ADDICTION_MARKUP : 0;
  const discount = loyaltyDiscount(book, id, now);
  const doubled = !!raid && !busted;
  const price = Math.max(
    1,
    Math.round(base * dealer.markup * (1 + addiction) * (1 - discount) * (doubled ? 2 : 1)),
  );
  return { present: dealerOnDuty(id, hour) && !busted, price, raid: doubled, addiction, discount };
}

/** Cosa dice lo spacciatore, a seconda di come ti vede. */
export function dealerLine(id: DealerId, offer: DealerOffer, now: number): string {
  if (offer.raid) return 'Con gli sbirri in giro i prezzi raddoppiano. Prendere o lasciare.';
  if (offer.addiction >= 0.25) return 'Ti vedo messo male… oggi per te costa di più.';
  if (offer.discount > 0)
    return `Per un cliente fisso come te: ${Math.round(offer.discount * 100)}% di sconto.`;
  const lines = DEALERS[id].lines;
  return lines[Math.floor(now / HOUR) % lines.length];
}

/** Il messaggio per i pettegolezzi all'inizio e alla fine di una retata. */
export function raidGossip(raid: Raid, ended: boolean): string {
  const where = raid.place === 'bar' ? 'al bar' : 'in discoteca';
  return ended
    ? `🚓 La polizia se n'è andata ${where}: lo spacciatore è tornato.`
    : `🚨 Retata ${where}! Lo spacciatore è sparito e chi è rimasto raddoppia i prezzi.`;
}
