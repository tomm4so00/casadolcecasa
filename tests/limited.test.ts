import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import { LIMITED_FURNITURE, SHOP_CATALOG } from '../src/game/data/catalogues';
import {
  LIMITED_COPIES,
  SALE_TTL_MS,
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
    expect(claimSale(sold, B, 'Luca', 900, 1000 + SALE_TTL_MS + 1)).toBeNull(); // scaduta
    expect(claimSale(sold, B, 'Luca', 900, 1100)).toEqual({ o: B, on: 'Luca', t: 1100 });
  });

  it('il database: compra solo una copia libera, vende solo il proprietario, prende solo chi ha comprato', () => {
    const r = JSON.parse(fs.readFileSync('firebase/database.rules.proposed.json', 'utf8')).rules;
    const w: string = r.sims_limited.$item.$n['.write'];
    expect(w).toContain("!data.exists() && newData.child('o').val() ===");
    expect(w).toContain("data.child('sale/to').val() ===");
    expect(r.sims_limited.$item.$n['.validate']).toContain('/^[1-5]$/');
    expect(r.sims_interactions.$pid.$key['.validate']).toContain('|ltdOffer|ltdAccept|ltdNo');
  });
});
