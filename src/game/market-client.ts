import { game } from './context.js';
import { updateMarketEvent } from './market-event.js';
import { lifetime } from './runtime.js';
import {
  advanceMarket,
  decodeMarket,
  legacyNoise,
  MARKET_MAX_AGE_MS,
  type MarketSnapshot,
} from '../../shared/market.js';

let snapshot: MarketSnapshot | null = null;
let connected = false;
export function marketSnapshot(): MarketSnapshot | null {
  return snapshot;
}
export function canTradeMarket(): boolean {
  const age = Date.now() + game.session.serverOffset - (snapshot?.updatedAt ?? 0);
  return connected && snapshot !== null && age >= -60000 && age <= MARKET_MAX_AGE_MS;
}
export function startMarket() {
  snapshot = null;
  connected = game.session.OFFLINE;
  if (game.session.OFFLINE) {
    // A separate simulation for local tests only. Online clients never generate quotes.
    const step = () => {
      snapshot =
        advanceMarket(
          snapshot,
          Date.now(),
          () => legacyNoise(9001, Math.floor(Date.now() / 60000)),
          { roll: Math.random(), kind: Math.random() },
        ) ?? snapshot;
      updateMarketEvent(snapshot);
    };
    step();
    lifetime.setInterval(step, 60000);
    return;
  }
  game.session.db.ref('.info/connected').on('value', (value) => {
    connected = value.val() === true;
  });
  game.session.db.ref('.info/serverTimeOffset').on('value', (value) => {
    game.session.serverOffset = Number(value.val()) || 0;
  });
  game.session.db.ref('sims_market').on('value', (value) => {
    snapshot = decodeMarket(value.val());
    updateMarketEvent(snapshot);
  });
  // il ticker sparisce da solo quando finisce l'ora anche se non arrivano nuove quotazioni
  lifetime.setInterval(() => updateMarketEvent(snapshot), 15000);
}
