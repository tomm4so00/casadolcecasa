// Area cani del parco: il terreno battuto con ciotola e giochi, la staccionata di legno e il
// cancello, che si apre un momento quando qualcuno passa. Misure in dog-park-rules.ts.
import type { GameValue } from '../context.js';
import { game } from '../context.js';
import { isoProject, isoScale, poly, rnd, setPlane } from './primitives.js';
import { box, onFace, resetPlane } from './objects.js';
import { doorOpenAmount } from './doors.js';

const P = isoProject;
const H = 16; // altezza della staccionata
const WOOD = '#c08a55';
const POST = '#8b5a2b';
const EDGE = 'rgba(0,0,0,0.3)';

/** Terra battuta con un po' di trucioli, la ciotola dell'acqua, una pallina e un osso. */
export function drawDogParkGround(it: GameValue): void {
  const ctx = game.view.ctx;
  const s = isoScale();
  const x0 = it.x - it.w / 2,
    x1 = it.x + it.w / 2,
    y0 = it.y - it.h / 2,
    y1 = it.y + it.h / 2;
  poly([P(x0, y0, 0.4), P(x1, y0, 0.4), P(x1, y1, 0.4), P(x0, y1, 0.4)], '#b89466');
  // chiazze d'erba rimaste lungo la staccionata e qualche zona di terra più scura
  const area = (it.w * it.h) / 16000;
  ctx.save();
  setPlane([x0, y0, 0.45], [1, 0, 0], [0, 1, 0]);
  ctx.beginPath();
  ctx.rect(0, 0, it.w, it.h);
  ctx.clip();
  for (let i = 0; i < 14 * area; i++) {
    const u = rnd(i * 4.7 + 1) * it.w,
      v = rnd(i * 8.3 + 2) * it.h;
    const edge = Math.min(u, v, it.w - u, it.h - v);
    ctx.fillStyle = edge < 26 ? 'rgba(95,168,74,0.55)' : 'rgba(110,75,40,0.18)';
    ctx.beginPath();
    ctx.ellipse(u, v, 10 + rnd(i) * 14, 6 + rnd(i * 2) * 8, rnd(i * 3) * 3, 0, 6.3);
    ctx.fill();
  }
  resetPlane();
  ctx.restore();
  // ciuffi d'erba consumati e trucioli
  for (let i = 0; i < 70 * area; i++) {
    const p = P(x0 + 4 + rnd(i * 7.3) * (it.w - 8), y0 + 4 + rnd(i * 3.1 + 9) * (it.h - 8), 0.5);
    ctx.fillStyle = i % 3 ? 'rgba(120,85,45,0.45)' : 'rgba(95,168,74,0.55)';
    ctx.fillRect(p.x - 1.5 * s, p.y - 0.6 * s, 3 * s, 1.2 * s);
  }
  // ciotola dell'acqua vicino al cancello
  const bowl = P(x0 + 18, y1 - 14, 1);
  ctx.fillStyle = '#2980b9';
  ctx.beginPath();
  ctx.ellipse(bowl.x, bowl.y, 6 * s, 3 * s, 0, 0, 6.3);
  ctx.fill();
  ctx.fillStyle = '#74b9ff';
  ctx.beginPath();
  ctx.ellipse(bowl.x, bowl.y - 0.6 * s, 4.2 * s, 1.8 * s, 0, 0, 6.3);
  ctx.fill();
  // pallina da tennis
  const ball = P(it.x + 40, it.y + 30, 2.5);
  ctx.fillStyle = '#c8e639';
  ctx.beginPath();
  ctx.arc(ball.x, ball.y, 2.6 * s, 0, 6.3);
  ctx.fill();
  ctx.strokeStyle = 'rgba(255,255,255,0.8)';
  ctx.lineWidth = 0.7 * s;
  ctx.beginPath();
  ctx.arc(ball.x - 1.2 * s, ball.y, 2 * s, -1, 1);
  ctx.stroke();
  // osso di gomma
  const a = P(it.x - 30, it.y + 20, 1),
    b = P(it.x - 20, it.y + 22, 1);
  ctx.strokeStyle = '#fdfdfd';
  ctx.lineWidth = 2 * s;
  ctx.beginPath();
  ctx.moveTo(a.x, a.y);
  ctx.lineTo(b.x, b.y);
  ctx.stroke();
  ctx.fillStyle = '#fdfdfd';
  for (const e of [a, b])
    for (const d of [-1, 1]) {
      ctx.beginPath();
      ctx.arc(e.x, e.y + d * 1.2 * s, 1.4 * s, 0, 6.3);
      ctx.fill();
    }
}

/** Un pezzo di staccionata: due pali agli estremi e due traverse. */
export function drawDogFence(it: GameValue): void {
  const alongX = it.w >= it.h;
  const half = (alongX ? it.w : it.h) / 2;
  for (const z of [5, H - 3])
    box(it.x, it.y, alongX ? it.w : 1.8, alongX ? 1.8 : it.h, 2.2, WOOD, { z0: z, edge: EDGE });
  for (const d of [-half, half])
    box(alongX ? it.x + d : it.x, alongX ? it.y : it.y + d, 3.4, 3.4, H + 2, POST, { edge: EDGE });
}

/**
 * Il cancello: due pali alti con l'insegna "AREA CANI" e l'anta a sbarre, che si apre verso
 * l'interno gradualmente quando il giocatore si avvicina, come la porta del laboratorio.
 */
export function drawDogGate(it: GameValue, _t: number): void {
  const ctx = game.view.ctx;
  const x0 = it.x - it.w / 2,
    x1 = it.x + it.w / 2;
  const open = doorOpenAmount('park:dogGate', it.x, it.y, true, true);
  const leaf = it.w - 5;
  const angle = (open * Math.PI) / 2;
  const dx = Math.cos(angle),
    dy = -Math.sin(angle);
  const hinge = x0 + 2.5;
  // Le traverse e le sbarre ruotano insieme attorno al cardine.
  const point = (along: number, z: number) => P(hinge + dx * along, it.y + dy * along, z);
  for (const z of [3, H - 2])
    poly([point(0, z), point(leaf, z), point(leaf, z + 2), point(0, z + 2)], '#2d6a4f');
  for (let i = 1; i < 6; i++) {
    const along = (leaf * i) / 6;
    box(hinge + dx * along, it.y + dy * along, 1.2, 1.2, H - 4, '#40916c', {
      z0: 3,
      edge: null,
    });
  }
  // pali e insegna sopra il varco
  for (const px of [x0, x1]) box(px, it.y, 4.5, 4.5, 34, POST, { edge: EDGE });
  const sign = box(it.x, it.y, it.w + 8, 2.5, 11, '#f1e3c6', { z0: 25, edge: EDGE });
  // la scritta sta sulla faccia dell'insegna rivolta al parco
  onFace(sign, 'left', (W: number, Hh: number) => {
    ctx.fillStyle = '#6b3e1f';
    ctx.font = 'bold 6.5px sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('AREA CANI 🐾', W / 2, Hh / 2 + 0.5, W - 3);
    ctx.textBaseline = 'alphabetic';
  });
}
