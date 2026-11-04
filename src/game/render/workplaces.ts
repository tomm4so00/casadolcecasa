// Arredi dei posti di lavoro: paravento, carrello dei medicinali e sedia a rotelle dell'ospedale,
// scaffale delle bottiglie, carrello dei dolci e attaccapanni del ristorante, stampante e libreria
// dell'ufficio.
import type { GameValue } from '../context.js';
import { game } from '../context.js';
import { isoProject, isoScale, rnd, setPlane } from './primitives.js';
import { box, onFace, resetPlane, woodGrain } from './objects.js';

type V3 = [number, number, number];

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

/** Ruota (o rotella) su un piano verticale lungo x. */
function wheel(x: number, y: number, z: number, r: number, color = '#2d3436'): void {
  const ctx = game.view.ctx;
  setPlane([x, y, z], [1, 0, 0], [0, 0, -1]);
  try {
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.arc(0, 0, r, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = '#95a5a6';
    ctx.lineWidth = Math.max(0.6, r * 0.18);
    ctx.beginPath();
    ctx.arc(0, 0, r * 0.55, 0, Math.PI * 2);
    ctx.stroke();
  } finally {
    resetPlane();
  }
}

// ---------------------------------------------------------------- ospedale
/** Paravento a tre ante di tela verde chiaro, lungo y. */
export function drawCurtainScreenProp(it?: GameValue): GameValue {
  const ctx = game.view.ctx;
  const { x, y, h } = it;
  const H = 62;
  const n = 3;
  const pw = h / n;
  for (let i = 0; i < n; i++) {
    const cy = y - h / 2 + pw * (i + 0.5);
    const off = i % 2 ? 4 : 0; // le ante sono piegate a zig-zag
    const panel = box(x + off, cy, 2, pw - 1, H - 6, '#d1f2eb', {
      z0: 6,
      right: '#b8e6da',
      top: '#a3c4bc',
    });
    onFace(panel, 'right', (W: number, FH: number): void => {
      ctx.strokeStyle = 'rgba(22,160,133,0.35)';
      ctx.lineWidth = 1;
      for (let u = 4; u < W; u += 5) {
        ctx.beginPath();
        ctx.moveTo(u, 0);
        ctx.lineTo(u + Math.sin(u) * 1.5, FH);
        ctx.stroke();
      }
    });
    // telaio in metallo con le rotelle
    line3([x + off, cy - pw / 2, 4], [x + off, cy - pw / 2, H], '#95a5a6', 1.4);
    line3([x + off, cy + pw / 2, 4], [x + off, cy + pw / 2, H], '#95a5a6', 1.4);
    line3([x + off, cy - pw / 2, H], [x + off, cy + pw / 2, H], '#95a5a6', 1.4);
    wheel(x + off, cy - pw / 2 + 2, 2, 2);
  }
}

/** Carrello dei medicinali: cassetti colorati, ripiano con i flaconi, rotelle. */
export function drawMedCartProp(it?: GameValue): GameValue {
  const ctx = game.view.ctx;
  const { x, y, w, h } = it;
  for (const [dx, dy] of [
    [-1, -1],
    [1, -1],
    [-1, 1],
    [1, 1],
  ])
    wheel(x + dx * (w / 2 - 3), y + dy * (h / 2 - 3), 2.5, 2.5);
  const body = box(x, y, w, h, 26, '#ecf0f1', { z0: 5, top: '#dfe6e9' });
  onFace(body, 'left', (W: number, H: number): void => {
    const cols = ['#e74c3c', '#f1c40f', '#3498db', '#2ecc71'];
    for (let i = 0; i < 4; i++) {
      const v = 2 + (i * (H - 4)) / 4;
      ctx.fillStyle = cols[i];
      ctx.fillRect(2, v, W - 4, (H - 4) / 4 - 1.5);
      ctx.fillStyle = 'rgba(255,255,255,0.8)';
      ctx.fillRect(W / 2 - 3, v + 2, 6, 1.5);
    }
  });
  // maniglia e flaconi sopra
  line3([x - w / 2 - 3, y - h / 2, 30], [x - w / 2 - 3, y + h / 2, 30], '#7f8c8d', 1.4);
  const bottles: [number, number, string][] = [
    [-0.25, -0.2, '#ffffff'],
    [0, 0.15, '#f39c12'],
    [0.25, -0.1, '#74b9ff'],
  ];
  for (const [u, v, c] of bottles) {
    box(x + u * w, y + v * h, 4, 4, 7, c, { z0: 31 });
    box(x + u * w, y + v * h, 2.5, 2.5, 2, '#2d3436', { z0: 38 });
  }
  box(x + w * 0.2, y + h * 0.25, 9, 6, 1.5, '#ffffff', { z0: 31 }); // garze
}

/** Sedia a rotelle vista di tre quarti, con le ruote grandi ai lati. */
export function drawWheelchairProp(it?: GameValue): GameValue {
  const { x, y } = it;
  // ruote grandi ai lati (lungo x) e ruotine davanti
  wheel(x - 1, y - 10, 11, 11, 'rgba(45,52,54,0.92)');
  box(x, y, 16, 16, 3, '#2e86de', { z0: 14 }); // seduta
  box(x - 7, y, 3, 16, 18, '#2e86de', { z0: 17 }); // schienale
  line3([x - 9, y - 7, 35], [x - 12, y - 7, 37], '#7f8c8d', 1.6); // maniglie
  line3([x - 9, y + 7, 35], [x - 12, y + 7, 37], '#7f8c8d', 1.6);
  for (const sy of [-8, 8]) {
    line3([x + 7, y + sy, 14], [x + 9, y + sy, 4], '#7f8c8d', 1.4);
    line3([x - 6, y + sy, 22], [x + 6, y + sy, 22], '#7f8c8d', 1.2); // braccioli
  }
  box(x + 10, y, 6, 14, 1.5, '#7f8c8d', { z0: 4 }); // poggiapiedi
  wheel(x + 9, y - 6, 3, 3);
  wheel(x + 9, y + 6, 3, 3);
  wheel(x - 1, y + 10, 11, 11, 'rgba(45,52,54,0.92)');
}

// ---------------------------------------------------------------- ristorante
/** Scaffale di legno con le bottiglie di vino coricate e qualche barattolo. */
export function drawBottleShelfProp(it?: GameValue): GameValue {
  const ctx = game.view.ctx;
  const { x, y, w, h } = it;
  const H: number = it.z || 90;
  const b = box(x, y, w, h, H, '#6d4c2f', { top: '#7d5a3a' });
  // `facing: 'x'`: contro il muro di sinistra, con le bottiglie verso la sala
  onFace(b, it.facing === 'x' ? 'right' : 'left', (W: number, FH: number): void => {
    ctx.fillStyle = '#3e2a19';
    ctx.fillRect(3, 3, W - 6, FH - 6);
    const rows = 5;
    for (let r = 0; r < rows; r++) {
      const v = 4 + (r * (FH - 8)) / rows;
      const rh = (FH - 8) / rows;
      ctx.fillStyle = '#6d4c2f';
      ctx.fillRect(3, v + rh - 2, W - 6, 2);
      for (let u = 7, i = 0; u < W - 5; u += 7, i++) {
        const k = rnd(r * 13 + i + x);
        if (r === 0 && k > 0.5) {
          // barattoli in alto
          ctx.fillStyle = ['#e17055', '#fdcb6e', '#00b894'][i % 3];
          ctx.fillRect(u - 2.5, v + rh - 9, 5, 7);
          continue;
        }
        // bottiglia coricata: il fondo tondo verso chi guarda
        ctx.fillStyle = k > 0.6 ? '#1e4d2b' : k > 0.3 ? '#5b1a24' : '#2d3436';
        ctx.beginPath();
        ctx.arc(u, v + rh / 2, Math.min(3, rh / 2 - 1), 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = 'rgba(255,255,255,0.35)';
        ctx.fillRect(u - 1.5, v + rh / 2 - 2, 1, 1.2);
      }
    }
  });
  onFace(b, 'right', (W: number, FH: number) => woodGrain(W, FH, 'rgba(0,0,0,0.2)', true, 4));
}

/** Carrello dei dolci: due ripiani con torte e coppe, rotelle. */
export function drawDessertCartProp(it?: GameValue): GameValue {
  const ctx = game.view.ctx;
  const { x, y, w, h } = it;
  for (const [dx, dy] of [
    [-1, -1],
    [1, -1],
    [-1, 1],
    [1, 1],
  ]) {
    wheel(x + dx * (w / 2 - 3), y + dy * (h / 2 - 3), 2.5, 2.5);
    box(x + dx * (w / 2 - 2), y + dy * (h / 2 - 2), 2, 2, 34, '#b8b8b8', { z0: 4 });
  }
  box(x, y, w, h, 2, '#dcdde1', { z0: 12 });
  const top = box(x, y, w, h, 2, '#f5f6fa', { z0: 32 });
  // torta con la fetta tagliata e le coppe di tiramisù
  const cake = box(x - w * 0.2, y, 12, 12, 7, '#f8c291', { z0: 34, top: '#fff3e6' });
  onFace(cake, 'top', (W: number, H: number): void => {
    ctx.fillStyle = '#e55039';
    for (let i = 0; i < 5; i++) {
      ctx.beginPath();
      ctx.arc(2 + i * 2, 2 + (i % 2) * 7, 1.2, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.fillStyle = '#f8c291';
    ctx.fillRect(W / 2, H / 2, W / 2, H / 2);
  });
  for (const k of [0.15, 0.35]) {
    box(x + w * k, y - h * 0.15, 5, 5, 5, '#a0522d', { z0: 34, top: '#d1b48c' });
  }
  onFace(top, 'left', (W: number, H: number): void => {
    ctx.fillStyle = '#b8b8b8';
    ctx.fillRect(0, 0, W, H);
  });
  // in basso una crostata
  box(x + w * 0.15, y, 12, 12, 3, '#e58e26', { z0: 14, top: '#c0392b' });
}

/** Attaccapanni con un cappotto e un cappello. */
export function drawCoatRackProp(it?: GameValue): GameValue {
  const { x, y } = it;
  for (const [dx, dy] of [
    [-6, 0],
    [3, -5],
    [3, 5],
  ])
    line3([x, y, 6], [x + dx, y + dy, 0], '#5d4037', 1.6);
  box(x, y, 3, 3, 70, '#6d4c2f', { z0: 0 });
  for (const [dx, dy] of [
    [4, 0],
    [-2, 4],
    [-2, -4],
  ])
    line3([x, y, 66], [x + dx, y + dy, 70], '#5d4037', 1.2);
  // cappotto appeso
  box(x + 3, y + 1, 4, 12, 30, '#34495e', { z0: 32 });
  box(x + 3, y + 1, 5, 5, 3, '#2c3e50', { z0: 62 });
  // cappello
  box(x - 2, y - 3, 9, 9, 1.5, '#7f6a4f', { z0: 70 });
  box(x - 2, y - 3, 5, 5, 4, '#8d7556', { z0: 71.5 });
}

// ---------------------------------------------------------------- ufficio
/** Stampante grande su un mobiletto, con i fogli che escono e la spia che lampeggia. */
export function drawPrinterProp(it?: GameValue, t?: GameValue): GameValue {
  const ctx = game.view.ctx;
  const { x, y, w, h } = it;
  const stand = box(x, y, w, h, 22, '#636e72', { top: '#7f8c8d' });
  onFace(stand, 'left', (W: number, H: number): void => {
    ctx.strokeStyle = 'rgba(0,0,0,0.35)';
    ctx.strokeRect(3, 3, W - 6, H - 6);
    ctx.fillStyle = '#b2bec3';
    ctx.fillRect(W / 2 - 4, 6, 8, 2);
  });
  const body = box(x, y, w - 4, h - 4, 14, '#dfe6e9', { z0: 22, top: '#f5f6fa' });
  onFace(body, 'left', (W: number, H: number): void => {
    ctx.fillStyle = '#2d3436';
    ctx.fillRect(4, 3, W * 0.55, 3); // fessura dei fogli
    ctx.fillStyle = '#74b9ff';
    ctx.fillRect(W - 12, 3, 8, 5); // schermino
    const on = Math.sin((t || 0) * 5) > 0;
    ctx.fillStyle = on ? '#2ecc71' : '#145a32';
    ctx.beginPath();
    ctx.arc(W - 6, H - 4, 1.4, 0, Math.PI * 2);
    ctx.fill();
  });
  // pila di fogli stampati e coperchio dello scanner
  box(x - 2, y + h * 0.1, 14, 10, 2, '#ffffff', { z0: 36 });
  box(x + 2, y, w - 8, h - 8, 2, '#b2bec3', { z0: 36 });
}

/** Libreria con i raccoglitori colorati e qualche libro coricato. */
export function drawBookshelfProp(it?: GameValue): GameValue {
  const ctx = game.view.ctx;
  const { x, y, w, h } = it;
  const H: number = it.z || 96;
  const b = box(x, y, w, h, H, '#a1887f', { top: '#b0978d' });
  const paint = (W: number, FH: number, seed: number): void => {
    ctx.fillStyle = '#5d4037';
    ctx.fillRect(2, 2, W - 4, FH - 4);
    const rows = 4;
    for (let r = 0; r < rows; r++) {
      const v = 3 + (r * (FH - 6)) / rows;
      const rh = (FH - 6) / rows;
      ctx.fillStyle = '#a1887f';
      ctx.fillRect(2, v + rh - 2, W - 4, 2);
      let u = 4;
      for (let i = 0; u < W - 6; i++) {
        const k = rnd(seed + r * 17 + i);
        const bw = 3 + k * 3;
        const bh = rh - 4 - k * 4;
        ctx.fillStyle = ['#2e86de', '#c0392b', '#27ae60', '#f39c12', '#8e44ad', '#ecf0f1'][
          Math.floor(k * 6)
        ];
        if (k > 0.85) ctx.fillRect(u, v + rh - 5, bh, 3);
        else ctx.fillRect(u, v + rh - 2 - bh, bw, bh);
        u += (k > 0.85 ? bh : bw) + 0.8;
      }
    }
  };
  onFace(b, 'right', (W: number, FH: number) => paint(W, FH, x + y));
  onFace(b, 'left', (W: number, FH: number) => paint(W, FH, x - y));
}

/** Forno a legna per la pizza: base in mattoni, cupola, bocca col fuoco verso la sala (+x) e il
 * comignolo in cima, col fumo. */
export function drawPizzaOvenProp(it?: GameValue, t?: GameValue): GameValue {
  const ctx = game.view.ctx;
  const time = t || 0;
  const baseH = 34;
  const base: GameValue = box(it.x, it.y, it.w, it.h, baseH, '#8d6e63', { top: '#a1887f' });
  const bricks = (W: number, H: number): void => {
    ctx.strokeStyle = 'rgba(0,0,0,0.18)';
    ctx.lineWidth = 0.8;
    for (let r = 0, v = 0; v < H; r++, v += 6) {
      ctx.beginPath();
      ctx.moveTo(0, v);
      ctx.lineTo(W, v);
      ctx.stroke();
      for (let u = r % 2 ? 6 : 0; u < W; u += 12) {
        ctx.beginPath();
        ctx.moveTo(u, v);
        ctx.lineTo(u, v + 6);
        ctx.stroke();
      }
    }
  };
  onFace(base, 'right', (W: number, H: number): void => {
    bricks(W, H);
    // la legna nella nicchia sotto il piano
    ctx.fillStyle = '#3e2723';
    ctx.fillRect(W * 0.2, H * 0.45, W * 0.6, H * 0.45);
    ctx.fillStyle = '#a1887f';
    for (let i = 0; i < 4; i++) {
      ctx.beginPath();
      ctx.arc(W * 0.3 + i * W * 0.13, H * 0.78, 2.6, 0, 6.3);
      ctx.fill();
    }
  });
  onFace(base, 'left', bricks);
  // cupola: anelli veri (cerchi nel mondo, non ellissi sullo schermo) che salgono e si stringono
  const R = (Math.min(it.w, it.h) / 2) * 0.92,
    HD = R * 0.95;
  const ring = (r: number, z: number): void => {
    ctx.beginPath();
    for (let k = 0; k <= 24; k++) {
      const a = (k / 24) * Math.PI * 2;
      const p = isoProject(it.x + Math.cos(a) * r, it.y + Math.sin(a) * r, z);
      if (k) ctx.lineTo(p.x, p.y);
      else ctx.moveTo(p.x, p.y);
    }
    ctx.fill();
  };
  const layers = 10;
  for (let i = 0; i <= layers; i++) {
    const a = (i / layers) * (Math.PI / 2);
    ctx.fillStyle = i % 2 ? '#b5532f' : '#c0623a';
    ring(R * Math.cos(a) + 0.4, baseH + HD * Math.sin(a));
  }
  // bocca ad arco sul davanti della cupola, verso la sala, col fuoco dentro
  const mw = R * 1.05,
    mh = HD * 0.62;
  setPlane([it.x + R * 0.82, it.y + mw / 2, baseH + mh], [0, -1, 0], [0, 0, -1]);
  const arch = (inset: number): void => {
    ctx.beginPath();
    ctx.moveTo(inset, mh);
    ctx.lineTo(inset, mh * 0.45);
    ctx.quadraticCurveTo(mw / 2, -mh * 0.35 + inset * 2, mw - inset, mh * 0.45);
    ctx.lineTo(mw - inset, mh);
    ctx.closePath();
  };
  ctx.fillStyle = '#7b3a1f';
  arch(-2);
  ctx.fill();
  ctx.fillStyle = '#1b0f0a';
  arch(1.5);
  ctx.fill();
  const glow = ctx.createRadialGradient(mw / 2, mh, 1, mw / 2, mh, mw * 0.6);
  glow.addColorStop(0, 'rgba(255,170,60,0.85)');
  glow.addColorStop(1, 'rgba(255,90,0,0)');
  ctx.fillStyle = glow;
  arch(1.5);
  ctx.fill();
  for (let f = 0; f < 5; f++) {
    const fl = 5 + Math.sin(time * 11 + f * 1.7) * 2.5;
    ctx.fillStyle = f % 2 ? 'rgba(255,210,0,0.95)' : 'rgba(255,100,0,0.95)';
    ctx.beginPath();
    ctx.moveTo(mw * 0.18 + f * mw * 0.13, mh);
    ctx.lineTo(mw * 0.24 + f * mw * 0.13, mh - fl);
    ctx.lineTo(mw * 0.3 + f * mw * 0.13, mh);
    ctx.fill();
  }
  resetPlane();
  // comignolo tondo al centro della cupola: anelli uno sull'altro, col bordo e la bocca scura
  const top = baseH + HD;
  const cr = 4.5;
  for (let z = top - 3; z <= top + 13; z += 1) {
    ctx.fillStyle = z % 4 < 2 ? '#7b5341' : '#6d4c41';
    ring(cr, z);
  }
  ctx.fillStyle = '#5d4037';
  ring(cr + 1.2, top + 14);
  ctx.fillStyle = '#1b0f0a';
  ring(cr * 0.7, top + 14.5);
  for (let k = 0; k < 3; k++) {
    const ph = (time * 0.5 + k / 3) % 1;
    const p = isoProject(it.x, it.y, top + 16 + ph * 26);
    ctx.fillStyle = `rgba(200,200,200,${0.45 * (1 - ph)})`;
    ctx.beginPath();
    ctx.arc(p.x + Math.sin(time + k) * 3, p.y, (3 + ph * 5) * isoScale(), 0, 6.3);
    ctx.fill();
  }
}

/**
 * Cantinetta dei vini contro il muro di sinistra: legno scuro, griglia a rombi con una bottiglia
 * coricata in ogni casella e qualche bottiglia in piedi sopra.
 */
export function drawWineRackProp(it?: GameValue): GameValue {
  const ctx = game.view.ctx;
  const { x, y, w, h } = it;
  const H: number = it.z || 92;
  const b: GameValue = box(x, y, w, h, H, '#4e342e', { top: '#5d4037' });
  onFace(b, 'right', (W: number, FH: number): void => {
    // fondo scuro e cornice
    ctx.fillStyle = '#21140f';
    ctx.fillRect(3, 3, W - 6, FH - 6);
    const x0 = 3,
      y0 = 3,
      iw = W - 6,
      ih = FH - 6;
    const n = 2; // rombi per riga: pochi e grandi, si vedono bene
    const cw = iw / n,
      chh = cw;
    // una bottiglia in ogni rombo: il fondo tondo verso chi guarda
    const colors = ['#5b1a24', '#1e4d2b', '#7d2633', '#2d3436'];
    for (let r = 0; r * (chh / 2) < ih + chh; r++)
      for (let c = 0; c <= n; c++) {
        const cx = x0 + c * cw + (r % 2 ? 0 : cw / 2),
          cy = y0 + r * (chh / 2);
        if (cx < x0 + 3 || cx > x0 + iw - 3 || cy < y0 + 3 || cy > y0 + ih - 3) continue;
        ctx.fillStyle = colors[(r * 3 + c) % colors.length];
        ctx.beginPath();
        ctx.arc(cx, cy, cw * 0.24, 0, 6.3);
        ctx.fill();
        ctx.strokeStyle = 'rgba(0,0,0,0.5)';
        ctx.lineWidth = 0.8;
        ctx.stroke();
        ctx.fillStyle = 'rgba(255,255,255,0.4)';
        ctx.beginPath();
        ctx.arc(cx - cw * 0.07, cy - cw * 0.07, cw * 0.06, 0, 6.3);
        ctx.fill();
      }
    // la griglia a X di listelli chiari
    ctx.save();
    ctx.beginPath();
    ctx.rect(x0, y0, iw, ih);
    ctx.clip();
    ctx.strokeStyle = '#a1887f';
    ctx.lineWidth = 2.4;
    for (let k = -ih; k < iw + ih; k += cw) {
      ctx.beginPath();
      ctx.moveTo(x0 + k, y0);
      ctx.lineTo(x0 + k + ih, y0 + ih);
      ctx.moveTo(x0 + k, y0);
      ctx.lineTo(x0 + k - ih, y0 + ih);
      ctx.stroke();
    }
    ctx.restore();
    ctx.strokeStyle = '#3e2723';
    ctx.lineWidth = 3;
    ctx.strokeRect(1.5, 1.5, W - 3, FH - 3);
  });
  // sopra: tre bottiglie in piedi col collo e la capsula
  const tops: [number, string][] = [
    [-0.28, '#5b1a24'],
    [0, '#1e4d2b'],
    [0.28, '#7d2633'],
  ];
  for (const [k, color] of tops) {
    const by = y + h * k;
    box(x + 1, by, 4, 4, 11, color, { z0: H });
    box(x + 1, by, 1.8, 1.8, 6, color, { z0: H + 11 });
    box(x + 1, by, 2, 2, 2, '#d4ac0d', { z0: H + 16 });
  }
}

/** Botte di legno in piedi, con i cerchi di ferro e il rubinetto. */
export function drawWineBarrelProp(it?: GameValue): GameValue {
  const ctx = game.view.ctx;
  const R = Math.min(it.w, it.h) / 2;
  const H: number = it.z || 40;
  const ring = (r: number, z: number): void => {
    ctx.beginPath();
    for (let k = 0; k <= 24; k++) {
      const a = (k / 24) * Math.PI * 2;
      const p = isoProject(it.x + Math.cos(a) * r, it.y + Math.sin(a) * r, z);
      if (k) ctx.lineTo(p.x, p.y);
      else ctx.moveTo(p.x, p.y);
    }
    ctx.fill();
  };
  // doghe: la pancia è più larga a metà altezza; i cerchi di ferro a un quarto e tre quarti
  for (let z = 0; z <= H; z += 1) {
    const bulge = Math.sin((z / H) * Math.PI) * 0.14;
    const hoop = Math.abs(z - H * 0.2) < 1.5 || Math.abs(z - H * 0.8) < 1.5;
    ctx.fillStyle = hoop ? '#4a4a4a' : z % 6 < 3 ? '#8d5a3b' : '#7b4a2e';
    ring(R * (0.86 + bulge), z);
  }
  ctx.fillStyle = '#a1785a';
  ring(R * 0.86, H + 0.5);
  ctx.fillStyle = 'rgba(0,0,0,0.18)';
  ring(R * 0.6, H + 0.6);
  // rubinetto verso la sala
  box(it.x + R * 0.95, it.y, 4, 2.5, 2.5, '#b8860b', { z0: H * 0.35 });
}
