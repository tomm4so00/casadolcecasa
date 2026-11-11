import { describe, expect, it } from 'vitest';
import { pruneReports } from '../server/src/maintenance.js';
import { REPORT_KEEP_DAYS } from '../shared/block-rules.js';
import { localDatabase } from '../src/game/database.js';
import { Lifetime } from '../src/game/lifetime.js';
import { MemoryStorage } from './helpers.js';

const NOW = 1_800_000_000_000;
const DAY = 86_400_000;

describe('le segnalazioni restano 6 mesi', () => {
  it('la manutenzione toglie solo quelle più vecchie', async () => {
    const database = localDatabase(new Lifetime(), new MemoryStorage());
    const r = (t: number) => ({ name: 'X', reason: 'spam', world: 'CASA-0001', t });
    await database.ref('sims_reports').set({
      p1: { p2: r(NOW - DAY), p3: r(NOW - (REPORT_KEEP_DAYS + 1) * DAY) },
      p4: { p2: r(NOW - (REPORT_KEEP_DAYS - 1) * DAY), p5: { name: 'rotta' } },
    });
    expect(await pruneReports(database, NOW)).toBe(2);
    const left = (await database.ref('sims_reports').get()).val();
    expect(Object.keys(left.p1)).toEqual(['p2']);
    expect(Object.keys(left.p4)).toEqual(['p2']);
    expect(await pruneReports(database, NOW)).toBe(0);
  });
});
