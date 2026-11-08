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
  it('ogni categoria ha pregiato e lusso, e lo standard solo se la stanza non lo ha già (cassaforte: solo livello 2; cabinato: solo standard)', () => {
    for (const category of categories) {
      const list = tiersOf(catalog, category);
      // la cassaforte ha un solo potenziamento: il livello 2 (fascia pregiata)
      const expected: string[] =
        category === 'safe'
          ? ['premium']
          : category === 'cabinet'
            ? ['std']
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

describe('showroom del negozio di mobili', () => {
  it('espone ogni mobile del catalogo, in tutte le fasce, più le versioni standard di casa', async () => {
    const { STORE_FLOOR_FURNITURE } = await import('../src/game/data/catalogues.js');
    const shown = Object.values(STORE_FLOOR_FURNITURE as Record<string, { showId?: string }>)
      .map((it) => it.showId)
      .filter(Boolean);
    for (const def of catalog) expect(shown, def.id).toContain(def.id);
    for (const id of ['bed_std', 'wardrobe_std', 'desk_std', 'safe_std'])
      expect(shown, id).toContain(id);
  });

  it('le pedane non si sovrappongono, stanno nel negozio e lasciano libero il corridoio', async () => {
    const { STORE_FLOOR_FURNITURE } = await import('../src/game/data/catalogues.js');
    type It = { x: number; y: number; w: number; h: number; showId?: string };
    const items = Object.entries(STORE_FLOOR_FURNITURE as Record<string, It>).filter(
      ([k]) => k !== 'doorExit',
    );
    // la pedana è il mobile più 9 di margine per lato
    const box = ([k, it]: [string, It]) => {
      const pad = it.showId ? 9 : 0;
      return {
        k,
        x0: it.x - it.w / 2 - pad,
        x1: it.x + it.w / 2 + pad,
        y0: it.y - it.h / 2 - pad,
        y1: it.y + it.h / 2 + pad,
      };
    };
    const boxes = items.map(box);
    for (const b of boxes) {
      expect(b.x0, b.k).toBeGreaterThan(-520);
      expect(b.x1, b.k).toBeLessThan(520);
      expect(b.y0, b.k).toBeGreaterThan(-360);
      expect(b.y1, b.k).toBeLessThan(360);
      // corridoio dall'ingresso al fondo
      if (b.k !== 'shopCounter') expect(b.x1 < -100 || b.x0 > 100, b.k).toBe(true);
    }
    for (let i = 0; i < boxes.length; i++)
      for (let j = i + 1; j < boxes.length; j++) {
        const a = boxes[i],
          b = boxes[j];
        const overlap = a.x0 < b.x1 && b.x0 < a.x1 && a.y0 < b.y1 && b.y0 < a.y1;
        expect(overlap, `${a.k} / ${b.k}`).toBe(false);
      }
  });

  it('ogni modello dice cosa vuol dire per chi guarda', async () => {
    const { showroomStatus } = await import('../src/game/furniture-tiers.js');
    const st = (owned: Record<string, boolean>, id: string, category: string) =>
      showroomStatus(catalog, owned, { id, category });
    // nessun divano: si comincia dallo standard
    expect(st({}, 'sofa_std', 'sofa')).toBe('next');
    expect(st({}, 'sofa_pre', 'sofa')).toBe('locked');
    expect(st({}, 'sofa_lux', 'sofa')).toBe('locked');
    // col pregiato: lo standard è superato, il lusso è il prossimo
    expect(st({ sofa_std: true, sofa_pre: true }, 'sofa_std', 'sofa')).toBe('better');
    expect(st({ sofa_std: true, sofa_pre: true }, 'sofa_pre', 'sofa')).toBe('mine');
    expect(st({ sofa_std: true, sofa_pre: true }, 'sofa_lux', 'sofa')).toBe('next');
    // il letto standard ce l'hanno tutti in stanza
    expect(st({}, 'bed_std', 'bed')).toBe('mine');
    expect(st({}, 'bed_pre', 'bed')).toBe('next');
    expect(st({ bed_pre: true }, 'bed_std', 'bed')).toBe('better');
  });
});
