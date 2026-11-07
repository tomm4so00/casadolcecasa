// Sedie dei tavolini (bar, discoteca, cucina, sala riunioni, ristorante) e sedie d'attesa: dove
// stanno, da che parte ci si avvicina e come si guarda da seduti. Il disegno è in render/objects.ts
// (drawChair), il sedersi in courtyard-fun.ts.

/**
 * Schienale verso il fondo ('y0': sedia dietro il tavolo, si guarda verso lo schermo) o sul lato
 * sinistro ('x0': sedia a sinistra del tavolo, si guarda il tavolo verso +x). Tutte e due stanno
 * dietro il tavolo, così chi siede si vede di fronte e non di spalle.
 */
export type ChairBack = 'y0' | 'x0';

export interface Chair {
  x: number;
  y: number;
  back: ChairBack;
}

interface Pt {
  x: number;
  y: number;
}

interface Prop {
  kind: string;
  x: number;
  y: number;
  w: number;
  h: number;
}

/** Distanza tra il bordo del tavolo e il centro della sedia, per ogni tipo di tavolo. */
const TABLE_GAP: Record<string, number> = { roundTable: 6, dinnerTable: 2, table: 4 };
/** Mezza sedia: la seduta è 16×16. */
export const CHAIR_HALF = 8;

/** Le sedie di un oggetto di scena (nessuna se non ne ha). */
export function chairsOf(it: Prop): Chair[] {
  if (it.kind === 'waitingChairs')
    return [0, 1, 2].map((i) => ({
      x: it.x - it.w / 2 + 14 + (i * (it.w - 28)) / 2,
      y: it.y,
      back: 'y0' as const,
    }));
  const g = TABLE_GAP[it.kind];
  if (g === undefined) return [];
  return [
    // dietro il tavolo, schienale verso il fondo
    { x: it.x, y: it.y - it.h / 2 - g, back: 'y0' },
    // sul lato sinistro, schienale dalla parte opposta al tavolo
    { x: it.x - it.w / 2 - g, y: it.y, back: 'x0' },
  ];
}

/** Il tavolo ha le sedie intorno (le sedie d'attesa no: sono in fila e libere davanti). */
export const hasTable = (it: Prop): boolean => TABLE_GAP[it.kind] !== undefined;

/**
 * Da seduti: 'chair' guarda in avanti (verso +y, come in panchina), 'chairSide' guarda il tavolo
 * verso +x (sullo schermo in basso a destra).
 */
export type ChairPose = 'chair' | 'chairSide';
export const chairPose = (c: Chair): ChairPose => (c.back === 'x0' ? 'chairSide' : 'chair');

/** Direzione dello sguardo da seduti, sul pavimento. */
export const chairFace = (c: Chair): Pt => (c.back === 'x0' ? { x: 1, y: 0 } : { x: 0, y: 1 });

/**
 * Dove ci si mette prima di sedersi: davanti la sedia d'attesa; per le sedie del tavolo dal lato
 * libero (non c'è il tavolo, non c'è lo schienale e non c'è l'altra sedia), poi ci si infila
 * sulla seduta.
 */
export function chairFront(c: Chair, withTable: boolean): Pt {
  if (c.back === 'x0') return { x: c.x, y: c.y + 22 };
  return withTable ? { x: c.x + 22, y: c.y } : { x: c.x, y: c.y + 22 };
}

/** Il segmento a→b passa dentro il rettangolo (x0..x1, y0..y1)? (Liang–Barsky) */
export function segmentHitsRect(
  a: Pt,
  b: Pt,
  r: { x0: number; x1: number; y0: number; y1: number },
): boolean {
  let t0 = 0,
    t1 = 1;
  const dx = b.x - a.x,
    dy = b.y - a.y;
  const edges: [number, number][] = [
    [-dx, a.x - r.x0],
    [dx, r.x1 - a.x],
    [-dy, a.y - r.y0],
    [dy, r.y1 - a.y],
  ];
  for (const [p, q] of edges) {
    if (p === 0) {
      if (q < 0) return false;
      continue;
    }
    const t = q / p;
    if (p < 0) t0 = Math.max(t0, t);
    else t1 = Math.min(t1, t);
    if (t0 > t1) return false;
  }
  return true;
}

/**
 * Strada per arrivare davanti alla sedia senza attraversare il tavolo (e le sue sedie): dritti
 * se si può, altrimenti passando per l'angolo del tavolo che allunga meno il giro.
 */
export function pathToChair(from: Pt, front: Pt, table: Prop | null): Pt[] {
  if (!table || !hasTable(table)) return [from, front];
  // il tavolo con le sedie: dalla sedia di sinistra fino al bordo destro, dalla sedia dietro
  // fino al bordo davanti
  const g = TABLE_GAP[table.kind] + CHAIR_HALF;
  const block = {
    x0: table.x - table.w / 2 - g - 2,
    x1: table.x + table.w / 2 + 1,
    y0: table.y - table.h / 2 - g - 2,
    y1: table.y + table.h / 2 + 1,
  };
  if (!segmentHitsRect(from, front, block)) return [from, front];
  const m = 14; // gli angoli un po' fuori, così si passa accanto e non rasente
  const corners = [
    { x: block.x0 - m, y: block.y0 - m },
    { x: block.x1 + m, y: block.y0 - m },
    { x: block.x0 - m, y: block.y1 + m },
    { x: block.x1 + m, y: block.y1 + m },
  ];
  const len = (p: Pt[]) =>
    p.reduce((n, q, i) => (i ? n + Math.hypot(q.x - p[i - 1].x, q.y - p[i - 1].y) : 0), 0);
  let best: Pt[] | null = null;
  // un angolo solo, o due angoli vicini per girare attorno al tavolo da una parte all'altra
  for (const c of corners) {
    const p = [from, c, front];
    if (segmentHitsRect(from, c, block) || segmentHitsRect(c, front, block)) continue;
    if (!best || len(p) < len(best)) best = p;
  }
  for (const c1 of corners)
    for (const c2 of corners) {
      if (c1 === c2 || (c1.x !== c2.x && c1.y !== c2.y)) continue;
      const p = [from, c1, c2, front];
      if (
        segmentHitsRect(from, c1, block) ||
        segmentHitsRect(c1, c2, block) ||
        segmentHitsRect(c2, front, block)
      )
        continue;
      if (!best || len(p) < len(best)) best = p;
    }
  return best || [from, front];
}
