// Il cibo nello zaino: cibo crudo (preso dal frigo) e piatti cucinati, a scorta.
// Senza dipendenze dal browser, così è testabile.

/** Quanti pezzi di ogni tipo stanno nello zaino (una pila per tipo). */
export const FOOD_STACK_MAX = 10;
/** Un piatto recupera tanta fame. */
export const DISH_HUNGER = 50;

export interface FoodStock {
  raw: number;
  dishes: number;
}

const count = (v: unknown): number =>
  Number.isSafeInteger(v) && (v as number) > 0 ? Math.min(FOOD_STACK_MAX, v as number) : 0;

/**
 * Dal salvataggio. I salvataggi di prima avevano un cibo solo, "in mano": hasFood e foodCooked
 * (cotto). Se ci sono i contatori nuovi valgono quelli.
 */
export function decodeFood(inventory: unknown): FoodStock {
  if (!inventory || typeof inventory !== 'object') return { raw: 0, dishes: 0 };
  const v = inventory as Record<string, unknown>;
  if (v.raw !== undefined || v.dishes !== undefined)
    return { raw: count(v.raw), dishes: count(v.dishes) };
  if (v.hasFood !== true) return { raw: 0, dishes: 0 };
  return v.foodCooked === true ? { raw: 0, dishes: 1 } : { raw: 1, dishes: 0 };
}

/**
 * Per il salvataggio: i contatori, più i due campi di prima, così una versione vecchia del gioco
 * aperta da qualche parte vede almeno un cibo (cotto se c'è un piatto).
 */
export function encodeFood(stock: FoodStock): {
  hasFood: boolean;
  foodCooked: boolean;
  raw: number;
  dishes: number;
} {
  return {
    hasFood: stock.raw + stock.dishes > 0,
    foodCooked: stock.dishes > 0,
    raw: stock.raw,
    dishes: stock.dishes,
  };
}

/** Si può prendere altro cibo dal frigo? */
export const canTakeRaw = (s: FoodStock): boolean => s.raw < FOOD_STACK_MAX;
/** Si può cucinare? Serve cibo crudo e posto per il piatto. */
export const canCook = (s: FoodStock): boolean => s.raw > 0 && s.dishes < FOOD_STACK_MAX;
