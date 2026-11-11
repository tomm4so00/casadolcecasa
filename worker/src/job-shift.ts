// La paga dei turni di lavoro, decisa dal Worker e non dal browser. Il giocatore è già
// riconosciuto (firebase-auth.ts): qui si controlla il resto e si scrive nel database.
//   POST /lavoro/inizio  { job, world, room }            → apre il turno in sims_jobs/<uid>
//   POST /lavoro/fine    { shift, delivered, tips, fine } → chiude il turno e versa la paga
// Le regole del tempo e della paga sono in shared/job-pay-rules.ts. Questo file si prova con il
// database locale del gioco (tests/job-worker.test.ts).
import {
  type JobState,
  closeShift,
  decodeClaim,
  decodeJobState,
  importExperience,
  isJobKey,
  markPaid,
  shiftsLeft,
  startShift,
} from '../../shared/job-pay-rules.js';
import { WORLD_ROOMS, isWorldCode, worldNodePath } from '../../shared/worlds.js';

interface Snapshot {
  val(): unknown;
}
interface Reference {
  get(): Promise<Snapshot>;
  transaction(
    update: (value: unknown) => unknown,
  ): Promise<{ committed: boolean; snapshot: Snapshot }>;
}
export interface JobDatabase {
  ref(path: string): Reference;
}

export interface JobReply {
  status: number;
  body: Record<string, unknown>;
}

/** Il massimo in una cassaforte (come le regole del database). */
const VAULT_MAX = 1_000_000;

/** La sessione si rinnova ogni pochi secondi e scade dopo 45: un po' di margine per la rete. */
const SESSION_GRACE = 30_000;

export const fail = (status: number, error: string, message: string): JobReply => ({
  status,
  body: { ok: false, error, message },
});

const record = (value: unknown): value is Record<string, unknown> =>
  !!value && typeof value === 'object';

/** Firebase non accetta campi undefined. */
const plain = (state: JobState): unknown => JSON.parse(JSON.stringify(state));

const jobsPath = (uid: string) => 'sims_jobs/' + uid;

/** Il personaggio dell'account, se in questo momento è aperto nel gioco. */
export async function playerOf(
  db: JobDatabase,
  uid: string,
  now: number,
): Promise<string | JobReply> {
  const playerId = (await db.ref(`sims_accounts/${uid}/playerId`).get()).val();
  if (typeof playerId !== 'string' || !playerId)
    return fail(403, 'account', 'Questo account non ha un personaggio.');
  const session = (await db.ref('sims_sessions/' + playerId).get()).val();
  const expiresAt = record(session) ? session.expiresAt : undefined;
  if (typeof expiresAt !== 'number' || expiresAt < now - SESSION_GRACE)
    return fail(403, 'sessione', 'Il tuo personaggio non risulta aperto: ricarica il gioco.');
  return playerId;
}

/** Apre un turno: controlla i turni del giorno e la stanza in cui andrà la paga. */
export async function startJob(
  db: JobDatabase,
  uid: string,
  body: unknown,
  now: number,
  newId: () => string,
): Promise<JobReply> {
  const b = record(body) ? body : {};
  const { job, world, room } = b;
  if (
    !isJobKey(job) ||
    typeof world !== 'string' ||
    !isWorldCode(world) ||
    !Number.isSafeInteger(room) ||
    (room as number) < 0 ||
    (room as number) >= WORLD_ROOMS
  )
    return fail(400, 'richiesta', 'Richiesta non valida.');
  const playerId = await playerOf(db, uid, now);
  if (typeof playerId !== 'string') return playerId;
  const roomPath = `${worldNodePath(world, 'rooms_state')}/${room}`;
  if ((await db.ref(roomPath + '/ownerId').get()).val() !== playerId)
    return fail(403, 'stanza', 'Serve la tua stanza con la cassaforte per lavorare.');

  const reference = db.ref(jobsPath(uid));
  // I turni fatti finora si copiano dal salvataggio la prima volta (importExperience).
  let saved = { exp: null as unknown, active: null as unknown };
  if (!decodeJobState((await reference.get()).val()).imported) {
    const save = 'sims_saves/' + playerId;
    saved = {
      exp: (await db.ref(save + '/jobExperience').get()).val(),
      active: (await db.ref(save + '/activeJobKey').get()).val(),
    };
  }
  const id = newId();
  let opened: { state: JobState; base: number; perItem: number } | null = null;
  const result = await reference.transaction((current) => {
    const outcome = startShift(
      importExperience(decodeJobState(current), saved),
      job,
      roomPath,
      id,
      now,
    );
    if (!outcome.ok) {
      opened = null;
      return undefined;
    }
    opened = { state: outcome.state, base: outcome.shift.base, perItem: outcome.shift.perItem };
    return plain(outcome.state);
  });
  const done = opened as { state: JobState; base: number; perItem: number } | null;
  if (!result.committed || !done)
    return fail(429, 'limite', 'Oggi sei già andato al lavoro il numero massimo di volte.');
  return {
    status: 200,
    body: {
      ok: true,
      shift: id,
      base: done.base,
      perItem: done.perItem,
      exp: done.state.exp[job] ?? 0,
      left: shiftsLeft(done.state, now),
    },
  };
}

const CLOSE_ERRORS = {
  'nessun turno': [404, 'Questo turno non risulta aperto: non viene pagato.'],
  'troppo presto': [400, 'Il turno non è ancora finito.'],
  scaduto: [410, 'La paga di questo turno non si può più chiedere.'],
} as const;

/** Chiude il turno e versa la paga nella cassaforte, una volta sola. */
export async function endJob(
  db: JobDatabase,
  uid: string,
  body: unknown,
  now: number,
): Promise<JobReply> {
  const b = record(body) ? body : {};
  const id = b.shift;
  const claim = decodeClaim(b);
  if (typeof id !== 'string' || id.length > 64 || !claim)
    return fail(400, 'richiesta', 'Richiesta non valida.');
  const playerId = await playerOf(db, uid, now);
  if (typeof playerId !== 'string') return playerId;

  // 1. si chiude il turno: da qui in poi una seconda richiesta non lo trova più aperto
  const reference = db.ref(jobsPath(uid));
  await reference.get();
  let outcome: ReturnType<typeof closeShift> | null = null;
  await reference.transaction((current) => {
    outcome = closeShift(decodeJobState(current), id, claim, now);
    return outcome.kind === 'pay' ? plain(outcome.state) : undefined;
  });
  const closed = outcome as ReturnType<typeof closeShift> | null;
  if (!closed) return fail(500, 'temporaneo', 'Riprova tra poco.');
  if (closed.kind === 'paid')
    return { status: 200, body: { ok: true, pay: closed.pay, already: true } };
  if (closed.kind === 'busy') return fail(409, 'in corso', 'La paga sta arrivando.');
  if (closed.kind === 'error') {
    const [status, message] = CLOSE_ERRORS[closed.error];
    return fail(status, closed.error, message);
  }

  // 2. la paga in cassaforte, se la stanza è ancora del giocatore
  const finish = (paid: number) =>
    reference.transaction((current) => {
      const next = markPaid(decodeJobState(current), id);
      if (!next?.last) return undefined;
      next.last.pay = paid;
      return plain(next);
    });
  if ((await db.ref(closed.room + '/ownerId').get()).val() !== playerId) {
    await finish(0);
    return fail(409, 'stanza', 'La stanza non è più tua: la paga del turno è persa.');
  }
  const vault = db.ref(closed.room + '/vaultMoney');
  await vault.get();
  const credited = await vault.transaction((current) => {
    const balance = current ?? 0;
    if (!Number.isSafeInteger(balance) || (balance as number) < 0) return undefined;
    return Math.min(VAULT_MAX, (balance as number) + closed.pay);
  });
  if (!credited.committed) return fail(500, 'temporaneo', 'Cassaforte non aggiornata.');

  // 3. fatto: le richieste ripetute ricevono la stessa paga senza versarla di nuovo
  await finish(closed.pay);
  return {
    status: 200,
    body: { ok: true, pay: closed.pay, exp: closed.state.exp[closed.job] ?? 0 },
  };
}
