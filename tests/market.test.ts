import { describe, it, expect } from 'vitest';
import {
  advanceMarket,
  decodeMarket,
  marketPriceAt,
  MARKET_EPOCH,
  MARKET_PUBLISH_INTERVAL_MS,
  BUSINESSES,
  MAX_FLOW_IMPACT,
  flowImpact,
  holdingsFromRooms,
  MARKET_EVENT_MS,
  MARKET_EVENT_COOLDOWN_MS,
  eventAt,
  rollMarketEvent,
} from '../shared/market.js';

describe('server market updates', () => {
  it('commits at most once per 15-minute slot even if the scheduler retries or goes backwards', () => {
    const now = MARKET_EPOCH + 3 * 86400000;
    const first = advanceMarket(null, now, () => 0)!;
    const next = advanceMarket(first, now + MARKET_PUBLISH_INTERVAL_MS, () => 1)!;
    expect(next.minute).toBe(first.minute + 15);
    expect(advanceMarket(next, now + MARKET_PUBLISH_INTERVAL_MS + 1000, () => 999)).toBeNull();
    expect(advanceMarket(next, now - 60000, () => 999)).toBeNull();
    expect(first.quotes.shop.price).not.toBe(next.quotes.shop.price);
  });
  it('publishes the same fixed quote to clients with different device clocks', () => {
    const market = advanceMarket(null, MARKET_EPOCH + 86400000, () => 0)!;
    const other = decodeMarket(JSON.parse(JSON.stringify(market)))!;
    for (const business of BUSINESSES) {
      expect(marketPriceAt(market, business.id, market.updatedAt)).toBe(
        other.quotes[business.id].price,
      );
      expect(marketPriceAt(other, business.id, market.updatedAt + 36000000)).toBe(
        market.quotes[business.id].price,
      );
    }
  });
  it('bounds history and handles missed updates without replaying every elapsed minute', () => {
    let market = advanceMarket(null, MARKET_EPOCH + 86400000, () => 0)!;
    for (let minute = 1; minute <= 1500; minute++)
      market = advanceMarket(market, market.updatedAt + MARKET_PUBLISH_INTERVAL_MS, () => 0.5)!;
    market = advanceMarket(market, market.updatedAt + 30 * 86400000, () => -1)!;
    expect(decodeMarket(market)).not.toBeNull();
    for (const quote of Object.values(market.quotes)) {
      expect(Object.keys(quote.history).length).toBeLessThanOrEqual(97);
      expect(Number.isFinite(quote.price) && quote.price > 0).toBe(true);
    }
  }, 20000); // simula 1.500 aggiornamenti di tutte le attività
  it('rejects corrupted state rather than resetting everybody’s market', () => {
    expect(decodeMarket({ version: 1, minute: 1, quotes: {} })).toBeNull();
    expect(() => advanceMarket({ broken: true }, MARKET_EPOCH, () => 0)).toThrow();
  });
});

describe('crollo / boom della borsa', () => {
  it('per un’ora tutte le quotazioni salgono o scendono del 20%, uguale per tutti', () => {
    const start = advanceMarket(null, MARKET_EPOCH + 86400000, () => 0)!;
    const base = start.quotes.app.price;
    // il server tira un numero basso: parte un crollo
    const crash = advanceMarket(start, start.updatedAt + MARKET_PUBLISH_INTERVAL_MS, () => 0, {
      roll: 0,
      kind: 0.1,
    })!;
    expect(crash.event).toEqual({
      kind: 'crash',
      start: crash.updatedAt,
      end: crash.updatedAt + MARKET_EVENT_MS,
    });
    const copy = decodeMarket(JSON.parse(JSON.stringify(crash)))!;
    expect(marketPriceAt(copy, 'app', copy.updatedAt)).toBeCloseTo(crash.quotes.app.price * 0.8);
    // il prezzo di prima dell’evento non cambia
    expect(marketPriceAt(copy, 'app', start.updatedAt)).toBeCloseTo(base);
    // dopo un’ora l’effetto finisce
    let m = crash;
    for (let i = 0; i < 4; i++)
      m = advanceMarket(m, m.updatedAt + MARKET_PUBLISH_INTERVAL_MS, () => 0, {
        roll: 0,
        kind: 0.9,
      })!;
    expect(eventAt(m, m.updatedAt)).toBeNull();
    expect(marketPriceAt(m, 'app', m.updatedAt)).toBe(m.quotes.app.price);
    // pausa: anche con un numero basso non riparte subito
    expect(m.event!.start).toBe(crash.updatedAt);
  });

  it('un boom fa salire del 20% e l’evento non parte con un numero alto', () => {
    const s = advanceMarket(null, MARKET_EPOCH + 86400000, () => 0)!;
    const none = advanceMarket(s, s.updatedAt + MARKET_PUBLISH_INTERVAL_MS, () => 0, {
      roll: 0.9,
      kind: 0.9,
    })!;
    expect(none.event).toBeUndefined();
    expect(rollMarketEvent(null, 1000, 0, 0.9)?.kind).toBe('boom');
    const boom = { ...none, event: rollMarketEvent(null, none.minute, 0, 0.9)! };
    expect(marketPriceAt(boom, 'shop', boom.updatedAt)).toBeCloseTo(none.quotes.shop.price * 1.2);
    // dopo 12 ore dalla fine può ripartire
    const later = (boom.event.end + MARKET_EVENT_COOLDOWN_MS) / 60000;
    expect(rollMarketEvent(boom.event, later - 15, 0, 0)).toBeNull();
    expect(rollMarketEvent(boom.event, later, 0, 0)).not.toBeNull();
  });
});

describe('domanda e offerta e nuove attività', () => {
  it('le attività nuove nascono al primo aggiornamento senza toccare le vecchie', () => {
    const full = advanceMarket(null, MARKET_EPOCH + 86400000, () => 0)!;
    // un mercato salvato prima che esistessero le attività nuove
    const old = structuredClone(full) as typeof full;
    for (const id of Object.keys(old.quotes))
      if (!['shop', 'app', 'crypto'].includes(id))
        delete (old.quotes as Record<string, unknown>)[id];
    const decoded = decodeMarket(JSON.parse(JSON.stringify(old)));
    expect(decoded).not.toBeNull();
    expect(marketPriceAt(decoded!, 'space' as never, decoded!.updatedAt)).toBe(0);
    const next = advanceMarket(decoded, decoded!.updatedAt + MARKET_PUBLISH_INTERVAL_MS, () => 0)!;
    expect(Object.keys(next.quotes).sort()).toEqual(BUSINESSES.map((b) => b.id).sort());
    expect(next.quotes.space.price).toBeGreaterThan(0);
    expect(next.quotes.shop.log).toBe(full.quotes.shop.log * (1 - BUSINESSES[0].theta) ** 15);
  });

  it('se i giocatori comprano il prezzo sale, se vendono scende (al massimo del 2%)', () => {
    expect(flowImpact(400, 40000)).toBeCloseTo(1.01);
    expect(flowImpact(1e9, 40000)).toBeCloseTo(1 + MAX_FLOW_IMPACT);
    expect(flowImpact(-1e9, 40000)).toBeCloseTo(1 - MAX_FLOW_IMPACT);
    const start = advanceMarket(null, MARKET_EPOCH + 86400000, () => 0)!;
    const t = start.updatedAt + MARKET_PUBLISH_INTERVAL_MS;
    const none = holdingsFromRooms({});
    const base = advanceMarket(start, t, () => 0, undefined, none)!;
    // un quarto d'ora dopo: un giocatore ha comprato quote di "app" per circa 2.000 €
    const units = 2000 / base.quotes.app.price;
    const rooms = { 0: { economy: { invest: { app: { units, cost: 2000 } } } } };
    const t2 = t + MARKET_PUBLISH_INTERVAL_MS;
    const quiet = advanceMarket(base, t2, () => 0, undefined, none)!;
    const bought = advanceMarket(base, t2, () => 0, undefined, holdingsFromRooms(rooms))!;
    expect(bought.quotes.app.flow).toBe(2000);
    expect(bought.quotes.app.holders).toBe(1);
    expect(bought.quotes.app.price / quiet.quotes.app.price).toBeCloseTo(1.02, 3); // 2000/20000 → max 2%
    expect(bought.quotes.shop.price).toBe(quiet.quotes.shop.price);
    // poi vende tutto: il prezzo scende
    const sold = advanceMarket(bought, t2 + MARKET_PUBLISH_INTERVAL_MS, () => 0, undefined, none)!;
    expect(sold.quotes.app.flow).toBeLessThan(0);
  });
});
