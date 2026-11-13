// Il resoconto del lunedì: dalle 9 la classifica dei contatori d'uso della settimana appena finita
// va sul gruppo Telegram dei collaboratori, una volta sola (il segno è sims_meta/usageReport).
import {
  funnel,
  funnelBySource,
  funnelBySourceText,
  funnelText,
  ranking,
  reportWeek,
  romeDay,
  usageReportText,
  type Usage,
} from '../../shared/usage-rules.js';
import { backNextDay } from '../../shared/retention-rules.js';
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
  // l'imbuto d'ingresso, con chi è tornato il giorno dopo (dalla ritenzione)
  const since = (await database.ref('sims_meta/retentionSince').get()).val();
  const back =
    typeof since === 'string'
      ? backNextDay(
          (await database.ref('sims_retention').get()).val() as Record<string, unknown>,
          romeDay(due.end - 6 * 86_400_000),
          romeDay(due.end),
          since,
        )
      : null;
  // e diviso per provenienza (?da=itch…)
  const extra =
    funnelText(funnel(usage, due.end), back) + funnelBySourceText(funnelBySource(usage, due.end));
  // se Telegram non risponde si riprova al giro dopo
  if (!(await send(usageReportText(ranking(usage, due.end), due.end, extra)))) return null;
  await database.ref(MARK).set(due.week);
  return due.week;
}
