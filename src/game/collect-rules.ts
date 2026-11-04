// Negozio di oggetti da collezione (senza dipendenze dal browser, così è testabile).
// Ogni pezzo esiste in una sola copia in tutto il gioco. Nel negozio ci sono 5 espositori, ognuno
// con un pezzo a caso tra quelli non ancora venduti; quando qualcuno compra, al suo posto arriva un
// altro pezzo a caso. Nel database:
//   sims_collect/slots/<0-4>      → id del pezzo nell'espositore
//   sims_collect/owners/<pezzo>   → chi lo possiede ({o, on, t}) e il posto sulla mensola (s, 0-2)

export interface Collectible {
  id: string;
  name: string;
  /** Emoji per i testi (pulsanti e finestre); il disegno è in render/collectible-art.ts. */
  emoji: string;
  price: number;
}

export const COLLECTIBLES: Collectible[] = [
  { id: 'col_tomo', name: 'Tomo Antico di Alchimia e Botanica', emoji: '📗', price: 900 },
  { id: 'col_globo', name: "Globo Terrestre d'Epoca in Ottone", emoji: '🌍', price: 1200 },
  { id: 'col_clessidra', name: 'Clessidra di Cristallo con Sabbia Nera', emoji: '⏳', price: 700 },
  {
    id: 'col_sfera',
    name: 'Sfera di Cristallo su Base di Legno Incantata',
    emoji: '🔮',
    price: 1100,
  },
  { id: 'col_pendolo', name: 'Orologio a Pendolo da Tavolo', emoji: '🕰️', price: 1300 },
  { id: 'col_torso', name: 'Torso Anatomico Scomposto', emoji: '🫀', price: 800 },
  { id: 'col_busto', name: 'Busto Classico in Marmo', emoji: '🏛️', price: 1500 },
  {
    id: 'col_lava',
    name: 'Lampada Lava "Liquid Motion" Vintage',
    emoji: '💡',
    price: 600,
  },
  { id: 'col_fumetti', name: 'Collezione di Fumetti Vintage', emoji: '📚', price: 750 },
  {
    id: 'col_manuale',
    name: 'Manuale di Filosofia Esoterica & Geometria Sacra',
    emoji: '📘',
    price: 650,
  },
  {
    id: 'col_newton',
    name: 'Culla di Newton Magnetica (Pendolo di Urto)',
    emoji: '🧲',
    price: 550,
  },
  { id: 'col_cranio', name: 'Modello Anatomico del Cranio Umano', emoji: '💀', price: 700 },
  {
    id: 'col_giradischi',
    name: 'Giradischi Portatile con Vinile in Miniatura',
    emoji: '💿',
    price: 850,
  },
  { id: 'col_cactus', name: 'Mini Cactus in Vaso', emoji: '🌵', price: 300 },
  {
    id: 'col_ametista',
    name: 'Pezzo di Ametista o Quarzo Grezzo Naturale',
    emoji: '💎',
    price: 1000,
  },
  {
    id: 'col_horus',
    name: 'Occhio di Horus, amuleto egizio in miniatura',
    emoji: '👁️',
    price: 900,
  },
  { id: 'col_sveglia', name: 'Sveglia da Comodino', emoji: '⏰', price: 400 },
  { id: 'col_barca', name: 'Barchetta in Miniatura', emoji: '⛵', price: 450 },
  { id: 'col_telescopio', name: "Telescopio d'Ottone", emoji: '🔭', price: 1100 },
  { id: 'col_scacchi', name: 'Scacchiera in Legno Intarsiato', emoji: '♟️', price: 800 },
];

/** Espositori nel negozio. */
export const STANDS = 5;
/** Posti sulla mensola della stanza. */
export const SHELF_SPOTS = 3;

const BY_ID = new Map(COLLECTIBLES.map((c) => [c.id, c]));
export const collectible = (id: unknown): Collectible | undefined =>
  typeof id === 'string' ? BY_ID.get(id) : undefined;
export const isCollectibleId = (id: unknown): id is string => !!collectible(id);

export interface CollectOwner {
  /** Proprietario (playerId) e suo nome. */
  o: string;
  on: string;
  t: number;
  /** Posto sulla mensola (0-2), se ce l'ha messo. */
  s?: number;
}

export interface CollectState {
  /** Pezzo in ogni espositore (null = ancora da riempire). */
  slots: (string | null)[];
  owners: Record<string, CollectOwner>;
}

const PLAYER = /^player_[A-Za-z0-9_-]{1,128}$/;

/** Legge lo stato dal database scartando i valori non validi. */
export function decodeCollect(value: unknown): CollectState {
  const v = (value && typeof value === 'object' ? value : {}) as Record<string, unknown>;
  const rawSlots = (v.slots && typeof v.slots === 'object' ? v.slots : {}) as Record<
    string,
    unknown
  >;
  const slots: (string | null)[] = [];
  for (let i = 0; i < STANDS; i++) {
    const id = rawSlots[i];
    slots.push(isCollectibleId(id) ? id : null);
  }
  const owners: Record<string, CollectOwner> = {};
  const rawOwners = (v.owners && typeof v.owners === 'object' ? v.owners : {}) as Record<
    string,
    unknown
  >;
  for (const [id, raw] of Object.entries(rawOwners)) {
    if (!isCollectibleId(id) || !raw || typeof raw !== 'object') continue;
    const e = raw as Record<string, unknown>;
    if (typeof e.o !== 'string' || !PLAYER.test(e.o)) continue;
    const entry: CollectOwner = {
      o: e.o,
      on: typeof e.on === 'string' ? e.on.slice(0, 20) : 'Giocatore',
      t: Number.isFinite(e.t) ? (e.t as number) : 0,
    };
    if (Number.isInteger(e.s) && (e.s as number) >= 0 && (e.s as number) < SHELF_SPOTS)
      entry.s = e.s as number;
    owners[id] = entry;
  }
  return { slots, owners };
}

/** L'espositore `i` va riempito: è vuoto, il suo pezzo è stato venduto o è un doppione. */
export function standNeedsRefill(state: CollectState, i: number): boolean {
  const id = state.slots[i];
  if (!id || state.owners[id]) return true;
  return state.slots.findIndex((other) => other === id) !== i;
}

/** Un pezzo a caso per l'espositore `i`: non venduto e non già in un altro espositore. */
export function pickForStand(
  state: CollectState,
  i: number,
  rnd: () => number = Math.random,
): string | null {
  const shown = new Set(state.slots.filter((id, k) => k !== i && id));
  const free = COLLECTIBLES.filter((c) => !state.owners[c.id] && !shown.has(c.id));
  if (!free.length) return null;
  return free[Math.min(free.length - 1, Math.floor(rnd() * free.length))].id;
}

/** Pezzo in vendita nell'espositore `i` (null se vuoto o appena venduto). */
export function onSale(state: CollectState, i: number): Collectible | null {
  const id = state.slots[i];
  return id && !state.owners[id] ? collectible(id) || null : null;
}

/** Pezzi posseduti da un giocatore, nell'ordine del catalogo. */
export function collectionOf(state: CollectState, playerId: string): Collectible[] {
  return COLLECTIBLES.filter((c) => state.owners[c.id]?.o === playerId);
}

/** La mensola di un giocatore: il pezzo in ognuno dei tre posti (null = posto libero). */
export function shelfOf(state: CollectState, playerId: string): (Collectible | null)[] {
  const out: (Collectible | null)[] = Array(SHELF_SPOTS).fill(null);
  for (const c of collectionOf(state, playerId)) {
    const s = state.owners[c.id].s;
    if (s !== undefined && !out[s]) out[s] = c;
  }
  return out;
}

/** Primo posto libero sulla mensola (null = piena). */
export function freeShelfSpot(state: CollectState, playerId: string): number | null {
  const i = shelfOf(state, playerId).findIndex((c) => !c);
  return i < 0 ? null : i;
}
