// Lo zaino legge le scorte esistenti: nessuna copia degli oggetti nei salvataggi.
import type { CharacterState } from './models.js';
import { STRAINS } from './weed-rules.js';

export const INVENTORY_SIZE = 20;

/** Una pila occupa uno spazio; la quantità indica grammi, dosi o altri pezzi. */
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
  player: Pick<CharacterState, 'weed' | 'drugStock'>,
): InventoryItem[] {
  const items: InventoryItem[] = [];
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
        : 'Erba raccolta nel tuo barattolo.',
    });
  if (player.drugStock > 0)
    items.push({
      id: 'drug',
      icon: '💊',
      name: 'Dosi',
      quantity: player.drugStock,
      unit: 'dosi',
      description: 'Puoi conservarle, assumerle o scambiarle con altri giocatori.',
    });
  return items;
}

export const inventorySlots = (items: readonly InventoryItem[]): (InventoryItem | null)[] =>
  Array.from({ length: INVENTORY_SIZE }, (_, i) => items[i] ?? null);
