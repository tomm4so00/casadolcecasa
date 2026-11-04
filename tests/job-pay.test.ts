import { describe, expect, it } from 'vitest';
import {
  SHIFTS_PER_DAY,
  decodeWorkDay,
  jobPayTier,
  nextPayMessage,
  recordShift,
  shiftsLeftToday,
} from '../src/game/job-pay.js';

describe('paga dei turni', () => {
  it('sale di livello ogni 15 turni, con 5 livelli e aumenti piccoli', () => {
    expect(jobPayTier(1)).toMatchObject({ base: 40, perItem: 5 });
    expect(jobPayTier(15)).toMatchObject({ base: 40, perItem: 5 });
    expect(jobPayTier(16)).toMatchObject({ base: 45, perItem: 6 });
    expect(jobPayTier(31)).toMatchObject({ base: 50, perItem: 7 });
    expect(jobPayTier(46)).toMatchObject({ base: 55, perItem: 8 });
    expect(jobPayTier(61)).toMatchObject({ base: 60, perItem: 9 });
    expect(jobPayTier(200)).toMatchObject({ base: 60, perItem: 9 });
  });

  it('spiega quanti turni mancano al prossimo aumento', () => {
    expect(nextPayMessage(1)).toContain('Ancora 14 turni');
    expect(nextPayMessage(14)).toContain('Ancora 1 turno ');
    expect(nextPayMessage(15)).toContain('Dal prossimo turno guadagni 45 € + 6 €');
    expect(nextPayMessage(15)).toContain('Ancora 15 turni');
    expect(nextPayMessage(60)).toContain('Dal prossimo turno guadagni 60 € + 9 €');
    expect(nextPayMessage(60)).toContain('paga massima');
    expect(nextPayMessage(75)).not.toContain('Dal prossimo turno');
  });
});

describe('turni al giorno', () => {
  const at = (d: number, h: number) => new Date(2026, 10, d, h, 0);

  it('si va al lavoro al massimo 4 volte al giorno, poi si riparte a mezzanotte', () => {
    expect(SHIFTS_PER_DAY).toBe(4);
    let s = undefined;
    for (let i = 0; i < 4; i++) {
      expect(shiftsLeftToday(s, at(3, 9 + i))).toBe(4 - i);
      s = recordShift(s, at(3, 9 + i));
    }
    expect(shiftsLeftToday(s, at(3, 23))).toBe(0);
    expect(shiftsLeftToday(s, at(4, 0))).toBe(4);
    expect(recordShift(s, at(4, 8))).toEqual({ day: '2026-11-04', count: 1 });
  });

  it('il salvataggio scarta i valori non validi', () => {
    expect(decodeWorkDay({ day: '2026-11-03', count: 2 })).toEqual({ day: '2026-11-03', count: 2 });
    expect(decodeWorkDay({ day: 'ieri', count: 2 })).toBeUndefined();
    expect(decodeWorkDay({ day: '2026-11-03', count: -1 })).toBeUndefined();
    expect(decodeWorkDay(null)).toBeUndefined();
  });
});
