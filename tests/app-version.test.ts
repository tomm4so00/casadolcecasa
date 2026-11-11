import { describe, expect, it } from 'vitest';
import { updateAvailable, versionNumber } from '../shared/app-version.js';
import { announceOnlineVersion } from '../server/src/app-version.js';
import { localDatabase } from '../src/game/database.js';
import { Lifetime } from '../src/game/lifetime.js';
import { MemoryStorage } from './helpers.js';
import { version } from '../package.json';

describe('banner "Nuova versione!"', () => {
  it('la versione diventa un numero che si confronta', () => {
    expect(versionNumber('0.30.0')).toBe(30_000);
    expect(versionNumber('0.30.1')).toBeGreaterThan(versionNumber('0.30.0'));
    expect(versionNumber('1.0.0')).toBeGreaterThan(versionNumber('0.99.99'));
    expect(versionNumber('boh')).toBe(0);
    expect(versionNumber(null)).toBe(0);
  });

  it('il banner compare solo a chi ha una versione più vecchia di quella online', () => {
    expect(updateAvailable(versionNumber('0.31.0'), '0.30.0')).toBe(true);
    expect(updateAvailable(versionNumber('0.30.0'), '0.30.0')).toBe(false);
    expect(updateAvailable(versionNumber('0.29.0'), '0.30.0')).toBe(false);
    expect(updateAvailable(null, '0.30.0')).toBe(false);
    // la versione di questo gioco si legge bene
    expect(versionNumber(version)).toBeGreaterThan(0);
  });

  it('il server annuncia la versione online, solo in salita, e dà la spinta ai vecchi una volta', async () => {
    const db = localDatabase(new Lifetime(), new MemoryStorage());
    await db.ref('sims_meta/version').set(8);
    expect(await announceOnlineVersion(db, async () => '0.30.0')).toBe(30_000);
    expect((await db.ref('sims_meta').get()).val()).toEqual({ app: 30_000, version: 9 });
    // una versione più vecchia (sito in cache) non torna indietro
    await announceOnlineVersion(db, async () => '0.29.0');
    expect((await db.ref('sims_meta/app').get()).val()).toBe(30_000);
    // sito che non risponde: niente
    expect(await announceOnlineVersion(db, async () => null)).toBe(0);
    await announceOnlineVersion(db, async () => '0.31.2');
    expect((await db.ref('sims_meta').get()).val()).toEqual({ app: 31_002, version: 9 });
  });

  it('prima della 0.30.0 non si spinge nessuno', async () => {
    const db = localDatabase(new Lifetime(), new MemoryStorage());
    await db.ref('sims_meta/version').set(8);
    await announceOnlineVersion(db, async () => '0.29.0');
    expect((await db.ref('sims_meta/version').get()).val()).toBe(8);
  });
});
