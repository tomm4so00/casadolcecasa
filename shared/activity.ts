// Borsa legata al gioco (senza dipendenze dal browser né dal server, così è testabile).
//
// Ogni giocatore scrive nel database quante volte al giorno fa le cose legate a ogni attività
// della borsa:  sims_activity/<giorno>/<attività>/<giocatore> = { n, t }.
// Il server confronta le ultime 24 ore con la media dei 7 giorni prima e sposta piano la
// quotazione (fino a ±ACTIVITY_WEIGHT). Per ogni giocatore contano al massimo ACTIVITY_CAP azioni
// al giorno: nessuno può muovere la borsa da solo.

export const DAY_MS = 86_400_000;
/** Azioni di un giocatore che contano, al giorno e per attività. */
export const ACTIVITY_CAP = 10;
/** Quanto può spostare la quotazione l'attività dei giocatori (0.15 = ±15%). */
export const ACTIVITY_WEIGHT = 0.15;
/** A ogni aggiornamento (15 minuti) la spinta si avvicina all'obiettivo di questa frazione. */
export const ACTIVITY_SMOOTH = 0.1;
/** Si somma alle azioni recenti e alla media: con pochi giocatori la spinta resta calma. */
export const ACTIVITY_FLOOR = 3;
/** Giorni di attività che servono al server (oggi e gli 8 prima); i più vecchi si cancellano. */
export const ACTIVITY_DAYS = 9;

/** Giorno (UTC) di un istante: è la chiave in sims_activity. */
export const dayOf = (ms: number): number => Math.floor(ms / DAY_MS);

/** giorno → attività → giocatore → { n, t }. */
export type ActivityLog = Record<string, Record<string, Record<string, unknown>>>;

/** Quante azioni conta una riga: 0 se non è valida o non è stata scritta davvero in quel giorno. */
export function entryCount(day: number, raw: unknown): number {
  if (!raw || typeof raw !== 'object') return 0;
  const e = raw as Record<string, unknown>;
  const t = Number(e.t),
    n = Number(e.n);
  if (!Number.isFinite(t) || dayOf(t) !== day || !Number.isFinite(n) || n <= 0) return 0;
  return Math.min(n, ACTIVITY_CAP);
}

/** Quanta attività c'è stata in un giorno per un'attività (ogni giocatore conta al massimo ACTIVITY_CAP). */
export function dayActivity(log: ActivityLog, day: number, business: string): number {
  let total = 0;
  for (const raw of Object.values(log[day]?.[business] || {})) total += entryCount(day, raw);
  return total;
}

/**
 * Obiettivo della spinta di un'attività (logaritmo del fattore di prezzo): le ultime 24 ore
 * confrontate con la media dei 7 giorni prima. Il doppio dell'attività solita vale circa +10%,
 * la metà circa −10%; al massimo ±ACTIVITY_WEIGHT.
 */
export function activityTarget(log: ActivityLog, business: string, now: number): number {
  const today = dayOf(now);
  const elapsed = (now - today * DAY_MS) / DAY_MS;
  const recent =
    dayActivity(log, today, business) + dayActivity(log, today - 1, business) * (1 - elapsed);
  let week = 0;
  for (let d = today - 8; d <= today - 2; d++) week += dayActivity(log, d, business);
  // senza una settimana di storia non si sa cosa sia "il solito": nessuna spinta
  if (week <= 0) return 0;
  // ACTIVITY_FLOOR sommato a entrambi: con pochi numeri la spinta resta piccola
  const ratio = (recent + ACTIVITY_FLOOR) / (week / 7 + ACTIVITY_FLOOR);
  return ACTIVITY_WEIGHT * Math.max(-1, Math.min(1, Math.log(ratio)));
}

/** La spinta nuova: si avvicina piano all'obiettivo, così la quotazione non fa salti. */
export function nextActivity(current: number | undefined, target: number): number {
  const now = Number.isFinite(current) ? (current as number) : 0;
  return Math.round((now + (target - now) * ACTIVITY_SMOOTH) * 1e6) / 1e6;
}
