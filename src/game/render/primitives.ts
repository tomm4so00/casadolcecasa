import type { GameValue } from '../context.js';
import { game } from '../context.js';
import { dom } from '../runtime.js';
export function closeModal(id?: GameValue): GameValue {
  dom(id).classList.add('hidden');
}

export function isoProject(x?: GameValue, y?: GameValue, z?: GameValue): GameValue {
  const v: GameValue = game.viewOverride;
  const cx: GameValue = v ? v.cx : game.canvas.width / 2;
  const scale: GameValue = v
    ? v.scale
    : Math.min(game.canvas.width / 450, game.canvas.height / 600, 1.2);
  const cy: GameValue = v ? v.cy : game.canvas.height / 2 + 55;
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
    : Math.min(game.canvas.width / 450, game.canvas.height / 600, 1.2);
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
  game.ctx.beginPath();
  game.ctx.moveTo(pts[0].x, pts[0].y);
  for (let i: GameValue = 1; i < pts.length; i++) game.ctx.lineTo(pts[i].x, pts[i].y);
  game.ctx.closePath();
  if (fill) {
    game.ctx.fillStyle = fill;
    game.ctx.fill();
  }
  if (stroke) {
    game.ctx.strokeStyle = stroke;
    game.ctx.lineWidth = lw;
    game.ctx.stroke();
  }
}

// Imposta il canvas in modo da disegnare "piatto" su un piano 3D (pavimento, parete, faccia di un mobile)
export function setPlane(o?: GameValue, u?: GameValue, v?: GameValue): GameValue {
  const p0: GameValue = isoProject(o[0], o[1], o[2]);
  const pu: GameValue = isoProject(o[0] + u[0], o[1] + u[1], o[2] + u[2]);
  const pv: GameValue = isoProject(o[0] + v[0], o[1] + v[1], o[2] + v[2]);
  game.ctx.setTransform(pu.x - p0.x, pu.y - p0.y, pv.x - p0.x, pv.y - p0.y, p0.x, p0.y);
}
