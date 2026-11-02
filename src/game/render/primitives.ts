import type { GameValue } from '../context.js';
import { game } from '../context.js';
import { dom } from '../runtime.js';
export function closeModal(id?: GameValue): GameValue {
  dom(id).classList.add('hidden');
}

export function isoProject(x?: GameValue, y?: GameValue, z?: GameValue): GameValue {
  const v: GameValue = game.viewOverride;
  const cx: GameValue = v ? v.cx : game.view.canvas.width / 2;
  const scale: GameValue = v
    ? v.scale
    : Math.min(game.view.canvas.width / 450, game.view.canvas.height / 600, 1.2);
  const cy: GameValue = v ? v.cy : game.view.canvas.height / 2 + 55;
  // Mobile ruotato: i suoi punti girano attorno al centro prima della proiezione.
  const r = game.furnRot;
  if (r && r.k) {
    const p = rotateAround(x, y, r.cx, r.cy, r.k);
    x = p.x;
    y = p.y;
  }
  let isoX: GameValue = (x - y) * 0.866 * scale;
  let isoY: GameValue = ((x + y) * 0.5 - z) * scale;
  return { x: cx + isoX, y: cy + isoY };
}

// ======================================================================
//  GRAFICA — blocchi 3D, texture, oggetti dettagliati, ambienti, luci
// ======================================================================
export function isoScale(..._args: GameValue[]): GameValue {
  return game.viewOverride
    ? game.viewOverride.scale
    : Math.min(game.view.canvas.width / 450, game.view.canvas.height / 600, 1.2);
}

// Numero pseudo-casuale stabile (stesso input → stesso output: niente sfarfallii)
export function rnd(i?: GameValue): GameValue {
  const s: GameValue = Math.sin(i * 127.1 + 311.7) * 43758.5453;
  return s - Math.floor(s);
}

export function toRgb(c?: GameValue): GameValue {
  if (game._rgbCache[c]) return game._rgbCache[c];
  let r: GameValue;
  if (c[0] === '#') {
    let h: GameValue = c.slice(1);
    if (h.length === 3)
      h = h
        .split('')
        .map((x?: GameValue): GameValue => x + x)
        .join('');
    const n: GameValue = parseInt(h, 16);
    r = [(n >> 16) & 255, (n >> 8) & 255, n & 255];
  } else {
    r = (c.match(/\d+(\.\d+)?/g) || [0, 0, 0]).slice(0, 3).map(Number);
  }
  if (Object.keys(game._rgbCache).length > 3000) game._rgbCache = {};
  return (game._rgbCache[c] = r);
}

export function mixColor(c1?: GameValue, c2?: GameValue, t?: GameValue): GameValue {
  const a: GameValue = toRgb(c1),
    b: GameValue = toRgb(c2);
  return `rgb(${Math.round(a[0] + (b[0] - a[0]) * t)},${Math.round(a[1] + (b[1] - a[1]) * t)},${Math.round(a[2] + (b[2] - a[2]) * t)})`;
}

export function shadeColor(col?: GameValue, amt?: GameValue): GameValue {
  return amt >= 0 ? game.lighten(col, amt / 100) : game.darken(col, -amt / 100);
}

export function poly(
  pts?: GameValue,
  fill?: GameValue,
  stroke?: GameValue,
  lw: GameValue = 1,
): GameValue {
  game.view.ctx.beginPath();
  game.view.ctx.moveTo(pts[0].x, pts[0].y);
  for (let i: GameValue = 1; i < pts.length; i++) game.view.ctx.lineTo(pts[i].x, pts[i].y);
  game.view.ctx.closePath();
  if (fill) {
    game.view.ctx.fillStyle = fill;
    game.view.ctx.fill();
  }
  if (stroke) {
    game.view.ctx.strokeStyle = stroke;
    game.view.ctx.lineWidth = lw;
    game.view.ctx.stroke();
  }
}

// Imposta il canvas in modo da disegnare "piatto" su un piano 3D (pavimento, parete, faccia di un mobile)
export function setPlane(o?: GameValue, u?: GameValue, v?: GameValue): GameValue {
  const p0: GameValue = isoProject(o[0], o[1], o[2]);
  const pu: GameValue = isoProject(o[0] + u[0], o[1] + u[1], o[2] + u[2]);
  const pv: GameValue = isoProject(o[0] + v[0], o[1] + v[1], o[2] + v[2]);
  game.view.ctx.setTransform(pu.x - p0.x, pu.y - p0.y, pv.x - p0.x, pv.y - p0.y, p0.x, p0.y);
}

// ---------------------------------------------------------------- ROTAZIONE DEI MOBILI
// k = quarti di giro: 0 = davanti verso +y (com'era), 1 = verso +x, 2 = verso -y, 3 = verso -x.
export function rotateAround(x: number, y: number, cx: number, cy: number, k: number) {
  let dx = x - cx,
    dy = y - cy;
  for (let i = 0; i < ((k % 4) + 4) % 4; i++) {
    const t = dx;
    dx = dy;
    dy = -t;
  }
  return { x: cx + dx, y: cy + dy };
}

/** Direzione (vettore) ruotata di k quarti di giro, con la stessa convenzione di rotateAround. */
export function rotateVector(vx: number, vy: number, k: number) {
  return rotateAround(vx, vy, 0, 0, k);
}

/** Punto del mobile in coordinate del mondo, tenendo conto della rotazione in corso. */
export function worldPoint(x: number, y: number) {
  const r = game.furnRot;
  return r && r.k ? rotateAround(x, y, r.cx, r.cy, r.k) : { x, y };
}

/** Ingombro a terra: con un quarto di giro larghezza e profondità si scambiano. */
export function footprintOf<T extends { w: number; h: number; rot?: number }>(item: T): T {
  return (item.rot || 0) % 2 ? { ...item, w: item.h, h: item.w } : item;
}
