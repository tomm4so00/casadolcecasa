// Quanti giocatori stanno giocando adesso e quanti personaggi sono vivi, per la prima schermata del
// gioco ("3 vicini online adesso", "14 vicini vivi"). Chi apre il gioco non ha ancora un account e
// non può leggere la presenza: la legge il Worker e risponde con i soli numeri, senza nomi. Si
// contano il mondo di sempre (sims_online_players) e ogni mondo nuovo (worlds/<codice>/online_players).
// Un personaggio resta nella presenza finché è vivo (chi esce resta segnato `offline`): le schede
// sono i vivi. Online è solo chi ha mandato il battito (ogni 5 secondi mentre gioca) da poco: un
// telefono che si spegne o perde la rete senza avvisare non viene segnato offline, e la sua scheda
// resterebbe "online" per giorni.

/** Legge un percorso del database; `shallow` = solo le chiavi del primo livello. */
export type OnlineReader = (path: string, shallow?: boolean) => Promise<unknown>;

/** Il numero si riusa per un minuto: la prima schermata la apre chiunque, anche tante volte. */
export const ONLINE_CACHE_MS = 60_000;

/** Online è chi ha mandato il battito da meno di così (ms). */
export const ONLINE_FRESH_MS = 90_000;

export interface PlayerCounts {
  /** stanno giocando adesso */
  online: number;
  /** personaggi vivi (le schede della presenza) */
  alive: number;
}

/** Online e vivi in un nodo della presenza. */
export function countPresent(node: unknown, now: number): PlayerCounts {
  const out = { online: 0, alive: 0 };
  if (!node || typeof node !== 'object') return out;
  for (const p of Object.values(node as Record<string, unknown>)) {
    if (!p || typeof p !== 'object') continue;
    out.alive++;
    const { offline, t } = p as { offline?: unknown; t?: unknown };
    if (offline !== true && typeof t === 'number' && Math.abs(now - t) < ONLINE_FRESH_MS)
      out.online++;
  }
  return out;
}

/** Online e vivi, in tutti i mondi. */
export async function countOnline(read: OnlineReader, now: number): Promise<PlayerCounts> {
  const total = countPresent(await read('sims_online_players'), now);
  const worlds = await read('worlds', true);
  if (worlds && typeof worlds === 'object')
    for (const code of Object.keys(worlds))
      if (/^CASA-[A-Z0-9]{4}$/.test(code)) {
        const c = countPresent(await read(`worlds/${code}/online_players`), now);
        total.online += c.online;
        total.alive += c.alive;
      }
  return total;
}

let cached: { counts: PlayerCounts; at: number } | null = null;

/** I numeri, letti al massimo una volta al minuto per copia del Worker. */
export async function onlineNow(read: OnlineReader, now: number): Promise<PlayerCounts> {
  if (cached && now - cached.at < ONLINE_CACHE_MS) return cached.counts;
  cached = { counts: await countOnline(read, now), at: now };
  return cached.counts;
}

/** Solo per i test: dimentica il numero ricordato. */
export function forgetOnline(): void {
  cached = null;
}
