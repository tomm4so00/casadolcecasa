// Pillola misteriosa: ogni pillola dà dipendenza (come le dosi di prima) più un effetto a caso.
// L'effetto si tira quando la si prende, non quando la si compra: anche chi la riceve in regalo
// non sa cosa gli capita. Nessun effetto uccide. Niente browser qui: la simulazione lo importa.
import type { FluState } from './flu-rules.js';

const MIN = 60_000;
const HOUR = 60 * MIN;

/** Gli effetti, con il loro peso (su 100) e quanto durano (0: subito e basta). */
export const PILL_EFFECTS = {
  euphoria: { weight: 20, ms: 0, icon: '🤩', name: 'Euforia' },
  insomnia: { weight: 15, ms: 3 * HOUR, icon: '👀', name: 'Insonnia' },
  munchies: { weight: 15, ms: 0, icon: '🍔', name: 'Fame improvvisa' },
  sugar: { weight: 15, ms: 0, icon: '🍬', name: 'Zucchero' },
  psychedelic: { weight: 12, ms: 10 * MIN, icon: '🌈', name: 'Colori psichedelici' },
  inverted: { weight: 10, ms: 30_000, icon: '🔄', name: 'Comandi invertiti' },
  lucky: { weight: 8, ms: HOUR, icon: '🍀', name: 'Fortuna al cabinato' },
  fever: { weight: 5, ms: 6 * HOUR, icon: '🤒', name: 'Febbre' },
} as const;
export type PillEffect = keyof typeof PILL_EFFECTS;
const EFFECT_IDS = Object.keys(PILL_EFFECTS) as PillEffect[];

/** Effetti che durano: fino a quando (ms) è attivo ognuno. */
export type PillTimers = Partial<Record<PillEffect, number>>;

/** Fame tolta dalla fame improvvisa. */
export const MUNCHIES_HUNGER = 40;
/** Sotto questa salute la febbre non arriva (diventa zucchero): la pillola non deve uccidere. */
export const FEVER_MIN_HEALTH = 30;

/** L'effetto per un numero a caso `r` tra 0 e 1, secondo i pesi. */
export function rollPillEffect(r: number, health = 100): PillEffect {
  const total = EFFECT_IDS.reduce((sum, id) => sum + PILL_EFFECTS[id].weight, 0);
  let left = Math.min(0.999999, Math.max(0, r)) * total;
  for (const id of EFFECT_IDS) {
    left -= PILL_EFFECTS[id].weight;
    if (left < 0) return id === 'fever' && health <= FEVER_MIN_HEALTH ? 'sugar' : id;
  }
  return 'sugar';
}

export const pillActive = (timers: PillTimers | undefined, id: PillEffect, now: number): boolean =>
  (timers?.[id] ?? 0) > now;

/** Gli effetti che durano, con la nuova scadenza; quelli finiti si tolgono. */
export function withPillTimer(
  timers: PillTimers | undefined,
  id: PillEffect,
  now: number,
): PillTimers {
  const out = pruneTimers(timers, now);
  const ms = PILL_EFFECTS[id].ms;
  if (ms > 0) out[id] = Math.max(out[id] ?? 0, now + ms);
  return out;
}

export function pruneTimers(timers: PillTimers | undefined, now: number): PillTimers {
  const out: PillTimers = {};
  for (const id of EFFECT_IDS) if ((timers?.[id] ?? 0) > now) out[id] = timers![id];
  return out;
}

/** Dal salvataggio: solo effetti conosciuti con una scadenza valida. */
export function decodePillTimers(value: unknown): PillTimers {
  const out: PillTimers = {};
  if (!value || typeof value !== 'object') return out;
  for (const id of EFFECT_IDS) {
    const until = (value as Record<string, unknown>)[id];
    if (typeof until === 'number' && Number.isFinite(until) && until > 0) out[id] = until;
  }
  return out;
}

/** La febbre della pillola usa l'influenza: 6 ore (si attacca anche agli altri). */
export function pillFever(flu: FluState, now: number): FluState {
  const until = now + PILL_EFFECTS.fever.ms;
  const sick = flu.sickAt > 0 && flu.sickAt <= now && flu.until > now;
  return {
    ...flu,
    sickAt: sick ? flu.sickAt : now,
    until: Math.max(sick ? flu.until : 0, until),
    exposedAt: 0,
  };
}

/** Cosa si legge appena presa la pillola. */
export const PILL_TEXT: Record<PillEffect, string> = {
  euphoria: '🤩 Euforia! La felicità vola al massimo.',
  insomnia: '👀 Occhi sbarrati: per 3 ore il sonno non cala, ma non riesci a dormire.',
  munchies: `🍔 Fame improvvisa: la fame scende di ${MUNCHIES_HUNGER} punti.`,
  sugar: '🍬 Era zucchero: ti hanno fregato.',
  psychedelic: '🌈 Il mondo si colora: 10 minuti di colori psichedelici.',
  inverted: '🔄 Destra è sinistra e su è giù: comandi invertiti per 30 secondi.',
  lucky: '🍀 Ti senti fortunato: per un’ora i premi del cabinato sono doppi.',
  fever: '🤒 Brividi e febbre: per 6 ore hai l’influenza (e la puoi attaccare).',
};
