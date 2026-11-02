import { describe, it, expect } from 'vitest';
import { prepareMarketRules } from '../shared/market-rules.js';

describe('market rules migration', () => {
  it('removes an inherited root grant and preserves access to legacy tables', () => {
    const original = {
      rules: { '.read': true, '.write': 'auth != null', sims_saves: { '.indexOn': ['savedAt'] } },
    };
    const proposed = prepareMarketRules(original);
    expect(proposed.rules['.write']).toBe(false);
    expect(proposed.rules.sims_market).toEqual({
      '.read': true,
      '.write': "auth != null && auth.uid === 'market-publisher'",
    });
    expect(proposed.rules.sims_saves).toEqual({
      '.indexOn': ['savedAt'],
      '.write': '(auth != null) || (false)',
    });
    expect(original.rules['.write']).toBe('auth != null');
  });
  it('requires manual review when moving a root condition would change its meaning', () => {
    expect(() => prepareMarketRules({ rules: { '.write': 'newData.exists()' } })).toThrow(
      'merge manually',
    );
  });
});
