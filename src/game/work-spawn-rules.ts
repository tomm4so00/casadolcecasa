// Dove si può far comparire un oggetto dei lavori senza che resti nascosto dietro un mobile alto.
// Niente browser qui: lo usa jobs.ts e lo controllano i test.

export interface Prop {
  x: number;
  y: number;
  w: number;
  h: number;
  /** altezza del mobile */
  z?: number;
}

/** Sullo schermo l'oggetto è un cerchio di questo raggio, a questa altezza da terra. */
const ITEM_R = 18;
const ITEM_Z = 14;

/** Proiezione isometrica come quella del disegno (senza telecamera né scala). */
const screen = (x: number, y: number, z: number) => ({ u: (x - y) * 0.866, v: (x + y) * 0.5 - z });

/**
 * L'oggetto in (x, y) resta coperto da un mobile? Succede se il mobile gli sta davanti (più vicino
 * a chi guarda) e sullo schermo si sovrappongono.
 */
export function hiddenBehind(x: number, y: number, props: readonly Prop[]): boolean {
  const it = screen(x, y, ITEM_Z);
  return props.some((p) => {
    const z = p.z ?? 40;
    // i mobili bassi (tappeti, sgabelli) non coprono niente
    if (z < 24) return false;
    // davanti all'oggetto: il suo angolo più vicino a chi guarda viene dopo l'oggetto
    if (p.x + p.w / 2 + p.y + p.h / 2 <= x + y) return false;
    const corners = [
      [p.x - p.w / 2, p.y - p.h / 2],
      [p.x + p.w / 2, p.y - p.h / 2],
      [p.x - p.w / 2, p.y + p.h / 2],
      [p.x + p.w / 2, p.y + p.h / 2],
    ].map(([cx, cy]) => screen(cx, cy, 0));
    const u0 = Math.min(...corners.map((c) => c.u)),
      u1 = Math.max(...corners.map((c) => c.u)),
      v1 = Math.max(...corners.map((c) => c.v)),
      v0 = Math.min(...corners.map((c) => c.v)) - z;
    return it.u + ITEM_R > u0 && it.u - ITEM_R < u1 && it.v + ITEM_R > v0 && it.v - ITEM_R < v1;
  });
}
