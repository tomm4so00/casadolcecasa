// Giocatori offline: restano visibili dove si trovavano quando sono usciti, con la scritta
// "offline", e, se non dormivano, svengono quando il sonno arriva a zero. Spariscono solo da
// morti (o cancellando l'account): lì la manutenzione toglie davvero la loro presenza.
// Senza dipendenze dal browser, così è testabile.
/** Sonno minimo con cui ci si rialza dopo essere svenuti, per riuscire ad arrivare al letto. */
export const SLEEP_AFTER_FAINT = 10;

export interface PresenceInfo {
  /** Ultimo battito (ora del server). */
  t?: number;
  /** true quando il giocatore ha lasciato il gioco. */
  offline?: boolean;
  /** Ora del server in cui è uscito. */
  offAt?: number;
  /** Sonno (0-100) al momento dell'ultimo aggiornamento. */
  sleep?: number;
  /** Azione in corso: sleep, shower, kiss, faint… */
  act?: string;
}

type PresenceState = 'online' | 'offline' | 'fainted' | 'sleeping';

/** Momento in cui il sonno di chi è uscito sveglio arriva a zero. */
export function faintTime(sleep: number, offAt: number, sleepDepletionSec: number): number {
  return offAt + (Math.max(0, Math.min(100, sleep)) / 100) * sleepDepletionSec * 1000;
}

/**
 * Come mostrare un altro giocatore.
 * `alive` dice se il suo battito è recente; `now` è l'ora del server.
 */
export function presenceState(
  op: PresenceInfo,
  alive: boolean,
  now: number,
  sleepDepletionSec: number,
): PresenceState {
  const offline = !!op.offline || !alive;
  if (!offline) return op.act === 'faint' ? 'fainted' : 'online';
  // nessun limite di tempo: chi è via da giorni (anche in criogenesi) resta lì
  const since = op.offAt || op.t || 0;
  if (op.act === 'sleep') return 'sleeping';
  if (op.act === 'faint') return 'fainted';
  if (since && typeof op.sleep === 'number' && now >= faintTime(op.sleep, since, sleepDepletionSec))
    return 'fainted';
  return 'offline';
}

/**
 * Al rientro: chi è uscito sveglio e ha finito il sonno durante l'assenza si ritrova svenuto.
 */
export function faintedWhileAway(wasSleeping: boolean, sleepNow: number): boolean {
  return !wasSleeping && sleepNow <= 0.01;
}

/** Ambienti in cui si può riprendere da dove si era svenuti (non durante un turno di lavoro). */
export const RESUMABLE_ENVS = new Set([
  'SALOON',
  'KITCHEN',
  'BATHROOM',
  'CORTILE',
  'PLAYER_ROOM',
  'negozio_vestiti',
  'negozio_mobili',
  'banca',
  'commissariato',
  'laboratorio',
  'galleria',
  'ingegneria',
  'ingegneria_esterno',
  'scommesse',
  'sala_giochi',
  'centro_commerciale',
  'luna',
  'base_lunare',
  'growshop',
  'negozio_animali',
  'collezionismo',
  'usato',
  'bar',
  'passeggiata',
  'discoteca',
  'viaggio',
  'CIMITERO',
]);
/** Ambienti da cui si torna a casa con il pulsante apposito (gli altri hanno una porta). */
export const RETURN_BUTTON_ENVS = new Set([
  'bar',
  'passeggiata',
  'discoteca',
  'viaggio',
  'CIMITERO',
]);
