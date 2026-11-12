import { beforeEach, describe, expect, it, vi } from 'vitest';
import { advanceMarket, MARKET_EPOCH } from '../shared/market.js';

const mocks = vi.hoisted(() => ({
  update: vi.fn(),
  intervals: [] as (() => void)[],
  listeners: new Map<string, (value: { val(): unknown }) => void>(),
  session: { OFFLINE: false, serverOffset: 0 },
}));
vi.mock('../src/game/context.js', () => ({
  game: {
    session: {
      ...mocks.session,
      get OFFLINE() {
        return mocks.session.OFFLINE;
      },
      db: {
        ref: (path: string) => ({
          on: (_event: string, callback: (value: { val(): unknown }) => void) =>
            mocks.listeners.set(path, callback),
        }),
      },
    },
  },
}));
vi.mock('../src/game/market-event.js', () => ({ updateMarketEvent: mocks.update }));
vi.mock('../src/game/runtime.js', () => ({
  lifetime: { setInterval: (callback: () => void) => mocks.intervals.push(callback) },
}));
import { marketSnapshot, startMarket } from '../src/game/market-client.js';

beforeEach(() => {
  mocks.update.mockClear();
  mocks.intervals.length = 0;
  mocks.listeners.clear();
  mocks.session.OFFLINE = false;
});

describe('quotazioni inviate alla vista degli eventi', () => {
  it('passa lo snapshot ricevuto e quello corrente al controllo periodico online', () => {
    startMarket();
    const snapshot = advanceMarket(null, MARKET_EPOCH + 86400000, () => 0)!;
    mocks.listeners.get('sims_market')!({ val: () => snapshot });
    expect(mocks.update).toHaveBeenLastCalledWith(marketSnapshot());
    expect(marketSnapshot()?.updatedAt).toBe(snapshot.updatedAt);
    mocks.update.mockClear();
    mocks.intervals[0]();
    expect(mocks.update).toHaveBeenCalledWith(marketSnapshot());
    mocks.listeners.get('sims_market')!({ val: () => null });
    expect(mocks.update).toHaveBeenLastCalledWith(null);
  });

  it('passa anche lo snapshot della simulazione locale senza aprire listener online', () => {
    mocks.session.OFFLINE = true;
    startMarket();
    expect(marketSnapshot()).not.toBeNull();
    expect(mocks.update).toHaveBeenCalledWith(marketSnapshot());
    expect(mocks.listeners.size).toBe(0);
    mocks.update.mockClear();
    mocks.intervals[0]();
    expect(mocks.update).toHaveBeenCalledWith(marketSnapshot());
  });
});
