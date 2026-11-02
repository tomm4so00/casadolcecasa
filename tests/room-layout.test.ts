import { describe, expect, it } from 'vitest';
import { FURNITURE_CATALOG, PLAYER_ROOM_FURNITURE } from '../src/game/data/catalogues.js';
import {
  SAFE_CORRIDOR,
  SAFE_SPOT,
  SAFE_WALL_HALF,
  avoidWallSafe,
  overlapsCorridor,
  pushOutOfCorridor,
} from '../src/game/room-layout.js';

const inside = (x: number, y: number) =>
  SAFE_CORRIDOR.some((r) => x >= r.minX && x <= r.maxX && y >= r.minY && y <= r.maxY);

describe('cassaforte a muro e passaggio libero', () => {
  it("il passaggio collega senza interruzioni l'ingresso alla cassaforte", () => {
    const door = PLAYER_ROOM_FURNITURE.doorExit;
    expect(PLAYER_ROOM_FURNITURE.safe).toMatchObject({ ...SAFE_SPOT, wallItem: true });
    // cammino a passi piccoli: dal tappetino verso sinistra, poi su, poi fino alla parete
    const lane = SAFE_CORRIDOR[1];
    const laneX = (lane.minX + lane.maxX) / 2;
    for (let x = door.x; x >= laneX; x -= 2) expect(inside(x, 150), `x=${x}`).toBe(true);
    for (let y = 150; y >= SAFE_SPOT.y; y -= 2) expect(inside(laneX, y), `y=${y}`).toBe(true);
    for (let x = laneX; x >= -165; x -= 2) expect(inside(x, SAFE_SPOT.y), `x=${x}`).toBe(true);
    // arrivati vicino alla parete la cassaforte è a portata di mano
    expect(Math.hypot(-165 - SAFE_SPOT.x, 0)).toBeLessThan(65);
    // il passaggio resta sul lato sinistro della stanza
    for (const r of SAFE_CORRIDOR) expect(r.minX).toBeLessThan(0);
    expect(Math.max(...SAFE_CORRIDOR.slice(1).map((r) => r.maxX))).toBeLessThanOrEqual(-60);
  });

  it('un mobile appoggiato nel passaggio viene spinto fuori, restando nella stanza', () => {
    for (const fp of [
      { x: -60, y: 140, w: 80, h: 40 },
      { x: -70, y: -60, w: 80, h: 110 },
      { x: 20, y: 160, w: 30, h: 30 },
    ]) {
      expect(overlapsCorridor(fp)).toBe(true);
      const out = pushOutOfCorridor(fp);
      expect(overlapsCorridor({ ...fp, ...out })).toBe(false);
      expect(Math.abs(out.x) + fp.w / 2).toBeLessThanOrEqual(196);
      expect(Math.abs(out.y) + fp.h / 2).toBeLessThanOrEqual(176);
    }
  });

  it('nessun mobile di partenza blocca il passaggio', () => {
    const items = [
      ...Object.entries(PLAYER_ROOM_FURNITURE)
        .filter(([key, item]) => key !== 'doorExit' && !('wallItem' in item && item.wallItem))
        .map(([, item]) => item),
      ...FURNITURE_CATALOG.map((f) => f.propData),
    ];
    for (const item of items) expect(overlapsCorridor(item), item.name).toBe(false);
  });

  it('i quadri sulla parete di sinistra non coprono la cassaforte', () => {
    const y = avoidWallSafe(SAFE_SPOT.y + 5, 64, -142, 142);
    expect(Math.abs(y - SAFE_SPOT.y)).toBeGreaterThanOrEqual(SAFE_WALL_HALF + 32);
    expect(avoidWallSafe(-100, 64, -142, 142)).toBe(-100);
  });
});
