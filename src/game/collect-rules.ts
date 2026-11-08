// Negozio di oggetti da collezione (senza dipendenze dal browser, così è testabile).
// Ogni pezzo esiste in una sola copia in tutto il gioco. Nel negozio ci sono 5 espositori, ognuno
// con un pezzo a caso tra quelli non ancora venduti; quando qualcuno compra, al suo posto arriva un
// altro pezzo a caso. Nel database:
//   sims_collect/slots/<0-4>      → id del pezzo nell'espositore
//   sims_collect/owners/<pezzo>   → chi lo possiede ({o, on, t}), il posto sulla mensola (s, 0-2)
//                                   e, se è in vendita all'usato, l'annuncio (sale)
//   sims_collect/used/<0-4>       → id del pezzo in vendita in quell'espositore dell'usato
//
// Usato: il venditore mette l'annuncio sul suo pezzo (prezzo e espositore). Chi compra prima lo
// prenota (sale.to), poi paga il venditore, poi diventa proprietario: due compratori non possono
// pagare per lo stesso pezzo. Una prenotazione mai pagata scade dopo RESERVE_MS.

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
  // seconda serie
  { id: 'col_carillon', name: 'Carillon con Ballerina', emoji: '🎶', price: 950 },
  { id: 'col_bussola', name: "Bussola Nautica d'Ottone", emoji: '🧭', price: 700 },
  { id: 'col_lente', name: "Lente d'Ingrandimento da Esploratore", emoji: '🔍', price: 450 },
  { id: 'col_farfalla', name: 'Farfalla Esotica in Teca', emoji: '🦋', price: 850 },
  { id: 'col_macchina', name: 'Macchina da Scrivere Vintage', emoji: '⌨️', price: 1200 },
  { id: 'col_fossile', name: 'Ammonite Fossile', emoji: '🐚', price: 1000 },
  { id: 'col_lanterna', name: 'Lanterna a Olio da Marinaio', emoji: '🏮', price: 550 },
  { id: 'col_vaso', name: 'Vaso Cinese in Porcellana Bianca e Blu', emoji: '🏺', price: 1400 },
  { id: 'col_maschera', name: 'Maschera Veneziana con Piume', emoji: '🎭', price: 750 },
  { id: 'col_robot', name: 'Robottino di Latta a Carica', emoji: '🤖', price: 600 },
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
  /** Annuncio nel negozio dell'usato. */
  sale?: CollectSale;
}

export interface CollectSale {
  /** Prezzo, quando è stato messo in vendita e in quale espositore (0-4). */
  p: number;
  t: number;
  st: number;
  /** Chi lo sta comprando e da quando (prenotazione). */
  to?: string;
  rt?: number;
}

/** Una prenotazione non pagata entro questo tempo scade. */
export const RESERVE_MS = 120_000;
export const USED_MIN_PRICE = 1;
export const USED_MAX_PRICE = 1_000_000;

export interface CollectState {
  /** Pezzo in ogni espositore (null = ancora da riempire). */
  slots: (string | null)[];
  /** Pezzo annunciato in ogni espositore dell'usato (vale solo se il suo annuncio è lì). */
  used: (string | null)[];
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
  const rawUsed = (v.used && typeof v.used === 'object' ? v.used : {}) as Record<string, unknown>;
  const used: (string | null)[] = [];
  for (let i = 0; i < STANDS; i++) {
    const id = rawUsed[i];
    used.push(isCollectibleId(id) ? id : null);
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
    const sale = decodeSale(e.sale);
    if (sale) entry.sale = sale;
    owners[id] = entry;
  }
  return { slots, used, owners };
}

function decodeSale(value: unknown): CollectSale | null {
  if (!value || typeof value !== 'object') return null;
  const v = value as Record<string, unknown>;
  const p = v.p as number,
    st = v.st as number;
  if (!Number.isInteger(p) || p < USED_MIN_PRICE || p > USED_MAX_PRICE) return null;
  if (!Number.isInteger(st) || st < 0 || st >= STANDS) return null;
  const sale: CollectSale = { p, st, t: Number.isFinite(v.t) ? (v.t as number) : 0 };
  if (typeof v.to === 'string' && PLAYER.test(v.to) && Number.isFinite(v.rt)) {
    sale.to = v.to;
    sale.rt = v.rt as number;
  }
  return sale;
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

// ---------------------------------------------------------------- negozio dell'usato

export interface UsedListing {
  c: Collectible;
  owner: CollectOwner;
  sale: CollectSale;
}

/** L'annuncio nell'espositore `i` dell'usato (null = espositore libero). */
export function usedListing(state: CollectState, i: number): UsedListing | null {
  const id = state.used[i];
  const owner = id ? state.owners[id] : undefined;
  const c = collectible(id);
  if (!c || !owner?.sale || owner.sale.st !== i) return null;
  return { c, owner, sale: owner.sale };
}

/** Pezzi di un giocatore che può mettere in vendita (quelli non già in vendita). */
export function sellable(state: CollectState, playerId: string): Collectible[] {
  return collectionOf(state, playerId).filter((c) => !state.owners[c.id].sale);
}

/** Chi ha prenotato il pezzo in questo momento (null se nessuno o se la prenotazione è scaduta). */
export function reservedBy(sale: CollectSale | undefined, now: number): string | null {
  return sale?.to && now - (sale.rt || 0) < RESERVE_MS ? sale.to : null;
}

/** Perché il prezzo non va bene (null se va bene). */
export function usedPriceError(price: number): string | null {
  if (!Number.isInteger(price) || price < USED_MIN_PRICE)
    return 'Scrivi un prezzo in dindini, senza decimali.';
  if (price > USED_MAX_PRICE)
    return `Il prezzo massimo è ${USED_MAX_PRICE.toLocaleString('it-IT')} Đ.`;
  return null;
}

/** Annuncio prenotato da `buyer`, o null se non si può (già suo, già prenotato da altri). */
export function reserveSale(
  owner: CollectOwner | null,
  buyer: string,
  price: number,
  now: number,
): CollectOwner | null {
  if (!owner?.sale || owner.o === buyer || owner.sale.p !== price) return null;
  const other = reservedBy(owner.sale, now);
  if (other && other !== buyer) return null;
  return { ...owner, sale: { ...owner.sale, to: buyer, rt: now } };
}

/** Il pezzo passa a chi l'ha prenotato (senza annuncio e fuori dalla mensola del venditore). */
export function completeSale(
  owner: CollectOwner | null,
  buyer: string,
  buyerName: string,
  now: number,
): CollectOwner | null {
  if (!owner?.sale || owner.sale.to !== buyer) return null;
  return { o: buyer, on: buyerName.slice(0, 20), t: now };
}

/** Tutti i pezzi del catalogo hanno già un proprietario: il negozio non ha più niente da vendere. */
export function soldOut(state: CollectState): boolean {
  return COLLECTIBLES.every((c) => state.owners[c.id]);
}

// ---------------------------------------------------------------- offerte sulla mensola
//
// Chi visita una stanza può fare un'offerta per un pezzo sulla mensola. L'offerta arriva al
// proprietario come messaggio (colOffer); se accetta, l'affare si conclude subito, anche se chi
// ha offerto non è in gioco: i soldi passano dalla sua cassaforte a quella del proprietario e il
// proprietario gli dà il pezzo (colDone avvisa il compratore). Chi ha già la mensola piena deve
// poi liberare un posto: mette in vendita all'usato uno dei suoi pezzi, o lo butta se il negozio
// dell'usato è pieno.

/** Perché non si può offrire questa cifra (null se va bene). */
export function collectOfferError(
  amount: number,
  money: number,
  owner: CollectOwner | undefined,
  buyer: string,
): string | null {
  if (!owner) return 'Questo pezzo non è più sulla mensola.';
  if (owner.o === buyer) return 'È già tuo.';
  const price = usedPriceError(amount);
  if (price) return price;
  if (amount > money)
    return `In cassaforte hai solo ${money.toLocaleString('it-IT')} Đ: non puoi offrire di più.`;
  return null;
}

/** Il pezzo è in vendita al negozio dell'usato (in un espositore). */
export function inUsedShop(state: CollectState, id: string): boolean {
  const sale = state.owners[id]?.sale;
  return !!sale && state.used[sale.st] === id;
}

/**
 * Il proprietario dà il pezzo a chi l'ha pagato (offerta accettata): null se non è suo o se è in
 * vendita all'usato. Esce dalla mensola del proprietario; il compratore lo sistema sulla sua.
 */
export function giveTo(
  owner: CollectOwner | null,
  ownerId: string,
  buyer: string,
  buyerName: string,
  now: number,
): CollectOwner | null {
  if (!owner || owner.o !== ownerId || owner.sale || buyer === ownerId || !PLAYER.test(buyer))
    return null;
  return { o: buyer, on: buyerName.slice(0, 20), t: now };
}

/** La mensola è piena: un pezzo in più non ci sta. */
export const shelfFull = (state: CollectState, playerId: string): boolean =>
  freeShelfSpot(state, playerId) === null;

/** Primo espositore libero del negozio dell'usato (null = negozio pieno: si può solo buttare). */
export function freeUsedStand(state: CollectState): number | null {
  for (let i = 0; i < STANDS; i++) if (!usedListing(state, i)) return i;
  return null;
}

/** Pezzi miei che non stanno sulla mensola e non sono in vendita (arrivati con la mensola piena). */
export function offShelf(state: CollectState, playerId: string): Collectible[] {
  return collectionOf(state, playerId).filter(
    (c) => state.owners[c.id].s === undefined && !state.owners[c.id].sale,
  );
}
