import { describe, expect, it } from 'vitest';
import { maintainGame } from '../server/src/maintenance.js';
import { localDatabase } from '../src/game/database.js';
import { Lifetime } from '../src/game/lifetime.js';
import { MemoryStorage } from './helpers.js';

describe('trusted game maintenance', () => {
  it('preserves legacy Sims that have not been linked to Google yet', async () => {
    const database = localDatabase(new Lifetime(), new MemoryStorage());
    const now = 1_800_000_000_000;
    const room = {
      id: 1,
      ownerId: 'player_legacy',
      owner: 'Precedente',
      lastSeen: now - 100 * 3600000,
      vaultMoney: 100,
    };
    await database.ref('sims_rooms_state/0').set(room);
    await maintainGame(database, now);
    expect((await database.ref('sims_rooms_state/0').get()).val()).toEqual(room);
    expect((await database.ref('sims_saves/player_legacy/dead').get()).exists()).toBe(false);
  });
  it('retries private-record updates if a failure happens after releasing the room', async () => {
    const database = localDatabase(new Lifetime(), new MemoryStorage());
    const now = 1_800_000_000_000;
    await database.ref('sims_accounts/test_google').set({ playerId: 'player_retry' });
    await database.ref('sims_rooms_state/0').set({
      id: 1,
      ownerId: 'player_retry',
      owner: 'Riprova',
      lastSeen: now - 81 * 3600000,
      vaultMoney: 10,
    });
    const faulty = {
      ref: (path: string) => {
        const reference = database.ref(path);
        return path === 'sims_saves/player_retry'
          ? {
              ...reference,
              get: async () => {
                throw new Error('network unavailable');
              },
            }
          : reference;
      },
    };
    await expect(maintainGame(faulty, now)).rejects.toThrow('network unavailable');
    expect((await database.ref('sims_rooms_state/0/pendingDeath').get()).exists()).toBe(true);
    await maintainGame(database, now + 60000);
    expect((await database.ref('sims_saves/player_retry/dead').get()).val()).toBe(true);
    expect((await database.ref('sims_rooms_state/0/pendingDeath').get()).exists()).toBe(false);
  });
  it('reaps absent players once and preserves existing grave visitors', async () => {
    const database = localDatabase(new Lifetime(), new MemoryStorage());
    const now = 1_800_000_000_000;
    await database.ref('sims_accounts/test_google').set({ playerId: 'player_absent' });
    await database.ref('sims_rooms_state').set({
      0: {
        id: 1,
        ownerId: 'player_absent',
        owner: 'Assente',
        lastSeen: now - 81 * 3600000,
        vaultMoney: 10,
      },
      1: { id: 2, ownerId: 'player_present', owner: 'Presente', lastSeen: now, vaultMoney: 20 },
    });
    await database
      .ref('sims_saves/player_absent')
      .set({ savedAt: now - 81 * 3600000, moneyLevel: 0, gameMinutes: 2880 });
    await database.ref('sims_graveyard/player_absent/visitors').set({ player_friend: 'Amico' });
    await maintainGame(database, now);
    expect((await database.ref('sims_saves/player_absent/dead').get()).val()).toBe(true);
    expect((await database.ref('sims_rooms_state/0/ownerId').get()).val()).toBeNull();
    expect((await database.ref('sims_rooms_state/1/vaultMoney').get()).val()).toBe(20);
    expect(
      (await database.ref('sims_graveyard/player_absent/visitors/player_friend').get()).val(),
    ).toBe('Amico');
    const first = (await database.ref('sims_graveyard/player_absent').get()).val();
    await maintainGame(database, now + 60000);
    expect((await database.ref('sims_graveyard/player_absent').get()).val()).toEqual(first);
  });
});
