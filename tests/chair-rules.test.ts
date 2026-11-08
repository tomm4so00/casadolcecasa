import { describe, expect, it } from 'vitest';
import {
  chairFace,
  chairFront,
  chairPose,
  chairsOf,
  deskChair,
  deskChairFront,
  hasTable,
  pathToChair,
  pathToDeskChair,
  segmentHitsRect,
} from '../src/game/chair-rules';

const bar = { kind: 'roundTable', x: -100, y: 40, w: 36, h: 36 };

describe('sedie dei tavolini', () => {
  it('ogni tavolo ha una sedia dietro e una a sinistra, tutte e due dietro il tavolo', () => {
    const [back, side] = chairsOf(bar);
    expect(back).toEqual({ x: -100, y: 16, back: 'y0' });
    expect(side).toEqual({ x: -124, y: 40, back: 'x0' });
    // dietro il tavolo in profondità (x + y più piccolo): chi siede si vede di fronte
    for (const c of [back, side]) expect(c.x + c.y).toBeLessThan(bar.x + bar.y);
  });

  it('seduti si guarda il tavolo', () => {
    const [back, side] = chairsOf(bar);
    for (const c of [back, side]) {
      const f = chairFace(c);
      // il centro del tavolo sta nella direzione dello sguardo
      expect(f.x * (bar.x - c.x) + f.y * (bar.y - c.y)).toBeGreaterThan(0);
    }
    expect(chairPose(back)).toBe('chair');
    expect(chairPose(side)).toBe('chairSide');
  });

  it("le sedie d'attesa sono tre in fila, libere davanti", () => {
    const row = { kind: 'waitingChairs', x: 0, y: 0, w: 80, h: 20 };
    const c = chairsOf(row);
    expect(c.map((s) => s.x)).toEqual([-26, 0, 26]);
    expect(hasTable(row)).toBe(false);
    expect(chairFront(c[1], false)).toEqual({ x: 0, y: 22 });
  });

  it('gli altri oggetti non hanno sedie', () => {
    expect(chairsOf({ kind: 'bench', x: 0, y: 0, w: 50, h: 16 })).toEqual([]);
  });

  it('ci si avvicina dal lato libero, lontano dal tavolo e dall’altra sedia', () => {
    const [back, side] = chairsOf(bar);
    for (const c of [back, side]) {
      const f = chairFront(c, true);
      expect(Math.hypot(f.x - bar.x, f.y - bar.y)).toBeGreaterThan(
        Math.hypot(c.x - bar.x, c.y - bar.y),
      );
      const other = c === back ? side : back;
      expect(Math.hypot(f.x - other.x, f.y - other.y)).toBeGreaterThan(20);
    }
  });

  it('per arrivare alla sedia si gira attorno al tavolo invece di attraversarlo', () => {
    const [back] = chairsOf(bar);
    const front = chairFront(back, true);
    // da davanti a sinistra: il tavolo è in mezzo
    const path = pathToChair({ x: -160, y: 90 }, front, bar);
    expect(path.length).toBeGreaterThan(2);
    const table = { x0: bar.x - 18, x1: bar.x + 18, y0: bar.y - 18, y1: bar.y + 18 };
    for (let i = 1; i < path.length; i++)
      expect(segmentHitsRect(path[i - 1], path[i], table)).toBe(false);
    // da vicino e dal lato giusto si va dritti
    expect(pathToChair({ x: -60, y: 16 }, front, bar)).toHaveLength(2);
  });

  it('segmenti e rettangoli', () => {
    const r = { x0: 0, x1: 10, y0: 0, y1: 10 };
    expect(segmentHitsRect({ x: -5, y: 5 }, { x: 15, y: 5 }, r)).toBe(true);
    expect(segmentHitsRect({ x: -5, y: -5 }, { x: 15, y: -5 }, r)).toBe(false);
    expect(segmentHitsRect({ x: 5, y: 5 }, { x: 6, y: 6 }, r)).toBe(true);
  });
});

describe('sedia della scrivania del PC', () => {
  // la scrivania della stanza: 80×70, il monitor guarda verso +y
  const desk = { kind: 'desk', x: 120, y: 40, w: 80, h: 70 };

  it('sta davanti al monitor e gira con la scrivania', () => {
    expect(deskChair(desk)).toEqual({ x: 120, y: 84, back: 'y1' });
    expect(deskChair({ ...desk, rot: 1 })).toEqual({ x: 169, y: 40, back: 'x1' });
    expect(deskChair({ ...desk, rot: 2 })).toEqual({ x: 120, y: -4, back: 'y0' });
    expect(deskChair({ ...desk, rot: 3 })).toEqual({ x: 71, y: 40, back: 'x0' });
  });

  it('da seduti si guarda il monitor: di spalle se la scrivania guarda verso chi osserva', () => {
    const faces = [0, 1, 2, 3].map((rot) => {
      const c = deskChair({ ...desk, rot });
      return [chairPose(c), chairFace(c)];
    });
    expect(faces).toEqual([
      ['chairAway', { x: 0, y: -1 }],
      ['chairAwaySide', { x: -1, y: 0 }],
      ['chair', { x: 0, y: 1 }],
      ['chairSide', { x: 1, y: 0 }],
    ]);
    // lo sguardo va sempre verso la scrivania
    for (const rot of [0, 1, 2, 3]) {
      const c = deskChair({ ...desk, rot });
      const f = chairFace(c);
      expect(Math.sign(desk.x - c.x) || 0).toBe(f.x);
      expect(Math.sign(desk.y - c.y) || 0).toBe(f.y);
    }
  });

  it('per arrivare alla sedia da dietro si gira attorno alla scrivania', () => {
    const c = deskChair(desk);
    const front = deskChairFront(c);
    const from = { x: 120, y: -40 }; // dietro la scrivania
    const path = pathToDeskChair(from, front, desk);
    expect(path.length).toBeGreaterThan(2);
    const block = { x0: 80, x1: 160, y0: 5, y1: 75 };
    for (let i = 1; i < path.length; i++)
      expect(segmentHitsRect(path[i - 1], path[i], block)).toBe(false);
    // dal davanti si va dritti
    expect(pathToDeskChair({ x: 170, y: 150 }, front, desk)).toEqual([{ x: 170, y: 150 }, front]);
  });
});
