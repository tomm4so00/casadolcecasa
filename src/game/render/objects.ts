import { PANEL_DOOR, PORTONE, doorOpenAmount } from './doors.js';
import { drawShowroomItem } from './showroom.js';
import { clockText } from '../game-clock.js';
import { drawBar } from './bar.js';
import { type GameValue, game } from '../context.js';
import {
  isoProject,
  isoScale,
  mixColor,
  poly,
  rnd,
  footprintOf,
  rotateVector,
  setPlane,
  worldPoint,
} from './primitives.js';
import { isMyRoomNow } from '../saves.js';
import { ownsItem, wardrobeOpenAmount } from '../character.js';
import { drawPlayerAvatar, drawShowerWater } from './avatars.js';
import { sortIsoParts } from './iso-sort.js';
import { drawCached } from './sprite-cache.js';
import { unreadGossip } from '../gossip.js';
import { SAFE_CORRIDOR } from '../room-layout.js';
import { nextUpgrade, tierOf, tierOfPlaced, tiersOf } from '../furniture-tiers.js';
import { LAMP_LIGHT } from '../furniture-benefits.js';
import { drawCourtyardDoor } from './facades.js';
import { drawBoutiqueItem } from './mall.js';
import { chairsOf } from '../chair-rules.js';
export function resetPlane(..._args: GameValue[]): GameValue {
  game.view.ctx.setTransform(1, 0, 0, 1, 0, 0);
}

// Parallelepipedo: (x,y) centro, w lungo x, h lungo y, d altezza. Disegna le 3 facce visibili.
export function box(
  x?: GameValue,
  y?: GameValue,
  w?: GameValue,
  h?: GameValue,
  d?: GameValue,
  color?: GameValue,
  opt: GameValue = {},
): GameValue {
  const z0: GameValue = opt.z0 || 0,
    z1: GameValue = z0 + d;
  const x0: GameValue = x - w / 2,
    x1: GameValue = x + w / 2,
    y0: GameValue = y - h / 2,
    y1: GameValue = y + h / 2;
  const P: GameValue = isoProject;
  const edge: GameValue = opt.edge === undefined ? 'rgba(0,0,0,0.3)' : opt.edge;
  const b: GameValue = { x, y, w, h, d, x0, x1, y0, y1, z0, z1 };
  const rot = game.furnRot;
  const drawFaces = (): void => {
    if (!rot || !rot.k) {
      poly(
        [P(x0, y1, z0), P(x1, y1, z0), P(x1, y1, z1), P(x0, y1, z1)],
        opt.left || game.darken(color, 0.1),
        edge,
      ); // faccia davanti-sinistra
      poly(
        [P(x1, y1, z0), P(x1, y0, z0), P(x1, y0, z1), P(x1, y1, z1)],
        opt.right || game.darken(color, 0.28),
        edge,
      ); // faccia davanti-destra
    } else {
      // Mobile ruotato: si disegnano le due facce che dopo la rotazione guardano verso chi osserva.
      const sides = [
        {
          n: [0, 1],
          own: opt.left,
          pts: [P(x0, y1, z0), P(x1, y1, z0), P(x1, y1, z1), P(x0, y1, z1)],
        },
        {
          n: [1, 0],
          own: opt.right,
          pts: [P(x1, y1, z0), P(x1, y0, z0), P(x1, y0, z1), P(x1, y1, z1)],
        },
        {
          n: [0, -1],
          own: null,
          pts: [P(x0, y0, z0), P(x1, y0, z0), P(x1, y0, z1), P(x0, y0, z1)],
        },
        {
          n: [-1, 0],
          own: null,
          pts: [P(x0, y1, z0), P(x0, y0, z0), P(x0, y0, z1), P(x0, y1, z1)],
        },
      ];
      for (const side of sides) {
        const wn = rotateVector(side.n[0], side.n[1], rot.k);
        if (wn.x < 0.5 && wn.y < 0.5) continue; // faccia nascosta
        poly(side.pts, side.own || game.darken(color, wn.y > 0.5 ? 0.1 : 0.28), edge);
      }
    }
    poly(
      [P(x0, y0, z1), P(x1, y0, z1), P(x1, y1, z1), P(x0, y1, z1)],
      opt.top || game.lighten(color, 0.1),
      edge,
    ); // sopra
    for (const extra of b._extra || []) extra();
  };
  // Mobile ruotato: le parti si disegnano alla fine, ordinate per profondità.
  if (game.furnQueue && rot && rot.k) {
    b._extra = [];
    const a = worldPoint(x0, y0),
      c = worldPoint(x1, y1);
    game.furnQueue.push({
      minX: Math.min(a.x, c.x),
      maxX: Math.max(a.x, c.x),
      minY: Math.min(a.y, c.y),
      maxY: Math.max(a.y, c.y),
      minZ: z0,
      maxZ: z1,
      draw: drawFaces,
    });
  } else drawFaces();
  return b;
}

/** Per i disegni che non sono box: con un mobile ruotato vengono messi in coda nell'ordine giusto. */
function drawDeferred(x: number, y: number, z: number, fn: () => void): void {
  if (game.furnQueue && game.furnRot?.k) {
    const c = worldPoint(x, y);
    game.furnQueue.push({
      minX: c.x - 1,
      maxX: c.x + 1,
      minY: c.y - 1,
      maxY: c.y + 1,
      minZ: z,
      maxZ: z + 1,
      draw: fn,
    });
  } else fn();
}

// Normale (verso l'esterno) delle facce laterali: left = davanti (+y), right = destra (+x),
// back = retro (−y), west = fianco sinistro (−x). Le ultime due si vedono solo se il mobile è girato.
const FACE_NORMAL: Record<string, [number, number]> = {
  left: [0, 1],
  right: [1, 0],
  back: [0, -1],
  west: [-1, 0],
};

// Disegna su una faccia del box: fn(larghezza, altezza) in coordinate locali (origine in alto a sinistra)
export function onFace(b?: GameValue, face?: GameValue, fn?: GameValue): GameValue {
  if (face !== 'top') {
    // Con la rotazione una faccia può guardare dalla parte opposta a chi osserva: allora non si vede.
    const [nx, ny] = FACE_NORMAL[face] || FACE_NORMAL.right;
    const wn = rotateVector(nx, ny, game.furnRot?.k || 0);
    if (wn.x < 0.5 && wn.y < 0.5) return;
  }
  const paint = (): void => {
    if (face === 'top') setPlane([b.x0, b.y0, b.z1], [1, 0, 0], [0, 1, 0]);
    else if (face === 'left') setPlane([b.x0, b.y1, b.z1], [1, 0, 0], [0, 0, -1]);
    else if (face === 'back') setPlane([b.x1, b.y0, b.z1], [-1, 0, 0], [0, 0, -1]);
    else if (face === 'west') setPlane([b.x0, b.y0, b.z1], [0, 1, 0], [0, 0, -1]);
    else setPlane([b.x1, b.y1, b.z1], [0, -1, 0], [0, 0, -1]);
    try {
      const across = face === 'right' || face === 'west' ? b.h : b.w;
      fn(across, face === 'top' ? b.h : b.d);
    } finally {
      resetPlane();
    }
  };
  if (b._extra) b._extra.push(paint);
  else paint();
}

/** Disegna un mobile della stanza con la sua rotazione (0-3 quarti di giro attorno al centro). */
export function withFurnitureRotation(item: GameValue, draw: () => void): void {
  const k = (((item.rot || 0) % 4) + 4) % 4;
  if (!k) {
    draw();
    return;
  }
  const prevRot = game.furnRot,
    prevQueue = game.furnQueue;
  game.furnRot = { k, cx: item.x, cy: item.y };
  game.furnQueue = [];
  try {
    draw();
    sortIsoParts(game.furnQueue).forEach((part) => part.draw());
  } finally {
    game.furnRot = prevRot;
    game.furnQueue = prevQueue;
  }
}

export function woodGrain(
  W?: GameValue,
  H?: GameValue,
  color?: GameValue,
  vertical: GameValue = false,
  n: GameValue = 6,
): GameValue {
  const ctx = game.view.ctx;
  ctx.strokeStyle = color;
  ctx.lineWidth = 0.7;
  ctx.beginPath();
  for (let i: GameValue = 1; i < n; i++) {
    if (vertical) {
      const u: GameValue = (W * i) / n;
      ctx.moveTo(u, 0);
      ctx.bezierCurveTo(u + 1.5, H * 0.3, u - 1.5, H * 0.65, u, H);
    } else {
      const t: GameValue = (H * i) / n;
      ctx.moveTo(0, t);
      ctx.bezierCurveTo(W * 0.3, t + 1.2, W * 0.65, t - 1.2, W, t);
    }
  }
  ctx.stroke();
}

export function softShadow(x?: GameValue, y?: GameValue, w?: GameValue, h?: GameValue): GameValue {
  const ctx = game.view.ctx;
  setPlane([x - w / 2, y - h / 2, 0], [1, 0, 0], [0, 1, 0]);
  ctx.fillStyle = 'rgba(0,0,0,0.13)';
  ctx.fillRect(-2, -2, w + 12, h + 12);
  ctx.fillStyle = 'rgba(0,0,0,0.14)';
  ctx.fillRect(1, 1, w + 5, h + 5);
  resetPlane();
}

export function ellipseShadow(
  x?: GameValue,
  y?: GameValue,
  rx?: GameValue,
  ry?: GameValue,
  a: GameValue = 0.28,
): GameValue {
  const ctx = game.view.ctx;
  const p: GameValue = isoProject(x, y, 0),
    s: GameValue = isoScale();
  ctx.fillStyle = `rgba(0,0,0,${a})`;
  ctx.beginPath();
  ctx.ellipse(p.x, p.y, rx * s, ry * s, 0, 0, Math.PI * 2);
  ctx.fill();
}

export function isLux(it?: GameValue): GameValue {
  return /✨|Lusso/.test(it.name || '');
}

// Fascia intermedia fra standard e lusso.
function isPremium(it?: GameValue): boolean {
  return tierOfPlaced(it || {}) === 'premium';
}

export function gameClockText(..._args: GameValue[]): GameValue {
  return clockText(new Date());
}

// ---------------------------------------------------------------- MOBILI DELLA STANZA
/** Una piega morbida della stoffa: ombra larga con un filo di luce appena sopra. */
function softCrease(x0: number, y0: number, x1: number, y1: number, bend: number): void {
  const ctx = game.view.ctx;
  const mx = (x0 + x1) / 2,
    my = (y0 + y1) / 2;
  ctx.lineCap = 'round';
  for (const [color, width, off] of [
    ['rgba(0,0,0,0.11)', 2.6, 0],
    ['rgba(255,255,255,0.13)', 1.2, -1.6],
  ] as const) {
    ctx.strokeStyle = color;
    ctx.lineWidth = width;
    ctx.beginPath();
    ctx.moveTo(x0, y0 + off);
    ctx.quadraticCurveTo(mx + bend, my + bend + off, x1, y1 + off);
    ctx.stroke();
  }
}

/**
 * Il sopra della coperta, verso la testiera il risvolto del lenzuolo (alto `fold`). Al posto delle
 * righe dritte: luce al centro, bordi in ombra e qualche piega, così sembra imbottita.
 */
export function softBlanketTop(W: number, H: number, fold = 7): void {
  const ctx = game.view.ctx;
  const g = ctx.createLinearGradient(0, 0, W, 0);
  g.addColorStop(0, 'rgba(0,0,0,0.14)');
  g.addColorStop(0.2, 'rgba(255,255,255,0.05)');
  g.addColorStop(0.5, 'rgba(255,255,255,0.12)');
  g.addColorStop(0.8, 'rgba(255,255,255,0.05)');
  g.addColorStop(1, 'rgba(0,0,0,0.14)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, W, H);
  const n = Math.max(2, Math.round((H - fold) / 22));
  for (let i = 1; i <= n; i++) {
    const t = fold + ((H - fold) * i) / (n + 1);
    softCrease(W * 0.1, t - 2, W * 0.9, t + 2, i % 2 ? 3 : -3);
  }
  // il risvolto gonfio, con la sua ombra sulla coperta
  ctx.fillStyle = 'rgba(0,0,0,0.16)';
  ctx.fillRect(0, fold - 0.5, W, 3);
  const r = ctx.createLinearGradient(0, 0, 0, fold);
  r.addColorStop(0, 'rgba(255,255,255,0.5)');
  r.addColorStop(0.45, 'rgba(255,255,255,0.8)');
  r.addColorStop(1, 'rgba(255,255,255,0.55)');
  ctx.fillStyle = r;
  ctx.beginPath();
  ctx.roundRect(0, 0, W, fold, fold / 2);
  ctx.fill();
}

/** Il fianco della coperta che ricade: luce sul bordo arrotondato in alto, ombra in basso. */
export function softBlanketSide(W: number, H: number): void {
  const ctx = game.view.ctx;
  const g = ctx.createLinearGradient(0, 0, 0, H);
  g.addColorStop(0, 'rgba(255,255,255,0.22)');
  g.addColorStop(0.3, 'rgba(255,255,255,0)');
  g.addColorStop(1, 'rgba(0,0,0,0.2)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, W, H);
  // la stoffa che ricade fa qualche piega verticale
  ctx.fillStyle = 'rgba(0,0,0,0.08)';
  for (let u = 9; u < W - 4; u += 17) {
    ctx.beginPath();
    ctx.moveTo(u, H * 0.25);
    ctx.quadraticCurveTo(u + 2.5, H, u - 1, H);
    ctx.quadraticCurveTo(u + 0.5, H * 0.6, u, H * 0.25);
    ctx.fill();
  }
}

/** Cuscino gonfio: più chiaro al centro, angoli in ombra e la cucitura nel mezzo. */
function softPillowTop(W: number, H: number): void {
  const ctx = game.view.ctx;
  const g = ctx.createRadialGradient(W / 2, H / 2, 1, W / 2, H / 2, W * 0.6);
  g.addColorStop(0, 'rgba(255,255,255,0.6)');
  g.addColorStop(0.6, 'rgba(0,0,0,0.03)');
  g.addColorStop(1, 'rgba(0,0,0,0.16)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, W, H);
  softCrease(W * 0.2, H * 0.52, W * 0.8, H * 0.48, 1);
}

/** Fianco di cuscino o materasso: bordo tondo in alto, ombra verso il basso. */
function softSide(W: number, H: number): void {
  const ctx = game.view.ctx;
  const g = ctx.createLinearGradient(0, 0, 0, H);
  g.addColorStop(0, 'rgba(255,255,255,0.35)');
  g.addColorStop(0.35, 'rgba(255,255,255,0)');
  g.addColorStop(1, 'rgba(0,0,0,0.14)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, W, H);
}

export function drawBed(it?: GameValue): GameValue {
  const ctx = game.view.ctx;
  const Z: GameValue = it.zb || 0,
    lux: GameValue = isLux(it),
    pre = isPremium(it);
  const frameC: GameValue = lux ? '#c9a227' : pre ? '#4e2f1c' : '#7b4a2e';
  const { x, y, w, h }: GameValue = it;
  const hb: GameValue = box(x, y - h / 2 + 4, w, 8, lux ? 54 : pre ? 50 : 44, frameC, { z0: Z });
  onFace(hb, 'left', (W?: GameValue, H?: GameValue): GameValue => {
    ctx.fillStyle = game.darken(frameC, 0.18);
    ctx.fillRect(5, 6, W - 10, H - 16);
    if (pre) {
      // testiera imbottita capitonné con profilo argentato
      ctx.fillStyle = game.darken(it.color, 0.1);
      ctx.fillRect(6, 7, W - 12, H - 18);
      ctx.fillStyle = 'rgba(0,0,0,0.35)';
      for (let i = 1; i < 6; i++)
        for (let j = 1; j < 3; j++) {
          ctx.beginPath();
          ctx.arc(6 + ((W - 12) * i) / 6, 7 + ((H - 18) * j) / 3, 1.1, 0, 6.3);
          ctx.fill();
        }
      ctx.strokeStyle = '#dfe6e9';
      ctx.lineWidth = 1;
      ctx.strokeRect(6, 7, W - 12, H - 18);
      return;
    }
    if (lux) {
      ctx.strokeStyle = '#fff3b0';
      ctx.lineWidth = 1.5;
      ctx.strokeRect(8, 9, W - 16, H - 22);
    }
    woodGrain(W, H, 'rgba(0,0,0,0.15)');
  });
  const fr: GameValue = box(x, y + 4, w, h - 8, 14, frameC, { z0: Z });
  onFace(
    fr,
    'left',
    (W?: GameValue, H?: GameValue): GameValue => woodGrain(W, H, 'rgba(0,0,0,0.18)', false, 3),
  );
  onFace(
    fr,
    'right',
    (W?: GameValue, H?: GameValue): GameValue => woodGrain(W, H, 'rgba(0,0,0,0.18)', false, 3),
  );
  // materasso, cuscini e coperta con bordi chiari e sfumature: devono sembrare morbidi
  const mat: GameValue = box(x, y + 4, w - 6, h - 12, 9, '#f4f6f7', {
    z0: Z + 14,
    edge: 'rgba(0,0,0,0.07)',
  });
  onFace(mat, 'left', softSide);
  onFace(mat, 'right', softSide);
  for (const side of [-1, 1]) {
    const pw: GameValue = box(x + side * w * 0.22, y - h / 2 + 20, w * 0.36, 16, 7, '#ffffff', {
      z0: Z + 23,
      edge: 'rgba(0,0,0,0.08)',
      left: '#eef1f3',
      right: '#dde2e6',
    });
    onFace(pw, 'top', softPillowTop);
    onFace(pw, 'left', softSide);
    onFace(pw, 'right', softSide);
  }
  const bl: GameValue = box(x, y + h * 0.14, w - 2, h * 0.62, 11, it.color, {
    z0: Z + 15,
    top: it.topColor || game.lighten(it.color, 0.15),
    edge: 'rgba(0,0,0,0.12)',
  });
  onFace(bl, 'top', (W: number, H: number) => softBlanketTop(W, H, 7));
  onFace(bl, 'left', softBlanketSide);
  onFace(bl, 'right', softBlanketSide);
}

export function drawShirtShape(
  cx?: GameValue,
  top?: GameValue,
  w?: GameValue,
  h?: GameValue,
  color?: GameValue,
  kind?: GameValue,
): GameValue {
  const ctx = game.view.ctx;
  ctx.fillStyle = color;
  ctx.beginPath();
  if (kind === 'pants') {
    ctx.moveTo(cx - w / 2, top);
    ctx.lineTo(cx + w / 2, top);
    ctx.lineTo(cx + w / 2, top + h);
    ctx.lineTo(cx + 1.2, top + h);
    ctx.lineTo(cx, top + h * 0.32);
    ctx.lineTo(cx - 1.2, top + h);
    ctx.lineTo(cx - w / 2, top + h);
  } else {
    ctx.moveTo(cx - w * 0.28, top);
    ctx.lineTo(cx - w * 0.7, top + h * 0.18);
    ctx.lineTo(cx - w * 0.55, top + h * 0.4);
    ctx.lineTo(cx - w * 0.36, top + h * 0.3);
    ctx.lineTo(cx - w * 0.36, top + h);
    ctx.lineTo(cx + w * 0.36, top + h);
    ctx.lineTo(cx + w * 0.36, top + h * 0.3);
    ctx.lineTo(cx + w * 0.55, top + h * 0.4);
    ctx.lineTo(cx + w * 0.7, top + h * 0.18);
    ctx.lineTo(cx + w * 0.28, top);
  }
  ctx.closePath();
  ctx.fill();
  ctx.strokeStyle = 'rgba(0,0,0,0.3)';
  ctx.lineWidth = 0.6;
  ctx.stroke();
  ctx.strokeStyle = '#95a5a6';
  ctx.lineWidth = 0.8;
  ctx.beginPath();
  ctx.moveTo(cx - w * 0.3, top);
  ctx.lineTo(cx, top - 3);
  ctx.lineTo(cx + w * 0.3, top);
  ctx.moveTo(cx, top - 3);
  ctx.lineTo(cx, top - 5);
  ctx.stroke();
}

export function drawWardrobe(it?: GameValue): GameValue {
  const ctx = game.view.ctx;
  const Z: GameValue = it.zb || 0,
    lux: GameValue = isLux(it);
  const pre = isPremium(it);
  const c: GameValue = lux ? '#7a3b12' : pre ? '#5b3a29' : '#a47551';
  const openK: GameValue = !it.zb && isMyRoomNow() ? wardrobeOpenAmount() : 0;
  const b: GameValue = box(it.x, it.y, it.w, it.h, it.z, c, { z0: Z });
  onFace(b, 'left', (W?: GameValue, H?: GameValue): GameValue => {
    woodGrain(W, H, 'rgba(0,0,0,0.13)', true, 9);
    if (openK > 0.02) {
      // interno: ripiano, appendiabiti e i vestiti che possiedi
      ctx.fillStyle = '#2b1d14';
      ctx.fillRect(4, 6, W - 8, H - 18);
      ctx.fillStyle = 'rgba(255,230,180,' + 0.12 * openK + ')';
      ctx.fillRect(4, 6, W - 8, H - 18);
      ctx.fillStyle = '#b2bec3';
      ctx.fillRect(6, 16, W - 12, 2);
      const clothes: GameValue = game.shopCatalog
        .filter(
          (i?: GameValue): GameValue => (i.slot === 'top' || i.slot === 'pants') && ownsItem(i.id),
        )
        .slice(0, 7);
      clothes.forEach(
        (g?: GameValue, i?: GameValue): GameValue =>
          drawShirtShape(
            12 + (i * (W - 24)) / Math.max(1, clothes.length - 1 || 1),
            19,
            14,
            g.slot === 'pants' ? 34 : 26,
            g.color,
            g.slot === 'pants' ? 'pants' : 'top',
          ),
      );
      ctx.fillStyle = '#4e342e';
      ctx.fillRect(4, H - 30, W - 8, 3);
      game.shopCatalog
        .filter((i?: GameValue): GameValue => i.slot === 'shoes' && ownsItem(i.id))
        .slice(0, 4)
        .forEach((g?: GameValue, i?: GameValue): GameValue => {
          ctx.fillStyle = g.color;
          ctx.fillRect(8 + i * 16, H - 20, 10, 5);
        });
    } else {
      ctx.strokeStyle = 'rgba(0,0,0,0.4)';
      ctx.lineWidth = 1.2;
      ctx.strokeRect(4, 6, W / 2 - 6, H - 18);
      ctx.strokeRect(W / 2 + 2, 6, W / 2 - 6, H - 18);
      if (lux || pre) {
        ctx.strokeStyle = lux ? '#e5c158' : '#c8ccd0';
        ctx.strokeRect(9, 13, W / 2 - 16, H - 32);
        ctx.strokeRect(W / 2 + 7, 13, W / 2 - 16, H - 32);
      }
      ctx.fillStyle = lux ? '#f1c40f' : pre ? '#dfe6e9' : '#2d3436';
      ctx.fillRect(W / 2 - 6, H * 0.42, 2.5, 16);
      ctx.fillRect(W / 2 + 3.5, H * 0.42, 2.5, 16);
    }
    ctx.fillStyle = 'rgba(0,0,0,0.3)';
    ctx.fillRect(0, H - 10, W, 10);
  });
  onFace(
    b,
    'right',
    (W?: GameValue, H?: GameValue): GameValue => woodGrain(W, H, 'rgba(0,0,0,0.13)', true, 5),
  );
  onFace(b, 'top', (W?: GameValue, H?: GameValue): GameValue => {
    ctx.fillStyle = 'rgba(255,255,255,0.08)';
    ctx.fillRect(0, 0, W, H);
  });
  // ante aperte: con l'armadio ruotato vanno disegnate dopo le altre parti
  if (openK > 0.02)
    drawDeferred(it.x, b.y1 + 25, b.z0 + 1, () => {
      // ante che ruotano sui cardini verso l'esterno
      const ang: GameValue = openK * Math.PI * 0.58;
      const leaf: GameValue = (b.x1 - b.x0) / 2 - 3;
      const zA: GameValue = b.z0 + 10,
        zB: GameValue = b.z1 - 6;
      const doorC: GameValue = lux ? '#8a4a1c' : pre ? '#6b4532' : '#b68562';
      const drawLeaf: GameValue = (
        hx?: GameValue,
        dir?: GameValue,
        shadeK?: GameValue,
      ): GameValue => {
        const ex: GameValue = hx + dir * leaf * Math.cos(ang),
          ey: GameValue = b.y1 + leaf * Math.sin(ang);
        const pts: GameValue = [
          isoProject(hx, b.y1, zA),
          isoProject(ex, ey, zA),
          isoProject(ex, ey, zB),
          isoProject(hx, b.y1, zB),
        ];
        poly(pts, game.darken(doorC, shadeK), 'rgba(0,0,0,0.45)');
        const k: GameValue = 0.82,
          hz: GameValue = zA + (zB - zA) * 0.5;
        const hp: GameValue = isoProject(
          hx + dir * leaf * Math.cos(ang) * k,
          b.y1 + leaf * Math.sin(ang) * k,
          hz,
        );
        game.view.ctx.fillStyle = lux ? '#f1c40f' : pre ? '#dfe6e9' : '#2d3436';
        game.view.ctx.fillRect(hp.x - 1.2, hp.y - 7, 2.4, 14);
      };
      drawLeaf(b.x0 + 3, 1, 0.05 + 0.15 * openK);
      drawLeaf(b.x1 - 3, -1, 0.2);
    });
}

export function drawDesk(it?: GameValue, t?: GameValue): GameValue {
  const ctx = game.view.ctx;
  const Z: GameValue = it.zb || 0,
    lux: GameValue = isLux(it);
  const { x, y, w, h }: GameValue = it;
  const deskH: GameValue = Math.max(20, it.z - 20);
  const pre = isPremium(it);
  const legC: GameValue = lux ? '#2c2c54' : pre ? '#b2bec3' : '#4a4a4a';
  [
    [-1, -1],
    [1, -1],
    [-1, 1],
    [1, 1],
  ].forEach(
    ([sx, sy]: GameValue = {}): GameValue =>
      box(x + sx * (w / 2 - 4), y + sy * (h / 2 - 4), 5, 5, deskH, legC, { z0: Z }),
  );
  const top: GameValue = box(x, y, w, h, 5, lux ? '#1e1e2e' : pre ? '#5d4037' : '#c8a27a', {
    z0: Z + deskH,
  });
  onFace(top, 'top', (W?: GameValue, H?: GameValue): GameValue => {
    if (!lux) woodGrain(W, H, 'rgba(0,0,0,0.1)', false, 5);
  });
  if (lux)
    // striscia luminosa su tutti i lati (con la scrivania girata si vedono anche retro e fianco)
    ['left', 'right', 'back', 'west'].forEach(
      (f?: GameValue): GameValue =>
        onFace(top, f, (W?: GameValue, H?: GameValue): GameValue => {
          ctx.fillStyle = `hsl(${(t * 90) % 360},90%,60%)`;
          ctx.fillRect(0, H - 2, W, 2);
        }),
    );
  const tz: GameValue = Z + deskH + 5;
  box(x, y - h * 0.28, 5, 5, 6, '#333', { z0: tz });
  const mon: GameValue = box(x, y - h * 0.28, w * (pre ? 0.66 : 0.55), 4, pre ? 28 : 26, '#111', {
    z0: tz + 6,
  });
  onFace(mon, 'left', (W?: GameValue, H?: GameValue): GameValue => {
    const g: GameValue = ctx.createLinearGradient(0, 0, W, H);
    g.addColorStop(0, lux ? '#6c5ce7' : pre ? '#00b894' : '#0984e3');
    g.addColorStop(1, lux ? '#00cec9' : pre ? '#81ecec' : '#74b9ff');
    ctx.fillStyle = g;
    ctx.fillRect(2, 2, W - 4, H - 4);
    ctx.fillStyle = 'rgba(255,255,255,0.65)';
    for (let i: GameValue = 0; i < 4; i++)
      ctx.fillRect(5, 5 + i * 5, (W - 14) * (0.35 + 0.5 * rnd(i + 3)), 1.5);
  });
  box(x, y + h * 0.12, w * 0.45, 10, 2, '#dfe6e9', { z0: tz });
  box(x + w * 0.32, y + h * 0.1, 6, 8, 2, '#dfe6e9', { z0: tz });
  if (pre) {
    // lampada da scrivania cromata e tazza
    box(x - w * 0.36, y - h * 0.2, 3, 3, 16, '#b2bec3', { z0: tz });
    box(x - w * 0.36 + 4, y - h * 0.2, 9, 6, 4, '#dfe6e9', { z0: tz + 14 });
    box(x + w * 0.38, y - h * 0.15, 5, 5, 5, '#ffffff', { z0: tz });
  }
}

export function drawNightstand(it?: GameValue): GameValue {
  const ctx = game.view.ctx;
  const Z: GameValue = it.zb || 0,
    lux: GameValue = isLux(it);
  const pre = isPremium(it);
  const c: GameValue = lux ? '#eceff1' : pre ? '#5d4037' : '#a47148';
  const b: GameValue = box(it.x, it.y, it.w, it.h, it.z, c, { z0: Z });
  onFace(b, 'left', (W?: GameValue, H?: GameValue): GameValue => {
    if (lux) {
      ctx.strokeStyle = 'rgba(120,120,140,0.25)';
      ctx.beginPath();
      ctx.moveTo(2, H * 0.2);
      ctx.bezierCurveTo(W * 0.4, H * 0.5, W * 0.6, H * 0.1, W, H * 0.6);
      ctx.stroke();
    } else woodGrain(W, H, 'rgba(0,0,0,0.15)', false, 4);
    ctx.strokeStyle = 'rgba(0,0,0,0.35)';
    ctx.lineWidth = 1;
    ctx.strokeRect(3, 3, W - 6, H / 2 - 4);
    ctx.strokeRect(3, H / 2 + 1, W - 6, H / 2 - 6);
    ctx.fillStyle = lux ? '#d4ac0d' : pre ? '#dfe6e9' : '#2d3436';
    ctx.fillRect(W / 2 - 3, H / 4 - 1, 6, 2.5);
    ctx.fillRect(W / 2 - 3, H * 0.75 - 2, 6, 2.5);
  });
  if (!it.zb) {
    const ck: GameValue = box(it.x, it.y, 14, 7, 8, '#2d3436', { z0: Z + it.z });
    onFace(ck, 'left', (_W?: GameValue, H?: GameValue): GameValue => {
      ctx.fillStyle = '#ff4757';
      ctx.font = 'bold 5px monospace';
      ctx.fillText(gameClockText(), 1, H - 2);
    });
  }
}

export function drawLamp(it?: GameValue, _t?: GameValue, lights?: GameValue): GameValue {
  const ctx = game.view.ctx;
  const Z: GameValue = it.zb || 0,
    lux: GameValue = isLux(it);
  box(it.x, it.y, it.w * 0.7, it.h * 0.7, 3, '#2d3436', { z0: Z });
  const pre = isPremium(it);
  box(it.x, it.y, 3, 3, it.z - 22, lux ? '#d4ac0d' : pre ? '#dfe6e9' : '#7f8c8d', { z0: Z + 3 });
  const shade = lux ? '#f7dc6f' : pre ? '#fdfefe' : '#f5ecd7';
  const sh: GameValue = box(it.x, it.y, it.w * 0.85, it.h * 0.85, 20, shade, {
    z0: Z + it.z - 20,
    edge: 'rgba(0,0,0,0.15)',
  });
  onFace(sh, 'left', (W?: GameValue, H?: GameValue): GameValue => {
    const g: GameValue = ctx.createLinearGradient(0, 0, 0, H);
    g.addColorStop(0, 'rgba(255,240,180,0)');
    g.addColorStop(1, 'rgba(255,214,120,0.55)');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, W, H);
  });
  if (lights && !it.zb)
    lights.push({
      x: it.x,
      y: it.y,
      z: it.z,
      r: LAMP_LIGHT[lux ? 'lux' : pre ? 'premium' : 'std'],
      color: '255,206,130',
    });
}

/** Altezza dei cuscini del divano (dove si siede), come la disegna drawSofa. */
export function sofaSeatZ(it: GameValue): number {
  return (it.zb || 0) + (isPremium(it) ? 3 : 0) + it.z * 0.45;
}

/** Altezza della seduta delle sedie (tavolini, sala d'attesa, scrivania). */
export const CHAIR_SEAT_Z = 14;

export function drawSofa(it?: GameValue): GameValue {
  const ctx = game.view.ctx;
  const Z: GameValue = it.zb || 0,
    lux: GameValue = isLux(it);
  const pre = isPremium(it);
  const c: GameValue = it.color,
    { x, y, w, h }: GameValue = it;
  const arm: GameValue = Math.max(6, w * 0.11);
  if (pre)
    // piedini in legno
    [-1, 1].forEach((sx) =>
      [-1, 1].forEach((sy) =>
        box(x + sx * (w / 2 - 4), y + sy * (h / 2 - 5), 4, 4, 4, '#4e2f1c', { z0: Z }),
      ),
    );
  const Zs = pre ? Z + 3 : Z;
  const back: GameValue = box(x, y - h / 2 + 6, w, 12, it.z, game.darken(c, 0.05), { z0: Zs });
  onFace(back, 'left', (W?: GameValue, _H?: GameValue): GameValue => {
    if (lux || pre) {
      ctx.fillStyle = lux ? 'rgba(255,255,255,0.4)' : 'rgba(0,0,0,0.35)';
      for (let i: GameValue = 0; i < 4; i++)
        for (let j: GameValue = 0; j < 2; j++) {
          ctx.beginPath();
          ctx.arc((W * (i + 0.5)) / 4, 6 + j * 8, 1.2, 0, 6.3);
          ctx.fill();
        }
    }
  });
  box(x - w / 2 + arm / 2, y + 4, arm, h - 8, it.z * 0.65, c, { z0: Zs });
  const seat: GameValue = box(x, y + 5, w - arm * 2, h - 14, it.z * 0.45, c, { z0: Zs });
  onFace(seat, 'top', (W?: GameValue, H?: GameValue): GameValue => {
    ctx.strokeStyle = 'rgba(0,0,0,0.25)';
    ctx.lineWidth = 1;
    for (let i: GameValue = 1; i < 3; i++) {
      ctx.beginPath();
      ctx.moveTo((W * i) / 3, 0);
      ctx.lineTo((W * i) / 3, H);
      ctx.stroke();
    }
  });
  if (!it.zb)
    box(
      x - w * 0.22,
      y - h / 2 + 16,
      14,
      6,
      12,
      lux ? '#f5d76e' : pre ? '#f5f6fa' : game.lighten(c, 0.4),
      { z0: Zs + it.z * 0.45 },
    );
  box(x + w / 2 - arm / 2, y + 4, arm, h - 8, it.z * 0.65, c, { z0: Zs });
}

export function drawTV(it?: GameValue, t?: GameValue, lights?: GameValue): GameValue {
  const ctx = game.view.ctx;
  const Z: GameValue = it.zb || 0,
    lux: GameValue = isLux(it);
  const { x, y, w, h }: GameValue = it;
  const standH: GameValue = Math.min(18, it.z * 0.3);
  const pre = isPremium(it);
  const stand: GameValue = box(x, y, w, h, standH, lux ? '#1b1b1b' : pre ? '#3e2723' : '#6d4c41', {
    z0: Z,
  });
  onFace(stand, 'left', (W?: GameValue, H?: GameValue): GameValue => {
    ctx.strokeStyle = 'rgba(255,255,255,0.14)';
    ctx.strokeRect(3, 3, W / 2 - 5, H - 6);
    ctx.strokeRect(W / 2 + 2, 3, W / 2 - 5, H - 6);
  });
  box(x, y - 4, 6, 4, 4, '#222', { z0: Z + standH });
  const scr: GameValue = box(
    x,
    y - 4,
    w * (lux ? 1.05 : pre ? 0.98 : 0.9),
    3,
    it.z - standH - 4,
    '#0b0b0b',
    {
      z0: Z + standH + 4,
    },
  );
  onFace(scr, 'left', (W?: GameValue, H?: GameValue): GameValue => {
    const hue: GameValue = (t * 35) % 360;
    const g: GameValue = ctx.createLinearGradient(0, 0, W, H);
    g.addColorStop(0, `hsl(${hue},70%,48%)`);
    g.addColorStop(1, `hsl(${(hue + 120) % 360},70%,32%)`);
    ctx.fillStyle = g;
    ctx.fillRect(1.5, 1.5, W - 3, H - 3);
    ctx.fillStyle = 'rgba(255,255,255,0.85)';
    ctx.beginPath();
    ctx.arc(W * (0.3 + 0.4 * ((t * 0.05) % 1)), H * 0.32, H * 0.12, 0, 6.3);
    ctx.fill();
    ctx.fillStyle = 'rgba(0,0,0,0.35)';
    ctx.beginPath();
    ctx.moveTo(1.5, H - 1.5);
    ctx.quadraticCurveTo(W * 0.3, H * 0.4, W * 0.62, H - 1.5);
    ctx.fill();
    ctx.fillStyle = 'rgba(255,255,255,0.08)';
    ctx.fillRect(1.5, 1.5, W * 0.35, H - 3);
  });
  if (lights && !it.zb)
    lights.push({
      ...worldPoint(x, y + 20),
      z: 20,
      r: lux ? 110 : pre ? 95 : 80,
      color: '130,170,255',
    });
}

export function drawPlant(it?: GameValue, t?: GameValue): GameValue {
  const ctx = game.view.ctx;
  const Z: GameValue = it.zb || 0,
    lux: GameValue = isLux(it),
    s: GameValue = isoScale();
  const sz: GameValue = Math.min(it.w, it.h);
  let top: GameValue;
  if (lux) {
    box(it.x, it.y, it.w, it.h * 0.8, 6, '#34495e', { z0: Z });
    box(it.x, it.y, 4, 4, 18, '#6d4c41', { z0: Z + 6 });
    top = isoProject(it.x, it.y, Z + 26);
    [
      [-8, 2, 7],
      [7, -2, 8],
      [0, -7, 6],
    ].forEach(([dx, dy, r]: GameValue = {}, _i?: GameValue): GameValue => {
      const g: GameValue = ctx.createRadialGradient(
        top.x + dx * s - 2,
        top.y + dy * s - 3,
        1,
        top.x + dx * s,
        top.y + dy * s,
        r * s * 1.3,
      );
      g.addColorStop(0, '#76d7a1');
      g.addColorStop(1, '#117a65');
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.ellipse(top.x + dx * s, top.y + dy * s, r * 1.4 * s, r * 0.8 * s, 0, 0, 6.3);
      ctx.fill();
    });
    return;
  }
  if (isPremium(it)) {
    const vase: GameValue = box(it.x, it.y, sz * 0.7, sz * 0.7, 16, '#ecf0f1', { z0: Z });
    onFace(vase, 'left', (W?: GameValue, H?: GameValue): GameValue => {
      ctx.fillStyle = '#2e86de';
      ctx.fillRect(0, H * 0.35, W, 2.5);
      ctx.fillRect(0, H * 0.6, W, 1.2);
    });
    onFace(vase, 'right', (W?: GameValue, H?: GameValue): GameValue => {
      ctx.fillStyle = '#2e86de';
      ctx.fillRect(0, H * 0.35, W, 2.5);
    });
    top = isoProject(it.x, it.y, Z + 16);
    const kk: GameValue = (it.z / 55) * s;
    for (let i = 0; i < 9; i++) {
      const a = -Math.PI / 2 + (i - 4) * 0.36 + Math.sin(t * 1.2 + i) * 0.04;
      const len = (20 + rnd(i + 11) * 10) * kk;
      const cx = top.x + Math.cos(a) * len * 0.55,
        cy = top.y + Math.sin(a) * len * 0.55;
      ctx.strokeStyle = '#145a32';
      ctx.lineWidth = 1 * kk;
      ctx.beginPath();
      ctx.moveTo(top.x, top.y);
      ctx.lineTo(cx, cy);
      ctx.stroke();
      ctx.fillStyle = i % 2 ? '#1e8449' : '#239b56';
      ctx.beginPath();
      ctx.ellipse(cx, cy, len * 0.38, 6 * kk, a, 0, 6.3);
      ctx.fill();
      // tagli tipici delle foglie di monstera
      ctx.strokeStyle = 'rgba(255,255,255,0.35)';
      ctx.lineWidth = 0.8;
      for (const f of [-0.5, 0, 0.5]) {
        const px = cx + Math.cos(a) * len * 0.15 * f,
          py = cy + Math.sin(a) * len * 0.15 * f;
        ctx.beginPath();
        ctx.moveTo(px, py);
        ctx.lineTo(px + Math.cos(a + 1.4) * 4 * kk, py + Math.sin(a + 1.4) * 4 * kk);
        ctx.stroke();
      }
    }
    return;
  }
  const pot: GameValue = box(
    it.x,
    it.y,
    sz * 0.75,
    sz * 0.75,
    Math.max(10, it.z * 0.32),
    '#c0623b',
    { z0: Z },
  );
  onFace(pot, 'left', (W?: GameValue, _H?: GameValue): GameValue => {
    ctx.fillStyle = 'rgba(255,255,255,0.18)';
    ctx.fillRect(0, 0, W, 3);
  });
  onFace(pot, 'top', (W?: GameValue, H?: GameValue): GameValue => {
    ctx.fillStyle = '#3e2723';
    ctx.fillRect(1.5, 1.5, W - 3, H - 3);
  });
  top = isoProject(it.x, it.y, Z + pot.d);
  const k: GameValue = (it.z / 55) * s;
  for (let i: GameValue = 0; i < 8; i++) {
    const a: GameValue = -Math.PI / 2 + (i - 3.5) * 0.32 + Math.sin(t * 1.4 + i) * 0.04;
    const len: GameValue = (16 + rnd(i + 2) * 10) * k;
    ctx.fillStyle = i % 2 ? '#2e8b57' : '#3cb371';
    ctx.beginPath();
    ctx.ellipse(
      top.x + Math.cos(a) * len * 0.5,
      top.y + Math.sin(a) * len * 0.5,
      len * 0.55,
      3.2 * k,
      a,
      0,
      6.3,
    );
    ctx.fill();
  }
}

export function drawSafe(it?: GameValue): GameValue {
  const ctx = game.view.ctx;
  const Z: GameValue = it.zb || 0;
  const b: GameValue = box(it.x, it.y, it.w, it.h, it.z, '#4b5563', { z0: Z });
  onFace(b, 'left', (W?: GameValue, H?: GameValue): GameValue => {
    const g: GameValue = ctx.createLinearGradient(0, 0, W, H);
    g.addColorStop(0, '#7b8794');
    g.addColorStop(1, '#3a4250');
    ctx.fillStyle = g;
    ctx.fillRect(4, 4, W - 8, H - 8);
    ctx.strokeStyle = 'rgba(0,0,0,0.55)';
    ctx.lineWidth = 1;
    ctx.strokeRect(4, 4, W - 8, H - 8);
    ctx.fillStyle = '#e5e7eb';
    ctx.beginPath();
    ctx.arc(W * 0.45, H * 0.45, 7, 0, 6.3);
    ctx.fill();
    ctx.strokeStyle = '#111';
    ctx.beginPath();
    ctx.arc(W * 0.45, H * 0.45, 4.5, 0, 6.3);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(W * 0.45, H * 0.45);
    ctx.lineTo(W * 0.45 + 4, H * 0.45 - 3);
    ctx.stroke();
    ctx.fillStyle = '#cbd5e1';
    ctx.fillRect(W * 0.76, H * 0.32, 3, 13);
    ctx.fillStyle = '#1f2937';
    ctx.fillRect(5, H * 0.2, 2, 6);
    ctx.fillRect(5, H * 0.7, 2, 6);
  });
}

export function drawStove(it?: GameValue): GameValue {
  const ctx = game.view.ctx;
  const cooking: GameValue = game.player.hasFoodInInventory || game.player.foodIsCooked;
  drawSteelStove(it, game.player.foodIsCooked ? 0.6 : 0.1, !!cooking);
  if (cooking) {
    const pot: GameValue = box(it.x - it.w * 0.22, it.y + it.h * 0.22, 20, 20, 12, '#b2bec3', {
      z0: it.z,
    });
    onFace(pot, 'top', (W?: GameValue, H?: GameValue): GameValue => {
      ctx.fillStyle = game.player.foodIsCooked ? '#e17055' : '#fdcb6e';
      ctx.fillRect(2, 2, W - 4, H - 4);
    });
    if (game.player.foodIsCooked) {
      const p: GameValue = isoProject(it.x - it.w * 0.22, it.y + it.h * 0.22, it.z + 14),
        s: GameValue = isoScale(),
        tt: GameValue = performance.now() / 1000;
      for (let i: GameValue = 0; i < 3; i++) {
        const ph: GameValue = (tt * 0.6 + i / 3) % 1;
        ctx.fillStyle = `rgba(255,255,255,${0.5 * (1 - ph)})`;
        ctx.beginPath();
        ctx.arc(p.x + Math.sin(ph * 6 + i) * 4 * s, p.y - ph * 30 * s, (3 + ph * 5) * s, 0, 6.3);
        ctx.fill();
      }
    }
  }
}

// ---------------------------------------------------------------- frigorifero

export function roundRect(ctx: GameValue, x: number, y: number, w: number, h: number, r: number) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

export function drawToilet(it?: GameValue, t?: GameValue): GameValue {
  const ctx = game.view.ctx;
  const ty = it.y - it.h / 2 + 8;
  // cassetta, con il coperchio e il pulsante cromato dello scarico
  const tank: GameValue = box(it.x, ty, it.w * 0.8, 14, 40, '#ffffff');
  onFace(tank, 'left', (W?: GameValue, H?: GameValue): GameValue => {
    ctx.fillStyle = 'rgba(0,0,0,0.05)';
    ctx.fillRect(0, H - 6, W, 6);
  });
  const lid: GameValue = box(it.x, ty, it.w * 0.8 + 3, 16, 3, '#f1f2f6', { z0: 40 });
  onFace(lid, 'top', (W?: GameValue, H?: GameValue): GameValue => {
    ctx.fillStyle = '#95a5a6';
    ctx.beginPath();
    ctx.ellipse(W / 2, H / 2, 4.5, 3.2, 0, 0, 6.3);
    ctx.fill();
    ctx.fillStyle = '#dfe6e9';
    ctx.beginPath();
    ctx.ellipse(W / 2, H / 2, 3, 2, 0, 0, 6.3);
    ctx.fill();
  });
  // coperchio della tazza alzato, appoggiato alla cassetta
  const up: GameValue = box(it.x, ty + 9, it.w * 0.5, 2, 22, '#fafbfc', { z0: 17 });
  onFace(up, 'left', (W?: GameValue, H?: GameValue): GameValue => {
    ctx.strokeStyle = 'rgba(0,0,0,0.12)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.roundRect ? ctx.roundRect(2, 2, W - 4, H - 4, 5) : ctx.rect(2, 2, W - 4, H - 4);
    ctx.stroke();
  });
  // piede stretto e tazza sopra, con l'asse
  box(it.x, it.y + 4, it.w * 0.32, it.h * 0.4, 12, '#e9ecf1');
  const base: GameValue = box(it.x, it.y + 6, it.w * 0.55, it.h * 0.58, 7, '#f5f6fa', { z0: 11 });
  onFace(base, 'top', (W?: GameValue, H?: GameValue): GameValue => {
    ctx.fillStyle = '#ffffff';
    ctx.beginPath();
    ctx.ellipse(W / 2, H / 2, W / 2, H / 2, 0, 0, 6.3);
    ctx.fill();
    ctx.strokeStyle = 'rgba(0,0,0,0.12)';
    ctx.lineWidth = 1;
    ctx.stroke();
    ctx.fillStyle = '#dcdde1';
    ctx.beginPath();
    ctx.ellipse(W / 2, H / 2, W / 2.6, H / 2.6, 0, 0, 6.3);
    ctx.fill();
    ctx.fillStyle = '#9ad0f5';
    ctx.beginPath();
    ctx.ellipse(W / 2, H / 2, W / 3.3, H / 3.3, 0, 0, 6.3);
    ctx.fill();
    // scarico: l'acqua gira nel water per un secondo e mezzo
    const since = (t || 0) - game.toiletFlushAt;
    if (since >= 0 && since < 1.5) {
      const k = 1 - since / 1.5;
      ctx.strokeStyle = `rgba(255,255,255,${0.85 * k})`;
      ctx.lineWidth = 1.4;
      for (let i = 0; i < 3; i++) {
        const a0 = since * 9 + (i * Math.PI * 2) / 3;
        ctx.beginPath();
        ctx.ellipse(
          W / 2,
          H / 2,
          (W / 3.6) * (0.4 + 0.25 * i),
          (H / 3.6) * (0.4 + 0.25 * i),
          0,
          a0,
          a0 + 2.2,
        );
        ctx.stroke();
      }
    }
  });
  // sul coperchio della cassetta: una piantina grassa e il deodorante per ambienti
  const ax = it.w * 0.28;
  box(it.x - ax, ty, 6, 6, 5, '#e17055', { z0: 43 });
  // foglie carnose a raggiera che escono dal vaso
  const sc: number = isoScale();
  const c = isoProject(it.x - ax, ty, 48);
  for (let k = 0; k < 7; k++) {
    const a = -Math.PI / 2 + (k - 3) * 0.42;
    const len = (k % 2 ? 5 : 7) * sc;
    ctx.fillStyle = k % 2 ? '#7bc67e' : '#4e9f52';
    ctx.beginPath();
    ctx.moveTo(c.x - 1.3 * sc, c.y);
    ctx.lineTo(c.x + Math.cos(a) * len, c.y + Math.sin(a) * len);
    ctx.lineTo(c.x + 1.3 * sc, c.y);
    ctx.closePath();
    ctx.fill();
  }
  box(it.x + ax, ty, 4, 4, 9, '#a29bfe', { z0: 43 });
  box(it.x + ax, ty, 2, 2, 2, '#dfe6e9', { z0: 52 });
}

export function drawSink(it?: GameValue, t?: GameValue): GameValue {
  const ctx = game.view.ctx;
  const cab: GameValue = box(it.x, it.y, it.w, it.h, it.z - 5, it.color || '#0984e3');
  onFace(cab, 'left', (W?: GameValue, H?: GameValue): GameValue => {
    ctx.strokeStyle = 'rgba(255,255,255,0.35)';
    ctx.strokeRect(3, 3, W / 2 - 4, H - 6);
    ctx.strokeRect(W / 2 + 1, 3, W / 2 - 4, H - 6);
    ctx.fillStyle = '#dfe6e9';
    ctx.fillRect(W / 2 - 5, H * 0.3, 2, 8);
    ctx.fillRect(W / 2 + 3, H * 0.3, 2, 8);
  });
  const top: GameValue = box(it.x, it.y, it.w + 4, it.h + 4, 5, '#f5f6fa', { z0: it.z - 5 });
  onFace(top, 'top', (W?: GameValue, H?: GameValue): GameValue => {
    ctx.fillStyle = '#c8d6e5';
    ctx.beginPath();
    ctx.ellipse(W / 2, H / 2 + 2, W * 0.32, H * 0.3, 0, 0, 6.3);
    ctx.fill();
    ctx.fillStyle = '#74b9ff';
    ctx.beginPath();
    ctx.ellipse(W / 2, H / 2 + 3, W * 0.22, H * 0.18, 0, 0, 6.3);
    ctx.fill();
  });
  box(it.x, it.y - it.h / 2 + 5, 4, 4, 12, '#b2bec3', { z0: it.z });
  box(it.x, it.y - it.h / 2 + 9, 4, 9, 3, '#b2bec3', { z0: it.z + 9 });
  if (game.frameSinkRunning) drawSinkWater(it, t || 0);
}

/** Acqua che scende dal rubinetto e schizzi nel lavandino. */
function drawSinkWater(it: GameValue, t: number): void {
  const ctx = game.view.ctx;
  const s: number = isoScale();
  const top = isoProject(it.x, it.y - it.h / 2 + 13, it.z + 9),
    bottom = isoProject(it.x, it.y - it.h / 2 + 13, it.z - 1);
  const g = ctx.createLinearGradient(0, top.y, 0, bottom.y);
  g.addColorStop(0, 'rgba(116,185,255,0.95)');
  g.addColorStop(1, 'rgba(116,185,255,0.5)');
  ctx.strokeStyle = g;
  ctx.lineWidth = 2.2 * s;
  ctx.lineCap = 'round';
  ctx.beginPath();
  ctx.moveTo(top.x, top.y);
  ctx.lineTo(bottom.x + Math.sin(t * 20) * 0.4 * s, bottom.y);
  ctx.stroke();
  for (let i = 0; i < 6; i++) {
    const k = (t * 2.2 + i / 6) % 1;
    const a = i * 1.9;
    const p = isoProject(
      it.x + Math.cos(a) * (3 + 7 * k),
      it.y - it.h / 2 + 13 + Math.sin(a) * (3 + 6 * k),
      it.z - 1 + Math.sin(k * Math.PI) * 4,
    );
    ctx.fillStyle = `rgba(200,230,255,${0.9 * (1 - k)})`;
    ctx.beginPath();
    ctx.arc(p.x, p.y, 1.1 * s, 0, 6.3);
    ctx.fill();
  }
  ctx.lineCap = 'butt';
}

export function drawShower(it?: GameValue, t?: GameValue): GameValue {
  const ctx = game.view.ctx;
  const sc: GameValue = isoScale();
  box(it.x, it.y, it.w, it.h, 6, '#dfe6e9');
  const H: GameValue = it.z;
  box(it.x - it.w / 2 + 6, it.y - it.h / 2 + 6, 3, 3, H - 12, '#b2bec3', { z0: 6 });
  box(it.x - it.w / 2 + 14, it.y - it.h / 2 + 8, 16, 8, 3, '#b2bec3', { z0: H - 12 });
  const occ: GameValue = game.frameShowerActors;
  if (occ.length) {
    occ.forEach((a?: GameValue): GameValue => {
      ctx.save();
      ctx.translate(0, -6 * sc);
      drawPlayerAvatar(a.x, a.y, '', t, a.look, false, '');
      ctx.restore();
    });
    drawShowerWater(it, t, occ);
  }
  const glass: GameValue = box(it.x, it.y, it.w, it.h, H - 6, '#81ecec', {
    z0: 6,
    top: 'rgba(255,255,255,0.06)',
    left: 'rgba(129,236,236,0.22)',
    right: 'rgba(129,236,236,0.15)',
    edge: 'rgba(255,255,255,0.65)',
  });
  ['left', 'right'].forEach(
    (f?: GameValue): GameValue =>
      onFace(glass, f, (W?: GameValue, Hh?: GameValue): GameValue => {
        if (game.showerFog > 0.01) {
          ctx.fillStyle = 'rgba(235,245,250,' + 0.5 * game.showerFog + ')';
          ctx.fillRect(0, 0, W, Hh);
        }
        ctx.strokeStyle = 'rgba(255,255,255,0.45)';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(W * 0.15, Hh * 0.25);
        ctx.lineTo(W * 0.4, Hh * 0.08);
        ctx.moveTo(W * 0.2, Hh * 0.45);
        ctx.lineTo(W * 0.55, Hh * 0.18);
        ctx.stroke();
      }),
  );
  if (game.showerFog > 0.01) {
    // vapore che sale sopra il box
    for (let i: GameValue = 0; i < 6; i++) {
      const ph: GameValue = (t * 0.25 + i / 6) % 1;
      const p: GameValue = isoProject(
        it.x + Math.sin(t * 0.7 + i * 2) * 14,
        it.y + Math.cos(t * 0.6 + i * 1.7) * 10,
        40 + ph * 110,
      );
      ctx.fillStyle = 'rgba(245,250,255,' + game.showerFog * 0.4 * Math.sin(Math.PI * ph) + ')';
      ctx.beginPath();
      ctx.arc(p.x, p.y, (9 + ph * 16) * sc, 0, 6.3);
      ctx.fill();
    }
  }
}

export function drawCounter(it?: GameValue): GameValue {
  const ctx = game.view.ctx;
  const b: GameValue = box(it.x, it.y, it.w, it.h, it.z - 5, it.color || '#d35400');
  onFace(b, 'left', (W?: GameValue, H?: GameValue): GameValue => {
    woodGrain(W, H, 'rgba(0,0,0,0.15)', true, 10);
    ctx.fillStyle = 'rgba(255,255,255,0.9)';
    ctx.font = 'bold 9px sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText(it.label || 'CASSA', W / 2, H / 2 + 3);
  });
  box(it.x, it.y, it.w + 6, it.h + 6, 5, '#f5f6fa', { z0: it.z - 5 });
  const reg: GameValue = box(it.x + it.w * 0.28, it.y, 22, 16, 12, '#2d3436', { z0: it.z });
  onFace(reg, 'left', (W?: GameValue, _H?: GameValue): GameValue => {
    ctx.fillStyle = '#55efc4';
    ctx.fillRect(3, 2, W - 6, 5);
  });
}

export function drawShelf(it?: GameValue, t?: GameValue): GameValue {
  const ctx = game.view.ctx;
  const plat: GameValue = box(it.x, it.y, it.w, it.h, 12, '#f5f6fa');
  // Espone il prossimo acquisto (standard → pregiato → lusso); col lusso già preso mostra quello.
  const def: GameValue =
    nextUpgrade(game.furnitureCatalog, game.player.ownedFurniture, it.category) ||
    tiersOf(game.furnitureCatalog, it.category).at(-1);
  if (!def) return;
  onFace(plat, 'left', (W?: GameValue, H?: GameValue): GameValue => {
    ctx.fillStyle = { std: '#ff4757', premium: '#8e44ad', lux: '#f1c40f' }[tierOf(def)];
    ctx.fillRect(W / 2 - 13, 2, 26, H - 4);
    ctx.fillStyle = '#fff';
    ctx.font = 'bold 7px sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText(def.price + 'Đ', W / 2, H - 4);
  });
  const pd: GameValue = def.propData;
  const k: GameValue = Math.min((it.w - 8) / pd.w, (it.h - 8) / pd.h, 1);
  const mini: GameValue = Object.assign({}, pd, {
    x: it.x,
    y: it.y,
    w: pd.w * k,
    h: pd.h * k,
    z: pd.z * Math.max(k, 0.45),
    zb: 12,
  });
  drawFurnitureByKind(def.propKey, mini, t, null);
}

export function drawExitMat(it?: GameValue, text?: GameValue): GameValue {
  const ctx = game.view.ctx;
  const b: GameValue = box(it.x, it.y - 10, Math.max(it.w, 64), 28, 2, '#7a2828', {
    edge: 'rgba(0,0,0,0.3)',
  });
  onFace(b, 'top', (W?: GameValue, H?: GameValue): GameValue => {
    ctx.strokeStyle = 'rgba(255,255,255,0.4)';
    ctx.setLineDash([3, 2]);
    ctx.strokeRect(3, 3, W - 6, H - 6);
    ctx.setLineDash([]);
    ctx.fillStyle = '#fff';
    ctx.font = 'bold 8px sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText(text, W / 2, H / 2 + 3);
  });
}

// quanto si vede la freccia di ogni zerbino (0-1) e quando la si è disegnata l'ultima volta
const exitArrowFade = new Map<string, { a: number; t: number }>();

/**
 * Freccia per terra oltre il bordo della stanza, davanti allo zerbino, che punta fuori: c'è solo
 * quando lo zerbino porta fuori (appena arrivati è spento finché non ci si allontana). Compare e
 * sparisce sfumando e ondeggia verso l'uscita. Gli zerbini stanno tutti sul bordo davanti (+y).
 */
function drawExitArrow(k: string, it: GameValue, t: number): void {
  const key = game.view.activeEnvironment + ':' + k;
  const on = (game.openExits as string[]).includes(k);
  const prev = exitArrowFade.get(key);
  // cambiando ambiente si riparte da spenta, senza sfumare dal valore vecchio
  const fresh = !prev || t - prev.t > 0.5;
  const dt = fresh ? 0 : t - prev.t;
  const a = Math.max(0, Math.min(1, (fresh ? 0 : prev.a) + (on ? dt : -dt) * 4));
  exitArrowFade.set(key, { a, t });
  if (a <= 0) return;
  const ctx = game.view.ctx;
  // oltre il bordo davanti e oltre lo spessore del pavimento, che le passerebbe sopra
  const y = Math.max(game.Y1, it.y + 4) + 34 + 5 * Math.sin(t * 5);
  ctx.save();
  ctx.globalAlpha = a * (0.85 + 0.15 * Math.sin(t * 5));
  setPlane([it.x, y, 0.5], [1, 0, 0], [0, 1, 0]);
  // punta verso +y (fuori), larga 40 e lunga 26 unità
  ctx.beginPath();
  ctx.moveTo(-20, 0);
  ctx.lineTo(20, 0);
  ctx.lineTo(0, 26);
  ctx.closePath();
  ctx.fillStyle = '#ffffff';
  ctx.strokeStyle = 'rgba(0,0,0,0.55)';
  ctx.lineWidth = 2.5;
  ctx.lineJoin = 'round';
  ctx.stroke();
  ctx.fill();
  resetPlane();
  ctx.restore();
}

/**
 * Portone di casa verso il cortile: arco in pietra con vetrata, due ante in legno con pannelli e
 * maniglie in ottone, gradino davanti. È l'unica porta del salone che si apre da sola quando ci
 * si avvicina; dietro si intravede il cortile.
 */
function drawFrontDoor(it: GameValue): void {
  const ctx = game.view.ctx;
  const T = 10,
    H = 112;
  const W: number = it.w;
  const dy: number = game.Y0 + T / 2;
  // gradino di pietra davanti al portone: si disegna per primo, così le ante aperte ci passano sopra
  box(it.x, dy + T / 2 + 5, W + 10, 10, 2, '#a89f91', { top: '#bfb6a6' });
  const b: GameValue = box(it.x, dy, W, T, H, '#cfc6b4');
  const open = doorOpenAmount('saloon:courtyard', it.x, it.y, true, true);
  // misure sulla faccia (unità della scena, dall'alto): arco, imposta dell'arco, ante
  const side = 7,
    top = 14;
  const rw = (W - side * 2) / 2;
  const spring = top + rw; // dove finisce l'arco e iniziano le ante
  const leafH = H - spring;
  const wood = '#6b3e26';
  onFace(b, 'left', (FW: number, FH: number): void => {
    // cornice in pietra a conci
    ctx.fillStyle = '#d8d0bf';
    ctx.fillRect(0, 0, FW, FH);
    ctx.strokeStyle = 'rgba(0,0,0,0.12)';
    ctx.lineWidth = 0.8;
    for (let v = 0, r = 0; v < FH; v += 9, r++) {
      ctx.beginPath();
      ctx.moveTo(0, v);
      ctx.lineTo(side, v);
      ctx.moveTo(FW - side, v);
      ctx.lineTo(FW, v);
      ctx.stroke();
    }
    // vano ad arco: dietro, il cortile (cielo e prato) che si vede quando le ante si aprono
    const cx = FW / 2;
    ctx.save();
    ctx.beginPath();
    ctx.moveTo(side, FH);
    ctx.lineTo(side, spring);
    ctx.arc(cx, spring, rw, Math.PI, 0);
    ctx.lineTo(FW - side, FH);
    ctx.closePath();
    ctx.clip();
    const sky = ctx.createLinearGradient(0, top, 0, FH);
    sky.addColorStop(0, '#8fd3fe');
    sky.addColorStop(0.55, '#cdeffd');
    sky.addColorStop(0.56, '#6fbf4a');
    sky.addColorStop(1, '#4c9a34');
    ctx.fillStyle = sky;
    ctx.fillRect(side, top, FW - side * 2, FH - top);
    ctx.restore();
    // lunetta a vetri sopra le ante, con le razze
    ctx.fillStyle = 'rgba(205,238,253,0.85)';
    ctx.beginPath();
    ctx.arc(cx, spring, rw - 2, Math.PI, 0);
    ctx.fill();
    ctx.strokeStyle = wood;
    ctx.lineWidth = 1.6;
    ctx.beginPath();
    ctx.arc(cx, spring, rw - 2, Math.PI, 0);
    ctx.stroke();
    for (let i = 1; i < 4; i++) {
      const ang = Math.PI + (i / 4) * Math.PI;
      ctx.beginPath();
      ctx.moveTo(cx, spring);
      ctx.lineTo(cx + Math.cos(ang) * (rw - 2), spring + Math.sin(ang) * (rw - 2));
      ctx.stroke();
    }
    ctx.beginPath();
    ctx.arc(cx, spring, rw * 0.35, Math.PI, 0);
    ctx.stroke();
    ctx.fillStyle = wood;
    ctx.fillRect(side, spring - 1.5, FW - side * 2, 3);
    // chiave di volta con la targhetta
    ctx.fillStyle = '#c9bfa9';
    ctx.beginPath();
    ctx.moveTo(cx - 6, 0);
    ctx.lineTo(cx + 6, 0);
    ctx.lineTo(cx + 4, top + 2);
    ctx.lineTo(cx - 4, top + 2);
    ctx.fill();
    ctx.fillStyle = '#b8860b';
    ctx.fillRect(cx - 13, 2, 26, 8);
    ctx.fillStyle = '#fff6d5';
    ctx.font = 'bold 5px sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('CORTILE', cx, 8);
  });
  // le due ante girano sui cardini verso il salone
  PORTONE.draw(
    {
      hinge: [b.x0 + side, b.y1, b.z1 - spring - 1.5],
      along: [1, 0],
      normal: [0, 1],
      w: W - side * 2,
      h: leafH - 1.5,
    },
    { color: wood },
    open,
  );
}

export function drawSaloonDoor(key?: GameValue, it?: GameValue): GameValue {
  if (key === 'courtyard') return drawFrontDoor(it);
  const ctx = game.view.ctx;
  const thinX: GameValue = it.w < it.h;
  let doorC: GameValue = '#8d5a3b',
    sign: GameValue = '';
  if (it.roomIdx !== undefined) {
    const gi: GameValue = game.gRoomIdx(it);
    const room: GameValue = game.roomsState[gi];
    doorC =
      room && room.owner ? (gi === game.myAssignedRoomIdx ? '#2e86de' : '#27ae60') : '#7f8c8d';
    sign = String(gi + 1);
  } else if (key === 'courtyard') sign = '🌳';
  else if (key === 'kitchen') sign = '🍳';
  else if (key === 'bathroom') sign = '🚿';
  // La porta si disegna attaccata alla parete (o al bordo) più vicina, qualunque sia la misura della stanza
  const T = 8;
  const dx: number = thinX ? (it.x < 0 ? game.X0 + T / 2 : game.X1 - T / 2) : it.x;
  const dy: number = thinX ? it.y : it.y < 0 ? game.Y0 + T / 2 : game.Y1 - T / 2;
  const b: GameValue = box(dx, dy, thinX ? T : it.w, thinX ? it.h : T, 96, '#ecf0f1');
  // si apre avvicinandosi, per passarci camminando (le stanze vuote restano chiuse a chiave)
  const locked = it.roomIdx !== undefined && doorC === '#7f8c8d';
  const open = doorOpenAmount('saloon:' + key, it.x, it.y, !locked, true);
  // vano della porta: buio con un po' di luce calda dall'altra parte
  onFace(b, thinX ? 'right' : 'left', (FW: number, FH: number): void => {
    const g = ctx.createLinearGradient(0, 7, 0, FH);
    g.addColorStop(0, '#1e140e');
    g.addColorStop(1, '#5a3b22');
    ctx.fillStyle = g;
    ctx.fillRect(5, 7, FW - 10, FH - 7);
  });
  // l'anta riempie il vano (da 5 a W-5 lungo il muro, da 7 in giù) e si apre verso chi guarda
  const along: [number, number] = thinX ? [0, -1] : [1, 0];
  const ox: number = thinX ? b.x1 : b.x0;
  PANEL_DOOR.draw(
    {
      hinge: [ox + along[0] * 5, b.y1 + along[1] * 5, b.z1 - 7],
      along,
      normal: thinX ? [1, 0] : [0, 1],
      w: (thinX ? it.h : it.w) - 10,
      h: 96 - 7,
      // sui muri di lato i cardini stanno in fondo: aperta, l'anta resta dietro chi passa
      hingeEnd: thinX,
    },
    { color: doorC, sign },
    open,
  );
}

/**
 * Ingresso dei clienti su una parete (ristorante): porta a un'anta o portone (`model: 'portone'`),
 * sul muro di fondo (`side: 'back'`) o di sinistra. Si apre a chi entra o esce.
 */
export function drawWallEntranceProp(it?: GameValue): GameValue {
  const ctx = game.view.ctx;
  const T = 8;
  const back = it.side === 'back';
  const portone = it.model === 'portone';
  const H = portone ? 104 : 96;
  const span: number = back ? it.w : it.h;
  const b: GameValue = back
    ? box(it.x, game.Y0 + T / 2, span, T, H, '#ecf0f1')
    : box(game.X0 + T / 2, it.y, T, span, H, '#ecf0f1');
  // `locked`: non si apre avvicinandosi, solo quando ci passa qualcuno (la porta del capo)
  const open = doorOpenAmount(it.door || 'entrance', it.x, it.y, true, !it.locked);
  // fuori è giorno: dal vano entra luce
  onFace(b, back ? 'left' : 'right', (FW: number, FH: number): void => {
    const g = ctx.createLinearGradient(0, 7, 0, FH);
    g.addColorStop(0, '#cfe9f7');
    g.addColorStop(1, '#f6eedc');
    ctx.fillStyle = g;
    ctx.fillRect(5, 7, FW - 10, FH - 7);
  });
  const place = back
    ? {
        hinge: [b.x0 + 5, b.y1, b.z1 - 7] as [number, number, number],
        along: [1, 0] as [number, number],
        normal: [0, 1] as [number, number],
      }
    : {
        hinge: [b.x1, b.y1 - 5, b.z1 - 7] as [number, number, number],
        along: [0, -1] as [number, number],
        normal: [1, 0] as [number, number],
        hingeEnd: true,
      };
  (portone ? PORTONE : PANEL_DOOR).draw(
    { ...place, w: span - 10, h: H - 7 },
    { color: it.color || '#7b4a2e', sign: it.sign || '' },
    open,
  );
}

export function drawFurnitureByKind(
  kind?: GameValue,
  it?: GameValue,
  t?: GameValue,
  lights?: GameValue,
): GameValue {
  const f: GameValue = game.FURNITURE_DRAW[kind];
  if (f) f(it, t, lights);
  else box(it.x, it.y, it.w, it.h, it.z || 40, it.color || '#888888', { z0: it.zb || 0 });
}

export function drawMapItem(
  k?: GameValue,
  item?: GameValue,
  t?: GameValue,
  lights?: GameValue,
): GameValue {
  if (k === game.movingPropKey) {
    // evidenzia l'ingombro a terra (già ruotato) del mobile che si sta spostando
    const fp: GameValue = footprintOf(item);
    setPlane([item.x - fp.w / 2, item.y - fp.h / 2, 0], [1, 0, 0], [0, 1, 0]);
    game.view.ctx.fillStyle = `rgba(254,202,87,${0.35 + 0.2 * Math.sin(t * 6)})`;
    game.view.ctx.fillRect(-4, -4, fp.w + 8, fp.h + 8);
    resetPlane();
  }
  if (k === 'doorExit' || k === 'exitHouse') {
    drawExitMat(item, k === 'exitHouse' ? 'ESCI DI CASA' : 'USCITA');
    return drawExitArrow(k, item, t);
  }
  // Gli oggetti da parete (il quadro) si disegnano sulla parete, non sul pavimento.
  if (item.wallItem) return;
  if (game.view.activeEnvironment === 'CORTILE') return drawCourtyardDoor(k, item);
  if (game.view.activeEnvironment === 'SALOON') return drawSaloonDoor(k, item);
  if (game.view.activeEnvironment === 'negozio_vestiti') {
    softShadow(item.x, item.y, item.w, item.h);
    return drawBoutiqueItem(k, item, t);
  }
  if (k.startsWith('shelf')) return drawShelf(item, t);
  // negozio di mobili: ogni modello sulla sua pedana, alla misura reale
  if (item.showId) return drawShowroomItem(item, t, lights);
  // Piante e lampade sono uguali da ogni lato: la rotazione non cambia il loro aspetto.
  // Anche le casette degli animali (gabbie, teca, acquario) girano da sole il loro disegno.
  const symmetric =
    k === 'plant' || k === 'lamp' || k.startsWith('weedPot') || k === 'weedJar' || !!item.pet;
  withFurnitureRotation(symmetric ? { ...item, rot: 0 } : item, () => {
    softShadow(item.x, item.y, item.w, item.h);
    drawFurnitureByKind(k, item, t, lights);
  });
}

// ---------------------------------------------------------------- OGGETTI DEGLI AMBIENTI
// Circa un albero su quattro è un pino; la scelta dipende dalla posizione, quindi resta stabile.
/**
 * Albero: si disegna una volta (fermo) in un'immagine e la si incolla a ogni fotogramma,
 * inclinandola appena per farlo ondeggiare al vento come prima.
 */
export function drawTreeProp(it?: GameValue, t?: GameValue): GameValue {
  const k: number = it.size || 1;
  const pine = rnd(it.x * 0.37 + it.y * 1.91) > 0.74;
  const s: number = isoScale();
  // la chioma si sposta di "sway" pixel in cima (z = 80, o 98 per i pini) e meno più in basso
  const sway = pine ? Math.sin(t * 0.7 + it.y) * 1.2 * s : Math.sin(t * 0.8 + it.x) * 1.6 * s;
  const top = (pine ? 98 : 80) * k * s;
  const r = 60 * k;
  drawCached(
    `tree:${game.view.activeEnvironment}:${it.x},${it.y}`,
    String(k),
    it.x,
    it.y,
    { left: r, right: r, up: 140 * k, down: r },
    () => drawTreeShape(it, k),
    sway / top,
  );
}

function drawTreeShape(it: GameValue, k: number): void {
  const seed: GameValue = rnd(it.x * 0.37 + it.y * 1.91);
  if (seed > 0.74) return drawPineTree(it, k);
  const ctx: GameValue = game.view.ctx,
    s: GameValue = isoScale();
  ellipseShadow(it.x + 10 * k, it.y + 8 * k, 42 * k, 22 * k, 0.24);
  // Radici che affiorano attorno al tronco.
  for (let i: GameValue = 0; i < 4; i++) {
    const a: GameValue = (i / 4) * Math.PI * 2 + seed * 3;
    box(it.x + Math.cos(a) * 6 * k, it.y + Math.sin(a) * 6 * k, 6 * k, 6 * k, 4 * k, '#5e3a24');
  }
  const trunk: GameValue = box(it.x, it.y, 12 * k, 12 * k, 36 * k, '#7b4a2e');
  onFace(
    trunk,
    'left',
    (W?: GameValue, H?: GameValue): GameValue => woodGrain(W, H, 'rgba(0,0,0,0.3)', true, 3),
  );
  onFace(
    trunk,
    'right',
    (W?: GameValue, H?: GameValue): GameValue => woodGrain(W, H, 'rgba(0,0,0,0.2)', true, 3),
  );
  const sway = 0; // l'ondeggiare lo fa drawTreeProp
  // Rami che portano alla chioma.
  ctx.strokeStyle = '#6b3f26';
  ctx.lineCap = 'round';
  ctx.lineWidth = 3 * k * s;
  [
    [-12, 4],
    [10, -8],
    [4, 12],
  ].forEach(([dx, dy]: GameValue = []): GameValue => {
    const from: GameValue = isoProject(it.x, it.y, 34 * k);
    const to: GameValue = isoProject(it.x + dx * k, it.y + dy * k, 54 * k);
    ctx.beginPath();
    ctx.moveTo(from.x, from.y);
    ctx.lineTo(to.x + sway * 0.6, to.y);
    ctx.stroke();
  });
  ctx.lineCap = 'butt';
  const palettes: GameValue = [
    ['#a3e57e', '#4caf50', '#1f6b2a'],
    ['#c1e874', '#72b83c', '#2f7a24'],
    ['#94dc93', '#3f9e5c', '#1b5e36'],
  ];
  const [light, mid, dark]: GameValue = palettes[Math.floor(seed * 4.05) % 3];
  // Chioma a ciuffi disposti a cupola, disegnati da dietro in avanti e dal basso in alto.
  const tufts: GameValue = [];
  for (let i: GameValue = 0; i < 24; i++) {
    const ang: GameValue = i * 2.39996 + seed * 6;
    const rad: GameValue = Math.sqrt(i / 24) * 25;
    tufts.push({
      dx: Math.cos(ang) * rad,
      dy: Math.sin(ang) * rad,
      z: 54 + (1 - rad / 25) * 26 + rnd(i + seed * 50) * 6,
      r: 13 + rnd(i * 3 + seed * 70) * 6,
    });
  }
  tufts.sort((a: GameValue, b: GameValue): GameValue => a.dx + a.dy + a.z - (b.dx + b.dy + b.z));
  const centre: GameValue = (u: GameValue): GameValue => {
    const p: GameValue = isoProject(it.x + u.dx * k, it.y + u.dy * k, u.z * k);
    return { x: p.x + sway * (u.z / 80), y: p.y, R: u.r * k * s };
  };
  // Ombra interna: un contorno più scuro che dà volume alla chioma.
  ctx.fillStyle = dark;
  tufts.forEach((u: GameValue): GameValue => {
    const c: GameValue = centre(u);
    ctx.beginPath();
    ctx.arc(c.x, c.y + c.R * 0.18, c.R * 1.06, 0, Math.PI * 2);
    ctx.fill();
  });
  tufts.forEach((u: GameValue): GameValue => {
    const c: GameValue = centre(u);
    const g: GameValue = ctx.createRadialGradient(
      c.x - c.R * 0.4,
      c.y - c.R * 0.45,
      c.R * 0.1,
      c.x,
      c.y,
      c.R,
    );
    g.addColorStop(0, light);
    g.addColorStop(0.5, mid);
    g.addColorStop(1, mixColor(mid, dark, 0.55));
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.arc(c.x, c.y, c.R, 0, Math.PI * 2);
    ctx.fill();
  });
  // Foglie più chiare sul lato in alto a sinistra, rivolto verso la luce.
  ctx.fillStyle = light;
  ctx.globalAlpha = 0.7;
  for (let i: GameValue = 0; i < 30; i++) {
    const c: GameValue = centre(tufts[Math.floor(rnd(i * 7 + seed * 90) * tufts.length)]);
    const a: GameValue = Math.PI * (1.05 + rnd(i * 11 + seed) * 0.6);
    const d: GameValue = c.R * (0.35 + rnd(i * 13 + seed) * 0.45);
    ctx.beginPath();
    ctx.ellipse(c.x + Math.cos(a) * d, c.y + Math.sin(a) * d, 2.6 * s, 1.3 * s, a, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.globalAlpha = 1;
}

function drawPineTree(it: GameValue, k: GameValue): void {
  const ctx: GameValue = game.view.ctx,
    s: GameValue = isoScale();
  ellipseShadow(it.x + 8 * k, it.y + 6 * k, 30 * k, 16 * k, 0.24);
  box(it.x, it.y, 8 * k, 8 * k, 22 * k, '#6b3f26');
  const sway = 0; // l'ondeggiare lo fa drawTreeProp
  // Quattro strati di rami, sempre più stretti verso la punta.
  [
    [18, 28, 50],
    [38, 23, 66],
    [56, 17, 82],
    [72, 11, 98],
  ].forEach(([z0, r, z1]: GameValue = [], i: GameValue): GameValue => {
    const shift: GameValue = sway * ((i + 1) / 4);
    const apex: GameValue = isoProject(it.x, it.y, z1 * k);
    const rim: GameValue = [];
    for (let j: GameValue = 0; j < 24; j++) {
      const a: GameValue = (j / 24) * Math.PI * 2;
      const p: GameValue = isoProject(
        it.x + Math.cos(a) * r * k,
        it.y + Math.sin(a) * r * k,
        z0 * k,
      );
      rim.push({ x: p.x + shift, y: p.y });
    }
    let left: GameValue = 0,
      right: GameValue = 0;
    rim.forEach((p: GameValue, j: GameValue): GameValue => {
      if (p.x < rim[left].x) left = j;
      if (p.x > rim[right].x) right = j;
    });
    // Contorno: punta, poi il bordo inferiore (quello verso chi guarda) da destra a sinistra.
    const front: GameValue = [];
    for (let j: GameValue = right; ; j = (j + 1) % 24) {
      front.push(rim[j]);
      if (j === left) break;
    }
    if (front.length > 1 && front[Math.floor(front.length / 2)].y < rim[left].y) {
      front.length = 0;
      for (let j: GameValue = right; ; j = (j + 23) % 24) {
        front.push(rim[j]);
        if (j === left) break;
      }
    }
    const tip: GameValue = { x: apex.x + shift * 1.3, y: apex.y };
    const g: GameValue = ctx.createLinearGradient(rim[left].x, 0, rim[right].x, 0);
    g.addColorStop(0, '#4f9e5a');
    g.addColorStop(0.5, '#2e7d43');
    g.addColorStop(1, '#1a5232');
    poly([tip, ...front], g);
    // Bordo inferiore più scuro, come l'ombra dei rami sottostanti.
    ctx.strokeStyle = 'rgba(10,50,25,0.55)';
    ctx.lineWidth = 2 * s;
    ctx.beginPath();
    front.forEach(
      (p: GameValue, j: GameValue): GameValue => (j ? ctx.lineTo(p.x, p.y) : ctx.moveTo(p.x, p.y)),
    );
    ctx.stroke();
  });
}

/** Bacheca dei pettegolezzi del cortile: lavagna verde con fumetti e, se ci sono novità, "NUOVO". */
export function drawGossipBoardProp(it?: GameValue, t?: GameValue): GameValue {
  const ctx = game.view.ctx;
  const W: number = it.w;
  for (const dx of [-W / 2 + 3, W / 2 - 3]) box(it.x + dx, it.y, 5, 5, 88, '#6d4128');
  const panel: GameValue = box(it.x, it.y, W, 4, 50, '#5d4037', { z0: 34 });
  const fresh = unreadGossip() > 0;
  onFace(panel, 'left', (PW: number, PH: number): void => {
    ctx.fillStyle = '#2e5e3a';
    ctx.fillRect(2, 2, PW - 4, PH - 4);
    ctx.fillStyle = '#fbe9a6';
    ctx.font = 'bold 6px sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('PETTEGOLEZZI', PW / 2, 10);
    // fumetti con i puntini
    const bubbles = ['#ffffff', '#ffd6e0', '#d6f0ff'];
    for (let k = 0; k < 3; k++) {
      const bx = 6 + k * ((PW - 12) / 3),
        bw = (PW - 12) / 3 - 4,
        by = 15 + (k % 2) * 4;
      ctx.fillStyle = bubbles[k];
      ctx.beginPath();
      ctx.roundRect ? ctx.roundRect(bx, by, bw, 14, 3) : ctx.rect(bx, by, bw, 14);
      ctx.fill();
      ctx.beginPath();
      ctx.moveTo(bx + 4, by + 14);
      ctx.lineTo(bx + 3, by + 19);
      ctx.lineTo(bx + 9, by + 14);
      ctx.fill();
      ctx.fillStyle = '#2d3436';
      ctx.font = 'bold 7px sans-serif';
      ctx.fillText(k === 1 ? '!!' : '…', bx + bw / 2, by + 10);
    }
    // gessetti sul bordo
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(6, PH - 6, 6, 2);
    ctx.fillStyle = '#fd79a8';
    ctx.fillRect(14, PH - 6, 5, 2);
    if (fresh) {
      // bollino "NUOVO" che pulsa
      const a = 0.75 + 0.25 * Math.sin((t || 0) * 5);
      ctx.fillStyle = `rgba(255,71,87,${a})`;
      ctx.beginPath();
      ctx.roundRect ? ctx.roundRect(PW - 24, PH - 13, 21, 9, 3) : ctx.rect(PW - 24, PH - 13, 21, 9);
      ctx.fill();
      ctx.fillStyle = '#ffffff';
      ctx.font = 'bold 5px sans-serif';
      ctx.fillText('NUOVO', PW - 13.5, PH - 7);
    }
  });
  box(it.x, it.y + 1, W + 8, 10, 3, '#3e2723', { z0: 86, top: '#5d4037' });
}

/** Bacheca immobiliare del cortile: pannello di legno su due pali, con tettoia e annunci. */
export function drawRealtyBoardProp(it?: GameValue): GameValue {
  const ctx = game.view.ctx;
  const W: number = it.w;
  const wood = '#8d5a3b';
  // pali
  for (const dx of [-W / 2 + 3, W / 2 - 3]) box(it.x + dx, it.y, 5, 5, 88, '#6d4128');
  // pannello: si legge dalla parte del vialetto (verso chi guarda)
  const panel: GameValue = box(it.x, it.y, W, 4, 50, wood, { z0: 34 });
  onFace(panel, 'left', (PW: number, PH: number): void => {
    // fondo di sughero
    ctx.fillStyle = '#c8a26b';
    ctx.fillRect(2, 2, PW - 4, PH - 4);
    ctx.fillStyle = 'rgba(0,0,0,0.08)';
    for (let i = 0; i < 40; i++)
      ctx.fillRect(rnd(i) * (PW - 6) + 3, rnd(i + 50) * (PH - 6) + 3, 1, 1);
    // titolo
    ctx.fillStyle = '#2d3436';
    ctx.fillRect(3, 3, PW - 6, 14);
    ctx.fillStyle = '#feca57';
    ctx.font = 'bold 6px sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('BACHECA', PW / 2, 9);
    ctx.fillText('IMMOBILIARE', PW / 2, 15.5);
    // annunci appuntati con le puntine
    const notes = ['#ffffff', '#fff3b0', '#d6f5ff', '#ffe0e6'];
    for (let k = 0; k < 4; k++) {
      const nx = 5 + k * ((PW - 10) / 4),
        nw = (PW - 10) / 4 - 3,
        ny = 21 + (k % 2) * 3;
      ctx.fillStyle = notes[k];
      ctx.fillRect(nx, ny, nw, 20);
      ctx.fillStyle = 'rgba(0,0,0,0.35)';
      for (let l = 0; l < 4; l++) ctx.fillRect(nx + 2, ny + 6 + l * 3, nw - 4 - (l % 2) * 3, 1);
      // casetta disegnata sull'annuncio
      ctx.fillStyle = '#e17055';
      ctx.beginPath();
      ctx.moveTo(nx + nw / 2 - 3, ny + 4);
      ctx.lineTo(nx + nw / 2, ny + 1.5);
      ctx.lineTo(nx + nw / 2 + 3, ny + 4);
      ctx.fill();
      ctx.fillStyle = '#d63031';
      ctx.beginPath();
      ctx.arc(nx + nw / 2, ny, 1.2, 0, 6.3);
      ctx.fill();
    }
  });
  // tettoia
  box(it.x, it.y + 1, W + 8, 10, 3, '#a0522d', { z0: 86, top: '#b5653a' });
}

export function drawFountainProp(it?: GameValue, t?: GameValue): GameValue {
  const ctx = game.view.ctx;
  const b: GameValue = box(it.x, it.y, it.w, it.h, 16, '#b8b2a7');
  const stones: GameValue = (W?: GameValue, H?: GameValue): GameValue => {
    game.view.ctx.strokeStyle = 'rgba(0,0,0,0.18)';
    game.view.ctx.lineWidth = 0.8;
    for (let u: GameValue = 0; u < W; u += 14) {
      game.view.ctx.beginPath();
      game.view.ctx.moveTo(u, 0);
      game.view.ctx.lineTo(u, H);
      game.view.ctx.stroke();
    }
    game.view.ctx.beginPath();
    game.view.ctx.moveTo(0, H / 2);
    game.view.ctx.lineTo(W, H / 2);
    game.view.ctx.stroke();
  };
  onFace(b, 'left', stones);
  onFace(b, 'right', stones);
  onFace(b, 'top', (W?: GameValue, H?: GameValue): GameValue => {
    const g: GameValue = ctx.createLinearGradient(0, 0, W, H);
    g.addColorStop(0, '#2f80c0');
    g.addColorStop(1, '#5dade2');
    ctx.fillStyle = g;
    ctx.fillRect(6, 6, W - 12, H - 12);
    for (let i: GameValue = 0; i < 3; i++) {
      const r: GameValue = (t * 10 + i * 10) % 30;
      ctx.strokeStyle = `rgba(255,255,255,${Math.max(0, 0.55 - r / 55)})`;
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.ellipse(W / 2, H / 2, r, r, 0, 0, 6.3);
      ctx.stroke();
    }
  });
  box(it.x, it.y, 10, 10, 32, '#d5d0c6', { z0: 16 });
  const bowl: GameValue = box(it.x, it.y, 28, 28, 5, '#cfc8bb', { z0: 46 });
  onFace(bowl, 'top', (W?: GameValue, H?: GameValue): GameValue => {
    ctx.fillStyle = '#5dade2';
    ctx.fillRect(3, 3, W - 6, H - 6);
  });
  const top: GameValue = isoProject(it.x, it.y, 58),
    s: GameValue = isoScale();
  ctx.strokeStyle = 'rgba(210,240,255,0.85)';
  ctx.lineWidth = 1.5;
  for (let i: GameValue = 0; i < 6; i++) {
    const a: GameValue = (i / 6) * Math.PI * 2 + t * 0.4;
    const dx: GameValue = Math.cos(a) * 20 * s,
      dy: GameValue = Math.sin(a) * 10 * s;
    ctx.beginPath();
    ctx.moveTo(top.x, top.y);
    ctx.quadraticCurveTo(top.x + dx * 0.5, top.y - 14 * s, top.x + dx, top.y + 18 * s + dy);
    ctx.stroke();
  }
  ctx.fillStyle = 'rgba(230,248,255,0.9)';
  for (let i: GameValue = 0; i < 10; i++) {
    const ph: GameValue = (t * 1.3 + i * 0.1) % 1,
      a: GameValue = i * 2.4;
    ctx.beginPath();
    ctx.arc(
      top.x + Math.cos(a) * 20 * s * ph,
      top.y - 10 * s + ph * ph * 30 * s + Math.sin(a) * 6 * s * ph,
      1.2 * s,
      0,
      6.3,
    );
    ctx.fill();
  }
}

export function drawBenchProp(it?: GameValue): GameValue {
  const { x, y, w, h }: GameValue = it;
  if (it.style === 'gallery') {
    // panca da galleria: cuscino di pelle scura su un telaio d'acciaio sottile
    for (const sx of [-1, 1]) box(x + sx * (w / 2 - 6), y, 3, h - 2, 10, '#1e1e20');
    box(x, y, w - 8, 2, 1.5, '#1e1e20', { z0: 4 });
    box(x, y, w, h, 7, '#3b3a39', { z0: 10, top: '#4a4846', edge: 'rgba(0,0,0,0.45)' });
    return;
  }
  box(x, y - h / 2 + 2, w, 3, 18, '#7b4a2e', { z0: 14 });
  box(x - w / 2 + 5, y, 4, h - 4, 12, '#2d3436');
  for (let i: GameValue = 0; i < 3; i++)
    box(x, y - h / 2 + 4 + (i * (h - 6)) / 3 + 2, w, (h - 8) / 3, 2.5, '#a0623b', { z0: 12 });
  box(x + w / 2 - 5, y, 4, h - 4, 12, '#2d3436');
}

export function drawStreetLampProp(it?: GameValue, _t?: GameValue, lights?: GameValue): GameValue {
  box(it.x, it.y, 10, 10, 4, '#2d3436');
  box(it.x, it.y, 4, 4, 82, '#2d3436', { z0: 4 });
  void box(it.x, it.y, 14, 14, 10, '#fff3c4', { z0: 78, top: '#2d3436', edge: 'rgba(0,0,0,0.4)' });
  box(it.x, it.y, 16, 16, 3, '#2d3436', { z0: 88 });
  if (lights) lights.push({ x: it.x, y: it.y, z: 80, r: 170, color: '255,214,150' });
}

export function drawFlowersProp(it?: GameValue): GameValue {
  const ctx = game.view.ctx;
  void box(it.x, it.y, it.w, it.h, 4, '#5d4037', { edge: 'rgba(0,0,0,0.2)' });
  const cols: GameValue = ['#ff6b81', '#feca57', '#ff9ff3', '#ffffff', '#ff4757', '#a29bfe'];
  const s: GameValue = isoScale();
  for (let i: GameValue = 0; i < 16; i++) {
    const px: GameValue = it.x - it.w / 2 + 5 + rnd(i + it.x) * (it.w - 10),
      py: GameValue = it.y - it.h / 2 + 4 + rnd(i * 3 + it.y) * (it.h - 8);
    const base: GameValue = isoProject(px, py, 4),
      tip: GameValue = isoProject(px, py, 10 + rnd(i) * 6);
    ctx.strokeStyle = '#2e7d32';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(base.x, base.y);
    ctx.lineTo(tip.x, tip.y);
    ctx.stroke();
    ctx.fillStyle = cols[i % cols.length];
    ctx.beginPath();
    ctx.arc(tip.x, tip.y, 2.4 * s, 0, 6.3);
    ctx.fill();
  }
}

export function drawPalmProp(it?: GameValue, t?: GameValue): GameValue {
  const ctx = game.view.ctx;
  const s: GameValue = isoScale();
  ellipseShadow(it.x + 10, it.y + 10, 34, 16, 0.2);
  for (let i: GameValue = 0; i < 9; i++)
    box(it.x + i * i * 0.3, it.y, 8 - i * 0.35, 8 - i * 0.35, 10, i % 2 ? '#a67c52' : '#8d6748', {
      z0: i * 10,
      edge: 'rgba(0,0,0,0.2)',
    });
  const top: GameValue = isoProject(it.x + 24, it.y, 92);
  for (let i: GameValue = 0; i < 8; i++) {
    const a: GameValue = (i / 8) * Math.PI * 2 + Math.sin(t + i) * 0.05;
    const ex: GameValue = top.x + Math.cos(a) * 38 * s,
      ey: GameValue = top.y + Math.sin(a) * 16 * s + 16 * s;
    ctx.strokeStyle = i % 2 ? '#1e8449' : '#27ae60';
    ctx.lineWidth = 6 * s;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(top.x, top.y);
    ctx.quadraticCurveTo(top.x + Math.cos(a) * 24 * s, top.y - 12 * s, ex, ey);
    ctx.stroke();
  }
  ctx.fillStyle = '#6d4c41';
  [
    [-3, 3],
    [3, 4],
    [0, 6],
  ].forEach(([dx, dy]: GameValue = {}): GameValue => {
    ctx.beginPath();
    ctx.arc(top.x + dx * s, top.y + dy * s, 3 * s, 0, 6.3);
    ctx.fill();
  });
  ctx.lineCap = 'butt';
}

export function drawUmbrellaProp(it?: GameValue): GameValue {
  const ctx = game.view.ctx;
  const s: GameValue = isoScale();
  box(it.x, it.y, 3, 3, 62, '#ecf0f1');
  const c: GameValue = isoProject(it.x, it.y, 62);
  for (let i: GameValue = 0; i < 8; i++) {
    ctx.fillStyle = i % 2 ? '#ffffff' : '#e74c3c';
    ctx.beginPath();
    ctx.moveTo(c.x, c.y - 10 * s);
    ctx.ellipse(c.x, c.y, 38 * s, 18 * s, 0, (i / 8) * Math.PI * 2, ((i + 1) / 8) * Math.PI * 2);
    ctx.closePath();
    ctx.fill();
  }
  ctx.strokeStyle = 'rgba(0,0,0,0.2)';
  ctx.beginPath();
  ctx.ellipse(c.x, c.y, 38 * s, 18 * s, 0, 0, 6.3);
  ctx.stroke();
}

export function drawSunbedProp(it?: GameValue): GameValue {
  box(it.x, it.y + 4, it.w, it.h - 8, 9, '#ecf0f1');
  const cu: GameValue = box(it.x, it.y + 6, it.w - 4, it.h - 18, 3, '#3498db', { z0: 9 });
  onFace(cu, 'top', (W?: GameValue, H?: GameValue): GameValue => {
    game.view.ctx.fillStyle = '#ffffff';
    for (let u: GameValue = 3; u < W; u += 8) game.view.ctx.fillRect(u, 0, 4, H);
  });
  box(it.x, it.y - it.h / 2 + 6, it.w - 4, 6, 16, '#3498db', { z0: 9 });
}

export function drawSandcastleProp(it?: GameValue): GameValue {
  const ctx = game.view.ctx;
  const c: GameValue = '#e8c27a';
  box(it.x, it.y, it.w, it.h, 10, c);
  [
    [-1, -1],
    [1, -1],
    [-1, 1],
  ].forEach(
    ([sx, sy]: GameValue = {}): GameValue =>
      box(it.x + sx * it.w * 0.35, it.y + sy * it.h * 0.35, 7, 7, 22, c),
  );
  box(it.x, it.y, 10, 10, 30, c);
  box(it.x + it.w * 0.35, it.y + it.h * 0.35, 7, 7, 22, c);
  const f: GameValue = isoProject(it.x, it.y, 30),
    s: GameValue = isoScale();
  ctx.strokeStyle = '#2d3436';
  ctx.beginPath();
  ctx.moveTo(f.x, f.y);
  ctx.lineTo(f.x, f.y - 14 * s);
  ctx.stroke();
  ctx.fillStyle = '#e74c3c';
  ctx.beginPath();
  ctx.moveTo(f.x, f.y - 14 * s);
  ctx.lineTo(f.x + 9 * s, f.y - 11 * s);
  ctx.lineTo(f.x, f.y - 8 * s);
  ctx.fill();
}

export function drawBallProp(it?: GameValue, t?: GameValue): GameValue {
  const ctx = game.view.ctx;
  const s: GameValue = isoScale(),
    p: GameValue = isoProject(it.x, it.y, 7 + Math.abs(Math.sin(t * 2)) * 4);
  ellipseShadow(it.x, it.y, 7, 3.5);
  ['#e74c3c', '#ffffff', '#3498db', '#f1c40f'].forEach(
    (c?: GameValue, i?: GameValue): GameValue => {
      ctx.fillStyle = c;
      ctx.beginPath();
      ctx.moveTo(p.x, p.y);
      ctx.arc(p.x, p.y, 7 * s, (i * Math.PI) / 2 + t, ((i + 1) * Math.PI) / 2 + t);
      ctx.fill();
    },
  );
}

export function drawHospitalBedProp(it?: GameValue): GameValue {
  const { x, y, w, h }: GameValue = it;
  [
    [-1, -1],
    [1, -1],
    [-1, 1],
    [1, 1],
  ].forEach(
    ([sx, sy]: GameValue = {}): GameValue =>
      box(x + sx * (w / 2 - 4), y + sy * (h / 2 - 4), 4, 4, 22, '#95a5a6'),
  );
  box(x, y - h / 2 + 3, w, 5, 46, '#bdc3c7');
  box(x, y, w, h, 6, '#bdc3c7', { z0: 22 });
  box(x, y, w - 6, h - 6, 7, '#ffffff', { z0: 28 });
  box(x, y - h / 2 + 16, w * 0.6, 14, 6, '#ffffff', { z0: 35, edge: 'rgba(0,0,0,0.15)' });
  const sh: GameValue = box(x, y + h * 0.15, w - 4, h * 0.6, 4, '#2ecc71', { z0: 34 });
  onFace(sh, 'top', (W?: GameValue, _H?: GameValue): GameValue => {
    game.view.ctx.fillStyle = '#7bed9f';
    game.view.ctx.fillRect(0, 0, W, 5);
  });
}

export function drawIvStandProp(it?: GameValue, _t?: GameValue): GameValue {
  const ctx = game.view.ctx;
  box(it.x, it.y, 12, 12, 2, '#7f8c8d');
  box(it.x, it.y, 2, 2, 90, '#bdc3c7', { z0: 2 });
  void box(it.x + 5, it.y, 8, 4, 16, '#d6eaf8', {
    z0: 66,
    left: 'rgba(214,234,248,0.85)',
    right: 'rgba(174,214,241,0.85)',
  });
  const a: GameValue = isoProject(it.x + 5, it.y, 66),
    b: GameValue = isoProject(it.x + 30, it.y + 20, 36);
  ctx.strokeStyle = 'rgba(255,255,255,0.7)';
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(a.x, a.y);
  ctx.quadraticCurveTo(a.x + 10, a.y + 30, b.x, b.y);
  ctx.stroke();
}

export function drawHeartMonitorProp(it?: GameValue, t?: GameValue): GameValue {
  const ctx = game.view.ctx;
  box(it.x, it.y, it.w, it.h, 40, '#95a5a6');
  const scr: GameValue = box(it.x, it.y, it.w, it.h, 24, '#2d3436', { z0: 40 });
  onFace(scr, 'left', (W?: GameValue, H?: GameValue): GameValue => {
    ctx.fillStyle = '#071a0e';
    ctx.fillRect(2, 2, W - 4, H - 4);
    ctx.strokeStyle = '#2ecc71';
    ctx.lineWidth = 1.2;
    ctx.beginPath();
    for (let u: GameValue = 2; u < W - 2; u++) {
      const ph: GameValue = (u / (W - 4) + t * 0.8) % 1;
      let v: GameValue = H / 2;
      if (ph > 0.45 && ph < 0.5) v -= (ph - 0.45) * 160;
      else if (ph >= 0.5 && ph < 0.55) v += (0.55 - ph) * 160 - 4;
      u === 2 ? ctx.moveTo(u, v) : ctx.lineTo(u, v);
    }
    ctx.stroke();
  });
}

export function drawMedCabinetProp(it?: GameValue): GameValue {
  const ctx = game.view.ctx;
  const b: GameValue = box(it.x, it.y, it.w, it.h, it.z, '#f5f6fa');
  onFace(b, 'left', (W?: GameValue, H?: GameValue): GameValue => {
    ctx.fillStyle = 'rgba(174,214,241,0.55)';
    ctx.fillRect(4, 4, W / 2 - 6, H * 0.55);
    ctx.fillRect(W / 2 + 2, 4, W / 2 - 6, H * 0.55);
    const cols: GameValue = ['#e74c3c', '#3498db', '#f1c40f', '#2ecc71'];
    for (let i: GameValue = 0; i < 8; i++) {
      ctx.fillStyle = cols[i % 4];
      ctx.fillRect(7 + ((i % 4) * (W - 14)) / 4, 8 + Math.floor(i / 4) * 22, 6, 12);
    }
    ctx.fillStyle = '#e74c3c';
    ctx.fillRect(W / 2 - 3, H * 0.66, 6, 18);
    ctx.fillRect(W / 2 - 9, H * 0.66 + 6, 18, 6);
  });
}

export function drawChair(
  x?: GameValue,
  y?: GameValue,
  color?: GameValue,
  backSide: GameValue = 'y0',
): GameValue {
  box(x, y, 14, 14, CHAIR_SEAT_Z - 3, game.darken(color, 0.3));
  box(x, y, 16, 16, 3, color, { z0: CHAIR_SEAT_Z - 3 });
  // 'y0': sedia dietro il tavolo, schienale verso il fondo; 'x0': sedia sul lato sinistro del
  // tavolo, schienale dalla parte opposta al tavolo. Lo schienale sta dietro chi siede, che si
  // disegna subito dopo (e il piano del tavolo dopo ancora).
  // 'y1'/'x1': sedia davanti alla scrivania, schienale dalla parte di chi guarda: chi siede
  // (di spalle) si disegna prima, poi lo schienale lo copre
  if (backSide === 'y1' || backSide === 'x1') {
    drawChairSitters(x, y);
    if (backSide === 'x1') box(x + 7, y, 3, 16, 18, color, { z0: CHAIR_SEAT_Z });
    else box(x, y + 7, 16, 3, 18, color, { z0: CHAIR_SEAT_Z });
    return;
  }
  if (backSide === 'x0') box(x - 7, y, 3, 16, 18, color, { z0: CHAIR_SEAT_Z });
  else box(x, y - 7, 16, 3, 18, color, { z0: CHAIR_SEAT_Z });
  drawChairSitters(x, y);
}

/**
 * Chi è seduto su una sedia non entra nell'ordine in profondità della scena: si disegna insieme
 * alla sua sedia (engine.ts lo mette in game.frameChairSitters con il posto in cui siede).
 */
function drawChairSitters(x: number, y: number): void {
  for (const c of (game.frameChairSitters || []) as GameValue[])
    if (!c.done && Math.abs(c.seat.x - x) < 3 && Math.abs(c.seat.y - y) < 3) {
      c.done = true;
      c.draw();
    }
}

export function drawWaitingChairsProp(it?: GameValue): GameValue {
  for (const c of chairsOf({ ...it, kind: 'waitingChairs' })) drawChair(c.x, c.y, '#2e86de');
}

/** Bancone del caffè: legno, piano chiaro, la macchina dell'espresso col vapore e le tazzine. */
export function drawRestCounterProp(it?: GameValue, t?: GameValue): GameValue {
  const ctx = game.view.ctx;
  const b: GameValue = box(it.x, it.y, it.w, it.h, it.z - 5, '#8d5a3b');
  onFace(b, 'left', (W?: GameValue, H?: GameValue): GameValue => {
    woodGrain(W, H, 'rgba(0,0,0,0.2)', true, 12);
    ctx.fillStyle = 'rgba(0,0,0,0.25)';
    ctx.fillRect(0, H - 6, W, 6);
  });
  box(it.x, it.y, it.w + 6, it.h + 6, 5, '#ecf0f1', { z0: it.z - 5 });
  // macchina dell'espresso all'italiana, d'epoca e grande: cromo e ottone, la fascia con la scritta,
  // la cupola alta con l'aquila dorata e le due leve dei gruppi
  const mx = it.x - it.w * 0.12,
    my = it.y - 3,
    z = it.z;
  const MW = 46,
    MD = 22,
    MH = 26;
  const s1: number = isoScale();
  // zoccolo d'ottone e corpo cromato
  box(mx, my, MW + 3, MD + 3, 3, '#b8860b', { z0: z, top: '#d4ac0d' });
  const body: GameValue = box(mx, my, MW, MD, MH, '#c0c8cc', { z0: z + 3, top: '#dfe6e9' });
  const chrome = (W: number, H: number): void => {
    const g = ctx.createLinearGradient(0, 0, W, 0);
    g.addColorStop(0, '#f5f6fa');
    g.addColorStop(0.45, '#a4b0be');
    g.addColorStop(1, '#dfe4ea');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, W, H);
  };
  onFace(body, 'left', (W: number, H: number): void => {
    chrome(W, H);
    // fascia d'ottone con la scritta
    const band = ctx.createLinearGradient(0, 3, 0, 11);
    band.addColorStop(0, '#f1c40f');
    band.addColorStop(1, '#b8860b');
    ctx.fillStyle = band;
    ctx.fillRect(0, 3, W, 8);
    ctx.fillStyle = '#3e2723';
    ctx.font = 'bold 6px serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('CAFFÈ', W / 2, 7.5);
    // manometro d'ottone al centro
    ctx.fillStyle = '#b8860b';
    ctx.beginPath();
    ctx.arc(W / 2, 17, 3.6, 0, 6.3);
    ctx.fill();
    ctx.fillStyle = '#ffffff';
    ctx.beginPath();
    ctx.arc(W / 2, 17, 2.6, 0, 6.3);
    ctx.fill();
    ctx.strokeStyle = '#c0392b';
    ctx.lineWidth = 0.6;
    ctx.beginPath();
    ctx.moveTo(W / 2, 17);
    ctx.lineTo(W / 2 + 1.6, 15.6);
    ctx.stroke();
    // filetto d'ottone in basso
    ctx.fillStyle = '#d4ac0d';
    ctx.fillRect(0, H - 3, W, 2);
  });
  // il fianco continua il davanti: cromo, fascia e filetto d'ottone
  onFace(body, 'right', (W: number, H: number): void => {
    chrome(W, H);
    const band = ctx.createLinearGradient(0, 3, 0, 11);
    band.addColorStop(0, '#f1c40f');
    band.addColorStop(1, '#b8860b');
    ctx.fillStyle = band;
    ctx.fillRect(0, 3, W, 8);
    ctx.fillStyle = '#d4ac0d';
    ctx.fillRect(0, H - 3, W, 2);
  });
  // cupola cromata: anelli sempre più stretti, col bordo d'ottone
  const ring = (cx: number, cy: number, r: number, zz: number): void => {
    ctx.beginPath();
    for (let k = 0; k <= 24; k++) {
      const a = (k / 24) * Math.PI * 2;
      const p = isoProject(cx + Math.cos(a) * r, cy + Math.sin(a) * r, zz);
      if (k) ctx.lineTo(p.x, p.y);
      else ctx.moveTo(p.x, p.y);
    }
    ctx.fill();
  };
  const top = z + 3 + MH;
  ctx.fillStyle = '#d4ac0d';
  ring(mx, my, 10.5, top);
  for (let k = 0; k <= 10; k++) {
    const a = (k / 10) * (Math.PI / 2);
    ctx.fillStyle = k % 2 ? '#dfe6e9' : '#b2bec3';
    ring(mx, my, 10 * Math.cos(a) + 0.5, top + 1 + 13 * Math.sin(a));
  }
  // l'aquila dorata ad ali aperte, sul pomolo in cima
  const ea = isoProject(mx, my, top + 17);
  ctx.fillStyle = '#d4ac0d';
  ctx.strokeStyle = '#8a6d0b';
  ctx.lineWidth = 0.6;
  ctx.beginPath();
  ctx.moveTo(ea.x - 8 * s1, ea.y - 3 * s1);
  ctx.lineTo(ea.x - 2 * s1, ea.y - 1 * s1);
  ctx.lineTo(ea.x, ea.y - 6 * s1);
  ctx.lineTo(ea.x + 2 * s1, ea.y - 1 * s1);
  ctx.lineTo(ea.x + 8 * s1, ea.y - 3 * s1);
  ctx.lineTo(ea.x + 2.5 * s1, ea.y + 2 * s1);
  ctx.lineTo(ea.x - 2.5 * s1, ea.y + 2 * s1);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();
  ctx.beginPath();
  ctx.arc(ea.x, ea.y - 6.5 * s1, 1.6 * s1, 0, 6.3);
  ctx.fill();
  // i due gruppi con le leve alzate e i pomelli neri, i portafiltri e le tazzine sotto
  for (const k of [-0.36, 0.36]) {
    const gx = mx + MW * k;
    box(gx, my + MD / 2, 6, 5, 5, '#95a5a6', { z0: z + 12 });
    box(gx, my + MD / 2 + 4, 2.5, 8, 2.5, '#2d3436', { z0: z + 12 });
    box(gx, my + MD / 2 + 3, 6, 6, 5, '#ffffff', { z0: z + 3 });
    box(gx, my + MD / 2, 2, 2, 20, '#b2bec3', { z0: z + 17 });
    const knob = isoProject(gx, my + MD / 2, z + 38);
    ctx.fillStyle = '#1e272e';
    ctx.beginPath();
    ctx.arc(knob.x, knob.y, 3.2 * s1, 0, 6.3);
    ctx.fill();
    ctx.fillStyle = 'rgba(255,255,255,0.35)';
    ctx.beginPath();
    ctx.arc(knob.x - 1 * s1, knob.y - 1 * s1, 1 * s1, 0, 6.3);
    ctx.fill();
  }
  // la lancia del vapore col suo sbuffo
  box(mx + MW / 2 + 2, my + 6, 2, 2, 14, '#b2bec3', { z0: z + 6 });
  for (let k = 0; k < 2; k++) {
    const ph = ((t || 0) * 0.8 + k / 2) % 1;
    const p = isoProject(mx + MW / 2 + 2, my + 6, z + 6 + ph * 16);
    ctx.fillStyle = `rgba(255,255,255,${0.5 * (1 - ph)})`;
    ctx.beginPath();
    ctx.arc(p.x, p.y, (2.5 + ph * 3.5) * s1, 0, 6.3);
    ctx.fill();
  }
  // a destra: tazzine sul piattino in fila, pronte
  for (let i = 0; i < 3; i++) {
    const cx = it.x + it.w * 0.24 + i * 8;
    box(cx, it.y + 4, 7, 7, 1, '#ffffff', { z0: z });
    const cup: GameValue = box(cx, it.y + 4, 4.5, 4.5, 4, '#ffffff', { z0: z + 1 });
    onFace(cup, 'top', (W: number, H: number): void => {
      ctx.fillStyle = '#6f4e37';
      ctx.fillRect(0.8, 0.8, W - 1.6, H - 1.6);
    });
  }
}

/**
 * Fornelli in acciaio: manopole, sportello del forno col vetro e la luce, piano scuro con quattro
 * fuochi. `glow` è la luce del forno (0-1), `flame` accende un fuoco. Lo usano la cucina di casa e
 * il ristorante; pentole e padelle le aggiunge chi lo usa.
 */
function drawSteelStove(it: GameValue, glow: number, flame: boolean): void {
  const ctx = game.view.ctx;
  // `facing: 'x'`: contro il muro di sinistra, con il davanti verso la sala
  const front = it.facing === 'x' ? 'right' : 'left';
  const side = it.facing === 'x' ? 'left' : 'right';
  const body: GameValue = box(it.x, it.y, it.w, it.h, it.z - 4, '#c8d0d4');
  const steel = (W: number, H: number): void => {
    const g = ctx.createLinearGradient(0, 0, W, 0);
    g.addColorStop(0, '#dfe6e9');
    g.addColorStop(0.5, '#b2bec3');
    g.addColorStop(1, '#d1d8dc');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, W, H);
  };
  onFace(body, front, (W: number, H: number): void => {
    steel(W, H);
    // striscia delle manopole
    ctx.fillStyle = '#2d3436';
    ctx.fillRect(2, 2, W - 4, 7);
    for (let k = 0; k < 4; k++) {
      ctx.fillStyle = '#dfe6e9';
      ctx.beginPath();
      ctx.arc(W * (0.2 + k * 0.2), 5.5, 2, 0, 6.3);
      ctx.fill();
    }
    // sportello del forno: vetro scuro con la luce dentro e la maniglia
    ctx.fillStyle = '#636e72';
    ctx.fillRect(4, 13, W - 8, H - 17);
    const g = ctx.createLinearGradient(0, 17, 0, H - 6);
    g.addColorStop(0, '#2d3436');
    g.addColorStop(1, `rgba(214,110,30,${0.25 + glow * 0.75})`);
    ctx.fillStyle = g;
    ctx.fillRect(8, 19, W - 16, H - 27);
    ctx.fillStyle = 'rgba(255,255,255,0.15)';
    ctx.fillRect(10, 21, (W - 16) * 0.3, 2);
    ctx.fillStyle = '#ecf0f1';
    ctx.fillRect(7, 15, W - 14, 2);
  });
  onFace(body, side, steel);
  // piano cottura scuro con quattro fuochi e le griglie
  const top: GameValue = box(it.x, it.y, it.w, it.h, 4, '#2d3436', { z0: it.z - 4 });
  onFace(top, 'top', (W: number, H: number): void => {
    ctx.strokeStyle = '#636e72';
    ctx.lineWidth = 1;
    ctx.strokeRect(1.5, 1.5, W - 3, H - 3);
    for (const [n, [u, v]] of [
      [0.28, 0.27],
      [0.72, 0.27],
      [0.28, 0.73],
      [0.72, 0.73],
    ].entries()) {
      const cx = W * u,
        cy = H * v,
        r = Math.min(W, H) * 0.17;
      // il fuoco acceso (quello davanti a sinistra) ha la fiamma blu e arancio
      ctx.fillStyle = flame && n === 2 ? '#e67e22' : '#1e272e';
      ctx.beginPath();
      ctx.arc(cx, cy, r, 0, 6.3);
      ctx.fill();
      ctx.strokeStyle = '#8395a7';
      ctx.lineWidth = 1.2;
      ctx.beginPath();
      ctx.moveTo(cx - r, cy);
      ctx.lineTo(cx + r, cy);
      ctx.moveTo(cx, cy - r);
      ctx.lineTo(cx, cy + r);
      ctx.stroke();
    }
  });
}

export function drawChefStoveProp(it?: GameValue, t?: GameValue): GameValue {
  const ctx = game.view.ctx;
  drawSteelStove(it, 0.6, true);
  // la pentola della pasta (col vapore) e una padella sul fuoco
  const s: GameValue = isoScale();
  const burner = (u: number, v: number): [number, number] => [
    it.x + it.w * (u - 0.5),
    it.y + it.h * (v - 0.5),
  ];
  const [px, py] = burner(0.28, 0.27);
  const pot: GameValue = box(px, py, 16, 16, 12, '#95a5a6', { z0: it.z });
  onFace(pot, 'top', (W: number, H: number): void => {
    ctx.fillStyle = '#74b9ff';
    ctx.fillRect(2, 2, W - 4, H - 4);
    ctx.strokeStyle = '#ffeaa7';
    ctx.lineWidth = 1;
    for (let k = 0; k < 4; k++) {
      ctx.beginPath();
      ctx.moveTo(3 + k * 3, 4);
      ctx.quadraticCurveTo(W / 2, H / 2 + k, W - 4, H - 4 - k);
      ctx.stroke();
    }
  });
  for (let k = 0; k < 2; k++) {
    const ph = ((t || 0) * 0.7 + k / 2) % 1;
    const p = isoProject(px, py, it.z + 16 + ph * 18);
    ctx.fillStyle = `rgba(255,255,255,${0.4 * (1 - ph)})`;
    ctx.beginPath();
    ctx.arc(p.x, p.y, (3 + ph * 4) * s, 0, 6.3);
    ctx.fill();
  }
  const [fx, fy] = burner(0.72, 0.73);
  const pan: GameValue = box(fx, fy, 15, 15, 4, '#2d3436', { z0: it.z });
  onFace(pan, 'top', (W: number, H: number): void => {
    ctx.fillStyle = '#e17055';
    ctx.fillRect(2, 2, W - 4, H - 4);
  });
}

let tableGuest: ((it: GameValue) => void) | null = null;
/** Chi siede dietro i tavoli del ristorante (i clienti del turno): va tra la sedia e il tavolo. */
export function setTableGuestDrawer(fn: ((it: GameValue) => void) | null): void {
  tableGuest = fn;
}

export function drawDinnerTableProp(it?: GameValue): GameValue {
  const ctx = game.view.ctx;
  const { x, y, w, h }: GameValue = it;
  const [back, side] = chairsOf({ ...it, kind: 'dinnerTable' });
  drawChair(side.x, side.y, '#a0522d', 'x0');
  drawChair(back.x, back.y, '#a0522d');
  tableGuest?.(it);
  box(x, y, 6, 6, 30, '#5d4037');
  const top: GameValue = box(x, y, w, h, 8, '#ffffff', { z0: 28 });
  onFace(top, 'left', (W?: GameValue, H?: GameValue): GameValue => {
    ctx.strokeStyle = 'rgba(0,0,0,0.12)';
    for (let u: GameValue = 6; u < W; u += 10) {
      ctx.beginPath();
      ctx.moveTo(u, 0);
      ctx.lineTo(u, H);
      ctx.stroke();
    }
  });
  onFace(top, 'top', (W?: GameValue, H?: GameValue): GameValue => {
    ctx.fillStyle = '#c0392b';
    ctx.fillRect(W / 2 - 5, 0, 10, H);
    [
      [0.28, 0.3],
      [0.72, 0.7],
    ].forEach(([u, v]: GameValue = {}): GameValue => {
      ctx.fillStyle = '#f5f6fa';
      ctx.beginPath();
      ctx.ellipse(W * u, H * v, 7, 7, 0, 0, 6.3);
      ctx.fill();
      ctx.strokeStyle = 'rgba(0,0,0,0.15)';
      ctx.stroke();
      ctx.fillStyle = '#e17055';
      ctx.beginPath();
      ctx.ellipse(W * u, H * v, 3.5, 3.5, 0, 0, 6.3);
      ctx.fill();
    });
  });
  box(x + w * 0.2, y - h * 0.15, 3, 3, 8, 'rgba(200,230,255,0.8)', {
    z0: 36,
    left: 'rgba(200,230,255,0.7)',
    right: 'rgba(170,210,240,0.7)',
  });
}

export function drawOfficeDeskProp(it?: GameValue, t?: GameValue): GameValue {
  drawDesk({ x: it.x, y: it.y, w: it.w, h: it.h, z: it.z + 20, name: '' }, t);
  box(it.x, it.y + it.h / 2 + 12, 16, 16, 18, '#2d3436');
  box(it.x, it.y + it.h / 2 + 12, 18, 18, 4, '#34495e', { z0: 18 });
  box(it.x, it.y + it.h / 2 + 20, 18, 3, 22, '#34495e', { z0: 22 });
}

export function drawArchiveProp(it?: GameValue): GameValue {
  const ctx = game.view.ctx;
  const b: GameValue = box(it.x, it.y, it.w, it.h, it.z, '#95a5a6');
  onFace(b, 'left', (W?: GameValue, H?: GameValue): GameValue => {
    for (let i: GameValue = 0; i < 4; i++) {
      const v: GameValue = 3 + (i * (H - 6)) / 4;
      ctx.strokeStyle = 'rgba(0,0,0,0.35)';
      ctx.strokeRect(3, v, W - 6, (H - 6) / 4 - 3);
      ctx.fillStyle = '#ecf0f1';
      ctx.fillRect(W / 2 - 6, v + 4, 12, 5);
      ctx.fillStyle = '#2d3436';
      ctx.fillRect(W / 2 - 4, v + 12, 8, 2);
    }
  });
}

export function drawCoolerProp(it?: GameValue): GameValue {
  const ctx = game.view.ctx;
  const b: GameValue = box(it.x, it.y, it.w, it.h, it.z - 24, '#ecf0f1');
  onFace(b, 'left', (W?: GameValue, _H?: GameValue): GameValue => {
    ctx.fillStyle = '#0984e3';
    ctx.fillRect(W / 2 - 4, 10, 3, 4);
    ctx.fillStyle = '#d63031';
    ctx.fillRect(W / 2 + 2, 10, 3, 4);
  });
  box(it.x, it.y, it.w * 0.8, it.h * 0.8, 24, '#74b9ff', {
    z0: it.z - 24,
    left: 'rgba(116,185,255,0.7)',
    right: 'rgba(84,160,255,0.7)',
    top: 'rgba(160,210,255,0.8)',
  });
}

/** Il bancone del bar, con il mobile del barista e le bottiglie: vedi render/bar.ts. */
export function drawBarCounterProp(it?: GameValue, t?: GameValue): GameValue {
  drawBar(it, t || 0);
}

export function drawStoolProp(it?: GameValue): GameValue {
  const ctx = game.view.ctx;
  box(it.x, it.y, 3, 3, 30, '#bdc3c7');
  box(it.x, it.y, 10, 10, 2, '#7f8c8d');
  const p: GameValue = isoProject(it.x, it.y, 32),
    s: GameValue = isoScale();
  ctx.fillStyle = '#c0392b';
  ctx.beginPath();
  ctx.ellipse(p.x, p.y, 9 * s, 4.5 * s, 0, 0, 6.3);
  ctx.fill();
  ctx.fillStyle = '#e74c3c';
  ctx.beginPath();
  ctx.ellipse(p.x, p.y - 1.5 * s, 9 * s, 4.5 * s, 0, 0, 6.3);
  ctx.fill();
}

export function drawRoundTableProp(it?: GameValue): GameValue {
  const ctx = game.view.ctx;
  const [back, side] = chairsOf({ ...it, kind: 'roundTable' });
  drawChair(side.x, side.y, '#6d4c41', 'x0');
  drawChair(back.x, back.y, '#6d4c41');
  box(it.x, it.y, 4, 4, 34, '#2d3436');
  box(it.x, it.y, 18, 18, 2, '#2d3436');
  const p: GameValue = isoProject(it.x, it.y, 36),
    s: GameValue = isoScale();
  ctx.fillStyle = '#5d4037';
  ctx.beginPath();
  ctx.ellipse(p.x, p.y + 2 * s, it.w * 0.75 * s, it.w * 0.38 * s, 0, 0, 6.3);
  ctx.fill();
  ctx.fillStyle = '#8d6e63';
  ctx.beginPath();
  ctx.ellipse(p.x, p.y, it.w * 0.75 * s, it.w * 0.38 * s, 0, 0, 6.3);
  ctx.fill();
  ctx.fillStyle = 'rgba(241,196,15,0.9)';
  ctx.fillRect(p.x - 6 * s, p.y - 9 * s, 4 * s, 8 * s);
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(p.x - 6 * s, p.y - 10 * s, 4 * s, 2 * s);
}

export function drawJukeboxProp(it?: GameValue, t?: GameValue): GameValue {
  const ctx = game.view.ctx;
  const b: GameValue = box(it.x, it.y, it.w, it.h, it.z, '#8e44ad');
  onFace(b, 'left', (W?: GameValue, H?: GameValue): GameValue => {
    const hue: GameValue = (t * 60) % 360;
    const g: GameValue = ctx.createLinearGradient(0, 0, W, 0);
    g.addColorStop(0, `hsl(${hue},90%,60%)`);
    g.addColorStop(1, `hsl(${(hue + 90) % 360},90%,60%)`);
    ctx.fillStyle = g;
    ctx.fillRect(3, 3, W - 6, H * 0.45);
    ctx.fillStyle = '#2d3436';
    ctx.fillRect(5, H * 0.55, W - 10, H * 0.3);
    ctx.fillStyle = '#f1c40f';
    for (let i: GameValue = 0; i < 4; i++) ctx.fillRect(7 + (i * (W - 14)) / 4, H * 0.6, 3, 3);
  });
}

export function drawTableProp(it?: GameValue): GameValue {
  const ctx = game.view.ctx;
  const [back, side] = chairsOf({ ...it, kind: 'table' });
  drawChair(side.x, side.y, '#a0522d', 'x0');
  drawChair(back.x, back.y, '#a0522d');
  [
    [-1, -1],
    [1, -1],
    [-1, 1],
    [1, 1],
  ].forEach(
    ([sx, sy]: GameValue = {}): GameValue =>
      box(it.x + sx * (it.w / 2 - 4), it.y + sy * (it.h / 2 - 4), 4, 4, 28, '#6d4c41'),
  );
  const top: GameValue = box(it.x, it.y, it.w, it.h, 4, '#c8a27a', { z0: 28 });
  onFace(top, 'top', (W?: GameValue, H?: GameValue): GameValue => {
    woodGrain(W, H, 'rgba(0,0,0,0.1)', false, 4);
    ctx.fillStyle = '#ecf0f1';
    ctx.beginPath();
    ctx.ellipse(W / 2, H / 2, 9, 7, 0, 0, 6.3);
    ctx.fill();
    [
      ['#e74c3c', -3, -1],
      ['#f1c40f', 2, 1],
      ['#27ae60', 0, -3],
    ].forEach(([c, du, dv]: GameValue = {}): GameValue => {
      ctx.fillStyle = c;
      ctx.beginPath();
      ctx.arc(W / 2 + du, H / 2 + dv, 2.6, 0, 6.3);
      ctx.fill();
    });
  });
}

export function drawConsoleProp(it?: GameValue): GameValue {
  const ctx = game.view.ctx;
  const b: GameValue = box(it.x, it.y, it.w, it.h, 34, '#6d4c41');
  onFace(b, 'left', (W?: GameValue, H?: GameValue): GameValue => {
    woodGrain(W, H, 'rgba(0,0,0,0.2)');
    ctx.strokeStyle = 'rgba(0,0,0,0.35)';
    ctx.strokeRect(3, 3, W / 2 - 4, H / 2);
    ctx.strokeRect(W / 2 + 1, 3, W / 2 - 4, H / 2);
  });
  box(it.x - it.w * 0.25, it.y, 8, 8, 16, '#2980b9', { z0: 34 });
  const p: GameValue = isoProject(it.x - it.w * 0.25, it.y, 52),
    s: GameValue = isoScale();
  ['#ff6b81', '#feca57', '#ff9ff3'].forEach((c?: GameValue, i?: GameValue): GameValue => {
    ctx.fillStyle = c;
    ctx.beginPath();
    ctx.arc(p.x + (i - 1) * 4 * s, p.y - (i % 2) * 3 * s, 3 * s, 0, 6.3);
    ctx.fill();
  });
  box(it.x + it.w * 0.2, it.y, 16, 10, 4, '#c0392b', { z0: 34 });
  box(it.x + it.w * 0.2, it.y, 14, 9, 3, '#2980b9', { z0: 38 });
}

export function drawBathmatProp(it?: GameValue): GameValue {
  const b: GameValue = box(it.x, it.y, it.w, it.h, 1.5, '#81ecec', { edge: 'rgba(0,0,0,0.12)' });
  onFace(b, 'top', (W?: GameValue, H?: GameValue): GameValue => {
    game.view.ctx.fillStyle = 'rgba(255,255,255,0.35)';
    for (let u: GameValue = 3; u < W; u += 6) game.view.ctx.fillRect(u, 2, 2, H - 4);
  });
}

export function drawDjBoothProp(it?: GameValue, t?: GameValue): GameValue {
  const ctx = game.view.ctx;
  const b: GameValue = box(it.x, it.y, it.w, it.h, 34, '#1e1e2f', {
    edge: 'rgba(255,255,255,0.15)',
  });
  onFace(b, 'left', (W?: GameValue, H?: GameValue): GameValue => {
    for (let i: GameValue = 0; i < 10; i++) {
      ctx.fillStyle = `hsl(${(t * 120 + i * 36) % 360},90%,${40 + 30 * Math.abs(Math.sin(t * 6 + i))}%)`;
      ctx.fillRect(4 + (i * (W - 8)) / 10, H * 0.3, (W - 8) / 10 - 2, H * 0.4);
    }
  });
  const top: GameValue = box(it.x, it.y, it.w - 6, it.h - 6, 4, '#2d2d44', { z0: 34 });
  onFace(top, 'top', (W?: GameValue, H?: GameValue): GameValue => {
    [W * 0.28, W * 0.72].forEach((cx?: GameValue, k?: GameValue): GameValue => {
      const r: GameValue = Math.min(H * 0.42, W * 0.18);
      ctx.fillStyle = '#111';
      ctx.beginPath();
      ctx.arc(cx, H / 2, r, 0, 6.3);
      ctx.fill();
      ctx.strokeStyle = `hsl(${(t * 90 + k * 120) % 360},90%,60%)`;
      ctx.lineWidth = 1;
      const a: GameValue = t * 5 + k;
      ctx.beginPath();
      ctx.moveTo(cx, H / 2);
      ctx.lineTo(cx + Math.cos(a) * r, H / 2 + Math.sin(a) * r);
      ctx.stroke();
    });
    ctx.fillStyle = '#e84393';
    ctx.fillRect(W / 2 - 3, 3, 6, H - 6);
  });
}

export function drawSpeakerProp(it?: GameValue, t?: GameValue): GameValue {
  const ctx = game.view.ctx;
  const b: GameValue = box(it.x, it.y, it.w, it.h, it.z || 70, '#1a1a1a', {
    edge: 'rgba(255,255,255,0.1)',
  });
  onFace(b, 'left', (W?: GameValue, H?: GameValue): GameValue => {
    const k: GameValue = 1 + 0.1 * Math.sin(t * 9 + it.x);
    [
      [H * 0.3, W * 0.28],
      [H * 0.68, W * 0.4],
    ].forEach(([cy, r]: GameValue = {}): GameValue => {
      ctx.fillStyle = '#3a3a3a';
      ctx.beginPath();
      ctx.arc(W / 2, cy, r * k, 0, 6.3);
      ctx.fill();
      ctx.fillStyle = '#0a0a0a';
      ctx.beginPath();
      ctx.arc(W / 2, cy, r * 0.45 * k, 0, 6.3);
      ctx.fill();
    });
  });
}

export function drawDiscoBallProp(it?: GameValue, t?: GameValue): GameValue {
  const ctx = game.view.ctx;
  const top: GameValue = isoProject(it.x, it.y, 230),
    p: GameValue = isoProject(it.x, it.y, it.z || 115),
    r: GameValue = 15 * isoScale();
  ctx.strokeStyle = '#999';
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(top.x, top.y);
  ctx.lineTo(p.x, p.y - r);
  ctx.stroke();
  const g: GameValue = ctx.createRadialGradient(p.x - r * 0.3, p.y - r * 0.3, r * 0.1, p.x, p.y, r);
  g.addColorStop(0, '#ffffff');
  g.addColorStop(1, '#7f8fa6');
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.arc(p.x, p.y, r, 0, 6.3);
  ctx.fill();
  for (let i: GameValue = 0; i < 16; i++) {
    const a: GameValue = i * 2.4 + t * 1.5,
      d: GameValue = r * (0.2 + (0.7 * ((i * 37) % 10)) / 10);
    ctx.fillStyle = `hsl(${(t * 200 + i * 40) % 360},100%,${65 + 25 * Math.sin(t * 8 + i)}%)`;
    ctx.fillRect(p.x + Math.cos(a) * d - 1.5, p.y + Math.sin(a) * d * 0.9 - 1.5, 3, 3);
  }
}

// Mentre si sposta un mobile, mostra la zona da lasciare libera fino alla cassaforte.
export function drawSafeCorridor(t: number): void {
  const ctx: GameValue = game.view.ctx;
  const all = SAFE_CORRIDOR;
  const minX = Math.min(...all.map((r) => r.minX)),
    minY = Math.min(...all.map((r) => r.minY));
  setPlane([minX, minY, 0], [1, 0, 0], [0, 1, 0]);
  try {
    // l'unione delle corsie, colorata una sola volta
    ctx.beginPath();
    for (const r of all) ctx.rect(r.minX - minX, r.minY - minY, r.maxX - r.minX, r.maxY - r.minY);
    ctx.fillStyle = `rgba(46,213,115,${0.16 + 0.06 * Math.sin(t * 3)})`;
    ctx.fill('nonzero');
    ctx.strokeStyle = 'rgba(46,213,115,0.8)';
    ctx.lineWidth = 2;
    ctx.setLineDash([8, 6]);
    for (const r of all)
      ctx.strokeRect(
        r.minX - minX + 1,
        r.minY - minY + 1,
        r.maxX - r.minX - 2,
        r.maxY - r.minY - 2,
      );
    ctx.setLineDash([]);
    // scritta lungo la corsia che porta alla cassaforte
    const lane = all[1];
    ctx.save();
    ctx.translate((lane.minX + lane.maxX) / 2 - minX, (lane.minY + lane.maxY) / 2 - minY);
    ctx.rotate(-Math.PI / 2);
    ctx.fillStyle = 'rgba(255,255,255,0.85)';
    ctx.font = 'bold 10px sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('PASSAGGIO LIBERO PER LA CASSAFORTE', 0, 4);
    ctx.restore();
  } finally {
    resetPlane();
  }
}
