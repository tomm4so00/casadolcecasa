// Parametri vitali che ogni giocatore pubblica agli altri (senza dipendenze dal browser).

export type VitalKey = 'health' | 'sleep' | 'hunger' | 'hygiene' | 'happiness';

/** Nome breve del campo nei dati online di ogni parametro. */
export const VITAL_FIELDS: Record<VitalKey, string> = {
  health: 'hp',
  sleep: 'sleep',
  hunger: 'hun',
  hygiene: 'hyg',
  happiness: 'hap',
};

export interface PlayerVitals extends Record<VitalKey, number | null> {
  /** Ambiente in cui si trova, come lo vede lui (es. "Banca Dolce Casa 🏦"). */
  place: string;
}

/** Legge i parametri di un altro giocatore; null se non li pubblica (versione vecchia del gioco). */
export function onlineVitals(op: Record<string, unknown> | null | undefined): PlayerVitals {
  const out = { place: '' } as PlayerVitals;
  for (const k of Object.keys(VITAL_FIELDS) as VitalKey[]) {
    const v = op?.[VITAL_FIELDS[k]];
    out[k] =
      typeof v === 'number' && Number.isFinite(v)
        ? Math.round(Math.max(0, Math.min(100, v)))
        : null;
  }
  if (typeof op?.place === 'string') out.place = op.place.slice(0, 50);
  return out;
}

/** Valori da pubblicare (arrotondati, così si invia solo quando cambiano di almeno 1%). */
export function publishVitals(levels: Record<VitalKey, number>, place: string) {
  const out: Record<string, number | string> = {};
  for (const k of Object.keys(VITAL_FIELDS) as VitalKey[])
    out[VITAL_FIELDS[k]] = Math.round(Math.max(0, Math.min(100, levels[k] || 0)));
  out.place = String(place || '').slice(0, 50);
  return out;
}
