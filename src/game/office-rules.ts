// Regole del turno in ufficio, oltre ai compiti normali: la sete, le stampe chieste dai colleghi
// e la visita del capo. Niente browser qui: le usa office.ts e le controllano i test.

/** Da piena a vuota, la goccia della sete si svuota in questi secondi. */
export const THIRST_SECONDS = 28;
/** Sotto questo livello compare l'avviso "bevi". */
export const THIRST_WARN = 0.35;
/** Disidratati: per quanti secondi ci si muove più lenti, e quanto. */
export const SLOW_SECONDS = 4;
export const SLOW_FACTOR = 0.6;
/** Quanto ci mette la stampante a far uscire un foglio. */
export const PRINT_SECONDS = 2.5;
/** Il capo: quanto tempo si ha per portargli la pratica. */
export const BOSS_LIMIT = 10;
/** Velocità del capo che entra ed esce, e dei colleghi che scappano in tondo. */
export const BOSS_SPEED = 110;

const clamp01 = (k: number) => Math.max(0, Math.min(1, k));

/** Livello della sete dopo `dt` secondi (1 = appena bevuto, 0 = disidratati). */
export function thirstAfter(level: number, dt: number): number {
  return clamp01(level - dt / THIRST_SECONDS);
}

/** Secondi fino alla prossima stampa chiesta da un collega. `r` tra 0 e 1. */
export function printGap(r: number): number {
  return 12 + clamp01(r) * 10;
}

/**
 * Se in questo turno arriva il capo (una volta ogni due, a caso) e dopo quanti secondi: a metà
 * turno, così c'è tempo prima e dopo. `r1`, `r2` tra 0 e 1; `shift` è la durata del turno.
 */
export function bossPlan(r1: number, r2: number, shift: number): { comes: boolean; at: number } {
  return { comes: r1 < 0.5, at: shift * (0.3 + clamp01(r2) * 0.3) };
}

/** Bonus per aver accontentato il capo: vale tre consegne. */
export function bossBonus(perItem: number): number {
  return perItem * 3;
}
