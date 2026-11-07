import { describe, expect, it } from 'vitest';
import {
  CODE_ALPHABET,
  LEGACY_WORLD,
  WORLD_NODES,
  isWorldCode,
  newWorldCode,
  normalizeWorldCode,
  releaseExtraRooms,
  worldNodePath,
} from '../shared/worlds';

describe('mondi', () => {
  it('il mondo di sempre resta nei percorsi di prima, gli altri sotto /worlds', () => {
    expect(worldNodePath(LEGACY_WORLD, 'rooms_state')).toBe('sims_rooms_state');
    expect(worldNodePath(LEGACY_WORLD, 'online_players')).toBe('sims_online_players');
    expect(worldNodePath('CASA-X92K', 'rooms_state')).toBe('worlds/CASA-X92K/rooms_state');
    expect(worldNodePath('CASA-X92K', 'chat')).toBe('worlds/CASA-X92K/chat');
  });

  it('borsa, salvataggi e account non sono nodi del mondo', () => {
    for (const node of ['market', 'activity', 'saves', 'accounts', 'collect', 'limited'])
      expect(WORLD_NODES as readonly string[]).not.toContain(node);
  });

  it('i codici nuovi sono nel formato giusto e senza lettere che si confondono', () => {
    expect(CODE_ALPHABET).not.toMatch(/[01OIL]/);
    for (const r of [0, 0.25, 0.5, 0.999, 1]) {
      const code = newWorldCode(() => r);
      expect(code).toMatch(/^CASA-[A-Z2-9]{4}$/);
      expect(isWorldCode(code)).toBe(true);
    }
    expect(newWorldCode(() => 0)).toBe('CASA-2222');
  });

  it('il codice si può scrivere come capita', () => {
    expect(normalizeWorldCode('casa-x92k')).toBe('CASA-X92K');
    expect(normalizeWorldCode(' X92K ')).toBe('CASA-X92K');
    expect(normalizeWorldCode('casa x92k')).toBe('CASA-X92K');
    expect(normalizeWorldCode('CASA-0001')).toBe(LEGACY_WORLD);
    // lettere che non esistono nei codici, o lunghezza sbagliata
    expect(normalizeWorldCode('CASA-X9OK')).toBeNull();
    expect(normalizeWorldCode('CASA-X92')).toBeNull();
    expect(normalizeWorldCode('')).toBeNull();
  });
});

describe('una stanza per giocatore in ogni condominio', () => {
  it('chi ne ha prese di più tiene quella usata per ultima, le altre si liberano vuote', () => {
    const rooms = [
      { id: 1, owner: 'Ada', ownerId: 'a', lastSeen: 100, vaultMoney: 30 },
      { id: 2, owner: 'Ada', ownerId: 'a', lastSeen: 300, vaultMoney: 500 },
      { id: 3, owner: 'Ada', ownerId: 'a', lastSeen: 200, vaultMoney: 30 },
      { id: 4, owner: 'Bea', ownerId: 'b', lastSeen: 50, vaultMoney: 10 },
      { id: 5 },
    ];
    const r = releaseExtraRooms(rooms)!;
    expect(r.freed).toBe(2);
    expect(r.rooms[0]).toEqual({ id: 1, vaultMoney: 0 });
    expect(r.rooms[1]).toEqual(rooms[1]);
    expect(r.rooms[2]).toEqual({ id: 3, vaultMoney: 0 });
    expect(r.rooms[3]).toEqual(rooms[3]);
  });

  it('se ognuno ha la sua stanza non cambia niente', () => {
    expect(releaseExtraRooms([{ id: 1, ownerId: 'a' }, { id: 2, ownerId: 'b' }, null])).toBeNull();
    expect(releaseExtraRooms(null)).toBeNull();
    // un morto da sistemare (pendingDeath) non conta: ci pensa la manutenzione dei morti
    expect(
      releaseExtraRooms([
        { id: 1, ownerId: 'a' },
        { id: 2, ownerId: 'a', pendingDeath: { id: 'a' } },
      ]),
    ).toBeNull();
  });
});
