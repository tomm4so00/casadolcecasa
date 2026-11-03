import { describe, expect, it } from 'vitest';
import { FURNITURE_CATALOG } from '../src/game/data/catalogues';
import {
  SAFE_LEVEL2_ID,
  SAFE_LEVEL2_PRICE,
  hashPin,
  isValidPin,
  pinHint,
  pinTooHighForLevel,
  safeLevel,
} from '../src/game/safe-pin';

describe('cassaforte a muro e livelli', () => {
  it('il negozio di mobili vende la cassaforte livello 2 a 850 €', () => {
    const def = FURNITURE_CATALOG.find((f) => f.id === SAFE_LEVEL2_ID)!;
    expect(def).toBeDefined();
    expect(def.price).toBe(850);
    expect(SAFE_LEVEL2_PRICE).toBe(850);
    expect(def.propKey).toBe('safe');
  });

  it('il livello dipende dalla cassaforte posseduta', () => {
    expect(safeLevel(undefined)).toBe(1);
    expect(safeLevel({})).toBe(1);
    expect(safeLevel({ [SAFE_LEVEL2_ID]: true })).toBe(2);
  });

  it('livello 1: cifre da 1 a 4; livello 2: anche il 5', () => {
    expect(isValidPin('134', 1)).toBe(true);
    expect(isValidPin('135', 1)).toBe(false);
    expect(isValidPin('555', 2)).toBe(true);
    expect(isValidPin('135', 2)).toBe(true);
    for (const bad of ['', '12', '1234', '106', '126', 'abc'])
      expect(isValidPin(bad, 2), bad).toBe(false);
    expect(pinHint(1)).toContain('da 1 a 4');
    expect(pinHint(2)).toContain('da 1 a 5');
  });

  it('riconosce una combinazione col 5 su una cassaforte tornata al livello 1', () => {
    expect(pinTooHighForLevel(hashPin('152', 7), 7, 1)).toBe(true);
    expect(pinTooHighForLevel(hashPin('152', 7), 7, 2)).toBe(false);
    expect(pinTooHighForLevel(hashPin('134', 7), 7, 1)).toBe(false);
    expect(pinTooHighForLevel(null, 7, 1)).toBe(false);
  });
});
