import { describe, expect, it } from 'vitest';
import { drawsBefore, sortIsoParts, type IsoPart } from '../src/game/render/iso-sort.js';

const part = (
  name: string,
  [minX, maxX]: [number, number],
  [minY, maxY]: [number, number],
  [minZ, maxZ]: [number, number],
  order: string[],
): IsoPart => ({ minX, maxX, minY, maxY, minZ, maxZ, draw: () => order.push(name) });

describe('ordine di disegno dei mobili ruotati', () => {
  it('disegna prima ciò che sta dietro, sotto o più in basso', () => {
    const o: string[] = [];
    const back = part('dietro', [0, 10], [0, 10], [0, 10], o);
    const front = part('davanti', [0, 10], [20, 30], [0, 10], o);
    expect(drawsBefore(back, front)).toBe(true);
    const base = part('base', [0, 10], [0, 10], [0, 5], o);
    const onTop = part('sopra', [0, 10], [0, 10], [5, 8], o);
    expect(drawsBefore(base, onTop)).toBe(true);
  });

  it('la coperta appoggiata dentro il materasso resta sopra, anche se il centro è più lontano', () => {
    const o: string[] = [];
    // materasso grande e coperta che lo copre in parte, spostata verso il fondo
    const parts = [
      part('coperta', [0, 80], [0, 60], [15, 26], o),
      part('materasso', [0, 80], [0, 100], [14, 23], o),
      part('testiera', [0, 80], [100, 108], [0, 54], o),
    ];
    sortIsoParts(parts).forEach((p) => p.draw());
    expect(o.indexOf('materasso')).toBeLessThan(o.indexOf('coperta'));
    expect(o.at(-1)).toBe('testiera');
  });
});
