import type { GameValue } from '../context.js';
import { game } from '../context.js';
import { isoProject, isoScale, mixColor, poly, rnd, setPlane } from './primitives.js';
import { resetPlane } from './objects.js';
export function getEnvStyle(..._args: GameValue[]): GameValue {
  const st: GameValue = game.ENV_STYLE[game.activeEnvironment] || game.ENV_STYLE.SALOON;
  if (game.activeEnvironment === 'PLAYER_ROOM') {
    const idx: GameValue = game.currentRoomIdx || 0;
    const deco: GameValue = JSON.parse(JSON.stringify(st.decor));
    deco.left[1].seed = 5 + idx;
    return Object.assign({}, st, {
      wall: game.ROOM_WALLS[idx % game.ROOM_WALLS.length],
      decor: deco,
    });
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
  const W: GameValue = game.canvas.width,
    H: GameValue = game.canvas.height;
  const [a, b]: GameValue = skyColors(hour);
  const g: GameValue = game.ctx.createLinearGradient(0, 0, 0, H);
  g.addColorStop(0, a);
  g.addColorStop(0.75, b);
  game.ctx.fillStyle = g;
  game.ctx.fillRect(0, 0, W, H);
  const night: GameValue = hour >= 20 || hour < 6;
  if (night) {
    for (let i: GameValue = 0; i < 70; i++) {
      game.ctx.fillStyle = `rgba(255,255,255,${0.4 + 0.6 * Math.abs(Math.sin(t * 0.8 + i))})`;
      game.ctx.fillRect(rnd(i) * W, rnd(i + 50) * H * 0.55, 1.5, 1.5);
    }
    game.ctx.fillStyle = '#f5f3ce';
    game.ctx.beginPath();
    game.ctx.arc(W * 0.8, H * 0.13, 22, 0, 6.3);
    game.ctx.fill();
    game.ctx.fillStyle = skyColors(hour)[0];
    game.ctx.beginPath();
    game.ctx.arc(W * 0.8 + 9, H * 0.13 - 5, 19, 0, 6.3);
    game.ctx.fill();
  } else {
    const sunX: GameValue = W * (0.1 + 0.8 * ((hour - 6) / 14)),
      sunY: GameValue = H * (0.32 - 0.22 * Math.sin((Math.PI * (hour - 6)) / 14));
    const sg: GameValue = game.ctx.createRadialGradient(sunX, sunY, 4, sunX, sunY, 70);
    sg.addColorStop(0, 'rgba(255,250,210,1)');
    sg.addColorStop(0.25, 'rgba(255,230,140,0.8)');
    sg.addColorStop(1, 'rgba(255,230,140,0)');
    game.ctx.fillStyle = sg;
    game.ctx.beginPath();
    game.ctx.arc(sunX, sunY, 70, 0, 6.3);
    game.ctx.fill();
    game.ctx.fillStyle = 'rgba(255,255,255,0.85)';
    for (let i: GameValue = 0; i < 4; i++) {
      const cx: GameValue = ((t * (6 + i * 2) + rnd(i) * W * 1.5) % (W + 240)) - 120,
        cy: GameValue = H * (0.08 + rnd(i + 7) * 0.22);
      [
        [0, 0, 26],
        [24, 6, 20],
        [-22, 7, 18],
        [8, -10, 18],
      ].forEach(([dx, dy, r]: GameValue = {}): GameValue => {
        game.ctx.beginPath();
        game.ctx.arc(cx + dx, cy + dy, r, 0, 6.3);
        game.ctx.fill();
      });
    }
  }
  if (game.activeEnvironment === 'viaggio' && !night) {
    const px: GameValue = ((t * 40) % (W + 300)) - 150,
      py: GameValue = H * 0.12;
    game.ctx.fillStyle = '#ecf0f1';
    game.ctx.beginPath();
    game.ctx.ellipse(px, py, 26, 6, 0, 0, 6.3);
    game.ctx.fill();
    game.ctx.beginPath();
    game.ctx.moveTo(px - 4, py);
    game.ctx.lineTo(px - 14, py + 16);
    game.ctx.lineTo(px + 4, py);
    game.ctx.fill();
    game.ctx.beginPath();
    game.ctx.moveTo(px - 20, py);
    game.ctx.lineTo(px - 26, py - 10);
    game.ctx.lineTo(px - 16, py);
    game.ctx.fill();
    game.ctx.strokeStyle = 'rgba(255,255,255,0.5)';
    game.ctx.lineWidth = 2;
    game.ctx.beginPath();
    game.ctx.moveTo(px - 30, py);
    game.ctx.lineTo(px - 140, py + 2);
    game.ctx.stroke();
  }
}

export function drawFloorPattern(st?: GameValue): GameValue {
  const W: GameValue = game.X1 - game.X0,
    H: GameValue = game.Y1 - game.Y0,
    base: GameValue = st.floorColor;
  setPlane([game.X0, game.Y0, 0], [1, 0, 0], [0, 1, 0]);
  game.ctx.save();
  game.ctx.beginPath();
  game.ctx.rect(0, 0, W, H);
  game.ctx.clip();
  switch (st.floor) {
    case 'parquet': {
      game.ctx.fillStyle = game.darken(base, 0.35);
      game.ctx.fillRect(0, 0, W, H);
      const pw: GameValue = 16;
      for (let row: GameValue = 0; row * pw < H; row++) {
        let u: GameValue = -rnd(row) * 60,
          i: GameValue = 0;
        while (u < W) {
          const len: GameValue = 46 + rnd(row * 31 + i) * 40;
          game.ctx.fillStyle = mixColor(
            base,
            rnd(row * 7 + i) > 0.5 ? '#ffffff' : '#000000',
            rnd(row * 13 + i) * 0.12,
          );
          game.ctx.fillRect(u, row * pw, len - 1, pw - 1);
          game.ctx.strokeStyle = 'rgba(0,0,0,0.07)';
          game.ctx.beginPath();
          game.ctx.moveTo(u + 3, row * pw + pw * 0.4);
          game.ctx.lineTo(u + len - 4, row * pw + pw * 0.45);
          game.ctx.stroke();
          u += len;
          i++;
        }
      }
      break;
    }
    case 'dance': {
      game.ctx.fillStyle = base;
      game.ctx.fillRect(0, 0, W, H);
      game.ctx.strokeStyle = 'rgba(255,255,255,0.08)';
      for (let u: GameValue = 0; u <= W; u += 40) {
        game.ctx.beginPath();
        game.ctx.moveTo(u, 0);
        game.ctx.lineTo(u, H);
        game.ctx.stroke();
      }
      for (let v: GameValue = 0; v <= H; v += 40) {
        game.ctx.beginPath();
        game.ctx.moveTo(0, v);
        game.ctx.lineTo(W, v);
        game.ctx.stroke();
      }
      break;
    }
    case 'checker':
      for (let u: GameValue = 0; u < W; u += 40)
        for (let v: GameValue = 0; v < H; v += 40) {
          game.ctx.fillStyle = ((u + v) / 40) % 2 ? st.floorAlt : base;
          game.ctx.fillRect(u, v, 40, 40);
        }
      break;
    case 'tiles':
    case 'hospital': {
      const sz: GameValue = st.floor === 'tiles' ? 24 : 30;
      game.ctx.fillStyle = game.darken(base, 0.12);
      game.ctx.fillRect(0, 0, W, H);
      for (let u: GameValue = 0, i: GameValue = 0; u < W; u += sz)
        for (let v: GameValue = 0; v < H; v += sz, i++) {
          game.ctx.fillStyle = mixColor(base, '#ffffff', rnd(i) * 0.3);
          game.ctx.fillRect(u + 1, v + 1, sz - 2, sz - 2);
        }
      if (st.floor === 'hospital') {
        game.ctx.fillStyle = '#1abc9c';
        game.ctx.fillRect(0, 196, W, 8);
        game.ctx.fillRect(196, 0, 8, H);
        game.ctx.fillStyle = '#3498db';
        game.ctx.fillRect(0, 210, W, 4);
      }
      break;
    }
    case 'terracotta':
      game.ctx.fillStyle = '#e8d8c3';
      game.ctx.fillRect(0, 0, W, H);
      for (let u: GameValue = 0, i: GameValue = 0; u < W; u += 30)
        for (let v: GameValue = 0; v < H; v += 30, i++) {
          game.ctx.fillStyle = mixColor(base, '#000000', rnd(i) * 0.18);
          game.ctx.fillRect(u + 1.5, v + 1.5, 27, 27);
        }
      break;
    case 'carpet':
      game.ctx.fillStyle = base;
      game.ctx.fillRect(0, 0, W, H);
      game.ctx.strokeStyle = 'rgba(255,255,255,0.06)';
      for (let k: GameValue = -H; k < W; k += 10) {
        game.ctx.beginPath();
        game.ctx.moveTo(k, 0);
        game.ctx.lineTo(k + H, H);
        game.ctx.stroke();
      }
      for (let u: GameValue = 0; u < W; u += 80)
        for (let v: GameValue = 0; v < H; v += 80) {
          game.ctx.strokeStyle = 'rgba(0,0,0,0.12)';
          game.ctx.strokeRect(u, v, 80, 80);
        }
      break;
    case 'concrete': {
      const g: GameValue = game.ctx.createLinearGradient(0, 0, W, H);
      g.addColorStop(0, game.lighten(base, 0.12));
      g.addColorStop(1, game.darken(base, 0.08));
      game.ctx.fillStyle = g;
      game.ctx.fillRect(0, 0, W, H);
      game.ctx.strokeStyle = 'rgba(0,0,0,0.15)';
      for (let u: GameValue = 0; u <= W; u += 80) {
        game.ctx.beginPath();
        game.ctx.moveTo(u, 0);
        game.ctx.lineTo(u, H);
        game.ctx.stroke();
      }
      for (let v: GameValue = 0; v <= H; v += 80) {
        game.ctx.beginPath();
        game.ctx.moveTo(0, v);
        game.ctx.lineTo(W, v);
        game.ctx.stroke();
      }
      break;
    }
    case 'grass': {
      game.ctx.fillStyle = base;
      game.ctx.fillRect(0, 0, W, H);
      for (let i: GameValue = 0; i < 40; i++) {
        game.ctx.fillStyle = `rgba(${rnd(i) > 0.5 ? '255,255,255' : '0,60,0'},0.06)`;
        game.ctx.beginPath();
        game.ctx.arc(rnd(i * 3) * W, rnd(i * 5) * H, 20 + rnd(i) * 30, 0, 6.3);
        game.ctx.fill();
      }
      game.ctx.fillStyle = '#cdbb98';
      game.ctx.fillRect(0, H / 2 - 20, W, 40);
      game.ctx.fillRect(W / 2 - 20, 0, 40, H);
      for (let i: GameValue = 0; i < 160; i++) {
        const onX: GameValue = i % 2 === 0;
        const u: GameValue = onX ? rnd(i) * W : W / 2 - 18 + rnd(i) * 36,
          v: GameValue = onX ? H / 2 - 18 + rnd(i + 3) * 36 : rnd(i + 3) * H;
        game.ctx.fillStyle = mixColor('#b8a586', '#ffffff', rnd(i + 9) * 0.4);
        game.ctx.beginPath();
        game.ctx.ellipse(u, v, 4 + rnd(i) * 3, 3 + rnd(i + 1) * 2, rnd(i) * 3, 0, 6.3);
        game.ctx.fill();
      }
      game.ctx.strokeStyle = 'rgba(30,90,30,0.55)';
      game.ctx.lineWidth = 1;
      for (let i: GameValue = 0; i < 320; i++) {
        const u: GameValue = rnd(i * 7) * W,
          v: GameValue = rnd(i * 11) * H;
        if (Math.abs(v - H / 2) < 22 || Math.abs(u - W / 2) < 22) continue;
        game.ctx.beginPath();
        game.ctx.moveTo(u - 2, v);
        game.ctx.lineTo(u, v - 4);
        game.ctx.lineTo(u + 2, v);
        game.ctx.stroke();
      }
      const fl: GameValue = ['#ff6b81', '#feca57', '#ffffff', '#a29bfe'];
      for (let i: GameValue = 0; i < 50; i++) {
        const u: GameValue = rnd(i * 13) * W,
          v: GameValue = rnd(i * 17) * H;
        if (Math.abs(v - H / 2) < 22 || Math.abs(u - W / 2) < 22) continue;
        game.ctx.fillStyle = fl[i % 4];
        game.ctx.beginPath();
        game.ctx.arc(u, v, 1.6, 0, 6.3);
        game.ctx.fill();
      }
      break;
    }
    case 'beach': {
      game.ctx.fillStyle = base;
      game.ctx.fillRect(0, 0, W, H);
      for (let i: GameValue = 0; i < 300; i++) {
        game.ctx.fillStyle = `rgba(${rnd(i) > 0.5 ? '255,255,255' : '160,120,60'},0.25)`;
        game.ctx.fillRect(rnd(i * 3) * W, rnd(i * 7) * H, 1.5, 1.5);
      }
      const g: GameValue = game.ctx.createLinearGradient(0, 0, 0, 110);
      g.addColorStop(0, '#0b6fa4');
      g.addColorStop(1, '#4fc3e8');
      game.ctx.fillStyle = g;
      game.ctx.fillRect(0, 0, W, 110);
      game.ctx.fillStyle = 'rgba(255,255,255,0.3)';
      game.ctx.fillRect(0, 106, W, 8);
      break;
    }
    case 'dirt': {
      game.ctx.fillStyle = base;
      game.ctx.fillRect(0, 0, W, H);
      for (let i: GameValue = 0; i < 220; i++) {
        game.ctx.fillStyle = mixColor(
          base,
          rnd(i) > 0.5 ? '#ffffff' : '#000000',
          0.15 + rnd(i + 1) * 0.15,
        );
        game.ctx.beginPath();
        game.ctx.ellipse(
          rnd(i * 3) * W,
          rnd(i * 5) * H,
          2 + rnd(i) * 3,
          1.5 + rnd(i + 2) * 2,
          0,
          0,
          6.3,
        );
        game.ctx.fill();
      }
      game.ctx.strokeStyle = 'rgba(0,0,0,0.12)';
      game.ctx.lineWidth = 6;
      game.ctx.beginPath();
      game.ctx.moveTo(0, 250);
      game.ctx.bezierCurveTo(120, 230, 250, 290, W, 260);
      game.ctx.stroke();
      game.ctx.beginPath();
      game.ctx.moveTo(0, 268);
      game.ctx.bezierCurveTo(120, 248, 250, 308, W, 278);
      game.ctx.stroke();
      break;
    }
    default:
      game.ctx.fillStyle = base;
      game.ctx.fillRect(0, 0, W, H);
  }
  if (st.rug) {
    const r: GameValue = st.rug;
    game.ctx.fillStyle = 'rgba(0,0,0,0.25)';
    game.ctx.fillRect(r.u + 3, r.v + 3, r.w, r.h);
    game.ctx.fillStyle = r.color;
    game.ctx.fillRect(r.u, r.v, r.w, r.h);
    game.ctx.strokeStyle = r.border;
    game.ctx.lineWidth = 3;
    game.ctx.strokeRect(r.u + 6, r.v + 6, r.w - 12, r.h - 12);
    game.ctx.lineWidth = 1;
    game.ctx.strokeRect(r.u + 12, r.v + 12, r.w - 24, r.h - 24);
    game.ctx.fillStyle = r.border;
    game.ctx.beginPath();
    game.ctx.moveTo(r.u + r.w / 2, r.v + r.h / 2 - 18);
    game.ctx.lineTo(r.u + r.w / 2 + 26, r.v + r.h / 2);
    game.ctx.lineTo(r.u + r.w / 2, r.v + r.h / 2 + 18);
    game.ctx.lineTo(r.u + r.w / 2 - 26, r.v + r.h / 2);
    game.ctx.closePath();
    game.ctx.globalAlpha = 0.6;
    game.ctx.fill();
    game.ctx.globalAlpha = 1;
    for (let u: GameValue = r.u + 4; u < r.u + r.w; u += 6) {
      game.ctx.fillRect(u, r.v - 4, 1.5, 4);
      game.ctx.fillRect(u, r.v + r.h, 1.5, 4);
    }
  }
  if (!st.outdoor) {
    const g1: GameValue = game.ctx.createLinearGradient(0, 0, 0, 30);
    g1.addColorStop(0, 'rgba(0,0,0,0.35)');
    g1.addColorStop(1, 'rgba(0,0,0,0)');
    game.ctx.fillStyle = g1;
    game.ctx.fillRect(0, 0, W, 30);
    const g2: GameValue = game.ctx.createLinearGradient(0, 0, 30, 0);
    g2.addColorStop(0, 'rgba(0,0,0,0.3)');
    g2.addColorStop(1, 'rgba(0,0,0,0)');
    game.ctx.fillStyle = g2;
    game.ctx.fillRect(0, 0, 30, H);
  }
  game.ctx.restore();
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
  const w: GameValue = d.w || 50,
    h: GameValue = d.h || 50,
    u: GameValue = d.u - w / 2,
    t: GameValue = d.top || Math.max(18, wallH * 0.2);
  game.ctx.fillStyle = '#f5f5f5';
  game.ctx.fillRect(u - 4, t - 4, w + 8, h + 8);
  const [a, b]: GameValue = skyColors(hour);
  const g: GameValue = game.ctx.createLinearGradient(0, t, 0, t + h);
  g.addColorStop(0, a);
  g.addColorStop(1, b);
  game.ctx.fillStyle = g;
  game.ctx.fillRect(u, t, w, h);
  if (hour >= 20 || hour < 6) {
    game.ctx.fillStyle = '#ffffff';
    for (let i: GameValue = 0; i < 6; i++)
      game.ctx.fillRect(u + rnd(i + d.u) * w, t + rnd(i + 9 + d.u) * h * 0.7, 1.2, 1.2);
  } else {
    game.ctx.fillStyle = 'rgba(255,255,255,0.85)';
    game.ctx.beginPath();
    game.ctx.arc(u + w * 0.3, t + h * 0.35, h * 0.12, 0, 6.3);
    game.ctx.arc(u + w * 0.42, t + h * 0.32, h * 0.14, 0, 6.3);
    game.ctx.fill();
  }
  game.ctx.fillStyle = 'rgba(255,255,255,0.18)';
  game.ctx.beginPath();
  game.ctx.moveTo(u, t + h);
  game.ctx.lineTo(u + w * 0.4, t);
  game.ctx.lineTo(u + w * 0.55, t);
  game.ctx.lineTo(u + w * 0.15, t + h);
  game.ctx.fill();
  game.ctx.fillStyle = '#f5f5f5';
  game.ctx.fillRect(u + w / 2 - 1.5, t, 3, h);
  game.ctx.fillRect(u, t + h / 2 - 1.5, w, 3);
  game.ctx.fillStyle = '#e0e0e0';
  game.ctx.fillRect(u - 7, t + h + 3, w + 14, 5);
  if (d.curtains) {
    game.ctx.fillStyle = '#c0392b';
    game.ctx.fillRect(u - 14, t - 8, 14, h + 18);
    game.ctx.fillRect(u + w, t - 8, 14, h + 18);
    game.ctx.fillStyle = 'rgba(0,0,0,0.2)';
    for (let k: GameValue = 0; k < 3; k++) {
      game.ctx.fillRect(u - 12 + k * 4, t - 8, 1.5, h + 18);
      game.ctx.fillRect(u + w + 2 + k * 4, t - 8, 1.5, h + 18);
    }
    game.ctx.fillStyle = '#7f8c8d';
    game.ctx.fillRect(u - 18, t - 10, w + 36, 3);
  }
}

export function wallPainting(d?: GameValue): GameValue {
  const w: GameValue = d.w || 50,
    h: GameValue = d.h || 36,
    u: GameValue = d.u - w / 2,
    t: GameValue = d.top || 26,
    s: GameValue = d.seed || 1;
  game.ctx.fillStyle = 'rgba(0,0,0,0.25)';
  game.ctx.fillRect(u + 3, t + 3, w, h);
  game.ctx.fillStyle = '#b7950b';
  game.ctx.fillRect(u - 3, t - 3, w + 6, h + 6);
  const pal: GameValue = [
    ['#74b9ff', '#0984e3', '#fdcb6e'],
    ['#fab1a0', '#e17055', '#2d3436'],
    ['#55efc4', '#00b894', '#ffeaa7'],
    ['#a29bfe', '#6c5ce7', '#fd79a8'],
  ][s % 4];
  game.ctx.fillStyle = pal[0];
  game.ctx.fillRect(u, t, w, h);
  game.ctx.fillStyle = pal[1];
  game.ctx.beginPath();
  game.ctx.moveTo(u, t + h);
  game.ctx.lineTo(u + w * (0.3 + rnd(s) * 0.3), t + h * (0.35 + rnd(s + 1) * 0.2));
  game.ctx.lineTo(u + w, t + h);
  game.ctx.fill();
  game.ctx.fillStyle = pal[2];
  game.ctx.beginPath();
  game.ctx.arc(u + w * (0.2 + rnd(s + 2) * 0.6), t + h * 0.3, h * 0.12, 0, 6.3);
  game.ctx.fill();
}

export function wallClock(d?: GameValue): GameValue {
  const u: GameValue = d.u,
    t: GameValue = d.top || 30,
    r: GameValue = 11;
  game.ctx.fillStyle = '#2d3436';
  game.ctx.beginPath();
  game.ctx.arc(u, t, r + 2, 0, 6.3);
  game.ctx.fill();
  game.ctx.fillStyle = '#ffffff';
  game.ctx.beginPath();
  game.ctx.arc(u, t, r, 0, 6.3);
  game.ctx.fill();
  const m: GameValue = game.gameMinutes % 60,
    h: GameValue = (game.gameMinutes / 60) % 12;
  game.ctx.strokeStyle = '#2d3436';
  game.ctx.lineWidth = 1.6;
  game.ctx.beginPath();
  game.ctx.moveTo(u, t);
  game.ctx.lineTo(u + Math.sin((h / 12) * 6.283) * 6, t - Math.cos((h / 12) * 6.283) * 6);
  game.ctx.stroke();
  game.ctx.lineWidth = 1;
  game.ctx.beginPath();
  game.ctx.moveTo(u, t);
  game.ctx.lineTo(u + Math.sin((m / 60) * 6.283) * 9, t - Math.cos((m / 60) * 6.283) * 9);
  game.ctx.stroke();
}

export function wallShelf(d?: GameValue): GameValue {
  const w: GameValue = d.w || 70,
    u: GameValue = d.u - w / 2,
    t: GameValue = d.top || 44;
  game.ctx.fillStyle = '#6d4c41';
  game.ctx.fillRect(u, t, w, 4);
  const cols: GameValue = ['#e74c3c', '#3498db', '#f1c40f', '#2ecc71', '#9b59b6', '#e67e22'];
  let x: GameValue = u + 3;
  for (let i: GameValue = 0; x < u + w - 8; i++) {
    const bw: GameValue = 4 + rnd(i + d.u) * 4,
      bh: GameValue = 12 + rnd(i * 2 + d.u) * 8;
    game.ctx.fillStyle = cols[i % cols.length];
    game.ctx.fillRect(x, t - bh, bw, bh);
    x += bw + 1;
  }
}

export function wallCabinets(d?: GameValue): GameValue {
  const w: GameValue = d.w || 100,
    u: GameValue = d.u - w / 2,
    t: GameValue = 8,
    h: GameValue = 34;
  game.ctx.fillStyle = 'rgba(0,0,0,0.2)';
  game.ctx.fillRect(u + 2, t + 2, w, h);
  game.ctx.fillStyle = '#fdfdfd';
  game.ctx.fillRect(u, t, w, h);
  const n: GameValue = Math.round(w / 30);
  for (let i: GameValue = 0; i < n; i++) {
    game.ctx.strokeStyle = 'rgba(0,0,0,0.25)';
    game.ctx.strokeRect(u + (i * w) / n + 2, t + 2, w / n - 4, h - 4);
    game.ctx.fillStyle = '#95a5a6';
    game.ctx.fillRect(u + ((i + 0.5) * w) / n - 4, t + h - 8, 8, 2);
  }
}

export function wallMirror(d?: GameValue): GameValue {
  const w: GameValue = d.w || 50,
    h: GameValue = d.h || 44,
    u: GameValue = d.u - w / 2,
    t: GameValue = d.top || 16;
  game.ctx.fillStyle = '#b2bec3';
  game.ctx.beginPath();
  game.ctx.roundRect
    ? game.ctx.roundRect(u - 3, t - 3, w + 6, h + 6, 10)
    : game.ctx.rect(u - 3, t - 3, w + 6, h + 6);
  game.ctx.fill();
  const g: GameValue = game.ctx.createLinearGradient(u, t, u + w, t + h);
  g.addColorStop(0, '#e3f4fb');
  g.addColorStop(1, '#9fc7d8');
  game.ctx.fillStyle = g;
  game.ctx.beginPath();
  game.ctx.roundRect ? game.ctx.roundRect(u, t, w, h, 8) : game.ctx.rect(u, t, w, h);
  game.ctx.fill();
  game.ctx.strokeStyle = 'rgba(255,255,255,0.7)';
  game.ctx.lineWidth = 2;
  game.ctx.beginPath();
  game.ctx.moveTo(u + 8, t + h - 10);
  game.ctx.lineTo(u + w * 0.45, t + 8);
  game.ctx.stroke();
}

export function wallTowels(d?: GameValue): GameValue {
  const u: GameValue = d.u,
    t: GameValue = d.top || 50;
  game.ctx.fillStyle = '#b2bec3';
  game.ctx.fillRect(u - 22, t, 44, 3);
  game.ctx.fillStyle = '#ff7675';
  game.ctx.fillRect(u - 18, t + 3, 16, 30);
  game.ctx.fillStyle = '#74b9ff';
  game.ctx.fillRect(u + 2, t + 3, 16, 26);
  game.ctx.fillStyle = 'rgba(255,255,255,0.4)';
  game.ctx.fillRect(u - 18, t + 26, 16, 3);
  game.ctx.fillRect(u + 2, t + 22, 16, 3);
}

export function wallNeon(d?: GameValue, t?: GameValue): GameValue {
  const flick: GameValue = Math.sin(t * 13) > 0.97 ? 0.3 : 1;
  game.ctx.save();
  game.ctx.font = 'bold 30px sans-serif';
  game.ctx.textAlign = 'center';
  game.ctx.shadowColor = `rgba(${d.color},${flick})`;
  game.ctx.shadowBlur = 18;
  game.ctx.fillStyle = `rgba(${d.color},${flick})`;
  game.ctx.fillText(d.text, d.u, 50);
  game.ctx.shadowBlur = 0;
  game.ctx.fillStyle = `rgba(255,255,255,${0.6 * flick})`;
  game.ctx.fillText(d.text, d.u, 50);
  game.ctx.restore();
}

export function wallBottles(d?: GameValue): GameValue {
  const w: GameValue = d.w || 90,
    u: GameValue = d.u - w / 2;
  const cols: GameValue = ['#27ae60', '#c0392b', '#f39c12', '#8e44ad', '#16a085', '#d35400'];
  [30, 58].forEach((t?: GameValue, r?: GameValue): GameValue => {
    game.ctx.fillStyle = '#3e2723';
    game.ctx.fillRect(u, t, w, 4);
    for (let i: GameValue = 0; i < w / 9 - 1; i++) {
      const c: GameValue = cols[(i + r * 2) % cols.length],
        x: GameValue = u + 4 + i * 9;
      game.ctx.fillStyle = c;
      game.ctx.globalAlpha = 0.85;
      game.ctx.fillRect(x, t - 16, 6, 16);
      game.ctx.fillRect(x + 2, t - 21, 2, 5);
      game.ctx.globalAlpha = 1;
    }
  });
}

export function wallPoster(d?: GameValue): GameValue {
  const w: GameValue = d.w || 70,
    h: GameValue = 34,
    u: GameValue = d.u - w / 2,
    t: GameValue = d.top || 22;
  game.ctx.fillStyle = d.color || '#e74c3c';
  game.ctx.fillRect(u, t, w, h);
  game.ctx.fillStyle = '#ffffff';
  game.ctx.font = 'bold 9px sans-serif';
  game.ctx.textAlign = 'center';
  game.ctx.fillText(d.text || '', d.u, t + h / 2 + 3, w - 6);
}

export function wallLogo(d?: GameValue): GameValue {
  game.ctx.fillStyle = d.color || '#d35400';
  game.ctx.font = 'bold 18px sans-serif';
  game.ctx.textAlign = 'center';
  game.ctx.fillText(d.text, d.u, 44);
  game.ctx.fillStyle = '#2d3436';
  game.ctx.font = '9px sans-serif';
  game.ctx.fillText(d.sub || 'arredamento dal 1998', d.u, 58);
}

export function wallCross(d?: GameValue): GameValue {
  const u: GameValue = d.u,
    t: GameValue = 26;
  game.ctx.fillStyle = '#ffffff';
  game.ctx.fillRect(u - 22, t - 6, 44, 44);
  game.ctx.fillStyle = '#e74c3c';
  game.ctx.fillRect(u - 5, t, 10, 32);
  game.ctx.fillRect(u - 16, t + 11, 32, 10);
}

export function wallMenu(d?: GameValue): GameValue {
  const u: GameValue = d.u - 40,
    t: GameValue = 16;
  game.ctx.fillStyle = '#7b4a2e';
  game.ctx.fillRect(u - 4, t - 4, 88, 60);
  game.ctx.fillStyle = '#2d3436';
  game.ctx.fillRect(u, t, 80, 52);
  game.ctx.fillStyle = '#ffffff';
  game.ctx.font = 'bold 9px sans-serif';
  game.ctx.textAlign = 'center';
  game.ctx.fillText('MENU DEL GIORNO', d.u, t + 12);
  game.ctx.font = '7px sans-serif';
  ['Pasta al pomodoro  9€', 'Pizza margherita  8€', 'Tiramisù  5€'].forEach(
    (s?: GameValue, i?: GameValue): GameValue => game.ctx.fillText(s, d.u, t + 25 + i * 10),
  );
}

export function wallWhiteboard(d?: GameValue): GameValue {
  const u: GameValue = d.u - 45,
    t: GameValue = 18;
  game.ctx.fillStyle = '#b2bec3';
  game.ctx.fillRect(u - 3, t - 3, 96, 56);
  game.ctx.fillStyle = '#ffffff';
  game.ctx.fillRect(u, t, 90, 50);
  game.ctx.strokeStyle = '#0984e3';
  game.ctx.lineWidth = 2;
  game.ctx.beginPath();
  game.ctx.moveTo(u + 8, t + 40);
  game.ctx.lineTo(u + 30, t + 28);
  game.ctx.lineTo(u + 50, t + 33);
  game.ctx.lineTo(u + 80, t + 12);
  game.ctx.stroke();
  game.ctx.fillStyle = '#d63031';
  game.ctx.font = 'bold 7px sans-serif';
  game.ctx.textAlign = 'left';
  game.ctx.fillText('OBIETTIVI Q4 📈', u + 6, t + 10);
}

export function paintWallSurface(
  st?: GameValue,
  W?: GameValue,
  H?: GameValue,
  side?: GameValue,
): GameValue {
  const c: GameValue = st.wall;
  game.ctx.fillStyle = c;
  game.ctx.fillRect(0, 0, W, H);
  switch (st.wallStyle) {
    case 'stripes':
      game.ctx.fillStyle = game.lighten(c, 0.12);
      for (let u: GameValue = 0; u < W; u += 24) game.ctx.fillRect(u, 0, 10, H);
      break;
    case 'wainscot': {
      const top: GameValue = H - 46;
      game.ctx.fillStyle = game.lighten(st.trim, 0.25);
      game.ctx.fillRect(0, top, W, 46);
      game.ctx.strokeStyle = 'rgba(0,0,0,0.25)';
      for (let u: GameValue = 6; u < W - 30; u += 40) game.ctx.strokeRect(u, top + 8, 32, 28);
      game.ctx.fillStyle = st.trim;
      game.ctx.fillRect(0, top - 3, W, 4);
      break;
    }
    case 'tilesLow': {
      const top: GameValue = H * 0.45;
      game.ctx.fillStyle = '#ffffff';
      game.ctx.fillRect(0, top, W, H - top);
      game.ctx.strokeStyle = 'rgba(0,0,0,0.1)';
      for (let u: GameValue = 0; u < W; u += 14) {
        game.ctx.beginPath();
        game.ctx.moveTo(u, top);
        game.ctx.lineTo(u, H);
        game.ctx.stroke();
      }
      for (let v: GameValue = top; v < H; v += 14) {
        game.ctx.beginPath();
        game.ctx.moveTo(0, v);
        game.ctx.lineTo(W, v);
        game.ctx.stroke();
      }
      game.ctx.fillStyle = '#e17055';
      game.ctx.fillRect(0, top - 3, W, 3);
      break;
    }
    case 'tilesFull':
      for (let u: GameValue = 0, i: GameValue = 0; u < W; u += 16)
        for (let v: GameValue = 0; v < H; v += 16, i++) {
          game.ctx.fillStyle = mixColor(c, '#ffffff', 0.1 + rnd(i) * 0.2);
          game.ctx.fillRect(u + 0.8, v + 0.8, 14.4, 14.4);
        }
      game.ctx.fillStyle = game.darken(c, 0.25);
      game.ctx.fillRect(0, H * 0.55, W, 4);
      break;
    case 'bricks':
      game.ctx.fillStyle = game.darken(c, 0.35);
      game.ctx.fillRect(0, 0, W, H);
      for (let v: GameValue = 0, r: GameValue = 0; v < H; v += 10, r++)
        for (let u: GameValue = (r % 2) * -12, i: GameValue = 0; u < W; u += 24, i++) {
          game.ctx.fillStyle = mixColor(c, '#000000', rnd(r * 40 + i) * 0.25);
          game.ctx.fillRect(u + 1, v + 1, 22, 8);
        }
      break;
    case 'bandGreen':
      game.ctx.fillStyle = '#d1f2eb';
      game.ctx.fillRect(0, H - 50, W, 50);
      game.ctx.fillStyle = '#16a085';
      game.ctx.fillRect(0, H - 54, W, 5);
      break;
    case 'hoarding':
      game.ctx.fillStyle = c;
      game.ctx.fillRect(0, 0, W, H);
      game.ctx.strokeStyle = 'rgba(0,0,0,0.15)';
      for (let u: GameValue = 0; u < W; u += 40) {
        game.ctx.beginPath();
        game.ctx.moveTo(u, 0);
        game.ctx.lineTo(u, H);
        game.ctx.stroke();
      }
      for (let u: GameValue = -20; u < W; u += 20) {
        game.ctx.fillStyle = '#f1c40f';
        game.ctx.beginPath();
        game.ctx.moveTo(u, H - 12);
        game.ctx.lineTo(u + 10, H - 12);
        game.ctx.lineTo(u + 20, H);
        game.ctx.lineTo(u + 10, H);
        game.ctx.fill();
      }
      game.ctx.fillStyle = '#2d3436';
      game.ctx.fillRect(0, H - 14, W, 2);
      break;
  }
  game.ctx.fillStyle = st.trim;
  game.ctx.fillRect(0, H - 7, W, 7);
  game.ctx.fillStyle = game.lighten(c, 0.2);
  game.ctx.fillRect(0, 0, W, 3);
  const ao: GameValue = game.ctx.createLinearGradient(0, H - 22, 0, H);
  ao.addColorStop(0, 'rgba(0,0,0,0)');
  ao.addColorStop(1, 'rgba(0,0,0,0.22)');
  game.ctx.fillStyle = ao;
  game.ctx.fillRect(0, H - 22, W, 22);
  const cornerU: GameValue = side === 'back' ? 0 : W;
  const cg: GameValue = game.ctx.createLinearGradient(cornerU, 0, side === 'back' ? 26 : W - 26, 0);
  cg.addColorStop(0, 'rgba(0,0,0,0.25)');
  cg.addColorStop(1, 'rgba(0,0,0,0)');
  game.ctx.fillStyle = cg;
  game.ctx.fillRect(side === 'back' ? 0 : W - 26, 0, 26, H);
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
      game.ctx.fillStyle = 'rgba(0,0,0,0.1)';
      game.ctx.fillRect(0, 0, W, H);
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
  const key: GameValue = [
    game.activeEnvironment,
    game.currentRoomIdx,
    game.canvas.width,
    game.canvas.height,
    Math.floor(hour),
  ].join('|');
  if (game.bgCache.key !== key) {
    const off: GameValue = game.bgCache.canvas || document.createElement('canvas');
    off.width = game.canvas.width;
    off.height = game.canvas.height;
    const mainCtx: GameValue = game.ctx;
    game.ctx = off.getContext('2d');
    try {
      game.ctx.clearRect(0, 0, off.width, off.height);
      drawFloorPattern(st);
      if (!st.outdoor || st.fence) drawWalls(st, hour);
    } finally {
      game.ctx = mainCtx;
    }
    game.bgCache = { key, canvas: off };
  }
  game.ctx.drawImage(game.bgCache.canvas, 0, 0);
}

export function drawDynamicFloor(st?: GameValue, t?: GameValue): GameValue {
  if (st.floor === 'dance') {
    setPlane([game.X0, game.Y0, 0], [1, 0, 0], [0, 1, 0]);
    for (let u: GameValue = 0, i: GameValue = 0; u < 400; u += 40)
      for (let v: GameValue = 0; v < 360; v += 40, i++) {
        const a: GameValue = 0.28 + 0.3 * Math.sin(t * 4 + i * 1.7);
        game.ctx.fillStyle = `hsla(${(u * 0.5 + v * 0.7 + t * 90) % 360},95%,55%,${a})`;
        game.ctx.fillRect(u + 1, v + 1, 38, 38);
      }
    resetPlane();
    return;
  }
  if (st.floor !== 'beach') return;
  setPlane([game.X0, game.Y0, 0], [1, 0, 0], [0, 1, 0]);
  game.ctx.strokeStyle = 'rgba(255,255,255,0.35)';
  game.ctx.lineWidth = 1.5;
  for (let r: GameValue = 0; r < 4; r++) {
    const v: GameValue = 18 + r * 24;
    game.ctx.beginPath();
    for (let u: GameValue = 0; u <= 400; u += 8) {
      const vv: GameValue = v + Math.sin(u * 0.05 + t * 1.5 + r) * 3;
      u === 0 ? game.ctx.moveTo(u, vv) : game.ctx.lineTo(u, vv);
    }
    game.ctx.stroke();
  }
  const shore: GameValue = 108 + Math.sin(t * 1.1) * 5;
  game.ctx.fillStyle = 'rgba(255,255,255,0.55)';
  game.ctx.beginPath();
  game.ctx.moveTo(0, shore);
  for (let u: GameValue = 0; u <= 400; u += 10)
    game.ctx.lineTo(u, shore + Math.sin(u * 0.08 + t * 2) * 2.5);
  game.ctx.lineTo(400, shore - 6);
  game.ctx.lineTo(0, shore - 6);
  game.ctx.fill();
  game.ctx.fillStyle = 'rgba(255,255,255,0.6)';
  for (let i: GameValue = 0; i < 12; i++) {
    const ph: GameValue = (t * 0.7 + rnd(i)) % 1;
    if (ph < 0.5) game.ctx.fillRect(rnd(i * 3) * 400, rnd(i * 5) * 100, 3 * (0.5 - ph) * 2, 1);
  }
  resetPlane();
}

export function applyLighting(dark?: GameValue, lights?: GameValue, _st?: GameValue): GameValue {
  const W: GameValue = game.canvas.width,
    H: GameValue = game.canvas.height;
  const vg: GameValue = game.ctx.createRadialGradient(
    W / 2,
    H / 2,
    Math.min(W, H) * 0.3,
    W / 2,
    H / 2,
    Math.max(W, H) * 0.75,
  );
  vg.addColorStop(0, 'rgba(0,0,0,0)');
  vg.addColorStop(1, 'rgba(0,0,0,0.4)');
  game.ctx.fillStyle = vg;
  game.ctx.fillRect(0, 0, W, H);
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
  game.ctx.drawImage(game.lightCanvas, 0, 0);
  game.ctx.globalCompositeOperation = 'lighter';
  lights.forEach((li?: GameValue): GameValue => {
    const p: GameValue = isoProject(li.x, li.y, (li.z || 0) * 0.5),
      r: GameValue = (li.r || 120) * s * 0.7;
    const g: GameValue = game.ctx.createRadialGradient(p.x, p.y, 0, p.x, p.y, r);
    g.addColorStop(0, `rgba(${li.color || '255,210,150'},${(0.22 * dark) / 0.5})`);
    g.addColorStop(1, `rgba(${li.color || '255,210,150'},0)`);
    game.ctx.fillStyle = g;
    game.ctx.beginPath();
    game.ctx.arc(p.x, p.y, r, 0, Math.PI * 2);
    game.ctx.fill();
  });
  game.ctx.globalCompositeOperation = 'source-over';
}

export function drawLabel(
  label?: GameValue,
  x?: GameValue,
  y?: GameValue,
  _w?: GameValue,
  _h?: GameValue,
  zHeight?: GameValue,
): GameValue {
  const dist: GameValue = Math.hypot(game.playerPos.x - x, game.playerPos.y - y);
  const a: GameValue = Math.max(0, Math.min(1, (125 - dist) / 45)); // solo gli oggetti vicini, per non affollare lo schermo
  if (a <= 0.02) return;
  const p: GameValue = isoProject(x, y, zHeight);
  game.ctx.globalAlpha = a;
  game.ctx.font = 'bold 11px sans-serif';
  game.ctx.textAlign = 'center';
  const tw: GameValue = game.ctx.measureText(label).width + 14;
  game.ctx.fillStyle = 'rgba(15,15,28,0.78)';
  game.ctx.beginPath();
  game.ctx.roundRect
    ? game.ctx.roundRect(p.x - tw / 2, p.y - 30, tw, 18, 9)
    : game.ctx.rect(p.x - tw / 2, p.y - 30, tw, 18);
  game.ctx.fill();
  game.ctx.fillStyle = '#ffffff';
  game.ctx.fillText(label, p.x, p.y - 17);
  game.ctx.globalAlpha = 1;
}

export function nameHash(str?: GameValue): GameValue {
  let h: GameValue = 7;
  for (const ch of String(str || '')) h = (h * 31 + ch.charCodeAt(0)) | 0;
  return Math.abs(h);
}
