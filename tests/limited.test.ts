import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import { LIMITED_FURNITURE, SHOP_CATALOG } from '../src/game/data/catalogues';
import {
  LIMITED_COPIES,
  decodeOffers,
  decodeSent,
  unaffordable,
  withdrawnText,
  offerStillValid,
  acceptSale,
  claimSale,
  copiesLeft,
  copyOf,
  decodeLedger,
  itemsOf,
  nextFreeCopy,
  offerError,
} from '../src/game/limited-rules';

const A = 'player_anna',
  B = 'player_luca';

describe('edizione limitata', () => {
  it('le offerte aspettano il proprietario finché non risponde', () => {
    const list = decodeOffers({
      b: {
        from: B,
        fromName: 'Luca',
        item: 'ltd_crown',
        n: 2,
        amt: 900,
        t: 20,
        name: 'Corona #2/5',
      },
      a: {
        from: 'player_sara',
        fromName: 'Sara',
        item: 'ltd_crown',
        n: 2,
        amt: 700,
        t: 10,
        name: 'x',
      },
      bad1: { from: 'hacker', item: 'ltd_crown', n: 2, amt: 5, t: 1 },
      bad2: { from: B, item: 'ltd_crown', n: 9, amt: 5, t: 1 },
      bad3: { from: B, item: 'ltd_crown', n: 1, amt: 0, t: 1 },
    });
    expect(list.map((o) => o.id)).toEqual(['a', 'b']); // dalla più vecchia
    const ledger = decodeLedger({ ltd_crown: { 2: { o: A, on: 'Anna', t: 1 } } });
    expect(offerStillValid(ledger, list[0], A)).toBe(true);
    // venduta a qualcun altro: le altre offerte non valgono più
    const sold = decodeLedger({ ltd_crown: { 2: { o: B, on: 'Luca', t: 2 } } });
    expect(offerStillValid(sold, list[0], A)).toBe(false);
  });

  it('l’offerta si annulla da sola se chi l’ha fatta non può più pagare', () => {
    const sent = decodeSent({
      a: { owner: A, item: 'ltd_crown', n: 2, amt: 900, t: 2 },
      b: { owner: A, item: 'ltd_statue', n: 1, amt: 300, t: 1 },
      bad: { owner: 'x', item: 'ltd_crown', n: 2, amt: 900, t: 3 },
      bad2: { owner: A, item: 'ltd_crown', n: 9, amt: 900, t: 3 },
    });
    expect(sent.map((s) => s.id)).toEqual(['b', 'a']);
    expect(unaffordable(sent, 1000)).toEqual([]);
    expect(unaffordable(sent, 500).map((s) => s.id)).toEqual(['a']);
    expect(unaffordable(sent, 100).map((s) => s.id)).toEqual(['b', 'a']);
    expect(withdrawnText('Luca', 'Corona #2/5')).toContain('L’offerta è stata ritirata');
  });

  it('vestiti, accessori e mobili: pochi, cari e con 5 copie', () => {
    const clothes = SHOP_CATALOG.filter((i) => 'limited' in i);
    expect(clothes.length).toBeGreaterThanOrEqual(3);
    expect(LIMITED_FURNITURE.length).toBeGreaterThanOrEqual(2);
    for (const it of [...clothes, ...LIMITED_FURNITURE]) {
      expect(it.id).toMatch(/^ltd_[a-z]+$/);
      expect((it as { limited: number }).limited).toBe(LIMITED_COPIES);
      expect(it.price).toBeGreaterThanOrEqual(1000);
    }
    // costano più di tutti gli altri capi
    const normalMax = Math.max(
      ...SHOP_CATALOG.filter((i) => !('limited' in i)).map((i) => i.price),
    );
    for (const it of clothes) expect(it.price).toBeGreaterThan(normalMax);
  });

  it('copie numerate: si prende il primo numero libero finché non finiscono', () => {
    const ledger = decodeLedger({
      ltd_crown: { 1: { o: A, on: 'Anna', t: 1 }, 3: { o: B, on: 'Luca', t: 2 } },
    });
    expect(copiesLeft(ledger, 'ltd_crown')).toBe(3);
    expect(nextFreeCopy(ledger, 'ltd_crown')).toBe(2);
    expect(copyOf(ledger, 'ltd_crown', B)).toBe(3);
    expect(copyOf(ledger, 'ltd_crown', 'player_x')).toBeNull();
    expect(itemsOf(ledger, A)).toEqual([{ item: 'ltd_crown', n: 1 }]);
    const full = decodeLedger({
      ltd_crown: Object.fromEntries([1, 2, 3, 4, 5].map((n) => [n, { o: A, on: 'A', t: 1 }])),
    });
    expect(copiesLeft(full, 'ltd_crown')).toBe(0);
    expect(nextFreeCopy(full, 'ltd_crown')).toBeNull();
  });

  it('il registro scarta i dati non validi', () => {
    const l = decodeLedger({
      ltd_crown: { 1: { o: 'hacker', t: 1 }, 6: { o: A, t: 1 }, 2: { o: A, on: 'Anna', t: 1 } },
      altro: { 1: { o: A } },
    });
    expect(Object.keys(l)).toEqual(['ltd_crown']);
    expect(Object.keys(l.ltd_crown)).toEqual(['2']);
  });

  it('offerte: servono i soldi e non si compra ciò che è già proprio', () => {
    expect(offerError(500, 1000, false, false)).toBeNull();
    expect(offerError(500, 100, false, false)).toContain('soldi');
    expect(offerError(0, 1000, false, false)).not.toBeNull();
    expect(offerError(2.5, 1000, false, false)).not.toBeNull();
    expect(offerError(500, 1000, true, false)).toContain('già una copia');
    expect(offerError(500, 1000, false, true)).toContain('già tuo');
  });

  it('scambio: il proprietario accetta, chi compra paga e prende la copia', () => {
    const entry = { o: A, on: 'Anna', t: 1 };
    expect(acceptSale(entry, B, B, 100, 5)).toBeNull(); // non è di Luca
    const sold = acceptSale(entry, A, B, 900, 1000)!;
    expect(sold).toEqual({ o: A, on: 'Anna', t: 1, sale: { to: B, p: 900, t: 1000 } });
    expect(claimSale(sold, 'player_x', 'X', 900, 1100)).toBeNull(); // non è per lui
    expect(claimSale(sold, B, 'Luca', 800, 1100)).toBeNull(); // prezzo diverso
    // nessuna scadenza: chi compra può pagare anche giorni dopo (era offline)
    expect(claimSale(sold, B, 'Luca', 900, 1000 + 7 * 86400000)).toEqual({
      o: B,
      on: 'Luca',
      t: 1000 + 7 * 86400000,
    });
    expect(claimSale(sold, B, 'Luca', 900, 1100)).toEqual({ o: B, on: 'Luca', t: 1100 });
  });

  it('il database: compra solo una copia libera, vende solo il proprietario, prende solo chi ha comprato', () => {
    const r = JSON.parse(fs.readFileSync('firebase/database.rules.proposed.json', 'utf8')).rules;
    const w: string = r.sims_limited.$item.$n['.write'];
    expect(w).toContain("!data.exists() && newData.child('o').val() ===");
    expect(w).toContain("data.child('sale/to').val() ===");
    expect(r.sims_limited.$item.$n['.validate']).toContain('/^[1-5]$/');
    expect(r.sims_interactions.$pid.$key['.validate']).toContain(
      '|ltdOffer|ltdAccept|ltdNo|ltdGone',
    );
    // la cassetta delle offerte: la legge solo il proprietario, scrive chi offre, cancella chi risponde
    const box = r.sims_ltd_offers.$owner;
    expect(box['.read']).toContain('=== $owner');
    expect(box.$id['.write']).toContain("!data.exists() && newData.child('from').val() ===");
    expect(box.$id['.write']).toContain('!newData.exists()');
    // le offerte inviate: le vede e le cambia solo chi le ha fatte
    expect(r.sims_ltd_sent.$buyer['.read']).toContain('=== $buyer');
    expect(r.sims_ltd_sent.$buyer['.write']).toContain('=== $buyer');
  });
});
