// Cabinato dei minigiochi (senza dipendenze dal browser, così è testabile): i giochi, i record e
// i premi. Le stesse soglie stanno nelle regole del database (firebase/world-rules.mjs).

export type CabinetGameId = 'dog' | 'bricks' | 'meteors';

export const CABINET_GAMES: Record<CabinetGameId, { name: string; emoji: string; how: string }> = {
  dog: {
    name: 'Cane in fuga',
    emoji: '🐕',
    how: 'Salta con ▲, Spazio o toccando A; abbassati con ▼ sotto i piccioni.',
  },
  bricks: {
    name: 'Mattoncini',
    emoji: '🧱',
    how: 'Muovi la racchetta con ◀ ▶ (o trascinando il dito); A o Spazio lancia la pallina.',
  },
  meteors: {
    name: 'Pioggia di meteore',
    emoji: '☄️',
    how: 'Sposta il razzo con ◀ ▶ e spara con A o Spazio: se una meteora ti colpisce è finita.',
  },
};

export const CABINET_IDS = Object.keys(CABINET_GAMES) as CabinetGameId[];

export const isCabinetGame = (v: unknown): v is CabinetGameId =>
  typeof v === 'string' && (CABINET_IDS as string[]).includes(v);

/**
 * Punti al secondo che nessuno può superare giocando davvero (con un margine): le regole del
 * database rifiutano un punteggio più alto del tempo passato dall'inizio della partita.
 */
export const MAX_POINTS_PER_SECOND: Record<CabinetGameId, number> = {
  dog: 25,
  bricks: 20,
  meteors: 40,
};
/** Punti concessi comunque, oltre al conto sul tempo (l'ora della partenza è arrotondata). */
export const SCORE_SLACK = 100;
export const MAX_SCORE = 1_000_000;

/** Il punteggio è credibile per una partita iniziata `ms` millisecondi fa? */
export function plausibleScore(game: CabinetGameId, score: number, ms: number): boolean {
  return (
    Number.isSafeInteger(score) &&
    score > 0 &&
    score <= MAX_SCORE &&
    score <= (Math.max(0, ms) / 1000) * MAX_POINTS_PER_SECOND[game] + SCORE_SLACK
  );
}

/** Premi in euro per chi batte il record del condominio o quello mondiale. */
export const RECORD_PRIZE = { world: 50, global: 200 } as const;
/**
 * Punteggio minimo per il premio: in un condominio nuovo il primo record è facile, e non
 * deve bastare una partita da pochi punti per incassare.
 */
export const PRIZE_MIN_SCORE: Record<CabinetGameId, number> = {
  dog: 400,
  bricks: 300,
  meteors: 600,
};

export interface CabinetRecord {
  score: number;
  pid: string;
  nick: string;
  t: number;
}

export function decodeRecord(value: unknown): CabinetRecord | null {
  if (!value || typeof value !== 'object') return null;
  const { score, pid, nick, t } = value as Record<string, unknown>;
  if (!Number.isSafeInteger(score) || (score as number) <= 0) return null;
  if (typeof pid !== 'string' || typeof nick !== 'string') return null;
  return { score: score as number, pid, nick: nick.slice(0, 20), t: typeof t === 'number' ? t : 0 };
}

/** Il miglior punteggio personale salvato (0 se non c'è). */
export function decodeBest(value: unknown): number {
  const score = value && typeof value === 'object' ? (value as { score?: unknown }).score : null;
  return Number.isSafeInteger(score) && (score as number) > 0 ? (score as number) : 0;
}

export const beats = (score: number, record: CabinetRecord | null): boolean =>
  score > (record?.score || 0);

/**
 * Il premio per aver battuto `before` con `score`: solo strappando il record a qualcun altro
 * (chi lo ha già e lo migliora non incassa di nuovo) e sopra la soglia minima del gioco.
 */
export function recordPrize(
  game: CabinetGameId,
  kind: keyof typeof RECORD_PRIZE,
  score: number,
  before: CabinetRecord | null,
  me: string,
): number {
  if (!beats(score, before) || score < PRIZE_MIN_SCORE[game]) return 0;
  if (before && before.pid === me) return 0;
  return RECORD_PRIZE[kind];
}

/** Una partita alla console della sala giochi (a casa, con il proprio cabinato, si gioca gratis). */
export const CONSOLE_COIN = 2;

// ---------------------------------------------------------------- classifiche

/** Quanti si vedono nelle classifiche (del condominio e del mondo). */
export const BOARD_SIZE = 10;

export interface BoardEntry {
  pid: string;
  nick: string;
  score: number;
}

/**
 * Una classifica letta dal database (giocatore → miglior punteggio): i primi BOARD_SIZE dal più
 * alto, scartando le voci rovinate. A parità di punti viene prima chi li ha fatti prima.
 */
export function decodeBoard(value: unknown): BoardEntry[] {
  if (!value || typeof value !== 'object') return [];
  const out: (BoardEntry & { t: number })[] = [];
  for (const [pid, v] of Object.entries(value as Record<string, unknown>)) {
    if (!v || typeof v !== 'object') continue;
    const { score, nick, t } = v as Record<string, unknown>;
    if (!Number.isSafeInteger(score) || (score as number) <= 0) continue;
    out.push({
      pid,
      nick: typeof nick === 'string' && nick ? nick.slice(0, 20) : 'Giocatore',
      score: score as number,
      t: typeof t === 'number' ? t : 0,
    });
  }
  return out
    .sort((a, b) => b.score - a.score || a.t - b.t)
    .slice(0, BOARD_SIZE)
    .map(({ pid, nick, score }) => ({ pid, nick, score }));
}

/** Il primo della classifica, come record da battere (per il premio). */
export const boardLeader = (board: BoardEntry[]): CabinetRecord | null =>
  board[0] ? { ...board[0], t: 0 } : null;
