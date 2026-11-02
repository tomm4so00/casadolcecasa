import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import {
  BOT_DELAY_MAX_MS,
  BOT_DELAY_MIN_MS,
  botOfferAmount,
  botTier,
  isValidPrice,
  listingSeed,
  marketItems,
  newListing,
  nextOfferTime,
} from '../src/game/art-market-rules.js';
import { blankPainting, encodePainting } from '../src/game/painting-rules.js';

describe('mercato dei quadri', () => {
  it('le offerte dei collezionisti crescono con i quadri venduti', () => {
    expect(botTier(0)).toMatchObject({ min: 10, max: 50 });
    expect(botTier(2)).toMatchObject({ min: 10, max: 50 });
    expect(botTier(3)).toMatchObject({ min: 30, max: 90 });
    expect(botTier(7)).toMatchObject({ min: 70, max: 150 });
    expect(botTier(15)).toMatchObject({ min: 150, max: 300 });
    expect(botTier(99)).toMatchObject({ min: 150, max: 300 });
    for (let i = 0; i < 50; i++) {
      const amount = botOfferAmount(7, 'seed' + i, 0);
      expect(amount).toBeGreaterThanOrEqual(70);
      expect(amount).toBeLessThanOrEqual(150);
    }
  });

  it("l'offerta arriva fra qualche ora e qualche giorno, sempre uguale per lo stesso annuncio", () => {
    const t = Date.UTC(2026, 10, 2);
    for (let i = 0; i < 50; i++) {
      const at = nextOfferTime(t, 'seed' + i, 0);
      expect(at - t).toBeGreaterThanOrEqual(BOT_DELAY_MIN_MS);
      expect(at - t).toBeLessThanOrEqual(BOT_DELAY_MAX_MS);
    }
    const seed = listingSeed(3, 'p2', t);
    expect(nextOfferTime(t, seed, 0)).toBe(nextOfferTime(t, seed, 0));
    expect(botOfferAmount(0, seed, 0)).toBe(botOfferAmount(0, seed, 0));
    // dopo un rifiuto l'offerta successiva è diversa
    expect(nextOfferTime(t, seed, 1)).not.toBe(nextOfferTime(t, seed, 0));
  });

  it('elenca solo gli annunci validi con il quadro ancora appeso', () => {
    const code = encodePainting(blankPainting());
    const t = Date.UTC(2026, 10, 2);
    const rooms = [
      {
        ownerId: 'player_a',
        owner: 'Anna',
        paintings: { p1: code, p2: code },
        sale: { p1: newListing(40, t, 'x'), p3: newListing(10, t, 'y') },
      },
      {
        ownerId: 'player_b',
        owner: 'Bea',
        paintings: { p1: code },
        sale: { p1: { price: -5, t, nextOfferAt: t } },
      },
      {},
    ];
    const items = marketItems(rooms);
    expect(items.map((i) => [i.owner, i.slot, i.listing.price])).toEqual([['Anna', 'p1', 40]]);
    expect(isValidPrice(40)).toBe(true);
    expect(isValidPrice(0)).toBe(false);
    expect(isValidPrice(12.5)).toBe(false);
  });

  it('le regole permettono di togliere un quadro altrui solo comprandolo', () => {
    const rules = JSON.parse(
      fs.readFileSync('firebase/database.rules.proposed.json', 'utf8'),
    ).rules;
    const room = rules.sims_rooms_state.$room;
    expect(room.sale.$slot['.validate']).toContain("newData.child('price').val() <= 100000");
    for (const p of ['p1', 'p2', 'p3'])
      expect(room['.validate']).toContain(
        `newData.child('vaultMoney').val() >= data.child('vaultMoney').val() + data.child('sale/${p}/price').val()`,
      );
    expect(rules.sims_interactions.$pid.$key['.validate']).toContain('artSold');
  });
});
