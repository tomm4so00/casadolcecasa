// Quadri del laboratorio artistico (senza dipendenze dal browser, così sono testabili).
// La tela è una griglia di quadretti; ogni quadretto è un indice della tavolozza (0-f).

export const PAINT_W = 40;
export const PAINT_H = 30;
export const PAINT_CELLS = PAINT_W * PAINT_H;

/** Tavolozza a 16 colori: l'indice 0 è il bianco della tela. */
export const PAINT_PALETTE = [
  '#ffffff', // bianco
  '#2d3436', // nero
  '#95a5a6', // grigio
  '#e74c3c', // rosso
  '#e67e22', // arancione
  '#f1c40f', // giallo
  '#2ecc71', // verde chiaro
  '#1e8449', // verde scuro
  '#74b9ff', // azzurro
  '#2e5bde', // blu
  '#8e44ad', // viola
  '#fd79a8', // rosa
  '#8d5524', // marrone
  '#f5deb3', // beige
  '#ffcc99', // pesca
  '#00cec9', // turchese
] as const;

export type PaintGrid = Uint8Array;

export function blankPainting(): PaintGrid {
  return new Uint8Array(PAINT_CELLS);
}

/** Converte la griglia nel testo salvato nel database (un carattere esadecimale per quadretto). */
export function encodePainting(grid: PaintGrid): string {
  let out = '';
  for (let i = 0; i < PAINT_CELLS; i++) out += (grid[i] & 15).toString(16);
  return out;
}

export function isValidPainting(value: unknown): value is string {
  return typeof value === 'string' && value.length === PAINT_CELLS && /^[0-9a-f]+$/.test(value);
}

export function decodePainting(value: unknown): PaintGrid | null {
  if (!isValidPainting(value)) return null;
  const grid = blankPainting();
  for (let i = 0; i < PAINT_CELLS; i++) grid[i] = parseInt(value[i], 16);
  return grid;
}

export function isBlankPainting(grid: PaintGrid): boolean {
  return grid.every((cell) => cell === 0);
}

/** Pennello quadrato di lato `size` centrato sul quadretto (x, y). */
export function paintBrush(grid: PaintGrid, x: number, y: number, size: number, color: number) {
  const from = -Math.floor((size - 1) / 2);
  for (let dy = from; dy < from + size; dy++)
    for (let dx = from; dx < from + size; dx++) {
      const cx = x + dx,
        cy = y + dy;
      if (cx >= 0 && cy >= 0 && cx < PAINT_W && cy < PAINT_H) grid[cy * PAINT_W + cx] = color;
    }
}

/** Traccia una linea fra due punti, così i movimenti veloci non lasciano buchi. */
export function paintLine(
  grid: PaintGrid,
  x0: number,
  y0: number,
  x1: number,
  y1: number,
  size: number,
  color: number,
) {
  const steps = Math.max(Math.abs(x1 - x0), Math.abs(y1 - y0), 1);
  for (let i = 0; i <= steps; i++)
    paintBrush(
      grid,
      Math.round(x0 + ((x1 - x0) * i) / steps),
      Math.round(y0 + ((y1 - y0) * i) / steps),
      size,
      color,
    );
}

/** Secchiello: colora tutta la zona dello stesso colore collegata al quadretto (x, y). */
export function floodFill(grid: PaintGrid, x: number, y: number, color: number) {
  if (x < 0 || y < 0 || x >= PAINT_W || y >= PAINT_H) return;
  const target = grid[y * PAINT_W + x];
  if (target === color) return;
  const stack = [y * PAINT_W + x];
  while (stack.length) {
    const i = stack.pop()!;
    if (grid[i] !== target) continue;
    grid[i] = color;
    const cx = i % PAINT_W;
    if (cx > 0) stack.push(i - 1);
    if (cx < PAINT_W - 1) stack.push(i + 1);
    if (i >= PAINT_W) stack.push(i - PAINT_W);
    if (i < PAINT_CELLS - PAINT_W) stack.push(i + PAINT_W);
  }
}

// ---------------------------------------------------------------- quadri appesi nella stanza

/** Posti per i quadri in ogni stanza: al massimo tre. */
export const PAINTING_SLOTS = ['p1', 'p2', 'p3'] as const;
export type PaintingSlot = (typeof PAINTING_SLOTS)[number];
export const MAX_ROOM_PAINTINGS = PAINTING_SLOTS.length;

/** Chiave dell'oggetto della stanza (spostabile) che corrisponde a un posto: p1 → painting1. */
export const paintingKey = (slot: PaintingSlot) => `painting${slot.slice(1)}`;
export const slotOfKey = (key: string): PaintingSlot | null => {
  const slot = 'p' + key.replace('painting', '');
  return (PAINTING_SLOTS as readonly string[]).includes(slot) ? (slot as PaintingSlot) : null;
};

/** I quadri validi appesi in una stanza, per posto. */
export function roomPaintings(room: unknown): Partial<Record<PaintingSlot, string>> {
  const out: Partial<Record<PaintingSlot, string>> = {};
  const paintings =
    room && typeof room === 'object' ? (room as { paintings?: unknown }).paintings : null;
  if (!paintings || typeof paintings !== 'object') return out;
  for (const slot of PAINTING_SLOTS) {
    const value = (paintings as Record<string, unknown>)[slot];
    if (isValidPainting(value)) out[slot] = value;
  }
  return out;
}

/** Il primo posto libero, oppure null se la stanza ha già tre quadri. */
export function firstFreeSlot(room: unknown): PaintingSlot | null {
  const hung = roomPaintings(room);
  return PAINTING_SLOTS.find((slot) => !hung[slot]) ?? null;
}
