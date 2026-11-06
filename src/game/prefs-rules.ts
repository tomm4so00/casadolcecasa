// Preferenze del giocatore che viaggiano con il salvataggio online (campo "prefs"), così restano
// uguali su ogni telefono, browser o app installata: suoni, musica, notifiche, elenco dei
// giocatori aperto o chiuso, pettegolezzi letti, ultimo avviso di borsa visto, ultimo posto.
// Qui solo il controllo dei valori: niente browser.

export interface Prefs {
  sound?: boolean;
  music?: boolean;
  notify?: boolean;
  hudFull?: boolean;
  gossipRead?: number;
  eventSeen?: string;
  /** ultimo posto in cui si era (JSON scritto da startPresence, letto da resumeLastSpot) */
  lastSpot?: string;
}

const MAX_TEXT = 400;

/** Tiene solo i campi del tipo giusto: un salvataggio rovinato non deve rompere niente. */
export function decodePrefs(value: unknown): Prefs {
  if (!value || typeof value !== 'object') return {};
  const v = value as Record<string, unknown>;
  const out: Prefs = {};
  for (const key of ['sound', 'music', 'notify', 'hudFull'] as const)
    if (typeof v[key] === 'boolean') out[key] = v[key] as boolean;
  if (typeof v.gossipRead === 'number' && Number.isFinite(v.gossipRead) && v.gossipRead >= 0)
    out.gossipRead = v.gossipRead;
  for (const key of ['eventSeen', 'lastSpot'] as const)
    if (typeof v[key] === 'string' && (v[key] as string).length <= MAX_TEXT)
      out[key] = v[key] as string;
  return out;
}
