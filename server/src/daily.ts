// Le missioni del giorno (src/game/daily-rules.ts): alle 10 (ora italiana) una notifica con le tre
// missioni di oggi, uguali per tutti, a chiunque abbia le notifiche attive. Una volta al giorno: in
// sims_meta/daily si segna il giorno già avvisato.
import { romeClock } from '../../shared/hacker-rules.js';
import { dailyPush } from '../../src/game/daily-rules.js';
import { GAME_URL, type MaintenanceDatabase, type PushSender } from './maintenance.js';

/** Dalle 10 del mattino (ora italiana). */
export const DAILY_PUSH_MINUTE = 10 * 60;

type Tree = Record<string, unknown>;
const record = (value: unknown): value is Tree => !!value && typeof value === 'object';

/** Manda le missioni di oggi; restituisce quante notifiche sono partite (-1: non è il momento). */
export async function notifyDailyMissions(
  database: MaintenanceDatabase,
  now: number,
  send: PushSender,
): Promise<number> {
  const { day, minute } = romeClock(now);
  if (minute < DAILY_PUSH_MINUTE) return -1;
  // un giro solo la manda, anche se due manutenzioni si sovrappongono
  const claim = await database
    .ref('sims_meta/daily')
    .transaction((value) => (value === day ? undefined : day));
  if (!claim.committed) return -1;
  const message = dailyPush(day);
  const push = (await database.ref('sims_push').get()).val();
  if (!record(push)) return 0;
  let count = 0;
  for (const [pid, entry] of Object.entries(push)) {
    if (!record(entry) || !record(entry.tokens)) continue;
    for (const [key, token] of Object.entries(entry.tokens)) {
      if (!record(token) || typeof token.token !== 'string') continue;
      const res = await send(token.token, { ...message, link: GAME_URL, tag: 'sims-daily' });
      if (res === 'sent') count++;
      if (res === 'gone') await database.ref(`sims_push/${pid}/tokens/${key}`).remove();
    }
  }
  return count;
}
