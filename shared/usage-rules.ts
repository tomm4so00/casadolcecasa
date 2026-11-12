// La classifica dei contatori d'uso (sims_usage, vedi src/game/usage.ts): la usano la pagina di
// scripts/contatori.mjs e il resoconto del lunedì sul gruppo Telegram (server/src/usage-report.ts).
// Senza import: lo script la carica così com'è, in TypeScript.

const DAY = 86_400_000;

/** Il giorno (AAAA-MM-GG) a Roma, come lo scrive il gioco. */
export const romeDay = (ms: number): string =>
  new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Rome' }).format(new Date(ms));

interface Count {
  n?: unknown;
  p?: unknown;
}
export type Usage = Record<string, Record<string, Count> | undefined> | null | undefined;

export interface UsageRow {
  what: string;
  kind: 'posto' | 'funzione';
  name: string;
  /** usi nei 7 giorni */
  n: number;
  /** usi nei 7 giorni prima */
  prev: number;
  /** variazione in percento; null se la settimana prima era a zero */
  change: number | null;
  /** giocatori diversi in media ogni giorno */
  players: number;
}

/** Somma usi (n) e giocatori-giorno (p) per voce, nei giorni dati. */
export function totals(usage: Usage, days: string[]): Record<string, { n: number; p: number }> {
  const out: Record<string, { n: number; p: number }> = {};
  for (const day of days)
    for (const [what, v] of Object.entries(usage?.[day] || {})) {
      const t = (out[what] ??= { n: 0, p: 0 });
      t.n += Number(v?.n) || 0;
      t.p += Number(v?.p) || 0;
    }
  return out;
}

/** La classifica dei 7 giorni che finiscono con quello di `now`, rispetto ai 7 prima. */
export function ranking(usage: Usage, now: number): UsageRow[] {
  const week = [...Array(7)].map((_, i) => romeDay(now - i * DAY));
  const before = [...Array(7)].map((_, i) => romeDay(now - (i + 7) * DAY));
  const a = totals(usage, week);
  const b = totals(usage, before);
  const keys = new Set([...Object.keys(a), ...Object.keys(b)]);
  return [...keys]
    .map((what): UsageRow => {
      const n = a[what]?.n || 0;
      const prev = b[what]?.n || 0;
      return {
        what,
        kind: what.startsWith('posto:') ? 'posto' : 'funzione',
        name: what.replace(/^posto:/, ''),
        n,
        prev,
        change: prev ? Math.round(((n - prev) / prev) * 100) : null,
        players: Math.round(((a[what]?.p || 0) / 7) * 10) / 10,
      };
    })
    .sort((x, y) => y.n - x.n);
}

/** "+12%", "-30%" o "nuovo". */
export const changeLabel = (r: UsageRow): string =>
  r.change === null ? 'nuovo' : (r.change > 0 ? '+' : '') + r.change + '%';

// ---------------------------------------------------------------- resoconto del lunedì

/** Dalle 9 del lunedì (ora di Roma) parte il resoconto della settimana appena finita. */
export const REPORT_HOUR = 9;

function romeParts(now: number): { weekday: number; hour: number } {
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Europe/Rome',
    weekday: 'short',
    hour: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(new Date(now));
  const get = (type: string) => parts.find((p) => p.type === type)?.value ?? '';
  const weekday = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].indexOf(get('weekday'));
  return { weekday, hour: Number(get('hour')) };
}

/**
 * La settimana da mandare adesso: `week` è il lunedì di questa settimana (il segno che dice che
 * è già partita) e `end` un istante della domenica prima, l'ultimo giorno del resoconto. Null
 * prima delle 9: così `now - k giorni` resta nello stesso giorno anche col cambio dell'ora.
 * Se il lunedì il server non gira, il resoconto parte il primo giro dopo.
 */
export function reportWeek(now: number): { week: string; end: number } | null {
  const { weekday, hour } = romeParts(now);
  if (weekday < 0 || hour < REPORT_HOUR) return null;
  const monday = now - weekday * DAY;
  return { week: romeDay(monday), end: monday - DAY };
}

const esc = (s: string): string =>
  s.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;');

/** "02/11" */
const shortDay = (ms: number): string => romeDay(ms).slice(5).split('-').reverse().join('/');

/** Telegram accetta 4096 caratteri: si resta larghi. */
const LIMIT = 3800;

/** Il messaggio per Telegram (HTML): posti e funzioni, dal più usato. */
export function usageReportText(rows: UsageRow[], end: number): string {
  const head =
    `📊 <b>Contatori della settimana</b>\n` +
    `<i>dal ${shortDay(end - 6 * DAY)} al ${shortDay(end)}, rispetto ai 7 giorni prima</i>\n`;
  if (!rows.length) return head + '\nNessun uso registrato.';
  const line = (r: UsageRow) =>
    `${esc(r.name)} — <b>${r.n}</b> (${changeLabel(r)}) · ${r.players} gioc./giorno`;
  let text = head;
  let left = rows.length;
  for (const [kind, title] of [
    ['posto', '🏠 <b>Posti</b>'],
    ['funzione', '⚙️ <b>Funzioni</b>'],
  ] as const) {
    const list = rows.filter((r) => r.kind === kind);
    if (!list.length) continue;
    text += `\n${title}\n`;
    for (const r of list) {
      const next = line(r) + '\n';
      if (text.length + next.length > LIMIT) return text + `…e altre ${left} voci`;
      text += next;
      left--;
    }
  }
  return text.trim();
}
