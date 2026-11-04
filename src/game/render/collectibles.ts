// Oggetti da collezione: i pezzi, gli espositori del negozio e la mensola a muro della stanza.
import { type GameValue, game } from '../context.js';
import { isoProject, isoScale } from './primitives.js';
import { box, onFace } from './objects.js';
import { type Collectible, onSale, shelfOf } from '../collect-rules.js';
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
  const c = onSale(collectState(), it.stand);
  const base = box(it.x, it.y, 30, 30, 40, '#4e342e', { top: '#3e2723' });
  onFace(base, 'left', (W: number, H: number) => {
    // targhetta d'ottone col prezzo
    ctx.fillStyle = '#c9a227';
    ctx.fillRect(W / 2 - 11, H * 0.35, 22, 9);
    ctx.fillStyle = '#3d2b12';
    ctx.font = 'bold 6px sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(c ? `${c.price} €` : 'VENDUTO', W / 2, H * 0.35 + 4.8, 20);
  });
  box(it.x, it.y, 34, 34, 3, '#c9a227', { z0: 40 });
  // cuscino di velluto
  box(it.x, it.y, 18, 18, 2, '#8e1b3a', { z0: 43 });
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

/** Mensola a muro con i (fino a tre) pezzi del proprietario della stanza. */
export function wallCollectShelf(d: GameValue, t: GameValue): void {
  const room: GameValue = game.roomsState[game.currentRoomIdx ?? -1];
  const mine = isMyRoomNow();
  const map: GameValue = mine ? getMyRoomMap() : room?.layout || {};
  const spot: GameValue = map.collectShelf || game.playerRoomFurniture.collectShelf;
  if (!spot) return;
  const side = spot.y <= -160 ? 'back' : 'left';
  if (d.side !== side) return;
  const center = side === 'back' ? spot.x + 200 : 180 - spot.y;
  const ctx: CanvasRenderingContext2D = game.view.ctx;
  const plank = 74;
  // staffe
  ctx.fillStyle = '#2d3436';
  for (const dx of [-23, 23]) {
    ctx.beginPath();
    ctx.moveTo(center + dx - 2, plank + 4);
    ctx.lineTo(center + dx + 2, plank + 4);
    ctx.lineTo(center + dx + 2, plank + 14);
    ctx.fill();
  }
  // ombra e asse di legno
  ctx.fillStyle = 'rgba(0,0,0,0.22)';
  ctx.fillRect(center - SHELF_W / 2 + 2, plank + 4, SHELF_W, 4);
  ctx.fillStyle = '#8d6e63';
  ctx.fillRect(center - SHELF_W / 2, plank, SHELF_W, 5);
  ctx.fillStyle = '#a1887f';
  ctx.fillRect(center - SHELF_W / 2, plank, SHELF_W, 1.5);
  const owner = mine ? game.session.myPlayerId : room?.ownerId;
  if (!owner) return;
  shelfOf(collectState(), owner).forEach((c, i) => {
    if (c) drawCollectible(ctx, c, center + (i - 1) * 22.5, plank, 24, t || 0);
  });
}
