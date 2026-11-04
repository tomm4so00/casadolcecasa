// Bacheca dei pettegolezzi del cortile: i fatti del condominio scritti da soli
// (senza dipendenze dal browser, così sono testabili).

export interface GossipEntry {
  /** Chi ha fatto succedere il fatto (playerId): così il database sa chi l'ha scritto. */
  by: string;
  text: string;
  /** Ora (del server) del fatto. */
  t: number;
  /** Di chi si parla (playerId separati da virgola): ricevono l'avviso "si parla di te". */
  about?: string;
}

export const GOSSIP_MAX_TEXT = 140;
/** Quanti fatti si leggono sulla bacheca. */
export const GOSSIP_SHOW = 15;

const ID_RE = /^player_[A-Za-z0-9_-]{1,128}$/;

/** Legge un fatto dal database scartando quelli non validi. */
export function decodeGossip(value: unknown): GossipEntry | null {
  if (!value || typeof value !== 'object') return null;
  const v = value as Record<string, unknown>;
  if (typeof v.by !== 'string' || !ID_RE.test(v.by)) return null;
  if (typeof v.text !== 'string' || !v.text.trim()) return null;
  if (!Number.isFinite(v.t) || (v.t as number) <= 0) return null;
  const out: GossipEntry = { by: v.by, text: v.text.slice(0, GOSSIP_MAX_TEXT), t: v.t as number };
  if (typeof v.about === 'string' && v.about) out.about = v.about.slice(0, 300);
  return out;
}

/** Il fatto parla di questo giocatore? */
export const isAbout = (e: GossipEntry, playerId: string): boolean =>
  !!e.about && e.about.split(',').includes(playerId);

/** "adesso", "5 minuti fa", "3 ore fa", "ieri", "4 giorni fa". */
export function timeAgo(t: number, now: number): string {
  const min = Math.max(0, Math.floor((now - t) / 60000));
  if (min < 1) return 'adesso';
  if (min < 60) return `${min} ${min === 1 ? 'minuto' : 'minuti'} fa`;
  const h = Math.floor(min / 60);
  if (h < 24) return `${h} ${h === 1 ? 'ora' : 'ore'} fa`;
  const d = Math.floor(h / 24);
  return d === 1 ? 'ieri' : `${d} giorni fa`;
}

/** Chiave del fatto nel database: ordinata per tempo, come la chat. */
export const gossipKey = (t: number, rnd: string): string =>
  Math.floor(t).toString(36).padStart(9, '0') + '_' + rnd;

/**
 * Lo stesso fatto non si ripete di continuo (es. tanti pugni di fila alla stessa persona):
 * true se il testo è già stato scritto da poco.
 */
export function isRepeat(
  recent: Record<string, number>,
  text: string,
  now: number,
  windowMs: number,
): boolean {
  const last = recent[text];
  return last !== undefined && now - last < windowMs;
}
