import { describe, expect, it, vi } from 'vitest';

const NOW = Date.UTC(2026, 10, 14, 12);
const mocks = vi.hoisted(() => ({
  game: {
    session: { myPlayerId: 'me', serverOffset: 0 },
    onlinePlayers: {} as Record<string, unknown>,
  },
}));
vi.mock('../src/game/context.js', () => ({ game: mocks.game }));
vi.mock('../src/game/cryo.js', () => ({ myCryo: () => null }));
import { cryoSleepers, inCryo, shownPresence } from '../src/game/autoplay.js';
import { CRYO_PODS } from '../src/game/data/catalogues.js';

const away = (d: Record<string, unknown>) => ({
  env: 'CORTILE',
  x: 0,
  y: 0,
  t: NOW - 3_600_000,
  offline: true,
  offAt: NOW - 3_600_000,
  ...d,
});

describe('vicini in criogenesi', () => {
  it('in criogenesi: offline con la capsula pagata, non chi gioca né chi è scaduto', () => {
    expect(inCryo(away({ frz: NOW + 1000 }), false, NOW)).toBe(true);
    expect(inCryo(away({ frz: NOW - 1000 }), false, NOW)).toBe(false);
    expect(inCryo(away({}), false, NOW)).toBe(false);
    expect(inCryo({ ...away({ frz: NOW + 1000 }), offline: false }, true, NOW)).toBe(false);
    // pass nuovo: in capsula solo da quando stava per morire (rsc); prima vive da solo
    expect(inCryo(away({ frz: NOW + 1000, rsc: NOW + 500 }), false, NOW)).toBe(false);
    expect(inCryo(away({ frz: NOW + 1000, rsc: NOW - 500 }), false, NOW)).toBe(true);
  });

  it('dorme nella sua capsula anche se era uscito dormendo; gli altri non si spostano', () => {
    vi.setSystemTime(NOW);
    mocks.game.onlinePlayers = {
      me: away({ frz: NOW + 1000 }),
      a: away({ name: 'A', frz: NOW + 1000, offAt: NOW - 5000 }),
      b: away({ name: 'B', frz: NOW + 1000, offAt: NOW - 9000, act: 'sleep' }),
      c: away({ name: 'C' }),
    };
    const list = cryoSleepers();
    // io no (sto giocando), C no (niente capsula); chi è entrato prima ha la prima capsula
    expect(list.map((s) => s.id)).toEqual(['b', 'a']);
    const b = shownPresence('b', mocks.game.onlinePlayers.b, false, NOW).op;
    expect(b).toMatchObject({
      env: 'criogenesi',
      act: 'cryo',
      x: CRYO_PODS[0].x,
      y: CRYO_PODS[0].y,
    });
    vi.useRealTimers();
  });
});
