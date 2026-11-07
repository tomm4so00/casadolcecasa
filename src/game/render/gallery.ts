// Galleria d'Arte: i dieci quadri dei giocatori con passe-partout, faretto e targhetta, il binario
// dei faretti, la scritta sul muro, le sculture sui piedistalli e il banco dell'accoglienza.
// Il cartello sopra la porta del laboratorio artistico sta qui con il resto della galleria.
import type { GameValue } from '../context.js';
import { game } from '../context.js';
import { GALLERY_WALL } from '../data/catalogues.js';
import { exhibition, pieceAt } from '../gallery.js';
import { paintingTitle } from '../painting-titles.js';
import { isoProject, isoScale, setPlane } from './primitives.js';
import { box, ellipseShadow, onFace, resetPlane } from './objects.js';
import { paintingImage } from './scenes.js';

/** Misure di un quadro in mostra sulla parete (unità del piano della parete). */
const IMG_W = 64,
  IMG_H = 48,
  MAT = 7,
  FRAME = 2.2,
  TOP = 46;
const OUT_W = IMG_W + 2 * (MAT + FRAME),
  OUT_H = IMG_H + 2 * (MAT + FRAME);

/** Imposta la spaziatura fra le lettere, dove il browser la conosce. */
function spacing(ctx: CanvasRenderingContext2D, px: number): void {
  if ('letterSpacing' in ctx)
    (ctx as unknown as { letterSpacing: string }).letterSpacing = px + 'px';
}

/** Un quadro della mostra (si ridisegna a ogni fotogramma: la mostra può cambiare). */
export function wallGalleryPainting(d: GameValue): void {
  const ctx: CanvasRenderingContext2D = game.view.ctx;
  const cu: number = d.u;
  const x0 = cu - OUT_W / 2;
  // luce del faretto: un cono caldo che scende sulla parete
  ctx.save();
  ctx.translate(cu, TOP + OUT_H * 0.35);
  ctx.scale(1, 1.45);
  const glow = ctx.createRadialGradient(0, 0, 4, 0, 0, OUT_W * 0.82);
  glow.addColorStop(0, 'rgba(255,238,200,0.42)');
  glow.addColorStop(1, 'rgba(255,238,200,0)');
  ctx.fillStyle = glow;
  ctx.fillRect(-OUT_W, -OUT_W, OUT_W * 2, OUT_W * 2);
  ctx.restore();
  const piece = pieceAt(d.i);
  if (!piece) {
    // posto vuoto: solo il segno a matita e due parole
    ctx.setLineDash([3, 3]);
    ctx.strokeStyle = 'rgba(0,0,0,0.16)';
    ctx.lineWidth = 0.8;
    ctx.strokeRect(x0 + 6, TOP + 6, OUT_W - 12, OUT_H - 12);
    ctx.setLineDash([]);
    ctx.fillStyle = 'rgba(45,52,54,0.45)';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.font = '600 5px sans-serif';
    spacing(ctx, 1.2);
    ctx.fillText('IN ARRIVO', cu, TOP + OUT_H / 2 - 3);
    spacing(ctx, 0);
    ctx.font = '4px sans-serif';
    ctx.fillText('il prossimo quadro', cu, TOP + OUT_H / 2 + 4);
    return;
  }
  const img = paintingImage(piece.code);
  // ombra portata, cornice nera sottile e passe-partout bianco
  ctx.fillStyle = 'rgba(0,0,0,0.18)';
  ctx.fillRect(x0 + 2.5, TOP + 3, OUT_W, OUT_H);
  ctx.fillStyle = '#1d1d1f';
  ctx.fillRect(x0, TOP, OUT_W, OUT_H);
  ctx.fillStyle = '#fbfbf8';
  ctx.fillRect(x0 + FRAME, TOP + FRAME, OUT_W - 2 * FRAME, OUT_H - 2 * FRAME);
  const ix = x0 + FRAME + MAT,
    iy = TOP + FRAME + MAT;
  // smusso del passe-partout attorno al quadro
  ctx.fillStyle = 'rgba(0,0,0,0.12)';
  ctx.fillRect(ix - 0.8, iy - 0.8, IMG_W + 1.6, IMG_H + 1.6);
  if (img) {
    const smooth = ctx.imageSmoothingEnabled;
    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(img, ix, iy, IMG_W, IMG_H);
    ctx.imageSmoothingEnabled = smooth;
  }
  // riflesso del vetro, appena accennato
  const glass = ctx.createLinearGradient(ix, iy, ix + IMG_W, iy + IMG_H);
  glass.addColorStop(0, 'rgba(255,255,255,0.16)');
  glass.addColorStop(0.35, 'rgba(255,255,255,0)');
  ctx.fillStyle = glass;
  ctx.fillRect(ix, iy, IMG_W, IMG_H);
  // targhetta di museo, a destra sotto il quadro: titolo, autore, cuoricini (e prezzo)
  const title = paintingTitle(piece.code) || 'Senza titolo';
  const lw = 48,
    lh = 17,
    lx = x0 + OUT_W - lw,
    ly = TOP + OUT_H + 7;
  ctx.fillStyle = 'rgba(0,0,0,0.12)';
  ctx.fillRect(lx + 0.8, ly + 0.8, lw, lh);
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(lx, ly, lw, lh);
  ctx.textAlign = 'left';
  ctx.textBaseline = 'alphabetic';
  ctx.fillStyle = '#2d3436';
  ctx.font = 'bold 4.6px sans-serif';
  ctx.fillText(title, lx + 3, ly + 5.6, lw - 6);
  ctx.fillStyle = '#636e72';
  ctx.font = '4.2px sans-serif';
  ctx.fillText(piece.name, lx + 3, ly + 10.4, lw - 6);
  ctx.fillStyle = '#d63031';
  ctx.font = 'bold 4.4px sans-serif';
  ctx.fillText(`♥ ${piece.voters.size}`, lx + 3, ly + 15);
  // la migliore offerta del momento
  if (piece.bid) {
    ctx.textAlign = 'right';
    ctx.fillStyle = '#2d3436';
    ctx.font = '4px sans-serif';
    ctx.fillText(`${piece.bid.amt.toLocaleString('it-IT')} €`, lx + lw - 3, ly + 15, lw / 2);
  }
}

/** Binario nero dei faretti sotto il soffitto, con un faretto puntato su ogni quadro. */
export function wallGalleryTrack(d: GameValue, opt: GameValue): void {
  const ctx: CanvasRenderingContext2D = game.view.ctx;
  const W = d.side === 'back' ? game.X1 - game.X0 : game.Y1 - game.Y0;
  ctx.fillStyle = '#1e1e20';
  ctx.fillRect(0, 4, W, 2.2);
  for (const w of GALLERY_WALL) {
    if (w.side !== d.side) continue;
    // attacco, braccio e corpo del faretto, inclinato verso il quadro
    ctx.fillStyle = '#1e1e20';
    ctx.fillRect(w.u - 1, 6, 2, 4);
    ctx.save();
    ctx.translate(w.u, 11);
    ctx.rotate(0.35);
    ctx.fillStyle = '#2b2b2e';
    ctx.fillRect(-2.6, -1.5, 5.2, 9);
    ctx.fillStyle = '#fff3d6';
    ctx.fillRect(-2.2, 7, 4.4, 1.3);
    ctx.restore();
  }
  void opt;
}

/** La scritta della galleria sulla parete di fondo, in lettere sottili e spaziate. */
export function wallGalleryLettering(d: GameValue): void {
  const ctx: CanvasRenderingContext2D = game.view.ctx;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'alphabetic';
  ctx.fillStyle = '#2d3436';
  ctx.font = '300 10px "Helvetica Neue", Helvetica, Arial, sans-serif';
  spacing(ctx, 3.2);
  ctx.fillText("GALLERIA D'ARTE", d.u, 26);
  ctx.font = '4.2px "Helvetica Neue", Helvetica, Arial, sans-serif';
  spacing(ctx, 1.4);
  ctx.fillStyle = '#8a8d8f';
  ctx.fillText('OPERE DEI GIOCATORI · LA MOSTRA CAMBIA OGNI GIORNO', d.u, 33);
  spacing(ctx, 0);
}

/** Nel laboratorio: la targa nera sopra la porta della galleria. */
export function wallGallerySign(d: GameValue): void {
  const ctx: CanvasRenderingContext2D = game.view.ctx;
  const w = 56,
    h = 13,
    x = d.u - w / 2,
    y = 46;
  ctx.fillStyle = 'rgba(0,0,0,0.2)';
  ctx.fillRect(x + 1, y + 1.2, w, h);
  ctx.fillStyle = '#1e1e20';
  ctx.fillRect(x, y, w, h);
  ctx.fillStyle = '#ffffff';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.font = '600 5.2px "Helvetica Neue", Helvetica, Arial, sans-serif';
  spacing(ctx, 1.3);
  ctx.fillText("GALLERIA D'ARTE", d.u, y + h / 2 + 0.3);
  spacing(ctx, 0);
}

// ---------------------------------------------------------------- marmo e sculture classiche

const MARBLE = '#efece6';

/** Venature leggere sulla faccia di un blocco di marmo. */
function veins(FW: number, FH: number, seed: number): void {
  const ctx: CanvasRenderingContext2D = game.view.ctx;
  ctx.strokeStyle = 'rgba(120,115,105,0.22)';
  ctx.lineWidth = 0.6;
  for (let i = 0; i < 2; i++) {
    const a = ((seed * 7 + i * 13) % 10) / 10;
    ctx.beginPath();
    ctx.moveTo(FW * a, 0);
    ctx.bezierCurveTo(FW * (1 - a), FH * 0.3, FW * a * 0.6, FH * 0.7, FW * (0.3 + a * 0.5), FH);
    ctx.stroke();
  }
}

/** Piedistallo classico di marmo: zoccolo, fusto con le venature e cimasa sporgente. */
function marblePlinth(x: number, y: number, w: number, h: number, z: number): void {
  ellipseShadow(x + 5, y + 5, w * 0.95, h * 0.65, 0.2);
  const opt = { top: '#f8f6f1', edge: 'rgba(0,0,0,0.16)' };
  box(x, y, w + 7, h + 7, 4, '#e3dfd6', opt);
  box(x, y, w + 4, h + 4, 2, '#ebe7df', { ...opt, z0: 4 });
  const shaft = box(x, y, w, h, z - 11, MARBLE, { ...opt, z0: 6 });
  onFace(shaft, 'left', (FW: number, FH: number) => veins(FW, FH, x));
  onFace(shaft, 'right', (FW: number, FH: number) => veins(FW, FH, y));
  box(x, y, w + 4, h + 4, 2, '#ebe7df', { ...opt, z0: z - 5 });
  box(x, y, w + 7, h + 7, 3, '#e3dfd6', { ...opt, z0: z - 3 });
}

/** Riempimento di marmo per le sculture: luce da sinistra in alto. */
function marbleFill(ctx: CanvasRenderingContext2D, x0: number, x1: number): CanvasGradient {
  const g = ctx.createLinearGradient(x0, 0, x1, 0);
  g.addColorStop(0, '#fdfcf9');
  g.addColorStop(0.55, '#e9e5dd');
  g.addColorStop(1, '#bdb6aa');
  return g;
}

/** Busto classico: zoccolo tondo, spalle panneggiate, collo e testa con i riccioli. */
function drawBust(px: number, py: number, s: number): void {
  const ctx: CanvasRenderingContext2D = game.view.ctx;
  ctx.save();
  ctx.translate(px, py);
  ctx.scale(s, s);
  ctx.lineWidth = 0.5;
  ctx.strokeStyle = 'rgba(70,60,50,0.35)';
  // zoccolo
  ctx.fillStyle = marbleFill(ctx, -6, 6);
  ctx.beginPath();
  ctx.ellipse(0, 0, 6, 2.4, 0, 0, Math.PI);
  ctx.lineTo(-6, -5);
  ctx.ellipse(0, -5, 6, 2.4, 0, Math.PI, 0, true);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();
  // petto e spalle, con il panneggio di traverso
  ctx.fillStyle = marbleFill(ctx, -15, 15);
  ctx.beginPath();
  ctx.moveTo(-8, -6);
  ctx.quadraticCurveTo(-15, -9, -15, -16);
  ctx.quadraticCurveTo(-13, -21, -5, -22);
  ctx.lineTo(5, -22);
  ctx.quadraticCurveTo(13, -21, 15, -16);
  ctx.quadraticCurveTo(15, -9, 8, -6);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();
  ctx.strokeStyle = 'rgba(120,110,95,0.45)';
  for (const k of [0, 3.2, 6.4]) {
    ctx.beginPath();
    ctx.moveTo(-12 + k, -19 + k * 0.2);
    ctx.quadraticCurveTo(-2 + k, -12, 8 + k * 0.4, -7);
    ctx.stroke();
  }
  // collo
  ctx.fillStyle = marbleFill(ctx, -3.5, 3.5);
  ctx.beginPath();
  ctx.moveTo(-3.2, -21.5);
  ctx.lineTo(-2.8, -27);
  ctx.lineTo(2.8, -27);
  ctx.lineTo(3.2, -21.5);
  ctx.closePath();
  ctx.fill();
  // testa
  ctx.fillStyle = marbleFill(ctx, -6, 6);
  ctx.beginPath();
  ctx.ellipse(0, -32.5, 5.6, 7, 0, 0, 6.3);
  ctx.fill();
  ctx.strokeStyle = 'rgba(70,60,50,0.35)';
  ctx.stroke();
  // riccioli sulla fronte e sulla nuca
  ctx.fillStyle = '#e2ddd3';
  for (let i = 0; i < 7; i++) {
    const a = Math.PI * (1.05 + i * 0.13);
    ctx.beginPath();
    ctx.arc(Math.cos(a) * 5.2, -33.5 + Math.sin(a) * 6.2, 1.7, 0, 6.3);
    ctx.fill();
    ctx.stroke();
  }
  // naso e ombra degli occhi, appena accennati
  ctx.strokeStyle = 'rgba(90,80,70,0.4)';
  ctx.beginPath();
  ctx.moveTo(0.8, -33);
  ctx.lineTo(1.6, -30);
  ctx.lineTo(0.6, -29.6);
  ctx.moveTo(-2.6, -33.4);
  ctx.lineTo(-1, -33.6);
  ctx.moveTo(1.4, -33.6);
  ctx.lineTo(3, -33.4);
  ctx.stroke();
  ctx.restore();
}

/** Figura panneggiata in piedi, in leggero contrapposto, con lo chignon. */
function drawFigure(px: number, py: number, s: number): void {
  const ctx: CanvasRenderingContext2D = game.view.ctx;
  ctx.save();
  ctx.translate(px, py);
  ctx.scale(s, s);
  ctx.lineWidth = 0.5;
  ctx.strokeStyle = 'rgba(70,60,50,0.35)';
  // basamento tondo
  ctx.fillStyle = marbleFill(ctx, -7, 7);
  ctx.beginPath();
  ctx.ellipse(0, 0, 7, 2.6, 0, 0, Math.PI);
  ctx.lineTo(-7, -3);
  ctx.ellipse(0, -3, 7, 2.6, 0, Math.PI, 0, true);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();
  // veste lunga fino ai piedi, fianchi spostati da un lato
  ctx.fillStyle = marbleFill(ctx, -8, 8);
  ctx.beginPath();
  ctx.moveTo(-6.5, -3.5);
  ctx.quadraticCurveTo(-7.5, -16, -5.2, -27);
  ctx.quadraticCurveTo(-5.5, -33, -4.6, -38);
  ctx.lineTo(4.4, -38);
  ctx.quadraticCurveTo(6.2, -32, 6.4, -27);
  ctx.quadraticCurveTo(7.6, -15, 6.5, -3.5);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();
  // pieghe del panneggio
  ctx.strokeStyle = 'rgba(120,110,95,0.5)';
  for (const k of [-3.5, -1, 1.6, 4]) {
    ctx.beginPath();
    ctx.moveTo(k * 0.7, -26);
    ctx.quadraticCurveTo(k * 1.3, -15, k * 1.1, -4);
    ctx.stroke();
  }
  ctx.beginPath();
  ctx.moveTo(-5, -27);
  ctx.quadraticCurveTo(0, -23, 6.2, -28);
  ctx.stroke();
  // braccio piegato sul petto e braccio lungo il fianco che tiene il panneggio
  ctx.strokeStyle = '#d9d3c8';
  ctx.lineWidth = 2.2;
  ctx.lineCap = 'round';
  ctx.beginPath();
  ctx.moveTo(-4.4, -37);
  ctx.quadraticCurveTo(-6.5, -31, -2, -31.5);
  ctx.lineTo(2, -34);
  ctx.moveTo(4.4, -37);
  ctx.quadraticCurveTo(7.5, -29, 6.2, -22);
  ctx.stroke();
  ctx.lineCap = 'butt';
  ctx.lineWidth = 0.5;
  // collo, testa e chignon
  ctx.fillStyle = marbleFill(ctx, -2, 2);
  ctx.fillRect(-1.3, -41, 2.6, 3.4);
  ctx.fillStyle = marbleFill(ctx, -4, 4);
  ctx.strokeStyle = 'rgba(70,60,50,0.35)';
  ctx.beginPath();
  ctx.ellipse(0.4, -44.5, 3.4, 4.2, 0.1, 0, 6.3);
  ctx.fill();
  ctx.stroke();
  ctx.fillStyle = '#e2ddd3';
  ctx.beginPath();
  ctx.arc(-2.4, -46.5, 1.9, 0, 6.3);
  ctx.fill();
  ctx.stroke();
  ctx.restore();
}

/** Piedistallo di marmo con una scultura classica (`statue`: 'bust' o 'figure'). */
export function drawGalleryPlinth(it: GameValue): void {
  const { x, y, w, h } = it;
  const z: number = it.z || 40;
  marblePlinth(x, y, w, h, z);
  const top = isoProject(x, y, z);
  if (it.statue === 'figure') drawFigure(top.x, top.y, isoScale() * 1.7);
  else drawBust(top.x, top.y, isoScale() * 1.75);
}

/**
 * Il leggio del catalogo: piedistallo di marmo con il piano inclinato e un grande libro aperto,
 * con la copertina rossa, il titolo a sinistra e a destra il quadro più votato.
 */
export function drawGalleryCatalog(it: GameValue): void {
  const { x, y, w, h } = it;
  const z: number = it.z || 40;
  marblePlinth(x, y, w * 0.8, h * 0.8, z);
  const ctx: CanvasRenderingContext2D = game.view.ctx;
  // il libro sta su un piano che sale verso il fondo; u lungo x, v verso chi guarda
  const BW = 50,
    BD = 32,
    tilt = 0.32;
  const page = (draw: () => void) => {
    ctx.save();
    setPlane([x - BW / 2, y - BD / 2, z + 2 + BD * tilt], [1, 0, 0], [0, 1, -tilt]);
    try {
      draw();
    } finally {
      ctx.restore();
      resetPlane();
    }
  };
  // spessore della copertina, poi copertina e pagine
  page(() => {
    ctx.fillStyle = '#4a1414';
    ctx.fillRect(-2, -1, BW + 4, BD + 3.5);
    ctx.fillStyle = '#7d1f1f';
    ctx.fillRect(-2, -2, BW + 4, BD + 3);
    ctx.fillStyle = '#d4a017';
    ctx.fillRect(-2, BD - 0.6, BW + 4, 0.6);
    for (const [u0, u1] of [
      [0, BW / 2],
      [BW / 2, BW],
    ]) {
      const g = ctx.createLinearGradient(u0, 0, u1, 0);
      const left = u0 === 0;
      g.addColorStop(left ? 0 : 1, '#fbf6e8');
      g.addColorStop(left ? 1 : 0, '#d9cfb6');
      ctx.fillStyle = g;
      ctx.fillRect(u0, 0, u1 - u0, BD);
    }
    // segnalibro di seta rossa
    ctx.fillStyle = '#b71c1c';
    ctx.fillRect(BW / 2 + 1.5, BD - 1, 1.6, 7);
    // pagina di sinistra: il titolo e qualche riga di testo
    ctx.fillStyle = '#3b2a1a';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'alphabetic';
    ctx.font = 'italic bold 3.2px Georgia, serif';
    ctx.fillText('Catalogo', BW / 4, 6);
    ctx.font = 'italic 2.4px Georgia, serif';
    ctx.fillText("delle opere d'arte", BW / 4, 9);
    ctx.fillStyle = 'rgba(60,45,30,0.35)';
    for (let r = 0; r < 6; r++) ctx.fillRect(3, 12.5 + r * 2.1, BW / 2 - 6 - (r % 3) * 2, 0.6);
    // pagina di destra: il quadro più votato, con la didascalia
    const best = exhibition()[0];
    const img = best ? paintingImage(best.code) : null;
    ctx.fillStyle = '#2d3436';
    ctx.fillRect(BW / 2 + 3.5, 3, BW / 2 - 7, 13.5);
    if (img) {
      const smooth = ctx.imageSmoothingEnabled;
      ctx.imageSmoothingEnabled = false;
      ctx.drawImage(img, BW / 2 + 4, 3.5, BW / 2 - 8, 12.5);
      ctx.imageSmoothingEnabled = smooth;
    }
    ctx.fillStyle = 'rgba(60,45,30,0.35)';
    for (let r = 0; r < 3; r++) ctx.fillRect(BW / 2 + 4, 19 + r * 2.1, BW / 2 - 9 - r * 2, 0.6);
    // piega al centro
    const fold = ctx.createLinearGradient(BW / 2 - 2, 0, BW / 2 + 2, 0);
    fold.addColorStop(0, 'rgba(0,0,0,0)');
    fold.addColorStop(0.5, 'rgba(0,0,0,0.22)');
    fold.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = fold;
    ctx.fillRect(BW / 2 - 2, 0, 4, BD);
  });
}

/** Banco dell'accoglienza: bianco, piano di rovere, lampada d'ottone e libro dei visitatori. */
export function drawGalleryDesk(it: GameValue): void {
  const { x, y, w, h } = it;
  const z: number = it.z || 38;
  const b = box(x, y, w, h, z - 3, '#f7f6f2', { edge: 'rgba(0,0,0,0.15)' });
  onFace(b, 'left', (FW: number, FH: number) => {
    const ctx: CanvasRenderingContext2D = game.view.ctx;
    ctx.fillStyle = 'rgba(0,0,0,0.25)';
    ctx.fillRect(0, FH - 3, FW, 3);
    ctx.fillStyle = '#2d3436';
    ctx.font = '300 5px "Helvetica Neue", Helvetica, Arial, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    spacing(ctx, 1.4);
    ctx.fillText('BENVENUTI', FW / 2, FH * 0.45);
    spacing(ctx, 0);
  });
  box(x, y, w + 4, h + 4, 3, '#b08a5a', { z0: z - 3, top: '#c9a274' });
  // libro dei visitatori aperto e lampada
  box(x - w * 0.18, y, 16, 11, 1.2, '#fdfcf7', { z0: z, edge: 'rgba(0,0,0,0.25)' });
  box(x + w * 0.3, y - 3, 6, 6, 1.5, '#b8860b', { z0: z });
  box(x + w * 0.3, y - 3, 1.4, 1.4, 16, '#b8860b', { z0: z + 1.5 });
  box(x + w * 0.3, y - 3, 8, 8, 4, '#d4a017', { z0: z + 16, top: '#fff3c4' });
}
