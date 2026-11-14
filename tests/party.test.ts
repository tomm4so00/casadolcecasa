import { afterEach, describe, expect, it } from 'vitest';
import {
  decodeParties,
  forceParty,
  nextPartyText,
  partyAt,
  partyCount,
  partyDayText,
  partySoon,
} from '../src/game/party-rules';
import { autoplayAt, type AutoplayInfo } from '../src/game/autoplay-rules';

// novembre: Roma è un'ora avanti rispetto a UTC (le 21 sono le 20 UTC)
const at = (day: number, h: number, m = 0) => Date.UTC(2026, 10, day, h - 1, m);
// sabato 14, domenica 15, martedì 17, venerdì 20

afterEach(() => forceParty(null));

describe('festa del condominio', () => {
  it('martedì, venerdì e domenica dalle 21 alle 21:30, ora italiana', () => {
    expect(partyAt(at(15, 21))).toEqual({ id: '2026-11-15', left: 30 * 60_000 });
    expect(partyAt(at(17, 21, 29))?.id).toBe('2026-11-17');
    expect(partyAt(at(20, 21, 10))?.left).toBe(20 * 60_000);
    expect(partyAt(at(17, 21, 30))).toBeNull();
    expect(partyAt(at(17, 20, 59))).toBeNull();
    // sabato e lunedì niente festa
    expect(partyAt(at(14, 21, 5))).toBeNull();
    expect(partyAt(at(16, 21, 5))).toBeNull();
    // d'estate Roma è due ore avanti: la festa resta alle 21 italiane
    expect(partyAt(Date.UTC(2027, 6, 2, 19, 5))?.id).toBe('2027-07-02');
  });

  it('avvisa nel quarto d’ora prima', () => {
    expect(partySoon(at(17, 20, 45))).toEqual({ id: '2026-11-17', minutes: 15 });
    expect(partySoon(at(17, 20, 59))?.minutes).toBe(1);
    expect(partySoon(at(17, 20, 44))).toBeNull();
    expect(partySoon(at(17, 21))).toBeNull();
    expect(partySoon(at(16, 20, 50))).toBeNull();
  });

  it('dice quando è la prossima', () => {
    expect(nextPartyText(at(17, 21, 5))).toBe('adesso');
    expect(nextPartyText(at(17, 10))).toBe('stasera alle 21');
    expect(nextPartyText(at(16, 10))).toBe('domani alle 21');
    expect(nextPartyText(at(17, 22))).toBe('venerdì alle 21');
    expect(nextPartyText(at(14, 12))).toBe('domani alle 21');
    expect(nextPartyText(at(18, 9))).toBe('venerdì alle 21');
  });

  it('si può far partire subito, per provarla', () => {
    const now = at(16, 15);
    expect(partyAt(now)).toBeNull();
    forceParty(now);
    expect(partyAt(now + 60_000)?.id).toBe('2026-11-16');
    expect(partyAt(now + 31 * 60_000)).toBeNull();
  });

  it('spille: date valide, senza doppioni; il conteggio della stanza resta nei limiti', () => {
    expect(decodeParties(['2026-11-20', 'x', '2026-11-17', '2026-11-20', 3])).toEqual([
      '2026-11-17',
      '2026-11-20',
    ]);
    expect(decodeParties(null)).toEqual([]);
    expect(partyDayText('2026-11-20')).toBe('20 novembre');
    expect(partyCount(7)).toBe(7);
    expect(partyCount(-3)).toBe(0);
    expect(partyCount('8')).toBe(0);
  });

  it('alla festa i personaggi offline scendono in cortile', () => {
    const info: AutoplayInfo = {
      pid: 'player_abc',
      offAt: at(17, 18),
      bedAt: 0,
      need: 80,
    };
    const view = autoplayAt(info, at(17, 21, 10));
    expect(view.kind).toBe('place');
    if (view.kind === 'place') {
      expect(view.place).toBe('festa');
      expect(view.env).toBe('CORTILE');
    }
    // prima della festa no
    const before = autoplayAt(info, at(17, 20, 0));
    expect(before.kind === 'place' && before.place === 'festa').toBe(false);
  });
});
