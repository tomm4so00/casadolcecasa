import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import { FURNITURE_CATALOG } from '../src/game/data/catalogues.js';
import {
  bestOwnedByProp,
  nextUpgrade,
  tierOf,
  tierOfPlaced,
  tiersOf,
} from '../src/game/furniture-tiers.js';

const catalog = FURNITURE_CATALOG;
const categories = [...new Set(catalog.map((f) => f.category))];

describe('fasce dei mobili', () => {
  it('ogni categoria ha standard, pregiato e lusso con prezzi crescenti', () => {
    for (const category of categories) {
      const list = tiersOf(catalog, category);
      expect(list.map(tierOf), category).toEqual(['std', 'premium', 'lux']);
      expect(list[0].price).toBeLessThan(list[1].price);
      expect(list[1].price).toBeLessThan(list[2].price);
      // il nome del mobile posizionato basta a riconoscerne la fascia
      expect(list.map((f) => tierOfPlaced(f.propData))).toEqual(['std', 'premium', 'lux']);
    }
  });

  it('nel negozio si sale di una fascia alla volta', () => {
    expect(nextUpgrade(catalog, {}, 'bed')?.id).toBe('bed_std');
    expect(nextUpgrade(catalog, { bed_std: true }, 'bed')?.id).toBe('bed_pre');
    expect(nextUpgrade(catalog, { bed_std: true, bed_pre: true }, 'bed')?.id).toBe('bed_lux');
    // chi aveva già il lusso non deve comprare il pregiato
    expect(nextUpgrade(catalog, { bed_std: true, bed_lux: true }, 'bed')).toBeNull();
  });

  it('la stanza mostra sempre il mobile migliore posseduto', () => {
    const owned = { sofa_lux: true, sofa_std: true, sofa_pre: true, tv_pre: true, tv_std: true };
    const best = bestOwnedByProp(catalog, owned);
    expect(best.get('sofa')?.id).toBe('sofa_lux');
    expect(best.get('tv')?.id).toBe('tv_pre');
  });

  it('ogni mobile è ammesso e protetto dalle regole del database', () => {
    const room = JSON.parse(fs.readFileSync('firebase/database.rules.proposed.json', 'utf8')).rules
      .sims_rooms_state.$room;
    for (const { id } of catalog) {
      expect(room.economy.ownedFurniture, id).toHaveProperty(id);
      expect(room['.validate'], id).toContain(`economy/ownedFurniture/${id}'`);
    }
  });
});
