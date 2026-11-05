// I 30 pezzi da collezione in 3D, costruiti con solidi veri (scatole, solidi di rotazione,
// sfere) nella stessa prospettiva dei mobili. Ogni pezzo si disegna appoggiato in un punto della
// stanza (x, y, z), con la faccia davanti verso +y; `k` lo scala (a k = 1 è alto circa 20, largo
// al massimo 18 e profondo 10, così ci sta sulla mensola). Sulla parete di sinistra la mensola
// guarda verso +x: chi chiama gira il pezzo con game.furnRot, come i mobili ruotati.
import { type GameValue, game } from '../context.js';
import { isoProject, isoScale, mixColor, setPlane } from './primitives.js';
import { box, onFace } from './objects.js';

type Ctx = CanvasRenderingContext2D;
type V3 = [number, number, number];

/** Dove e quanto grande si disegna il pezzo, e il tempo per le animazioni. */
interface At {
  x: number;
  y: number;
  z: number;
  k: number;
  t: number;
}

const ctxOf = (): Ctx => game.view.ctx;
const light = (c: string, a = 0.3) => mixColor(c, '#ffffff', a);
const dark = (c: string, a = 0.3) => game.darken(c, a);
const P = (s: At, dx: number, dy: number, dz: number) =>
  isoProject(s.x + dx * s.k, s.y + dy * s.k, s.z + dz * s.k);
const EDGE = 'rgba(30,20,10,0.35)';

// ---------------------------------------------------------------- solidi

/** Scatola: (dx, dy) centro, dz base, w lungo x, h lungo y (profondità), d altezza. */
function B(
  s: At,
  dx: number,
  dy: number,
  dz: number,
  w: number,
  h: number,
  d: number,
  color: string,
  opt: GameValue = {},
): GameValue {
  return box(s.x + dx * s.k, s.y + dy * s.k, w * s.k, h * s.k, d * s.k, color, {
    edge: EDGE,
    ...opt,
    z0: s.z + dz * s.k,
  });
}

/** Mezzo giro di una circonferenza orizzontale, dalla parte di chi guarda (da −45° a 135°). */
function ring(dx: number, dy: number, r: number, z: number, n: number, front = true): V3[] {
  const out: V3[] = [];
  const a0 = front ? -Math.PI / 4 : (3 * Math.PI) / 4;
  for (let i = 0; i <= n; i++) {
    const a = a0 + (Math.PI * i) / n;
    out.push([dx + r * Math.cos(a), dy + r * Math.sin(a), z]);
  }
  return out;
}

/** Gradiente da sinistra (illuminata) a destra (in ombra) fra due punti dello schermo. */
function sideShade(x0: number, x1: number, color: string, alpha = 1): CanvasGradient {
  const g = ctxOf().createLinearGradient(x0, 0, x1, 0);
  const a = (c: string) => (alpha < 1 ? withAlpha(c, alpha) : c);
  g.addColorStop(0, a(light(color, 0.22)));
  g.addColorStop(0.45, a(color));
  g.addColorStop(1, a(dark(color, 0.38)));
  return g;
}
function withAlpha(c: string, a: number): string {
  const m = /^#([0-9a-f]{6})$/i.exec(c);
  if (!m) return c;
  const n = parseInt(m[1], 16);
  return `rgba(${n >> 16},${(n >> 8) & 255},${n & 255},${a})`;
}

/**
 * Solido di rotazione attorno all'asse verticale in (dx, dy): `prof` è il profilo [raggio, altezza]
 * dal basso verso l'alto. Si disegnano le fasce viste da davanti e il coperchio in cima.
 * `segments` basso (6) fa un prisma, come i cristalli.
 */
function lathe(
  s: At,
  dx: number,
  dy: number,
  dz: number,
  prof: [number, number][],
  color: string,
  opt: { cap?: string | false; alpha?: number; segments?: number; edge?: string } = {},
): void {
  const ctx = ctxOf();
  const n = opt.segments ? Math.max(2, Math.round(opt.segments / 2)) : 16;
  const alpha = opt.alpha ?? 1;
  for (let i = 1; i < prof.length; i++) {
    const [r0, z0] = prof[i - 1],
      [r1, z1] = prof[i];
    const lo = ring(dx, dy, r0, dz + z0, n).map((p) => P(s, ...p));
    const hi = ring(dx, dy, r1, dz + z1, n).map((p) => P(s, ...p));
    const xs = [...lo, ...hi].map((p) => p.x);
    ctx.fillStyle = sideShade(Math.min(...xs), Math.max(...xs), color, alpha);
    ctx.beginPath();
    lo.forEach((p, j) => (j ? ctx.lineTo(p.x, p.y) : ctx.moveTo(p.x, p.y)));
    for (let j = hi.length - 1; j >= 0; j--) ctx.lineTo(hi[j].x, hi[j].y);
    ctx.closePath();
    ctx.fill();
    if (opt.edge) {
      ctx.strokeStyle = opt.edge;
      ctx.lineWidth = 0.6;
      ctx.stroke();
    }
  }
  if (opt.cap === false) return;
  const [rt, zt] = prof[prof.length - 1];
  if (rt <= 0.01) return;
  disc(s, dx, dy, dz + zt, rt, opt.cap || light(color, 0.15), alpha, opt.segments);
}

/** Cerchio orizzontale pieno (coperchio, ciotola, ombra). */
function disc(
  s: At,
  dx: number,
  dy: number,
  z: number,
  r: number,
  color: string,
  alpha = 1,
  segments?: number,
): void {
  const ctx = ctxOf();
  const n = segments || 28;
  ctx.fillStyle = alpha < 1 ? withAlpha(color, alpha) : color;
  ctx.beginPath();
  for (let i = 0; i <= n; i++) {
    const a = (Math.PI * 2 * i) / n;
    const p = P(s, dx + r * Math.cos(a), dy + r * Math.sin(a), z);
    if (i) ctx.lineTo(p.x, p.y);
    else ctx.moveTo(p.x, p.y);
  }
  ctx.fill();
}

/** Cilindro dritto (un solido di rotazione con il raggio costante). */
const cyl = (
  s: At,
  dx: number,
  dy: number,
  dz: number,
  r: number,
  h: number,
  color: string,
  opt: { cap?: string | false; alpha?: number; segments?: number } = {},
) =>
  lathe(
    s,
    dx,
    dy,
    dz,
    [
      [r, 0],
      [r, h],
    ],
    color,
    opt,
  );

/** Sfera, con la luce da sinistra in alto. */
function sphere(
  s: At,
  dx: number,
  dy: number,
  dz: number,
  r: number,
  color: string,
  alpha = 1,
): { x: number; y: number; r: number } {
  const ctx = ctxOf();
  const c = P(s, dx, dy, dz);
  const R = Math.abs(P(s, dx, dy, dz + r).y - c.y) * 1.08;
  const g = ctx.createRadialGradient(c.x - R * 0.35, c.y - R * 0.4, R * 0.1, c.x, c.y, R);
  const a = (col: string) => (alpha < 1 ? withAlpha(col, alpha) : col);
  g.addColorStop(0, a(light(color, 0.55)));
  g.addColorStop(0.45, a(color));
  g.addColorStop(1, a(dark(color, 0.45)));
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.arc(c.x, c.y, R, 0, Math.PI * 2);
  ctx.fill();
  return { x: c.x, y: c.y, r: R };
}

/** Ellissoide (una sfera schiacciata o allungata): rx in orizzontale, rz in verticale. */
function blob(
  s: At,
  dx: number,
  dy: number,
  dz: number,
  rx: number,
  rz: number,
  color: string,
): { x: number; y: number; rx: number; ry: number } {
  const ctx = ctxOf();
  const c = P(s, dx, dy, dz);
  const unit = Math.abs(P(s, dx, dy, dz + 1).y - c.y);
  const RX = rx * unit * 1.08,
    RY = rz * unit * 1.08;
  const g = ctx.createRadialGradient(
    c.x - RX * 0.35,
    c.y - RY * 0.4,
    1,
    c.x,
    c.y,
    Math.max(RX, RY),
  );
  g.addColorStop(0, light(color, 0.5));
  g.addColorStop(0.5, color);
  g.addColorStop(1, dark(color, 0.42));
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.ellipse(c.x, c.y, RX, RY, 0, 0, Math.PI * 2);
  ctx.fill();
  return { x: c.x, y: c.y, rx: RX, ry: RY };
}

/** Bastoncino fra due punti (gambe, aste, fili). */
function rod(s: At, a: V3, b: V3, color: string, width: number): void {
  const ctx = ctxOf();
  const p = P(s, ...a),
    q = P(s, ...b);
  ctx.strokeStyle = color;
  ctx.lineWidth = width * s.k * isoScale();
  ctx.lineCap = 'round';
  ctx.beginPath();
  ctx.moveTo(p.x, p.y);
  ctx.lineTo(q.x, q.y);
  ctx.stroke();
  ctx.lineCap = 'butt';
}

/** Tubo orizzontale fra due punti (il cannocchiale): un cilindro coricato. */
function tube(s: At, a: V3, b: V3, r: number, color: string): void {
  const ctx = ctxOf();
  const p = P(s, ...a),
    q = P(s, ...b);
  const unit = Math.abs(P(s, 0, 0, 1).y - P(s, 0, 0, 0).y);
  const R = r * unit;
  const ang = Math.atan2(q.y - p.y, q.x - p.x);
  const nx = -Math.sin(ang) * R,
    ny = Math.cos(ang) * R;
  const g = ctx.createLinearGradient(p.x - nx, p.y - ny, p.x + nx, p.y + ny);
  g.addColorStop(0, light(color, 0.45));
  g.addColorStop(0.5, color);
  g.addColorStop(1, dark(color, 0.45));
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.moveTo(p.x - nx, p.y - ny);
  ctx.lineTo(q.x - nx, q.y - ny);
  ctx.lineTo(q.x + nx, q.y + ny);
  ctx.lineTo(p.x + nx, p.y + ny);
  ctx.closePath();
  ctx.fill();
  // la bocca del tubo, verso chi guarda
  ctx.fillStyle = dark(color, 0.5);
  ctx.beginPath();
  ctx.ellipse(q.x, q.y, R * 0.45, R, ang, 0, Math.PI * 2);
  ctx.fill();
}

/**
 * Disegna nel piano verticale davanti al pezzo (x verso destra, y verso l'alto) con origine in
 * (dx, dy, dz): per i dischi in piedi, le vele, le maschere.
 */
function front(s: At, dx: number, dy: number, dz: number, fn: (ctx: Ctx) => void): void {
  const ctx = ctxOf();
  ctx.save();
  const o = s;
  setPlane([o.x + dx * o.k, o.y + dy * o.k, o.z + dz * o.k], [o.k, 0, 0], [0, 0, o.k]);
  try {
    fn(ctx);
  } finally {
    ctx.restore();
  }
}
/** Nel piano orizzontale (x verso destra, y verso chi guarda): quadranti, dischi, scacchiere. */
function flat(s: At, dx: number, dy: number, dz: number, fn: (ctx: Ctx) => void): void {
  const ctx = ctxOf();
  ctx.save();
  setPlane([s.x + dx * s.k, s.y + dy * s.k, s.z + dz * s.k], [s.k, 0, 0], [0, s.k, 0]);
  try {
    fn(ctx);
  } finally {
    ctx.restore();
  }
}

/**
 * Disco in piedi, rivolto verso chi guarda (medaglioni, quadranti, la conchiglia): un cilindro
 * coricato lungo y, spesso `thick`, con il disegno sulla faccia davanti.
 */
function standingDisc(
  s: At,
  dx: number,
  dz: number,
  r: number,
  thick: number,
  rim: string,
  face: (ctx: Ctx, r: number) => void,
  hollow = 0,
): void {
  // il bordo: tanti cerchi dal fondo in avanti, così si vede lo spessore. `hollow`: è solo una
  // cornice larga così (la lente, che dentro è di vetro)
  const steps = 5;
  for (let i = 0; i <= steps; i++) {
    const y = -thick / 2 + (thick * i) / steps;
    front(s, dx, y, dz, (ctx) => {
      const c = i === steps ? rim : dark(rim, 0.25 + 0.05 * (steps - i));
      ctx.beginPath();
      if (hollow) {
        ctx.strokeStyle = c;
        ctx.lineWidth = hollow;
        ctx.arc(0, 0, r - hollow / 2, 0, Math.PI * 2);
        ctx.stroke();
      } else {
        ctx.fillStyle = c;
        ctx.arc(0, 0, r, 0, Math.PI * 2);
        ctx.fill();
      }
    });
  }
  front(s, dx, thick / 2 + 0.05, dz, (ctx) => face(ctx, r));
}

// ---------------------------------------------------------------- i pezzi

function tomo(s: At): void {
  // libro in piedi con la copertina verso chi guarda
  const b = B(s, 0, 0, 0, 12, 3.6, 16, '#1e6b3a', { top: '#f3e9cf', right: '#efe3c2' });
  onFace(b, 'left', (W: number, H: number) => {
    const ctx = ctxOf();
    ctx.strokeStyle = '#d4af37';
    ctx.lineWidth = W * 0.05;
    ctx.strokeRect(W * 0.1, H * 0.08, W * 0.8, H * 0.84);
    ctx.fillStyle = '#d4af37';
    ctx.beginPath();
    ctx.arc(W / 2, H / 2, W * 0.2, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#1e6b3a';
    ctx.beginPath();
    ctx.arc(W / 2, H / 2, W * 0.13, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#d4af37';
    ctx.font = `bold ${W * 0.14}px serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('✦', W / 2, H / 2);
  });
  // segnalibro rosso che esce in basso
  rod(s, [3, 1.9, 0.2], [3.4, 2.1, -1.2], '#c0392b', 0.8);
}

function globo(s: At): void {
  cyl(s, 0, 0, 0, 5, 1.4, '#b8860b');
  cyl(s, 0, 0, 1.4, 0.7, 4, '#c9a227');
  // anello del meridiano dietro, poi il globo, poi la parte davanti dell'anello
  const g = sphere(s, 0, 0, 11.5, 6.2, '#2e86c1');
  const ctx = ctxOf();
  ctx.save();
  ctx.beginPath();
  ctx.arc(g.x, g.y, g.r, 0, Math.PI * 2);
  ctx.clip();
  ctx.fillStyle = 'rgba(46,139,87,0.85)';
  const sp = (fx: number, fy: number, rx: number, ry: number) => {
    ctx.beginPath();
    ctx.ellipse(g.x + g.r * fx, g.y + g.r * fy, g.r * rx, g.r * ry, 0.4, 0, Math.PI * 2);
    ctx.fill();
  };
  sp(-0.25, -0.3, 0.35, 0.22);
  sp(0.15, 0.25, 0.25, 0.35);
  sp(0.55, -0.15, 0.18, 0.12);
  ctx.restore();
  ctx.strokeStyle = '#d4af37';
  ctx.lineWidth = g.r * 0.12;
  ctx.beginPath();
  ctx.ellipse(g.x, g.y, g.r * 1.12, g.r * 1.12, 0, Math.PI * 0.55, Math.PI * 1.95);
  ctx.stroke();
}

function clessidra(s: At): void {
  cyl(s, 0, 0, 0, 5.2, 1.4, '#6d4c41');
  // vetro: due coni uniti per la punta, con la sabbia
  lathe(
    s,
    0,
    0,
    1.4,
    [
      [3.6, 0],
      [3.4, 3],
      [0.6, 6.6],
    ],
    '#d6eaf8',
    { alpha: 0.45, cap: false },
  );
  lathe(
    s,
    0,
    0,
    1.4,
    [
      [3, 0],
      [2.6, 2],
    ],
    '#2c2c2c',
  );
  lathe(
    s,
    0,
    0,
    8,
    [
      [0.6, 0],
      [3.4, 3.6],
      [3.6, 6.6],
    ],
    '#d6eaf8',
    { alpha: 0.45, cap: false },
  );
  lathe(
    s,
    0,
    0,
    11.5,
    [
      [2.4, 0],
      [3.3, 2.6],
    ],
    '#2c2c2c',
    { cap: '#3d3d3d' },
  );
  // il filo di sabbia che scende
  rod(s, [0, 0, 8], [0, 0, 3.4], '#2c2c2c', 0.35);
  // colonnine di legno ai lati, davanti
  for (const [x, y] of [
    [-4.2, 2.4],
    [4.2, 2.4],
    [0, -4.6],
  ] as [number, number][])
    cyl(s, x, y, 1.4, 0.55, 13.6, '#8d6e63', { cap: false });
  cyl(s, 0, 0, 15, 5.2, 1.4, '#6d4c41');
}

function sfera(s: At, t: number): void {
  lathe(
    s,
    0,
    0,
    0,
    [
      [5, 0],
      [5, 1.2],
      [3.6, 3.2],
      [3.8, 4.2],
    ],
    '#6d3b1f',
  );
  const g = sphere(s, 0, 0, 9.6, 5.8, '#7d3c98', 0.92);
  // nebbia che gira dentro la sfera
  const ctx = ctxOf();
  ctx.save();
  ctx.beginPath();
  ctx.arc(g.x, g.y, g.r, 0, Math.PI * 2);
  ctx.clip();
  ctx.fillStyle = 'rgba(232,218,239,0.35)';
  ctx.beginPath();
  ctx.ellipse(
    g.x + Math.cos(t) * g.r * 0.25,
    g.y + Math.sin(t * 0.8) * g.r * 0.2,
    g.r * 0.5,
    g.r * 0.22,
    t * 0.5,
    0,
    Math.PI * 2,
  );
  ctx.fill();
  ctx.restore();
  ctx.fillStyle = 'rgba(255,255,255,0.85)';
  ctx.beginPath();
  ctx.arc(g.x - g.r * 0.4, g.y - g.r * 0.45, g.r * 0.14, 0, Math.PI * 2);
  ctx.fill();
}

function pendolo(s: At, t: number): void {
  // cassa di legno con il cappello, quadrante e vetrina del pendolo davanti
  B(s, 0, 0, 0, 11, 6, 1.2, '#4e2a14');
  const body = B(s, 0, 0, 1.2, 9.5, 5, 13, '#7b3f1d');
  B(s, 0, 0, 14.2, 11, 6, 1.4, '#4e2a14');
  B(s, 0, 0, 15.6, 6, 3.4, 2.4, '#7b3f1d');
  onFace(body, 'left', (W: number, H: number) => {
    const ctx = ctxOf();
    const cx = W / 2,
      cy = H * 0.3,
      r = W * 0.36;
    ctx.fillStyle = '#d4af37';
    ctx.beginPath();
    ctx.arc(cx, cy, r * 1.1, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#fdf6e3';
    ctx.beginPath();
    ctx.arc(cx, cy, r, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = '#2d3436';
    ctx.lineWidth = r * 0.12;
    ctx.beginPath();
    ctx.moveTo(cx, cy);
    ctx.lineTo(cx, cy - r * 0.7);
    ctx.moveTo(cx, cy);
    ctx.lineTo(cx + r * 0.5, cy + r * 0.1);
    ctx.stroke();
    // vetrina con il pendolo che oscilla
    ctx.fillStyle = 'rgba(30,20,10,0.55)';
    ctx.fillRect(W * 0.25, H * 0.56, W * 0.5, H * 0.38);
    const a = Math.sin(t * 2.4) * 0.35;
    const px = cx + Math.sin(a) * H * 0.26,
      py = H * 0.58 + Math.cos(a) * H * 0.26;
    ctx.strokeStyle = '#d4af37';
    ctx.lineWidth = W * 0.03;
    ctx.beginPath();
    ctx.moveTo(cx, H * 0.58);
    ctx.lineTo(px, py);
    ctx.stroke();
    ctx.fillStyle = '#d4af37';
    ctx.beginPath();
    ctx.arc(px, py, W * 0.08, 0, Math.PI * 2);
    ctx.fill();
  });
}

function torso(s: At): void {
  cyl(s, 0, 0, 0, 4, 1.2, '#2d3436');
  cyl(s, 0, 0, 1.2, 0.6, 3, '#636e72');
  // busto anatomico: tronco, spalle e organi sulla parte davanti
  const tr = blob(s, 0, 0, 10.5, 4.4, 6.4, '#f0c8a0');
  blob(s, 0, 0, 15.4, 5.6, 2.2, '#efc39b');
  const ctx = ctxOf();
  const org = (fx: number, fy: number, rx: number, ry: number, c: string) => {
    ctx.fillStyle = c;
    ctx.beginPath();
    ctx.ellipse(tr.x + tr.rx * fx, tr.y + tr.ry * fy, tr.rx * rx, tr.ry * ry, 0, 0, Math.PI * 2);
    ctx.fill();
  };
  org(-0.3, -0.35, 0.32, 0.3, '#e57373');
  org(0.3, -0.35, 0.32, 0.3, '#e57373');
  org(0.1, -0.2, 0.22, 0.2, '#c0392b');
  org(0, 0.25, 0.5, 0.25, '#d4a373');
  org(-0.1, 0.55, 0.3, 0.15, '#b5838d');
}

function busto(s: At): void {
  const plinth = B(s, 0, 0, 0, 9, 7, 4.5, '#cfd8dc');
  onFace(plinth, 'left', (W: number, H: number) => {
    const ctx = ctxOf();
    ctx.strokeStyle = 'rgba(120,130,140,0.6)';
    ctx.lineWidth = H * 0.08;
    ctx.strokeRect(W * 0.12, H * 0.25, W * 0.76, H * 0.5);
  });
  lathe(
    s,
    0,
    0,
    4.5,
    [
      [2.4, 0],
      [1.6, 2.4],
    ],
    '#eceff1',
  );
  blob(s, 0, 0, 9, 6, 2.6, '#eceff1');
  cyl(s, 0, 0.3, 10, 1.6, 2.6, '#e8ebed', { cap: false });
  const h = sphere(s, 0, 0.3, 15.2, 3.8, '#f5f6f7');
  // capelli a riccioli e il naso
  const ctx = ctxOf();
  ctx.fillStyle = '#d7dde0';
  for (let i = 0; i < 6; i++) {
    const a = Math.PI * (1.05 + i * 0.18);
    ctx.beginPath();
    ctx.arc(h.x + Math.cos(a) * h.r * 0.75, h.y + Math.sin(a) * h.r * 0.75, h.r * 0.28, 0, 7);
    ctx.fill();
  }
  ctx.fillStyle = 'rgba(120,130,140,0.5)';
  ctx.beginPath();
  ctx.arc(h.x - h.r * 0.3, h.y + h.r * 0.05, h.r * 0.1, 0, 7);
  ctx.arc(h.x + h.r * 0.25, h.y + h.r * 0.05, h.r * 0.1, 0, 7);
  ctx.fill();
}

function lava(s: At, t: number): void {
  lathe(
    s,
    0,
    0,
    0,
    [
      [4.2, 0],
      [2.4, 6],
    ],
    '#c0392b',
  );
  // vetro con la cera che sale e scende
  lathe(
    s,
    0,
    0,
    6,
    [
      [2.4, 0],
      [3, 4],
      [1.5, 10],
    ],
    '#f39c12',
    { alpha: 0.85, cap: false },
  );
  const ctx = ctxOf();
  for (let i = 0; i < 3; i++) {
    const z = 7.5 + ((t * 0.6 + i * 0.37) % 1) * 7;
    const c = P(s, Math.sin(t + i) * 0.5, 0, z);
    const r = Math.abs(P(s, 0, 0, 1).y - P(s, 0, 0, 0).y) * (1 - i * 0.15);
    ctx.fillStyle = 'rgba(231,76,60,0.9)';
    ctx.beginPath();
    ctx.ellipse(c.x, c.y, r * 1.1, r * 1.4, 0, 0, Math.PI * 2);
    ctx.fill();
  }
  lathe(
    s,
    0,
    0,
    16,
    [
      [1.5, 0],
      [0.7, 3.2],
    ],
    '#c0392b',
  );
}

function fumetti(s: At): void {
  // pila di albi, ognuno un po' girato, e quello in cima con la copertina
  const cols = ['#2980b9', '#27ae60', '#8e44ad', '#e67e22', '#16a085'];
  cols.forEach((c, i) => B(s, (i % 2 ? 0.5 : -0.4) * 0.8, 0, i * 1, 13, 9, 1, c, { top: c }));
  const top = B(s, 0, 0, 5, 13, 9, 1, '#f1c40f');
  onFace(top, 'top', (W: number, H: number) => {
    const ctx = ctxOf();
    ctx.fillStyle = '#e74c3c';
    ctx.fillRect(W * 0.08, H * 0.1, W * 0.84, H * 0.8);
    ctx.fillStyle = '#f1c40f';
    ctx.beginPath();
    for (let i = 0; i < 10; i++) {
      const a = (Math.PI * 2 * i) / 10;
      const r = i % 2 ? W * 0.14 : W * 0.3;
      ctx.lineTo(W / 2 + Math.cos(a) * r, H / 2 + Math.sin(a) * r * 0.8);
    }
    ctx.fill();
    ctx.fillStyle = '#2d3436';
    ctx.font = `bold ${H * 0.16}px sans-serif`;
    ctx.textAlign = 'center';
    ctx.fillText('POW!', W / 2, H * 0.58);
  });
  // e uno in piedi dietro, appoggiato, per far vedere la copertina
  const st = B(s, 1, -3.4, 6, 11, 1, 10, '#e74c3c');
  onFace(st, 'left', (W: number, H: number) => {
    const ctx = ctxOf();
    ctx.fillStyle = '#f1c40f';
    ctx.fillRect(W * 0.1, H * 0.08, W * 0.8, H * 0.22);
    ctx.fillStyle = '#3498db';
    ctx.beginPath();
    ctx.arc(W / 2, H * 0.62, W * 0.22, 0, Math.PI * 2);
    ctx.fill();
  });
}

function manuale(s: At): void {
  // leggio di legno con il manuale aperto sopra, le pagine un po' inclinate all'indietro
  B(s, 0, 0, 0, 14, 8, 1.2, '#5d4037');
  B(s, 0, -2.5, 1.2, 1.4, 1.4, 6, '#6d4c41');
  for (const sd of [-1, 1]) {
    const page = sd < 0 ? '#f3e5c0' : '#f7ecd0';
    front(s, sd * 3.4, 0.5, 7.4, (ctx) => {
      ctx.fillStyle = dark(page, 0.08);
      ctx.beginPath();
      ctx.moveTo(-3.3, -5.4);
      ctx.lineTo(3.3, -5.4);
      ctx.lineTo(3.6, 4.2);
      ctx.lineTo(-3.6, 4.2);
      ctx.closePath();
      ctx.fill();
      ctx.strokeStyle = 'rgba(80,50,20,0.5)';
      ctx.lineWidth = 0.3;
      ctx.stroke();
      // geometria sacra: sei cerchi che fanno un fiore
      ctx.strokeStyle = sd < 0 ? '#8e5b2b' : '#7d3c98';
      ctx.lineWidth = 0.35;
      for (let i = 0; i < 6; i++) {
        const a = (Math.PI * 2 * i) / 6;
        ctx.beginPath();
        ctx.arc(Math.cos(a) * 1.1, -0.4 + Math.sin(a) * 1.1, 1.1, 0, Math.PI * 2);
        ctx.stroke();
      }
    });
  }
  // il dorso al centro
  rod(s, [0, 0.5, 2], [0, 0.5, 11.6], '#6d4c41', 0.9);
}

function newton(s: At, t: number): void {
  B(s, 0, 0, 0, 15, 8, 1.6, '#2d3436');
  // telaio dietro, le palline, poi il telaio davanti
  for (const x of [-6.5, 6.5]) cyl(s, x, -3, 1.6, 0.4, 11, '#b2bec3', { cap: false });
  rod(s, [-6.5, -3, 12.6], [6.5, -3, 12.6], '#b2bec3', 0.8);
  // cinque palline appese a due fili ciascuna; la prima e l'ultima oscillano a turno
  const swing = Math.sin(t * 3.2);
  for (let i = 0; i < 5; i++) {
    let x = -4 + i * 2,
      z = 4.5;
    if ((i === 0 && swing < 0) || (i === 4 && swing > 0)) {
      x += swing * 3;
      z += swing * swing * 1.2;
    }
    rod(s, [x, 0, z], [-4 + i * 2, -3, 12.6], 'rgba(220,220,220,0.8)', 0.12);
    rod(s, [x, 0, z], [-4 + i * 2, 3, 12.6], 'rgba(220,220,220,0.8)', 0.12);
    sphere(s, x, 0, z, 1, '#dfe6e9');
  }
  for (const x of [-6.5, 6.5]) cyl(s, x, 3, 1.6, 0.4, 11, '#dfe6e9', { cap: false });
  rod(s, [-6.5, 3, 12.6], [6.5, 3, 12.6], '#dfe6e9', 0.8);
}

function cranio(s: At): void {
  cyl(s, 0, 0, 0, 4.2, 1.2, '#2d3436');
  // mascella, poi la calotta con orbite, naso e denti
  B(s, 0, 1, 1.2, 5.4, 5, 3.2, '#e8dcc0', { top: '#efe5cc' });
  const h = blob(s, 0, 0, 9.4, 5.4, 5.2, '#f1e7cf');
  const ctx = ctxOf();
  ctx.fillStyle = '#3d2b1f';
  for (const fx of [-0.38, 0.38]) {
    ctx.beginPath();
    ctx.ellipse(h.x + h.rx * fx, h.y + h.ry * 0.12, h.rx * 0.24, h.ry * 0.26, 0, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.beginPath();
  ctx.moveTo(h.x, h.y + h.ry * 0.38);
  ctx.lineTo(h.x - h.rx * 0.1, h.y + h.ry * 0.6);
  ctx.lineTo(h.x + h.rx * 0.1, h.y + h.ry * 0.6);
  ctx.fill();
  ctx.fillStyle = '#fdf8ea';
  for (let i = -2; i <= 2; i++)
    ctx.fillRect(h.x + i * h.rx * 0.13 - h.rx * 0.05, h.y + h.ry * 0.8, h.rx * 0.1, h.ry * 0.18);
}

function giradischi(s: At, t: number): void {
  // valigetta con il coperchio aperto dietro, il disco che gira e il braccio
  B(s, 0, -4.6, 3.6, 14, 0.8, 9, '#138d75');
  B(s, 0, 0.4, 0, 14, 9, 3.6, '#16a085', { top: '#e8f6f3' });
  flat(s, -1.4, 0.4, 3.62, (ctx) => {
    ctx.fillStyle = '#1b1b1b';
    ctx.beginPath();
    ctx.arc(0, 0, 3.6, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = 'rgba(255,255,255,0.14)';
    ctx.lineWidth = 0.15;
    for (const r of [1.6, 2.3, 3]) {
      ctx.beginPath();
      ctx.arc(0, 0, r, t, t + 4);
      ctx.stroke();
    }
    ctx.fillStyle = '#e74c3c';
    ctx.beginPath();
    ctx.arc(0, 0, 1, 0, Math.PI * 2);
    ctx.fill();
  });
  cyl(s, 4.6, -1.6, 3.6, 0.7, 1, '#95a5a6');
  rod(s, [4.6, -1.6, 4.8], [1, 1.8, 4.2], '#bdc3c7', 0.4);
}

function cactus(s: At): void {
  lathe(
    s,
    0,
    0,
    0,
    [
      [2.8, 0],
      [3.6, 4.6],
      [4, 5.2],
    ],
    '#c4673a',
    { cap: '#5d4037' },
  );
  cyl(s, 0, 0, 5, 1.9, 8.5, '#2e8b57', { cap: false });
  sphere(s, 0, 0, 13.5, 1.9, '#2e8b57');
  // due braccia
  rod(s, [-1.6, 0.4, 8.4], [-2.6, 0.4, 8.4], '#2e8b57', 1.6);
  cyl(s, -2.6, 0.4, 8, 0.9, 3.4, '#2e8b57', { cap: false });
  sphere(s, -2.6, 0.4, 11.4, 0.9, '#2e8b57');
  rod(s, [1.6, 0.4, 9.9], [2.4, 0.4, 9.9], '#2e8b57', 1.4);
  cyl(s, 2.4, 0.4, 9.5, 0.8, 2.6, '#2e8b57', { cap: false });
  sphere(s, 2.4, 0.4, 12.1, 0.8, '#2e8b57');
  sphere(s, 0.4, 0.4, 15.2, 0.9, '#ff7eb6');
}

function ametista(s: At, t: number): void {
  // pietra grezza e cristalli viola a sei facce, di altezze diverse (prima quelli dietro)
  lathe(
    s,
    0,
    0,
    0,
    [
      [6, 0],
      [5.4, 1.6],
      [3.6, 3],
    ],
    '#7f8c8d',
    { segments: 8, cap: '#95a5a6' },
  );
  const crystals: [number, number, number, number][] = [
    [0, -1.8, 11, 1.6],
    [-2.6, -1, 8, 1.3],
    [2.4, -1.4, 7, 1.2],
    [-1, 1.2, 6.5, 1.2],
    [1.8, 1.2, 5.5, 1],
  ];
  for (const [x, y, h, r] of crystals)
    lathe(
      s,
      x,
      y,
      2.6,
      [
        [r, 0],
        [r, h * 0.75],
        [0, h],
      ],
      '#8e44ad',
      { segments: 6, edge: 'rgba(240,220,255,0.6)' },
    );
  // un luccichio che va e viene
  const g = P(s, 0, -1.8, 2.6 + 11 * 0.7);
  const ctx = ctxOf();
  ctx.fillStyle = `rgba(255,255,255,${0.4 + Math.sin(t * 2) * 0.35})`;
  ctx.beginPath();
  ctx.arc(g.x - 1, g.y, 1.2 * isoScale(), 0, Math.PI * 2);
  ctx.fill();
}

function horus(s: At, t: number): void {
  B(s, 0, 0, 0, 8, 6, 1.4, '#3e2723');
  cyl(s, 0, 0, 1.4, 0.6, 4, '#d4af37', { cap: false });
  standingDisc(s, 0, 10, 5.2, 1.4, '#d4af37', (ctx, r) => {
    const g = ctx.createRadialGradient(-r * 0.3, r * 0.3, 0.5, 0, 0, r);
    g.addColorStop(0, '#2e86de');
    g.addColorStop(1, '#0c2461');
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.arc(0, 0, r * 0.82, 0, Math.PI * 2);
    ctx.fill();
    // l'occhio, d'oro
    ctx.strokeStyle = '#f6c90e';
    ctx.lineWidth = r * 0.1;
    ctx.beginPath();
    ctx.moveTo(-r * 0.55, 0);
    ctx.quadraticCurveTo(0, r * 0.45, r * 0.55, 0);
    ctx.quadraticCurveTo(0, -r * 0.35, -r * 0.55, 0);
    ctx.stroke();
    ctx.fillStyle = '#f6c90e';
    ctx.beginPath();
    ctx.arc(0, r * 0.02, r * 0.16, 0, Math.PI * 2);
    ctx.fill();
    ctx.beginPath();
    ctx.moveTo(-r * 0.05, -r * 0.2);
    ctx.quadraticCurveTo(-r * 0.1, -r * 0.6, -r * 0.4, -r * 0.55);
    ctx.stroke();
    ctx.fillStyle = `rgba(255,255,255,${0.25 + Math.sin(t * 1.5) * 0.2})`;
    ctx.beginPath();
    ctx.arc(-r * 0.35, r * 0.4, r * 0.12, 0, Math.PI * 2);
    ctx.fill();
  });
}

function sveglia(s: At): void {
  // piedini, campane in cima, poi la cassa rotonda rossa con il quadrante
  for (const x of [-2.6, 2.6]) rod(s, [x, 0, 0], [x * 0.7, 0, 3], '#7f8c8d', 0.7);
  sphere(s, -2.8, -0.4, 13.2, 1.8, '#d4af37');
  sphere(s, 2.8, -0.4, 13.2, 1.8, '#d4af37');
  rod(s, [-2.8, -0.4, 14.6], [2.8, -0.4, 14.6], '#b8860b', 0.5);
  standingDisc(s, 0, 8.2, 5, 3, '#c0392b', (ctx, r) => {
    ctx.fillStyle = '#fdfdfd';
    ctx.beginPath();
    ctx.arc(0, 0, r * 0.8, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#2d3436';
    for (let i = 0; i < 12; i++) {
      const a = (Math.PI * 2 * i) / 12;
      ctx.fillRect(Math.cos(a) * r * 0.68 - 0.2, Math.sin(a) * r * 0.68 - 0.2, 0.4, 0.4);
    }
    ctx.strokeStyle = '#2d3436';
    ctx.lineWidth = r * 0.1;
    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.lineTo(0, r * 0.55);
    ctx.moveTo(0, 0);
    ctx.lineTo(r * 0.38, -r * 0.1);
    ctx.stroke();
  });
}

function barca(s: At, t: number): void {
  // supporti, scafo che si stringe a prua, ponte, albero, vele e bandierina
  for (const x of [-3.5, 3.5]) B(s, x, 0, 0, 1.2, 4, 2.4, '#5d4037');
  B(s, 0, 0, 2.4, 13, 3.6, 3.2, '#8b4513', { top: '#d2a679' });
  front(s, 0, 1.85, 2.4, (ctx) => {
    ctx.fillStyle = '#ecf0f1';
    ctx.fillRect(-6.5, 2.2, 13, 0.6);
  });
  // prua a punta, davanti a destra
  const ctx = ctxOf();
  const a = P(s, 6.5, -1.8, 5.6),
    b = P(s, 6.5, 1.8, 5.6),
    c = P(s, 9.5, 0, 5.8),
    d = P(s, 6.5, 0, 2.4);
  ctx.fillStyle = '#6e2c00';
  ctx.beginPath();
  ctx.moveTo(b.x, b.y);
  ctx.lineTo(c.x, c.y);
  ctx.lineTo(d.x, d.y);
  ctx.closePath();
  ctx.fill();
  ctx.fillStyle = '#d2a679';
  ctx.beginPath();
  ctx.moveTo(a.x, a.y);
  ctx.lineTo(c.x, c.y);
  ctx.lineTo(b.x, b.y);
  ctx.closePath();
  ctx.fill();
  cyl(s, 0, 0, 5.6, 0.35, 12, '#5d4037', { cap: false });
  front(s, 0, 0.4, 6.6, (fc) => {
    // vela grande gonfiata dal vento e fiocco
    fc.fillStyle = '#fdfefe';
    fc.strokeStyle = 'rgba(120,120,120,0.6)';
    fc.lineWidth = 0.25;
    fc.beginPath();
    fc.moveTo(-0.4, 0.4);
    fc.quadraticCurveTo(-5.5 - Math.sin(t * 1.5) * 0.4, 4, -0.4, 10.5);
    fc.closePath();
    fc.fill();
    fc.stroke();
    fc.beginPath();
    fc.moveTo(0.4, 0.4);
    fc.lineTo(6.5, 0.4);
    fc.lineTo(0.4, 9);
    fc.closePath();
    fc.fill();
    fc.stroke();
    fc.fillStyle = '#e74c3c';
    fc.beginPath();
    fc.moveTo(0, 11);
    fc.lineTo(2.6 + Math.sin(t * 4) * 0.3, 11.7);
    fc.lineTo(0, 12.4);
    fc.fill();
  });
}

function telescopio(s: At): void {
  // treppiede (due gambe dietro, il tubo, la gamba davanti)
  const top: V3 = [0, 0, 10];
  rod(s, top, [-5, -2.5, 0], '#6d4c41', 0.7);
  rod(s, top, [5, -2.5, 0], '#6d4c41', 0.7);
  cyl(s, 0, 0, 9.4, 1, 1.4, '#3d2b1f');
  tube(s, [-7, 0, 9.4], [7.5, 0, 14.6], 1.5, '#d4af37');
  tube(s, [6.2, 0, 14.1], [8.8, 0, 15.1], 1.9, '#b8860b');
  rod(s, top, [0, 3.5, 0], '#8d6e63', 0.7);
}

function scacchi(s: At): void {
  const board = B(s, 0, 0, 0, 14, 10, 1.6, '#5d4037');
  onFace(board, 'top', (W: number, H: number) => {
    const ctx = ctxOf();
    const n = 8,
      cw = (W * 0.88) / n,
      ch = (H * 0.88) / n;
    for (let i = 0; i < n; i++)
      for (let j = 0; j < n; j++) {
        ctx.fillStyle = (i + j) % 2 ? '#3e2723' : '#f5deb3';
        ctx.fillRect(W * 0.06 + cw * i, H * 0.06 + ch * j, cw, ch);
      }
  });
  // re e pedoni, neri dietro e bianchi davanti
  const piece = (x: number, y: number, h: number, c: string, king: boolean) => {
    lathe(
      s,
      x,
      y,
      1.6,
      [
        [0.9, 0],
        [0.5, h * 0.6],
        [0.35, h],
      ],
      c,
    );
    if (king) rod(s, [x, y, 1.6 + h], [x, y, 1.6 + h + 1.4], c, 0.4);
    else sphere(s, x, y, 1.6 + h + 0.4, 0.55, c);
  };
  piece(-3.5, -2.5, 4.5, '#2d3436', true);
  piece(-1, -2.6, 2, '#2d3436', false);
  piece(2.5, -1.5, 2, '#2d3436', false);
  piece(-2.5, 2.2, 2, '#fdfefe', false);
  piece(1.2, 2.4, 2, '#fdfefe', false);
  piece(4, 1.5, 4.5, '#fdfefe', true);
}

function carillon(s: At, t: number): void {
  // coperchio aperto dietro con lo specchio, la scatola, la ballerina che gira
  const lid = B(s, 0, -4, 5, 13, 0.8, 8, '#8b5a2b');
  onFace(lid, 'left', (W: number, H: number) => {
    const ctx = ctxOf();
    const g = ctx.createLinearGradient(0, 0, W, H);
    g.addColorStop(0, '#d6eaf8');
    g.addColorStop(1, '#85929e');
    ctx.fillStyle = g;
    ctx.fillRect(W * 0.12, H * 0.12, W * 0.76, H * 0.76);
  });
  const body = B(s, 0, 0.4, 0, 13, 8.4, 5, '#a0522d', { top: '#f8c8dc' });
  onFace(body, 'left', (W: number, H: number) => {
    const ctx = ctxOf();
    ctx.strokeStyle = '#d4af37';
    ctx.lineWidth = H * 0.08;
    ctx.strokeRect(W * 0.08, H * 0.18, W * 0.84, H * 0.64);
    ctx.fillStyle = '#d4af37';
    ctx.fillRect(W * 0.45, H * 0.35, W * 0.1, H * 0.3);
  });
  const a = t * 1.2;
  cyl(s, 0, 0.4, 5, 0.3, 2, '#d4af37', { cap: false });
  lathe(
    s,
    0,
    0.4,
    7,
    [
      [2.2, 0],
      [0.6, 1.2],
      [0.5, 3.4],
    ],
    '#ff9ff3',
  );
  sphere(s, 0, 0.4, 11.4, 0.9, '#f5cba7');
  rod(s, [0, 0.4, 10.2], [Math.cos(a) * 1.8, 0.4 + Math.sin(a) * 1.8, 11.4], '#f5cba7', 0.35);
  rod(s, [0, 0.4, 10.2], [-Math.cos(a) * 1.8, 0.4 - Math.sin(a) * 1.8, 11.4], '#f5cba7', 0.35);
}

function bussola(s: At, t: number): void {
  // il coperchio aperto in piedi dietro, poi la scatola d'ottone con la rosa dei venti e l'ago
  front(s, 0, -5.6, 2.4, (ctx) => {
    ctx.fillStyle = '#b8860b';
    ctx.beginPath();
    ctx.arc(0, 6.4, 6.4, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = '#8a6d0b';
    ctx.lineWidth = 0.4;
    ctx.beginPath();
    ctx.arc(0, 6.4, 4.8, 0, Math.PI * 2);
    ctx.stroke();
  });
  cyl(s, 0, 0, 0, 6.5, 2.8, '#b8860b', { cap: '#d4af37' });
  flat(s, 0, 0, 2.82, (ctx) => {
    ctx.fillStyle = '#fdf6e3';
    ctx.beginPath();
    ctx.arc(0, 0, 5.2, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = '#7f6000';
    ctx.lineWidth = 0.2;
    for (let i = 0; i < 16; i++) {
      const a = (Math.PI * 2 * i) / 16;
      ctx.beginPath();
      ctx.moveTo(Math.cos(a) * 4.4, Math.sin(a) * 4.4);
      ctx.lineTo(Math.cos(a) * 5, Math.sin(a) * 5);
      ctx.stroke();
    }
    const a = Math.sin(t * 0.7) * 0.25 - Math.PI / 2;
    for (const [sgn, col] of [
      [1, '#c0392b'],
      [-1, '#2d3436'],
    ] as [number, string][]) {
      ctx.fillStyle = col;
      ctx.beginPath();
      ctx.moveTo(sgn * Math.cos(a) * 4, sgn * Math.sin(a) * 4);
      ctx.lineTo(Math.cos(a + 1.6) * 0.6, Math.sin(a + 1.6) * 0.6);
      ctx.lineTo(Math.cos(a - 1.6) * 0.6, Math.sin(a - 1.6) * 0.6);
      ctx.fill();
    }
  });
  // il vetro sopra, con un riflesso
  disc(s, 0, 0, 2.9, 5.4, '#ffffff', 0.12);
}

function lente(s: At): void {
  B(s, 0, 0, 0, 7, 6, 1.4, '#3e2723');
  cyl(s, 0, 0, 1.4, 0.9, 6, '#6d4c41', { cap: false });
  cyl(s, 0, 0, 7.4, 1.3, 1, '#b8860b', { cap: false });
  standingDisc(
    s,
    0,
    13,
    5,
    1,
    '#b8860b',
    (ctx, r) => {
      const g = ctx.createLinearGradient(-r, r, r, -r);
      g.addColorStop(0, 'rgba(174,214,241,0.55)');
      g.addColorStop(0.5, 'rgba(235,245,251,0.35)');
      g.addColorStop(1, 'rgba(133,193,233,0.6)');
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.arc(0, 0, r * 0.84, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = 'rgba(255,255,255,0.85)';
      ctx.lineWidth = 0.5;
      ctx.beginPath();
      ctx.arc(0, 0, r * 0.6, Math.PI * 0.6, Math.PI * 0.95);
      ctx.stroke();
    },
    0.9,
  );
}

function farfalla(s: At, t: number): void {
  // teca di legno in piedi, profonda, con la farfalla dietro il vetro
  const frame = B(s, 0, 0, 0, 13, 3.4, 15, '#4e342e', { top: '#6d4c41' });
  onFace(frame, 'left', (W: number, H: number) => {
    const ctx = ctxOf();
    ctx.fillStyle = '#f5f0e1';
    ctx.fillRect(W * 0.1, H * 0.08, W * 0.8, H * 0.84);
    const cx = W / 2,
      cy = H / 2;
    const flap = 0.85 + Math.sin(t * 2) * 0.05;
    for (const sd of [-1, 1]) {
      ctx.fillStyle = '#2e86de';
      ctx.beginPath();
      ctx.ellipse(
        cx + sd * W * 0.17 * flap,
        cy - H * 0.1,
        W * 0.17 * flap,
        H * 0.14,
        sd * 0.5,
        0,
        7,
      );
      ctx.fill();
      ctx.fillStyle = '#54a0ff';
      ctx.beginPath();
      ctx.ellipse(
        cx + sd * W * 0.13 * flap,
        cy + H * 0.1,
        W * 0.11 * flap,
        H * 0.1,
        -sd * 0.4,
        0,
        7,
      );
      ctx.fill();
      ctx.fillStyle = '#0c2461';
      ctx.beginPath();
      ctx.arc(cx + sd * W * 0.22, cy - H * 0.14, W * 0.035, 0, 7);
      ctx.fill();
    }
    ctx.fillStyle = '#2d3436';
    ctx.fillRect(cx - W * 0.02, cy - H * 0.18, W * 0.04, H * 0.34);
    // vetro con il riflesso
    ctx.fillStyle = 'rgba(255,255,255,0.18)';
    ctx.beginPath();
    ctx.moveTo(W * 0.1, H * 0.08);
    ctx.lineTo(W * 0.4, H * 0.08);
    ctx.lineTo(W * 0.1, H * 0.5);
    ctx.fill();
  });
}

function macchina(s: At): void {
  // base, corpo, tasti a gradini, rullo e foglio
  B(s, 0, 0.6, 0, 15, 9, 2.2, '#1e4d3a');
  B(s, 0, -1.4, 2.2, 14, 5, 3.4, '#245c44');
  for (let row = 2; row >= 0; row--)
    for (let i = 0; i < 6; i++)
      cyl(s, -5 + i * 2, 4.2 - row * 1.3, 2.2 + row * 0.35, 0.55, 0.5, '#f5f5f5', {
        cap: '#ecf0f1',
      });
  const sheet = B(s, 0, -1.6, 6.4, 8, 0.4, 6.5, '#fdfefe', { right: '#e5e8e8' });
  onFace(sheet, 'left', (W: number, H: number) => {
    const ctx = ctxOf();
    ctx.fillStyle = '#7f8c8d';
    for (let i = 0; i < 4; i++)
      ctx.fillRect(W * 0.12, H * (0.15 + i * 0.16), W * (0.7 - i * 0.12), H * 0.04);
  });
  tube(s, [-7.4, -1.4, 6.4], [7.4, -1.4, 6.4], 1.1, '#2d3436');
}

function fossile(s: At): void {
  lathe(
    s,
    0,
    0,
    0,
    [
      [5.5, 0],
      [4.6, 1.8],
      [3, 2.6],
    ],
    '#8d8d8d',
    { segments: 9, cap: '#a5a5a5' },
  );
  standingDisc(s, 0, 9.4, 6.8, 2.8, '#c8a97e', (ctx, r) => {
    // la spirale della conchiglia, con le costole
    ctx.strokeStyle = '#7d5a35';
    ctx.lineWidth = 0.45;
    ctx.beginPath();
    for (let i = 0; i <= 80; i++) {
      const a = i * 0.16;
      const rr = r * 0.9 * Math.exp(-a * 0.17);
      if (i) ctx.lineTo(Math.cos(a) * rr, Math.sin(a) * rr);
      else ctx.moveTo(Math.cos(a) * rr, Math.sin(a) * rr);
    }
    ctx.stroke();
    ctx.strokeStyle = 'rgba(125,90,53,0.45)';
    ctx.lineWidth = 0.25;
    for (let i = 0; i < 18; i++) {
      const a = i * 0.7;
      const rr = r * 0.9 * Math.exp(-a * 0.17);
      ctx.beginPath();
      ctx.moveTo(Math.cos(a) * rr, Math.sin(a) * rr);
      ctx.lineTo(Math.cos(a) * rr * 0.72, Math.sin(a) * rr * 0.72);
      ctx.stroke();
    }
  });
}

function lanterna(s: At, t: number): void {
  cyl(s, 0, 0, 0, 3.8, 2.2, '#a93226');
  // la fiamma, poi il vetro sopra, le sbarre, il cappello e la maniglia
  const f = P(s, 0, 0, 5.4);
  const ctx = ctxOf();
  const sc = Math.abs(P(s, 0, 0, 1).y - P(s, 0, 0, 0).y);
  const flick = 1 + Math.sin(t * 9) * 0.08;
  const g = ctx.createRadialGradient(f.x, f.y, 0, f.x, f.y, sc * 4);
  g.addColorStop(0, 'rgba(255,214,102,0.9)');
  g.addColorStop(1, 'rgba(255,214,102,0)');
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.arc(f.x, f.y, sc * 4, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = '#f39c12';
  ctx.beginPath();
  ctx.ellipse(f.x, f.y, sc * 0.9, sc * 1.8 * flick, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = '#fff3c4';
  ctx.beginPath();
  ctx.ellipse(f.x, f.y + sc * 0.3, sc * 0.4, sc * 0.9 * flick, 0, 0, Math.PI * 2);
  ctx.fill();
  lathe(
    s,
    0,
    0,
    2.2,
    [
      [3, 0],
      [3.3, 3.5],
      [3, 7],
    ],
    '#fdebd0',
    { alpha: 0.35, cap: false },
  );
  for (const a of [-0.4, 0.8, 2]) {
    const x = Math.cos(a) * 3.1,
      y = Math.sin(a) * 3.1;
    rod(s, [x, y, 2.2], [x, y, 9.2], '#922b21', 0.4);
  }
  lathe(
    s,
    0,
    0,
    9.2,
    [
      [3.8, 0],
      [1.2, 3],
    ],
    '#a93226',
  );
  front(s, 0, 0, 12.2, (c) => {
    c.strokeStyle = '#2d3436';
    c.lineWidth = 0.5;
    c.beginPath();
    c.arc(0, 0.6, 2, 0, Math.PI);
    c.stroke();
  });
}

function vaso(s: At): void {
  // profilo del vaso girato al tornio, con il decoro blu davanti
  lathe(
    s,
    0,
    0,
    0,
    [
      [2.6, 0],
      [3.8, 1.5],
      [5.3, 5],
      [5, 8.5],
      [3, 11.5],
      [1.9, 13],
      [2.4, 15],
    ],
    '#f4f6f7',
    { cap: '#d5dbdb' },
  );
  front(s, 0, 4.4, 0, (ctx) => {
    ctx.strokeStyle = '#1f4e9c';
    ctx.lineWidth = 0.45;
    ctx.beginPath();
    ctx.moveTo(-3.4, 2.2);
    ctx.lineTo(3.4, 2.2);
    ctx.moveTo(-3.2, 10.6);
    ctx.lineTo(3.2, 10.6);
    ctx.stroke();
    ctx.fillStyle = '#1f4e9c';
    ctx.beginPath();
    ctx.moveTo(-1.8, 4.5);
    ctx.quadraticCurveTo(0, 9, 1.8, 4.5);
    ctx.quadraticCurveTo(0, 6, -1.8, 4.5);
    ctx.fill();
    for (const [x, y] of [
      [-2.6, 7.4],
      [2.6, 7.4],
      [0, 3.4],
    ] as [number, number][]) {
      ctx.beginPath();
      ctx.arc(x, y, 0.7, 0, Math.PI * 2);
      ctx.fill();
    }
  });
}

function maschera(s: At, t: number): void {
  // base, asta e la maschera con le piume che ondeggiano
  B(s, 0, 0, 0, 6, 5, 1.2, '#2d3436');
  cyl(s, 0, 0, 1.2, 0.4, 7, '#d4af37', { cap: false });
  front(s, 0, 0.6, 10.6, (ctx) => {
    for (let i = 0; i < 3; i++) {
      const a = -0.5 + i * 0.5 + Math.sin(t * 1.4 + i) * 0.06;
      ctx.save();
      ctx.translate(1.6, 1.4);
      ctx.rotate(a);
      ctx.fillStyle = ['#e84393', '#fdcb6e', '#a29bfe'][i];
      ctx.beginPath();
      ctx.ellipse(0, 3.4, 0.8, 3.4, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    }
    const g = ctx.createLinearGradient(-5, 0, 5, 0);
    g.addColorStop(0, '#f7dc6f');
    g.addColorStop(0.5, '#d4af37');
    g.addColorStop(1, '#9a7d0a');
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.moveTo(-5.2, 0.8);
    ctx.quadraticCurveTo(-4.4, 3.2, -1.6, 2.4);
    ctx.quadraticCurveTo(0, 1.4, 1.6, 2.4);
    ctx.quadraticCurveTo(4.4, 3.2, 5.2, 0.8);
    ctx.quadraticCurveTo(3, -2.4, 0, -0.8);
    ctx.quadraticCurveTo(-3, -2.4, -5.2, 0.8);
    ctx.fill();
    ctx.fillStyle = '#1b1b1b';
    for (const sd of [-1, 1]) {
      ctx.beginPath();
      ctx.ellipse(sd * 2.4, 0.8, 1.3, 0.75, sd * 0.2, 0, Math.PI * 2);
      ctx.fill();
    }
  });
}

function robot(s: At, t: number): void {
  // gambe, corpo, braccia, testa con gli occhi e l'antenna
  for (const x of [-1.8, 1.8]) B(s, x, 0, 0, 1.8, 2.4, 4, '#95a5a6');
  const body = B(s, 0, 0, 4, 8, 5, 6.5, '#bdc3c7', { top: '#d0d3d4' });
  onFace(body, 'left', (W: number, H: number) => {
    const ctx = ctxOf();
    ctx.fillStyle = '#2d3436';
    ctx.fillRect(W * 0.15, H * 0.2, W * 0.7, H * 0.5);
    const on = Math.floor(t * 3) % 3;
    ['#e74c3c', '#f1c40f', '#2ecc71'].forEach((c, i) => {
      ctx.fillStyle = i === on ? c : dark(c, 0.55);
      ctx.beginPath();
      ctx.arc(W * (0.3 + i * 0.2), H * 0.45, W * 0.07, 0, Math.PI * 2);
      ctx.fill();
    });
  });
  for (const x of [-4.8, 4.8]) B(s, x, 0, 6.2, 1.4, 1.8, 4, '#a6acaf');
  const head = B(s, 0, 0, 10.5, 6, 4.4, 4.6, '#d0d3d4', { top: '#e5e7e9' });
  onFace(head, 'left', (W: number, H: number) => {
    const ctx = ctxOf();
    ctx.fillStyle = '#2d3436';
    ctx.fillRect(W * 0.12, H * 0.25, W * 0.76, H * 0.32);
    ctx.fillStyle = '#5ce1e6';
    for (const fx of [0.32, 0.68]) {
      ctx.beginPath();
      ctx.arc(W * fx, H * 0.41, W * 0.08, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.fillStyle = '#7f8c8d';
    ctx.fillRect(W * 0.3, H * 0.72, W * 0.4, H * 0.08);
  });
  cyl(s, 0, 0, 15.1, 0.25, 2.2, '#7f8c8d', { cap: false });
  sphere(s, 0, 0, 17.6, 0.7, Math.floor(t * 2) % 2 ? '#e74c3c' : '#c0392b');
}

// ---------------------------------------------------------------- elenco

const SOLIDS: Record<string, (s: At, t: number) => void> = {
  col_tomo: tomo,
  col_globo: globo,
  col_clessidra: clessidra,
  col_sfera: sfera,
  col_pendolo: pendolo,
  col_torso: torso,
  col_busto: busto,
  col_lava: lava,
  col_fumetti: fumetti,
  col_manuale: manuale,
  col_newton: newton,
  col_cranio: cranio,
  col_giradischi: giradischi,
  col_cactus: cactus,
  col_ametista: ametista,
  col_horus: horus,
  col_sveglia: sveglia,
  col_barca: barca,
  col_telescopio: telescopio,
  col_scacchi: scacchi,
  col_carillon: carillon,
  col_bussola: bussola,
  col_lente: lente,
  col_farfalla: farfalla,
  col_macchina: macchina,
  col_fossile: fossile,
  col_lanterna: lanterna,
  col_vaso: vaso,
  col_maschera: maschera,
  col_robot: robot,
};

/**
 * Disegna il pezzo `id` in 3D appoggiato in (x, y, z), alto circa `size`. `facing` 1 lo gira con
 * la faccia davanti verso +x (mensola sulla parete di sinistra). False se non ha un modello 3D.
 */
export function drawCollectible3d(
  id: string,
  x: number,
  y: number,
  z: number,
  size: number,
  t: number,
  facing = 0,
): boolean {
  const draw = SOLIDS[id];
  if (!draw) return false;
  const prev = game.furnRot;
  game.furnRot = facing ? { k: facing, cx: x, cy: y } : null;
  try {
    draw({ x, y, z, k: size / 20, t }, t);
  } finally {
    game.furnRot = prev;
  }
  return true;
}
