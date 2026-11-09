// Un solo modulo di scambio per qualunque oggetto impilabile dello zaino.
import { game } from './context.js';
import { requireAccount } from './guest.js';
import { dom } from './runtime.js';
import { toast } from './missions.js';
import { inventoryItems } from './inventory-rules.js';
import { initializeInventory, inventoryChange, sendInventoryOffer } from './inventory-market.js';
import { isTradeItem, tradeError, TRADE_ITEMS, TRADE_MAX_PRICE } from './inventory-trade-rules.js';

let submitting = false;
const nearby = (): { id: string; name: string }[] =>
  game.socBusy() ? [] : [...game.frameNear].filter((p) => p.id !== game.session.myPlayerId);

export function closeInventoryTrade(): void {
  dom('inventory-trade-modal').classList.add('hidden');
  dom('btn-inventory').focus();
}

export async function openInventoryTrade(item = '', targetId = ''): Promise<void> {
  if (!(await requireAccount('scambiare oggetti con gli altri'))) return;
  if (game.socBusy()) {
    toast('Finisci prima quello che stai facendo.');
    return;
  }
  dom('inventory-modal').classList.add('hidden');
  if (!(await initializeInventory())) return;
  const items = inventoryItems(game.player).filter((entry) => isTradeItem(entry.id));
  const selector = dom('trade-item') as HTMLSelectElement;
  selector.replaceChildren();
  for (const entry of items) {
    const option = new Option(
      `${entry.icon} ${entry.name} · ${entry.quantity} ${entry.unit} disponibili`,
      entry.id,
    );
    selector.add(option);
  }
  if (items.some((entry) => entry.id === item)) selector.value = item;
  const recipients = dom('trade-recipient') as HTMLSelectElement;
  recipients.replaceChildren();
  for (const player of nearby()) recipients.add(new Option(player.name, player.id));
  if (nearby().some((player) => player.id === targetId)) recipients.value = targetId;
  dom('trade-quantity').value = '1';
  dom('trade-price').value = '0';
  for (const id of ['trade-item', 'trade-recipient', 'trade-quantity', 'trade-price'])
    dom(id).oninput = updateInventoryTrade;
  const modal = dom('inventory-trade-modal') as HTMLElement;
  modal.onkeydown = (event) => {
    event.stopPropagation();
    if (event.key === 'Escape' && !submitting) closeInventoryTrade();
  };
  modal.classList.remove('hidden');
  updateInventoryTrade();
  dom('trade-close').focus();
}

export function updateInventoryTrade(): void {
  if (dom('inventory-trade-modal').classList.contains('hidden')) return;
  const offer = game.roomsState[game.myAssignedRoomIdx ?? -1]?.inventory?.offer;
  const pending = offer?.status === 'pending' && offer.expiresAt > Date.now();
  dom('trade-form').classList.toggle('hidden', pending);
  dom('trade-pending').classList.toggle('hidden', !pending);
  if (pending) {
    const item = TRADE_ITEMS[offer.item as keyof typeof TRADE_ITEMS];
    const text = `${offer.quantity} ${item.unit} di ${item.name.toLowerCase()} per ${offer.price} Đ. Gli oggetti sono riservati fino alla risposta. Scadenza tra ${Math.ceil((offer.expiresAt - Date.now()) / 1000)} s.`;
    if (dom('trade-pending-text').textContent !== text)
      dom('trade-pending-text').textContent = text;
  }
  const item = String(dom('trade-item').value);
  const available = inventoryItems(game.player).find((entry) => entry.id === item)?.quantity ?? 0;
  const quantity = Number(dom('trade-quantity').value),
    price = Number(dom('trade-price').value);
  const player = nearby().find((p) => p.id === dom('trade-recipient').value);
  const error = !isTradeItem(item)
    ? 'Non hai oggetti da scambiare.'
    : !player
      ? 'Avvicinati a un giocatore per scambiare.'
      : !String(dom('trade-quantity').value).trim() || !String(dom('trade-price').value).trim()
        ? 'Inserisci quantità e prezzo totale.'
        : tradeError(quantity, price, available);
  dom('trade-quantity').max = String(available);
  dom('trade-price').max = String(TRADE_MAX_PRICE);
  dom('trade-send').disabled = submitting || !!error || pending;
  const summary =
    error ??
    `${quantity} ${TRADE_ITEMS[item as keyof typeof TRADE_ITEMS].unit} · Totale ${price} Đ${price === 0 ? ' (regalo)' : ` · ${(price / quantity).toLocaleString('it-IT', { maximumFractionDigits: 2 })} Đ per unità`}`;
  if (dom('trade-summary').textContent !== summary) dom('trade-summary').textContent = summary;
}

export async function submitInventoryTrade(): Promise<void> {
  if (submitting) return;
  const item = String(dom('trade-item').value),
    target = nearby().find((p) => p.id === dom('trade-recipient').value);
  if (!target || !isTradeItem(item)) {
    updateInventoryTrade();
    return;
  }
  const quantity = Number(dom('trade-quantity').value),
    price = Number(dom('trade-price').value);
  const error = tradeError(
    quantity,
    price,
    inventoryItems(game.player).find((entry) => entry.id === item)?.quantity ?? 0,
  );
  if (error) {
    toast(error);
    return;
  }
  submitting = true;
  updateInventoryTrade();
  try {
    await sendInventoryOffer(target, item, quantity, price);
  } finally {
    submitting = false;
    updateInventoryTrade();
  }
}

export async function cancelInventoryTrade(): Promise<void> {
  const offer = game.roomsState[game.myAssignedRoomIdx ?? -1]?.inventory?.offer;
  if (!offer || submitting) return;
  submitting = true;
  try {
    await inventoryChange((ledger) => ledger.cancel(offer.id));
  } finally {
    submitting = false;
    await openInventoryTrade();
  }
}
