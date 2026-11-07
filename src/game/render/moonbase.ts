// Base spaziale lunare: i suoi pezzi sulla luna (compaiono man mano che il progetto avanza) e la
// "diretta" che lo schermo del laboratorio mostra, disegnata a parte su una tela piccola.
import type { GameValue } from '../context.js';
import { game } from '../context.js';
import { isoProject, isoScale, poly } from './primitives.js';
import { box, ellipseShadow, onFace } from './objects.js';

type Pt = { x: number; y: number };
const P = (x: number, y: number, z: number): Pt => isoProject(x, y, z);

/** Centro della base sulla luna (per inquadrarla nella diretta). */
const BASE_CENTER = { x: 175, y: -5 };

/**
 * Pezzi della base: `stage` = fase del progetto da cui si vedono; `until` = fase da cui spariscono
 * (la gru del cantiere se ne va quando la base è finita).
 */
export const MOONBASE_PARTS: GameValue[] = [
  { kind: 'basePad', x: 230, y: 35, w: 56, h: 56, z: 2, stage: 1, flat: true, solid: false },
  {
    kind: 'baseDome',
    x: 140,
    y: -45,
    w: 56,
    h: 56,
    z: 44,
    r: 28,
    stage: 1,
    tint: '#dfe6e9',
    label: 'Base lunare 🌙',
  },
  { kind: 'baseSolar', x: 98, y: 25, w: 28, h: 46, z: 26, stage: 1 },
  { kind: 'baseCrates', x: 252, y: -31, w: 28, h: 20, z: 18, stage: 1 },
  { kind: 'baseCrane', x: 192, y: 5, w: 16, h: 16, z: 110, stage: 1, until: 3 },
  { kind: 'baseTunnel', x: 180, y: -45, w: 26, h: 14, z: 16, stage: 2 },
  { kind: 'baseDome', x: 220, y: -45, w: 50, h: 50, z: 40, r: 25, stage: 2, tint: '#f5f6fa' },
  { kind: 'baseDish', x: 265, y: -90, w: 26, h: 26, z: 52, stage: 2 },
  { kind: 'baseSolar', x: 98, y: 87, w: 28, h: 46, z: 26, stage: 2 },
  { kind: 'baseTunnelY', x: 140, y: -5, w: 14, h: 26, z: 16, stage: 3 },
  { kind: 'baseGreenhouse', x: 140, y: 33, w: 50, h: 50, z: 38, r: 25, stage: 3 },
  { kind: 'baseTower', x: 88, y: -97, w: 18, h: 18, z: 130, stage: 3 },
  { kind: 'baseRover', x: 205, y: 83, w: 34, h: 22, z: 18, stage: 3 },
];

/** Il pezzo si vede con la base a questa fase? */
export const partVisible = (p: GameValue, stage: number): boolean =>
  stage >= p.stage && !(p.until && stage >= p.until);

// ---------------------------------------------------------------- forme di base

/** Ellisse di un cerchio orizzontale di raggio r (in unità del mondo) a quota z. */
function ring(x: number, y: number, r: number, z: number): { c: Pt; rx: number; ry: number } {
  const s = isoScale();
  return { c: P(x, y, z), rx: r * 1.2247 * s, ry: r * 0.7071 * s };
}

/** Cilindro verticale (base dei moduli). */
function cylinder(
  x: number,
  y: number,
  r: number,
  z0: number,
  z1: number,
  color: string,
  dark: string,
) {
  const ctx = game.view.ctx;
  const a = ring(x, y, r, z0),
    b = ring(x, y, r, z1);
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.moveTo(a.c.x - a.rx, a.c.y);
  ctx.ellipse(a.c.x, a.c.y, a.rx, a.ry, 0, Math.PI, 0, true);
  ctx.lineTo(b.c.x + b.rx, b.c.y);
  ctx.ellipse(b.c.x, b.c.y, b.rx, b.ry, 0, 0, Math.PI, true);
  ctx.closePath();
  ctx.fill();
  // ombra sul lato destro
  const g = ctx.createLinearGradient(a.c.x - a.rx, 0, a.c.x + a.rx, 0);
  g.addColorStop(0, 'rgba(255,255,255,0.15)');
  g.addColorStop(0.6, 'rgba(0,0,0,0)');
  g.addColorStop(1, dark);
  ctx.fillStyle = g;
  ctx.fill();
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.ellipse(b.c.x, b.c.y, b.rx, b.ry, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = 'rgba(0,0,0,0.25)';
  ctx.lineWidth = 1;
  ctx.stroke();
}

/** Cupola (mezza sfera) sopra un cerchio di raggio r a quota z. */
function dome(
  x: number,
  y: number,
  r: number,
  z: number,
  fill: string | CanvasGradient,
  stroke: string,
) {
  const ctx = game.view.ctx;
  const s = isoScale();
  const b = ring(x, y, r, z);
  ctx.beginPath();
  ctx.ellipse(b.c.x, b.c.y, b.rx, b.ry, 0, 0, Math.PI);
  ctx.ellipse(b.c.x, b.c.y, b.rx, r * 1.05 * s, 0, Math.PI, Math.PI * 2);
  ctx.closePath();
  ctx.fillStyle = fill;
  ctx.fill();
  ctx.strokeStyle = stroke;
  ctx.lineWidth = 1;
  ctx.stroke();
  return b;
}

// ---------------------------------------------------------------- pezzi

function drawPad(it: GameValue, t: number): void {
  const ctx = game.view.ctx;
  const s = isoScale();
  const r = it.w / 2;
  const b = ring(it.x, it.y, r, 1);
  ctx.fillStyle = '#7f8c8d';
  ctx.beginPath();
  ctx.ellipse(b.c.x, b.c.y, b.rx, b.ry, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = '#f1c40f';
  ctx.lineWidth = 2 * s;
  ctx.beginPath();
  ctx.ellipse(b.c.x, b.c.y, b.rx * 0.82, b.ry * 0.82, 0, 0, Math.PI * 2);
  ctx.stroke();
  // grande H
  ctx.strokeStyle = '#ecf0f1';
  ctx.lineWidth = 3 * s;
  const h = (ax: number, ay: number, bx: number, by: number) => {
    const p1 = P(it.x + ax, it.y + ay, 2),
      p2 = P(it.x + bx, it.y + by, 2);
    ctx.beginPath();
    ctx.moveTo(p1.x, p1.y);
    ctx.lineTo(p2.x, p2.y);
    ctx.stroke();
  };
  h(-9, -12, -9, 12);
  h(9, -12, 9, 12);
  h(-9, 0, 9, 0);
  // lucine attorno che si accendono a giro
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * Math.PI * 2;
    const p = P(it.x + Math.cos(a) * r * 0.92, it.y + Math.sin(a) * r * 0.92, 2);
    const on = Math.floor(t * 4) % 8 === i;
    ctx.fillStyle = on ? '#ff6b6b' : 'rgba(255,107,107,0.35)';
    ctx.beginPath();
    ctx.arc(p.x, p.y, (on ? 2.2 : 1.5) * s, 0, 6.3);
    ctx.fill();
  }
}

function drawDomeModule(it: GameValue, t: number, lights?: GameValue[]): void {
  const ctx = game.view.ctx;
  const s = isoScale();
  const r = it.r || it.w / 2;
  ellipseShadow(it.x + 6, it.y + 6, r * 2.2, r * 1.3, 0.25);
  cylinder(it.x, it.y, r, 0, 12, '#b2bec3', 'rgba(0,0,0,0.35)');
  const top = P(it.x - r * 0.4, it.y - r * 0.4, 12 + r);
  const g = ctx.createRadialGradient(top.x, top.y, 2, top.x, top.y, r * 2 * s);
  g.addColorStop(0, '#ffffff');
  g.addColorStop(1, it.tint || '#dfe6e9');
  dome(it.x, it.y, r, 12, g, 'rgba(0,0,0,0.3)');
  // finestrelle illuminate sul fronte
  for (let i = 0; i < 3; i++) {
    const a = Math.PI * 0.25 + i * 0.22;
    const p = P(it.x + Math.cos(a) * r * 1.0, it.y + Math.sin(a) * r * 1.0, 7);
    ctx.fillStyle = `rgba(255,214,120,${0.75 + 0.2 * Math.sin(t * 2 + i)})`;
    ctx.fillRect(p.x - 2.2 * s, p.y - 3 * s, 4.4 * s, 4 * s);
  }
  // portellone e scritta
  const d = P(it.x + r * 0.71, it.y + r * 0.71, 0);
  ctx.fillStyle = '#636e72';
  ctx.fillRect(d.x - 4 * s, d.y - 10 * s, 8 * s, 10 * s);
  const label = P(it.x, it.y, 12 + r * 0.55);
  ctx.fillStyle = '#e74c3c';
  ctx.font = `bold ${Math.round(6 * s)}px sans-serif`;
  ctx.textAlign = 'center';
  ctx.fillText('CDC', label.x, label.y);
  if (lights) lights.push({ x: it.x, y: it.y, z: 20, r: 110, color: '255,225,170' });
}

function drawGreenhouse(it: GameValue, t: number, lights?: GameValue[]): void {
  const ctx = game.view.ctx;
  const s = isoScale();
  const r = it.r || it.w / 2;
  ellipseShadow(it.x + 6, it.y + 6, r * 2.2, r * 1.3, 0.2);
  cylinder(it.x, it.y, r, 0, 6, '#95a5a6', 'rgba(0,0,0,0.3)');
  // piante dentro
  for (let i = 0; i < 9; i++) {
    const a = i * 2.4;
    const d = r * 0.55 * ((i % 3) / 2 + 0.2);
    const p = P(it.x + Math.cos(a) * d, it.y + Math.sin(a) * d, 6);
    const sway = Math.sin(t * 1.5 + i) * 1 * s;
    ctx.fillStyle = i % 2 ? '#2ecc71' : '#27ae60';
    ctx.beginPath();
    ctx.ellipse(p.x + sway, p.y - 6 * s, 4 * s, 7 * s, 0, 0, 6.3);
    ctx.fill();
    if (i % 3 === 0) {
      ctx.fillStyle = '#e74c3c';
      ctx.beginPath();
      ctx.arc(p.x + sway + 1.5 * s, p.y - 8 * s, 1.3 * s, 0, 6.3);
      ctx.fill();
    }
  }
  // cupola di vetro con i montanti
  const glass = 'rgba(180,230,255,0.28)';
  const b = dome(it.x, it.y, r, 6, glass, 'rgba(255,255,255,0.8)');
  ctx.strokeStyle = 'rgba(255,255,255,0.55)';
  ctx.lineWidth = 0.8;
  for (let i = 1; i < 4; i++) {
    ctx.beginPath();
    ctx.ellipse(b.c.x, b.c.y, b.rx * (1 - i * 0.25), r * 1.05 * s, 0, Math.PI, Math.PI * 2);
    ctx.stroke();
  }
  if (lights) lights.push({ x: it.x, y: it.y, z: 15, r: 90, color: '170,255,170' });
}

function drawTunnel(it: GameValue): void {
  box(it.x, it.y, it.w, it.h, it.z, '#a4b0be', { top: '#dfe4ea' });
}

function drawSolar(it: GameValue, t: number): void {
  const ctx = game.view.ctx;
  // due pannelli inclinati su un palo
  for (const dy of [-it.h / 4, it.h / 4]) {
    box(it.x, it.y + dy, 3, 3, 12, '#636e72');
    const z = 12;
    const tilt = 8 + Math.sin(t * 0.2) * 1;
    const a = P(it.x - it.w / 2, it.y + dy - it.h / 4 + 2, z),
      b = P(it.x + it.w / 2, it.y + dy - it.h / 4 + 2, z + tilt),
      c = P(it.x + it.w / 2, it.y + dy + it.h / 4 - 2, z + tilt),
      d = P(it.x - it.w / 2, it.y + dy + it.h / 4 - 2, z);
    poly([a, b, c, d], '#1e3799', 'rgba(255,255,255,0.6)', 1);
    // righe delle celle
    ctx.strokeStyle = 'rgba(130,170,255,0.6)';
    ctx.lineWidth = 0.6;
    for (let i = 1; i < 4; i++) {
      const k = i / 4;
      ctx.beginPath();
      ctx.moveTo(a.x + (b.x - a.x) * k, a.y + (b.y - a.y) * k);
      ctx.lineTo(d.x + (c.x - d.x) * k, d.y + (c.y - d.y) * k);
      ctx.stroke();
    }
  }
}

function drawCrates(it: GameValue): void {
  box(it.x - 6, it.y, 14, 14, 12, '#d35400', { top: '#e67e22' });
  box(it.x + 8, it.y + 2, 12, 12, 10, '#7f8c8d', { top: '#95a5a6' });
  box(it.x - 4, it.y - 1, 10, 10, 8, '#f39c12', { z0: 12, top: '#f6b93b' });
}

function drawCrane(it: GameValue, t: number): void {
  const ctx = game.view.ctx;
  const s = isoScale();
  box(it.x, it.y, 14, 14, 4, '#2d3436');
  // traliccio giallo
  const h = it.z;
  for (let z = 4; z < h; z += 12)
    box(it.x, it.y, 6, 6, 11, '#f1c40f', { z0: z, edge: 'rgba(0,0,0,0.45)' });
  // braccio che ruota lentamente
  const a = t * 0.25;
  const tip = P(it.x + Math.cos(a) * 60, it.y + Math.sin(a) * 60, h);
  const back = P(it.x - Math.cos(a) * 18, it.y - Math.sin(a) * 18, h);
  ctx.strokeStyle = '#f1c40f';
  ctx.lineWidth = 3 * s;
  ctx.beginPath();
  ctx.moveTo(back.x, back.y);
  ctx.lineTo(tip.x, tip.y);
  ctx.stroke();
  // cavo e carico
  const load = P(it.x + Math.cos(a) * 50, it.y + Math.sin(a) * 50, h - 40 - Math.sin(t) * 6);
  const hook = P(it.x + Math.cos(a) * 50, it.y + Math.sin(a) * 50, h);
  ctx.strokeStyle = '#2d3436';
  ctx.lineWidth = 0.8;
  ctx.beginPath();
  ctx.moveTo(hook.x, hook.y);
  ctx.lineTo(load.x, load.y);
  ctx.stroke();
  ctx.fillStyle = '#b2bec3';
  ctx.fillRect(load.x - 5 * s, load.y, 10 * s, 6 * s);
}

function drawDish(it: GameValue, t: number): void {
  const ctx = game.view.ctx;
  const s = isoScale();
  box(it.x, it.y, 4, 4, it.z - 14, '#b2bec3');
  const c = P(it.x, it.y, it.z - 8);
  const a = Math.sin(t * 0.3) * 0.4 - 0.5;
  ctx.fillStyle = '#ecf0f1';
  ctx.strokeStyle = '#95a5a6';
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.ellipse(c.x, c.y, 14 * s, 7 * s, a, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();
  ctx.strokeStyle = '#7f8c8d';
  ctx.beginPath();
  ctx.moveTo(c.x, c.y);
  ctx.lineTo(c.x + Math.cos(a - 1.2) * 10 * s, c.y - 9 * s);
  ctx.stroke();
}

function drawTower(it: GameValue, t: number, lights?: GameValue[]): void {
  const ctx = game.view.ctx;
  const s = isoScale();
  box(it.x, it.y, 16, 16, 4, '#2d3436');
  for (let z = 4; z < it.z; z += 14) {
    const k = 1 - z / it.z / 2;
    box(it.x, it.y, 8 * k, 8 * k, 13, '#dfe6e9', { z0: z, edge: 'rgba(0,0,0,0.4)' });
  }
  // luce rossa che lampeggia in cima
  const on = Math.floor(t * 1.5) % 2 === 0;
  const p = P(it.x, it.y, it.z + 3);
  ctx.fillStyle = on ? '#ff3b3b' : '#5a1a1a';
  ctx.beginPath();
  ctx.arc(p.x, p.y, 3 * s, 0, 6.3);
  ctx.fill();
  if (on) {
    ctx.fillStyle = 'rgba(255,60,60,0.25)';
    ctx.beginPath();
    ctx.arc(p.x, p.y, 9 * s, 0, 6.3);
    ctx.fill();
    if (lights) lights.push({ x: it.x, y: it.y, z: it.z, r: 70, color: '255,80,80' });
  }
}

function drawRover(it: GameValue, t: number): void {
  const ctx = game.view.ctx;
  const s = isoScale();
  // va avanti e indietro davanti alla base
  const dx = Math.sin(t * 0.25) * 40;
  const x = it.x + dx,
    y = it.y;
  ellipseShadow(x, y, 20, 12, 0.25);
  for (const [ox, oy] of [
    [-10, -8],
    [10, -8],
    [-10, 8],
    [10, 8],
  ]) {
    const w = P(x + ox, y + oy, 4);
    ctx.fillStyle = '#2d3436';
    ctx.beginPath();
    ctx.arc(w.x, w.y, 4 * s, 0, 6.3);
    ctx.fill();
  }
  box(x, y, 26, 16, 6, '#ecf0f1', { z0: 4, top: '#f5f6fa' });
  box(x - 4, y, 10, 12, 6, '#0984e3', { z0: 10 });
  const ant = P(x + 8, y - 4, 22);
  const base = P(x + 8, y - 4, 10);
  ctx.strokeStyle = '#636e72';
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(base.x, base.y);
  ctx.lineTo(ant.x, ant.y);
  ctx.stroke();
}

/** Disegni dei pezzi, per tipo (si aggiungono a PROP_DRAW). */
export const MOONBASE_DRAW: Record<
  string,
  (it: GameValue, t: number, lights?: GameValue[]) => void
> = {
  basePad: drawPad,
  baseDome: drawDomeModule,
  baseGreenhouse: drawGreenhouse,
  baseTunnel: drawTunnel,
  baseTunnelY: drawTunnel,
  baseSolar: drawSolar,
  baseCrates: drawCrates,
  baseCrane: drawCrane,
  baseDish: drawDish,
  baseTower: drawTower,
  baseRover: drawRover,
};

// ---------------------------------------------------------------- diretta per lo schermo

/**
 * Disegna la base com'è adesso su una tela a parte (la "telecamera" sulla luna): cielo nero con le
 * stelle, suolo grigio e i pezzi della fase raggiunta, in ordine di profondità.
 */
export function renderMoonbaseView(
  cv: HTMLCanvasElement,
  stage: number,
  t: number,
  blueprint = false,
): void {
  const ctx = cv.getContext('2d');
  if (!ctx) return;
  const W = cv.width,
    H = cv.height;
  if (blueprint) {
    ctx.fillStyle = '#0b3d91';
    ctx.fillRect(0, 0, W, H);
  } else {
    const sky = ctx.createLinearGradient(0, 0, 0, H);
    sky.addColorStop(0, '#02030a');
    sky.addColorStop(1, '#141826');
    ctx.fillStyle = sky;
    ctx.fillRect(0, 0, W, H);
    for (let i = 0; i < 40; i++) {
      ctx.fillStyle = `rgba(255,255,255,${0.4 + ((i * 37) % 10) / 20})`;
      ctx.fillRect((i * 73) % W, (i * 29) % (H * 0.5), 1, 1);
    }
    // la Terra in lontananza
    ctx.fillStyle = '#3c8dde';
    ctx.beginPath();
    ctx.arc(W * 0.85, H * 0.16, H * 0.07, 0, 6.3);
    ctx.fill();
    ctx.fillStyle = '#4cd137';
    ctx.beginPath();
    ctx.arc(W * 0.84, H * 0.15, H * 0.03, 0, 6.3);
    ctx.fill();
  }
  const scale = H / 260;
  const c = BASE_CENTER;
  const cx = W / 2 - (c.x - c.y) * 0.866 * scale,
    cy = H * 0.62 - (c.x + c.y) * 0.5 * scale;
  const savedCtx: GameValue = game.view.ctx;
  const savedCurve = game.moonCurve;
  game.view.ctx = ctx;
  game.viewOverride = { cx, cy, scale };
  game.moonCurve = 0;
  try {
    // suolo lunare (un rombo grigio attorno alla base)
    const R = 150;
    poly(
      [
        P(c.x - R, c.y - R, 0),
        P(c.x + R, c.y - R, 0),
        P(c.x + R, c.y + R, 0),
        P(c.x - R, c.y + R, 0),
      ],
      blueprint ? 'rgba(255,255,255,0.08)' : '#8e8e88',
      blueprint ? 'rgba(255,255,255,0.4)' : null,
    );
    if (!blueprint)
      for (const [dx, dy, r] of [
        [75, -75, 14],
        [-85, -25, 10],
        [85, 85, 9],
      ]) {
        const b = ring(c.x + dx, c.y + dy, r, 0);
        ctx.fillStyle = '#7d7d76';
        ctx.beginPath();
        ctx.ellipse(b.c.x, b.c.y, b.rx, b.ry, 0, 0, 6.3);
        ctx.fill();
      }
    MOONBASE_PARTS.filter((p) => partVisible(p, stage))
      .sort((a, b) => (a.flat ? -1e5 : 0) + a.x + a.y - ((b.flat ? -1e5 : 0) + b.x + b.y))
      .forEach((p) => MOONBASE_DRAW[p.kind]?.(p, t));
  } finally {
    game.view.ctx = savedCtx;
    game.viewOverride = null;
    game.moonCurve = savedCurve;
  }
}

// ---------------------------------------------------------------- schermo nel laboratorio

let live: HTMLCanvasElement | null = null;
let liveAt = -1;

/**
 * Grande schermo su un piedistallo nel laboratorio ingegneristico: trasmette "in diretta" la base
 * lunare com'è adesso, con la scritta LIVE, la fase raggiunta e la barra dei soldi raccolti.
 */
export function drawMoonScreen(it: GameValue, t: number, lights?: GameValue[]): void {
  const ctx = game.view.ctx;
  const stage = game.moonBaseStage || 0;
  const funded = game.moonBaseFunded || 0;
  // la "telecamera" sulla luna si aggiorna qualche volta al secondo
  if (typeof document !== 'undefined') {
    live ??= document.createElement('canvas');
    if (live.width !== 240) {
      live.width = 240;
      live.height = 140;
    }
    if (Math.abs(t - liveAt) > 0.2) {
      liveAt = t;
      renderMoonbaseView(live, stage, t);
    }
  }
  const { x, y, w, z } = it;
  box(x, y + 4, 26, 18, 4, '#2d3436');
  box(x, y + 4, 6, 6, z - 64, '#636e72', { z0: 4 });
  const scr = box(x, y, w, 6, 62, '#1e272e', { z0: z - 64 });
  onFace(scr, 'left', (W: number, H: number): void => {
    ctx.fillStyle = '#000';
    ctx.fillRect(2, 2, W - 4, H - 4);
    if (live) ctx.drawImage(live, 3, 3, W - 6, H - 6);
    // scritte sopra l'immagine
    const on = Math.floor(t * 1.5) % 2 === 0;
    ctx.fillStyle = 'rgba(0,0,0,0.55)';
    ctx.fillRect(3, 3, W - 6, 8);
    ctx.fillStyle = on ? '#ff3b3b' : '#7a1a1a';
    ctx.beginPath();
    ctx.arc(7, 7, 2, 0, 6.3);
    ctx.fill();
    ctx.fillStyle = '#fff';
    ctx.font = 'bold 5px sans-serif';
    ctx.textAlign = 'left';
    ctx.fillText('LIVE · BASE LUNARE', 11, 9);
    ctx.textAlign = 'right';
    ctx.fillText(`FASE ${stage}/3`, W - 5, 9);
    // barra dei soldi raccolti
    const pct = Math.max(0, Math.min(1, funded / 45000));
    ctx.fillStyle = 'rgba(0,0,0,0.55)';
    ctx.fillRect(3, H - 9, W - 6, 6);
    ctx.fillStyle = '#4cd137';
    ctx.fillRect(4, H - 8, (W - 8) * pct, 4);
    ctx.fillStyle = '#fff';
    ctx.font = 'bold 4px sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText(`${funded.toLocaleString('it-IT')} / 45.000 €`, W / 2, H - 4.6);
  });
  if (lights) lights.push({ x, y: y + 20, z: z - 25, r: 90, color: '150,190,255' });
}

// ---------------------------------------------------------------- dentro la base

/** Luce verde sopra il portellone del primo modulo: da qui si entra nella base finita. */
export function drawBaseDoor(it: GameValue, t: number, lights?: GameValue[]): void {
  const ctx = game.view.ctx;
  const s = isoScale();
  const p = P(it.x, it.y, 16);
  const k = 0.6 + 0.4 * Math.sin(t * 3);
  ctx.fillStyle = `rgba(46,213,115,${0.35 * k})`;
  ctx.beginPath();
  ctx.arc(p.x, p.y, 10 * s, 0, 6.3);
  ctx.fill();
  ctx.fillStyle = '#2ed573';
  ctx.beginPath();
  ctx.arc(p.x, p.y, 2.5 * s, 0, 6.3);
  ctx.fill();
  if (lights) lights.push({ x: it.x, y: it.y, z: 10, r: 60, color: '46,213,115' });
}
