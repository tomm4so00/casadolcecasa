// Studio di pittura: cavalletto e tavolo dei colori.
import { type GameValue, game } from '../context.js';
import { isoProject, isoScale, rnd } from './primitives.js';
import { box, onFace } from './objects.js';

// ---------------------------------------------------------------- LABORATORIO ARTISTICO
const ART_COLORS = ['#e74c3c', '#f1c40f', '#2e86de', '#2ecc71', '#8e44ad', '#e67e22', '#fd79a8'];

// Cavalletto con una tela già iniziata, la mensola dei colori e un barattolo di pennelli.
export function drawEasel(it?: GameValue, t?: GameValue): GameValue {
  const ctx: GameValue = game.view.ctx;
  const seed: number = it.seed || 1;
  const wood = '#a0703f';
  const { x, y } = it;
  // tre gambe del cavalletto
  box(x - 12, y + 4, 3, 3, 70, wood);
  box(x + 12, y + 4, 3, 3, 70, wood);
  box(x, y - 8, 3, 3, 76, game.darken(wood, 0.15));
  box(x, y + 4, 30, 4, 3, game.darken(wood, 0.1), { z0: 24 });
  // tela
  const canvasBox: GameValue = box(x, y + 2, 30, 2, 30, '#f5f6fa', { z0: 30 });
  onFace(canvasBox, 'left', (W?: GameValue, H?: GameValue): GameValue => {
    ctx.fillStyle = '#fdfdfd';
    ctx.fillRect(1, 1, W - 2, H - 2);
    for (let i = 0; i < 6; i++) {
      ctx.fillStyle = ART_COLORS[(seed * 3 + i) % ART_COLORS.length];
      ctx.globalAlpha = 0.85;
      ctx.beginPath();
      ctx.ellipse(
        3 + rnd(seed * 10 + i) * (W - 6),
        3 + rnd(seed * 20 + i) * (H - 6),
        2 + rnd(seed * 30 + i) * 5,
        1.5 + rnd(seed * 40 + i) * 4,
        rnd(i) * 3,
        0,
        6.3,
      );
      ctx.fill();
    }
    ctx.globalAlpha = 1;
    ctx.strokeStyle = 'rgba(0,0,0,0.25)';
    ctx.lineWidth = 0.6;
    ctx.strokeRect(0.5, 0.5, W - 1, H - 1);
  });
  box(x, y + 2, 34, 6, 2, wood, { z0: 28 });
  // tavolozza appoggiata sulla mensola, con un po' di colore che brilla
  const pal = isoProject(x + 8, y + 5, 31);
  const s: GameValue = isoScale();
  ctx.fillStyle = '#deb887';
  ctx.beginPath();
  ctx.ellipse(pal.x, pal.y, 6 * s, 2.6 * s, 0, 0, 6.3);
  ctx.fill();
  for (let i = 0; i < 4; i++) {
    ctx.fillStyle = ART_COLORS[(seed + i) % ART_COLORS.length];
    ctx.beginPath();
    ctx.arc(pal.x + (i - 1.5) * 2.6 * s, pal.y - 0.4 * s, 0.9 * s, 0, 6.3);
    ctx.fill();
  }
  // barattolo con i pennelli
  box(x - 9, y + 5, 4, 4, 5, '#74b9ff', { z0: 30 });
  for (let i = 0; i < 3; i++) {
    const a = isoProject(x - 9 + (i - 1), y + 5, 35);
    const b = isoProject(x - 9 + (i - 1) * 2.4, y + 5, 42 + Math.sin((t || 0) * 0.8 + i) * 0.3);
    ctx.strokeStyle = '#6d4c41';
    ctx.lineWidth = 1 * s;
    ctx.beginPath();
    ctx.moveTo(a.x, a.y);
    ctx.lineTo(b.x, b.y);
    ctx.stroke();
    ctx.fillStyle = ART_COLORS[(seed + i * 2) % ART_COLORS.length];
    ctx.beginPath();
    ctx.arc(b.x, b.y, 1.2 * s, 0, 6.3);
    ctx.fill();
  }
}

// Tavolo da lavoro con barattoli di colore, tubetti e un rotolo di carta.
export function drawPaintTableProp(it?: GameValue): GameValue {
  const ctx: GameValue = game.view.ctx;
  const seed: number = it.seed || 1;
  [
    [-1, -1],
    [1, -1],
    [-1, 1],
    [1, 1],
  ].forEach(([sx, sy]) =>
    box(it.x + sx * (it.w / 2 - 4), it.y + sy * (it.h / 2 - 4), 4, 4, it.z - 5, '#6d4c41'),
  );
  const top: GameValue = box(it.x, it.y, it.w, it.h, 5, '#c8a27a', { z0: it.z - 5 });
  onFace(top, 'top', (W?: GameValue, H?: GameValue): GameValue => {
    // macchie di colore sul piano
    for (let i = 0; i < 7; i++) {
      ctx.fillStyle = ART_COLORS[(seed + i) % ART_COLORS.length];
      ctx.globalAlpha = 0.5;
      ctx.beginPath();
      ctx.arc(rnd(seed * 7 + i) * W, rnd(seed * 9 + i) * H, 1 + rnd(i + seed) * 2.5, 0, 6.3);
      ctx.fill();
    }
    ctx.globalAlpha = 1;
  });
  for (let i = 0; i < 4; i++) {
    const c = ART_COLORS[(seed * 2 + i) % ART_COLORS.length];
    const pot: GameValue = box(it.x - it.w * 0.32 + i * 9, it.y - 6, 7, 7, 8, '#ecf0f1', {
      z0: it.z,
    });
    onFace(pot, 'top', (W?: GameValue, H?: GameValue): GameValue => {
      ctx.fillStyle = c;
      ctx.fillRect(1, 1, W - 2, H - 2);
    });
  }
  // tubetti
  for (let i = 0; i < 3; i++)
    box(
      it.x + it.w * 0.18 + i * 6,
      it.y + 8,
      3,
      9,
      3,
      ART_COLORS[(seed + i + 3) % ART_COLORS.length],
      {
        z0: it.z,
      },
    );
  // rotolo di carta
  box(it.x + it.w * 0.3, it.y - 8, 14, 6, 6, '#fdfefe', { z0: it.z });
}
