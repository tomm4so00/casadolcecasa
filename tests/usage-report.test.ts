import { describe, expect, it } from 'vitest';
import { ranking, reportWeek, usageReportText } from '../shared/usage-rules';
import { sendUsageReport, type UsageReportDatabase } from '../server/src/usage-report';

// lunedì 16 novembre 2026, ora di Roma = UTC+1
const at = (day: number, hour: number) => Date.UTC(2026, 10, day, hour - 1, 0, 0);

describe('resoconto settimanale dei contatori', () => {
  it('parte dalle 9 del lunedì e copre la settimana da lunedì a domenica', () => {
    expect(reportWeek(at(16, 8))).toBeNull();
    const due = reportWeek(at(16, 9));
    expect(due?.week).toBe('2026-11-16');
    expect(new Date(due!.end).toISOString().slice(0, 10)).toBe('2026-11-15');
    // il martedì è la stessa settimana: se il lunedì è saltato, parte allora
    expect(reportWeek(at(17, 10))?.week).toBe('2026-11-16');
    expect(reportWeek(at(15, 23))?.week).toBe('2026-11-09');
  });

  it('scrive posti e funzioni con usi, variazione e giocatori', () => {
    const usage = {
      '2026-11-15': { 'posto:saloon': { n: 30, p: 7 }, roulette: { n: 2, p: 1 } },
      '2026-11-05': { 'posto:saloon': { n: 20, p: 5 } },
      '2026-11-16': { 'posto:saloon': { n: 999, p: 99 } },
    };
    const end = reportWeek(at(16, 9))!.end;
    const text = usageReportText(ranking(usage, end), end);
    expect(text).toContain('dal 09/11 al 15/11');
    expect(text).toContain('saloon — <b>30</b> (+50%) · 1 gioc./giorno');
    expect(text).toContain('⚙️ <b>Funzioni</b>\nroulette — <b>2</b> (nuovo)');
    expect(usageReportText([], end)).toContain('Nessun uso registrato');
  });

  it('una volta sola a settimana, e la prima volta si segna soltanto', async () => {
    const data: Record<string, unknown> = {
      sims_usage: { '2026-11-15': { chat: { n: 4, p: 2 } } },
    };
    const db: UsageReportDatabase = {
      ref: (path) => ({
        get: async () => ({ val: () => data[path] ?? null }),
        set: async (v) => {
          data[path] = v;
        },
      }),
    };
    const sent: string[] = [];
    const send = async (t: string) => (sent.push(t), true);
    expect(await sendUsageReport(db, at(12, 12), send)).toBeNull();
    expect(data['sims_meta/usageReport']).toBe('2026-11-09');
    expect(await sendUsageReport(db, at(16, 8), send)).toBeNull();
    expect(await sendUsageReport(db, at(16, 9), send)).toBe('2026-11-16');
    expect(await sendUsageReport(db, at(16, 10), send)).toBeNull();
    expect(sent).toHaveLength(1);
    expect(sent[0]).toContain('chat — <b>4</b>');
  });

  it('se Telegram non risponde riprova al giro dopo', async () => {
    const data: Record<string, unknown> = { 'sims_meta/usageReport': '2026-11-09' };
    const db: UsageReportDatabase = {
      ref: (path) => ({
        get: async () => ({ val: () => data[path] ?? null }),
        set: async (v) => {
          data[path] = v;
        },
      }),
    };
    expect(await sendUsageReport(db, at(16, 9), async () => false)).toBeNull();
    expect(data['sims_meta/usageReport']).toBe('2026-11-09');
    expect(await sendUsageReport(db, at(16, 10), async () => true)).toBe('2026-11-16');
  });
});
