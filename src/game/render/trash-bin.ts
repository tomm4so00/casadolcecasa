// Il cestino della stanza: un secchio a pedale d'acciaio, col coperchio e un foglio che spunta.
import { type GameValue, game } from '../context.js';
import { isoProject, isoScale } from './primitives.js';
import { box, onFace } from './objects.js';

export function drawTrashBin(it: GameValue): void {
  const ctx: GameValue = game.view.ctx;
  const s: number = isoScale();
  const H = 22;
  // il corpo, appena più stretto in basso: due blocchi sovrapposti
  box(it.x, it.y, it.w - 3, it.h - 3, 3, '#4b5560');
  const body: GameValue = box(it.x, it.y, it.w - 1, it.h - 1, H - 3, '#9aa4ad', {
    z0: 3,
    top: '#6c7a89',
  });
  for (const face of ['left', 'right'])
    onFace(body, face, (W: number, Hf: number): void => {
      // riflesso verticale dell'acciaio spazzolato
      const g = ctx.createLinearGradient(0, 0, W, 0);
      g.addColorStop(0, 'rgba(255,255,255,0)');
      g.addColorStop(0.35, 'rgba(255,255,255,0.35)');
      g.addColorStop(0.55, 'rgba(255,255,255,0)');
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, W, Hf);
      ctx.fillStyle = 'rgba(0,0,0,0.2)';
      ctx.fillRect(0, 2, W, 1);
    });
  // il coperchio, un filo più largo, con la maniglia
  box(it.x, it.y, it.w + 1, it.h + 1, 2.5, '#7f8c8d', { z0: H, top: '#b2bec3' });
  box(it.x, it.y - it.h / 2 + 3, 6, 2, 1.5, '#4b5560', { z0: H + 2.5 });
  // un foglio accartocciato che spunta da sotto il coperchio
  const p = isoProject(it.x + 2, it.y + it.h / 2 - 1, H + 1);
  ctx.fillStyle = '#f5f6fa';
  ctx.beginPath();
  ctx.moveTo(p.x - 3 * s, p.y);
  ctx.lineTo(p.x + 1 * s, p.y - 3 * s);
  ctx.lineTo(p.x + 4 * s, p.y - 0.5 * s);
  ctx.lineTo(p.x + 1 * s, p.y + 1 * s);
  ctx.closePath();
  ctx.fill();
  // il pedale davanti
  box(it.x, it.y + it.h / 2 + 1.5, 7, 3, 1.5, '#2d3436', { z0: 1 });
}
