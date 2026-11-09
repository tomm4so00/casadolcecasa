// Registro condiviso: quantità e pagamento cambiano insieme nella stessa transazione.
export const TRADE_ITEMS = {
  weed: { name: 'Erba', unit: 'g', icon: '🌿' },
  // l'oggetto resta "drug" (zaino e regole del database): ora è la pillola misteriosa
  drug: { name: 'Pillole', unit: 'pillole', icon: '💊' },
} as const;
export type TradeItem = keyof typeof TRADE_ITEMS;
export const TRADE_TTL_MS = 2 * 60_000;
export const TRADE_MAX_PRICE = 1_000_000;
export const INVENTORY_MAX_STACK = 100_000;

export interface InventoryOffer {
  id: string;
  item: TradeItem;
  quantity: number;
  price: number;
  buyer: string;
  buyerRoom: number;
  expiresAt: number;
  status: 'pending' | 'accepted' | 'refused' | 'cancelled';
}
export interface StockInventory {
  items: Partial<Record<TradeItem, number>>;
  offer?: InventoryOffer;
  /** Evita di accreditare di nuovo un raccolto dopo un ricaricamento. */
  harvestedAt?: number;
}

export const isTradeItem = (id: string): id is TradeItem => Object.hasOwn(TRADE_ITEMS, id);
export const stockOf = (inventory: StockInventory, item: TradeItem): number =>
  inventory.items[item] ?? 0;
export const ownedStock = (inventory: StockInventory, item: TradeItem): number =>
  stockOf(inventory, item) +
  (inventory.offer?.status === 'pending' && inventory.offer.item === item
    ? inventory.offer.quantity
    : 0);

export function tradeError(quantity: number, price: number, available: number): string | null {
  if (!Number.isSafeInteger(quantity) || quantity < 1 || quantity > INVENTORY_MAX_STACK)
    return 'Scegli una quantità intera maggiore di zero.';
  if (quantity > available) return 'Non hai abbastanza oggetti disponibili nello zaino.';
  if (!Number.isSafeInteger(price) || price < 0 || price > TRADE_MAX_PRICE)
    return `Il prezzo totale deve essere un intero tra 0 e ${TRADE_MAX_PRICE.toLocaleString('it-IT')} Đ.`;
  return null;
}

export function releaseOffer(
  stock: StockInventory,
  status: 'refused' | 'cancelled',
): StockInventory {
  const offer = stock.offer;
  if (!offer || offer.status !== 'pending') return stock;
  return {
    ...stock,
    items: { ...stock.items, [offer.item]: stockOf(stock, offer.item) + offer.quantity },
    offer: { ...offer, status },
  };
}

export const expireOffer = (stock: StockInventory, now: number): StockInventory =>
  stock.offer?.status === 'pending' && stock.offer.expiresAt <= now
    ? releaseOffer(stock, 'cancelled')
    : stock;

export function reserveOffer(
  stock: StockInventory,
  offer: InventoryOffer,
  now: number,
): StockInventory | null {
  stock = expireOffer(stock, now);
  if (
    stock.offer?.status === 'pending' ||
    tradeError(offer.quantity, offer.price, stockOf(stock, offer.item))
  )
    return null;
  return {
    ...stock,
    items: { ...stock.items, [offer.item]: stockOf(stock, offer.item) - offer.quantity },
    offer,
  };
}
