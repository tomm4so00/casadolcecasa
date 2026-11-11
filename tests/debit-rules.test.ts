import { describe, expect, it } from 'vitest';
import {
  DEBIT_MAX,
  DEBIT_MS,
  decodeDebit,
  grantDebit,
  reduceDebit,
  useDebit,
} from '../shared/debit-rules';

const now = 1_800_000_000_000;

describe('permesso di addebito', () => {
  it('legge solo permessi validi e non scaduti', () => {
    expect(decodeDebit({ amt: 300, t: now }, now)).toEqual({ amt: 300, t: now });
    expect(decodeDebit({ amt: 300, t: now - DEBIT_MS }, now)).toBeNull();
    expect(decodeDebit({ amt: 0, t: now }, now)).toBeNull();
    expect(decodeDebit({ amt: 2.5, t: now }, now)).toBeNull();
    expect(decodeDebit({ amt: DEBIT_MAX + 1, t: now }, now)).toBeNull();
    expect(decodeDebit(null, now)).toBeNull();
    expect(decodeDebit('300', now)).toBeNull();
  });

  it('le offerte si sommano e rinnovano la data, fino al massimo', () => {
    expect(grantDebit(null, 100, now)).toEqual({ amt: 100, t: now });
    expect(grantDebit({ amt: 100, t: now - 1000 }, 50, now)).toEqual({ amt: 150, t: now });
    expect(grantDebit({ amt: 100, t: now - DEBIT_MS }, 50, now)).toEqual({ amt: 50, t: now });
    expect(grantDebit({ amt: DEBIT_MAX, t: now }, 5, now)?.amt).toBe(DEBIT_MAX);
    expect(grantDebit(null, 0, now)).toBeNull();
    expect(grantDebit(null, -5, now)).toBeNull();
  });

  it("un'offerta ritirata toglie la sua parte, senza toccare la data", () => {
    expect(reduceDebit({ amt: 150, t: now - 10 }, 50, now)).toEqual({ amt: 100, t: now - 10 });
    expect(reduceDebit({ amt: 50, t: now }, 50, now)).toBeNull();
    expect(reduceDebit({ amt: 50, t: now }, 80, now)).toBeNull();
    expect(reduceDebit(null, 50, now)).toBeNull();
  });

  it('chi accetta prende quanto copre il permesso, una volta', () => {
    expect(useDebit({ amt: 300, t: now - 10 }, 100, now)).toEqual({ amt: 200, t: now - 10 });
    expect(useDebit({ amt: 300, t: now }, 300, now)).toBeNull();
    expect(useDebit({ amt: 300, t: now }, 301, now)).toBe(false);
    expect(useDebit({ amt: 300, t: now - DEBIT_MS }, 100, now)).toBe(false);
    expect(useDebit(undefined, 1, now)).toBe(false);
    expect(useDebit({ amt: 300, t: now }, 0, now)).toBe(false);
  });
});
