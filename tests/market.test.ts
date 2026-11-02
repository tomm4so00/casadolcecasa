import { describe, it, expect } from 'vitest';
import {
  advanceMarket,
  decodeMarket,
  marketPriceAt,
  MARKET_EPOCH,
  MARKET_PUBLISH_INTERVAL_MS,
  BUSINESSES,
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
  });
  it('rejects corrupted state rather than resetting everybody’s market', () => {
    expect(decodeMarket({ version: 1, minute: 1, quotes: {} })).toBeNull();
    expect(() => advanceMarket({ broken: true }, MARKET_EPOCH, () => 0)).toThrow();
  });
});
