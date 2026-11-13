// Ritenzione: quanti giocatori tornano dopo il primo giorno. La manutenzione (server/src/retention.ts)
// segna a ogni giro i giorni in cui ogni account ha giocato, leggendo dall'accesso di Firebase la
// data di creazione e l'ultimo rinnovo dell'accesso (mentre il gioco è aperto si rinnova da solo
// almeno una volta l'ora):  sims_retention/<uid> = { c: giorno d'inizio, a: { giorni dopo: 1 } }.
// Lo leggono solo il server e la Firebase CLI; nei resoconti ci sono solo totali.
// Senza import: scripts/ritenzione.mjs carica questo file così com'è, in TypeScript.

const DAY = 86_400_000;

/** Il giorno (AAAA-MM-GG) a Roma. */
export const romeDay = (ms: number): string =>
  new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Rome' }).format(new Date(ms));

/** Il numero di un giorno (giorni dal 1970), per contare le distanze. */
export const dayIndex = (day: string): number => {
  const [y, m, d] = day.split('-').map(Number);
  return Math.round(Date.UTC(y, m - 1, d) / DAY);
};
/** Il giorno di un numero di giorno. */
export const dayString = (index: number): string =>
  new Date(index * DAY).toISOString().slice(0, 10);
/** Il lunedì della settimana di un giorno. */
export const mondayOf = (index: number): number =>
  index - ((new Date(index * DAY).getUTCDay() + 6) % 7);

export interface RetentionEntry {
  /** giorno d'inizio (creazione dell'account) */
  c: string;
  /** giorni giocati, contati dall'inizio (0 = il primo giorno) */
  a: Record<string, number>;
}

export const isEntry = (v: unknown): v is RetentionEntry =>
  !!v &&
  typeof v === 'object' &&
  typeof (v as RetentionEntry).c === 'string' &&
  /^\d{4}-\d{2}-\d{2}$/.test((v as RetentionEntry).c) &&
  !!(v as RetentionEntry).a &&
  typeof (v as RetentionEntry).a === 'object';

/**
 * Il segno di un account dopo questo giro: il primo giorno c'è sempre (chi crea l'account gioca),
 * più il giorno dell'ultimo accesso. Null se non cambia niente.
 */
export function markActive(
  entry: unknown,
  created: number,
  lastActive: number | null,
): RetentionEntry | null {
  const c = isEntry(entry) ? entry.c : romeDay(created);
  const a: Record<string, number> = isEntry(entry) ? { ...entry.a } : {};
  let changed = !isEntry(entry);
  const mark = (offset: number) => {
    const key = String(Math.max(0, offset));
    if (a[key]) return;
    a[key] = 1;
    changed = true;
  };
  mark(0);
  if (lastActive) mark(dayIndex(romeDay(lastActive)) - dayIndex(c));
  return changed ? { c, a } : null;
}

// ---------------------------------------------------------------- resoconto

/** Le finestre di ritorno, in giorni dopo l'inizio (estremi compresi). */
export const WINDOWS = [
  { label: 'giorno 1', from: 1, to: 1 },
  { label: 'giorno 7', from: 7, to: 13 },
  { label: 'giorno 30', from: 30, to: 36 },
] as const;

export interface CohortRow {
  /** lunedì della settimana d'inizio */
  week: string;
  /** quanti hanno iniziato quella settimana */
  size: number;
  /** per ogni finestra: quanti sono tornati, o null se la finestra non è ancora finita per tutti */
  back: (number | null)[];
}

export interface RetentionReport {
  /** i 7 giorni del resoconto, dal primo all'ultimo */
  from: string;
  to: string;
  /** persone diverse che hanno giocato in quei 7 giorni */
  active: number;
  newPlayers: number;
  returning: number;
  /** settimane d'inizio, dalla più recente */
  cohorts: CohortRow[];
}

const playedBetween = (e: RetentionEntry, from: number, to: number): boolean => {
  const start = dayIndex(e.c);
  return Object.keys(e.a).some((k) => {
    const day = start + Number(k);
    return day >= from && day <= to;
  });
};

/**
 * Il resoconto dei 7 giorni che finiscono con il giorno `last` (AAAA-MM-GG). Contano solo gli
 * account iniziati da `since` in poi: prima i giorni giocati non si segnavano.
 */
export function retentionReport(
  raw: Record<string, unknown> | null | undefined,
  last: string,
  since: string,
  weeks = 8,
): RetentionReport {
  const end = dayIndex(last);
  const first = end - 6;
  const sinceIdx = dayIndex(since);
  const all = Object.values(raw || {}).filter(isEntry);
  // gli attivi: tutti quelli segnati in quei giorni, anche gli account di prima
  const played = all.filter((e) => playedBetween(e, Math.max(first, sinceIdx), end));
  const newPlayers = played.filter((e) => dayIndex(e.c) >= first).length;
  const tracked = all.filter((e) => dayIndex(e.c) >= sinceIdx);
  const cohorts: CohortRow[] = [];
  for (let w = 0; w < weeks; w++) {
    const monday = mondayOf(end) - 7 * w;
    if (monday + 6 < sinceIdx) break;
    const members = tracked.filter((e) => {
      const d = dayIndex(e.c);
      return d >= monday && d <= monday + 6 && d <= end;
    });
    if (!members.length) continue;
    const latest = Math.max(...members.map((e) => dayIndex(e.c)));
    cohorts.push({
      week: dayString(monday),
      size: members.length,
      back: WINDOWS.map((win) =>
        // la finestra deve essere finita anche per l'ultimo arrivato
        latest + win.to > end
          ? null
          : members.filter((e) =>
              Object.keys(e.a).some((k) => Number(k) >= win.from && Number(k) <= win.to),
            ).length,
      ),
    });
  }
  return {
    from: dayString(first),
    to: last,
    active: played.length,
    newPlayers,
    returning: played.length - newPlayers,
    cohorts,
  };
}

// ---------------------------------------------------------------- per provenienza

/** Chi non ha una provenienza: arrivato senza ?da=, o con l'account di prima. */
export const NO_SOURCE = 'senza link';

export interface SourceRetentionRow {
  source: string;
  /** quanti hanno iniziato nelle settimane del resoconto */
  size: number;
  /** per ogni finestra: tornati su quelli per cui la finestra è già finita */
  back: { n: number; of: number }[];
}

/**
 * La ritenzione divisa per provenienza (sims_sources/<uid>, scritta dal gioco per gli account
 * nuovi arrivati con ?da=…): gli account iniziati nelle `weeks` settimane che finiscono con
 * `last`, e da `since` in poi. Ogni finestra conta solo chi l'ha già passata tutta.
 */
export function retentionBySource(
  raw: Record<string, unknown> | null | undefined,
  sources: Record<string, unknown> | null | undefined,
  last: string,
  since: string,
  weeks = 8,
): SourceRetentionRow[] {
  const end = dayIndex(last);
  const lo = Math.max(dayIndex(since), mondayOf(end) - 7 * (weeks - 1));
  const groups = new Map<string, RetentionEntry[]>();
  for (const [uid, e] of Object.entries(raw || {})) {
    if (!isEntry(e)) continue;
    const d = dayIndex(e.c);
    if (d < lo || d > end) continue;
    const s = sources?.[uid];
    const key = typeof s === 'string' && s ? s : NO_SOURCE;
    groups.set(key, [...(groups.get(key) || []), e]);
  }
  return [...groups.entries()]
    .map(([source, list]) => ({
      source,
      size: list.length,
      back: WINDOWS.map((win) => {
        const done = list.filter((e) => dayIndex(e.c) + win.to <= end);
        return {
          n: done.filter((e) =>
            Object.keys(e.a).some((k) => Number(k) >= win.from && Number(k) <= win.to),
          ).length,
          of: done.length,
        };
      }),
    }))
    .sort(
      (a, b) => Number(a.source === NO_SOURCE) - Number(b.source === NO_SOURCE) || b.size - a.size,
    );
}

/** "3 su 10 (30%)" oppure "—" se nessuno ha ancora passato la finestra. */
export const sourceBackLabel = (b: { n: number; of: number }): string =>
  b.of ? `${b.n} su ${b.of} (${Math.round((b.n / b.of) * 100)}%)` : '—';

/** Le righe per Telegram della ritenzione per provenienza, o "" se ci sono solo quelli senza link. */
export function retentionBySourceText(rows: SourceRetentionRow[]): string {
  if (!rows.some((r) => r.source !== NO_SOURCE)) return '';
  let text = `\n<b>Per provenienza</b> (nuovi delle ultime settimane)\n`;
  for (const r of rows)
    text +=
      `${r.source}: <b>${r.size}</b> → ` +
      WINDOWS.map((w, i) => `${w.label}: ${sourceBackLabel(r.back[i])}`).join(' · ') +
      '\n';
  return text;
}

/** "5 (42%)" oppure "—" se non si sa ancora. */
export const backLabel = (n: number | null, size: number): string =>
  n === null ? '—' : `${n} (${size ? Math.round((n / size) * 100) : 0}%)`;

/** "02/11" */
const shortDay = (day: string): string => day.slice(5).split('-').reverse().join('/');

/** Il messaggio per Telegram (HTML). */
export function retentionTelegramText(r: RetentionReport): string {
  let text =
    `📈 <b>Ritenzione</b>\n<i>dal ${shortDay(r.from)} al ${shortDay(r.to)}</i>\n` +
    `Attivi: <b>${r.active}</b> (${r.newPlayers} nuovi, ${r.returning} di ritorno)\n`;
  if (!r.cohorts.length) return text + '\nAncora nessun giocatore nuovo da seguire.';
  text += `\n<b>Chi è tornato, per settimana d'inizio</b>\n`;
  for (const c of r.cohorts) {
    const sunday = dayString(dayIndex(c.week) + 6);
    text +=
      `${shortDay(c.week)}–${shortDay(sunday)}: <b>${c.size}</b> nuovi → ` +
      WINDOWS.map((w, i) => `${w.label}: ${backLabel(c.back[i], c.size)}`).join(' · ') +
      '\n';
  }
  return text.trim();
}

/**
 * Per l'imbuto d'ingresso: dei nuovi iniziati fra `from` e `to` (AAAA-MM-GG) a cui il giorno dopo
 * è già passato, quanti sono tornati il giorno dopo. Contano solo quelli iniziati da `since`.
 */
export function backNextDay(
  raw: Record<string, unknown> | null | undefined,
  from: string,
  to: string,
  since: string,
): { started: number; back: number } {
  const lo = Math.max(dayIndex(from), dayIndex(since));
  // il giorno dopo deve essere finito: fino al giorno prima di `to`
  const hi = dayIndex(to) - 1;
  const list = Object.values(raw || {})
    .filter(isEntry)
    .filter((e) => dayIndex(e.c) >= lo && dayIndex(e.c) <= hi);
  return { started: list.length, back: list.filter((e) => e.a['1']).length };
}
