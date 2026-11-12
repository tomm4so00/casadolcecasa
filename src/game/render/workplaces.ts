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

/**
 * Monitor dei parametri portatile: scocca grigia, schermo con il tracciato verde e i valori
 * (frequenza, pressione, saturazione), maniglia sopra. (x, y, z) è il centro della base.
 */
export function drawPortableMonitor(x: number, y: number, z: number, t: number, k = 1): void {
  const ctx = game.view.ctx;
  const W = 16 * k,
    D = 8 * k,
    H = 13 * k;
  const body = box(x, y, W, D, H, '#dfe6e9', { z0: z, top: '#f5f6fa' });
  onFace(body, 'left', (FW: number, FH: number): void => {
    ctx.fillStyle = '#0b1e2d';
    ctx.fillRect(1.5 * k, 1.5 * k, FW - 3 * k, FH - 3 * k);
    // tracciato del battito
    ctx.strokeStyle = '#2ecc71';
    ctx.lineWidth = 0.7 * k;
    ctx.beginPath();
    const y0 = FH * 0.38;
    for (let u = 2 * k; u < FW * 0.62; u += 0.5) {
      const ph = (u / (FW * 0.62) + t * 0.9) % 1;
      let v = y0;
      if (ph > 0.45 && ph < 0.5) v -= (ph - 0.45) * 60 * k;
      else if (ph >= 0.5 && ph < 0.55) v += (0.55 - ph) * 60 * k - 1.5 * k;
      u === 2 * k ? ctx.moveTo(u, v) : ctx.lineTo(u, v);
    }
    ctx.stroke();
    // i valori a destra: frequenza (verde), pressione (rossa), saturazione (azzurra)
    const vals: [string, number][] = [
      ['#2ecc71', 0.22],
      ['#ff7675', 0.5],
      ['#74b9ff', 0.78],
    ];
    for (const [c, v] of vals) {
      ctx.fillStyle = c;
      ctx.fillRect(FW * 0.68, FH * v - 1 * k, FW * 0.22, 1.8 * k);
    }
    ctx.fillStyle = 'rgba(46,204,113,0.55)';
    ctx.fillRect(2 * k, FH * 0.66, FW * 0.55, 1 * k);
  });
  // maniglia
  box(x, y, W * 0.6, 1.6 * k, 1.6 * k, '#636e72', { z0: z + H + 2 * k, edge: null });
  box(x - W * 0.3, y, 1.4 * k, 1.6 * k, 2 * k, '#636e72', { z0: z + H, edge: null });
  box(x + W * 0.3, y, 1.4 * k, 1.6 * k, 2 * k, '#636e72', { z0: z + H, edge: null });
}

/**
 * Postazione del monitor: un carrellino a colonna con il ripiano, il bracciale della pressione
 * appeso e i cavi; sopra il monitor portatile, finché nessuno l'ha preso (`it.empty`).
 */
export function drawVitalsStationProp(it?: GameValue, t?: GameValue): GameValue {
  const { x, y, w, h } = it;
  for (const [dx, dy] of [
    [-1, -1],
    [1, -1],
    [-1, 1],
    [1, 1],
  ])
    wheel(x + dx * (w / 2 - 3), y + dy * (h / 2 - 3), 2.5, 2.5);
  box(x, y, w, h, 3, '#b2bec3', { z0: 4 });
  box(x, y, 5, 5, 34, '#95a5a6', { z0: 7 });
  box(x, y, w, h, 4, '#ecf0f1', { z0: 41, top: '#f5f6fa' });
  // cestino con bracciale e saturimetro sotto il ripiano
  box(x, y + 2, w - 8, h - 10, 7, '#dfe6e9', { z0: 20 });
  box(x - 4, y + 2, 7, 4, 3, '#2d3436', { z0: 27 });
  box(x + 5, y + 2, 4, 4, 2, '#e17055', { z0: 27 });
  if (!it.empty) drawPortableMonitor(x, y, 45, t);
  else {
    // il posto vuoto: la base di ricarica con la spia
    box(x, y, 12, 6, 1.5, '#2d3436', { z0: 45 });
    const p = isoProject(x + 5, y + 3, 47);
    const ctx = game.view.ctx;
    ctx.fillStyle = Math.sin(t * 4) > 0 ? '#f1c40f' : '#7f6000';
    ctx.beginPath();
    ctx.arc(p.x, p.y, 1.4 * isoScale(), 0, 6.3);
    ctx.fill();
  }
}

/**
 * Carrello della biancheria: telaio di metallo con le rotelle, sacco di stoffa per lo sporco,
 * ripiano sopra con asciugamani e lenzuola piegati, sapone e spugna.
 */
export function drawLinenCartProp(it?: GameValue): GameValue {
  const ctx = game.view.ctx;
  const { x, y, w, h } = it;
  for (const [dx, dy] of [
    [-1, -1],
    [1, -1],
    [-1, 1],
    [1, 1],
  ])
    wheel(x + dx * (w / 2 - 3), y + dy * (h / 2 - 3), 2.5, 2.5);
  // montanti
  for (const [dx, dy] of [
    [-1, -1],
    [1, -1],
    [-1, 1],
    [1, 1],
  ])
    line3(
      [x + dx * (w / 2 - 1), y + dy * (h / 2 - 1), 5],
      [x + dx * (w / 2 - 1), y + dy * (h / 2 - 1), 34],
      '#95a5a6',
      1.3,
    );
  // sacco della biancheria sporca, un po' gonfio
  const bag = box(x, y, w - 4, h - 4, 22, '#5dade2', { z0: 6, top: '#2e86c1' });
  onFace(bag, 'left', (W: number, H: number): void => {
    ctx.strokeStyle = 'rgba(255,255,255,0.35)';
    ctx.lineWidth = 0.8;
    for (let u = 4; u < W; u += 6) {
      ctx.beginPath();
      ctx.moveTo(u, 1);
      ctx.quadraticCurveTo(u + 2, H / 2, u, H - 1);
      ctx.stroke();
    }
    ctx.fillStyle = 'rgba(255,255,255,0.9)';
    ctx.fillRect(W / 2 - 5, H * 0.3, 10, 5);
  });
  box(x, y, w, h, 2, '#bdc3c7', { z0: 33 });
  // pile di asciugamani e lenzuola
  const piles: [number, number, string[]][] = [
    [-0.25, 0, ['#ffffff', '#dff9fb', '#ffffff']],
    [0.18, -0.15, ['#a29bfe', '#ffffff']],
  ];
  for (const [u, v, cols] of piles)
    cols.forEach((c, i) =>
      box(x + u * w, y + v * h, w * 0.38, h * 0.5, 2.6, c, {
        z0: 35 + i * 2.6,
        edge: 'rgba(0,0,0,0.15)',
      }),
    );
  // sapone e spugna
  box(x + w * 0.3, y + h * 0.25, 4, 4, 6, '#55efc4', { z0: 35 });
  box(x + w * 0.3, y + h * 0.25, 2, 2, 2, '#2d3436', { z0: 41 });
  box(x + w * 0.05, y + h * 0.3, 7, 4, 3, '#fdcb6e', { z0: 35 });
  // maniglia per spingerlo
  line3([x + w / 2 + 3, y - h / 2, 38], [x + w / 2 + 3, y + h / 2, 38], '#7f8c8d', 1.6);
}

/** Il farmaco in mano: la scatola dell'antibiotico, il flacone di gocce o la siringa del vaccino. */
export function drawHeldDrug(x: number, y: number, z: number, drug: string): void {
  if (drug === 'vaccino') {
    box(x, y, 12, 2.4, 2.4, 'rgba(230,245,255,0.95)', { z0: z, edge: 'rgba(0,0,0,0.3)' });
    box(x - 7, y, 3, 1, 1, '#636e72', { z0: z + 0.7, edge: null });
    box(x + 7, y, 2.5, 3.5, 3.5, '#0984e3', { z0: z - 0.5 });
    return;
  }
  if (drug === 'antidolorifico') {
    box(x, y, 5, 5, 9, '#a0522d', { z0: z, top: '#8b4513' });
    box(x, y, 2.6, 2.6, 3, '#ffffff', { z0: z + 9 });
    return;
  }
  const b = box(x, y, 11, 6, 5, '#ffffff', { z0: z });
  onFace(b, 'left', (W: number, H: number): void => {
    const ctx = game.view.ctx;
    ctx.fillStyle = '#e74c3c';
    ctx.fillRect(0, H * 0.35, W, H * 0.3);
  });
}

/**
 * Il defibrillatore (DAE): valigetta verde con il cuore e il fulmine, la maniglia e le due
 * piastre arrotolate sul fianco. (x, y, z) è il centro della base; `k` lo rimpicciolisce in mano.
 */
export function drawDefibrillator(x: number, y: number, z: number, t: number, k = 1): void {
  const ctx = game.view.ctx;
  const W = 16 * k,
    D = 10 * k,
    H = 12 * k;
  const body = box(x, y, W, D, H, '#27ae60', { z0: z, top: '#2ecc71' });
  onFace(body, 'left', (FW: number, FH: number): void => {
    // cuore bianco con il fulmine
    const cx = FW / 2,
      cy = FH / 2;
    const r = Math.min(FW, FH) * 0.24;
    ctx.fillStyle = '#ffffff';
    ctx.beginPath();
    ctx.arc(cx - r * 0.5, cy - r * 0.3, r * 0.55, Math.PI, 0);
    ctx.arc(cx + r * 0.5, cy - r * 0.3, r * 0.55, Math.PI, 0);
    ctx.lineTo(cx, cy + r * 0.9);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = '#e74c3c';
    ctx.beginPath();
    ctx.moveTo(cx + r * 0.15, cy - r * 0.6);
    ctx.lineTo(cx - r * 0.25, cy + r * 0.05);
    ctx.lineTo(cx + r * 0.05, cy + r * 0.05);
    ctx.lineTo(cx - r * 0.15, cy + r * 0.7);
    ctx.lineTo(cx + r * 0.3, cy - r * 0.05);
    ctx.lineTo(cx, cy - r * 0.05);
    ctx.closePath();
    ctx.fill();
  });
  // spia che lampeggia: pronto
  const led = isoProject(x + W * 0.35, y + D / 2, z + H * 0.8);
  ctx.fillStyle = Math.sin(t * 5) > 0 ? '#f1c40f' : '#7f6000';
  ctx.beginPath();
  ctx.arc(led.x, led.y, 1.2 * k * isoScale(), 0, 6.3);
  ctx.fill();
  // maniglia e piastre
  box(x, y, W * 0.5, 1.8 * k, 1.8 * k, '#2d3436', { z0: z + H + 2 * k, edge: null });
  box(x - W * 0.22, y, 1.6 * k, 1.8 * k, 2 * k, '#2d3436', { z0: z + H, edge: null });
  box(x + W * 0.22, y, 1.6 * k, 1.8 * k, 2 * k, '#2d3436', { z0: z + H, edge: null });
  for (const dy of [-0.25, 0.25])
    box(x + W / 2 + 1.5 * k, y + dy * D, 3 * k, 3.5 * k, 5 * k, '#636e72', { z0: z + 2 * k });
}

/**
 * Postazione del defibrillatore: colonnina rossa con il cartello "DAE" e il ripiano; sopra la
 * valigetta, finché qualcuno non la prende (`it.empty`).
 */
export function drawDefibStationProp(it?: GameValue, t?: GameValue): GameValue {
  const ctx = game.view.ctx;
  const { x, y, w, h } = it;
  box(x, y, w, h, 4, '#b2bec3');
  const post = box(x, y, w - 8, h - 8, 34, '#e74c3c', { z0: 4 });
  onFace(post, 'left', (W: number, H: number): void => {
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(2, 4, W - 4, 11);
    ctx.fillStyle = '#c0392b';
    ctx.font = 'bold 7px sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('DAE', W / 2, 10, W - 6);
    ctx.textBaseline = 'alphabetic';
    // croce bianca
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(W / 2 - 1.5, H * 0.55, 3, 9);
    ctx.fillRect(W / 2 - 4.5, H * 0.55 + 3, 9, 3);
  });
  box(x, y, w, h, 3, '#ecf0f1', { z0: 38, top: '#f5f6fa' });
  if (!it.empty) drawDefibrillator(x, y, 41, t);
  else {
    const p = isoProject(x, y, 41.5);
    ctx.fillStyle = Math.sin(t * 6) > 0 ? '#e74c3c' : '#7b241c';
    ctx.beginPath();
    ctx.arc(p.x, p.y, 2 * isoScale(), 0, 6.3);
    ctx.fill();
  }
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

/** Come appaiono la pizza e la pala del forno a legna: le decide il turno al ristorante. */
export interface OvenLook {
  /** la pizza dentro il forno: -1 non c'è, poi da 0 (cruda) a 1 (cotta) */
  inside: number;
  /** la pala: `pos` 0 tutta fuori (in mano a chi inforna), 1 alla bocca del forno; `pizza` come
   *  `inside` per quella che porta; `fade` 0 si vede tutta, 1 è sparita */
  peel?: { pos: number; pizza: number; fade: number };
}

let ovenLook: (() => OvenLook | null) | null = null;
/** Il ristorante dice dov'è la pizza: sulla pala, dentro il forno o da nessuna parte. */
export function setPizzaOven(fn: (() => OvenLook | null) | null): void {
  ovenLook = fn;
}

/** Il colore a metà strada tra due '#rrggbb' (k da 0 a 1). */
function mixHex(a: string, b: string, k: number): string {
  const c = (h: string, i: number) => parseInt(h.slice(1 + i * 2, 3 + i * 2), 16);
  const v = [0, 1, 2].map((i) => Math.round(c(a, i) + (c(b, i) - c(a, i)) * k));
  return `rgb(${v[0]},${v[1]},${v[2]})`;
}

/** I colori della pizza mentre cuoce: cornicione e mozzarella da pallidi a dorati. */
const pizzaColors = (cooked: number) => ({
  crust: mixHex('#f3dcaa', '#d48a2e', cooked),
  cheese: mixHex('#fdfdf5', '#f6c453', cooked * 0.8),
});

/** Un cerchio steso a terra (alla quota z), già chiuso: poi lo si riempie. */
function flatCircle(x: number, y: number, z: number, r: number): void {
  const ctx = game.view.ctx;
  ctx.beginPath();
  for (let k = 0; k < 20; k++) {
    const a = (k / 20) * Math.PI * 2;
    const p = isoProject(x + Math.cos(a) * r, y + Math.sin(a) * r, z);
    if (k) ctx.lineTo(p.x, p.y);
    else ctx.moveTo(p.x, p.y);
  }
  ctx.closePath();
}

/**
 * Una pizza in 3D: il disco ha il suo spessore, il cornicione è rialzato e il pomodoro sta più in
 * basso dentro il bordo; sopra la mozzarella a bolle col riflesso e due foglie di basilico. Cotta,
 * il cornicione si dora e prende le macchie scure del forno a legna. (x, y, z) è il centro del fondo.
 */
function drawPizzaDisc(x: number, y: number, z: number, r: number, cooked: number): void {
  const ctx = game.view.ctx;
  const s: number = isoScale();
  const { crust, cheese } = pizzaColors(cooked);
  const T = 2.2;
  // lo spessore: cerchi uno sull'altro, più scuri sotto
  for (let h = 0; h < T; h += 0.4) {
    ctx.fillStyle = mixHex('#b07a3c', '#7a4a1e', cooked);
    flatCircle(x, y, z + h, r);
    ctx.fill();
  }
  // il cornicione, poi il suo bordo interno in ombra e il pomodoro un po' più giù
  ctx.fillStyle = crust;
  flatCircle(x, y, z + T, r);
  ctx.fill();
  ctx.fillStyle = mixHex('#c9a06a', '#a8651f', cooked);
  flatCircle(x, y, z + T - 0.2, r * 0.8);
  ctx.fill();
  ctx.fillStyle = '#b8322a';
  flatCircle(x, y, z + T - 0.7, r * 0.74);
  ctx.fill();
  // le macchie del forno sul cornicione, quando è cotta
  if (cooked > 0.4) {
    ctx.fillStyle = `rgba(60,30,10,${(cooked - 0.4) * 0.9})`;
    for (let i = 0; i < 7; i++) {
      const a = i * 0.9 + 0.3;
      const p = isoProject(x + Math.cos(a) * r * 0.9, y + Math.sin(a) * r * 0.9, z + T);
      ctx.beginPath();
      ctx.arc(p.x, p.y, 0.7 * s, 0, 6.3);
      ctx.fill();
    }
  }
  // la mozzarella: bolle tonde con l'ombra sotto e il riflesso sopra
  for (let i = 0; i < 5; i++) {
    const a = i * 1.26 + 0.4;
    const p = isoProject(x + Math.cos(a) * r * 0.42, y + Math.sin(a) * r * 0.42, z + T - 0.2);
    ctx.fillStyle = 'rgba(0,0,0,0.18)';
    ctx.beginPath();
    ctx.ellipse(p.x, p.y + 0.5 * s, 2.4 * s, 1.4 * s, 0, 0, 6.3);
    ctx.fill();
    ctx.fillStyle = cheese;
    ctx.beginPath();
    ctx.ellipse(p.x, p.y - 0.4 * s, 2.3 * s, 1.5 * s, 0, 0, 6.3);
    ctx.fill();
    ctx.fillStyle = 'rgba(255,255,255,0.7)';
    ctx.beginPath();
    ctx.ellipse(p.x - 0.7 * s, p.y - 0.9 * s, 0.8 * s, 0.4 * s, 0, 0, 6.3);
    ctx.fill();
  }
  ctx.fillStyle = '#27ae60';
  for (const a of [1, 4]) {
    const p = isoProject(x + Math.cos(a) * r * 0.2, y + Math.sin(a) * r * 0.2, z + T);
    ctx.beginPath();
    ctx.ellipse(p.x, p.y, 1.7 * s, 0.9 * s, 0.5, 0, 6.3);
    ctx.fill();
  }
}

/** Il raggio della pala: passa giusta dalla bocca del forno. */
const PEEL_R = 9;

/** La pala di legno, con il suo spessore e il manico lungo verso la sala; sopra la pizza se la porta. */
function drawPeel(x: number, y: number, z: number, pizza: number): void {
  const ctx = game.view.ctx;
  for (let h = -1.2; h < 0; h += 0.4) {
    ctx.fillStyle = '#9c7449';
    flatCircle(x, y, z + h, PEEL_R);
    ctx.fill();
  }
  ctx.fillStyle = '#c69c6d';
  flatCircle(x, y, z, PEEL_R);
  ctx.fill();
  ctx.strokeStyle = 'rgba(93,64,55,0.45)';
  ctx.lineWidth = 0.8;
  ctx.stroke();
  if (pizza >= 0) drawPizzaDisc(x, y, z + 0.2, 7, pizza);
  box(x + PEEL_R + 13, y, 26, 2.6, 1.6, '#8d6e63', { z0: z - 1.2 });
}

/**
 * Forno a legna per la pizza: base in mattoni, cupola grande col comignolo e il fumo, e davanti,
 * verso la sala (+x), il portale con la bocca ad arco: dentro il piano, la pizza e il fuoco in fondo.
 */
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
  onFace(base, 'right', bricks);
  onFace(base, 'left', bricks);
  // la nicchia della legna sotto il piano: un buco vero sul davanti della base, con dentro il fondo,
  // il pavimento e la parete di lato, e i tronchi impilati di punta
  {
    const fx = it.x + it.w / 2;
    const yLo = it.y - it.h * 0.3,
      yHi = it.y + it.h * 0.3;
    const zLo = baseH * 0.1,
      zHi = baseH * 0.58;
    const depth = 20;
    const poly = (pts: [number, number, number][]): void => {
      ctx.beginPath();
      pts.forEach(([x, y, z], i) => {
        const p = isoProject(x, y, z);
        if (i) ctx.lineTo(p.x, p.y);
        else ctx.moveTo(p.x, p.y);
      });
      ctx.closePath();
    };
    ctx.save();
    poly([
      [fx, yHi, zLo],
      [fx, yHi, zHi],
      [fx, yLo, zHi],
      [fx, yLo, zLo],
    ]);
    ctx.clip();
    // il fondo in ombra, poi la parete di lato e il pavimento, un po' più chiari
    ctx.fillStyle = '#1e120d';
    ctx.fill();
    ctx.fillStyle = '#2e1d15';
    poly([
      [fx, yLo, zLo],
      [fx, yLo, zHi],
      [fx - depth, yLo, zHi],
      [fx - depth, yLo, zLo],
    ]);
    ctx.fill();
    ctx.fillStyle = '#3a261b';
    poly([
      [fx, yLo, zLo],
      [fx, yHi, zLo],
      [fx - depth, yHi, zLo],
      [fx - depth, yLo, zLo],
    ]);
    ctx.fill();
    // i tronchi: cilindri coricati verso la sala, la corteccia e la faccia tagliata con gli anelli
    const r = 3.4;
    const log = (y: number, z: number): void => {
      const ring = (x: number, rr: number): void => {
        ctx.beginPath();
        for (let k = 0; k <= 14; k++) {
          const a = (k / 14) * Math.PI * 2;
          const p = isoProject(x, y + Math.cos(a) * rr, z + Math.sin(a) * rr);
          if (k) ctx.lineTo(p.x, p.y);
          else ctx.moveTo(p.x, p.y);
        }
        ctx.closePath();
      };
      for (let x = fx - depth + 2; x < fx - 1; x += 1) {
        ctx.fillStyle = x < fx - 3 ? '#4e342e' : '#5d4037';
        ring(x, r);
        ctx.fill();
      }
      ctx.fillStyle = '#c8a27a';
      ring(fx - 1, r - 0.3);
      ctx.fill();
      ctx.strokeStyle = 'rgba(120,80,45,0.6)';
      ctx.lineWidth = 0.7 * isoScale();
      ring(fx - 1, r * 0.55);
      ctx.stroke();
    };
    // quattro sotto e tre sopra, centrati nella nicchia, dalla più lontana alla più vicina
    const base0 = zLo + r;
    for (const y of [-3 * r, -r, r, 3 * r]) log(it.y + y, base0);
    for (const y of [-2 * r, 0, 2 * r]) log(it.y + y, base0 + r * 1.7);
    ctx.restore();
  }
  // cupola: anelli veri (cerchi nel mondo, non ellissi sullo schermo) che salgono e si stringono;
  // larga quasi quanto la base e alta
  const R = (Math.min(it.w, it.h) / 2) * 1.0,
    HD = R * 1.45;
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
  const layers = 12;
  for (let i = 0; i <= layers; i++) {
    const a = (i / layers) * (Math.PI / 2);
    ctx.fillStyle = i % 2 ? '#b5532f' : '#c0623a';
    ring(R * Math.cos(a) + 0.4, baseH + HD * Math.sin(a));
  }
  // comignolo tondo al centro della cupola: anelli uno sull'altro, col bordo e la bocca scura
  const top = baseH + HD;
  const cr = 7;
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
  // la bocca ad arco verso la sala: dentro il piano del forno, la pizza e la luce del fuoco
  const mw = R * 0.85,
    mh = HD * 0.5;
  const front = it.x + it.w / 2;
  const zs = baseH + mh * 0.55;
  /** L'arco largo `grow` in più dell'apertura, sul piano verticale x, come percorso sullo schermo. */
  const archPath = (grow: number, x = front): void => {
    const half = mw / 2 + grow;
    ctx.beginPath();
    const at = (y: number, z: number) => isoProject(x, it.y + y, z);
    let p = at(half, baseH);
    ctx.moveTo(p.x, p.y);
    for (let k = 0; k <= 16; k++) {
      const a = (k / 16) * Math.PI;
      p = at(Math.cos(a) * half, zs + Math.sin(a) * (mh * 0.45 + grow));
      ctx.lineTo(p.x, p.y);
    }
    p = at(-half, baseH);
    ctx.lineTo(p.x, p.y);
    ctx.closePath();
  };
  // la cornice: un arco di mattoni spesso, della stessa forma del buco, che esce dalla cupola.
  // Lo spessore si fa ripetendo la sua forma dal fondo al davanti.
  const RIM = 5,
    RIM_D = 8;
  for (let d = RIM_D; d > 0; d -= 1) {
    ctx.fillStyle = '#9c5434';
    archPath(RIM, front - d);
    ctx.fill();
  }
  ctx.fillStyle = '#a65a3a';
  archPath(RIM);
  ctx.fill();
  // I mattoni della cornice sono gli stessi davanti e sullo spessore, come in un arco vero: ogni
  // mattone dell'arco è un cuneo sul davanti e prosegue dritto per tutto lo spessore; i piedritti
  // sono file di mattoni interi, con le fughe alla stessa altezza davanti e di lato.
  ctx.strokeStyle = 'rgba(0,0,0,0.22)';
  ctx.lineWidth = 0.8 * isoScale();
  const line = (a: [number, number, number], b: [number, number, number]): void => {
    const p = isoProject(a[0], it.y + a[1], a[2]),
      q = isoProject(b[0], it.y + b[1], b[2]);
    ctx.beginPath();
    ctx.moveTo(p.x, p.y);
    ctx.lineTo(q.x, q.y);
    ctx.stroke();
  };
  const back = front - RIM_D;
  const VOUSSOIRS = 11;
  for (let k = 1; k < VOUSSOIRS; k++) {
    const a = (k / VOUSSOIRS) * Math.PI;
    const inner = [Math.cos(a) * (mw / 2), zs + Math.sin(a) * mh * 0.45] as const;
    const outer = [Math.cos(a) * (mw / 2 + RIM), zs + Math.sin(a) * (mh * 0.45 + RIM)] as const;
    // il cuneo sul davanti e la sua fuga lungo lo spessore, sopra
    line([front, inner[0], inner[1]], [front, outer[0], outer[1]]);
    line([back, outer[0], outer[1]], [front, outer[0], outer[1]]);
  }
  // le file dei piedritti, fino all'imposta dell'arco (zs)
  const course = (zs - baseH) / 3;
  for (const z of [baseH + course, baseH + course * 2, zs]) {
    for (const side of [-1, 1])
      line([front, side * (mw / 2), z], [front, side * (mw / 2 + RIM), z]);
    // sul fianco che si vede (+y) la stessa fuga corre lungo lo spessore
    line([back, mw / 2 + RIM, z], [front, mw / 2 + RIM, z]);
  }
  const look = ovenLook?.();
  // Lo sguardo scende in diagonale (1,1,1): un punto del piano profondo d dietro la bocca si vede
  // nell'arco spostato di d lungo y e alzato di d. La bocca è piccola: la pala entra dritta, appena
  // a destra del mezzo, e la pizza cuoce subito dietro la bocca, così si vede tutta nell'arco.
  const pizzaX = front - 6;
  const backX = front - 20;
  const inY = it.y - 2;
  const fireY = it.y - 10;
  const peelX = (pos: number) => pizzaX + (1 - pos) * (front + 26 - pizzaX);
  const peel = look?.peel && look.peel.fade < 1 ? look.peel : null;
  const drawPeelNow = (): void => {
    if (!peel) return;
    ctx.save();
    ctx.globalAlpha = 1 - peel.fade;
    drawPeel(peelX(peel.pos), inY, baseH + 1, peel.pizza);
    ctx.restore();
  };
  // l'interno, visto solo attraverso l'apertura
  ctx.save();
  archPath(0);
  ctx.clip();
  ctx.fillStyle = '#1b0f0a';
  ctx.fill();
  // il piano del forno, dalla bocca fino in fondo
  const floor = [
    [front, it.y - R],
    [front, it.y + R],
    [backX, it.y + R],
    [backX, it.y - R],
  ].map(([x, y]) => isoProject(x, y, baseH));
  ctx.fillStyle = '#7a4a30';
  ctx.beginPath();
  floor.forEach((q, i) => (i ? ctx.lineTo(q.x, q.y) : ctx.moveTo(q.x, q.y)));
  ctx.fill();
  // il fuoco non si vede, sta in fondo a destra: arriva solo la sua luce su pareti e piano
  const fire = isoProject(backX + 4, fireY, baseH + 4);
  const sc: number = isoScale();
  const glow = ctx.createRadialGradient(fire.x, fire.y, 1, fire.x, fire.y, 34 * sc);
  glow.addColorStop(0, 'rgba(255,170,60,0.9)');
  glow.addColorStop(0.5, 'rgba(255,110,20,0.35)');
  glow.addColorStop(1, 'rgba(255,90,0,0)');
  ctx.fillStyle = glow;
  ctx.fillRect(fire.x - 40 * sc, fire.y - 40 * sc, 80 * sc, 80 * sc);
  // la pizza che cuoce sul piano, e la pala per la parte che è già dentro
  if (look && look.inside >= 0) drawPizzaDisc(pizzaX, inY, baseH + 0.2, 7, look.inside);
  drawPeelNow();
  ctx.restore();
  // il bordo dell'arco, in mattoni più chiari
  ctx.strokeStyle = '#d7a07a';
  ctx.lineWidth = 2.2 * sc;
  archPath(0.8);
  ctx.stroke();
  // la pala per la parte ancora fuori dal forno, davanti al portale
  if (peel) {
    const z = baseH + 1;
    const a = isoProject(front, it.y - 200, z),
      b = isoProject(front, it.y + 200, z),
      c = isoProject(front + 200, it.y + 200, z),
      d = isoProject(front + 200, it.y - 200, z);
    ctx.save();
    ctx.beginPath();
    ctx.moveTo(a.x, a.y);
    ctx.lineTo(b.x, b.y);
    ctx.lineTo(c.x, c.y);
    ctx.lineTo(d.x, d.y);
    ctx.closePath();
    ctx.clip();
    drawPeelNow();
    ctx.restore();
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
