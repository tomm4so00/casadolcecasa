import { describe, expect, it } from 'vitest';
import { localDatabase } from '../src/game/database.js';
import { Lifetime } from '../src/game/lifetime.js';
import { RoomEconomy, decodeEconomy } from '../src/game/room-economy.js';
import {
  depositChange,
  depositError,
  maxDeposit,
  withdrawChange,
  withdrawError,
} from '../src/game/bank-rules.js';
import { MemoryStorage } from './helpers.js';
import type { EconomyState } from '../src/game/models.js';

const seed = (): EconomyState => ({ version: 1, ownedItems: {}, ownedFurniture: {}, invest: {} });
async function setup(vaultMoney: number) {
  const database = localDatabase(new Lifetime(), new MemoryStorage());
  await database.ref('sims_rooms_state/0').set({ id: 1, ownerId: 'player_test', vaultMoney });
  const wallet = new RoomEconomy(database, 0, 'player_test', seed, () => {});
  const room = async () => (await database.ref('sims_rooms_state/0').get()).val();
  return { wallet, room };
}

describe('regole della banca', () => {
  it('deposito minimo 1000 € e almeno 1000 € lasciati in cassaforte', () => {
    expect(depositError(999, 5000)).toContain('minimo');
    expect(depositError(1000, 1999)).toContain('almeno 1000');
    expect(depositError(1000, 2000)).toBeNull();
    expect(depositError(4000, 5000)).toBeNull();
    expect(depositError(4001, 5000)).toContain('massimo 4000');
    expect(depositError(1000.5, 5000)).toContain('valido');
    expect(maxDeposit(1999)).toBe(0);
    expect(maxDeposit(2000)).toBe(1000);
  });
  it('non si preleva più di quanto c’è sul conto', () => {
    expect(withdrawError(10, 0)).toContain('solo 0');
    expect(withdrawError(500, 500)).toBeNull();
    expect(withdrawError(0, 500)).toContain('valido');
  });
});

describe('conto in banca nella stanza', () => {
  it('sposta i soldi fra cassaforte e conto in un’unica transazione', async () => {
    const { wallet, room } = await setup(5000);
    expect(await wallet.update(depositChange(3000))).toBe(true);
    expect((await room()).vaultMoney).toBe(2000);
    expect((await room()).economy.bank).toBe(3000);
    expect(await wallet.update(withdrawChange(500))).toBe(true);
    expect((await room()).vaultMoney).toBe(2500);
    expect((await room()).economy.bank).toBe(2500);
  });
  it('rifiuta i depositi che lascerebbero meno di 1000 € in cassaforte', async () => {
    const { wallet, room } = await setup(2500);
    expect(await wallet.update(depositChange(1600))).toBe(false);
    expect(
      await Promise.all([wallet.update(depositChange(1000)), wallet.update(depositChange(1000))]),
    ).toEqual([true, false]);
    expect((await room()).vaultMoney).toBe(1500);
    expect((await room()).economy.bank).toBe(1000);
  });
  it('ignora un saldo del conto non valido', () => {
    expect(decodeEconomy({ ...seed(), bank: -5 })).toBeNull();
    expect(decodeEconomy({ ...seed(), bank: 1200 })?.bank).toBe(1200);
    expect(decodeEconomy(seed())?.bank).toBeUndefined();
  });
});
