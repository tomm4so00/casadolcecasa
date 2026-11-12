// Il resoconto del lunedì: dalle 9 la classifica dei contatori d'uso della settimana appena finita
// va sul gruppo Telegram dei collaboratori, una volta sola (il segno è sims_meta/usageReport).
import { ranking, reportWeek, usageReportText, type Usage } from '../../shared/usage-rules.js';
import type { TelegramSender } from './suggestions.js';

interface Reference {
  get(): Promise<{ val(): unknown }>;
  set(value: unknown): Promise<unknown>;
}
export interface UsageReportDatabase {
  ref(path: string): Reference;
}

const MARK = 'sims_meta/usageReport';

/** Manda il resoconto se è il momento; restituisce la settimana mandata, o null. */
export async function sendUsageReport(
  database: UsageReportDatabase,
  now: number,
  send: TelegramSender,
): Promise<string | null> {
  const due = reportWeek(now);
  if (!due) return null;
  const last = (await database.ref(MARK).get()).val();
  if (last === due.week) return null;
  // la prima volta si segna e basta: i contatori sono nuovi, la settimana prima è vuota
  if (typeof last !== 'string') {
    await database.ref(MARK).set(due.week);
    return null;
  }
  const usage = (await database.ref('sims_usage').get()).val() as Usage;
  // se Telegram non risponde si riprova al giro dopo
  if (!(await send(usageReportText(ranking(usage, due.end), due.end)))) return null;
  await database.ref(MARK).set(due.week);
  return due.week;
}
