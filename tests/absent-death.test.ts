import { describe, expect, it } from 'vitest';
import { NEEDS_RULES, absentDeath, needsStateFromSave } from '../src/game/absent-death-rules';
import { advanceNeeds } from '../src/game/simulation';
import { maintainGame } from '../server/src/maintenance.js';
import { localDatabase } from '../src/game/database.js';
import { Lifetime } from '../src/game/lifetime.js';
import { MemoryStorage } from './helpers.js';

const NOW = 1_800_000_000_000;
const H = 3600000;
/** Affamato e quasi senza salute: con la fame a zero la salute cala di 100 ogni 48 ore. */
const starving = (savedAt: number) => ({
  savedAt,
  moneyLevel: 0,
  nick: 'Laura',
  healthLevel: 10,
  sleepLevel: 100,
  hungerLevel: 0,
  hygieneLevel: 100,
  happinessLevel: 100,
  gameMinutes: 2000,
});

describe('morte mentre si è via', () => {
  it('trova il momento in cui la salute arriva a zero', () => {
    const save = starving(NOW - 10 * H);
    // 10 punti di salute a 100 ogni 172800 s = 17280 s = 4,8 ore
    const death = absentDeath(save, {}, NOW)!;
    expect(Math.abs(death.deadAt - (save.savedAt + 17_280_000))).toBeLessThan(6000);
    expect(death.gameMinutes).toBeCloseTo(2000 + 17280 / 60, 0);
    // prima di quel momento era ancora vivo
    expect(absentDeath(save, {}, save.savedAt + 4 * H)).toBeNull();
  });

  it('dà lo stesso risultato del gioco al rientro', () => {
    const save = starving(NOW - 10 * H);
    const state = needsStateFromSave(save);
    advanceNeeds(state, 10 * 3600, NOW, NEEDS_RULES);
    expect(state.healthLevel).toBe(0);
    const ok = { ...save, hungerLevel: 100, healthLevel: 80 };
    const alive = needsStateFromSave(ok);
    advanceNeeds(alive, 10 * 3600, NOW, NEEDS_RULES);
    expect(alive.healthLevel).toBeGreaterThan(0);
    expect(absentDeath(ok, {}, NOW)).toBeNull();
  });

  it('chi è già morto o non ha un salvataggio datato non si tocca', () => {
    expect(absentDeath({ ...starving(NOW - 10 * H), dead: true }, {}, NOW)).toBeNull();
    expect(absentDeath({ healthLevel: 0 }, {}, NOW)).toBeNull();
  });

  it('il server segna la morte nel momento giusto e libera la stanza; chi sta giocando no', async () => {
    const db = localDatabase(new Lifetime(), new MemoryStorage());
    await db.ref('sims_accounts/a').set({ playerId: 'p_via' });
    await db.ref('sims_accounts/b').set({ playerId: 'p_gioca' });
    await db.ref('sims_accounts/c').set({ playerId: 'p_online' });
    await db.ref('sims_rooms_state').set({
      0: { id: 1, ownerId: 'p_via', owner: 'Laura', vaultMoney: 20, lastSeen: NOW - 9 * H },
      1: { id: 2, ownerId: 'p_gioca', owner: 'Marco', vaultMoney: 5, lastSeen: NOW - 60000 },
      2: { id: 3, ownerId: 'p_online', owner: 'Sara', vaultMoney: 5, lastSeen: NOW - 9 * H },
    });
    await db.ref('sims_saves/p_via').set(starving(NOW - 10 * H));
    await db.ref('sims_saves/p_gioca').set({ ...starving(NOW - 10 * H), nick: 'Marco' });
    await db.ref('sims_saves/p_online').set({ ...starving(NOW - 10 * H), nick: 'Sara' });
    // Laura è svenuta a terra (offline); Sara manda ancora la posizione
    await db
      .ref('sims_online_players/p_via')
      .set({ name: 'Laura', x: 0, y: 0, env: 'PLAYER_ROOM', offline: true, offAt: NOW - 9 * H });
    await db
      .ref('sims_online_players/p_online')
      .set({ name: 'Sara', x: 0, y: 0, env: 'SALOON', t: NOW - 30000 });

    await maintainGame(db, NOW);

    const save = (await db.ref('sims_saves/p_via').get()).val();
    expect(save.dead).toBe(true);
    expect(Math.abs(save.deadAt - (NOW - 10 * H + 17_280_000))).toBeLessThan(6000);
    const grave = (await db.ref('sims_graveyard/p_via').get()).val();
    expect(grave).toMatchObject({ name: 'Laura', deadAt: save.deadAt });
    expect(grave.days).toBeGreaterThanOrEqual(1);
    expect((await db.ref('sims_rooms_state/0').get()).val()).toEqual({ id: 1, vaultMoney: 0 });
    expect((await db.ref('sims_online_players/p_via').get()).exists()).toBe(false);
    // chi si è fatto vedere da poco resta com'è: ci pensa il suo gioco
    for (const id of ['p_gioca', 'p_online'])
      expect((await db.ref('sims_saves/' + id + '/dead').get()).exists()).toBe(false);
    expect((await db.ref('sims_rooms_state/1/ownerId').get()).val()).toBe('p_gioca');
    expect((await db.ref('sims_rooms_state/2/ownerId').get()).val()).toBe('p_online');
  });
});
