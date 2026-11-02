import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import { SHOP_CATALOG, SLOT_INFO } from '../src/game/data/catalogues.js';

const rules = JSON.parse(fs.readFileSync('firebase/database.rules.proposed.json', 'utf8')).rules;
const room = rules.sims_rooms_state.$room;

describe('catalogo dei vestiti', () => {
  it('ha ID unici e ogni capo appartiene a una categoria esistente', () => {
    const ids = SHOP_CATALOG.map((item) => item.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const item of SHOP_CATALOG) expect(Object.keys(SLOT_INFO)).toContain(item.slot);
  });

  it('ogni capo acquistabile è ammesso e protetto dalle regole del database', () => {
    for (const { id } of SHOP_CATALOG) {
      expect(room.economy.ownedItems, id).toHaveProperty(id);
      expect(room['.validate'], id).toContain(`economy/ownedItems/${id}'`);
    }
  });
});
