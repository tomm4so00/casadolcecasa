// Progetti di gruppo del laboratorio ingegneristico (senza dipendenze dal browser, così è testabile).

export type ProjectId = 'rocket';

export interface ProjectDef {
  id: ProjectId;
  name: string;
  description: string;
  /** Soglie (somme versate in totale) a cui il progetto avanza di una fase. */
  stages: { at: number; label: string }[];
}

export const PROJECTS: Record<ProjectId, ProjectDef> = {
  rocket: {
    id: 'rocket',
    name: 'Razzo spaziale 🚀',
    description:
      'Costruiamo insieme un razzo nella zona esterna del laboratorio. Con 5.000 € iniziano i lavori e si vedono i primi pezzi; con altri 10.000 € il razzo è completo e si può premere il pulsante rosso per lanciarlo!',
    stages: [
      { at: 5000, label: 'Lavori iniziati: primi pezzi del razzo' },
      { at: 15000, label: 'Razzo completo' },
    ],
  },
};

/** Versamento minimo, così la bacheca non si riempie di monetine. */
export const MIN_DONATION = 10;

export interface ProjectState {
  /** Totale versato da tutti i giocatori. */
  funded: number;
  /** Quanto ha versato ogni giocatore. */
  donors: Record<string, { name: string; amount: number }>;
  /** Ora (del server) del lancio, fissata da chi preme il pulsante rosso. */
  launchAt?: number;
  /** Nome di chi ha premuto il pulsante. */
  launchBy?: string;
  /** Ultimo decollo verso la luna e dalla luna (ora del server). */
  tripAt?: number;
  moonTripAt?: number;
}

/** Obiettivo finale (l'ultima soglia). */
export const projectGoal = (p: ProjectDef): number => p.stages[p.stages.length - 1].at;

/** Fase raggiunta: 0 = nessun lavoro, 1 = primi pezzi, 2 = completo. */
export function projectStage(p: ProjectDef, funded: number): number {
  return p.stages.filter((s) => funded >= s.at).length;
}

/** Quanto manca alla prossima fase (0 se il progetto è completo). */
export function toNextStage(p: ProjectDef, funded: number): number {
  const next = p.stages.find((s) => funded < s.at);
  return next ? next.at - funded : 0;
}

/** Spiega perché un versamento non va bene, oppure null se va bene. */
export function donationError(
  p: ProjectDef,
  funded: number,
  amount: number,
  money: number,
): string | null {
  const left = projectGoal(p) - funded;
  if (left <= 0) return 'Il progetto è già completo!';
  if (!Number.isSafeInteger(amount) || amount <= 0) return 'Scrivi un numero intero di euro.';
  if (amount < MIN_DONATION && amount < left) return `Il versamento minimo è di ${MIN_DONATION} €.`;
  if (amount > left) return `Per completare il progetto mancano solo ${left} €.`;
  if (amount > money) return 'Non hai abbastanza soldi in cassaforte.';
  return null;
}

/** Legge lo stato dal database scartando i valori non validi. */
export function decodeProject(value: unknown): ProjectState {
  const out: ProjectState = { funded: 0, donors: {} };
  if (!value || typeof value !== 'object') return out;
  const v = value as Record<string, unknown>;
  if (typeof v.funded === 'number' && Number.isFinite(v.funded) && v.funded > 0)
    out.funded = Math.floor(v.funded);
  if (typeof v.launchAt === 'number' && Number.isFinite(v.launchAt) && v.launchAt > 0)
    out.launchAt = v.launchAt;
  if (typeof v.launchBy === 'string') out.launchBy = v.launchBy.slice(0, 20);
  const tripAt = (t: unknown) =>
    t && typeof t === 'object' && typeof (t as { at?: unknown }).at === 'number'
      ? (t as { at: number }).at
      : undefined;
  out.tripAt = tripAt(v.trip);
  out.moonTripAt = tripAt(v.moonTrip);
  if (out.tripAt === undefined) delete out.tripAt;
  if (out.moonTripAt === undefined) delete out.moonTripAt;
  const donors = (v.donors || {}) as Record<string, unknown>;
  for (const [pid, d] of Object.entries(donors)) {
    if (!d || typeof d !== 'object') continue;
    const { name, amount } = d as Record<string, unknown>;
    if (typeof amount === 'number' && amount > 0)
      out.donors[pid] = { name: typeof name === 'string' ? name.slice(0, 20) : '?', amount };
  }
  return out;
}

/** Chi ha versato di più, in ordine. */
export function topDonors(
  state: ProjectState,
  n = 5,
): { id: string; name: string; amount: number }[] {
  return Object.entries(state.donors)
    .map(([id, d]) => ({ id, ...d }))
    .sort((a, b) => b.amount - a.amount)
    .slice(0, n);
}

// ---------------------------------------------------------------- lancio del razzo

/** Dopo aver premuto il pulsante rosso il razzo parte tra 10 secondi. */
export const LAUNCH_DELAY_MS = 10 * 1000;
/** Somma raccolta a cui parte la notifica sul telefono per tutti. */
export const ROCKET_NOTIFY_AT = 14000;
/** Accensione dei motori prima del decollo. */
export const LAUNCH_IGNITION_MS = 4000;
/** Durata di tutto il lancio (accensione + salita fino a sparire in cielo). */
export const LAUNCH_ANIM_MS = 25000;

export type LaunchPhase = 'building' | 'waiting' | 'countdown' | 'launching' | 'launched';

/**
 * Fase del lancio, uguale per tutti perché usa l'ora del server.
 * waiting = razzo completo, si aspetta che qualcuno prema il pulsante rosso.
 */
export function launchPhase(
  stage: number,
  launchAt: number | undefined,
  now: number,
): { phase: LaunchPhase; left: number; since: number } {
  if (stage < 2) return { phase: 'building', left: 0, since: 0 };
  if (!launchAt) return { phase: 'waiting', left: 0, since: 0 };
  if (now < launchAt) return { phase: 'countdown', left: launchAt - now, since: 0 };
  const since = now - launchAt;
  return { phase: since < LAUNCH_ANIM_MS ? 'launching' : 'launched', left: 0, since };
}

/** Quanto è salito il razzo (unità del mondo) dopo `since` ms dal via: prima si accende, poi accelera. */
export function launchLift(since: number): number {
  const t = (since - LAUNCH_IGNITION_MS) / 1000;
  if (t <= 0) return 0;
  return 9 * t * t + 6 * t;
}

/** Testo del conto alla rovescia, es. "09:42". */
export function countdownText(ms: number): string {
  const s = Math.max(0, Math.ceil(ms / 1000));
  return `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`;
}

// ---------------------------------------------------------------- viaggi sulla luna

/** Prezzo del viaggio sulla luna (andata e ritorno). */
export const MOON_TRIP_PRICE = 500;
/** Il razzo resta via per un po', poi torna e atterra sulla rampa. */
export const FLIGHT_AWAY_MS = 60 * 1000;
export const FLIGHT_LANDING_MS = 12 * 1000;
/** Tempo totale di un volo: dopo questo il razzo è di nuovo pronto. */
export const FLIGHT_TOTAL_MS = FLIGHT_AWAY_MS + FLIGHT_LANDING_MS;
/** Chi è a bordo arriva a destinazione quando il razzo è ormai alto nel cielo. */
export const FLIGHT_ARRIVE_MS = 9 * 1000;

export type FlightPhase = 'idle' | 'launching' | 'away' | 'landing';

/**
 * Dove si trova il razzo, dato l'ultimo decollo (ora del server): sale, resta via, torna giù
 * frenando con i motori e poi è di nuovo sulla rampa, pronto per un altro viaggio.
 */
export function rocketFlight(
  departedAt: number | undefined,
  now: number,
): { phase: FlightPhase; since: number; lift: number; readyIn: number } {
  if (!departedAt || now < departedAt) return { phase: 'idle', since: 0, lift: 0, readyIn: 0 };
  const since = now - departedAt;
  const readyIn = Math.max(0, FLIGHT_TOTAL_MS - since);
  if (since < LAUNCH_ANIM_MS)
    return { phase: 'launching', since, lift: launchLift(since), readyIn };
  if (since < FLIGHT_AWAY_MS) return { phase: 'away', since, lift: 0, readyIn };
  if (since < FLIGHT_TOTAL_MS) {
    const s = (FLIGHT_TOTAL_MS - since) / 1000;
    return { phase: 'landing', since, lift: 9 * s * s + 6 * s, readyIn };
  }
  return { phase: 'idle', since, lift: 0, readyIn: 0 };
}
