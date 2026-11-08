// Il cabinato dei minigiochi nella stanza: mobile con l'insegna luminosa, lo schermo, il pannello
// con joystick e pulsanti. Mentre ci gioco, sul suo schermo si vede la mia partita.
import type { GameValue } from '../context.js';
import { game } from '../context.js';
import { isoProject, isoScale } from './primitives.js';
import { box, onFace } from './objects.js';
import { cabinetScreen } from '../cabinet.js';
import { CONSOLE_COIN } from '../cabinet-rules.js';

const BODY = '#1f2a6b';
const TRIM = '#00d2ff';

/** Schermo spento in attesa: stelle che scendono e la scritta che lampeggia. */
function attract(ctx: CanvasRenderingContext2D, W: number, H: number, t: number): void {
  ctx.fillStyle = '#000014';
  ctx.fillRect(0, 0, W, H);
  for (let i = 0; i < 14; i++) {
    const y = (i * 7 + t * (6 + (i % 3) * 4)) % H;
    ctx.fillStyle = i % 4 ? '#5a5aa0' : '#ffffff';
    ctx.fillRect((i * 11) % W, y, 0.8, 0.8);
  }
  if (Math.floor(t * 1.5) % 2) {
    ctx.fillStyle = '#fcfc54';
    ctx.font = 'bold 4px monospace';
    ctx.textAlign = 'center';
    ctx.fillText('GIOCA', W / 2, H / 2 + 1.5);
  }
}

export function drawCabinet(it: GameValue, t: number, lights?: GameValue[]): void {
  const ctx = game.view.ctx;
  const Z: number = it.zb || 0;
  const { x, y, w, h } = it;
  const z: number = it.z || 84;
  const baseH = z * 0.52;
  const front = y + h / 2;
  // mobile in basso, con lo sportello delle monete
  const base = box(x, y, w, h, baseH, BODY, { z0: Z, top: '#111833' });
  onFace(base, 'left', (W: number, H: number): void => {
    ctx.fillStyle = '#141c4a';
    ctx.fillRect(W * 0.32, H * 0.3, W * 0.36, H * 0.42);
    ctx.fillStyle = '#ff4757';
    ctx.fillRect(W * 0.44, H * 0.4, W * 0.12, H * 0.08);
    if (it.coin) {
      ctx.fillStyle = '#fcfc54';
      ctx.font = 'bold 5px monospace';
      ctx.textAlign = 'center';
      ctx.fillText(`${CONSOLE_COIN} Đ`, W / 2, H * 0.68);
    }
    ctx.fillStyle = TRIM;
    ctx.fillRect(0, 0, W, 1.2);
  });
  // fiancata con le strisce colorate
  for (const face of ['right', 'west'])
    onFace(base, face, (W: number, H: number): void => {
      const colors = ['#ff4757', '#ffa502', '#2ed573', '#1e90ff'];
      colors.forEach((c, i) => {
        ctx.fillStyle = c;
        ctx.beginPath();
        ctx.moveTo(0, H * (0.15 + i * 0.12));
        ctx.lineTo(W, H * (0.0 + i * 0.12));
        ctx.lineTo(W, H * (0.06 + i * 0.12));
        ctx.lineTo(0, H * (0.21 + i * 0.12));
        ctx.fill();
      });
    });
  // pannello dei comandi che sporge, con joystick e pulsanti
  const panel = box(x, front - 2, w, 12, 3, '#2f3640', { z0: Z + baseH, top: '#3d4652' });
  onFace(panel, 'top', (W: number, H: number): void => {
    for (const [px, c] of [
      [0.62, '#ff4757'],
      [0.76, '#2ed573'],
      [0.9, '#1e90ff'],
    ] as [number, string][]) {
      ctx.fillStyle = c;
      ctx.beginPath();
      ctx.arc(W * px, H * 0.5, 1.6, 0, 6.3);
      ctx.fill();
    }
  });
  box(x - w * 0.25, front - 2, 1.4, 1.4, 6, '#57606f', { z0: Z + baseH + 3 });
  const knob = isoProject(x - w * 0.25, front - 2, Z + baseH + 10);
  const s = isoScale();
  ctx.fillStyle = '#e84118';
  ctx.beginPath();
  ctx.arc(knob.x, knob.y, 2 * s, 0, 6.3);
  ctx.fill();
  // parte alta con lo schermo (un po' arretrata)
  const upperH = z - baseH - 12;
  const upper = box(x, y - 3, w, h - 6, upperH, BODY, { z0: Z + baseH, top: '#111833' });
  const live = cabinetScreen();
  onFace(upper, 'left', (W: number, H: number): void => {
    ctx.fillStyle = '#0b0f2a';
    ctx.fillRect(2, 2, W - 4, H - 4);
    const sx = 4,
      sy = 4,
      sw = W - 8,
      sh = H - 8;
    ctx.save();
    ctx.beginPath();
    ctx.rect(sx, sy, sw, sh);
    ctx.clip();
    ctx.translate(sx, sy);
    if (live) {
      ctx.imageSmoothingEnabled = false;
      ctx.drawImage(live, 0, 0, sw, sh);
    } else attract(ctx, sw, sh, t);
    ctx.restore();
    // riflesso sul vetro
    ctx.fillStyle = 'rgba(255,255,255,0.08)';
    ctx.beginPath();
    ctx.moveTo(sx, sy + sh);
    ctx.lineTo(sx + sw * 0.25, sy);
    ctx.lineTo(sx + sw * 0.4, sy);
    ctx.lineTo(sx + sw * 0.15, sy + sh);
    ctx.fill();
  });
  for (const face of ['right', 'west'])
    onFace(upper, face, (W: number, H: number): void => {
      ctx.fillStyle = TRIM;
      ctx.fillRect(0, H - 1.5, W, 1.5);
    });
  // insegna luminosa in cima
  const sign = box(x, y - 2, w, h - 4, 11, '#0b0f2a', { z0: Z + z - 12, top: '#111833' });
  onFace(sign, 'left', (W: number, H: number): void => {
    const g = ctx.createLinearGradient(0, 0, W, 0);
    g.addColorStop(0, '#ff4757');
    g.addColorStop(0.5, '#ffa502');
    g.addColorStop(1, '#ff4757');
    ctx.fillStyle = g;
    ctx.fillRect(1.5, 1.5, W - 3, H - 3);
    ctx.fillStyle = '#ffffff';
    ctx.font = 'bold 6px monospace';
    ctx.textAlign = 'center';
    ctx.fillText('ARCADE', W / 2, H / 2 + 2);
  });
  if (lights && !it.zb) {
    const c = rotatedFront(it);
    lights.push({
      x: c.x,
      y: c.y,
      z: 40,
      r: live ? 90 : 70,
      color: live ? '120,200,255' : '255,140,90',
    });
  }
}

/** Il punto davanti allo schermo, tenendo conto della rotazione del mobile. */
function rotatedFront(it: GameValue): { x: number; y: number } {
  const k = (((it.rot || 0) % 4) + 4) % 4;
  let dx = 0,
    dy = it.h / 2 + 10;
  for (let i = 0; i < k; i++) {
    const tmp = dx;
    dx = dy;
    dy = -tmp;
  }
  return { x: it.x + dx, y: it.y + dy };
}
