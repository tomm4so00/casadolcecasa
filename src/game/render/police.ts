// Commissariato: lo sportello delle denunce con gli agenti dietro il vetro, la camera di
// sicurezza con le sbarre, le scrivanie dell'ufficio, l'eliminacode e la bacheca degli avvisi.
import { type GameValue, game } from '../context.js';
import { isoProject, isoScale, poly, setPlane } from './primitives.js';
import { parseLook, resolveLook } from '../character.js';
import { drawPlayerAvatar } from './avatars.js';
import { box, drawChair, onFace, resetPlane } from './objects.js';
import { servingNumber } from '../police-rules.js';
import { policeFund } from '../trash.js';
import { wallPlane } from './scenes.js';

const NAVY = '#1f3a68';
const NAVY_DARK = '#16294a';
const STEEL = '#3d4852';

// ---------------------------------------------------------------- agenti

const OFFICERS = [
  { skin: 1, hairStyle: 0, hairColor: 0, eyeColor: 0, eyeShape: 0, mouth: 1, beard: 0, gender: 0 },
  { skin: 4, hairStyle: 3, hairColor: 1, eyeColor: 1, eyeShape: 1, mouth: 3, beard: 0, gender: 1 },
  { skin: 2, hairStyle: 1, hairColor: 2, eyeColor: 0, eyeShape: 0, mouth: 0, beard: 2, gender: 0 },
  { skin: 3, hairStyle: 7, hairColor: 0, eyeColor: 2, eyeShape: 1, mouth: 2, beard: 0, gender: 1 },
];

const looks: GameValue[] = [];

/** La divisa: giacca blu, camicia azzurra, cravatta e berretto con la visiera. */
function officerLook(i: number): GameValue {
  if (looks[i]) return looks[i];
  const base: GameValue = resolveLook(parseLook('item_suit,pants_black,shoes_formal,neck_tie'));
  const look: GameValue = {
    ...base,
    top: { ...base.top, style: 'jacket', color: NAVY, color2: '#a9c7ea' },
    pants: { ...base.pants, color: NAVY_DARK },
    neck: base.neck ? { ...base.neck, color: NAVY_DARK } : base.neck,
    hat: { id: '_police_cap', slot: 'hat', style: 'police', color: NAVY_DARK, color2: '#c9d1d9' },
    body: OFFICERS[i % OFFICERS.length],
  };
  looks[i] = look;
  return look;
}

// ---------------------------------------------------------------- sportello delle denunce

/** Bancone blu con la fascia bianca, vetro con gli sportelli, due agenti e il numero servito. */
export function drawPoliceCounter(it: GameValue, t: GameValue): void {
  const ctx: GameValue = game.view.ctx;
  const s: number = isoScale();
  const windows = [-0.27, 0.27].map((k) => it.x + it.w * k);
  windows.forEach((wx, i) => {
    drawPlayerAvatar(wx, it.y - it.h / 2 - 16, '', (t || 0) + i * 3, officerLook(i), false, '', {
      noShadow: true,
    });
  });
  const zTop = it.z - 4;
  const b: GameValue = box(it.x, it.y, it.w, it.h, zTop, NAVY);
  onFace(b, 'left', (W: number, H: number): void => {
    ctx.fillStyle = NAVY;
    ctx.fillRect(0, 0, W, H);
    // fascia bianca col filetto rosso, come sulle auto di servizio
    ctx.fillStyle = '#f5f6fa';
    ctx.fillRect(0, H * 0.3, W, H * 0.26);
    ctx.fillStyle = '#c0392b';
    ctx.fillRect(0, H * 0.56, W, 2);
    ctx.fillStyle = NAVY;
    ctx.font = 'bold 11px sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('POLIZIA', W / 2, H * 0.43 + 0.5);
    // pannelli sotto e zoccolo
    ctx.strokeStyle = 'rgba(255,255,255,0.12)';
    ctx.lineWidth = 1;
    for (let u = 8; u < W - 30; u += 46) ctx.strokeRect(u, H * 0.64, 38, H * 0.26);
    ctx.fillStyle = '#0d1b33';
    ctx.fillRect(0, H - 4, W, 4);
    ctx.textBaseline = 'alphabetic';
  });
  onFace(b, 'right', (W: number, H: number): void => {
    ctx.fillStyle = 'rgba(0,0,0,0.12)';
    ctx.fillRect(0, 0, W, H);
    ctx.fillStyle = '#f5f6fa';
    ctx.fillRect(0, H * 0.3, W, H * 0.26);
  });
  // piano in laminato grigio chiaro
  box(it.x, it.y, it.w + 4, it.h + 4, 4, '#cfd6dc', { z0: zTop, top: '#e4e9ed' });
  // il vetro antiproiettile, appena dietro il bordo davanti
  const gy = it.y - 2;
  const z0 = it.z,
    z1 = it.z + 48;
  const x0 = it.x - it.w / 2 + 3,
    x1 = it.x + it.w / 2 - 3;
  const pane = (xa: number, xb: number, za: number, zb: number): void =>
    poly(
      [
        isoProject(xa, gy, za),
        isoProject(xb, gy, za),
        isoProject(xb, gy, zb),
        isoProject(xa, gy, zb),
      ],
      'rgba(190,220,240,0.2)',
      'rgba(255,255,255,0.5)',
    );
  const slotH = 7;
  pane(x0, x1, z0 + slotH, z1);
  windows.forEach((wx) => pane(wx - 16, wx + 16, z0, z0 + 2));
  // riflessi
  for (const rx of [x0 + 18, it.x - 8, it.x + 30, x1 - 26]) {
    const a = isoProject(rx, gy, z1 - 6),
      c = isoProject(rx + 12, gy, z0 + slotH + 8);
    ctx.strokeStyle = 'rgba(255,255,255,0.32)';
    ctx.lineWidth = 2 * s;
    ctx.beginPath();
    ctx.moveTo(a.x, a.y);
    ctx.lineTo(c.x, c.y);
    ctx.stroke();
  }
  // la griglia per parlare, all'altezza della bocca
  for (const wx of windows)
    for (let k = 0; k < 7; k++) {
      const ang = (k / 7) * Math.PI * 2;
      const p = isoProject(wx + Math.cos(ang) * 4, gy, z0 + 30 + Math.sin(ang) * 4);
      ctx.fillStyle = 'rgba(40,50,60,0.55)';
      ctx.beginPath();
      ctx.arc(p.x, p.y, 0.9 * s, 0, 6.3);
      ctx.fill();
    }
  // montanti d'alluminio e traverso in alto
  for (const px of [x0, ...windows.map((w) => w - 18), ...windows.map((w) => w + 18), x1])
    box(px, gy, 3, 3, z1 - z0, '#aab4be', { z0 });
  box(it.x, gy, it.w - 2, 4, 4, '#8a96a3', { z0: z1 });
  // i cartelli degli sportelli e, in mezzo, il numero che si sta servendo
  const labels = ['DENUNCE', 'INFORMAZIONI'];
  windows.forEach((wx, i) => {
    const sign: GameValue = box(wx, gy, 46, 2, 11, NAVY, { z0: z1 + 4 });
    onFace(sign, 'left', (W: number, H: number): void => {
      ctx.fillStyle = '#ffffff';
      ctx.font = 'bold 6px sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText(`${i + 1} · ${labels[i]}`, W / 2, H / 2 + 2);
    });
    // modulo e penna sul piano, davanti allo sportello
    box(wx + 9, it.y + 8, 12, 9, 0.6, '#ffffff', { z0: zTop + 4, edge: 'rgba(0,0,0,0.15)' });
    box(wx - 9, it.y + 8, 2, 9, 1, '#2d3436', { z0: zTop + 4 });
  });
  const num = servingNumber(Date.now());
  const disp: GameValue = box(it.x, gy, 34, 3, 13, '#111418', { z0: z1 + 4 });
  onFace(disp, 'left', (W: number, H: number): void => {
    ctx.fillStyle = '#05080a';
    ctx.fillRect(2, 2, W - 4, H - 4);
    ctx.fillStyle = '#ff3b30';
    ctx.font = 'bold 8px monospace';
    ctx.textAlign = 'center';
    ctx.fillText(`A${String(num).padStart(3, '0')}`, W / 2, H / 2 + 3);
  });
}

// ---------------------------------------------------------------- eliminacode

/** Colonnina rossa con il rotolo dei biglietti: un biglietto spunta dalla fessura. */
export function drawTicketMachine(it: GameValue): void {
  const ctx: GameValue = game.view.ctx;
  box(it.x, it.y, it.w + 4, it.h + 4, 2, '#2d3436');
  box(it.x, it.y, 6, 6, 32, '#95a5a6', { z0: 2 });
  const head: GameValue = box(it.x, it.y, it.w, it.h, 22, '#c0392b', { z0: 34 });
  onFace(head, 'left', (W: number, H: number): void => {
    ctx.fillStyle = '#ecf0f1';
    ctx.fillRect(2, 2, W - 4, 6);
    ctx.fillStyle = '#c0392b';
    ctx.font = 'bold 4px sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('PRENDI IL', W / 2, 5);
    ctx.fillText('NUMERO', W / 2, 7.6);
    // il pulsante verde e la fessura
    ctx.fillStyle = '#27ae60';
    ctx.beginPath();
    ctx.arc(W / 2, H * 0.58, 2.4, 0, 6.3);
    ctx.fill();
    ctx.fillStyle = '#1e272e';
    ctx.fillRect(W / 2 - 5, H - 5, 10, 1.6);
  });
  onFace(head, 'top', (W: number, H: number): void => {
    ctx.fillStyle = 'rgba(255,255,255,0.15)';
    ctx.fillRect(0, 0, W, H);
  });
  // il biglietto bianco che esce dalla fessura
  box(it.x, it.y + it.h / 2 + 1.5, 6, 3, 0.5, '#ffffff', { z0: 38, edge: 'rgba(0,0,0,0.2)' });
}

// ---------------------------------------------------------------- camera di sicurezza

/** Pavimento di cemento, panca, wc d'acciaio e sbarre sui due lati liberi, con la porta. */
export function drawHoldingCell(it: GameValue): void {
  const ctx: GameValue = game.view.ctx;
  const s: number = isoScale();
  const x0 = it.x - it.w / 2,
    x1 = it.x + it.w / 2,
    y0 = it.y - it.h / 2,
    y1 = it.y + it.h / 2;
  const H: number = it.z;
  // pavimento di cemento con le fughe
  setPlane([x0, y0, 0.4], [1, 0, 0], [0, 1, 0]);
  try {
    ctx.fillStyle = '#8f979e';
    ctx.fillRect(0, 0, it.w, it.h);
    ctx.strokeStyle = 'rgba(0,0,0,0.12)';
    ctx.lineWidth = 1;
    for (let v = 35; v < it.h; v += 35) {
      ctx.beginPath();
      ctx.moveTo(0, v);
      ctx.lineTo(it.w, v);
      ctx.stroke();
    }
    ctx.fillStyle = 'rgba(0,0,0,0.18)';
    ctx.fillRect(0, 0, it.w, 6);
    ctx.fillRect(0, 0, 6, it.h);
  } finally {
    resetPlane();
  }
  // panca di cemento contro il muro, con la coperta grigia piegata
  box(x0 + 13, it.y + 6, 22, 96, 16, '#a4adb5', { top: '#b9c1c8' });
  box(x0 + 13, it.y - 26, 18, 26, 3, '#6c7a89', { z0: 16, top: '#7f8c99' });
  // wc d'acciaio senza coperchio, nell'angolo in fondo
  box(x1 - 20, y0 + 12, 14, 12, 13, '#b2bec3', { top: '#dfe6e9' });
  const bowl = isoProject(x1 - 20, y0 + 12, 13.2);
  ctx.fillStyle = '#5f6b75';
  ctx.beginPath();
  ctx.ellipse(bowl.x, bowl.y, 4.2 * s, 2.2 * s, 0, 0, 6.3);
  ctx.fill();
  // sbarre: prima il lato destro (più lontano), poi quello davanti
  const bar = (ax: number, ay: number): void => {
    const a = isoProject(ax, ay, 0),
      c = isoProject(ax, ay, H);
    ctx.strokeStyle = STEEL;
    ctx.lineWidth = 2.2 * s;
    ctx.beginPath();
    ctx.moveTo(a.x, a.y);
    ctx.lineTo(c.x, c.y);
    ctx.stroke();
    ctx.strokeStyle = 'rgba(255,255,255,0.28)';
    ctx.lineWidth = 0.7 * s;
    ctx.beginPath();
    ctx.moveTo(a.x - 0.6 * s, a.y);
    ctx.lineTo(c.x - 0.6 * s, c.y);
    ctx.stroke();
  };
  const rail = (ax: number, ay: number, bx: number, by: number, z: number, d = 3): void => {
    box((ax + bx) / 2, (ay + by) / 2, Math.max(3, bx - ax), Math.max(3, by - ay), d, STEEL, {
      z0: z,
    });
  };
  for (let y = y0 + 8; y < y1 - 2; y += 9) bar(x1, y);
  rail(x1, y0, x1, y1, 0, 4);
  rail(x1, y0, x1, y1, H * 0.48);
  rail(x1, y0, x1, y1, H - 5, 5);
  // davanti: la porta (tra doorA e doorB) ha il telaio più spesso e la serratura
  const doorA = x0 + 34,
    doorB = x0 + 72;
  for (let x = x0 + 8; x < x1 - 2; x += 9) bar(x, y1);
  rail(x0, y1, x1, y1, 0, 4);
  rail(x0, y1, doorA, y1, H * 0.48);
  rail(doorB, y1, x1, y1, H * 0.48);
  rail(x0, y1, x1, y1, H - 5, 5);
  for (const dx of [doorA, doorB]) box(dx, y1, 4, 4, H - 5, '#2d3436', { z0: 0 });
  rail(doorA, y1, doorB, y1, 30, 3);
  rail(doorA, y1, doorB, y1, 72, 3);
  // la serratura e la maniglia
  const lock: GameValue = box(doorB - 6, y1 + 1, 9, 4, 12, '#2d3436', { z0: 46 });
  onFace(lock, 'left', (W: number, H2: number): void => {
    ctx.fillStyle = '#f1c40f';
    ctx.beginPath();
    ctx.arc(W / 2, H2 / 2, 1.6, 0, 6.3);
    ctx.fill();
  });
  // spigolo in fondo a destra e angolo davanti: montanti pieni
  box(x1, y1, 6, 6, H, '#2d3436');
  box(x1, y0 + 2, 5, 5, H, '#2d3436');
  // la targa sopra la porta
  const plate: GameValue = box((doorA + doorB) / 2, y1, 40, 2, 9, '#ecf0f1', { z0: H - 18 });
  onFace(plate, 'left', (W: number, H2: number): void => {
    ctx.fillStyle = NAVY;
    ctx.font = 'bold 4.4px sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('CAMERA DI SICUREZZA', W / 2, H2 / 2 + 1.6);
  });
}

// ---------------------------------------------------------------- bacheca sul muro

/** Sughero in una cornice di legno: avvisi, il volto di un ricercato e le puntine colorate. */
export function drawNoticeBoard(it: GameValue): void {
  const ctx: GameValue = game.view.ctx;
  const BH = 50;
  const b: GameValue = box(it.x, it.y, it.w, it.h, BH, '#6d4c41', { z0: it.z - BH });
  onFace(b, 'right', (W: number, H: number): void => {
    ctx.fillStyle = '#6d4c41';
    ctx.fillRect(0, 0, W, H);
    ctx.fillStyle = '#c69c6d';
    ctx.fillRect(3, 3, W - 6, H - 6);
    // grana del sughero
    ctx.fillStyle = 'rgba(120,80,40,0.25)';
    for (let i = 0; i < 60; i++)
      ctx.fillRect(4 + ((i * 37) % (W - 8)), 4 + ((i * 23) % (H - 8)), 1, 1);
    const sheet = (u: number, v: number, w: number, h: number, tilt: number, fn?: () => void) => {
      ctx.save();
      ctx.translate(u + w / 2, v + h / 2);
      ctx.rotate(tilt);
      ctx.fillStyle = 'rgba(0,0,0,0.18)';
      ctx.fillRect(-w / 2 + 1, -h / 2 + 1, w, h);
      ctx.fillStyle = '#fdfdfd';
      ctx.fillRect(-w / 2, -h / 2, w, h);
      if (fn) fn();
      else {
        ctx.fillStyle = 'rgba(45,52,54,0.55)';
        for (let l = -h / 2 + 4; l < h / 2 - 2; l += 2.6) ctx.fillRect(-w / 2 + 2, l, w - 5, 0.8);
      }
      ctx.restore();
    };
    // il ricercato: foto segnaletica e scritta rossa
    sheet(6, 6, 20, 26, -0.05, () => {
      ctx.fillStyle = '#c0392b';
      ctx.font = 'bold 3.6px sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText('RICERCATO', 0, -9);
      ctx.fillStyle = '#636e72';
      ctx.beginPath();
      ctx.arc(0, -1.5, 4, 0, 6.3);
      ctx.fill();
      ctx.fillRect(-6, 3, 12, 5);
      ctx.fillStyle = 'rgba(45,52,54,0.55)';
      ctx.fillRect(-7, 9.5, 14, 0.8);
    });
    sheet(30, 5, 18, 14, 0.06);
    sheet(52, 8, 17, 22, -0.03);
    sheet(29, 23, 20, 20, 0.04, () => {
      // il volantino del 112
      ctx.fillStyle = '#c0392b';
      ctx.fillRect(-10, -10, 20, 7);
      ctx.fillStyle = '#ffffff';
      ctx.font = 'bold 5px sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText('112', 0, -4.6);
      ctx.fillStyle = 'rgba(45,52,54,0.55)';
      for (let l = 0; l < 9; l += 2.6) ctx.fillRect(-8, l - 1, 16, 0.8);
    });
    sheet(54, 33, 14, 12, -0.08);
    for (const [u, v, c] of [
      [16, 7, '#e74c3c'],
      [39, 6, '#3498db'],
      [60, 9, '#f1c40f'],
      [39, 24, '#2ecc71'],
      [61, 34, '#e74c3c'],
    ] as [number, number, string][]) {
      ctx.fillStyle = c;
      ctx.beginPath();
      ctx.arc(u, v, 1.4, 0, 6.3);
      ctx.fill();
    }
  });
}

// ---------------------------------------------------------------- ufficio

/**
 * Scrivania dell'ufficio aperto: dietro l'agente seduto, sul piano monitor, tastiera, fascicoli,
 * telefono e il berretto; davanti la sedia per chi viene a denunciare. Tutto sta nell'ingombro.
 */
export function drawCopDesk(it: GameValue, t: GameValue): void {
  const ctx: GameValue = game.view.ctx;
  const y0 = it.y - it.h / 2,
    y1 = it.y + it.h / 2;
  const chairY = y0 + 11;
  drawChair(it.x, chairY, '#2d3436', 'y0');
  drawPlayerAvatar(
    it.x,
    chairY,
    '',
    (t || 0) + (it.officer || 0) * 5,
    officerLook(it.officer || 0),
    false,
    '',
    {
      pose: 'chair',
      noShadow: true,
    },
  );
  const dy = y0 + 22 + 17;
  const D = 30;
  // le gambe e il pannello davanti di metallo grigio, poi il piano che ci sta sopra
  for (const lx of [-1, 1]) box(it.x + lx * (it.w / 2 - 3), dy, 4, 30, D - 3, '#7f8c8d');
  const panel: GameValue = box(it.x, dy + 13, it.w - 10, 3, D - 12, '#95a5a6', { z0: 8 });
  onFace(panel, 'left', (W: number, H: number): void => {
    ctx.fillStyle = 'rgba(0,0,0,0.08)';
    ctx.fillRect(0, H - 3, W, 3);
  });
  box(it.x, dy, it.w, 34, 3, '#c9b79c', { z0: D - 3, top: '#d8c8af' });
  // il monitor girato verso l'agente: si vede il dorso
  const mx = it.x + 12;
  box(mx, dy - 2, 6, 5, 4, '#2d3436', { z0: D });
  box(mx, dy - 2, 26, 3, 17, '#2d3436', { z0: D + 4, top: '#3d4852' });
  box(it.x - 2, dy - 9, 20, 6, 1, '#dfe6e9', { z0: D });
  // fascicoli impilati e il telefono
  box(it.x - 22, dy + 4, 16, 12, 5, '#e1b12c', { z0: D, top: '#fbc531' });
  box(it.x - 22, dy + 4, 15, 11, 1, '#ffffff', { z0: D + 5 });
  box(it.x + 26, dy + 8, 8, 7, 3, '#1e272e', { z0: D });
  // il berretto sul piano
  const cap = isoProject(it.x - 6, dy + 9, D + 2);
  const s: number = isoScale();
  ctx.fillStyle = NAVY_DARK;
  ctx.beginPath();
  ctx.ellipse(cap.x, cap.y, 5.5 * s, 3 * s, 0, 0, 6.3);
  ctx.fill();
  ctx.fillStyle = '#0d0f12';
  ctx.beginPath();
  ctx.ellipse(cap.x + 2 * s, cap.y + 2 * s, 3.5 * s, 1.4 * s, 0.3, 0, 6.3);
  ctx.fill();
  ctx.fillStyle = '#dcdde1';
  ctx.beginPath();
  ctx.arc(cap.x, cap.y - 0.6 * s, 1 * s, 0, 6.3);
  ctx.fill();
  // la sedia di chi denuncia, con lo schienale verso chi guarda
  drawChair(it.x, y1 - 9, '#2e86de', 'y1');
}

/** Divisorio della zona degli agenti: pannello blu in basso e vetro smerigliato sopra. */
export function drawPoliceRail(it: GameValue): void {
  box(it.x, it.y, it.w, it.h, 30, '#5b6b7d', { top: '#8a96a3' });
  box(it.x, it.y, it.w - 2, it.h, it.z - 30, 'rgba(220,235,245,0.5)', {
    z0: 30,
    left: 'rgba(210,228,240,0.45)',
    right: 'rgba(190,212,230,0.5)',
    top: 'rgba(240,248,255,0.6)',
    edge: 'rgba(255,255,255,0.55)',
  });
  box(it.x, it.y, it.w, it.h, 2, '#aab4be', { z0: it.z });
}

/** Armadio blindato grigio a due ante, con la tastiera del codice. */
export function drawGunLocker(it: GameValue): void {
  const ctx: GameValue = game.view.ctx;
  const b: GameValue = box(it.x, it.y, it.w, it.h, it.z, '#6c7a89', { top: '#8395a7' });
  onFace(b, 'left', (W: number, H: number): void => {
    ctx.strokeStyle = 'rgba(0,0,0,0.35)';
    ctx.lineWidth = 1;
    ctx.strokeRect(2, 2, W / 2 - 3, H - 6);
    ctx.strokeRect(W / 2 + 1, 2, W / 2 - 3, H - 6);
    ctx.fillStyle = '#2d3436';
    ctx.fillRect(W / 2 - 4, H * 0.42, 2, 10);
    ctx.fillRect(W / 2 + 2, H * 0.42, 2, 10);
    // tastierino con la lucina rossa
    ctx.fillStyle = '#1e272e';
    ctx.fillRect(W - 11, H * 0.3, 7, 9);
    ctx.fillStyle = '#e74c3c';
    ctx.fillRect(W - 9, H * 0.3 + 1.5, 3, 1.4);
    ctx.fillStyle = '#ecf0f1';
    ctx.font = 'bold 3.5px sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('SOLO PERSONALE', W / 2, 9);
  });
}

/** Asta con il tricolore che scende morbido in pieghe. */
export function drawFlagPole(it: GameValue): void {
  const ctx: GameValue = game.view.ctx;
  box(it.x, it.y, 12, 12, 3, '#2d3436', { top: '#3d4852' });
  box(it.x, it.y, 2, 2, it.z - 3, '#b08d57', { z0: 3 });
  const tip = isoProject(it.x, it.y, it.z + 1);
  const s: number = isoScale();
  ctx.fillStyle = '#d4ac0d';
  ctx.beginPath();
  ctx.arc(tip.x, tip.y, 2 * s, 0, 6.3);
  ctx.fill();
  // la bandiera pende verso il davanti (+x), dal punto in alto dell'asta
  setPlane([it.x + 1, it.y, it.z - 4], [1, 0, 0], [0, 0, -1]);
  try {
    const W = 30,
      Hf = 46;
    const cols = ['#009246', '#f4f5f0', '#ce2b37'];
    for (let i = 0; i < 3; i++) {
      ctx.fillStyle = cols[i];
      ctx.beginPath();
      const u0 = (i * W) / 3,
        u1 = ((i + 1) * W) / 3;
      // il bordo libero scende un po' più in basso dell'asta: la stoffa pesa
      ctx.moveTo(u0, 0);
      ctx.lineTo(u1, 0);
      ctx.lineTo(u1 * 0.55, Hf + u1 * 0.12);
      ctx.lineTo(u0 * 0.55, Hf + u0 * 0.12);
      ctx.closePath();
      ctx.fill();
    }
    // pieghe
    for (let k = 1; k < 5; k++) {
      const u = (k * W) / 5;
      const g = ctx.createLinearGradient(u - 3, 0, u + 3, 0);
      g.addColorStop(0, 'rgba(0,0,0,0)');
      g.addColorStop(0.5, 'rgba(0,0,0,0.16)');
      g.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.moveTo(u - 3, 0);
      ctx.lineTo(u + 3, 0);
      ctx.lineTo((u + 3) * 0.55, Hf);
      ctx.lineTo((u - 3) * 0.55, Hf);
      ctx.closePath();
      ctx.fill();
    }
  } finally {
    resetPlane();
  }
}

// ---------------------------------------------------------------- pareti

/** Lo stemma con la stella, la scritta della Polizia di Stato e il nome del commissariato. */
export function wallPoliceCrest(d: GameValue): void {
  const ctx: GameValue = game.view.ctx;
  const u: number = d.u,
    top = 14;
  // scudo blu bordato d'oro
  ctx.beginPath();
  ctx.moveTo(u - 13, top);
  ctx.lineTo(u + 13, top);
  ctx.lineTo(u + 13, top + 16);
  ctx.quadraticCurveTo(u + 12, top + 27, u, top + 32);
  ctx.quadraticCurveTo(u - 12, top + 27, u - 13, top + 16);
  ctx.closePath();
  ctx.fillStyle = NAVY;
  ctx.fill();
  ctx.strokeStyle = '#d4ac0d';
  ctx.lineWidth = 2;
  ctx.stroke();
  // la stella d'Italia
  ctx.fillStyle = '#f5f6fa';
  ctx.beginPath();
  for (let i = 0; i < 10; i++) {
    const r = i % 2 ? 3.4 : 8;
    const a = -Math.PI / 2 + (i * Math.PI) / 5;
    const px = u + Math.cos(a) * r,
      py = top + 14 + Math.sin(a) * r;
    if (i) ctx.lineTo(px, py);
    else ctx.moveTo(px, py);
  }
  ctx.closePath();
  ctx.fill();
  ctx.fillStyle = NAVY;
  ctx.font = 'bold 13px sans-serif';
  ctx.textAlign = 'center';
  ctx.fillText('POLIZIA DI STATO', u, top + 47);
  ctx.fillStyle = '#2d3436';
  ctx.font = '7px sans-serif';
  ctx.fillText('Commissariato di Quartiere', u, top + 57);
}

/** La porta del commissario: legno, maniglia e targhetta, nel muro dietro il bancone. */
export function wallPoliceDoor(d: GameValue, info: GameValue): void {
  const ctx: GameValue = game.view.ctx;
  const H: number = info?.wallH || 130;
  const w = 36,
    h = 82;
  const u0 = d.u - w / 2,
    v0 = H - 7 - h;
  ctx.fillStyle = '#b2bec3';
  ctx.fillRect(u0 - 3, v0 - 3, w + 6, h + 3);
  ctx.fillStyle = '#7b5536';
  ctx.fillRect(u0, v0, w, h);
  ctx.strokeStyle = 'rgba(0,0,0,0.25)';
  ctx.lineWidth = 1;
  ctx.strokeRect(u0 + 4, v0 + 5, w - 8, h * 0.38);
  ctx.strokeRect(u0 + 4, v0 + h * 0.5, w - 8, h * 0.44);
  ctx.fillStyle = '#d4ac0d';
  ctx.fillRect(u0 + w - 8, v0 + h * 0.5, 5, 2);
  // targhetta
  ctx.fillStyle = '#ecf0f1';
  ctx.fillRect(d.u - 15, v0 + 9, 30, 9);
  ctx.fillStyle = NAVY;
  ctx.font = 'bold 4.6px sans-serif';
  ctx.textAlign = 'center';
  ctx.fillText('COMMISSARIO', d.u, v0 + 15);
}

/**
 * La cassa della polizia: cassaforte blindata che sporge dal muro di fondo, con il contatore a
 * led dei soldi delle multe. Non si scassina: ha solo il pulsante per guardarla.
 */
export function wallPoliceSafe(d: GameValue): void {
  if (d.side !== 'back') return;
  const ctx: GameValue = game.view.ctx;
  const H: number = game.ENV_STYLE.commissariato?.wallH || 130;
  const x = game.X0 + d.u,
    y = game.Y0 + 5;
  const size = 40,
    z0 = 34;
  resetPlane();
  try {
    // ombra sul muro e corpo d'acciaio
    const body: GameValue = box(x, y, size + 6, 10, size + 6, '#4d5b6a', {
      z0: z0 - 3,
      top: '#6c7a89',
    });
    onFace(body, 'left', (W: number, Hf: number): void => {
      const g = ctx.createLinearGradient(0, 0, W, Hf);
      g.addColorStop(0, '#8395a7');
      g.addColorStop(1, '#576574');
      ctx.fillStyle = g;
      ctx.fillRect(3, 3, W - 6, Hf - 6);
      ctx.strokeStyle = 'rgba(0,0,0,0.45)';
      ctx.lineWidth = 1;
      ctx.strokeRect(3, 3, W - 6, Hf - 6);
      // la ruota della combinazione e la maniglia a tre razze
      ctx.fillStyle = '#2d3436';
      ctx.beginPath();
      ctx.arc(W * 0.38, Hf * 0.48, 7, 0, 6.3);
      ctx.fill();
      ctx.fillStyle = '#b2bec3';
      ctx.beginPath();
      ctx.arc(W * 0.38, Hf * 0.48, 5, 0, 6.3);
      ctx.fill();
      ctx.strokeStyle = '#2d3436';
      for (let k = 0; k < 12; k++) {
        const a = (k / 12) * Math.PI * 2;
        ctx.beginPath();
        ctx.moveTo(W * 0.38 + Math.cos(a) * 3.6, Hf * 0.48 + Math.sin(a) * 3.6);
        ctx.lineTo(W * 0.38 + Math.cos(a) * 5, Hf * 0.48 + Math.sin(a) * 5);
        ctx.stroke();
      }
      ctx.strokeStyle = '#dfe6e9';
      ctx.lineWidth = 1.6;
      for (let k = 0; k < 3; k++) {
        const a = -Math.PI / 2 + (k * Math.PI * 2) / 3;
        ctx.beginPath();
        ctx.moveTo(W * 0.72, Hf * 0.48);
        ctx.lineTo(W * 0.72 + Math.cos(a) * 6, Hf * 0.48 + Math.sin(a) * 6);
        ctx.stroke();
      }
      // cerniere e targa
      ctx.fillStyle = '#2d3436';
      ctx.fillRect(4, Hf * 0.2, 2, 5);
      ctx.fillRect(4, Hf * 0.7, 2, 5);
      ctx.fillStyle = NAVY;
      ctx.fillRect(W / 2 - 13, Hf - 11, 26, 6);
      ctx.fillStyle = '#ffffff';
      ctx.font = 'bold 4px sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText('POLIZIA', W / 2, Hf - 6.6);
    });
    // il contatore a led sopra la cassaforte
    const disp: GameValue = box(x, game.Y0 + 3, 62, 6, 16, '#111418', { z0: z0 + size + 10 });
    onFace(disp, 'left', (W: number, Hf: number): void => {
      ctx.fillStyle = '#05080a';
      ctx.fillRect(2, 2, W - 4, Hf - 4);
      ctx.fillStyle = '#7f8c8d';
      ctx.font = 'bold 3.6px sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText('CASSA DELLA POLIZIA', W / 2, 6.5);
      ctx.fillStyle = '#ff3b30';
      ctx.font = 'bold 7px monospace';
      ctx.fillText(`${policeFund().toLocaleString('it-IT')} Đ`, W / 2, Hf - 3.5);
    });
  } finally {
    wallPlane('back', H);
  }
}
