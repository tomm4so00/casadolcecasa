// Animali domestici (senza dipendenze dal browser, così sono testabili e li usa anche il server).
// Cane e gatto girano per la stanza; uccellino, criceto, serpente e pesce stanno nella loro
// gabbia / teca / acquario, che si sposta come un mobile.

export type PetKind = 'dog' | 'cat' | 'bird' | 'hamster' | 'snake' | 'fish';

export interface PetInfo {
  /** Nome da mostrare ("Fame (cane)"). */
  name: string;
  emoji: string;
  price: number;
  /** true = gira libero per la stanza; false = sta nella sua casetta (un mobile). */
  free: boolean;
  /** Nome della casetta (solo per gli animali che non girano liberi). */
  home?: string;
  /** Ingombro della casetta nella stanza. */
  w?: number;
  h?: number;
  z?: number;
}

export const PETS: Record<PetKind, PetInfo> = {
  dog: { name: 'cane', emoji: '🐶', price: 120, free: true },
  cat: { name: 'gatto', emoji: '🐱', price: 100, free: true },
  bird: {
    name: 'uccellino',
    emoji: '🐦',
    price: 50,
    free: false,
    home: 'Gabbia',
    w: 26,
    h: 26,
    z: 52,
  },
  hamster: {
    name: 'criceto',
    emoji: '🐹',
    price: 40,
    free: false,
    home: 'Gabbia',
    w: 40,
    h: 28,
    z: 30,
  },
  snake: {
    name: 'serpente',
    emoji: '🐍',
    price: 80,
    free: false,
    home: 'Teca',
    w: 52,
    h: 28,
    z: 34,
  },
  fish: {
    name: 'pesce',
    emoji: '🐟',
    price: 25,
    free: false,
    home: 'Acquario',
    w: 48,
    h: 24,
    z: 40,
  },
};
export const PET_KINDS = Object.keys(PETS) as PetKind[];

/** Prezzo di una porzione di cibo e quanta fame toglie. */
export const PET_FOOD_PRICE = 5;
export const PET_FOOD_GAIN = 50;
/** Sotto questa fame l'animale si lamenta (miagola, abbaia…). */
export const PET_HUNGRY = 30;
/** Quanto resiste un animale con la fame a zero prima di morire. */
export const PET_STARVE_MS = 24 * 3_600_000;
/** Felicità persa dal giocatore quando gli muore un animale. */
export const PET_DEATH_SADNESS = 50;
/** Secondi perché la fame passi da 100 a 0: come la fame del giocatore da sveglio (un giorno). */
export const PET_HUNGER_DEPLETION_SEC = 86400;
/** Quanto prima della morte arriva l'avviso "sta per morire". */
export const PET_DYING_WARN_MS = 6 * 3_600_000;
/** Il cane al guinzaglio rende il doppio più felici. */
export const WALK_BONUS_FACTOR = 2;

/**
 * Felicità all'ora data dalla compagnia di un animale vicino: un po' di più per quelli che
 * costano di più (pesce 2%, cane quasi 4%). Il cane a passeggio dà il doppio.
 */
export function petCompanyPerHour(kind: PetKind, walking = false): number {
  const base = 1.5 + PETS[kind].price / 50;
  return Math.round(base * (walking ? WALK_BONUS_FACTOR : 1) * 10) / 10;
}

export interface PetState {
  /** Fame (0-100) al momento `at`; scende poi come quella del giocatore da sveglio. */
  hunger: number;
  at: number;
  /** Posizione della casetta nella stanza (solo per gli animali in gabbia). */
  x?: number;
  y?: number;
  rot?: number;
  /** Solo il cane: premietti meritati nell'area cani per ogni comando (vedi dog-training-rules). */
  train?: { sit: number; paw: number };
}
export type PetBook = Partial<Record<PetKind, PetState>>;

/** Fame dell'animale adesso. `depletionSec` = secondi perché la fame passi da 100 a 0. */
export function petHunger(p: PetState, now: number, depletionSec: number): number {
  const elapsed = Math.max(0, now - p.at) / 1000;
  return Math.max(0, Math.min(100, p.hunger - (100 * elapsed) / depletionSec));
}

/** Quando la fame arriva a zero (ms). */
export function petStarvesAt(p: PetState, depletionSec: number): number {
  return p.at + (p.hunger / 100) * depletionSec * 1000;
}

/** Quando l'animale morirà di fame se nessuno gli dà da mangiare (ms). */
export function petDiesAt(p: PetState, depletionSec: number): number {
  return petStarvesAt(p, depletionSec) + PET_STARVE_MS;
}

/** L'animale è morto di fame? (dopo 24 ore con la fame a zero) */
export function petIsDead(p: PetState, now: number, depletionSec: number): boolean {
  return now >= petStarvesAt(p, depletionSec) + PET_STARVE_MS;
}

/** Nuovo animale: arriva sazio. */
export function newPet(now: number, spot?: { x: number; y: number }): PetState {
  return { hunger: 100, at: now, ...(spot ? { x: spot.x, y: spot.y } : {}) };
}

/** Dà da mangiare: la fame sale del 50% (al massimo 100). */
export function feedPet(p: PetState, now: number, depletionSec: number): PetState {
  return { ...p, hunger: Math.min(100, petHunger(p, now, depletionSec) + PET_FOOD_GAIN), at: now };
}

/** Errore che impedisce di comprare l'animale, oppure null. */
export function buyPetError(book: PetBook, kind: PetKind, money: number): string | null {
  if (book[kind]) return `Hai già un ${PETS[kind].name}.`;
  if (money < PETS[kind].price)
    return `Ti servono ${PETS[kind].price} € in cassaforte per il ${PETS[kind].name}.`;
  return null;
}

/** Legge gli animali dal salvataggio scartando i valori non validi. */
export function decodePets(value: unknown): PetBook {
  const out: PetBook = {};
  if (!value || typeof value !== 'object') return out;
  const num = (v: unknown) => typeof v === 'number' && Number.isFinite(v);
  for (const kind of PET_KINDS) {
    const p = (value as Record<string, unknown>)[kind] as Record<string, unknown> | undefined;
    if (!p || typeof p !== 'object' || !num(p.hunger) || !num(p.at)) continue;
    const st: PetState = {
      hunger: Math.max(0, Math.min(100, p.hunger as number)),
      at: Math.max(0, p.at as number),
    };
    if (num(p.x) && num(p.y)) {
      st.x = Math.max(-200, Math.min(200, p.x as number));
      st.y = Math.max(-180, Math.min(180, p.y as number));
    }
    if (Number.isInteger(p.rot) && (p.rot as number) >= 0 && (p.rot as number) < 4)
      st.rot = p.rot as number;
    const tr = p.train as Record<string, unknown> | undefined;
    if (kind === 'dog' && tr && typeof tr === 'object') {
      const count = (v: unknown) =>
        Number.isInteger(v) ? Math.max(0, Math.min(60, v as number)) : 0;
      st.train = { sit: count(tr.sit), paw: count(tr.paw) };
    }
    out[kind] = st;
  }
  return out;
}
