import { describe, expect, it } from 'vitest';
import {
  DEALERS,
  dealerOffer,
  policeSuspicious,
  raidOfDay,
  streetRole,
} from '../src/game/dealer-rules';

describe('poliziotto durante la retata', () => {
  it('sostituisce un solo spacciatore anche fuori orario, mentre gli altri vendono al doppio', () => {
    for (const place of ['bar', 'discoteca', 'passeggiata'] as const) {
      let raid = null;
      for (let day = 20_000; !raid; day++) {
        const candidate = raidOfDay('CASA-0001', day);
        if (candidate?.place === place) raid = candidate;
      }
      const now = raid.start + 1;
      expect(streetRole(place, 'CASA-0001', now, 8)).toBe('police');
      for (const id of Object.keys(DEALERS) as (keyof typeof DEALERS)[]) {
        const dealer = DEALERS[id];
        if (dealer.place === place) continue;
        expect(streetRole(dealer.place, 'CASA-0001', now, dealer.from)).toBe('dealer');
        const offer = dealerOffer(id, 'CASA-0001', now, dealer.from, 20, 0, {});
        expect(offer.present).toBe(true);
        expect(offer.price).toBe(Math.round(20 * dealer.markup * 2));
        expect(streetRole(dealer.place, 'CASA-0001', now, 8)).toBe('absent');
      }
      expect(streetRole(place, 'CASA-0001', raid.end, 8)).toBe('absent');
    }
  });

  it('insegue solo dalla soglia di 10 grammi o 3 pillole', () => {
    expect(policeSuspicious(9, 2)).toBe(false);
    expect(policeSuspicious(10, 0)).toBe(true);
    expect(policeSuspicious(0, 3)).toBe(true);
  });
});
