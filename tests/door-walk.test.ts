import { describe, expect, it } from 'vitest';
import {
  clampToRoom,
  crossedDoor,
  doorwayAt,
  gapFor,
  WALL_MARGIN,
} from '../src/game/door-walk-rules';

const B = { x0: -200, x1: 200, y0: -200, y1: 200 };
// porta sul muro di sinistra a y = 0, larga 50; portone sul muro di fondo a x = 0, largo 64
const left = gapFor('room1', 'x', -1, 0, 50);
const back = gapFor('courtyard', 'y', -1, 0, 64);

describe('porte da attraversare camminando', () => {
  it('lontano dalle porte il bordo resta a WALL_MARGIN dal muro', () => {
    expect(clampToRoom(-260, 120, B, [left, back])).toEqual({ x: -200 + WALL_MARGIN, y: 120 });
    expect(clampToRoom(80, -260, B, [left, back])).toEqual({ x: 80, y: -200 + WALL_MARGIN });
  });

  it('davanti alla porta si entra nel varco fino a poco oltre il filo', () => {
    const p = clampToRoom(-260, 3, B, [left]);
    expect(p.x).toBe(-196);
    expect(p.y).toBe(3);
  });

  it('accanto al varco si viene spinti verso il centro della porta', () => {
    const p = clampToRoom(-185, 18, B, [left]);
    expect(p.y).toBe(left.half);
    expect(p.x).toBe(-185);
  });

  it('si passa la porta solo arrivando al suo filo', () => {
    expect(crossedDoor(-180, 0, B, [left])).toBeNull();
    expect(crossedDoor(-192, 0, B, [left])?.key).toBe('room1');
    expect(crossedDoor(0, -193, B, [back])?.key).toBe('courtyard');
    // fuori dalla larghezza della porta no
    expect(crossedDoor(-192, 40, B, [left])).toBeNull();
  });

  it('si sa in quale vano si sta', () => {
    expect(doorwayAt(-180, 0, B, [left])?.key).toBe('room1');
    expect(doorwayAt(-160, 0, B, [left])).toBeNull();
  });

  it('una porta chiusa (senza varco) è un muro', () => {
    expect(clampToRoom(-260, 0, B, [])).toEqual({ x: -170, y: 0 });
  });
});
