// Tentativi di furto alle casseforti (senza dipendenze dal browser, così è testabile).
// Sono salvati online per ogni ladro e ogni stanza: ricaricare la pagina non li azzera.

/** Tentativi con la stessa cassaforte prima che scatti l'allarme. */
export const THEFT_TRIES = 3;
/** Quanto resta attivo l'allarme dopo il primo tentativo. */
export const THEFT_LOCK_MS = 24 * 3600 * 1000;

export interface TheftRecord {
  /** Tentativi fatti da `since`. */
  n: number;
  /** Momento (ora del server) del primo tentativo del periodo. */
  since: number;
}

export function decodeTheftRecord(value: unknown): TheftRecord | null {
  if (!value || typeof value !== 'object') return null;
  const { n, since } = value as Record<string, unknown>;
  if (!Number.isSafeInteger(n) || typeof since !== 'number' || !Number.isFinite(since)) return null;
  return { n: n as number, since };
}

const expired = (r: TheftRecord | null, now: number) => !r || now - r.since >= THEFT_LOCK_MS;

/** Tentativi rimasti adesso con questa cassaforte. */
export function theftTriesLeft(r: TheftRecord | null, now: number, tries = THEFT_TRIES): number {
  return expired(r, now) ? tries : Math.max(0, tries - r!.n);
}

/** Millisecondi prima che l'allarme si spenga (0 se si può provare). */
export function theftLockLeft(r: TheftRecord | null, now: number, tries = THEFT_TRIES): number {
  if (theftTriesLeft(r, now, tries) > 0) return 0;
  return r!.since + THEFT_LOCK_MS - now;
}

/** Nuovo stato dopo un tentativo, oppure null se l'allarme è attivo. */
export function recordTheftAttempt(
  r: TheftRecord | null,
  now: number,
  tries = THEFT_TRIES,
): TheftRecord | null {
  if (expired(r, now)) return { n: 1, since: now };
  if (r!.n >= tries) return null;
  return { n: r!.n + 1, since: r!.since };
}
