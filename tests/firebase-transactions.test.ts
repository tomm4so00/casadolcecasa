import { describe, expect, it } from 'vitest';
import { type MaintenanceDatabase, maintainGame } from '../server/src/maintenance.js';
import { localDatabase } from '../src/game/database.js';
import { Lifetime } from '../src/game/lifetime.js';
import { MemoryStorage } from './helpers.js';

const NOW = 1_800_000_000_000;
const H = 3600000;

/**
 * Come Firebase vero: se nessuno sta ascoltando quel percorso (o uno che lo contiene), il primo
 * giro di una transazione arriva con null. Se la funzione risponde "nessuna modifica" la
 * transazione finisce lì; altrimenti il database rifà il giro con i dati veri.
 */
function likeFirebase(db: ReturnType<typeof localDatabase>): MaintenanceDatabase {
  // stessa forma del database del server, con il database in memoria dei test sotto
  const listening = new Map<string, number>();
  const heard = (path: string) =>
    [...listening.keys()].some(
      (p) => (listening.get(p) || 0) > 0 && (path === p || path.startsWith(p + '/')),
    );
  const fake = {
    ref(path: string) {
      const real = db.ref(path);
      return {
        get: () => real.get(),
        update: (v: Record<string, unknown>) => real.update(v),
        remove: () => real.remove(),
        once: () => real.get(),
        on: (_e: 'value', cb: () => void) => {
          listening.set(path, (listening.get(path) || 0) + 1);
          return cb;
        },
        off: () => {
          listening.set(path, Math.max(0, (listening.get(path) || 0) - 1));
        },
        async transaction(update: (value: unknown) => unknown) {
          if (!heard(path) && update(null) === undefined)
            return { committed: false, snapshot: await real.get() };
          return real.transaction(update);
        },
      };
    },
  };
  return fake as unknown as MaintenanceDatabase;
}

describe('transazioni come su Firebase', () => {
  it('la manutenzione libera davvero le stanze anche quando il primo giro arriva vuoto', async () => {
    const db = localDatabase(new Lifetime(), new MemoryStorage());
    await db.ref('sims_rooms_state').set({
      0: { id: 1, ownerId: 'p_morta', owner: 'Laura', vaultMoney: 25, lastSeen: NOW - H },
      1: { id: 2, ownerId: 'p_assente', owner: 'Gino', vaultMoney: 10, lastSeen: NOW - 81 * H },
      2: { id: 3, ownerId: 'p_vivo', owner: 'Marco', vaultMoney: 5, lastSeen: NOW },
    });
    await db
      .ref('sims_saves/p_morta')
      .set({ savedAt: NOW - H, moneyLevel: 0, dead: true, deadAt: NOW - H, nick: 'Laura' });
    await db.ref('sims_saves/p_vivo').set({ savedAt: NOW, moneyLevel: 5, nick: 'Marco' });

    await maintainGame(likeFirebase(db), NOW);

    // chi è morto e chi è assente da 80 ore: stanza libera, promemoria tolto, lapide
    expect((await db.ref('sims_rooms_state/0').get()).val()).toEqual({ id: 1, vaultMoney: 0 });
    expect((await db.ref('sims_rooms_state/1').get()).val()).toEqual({ id: 2, vaultMoney: 0 });
    expect((await db.ref('sims_saves/p_assente/dead').get()).val()).toBe(true);
    expect((await db.ref('sims_graveyard/p_assente/name').get()).val()).toBe('Gino');
    // chi è vivo resta dov'è
    expect((await db.ref('sims_rooms_state/2/ownerId').get()).val()).toBe('p_vivo');
  });

  it('senza restare in ascolto la stanza non si sarebbe liberata (il guasto di prima)', async () => {
    const db = localDatabase(new Lifetime(), new MemoryStorage());
    await db.ref('sims_rooms_state/0').set({ id: 1, ownerId: 'p_morta', vaultMoney: 25 });
    const fb = likeFirebase(db);
    const r = await fb
      .ref('sims_rooms_state')
      .transaction((value) => (value ? { 0: { id: 1, vaultMoney: 0 } } : undefined));
    expect(r.committed).toBe(false);
    expect((await db.ref('sims_rooms_state/0/ownerId').get()).val()).toBe('p_morta');
  });
});
