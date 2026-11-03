// Mobili in edizione limitata: disegni più ricchi degli altri, con riflessi e luci animate.
import type { GameValue } from '../context.js';
import { game } from '../context.js';
import { box, onFace } from './objects.js';
import { isoProject, isoScale } from './primitives.js';

/** Numero della copia dal nome ("… #3/5"), per la targhetta. */
const copyLabel = (it: GameValue): string => /#\d+\/\d+/.exec(String(it.name || ''))?.[0] || '';

/** Scintille a forma di stella che girano attorno a un punto (anche sugli avatar). */
export function drawSparkles(
  ctx: CanvasRenderingContext2D,
  at: (a: number, k: number) => { x: number; y: number },
  t: number,
  count: number,
  s: number,
  color = '255,236,140',
): void {
  for (let i = 0; i < count; i++) {
    const a = t * 1.4 + (i * Math.PI * 2) / count;
    const k = (t * 0.35 + i / count) % 1;
    const p = at(a, k);
    const tw = 0.5 + 0.5 * Math.sin(t * 6 + i * 2.1);
    const r = (1 + tw * 1.8) * s;
    ctx.fillStyle = `rgba(${color},${(0.35 + 0.6 * tw) * Math.sin(Math.PI * k)})`;
    ctx.beginPath();
    ctx.moveTo(p.x, p.y - r * 2.2);
    ctx.lineTo(p.x + r * 0.45, p.y - r * 0.45);
    ctx.lineTo(p.x + r * 2.2, p.y);
    ctx.lineTo(p.x + r * 0.45, p.y + r * 0.45);
    ctx.lineTo(p.x, p.y + r * 2.2);
    ctx.lineTo(p.x - r * 0.45, p.y + r * 0.45);
    ctx.lineTo(p.x - r * 2.2, p.y);
    ctx.lineTo(p.x - r * 0.45, p.y - r * 0.45);
    ctx.closePath();
    ctx.fill();
  }
}

/** Statua d'oro: piedistallo di marmo venato con cornice dorata e figura che alza una stella. */
export function drawGoldStatue(it?: GameValue, t?: GameValue): GameValue {
  const ctx = game.view.ctx;
  const time = t || 0;
  const s = isoScale();
  const { x, y, w, h } = it;
  // piedistallo in marmo, due gradini
  box(x, y, w + 6, h + 6, 6, '#d9d4cc', { top: '#ece8e1' });
  const ped: GameValue = box(x, y, w, h, 30, '#f2efe9', { z0: 6, top: '#faf8f4' });
  const marble = (W: number, H: number): void => {
    ctx.strokeStyle = 'rgba(120,110,100,0.35)';
    ctx.lineWidth = 0.7;
    for (let i = 0; i < 4; i++) {
      ctx.beginPath();
      ctx.moveTo(0, H * (0.2 + i * 0.22));
      ctx.bezierCurveTo(
        W * 0.3,
        H * (0.1 + i * 0.2),
        W * 0.6,
        H * (0.35 + i * 0.18),
        W,
        H * (0.25 + i * 0.2),
      );
      ctx.stroke();
    }
    ctx.fillStyle = '#c9a227';
    ctx.fillRect(0, 0, W, 2.5);
    ctx.fillRect(0, H - 2.5, W, 2.5);
  };
  onFace(ped, 'left', (W: number, H: number): void => {
    marble(W, H);
    // targhetta d'ottone con il numero
    ctx.fillStyle = '#b8860b';
    ctx.fillRect(W / 2 - 10, H / 2 - 4, 20, 9);
    ctx.fillStyle = '#fff6d5';
    ctx.font = 'bold 5px sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText(copyLabel(it), W / 2, H / 2 + 2.5);
  });
  onFace(ped, 'right', marble);
  // figura dorata: gambe, busto, testa e braccio alzato
  const P = (dx: number, dy: number, z: number) => isoProject(x + dx, y + dy, z);
  const gold = (a: { x: number; y: number }, b: { x: number; y: number }, width: number) => {
    const g = ctx.createLinearGradient(a.x - width * s, a.y, a.x + width * s, a.y);
    g.addColorStop(0, '#8a6d0b');
    g.addColorStop(0.45, '#ffe680');
    g.addColorStop(1, '#a67c00');
    ctx.strokeStyle = g;
    ctx.lineWidth = width * s;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(a.x, a.y);
    ctx.lineTo(b.x, b.y);
    ctx.stroke();
  };
  gold(P(-3, 0, 36), P(-2, 0, 52), 4);
  gold(P(3, 0, 36), P(2, 0, 52), 4);
  gold(P(0, 0, 52), P(0, 0, 70), 8);
  gold(P(-4, 0, 66), P(-10, 0, 58), 3);
  gold(P(4, 0, 66), P(9, 0, 86), 3);
  const head = P(0, 0, 76);
  const hg = ctx.createRadialGradient(head.x - 2 * s, head.y - 2 * s, 0.5, head.x, head.y, 5 * s);
  hg.addColorStop(0, '#fff3b0');
  hg.addColorStop(1, '#b8860b');
  ctx.fillStyle = hg;
  ctx.beginPath();
  ctx.arc(head.x, head.y, 4.5 * s, 0, 6.3);
  ctx.fill();
  // stella in mano che brilla
  const star = P(10, 0, 90);
  const glow = ctx.createRadialGradient(star.x, star.y, 0, star.x, star.y, 12 * s);
  glow.addColorStop(0, `rgba(255,240,150,${0.55 + 0.25 * Math.sin(time * 3)})`);
  glow.addColorStop(1, 'rgba(255,240,150,0)');
  ctx.fillStyle = glow;
  ctx.fillRect(star.x - 12 * s, star.y - 12 * s, 24 * s, 24 * s);
  drawSparkles(ctx, () => star, time, 1, s * 1.6, '255,250,200');
  // riflesso che scorre sulla figura
  const k = (time * 0.4) % 1;
  const shine = P(0, 0, 40 + k * 50);
  ctx.fillStyle = `rgba(255,255,255,${0.5 * Math.sin(Math.PI * k)})`;
  ctx.beginPath();
  ctx.ellipse(shine.x, shine.y, 5 * s, 1.5 * s, -0.4, 0, 6.3);
  ctx.fill();
  // scintille tutt'intorno
  drawSparkles(ctx, (a, kk) => P(Math.cos(a) * 18, Math.sin(a) * 18, 40 + kk * 50), time, 5, s);
}

/** Juke-box al neon: mobile ad arco con tubi che cambiano colore, dischi e note che salgono. */
export function drawJukebox(it?: GameValue, t?: GameValue): GameValue {
  const ctx = game.view.ctx;
  const time = t || 0;
  const s = isoScale();
  const { x, y, w, h, z } = it;
  const body: GameValue = box(x, y, w, h, z, '#5a2d0c', { top: '#7b3f10' });
  const hue = (time * 60) % 360;
  onFace(body, 'left', (W: number, H: number): void => {
    // cornice cromata ad arco
    const chrome = ctx.createLinearGradient(0, 0, W, 0);
    chrome.addColorStop(0, '#9aa5b1');
    chrome.addColorStop(0.5, '#f5f6fa');
    chrome.addColorStop(1, '#7f8c8d');
    ctx.fillStyle = chrome;
    ctx.beginPath();
    ctx.moveTo(2, H);
    ctx.lineTo(2, W / 2);
    ctx.arc(W / 2, W / 2, W / 2 - 2, Math.PI, 0);
    ctx.lineTo(W - 2, H);
    ctx.fill();
    // tubi al neon che cambiano colore
    for (let i = 0; i < 3; i++) {
      ctx.strokeStyle = `hsl(${(hue + i * 60) % 360},95%,62%)`;
      ctx.shadowColor = ctx.strokeStyle;
      ctx.shadowBlur = 8;
      ctx.lineWidth = 2.2;
      ctx.beginPath();
      ctx.arc(W / 2, W / 2, W / 2 - 5 - i * 3.5, Math.PI, 0);
      ctx.stroke();
    }
    ctx.shadowBlur = 0;
    // finestra con i dischi
    ctx.fillStyle = '#1b0f05';
    ctx.fillRect(7, W / 2 + 2, W - 14, 16);
    for (let i = 0; i < 4; i++) {
      ctx.fillStyle = '#111';
      ctx.beginPath();
      ctx.ellipse(11 + i * ((W - 22) / 3), W / 2 + 10, 3.5, 5.5, 0, 0, 6.3);
      ctx.fill();
      ctx.fillStyle = `hsl(${(hue + i * 90) % 360},80%,55%)`;
      ctx.beginPath();
      ctx.arc(11 + i * ((W - 22) / 3), W / 2 + 10, 1.4, 0, 6.3);
      ctx.fill();
    }
    // griglia dell'altoparlante che pulsa con la musica
    const beat = 0.5 + 0.5 * Math.abs(Math.sin(time * 4));
    ctx.fillStyle = '#2d1606';
    ctx.fillRect(7, H - 26, W - 14, 18);
    ctx.strokeStyle = `rgba(255,190,90,${0.3 + 0.5 * beat})`;
    ctx.lineWidth = 0.8;
    for (let v = H - 24; v < H - 9; v += 3) {
      ctx.beginPath();
      ctx.moveTo(9, v);
      ctx.lineTo(W - 9, v);
      ctx.stroke();
    }
    ctx.fillStyle = '#c9a227';
    ctx.font = 'bold 4.5px sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText(copyLabel(it), W / 2, H - 3);
  });
  onFace(body, 'right', (W: number, H: number): void => {
    const g = ctx.createLinearGradient(0, 0, 0, H);
    g.addColorStop(0, `hsl(${hue},70%,45%)`);
    g.addColorStop(1, '#3b1d08');
    ctx.fillStyle = g;
    ctx.fillRect(2, 2, W - 4, H - 4);
  });
  // note musicali che salgono
  for (let i = 0; i < 3; i++) {
    const k = (time * 0.5 + i / 3) % 1;
    const p = isoProject(x + Math.sin(time + i) * 8, y, z + 6 + k * 40);
    ctx.fillStyle = `hsla(${(hue + i * 120) % 360},90%,70%,${Math.sin(Math.PI * k)})`;
    ctx.font = `bold ${10 * s}px sans-serif`;
    ctx.textAlign = 'center';
    ctx.fillText(i % 2 ? '♫' : '♪', p.x, p.y);
  }
}
