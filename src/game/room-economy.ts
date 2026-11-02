import type { GameDatabase } from './database.js';
import type { EconomyState, RoomState } from './models.js';
import { decodeSaveV8, isRecord } from './save-model.js';

export function decodeEconomy(value: unknown): EconomyState | null {
  if (!isRecord(value) || value.version !== 1) return null;
  const data = decodeSaveV8({
    savedAt: 0,
    ownedItems: value.ownedItems ?? {},
    ownedFurniture: value.ownedFurniture ?? {},
    invest: value.invest ?? {},
  });
  if (!data) return null;
  return {
    version: 1,
    ownedItems: data.ownedItems!,
    ownedFurniture: data.ownedFurniture!,
    invest: data.invest!,
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
      const reference = this.database.ref(`sims_rooms_state/${this.roomIndex}`);
      await reference.get();
      const seed = structuredClone(this.seed());
      const result = await reference.transaction((current: RoomState | null) => {
        if (!this.active() || !current || current.ownerId !== this.playerId) return undefined;
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
      if (!result.committed) return false;
      if (this.active()) this.confirmed(result.snapshot.val() as RoomState);
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
  transfer(targetPlayerId: string, amount: number): Promise<boolean> {
    this.operations++;
    const operation = this.pending.then(async () => {
      if (
        !this.active() ||
        !Number.isSafeInteger(amount) ||
        amount < 1 ||
        targetPlayerId === this.playerId
      )
        return false;
      const reference = this.database.ref('sims_rooms_state');
      await reference.get();
      const result = await reference.transaction((rooms: Record<string, RoomState> | null) => {
        if (!this.active() || !rooms) return undefined;
        const sender = rooms[this.roomIndex];
        const targetKey = Object.keys(rooms).find((key) => rooms[key]?.ownerId === targetPlayerId);
        const target = targetKey === undefined ? undefined : rooms[targetKey];
        if (
          !sender ||
          sender.ownerId !== this.playerId ||
          !target ||
          !Number.isSafeInteger(sender.vaultMoney) ||
          sender.vaultMoney < amount ||
          !Number.isSafeInteger(target.vaultMoney) ||
          !Number.isSafeInteger(target.vaultMoney + amount)
        )
          return undefined;
        return {
          ...rooms,
          [this.roomIndex]: { ...sender, vaultMoney: sender.vaultMoney - amount },
          [targetKey!]: { ...target, vaultMoney: target.vaultMoney + amount },
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
