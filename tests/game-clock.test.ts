import { describe, expect, it } from 'vitest';
import { START_MINUTES, clockText, dayNumber, isNight, realHour } from '../src/game/game-clock.js';

describe("orologio allineato all'ora reale", () => {
  it("mostra l'ora del dispositivo", () => {
    const d = new Date(2026, 10, 2, 21, 7, 30);
    expect(clockText(d)).toBe('21:07');
    expect(realHour(d)).toBeCloseTo(21.125, 3);
    expect(isNight(21)).toBe(true);
    expect(isNight(12)).toBe(false);
  });

  it('il giorno del personaggio cambia a mezzanotte, non 24 ore dopo la nascita', () => {
    const born = new Date(2026, 10, 2, 22, 0); // nato alle 22:00
    const minutesAt = (d: Date) => START_MINUTES + (d.getTime() - born.getTime()) / 60000;
    const at = (h: number, day = 2) => new Date(2026, 10, day, h, 0);
    expect(dayNumber(minutesAt(at(23)), at(23))).toBe(1);
    expect(dayNumber(minutesAt(at(1, 3)), at(1, 3))).toBe(2); // dopo mezzanotte
    expect(dayNumber(minutesAt(at(23, 4)), at(23, 4))).toBe(3);
  });

  it('un personaggio appena creato è al giorno 1', () => {
    expect(dayNumber(START_MINUTES, new Date())).toBe(1);
  });
});
