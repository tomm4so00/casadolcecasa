// Storie romantiche fra giocatori (senza dipendenze dal browser, così sono testabili).

/** Dialoghi e complimenti ricevuti dalla stessa persona prima che nasca l'interesse. */
export const ROMANCE_THRESHOLD = 5;
/** Quante relazioni si ricordano al massimo (le più vecchie vengono dimenticate). */
export const ROMANCE_MAX_ENTRIES = 30;
/** Durata dell'animazione del bacio. */
export const KISS_DURATION_MS = 4500;
/** Una richiesta di bacio più vecchia di così non viene più mostrata. */
export const KISS_REQUEST_TTL_MS = 60_000;

interface RomanceEntry {
  /** Nome dell'altro giocatore, per i messaggi. */
  name: string;
  /** Dialoghi e complimenti ricevuti da quel giocatore. */
  points: number;
  /** true quando fra i due può comparire "Prova a baciare". */
  unlocked: boolean;
  /** Ultimo aggiornamento, per dimenticare le relazioni più vecchie. */
  t: number;
}
export type RomanceBook = Record<string, RomanceEntry>;

/** Legge le relazioni dal salvataggio scartando i valori non validi. */
export function decodeRomance(value: unknown): RomanceBook {
  const book: RomanceBook = {};
  if (!value || typeof value !== 'object' || Array.isArray(value)) return book;
  for (const [id, raw] of Object.entries(value as Record<string, unknown>)) {
    if (!/^player_[A-Za-z0-9_-]{1,128}$/.test(id) || !raw || typeof raw !== 'object') continue;
    const e = raw as Record<string, unknown>;
    if (typeof e.name !== 'string' || typeof e.unlocked !== 'boolean') continue;
    const points = Number.isSafeInteger(e.points) && (e.points as number) >= 0 ? e.points : 0;
    const t = Number.isFinite(e.t) && (e.t as number) >= 0 ? (e.t as number) : 0;
    book[id] = { name: e.name.slice(0, 20), points: points as number, unlocked: e.unlocked, t };
  }
  return trimRomance(book);
}

/** Tiene solo le relazioni più recenti. */
export function trimRomance(book: RomanceBook): RomanceBook {
  const ids = Object.keys(book);
  if (ids.length <= ROMANCE_MAX_ENTRIES) return book;
  ids.sort((a, b) => book[b].t - book[a].t);
  const kept: RomanceBook = {};
  for (const id of ids.slice(0, ROMANCE_MAX_ENTRIES)) kept[id] = book[id];
  return kept;
}

/**
 * Registra un dialogo o un complimento ricevuto da `fromId`.
 * Restituisce true solo nel momento in cui nasce l'interesse.
 */
export function noteAttention(
  book: RomanceBook,
  fromId: string,
  fromName: string,
  now: number,
): boolean {
  const entry = (book[fromId] ??= { name: fromName, points: 0, unlocked: false, t: now });
  entry.name = fromName.slice(0, 20) || entry.name;
  entry.t = now;
  if (entry.unlocked) return false;
  entry.points++;
  if (entry.points < ROMANCE_THRESHOLD) return false;
  entry.unlocked = true;
  return true;
}

/** Apre la relazione anche dal lato di chi ha fatto i complimenti. */
export function unlockRomance(book: RomanceBook, id: string, name: string, now: number): void {
  const entry = (book[id] ??= { name, points: 0, unlocked: false, t: now });
  entry.name = name.slice(0, 20) || entry.name;
  entry.unlocked = true;
  entry.t = now;
}

/** Dopo un bacio rifiutato la relazione riparte da zero e il pulsante sparisce. */
export function endRomance(book: RomanceBook, id: string, now: number): void {
  const entry = book[id];
  if (!entry) return;
  entry.unlocked = false;
  entry.points = 0;
  entry.t = now;
}

export function canTryKiss(book: RomanceBook, id: string | undefined | null): boolean {
  return !!id && !!book[id]?.unlocked;
}
