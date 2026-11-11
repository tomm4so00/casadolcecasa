// Un solo registro per acquisti, consumi e scambi di tutti gli oggetti impilabili.
import type { GameDatabase } from './database.js';
import type { RoomState } from './models.js';
import {
  expireOffer,
  releaseOffer,
  reserveOffer,
  stockOf,
  ownedStock,
  INVENTORY_MAX_STACK,
  TRADE_TTL_MS,
  type InventoryOffer,
  type StockInventory,
  type TradeItem,
} from './inventory-trade-rules.js';

type Rooms = Record<string, RoomState>;

export class InventoryLedger {
  private pending: Promise<unknown> = Promise.resolve();
  private operations = 0;
  constructor(
    private db: GameDatabase,
    private path: string,
    private index: number,
    private player: string,
    private seed: () => StockInventory,
    private confirmed: (room: RoomState) => void,
    private active: () => boolean = () => true,
    private now: () => number = Date.now,
  ) {}

  private update(
    change: (rooms: Rooms, mine: RoomState, stock: StockInventory) => boolean,
    expireMine = true,
  ): Promise<boolean> {
    this.operations++;
    const task = this.pending.then(async () => {
      if (!this.active()) return false;
      const ref = this.db.ref(this.path);
      await ref.get();
      const seed = structuredClone(this.seed());
      const result = await ref.transaction((current: Rooms | null) => {
        if (!this.active()) return undefined;
        if (current === null) return null;
        const mine = current[this.index];
        if (!mine || mine.ownerId !== this.player) return undefined;
        const rooms = structuredClone(current);
        const room = rooms[this.index];
        const base = room.inventory ?? structuredClone(seed);
        const stock = expireMine ? expireOffer(base, this.now()) : base;
        room.inventory = stock;
        return change(rooms, room, stock) ? rooms : undefined;
      });
      const room: RoomState | undefined = result.snapshot.val()?.[this.index];
      if (!result.committed || room?.ownerId !== this.player) return false;
      if (this.active()) this.confirmed(room);
      return true;
    });
    const settled = task.finally(() => this.operations--);
    this.pending = settled.catch(() => {});
    return settled;
  }

  isPending(): boolean {
    return this.operations > 0;
  }
  settled(): Promise<unknown> {
    return this.pending;
  }
  initialize(): Promise<boolean> {
    return this.update(() => true);
  }

  /** Multa e sequestro sono confermati dallo stesso registro dello zaino. */
  policeResolution(fine: number | null, onSeized?: (grams: number) => void): Promise<boolean> {
    let grams = 0;
    return this.update((_rooms, room, stock) => {
      if (fine !== null) {
        if (!Number.isSafeInteger(fine) || fine < 0 || room.vaultMoney < fine) return false;
        room.vaultMoney -= fine;
      } else {
        const released = releaseOffer(stock, 'cancelled');
        grams = stockOf(released, 'weed');
        stock.items = { weed: 0, drug: 0 };
        if (released.offer) stock.offer = released.offer;
      }
      return true;
    }).then((ok) => {
      if (ok && fine === null) onSeized?.(grams);
      return ok;
    });
  }

  /** Il costo viene sottratto insieme all'aggiunta nello zaino. */
  buy(item: TradeItem, quantity: number, price: number): Promise<boolean> {
    return this.update((_rooms, room, stock) => {
      if (
        !Number.isSafeInteger(quantity) ||
        quantity < 1 ||
        !Number.isSafeInteger(price) ||
        price < 0 ||
        room.vaultMoney < price
      )
        return false;
      const count = stockOf(stock, item) + quantity;
      if (ownedStock(stock, item) + quantity > INVENTORY_MAX_STACK) return false;
      stock.items[item] = count;
      room.vaultMoney -= price;
      return true;
    });
  }

  consume(item: TradeItem): Promise<boolean> {
    return this.update((_rooms, _room, stock) => {
      if (stockOf(stock, item) < 1) return false;
      stock.items[item] = stockOf(stock, item) - 1;
      return true;
    });
  }

  harvest(quantity: number, plantedAt: number): Promise<boolean> {
    return this.update((_rooms, _room, stock) => {
      if (stock.harvestedAt === plantedAt) return true;
      if (
        !Number.isSafeInteger(quantity) ||
        quantity < 1 ||
        ownedStock(stock, 'weed') + quantity > INVENTORY_MAX_STACK
      )
        return false;
      stock.items.weed = stockOf(stock, 'weed') + quantity;
      stock.harvestedAt = plantedAt;
      return true;
    });
  }

  offer(
    buyer: string,
    item: TradeItem,
    quantity: number,
    price: number,
    id: string,
  ): Promise<boolean> {
    return this.update((rooms, room, stock) => {
      const key = Object.keys(rooms).find((k) => rooms[k].ownerId === buyer);
      if (!key || buyer === this.player) return false;
      const offer: InventoryOffer = {
        id,
        item,
        quantity,
        price,
        buyer,
        buyerRoom: Number(key),
        expiresAt: this.now() + TRADE_TTL_MS,
        status: 'pending',
      };
      const next = reserveOffer(stock, offer, this.now());
      if (!next) return false;
      room.inventory = next;
      return true;
    });
  }

  cancel(id: string): Promise<boolean> {
    return this.update((_rooms, room, stock) => {
      if (stock.offer?.id !== id || stock.offer.status !== 'pending') return false;
      room.inventory = releaseOffer(stock, 'cancelled');
      return true;
    });
  }

  answer(sellerIndex: number, sellerId: string, id: string, accept: boolean): Promise<boolean> {
    return this.update((rooms, buyer, stock) => {
      const seller = rooms[sellerIndex];
      const source = seller?.inventory;
      const offer = source?.offer;
      if (
        sellerIndex === this.index ||
        seller?.ownerId !== sellerId ||
        !source ||
        !offer ||
        offer.id !== id ||
        offer.buyer !== this.player ||
        offer.buyerRoom !== this.index ||
        offer.status !== 'pending' ||
        offer.expiresAt <= this.now()
      )
        return false;
      if (!accept) {
        seller.inventory = releaseOffer(source, 'refused');
        return true;
      }
      if (
        buyer.vaultMoney < offer.price ||
        !Number.isSafeInteger(seller.vaultMoney + offer.price) ||
        ownedStock(stock, offer.item) + offer.quantity > INVENTORY_MAX_STACK
      )
        return false;
      buyer.vaultMoney -= offer.price;
      seller.vaultMoney += offer.price;
      stock.items[offer.item] = stockOf(stock, offer.item) + offer.quantity;
      source.offer = { ...offer, status: 'accepted' };
      return true;
    }, false);
  }
}
