// Il trasloco del gioco da tomm4so00.github.io/casadolcecasa a casadolcecasa.web.app. Per il browser
// sono due siti diversi, ognuno con la sua memoria: senza trasloco gli ospiti perderebbero il
// personaggio (il loro accesso anonimo vive solo lì) e tutti dovrebbero rifare l'accesso.
// La pagina del vecchio indirizzo (src/trasloco.ts) mette l'accesso e la memoria del gioco nel
// pezzo del link dopo "#", che il browser non manda a nessun server; il nuovo sito
// (src/game/move.ts) li salva prima di avviare Firebase e cancella subito quel pezzo.

/** Il nome nel link: …/#trasloco=<dati>. */
export const MOVE_PARAM = 'trasloco';
/** Un link di trasloco vale 10 minuti: chi lo ricopia dopo non porta nessuno nel suo account. */
export const MOVE_MAX_AGE_MS = 10 * 60_000;
/** La memoria del gioco che si porta: niente pezzi enormi (il salvataggio è già nel cloud). */
export const MOVE_VALUE_MAX = 4096;
export const MOVE_TOTAL_MAX = 24_000;

export interface MovePayload {
  v: 1;
  /** quando è partito il trasloco */
  t: number;
  /** l'accesso di Firebase (user.toJSON()), se c'era */
  user?: Record<string, unknown>;
  /** l'accesso era "non ricordarmi": sul nuovo sito resta solo finché la scheda è aperta */
  session?: boolean;
  /** la memoria del gioco (localStorage) */
  ls: Record<string, string>;
}

/** La chiave con cui Firebase tiene l'accesso nella memoria del browser. */
export const authStorageKey = (apiKey: string): string => `firebase:authUser:${apiKey}:[DEFAULT]`;

/** Le voci della memoria da portare: quelle del gioco, non quelle di Firebase né i salvataggi. */
export function movableStorage(entries: [string, string][]): Record<string, string> {
  const out: Record<string, string> = {};
  let total = 0;
  for (const [key, value] of entries) {
    if (key.startsWith('firebase:') || /sims_save_v1$/.test(key)) continue;
    if (value.length > MOVE_VALUE_MAX) continue;
    total += key.length + value.length;
    if (total > MOVE_TOTAL_MAX) break;
    out[key] = value;
  }
  return out;
}

function toBase64Url(text: string): string {
  const bytes = new TextEncoder().encode(text);
  let bin = '';
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}
function fromBase64Url(text: string): string {
  const bin = atob(text.replace(/-/g, '+').replace(/_/g, '/'));
  return new TextDecoder().decode(Uint8Array.from(bin, (c) => c.charCodeAt(0)));
}

/** Il link del nuovo sito con il trasloco; la ricerca (?invito=…) resta com'era. */
export function moveUrl(target: string, search: string, payload: MovePayload): string {
  const url = new URL(target);
  url.search = search;
  url.hash = `${MOVE_PARAM}=${toBase64Url(JSON.stringify(payload))}`;
  return url.toString();
}

/**
 * I dati di un trasloco dal pezzo dopo "#", o null se non c'è, è vecchio o è di un altro
 * progetto Firebase (per esempio dal gioco di prova a quello vero).
 */
export function readMove(hash: string, now: number, apiKey: string): MovePayload | null {
  const m = new RegExp(`(?:^#?|&)${MOVE_PARAM}=([A-Za-z0-9_-]+)`).exec(hash);
  if (!m) return null;
  let p: MovePayload;
  try {
    p = JSON.parse(fromBase64Url(m[1])) as MovePayload;
  } catch {
    return null;
  }
  if (!p || p.v !== 1 || typeof p.t !== 'number') return null;
  if (now - p.t > MOVE_MAX_AGE_MS || p.t - now > 60_000) return null;
  const ls: Record<string, string> = {};
  if (p.ls && typeof p.ls === 'object')
    for (const [k, v] of Object.entries(p.ls))
      if (typeof v === 'string' && !k.startsWith('firebase:')) ls[k] = v;
  const user =
    p.user &&
    typeof p.user === 'object' &&
    typeof p.user.uid === 'string' &&
    p.user.apiKey === apiKey
      ? p.user
      : undefined;
  return { v: 1, t: p.t, user, session: p.session === true, ls };
}
