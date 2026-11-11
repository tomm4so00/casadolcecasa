// La cassetta "Suggerimenti e bug" del cortile: i giocatori con un account scrivono un'idea o un
// bug, i collaboratori (lista in sims_staff) li leggono nel gioco e il server li manda su Telegram.
// Regole senza dipendenze dal browser, usate dal gioco, dal server e dai test.

/** Lunghezza del messaggio: abbastanza per spiegare un bug, non un tema. */
export const SUGGESTION_MIN = 5;
export const SUGGESTION_MAX = 500;
/** Un messaggio ogni 10 minuti per giocatore (lo controllano anche le regole del database). */
export const SUGGESTION_COOLDOWN_MS = 10 * 60_000;

export type SuggestionKind = 'idea' | 'bug';

export interface Suggestion {
  uid: string;
  pid: string;
  nick: string;
  kind: SuggestionKind;
  text: string;
  t: number;
  /** Versione del gioco di chi scrive (utile per i bug). */
  v?: string;
  /** Il mondo in cui gioca. */
  world?: string;
  /** Letto da un collaboratore nel gioco. */
  seen?: boolean;
  /** Già mandato su Telegram dal server. */
  tg?: boolean;
}

export const KIND_LABEL: Record<SuggestionKind, string> = { idea: '💡 Idea', bug: '🐞 Bug' };

/** Il testo pulito: spazi in fondo e righe vuote ripetute tolti, al massimo SUGGESTION_MAX. */
export function cleanSuggestion(text: string): string {
  return text
    .replace(/\r\n?/g, '\n')
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
    .slice(0, SUGGESTION_MAX);
}

/** Perché il testo non va bene, oppure null. */
export function suggestionProblem(text: string): string | null {
  const t = cleanSuggestion(text);
  if (t.length < SUGGESTION_MIN) return `Scrivi almeno ${SUGGESTION_MIN} caratteri.`;
  return null;
}

/** Quanto manca prima di poter scrivere di nuovo (0 = si può). */
export function cooldownLeft(last: number | null | undefined, now: number): number {
  if (!last) return 0;
  return Math.max(0, last + SUGGESTION_COOLDOWN_MS - now);
}

/** È un messaggio fatto bene (per leggere quello che arriva dal database). */
export function isSuggestion(v: unknown): v is Suggestion {
  const s = v as Suggestion;
  return (
    !!s &&
    typeof s.text === 'string' &&
    typeof s.nick === 'string' &&
    typeof s.t === 'number' &&
    (s.kind === 'idea' || s.kind === 'bug')
  );
}

/** I messaggi dal più recente, con quanti non sono ancora stati letti. */
export function sortSuggestions(raw: Record<string, unknown> | null | undefined): {
  list: (Suggestion & { id: string })[];
  unread: number;
} {
  const list = Object.entries(raw || {})
    .filter((e): e is [string, Suggestion] => isSuggestion(e[1]))
    .map(([id, s]) => ({ ...s, id }))
    .sort((a, b) => b.t - a.t);
  return { list, unread: list.filter((s) => !s.seen).length };
}

const esc = (s: string): string =>
  s.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;');

/** Il messaggio per Telegram (HTML): tipo, chi, versione e testo. */
export function telegramText(s: Suggestion): string {
  const where = [s.v ? `v${s.v}` : '', s.world || ''].filter(Boolean).join(' · ');
  return (
    `📮 <b>${KIND_LABEL[s.kind]}</b> da <i>${esc(s.nick)}</i>` +
    (where ? ` <code>${esc(where)}</code>` : '') +
    `\n\n${esc(s.text)}`
  );
}
