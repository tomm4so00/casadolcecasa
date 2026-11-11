// La pausa: con la scheda nascosta da un po' il gioco si scollega dal database, così non tiene
// occupata una delle 100 connessioni del piano Spark (regole senza browser, coperte dai test).
// Per il personaggio la pausa è come aver chiuso il gioco: al ritorno la pagina si ricarica e il
// tempo passato lo conta catchUpOffline, come per ogni assenza.

/** Scheda nascosta da così tanto: pausa. */
export const DORMANT_AFTER_MS = 10 * 60_000;
/** Se il personaggio dorme basta meno: di notte la connessione si libera presto. */
export const DORMANT_ASLEEP_MS = 2 * 60_000;

export interface DormancyCheck {
  /** da quanto la scheda è nascosta (0 se è visibile) */
  hiddenFor: number;
  /** il personaggio sta dormendo */
  sleeping: boolean;
  /** c'è qualcosa che una ricarica interromperebbe (turno, scasso, razzo, morte da registrare…) */
  busy: boolean;
}

/** È il momento di andare in pausa? */
export function shouldGoDormant(c: DormancyCheck): boolean {
  if (c.busy || c.hiddenFor <= 0) return false;
  return c.hiddenFor >= (c.sleeping ? DORMANT_ASLEEP_MS : DORMANT_AFTER_MS);
}

/**
 * Al ritorno dalla pausa: si ricarica la pagina, a meno che nel frattempo il personaggio sia
 * stato aperto su un altro dispositivo, che ha ancora la sessione (sims_sessions). Allora si
 * mostra il solito avviso: ricaricare da soli la ruberebbe a chi sta giocando adesso.
 */
export function wakeAction(stored: unknown, mine: string | null, now: number): 'reload' | 'taken' {
  if (!stored || typeof stored !== 'object') return 'reload';
  const { id, expiresAt } = stored as Record<string, unknown>;
  if (typeof id !== 'string' || id === mine) return 'reload';
  return typeof expiresAt === 'number' && expiresAt > now ? 'taken' : 'reload';
}
