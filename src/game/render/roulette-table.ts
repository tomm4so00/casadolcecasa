// Il tavolo della roulette nella sala scommesse: legno, panno verde con il tabellone dei numeri,
// la ruota che gira davvero (la stessa della finestra di gioco) e le fiches di chi ha puntato.
import type { GameValue } from '../context.js';
import { game } from '../context.js';
import { box, onFace } from './objects.js';
import { drawWheel, rouletteView } from '../roulette.js';
import { colorOf } from '../roulette-rules.js';

const FELT = '#0b6e4f';
const WOOD = '#5d3a1a';

/** Dove sta una puntata sul panno (in unità del piano del tavolo, larghezza W e profondità H). */
function feltSpot(key: string, W: number, H: number): { u: number; v: number } {
  const x0 = H + 6,
    zeroW = 8,
    colW = 10,
    cw = (W - x0 - zeroW - colW - 6) / 12,
    top = 6,
    rh = (H - 30) / 3;
  if (key === 'n0') return { u: x0 + zeroW / 2, v: top + rh * 1.5 };
  if (key.startsWith('n')) {
    const n = Number(key.slice(1));
    const col = Math.ceil(n / 3) - 1,
      row = 2 - ((n - 1) % 3);
    return { u: x0 + zeroW + cw * (col + 0.5), v: top + rh * (row + 0.5) };
  }
  if (key[0] === 'c')
    return { u: x0 + zeroW + cw * 12 + colW / 2, v: top + rh * (3 - Number(key[1]) + 0.5) };
  if (key[0] === 'd')
    return { u: x0 + zeroW + cw * (Number(key[1]) - 1) * 4 + cw * 2, v: top + rh * 3 + 6 };
  const outside = ['low', 'even', 'red', 'black', 'odd', 'high'];
  const i = Math.max(0, outside.indexOf(key));
  return { u: x0 + zeroW + cw * (i * 2 + 1), v: top + rh * 3 + 17 };
}

export function drawRouletteTable(it: GameValue, t: number, lights?: GameValue[]): void {
  const { x, y, w, h } = it;
  const z: number = it.z || 36;
  // gambe e corpo di legno
  for (const [sx, sy] of [
    [-1, -1],
    [1, -1],
    [-1, 1],
    [1, 1],
  ])
    box(x + sx * (w / 2 - 8), y + sy * (h / 2 - 8), 6, 6, z - 8, '#3e2510');
  box(x, y, w, h, 8, WOOD, { z0: z - 8, top: '#7a4b22' });
  const top = box(x, y, w - 6, h - 6, 1, FELT, { z0: z });
  const view = rouletteView();
  // sul piano del panno (onFace imposta la trasformazione): la ruota viene schiacciata in
  // prospettiva da sola
  onFace(top, 'top', (W: number, H: number): void => drawFelt(W, H, view, t));
  if (lights) lights.push({ x, y, z: 40, r: 150, color: '120,255,170' });
}

function drawFelt(W: number, H: number, view: ReturnType<typeof rouletteView>, t: number): void {
  const ctx = game.view.ctx;
  // la ruota, in una conca di legno a sinistra
  const r = H / 2 - 4;
  ctx.fillStyle = '#3e2510';
  ctx.beginPath();
  ctx.arc(H / 2, H / 2, r + 2, 0, Math.PI * 2);
  ctx.fill();
  drawWheel(ctx, H / 2, H / 2, r, view, t);
  // il tabellone: zero, numeri, colonne, dozzine e puntate esterne
  const x0 = H + 6,
    zeroW = 8,
    colW = 10,
    cw = (W - x0 - zeroW - colW - 6) / 12,
    top = 6,
    rh = (H - 30) / 3;
  ctx.strokeStyle = 'rgba(255,255,255,0.8)';
  ctx.lineWidth = 0.5;
  ctx.fillStyle = '#16a085';
  ctx.fillRect(x0, top, zeroW, rh * 3);
  ctx.strokeRect(x0, top, zeroW, rh * 3);
  for (let col = 0; col < 12; col++)
    for (let row = 0; row < 3; row++) {
      const n = col * 3 + (3 - row);
      const c = colorOf(n);
      ctx.fillStyle = c === 'red' ? '#c0392b' : '#1e272e';
      const u = x0 + zeroW + col * cw,
        v = top + row * rh;
      ctx.fillRect(u + 0.6, v + 0.6, cw - 1.2, rh - 1.2);
      ctx.strokeRect(u, v, cw, rh);
    }
  ctx.strokeRect(x0 + zeroW + cw * 12, top, colW, rh * 3);
  for (let d = 0; d < 3; d++) ctx.strokeRect(x0 + zeroW + d * cw * 4, top + rh * 3, cw * 4, 11);
  for (let o = 0; o < 6; o++)
    ctx.strokeRect(x0 + zeroW + o * cw * 2, top + rh * 3 + 11, cw * 2, 11);
  ctx.fillStyle = '#c0392b';
  ctx.fillRect(x0 + zeroW + 4 * cw + 2, top + rh * 3 + 13, cw * 2 - 4, 7);
  ctx.fillStyle = '#1e272e';
  ctx.fillRect(x0 + zeroW + 6 * cw + 2, top + rh * 3 + 13, cw * 2 - 4, 7);
  // le fiches: le mie dorate, quelle degli altri colorate
  const colors = ['#e84118', '#0097e6', '#8c7ae6', '#44bd32', '#e1b12c'];
  view.chips.forEach((c, i) => {
    const p = feltSpot(c.key, W, H);
    const stack = Math.min(4, 1 + Math.floor(c.amount / 25));
    const ox = c.mine ? 0 : ((i % 3) - 1) * 2.4,
      oy = c.mine ? 0 : (((i / 3) | 0) % 2) * 2;
    for (let k = 0; k < stack; k++) {
      ctx.fillStyle = c.mine ? '#f5c518' : colors[i % colors.length];
      ctx.beginPath();
      ctx.arc(p.u + ox, p.v + oy - k * 0.8, 2.6, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = '#ffffff';
      ctx.lineWidth = 0.6;
      ctx.stroke();
    }
  });
}
