// Dentro la base spaziale lunare: pavimento di pannelli metallici, pareti da stazione spaziale,
// la vetrata sulla luna e tutti gli arredi (plancia, ologramma, serra, alloggi, officina…).
// Le misure della stanza stanno in room-size.ts, gli oggetti in ENV_DECOR (catalogues.ts).
import type { GameValue } from '../context.js';
import { game } from '../context.js';
import { isoProject, isoScale, poly, rnd, setPlane } from './primitives.js';
import { box, onFace, resetPlane } from './objects.js';
import { drawEarth } from './moon-surface.js';

type Pt = { x: number; y: number };
const P = (x: number, y: number, z: number): Pt => isoProject(x, y, z);
type Lights = GameValue[] | undefined;

const CYAN = '0,210,255';

/** Rettangolo con gli angoli arrotondati (nel piano corrente). */
function roundRect(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number,
) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

/** Ellisse di un cerchio orizzontale di raggio r (in unità del mondo) visto dalla telecamera. */
function disc(x: number, y: number, z: number, r: number): { c: Pt; rx: number; ry: number } {
  const s = isoScale();
  return { c: P(x, y, z), rx: r * 1.2247 * s, ry: r * 0.7071 * s };
}

function fillDisc(x: number, y: number, z: number, r: number, fill: string | CanvasGradient) {
  const ctx = game.view.ctx;
  const d = disc(x, y, z, r);
  ctx.fillStyle = fill;
  ctx.beginPath();
  ctx.ellipse(d.c.x, d.c.y, d.rx, d.ry, 0, 0, 6.3);
  ctx.fill();
}

/** Cilindro in piedi (bombole, tronchi, colonne): lato con la luce a sinistra e coperchio. */
function cylinder(
  x: number,
  y: number,
  r: number,
  z0: number,
  z1: number,
  light: string,
  dark: string,
) {
  const ctx = game.view.ctx;
  const b = disc(x, y, z0, r),
    t = disc(x, y, z1, r);
  const g = ctx.createLinearGradient(b.c.x - b.rx, 0, b.c.x + b.rx, 0);
  g.addColorStop(0, dark);
  g.addColorStop(0.3, light);
  g.addColorStop(1, dark);
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.moveTo(t.c.x - t.rx, t.c.y);
  ctx.lineTo(b.c.x - b.rx, b.c.y);
  ctx.ellipse(b.c.x, b.c.y, b.rx, b.ry, 0, Math.PI, 0, true);
  ctx.lineTo(t.c.x + t.rx, t.c.y);
  ctx.closePath();
  ctx.fill();
  ctx.fillStyle = light;
  ctx.beginPath();
  ctx.ellipse(t.c.x, t.c.y, t.rx, t.ry, 0, 0, 6.3);
  ctx.fill();
  ctx.strokeStyle = 'rgba(0,0,0,0.25)';
  ctx.lineWidth = 0.8;
  ctx.stroke();
}

/** Alone di luce colorata attorno a un punto (si somma ai colori sotto). */
function glow(p: Pt, r: number, color: string, a: number) {
  const ctx = game.view.ctx;
  const g = ctx.createRadialGradient(p.x, p.y, 0, p.x, p.y, r);
  g.addColorStop(0, `rgba(${color},${a})`);
  g.addColorStop(1, `rgba(${color},0)`);
  ctx.save();
  ctx.globalCompositeOperation = 'lighter';
  ctx.fillStyle = g;
  ctx.fillRect(p.x - r, p.y - r, r * 2, r * 2);
  ctx.restore();
}

// ---------------------------------------------------------------- PAVIMENTO

/**
 * Pavimento della base (nello sfondo fisso): pannelli di metallo con i rivetti, la passerella
 * illuminata dal portellone alla plancia, la piattaforma dell'ologramma, le griglie della serra,
 * i tappeti degli alloggi e le strisce di pericolo davanti al portellone.
 */
export function drawStationFloor(): void {
  const ctx = game.view.ctx;
  const { X0, X1, Y0, Y1 } = game;
  const W = X1 - X0,
    D = Y1 - Y0;
  // dal mondo al piano del pavimento
  const U = (x: number) => x - X0,
    V = (y: number) => y - Y0;
  setPlane([X0, Y0, 0], [1, 0, 0], [0, 1, 0]);
  ctx.save();
  try {
    ctx.beginPath();
    ctx.rect(0, 0, W, D);
    ctx.clip();
    ctx.fillStyle = '#4a5360';
    ctx.fillRect(0, 0, W, D);
    // pannelli 40×40, ognuno appena diverso, con lo smusso e quattro rivetti
    const S = 40;
    for (let u = 0, i = 0; u < W; u += S)
      for (let v = 0; v < D; v += S, i++) {
        const k = rnd(i * 0.73 + 4.1);
        ctx.fillStyle = `rgb(${92 + k * 14},${102 + k * 14},${116 + k * 14})`;
        ctx.fillRect(u + 1, v + 1, S - 2, S - 2);
        ctx.fillStyle = 'rgba(255,255,255,0.09)';
        ctx.fillRect(u + 1, v + 1, S - 2, 1.5);
        ctx.fillRect(u + 1, v + 1, 1.5, S - 2);
        ctx.fillStyle = 'rgba(0,0,0,0.22)';
        ctx.fillRect(u + 1, v + S - 2.5, S - 2, 1.5);
        ctx.fillRect(u + S - 2.5, v + 1, 1.5, S - 2);
        ctx.fillStyle = '#9aa5b3';
        for (const [a, b] of [
          [5, 5],
          [S - 5, 5],
          [5, S - 5],
          [S - 5, S - 5],
        ]) {
          ctx.beginPath();
          ctx.arc(u + a, v + b, 1.3, 0, 6.3);
          ctx.fill();
        }
        // qualche graffio
        if (k > 0.8) {
          ctx.strokeStyle = 'rgba(255,255,255,0.08)';
          ctx.lineWidth = 0.6;
          ctx.beginPath();
          ctx.moveTo(u + 8, v + 12 + k * 10);
          ctx.lineTo(u + 30, v + 8 + k * 14);
          ctx.stroke();
        }
      }
    // serra: griglia di scolo (angolo dietro a sinistra)
    const gx = U(-360),
      gy = V(-280),
      gw = U(-120) - gx,
      gh = V(-130) - gy;
    ctx.fillStyle = '#39414b';
    ctx.fillRect(gx, gy, gw, gh);
    ctx.strokeStyle = '#616c79';
    ctx.lineWidth = 1.2;
    for (let u = gx + 4; u < gx + gw; u += 6) {
      ctx.beginPath();
      ctx.moveTo(u, gy);
      ctx.lineTo(u, gy + gh);
      ctx.stroke();
    }
    ctx.fillStyle = 'rgba(46,213,115,0.1)';
    ctx.fillRect(gx, gy, gw, gh);
    // alloggi: moquette blu sotto le cuccette
    ctx.fillStyle = '#34466b';
    roundRect(ctx, U(-356), V(-40), 120, 230, 10);
    ctx.fill();
    ctx.strokeStyle = 'rgba(255,255,255,0.08)';
    ctx.lineWidth = 1;
    for (let v = V(-34); v < V(184); v += 8) {
      ctx.beginPath();
      ctx.moveTo(U(-350), v);
      ctx.lineTo(U(-242), v);
      ctx.stroke();
    }
    // zona relax: tappeto tondo sotto il tavolo
    const tc = { u: U(-150), v: V(170) };
    ctx.fillStyle = '#1f6f8b';
    ctx.beginPath();
    ctx.arc(tc.u, tc.v, 72, 0, 6.3);
    ctx.fill();
    ctx.strokeStyle = '#7ed6df';
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.arc(tc.u, tc.v, 64, 0, 6.3);
    ctx.stroke();
    ctx.strokeStyle = 'rgba(126,214,223,0.4)';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.arc(tc.u, tc.v, 54, 0, 6.3);
    ctx.stroke();
    // passerella centrale, dal portellone alla plancia
    const pw = 96,
      pu = U(0) - pw / 2,
      pv0 = V(-180),
      pv1 = D;
    ctx.fillStyle = '#7d8896';
    ctx.fillRect(pu, pv0, pw, pv1 - pv0);
    // antiscivolo: trattini in diagonale
    ctx.fillStyle = 'rgba(0,0,0,0.13)';
    for (let v = pv0 + 4, r = 0; v < pv1; v += 7, r++)
      for (let u = pu + 4 + (r % 2) * 5; u < pu + pw - 6; u += 10) {
        ctx.save();
        ctx.translate(u, v);
        ctx.rotate(r % 2 ? 0.6 : -0.6);
        ctx.fillRect(-3, -0.7, 6, 1.4);
        ctx.restore();
      }
    // strisce LED ai lati, con il bagliore
    for (const edge of [pu, pu + pw]) {
      const g = ctx.createLinearGradient(edge - 10, 0, edge + 10, 0);
      g.addColorStop(0, `rgba(${CYAN},0)`);
      g.addColorStop(0.5, `rgba(${CYAN},0.35)`);
      g.addColorStop(1, `rgba(${CYAN},0)`);
      ctx.fillStyle = g;
      ctx.fillRect(edge - 10, pv0, 20, pv1 - pv0);
      ctx.fillStyle = '#c7f5ff';
      ctx.fillRect(edge - 1.2, pv0, 2.4, pv1 - pv0);
      // lucine di segnalazione
      ctx.fillStyle = '#ffffff';
      for (let v = pv0 + 10; v < pv1; v += 26) {
        ctx.beginPath();
        ctx.arc(edge, v, 2, 0, 6.3);
        ctx.fill();
      }
    }
    // piattaforma dell'ologramma
    const hc = { u: U(0), v: V(-20) };
    ctx.fillStyle = '#2a313b';
    ctx.beginPath();
    ctx.arc(hc.u, hc.v, 92, 0, 6.3);
    ctx.fill();
    ctx.save();
    ctx.beginPath();
    ctx.arc(hc.u, hc.v, 92, 0, 6.3);
    ctx.arc(hc.u, hc.v, 80, 0, 6.3, true);
    ctx.clip();
    for (let a = 0; a < 40; a++) {
      ctx.fillStyle = a % 2 ? '#f1c40f' : '#2d3436';
      ctx.beginPath();
      ctx.moveTo(hc.u, hc.v);
      ctx.arc(hc.u, hc.v, 95, (a / 40) * Math.PI * 2, ((a + 1) / 40) * Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();
    const hg = ctx.createRadialGradient(hc.u, hc.v, 30, hc.u, hc.v, 80);
    hg.addColorStop(0, `rgba(${CYAN},0.28)`);
    hg.addColorStop(1, `rgba(${CYAN},0.03)`);
    ctx.fillStyle = hg;
    ctx.beginPath();
    ctx.arc(hc.u, hc.v, 80, 0, 6.3);
    ctx.fill();
    ctx.strokeStyle = `rgba(${CYAN},0.8)`;
    ctx.lineWidth = 2;
    for (const r of [76, 58]) {
      ctx.beginPath();
      ctx.arc(hc.u, hc.v, r, 0, 6.3);
      ctx.stroke();
    }
    // davanti al portellone: strisce gialle e nere e la scritta
    const av = V(206),
      ah = D - av;
    ctx.save();
    ctx.beginPath();
    ctx.rect(U(-120), av, 240, ah);
    ctx.clip();
    for (let u = U(-120) - ah; u < U(120); u += 16) {
      ctx.fillStyle = '#f1c40f';
      ctx.beginPath();
      ctx.moveTo(u, av + ah);
      ctx.lineTo(u + 8, av + ah);
      ctx.lineTo(u + 8 + ah, av);
      ctx.lineTo(u + ah, av);
      ctx.fill();
    }
    ctx.restore();
    ctx.fillStyle = '#3b4350';
    ctx.fillRect(U(-100), av + 8, 200, ah - 8);
    ctx.fillStyle = '#f1c40f';
    ctx.font = 'bold 11px sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('CAMERA STAGNA · AIRLOCK', U(0), av + 22);
    // ombre agli angoli delle pareti
    const ao = ctx.createLinearGradient(0, 0, 0, 30);
    ao.addColorStop(0, 'rgba(0,0,0,0.35)');
    ao.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = ao;
    ctx.fillRect(0, 0, W, 30);
    const al = ctx.createLinearGradient(0, 0, 30, 0);
    al.addColorStop(0, 'rgba(0,0,0,0.3)');
    al.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = al;
    ctx.fillRect(0, 0, 30, D);
  } finally {
    ctx.restore();
    resetPlane();
  }
}

// ---------------------------------------------------------------- PARETI

/**
 * Parete da stazione spaziale (nel piano della parete, v verso il basso): pannelli bianchi con le
 * giunture, la striscia di luce, le tubature in alto, lo zoccolo tecnico con le prese d'aria.
 */
export function paintStationWall(W: number, H: number, side: string): void {
  const ctx = game.view.ctx;
  const g = ctx.createLinearGradient(0, 0, 0, H);
  g.addColorStop(0, '#f6f8fb');
  g.addColorStop(0.6, '#e6ebf1');
  g.addColorStop(1, '#cfd6df');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, W, H);
  const band = H * 0.6;
  // pannelli: giunture verticali ogni 80 e una orizzontale
  for (let u = 0, i = 0; u < W; u += 80, i++) {
    ctx.fillStyle = 'rgba(0,0,0,0.12)';
    ctx.fillRect(u, 30, 1.2, H - 30);
    ctx.fillStyle = 'rgba(255,255,255,0.8)';
    ctx.fillRect(u + 1.2, 30, 1, H - 30);
    // pannello leggermente in rilievo
    ctx.fillStyle = i % 3 === 1 ? 'rgba(0,0,0,0.025)' : 'rgba(255,255,255,0.25)';
    ctx.fillRect(u + 8, 38, 64, band - 48);
    ctx.strokeStyle = 'rgba(0,0,0,0.07)';
    ctx.lineWidth = 1;
    ctx.strokeRect(u + 8, 38, 64, band - 48);
    // viti
    ctx.fillStyle = '#aab4c0';
    for (const v of [36, band - 8, band + 10, H - 44]) {
      ctx.beginPath();
      ctx.arc(u + 5, v, 1.2, 0, 6.3);
      ctx.fill();
    }
    // sigla del modulo, ogni tanto
    if (i % 3 === 0) {
      ctx.fillStyle = 'rgba(47,54,64,0.45)';
      ctx.font = 'bold 6px monospace';
      ctx.textAlign = 'left';
      ctx.fillText(
        `${side === 'back' ? 'B' : 'A'}-${String(i + 1).padStart(2, '0')}`,
        u + 10,
        band + 14,
      );
    }
  }
  // striscia di luce
  ctx.fillStyle = '#b8c2cc';
  ctx.fillRect(0, band - 2, W, 6);
  const led = ctx.createLinearGradient(0, band - 10, 0, band + 12);
  led.addColorStop(0, `rgba(${CYAN},0)`);
  led.addColorStop(0.5, `rgba(${CYAN},0.35)`);
  led.addColorStop(1, `rgba(${CYAN},0)`);
  ctx.fillStyle = led;
  ctx.fillRect(0, band - 10, W, 22);
  ctx.fillStyle = '#dff9ff';
  ctx.fillRect(0, band, W, 2);
  // tubature in alto, con le staffe
  for (const [v, r, c] of [
    [12, 5, '#9aa7b5'],
    [24, 3.5, '#3fa7d6'],
  ] as [number, number, string][]) {
    const pg = ctx.createLinearGradient(0, v - r, 0, v + r);
    pg.addColorStop(0, '#ffffff');
    pg.addColorStop(0.4, c);
    pg.addColorStop(1, 'rgba(0,0,0,0.5)');
    ctx.fillStyle = pg;
    ctx.fillRect(0, v - r, W, r * 2);
  }
  for (let u = 40; u < W; u += 120) {
    ctx.fillStyle = '#6c7a89';
    ctx.fillRect(u, 4, 6, 26);
    ctx.fillStyle = '#e17055';
    ctx.fillRect(u + 30, 21, 10, 6); // valvola rossa
  }
  // zoccolo tecnico con le prese d'aria
  ctx.fillStyle = '#39424e';
  ctx.fillRect(0, H - 34, W, 27);
  for (let u = 20; u < W - 40; u += 100) {
    ctx.fillStyle = '#232a33';
    ctx.fillRect(u, H - 28, 44, 15);
    ctx.fillStyle = '#5a6675';
    for (let k = 0; k < 5; k++) ctx.fillRect(u + 3, H - 26 + k * 3, 38, 1);
  }
}

/** Grande vetrata sulla luna (decorazione della parete di fondo, si muove: stelle, Terra…). */
export function wallPanorama(d: GameValue, t: number): void {
  const ctx = game.view.ctx;
  const w: number = d.w,
    h: number = d.h,
    x0: number = d.u - w / 2,
    y0: number = d.top;
  // cornice in rilievo
  ctx.fillStyle = 'rgba(0,0,0,0.25)';
  roundRect(ctx, x0 - 8, y0 - 6, w + 18, h + 16, 18);
  ctx.fill();
  ctx.fillStyle = '#8395a7';
  roundRect(ctx, x0 - 10, y0 - 10, w + 20, h + 20, 18);
  ctx.fill();
  ctx.fillStyle = '#2f3640';
  roundRect(ctx, x0 - 4, y0 - 4, w + 8, h + 8, 14);
  ctx.fill();
  ctx.save();
  roundRect(ctx, x0, y0, w, h, 12);
  ctx.clip();
  const sky = ctx.createLinearGradient(0, y0, 0, y0 + h);
  sky.addColorStop(0, '#01020a');
  sky.addColorStop(1, '#0c1233');
  ctx.fillStyle = sky;
  ctx.fillRect(x0, y0, w, h);
  // Via Lattea e stelle
  ctx.fillStyle = 'rgba(160,170,230,0.06)';
  ctx.beginPath();
  ctx.ellipse(x0 + w * 0.4, y0 + h * 0.35, w * 0.6, h * 0.12, -0.25, 0, 6.3);
  ctx.fill();
  for (let i = 0; i < 90; i++) {
    const tw = 0.5 + 0.5 * Math.sin(t * (1 + rnd(i) * 2) + i);
    ctx.fillStyle = `rgba(255,255,255,${0.25 + 0.6 * tw * rnd(i + 40)})`;
    ctx.fillRect(x0 + rnd(i + 3.3) * w, y0 + rnd(i + 7.7) * h * 0.75, 0.9, 0.9);
  }
  drawEarth(ctx, x0 + w * 0.74, y0 + h * 0.3, h * 0.17, t);
  // un satellite che passa ogni tanto, con la lucina
  const sp = (t % 24) / 24;
  if (sp < 0.6) {
    const sx = x0 + w * (sp / 0.6),
      sy = y0 + h * (0.12 + sp * 0.15);
    ctx.fillStyle = '#dfe6e9';
    ctx.fillRect(sx - 1, sy - 1, 2.4, 2.4);
    ctx.fillStyle = '#74b9ff';
    ctx.fillRect(sx - 5, sy - 0.4, 3.5, 1.4);
    ctx.fillRect(sx + 2, sy - 0.4, 3.5, 1.4);
    if (Math.floor(t * 2) % 2) {
      ctx.fillStyle = '#ff7675';
      ctx.fillRect(sx, sy - 2, 1, 1);
    }
  }
  // colline lontane e suolo lunare, illuminati da sinistra
  ctx.fillStyle = '#4b4b48';
  ctx.beginPath();
  ctx.moveTo(x0, y0 + h);
  for (let u = 0; u <= w; u += 6)
    ctx.lineTo(x0 + u, y0 + h * 0.66 - Math.sin(u * 0.03 + 1) * h * 0.06 - rnd(u * 0.1) * 2);
  ctx.lineTo(x0 + w, y0 + h);
  ctx.fill();
  const gnd = ctx.createLinearGradient(x0, 0, x0 + w, 0);
  gnd.addColorStop(0, '#c9c9c1');
  gnd.addColorStop(1, '#7c7c76');
  ctx.fillStyle = gnd;
  ctx.beginPath();
  ctx.moveTo(x0, y0 + h);
  for (let u = 0; u <= w; u += 5) ctx.lineTo(x0 + u, y0 + h * 0.78 - Math.sin(u * 0.05) * h * 0.03);
  ctx.lineTo(x0 + w, y0 + h);
  ctx.fill();
  for (const [cu, cv, cr] of [
    [0.15, 0.9, 10],
    [0.55, 0.86, 6],
    [0.85, 0.93, 13],
    [0.38, 0.95, 4],
  ]) {
    ctx.fillStyle = 'rgba(0,0,0,0.22)';
    ctx.beginPath();
    ctx.ellipse(x0 + w * cu, y0 + h * cv, cr, cr * 0.3, 0, 0, 6.3);
    ctx.fill();
    ctx.fillStyle = 'rgba(255,255,255,0.18)';
    ctx.beginPath();
    ctx.ellipse(x0 + w * cu + cr * 0.2, y0 + h * cv + 0.5, cr * 0.7, cr * 0.18, 0, 0, Math.PI);
    ctx.fill();
  }
  // il razzo CDC-1 atterrato in lontananza
  const rx = x0 + w * 0.27,
    ry = y0 + h * 0.8;
  ctx.fillStyle = '#ecf0f1';
  ctx.fillRect(rx - 2.5, ry - 20, 5, 20);
  ctx.fillStyle = '#e74c3c';
  ctx.beginPath();
  ctx.moveTo(rx - 2.5, ry - 20);
  ctx.lineTo(rx, ry - 27);
  ctx.lineTo(rx + 2.5, ry - 20);
  ctx.fill();
  ctx.fillRect(rx - 5, ry - 5, 2.5, 5);
  ctx.fillRect(rx + 2.5, ry - 5, 2.5, 5);
  // riflessi sul vetro
  ctx.fillStyle = 'rgba(255,255,255,0.06)';
  for (const [a, b] of [
    [0.1, 22],
    [0.5, 12],
  ]) {
    ctx.beginPath();
    ctx.moveTo(x0 + w * a, y0 + h);
    ctx.lineTo(x0 + w * a + b, y0 + h);
    ctx.lineTo(x0 + w * a + b + h * 0.6, y0);
    ctx.lineTo(x0 + w * a + h * 0.6, y0);
    ctx.fill();
  }
  ctx.restore();
  // montanti che dividono i tre vetri, con i bulloni
  for (const k of [1 / 3, 2 / 3]) {
    const mx = x0 + w * k;
    ctx.fillStyle = '#2f3640';
    ctx.fillRect(mx - 3, y0, 6, h);
    ctx.fillStyle = '#8395a7';
    for (let v = y0 + 8; v < y0 + h; v += 18) {
      ctx.beginPath();
      ctx.arc(mx, v, 1.2, 0, 6.3);
      ctx.fill();
    }
  }
}

/** Schermo a parete con lo stato della base: ossigeno, energia, acqua e un radar. */
export function wallStatusScreen(d: GameValue, t: number): void {
  const ctx = game.view.ctx;
  const w: number = d.w || 92,
    h: number = d.h || 54,
    x0: number = d.u - w / 2,
    y0: number = d.top || 20;
  ctx.fillStyle = 'rgba(0,0,0,0.25)';
  ctx.fillRect(x0 + 2, y0 + 3, w, h);
  ctx.fillStyle = '#2f3640';
  roundRect(ctx, x0 - 3, y0 - 3, w + 6, h + 6, 4);
  ctx.fill();
  ctx.fillStyle = '#071521';
  ctx.fillRect(x0, y0, w, h);
  ctx.fillStyle = `rgba(${CYAN},0.9)`;
  ctx.font = 'bold 6px monospace';
  ctx.textAlign = 'left';
  ctx.fillText('STATO BASE · CDC', x0 + 4, y0 + 8);
  const rows: [string, number, string][] = [
    ['O2', 0.96 + Math.sin(t * 0.7) * 0.02, '#4cd137'],
    ['ENERGIA', 0.82 + Math.sin(t * 0.4 + 1) * 0.05, '#fbc531'],
    ['ACQUA', 0.71 + Math.sin(t * 0.3 + 2) * 0.02, '#00a8ff'],
  ];
  rows.forEach(([name, v, c], i) => {
    const yy = y0 + 17 + i * 11;
    ctx.fillStyle = '#9fb3c8';
    ctx.font = '5px monospace';
    ctx.fillText(name, x0 + 4, yy + 3);
    ctx.fillStyle = '#1e3040';
    ctx.fillRect(x0 + 26, yy - 2, w * 0.4, 5);
    ctx.fillStyle = c;
    ctx.fillRect(x0 + 26, yy - 2, w * 0.4 * v, 5);
    ctx.fillStyle = '#dfe6e9';
    ctx.fillText(`${Math.round(v * 100)}%`, x0 + 28 + w * 0.4, yy + 3);
  });
  // radar
  const cx = x0 + w - 15,
    cy = y0 + h / 2 + 3,
    r = 11;
  ctx.strokeStyle = 'rgba(76,209,55,0.6)';
  ctx.lineWidth = 0.6;
  for (const k of [1, 0.6]) {
    ctx.beginPath();
    ctx.arc(cx, cy, r * k, 0, 6.3);
    ctx.stroke();
  }
  const a = t * 2;
  ctx.fillStyle = 'rgba(76,209,55,0.35)';
  ctx.beginPath();
  ctx.moveTo(cx, cy);
  ctx.arc(cx, cy, r, a - 0.7, a);
  ctx.fill();
  ctx.fillStyle = '#4cd137';
  ctx.fillRect(cx + 4, cy - 5, 1.5, 1.5);
}

/** Mappa della luna a parete, con il puntino lampeggiante della base. */
export function wallMoonMap(d: GameValue, t: number): void {
  const ctx = game.view.ctx;
  const w: number = d.w || 100,
    h: number = d.h || 56,
    x0: number = d.u - w / 2,
    y0: number = d.top || 22;
  ctx.fillStyle = 'rgba(0,0,0,0.25)';
  ctx.fillRect(x0 + 2, y0 + 3, w, h);
  ctx.fillStyle = '#2f3640';
  roundRect(ctx, x0 - 3, y0 - 3, w + 6, h + 6, 4);
  ctx.fill();
  ctx.fillStyle = '#0a1a26';
  ctx.fillRect(x0, y0, w, h);
  // curve di livello
  ctx.strokeStyle = 'rgba(0,210,255,0.35)';
  ctx.lineWidth = 0.6;
  for (let k = 0; k < 6; k++) {
    ctx.beginPath();
    for (let u = 0; u <= w; u += 4) {
      const v = h * (0.15 + k * 0.15) + Math.sin(u * 0.08 + k) * 4 + Math.cos(u * 0.03 + k * 2) * 3;
      if (u) ctx.lineTo(x0 + u, y0 + v);
      else ctx.moveTo(x0 + u, y0 + v);
    }
    ctx.stroke();
  }
  // crateri
  ctx.strokeStyle = 'rgba(0,210,255,0.6)';
  for (const [cu, cv, cr] of [
    [0.2, 0.3, 7],
    [0.7, 0.65, 9],
    [0.45, 0.8, 4],
  ]) {
    ctx.beginPath();
    ctx.arc(x0 + w * cu, y0 + h * cv, cr, 0, 6.3);
    ctx.stroke();
  }
  // griglia
  ctx.strokeStyle = 'rgba(255,255,255,0.06)';
  for (let u = 10; u < w; u += 10) {
    ctx.beginPath();
    ctx.moveTo(x0 + u, y0);
    ctx.lineTo(x0 + u, y0 + h);
    ctx.stroke();
  }
  const on = Math.floor(t * 2) % 2 === 0;
  const bx = x0 + w * 0.58,
    by = y0 + h * 0.42;
  ctx.fillStyle = on ? '#ff4757' : '#7a1a1a';
  ctx.beginPath();
  ctx.arc(bx, by, 2.2, 0, 6.3);
  ctx.fill();
  ctx.strokeStyle = `rgba(255,71,87,${on ? 0.6 : 0.2})`;
  ctx.beginPath();
  ctx.arc(bx, by, 5 + ((t * 6) % 6), 0, 6.3);
  ctx.stroke();
  ctx.fillStyle = '#ffffff';
  ctx.font = 'bold 5px monospace';
  ctx.textAlign = 'left';
  ctx.fillText('BASE CDC', bx + 5, by - 3);
  ctx.fillStyle = `rgba(${CYAN},0.9)`;
  ctx.fillText('MARE TRANQUILLITATIS', x0 + 4, y0 + h - 4);
}

/** Insegna della base: pannello scuro con le lettere azzurre accese e il logo. */
export function wallBaseSign(d: GameValue, t: number): void {
  const ctx = game.view.ctx;
  const w: number = d.w || 150,
    h: number = d.h || 40,
    x0: number = d.u - w / 2,
    y0: number = d.top || 30;
  ctx.fillStyle = 'rgba(0,0,0,0.25)';
  roundRect(ctx, x0 + 3, y0 + 4, w, h, 8);
  ctx.fill();
  ctx.fillStyle = '#1e272e';
  roundRect(ctx, x0, y0, w, h, 8);
  ctx.fill();
  ctx.strokeStyle = '#57606f';
  ctx.lineWidth = 2;
  ctx.stroke();
  // ogni tanto le lettere sfarfallano un attimo
  const on = Math.sin(t * 9) > 0.985 ? 0.55 : 1;
  ctx.save();
  ctx.shadowColor = `rgba(${CYAN},${on})`;
  ctx.shadowBlur = 10;
  ctx.fillStyle = `rgba(150,240,255,${on})`;
  ctx.font = 'bold 22px sans-serif';
  ctx.textAlign = 'left';
  ctx.fillText('BASE CDC', x0 + h * 0.95, y0 + h * 0.7);
  ctx.restore();
  // logo: luna con l'orbita del razzo
  const cx = x0 + h * 0.5,
    cy = y0 + h / 2;
  ctx.fillStyle = '#dfe6e9';
  ctx.beginPath();
  ctx.arc(cx, cy, h * 0.26, 0, 6.3);
  ctx.fill();
  ctx.fillStyle = '#1e272e';
  ctx.beginPath();
  ctx.arc(cx + h * 0.1, cy - h * 0.06, h * 0.22, 0, 6.3);
  ctx.fill();
  ctx.strokeStyle = '#ff4757';
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.ellipse(cx, cy, h * 0.36, h * 0.12, -0.4, 0, 6.3);
  ctx.stroke();
}

/** Oblò tondo con le stelle (parete degli alloggi). */
export function wallPorthole(d: GameValue, t: number): void {
  const ctx = game.view.ctx;
  const r: number = d.r || 18,
    cx: number = d.u,
    cy: number = (d.top || 30) + r;
  ctx.fillStyle = 'rgba(0,0,0,0.25)';
  ctx.beginPath();
  ctx.arc(cx + 2, cy + 3, r + 5, 0, 6.3);
  ctx.fill();
  ctx.fillStyle = '#8395a7';
  ctx.beginPath();
  ctx.arc(cx, cy, r + 5, 0, 6.3);
  ctx.fill();
  ctx.fillStyle = '#05060f';
  ctx.beginPath();
  ctx.arc(cx, cy, r, 0, 6.3);
  ctx.fill();
  for (let i = 0; i < 14; i++) {
    const a = rnd(i + 5) * 6.3,
      dd = rnd(i + 9) * r * 0.9;
    ctx.fillStyle = `rgba(255,255,255,${0.4 + 0.5 * Math.abs(Math.sin(t + i))})`;
    ctx.fillRect(cx + Math.cos(a) * dd, cy + Math.sin(a) * dd, 0.9, 0.9);
  }
  ctx.fillStyle = 'rgba(255,255,255,0.12)';
  ctx.beginPath();
  ctx.arc(cx - r * 0.3, cy - r * 0.3, r * 0.5, 0, 6.3);
  ctx.fill();
  ctx.fillStyle = '#2f3640';
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * 6.3;
    ctx.beginPath();
    ctx.arc(cx + Math.cos(a) * (r + 2.5), cy + Math.sin(a) * (r + 2.5), 1, 0, 6.3);
    ctx.fill();
  }
}

// ---------------------------------------------------------------- PLANCIA DI COMANDO

/** Monitor su un braccio: contenuto diverso per ognuno (radar, rotta, onde). */
function monitor(x: number, y: number, z: number, w: number, kind: number, t: number) {
  const ctx = game.view.ctx;
  box(x, y + 4, 3, 3, 10, '#57606f', { z0: z });
  const scr = box(x, y, w, 3, 26, '#1e272e', { z0: z + 8 });
  onFace(scr, 'left', (W: number, H: number): void => {
    ctx.fillStyle = '#06131f';
    ctx.fillRect(1.5, 1.5, W - 3, H - 3);
    ctx.save();
    ctx.beginPath();
    ctx.rect(1.5, 1.5, W - 3, H - 3);
    ctx.clip();
    if (kind === 0) {
      // radar
      const cx = W / 2,
        cy = H / 2,
        r = H * 0.38;
      ctx.strokeStyle = 'rgba(76,209,55,0.6)';
      ctx.lineWidth = 0.6;
      for (const k of [1, 0.6, 0.25]) {
        ctx.beginPath();
        ctx.arc(cx, cy, r * k, 0, 6.3);
        ctx.stroke();
      }
      ctx.fillStyle = 'rgba(76,209,55,0.35)';
      ctx.beginPath();
      ctx.moveTo(cx, cy);
      ctx.arc(cx, cy, r, t * 2 - 0.8, t * 2);
      ctx.fill();
    } else if (kind === 1) {
      // rotta Terra-Luna
      ctx.fillStyle = '#2e86de';
      ctx.beginPath();
      ctx.arc(W * 0.2, H * 0.55, H * 0.14, 0, 6.3);
      ctx.fill();
      ctx.fillStyle = '#c8c8c0';
      ctx.beginPath();
      ctx.arc(W * 0.82, H * 0.4, H * 0.09, 0, 6.3);
      ctx.fill();
      ctx.strokeStyle = 'rgba(254,202,87,0.8)';
      ctx.setLineDash([2, 2]);
      ctx.lineWidth = 0.8;
      ctx.beginPath();
      ctx.moveTo(W * 0.2, H * 0.55);
      ctx.quadraticCurveTo(W * 0.5, H * 0.05, W * 0.82, H * 0.4);
      ctx.stroke();
      ctx.setLineDash([]);
      const k = (t * 0.1) % 1;
      const px = (1 - k) * (1 - k) * W * 0.2 + 2 * (1 - k) * k * W * 0.5 + k * k * W * 0.82,
        py = (1 - k) * (1 - k) * H * 0.55 + 2 * (1 - k) * k * H * 0.05 + k * k * H * 0.4;
      ctx.fillStyle = '#ff4757';
      ctx.fillRect(px - 1, py - 1, 2, 2);
    } else {
      // onde e cifre
      ctx.strokeStyle = '#00d2d3';
      ctx.lineWidth = 0.8;
      ctx.beginPath();
      for (let u = 2; u < W - 2; u += 1.5) {
        const v = H * 0.45 + Math.sin(u * 0.5 + t * 4) * H * 0.15 * Math.sin(u * 0.08 + t);
        if (u === 2) ctx.moveTo(u, v);
        else ctx.lineTo(u, v);
      }
      ctx.stroke();
      ctx.fillStyle = 'rgba(0,210,211,0.8)';
      ctx.font = '4px monospace';
      ctx.textAlign = 'left';
      ctx.fillText(`T+${Math.floor(t * 10) % 10000}`, 3, H - 3);
    }
    ctx.restore();
  });
  glow(P(x, y + 3, z + 20), 22 * isoScale(), CYAN, 0.12);
}

/** Plancia di comando (il pannello di controllo dei progetti): banco lungo, tastiere e monitor. */
export function drawBaseConsole(it: GameValue, t: number, lights?: Lights): void {
  const ctx = game.view.ctx;
  const { x, y, w, h } = it;
  const desk = box(x, y, w, h, 30, '#dfe4ea', { top: '#2f3640', left: '#cfd6de' });
  onFace(desk, 'left', (W: number, H: number): void => {
    ctx.fillStyle = '#b8c2cc';
    ctx.fillRect(0, H - 6, W, 6);
    ctx.fillStyle = `rgba(${CYAN},0.9)`;
    ctx.fillRect(0, 4, W, 2);
    for (let u = 12; u < W - 20; u += 46) {
      ctx.strokeStyle = 'rgba(0,0,0,0.15)';
      ctx.strokeRect(u, 9, 36, H - 18);
      ctx.fillStyle = '#57606f';
      ctx.fillRect(u + 30, H / 2 - 2, 3, 4);
    }
  });
  onFace(desk, 'top', (W: number, H: number): void => {
    // tastiere e pulsanti che lampeggiano
    for (let u = 8; u < W - 10; u += 30) {
      ctx.fillStyle = '#4b5563';
      ctx.fillRect(u, H * 0.45, 22, H * 0.4);
      ctx.fillStyle = '#9aa5b3';
      for (let k = 0; k < 4; k++)
        for (let j = 0; j < 2; j++) ctx.fillRect(u + 2 + k * 5, H * 0.5 + j * 5, 3.5, 3);
    }
    for (let i = 0; i < 18; i++) {
      const on = Math.floor(t * 3 + i * 1.7) % 3 === 0;
      ctx.fillStyle = on ? ['#ff4757', '#2ed573', '#feca57'][i % 3] : '#3d4652';
      ctx.fillRect(6 + i * ((W - 12) / 18), H * 0.18, 4, 3);
    }
  });
  const n = 3;
  for (let i = 0; i < n; i++)
    monitor(x - w / 2 + (w / n) * (i + 0.5), y - h / 2 + 4, 30, w / n - 10, i, t);
  if (lights) lights.push({ x, y: y + 20, z: 40, r: 170, color: CYAN });
}

/** Poltrona del comandante, girevole, rivolta alla plancia. */
function drawCaptainChair(it: GameValue): void {
  const { x, y } = it;
  for (const [dx, dy] of [
    [-9, 0],
    [9, 0],
    [0, -9],
    [0, 9],
  ])
    box(x + dx / 2, y + dy / 2, dx ? 18 : 3, dy ? 18 : 3, 2, '#2d3436');
  box(x, y, 4, 4, 14, '#7f8c8d', { z0: 2 });
  box(x, y, 26, 24, 7, '#2d3436', { z0: 16, top: '#3d4652' });
  box(x, y + 2, 20, 18, 2, '#00a8ff', { z0: 23 });
  // braccioli e schienale (dietro, verso chi guarda: la poltrona guarda la plancia)
  box(x - 14, y, 3, 18, 9, '#2d3436', { z0: 23 });
  box(x + 14, y, 3, 18, 9, '#2d3436', { z0: 23 });
  box(x, y + 11, 26, 5, 30, '#2d3436', { z0: 21 });
  box(x, y + 13.6, 18, 0.5, 20, '#00a8ff', { z0: 26 });
}

// ---------------------------------------------------------------- OLOGRAMMA

/** Tavolo olografico: la Luna che gira a mezz'aria, con il fascio di luce e le scritte. */
function drawHolo(it: GameValue, t: number, lights?: Lights): void {
  const ctx = game.view.ctx;
  const s = isoScale();
  const { x, y } = it;
  cylinder(x, y, 30, 0, 22, '#57606f', '#1e272e');
  fillDisc(x, y, 22, 30, '#2f3640');
  fillDisc(x, y, 22.5, 24, `rgba(${CYAN},0.5)`);
  fillDisc(x, y, 23, 18, '#0b2a3a');
  // fascio di luce
  const base = disc(x, y, 23, 18),
    c = P(x, y, 84),
    R = 26 * s;
  const beam = ctx.createLinearGradient(0, base.c.y, 0, c.y - R);
  beam.addColorStop(0, `rgba(${CYAN},0.35)`);
  beam.addColorStop(1, `rgba(${CYAN},0)`);
  ctx.fillStyle = beam;
  ctx.beginPath();
  ctx.moveTo(base.c.x - base.rx, base.c.y);
  ctx.lineTo(c.x - R, c.y);
  ctx.lineTo(c.x + R, c.y);
  ctx.lineTo(base.c.x + base.rx, base.c.y);
  ctx.ellipse(base.c.x, base.c.y, base.rx, base.ry, 0, 0, Math.PI);
  ctx.fill();
  // la sfera: meridiani che girano, crateri, linee di scansione
  const bob = Math.sin(t * 1.2) * 2 * s;
  const cy = c.y + bob;
  ctx.save();
  ctx.globalCompositeOperation = 'lighter';
  const sphere = ctx.createRadialGradient(c.x - R * 0.3, cy - R * 0.3, R * 0.1, c.x, cy, R);
  sphere.addColorStop(0, `rgba(${CYAN},0.45)`);
  sphere.addColorStop(1, `rgba(${CYAN},0.12)`);
  ctx.fillStyle = sphere;
  ctx.beginPath();
  ctx.arc(c.x, cy, R, 0, 6.3);
  ctx.fill();
  ctx.strokeStyle = `rgba(${CYAN},0.6)`;
  ctx.lineWidth = 0.8;
  for (let i = 0; i < 6; i++) {
    const ph = ((t * 0.5 + i / 6) % 1) * Math.PI;
    ctx.beginPath();
    ctx.ellipse(c.x, cy, Math.abs(Math.cos(ph)) * R, R, 0, 0, 6.3);
    ctx.stroke();
  }
  for (const k of [-0.5, 0, 0.5]) {
    ctx.beginPath();
    ctx.ellipse(c.x, cy + k * R, R * Math.sqrt(1 - k * k), R * 0.18, 0, 0, 6.3);
    ctx.stroke();
  }
  for (let i = 0; i < 5; i++) {
    const a = t * 0.5 * 2 + i * 1.3;
    const cx = Math.cos(a);
    if (Math.sin(a) < 0) continue;
    ctx.fillStyle = `rgba(200,255,255,0.35)`;
    ctx.beginPath();
    ctx.ellipse(
      c.x + cx * R * 0.7,
      cy + (rnd(i) - 0.5) * R,
      R * 0.12 * Math.sin(a),
      R * 0.1,
      0,
      0,
      6.3,
    );
    ctx.fill();
  }
  ctx.restore();
  // anello che gira attorno e scritte che fluttuano
  ctx.strokeStyle = `rgba(${CYAN},0.7)`;
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.ellipse(c.x, cy + R * 0.15, R * 1.5, R * 0.35, 0, 0, 6.3);
  ctx.stroke();
  const a = t * 1.5;
  ctx.fillStyle = '#ffffff';
  ctx.beginPath();
  ctx.arc(c.x + Math.cos(a) * R * 1.5, cy + R * 0.15 + Math.sin(a) * R * 0.35, 1.8 * s, 0, 6.3);
  ctx.fill();
  ctx.fillStyle = `rgba(${CYAN},0.9)`;
  ctx.font = `bold ${Math.round(5 * s)}px monospace`;
  ctx.textAlign = 'left';
  ctx.fillText('LUNA · 3.474 km', c.x + R * 1.1, cy - R * 0.8);
  ctx.fillText(`ORBITA ${(27.3).toFixed(1)} g`, c.x + R * 1.1, cy - R * 0.8 + 7 * s);
  if (lights) lights.push({ x, y, z: 30, r: 170, color: CYAN });
}

// ---------------------------------------------------------------- SERRA

/** Scaffale idroponico lungo x: tre ripiani di piante sotto le lampade viola. */
function drawHydroRack(it: GameValue, t: number, lights?: Lights): void {
  const ctx = game.view.ctx;
  const s = isoScale();
  const { x, y, w, h } = it;
  for (const [dx, dy] of [
    [-w / 2 + 2, -h / 2 + 2],
    [w / 2 - 2, -h / 2 + 2],
    [-w / 2 + 2, h / 2 - 2],
    [w / 2 - 2, h / 2 - 2],
  ])
    box(x + dx, y + dy, 3, 3, it.z, '#95a5a6');
  const shelves = [6, 36, 66];
  shelves.forEach((z, si) => {
    // vasca con l'acqua
    box(x, y, w - 4, h - 4, 5, '#dfe6e9', { z0: z, top: '#3fa7d6' });
    // piante: lattuga, pomodori, fragole
    const n = Math.floor((w - 10) / 11);
    for (let i = 0; i < n; i++)
      for (const dy of [-h / 4, h / 4]) {
        const px = x - w / 2 + 8 + i * 11 + (dy > 0 ? 5 : 0);
        const p = P(px, y + dy, z + 5);
        const sway = Math.sin(t * 1.3 + i + si * 2 + dy) * 0.6 * s;
        const kind = (i + si + (dy > 0 ? 1 : 0)) % 3;
        ctx.fillStyle = kind === 1 ? '#27ae60' : '#2ecc71';
        for (let k = 0; k < 3; k++) {
          ctx.beginPath();
          ctx.ellipse(
            p.x + sway + (k - 1) * 2.4 * s,
            p.y - (4 + (k % 2) * 2) * s,
            2.8 * s,
            4.5 * s,
            (k - 1) * 0.5,
            0,
            6.3,
          );
          ctx.fill();
        }
        if (kind === 1) {
          ctx.fillStyle = '#e74c3c';
          ctx.beginPath();
          ctx.arc(p.x + sway + 2 * s, p.y - 5 * s, 1.6 * s, 0, 6.3);
          ctx.arc(p.x + sway - 1.5 * s, p.y - 7 * s, 1.4 * s, 0, 6.3);
          ctx.fill();
        } else if (kind === 2) {
          ctx.fillStyle = '#ff6b81';
          ctx.beginPath();
          ctx.arc(p.x + sway, p.y - 8 * s, 1.2 * s, 0, 6.3);
          ctx.fill();
        }
      }
    // lampada viola sotto il ripiano sopra
    if (si < shelves.length) {
      const lz = z + 27;
      box(x, y, w - 8, 4, 1.5, '#dcdde1', { z0: lz });
      const a = P(x - w / 2 + 6, y, lz),
        b = P(x + w / 2 - 6, y, lz);
      ctx.strokeStyle = 'rgba(214,140,255,0.95)';
      ctx.lineWidth = 1.6 * s;
      ctx.beginPath();
      ctx.moveTo(a.x, a.y);
      ctx.lineTo(b.x, b.y);
      ctx.stroke();
      glow(P(x, y, z + 14), 34 * s, '190,90,255', 0.18);
    }
  });
  box(x, y, w, h, 3, '#b2bec3', { z0: it.z - 3 });
  if (lights) lights.push({ x, y: y + 10, z: 40, r: 120, color: '190,90,255' });
}

/** Aiuola rialzata con un alberello (il primo albero della luna) e i fiori. */
function drawPlanter(it: GameValue, t: number): void {
  const ctx = game.view.ctx;
  const s = isoScale();
  const { x, y, w, h } = it;
  const bed = box(x, y, w, h, 18, '#dfe4ea', { top: '#6d4c41' });
  onFace(bed, 'left', (W: number, H: number): void => {
    ctx.fillStyle = '#00a8ff';
    ctx.fillRect(0, 3, W, 2);
    ctx.fillStyle = '#2f3640';
    ctx.font = 'bold 5px sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('ALBERO LUNARE', W / 2, H - 4);
  });
  // terra con i fili d'erba e i fiori
  for (let i = 0; i < 26; i++) {
    const p = P(x - w / 2 + 3 + rnd(i * 3.1) * (w - 6), y - h / 2 + 3 + rnd(i * 5.7) * (h - 6), 18);
    ctx.fillStyle = i % 5 === 0 ? ['#ff6b81', '#feca57', '#ffffff', '#a29bfe'][i % 4] : '#4cd137';
    ctx.beginPath();
    ctx.arc(p.x, p.y - 1.5 * s, (i % 5 === 0 ? 1.8 : 1.3) * s, 0, 6.3);
    ctx.fill();
  }
  cylinder(x, y, 3, 18, 58, '#8d6e63', '#4e342e');
  const top = P(x, y, 70);
  const sway = Math.sin(t * 0.8) * 1.2 * s;
  for (const [dx, dy, r, c] of [
    [-10, 6, 13, '#2e7d32'],
    [10, 5, 12, '#388e3c'],
    [0, -6, 15, '#43a047'],
    [-4, 10, 10, '#66bb6a'],
    [6, -14, 9, '#81c784'],
  ] as [number, number, number, string][]) {
    ctx.fillStyle = c;
    ctx.beginPath();
    ctx.arc(top.x + dx * s + sway, top.y + dy * s, r * s, 0, 6.3);
    ctx.fill();
  }
  // limoni
  ctx.fillStyle = '#feca57';
  for (const [dx, dy] of [
    [-8, 4],
    [7, -2],
    [2, 10],
  ]) {
    ctx.beginPath();
    ctx.ellipse(top.x + dx * s + sway, top.y + dy * s, 2 * s, 2.6 * s, 0, 0, 6.3);
    ctx.fill();
  }
}

// ---------------------------------------------------------------- ALLOGGI

/** Cuccette a castello lungo y, con tenda, cuscini, coperte e lucina da lettura. */
function drawBunk(it: GameValue, t: number, lights?: Lights): void {
  const ctx = game.view.ctx;
  const { x, y, w, h } = it;
  for (const [dx, dy] of [
    [-w / 2 + 2, -h / 2 + 2],
    [w / 2 - 2, -h / 2 + 2],
    [-w / 2 + 2, h / 2 - 2],
    [w / 2 - 2, h / 2 - 2],
  ])
    box(x + dx, y + dy, 4, 4, 68, '#b2bec3');
  const colors = [it.color || '#3742fa', it.color2 || '#e1b12c'];
  [8, 40].forEach((z, i) => {
    box(x, y, w, h, 6, '#dfe4ea', { z0: z });
    box(x, y, w - 6, h - 6, 4, '#f5f6fa', { z0: z + 6 });
    // coperta con la piega e il cuscino
    box(x, y + 6, w - 8, h - 22, 3, colors[i], { z0: z + 10 });
    box(x, y - h / 2 + 22, w - 8, 4, 3.6, game.lighten(colors[i], 0.35), { z0: z + 10 });
    box(x, y - h / 2 + 9, w - 14, 10, 5, '#ffffff', { z0: z + 10 });
    // lucina da lettura
    const lp = P(x - w / 2 + 3, y - h / 2 + 12, z + 24);
    ctx.fillStyle = '#ffeaa7';
    ctx.beginPath();
    ctx.arc(lp.x, lp.y, 1.6 * isoScale(), 0, 6.3);
    ctx.fill();
    glow(lp, 18 * isoScale(), '255,220,150', 0.25);
  });
  // scaletta
  for (let z = 14; z < 46; z += 8) box(x + w / 2, y + h / 2 - 4, 2, 10, 1.5, '#95a5a6', { z0: z });
  if (lights) lights.push({ x, y, z: 20, r: 70, color: '255,220,150' });
  void t;
}

/** Armadietti contro la parete sinistra (ante sulla faccia verso destra), con le targhette. */
function drawLockers(it: GameValue): void {
  const ctx = game.view.ctx;
  const b = box(it.x, it.y, it.w, it.h, it.z, '#ced6e0', { right: '#b8c2cc' });
  onFace(b, 'right', (W: number, H: number): void => {
    const n = 4;
    const names = ['TOM', 'ALEX', 'SARA', 'LUCA'];
    for (let i = 0; i < n; i++) {
      const lx = 2 + (i * (W - 4)) / n,
        lw = (W - 4) / n - 2;
      ctx.fillStyle = i % 2 ? '#dfe4ea' : '#d5dce4';
      ctx.fillRect(lx, 3, lw, H - 6);
      ctx.strokeStyle = 'rgba(0,0,0,0.25)';
      ctx.lineWidth = 0.8;
      ctx.strokeRect(lx, 3, lw, H - 6);
      // feritoie, maniglia, targhetta col nome
      ctx.fillStyle = '#7f8c8d';
      for (let k = 0; k < 4; k++) ctx.fillRect(lx + 3, 8 + k * 3, lw - 6, 1);
      ctx.fillRect(lx + lw - 4, H * 0.5, 1.5, 7);
      ctx.fillStyle = ['#ff4757', '#00a8ff', '#2ed573', '#ffa502'][i];
      ctx.fillRect(lx + 2, H * 0.3, lw - 4, 5);
      ctx.fillStyle = '#ffffff';
      ctx.font = 'bold 3.5px sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText(names[i], lx + lw / 2, H * 0.3 + 4);
    }
  });
  // casco appoggiato sopra
  const p = P(it.x, it.y - 8, it.z + 7);
  const s = isoScale();
  ctx.fillStyle = '#f5f6fa';
  ctx.beginPath();
  ctx.arc(p.x, p.y, 7 * s, 0, 6.3);
  ctx.fill();
  ctx.fillStyle = '#f39c12';
  ctx.beginPath();
  ctx.ellipse(p.x + 1.5 * s, p.y + 0.5 * s, 4.5 * s, 3.5 * s, 0, 0, 6.3);
  ctx.fill();
  ctx.fillStyle = 'rgba(255,255,255,0.6)';
  ctx.beginPath();
  ctx.ellipse(p.x, p.y - 1 * s, 1.6 * s, 1 * s, -0.5, 0, 6.3);
  ctx.fill();
}

/** Cambusa contro la parete sinistra: mobile, macchina del caffè, forno, pensile. */
function drawGalley(it: GameValue, t: number, lights?: Lights): void {
  const ctx = game.view.ctx;
  const s = isoScale();
  const { x, y, w, h } = it;
  const counter = box(x, y, w, h, 36, '#dfe4ea', { top: '#57606f', right: '#cfd6de' });
  onFace(counter, 'right', (W: number, H: number): void => {
    for (let u = 3; u < W - 6; u += W / 3) {
      ctx.strokeStyle = 'rgba(0,0,0,0.2)';
      ctx.strokeRect(u, 4, W / 3 - 4, H - 8);
      ctx.fillStyle = '#7f8c8d';
      ctx.fillRect(u + 4, 8, W / 3 - 12, 1.5);
    }
  });
  // macchina del caffè con la luce verde e il vapore
  box(x, y - h / 2 + 14, 14, 14, 18, '#2f3640', { z0: 36 });
  const cp = P(x + 7, y - h / 2 + 14, 44);
  ctx.fillStyle = Math.floor(t * 1.5) % 2 ? '#2ed573' : '#1e8449';
  ctx.fillRect(cp.x, cp.y, 1.6 * s, 1.6 * s);
  for (let i = 0; i < 3; i++) {
    const k = (t * 0.6 + i / 3) % 1;
    const sp = P(x, y - h / 2 + 14, 58 + k * 20);
    ctx.fillStyle = `rgba(255,255,255,${0.35 * (1 - k)})`;
    ctx.beginPath();
    ctx.arc(sp.x + Math.sin(k * 6 + i) * 3 * s, sp.y, (2 + k * 3) * s, 0, 6.3);
    ctx.fill();
  }
  // forno a microonde
  const oven = box(x, y + 8, 16, 22, 13, '#dcdde1', { z0: 36 });
  onFace(oven, 'right', (W: number, H: number): void => {
    ctx.fillStyle = '#1e272e';
    ctx.fillRect(2, 2, W * 0.65, H - 4);
    ctx.fillStyle = '#feca57';
    ctx.font = 'bold 4px monospace';
    ctx.textAlign = 'left';
    ctx.fillText('12:00', W * 0.7, 6);
  });
  // vaschette di cibo spaziale
  for (let i = 0; i < 3; i++)
    box(x, y + h / 2 - 10 - i * 7, 10, 5, 2, ['#ff7675', '#74b9ff', '#55efc4'][i], { z0: 36 });
  // pensile
  const cab = box(x - w / 2 + 6, y, 12, h, 26, '#f5f6fa', { z0: 72, right: '#e1e5ea' });
  onFace(cab, 'right', (W: number, H: number): void => {
    ctx.strokeStyle = 'rgba(0,0,0,0.18)';
    ctx.strokeRect(2, 2, W / 2 - 3, H - 4);
    ctx.strokeRect(W / 2 + 1, 2, W / 2 - 3, H - 4);
  });
  if (lights) lights.push({ x: x + 20, y, z: 30, r: 80, color: '255,240,220' });
}

/** Tavolo tondo della mensa, con gli sgabelli, le tazze e un tablet. */
function drawMessTable(it: GameValue, t: number): void {
  const ctx = game.view.ctx;
  const s = isoScale();
  const { x, y } = it;
  const r = it.r || 30;
  for (let i = 0; i < 5; i++) {
    const a = (i / 5) * Math.PI * 2 + 0.5;
    const sx = x + Math.cos(a) * (r + 14),
      sy = y + Math.sin(a) * (r + 14);
    cylinder(sx, sy, 2, 0, 14, '#a4b0be', '#57606f');
    cylinder(sx, sy, 8, 14, 18, '#00a8ff', '#0062a3');
  }
  cylinder(x, y, 5, 0, 24, '#a4b0be', '#57606f');
  cylinder(x, y, r, 24, 27, '#f5f6fa', '#b8c2cc');
  // tazze con il caffè fumante e un tablet acceso
  for (const [dx, dy] of [
    [-12, -6],
    [10, 8],
  ]) {
    cylinder(x + dx, y + dy, 3, 27, 33, '#ffffff', '#ced6e0');
    fillDisc(x + dx, y + dy, 33, 2.2, '#6d4c41');
  }
  const tab = [
    P(x - 2, y + 2, 27.5),
    P(x + 14, y - 6, 27.5),
    P(x + 20, y + 4, 27.5),
    P(x + 4, y + 12, 27.5),
  ];
  poly(tab, '#1e272e');
  poly(
    [P(x, y + 3, 27.6), P(x + 13, y - 4, 27.6), P(x + 18, y + 4, 27.6), P(x + 5, y + 10, 27.6)],
    Math.floor(t) % 4 ? '#0a3d62' : '#1e3799',
  );
  void ctx;
  void s;
}

/** Tapis roulant per tenersi in forma (sulla luna i muscoli si indeboliscono). */
function drawTreadmill(it: GameValue, t: number): void {
  const ctx = game.view.ctx;
  const { x, y, w, h } = it;
  const base = box(x, y, w, h, 8, '#2f3640', { top: '#1e272e' });
  onFace(base, 'top', (W: number, H: number): void => {
    ctx.fillStyle = '#111';
    ctx.fillRect(3, 4, W - 6, H - 12);
    ctx.strokeStyle = '#3d4652';
    ctx.lineWidth = 0.8;
    const off = (t * 20) % 6;
    for (let v = 4 + off; v < H - 8; v += 6) {
      ctx.beginPath();
      ctx.moveTo(3, v);
      ctx.lineTo(W - 3, v);
      ctx.stroke();
    }
  });
  box(x - w / 2 + 3, y - h / 2 + 4, 3, 3, 40, '#7f8c8d', { z0: 8 });
  box(x + w / 2 - 3, y - h / 2 + 4, 3, 3, 40, '#7f8c8d', { z0: 8 });
  const scr = box(x, y - h / 2 + 4, w, 6, 10, '#2f3640', { z0: 44 });
  onFace(scr, 'left', (W: number, H: number): void => {
    ctx.fillStyle = '#071521';
    ctx.fillRect(2, 2, W - 4, H - 4);
    ctx.fillStyle = '#2ed573';
    ctx.font = 'bold 4px monospace';
    ctx.textAlign = 'center';
    ctx.fillText(`${(6 + Math.sin(t) * 0.4).toFixed(1)} km/h`, W / 2, H - 3);
  });
}

// ---------------------------------------------------------------- OFFICINA

/** Armadio dei server: tante lucine che lampeggiano e le ventole. */
function drawServer(it: GameValue, t: number, lights?: Lights): void {
  const ctx = game.view.ctx;
  const b = box(it.x, it.y, it.w, it.h, it.z, '#2f3640', { left: '#353b48', top: '#3d4652' });
  onFace(b, 'left', (W: number, H: number): void => {
    for (let v = 6, r = 0; v < H - 8; v += 9, r++) {
      ctx.fillStyle = '#1e272e';
      ctx.fillRect(3, v, W - 6, 7);
      for (let i = 0; i < 6; i++) {
        const on = Math.sin(t * (3 + ((r * 7 + i) % 5)) + r * 2 + i * 3) > 0.2;
        ctx.fillStyle = on
          ? i % 3 === 0
            ? '#2ed573'
            : i % 3 === 1
              ? '#00d2d3'
              : '#ffa502'
          : '#3d4652';
        ctx.fillRect(5 + i * 3, v + 2.5, 1.6, 1.6);
      }
      ctx.fillStyle = '#4b5563';
      ctx.fillRect(W - 14, v + 2, 9, 3);
    }
  });
  onFace(b, 'right', (W: number, H: number): void => {
    ctx.strokeStyle = 'rgba(255,255,255,0.08)';
    for (let v = 6; v < H - 4; v += 4) {
      ctx.beginPath();
      ctx.moveTo(3, v);
      ctx.lineTo(W - 3, v);
      ctx.stroke();
    }
  });
  if (lights) lights.push({ x: it.x, y: it.y + 20, z: 30, r: 80, color: '46,213,115' });
}

/** Bombole di ossigeno e azoto legate alla rastrelliera. */
function drawTanks(it: GameValue): void {
  const ctx = game.view.ctx;
  const s = isoScale();
  const { x, y } = it;
  box(x, y, it.w, it.h, 4, '#57606f');
  const tanks: [number, string, string, string][] = [
    [-it.h / 3, '#74b9ff', '#0652dd', 'O₂'],
    [0, '#74b9ff', '#0652dd', 'O₂'],
    [it.h / 3, '#dfe6e9', '#636e72', 'N₂'],
  ];
  for (const [dy, l, d, label] of tanks) {
    cylinder(x, y + dy, 7, 4, 62, l, d);
    cylinder(x, y + dy, 3, 62, 68, '#b2bec3', '#57606f');
    const p = P(x + 7, y + dy, 40);
    ctx.fillStyle = '#ffffff';
    ctx.font = `bold ${Math.round(5 * s)}px sans-serif`;
    ctx.textAlign = 'center';
    ctx.fillText(label, p.x - 4 * s, p.y);
  }
  // cinghia gialla
  const a = P(x, y - it.h / 2, 46),
    b = P(x, y + it.h / 2, 46);
  ctx.strokeStyle = '#f1c40f';
  ctx.lineWidth = 2 * s;
  ctx.beginPath();
  ctx.moveTo(a.x + 8 * s, a.y);
  ctx.lineTo(b.x + 8 * s, b.y);
  ctx.stroke();
}

/** Banco da lavoro: attrezzi appesi, morsa, una ruota del rover da riparare e il tablet. */
function drawWorkbench(it: GameValue, t: number, lights?: Lights): void {
  const ctx = game.view.ctx;
  const s = isoScale();
  const { x, y, w, h } = it;
  for (const [dx, dy] of [
    [-w / 2 + 3, -h / 2 + 3],
    [w / 2 - 3, -h / 2 + 3],
    [-w / 2 + 3, h / 2 - 3],
    [w / 2 - 3, h / 2 - 3],
  ])
    box(x + dx, y + dy, 4, 4, 32, '#57606f');
  box(x, y, w, h, 5, '#e17055', { z0: 32, top: '#a4b0be' });
  box(x, y, w - 8, h - 8, 3, '#7f8c8d', { z0: 8 });
  // ruota del rover
  const wp = P(x - 4, y - h / 4, 46);
  ctx.fillStyle = '#2d3436';
  ctx.beginPath();
  ctx.ellipse(wp.x, wp.y, 10 * s, 10 * s, 0, 0, 6.3);
  ctx.fill();
  ctx.strokeStyle = '#636e72';
  ctx.lineWidth = 2 * s;
  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * 6.3;
    ctx.beginPath();
    ctx.moveTo(wp.x, wp.y);
    ctx.lineTo(wp.x + Math.cos(a) * 9 * s, wp.y + Math.sin(a) * 9 * s);
    ctx.stroke();
  }
  ctx.fillStyle = '#b2bec3';
  ctx.beginPath();
  ctx.arc(wp.x, wp.y, 3 * s, 0, 6.3);
  ctx.fill();
  // attrezzi sul banco
  const tool = (dx: number, dy: number, len: number, c: string) => {
    const a = P(x + dx, y + dy, 37.5),
      b = P(x + dx + len, y + dy - 2, 37.5);
    ctx.strokeStyle = c;
    ctx.lineWidth = 2 * s;
    ctx.beginPath();
    ctx.moveTo(a.x, a.y);
    ctx.lineTo(b.x, b.y);
    ctx.stroke();
  };
  tool(-6, h / 4, 12, '#b2bec3');
  tool(0, h / 4 + 8, 9, '#e1b12c');
  tool(-4, h / 4 + 16, 10, '#c0392b');
  // tablet con lo schema
  const tb = box(x + w / 2 - 6, y + h / 2 - 14, 2, 14, 10, '#1e272e', { z0: 37 });
  onFace(tb, 'right', (W: number, H: number): void => {
    ctx.fillStyle = '#0c2461';
    ctx.fillRect(1, 1, W - 2, H - 2);
    ctx.strokeStyle = '#74b9ff';
    ctx.lineWidth = 0.4;
    ctx.strokeRect(3, 3, W - 6, H - 6);
    ctx.beginPath();
    ctx.arc(W / 2, H / 2, 2 + Math.sin(t * 2), 0, 6.3);
    ctx.stroke();
  });
  // lampada da banco
  const lp = P(x + w / 2 - 4, y - h / 2 + 6, 60);
  box(x + w / 2 - 4, y - h / 2 + 6, 2, 2, 24, '#2f3640', { z0: 37 });
  ctx.fillStyle = '#ffeaa7';
  ctx.beginPath();
  ctx.arc(lp.x, lp.y, 2.5 * s, 0, 6.3);
  ctx.fill();
  glow(lp, 30 * s, '255,230,170', 0.25);
  if (lights) lights.push({ x, y, z: 30, r: 90, color: '255,230,170' });
}

/** Casse di rifornimento impilate, con le strisce e le scritte. */
function drawCrates(it: GameValue): void {
  const ctx = game.view.ctx;
  const crate = (
    x: number,
    y: number,
    w: number,
    h: number,
    d: number,
    z0: number,
    c: string,
    txt: string,
  ) => {
    const b = box(x, y, w, h, d, c, { z0 });
    for (const face of ['left', 'right'])
      onFace(b, face, (W: number, H: number): void => {
        ctx.strokeStyle = 'rgba(0,0,0,0.3)';
        ctx.lineWidth = 1;
        ctx.strokeRect(1.5, 1.5, W - 3, H - 3);
        ctx.fillStyle = '#2d3436';
        ctx.fillRect(0, H * 0.4, W, H * 0.2);
        ctx.fillStyle = '#ffffff';
        ctx.font = 'bold 4.5px sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText(txt, W / 2, H * 0.55);
      });
  };
  const { x, y } = it;
  crate(x - 8, y - 6, 26, 22, 20, 0, '#e67e22', 'CDC · CIBO');
  crate(x + 14, y + 10, 22, 20, 18, 0, '#bdc3c7', 'FRAGILE');
  crate(x - 6, y - 4, 20, 18, 16, 20, '#3498db', 'H₂O');
}

/** Tuta spaziale sul suo supporto, vicino alla camera stagna. */
function drawSuitStand(it: GameValue, t: number): void {
  const ctx = game.view.ctx;
  const s = isoScale();
  const { x, y } = it;
  fillDisc(x, y, 0.5, 14, '#2f3640');
  box(x, y + 6, 3, 3, 40, '#7f8c8d');
  const b = P(x, y, 0);
  const u = (n: number) => n * s;
  const X = b.x,
    Y = b.y;
  // zaino
  ctx.fillStyle = '#b2bec3';
  ctx.fillRect(X - u(9), Y - u(66), u(18), u(26));
  // gambe e stivali
  ctx.fillStyle = '#f5f6fa';
  ctx.fillRect(X - u(8), Y - u(34), u(7), u(28));
  ctx.fillRect(X + u(1), Y - u(34), u(7), u(28));
  ctx.fillStyle = '#636e72';
  ctx.fillRect(X - u(9), Y - u(8), u(8), u(6));
  ctx.fillRect(X + u(1), Y - u(8), u(8), u(6));
  // busto con il pannello e la bandiera
  ctx.fillStyle = '#ffffff';
  roundRect(ctx, X - u(11), Y - u(62), u(22), u(30), u(5));
  ctx.fill();
  ctx.strokeStyle = 'rgba(0,0,0,0.15)';
  ctx.lineWidth = 0.8;
  ctx.stroke();
  ctx.fillStyle = '#2f3640';
  ctx.fillRect(X - u(6), Y - u(52), u(12), u(8));
  for (let i = 0; i < 3; i++) {
    ctx.fillStyle = ['#ff4757', '#2ed573', '#feca57'][i];
    if (Math.floor(t * 2 + i) % 3) ctx.fillRect(X - u(4) + i * u(3.5), Y - u(49), u(2), u(2));
  }
  ctx.fillStyle = '#e74c3c';
  ctx.fillRect(X + u(5), Y - u(60), u(5), u(3));
  // braccia
  ctx.fillStyle = '#f5f6fa';
  ctx.fillRect(X - u(16), Y - u(60), u(6), u(24));
  ctx.fillRect(X + u(10), Y - u(60), u(6), u(24));
  ctx.fillStyle = '#636e72';
  ctx.fillRect(X - u(16), Y - u(38), u(6), u(5));
  ctx.fillRect(X + u(10), Y - u(38), u(6), u(5));
  // casco con la visiera dorata che riflette
  ctx.fillStyle = '#ffffff';
  ctx.beginPath();
  ctx.arc(X, Y - u(70), u(10), 0, 6.3);
  ctx.fill();
  const visor = ctx.createLinearGradient(X - u(7), Y - u(76), X + u(7), Y - u(64));
  visor.addColorStop(0, '#ffe08a');
  visor.addColorStop(0.5, '#e1a10a');
  visor.addColorStop(1, '#8a5a00');
  ctx.fillStyle = visor;
  ctx.beginPath();
  ctx.ellipse(X + u(1), Y - u(69), u(7), u(5.5), 0, 0, 6.3);
  ctx.fill();
  ctx.fillStyle = 'rgba(255,255,255,0.7)';
  ctx.beginPath();
  ctx.ellipse(X - u(2), Y - u(71), u(2.2), u(1.2), -0.5, 0, 6.3);
  ctx.fill();
}

/** Panca dell'equipaggio vicino al portellone. */
function drawCrewBench(it: GameValue): void {
  const { x, y, w, h } = it;
  box(x - w / 2 + 4, y, 4, h - 2, 14, '#7f8c8d');
  box(x + w / 2 - 4, y, 4, h - 2, 14, '#7f8c8d');
  box(x, y, w, h, 4, '#dfe4ea', { z0: 14, top: '#00a8ff' });
}

/** Robottino delle pulizie che gira in tondo (non è un ostacolo: si sposta da solo). */
function drawRobot(it: GameValue, t: number): void {
  const ctx = game.view.ctx;
  const s = isoScale();
  const a = t * 0.35;
  const x = it.x + Math.cos(a) * (it.rx || 70),
    y = it.y + Math.sin(a * 1.0) * (it.ry || 40);
  const sh = disc(x, y, 0.3, 10);
  ctx.fillStyle = 'rgba(0,0,0,0.3)';
  ctx.beginPath();
  ctx.ellipse(sh.c.x + 2 * s, sh.c.y + 1 * s, sh.rx, sh.ry, 0, 0, 6.3);
  ctx.fill();
  cylinder(x, y, 9, 1, 6, '#dfe6e9', '#7f8c8d');
  fillDisc(x, y, 6.2, 6, '#2f3640');
  const eye = P(x, y, 7);
  ctx.fillStyle = Math.floor(t * 2) % 2 ? '#00d2d3' : '#0abde3';
  ctx.beginPath();
  ctx.arc(eye.x, eye.y, 1.8 * s, 0, 6.3);
  ctx.fill();
  glow(eye, 10 * s, CYAN, 0.3);
}

/** Pianta in vaso (un po' di verde nella zona relax). */
function drawPot(it: GameValue, t: number): void {
  const ctx = game.view.ctx;
  const s = isoScale();
  cylinder(it.x, it.y, 9, 0, 16, '#f5f6fa', '#b2bec3');
  fillDisc(it.x, it.y, 16, 8, '#5d4037');
  const p = P(it.x, it.y, 16);
  for (let i = 0; i < 7; i++) {
    const a = -Math.PI / 2 + (i - 3) * 0.35 + Math.sin(t + i) * 0.04;
    ctx.strokeStyle = i % 2 ? '#27ae60' : '#2ecc71';
    ctx.lineWidth = 3 * s;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(p.x, p.y);
    ctx.quadraticCurveTo(
      p.x + Math.cos(a) * 10 * s,
      p.y + Math.sin(a) * 14 * s,
      p.x + Math.cos(a) * 16 * s,
      p.y + Math.sin(a) * 24 * s + 6 * s,
    );
    ctx.stroke();
  }
  ctx.lineCap = 'butt';
}

/** Disegni degli oggetti dentro la base (si aggiungono a PROP_DRAW). */
export const MOONBASE_INSIDE_DRAW: Record<
  string,
  (it: GameValue, t: number, lights?: Lights) => void
> = {
  mbChair: drawCaptainChair,
  mbHolo: drawHolo,
  mbHydro: drawHydroRack,
  mbPlanter: drawPlanter,
  mbBunk: drawBunk,
  mbLockers: drawLockers,
  mbGalley: drawGalley,
  mbTable: drawMessTable,
  mbTreadmill: drawTreadmill,
  mbServer: drawServer,
  mbTanks: drawTanks,
  mbBench: drawWorkbench,
  mbCrates: drawCrates,
  mbSuit: drawSuitStand,
  mbCrewBench: drawCrewBench,
  mbRobot: drawRobot,
  mbPot: drawPot,
};
