import { describe, expect, it } from 'vitest';
import { isFreeRoom, moveRoom, rehashPin, roomLabel } from '../src/game/realty-rules';
import { hashPin } from '../src/game/safe-pin';

const blank = (i: number) => ({ id: i + 1, owner: null, ownerId: null, pin: null, vaultMoney: 0 });
const rooms = () => {
  const list: Record<string, unknown>[] = Array.from({ length: 16 }, (_, i) => blank(i));
  list[2] = {
    id: 3,
    owner: 'Anna',
    ownerId: 'p_anna',
    pin: hashPin('243', 3),
    vaultMoney: 1500,
    lastSeen: 1,
    layout: { bed: { x: 10, y: 20 } },
    economy: { version: 1, ownedItems: { top_basic: true } },
    paintings: { painting1: 'abc' },
  };
  list[5] = { id: 6, owner: 'Bea', ownerId: 'p_bea', vaultMoney: 30 };
  return list as Parameters<typeof moveRoom>[0];
};

describe('bacheca immobiliare', () => {
  it('nomi delle stanze come sulle porte', () => {
    expect(roomLabel(0)).toBe('Appartamento 1 · Stanza 1');
    expect(roomLabel(13)).toBe('Appartamento 2 · Stanza 6');
  });

  it('sposta tutto nella stanza libera e libera quella vecchia', () => {
    const out = moveRoom(rooms(), 'p_anna', 9, hashPin, 777)!;
    expect(out[9]).toMatchObject({
      id: 10,
      owner: 'Anna',
      ownerId: 'p_anna',
      vaultMoney: 1500,
      lastSeen: 777,
      layout: { bed: { x: 10, y: 20 } },
      economy: { version: 1, ownedItems: { top_basic: true } },
      paintings: { painting1: 'abc' },
    });
    expect(out[2]).toEqual({ id: 3, vaultMoney: 0 });
    expect(isFreeRoom(out[2])).toBe(true);
    // gli altri non si toccano
    expect(out[5]).toEqual(rooms()[5]);
  });

  it('la combinazione resta la stessa anche se cambia il numero della stanza', () => {
    const out = moveRoom(rooms(), 'p_anna', 9, hashPin, 0)!;
    expect(out[9].pin).toBe(hashPin('243', 10));
    expect(rehashPin(hashPin('155', 1), 1, 2, hashPin)).toBe(hashPin('155', 2));
    expect(rehashPin('321', 1, 2, hashPin)).toBe(hashPin('321', 2)); // vecchio PIN in chiaro
    expect(rehashPin(null, 1, 2, hashPin)).toBeNull();
  });

  it('non si entra in una stanza occupata, né senza stanza, né nella propria', () => {
    expect(moveRoom(rooms(), 'p_anna', 5, hashPin, 0)).toBeNull();
    expect(moveRoom(rooms(), 'p_nessuno', 9, hashPin, 0)).toBeNull();
    expect(moveRoom(rooms(), 'p_anna', 2, hashPin, 0)).toBeNull();
    expect(moveRoom(rooms(), 'p_anna', 99, hashPin, 0)).toBeNull();
  });

  it('il promemoria di chi abitava prima resta nella sua stanza', () => {
    const list = rooms();
    list[9] = { id: 10, vaultMoney: 0, pendingDeath: { id: 'p_old' } };
    const out = moveRoom(list, 'p_anna', 9, hashPin, 0)!;
    expect(out[9].pendingDeath).toEqual({ id: 'p_old' });
    expect(out[9].ownerId).toBe('p_anna');
  });
});
