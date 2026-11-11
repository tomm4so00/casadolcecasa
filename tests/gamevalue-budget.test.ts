import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
// @ts-expect-error lo script è JavaScript, senza tipi
import { BUDGET_FILE, countGameValue } from '../scripts/gamevalue-budget.mjs';

// GameValue è `any`: il compilatore non controlla niente di quello che passa di lì. Ogni file ha
// un tetto (tests/gamevalue-budget.json) e il numero può solo scendere.
const budget: { total: number; files: Record<string, number> } = JSON.parse(
  readFileSync(BUDGET_FILE, 'utf8'),
);
const now: Record<string, number> = countGameValue();

describe('GameValue (any) nel codice del gioco', () => {
  it('nessun file ne ha più del suo tetto; un file nuovo non ne ha', () => {
    const higher = Object.entries(now)
      .filter(([file, n]) => n > (budget.files[file] ?? 0))
      .map(([file, n]) => `${file}: ${n} (tetto ${budget.files[file] ?? 0})`);
    expect(higher, 'usa tipi veri al posto di GameValue').toEqual([]);
  });

  it('il tetto scritto è quello vero: se un file ne ha meno, va abbassato', () => {
    const lower = Object.entries(budget.files)
      .filter(([file, max]) => (now[file] ?? 0) < max)
      .map(([file, max]) => `${file}: ${now[file] ?? 0} (tetto ${max})`);
    expect(lower, 'bene! abbassa i tetti con "npm run gamevalue:budget"').toEqual([]);
    expect(Object.values(now).reduce((a, b) => a + b, 0)).toBe(budget.total);
  });

  it('i file dei soldi e dei salvataggi non ne hanno più', () => {
    for (const file of [
      'saves',
      'economy',
      'room-economy',
      'bank-rules',
      'inventory-ledger',
      'business',
      'limited',
      'auctions',
      'used-shop',
      'roulette',
      'betting',
      'collect-offers',
      'trash',
      'realty',
      'job-server',
      'safe-pins',
    ])
      expect(now[`src/game/${file}.ts`] ?? 0, file).toBe(0);
  });
});
