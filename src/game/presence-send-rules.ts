// Come si manda la propria presenza (sims_online_players/<id>) consumando poca banda.
// Ogni scrittura arriva a tutti i giocatori del mondo: con la scheda intera (circa 450 byte)
// 5-10 volte al secondo il consumo cresce col quadrato dei giocatori e sul piano gratuito di
// Firebase (10 GB al mese) il database si fermerebbe. Allora si manda solo quello che è cambiato
// (camminando, x e y) e la scheda intera solo ogni tanto, per rimettere a posto ciò che altri
// hanno toccato (il segno "offline" del server, una scrittura persa).
// Senza dipendenze dal browser, così è testabile.

/** Ogni quanto si guarda se mandare qualcosa (ms): 5 volte al secondo. */
export const PRESENCE_TICK_MS = 200;
/** Battito anche da fermi (ms): per gli altri si è ancora qui. */
export const PRESENCE_BEAT_MS = 5000;
/** Ogni quanto si rimanda la scheda intera (ms). */
export const PRESENCE_FULL_MS = 30_000;

export type PresencePayload = Record<string, unknown>;

/**
 * Le voci cambiate fra l'ultima scheda mandata e la nuova; quelle sparite valgono null, così
 * Firebase le toglie (per esempio `sick` quando passa l'influenza).
 */
export function presenceDiff(prev: PresencePayload, next: PresencePayload): PresencePayload {
  const out: PresencePayload = {};
  for (const [key, value] of Object.entries(next))
    if (JSON.stringify(value ?? null) !== JSON.stringify(prev[key] ?? null))
      out[key] = value ?? null;
  for (const key of Object.keys(prev)) if (!(key in next) && prev[key] != null) out[key] = null;
  return out;
}

/**
 * Che cosa mandare adesso: `full` la scheda intera (la prima volta, dopo una riconnessione o una
 * scrittura fallita, e ogni PRESENCE_FULL_MS), `diff` solo le voci cambiate (o solo l'ora del
 * battito), `none` niente.
 */
export function presenceSend(state: {
  /** l'ultima scheda mandata, null se va rimandata intera */
  last: PresencePayload | null;
  next: PresencePayload;
  now: number;
  lastSentAt: number;
  lastFullAt: number;
}): { kind: 'full' } | { kind: 'diff'; changes: PresencePayload } | { kind: 'none' } {
  if (!state.last || state.now - state.lastFullAt > PRESENCE_FULL_MS) return { kind: 'full' };
  const changes = presenceDiff(state.last, state.next);
  if (Object.keys(changes).length || state.now - state.lastSentAt > PRESENCE_BEAT_MS)
    return { kind: 'diff', changes };
  return { kind: 'none' };
}
