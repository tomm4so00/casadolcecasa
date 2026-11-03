// Rivendita di vestiti e mobili: si riprende il prezzo pagato meno il 15%
// (senza dipendenze dal browser, così è testabile).

/** Quanto si riprende rivendendo: l'85% del prezzo (cioè il 15% in meno). */
export const RESALE_RATE = 0.85;

/** Soldi che si ricevono rivendendo un oggetto pagato `price` euro (arrotondati per difetto). */
export function resaleValue(price: number): number {
  if (!Number.isFinite(price) || price <= 0) return 0;
  return Math.floor(price * RESALE_RATE);
}
