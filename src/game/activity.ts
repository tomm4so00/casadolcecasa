// Attività del giocatore che muovono la borsa (le regole sono in shared/activity.ts): ogni volta
// che fa qualcosa legato a un'attività quotata, il suo contatore di oggi sale di uno.
import type { GameValue } from './context.js';
import { game } from './context.js';
import { ACTIVITY_CAP, dayOf } from '../../shared/activity.js';
import type { BusinessId } from '../../shared/market.js';

/** Contatori già al massimo oggi: inutile scrivere ancora nel database. */
const full = new Set<string>();

const serverNow = (): number => Date.now() + (game.session.serverOffset || 0);

/** Il giocatore ha fatto qualcosa legato all'attività `business` (turno, acquisto, partita…). */
export function recordActivity(business: BusinessId): void {
  const me = game.session.myPlayerId;
  if (!me || !game.session.db) return;
  const now = serverNow();
  const day = dayOf(now);
  const key = `${day}/${business}`;
  if (full.has(key)) return;
  game.session.db
    .ref(`sims_activity/${key}/${me}`)
    .transaction((cur: GameValue) => {
      const n = Number(cur?.n) || 0;
      if (n >= ACTIVITY_CAP) {
        full.add(key);
        return undefined; // oltre il massimo non conta più: niente da scrivere
      }
      return { n: n + 1, t: serverNow() };
    })
    .catch((error: unknown) => console.warn('[attività]', error));
}
