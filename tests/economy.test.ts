import { describe, it, expect } from 'vitest';
import { localDatabase } from '../src/game/database.js';
import { Lifetime } from '../src/game/lifetime.js';
import { RoomEconomy } from '../src/game/room-economy.js';
import { MemoryStorage } from './helpers.js';
import type { EconomyState } from '../src/game/models.js';

const seed = (): EconomyState => ({ version: 1, ownedItems: {}, ownedFurniture: {}, invest: {} });
async function setup() {
  const database = localDatabase(new Lifetime(), new MemoryStorage());
  await database.ref('sims_rooms_state/0').set({ id: 1, ownerId: 'player_test', vaultMoney: 100 });
  const wallet = new RoomEconomy(database, 0, 'player_test', seed, () => {});
  return { database, wallet };
}
describe('confirmed room economy', () => {
  it('commits balance and ownership together and rejects a duplicate purchase', async () => {
    const { database, wallet } = await setup();
    const buy = () =>
      wallet.update((state, balance) => {
        if (state.ownedItems.hoodie || balance < 60) return null;
        state.ownedItems.hoodie = true;
        return -60;
      });
    expect(await Promise.all([buy(), buy()])).toEqual([true, false]);
    const room = (await database.ref('sims_rooms_state/0').get()).val();
    expect(room.vaultMoney).toBe(40);
    expect(room.economy.ownedItems.hoodie).toBe(true);
  });
  it('aborts a concurrent overspend and preserves investments on reconnect', async () => {
    const { database, wallet } = await setup();
    const invest = () =>
      wallet.update((state, balance) => {
        if (balance < 80) return null;
        state.invest.shop = { units: 0.8, cost: 80 };
        return -80;
      });
    expect(await Promise.all([invest(), invest()])).toEqual([true, false]);
    const room = (await database.ref('sims_rooms_state/0').get()).val();
    expect(room.vaultMoney).toBe(20);
    expect(room.economy.invest.shop.cost).toBe(80);
  });
  it('transfers a gift atomically, without charging twice or minting money on receipt', async () => {
    const { database, wallet } = await setup();
    await database
      .ref('sims_rooms_state/1')
      .set({ id: 2, ownerId: 'player_other', vaultMoney: 50 });
    expect(await wallet.transfer('player_other', 30)).toBe(true);
    const rooms = (await database.ref('sims_rooms_state').get()).val();
    expect(rooms[0].vaultMoney).toBe(70);
    expect(rooms[1].vaultMoney).toBe(80);
    expect(await wallet.transfer('missing_player', 10)).toBe(false);
    expect(await wallet.transfer('player_other', 1000)).toBe(false);
  });
  it("incassa un'offerta accettata dalla cassaforte di chi l'ha fatta, solo col suo permesso", async () => {
    const { database, wallet } = await setup();
    await database
      .ref('sims_rooms_state/1')
      .set({ id: 2, ownerId: 'player_other', vaultMoney: 50 });
    // senza permesso di addebito non si prende niente
    expect(await wallet.collect('player_other', 30)).toBe(false);
    expect((await database.ref('sims_rooms_state/1/vaultMoney').get()).val()).toBe(50);
    // l'offerta di 40 scrive il permesso; se ne prendono 30 e ne restano 10
    await database.ref('sims_rooms_state/1/allow/player_test').set({ amt: 40, t: Date.now() });
    expect(await wallet.collect('player_other', 30)).toBe(true);
    const rooms = (await database.ref('sims_rooms_state').get()).val();
    expect(rooms[0].vaultMoney).toBe(130);
    expect(rooms[1].vaultMoney).toBe(20);
    expect(rooms[1].allow.player_test.amt).toBe(10);
    // il permesso non basta: niente si muove
    expect(await wallet.collect('player_other', 11)).toBe(false);
    expect((await database.ref('sims_rooms_state/1/vaultMoney').get()).val()).toBe(20);
    // finito il permesso, sparisce
    expect(await wallet.collect('player_other', 10)).toBe(true);
    expect((await database.ref('sims_rooms_state/1/allow').get()).val()).toBeNull();
    expect(await wallet.collect('missing_player', 1)).toBe(false);
  });
  it('does not grant goods if the database denies the operation or room ownership changed', async () => {
    const { database, wallet } = await setup();
    await database.ref('sims_rooms_state/0/ownerId').set('player_other');
    expect(
      await wallet.update((state) => {
        state.ownedItems.free = true;
        return -1;
      }),
    ).toBe(false);
    const denied = new RoomEconomy(
      {
        ref: () => {
          throw new Error('permission_denied');
        },
      },
      0,
      'player_test',
      seed,
      () => {},
    );
    await expect(denied.update(() => -1)).rejects.toThrow('permission_denied');
  });
});
