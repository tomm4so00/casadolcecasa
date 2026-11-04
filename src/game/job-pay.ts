// Regole della paga dei turni di lavoro (senza dipendenze dal browser, così sono testabili).

// Livelli di carriera: paga base del turno ed euro extra per ogni oggetto consegnato.
// `from` è il numero del turno (1 = primo turno) da cui vale il livello.
export const JOB_PAY_TIERS = [
  { from: 1, base: 40, perItem: 5 },
  { from: 31, base: 60, perItem: 8 },
  { from: 61, base: 90, perItem: 12 },
] as const;

export function jobPayTier(turn: number) {
  return [...JOB_PAY_TIERS].reverse().find((tier) => turn >= tier.from) ?? JOB_PAY_TIERS[0];
}

// Spiega quanti turni mancano al prossimo aumento, dopo averne completati `done`.
export function nextPayMessage(done: number): string {
  const nextTurn = done + 1;
  const next = JOB_PAY_TIERS.find((tier) => tier.from > nextTurn);
  const current = jobPayTier(nextTurn);
  const now =
    current.from === nextTurn && nextTurn > 1
      ? `🎉 Dal prossimo turno guadagni ${current.base} € + ${current.perItem} € per oggetto!\n\n`
      : '';
  if (!next) {
    return (
      now +
      `🏆 Hai raggiunto la paga massima: ${current.base} € a turno + ${current.perItem} € per ogni oggetto consegnato.`
    );
  }
  const missing = next.from - nextTurn;
  return (
    now +
    `📈 Ancora ${missing} ${missing === 1 ? 'turno' : 'turni'} in questo lavoro e passi a ` +
    `${next.base} € a turno + ${next.perItem} € per ogni oggetto consegnato ` +
    `(ora: ${current.base} € + ${current.perItem} € per oggetto).`
  );
}

// ---------------------------------------------------------------- turni al giorno

/** Quante volte al giorno si può andare al lavoro (il conteggio riparte a mezzanotte). */
export const SHIFTS_PER_DAY = 4;

export interface WorkDay {
  /** Giorno (AAAA-MM-GG) a cui si riferisce il conteggio. */
  day: string;
  /** Turni iniziati in quel giorno. */
  count: number;
}

const dayKey = (now: Date) =>
  `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;

/** Turni che si possono ancora iniziare oggi. */
export function shiftsLeftToday(state: WorkDay | undefined, now: Date): number {
  const used = state && state.day === dayKey(now) ? state.count : 0;
  return Math.max(0, SHIFTS_PER_DAY - used);
}

/** Registra l'inizio di un turno e restituisce il nuovo stato. */
export function recordShift(state: WorkDay | undefined, now: Date): WorkDay {
  const day = dayKey(now);
  return { day, count: (state && state.day === day ? state.count : 0) + 1 };
}

/** Legge il conteggio dal salvataggio scartando i valori non validi. */
export function decodeWorkDay(value: unknown): WorkDay | undefined {
  if (!value || typeof value !== 'object') return undefined;
  const { day, count } = value as Record<string, unknown>;
  if (typeof day !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(day)) return undefined;
  if (!Number.isSafeInteger(count) || (count as number) < 0) return undefined;
  return { day, count: Math.min(count as number, SHIFTS_PER_DAY) };
}
