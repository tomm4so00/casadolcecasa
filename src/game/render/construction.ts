// Cantiere: gru a torre con il carico appeso, betoniera, bancali di mattoni, coni con il nastro,
// ponteggio, carriola, mucchio di sabbia e i due punti di lavoro (trave sui cavalletti, pannello).
import type { GameValue } from '../context.js';
import { game } from '../context.js';
import { isoProject, isoScale, poly, rnd, setPlane } from './primitives.js';
import { box, ellipseShadow, onFace, resetPlane, softShadow, woodGrain } from './objects.js';

type V3 = [number, number, number];

/** Segmento nello spazio (tubi, funi, tralicci). */
function line3(a: V3, b: V3, color: string, width: number): void {
  const ctx = game.view.ctx;
  const p = isoProject(a[0], a[1], a[2]),
    q = isoProject(b[0], b[1], b[2]);
  ctx.strokeStyle = color;
  ctx.lineWidth = width * isoScale();
  ctx.beginPath();
  ctx.moveTo(p.x, p.y);
  ctx.lineTo(q.x, q.y);
  ctx.stroke();
}

/** Cerchio su un piano verticale (ruote) o inclinato: `u` e `v` sono gli assi del piano. */
function disc(
  c: V3,
  u: V3,
  v: V3,
  r: number,
  fill: string | CanvasGradient,
  stroke?: string,
): void {
  const ctx = game.view.ctx;
  setPlane(c, u, v);
  try {
    ctx.beginPath();
    ctx.arc(0, 0, r, 0, Math.PI * 2);
    ctx.fillStyle = fill;
    ctx.fill();
    if (stroke) {
      ctx.strokeStyle = stroke;
      ctx.lineWidth = 1;
      ctx.stroke();
    }
  } finally {
    resetPlane();
  }
}

/**
 * Traliccio tra quattro correnti: `a` e `b` gli estremi dell'asse, `s1` e `s2` i due spostamenti
 * dalla linea centrale che fanno i quattro spigoli. Prima i lati lontani, più scuri.
 */
function lattice(a: V3, b: V3, s1: V3, s2: V3, step: number, color: string, dark: string): void {
  const len = Math.hypot(b[0] - a[0], b[1] - a[1], b[2] - a[2]);
  const n = Math.max(1, Math.round(len / step));
  const at = (k: number, o1: number, o2: number): V3 => [
    a[0] + (b[0] - a[0]) * k + s1[0] * o1 + s2[0] * o2,
    a[1] + (b[1] - a[1]) * k + s1[1] * o1 + s2[1] * o2,
    a[2] + (b[2] - a[2]) * k + s1[2] * o1 + s2[2] * o2,
  ];
  const corners: [number, number][] = [
    [-1, -1],
    [1, -1],
    [-1, 1],
    [1, 1],
  ];
  // spigolo più vicino a chi guarda: quello con x + y più grande
  const near = (c: [number, number]) => {
    const p = at(0.5, c[0], c[1]);
    return p[0] + p[1] + p[2] * 0.01;
  };
  const order = [...corners].sort((p, q) => near(p) - near(q));
  const faces: [[number, number], [number, number]][] = [
    [corners[0], corners[1]],
    [corners[2], corners[3]],
    [corners[0], corners[2]],
    [corners[1], corners[3]],
  ];
  faces.sort((f, g) => near(f[0]) + near(f[1]) - (near(g[0]) + near(g[1])));
  faces.forEach((f, fi) => {
    const col = fi < 2 ? dark : color;
    for (let i = 0; i < n; i++) {
      const k0 = i / n,
        k1 = (i + 1) / n;
      line3(at(k0, ...f[i % 2]), at(k1, ...f[(i + 1) % 2]), col, 0.9);
      line3(at(k0, ...f[0]), at(k0, ...f[1]), col, 0.7);
    }
  });
  order.forEach((c, ci) => line3(at(0, ...c), at(1, ...c), ci === 0 ? dark : color, 1.8));
}

// ---------------------------------------------------------------- gru a torre
export function drawCraneProp(it?: GameValue, t?: GameValue): GameValue {
  const { x, y } = it;
  const time: number = t || 0;
  const yellow = '#f4c20d',
    dark = '#9a7b0a';
  // plinto di cemento con le zavorre
  box(x, y, 44, 44, 8, '#8e979c', { top: '#a7b0b4' });
  for (const [dx, dy] of [
    [-11, -11],
    [11, -11],
    [-11, 11],
    [11, 11],
  ])
    box(x + dx, y + dy, 16, 16, 8, '#7b8489', { z0: 8, top: '#959ea3' });
  const H = 150;
  // torre a traliccio
  lattice([x, y, 16], [x, y, H], [7, 0, 0], [0, 7, 0], 14, yellow, dark);
  // ralla, cabina del gruista e cuspide
  box(x, y, 20, 20, 6, '#4b5257', { z0: H });
  const cab = box(x + 10, y + 9, 14, 13, 14, '#e8e8e8', { z0: H - 14, top: '#cfcfcf' });
  onFace(cab, 'left', (W: number, FH: number): void => {
    const ctx = game.view.ctx;
    ctx.fillStyle = '#8fd3fe';
    ctx.fillRect(2, 2, W - 4, FH * 0.6);
    ctx.fillStyle = 'rgba(255,255,255,0.5)';
    ctx.fillRect(3, 3, 3, FH * 0.5);
  });
  onFace(cab, 'right', (W: number, FH: number): void => {
    const ctx = game.view.ctx;
    ctx.fillStyle = '#6fb6e0';
    ctx.fillRect(2, 2, W - 4, FH * 0.6);
  });
  const top: V3 = [x, y, H + 40];
  // controbraccio con i contrappesi
  lattice([x - 8, y, H + 8], [x - 52, y, H + 8], [0, 4, 0], [0, 0, 3], 11, yellow, dark);
  box(x - 46, y, 14, 12, 18, '#7f8c8d', { z0: H - 6, top: '#95a5a6' });
  box(x - 32, y, 10, 12, 14, '#7f8c8d', { z0: H - 2, top: '#95a5a6' });
  // cuspide e tiranti
  lattice([x, y, H + 6], top, [3, 0, 0], [0, 3, 0], 12, yellow, dark);
  line3(top, [x - 52, y, H + 11], '#2d3436', 0.8);
  line3(top, [x + 120, y, H + 14], '#2d3436', 0.8);
  // braccio
  lattice([x + 8, y, H + 10], [x + 175, y, H + 10], [0, 4, 0], [0, 0, 4], 12, yellow, dark);
  // carrello che va avanti e indietro e il carico appeso alle funi
  const tx = x + 95 + Math.sin(time * 0.35) * 45;
  box(tx, y, 10, 10, 4, '#2d3436', { z0: H + 4 });
  const sway = Math.sin(time * 0.9) * 3;
  const hookZ = 96 + Math.sin(time * 0.35 + 1) * 10;
  const hook: V3 = [tx + sway, y, hookZ];
  line3([tx - 2, y, H + 4], [hook[0] - 1, y, hook[2]], '#2d3436', 0.8);
  line3([tx + 2, y, H + 4], [hook[0] + 1, y, hook[2]], '#2d3436', 0.8);
  box(hook[0], y, 4, 4, 5, '#e67e22', { z0: hookZ - 5 });
  const lz = hookZ - 30;
  for (const [dx, dy] of [
    [-9, -9],
    [9, -9],
    [-9, 9],
    [9, 9],
  ])
    line3([hook[0], y, hookZ - 5], [hook[0] + dx, y + dy, lz + 16], '#555', 0.6);
  box(hook[0], y, 22, 22, 3, '#a0784e', { z0: lz });
  const load = box(hook[0], y, 20, 20, 13, '#b5523b', { z0: lz + 3 });
  onFace(load, 'left', (W: number, FH: number) => bricks(W, FH, '#b5523b', 3));
  onFace(load, 'right', (W: number, FH: number) => bricks(W, FH, '#9e4532', 4));
  // ombra del carico per terra
  ellipseShadow(hook[0], y, 14, 7, 0.18);
}

// ---------------------------------------------------------------- mattoni
/** Mattoni sulla faccia, ognuno di un colore leggermente diverso, con le fughe. */
function bricks(W: number, H: number, color: string, seed: number): void {
  const ctx = game.view.ctx;
  ctx.fillStyle = 'rgba(70,40,30,0.9)';
  ctx.fillRect(0, 0, W, H);
  const bw = 8,
    bh = 4;
  for (let r = 0, v = 0; v < H; r++, v += bh)
    for (let u = r % 2 ? -bw / 2 : 0, i = 0; u < W; u += bw, i++) {
      const k = rnd(seed * 37 + r * 11 + i);
      ctx.fillStyle = k > 0.5 ? game.darken(color, k * 0.18) : game.lighten(color, k * 0.15);
      ctx.fillRect(u + 0.5, v + 0.5, bw - 1, bh - 1);
    }
}

/** Bancale di legno: tre traverse e le assi sopra, con le fessure. */
function pallet(x: number, y: number, w: number, h: number, z0 = 0): void {
  for (const k of [-1, 0, 1]) box(x, y + (k * (h - 6)) / 2, w, 6, 4, '#7a5530', { z0 });
  for (let i = 0, n = Math.round(w / 9); i < n; i++)
    box(x - w / 2 + (i + 0.5) * (w / n), y, w / n - 2, h, 2, '#b08355', {
      z0: z0 + 4,
      top: '#c49a6c',
    });
}

export function drawBricksProp(it?: GameValue): GameValue {
  const { x, y, w, h } = it;
  pallet(x, y, w, h);
  const st = box(x, y, w - 6, h - 6, 26, '#b5523b', { z0: 6, top: '#c0614a' });
  onFace(st, 'left', (W: number, H: number) => bricks(W, H, '#b5523b', x));
  onFace(st, 'right', (W: number, H: number) => bricks(W, H, '#9e4532', y));
  onFace(st, 'top', (W: number, H: number): void => {
    const ctx = game.view.ctx;
    ctx.strokeStyle = 'rgba(70,40,30,0.5)';
    ctx.lineWidth = 0.8;
    for (let u = 8; u < W; u += 8) {
      ctx.beginPath();
      ctx.moveTo(u, 0);
      ctx.lineTo(u, H);
      ctx.stroke();
    }
    // reggette
    ctx.fillStyle = 'rgba(40,40,40,0.7)';
    ctx.fillRect(W * 0.3, 0, 1.5, H);
    ctx.fillRect(W * 0.7, 0, 1.5, H);
  });
  // le reggette scendono anche sui fianchi
  onFace(st, 'left', (W: number, H: number): void => {
    game.view.ctx.fillStyle = 'rgba(40,40,40,0.7)';
    game.view.ctx.fillRect(W * 0.3, 0, 1.5, H);
    game.view.ctx.fillRect(W * 0.7, 0, 1.5, H);
  });
}

/** Per i disegni di prima che riempiono una faccia di mattoni (vedi la manifest v8). */
export function brickPattern(W?: GameValue, H?: GameValue): GameValue {
  bricks(W, H, '#b5523b', 1);
}

// ---------------------------------------------------------------- betoniera
export function drawMixerProp(it?: GameValue, t?: GameValue): GameValue {
  const ctx = game.view.ctx;
  const { x, y } = it;
  const time: number = t || 0;
  // telaio, ruote e motore
  box(x - 2, y, 30, 22, 4, '#3d4448', { z0: 8 });
  for (const sy of [-12, 12]) {
    const g = ctx.createRadialGradient(0, 0, 1, 0, 0, 8);
    g.addColorStop(0, '#7f8c8d');
    g.addColorStop(0.45, '#2d3436');
    g.addColorStop(1, '#1e2324');
    disc([x - 12, y + sy, 8], [1, 0, 0], [0, 0, -1], 8, g, '#111');
  }
  box(x + 14, y + 1, 4, 4, 10, '#3d4448'); // piede
  const motor = box(x - 12, y - 6, 12, 10, 12, '#e67e22', { z0: 12 });
  onFace(motor, 'left', (W: number, H: number): void => {
    ctx.fillStyle = 'rgba(0,0,0,0.35)';
    for (let u = 2; u < W - 1; u += 3) ctx.fillRect(u, 3, 1.5, H - 6);
  });
  // forcella che tiene il tamburo
  line3([x - 4, y - 10, 12], [x, y - 10, 30], '#3d4448', 2.5);
  line3([x - 4, y + 10, 12], [x, y + 10, 30], '#3d4448', 2.5);
  // tamburo inclinato: tanti dischi uno davanti all'altro, dal fondo alla bocca
  const a = 0.62; // inclinazione
  const d: V3 = [Math.cos(a), 0, Math.sin(a)];
  const v: V3 = [-Math.sin(a), 0, Math.cos(a)]; // "su" nel piano del disco
  const c0: V3 = [x - 14, y, 22];
  const L = 34;
  const radius = (k: number) => (k < 0.45 ? 10 + (k / 0.45) * 7 : 17 - ((k - 0.45) / 0.55) * 8);
  const spin = time * 2.2;
  for (let i = 0; i <= L; i++) {
    const k = i / L;
    const r = radius(k);
    const c: V3 = [c0[0] + d[0] * i, c0[1], c0[2] + d[2] * i];
    setPlane(c, [0, 1, 0], [-v[0], -v[1], -v[2]]);
    try {
      const g = ctx.createLinearGradient(0, -r, 0, r);
      g.addColorStop(0, '#ffb347');
      g.addColorStop(0.5, '#f39c12');
      g.addColorStop(1, '#b9650f');
      ctx.fillStyle = i === Math.round(L * 0.45) ? '#8e4e0b' : g;
      ctx.beginPath();
      ctx.arc(0, 0, r, 0, Math.PI * 2);
      ctx.fill();
      // eliche a spirale sul fianco: si vedono girare
      if (i % 3 === 0) {
        const ph = spin + i * 0.45;
        ctx.strokeStyle = 'rgba(120,60,0,0.55)';
        ctx.lineWidth = 1.6;
        ctx.beginPath();
        ctx.arc(0, 0, r - 0.6, ph, ph + 0.7);
        ctx.stroke();
      }
      if (i === L) {
        // bocca con il cemento dentro
        ctx.fillStyle = '#3b2a1a';
        ctx.beginPath();
        ctx.arc(0, 0, r * 0.82, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = '#9a9a92';
        ctx.beginPath();
        ctx.arc(0, r * 0.25, r * 0.55, 0, Math.PI * 2);
        ctx.fill();
      }
    } finally {
      resetPlane();
    }
  }
  // volantino per inclinare il tamburo
  disc([x + 6, y + 14, 26], [1, 0, 0], [0, 0, -1], 4, 'rgba(0,0,0,0)', '#2d3436');
}

// ---------------------------------------------------------------- coni e nastro
export function drawConeProp(it?: GameValue): GameValue {
  const ctx = game.view.ctx;
  const { x, y } = it;
  const s = isoScale();
  box(x, y, 13, 13, 2, '#2d3436', { top: '#3d4448' });
  const R = 6,
    Hc = 24;
  const at = (z: number) => {
    const r = R * (1 - (z - 2) / (Hc - 2));
    const l = isoProject(x - r * 0.707, y + r * 0.707, z),
      rr = isoProject(x + r * 0.707, y - r * 0.707, z);
    return [l, rr];
  };
  const [bl, br] = at(2);
  const tip = isoProject(x, y, Hc);
  const g = ctx.createLinearGradient(bl.x, 0, br.x, 0);
  g.addColorStop(0, '#ffa35c');
  g.addColorStop(0.45, '#ff7f27');
  g.addColorStop(1, '#c4520c');
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.moveTo(tip.x, tip.y);
  ctx.lineTo(bl.x, bl.y);
  ctx.quadraticCurveTo((bl.x + br.x) / 2, bl.y + 3.5 * s, br.x, br.y);
  ctx.closePath();
  ctx.fill();
  // due fasce bianche catarifrangenti
  for (const [z1, z2] of [
    [7, 10],
    [14, 16.5],
  ]) {
    const [a1, b1] = at(z1),
      [a2, b2] = at(z2);
    ctx.fillStyle = 'rgba(245,245,245,0.95)';
    ctx.beginPath();
    ctx.moveTo(a1.x, a1.y);
    ctx.quadraticCurveTo((a1.x + b1.x) / 2, a1.y + 3 * s, b1.x, b1.y);
    ctx.lineTo(b2.x, b2.y);
    ctx.quadraticCurveTo((a2.x + b2.x) / 2, a2.y + 2.5 * s, a2.x, a2.y);
    ctx.closePath();
    ctx.fill();
  }
}

/** Nastro bianco e rosso teso tra due punti (ax,ay) e (bx,by), un po' cadente. */
export function drawBarrierTapeProp(it?: GameValue): GameValue {
  const { ax, ay, bx, by } = it;
  const z = it.tapeZ || 17;
  const n = 14;
  for (let i = 0; i < n; i++) {
    const k0 = i / n,
      k1 = (i + 1) / n;
    const sag = (k: number) => z - Math.sin(k * Math.PI) * 4;
    line3(
      [ax + (bx - ax) * k0, ay + (by - ay) * k0, sag(k0)],
      [ax + (bx - ax) * k1, ay + (by - ay) * k1, sag(k1)],
      i % 2 ? '#ffffff' : '#e74c3c',
      2.2,
    );
  }
}

// ---------------------------------------------------------------- ponteggio
export function drawScaffoldProp(it?: GameValue): GameValue {
  const { x, y, w, h } = it;
  const H: number = it.z || 130;
  const tube = '#9aa3a8',
    tubeDark = '#6f777b';
  const xs = [x - w / 2, x - w / 6, x + w / 6, x + w / 2];
  const ys = [y - h / 2, y + h / 2];
  const levels = [0, H * 0.36, H * 0.7, H];
  // montanti dietro, poi tavole e montanti davanti
  for (const px of xs) line3([px, ys[0], 0], [px, ys[0], H], tubeDark, 1.6);
  for (const lz of levels.slice(1)) {
    line3([xs[0], ys[0], lz], [xs[3], ys[0], lz], tubeDark, 1.2);
    if (lz < H) box(x, y, w, h - 2, 2.5, '#b08355', { z0: lz - 2.5, top: '#c99c6a' });
    for (const px of xs) line3([px, ys[0], lz], [px, ys[1], lz], tube, 1);
  }
  // diagonali sul davanti
  for (let i = 0; i < 3; i++)
    line3(
      [xs[i], ys[1], levels[i % 2 ? 1 : 0]],
      [xs[i + 1], ys[1], levels[i % 2 ? 0 : 1] + 40],
      tube,
      1,
    );
  for (const px of xs) line3([px, ys[1], 0], [px, ys[1], H], tube, 1.8);
  for (const lz of levels.slice(1)) {
    line3([xs[0], ys[1], lz], [xs[3], ys[1], lz], tube, 1.3);
    // tavola fermapiede
    line3([xs[0], ys[1], lz + 6], [xs[3], ys[1], lz + 6], '#e67e22', 1.4);
  }
  // basette
  for (const px of xs) for (const py of ys) box(px, py, 5, 5, 1.5, '#555');
}

// ---------------------------------------------------------------- carriola e sabbia
export function drawWheelbarrowProp(it?: GameValue): GameValue {
  const ctx = game.view.ctx;
  const { x, y } = it;
  // ruota davanti
  const g = ctx.createRadialGradient(0, 0, 1, 0, 0, 6);
  g.addColorStop(0, '#95a5a6');
  g.addColorStop(0.5, '#2d3436');
  g.addColorStop(1, '#151a1b');
  disc([x + 15, y, 6], [1, 0, 0], [0, 0, -1], 6, g, '#111');
  // gambe e stanghe
  line3([x - 8, y - 6, 0], [x - 6, y - 6, 12], '#3d4448', 1.6);
  line3([x - 8, y + 6, 0], [x - 6, y + 6, 12], '#3d4448', 1.6);
  line3([x + 15, y - 5, 6], [x - 26, y - 7, 18], '#2d3436', 1.8);
  line3([x + 15, y + 5, 6], [x - 26, y + 7, 18], '#2d3436', 1.8);
  // vasca verde con la sabbia
  const tub = box(x, y, 26, 18, 9, '#27ae60', { z0: 10, top: '#c9a66b' });
  onFace(tub, 'left', (W: number): void => {
    ctx.fillStyle = 'rgba(255,255,255,0.15)';
    ctx.fillRect(0, 0, W, 2);
  });
  ellipseShadow(x + 4, y, 18, 9, 0.12);
}

export function drawSandPileProp(it?: GameValue): GameValue {
  const ctx = game.view.ctx;
  const { x, y, w } = it;
  const R: number = w / 2;
  // mucchio: dischi sempre più piccoli salendo, più chiari in cima
  for (let i = 0; i <= 14; i++) {
    const k = i / 14;
    const r = R * Math.cos(k * 1.35);
    setPlane([x, y, k * 22], [1, 0, 0], [0, 1, 0]);
    try {
      ctx.fillStyle = game.lighten('#c49a55', k * 0.25);
      ctx.beginPath();
      ctx.arc(0, 0, r, 0, Math.PI * 2);
      ctx.fill();
      if (i === 0) {
        ctx.fillStyle = 'rgba(0,0,0,0.12)';
        ctx.beginPath();
        ctx.arc(2, 2, r + 2, 0, Math.PI * 2);
        ctx.fill();
      }
    } finally {
      resetPlane();
    }
  }
  // granelli
  for (let i = 0; i < 24; i++) {
    const a = rnd(i + x) * 6.28,
      d = rnd(i * 7 + y) * R * 0.8;
    const p = isoProject(x + Math.cos(a) * d, y + Math.sin(a) * d, (1 - d / R) * 18);
    ctx.fillStyle = 'rgba(90,60,20,0.35)';
    ctx.fillRect(p.x, p.y, 1.2, 1.2);
  }
  // pala piantata nel mucchio
  line3([x + 4, y + 2, 14], [x + 12, y + 6, 50], '#8d5a2b', 2);
  poly(
    [
      isoProject(x + 1, y, 18),
      isoProject(x + 7, y + 3, 18),
      isoProject(x + 6, y + 3, 6),
      isoProject(x + 2, y + 1, 6),
    ],
    '#7f8c8d',
    'rgba(0,0,0,0.4)',
  );
}

// ---------------------------------------------------------------- punti di lavoro
/** Trave di legno sui due cavalletti (dove si pianta il chiodo). */
export function drawBeamTarget(tg: GameValue): void {
  const ctx = game.view.ctx;
  const { x, y, w } = tg;
  softShadow(x, y, w, 18);
  for (const ex of [x - w / 2 + 10, x + w / 2 - 10]) {
    for (const sy of [-7, 7]) line3([ex - 5, y + sy, 0], [ex, y + sy * 0.4, 20], '#6d4c2f', 2);
    for (const sy of [-7, 7]) line3([ex + 5, y + sy, 0], [ex, y + sy * 0.4, 20], '#6d4c2f', 2);
    box(ex, y, 6, 16, 3, '#7a5530', { z0: 19 });
  }
  const beam = box(x, y, w, 12, 9, '#a9743a', { z0: 22, top: '#c48c4c' });
  onFace(beam, 'left', (W: number, H: number) => woodGrain(W, H, 'rgba(80,45,10,0.35)', false, 4));
  onFace(beam, 'top', (W: number, H: number) => woodGrain(W, H, 'rgba(80,45,10,0.3)', false, 4));
  onFace(beam, 'right', (W: number, H: number): void => {
    // anelli del legno sulla testa della trave
    ctx.strokeStyle = 'rgba(80,45,10,0.45)';
    ctx.lineWidth = 0.6;
    for (let r = 1.5; r < 6; r += 1.5) {
      ctx.beginPath();
      ctx.ellipse(W / 2, H / 2, r * 1.3, r, 0, 0, Math.PI * 2);
      ctx.stroke();
    }
  });
  // chiodi già piantati
  for (const k of [0.2, 0.35]) {
    const p = isoProject(x - w / 2 + w * k, y, 31.5);
    ctx.fillStyle = '#5d6d7e';
    ctx.beginPath();
    ctx.arc(p.x, p.y, 1.2 * isoScale(), 0, Math.PI * 2);
    ctx.fill();
  }
}

/** Pannello di cartongesso sul suo supporto (dove si avvita). */
export function drawPanelTarget(tg: GameValue): void {
  const ctx = game.view.ctx;
  const { x, y, w } = tg;
  softShadow(x, y, w, 14);
  // piedi e montanti del supporto
  for (const ex of [x - w / 2 + 3, x + w / 2 - 3]) {
    box(ex, y, 4, 16, 2, '#4b5257');
    box(ex, y, 3, 3, 46, '#6f777b', { z0: 2 });
  }
  const p = box(x, y, w - 8, 3, 38, '#dfe3e6', { z0: 6, top: '#eef1f3' });
  onFace(p, 'left', (W: number, H: number): void => {
    // giunti con il nastro e le viti già messe
    ctx.fillStyle = 'rgba(0,0,0,0.06)';
    ctx.fillRect(W / 2 - 2, 0, 4, H);
    ctx.fillStyle = '#7f8c8d';
    for (let v = 5; v < H; v += 9)
      for (const u of [3, W / 2 - 5, W / 2 + 5, W - 3]) {
        ctx.beginPath();
        ctx.arc(u, v, 0.7, 0, Math.PI * 2);
        ctx.fill();
      }
  });
}
