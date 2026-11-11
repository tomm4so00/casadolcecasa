// La versione del gioco (package.json) come numero, per sapere chi ha una versione vecchia aperta.
// Il sito pubblica version.json a ogni build; la manutenzione (server/src/index.ts) legge quella
// davvero online e la scrive in sims_meta/app; il gioco mostra "Nuova versione!" a chi è indietro.

/** "0.30.1" → 30001: major × 1.000.000 + minor × 1.000 + patch. 0 se non è una versione. */
export function versionNumber(version: unknown): number {
  const m = typeof version === 'string' ? /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/.exec(version) : null;
  return m ? Number(m[1]) * 1_000_000 + Number(m[2]) * 1_000 + Number(m[3]) : 0;
}

/** Il banner va mostrato: online c'è una versione più nuova di quella aperta. */
export function updateAvailable(online: unknown, mine: string): boolean {
  const mineN = versionNumber(mine);
  return typeof online === 'number' && mineN > 0 && online > mineN;
}

/**
 * La prima versione che controlla sims_meta/app. Quando è online, il server porta anche
 * sims_meta/version a 9, una volta sola: le versioni più vecchie guardano solo quel campo
 * (versione > 8) e così mostrano il banner anche loro.
 */
export const FIRST_APP_CHECK = '0.30.0';
export const OLD_CLIENTS_NUDGE = 9;
