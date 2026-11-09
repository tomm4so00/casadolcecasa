import { describe, expect, it } from 'vitest';
import {
  MAX_BAG_PRICE,
  NORMAL_BAG_PRICE,
  bagPrice,
  decodeWeedMarket,
  decodeWeedTrades,
  tradeReference,
  type WeedTrade,
} from '../src/game/weed-market-rules';
import { bagFloorPrice } from '../src/game/weed-rules';
import { activeRaid, raidOfDay } from '../src/game/dealer-rules';
import { announceRaids, pushKey, updateWeedMarket } from '../server/src/street';
import { localDatabase } from '../src/game/database.js';
import { Lifetime } from '../src/game/lifetime.js';
import { MemoryStorage } from './helpers.js';

const H = 3_600_000;
const D = 24 * H;
const NOW = 1_800_000_000_000;
const sale = (seller: string, buyer: string, g: number, price: number, t = NOW - H): WeedTrade => ({
  seller,
  buyer,
  g,
  price,
  t,
});

describe("prezzo dell'erba", () => {
  it('senza dati di mercato una bustina costa il prezzo normale', () => {
    expect(bagPrice(null)).toBe(NORMAL_BAG_PRICE);
  });

  it('la domanda lo alza, i raccolti lo abbassano, dentro minimo e massimo', () => {
    expect(bagPrice({ ref: 25, push: 0.3, t: NOW })).toBeGreaterThan(50);
    expect(bagPrice({ ref: 25, push: -0.3, t: NOW })).toBe(bagFloorPrice());
    expect(bagPrice({ ref: 60, push: 0.3, t: NOW })).toBe(MAX_BAG_PRICE);
    expect(bagPrice({ ref: 25, push: 0.1, t: NOW })).toBe(Math.round(25 * Math.exp(0.3)));
  });

  it('il riferimento è la mediana degli scambi, con almeno 3 venditori', () => {
    // 2 venditori: troppo pochi
    expect(tradeReference([sale('a', 'x', 10, 30), sale('b', 'y', 10, 40)], NOW)).toBeNull();
    const trades = [sale('a', 'x', 10, 30), sale('b', 'y', 20, 80), sale('c', 'z', 5, 10)];
    // per bustina: 30, 40, 20 → mediana 30
    expect(tradeReference(trades, NOW)).toBe(30);
  });

  it('regali, scambi vecchi e coppie ripetute non contano; i prezzi assurdi sono limitati', () => {
    const trades = [
      sale('a', 'x', 10, 30),
      sale('a', 'x', 10, 1_000_000, NOW - 30 * 60_000), // stessa coppia, stesso giorno
      sale('b', 'y', 10, 0), // regalo
      sale('b', 'y', 1, 100_000, NOW - 2 * H), // assurdo: conta come il massimo
      sale('c', 'z', 10, 20),
      sale('d', 'w', 10, 99, NOW - 2 * D), // vecchio
    ];
    // a 30, b 60, c 20 → mediana 30
    expect(tradeReference(trades, NOW)).toBe(30);
  });

  it('legge mercato e scambi dal database scartando quelli non validi', () => {
    expect(decodeWeedMarket({ ref: 500, push: 3, t: NOW })).toEqual({
      ref: MAX_BAG_PRICE,
      push: 1,
      t: NOW,
    });
    expect(decodeWeedMarket({ ref: 'x' })).toBeNull();
    expect(
      decodeWeedTrades({ 20833: { o1: sale('a', 'b', 10, 30), o2: { g: 1.5, price: 3 } } }),
    ).toEqual([sale('a', 'b', 10, 30)]);
  });
});

describe('server: strada', () => {
  it('le chiavi dei pettegolezzi seguono il tempo', () => {
    expect(pushKey(NOW, () => 0) < pushKey(NOW + 1, () => 0)).toBe(true);
    expect(pushKey(NOW)).toHaveLength(20);
  });

  it('annuncia inizio e fine di una retata una volta sola', async () => {
    const db = localDatabase(new Lifetime(), new MemoryStorage());
    let raid = null;
    for (let d = 20_000; !raid; d++) raid = raidOfDay('CASA-0001', d);
    expect(activeRaid('CASA-0001', raid.start)).toEqual(raid);
    const gossip = async () =>
      Object.values((await db.ref('sims_gossip').get()).val() || {}) as { text: string }[];
    await announceRaids(db, raid.start + H, 'CASA-0001');
    await announceRaids(db, raid.start + 2 * H, 'CASA-0001');
    expect((await gossip()).map((g) => g.text)).toEqual([expect.stringMatching(/Retata/)]);
    await announceRaids(db, raid.end + H, 'CASA-0001');
    await announceRaids(db, raid.end + 2 * H, 'CASA-0001');
    const texts = (await gossip()).map((g) => g.text);
    expect(texts).toHaveLength(2);
    expect(texts[1]).toMatch(/se n'è andata/);
  });

  it('pubblica il prezzo dell’erba e cancella gli scambi vecchi', async () => {
    const db = localDatabase(new Lifetime(), new MemoryStorage());
    const today = Math.floor(NOW / D);
    await db.ref(`sims_weed_trades/${today}`).set({
      o1: sale('a', 'x', 10, 40),
      o2: sale('b', 'y', 10, 40),
      o3: sale('c', 'z', 10, 40),
    });
    await db.ref(`sims_weed_trades/${today - 3}`).set({ o4: sale('d', 'w', 10, 10, NOW - 3 * D) });
    const market = await updateWeedMarket(db, NOW, {});
    expect(market).toEqual({ ref: 40, push: 0, t: NOW });
    expect((await db.ref('sims_weed_market').get()).val()).toEqual(market);
    expect((await db.ref(`sims_weed_trades/${today - 3}`).get()).exists()).toBe(false);
    // senza scambi recenti resta l'ultimo riferimento
    await db.ref(`sims_weed_trades/${today}`).remove();
    expect((await updateWeedMarket(db, NOW + H, {})).ref).toBe(40);
  });
});
