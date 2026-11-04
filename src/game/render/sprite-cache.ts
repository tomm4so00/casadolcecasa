// Oggetti fermi e complicati da disegnare (le palazzine del cortile, gli alberi): si disegnano una
// volta in un'immagine e a ogni fotogramma si incolla quella, che è molto più veloce.
// L'immagine si rifà solo quando cambia qualcosa che si vede (la "firma"): zoom, notte, portone…
import { game } from '../context.js';
import { cameraPx, surfaceDrop } from '../camera.js';
import { isoScale } from './primitives.js';

interface Sprite {
  sig: string;
  canvas: HTMLCanvasElement;
  /** Posizione dell'angolo in alto a sinistra rispetto al punto a terra dell'oggetto (in pixel). */
  ox: number;
  oy: number;
}

/** Spazio attorno al punto a terra in cui può stare il disegno (in unità della scena). */
interface SpriteBounds {
  left: number;
  right: number;
  up: number;
  down: number;
}

const sprites = new Map<string, Sprite>();
let scratch: HTMLCanvasElement | null = null;

/**
 * Disegna `draw` (che disegna l'oggetto con le solite funzioni) usando l'immagine salvata in `slot`.
 * `(x, y)` è il punto a terra dell'oggetto. `shear`: di quanti pixel si sposta di lato ogni pixel
 * di altezza (per far ondeggiare gli alberi senza ridisegnarli).
 */
export function drawCached(
  slot: string,
  sig: string,
  x: number,
  y: number,
  bounds: SpriteBounds,
  draw: () => void,
  shear = 0,
): void {
  const ctx = game.view.ctx;
  // già dentro un disegno "fuori schermo" o con un mobile ruotato: si disegna come sempre
  if (game.viewOverride || (game.furnRot && game.furnRot.k) || typeof document === 'undefined') {
    draw();
    return;
  }
  const s: number = isoScale();
  const W = game.view.canvas.width,
    H = game.view.canvas.height;
  // punto a terra sullo schermo senza telecamera (la telecamera sposta di pixel interi)
  const bx = W / 2 + (x - y) * 0.866 * s;
  const by = H / 2 + 55 + ((x + y) * 0.5 + surfaceDrop(x, y)) * s;
  const ix = Math.floor(bx),
    iy = Math.floor(by);
  const fx = bx - ix,
    fy = by - iy;
  const fullSig = `${sig}|${s}|${fx.toFixed(3)}|${fy.toFixed(3)}`;
  let sp = sprites.get(slot);
  if (!sp || sp.sig !== fullSig) {
    const built = buildSprite(fullSig, x, y, s, fx, fy, bounds, draw, sp?.canvas);
    if (!built) {
      draw();
      return;
    }
    sp = built;
    sprites.set(slot, sp);
  }
  if (!sp.canvas.width) return; // non disegna niente
  const cam = cameraPx(s);
  const dx = ix - cam.u + sp.ox,
    dy = iy - cam.v + sp.oy;
  if (shear) {
    // ciò che sta più in alto si sposta di più: il punto a terra resta fermo
    const groundY = iy - cam.v;
    ctx.save();
    ctx.transform(1, 0, -shear, 1, shear * groundY, 0);
    ctx.drawImage(sp.canvas, dx, dy);
    ctx.restore();
  } else ctx.drawImage(sp.canvas, dx, dy);
}

function buildSprite(
  sig: string,
  x: number,
  y: number,
  s: number,
  fx: number,
  fy: number,
  b: SpriteBounds,
  draw: () => void,
  reuse?: HTMLCanvasElement,
): Sprite | null {
  const padL = Math.ceil(b.left * s) + 2,
    padU = Math.ceil(b.up * s) + 2;
  const w = padL + Math.ceil(b.right * s) + 2,
    h = padU + Math.ceil(b.down * s) + 2;
  scratch ||= document.createElement('canvas');
  if (scratch.width < w || scratch.height < h) {
    scratch.width = Math.max(scratch.width, w);
    scratch.height = Math.max(scratch.height, h);
  }
  const sctx = scratch.getContext('2d', { willReadFrequently: true });
  if (!sctx) return null;
  sctx.setTransform(1, 0, 0, 1, 0, 0);
  sctx.clearRect(0, 0, w, h);
  const mainCtx = game.view.ctx;
  const mainOverride = game.viewOverride;
  game.view.ctx = sctx;
  // il punto a terra finisce in (padL + fx, padU + fy), con la stessa parte decimale dello schermo
  game.viewOverride = {
    cx: padL + fx - (x - y) * 0.866 * s,
    cy: padU + fy - ((x + y) * 0.5 + surfaceDrop(x, y)) * s,
    scale: s,
  };
  try {
    draw();
  } finally {
    game.view.ctx = mainCtx;
    game.viewOverride = mainOverride;
  }
  // si tiene solo il rettangolo davvero disegnato
  const data = sctx.getImageData(0, 0, w, h).data;
  let x0 = w,
    y0 = h,
    x1 = -1,
    y1 = -1;
  for (let py = 0; py < h; py++)
    for (let px = 0, i = py * w * 4 + 3; px < w; px++, i += 4)
      if (data[i]) {
        if (px < x0) x0 = px;
        if (px > x1) x1 = px;
        if (py < y0) y0 = py;
        y1 = py;
      }
  if (import.meta.env?.DEV && x1 >= 0 && (x0 === 0 || y0 === 0 || x1 === w - 1 || y1 === h - 1))
    console.warn('drawCached: il disegno esce dai limiti e viene tagliato', sig);
  const canvas = reuse || document.createElement('canvas');
  if (x1 < 0) {
    canvas.width = canvas.height = 0;
    return { sig, canvas, ox: 0, oy: 0 };
  }
  canvas.width = x1 - x0 + 1;
  canvas.height = y1 - y0 + 1;
  const c = canvas.getContext('2d')!;
  c.clearRect(0, 0, canvas.width, canvas.height);
  c.drawImage(scratch, x0, y0, canvas.width, canvas.height, 0, 0, canvas.width, canvas.height);
  return { sig, canvas, ox: x0 - padL, oy: y0 - padU };
}
