import fs from 'node:fs';
import { describe, expect, it } from 'vitest';
import {
  collectOfferError,
  decodeCollect,
  freeUsedStand,
  giveTo,
  inUsedShop,
  offShelf,
  shelfFull,
} from '../src/game/collect-rules';

const A = 'player_anna';
const B = 'player_bruno';
const owner = { o: A, on: 'Anna', t: 1, s: 0 };

describe('offerte per i pezzi sulla mensola', () => {
  it('si offre solo per i pezzi degli altri, con una cifra valida che si ha in cassaforte', () => {
    expect(collectOfferError(500, 1000, owner, B)).toBeNull();
    expect(collectOfferError(500, 1000, owner, A)).toBe('È già tuo.');
    expect(collectOfferError(500, 1000, undefined, B)).toContain('non è più');
    expect(collectOfferError(0, 1000, owner, B)).toContain('prezzo');
    expect(collectOfferError(2.5, 1000, owner, B)).toContain('prezzo');
    expect(collectOfferError(15000, 10000, owner, B)).toContain('10.000 €');
  });

  it('accettando, il proprietario dà subito il pezzo (fuori dalla sua mensola)', () => {
    expect(giveTo(owner, A, B, 'Bruno', 50)).toEqual({ o: B, on: 'Bruno', t: 50 });
    // solo il proprietario, non a sé stesso, non se è in vendita all'usato
    expect(giveTo(owner, B, B, 'Bruno', 50)).toBeNull();
    expect(giveTo(owner, A, A, 'Anna', 50)).toBeNull();
    expect(giveTo({ ...owner, sale: { p: 9, t: 1, st: 0 } }, A, B, 'Bruno', 50)).toBeNull();
    expect(giveTo(owner, A, 'qualcuno', 'X', 50)).toBeNull();
  });

  it('mensola piena: il pezzo nuovo resta fuori finché non si libera un posto', () => {
    const state = decodeCollect({
      owners: {
        col_tomo: { o: B, on: 'Bruno', t: 1, s: 0 },
        col_globo: { o: B, on: 'Bruno', t: 1, s: 1 },
        col_sfera: { o: B, on: 'Bruno', t: 1, s: 2 },
        col_busto: { o: B, on: 'Bruno', t: 2 },
      },
    });
    expect(shelfFull(state, B)).toBe(true);
    expect(shelfFull(state, A)).toBe(false);
    expect(offShelf(state, B).map((c) => c.id)).toEqual(['col_busto']);
  });

  it("si mette in vendita se c'è un espositore libero all'usato, altrimenti si butta", () => {
    const listed = (i: number, id: string) => ({ [id]: { ...owner, sale: { p: 9, t: 1, st: i } } });
    const ids = ['col_tomo', 'col_globo', 'col_sfera', 'col_busto', 'col_lava'];
    const four = decodeCollect({
      owners: Object.assign({}, ...ids.slice(0, 4).map((id, i) => listed(i, id))),
      used: { 0: ids[0], 1: ids[1], 2: ids[2], 3: ids[3] },
    });
    expect(freeUsedStand(four)).toBe(4);
    expect(inUsedShop(four, 'col_tomo')).toBe(true);
    const full = decodeCollect({
      owners: Object.assign({}, ...ids.map((id, i) => listed(i, id))),
      used: Object.fromEntries(ids.map((id, i) => [i, id])),
    });
    expect(freeUsedStand(full)).toBeNull();
  });

  it('il database: il proprietario può dare o buttare un suo pezzo, e accetta i messaggi', () => {
    const r = JSON.parse(fs.readFileSync('firebase/database.rules.proposed.json', 'utf8')).rules;
    const w: string = r.sims_collect.owners.$item['.write'];
    // dare: a un altro giocatore, senza annuncio né posto sulla mensola
    expect(w).toContain("newData.child('o').val() !== root.child('sims_accounts')");
    // buttare: solo il proprietario, e non se è in vendita
    expect(w).toContain("!data.child('sale').exists() && !newData.exists()");
    const types: string = r.sims_interactions.$pid.$key['.validate'];
    for (const t of ['colOffer', 'colDone', 'colNo']) expect(types).toContain('|' + t);
    expect(types).not.toContain('colYes');
  });
});
