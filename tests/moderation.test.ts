import { describe, expect, it } from 'vitest';
import {
  AUTO_MUTE_MS,
  FOREVER,
  autoMutes,
  listReports,
  reportTelegramText,
  reportersOf,
  untilText,
} from '../shared/moderation-rules';
import { moderate } from '../server/src/moderation';
import { localDatabase } from '../src/game/database.js';
import { Lifetime } from '../src/game/lifetime.js';
import { MemoryStorage } from './helpers.js';

const NOW = 1_800_000_000_000;
const H = 3_600_000;
const rep = (t: number, reason = 'odio', extra = {}) => ({
  name: 'Mario',
  reason,
  world: 'CASA-0001',
  t,
  msgs: { 0: { text: 'brutto', t: 1 } },
  ...extra,
});

describe('moderazione: regole', () => {
  it('conta le persone diverse delle ultime 24 ore', () => {
    const reports = listReports({
      p1: { mario: rep(NOW - H) },
      p2: { mario: rep(NOW - 2 * H), luca: rep(NOW - H) },
      p3: { mario: rep(NOW - 30 * H) },
    });
    expect(reportersOf(reports, 'mario', NOW)).toBe(2);
    expect(reportersOf(reports, 'luca', NOW)).toBe(1);
  });

  it('silenzia da solo con 3 persone in 24 ore, una volta sola', () => {
    const three = listReports({
      p1: { mario: rep(NOW - H) },
      p2: { mario: rep(NOW - 2 * H) },
      p3: { mario: rep(NOW - 3 * H) },
    });
    expect(autoMutes(three, {}, NOW)).toEqual(['mario']);
    // già silenziato: niente
    expect(autoMutes(three, { mario: { until: NOW + H, t: NOW - H, why: 'auto' } }, NOW)).toEqual(
      [],
    );
    // il moderatore ha tolto il silenzio: le segnalazioni di prima non lo fanno ripartire
    expect(autoMutes(three, { mario: { until: NOW, t: NOW, why: 'tolto' } }, NOW + 1)).toEqual([]);
  });

  it('l’avviso sul gruppo non dice chi ha segnalato né i messaggi', () => {
    const text = reportTelegramText('Mario <3', ['odio', 'odio', 'spam'], 2);
    expect(text).toContain('Mario &lt;3');
    expect(text).toContain('Odio');
    expect(text).toContain('Spam');
    expect(text).toContain('2 persone');
    expect(text).not.toContain('brutto');
  });

  it('per sempre si scrive così', () => {
    expect(untilText(FOREVER)).toBe('per sempre');
    expect(untilText(NOW)).toMatch(/^fino alle \d\d:\d\d del \d\d\/\d\d$/);
  });
});

describe('moderazione: il giro del server', () => {
  async function setup() {
    const database = localDatabase(new Lifetime(), new MemoryStorage());
    await database.ref('').update({
      sims_accounts: { uidMario: { playerId: 'mario' }, uidLuca: { playerId: 'luca' } },
      sims_reports: {
        p1: { mario: rep(NOW - H) },
        p2: { mario: rep(NOW - 2 * H, 'spam') },
        p3: { mario: rep(NOW - 3 * H) },
      },
    });
    const sent: string[] = [];
    const switched: [string, boolean][] = [];
    const accounts = {
      async setDisabled(uid: string, disabled: boolean) {
        switched.push([uid, disabled]);
        return true;
      },
    };
    const telegram = async (html: string) => {
      sent.push(html);
      return true;
    };
    return { database, sent, switched, accounts, telegram };
  }

  it('manda le segnalazioni una volta e silenzia per 24 ore', async () => {
    const { database, sent, accounts, telegram } = await setup();
    const first = await moderate(database, NOW, telegram, accounts);
    expect(first.sent).toBe(3);
    expect(first.muted).toEqual(['mario']);
    expect(sent).toHaveLength(2);
    expect(sent[0]).toContain('3 persone');
    expect(sent[1]).toContain('silenziato per 24 ore');
    const mute = (await database.ref('sims_mutes/mario').get()).val();
    expect(mute).toEqual({ until: NOW + AUTO_MUTE_MS, t: NOW, why: 'auto' });
    // al giro dopo non si rimanda niente
    const again = await moderate(database, NOW + 60_000, telegram, accounts);
    expect(again.sent).toBe(0);
    expect(again.muted).toEqual([]);
    expect(sent).toHaveLength(2);
  });

  it('sospende, riattiva alla scadenza, e cancella i minorenni', async () => {
    const { database, switched, accounts } = await setup();
    await database.ref('sims_bans').set({
      mario: { until: NOW + H, t: NOW, why: 'moderatore' },
      luca: { until: FOREVER, t: NOW, why: 'minore', del: true },
    });
    const r = await moderate(database, NOW, null, accounts);
    expect(r.banned).toBe(1);
    expect(r.deletions).toBe(1);
    expect(switched).toEqual([['uidMario', true]]);
    expect((await database.ref('sims_deletions/uidLuca').get()).val()).toMatchObject({ at: NOW });
    expect((await database.ref('sims_bans/luca').get()).val()).toBeNull();
    // scaduta la sospensione l'accesso torna
    const later = await moderate(database, NOW + 2 * H, null, accounts);
    expect(later.restored).toBe(1);
    expect(switched).toEqual([
      ['uidMario', true],
      ['uidMario', false],
    ]);
  });
});
