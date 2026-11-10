// Gli spacciatori nel gioco: Il Biondo al bar (erba) e Mirko in discoteca (pillole misteriose).
// Prezzi, orari e retate vengono da dealer-rules.ts; il prezzo dell'erba dal mercato
// (weed-market-rules.ts), pubblicato dal server.
import type { GameValue } from './context.js';
import { game } from './context.js';
import { toast } from './missions.js';
import { openDialog } from './interface.js';
import { saveGame, withTimeout } from './saves.js';
import { inventoryChange } from './inventory-market.js';
import { recordActivity } from './activity.js';
import { drugLevel } from './needs.js';
import { LEGACY_WORLD } from '../../shared/worlds.js';
import {
  DEALERS,
  type DealerId,
  activeRaid,
  afterPurchase,
  dealerLine,
  dealerOffer,
  dealerOnDuty,
  streetPillPrice,
} from './dealer-rules.js';
import { type WeedMarket, bagPrice, decodeWeedMarket } from './weed-market-rules.js';
import { BAG_GRAMS } from './weed-rules.js';
import { notePersonality } from './personality.js';

const world = (): string => game.session.worldId || LEGACY_WORLD;
const hour = (): number => new Date().getHours();

/** Lo spacciatore di un ambiente (bar o discoteca). */
export function dealerOf(env: string): DealerId | null {
  for (const id of Object.keys(DEALERS) as DealerId[]) if (DEALERS[id].place === env) return id;
  return null;
}

/** C'è adesso (orario e niente polizia)? Serve anche per mostrare o no l'omino. */
export function dealerHere(env: string): boolean {
  const id = dealerOf(env);
  if (!id) return false;
  const raid = activeRaid(world(), Date.now());
  return dealerOnDuty(id, hour()) && raid?.place !== DEALERS[id].place;
}

/** Le frasi dell'omino. */
export const dealerBotLines = (env: string): string[] => {
  const id = dealerOf(env);
  return id ? DEALERS[id].lines : [];
};

let market: WeedMarket | null = null;
let marketAt = 0;
/** Il mercato dell'erba (letto al massimo una volta ogni 5 minuti). */
async function weedMarket(): Promise<WeedMarket | null> {
  if (Date.now() - marketAt < 5 * 60_000) return market;
  try {
    const snap = await withTimeout(game.session.db.ref('sims_weed_market').get(), 5000);
    market = decodeWeedMarket(snap.val());
    marketAt = Date.now();
  } catch {
    // senza rete si usa l'ultimo letto (o il prezzo normale)
  }
  return market;
}

const fromHour = (h: number) => `${String(h).padStart(2, '0')}:00`;

/** Avvicinandosi allo spacciatore del posto. */
export async function openStreetDealer(env: string): Promise<void> {
  const id = dealerOf(env);
  if (!id) return;
  const d = DEALERS[id];
  const now = Date.now();
  const raid = activeRaid(world(), now);
  if (raid?.place === d.place) {
    toast(
      '🚓 Lo spacciatore è sparito: in giro ci sono gli sbirri. Meglio non farsi vedere.',
      4500,
    );
    return;
  }
  if (!dealerOnDuty(id, hour())) {
    toast(`🕴️ ${d.name} non c'è: passa tra le ${fromHour(d.from)} e le ${fromHour(d.to)}.`, 4000);
    return;
  }
  const pill = d.sells === 'pill';
  const base = pill ? streetPillPrice(world(), now) : bagPrice(await weedMarket());
  const offer = dealerOffer(
    id,
    world(),
    now,
    hour(),
    base,
    pill ? drugLevel() : 0,
    game.player.dealers,
  );
  const what = pill
    ? 'una pillola misteriosa: nessuno sa cosa c’è dentro. Di sicuro crea dipendenza.'
    : `una bustina da ${BAG_GRAMS} g d’erba. Il prezzo segue il mercato: quando tutti comprano sale, quando tanti raccolgono scende.`;
  const stock = pill
    ? game.player.drugStock
      ? `\nNello zaino hai ${game.player.drugStock} pillole.`
      : ''
    : game.player.weed?.grams
      ? `\nNello zaino hai ${game.player.weed.grams} g.`
      : '';
  const res: GameValue = await openDialog({
    title: `🕴️ ${d.name}`,
    text:
      `«${dealerLine(id, offer, now)}»\n\n` +
      `Ti offre ${what}\nPrezzo: ${offer.price} Đ` +
      (offer.raid ? ' (raddoppiato: c’è una retata nell’altro locale)' : '') +
      '.' +
      stock,
    buttons: [
      { label: 'Vai via', value: null, color: '#57606f' },
      { label: `Compra (${offer.price} Đ)`, value: 'buy', color: pill ? '#6c5ce7' : '#2e7d32' },
    ],
  });
  if (res.action !== 'buy') return;
  if (game.moneyLevel < offer.price) {
    toast(`Non hai abbastanza soldi: servono ${offer.price} Đ in cassaforte.`);
    return;
  }
  const item = pill ? 'drug' : 'weed';
  const qty = pill ? 1 : BAG_GRAMS;
  if (!(await inventoryChange((ledger) => ledger.buy(item, qty, offer.price)))) return;
  game.player.dealers = afterPurchase(game.player.dealers, id, Date.now());
  notePersonality('buyDrugs', offer.price);
  // l'erba comprata è domanda: muove il prezzo e la Canapa Verde in borsa
  if (!pill) recordActivity('canapa');
  await saveGame(true);
  toast(
    pill
      ? `💊 Hai comprato una pillola misteriosa: la trovi nello zaino (${game.player.drugStock}).`
      : `🌿 Hai comprato ${BAG_GRAMS} g d’erba: nello zaino ora ne hai ${game.player.weed?.grams ?? 0} g.`,
    4500,
  );
}
