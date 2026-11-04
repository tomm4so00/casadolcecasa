// Cosa dicono i commessi dei negozi: le loro frasi, tranne quando il negozio di oggetti da
// collezione ha venduto tutto.
import { SHOP_CLERK_LINES } from './data/catalogues.js';
import { collectState } from './collect.js';
import { soldOut } from './collect-rules.js';

export const SOLD_OUT_LINE =
  "Gli oggetti sono stati tutti già comprati... Aspetto che ne arrivino di nuovi. Puoi provare a comprare oggetti da collezione al negozio dell'usato.";

/** Tutti i pezzi da collezione hanno già un proprietario. */
export function collectSoldOut(): boolean {
  return soldOut(collectState());
}

/** Le frasi del commesso del negozio `env`. */
export function clerkLines(env: string): string[] {
  if (env === 'collezionismo' && collectSoldOut()) return [SOLD_OUT_LINE];
  return SHOP_CLERK_LINES[env] || [];
}
