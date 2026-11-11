// Paga dei turni di lavoro: regole senza browser. Le usa il gioco (per mostrare la paga) e il
// Worker di Cloudflare, che è l'unico a versare la paga in cassaforte (worker/src/job-shift.ts).

// Livelli di carriera: paga base del turno ed dindini extra per ogni oggetto consegnato.
// `from` è il numero del turno (1 = primo turno) da cui vale il livello.
export const JOB_PAY_TIERS = [
  // un livello ogni 15 turni: gli aumenti crescono man mano che si sale
  { from: 1, base: 40, perItem: 5 },
  { from: 16, base: 45, perItem: 6 },
  { from: 31, base: 55, perItem: 8 },
  { from: 46, base: 70, perItem: 11 },
  { from: 61, base: 95, perItem: 15 },
] as const;

export function jobPayTier(turn: number) {
  return [...JOB_PAY_TIERS].reverse().find((tier) => turn >= tier.from) ?? JOB_PAY_TIERS[0];
}

/** Quante volte al giorno si può andare al lavoro (il conteggio riparte a mezzanotte). */
export const SHIFTS_PER_DAY = 4;

/** Durata di un turno, in secondi di gioco. */
export const SHIFT_SECONDS = 80;

export const JOB_KEYS = ['cantiere', 'ospedale', 'ristorante', 'ufficio'] as const;
export type JobKey = (typeof JOB_KEYS)[number];
export const isJobKey = (value: unknown): value is JobKey =>
  typeof value === 'string' && (JOB_KEYS as readonly string[]).includes(value);

/** Turni già fatti oltre i quali la paga non sale più: il livello più alto parte dal 61°. */
export const MAX_IMPORTED_EXPERIENCE = JOB_PAY_TIERS[JOB_PAY_TIERS.length - 1].from - 1;

/**
 * Il massimo che il server crede a fine turno. Oggetti e mance li conta il browser: il server
 * non li vede, ma sa quanto tempo c'è. I tetti vengono dai tempi del gioco, con margine:
 * - cantiere: ogni oggetto va preso e portato a un punto di consegna, correndo;
 * - ospedale: 2 pazienti, ognuno resta almeno 2,5 s dopo la cura; il codice rosso vale 2 oggetti;
 * - ristorante: al massimo 3 tavoli, 4 s per mangiare; la mancia arriva a 1,5 oggetti a tavolo;
 * - ufficio: una stampa ogni 2,5 s; il capo passa al massimo 2 volte e paga 3 oggetti di bonus.
 * `tips` è in oggetti: la mancia massima è tips × paga per oggetto.
 */
export const JOB_CLAIM_LIMITS: Record<JobKey, { items: number; tips: number }> = {
  cantiere: { items: 45, tips: 0 },
  ospedale: { items: 40, tips: 12 },
  ristorante: { items: 40, tips: 20 },
  ufficio: { items: 40, tips: 6 },
};

/** Il turno dura SHIFT_SECONDS: chi chiede la paga prima non ha lavorato (2 s di margine). */
export const SHIFT_MIN_MS = (SHIFT_SECONDS - 2) * 1000;

/** La paga si può chiedere fino a 26 ore dopo l'inizio: il gioco riprova per 24 ore. */
export const SHIFT_CLAIM_MS = 26 * 3600 * 1000;

/** Una richiesta di paga rimasta a metà si può riprendere dopo un minuto (vedi closeShift). */
export const PAY_LEASE_MS = 60_000;

/** Il giorno (AAAA-MM-GG) a Roma: il server non usa l'orologio del telefono. */
export function romeDay(now: number): string {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Europe/Rome',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(new Date(now));
  const get = (type: string) => parts.find((p) => p.type === type)?.value ?? '';
  return `${get('year')}-${get('month')}-${get('day')}`;
}

// ---------------------------------------------------------------- fine turno

/** Quello che il browser racconta del turno: oggetti consegnati, mance e bonus, multe. */
export interface ShiftClaim {
  delivered: number;
  tips: number;
  fine: number;
}

const count = (value: unknown): number | null =>
  Number.isSafeInteger(value) && (value as number) >= 0 ? (value as number) : null;

export function decodeClaim(value: unknown): ShiftClaim | null {
  if (!value || typeof value !== 'object') return null;
  const v = value as Record<string, unknown>;
  const delivered = count(v.delivered);
  const tips = count(v.tips ?? 0);
  const fine = count(v.fine ?? 0);
  if (delivered === null || tips === null || fine === null) return null;
  return { delivered, tips, fine };
}

/** La paga del turno come la calcola il gioco, con oggetti e mance entro i tetti del lavoro. */
export function shiftPay(
  job: JobKey,
  tier: { base: number; perItem: number },
  claim: ShiftClaim,
): number {
  const limits = JOB_CLAIM_LIMITS[job];
  const items = Math.min(claim.delivered, limits.items) * tier.perItem;
  const tips = Math.min(claim.tips, limits.tips * tier.perItem);
  // la multa si toglie dalla paga, che però non va mai sotto zero
  return Math.max(0, tier.base + items + tips - claim.fine);
}

// ---------------------------------------------------------------- lo stato sul server

/** Il turno in corso: lo apre il server, che si segna quando e con che paga. */
export interface OpenShift {
  id: string;
  job: JobKey;
  startedAt: number;
  base: number;
  perItem: number;
  /** la cassaforte in cui va la paga: percorso controllato all'inizio del turno */
  room: string;
}

/**
 * L'ultimo turno pagato. La paga si versa in due passi (chiudere il turno, poi la cassaforte):
 * 'paying' vuol dire che il secondo passo non è ancora confermato.
 */
export interface PaidShift {
  id: string;
  job: JobKey;
  pay: number;
  room: string;
  state: 'paying' | 'paid';
  lease: number;
}

/** sims_jobs/<uid>: lo scrive solo il Worker. */
export interface JobState {
  /** giorno (a Roma) dei turni contati in `count` */
  day: string;
  count: number;
  /** il lavoro che si sta facendo: cambiandolo, i turni del vecchio ripartono da zero */
  active?: JobKey;
  /** turni completati in ogni lavoro: decidono il livello di paga */
  exp: Partial<Record<JobKey, number>>;
  /** i turni del salvataggio sono già stati copiati (una volta sola) */
  imported: boolean;
  shift?: OpenShift;
  last?: PaidShift;
}

const record = (value: unknown): value is Record<string, unknown> =>
  !!value && typeof value === 'object' && !Array.isArray(value);

function decodeOpen(value: unknown): OpenShift | undefined {
  if (!record(value)) return undefined;
  const { id, job, startedAt, base, perItem, room } = value;
  if (typeof id !== 'string' || !isJobKey(job) || typeof room !== 'string') return undefined;
  if (count(startedAt) === null || count(base) === null || count(perItem) === null)
    return undefined;
  return {
    id,
    job,
    startedAt: startedAt as number,
    base: base as number,
    perItem: perItem as number,
    room,
  };
}

function decodePaid(value: unknown): PaidShift | undefined {
  if (!record(value)) return undefined;
  const { id, job, pay, room, state, lease } = value;
  if (typeof id !== 'string' || !isJobKey(job) || typeof room !== 'string') return undefined;
  if (state !== 'paying' && state !== 'paid') return undefined;
  if (count(pay) === null || count(lease) === null) return undefined;
  return { id, job, pay: pay as number, room, state, lease: lease as number };
}

/** Lo stato letto dal database (Firebase non salva gli oggetti vuoti: mancano, non sono rotti). */
export function decodeJobState(value: unknown): JobState {
  const v = record(value) ? value : {};
  const exp: Partial<Record<JobKey, number>> = {};
  if (record(v.exp))
    for (const job of JOB_KEYS) {
      const n = count(v.exp[job]);
      if (n !== null) exp[job] = n;
    }
  const state: JobState = {
    day: typeof v.day === 'string' ? v.day : '',
    count: count(v.count) ?? 0,
    exp,
    imported: v.imported === true,
  };
  if (isJobKey(v.active)) state.active = v.active;
  const shift = decodeOpen(v.shift);
  if (shift) state.shift = shift;
  const last = decodePaid(v.last);
  if (last) state.last = last;
  return state;
}

/**
 * La prima volta i turni fatti finora si prendono dal salvataggio del giocatore, fino a quelli
 * che servono per il livello più alto: nessuno perde la carriera, nessuno ne inventa una.
 */
export function importExperience(
  state: JobState,
  saved: { exp: unknown; active: unknown },
): JobState {
  if (state.imported) return state;
  const exp: Partial<Record<JobKey, number>> = { ...state.exp };
  if (record(saved.exp))
    for (const job of JOB_KEYS) {
      const n = count(saved.exp[job]);
      if (n !== null && exp[job] === undefined) exp[job] = Math.min(n, MAX_IMPORTED_EXPERIENCE);
    }
  const next: JobState = { ...state, exp, imported: true };
  if (!next.active && isJobKey(saved.active)) next.active = saved.active;
  return next;
}

/** Turni che si possono ancora iniziare oggi, secondo il server. */
export function shiftsLeft(state: JobState, now: number): number {
  const used = state.day === romeDay(now) ? state.count : 0;
  return Math.max(0, SHIFTS_PER_DAY - used);
}

export type StartOutcome = { ok: true; state: JobState; shift: OpenShift } | { ok: false };

/**
 * Apre un turno. Un turno ancora aperto (lasciato a metà, o la pagina ricaricata) si chiude
 * senza paga: era già contato fra quelli del giorno.
 */
export function startShift(
  state: JobState,
  job: JobKey,
  room: string,
  id: string,
  now: number,
): StartOutcome {
  if (shiftsLeft(state, now) <= 0) return { ok: false };
  const today = romeDay(now);
  const exp = { ...state.exp };
  if (state.active && state.active !== job) exp[state.active] = 0;
  const tier = jobPayTier((exp[job] ?? 0) + 1);
  const shift: OpenShift = {
    id,
    job,
    startedAt: now,
    base: tier.base,
    perItem: tier.perItem,
    room,
  };
  const next: JobState = {
    ...state,
    day: today,
    count: (state.day === today ? state.count : 0) + 1,
    active: job,
    exp,
    shift,
  };
  return { ok: true, state: next, shift };
}

export type CloseOutcome =
  /** turno chiuso: ora si versa `pay` nella cassaforte `room` */
  | { kind: 'pay'; state: JobState; pay: number; room: string; job: JobKey }
  /** già pagato (la stessa richiesta arrivata due volte) */
  | { kind: 'paid'; pay: number }
  /** un'altra richiesta sta versando proprio adesso questa paga */
  | { kind: 'busy' }
  | { kind: 'error'; error: 'nessun turno' | 'troppo presto' | 'scaduto' };

/**
 * Primo passo della paga: chiude il turno `id` e calcola quanto vale. Se una richiesta
 * precedente si è fermata dopo questo passo ('paying'), la si riprende, ma solo dopo
 * PAY_LEASE_MS: due richieste insieme non versano due volte.
 */
export function closeShift(
  state: JobState,
  id: string,
  claim: ShiftClaim,
  now: number,
): CloseOutcome {
  const shift = state.shift;
  if (shift && shift.id === id) {
    if (now - shift.startedAt < SHIFT_MIN_MS) return { kind: 'error', error: 'troppo presto' };
    if (now - shift.startedAt > SHIFT_CLAIM_MS) return { kind: 'error', error: 'scaduto' };
    const pay = shiftPay(shift.job, shift, claim);
    const next: JobState = {
      ...state,
      exp: { ...state.exp, [shift.job]: (state.exp[shift.job] ?? 0) + 1 },
      last: { id, job: shift.job, pay, room: shift.room, state: 'paying', lease: now },
    };
    delete next.shift;
    return { kind: 'pay', state: next, pay, room: shift.room, job: shift.job };
  }
  const last = state.last;
  if (last && last.id === id) {
    if (last.state === 'paid') return { kind: 'paid', pay: last.pay };
    if (now - last.lease < PAY_LEASE_MS) return { kind: 'busy' };
    return {
      kind: 'pay',
      state: { ...state, last: { ...last, lease: now } },
      pay: last.pay,
      room: last.room,
      job: last.job,
    };
  }
  return { kind: 'error', error: 'nessun turno' };
}

/** Ultimo passo: la paga è in cassaforte. */
export function markPaid(state: JobState, id: string): JobState | null {
  if (!state.last || state.last.id !== id) return null;
  return { ...state, last: { ...state.last, state: 'paid' } };
}
