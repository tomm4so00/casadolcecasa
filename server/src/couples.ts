// Anniversari delle coppie (sims_couples): una settimana dopo il fidanzamento, poi ogni mese nello
// stesso giorno. Una notifica a testa, la mattina (dalle 10, ora italiana), una volta al giorno:
// in sims_meta/anniversary si segna il giorno già fatto.
import { romeClock } from '../../shared/hacker-rules.js';
import { anniversaryOn, anniversaryText } from '../../src/game/romance-rules.js';
import { GAME_URL, type MaintenanceDatabase, type PushSender } from './maintenance.js';

/** Dalle 10 del mattino (ora italiana). */
export const ANNIVERSARY_MINUTE = 10 * 60;

type Tree = Record<string, unknown>;
const record = (value: unknown): value is Tree => !!value && typeof value === 'object';

/** Le coppie confermate da tutti e due: giocatore → nome del fidanzato e da quando. */
export function confirmedCouples(couples: unknown): Map<string, { name: string; since: number }> {
  const out = new Map<string, { name: string; since: number }>();
  if (!record(couples)) return out;
  for (const [pid, e] of Object.entries(couples)) {
    if (!record(e) || typeof e.with !== 'string' || typeof e.since !== 'number') continue;
    const other = couples[e.with];
    if (!record(other) || other.with !== pid) continue;
    out.set(pid, { name: typeof e.name === 'string' ? e.name : 'il tuo amore', since: e.since });
  }
  return out;
}

/** Manda gli auguri di oggi; restituisce quante notifiche sono partite (-1: non è il momento). */
export async function notifyAnniversaries(
  database: MaintenanceDatabase,
  now: number,
  send: PushSender,
): Promise<number> {
  const { day, minute } = romeClock(now);
  if (minute < ANNIVERSARY_MINUTE) return -1;
  const done = await database
    .ref('sims_meta/anniversary')
    .transaction((value) => (value === day ? undefined : day));
  if (!done.committed) return -1;
  const couples = confirmedCouples((await database.ref('sims_couples').get()).val());
  let sent = 0;
  for (const [pid, c] of couples) {
    const a = anniversaryOn(romeClock(c.since).day, day);
    if (!a) continue;
    const push = (await database.ref('sims_push/' + pid).get()).val();
    if (!record(push) || !record(push.tokens)) continue;
    for (const [key, entry] of Object.entries(push.tokens)) {
      if (!record(entry) || typeof entry.token !== 'string') continue;
      const res = await send(entry.token, {
        title: '💞 Anniversario!',
        body: anniversaryText(c.name, a) + ' Entra a festeggiare in Casa dolce casa.',
        link: GAME_URL,
        tag: 'sims-anniversary',
      });
      if (res === 'sent') sent++;
      if (res === 'gone') await database.ref(`sims_push/${pid}/tokens/${key}`).remove();
    }
  }
  return sent;
}
