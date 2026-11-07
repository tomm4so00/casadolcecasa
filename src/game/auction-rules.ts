// Aste dei quadri: chi finisce un quadro può metterlo all'asta invece di appenderlo. All'asta il
// quadro si vota (cuoricini) e riceve offerte dai giocatori; il pittore accetta la migliore quando
// vuole e il quadro passa per sempre nella stanza di chi l'ha comprato. Un quadro appeso in una
// stanza non è più in vendita. In galleria: i dieci quadri all'asta con più cuoricini.
// Senza dipendenze dal browser, così è testabile.
import { isValidPrice, nextOfferTime, seeded } from './art-market-rules.js';
import { isValidPainting } from './painting-rules.js';
import { paintingId } from './painting-title-rules.js';

/** Posti della mostra in galleria: sei sulla parete di fondo, quattro su quella di sinistra. */
export const GALLERY_SIZE = 10;

export interface AuctionBid {
  /** Chi offre (codice del personaggio) e il suo nome. */
  by: string;
  name: string;
  amt: number;
  t: number;
}

export interface Auction {
  /** Impronta del quadro: la stessa chiave del titolo. */
  id: string;
  code: string;
  /** Il pittore. */
  by: string;
  name: string;
  t: number;
  /** La migliore offerta di un giocatore. */
  bid?: AuctionBid;
  /**
   * Offerta accettata dal pittore. `paid`: i soldi sono già passati (li ha presi il pittore
   * accettando) e il quadro aspetta solo di essere appeso da chi l'ha comprato; senza, chi ha
   * offerto deve ancora pagare.
   */
  sold?: { to: string; amt: number; t: number; paid: boolean };
  /** Quando arriva la prossima offerta di un collezionista, e quante ne sono state rifiutate. */
  nextBotAt: number;
  round: number;
  /** Chi ha dato il cuoricino. */
  voters: Set<string>;
  /**
   * Spazio espositivo terminato (shared/auction-expiry.ts): il quadro non è più esposto e il
   * pittore deve appenderlo o buttarlo entro questo momento, poi lo butta il server.
   */
  expiresAt?: number;
}

/** L'asta appena aperta, come si scrive nel database. */
export function newAuction(code: string, by: string, name: string, now: number) {
  return {
    code,
    by,
    name: name.slice(0, 20),
    t: now,
    nextBotAt: nextOfferTime(now, paintingId(code), 0),
    round: 0,
  };
}

const str = (v: unknown, max = 140): v is string =>
  typeof v === 'string' && v.length > 0 && v.length <= max;
const num = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);

/** Legge un'asta dal database scartando i valori non validi. */
export function decodeAuction(id: string, value: unknown): Auction | null {
  if (!value || typeof value !== 'object') return null;
  const v = value as Record<string, unknown>;
  if (!isValidPainting(v.code) || !str(v.by) || !num(v.t)) return null;
  const b = v.bid as Record<string, unknown> | undefined;
  const s = v.sold as Record<string, unknown> | undefined;
  const votes = v.votes && typeof v.votes === 'object' ? (v.votes as Record<string, unknown>) : {};
  return {
    id,
    code: v.code,
    by: v.by,
    name: str(v.name, 20) ? v.name : 'Artista',
    t: v.t,
    ...(b && str(b.by) && isValidPrice(b.amt) && num(b.t)
      ? { bid: { by: b.by, name: str(b.name, 20) ? b.name : 'Qualcuno', amt: b.amt, t: b.t } }
      : {}),
    ...(s && str(s.to) && isValidPrice(s.amt)
      ? { sold: { to: s.to, amt: s.amt, t: num(s.t) ? s.t : 0, paid: s.paid === true } }
      : {}),
    nextBotAt: num(v.nextBotAt) ? v.nextBotAt : v.t,
    round: Number.isSafeInteger(v.round) ? (v.round as number) : 0,
    ...(num(v.expiresAt) ? { expiresAt: v.expiresAt } : {}),
    voters: new Set(
      Object.entries(votes)
        .filter(([pid, t]) => pid !== v.by && num(t))
        .map(([pid]) => pid),
    ),
  };
}

export function decodeAuctions(value: unknown): Auction[] {
  if (!value || typeof value !== 'object') return [];
  return Object.entries(value as Record<string, unknown>)
    .map(([id, a]) => decodeAuction(id, a))
    .filter((a): a is Auction => !!a);
}

/** Codici dei giocatori che abitano nel condominio (hanno una stanza). */
function residents(rooms: unknown[]): Set<string> {
  const out = new Set<string>();
  for (const r of rooms)
    if (r && typeof r === 'object' && typeof (r as { ownerId?: unknown }).ownerId === 'string')
      out.add((r as { ownerId: string }).ownerId);
  return out;
}

/**
 * Le aste in corso, dalla più votata: solo quelle di chi abita nel condominio (chi è morto o ha
 * cambiato condominio non può più incassare), non ancora vendute e ancora esposte.
 */
export function openAuctions(auctions: Auction[], rooms: unknown[]): Auction[] {
  const here = residents(rooms);
  return auctions
    .filter((a) => !a.sold && a.expiresAt === undefined && here.has(a.by))
    .sort((a, b) => b.voters.size - a.voters.size || b.t - a.t);
}

/** Il giorno della mostra (UTC): a parità di cuoricini la scelta cambia una volta al giorno. */
export const galleryDay = (now: number): number => Math.floor(now / 86_400_000);

/** I quadri in mostra in galleria: i dieci all'asta con più cuoricini. */
export function pickExhibition(open: Auction[], day: number): Auction[] {
  return [...open]
    .sort((a, b) => b.voters.size - a.voters.size || seeded(day, a.id) - seeded(day, b.id))
    .slice(0, GALLERY_SIZE);
}

/**
 * L'asta come si riapre nel condominio nuovo, dopo un trasloco: stesso quadro, stessa data e
 * stesse offerte dei collezionisti, ma senza le offerte e i cuoricini dei vicini di prima (da un
 * altro condominio non potrebbero più pagare, e la galleria è quella del condominio).
 */
export function movedAuction(a: Auction) {
  return {
    code: a.code,
    by: a.by,
    name: a.name,
    t: a.t,
    nextBotAt: a.nextBotAt,
    round: a.round,
    // il timer dello spazio espositivo non si azzera traslocando
    ...(a.expiresAt !== undefined ? { expiresAt: a.expiresAt } : {}),
  };
}

/** L'offerta minima: un euro più della migliore offerta di un giocatore. */
export const minBid = (a: Auction): number => (a.bid?.amt ?? 0) + 1;

/** Perché l'offerta non va bene, oppure null. */
export function bidError(a: Auction, me: string, amt: number, money: number): string | null {
  if (a.by === me) return 'È il tuo quadro: le offerte le fanno gli altri giocatori.';
  if (a.sold) return 'Il pittore ha già accettato un’offerta per questo quadro.';
  if (!isValidPrice(amt)) return 'Scrivi una cifra intera fra 1 e 100.000 €.';
  if (amt < minBid(a)) return `Devi offrire almeno ${minBid(a).toLocaleString('it-IT')} €.`;
  if (amt > money) return `In cassaforte hai solo ${money.toLocaleString('it-IT')} €.`;
  return null;
}
