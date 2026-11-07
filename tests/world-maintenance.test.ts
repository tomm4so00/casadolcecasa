import { describe, expect, it } from 'vitest';
import {
  EMPTY_WORLD_GRACE_MS,
  removeEmptyWorlds,
  tidyDeadPlayers,
  worldIds,
} from '../server/src/maintenance.js';
import { accountWorlds, worldDeletionPaths } from '../server/src/deletion.js';
import { LEGACY_WORLD, worldIsEmpty } from '../shared/worlds';
import { localDatabase } from '../src/game/database.js';
import { Lifetime } from '../src/game/lifetime.js';
import { MemoryStorage } from './helpers.js';

const t0 = Date.UTC(2026, 10, 7, 12);
const old = t0 - EMPTY_WORLD_GRACE_MS - 1;
const fresh = () => localDatabase(new Lifetime(), new MemoryStorage());

describe('mondi vuoti', () => {
  it('un mondo è vuoto senza proprietari né morti da sistemare, e non appena nato', () => {
    expect(worldIsEmpty([{ id: 1 }, null], old, t0, EMPTY_WORLD_GRACE_MS)).toBe(true);
    expect(worldIsEmpty(null, old, t0, EMPTY_WORLD_GRACE_MS)).toBe(true);
    expect(worldIsEmpty([{ id: 1, ownerId: 'a' }], old, t0, EMPTY_WORLD_GRACE_MS)).toBe(false);
    expect(worldIsEmpty({ 5: { id: 6, owner: 'Bea' } }, old, t0, EMPTY_WORLD_GRACE_MS)).toBe(false);
    expect(
      worldIsEmpty([{ id: 1, pendingDeath: { id: 'a' } }], old, t0, EMPTY_WORLD_GRACE_MS),
    ).toBe(false);
    // appena creato: chi l'ha creato sta ancora prendendo la stanza
    expect(worldIsEmpty(null, t0 - 1000, t0, EMPTY_WORLD_GRACE_MS)).toBe(false);
  });

  it('il server cancella interi i mondi vuoti, non gli altri e mai quello di sempre', async () => {
    const db = fresh();
    await db.ref('sims_worlds').set({
      'CASA-2222': { free: 64, createdAt: old },
      'CASA-3333': { free: 63, createdAt: old },
      'CASA-4444': { free: 64, createdAt: t0 - 1000 },
      [LEGACY_WORLD]: { free: 64, createdAt: 0 },
    });
    await db.ref('worlds/CASA-2222/rooms_state').set([{ id: 1 }]);
    await db.ref('worlds/CASA-2222/chat/m1').set({ id: 'x', text: 'ciao' });
    await db.ref('worlds/CASA-3333/rooms_state').set([{ id: 1, owner: 'Bea', ownerId: 'b' }]);
    expect(await worldIds(db)).toEqual(
      expect.arrayContaining([LEGACY_WORLD, 'CASA-2222', 'CASA-3333', 'CASA-4444']),
    );
    expect(await removeEmptyWorlds(db, t0)).toEqual(['CASA-2222']);
    expect((await db.ref('worlds/CASA-2222').get()).val()).toBeNull();
    expect((await db.ref('sims_worlds/CASA-2222').get()).val()).toBeNull();
    expect((await db.ref('worlds/CASA-3333/rooms_state').get()).val()).not.toBeNull();
    expect((await db.ref('sims_worlds/CASA-4444').get()).val()).not.toBeNull();
    expect((await db.ref('sims_worlds/' + LEGACY_WORLD).get()).val()).not.toBeNull();
  });

  it("quando muore l'ultimo giocatore di un mondo, la sua stanza si libera e il mondo sparisce", async () => {
    const db = fresh();
    await db.ref('sims_worlds/CASA-2222').set({ free: 63, createdAt: old });
    await db.ref('worlds/CASA-2222/rooms_state').set([{ id: 1, owner: 'Ugo', ownerId: 'u' }]);
    await db.ref('worlds/CASA-2222/leaderboard/u').set({ name: 'Ugo', wealth: 10 });
    await db.ref('sims_leaderboard_global/u').set({ name: 'Ugo', wealth: 10, world: 'CASA-2222' });
    await db.ref('sims_saves/u').set({ savedAt: t0 - 1000, dead: true, deadAt: t0 - 1000 });
    await tidyDeadPlayers(db, t0, 'CASA-2222');
    const rooms = (await db.ref('worlds/CASA-2222/rooms_state').get()).val();
    expect(rooms[0].ownerId ?? null).toBeNull();
    expect((await db.ref('worlds/CASA-2222/leaderboard/u').get()).val()).toBeNull();
    expect((await db.ref('sims_leaderboard_global/u').get()).val()).toBeNull();
    // la lapide c'è, nel cimitero di quel mondo
    expect((await db.ref('worlds/CASA-2222/graveyard/u').get()).val()?.name).toBe('Ugo');
    // il mondo di sempre non è stato toccato
    expect((await db.ref('sims_graveyard/u').get()).val()).toBeNull();
    expect(await removeEmptyWorlds(db, t0)).toEqual(['CASA-2222']);
  });
});

describe("cancellazione dell'account nei mondi nuovi", () => {
  it('trova i mondi dai salvataggi e cancella lì quello che il giocatore ha lasciato', () => {
    const saves = {
      player_x: { worldId: 'CASA-2222' },
      player_x_r1: { worldId: LEGACY_WORLD },
      other: { worldId: 'CASA-3333' },
    };
    expect(accountWorlds(['player_x', 'player_x_r1'], saves)).toEqual(['CASA-2222']);
    const paths = worldDeletionPaths(
      'x',
      {
        sims_accounts: { x: { playerId: 'player_x' } },
        sims_saves: saves,
        sims_chat: { m1: { id: 'player_x', text: 'ciao' }, m2: { id: 'other', text: 'hey' } },
      },
      'CASA-2222',
    );
    expect(paths).toContain('worlds/CASA-2222/chat/m1');
    expect(paths).toContain('worlds/CASA-2222/online_players/player_x');
    expect(paths).toContain('worlds/CASA-2222/leaderboard/player_x');
    expect(paths).not.toContain('worlds/CASA-2222/chat/m2');
    // fuori dai nodi del mondo non tocca niente (salvataggi e account li cancella il resto)
    expect(paths.every((p) => p.startsWith('worlds/CASA-2222/'))).toBe(true);
  });
});
