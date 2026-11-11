// Lo zaino legge le scorte esistenti: nessuna copia degli oggetti nei salvataggi.
import type { CharacterState } from './models.js';
import { STRAINS, STRAIN_IDS } from './weed-rules.js';

export const INVENTORY_SIZE = 20;

/** Una pila occupa uno spazio; la quantità indica grammi, pillole o altri pezzi. */
export interface InventoryItem {
  id: string;
  icon: string;
  name: string;
  quantity: number;
  unit: string;
  description: string;
}

/** Qui si aggiungono gli altri oggetti che potranno essere portati nello zaino. */
export function inventoryItems(
  player: Pick<CharacterState, 'weed' | 'drugStock'> &
    Partial<Pick<CharacterState, 'rawFood' | 'dishes'>>,
): InventoryItem[] {
  const items: InventoryItem[] = [];
  // il cibo per primo: piatti pronti da mangiare o regalare, poi il cibo da cucinare
  if ((player.dishes ?? 0) > 0)
    items.push({
      id: 'dish',
      icon: '🍝',
      name: 'Piatto cucinato',
      quantity: player.dishes!,
      unit: player.dishes === 1 ? 'piatto' : 'piatti',
      description: 'Mangialo dove vuoi (+50% fame) o regalalo a chi ti sta vicino.',
    });
  if ((player.rawFood ?? 0) > 0)
    items.push({
      id: 'raw_food',
      icon: '🍎',
      name: 'Cibo crudo',
      quantity: player.rawFood!,
      unit: player.rawFood === 1 ? 'pezzo' : 'pezzi',
      description: 'Cucinalo al fornello della cucina: diventa un piatto.',
    });
  const weed = player.weed;
  if (weed && weed.grams > 0)
    items.push({
      id: 'weed',
      icon: '🌿',
      name: 'Erba',
      quantity: weed.grams,
      unit: 'g',
      description: weed.jarStrain
        ? `Varietà dell’ultimo raccolto: ${STRAINS[weed.jarStrain].name}.`
        : 'Erba raccolta dalle tue piante.',
    });
  if (player.drugStock > 0)
    items.push({
      id: 'drug',
      icon: '💊',
      name: 'Pillole misteriose',
      quantity: player.drugStock,
      unit: 'pillole',
      description: 'Nessuno sa cosa contengono. Puoi conservarle, prenderle o scambiarle.',
    });
  // semi: si piantano nei vasi della stanza (per ora non si scambiano)
  for (const id of STRAIN_IDS) {
    const n = weed?.seeds?.[id] ?? 0;
    if (n > 0)
      items.push({
        id: 'seed_' + id,
        icon: '🌰',
        name: `Semi di ${STRAINS[id].name}`,
        quantity: n,
        unit: n === 1 ? 'seme' : 'semi',
        description:
          'Piantali in un vaso vuoto nella tua stanza. I vasi li vende Rocco al grow shop.',
      });
  }
  return items;
}

export const inventorySlots = (items: readonly InventoryItem[]): (InventoryItem | null)[] =>
  Array.from({ length: INVENTORY_SIZE }, (_, i) => items[i] ?? null);
