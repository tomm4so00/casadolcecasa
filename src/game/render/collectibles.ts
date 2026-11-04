// Oggetti da collezione: i pezzi, gli espositori del negozio e la mensola a muro della stanza.
import { type GameValue, game } from '../context.js';
import { isoProject, isoScale } from './primitives.js';
import { box, onFace } from './objects.js';
import { type Collectible, onSale, shelfOf } from '../collect-rules.js';
import { collectState } from '../collect.js';
import { getMyRoomMap, isMyRoomNow } from '../saves.js';

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
  ctx.save();
  const k = size / 20; // i disegni a mano sono pensati alti 20
  switch (c.draw) {
    case 'lava':
      drawLavaLamp(ctx, cx, by, k, t);
      break;
    case 'newton':
      drawNewtonCradle(ctx, cx, by, k, t);
      break;
    case 'bust':
      drawBust(ctx, cx, by, k);
      break;
    case 'record':
      drawRecordPlayer(ctx, cx, by, k, t);
      break;
    case 'clock':
      drawAlarmClock(ctx, cx, by, k);
      break;
    case 'cactus':
      // vaso di terracotta e la piantina sopra
      ctx.fillStyle = '#c56b3c';
      ctx.beginPath();
      ctx.moveTo(cx - 5 * k, by - 7 * k);
      ctx.lineTo(cx + 5 * k, by - 7 * k);
      ctx.lineTo(cx + 3.8 * k, by);
      ctx.lineTo(cx - 3.8 * k, by);
      ctx.fill();
      ctx.fillStyle = '#a0522d';
      ctx.fillRect(cx - 5.5 * k, by - 8.5 * k, 11 * k, 2 * k);
      emoji(ctx, c.emoji, cx, by - 7.5 * k, 13 * k);
      break;
    default:
      emoji(ctx, c.emoji, cx, by, size);
  }
  ctx.restore();
}

function emoji(ctx: CanvasRenderingContext2D, text: string, cx: number, by: number, size: number) {
  ctx.font = `${size}px ${EMOJI_FONT}`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(text, cx, by - size * 0.52);
}

/** Lampada lava: bolle arancioni che salgono e scendono piano dentro il vetro. */
function drawLavaLamp(ctx: CanvasRenderingContext2D, cx: number, by: number, k: number, t: number) {
  // base e tappo di metallo
  ctx.fillStyle = '#7f8c8d';
  ctx.beginPath();
  ctx.moveTo(cx - 5 * k, by);
  ctx.lineTo(cx + 5 * k, by);
  ctx.lineTo(cx + 3 * k, by - 5 * k);
  ctx.lineTo(cx - 3 * k, by - 5 * k);
  ctx.fill();
  ctx.fillRect(cx - 1.6 * k, by - 21 * k, 3.2 * k, 2.5 * k);
  // vetro
  const glass = new Path2D();
  glass.moveTo(cx - 3 * k, by - 5 * k);
  glass.lineTo(cx + 3 * k, by - 5 * k);
  glass.lineTo(cx + 1.6 * k, by - 18.5 * k);
  glass.lineTo(cx - 1.6 * k, by - 18.5 * k);
  glass.closePath();
  const g = ctx.createLinearGradient(0, by - 18 * k, 0, by - 5 * k);
  g.addColorStop(0, '#8e44ad');
  g.addColorStop(1, '#e84393');
  ctx.fillStyle = g;
  ctx.fill(glass);
  ctx.save();
  ctx.clip(glass);
  ctx.fillStyle = '#ffb142';
  for (let i = 0; i < 3; i++) {
    const phase = (Math.sin(t * 0.7 + i * 2.1) + 1) / 2;
    ctx.beginPath();
    ctx.ellipse(
      cx + Math.sin(t + i) * 0.6 * k,
      by - (6.5 + phase * 10) * k,
      (1.3 + (i % 2) * 0.4) * k,
      (1.8 + phase * 0.6) * k,
      0,
      0,
      6.3,
    );
    ctx.fill();
  }
  ctx.restore();
}

/** Culla di Newton: le due palline alle estremità si passano il colpo. */
function drawNewtonCradle(
  ctx: CanvasRenderingContext2D,
  cx: number,
  by: number,
  k: number,
  t: number,
) {
  ctx.fillStyle = '#2d3436';
  ctx.fillRect(cx - 10 * k, by - 2 * k, 20 * k, 2 * k);
  ctx.strokeStyle = '#b2bec3';
  ctx.lineWidth = 1.2 * k;
  ctx.beginPath();
  ctx.moveTo(cx - 9 * k, by - 2 * k);
  ctx.lineTo(cx - 9 * k, by - 17 * k);
  ctx.lineTo(cx + 9 * k, by - 17 * k);
  ctx.lineTo(cx + 9 * k, by - 2 * k);
  ctx.stroke();
  const swing = Math.sin(t * 4) * 0.6;
  const top = by - 17 * k,
    len = 11 * k,
    r = 1.7 * k;
  ctx.lineWidth = 0.5 * k;
  for (let i = 0; i < 5; i++) {
    const x0 = cx + (i - 2) * 3.4 * k;
    const a = i === 0 && swing < 0 ? swing : i === 4 && swing > 0 ? swing : 0;
    const bx = x0 + Math.sin(a) * len,
      byy = top + Math.cos(a) * len;
    ctx.strokeStyle = 'rgba(220,220,220,0.8)';
    ctx.beginPath();
    ctx.moveTo(x0, top);
    ctx.lineTo(bx, byy);
    ctx.stroke();
    const g = ctx.createRadialGradient(bx - r * 0.4, byy - r * 0.4, 0.2, bx, byy, r);
    g.addColorStop(0, '#ffffff');
    g.addColorStop(1, '#7f8c8d');
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.arc(bx, byy, r, 0, 6.3);
    ctx.fill();
  }
}

/** Busto classico di marmo sul suo piedistallo. */
function drawBust(ctx: CanvasRenderingContext2D, cx: number, by: number, k: number) {
  const marble = ctx.createLinearGradient(cx - 7 * k, 0, cx + 7 * k, 0);
  marble.addColorStop(0, '#ffffff');
  marble.addColorStop(1, '#b8b8b8');
  ctx.fillStyle = '#95a5a6';
  ctx.fillRect(cx - 4 * k, by - 3 * k, 8 * k, 3 * k);
  ctx.fillStyle = marble;
  // spalle
  ctx.beginPath();
  ctx.ellipse(cx, by - 5.5 * k, 7.5 * k, 3.2 * k, 0, Math.PI, 0);
  ctx.fill();
  ctx.fillRect(cx - 7.5 * k, by - 5.5 * k, 15 * k, 2.5 * k);
  // collo e testa
  ctx.fillRect(cx - 2 * k, by - 11 * k, 4 * k, 5 * k);
  ctx.beginPath();
  ctx.ellipse(cx, by - 14.5 * k, 4 * k, 5 * k, 0, 0, 6.3);
  ctx.fill();
  // riccioli e naso
  ctx.fillStyle = '#d0d0d0';
  for (const dx of [-3, -1, 1, 3]) {
    ctx.beginPath();
    ctx.arc(cx + dx * k, by - 19 * k, 1.3 * k, 0, 6.3);
    ctx.fill();
  }
  ctx.strokeStyle = 'rgba(0,0,0,0.25)';
  ctx.lineWidth = 0.6 * k;
  ctx.beginPath();
  ctx.moveTo(cx + 0.5 * k, by - 15 * k);
  ctx.lineTo(cx + 1.3 * k, by - 13 * k);
  ctx.stroke();
}

/** Giradischi portatile con il vinile che gira. */
function drawRecordPlayer(
  ctx: CanvasRenderingContext2D,
  cx: number,
  by: number,
  k: number,
  t: number,
) {
  ctx.fillStyle = '#c0392b';
  ctx.fillRect(cx - 10 * k, by - 6 * k, 20 * k, 6 * k);
  ctx.fillStyle = '#922b21';
  ctx.fillRect(cx - 10 * k, by - 2 * k, 20 * k, 2 * k);
  ctx.fillStyle = '#111';
  ctx.beginPath();
  ctx.ellipse(cx - 1.5 * k, by - 7.5 * k, 7.5 * k, 3 * k, 0, 0, 6.3);
  ctx.fill();
  // riflesso che gira
  const a = t * 3;
  ctx.strokeStyle = 'rgba(255,255,255,0.35)';
  ctx.lineWidth = 0.7 * k;
  ctx.beginPath();
  ctx.ellipse(cx - 1.5 * k, by - 7.5 * k, 5 * k, 2 * k, 0, a, a + 1);
  ctx.stroke();
  ctx.fillStyle = '#f1c40f';
  ctx.beginPath();
  ctx.ellipse(cx - 1.5 * k, by - 7.5 * k, 2 * k, 0.9 * k, 0, 0, 6.3);
  ctx.fill();
  // braccio
  ctx.strokeStyle = '#dfe6e9';
  ctx.lineWidth = 1 * k;
  ctx.beginPath();
  ctx.moveTo(cx + 8 * k, by - 8 * k);
  ctx.lineTo(cx + 3 * k, by - 7 * k);
  ctx.stroke();
}

/** Sveglia digitale da comodino: segna l'ora vera. */
function drawAlarmClock(ctx: CanvasRenderingContext2D, cx: number, by: number, k: number) {
  ctx.fillStyle = '#2d3436';
  ctx.beginPath();
  ctx.roundRect(cx - 10 * k, by - 11 * k, 20 * k, 11 * k, 3 * k);
  ctx.fill();
  ctx.fillStyle = '#0b1a0d';
  ctx.fillRect(cx - 8 * k, by - 9 * k, 16 * k, 6.5 * k);
  const now = new Date();
  const text = `${String(now.getHours()).padStart(2, '0')}${now.getSeconds() % 2 ? ':' : ' '}${String(now.getMinutes()).padStart(2, '0')}`;
  ctx.fillStyle = '#2ed573';
  ctx.shadowColor = '#2ed573';
  ctx.shadowBlur = 3 * k;
  ctx.font = `bold ${5.5 * k}px monospace`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(text, cx, by - 5.6 * k);
  ctx.shadowBlur = 0;
  ctx.fillStyle = '#e17055';
  ctx.fillRect(cx - 7 * k, by - 12.5 * k, 4 * k, 1.5 * k);
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
export const SHELF_W = 84;

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
  for (const dx of [-28, 28]) {
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
    if (c) drawCollectible(ctx, c, center + (i - 1) * 27, plank, 26, t || 0);
  });
}
