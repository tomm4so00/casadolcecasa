import { describe, it, expect } from 'vitest';
import { npcPath, clearSegment, type Point } from '../src/game/npc-path';

const bounds = { x0: -200, x1: 200, y0: -180, y1: 180 };
describe('percorsi dei personaggi', () => {
  it('aggira un mobile che interrompe il percorso diretto senza tagliarne gli angoli', () => {
    const start = { x: -120, y: 0 },
      goal = { x: 120, y: 0 };
    const obstacles = [{ x: 0, y: 0, w: 80, h: 100 }];
    const route = npcPath(start, goal, obstacles, bounds);
    expect(route.length).toBeGreaterThan(1);
    expect(route.at(-1)).toEqual(goal);
    let last: Point = start;
    for (const next of route) {
      expect(clearSegment(last, next, obstacles)).toBe(true);
      last = next;
    }
    expect(route.some((p) => Math.abs(p.y) >= 60)).toBe(true);
  });
  it('si ferma se il passaggio è completamente chiuso', () => {
    expect(
      npcPath({ x: -120, y: 0 }, { x: 120, y: 0 }, [{ x: 0, y: 0, w: 30, h: 400 }], bounds),
    ).toEqual([]);
  });
  it('usa il percorso diretto solo quando è libero', () => {
    expect(npcPath({ x: 0, y: 0 }, { x: 100, y: 50 }, [], bounds)).toEqual([{ x: 100, y: 50 }]);
    expect(clearSegment({ x: -30, y: 0 }, { x: 30, y: 0 }, [{ x: 0, y: 0, w: 2, h: 30 }])).toBe(
      false,
    );
  });
});
