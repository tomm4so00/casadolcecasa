import { describe, expect, it } from 'vitest';
import { decodeDailyUses, recordUse, usesLeftToday } from '../src/game/daily-limits.js';

describe('azioni con un massimo al giorno', () => {
  const morning = new Date(2026, 10, 3, 9, 0);
  const evening = new Date(2026, 10, 3, 22, 0);
  const tomorrow = new Date(2026, 10, 4, 8, 0);

  it('un solo viaggio al giorno', () => {
    expect(usesLeftToday(undefined, 'trip', morning)).toBe(1);
    const s = recordUse(undefined, 'trip', morning);
    expect(usesLeftToday(s, 'trip', evening)).toBe(0);
    expect(usesLeftToday(s, 'trip', tomorrow)).toBe(1);
  });

  it('WC al massimo due volte al giorno, contato a parte dal viaggio', () => {
    let s = recordUse(undefined, 'wc', morning);
    expect(usesLeftToday(s, 'wc', morning)).toBe(1);
    s = recordUse(s, 'trip', morning);
    s = recordUse(s, 'wc', evening);
    expect(usesLeftToday(s, 'wc', evening)).toBe(0);
    expect(usesLeftToday(s, 'trip', evening)).toBe(0);
    expect(usesLeftToday(s, 'wc', tomorrow)).toBe(2);
  });

  it('il salvataggio si legge anche se rovinato', () => {
    expect(decodeDailyUses(null)).toBeUndefined();
    expect(decodeDailyUses({ day: 'ieri', uses: {} })).toBeUndefined();
    expect(decodeDailyUses({ day: '2026-11-03', uses: { wc: 99, trip: -1, x: 3 } })).toEqual({
      day: '2026-11-03',
      uses: { wc: 2 },
    });
  });
});
