// La paga dei turni la decide il Worker di Cloudflare (worker/src/job-shift.ts), non il browser:
// il gioco gli chiede di aprire il turno e, alla fine, di pagarlo. In modalità prova
// (?offline=1) non c'è nessun server e la paga resta locale, come tutto il resto.
import { game } from './context.js';
import { toast } from './missions.js';
import { callWorker as call } from './worker-client.js';
import { LEGACY_WORLD } from '../../shared/worlds.js';
import type { JobKey, ShiftClaim } from '../../shared/job-pay-rules.js';

/** La paga non arrivata si riprova per 24 ore (il Worker la accetta fino a 26). */
const PENDING_MS = 24 * 3600 * 1000;

export const serverPaysJobs = (): boolean => !game.session.OFFLINE;

/** Errori dopo i quali riprovare non serve: la richiesta è stata rifiutata per sempre. */
const FINAL_ERRORS = new Set(['nessun turno', 'troppo presto', 'scaduto', 'stanza', 'richiesta']);

export interface OpenedShift {
  id: string;
  base: number;
  perItem: number;
  /** turni già fatti in questo lavoro, secondo il server */
  exp: number;
}

/** Apre il turno sul server. Senza risposta il turno non parte: si dice perché. */
export async function openServerShift(job: JobKey): Promise<OpenedShift | null> {
  // prima la paga di un turno precedente rimasta in sospeso: aprirne uno nuovo la cancellerebbe
  if (!(await flushPendingPay())) {
    toast('💼 La paga del turno di prima non è ancora arrivata: riprova tra poco.', 4500);
    return null;
  }
  const reply = await call('/lavoro/inizio', {
    job,
    world: game.session.worldId || LEGACY_WORLD,
    room: game.myAssignedRoomIdx,
  });
  if (!reply) {
    toast('💼 Il lavoro è chiuso in questo momento: riprova tra poco.', 4500);
    return null;
  }
  const { shift, base, perItem, exp } = reply;
  if (
    !reply.ok ||
    typeof shift !== 'string' ||
    !Number.isSafeInteger(base) ||
    !Number.isSafeInteger(perItem) ||
    !Number.isSafeInteger(exp)
  ) {
    toast('💼 ' + (reply.message || 'Il turno non può iniziare.'), 4500);
    return null;
  }
  return { id: shift, base: base as number, perItem: perItem as number, exp: exp as number };
}

// ---------------------------------------------------------------- la paga, anche in ritardo

interface Pending extends ShiftClaim {
  shift: string;
  job: JobKey;
  at: number;
}

const pendingKey = () => 'job_pay_pending:' + game.session.myPlayerId;

function readPending(): Pending | null {
  try {
    const value = JSON.parse(localStorage.getItem(pendingKey()) || 'null') as Pending | null;
    if (!value || typeof value.shift !== 'string' || !(Date.now() - value.at < PENDING_MS))
      return null;
    return value;
  } catch {
    return null;
  }
}
function writePending(value: Pending | null): void {
  try {
    if (value) localStorage.setItem(pendingKey(), JSON.stringify(value));
    else localStorage.removeItem(pendingKey());
  } catch {
    /* archivio pieno o bloccato: si riprova solo finché la pagina resta aperta */
  }
}

export type PayOutcome =
  | { kind: 'paid'; pay: number; exp: number | null }
  /** il server non ha risposto: la richiesta è salvata e si riprova da sola */
  | { kind: 'later' }
  | { kind: 'refused'; message: string };

async function sendPay(pending: Pending): Promise<PayOutcome> {
  const { shift, delivered, tips, fine } = pending;
  const reply = await call('/lavoro/fine', { shift, delivered, tips, fine });
  if (!reply) return { kind: 'later' };
  if (reply.ok && Number.isSafeInteger(reply.pay)) {
    writePending(null);
    const exp = Number.isSafeInteger(reply.exp) ? (reply.exp as number) : null;
    if (exp !== null) game.player.jobExperience[pending.job] = exp;
    return { kind: 'paid', pay: reply.pay as number, exp };
  }
  if (reply.error && FINAL_ERRORS.has(reply.error)) {
    writePending(null);
    return { kind: 'refused', message: reply.message || 'Turno non pagato.' };
  }
  return { kind: 'later' };
}

/** Chiede la paga del turno. La richiesta si salva prima: se il server non risponde, resta. */
export function claimServerPay(shift: string, job: JobKey, claim: ShiftClaim): Promise<PayOutcome> {
  const pending: Pending = { shift, job, ...claim, at: Date.now() };
  writePending(pending);
  return sendPay(pending);
}

let flushing: Promise<boolean> | null = null;

/**
 * Riprova la paga rimasta in sospeso (all'ingresso nel gioco e prima di un turno nuovo).
 * True se non resta niente in sospeso.
 */
export function flushPendingPay(): Promise<boolean> {
  if (!serverPaysJobs()) return Promise.resolve(true);
  return (flushing ??= (async () => {
    const pending = readPending();
    if (!pending) {
      writePending(null);
      return true;
    }
    const outcome = await sendPay(pending);
    if (outcome.kind === 'paid')
      toast(`💰 È arrivata la paga del turno di lavoro: +${outcome.pay} Đ`, 4500);
    return outcome.kind !== 'later';
  })().finally(() => {
    flushing = null;
  }));
}
