import { describe, expect, it } from 'vitest';
import {
  arrivalGap,
  missing,
  moodOf,
  nextCookDish,
  orderFor,
  patienceFor,
  tipFor,
} from '../src/game/restaurant-rules';

describe('turno al ristorante', () => {
  it('la pazienza cala e i clienti arrivano più spesso verso la fine', () => {
    expect(patienceFor(0)).toBe(24);
    expect(patienceFor(1)).toBe(16);
    expect(arrivalGap(1, 0)).toBeLessThan(arrivalGap(0, 0));
    expect(arrivalGap(0, 1)).toBe(8.5);
  });

  it('nella prima metà si ordina un piatto, dopo a volte due diversi', () => {
    expect(orderFor(0.2, 0, 0, 0)).toEqual(['pizza']);
    expect(orderFor(0.8, 0.99, 0.9, 0)).toEqual(['caffe']);
    const two = orderFor(0.8, 0, 0.1, 0);
    expect(two).toHaveLength(2);
    expect(two[0]).not.toBe(two[1]);
  });

  it('più si serve in fretta, più mancia', () => {
    expect(tipFor(1, 6)).toBe(9);
    expect(tipFor(0.5, 6)).toBe(5);
    expect(tipFor(0, 6)).toBe(0);
    expect(moodOf(0.8)).toBe('ok');
    expect(moodOf(0.3)).toBe('warn');
    expect(moodOf(0.1)).toBe('bad');
  });

  it('i piatti ancora da servire contano i doppioni', () => {
    expect(missing(['pizza', 'vino'], ['vino'])).toEqual(['pizza']);
    expect(missing(['pizza', 'pizza'], ['pizza'])).toEqual(['pizza']);
  });

  it('ogni cucina prepara per primo il cliente più impaziente', () => {
    const guests = [
      { order: ['pasta' as const], served: [], patience: 10, waiting: true },
      { order: ['pizza' as const, 'pasta' as const], served: [], patience: 3, waiting: true },
    ];
    // la pizza va nel forno, la pasta sui fornelli
    expect(nextCookDish('oven', guests, [])).toBe('pizza');
    expect(nextCookDish('stove', guests, [])).toBe('pasta');
    // una pasta è già sul fuoco: tocca a quella dell'altro cliente
    expect(nextCookDish('stove', guests, ['pasta'])).toBe('pasta');
    expect(nextCookDish('stove', guests, ['pasta', 'pasta'])).toBeNull();
    expect(nextCookDish('oven', guests, ['pizza'])).toBeNull();
  });
});
