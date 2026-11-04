// Sala scommesse: slot e morra cinese tra due giocatori (senza dipendenze dal browser, testabile).

// ---------------------------------------------------------------- slot

/** Ogni giro della slot costa 5 €. */
export const SLOT_BET = 5;

/** Simboli dei rulli, con quante volte compaiono su 100 (i più rari pagano di più). */
export const SLOT_SYMBOLS = [
  { id: 'cherry', emoji: '🍒', weight: 30 },
  { id: 'lemon', emoji: '🍋', weight: 25 },
  { id: 'bell', emoji: '🔔', weight: 20 },
  { id: 'star', emoji: '⭐', weight: 12 },
  { id: 'diamond', emoji: '💎', weight: 8 },
  { id: 'seven', emoji: '7️⃣', weight: 5 },
] as const;

export type SlotSymbol = (typeof SLOT_SYMBOLS)[number]['id'];

/** Quante volte la puntata si vince con tre simboli uguali. */
export const SLOT_THREE: Record<SlotSymbol, number> = {
  cherry: 5,
  lemon: 10,
  bell: 20,
  star: 50,
  diamond: 100,
  seven: 300,
};
/** Due simboli uguali: pagano solo ciliegie (riprendi la puntata), diamanti e sette. */
export const SLOT_TWO: Partial<Record<SlotSymbol, number>> = { cherry: 1, diamond: 2, seven: 3 };

const TOTAL_WEIGHT = SLOT_SYMBOLS.reduce((sum, s) => sum + s.weight, 0);

/** Simbolo di un rullo da un numero casuale tra 0 e 1. */
export function reelSymbol(random: number): SlotSymbol {
  let r = Math.max(0, Math.min(0.999999, random)) * TOTAL_WEIGHT;
  for (const s of SLOT_SYMBOLS) {
    if (r < s.weight) return s.id;
    r -= s.weight;
  }
  return SLOT_SYMBOLS[0].id;
}

export const symbolEmoji = (id: SlotSymbol): string =>
  SLOT_SYMBOLS.find((s) => s.id === id)?.emoji ?? '?';

/** Vincita in euro per i tre rulli (0 se si perde). */
export function slotWin(reels: SlotSymbol[]): number {
  const [a, b, c] = reels;
  if (a === b && b === c) return SLOT_BET * SLOT_THREE[a];
  const pair = a === b || a === c ? a : b === c ? b : null;
  return pair && SLOT_TWO[pair] ? SLOT_BET * SLOT_TWO[pair]! : 0;
}

/** Quanto restituisce in media la slot per ogni euro giocato (calcolo esatto). */
export function slotReturnRate(): number {
  let expected = 0;
  for (const a of SLOT_SYMBOLS)
    for (const b of SLOT_SYMBOLS)
      for (const c of SLOT_SYMBOLS) {
        const p = (a.weight * b.weight * c.weight) / TOTAL_WEIGHT ** 3;
        expected += p * slotWin([a.id, b.id, c.id]);
      }
  return expected / SLOT_BET;
}

// ---------------------------------------------------------------- morra cinese

export type RpsChoice = 'rock' | 'paper' | 'scissors';
export const RPS_CHOICES: RpsChoice[] = ['rock', 'paper', 'scissors'];
export const RPS_LABEL: Record<RpsChoice, string> = {
  rock: '✊ Sasso',
  paper: '✋ Carta',
  scissors: '✌️ Forbici',
};

/** Puntata minima e massima di una sfida. */
export const RPS_MIN_BET = 10;
export const RPS_MAX_BET = 500;
/** Tempo per rispondere a una sfida o per scegliere la mossa. */
export const RPS_ANSWER_MS = 60 * 1000;
export const RPS_MOVE_MS = 45 * 1000;

/** 'a' o 'b' per chi vince, null se pareggio. */
export function rpsWinner(a: RpsChoice, b: RpsChoice): 'a' | 'b' | null {
  if (a === b) return null;
  const beats: Record<RpsChoice, RpsChoice> = {
    rock: 'scissors',
    paper: 'rock',
    scissors: 'paper',
  };
  return beats[a] === b ? 'a' : 'b';
}

export const isRpsChoice = (v: unknown): v is RpsChoice =>
  v === 'rock' || v === 'paper' || v === 'scissors';

/** Spiega perché la puntata non va bene, oppure null. */
export function rpsBetError(bet: number, money: number): string | null {
  if (!Number.isSafeInteger(bet)) return 'Scrivi un numero intero di euro.';
  if (bet < RPS_MIN_BET || bet > RPS_MAX_BET)
    return `La puntata va da ${RPS_MIN_BET} a ${RPS_MAX_BET} €.`;
  if (bet > money) return 'Non hai abbastanza soldi in cassaforte.';
  return null;
}

/**
 * Stati di una sfida (nodo sims_rps/<sfidato>):
 * invited → lo sfidante ha già messo la sua puntata nel piatto, lo sfidato deve rispondere;
 * playing → anche lo sfidato ha messo la puntata; si gioca;
 * done → c'è un vincitore (che incassa il piatto); declined/cancelled → ognuno riprende la sua puntata.
 *
 * Per non poter barare, lo sfidante sceglie per primo ma salva solo l'impronta (hash) della mossa;
 * poi lo sfidato sceglie in chiaro; infine lo sfidante rivela la mossa, che deve corrispondere.
 */
