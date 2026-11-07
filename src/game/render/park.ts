// Parco (ambiente "passeggiata"): il laghetto con le anatre, le siepi, i tavoli da picnic e gli
// attrezzi dell'agility nell'area cani. La disposizione è in data/catalogues.ts (ENV_PROPS).
import type { GameValue } from '../context.js';
import { game } from '../context.js';
import { isoProject, isoScale, rnd, setPlane } from './primitives.js';
import { box, resetPlane } from './objects.js';

const P = isoProject;

/**
 * Laghetto: acqua ovale col bordo di sassi, ninfee, canne sulla riva di fondo e anatre che
 * girano piano. È piatto (si disegna sotto chi passa); il rettangolo w×h non si attraversa.
 */
export function drawPondProp(it: GameValue, t: number): void {
  const ctx = game.view.ctx;
  const s = isoScale();
  const rx = it.w / 2,
    ry = it.h / 2;
  ctx.save();
  setPlane([it.x, it.y, 0.6], [1, 0, 0], [0, 1, 0]);
  // sassi della riva, poi l'acqua: più scura al centro
  ctx.fillStyle = '#9c9488';
  ctx.beginPath();
  ctx.ellipse(0, 0, rx, ry, 0, 0, 6.3);
  ctx.fill();
  for (let i = 0; i < 46; i++) {
    const a = (i / 46) * Math.PI * 2;
    ctx.fillStyle = i % 3 ? '#b5ada0' : '#857d71';
    ctx.beginPath();
    ctx.ellipse(Math.cos(a) * (rx - 3), Math.sin(a) * (ry - 3), 4.5, 3.5, a, 0, 6.3);
    ctx.fill();
  }
  const g = ctx.createRadialGradient(0, 0, 4, 0, 0, Math.max(rx, ry));
  g.addColorStop(0, '#1f6f8b');
  g.addColorStop(1, '#4fa3b8');
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.ellipse(0, 0, rx - 7, ry - 7, 0, 0, 6.3);
  ctx.fill();
  // increspature che si allargano
  for (let i = 0; i < 4; i++) {
    const k = (t * 0.25 + i / 4) % 1;
    ctx.strokeStyle = `rgba(255,255,255,${0.35 * (1 - k)})`;
    ctx.lineWidth = 0.9;
    ctx.beginPath();
    ctx.ellipse(
      (rnd(i * 5.1) - 0.5) * rx,
      (rnd(i * 2.7) - 0.5) * ry,
      4 + k * 16,
      2.5 + k * 10,
      0,
      0,
      6.3,
    );
    ctx.stroke();
  }
  // ninfee con qualche fiore
  for (let i = 0; i < 7; i++) {
    const a = rnd(i * 9.3) * 6.3,
      d = 0.45 + rnd(i * 4.1) * 0.35;
    const lx = Math.cos(a) * (rx - 7) * d,
      ly = Math.sin(a) * (ry - 7) * d;
    ctx.fillStyle = i % 2 ? '#3f9a46' : '#56b04f';
    ctx.beginPath();
    ctx.moveTo(lx, ly);
    ctx.arc(lx, ly, 5 + rnd(i) * 2, a + 0.4, a + 6.0);
    ctx.closePath();
    ctx.fill();
    if (i % 3 === 0) {
      ctx.fillStyle = '#ffd1e3';
      ctx.beginPath();
      ctx.arc(lx + 1, ly - 1, 2, 0, 6.3);
      ctx.fill();
    }
  }
  resetPlane();
  ctx.restore();
  // canne sulla riva di fondo (dietro chi guarda), dritte in su
  ctx.lineCap = 'round';
  for (let i = 0; i < 16; i++) {
    const a = Math.PI + 0.3 + (i / 16) * (Math.PI / 2 - 0.2) + rnd(i * 3.3) * 0.12;
    const bx = it.x + Math.cos(a) * (rx - 4),
      by = it.y + Math.sin(a) * (ry - 4);
    const h = 14 + rnd(i * 7.7) * 10;
    const sway = Math.sin(t * 1.3 + i) * 1.2;
    const b = P(bx, by, 0.6),
      tip = P(bx + sway, by, h);
    ctx.strokeStyle = i % 2 ? '#6b8e3a' : '#7fa346';
    ctx.lineWidth = 1.2 * s;
    ctx.beginPath();
    ctx.moveTo(b.x, b.y);
    ctx.lineTo(tip.x, tip.y);
    ctx.stroke();
    if (i % 2 === 0) {
      ctx.strokeStyle = '#6d4c2f';
      ctx.lineWidth = 2.4 * s;
      ctx.beginPath();
      ctx.moveTo(tip.x, tip.y + 1 * s);
      ctx.lineTo(tip.x, tip.y + 5 * s);
      ctx.stroke();
    }
  }
  ctx.lineCap = 'butt';
  // anatre: girano lente lungo ovali diversi, la testa nel verso del moto
  for (let i = 0; i < 3; i++) {
    const sp = 0.12 + i * 0.03,
      dir = i % 2 ? -1 : 1;
    const a = dir * t * sp + i * 2.1;
    const k = 0.35 + i * 0.15;
    const dx = Math.cos(a) * (rx - 10) * k,
      dy = Math.sin(a) * (ry - 10) * k;
    // direzione di marcia sul pavimento, poi sullo schermo
    const vx = -Math.sin(a) * dir * rx,
      vy = Math.cos(a) * dir * ry;
    const facing = (vx - vy) * 0.866 >= 0 ? 1 : -1;
    const c = P(it.x + dx, it.y + dy, 1.5 + Math.sin(t * 2 + i) * 0.3);
    duck(ctx, c.x, c.y, s, facing, i === 0);
  }
}

function duck(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  s: number,
  facing: number,
  male: boolean,
): void {
  ctx.fillStyle = 'rgba(255,255,255,0.35)';
  ctx.beginPath();
  ctx.ellipse(x, y + 1.5 * s, 7 * s, 2 * s, 0, 0, 6.3);
  ctx.fill();
  ctx.fillStyle = male ? '#8d7b68' : '#a68a6d';
  ctx.beginPath();
  ctx.ellipse(x, y - 2 * s, 5.5 * s, 3.2 * s, 0, 0, 6.3);
  ctx.fill();
  // coda all'insù
  ctx.beginPath();
  ctx.moveTo(x - facing * 4.5 * s, y - 3 * s);
  ctx.lineTo(x - facing * 7.5 * s, y - 5.5 * s);
  ctx.lineTo(x - facing * 4 * s, y - 1 * s);
  ctx.fill();
  // testa (verde per il maschio) e becco
  ctx.fillStyle = male ? '#1e7a46' : '#8a6f55';
  ctx.beginPath();
  ctx.arc(x + facing * 4 * s, y - 6 * s, 2.4 * s, 0, 6.3);
  ctx.fill();
  ctx.fillStyle = '#f5a623';
  ctx.beginPath();
  ctx.moveTo(x + facing * 6 * s, y - 6.4 * s);
  ctx.lineTo(x + facing * 8.6 * s, y - 5.6 * s);
  ctx.lineTo(x + facing * 6 * s, y - 5 * s);
  ctx.fill();
  ctx.fillStyle = '#111';
  ctx.beginPath();
  ctx.arc(x + facing * 4.6 * s, y - 6.6 * s, 0.6 * s, 0, 6.3);
  ctx.fill();
  if (male) {
    ctx.fillStyle = '#fff';
    ctx.fillRect(x + facing * 2.4 * s - 0.8 * s, y - 4.4 * s, 1.6 * s, 1 * s);
  }
}

/** Siepe potata: un parallelepipedo verde con le foglie che spuntano qua e là. */
export function drawHedgeProp(it: GameValue): void {
  const ctx = game.view.ctx;
  const d = it.z || 20;
  const b = box(it.x, it.y, it.w, it.h, d, '#3f8f3a', {
    top: '#5aad4e',
    edge: 'rgba(0,0,0,0.18)',
  });
  const s = isoScale();
  const n = Math.round((it.w + it.h) / 4);
  for (let i = 0; i < n; i++) {
    const r = rnd(i * 3.7 + it.x * 0.1 + it.y);
    // ciuffi sulla cima e sulle due facce che si vedono
    const face = i % 3;
    const u = rnd(i * 5.3 + it.y * 0.2);
    const p =
      face === 0
        ? P(b.x0 + u * it.w, b.y0 + r * it.h, d)
        : face === 1
          ? P(b.x0 + u * it.w, b.y1, r * d)
          : P(b.x1, b.y0 + u * it.h, r * d);
    ctx.fillStyle = i % 2 ? 'rgba(120,200,100,0.55)' : 'rgba(25,80,30,0.35)';
    ctx.beginPath();
    ctx.arc(p.x, p.y, (1.6 + r * 1.6) * s, 0, 6.3);
    ctx.fill();
  }
}

/** Tavolo da picnic: il piano e le due panche attaccate, gambe a cavalletto. */
export function drawPicnicTableProp(it: GameValue): void {
  const wood = '#b07a45',
    dark = '#7a4f28';
  const w = it.w;
  const bench = (y: number): void => {
    box(it.x - w / 2 + 8, y, 3, 6, 10, dark);
    box(it.x + w / 2 - 8, y, 3, 6, 10, dark);
    box(it.x, y, w, 8, 2.5, wood, { z0: 10 });
  };
  // panca dietro, tavolo, panca davanti: in quest'ordine si coprono bene
  bench(it.y - it.h / 2 + 4);
  for (const dx of [-1, 1]) box(it.x + dx * (w / 2 - 8), it.y, 3, 10, 18, dark);
  box(it.x, it.y, w, 22, 3, wood, { z0: 18, top: '#c48d55' });
  if (it.basket) picnicBasket(it);
  bench(it.y + it.h / 2 - 4);
}

/** Tovaglia a quadretti e cestino sopra il tavolo. */
function picnicBasket(it: GameValue): void {
  const ctx = game.view.ctx;
  ctx.save();
  setPlane([it.x - 18, it.y - 10, 21.1], [1, 0, 0], [0, 1, 0]);
  for (let i = 0; i < 6; i++)
    for (let j = 0; j < 4; j++) {
      ctx.fillStyle = (i + j) % 2 ? '#e74c3c' : '#fdfdfd';
      ctx.fillRect(i * 6, j * 5, 6, 5);
    }
  resetPlane();
  ctx.restore();
  box(it.x + 2, it.y, 12, 8, 7, '#c69c6d', { z0: 21.2, top: '#a77d4f' });
  const a = P(it.x - 4, it.y, 28),
    b = P(it.x + 8, it.y, 28);
  const s = isoScale();
  ctx.strokeStyle = '#8b5a2b';
  ctx.lineWidth = 1.4 * s;
  ctx.beginPath();
  ctx.moveTo(a.x, a.y);
  ctx.quadraticCurveTo((a.x + b.x) / 2, a.y - 7 * s, b.x, b.y);
  ctx.stroke();
}

// ---------------------------------------------------------------- agility dell'area cani

/** Ostacolo da salto: due paletti a strisce e una barra in mezzo (lungo x o lungo y). */
export function drawDogJumpProp(it: GameValue): void {
  const alongX = it.w >= it.h;
  const half = (alongX ? it.w : it.h) / 2;
  for (const d of [-half, half]) {
    const x = alongX ? it.x + d : it.x,
      y = alongX ? it.y : it.y + d;
    box(x, y, 6, 6, 2, '#ecf0f1');
    for (let k = 0; k < 4; k++)
      box(x, y, 2.6, 2.6, 5, k % 2 ? '#ecf0f1' : '#e74c3c', { z0: 2 + k * 5, edge: null });
  }
  box(it.x, it.y, alongX ? it.w : 2, alongX ? 2 : it.h, 2, '#f1c40f', {
    z0: 12,
    edge: 'rgba(0,0,0,0.25)',
  });
}

/** Tunnel di stoffa: un mezzo cilindro a cerchi colorati, sdraiato lungo x. */
export function drawDogTunnelProp(it: GameValue): void {
  const ctx = game.view.ctx;
  const s = isoScale();
  const r = it.h / 2;
  const n = 9;
  // dal fondo verso chi guarda: ogni anello copre quello dietro
  for (let i = 0; i <= n; i++) {
    const x = it.x - it.w / 2 + (it.w * i) / n;
    const c = P(x, it.y, r);
    ctx.fillStyle = i % 2 ? '#2e86de' : '#54a0ff';
    ctx.strokeStyle = 'rgba(0,0,0,0.25)';
    ctx.lineWidth = 0.8;
    ctx.beginPath();
    // l'anello sta nel piano y–z: sullo schermo un'ellisse inclinata
    ctx.ellipse(c.x, c.y, r * 0.95 * s, r * s, -0.52, Math.PI, 0);
    ctx.lineTo(c.x + r * 0.82 * s, c.y + r * 0.5 * s);
    ctx.fill();
    ctx.stroke();
  }
  // bocca del tunnel, buia
  const m = P(it.x + it.w / 2, it.y, r - 1);
  ctx.fillStyle = '#1b2a3a';
  ctx.beginPath();
  ctx.ellipse(m.x, m.y + 1 * s, (r - 3) * 0.85 * s, (r - 3) * s, -0.52, Math.PI, 0);
  ctx.closePath();
  ctx.fill();
}

/** Slalom: una fila di paletti bianchi e rossi piantati nel terreno, lungo y. */
export function drawDogSlalomProp(it: GameValue): void {
  const n = 6;
  for (let i = 0; i < n; i++) {
    const y = it.y - it.h / 2 + (it.h * i) / (n - 1);
    box(it.x, y, 2.4, 2.4, 22, i % 2 ? '#e74c3c' : '#f5f6fa', { edge: 'rgba(0,0,0,0.25)' });
  }
}

/** Fontanella per cani: colonnina verde con la vaschetta in basso, sempre piena. */
export function drawDogFountainProp(it: GameValue, t: number): void {
  const ctx = game.view.ctx;
  const s = isoScale();
  box(it.x + 6, it.y, 12, 12, 4, '#7f8c8d');
  box(it.x - 3, it.y, 6, 6, 26, '#2d6a4f', { top: '#40916c' });
  const w = P(it.x + 6, it.y, 4.2);
  ctx.fillStyle = '#74b9ff';
  ctx.beginPath();
  ctx.ellipse(w.x, w.y, 4 * s, 2 * s, 0, 0, 6.3);
  ctx.fill();
  // filo d'acqua dal beccuccio
  const a = P(it.x + 1, it.y, 22),
    b = P(it.x + 6, it.y, 4.5);
  ctx.strokeStyle = `rgba(200,235,255,${0.7 + Math.sin(t * 8) * 0.15})`;
  ctx.lineWidth = 1.1 * s;
  ctx.beginPath();
  ctx.moveTo(a.x, a.y);
  ctx.quadraticCurveTo(b.x, a.y, b.x, b.y);
  ctx.stroke();
}
