import { describe, expect, it } from 'vitest';
import {
  type PushSender,
  deathWarningText,
  maintainGame,
  sendDeathWarnings,
  sendPetWarnings,
} from '../server/src/maintenance.js';
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

describe('avviso sul telefono prima della morte per assenza', () => {
  const now = 1_800_000_000_000;
  const setup = async (awayHours: number) => {
    const database = localDatabase(new Lifetime(), new MemoryStorage());
    await database.ref('sims_accounts/g1').set({ playerId: 'player_a' });
    await database.ref('sims_rooms_state/0').set({
      id: 1,
      ownerId: 'player_a',
      owner: 'Mario',
      lastSeen: now - awayHours * 3600000,
      vaultMoney: 0,
    });
    await database.ref('sims_push/player_a/tokens/k1').set({ token: 'tok-ok', t: now });
    await database.ref('sims_push/player_a/tokens/k2').set({ token: 'tok-old', t: now });
    const calls: { token: string; title: string; body: string }[] = [];
    const send: PushSender = async (token, m) => {
      calls.push({ token, title: m.title, body: m.body });
      return token === 'tok-old' ? 'gone' : 'sent';
    };
    return { database, calls, send };
  };

  it('avvisa 12 ore prima, una volta sola, e toglie i dispositivi non più validi', async () => {
    const { database, calls, send } = await setup(69);
    expect(await sendDeathWarnings(database, now, send)).toBe(1);
    expect(calls.map((c) => c.token).sort()).toEqual(['tok-ok', 'tok-old']);
    expect(calls[0].title).toBe('⚠️ Mario sta per morire!');
    expect(calls[0].body).toContain('entro 11 ore');
    expect((await database.ref('sims_push/player_a/tokens/k2').get()).exists()).toBe(false);
    // il giro successivo non lo avvisa di nuovo
    expect(await sendDeathWarnings(database, now + 15 * 60000, send)).toBe(0);
  });

  it('non avvisa chi è entrato da poco o è già morto', async () => {
    for (const hours of [60, 81]) {
      const { database, send } = await setup(hours);
      expect(await sendDeathWarnings(database, now, send)).toBe(0);
    }
  });

  it('il testo dice quante ore restano', () => {
    expect(deathWarningText('Ada', now - 79.6 * 3600000, now).body).toContain('entro 1 ora');
  });
});

describe('avvisi per gli animali che stanno per morire', () => {
  const now = 1_800_000_000_000;
  const H = 3600000;
  // il cane è sazio da `fedHoursAgo` ore: senza cibo muore dopo 48 ore
  const setup = async (fedHoursAgo: number, savedMinutesAgo = 120) => {
    const database = localDatabase(new Lifetime(), new MemoryStorage());
    await database.ref('sims_saves/player_a').set({
      savedAt: now - savedMinutesAgo * 60000,
      moneyLevel: 0,
      pets: { dog: { hunger: 100, at: now - fedHoursAgo * H }, fish: { hunger: 100, at: now } },
    });
    await database.ref('sims_push/player_a/tokens/k1').set({ token: 'tok-ok', t: now });
    const calls: { title: string; body: string; tag: string }[] = [];
    const send: PushSender = async (_token, m) => {
      calls.push({ title: m.title, body: m.body, tag: m.tag });
      return 'sent';
    };
    return { database, calls, send };
  };

  it('avvisa nelle ultime 6 ore, una volta sola, solo per l’animale in pericolo', async () => {
    const { database, calls, send } = await setup(44);
    expect(await sendPetWarnings(database, now, send)).toBe(1);
    expect(calls[0].title).toBe('🆘 Il tuo cane 🐶 sta per morire!');
    expect(calls[0].body).toContain('entro 4 ore');
    expect(calls[0].tag).toBe('sims-pet-dog');
    expect(await sendPetWarnings(database, now + 15 * 60000, send)).toBe(0);
  });

  it('non avvisa se c’è ancora tempo, se è già morto o se si sta giocando', async () => {
    for (const [hours, saved] of [
      [40, 120],
      [49, 120],
      [44, 3],
    ]) {
      const { database, send } = await setup(hours, saved);
      expect(await sendPetWarnings(database, now, send)).toBe(0);
    }
  });
});
