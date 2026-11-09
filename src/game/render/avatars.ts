import { drawSparkles } from './limited-props.js';
import type { GameValue } from '../context.js';
import { game } from '../context.js';
import { lifetime, dom } from '../runtime.js';
import { bodyFromName, currentBody, drawAvatarPreview, resolveLook } from '../character.js';
import { sfx } from '../audio.js';
import { saveGame } from '../saves.js';
import { isoProject, isoScale, rnd, rotateAround, rotateVector, toRgb } from './primitives.js';
import { CHAIR_SEAT_Z, box, onFace, withFurnitureRotation } from './objects.js';
import { nameHash } from './scenes.js';
// ---------- piccoli aiuti per il disegno dei vestiti ----------
type Pt = { x: number; y: number };
/** Una direzione nel piano del pavimento (x, y). */
type Dir = [number, number];
/** Altezza della seduta delle panchine (render/objects.ts, drawBenchProp). */
const BENCH_SEAT_Z = 14.5;
/** Scarpe che lasciano scoperto il collo del piede. */
const OPEN_SHOES = new Set(['heels', 'sandals', 'barefoot']);
/** Mani dell'ultimo disegno di ogni personaggio, per posizione a terra (servono al guinzaglio). */
const handsAt = new Map<string, [Pt, Pt]>();
export const handsOf = (x: number, y: number): [Pt, Pt] | undefined => handsAt.get(x + ',' + y);
const lerpPt = (a: Pt, b: Pt, k: number): Pt => ({
  x: a.x + (b.x - a.x) * k,
  y: a.y + (b.y - a.y) * k,
});

/**
 * Dove vanno le mani al lavandino del bagno: sotto il getto del rubinetto, ma non più lontano di
 * quanto arrivano le braccia dalle spalle.
 */
function underTap(neck: Pt, s: number): Pt | null {
  const sk: GameValue = game.bathroomFurniture?.sink;
  if (!sk || game.view.activeEnvironment !== 'BATHROOM') return null;
  const p = isoProject(sk.x, sk.y - sk.h / 2 + 13, sk.z + 3);
  const sh = { x: neck.x, y: neck.y + 3 * s };
  const d = Math.hypot(p.x - sh.x, p.y - sh.y),
    reach = 22 * s;
  return d <= reach ? p : lerpPt(sh, p, reach / d);
}
function seg(a: Pt, b: Pt, color: string, width: number): void {
  const ctx = game.view.ctx;
  ctx.strokeStyle = color;
  ctx.lineWidth = width;
  ctx.beginPath();
  ctx.moveTo(a.x, a.y);
  ctx.lineTo(b.x, b.y);
  ctx.stroke();
}
function dot(x: number, y: number, r: number, color: string): void {
  const ctx = game.view.ctx;
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.arc(x, y, r, 0, 6.3);
  ctx.fill();
}
function starPath(cx: number, cy: number, r: number, inner = 0.45, points = 5): void {
  const ctx = game.view.ctx;
  ctx.beginPath();
  for (let i = 0; i < points * 2; i++) {
    const rr = i % 2 ? r * inner : r;
    const a = -Math.PI / 2 + (i * Math.PI) / points;
    const px = cx + Math.cos(a) * rr,
      py = cy + Math.sin(a) * rr;
    if (i === 0) ctx.moveTo(px, py);
    else ctx.lineTo(px, py);
  }
  ctx.closePath();
}
function lensShine(x: number, y: number, s: number): void {
  const ctx = game.view.ctx;
  ctx.strokeStyle = 'rgba(255,255,255,0.7)';
  ctx.lineWidth = 0.6 * s;
  ctx.beginPath();
  ctx.moveTo(x - 1.2 * s, y + 0.2 * s);
  ctx.lineTo(x - 0.2 * s, y - 0.9 * s);
  ctx.stroke();
}

export function heartPath(cx?: GameValue, cy?: GameValue, r?: GameValue): GameValue {
  const ctx = game.view.ctx;
  ctx.beginPath();
  ctx.moveTo(cx, cy + r * 0.9);
  ctx.bezierCurveTo(cx - r * 1.5, cy - r * 0.2, cx - r * 0.6, cy - r * 1.3, cx, cy - r * 0.35);
  ctx.bezierCurveTo(cx + r * 0.6, cy - r * 1.3, cx + r * 1.5, cy - r * 0.2, cx, cy + r * 0.9);
  ctx.closePath();
}

export function drawGlasses(head?: GameValue, s?: GameValue, gl?: GameValue): GameValue {
  if (!gl) return;
  const ctx = game.view.ctx;
  const hx = head.x,
    hy = head.y;
  const ey = hy + 1 * s; // altezza degli occhi
  const eyes = [-3.4, 3.4];
  ctx.lineCap = 'round';
  switch (gl.style) {
    case 'round':
      ctx.fillStyle = 'rgba(200,230,255,0.25)';
      for (const dx of eyes) {
        ctx.beginPath();
        ctx.arc(hx + dx * s, ey, 2.4 * s, 0, 6.3);
        ctx.fill();
      }
      ctx.strokeStyle = gl.color;
      ctx.lineWidth = 1.1 * s;
      for (const dx of eyes) {
        ctx.beginPath();
        ctx.arc(hx + dx * s, ey, 2.8 * s, 0, 6.3);
        ctx.stroke();
        lensShine(hx + dx * s, ey, s);
      }
      seg(
        { x: hx - 0.7 * s, y: ey - 0.3 * s },
        { x: hx + 0.7 * s, y: ey - 0.3 * s },
        gl.color,
        1 * s,
      );
      break;
    case 'heart':
      ctx.fillStyle = gl.color;
      for (const dx of [-3.5, 3.5]) {
        heartPath(hx + dx * s, ey + 0.2 * s, 3 * s);
        ctx.fill();
      }
      ctx.strokeStyle = game.darken(gl.color, 0.35);
      ctx.lineWidth = 0.6 * s;
      for (const dx of [-3.5, 3.5]) {
        heartPath(hx + dx * s, ey + 0.2 * s, 3 * s);
        ctx.stroke();
      }
      dot(hx - 4.4 * s, ey - 0.8 * s, 0.7 * s, 'rgba(255,255,255,0.6)');
      dot(hx + 2.6 * s, ey - 0.8 * s, 0.7 * s, 'rgba(255,255,255,0.6)');
      break;
    case 'square':
      ctx.fillStyle = 'rgba(200,230,255,0.22)';
      for (const dx of eyes) ctx.fillRect(hx + (dx - 2.8) * s, ey - 2 * s, 5.6 * s, 4.2 * s);
      ctx.strokeStyle = gl.color;
      ctx.lineWidth = 1.3 * s;
      for (const dx of eyes) ctx.strokeRect(hx + (dx - 2.8) * s, ey - 2 * s, 5.6 * s, 4.2 * s);
      seg(
        { x: hx - 0.6 * s, y: ey - 0.8 * s },
        { x: hx + 0.6 * s, y: ey - 0.8 * s },
        gl.color,
        1.1 * s,
      );
      for (const dx of eyes) lensShine(hx + dx * s, ey, s);
      break;
    case '3d':
      ctx.fillStyle = '#f5f6fa';
      ctx.fillRect(hx - 7.5 * s, ey - 2.4 * s, 15 * s, 4.8 * s);
      ctx.fillStyle = 'rgba(231,76,60,0.85)';
      ctx.fillRect(hx - 6.4 * s, ey - 1.6 * s, 5.2 * s, 3.2 * s);
      ctx.fillStyle = 'rgba(0,206,201,0.85)';
      ctx.fillRect(hx + 1.2 * s, ey - 1.6 * s, 5.2 * s, 3.2 * s);
      ctx.strokeStyle = 'rgba(0,0,0,0.35)';
      ctx.lineWidth = 0.5 * s;
      ctx.strokeRect(hx - 7.5 * s, ey - 2.4 * s, 15 * s, 4.8 * s);
      break;
    case 'star':
      for (const dx of [-3.6, 3.6]) {
        starPath(hx + dx * s, ey, 3.6 * s);
        ctx.fillStyle = gl.color;
        ctx.fill();
        ctx.strokeStyle = game.darken(gl.color, 0.35);
        ctx.lineWidth = 0.6 * s;
        ctx.stroke();
        dot(hx + dx * s, ey, 1.5 * s, 'rgba(40,40,60,0.75)');
        dot(hx + (dx - 0.5) * s, ey - 0.5 * s, 0.45 * s, 'rgba(255,255,255,0.8)');
      }
      break;
    case 'cateye':
      for (const side of [-1, 1]) {
        const cx = hx + side * 3.4 * s;
        ctx.beginPath();
        ctx.moveTo(cx - side * 2.4 * s, ey + 1.6 * s);
        ctx.quadraticCurveTo(cx - side * 2.8 * s, ey - 1.4 * s, cx, ey - 1.6 * s);
        ctx.lineTo(cx + side * 3.6 * s, ey - 2.8 * s);
        ctx.quadraticCurveTo(cx + side * 2.8 * s, ey + 1.8 * s, cx - side * 2.4 * s, ey + 1.6 * s);
        ctx.closePath();
        ctx.fillStyle = 'rgba(45,10,40,0.72)';
        ctx.fill();
        ctx.strokeStyle = gl.color;
        ctx.lineWidth = 1.1 * s;
        ctx.stroke();
        lensShine(cx, ey, s);
      }
      seg(
        { x: hx - 0.9 * s, y: ey - 0.6 * s },
        { x: hx + 0.9 * s, y: ey - 0.6 * s },
        gl.color,
        0.9 * s,
      );
      break;
    case 'aviator':
      for (const side of [-1, 1]) {
        const cx = hx + side * 3.5 * s;
        const g = ctx.createLinearGradient(0, ey - 2 * s, 0, ey + 3 * s);
        g.addColorStop(0, 'rgba(60,40,20,0.9)');
        g.addColorStop(1, 'rgba(210,150,60,0.75)');
        ctx.beginPath();
        ctx.moveTo(cx - 2.8 * s, ey - 1.6 * s);
        ctx.lineTo(cx + 2.8 * s, ey - 1.6 * s);
        ctx.quadraticCurveTo(cx + 3 * s, ey + 3.4 * s, cx + side * 0.5 * s, ey + 3 * s);
        ctx.quadraticCurveTo(cx - 3 * s, ey + 2.6 * s, cx - 2.8 * s, ey - 1.6 * s);
        ctx.closePath();
        ctx.fillStyle = g;
        ctx.fill();
        ctx.strokeStyle = gl.color;
        ctx.lineWidth = 0.6 * s;
        ctx.stroke();
        lensShine(cx, ey + 0.3 * s, s);
      }
      seg(
        { x: hx - 0.7 * s, y: ey - 1.6 * s },
        { x: hx + 0.7 * s, y: ey - 1.6 * s },
        gl.color,
        0.6 * s,
      );
      seg(
        { x: hx - 0.7 * s, y: ey - 0.2 * s },
        { x: hx + 0.7 * s, y: ey - 0.2 * s },
        gl.color,
        0.5 * s,
      );
      break;
    case 'goggles': {
      ctx.fillStyle = gl.color2 || '#2d3436';
      ctx.fillRect(hx - 9.2 * s, ey - 1.3 * s, 18.4 * s, 2.6 * s);
      const g = ctx.createLinearGradient(hx - 7 * s, 0, hx + 7 * s, 0);
      g.addColorStop(0, gl.color);
      g.addColorStop(1, gl.color2 || '#6c5ce7');
      ctx.beginPath();
      ctx.roundRect
        ? ctx.roundRect(hx - 7 * s, ey - 3 * s, 14 * s, 6 * s, 3 * s)
        : ctx.rect(hx - 7 * s, ey - 3 * s, 14 * s, 6 * s);
      ctx.fillStyle = g;
      ctx.fill();
      ctx.strokeStyle = '#1e272e';
      ctx.lineWidth = 1 * s;
      ctx.stroke();
      seg(
        { x: hx - 4.5 * s, y: ey + 1 * s },
        { x: hx - 1.5 * s, y: ey - 2 * s },
        'rgba(255,255,255,0.65)',
        0.8 * s,
      );
      break;
    }
    case 'monocle':
      ctx.fillStyle = 'rgba(200,230,255,0.25)';
      ctx.beginPath();
      ctx.arc(hx + 3.4 * s, ey, 2.7 * s, 0, 6.3);
      ctx.fill();
      ctx.strokeStyle = gl.color;
      ctx.lineWidth = 1 * s;
      ctx.stroke();
      lensShine(hx + 3.4 * s, ey, s);
      ctx.lineWidth = 0.45 * s;
      ctx.setLineDash([0.9 * s, 0.6 * s]);
      ctx.beginPath();
      ctx.moveTo(hx + 5.2 * s, ey + 2 * s);
      ctx.quadraticCurveTo(hx + 8 * s, ey + 8 * s, hx + 6 * s, ey + 13 * s);
      ctx.stroke();
      ctx.setLineDash([]);
      break;
    default: {
      // occhiali da sole
      ctx.fillStyle = gl.color || '#111';
      ctx.fillRect(hx - 7.5 * s, ey - 1.5 * s, 15 * s, 1.4 * s);
      for (const dx of [-4, 4]) {
        const g = ctx.createLinearGradient(0, ey - 1.5 * s, 0, ey + 2.4 * s);
        g.addColorStop(0, '#111');
        g.addColorStop(1, '#3d4a5c');
        ctx.fillStyle = g;
        ctx.beginPath();
        ctx.moveTo(hx + (dx - 2.8) * s, ey - 1.5 * s);
        ctx.lineTo(hx + (dx + 2.8) * s, ey - 1.5 * s);
        ctx.quadraticCurveTo(hx + (dx + 2.6) * s, ey + 2.6 * s, hx + dx * s, ey + 2.4 * s);
        ctx.quadraticCurveTo(hx + (dx - 2.6) * s, ey + 2.6 * s, hx + (dx - 2.8) * s, ey - 1.5 * s);
        ctx.fill();
        seg(
          { x: hx + (dx - 1.6) * s, y: ey + 0.8 * s },
          { x: hx + (dx - 0.4) * s, y: ey - 0.6 * s },
          'rgba(120,200,255,0.6)',
          0.6 * s,
        );
      }
    }
  }
}

// Altezza del cappello sopra la testa, per spostare in alto la targhetta col nome.
const HAT_TAG_HEIGHT: Record<string, number> = {
  tophat: 40,
  space: 40,
  chef: 40,
  party: 42,
  santa: 37,
  flowers: 34,
};

export function drawHat(head?: GameValue, s?: GameValue, hat?: GameValue): GameValue {
  if (!hat) return;
  const ctx = game.view.ctx;
  const c: GameValue = hat.color;
  const c2: GameValue = hat.color2 || '#ffffff';
  const hx = head.x,
    hy = head.y;
  ctx.lineCap = 'round';
  switch (hat.style) {
    case 'space':
      // la bolla di vetro si disegna dopo il viso (vedi drawPlayerAvatar)
      break;
    case 'beanie': {
      const g = ctx.createLinearGradient(hx - 10 * s, 0, hx + 10 * s, 0);
      g.addColorStop(0, game.lighten(c, 0.12));
      g.addColorStop(1, game.darken(c, 0.15));
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.arc(hx, hy - 2.5 * s, 9.9 * s, Math.PI, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = game.darken(c, 0.25);
      ctx.lineWidth = 0.8 * s;
      for (let i = -3; i <= 3; i++)
        seg(
          { x: hx + i * 2.4 * s, y: hy - 4 * s },
          { x: hx + i * 1.6 * s, y: hy - 11 * s },
          game.darken(c, 0.25),
          0.8 * s,
        );
      ctx.fillStyle = game.darken(c, 0.2);
      ctx.fillRect(hx - 9.9 * s, hy - 5 * s, 19.8 * s, 3.8 * s);
      for (let i = -4; i <= 4; i++)
        seg(
          { x: hx + i * 2.2 * s, y: hy - 4.6 * s },
          { x: hx + i * 2.2 * s, y: hy - 1.6 * s },
          game.darken(c, 0.32),
          0.6 * s,
        );
      dot(hx, hy - 13 * s, 2.7 * s, '#ffffff');
      dot(hx - 0.8 * s, hy - 13.8 * s, 1 * s, 'rgba(255,255,255,0.6)');
      break;
    }
    case 'cowboy':
      ctx.fillStyle = game.darken(c, 0.15);
      ctx.beginPath();
      ctx.ellipse(hx, hy - 5 * s, 15.5 * s, 4.3 * s, 0, 0, 6.3);
      ctx.fill();
      ctx.fillStyle = c;
      ctx.beginPath();
      ctx.moveTo(hx - 7.5 * s, hy - 6 * s);
      ctx.quadraticCurveTo(hx - 8 * s, hy - 17 * s, hx - 2 * s, hy - 15 * s);
      ctx.lineTo(hx, hy - 13 * s);
      ctx.lineTo(hx + 2 * s, hy - 15 * s);
      ctx.quadraticCurveTo(hx + 8 * s, hy - 17 * s, hx + 7.5 * s, hy - 6 * s);
      ctx.closePath();
      ctx.fill();
      ctx.fillStyle = '#3e2723';
      ctx.fillRect(hx - 7.5 * s, hy - 8.5 * s, 15 * s, 2.2 * s);
      dot(hx + 4.5 * s, hy - 7.4 * s, 0.9 * s, '#dfe6e9');
      break;
    case 'tophat':
      ctx.fillStyle = '#111111';
      ctx.beginPath();
      ctx.ellipse(hx, hy - 6 * s, 12.5 * s, 3.2 * s, 0, 0, 6.3);
      ctx.fill();
      ctx.fillRect(hx - 7 * s, hy - 26 * s, 14 * s, 20 * s);
      ctx.beginPath();
      ctx.ellipse(hx, hy - 26 * s, 7 * s, 2 * s, 0, 0, 6.3);
      ctx.fillStyle = '#2d2d2d';
      ctx.fill();
      ctx.fillStyle = hat.color2 || '#c0392b';
      ctx.fillRect(hx - 7 * s, hy - 11 * s, 14 * s, 3 * s);
      ctx.fillStyle = 'rgba(255,255,255,0.14)';
      ctx.fillRect(hx - 5 * s, hy - 25 * s, 2 * s, 13 * s);
      break;
    case 'crown': {
      const g = ctx.createLinearGradient(0, hy - 18 * s, 0, hy - 7 * s);
      g.addColorStop(0, '#fff3a0');
      g.addColorStop(0.5, '#f1c40f');
      g.addColorStop(1, '#b7950b');
      ctx.fillStyle = g;
      ctx.strokeStyle = '#9a7d0a';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(hx - 8 * s, hy - 7 * s);
      ctx.lineTo(hx - 8 * s, hy - 16 * s);
      ctx.lineTo(hx - 4 * s, hy - 11 * s);
      ctx.lineTo(hx, hy - 18 * s);
      ctx.lineTo(hx + 4 * s, hy - 11 * s);
      ctx.lineTo(hx + 8 * s, hy - 16 * s);
      ctx.lineTo(hx + 8 * s, hy - 7 * s);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
      dot(hx, hy - 10 * s, 1.5 * s, '#e74c3c');
      dot(hx - 5 * s, hy - 9 * s, 1 * s, '#0984e3');
      dot(hx + 5 * s, hy - 9 * s, 1 * s, '#00b894');
      for (const [px, py] of [
        [-8, -16],
        [0, -18],
        [8, -16],
      ])
        dot(hx + px * s, hy + py * s, 1 * s, '#fff3a0');
      break;
    }
    case 'capback':
      ctx.fillStyle = game.darken(c, 0.25);
      ctx.beginPath();
      ctx.ellipse(hx - 7 * s, hy - 6.5 * s, 6 * s, 1.8 * s, -0.5, 0, 6.3);
      ctx.fill();
      ctx.fillStyle = c;
      ctx.beginPath();
      ctx.arc(hx, hy - 3 * s, 9.6 * s, Math.PI, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = game.lighten(c, 0.15);
      ctx.beginPath();
      ctx.arc(hx, hy - 3 * s, 9.6 * s, Math.PI * 1.15, Math.PI * 1.45);
      ctx.lineTo(hx, hy - 3 * s);
      ctx.fill();
      // apertura della regolazione sul davanti
      ctx.fillStyle = 'rgba(0,0,0,0.35)';
      ctx.beginPath();
      ctx.arc(hx, hy - 3 * s, 2.6 * s, Math.PI, Math.PI * 2);
      ctx.fill();
      dot(hx, hy - 12.4 * s, 1.3 * s, game.darken(c, 0.2));
      break;
    case 'beret':
      ctx.fillStyle = game.darken(c, 0.2);
      ctx.fillRect(hx - 8.5 * s, hy - 7 * s, 17 * s, 2.4 * s);
      ctx.fillStyle = c;
      ctx.beginPath();
      ctx.ellipse(hx + 1.5 * s, hy - 9 * s, 11.5 * s, 4.8 * s, -0.14, 0, 6.3);
      ctx.fill();
      ctx.fillStyle = 'rgba(255,255,255,0.12)';
      ctx.beginPath();
      ctx.ellipse(hx - 1.5 * s, hy - 10.5 * s, 6 * s, 2 * s, -0.14, 0, 6.3);
      ctx.fill();
      seg(
        { x: hx + 1.5 * s, y: hy - 13.5 * s },
        { x: hx + 2.2 * s, y: hy - 16 * s },
        game.darken(c, 0.2),
        1.2 * s,
      );
      break;
    case 'bucket':
      ctx.fillStyle = game.darken(c, 0.12);
      ctx.beginPath();
      ctx.ellipse(hx, hy - 5.5 * s, 13 * s, 4 * s, 0, 0, 6.3);
      ctx.fill();
      ctx.strokeStyle = game.darken(c, 0.3);
      ctx.lineWidth = 0.5 * s;
      ctx.beginPath();
      ctx.ellipse(hx, hy - 5.5 * s, 11 * s, 3.1 * s, 0, 0, 6.3);
      ctx.stroke();
      ctx.fillStyle = c;
      ctx.beginPath();
      ctx.moveTo(hx - 8 * s, hy - 6 * s);
      ctx.lineTo(hx - 6.5 * s, hy - 14.5 * s);
      ctx.quadraticCurveTo(hx, hy - 16 * s, hx + 6.5 * s, hy - 14.5 * s);
      ctx.lineTo(hx + 8 * s, hy - 6 * s);
      ctx.closePath();
      ctx.fill();
      ctx.fillStyle = game.darken(c, 0.2);
      ctx.fillRect(hx - 7.7 * s, hy - 8.6 * s, 15.4 * s, 1.8 * s);
      ctx.fillStyle = 'rgba(255,255,255,0.18)';
      ctx.fillRect(hx - 5 * s, hy - 14 * s, 2 * s, 5 * s);
      break;
    case 'santa':
      ctx.fillStyle = c;
      ctx.beginPath();
      ctx.moveTo(hx - 9 * s, hy - 5 * s);
      ctx.quadraticCurveTo(hx - 6 * s, hy - 20 * s, hx + 6 * s, hy - 19 * s);
      ctx.quadraticCurveTo(hx + 12 * s, hy - 17 * s, hx + 13 * s, hy - 10 * s);
      ctx.quadraticCurveTo(hx + 9 * s, hy - 13 * s, hx + 9 * s, hy - 5 * s);
      ctx.closePath();
      ctx.fill();
      ctx.fillStyle = 'rgba(0,0,0,0.15)';
      ctx.beginPath();
      ctx.moveTo(hx + 3 * s, hy - 18 * s);
      ctx.quadraticCurveTo(hx + 10 * s, hy - 16 * s, hx + 13 * s, hy - 10 * s);
      ctx.quadraticCurveTo(hx + 9 * s, hy - 13 * s, hx + 6 * s, hy - 12 * s);
      ctx.fill();
      ctx.fillStyle = '#f5f6fa';
      ctx.beginPath();
      ctx.roundRect
        ? ctx.roundRect(hx - 10.5 * s, hy - 8 * s, 21 * s, 4.4 * s, 2.2 * s)
        : ctx.rect(hx - 10.5 * s, hy - 8 * s, 21 * s, 4.4 * s);
      ctx.fill();
      dot(hx + 13 * s, hy - 9.5 * s, 2.6 * s, '#f5f6fa');
      break;
    case 'chef':
      ctx.fillStyle = '#ffffff';
      ctx.strokeStyle = '#ced6e0';
      ctx.lineWidth = 0.6 * s;
      for (const [px, py, r] of [
        [-5, -17, 5.2],
        [5, -17, 5.2],
        [0, -21, 5.8],
      ]) {
        ctx.beginPath();
        ctx.arc(hx + px * s, hy + py * s, r * s, 0, 6.3);
        ctx.fill();
        ctx.stroke();
      }
      ctx.fillRect(hx - 8 * s, hy - 15 * s, 16 * s, 9 * s);
      ctx.strokeRect(hx - 8 * s, hy - 11 * s, 16 * s, 5 * s);
      for (let i = -2; i <= 2; i++)
        seg(
          { x: hx + i * 2.8 * s, y: hy - 14 * s },
          { x: hx + i * 2.8 * s, y: hy - 11.5 * s },
          '#dfe4ea',
          0.5 * s,
        );
      break;
    case 'party': {
      ctx.save();
      ctx.beginPath();
      ctx.moveTo(hx - 6 * s, hy - 7 * s);
      ctx.lineTo(hx + 6 * s, hy - 7 * s);
      ctx.lineTo(hx + 1 * s, hy - 25 * s);
      ctx.closePath();
      ctx.fillStyle = c;
      ctx.fill();
      ctx.clip();
      ctx.fillStyle = c2;
      for (let i = 0; i < 6; i++) {
        ctx.beginPath();
        ctx.moveTo(hx - 10 * s, hy - (6 + i * 4) * s);
        ctx.lineTo(hx + 10 * s, hy - (10 + i * 4) * s);
        ctx.lineTo(hx + 10 * s, hy - (11.5 + i * 4) * s);
        ctx.lineTo(hx - 10 * s, hy - (7.5 + i * 4) * s);
        ctx.fill();
      }
      ctx.restore();
      for (let i = 0; i < 6; i++) {
        const a = (i / 6) * Math.PI * 2;
        seg(
          { x: hx + 1 * s, y: hy - 25 * s },
          { x: hx + 1 * s + Math.cos(a) * 2.6 * s, y: hy - 25 * s + Math.sin(a) * 2.6 * s },
          i % 2 ? c2 : '#ff7675',
          1 * s,
        );
      }
      break;
    }
    case 'bandana':
      ctx.fillStyle = c;
      ctx.beginPath();
      ctx.arc(hx, hy - 2 * s, 9.7 * s, Math.PI, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = game.darken(c, 0.2);
      ctx.fillRect(hx - 9.7 * s, hy - 3.6 * s, 19.4 * s, 1.8 * s);
      for (const [px, py] of [
        [-5, -7],
        [0, -9],
        [5, -7],
        [-2.5, -4.8],
        [3, -5],
      ])
        dot(hx + px * s, hy + py * s, 0.7 * s, '#ffffff');
      ctx.fillStyle = game.darken(c, 0.12);
      ctx.beginPath();
      ctx.moveTo(hx + 9 * s, hy - 3 * s);
      ctx.lineTo(hx + 14 * s, hy - 1 * s);
      ctx.lineTo(hx + 12 * s, hy + 2 * s);
      ctx.closePath();
      ctx.fill();
      ctx.beginPath();
      ctx.moveTo(hx + 9 * s, hy - 3 * s);
      ctx.lineTo(hx + 13 * s, hy - 6 * s);
      ctx.lineTo(hx + 14.5 * s, hy - 3 * s);
      ctx.closePath();
      ctx.fill();
      break;
    case 'flowers': {
      const colors = [c2, '#fdcb6e', '#74b9ff', '#ffffff'];
      for (let i = 0; i <= 8; i++) {
        const a = Math.PI + 0.25 + (i / 8) * (Math.PI - 0.5);
        const fx = hx + Math.cos(a) * 9 * s,
          fy = hy - 2.5 * s + Math.sin(a) * 7 * s;
        if (i % 2) {
          ctx.fillStyle = c;
          ctx.beginPath();
          ctx.ellipse(fx, fy, 2 * s, 1 * s, a, 0, 6.3);
          ctx.fill();
          continue;
        }
        const col = colors[(i / 2) % colors.length];
        for (let p = 0; p < 5; p++) {
          const pa = (p / 5) * Math.PI * 2;
          dot(fx + Math.cos(pa) * 1.4 * s, fy + Math.sin(pa) * 1.4 * s, 1.1 * s, col);
        }
        dot(fx, fy, 0.8 * s, '#f9ca24');
      }
      break;
    }
    case 'fedora':
      ctx.fillStyle = game.darken(c, 0.18);
      ctx.beginPath();
      ctx.ellipse(hx, hy - 6 * s, 13.5 * s, 3.6 * s, 0, 0, 6.3);
      ctx.fill();
      ctx.fillStyle = c;
      ctx.beginPath();
      ctx.moveTo(hx - 7.4 * s, hy - 6 * s);
      ctx.lineTo(hx - 6.8 * s, hy - 15 * s);
      ctx.quadraticCurveTo(hx, hy - 12 * s, hx + 6.8 * s, hy - 15 * s);
      ctx.lineTo(hx + 7.4 * s, hy - 6 * s);
      ctx.closePath();
      ctx.fill();
      ctx.fillStyle = c2;
      ctx.fillRect(hx - 7.3 * s, hy - 9.8 * s, 14.6 * s, 2.6 * s);
      ctx.fillStyle = 'rgba(255,255,255,0.12)';
      ctx.fillRect(hx - 5.5 * s, hy - 14 * s, 1.8 * s, 4 * s);
      // piuma
      ctx.fillStyle = '#e17055';
      ctx.beginPath();
      ctx.ellipse(hx + 6.8 * s, hy - 11 * s, 1.2 * s, 3.6 * s, 0.5, 0, 6.3);
      ctx.fill();
      break;
    case 'headphones': {
      ctx.strokeStyle = c;
      ctx.lineWidth = 2.2 * s;
      ctx.beginPath();
      ctx.arc(hx, hy - 1 * s, 10.6 * s, Math.PI + 0.2, Math.PI * 2 - 0.2);
      ctx.stroke();
      ctx.strokeStyle = 'rgba(255,255,255,0.25)';
      ctx.lineWidth = 0.6 * s;
      ctx.beginPath();
      ctx.arc(hx, hy - 1 * s, 10.6 * s, Math.PI + 0.5, Math.PI * 1.5);
      ctx.stroke();
      for (const side of [-1, 1]) {
        const cx = hx + side * 9.8 * s;
        ctx.fillStyle = c;
        ctx.beginPath();
        ctx.ellipse(cx, hy + 0.5 * s, 2.8 * s, 4.2 * s, 0, 0, 6.3);
        ctx.fill();
        ctx.strokeStyle = c2;
        ctx.lineWidth = 0.9 * s;
        ctx.beginPath();
        ctx.ellipse(cx, hy + 0.5 * s, 1.8 * s, 3 * s, 0, 0, 6.3);
        ctx.stroke();
      }
      break;
    }
    default: // cappellino da baseball
      ctx.fillStyle = c;
      ctx.beginPath();
      ctx.arc(hx, hy - 3 * s, 9.6 * s, Math.PI, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = game.lighten(c, 0.15);
      ctx.beginPath();
      ctx.arc(hx, hy - 3 * s, 9.6 * s, Math.PI * 1.15, Math.PI * 1.45);
      ctx.lineTo(hx, hy - 3 * s);
      ctx.fill();
      ctx.strokeStyle = game.darken(c, 0.25);
      ctx.lineWidth = 0.5 * s;
      ctx.beginPath();
      ctx.moveTo(hx, hy - 12.6 * s);
      ctx.lineTo(hx, hy - 3 * s);
      ctx.stroke();
      ctx.fillStyle = game.darken(c, 0.2);
      ctx.beginPath();
      ctx.ellipse(hx + 7 * s, hy - 3 * s, 7 * s, 2 * s, 0.15, 0, 6.3);
      ctx.fill();
      dot(hx, hy - 12.4 * s, 1.4 * s, '#ffffff');
  }
}

// Disegna il personaggio con il suo look: { top, pants, shoes, hat, glasses } (oggetti del catalogo)
// ---------- Capelli e volto ----------
export function drawHairBack(
  head?: GameValue,
  s?: GameValue,
  style?: GameValue,
  hair?: GameValue,
): GameValue {
  const ctx = game.view.ctx;
  const hx: GameValue = head.x,
    hy: GameValue = head.y;
  ctx.fillStyle = hair;
  ctx.strokeStyle = 'rgba(0,0,0,0.28)';
  ctx.lineWidth = 0.8;
  if (style === 2) {
    // lunghi
    ctx.beginPath();
    ctx.moveTo(hx - 9.8 * s, hy - 2 * s);
    ctx.lineTo(hx - 11 * s, hy + 14 * s);
    ctx.quadraticCurveTo(hx, hy + 19 * s, hx + 11 * s, hy + 14 * s);
    ctx.lineTo(hx + 9.8 * s, hy - 2 * s);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
    ctx.strokeStyle = game.darken(hair, 0.25);
    ctx.lineWidth = 0.8 * s;
    [-5, 0, 5].forEach((dx?: GameValue): GameValue => {
      ctx.beginPath();
      ctx.moveTo(hx + dx * s, hy + 6 * s);
      ctx.lineTo(hx + dx * 1.15 * s, hy + 16 * s);
      ctx.stroke();
    });
  } else if (style === 6) {
    // caschetto
    ctx.beginPath();
    ctx.moveTo(hx - 10 * s, hy - 3 * s);
    ctx.lineTo(hx - 10.6 * s, hy + 7 * s);
    ctx.quadraticCurveTo(hx, hy + 11.5 * s, hx + 10.6 * s, hy + 7 * s);
    ctx.lineTo(hx + 10 * s, hy - 3 * s);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
  } else if (style === 3) {
    // coda di cavallo
    ctx.beginPath();
    ctx.moveTo(hx + 7 * s, hy - 3.5 * s);
    ctx.bezierCurveTo(hx + 17 * s, hy - 3 * s, hx + 20 * s, hy + 8 * s, hx + 13 * s, hy + 16 * s);
    ctx.bezierCurveTo(hx + 14.5 * s, hy + 8 * s, hx + 10 * s, hy + 3 * s, hx + 6 * s, hy + 2 * s);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = '#e74c3c';
    ctx.beginPath();
    ctx.arc(hx + 9.2 * s, hy - 1.4 * s, 1.5 * s, 0, 6.3);
    ctx.fill();
  } else if (style === 4) {
    // afro
    for (let i: GameValue = 0; i < 10; i++) {
      const a: GameValue = (i / 10) * Math.PI * 2;
      ctx.beginPath();
      ctx.arc(hx + Math.cos(a) * 9.6 * s, hy - 2 * s + Math.sin(a) * 9.6 * s, 5.2 * s, 0, 6.3);
      ctx.fill();
      ctx.stroke();
    }
    ctx.beginPath();
    ctx.arc(hx, hy - 2 * s, 11 * s, 0, 6.3);
    ctx.fill();
  } else if (style === 7) {
    // chignon
    ctx.beginPath();
    ctx.arc(hx, hy - 12 * s, 4.8 * s, 0, 6.3);
    ctx.fill();
    ctx.stroke();
  }
}

export function drawHairFront(
  head?: GameValue,
  s?: GameValue,
  style?: GameValue,
  hair?: GameValue,
): GameValue {
  const ctx = game.view.ctx;
  if (style === 1 || style === 5) {
    /* rasati / cresta: base rasata sotto */
  }
  const hx: GameValue = head.x,
    hy: GameValue = head.y;
  const cap: GameValue = (r?: GameValue, alpha?: GameValue): GameValue => {
    game.view.ctx.globalAlpha = alpha || 1;
    game.view.ctx.fillStyle = hair;
    game.view.ctx.beginPath();
    game.view.ctx.arc(hx, hy - 1.5 * s, 9.4 * s, Math.PI * 1.02, Math.PI * 1.98);
    game.view.ctx.quadraticCurveTo(hx + 2 * s, hy - r * s, hx - 9 * s, hy - 1 * s);
    game.view.ctx.fill();
    game.view.ctx.globalAlpha = 1;
  };
  if (style === 0) cap(6);
  else if (style === 1) cap(6, 0.35);
  else if (style === 2) {
    // lunghi: frangia + ciocche ai lati
    cap(3.6);
    ctx.fillStyle = hair;
    [-1, 1].forEach((sg?: GameValue): GameValue => {
      ctx.beginPath();
      ctx.roundRect
        ? ctx.roundRect(hx + sg * 8.3 * s - 1.6 * s, hy - 3 * s, 3.2 * s, 12 * s, 1.6 * s)
        : ctx.rect(hx + sg * 8.3 * s - 1.6 * s, hy - 3 * s, 3.2 * s, 12 * s);
      ctx.fill();
    });
  } else if (style === 3) cap(5);
  else if (style === 4) cap(7.5);
  else if (style === 5) {
    // cresta
    cap(6, 0.3);
    ctx.fillStyle = hair;
    ctx.strokeStyle = 'rgba(0,0,0,0.3)';
    ctx.lineWidth = 0.8;
    ctx.beginPath();
    ctx.moveTo(hx - 4 * s, hy - 7.5 * s);
    ctx.lineTo(hx - 5.2 * s, hy - 16 * s);
    ctx.lineTo(hx - 1.6 * s, hy - 11 * s);
    ctx.lineTo(hx, hy - 19.5 * s);
    ctx.lineTo(hx + 1.8 * s, hy - 11 * s);
    ctx.lineTo(hx + 5.2 * s, hy - 16 * s);
    ctx.lineTo(hx + 4 * s, hy - 7.5 * s);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
  } else if (style === 6) cap(3.8);
  else if (style === 7) cap(5.5);
  else if (style === 8) {
    // ciuffo
    cap(5.5);
    ctx.fillStyle = hair;
    ctx.strokeStyle = 'rgba(0,0,0,0.25)';
    ctx.lineWidth = 0.8;
    ctx.beginPath();
    ctx.ellipse(hx + 2.5 * s, hy - 10 * s, 7.5 * s, 4 * s, -0.3, 0, 6.3);
    ctx.fill();
    ctx.stroke();
  }
}

export function drawFace(
  head?: GameValue,
  s?: GameValue,
  bd?: GameValue,
  hair?: GameValue,
  animTime?: GameValue,
  hsh?: GameValue,
  /** colore della pelle per le palpebre pesanti degli occhi rossi; null = occhi normali */
  stonedLid: string | null = null,
): GameValue {
  const ctx = game.view.ctx;
  const hx: GameValue = head.x,
    hy: GameValue = head.y,
    ey: GameValue = hy + 1 * s;
  const eyeC: GameValue = game.BODY_PARTS.eyeColor.opts[bd.eyeColor].c;
  const blink: GameValue = (animTime + (hsh % 5)) % 4 < 0.13;
  const beardOn: GameValue = bd.beard >= 3;
  // barba (sotto bocca e occhi)
  if (bd.beard >= 3) {
    ctx.fillStyle = hair;
    ctx.globalAlpha = bd.beard === 3 ? 0.4 : 1;
    ctx.beginPath();
    ctx.arc(hx, hy, 9.1 * s, Math.PI * 0.08, Math.PI * 0.92);
    ctx.quadraticCurveTo(hx, hy + 4.2 * s, hx + 8.8 * s, hy + 2.3 * s);
    ctx.fill();
    ctx.globalAlpha = 1;
  }
  if (bd.beard === 2) {
    ctx.fillStyle = hair;
    ctx.beginPath();
    ctx.ellipse(hx, hy + 7 * s, 1.9 * s, 2.3 * s, 0, 0, 6.3);
    ctx.fill();
  }
  // sopracciglia
  ctx.strokeStyle = game.darken(hair, 0.3);
  ctx.lineWidth = 1 * s;
  ctx.lineCap = 'round';
  [-1, 1].forEach((sg?: GameValue): GameValue => {
    const ex: GameValue = hx + sg * 3.2 * s,
      lift: GameValue = bd.eyeShape === 3 ? 0.9 : 0.2;
    ctx.beginPath();
    ctx.moveTo(ex - sg * 1.8 * s, ey - (2.9 + lift) * s);
    ctx.lineTo(ex + sg * 1.8 * s, ey - 3.1 * s);
    ctx.stroke();
  });
  // occhi
  const shape: GameValue = [
    [1.7, 1.9, 1.2],
    [2.2, 2.5, 1.7],
    [2.0, 1.1, 0.9],
    [2.1, 1.5, 1.1],
  ][bd.eyeShape];
  [-1, 1].forEach((sg?: GameValue): GameValue => {
    const ex: GameValue = hx + sg * 3.2 * s;
    if (blink) {
      ctx.strokeStyle = '#2d3436';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(ex - 1.6 * s, ey);
      ctx.lineTo(ex + 1.6 * s, ey);
      ctx.stroke();
      return;
    }
    // occhi rossi: il bianco arrossato con le venuzze
    ctx.fillStyle = stonedLid ? '#ffc9c9' : '#ffffff';
    ctx.strokeStyle = 'rgba(0,0,0,0.5)';
    ctx.lineWidth = 0.7;
    ctx.beginPath();
    ctx.ellipse(ex, ey, shape[0] * s, shape[1] * s, 0, 0, 6.3);
    ctx.fill();
    ctx.stroke();
    if (stonedLid) {
      ctx.strokeStyle = 'rgba(214,48,49,0.75)';
      ctx.lineWidth = 0.4 * s;
      ctx.beginPath();
      ctx.moveTo(ex - shape[0] * s, ey + 0.2 * s);
      ctx.lineTo(ex - shape[0] * 0.4 * s, ey + 0.6 * s);
      ctx.moveTo(ex + shape[0] * s, ey + 0.1 * s);
      ctx.lineTo(ex + shape[0] * 0.45 * s, ey + 0.5 * s);
      ctx.stroke();
    }
    ctx.fillStyle = stonedLid ? '#ee353e' : eyeC;
    ctx.beginPath();
    ctx.arc(ex, ey + 0.1 * s, Math.min(shape[2], shape[1]) * s, 0, 6.3);
    ctx.fill();
    ctx.fillStyle = '#111';
    ctx.beginPath();
    ctx.arc(ex, ey + 0.1 * s, shape[2] * (stonedLid ? 0.3 : 0.5) * s, 0, 6.3);
    ctx.fill();
    ctx.fillStyle = 'rgba(255,255,255,0.95)';
    ctx.beginPath();
    ctx.arc(ex + 0.5 * s, ey - 0.5 * s, 0.4 * s, 0, 6.3);
    ctx.fill();
    if (stonedLid) {
      // palpebre pesanti: coprono la metà di sopra dell'occhio
      ctx.fillStyle = stonedLid;
      ctx.beginPath();
      ctx.ellipse(ex, ey, shape[0] * s + 0.4, shape[1] * s + 0.4, 0, Math.PI, Math.PI * 2);
      ctx.lineTo(ex + shape[0] * s + 0.4, ey - 0.3 * s);
      ctx.lineTo(ex - shape[0] * s - 0.4, ey - 0.3 * s);
      ctx.fill();
      ctx.strokeStyle = 'rgba(0,0,0,0.55)';
      ctx.lineWidth = 0.8;
      ctx.beginPath();
      ctx.moveTo(ex - shape[0] * s, ey - 0.3 * s);
      ctx.lineTo(ex + shape[0] * s, ey - 0.3 * s);
      ctx.stroke();
      return;
    }
    if (bd.eyeShape === 2) {
      ctx.strokeStyle = '#2d3436';
      ctx.lineWidth = 1.1;
      ctx.beginPath();
      ctx.ellipse(ex, ey, shape[0] * s, shape[1] * s, 0, Math.PI, Math.PI * 2);
      ctx.stroke();
    }
    if (bd.eyeShape === 3) {
      ctx.strokeStyle = '#2d3436';
      ctx.lineWidth = 1.1;
      ctx.beginPath();
      ctx.moveTo(ex + sg * shape[0] * s, ey);
      ctx.lineTo(ex + sg * (shape[0] + 1.4) * s, ey - 1 * s);
      ctx.stroke();
    }
  });
  // guance e lentiggini
  ctx.fillStyle = 'rgba(255,120,120,0.35)';
  ctx.beginPath();
  ctx.arc(hx - 5.5 * s, hy + 3.5 * s, 1.8 * s, 0, 6.3);
  ctx.arc(hx + 5.5 * s, hy + 3.5 * s, 1.8 * s, 0, 6.3);
  ctx.fill();
  if (bd.freckles) {
    ctx.fillStyle = 'rgba(140,80,40,0.6)';
    [
      [-5.6, 2.4],
      [-4.3, 3.4],
      [-6.3, 3.6],
      [5.6, 2.4],
      [4.3, 3.4],
      [6.3, 3.6],
    ].forEach(([dx, dy]: GameValue = {}): GameValue => {
      ctx.beginPath();
      ctx.arc(hx + dx * s, hy + dy * s, 0.5 * s, 0, 6.3);
      ctx.fill();
    });
  }
  // baffi
  if (bd.beard === 1 || bd.beard === 2 || bd.beard === 4) {
    ctx.fillStyle = hair;
    [-1, 1].forEach((sg?: GameValue): GameValue => {
      ctx.beginPath();
      ctx.ellipse(hx + sg * 2 * s, hy + 3 * s, 2.3 * s, 0.9 * s, sg * 0.3, 0, 6.3);
      ctx.fill();
    });
  }
  // bocca
  const mc: GameValue = beardOn ? '#e8a598' : '#6d3a2a';
  ctx.lineWidth = 1;
  if (bd.mouth === 0) {
    ctx.strokeStyle = mc;
    ctx.beginPath();
    ctx.arc(hx, hy + 3.5 * s, 2.2 * s, 0.2, Math.PI - 0.2);
    ctx.stroke();
  } else if (bd.mouth === 1) {
    ctx.strokeStyle = mc;
    ctx.beginPath();
    ctx.moveTo(hx - 1.6 * s, hy + 5.4 * s);
    ctx.lineTo(hx + 1.6 * s, hy + 5.4 * s);
    ctx.stroke();
  } else if (bd.mouth === 2) {
    ctx.fillStyle = '#7b241c';
    ctx.beginPath();
    ctx.arc(hx, hy + 4 * s, 2.7 * s, 0, Math.PI);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(hx - 2.2 * s, hy + 4 * s, 4.4 * s, 0.9 * s);
    ctx.fillStyle = '#e6798c';
    ctx.beginPath();
    ctx.ellipse(hx, hy + 6 * s, 1.3 * s, 0.7 * s, 0, 0, 6.3);
    ctx.fill();
  } else {
    ctx.strokeStyle = '#c0392b';
    ctx.lineWidth = 1.6 * s;
    ctx.beginPath();
    ctx.arc(hx, hy + 3.5 * s, 2.2 * s, 0.2, Math.PI - 0.2);
    ctx.stroke();
  }
}

export function openCharacterCreator(first?: GameValue): GameValue {
  return new Promise((resolve?: GameValue): GameValue => {
    if (game.creatorResolve) game.creatorResolve(false);
    game.creatorDraft = Object.assign({}, currentBody());
    game.creatorResolve = resolve;
    game.creatorTab = 'skin';
    dom('creator-title').textContent = first
      ? '🎨 Crea il tuo personaggio'
      : '🎨 Modifica il tuo aspetto';
    dom('creator-cancel').classList.toggle('hidden', !!first);
    renderCreator();
    dom('creator-modal').classList.remove('hidden');
    startCreatorLoop();
  });
}

export function renderCreator(..._args: GameValue[]): GameValue {
  const tabs: GameValue = dom('creator-tabs');
  tabs.innerHTML = '';
  game.CREATOR_TABS.forEach((t?: GameValue): GameValue => {
    const b: GameValue = document.createElement('button');
    b.type = 'button';
    b.className = 'tab' + (t.id === game.creatorTab ? ' active' : '');
    b.textContent = t.label;
    b.onclick = (): GameValue => {
      game.creatorTab = t.id;
      renderCreator();
    };
    tabs.appendChild(b);
  });
  const box: GameValue = dom('creator-options');
  box.innerHTML = '';
  game.CREATOR_TABS.find((t?: GameValue): GameValue => t.id === game.creatorTab).parts.forEach(
    (key?: GameValue): GameValue => {
      const part: GameValue = game.BODY_PARTS[key];
      const wrap: GameValue = document.createElement('div');
      const lab: GameValue = document.createElement('div');
      lab.className = 'opt-label';
      lab.textContent = part.label;
      const chips: GameValue = document.createElement('div');
      chips.className = 'opt-chips';
      part.opts.forEach((o?: GameValue, i?: GameValue): GameValue => {
        const b: GameValue = document.createElement('button');
        b.type = 'button';
        b.title = o.n;
        if (part.color) {
          b.className = 'dot' + (game.creatorDraft[key] === i ? ' sel' : '');
          b.style.background = o.c;
        } else {
          b.className = 'chip' + (game.creatorDraft[key] === i ? ' sel' : '');
          b.textContent = o.n;
        }
        b.onclick = (): GameValue => {
          game.creatorDraft[key] = i;
          sfx('click');
          renderCreator();
        };
        chips.appendChild(b);
      });
      wrap.appendChild(lab);
      wrap.appendChild(chips);
      box.appendChild(wrap);
    },
  );
}

export function randomizeCreator(..._args: GameValue[]): GameValue {
  game.BODY_KEYS.forEach((k?: GameValue): GameValue => {
    game.creatorDraft[k] = Math.floor(Math.random() * game.BODY_PARTS[k].opts.length);
  });
  if (game.creatorDraft.freckles && Math.random() < 0.5) game.creatorDraft.freckles = 0;
  if (game.creatorDraft.beard && Math.random() < (game.creatorDraft.gender === 1 ? 0.95 : 0.5))
    game.creatorDraft.beard = 0;
  sfx('click');
  renderCreator();
}

export function startCreatorLoop(..._args: GameValue[]): GameValue {
  if (game.creatorRaf) return;
  const loop: GameValue = (): GameValue => {
    if (dom('creator-modal').classList.contains('hidden')) {
      game.creatorRaf = null;
      return;
    }
    const look: GameValue = resolveLook(game.player.equipped);
    look.body = game.creatorDraft;
    drawAvatarPreview(dom('creator-preview'), look, performance.now() / 1000);
    game.creatorRaf = lifetime.requestAnimationFrame(loop);
  };
  game.creatorRaf = lifetime.requestAnimationFrame(loop);
}

export function finishCreator(ok?: GameValue): GameValue {
  dom('creator-modal').classList.add('hidden');
  const done: GameValue = game.creatorResolve;
  game.creatorResolve = null;
  if (ok && game.creatorDraft) {
    game.myBody = Object.assign({}, game.creatorDraft);
    game.bodyChosen = true;
    if (game.session.saveReady) saveGame(true);
  }
  if (done) done(!!ok);
}

// ---------- Animazioni: doccia e sonno ----------
export function pillTag(cx?: GameValue, ny?: GameValue, name?: GameValue): GameValue {
  const ctx = game.view.ctx;
  if (!name) return;
  ctx.font = 'bold 10px sans-serif';
  ctx.textAlign = 'center';
  const nw: GameValue = Math.min(90, ctx.measureText(name).width + 14);
  ctx.fillStyle = 'rgba(0, 0, 0, 0.6)';
  ctx.beginPath();
  ctx.roundRect ? ctx.roundRect(cx - nw / 2, ny, nw, 16, 8) : ctx.rect(cx - nw / 2, ny, nw, 16);
  ctx.fill();
  ctx.fillStyle = '#fff';
  ctx.fillText(name, cx, ny + 11.5, nw - 8);
}

export function speechBubble(cx?: GameValue, by?: GameValue, text?: GameValue): GameValue {
  const ctx = game.view.ctx;
  if (!text) return;
  ctx.font = '12px sans-serif';
  ctx.textAlign = 'center';
  const bw: GameValue = Math.min(180, ctx.measureText(text).width) + 16;
  ctx.fillStyle = '#fff';
  ctx.beginPath();
  ctx.roundRect ? ctx.roundRect(cx - bw / 2, by, bw, 22, 10) : ctx.rect(cx - bw / 2, by, bw, 22);
  ctx.fill();
  ctx.beginPath();
  ctx.moveTo(cx - 5, by + 22);
  ctx.lineTo(cx + 5, by + 22);
  ctx.lineTo(cx, by + 29);
  ctx.fill();
  ctx.fillStyle = '#111';
  ctx.fillText(text, cx, by + 15, 180);
}

export function drawNameTagWorld(
  x?: GameValue,
  y?: GameValue,
  z?: GameValue,
  name?: GameValue,
): GameValue {
  const p: GameValue = isoProject(x, y, z);
  pillTag(p.x, p.y - 8, name);
}

// Persona coricata sul letto: k va da 0 (in piedi accanto al letto) a 1 (sdraiato sotto la coperta)
/**
 * Dove si sdraia chi dorme: ai piedi del letto, sotto il cuscino `slot` (0 = sinistro, 1 = destro).
 * `slot` null = al centro, come facevano le versioni che non pubblicano il cuscino.
 */
export function bedSpot(bed: GameValue, slot?: number | null): { x: number; y: number } {
  const dx = slot === 0 ? -bed.w * 0.22 : slot === 1 ? bed.w * 0.22 : 0;
  return rotateAround(bed.x + dx, bed.y + bed.h * 0.21, bed.x, bed.y, bed.rot || 0);
}

export function drawAvatarSleeping(
  px?: GameValue,
  py?: GameValue,
  name?: GameValue,
  animTime?: GameValue,
  look?: GameValue,
  say?: GameValue,
  k?: GameValue,
  bed?: GameValue,
  slot?: number | null,
  /** Pazienti dell'ospedale: letto più alto (lift, coperta a blanketZ) e svegli (niente Z). */
  opts?: { lift?: number; blanketZ?: number; awake?: boolean },
): GameValue {
  const ctx = game.view.ctx;
  const s: GameValue = isoScale(),
    e: GameValue = k * k * (3 - 2 * k);
  const bedRot: number = bed.rot || 0;
  const foot = bedSpot(bed, slot);
  const tx: GameValue = px + (foot.x - px) * e,
    ty: GameValue = py + (foot.y - py) * e;
  const lift: GameValue = (opts?.lift ?? 24) * e + Math.sin(Math.PI * k) * 12;
  // Si sdraia con la testa verso la testiera: la direzione dipende da come è girato il letto.
  // (letto non girato: testiera verso −y, cioè in alto a destra sullo schermo → π/3)
  const toHead = rotateVector(0, -1, bedRot);
  const lieAngle = Math.atan2((toHead.x - toHead.y) * 0.866, -(toHead.x + toHead.y) * 0.5);
  const rot: GameValue = lieAngle * e;
  const pv: GameValue = isoProject(tx, ty, 0);
  ctx.save();
  ctx.translate(pv.x, pv.y - lift * s);
  ctx.rotate(rot);
  ctx.translate(-pv.x, -pv.y);
  drawPlayerAvatar(tx, ty, '', animTime, look, false, '', { noShadow: e > 0.05 });
  ctx.restore();
  if (e > 0.05 && e < 1) {
    // ombra a terra mentre salta sul letto
    const g: GameValue = isoProject(tx, ty, 0);
    ctx.fillStyle = 'rgba(0,0,0,' + 0.3 * (1 - e) + ')';
    ctx.beginPath();
    ctx.ellipse(g.x, g.y, 13 * s, 6.5 * s, 0, 0, 6.3);
    ctx.fill();
  }
  if (e > 0.9) {
    // la coperta copre le gambe
    const col: GameValue = bed.color || '#5f27cd';
    ctx.globalAlpha = Math.min(1, (e - 0.9) / 0.1);
    // la coperta è girata insieme al letto
    withFurnitureRotation(bed, () => {
      const bl: GameValue = box(bed.x, bed.y + bed.h * 0.22, bed.w - 8, bed.h * 0.5, 8, col, {
        z0: opts?.blanketZ ?? 23,
        top: bed.topColor || game.lighten(col, 0.15),
      });
      onFace(bl, 'top', (W?: GameValue, H?: GameValue): GameValue => {
        ctx.fillStyle = 'rgba(255,255,255,0.13)';
        for (let i: GameValue = 4; i < W; i += 14) ctx.fillRect(i, 0, 5, H);
        ctx.fillStyle = 'rgba(255,255,255,0.55)';
        ctx.fillRect(0, 0, W, 6);
      });
    });
    ctx.globalAlpha = 1;
  }
  const hs: GameValue = {
    x: pv.x + Math.sin(rot) * 58 * s,
    y: pv.y - lift * s - Math.cos(rot) * 58 * s,
  };
  if (k > 0.95 && !opts?.awake) {
    // Z che salgono dalla testa
    ctx.textAlign = 'center';
    for (let i: GameValue = 0; i < 3; i++) {
      const ph: GameValue = (animTime * 0.45 + i / 3) % 1;
      ctx.globalAlpha = Math.sin(Math.PI * ph) * 0.9;
      ctx.fillStyle = '#cfe3ff';
      ctx.font = 'bold ' + (10 + ph * 10) * s + 'px sans-serif';
      ctx.fillText(
        'Z',
        hs.x + 12 * s + ph * 18 * s + Math.sin(animTime * 2 + i) * 3,
        hs.y - 8 * s - ph * 34 * s,
      );
    }
    ctx.globalAlpha = 1;
  }
  pillTag(hs.x, hs.y - 30 * s, name);
  // il pensiero di chi dorme si disegna dopo il buio della notte, di lato (vedi drawSleepThoughts)
  if (say) sleepThoughts.push({ x: hs.x, y: hs.y, s, text: say });
}

export function drawActor(
  x?: GameValue,
  y?: GameValue,
  name?: GameValue,
  animTime?: GameValue,
  look?: GameValue,
  moving?: GameValue,
  say?: GameValue,
  sleepProgress?: GameValue,
  bed?: GameValue,
  bedSlot?: number | null,
  walkDir?: { x: number; y: number } | null,
  pose?: string,
  extra?: GameValue,
): GameValue {
  if (sleepProgress > 0.001 && bed)
    return drawAvatarSleeping(x, y, name, animTime, look, say, sleepProgress, bed, bedSlot);
  return drawPlayerAvatar(x, y, name, animTime, look, moving, say, {
    walkDir,
    pose,
    newspaper: pose === 'sit',
    // al bancone: il sorso e il bicchiere in mano (vedi render/bar.ts)
    ...(extra || {}),
  });
}

/**
 * Aspetto mentre ci si spoglia per la doccia: step 0 = vestito, 1 = senza accessori,
 * 2 = senza maglia, 3 = scalzo, 4 = in mutande.
 */
export function undressedLook(look: GameValue, step: number): GameValue {
  if (!step || step <= 0) return look;
  const out: GameValue = { ...look, hat: null, glasses: null, neck: null };
  if (step >= 2) out.top = { id: '_bare', style: 'bare', color: '#000000' };
  if (step >= 3) out.shoes = { id: '_barefoot', style: 'barefoot', color: '#000000' };
  // senza mutande: le gambe sono di pelle e le parti intime si coprono a pixel (drawCensor)
  if (step >= 4) out.pants = { id: '_nude', style: 'briefs', color: '#000000' };
  return out;
}

/** Vestiti piegati a terra: si vedono i pezzi già tolti (step come in undressedLook). */
export function drawClothesPile(x: number, y: number, look: GameValue, step: number): void {
  if (!step || step <= 0) return;
  let z = 0;
  const layer = (w: number, h: number, d: number, color: string) => {
    box(x, y, w, h, d, color, { z0: z });
    z += d;
  };
  if (step >= 4 && look.pants) layer(20, 14, 3, look.pants.color);
  if (step >= 2 && look.top) layer(18, 13, 3, look.top.color);
  if (step >= 3 && look.shoes) {
    box(x + 15, y - 4, 7, 4, 3, look.shoes.color);
    box(x + 15, y + 3, 7, 4, 3, look.shoes.color);
  }
  if (look.hat) box(x, y, 9, 9, 3, look.hat.color || '#2d3436', { z0: z });
}

// Acqua, bolle di sapone e vapore dentro il box doccia
export function drawShowerWater(it?: GameValue, t?: GameValue, occ?: GameValue): GameValue {
  const ctx = game.view.ctx;
  const s: GameValue = isoScale();
  const hx: GameValue = it.x - it.w / 2 + 22,
    hy: GameValue = it.y - it.h / 2 + 12,
    hz: GameValue = it.z - 12;
  ctx.lineCap = 'round';
  occ.forEach((a?: GameValue): GameValue => {
    for (let i: GameValue = 0; i < 44; i++) {
      const ph: GameValue = (t * 1.5 + i * 0.381) % 1;
      const ang: GameValue = i * 2.399,
        rr: GameValue = 3 + (i % 7) * 1.9;
      const tx: GameValue = a.x + Math.cos(ang) * rr,
        ty: GameValue = a.y + Math.sin(ang) * rr;
      const pt: GameValue = (p?: GameValue): GameValue => {
        const b: GameValue = Math.min(1, p / 0.3); // il getto parte dal soffione e poi cade sulla persona
        return isoProject(
          hx + (tx - hx) * b,
          hy + (ty - hy) * b,
          6 + (hz - 6) * (1 - Math.pow(p, 1.4)),
        );
      };
      const A: GameValue = pt(ph),
        B: GameValue = pt(Math.max(0, ph - 0.09));
      ctx.strokeStyle = 'rgba(41,128,200,' + (0.55 + 0.4 * (1 - ph)) + ')';
      ctx.lineWidth = 1.7 * s;
      ctx.beginPath();
      ctx.moveTo(B.x, B.y);
      ctx.lineTo(A.x, A.y);
      ctx.stroke();
      if (ph > 0.9) {
        const g: GameValue = isoProject(tx, ty, 6);
        ctx.strokeStyle = 'rgba(41,128,200,0.7)';
        ctx.lineWidth = 0.9 * s;
        ctx.beginPath();
        ctx.ellipse(g.x, g.y, (3 + (ph - 0.9) * 40) * s, (1.5 + (ph - 0.9) * 20) * s, 0, 0, 6.3);
        ctx.stroke();
      }
    }
    for (let i: GameValue = 0; i < 7; i++) {
      const ph: GameValue = (t * 0.35 + i * 0.143) % 1;
      const p: GameValue = isoProject(
        a.x + Math.sin(t * 1.3 + i * 2.1) * 13,
        a.y + Math.cos(t * 1.1 + i * 1.3) * 9,
        14 + ph * 60,
      );
      const r: GameValue = (2 + (i % 3)) * s;
      ctx.fillStyle = 'rgba(190,230,250,' + 0.45 * (1 - ph) + ')';
      ctx.strokeStyle = 'rgba(70,160,220,' + 0.9 * (1 - ph) + ')';
      ctx.lineWidth = 0.9 * s;
      ctx.beginPath();
      ctx.arc(p.x, p.y, r, 0, 6.3);
      ctx.fill();
      ctx.stroke();
      ctx.fillStyle = 'rgba(255,255,255,' + 1 * (1 - ph) + ')';
      ctx.beginPath();
      ctx.arc(p.x - r * 0.35, p.y - r * 0.35, r * 0.25, 0, 6.3);
      ctx.fill();
    }
  });
  ctx.lineCap = 'butt';
}

// Maglie a maniche corte o senza maniche; tutte le altre hanno le maniche lunghe.
const SHORT_SLEEVES = new Set(['plain', 'print', 'jersey', 'polo', 'hawaii', undefined]);
// Capi lunghi che coprono la vita: niente cintura visibile.
const LONG_TOPS = new Set(['hoodie', 'puffer', 'sweater', 'suit', 'tuxedo', 'jacket']);
const BELT_PANTS = new Set(['jeans', 'ripped', 'cargo', 'plaid', 'camo']);

/**
 * La testa vista da dietro: i capelli coprono la nuca (rasati appena un'ombra), e quelli lunghi,
 * la coda, il caschetto, lo chignon e l'afro ricadono sopra.
 */
/**
 * La testa vista da dietro: le orecchie ai lati (di tre quarti una sola, la disegna
 * drawThreeQuarterSide: `side` ≠ 0), i capelli che coprono la nuca fino all'attaccatura con le
 * ciocche che partono dalla corona, e sopra le acconciature che scendono sulla schiena.
 */
function drawHairFromBehind(
  head: Pt,
  s: number,
  style: number,
  hair: string,
  skin: string,
  side: number,
): void {
  const ctx = game.view.ctx;
  const hx = head.x,
    hy = head.y;
  if (side === 0 && ![2, 4, 6].includes(style))
    for (const sd of [-1, 1]) {
      ctx.fillStyle = skin;
      ctx.strokeStyle = 'rgba(0,0,0,0.3)';
      ctx.lineWidth = 0.7 * s;
      ctx.beginPath();
      ctx.ellipse(hx + sd * 8.8 * s, hy + 1.6 * s, 1.7 * s, 2.7 * s, sd * 0.15, 0, 6.3);
      ctx.fill();
      ctx.stroke();
      ctx.strokeStyle = game.darken(skin, 0.25);
      ctx.beginPath();
      ctx.arc(hx + sd * 8.8 * s, hy + 1.6 * s, 0.9 * s, Math.PI * 0.6, Math.PI * 1.4);
      ctx.stroke();
    }
  // la calotta, fino all'attaccatura sulla nuca (rasati e cresta: solo un velo sui lati)
  const nape = style === 1 ? 4.5 : 5.5;
  ctx.save();
  ctx.beginPath();
  ctx.arc(hx, hy, 9 * s, 0, Math.PI * 2);
  ctx.clip();
  const cap = ctx.createLinearGradient(0, hy - 9 * s, 0, hy + nape * s);
  cap.addColorStop(0, game.lighten(hair, 0.12));
  cap.addColorStop(1, game.darken(hair, 0.18));
  ctx.globalAlpha = style === 1 ? 0.55 : style === 5 ? 0.4 : 1;
  ctx.fillStyle = cap;
  ctx.beginPath();
  ctx.moveTo(hx - 10 * s, hy - 10 * s);
  ctx.lineTo(hx + 10 * s, hy - 10 * s);
  ctx.lineTo(hx + 10 * s, hy + (nape - 1) * s);
  ctx.quadraticCurveTo(hx + 4 * s, hy + (nape + 0.4) * s, hx + 1.6 * s, hy + (nape + 2) * s);
  ctx.quadraticCurveTo(hx, hy + (nape + 0.8) * s, hx - 1.6 * s, hy + (nape + 2) * s);
  ctx.quadraticCurveTo(hx - 4 * s, hy + (nape + 0.4) * s, hx - 10 * s, hy + (nape - 1) * s);
  ctx.closePath();
  ctx.fill();
  ctx.globalAlpha = 1;
  if (style !== 1 && style !== 5) {
    ctx.strokeStyle = game.darken(hair, 0.28);
    ctx.lineWidth = 0.6 * s;
    for (const a of [-0.9, -0.45, 0, 0.45, 0.9]) {
      ctx.beginPath();
      ctx.moveTo(hx + a * 1.5 * s, hy - 6 * s);
      ctx.quadraticCurveTo(hx + a * 7.5 * s, hy - 1 * s, hx + a * 6.6 * s, hy + (nape - 0.3) * s);
      ctx.stroke();
    }
    ctx.strokeStyle = 'rgba(255,255,255,0.22)';
    ctx.lineWidth = 1.2 * s;
    ctx.beginPath();
    ctx.arc(hx, hy, 6.6 * s, Math.PI * 1.2, Math.PI * 1.55);
    ctx.stroke();
  }
  ctx.restore();
  ctx.strokeStyle = 'rgba(0,0,0,0.3)';
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.arc(hx, hy, 9 * s, 0, Math.PI * 2);
  ctx.stroke();
  if (style === 5) {
    // cresta: la striscia in mezzo, dalla fronte alla nuca
    ctx.fillStyle = hair;
    ctx.strokeStyle = 'rgba(0,0,0,0.28)';
    ctx.lineWidth = 0.8;
    ctx.beginPath();
    ctx.roundRect
      ? ctx.roundRect(hx - 2.2 * s, hy - 12 * s, 4.4 * s, 17.5 * s, 2.2 * s)
      : ctx.rect(hx - 2.2 * s, hy - 12 * s, 4.4 * s, 17.5 * s);
    ctx.fill();
    ctx.stroke();
  }
  if (style === 2 || style === 6) hairCurtain(head, s, hair, style === 2 ? 19 : 9.5);
  else if (style === 3) ponytailFromBehind(head, s, hair);
  else if (style === 4 || style === 7) drawHairBack(head, s, style, hair);
}

/** Lunghi e caschetto da dietro: i capelli scendono dalla testa fino a `len` sotto il centro. */
function hairCurtain(head: Pt, s: number, hair: string, len: number): void {
  const ctx = game.view.ctx;
  const hx = head.x,
    hy = head.y;
  const bot = hy + len * s;
  const flare = len > 12 ? 11.2 : 10.4;
  const g = ctx.createLinearGradient(0, hy - 10 * s, 0, bot);
  g.addColorStop(0, game.lighten(hair, 0.12));
  g.addColorStop(1, game.darken(hair, 0.22));
  ctx.fillStyle = g;
  ctx.strokeStyle = 'rgba(0,0,0,0.28)';
  ctx.lineWidth = 0.8;
  ctx.beginPath();
  ctx.moveTo(hx - 9.4 * s, hy - 2 * s);
  ctx.quadraticCurveTo(hx - flare * s, hy + len * 0.45 * s, hx - (flare - 0.6) * s, bot - 1 * s);
  // il fondo: ciocche arrotondate (i lunghi) o un taglio dritto appena curvo (il caschetto)
  const n = len > 12 ? 4 : 1;
  const w = (2 * (flare - 0.6) * s) / n;
  for (let k = 0; k < n; k++) {
    const xa = hx - (flare - 0.6) * s + k * w;
    ctx.quadraticCurveTo(
      xa + w / 2,
      bot + (n > 1 ? 2 : 1.4) * s,
      xa + w,
      bot - (n > 1 ? 1 : 1) * s,
    );
  }
  ctx.quadraticCurveTo(hx + flare * s, hy + len * 0.45 * s, hx + 9.4 * s, hy - 2 * s);
  ctx.arc(hx, hy - 0.5 * s, 9.5 * s, -0.16, Math.PI + 0.16, true);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();
  ctx.strokeStyle = game.darken(hair, 0.28);
  ctx.lineWidth = 0.6 * s;
  for (const a of [-0.75, -0.38, 0, 0.38, 0.75]) {
    ctx.beginPath();
    ctx.moveTo(hx + a * 3 * s, hy - 6 * s);
    ctx.quadraticCurveTo(hx + a * 9 * s, hy + len * 0.3 * s, hx + a * 9.4 * s, bot - 1.5 * s);
    ctx.stroke();
  }
  ctx.strokeStyle = 'rgba(255,255,255,0.2)';
  ctx.lineWidth = 1.2 * s;
  ctx.beginPath();
  ctx.arc(hx, hy - 0.5 * s, 7 * s, Math.PI * 1.2, Math.PI * 1.55);
  ctx.stroke();
}

/** La coda di cavallo vista da dietro: l'elastico sulla nuca e la coda che pende in mezzo. */
function ponytailFromBehind(head: Pt, s: number, hair: string): void {
  const ctx = game.view.ctx;
  const hx = head.x,
    hy = head.y;
  const g = ctx.createLinearGradient(0, hy, 0, hy + 17 * s);
  g.addColorStop(0, hair);
  g.addColorStop(1, game.darken(hair, 0.22));
  ctx.fillStyle = g;
  ctx.strokeStyle = 'rgba(0,0,0,0.28)';
  ctx.lineWidth = 0.8;
  ctx.beginPath();
  ctx.moveTo(hx - 2 * s, hy + 1.5 * s);
  ctx.bezierCurveTo(hx - 4.5 * s, hy + 6 * s, hx - 3 * s, hy + 13 * s, hx + 0.6 * s, hy + 17 * s);
  ctx.bezierCurveTo(hx + 3.2 * s, hy + 12 * s, hx + 4.2 * s, hy + 6 * s, hx + 2 * s, hy + 1.5 * s);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();
  ctx.strokeStyle = game.darken(hair, 0.28);
  ctx.lineWidth = 0.6 * s;
  ctx.beginPath();
  ctx.moveTo(hx, hy + 3 * s);
  ctx.quadraticCurveTo(hx - 1.2 * s, hy + 9 * s, hx + 0.4 * s, hy + 15 * s);
  ctx.stroke();
  ctx.fillStyle = '#e74c3c';
  ctx.beginPath();
  ctx.ellipse(hx, hy + 1.8 * s, 2.2 * s, 1.3 * s, 0, 0, 6.3);
  ctx.fill();
}

/**
 * Vista di tre quarti da dietro: chi si allontana verso destra mostra l'orecchio e un filo di
 * guancia sul lato destro della testa (side = 1), verso sinistra sul lato sinistro.
 */
function drawThreeQuarterSide(head: Pt, s: number, skin: string, side: number): void {
  const ctx = game.view.ctx;
  ctx.save();
  ctx.beginPath();
  ctx.arc(head.x, head.y, 9 * s, 0, Math.PI * 2);
  ctx.clip();
  ctx.fillStyle = skin;
  ctx.beginPath();
  ctx.ellipse(head.x + side * 7.4 * s, head.y + 3.6 * s, 3 * s, 4.4 * s, side * 0.3, 0, 6.3);
  ctx.fill();
  ctx.restore();
  ctx.fillStyle = skin;
  ctx.strokeStyle = 'rgba(0,0,0,0.3)';
  ctx.lineWidth = 0.7 * s;
  ctx.beginPath();
  ctx.ellipse(head.x + side * 8.4 * s, head.y + 1.4 * s, 1.8 * s, 2.8 * s, 0, 0, 6.3);
  ctx.fill();
  ctx.stroke();
  ctx.strokeStyle = game.darken(skin, 0.25);
  ctx.beginPath();
  ctx.arc(head.x + side * 8.4 * s, head.y + 1.4 * s, 1 * s, Math.PI * 0.6, Math.PI * 1.6);
  ctx.stroke();
}

/**
 * Il busto visto di spalle (nel ritaglio del busto): i motivi che girano tutto intorno restano,
 * quello che sta solo sul davanti (bottoni, risvolti, cerniere, stampe) no. Al suo posto il
 * colletto, la cucitura in mezzo alla schiena, il numero sulla maglia, le scapole.
 */
function drawTorsoBack(
  top: GameValue,
  skin: string,
  neck: Pt,
  tyTop: number,
  tyBot: number,
  tH: number,
  tx: number,
  tW: number,
  s: number,
): void {
  const ctx = game.view.ctx;
  const c2: string = top.color2 || '#ffffff';
  const collar = (color: string, h = 1.6) => {
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.ellipse(neck.x, tyTop, 4.6 * s, h * s, 0, 0, Math.PI);
    ctx.fill();
  };
  const seam = (to = 1) =>
    seg(
      { x: neck.x, y: tyTop + 1.5 * s },
      { x: neck.x, y: tyTop + tH * to },
      'rgba(0,0,0,0.18)',
      0.6 * s,
    );
  switch (top.style) {
    case 'stripes':
      ctx.fillStyle = c2;
      for (let v = tyTop + 2 * s; v < tyBot; v += 4 * s) ctx.fillRect(tx, v, tW, 2 * s);
      collar(game.darken(c2, 0.2), 1.1);
      break;
    case 'hawaii':
      for (let i = 0; i < 9; i++) {
        const px = tx + rnd(i + 3) * tW,
          py = tyTop + rnd(i + 11) * tH;
        for (let p = 0; p < 5; p++)
          dot(
            px + Math.cos(p * 1.256) * 1.5 * s,
            py + Math.sin(p * 1.256) * 1.5 * s,
            1.1 * s,
            i % 2 ? c2 : '#ffffff',
          );
        dot(px, py, 0.8 * s, '#feca57');
      }
      collar(game.lighten(top.color, 0.2), 2.2);
      break;
    case 'sport':
      ctx.fillStyle = c2;
      ctx.fillRect(tx + 2 * s, tyTop, 1.6 * s, tH);
      ctx.fillRect(tx + tW - 3.6 * s, tyTop, 1.6 * s, tH);
      collar(game.darken(top.color, 0.2), 1.2);
      break;
    case 'xmas':
      ctx.fillStyle = c2;
      ctx.fillRect(tx, tyTop + tH * 0.3, tW, 1.3 * s);
      ctx.fillRect(tx, tyTop + tH * 0.7, tW, 1.3 * s);
      for (let u = 2 * s; u < tW; u += 5 * s) dot(tx + u, tyTop + tH * 0.5, 0.8 * s, '#ffffff');
      break;
    case 'plaid':
      for (let u = 0; u < tW; u += 4 * s) {
        ctx.fillStyle = c2 + '99';
        ctx.fillRect(tx + u, tyTop, 1.6 * s, tH);
      }
      for (let v = tyTop; v < tyBot; v += 4 * s) {
        ctx.fillStyle = c2 + '77';
        ctx.fillRect(tx, v, tW, 1.6 * s);
      }
      collar(game.darken(top.color, 0.15), 2);
      break;
    case 'sweater':
      for (let u = 1 * s; u < tW; u += 2 * s)
        seg({ x: tx + u, y: tyTop }, { x: tx + u, y: tyBot }, 'rgba(0,0,0,0.1)', 0.5 * s);
      ctx.fillStyle = game.darken(top.color, 0.15);
      ctx.fillRect(tx, tyBot - 3 * s, tW, 3 * s);
      break;
    case 'jersey':
      // il numero grande sulla schiena
      ctx.fillStyle = c2;
      ctx.fillRect(tx, tyTop, 2.4 * s, tH);
      ctx.fillRect(tx + tW - 2.4 * s, tyTop, 2.4 * s, tH);
      collar(c2, 1.2);
      ctx.font = 'bold ' + 10 * s + 'px sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText('10', neck.x, tyTop + tH * 0.55);
      ctx.textBaseline = 'alphabetic';
      break;
    case 'puffer':
      for (let v = tyTop + 3 * s; v < tyBot; v += 3.4 * s) {
        seg({ x: tx, y: v }, { x: tx + tW, y: v }, game.darken(top.color, 0.2), 0.6 * s);
        seg(
          { x: tx, y: v - 1.6 * s },
          { x: tx + tW, y: v - 1.6 * s },
          'rgba(255,255,255,0.18)',
          0.9 * s,
        );
      }
      break;
    case 'tank':
      tankCutouts(neck, tyTop, tH, tW / 2, s, skin, game.darken(top.color, 0.2), true);
      break;
    case 'bare':
      // spina dorsale e scapole
      seg(
        { x: neck.x, y: tyTop + 1 * s },
        { x: neck.x, y: tyBot - 1 * s },
        game.darken(skin, 0.15),
        0.6 * s,
      );
      for (const sd of [-1, 1])
        seg(
          { x: neck.x + sd * 2 * s, y: tyTop + tH * 0.22 },
          { x: neck.x + sd * 5 * s, y: tyTop + tH * 0.42 },
          game.darken(skin, 0.15),
          0.6 * s,
        );
      break;
    case 'suit':
    case 'tuxedo':
    case 'jacket':
      // giacca: colletto rialzato e cucitura con lo spacco in fondo
      collar(game.darken(top.color, 0.18), 2.4);
      seam(0.85);
      seg(
        { x: neck.x, y: tyTop + tH * 0.85 },
        { x: neck.x, y: tyBot },
        'rgba(0,0,0,0.35)',
        0.8 * s,
      );
      break;
    case 'polo':
      collar(c2, 2.2);
      break;
    case 'vest':
      // il dietro del gilet è di raso, con la fibbietta
      ctx.fillStyle = game.lighten(top.color, 0.1);
      ctx.fillRect(neck.x - 6 * s, tyTop + tH * 0.15, 12 * s, tH * 0.8);
      ctx.fillStyle = '#b2bec3';
      ctx.fillRect(neck.x - 1.5 * s, tyTop + tH * 0.6, 3 * s, 1.2 * s);
      break;
    case 'hoodie':
      // il cappuccio si disegna sopra il busto, dopo
      break;
    default:
      collar(game.darken(top.color, 0.22), 1.1);
      shoulderBlades(neck, tyTop, tH, s);
  }
}

/**
 * Canottiera: scollo tondo e giromanica larghi, così spalle e lati del petto restano scoperti e
 * del capo restano le spalline. Davanti e dietro uguale (dietro lo scollo è più basso).
 */
function tankCutouts(
  neck: Pt,
  tyTop: number,
  tH: number,
  tw: number,
  s: number,
  skin: string,
  trim: string,
  back: boolean,
): void {
  const ctx = game.view.ctx;
  ctx.fillStyle = skin;
  ctx.beginPath();
  ctx.ellipse(neck.x, tyTop - 0.5 * s, 3.5 * s, (back ? 4 : 3.3) * s, 0, 0, Math.PI * 2);
  ctx.fill();
  const strap = 5.3 * s;
  const low = tyTop + tH * 0.46;
  const armhole = (sd: number) => {
    const ox = neck.x + sd * (tw + 2 * s);
    ctx.beginPath();
    ctx.moveTo(neck.x + sd * strap, tyTop - 3 * s);
    ctx.lineTo(ox, tyTop - 3 * s);
    ctx.lineTo(ox, low);
    ctx.lineTo(neck.x + sd * (tw - 0.2 * s), low);
    ctx.quadraticCurveTo(
      neck.x + sd * strap,
      low - tH * 0.08,
      neck.x + sd * strap,
      tyTop - 0.5 * s,
    );
    ctx.closePath();
  };
  for (const sd of [-1, 1]) {
    armhole(sd);
    ctx.fill();
  }
  // il bordino di scollo e giromanica
  ctx.strokeStyle = trim;
  ctx.lineWidth = 0.7 * s;
  ctx.beginPath();
  ctx.ellipse(neck.x, tyTop - 0.5 * s, 3.5 * s, (back ? 4 : 3.3) * s, 0, 0.1, Math.PI - 0.1);
  ctx.stroke();
  for (const sd of [-1, 1]) {
    ctx.beginPath();
    ctx.moveTo(neck.x + sd * (tw - 0.2 * s), low);
    ctx.quadraticCurveTo(
      neck.x + sd * strap,
      low - tH * 0.08,
      neck.x + sd * strap,
      tyTop - 0.5 * s,
    );
    ctx.stroke();
  }
}

/** Inviluppo convesso di alcuni punti (il contorno che li racchiude tutti). */
function convexHull(pts: Pt[]): Pt[] {
  const p = [...pts].sort((a, b) => a.x - b.x || a.y - b.y);
  const cross = (o: Pt, a: Pt, b: Pt) => (a.x - o.x) * (b.y - o.y) - (a.y - o.y) * (b.x - o.x);
  const half = (list: Pt[]) => {
    const out: Pt[] = [];
    for (const q of list) {
      while (out.length >= 2 && cross(out[out.length - 2], out[out.length - 1], q) <= 0) out.pop();
      out.push(q);
    }
    out.pop();
    return out;
  };
  return [...half(p), ...half([...p].reverse())];
}

/**
 * Gonna: parte poco sopra l'orlo della maglia e si allarga con le pieghe e l'orlo curvo: in
 * piedi fino a metà coscia, seduti (`fit` 'sit') più corta e larga, stesa sulla seduta con le
 * cosce che escono da sotto; seduti di spalle ('back') solo il giro attorno alla seduta.
 */
function drawSkirt(
  hip: Pt,
  waistY: number,
  s: number,
  color: string,
  fit: 'stand' | 'sit' | 'back',
): void {
  const ctx = game.view.ctx;
  // poco sopra l'orlo della maglia, già con le pieghe (niente fascia di colore pieno)
  const st = waistY - 0.5 * s;
  const tw = 7.8 * s;
  const sb = hip.y + (fit === 'stand' ? 10 : fit === 'sit' ? 6.5 : 5) * s;
  const bw = (fit === 'stand' ? 11 : fit === 'sit' ? 11.5 : 9.5) * s;
  const drop = (fit === 'back' ? 1.4 : 2.4) * s;
  const shape = () => {
    ctx.beginPath();
    ctx.moveTo(hip.x - tw, st);
    ctx.lineTo(hip.x + tw, st);
    ctx.quadraticCurveTo(hip.x + bw * 0.9, hip.y + 3 * s, hip.x + bw, sb);
    // l'orlo, visto un po' dall'alto, scende al centro
    ctx.quadraticCurveTo(hip.x, sb + drop, hip.x - bw, sb);
    ctx.quadraticCurveTo(hip.x - bw * 0.9, hip.y + 3 * s, hip.x - tw, st);
    ctx.closePath();
  };
  const g = ctx.createLinearGradient(hip.x - bw, 0, hip.x + bw, 0);
  g.addColorStop(0, game.lighten(color, 0.15));
  g.addColorStop(1, game.darken(color, 0.25));
  shape();
  ctx.fillStyle = g;
  ctx.fill();
  ctx.save();
  shape();
  ctx.clip();
  // pieghe che si aprono verso l'orlo, dalla vita in giù
  ctx.strokeStyle = game.darken(color, 0.28);
  ctx.lineWidth = 0.55 * s;
  for (let n = -3; n <= 3; n++) {
    ctx.beginPath();
    ctx.moveTo(hip.x + n * 2.2 * s, st);
    ctx.lineTo(hip.x + (n / 3) * bw * 1.02, sb + drop);
    ctx.stroke();
  }
  ctx.restore();
  shape();
  ctx.strokeStyle = 'rgba(0,0,0,0.3)';
  ctx.lineWidth = 0.8;
  ctx.stroke();
  ctx.strokeStyle = game.lighten(color, 0.25);
  ctx.lineWidth = 0.6 * s;
  ctx.beginPath();
  ctx.moveTo(hip.x + bw, sb);
  ctx.quadraticCurveTo(hip.x, sb + drop, hip.x - bw, sb);
  ctx.stroke();
}

/** Due pieghe morbide sulle scapole: la schiena di una maglietta liscia. */
function shoulderBlades(neck: Pt, tyTop: number, tH: number, s: number): void {
  const ctx = game.view.ctx;
  ctx.strokeStyle = 'rgba(0,0,0,0.13)';
  ctx.lineWidth = 0.7 * s;
  for (const sd of [-1, 1]) {
    ctx.beginPath();
    ctx.moveTo(neck.x + sd * 2.2 * s, tyTop + tH * 0.22);
    ctx.quadraticCurveTo(
      neck.x + sd * 6.2 * s,
      tyTop + tH * 0.26,
      neck.x + sd * 6.4 * s,
      tyTop + tH * 0.52,
    );
    ctx.stroke();
  }
}

/** Il seno sul davanti del busto (vale per ogni capo e per la pelle): luce sopra, ombra sotto. */
function drawBust(neck: Pt, tyTop: number, tH: number, s: number): void {
  const ctx = game.view.ctx;
  for (const sd of [-1, 1]) {
    const cx = neck.x + sd * 3.6 * s,
      cy = tyTop + tH * 0.29;
    // ombra a mezzaluna sotto
    ctx.fillStyle = 'rgba(0,0,0,0.16)';
    ctx.beginPath();
    ctx.arc(cx, cy, 3.4 * s, Math.PI * 0.08, Math.PI * 0.92);
    ctx.arc(cx, cy - 1 * s, 3.4 * s, Math.PI * 0.92, Math.PI * 0.08, true);
    ctx.fill();
    // luce sopra (sfuma nel bianco trasparente: verso il nero farebbe un anello scuro)
    const g = ctx.createRadialGradient(
      cx - 0.6 * s,
      cy - 1.3 * s,
      0,
      cx - 0.6 * s,
      cy - 1.3 * s,
      2.8 * s,
    );
    g.addColorStop(0, 'rgba(255,255,255,0.22)');
    g.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.arc(cx - 0.6 * s, cy - 1.3 * s, 2.8 * s, 0, Math.PI * 2);
    ctx.fill();
  }
}

/**
 * Riquadro a pixel che copre le parti intime nella doccia, come in TV: quadretti dei toni della
 * pelle che cambiano piano.
 */
function drawCensor(
  cx: number,
  cy: number,
  w: number,
  h: number,
  s: number,
  skin: string,
  t: number,
): void {
  const ctx = game.view.ctx;
  const cell = 2 * s;
  const nx = Math.ceil(w / cell),
    ny = Math.ceil(h / cell);
  const x0 = cx - (nx * cell) / 2,
    y0 = cy - (ny * cell) / 2;
  const tick = Math.floor((t || 0) * 3);
  for (let i = 0; i < nx; i++)
    for (let j = 0; j < ny; j++) {
      const r = rnd(i * 7.13 + j * 3.71 + tick * 1.37);
      ctx.fillStyle =
        r < 0.5 ? game.darken(skin, 0.06 + r * 0.3) : game.lighten(skin, (r - 0.5) * 0.4);
      ctx.fillRect(x0 + i * cell, y0 + j * cell, cell + 0.5, cell + 0.5);
    }
}

/** Bicchiere da aperitivo in mano: arancione come uno spritz, inclinato mentre si beve. */
function drawHandGlass(hand: Pt, s: number, fill: number, sip: number): void {
  const ctx = game.view.ctx;
  ctx.save();
  ctx.translate(hand.x, hand.y - 2 * s);
  ctx.rotate(-sip * 0.9);
  const w = 3.6 * s,
    h = 7 * s;
  if (fill > 0) {
    ctx.fillStyle = 'rgba(255,120,30,0.9)';
    ctx.fillRect(-w / 2, h * (0.5 - fill * 0.85), w, h * fill * 0.85);
  }
  ctx.fillStyle = 'rgba(220,235,245,0.3)';
  ctx.strokeStyle = 'rgba(255,255,255,0.8)';
  ctx.lineWidth = 0.7 * s;
  ctx.fillRect(-w / 2, -h / 2, w, h);
  ctx.strokeRect(-w / 2, -h / 2, w, h);
  ctx.restore();
}

export function drawPlayerAvatar(
  x?: GameValue,
  y?: GameValue,
  name?: GameValue,
  animTime?: GameValue,
  look?: GameValue,
  moving: GameValue = false,
  say: GameValue = '',
  opts: GameValue = null,
): GameValue {
  look = look || resolveLook({});
  const ctx: GameValue = game.view.ctx;
  const s: GameValue = isoScale();
  const hsh: GameValue = nameHash(name);
  const mannequin: GameValue = !!look.mannequin;
  const bd: GameValue = look.body || bodyFromName(name);
  // femmina: spalle un po' più strette e il seno (i manichini dei negozi sono neutri)
  const female: boolean = bd.gender === 1 && !mannequin;
  const skin: GameValue = mannequin ? '#dfe4ea' : game.BODY_PARTS.skin.opts[bd.skin].c;
  const hair: GameValue = game.BODY_PARTS.hairColor.opts[bd.hairColor].c;
  const top: GameValue = look.top?.style === 'bare' ? { ...look.top, color: skin } : look.top,
    nude: boolean = look.pants?.id === '_nude',
    pants: GameValue = nude ? { ...look.pants, color: skin } : look.pants,
    shoes: GameValue = look.shoes,
    neckItem: GameValue = look.neck || null;
  const g0: GameValue = isoProject(x, y, 0);
  if (!(opts && opts.noShadow)) {
    ctx.fillStyle = 'rgba(0,0,0,0.3)';
    ctx.beginPath();
    ctx.ellipse(g0.x, g0.y, 13 * s, 6.5 * s, 0, 0, 6.3);
    ctx.fill();
  }
  // Con la velocità (opts.speed, unità al secondo) il passo va a tempo con lo spostamento:
  // chi cammina piano fa passi più lenti invece di "pattinare" muovendo le gambe in fretta.
  const STRIDE = 7.5;
  const stepRate: number =
    opts && opts.speed > 0 ? Math.max(4, Math.min(12, (opts.speed * Math.PI) / (2 * STRIDE))) : 12;
  const phase: GameValue = animTime * stepRate + (hsh % 10);
  const swing: GameValue = moving ? Math.sin(phase) : 0;
  const pose: string = (opts && opts.pose) || '';
  // sullo sgabello del bar: seduti più in alto, di spalle, girati verso il bancone
  const onStool = pose === 'stool';
  // sulla sedia di un tavolino: 'chair' guarda in avanti, 'chairSide' il tavolo alla sua destra
  // (verso +x)
  // 'chairAway' e 'chairAwaySide': alla scrivania del PC, girati verso il monitor (di spalle),
  // verso -y o verso -x
  const chairAway = pose === 'chairAway' || pose === 'chairAwaySide';
  const onChair = pose === 'chair' || pose === 'chairSide' || chairAway;
  const chairSide = pose === 'chairSide';
  const sitting = pose === 'sit' || pose === 'bench' || onStool || onChair;
  // seduti verso chi guarda: le cosce (e le mani in grembo) passano davanti al busto
  const lapOverTorso = sitting && !chairAway && !onStool;
  // Direzione di marcia (a terra): il passo va avanti e indietro lungo questa.
  // Senza direzione resta il passo in diagonale di prima.
  const wd = opts && opts.walkDir;
  const wl = wd ? Math.hypot(wd.x, wd.y) : 0;
  const dX: number = wl > 0.01 ? wd.x / wl : Math.SQRT1_2,
    dY: number = wl > 0.01 ? wd.y / wl : -Math.SQRT1_2;
  // Camminando verso il fondo (sullo schermo verso l'alto: x + y che cala) si va di spalle,
  // altrimenti sembrerebbe di camminare all'indietro guardando chi osserva.
  const walkingAway = !!moving && !sitting && wl > 0.01 && dX + dY < -0.3;
  // di spalle: al bancone, il barista girato verso le mensole, o chi si allontana
  const fromBehind = onStool || chairAway || !!(opts && opts.back) || walkingAway;
  // da che parte dello schermo si va (1 = destra): di spalle da quella parte si vede
  // l'orecchio (vista di tre quarti)
  const screenSide: number = dX - dY;
  // la seduta della sedia è più alta di quella della panchina
  // Seduti il sedere poggia sulla seduta: il bacino sta 2,5 sopra (opts.seatZ la dà il divano;
  // le altre sedute hanno la loro altezza fissa). In piedi niente.
  const seatZ: number =
    opts && typeof opts.seatZ === 'number'
      ? opts.seatZ
      : onStool
        ? 31.5
        : onChair
          ? CHAIR_SEAT_Z
          : pose === 'bench'
            ? BENCH_SEAT_Z
            : 15.5;
  const lift = sitting ? seatZ + 2.5 - 18 : 0;
  const bob: GameValue = sitting
    ? -4
    : moving
      ? Math.abs(Math.sin(phase)) * 1.8
      : mannequin
        ? 0
        : Math.sin(animTime * 2 + hsh) * 0.5;
  // si alza il piede che sta andando avanti
  const liftFront: number = moving ? Math.max(0, Math.cos(phase)) * 4 : 0,
    liftBack: number = moving ? Math.max(0, -Math.cos(phase)) * 4 : 0;
  const lean: number = moving ? 1.3 : 0;
  const P: GameValue = (dx?: GameValue, dy?: GameValue, z?: GameValue): GameValue =>
    isoProject(x + dx, y + dy, z + lift);
  const hip: GameValue = P(0, 0, 22 + bob),
    neck: GameValue = P(dX * lean, dY * lean, 46 + bob),
    head: GameValue = P(dX * lean * 1.3, dY * lean * 1.3, 58 + bob);
  // le braccia oscillano al contrario della gamba dello stesso lato
  const armX: number = (dX - dY) * 0.866 * s * 3.4 * swing,
    armY: number = (dX + dY) * 0.5 * s * 3.4 * swing;
  const tw: GameValue = (female ? 8.6 : 9.5) * s;
  // La vita dei pantaloni sta un po' sopra l'anca: busto più corto, gambe più lunghe. I capi
  // lunghi (felpe, giacche…) scendono comunque fino all'anca e la coprono.
  const longTop: boolean = LONG_TOPS.has(top.style);
  const waistY: number = hip.y - (longTop ? 0 : 5) * s;
  // in piedi le gambe si separano più in alto dell'anca (lo spacco); seduti no, le cosce vanno
  // in avanti dalla seduta
  const crotchLift: number = sitting ? 0 : 3.5;
  const crotchY: number = hip.y + (3.5 - crotchLift) * s;
  const tyTop: GameValue = neck.y - 1 * s,
    tyBot: GameValue = waistY + 2 * s,
    tH: GameValue = tyBot - tyTop;
  ctx.lineCap = 'round';

  // ---- zaino dietro la schiena (si vede ai lati del busto)
  if (neckItem && neckItem.style === 'backpack') {
    ctx.fillStyle = game.darken(neckItem.color, 0.15);
    ctx.beginPath();
    ctx.roundRect
      ? ctx.roundRect(neck.x - tw - 2 * s, tyTop + 1 * s, (tw + 2 * s) * 2, tH * 0.8, 3 * s)
      : ctx.rect(neck.x - tw - 2 * s, tyTop + 1 * s, (tw + 2 * s) * 2, tH * 0.8);
    ctx.fill();
  }

  // ---- gambe, pantaloni e scarpe
  const pStyle: GameValue = pants.style;
  const bareFrom: number =
    pStyle === 'shorts' ? 0.5 : pStyle === 'skirt' ? 0.12 : pStyle === 'briefs' ? 0.22 : 1;
  // ---- scarpe: forme vere appoggiate a terra e girate dove punta il piede (`fwd`, nel piano del
  // pavimento): suola e tomaia a strati, sopra i dettagli di ogni modello. Di spalle si vede il
  // tallone. Si disegnano sopra la gamba; poi l'orlo dei pantaloni ricade sulla caviglia, tranne
  // che su stivali e scarpe alte, il cui gambale sta sopra i pantaloni (restituisce true).
  /** Le orecchie da coniglio delle pantofole, ritte sulla punta (a parte: vanno sopra l'orlo). */
  const bunnyEars = (b: Pt, back: boolean, fwd: Dir): void => {
    if (shoes.style !== 'slippers') return;
    const sc = back ? game.darken(shoes.color, 0.18) : shoes.color;
    const [fx, fy] = fwd;
    const tip = {
      x: b.x + (fx - fy) * 0.866 * s * 4.8,
      y: b.y + 2 * s + (fx + fy) * 0.5 * s * 4.8 - 2.4 * s,
    };
    for (const side of [-1, 1]) {
      ctx.fillStyle = sc;
      ctx.beginPath();
      ctx.ellipse(tip.x + side * 0.9 * s, tip.y - 1.9 * s, 0.75 * s, 1.9 * s, side * 0.3, 0, 6.3);
      ctx.fill();
      ctx.fillStyle = '#ffeaa7';
      ctx.beginPath();
      ctx.ellipse(tip.x + side * 0.9 * s, tip.y - 1.8 * s, 0.33 * s, 1.2 * s, side * 0.3, 0, 6.3);
      ctx.fill();
    }
  };
  const drawShoe = (b: Pt, back: boolean, fwd: Dir): boolean => {
    const style: string = shoes.style;
    const tone = (c: string) => (back ? game.darken(c, 0.18) : c);
    const sc = tone(shoes.color);
    const sc2 = shoes.color2 || '#ffffff';
    const sk = tone(skin);
    const [fx, fy] = fwd;
    // assi sullo schermo per un'unità: avanti lungo il piede, di lato, in su
    const F = { x: (fx - fy) * 0.866 * s, y: (fx + fy) * 0.5 * s };
    const R = { x: (-fy - fx) * 0.866 * s, y: (-fy + fx) * 0.5 * s };
    // la caviglia (b) sta 2 unità sopra la suola
    const gx = b.x,
      gy = b.y + 2 * s;
    const at = (z: number) => ctx.setTransform(F.x, F.y, R.x, R.y, gx, gy - z * s);
    const screenAt = (u: number, z: number): Pt => ({
      x: gx + F.x * u,
      y: gy + F.y * u - z * s,
    });
    /** Sagoma del piede (u avanti, v di lato): tallone tondo, pianta più larga, punta tonda. */
    const foot = (inset = 0, ball = 2.3, heel = -2.4, tip = 5.8): void => {
      const h = Math.max(0.4, ball - 0.4 - inset),
        w = Math.max(0.4, ball - inset);
      const u0 = heel + inset,
        u1 = tip - inset;
      ctx.beginPath();
      ctx.moveTo(u0, 0);
      ctx.bezierCurveTo(u0, -h, 0, -w, 2.7, -w);
      ctx.bezierCurveTo(u1 - 0.8, -w, u1, -w * 0.6, u1, 0);
      ctx.bezierCurveTo(u1, w * 0.6, u1 - 0.8, w, 2.7, w);
      ctx.bezierCurveTo(0, w, u0, h, u0, 0);
      ctx.closePath();
    };
    /** Strati pieni da z0 a z1: il fianco della scarpa. */
    const slab = (z0: number, z1: number, color: string, shape: () => void): void => {
      ctx.fillStyle = color;
      for (let z = z0; z <= z1 + 1e-6; z += 0.3) {
        at(z);
        shape();
        ctx.fill();
      }
    };
    /** Il sopra della scarpa a quota z, con i dettagli disegnati dentro la sua sagoma. */
    const topFace = (z: number, color: string, shape: () => void, inside?: () => void): void => {
      at(z);
      shape();
      ctx.fillStyle = color;
      ctx.fill();
      if (inside) {
        ctx.save();
        shape();
        ctx.clip();
        inside();
        ctx.restore();
      }
      at(z);
      shape();
      ctx.strokeStyle = 'rgba(0,0,0,0.3)';
      ctx.lineWidth = 0.22;
      ctx.stroke();
    };
    const band = (u0: number, u1: number, color: string) => {
      ctx.fillStyle = color;
      ctx.fillRect(u0, -3, u1 - u0, 6);
    };
    const laces = (color: string) => {
      ctx.strokeStyle = color;
      ctx.lineWidth = 0.35;
      for (const u of [0.5, 1.3, 2.1]) {
        ctx.beginPath();
        ctx.moveTo(u, -0.75);
        ctx.lineTo(u + 0.25, 0.75);
        ctx.stroke();
      }
    };
    const toes = (u: number, color: string) => {
      ctx.fillStyle = color;
      for (const [v, r] of [
        [-1.25, 0.42],
        [-0.62, 0.4],
        [0, 0.38],
        [0.6, 0.35],
        [1.12, 0.32],
      ] as const) {
        ctx.beginPath();
        ctx.arc(u - Math.abs(v) * 0.35, v, r, 0, Math.PI * 2);
        ctx.fill();
      }
    };
    const shaft = (z0: number, z1: number, color: string) => {
      const ring = () => {
        ctx.beginPath();
        ctx.ellipse(-0.4, 0, 2.1, 2, 0, 0, Math.PI * 2);
      };
      slab(z0, z1, game.darken(color, 0.12), ring);
      topFace(z1, game.darken(color, 0.55), ring);
    };
    const plain = () => foot();
    const top = () => foot(0.25);
    switch (style) {
      case 'boots':
        slab(0, 0.7, game.darken(shoes.color, 0.5), plain);
        slab(0.7, 2.6, game.darken(sc, 0.15), plain);
        topFace(2.6, sc, top, () => band(4.1, 7, game.lighten(sc, 0.12)));
        break;
      case 'hightop':
        slab(0, 0.8, '#f5f6fa', plain);
        slab(0.8, 2.4, game.darken(sc, 0.15), plain);
        topFace(2.4, sc, top, () => {
          band(4, 7, '#f5f6fa');
          band(-3, -1.5, game.darken(sc, 0.2));
        });
        break;
      case 'formal': {
        const pointy = (inset = 0) => foot(inset, 1.9, -2.4, 6.3);
        slab(0, 0.5, '#0b0b0b', () => pointy());
        slab(0.5, 1.9, game.darken(sc, 0.2), () => pointy());
        topFace(
          1.9,
          sc,
          () => pointy(0.22),
          () => {
            ctx.fillStyle = 'rgba(255,255,255,0.4)';
            ctx.beginPath();
            ctx.ellipse(4.5, -0.4, 1.2, 0.45, 0, 0, Math.PI * 2);
            ctx.fill();
          },
        );
        break;
      }
      case 'heels': {
        const pump = (inset = 0) => foot(inset, 2.2, -2.4, 6.2);
        // il tacco a spillo sotto il tallone
        slab(0, 1.6, game.darken(shoes.color, 0.35), () => {
          ctx.beginPath();
          ctx.ellipse(-1.7, 0, 0.45, 0.45, 0, 0, Math.PI * 2);
        });
        slab(0, 1.4, game.darken(sc, 0.18), () => pump());
        topFace(
          1.4,
          sc,
          () => pump(0.2),
          () => {
            // scollata: si vede il collo del piede
            ctx.fillStyle = sk;
            ctx.beginPath();
            ctx.ellipse(0.6, 0, 2.3, 1.6, 0, 0, Math.PI * 2);
            ctx.fill();
            ctx.fillStyle = 'rgba(255,255,255,0.45)';
            ctx.beginPath();
            ctx.ellipse(4.6, -0.3, 0.8, 0.3, 0, 0, Math.PI * 2);
            ctx.fill();
          },
        );
        break;
      }
      case 'sandals': {
        const bare = (inset = 0) => foot(inset + 0.25, 2.15, -2.3, 5.6);
        slab(0, 0.5, game.darken(shoes.color, 0.25), () => foot(0, 2.45, -2.5, 6));
        slab(0.5, 1.4, game.darken(sk, 0.12), () => bare());
        topFace(
          1.4,
          sk,
          () => bare(0.15),
          () => {
            toes(5, game.lighten(sk, 0.08));
            band(0.7, 1.4, sc);
            band(3, 3.7, sc);
          },
        );
        break;
      }
      case 'barefoot': {
        // piede nudo: basso, tallone stretto e pianta larga, fianco appena più scuro della pelle
        // (scuro sembrerebbe una pantofola) e cinque dita che sporgono dalla punta
        const bare = (inset = 0) => foot(inset + 0.3, 2.15, -2.1, 5);
        slab(0, 0.9, game.darken(sk, 0.07), () => bare());
        at(0.9);
        bare(0.1);
        const tg = ctx.createLinearGradient(-2.2, 0, 5, 0);
        tg.addColorStop(0, game.darken(sk, 0.04));
        tg.addColorStop(1, game.lighten(sk, 0.06));
        ctx.fillStyle = tg;
        ctx.fill();
        ctx.strokeStyle = 'rgba(0,0,0,0.16)';
        ctx.lineWidth = 0.2;
        ctx.stroke();
        // le dita: appoggiate a terra, spuntano dalla base della punta (non stanno sopra il
        // piede); l'alluce più grosso, le altre via via più piccole e più indietro
        for (const [v, r, back] of [
          [-1.15, 0.72, 0.15],
          [-0.25, 0.56, 0.3],
          [0.5, 0.5, 0.55],
          [1.15, 0.45, 0.85],
          [1.65, 0.38, 1.2],
        ] as const) {
          for (const [z, color] of [
            [0, game.darken(sk, 0.1)],
            [0.25, game.darken(sk, 0.06)],
            [0.55, sk],
          ] as const) {
            at(z);
            ctx.beginPath();
            ctx.ellipse(4.85 - back, v, r * 1.15, r, 0, 0, Math.PI * 2);
            ctx.fillStyle = color;
            ctx.fill();
          }
          ctx.strokeStyle = 'rgba(0,0,0,0.18)';
          ctx.lineWidth = 0.15;
          ctx.stroke();
          // l'unghia
          ctx.beginPath();
          ctx.ellipse(4.95 - back, v, r * 0.5, r * 0.45, 0, 0, Math.PI * 2);
          ctx.fillStyle = game.lighten(sk, 0.28);
          ctx.fill();
        }
        break;
      }
      case 'slippers': {
        const fluffy = (inset = 0) => foot(inset, 2.6, -2.6, 6.1);
        slab(0, 2.4, game.darken(sc, 0.12), () => fluffy());
        topFace(
          2.4,
          sc,
          () => fluffy(0.2),
          () => {
            ctx.fillStyle = game.lighten(shoes.color, 0.35);
            ctx.beginPath();
            ctx.ellipse(-0.2, 0, 1.9, 1.4, 0, 0, Math.PI * 2);
            ctx.fill();
            ctx.fillStyle = '#2d3436';
            for (const v of [-0.7, 0.7]) {
              ctx.beginPath();
              ctx.arc(4.7, v, 0.3, 0, Math.PI * 2);
              ctx.fill();
            }
          },
        );
        break;
      }
      case 'checker':
        slab(0, 0.8, '#f5f6fa', plain);
        slab(0.8, 2.2, game.darken(sc, 0.15), plain);
        topFace(2.2, sc, top, () => {
          ctx.fillStyle = sc2;
          for (let i = -3; i < 8; i++)
            for (let j = -3; j < 3; j++) if ((i + j) % 2) ctx.fillRect(i * 1.1, j * 1.1, 1.1, 1.1);
        });
        break;
      default: {
        // sneakers: suola bianca, punta più chiara, lacci e il rinforzo del tallone
        const white = toRgb(shoes.color).every((v: number) => v > 220);
        slab(0, 0.8, white ? '#ced6e0' : '#f5f6fa', plain);
        slab(0.8, 2.3, game.darken(sc, 0.15), plain);
        topFace(2.3, sc, top, () => {
          band(4.1, 7, game.lighten(sc, 0.25));
          band(-3, -1.5, game.darken(sc, 0.18));
          laces(white ? '#b2bec3' : '#ffffff');
        });
      }
    }
    if (style === 'boots') shaft(2.6, 7.5, sc);
    else if (style === 'hightop') {
      shaft(2.4, 4.8, sc);
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      // lacci sul davanti del gambale
      for (let i = 0; i < 3; i++) {
        const p = screenAt(1.3, 2.9 + i * 0.7);
        seg({ x: p.x - 0.9 * s, y: p.y }, { x: p.x + 0.9 * s, y: p.y }, '#ffffff', 0.45 * s);
      }
    }
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    return style === 'boots' || style === 'hightop';
  };
  /** Il motivo dei pantaloni da a a end; `ankle`: il pezzo finisce alla caviglia (polsini). */
  const drawPantsPattern = (a: Pt, end: Pt, pc: string, ankle = true): void => {
    const c2 = pants.color2 || game.darken(pants.color, 0.3);
    const knee = lerpPt(a, end, 0.5);
    switch (pStyle) {
      case 'camo':
        [0.2, 0.5, 0.75].forEach((k, i) => {
          const p = lerpPt(a, end, k);
          dot(p.x + (i % 2 ? 1 : -1) * s, p.y, 1.4 * s, c2);
        });
        break;
      case 'jeans':
      case 'ripped': {
        const o = { x: 1.3 * s, y: 0 };
        seg(
          { x: a.x - o.x, y: a.y },
          { x: end.x - o.x, y: end.y - 1 * s },
          game.lighten(pc, 0.22),
          0.45 * s,
        );
        if (pStyle === 'ripped') {
          ctx.fillStyle = skin;
          ctx.beginPath();
          ctx.ellipse(knee.x, knee.y, 1.6 * s, 0.9 * s, 0, 0, 6.3);
          ctx.fill();
          for (const dy of [-0.5, 0.5])
            seg(
              { x: knee.x - 1.7 * s, y: knee.y + dy * s },
              { x: knee.x + 1.7 * s, y: knee.y + dy * s },
              'rgba(255,255,255,0.75)',
              0.3 * s,
            );
          const thigh = lerpPt(a, end, 0.22);
          seg(
            { x: thigh.x - 1 * s, y: thigh.y },
            { x: thigh.x + 1 * s, y: thigh.y },
            'rgba(255,255,255,0.6)',
            0.4 * s,
          );
        }
        break;
      }
      case 'joggers':
        seg({ x: a.x + 1.6 * s, y: a.y }, { x: end.x + 1.6 * s, y: end.y - 1.2 * s }, c2, 0.7 * s);
        if (ankle) seg(lerpPt(a, end, 0.9), end, game.darken(pc, 0.25), 5 * s);
        break;
      case 'cargo':
        ctx.fillStyle = c2;
        ctx.fillRect(knee.x - 2.4 * s, knee.y - 3 * s, 3.4 * s, 3.6 * s);
        seg(
          { x: knee.x - 2.4 * s, y: knee.y - 3 * s },
          { x: knee.x + 1 * s, y: knee.y - 3 * s },
          game.darken(c2, 0.3),
          0.8 * s,
        );
        break;
      case 'plaid':
        for (let k = 0.08; k < 0.98; k += 0.14) {
          const p = lerpPt(a, end, k);
          seg({ x: p.x - 2.2 * s, y: p.y }, { x: p.x + 2.2 * s, y: p.y }, c2, 0.6 * s);
        }
        seg(a, end, game.lighten(pc, 0.18), 0.5 * s);
        break;
      case 'sequin':
        for (let i = 0; i < 7; i++) {
          const p = lerpPt(a, end, 0.08 + i * 0.13);
          const tw2 = 0.5 + 0.5 * Math.sin(animTime * 6 + i * 1.7 + (p.x > hip.x ? 2 : 0));
          dot(
            p.x + (i % 2 ? 1.1 : -1.1) * s,
            p.y,
            (0.5 + 0.4 * tw2) * s,
            `rgba(255,250,210,${0.4 + 0.6 * tw2})`,
          );
        }
        break;
    }
  };
  // Le gambe si raccolgono e si disegnano tutte insieme (renderLegs): le scarpe vanno in ordine
  // di profondità, e quelle girate di spalle in parte dietro la gamba e in parte davanti.
  type Leg = { a: Pt; b: Pt; back: boolean; fwd: Dir; knee?: Pt };
  const legs: Leg[] = [];
  const drawLeg = (a: Pt, b: Pt, back: boolean, fwd: Dir, knee?: Pt): void => {
    legs.push({ a, b, back, fwd, knee });
  };
  const legPaint = (l: Leg) => {
    const pc = l.back ? game.darken(pants.color, 0.18) : pants.color;
    const width =
      (pStyle === 'shorts' || pStyle === 'briefs'
        ? 5.4
        : pStyle === 'cargo' || pStyle === 'joggers'
          ? 5
          : 4.6) * s;
    const sk = l.back ? game.darken(skin, 0.12) : skin;
    return { pc, width, sk };
  };
  /** Il tratto della gamba fino a `b` (di solito la caviglia; più su sopra scarpe e stivali). */
  const legStroke = (l: Leg, b: Pt = l.b): void => {
    const { a, knee } = l;
    const { pc, width, sk } = legPaint(l);
    if (knee) {
      // seduto: coscia in avanti, stinco verso il pavimento
      if (bareFrom < 1) {
        const cut = lerpPt(a, knee, Math.min(1, bareFrom * 2));
        seg(cut, knee, sk, 3.8 * s);
        seg(knee, b, sk, 3.8 * s);
        if (pStyle !== 'skirt') seg(a, cut, pc, width);
      } else {
        seg(a, knee, pc, width);
        seg(knee, b, pc, width);
        // il motivo dei pantaloni anche da seduti, su coscia e stinco
        drawPantsPattern(a, knee, pc, false);
        drawPantsPattern(knee, b, pc);
      }
      return;
    }
    const cut = lerpPt(a, b, bareFrom);
    if (bareFrom < 1) seg(cut, b, sk, 3.8 * s);
    if (pStyle !== 'skirt') {
      seg(a, cut, pc, width);
      drawPantsPattern(a, cut, pc);
    }
  };
  const tallShoes = shoes.style === 'boots' || shoes.style === 'hightop';
  /** Quota della cima del gambale di stivali e scarpe alte (sopra la suola). */
  const shaftTop = shoes.style === 'boots' ? 7.5 : 4.8;
  /** Scarpa girata di spalle (la punta va dietro la gamba); stivali e scarpe alte no. */
  const awayFoot = (l: Leg): boolean => l.fwd[0] + l.fwd[1] < -0.2 && !tallShoes;
  /** Larghezza del tratto finale della gamba (pantaloni o pelle). */
  const endWidth = (l: Leg): number => (bareFrom < 1 ? 3.8 * s : legPaint(l).width);
  /** Il punto sullo schermo del piede (u avanti, quota z) per una gamba. */
  const footPt = (l: Leg, u: number, z: number): Pt => ({
    x: l.b.x + (l.fwd[0] - l.fwd[1]) * 0.866 * s * u,
    y: l.b.y + 2 * s + (l.fwd[0] + l.fwd[1]) * 0.5 * s * u - z * s,
  });
  /**
   * Il bordo del gambale verso chi guarda, sopra i pantaloni che entrano nello stivale: la metà
   * davanti dell'anello in cima, col bordino chiaro.
   */
  const shaftFront = (l: Leg): void => {
    const [fx, fy] = l.fwd;
    const F = { x: (fx - fy) * 0.866 * s, y: (fx + fy) * 0.5 * s };
    const R = { x: (-fy - fx) * 0.866 * s, y: (-fy + fx) * 0.5 * s };
    const g = footPt(l, 0, shaftTop);
    const color = l.back ? game.darken(shoes.color, 0.18) : shoes.color;
    // la metà dell'anello che sullo schermo sta più in basso (più vicina)
    const phi = Math.atan2(R.y * 2, F.y * 2.1);
    ctx.setTransform(F.x, F.y, R.x, R.y, g.x, g.y);
    for (const [z, fill] of [
      [0.9, game.darken(color, 0.12)],
      [0, color],
    ] as const) {
      ctx.setTransform(F.x, F.y, R.x, R.y, g.x, g.y + z * s);
      ctx.beginPath();
      ctx.ellipse(-0.4, 0, 2.1, 2, 0, phi - Math.PI / 2, phi + Math.PI / 2);
      ctx.ellipse(-0.4, 0, 1.6, 1.5, 0, phi + Math.PI / 2, phi - Math.PI / 2, true);
      ctx.closePath();
      ctx.fillStyle = fill;
      ctx.fill();
    }
    ctx.setTransform(F.x, F.y, R.x, R.y, g.x, g.y);
    ctx.beginPath();
    ctx.ellipse(-0.4, 0, 2.1, 2, 0, phi - Math.PI / 2, phi + Math.PI / 2);
    ctx.strokeStyle = game.lighten(color, 0.3);
    ctx.lineWidth = 0.3;
    ctx.stroke();
    ctx.setTransform(1, 0, 0, 1, 0, 0);
  };
  /**
   * Ogni gamba con la sua scarpa, dal piede più lontano (più in alto sullo schermo) al più vicino:
   * così né la scarpa né il gambale dello stivale lontano passano sopra la gamba vicina.
   * - verso chi guarda: la scarpa sotto, la gamba che finisce tonda poco sopra la caviglia (niente
   *   orli posticci che taglierebbero le righe dei pantaloni), le orecchie del coniglio sopra;
   * - di spalle: scarpa e orecchie dietro la gamba, poi sopra di nuovo solo il tallone;
   * - stivali e scarpe alte: i pantaloni entrano nel gambale, il bordo davanti ci passa sopra.
   */
  const renderLegs = (): void => {
    for (const l of [...legs].sort((p, q) => p.b.y - q.b.y)) {
      const r = endWidth(l) / 2;
      drawShoe(l.b, l.back, l.fwd);
      if (tallShoes) {
        const top = footPt(l, -0.4, shaftTop);
        legStroke(l, { x: top.x, y: top.y - r });
        shaftFront(l);
      } else if (awayFoot(l)) {
        bunnyEars(l.b, l.back, l.fwd);
        legStroke(l);
        // il tallone torna sopra la gamba sotto la caviglia, ma non sul fondo tondo della gamba
        ctx.save();
        ctx.beginPath();
        ctx.rect(l.b.x - 30 * s, l.b.y - 0.2 * s, 60 * s, 30 * s);
        ctx.clip();
        ctx.beginPath();
        ctx.rect(l.b.x - 30 * s, l.b.y - 30 * s, 60 * s, 60 * s);
        ctx.arc(l.b.x, l.b.y, r, 0, Math.PI * 2);
        ctx.clip('evenodd');
        drawShoe(l.b, l.back, l.fwd);
        ctx.restore();
      } else {
        if (bareFrom < 1 && !l.knee && OPEN_SHOES.has(shoes.style)) {
          // gamba nuda in una scarpa scollata: scende dritta fin sul collo del piede, che è
          // pelle anche lui (con la punta tonda la caviglia sembrerebbe stringersi)
          ctx.lineCap = 'butt';
          legStroke(l, { x: l.b.x, y: l.b.y + 0.8 * s });
          ctx.lineCap = 'round';
        } else {
          // il fondo tondo della gamba arriva appena sotto la caviglia, sopra la tomaia
          legStroke(l, { x: l.b.x, y: l.b.y - r + 0.6 * s });
        }
        bunnyEars(l.b, l.back, l.fwd);
      }
    }
  };
  if (onStool) {
    // le ginocchia vanno sotto il bancone, i piedi sul poggiapiedi dello sgabello
    for (const [side, back] of [
      [1, true],
      [-1, false],
    ] as const)
      drawLeg(
        P(side * 3.5, 0, 22 + bob),
        P(side * 3.5, -9, -6),
        back,
        [0, -1],
        P(side * 3.5, -11, 17),
      );
  } else if (chairSide) {
    // ginocchia e piedi verso il tavolo; la gamba più lontana da chi guarda va dietro
    for (const [side, back] of [
      [-1, true],
      [1, false],
    ] as const)
      drawLeg(
        P(0, side * 3.5, 22 + bob),
        P(13, side * 3.5, 2 - lift),
        back,
        [1, 0],
        P(11, side * 3.5, 19),
      );
  } else if (chairAway) {
    // ginocchia e piedi sotto la scrivania, dalla parte opposta a chi guarda (il busto li copre)
    const sideways = pose === 'chairAwaySide';
    for (const side of [-1, 1]) {
      const at = (a: number, b: number, z: number) =>
        sideways ? P(-b, side * 3.5 + a, z) : P(side * 3.5 + a, -b, z);
      drawLeg(
        at(0, 0, 22 + bob),
        at(0, 13, 2 - lift),
        true,
        sideways ? [-1, 0] : [0, -1],
        at(0, 11, 19),
      );
    }
  } else if (sitting) {
    for (const [side, back] of [
      [1, true],
      [-1, false],
    ] as const)
      drawLeg(
        P(side * 3.5, 0, 22 + bob),
        P(side * 3.5, 14, 2 - lift),
        back,
        [0, 1],
        P(side * 3.5, 11, 19),
      );
  } else {
    // in piedi i piedi guardano dove va (o verso chi guarda, o di spalle), un po' aperti
    const walkDir = moving && wl > 0.01;
    const face: Dir = walkDir
      ? [dX, dY]
      : fromBehind
        ? [-Math.SQRT1_2, -Math.SQRT1_2]
        : [Math.SQRT1_2, Math.SQRT1_2];
    const spread = walkDir ? 0.12 : 0.32;
    /** Gira il piede verso l'esterno: `side` è il lato dello schermo (1 = destra). */
    const splay = (side: number): Dir => {
      const turn = (a: number): Dir => [
        face[0] * Math.cos(a) + face[1] * Math.sin(a),
        -face[0] * Math.sin(a) + face[1] * Math.cos(a),
      ];
      const [p, q] = [turn(spread), turn(-spread)];
      return side * (p[0] - p[1]) > side * (q[0] - q[1]) ? p : q;
    };
    drawLeg(
      P(3, -3, 22 + bob + crotchLift),
      P(3 - swing * STRIDE * dX, -3 - swing * STRIDE * dY, 2 + liftBack),
      true,
      splay(1),
    );
    drawLeg(
      P(-3, 3, 22 + bob + crotchLift),
      P(-3 + swing * STRIDE * dX, 3 + swing * STRIDE * dY, 2 + liftFront),
      false,
      splay(-1),
    );
  }
  // Gambe e bacino. Seduti verso chi guarda le cosce vengono in avanti e passano davanti al
  // busto: si disegnano dopo (prima della vita, così la gonna resta sopra e le mani in grembo pure).
  // Il bacino dei pantaloni (la gonna lascia le gambe). In piedi: dalla vita all'attacco delle
  // gambe, con la V in mezzo, sopra le gambe. Seduti verso chi guarda: sotto le cosce, e segue la
  // loro direzione (dalla vita fino a un terzo della coscia), così le cosce ne escono senza
  // scalini invece di sbucare da sotto una scatola.
  const pelvis = (): void => {
    if (pStyle === 'skirt' || waistY >= crotchY) return;
    // dallo stesso colore della gamba vicina (a sinistra) a quello della lontana (a destra)
    const pg = ctx.createLinearGradient(hip.x - 6 * s, 0, hip.x + 6 * s, 0);
    pg.addColorStop(0, pants.color);
    pg.addColorStop(1, game.darken(pants.color, 0.18));
    ctx.fillStyle = pg;
    ctx.beginPath();
    if (lapOverTorso) {
      const pts: Pt[] = [
        { x: hip.x - 7.5 * s, y: waistY },
        { x: hip.x + 7.5 * s, y: waistY },
      ];
      for (const l of legs) {
        const end = lerpPt(l.a, l.knee || l.b, 0.35);
        const half = legPaint(l).width / 2;
        for (const q of [l.a, end])
          for (const [dx, dy] of [
            [half, 0],
            [-half, 0],
            [0, half],
            [0, -half],
          ])
            pts.push({ x: q.x + dx, y: q.y + dy });
      }
      convexHull(pts).forEach((q, n) => (n ? ctx.lineTo(q.x, q.y) : ctx.moveTo(q.x, q.y)));
    } else {
      ctx.moveTo(hip.x - 7.5 * s, waistY);
      ctx.lineTo(hip.x + 7.5 * s, waistY);
      ctx.lineTo(hip.x + 7.6 * s, crotchY - 1 * s);
      ctx.lineTo(hip.x, crotchY);
      ctx.lineTo(hip.x - 7.6 * s, crotchY - 1 * s);
    }
    ctx.closePath();
    ctx.fill();
    // i motivi che coprono tutta la stoffa continuano anche qui, come sulle gambe
    if (pStyle === 'camo' || pStyle === 'plaid' || pStyle === 'sequin') {
      ctx.save();
      ctx.clip();
      for (const dx of [-3.6, 3.6])
        drawPantsPattern(
          { x: hip.x + dx * s, y: waistY - 1 * s },
          { x: hip.x + dx * s, y: hip.y + 5 * s },
          pants.color,
        );
      ctx.restore();
    }
  };
  const lowerBody = (): void => {
    if (lapOverTorso) {
      pelvis();
      renderLegs();
    } else {
      renderLegs();
      pelvis();
    }
  };
  if (!lapOverTorso) lowerBody();
  // ---- braccia: manica lunga, corta o niente
  const sleeveKind =
    top.style === 'tank' || top.style === 'bare'
      ? 'none'
      : SHORT_SLEEVES.has(top.style)
        ? 'short'
        : 'long';
  // mani: al lavandino si strofinano davanti al petto, seduti stanno sulle ginocchia; sul WC
  // reggono il giornale per i bordi, coi gomiti piegati
  const rub = pose === 'wash' ? Math.sin(animTime * 16) * 1.6 * s : 0;
  const reading = !!(sitting && opts && opts.newspaper);
  const tap = pose === 'wash' ? underTap(neck, s) : null;
  // nel panico (in ufficio arriva il capo) le braccia stanno alzate e si agitano
  const flap = pose === 'panic' ? Math.sin(animTime * 18) * 2.5 * s : 0;
  // La mano sale alla bocca e si abbassa, con la canna tra le dita.
  const smokingHand: Pt | null =
    pose === 'smoke'
      ? { x: head.x - 3 * s, y: head.y + (6 + (1 - Math.sin(animTime * 2.6)) * 5) * s }
      : null;
  // al bancone le mani stanno sul piano; per bere una sale col bicchiere fino alla bocca
  const sip: number = (opts && opts.sip) || 0;
  const stoolBack: Pt | null = onStool ? lerpPt(P(5, -10, 32), P(5, -5, 53), sip) : null;
  const handBack: Pt | null = opts?.hands
    ? opts.hands.back
    : chairSide
      ? P(10, -3.5, 24.5)
      : stoolBack
        ? stoolBack
        : pose === 'panic'
          ? { x: neck.x + 9 * s, y: neck.y - 15 * s + flap }
          : tap
            ? { x: tap.x + 2.5 * s + rub, y: tap.y - 0.5 * s - Math.abs(rub) * 0.4 }
            : pose === 'wash'
              ? { x: neck.x + 3 * s + rub, y: hip.y - 6 * s }
              : reading
                ? { x: neck.x + 9 * s, y: neck.y + 11 * s }
                : sitting
                  ? lapOverTorso
                    ? { x: hip.x + 3.5 * s, y: hip.y + 3 * s }
                    : { x: P(3.5, 11, 20).x + 1 * s, y: P(3.5, 11, 20).y - 1 * s }
                  : null;
  const handFront: Pt | null = smokingHand
    ? smokingHand
    : opts?.hands
      ? opts.hands.front
      : chairSide
        ? P(10, 3.5, 24.5)
        : onStool
          ? P(-4, -12, 32)
          : pose === 'panic'
            ? { x: neck.x - 9 * s, y: neck.y - 15 * s - flap }
            : tap
              ? { x: tap.x - 2.5 * s - rub, y: tap.y + 0.8 * s }
              : pose === 'wash'
                ? { x: neck.x - 3 * s - rub, y: hip.y - 5 * s }
                : reading
                  ? { x: neck.x - 9 * s, y: neck.y + 11 * s }
                  : sitting
                    ? lapOverTorso
                      ? { x: hip.x - 3.5 * s, y: hip.y + 3 * s }
                      : { x: P(-3.5, 11, 20).x - 1 * s, y: P(-3.5, 11, 20).y - 1 * s }
                    : null;
  const drawArm = (from: Pt, to: Pt, back: boolean): void => {
    if (lapOverTorso && !reading && !opts?.hands) {
      // seduti: le due braccia uguali, specchiate: scendono lungo i fianchi, il gomito si piega
      // e gli avambracci vanno in diagonale verso il bacino, con le mani in grembo
      // il gomito all'altezza giusta: poco più di metà tra spalla e anca, appena in fuori
      const elbow = { x: from.x + (back ? 1.2 : -1.2) * s, y: from.y + (hip.y - from.y) * 0.58 };
      armPiece(from, elbow, back, true);
      armPiece(elbow, to, back, false);
      dot(to.x, to.y, 2.6 * s, armSkin(back));
      return;
    }
    if (reading || (pose === 'smoke' && !back)) {
      // gomito sotto la spalla, un po' in fuori: il braccio sale di nuovo verso il giornale
      const elbow = { x: from.x + (back ? 2.5 : -2.5) * s, y: neck.y + 16 * s };
      armPiece(from, elbow, back, true);
      armPiece(elbow, to, back, false);
      dot(elbow.x, elbow.y, 1.8 * s, sleeveKind === 'long' ? armSleeve(back) : armSkin(back));
      dot(to.x, to.y, 2.6 * s, armSkin(back));
      return;
    }
    const sc = armSleeve(back);
    const sk = armSkin(back);
    const w = (top.style === 'puffer' ? 4.8 : 3.6) * s;
    if (sleeveKind === 'none') seg(from, to, sk, 3 * s);
    else if (sleeveKind === 'short') {
      const m = lerpPt(from, to, 0.42);
      seg(m, to, sk, 3 * s);
      seg(from, m, sc, w);
      if (top.style === 'jersey' || top.style === 'polo')
        seg(lerpPt(from, to, 0.36), m, top.color2 || '#ffffff', w);
    } else {
      seg(from, to, sc, w);
      const cuff =
        top.style === 'suit' || top.style === 'tuxedo'
          ? '#ffffff'
          : top.style === 'vest'
            ? game.darken(top.color, 0.12)
            : game.darken(sc, 0.22);
      seg(lerpPt(from, to, 0.86), lerpPt(from, to, 0.93), cuff, w);
      if (top.style === 'sport') seg(from, to, top.color2, 0.9 * s);
      if (top.style === 'puffer')
        for (const k of [0.3, 0.6]) {
          const p = lerpPt(from, to, k);
          seg(
            { x: p.x - 2 * s, y: p.y },
            { x: p.x + 2 * s, y: p.y },
            game.darken(sc, 0.18),
            0.5 * s,
          );
        }
    }
    dot(to.x, to.y, 2.6 * s, sk);
  };
  function armSleeve(back: boolean): string {
    return back ? game.darken(top.color, 0.3) : game.darken(top.color, 0.08);
  }
  function armSkin(back: boolean): string {
    return back ? game.darken(skin, 0.12) : skin;
  }
  // un pezzo di braccio piegato: la manica corta copre solo il braccio, quella lunga tutto
  function armPiece(a: Pt, b: Pt, back: boolean, upper: boolean): void {
    const w = (top.style === 'puffer' ? 4.8 : 3.6) * s;
    if (sleeveKind === 'long') seg(a, b, armSleeve(back), w);
    else if (sleeveKind === 'short' && upper) {
      const m = lerpPt(a, b, 0.7);
      seg(m, b, armSkin(back), 3 * s);
      seg(a, m, armSleeve(back), w);
    } else seg(a, b, armSkin(back), 3 * s);
  }
  const backTo: Pt = handBack || { x: hip.x + 11 * s + armX, y: hip.y + 1 * s + armY },
    frontTo: Pt = handFront || { x: hip.x - 11 * s - armX, y: hip.y + 1 * s - armY };
  if (handsAt.size > 200) handsAt.clear();
  handsAt.set(x + ',' + y, [backTo, frontTo]);
  // ---- dietro il busto: capelli che scendono (di spalle lunghi, coda e caschetto si disegnano
  // sopra, in drawHairFromBehind) e il collo, che così entra nello scollo invece di coprirlo
  if (!mannequin && !(fromBehind && [2, 3, 6].includes(bd.hairStyle)))
    drawHairBack(head, s, bd.hairStyle, hair);
  ctx.fillStyle = skin;
  ctx.fillRect(neck.x - 2.5 * s, neck.y - 5 * s, 5 * s, 7 * s);
  // ombra del mento sul collo
  ctx.fillStyle = 'rgba(0,0,0,0.12)';
  ctx.fillRect(neck.x - 2.5 * s, neck.y - 5 * s, 5 * s, 2 * s);
  // al bancone il braccio verso lo schermo si disegna dopo il busto, piegato (vedi stoolArm)
  // seduti verso chi guarda si disegna dopo le gambe (sopra la coscia), vedi più sotto
  if (!onStool && !lapOverTorso)
    drawArm({ x: neck.x + tw - 1 * s, y: neck.y + 3 * s }, backTo, true);
  // di spalle anche l'altro braccio va in avanti, dietro il busto
  if (fromBehind) drawArm({ x: neck.x - tw + 1 * s, y: neck.y + 3 * s }, frontTo, false);

  // ---- cappuccio (dietro al collo)
  if (top.style === 'hoodie') {
    ctx.fillStyle = game.darken(top.color, 0.2);
    ctx.beginPath();
    ctx.ellipse(neck.x + 1 * s, neck.y - 2 * s, 8 * s, 4.5 * s, 0, 0, 6.3);
    ctx.fill();
  }
  // ---- busto con il motivo del capo
  const torsoPath = (): void => {
    ctx.beginPath();
    ctx.moveTo(hip.x - 7.5 * s, tyBot);
    ctx.lineTo(hip.x + 7.5 * s, tyBot);
    ctx.lineTo(neck.x + tw, neck.y + 4 * s);
    ctx.quadraticCurveTo(neck.x + tw, neck.y - 1 * s, neck.x + tw - 4 * s, neck.y - 1 * s);
    ctx.lineTo(neck.x - tw + 4 * s, neck.y - 1 * s);
    ctx.quadraticCurveTo(neck.x - tw, neck.y - 1 * s, neck.x - tw, neck.y + 4 * s);
    ctx.closePath();
  };
  const grad = ctx.createLinearGradient(neck.x - tw, 0, neck.x + tw, 0);
  grad.addColorStop(0, game.lighten(top.color, 0.18));
  grad.addColorStop(1, game.darken(top.color, 0.25));
  torsoPath();
  ctx.fillStyle = grad;
  ctx.fill();
  ctx.save();
  torsoPath();
  ctx.clip();
  const c2: GameValue = top.color2 || '#ffffff';
  const tx: GameValue = neck.x - tw,
    tW: GameValue = tw * 2;
  const vNeck = (depth: number, color: string, half = 3.8) => {
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.moveTo(neck.x - half * s, tyTop);
    ctx.lineTo(neck.x + half * s, tyTop);
    ctx.lineTo(neck.x, tyTop + tH * depth);
    ctx.fill();
  };
  // girocollo: la pelle dello scollo, poi il bordino
  const crewNeck = (color: string) => {
    ctx.fillStyle = skin;
    ctx.beginPath();
    ctx.ellipse(neck.x, tyTop, 3.4 * s, 2.4 * s, 0, 0, Math.PI);
    ctx.fill();
    ctx.fillStyle = 'rgba(0,0,0,0.1)';
    ctx.beginPath();
    ctx.ellipse(neck.x, tyTop, 2.5 * s, 1.2 * s, 0, 0, Math.PI);
    ctx.fill();
    ctx.strokeStyle = color;
    ctx.lineWidth = 1.1 * s;
    ctx.beginPath();
    ctx.ellipse(neck.x, tyTop, 3.4 * s, 2.4 * s, 0, 0.05, Math.PI - 0.05);
    ctx.stroke();
  };
  const buttons = (from: number, to: number, n: number, color = 'rgba(0,0,0,0.45)') => {
    for (let i = 0; i < n; i++)
      dot(neck.x, tyTop + tH * (from + ((to - from) * i) / Math.max(1, n - 1)), 0.7 * s, color);
  };
  if (fromBehind) drawTorsoBack(top, skin, neck, tyTop, tyBot, tH, tx, tW, s);
  else
    switch (top.style) {
      case 'stripes':
        ctx.fillStyle = c2;
        for (let v = tyTop + 2 * s; v < tyBot; v += 4 * s) ctx.fillRect(tx, v, tW, 2 * s);
        crewNeck(game.darken(c2, 0.2));
        break;
      case 'hawaii':
        for (let i = 0; i < 9; i++) {
          const px = tx + rnd(i) * tW,
            py = tyTop + rnd(i + 5) * tH;
          for (let p = 0; p < 5; p++)
            dot(
              px + Math.cos(p * 1.256) * 1.5 * s,
              py + Math.sin(p * 1.256) * 1.5 * s,
              1.1 * s,
              i % 2 ? c2 : '#ffffff',
            );
          dot(px, py, 0.8 * s, '#feca57');
        }
        vNeck(0.3, game.lighten(top.color, 0.2), 4.2);
        buttons(0.4, 0.9, 3);
        break;
      case 'sport':
        ctx.fillStyle = c2;
        ctx.fillRect(tx + 2 * s, tyTop, 1.6 * s, tH);
        ctx.fillRect(tx + tW - 3.6 * s, tyTop, 1.6 * s, tH);
        ctx.fillStyle = 'rgba(255,255,255,0.75)';
        ctx.fillRect(neck.x - 0.4 * s, tyTop, 0.8 * s, tH);
        break;
      case 'xmas': {
        ctx.fillStyle = c2;
        ctx.fillRect(tx, tyTop + tH * 0.3, tW, 1.3 * s);
        ctx.fillRect(tx, tyTop + tH * 0.7, tW, 1.3 * s);
        ctx.strokeStyle = '#27ae60';
        ctx.lineWidth = 1.4 * s;
        ctx.beginPath();
        for (let u = 0, i = 0; u <= tW; u += 2.5 * s, i++) {
          const vv = tyTop + tH * 0.5 + (i % 2 ? -1.6 : 1.6) * s;
          if (i === 0) ctx.moveTo(tx + u, vv);
          else ctx.lineTo(tx + u, vv);
        }
        ctx.stroke();
        for (let u = 2 * s; u < tW; u += 5 * s) dot(tx + u, tyTop + tH * 0.15, 0.8 * s, '#ffffff');
        break;
      }
      case 'suit':
      case 'tuxedo': {
        vNeck(0.58, '#ffffff');
        ctx.strokeStyle = 'rgba(0,0,0,0.4)';
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(neck.x - 4 * s, tyTop);
        ctx.lineTo(neck.x - 1 * s, tyTop + tH * 0.6);
        ctx.moveTo(neck.x + 4 * s, tyTop);
        ctx.lineTo(neck.x + 1 * s, tyTop + tH * 0.6);
        ctx.stroke();
        // risvolti
        ctx.fillStyle = top.style === 'tuxedo' ? '#2f3542' : game.lighten(top.color, 0.12);
        for (const side of [-1, 1]) {
          ctx.beginPath();
          ctx.moveTo(neck.x + side * 4 * s, tyTop);
          ctx.lineTo(neck.x + side * 6.5 * s, tyTop + tH * 0.2);
          ctx.lineTo(neck.x + side * 1.2 * s, tyTop + tH * 0.6);
          ctx.closePath();
          ctx.fill();
        }
        if (top.style === 'suit') {
          ctx.fillStyle = c2;
          ctx.beginPath();
          ctx.moveTo(neck.x - 1.1 * s, tyTop + 0.8 * s);
          ctx.lineTo(neck.x + 1.1 * s, tyTop + 0.8 * s);
          ctx.lineTo(neck.x + 1.7 * s, tyTop + tH * 0.48);
          ctx.lineTo(neck.x, tyTop + tH * 0.6);
          ctx.lineTo(neck.x - 1.7 * s, tyTop + tH * 0.48);
          ctx.closePath();
          ctx.fill();
        } else {
          buttons(0.25, 0.48, 3, '#2d3436');
          ctx.fillStyle = '#111111';
          ctx.beginPath();
          ctx.moveTo(neck.x, tyTop + 1.6 * s);
          ctx.lineTo(neck.x - 2.8 * s, tyTop + 0.4 * s);
          ctx.lineTo(neck.x - 2.8 * s, tyTop + 2.8 * s);
          ctx.closePath();
          ctx.moveTo(neck.x, tyTop + 1.6 * s);
          ctx.lineTo(neck.x + 2.8 * s, tyTop + 0.4 * s);
          ctx.lineTo(neck.x + 2.8 * s, tyTop + 2.8 * s);
          ctx.closePath();
          ctx.fill();
          // fazzoletto nel taschino
          ctx.fillStyle = '#ffffff';
          ctx.fillRect(neck.x - 6.8 * s, tyTop + tH * 0.32, 2.4 * s, 1 * s);
        }
        buttons(0.72, 0.86, 2, 'rgba(0,0,0,0.5)');
        break;
      }
      case 'jacket':
        ctx.fillStyle = c2;
        ctx.fillRect(neck.x - 2.6 * s, tyTop, 5.2 * s, tH);
        ctx.strokeStyle = 'rgba(0,0,0,0.4)';
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(neck.x - 2.6 * s, tyTop);
        ctx.lineTo(neck.x - 2.6 * s, tyBot);
        ctx.moveTo(neck.x + 2.6 * s, tyTop);
        ctx.lineTo(neck.x + 2.6 * s, tyBot);
        ctx.stroke();
        ctx.fillStyle = game.lighten(top.color, 0.15);
        for (const side of [-1, 1]) {
          ctx.beginPath();
          ctx.moveTo(neck.x + side * 2.6 * s, tyTop);
          ctx.lineTo(neck.x + side * 6.5 * s, tyTop);
          ctx.lineTo(neck.x + side * 2.6 * s, tyTop + 5 * s);
          ctx.fill();
        }
        // taschini
        ctx.strokeStyle = 'rgba(0,0,0,0.3)';
        ctx.lineWidth = 0.6 * s;
        ctx.strokeRect(neck.x - 7 * s, tyTop + tH * 0.3, 3 * s, 2.6 * s);
        ctx.strokeRect(neck.x + 4 * s, tyTop + tH * 0.3, 3 * s, 2.6 * s);
        break;
      case 'hoodie':
        ctx.fillStyle = game.darken(top.color, 0.18);
        ctx.fillRect(neck.x - 5 * s, tyTop + tH * 0.6, 10 * s, tH * 0.27);
        ctx.strokeStyle = c2;
        ctx.lineWidth = 0.9 * s;
        ctx.beginPath();
        ctx.moveTo(neck.x - 1.6 * s, tyTop);
        ctx.lineTo(neck.x - 1.6 * s, tyTop + 6 * s);
        ctx.moveTo(neck.x + 1.6 * s, tyTop);
        ctx.lineTo(neck.x + 1.6 * s, tyTop + 6 * s);
        ctx.stroke();
        dot(neck.x - 1.6 * s, tyTop + 6.3 * s, 0.6 * s, c2);
        dot(neck.x + 1.6 * s, tyTop + 6.3 * s, 0.6 * s, c2);
        break;
      case 'print':
        crewNeck(game.lighten(top.color, 0.25));
        starPath(neck.x, tyTop + tH * 0.48, 4 * s);
        ctx.fillStyle = c2;
        ctx.fill();
        ctx.strokeStyle = game.darken(c2, 0.35);
        ctx.lineWidth = 0.5 * s;
        ctx.stroke();
        break;
      case 'bare':
        dot(neck.x, tyTop + tH * 0.78, 0.6 * s, game.darken(skin, 0.3));
        seg(
          { x: neck.x - 4 * s, y: tyTop + tH * 0.3 },
          { x: neck.x - 1 * s, y: tyTop + tH * 0.34 },
          game.darken(skin, 0.15),
          0.5 * s,
        );
        seg(
          { x: neck.x + 4 * s, y: tyTop + tH * 0.3 },
          { x: neck.x + 1 * s, y: tyTop + tH * 0.34 },
          game.darken(skin, 0.15),
          0.5 * s,
        );
        break;
      case 'tank':
        tankCutouts(neck, tyTop, tH, tw, s, skin, c2, false);
        break;
      case 'polo':
        ctx.fillStyle = game.lighten(top.color, 0.12);
        ctx.fillRect(neck.x - 1.2 * s, tyTop, 2.4 * s, tH * 0.35);
        buttons(0.12, 0.3, 2, '#ffffff');
        ctx.fillStyle = c2;
        for (const side of [-1, 1]) {
          ctx.beginPath();
          ctx.moveTo(neck.x, tyTop + 0.6 * s);
          ctx.lineTo(neck.x + side * 4.6 * s, tyTop - 0.6 * s);
          ctx.lineTo(neck.x + side * 3.4 * s, tyTop + 2.6 * s);
          ctx.closePath();
          ctx.fill();
        }
        break;
      case 'plaid':
        for (let u = 0; u < tW; u += 4 * s) {
          ctx.fillStyle = c2 + '99';
          ctx.fillRect(tx + u, tyTop, 1.6 * s, tH);
        }
        for (let v = tyTop; v < tyBot; v += 4 * s) {
          ctx.fillStyle = c2 + '77';
          ctx.fillRect(tx, v, tW, 1.6 * s);
        }
        for (let u = 2.4 * s; u < tW; u += 4 * s) {
          ctx.fillStyle = 'rgba(255,255,255,0.25)';
          ctx.fillRect(tx + u, tyTop, 0.4 * s, tH);
        }
        vNeck(0.22, game.darken(top.color, 0.15), 3.6);
        buttons(0.3, 0.92, 4, '#f5f6fa');
        break;
      case 'sweater':
        for (let u = 1 * s; u < tW; u += 2 * s)
          seg({ x: tx + u, y: tyTop }, { x: tx + u, y: tyBot }, 'rgba(0,0,0,0.1)', 0.5 * s);
        ctx.fillStyle = game.darken(top.color, 0.15);
        ctx.fillRect(tx, tyBot - 3 * s, tW, 3 * s);
        break;
      case 'jersey':
        vNeck(0.18, c2, 3.4);
        ctx.fillStyle = c2;
        ctx.fillRect(tx, tyTop, 2.4 * s, tH);
        ctx.fillRect(tx + tW - 2.4 * s, tyTop, 2.4 * s, tH);
        ctx.font = `bold ${7 * s}px sans-serif`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText('10', neck.x, tyTop + tH * 0.55);
        ctx.textBaseline = 'alphabetic';
        break;
      case 'vest':
        vNeck(0.2, game.darken(top.color, 0.08), 3);
        ctx.fillStyle = c2;
        for (const side of [-1, 1]) {
          ctx.beginPath();
          ctx.moveTo(neck.x + side * 4.6 * s, tyTop - 1 * s);
          ctx.lineTo(neck.x + side * tw * 1.2, tyTop - 1 * s);
          ctx.lineTo(neck.x + side * tw * 1.2, tyBot);
          ctx.lineTo(neck.x + side * 0.5 * s, tyBot);
          ctx.lineTo(neck.x + side * 0.5 * s, tyTop + tH * 0.5);
          ctx.closePath();
          ctx.fill();
        }
        buttons(0.58, 0.92, 3, '#dfe6e9');
        ctx.fillStyle = 'rgba(0,0,0,0.25)';
        ctx.fillRect(neck.x - 6.4 * s, tyTop + tH * 0.62, 2.6 * s, 0.6 * s);
        ctx.fillRect(neck.x + 3.8 * s, tyTop + tH * 0.62, 2.6 * s, 0.6 * s);
        break;
      case 'puffer':
        for (let v = tyTop + 3 * s; v < tyBot; v += 3.4 * s) {
          seg({ x: tx, y: v }, { x: tx + tW, y: v }, game.darken(top.color, 0.2), 0.6 * s);
          seg(
            { x: tx, y: v - 1.6 * s },
            { x: tx + tW, y: v - 1.6 * s },
            'rgba(255,255,255,0.18)',
            0.9 * s,
          );
        }
        seg(
          { x: neck.x, y: tyTop },
          { x: neck.x, y: tyBot },
          game.darken(top.color, 0.35),
          0.7 * s,
        );
        dot(neck.x, tyTop + 2.5 * s, 0.8 * s, '#dfe6e9');
        break;
      default:
        crewNeck(game.darken(top.color, 0.22));
    }
  if (female && !fromBehind) drawBust(neck, tyTop, tH, s);
  // pieghe e ombra verso il basso
  const fold = ctx.createLinearGradient(0, tyTop, 0, tyBot);
  fold.addColorStop(0, 'rgba(255,255,255,0.08)');
  fold.addColorStop(1, 'rgba(0,0,0,0.14)');
  ctx.fillStyle = fold;
  ctx.fillRect(tx, tyTop, tW, tH);
  ctx.restore();
  torsoPath();
  ctx.strokeStyle = 'rgba(0,0,0,0.3)';
  ctx.lineWidth = 1;
  ctx.stroke();
  if (onStool) {
    // di spalle al bancone: il braccio scende lungo il fianco e il gomito si piega verso il
    // piano, così si vede attaccato alla spalla invece di spuntare da dietro la schiena
    const shoulder = { x: neck.x + tw - 1.5 * s, y: neck.y + 3 * s };
    const elbow = { x: shoulder.x + 2.5 * s, y: shoulder.y + 9 * s };
    armPiece(shoulder, elbow, true, true);
    armPiece(elbow, backTo, true, false);
    dot(backTo.x, backTo.y, 2.6 * s, armSkin(true));
  }
  if (fromBehind && top.style === 'hoodie') {
    ctx.fillStyle = game.darken(top.color, 0.15);
    ctx.beginPath();
    ctx.moveTo(neck.x - 6 * s, tyTop - 1 * s);
    ctx.quadraticCurveTo(neck.x - 6.5 * s, tyTop + tH * 0.42, neck.x, tyTop + tH * 0.5);
    ctx.quadraticCurveTo(neck.x + 6.5 * s, tyTop + tH * 0.42, neck.x + 6 * s, tyTop - 1 * s);
    ctx.closePath();
    ctx.fill();
    ctx.strokeStyle = 'rgba(0,0,0,0.25)';
    ctx.lineWidth = 0.7 * s;
    ctx.stroke();
  }
  if (top.style === 'puffer') {
    ctx.fillStyle = game.darken(top.color, 0.1);
    ctx.beginPath();
    ctx.roundRect
      ? ctx.roundRect(neck.x - 5.5 * s, tyTop - 2.5 * s, 11 * s, 3.6 * s, 1.6 * s)
      : ctx.rect(neck.x - 5.5 * s, tyTop - 2.5 * s, 11 * s, 3.6 * s);
    ctx.fill();
  }

  if (lapOverTorso) lowerBody();

  // ---- vita: orlo del capo lungo, oppure elastico e cintura dei pantaloni
  if (nude) {
    // niente elastico né cintura
  } else if (pStyle === 'skirt') {
    drawSkirt(
      hip,
      waistY,
      s,
      pants.color,
      chairAway || onStool ? 'back' : sitting ? 'sit' : 'stand',
    );
  } else if (LONG_TOPS.has(top.style)) {
    ctx.fillStyle = 'rgba(0,0,0,0.28)';
    ctx.fillRect(hip.x - 7.5 * s, hip.y - 1 * s, 15 * s, 3 * s);
  } else {
    ctx.fillStyle = game.darken(pants.color, 0.08);
    ctx.fillRect(hip.x - 7.5 * s, waistY - 0.5 * s, 15 * s, 2.6 * s);
    if (BELT_PANTS.has(pStyle)) {
      ctx.fillStyle = '#3e2723';
      ctx.fillRect(hip.x - 7.5 * s, waistY + 0.1 * s, 15 * s, 1.4 * s);
      ctx.fillStyle = '#d4af37';
      ctx.fillRect(hip.x - 1.2 * s, waistY - 0.2 * s, 2.4 * s, 2 * s);
      ctx.fillStyle = '#3e2723';
      ctx.fillRect(hip.x - 0.5 * s, waistY + 0.3 * s, 1 * s, 1 * s);
    } else if (pStyle === 'joggers') {
      seg(
        { x: hip.x - 0.6 * s, y: waistY + 1.5 * s },
        { x: hip.x - 1 * s, y: waistY + 4 * s },
        '#ffffff',
        0.4 * s,
      );
      seg(
        { x: hip.x + 0.6 * s, y: waistY + 1.5 * s },
        { x: hip.x + 1 * s, y: waistY + 4 * s },
        '#ffffff',
        0.4 * s,
      );
    }
  }

  // ---- accessori sul davanti del busto (di spalle non si vedono)
  if (neckItem && !fromBehind) drawNeckFront(neckItem, neck, tyTop, tH, tw, s);

  // ---- braccio davanti
  if (lapOverTorso) drawArm({ x: neck.x + tw - 1 * s, y: neck.y + 3 * s }, backTo, true);
  if (!fromBehind) drawArm({ x: neck.x - tw + 1 * s, y: neck.y + 3 * s }, frontTo, false);
  // schiuma del sapone tra le mani, sotto il getto
  if (pose === 'wash')
    for (let i = 0; i < 8; i++) {
      const k = (animTime * 1.3 + i / 8) % 1;
      const cx = tap ? tap.x : neck.x,
        cy = tap ? tap.y : hip.y - 6 * s;
      const bx = cx + Math.sin(i * 2.3 + animTime * 3) * 5 * s;
      const by = cy - k * 7 * s;
      ctx.fillStyle = `rgba(255,255,255,${0.85 * (1 - k)})`;
      ctx.strokeStyle = `rgba(116,185,255,${0.8 * (1 - k)})`;
      ctx.lineWidth = 0.6;
      ctx.beginPath();
      ctx.arc(bx, by, (1.2 + (i % 3) * 0.5) * s, 0, 6.3);
      ctx.fill();
      ctx.stroke();
    }
  // seduti sul WC si legge il giornale
  if (sitting && opts && opts.newspaper) {
    const nx = neck.x,
      ny = neck.y + 5 * s;
    ctx.fillStyle = '#f5f6fa';
    ctx.strokeStyle = 'rgba(0,0,0,0.35)';
    ctx.lineWidth = 0.7;
    ctx.beginPath();
    ctx.moveTo(nx - 9 * s, ny);
    ctx.lineTo(nx, ny + 1.5 * s);
    ctx.lineTo(nx + 9 * s, ny);
    ctx.lineTo(nx + 9 * s, ny + 12 * s);
    ctx.lineTo(nx, ny + 13.5 * s);
    ctx.lineTo(nx - 9 * s, ny + 12 * s);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
    seg({ x: nx, y: ny + 1.5 * s }, { x: nx, y: ny + 13.5 * s }, 'rgba(0,0,0,0.25)', 0.5 * s);
    ctx.fillStyle = '#2d3436';
    ctx.fillRect(nx - 8 * s, ny + 1.5 * s, 6 * s, 1.4 * s);
    for (let i = 0; i < 4; i++) {
      ctx.fillStyle = 'rgba(0,0,0,0.3)';
      ctx.fillRect(nx - 8 * s, ny + (4 + i * 2) * s, 6.5 * s, 0.6 * s);
      ctx.fillRect(nx + 1.5 * s, ny + (3 + i * 2) * s, 6.5 * s, 0.6 * s);
    }
    dot(nx - 9 * s, ny + 6 * s, 2.2 * s, skin);
    dot(nx + 9 * s, ny + 6 * s, 2.2 * s, skin);
  }

  // ---- nella doccia: i pixel sulle parti intime (sopra le mani, sotto la testa)
  if (nude && !fromBehind) {
    drawCensor(hip.x, crotchY + 0.5 * s, 15 * s, 7 * s, s, skin, animTime);
    if (female) drawCensor(neck.x, tyTop + tH * 0.27, 16.5 * s, 6 * s, s, skin, animTime);
  }

  // ---- testa
  if (top.style === 'sweater') {
    ctx.fillStyle = game.darken(top.color, 0.08);
    ctx.fillRect(neck.x - 3.4 * s, neck.y - 4.4 * s, 6.8 * s, 5.4 * s);
    for (let i = -1; i <= 1; i++)
      seg(
        { x: neck.x + i * 1.6 * s, y: neck.y - 4 * s },
        { x: neck.x + i * 1.6 * s, y: neck.y + 0.6 * s },
        'rgba(0,0,0,0.15)',
        0.5 * s,
      );
  }
  if (neckItem && neckItem.style === 'scarf') drawScarf(neckItem, neck, s);
  const hg: GameValue = ctx.createRadialGradient(
    head.x - 3 * s,
    head.y - 3 * s,
    2 * s,
    head.x,
    head.y,
    10 * s,
  );
  hg.addColorStop(0, game.lighten(skin, 0.15));
  hg.addColorStop(1, game.darken(skin, 0.12));
  ctx.fillStyle = hg;
  ctx.beginPath();
  ctx.arc(head.x, head.y, 9 * s, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = 'rgba(0,0,0,0.3)';
  ctx.lineWidth = 1;
  ctx.stroke();
  if (fromBehind && !mannequin) {
    const side = walkingAway && Math.abs(screenSide) > 0.3 ? Math.sign(screenSide) : 0;
    drawHairFromBehind(head, s, bd.hairStyle, hair, skin, side);
    // con i capelli lunghi, il caschetto o l'afro l'orecchio resta coperto
    if (side && ![2, 4, 6].includes(bd.hairStyle)) drawThreeQuarterSide(head, s, skin, side);
  } else if (!mannequin) {
    drawFace(head, s, bd, hair, animTime, hsh, look.stoned ? skin : null);
    drawHairFront(head, s, bd.hairStyle, hair);
  }
  if (!fromBehind) drawGlasses(head, s, look.glasses);
  drawHat(head, s, look.hat);
  if (smokingHand) {
    ctx.strokeStyle = '#efe8d5';
    ctx.lineWidth = 2 * s;
    ctx.beginPath();
    ctx.moveTo(smokingHand.x, smokingHand.y);
    ctx.lineTo(smokingHand.x + 7 * s, smokingHand.y - 1.5 * s);
    ctx.stroke();
    ctx.fillStyle = '#ff7139';
    ctx.shadowColor = '#ff5722';
    ctx.shadowBlur = 3 * s;
    ctx.beginPath();
    ctx.arc(smokingHand.x + 7 * s, smokingHand.y - 1.5 * s, 1.2 * s, 0, Math.PI * 2);
    ctx.fill();
    ctx.shadowBlur = 0;
  }
  // il casco spaziale (comprato al negozio) si disegna sopra tutto, come una bolla di vetro
  if (look.hat && look.hat.style === 'space') {
    ctx.fillStyle = 'rgba(200,230,255,0.18)';
    ctx.strokeStyle = 'rgba(255,255,255,0.75)';
    ctx.lineWidth = 1.4 * s;
    ctx.beginPath();
    ctx.arc(head.x, head.y - 1 * s, 14 * s, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
    ctx.strokeStyle = 'rgba(255,255,255,0.8)';
    ctx.lineWidth = 1.6 * s;
    ctx.beginPath();
    ctx.arc(head.x, head.y - 1 * s, 10.5 * s, Math.PI * 1.1, Math.PI * 1.45);
    ctx.stroke();
    ctx.fillStyle = '#dfe6e9';
    ctx.fillRect(head.x - 7 * s, head.y + 11.5 * s, 14 * s, 2.5 * s);
  }
  // al bancone: il bicchiere in mano (si vede di lato alla testa quando si beve)
  if (opts && opts.glassFill !== undefined) drawHandGlass(backTo, s, opts.glassFill, sip);
  ctx.lineCap = 'butt';
  if (name) {
    ctx.font = 'bold 10px sans-serif';
    ctx.textAlign = 'center';
    const nw: GameValue = Math.min(90, ctx.measureText(name).width + 14);
    const ny: GameValue = head.y - ((look.hat && HAT_TAG_HEIGHT[look.hat.style]) || 34) * s - 8;
    ctx.fillStyle = 'rgba(0, 0, 0, 0.6)';
    ctx.beginPath();
    ctx.roundRect
      ? ctx.roundRect(head.x - nw / 2, ny, nw, 16, 8)
      : ctx.rect(head.x - nw / 2, ny, nw, 16);
    ctx.fill();
    ctx.fillStyle = '#fff';
    ctx.fillText(name, head.x, ny + 11.5, nw - 8);
  }
  // ---- edizione limitata: chi la indossa brilla (lo vedono tutti)
  if (game.SLOTS.some((sl: string) => look[sl]?.limited))
    drawSparkles(
      ctx,
      (a, k) => P(Math.cos(a) * 15, Math.sin(a) * 15, 10 + k * 62),
      (animTime || 0) + (hsh % 7),
      4,
      s,
    );
  if (say) {
    ctx.font = '12px sans-serif';
    // le frasi lunghe vanno a capo: righe di al massimo 180 px, la nuvoletta cresce verso l'alto
    const lines = wrapText(ctx, String(say), 180);
    const bw: GameValue = Math.max(...lines.map((l) => ctx.measureText(l).width)) + 16;
    const bh = 8 + lines.length * 14;
    const bx: GameValue = head.x - bw / 2,
      by: GameValue = head.y - 34 * s - 18 - bh;
    ctx.fillStyle = '#fff';
    ctx.beginPath();
    ctx.roundRect ? ctx.roundRect(bx, by, bw, bh, 10) : ctx.rect(bx, by, bw, bh);
    ctx.fill();
    ctx.beginPath();
    ctx.moveTo(head.x - 5, by + bh);
    ctx.lineTo(head.x + 5, by + bh);
    ctx.lineTo(head.x, by + bh + 7);
    ctx.fill();
    ctx.fillStyle = '#111';
    ctx.textAlign = 'center';
    lines.forEach((l, i) => ctx.fillText(l, head.x, by + 15 + i * 14, 180));
  }
}

// Sciarpa avvolta al collo con un lembo che pende di lato.
function drawScarf(it: GameValue, neck: Pt, s: number): void {
  const ctx = game.view.ctx;
  const c = it.color,
    c2 = it.color2 || '#ffffff';
  ctx.fillStyle = game.darken(c, 0.1);
  ctx.fillRect(neck.x + 1.5 * s, neck.y - 1 * s, 3.4 * s, 11 * s);
  ctx.fillStyle = c2;
  ctx.fillRect(neck.x + 1.5 * s, neck.y + 5 * s, 3.4 * s, 1.2 * s);
  ctx.fillRect(neck.x + 1.5 * s, neck.y + 7.4 * s, 3.4 * s, 1.2 * s);
  for (let i = 0; i < 4; i++)
    seg(
      { x: neck.x + (1.9 + i * 0.9) * s, y: neck.y + 10 * s },
      { x: neck.x + (1.9 + i * 0.9) * s, y: neck.y + 11.5 * s },
      c,
      0.4 * s,
    );
  ctx.fillStyle = c;
  ctx.beginPath();
  ctx.roundRect
    ? ctx.roundRect(neck.x - 6 * s, neck.y - 4.5 * s, 12 * s, 4.6 * s, 2.2 * s)
    : ctx.rect(neck.x - 6 * s, neck.y - 4.5 * s, 12 * s, 4.6 * s);
  ctx.fill();
  ctx.fillStyle = c2;
  ctx.fillRect(neck.x - 2.5 * s, neck.y - 4.4 * s, 1.2 * s, 4.4 * s);
  ctx.fillRect(neck.x + 1.5 * s, neck.y - 4.4 * s, 1.2 * s, 4.4 * s);
}

// Accessori sul petto: cravatta, papillon, collane, medaglia e spallacci dello zaino.
function drawNeckFront(
  it: GameValue,
  neck: Pt,
  tyTop: number,
  tH: number,
  tw: number,
  s: number,
): void {
  const ctx = game.view.ctx;
  const c = it.color,
    c2 = it.color2 || '#ffffff';
  switch (it.style) {
    case 'tie':
      ctx.fillStyle = '#ffffff';
      for (const side of [-1, 1]) {
        ctx.beginPath();
        ctx.moveTo(neck.x, tyTop + 1.2 * s);
        ctx.lineTo(neck.x + side * 3.6 * s, tyTop - 0.4 * s);
        ctx.lineTo(neck.x + side * 2.6 * s, tyTop + 2.4 * s);
        ctx.closePath();
        ctx.fill();
      }
      ctx.fillStyle = c;
      ctx.beginPath();
      ctx.moveTo(neck.x - 1.2 * s, tyTop + 0.4 * s);
      ctx.lineTo(neck.x + 1.2 * s, tyTop + 0.4 * s);
      ctx.lineTo(neck.x + 0.8 * s, tyTop + 2.2 * s);
      ctx.lineTo(neck.x + 1.8 * s, tyTop + tH * 0.7);
      ctx.lineTo(neck.x, tyTop + tH * 0.8);
      ctx.lineTo(neck.x - 1.8 * s, tyTop + tH * 0.7);
      ctx.lineTo(neck.x - 0.8 * s, tyTop + 2.2 * s);
      ctx.closePath();
      ctx.fill();
      for (let k = 0.25; k < 0.7; k += 0.15)
        seg(
          { x: neck.x - 1.4 * s, y: tyTop + tH * k + 1 * s },
          { x: neck.x + 1.4 * s, y: tyTop + tH * k },
          game.lighten(c, 0.3),
          0.5 * s,
        );
      break;
    case 'bowtie':
      ctx.fillStyle = c;
      for (const side of [-1, 1]) {
        ctx.beginPath();
        ctx.moveTo(neck.x, tyTop + 1.4 * s);
        ctx.lineTo(neck.x + side * 3.4 * s, tyTop - 0.2 * s);
        ctx.lineTo(neck.x + side * 3.4 * s, tyTop + 3 * s);
        ctx.closePath();
        ctx.fill();
      }
      dot(neck.x, tyTop + 1.4 * s, 1 * s, game.darken(c, 0.25));
      dot(neck.x - 2.4 * s, tyTop + 0.6 * s, 0.4 * s, 'rgba(255,255,255,0.5)');
      break;
    case 'pearls':
      for (let i = 0; i <= 12; i++) {
        const a = 0.1 + (i / 12) * (Math.PI - 0.2);
        const px = neck.x + Math.cos(a) * 5 * s,
          py = tyTop + Math.sin(a) * 4.6 * s;
        dot(px, py, 0.85 * s, c);
        dot(px - 0.3 * s, py - 0.3 * s, 0.3 * s, '#ffffff');
      }
      break;
    case 'chain':
      ctx.strokeStyle = c;
      ctx.lineWidth = 1.3 * s;
      ctx.setLineDash([1.2 * s, 0.6 * s]);
      ctx.beginPath();
      ctx.arc(neck.x, tyTop - 1 * s, 6.2 * s, 0.25, Math.PI - 0.25);
      ctx.stroke();
      ctx.setLineDash([]);
      dot(neck.x, tyTop + 5.6 * s, 1.9 * s, c);
      ctx.fillStyle = game.darken(c, 0.4);
      ctx.font = `bold ${2.8 * s}px sans-serif`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText('$', neck.x, tyTop + 5.7 * s);
      ctx.textBaseline = 'alphabetic';
      break;
    case 'medal':
      ctx.fillStyle = c2;
      ctx.beginPath();
      ctx.moveTo(neck.x - 4.4 * s, tyTop - 0.4 * s);
      ctx.lineTo(neck.x - 2.6 * s, tyTop - 0.4 * s);
      ctx.lineTo(neck.x + 0.8 * s, tyTop + tH * 0.42);
      ctx.lineTo(neck.x - 0.8 * s, tyTop + tH * 0.42);
      ctx.closePath();
      ctx.moveTo(neck.x + 4.4 * s, tyTop - 0.4 * s);
      ctx.lineTo(neck.x + 2.6 * s, tyTop - 0.4 * s);
      ctx.lineTo(neck.x - 0.8 * s, tyTop + tH * 0.42);
      ctx.lineTo(neck.x + 0.8 * s, tyTop + tH * 0.42);
      ctx.closePath();
      ctx.fill();
      dot(neck.x, tyTop + tH * 0.5, 2.6 * s, game.darken(c, 0.2));
      dot(neck.x, tyTop + tH * 0.5, 2.1 * s, c);
      starPath(neck.x, tyTop + tH * 0.5, 1.3 * s);
      ctx.fillStyle = game.darken(c, 0.3);
      ctx.fill();
      break;
    case 'backpack':
      for (const side of [-1, 1])
        seg(
          { x: neck.x + side * 5 * s, y: tyTop },
          { x: neck.x + side * (tw - 1.5 * s), y: tyTop + tH * 0.75 },
          c2,
          1.6 * s,
        );
      for (const side of [-1, 1])
        dot(neck.x + side * 5.8 * s, tyTop + tH * 0.35, 0.6 * s, '#b2bec3');
      break;
  }
}

// Personaggio svenuto a terra: k = 1 sdraiato, 0 in piedi (si usa anche mentre si rialza).
export function drawFaintedAvatar(
  x: number,
  y: number,
  name: string,
  animTime: number,
  look: GameValue,
  k = 1,
): void {
  const ctx: GameValue = game.view.ctx;
  const s: GameValue = isoScale();
  const e = k * k * (3 - 2 * k);
  const pv: GameValue = isoProject(x, y, 0);
  const rot = -Math.PI * 0.46 * e;
  // ombra allungata sul pavimento
  ctx.fillStyle = 'rgba(0,0,0,0.3)';
  ctx.beginPath();
  ctx.ellipse(pv.x - 22 * s * e, pv.y, (13 + 22 * e) * s, 6.5 * s, 0, 0, 6.3);
  ctx.fill();
  ctx.save();
  ctx.translate(pv.x, pv.y - 4 * s * e);
  ctx.rotate(rot);
  ctx.translate(-pv.x, -pv.y);
  drawPlayerAvatar(x, y, '', animTime, look, false, '', { noShadow: true });
  ctx.restore();
  // stelline che girano attorno alla testa
  if (e > 0.6) {
    const hx = pv.x + Math.sin(rot) * 58 * s,
      hy = pv.y - 4 * s * e - Math.cos(rot) * 58 * s;
    ctx.save();
    ctx.globalAlpha = Math.min(1, (e - 0.6) / 0.3);
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.font = `${Math.round(9 * s)}px sans-serif`;
    for (let i = 0; i < 3; i++) {
      const a = animTime * 3 + (i * Math.PI * 2) / 3;
      ctx.fillText(
        i === 1 ? '💫' : '⭐',
        hx + Math.cos(a) * 11 * s,
        hy - 12 * s + Math.sin(a) * 4 * s,
      );
    }
    ctx.restore();
  }
  if (name) pillTag(pv.x - 24 * s * e, pv.y - (34 - 22 * e) * s - 24, name);
}

// Nome di un giocatore che ha lasciato il gioco, con la scritta "offline" accanto.
export function drawOfflineTag(x: number, y: number, z: number, name: string): void {
  const ctx: GameValue = game.view.ctx;
  const p: GameValue = isoProject(x, y, z);
  ctx.font = 'bold 10px sans-serif';
  const nameW = Math.min(90, ctx.measureText(name || 'Giocatore').width + 14);
  ctx.font = 'bold 9px sans-serif';
  const offW = ctx.measureText('offline').width + 12;
  const total = nameW + 4 + offW;
  const left = p.x - total / 2,
    top = p.y - 8;
  const pill = (px: number, w: number, color: string) => {
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.roundRect ? ctx.roundRect(px, top, w, 16, 8) : ctx.rect(px, top, w, 16);
    ctx.fill();
  };
  pill(left, nameW, 'rgba(0,0,0,0.6)');
  pill(left + nameW + 4, offW, 'rgba(99,110,114,0.95)');
  ctx.textAlign = 'center';
  ctx.fillStyle = '#ffffff';
  ctx.font = 'bold 10px sans-serif';
  ctx.fillText(name || 'Giocatore', left + nameW / 2, top + 11.5, nameW - 8);
  ctx.fillStyle = '#dfe6e9';
  ctx.font = 'bold 9px sans-serif';
  ctx.fillText('offline', left + nameW + 4 + offW / 2, top + 11.5);
}

// Pensieri di chi dorme, raccolti mentre si disegna la scena e mostrati alla fine sopra tutto.
const sleepThoughts: { x: number; y: number; s: number; text: string }[] = [];

/** Nuvoletta di pensiero accanto alla testa: si legge anche di notte e non finisce sotto i pulsanti. */
export function drawSleepThoughts(): void {
  const ctx: GameValue = game.view.ctx;
  for (const t of sleepThoughts.splice(0)) {
    ctx.font = '12px sans-serif';
    const w = Math.min(200, ctx.measureText(t.text).width) + 18;
    const h = 24;
    const maxLeft = game.view.canvas.width - w - 8;
    const left = Math.max(8, Math.min(maxLeft, t.x + 34 * t.s));
    let top = t.y - 46 * t.s - h;
    // se sopra la testa c'è il pulsante "Svegliati", la nuvoletta sale sopra di lui
    const pop = dom('pop-interaction');
    if (pop && !pop.classList.contains('hidden')) {
      const r = pop.getBoundingClientRect(),
        c = game.view.canvas.getBoundingClientRect();
      const popLeft = r.left - c.left,
        popTop = r.top - c.top;
      if (
        left < popLeft + r.width &&
        left + w > popLeft &&
        top + h > popTop &&
        top < popTop + r.height
      )
        top = Math.max(4, popTop - h - 6);
    }
    // pallini che salgono dalla testa
    ctx.fillStyle = 'rgba(255,255,255,0.92)';
    for (const [k, r] of [
      [0.25, 2.5],
      [0.55, 4],
    ] as const) {
      ctx.beginPath();
      ctx.arc(
        t.x + (left + 12 - t.x) * k,
        t.y - 10 * t.s + (top + h - t.y + 10 * t.s) * k,
        r,
        0,
        6.3,
      );
      ctx.fill();
    }
    ctx.beginPath();
    ctx.roundRect ? ctx.roundRect(left, top, w, h, 12) : ctx.rect(left, top, w, h);
    ctx.fill();
    ctx.fillStyle = '#2d3436';
    ctx.textAlign = 'center';
    ctx.fillText(t.text, left + w / 2, top + 16, 200);
  }
}

/** Nuvolette di fumo che salgono accanto alla bocca di chi si fa una canna. */
export function drawSmokePuffs(x: number, y: number, t: number): void {
  const ctx = game.view.ctx;
  const s: number = isoScale();
  const mouth = isoProject(x, y, 56);
  for (let i = 0; i < 6; i++) {
    const k = (t * 0.45 + i / 6) % 1;
    const px = mouth.x + 8 * s + Math.sin(t * 2 + i * 1.7) * 5 * s + k * 10 * s;
    const py = mouth.y - k * 40 * s;
    ctx.fillStyle = `rgba(225,228,225,${0.6 * (1 - k)})`;
    ctx.beginPath();
    ctx.arc(px, py, (3 + k * 7) * s, 0, 6.3);
    ctx.fill();
  }
}

/** Influenza: germi verdi che girano intorno alla testa e un'aria un po' verdognola. */
export function drawFluGerms(x: number, y: number, t: number): void {
  const ctx = game.view.ctx;
  const s: number = isoScale();
  const head = isoProject(x, y, 70);
  // alone verdognolo sul viso
  const g = ctx.createRadialGradient(head.x, head.y, 0, head.x, head.y, 22 * s);
  g.addColorStop(0, 'rgba(120,200,90,0.28)');
  g.addColorStop(1, 'rgba(120,200,90,0)');
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.arc(head.x, head.y, 22 * s, 0, 6.3);
  ctx.fill();
  for (let i = 0; i < 5; i++) {
    const a = t * 1.6 + (i * Math.PI * 2) / 5;
    const r = (17 + Math.sin(t * 3 + i) * 3) * s;
    const px = head.x + Math.cos(a) * r;
    const py = head.y - 6 * s + Math.sin(a) * r * 0.45 + Math.sin(t * 4 + i * 2) * 2 * s;
    const rr = (2.4 + (i % 2)) * s;
    // corpo del germe con le zampette
    ctx.strokeStyle = 'rgba(46,125,50,0.85)';
    ctx.lineWidth = Math.max(0.6, 0.8 * s);
    ctx.beginPath();
    for (let k = 0; k < 6; k++) {
      const b = (k * Math.PI) / 3 + t * 2;
      ctx.moveTo(px + Math.cos(b) * rr, py + Math.sin(b) * rr);
      ctx.lineTo(px + Math.cos(b) * rr * 1.7, py + Math.sin(b) * rr * 1.7);
    }
    ctx.stroke();
    ctx.fillStyle = 'rgba(124,205,82,0.95)';
    ctx.beginPath();
    ctx.arc(px, py, rr, 0, 6.3);
    ctx.fill();
    ctx.fillStyle = 'rgba(27,94,32,0.9)';
    ctx.beginPath();
    ctx.arc(px - rr * 0.3, py - rr * 0.2, rr * 0.25, 0, 6.3);
    ctx.arc(px + rr * 0.35, py - rr * 0.2, rr * 0.25, 0, 6.3);
    ctx.fill();
  }
}

/** Divide una frase in righe larghe al massimo `max` pixel (con il font già impostato). */
function wrapText(ctx: CanvasRenderingContext2D, text: string, max: number): string[] {
  if (ctx.measureText(text).width <= max) return [text];
  const lines: string[] = [];
  let line = '';
  for (const word of text.split(' ')) {
    const next = line ? line + ' ' + word : word;
    if (line && ctx.measureText(next).width > max) {
      lines.push(line);
      line = word;
    } else line = next;
  }
  if (line) lines.push(line);
  return lines;
}
