// L'indizio di Zero: durante i 10 minuti del suo attacco, chi scassina vede la prima cifra della
// combinazione. Il PIN è nel nodo privato sims_safe_pins, che i giocatori non leggono: la cifra
// la trova il Worker e la dice solo mentre l'attacco è in corso (shared/hacker-rules.ts).
//   POST /scasso/indizio  { world, room }  → { ok, digit }
import { hackerPhase } from '../../shared/hacker-rules.js';
import { allPins, hashPin } from '../../shared/safe-pin-rules.js';
import { WORLD_ROOMS, isWorldCode, worldNodePath } from '../../shared/worlds.js';
import { type JobDatabase, type JobReply, fail, playerOf } from './job-shift.js';

export async function safeHint(
  db: JobDatabase,
  uid: string,
  body: unknown,
  now: number,
): Promise<JobReply> {
  const b = body && typeof body === 'object' ? (body as Record<string, unknown>) : {};
  const { world, room } = b;
  if (
    typeof world !== 'string' ||
    !isWorldCode(world) ||
    !Number.isSafeInteger(room) ||
    (room as number) < 0 ||
    (room as number) >= WORLD_ROOMS
  )
    return fail(400, 'richiesta', 'Richiesta non valida.');
  if (hackerPhase(now) !== 'active') return fail(403, 'zero', 'Zero non sta attaccando adesso.');
  const playerId = await playerOf(db, uid, now);
  if (typeof playerId !== 'string') return playerId;
  const owner = (
    await db.ref(`${worldNodePath(world, 'rooms_state')}/${room}/ownerId`).get()
  ).val();
  if (typeof owner !== 'string' || !owner || owner === playerId)
    return fail(400, 'stanza', 'Qui non c’è una cassaforte da scassinare.');
  const pin = (await db.ref('sims_safe_pins/' + owner).get()).val();
  const code = typeof pin === 'string' ? allPins().find((c) => hashPin(c, owner) === pin) : null;
  return { status: 200, body: { ok: true, digit: code ? code[0] : '' } };
}
