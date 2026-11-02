import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import {
  PAINT_CELLS,
  PAINT_W,
  blankPainting,
  decodePainting,
  encodePainting,
  floodFill,
  isBlankPainting,
  paintBrush,
  paintLine,
  PAINTING_SLOTS,
  firstFreeSlot,
  paintingKey,
  roomPaintings,
  slotOfKey,
} from '../src/game/painting-rules.js';

describe('quadri del laboratorio artistico', () => {
  it('codifica e decodifica il quadro senza perdere colori', () => {
    const grid = blankPainting();
    paintBrush(grid, 5, 5, 2, 3);
    grid[PAINT_CELLS - 1] = 15;
    const code = encodePainting(grid);
    expect(code).toHaveLength(PAINT_CELLS);
    expect(decodePainting(code)).toEqual(grid);
    expect(decodePainting('xyz')).toBeNull();
    expect(decodePainting(code.slice(1))).toBeNull();
  });

  it('pennello, linea e secchiello colorano i quadretti giusti', () => {
    const grid = blankPainting();
    expect(isBlankPainting(grid)).toBe(true);
    paintLine(grid, 0, 0, 9, 0, 1, 1);
    for (let x = 0; x <= 9; x++) expect(grid[x]).toBe(1);
    expect(grid[10]).toBe(0);
    // il secchiello riempie la zona bianca ma non supera la linea nera
    paintLine(grid, 0, 2, PAINT_W - 1, 2, 1, 1);
    floodFill(grid, 3, 1, 5);
    expect(grid[PAINT_W + 3]).toBe(5);
    expect(grid[3 * PAINT_W + 3]).toBe(0);
    expect(isBlankPainting(grid)).toBe(false);
  });

  it('il pennello non esce dai bordi della tela', () => {
    const grid = blankPainting();
    paintBrush(grid, 0, 0, 4, 2);
    expect(grid.filter((c) => c === 2).length).toBe(9);
  });

  it('una stanza ha tre posti per i quadri', () => {
    const code = encodePainting(blankPainting());
    expect(firstFreeSlot({})).toBe('p1');
    expect(firstFreeSlot({ paintings: { p1: code, p3: code } })).toBe('p2');
    expect(firstFreeSlot({ paintings: { p1: code, p2: code, p3: code } })).toBeNull();
    // un quadro non valido non occupa il posto
    expect(Object.keys(roomPaintings({ paintings: { p1: 'abc', p2: code } }))).toEqual(['p2']);
    expect(PAINTING_SLOTS.map(paintingKey)).toEqual(['painting1', 'painting2', 'painting3']);
    expect(slotOfKey('painting3')).toBe('p3');
    expect(slotOfKey('bed')).toBeNull();
  });

  it('le regole del database accettano solo quadri validi e li proteggono', () => {
    const room = JSON.parse(fs.readFileSync('firebase/database.rules.proposed.json', 'utf8')).rules
      .sims_rooms_state.$room;
    expect(room.paintings.$slot['.validate']).toContain(`length === ${PAINT_CELLS}`);
    for (const slot of PAINTING_SLOTS)
      expect(room['.validate']).toContain(`newData.child('paintings/${slot}').val() === data`);
  });
});
