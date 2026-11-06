import { describe, expect, it } from 'vitest';
import {
  BOSS_REQUESTS,
  BOSS_VISIT_SECONDS,
  THIRST_SECONDS,
  bossBonus,
  bossFine,
  bossPlan,
  bossRequestSeconds,
  bossRequests,
  printGap,
  thirstAfter,
} from '../src/game/office-rules';

/** Numeri "a caso" presi da una lista, per i test. */
const seq = (...xs: number[]) => {
  let i = 0;
  return () => xs[i++ % xs.length];
};

describe('turno in ufficio', () => {
  it('la sete si svuota in THIRST_SECONDS e non scende sotto zero', () => {
    expect(thirstAfter(1, THIRST_SECONDS / 2)).toBeCloseTo(0.5);
    expect(thirstAfter(0.1, THIRST_SECONDS)).toBe(0);
  });

  it('le stampe dei colleghi arrivano ogni 12-22 secondi, in parallelo ai compiti', () => {
    expect(printGap(0)).toBe(12);
    expect(printGap(1)).toBe(22);
  });

  it('il capo arriva di rado, nella prima metà del turno, e se ne va prima della fine', () => {
    expect(bossPlan(0.1, 0, 80)).toEqual({ comes: true, at: 20 });
    expect(bossPlan(0.3, 0, 80).comes).toBe(false);
    expect(bossPlan(0.1, 1, 80).at + BOSS_VISIT_SECONDS).toBeLessThan(80);
  });

  it('il capo chiede gli oggetti della stanza e al massimo un foglio, senza doppioni', () => {
    const reqs = bossRequests(['penna', 'busta', 'graffette'], seq(0.9, 0.1, 0.1, 0.5));
    expect(reqs).toEqual([
      { kind: 'item', id: 'graffette' },
      { kind: 'print' },
      { kind: 'item', id: 'penna' },
    ]);
    expect(reqs).toHaveLength(BOSS_REQUESTS);
    // senza oggetti nella stanza resta solo il foglio
    expect(bossRequests([], seq(0.9))).toEqual([{ kind: 'print' }]);
  });

  it('per un foglio da stampare dà più tempo che per un oggetto', () => {
    expect(bossRequestSeconds({ kind: 'print' })).toBeGreaterThan(
      bossRequestSeconds({ kind: 'item', id: 'penna' }),
    );
  });

  it('accontentare il capo vale tre consegne, deluderlo ne costa due', () => {
    expect(bossBonus(5)).toBe(15);
    expect(bossFine(5)).toBe(10);
  });
});
