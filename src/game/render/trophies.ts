// La mensola dei trofei nella stanza: i trofei dei 6 capitoli delle missioni in piedi sopra e le
// medaglie delle missioni bonus appese sotto (i modelli 3D sono in collectible-3d.ts). Come la
// mensola dei collezionabili è un oggetto da parete che scorre lungo i muri.
import { game } from '../context.js';
import { isoProject, isoScale } from './primitives.js';
import { box, resetPlane } from './objects.js';
import { drawCollectible3d } from './collectible-3d.js';
import { getMyRoomMap, isMyRoomNow } from '../saves.js';

/** I trofei, nell'ordine dei capitoli, e le medaglie bonus. */
export const TROPHIES = [
  'trofeo_benvenuto',
  'trofeo_citta',
  'trofeo_vicini',
  'trofeo_lavoro',
  'trofeo_rischi',
  'trofeo_progetti',
] as const;
export const MEDALS = ['medaglia_luna', 'medaglia_idea'] as const;

/** La mensola: corta e profonda, con i trofei in due file (capitoli 1–3 dietro, 4–6 davanti). */
export const TROPHY_SHELF_W = 76;
const DEPTH = 26;
const SHELF_Z = 60;
const TROPHY_SIZE = 13.5;
/** Il posto di ogni trofeo: lungo il muro e quanto sporge; la fila davanti è sfalsata. */
const SLOTS: [number, number][] = [
  [-26, 7],
  [-4, 7],
  [18, 7],
  [-15, 19],
  [7, 19],
  [29, 19],
];

type Spot = { x: number; y: number };
/** Quello che serve della stanza in cui si è: la disposizione e i trofei di chi ci abita. */
type RoomView = { layout?: Record<string, Spot>; trophies?: unknown } | undefined;
const roomHere = (): RoomView => game.roomsState[game.currentRoomIdx ?? -1] as RoomView;

/** I trofei e le medaglie da mostrare: del giocatore che abita questa stanza. */
export function trophiesHere(): string[] {
  if (isMyRoomNow()) return game.player.trophies || [];
  const list = roomHere()?.trophies;
  return Array.isArray(list) ? list.filter((x): x is string => typeof x === 'string') : [];
}

export function wallTrophyShelf(d: { side?: string }, t: number): void {
  const map = (isMyRoomNow() ? getMyRoomMap() : roomHere()?.layout || {}) as Record<string, Spot>;
  const spot: Spot | undefined = map.trophyShelf || game.playerRoomFurniture.trophyShelf;
  if (!spot) return;
  const side = spot.y <= -160 ? 'back' : 'left';
  if (d.side !== side) return;
  const ctx: CanvasRenderingContext2D = game.view.ctx;
  const s = isoScale();
  const back = side === 'back';
  const at = (along: number, out: number) =>
    back ? { x: spot.x + along, y: game.Y0 + out } : { x: game.X0 + out, y: spot.y - along };
  const mid = at(0, DEPTH / 2);
  ctx.save();
  resetPlane();
  // le staffe e l'asse di legno scuro, con il bordo dorato davanti
  for (const a of [-28, 28]) {
    const b = at(a, 4);
    box(b.x, b.y, back ? 2 : 8, back ? 8 : 2, 9, '#2d3436', { z0: SHELF_Z - 12 });
  }
  box(mid.x, mid.y, back ? TROPHY_SHELF_W : DEPTH, back ? DEPTH : TROPHY_SHELF_W, 3.4, '#5d4037', {
    z0: SHELF_Z - 3.4,
    top: '#795548',
  });
  const edge = at(0, DEPTH + 0.2);
  box(edge.x, edge.y, back ? TROPHY_SHELF_W : 0.6, back ? 0.6 : TROPHY_SHELF_W, 1.2, '#d4ac0d', {
    z0: SHELF_Z - 2.4,
  });
  const have = new Set(trophiesHere());
  // si disegna da dietro in avanti, in ordine di profondità come i mobili (x + y): vale per le due
  // file e per tutte e due le pareti. I trofei non si girano: i solidi rotondi girati si
  // disegnerebbero male, e le loro due facce si vedono da qualsiasi parete
  const order = TROPHIES.map((id, i) => ({ id, p: at(SLOTS[i][0], SLOTS[i][1]) }));
  order.sort((a, b) => a.p.x + a.p.y - (b.p.x + b.p.y));
  for (const { id, p } of order) {
    if (!have.has(id)) {
      // il posto vuoto: un segno chiaro sull'asse, così si vede che manca qualcosa
      const g = isoProject(p.x, p.y, SHELF_Z);
      ctx.fillStyle = 'rgba(255,255,255,0.18)';
      ctx.beginPath();
      ctx.ellipse(g.x, g.y, 6 * s, 2.2 * s, 0, 0, Math.PI * 2);
      ctx.fill();
      continue;
    }
    const g = isoProject(p.x, p.y, SHELF_Z);
    ctx.fillStyle = 'rgba(40,24,12,0.3)';
    ctx.beginPath();
    ctx.ellipse(g.x, g.y, 7 * s, 2.6 * s, 0, 0, Math.PI * 2);
    ctx.fill();
    drawCollectible3d(id, p.x, p.y, SHELF_Z, TROPHY_SIZE, t || 0, back ? 0 : 1);
  }
  // le medaglie appese sotto l'asse, ai due lati
  MEDALS.forEach((id, i) => {
    if (!have.has(id)) return;
    const p = at((i ? 1 : -1) * 21, DEPTH + 0.8);
    const size = 15;
    // il nastro parte dal fondo dell'asse (il modello è alto 14 a size 20)
    drawCollectible3d(id, p.x, p.y, SHELF_Z - 3.4 - 14 * (size / 20), size, t || 0, back ? 0 : 1);
  });
  ctx.restore();
}
