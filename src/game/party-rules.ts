// La festa del condominio: martedì, venerdì e domenica dalle 21 alle 21:30, ora italiana. Chi
// resta in cortile qualche minuto riceve la spilla della serata, che finisce sulla bacheca della
// sua stanza. Qui ci sono solo gli orari e i testi: niente browser, si prova nei test.

/** I giorni della festa (0 = domenica, come Date.getDay). */
export const PARTY_DAYS = [2, 5, 0] as const;
export const PARTY_HOUR = 21;
export const PARTY_MINUTES = 30;
/** L'avviso nel gioco, prima che cominci (minuti). */
export const PARTY_WARN_MINUTES = 15;
/** Quanto si resta in cortile per avere la spilla. */
export const PARTY_STAY_MS = 5 * 60_000;
/** Le spille che si ricordano al massimo (una festa ogni due o tre giorni: anni di feste). */
export const PARTY_MAX_PINS = 500;

const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const DAY_NAMES = ['domenica', 'lunedì', 'martedì', 'mercoledì', 'giovedì', 'venerdì', 'sabato'];
const MONTHS = [
  'gennaio',
  'febbraio',
  'marzo',
  'aprile',
  'maggio',
  'giugno',
  'luglio',
  'agosto',
  'settembre',
  'ottobre',
  'novembre',
  'dicembre',
];

const romeFmt = new Intl.DateTimeFormat('en-GB', {
  timeZone: 'Europe/Rome',
  weekday: 'short',
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
  second: '2-digit',
  hourCycle: 'h23',
});

/** Giorno (AAAA-MM-GG), giorno della settimana e minuti dalla mezzanotte, a Roma. */
function rome(t: number): { day: string; weekday: number; minutes: number } {
  const p: Record<string, string> = {};
  for (const x of romeFmt.formatToParts(new Date(t))) p[x.type] = x.value;
  return {
    day: `${p.year}-${p.month}-${p.day}`,
    weekday: WEEKDAYS.indexOf(p.weekday),
    minutes: (Number(p.hour) % 24) * 60 + Number(p.minute) + Number(p.second) / 60,
  };
}

/** Per provarla nel gioco di prova: una festa che comincia adesso (null = solo quelle vere). */
let forcedStart: number | null = null;
export function forceParty(start: number | null): void {
  forcedStart = start;
}

export interface Party {
  /** il giorno della festa, AAAA-MM-GG: è anche il nome della sua spilla */
  id: string;
  /** quanto manca alla fine (ms) */
  left: number;
}

/** La festa in corso all'ora `t`, o null. */
export function partyAt(t: number): Party | null {
  if (forcedStart !== null && t >= forcedStart && t < forcedStart + PARTY_MINUTES * 60_000)
    return { id: rome(forcedStart).day, left: forcedStart + PARTY_MINUTES * 60_000 - t };
  const r = rome(t);
  if (!(PARTY_DAYS as readonly number[]).includes(r.weekday)) return null;
  const m = r.minutes - PARTY_HOUR * 60;
  if (m < 0 || m >= PARTY_MINUTES) return null;
  return { id: r.day, left: Math.round((PARTY_MINUTES - m) * 60_000) };
}

/** Minuti all'inizio, se la festa è stasera e manca poco (al massimo PARTY_WARN_MINUTES); se no null. */
export function partySoon(t: number): { id: string; minutes: number } | null {
  const r = rome(t);
  if (!(PARTY_DAYS as readonly number[]).includes(r.weekday)) return null;
  const m = PARTY_HOUR * 60 - r.minutes;
  if (m <= 0 || m > PARTY_WARN_MINUTES) return null;
  return { id: r.day, minutes: Math.ceil(m) };
}

/** "adesso", "stasera alle 21", "domani alle 21", "venerdì alle 21". */
export function nextPartyText(t: number): string {
  if (partyAt(t)) return 'adesso';
  for (let d = 0; d < 8; d++) {
    const r = rome(t + d * 86_400_000);
    if (!(PARTY_DAYS as readonly number[]).includes(r.weekday)) continue;
    if (d === 0) {
      if (r.minutes < PARTY_HOUR * 60) return `stasera alle ${PARTY_HOUR}`;
      continue;
    }
    return d === 1 ? `domani alle ${PARTY_HOUR}` : `${DAY_NAMES[r.weekday]} alle ${PARTY_HOUR}`;
  }
  return '';
}

/** "20 novembre", dal nome della spilla. */
export function partyDayText(id: string): string {
  const [, m, d] = id.split('-').map(Number);
  return MONTHS[m - 1] ? `${d} ${MONTHS[m - 1]}` : id;
}

/** Le spille dal salvataggio: giorni validi, senza doppioni, in ordine. */
export function decodeParties(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  const days = value.filter(
    (x): x is string => typeof x === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(x),
  );
  return [...new Set(days)].sort().slice(-PARTY_MAX_PINS);
}

/** Quante spille ha chi abita una stanza (lo pubblica la stanza: rooms_state/<i>/parties). */
export function partyCount(value: unknown): number {
  return typeof value === 'number' && Number.isFinite(value)
    ? Math.max(0, Math.min(PARTY_MAX_PINS, Math.floor(value)))
    : 0;
}
