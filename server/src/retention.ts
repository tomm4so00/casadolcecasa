// Ritenzione (shared/retention-rules.ts): a ogni giro si segnano in sims_retention i giorni in cui
// ogni account ha giocato, e il lunedì dalle 9 il resoconto va sul gruppo Telegram, una volta sola.
import {
  markActive,
  retentionBySource,
  retentionBySourceText,
  retentionReport,
  retentionTelegramText,
  romeDay,
} from '../../shared/retention-rules.js';
import { reportWeek } from '../../shared/usage-rules.js';
import type { TelegramSender } from './suggestions.js';

interface Reference {
  get(): Promise<{ val(): unknown }>;
  set(value: unknown): Promise<unknown>;
  update(value: Record<string, unknown>): Promise<unknown>;
}
export interface RetentionDatabase {
  ref(path: string): Reference;
}

/** Un account, solo quello che serve: creazione e ultimo uso (millisecondi, 0 se non c'è). */
export interface AccountTimes {
  uid: string;
  created: number;
  lastActive: number;
}

/** Il giorno da cui si segna: prima i giorni giocati non si conoscono. */
export const SINCE = 'sims_meta/retentionSince';
const MARK = 'sims_meta/retentionReport';

/** Segna i giorni giocati; restituisce quanti account sono cambiati. */
export async function trackRetention(
  database: RetentionDatabase,
  accounts: AccountTimes[],
  now: number,
): Promise<number> {
  if (typeof (await database.ref(SINCE).get()).val() !== 'string')
    await database.ref(SINCE).set(romeDay(now));
  const all = ((await database.ref('sims_retention').get()).val() || {}) as Record<string, unknown>;
  const changes: Record<string, unknown> = {};
  for (const a of accounts) {
    if (!a.created) continue;
    const next = markActive(all[a.uid], a.created, a.lastActive || null);
    if (next) changes[a.uid] = next;
  }
  if (Object.keys(changes).length) await database.ref('sims_retention').update(changes);
  return Object.keys(changes).length;
}

/** Il resoconto del lunedì; restituisce la settimana mandata, o null. */
export async function sendRetentionReport(
  database: RetentionDatabase,
  now: number,
  send: TelegramSender,
): Promise<string | null> {
  const due = reportWeek(now);
  if (!due) return null;
  const last = (await database.ref(MARK).get()).val();
  if (last === due.week) return null;
  // la prima volta si segna e basta: i giorni giocati si contano da adesso
  if (typeof last !== 'string') {
    await database.ref(MARK).set(due.week);
    return null;
  }
  const since = (await database.ref(SINCE).get()).val();
  if (typeof since !== 'string') return null;
  const all = (await database.ref('sims_retention').get()).val() as Record<string, unknown>;
  const report = retentionReport(all, romeDay(due.end), since);
  // divisa anche per provenienza (?da=itch…, scritta dal gioco in sims_sources)
  const sources = (await database.ref('sims_sources').get()).val() as Record<string, unknown>;
  const bySource = retentionBySourceText(retentionBySource(all, sources, romeDay(due.end), since));
  if (!(await send(retentionTelegramText(report) + bySource))) return null;
  await database.ref(MARK).set(due.week);
  return due.week;
}
