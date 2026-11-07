// Mondi (condomini): ognuno ha le sue 64 stanze, i suoi giocatori, la sua chat e il suo cimitero.
// Account, salvataggi, borsa, pezzi da collezione ed edizioni limitate restano di tutti: seguono
// il giocatore quando cambia mondo. Regole senza browser: le usano il gioco e il server.

/** Il condominio di sempre: i suoi dati restano dove stavano (sims_*), così non si sposta nulla. */
export const LEGACY_WORLD = 'CASA-0001';

/** Ogni giocatore crea al massimo un mondo ogni 10 minuti (le regole lo controllano). */
export const WORLD_CREATE_EVERY_MS = 600000;

/** Stanze di ogni mondo (8 appartamenti da 8). */
export const WORLD_ROOMS = 64;

/** I nodi del database che appartengono a un mondo; tutti gli altri sono di tutti i giocatori. */
export const WORLD_NODES = [
  'rooms_state',
  'online_players',
  'chat',
  'gossip',
  'graveyard',
  'interactions',
  'projects',
  'games',
  'rps',
  'theft',
  'leaderboard',
] as const;
export type WorldNode = (typeof WORLD_NODES)[number];

/** Lettere e cifre dei codici: senza 0/O, 1/I/L, che si confondono quando li si detta. */
export const CODE_ALPHABET = '23456789ABCDEFGHJKMNPQRSTUVWXYZ';
export const CODE_LENGTH = 4;
const CODE_RE = new RegExp(`^CASA-[${CODE_ALPHABET}]{${CODE_LENGTH}}$`);

/** Il codice è nel formato giusto (CASA-X92L)? Il mondo di sempre è CASA-0001. */
export const isWorldCode = (code: string): boolean => code === LEGACY_WORLD || CODE_RE.test(code);

/**
 * Il codice come lo scrive chi lo riceve da un amico: maiuscole o minuscole, con o senza spazi e
 * con o senza "CASA-". Null se non è un codice valido.
 */
export function normalizeWorldCode(input: string): string | null {
  let s = input.trim().toUpperCase().replace(/\s+/g, '');
  if (!s.startsWith('CASA-')) s = 'CASA-' + s.replace(/^CASA/, '');
  return isWorldCode(s) ? s : null;
}

/** Un codice nuovo; `rnd` restituisce numeri tra 0 e 1 (Math.random, o fisso nei test). */
export function newWorldCode(rnd: () => number): string {
  let out = 'CASA-';
  for (let i = 0; i < CODE_LENGTH; i++)
    out +=
      CODE_ALPHABET[Math.min(CODE_ALPHABET.length - 1, Math.floor(rnd() * CODE_ALPHABET.length))];
  return out;
}

/** Dove sta nel database un nodo di questo mondo (per il mondo di sempre, il percorso di prima). */
export function worldNodePath(worldId: string, node: WorldNode): string {
  return worldId === LEGACY_WORLD ? 'sims_' + node : `worlds/${worldId}/${node}`;
}

// ---------------------------------------------------------------- elenco dei mondi e posti liberi

/** Una voce dell'elenco dei mondi (sims_worlds/{codice}): serve solo a trovare posto in fretta. */
export interface WorldEntry {
  /** stanze libere secondo l'ultimo che è entrato o uscito (la verità è nelle stanze) */
  free: number;
  createdAt: number;
}

/** Messaggio quando non c'è posto. */
export const WORLD_FULL_TEXT = 'Condomini al completo, creane uno nuovo!';

type RoomLike = { owner?: unknown; ownerId?: unknown } | null | undefined;

/** Stanze senza proprietario tra le 64 (le stanze che mancano nell'elenco sono libere). */
export function countFree(rooms: readonly RoomLike[] | Record<string, RoomLike> | null): number {
  let taken = 0;
  for (let i = 0; i < WORLD_ROOMS; i++) {
    const r = (rooms as Record<string, RoomLike> | null)?.[i];
    if (r && (r.owner || r.ownerId)) taken++;
  }
  return WORLD_ROOMS - taken;
}

/**
 * Il mondo pubblico in cui entrare: tra quelli con posti liberi il più pieno, così i condomini si
 * riempiono invece di restare tutti mezzi vuoti; a parità il più vecchio. Null se non ce n'è.
 */
export function pickPublicWorld(
  index: Record<string, Partial<WorldEntry> | null> | null,
  exclude: readonly string[] = [],
): string | null {
  let best: string | null = null;
  let bestFree = Infinity,
    bestAt = Infinity;
  for (const [code, e] of Object.entries(index || {})) {
    if (!e || !isWorldCode(code) || exclude.includes(code)) continue;
    const free = Number(e.free);
    if (!(free > 0)) continue;
    const at = Number(e.createdAt) || 0;
    if (free < bestFree || (free === bestFree && at < bestAt)) {
      best = code;
      bestFree = free;
      bestAt = at;
    }
  }
  return best;
}

/**
 * La stanza di chi cambia mondo, nel posto nuovo: cassaforte, PIN, mobili, quadri ed economia
 * vengono con lui; cambiano solo il numero e l'ultimo accesso.
 */
export function movedRoom<T extends Record<string, unknown>>(
  old: T,
  newIdx: number,
  owner: string,
  ownerId: string,
  now: number,
): T & { id: number; owner: string; ownerId: string; lastSeen: number } {
  return { ...old, id: newIdx + 1, owner, ownerId, lastSeen: now };
}

/**
 * Il mondo è da cancellare? Nessuna stanza ha un proprietario né un morto ancora da sistemare
 * (pendingDeath), e non è appena nato: chi l'ha creato potrebbe non aver ancora preso la stanza.
 * Il mondo di sempre non si cancella mai.
 */
export function worldIsEmpty(
  rooms: unknown,
  createdAt: number,
  now: number,
  graceMs: number,
): boolean {
  if (now - createdAt < graceMs) return false;
  const list = rooms && typeof rooms === 'object' ? (rooms as Record<string, unknown>) : {};
  for (let i = 0; i < WORLD_ROOMS; i++) {
    const r = list[i] as { owner?: unknown; ownerId?: unknown; pendingDeath?: unknown } | null;
    if (r && (r.owner || r.ownerId || r.pendingDeath)) return false;
  }
  return true;
}

/**
 * Una stanza per giocatore in ogni condominio. Se qualcuno ne ha prese di più (le regole del
 * database guardano una stanza alla volta e non possono contarle), tiene quella usata per ultima;
 * le altre tornano libere e con la cassaforte vuota, così non servono a farsi i soldi di partenza.
 * Restituisce le stanze sistemate, o null se non c'era niente da fare.
 */
export function releaseExtraRooms(
  rooms: unknown,
): { rooms: Record<string, unknown>; freed: number } | null {
  if (!rooms || typeof rooms !== 'object') return null;
  type Room = { id?: unknown; ownerId?: unknown; lastSeen?: unknown; pendingDeath?: unknown };
  const list: Record<string, unknown> = { ...(rooms as Record<string, unknown>) };
  const ownerOf = (key: string): string | null => {
    const r = list[key] as Room | null;
    return r && typeof r.ownerId === 'string' && !r.pendingDeath ? r.ownerId : null;
  };
  const seen = (key: string) => Number((list[key] as Room | null)?.lastSeen) || 0;
  const keep = new Map<string, string>();
  for (const key of Object.keys(list)) {
    const owner = ownerOf(key);
    if (!owner) continue;
    const other = keep.get(owner);
    if (other === undefined || seen(key) > seen(other)) keep.set(owner, key);
  }
  let freed = 0;
  for (const key of Object.keys(list)) {
    const owner = ownerOf(key);
    if (!owner || keep.get(owner) === key) continue;
    list[key] = { id: (list[key] as Room).id, vaultMoney: 0 };
    freed++;
  }
  return freed ? { rooms: list, freed } : null;
}
