import { describe, expect, it } from 'vitest';
import { TOILET_COOLDOWN_MS, toiletReady, toiletReward } from '../src/game/toilet-rules.js';

describe('WC', () => {
  it('è disponibile al primo uso e dopo due ore, anche oltre mezzanotte', () => {
    const last = new Date('2026-11-06T23:00:00+01:00').getTime();
    expect(toiletReady(undefined, last)).toBe(true);
    expect(toiletReady(last, last + TOILET_COOLDOWN_MS - 1)).toBe(false);
    expect(toiletReady(last, last + TOILET_COOLDOWN_MS)).toBe(true);
    expect(toiletReady(last, last - 1)).toBe(false);
  });

  it('assegna +15 solo nel primo quindicesimo delle estrazioni, altrimenti +5', () => {
    expect(toiletReward(0)).toBe(15);
    expect(toiletReward(1 / 15 - 0.000001)).toBe(15);
    expect(toiletReward(1 / 15)).toBe(5);
    expect(toiletReward(0.999)).toBe(5);
  });
});
