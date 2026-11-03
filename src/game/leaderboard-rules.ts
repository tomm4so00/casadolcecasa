// Classifiche (senza dipendenze dal browser, così sono testabili).

export type LeaderboardMode = 'wealth' | 'lived';

export interface LeaderboardRow {
  id: string;
  name: string;
  /** Euro (più ricchi) o millisecondi di vita (più longevi). */
  value: number;
  /** Personaggio morto (solo per i più longevi). */
  dead?: boolean;
}

const MEDALS = ['🥇', '🥈', '🥉'];
/** Posizione: medaglia per i primi tre, poi il numero. */
export const rankLabel = (i: number): string => MEDALS[i] || `${i + 1}.`;

type Entries = Record<string, Record<string, unknown> | null | undefined>;
const nameOf = (v: Record<string, unknown>): string =>
  typeof v.name === 'string' && v.name.trim() ? v.name.slice(0, 20) : 'Giocatore';

/** Più ricchi: tutti quelli con un patrimonio, dal più ricco. */
export function wealthRows(lb: Entries): LeaderboardRow[] {
  return Object.entries(lb || {})
    .filter(([, v]) => v && typeof v.wealth === 'number' && Number.isFinite(v.wealth))
    .map(([id, v]) => ({ id, name: nameOf(v!), value: v!.wealth as number }))
    .sort((a, b) => b.value - a.value || a.name.localeCompare(b.name));
}

/** Più longevi: i vivi (da quando sono nati) e i morti del cimitero (quanto hanno vissuto). */
export function livedRows(lb: Entries, graveyard: Entries, now: number): LeaderboardRow[] {
  const alive = Object.entries(lb || {})
    .filter(([, v]) => v && typeof v.bornAt === 'number' && (v.bornAt as number) > 0)
    .map(([id, v]) => ({ id, name: nameOf(v!), value: Math.max(0, now - (v!.bornAt as number)) }));
  const dead = Object.entries(graveyard || {})
    .filter(([, v]) => v && typeof v.lived === 'number')
    .map(([id, v]) => ({ id, name: nameOf(v!), value: v!.lived as number, dead: true }));
  return [...alive, ...dead].sort((a, b) => b.value - a.value || a.name.localeCompare(b.name));
}
