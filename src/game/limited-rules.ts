// Oggetti in edizione limitata: poche copie numerate in tutto il gioco, che si scambiano tra
// giocatori (senza dipendenze dal browser, così sono testabili).
// Il registro (sims_limited/<oggetto>/<numero>) dice chi possiede ogni copia.

export const LIMITED_COPIES = 5;
/** Un'offerta accettata va pagata entro questo tempo, poi decade. */
export const SALE_TTL_MS = 10 * 60_000;
export const OFFER_MIN = 1;
export const OFFER_MAX = 1_000_000;

export interface LedgerEntry {
  /** Proprietario (playerId) e suo nome. */
  o: string;
  on: string;
  /** Quando è passata di mano l'ultima volta. */
  t: number;
  /** Venduta a `to` per `p` €, in attesa che paghi. */
  sale?: { to: string; p: number; t: number };
}
/** oggetto → numero della copia (1-5) → proprietario. */
export type Ledger = Record<string, Record<string, LedgerEntry>>;

const ID = /^player_[A-Za-z0-9_-]{1,128}$/;

/** Legge il registro dal database scartando i valori non validi. */
export function decodeLedger(value: unknown): Ledger {
  const out: Ledger = {};
  if (!value || typeof value !== 'object') return out;
  for (const [item, copies] of Object.entries(value as Record<string, unknown>)) {
    if (!/^ltd_[a-z]+$/.test(item) || !copies || typeof copies !== 'object') continue;
    for (const [n, raw] of Object.entries(copies as Record<string, unknown>)) {
      if (!/^[1-9]$/.test(n) || Number(n) > LIMITED_COPIES || !raw || typeof raw !== 'object')
        continue;
      const e = raw as Record<string, unknown>;
      if (typeof e.o !== 'string' || !ID.test(e.o)) continue;
      const entry: LedgerEntry = {
        o: e.o,
        on: typeof e.on === 'string' ? e.on.slice(0, 20) : 'Giocatore',
        t: Number.isFinite(e.t) ? (e.t as number) : 0,
      };
      const s = e.sale as Record<string, unknown> | undefined;
      if (s && typeof s.to === 'string' && ID.test(s.to) && Number.isFinite(s.p))
        entry.sale = { to: s.to, p: s.p as number, t: Number.isFinite(s.t) ? (s.t as number) : 0 };
      (out[item] ??= {})[n] = entry;
    }
  }
  return out;
}

/** Copie ancora in vendita al negozio. */
export const copiesLeft = (ledger: Ledger, item: string): number =>
  Math.max(0, LIMITED_COPIES - Object.keys(ledger[item] || {}).length);

/** Numero della copia che possiede questo giocatore (null se non ne ha). */
export function copyOf(ledger: Ledger, item: string, playerId: string): number | null {
  for (const [n, e] of Object.entries(ledger[item] || {})) if (e.o === playerId) return Number(n);
  return null;
}

/** Prossimo numero libero da comprare al negozio (null = esaurito). */
export function nextFreeCopy(ledger: Ledger, item: string): number | null {
  for (let n = 1; n <= LIMITED_COPIES; n++) if (!ledger[item]?.[String(n)]) return n;
  return null;
}

/** Tutti gli oggetti in edizione limitata di un giocatore, con il numero della copia. */
export function itemsOf(ledger: Ledger, playerId: string): { item: string; n: number }[] {
  const out: { item: string; n: number }[] = [];
  for (const [item, copies] of Object.entries(ledger))
    for (const [n, e] of Object.entries(copies))
      if (e.o === playerId) out.push({ item, n: Number(n) });
  return out;
}

/** Spiega perché non si può fare questa offerta, oppure null. */
export function offerError(
  amount: number,
  money: number,
  buyerOwnsOne: boolean,
  isOwner: boolean,
): string | null {
  if (isOwner) return 'È già tuo!';
  if (buyerOwnsOne) return 'Hai già una copia di questo oggetto.';
  if (!Number.isInteger(amount) || amount < OFFER_MIN || amount > OFFER_MAX)
    return 'Scrivi una cifra in euro (un numero intero).';
  if (amount > money) return 'Non hai abbastanza soldi in cassaforte per questa offerta.';
  return null;
}

/** Il proprietario accetta l'offerta: la copia resta sua finché il compratore non paga. */
export function acceptSale(
  entry: LedgerEntry | null,
  owner: string,
  buyer: string,
  price: number,
  now: number,
): LedgerEntry | null {
  if (!entry || entry.o !== owner || buyer === owner) return null;
  return { ...entry, sale: { to: buyer, p: price, t: now } };
}

/** Il compratore, dopo aver pagato, prende la copia. null se la vendita non è (più) valida. */
export function claimSale(
  entry: LedgerEntry | null,
  buyer: string,
  buyerName: string,
  price: number,
  now: number,
): LedgerEntry | null {
  const s = entry?.sale;
  if (!entry || !s || s.to !== buyer || s.p !== price || now - s.t > SALE_TTL_MS) return null;
  return { o: buyer, on: buyerName.slice(0, 20), t: now };
}
