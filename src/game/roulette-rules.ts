// Roulette della sala scommesse (senza dipendenze dal browser, così è testabile): un unico tavolo
// per condominio, a giri continui scanditi dall'ora del server, uguali per tutti.
// Le stesse costanti stanno nelle regole del database (firebase/world-rules.mjs).

/** Un giro: puntate aperte, la ruota gira, il numero resta in vista. */
export const ROUND_MS = 40_000;
export const BET_MS = 25_000;
export const SPIN_MS = 8_000;

/** Fiches e limiti. */
export const CHIPS = [5, 10, 25, 50, 100] as const;
export const MIN_CHIP = 5;
export const MAX_ROUND_BET = 500;

/** Ordine dei numeri sulla ruota europea, in senso orario a partire dallo zero. */
export const WHEEL = [
  0, 32, 15, 19, 4, 21, 2, 25, 17, 34, 6, 27, 13, 36, 11, 30, 8, 23, 10, 5, 24, 16, 33, 1, 20, 14,
  31, 9, 22, 18, 29, 7, 28, 12, 35, 3, 26,
];
const RED = new Set([1, 3, 5, 7, 9, 12, 14, 16, 18, 19, 21, 23, 25, 27, 30, 32, 34, 36]);

export type NumberColor = 'red' | 'black' | 'green';
export const colorOf = (n: number): NumberColor =>
  n === 0 ? 'green' : RED.has(n) ? 'red' : 'black';

/** Le puntate: un numero (n0…n36) o una puntata esterna. */
export type BetKey = string;
export const OUTSIDE_BETS = [
  'red',
  'black',
  'odd',
  'even',
  'low',
  'high',
  'd1',
  'd2',
  'd3',
  'c1',
  'c2',
  'c3',
];
export const BET_KEY = /^(n([0-9]|[12][0-9]|3[0-6])|red|black|odd|even|low|high|d[123]|c[123])$/;
export const isBetKey = (k: unknown): k is BetKey => typeof k === 'string' && BET_KEY.test(k);

export const BET_LABEL: Record<string, string> = {
  red: 'Rosso',
  black: 'Nero',
  odd: 'Dispari',
  even: 'Pari',
  low: '1–18',
  high: '19–36',
  d1: '1ª dozzina',
  d2: '2ª dozzina',
  d3: '3ª dozzina',
  c1: '1ª colonna',
  c2: '2ª colonna',
  c3: '3ª colonna',
};
export const betLabel = (k: BetKey): string => BET_LABEL[k] || 'Numero ' + k.slice(1);

/** Quante volte la posta si vince oltre a riaverla: numero 35, dozzine e colonne 2, il resto 1. */
export function multiplier(k: BetKey): number {
  if (k.startsWith('n')) return 35;
  if (/^[dc][123]$/.test(k)) return 2;
  return 1;
}

/** La puntata vince con il numero n? (lo zero perde tutte le puntate esterne) */
export function wins(k: BetKey, n: number): boolean {
  if (k.startsWith('n')) return Number(k.slice(1)) === n;
  if (n === 0) return false;
  switch (k) {
    case 'red':
      return RED.has(n);
    case 'black':
      return !RED.has(n);
    case 'odd':
      return n % 2 === 1;
    case 'even':
      return n % 2 === 0;
    case 'low':
      return n <= 18;
    case 'high':
      return n >= 19;
    case 'd1':
    case 'd2':
    case 'd3':
      return Math.ceil(n / 12) === Number(k[1]);
    case 'c1':
    case 'c2':
    case 'c3':
      // prima colonna 1, 4, 7…; seconda 2, 5, 8…; terza 3, 6, 9…
      return ((n - 1) % 3) + 1 === Number(k[1]);
  }
  return false;
}

export type Bets = Record<BetKey, number>;

export const totalOf = (bets: Bets): number =>
  Object.values(bets).reduce((a, b) => a + (Number.isFinite(b) ? b : 0), 0);

/** Quanto torna indietro con il numero n: la posta delle puntate vincenti più la vincita. */
export function payout(bets: Bets, n: number): number {
  let out = 0;
  for (const [k, v] of Object.entries(bets)) if (wins(k, n)) out += v * (multiplier(k) + 1);
  return out;
}

/** Aggiunge una fiche: le nuove puntate, oppure il motivo per cui non si può. */
export function addChip(
  bets: Bets,
  key: BetKey,
  chip: number,
  money: number,
): { bets: Bets } | { error: string } {
  if (!isBetKey(key) || !(CHIPS as readonly number[]).includes(chip))
    return { error: 'Puntata non valida.' };
  if (totalOf(bets) + chip > MAX_ROUND_BET)
    return { error: `Al massimo ${MAX_ROUND_BET} € a giro.` };
  if (money < chip) return { error: `Non hai ${chip} € in cassaforte.` };
  return { bets: { ...bets, [key]: (bets[key] || 0) + chip } };
}

/** Le puntate lette dal database, scartando quelle non valide. */
export function decodeBets(value: unknown): Bets {
  const out: Bets = {};
  if (!value || typeof value !== 'object') return out;
  for (const [k, v] of Object.entries(value as Record<string, unknown>))
    if (
      isBetKey(k) &&
      Number.isInteger(v) &&
      (v as number) >= MIN_CHIP &&
      (v as number) <= MAX_ROUND_BET
    )
      out[k] = v as number;
  return out;
}

export const isResult = (n: unknown): n is number =>
  Number.isInteger(n) && (n as number) >= 0 && (n as number) <= 36;

// ---------------------------------------------------------------- tempo

export type Phase = 'bet' | 'spin' | 'show';

/** In che giro e in che momento siamo, e quanti millisecondi mancano alla fase dopo. */
export function phaseAt(now: number): { round: number; phase: Phase; left: number; since: number } {
  const round = Math.floor(now / ROUND_MS);
  const since = now - round * ROUND_MS;
  if (since < BET_MS) return { round, phase: 'bet', left: BET_MS - since, since };
  if (since < BET_MS + SPIN_MS)
    return { round, phase: 'spin', left: BET_MS + SPIN_MS - since, since };
  return { round, phase: 'show', left: ROUND_MS - since, since };
}

/** Quando si chiudono le puntate del giro (il numero si può scrivere solo da lì in poi). */
export const closesAt = (round: number): number => round * ROUND_MS + BET_MS;

/**
 * Angolo della ruota (in giri) e della pallina, durante l'animazione: la ruota rallenta e la
 * pallina si ferma sulla casella del numero uscito.
 */
export function spinAngles(n: number, k: number): { wheel: number; ball: number } {
  const e = 1 - Math.pow(1 - Math.max(0, Math.min(1, k)), 3);
  const slot = WHEEL.indexOf(n) / WHEEL.length;
  const wheel = 3 * e; // tre giri, sempre più piano
  // la pallina gira al contrario e finisce sulla casella (che intanto si è spostata con la ruota)
  const ball = wheel + slot - 6 * (1 - e);
  return { wheel, ball };
}
