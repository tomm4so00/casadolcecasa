// L'attacco hacker di ogni giorno: alle 11:45 (ora italiana) Zero, lo scassinatore, annuncia a che
// ora indebolirà le casseforti di tutti, tra le 12:00 e le 23:00, per 10 minuti. In quei minuti
// chi prova a scassinare vede già la prima cifra della combinazione.
//
// L'orario si calcola dalla data: gioco e server (notifiche) lo conoscono senza dirselo.
// Queste regole le usano tutti e due: devono dare lo stesso risultato.

export const HACKER_NAME = 'Zero, lo scassinatore';
export const HACKER_SHORT = 'Zero';

/** Ora italiana dell'annuncio, in minuti dalla mezzanotte (11:45). */
export const ANNOUNCE_MINUTE = 11 * 60 + 45;
/** L'attacco comincia tra le 12:00 e le 22:50 (finisce entro le 23:00), su multipli di 5 minuti. */
export const FIRST_START_MINUTE = 12 * 60;
export const LAST_END_MINUTE = 23 * 60;
/** Quanto dura l'attacco. */
export const ATTACK_MS = 10 * 60000;
/** Quanto dura ogni scasso: il tempo che ha il proprietario per accorgersene e dare un pugno. */
export const CRACK_MS = 15000;

const TZ = 'Europe/Rome';
const MIN = 60000;

/** Data e minuti dalla mezzanotte, in ora italiana, di un istante. */
export function romeClock(ms: number): { day: string; minute: number } {
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone: TZ,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(new Date(ms));
  const get = (type: string) => parts.find((p) => p.type === type)?.value || '00';
  return {
    day: `${get('year')}-${get('month')}-${get('day')}`,
    minute: Number(get('hour')) * 60 + Number(get('minute')),
  };
}

/** L'istante (ms) in cui in Italia è il giorno `day` (AAAA-MM-GG) alle `minute` dalla mezzanotte. */
export function romeTime(day: string, minute: number): number {
  const wall = asUtc(day, minute);
  // l'Italia è avanti di 1 o 2 ore (ora legale): due passaggi bastano anche nei giorni del cambio
  const first = wall - romeOffset(wall);
  return wall - romeOffset(first);
}

/** L'orario italiano scritto come se fosse UTC (ms). */
function asUtc(day: string, minute: number): number {
  const [y, m, d] = day.split('-').map(Number);
  return Date.UTC(y, m - 1, d, 0, minute);
}

/** Quanto l'Italia è avanti rispetto a UTC in quell'istante (ms). */
function romeOffset(ms: number): number {
  const c = romeClock(ms);
  return asUtc(c.day, c.minute) - Math.floor(ms / MIN) * MIN;
}

/** Un numero pseudo-casuale fisso per ogni giorno (sempre lo stesso per la stessa data). */
function dayHash(day: string): number {
  let h = 2166136261;
  for (const ch of 'zero:' + day) h = Math.imul(h ^ ch.charCodeAt(0), 16777619) >>> 0;
  return h;
}

/** Il minuto (ora italiana) in cui comincia l'attacco del giorno. */
export function attackMinute(day: string): number {
  const slots = (LAST_END_MINUTE - ATTACK_MS / MIN - FIRST_START_MINUTE) / 5 + 1;
  return FIRST_START_MINUTE + (dayHash(day) % slots) * 5;
}

export interface HackerDay {
  day: string;
  announceAt: number;
  startAt: number;
  endAt: number;
}

/** L'attacco del giorno italiano in cui cade `now`. */
export function hackerDay(now: number): HackerDay {
  const { day } = romeClock(now);
  const startAt = romeTime(day, attackMinute(day));
  return { day, announceAt: romeTime(day, ANNOUNCE_MINUTE), startAt, endAt: startAt + ATTACK_MS };
}

export type HackerPhase = 'quiet' | 'announced' | 'active' | 'over';

/** quiet: prima dell'annuncio · announced: annunciato · active: in corso · over: finito. */
export function hackerPhase(now: number, d: HackerDay = hackerDay(now)): HackerPhase {
  if (now < d.announceAt) return 'quiet';
  if (now < d.startAt) return 'announced';
  if (now < d.endAt) return 'active';
  return 'over';
}

/** "18:40", l'ora italiana di un istante. */
export function clockText(ms: number): string {
  const m = romeClock(ms).minute;
  return `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;
}

/** "3 h 12 min", "12 min", "45 s": quanto manca. */
export function untilText(ms: number): string {
  const s = Math.max(0, Math.ceil(ms / 1000));
  if (s < 60) return `${s} s`;
  const min = Math.ceil(s / 60);
  if (min < 60) return `${min} min`;
  return `${Math.floor(min / 60)} h ${min % 60} min`;
}

/** Come funziona, in parole semplici: per l'annuncio nel gioco e per la guida. */
export function hackerExplanation(startAt: number): string {
  const from = clockText(startAt);
  const to = clockText(startAt + ATTACK_MS);
  return (
    `Oggi dalle ${from} alle ${to} ${HACKER_NAME} entra nel sistema delle casseforti di tutti i condomini.\n\n` +
    `🔓 Per chi ruba: in quei 10 minuti, quando provi ad aprire la cassaforte di un vicino, la prima ` +
    `cifra della combinazione è già scoperta. Ne restano solo 2 da indovinare.\n\n` +
    `🛡️ Per chi difende: ogni scasso dura 15 secondi e il ladro resta davanti alla cassaforte. ` +
    `Se lo vedi, dagli un pugno 👊: lo scasso fallisce e quella cassaforte, per lui, resta chiusa per sempre.\n\n` +
    `📲 Se qualcuno prova ad aprire la tua, il gioco ti avvisa subito: corri a casa!`
  );
}

/** La notifica delle 11:45. */
export function announcementPush(startAt: number): { title: string; body: string } {
  return {
    title: `💻 ${HACKER_SHORT} attacca alle ${clockText(startAt)}`,
    body:
      `Dalle ${clockText(startAt)} per 10 minuti le casseforti sono più facili da aprire. ` +
      'Se vedi qualcuno scassinare la tua, dagli un pugno: non potrà più aprirla!',
  };
}

/** La notifica poco prima dell'attacco. */
export function reminderPush(startAt: number): { title: string; body: string } {
  return {
    title: `⚠️ Alle ${clockText(startAt)} arriva ${HACKER_SHORT}`,
    body: 'Tra poco le casseforti si indeboliscono. Resta vicino alla tua: un pugno ferma il ladro!',
  };
}

/** Il testo della guida (❓): come funzionano attacco e difesa. */
export const HACKER_GUIDE =
  `💻 Ogni giorno alle 11:45 ${HACKER_NAME} annuncia a che ora attaccherà, tra le 12:00 e le 23:00.\n\n` +
  '🔓 Per 10 minuti le casseforti sono indebolite: chi prova ad aprirne una vede già la prima cifra.\n\n' +
  `🛡️ Ogni scasso dura ${CRACK_MS / 1000} secondi, sempre. Se vedi qualcuno davanti alla tua cassaforte, ` +
  'dagli un pugno 👊: lo scasso fallisce e quella cassaforte, per lui, resta chiusa per sempre. ' +
  'Se sei altrove il gioco ti avvisa: corri a casa!';
