// Parametri vitali che ogni giocatore pubblica agli altri (senza dipendenze dal browser).

export type VitalKey = 'health' | 'sleep' | 'hunger' | 'hygiene' | 'happiness';

/** Nome breve del campo nei dati online di ogni parametro. */
const VITAL_FIELDS: Record<VitalKey, string> = {
  health: 'hp',
  sleep: 'sleep',
  hunger: 'hun',
  hygiene: 'hyg',
  happiness: 'hap',
};

interface PlayerVitals extends Record<VitalKey, number | null> {
  /** Ambiente in cui si trova, come lo vede lui (es. "Banca Dolce Casa 🏦"). */
  place: string;
}

/** Legge i parametri di un altro giocatore; null se non li pubblica (versione vecchia del gioco). */
export function onlineVitals(data: object | null | undefined): PlayerVitals {
  const op = data as Record<string, unknown> | null | undefined; // dati di rete: si controlla ogni campo
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

// ---------------------------------------------------------------- l'elenco delle icone

/** Icone dei vicini sempre in vista: con più giocatori, dopo queste c'è il pulsante «+». */
export const ICONS_SHOWN = 4;

/**
 * Quali icone mostrare e quante ne restano nascoste. `ids` è in ordine di nome; chi ho toccato
 * (`recent`, dal più recente) sale in cima. Chiuso l'elenco se ne vedono al massimo ICONS_SHOWN.
 */
export function iconOrder(
  ids: string[],
  recent: string[],
  expanded: boolean,
  max = ICONS_SHOWN,
): { shown: string[]; hidden: number } {
  const online = new Set(ids);
  const first = recent.filter((id) => online.has(id));
  const order = [...first, ...ids.filter((id) => !first.includes(id))];
  // con uno solo in più non serve il pulsante: si mostra e basta
  if (expanded || order.length <= max + 1) return { shown: order, hidden: 0 };
  return { shown: order.slice(0, max), hidden: order.length - max };
}

/** Il giocatore toccato va in cima ai recenti (senza doppioni, al massimo 50). */
export const touchRecent = (recent: string[], id: string): string[] =>
  [id, ...recent.filter((x) => x !== id)].slice(0, 50);
