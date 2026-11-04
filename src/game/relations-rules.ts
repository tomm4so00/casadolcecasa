// Memoria delle relazioni: ogni personaggio ricorda come lo hanno trattato gli altri
// (senza dipendenze dal browser, così è testabile).

/** Cose che si ricevono da un altro giocatore. */
export type RelationAct = 'talk' | 'praise' | 'food' | 'gift' | 'insult' | 'punch' | 'theft';

/** Quanto pesa ogni gesto ricevuto: positivi verso "amico", negativi verso "nemico". */
const RELATION_POINTS: Record<RelationAct, number> = {
  talk: 1,
  praise: 2,
  food: 3,
  gift: 3,
  insult: -2,
  punch: -3,
  theft: -8,
};

/** Da qui in su è un amico (es. 3 chiacchiere e 2 complimenti, o 2 piatti di cibo). */
export const FRIEND_AT = 6;
/** Da qui in giù è un nemico (es. 2 insulti e un pugno, o un furto). */
export const ENEMY_AT = -6;
/** Il punteggio non va oltre: così si può sempre fare pace (o litigare) con qualche gesto. */
export const RELATION_LIMIT = 20;
/** Quante persone si ricordano al massimo (le più vecchie vengono dimenticate). */
export const RELATION_MAX = 60;

type RelationKind = 'friend' | 'enemy';

interface RelationEntry {
  /** Nome dell'altro giocatore, per i messaggi. */
  name: string;
  score: number;
  /** Ultimo gesto ricevuto. */
  t: number;
}
export type RelationBook = Record<string, RelationEntry>;

/** Amico, nemico o niente in base al punteggio. */
export function relationKind(score: number | undefined): RelationKind | null {
  if (score === undefined) return null;
  if (score >= FRIEND_AT) return 'friend';
  if (score <= ENEMY_AT) return 'enemy';
  return null;
}

/**
 * Registra un gesto ricevuto da `fromId`. Restituisce la nuova relazione se è appena cambiata
 * (per avvisare "ora è un tuo amico/nemico"), altrimenti undefined.
 */
export function noteRelation(
  book: RelationBook,
  fromId: string,
  fromName: string,
  act: RelationAct,
  now: number,
): RelationKind | null | undefined {
  const entry = (book[fromId] ??= { name: fromName, score: 0, t: now });
  const before = relationKind(entry.score);
  entry.name = fromName.slice(0, 20) || entry.name;
  entry.score = Math.max(
    -RELATION_LIMIT,
    Math.min(RELATION_LIMIT, entry.score + RELATION_POINTS[act]),
  );
  entry.t = now;
  trimRelations(book);
  const after = relationKind(entry.score);
  return after !== before ? after : undefined;
}

/** Tiene solo le persone con cui c'è stato qualcosa di recente. */
function trimRelations(book: RelationBook): RelationBook {
  const ids = Object.keys(book);
  if (ids.length <= RELATION_MAX) return book;
  ids.sort((a, b) => book[a].t - book[b].t);
  for (const id of ids.slice(0, ids.length - RELATION_MAX)) delete book[id];
  return book;
}

/** Legge le relazioni dal salvataggio scartando i valori non validi. */
export function decodeRelations(value: unknown): RelationBook {
  const book: RelationBook = {};
  if (!value || typeof value !== 'object' || Array.isArray(value)) return book;
  for (const [id, raw] of Object.entries(value as Record<string, unknown>)) {
    if (!/^player_[A-Za-z0-9_-]{1,128}$/.test(id) || !raw || typeof raw !== 'object') continue;
    const e = raw as Record<string, unknown>;
    if (typeof e.name !== 'string' || !Number.isFinite(e.score)) continue;
    const t = Number.isFinite(e.t) && (e.t as number) >= 0 ? (e.t as number) : 0;
    book[id] = {
      name: e.name.slice(0, 20),
      score: Math.max(-RELATION_LIMIT, Math.min(RELATION_LIMIT, Math.round(e.score as number))),
      t,
    };
  }
  return trimRelations(book);
}
