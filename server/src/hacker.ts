// Notifiche di Zero, lo scassinatore (shared/hacker-rules.ts): l'annuncio delle 11:45 con l'orario
// dell'attacco e il promemoria poco prima. A chiunque abbia le notifiche attive, una volta al giorno
// ciascuna: in sims_meta/hacker si segna il giorno già avvisato.
import {
  announcementPush,
  hackerDay,
  hackerPhase,
  reminderPush,
} from '../../shared/hacker-rules.js';
import { GAME_URL, type MaintenanceDatabase, type PushSender } from './maintenance.js';

/** Il promemoria parte se l'attacco è entro tanti minuti (la manutenzione gira ogni 15). */
export const REMINDER_WINDOW_MS = 25 * 60000;

type Tree = Record<string, unknown>;
const record = (value: unknown): value is Tree => !!value && typeof value === 'object';

/** Quale notifica va mandata adesso (al massimo una per giro). */
export function hackerPushDue(
  now: number,
  sent: { announce?: unknown; reminder?: unknown },
): 'announce' | 'reminder' | null {
  const d = hackerDay(now);
  const phase = hackerPhase(now, d);
  if (phase !== 'announced' && phase !== 'active') return null;
  if (sent.announce !== d.day) return 'announce';
  if (phase === 'announced' && d.startAt - now <= REMINDER_WINDOW_MS && sent.reminder !== d.day)
    return 'reminder';
  return null;
}

/** Manda la notifica dovuta a tutti i dispositivi; restituisce quante ne sono partite (-1: nessuna dovuta). */
export async function notifyHacker(
  database: MaintenanceDatabase,
  now: number,
  send: PushSender,
): Promise<number> {
  const meta = database.ref('sims_meta/hacker');
  const sent = (await meta.get()).val();
  const kind = hackerPushDue(now, record(sent) ? sent : {});
  if (!kind) return -1;
  const d = hackerDay(now);
  // un giro solo la manda, anche se due manutenzioni si sovrappongono
  const claim = await database
    .ref(`sims_meta/hacker/${kind}`)
    .transaction((value) => (value === d.day ? undefined : d.day));
  if (!claim.committed) return -1;
  // annuncio arrivato tardi, ad attacco vicino: il promemoria non serve più
  if (kind === 'announce' && d.startAt - now <= REMINDER_WINDOW_MS)
    await database.ref('sims_meta/hacker/reminder').transaction(() => d.day);
  const message = kind === 'announce' ? announcementPush(d.startAt) : reminderPush(d.startAt);
  const push = (await database.ref('sims_push').get()).val();
  let count = 0;
  if (!record(push)) return 0;
  for (const [pid, entry] of Object.entries(push)) {
    if (!record(entry) || !record(entry.tokens)) continue;
    for (const [key, token] of Object.entries(entry.tokens)) {
      if (!record(token) || typeof token.token !== 'string') continue;
      const res = await send(token.token, { ...message, link: GAME_URL, tag: 'sims-hacker' });
      if (res === 'sent') count++;
      if (res === 'gone') await database.ref(`sims_push/${pid}/tokens/${key}`).remove();
    }
  }
  return count;
}
