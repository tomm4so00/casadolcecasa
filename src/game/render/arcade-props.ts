// Postazioni della sala giochi (Forza 4, Battaglia navale, Riflessi) e della sala scommesse (slot, morra).
import type { GameValue } from '../context.js';
import { game } from '../context.js';
import { box, onFace } from './objects.js';
import { isoProject, isoScale } from './primitives.js';

/** Tavolo con quattro gambe e il piano; restituisce il piano (per disegnarci sopra). */
function table(it: GameValue, top: string, edge: string): GameValue {
  const { x, y, w, h, z } = it;
  for (const [dx, dy] of [
    [-1, -1],
    [1, -1],
    [-1, 1],
    [1, 1],
  ])
    box(x + dx * (w / 2 - 6), y + dy * (h / 2 - 6), 5, 5, z - 6, '#2d1b3d');
  box(x, y, w + 6, h + 6, 4, edge, { z0: z - 6 });
  return box(x, y, w, h, 2, top, { z0: z - 2 });
}

/** Forza 4: sul tavolo la griglia blu in piedi, con qualche gettone rosso e giallo già dentro. */
export function drawC4Table(it?: GameValue, t?: GameValue): GameValue {
  const ctx = game.view.ctx;
  const felt = table(it, '#3d2a5c', '#5b3f86');
  onFace(felt, 'top', (W: number, H: number): void => {
    ctx.fillStyle = 'rgba(255,255,255,0.08)';
    ctx.fillRect(4, 4, W - 8, H - 8);
    // gettoni sparsi sul tavolo
    for (const [cx, cy, c] of [
      [10, H - 10, '#e74c3c'],
      [18, H - 8, '#e74c3c'],
      [W - 12, 10, '#f1c40f'],
      [W - 20, 13, '#f1c40f'],
    ] as const) {
      ctx.fillStyle = c;
      ctx.beginPath();
      ctx.arc(cx, cy, 3, 0, 6.3);
      ctx.fill();
    }
  });
  // la griglia in piedi, con i piedini
  const z0 = it.z;
  box(it.x - 22, it.y, 4, 10, 3, '#173f9c', { z0 });
  box(it.x + 22, it.y, 4, 10, 3, '#173f9c', { z0 });
  const board: GameValue = box(it.x, it.y, 46, 4, 36, '#1e5bd6', { z0: z0 + 2 });
  const pattern = '000000000000000000000002000001200021120001212';
  onFace(board, 'left', (W: number, H: number): void => {
    const cw = W / 7,
      ch = H / 6;
    for (let r = 0; r < 6; r++)
      for (let c = 0; c < 7; c++) {
        const v = pattern[r * 7 + c] || '0';
        ctx.fillStyle = v === '1' ? '#e74c3c' : v === '2' ? '#f1c40f' : '#0d1b3e';
        ctx.beginPath();
        ctx.arc(cw * (c + 0.5), ch * (r + 0.5), Math.min(cw, ch) * 0.36, 0, 6.3);
        ctx.fill();
      }
    // un gettone che "cade" e luccica
    const k = ((t || 0) * 0.6) % 1;
    ctx.fillStyle = `rgba(255,255,255,${0.35 * (1 - k)})`;
    ctx.beginPath();
    ctx.arc(cw * 3.5, ch * 0.5, Math.min(cw, ch) * 0.36, 0, 6.3);
    ctx.fill();
  });
}

/** Battaglia navale: due mari a griglia sul tavolo, divisi da uno schermo perché nessuno sbirci. */
export function drawBNTable(it?: GameValue): GameValue {
  const ctx = game.view.ctx;
  const felt = table(it, '#18324a', '#2c5170');
  onFace(felt, 'top', (W: number, H: number): void => {
    for (const [ox, ships] of [
      [
        4,
        [
          [1, 1, 3, true],
          [4, 4, 2, false],
        ],
      ],
      [
        W / 2 + 4,
        [
          [2, 2, 2, false],
          [1, 5, 3, true],
        ],
      ],
    ] as const) {
      const gw = W / 2 - 8,
        gh = H - 8,
        cell = Math.min(gw, gh) / 6;
      ctx.fillStyle = '#2e86de';
      ctx.fillRect(ox, 4, cell * 6, cell * 6);
      ctx.strokeStyle = 'rgba(255,255,255,0.35)';
      ctx.lineWidth = 0.5;
      for (let i = 0; i <= 6; i++) {
        ctx.beginPath();
        ctx.moveTo(ox + i * cell, 4);
        ctx.lineTo(ox + i * cell, 4 + cell * 6);
        ctx.moveTo(ox, 4 + i * cell);
        ctx.lineTo(ox + cell * 6, 4 + i * cell);
        ctx.stroke();
      }
      ctx.fillStyle = '#95a5a6';
      for (const [r, c, len, horiz] of ships)
        ctx.fillRect(
          ox + c * cell + 1,
          4 + r * cell + 1,
          (horiz ? len : 1) * cell - 2,
          (horiz ? 1 : len) * cell - 2,
        );
      // qualche colpo: rosso a segno, bianco in acqua
      ctx.fillStyle = '#e74c3c';
      ctx.beginPath();
      ctx.arc(ox + cell * 1.5, 4 + cell * 1.5, cell * 0.25, 0, 6.3);
      ctx.fill();
      ctx.fillStyle = '#ffffff';
      ctx.beginPath();
      ctx.arc(ox + cell * 4.5, 4 + cell * 1.5, cell * 0.2, 0, 6.3);
      ctx.fill();
    }
  });
  // schermo divisorio al centro
  const screen: GameValue = box(it.x, it.y, 3, it.h - 6, 16, '#2d3436', { z0: it.z });
  onFace(screen, 'right', (W: number, H: number): void => {
    ctx.fillStyle = '#c0392b';
    ctx.fillRect(2, 3, W - 4, 5);
    ctx.fillStyle = '#ffffff';
    ctx.font = 'bold 4px sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('🚢', W / 2, H - 4);
  });
}

/** Cabinato dei Riflessi: mobile da sala giochi con schermo, insegna luminosa e grande pulsante. */
export function drawReflexCabinet(it?: GameValue, t?: GameValue): GameValue {
  const ctx = game.view.ctx;
  const { x, y, w, h } = it;
  const time = t || 0;
  // base e corpo
  box(x, y, w, h, 10, '#111827');
  const body: GameValue = box(x, y - 2, w, h - 6, 92, '#3b1a6b', { z0: 10 });
  // fianchi con la grafica
  onFace(body, 'right', (W: number, H: number): void => {
    const g = ctx.createLinearGradient(0, 0, W, H);
    g.addColorStop(0, '#ff2fb3');
    g.addColorStop(1, '#6c2bd9');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, W, H);
    ctx.fillStyle = '#feca57';
    ctx.font = 'bold 14px sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('⚡', W / 2, H * 0.55);
  });
  onFace(body, 'left', (W: number): void => {
    // insegna in alto che si accende e spegne
    const on = Math.floor(time * 3) % 2 === 0;
    ctx.fillStyle = '#0b0518';
    ctx.fillRect(2, 2, W - 4, 14);
    ctx.fillStyle = on ? '#ffe066' : '#c9a227';
    ctx.shadowColor = '#ffe066';
    ctx.shadowBlur = on ? 6 : 0;
    ctx.font = 'bold 7px sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('RIFLESSI', W / 2, 12);
    ctx.shadowBlur = 0;
    // schermo: "PRONTI…" rosso e "VIA!" verde, a turno
    const go = (time * 0.7) % 2 > 1;
    ctx.fillStyle = '#05080f';
    ctx.fillRect(5, 20, W - 10, 30);
    ctx.fillStyle = go ? '#2ed573' : '#ff4757';
    ctx.fillRect(8, 23, W - 16, 24);
    ctx.fillStyle = '#ffffff';
    ctx.font = 'bold 8px sans-serif';
    ctx.fillText(go ? 'VIA!' : 'PRONTI', W / 2, 38);
    // pannello dei comandi con il grande pulsante
    ctx.fillStyle = '#1f2937';
    ctx.fillRect(3, 56, W - 6, 14);
    ctx.fillStyle = '#e74c3c';
    ctx.beginPath();
    ctx.ellipse(W / 2, 63, 7, 4, 0, 0, 6.3);
    ctx.fill();
    ctx.fillStyle = 'rgba(255,255,255,0.5)';
    ctx.beginPath();
    ctx.ellipse(W / 2 - 2, 61.5, 2.5, 1.2, 0, 0, 6.3);
    ctx.fill();
    // fessura per i gettoni
    ctx.fillStyle = '#feca57';
    ctx.fillRect(W / 2 - 4, 76, 8, 2);
  });
}

// ---------------------------------------------------------------- SALA SCOMMESSE
const SLOT_FACES = ['🍒', '🔔', '7️⃣', '💎', '⭐', '🍋'];

/** Slot machine: mobile con schermo, luci che lampeggiano in cima e leva sul fianco. */
export function drawSlotMachine(it?: GameValue, t?: GameValue): GameValue {
  const ctx = game.view.ctx;
  const { x, y, w, h, z } = it;
  const seed: number = it.seed || 0;
  const color = ['#c0392b', '#8e44ad', '#2980b9'][seed % 3];
  box(x, y, w + 4, h + 4, 8, '#2d3436');
  const body: GameValue = box(x, y, w, h, z - 20, color, { z0: 8 });
  onFace(body, 'left', (W: number, H: number): void => {
    // schermo con i tre rulli
    ctx.fillStyle = '#0d0710';
    ctx.fillRect(4, 8, W - 8, 26);
    ctx.fillStyle = '#ffffff';
    for (let i = 0; i < 3; i++) ctx.fillRect(6 + i * ((W - 12) / 3), 10, (W - 12) / 3 - 2, 22);
    ctx.font = '11px sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    for (let i = 0; i < 3; i++) {
      const k = Math.floor((t || 0) * 0.5 + seed * 2 + i * 3) % SLOT_FACES.length;
      ctx.fillText(SLOT_FACES[k], 6 + (i + 0.5) * ((W - 12) / 3) - 1, 21);
    }
    ctx.textBaseline = 'alphabetic';
    // pulsanti e fessura delle monete
    ctx.fillStyle = '#feca57';
    ctx.fillRect(6, 40, 8, 4);
    ctx.fillStyle = '#2ed573';
    ctx.fillRect(18, 40, 8, 4);
    ctx.fillStyle = '#111';
    ctx.fillRect(W - 10, 39, 3, 7);
    // vassoio delle vincite
    ctx.fillStyle = '#b2bec3';
    ctx.fillRect(5, H - 14, W - 10, 6);
    ctx.fillStyle = '#d4ac0d';
    ctx.font = 'bold 6px sans-serif';
    ctx.fillText('SLOT', W / 2, 6);
  });
  // insegna con le luci che si accendono a turno
  const top: GameValue = box(x, y, w, h * 0.6, 12, '#2d3436', { z0: z - 12 });
  onFace(top, 'left', (W: number, H: number): void => {
    for (let i = 0; i < 6; i++) {
      const on = Math.floor((t || 0) * 6 + i + seed) % 3 === 0;
      ctx.fillStyle = on ? '#feca57' : '#7f6000';
      ctx.beginPath();
      ctx.arc(4 + i * ((W - 8) / 5), H / 2, 2, 0, 6.3);
      ctx.fill();
    }
  });
  // leva sul fianco destro con il pomello rosso
  box(x + w / 2 + 3, y, 3, 3, 26, '#b2bec3', { z0: z - 46 });
  const knob = isoProject(x + w / 2 + 3, y, z - 18);
  ctx.fillStyle = '#e74c3c';
  ctx.beginPath();
  ctx.arc(knob.x, knob.y, 3.5 * isoScale(), 0, 6.3);
  ctx.fill();
}

/** Tavolo della morra cinese: panno verde con il bordo dorato e le tre mani disegnate. */
export function drawRpsTable(it?: GameValue): GameValue {
  const ctx = game.view.ctx;
  const { x, y, w, h, z } = it;
  for (const [dx, dy] of [
    [-1, -1],
    [1, -1],
    [-1, 1],
    [1, 1],
  ])
    box(x + dx * (w / 2 - 6), y + dy * (h / 2 - 6), 5, 5, z - 6, '#3e2723');
  box(x, y, w + 6, h + 6, 4, '#6d4c41', { z0: z - 6 });
  const felt: GameValue = box(x, y, w, h, 2, '#1e8449', { z0: z - 2 });
  onFace(felt, 'top', (W: number, H: number): void => {
    ctx.strokeStyle = '#d4ac0d';
    ctx.lineWidth = 1.2;
    ctx.strokeRect(4, 4, W - 8, H - 8);
    ctx.font = '13px sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('✊', W * 0.25, H / 2);
    ctx.fillText('✋', W * 0.5, H / 2);
    ctx.fillText('✌️', W * 0.75, H / 2);
    ctx.textBaseline = 'alphabetic';
    ctx.fillStyle = 'rgba(255,255,255,0.7)';
    ctx.font = 'bold 5px sans-serif';
    ctx.fillText('MORRA CINESE', W / 2, H - 7);
  });
}
