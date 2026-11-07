// Area cani del parco (ambiente "passeggiata"): recinto, cancello e quando il cane è al guinzaglio.
// Regole senza browser: il movimento del cane è in pets.ts, il disegno in render/dog-park.ts.

/** Il recinto, nell'angolo destro del parco (880×640), dietro il viale (coordinate del pavimento). */
export const DOG_PARK = { x0: 150, x1: 410, y0: -295, y1: -80 };
/** Cancello sul lato davanti del recinto (quello verso la fontana): centro e larghezza. */
export const DOG_GATE = { x: 270, y: DOG_PARK.y1, w: 32 };
/** Dove ci si trova dopo aver passato il cancello, fuori e dentro. */
export const GATE_OUTSIDE = { x: DOG_GATE.x, y: DOG_GATE.y + 24 };
export const GATE_INSIDE = { x: DOG_GATE.x, y: DOG_GATE.y - 26 };
/**
 * Addestramento: il padrone va verso il centro del recinto, abbastanza lontano dal cancello che
 * il suo pulsante non compaia, e il cane si mette davanti a lui (verso chi guarda lo schermo).
 */
export const TRAIN_SPOT = { x: 270, y: -175 };
export const TRAIN_DOG_SPOT = { x: TRAIN_SPOT.x + 12, y: TRAIN_SPOT.y + 24 };

export interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

/** (x, y) è dentro il recinto? `m` lo allarga (positivo) o lo stringe (negativo) da ogni lato. */
export function inDogPark(x: number, y: number, m = 0): boolean {
  const p = DOG_PARK;
  return x > p.x0 - m && x < p.x1 + m && y > p.y0 - m && y < p.y1 + m;
}

/** Il cane: al guinzaglio, libero nel recinto o richiamato col fischio. */
export type DogMode = 'leash' | 'free' | 'called';

/**
 * Come cambia il guinzaglio: entrando nel recinto si slega il cane; fischiando ('called') lui
 * torna di corsa e, arrivato dal padrone, si rimette il guinzaglio. Se il padrone si ritrova
 * fuori dal recinto (è tornato a casa), il cane è di nuovo al guinzaglio.
 */
export function nextDogMode(mode: DogMode, ownerInPark: boolean, dogAtOwner: boolean): DogMode {
  if (!ownerInPark) return 'leash';
  if (mode === 'leash') return 'free';
  if (mode === 'called' && dogAtOwner) return 'leash';
  return mode;
}

/**
 * La staccionata a pezzi corti (uno per palo), così si ordina bene in profondità con chi passa
 * davanti o dietro. Il buco del cancello resta fuori: il cancello è un oggetto a sé.
 */
export function dogParkFence(step = 23): Rect[] {
  const { x0, x1, y0, y1 } = DOG_PARK;
  const t = 4; // spessore
  const out: Rect[] = [];
  const along = (a: number, b: number, put: (c: number, len: number) => void) => {
    const n = Math.max(1, Math.round((b - a) / step));
    const len = (b - a) / n;
    for (let i = 0; i < n; i++) put(a + len * (i + 0.5), len);
  };
  // fondo e lato destro interi
  along(x0, x1, (c, len) => out.push({ x: c, y: y0, w: len, h: t }));
  along(y0, y1, (c, len) => out.push({ x: x1, y: c, w: t, h: len }));
  // lato sinistro intero
  along(y0, y1, (c, len) => out.push({ x: x0, y: c, w: t, h: len }));
  // davanti: due tratti ai lati del cancello
  const g0 = DOG_GATE.x - DOG_GATE.w / 2,
    g1 = DOG_GATE.x + DOG_GATE.w / 2;
  along(x0, g0, (c, len) => out.push({ x: c, y: y1, w: len, h: t }));
  along(g1, x1, (c, len) => out.push({ x: c, y: y1, w: len, h: t }));
  return out;
}

/** Un punto a caso dentro il recinto (rx, ry tra 0 e 1), lontano `m` dalla staccionata. */
export function parkSpot(rx: number, ry: number, m = 18): { x: number; y: number } {
  const { x0, x1, y0, y1 } = DOG_PARK;
  return { x: x0 + m + rx * (x1 - x0 - 2 * m), y: y0 + m + ry * (y1 - y0 - 2 * m) };
}

/** Tiene (x, y) dentro il recinto, a `m` dalla staccionata. */
export function clampToPark(x: number, y: number, m = 12): { x: number; y: number } {
  const { x0, x1, y0, y1 } = DOG_PARK;
  return {
    x: Math.max(x0 + m, Math.min(x1 - m, x)),
    y: Math.max(y0 + m, Math.min(y1 - m, y)),
  };
}

/**
 * Chi passeggia per il parco (i bot) e andrebbe a sbattere contro il recinto rimbalza: si gira
 * solo sull'asse da cui è entrato, così non resta fermo a tremare sul bordo.
 */
export function bounceOffPark(
  px: number,
  py: number,
  nx: number,
  ny: number,
  vx: number,
  vy: number,
  m = 15,
): { vx: number; vy: number; hit: boolean } {
  if (!inDogPark(nx, ny, m)) return { vx, vy, hit: false };
  const p = DOG_PARK;
  const outX = px <= p.x0 - m || px >= p.x1 + m;
  const outY = py <= p.y0 - m || py >= p.y1 + m;
  // partito da dentro (o da un angolo preciso): si allontana dal centro del recinto
  if (!outX && !outY) {
    const cx = (p.x0 + p.x1) / 2,
      cy = (p.y0 + p.y1) / 2;
    return {
      vx: Math.sign(px - cx || 1) * Math.abs(vx),
      vy: Math.sign(py - cy || 1) * Math.abs(vy),
      hit: true,
    };
  }
  return { vx: outX ? -vx : vx, vy: outY ? -vy : vy, hit: true };
}
