import { describe, expect, it } from 'vitest';
import {
  THIRST_SECONDS,
  bossBonus,
  bossPlan,
  printGap,
  thirstAfter,
} from '../src/game/office-rules';

describe('turno in ufficio', () => {
  it('la sete si svuota in THIRST_SECONDS e non scende sotto zero', () => {
    expect(thirstAfter(1, THIRST_SECONDS / 2)).toBeCloseTo(0.5);
    expect(thirstAfter(0.1, THIRST_SECONDS)).toBe(0);
  });

  it('le stampe arrivano ogni 12-22 secondi', () => {
    expect(printGap(0)).toBe(12);
    expect(printGap(1)).toBe(22);
  });

  it('il capo arriva una volta ogni due turni, a metà turno', () => {
    expect(bossPlan(0.2, 0, 80)).toEqual({ comes: true, at: 24 });
    expect(bossPlan(0.7, 0, 80).comes).toBe(false);
    expect(bossPlan(0.2, 1, 80).at).toBe(48);
  });

  it('accontentare il capo vale tre consegne', () => {
    expect(bossBonus(5)).toBe(15);
  });
});
