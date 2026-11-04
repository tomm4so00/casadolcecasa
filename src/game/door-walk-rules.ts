// Porte che si attraversano camminando: davanti a una porta aperta il bordo della stanza si apre
// in un varco largo quanto l'anta, e chi arriva sul filo della porta passa dall'altra parte.

/** Varco di una porta: sul muro `axis` (x = muro di sinistra o destra), dal lato `dir`. */
export interface DoorGap {
  key: string;
  axis: 'x' | 'y';
  dir: -1 | 1;
  /** centro della porta lungo il muro */
  center: number;
  /** di quanto il centro del personaggio può scostarsi dal centro della porta, nel varco */
  half: number;
}

export interface RoomBounds {
  x0: number;
  x1: number;
  y0: number;
  y1: number;
  /** distanza dal bordo sui due lati verso chi guarda (x1, y1), dove non c'è un muro */
  near?: number;
}

/** Distanza dal muro a cui il personaggio si ferma lontano dalle porte. */
export const WALL_MARGIN = 30;
/** Il filo interno della porta (lo stipite è spesso 8): passato quello si cambia ambiente. */
export const DOOR_FACE = 8;
/** Accanto al varco ci si infila lo stesso: il personaggio viene spinto verso il centro. */
const FUNNEL = 12;

/** Varco di una porta larga `span` lungo il muro (lo stipite toglie 5 per lato). */
export function gapFor(key: string, axis: 'x' | 'y', dir: -1 | 1, center: number, span: number) {
  const body = 9;
  return { key, axis, dir, center, half: Math.max(2, (span - 10) / 2 - body) };
}

/** Dove sta il muro di quel lato e il bordo normale della stanza. */
function wallOf(b: RoomBounds, g: DoorGap): { wall: number; edge: number } {
  const wall = g.axis === 'x' ? (g.dir < 0 ? b.x0 : b.x1) : g.dir < 0 ? b.y0 : b.y1;
  return { wall, edge: wall - g.dir * WALL_MARGIN };
}

/** Quanto si è oltre il bordo normale verso il muro della porta (0 se no). */
function depthPast(b: RoomBounds, g: DoorGap, x: number, y: number): number {
  const along = g.axis === 'x' ? x : y;
  return Math.max(0, (along - wallOf(b, g).edge) * g.dir);
}

/**
 * Tiene il personaggio dentro la stanza: lontano dalle porte a WALL_MARGIN dal muro, davanti a
 * una porta aperta fino al suo filo (un poco oltre, così si arriva a passarla).
 */
export function clampToRoom(
  x: number,
  y: number,
  b: RoomBounds,
  gaps: readonly DoorGap[],
): { x: number; y: number } {
  for (const g of gaps) {
    const across = g.axis === 'x' ? y : x;
    const past = depthPast(b, g, x, y) > 0;
    if (!past || Math.abs(across - g.center) > g.half + FUNNEL) continue;
    // nel varco: verso il centro della porta, e fino a poco oltre il filo
    const c = Math.max(g.center - g.half, Math.min(g.center + g.half, across));
    const { wall } = wallOf(b, g);
    const deepest = wall - g.dir * (DOOR_FACE - 4);
    const lo = g.dir < 0 ? deepest : wallOf(b, g).edge;
    const hi = g.dir < 0 ? wallOf(b, g).edge : deepest;
    if (g.axis === 'x') return { x: Math.max(lo, Math.min(hi, x)), y: clampY(c, b) };
    return { x: clampX(c, b), y: Math.max(lo, Math.min(hi, y)) };
  }
  return { x: clampX(x, b), y: clampY(y, b) };
}

const clampX = (x: number, b: RoomBounds) =>
  Math.max(b.x0 + WALL_MARGIN, Math.min(b.x1 - (b.near ?? WALL_MARGIN), x));
const clampY = (y: number, b: RoomBounds) =>
  Math.max(b.y0 + WALL_MARGIN, Math.min(b.y1 - (b.near ?? WALL_MARGIN), y));

/** La porta di cui il personaggio ha passato il filo, se c'è. */
export function crossedDoor(
  x: number,
  y: number,
  b: RoomBounds,
  gaps: readonly DoorGap[],
): DoorGap | null {
  for (const g of gaps) {
    const across = g.axis === 'x' ? y : x;
    if (Math.abs(across - g.center) > g.half + 0.5) continue;
    if (depthPast(b, g, x, y) >= WALL_MARGIN - DOOR_FACE) return g;
  }
  return null;
}

/** La porta nel cui vano sta il personaggio (oltre il bordo normale della stanza), se c'è. */
export function doorwayAt(
  x: number,
  y: number,
  b: RoomBounds,
  gaps: readonly DoorGap[],
): DoorGap | null {
  for (const g of gaps) {
    const across = g.axis === 'x' ? y : x;
    if (Math.abs(across - g.center) <= g.half + 0.5 && depthPast(b, g, x, y) > 0) return g;
  }
  return null;
}
