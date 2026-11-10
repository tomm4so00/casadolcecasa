import { describe, expect, it } from 'vitest';
import {
  SERVE_MINUTES,
  peopleAhead,
  servingNumber,
  ticketLabel,
  ticketNumber,
  unsolvedThefts,
} from '../src/game/police-rules.js';

const at = (h: number, m: number) => new Date(2026, 10, 10, h, m).getTime();

describe('commissariato: eliminacode', () => {
  it('lo sportello chiama un numero nuovo ogni SERVE_MINUTES, da 1 a 99', () => {
    expect(servingNumber(at(0, 0))).toBe(1);
    expect(servingNumber(at(0, SERVE_MINUTES - 1))).toBe(1);
    expect(servingNumber(at(0, SERVE_MINUTES))).toBe(2);
    for (let h = 0; h < 24; h++) {
      const n = servingNumber(at(h, 30));
      expect(n).toBeGreaterThanOrEqual(1);
      expect(n).toBeLessThanOrEqual(99);
    }
  });

  it('il biglietto ha sempre da 2 a 7 persone davanti, anche a cavallo del 99', () => {
    for (const time of [at(9, 0), at(9, 54), at(23, 59)])
      for (let seed = 0; seed < 20; seed++) {
        const ahead = peopleAhead(ticketNumber(time, seed), servingNumber(time));
        expect(ahead).toBeGreaterThanOrEqual(2);
        expect(ahead).toBeLessThanOrEqual(7);
      }
    expect(peopleAhead(2, 98)).toBe(3);
  });

  it('il tabellone scrive il numero con la lettera e tre cifre', () => {
    expect(ticketLabel(7)).toBe('A007');
    expect(ticketLabel(42)).toBe('A042');
  });
});

describe('commissariato: registro dei furti', () => {
  const now = at(12, 0);
  const fact = (text: string, minutesAgo: number) => ({
    by: 'player_abcd',
    text,
    t: now - minutesAgo * 60_000,
  });

  it('elenca solo i furti col ladro sconosciuto, dal più recente', () => {
    const list = unsolvedThefts(
      [
        fact('La cassaforte di Ada è stata svuotata da un ladro misterioso 🕵️ (50 Đ)', 120),
        fact('Bea e Carlo si sono baciati 💋', 10),
        fact('La cassaforte di Dino è stata svuotata da un ladro misterioso 🕵️ (300 Đ)', 5),
      ],
      now,
    );
    expect(list).toHaveLength(2);
    expect(list[0]).toContain('Dino');
    expect(list[0]).toContain('colpevole: ignoto');
    expect(list[0]).not.toContain('🕵️');
    expect(list[1]).toContain('Ada');
  });

  it('ne mostra al massimo cinque', () => {
    const many = Array.from({ length: 8 }, (_, i) =>
      fact(`La cassaforte di P${i} è stata svuotata da un ladro misterioso 🕵️ (1 Đ)`, i),
    );
    expect(unsolvedThefts(many, now)).toHaveLength(5);
  });
});
