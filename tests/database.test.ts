import { describe, expect, it, vi } from 'vitest';
import { localDatabase } from '../src/game/database.js';
import { Lifetime } from '../src/game/lifetime.js';
import { MemoryStorage } from './helpers.js';

describe('database locale e ciclo di vita', () => {
  it('mantiene i dati e il saldo della cassaforte dopo una nuova sessione', async () => {
    const storage = new MemoryStorage();
    const scope = new Lifetime();
    const db = localDatabase(scope, storage);
    await db.ref('sims_rooms_state/0').set({ ownerId: 'player_test', vaultMoney: 100 });
    await db.ref('sims_rooms_state/0/vaultMoney').transaction((value) => (value || 0) + 25);
    scope.dispose();
    const next = localDatabase(new Lifetime(), storage);
    expect((await next.ref('sims_rooms_state/0').get()).val()).toEqual({
      ownerId: 'player_test',
      vaultMoney: 125,
    });
  });
  it('esegue le transazioni concorrenti senza perdere incrementi', async () => {
    const db = localDatabase(new Lifetime(), new MemoryStorage());
    await Promise.all(
      Array.from({ length: 30 }, () => db.ref('balance').transaction((value) => (value || 0) + 1)),
    );
    expect((await db.ref('balance').get()).val()).toBe(30);
  });
  it('mantiene un valore esistente se una transazione viene annullata', async () => {
    const db = localDatabase(new Lifetime(), new MemoryStorage());
    await db.ref('lease').set({ id: 'first' });
    const result = await db.ref('lease').transaction(() => undefined);
    expect(result.committed).toBe(false);
    expect(result.snapshot.val()).toEqual({ id: 'first' });
  });
  it('ordina e limita i risultati delle classifiche', async () => {
    const db = localDatabase(new Lifetime(), new MemoryStorage());
    await db.ref('scores').set({ a: { wealth: 10 }, b: { wealth: 90 }, c: { wealth: 20 } });
    const result = await db.ref('scores').orderByChild('wealth').limitToLast(2).once('value');
    expect(result.val()).toEqual({ c: { wealth: 20 }, b: { wealth: 90 } });
  });
  it('non ripristina presenze online fantasma dal salvataggio locale', async () => {
    const storage = new MemoryStorage();
    const db = localDatabase(new Lifetime(), storage);
    await db.ref('sims_online_players/player_test').set({ name: 'Test' });
    const next = localDatabase(new Lifetime(), storage);
    expect((await next.ref('sims_online_players').get()).val()).toBeNull();
  });
  it('ferma timer e listener alla chiusura della partita', async () => {
    vi.useFakeTimers();
    try {
      const scope = new Lifetime();
      const tick = vi.fn();
      scope.setInterval(tick, 1000);
      const db = localDatabase(scope, new MemoryStorage());
      const listener = vi.fn();
      db.ref('value').on('value', listener);
      await vi.advanceTimersByTimeAsync(1000);
      expect(tick).toHaveBeenCalledTimes(1);
      scope.dispose();
      tick.mockClear();
      listener.mockClear();
      await db.ref('value').set(2);
      await vi.advanceTimersByTimeAsync(2000);
      expect(tick).not.toHaveBeenCalled();
      expect(listener).not.toHaveBeenCalled();
    } finally {
      vi.useRealTimers();
    }
  });
});
