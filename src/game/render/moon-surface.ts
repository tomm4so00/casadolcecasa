// Luna: cielo dello spazio, suolo, crateri, massi e bandiera. La luce del Sole arriva da sinistra
// in alto (verso le x negative): ogni cosa ha il lato chiaro da quella parte e l'ombra dall'altra.
import { type GameValue, game } from '../context.js';
import { isoProject, isoScale, poly, rnd } from './primitives.js';
import { box } from './objects.js';

/** Direzione da cui arriva la luce, normalizzata (x, y sul suolo e z in alto). */
const LIGHT = (() => {
  const v = [-0.62, -0.2, 0.76];
  const n = Math.hypot(v[0], v[1], v[2]);
  return v.map((c) => c / n) as [number, number, number];
})();

/**
 * Numero casuale stabile per l'elemento i di una serie. rnd da solo, con argomenti in fila
 * (i * 1.13, i * 2.71…), mette i punti su righe regolari: annidato non si vede più nessuno schema.
 */
const scatter = (i: number, k: number) => rnd(rnd(i * 0.7319 + k) * 9301.7 + k * 17.3);

const rgb = (r: number, g: number, b: number) =>
  `rgb(${Math.round(r)},${Math.round(g)},${Math.round(b)})`;

/** Contorno di un cerchio sul suolo (segue la curva della luna). */
function groundRing(cx: number, cy: number, rx: number, ry = rx, z = 0.5, steps = 28): void {
  const ctx = game.view.ctx;
  ctx.beginPath();
  for (let i = 0; i <= steps; i++) {
    const a = (i / steps) * Math.PI * 2;
    const p = isoProject(cx + Math.cos(a) * rx, cy + Math.sin(a) * ry, z);
    if (i) ctx.lineTo(p.x, p.y);
    else ctx.moveTo(p.x, p.y);
  }
  ctx.closePath();
}

/** Cratere visto dall'alto: bordo chiaro dal lato del Sole, conca con l'ombra dalla stessa parte. */
function craterShape(x: number, y: number, r: number, rays: boolean): void {
  const ctx = game.view.ctx;
  const steps = r > 12 ? 28 : 14;
  // raggiera di detriti chiari intorno ai crateri giovani
  if (rays) {
    ctx.fillStyle = 'rgba(232,232,222,0.09)';
    groundRing(x, y, r * 1.9, r * 1.9, 0.3, steps);
    ctx.fill();
    ctx.fillStyle = 'rgba(236,236,228,0.13)';
    for (let i = 0; i < 11; i++) {
      const a = rnd(x + i * 3.3) * Math.PI * 2;
      const len = r * (1.6 + rnd(y + i * 7.1) * 1.4);
      const w = 0.07 + rnd(i + x * 0.1) * 0.06;
      const p0 = isoProject(x + Math.cos(a - w) * r, y + Math.sin(a - w) * r, 0.4);
      const p1 = isoProject(x + Math.cos(a) * len, y + Math.sin(a) * len, 0.4);
      const p2 = isoProject(x + Math.cos(a + w) * r, y + Math.sin(a + w) * r, 0.4);
      ctx.beginPath();
      ctx.moveTo(p0.x, p0.y);
      ctx.lineTo(p1.x, p1.y);
      ctx.lineTo(p2.x, p2.y);
      ctx.closePath();
      ctx.fill();
    }
  }
  // bordo rialzato: chiaro verso il Sole, scuro dall'altra parte
  const west = isoProject(x - r * 1.2, y - r * 0.4, 0),
    east = isoProject(x + r * 1.2, y + r * 0.4, 0);
  const rim = ctx.createLinearGradient(west.x, west.y, east.x, east.y);
  rim.addColorStop(0, '#e2e2d8');
  rim.addColorStop(0.5, '#b4b4ab');
  rim.addColorStop(1, '#7d7d76');
  ctx.fillStyle = rim;
  groundRing(x, y, r * 1.18, r * 1.18, 0.5, steps);
  ctx.fill();
  // conca: tutta in ombra, poi la parete che guarda il Sole (dalla parte opposta) si illumina
  ctx.fillStyle = '#4f4f4a';
  groundRing(x, y, r, r, 0.5, steps);
  ctx.fill();
  ctx.save();
  groundRing(x, y, r, r, 0.5, steps);
  ctx.clip();
  ctx.fillStyle = '#8a8a83';
  groundRing(x + r * 0.34, y + r * 0.1, r * 0.92, r * 0.92, 0.5, steps);
  ctx.fill();
  ctx.fillStyle = '#9b9b93';
  groundRing(x + r * 0.42, y + r * 0.14, r * 0.55, r * 0.55, 0.5, steps);
  ctx.fill();
  ctx.restore();
}

/** Raggio della sfera lunare: surfaceDrop (camera.ts) usa moonCurve = 1 / (2 · raggio). */
export function moonRadius(): number {
  return 1 / (2 * (game.moonCurve || 1 / 1600));
}

// Questa proiezione è una vista di sbieco senza prospettiva: la telecamera guarda lungo
// (1, 1, 1) e una sfera di raggio R diventa un cerchio di raggio R·√1.5 sullo schermo.
const ISO = Math.sqrt(1.5),
  SQ2 = Math.SQRT2,
  SQ3 = Math.sqrt(3),
  SQ6 = Math.sqrt(6);

/** Quanto il punto (x, y) della sfera guarda verso la telecamera: ≤ 0 = oltre l'orizzonte. */
function facing(x: number, y: number, R: number): number {
  const q = R * R - x * x - y * y;
  return q <= 0 ? -1 : (x + y + Math.sqrt(q)) / (SQ3 * R);
}

/** Rumore morbido fra 0 e 1: macchie grandi e sfumate, sempre uguali nello stesso punto. */
function smoothNoise(x: number, y: number): number {
  const xi = Math.floor(x),
    yi = Math.floor(y);
  const fx = x - xi,
    fy = y - yi;
  const u = fx * fx * (3 - 2 * fx),
    v = fy * fy * (3 - 2 * fy);
  const h = (i: number, j: number) => rnd(i * 57.31 + j * 131.77 + 0.5);
  const a = h(xi, yi) + (h(xi + 1, yi) - h(xi, yi)) * u;
  const b = h(xi, yi + 1) + (h(xi + 1, yi + 1) - h(xi, yi + 1)) * u;
  return a + (b - a) * v;
}

/** Quanto è "mare" (pianura scura di lava antica) un punto del suolo: 0 = altopiano chiaro. */
function mare(x: number, y: number): number {
  const n =
    0.6 * smoothNoise(x / 260 + 3.1, y / 260 + 7.7) +
    0.3 * smoothNoise(x / 90 + 1.3, y / 90) +
    0.1 * smoothNoise(x / 30, y / 30 + 5);
  return Math.max(0, Math.min(1, (n - 0.5) * 2.6));
}

/**
 * La sfera lunare, due pixel alla volta: per ogni punto dello schermo si trova il punto della
 * sfera che si vede, con la sua luce (dal Sole a sinistra) e i suoi mari. Fuori dal disco resta
 * trasparente e si vede lo spazio.
 */
function paintSphere(R: number): void {
  const ctx = game.view.ctx;
  const s = isoScale();
  const o = isoProject(0, 0, 0);
  const dc = { x: o.x, y: o.y + R * s },
    dr = R * ISO * s;
  const x0 = Math.max(0, Math.floor(dc.x - dr)),
    x1 = Math.min(ctx.canvas.width, Math.ceil(dc.x + dr)),
    y0 = Math.max(0, Math.floor(dc.y - dr - 40 * s)),
    y1 = Math.min(ctx.canvas.height, Math.ceil(dc.y + dr));
  if (x1 <= x0 || y1 <= y0) return;
  const step = 2;
  const w = Math.ceil((x1 - x0) / step),
    h = Math.ceil((y1 - y0) / step);
  const small = document.createElement('canvas');
  small.width = w;
  small.height = h;
  const sctx = small.getContext('2d')!;
  const img = sctx.createImageData(w, h);
  const px = img.data;
  const k = 1 / (s * ISO);
  for (let j = 0; j < h; j++) {
    const b = (y0 + (j + 0.5) * step - dc.y) * k;
    for (let i = 0; i < w; i++) {
      const a = (x0 + (i + 0.5) * step - dc.x) * k;
      const q = R * R - a * a - b * b;
      if (q <= 0) continue;
      const c = Math.sqrt(q);
      // il punto della sfera (rispetto al centro) e la sua normale
      const X = a / SQ2 + b / SQ6 + c / SQ3,
        Y = -a / SQ2 + b / SQ6 + c / SQ3,
        Z = (-2 * b) / SQ6 + c / SQ3;
      const lit = Math.max(0, (X * LIGHT[0] + Y * LIGHT[1] + Z * LIGHT[2]) / R) / LIGHT[2];
      const shade = 0.08 + 0.92 * Math.min(1.2, lit);
      const m = mare(X, Y);
      const grain = 1 + (rnd(i * 0.37 + j * 1.91 + X * 0.01) - 0.5) * 0.06;
      // bordo del disco sfumato di un pixel
      const edge = Math.min(1, ((dr - Math.hypot(a, b) / k) / step) * 1.5);
      const at = (j * w + i) * 4;
      px[at] = (198 - m * 74) * shade * grain;
      px[at + 1] = (198 - m * 72) * shade * grain;
      px[at + 2] = (190 - m * 62) * shade * grain;
      px[at + 3] = 255 * Math.max(0, edge);
    }
  }
  sctx.putImageData(img, 0, 0);
  ctx.save();
  ctx.imageSmoothingEnabled = true;
  ctx.drawImage(small, x0, y0, w * step, h * step);
  ctx.restore();
  // il bordo della sfera dalla parte del Sole: una sottile linea di luce contro lo spazio
  const rim = ctx.createLinearGradient(dc.x - dr, dc.y, dc.x, dc.y - dr);
  rim.addColorStop(0, 'rgba(255,252,235,0.7)');
  rim.addColorStop(1, 'rgba(255,252,235,0)');
  ctx.strokeStyle = rim;
  ctx.lineWidth = 2.5 * s;
  ctx.beginPath();
  ctx.arc(dc.x, dc.y, dr - 1, Math.PI * 0.95, Math.PI * 1.6);
  ctx.stroke();
  drawHorizonRidges(dc, dr, s);
}

/** Montagne lontane che spuntano sull'orizzonte, contro il nero dello spazio. */
function drawHorizonRidges(dc: { x: number; y: number }, dr: number, s: number): void {
  const ctx = game.view.ctx;
  const a0 = Math.PI * 1.06,
    a1 = Math.PI * 1.94,
    n = 260;
  const height = (a: number) => {
    const k = a * 18;
    const big = Math.pow(smoothNoise(k * 0.35, 2.7), 2.2) * 26;
    return (big + smoothNoise(k * 2.2, 9.1) * 4 + smoothNoise(k * 7, 1.1) * 1.5) * s;
  };
  ctx.beginPath();
  for (let i = 0; i <= n; i++) {
    const a = a0 + ((a1 - a0) * i) / n;
    const r = dr + height(a);
    const x = dc.x + Math.cos(a) * r,
      y = dc.y + Math.sin(a) * r;
    if (i) ctx.lineTo(x, y);
    else ctx.moveTo(x, y);
  }
  for (let i = n; i >= 0; i--) {
    const a = a0 + ((a1 - a0) * i) / n;
    ctx.lineTo(dc.x + Math.cos(a) * (dr - 2), dc.y + Math.sin(a) * (dr - 2));
  }
  ctx.closePath();
  const g = ctx.createLinearGradient(dc.x - dr, 0, dc.x + dr, 0);
  g.addColorStop(0, '#b9b9b1');
  g.addColorStop(0.5, '#9d9d95');
  g.addColorStop(1, '#6f6f69');
  ctx.fillStyle = g;
  ctx.fill();
}

/**
 * Suolo lunare, disegnato una volta nello sfondo fisso: la sfera intera fino all'orizzonte, con
 * crateri e massi anche lontano (lì non si arriva), la polvere, le impronte e il confine
 * tratteggiato della zona in cui si cammina.
 */
export function drawMoonFloor(_st: GameValue): void {
  const ctx = game.view.ctx;
  const s = isoScale();
  const R = moonRadius();
  const { X0, X1, Y0, Y1 } = game;
  paintSphere(R);
  const inside = (x: number, y: number, margin = 4) =>
    x > X0 + margin && x < X1 - margin && y > Y0 + margin && y < Y1 - margin;
  // polvere: tanti granelli, meno dove il suolo si vede di sbieco (lì si affollerebbero)
  const grains = Math.round((4 * R * R) / 200);
  for (let i = 0; i < grains; i++) {
    const x = (scatter(i, 1) * 2 - 1) * R,
      y = (scatter(i, 2) * 2 - 1) * R;
    const f = facing(x, y, R);
    if (f <= 0.05 || scatter(i, 8) > f * 1.4) continue;
    const p = isoProject(x, y, 0);
    const dark = scatter(i, 3) > 0.45;
    ctx.fillStyle = dark ? 'rgba(60,60,56,0.28)' : 'rgba(250,250,242,0.3)';
    const size = (0.6 + scatter(i, 4) * 0.9) * s;
    ctx.fillRect(p.x, p.y, size, size * 0.7 * Math.max(0.3, f));
  }
  // crateri piccoli dappertutto, e qualcuno grande fuori dalla zona di gioco
  const smallCount = Math.round((4 * R * R) / 9000);
  for (let i = 0; i < smallCount; i++) {
    const r = 2.5 + Math.pow(scatter(i, 5), 3) * 9;
    const x = (scatter(i, 6) * 2 - 1) * R,
      y = (scatter(i, 7) * 2 - 1) * R;
    const f = facing(x, y, R);
    if (f > 0.12 && (!inside(x, y, -4) || inside(x, y, r * 2))) craterShape(x, y, r, false);
  }
  for (let i = 0; i < 70; i++) {
    const r = 12 + Math.pow(scatter(i, 31), 2) * 60;
    const x = (scatter(i, 32) * 2 - 1) * R,
      y = (scatter(i, 33) * 2 - 1) * R;
    if (facing(x, y, R) > 0.15 && !inside(x, y, -r * 1.6)) craterShape(x, y, r, r >= 35);
  }
  // massi lontani (nella zona di gioco ci sono quelli veri, con la loro forma)
  for (let i = 0; i < 90; i++) {
    const x = (scatter(i, 41) * 2 - 1) * R,
      y = (scatter(i, 42) * 2 - 1) * R;
    const f = facing(x, y, R);
    if (f <= 0.15 || inside(x, y, -30)) continue;
    const size = (3 + scatter(i, 43) * 9) * s;
    const p = isoProject(x, y, 0);
    ctx.fillStyle = 'rgba(25,25,22,0.35)';
    ctx.beginPath();
    ctx.ellipse(p.x + size * 0.8, p.y + size * 0.15, size * 1.1, size * 0.35 * f + 0.5, 0, 0, 6.3);
    ctx.fill();
    const g = ctx.createLinearGradient(p.x - size, 0, p.x + size, 0);
    g.addColorStop(0, '#cfcfc6');
    g.addColorStop(1, '#5d5d57');
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.ellipse(p.x, p.y, size, size * (0.45 + 0.4 * f), 0, Math.PI, 0);
    ctx.ellipse(p.x, p.y, size, size * 0.3 * f + 0.5, 0, 0, Math.PI);
    ctx.fill();
  }
  drawFootprints();
  // confine della zona in cui si cammina: una linea tratteggiata (i paletti sono decorazioni)
  ctx.save();
  ctx.setLineDash([7 * s, 6 * s]);
  ctx.strokeStyle = 'rgba(255,240,200,0.35)';
  ctx.lineWidth = 1.4 * s;
  ctx.beginPath();
  const edge = (x: number, y: number, first = false) => {
    const p = isoProject(x, y, 0.3);
    if (first) ctx.moveTo(p.x, p.y);
    else ctx.lineTo(p.x, p.y);
  };
  edge(X0, Y0, true);
  for (let x = X0; x <= X1; x += 10) edge(x, Y0);
  for (let y = Y0; y <= Y1; y += 10) edge(X1, y);
  for (let x = X1; x >= X0; x -= 10) edge(x, Y1);
  for (let y = Y1; y >= Y0; y -= 10) edge(X0, y);
  ctx.closePath();
  ctx.stroke();
  ctx.restore();
}

/** Paletto luminoso sul confine della zona di gioco: la luce rossa lampeggia piano. */
export function drawMoonBeacon(it?: GameValue, t?: GameValue): GameValue {
  const ctx = game.view.ctx;
  const s = isoScale();
  box(it.x, it.y, 2.5, 2.5, 18, '#dfe6e9');
  const p = isoProject(it.x, it.y, 20);
  const k = Math.max(0, Math.sin((t || 0) * 2 + it.x * 0.02 + it.y * 0.03));
  const g = ctx.createRadialGradient(p.x, p.y, 0, p.x, p.y, 12 * s);
  g.addColorStop(0, `rgba(255,71,87,${0.55 * k})`);
  g.addColorStop(1, 'rgba(255,71,87,0)');
  ctx.fillStyle = g;
  ctx.fillRect(p.x - 12 * s, p.y - 12 * s, 24 * s, 24 * s);
  ctx.fillStyle = k > 0.5 ? '#ff4757' : '#8a2a33';
  ctx.beginPath();
  ctx.arc(p.x, p.y, 2.2 * s, 0, 6.3);
  ctx.fill();
}

/** Impronte degli scarponi: dal razzo verso la bandiera, e un giro fino al cratere grande. */
function drawFootprints(): void {
  const ctx = game.view.ctx;
  const s = isoScale();
  const trails: [number, number][][] = [
    [
      [-20, -10],
      [20, -40],
      [70, -95],
      [100, -125],
    ],
    [
      [-60, -5],
      [-110, 20],
      [-170, 70],
      [-200, 105],
    ],
  ];
  ctx.fillStyle = 'rgba(70,70,64,0.42)';
  for (const trail of trails)
    for (let seg = 0; seg < trail.length - 1; seg++) {
      const [ax, ay] = trail[seg],
        [bx, by] = trail[seg + 1];
      const len = Math.hypot(bx - ax, by - ay);
      const dx = (bx - ax) / len,
        dy = (by - ay) / len;
      for (let d = 0, i = 0; d < len; d += 8, i++) {
        // un piede a destra e uno a sinistra, con un po' di disordine
        const side = i % 2 ? 3.2 : -3.2;
        const wob = (rnd(ax + d * 0.7) - 0.5) * 2;
        const x = ax + dx * d - dy * (side + wob),
          y = ay + dy * d + dx * (side + wob);
        const p = isoProject(x, y, 0.3),
          q = isoProject(x + dx, y + dy, 0.3);
        ctx.beginPath();
        ctx.ellipse(p.x, p.y, 2.4 * s, 1.1 * s, Math.atan2(q.y - p.y, q.x - p.x), 0, 6.3);
        ctx.fill();
      }
    }
}

/** Cratere grande (decorazione): con la raggiera di detriti chiari. */
export function drawCraterProp(it?: GameValue): GameValue {
  craterShape(it.x, it.y, it.r, it.r >= 35);
}

/** Masso lunare: forma irregolare, lato chiaro verso il Sole, ombra lunga dall'altra parte. */
export function drawMoonRockProp(it?: GameValue): GameValue {
  const ctx = game.view.ctx;
  const seed = it.x * 0.37 + it.y * 0.11;
  const n = 9;
  const rx = it.w / 2,
    ry = it.h / 2,
    h = it.z;
  const shape = Array.from({ length: n }, (_, i) => {
    const a = (i / n) * Math.PI * 2;
    return { a, f: 0.78 + rnd(seed + i * 1.9) * 0.34 };
  });
  const at = (i: number, k: number, z: number, shift = 0) => {
    const { a, f } = shape[(i + n) % n];
    return isoProject(it.x + Math.cos(a) * rx * f * k - shift, it.y + Math.sin(a) * ry * f * k, z);
  };
  // ombra sul suolo, dalla parte opposta al Sole
  ctx.fillStyle = 'rgba(25,25,22,0.4)';
  ctx.beginPath();
  for (let i = 0; i <= n; i++) {
    const { a, f } = shape[i % n];
    const p = isoProject(
      it.x + rx * 0.7 + Math.cos(a) * rx * f * 1.15,
      it.y + ry * 0.2 + Math.sin(a) * ry * f * 0.9,
      0.2,
    );
    if (i) ctx.lineTo(p.x, p.y);
    else ctx.moveTo(p.x, p.y);
  }
  ctx.fill();
  const shade = (a: number, up: number) => {
    // quanto la faccia guarda verso la luce (0 = in ombra, 1 = in pieno Sole)
    const lit = Math.max(0, Math.cos(a) * LIGHT[0] + Math.sin(a) * LIGHT[1]) * 0.8 + up * 0.35;
    const c = 96 + Math.min(1, lit) * 120;
    return rgb(c, c, c - 6);
  };
  // due fasce di facce (in basso più larghe), poi la cima: si disegnano solo quelle verso chi guarda
  const bands: [number, number, number, number, number][] = [
    [1, 0, 0.9, h * 0.55, 0],
    [0.9, h * 0.55, 0.55, h * (0.85 + rnd(seed) * 0.15), rx * 0.12],
  ];
  for (const [k0, z0, k1, z1, shift] of bands)
    for (let i = 0; i < n; i++) {
      const am = ((i + 0.5) / n) * Math.PI * 2;
      if (Math.cos(am) + Math.sin(am) < -0.2) continue;
      const fill = shade(am, z0 ? 0.6 : 0.2);
      poly(
        [
          at(i, k0, z0, z0 ? rx * 0.06 : 0),
          at(i + 1, k0, z0, z0 ? rx * 0.06 : 0),
          at(i + 1, k1, z1, shift),
          at(i, k1, z1, shift),
        ],
        fill,
        fill,
        0.6,
      );
    }
  const top = shape.map((_, i) => at(i, 0.55, h * (0.85 + rnd(seed) * 0.15), rx * 0.12));
  poly(top, shade(Math.PI, 1), 'rgba(0,0,0,0.15)', 0.6);
  // sassolini intorno
  ctx.fillStyle = '#8d8d85';
  for (let i = 0; i < 3; i++) {
    const p = isoProject(
      it.x + (rnd(seed + i * 5) - 0.3) * rx * 2.6,
      it.y + (rnd(seed + i * 9) - 0.3) * ry * 2.6,
      0.5,
    );
    ctx.beginPath();
    ctx.ellipse(p.x, p.y, 1.8 * isoScale(), 1.1 * isoScale(), 0, 0, 6.3);
    ctx.fill();
  }
}

/** Bandiera della missione: asta con il braccio in alto (non c'è vento che la tenga aperta). */
export function drawMoonFlagProp(it?: GameValue, t?: GameValue): GameValue {
  const ctx = game.view.ctx;
  const s = isoScale();
  // ombra di asta e telo
  const g0 = isoProject(it.x, it.y, 0),
    g1 = isoProject(it.x + it.z * 0.55, it.y + it.z * 0.15, 0);
  ctx.strokeStyle = 'rgba(25,25,22,0.35)';
  ctx.lineWidth = 2 * s;
  ctx.beginPath();
  ctx.moveTo(g0.x, g0.y);
  ctx.lineTo(g1.x, g1.y);
  ctx.stroke();
  poly(
    [
      isoProject(it.x + it.z * 0.3, it.y + it.z * 0.08, 0),
      isoProject(it.x + it.z * 0.3 + 30, it.y + it.z * 0.08, 0),
      isoProject(it.x + it.z * 0.55 + 30, it.y + it.z * 0.15, 0),
      isoProject(it.x + it.z * 0.55, it.y + it.z * 0.15, 0),
    ],
    'rgba(25,25,22,0.25)',
  );
  box(it.x, it.y, 2.5, 2.5, it.z, '#dfe6e9');
  // braccio orizzontale in cima
  const r0 = isoProject(it.x, it.y, it.z - 1),
    r1 = isoProject(it.x + 36, it.y, it.z - 1);
  ctx.strokeStyle = '#ecf0f1';
  ctx.lineWidth = 1.6 * s;
  ctx.beginPath();
  ctx.moveTo(r0.x, r0.y);
  ctx.lineTo(r1.x, r1.y);
  ctx.stroke();
  // telo appeso al braccio, un po' increspato
  const wave = (u: number) => Math.sin(u * 0.35 + (t || 0) * 0.4) * 1.2;
  const flag = (u: number, z: number) => isoProject(it.x + u, it.y + wave(u), z);
  const cloth: GameValue[] = [];
  for (let u = 0; u <= 34; u += 2) cloth.push(flag(u, it.z - 2));
  for (let u = 34; u >= 0; u -= 2) cloth.push(flag(u, it.z - 24));
  poly(cloth, '#f5f6fa', '#b2bec3', 0.8);
  // fascia rossa in basso e la scritta della missione
  const band: GameValue[] = [];
  for (let u = 0; u <= 34; u += 2) band.push(flag(u, it.z - 19));
  for (let u = 34; u >= 0; u -= 2) band.push(flag(u, it.z - 24));
  poly(band, '#e74c3c');
  const m = flag(17, it.z - 11);
  ctx.fillStyle = '#c0392b';
  ctx.font = `bold ${Math.round(7 * s)}px sans-serif`;
  ctx.textAlign = 'center';
  ctx.fillText('CDC-1', m.x, m.y + 2 * s);
}

// ---------------------------------------------------------------- CIELO

/** Stelle fisse, Via Lattea e nebulose: si disegnano una volta per misura dello schermo. */
let skyCache: { key: string; canvas: HTMLCanvasElement } | null = null;

function staticSky(W: number, H: number): HTMLCanvasElement {
  const key = W + 'x' + H;
  if (skyCache?.key === key) return skyCache.canvas;
  const canvas = document.createElement('canvas');
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext('2d')!;
  const g = ctx.createLinearGradient(0, 0, 0, H);
  g.addColorStop(0, '#010208');
  g.addColorStop(0.6, '#050818');
  g.addColorStop(1, '#0d1230');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, W, H);
  // Via Lattea: una fascia in diagonale, dal basso a sinistra all'alto a destra
  const along = (k: number) => ({ x: W * (-0.1 + k * 1.2), y: H * (0.95 - k * 0.85) });
  for (let i = 0; i < 7; i++) {
    const p = along(0.1 + i * 0.13);
    const r = Math.max(W, H) * (0.12 + rnd(i + 40) * 0.08);
    const glow = ctx.createRadialGradient(p.x, p.y, 0, p.x, p.y, r);
    const hue = i % 2 ? '150,140,210' : '120,150,220';
    glow.addColorStop(0, `rgba(${hue},0.10)`);
    glow.addColorStop(1, `rgba(${hue},0)`);
    ctx.fillStyle = glow;
    ctx.fillRect(p.x - r, p.y - r, r * 2, r * 2);
  }
  const band = Math.round((W * H) / 450);
  for (let i = 0; i < band; i++) {
    const p = along(rnd(i * 1.7 + 3));
    // distanza dal centro della fascia: tante stelle vicine, sempre meno allontanandosi
    const off = (rnd(i * 2.3) + rnd(i * 4.9) + rnd(i * 7.1) - 1.5) * Math.min(W, H) * 0.16;
    ctx.fillStyle = `rgba(225,228,255,${0.15 + rnd(i * 5.5) * 0.45})`;
    ctx.fillRect(p.x + off * 0.58, p.y + off * 0.82, 0.8, 0.8);
  }
  // stelle sparse, qualcuna appena colorata
  const colors = ['255,255,255', '255,236,210', '210,225,255', '255,214,190'];
  for (let i = 0; i < Math.round((W * H) / 2600); i++) {
    ctx.fillStyle = `rgba(${colors[i % 4]},${0.25 + rnd(i + 900) * 0.6})`;
    const r = rnd(i + 1300) > 0.93 ? 1.5 : 0.9;
    ctx.fillRect(rnd(i + 500) * W, rnd(i + 700) * H, r, r);
  }
  skyCache = { key, canvas };
  return canvas;
}

/** Il Sole: bianco abbagliante (senza aria non c'è cielo azzurro), con un alone e i raggi. */
function drawSun(ctx: CanvasRenderingContext2D, x: number, y: number, r: number, t: number): void {
  const halo = ctx.createRadialGradient(x, y, r * 0.3, x, y, r * 6);
  halo.addColorStop(0, 'rgba(255,250,235,0.55)');
  halo.addColorStop(0.25, 'rgba(255,240,210,0.16)');
  halo.addColorStop(1, 'rgba(255,240,210,0)');
  ctx.fillStyle = halo;
  ctx.fillRect(x - r * 6, y - r * 6, r * 12, r * 12);
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(t * 0.02);
  ctx.fillStyle = 'rgba(255,250,235,0.06)';
  for (let i = 0; i < 6; i++) {
    ctx.rotate(Math.PI / 3);
    ctx.beginPath();
    ctx.moveTo(0, -r * 0.4);
    ctx.lineTo(r * 4.5, 0);
    ctx.lineTo(0, r * 0.4);
    ctx.fill();
  }
  ctx.restore();
  ctx.fillStyle = '#fffdf6';
  ctx.beginPath();
  ctx.arc(x, y, r, 0, 6.3);
  ctx.fill();
}

/** La Terra vista dalla luna: mari, continenti, nuvole che scorrono, notte con le città accese. */
export function drawEarth(
  ctx: CanvasRenderingContext2D,
  ex: number,
  ey: number,
  er: number,
  t: number,
) {
  const halo = ctx.createRadialGradient(ex, ey, er * 0.95, ex, ey, er * 1.6);
  halo.addColorStop(0, 'rgba(120,180,255,0.4)');
  halo.addColorStop(1, 'rgba(120,180,255,0)');
  ctx.fillStyle = halo;
  ctx.beginPath();
  ctx.arc(ex, ey, er * 1.6, 0, 6.3);
  ctx.fill();
  // illuminata dal Sole che sta a sinistra
  const sea = ctx.createRadialGradient(ex - er * 0.5, ey - er * 0.3, er * 0.1, ex, ey, er);
  sea.addColorStop(0, '#6ec1f0');
  sea.addColorStop(0.7, '#1f6fb8');
  sea.addColorStop(1, '#174a85');
  ctx.fillStyle = sea;
  ctx.beginPath();
  ctx.arc(ex, ey, er, 0, 6.3);
  ctx.fill();
  ctx.save();
  ctx.beginPath();
  ctx.arc(ex, ey, er, 0, 6.3);
  ctx.clip();
  // i continenti girano piano con la Terra
  const spin = ((t * 0.006) % 2) * er * 2;
  for (const shift of [-er * 4, 0]) {
    for (const [dx, dy, rx, ry, rot, c] of [
      [-0.3, -0.2, 0.36, 0.24, 0.5, '#5aa356'],
      [0.25, 0.25, 0.3, 0.2, 0.2, '#6aa95a'],
      [0.1, -0.45, 0.2, 0.12, 0.8, '#c9b37a'],
      [1.2, 0.05, 0.35, 0.28, 0.3, '#57a05a'],
      [1.6, -0.35, 0.18, 0.1, 0.1, '#c9b37a'],
      [-1.0, 0.3, 0.25, 0.3, 0.6, '#5aa356'],
    ] as [number, number, number, number, number, string][]) {
      ctx.fillStyle = c;
      ctx.beginPath();
      ctx.ellipse(ex + dx * er + spin + shift, ey + dy * er, rx * er, ry * er, rot, 0, 6.3);
      ctx.fill();
    }
  }
  // calotte polari e nuvole
  ctx.fillStyle = 'rgba(255,255,255,0.85)';
  ctx.beginPath();
  ctx.ellipse(ex, ey - er * 0.95, er * 0.55, er * 0.14, 0, 0, 6.3);
  ctx.ellipse(ex, ey + er * 0.97, er * 0.5, er * 0.12, 0, 0, 6.3);
  ctx.fill();
  ctx.fillStyle = 'rgba(255,255,255,0.7)';
  for (let i = 0; i < 5; i++) {
    const cy = ey + (i - 2) * er * 0.38;
    const off = ((t * 0.02 + i * 0.27) % 1) * er * 2.6 - er * 1.3;
    ctx.beginPath();
    ctx.ellipse(ex + off, cy, er * 0.32, er * 0.06, 0.1, 0, 6.3);
    ctx.fill();
  }
  // lato in ombra, con le luci delle città
  const night = ctx.createLinearGradient(ex - er * 0.2, ey, ex + er, ey);
  night.addColorStop(0, 'rgba(0,4,20,0)');
  night.addColorStop(0.35, 'rgba(0,4,20,0.7)');
  night.addColorStop(1, 'rgba(0,4,20,0.85)');
  ctx.fillStyle = night;
  ctx.fillRect(ex - er, ey - er, er * 2, er * 2);
  ctx.fillStyle = 'rgba(255,214,120,0.75)';
  for (let i = 0; i < 14; i++) {
    const a = rnd(i + 70) * Math.PI - Math.PI / 2;
    const d = 0.3 + rnd(i + 90) * 0.6;
    const x = ex + Math.cos(a) * er * d * 0.9 + er * 0.15,
      y = ey + Math.sin(a) * er * d;
    if (x > ex + er * 0.25) ctx.fillRect(x, y, 1, 1);
  }
  ctx.restore();
  // bordo dell'atmosfera, acceso dal lato del Sole
  ctx.strokeStyle = 'rgba(160,210,255,0.7)';
  ctx.lineWidth = Math.max(1, er * 0.05);
  ctx.beginPath();
  ctx.arc(ex, ey, er, Math.PI * 0.55, Math.PI * 1.55);
  ctx.stroke();
}

/** Cielo dello spazio: nero, pieno di stelle, la Via Lattea, il Sole e la Terra lontana. */
export function drawSpaceSky(t: number): void {
  const ctx = game.view.ctx;
  const W: number = game.view.canvas.width,
    H: number = game.view.canvas.height;
  ctx.drawImage(staticSky(W, H), 0, 0);
  // poche stelle grandi che brillano
  for (let i = 0; i < 40; i++) {
    const tw = 0.5 + 0.5 * Math.sin(t * (1 + rnd(i) * 1.5) + i * 1.7);
    const x = rnd(i * 3 + 11) * W,
      y = rnd(i * 3 + 29) * H * 0.75;
    ctx.fillStyle = `rgba(255,255,255,${0.35 + 0.65 * tw})`;
    ctx.fillRect(x - 0.5, y - 0.5, 1.8, 1.8);
    if (tw > 0.9 && i % 4 === 0) {
      ctx.fillStyle = 'rgba(255,255,255,0.35)';
      ctx.fillRect(x - 3, y, 7, 0.8);
      ctx.fillRect(x + 0.2, y - 3, 0.8, 7);
    }
  }
  // una stella cadente ogni tanto
  const period = 11;
  const ph = (t % period) / 0.9;
  if (ph < 1) {
    const n = Math.floor(t / period);
    const sx = W * (0.3 + rnd(n) * 0.5),
      sy = H * (0.05 + rnd(n + 5) * 0.25);
    const x = sx + ph * W * 0.18,
      y = sy + ph * H * 0.08;
    const tail = ctx.createLinearGradient(x - W * 0.06, y - H * 0.027, x, y);
    tail.addColorStop(0, 'rgba(255,255,255,0)');
    tail.addColorStop(1, `rgba(255,255,255,${0.8 * (1 - ph)})`);
    ctx.strokeStyle = tail;
    ctx.lineWidth = 1.4;
    ctx.beginPath();
    ctx.moveTo(x - W * 0.06, y - H * 0.027);
    ctx.lineTo(x, y);
    ctx.stroke();
  }
  const unit = Math.min(W, H);
  drawSun(ctx, W * 0.27, H * 0.09, unit * 0.028, t);
  drawEarth(ctx, W * 0.8, H * 0.16, unit * 0.075, t);
}
