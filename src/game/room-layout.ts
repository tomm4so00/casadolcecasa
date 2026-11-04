// Disposizione fissa della stanza: cassaforte a muro e passaggio libero dall'ingresso
// (senza dipendenze dal browser, così è testabile).

/**
 * Cassaforte incassata nella parete di sinistra (x = -200): entrando si va verso sinistra.
 * È nel primo tratto di quella parete che si vede anche sugli schermi stretti dei telefoni.
 */
export const SAFE_SPOT = { x: -182, y: 20 };
/** Metà della larghezza della cassaforte lungo la parete, con un po' di margine per i quadri. */
export const SAFE_WALL_HALF = 26;

interface Rect {
  minX: number;
  maxX: number;
  minY: number;
  maxY: number;
}

/**
 * Passaggio dall'ingresso (tappetino in x = 0, y = 172) alla cassaforte, tutto sul lato sinistro
 * della stanza: verso sinistra lungo il fronte, poi su, poi fino alla parete. Qui non si possono
 * appoggiare mobili, così chiunque entri può sempre raggiungere la cassaforte.
 */
export const SAFE_CORRIDOR: Rect[] = [
  { minX: -130, maxX: 35, minY: 112, maxY: 180 }, // dall'ingresso verso sinistra
  { minX: -130, maxX: -70, minY: -12, maxY: 180 }, // su, lungo il lato sinistro
  { minX: -200, maxX: -70, minY: -12, maxY: 52 }, // fino alla cassaforte sulla parete
];

/** Spazio della stanza in cui stanno i mobili. */
const ROOM = { minX: -196, maxX: 196, minY: -176, maxY: 176 };

interface Footprint {
  x: number;
  y: number;
  w: number;
  h: number;
}

const overlaps = (fp: Footprint, r: Rect) =>
  fp.x + fp.w / 2 > r.minX &&
  fp.x - fp.w / 2 < r.maxX &&
  fp.y + fp.h / 2 > r.minY &&
  fp.y - fp.h / 2 < r.maxY;

export function overlapsCorridor(fp: Footprint): boolean {
  return SAFE_CORRIDOR.some((r) => overlaps(fp, r));
}

const insideRoom = (fp: Footprint) =>
  fp.x - fp.w / 2 >= ROOM.minX &&
  fp.x + fp.w / 2 <= ROOM.maxX &&
  fp.y - fp.h / 2 >= ROOM.minY &&
  fp.y + fp.h / 2 <= ROOM.maxY;

/** La posizione più vicina fuori dal passaggio e dentro la stanza. */
export function pushOutOfCorridor(fp: Footprint): { x: number; y: number } {
  if (!overlapsCorridor(fp)) return { x: fp.x, y: fp.y };
  const candidates: { x: number; y: number }[] = [];
  for (const r of SAFE_CORRIDOR) {
    candidates.push(
      { x: r.minX - fp.w / 2 - 1, y: fp.y },
      { x: r.maxX + fp.w / 2 + 1, y: fp.y },
      { x: fp.x, y: r.minY - fp.h / 2 - 1 },
      { x: fp.x, y: r.maxY + fp.h / 2 + 1 },
    );
  }
  // anche combinazioni: fuori da una corsia in orizzontale e dall'altra in verticale
  for (const a of SAFE_CORRIDOR)
    for (const b of SAFE_CORRIDOR)
      for (const x of [a.minX - fp.w / 2 - 1, a.maxX + fp.w / 2 + 1])
        for (const y of [b.minY - fp.h / 2 - 1, b.maxY + fp.h / 2 + 1]) candidates.push({ x, y });
  let best: { x: number; y: number } | null = null;
  let bestDist = Infinity;
  for (const c of candidates) {
    const moved = { ...fp, ...c };
    if (overlapsCorridor(moved) || !insideRoom(moved)) continue;
    const dist = Math.hypot(c.x - fp.x, c.y - fp.y);
    if (dist < bestDist) {
      best = c;
      bestDist = dist;
    }
  }
  return best ?? { x: fp.x, y: fp.y };
}

/**
 * Un quadro sulla parete di sinistra non può coprire la cassaforte: lo sposta di lato.
 * `y` è la posizione lungo la parete, `w` la larghezza del quadro, `minY`/`maxY` i limiti.
 */
export function avoidWallSafe(x: number, w: number, minX: number, maxX: number): number {
  const gap = SAFE_WALL_HALF + w / 2;
  if (Math.abs(x - SAFE_SPOT.y) >= gap) return x;
  const left = SAFE_SPOT.y - gap,
    right = SAFE_SPOT.y + gap;
  const options = [left, right].filter((v) => v >= minX && v <= maxX);
  return options.sort((a, b) => Math.abs(a - x) - Math.abs(b - x))[0] ?? x;
}
