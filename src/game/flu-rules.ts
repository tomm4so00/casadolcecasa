// Influenza (senza dipendenze dal browser, così è testabile).
// Ci si ammala da soli in un momento a caso, al massimo ogni 30 giorni, oppure 30 secondi dopo
// essersi avvicinati a qualcuno che ha l'influenza. Da malati si perde il 3% di salute all'ora per 12 ore.

const HOUR = 3_600_000;
const DAY = 24 * HOUR;

export const FLU_HOURS = 12;
export const FLU_DAMAGE_PER_HOUR = 3;
/** Al massimo tanti giorni fra un'influenza "spontanea" e la successiva. */
export const FLU_MAX_GAP_DAYS = 30;
/** Dopo quanto ci si ammala essendosi avvicinati a un malato. */
export const FLU_CONTAGION_DELAY_MS = 30_000;
/** Dopo la guarigione non ci si riammala per contagio per qualche giorno (sennò ci si passa l'influenza all'infinito). */
export const FLU_IMMUNITY_DAYS = 3;

export interface FluState {
  /** Inizio dell'influenza in corso (0 = mai stati malati). */
  sickAt: number;
  /** Fine dell'influenza in corso. */
  until: number;
  /** Quando arriverà la prossima influenza spontanea (0 = ancora da decidere). */
  nextAt: number;
  /** Quando ci si è avvicinati a un malato (0 = nessun contagio in corso). */
  exposedAt: number;
}

export const healthyFlu = (): FluState => ({ sickAt: 0, until: 0, nextAt: 0, exposedAt: 0 });

export const isSick = (flu: FluState | undefined, now: number): boolean =>
  !!flu && flu.sickAt > 0 && now >= flu.sickAt && now < flu.until;

/** Momento a caso fra adesso e FLU_MAX_GAP_DAYS giorni (`r` fra 0 e 1). */
export const nextFluAt = (from: number, r: number): number =>
  from + Math.max(0, Math.min(1, r)) * FLU_MAX_GAP_DAYS * DAY;

/** Numero "a caso" ma ripetibile, ricavato da un istante: serve dentro la simulazione. */
function pseudoRandom(t: number): number {
  let x = Math.floor(t) % 2147483647 || 1;
  x = (x * 16807) % 2147483647;
  x = (x * 16807) % 2147483647;
  return x / 2147483647;
}

/** Ci si ammala adesso: dura 12 ore, e la prossima influenza spontanea si sposta più avanti. */
export function startFlu(flu: FluState, now: number): void {
  flu.sickAt = now;
  flu.until = now + FLU_HOURS * HOUR;
  flu.exposedAt = 0;
  flu.nextAt = nextFluAt(flu.until, pseudoRandom(now));
}

/** Ci si può contagiare? (non già malati, non già contagiati, non appena guariti) */
export function canCatchFlu(flu: FluState, now: number): boolean {
  return (
    !isSick(flu, now) &&
    !flu.exposedAt &&
    !(flu.sickAt > 0 && now < flu.until + FLU_IMMUNITY_DAYS * DAY)
  );
}

/** Quando partirà la prossima influenza da questo stato (Infinity se non è in programma). */
export function fluOnsetAt(flu: FluState): number {
  const contagion = flu.exposedAt ? flu.exposedAt + FLU_CONTAGION_DELAY_MS : Infinity;
  const natural = flu.nextAt || Infinity;
  return Math.min(contagion, natural);
}

/** Fa partire l'influenza se è arrivato il momento. Restituisce true se è appena iniziata. */
export function updateFluOnset(flu: FluState, now: number): boolean {
  if (isSick(flu, now)) return false;
  const at = fluOnsetAt(flu);
  if (now < at) return false;
  startFlu(flu, at);
  return true;
}

/** Salute persa per l'influenza fra `from` e `to` (in punti percentuali). */
export function fluDamage(flu: FluState, from: number, to: number): number {
  if (!flu.sickAt) return 0;
  const a = Math.max(from, flu.sickAt),
    b = Math.min(to, flu.until);
  return b > a ? ((b - a) / HOUR) * FLU_DAMAGE_PER_HOUR : 0;
}

export function decodeFlu(value: unknown): FluState {
  const out = healthyFlu();
  if (!value || typeof value !== 'object') return out;
  const v = value as Record<string, unknown>;
  for (const key of ['sickAt', 'until', 'nextAt', 'exposedAt'] as const) {
    const n = v[key];
    if (typeof n === 'number' && Number.isFinite(n) && n >= 0) out[key] = n;
  }
  if (out.until < out.sickAt) out.until = out.sickAt;
  return out;
}
