import fs from 'node:fs';
import { describe, expect, it } from 'vitest';
import {
  COLLECTIBLES,
  SHELF_SPOTS,
  STANDS,
  collectionOf,
  decodeCollect,
  freeShelfSpot,
  onSale,
  pickForStand,
  shelfOf,
  standNeedsRefill,
} from '../src/game/collect-rules.js';

const A = 'player_anna';
const B = 'player_luca';

describe('oggetti da collezione', () => {
  it('il catalogo ha 20 pezzi diversi, ognuno con nome, emoji e prezzo', () => {
    expect(COLLECTIBLES).toHaveLength(20);
    expect(new Set(COLLECTIBLES.map((c) => c.id)).size).toBe(20);
    for (const c of COLLECTIBLES) {
      expect(c.id).toMatch(/^col_[a-z]+$/);
      expect(c.name.length).toBeGreaterThan(3);
      expect(c.emoji).toBeTruthy();
      expect(c.price).toBeGreaterThan(0);
    }
  });

  it('legge il database scartando valori non validi', () => {
    const s = decodeCollect({
      slots: ['col_tomo', 'nulla', null, 'col_globo'],
      owners: {
        col_tomo: { o: A, on: 'Anna', t: 5, s: 1 },
        col_finto: { o: A, on: 'Anna', t: 5 },
        col_globo: { o: 'hacker', on: 'X', t: 1 },
        col_barca: { o: B, on: 'Luca', t: 2, s: 7 },
      },
    });
    expect(s.slots).toEqual(['col_tomo', null, null, 'col_globo', null]);
    expect(Object.keys(s.owners).sort()).toEqual(['col_barca', 'col_tomo']);
    expect(s.owners.col_tomo.s).toBe(1);
    expect(s.owners.col_barca.s).toBeUndefined(); // posto sulla mensola che non esiste
  });

  it('un espositore va riempito se è vuoto, venduto o doppione', () => {
    const s = decodeCollect({
      slots: ['col_tomo', 'col_globo', 'col_tomo', null, 'col_barca'],
      owners: { col_globo: { o: A, on: 'Anna', t: 1 } },
    });
    expect(standNeedsRefill(s, 0)).toBe(false);
    expect(standNeedsRefill(s, 1)).toBe(true); // venduto
    expect(standNeedsRefill(s, 2)).toBe(true); // doppione
    expect(standNeedsRefill(s, 3)).toBe(true); // vuoto
    expect(standNeedsRefill(s, 4)).toBe(false);
    expect(onSale(s, 1)).toBeNull();
    expect(onSale(s, 0)?.id).toBe('col_tomo');
  });

  it('il pezzo nuovo è a caso tra quelli non venduti e non già esposti', () => {
    const owners: Record<string, { o: string; on: string; t: number }> = {};
    for (const c of COLLECTIBLES.slice(0, 14)) owners[c.id] = { o: A, on: 'Anna', t: 1 };
    const shown = COLLECTIBLES.slice(14, 18).map((c) => c.id);
    const s = decodeCollect({ slots: [...shown, COLLECTIBLES[0].id], owners });
    const free = COLLECTIBLES.slice(18).map((c) => c.id);
    for (const r of [0, 0.4, 0.99]) expect(free).toContain(pickForStand(s, 4, () => r));
    // tutti venduti o esposti: non c'è niente da mettere
    for (const id of free) owners[id] = { o: B, on: 'Luca', t: 1 };
    expect(pickForStand(decodeCollect({ slots: [...shown, null], owners }), 4)).toBeNull();
  });

  it('riempiendo un espositore alla volta non escono mai doppioni', () => {
    let state = decodeCollect(null);
    for (let i = 0; i < STANDS; i++) {
      const id = pickForStand(state, i);
      state = { ...state, slots: state.slots.map((v, k) => (k === i ? id : v)) };
    }
    expect(new Set(state.slots).size).toBe(STANDS);
    expect(state.slots.every(Boolean)).toBe(true);
  });

  it('la mensola: al massimo tre pezzi, solo i propri', () => {
    const s = decodeCollect({
      owners: {
        col_tomo: { o: A, on: 'Anna', t: 1, s: 2 },
        col_globo: { o: A, on: 'Anna', t: 1 },
        col_barca: { o: B, on: 'Luca', t: 1, s: 0 },
      },
    });
    expect(collectionOf(s, A).map((c) => c.id)).toEqual(['col_tomo', 'col_globo']);
    expect(shelfOf(s, A).map((c) => c?.id ?? null)).toEqual([null, null, 'col_tomo']);
    expect(freeShelfSpot(s, A)).toBe(0);
    const full = decodeCollect({
      owners: Object.fromEntries(
        COLLECTIBLES.slice(0, SHELF_SPOTS + 1).map((c, i) => [
          c.id,
          { o: A, on: 'Anna', t: 1, s: i },
        ]),
      ),
    });
    expect(freeShelfSpot(full, A)).toBeNull();
  });

  it('il database: una sola copia, espositori cambiati solo per un pezzo venduto', () => {
    const r = JSON.parse(fs.readFileSync('firebase/database.rules.proposed.json', 'utf8')).rules;
    const own = r.sims_collect.owners.$item;
    expect(own['.write']).toContain("!data.exists() && newData.child('o').val() ===");
    expect(own['.validate']).toContain('/^col_[a-z]+$/');
    expect(own.$other['.validate']).toBe(false);
    const slot = r.sims_collect.slots.$i;
    expect(slot['.write']).toContain(".child('owners').child(data.val()).exists()");
    expect(slot['.write']).toContain(
      "!root.child('sims_collect').child('owners').child(newData.val())",
    );
    expect(slot['.validate']).toContain('/^[0-4]$/');
  });
});
