import type { GameValue } from '../context.js';
import { game } from '../context.js';
import { lifetime, dom } from '../runtime.js';
import { bodyFromName, currentBody, drawAvatarPreview, resolveLook } from '../character.js';
import { sfx } from '../audio.js';
import { saveGame } from '../saves.js';
import { toast } from '../missions.js';
import { isoProject, isoScale, rnd } from './primitives.js';
import { box, onFace } from './objects.js';
import { nameHash } from './scenes.js';
export function heartPath(cx?: GameValue, cy?: GameValue, r?: GameValue): GameValue {
  game.view.ctx.beginPath();
  game.view.ctx.moveTo(cx, cy + r * 0.9);
  game.view.ctx.bezierCurveTo(
    cx - r * 1.5,
    cy - r * 0.2,
    cx - r * 0.6,
    cy - r * 1.3,
    cx,
    cy - r * 0.35,
  );
  game.view.ctx.bezierCurveTo(
    cx + r * 0.6,
    cy - r * 1.3,
    cx + r * 1.5,
    cy - r * 0.2,
    cx,
    cy + r * 0.9,
  );
  game.view.ctx.closePath();
}

export function drawGlasses(head?: GameValue, s?: GameValue, gl?: GameValue): GameValue {
  if (!gl) return;
  if (gl.style === 'round') {
    game.view.ctx.strokeStyle = gl.color;
    game.view.ctx.lineWidth = 1.1 * s;
    [-3.4, 3.4].forEach((dx?: GameValue): GameValue => {
      game.view.ctx.beginPath();
      game.view.ctx.arc(head.x + dx * s, head.y + 1 * s, 2.8 * s, 0, 6.3);
      game.view.ctx.stroke();
    });
    game.view.ctx.fillStyle = 'rgba(200,230,255,0.25)';
    [-3.4, 3.4].forEach((dx?: GameValue): GameValue => {
      game.view.ctx.beginPath();
      game.view.ctx.arc(head.x + dx * s, head.y + 1 * s, 2.4 * s, 0, 6.3);
      game.view.ctx.fill();
    });
    game.view.ctx.beginPath();
    game.view.ctx.moveTo(head.x - 0.7 * s, head.y + 0.7 * s);
    game.view.ctx.lineTo(head.x + 0.7 * s, head.y + 0.7 * s);
    game.view.ctx.stroke();
  } else if (gl.style === 'heart') {
    game.view.ctx.fillStyle = gl.color;
    [-3.5, 3.5].forEach((dx?: GameValue): GameValue => {
      heartPath(head.x + dx * s, head.y + 1.2 * s, 3 * s);
      game.view.ctx.fill();
    });
    game.view.ctx.fillStyle = 'rgba(255,255,255,0.55)';
    [-4.4, 2.6].forEach((dx?: GameValue): GameValue => {
      game.view.ctx.beginPath();
      game.view.ctx.arc(head.x + dx * s, head.y + 0.2 * s, 0.7 * s, 0, 6.3);
      game.view.ctx.fill();
    });
  } else {
    game.view.ctx.fillStyle = gl.color || '#111';
    game.view.ctx.fillRect(head.x - 7.5 * s, head.y - 0.5 * s, 15 * s, 1.4 * s);
    game.view.ctx.fillRect(head.x - 6.5 * s, head.y - 0.5 * s, 5 * s, 3.4 * s);
    game.view.ctx.fillRect(head.x + 1.5 * s, head.y - 0.5 * s, 5 * s, 3.4 * s);
    game.view.ctx.fillStyle = 'rgba(120,200,255,0.55)';
    game.view.ctx.fillRect(head.x - 6 * s, head.y, 2 * s, 1.2 * s);
    game.view.ctx.fillRect(head.x + 2 * s, head.y, 2 * s, 1.2 * s);
  }
}

export function drawHat(head?: GameValue, s?: GameValue, hat?: GameValue): GameValue {
  if (!hat) return;
  const c: GameValue = hat.color;
  switch (hat.style) {
    case 'beanie':
      game.view.ctx.fillStyle = c;
      game.view.ctx.beginPath();
      game.view.ctx.arc(head.x, head.y - 2.5 * s, 9.9 * s, Math.PI, Math.PI * 2);
      game.view.ctx.fill();
      game.view.ctx.strokeStyle = game.darken(c, 0.25);
      game.view.ctx.lineWidth = 0.8 * s;
      for (let i: GameValue = -3; i <= 3; i++) {
        game.view.ctx.beginPath();
        game.view.ctx.moveTo(head.x + i * 2.4 * s, head.y - 4 * s);
        game.view.ctx.lineTo(head.x + i * 1.6 * s, head.y - 11 * s);
        game.view.ctx.stroke();
      }
      game.view.ctx.fillStyle = game.darken(c, 0.2);
      game.view.ctx.fillRect(head.x - 9.9 * s, head.y - 5 * s, 19.8 * s, 3.8 * s);
      game.view.ctx.fillStyle = '#ffffff';
      game.view.ctx.beginPath();
      game.view.ctx.arc(head.x, head.y - 13 * s, 2.7 * s, 0, 6.3);
      game.view.ctx.fill();
      break;
    case 'cowboy':
      game.view.ctx.fillStyle = game.darken(c, 0.15);
      game.view.ctx.beginPath();
      game.view.ctx.ellipse(head.x, head.y - 5 * s, 15.5 * s, 4.3 * s, 0, 0, 6.3);
      game.view.ctx.fill();
      game.view.ctx.fillStyle = c;
      game.view.ctx.beginPath();
      game.view.ctx.moveTo(head.x - 7.5 * s, head.y - 6 * s);
      game.view.ctx.quadraticCurveTo(
        head.x - 8 * s,
        head.y - 17 * s,
        head.x - 2 * s,
        head.y - 15 * s,
      );
      game.view.ctx.lineTo(head.x, head.y - 13 * s);
      game.view.ctx.lineTo(head.x + 2 * s, head.y - 15 * s);
      game.view.ctx.quadraticCurveTo(
        head.x + 8 * s,
        head.y - 17 * s,
        head.x + 7.5 * s,
        head.y - 6 * s,
      );
      game.view.ctx.closePath();
      game.view.ctx.fill();
      game.view.ctx.fillStyle = '#3e2723';
      game.view.ctx.fillRect(head.x - 7.5 * s, head.y - 8.5 * s, 15 * s, 2.2 * s);
      break;
    case 'tophat':
      game.view.ctx.fillStyle = '#111111';
      game.view.ctx.beginPath();
      game.view.ctx.ellipse(head.x, head.y - 6 * s, 12.5 * s, 3.2 * s, 0, 0, 6.3);
      game.view.ctx.fill();
      game.view.ctx.fillRect(head.x - 7 * s, head.y - 26 * s, 14 * s, 20 * s);
      game.view.ctx.beginPath();
      game.view.ctx.ellipse(head.x, head.y - 26 * s, 7 * s, 2 * s, 0, 0, 6.3);
      game.view.ctx.fillStyle = '#2d2d2d';
      game.view.ctx.fill();
      game.view.ctx.fillStyle = hat.color2 || '#c0392b';
      game.view.ctx.fillRect(head.x - 7 * s, head.y - 11 * s, 14 * s, 3 * s);
      game.view.ctx.fillStyle = 'rgba(255,255,255,0.14)';
      game.view.ctx.fillRect(head.x - 5 * s, head.y - 25 * s, 2 * s, 13 * s);
      break;
    case 'crown':
      game.view.ctx.fillStyle = '#f1c40f';
      game.view.ctx.strokeStyle = '#b7950b';
      game.view.ctx.lineWidth = 1;
      game.view.ctx.beginPath();
      game.view.ctx.moveTo(head.x - 8 * s, head.y - 7 * s);
      game.view.ctx.lineTo(head.x - 8 * s, head.y - 16 * s);
      game.view.ctx.lineTo(head.x - 4 * s, head.y - 11 * s);
      game.view.ctx.lineTo(head.x, head.y - 18 * s);
      game.view.ctx.lineTo(head.x + 4 * s, head.y - 11 * s);
      game.view.ctx.lineTo(head.x + 8 * s, head.y - 16 * s);
      game.view.ctx.lineTo(head.x + 8 * s, head.y - 7 * s);
      game.view.ctx.closePath();
      game.view.ctx.fill();
      game.view.ctx.stroke();
      game.view.ctx.fillStyle = '#e74c3c';
      game.view.ctx.beginPath();
      game.view.ctx.arc(head.x, head.y - 10 * s, 1.5 * s, 0, 6.3);
      game.view.ctx.fill();
      break;
    default: // cappellino da baseball
      game.view.ctx.fillStyle = c;
      game.view.ctx.beginPath();
      game.view.ctx.arc(head.x, head.y - 3 * s, 9.6 * s, Math.PI, Math.PI * 2);
      game.view.ctx.fill();
      game.view.ctx.fillStyle = game.darken(c, 0.2);
      game.view.ctx.beginPath();
      game.view.ctx.ellipse(head.x + 7 * s, head.y - 3 * s, 7 * s, 2 * s, 0.15, 0, 6.3);
      game.view.ctx.fill();
      game.view.ctx.fillStyle = '#ffffff';
      game.view.ctx.beginPath();
      game.view.ctx.arc(head.x, head.y - 12.4 * s, 1.4 * s, 0, 6.3);
      game.view.ctx.fill();
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
  const hx: GameValue = head.x,
    hy: GameValue = head.y;
  game.view.ctx.fillStyle = hair;
  game.view.ctx.strokeStyle = 'rgba(0,0,0,0.28)';
  game.view.ctx.lineWidth = 0.8;
  if (style === 2) {
    // lunghi
    game.view.ctx.beginPath();
    game.view.ctx.moveTo(hx - 9.8 * s, hy - 2 * s);
    game.view.ctx.lineTo(hx - 11 * s, hy + 14 * s);
    game.view.ctx.quadraticCurveTo(hx, hy + 19 * s, hx + 11 * s, hy + 14 * s);
    game.view.ctx.lineTo(hx + 9.8 * s, hy - 2 * s);
    game.view.ctx.closePath();
    game.view.ctx.fill();
    game.view.ctx.stroke();
    game.view.ctx.strokeStyle = game.darken(hair, 0.25);
    game.view.ctx.lineWidth = 0.8 * s;
    [-5, 0, 5].forEach((dx?: GameValue): GameValue => {
      game.view.ctx.beginPath();
      game.view.ctx.moveTo(hx + dx * s, hy + 6 * s);
      game.view.ctx.lineTo(hx + dx * 1.15 * s, hy + 16 * s);
      game.view.ctx.stroke();
    });
  } else if (style === 6) {
    // caschetto
    game.view.ctx.beginPath();
    game.view.ctx.moveTo(hx - 10 * s, hy - 3 * s);
    game.view.ctx.lineTo(hx - 10.6 * s, hy + 7 * s);
    game.view.ctx.quadraticCurveTo(hx, hy + 11.5 * s, hx + 10.6 * s, hy + 7 * s);
    game.view.ctx.lineTo(hx + 10 * s, hy - 3 * s);
    game.view.ctx.closePath();
    game.view.ctx.fill();
    game.view.ctx.stroke();
  } else if (style === 3) {
    // coda di cavallo
    game.view.ctx.beginPath();
    game.view.ctx.moveTo(hx + 7 * s, hy - 3.5 * s);
    game.view.ctx.bezierCurveTo(
      hx + 17 * s,
      hy - 3 * s,
      hx + 20 * s,
      hy + 8 * s,
      hx + 13 * s,
      hy + 16 * s,
    );
    game.view.ctx.bezierCurveTo(
      hx + 14.5 * s,
      hy + 8 * s,
      hx + 10 * s,
      hy + 3 * s,
      hx + 6 * s,
      hy + 2 * s,
    );
    game.view.ctx.closePath();
    game.view.ctx.fill();
    game.view.ctx.stroke();
    game.view.ctx.fillStyle = '#e74c3c';
    game.view.ctx.beginPath();
    game.view.ctx.arc(hx + 9.2 * s, hy - 1.4 * s, 1.5 * s, 0, 6.3);
    game.view.ctx.fill();
  } else if (style === 4) {
    // afro
    for (let i: GameValue = 0; i < 10; i++) {
      const a: GameValue = (i / 10) * Math.PI * 2;
      game.view.ctx.beginPath();
      game.view.ctx.arc(
        hx + Math.cos(a) * 9.6 * s,
        hy - 2 * s + Math.sin(a) * 9.6 * s,
        5.2 * s,
        0,
        6.3,
      );
      game.view.ctx.fill();
      game.view.ctx.stroke();
    }
    game.view.ctx.beginPath();
    game.view.ctx.arc(hx, hy - 2 * s, 11 * s, 0, 6.3);
    game.view.ctx.fill();
  } else if (style === 7) {
    // chignon
    game.view.ctx.beginPath();
    game.view.ctx.arc(hx, hy - 12 * s, 4.8 * s, 0, 6.3);
    game.view.ctx.fill();
    game.view.ctx.stroke();
  }
}

export function drawHairFront(
  head?: GameValue,
  s?: GameValue,
  style?: GameValue,
  hair?: GameValue,
): GameValue {
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
    game.view.ctx.fillStyle = hair;
    [-1, 1].forEach((sg?: GameValue): GameValue => {
      game.view.ctx.beginPath();
      game.view.ctx.roundRect
        ? game.view.ctx.roundRect(hx + sg * 8.3 * s - 1.6 * s, hy - 3 * s, 3.2 * s, 12 * s, 1.6 * s)
        : game.view.ctx.rect(hx + sg * 8.3 * s - 1.6 * s, hy - 3 * s, 3.2 * s, 12 * s);
      game.view.ctx.fill();
    });
  } else if (style === 3) cap(5);
  else if (style === 4) cap(7.5);
  else if (style === 5) {
    // cresta
    cap(6, 0.3);
    game.view.ctx.fillStyle = hair;
    game.view.ctx.strokeStyle = 'rgba(0,0,0,0.3)';
    game.view.ctx.lineWidth = 0.8;
    game.view.ctx.beginPath();
    game.view.ctx.moveTo(hx - 4 * s, hy - 7.5 * s);
    game.view.ctx.lineTo(hx - 5.2 * s, hy - 16 * s);
    game.view.ctx.lineTo(hx - 1.6 * s, hy - 11 * s);
    game.view.ctx.lineTo(hx, hy - 19.5 * s);
    game.view.ctx.lineTo(hx + 1.8 * s, hy - 11 * s);
    game.view.ctx.lineTo(hx + 5.2 * s, hy - 16 * s);
    game.view.ctx.lineTo(hx + 4 * s, hy - 7.5 * s);
    game.view.ctx.closePath();
    game.view.ctx.fill();
    game.view.ctx.stroke();
  } else if (style === 6) cap(3.8);
  else if (style === 7) cap(5.5);
  else if (style === 8) {
    // ciuffo
    cap(5.5);
    game.view.ctx.fillStyle = hair;
    game.view.ctx.strokeStyle = 'rgba(0,0,0,0.25)';
    game.view.ctx.lineWidth = 0.8;
    game.view.ctx.beginPath();
    game.view.ctx.ellipse(hx + 2.5 * s, hy - 10 * s, 7.5 * s, 4 * s, -0.3, 0, 6.3);
    game.view.ctx.fill();
    game.view.ctx.stroke();
  }
}

export function drawFace(
  head?: GameValue,
  s?: GameValue,
  bd?: GameValue,
  hair?: GameValue,
  animTime?: GameValue,
  hsh?: GameValue,
): GameValue {
  const hx: GameValue = head.x,
    hy: GameValue = head.y,
    ey: GameValue = hy + 1 * s;
  const eyeC: GameValue = game.BODY_PARTS.eyeColor.opts[bd.eyeColor].c;
  const blink: GameValue = (animTime + (hsh % 5)) % 4 < 0.13;
  const beardOn: GameValue = bd.beard >= 3;
  // barba (sotto bocca e occhi)
  if (bd.beard >= 3) {
    game.view.ctx.fillStyle = hair;
    game.view.ctx.globalAlpha = bd.beard === 3 ? 0.4 : 1;
    game.view.ctx.beginPath();
    game.view.ctx.arc(hx, hy, 9.1 * s, Math.PI * 0.08, Math.PI * 0.92);
    game.view.ctx.quadraticCurveTo(hx, hy + 4.2 * s, hx + 8.8 * s, hy + 2.3 * s);
    game.view.ctx.fill();
    game.view.ctx.globalAlpha = 1;
  }
  if (bd.beard === 2) {
    game.view.ctx.fillStyle = hair;
    game.view.ctx.beginPath();
    game.view.ctx.ellipse(hx, hy + 7 * s, 1.9 * s, 2.3 * s, 0, 0, 6.3);
    game.view.ctx.fill();
  }
  // sopracciglia
  game.view.ctx.strokeStyle = game.darken(hair, 0.3);
  game.view.ctx.lineWidth = 1 * s;
  game.view.ctx.lineCap = 'round';
  [-1, 1].forEach((sg?: GameValue): GameValue => {
    const ex: GameValue = hx + sg * 3.2 * s,
      lift: GameValue = bd.eyeShape === 3 ? 0.9 : 0.2;
    game.view.ctx.beginPath();
    game.view.ctx.moveTo(ex - sg * 1.8 * s, ey - (2.9 + lift) * s);
    game.view.ctx.lineTo(ex + sg * 1.8 * s, ey - 3.1 * s);
    game.view.ctx.stroke();
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
      game.view.ctx.strokeStyle = '#2d3436';
      game.view.ctx.lineWidth = 1;
      game.view.ctx.beginPath();
      game.view.ctx.moveTo(ex - 1.6 * s, ey);
      game.view.ctx.lineTo(ex + 1.6 * s, ey);
      game.view.ctx.stroke();
      return;
    }
    game.view.ctx.fillStyle = '#ffffff';
    game.view.ctx.strokeStyle = 'rgba(0,0,0,0.5)';
    game.view.ctx.lineWidth = 0.7;
    game.view.ctx.beginPath();
    game.view.ctx.ellipse(ex, ey, shape[0] * s, shape[1] * s, 0, 0, 6.3);
    game.view.ctx.fill();
    game.view.ctx.stroke();
    game.view.ctx.fillStyle = eyeC;
    game.view.ctx.beginPath();
    game.view.ctx.arc(ex, ey + 0.1 * s, Math.min(shape[2], shape[1]) * s, 0, 6.3);
    game.view.ctx.fill();
    game.view.ctx.fillStyle = '#111';
    game.view.ctx.beginPath();
    game.view.ctx.arc(ex, ey + 0.1 * s, shape[2] * 0.5 * s, 0, 6.3);
    game.view.ctx.fill();
    game.view.ctx.fillStyle = 'rgba(255,255,255,0.95)';
    game.view.ctx.beginPath();
    game.view.ctx.arc(ex + 0.5 * s, ey - 0.5 * s, 0.4 * s, 0, 6.3);
    game.view.ctx.fill();
    if (bd.eyeShape === 2) {
      game.view.ctx.strokeStyle = '#2d3436';
      game.view.ctx.lineWidth = 1.1;
      game.view.ctx.beginPath();
      game.view.ctx.ellipse(ex, ey, shape[0] * s, shape[1] * s, 0, Math.PI, Math.PI * 2);
      game.view.ctx.stroke();
    }
    if (bd.eyeShape === 3) {
      game.view.ctx.strokeStyle = '#2d3436';
      game.view.ctx.lineWidth = 1.1;
      game.view.ctx.beginPath();
      game.view.ctx.moveTo(ex + sg * shape[0] * s, ey);
      game.view.ctx.lineTo(ex + sg * (shape[0] + 1.4) * s, ey - 1 * s);
      game.view.ctx.stroke();
    }
  });
  // guance e lentiggini
  game.view.ctx.fillStyle = 'rgba(255,120,120,0.35)';
  game.view.ctx.beginPath();
  game.view.ctx.arc(hx - 5.5 * s, hy + 3.5 * s, 1.8 * s, 0, 6.3);
  game.view.ctx.arc(hx + 5.5 * s, hy + 3.5 * s, 1.8 * s, 0, 6.3);
  game.view.ctx.fill();
  if (bd.freckles) {
    game.view.ctx.fillStyle = 'rgba(140,80,40,0.6)';
    [
      [-5.6, 2.4],
      [-4.3, 3.4],
      [-6.3, 3.6],
      [5.6, 2.4],
      [4.3, 3.4],
      [6.3, 3.6],
    ].forEach(([dx, dy]: GameValue = {}): GameValue => {
      game.view.ctx.beginPath();
      game.view.ctx.arc(hx + dx * s, hy + dy * s, 0.5 * s, 0, 6.3);
      game.view.ctx.fill();
    });
  }
  // baffi
  if (bd.beard === 1 || bd.beard === 2 || bd.beard === 4) {
    game.view.ctx.fillStyle = hair;
    [-1, 1].forEach((sg?: GameValue): GameValue => {
      game.view.ctx.beginPath();
      game.view.ctx.ellipse(hx + sg * 2 * s, hy + 3 * s, 2.3 * s, 0.9 * s, sg * 0.3, 0, 6.3);
      game.view.ctx.fill();
    });
  }
  // bocca
  const mc: GameValue = beardOn ? '#e8a598' : '#6d3a2a';
  game.view.ctx.lineWidth = 1;
  if (bd.mouth === 0) {
    game.view.ctx.strokeStyle = mc;
    game.view.ctx.beginPath();
    game.view.ctx.arc(hx, hy + 3.5 * s, 2.2 * s, 0.2, Math.PI - 0.2);
    game.view.ctx.stroke();
  } else if (bd.mouth === 1) {
    game.view.ctx.strokeStyle = mc;
    game.view.ctx.beginPath();
    game.view.ctx.moveTo(hx - 1.6 * s, hy + 5.4 * s);
    game.view.ctx.lineTo(hx + 1.6 * s, hy + 5.4 * s);
    game.view.ctx.stroke();
  } else if (bd.mouth === 2) {
    game.view.ctx.fillStyle = '#7b241c';
    game.view.ctx.beginPath();
    game.view.ctx.arc(hx, hy + 4 * s, 2.7 * s, 0, Math.PI);
    game.view.ctx.closePath();
    game.view.ctx.fill();
    game.view.ctx.fillStyle = '#ffffff';
    game.view.ctx.fillRect(hx - 2.2 * s, hy + 4 * s, 4.4 * s, 0.9 * s);
    game.view.ctx.fillStyle = '#e6798c';
    game.view.ctx.beginPath();
    game.view.ctx.ellipse(hx, hy + 6 * s, 1.3 * s, 0.7 * s, 0, 0, 6.3);
    game.view.ctx.fill();
  } else {
    game.view.ctx.strokeStyle = '#c0392b';
    game.view.ctx.lineWidth = 1.6 * s;
    game.view.ctx.beginPath();
    game.view.ctx.arc(hx, hy + 3.5 * s, 2.2 * s, 0.2, Math.PI - 0.2);
    game.view.ctx.stroke();
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
  if (game.creatorDraft.beard && Math.random() < 0.5) game.creatorDraft.beard = 0;
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
export function startShower(..._args: GameValue[]): GameValue {
  if (game.showerAnim) return;
  game.showerAnim = {
    t0: game.animClock,
    fromX: game.playerPos.x,
    fromY: game.playerPos.y,
    hy0: game.player.hygieneLevel,
  };
  sfx('shower');
}

// Entra nel box, resta sotto l'acqua per qualche secondo (l'igiene sale piano piano) e poi esce
export function updateShower(now?: GameValue): GameValue {
  const sh: GameValue = game.bathroomFurniture.shower,
    a: GameValue = game.showerAnim,
    e: GameValue = now - a.t0;
  const inX: GameValue = sh.x,
    inY: GameValue = sh.y + 4;
  const ease: GameValue = (k?: GameValue): GameValue => k * k * (3 - 2 * k);
  const T1: GameValue = 0.8,
    T2: GameValue = 3.8,
    T3: GameValue = 4.6;
  if (e < T1) {
    const k: GameValue = ease(e / T1);
    game.playerPos.x = a.fromX + (inX - a.fromX) * k;
    game.playerPos.y = a.fromY + (inY - a.fromY) * k;
    game.isWalking = true;
  } else if (e < T2) {
    game.playerPos.x = inX;
    game.playerPos.y = inY;
    game.player.hygieneLevel = Math.max(
      game.player.hygieneLevel,
      a.hy0 + (100 - a.hy0) * ((e - T1) / (T2 - T1)),
    );
  } else if (e < T3) {
    const k: GameValue = ease((e - T2) / (T3 - T2));
    game.playerPos.x = inX + (a.fromX - inX) * k;
    game.playerPos.y = inY + (a.fromY - inY) * k;
    game.isWalking = true;
    game.player.hygieneLevel = 100;
  } else {
    game.player.hygieneLevel = 100;
    game.player.stats.showers++;
    game.playerPos.x = a.fromX;
    game.playerPos.y = a.fromY;
    game.showerAnim = null;
    toast('Doccia completata! 🚿');
  }
}

export function pillTag(cx?: GameValue, ny?: GameValue, name?: GameValue): GameValue {
  if (!name) return;
  game.view.ctx.font = 'bold 10px sans-serif';
  game.view.ctx.textAlign = 'center';
  const nw: GameValue = Math.min(90, game.view.ctx.measureText(name).width + 14);
  game.view.ctx.fillStyle = 'rgba(0, 0, 0, 0.6)';
  game.view.ctx.beginPath();
  game.view.ctx.roundRect
    ? game.view.ctx.roundRect(cx - nw / 2, ny, nw, 16, 8)
    : game.view.ctx.rect(cx - nw / 2, ny, nw, 16);
  game.view.ctx.fill();
  game.view.ctx.fillStyle = '#fff';
  game.view.ctx.fillText(name, cx, ny + 11.5, nw - 8);
}

export function speechBubble(cx?: GameValue, by?: GameValue, text?: GameValue): GameValue {
  if (!text) return;
  game.view.ctx.font = '12px sans-serif';
  game.view.ctx.textAlign = 'center';
  const bw: GameValue = Math.min(180, game.view.ctx.measureText(text).width) + 16;
  game.view.ctx.fillStyle = '#fff';
  game.view.ctx.beginPath();
  game.view.ctx.roundRect
    ? game.view.ctx.roundRect(cx - bw / 2, by, bw, 22, 10)
    : game.view.ctx.rect(cx - bw / 2, by, bw, 22);
  game.view.ctx.fill();
  game.view.ctx.beginPath();
  game.view.ctx.moveTo(cx - 5, by + 22);
  game.view.ctx.lineTo(cx + 5, by + 22);
  game.view.ctx.lineTo(cx, by + 29);
  game.view.ctx.fill();
  game.view.ctx.fillStyle = '#111';
  game.view.ctx.fillText(text, cx, by + 15, 180);
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
export function drawAvatarSleeping(
  px?: GameValue,
  py?: GameValue,
  name?: GameValue,
  animTime?: GameValue,
  look?: GameValue,
  say?: GameValue,
  k?: GameValue,
  bed?: GameValue,
): GameValue {
  const s: GameValue = isoScale(),
    e: GameValue = k * k * (3 - 2 * k);
  const footY: GameValue = bed.y + bed.h * 0.21;
  const tx: GameValue = px + (bed.x - px) * e,
    ty: GameValue = py + (footY - py) * e;
  const lift: GameValue = 24 * e + Math.sin(Math.PI * k) * 12;
  const rot: GameValue = (Math.PI / 3) * e;
  const pv: GameValue = isoProject(tx, ty, 0);
  game.view.ctx.save();
  game.view.ctx.translate(pv.x, pv.y - lift * s);
  game.view.ctx.rotate(rot);
  game.view.ctx.translate(-pv.x, -pv.y);
  drawPlayerAvatar(tx, ty, '', animTime, look, false, '', { noShadow: e > 0.05 });
  game.view.ctx.restore();
  if (e > 0.05 && e < 1) {
    // ombra a terra mentre salta sul letto
    const g: GameValue = isoProject(tx, ty, 0);
    game.view.ctx.fillStyle = 'rgba(0,0,0,' + 0.3 * (1 - e) + ')';
    game.view.ctx.beginPath();
    game.view.ctx.ellipse(g.x, g.y, 13 * s, 6.5 * s, 0, 0, 6.3);
    game.view.ctx.fill();
  }
  if (e > 0.9) {
    // la coperta copre le gambe
    const col: GameValue = bed.color || '#5f27cd';
    game.view.ctx.globalAlpha = Math.min(1, (e - 0.9) / 0.1);
    const bl: GameValue = box(bed.x, bed.y + bed.h * 0.22, bed.w - 8, bed.h * 0.5, 8, col, {
      z0: 23,
      top: bed.topColor || game.lighten(col, 0.15),
    });
    onFace(bl, 'top', (W?: GameValue, H?: GameValue): GameValue => {
      game.view.ctx.fillStyle = 'rgba(255,255,255,0.13)';
      for (let i: GameValue = 4; i < W; i += 14) game.view.ctx.fillRect(i, 0, 5, H);
      game.view.ctx.fillStyle = 'rgba(255,255,255,0.55)';
      game.view.ctx.fillRect(0, 0, W, 6);
    });
    game.view.ctx.globalAlpha = 1;
  }
  const hs: GameValue = {
    x: pv.x + Math.sin(rot) * 58 * s,
    y: pv.y - lift * s - Math.cos(rot) * 58 * s,
  };
  if (k > 0.95) {
    // Z che salgono dalla testa
    game.view.ctx.textAlign = 'center';
    for (let i: GameValue = 0; i < 3; i++) {
      const ph: GameValue = (animTime * 0.45 + i / 3) % 1;
      game.view.ctx.globalAlpha = Math.sin(Math.PI * ph) * 0.9;
      game.view.ctx.fillStyle = '#cfe3ff';
      game.view.ctx.font = 'bold ' + (10 + ph * 10) * s + 'px sans-serif';
      game.view.ctx.fillText(
        'Z',
        hs.x + 12 * s + ph * 18 * s + Math.sin(animTime * 2 + i) * 3,
        hs.y - 8 * s - ph * 34 * s,
      );
    }
    game.view.ctx.globalAlpha = 1;
  }
  pillTag(hs.x, hs.y - 30 * s, name);
  speechBubble(hs.x, hs.y - 62 * s, say);
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
): GameValue {
  if (sleepProgress > 0.001 && bed)
    return drawAvatarSleeping(x, y, name, animTime, look, say, sleepProgress, bed);
  return drawPlayerAvatar(x, y, name, animTime, look, moving, say);
}

// Acqua, bolle di sapone e vapore dentro il box doccia
export function drawShowerWater(it?: GameValue, t?: GameValue, occ?: GameValue): GameValue {
  const s: GameValue = isoScale();
  const hx: GameValue = it.x - it.w / 2 + 22,
    hy: GameValue = it.y - it.h / 2 + 12,
    hz: GameValue = it.z - 12;
  game.view.ctx.lineCap = 'round';
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
      game.view.ctx.strokeStyle = 'rgba(41,128,200,' + (0.55 + 0.4 * (1 - ph)) + ')';
      game.view.ctx.lineWidth = 1.7 * s;
      game.view.ctx.beginPath();
      game.view.ctx.moveTo(B.x, B.y);
      game.view.ctx.lineTo(A.x, A.y);
      game.view.ctx.stroke();
      if (ph > 0.9) {
        const g: GameValue = isoProject(tx, ty, 6);
        game.view.ctx.strokeStyle = 'rgba(41,128,200,0.7)';
        game.view.ctx.lineWidth = 0.9 * s;
        game.view.ctx.beginPath();
        game.view.ctx.ellipse(
          g.x,
          g.y,
          (3 + (ph - 0.9) * 40) * s,
          (1.5 + (ph - 0.9) * 20) * s,
          0,
          0,
          6.3,
        );
        game.view.ctx.stroke();
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
      game.view.ctx.fillStyle = 'rgba(190,230,250,' + 0.45 * (1 - ph) + ')';
      game.view.ctx.strokeStyle = 'rgba(70,160,220,' + 0.9 * (1 - ph) + ')';
      game.view.ctx.lineWidth = 0.9 * s;
      game.view.ctx.beginPath();
      game.view.ctx.arc(p.x, p.y, r, 0, 6.3);
      game.view.ctx.fill();
      game.view.ctx.stroke();
      game.view.ctx.fillStyle = 'rgba(255,255,255,' + 1 * (1 - ph) + ')';
      game.view.ctx.beginPath();
      game.view.ctx.arc(p.x - r * 0.35, p.y - r * 0.35, r * 0.25, 0, 6.3);
      game.view.ctx.fill();
    }
  });
  game.view.ctx.lineCap = 'butt';
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
  const s: GameValue = isoScale();
  const hsh: GameValue = nameHash(name);
  const mannequin: GameValue = !!look.mannequin;
  const bd: GameValue = look.body || bodyFromName(name);
  const skin: GameValue = mannequin ? '#dfe4ea' : game.BODY_PARTS.skin.opts[bd.skin].c;
  const hair: GameValue = game.BODY_PARTS.hairColor.opts[bd.hairColor].c;
  const top: GameValue = look.top,
    pants: GameValue = look.pants,
    shoes: GameValue = look.shoes;
  const g0: GameValue = isoProject(x, y, 0);
  if (!(opts && opts.noShadow)) {
    game.view.ctx.fillStyle = 'rgba(0,0,0,0.3)';
    game.view.ctx.beginPath();
    game.view.ctx.ellipse(g0.x, g0.y, 13 * s, 6.5 * s, 0, 0, 6.3);
    game.view.ctx.fill();
  }
  const phase: GameValue = animTime * 11 + (hsh % 10);
  const swing: GameValue = moving ? Math.sin(phase) : 0;
  const bob: GameValue = moving
    ? Math.abs(Math.sin(phase)) * 2
    : mannequin
      ? 0
      : Math.sin(animTime * 2 + hsh) * 0.5;
  const P: GameValue = (dx?: GameValue, dy?: GameValue, z?: GameValue): GameValue =>
    isoProject(x + dx, y + dy, z);
  const hip: GameValue = P(0, 0, 22 + bob),
    neck: GameValue = P(0, 0, 46 + bob),
    head: GameValue = P(0, 0, 58 + bob);
  game.view.ctx.lineCap = 'round';
  // ---- gambe e scarpe
  const shorts: GameValue = pants.style === 'shorts';
  const drawLeg: GameValue = (a?: GameValue, b?: GameValue, back?: GameValue): GameValue => {
    const pc: GameValue = back ? game.darken(pants.color, 0.18) : pants.color;
    const knee: GameValue = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
    game.view.ctx.strokeStyle = pc;
    game.view.ctx.lineWidth = (shorts ? 5.4 : 4.6) * s;
    game.view.ctx.beginPath();
    game.view.ctx.moveTo(a.x, a.y);
    game.view.ctx.lineTo(shorts ? knee.x : b.x, shorts ? knee.y : b.y);
    game.view.ctx.stroke();
    if (shorts) {
      game.view.ctx.strokeStyle = back ? game.darken(skin, 0.12) : skin;
      game.view.ctx.lineWidth = 3.8 * s;
      game.view.ctx.beginPath();
      game.view.ctx.moveTo(knee.x, knee.y);
      game.view.ctx.lineTo(b.x, b.y);
      game.view.ctx.stroke();
    }
    if (pants.style === 'camo') {
      game.view.ctx.fillStyle = pants.color2;
      [0.2, 0.5, 0.75].forEach((k?: GameValue, i?: GameValue): GameValue => {
        game.view.ctx.beginPath();
        game.view.ctx.arc(
          a.x + (b.x - a.x) * k + (i % 2 ? 1 : -1) * s,
          a.y + (b.y - a.y) * k,
          1.4 * s,
          0,
          6.3,
        );
        game.view.ctx.fill();
      });
    }
    game.view.ctx.fillStyle = back ? game.darken(shoes.color, 0.2) : shoes.color;
    game.view.ctx.beginPath();
    game.view.ctx.ellipse(b.x + 1.5 * s, b.y, 3.6 * s, 2.1 * s, 0, 0, 6.3);
    game.view.ctx.fill();
    game.view.ctx.strokeStyle = 'rgba(0,0,0,0.35)';
    game.view.ctx.lineWidth = 0.8;
    game.view.ctx.stroke();
  };
  drawLeg(P(3, -3, 22 + bob), P(3 - swing * 5, -3 + swing * 5, 2), true);
  drawLeg(P(-3, 3, 22 + bob), P(-3 + swing * 5, 3 - swing * 5, 2), false);
  // ---- braccio dietro
  const tw: GameValue = 9.5 * s;
  const sleeve: GameValue = top.color;
  const armBack: GameValue = { x: neck.x + tw - 1 * s, y: neck.y + 3 * s },
    handBack: GameValue = { x: hip.x + 11 * s - swing * 3 * s, y: hip.y + 1 * s };
  game.view.ctx.strokeStyle = game.darken(sleeve, 0.3);
  game.view.ctx.lineWidth = 3.6 * s;
  game.view.ctx.beginPath();
  game.view.ctx.moveTo(armBack.x, armBack.y);
  game.view.ctx.lineTo(handBack.x, handBack.y);
  game.view.ctx.stroke();
  game.view.ctx.fillStyle = skin;
  game.view.ctx.beginPath();
  game.view.ctx.arc(handBack.x, handBack.y, 2.6 * s, 0, 6.3);
  game.view.ctx.fill();
  // ---- cappuccio (dietro al collo)
  if (top.style === 'hoodie') {
    game.view.ctx.fillStyle = game.darken(top.color, 0.2);
    game.view.ctx.beginPath();
    game.view.ctx.ellipse(neck.x + 1 * s, neck.y - 2 * s, 8 * s, 4.5 * s, 0, 0, 6.3);
    game.view.ctx.fill();
  }
  // ---- busto con il motivo del capo
  const torsoPath: GameValue = (): GameValue => {
    game.view.ctx.beginPath();
    game.view.ctx.moveTo(hip.x - 7.5 * s, hip.y + 2 * s);
    game.view.ctx.lineTo(hip.x + 7.5 * s, hip.y + 2 * s);
    game.view.ctx.lineTo(neck.x + tw, neck.y + 4 * s);
    game.view.ctx.quadraticCurveTo(
      neck.x + tw,
      neck.y - 1 * s,
      neck.x + tw - 4 * s,
      neck.y - 1 * s,
    );
    game.view.ctx.lineTo(neck.x - tw + 4 * s, neck.y - 1 * s);
    game.view.ctx.quadraticCurveTo(neck.x - tw, neck.y - 1 * s, neck.x - tw, neck.y + 4 * s);
    game.view.ctx.closePath();
  };
  const grad: GameValue = game.view.ctx.createLinearGradient(neck.x - tw, 0, neck.x + tw, 0);
  grad.addColorStop(0, game.lighten(top.color, 0.18));
  grad.addColorStop(1, game.darken(top.color, 0.25));
  torsoPath();
  game.view.ctx.fillStyle = grad;
  game.view.ctx.fill();
  game.view.ctx.save();
  torsoPath();
  game.view.ctx.clip();
  const c2: GameValue = top.color2 || '#ffffff';
  const tx: GameValue = neck.x - tw,
    tyTop: GameValue = neck.y - 1 * s,
    tyBot: GameValue = hip.y + 2 * s,
    tW: GameValue = tw * 2,
    tH: GameValue = tyBot - tyTop;
  switch (top.style) {
    case 'stripes':
      game.view.ctx.fillStyle = c2;
      for (let v: GameValue = tyTop + 2 * s; v < tyBot; v += 4 * s)
        game.view.ctx.fillRect(tx, v, tW, 2 * s);
      break;
    case 'hawaii':
      for (let i: GameValue = 0; i < 9; i++) {
        const px: GameValue = tx + rnd(i) * tW,
          py: GameValue = tyTop + rnd(i + 5) * tH;
        game.view.ctx.fillStyle = i % 2 ? c2 : '#ffffff';
        for (let p: GameValue = 0; p < 5; p++) {
          game.view.ctx.beginPath();
          game.view.ctx.arc(
            px + Math.cos(p * 1.256) * 1.5 * s,
            py + Math.sin(p * 1.256) * 1.5 * s,
            1.1 * s,
            0,
            6.3,
          );
          game.view.ctx.fill();
        }
        game.view.ctx.fillStyle = '#feca57';
        game.view.ctx.beginPath();
        game.view.ctx.arc(px, py, 0.8 * s, 0, 6.3);
        game.view.ctx.fill();
      }
      break;
    case 'sport':
      game.view.ctx.fillStyle = c2;
      game.view.ctx.fillRect(tx + 2 * s, tyTop, 1.6 * s, tH);
      game.view.ctx.fillRect(tx + tW - 3.6 * s, tyTop, 1.6 * s, tH);
      game.view.ctx.fillStyle = 'rgba(255,255,255,0.75)';
      game.view.ctx.fillRect(neck.x - 0.4 * s, tyTop, 0.8 * s, tH);
      break;
    case 'xmas': {
      game.view.ctx.fillStyle = c2;
      game.view.ctx.fillRect(tx, tyTop + tH * 0.3, tW, 1.3 * s);
      game.view.ctx.fillRect(tx, tyTop + tH * 0.7, tW, 1.3 * s);
      game.view.ctx.strokeStyle = '#27ae60';
      game.view.ctx.lineWidth = 1.4 * s;
      game.view.ctx.beginPath();
      for (let u: GameValue = 0, i: GameValue = 0; u <= tW; u += 2.5 * s, i++) {
        const vv: GameValue = tyTop + tH * 0.5 + (i % 2 ? -1.6 : 1.6) * s;
        i === 0 ? game.view.ctx.moveTo(tx + u, vv) : game.view.ctx.lineTo(tx + u, vv);
      }
      game.view.ctx.stroke();
      break;
    }
    case 'suit':
      game.view.ctx.fillStyle = '#ffffff';
      game.view.ctx.beginPath();
      game.view.ctx.moveTo(neck.x - 3.8 * s, tyTop);
      game.view.ctx.lineTo(neck.x + 3.8 * s, tyTop);
      game.view.ctx.lineTo(neck.x, tyTop + tH * 0.58);
      game.view.ctx.fill();
      game.view.ctx.fillStyle = c2;
      game.view.ctx.beginPath();
      game.view.ctx.moveTo(neck.x - 1.1 * s, tyTop + 0.8 * s);
      game.view.ctx.lineTo(neck.x + 1.1 * s, tyTop + 0.8 * s);
      game.view.ctx.lineTo(neck.x + 1.7 * s, tyTop + tH * 0.48);
      game.view.ctx.lineTo(neck.x, tyTop + tH * 0.6);
      game.view.ctx.lineTo(neck.x - 1.7 * s, tyTop + tH * 0.48);
      game.view.ctx.closePath();
      game.view.ctx.fill();
      game.view.ctx.strokeStyle = 'rgba(0,0,0,0.4)';
      game.view.ctx.lineWidth = 1;
      game.view.ctx.beginPath();
      game.view.ctx.moveTo(neck.x - 4 * s, tyTop);
      game.view.ctx.lineTo(neck.x - 1 * s, tyTop + tH * 0.6);
      game.view.ctx.moveTo(neck.x + 4 * s, tyTop);
      game.view.ctx.lineTo(neck.x + 1 * s, tyTop + tH * 0.6);
      game.view.ctx.stroke();
      game.view.ctx.fillStyle = 'rgba(0,0,0,0.5)';
      [0.72, 0.86].forEach((k?: GameValue): GameValue => {
        game.view.ctx.beginPath();
        game.view.ctx.arc(neck.x, tyTop + tH * k, 0.8 * s, 0, 6.3);
        game.view.ctx.fill();
      });
      break;
    case 'jacket':
      game.view.ctx.fillStyle = c2;
      game.view.ctx.fillRect(neck.x - 2.6 * s, tyTop, 5.2 * s, tH);
      game.view.ctx.strokeStyle = 'rgba(0,0,0,0.4)';
      game.view.ctx.lineWidth = 1;
      game.view.ctx.beginPath();
      game.view.ctx.moveTo(neck.x - 2.6 * s, tyTop);
      game.view.ctx.lineTo(neck.x - 2.6 * s, tyBot);
      game.view.ctx.moveTo(neck.x + 2.6 * s, tyTop);
      game.view.ctx.lineTo(neck.x + 2.6 * s, tyBot);
      game.view.ctx.stroke();
      game.view.ctx.fillStyle = game.lighten(top.color, 0.15);
      game.view.ctx.beginPath();
      game.view.ctx.moveTo(neck.x - 2.6 * s, tyTop);
      game.view.ctx.lineTo(neck.x - 6.5 * s, tyTop);
      game.view.ctx.lineTo(neck.x - 2.6 * s, tyTop + 5 * s);
      game.view.ctx.fill();
      game.view.ctx.beginPath();
      game.view.ctx.moveTo(neck.x + 2.6 * s, tyTop);
      game.view.ctx.lineTo(neck.x + 6.5 * s, tyTop);
      game.view.ctx.lineTo(neck.x + 2.6 * s, tyTop + 5 * s);
      game.view.ctx.fill();
      break;
    case 'hoodie':
      game.view.ctx.fillStyle = game.darken(top.color, 0.18);
      game.view.ctx.fillRect(neck.x - 5 * s, tyTop + tH * 0.6, 10 * s, tH * 0.27);
      game.view.ctx.strokeStyle = c2;
      game.view.ctx.lineWidth = 0.9 * s;
      game.view.ctx.beginPath();
      game.view.ctx.moveTo(neck.x - 1.6 * s, tyTop);
      game.view.ctx.lineTo(neck.x - 1.6 * s, tyTop + 6 * s);
      game.view.ctx.moveTo(neck.x + 1.6 * s, tyTop);
      game.view.ctx.lineTo(neck.x + 1.6 * s, tyTop + 6 * s);
      game.view.ctx.stroke();
      break;
  }
  game.view.ctx.restore();
  torsoPath();
  game.view.ctx.strokeStyle = 'rgba(0,0,0,0.3)';
  game.view.ctx.lineWidth = 1;
  game.view.ctx.stroke();
  game.view.ctx.fillStyle = 'rgba(0,0,0,0.28)';
  game.view.ctx.fillRect(hip.x - 7.5 * s, hip.y - 1 * s, 15 * s, 3 * s);
  // ---- braccio davanti
  const armFront: GameValue = { x: neck.x - tw + 1 * s, y: neck.y + 3 * s },
    handFront: GameValue = { x: hip.x - 11 * s + swing * 3 * s, y: hip.y + 1 * s };
  game.view.ctx.strokeStyle = game.darken(sleeve, 0.08);
  game.view.ctx.lineWidth = 3.6 * s;
  game.view.ctx.beginPath();
  game.view.ctx.moveTo(armFront.x, armFront.y);
  game.view.ctx.lineTo(handFront.x, handFront.y);
  game.view.ctx.stroke();
  if (top.style === 'sport') {
    game.view.ctx.strokeStyle = top.color2;
    game.view.ctx.lineWidth = 0.9 * s;
    game.view.ctx.beginPath();
    game.view.ctx.moveTo(armFront.x, armFront.y);
    game.view.ctx.lineTo(handFront.x, handFront.y);
    game.view.ctx.stroke();
  }
  game.view.ctx.fillStyle = skin;
  game.view.ctx.beginPath();
  game.view.ctx.arc(handFront.x, handFront.y, 2.6 * s, 0, 6.3);
  game.view.ctx.fill();
  // ---- testa
  if (!mannequin) drawHairBack(head, s, bd.hairStyle, hair);
  game.view.ctx.fillStyle = skin;
  game.view.ctx.fillRect(neck.x - 2.5 * s, neck.y - 4 * s, 5 * s, 5 * s);
  const hg: GameValue = game.view.ctx.createRadialGradient(
    head.x - 3 * s,
    head.y - 3 * s,
    2 * s,
    head.x,
    head.y,
    10 * s,
  );
  hg.addColorStop(0, game.lighten(skin, 0.15));
  hg.addColorStop(1, game.darken(skin, 0.12));
  game.view.ctx.fillStyle = hg;
  game.view.ctx.beginPath();
  game.view.ctx.arc(head.x, head.y, 9 * s, 0, Math.PI * 2);
  game.view.ctx.fill();
  game.view.ctx.strokeStyle = 'rgba(0,0,0,0.3)';
  game.view.ctx.lineWidth = 1;
  game.view.ctx.stroke();
  if (!mannequin) {
    drawFace(head, s, bd, hair, animTime, hsh);
    drawHairFront(head, s, bd.hairStyle, hair);
  }
  drawGlasses(head, s, look.glasses);
  drawHat(head, s, look.hat);
  game.view.ctx.lineCap = 'butt';
  if (name) {
    game.view.ctx.font = 'bold 10px sans-serif';
    game.view.ctx.textAlign = 'center';
    const nw: GameValue = Math.min(90, game.view.ctx.measureText(name).width + 14);
    const ny: GameValue = head.y - (look.hat && look.hat.style === 'tophat' ? 40 : 34) * s - 8;
    game.view.ctx.fillStyle = 'rgba(0, 0, 0, 0.6)';
    game.view.ctx.beginPath();
    game.view.ctx.roundRect
      ? game.view.ctx.roundRect(head.x - nw / 2, ny, nw, 16, 8)
      : game.view.ctx.rect(head.x - nw / 2, ny, nw, 16);
    game.view.ctx.fill();
    game.view.ctx.fillStyle = '#fff';
    game.view.ctx.fillText(name, head.x, ny + 11.5, nw - 8);
  }
  if (say) {
    game.view.ctx.font = '12px sans-serif';
    const bw: GameValue = Math.min(180, game.view.ctx.measureText(say).width) + 16;
    const bx: GameValue = head.x - bw / 2,
      by: GameValue = head.y - 34 * s - 40;
    game.view.ctx.fillStyle = '#fff';
    game.view.ctx.beginPath();
    game.view.ctx.roundRect
      ? game.view.ctx.roundRect(bx, by, bw, 22, 10)
      : game.view.ctx.rect(bx, by, bw, 22);
    game.view.ctx.fill();
    game.view.ctx.beginPath();
    game.view.ctx.moveTo(head.x - 5, by + 22);
    game.view.ctx.lineTo(head.x + 5, by + 22);
    game.view.ctx.lineTo(head.x, by + 29);
    game.view.ctx.fill();
    game.view.ctx.fillStyle = '#111';
    game.view.ctx.textAlign = 'center';
    game.view.ctx.fillText(say, head.x, by + 15, 180);
  }
}
