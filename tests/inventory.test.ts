import { describe, expect, it } from 'vitest';
import { inventoryItems, inventorySlots } from '../src/game/inventory-rules.js';

describe('zaino', () => {
  it('mostra venti spazi vuoti senza scorte nei vecchi salvataggi', () => {
    expect(inventorySlots(inventoryItems({ drugStock: 0 }))).toEqual(Array(20).fill(null));
  });

  it('impila le quantità senza consumarle o duplicarle', () => {
    const player = { drugStock: 3, weed: { grams: 125, jarStrain: 'purple' as const } };
    const original = structuredClone(player);
    const items = inventoryItems(player);
    const slots = inventorySlots(items);
    expect(slots).toHaveLength(20);
    expect(items.map(({ id, quantity, unit }) => ({ id, quantity, unit }))).toEqual([
      { id: 'weed', quantity: 125, unit: 'g' },
      { id: 'drug', quantity: 3, unit: 'dosi' },
    ]);
    expect(items[0].description).toContain('Purple Haze');
    expect(slots.filter(Boolean)).toHaveLength(2);
    expect(player).toEqual(original);
  });

  it('libera lo spazio quando una scorta finisce e non mostra la pianta in crescita', () => {
    const player = { drugStock: 0, weed: { grams: 0, strain: 'lemon' as const, plantedAt: 1 } };
    expect(inventoryItems(player)).toEqual([]);
    player.drugStock = 2;
    expect(inventoryItems(player).map((item) => item.id)).toEqual(['drug']);
  });
});
