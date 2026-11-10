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
  /** Baci accettati fra i due (per proporsi di fidanzarsi): dopo un no alla proposta si azzera. */
  kisses?: number;
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
    const kisses =
      Number.isSafeInteger(e.kisses) && (e.kisses as number) > 0 ? (e.kisses as number) : 0;
    book[id] = {
      name: e.name.slice(0, 20),
      points: points as number,
      unlocked: e.unlocked,
      t,
      ...(kisses ? { kisses: Math.min(1000, kisses) } : {}),
    };
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

// ---------------------------------------------------------------- fidanzamento

/** Baci fra i due prima di potersi proporre di fidanzarsi. */
export const PROPOSE_AFTER_KISSES = 5;
/** Dopo essersi lasciati, per tanto non ci si fidanza con nessuno. */
export const BREAKUP_COOLDOWN_MS = 24 * 3600000;
/** Dormire insieme almeno tanto dà il premio di salute al risveglio. */
export const SLEEP_TOGETHER_MS = 3600000;
export const SLEEP_TOGETHER_HEALTH = 15;

/** Un bacio accettato con `id`: restituisce i baci della coppia. */
export function noteKiss(book: RomanceBook, id: string, name: string, now: number): number {
  const entry = (book[id] ??= { name, points: 0, unlocked: true, t: now });
  entry.name = name.slice(0, 20) || entry.name;
  entry.unlocked = true;
  entry.t = now;
  entry.kisses = (entry.kisses || 0) + 1;
  return entry.kisses;
}

/** Proposta rifiutata: il conto dei baci riparte da zero, ma ci si può ancora baciare. */
export function resetKisses(book: RomanceBook, id: string): void {
  if (book[id]) book[id].kisses = 0;
}

/** Si può proporre di fidanzarsi a quella persona? */
export function canPropose(state: {
  kisses: number;
  /** Il mio fidanzato (o null) e quello dell'altro. */
  mine: string | null;
  theirs: string | null;
  cooldownUntil: number;
  now: number;
}): boolean {
  return (
    state.kisses >= PROPOSE_AFTER_KISSES &&
    !state.mine &&
    !state.theirs &&
    state.now >= state.cooldownUntil
  );
}

const ymd = (day: string) => day.split('-').map(Number) as [number, number, number];
const daysBetween = (a: string, b: string) => {
  const [y1, m1, d1] = ymd(a);
  const [y2, m2, d2] = ymd(b);
  return Math.round((Date.UTC(y2, m2 - 1, d2) - Date.UTC(y1, m1 - 1, d1)) / 86400000);
};

/**
 * L'anniversario di oggi (giorni AAAA-MM-GG): dopo 7 giorni, poi ogni mese nello stesso giorno
 * (nei mesi più corti l'ultimo). null se oggi non è un anniversario.
 */
export function anniversaryOn(since: string, today: string): { months: number } | null {
  if (daysBetween(since, today) === 7) return { months: 0 };
  const [y1, m1, d1] = ymd(since);
  const [y2, m2, d2] = ymd(today);
  const months = (y2 - y1) * 12 + (m2 - m1);
  if (months < 1) return null;
  const last = new Date(Date.UTC(y2, m2, 0)).getUTCDate();
  return d2 === Math.min(d1, last) ? { months } : null;
}

/** Il testo dell'anniversario. */
export function anniversaryText(name: string, a: { months: number }): string {
  if (a.months === 0) return `💞 Oggi è una settimana con ${name}!`;
  if (a.months % 12 === 0) {
    const years = a.months / 12;
    return `💞 Oggi sono ${years === 1 ? 'un anno' : years + ' anni'} con ${name}!`;
  }
  return `💞 Oggi ${a.months === 1 ? 'è un mese' : 'sono ' + a.months + ' mesi'} con ${name}!`;
}
