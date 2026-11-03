import { launchPhase } from '../project-rules.js';
import { realHour } from '../game-clock.js';
import type { GameValue } from '../context.js';
import { game } from '../context.js';
import { cameraRange, cameraScale } from '../camera.js';
import { isoProject, isoScale, mixColor, poly, rnd, setPlane } from './primitives.js';
import { resetPlane } from './objects.js';
import { getMyRoomMap, isMyRoomNow } from '../saves.js';
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

export function drawFloorPattern(st?: GameValue): GameValue {
  const ctx = game.view.ctx;
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
  if (hour >= 20 || hour < 6) {
    ctx.fillStyle = '#ffffff';
    for (let i: GameValue = 0; i < 6; i++)
      ctx.fillRect(u + rnd(i + d.u) * w, t + rnd(i + 9 + d.u) * h * 0.7, 1.2, 1.2);
  } else {
    ctx.fillStyle = 'rgba(255,255,255,0.85)';
    ctx.beginPath();
    ctx.arc(u + w * 0.3, t + h * 0.35, h * 0.12, 0, 6.3);
    ctx.arc(u + w * 0.42, t + h * 0.32, h * 0.14, 0, 6.3);
    ctx.fill();
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

export function wallClock(d?: GameValue): GameValue {
  const ctx = game.view.ctx;
  const u: GameValue = d.u,
    t: GameValue = d.top || 30,
    r: GameValue = 11;
  ctx.fillStyle = '#2d3436';
  ctx.beginPath();
  ctx.arc(u, t, r + 2, 0, 6.3);
  ctx.fill();
  ctx.fillStyle = '#ffffff';
  ctx.beginPath();
  ctx.arc(u, t, r, 0, 6.3);
  ctx.fill();
  const now = new Date();
  const m: GameValue = now.getMinutes() + now.getSeconds() / 60,
    h: GameValue = realHour(now) % 12;
  ctx.strokeStyle = '#2d3436';
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
  ctx.fillStyle = d.color || '#d35400';
  ctx.font = 'bold 18px sans-serif';
  ctx.textAlign = 'center';
  ctx.fillText(d.text, d.u, 44);
  ctx.fillStyle = '#2d3436';
  ctx.font = '9px sans-serif';
  ctx.fillText(d.sub || 'arredamento dal 1998', d.u, 58);
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

export function drawDynamicWalls(st?: GameValue, t?: GameValue): GameValue {
  if (st.outdoor && !st.fence) return;
  const H: GameValue = st.wallH || 130;
  ['back', 'left'].forEach((side?: GameValue): GameValue => {
    const list: GameValue = ((st.decor || {})[side] || []).filter(
      (d?: GameValue): GameValue => game.WALL_DECOR_DYNAMIC[d.t],
    );
    if (!list.length) return;
    wallPlane(side, H);
    list.forEach((d?: GameValue): GameValue => game.WALL_DECOR_DYNAMIC[d.t](d, t));
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
  const key: GameValue = [
    game.view.activeEnvironment,
    game.currentRoomIdx,
    W,
    H,
    s,
    Math.floor(hour),
  ].join('|');
  let off = game.bgCache.canvas;
  if (game.bgCache.key !== key || !off) {
    off ||= document.createElement('canvas');
    off.width = Math.ceil(W + (r.u1 - r.u0) * s);
    off.height = Math.ceil(H + (r.v1 - r.v0) * s);
    const mainCtx = game.view.ctx;
    const mainOverride = game.viewOverride;
    game.view.ctx = off.getContext('2d')!;
    game.viewOverride = { cx: W / 2 - r.u0 * s, cy: H / 2 + 55 - r.v0 * s, scale: s };
    try {
      game.view.ctx.clearRect(0, 0, off.width, off.height);
      drawFloorPattern(st);
      if (!st.outdoor || st.fence) drawWalls(st, hour);
    } finally {
      game.view.ctx = mainCtx;
      game.viewOverride = mainOverride;
    }
    game.bgCache = { key, canvas: off };
  }
  const cam = game.cam || { u: 0, v: 0 };
  game.view.ctx.drawImage(off, Math.round(-(cam.u - r.u0) * s), Math.round(-(cam.v - r.v0) * s));
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

// Porta rotonda del caveau sulla parete della banca.
export function wallVaultDoor(d?: GameValue): GameValue {
  const ctx: GameValue = game.view.ctx;
  const cx: number = d.u,
    cy = 66,
    r = 40;
  ctx.fillStyle = '#5d6d7e';
  ctx.beginPath();
  ctx.arc(cx, cy, r + 6, 0, 6.3);
  ctx.fill();
  const g = ctx.createRadialGradient(cx - 12, cy - 14, 6, cx, cy, r);
  g.addColorStop(0, '#d5dbdf');
  g.addColorStop(1, '#7f8c8d');
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.arc(cx, cy, r, 0, 6.3);
  ctx.fill();
  ctx.strokeStyle = 'rgba(0,0,0,0.35)';
  ctx.lineWidth = 2;
  ctx.stroke();
  // bulloni sul bordo
  for (let i = 0; i < 16; i++) {
    const a = (i / 16) * Math.PI * 2;
    ctx.fillStyle = '#4b5563';
    ctx.beginPath();
    ctx.arc(cx + Math.cos(a) * (r - 5), cy + Math.sin(a) * (r - 5), 2, 0, 6.3);
    ctx.fill();
  }
  // volante di apertura
  ctx.strokeStyle = '#2d3436';
  ctx.lineWidth = 3;
  for (let i = 0; i < 3; i++) {
    const a = (i / 3) * Math.PI;
    ctx.beginPath();
    ctx.moveTo(cx - Math.cos(a) * 18, cy - Math.sin(a) * 18);
    ctx.lineTo(cx + Math.cos(a) * 18, cy + Math.sin(a) * 18);
    ctx.stroke();
  }
  ctx.beginPath();
  ctx.arc(cx, cy, 18, 0, 6.3);
  ctx.stroke();
  ctx.fillStyle = '#b08d57';
  ctx.beginPath();
  ctx.arc(cx, cy, 6, 0, 6.3);
  ctx.fill();
  // cerniere
  ctx.fillStyle = '#4b5563';
  ctx.fillRect(cx + r + 2, cy - 20, 7, 12);
  ctx.fillRect(cx + r + 2, cy + 8, 7, 12);
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
}

// Cassaforte incassata nella parete di sinistra.
export function wallSafe(d?: GameValue, t?: GameValue): GameValue {
  if (d.side !== 'left') return;
  const ctx: GameValue = game.view.ctx;
  const u = 180 - SAFE_SPOT.y,
    size = 42,
    left = u - size / 2,
    top = 48;
  // vano nel muro e telaio
  ctx.fillStyle = 'rgba(0,0,0,0.35)';
  ctx.fillRect(left - 5, top - 5, size + 10, size + 10);
  ctx.fillStyle = '#4b5563';
  ctx.fillRect(left - 3, top - 3, size + 6, size + 6);
  const g = ctx.createLinearGradient(left, top, left + size, top + size);
  g.addColorStop(0, '#9aa5b1');
  g.addColorStop(1, '#4b5563');
  ctx.fillStyle = g;
  ctx.fillRect(left, top, size, size);
  ctx.strokeStyle = 'rgba(0,0,0,0.45)';
  ctx.lineWidth = 1;
  ctx.strokeRect(left + 3, top + 3, size - 6, size - 6);
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
  // maniglia e cerniere
  ctx.fillStyle = '#d1d5db';
  ctx.fillRect(left + size * 0.76, top + size * 0.3, 3.5, size * 0.4);
  ctx.fillStyle = '#1f2937';
  ctx.fillRect(left + 1, top + size * 0.18, 2.5, 6);
  ctx.fillRect(left + 1, top + size * 0.7, 2.5, 6);
  // lucina: verde se la cassaforte ha un PIN, rossa altrimenti
  const room: GameValue = game.roomsState[game.currentRoomIdx ?? -1];
  const pulse = 0.6 + 0.4 * Math.sin((t || 0) * 3);
  ctx.fillStyle = room?.pin ? `rgba(46,213,115,${pulse})` : `rgba(255,71,87,${pulse})`;
  ctx.beginPath();
  ctx.arc(left + size - 6, top + 6, 2, 0, 6.3);
  ctx.fill();
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
