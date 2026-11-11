// Annuncia ai giocatori la versione del gioco davvero online: la legge da version.json del sito
// (lo scrive la build, vedi vite.config.ts) e la mette in sims_meta/app. Così il banner "Nuova
// versione!" non parte prima che GitHub Pages abbia finito di pubblicare.
import { FIRST_APP_CHECK, OLD_CLIENTS_NUDGE, versionNumber } from '../../shared/app-version.js';

interface Reference {
  get(): Promise<{ val(): unknown }>;
  transaction(
    update: (value: unknown) => unknown,
  ): Promise<{ committed: boolean; snapshot: { val(): unknown } }>;
}
export interface VersionDatabase {
  ref(path: string): Reference;
}

/** La versione online (es. "0.30.0"), o null se il sito non risponde. */
export type OnlineVersion = () => Promise<string | null>;

/** Legge version.json dal sito del gioco, senza la copia della cache. */
export function siteVersion(gameUrl: string): OnlineVersion {
  return async () => {
    const response = await fetch(new URL('version.json?t=' + Date.now(), gameUrl));
    if (!response.ok) return null;
    const data = (await response.json()) as { version?: unknown };
    return typeof data.version === 'string' ? data.version : null;
  };
}

/** Scrive la versione online (solo se sale). Restituisce il numero annunciato, o 0. */
export async function announceOnlineVersion(
  database: VersionDatabase,
  online: OnlineVersion,
): Promise<number> {
  const n = versionNumber(await online());
  if (!n) return 0;
  // in ascolto non serve: si legge prima, così la transazione parte dal valore vero
  await database.ref('sims_meta/app').get();
  await database
    .ref('sims_meta/app')
    .transaction((value) => (typeof value === 'number' && value >= n ? undefined : n));
  // le versioni di prima guardano solo sims_meta/version (> 8): la spinta, una volta sola
  if (n >= versionNumber(FIRST_APP_CHECK)) {
    await database.ref('sims_meta/version').get();
    await database
      .ref('sims_meta/version')
      .transaction((value) =>
        typeof value === 'number' && value >= OLD_CLIENTS_NUDGE ? undefined : OLD_CLIENTS_NUDGE,
      );
  }
  return n;
}
