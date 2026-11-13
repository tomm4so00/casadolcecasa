// Da dove arrivano i giocatori: un link con ?da=itch (o telegram, tiktok…) lo dice al gioco.
// Si ricorda la prima provenienza del dispositivo (source.ts) e si contano i passi
// dell'ingresso anche divisi per provenienza: ingresso:itch:gioca_subito accanto a
// ingresso:gioca_subito (usage.ts, shared/usage-rules.ts). Per la ritenzione la provenienza va
// anche nell'account (sims_sources/<uid>), solo per gli account appena nati.
// Senza dipendenze dal browser, così è testabile.

/** La memoria del dispositivo con la prima provenienza. */
export const SOURCE_KEY = 'sims_source';
/** Com'è fatta una provenienza (le regole del database vogliono lo stesso). */
export const SOURCE_RE = /^[a-z0-9_-]{1,16}$/;
/** Un account nato da meno di così prende la provenienza del dispositivo. */
export const NEW_ACCOUNT_MS = 24 * 3600 * 1000;

/** La provenienza scritta nel link (?da=…), o null se non c'è o non va bene. */
export function sourceFromSearch(search: string): string | null {
  const raw = new URLSearchParams(search).get('da');
  if (!raw) return null;
  const s = raw.trim().toLowerCase();
  return SOURCE_RE.test(s) ? s : null;
}

/**
 * Si ricorda solo la prima: non se il dispositivo ne ha già una, né se ha già giocato senza
 * (allora è arrivato da solo, e un link dopo non cambia da dove è venuto).
 */
export function shouldRememberSource(
  fromLink: string | null,
  stored: string | null,
  playedBefore: boolean,
): boolean {
  return !!fromLink && !stored && !playedBefore;
}

/**
 * Il contatore per provenienza di un passo dell'ingresso: "ingresso:gioca_subito" con "itch"
 * diventa "ingresso:itch:gioca_subito". Null per le altre voci o se viene troppo lungo.
 */
export function sourceCounter(what: string, source: string | null): string | null {
  if (!source || !SOURCE_RE.test(source)) return null;
  const parts = what.split(':');
  if (parts.length !== 2 || parts[0] !== 'ingresso') return null;
  const key = `ingresso:${source}:${parts[1]}`;
  return /^[a-z0-9_:-]{1,40}$/.test(key) ? key : null;
}
