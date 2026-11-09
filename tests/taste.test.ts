import { describe, expect, it } from 'vitest';
import {
  FOOD_STACK_MAX,
  canCook,
  canTakeRaw,
  decodeFood,
  encodeFood,
} from '../src/game/food-rules';
import { TASTE_BOTS, type TasteInput, chooseTasteTarget } from '../src/game/taste-rules';
import { inventoryItems } from '../src/game/inventory-rules';

describe('il cibo nello zaino', () => {
  it('si fa scorta, fino a un massimo per tipo', () => {
    expect(canTakeRaw({ raw: FOOD_STACK_MAX - 1, dishes: 0 })).toBe(true);
    expect(canTakeRaw({ raw: FOOD_STACK_MAX, dishes: 0 })).toBe(false);
    expect(canCook({ raw: 1, dishes: 0 })).toBe(true);
    expect(canCook({ raw: 0, dishes: 3 })).toBe(false);
    expect(canCook({ raw: 2, dishes: FOOD_STACK_MAX })).toBe(false);
  });

  it('si salva con i contatori e con i due campi di prima (per le versioni vecchie)', () => {
    expect(encodeFood({ raw: 2, dishes: 3 })).toEqual({
      hasFood: true,
      foodCooked: true,
      raw: 2,
      dishes: 3,
    });
    expect(decodeFood(encodeFood({ raw: 2, dishes: 3 }))).toEqual({ raw: 2, dishes: 3 });
    // salvataggi di prima: un cibo solo, in mano
    expect(decodeFood({ hasFood: true, foodCooked: true })).toEqual({ raw: 0, dishes: 1 });
    expect(decodeFood({ hasFood: true, foodCooked: false })).toEqual({ raw: 1, dishes: 0 });
    expect(decodeFood({ hasFood: false })).toEqual({ raw: 0, dishes: 0 });
    // valori strani
    expect(decodeFood({ raw: -3, dishes: 999 })).toEqual({ raw: 0, dishes: FOOD_STACK_MAX });
    expect(decodeFood(null)).toEqual({ raw: 0, dishes: 0 });
  });

  it('lo zaino mostra il cibo crudo e i piatti', () => {
    const items = inventoryItems({ weed: undefined, drugStock: 0, rawFood: 2, dishes: 3 });
    expect(items.map((i) => [i.id, i.quantity])).toEqual([
      ['dish', 3],
      ['raw_food', 2],
    ]);
  });
});

describe("l'assaggio di benvenuto: a chi portarlo", () => {
  const input: TasteInput = {
    me: 'p_new',
    myApt: 0,
    perApt: 8,
    online: [],
    rooms: [],
    previous: null,
    seed: 'p_new',
  };

  it('a un vicino online nel condominio, meglio se del mio appartamento', () => {
    const t = chooseTasteTarget({
      ...input,
      online: [
        { id: 'p_far', name: 'Bea', env: 'KITCHEN', apt: 3 },
        { id: 'p_near', name: 'Marco', env: 'SALOON', apt: 0 },
        { id: 'p_out', name: 'Ugo', env: 'bar', apt: null },
      ],
    });
    expect(t).toMatchObject({ mode: 'online', id: 'p_near', name: 'Marco' });
    // chi è fuori dal condominio non conta
    const out = chooseTasteTarget({
      ...input,
      online: [{ id: 'p_out', name: 'Ugo', env: 'bar' }],
      rooms: [{ idx: 12, ownerId: 'p_out', owner: 'Ugo' }],
    });
    expect(out).toMatchObject({ mode: 'room', idx: 12 });
  });

  it('se nessuno è online: nella stanza di un vicino, e resta lo stesso', () => {
    const rooms = [
      { idx: 0, ownerId: 'p_new', owner: 'Io' },
      { idx: 20, ownerId: 'p_a', owner: 'Anna' },
      { idx: 3, ownerId: 'p_b', owner: 'Bruno' },
    ];
    const first = chooseTasteTarget({ ...input, rooms });
    expect(first).toMatchObject({ mode: 'room', idx: 3, name: 'Bruno' });
    // se poi arriva qualcuno online si va da lui; altrimenti si resta su Bruno
    expect(chooseTasteTarget({ ...input, rooms: [...rooms].reverse(), previous: first })).toEqual(
      first,
    );
  });

  it('se nel condominio non abita nessun altro: un personaggio del gioco, sempre lo stesso', () => {
    const a = chooseTasteTarget({ ...input, rooms: [{ idx: 0, ownerId: 'p_new', owner: 'Io' }] });
    expect(a.mode).toBe('bot');
    expect(TASTE_BOTS.map((b) => b.name)).toContain(a.name);
    expect(chooseTasteTarget(input)).toEqual(a);
  });
});
