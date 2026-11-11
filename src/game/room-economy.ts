import type { GameDatabase } from './database.js';
import type { EconomyState, RoomState } from './models.js';
import { decodeSaveV8, isRecord } from './save-model.js';
import { bankBalanceOf } from './bank-rules.js';
import { worldNode } from './world-db.js';
import { useDebit } from '../../shared/debit-rules.js';

export function decodeEconomy(value: unknown): EconomyState | null {
  if (!isRecord(value) || value.version !== 1) return null;
  const data = decodeSaveV8({
    savedAt: 0,
    ownedItems: value.ownedItems ?? {},
    ownedFurniture: value.ownedFurniture ?? {},
    invest: value.invest ?? {},
  });
  if (!data) return null;
  if (value.bank !== undefined && bankBalanceOf(value.bank) !== value.bank) return null;
  return {
    version: 1,
    ownedItems: data.ownedItems!,
    ownedFurniture: data.ownedFurniture!,
    invest: data.invest!,
    ...(value.bank !== undefined ? { bank: value.bank as number } : {}),
  };
}

/** Money, purchases and investments are committed together in the owner's room. */
export class RoomEconomy {
  private pending: Promise<unknown> = Promise.resolve();
  private operations = 0;
  constructor(
    private database: GameDatabase,
    private roomIndex: number,
    private playerId: string,
    private seed: () => EconomyState,
    private confirmed: (room: RoomState) => void,
    private active: () => boolean = () => true,
  ) {}

  update(change: (economy: EconomyState, balance: number) => number | null): Promise<boolean> {
    this.operations++;
    const operation = this.pending.then(async () => {
      if (!this.active()) return false;
      // Read before a transaction: Firebase may first call its updater with an empty local cache.
      const reference = this.database.ref(`${worldNode('rooms_state')}/${this.roomIndex}`);
      await reference.get();
      const seed = structuredClone(this.seed());
      const result = await reference.transaction((current: RoomState | null) => {
        if (!this.active()) return undefined;
        // Senza nessuno in ascolto sulle stanze (appena entrati) la get() non resta in cache e il
        // primo giro vede null: restituendo null il server risponde con la stanza vera e si
        // rifà il conto. Con undefined la transazione finirebbe qui, senza versare niente.
        if (current === null) return null;
        if (current.ownerId !== this.playerId) return undefined;
        const balance = current.vaultMoney;
        if (!Number.isSafeInteger(balance) || balance < 0) return undefined;
        // Realtime Database omits empty objects; missing maps mean empty, not the old seed.
        const economy = current.economy ? decodeEconomy(current.economy) : seed;
        if (!economy || !decodeSaveV8({ ...economy, savedAt: 0 })) return undefined;
        const draft = structuredClone(economy);
        const delta = change(draft, balance);
        if (
          delta === null ||
          !Number.isSafeInteger(delta) ||
          !Number.isSafeInteger(balance + delta) ||
          balance + delta < 0
        )
          return undefined;
        return { ...current, vaultMoney: balance + delta, economy: draft };
      });
      // stanza davvero vuota sul server: si è scritto null su null, niente soldi mossi
      const room = result.snapshot.val() as RoomState | null;
      if (!result.committed || room?.ownerId !== this.playerId) return false;
      if (this.active()) this.confirmed(room);
      return true;
    });
    const settled = operation.finally(() => {
      this.operations--;
    });
    this.pending = settled.catch(() => {});
    return settled;
  }

  settled(): Promise<unknown> {
    return this.pending;
  }
  /** Dalla mia cassaforte a quella di un altro giocatore. */
  transfer(targetPlayerId: string, amount: number): Promise<boolean> {
    return this.move(targetPlayerId, amount, 1);
  }
  /**
   * Dalla cassaforte di un altro giocatore alla mia, se ci sono abbastanza soldi: l'offerta che
   * ha fatto e che io ho accettato (vedi collect-offers.ts).
   */
  collect(fromPlayerId: string, amount: number): Promise<boolean> {
    return this.move(fromPlayerId, amount, -1);
  }
  /** Sposta `amount` fra le due cassaforti nella stessa transazione: 1 = do io, −1 = ricevo io. */
  private move(otherPlayerId: string, amount: number, way: 1 | -1): Promise<boolean> {
    this.operations++;
    const operation = this.pending.then(async () => {
      if (
        !this.active() ||
        !Number.isSafeInteger(amount) ||
        amount < 1 ||
        otherPlayerId === this.playerId
      )
        return false;
      const reference = this.database.ref(worldNode('rooms_state'));
      await reference.get();
      const result = await reference.transaction((rooms: Record<string, RoomState> | null) => {
        if (!this.active() || !rooms) return undefined;
        const mine = rooms[this.roomIndex];
        const otherKey = Object.keys(rooms).find((key) => rooms[key]?.ownerId === otherPlayerId);
        const other = otherKey === undefined ? undefined : rooms[otherKey];
        const payer = way === 1 ? mine : other;
        const payee = way === 1 ? other : mine;
        if (
          !mine ||
          mine.ownerId !== this.playerId ||
          !other ||
          !payer ||
          !payee ||
          !Number.isSafeInteger(payer.vaultMoney) ||
          payer.vaultMoney < amount ||
          !Number.isSafeInteger(payee.vaultMoney) ||
          !Number.isSafeInteger(payee.vaultMoney + amount)
        )
          return undefined;
        let next: RoomState = { ...other, vaultMoney: other.vaultMoney + way * amount };
        // prendo dalla sua cassaforte: serve il suo permesso di addebito, che si consuma qui,
        // nella stessa scrittura (le regole controllano che il resto torni)
        if (way === -1) {
          const left = useDebit(other.allow?.[this.playerId], amount, Date.now());
          if (left === false) return undefined;
          const allow = { ...(other.allow || {}) };
          if (left) allow[this.playerId] = left;
          else delete allow[this.playerId];
          next = { ...next, allow };
          // finito l'ultimo permesso, niente nodo vuoto (Firebase lo toglierebbe da solo)
          if (!Object.keys(allow).length) delete next.allow;
        }
        return {
          ...rooms,
          [this.roomIndex]: { ...mine, vaultMoney: mine.vaultMoney - way * amount },
          [otherKey!]: next,
        };
      });
      if (!result.committed) return false;
      if (this.active()) this.confirmed(result.snapshot.val()[this.roomIndex] as RoomState);
      return true;
    });
    const settled = operation.finally(() => {
      this.operations--;
    });
    this.pending = settled.catch(() => {});
    return settled;
  }
  isPending(): boolean {
    return this.operations > 0;
  }
}
