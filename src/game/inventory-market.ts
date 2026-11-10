// Collegamento del registro condiviso al personaggio e alle offerte fra giocatori.
import { game } from './context.js';
import { dom, lifetime } from './runtime.js';
import { canPlaySession } from './accounts.js';
import { worldNode } from './world-db.js';
import { flushEconomy } from './economy.js';
import { hasRoom, saveGame, syncVaultFromServer } from './saves.js';
import { toast } from './missions.js';
import { openDialog } from './interface.js';
import { sendSocial } from './social.js';
import { InventoryLedger } from './inventory-ledger.js';
import { recordActivity } from './activity.js';
import { dropInTrash } from './trash.js';
import { dayOf } from '../../shared/activity.js';
import { TRADE_ITEMS, type TradeItem, type StockInventory } from './inventory-trade-rules.js';
import type { RoomState } from './models.js';

let market: InventoryLedger | null = null;
let marketKey = '';
let scope = lifetime;
let nextCheck = 0;
let lastOffer = '';

function applyInventory(room: RoomState): void {
  if (!room.inventory) return;
  game.player.drugStock = room.inventory.items.drug ?? 0;
  game.player.weed = {
    ...(game.player.weed ?? { grams: 0 }),
    grams: room.inventory.items.weed ?? 0,
  };
}

export function syncInventoryFromRoom(room: RoomState): void {
  if (!room.inventory || market?.isPending()) return;
  applyInventory(room);
  const offer = room.inventory.offer;
  const key = offer ? `${offer.id}:${offer.status}` : '';
  if (offer && lastOffer === `${offer.id}:pending` && offer.status !== 'pending') {
    // una vendita lascia la bustina vuota nel cestino (i regali no)
    if (offer.status === 'accepted' && offer.price > 0) dropInTrash('bag');
    toast(
      offer.status === 'accepted'
        ? `🤝 Scambio concluso: ${offer.quantity} ${TRADE_ITEMS[offer.item].unit} · +${offer.price} Đ.`
        : '🎒 Offerta chiusa: gli oggetti sono tornati nello zaino.',
      4500,
    );
  }
  lastOffer = key;
}

export function getInventoryLedger(): InventoryLedger | null {
  if (!hasRoom()) return null;
  const world = game.session.worldId,
    player = game.session.myPlayerId,
    index = game.myAssignedRoomIdx!;
  const key = `${world}/${player}/${index}`;
  if (!market || key !== marketKey || scope !== lifetime) {
    scope = lifetime;
    const ownerScope = scope;
    marketKey = key;
    lastOffer = '';
    market = new InventoryLedger(
      game.session.db,
      worldNode('rooms_state'),
      index,
      player,
      (): StockInventory => ({
        items: { weed: game.player.weed?.grams ?? 0, drug: game.player.drugStock },
      }),
      (room) => {
        applyInventory(room);
        lastOffer = room.inventory?.offer
          ? `${room.inventory.offer.id}:${room.inventory.offer.status}`
          : '';
        game.roomsState[index] = room;
        syncVaultFromServer();
      },
      () =>
        ownerScope.active &&
        canPlaySession() &&
        game.session.worldId === world &&
        game.myAssignedRoomIdx === index &&
        !game.player.isDead,
    );
  }
  return market;
}

export async function inventoryChange(
  action: (ledger: InventoryLedger) => Promise<boolean>,
): Promise<boolean> {
  const ledger = getInventoryLedger();
  if (!ledger) {
    toast('Serve una stanza per usare lo zaino.');
    return false;
  }
  try {
    await flushEconomy();
    const ok = await action(ledger);
    if (!ok) toast('Operazione non confermata: controlla scorte, saldo e offerta.', 4000);
    return ok;
  } catch (error) {
    console.warn('[zaino]', error);
    toast('Operazione non confermata. Riprova quando sei connesso.', 4000);
    return false;
  }
}

/** Migra le vecchie scorte una sola volta: il registro poi prevale sui salvataggi locali. */
export async function initializeInventory(): Promise<boolean> {
  const room = game.roomsState[game.myAssignedRoomIdx ?? -1];
  if (room?.inventory) {
    syncInventoryFromRoom(room);
    return true;
  }
  return inventoryChange((ledger) => ledger.initialize());
}

export function tickInventoryMarket(): void {
  if (!game.session.saveReady || !hasRoom() || Date.now() < nextCheck) return;
  nextCheck = Date.now() + 1000;
  const offer = game.roomsState[game.myAssignedRoomIdx!]?.inventory?.offer;
  if (offer?.status === 'pending' && offer.expiresAt <= Date.now() && !market?.isPending())
    void inventoryChange((ledger) => ledger.initialize());
}

/** Prima di portare la stanza in un altro mondo si liberano gli oggetti in attesa. */
export async function settleInventoryTrades(): Promise<void> {
  await market?.settled();
  const offer = game.roomsState[game.myAssignedRoomIdx ?? -1]?.inventory?.offer;
  if (offer?.status === 'pending' && !(await inventoryChange((ledger) => ledger.cancel(offer.id))))
    throw new Error('Annulla prima lo scambio in attesa dallo zaino.');
}

export async function sendInventoryOffer(
  target: { id: string; name: string },
  item: TradeItem,
  quantity: number,
  price: number,
): Promise<boolean> {
  const id = Date.now().toString(36) + Math.random().toString(36).slice(2, 10);
  if (!(await inventoryChange((ledger) => ledger.offer(target.id, item, quantity, price, id))))
    return false;
  await saveGame(true);
  try {
    await sendSocial(target.id, {
      type: 'inventoryOffer',
      offerId: id,
      room: game.myAssignedRoomIdx,
    });
  } catch {
    await inventoryChange((ledger) => ledger.cancel(id));
    toast('Invio non riuscito: gli oggetti restano nello zaino.', 4000);
    return false;
  }
  toast(
    `🤝 Offerta inviata a ${target.name}: ${quantity} ${TRADE_ITEMS[item].unit} per ${price} Đ. Scade tra 2 minuti.`,
    5000,
  );
  return true;
}

/**
 * Uno scambio d'erba accettato è domanda e dice a quanto si vende l'erba in giro: lo scrive chi
 * compra, per il mercato calcolato dal server (weed-market-rules.ts).
 */
function noteWeedTrade(
  offer: { id: string; quantity: number; price: number },
  seller: string,
): void {
  recordActivity('canapa');
  const now = Date.now() + (game.session.serverOffset || 0);
  void game.session.db
    .ref(`sims_weed_trades/${dayOf(now)}/${offer.id}`)
    .set({ g: offer.quantity, price: offer.price, seller, buyer: game.session.myPlayerId, t: now })
    .catch((error: unknown) => console.warn('[mercato erba]', error));
}

export async function onInventoryOffer(
  message: { from: string; offerId: string; room: number },
  who: string,
): Promise<void> {
  const receivingScope = lifetime,
    world = game.session.worldId;
  if (
    !Number.isInteger(message.room) ||
    message.room < 0 ||
    message.room >= game.TOTAL_ROOMS ||
    typeof message.offerId !== 'string'
  )
    return;
  while (
    receivingScope.active &&
    game.session.worldId === world &&
    (game.dialogResolve || document.querySelector('.fullscreen-modal:not(.hidden)'))
  )
    await new Promise((resolve) => lifetime.setTimeout(resolve, 500));
  if (!receivingScope.active || game.session.worldId !== world || game.player.isDead) return;
  if (!(await inventoryChange((ledger) => ledger.initialize()))) return;
  const snap = await game.session.db.ref(`${worldNode('rooms_state')}/${message.room}`).get();
  const room = snap.val() as RoomState | null;
  const offer = room?.inventory?.offer;
  if (
    room?.ownerId !== message.from ||
    offer?.id !== message.offerId ||
    offer.buyer !== game.session.myPlayerId ||
    offer.status !== 'pending' ||
    offer.expiresAt <= Date.now()
  )
    return;
  const item = TRADE_ITEMS[offer.item];
  const answer = await openDialog({
    title: '🤝 Proposta di scambio',
    text: `${who} ti offre ${offer.quantity} ${item.unit} di ${item.name.toLowerCase()}.\nPrezzo totale: ${offer.price} Đ${offer.price === 0 ? ' (regalo)' : ''}.\nGli oggetti finiranno nello zaino.\n\nScade tra ${Math.max(1, Math.ceil((offer.expiresAt - Date.now()) / 1000))} secondi.`,
    buttons: [
      { label: 'Rifiuta', value: 'no', color: '#57606f' },
      {
        label: offer.price ? `Accetta (${offer.price} Đ)` : 'Accetta regalo',
        value: 'yes',
        color: '#2ed573',
      },
    ],
  });
  const accepted = answer.action === 'yes';
  if (!receivingScope.active || game.session.worldId !== world) return;
  const ok = await inventoryChange((ledger) =>
    ledger.answer(message.room, message.from, offer.id, accepted),
  );
  if (ok) {
    if (accepted && offer.item === 'weed') noteWeedTrade(offer, message.from);
    await saveGame(true);
    toast(
      accepted ? `🎒 Ricevuti ${offer.quantity} ${item.unit} nello zaino.` : 'Offerta rifiutata.',
      4000,
    );
  } else if (accepted) {
    // Saldo insufficiente o scadenza: nessun pagamento; si libera anche la prenotazione.
    await inventoryChange((ledger) => ledger.answer(message.room, message.from, offer.id, false));
  }
  dom('btn-inventory')?.focus();
}
