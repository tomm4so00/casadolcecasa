import { launchPhase } from '../project-rules.js';
import { safeLevel } from '../safe-pin.js';
import { realHour } from '../game-clock.js';
import type { GameValue } from '../context.js';
import { game } from '../context.js';
import { cameraPx, cameraRange, cameraScale } from '../camera.js';
import { isoProject, isoScale, mixColor, poly, rnd, setPlane } from './primitives.js';
import { box, onFace, resetPlane } from './objects.js';
import { getMyRoomMap, isMyRoomNow } from '../saves.js';
import { paintingTitle } from '../painting-titles.js';
import { SAFE_SPOT } from '../room-layout.js';
import {
  PAINT_CELLS,
  PAINT_H,
  PAINT_PALETTE,
  PAINT_W,
  PAINTING_SLOTS,
  decodePainting,
  paintingKey,
  roomPaintings,
} from '../painting-rules.js';
export function getEnvStyle(..._args: GameValue[]): GameValue {
  const st: GameValue = game.ENV_STYLE[game.view.activeEnvironment] || game.ENV_STYLE.SALOON;
  if (game.view.activeEnvironment === 'PLAYER_ROOM') {
    // Ogni stanza ha il suo colore di parete; i quadri sono solo quelli dipinti dai giocatori.
    const idx: GameValue = game.currentRoomIdx || 0;
    return Object.assign({}, st, { wall: game.ROOM_WALLS[idx % game.ROOM_WALLS.length] });
  }
  return st;
}

export function skyColors(hour?: GameValue): GameValue {
  if (hour >= 21 || hour < 5) return ['#070b1f', '#1b2a4a'];
  if (hour < 7) return ['#3b4a8c', '#ffb37a'];
  if (hour < 17) return ['#3a8fd6', '#bfe6f7'];
  if (hour < 19) return ['#4a6fb5', '#ffc48c'];
  return ['#2c2457', '#ff8c61'];
}

export function drawSky(hour?: GameValue, t?: GameValue): GameValue {
  const ctx = game.view.ctx;
  if (game.view.activeEnvironment === 'luna') return drawSpaceSky(t || 0);
  const W: GameValue = game.view.canvas.width,
    H: GameValue = game.view.canvas.height;
  const [a, b]: GameValue = skyColors(hour);
  const g: GameValue = ctx.createLinearGradient(0, 0, 0, H);
  g.addColorStop(0, a);
  g.addColorStop(0.75, b);
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, W, H);
  const night: GameValue = hour >= 20 || hour < 6;
  if (night) {
    for (let i: GameValue = 0; i < 70; i++) {
      ctx.fillStyle = `rgba(255,255,255,${0.4 + 0.6 * Math.abs(Math.sin(t * 0.8 + i))})`;
      ctx.fillRect(rnd(i) * W, rnd(i + 50) * H * 0.55, 1.5, 1.5);
    }
    ctx.fillStyle = '#f5f3ce';
    ctx.beginPath();
    ctx.arc(W * 0.8, H * 0.13, 22, 0, 6.3);
    ctx.fill();
    ctx.fillStyle = skyColors(hour)[0];
    ctx.beginPath();
    ctx.arc(W * 0.8 + 9, H * 0.13 - 5, 19, 0, 6.3);
    ctx.fill();
  } else {
    const sunX: GameValue = W * (0.1 + 0.8 * ((hour - 6) / 14)),
      sunY: GameValue = H * (0.32 - 0.22 * Math.sin((Math.PI * (hour - 6)) / 14));
    const sg: GameValue = ctx.createRadialGradient(sunX, sunY, 4, sunX, sunY, 70);
    sg.addColorStop(0, 'rgba(255,250,210,1)');
    sg.addColorStop(0.25, 'rgba(255,230,140,0.8)');
    sg.addColorStop(1, 'rgba(255,230,140,0)');
    ctx.fillStyle = sg;
    ctx.beginPath();
    ctx.arc(sunX, sunY, 70, 0, 6.3);
    ctx.fill();
    ctx.fillStyle = 'rgba(255,255,255,0.85)';
    for (let i: GameValue = 0; i < 4; i++) {
      const cx: GameValue = ((t * (6 + i * 2) + rnd(i) * W * 1.5) % (W + 240)) - 120,
        cy: GameValue = H * (0.08 + rnd(i + 7) * 0.22);
      [
        [0, 0, 26],
        [24, 6, 20],
        [-22, 7, 18],
        [8, -10, 18],
      ].forEach(([dx, dy, r]: GameValue = {}): GameValue => {
        ctx.beginPath();
        ctx.arc(cx + dx, cy + dy, r, 0, 6.3);
        ctx.fill();
      });
    }
  }
  if (game.view.activeEnvironment === 'viaggio' && !night) {
    const px: GameValue = ((t * 40) % (W + 300)) - 150,
      py: GameValue = H * 0.12;
    ctx.fillStyle = '#ecf0f1';
    ctx.beginPath();
    ctx.ellipse(px, py, 26, 6, 0, 0, 6.3);
    ctx.fill();
    ctx.beginPath();
    ctx.moveTo(px - 4, py);
    ctx.lineTo(px - 14, py + 16);
    ctx.lineTo(px + 4, py);
    ctx.fill();
    ctx.beginPath();
    ctx.moveTo(px - 20, py);
    ctx.lineTo(px - 26, py - 10);
    ctx.lineTo(px - 16, py);
    ctx.fill();
    ctx.strokeStyle = 'rgba(255,255,255,0.5)';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(px - 30, py);
    ctx.lineTo(px - 140, py + 2);
    ctx.stroke();
  }
}

/** Cielo dello spazio: nero, pieno di stelle, con la Terra che si vede da lontano. */
function drawSpaceSky(t: number): void {
  const ctx = game.view.ctx;
  const W: number = game.view.canvas.width,
    H: number = game.view.canvas.height;
  const g = ctx.createLinearGradient(0, 0, 0, H);
  g.addColorStop(0, '#02030a');
  g.addColorStop(1, '#0b1026');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, W, H);
  for (let i = 0; i < 160; i++) {
    const tw = 0.55 + 0.45 * Math.sin(t * 1.5 + i * 1.7);
    ctx.fillStyle = `rgba(255,255,255,${(0.35 + 0.65 * rnd(i + 7)) * tw})`;
    const r = rnd(i + 300) > 0.9 ? 1.6 : 0.9;
    ctx.fillRect(rnd(i) * W, rnd(i + 99) * H, r, r);
  }
  // la Terra, in alto a destra
  const ex = W * 0.8,
    ey = H * 0.16,
    er = Math.min(W, H) * 0.07;
  const halo = ctx.createRadialGradient(ex, ey, er * 0.9, ex, ey, er * 1.5);
  halo.addColorStop(0, 'rgba(120,180,255,0.35)');
  halo.addColorStop(1, 'rgba(120,180,255,0)');
  ctx.fillStyle = halo;
  ctx.beginPath();
  ctx.arc(ex, ey, er * 1.5, 0, 6.3);
  ctx.fill();
  const sea = ctx.createRadialGradient(ex - er * 0.4, ey - er * 0.4, er * 0.1, ex, ey, er);
  sea.addColorStop(0, '#5dade2');
  sea.addColorStop(1, '#1a4f8a');
  ctx.fillStyle = sea;
  ctx.beginPath();
  ctx.arc(ex, ey, er, 0, 6.3);
  ctx.fill();
  ctx.save();
  ctx.beginPath();
  ctx.arc(ex, ey, er, 0, 6.3);
  ctx.clip();
  ctx.fillStyle = '#58a85b';
  for (const [dx, dy, rx, ry] of [
    [-0.3, -0.2, 0.35, 0.25],
    [0.25, 0.25, 0.3, 0.2],
    [0.1, -0.45, 0.2, 0.12],
  ]) {
    ctx.beginPath();
    ctx.ellipse(ex + dx * er, ey + dy * er, rx * er, ry * er, 0.5, 0, 6.3);
    ctx.fill();
  }
  ctx.fillStyle = 'rgba(255,255,255,0.7)';
  for (let i = 0; i < 4; i++) {
    const cy = ey + (i - 1.5) * er * 0.45;
    const off = ((t * 0.02 + i * 0.3) % 1) * er * 2 - er;
    ctx.beginPath();
    ctx.ellipse(ex + off, cy, er * 0.35, er * 0.07, 0, 0, 6.3);
    ctx.fill();
  }
  // lato in ombra
  ctx.fillStyle = 'rgba(0,0,20,0.45)';
  ctx.beginPath();
  ctx.arc(ex + er * 0.45, ey + er * 0.2, er, 0, 6.3);
  ctx.fill();
  ctx.restore();
}

/**
 * Suolo lunare convesso: una griglia di riquadri proiettati uno per uno (isoProject abbassa i
 * punti lontani dal centro), più chiari in cima e più scuri verso l'orizzonte, con il bordo.
 */
function drawMoonFloor(st: GameValue): void {
  const ctx = game.view.ctx;
  const step = 30;
  const maxR = Math.hypot(game.X1, game.Y1);
  for (let x = game.X0; x < game.X1; x += step)
    for (let y = game.Y0; y < game.Y1; y += step) {
      const a = isoProject(x, y, 0),
        b = isoProject(x + step, y, 0),
        c = isoProject(x + step, y + step, 0),
        d = isoProject(x, y + step, 0);
      const r = Math.hypot(x + step / 2, y + step / 2) / maxR;
      const noise = (rnd(x * 0.13 + y * 0.71) - 0.5) * 0.12;
      ctx.fillStyle = game.darken(st.floorColor, Math.max(0, Math.min(0.6, r * 0.42 + noise)));
      ctx.beginPath();
      ctx.moveTo(a.x, a.y);
      ctx.lineTo(b.x, b.y);
      ctx.lineTo(c.x, c.y);
      ctx.lineTo(d.x, d.y);
      ctx.closePath();
      ctx.fill();
      ctx.strokeStyle = ctx.fillStyle;
      ctx.lineWidth = 1;
      ctx.stroke();
      // sassolini sparsi
      if (rnd(x * 1.7 + y * 0.3) > 0.7) {
        const p = isoProject(x + rnd(x + y) * step, y + rnd(y - x) * step, 0);
        ctx.fillStyle = 'rgba(80,80,75,0.5)';
        ctx.beginPath();
        ctx.ellipse(p.x, p.y, 1.6 * isoScale(), 0.9 * isoScale(), 0, 0, 6.3);
        ctx.fill();
      }
    }
  // bordo della superficie, verso chi guarda
  const T = 18;
  for (let x = game.X0; x < game.X1; x += step) {
    const a = isoProject(x, game.Y1, 0),
      b = isoProject(x + step, game.Y1, 0),
      c = isoProject(x + step, game.Y1, -T),
      d = isoProject(x, game.Y1, -T);
    poly([a, b, c, d], '#6f6f69');
  }
  for (let y = game.Y0; y < game.Y1; y += step) {
    const a = isoProject(game.X1, y, 0),
      b = isoProject(game.X1, y + step, 0),
      c = isoProject(game.X1, y + step, -T),
      d = isoProject(game.X1, y, -T);
    poly([a, b, c, d], '#55554f');
  }
}

export function drawFloorPattern(st?: GameValue): GameValue {
  const ctx = game.view.ctx;
  if (st.floor === 'moon') return drawMoonFloor(st);
  const W: GameValue = game.X1 - game.X0,
    H: GameValue = game.Y1 - game.Y0,
    base: GameValue = st.floorColor;
  setPlane([game.X0, game.Y0, 0], [1, 0, 0], [0, 1, 0]);
  ctx.save();
  ctx.beginPath();
  ctx.rect(0, 0, W, H);
  ctx.clip();
  switch (st.floor) {
    case 'parquet': {
      ctx.fillStyle = game.darken(base, 0.35);
      ctx.fillRect(0, 0, W, H);
      const pw: GameValue = 16;
      for (let row: GameValue = 0; row * pw < H; row++) {
        let u: GameValue = -rnd(row) * 60,
          i: GameValue = 0;
        while (u < W) {
          const len: GameValue = 46 + rnd(row * 31 + i) * 40;
          ctx.fillStyle = mixColor(
            base,
            rnd(row * 7 + i) > 0.5 ? '#ffffff' : '#000000',
            rnd(row * 13 + i) * 0.12,
          );
          ctx.fillRect(u, row * pw, len - 1, pw - 1);
          ctx.strokeStyle = 'rgba(0,0,0,0.07)';
          ctx.beginPath();
          ctx.moveTo(u + 3, row * pw + pw * 0.4);
          ctx.lineTo(u + len - 4, row * pw + pw * 0.45);
          ctx.stroke();
          u += len;
          i++;
        }
      }
      break;
    }
    case 'dance': {
      ctx.fillStyle = base;
      ctx.fillRect(0, 0, W, H);
      ctx.strokeStyle = 'rgba(255,255,255,0.08)';
      for (let u: GameValue = 0; u <= W; u += 40) {
        ctx.beginPath();
        ctx.moveTo(u, 0);
        ctx.lineTo(u, H);
        ctx.stroke();
      }
      for (let v: GameValue = 0; v <= H; v += 40) {
        ctx.beginPath();
        ctx.moveTo(0, v);
        ctx.lineTo(W, v);
        ctx.stroke();
      }
      break;
    }
    case 'checker':
      for (let u: GameValue = 0; u < W; u += 40)
        for (let v: GameValue = 0; v < H; v += 40) {
          ctx.fillStyle = ((u + v) / 40) % 2 ? st.floorAlt : base;
          ctx.fillRect(u, v, 40, 40);
        }
      break;
    case 'tiles':
    case 'hospital': {
      const sz: GameValue = st.floor === 'tiles' ? 24 : 30;
      ctx.fillStyle = game.darken(base, 0.12);
      ctx.fillRect(0, 0, W, H);
      for (let u: GameValue = 0, i: GameValue = 0; u < W; u += sz)
        for (let v: GameValue = 0; v < H; v += sz, i++) {
          ctx.fillStyle = mixColor(base, '#ffffff', rnd(i) * 0.3);
          ctx.fillRect(u + 1, v + 1, sz - 2, sz - 2);
        }
      if (st.floor === 'hospital') {
        ctx.fillStyle = '#1abc9c';
        ctx.fillRect(0, 196, W, 8);
        ctx.fillRect(196, 0, 8, H);
        ctx.fillStyle = '#3498db';
        ctx.fillRect(0, 210, W, 4);
      }
      break;
    }
    case 'terracotta':
      ctx.fillStyle = '#e8d8c3';
      ctx.fillRect(0, 0, W, H);
      for (let u: GameValue = 0, i: GameValue = 0; u < W; u += 30)
        for (let v: GameValue = 0; v < H; v += 30, i++) {
          ctx.fillStyle = mixColor(base, '#000000', rnd(i) * 0.18);
          ctx.fillRect(u + 1.5, v + 1.5, 27, 27);
        }
      break;
    case 'concrete': {
      // cemento lucido da galleria: macchie morbide, giunti ogni 120 e un velo di riflesso
      ctx.fillStyle = base;
      ctx.fillRect(0, 0, W, H);
      for (let i: GameValue = 0; i < (W * H) / 2500; i++) {
        const r: GameValue = 30 + rnd(i * 3.1) * 60;
        ctx.fillStyle = rnd(i * 7.7) > 0.5 ? 'rgba(255,255,255,0.035)' : 'rgba(0,0,0,0.018)';
        ctx.beginPath();
        ctx.ellipse(rnd(i * 1.3) * W, rnd(i * 2.9) * H, r * 1.6, r, 0, 0, 6.3);
        ctx.fill();
      }
      ctx.strokeStyle = 'rgba(0,0,0,0.12)';
      ctx.lineWidth = 0.8;
      for (let u: GameValue = 120; u < W; u += 120) {
        ctx.beginPath();
        ctx.moveTo(u, 0);
        ctx.lineTo(u, H);
        ctx.stroke();
      }
      for (let v: GameValue = 120; v < H; v += 120) {
        ctx.beginPath();
        ctx.moveTo(0, v);
        ctx.lineTo(W, v);
        ctx.stroke();
      }
      const sheen = ctx.createLinearGradient(0, 0, W, H);
      sheen.addColorStop(0, 'rgba(255,255,255,0.10)');
      sheen.addColorStop(0.5, 'rgba(255,255,255,0)');
      sheen.addColorStop(1, 'rgba(255,255,255,0.06)');
      ctx.fillStyle = sheen;
      ctx.fillRect(0, 0, W, H);
      break;
    }
    case 'marble': {
      // marmo lucido a lastre, con le venature e le linee dorate
      for (let u: GameValue = 0, i: GameValue = 0; u < W; u += 50, i++)
        for (let v: GameValue = 0, j: GameValue = 0; v < H; v += 50, j++) {
          ctx.fillStyle = (i + j) % 2 ? base : game.darken(base, 0.06);
          ctx.fillRect(u, v, 50, 50);
          ctx.strokeStyle = 'rgba(150,140,125,0.22)';
          ctx.lineWidth = 0.7;
          ctx.beginPath();
          ctx.moveTo(u + rnd(u + v) * 50, v);
          ctx.bezierCurveTo(u + 10, v + 20, u + 40, v + 30, u + rnd(u * 2 + v) * 50, v + 50);
          ctx.stroke();
        }
      ctx.strokeStyle = 'rgba(201,162,39,0.55)';
      ctx.lineWidth = 1.2;
      for (let u: GameValue = 0; u <= W; u += 100) {
        ctx.beginPath();
        ctx.moveTo(u, 0);
        ctx.lineTo(u, H);
        ctx.stroke();
      }
      for (let v: GameValue = 0; v <= H; v += 100) {
        ctx.beginPath();
        ctx.moveTo(0, v);
        ctx.lineTo(W, v);
        ctx.stroke();
      }
      // passeggiata di pietra davanti alle vetrine, sul muro di fondo e su quello di sinistra
      ctx.fillStyle = '#d6ccbb';
      ctx.fillRect(0, 0, W, 78);
      ctx.fillRect(0, 0, 78, H);
      ctx.fillStyle = '#c9a227';
      ctx.fillRect(76, 76, W - 76, 3);
      ctx.fillRect(76, 76, 3, H - 76);
      // tappeto rosso dall'ingresso alla fontana
      const cu = W / 2;
      ctx.fillStyle = '#9b1b30';
      ctx.fillRect(cu - 30, H * 0.62, 60, H * 0.38);
      ctx.fillStyle = '#d4ac0d';
      ctx.fillRect(cu - 30, H * 0.62, 3, H * 0.38);
      ctx.fillRect(cu + 27, H * 0.62, 3, H * 0.38);
      // stella a mosaico attorno alla fontana
      const cx = W / 2 - (game.X0 + game.X1) / 2,
        cy = 40 - game.Y0;
      ctx.fillStyle = '#e9dcc0';
      ctx.beginPath();
      ctx.arc(cx, cy, 78, 0, 6.3);
      ctx.fill();
      ctx.strokeStyle = '#c9a227';
      ctx.lineWidth = 3;
      ctx.stroke();
      ctx.fillStyle = '#3b5b92';
      ctx.beginPath();
      for (let k: GameValue = 0; k < 16; k++) {
        const ang: GameValue = (k / 16) * Math.PI * 2;
        const r: GameValue = k % 2 ? 40 : 72;
        ctx.lineTo(cx + Math.cos(ang) * r, cy + Math.sin(ang) * r);
      }
      ctx.closePath();
      ctx.fill();
      ctx.strokeStyle = 'rgba(255,255,255,0.6)';
      ctx.lineWidth = 1;
      ctx.stroke();
      break;
    }
    case 'carpet':
      ctx.fillStyle = base;
      ctx.fillRect(0, 0, W, H);
      ctx.strokeStyle = 'rgba(255,255,255,0.06)';
      for (let k: GameValue = -H; k < W; k += 10) {
        ctx.beginPath();
        ctx.moveTo(k, 0);
        ctx.lineTo(k + H, H);
        ctx.stroke();
      }
      for (let u: GameValue = 0; u < W; u += 80)
        for (let v: GameValue = 0; v < H; v += 80) {
          ctx.strokeStyle = 'rgba(0,0,0,0.12)';
          ctx.strokeRect(u, v, 80, 80);
        }
      break;
    case 'concrete': {
      const g: GameValue = ctx.createLinearGradient(0, 0, W, H);
      g.addColorStop(0, game.lighten(base, 0.12));
      g.addColorStop(1, game.darken(base, 0.08));
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, W, H);
      ctx.strokeStyle = 'rgba(0,0,0,0.15)';
      for (let u: GameValue = 0; u <= W; u += 80) {
        ctx.beginPath();
        ctx.moveTo(u, 0);
        ctx.lineTo(u, H);
        ctx.stroke();
      }
      for (let v: GameValue = 0; v <= H; v += 80) {
        ctx.beginPath();
        ctx.moveTo(0, v);
        ctx.lineTo(W, v);
        ctx.stroke();
      }
      break;
    }
    case 'grass': {
      // Prato con i vialetti: quelli dell'ambiente (st.paths, in unità del pavimento a partire
      // dall'angolo di fondo) o la croce centrale di sempre. Cespi e fiori seguono la superficie.
      const area: number = (W * H) / (400 * 360);
      const paths: GameValue[] = st.paths || [
        { u: 0, v: H / 2 - 20, w: W, h: 40 },
        { u: W / 2 - 20, v: 0, w: 40, h: H },
      ];
      const onPath = (u: number, v: number, pad: number): boolean =>
        paths.some((p: GameValue) =>
          p.r
            ? Math.hypot(u - p.u, v - p.v) < p.r + pad
            : u > p.u - pad && u < p.u + p.w + pad && v > p.v - pad && v < p.v + p.h + pad,
        );
      ctx.fillStyle = base;
      ctx.fillRect(0, 0, W, H);
      for (let i: GameValue = 0; i < 40 * area; i++) {
        ctx.fillStyle = `rgba(${rnd(i) > 0.5 ? '255,255,255' : '0,60,0'},0.06)`;
        ctx.beginPath();
        ctx.arc(rnd(i * 3) * W, rnd(i * 5) * H, 20 + rnd(i) * 30, 0, 6.3);
        ctx.fill();
      }
      const shape = (p: GameValue, grow: number): void => {
        ctx.beginPath();
        if (p.r) ctx.arc(p.u, p.v, p.r + grow, 0, 6.3);
        else ctx.rect(p.u - grow, p.v - grow, p.w + grow * 2, p.h + grow * 2);
      };
      // bordo più scuro, poi la ghiaia
      ctx.fillStyle = '#a8956f';
      for (const p of paths) {
        shape(p, 2);
        ctx.fill();
      }
      ctx.fillStyle = '#cdbb98';
      for (const p of paths) {
        shape(p, 0);
        ctx.fill();
      }
      paths.forEach((p: GameValue, k: number) => {
        const n: number = p.r ? (Math.PI * p.r * p.r) / 200 : (p.w * p.h) / 200;
        for (let i = 0; i < n; i++) {
          const a = rnd(i * 7 + k * 101),
            b = rnd(i * 13 + k * 57);
          let u: number, v: number;
          if (p.r) {
            const ang = a * Math.PI * 2,
              rr = Math.sqrt(b) * (p.r - 3);
            u = p.u + Math.cos(ang) * rr;
            v = p.v + Math.sin(ang) * rr;
          } else {
            u = p.u + 2 + a * (p.w - 4);
            v = p.v + 2 + b * (p.h - 4);
          }
          ctx.fillStyle = mixColor('#b8a586', '#ffffff', rnd(i + k * 31 + 9) * 0.4);
          ctx.beginPath();
          ctx.ellipse(u, v, 4 + rnd(i) * 3, 3 + rnd(i + 1) * 2, rnd(i) * 3, 0, 6.3);
          ctx.fill();
        }
      });
      ctx.strokeStyle = 'rgba(30,90,30,0.55)';
      ctx.lineWidth = 1;
      for (let i: GameValue = 0; i < 320 * area; i++) {
        const u: GameValue = rnd(i * 7) * W,
          v: GameValue = rnd(i * 11) * H;
        if (onPath(u, v, 4)) continue;
        ctx.beginPath();
        ctx.moveTo(u - 2, v);
        ctx.lineTo(u, v - 4);
        ctx.lineTo(u + 2, v);
        ctx.stroke();
      }
      const fl: GameValue = ['#ff6b81', '#feca57', '#ffffff', '#a29bfe'];
      for (let i: GameValue = 0; i < 50 * area; i++) {
        const u: GameValue = rnd(i * 13) * W,
          v: GameValue = rnd(i * 17) * H;
        if (onPath(u, v, 4)) continue;
        ctx.fillStyle = fl[i % 4];
        ctx.beginPath();
        ctx.arc(u, v, 1.6, 0, 6.3);
        ctx.fill();
      }
      break;
    }
    case 'beach': {
      ctx.fillStyle = base;
      ctx.fillRect(0, 0, W, H);
      for (let i: GameValue = 0; i < 300; i++) {
        ctx.fillStyle = `rgba(${rnd(i) > 0.5 ? '255,255,255' : '160,120,60'},0.25)`;
        ctx.fillRect(rnd(i * 3) * W, rnd(i * 7) * H, 1.5, 1.5);
      }
      const g: GameValue = ctx.createLinearGradient(0, 0, 0, 110);
      g.addColorStop(0, '#0b6fa4');
      g.addColorStop(1, '#4fc3e8');
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, W, 110);
      ctx.fillStyle = 'rgba(255,255,255,0.3)';
      ctx.fillRect(0, 106, W, 8);
      break;
    }
    case 'dirt': {
      ctx.fillStyle = base;
      ctx.fillRect(0, 0, W, H);
      for (let i: GameValue = 0; i < 220; i++) {
        ctx.fillStyle = mixColor(
          base,
          rnd(i) > 0.5 ? '#ffffff' : '#000000',
          0.15 + rnd(i + 1) * 0.15,
        );
        ctx.beginPath();
        ctx.ellipse(
          rnd(i * 3) * W,
          rnd(i * 5) * H,
          2 + rnd(i) * 3,
          1.5 + rnd(i + 2) * 2,
          0,
          0,
          6.3,
        );
        ctx.fill();
      }
      ctx.strokeStyle = 'rgba(0,0,0,0.12)';
      ctx.lineWidth = 6;
      ctx.beginPath();
      ctx.moveTo(0, 250);
      ctx.bezierCurveTo(120, 230, 250, 290, W, 260);
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(0, 268);
      ctx.bezierCurveTo(120, 248, 250, 308, W, 278);
      ctx.stroke();
      break;
    }
    default:
      ctx.fillStyle = base;
      ctx.fillRect(0, 0, W, H);
  }
  if (st.rug) {
    const r: GameValue = st.rug;
    ctx.fillStyle = 'rgba(0,0,0,0.25)';
    ctx.fillRect(r.u + 3, r.v + 3, r.w, r.h);
    ctx.fillStyle = r.color;
    ctx.fillRect(r.u, r.v, r.w, r.h);
    ctx.strokeStyle = r.border;
    ctx.lineWidth = 3;
    ctx.strokeRect(r.u + 6, r.v + 6, r.w - 12, r.h - 12);
    ctx.lineWidth = 1;
    ctx.strokeRect(r.u + 12, r.v + 12, r.w - 24, r.h - 24);
    ctx.fillStyle = r.border;
    ctx.beginPath();
    ctx.moveTo(r.u + r.w / 2, r.v + r.h / 2 - 18);
    ctx.lineTo(r.u + r.w / 2 + 26, r.v + r.h / 2);
    ctx.lineTo(r.u + r.w / 2, r.v + r.h / 2 + 18);
    ctx.lineTo(r.u + r.w / 2 - 26, r.v + r.h / 2);
    ctx.closePath();
    ctx.globalAlpha = 0.6;
    ctx.fill();
    ctx.globalAlpha = 1;
    for (let u: GameValue = r.u + 4; u < r.u + r.w; u += 6) {
      ctx.fillRect(u, r.v - 4, 1.5, 4);
      ctx.fillRect(u, r.v + r.h, 1.5, 4);
    }
  }
  if (!st.outdoor) {
    const g1: GameValue = ctx.createLinearGradient(0, 0, 0, 30);
    g1.addColorStop(0, 'rgba(0,0,0,0.35)');
    g1.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = g1;
    ctx.fillRect(0, 0, W, 30);
    const g2: GameValue = ctx.createLinearGradient(0, 0, 30, 0);
    g2.addColorStop(0, 'rgba(0,0,0,0.3)');
    g2.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = g2;
    ctx.fillRect(0, 0, 30, H);
  }
  ctx.restore();
  resetPlane();
  // spessore del pavimento (effetto plastico)
  const T: GameValue = 14,
    edgeC: GameValue = st.outdoor ? '#6d4c2f' : '#2b2b38';
  poly(
    [
      isoProject(game.X0, game.Y1, 0),
      isoProject(game.X1, game.Y1, 0),
      isoProject(game.X1, game.Y1, -T),
      isoProject(game.X0, game.Y1, -T),
    ],
    game.darken(edgeC, 0.05),
    'rgba(0,0,0,0.3)',
  );
  poly(
    [
      isoProject(game.X1, game.Y1, 0),
      isoProject(game.X1, game.Y0, 0),
      isoProject(game.X1, game.Y0, -T),
      isoProject(game.X1, game.Y1, -T),
    ],
    game.darken(edgeC, 0.3),
    'rgba(0,0,0,0.3)',
  );
  if (st.outdoor) {
    poly(
      [
        isoProject(game.X0, game.Y1, 0),
        isoProject(game.X1, game.Y1, 0),
        isoProject(game.X1, game.Y1, -4),
        isoProject(game.X0, game.Y1, -4),
      ],
      st.floor === 'grass' ? '#3e8e3a' : game.darken(st.floorColor, 0.15),
    );
    poly(
      [
        isoProject(game.X1, game.Y1, 0),
        isoProject(game.X1, game.Y0, 0),
        isoProject(game.X1, game.Y0, -4),
        isoProject(game.X1, game.Y1, -4),
      ],
      st.floor === 'grass' ? '#2f6f2c' : game.darken(st.floorColor, 0.3),
    );
  }
}

// ---------- Decorazioni a parete (coordinate: u lungo la parete, t verso il basso dal bordo superiore)
export function wallWindow(d?: GameValue, hour?: GameValue, wallH?: GameValue): GameValue {
  const ctx = game.view.ctx;
  const w: GameValue = d.w || 50,
    h: GameValue = d.h || 50,
    u: GameValue = d.u - w / 2,
    t: GameValue = d.top || Math.max(18, wallH * 0.2);
  ctx.fillStyle = '#f5f5f5';
  ctx.fillRect(u - 4, t - 4, w + 8, h + 8);
  const [a, b]: GameValue = skyColors(hour);
  const g: GameValue = ctx.createLinearGradient(0, t, 0, t + h);
  g.addColorStop(0, a);
  g.addColorStop(1, b);
  ctx.fillStyle = g;
  ctx.fillRect(u, t, w, h);
  // di notte qualche stella; di giorno solo il cielo
  if (hour >= 20 || hour < 6) {
    ctx.fillStyle = '#ffffff';
    for (let i: GameValue = 0; i < 6; i++)
      ctx.fillRect(u + rnd(i + d.u) * w, t + rnd(i + 9 + d.u) * h * 0.7, 1.2, 1.2);
  }
  ctx.fillStyle = 'rgba(255,255,255,0.18)';
  ctx.beginPath();
  ctx.moveTo(u, t + h);
  ctx.lineTo(u + w * 0.4, t);
  ctx.lineTo(u + w * 0.55, t);
  ctx.lineTo(u + w * 0.15, t + h);
  ctx.fill();
  ctx.fillStyle = '#f5f5f5';
  ctx.fillRect(u + w / 2 - 1.5, t, 3, h);
  ctx.fillRect(u, t + h / 2 - 1.5, w, 3);
  ctx.fillStyle = '#e0e0e0';
  ctx.fillRect(u - 7, t + h + 3, w + 14, 5);
  if (d.curtains) {
    ctx.fillStyle = '#c0392b';
    ctx.fillRect(u - 14, t - 8, 14, h + 18);
    ctx.fillRect(u + w, t - 8, 14, h + 18);
    ctx.fillStyle = 'rgba(0,0,0,0.2)';
    for (let k: GameValue = 0; k < 3; k++) {
      ctx.fillRect(u - 12 + k * 4, t - 8, 1.5, h + 18);
      ctx.fillRect(u + w + 2 + k * 4, t - 8, 1.5, h + 18);
    }
    ctx.fillStyle = '#7f8c8d';
    ctx.fillRect(u - 18, t - 10, w + 36, 3);
  }
}

export function wallPainting(d?: GameValue): GameValue {
  const ctx = game.view.ctx;
  const w: GameValue = d.w || 50,
    h: GameValue = d.h || 36,
    u: GameValue = d.u - w / 2,
    t: GameValue = d.top || 26,
    s: GameValue = d.seed || 1;
  ctx.fillStyle = 'rgba(0,0,0,0.25)';
  ctx.fillRect(u + 3, t + 3, w, h);
  ctx.fillStyle = '#b7950b';
  ctx.fillRect(u - 3, t - 3, w + 6, h + 6);
  const pal: GameValue = [
    ['#74b9ff', '#0984e3', '#fdcb6e'],
    ['#fab1a0', '#e17055', '#2d3436'],
    ['#55efc4', '#00b894', '#ffeaa7'],
    ['#a29bfe', '#6c5ce7', '#fd79a8'],
  ][s % 4];
  ctx.fillStyle = pal[0];
  ctx.fillRect(u, t, w, h);
  ctx.fillStyle = pal[1];
  ctx.beginPath();
  ctx.moveTo(u, t + h);
  ctx.lineTo(u + w * (0.3 + rnd(s) * 0.3), t + h * (0.35 + rnd(s + 1) * 0.2));
  ctx.lineTo(u + w, t + h);
  ctx.fill();
  ctx.fillStyle = pal[2];
  ctx.beginPath();
  ctx.arc(u + w * (0.2 + rnd(s + 2) * 0.6), t + h * 0.3, h * 0.12, 0, 6.3);
  ctx.fill();
}

/** Il piano della parete spostato di `out` verso la stanza: ci si disegna ciò che sporge dal muro. */
function wallPlaneOut(side: string, H: number, out: number): void {
  if (side === 'back') setPlane([game.X0, game.Y0 + out, H], [1, 0, 0], [0, 0, -1]);
  else setPlane([game.X0 + out, game.Y1, H], [0, -1, 0], [0, 0, -1]);
}

export function wallClock(d?: GameValue): GameValue {
  const ctx = game.view.ctx;
  const u: GameValue = d.u,
    t: GameValue = d.top || 30,
    r: GameValue = 11;
  if (d.side) {
    // orologio in rilievo: ombra sul muro, cassa tonda spessa 4 e quadrante sul davanti
    const H: number = d.wallH || wallHere();
    ctx.fillStyle = 'rgba(0,0,0,0.22)';
    ctx.beginPath();
    ctx.arc(u + 2, t + 3, r + 2, 0, 6.3);
    ctx.fill();
    for (let k = 0.5; k < 4; k += 0.5) {
      wallPlaneOut(d.side, H, k);
      ctx.fillStyle = k < 3.5 ? '#1e2427' : '#2d3436';
      ctx.beginPath();
      ctx.arc(u, t, r + 2, 0, 6.3);
      ctx.fill();
    }
    wallPlaneOut(d.side, H, 4);
    drawClockFace(ctx, u, t, r);
    wallPlane(d.side, H);
    return;
  }
  ctx.fillStyle = '#2d3436';
  ctx.beginPath();
  ctx.arc(u, t, r + 2, 0, 6.3);
  ctx.fill();
  drawClockFace(ctx, u, t, r);
}

/** Quadrante con le tacche delle ore e le lancette all'ora vera. */
function drawClockFace(ctx: CanvasRenderingContext2D, u: number, t: number, r: number): void {
  const g = ctx.createRadialGradient(u - 3, t - 3, 1, u, t, r);
  g.addColorStop(0, '#ffffff');
  g.addColorStop(1, '#e6e9ec');
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.arc(u, t, r, 0, 6.3);
  ctx.fill();
  ctx.fillStyle = '#636e72';
  for (let i = 0; i < 12; i++) {
    const a = (i / 12) * 6.283,
      big = i % 3 === 0;
    ctx.beginPath();
    ctx.arc(u + Math.sin(a) * (r - 2), t - Math.cos(a) * (r - 2), big ? 0.9 : 0.5, 0, 6.3);
    ctx.fill();
  }
  const now = new Date();
  const m: GameValue = now.getMinutes() + now.getSeconds() / 60,
    h: GameValue = (realHour(now) % 12) + m / 60;
  ctx.strokeStyle = '#2d3436';
  ctx.lineCap = 'round';
  ctx.lineWidth = 1.6;
  ctx.beginPath();
  ctx.moveTo(u, t);
  ctx.lineTo(u + Math.sin((h / 12) * 6.283) * 6, t - Math.cos((h / 12) * 6.283) * 6);
  ctx.stroke();
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(u, t);
  ctx.lineTo(u + Math.sin((m / 60) * 6.283) * 9, t - Math.cos((m / 60) * 6.283) * 9);
  ctx.stroke();
  ctx.lineCap = 'butt';
  ctx.fillStyle = '#c0392b';
  ctx.beginPath();
  ctx.arc(u, t, 1.2, 0, 6.3);
  ctx.fill();
}

export function wallShelf(d?: GameValue): GameValue {
  const ctx = game.view.ctx;
  const w: GameValue = d.w || 70,
    u: GameValue = d.u - w / 2,
    t: GameValue = d.top || 44;
  ctx.fillStyle = '#6d4c41';
  ctx.fillRect(u, t, w, 4);
  const cols: GameValue = ['#e74c3c', '#3498db', '#f1c40f', '#2ecc71', '#9b59b6', '#e67e22'];
  let x: GameValue = u + 3;
  for (let i: GameValue = 0; x < u + w - 8; i++) {
    const bw: GameValue = 4 + rnd(i + d.u) * 4,
      bh: GameValue = 12 + rnd(i * 2 + d.u) * 8;
    ctx.fillStyle = cols[i % cols.length];
    ctx.fillRect(x, t - bh, bw, bh);
    x += bw + 1;
  }
}

export function wallCabinets(d?: GameValue): GameValue {
  const ctx = game.view.ctx;
  const w: GameValue = d.w || 100,
    u: GameValue = d.u - w / 2,
    t: GameValue = 8,
    h: GameValue = 34;
  ctx.fillStyle = 'rgba(0,0,0,0.2)';
  ctx.fillRect(u + 2, t + 2, w, h);
  ctx.fillStyle = '#fdfdfd';
  ctx.fillRect(u, t, w, h);
  const n: GameValue = Math.round(w / 30);
  for (let i: GameValue = 0; i < n; i++) {
    ctx.strokeStyle = 'rgba(0,0,0,0.25)';
    ctx.strokeRect(u + (i * w) / n + 2, t + 2, w / n - 4, h - 4);
    ctx.fillStyle = '#95a5a6';
    ctx.fillRect(u + ((i + 0.5) * w) / n - 4, t + h - 8, 8, 2);
  }
}

export function wallMirror(d?: GameValue): GameValue {
  const ctx = game.view.ctx;
  const w: GameValue = d.w || 50,
    h: GameValue = d.h || 44,
    u: GameValue = d.u - w / 2,
    t: GameValue = d.top || 16;
  ctx.fillStyle = '#b2bec3';
  ctx.beginPath();
  ctx.roundRect
    ? ctx.roundRect(u - 3, t - 3, w + 6, h + 6, 10)
    : ctx.rect(u - 3, t - 3, w + 6, h + 6);
  ctx.fill();
  const g: GameValue = ctx.createLinearGradient(u, t, u + w, t + h);
  g.addColorStop(0, '#e3f4fb');
  g.addColorStop(1, '#9fc7d8');
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.roundRect ? ctx.roundRect(u, t, w, h, 8) : ctx.rect(u, t, w, h);
  ctx.fill();
  ctx.strokeStyle = 'rgba(255,255,255,0.7)';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(u + 8, t + h - 10);
  ctx.lineTo(u + w * 0.45, t + 8);
  ctx.stroke();
}

export function wallTowels(d?: GameValue): GameValue {
  const ctx = game.view.ctx;
  const u: GameValue = d.u,
    t: GameValue = d.top || 50;
  ctx.fillStyle = '#b2bec3';
  ctx.fillRect(u - 22, t, 44, 3);
  ctx.fillStyle = '#ff7675';
  ctx.fillRect(u - 18, t + 3, 16, 30);
  ctx.fillStyle = '#74b9ff';
  ctx.fillRect(u + 2, t + 3, 16, 26);
  ctx.fillStyle = 'rgba(255,255,255,0.4)';
  ctx.fillRect(u - 18, t + 26, 16, 3);
  ctx.fillRect(u + 2, t + 22, 16, 3);
}

export function wallNeon(d?: GameValue, t?: GameValue): GameValue {
  const ctx = game.view.ctx;
  const flick: GameValue = Math.sin(t * 13) > 0.97 ? 0.3 : 1;
  ctx.save();
  ctx.font = 'bold 30px sans-serif';
  ctx.textAlign = 'center';
  ctx.shadowColor = `rgba(${d.color},${flick})`;
  ctx.shadowBlur = 18;
  ctx.fillStyle = `rgba(${d.color},${flick})`;
  ctx.fillText(d.text, d.u, 50);
  ctx.shadowBlur = 0;
  ctx.fillStyle = `rgba(255,255,255,${0.6 * flick})`;
  ctx.fillText(d.text, d.u, 50);
  ctx.restore();
}

export function wallBottles(d?: GameValue): GameValue {
  const ctx = game.view.ctx;
  const w: GameValue = d.w || 90,
    u: GameValue = d.u - w / 2;
  const cols: GameValue = ['#27ae60', '#c0392b', '#f39c12', '#8e44ad', '#16a085', '#d35400'];
  [30, 58].forEach((t?: GameValue, r?: GameValue): GameValue => {
    ctx.fillStyle = '#3e2723';
    ctx.fillRect(u, t, w, 4);
    for (let i: GameValue = 0; i < w / 9 - 1; i++) {
      const c: GameValue = cols[(i + r * 2) % cols.length],
        x: GameValue = u + 4 + i * 9;
      ctx.fillStyle = c;
      ctx.globalAlpha = 0.85;
      ctx.fillRect(x, t - 16, 6, 16);
      ctx.fillRect(x + 2, t - 21, 2, 5);
      ctx.globalAlpha = 1;
    }
  });
}

export function wallPoster(d?: GameValue): GameValue {
  const ctx = game.view.ctx;
  const w: GameValue = d.w || 70,
    h: GameValue = 34,
    u: GameValue = d.u - w / 2,
    t: GameValue = d.top || 22;
  ctx.fillStyle = d.color || '#e74c3c';
  ctx.fillRect(u, t, w, h);
  ctx.fillStyle = '#ffffff';
  ctx.font = 'bold 9px sans-serif';
  ctx.textAlign = 'center';
  ctx.fillText(d.text || '', d.u, t + h / 2 + 3, w - 6);
}

export function wallLogo(d?: GameValue): GameValue {
  const ctx = game.view.ctx;
  const top: number = d.top || 44,
    size: number = d.size || 18;
  ctx.fillStyle = d.color || '#d35400';
  ctx.font = `bold ${size}px sans-serif`;
  ctx.textAlign = 'center';
  ctx.fillText(d.text, d.u, top, d.maxW);
  ctx.fillStyle = '#2d3436';
  ctx.font = `${Math.round(size / 2)}px sans-serif`;
  ctx.fillText(d.sub || 'arredamento dal 1998', d.u, top + size * 0.78, d.maxW);
}

export function wallCross(d?: GameValue): GameValue {
  const ctx = game.view.ctx;
  const u: GameValue = d.u,
    t: GameValue = 26;
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(u - 22, t - 6, 44, 44);
  ctx.fillStyle = '#e74c3c';
  ctx.fillRect(u - 5, t, 10, 32);
  ctx.fillRect(u - 16, t + 11, 32, 10);
}

export function wallMenu(d?: GameValue): GameValue {
  const ctx = game.view.ctx;
  const u: GameValue = d.u - 40,
    t: GameValue = 16;
  ctx.fillStyle = '#7b4a2e';
  ctx.fillRect(u - 4, t - 4, 88, 60);
  ctx.fillStyle = '#2d3436';
  ctx.fillRect(u, t, 80, 52);
  ctx.fillStyle = '#ffffff';
  ctx.font = 'bold 9px sans-serif';
  ctx.textAlign = 'center';
  ctx.fillText('MENU DEL GIORNO', d.u, t + 12);
  ctx.font = '7px sans-serif';
  ['Pasta al pomodoro  9€', 'Pizza margherita  8€', 'Tiramisù  5€'].forEach(
    (s?: GameValue, i?: GameValue): GameValue => ctx.fillText(s, d.u, t + 25 + i * 10),
  );
}

export function wallWhiteboard(d?: GameValue): GameValue {
  const ctx = game.view.ctx;
  const u: GameValue = d.u - 45,
    t: GameValue = 18;
  ctx.fillStyle = '#b2bec3';
  ctx.fillRect(u - 3, t - 3, 96, 56);
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(u, t, 90, 50);
  ctx.strokeStyle = '#0984e3';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(u + 8, t + 40);
  ctx.lineTo(u + 30, t + 28);
  ctx.lineTo(u + 50, t + 33);
  ctx.lineTo(u + 80, t + 12);
  ctx.stroke();
  ctx.fillStyle = '#d63031';
  ctx.font = 'bold 7px sans-serif';
  ctx.textAlign = 'left';
  ctx.fillText('OBIETTIVI Q4 📈', u + 6, t + 10);
}

export function paintWallSurface(
  st?: GameValue,
  W?: GameValue,
  H?: GameValue,
  side?: GameValue,
): GameValue {
  const ctx = game.view.ctx;
  const c: GameValue = st.wall;
  ctx.fillStyle = c;
  ctx.fillRect(0, 0, W, H);
  switch (st.wallStyle) {
    case 'stripes':
      ctx.fillStyle = game.lighten(c, 0.12);
      for (let u: GameValue = 0; u < W; u += 24) ctx.fillRect(u, 0, 10, H);
      break;
    case 'wainscot': {
      const top: GameValue = H - 46;
      ctx.fillStyle = game.lighten(st.trim, 0.25);
      ctx.fillRect(0, top, W, 46);
      ctx.strokeStyle = 'rgba(0,0,0,0.25)';
      for (let u: GameValue = 6; u < W - 30; u += 40) ctx.strokeRect(u, top + 8, 32, 28);
      ctx.fillStyle = st.trim;
      ctx.fillRect(0, top - 3, W, 4);
      break;
    }
    case 'tilesLow': {
      const top: GameValue = H * 0.45;
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(0, top, W, H - top);
      ctx.strokeStyle = 'rgba(0,0,0,0.1)';
      for (let u: GameValue = 0; u < W; u += 14) {
        ctx.beginPath();
        ctx.moveTo(u, top);
        ctx.lineTo(u, H);
        ctx.stroke();
      }
      for (let v: GameValue = top; v < H; v += 14) {
        ctx.beginPath();
        ctx.moveTo(0, v);
        ctx.lineTo(W, v);
        ctx.stroke();
      }
      ctx.fillStyle = '#e17055';
      ctx.fillRect(0, top - 3, W, 3);
      break;
    }
    case 'tilesFull':
      for (let u: GameValue = 0, i: GameValue = 0; u < W; u += 16)
        for (let v: GameValue = 0; v < H; v += 16, i++) {
          ctx.fillStyle = mixColor(c, '#ffffff', 0.1 + rnd(i) * 0.2);
          ctx.fillRect(u + 0.8, v + 0.8, 14.4, 14.4);
        }
      ctx.fillStyle = game.darken(c, 0.25);
      ctx.fillRect(0, H * 0.55, W, 4);
      break;
    case 'bricks':
      ctx.fillStyle = game.darken(c, 0.35);
      ctx.fillRect(0, 0, W, H);
      for (let v: GameValue = 0, r: GameValue = 0; v < H; v += 10, r++)
        for (let u: GameValue = (r % 2) * -12, i: GameValue = 0; u < W; u += 24, i++) {
          ctx.fillStyle = mixColor(c, '#000000', rnd(r * 40 + i) * 0.25);
          ctx.fillRect(u + 1, v + 1, 22, 8);
        }
      break;
    case 'gallery':
      // parete bianca appena calda, più luminosa in alto dove arrivano i faretti
      {
        const g = ctx.createLinearGradient(0, 0, 0, H);
        g.addColorStop(0, game.lighten(c, 0.5));
        g.addColorStop(1, game.darken(c, 0.04));
        ctx.fillStyle = g;
        ctx.fillRect(0, 0, W, H);
        // fuga d'ombra sopra lo zoccolo, come nelle gallerie moderne
        ctx.fillStyle = 'rgba(0,0,0,0.35)';
        ctx.fillRect(0, H - 8, W, 1.2);
      }
      break;
    case 'bandGreen':
      ctx.fillStyle = '#d1f2eb';
      ctx.fillRect(0, H - 50, W, 50);
      ctx.fillStyle = '#16a085';
      ctx.fillRect(0, H - 54, W, 5);
      break;
    case 'hoarding':
      ctx.fillStyle = c;
      ctx.fillRect(0, 0, W, H);
      ctx.strokeStyle = 'rgba(0,0,0,0.15)';
      for (let u: GameValue = 0; u < W; u += 40) {
        ctx.beginPath();
        ctx.moveTo(u, 0);
        ctx.lineTo(u, H);
        ctx.stroke();
      }
      for (let u: GameValue = -20; u < W; u += 20) {
        ctx.fillStyle = '#f1c40f';
        ctx.beginPath();
        ctx.moveTo(u, H - 12);
        ctx.lineTo(u + 10, H - 12);
        ctx.lineTo(u + 20, H);
        ctx.lineTo(u + 10, H);
        ctx.fill();
      }
      ctx.fillStyle = '#2d3436';
      ctx.fillRect(0, H - 14, W, 2);
      break;
  }
  ctx.fillStyle = st.trim;
  ctx.fillRect(0, H - 7, W, 7);
  ctx.fillStyle = game.lighten(c, 0.2);
  ctx.fillRect(0, 0, W, 3);
  const ao: GameValue = ctx.createLinearGradient(0, H - 22, 0, H);
  ao.addColorStop(0, 'rgba(0,0,0,0)');
  ao.addColorStop(1, 'rgba(0,0,0,0.22)');
  ctx.fillStyle = ao;
  ctx.fillRect(0, H - 22, W, 22);
  const cornerU: GameValue = side === 'back' ? 0 : W;
  const cg: GameValue = ctx.createLinearGradient(cornerU, 0, side === 'back' ? 26 : W - 26, 0);
  cg.addColorStop(0, 'rgba(0,0,0,0.25)');
  cg.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.fillStyle = cg;
  ctx.fillRect(side === 'back' ? 0 : W - 26, 0, 26, H);
}

export function wallPlane(side?: GameValue, H?: GameValue): GameValue {
  if (side === 'back') setPlane([game.X0, game.Y0, H], [1, 0, 0], [0, 0, -1]);
  else setPlane([game.X0, game.Y1, H], [0, -1, 0], [0, 0, -1]);
}

export function drawWalls(st?: GameValue, hour?: GameValue): GameValue {
  const H: GameValue = st.wallH || 130;
  ['back', 'left'].forEach((side?: GameValue): GameValue => {
    const W: GameValue = side === 'back' ? game.X1 - game.X0 : game.Y1 - game.Y0;
    wallPlane(side, H);
    paintWallSurface(st, W, H, side);
    ((st.decor || {})[side] || []).forEach((d?: GameValue): GameValue => {
      const f: GameValue = game.WALL_DECOR[d.t];
      if (f) f(d, { hour, wallH: H });
    });
    if (side === 'left') {
      game.view.ctx.fillStyle = 'rgba(0,0,0,0.1)';
      game.view.ctx.fillRect(0, 0, W, H);
    }
    resetPlane();
  });
  const T: GameValue = 10,
    capC: GameValue = game.darken(st.wall, 0.45);
  poly(
    [
      isoProject(game.X0 - T, game.Y0 - T, H),
      isoProject(game.X1, game.Y0 - T, H),
      isoProject(game.X1, game.Y0, H),
      isoProject(game.X0, game.Y0, H),
    ],
    capC,
    'rgba(0,0,0,0.3)',
  );
  poly(
    [
      isoProject(game.X0 - T, game.Y1, H),
      isoProject(game.X0, game.Y1, H),
      isoProject(game.X0, game.Y0, H),
      isoProject(game.X0 - T, game.Y0 - T, H),
    ],
    capC,
    'rgba(0,0,0,0.3)',
  );
  poly(
    [
      isoProject(game.X1, game.Y0, 0),
      isoProject(game.X1, game.Y0 - T, 0),
      isoProject(game.X1, game.Y0 - T, H),
      isoProject(game.X1, game.Y0, H),
    ],
    game.darken(st.wall, 0.35),
    'rgba(0,0,0,0.3)',
  );
  poly(
    [
      isoProject(game.X0 - T, game.Y1, 0),
      isoProject(game.X0, game.Y1, 0),
      isoProject(game.X0, game.Y1, H),
      isoProject(game.X0 - T, game.Y1, H),
    ],
    game.darken(st.wall, 0.2),
    'rgba(0,0,0,0.3)',
  );
}

/**
 * Laboratorio dentro il piazzale (st.lab): pavimento a piastrelle, ombre dei muri e la parete
 * sinistra alta con le sue decorazioni. Il muro di fondo con la porta è fatto di pezzi che si
 * disegnano insieme agli oggetti (drawLabWall), così chi sta fuori resta dietro.
 */
function drawLabShell(lab: GameValue, hour: GameValue): void {
  const ctx = game.view.ctx;
  const y0: number = lab.y + 10; // filo interno del muro di fondo
  const W: number = game.X1 - game.X0,
    D: number = game.Y1 - y0;
  setPlane([game.X0, y0, 0], [1, 0, 0], [0, 1, 0]);
  try {
    ctx.fillStyle = lab.floorColor;
    ctx.fillRect(0, 0, W, D);
    ctx.strokeStyle = 'rgba(0,0,0,0.08)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    for (let u = 40; u < W; u += 40) {
      ctx.moveTo(u, 0);
      ctx.lineTo(u, D);
    }
    for (let v = 40; v < D; v += 40) {
      ctx.moveTo(0, v);
      ctx.lineTo(W, v);
    }
    ctx.stroke();
    const g1 = ctx.createLinearGradient(0, 0, 0, 30);
    g1.addColorStop(0, 'rgba(0,0,0,0.3)');
    g1.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = g1;
    ctx.fillRect(0, 0, W, 30);
    const g2 = ctx.createLinearGradient(0, 0, 30, 0);
    g2.addColorStop(0, 'rgba(0,0,0,0.3)');
    g2.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = g2;
    ctx.fillRect(0, 0, 30, D);
  } finally {
    resetPlane();
  }
  const H: number = lab.wallH,
    L: number = game.Y1 - lab.y;
  setPlane([game.X0, game.Y1, H], [0, -1, 0], [0, 0, -1]);
  try {
    paintWallSurface(lab, L, H, 'left');
    for (const d of lab.decor?.left || []) {
      const f: GameValue = game.WALL_DECOR[d.t];
      if (f) f(d, { hour, wallH: H });
    }
    ctx.fillStyle = 'rgba(0,0,0,0.1)';
    ctx.fillRect(0, 0, L, H);
  } finally {
    resetPlane();
  }
  const T = 10;
  poly(
    [
      isoProject(game.X0 - T, game.Y1, H),
      isoProject(game.X0, game.Y1, H),
      isoProject(game.X0, lab.y, H),
      isoProject(game.X0 - T, lab.y, H),
    ],
    game.darken(lab.wall, 0.45),
    'rgba(0,0,0,0.3)',
  );
  poly(
    [
      isoProject(game.X0 - T, game.Y1, 0),
      isoProject(game.X0, game.Y1, 0),
      isoProject(game.X0, game.Y1, H),
      isoProject(game.X0 - T, game.Y1, H),
    ],
    game.darken(lab.wall, 0.2),
    'rgba(0,0,0,0.3)',
  );
}

export function drawDynamicWalls(st?: GameValue, t?: GameValue): GameValue {
  // decorazioni che si muovono sulla parete del laboratorio (l'orologio)
  const labLive: GameValue[] = (st.lab?.decor?.left || []).filter(
    (d: GameValue) => game.WALL_DECOR_DYNAMIC[d.t],
  );
  if (labLive.length) {
    setPlane([game.X0, game.Y1, st.lab.wallH], [0, -1, 0], [0, 0, -1]);
    // la parete del laboratorio è più bassa di quelle della stanza: l'altezza va passata
    labLive.forEach((d: GameValue) =>
      game.WALL_DECOR_DYNAMIC[d.t]({ ...d, side: 'left', wallH: st.lab.wallH }, t),
    );
    resetPlane();
  }
  if (st.outdoor && !st.fence) return;
  const H: GameValue = st.wallH || 130;
  ['back', 'left'].forEach((side?: GameValue): GameValue => {
    const list: GameValue = ((st.decor || {})[side] || []).filter(
      (d?: GameValue): GameValue => game.WALL_DECOR_DYNAMIC[d.t],
    );
    if (!list.length) return;
    wallPlane(side, H);
    // ognuno sa su quale parete sta: chi sporge dal muro si disegna in rilievo
    list.forEach(
      (d?: GameValue): GameValue => game.WALL_DECOR_DYNAMIC[d.t](d.side ? d : { ...d, side }, t),
    );
    resetPlane();
  });
}

export function drawStaticScene(st?: GameValue, hour?: GameValue): GameValue {
  // Pavimento e pareti si disegnano una volta in un'immagine grande quanto tutta la corsa della
  // telecamera; a ogni fotogramma se ne mostra il pezzo inquadrato.
  const s: number = cameraScale();
  const r = cameraRange(s);
  const W: number = game.view.canvas.width,
    H: number = game.view.canvas.height;
  // anche la misura della stanza: uno sfondo disegnato con i bordi di un altro ambiente non resta
  const key: GameValue = [
    game.view.activeEnvironment,
    game.currentRoomIdx,
    game.X0,
    game.X1,
    game.Y0,
    game.Y1,
    W,
    H,
    s,
    Math.floor(hour),
  ].join('|');
  let off = game.bgCache.canvas;
  if (game.bgCache.key !== key || !off) {
    off ||= document.createElement('canvas');
    off.width = Math.ceil(W + (r.u1 - r.u0) * s) + 2;
    off.height = Math.ceil(H + (r.v1 - r.v0) * s) + 2;
    const mainCtx = game.view.ctx;
    const mainOverride = game.viewOverride;
    game.view.ctx = off.getContext('2d')!;
    game.viewOverride = {
      cx: W / 2 - Math.round(r.u0 * s),
      cy: H / 2 + 55 - Math.round(r.v0 * s),
      scale: s,
    };
    try {
      game.view.ctx.clearRect(0, 0, off.width, off.height);
      drawFloorPattern(st);
      if (!st.outdoor || st.fence) drawWalls(st, hour);
      if (st.lab) drawLabShell(st.lab, hour);
    } finally {
      game.view.ctx = mainCtx;
      game.viewOverride = mainOverride;
    }
    game.bgCache = { key, canvas: off };
  }
  // stesso spostamento in pixel interi usato per oggetti e personaggi (vedi cameraPx)
  const cam = cameraPx(s);
  game.view.ctx.drawImage(off, Math.round(r.u0 * s) - cam.u, Math.round(r.v0 * s) - cam.v);
}

export function drawDynamicFloor(st?: GameValue, t?: GameValue): GameValue {
  const ctx = game.view.ctx;
  if (st.floor === 'dance') {
    setPlane([game.X0, game.Y0, 0], [1, 0, 0], [0, 1, 0]);
    for (let u: GameValue = 0, i: GameValue = 0; u < 400; u += 40)
      for (let v: GameValue = 0; v < 360; v += 40, i++) {
        const a: GameValue = 0.28 + 0.3 * Math.sin(t * 4 + i * 1.7);
        ctx.fillStyle = `hsla(${(u * 0.5 + v * 0.7 + t * 90) % 360},95%,55%,${a})`;
        ctx.fillRect(u + 1, v + 1, 38, 38);
      }
    resetPlane();
    return;
  }
  if (st.floor !== 'beach') return;
  setPlane([game.X0, game.Y0, 0], [1, 0, 0], [0, 1, 0]);
  ctx.strokeStyle = 'rgba(255,255,255,0.35)';
  ctx.lineWidth = 1.5;
  for (let r: GameValue = 0; r < 4; r++) {
    const v: GameValue = 18 + r * 24;
    ctx.beginPath();
    for (let u: GameValue = 0; u <= 400; u += 8) {
      const vv: GameValue = v + Math.sin(u * 0.05 + t * 1.5 + r) * 3;
      u === 0 ? ctx.moveTo(u, vv) : ctx.lineTo(u, vv);
    }
    ctx.stroke();
  }
  const shore: GameValue = 108 + Math.sin(t * 1.1) * 5;
  ctx.fillStyle = 'rgba(255,255,255,0.55)';
  ctx.beginPath();
  ctx.moveTo(0, shore);
  for (let u: GameValue = 0; u <= 400; u += 10)
    ctx.lineTo(u, shore + Math.sin(u * 0.08 + t * 2) * 2.5);
  ctx.lineTo(400, shore - 6);
  ctx.lineTo(0, shore - 6);
  ctx.fill();
  ctx.fillStyle = 'rgba(255,255,255,0.6)';
  for (let i: GameValue = 0; i < 12; i++) {
    const ph: GameValue = (t * 0.7 + rnd(i)) % 1;
    if (ph < 0.5) ctx.fillRect(rnd(i * 3) * 400, rnd(i * 5) * 100, 3 * (0.5 - ph) * 2, 1);
  }
  resetPlane();
}

export function applyLighting(dark?: GameValue, lights?: GameValue, _st?: GameValue): GameValue {
  const ctx = game.view.ctx;
  const W: GameValue = game.view.canvas.width,
    H: GameValue = game.view.canvas.height;
  const vg: GameValue = ctx.createRadialGradient(
    W / 2,
    H / 2,
    Math.min(W, H) * 0.3,
    W / 2,
    H / 2,
    Math.max(W, H) * 0.75,
  );
  vg.addColorStop(0, 'rgba(0,0,0,0)');
  vg.addColorStop(1, 'rgba(0,0,0,0.4)');
  ctx.fillStyle = vg;
  ctx.fillRect(0, 0, W, H);
  if (dark <= 0.01) return;
  if (!game.lightCanvas) game.lightCanvas = document.createElement('canvas');
  if (game.lightCanvas.width !== W || game.lightCanvas.height !== H) {
    game.lightCanvas.width = W;
    game.lightCanvas.height = H;
  }
  const l: GameValue = game.lightCanvas.getContext('2d');
  l.globalCompositeOperation = 'source-over';
  l.clearRect(0, 0, W, H);
  l.fillStyle = `rgba(6,10,40,${dark})`;
  l.fillRect(0, 0, W, H);
  l.globalCompositeOperation = 'destination-out';
  const s: GameValue = isoScale();
  lights.forEach((li?: GameValue): GameValue => {
    const p: GameValue = isoProject(li.x, li.y, (li.z || 0) * 0.3),
      r: GameValue = (li.r || 120) * s;
    const g: GameValue = l.createRadialGradient(p.x, p.y, 0, p.x, p.y, r);
    g.addColorStop(0, 'rgba(0,0,0,0.92)');
    g.addColorStop(1, 'rgba(0,0,0,0)');
    l.fillStyle = g;
    l.beginPath();
    l.arc(p.x, p.y, r, 0, Math.PI * 2);
    l.fill();
  });
  ctx.drawImage(game.lightCanvas, 0, 0);
  ctx.globalCompositeOperation = 'lighter';
  lights.forEach((li?: GameValue): GameValue => {
    const p: GameValue = isoProject(li.x, li.y, (li.z || 0) * 0.5),
      r: GameValue = (li.r || 120) * s * 0.7;
    const g: GameValue = ctx.createRadialGradient(p.x, p.y, 0, p.x, p.y, r);
    g.addColorStop(0, `rgba(${li.color || '255,210,150'},${(0.22 * dark) / 0.5})`);
    g.addColorStop(1, `rgba(${li.color || '255,210,150'},0)`);
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.arc(p.x, p.y, r, 0, Math.PI * 2);
    ctx.fill();
  });
  ctx.globalCompositeOperation = 'source-over';
}

export function drawLabel(
  label?: GameValue,
  x?: GameValue,
  y?: GameValue,
  _w?: GameValue,
  _h?: GameValue,
  zHeight?: GameValue,
): GameValue {
  const ctx = game.view.ctx;
  const dist: GameValue = Math.hypot(game.playerPos.x - x, game.playerPos.y - y);
  const a: GameValue = Math.max(0, Math.min(1, (125 - dist) / 45)); // solo gli oggetti vicini, per non affollare lo schermo
  if (a <= 0.02) return;
  const p: GameValue = isoProject(x, y, zHeight);
  ctx.globalAlpha = a;
  ctx.font = 'bold 11px sans-serif';
  ctx.textAlign = 'center';
  const tw: GameValue = ctx.measureText(label).width + 14;
  ctx.fillStyle = 'rgba(15,15,28,0.78)';
  ctx.beginPath();
  ctx.roundRect
    ? ctx.roundRect(p.x - tw / 2, p.y - 30, tw, 18, 9)
    : ctx.rect(p.x - tw / 2, p.y - 30, tw, 18);
  ctx.fill();
  ctx.fillStyle = '#ffffff';
  ctx.fillText(label, p.x, p.y - 17);
  ctx.globalAlpha = 1;
}

export function nameHash(str?: GameValue): GameValue {
  let h: GameValue = 7;
  for (const ch of String(str || '')) h = (h * 31 + ch.charCodeAt(0)) | 0;
  return Math.abs(h);
}

// Quadro dipinto dal proprietario della stanza, appeso sulla parete di fondo.
const paintingCache = new Map<string, HTMLCanvasElement>();
export function paintingImage(code: string): HTMLCanvasElement | null {
  const cached = paintingCache.get(code);
  if (cached) return cached;
  const grid = decodePainting(code);
  if (!grid) return null;
  const cv = document.createElement('canvas');
  cv.width = PAINT_W;
  cv.height = PAINT_H;
  const ctx = cv.getContext('2d');
  if (!ctx) return null;
  for (let i = 0; i < PAINT_CELLS; i++) {
    ctx.fillStyle = PAINT_PALETTE[grid[i]];
    ctx.fillRect(i % PAINT_W, Math.floor(i / PAINT_W), 1, 1);
  }
  if (paintingCache.size > 40) paintingCache.clear();
  paintingCache.set(code, cv);
  return cv;
}

export function wallRoomPainting(d?: GameValue): GameValue {
  const room: GameValue = game.roomsState[game.currentRoomIdx ?? -1];
  const hung = roomPaintings(room);
  // Posizioni scelte dal proprietario: la sua mappa, oppure la disposizione pubblicata per i visitatori.
  const map: GameValue = isMyRoomNow() ? getMyRoomMap() : room?.layout || {};
  for (const slot of PAINTING_SLOTS) {
    const code = hung[slot];
    const key = paintingKey(slot);
    const spot: GameValue = map[key] || game.playerRoomFurniture[key];
    if (code && spot) drawHungPainting(d, code, spot);
  }
}

function drawHungPainting(d: GameValue, code: string, spot: GameValue): void {
  const img = paintingImage(code);
  if (!img) return;
  const side = spot.y <= -160 ? 'back' : 'left';
  if (d.side !== side) return;
  const center = side === 'back' ? spot.x + 200 : 180 - spot.y;
  const ctx: GameValue = game.view.ctx;
  const w = 64,
    h = 48,
    u = center - w / 2,
    top = 20;
  ctx.fillStyle = 'rgba(0,0,0,0.25)';
  ctx.fillRect(u - 3, top - 2, w + 8, h + 8);
  ctx.fillStyle = '#8d5524';
  ctx.fillRect(u - 5, top - 5, w + 10, h + 10);
  ctx.fillStyle = '#c9a227';
  ctx.fillRect(u - 3, top - 3, w + 6, h + 6);
  const smooth = ctx.imageSmoothingEnabled;
  ctx.imageSmoothingEnabled = false;
  ctx.drawImage(img, u, top, w, h);
  ctx.imageSmoothingEnabled = smooth;
  ctx.strokeStyle = 'rgba(0,0,0,0.3)';
  ctx.lineWidth = 1;
  ctx.strokeRect(u, top, w, h);
  // targhetta d'ottone col titolo, sotto la cornice
  const title = paintingTitle(code);
  if (!title) return;
  ctx.font = 'bold 6px sans-serif';
  const tw = Math.min(w + 6, ctx.measureText(title).width + 8);
  const py = top + h + 9;
  ctx.fillStyle = '#c9a227';
  ctx.fillRect(center - tw / 2, py, tw, 9);
  ctx.strokeStyle = 'rgba(0,0,0,0.35)';
  ctx.strokeRect(center - tw / 2, py, tw, 9);
  ctx.fillStyle = '#3d2b12';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(title, center, py + 4.8, tw - 4);
  ctx.textAlign = 'left';
  ctx.textBaseline = 'alphabetic';
}

// Cassaforte nella parete di sinistra: un blocco d'acciaio che sporge dal muro.
export function wallSafe(d?: GameValue, t?: GameValue): GameValue {
  if (d.side !== 'left') return;
  const ctx: GameValue = game.view.ctx;
  const u = 180 - SAFE_SPOT.y,
    size = 42,
    top = 48;
  const room: GameValue = game.roomsState[game.currentRoomIdx ?? -1];
  const level2 = safeLevel(room?.economy?.ownedFurniture) >= 2;
  // ombra sul muro, sotto e dietro il blocco
  ctx.fillStyle = 'rgba(0,0,0,0.25)';
  ctx.fillRect(u - size / 2 - 3, top - 1, size + 8, size + 9);
  // dal piano del muro alle coordinate della stanza
  const H: number = game.ENV_STYLE.PLAYER_ROOM?.wallH || 130;
  resetPlane();
  const z0 = H - top - size,
    y = SAFE_SPOT.y;
  // corpo che sporge dal muro (con il bordino dorato al livello 2) e porta davanti, un po' più piccola
  const body: GameValue = box(
    game.X0 + 5,
    y,
    10,
    size + 6,
    size + 6,
    level2 ? '#a07818' : '#3f4854',
    {
      z0: z0 - 3,
    },
  );
  onFace(body, 'right', (W: number, FH: number): void => {
    ctx.fillStyle = level2 ? '#e3b93a' : '#4b5563';
    ctx.fillRect(0, 0, W, FH);
    ctx.fillStyle = level2 ? 'rgba(90,60,0,0.35)' : 'rgba(0,0,0,0.35)';
    ctx.fillRect(2, 2, W - 4, FH - 4);
  });
  const door: GameValue = box(game.X0 + 11, y, 2, size, size, level2 ? '#9c7a1c' : '#6b7785', {
    z0,
  });
  onFace(door, 'right', (W: number, FH: number): void => {
    const g = ctx.createLinearGradient(0, 0, W, FH);
    // livello 2: tutta d'oro
    g.addColorStop(0, level2 ? '#f6dc84' : '#9aa5b1');
    g.addColorStop(1, level2 ? '#a8801e' : '#4b5563');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, W, FH);
    ctx.strokeStyle = level2 ? 'rgba(90,60,0,0.5)' : 'rgba(0,0,0,0.45)';
    ctx.lineWidth = 1;
    ctx.strokeRect(3, 3, W - 6, FH - 6);
    if (level2) drawSafeKeypad(ctx, 0, 0, size);
    else drawSafeDial(ctx, 0, 0, size);
    // lucina: verde se la cassaforte ha un PIN, rossa altrimenti
    const pulse = 0.6 + 0.4 * Math.sin((t || 0) * 3);
    ctx.fillStyle = room?.pin ? `rgba(46,213,115,${pulse})` : `rgba(255,71,87,${pulse})`;
    ctx.beginPath();
    ctx.arc(W - 6, 6, 2, 0, 6.3);
    ctx.fill();
  });
  // cerniere dal lato verso il fondo e maniglia che sporge dalla porta
  const front = game.X0 + 12;
  for (const k of [0.25, 0.75])
    box(front + 1, y + size / 2 - 1, 2, 3, 7, level2 ? '#6b4f12' : '#1f2937', {
      z0: z0 + size * k - 3.5,
    });
  box(front + 2, y - size * 0.3, 4, 3, size * 0.4, level2 ? '#fdf3c0' : '#d1d5db', {
    z0: z0 + size * 0.3,
  });
  wallPlane('left', H);
}

/**
 * Pezzi in rilievo su una parete: `a` lungo il muro (come la `u` delle decorazioni), `out` quanto
 * si staccano dal muro. Restituisce anche la faccia che guarda la stanza.
 */
function wallAxes(side: string) {
  const back = side === 'back';
  return {
    front: back ? 'left' : 'right',
    box: (
      a: number,
      out: number,
      wA: number,
      dOut: number,
      h: number,
      color: string,
      z0: number,
    ) =>
      back
        ? box(game.X0 + a, game.Y0 + out, wA, dOut, h, color, { z0 })
        : box(game.X0 + out, game.Y1 - a, dOut, wA, h, color, { z0 }),
  };
}

const wallHere = (): number => game.ENV_STYLE[game.view.activeEnvironment]?.wallH || 130;

// Cornice, davanzale ed eventuali tende in rilievo davanti a una finestra (il vetro resta sul muro).
export function wallWindowDepth(d?: GameValue): GameValue {
  const H = wallHere();
  const w: number = d.w,
    h: number = d.h,
    top: number = d.top || Math.max(18, H * 0.2);
  resetPlane();
  const W = wallAxes(d.side);
  const a0 = d.u - w / 2,
    a1 = a0 + w,
    am = d.u,
    zt = H - top,
    zb = zt - h;
  const white = '#f5f5f5';
  // cornice: montanti, architrave e traverse in croce
  W.box(a0 - 2, 2, 4, 4, h + 4, white, zb - 2);
  W.box(a1 + 2, 2, 4, 4, h + 4, white, zb - 2);
  W.box(am, 2, w + 8, 4, 4, white, zt);
  W.box(am, 1.5, 3, 3, h, '#ececec', zb);
  W.box(am, 1.5, w, 3, 3, '#ececec', zb + h / 2 - 1.5);
  // davanzale che sporge
  W.box(am, 5, w + 16, 10, 3, '#e0e0e0', zb - 6);
  if (d.curtains) {
    // bastone e tende staccate dal muro, con le pieghe
    W.box(am, 8, w + 40, 2.5, 2.5, '#7f8c8d', zt + 7);
    for (const ca of [a0 - 8, a1 + 8]) {
      const c: GameValue = W.box(ca, 8, 14, 3, h + 18, '#c0392b', zb - 10);
      onFace(c, W.front, (CW: number, CH: number): void => {
        const ctx = game.view.ctx;
        for (let k = 0; k < 4; k++) {
          const g = ctx.createLinearGradient(k * (CW / 4), 0, (k + 1) * (CW / 4), 0);
          g.addColorStop(0, 'rgba(0,0,0,0.22)');
          g.addColorStop(0.5, 'rgba(255,255,255,0.08)');
          g.addColorStop(1, 'rgba(0,0,0,0.22)');
          ctx.fillStyle = g;
          ctx.fillRect(k * (CW / 4), 0, CW / 4, CH);
        }
      });
    }
  }
  wallPlane(d.side, H);
}

// Specchio del bagno in rilievo, con la mensolina di vetro sotto (bicchiere e spazzolini).
export function wallMirror3d(d?: GameValue): GameValue {
  const H = wallHere();
  const w: number = d.w || 50,
    h: number = d.h || 44,
    zt = H - (d.top || 16),
    zb = zt - h;
  resetPlane();
  const W = wallAxes(d.side);
  const ctx = game.view.ctx;
  const frame: GameValue = W.box(d.u, 2, w + 6, 4, h + 6, '#b2bec3', zb - 3);
  onFace(frame, W.front, (FW: number, FH: number): void => {
    const g = ctx.createLinearGradient(0, 0, FW, FH);
    g.addColorStop(0, '#eaf7fc');
    g.addColorStop(1, '#93bfd2');
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.roundRect ? ctx.roundRect(3, 3, FW - 6, FH - 6, 6) : ctx.rect(3, 3, FW - 6, FH - 6);
    ctx.fill();
    ctx.strokeStyle = 'rgba(255,255,255,0.75)';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(10, FH - 12);
    ctx.lineTo(FW * 0.45, 9);
    ctx.moveTo(18, FH - 10);
    ctx.lineTo(FW * 0.55, 13);
    ctx.stroke();
  });
  // mensolina di vetro stretta e attaccata al muro: sporgendo poco resta sotto il centro dello
  // specchio anche vista di sbieco; sopra il bicchiere degli spazzolini e il sapone
  W.box(d.u, 4, w, 5, 2, 'rgba(200,230,240,0.85)', zb - 10);
  W.box(d.u - w * 0.25, 4, 4, 4, 8, '#74b9ff', zb - 8);
  W.box(d.u - w * 0.25 - 1, 4, 1.2, 1.2, 6, '#ff7675', zb);
  W.box(d.u - w * 0.25 + 1.2, 4, 1.2, 1.2, 5, '#55efc4', zb);
  W.box(d.u + w * 0.25, 4, 4, 3.5, 10, '#ffeaa7', zb - 8);
  wallPlane(d.side, H);
}

// Portasciugamani con due asciugamani appesi, staccati dal muro.
export function wallTowels3d(d?: GameValue): GameValue {
  const H = wallHere();
  const bar = H - (d.top || 50);
  resetPlane();
  const W = wallAxes(d.side);
  const ctx = game.view.ctx;
  for (const da of [-22, 22]) W.box(d.u + da, 3, 2, 6, 2, '#95a5a6', bar);
  const towels: [number, number, string][] = [
    [-10, 30, '#ff7675'],
    [10, 26, '#74b9ff'],
  ];
  for (const [da, len, color] of towels) {
    const t: GameValue = W.box(d.u + da, 6, 17, 4, len, color, bar - len + 2);
    onFace(t, W.front, (TW: number, TH: number): void => {
      // orlo chiaro in fondo e pieghe morbide
      ctx.fillStyle = 'rgba(255,255,255,0.45)';
      ctx.fillRect(0, TH - 7, TW, 3);
      ctx.fillStyle = 'rgba(0,0,0,0.1)';
      ctx.fillRect(TW * 0.3, 0, 1, TH);
      ctx.fillRect(TW * 0.7, 0, 1, TH);
    });
  }
  W.box(d.u, 6, 46, 2.5, 2.5, '#b2bec3', bar);
  wallPlane(d.side, H);
}

/** Livello 2: piccolo display e tastiera con i tasti da 1 a 5. */
function drawSafeKeypad(
  ctx: CanvasRenderingContext2D,
  left: number,
  top: number,
  size: number,
): void {
  const kx = left + 6,
    ky = top + 11,
    kw = size * 0.6;
  ctx.fillStyle = '#0f172a';
  ctx.fillRect(kx, ky, kw, 8);
  ctx.fillStyle = '#34d399';
  ctx.font = 'bold 6px monospace';
  ctx.textAlign = 'center';
  ctx.fillText('* * *', kx + kw / 2, ky + 6);
  const kb = (kw - 4) / 3;
  for (let i = 0; i < 6; i++) {
    const bx = kx + (i % 3) * (kb + 2),
      by = ky + 11 + Math.floor(i / 3) * (kb * 0.8 + 2);
    ctx.fillStyle = i < 5 ? '#e5e7eb' : '#22a35a';
    ctx.fillRect(bx, by, kb, kb * 0.8);
    ctx.fillStyle = i < 5 ? '#111827' : '#ffffff';
    ctx.font = 'bold 5px sans-serif';
    ctx.fillText(i < 5 ? String(i + 1) : 'OK', bx + kb / 2, by + kb * 0.55);
  }
  // in cima, sopra display e tasti: sulla porta d'oro la scritta è color bronzo
  ctx.fillStyle = '#5b4210';
  ctx.font = 'bold 5px sans-serif';
  ctx.fillText('LV 2', kx + kw / 2, top + 8);
}

/** Livello 1: manopola con le tacche. */
function drawSafeDial(
  ctx: CanvasRenderingContext2D,
  left: number,
  top: number,
  size: number,
): void {
  // manopola con le tacche
  const cx = left + size * 0.42,
    cy = top + size * 0.5;
  ctx.fillStyle = '#e5e7eb';
  ctx.beginPath();
  ctx.arc(cx, cy, 8, 0, 6.3);
  ctx.fill();
  ctx.strokeStyle = '#111827';
  ctx.lineWidth = 1.2;
  ctx.beginPath();
  ctx.arc(cx, cy, 5.5, 0, 6.3);
  ctx.stroke();
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * Math.PI * 2;
    ctx.beginPath();
    ctx.moveTo(cx + Math.cos(a) * 6.5, cy + Math.sin(a) * 6.5);
    ctx.lineTo(cx + Math.cos(a) * 8, cy + Math.sin(a) * 8);
    ctx.stroke();
  }
  ctx.beginPath();
  ctx.moveTo(cx, cy);
  ctx.lineTo(cx + 4, cy - 3);
  ctx.stroke();
}

/**
 * Targhetta di ottone sulla parete di sinistra della camera (vicino all'ingresso) di chi ha versato soldi per il razzo.
 * Compare dopo il lancio; la vedono anche i visitatori. Sta sotto i quadri, così non li copre.
 */
export function wallRocketPlaque(d?: GameValue): GameValue {
  const room: GameValue = game.roomsState[game.currentRoomIdx ?? -1];
  const owner: string | undefined = isMyRoomNow() ? game.session.myPlayerId : room?.ownerId;
  const amount = owner ? game.rocketDonors[owner] : 0;
  if (!amount) return;
  const now = Date.now() + (game.session.serverOffset || 0);
  if (launchPhase(game.rocketStage, game.rocketLaunchAt, now).phase !== 'launched') return;
  const ctx: GameValue = game.view.ctx;
  const w = 46,
    h = 30,
    left = d.u - w / 2,
    top = 88;
  ctx.fillStyle = 'rgba(0,0,0,0.3)';
  ctx.fillRect(left + 2, top + 2, w, h);
  // legno scuro con la lastra d'ottone
  ctx.fillStyle = '#5d4037';
  ctx.fillRect(left, top, w, h);
  const g = ctx.createLinearGradient(left, top, left + w, top + h);
  g.addColorStop(0, '#f6e27a');
  g.addColorStop(0.5, '#c9a227');
  g.addColorStop(1, '#f1d36b');
  ctx.fillStyle = g;
  ctx.fillRect(left + 3, top + 3, w - 6, h - 6);
  ctx.strokeStyle = 'rgba(90,60,10,0.6)';
  ctx.lineWidth = 0.6;
  ctx.strokeRect(left + 4.5, top + 4.5, w - 9, h - 9);
  // razzetto inciso
  ctx.fillStyle = '#7a5c12';
  ctx.beginPath();
  ctx.moveTo(left + 10, top + 8);
  ctx.quadraticCurveTo(left + 13, top + 12, left + 13, top + 16);
  ctx.lineTo(left + 13, top + 21);
  ctx.lineTo(left + 7, top + 21);
  ctx.lineTo(left + 7, top + 16);
  ctx.quadraticCurveTo(left + 7, top + 12, left + 10, top + 8);
  ctx.fill();
  ctx.fillRect(left + 5, top + 19, 2, 4);
  ctx.fillRect(left + 13, top + 19, 2, 4);
  ctx.fillStyle = '#4a3508';
  ctx.textAlign = 'center';
  ctx.font = 'bold 5.5px sans-serif';
  ctx.fillText('CDC-1', left + 29, top + 12);
  ctx.font = '4px sans-serif';
  ctx.fillText('ho aiutato a', left + 29, top + 17.5);
  ctx.fillText('lanciarlo!', left + 29, top + 22);
  // viti
  ctx.fillStyle = '#8d6e63';
  for (const [vx, vy] of [
    [left + 1.8, top + 1.8],
    [left + w - 1.8, top + 1.8],
    [left + 1.8, top + h - 1.8],
    [left + w - 1.8, top + h - 1.8],
  ]) {
    ctx.beginPath();
    ctx.arc(vx, vy, 1, 0, 6.3);
    ctx.fill();
  }
}

/** Pubblicità del maxischermo: vestiti e mobili che si possono comprare, alternati. */
interface AdSlide {
  shop: string;
  name: string;
  price: number;
  color: string;
  a: string;
  b: string;
}
let adCache: AdSlide[] | null = null;
function adSlides(): AdSlide[] {
  if (adCache?.length) return adCache;
  const clothes: AdSlide[] = (game.shopCatalog || [])
    .filter((i: GameValue) => !i.starter && i.price > 0)
    .map((i: GameValue) => ({
      shop: '👗 BOUTIQUE DOLCE CASA',
      name: i.name,
      price: i.price,
      color: i.color || '#e84393',
      a: '#e84393',
      b: '#6d214f',
    }));
  const furniture: AdSlide[] = (game.furnitureCatalog || [])
    .filter((i: GameValue) => i.price > 0)
    .map((i: GameValue) => ({
      shop: '🛋️ ARREDO CASA',
      name: i.name,
      price: i.price,
      color: i.propData?.color || '#d35400',
      a: '#d35400',
      b: '#3e2723',
    }));
  const list: AdSlide[] = [];
  for (let i = 0; i < Math.max(clothes.length, furniture.length); i++) {
    if (clothes[i]) list.push(clothes[i]);
    if (furniture[i]) list.push(furniture[i]);
  }
  adCache = list;
  return list;
}

/** Maxischermo del centro commerciale: un vestito o un mobile in vendita ogni 4 secondi, in dissolvenza. */
export function wallAdScreen(d?: GameValue, t?: GameValue): GameValue {
  const ctx: GameValue = game.view.ctx;
  const slides = adSlides();
  const w = d.w || 130,
    h = d.h || 64,
    left = d.u - w / 2,
    top = 16;
  ctx.fillStyle = '#1e272e';
  ctx.fillRect(left - 5, top - 5, w + 10, h + 10);
  if (!slides.length) return;
  const n = slides.length,
    pos = ((t || 0) / 4) % n,
    i = Math.floor(pos),
    fade = Math.min(1, (pos - i) * 6);
  const draw = (slide: AdSlide, alpha: number) => {
    ctx.globalAlpha = alpha;
    const g = ctx.createLinearGradient(left, top, left + w, top + h);
    g.addColorStop(0, slide.a);
    g.addColorStop(1, slide.b);
    ctx.fillStyle = g;
    ctx.fillRect(left, top, w, h);
    // nome del negozio
    ctx.textAlign = 'left';
    ctx.fillStyle = 'rgba(255,255,255,0.85)';
    ctx.font = 'bold 6.5px sans-serif';
    ctx.fillText(slide.shop, left + 5, top + 10);
    // campione del colore
    ctx.fillStyle = slide.color;
    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.roundRect
      ? ctx.roundRect(left + 6, top + 18, 24, 24, 5)
      : ctx.rect(left + 6, top + 18, 24, 24);
    ctx.fill();
    ctx.stroke();
    // nome del prodotto, rimpicciolito se è lungo
    ctx.fillStyle = '#ffffff';
    let size = 11;
    ctx.font = `bold ${size}px sans-serif`;
    while (size > 6 && ctx.measureText(slide.name).width > w - 42) {
      size -= 0.5;
      ctx.font = `bold ${size}px sans-serif`;
    }
    ctx.fillText(slide.name, left + 36, top + 32);
    // prezzo
    ctx.fillStyle = '#feca57';
    ctx.font = 'bold 10px sans-serif';
    ctx.fillText(`${slide.price} €`, left + 36, top + 48);
    ctx.fillStyle = 'rgba(255,255,255,0.8)';
    ctx.font = '7px sans-serif';
    ctx.textAlign = 'right';
    ctx.fillText('al centro commerciale!', left + w - 5, top + h - 6);
    ctx.globalAlpha = 1;
  };
  draw(slides[(i + n - 1) % n], 1);
  draw(slides[i], fade);
  // riflesso e lucina accesa
  ctx.fillStyle = 'rgba(255,255,255,0.08)';
  ctx.beginPath();
  ctx.moveTo(left, top);
  ctx.lineTo(left + w * 0.4, top);
  ctx.lineTo(left + w * 0.2, top + h);
  ctx.lineTo(left, top + h);
  ctx.fill();
  ctx.fillStyle = '#2ed573';
  ctx.beginPath();
  ctx.arc(left + w + 2, top + h + 2, 1.5, 0, 6.3);
  ctx.fill();
}
