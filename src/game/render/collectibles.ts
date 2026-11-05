// Oggetti da collezione: i pezzi, gli espositori del negozio e la mensola a muro della stanza.
import { type GameValue, game } from '../context.js';
import { isoProject, isoScale } from './primitives.js';
import { box, onFace, resetPlane } from './objects.js';
import { type Collectible, onSale, shelfOf, usedListing } from '../collect-rules.js';
import { collectState } from '../collect.js';
import { getMyRoomMap, isMyRoomNow } from '../saves.js';
import { drawCollectibleArt } from './collectible-art.js';

const EMOJI_FONT = '"Segoe UI Emoji","Apple Color Emoji","Noto Color Emoji",sans-serif';

/** Disegna un pezzo appoggiato in (cx, by): `by` è il piano d'appoggio, `size` l'altezza. */
export function drawCollectible(
  ctx: CanvasRenderingContext2D,
  c: Collectible,
  cx: number,
  by: number,
  size: number,
  t: number,
): void {
  if (drawCollectibleArt(ctx, c.id, cx, by, size, t)) return;
  // pezzo senza disegno: la sua emoji
  ctx.save();
  ctx.font = `${size}px ${EMOJI_FONT}`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(c.emoji, cx, by - size * 0.52);
  ctx.restore();
}

// ---------------------------------------------------------------- negozio

/** Espositore: piedistallo di legno, il pezzo in vendita sotto una teca di vetro, il prezzo. */
export function drawCollectStand(it: GameValue, t: GameValue): void {
  const ctx: CanvasRenderingContext2D = game.view.ctx;
  const s = isoScale();
  // nel negozio dell'usato i pezzi sono quelli messi in vendita dai giocatori
  const listing = it.used ? usedListing(collectState(), it.stand) : null;
  const c = it.used ? listing?.c || null : onSale(collectState(), it.stand);
  const price = it.used ? listing?.sale.p : c?.price;
  const base = box(it.x, it.y, 30, 30, 40, it.used ? '#8d6e63' : '#4e342e', {
    top: it.used ? '#6d4c41' : '#3e2723',
  });
  onFace(base, 'left', (W: number, H: number) => {
    // targhetta col prezzo: d'ottone nel negozio, cartellino di carta all'usato
    ctx.fillStyle = it.used ? '#fdf6e3' : '#c9a227';
    ctx.fillRect(W / 2 - 11, H * 0.35, 22, 9);
    ctx.fillStyle = it.used ? '#2d3436' : '#3d2b12';
    ctx.font = 'bold 6px sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    const empty = it.used ? 'LIBERO' : 'VENDUTO';
    ctx.fillText(
      c ? `${(price || 0).toLocaleString('it-IT')} €` : empty,
      W / 2,
      H * 0.35 + 4.8,
      20,
    );
  });
  box(it.x, it.y, 34, 34, 3, it.used ? '#bcaaa4' : '#c9a227', { z0: 40 });
  // cuscino di velluto
  box(it.x, it.y, 18, 18, 2, it.used ? '#2e7d5b' : '#8e1b3a', { z0: 43 });
  if (c) {
    const p = isoProject(it.x, it.y, 45);
    drawCollectible(ctx, c, p.x, p.y, 30 * s, t || 0);
  }
  drawGlassCase(it.x, it.y, 30, 43, 84);
}

/** Teca di vetro trasparente (solo le facce che si vedono). */
function drawGlassCase(x: number, y: number, size: number, z0: number, z1: number): void {
  const ctx: CanvasRenderingContext2D = game.view.ctx;
  const h = size / 2;
  const P = (dx: number, dy: number, z: number) => isoProject(x + dx, y + dy, z);
  const faces = [
    [P(-h, h, z0), P(h, h, z0), P(h, h, z1), P(-h, h, z1)],
    [P(h, h, z0), P(h, -h, z0), P(h, -h, z1), P(h, h, z1)],
    [P(-h, -h, z1), P(h, -h, z1), P(h, h, z1), P(-h, h, z1)],
  ];
  ctx.save();
  faces.forEach((f, i) => {
    ctx.beginPath();
    f.forEach((p, j) => (j ? ctx.lineTo(p.x, p.y) : ctx.moveTo(p.x, p.y)));
    ctx.closePath();
    ctx.fillStyle = ['rgba(190,225,255,0.16)', 'rgba(160,200,240,0.2)', 'rgba(220,240,255,0.22)'][
      i
    ];
    ctx.fill();
    ctx.strokeStyle = 'rgba(255,255,255,0.55)';
    ctx.lineWidth = 1;
    ctx.stroke();
  });
  // riflesso
  const a = P(-h + 4, h, z1 - 6),
    b = P(-h + 10, h, z1 - 16);
  ctx.strokeStyle = 'rgba(255,255,255,0.7)';
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.moveTo(a.x, a.y);
  ctx.lineTo(b.x, b.y);
  ctx.stroke();
  ctx.restore();
}

// ---------------------------------------------------------------- mensola nella stanza

/** Larghezza della mensola sulla parete. */
export const SHELF_W = 70;

/** Quanto sporge la mensola dal muro, e a che altezza sta l'asse (dal pavimento). */
const SHELF_DEPTH = 13;
const SHELF_Z = 56;

/**
 * Mensola a muro con i (fino a tre) pezzi del proprietario della stanza. È in rilievo: un'asse di
 * legno che sporge dalla parete, con due staffe sotto, e i pezzi in piedi sopra come negli
 * espositori del negozio (con la loro ombra sull'asse).
 */
export function wallCollectShelf(d: GameValue, t: GameValue): void {
  const room: GameValue = game.roomsState[game.currentRoomIdx ?? -1];
  const mine = isMyRoomNow();
  const map: GameValue = mine ? getMyRoomMap() : room?.layout || {};
  const spot: GameValue = map.collectShelf || game.playerRoomFurniture.collectShelf;
  if (!spot) return;
  const side = spot.y <= -160 ? 'back' : 'left';
  if (d.side !== side) return;
  const ctx: CanvasRenderingContext2D = game.view.ctx;
  const s = isoScale();
  const back = side === 'back';
  // punto sull'asse: `along` lungo il muro dal centro della mensola, `out` dal muro verso la stanza
  const at = (along: number, out: number) =>
    back ? { x: spot.x + along, y: game.Y0 + out } : { x: game.X0 + out, y: spot.y - along };
  const mid = at(0, SHELF_DEPTH / 2);
  ctx.save();
  // fuori dal piano della parete: qui si disegna nello spazio della stanza
  resetPlane();
  // ombra sul muro, staffe e asse di legno
  const shadow = [
    at(-SHELF_W / 2 + 3, 0.3),
    at(SHELF_W / 2 + 3, 0.3),
    at(SHELF_W / 2 + 3, 0.3),
    at(-SHELF_W / 2 + 3, 0.3),
  ];
  const zs = [SHELF_Z - 2, SHELF_Z - 2, SHELF_Z - 9, SHELF_Z - 9];
  ctx.fillStyle = 'rgba(0,0,0,0.16)';
  ctx.beginPath();
  shadow.forEach((p, i) => {
    const q = isoProject(p.x, p.y, zs[i]);
    if (i) ctx.lineTo(q.x, q.y);
    else ctx.moveTo(q.x, q.y);
  });
  ctx.fill();
  for (const a of [-23, 23]) {
    const b = at(a, 4);
    box(b.x, b.y, back ? 2 : 8, back ? 8 : 2, 9, '#2d3436', { z0: SHELF_Z - 12 });
  }
  box(mid.x, mid.y, back ? SHELF_W : SHELF_DEPTH, back ? SHELF_DEPTH : SHELF_W, 3.2, '#8d6e63', {
    z0: SHELF_Z - 3.2,
    top: '#a1887f',
  });
  const owner = mine ? game.session.myPlayerId : room?.ownerId;
  if (owner) {
    // da dietro in avanti: sulla parete di sinistra il primo posto è il più vicino a chi guarda
    const pieces = shelfOf(collectState(), owner).map((c, i) => ({ c, i }));
    if (!back) pieces.reverse();
    for (const { c, i } of pieces) {
      if (!c) continue;
      const p = at((i - 1) * 22.5, SHELF_DEPTH / 2 + 0.5);
      const g = isoProject(p.x, p.y, SHELF_Z);
      // ombra del pezzo sull'asse
      ctx.fillStyle = 'rgba(40,24,12,0.28)';
      ctx.beginPath();
      ctx.ellipse(g.x, g.y, 9 * s, 3.2 * s, 0, 0, Math.PI * 2);
      ctx.fill();
      drawCollectible(ctx, c, g.x, g.y, 25 * s, t || 0);
    }
  }
  ctx.restore();
}
