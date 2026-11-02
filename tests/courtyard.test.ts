import { describe, expect, it } from 'vitest';
import { ENV_DECOR, ENV_STYLE } from '../src/game/data/catalogues';

// Cortile: x -480..480, y -220..220; i vialetti sono in unità del pavimento (u = x + 480, v = y + 220)
const paths = ENV_STYLE.CORTILE.paths as {
  u: number;
  v: number;
  w?: number;
  h?: number;
  r?: number;
}[];
const BORDER = 2; // il bordo scuro dei vialetti

/** true se un oggetto largo `size` attorno a (x, y) tocca un vialetto. */
function onPath(x: number, y: number, size: number): boolean {
  const u = x + 480,
    v = y + 220,
    half = size / 2 + BORDER;
  return paths.some((p) =>
    p.r
      ? Math.hypot(u - p.u, v - p.v) < p.r + half
      : u > p.u - half && u < p.u + p.w! + half && v > p.v - half && v < p.v + p.h! + half,
  );
}

describe('cortile', () => {
  it("i lampioni stanno sull'erba, non sui vialetti", () => {
    const lamps = ENV_DECOR.CORTILE.filter((d) => d.kind === 'streetlamp');
    expect(lamps.length).toBeGreaterThan(0);
    for (const l of lamps) expect(onPath(l.x, l.y, l.w), `lampione in ${l.x},${l.y}`).toBe(false);
  });
});
