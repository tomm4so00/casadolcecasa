import { describe, expect, it } from 'vitest';
import { MIN_AGE, termsToAsk } from '../src/game/terms-rules';

describe('età e condizioni', () => {
  it('si gioca solo da maggiorenni', () => {
    expect(MIN_AGE).toBe(18);
  });
  it('chi non ha mai confermato conferma la prima volta', () => {
    expect(termsToAsk(undefined, undefined)).toBe('first');
    expect(termsToAsk(0, 0)).toBe('first');
  });
  it('chi aveva confermato i 14 anni conferma di nuovo, una volta', () => {
    expect(termsToAsk(1_700_000_000_000, undefined)).toBe('adult');
  });
  it('chi ha confermato i 18 anni non vede più niente', () => {
    expect(termsToAsk(1_700_000_000_000, 1_800_000_000_000)).toBe('none');
    expect(termsToAsk(undefined, 1_800_000_000_000)).toBe('none');
  });
});
