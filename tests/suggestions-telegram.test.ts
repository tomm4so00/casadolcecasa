import { describe, expect, it } from 'vitest';
import { forwardSuggestions, telegramFromEnv } from '../server/src/suggestions.js';

/** Un database finto con solo quello che serve: la lista dei messaggi e i segni `tg`. */
function fakeDb(data: Record<string, Record<string, unknown>>) {
  const marked: string[] = [];
  const query = {
    orderByChild: () => query,
    limitToLast: () => query,
    get: async () => ({ val: () => data }),
  };
  const db = {
    ref: (path: string) =>
      path === 'sims_suggestions'
        ? query
        : {
            set: async () => {
              marked.push(path);
            },
          },
  };
  return { db: db as unknown as Parameters<typeof forwardSuggestions>[0], marked };
}

const note = (t: number, more: Record<string, unknown> = {}) => ({
  uid: 'u',
  pid: 'p',
  nick: 'Ada',
  kind: 'idea',
  text: 'più gatti nel cortile',
  t,
  ...more,
});

describe('cassetta dei suggerimenti: Telegram', () => {
  it('manda solo i nuovi, dal più vecchio, e li segna', async () => {
    const { db, marked } = fakeDb({ b: note(2), a: note(1), c: note(3, { tg: true }) });
    const sent: string[] = [];
    const n = await forwardSuggestions(db, async (html) => {
      sent.push(html);
      return true;
    });
    expect(n).toBe(2);
    expect(marked).toEqual(['sims_suggestions/a/tg', 'sims_suggestions/b/tg']);
    expect(sent[0]).toContain('💡 Idea');
  });

  it('se Telegram non risponde non segna niente: riprova al giro dopo', async () => {
    const { db, marked } = fakeDb({ a: note(1) });
    expect(await forwardSuggestions(db, async () => false)).toBe(0);
    expect(marked).toEqual([]);
  });

  it('senza token e chat non manda niente', () => {
    expect(telegramFromEnv({})).toBeNull();
    expect(telegramFromEnv({ TELEGRAM_BOT_TOKEN: 'x', TELEGRAM_CHAT_ID: '1' })).not.toBeNull();
  });
});
