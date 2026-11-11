import { describe, expect, it } from 'vitest';
import {
  SUGGESTION_COOLDOWN_MS,
  SUGGESTION_MAX,
  cleanSuggestion,
  cooldownLeft,
  sortSuggestions,
  suggestionProblem,
  telegramText,
} from '../shared/suggestion-rules.js';

describe('cassetta dei suggerimenti', () => {
  it('pulisce il testo e lo taglia alla lunghezza massima', () => {
    expect(cleanSuggestion('  ciao  \r\n\r\n\r\n\r\nmondo  ')).toBe('ciao\n\nmondo');
    expect(cleanSuggestion('x'.repeat(900))).toHaveLength(SUGGESTION_MAX);
    expect(suggestionProblem('  ok ')).not.toBeNull();
    expect(suggestionProblem('aggiungete i gatti')).toBeNull();
  });

  it('un messaggio ogni 10 minuti', () => {
    expect(cooldownLeft(null, 1000)).toBe(0);
    expect(cooldownLeft(1000, 1000)).toBe(SUGGESTION_COOLDOWN_MS);
    expect(cooldownLeft(1000, 1000 + SUGGESTION_COOLDOWN_MS)).toBe(0);
  });

  it('dal più recente, conta i non letti e scarta quelli rotti', () => {
    const { list, unread } = sortSuggestions({
      a: { uid: 'u', pid: 'p', nick: 'Ada', kind: 'idea', text: 'più gatti', t: 1, seen: true },
      b: { uid: 'u', pid: 'p', nick: 'Bea', kind: 'bug', text: 'si blocca', t: 2 },
      c: { nick: 'rotto' },
    });
    expect(list.map((s) => s.id)).toEqual(['b', 'a']);
    expect(unread).toBe(1);
  });

  it('su Telegram il testo non può rompere l’HTML', () => {
    const t = telegramText({
      uid: 'u',
      pid: 'p',
      nick: '<b>Ada</b>',
      kind: 'bug',
      text: 'a < b & c',
      t: 1,
      v: '0.26.0',
    });
    expect(t).toContain('&lt;b&gt;Ada&lt;/b&gt;');
    expect(t).toContain('a &lt; b &amp; c');
    expect(t).toContain('🐞 Bug');
    expect(t).toContain('v0.26.0');
  });
});
