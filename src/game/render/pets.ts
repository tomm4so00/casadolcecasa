// Disegni degli animali domestici: cane e gatto, e le casette (gabbie, teca, acquario) con dentro
// l'uccellino, il criceto, il serpente e il pesce. Anche il guinzaglio e il fumetto quando hanno fame.
import type { GameValue } from '../context.js';
import { game } from '../context.js';
import { footprintOf, isoProject, isoScale, poly } from './primitives.js';
import { box, ellipseShadow } from './objects.js';
import type { PetKind } from '../pet-rules.js';

type Pt = { x: number; y: number };
const P = (x: number, y: number, z: number): Pt => isoProject(x, y, z);

/** Pareti di vetro (o rete) di una casetta: si disegnano dopo l'animale, trasparenti. */
function glassBox(
  x: number,
  y: number,
  w: number,
  h: number,
  z0: number,
  z1: number,
  tint: string,
) {
  const x0 = x - w / 2,
    x1 = x + w / 2,
    y0 = y - h / 2,
    y1 = y + h / 2;
  const edge = 'rgba(255,255,255,0.7)';
  // pareti di fronte (verso chi guarda) e lati
  poly([P(x0, y1, z0), P(x1, y1, z0), P(x1, y1, z1), P(x0, y1, z1)], tint, edge, 1);
  poly([P(x1, y0, z0), P(x1, y1, z0), P(x1, y1, z1), P(x1, y0, z1)], tint, edge, 1);
  // bordo in alto
  poly([P(x0, y0, z1), P(x1, y0, z1), P(x1, y1, z1), P(x0, y1, z1)], null, edge, 1);
  // riflesso
  const ctx = game.view.ctx;
  const a = P(x0 + w * 0.2, y1, z1 - 4),
    b = P(x0 + w * 0.35, y1, z0 + 6);
  ctx.strokeStyle = 'rgba(255,255,255,0.45)';
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.moveTo(a.x, a.y);
  ctx.lineTo(b.x, b.y);
  ctx.stroke();
}

/** Fondo di una casetta (dimensioni già girate se la casetta è ruotata). */
function dims(it: GameValue): { w: number; h: number } {
  const fp = footprintOf({ w: it.w, h: it.h, rot: it.rot });
  return { w: fp.w, h: fp.h };
}

// ---------------------------------------------------------------- uccellino

export function drawBirdCage(it: GameValue, t: number): void {
  const ctx = game.view.ctx;
  const s = isoScale();
  const { x, y } = it;
  const r = Math.min(it.w, it.h) / 2 - 1;
  // piedistallo e fondo
  box(x, y, 8, 8, 18, '#6d4c41');
  box(x, y, r * 2, r * 2, 4, '#8d6e63', { z0: 18 });
  const Z0 = 22,
    Z1 = 50,
    TOP = 58;
  // posatoio
  const pa = P(x - r * 0.7, y, Z0 + 12),
    pb = P(x + r * 0.7, y, Z0 + 12);
  ctx.strokeStyle = '#8d6e63';
  ctx.lineWidth = 2 * s;
  ctx.beginPath();
  ctx.moveTo(pa.x, pa.y);
  ctx.lineTo(pb.x, pb.y);
  ctx.stroke();
  // l'uccellino salta da una parte all'altra del posatoio
  const hopPhase = (t * 0.7 + (it.seed || 0)) % 2;
  const side = hopPhase < 1 ? -1 : 1;
  const k = hopPhase % 1;
  const jump = k < 0.25 ? Math.sin((k / 0.25) * Math.PI) * 6 : 0;
  // durante il salto va dal posto di prima a quello nuovo
  const pos = k < 0.25 ? -side + 2 * side * (k / 0.25) : side;
  const bx = x + r * 0.35 * pos;
  const bp = P(bx, y, Z0 + 14 + jump);
  drawBird(bp.x, bp.y, s, t, side);
  // sbarre
  ctx.strokeStyle = 'rgba(200,170,90,0.95)';
  ctx.lineWidth = Math.max(0.7, 0.9 * s);
  for (let i = 0; i < 14; i++) {
    const a = (i / 14) * Math.PI * 2;
    const cx = x + Math.cos(a) * r,
      cy = y + Math.sin(a) * r;
    const b = P(cx, cy, Z0),
      m = P(cx, cy, Z1),
      tp = P(x, y, TOP);
    ctx.beginPath();
    ctx.moveTo(b.x, b.y);
    ctx.lineTo(m.x, m.y);
    ctx.quadraticCurveTo(
      P(x + Math.cos(a) * r * 0.7, y + Math.sin(a) * r * 0.7, TOP).x,
      m.y - 6 * s,
      tp.x,
      tp.y,
    );
    ctx.stroke();
  }
  // anelli
  for (const z of [Z0, Z1]) {
    ctx.beginPath();
    for (let i = 0; i <= 24; i++) {
      const a = (i / 24) * Math.PI * 2;
      const p = P(x + Math.cos(a) * r, y + Math.sin(a) * r, z);
      if (i) ctx.lineTo(p.x, p.y);
      else ctx.moveTo(p.x, p.y);
    }
    ctx.stroke();
  }
  const hook = P(x, y, TOP + 4);
  ctx.beginPath();
  ctx.arc(hook.x, hook.y, 2.5 * s, 0, 6.3);
  ctx.stroke();
}

function drawBird(px: number, py: number, s: number, t: number, face: number): void {
  const ctx = game.view.ctx;
  // corpo
  ctx.fillStyle = '#4fc3f7';
  ctx.beginPath();
  ctx.ellipse(px, py - 3 * s, 4.2 * s, 3.2 * s, 0, 0, 6.3);
  ctx.fill();
  // pancia gialla
  ctx.fillStyle = '#fff176';
  ctx.beginPath();
  ctx.ellipse(px + face * 1 * s, py - 2.2 * s, 2.4 * s, 2 * s, 0, 0, 6.3);
  ctx.fill();
  // ala che sbatte
  const flap = Math.sin(t * 18) * 0.5;
  ctx.fillStyle = '#0288d1';
  ctx.beginPath();
  ctx.ellipse(px - face * 1 * s, py - 3.5 * s, 2.8 * s, 1.5 * s, flap * face, 0, 6.3);
  ctx.fill();
  // testa, becco, occhio
  ctx.fillStyle = '#4fc3f7';
  ctx.beginPath();
  ctx.arc(px + face * 3.2 * s, py - 6.2 * s, 2.4 * s, 0, 6.3);
  ctx.fill();
  ctx.fillStyle = '#ff9800';
  ctx.beginPath();
  ctx.moveTo(px + face * 5.2 * s, py - 6.6 * s);
  ctx.lineTo(px + face * 7.2 * s, py - 6 * s);
  ctx.lineTo(px + face * 5.2 * s, py - 5.4 * s);
  ctx.fill();
  ctx.fillStyle = '#111';
  ctx.beginPath();
  ctx.arc(px + face * 3.8 * s, py - 6.8 * s, 0.6 * s, 0, 6.3);
  ctx.fill();
  // coda
  ctx.fillStyle = '#0277bd';
  ctx.beginPath();
  ctx.moveTo(px - face * 3.5 * s, py - 3 * s);
  ctx.lineTo(px - face * 7 * s, py - 1 * s);
  ctx.lineTo(px - face * 6.5 * s, py - 3.5 * s);
  ctx.fill();
}

// ---------------------------------------------------------------- criceto

export function drawHamsterCage(it: GameValue, t: number): void {
  const ctx = game.view.ctx;
  const s = isoScale();
  const { x, y } = it;
  const { w, h } = dims(it);
  // vaschetta di plastica e trucioli
  box(x, y, w, h, 8, '#ff7043', { top: '#ffe0b2' });
  for (let i = 0; i < 14; i++) {
    const p = P(x - w / 2 + 4 + ((i * 37) % (w - 8)), y - h / 2 + 4 + ((i * 53) % (h - 8)), 8.5);
    ctx.fillStyle = i % 2 ? '#ffcc80' : '#ffe0b2';
    ctx.fillRect(p.x - 1.5 * s, p.y - 0.7 * s, 3 * s, 1.4 * s);
  }
  // ruota (nel piano verticale lungo x, su un lato)
  const along = w >= h;
  const wx = along ? x + w * 0.22 : x,
    wy = along ? y : y + h * 0.22;
  const R = 9;
  const C = { z: 8 + R + 1 };
  const spin = t * 6;
  const wheel = (a: number): Pt =>
    along
      ? P(wx + Math.cos(a) * R, wy, C.z + Math.sin(a) * R)
      : P(wx, wy + Math.cos(a) * R, C.z + Math.sin(a) * R);
  ctx.strokeStyle = '#90a4ae';
  ctx.lineWidth = 1.6 * s;
  ctx.beginPath();
  for (let i = 0; i <= 28; i++) {
    const p = wheel((i / 28) * Math.PI * 2);
    if (i) ctx.lineTo(p.x, p.y);
    else ctx.moveTo(p.x, p.y);
  }
  ctx.stroke();
  const c = along ? P(wx, wy, C.z) : P(wx, wy, C.z);
  ctx.lineWidth = 0.8 * s;
  for (let i = 0; i < 6; i++) {
    const p = wheel(spin + (i / 6) * Math.PI * 2);
    ctx.beginPath();
    ctx.moveTo(c.x, c.y);
    ctx.lineTo(p.x, p.y);
    ctx.stroke();
  }
  // il criceto corre nella ruota per un po', poi si riposa accanto
  const running = Math.floor(t / 6) % 2 === 0;
  const hp = running ? P(wx, wy, 9.5) : along ? P(x - w * 0.2, y, 9) : P(x, y - h * 0.2, 9);
  drawHamster(hp.x, hp.y, s, t, running);
  // rete sopra
  glassBox(x, y, w, h, 8, it.z || 30, 'rgba(220,230,240,0.10)');
  ctx.strokeStyle = 'rgba(180,190,200,0.55)';
  ctx.lineWidth = 0.6;
  for (let i = 1; i < 8; i++) {
    const a = P(x - w / 2 + (w * i) / 8, y + h / 2, 8),
      b = P(x - w / 2 + (w * i) / 8, y + h / 2, it.z || 30);
    ctx.beginPath();
    ctx.moveTo(a.x, a.y);
    ctx.lineTo(b.x, b.y);
    ctx.stroke();
  }
}

function drawHamster(px: number, py: number, s: number, t: number, running: boolean): void {
  const ctx = game.view.ctx;
  const bob = running ? Math.abs(Math.sin(t * 20)) * 1 * s : Math.sin(t * 3) * 0.3 * s;
  ctx.fillStyle = '#d7a26a';
  ctx.beginPath();
  ctx.ellipse(px, py - 3 * s - bob, 5 * s, 3.6 * s, 0, 0, 6.3);
  ctx.fill();
  ctx.fillStyle = '#fff3e0';
  ctx.beginPath();
  ctx.ellipse(px + 2 * s, py - 2.2 * s - bob, 2.6 * s, 2.2 * s, 0, 0, 6.3);
  ctx.fill();
  ctx.fillStyle = '#c48b55';
  ctx.beginPath();
  ctx.arc(px + 1.5 * s, py - 6.4 * s - bob, 1.3 * s, 0, 6.3);
  ctx.arc(px + 4.2 * s, py - 6 * s - bob, 1.3 * s, 0, 6.3);
  ctx.fill();
  ctx.fillStyle = '#111';
  ctx.beginPath();
  ctx.arc(px + 3.6 * s, py - 4.2 * s - bob, 0.6 * s, 0, 6.3);
  ctx.fill();
  ctx.fillStyle = '#f48fb1';
  ctx.beginPath();
  ctx.arc(px + 5 * s, py - 3.4 * s - bob, 0.5 * s, 0, 6.3);
  ctx.fill();
}

// ---------------------------------------------------------------- serpente

export function drawTerrarium(it: GameValue, t: number): void {
  const ctx = game.view.ctx;
  const s = isoScale();
  const { x, y } = it;
  const { w, h } = dims(it);
  const top = it.z || 34;
  box(x, y, w + 4, h + 4, 8, '#4e342e');
  box(x, y, w, h, 3, '#e0c38c', { z0: 8 });
  // sasso e ramo
  box(x - w * 0.28, y - h * 0.15, 10, 8, 5, '#9e9e9e', { z0: 11 });
  const r1 = P(x + w * 0.25, y - h * 0.3, 11),
    r2 = P(x + w * 0.05, y + h * 0.2, 22);
  ctx.strokeStyle = '#6d4c41';
  ctx.lineWidth = 2.2 * s;
  ctx.beginPath();
  ctx.moveTo(r1.x, r1.y);
  ctx.lineTo(r2.x, r2.y);
  ctx.stroke();
  // serpente che striscia avanti e indietro
  const along = w >= h;
  const L = (along ? w : h) * 0.62;
  const head = Math.sin(t * 0.35) * (along ? w : h) * 0.12;
  const pts: Pt[] = [];
  for (let i = 0; i <= 22; i++) {
    const u = i / 22;
    const a = head - L / 2 + u * L;
    const b = Math.sin(u * Math.PI * 2.2 - t * 2.4) * (along ? h : w) * 0.18;
    pts.push(along ? P(x + a, y + b, 12) : P(x + b, y + a, 12));
  }
  ctx.lineCap = 'round';
  ctx.strokeStyle = '#2e7d32';
  ctx.lineWidth = 4 * s;
  ctx.beginPath();
  pts.forEach((p, i) => (i ? ctx.lineTo(p.x, p.y) : ctx.moveTo(p.x, p.y)));
  ctx.stroke();
  ctx.strokeStyle = '#aed581';
  ctx.lineWidth = 1.2 * s;
  ctx.setLineDash([2 * s, 3 * s]);
  ctx.beginPath();
  pts.forEach((p, i) => (i ? ctx.lineTo(p.x, p.y) : ctx.moveTo(p.x, p.y)));
  ctx.stroke();
  ctx.setLineDash([]);
  const hp = pts[pts.length - 1],
    prev = pts[pts.length - 2];
  ctx.fillStyle = '#1b5e20';
  ctx.beginPath();
  ctx.ellipse(hp.x, hp.y, 3.4 * s, 2.4 * s, Math.atan2(hp.y - prev.y, hp.x - prev.x), 0, 6.3);
  ctx.fill();
  // lingua biforcuta ogni tanto
  if (Math.sin(t * 3) > 0.6) {
    const ang = Math.atan2(hp.y - prev.y, hp.x - prev.x);
    ctx.strokeStyle = '#e53935';
    ctx.lineWidth = 0.8 * s;
    const tx = hp.x + Math.cos(ang) * 6 * s,
      ty = hp.y + Math.sin(ang) * 6 * s;
    ctx.beginPath();
    ctx.moveTo(hp.x + Math.cos(ang) * 3 * s, hp.y + Math.sin(ang) * 3 * s);
    ctx.lineTo(tx, ty);
    ctx.lineTo(tx + Math.cos(ang + 0.5) * 2 * s, ty + Math.sin(ang + 0.5) * 2 * s);
    ctx.moveTo(tx, ty);
    ctx.lineTo(tx + Math.cos(ang - 0.5) * 2 * s, ty + Math.sin(ang - 0.5) * 2 * s);
    ctx.stroke();
  }
  ctx.lineCap = 'butt';
  // lampada riscaldante sul coperchio
  glassBox(x, y, w, h, 11, top, 'rgba(200,230,255,0.13)');
  box(x + w * 0.3, y, 10, 8, 3, '#424242', { z0: top });
  const lamp = P(x + w * 0.3, y, top - 1);
  ctx.fillStyle = 'rgba(255,170,60,0.35)';
  ctx.beginPath();
  ctx.arc(lamp.x, lamp.y, 7 * s, 0, 6.3);
  ctx.fill();
}

// ---------------------------------------------------------------- pesce

export function drawAquarium(it: GameValue, t: number): void {
  const ctx = game.view.ctx;
  const s = isoScale();
  const { x, y } = it;
  const { w, h } = dims(it);
  const top = it.z || 40;
  // mobiletto e fondo di ghiaia
  box(x, y, w + 4, h + 4, 14, '#37474f');
  const W0 = 16,
    WT = top - 4;
  box(x, y, w, h, 3, '#d7ccc8', { z0: 14 });
  // acqua (pareti di fondo)
  const x0 = x - w / 2,
    x1 = x + w / 2,
    y0 = y - h / 2,
    y1 = y + h / 2;
  poly([P(x0, y0, W0), P(x1, y0, W0), P(x1, y0, WT), P(x0, y0, WT)], 'rgba(41,128,185,0.45)');
  poly([P(x0, y0, W0), P(x0, y1, W0), P(x0, y1, WT), P(x0, y0, WT)], 'rgba(41,128,185,0.40)');
  // alghe che ondeggiano
  for (let i = 0; i < 3; i++) {
    const ax = x0 + w * (0.2 + i * 0.3),
      ay = y0 + h * 0.35;
    ctx.strokeStyle = '#43a047';
    ctx.lineWidth = 1.6 * s;
    ctx.beginPath();
    const b = P(ax, ay, W0 + 1);
    ctx.moveTo(b.x, b.y);
    for (let k = 1; k <= 5; k++) {
      const p = P(ax + Math.sin(t * 1.5 + k * 0.8 + i) * 1.5, ay, W0 + 1 + k * 3.5);
      ctx.lineTo(p.x, p.y);
    }
    ctx.stroke();
  }
  // pesci
  const along = w >= h;
  const span = (along ? w : h) / 2 - 7;
  for (let f = 0; f < 2; f++) {
    const ph = t * (0.5 + f * 0.18) + f * 2.1;
    const a = Math.sin(ph) * span;
    const dir = Math.cos(ph) >= 0 ? 1 : -1;
    const z = W0 + 7 + f * 6 + Math.sin(t * 1.3 + f) * 1.5;
    const b = (f - 0.5) * (along ? h : w) * 0.3;
    const fp = along ? P(x + a, y + b, z) : P(x + b, y + a, z);
    const nose = along ? P(x + a + dir, y + b, z) : P(x + b, y + a + dir, z);
    const face = nose.x >= fp.x ? 1 : -1;
    ctx.fillStyle = f ? '#ffca28' : '#ff7043';
    ctx.beginPath();
    ctx.ellipse(fp.x, fp.y, 4 * s, 2.4 * s, 0, 0, 6.3);
    ctx.fill();
    const wag = Math.sin(t * 10 + f) * 0.8 * s;
    ctx.beginPath();
    ctx.moveTo(fp.x - face * 3.5 * s, fp.y);
    ctx.lineTo(fp.x - face * 7 * s, fp.y - 2.5 * s + wag);
    ctx.lineTo(fp.x - face * 7 * s, fp.y + 2.5 * s + wag);
    ctx.fill();
    ctx.fillStyle = '#111';
    ctx.beginPath();
    ctx.arc(fp.x + face * 2.2 * s, fp.y - 0.6 * s, 0.6 * s, 0, 6.3);
    ctx.fill();
  }
  // bollicine
  for (let i = 0; i < 5; i++) {
    const k = (t * 0.4 + i / 5) % 1;
    const p = P(x1 - 6, y0 + h * 0.3, W0 + k * (WT - W0));
    ctx.strokeStyle = `rgba(255,255,255,${0.8 * (1 - k)})`;
    ctx.lineWidth = 0.8;
    ctx.beginPath();
    ctx.arc(p.x + Math.sin(t * 4 + i) * 1.2 * s, p.y, (0.8 + k) * s, 0, 6.3);
    ctx.stroke();
  }
  // acqua davanti e vetro
  poly([P(x0, y1, W0), P(x1, y1, W0), P(x1, y1, WT), P(x0, y1, WT)], 'rgba(79,195,247,0.22)');
  poly([P(x1, y0, W0), P(x1, y1, W0), P(x1, y1, WT), P(x1, y0, WT)], 'rgba(79,195,247,0.25)');
  poly([P(x0, y0, WT), P(x1, y0, WT), P(x1, y1, WT), P(x0, y1, WT)], 'rgba(129,212,250,0.35)');
  glassBox(x, y, w, h, 14, top, 'rgba(255,255,255,0.06)');
  box(x, y, w + 2, h + 2, 2, '#263238', { z0: top });
}

// ---------------------------------------------------------------- cane e gatto

export interface QuadOpts {
  moving: boolean;
  /** Direzione di marcia nel mondo (per girare la testa a destra o a sinistra sullo schermo). */
  dx: number;
  dy: number;
  /** Seduto (nel negozio, o quando aspetta). */
  sit?: boolean;
}

/** Cane o gatto a quattro zampe, visto di lato, che cammina, scodinzola e muove le orecchie. */
export function drawQuadruped(
  kind: 'dog' | 'cat',
  x: number,
  y: number,
  t: number,
  o: QuadOpts,
): void {
  const ctx = game.view.ctx;
  const s = isoScale();
  const g = P(x, y, 0);
  const ahead = P(x + o.dx, y + o.dy, 0);
  const f = Math.abs(ahead.x - g.x) < 0.01 ? 1 : ahead.x > g.x ? 1 : -1;
  const dog = kind === 'dog';
  const body = dog ? '#c68642' : '#f0932b';
  const dark = dog ? '#8d5524' : '#c56a10';
  ellipseShadow(x, y, 14, 7, 0.22);
  const phase = t * (dog ? 13 : 11);
  const legLen = (dog ? 8 : 7) * s;
  const by = g.y - legLen - (o.sit ? 0 : 3 * s);
  // zampe (le due dietro più scure)
  ctx.lineCap = 'round';
  ctx.lineWidth = 2.4 * s;
  const legs: [number, number, string][] = [
    [-7, 0, dark],
    [6, Math.PI, dark],
    [-5, Math.PI, body],
    [8, 0, body],
  ];
  for (const [ox, off, col] of legs) {
    const swing = o.moving ? Math.sin(phase + off) * 3 * s : 0;
    const lx = g.x + f * ox * s;
    ctx.strokeStyle = col;
    ctx.beginPath();
    if (o.sit && ox < 0) {
      // seduto: zampe dietro piegate
      ctx.moveTo(lx, by + 2 * s);
      ctx.lineTo(lx + f * 3 * s, g.y - 1 * s);
    } else {
      ctx.moveTo(lx, by + 2 * s);
      ctx.lineTo(lx + swing, g.y - 1 * s);
    }
    ctx.stroke();
  }
  // coda: il cane scodinzola, il gatto la tiene alta a punto interrogativo
  const tailBase = { x: g.x - f * 10 * s, y: by - (o.sit ? -2 : 1) * s };
  ctx.strokeStyle = dog ? body : dark;
  ctx.lineWidth = (dog ? 2.6 : 2.2) * s;
  ctx.beginPath();
  ctx.moveTo(tailBase.x, tailBase.y);
  if (dog) {
    const wag = Math.sin(t * (o.moving ? 14 : 9)) * 0.7;
    ctx.lineTo(
      tailBase.x - f * Math.cos(0.9 + wag) * 9 * s,
      tailBase.y - Math.sin(0.9 + wag) * 9 * s,
    );
  } else {
    const sway = Math.sin(t * 2.2) * 2 * s;
    ctx.bezierCurveTo(
      tailBase.x - f * 7 * s,
      tailBase.y - 4 * s,
      tailBase.x - f * 4 * s + sway,
      tailBase.y - 14 * s,
      tailBase.x - f * 9 * s + sway,
      tailBase.y - 16 * s,
    );
  }
  ctx.stroke();
  // corpo
  ctx.fillStyle = body;
  ctx.beginPath();
  ctx.ellipse(
    g.x - (o.sit ? f * 2 * s : 0),
    by - (o.sit ? 1 : 0) * s,
    (dog ? 11 : 10) * s,
    (dog ? 5.5 : 4.6) * s,
    o.sit ? -f * 0.35 : 0,
    0,
    6.3,
  );
  ctx.fill();
  if (!dog) {
    // strisce del gatto rosso
    ctx.strokeStyle = dark;
    ctx.lineWidth = 1 * s;
    for (let i = -1; i <= 1; i++) {
      ctx.beginPath();
      ctx.moveTo(g.x + i * 4 * s, by - 4 * s);
      ctx.lineTo(g.x + i * 4 * s - f * 1 * s, by - 1 * s);
      ctx.stroke();
    }
  }
  // collare e testa
  const hx = g.x + f * (dog ? 11 : 10) * s,
    hy = by - (o.sit ? 8 : 6) * s + (o.moving ? Math.abs(Math.sin(phase)) * -0.6 * s : 0);
  ctx.fillStyle = dog ? '#e53935' : '#3949ab';
  ctx.beginPath();
  ctx.ellipse(hx - f * 2.5 * s, hy + 3.2 * s, 2.2 * s, 3 * s, 0, 0, 6.3);
  ctx.fill();
  ctx.fillStyle = body;
  ctx.beginPath();
  ctx.arc(hx, hy, (dog ? 5.2 : 4.6) * s, 0, 6.3);
  ctx.fill();
  if (dog) {
    // muso, naso e orecchio a penzoloni
    ctx.fillStyle = '#e8b27a';
    ctx.beginPath();
    ctx.ellipse(hx + f * 4.2 * s, hy + 1.2 * s, 3.2 * s, 2.2 * s, 0, 0, 6.3);
    ctx.fill();
    ctx.fillStyle = '#222';
    ctx.beginPath();
    ctx.arc(hx + f * 6.8 * s, hy + 0.6 * s, 1.1 * s, 0, 6.3);
    ctx.fill();
    ctx.fillStyle = dark;
    ctx.beginPath();
    ctx.ellipse(
      hx - f * 1.8 * s,
      hy + 0.5 * s,
      1.8 * s,
      3.8 * s,
      f * 0.3 + Math.sin(t * 6) * 0.08,
      0,
      6.3,
    );
    ctx.fill();
  } else {
    // orecchie a punta, muso e baffi
    ctx.fillStyle = dark;
    for (const e of [-1, 1]) {
      const ex = hx + e * 2.4 * s;
      ctx.beginPath();
      ctx.moveTo(ex - 2 * s, hy - 3 * s);
      ctx.lineTo(ex + 0.2 * s, hy - 7.5 * s);
      ctx.lineTo(ex + 2 * s, hy - 2.5 * s);
      ctx.fill();
    }
    ctx.fillStyle = '#fff3e0';
    ctx.beginPath();
    ctx.ellipse(hx + f * 2.6 * s, hy + 1.6 * s, 2.2 * s, 1.6 * s, 0, 0, 6.3);
    ctx.fill();
    ctx.fillStyle = '#f48fb1';
    ctx.beginPath();
    ctx.arc(hx + f * 4.2 * s, hy + 1 * s, 0.7 * s, 0, 6.3);
    ctx.fill();
    ctx.strokeStyle = 'rgba(255,255,255,0.8)';
    ctx.lineWidth = 0.5;
    for (const d of [-1, 0, 1]) {
      ctx.beginPath();
      ctx.moveTo(hx + f * 4 * s, hy + 1.6 * s);
      ctx.lineTo(hx + f * 8.5 * s, hy + 1.6 * s + d * 1.4 * s);
      ctx.stroke();
    }
  }
  // occhio (ogni tanto sbatte le palpebre)
  const blink = (t + x * 0.01) % 4 < 0.12;
  ctx.fillStyle = '#111';
  ctx.beginPath();
  if (blink) ctx.fillRect(hx + f * 1.6 * s - 1 * s, hy - 1.2 * s, 2 * s, 0.6 * s);
  else ctx.arc(hx + f * 2 * s, hy - 1.2 * s, 0.9 * s, 0, 6.3);
  ctx.fill();
  ctx.lineCap = 'butt';
}

/** Punto del collare (per agganciare il guinzaglio). */
export function collarPoint(x: number, y: number, dx: number, dy: number): Pt {
  const s = isoScale();
  const g = P(x, y, 0);
  const ahead = P(x + dx, y + dy, 0);
  const f = ahead.x >= g.x ? 1 : -1;
  return { x: g.x + f * 8.5 * s, y: g.y - 12 * s };
}

/** Guinzaglio dalla mano del giocatore al collare del cane, un po' allentato. */
export function drawLeash(px: number, py: number, collar: Pt): void {
  const ctx = game.view.ctx;
  const s = isoScale();
  const hand = P(px, py, 30);
  const mx = (hand.x + collar.x) / 2,
    my = Math.max(hand.y, collar.y) + 8 * s;
  ctx.strokeStyle = '#c0392b';
  ctx.lineWidth = 1.4 * s;
  ctx.beginPath();
  ctx.moveTo(hand.x, hand.y);
  ctx.quadraticCurveTo(mx, my, collar.x, collar.y);
  ctx.stroke();
  ctx.fillStyle = '#7f8c8d';
  ctx.beginPath();
  ctx.arc(hand.x, hand.y, 1.6 * s, 0, 6.3);
  ctx.fill();
}

/** Fumetto sopra l'animale ("Bau! Bau!", "Miao!", "Gnam!"). */
export function drawPetBubble(x: number, y: number, z: number, text: string): void {
  const ctx = game.view.ctx;
  const p = P(x, y, z);
  ctx.font = 'bold 11px sans-serif';
  const w = ctx.measureText(text).width + 12;
  const bx = p.x - w / 2,
    by = p.y - 26;
  ctx.fillStyle = 'rgba(255,255,255,0.95)';
  ctx.strokeStyle = 'rgba(0,0,0,0.25)';
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.roundRect ? ctx.roundRect(bx, by, w, 18, 9) : ctx.rect(bx, by, w, 18);
  ctx.fill();
  ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(p.x - 4, by + 18);
  ctx.lineTo(p.x, by + 24);
  ctx.lineTo(p.x + 4, by + 18);
  ctx.fill();
  ctx.fillStyle = '#2d3436';
  ctx.textAlign = 'center';
  ctx.fillText(text, p.x, by + 13);
}

// ---------------------------------------------------------------- casette nella stanza e nel negozio

/** Casetta di un animale (gabbia, teca, acquario) con l'animale dentro. */
export function drawPetHome(kind: PetKind, it: GameValue, t: number): void {
  if (kind === 'bird') drawBirdCage(it, t);
  else if (kind === 'hamster') drawHamsterCage(it, t);
  else if (kind === 'snake') drawTerrarium(it, t);
  else if (kind === 'fish') drawAquarium(it, t);
}

/** Espositore del negozio: piedistallo con la casetta, o la cuccia con il cane/gatto seduto. */
export function drawShopPet(it: GameValue, t: number): void {
  const kind = it.pet as PetKind;
  if (kind === 'dog' || kind === 'cat') {
    // cuccia morbida
    box(it.x, it.y, it.w, it.h, 6, kind === 'dog' ? '#5d4037' : '#8e44ad', {
      top: kind === 'dog' ? '#a1887f' : '#d2b4de',
    });
    const lean = Math.sin(t * 0.5 + (kind === 'dog' ? 0 : 2));
    drawQuadruped(kind, it.x, it.y + 2, t, {
      moving: false,
      dx: lean >= 0 ? 1 : -1,
      dy: 0,
      sit: true,
    });
    return;
  }
  drawPetHome(kind, it, t);
}
