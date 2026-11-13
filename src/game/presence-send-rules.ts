// Come si manda la propria presenza (sims_online_players/<id>) consumando poca banda.
// Ogni scrittura arriva a tutti i giocatori del mondo, e Firebase ci aggiunge il percorso della
// scheda (circa 200 byte a messaggio anche se dentro ci sono 20 byte): sul piano gratuito
// (10 GB al mese) conta soprattutto quanti messaggi si mandano. Allora:
// - la posizione parte con la velocità (vx, vy): gli altri fanno camminare il personaggio da soli
//   (remote-motion.ts) e un nuovo punto serve solo alla partenza, alla fermata, quando la loro
//   stima sbaglierebbe di più di DRIFT_PX (curve, joystick) e una volta al secondo per sicurezza;
// - delle altre voci si manda solo quello che è cambiato;
// - la scheda intera va solo ogni tanto, per rimettere a posto ciò che altri hanno toccato (il
//   segno "offline" del server, una scrittura persa).
// Senza dipendenze dal browser, così è testabile.

/** Ogni quanto si guarda se mandare qualcosa (ms): non costa niente, nessun invio è automatico. */
export const PRESENCE_TICK_MS = 100;
/** Battito anche da fermi (ms): per gli altri si è ancora qui. */
export const PRESENCE_BEAT_MS = 5000;
/** Ogni quanto si rimanda la scheda intera (ms). */
export const PRESENCE_FULL_MS = 30_000;
/** Camminando, un punto nuovo almeno ogni tanto (ms). */
export const MOVING_REFRESH_MS = 1000;
/** Di quanto (unità di gioco) può sbagliare la stima degli altri prima di mandare un punto. */
export const DRIFT_PX = 8;
/** Sotto questa velocità (unità al secondo) si è fermi. */
const STILL_SPEED = 5;
/** Oltre questa velocità è un salto (porta, cambio stanza), non un passo. */
const JUMP_SPEED = 1500;

export type PresencePayload = Record<string, unknown>;

/** Le voci del movimento: partono sempre insieme, con l'ora. */
const MOTION_KEYS = ['x', 'y', 'vx', 'vy'] as const;

export interface PresenceMotion {
  x: number;
  y: number;
  vx: number;
  vy: number;
}

/**
 * La velocità fra due posizioni lette a `dtMs` di distanza, arrotondata a 5 unità al secondo:
 * zero da fermi e dopo un salto.
 */
export function velocity(
  prev: { x: number; y: number },
  cur: { x: number; y: number },
  dtMs: number,
): { vx: number; vy: number } {
  if (dtMs <= 0) return { vx: 0, vy: 0 };
  const vx = ((cur.x - prev.x) * 1000) / dtMs;
  const vy = ((cur.y - prev.y) * 1000) / dtMs;
  const speed = Math.hypot(vx, vy);
  if (speed < STILL_SPEED || speed > JUMP_SPEED) return { vx: 0, vy: 0 };
  return { vx: Math.round(vx / 5) * 5, vy: Math.round(vy / 5) * 5 };
}

const moving = (m: PresenceMotion): boolean => m.vx !== 0 || m.vy !== 0;

function motionOf(p: PresencePayload): PresenceMotion {
  return { x: Number(p.x) || 0, y: Number(p.y) || 0, vx: Number(p.vx) || 0, vy: Number(p.vy) || 0 };
}

/** Serve un punto nuovo? `sent` è l'ultimo mandato, `elapsed` i ms passati da allora. */
export function motionNeedsSend(
  sent: PresenceMotion,
  cur: PresenceMotion,
  elapsed: number,
): boolean {
  if (moving(sent) !== moving(cur)) return true;
  const px = sent.x + (sent.vx * elapsed) / 1000;
  const py = sent.y + (sent.vy * elapsed) / 1000;
  if (Math.hypot(cur.x - px, cur.y - py) > DRIFT_PX) return true;
  return moving(cur) && elapsed >= MOVING_REFRESH_MS;
}

/**
 * Le voci cambiate fra l'ultima scheda mandata e la nuova; quelle sparite valgono null, così
 * Firebase le toglie (per esempio `sick` quando passa l'influenza).
 */
export function presenceDiff(prev: PresencePayload, next: PresencePayload): PresencePayload {
  const out: PresencePayload = {};
  for (const [key, value] of Object.entries(next))
    if (JSON.stringify(value ?? null) !== JSON.stringify(prev[key] ?? null))
      out[key] = value ?? null;
  for (const key of Object.keys(prev)) if (!(key in next) && prev[key] != null) out[key] = null;
  return out;
}

function withoutMotion(p: PresencePayload): PresencePayload {
  const out = { ...p };
  for (const key of MOTION_KEYS) delete out[key];
  return out;
}

/**
 * Che cosa mandare adesso: `full` la scheda intera (la prima volta, dopo una riconnessione o una
 * scrittura fallita, e ogni PRESENCE_FULL_MS), `diff` le voci cambiate più il movimento (sempre
 * tutto insieme: un'ora nuova con una posizione vecchia farebbe tornare indietro il personaggio),
 * `none` niente.
 */
export function presenceSend(state: {
  /** l'ultima scheda mandata, null se va rimandata intera */
  last: PresencePayload | null;
  next: PresencePayload;
  now: number;
  lastSentAt: number;
  lastFullAt: number;
}): { kind: 'full' } | { kind: 'diff'; changes: PresencePayload } | { kind: 'none' } {
  if (!state.last || state.now - state.lastFullAt > PRESENCE_FULL_MS) return { kind: 'full' };
  const changes = presenceDiff(withoutMotion(state.last), withoutMotion(state.next));
  const elapsed = state.now - state.lastSentAt;
  const motion = motionOf(state.next);
  if (
    Object.keys(changes).length ||
    motionNeedsSend(motionOf(state.last), motion, elapsed) ||
    elapsed > PRESENCE_BEAT_MS
  )
    return { kind: 'diff', changes: { ...changes, ...motion } };
  return { kind: 'none' };
}
