// Quanti giocatori sono collegati adesso, per la prima schermata del gioco ("12 vicini online").
// Chi apre il gioco non ha ancora un account e non può leggere la presenza: la legge il Worker e
// risponde con il solo numero, senza nomi. Si conta il mondo di sempre (sims_online_players) e
// ogni mondo nuovo (worlds/<codice>/online_players); chi chiude il gioco resta segnato `offline`.

/** Legge un percorso del database; `shallow` = solo le chiavi del primo livello. */
export type OnlineReader = (path: string, shallow?: boolean) => Promise<unknown>;

/** Il numero si riusa per un minuto: la prima schermata la apre chiunque, anche tante volte. */
export const ONLINE_CACHE_MS = 60_000;

/** I giocatori collegati in un nodo della presenza: quelli non segnati `offline`. */
export function countPresent(node: unknown): number {
  if (!node || typeof node !== 'object') return 0;
  let n = 0;
  for (const p of Object.values(node as Record<string, unknown>))
    if (p && typeof p === 'object' && (p as { offline?: unknown }).offline !== true) n++;
  return n;
}

/** Tutti i giocatori collegati, in tutti i mondi. */
export async function countOnline(read: OnlineReader): Promise<number> {
  let n = countPresent(await read('sims_online_players'));
  const worlds = await read('worlds', true);
  if (worlds && typeof worlds === 'object')
    for (const code of Object.keys(worlds))
      if (/^CASA-[A-Z0-9]{4}$/.test(code))
        n += countPresent(await read(`worlds/${code}/online_players`));
  return n;
}

let cached: { n: number; at: number } | null = null;

/** Il numero, letto al massimo una volta al minuto per copia del Worker. */
export async function onlineNow(read: OnlineReader, now: number): Promise<number> {
  if (cached && now - cached.at < ONLINE_CACHE_MS) return cached.n;
  cached = { n: await countOnline(read), at: now };
  return cached.n;
}

/** Solo per i test: dimentica il numero ricordato. */
export function forgetOnline(): void {
  cached = null;
}
