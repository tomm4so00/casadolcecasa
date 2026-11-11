// Combinazione della cassaforte: si salva cifrata, nel nodo privato del giocatore
// (shared/safe-pin-rules.ts e safe-pins.ts).
import { hashPin } from '../../shared/safe-pin-rules.js';

export { hashPin };

// ---------------------------------------------------------------- livelli della cassaforte

/** Mobile del negozio che porta la cassaforte a muro al livello 2. */
export const SAFE_LEVEL2_ID = 'safe_pre';
/** Prezzo della cassaforte livello 2. */
export const SAFE_LEVEL2_PRICE = 850;

/** Livello della cassaforte di una stanza, dai mobili posseduti da chi ci abita (1 o 2). */
export const safeLevel = (owned?: Record<string, boolean> | null): 1 | 2 =>
  owned?.[SAFE_LEVEL2_ID] ? 2 : 1;

/** Cifra più alta della combinazione: 4 al livello 1 (64 combinazioni), 5 al livello 2 (125). */
export const maxPinDigit = (level: number): number => (level >= 2 ? 5 : 4);

/** La combinazione ha 3 cifre, ciascuna da 1 alla cifra più alta del livello. */
export const isValidPin = (code: string, level: number): boolean =>
  new RegExp(`^[1-${maxPinDigit(level)}]{3}$`).test(code);

/** Spiegazione per chi la sceglie o la prova. */
export const pinHint = (level: number): string =>
  `3 cifre da 1 a ${maxPinDigit(level)} (es. ${level >= 2 ? '152' : '134'})`;

/**
 * La combinazione cifrata usa una cifra che il livello non permette (un 5 su una cassaforte di
 * livello 1)? Si riconosce provando le poche combinazioni possibili.
 */
export function pinTooHighForLevel(pin: unknown, roomId: unknown, level: number): boolean {
  if (typeof pin !== 'string' || !pin.startsWith('h')) return false;
  for (let a = 1; a <= 5; a++)
    for (let b = 1; b <= 5; b++)
      for (let c = 1; c <= 5; c++) {
        const code = `${a}${b}${c}`;
        if (!isValidPin(code, level) && hashPin(code, roomId) === pin) return true;
      }
  return false;
}
