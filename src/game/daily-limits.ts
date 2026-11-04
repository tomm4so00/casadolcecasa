// Azioni con un massimo al giorno (il conteggio riparte a mezzanotte), senza dipendenze dal browser.

/** Quante volte al giorno si può fare ogni azione. */
export const DAILY_LIMITS = {
  /** Viaggio ✈️ */
  trip: 1,
  /** WC 🚽 */
  wc: 2,
  /** Discoteca 🕺 */
  disco: 2,
  /** Bar ☕ */
  bar: 3,
  /** Passeggiata 🌳 */
  walk: 3,
} as const;
type DailyAction = keyof typeof DAILY_LIMITS;

export interface DailyUses {
  /** Giorno (AAAA-MM-GG) a cui si riferiscono i conteggi. */
  day: string;
  uses: Partial<Record<DailyAction, number>>;
}

const dayKey = (now: Date) =>
  `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;

/** Quante volte si può ancora fare l'azione oggi. */
export function usesLeftToday(
  state: DailyUses | undefined,
  action: DailyAction,
  now: Date,
): number {
  const used = state && state.day === dayKey(now) ? state.uses[action] || 0 : 0;
  return Math.max(0, DAILY_LIMITS[action] - used);
}

/** Registra un uso dell'azione e restituisce il nuovo stato. */
export function recordUse(state: DailyUses | undefined, action: DailyAction, now: Date): DailyUses {
  const day = dayKey(now);
  const uses = state && state.day === day ? { ...state.uses } : {};
  uses[action] = (uses[action] || 0) + 1;
  return { day, uses };
}

/** Legge i conteggi dal salvataggio scartando i valori non validi. */
export function decodeDailyUses(value: unknown): DailyUses | undefined {
  if (!value || typeof value !== 'object') return undefined;
  const { day, uses } = value as Record<string, unknown>;
  if (typeof day !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(day)) return undefined;
  const out: DailyUses = { day, uses: {} };
  if (uses && typeof uses === 'object')
    for (const action of Object.keys(DAILY_LIMITS) as DailyAction[]) {
      const n = (uses as Record<string, unknown>)[action];
      if (Number.isSafeInteger(n) && (n as number) > 0)
        out.uses[action] = Math.min(n as number, DAILY_LIMITS[action]);
    }
  return out;
}
