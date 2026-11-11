// Età e condizioni, senza browser: quando chiedere la conferma (terms.ts).

/** L'età minima per giocare (condizioni.html, sezione "Età minima"). Fino alla 0.30 era 14. */
export const MIN_AGE = 18;

/** Cosa chiedere all'ingresso: niente, la prima conferma, o di nuovo per i 18 anni. */
export type TermsAsk = 'none' | 'first' | 'adult';

/**
 * `termsAt` è la conferma di sempre (almeno 14 anni fino alla 0.30), `adultAt` quella dei 18.
 * Chi aveva confermato solo i 14 anni conferma una volta di nuovo.
 */
export function termsToAsk(termsAt: number | undefined, adultAt: number | undefined): TermsAsk {
  if (adultAt) return 'none';
  return termsAt ? 'adult' : 'first';
}
