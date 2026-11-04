// Addestramento del cane nell'area cani: quanto spesso obbedisce a "seduto" e "dà la zampa", cosa
// fa quando non obbedisce e come i premietti dati al momento giusto glielo insegnano.
// Regole senza browser: lo svolgimento è in dog-training.ts, il salvataggio in pet-rules.

export type TrainCommand = 'sit' | 'paw';
/** Cosa fa il cane dopo un comando: lo esegue, oppure si distrae in uno dei tre modi. */
export type DogReaction = TrainCommand | 'bark' | 'wander' | 'spin';

/** Premietti meritati per comando (salvati con il cane). */
export interface DogTraining {
  sit: number;
  paw: number;
}

/** Probabilità di obbedire da cucciolo: la zampa è più difficile dello stare seduto. */
export const TRAIN_BASE: Record<TrainCommand, number> = { sit: 0.3, paw: 0.22 };
/** Il massimo a cui si arriva con tanti premietti: anche il cane più bravo ogni tanto si distrae. */
export const TRAIN_MAX: Record<TrainCommand, number> = { sit: 0.92, paw: 0.88 };
/** Quanti premietti servono per fare circa due terzi della strada dalla base al massimo. */
export const TRAIN_PACE = 10;
/** Oltre questi premietti non si conta più (il salvataggio resta piccolo). */
export const TRAIN_CAP = 60;
/** Il premietto insegna qualcosa solo se arriva entro questi secondi dall'esecuzione giusta. */
export const REWARD_WINDOW_S = 5;
/** Prezzo di un premietto. */
export const TREAT_PRICE = 1;

export const COMMAND_NAME: Record<TrainCommand, string> = { sit: 'seduto', paw: 'dà la zampa' };

export function emptyTraining(): DogTraining {
  return { sit: 0, paw: 0 };
}

/** Probabilità che il cane esegua il comando, dati i premietti già meritati. */
export function obeyChance(cmd: TrainCommand, train: DogTraining | undefined): number {
  const n = Math.max(0, Math.min(TRAIN_CAP, train?.[cmd] || 0));
  const base = TRAIN_BASE[cmd],
    max = TRAIN_MAX[cmd];
  return base + (max - base) * (1 - Math.exp(-n / TRAIN_PACE));
}

/**
 * Reazione a un comando: `r1` decide se obbedisce, `r2` quale distrazione sceglie
 * (abbaia, si allontana un attimo o fa un giretto). Tutti e due tra 0 e 1.
 */
export function reactTo(
  cmd: TrainCommand,
  train: DogTraining | undefined,
  r1: number,
  r2: number,
): DogReaction {
  if (r1 < obeyChance(cmd, train)) return cmd;
  return r2 < 0.4 ? 'bark' : r2 < 0.7 ? 'wander' : 'spin';
}

/** L'ultima volta che ha obbedito, finché non riceve il premietto. */
export interface LastSuccess {
  cmd: TrainCommand;
  /** Secondi di gioco. */
  at: number;
}

/** Il premietto dato adesso conta per l'addestramento? Solo subito dopo un comando eseguito. */
export function treatTeaches(last: LastSuccess | null, now: number): boolean {
  return !!last && now >= last.at && now - last.at <= REWARD_WINDOW_S;
}

/** Il cane ha ricevuto il premietto giusto: la prossima volta obbedirà più volentieri. */
export function rewarded(train: DogTraining | undefined, cmd: TrainCommand): DogTraining {
  const t = { ...emptyTraining(), ...train };
  t[cmd] = Math.min(TRAIN_CAP, t[cmd] + 1);
  return t;
}

/** Percentuale intera da mostrare ("Seduto 30%"). */
export function chancePercent(cmd: TrainCommand, train: DogTraining | undefined): number {
  return Math.round(obeyChance(cmd, train) * 100);
}
