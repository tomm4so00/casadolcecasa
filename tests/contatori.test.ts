import { describe, expect, it } from 'vitest';
// @ts-expect-error lo script è JavaScript, senza tipi
import { ranking } from '../scripts/contatori.mjs';

const NOW = Date.UTC(2026, 10, 20, 12, 0, 0); // 20 novembre a Roma
const usage = {
  '2026-11-20': { 'posto:bar': { n: 30, p: 7 }, roulette: { n: 2, p: 1 } },
  '2026-11-15': { 'posto:bar': { n: 10, p: 7 }, 'posto:luna': { n: 1, p: 1 } },
  // la settimana prima
  '2026-11-10': { 'posto:bar': { n: 20, p: 5 }, roulette: { n: 8, p: 3 } },
  // troppo vecchio: non conta
  '2026-10-01': { 'posto:bar': { n: 999, p: 99 } },
};

describe('classifica settimanale dei contatori', () => {
  it('somma i 7 giorni, confronta con i 7 prima e ordina dal più usato', () => {
    const rows = ranking(usage, NOW);
    expect(rows.map((r: { what: string }) => r.what)).toEqual([
      'posto:bar',
      'roulette',
      'posto:luna',
    ]);
    expect(rows[0]).toMatchObject({
      kind: 'posto',
      name: 'bar',
      n: 40,
      prev: 20,
      change: 100,
      players: 2,
    });
    expect(rows[1]).toMatchObject({ kind: 'funzione', n: 2, prev: 8, change: -75 });
    // mai vista prima: "nuovo"
    expect(rows[2]).toMatchObject({ name: 'luna', n: 1, prev: 0, change: null });
  });

  it('senza dati la classifica è vuota', () => {
    expect(ranking({}, NOW)).toEqual([]);
  });
});
