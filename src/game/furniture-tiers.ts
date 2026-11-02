// Fasce dei mobili: standard → pregiata → lusso (senza dipendenze dal browser, così sono testabili).

export type FurnitureTier = 'std' | 'premium' | 'lux';

export const TIER_RANK: Record<FurnitureTier, number> = { std: 0, premium: 1, lux: 2 };
export const TIER_LABEL: Record<FurnitureTier, string> = {
  std: 'Standard',
  premium: 'Pregiato 💎',
  lux: 'Lusso ✨',
};

interface FurnitureDef {
  id: string;
  category: string;
  propKey: string;
  isLuxury?: boolean;
}

/** Fascia di un mobile del catalogo, ricavata dal suo ID (…_std, …_pre, …_lux). */
export function tierOf(def: FurnitureDef): FurnitureTier {
  if (def.isLuxury || def.id.endsWith('_lux')) return 'lux';
  if (def.id.endsWith('_pre')) return 'premium';
  return 'std';
}

/**
 * Fascia di un mobile già posizionato, ricavata dal nome: funziona anche per le stanze
 * degli altri giocatori, che ricevono solo nome e colori.
 */
export function tierOfPlaced(item: { name?: string }): FurnitureTier {
  const name = item.name || '';
  if (/✨|Lusso/.test(name)) return 'lux';
  if (/💎|Pregiat/.test(name)) return 'premium';
  return 'std';
}

/** Mobili di una categoria, dal più semplice al più pregiato. */
export function tiersOf<T extends FurnitureDef>(catalog: T[], category: string): T[] {
  return catalog
    .filter((def) => def.category === category)
    .sort((a, b) => TIER_RANK[tierOf(a)] - TIER_RANK[tierOf(b)]);
}

/** Il mobile migliore posseduto per ogni posizione della stanza (propKey). */
export function bestOwnedByProp<T extends FurnitureDef>(
  catalog: T[],
  owned: Record<string, boolean>,
): Map<string, T> {
  const best = new Map<string, T>();
  for (const def of catalog) {
    if (!owned[def.id]) continue;
    const current = best.get(def.propKey);
    if (!current || TIER_RANK[tierOf(def)] > TIER_RANK[tierOf(current)]) best.set(def.propKey, def);
  }
  return best;
}

/**
 * Il prossimo mobile da comprare in una categoria: quello della fascia subito superiore
 * al migliore già posseduto. null se si ha già il lusso.
 */
export function nextUpgrade<T extends FurnitureDef>(
  catalog: T[],
  owned: Record<string, boolean>,
  category: string,
): T | null {
  const list = tiersOf(catalog, category);
  let bestRank = -1;
  for (const def of list) if (owned[def.id]) bestRank = Math.max(bestRank, TIER_RANK[tierOf(def)]);
  return list.find((def) => TIER_RANK[tierOf(def)] > bestRank) ?? null;
}
