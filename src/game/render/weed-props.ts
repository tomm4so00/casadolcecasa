// Piante di canapa: vaso in camera, barattolo dell'erba ed espositore del grow shop.
import { STRAINS, type StrainId, growProgress } from '../weed-rules.js';
import { type GameValue, game } from '../context.js';
import { isoProject, isoScale } from './primitives.js';
import { box, onFace, woodGrain } from './objects.js';

// ---------------------------------------------------------------- ERBA
/** Foglia di canapa: sette foglioline a ventaglio. */
function weedLeaf(cx: number, cy: number, size: number, angle: number, color: string): void {
  const ctx = game.view.ctx;
  ctx.fillStyle = color;
  const fan = [-1.25, -0.8, -0.4, 0, 0.4, 0.8, 1.25];
  const len = [0.45, 0.7, 0.9, 1, 0.9, 0.7, 0.45];
  fan.forEach((a, i) => {
    const ang = angle + a;
    const l = size * len[i];
    ctx.beginPath();
    ctx.ellipse(
      cx + Math.cos(ang) * l * 0.5,
      cy + Math.sin(ang) * l * 0.5,
      l * 0.5,
      l * 0.11,
      ang,
      0,
      Math.PI * 2,
    );
    ctx.fill();
  });
}

/**
 * Pianta d'erba alta in proporzione alla crescita (0-1): germoglio, poi foglie,
 * infine le cime colorate della varietà quando è quasi pronta.
 */
function drawWeedPlant(
  x: number,
  y: number,
  z0: number,
  strain: StrainId,
  progress: number,
  t: number,
): void {
  const ctx = game.view.ctx;
  const s: number = isoScale();
  const st = STRAINS[strain] || STRAINS.amnesia;
  const h = 8 + 62 * progress;
  const sway = Math.sin(t * 1.2 + x) * 1.5 * s;
  const base = isoProject(x, y, z0),
    top = isoProject(x, y, z0 + h);
  ctx.strokeStyle = game.darken(st.leaf, 0.3);
  ctx.lineWidth = Math.max(1, (1 + 2 * progress) * s);
  ctx.beginPath();
  ctx.moveTo(base.x, base.y);
  ctx.quadraticCurveTo(base.x + sway, (base.y + top.y) / 2, top.x + sway, top.y);
  ctx.stroke();
  // coppie di foglie lungo il fusto, più grandi in basso
  const pairs = 1 + Math.floor(progress * 5);
  for (let i = 0; i < pairs; i++) {
    const k = (i + 1) / (pairs + 0.5);
    const p = isoProject(x, y, z0 + h * k);
    const size = (6 + 16 * progress) * (1.15 - k * 0.6) * s;
    const leaf = i % 2 ? st.leaf : game.darken(st.leaf, 0.12);
    weedLeaf(p.x + sway * k, p.y, size, Math.PI * 0.95, leaf);
    weedLeaf(p.x + sway * k, p.y, size, Math.PI * 0.05, leaf);
  }
  weedLeaf(top.x + sway, top.y, (4 + 8 * progress) * s, -Math.PI / 2, st.leaf);
  // cime (dal 60% in poi), con i pistilli
  if (progress > 0.6) {
    const k = (progress - 0.6) / 0.4;
    for (let i = 0; i < 5; i++) {
      const p = isoProject(x, y, z0 + h * (0.45 + i * 0.13));
      const r = (2 + 3 * k) * s * (i === 4 ? 1.4 : 1);
      ctx.fillStyle = st.bud;
      ctx.beginPath();
      ctx.ellipse(p.x + sway * 0.7 + (i % 2 ? 3 : -3) * s, p.y, r, r * 1.3, 0, 0, 6.3);
      ctx.fill();
      ctx.fillStyle = st.hair;
      for (let j = 0; j < 3; j++)
        ctx.fillRect(p.x + sway * 0.7 + (j - 1) * 2 * s, p.y - r * 0.6 + j * s, 1, 1);
    }
  }
  // pronta: brilla un po'
  if (progress >= 1) {
    for (let i = 0; i < 4; i++) {
      const a = t * 2 + i * 1.6;
      const p = isoProject(
        x + Math.cos(a) * 14,
        y + Math.sin(a) * 14,
        z0 + h * 0.6 + Math.sin(a * 1.3) * 10,
      );
      ctx.fillStyle = `rgba(255,255,200,${0.5 + 0.5 * Math.sin(t * 5 + i)})`;
      ctx.fillRect(p.x - 1, p.y - 1, 2.5, 2.5);
    }
  }
}

/** Vaso con la pianta che cresce nella camera (anche quella vista dai visitatori). */
export function drawWeedPot(it?: GameValue, t?: GameValue): GameValue {
  const g = it.grow || {};
  box(it.x, it.y, 20, 20, 16, '#b5651d', { top: '#4e342e' });
  box(it.x, it.y, 23, 23, 3, '#8d4a17', { z0: 14 });
  drawWeedPlant(it.x, it.y, 17, g.s, growProgress(g.p, Date.now(), g.s), t || 0);
}

/** Barattolo di vetro con l'erba dentro: più è pieno, più sale il verde. */
export function drawWeedJar(it?: GameValue): GameValue {
  const ctx = game.view.ctx;
  const s: number = isoScale();
  const j = it.jar || { g: 0, s: 'amnesia' };
  const st = STRAINS[j.s as StrainId] || STRAINS.amnesia;
  const b = isoProject(it.x, it.y, 0),
    tp = isoProject(it.x, it.y, 22);
  const w = 9 * s;
  const fill = Math.min(1, j.g / 100);
  const hgt = b.y - tp.y;
  // erba dentro
  ctx.fillStyle = st.bud;
  ctx.fillRect(b.x - w, b.y - hgt * 0.85 * fill, w * 2, hgt * 0.85 * fill);
  for (let i = 0; i < 6 * fill; i++) {
    ctx.fillStyle = game.darken(st.leaf, 0.1);
    ctx.beginPath();
    ctx.arc(
      b.x - w * 0.6 + (i % 3) * w * 0.6,
      b.y - 3 * s - Math.floor(i / 3) * 5 * s,
      2.2 * s,
      0,
      6.3,
    );
    ctx.fill();
  }
  // vetro
  ctx.fillStyle = 'rgba(210,240,255,0.28)';
  ctx.strokeStyle = 'rgba(255,255,255,0.8)';
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.rect(b.x - w, tp.y, w * 2, hgt);
  ctx.fill();
  ctx.stroke();
  // tappo ed etichetta con i grammi
  ctx.fillStyle = '#2e7d32';
  ctx.fillRect(b.x - w - 1, tp.y - 4 * s, w * 2 + 2, 4 * s);
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(b.x - w * 0.75, tp.y + hgt * 0.3, w * 1.5, 7 * s);
  ctx.fillStyle = '#2d3436';
  ctx.font = `bold ${Math.round(5 * s)}px sans-serif`;
  ctx.textAlign = 'center';
  ctx.fillText(`${j.g} g`, b.x, tp.y + hgt * 0.3 + 5.5 * s);
}

/** Espositore del grow shop: cassetta di legno, pianta adulta e lampada viola che la illumina. */
export function drawStrainDisplay(it?: GameValue, t?: GameValue): GameValue {
  const ctx = game.view.ctx;
  const s: number = isoScale();
  const crate: GameValue = box(it.x, it.y, it.w, it.h, 22, '#a1887f');
  onFace(crate, 'left', (W: number, H: number): void => {
    woodGrain(W, H, 'rgba(60,40,20,0.3)', false, 3);
    const st = STRAINS[it.strain as StrainId];
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(W / 2 - 18, H / 2 - 6, 36, 12);
    ctx.fillStyle = '#2e7d32';
    ctx.font = 'bold 6px sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText(`${st.price} €`, W / 2, H / 2 + 2);
  });
  box(it.x, it.y, 22, 22, 14, '#b5651d', { z0: 22, top: '#4e342e' });
  drawWeedPlant(it.x, it.y, 36, it.strain, 1, t || 0);
  // lampada da coltivazione appesa
  box(it.x, it.y, 2, 2, 30, '#2d3436', { z0: 120 });
  box(it.x, it.y, 34, 18, 4, '#2d3436', { z0: 116 });
  const c = isoProject(it.x, it.y, 114);
  const pulse = 0.35 + 0.08 * Math.sin((t || 0) * 2 + it.x);
  const g = ctx.createRadialGradient(c.x, c.y, 2, c.x, c.y + 40 * s, 70 * s);
  g.addColorStop(0, `rgba(210,140,255,${pulse + 0.25})`);
  g.addColorStop(1, 'rgba(210,140,255,0)');
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.moveTo(c.x - 16 * s, c.y);
  ctx.lineTo(c.x + 16 * s, c.y);
  ctx.lineTo(c.x + 34 * s, c.y + 70 * s);
  ctx.lineTo(c.x - 34 * s, c.y + 70 * s);
  ctx.closePath();
  ctx.fill();
}
