import { describe, expect, it } from 'vitest';
import { jobPayTier, nextPayMessage } from '../src/game/job-pay.js';

describe('paga dei turni', () => {
  it('dà 1 € per oggetto nei primi 30 turni, 2 € fino al 60° e 3 € dopo', () => {
    expect(jobPayTier(1)).toMatchObject({ base: 50, perItem: 1 });
    expect(jobPayTier(30)).toMatchObject({ base: 50, perItem: 1 });
    expect(jobPayTier(31)).toMatchObject({ base: 80, perItem: 2 });
    expect(jobPayTier(60)).toMatchObject({ base: 80, perItem: 2 });
    expect(jobPayTier(61)).toMatchObject({ base: 120, perItem: 3 });
  });

  it('spiega quanti turni mancano al prossimo aumento', () => {
    expect(nextPayMessage(1)).toContain('Ancora 29 turni');
    expect(nextPayMessage(29)).toContain('Ancora 1 turno ');
    expect(nextPayMessage(30)).toContain('Dal prossimo turno guadagni 80 €');
    expect(nextPayMessage(30)).toContain('Ancora 30 turni');
    expect(nextPayMessage(60)).toContain('Dal prossimo turno guadagni 120 €');
    expect(nextPayMessage(60)).toContain('paga massima');
    expect(nextPayMessage(75)).not.toContain('Dal prossimo turno');
  });
});
