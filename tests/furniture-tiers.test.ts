import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import { FURNITURE_CATALOG, PLAYER_ROOM_FURNITURE } from '../src/game/data/catalogues.js';
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
  it('ogni categoria ha pregiato e lusso, e lo standard solo se la stanza non lo ha già (cassaforte: solo livello 2)', () => {
    for (const category of categories) {
      const list = tiersOf(catalog, category);
      // la cassaforte ha un solo potenziamento: il livello 2 (fascia pregiata)
      const expected: string[] =
        category === 'safe'
          ? ['premium']
          : category in PLAYER_ROOM_FURNITURE
            ? ['premium', 'lux']
            : ['std', 'premium', 'lux'];
      expect(list.map(tierOf), category).toEqual(expected);
      for (let i = 1; i < list.length; i++) expect(list[i - 1].price).toBeLessThan(list[i].price);
      // il nome del mobile posizionato basta a riconoscerne la fascia (la cassaforte è a muro e
      // il suo livello si legge dagli acquisti della stanza)
      if (category !== 'safe') expect(list.map((f) => tierOfPlaced(f.propData))).toEqual(expected);
    }
  });

  it('i cataloghi non vendono i mobili che ogni stanza ha già', () => {
    for (const id of ['bed_std', 'wardrobe_std', 'desk_std'])
      expect(
        catalog.some((f) => f.id === id),
        id,
      ).toBe(false);
  });

  it('nel negozio si sale di una fascia alla volta', () => {
    // il letto standard è già nella stanza: si parte dal pregiato
    expect(nextUpgrade(catalog, {}, 'bed')?.id).toBe('bed_pre');
    expect(nextUpgrade(catalog, { bed_pre: true }, 'bed')?.id).toBe('bed_lux');
    expect(nextUpgrade(catalog, { bed_lux: true }, 'bed')).toBeNull();
    // per i mobili che la stanza non ha, si comincia dallo standard
    expect(nextUpgrade(catalog, {}, 'sofa')?.id).toBe('sofa_std');
    expect(nextUpgrade(catalog, { sofa_std: true }, 'sofa')?.id).toBe('sofa_pre');
    // chi aveva già il lusso non deve comprare il pregiato
    expect(nextUpgrade(catalog, { sofa_std: true, sofa_lux: true }, 'sofa')).toBeNull();
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
