import { describe, expect, it } from 'vitest';
import { freedRoom, graveFromSave, releaseRoomsOf } from '../shared/death-rules.js';
import { maintainGame, tidyDeadPlayers } from '../server/src/maintenance.js';
import { localDatabase } from '../src/game/database.js';
import { Lifetime } from '../src/game/lifetime.js';
import { MemoryStorage } from './helpers.js';

const NOW = 1_800_000_000_000;

describe('personaggi morti', () => {
  it('la stanza di chi muore torna libera, le altre restano com’erano', () => {
    const rooms = [
      { id: 1, ownerId: 'p_morto', owner: 'Laura', pin: 'x', vaultMoney: 40, lastSeen: 5 },
      { id: 2, ownerId: 'p_vivo', owner: 'Marco', vaultMoney: 10 },
    ];
    const next = releaseRoomsOf(rooms, 'p_morto')!;
    expect(next[0]).toEqual({ id: 1, vaultMoney: 0 });
    expect(next[1]).toBe(rooms[1]);
    expect(rooms[0].ownerId).toBe('p_morto'); // l'elenco di partenza non si tocca
    expect(releaseRoomsOf(rooms, 'p_nessuno')).toBeNull();
    // anche con l'oggetto letto dal database, e il promemoria del server resta
    const receipt = { id: 'p_altro', name: 'Altro', lastSeen: 1 };
    expect(freedRoom({ id: 3, ownerId: 'p_morto', pendingDeath: receipt })).toEqual({
      id: 3,
      vaultMoney: 0,
      pendingDeath: receipt,
    });
    expect(releaseRoomsOf({ 5: { id: 6, ownerId: 'p_morto' } }, 'p_morto')).toEqual({
      5: { id: 6, vaultMoney: 0 },
    });
  });

  it('la lapide si ricostruisce dal salvataggio', () => {
    expect(
      graveFromSave(
        { nick: 'Laura', deadAt: 1000, gameMinutes: 1500, bornAt: 400, epitaph: 'Ciao' },
        'X',
        NOW,
      ),
    ).toEqual({ name: 'Laura', deadAt: 1000, days: 2, lived: 600, epitaph: 'Ciao' });
    // senza nome né data: quello della stanza e adesso
    expect(graveFromSave({}, 'Dalla stanza', NOW)).toEqual({
      name: 'Dalla stanza',
      deadAt: NOW,
      days: 1,
    });
  });

  it('il server sistema chi è morto ma ha ancora stanza, personaggio in giro e niente lapide', async () => {
    const db = localDatabase(new Lifetime(), new MemoryStorage());
    await db.ref('sims_rooms_state').set({
      0: { id: 1, ownerId: 'p_laura', owner: 'Laura', vaultMoney: 25, lastSeen: NOW - 60000 },
      1: { id: 2, ownerId: 'p_marco', owner: 'Marco', vaultMoney: 10, lastSeen: NOW },
    });
    await db.ref('sims_saves/p_laura').set({
      savedAt: NOW,
      moneyLevel: 0,
      dead: true,
      deadAt: NOW - 1000,
      nick: 'Laura',
      gameMinutes: 1600,
    });
    await db.ref('sims_saves/p_marco').set({ savedAt: NOW, moneyLevel: 5, nick: 'Marco' });
    await db
      .ref('sims_online_players/p_laura')
      .set({ name: 'Laura', x: 0, y: 0, env: 'PLAYER_ROOM', offline: true });
    await db.ref('sims_online_players/p_marco').set({ name: 'Marco', x: 0, y: 0, env: 'SALOON' });
    await db.ref('sims_leaderboard/p_laura').set({ name: 'Laura', wealth: 25 });

    await tidyDeadPlayers(db, NOW);

    expect((await db.ref('sims_rooms_state/0').get()).val()).toEqual({ id: 1, vaultMoney: 0 });
    expect((await db.ref('sims_rooms_state/1/ownerId').get()).val()).toBe('p_marco');
    expect((await db.ref('sims_online_players/p_laura').get()).exists()).toBe(false);
    expect((await db.ref('sims_online_players/p_marco').get()).exists()).toBe(true);
    expect((await db.ref('sims_leaderboard/p_laura').get()).exists()).toBe(false);
    expect((await db.ref('sims_graveyard/p_laura').get()).val()).toEqual({
      name: 'Laura',
      deadAt: NOW - 1000,
      days: 2,
    });
    expect((await db.ref('sims_graveyard/p_marco').get()).exists()).toBe(false);
  });

  it('una lapide che c’è già (con i fiori) non si riscrive', async () => {
    const db = localDatabase(new Lifetime(), new MemoryStorage());
    await db
      .ref('sims_rooms_state/0')
      .set({ id: 1, ownerId: 'p_anna', owner: 'Anna', vaultMoney: 0 });
    await db.ref('sims_saves/p_anna').set({ savedAt: NOW, moneyLevel: 0, dead: true, deadAt: 5 });
    const grave = { name: 'Anna', deadAt: 5, days: 3, visitors: { p_amico: 'Amico' } };
    await db.ref('sims_graveyard/p_anna').set(grave);
    // la manutenzione completa la fa da sola
    await maintainGame(db, NOW);
    expect((await db.ref('sims_graveyard/p_anna').get()).val()).toEqual(grave);
    expect((await db.ref('sims_rooms_state/0/ownerId').get()).exists()).toBe(false);
  });
});
