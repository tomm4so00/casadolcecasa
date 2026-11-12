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
  // i passi dell'imbuto d'ingresso hanno la loro tabella (funnel, sotto)
  const keys = new Set([...Object.keys(a), ...Object.keys(b)].filter((k) => !isFunnelKey(k)));
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

// ---------------------------------------------------------------- imbuto d'ingresso

/** I passi dell'ingresso, in ordine (li conta il gioco: cloud-setup, first-entry, arrival, jobs). */
export const FUNNEL_STEPS = [
  { key: 'ingresso:visto', label: 'Ingresso visto' },
  { key: 'ingresso:gioca_subito', label: 'Gioca subito' },
  { key: 'ingresso:google', label: 'Accedi con Google' },
  { key: 'ingresso:email_accesso', label: 'Entra con email' },
  { key: 'ingresso:email_nuovo', label: 'Registrati con email' },
  { key: 'ingresso:nome', label: 'Nome scelto (ospiti)' },
  { key: 'ingresso:18anni', label: '18 anni confermati' },
  { key: 'ingresso:personaggio', label: 'Personaggio creato' },
  // l'arrivo in cortile (src/game/arrival.ts)
  { key: 'ingresso:arrivo_door', label: 'Chiavi prese (Andiamo!)' },
  { key: 'ingresso:arrivo_room', label: 'Arrivato nel salone' },
  { key: 'ingresso:arrivo_gift', label: 'Entrato nella sua stanza' },
  { key: 'ingresso:arrivo_cook', label: 'Arrivato in cucina' },
] as const;

/** Le missioni di benvenuto, in ordine (src/game/welcome-rules.ts, WELCOME_MISSIONS). */
export const FUNNEL_MISSIONS = [
  { id: 'taste_cook', label: "Cucina l'assaggio" },
  { id: 'taste_give', label: "Porta l'assaggio" },
  { id: 'pin', label: 'Cassaforte' },
  { id: 'work', label: 'Primo stipendio' },
  { id: 'sleep', label: 'Letto' },
] as const;

export const isFunnelKey = (key: string): boolean =>
  key.startsWith('ingresso:') || key.startsWith('missione:');

export interface Funnel {
  /** dispositivi per passo, sommati sui 7 giorni */
  steps: { label: string; n: number }[];
  missions: { label: string; yes: number; no: number; later: number; done: number }[];
  firstShift: number;
}

/** L'imbuto dei 7 giorni che finiscono con quello di `now`: quanti dispositivi a ogni passo. */
export function funnel(usage: Usage, now: number): Funnel {
  const t = totals(
    usage,
    [...Array(7)].map((_, i) => romeDay(now - i * DAY)),
  );
  const p = (key: string) => t[key]?.p || 0;
  return {
    steps: FUNNEL_STEPS.map((s) => ({ label: s.label, n: p(s.key) })),
    missions: FUNNEL_MISSIONS.map((m) => ({
      label: m.label,
      yes: p(`missione:${m.id}:si`),
      no: p(`missione:${m.id}:no`),
      later: p(`missione:${m.id}:dopo`),
      done: p(`missione:${m.id}:fine`),
    })),
    firstShift: p('ingresso:primo_turno'),
  };
}

/** "58%" rispetto al primo passo, o "" se il primo passo è a zero. */
export const shareOf = (n: number, base: number): string =>
  base ? `${Math.round((n / base) * 100)}%` : '';

/** Le righe dell'imbuto per Telegram; `backNextDay` dalla ritenzione, se c'è. */
export function funnelText(
  f: Funnel,
  backNextDay: { started: number; back: number } | null,
): string {
  const base = f.steps[0].n;
  if (!base && !f.steps.some((s) => s.n)) return '';
  let text = `\n🚪 <b>Imbuto d'ingresso</b> (dispositivi)\n`;
  for (const s of f.steps)
    text += `${esc(s.label)}: <b>${s.n}</b>${s === f.steps[0] ? '' : ' ' + shareOf(s.n, base)}\n`;
  for (const [i, m] of f.missions.entries())
    if (m.yes || m.no || m.later || m.done)
      text += `Missione ${i + 1} (${esc(m.label)}): accettata ${m.yes} · rifiutata ${m.no} · rimandata ${m.later} · finita <b>${m.done}</b>\n`;
  text += `Primo turno di lavoro: <b>${f.firstShift}</b>\n`;
  if (backNextDay)
    text += `Tornati il giorno dopo: <b>${backNextDay.back}</b> su ${backNextDay.started} nuovi\n`;
  return text;
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
export function usageReportText(rows: UsageRow[], end: number, extra = ''): string {
  const head =
    `📊 <b>Contatori della settimana</b>\n` +
    `<i>dal ${shortDay(end - 6 * DAY)} al ${shortDay(end)}, rispetto ai 7 giorni prima</i>\n`;
  if (!rows.length) return (head + '\nNessun uso registrato.\n' + extra).trim();
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
      if (text.length + next.length + extra.length > LIMIT)
        return (text + `…e altre ${left} voci\n` + extra).trim();
      text += next;
      left--;
    }
  }
  return (text + extra).trim();
}
