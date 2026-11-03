import fs from 'node:fs';
import { describe, expect, it } from 'vitest';
import {
  THEFT_LOCK_MS,
  decodeTheftRecord,
  recordTheftAttempt,
  theftLockLeft,
  theftTriesLeft,
} from '../src/game/theft-rules.js';

describe('tentativi di furto', () => {
  const t0 = 1_800_000_000_000;

  it('3 tentativi, poi allarme per 24 ore dal primo', () => {
    let r = null;
    for (let i = 0; i < 3; i++) {
      expect(theftTriesLeft(r, t0 + i * 1000)).toBe(3 - i);
      r = recordTheftAttempt(r, t0 + i * 1000);
    }
    expect(r).toEqual({ n: 3, since: t0 });
    expect(theftTriesLeft(r, t0 + 5000)).toBe(0);
    expect(recordTheftAttempt(r, t0 + 5000)).toBeNull();
    expect(theftLockLeft(r, t0 + 3600e3)).toBe(THEFT_LOCK_MS - 3600e3);
    // il giorno dopo si può riprovare
    expect(theftTriesLeft(r, t0 + THEFT_LOCK_MS)).toBe(3);
    expect(recordTheftAttempt(r, t0 + THEFT_LOCK_MS)).toEqual({ n: 1, since: t0 + THEFT_LOCK_MS });
  });

  it('legge i dati salvati scartando quelli non validi', () => {
    expect(decodeTheftRecord({ n: 2, since: t0 })).toEqual({ n: 2, since: t0 });
    expect(decodeTheftRecord({ n: 'x', since: t0 })).toBeNull();
    expect(decodeTheftRecord(null)).toBeNull();
  });

  it('le regole impediscono di azzerare i tentativi prima delle 24 ore', () => {
    const rules = JSON.parse(
      fs.readFileSync('firebase/database.rules.proposed.json', 'utf8'),
    ).rules;
    const node = rules.sims_theft.$pid.$room;
    expect(node['.write']).toContain('newData.exists()');
    expect(node['.validate']).toContain("newData.child('n').val() === data.child('n').val() + 1");
    expect(node['.validate']).toContain('86400000');
  });
});
