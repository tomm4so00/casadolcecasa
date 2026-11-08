// Consumo dell'erba: effetto e attesa sono separati e continuano a gioco chiuso.
export const JOINT_EFFECT_MS = 10 * 60_000;
export const JOINT_COOLDOWN_MS = 30 * 60_000;
export const JOINT_ANIMATION_MS = 7000;
export const JOINT_SPEED_FACTOR = 0.9;

export const jointSpeed = (effectUntil: number, now: number): number =>
  effectUntil > now ? JOINT_SPEED_FACTOR : 1;

/** Nei vecchi salvataggi la fine dell'effetto è l'unico riferimento al consumo. */
export const jointReadyAt = (readyAt: number | undefined, effectUntil: number): number =>
  readyAt ?? (effectUntil > 0 ? effectUntil + JOINT_COOLDOWN_MS - JOINT_EFFECT_MS : 0);

/** Il laboratorio condivide la scena con l'esterno; sulla luna serve il casco. */
export function jointOutdoors(env: string, outdoor: boolean, y: number, labWallY: number): boolean {
  if (env === 'luna' || env === 'base_lunare') return false;
  if (env === 'ingegneria') return y < labWallY;
  return outdoor;
}

export function jointUseError(
  grams: number,
  outdoors: boolean,
  readyAt: number,
  now: number,
  busy: boolean,
): string | null {
  if (grams < 1) return 'Non hai erba nello zaino.';
  if (!outdoors) return 'Qui non puoi fumare. Vai all’aperto.';
  const left = readyAt - now;
  if (left > 0) return `Aspetta ancora ${Math.ceil(left / 60_000)} min prima di fumarne un’altra.`;
  if (busy) return 'Finisci prima quello che stai facendo.';
  return null;
}
