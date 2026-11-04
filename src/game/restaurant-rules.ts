// Regole del turno al ristorante: piatti, pazienza dei clienti, mance e ritmo degli arrivi.
// Niente browser qui: le usa restaurant.ts e le controllano i test.

export type Station = 'oven' | 'stove' | 'cellar' | 'dessert' | 'counter';
/** Le postazioni dove si cucina (le altre danno il piatto subito). */
export type CookStation = 'oven' | 'stove';
export type DishId = 'pizza' | 'pasta' | 'vino' | 'dolce' | 'caffe';

export interface Dish {
  e: string;
  label: string;
  station: Station;
  /** secondi nel forno o sul fornello (0 = si prende subito) */
  cook: number;
}

export const DISHES: Record<DishId, Dish> = {
  pizza: { e: '🍕', label: 'Pizza', station: 'oven', cook: 2.5 },
  pasta: { e: '🍝', label: 'Pasta', station: 'stove', cook: 2 },
  vino: { e: '🍷', label: 'Vino', station: 'cellar', cook: 0 },
  dolce: { e: '🍰', label: 'Tiramisù', station: 'dessert', cook: 0 },
  caffe: { e: '☕', label: 'Caffè', station: 'counter', cook: 0 },
};
export const DISH_IDS = Object.keys(DISHES) as DishId[];

/** Clienti seduti al massimo nello stesso momento: da telefono non deve diventare frenetico. */
export const MAX_GUESTS = 3;
/** Velocità dei clienti che entrano ed escono. */
export const WALK_SPEED = 90;
/** Quanto resta a mangiare un cliente servito. */
export const EAT_SECONDS = 4;

const clamp01 = (k: number) => Math.max(0, Math.min(1, k));

/** Secondi di pazienza di un cliente che si siede a questo punto del turno (0 inizio, 1 fine). */
export function patienceFor(progress: number): number {
  return 24 - 8 * clamp01(progress);
}

/** Secondi fino al prossimo cliente: verso la fine arrivano più spesso. `r` tra 0 e 1. */
export function arrivalGap(progress: number, r: number): number {
  return 6.5 - 3 * clamp01(progress) + clamp01(r) * 2;
}

/**
 * Cosa ordina un cliente: un piatto, e dalla seconda metà del turno a volte anche un secondo
 * diverso dal primo. `r1`…`r3` tra 0 e 1.
 */
export function orderFor(progress: number, r1: number, r2: number, r3: number): DishId[] {
  const pick = (r: number) =>
    DISH_IDS[Math.min(DISH_IDS.length - 1, Math.floor(clamp01(r) * DISH_IDS.length))];
  const first = pick(r1);
  if (progress < 0.5 || r2 >= 0.45) return [first];
  const rest = DISH_IDS.filter((d) => d !== first);
  return [first, rest[Math.min(rest.length - 1, Math.floor(clamp01(r3) * rest.length))]];
}

/** Mancia per un tavolo servito con questa parte di pazienza ancora da spendere (0…1). */
export function tipFor(patienceLeft: number, perItem: number): number {
  return Math.round(perItem * 1.5 * clamp01(patienceLeft));
}

/** Colore dell'anello di pazienza. */
export function moodOf(patienceLeft: number): 'ok' | 'warn' | 'bad' {
  return patienceLeft > 0.5 ? 'ok' : patienceLeft > 0.2 ? 'warn' : 'bad';
}

/** Il primo piatto di questa postazione ancora da preparare, dal cliente con meno pazienza. */
export function nextCookDish(
  station: CookStation,
  guests: readonly { order: DishId[]; served: DishId[]; patience: number; waiting: boolean }[],
  busy: readonly DishId[],
): DishId | null {
  const left = [...busy];
  const sorted = guests.filter((g) => g.waiting).sort((a, b) => a.patience - b.patience);
  for (const g of sorted)
    for (const d of missing(g.order, g.served)) {
      if (DISHES[d].station !== station) continue;
      const i = left.indexOf(d);
      // già sul fuoco, pronto o in mano: vale per questo cliente
      if (i >= 0) left.splice(i, 1);
      else return d;
    }
  return null;
}

/** Piatti dell'ordine non ancora serviti (contando i doppioni). */
export function missing(order: readonly DishId[], served: readonly DishId[]): DishId[] {
  const rest = [...served];
  return order.filter((d) => {
    const i = rest.indexOf(d);
    if (i < 0) return true;
    rest.splice(i, 1);
    return false;
  });
}
