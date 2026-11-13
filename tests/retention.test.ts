import { describe, expect, it } from 'vitest';
import {
  NO_SOURCE,
  markActive,
  retentionBySource,
  retentionBySourceText,
  retentionReport,
  retentionTelegramText,
  type RetentionEntry,
} from '../shared/retention-rules';
import {
  sendRetentionReport,
  trackRetention,
  type RetentionDatabase,
} from '../server/src/retention';

// ora di Roma = UTC+1 a novembre
const at = (month: number, day: number, hour = 12) => Date.UTC(2026, month - 1, day, hour - 1);

function fakeDb(data: Record<string, unknown>): RetentionDatabase {
  return {
    ref: (path) => ({
      get: async () => ({ val: () => data[path] ?? null }),
      set: async (v) => {
        data[path] = v;
      },
      update: async (v) => {
        data[path] = { ...((data[path] as object) || {}), ...v };
      },
    }),
  };
}

const entry = (c: string, ...days: number[]): RetentionEntry => ({
  c,
  a: Object.fromEntries(days.map((d) => [String(d), 1])),
});

describe('ritenzione: i giorni giocati', () => {
  it("segna il primo giorno e il giorno dell'ultimo accesso, a Roma", () => {
    expect(markActive(null, at(11, 3), at(11, 4))).toEqual(entry('2026-11-03', 0, 1));
    // mezzanotte a Roma è ancora il giorno prima in UTC: conta il giorno di Roma
    expect(markActive(null, at(11, 3, 23), at(11, 4, 0))?.a).toEqual({ '0': 1, '1': 1 });
    // niente di nuovo: null, così non si riscrive
    expect(markActive(entry('2026-11-03', 0, 1), at(11, 3), at(11, 4))).toBeNull();
    expect(markActive(entry('2026-11-03', 0, 1), at(11, 3), at(11, 10))?.a).toEqual({
      '0': 1,
      '1': 1,
      '7': 1,
    });
  });

  it('il server segna gli account e il giorno da cui conta', async () => {
    const data: Record<string, unknown> = {};
    const db = fakeDb(data);
    const n = await trackRetention(
      db,
      [
        { uid: 'a', created: at(11, 12), lastActive: at(11, 12) },
        { uid: 'b', created: at(10, 1), lastActive: at(11, 12) },
        { uid: 'c', created: 0, lastActive: 0 },
      ],
      at(11, 12),
    );
    expect(n).toBe(2);
    expect(data['sims_meta/retentionSince']).toBe('2026-11-12');
    expect((data.sims_retention as Record<string, RetentionEntry>).b.a).toEqual({
      '0': 1,
      '42': 1,
    });
    // al giro dopo, senza novità, non si scrive niente
    expect(
      await trackRetention(
        db,
        [{ uid: 'a', created: at(11, 12), lastActive: at(11, 12) }],
        at(11, 12),
      ),
    ).toBe(0);
  });
});

describe('ritenzione: il resoconto', () => {
  // si segna dal 2 novembre; il resoconto è della settimana 14–20 dicembre
  const raw = {
    // iniziati la settimana del 2 novembre: 2, uno torna il giorno dopo e dopo 30 giorni
    a: entry('2026-11-02', 0, 1, 31),
    b: entry('2026-11-04', 0),
    // la settimana del 9: uno torna dopo 8 giorni
    c: entry('2026-11-09', 0, 8),
    // iniziato prima che si segnasse: non entra nelle settimane, ma conta negli attivi
    old: entry('2026-10-01', 0, 75),
    // nuovo della settimana del resoconto
    d: entry('2026-12-15', 0),
  };

  it("attivi, nuovi e chi torna per settimana d'inizio", () => {
    const r = retentionReport(raw, '2026-12-20', '2026-11-02');
    expect(r).toMatchObject({ from: '2026-12-14', to: '2026-12-20' });
    // old ha giocato il 15/12 (1/10 + 75 giorni), d è nuovo
    expect(r).toMatchObject({ active: 2, newPlayers: 1, returning: 1 });
    const byWeek = Object.fromEntries(r.cohorts.map((c) => [c.week, c]));
    expect(byWeek['2026-11-02']).toEqual({ week: '2026-11-02', size: 2, back: [1, 0, 1] });
    expect(byWeek['2026-11-09'].back).toEqual([0, 1, 0]);
    // la settimana del resoconto: giorno 7 e 30 non sono ancora finiti
    expect(byWeek['2026-12-14'].back).toEqual([0, null, null]);
    expect(byWeek['2026-10-01']).toBeUndefined();
  });

  it('il messaggio per Telegram', () => {
    const text = retentionTelegramText(retentionReport(raw, '2026-12-20', '2026-11-02'));
    expect(text).toContain('dal 14/12 al 20/12');
    expect(text).toContain('Attivi: <b>2</b> (1 nuovi, 1 di ritorno)');
    expect(text).toContain('09/11–15/11: <b>1</b> nuovi → giorno 1: 0 (0%) · giorno 7: 1 (100%)');
  });

  it('il lunedì, una volta sola; la prima volta si segna soltanto', async () => {
    const data: Record<string, unknown> = {
      'sims_meta/retentionSince': '2026-11-02',
      sims_retention: raw,
    };
    const db = fakeDb(data);
    const sent: string[] = [];
    const send = async (t: string) => (sent.push(t), true);
    expect(await sendRetentionReport(db, at(12, 21, 10), send)).toBeNull();
    expect(data['sims_meta/retentionReport']).toBe('2026-12-21');
    expect(await sendRetentionReport(db, at(12, 28, 8), send)).toBeNull();
    expect(await sendRetentionReport(db, at(12, 28, 9), send)).toBe('2026-12-28');
    expect(await sendRetentionReport(db, at(12, 28, 11), send)).toBeNull();
    expect(sent).toHaveLength(1);
    expect(sent[0]).toContain('📈 <b>Ritenzione</b>');
  });
});

describe('ritenzione per provenienza (?da=itch…)', () => {
  it('divide i nuovi per il link con cui sono arrivati', () => {
    const raw = {
      a: { c: '2026-11-02', a: { 0: 1, 1: 1 } },
      b: { c: '2026-11-03', a: { 0: 1 } },
      c: { c: '2026-11-04', a: { 0: 1, 1: 1, 8: 1 } },
      // iniziato da poco: conta per il giorno 1, non ancora per il giorno 7
      d: { c: '2026-11-15', a: { 0: 1 } },
    };
    const sources = { a: 'itch', b: 'itch', d: 'itch' };
    const rows = retentionBySource(raw, sources, '2026-11-20', '2026-11-01');
    expect(rows.map((r) => r.source)).toEqual(['itch', NO_SOURCE]);
    expect(rows[0].size).toBe(3);
    expect(rows[0].back[0]).toEqual({ n: 1, of: 3 });
    expect(rows[1].back[1]).toEqual({ n: 1, of: 1 });
    expect(retentionBySourceText(rows)).toContain('itch: <b>3</b> → giorno 1: 1 su 3 (33%)');
    // solo account senza link: niente righe nel messaggio
    expect(retentionBySourceText(retentionBySource(raw, {}, '2026-11-15', '2026-11-01'))).toBe('');
  });
});
