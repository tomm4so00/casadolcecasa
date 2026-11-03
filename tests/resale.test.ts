import { describe, expect, it } from 'vitest';
import { RESALE_RATE, resaleValue } from '../src/game/resale-rules.js';

describe('rivendita di vestiti e mobili', () => {
  it('si riprende il prezzo pagato meno il 15%, arrotondato per difetto', () => {
    expect(RESALE_RATE).toBe(0.85);
    expect(resaleValue(100)).toBe(85);
    expect(resaleValue(40)).toBe(34);
    expect(resaleValue(25)).toBe(21); // 21,25 → 21
    expect(resaleValue(0)).toBe(0);
    expect(resaleValue(-5)).toBe(0);
    expect(resaleValue(NaN)).toBe(0);
  });
});
