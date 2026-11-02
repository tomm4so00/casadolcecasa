import { spendMoney } from '../economy.js';
import type { GameValue } from '../context.js';
import { game } from '../context.js';
import {
  isoProject,
  isoScale,
  poly,
  rnd,
  footprintOf,
  rotateVector,
  setPlane,
  worldPoint,
} from './primitives.js';
import { hasRoom, isMyRoomNow, saveGame } from '../saves.js';
import {
  freeRoomsInApt,
  ownsItem,
  parseLook,
  resolveLook,
  wardrobeOpenAmount,
} from '../character.js';
import { drawGlasses, drawHat, drawPlayerAvatar, drawShowerWater } from './avatars.js';
import { nameHash } from './scenes.js';
import { fmtDuration, toast } from '../missions.js';
import { openDialog } from '../interface.js';
import { sortIsoParts } from './iso-sort.js';
import { SAFE_CORRIDOR } from '../room-layout.js';
import { nextUpgrade, tierOf, tierOfPlaced, tiersOf } from '../furniture-tiers.js';
import { LAMP_LIGHT } from '../furniture-benefits.js';
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
export function drawDeferred(x: number, y: number, z: number, fn: () => void): void {
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
  game.view.ctx.strokeStyle = color;
  game.view.ctx.lineWidth = 0.7;
  game.view.ctx.beginPath();
  for (let i: GameValue = 1; i < n; i++) {
    if (vertical) {
      const u: GameValue = (W * i) / n;
      game.view.ctx.moveTo(u, 0);
      game.view.ctx.bezierCurveTo(u + 1.5, H * 0.3, u - 1.5, H * 0.65, u, H);
    } else {
      const t: GameValue = (H * i) / n;
      game.view.ctx.moveTo(0, t);
      game.view.ctx.bezierCurveTo(W * 0.3, t + 1.2, W * 0.65, t - 1.2, W, t);
    }
  }
  game.view.ctx.stroke();
}

export function softShadow(x?: GameValue, y?: GameValue, w?: GameValue, h?: GameValue): GameValue {
  setPlane([x - w / 2, y - h / 2, 0], [1, 0, 0], [0, 1, 0]);
  game.view.ctx.fillStyle = 'rgba(0,0,0,0.13)';
  game.view.ctx.fillRect(-2, -2, w + 12, h + 12);
  game.view.ctx.fillStyle = 'rgba(0,0,0,0.14)';
  game.view.ctx.fillRect(1, 1, w + 5, h + 5);
  resetPlane();
}

export function ellipseShadow(
  x?: GameValue,
  y?: GameValue,
  rx?: GameValue,
  ry?: GameValue,
  a: GameValue = 0.28,
): GameValue {
  const p: GameValue = isoProject(x, y, 0),
    s: GameValue = isoScale();
  game.view.ctx.fillStyle = `rgba(0,0,0,${a})`;
  game.view.ctx.beginPath();
  game.view.ctx.ellipse(p.x, p.y, rx * s, ry * s, 0, 0, Math.PI * 2);
  game.view.ctx.fill();
}

export function isLux(it?: GameValue): GameValue {
  return /✨|Lusso/.test(it.name || '');
}

// Fascia intermedia fra standard e lusso.
export function isPremium(it?: GameValue): boolean {
  return tierOfPlaced(it || {}) === 'premium';
}

export function gameClockText(..._args: GameValue[]): GameValue {
  const m: GameValue = Math.floor(game.player.gameMinutes);
  return String(Math.floor(m / 60) % 24).padStart(2, '0') + ':' + String(m % 60).padStart(2, '0');
}

// ---------------------------------------------------------------- MOBILI DELLA STANZA
export function drawBed(it?: GameValue): GameValue {
  const Z: GameValue = it.zb || 0,
    lux: GameValue = isLux(it),
    pre = isPremium(it);
  const frameC: GameValue = lux ? '#c9a227' : pre ? '#4e2f1c' : '#7b4a2e';
  const { x, y, w, h }: GameValue = it;
  const hb: GameValue = box(x, y - h / 2 + 4, w, 8, lux ? 54 : pre ? 50 : 44, frameC, { z0: Z });
  onFace(hb, 'left', (W?: GameValue, H?: GameValue): GameValue => {
    game.view.ctx.fillStyle = game.darken(frameC, 0.18);
    game.view.ctx.fillRect(5, 6, W - 10, H - 16);
    if (pre) {
      // testiera imbottita capitonné con profilo argentato
      game.view.ctx.fillStyle = game.darken(it.color, 0.1);
      game.view.ctx.fillRect(6, 7, W - 12, H - 18);
      game.view.ctx.fillStyle = 'rgba(0,0,0,0.35)';
      for (let i = 1; i < 6; i++)
        for (let j = 1; j < 3; j++) {
          game.view.ctx.beginPath();
          game.view.ctx.arc(6 + ((W - 12) * i) / 6, 7 + ((H - 18) * j) / 3, 1.1, 0, 6.3);
          game.view.ctx.fill();
        }
      game.view.ctx.strokeStyle = '#dfe6e9';
      game.view.ctx.lineWidth = 1;
      game.view.ctx.strokeRect(6, 7, W - 12, H - 18);
      return;
    }
    if (lux) {
      game.view.ctx.strokeStyle = '#fff3b0';
      game.view.ctx.lineWidth = 1.5;
      game.view.ctx.strokeRect(8, 9, W - 16, H - 22);
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
  box(x, y + 4, w - 6, h - 12, 9, '#f4f6f7', { z0: Z + 14, edge: 'rgba(0,0,0,0.12)' });
  box(x - w * 0.22, y - h / 2 + 20, w * 0.36, 16, 7, '#ffffff', {
    z0: Z + 23,
    edge: 'rgba(0,0,0,0.15)',
  });
  box(x + w * 0.22, y - h / 2 + 20, w * 0.36, 16, 7, '#ffffff', {
    z0: Z + 23,
    edge: 'rgba(0,0,0,0.15)',
  });
  const bl: GameValue = box(x, y + h * 0.14, w - 2, h * 0.62, 11, it.color, {
    z0: Z + 15,
    top: it.topColor || game.lighten(it.color, 0.15),
  });
  const stripes: GameValue = (W?: GameValue, H?: GameValue): GameValue => {
    game.view.ctx.fillStyle = 'rgba(255,255,255,0.13)';
    for (let i: GameValue = 4; i < W; i += 14) game.view.ctx.fillRect(i, 0, 5, H);
  };
  onFace(bl, 'top', (W?: GameValue, H?: GameValue): GameValue => {
    stripes(W, H);
    game.view.ctx.fillStyle = 'rgba(255,255,255,0.55)';
    game.view.ctx.fillRect(0, 0, W, 7);
  });
  onFace(bl, 'left', stripes);
}

export function drawShirtShape(
  cx?: GameValue,
  top?: GameValue,
  w?: GameValue,
  h?: GameValue,
  color?: GameValue,
  kind?: GameValue,
): GameValue {
  game.view.ctx.fillStyle = color;
  game.view.ctx.beginPath();
  if (kind === 'pants') {
    game.view.ctx.moveTo(cx - w / 2, top);
    game.view.ctx.lineTo(cx + w / 2, top);
    game.view.ctx.lineTo(cx + w / 2, top + h);
    game.view.ctx.lineTo(cx + 1.2, top + h);
    game.view.ctx.lineTo(cx, top + h * 0.32);
    game.view.ctx.lineTo(cx - 1.2, top + h);
    game.view.ctx.lineTo(cx - w / 2, top + h);
  } else {
    game.view.ctx.moveTo(cx - w * 0.28, top);
    game.view.ctx.lineTo(cx - w * 0.7, top + h * 0.18);
    game.view.ctx.lineTo(cx - w * 0.55, top + h * 0.4);
    game.view.ctx.lineTo(cx - w * 0.36, top + h * 0.3);
    game.view.ctx.lineTo(cx - w * 0.36, top + h);
    game.view.ctx.lineTo(cx + w * 0.36, top + h);
    game.view.ctx.lineTo(cx + w * 0.36, top + h * 0.3);
    game.view.ctx.lineTo(cx + w * 0.55, top + h * 0.4);
    game.view.ctx.lineTo(cx + w * 0.7, top + h * 0.18);
    game.view.ctx.lineTo(cx + w * 0.28, top);
  }
  game.view.ctx.closePath();
  game.view.ctx.fill();
  game.view.ctx.strokeStyle = 'rgba(0,0,0,0.3)';
  game.view.ctx.lineWidth = 0.6;
  game.view.ctx.stroke();
  game.view.ctx.strokeStyle = '#95a5a6';
  game.view.ctx.lineWidth = 0.8;
  game.view.ctx.beginPath();
  game.view.ctx.moveTo(cx - w * 0.3, top);
  game.view.ctx.lineTo(cx, top - 3);
  game.view.ctx.lineTo(cx + w * 0.3, top);
  game.view.ctx.moveTo(cx, top - 3);
  game.view.ctx.lineTo(cx, top - 5);
  game.view.ctx.stroke();
}

export function drawWardrobe(it?: GameValue): GameValue {
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
      game.view.ctx.fillStyle = '#2b1d14';
      game.view.ctx.fillRect(4, 6, W - 8, H - 18);
      game.view.ctx.fillStyle = 'rgba(255,230,180,' + 0.12 * openK + ')';
      game.view.ctx.fillRect(4, 6, W - 8, H - 18);
      game.view.ctx.fillStyle = '#b2bec3';
      game.view.ctx.fillRect(6, 16, W - 12, 2);
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
      game.view.ctx.fillStyle = '#4e342e';
      game.view.ctx.fillRect(4, H - 30, W - 8, 3);
      game.shopCatalog
        .filter((i?: GameValue): GameValue => i.slot === 'shoes' && ownsItem(i.id))
        .slice(0, 4)
        .forEach((g?: GameValue, i?: GameValue): GameValue => {
          game.view.ctx.fillStyle = g.color;
          game.view.ctx.fillRect(8 + i * 16, H - 20, 10, 5);
        });
    } else {
      game.view.ctx.strokeStyle = 'rgba(0,0,0,0.4)';
      game.view.ctx.lineWidth = 1.2;
      game.view.ctx.strokeRect(4, 6, W / 2 - 6, H - 18);
      game.view.ctx.strokeRect(W / 2 + 2, 6, W / 2 - 6, H - 18);
      if (lux || pre) {
        game.view.ctx.strokeStyle = lux ? '#e5c158' : '#c8ccd0';
        game.view.ctx.strokeRect(9, 13, W / 2 - 16, H - 32);
        game.view.ctx.strokeRect(W / 2 + 7, 13, W / 2 - 16, H - 32);
      }
      game.view.ctx.fillStyle = lux ? '#f1c40f' : pre ? '#dfe6e9' : '#2d3436';
      game.view.ctx.fillRect(W / 2 - 6, H * 0.42, 2.5, 16);
      game.view.ctx.fillRect(W / 2 + 3.5, H * 0.42, 2.5, 16);
    }
    game.view.ctx.fillStyle = 'rgba(0,0,0,0.3)';
    game.view.ctx.fillRect(0, H - 10, W, 10);
  });
  onFace(
    b,
    'right',
    (W?: GameValue, H?: GameValue): GameValue => woodGrain(W, H, 'rgba(0,0,0,0.13)', true, 5),
  );
  onFace(b, 'top', (W?: GameValue, H?: GameValue): GameValue => {
    game.view.ctx.fillStyle = 'rgba(255,255,255,0.08)';
    game.view.ctx.fillRect(0, 0, W, H);
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
          game.view.ctx.fillStyle = `hsl(${(t * 90) % 360},90%,60%)`;
          game.view.ctx.fillRect(0, H - 2, W, 2);
        }),
    );
  const tz: GameValue = Z + deskH + 5;
  box(x, y - h * 0.28, 5, 5, 6, '#333', { z0: tz });
  const mon: GameValue = box(x, y - h * 0.28, w * (pre ? 0.66 : 0.55), 4, pre ? 28 : 26, '#111', {
    z0: tz + 6,
  });
  onFace(mon, 'left', (W?: GameValue, H?: GameValue): GameValue => {
    const g: GameValue = game.view.ctx.createLinearGradient(0, 0, W, H);
    g.addColorStop(0, lux ? '#6c5ce7' : pre ? '#00b894' : '#0984e3');
    g.addColorStop(1, lux ? '#00cec9' : pre ? '#81ecec' : '#74b9ff');
    game.view.ctx.fillStyle = g;
    game.view.ctx.fillRect(2, 2, W - 4, H - 4);
    game.view.ctx.fillStyle = 'rgba(255,255,255,0.65)';
    for (let i: GameValue = 0; i < 4; i++)
      game.view.ctx.fillRect(5, 5 + i * 5, (W - 14) * (0.35 + 0.5 * rnd(i + 3)), 1.5);
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
  const Z: GameValue = it.zb || 0,
    lux: GameValue = isLux(it);
  const pre = isPremium(it);
  const c: GameValue = lux ? '#eceff1' : pre ? '#5d4037' : '#a47148';
  const b: GameValue = box(it.x, it.y, it.w, it.h, it.z, c, { z0: Z });
  onFace(b, 'left', (W?: GameValue, H?: GameValue): GameValue => {
    if (lux) {
      game.view.ctx.strokeStyle = 'rgba(120,120,140,0.25)';
      game.view.ctx.beginPath();
      game.view.ctx.moveTo(2, H * 0.2);
      game.view.ctx.bezierCurveTo(W * 0.4, H * 0.5, W * 0.6, H * 0.1, W, H * 0.6);
      game.view.ctx.stroke();
    } else woodGrain(W, H, 'rgba(0,0,0,0.15)', false, 4);
    game.view.ctx.strokeStyle = 'rgba(0,0,0,0.35)';
    game.view.ctx.lineWidth = 1;
    game.view.ctx.strokeRect(3, 3, W - 6, H / 2 - 4);
    game.view.ctx.strokeRect(3, H / 2 + 1, W - 6, H / 2 - 6);
    game.view.ctx.fillStyle = lux ? '#d4ac0d' : pre ? '#dfe6e9' : '#2d3436';
    game.view.ctx.fillRect(W / 2 - 3, H / 4 - 1, 6, 2.5);
    game.view.ctx.fillRect(W / 2 - 3, H * 0.75 - 2, 6, 2.5);
  });
  if (!it.zb) {
    const ck: GameValue = box(it.x, it.y, 14, 7, 8, '#2d3436', { z0: Z + it.z });
    onFace(ck, 'left', (_W?: GameValue, H?: GameValue): GameValue => {
      game.view.ctx.fillStyle = '#ff4757';
      game.view.ctx.font = 'bold 5px monospace';
      game.view.ctx.fillText(gameClockText(), 1, H - 2);
    });
  }
}

export function drawLamp(it?: GameValue, _t?: GameValue, lights?: GameValue): GameValue {
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
    const g: GameValue = game.view.ctx.createLinearGradient(0, 0, 0, H);
    g.addColorStop(0, 'rgba(255,240,180,0)');
    g.addColorStop(1, 'rgba(255,214,120,0.55)');
    game.view.ctx.fillStyle = g;
    game.view.ctx.fillRect(0, 0, W, H);
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

export function drawSofa(it?: GameValue): GameValue {
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
      game.view.ctx.fillStyle = lux ? 'rgba(255,255,255,0.4)' : 'rgba(0,0,0,0.35)';
      for (let i: GameValue = 0; i < 4; i++)
        for (let j: GameValue = 0; j < 2; j++) {
          game.view.ctx.beginPath();
          game.view.ctx.arc((W * (i + 0.5)) / 4, 6 + j * 8, 1.2, 0, 6.3);
          game.view.ctx.fill();
        }
    }
  });
  box(x - w / 2 + arm / 2, y + 4, arm, h - 8, it.z * 0.65, c, { z0: Zs });
  const seat: GameValue = box(x, y + 5, w - arm * 2, h - 14, it.z * 0.45, c, { z0: Zs });
  onFace(seat, 'top', (W?: GameValue, H?: GameValue): GameValue => {
    game.view.ctx.strokeStyle = 'rgba(0,0,0,0.25)';
    game.view.ctx.lineWidth = 1;
    for (let i: GameValue = 1; i < 3; i++) {
      game.view.ctx.beginPath();
      game.view.ctx.moveTo((W * i) / 3, 0);
      game.view.ctx.lineTo((W * i) / 3, H);
      game.view.ctx.stroke();
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
  const Z: GameValue = it.zb || 0,
    lux: GameValue = isLux(it);
  const { x, y, w, h }: GameValue = it;
  const standH: GameValue = Math.min(18, it.z * 0.3);
  const pre = isPremium(it);
  const stand: GameValue = box(x, y, w, h, standH, lux ? '#1b1b1b' : pre ? '#3e2723' : '#6d4c41', {
    z0: Z,
  });
  onFace(stand, 'left', (W?: GameValue, H?: GameValue): GameValue => {
    game.view.ctx.strokeStyle = 'rgba(255,255,255,0.14)';
    game.view.ctx.strokeRect(3, 3, W / 2 - 5, H - 6);
    game.view.ctx.strokeRect(W / 2 + 2, 3, W / 2 - 5, H - 6);
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
    const g: GameValue = game.view.ctx.createLinearGradient(0, 0, W, H);
    g.addColorStop(0, `hsl(${hue},70%,48%)`);
    g.addColorStop(1, `hsl(${(hue + 120) % 360},70%,32%)`);
    game.view.ctx.fillStyle = g;
    game.view.ctx.fillRect(1.5, 1.5, W - 3, H - 3);
    game.view.ctx.fillStyle = 'rgba(255,255,255,0.85)';
    game.view.ctx.beginPath();
    game.view.ctx.arc(W * (0.3 + 0.4 * ((t * 0.05) % 1)), H * 0.32, H * 0.12, 0, 6.3);
    game.view.ctx.fill();
    game.view.ctx.fillStyle = 'rgba(0,0,0,0.35)';
    game.view.ctx.beginPath();
    game.view.ctx.moveTo(1.5, H - 1.5);
    game.view.ctx.quadraticCurveTo(W * 0.3, H * 0.4, W * 0.62, H - 1.5);
    game.view.ctx.fill();
    game.view.ctx.fillStyle = 'rgba(255,255,255,0.08)';
    game.view.ctx.fillRect(1.5, 1.5, W * 0.35, H - 3);
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
      const g: GameValue = game.view.ctx.createRadialGradient(
        top.x + dx * s - 2,
        top.y + dy * s - 3,
        1,
        top.x + dx * s,
        top.y + dy * s,
        r * s * 1.3,
      );
      g.addColorStop(0, '#76d7a1');
      g.addColorStop(1, '#117a65');
      game.view.ctx.fillStyle = g;
      game.view.ctx.beginPath();
      game.view.ctx.ellipse(top.x + dx * s, top.y + dy * s, r * 1.4 * s, r * 0.8 * s, 0, 0, 6.3);
      game.view.ctx.fill();
    });
    return;
  }
  if (isPremium(it)) {
    const vase: GameValue = box(it.x, it.y, sz * 0.7, sz * 0.7, 16, '#ecf0f1', { z0: Z });
    onFace(vase, 'left', (W?: GameValue, H?: GameValue): GameValue => {
      game.view.ctx.fillStyle = '#2e86de';
      game.view.ctx.fillRect(0, H * 0.35, W, 2.5);
      game.view.ctx.fillRect(0, H * 0.6, W, 1.2);
    });
    onFace(vase, 'right', (W?: GameValue, H?: GameValue): GameValue => {
      game.view.ctx.fillStyle = '#2e86de';
      game.view.ctx.fillRect(0, H * 0.35, W, 2.5);
    });
    top = isoProject(it.x, it.y, Z + 16);
    const kk: GameValue = (it.z / 55) * s;
    for (let i = 0; i < 9; i++) {
      const a = -Math.PI / 2 + (i - 4) * 0.36 + Math.sin(t * 1.2 + i) * 0.04;
      const len = (20 + rnd(i + 11) * 10) * kk;
      const cx = top.x + Math.cos(a) * len * 0.55,
        cy = top.y + Math.sin(a) * len * 0.55;
      game.view.ctx.strokeStyle = '#145a32';
      game.view.ctx.lineWidth = 1 * kk;
      game.view.ctx.beginPath();
      game.view.ctx.moveTo(top.x, top.y);
      game.view.ctx.lineTo(cx, cy);
      game.view.ctx.stroke();
      game.view.ctx.fillStyle = i % 2 ? '#1e8449' : '#239b56';
      game.view.ctx.beginPath();
      game.view.ctx.ellipse(cx, cy, len * 0.38, 6 * kk, a, 0, 6.3);
      game.view.ctx.fill();
      // tagli tipici delle foglie di monstera
      game.view.ctx.strokeStyle = 'rgba(255,255,255,0.35)';
      game.view.ctx.lineWidth = 0.8;
      for (const f of [-0.5, 0, 0.5]) {
        const px = cx + Math.cos(a) * len * 0.15 * f,
          py = cy + Math.sin(a) * len * 0.15 * f;
        game.view.ctx.beginPath();
        game.view.ctx.moveTo(px, py);
        game.view.ctx.lineTo(px + Math.cos(a + 1.4) * 4 * kk, py + Math.sin(a + 1.4) * 4 * kk);
        game.view.ctx.stroke();
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
    game.view.ctx.fillStyle = 'rgba(255,255,255,0.18)';
    game.view.ctx.fillRect(0, 0, W, 3);
  });
  onFace(pot, 'top', (W?: GameValue, H?: GameValue): GameValue => {
    game.view.ctx.fillStyle = '#3e2723';
    game.view.ctx.fillRect(1.5, 1.5, W - 3, H - 3);
  });
  top = isoProject(it.x, it.y, Z + pot.d);
  const k: GameValue = (it.z / 55) * s;
  for (let i: GameValue = 0; i < 8; i++) {
    const a: GameValue = -Math.PI / 2 + (i - 3.5) * 0.32 + Math.sin(t * 1.4 + i) * 0.04;
    const len: GameValue = (16 + rnd(i + 2) * 10) * k;
    game.view.ctx.fillStyle = i % 2 ? '#2e8b57' : '#3cb371';
    game.view.ctx.beginPath();
    game.view.ctx.ellipse(
      top.x + Math.cos(a) * len * 0.5,
      top.y + Math.sin(a) * len * 0.5,
      len * 0.55,
      3.2 * k,
      a,
      0,
      6.3,
    );
    game.view.ctx.fill();
  }
}

export function drawSafe(it?: GameValue): GameValue {
  const Z: GameValue = it.zb || 0;
  const b: GameValue = box(it.x, it.y, it.w, it.h, it.z, '#4b5563', { z0: Z });
  onFace(b, 'left', (W?: GameValue, H?: GameValue): GameValue => {
    const g: GameValue = game.view.ctx.createLinearGradient(0, 0, W, H);
    g.addColorStop(0, '#7b8794');
    g.addColorStop(1, '#3a4250');
    game.view.ctx.fillStyle = g;
    game.view.ctx.fillRect(4, 4, W - 8, H - 8);
    game.view.ctx.strokeStyle = 'rgba(0,0,0,0.55)';
    game.view.ctx.lineWidth = 1;
    game.view.ctx.strokeRect(4, 4, W - 8, H - 8);
    game.view.ctx.fillStyle = '#e5e7eb';
    game.view.ctx.beginPath();
    game.view.ctx.arc(W * 0.45, H * 0.45, 7, 0, 6.3);
    game.view.ctx.fill();
    game.view.ctx.strokeStyle = '#111';
    game.view.ctx.beginPath();
    game.view.ctx.arc(W * 0.45, H * 0.45, 4.5, 0, 6.3);
    game.view.ctx.stroke();
    game.view.ctx.beginPath();
    game.view.ctx.moveTo(W * 0.45, H * 0.45);
    game.view.ctx.lineTo(W * 0.45 + 4, H * 0.45 - 3);
    game.view.ctx.stroke();
    game.view.ctx.fillStyle = '#cbd5e1';
    game.view.ctx.fillRect(W * 0.76, H * 0.32, 3, 13);
    game.view.ctx.fillStyle = '#1f2937';
    game.view.ctx.fillRect(5, H * 0.2, 2, 6);
    game.view.ctx.fillRect(5, H * 0.7, 2, 6);
  });
}

export function drawStove(it?: GameValue): GameValue {
  const cooking: GameValue = game.player.hasFoodInInventory || game.player.foodIsCooked;
  const b: GameValue = box(it.x, it.y, it.w, it.h, it.z - 4, '#ecf0f1');
  onFace(b, 'left', (W?: GameValue, H?: GameValue): GameValue => {
    game.view.ctx.fillStyle = '#2d3436';
    game.view.ctx.fillRect(6, 12, W - 12, H - 20);
    game.view.ctx.fillStyle = `rgba(255,140,0,${game.player.foodIsCooked ? 0.35 : 0.08})`;
    game.view.ctx.fillRect(9, 15, W - 18, H - 26);
    game.view.ctx.fillStyle = '#b2bec3';
    game.view.ctx.fillRect(8, 6, W - 16, 3);
    for (let i: GameValue = 0; i < 4; i++) {
      game.view.ctx.fillStyle = '#636e72';
      game.view.ctx.beginPath();
      game.view.ctx.arc(10 + (i * (W - 20)) / 3, 3, 1.6, 0, 6.3);
      game.view.ctx.fill();
    }
  });
  onFace(b, 'right', (W?: GameValue, H?: GameValue): GameValue => {
    game.view.ctx.strokeStyle = 'rgba(0,0,0,0.2)';
    game.view.ctx.strokeRect(4, 6, W - 8, H - 12);
  });
  const top: GameValue = box(it.x, it.y, it.w, it.h, 4, '#2d3436', { z0: it.z - 4 });
  onFace(top, 'top', (W?: GameValue, H?: GameValue): GameValue => {
    [
      [0.28, 0.3],
      [0.72, 0.3],
      [0.28, 0.72],
      [0.72, 0.72],
    ].forEach(([u, v]: GameValue = {}, i?: GameValue): GameValue => {
      game.view.ctx.strokeStyle =
        cooking && i === 2 ? `rgba(255,${90 + Math.random() * 60},0,0.95)` : '#636e72';
      game.view.ctx.lineWidth = 2;
      game.view.ctx.beginPath();
      game.view.ctx.arc(W * u, H * v, W * 0.12, 0, 6.3);
      game.view.ctx.stroke();
      game.view.ctx.beginPath();
      game.view.ctx.arc(W * u, H * v, W * 0.05, 0, 6.3);
      game.view.ctx.stroke();
    });
  });
  if (cooking) {
    const pot: GameValue = box(it.x - it.w * 0.22, it.y + it.h * 0.22, 20, 20, 12, '#b2bec3', {
      z0: it.z,
    });
    onFace(pot, 'top', (W?: GameValue, H?: GameValue): GameValue => {
      game.view.ctx.fillStyle = game.player.foodIsCooked ? '#e17055' : '#fdcb6e';
      game.view.ctx.fillRect(2, 2, W - 4, H - 4);
    });
    if (game.player.foodIsCooked) {
      const p: GameValue = isoProject(it.x - it.w * 0.22, it.y + it.h * 0.22, it.z + 14),
        s: GameValue = isoScale(),
        tt: GameValue = performance.now() / 1000;
      for (let i: GameValue = 0; i < 3; i++) {
        const ph: GameValue = (tt * 0.6 + i / 3) % 1;
        game.view.ctx.fillStyle = `rgba(255,255,255,${0.5 * (1 - ph)})`;
        game.view.ctx.beginPath();
        game.view.ctx.arc(
          p.x + Math.sin(ph * 6 + i) * 4 * s,
          p.y - ph * 30 * s,
          (3 + ph * 5) * s,
          0,
          6.3,
        );
        game.view.ctx.fill();
      }
    }
  }
}

// ---------------------------------------------------------------- frigorifero

const FRIDGE_OPEN_MS = 520;
const FRIDGE_CLOSE_MS = 360;
const FRIDGE_MAX_ANGLE = Math.PI * 0.62;
const FRIDGE_DOOR_DEPTH = 5;
const fridgeAnim = { open: false, from: 0, t0: -Infinity };

// 0 = chiuso, 1 = aperto. La porta si apre con un piccolo rimbalzo e si chiude accelerando.
function fridgeOpenAmount(now: number): number {
  const at = (time: number): number => {
    const dur = fridgeAnim.open ? FRIDGE_OPEN_MS : FRIDGE_CLOSE_MS;
    const k = Math.min(1, Math.max(0, (time - fridgeAnim.t0) / dur));
    if (!fridgeAnim.open) return fridgeAnim.from * (1 - k * k);
    const back = 1 + 2.2 * Math.pow(k - 1, 3) + 1.2 * Math.pow(k - 1, 2);
    return fridgeAnim.from + (1 - fridgeAnim.from) * back;
  };
  if (!!game.view.fridgeIsOpen !== fridgeAnim.open) {
    // Riparte dalla posizione attuale, anche se l'animazione precedente non era finita.
    fridgeAnim.from = Math.min(1, at(now));
    fridgeAnim.open = !!game.view.fridgeIsOpen;
    fridgeAnim.t0 = now;
  }
  return at(now);
}

function steelGradient(ctx: GameValue, W: number, H: number): GameValue {
  const g = ctx.createLinearGradient(0, 0, W, H * 0.25);
  g.addColorStop(0, '#fbfcfd');
  g.addColorStop(0.45, '#e4eaee');
  g.addColorStop(1, '#c3cdd4');
  return g;
}

function roundRect(ctx: GameValue, x: number, y: number, w: number, h: number, r: number) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

// Pannello di una porta vista da fuori, in coordinate della faccia (origine in alto a sinistra).
function drawFridgeDoorPanel(
  ctx: GameValue,
  W: number,
  H: number,
  handleY: number,
  handleH: number,
) {
  roundRect(ctx, 0, 0, W, H, 3);
  ctx.fillStyle = steelGradient(ctx, W, H);
  ctx.fill();
  ctx.strokeStyle = 'rgba(60,72,82,0.35)';
  ctx.lineWidth = 0.8;
  ctx.stroke();
  // riflesso obliquo dell'acciaio
  ctx.save();
  ctx.clip();
  ctx.fillStyle = 'rgba(255,255,255,0.45)';
  ctx.beginPath();
  ctx.moveTo(W * 0.18, 0);
  ctx.lineTo(W * 0.34, 0);
  ctx.lineTo(W * 0.1, H);
  ctx.lineTo(-W * 0.06, H);
  ctx.closePath();
  ctx.fill();
  ctx.fillStyle = 'rgba(255,255,255,0.22)';
  ctx.fillRect(0, 0, W, 1.5);
  ctx.restore();
  // maniglia verticale sul lato libero (la porta ruota sul lato sinistro)
  const hx = W - 9;
  ctx.fillStyle = 'rgba(0,0,0,0.18)';
  roundRect(ctx, hx + 1.2, handleY + 1.5, 3.2, handleH, 1.6);
  ctx.fill();
  const hg = ctx.createLinearGradient(hx, 0, hx + 3.2, 0);
  hg.addColorStop(0, '#f5f7f8');
  hg.addColorStop(0.5, '#a9b4bc');
  hg.addColorStop(1, '#6c7a85');
  ctx.fillStyle = hg;
  roundRect(ctx, hx, handleY, 3.2, handleH, 1.6);
  ctx.fill();
  ctx.fillStyle = '#7d8a94';
  ctx.fillRect(hx + 0.6, handleY + 1, 2, 2.5);
  ctx.fillRect(hx + 0.6, handleY + handleH - 3.5, 2, 2.5);
}

function drawFridgeMagnets(ctx: GameValue, W: number, H: number) {
  // biglietto della spesa
  ctx.save();
  ctx.translate(W * 0.3, H * 0.3);
  ctx.rotate(-0.08);
  ctx.fillStyle = 'rgba(0,0,0,0.12)';
  ctx.fillRect(-9, -9, 19, 23);
  ctx.fillStyle = '#fff7c2';
  ctx.fillRect(-10, -11, 19, 23);
  ctx.strokeStyle = 'rgba(52,152,219,0.55)';
  ctx.lineWidth = 0.6;
  for (let i = 0; i < 5; i++) {
    ctx.beginPath();
    ctx.moveTo(-7, -5 + i * 3.6);
    ctx.lineTo(-7 + (i % 2 ? 9 : 12), -5 + i * 3.6);
    ctx.stroke();
  }
  ctx.fillStyle = '#e74c3c';
  ctx.beginPath();
  ctx.arc(-0.5, -11, 2.3, 0, 6.3);
  ctx.fill();
  ctx.restore();
  // calamite
  const dot = (x: number, y: number, r: number, c: string) => {
    ctx.fillStyle = 'rgba(0,0,0,0.18)';
    ctx.beginPath();
    ctx.arc(x + 0.8, y + 0.9, r, 0, 6.3);
    ctx.fill();
    ctx.fillStyle = c;
    ctx.beginPath();
    ctx.arc(x, y, r, 0, 6.3);
    ctx.fill();
    ctx.fillStyle = 'rgba(255,255,255,0.55)';
    ctx.beginPath();
    ctx.arc(x - r * 0.35, y - r * 0.35, r * 0.35, 0, 6.3);
    ctx.fill();
  };
  dot(W * 0.62, H * 0.22, 2.6, '#0984e3');
  dot(W * 0.2, H * 0.62, 2.4, '#fdcb6e');
  // calamita a cuore
  const hx = W * 0.55,
    hy = H * 0.5;
  ctx.fillStyle = '#e84393';
  ctx.beginPath();
  ctx.moveTo(hx, hy + 3);
  ctx.bezierCurveTo(hx - 5, hy - 1, hx - 2.5, hy - 5, hx, hy - 2);
  ctx.bezierCurveTo(hx + 2.5, hy - 5, hx + 5, hy - 1, hx, hy + 3);
  ctx.fill();
  // disegno di un bambino: casetta con il sole
  ctx.save();
  ctx.translate(W * 0.36, H * 0.74);
  ctx.rotate(0.06);
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(-8, -7, 16, 13);
  ctx.strokeStyle = '#e17055';
  ctx.lineWidth = 0.8;
  ctx.strokeRect(-4, -1, 8, 5);
  ctx.beginPath();
  ctx.moveTo(-5, -1);
  ctx.lineTo(0, -5);
  ctx.lineTo(5, -1);
  ctx.stroke();
  ctx.fillStyle = '#fdcb6e';
  ctx.beginPath();
  ctx.arc(5, -4.5, 1.5, 0, 6.3);
  ctx.fill();
  ctx.restore();
}

// Display del freezer con temperatura e led che "respira".
function drawFridgeDisplay(ctx: GameValue, W: number, H: number, t: number) {
  const x = W * 0.14,
    y = H * 0.34,
    w = 26,
    h = 12;
  roundRect(ctx, x, y, w, h, 2);
  ctx.fillStyle = '#1e272e';
  ctx.fill();
  ctx.fillStyle = 'rgba(116,185,255,0.14)';
  ctx.fillRect(x + 1, y + 1, w - 2, h / 2 - 1);
  ctx.fillStyle = '#74e0ff';
  ctx.font = 'bold 8px sans-serif';
  ctx.textBaseline = 'middle';
  ctx.textAlign = 'left';
  ctx.fillText('4°C', x + 3, y + h / 2 + 0.5);
  ctx.fillStyle = `rgba(46,213,115,${0.55 + 0.45 * Math.sin(t * 2.2)})`;
  ctx.beginPath();
  ctx.arc(x + w - 3, y + h / 2, 1.3, 0, 6.3);
  ctx.fill();
}

// Interno illuminato: ripiani in vetro, cibo e cassetti delle verdure.
function drawFridgeInterior(ctx: GameValue, W: number, H: number, light: number, hasMeal: boolean) {
  const c = (base: number, add: number) => Math.round(base + add * light);
  const g = ctx.createLinearGradient(0, 0, 0, H);
  g.addColorStop(0, `rgb(${c(200, 55)},${c(212, 43)},255)`);
  g.addColorStop(1, `rgb(${c(150, 50)},${c(170, 50)},${c(185, 50)})`);
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, W, H);
  // profondità: pareti laterali in ombra
  const side = ctx.createLinearGradient(0, 0, W, 0);
  side.addColorStop(0, 'rgba(40,60,80,0.28)');
  side.addColorStop(0.12, 'rgba(40,60,80,0)');
  side.addColorStop(0.88, 'rgba(40,60,80,0)');
  side.addColorStop(1, 'rgba(40,60,80,0.32)');
  ctx.fillStyle = side;
  ctx.fillRect(0, 0, W, H);
  // lampada in alto
  ctx.fillStyle = `rgba(255,252,230,${0.4 + 0.6 * light})`;
  ctx.fillRect(W * 0.35, 1.5, W * 0.3, 2);
  const lg = ctx.createRadialGradient(W / 2, 3, 1, W / 2, 3, W * 0.8);
  lg.addColorStop(0, `rgba(255,250,225,${0.45 * light})`);
  lg.addColorStop(1, 'rgba(255,250,225,0)');
  ctx.fillStyle = lg;
  ctx.fillRect(0, 0, W, H);

  const shelf = (y: number) => {
    ctx.fillStyle = 'rgba(160,215,240,0.55)';
    ctx.fillRect(1, y, W - 2, 2.2);
    ctx.fillStyle = 'rgba(255,255,255,0.8)';
    ctx.fillRect(1, y, W - 2, 0.7);
  };
  const s1 = H * 0.27,
    s2 = H * 0.52,
    s3 = H * 0.74;

  // ripiano alto: latte, marmellata, formaggio
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(W * 0.1, s1 - 17, 9, 17);
  ctx.fillStyle = '#0984e3';
  ctx.fillRect(W * 0.1, s1 - 11, 9, 4);
  ctx.fillStyle = '#dfe6e9';
  ctx.beginPath();
  ctx.moveTo(W * 0.1, s1 - 17);
  ctx.lineTo(W * 0.1 + 4.5, s1 - 21);
  ctx.lineTo(W * 0.1 + 9, s1 - 17);
  ctx.fill();
  ctx.fillStyle = 'rgba(214,48,49,0.85)';
  ctx.fillRect(W * 0.34, s1 - 10, 9, 10);
  ctx.fillStyle = '#d63031';
  ctx.fillRect(W * 0.34 - 0.5, s1 - 12, 10, 2.5);
  ctx.fillStyle = '#fdcb6e';
  ctx.beginPath();
  ctx.moveTo(W * 0.58, s1);
  ctx.lineTo(W * 0.86, s1);
  ctx.lineTo(W * 0.86, s1 - 8);
  ctx.closePath();
  ctx.fill();
  ctx.fillStyle = '#e1a93a';
  for (const u of [0.75, 0.81]) {
    ctx.beginPath();
    ctx.arc(W * u, s1 - 2.5, 1.1, 0, 6.3);
    ctx.fill();
  }
  shelf(s1);

  // ripiano centrale: bottiglie e mele
  for (const [color, u] of [
    ['#00b894', 0.12],
    ['#e17055', 0.26],
  ] as const) {
    const x = W * u;
    ctx.fillStyle = color;
    ctx.fillRect(x, s2 - 20, 7, 20);
    ctx.fillRect(x + 2, s2 - 25, 3, 5);
    ctx.fillStyle = 'rgba(255,255,255,0.4)';
    ctx.fillRect(x + 1, s2 - 18, 1.5, 15);
  }
  (
    [
      [0.55, '#d63031', 0],
      [0.67, '#e84118', 0],
      [0.61, '#44bd32', 5],
    ] as const
  ).forEach(([u, color, lift]) => {
    const x = W * u,
      y = s2 - 4 - lift;
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.arc(x, y, 4, 0, 6.3);
    ctx.fill();
    ctx.fillStyle = 'rgba(255,255,255,0.45)';
    ctx.beginPath();
    ctx.arc(x - 1.3, y - 1.3, 1.2, 0, 6.3);
    ctx.fill();
  });
  shelf(s2);

  // ripiano basso: il piatto pronto da 5 € (sparisce quando lo prendi) e le uova
  if (hasMeal) {
    ctx.fillStyle = 'rgba(255,255,255,0.75)';
    roundRect(ctx, W * 0.1, s3 - 9, 22, 9, 2);
    ctx.fill();
    ctx.fillStyle = '#e17055';
    ctx.fillRect(W * 0.1 + 2, s3 - 6, 18, 4);
    ctx.fillStyle = '#74b9ff';
    ctx.fillRect(W * 0.1 - 0.5, s3 - 10.5, 23, 2);
  }
  ctx.fillStyle = '#b2bec3';
  ctx.fillRect(W * 0.56, s3 - 4, 22, 4);
  ctx.fillStyle = '#fff1d6';
  for (let i = 0; i < 4; i++) {
    ctx.beginPath();
    ctx.ellipse(W * 0.56 + 3 + i * 5.3, s3 - 5.5, 2.3, 3, 0, 0, 6.3);
    ctx.fill();
  }
  shelf(s3);

  // cassetti delle verdure
  const dy = s3 + 4,
    dh = H - dy - 2;
  (
    [
      [2, W / 2 - 3],
      [W / 2 + 1, W / 2 - 3],
    ] as const
  ).forEach(([x, w], i) => {
    ctx.fillStyle = 'rgba(200,235,250,0.55)';
    roundRect(ctx, x, dy, w, dh, 2);
    ctx.fill();
    ctx.save();
    ctx.clip();
    if (i === 0) {
      ctx.fillStyle = '#6ab04c';
      for (const u of [0.25, 0.5, 0.75]) {
        ctx.beginPath();
        ctx.arc(x + w * u, dy + dh * 0.45, 4.5, 0, 6.3);
        ctx.fill();
      }
    } else {
      ctx.fillStyle = '#e67e22';
      for (let k = 0; k < 3; k++) {
        ctx.beginPath();
        ctx.moveTo(x + 4 + k * 6, dy + 3);
        ctx.lineTo(x + 7 + k * 6, dy + 3);
        ctx.lineTo(x + 5.5 + k * 6, dy + dh);
        ctx.fill();
      }
    }
    ctx.restore();
    ctx.strokeStyle = 'rgba(255,255,255,0.8)';
    ctx.lineWidth = 0.8;
    roundRect(ctx, x, dy, w, dh, 2);
    ctx.stroke();
    ctx.fillStyle = 'rgba(255,255,255,0.7)';
    ctx.fillRect(x + w / 2 - 4, dy + 1.5, 8, 1.5);
  });
}

// Lato interno della porta: guarnizione e balconcini con bottiglie.
function drawFridgeDoorInside(ctx: GameValue, W: number, H: number, light: number) {
  const c = (base: number, add: number) => Math.round(base + add * light);
  roundRect(ctx, 0, 0, W, H, 3);
  ctx.fillStyle = `rgb(${c(210, 35)},${c(220, 30)},${c(228, 27)})`;
  ctx.fill();
  ctx.strokeStyle = '#95a5a6';
  ctx.lineWidth = 2;
  roundRect(ctx, 1.5, 1.5, W - 3, H - 3, 3);
  ctx.stroke();
  const rows = [
    [0.3, ['#f1c40f', '#ffffff', '#e74c3c']],
    [0.6, ['#2ecc71', '#2ecc71', '#3498db']],
    [0.9, ['#ffffff', '#e67e22', '#e67e22']],
  ] as const;
  rows.forEach(([v, colors], row) => {
    const y = H * v;
    const tall = row === 2 ? 20 : 15;
    colors.forEach((color, i) => {
      const x = 7 + i * ((W - 14) / 3);
      // bottiglia: corpo, collo e tappo
      ctx.fillStyle = color;
      roundRect(ctx, x, y - tall, 8, tall, 2);
      ctx.fill();
      ctx.fillRect(x + 2.5, y - tall - 4, 3, 4.5);
      ctx.fillStyle = 'rgba(0,0,0,0.35)';
      ctx.fillRect(x + 2, y - tall - 5.5, 4, 2);
      ctx.fillStyle = 'rgba(255,255,255,0.45)';
      ctx.fillRect(x + 1.3, y - tall + 2, 1.4, tall - 4);
    });
    // balconcino trasparente che copre la base delle bottiglie
    ctx.fillStyle = 'rgba(205,235,250,0.88)';
    ctx.fillRect(3, y - 7, W - 6, 7);
    ctx.fillStyle = 'rgba(255,255,255,0.9)';
    ctx.fillRect(3, y - 7, W - 6, 1.2);
    ctx.fillStyle = 'rgba(80,110,130,0.25)';
    ctx.fillRect(3, y - 1, W - 6, 1);
  });
}

export function drawFridge(it?: GameValue): GameValue {
  const ctx: GameValue = game.view.ctx;
  const now = performance.now();
  const t = now / 1000;
  const openK = fridgeOpenAmount(now);
  const light = Math.min(1, Math.max(0, openK * 1.4 - 0.15));
  const freezerShare = 0.34;
  const kick = 8;
  const zTop = it.z;
  const mainTopZ = zTop - zTop * freezerShare - 2;
  const mainBottomZ = kick + 1;
  const x0 = it.x - it.w / 2,
    y1 = it.y + it.h / 2;

  // alone di luce fredda sul pavimento davanti al frigo aperto
  if (light > 0.02) {
    setPlane([x0, y1, 0], [1, 0, 0], [0, 1, 0]);
    try {
      const glow = ctx.createRadialGradient(it.w / 2, 0, 4, it.w / 2, 0, it.w * 1.3);
      glow.addColorStop(0, `rgba(205,235,255,${0.42 * light})`);
      glow.addColorStop(1, 'rgba(205,235,255,0)');
      ctx.fillStyle = glow;
      ctx.fillRect(-it.w * 0.6, 0, it.w * 2.2, it.w * 1.3);
    } finally {
      resetPlane();
    }
  }

  const b: GameValue = box(it.x, it.y, it.w, it.h, it.z, '#dfe6e9', {
    left: '#e8edf0',
    right: '#b6c1c8',
    top: '#f3f6f7',
  });

  onFace(b, 'left', (W?: GameValue, H?: GameValue): GameValue => {
    ctx.fillStyle = '#c9d2d8';
    ctx.fillRect(0, 0, W, H);
    // freezer (sempre chiuso)
    const fH = H * freezerShare - 2;
    ctx.save();
    ctx.translate(1.5, 1.5);
    drawFridgeDoorPanel(ctx, W - 3, fH, fH * 0.45, fH * 0.45);
    drawFridgeDisplay(ctx, W - 3, fH, t);
    ctx.restore();
    // vano principale: si vede solo mentre la porta è aperta
    const mainTop = zTop - mainTopZ,
      mainH = mainTopZ - mainBottomZ;
    ctx.fillStyle = '#2d3436';
    ctx.fillRect(1.5, mainTop, W - 3, mainH);
    if (openK > 0.01) {
      ctx.save();
      ctx.translate(3, mainTop + 1.5);
      drawFridgeInterior(ctx, W - 6, mainH - 3, light, !game.player.hasFoodInInventory);
      ctx.restore();
    }
    // zoccolo con griglia di aerazione
    ctx.fillStyle = '#3d4852';
    ctx.fillRect(1.5, H - kick, W - 3, kick - 1);
    ctx.strokeStyle = 'rgba(255,255,255,0.18)';
    ctx.lineWidth = 0.8;
    for (let x = 6; x < W - 6; x += 4) {
      ctx.beginPath();
      ctx.moveTo(x, H - kick + 2);
      ctx.lineTo(x, H - 3);
      ctx.stroke();
    }
  });
  onFace(b, 'right', (W?: GameValue, H?: GameValue): GameValue => {
    const g = ctx.createLinearGradient(0, 0, W, 0);
    g.addColorStop(0, 'rgba(255,255,255,0.12)');
    g.addColorStop(1, 'rgba(0,0,0,0.08)');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, W, H);
    ctx.fillStyle = 'rgba(0,0,0,0.15)';
    ctx.fillRect(0, H * freezerShare - 1, W, 1.2);
    ctx.fillStyle = '#3d4852';
    ctx.fillRect(0, H - kick, W, kick - 1);
  });
  onFace(b, 'top', (W?: GameValue, H?: GameValue): GameValue => {
    ctx.fillStyle = 'rgba(255,255,255,0.25)';
    ctx.fillRect(0, 0, W, H * 0.15);
  });

  // porta principale che ruota sul cardine sinistro
  const ang = openK * FRIDGE_MAX_ANGLE;
  const ca = Math.cos(ang),
    sa = Math.sin(ang);
  const hingeX = x0 + 1.5;
  const doorW = it.w - 3,
    doorH = mainTopZ - mainBottomZ;
  const depth = FRIDGE_DOOR_DEPTH * Math.min(1, openK * 6);
  const fx = hingeX + doorW * ca,
    fy = y1 + doorW * sa;
  // spessore della porta sul lato libero
  if (depth > 0.2) {
    const ix = sa * depth,
      iy = -ca * depth;
    poly(
      [
        isoProject(fx, fy, mainTopZ),
        isoProject(fx + ix, fy + iy, mainTopZ),
        isoProject(fx + ix, fy + iy, mainBottomZ),
        isoProject(fx, fy, mainBottomZ),
      ],
      '#aab5bd',
      'rgba(0,0,0,0.3)',
    );
  }
  // Oltre i 45° chi guarda vede il lato interno della porta.
  if (ca - sa > 0) {
    setPlane([hingeX, y1, mainTopZ], [ca, sa, 0], [0, 0, -1]);
    try {
      drawFridgeDoorPanel(ctx, doorW, doorH, 6, doorH * 0.42);
      drawFridgeMagnets(ctx, doorW, doorH);
      if (openK > 0.01) {
        ctx.fillStyle = `rgba(0,0,0,${0.12 * Math.min(1, openK * 3)})`;
        ctx.fillRect(0, 0, doorW, doorH);
      }
    } finally {
      resetPlane();
    }
  } else {
    setPlane([hingeX + sa * depth, y1 - ca * depth, mainTopZ], [ca, sa, 0], [0, 0, -1]);
    try {
      drawFridgeDoorInside(ctx, doorW, doorH, light);
    } finally {
      resetPlane();
    }
  }

  // aria fredda che scivola fuori verso il pavimento
  if (light > 0.3) {
    const s = isoScale();
    for (let i = 0; i < 7; i++) {
      const ph = (t * 0.32 + i / 7) % 1;
      const p = isoProject(
        x0 + it.w * (0.15 + 0.7 * rnd(i + 3)) + Math.sin(t * 1.3 + i) * 3,
        y1 + 4 + ph * 26,
        mainBottomZ + 12 - ph * 14,
      );
      ctx.fillStyle = `rgba(235,245,255,${0.22 * (1 - ph) * light})`;
      ctx.beginPath();
      ctx.arc(p.x, p.y, (4 + ph * 9) * s, 0, 6.3);
      ctx.fill();
    }
  }
}

export function drawToilet(it?: GameValue): GameValue {
  const tank: GameValue = box(it.x, it.y - it.h / 2 + 8, it.w * 0.8, 14, 42, '#ffffff');
  onFace(tank, 'top', (W?: GameValue, H?: GameValue): GameValue => {
    game.view.ctx.fillStyle = '#b2bec3';
    game.view.ctx.fillRect(W / 2 - 4, H / 2 - 1.5, 8, 3);
  });
  const base: GameValue = box(it.x, it.y + 6, it.w * 0.55, it.h * 0.58, 18, '#f5f6fa');
  onFace(base, 'top', (W?: GameValue, H?: GameValue): GameValue => {
    game.view.ctx.fillStyle = '#dcdde1';
    game.view.ctx.beginPath();
    game.view.ctx.ellipse(W / 2, H / 2, W / 2, H / 2, 0, 0, 6.3);
    game.view.ctx.fill();
    game.view.ctx.fillStyle = '#9ad0f5';
    game.view.ctx.beginPath();
    game.view.ctx.ellipse(W / 2, H / 2, W / 3.3, H / 3.3, 0, 0, 6.3);
    game.view.ctx.fill();
  });
}

export function drawSink(it?: GameValue): GameValue {
  const cab: GameValue = box(it.x, it.y, it.w, it.h, it.z - 5, it.color || '#0984e3');
  onFace(cab, 'left', (W?: GameValue, H?: GameValue): GameValue => {
    game.view.ctx.strokeStyle = 'rgba(255,255,255,0.35)';
    game.view.ctx.strokeRect(3, 3, W / 2 - 4, H - 6);
    game.view.ctx.strokeRect(W / 2 + 1, 3, W / 2 - 4, H - 6);
    game.view.ctx.fillStyle = '#dfe6e9';
    game.view.ctx.fillRect(W / 2 - 5, H * 0.3, 2, 8);
    game.view.ctx.fillRect(W / 2 + 3, H * 0.3, 2, 8);
  });
  const top: GameValue = box(it.x, it.y, it.w + 4, it.h + 4, 5, '#f5f6fa', { z0: it.z - 5 });
  onFace(top, 'top', (W?: GameValue, H?: GameValue): GameValue => {
    game.view.ctx.fillStyle = '#c8d6e5';
    game.view.ctx.beginPath();
    game.view.ctx.ellipse(W / 2, H / 2 + 2, W * 0.32, H * 0.3, 0, 0, 6.3);
    game.view.ctx.fill();
    game.view.ctx.fillStyle = '#74b9ff';
    game.view.ctx.beginPath();
    game.view.ctx.ellipse(W / 2, H / 2 + 3, W * 0.22, H * 0.18, 0, 0, 6.3);
    game.view.ctx.fill();
  });
  box(it.x, it.y - it.h / 2 + 5, 4, 4, 12, '#b2bec3', { z0: it.z });
  box(it.x, it.y - it.h / 2 + 9, 4, 9, 3, '#b2bec3', { z0: it.z + 9 });
}

export function drawShower(it?: GameValue, t?: GameValue): GameValue {
  const sc: GameValue = isoScale();
  box(it.x, it.y, it.w, it.h, 6, '#dfe6e9');
  const H: GameValue = it.z;
  box(it.x - it.w / 2 + 6, it.y - it.h / 2 + 6, 3, 3, H - 12, '#b2bec3', { z0: 6 });
  box(it.x - it.w / 2 + 14, it.y - it.h / 2 + 8, 16, 8, 3, '#b2bec3', { z0: H - 12 });
  const occ: GameValue = game.frameShowerActors;
  if (occ.length) {
    occ.forEach((a?: GameValue): GameValue => {
      game.view.ctx.save();
      game.view.ctx.translate(0, -6 * sc);
      drawPlayerAvatar(a.x, a.y, '', t, a.look, false, '');
      game.view.ctx.restore();
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
          game.view.ctx.fillStyle = 'rgba(235,245,250,' + 0.5 * game.showerFog + ')';
          game.view.ctx.fillRect(0, 0, W, Hh);
        }
        game.view.ctx.strokeStyle = 'rgba(255,255,255,0.45)';
        game.view.ctx.lineWidth = 2;
        game.view.ctx.beginPath();
        game.view.ctx.moveTo(W * 0.15, Hh * 0.25);
        game.view.ctx.lineTo(W * 0.4, Hh * 0.08);
        game.view.ctx.moveTo(W * 0.2, Hh * 0.45);
        game.view.ctx.lineTo(W * 0.55, Hh * 0.18);
        game.view.ctx.stroke();
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
      game.view.ctx.fillStyle =
        'rgba(245,250,255,' + game.showerFog * 0.4 * Math.sin(Math.PI * ph) + ')';
      game.view.ctx.beginPath();
      game.view.ctx.arc(p.x, p.y, (9 + ph * 16) * sc, 0, 6.3);
      game.view.ctx.fill();
    }
  }
}

export function drawCounter(it?: GameValue): GameValue {
  const b: GameValue = box(it.x, it.y, it.w, it.h, it.z - 5, it.color || '#d35400');
  onFace(b, 'left', (W?: GameValue, H?: GameValue): GameValue => {
    woodGrain(W, H, 'rgba(0,0,0,0.15)', true, 10);
    game.view.ctx.fillStyle = 'rgba(255,255,255,0.9)';
    game.view.ctx.font = 'bold 9px sans-serif';
    game.view.ctx.textAlign = 'center';
    game.view.ctx.fillText('CASSA', W / 2, H / 2 + 3);
  });
  box(it.x, it.y, it.w + 6, it.h + 6, 5, '#f5f6fa', { z0: it.z - 5 });
  const reg: GameValue = box(it.x + it.w * 0.28, it.y, 22, 16, 12, '#2d3436', { z0: it.z });
  onFace(reg, 'left', (W?: GameValue, _H?: GameValue): GameValue => {
    game.view.ctx.fillStyle = '#55efc4';
    game.view.ctx.fillRect(3, 2, W - 6, 5);
  });
}

export function drawShelf(it?: GameValue, t?: GameValue): GameValue {
  const plat: GameValue = box(it.x, it.y, it.w, it.h, 12, '#f5f6fa');
  // Espone il prossimo acquisto (standard → pregiato → lusso); col lusso già preso mostra quello.
  const def: GameValue =
    nextUpgrade(game.furnitureCatalog, game.player.ownedFurniture, it.category) ||
    tiersOf(game.furnitureCatalog, it.category).at(-1);
  if (!def) return;
  onFace(plat, 'left', (W?: GameValue, H?: GameValue): GameValue => {
    game.view.ctx.fillStyle = { std: '#ff4757', premium: '#8e44ad', lux: '#f1c40f' }[tierOf(def)];
    game.view.ctx.fillRect(W / 2 - 13, 2, 26, H - 4);
    game.view.ctx.fillStyle = '#fff';
    game.view.ctx.font = 'bold 7px sans-serif';
    game.view.ctx.textAlign = 'center';
    game.view.ctx.fillText(def.price + '€', W / 2, H - 4);
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
  const b: GameValue = box(it.x, it.y - 10, Math.max(it.w, 64), 28, 2, '#7a2828', {
    edge: 'rgba(0,0,0,0.3)',
  });
  onFace(b, 'top', (W?: GameValue, H?: GameValue): GameValue => {
    game.view.ctx.strokeStyle = 'rgba(255,255,255,0.4)';
    game.view.ctx.setLineDash([3, 2]);
    game.view.ctx.strokeRect(3, 3, W - 6, H - 6);
    game.view.ctx.setLineDash([]);
    game.view.ctx.fillStyle = '#fff';
    game.view.ctx.font = 'bold 8px sans-serif';
    game.view.ctx.textAlign = 'center';
    game.view.ctx.fillText(text, W / 2, H / 2 + 3);
  });
}

export function drawSaloonDoor(key?: GameValue, it?: GameValue): GameValue {
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
  const b: GameValue = box(it.x, it.y, thinX ? 8 : it.w, thinX ? it.h : 8, 96, '#ecf0f1');
  onFace(b, thinX ? 'right' : 'left', (W?: GameValue, H?: GameValue): GameValue => {
    game.view.ctx.fillStyle = doorC;
    game.view.ctx.fillRect(5, 7, W - 10, H - 7);
    woodGrain(W, H, 'rgba(0,0,0,0.12)', true, 6);
    game.view.ctx.strokeStyle = 'rgba(0,0,0,0.28)';
    game.view.ctx.lineWidth = 1;
    game.view.ctx.strokeRect(9, 13, W - 18, H * 0.3);
    game.view.ctx.strokeRect(9, H * 0.48, W - 18, H * 0.42);
    game.view.ctx.fillStyle = '#f1c40f';
    game.view.ctx.beginPath();
    game.view.ctx.arc(W - 11, H * 0.55, 2.2, 0, 6.3);
    game.view.ctx.fill();
    if (sign) {
      game.view.ctx.fillStyle = 'rgba(255,255,255,0.92)';
      game.view.ctx.fillRect(W / 2 - 8, 15, 16, 12);
      game.view.ctx.fillStyle = '#2d3436';
      game.view.ctx.font = 'bold 9px sans-serif';
      game.view.ctx.textAlign = 'center';
      game.view.ctx.fillText(sign, W / 2, 24.5);
    }
  });
}

// Ingresso di un appartamento visto dal cortile: facciata con finestre e porta
export function drawCourtyardDoor(_key?: GameValue, it?: GameValue): GameValue {
  const mine: GameValue = hasRoom() && game.aptOfRoom(game.myAssignedRoomIdx) === it.aptIdx;
  const full: GameValue = freeRoomsInApt(it.aptIdx) === 0;
  const doorC: GameValue = mine ? '#2e86de' : full ? '#7f8c8d' : '#27ae60';
  const b: GameValue = box(it.x, it.y, 64, 10, 118, '#cdbfa8');
  onFace(b, 'left', (W?: GameValue, H?: GameValue): GameValue => {
    game.view.ctx.fillStyle = '#6d4c41';
    game.view.ctx.fillRect(0, 0, W, 5);
    game.view.ctx.fillStyle = 'rgba(135,206,235,0.9)';
    game.view.ctx.fillRect(W * 0.1, H * 0.14, W * 0.2, H * 0.2);
    game.view.ctx.fillRect(W * 0.7, H * 0.14, W * 0.2, H * 0.2);
    game.view.ctx.fillStyle = doorC;
    game.view.ctx.fillRect(W * 0.3, H * 0.42, W * 0.4, H * 0.58);
    game.view.ctx.strokeStyle = 'rgba(0,0,0,0.28)';
    game.view.ctx.lineWidth = 1;
    game.view.ctx.strokeRect(W * 0.34, H * 0.47, W * 0.32, H * 0.2);
    game.view.ctx.strokeRect(W * 0.34, H * 0.72, W * 0.32, H * 0.22);
    game.view.ctx.fillStyle = '#f1c40f';
    game.view.ctx.beginPath();
    game.view.ctx.arc(W * 0.64, H * 0.75, 1.8, 0, 6.3);
    game.view.ctx.fill();
    game.view.ctx.fillStyle = 'rgba(255,255,255,0.95)';
    game.view.ctx.fillRect(W / 2 - 9, H * 0.3, 18, 11);
    game.view.ctx.fillStyle = '#2d3436';
    game.view.ctx.font = 'bold 8px sans-serif';
    game.view.ctx.textAlign = 'center';
    game.view.ctx.fillText('A' + (it.aptIdx + 1), W / 2, H * 0.3 + 8.5);
  });
}

export function drawClothesRack(it?: GameValue): GameValue {
  const { x, y, w, z }: GameValue = it;
  const items: GameValue = game.shopCatalog.filter(
    (i?: GameValue): GameValue => i.slot === it.slot && !i.starter,
  );
  box(x, y, w, 12, 3, '#636e72');
  box(x - w / 2 + 3, y, 4, 4, z, '#b2bec3', { z0: 3 });
  box(x, y, w, 3, 3, '#dfe6e9', { z0: z - 1 });
  items.forEach((g?: GameValue, i?: GameValue): GameValue => {
    const gx: GameValue = x - w / 2 + 9 + (i * (w - 18)) / Math.max(1, items.length - 1);
    setPlane([gx - 8, y + (i % 2 ? -1.5 : 1.5), z - 3], [1, 0, 0], [0, 0, -1]);
    drawShirtShape(
      8,
      2,
      15,
      it.slot === 'pants' ? 34 : 27,
      g.color,
      it.slot === 'pants' ? 'pants' : 'top',
    );
    if (g.style === 'stripes') {
      game.view.ctx.fillStyle = g.color2;
      for (let v: GameValue = 8; v < 27; v += 4) game.view.ctx.fillRect(3, v, 10, 1.5);
    }
    resetPlane();
  });
  box(x + w / 2 - 3, y, 4, 4, z, '#b2bec3', { z0: 3 });
  const sign: GameValue = box(x, y + 8, 22, 2, 10, '#ffffff', { z0: 3 });
  onFace(sign, 'left', (W?: GameValue, H?: GameValue): GameValue => {
    game.view.ctx.fillStyle = '#e84393';
    game.view.ctx.font = 'bold 6px sans-serif';
    game.view.ctx.textAlign = 'center';
    game.view.ctx.fillText(game.SLOT_INFO[it.slot].label.toUpperCase(), W / 2, H - 3);
  });
}

export function drawDisplayShelf(it?: GameValue, _t?: GameValue): GameValue {
  const { x, y, w, h }: GameValue = it;
  void box(x, y - h / 2 + 2, w, 4, it.z + 26, '#f5f6fa');
  const low: GameValue = box(x, y + 2, w, h - 4, it.z * 0.45, '#ffffff');
  onFace(low, 'left', (W?: GameValue, _H?: GameValue): GameValue => {
    game.view.ctx.fillStyle = '#e84393';
    game.view.ctx.fillRect(0, 2, W, 3);
  });
  box(x, y - 2, w, h - 10, 3, '#dfe6e9', { z0: it.z + 6 });
  const items: GameValue = game.shopCatalog.filter(
    (i?: GameValue): GameValue => i.slot === it.slot && !i.starter,
  );
  const s: GameValue = isoScale();
  items.forEach((g?: GameValue, i?: GameValue): GameValue => {
    const upper: GameValue = i % 2 === 0,
      k: GameValue = Math.floor(i / 2);
    const gx: GameValue =
      x - w / 2 + 10 + (k * (w - 20)) / Math.max(1, Math.ceil(items.length / 2) - 1);
    const gz: GameValue = upper ? it.z + 9 : it.z * 0.45;
    const gy: GameValue = upper ? y - 6 : y + 4;
    if (it.slot === 'shoes') {
      box(gx - 3, gy, 5, 10, 4, g.color, { z0: gz });
      box(gx + 3, gy + 1, 5, 10, 4, g.color, { z0: gz });
    } else {
      const hp: GameValue = isoProject(gx, gy, gz + 7);
      game.view.ctx.fillStyle = '#ced6e0';
      game.view.ctx.beginPath();
      game.view.ctx.arc(hp.x, hp.y, 6 * s, 0, 6.3);
      game.view.ctx.fill();
      box(gx, gy, 3, 3, 2, '#a4b0be', { z0: gz });
      drawHat({ x: hp.x, y: hp.y + 1 * s }, s * 0.66, g);
    }
  });
}

export function drawGlassesStand(it?: GameValue, _t?: GameValue): GameValue {
  const b: GameValue = box(it.x, it.y, it.w, it.h, it.z - 18, '#ffffff');
  onFace(b, 'left', (W?: GameValue, _H?: GameValue): GameValue => {
    game.view.ctx.fillStyle = '#e84393';
    game.view.ctx.fillRect(0, 3, W, 2.5);
  });
  const items: GameValue = game.shopCatalog.filter(
    (i?: GameValue): GameValue => i.slot === 'glasses',
  );
  const s: GameValue = isoScale();
  items.forEach((g?: GameValue, i?: GameValue): GameValue => {
    const gx: GameValue = it.x - it.w / 2 + 7 + (i * (it.w - 14)) / Math.max(1, items.length - 1);
    box(gx, it.y, 3, 3, 8, '#a4b0be', { z0: it.z - 18 });
    const hp: GameValue = isoProject(gx, it.y, it.z - 2);
    game.view.ctx.fillStyle = '#ced6e0';
    game.view.ctx.beginPath();
    game.view.ctx.arc(hp.x, hp.y, 7 * s, 0, 6.3);
    game.view.ctx.fill();
    drawGlasses({ x: hp.x, y: hp.y - 1 * s }, s * 0.8, g);
  });
}

export function drawBoutiqueCounter(it?: GameValue): GameValue {
  const b: GameValue = box(it.x, it.y, it.w, it.h, it.z - 5, '#e84393');
  onFace(b, 'left', (W?: GameValue, H?: GameValue): GameValue => {
    game.view.ctx.fillStyle = 'rgba(255,255,255,0.18)';
    for (let u: GameValue = 6; u < W; u += 12) game.view.ctx.fillRect(u, 0, 4, H);
    game.view.ctx.fillStyle = '#ffffff';
    game.view.ctx.font = 'bold 9px sans-serif';
    game.view.ctx.textAlign = 'center';
    game.view.ctx.fillText('BOUTIQUE', W / 2, H / 2 + 3);
  });
  box(it.x, it.y, it.w + 6, it.h + 6, 5, '#ffffff', { z0: it.z - 5 });
  const reg: GameValue = box(it.x + it.w * 0.28, it.y, 22, 16, 12, '#2d3436', { z0: it.z });
  onFace(reg, 'left', (W?: GameValue, _H?: GameValue): GameValue => {
    game.view.ctx.fillStyle = '#fd79a8';
    game.view.ctx.fillRect(3, 2, W - 6, 5);
  });
  [
    ['#ffffff', -0.3],
    ['#fd79a8', -0.12],
  ].forEach(([c, k]: GameValue = {}): GameValue => {
    const bag: GameValue = box(it.x + it.w * k, it.y, 14, 8, 16, c, { z0: it.z });
    onFace(bag, 'left', (W?: GameValue, _H?: GameValue): GameValue => {
      game.view.ctx.strokeStyle = '#2d3436';
      game.view.ctx.lineWidth = 1;
      game.view.ctx.beginPath();
      game.view.ctx.arc(W / 2, 0, 4, Math.PI, 0);
      game.view.ctx.stroke();
    });
  });
}

export function drawBoutiqueItem(k?: GameValue, item?: GameValue, t?: GameValue): GameValue {
  if (k === 'clothesCounter') return drawBoutiqueCounter(item);
  if (k.startsWith('rack')) return drawClothesRack(item);
  if (k === 'standGlasses') return drawGlassesStand(item, t);
  return drawDisplayShelf(item, t);
}

export function drawMannequinProp(it?: GameValue, _t?: GameValue): GameValue {
  box(it.x, it.y, 18, 18, 3, '#2d3436');
  const look: GameValue = resolveLook(parseLook(it.look));
  look.mannequin = true;
  drawPlayerAvatar(it.x, it.y, '', 0, look, false, '');
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
  if (k === 'doorExit' || k === 'exitHouse')
    return drawExitMat(item, k === 'exitHouse' ? 'ESCI DI CASA' : 'USCITA');
  // Gli oggetti da parete (il quadro) si disegnano sulla parete, non sul pavimento.
  if (item.wallItem) return;
  if (game.view.activeEnvironment === 'CORTILE') return drawCourtyardDoor(k, item);
  if (game.view.activeEnvironment === 'SALOON') return drawSaloonDoor(k, item);
  if (game.view.activeEnvironment === 'negozio_vestiti') {
    softShadow(item.x, item.y, item.w, item.h);
    return drawBoutiqueItem(k, item, t);
  }
  if (k.startsWith('shelf')) return drawShelf(item, t);
  // Piante e lampade sono uguali da ogni lato: la rotazione non cambia il loro aspetto.
  const symmetric = k === 'plant' || k === 'lamp';
  withFurnitureRotation(symmetric ? { ...item, rot: 0 } : item, () => {
    softShadow(item.x, item.y, item.w, item.h);
    drawFurnitureByKind(k, item, t, lights);
  });
}

// ---------------------------------------------------------------- OGGETTI DEGLI AMBIENTI
export function drawTreeProp(it?: GameValue, t?: GameValue): GameValue {
  const s: GameValue = isoScale(),
    k: GameValue = it.size || 1;
  ellipseShadow(it.x + 6, it.y + 6, 34 * k, 17 * k, 0.22);
  const trunk: GameValue = box(it.x, it.y, 10 * k, 10 * k, 52 * k, '#7b4a2e');
  onFace(
    trunk,
    'left',
    (W?: GameValue, H?: GameValue): GameValue => woodGrain(W, H, 'rgba(0,0,0,0.3)', true, 3),
  );
  const sway: GameValue = Math.sin(t * 0.8 + it.x) * 1.5 * s;
  [
    [0, 0, 60, 19],
    [-14, 6, 52, 15],
    [12, -8, 54, 15],
    [4, 12, 48, 14],
    [-6, -10, 74, 15],
    [8, 6, 78, 13],
  ].forEach(([dx, dy, z, r]: GameValue = {}): GameValue => {
    const p: GameValue = isoProject(it.x + dx * k, it.y + dy * k, z * k);
    const R: GameValue = r * k * s;
    const g: GameValue = game.view.ctx.createRadialGradient(
      p.x - R * 0.35 + sway,
      p.y - R * 0.45,
      R * 0.15,
      p.x + sway,
      p.y,
      R,
    );
    g.addColorStop(0, '#8fdc72');
    g.addColorStop(0.55, '#45a845');
    g.addColorStop(1, '#22702c');
    game.view.ctx.fillStyle = g;
    game.view.ctx.beginPath();
    game.view.ctx.arc(p.x + sway, p.y, R, 0, Math.PI * 2);
    game.view.ctx.fill();
  });
}

export function drawFountainProp(it?: GameValue, t?: GameValue): GameValue {
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
    const g: GameValue = game.view.ctx.createLinearGradient(0, 0, W, H);
    g.addColorStop(0, '#2f80c0');
    g.addColorStop(1, '#5dade2');
    game.view.ctx.fillStyle = g;
    game.view.ctx.fillRect(6, 6, W - 12, H - 12);
    for (let i: GameValue = 0; i < 3; i++) {
      const r: GameValue = (t * 10 + i * 10) % 30;
      game.view.ctx.strokeStyle = `rgba(255,255,255,${Math.max(0, 0.55 - r / 55)})`;
      game.view.ctx.lineWidth = 1;
      game.view.ctx.beginPath();
      game.view.ctx.ellipse(W / 2, H / 2, r, r, 0, 0, 6.3);
      game.view.ctx.stroke();
    }
  });
  box(it.x, it.y, 10, 10, 32, '#d5d0c6', { z0: 16 });
  const bowl: GameValue = box(it.x, it.y, 28, 28, 5, '#cfc8bb', { z0: 46 });
  onFace(bowl, 'top', (W?: GameValue, H?: GameValue): GameValue => {
    game.view.ctx.fillStyle = '#5dade2';
    game.view.ctx.fillRect(3, 3, W - 6, H - 6);
  });
  const top: GameValue = isoProject(it.x, it.y, 58),
    s: GameValue = isoScale();
  game.view.ctx.strokeStyle = 'rgba(210,240,255,0.85)';
  game.view.ctx.lineWidth = 1.5;
  for (let i: GameValue = 0; i < 6; i++) {
    const a: GameValue = (i / 6) * Math.PI * 2 + t * 0.4;
    const dx: GameValue = Math.cos(a) * 20 * s,
      dy: GameValue = Math.sin(a) * 10 * s;
    game.view.ctx.beginPath();
    game.view.ctx.moveTo(top.x, top.y);
    game.view.ctx.quadraticCurveTo(
      top.x + dx * 0.5,
      top.y - 14 * s,
      top.x + dx,
      top.y + 18 * s + dy,
    );
    game.view.ctx.stroke();
  }
  game.view.ctx.fillStyle = 'rgba(230,248,255,0.9)';
  for (let i: GameValue = 0; i < 10; i++) {
    const ph: GameValue = (t * 1.3 + i * 0.1) % 1,
      a: GameValue = i * 2.4;
    game.view.ctx.beginPath();
    game.view.ctx.arc(
      top.x + Math.cos(a) * 20 * s * ph,
      top.y - 10 * s + ph * ph * 30 * s + Math.sin(a) * 6 * s * ph,
      1.2 * s,
      0,
      6.3,
    );
    game.view.ctx.fill();
  }
}

export function drawBenchProp(it?: GameValue): GameValue {
  const { x, y, w, h }: GameValue = it;
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
  void box(it.x, it.y, it.w, it.h, 4, '#5d4037', { edge: 'rgba(0,0,0,0.2)' });
  const cols: GameValue = ['#ff6b81', '#feca57', '#ff9ff3', '#ffffff', '#ff4757', '#a29bfe'];
  const s: GameValue = isoScale();
  for (let i: GameValue = 0; i < 16; i++) {
    const px: GameValue = it.x - it.w / 2 + 5 + rnd(i + it.x) * (it.w - 10),
      py: GameValue = it.y - it.h / 2 + 4 + rnd(i * 3 + it.y) * (it.h - 8);
    const base: GameValue = isoProject(px, py, 4),
      tip: GameValue = isoProject(px, py, 10 + rnd(i) * 6);
    game.view.ctx.strokeStyle = '#2e7d32';
    game.view.ctx.lineWidth = 1;
    game.view.ctx.beginPath();
    game.view.ctx.moveTo(base.x, base.y);
    game.view.ctx.lineTo(tip.x, tip.y);
    game.view.ctx.stroke();
    game.view.ctx.fillStyle = cols[i % cols.length];
    game.view.ctx.beginPath();
    game.view.ctx.arc(tip.x, tip.y, 2.4 * s, 0, 6.3);
    game.view.ctx.fill();
  }
}

export function drawPalmProp(it?: GameValue, t?: GameValue): GameValue {
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
    game.view.ctx.strokeStyle = i % 2 ? '#1e8449' : '#27ae60';
    game.view.ctx.lineWidth = 6 * s;
    game.view.ctx.lineCap = 'round';
    game.view.ctx.beginPath();
    game.view.ctx.moveTo(top.x, top.y);
    game.view.ctx.quadraticCurveTo(top.x + Math.cos(a) * 24 * s, top.y - 12 * s, ex, ey);
    game.view.ctx.stroke();
  }
  game.view.ctx.fillStyle = '#6d4c41';
  [
    [-3, 3],
    [3, 4],
    [0, 6],
  ].forEach(([dx, dy]: GameValue = {}): GameValue => {
    game.view.ctx.beginPath();
    game.view.ctx.arc(top.x + dx * s, top.y + dy * s, 3 * s, 0, 6.3);
    game.view.ctx.fill();
  });
  game.view.ctx.lineCap = 'butt';
}

export function drawUmbrellaProp(it?: GameValue): GameValue {
  const s: GameValue = isoScale();
  box(it.x, it.y, 3, 3, 62, '#ecf0f1');
  const c: GameValue = isoProject(it.x, it.y, 62);
  for (let i: GameValue = 0; i < 8; i++) {
    game.view.ctx.fillStyle = i % 2 ? '#ffffff' : '#e74c3c';
    game.view.ctx.beginPath();
    game.view.ctx.moveTo(c.x, c.y - 10 * s);
    game.view.ctx.ellipse(
      c.x,
      c.y,
      38 * s,
      18 * s,
      0,
      (i / 8) * Math.PI * 2,
      ((i + 1) / 8) * Math.PI * 2,
    );
    game.view.ctx.closePath();
    game.view.ctx.fill();
  }
  game.view.ctx.strokeStyle = 'rgba(0,0,0,0.2)';
  game.view.ctx.beginPath();
  game.view.ctx.ellipse(c.x, c.y, 38 * s, 18 * s, 0, 0, 6.3);
  game.view.ctx.stroke();
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
  game.view.ctx.strokeStyle = '#2d3436';
  game.view.ctx.beginPath();
  game.view.ctx.moveTo(f.x, f.y);
  game.view.ctx.lineTo(f.x, f.y - 14 * s);
  game.view.ctx.stroke();
  game.view.ctx.fillStyle = '#e74c3c';
  game.view.ctx.beginPath();
  game.view.ctx.moveTo(f.x, f.y - 14 * s);
  game.view.ctx.lineTo(f.x + 9 * s, f.y - 11 * s);
  game.view.ctx.lineTo(f.x, f.y - 8 * s);
  game.view.ctx.fill();
}

export function drawBallProp(it?: GameValue, t?: GameValue): GameValue {
  const s: GameValue = isoScale(),
    p: GameValue = isoProject(it.x, it.y, 7 + Math.abs(Math.sin(t * 2)) * 4);
  ellipseShadow(it.x, it.y, 7, 3.5);
  ['#e74c3c', '#ffffff', '#3498db', '#f1c40f'].forEach(
    (c?: GameValue, i?: GameValue): GameValue => {
      game.view.ctx.fillStyle = c;
      game.view.ctx.beginPath();
      game.view.ctx.moveTo(p.x, p.y);
      game.view.ctx.arc(p.x, p.y, 7 * s, (i * Math.PI) / 2 + t, ((i + 1) * Math.PI) / 2 + t);
      game.view.ctx.fill();
    },
  );
}

export function drawCraneProp(it?: GameValue, t?: GameValue): GameValue {
  box(it.x, it.y, it.w, it.h, 12, '#7f8c8d');
  const lattice: GameValue = (W?: GameValue, H?: GameValue): GameValue => {
    game.view.ctx.strokeStyle = 'rgba(0,0,0,0.5)';
    game.view.ctx.lineWidth = 0.8;
    for (let v: GameValue = 0; v < H; v += 12) {
      game.view.ctx.beginPath();
      game.view.ctx.moveTo(0, v);
      game.view.ctx.lineTo(W, v + 12);
      game.view.ctx.moveTo(W, v);
      game.view.ctx.lineTo(0, v + 12);
      game.view.ctx.moveTo(0, v);
      game.view.ctx.lineTo(W, v);
      game.view.ctx.stroke();
    }
  };
  const m: GameValue = box(it.x, it.y, 12, 12, 180, '#f1c40f', { z0: 12 });
  onFace(m, 'left', lattice);
  onFace(m, 'right', lattice);
  box(it.x - 22, it.y, 36, 8, 8, '#f1c40f', { z0: 192 });
  box(it.x - 34, it.y, 14, 14, 14, '#7f8c8d', { z0: 186 });
  const cab: GameValue = box(it.x + 2, it.y + 4, 16, 14, 14, '#e67e22', { z0: 192 });
  onFace(cab, 'left', (W?: GameValue, H?: GameValue): GameValue => {
    game.view.ctx.fillStyle = '#d6eaf8';
    game.view.ctx.fillRect(3, 3, W - 6, H / 2);
  });
  const jib: GameValue = box(it.x + 85, it.y, 160, 8, 8, '#f1c40f', { z0: 200 });
  onFace(jib, 'left', lattice);
  const sw: GameValue = Math.sin(t * 0.9) * 8;
  const a: GameValue = isoProject(it.x + 140, it.y, 200),
    b2: GameValue = isoProject(it.x + 140 + sw, it.y, 92);
  game.view.ctx.strokeStyle = '#2d3436';
  game.view.ctx.lineWidth = 1;
  game.view.ctx.beginPath();
  game.view.ctx.moveTo(a.x, a.y);
  game.view.ctx.lineTo(b2.x, b2.y);
  game.view.ctx.stroke();
  const load: GameValue = box(it.x + 140 + sw, it.y, 20, 20, 12, '#b5523b', { z0: 80 });
  onFace(load, 'left', brickPattern);
}

export function brickPattern(W?: GameValue, H?: GameValue): GameValue {
  game.view.ctx.strokeStyle = 'rgba(255,255,255,0.35)';
  game.view.ctx.lineWidth = 0.8;
  for (let v: GameValue = 0, r: GameValue = 0; v < H; v += 6, r++) {
    game.view.ctx.beginPath();
    game.view.ctx.moveTo(0, v);
    game.view.ctx.lineTo(W, v);
    game.view.ctx.stroke();
    for (let u: GameValue = (r % 2) * 6; u < W; u += 12) {
      game.view.ctx.beginPath();
      game.view.ctx.moveTo(u, v);
      game.view.ctx.lineTo(u, v + 6);
      game.view.ctx.stroke();
    }
  }
}

export function drawBricksProp(it?: GameValue): GameValue {
  const pal: GameValue = box(it.x, it.y, it.w, it.h, 7, '#a0784e');
  onFace(pal, 'left', (W?: GameValue, H?: GameValue): GameValue => {
    game.view.ctx.fillStyle = 'rgba(0,0,0,0.4)';
    for (let u: GameValue = 4; u < W; u += 14) game.view.ctx.fillRect(u, 2, 6, H - 3);
  });
  const st: GameValue = box(it.x, it.y, it.w - 6, it.h - 6, 30, '#b5523b', { z0: 7 });
  onFace(st, 'left', brickPattern);
  onFace(st, 'right', brickPattern);
}

export function drawMixerProp(it?: GameValue, t?: GameValue): GameValue {
  box(it.x, it.y, it.w, it.h * 0.6, 14, '#e67e22');
  const c: GameValue = isoProject(it.x, it.y, 34),
    s: GameValue = isoScale();
  game.view.ctx.save();
  game.view.ctx.translate(c.x, c.y);
  game.view.ctx.rotate(-0.5);
  const g: GameValue = game.view.ctx.createLinearGradient(-20 * s, 0, 20 * s, 0);
  g.addColorStop(0, '#f39c12');
  g.addColorStop(1, '#ca6f1e');
  game.view.ctx.fillStyle = g;
  game.view.ctx.beginPath();
  game.view.ctx.ellipse(0, 0, 22 * s, 15 * s, 0, 0, 6.3);
  game.view.ctx.fill();
  game.view.ctx.strokeStyle = 'rgba(0,0,0,0.35)';
  game.view.ctx.lineWidth = 2;
  const r: GameValue = (t * 2) % (Math.PI * 2);
  game.view.ctx.beginPath();
  game.view.ctx.ellipse(0, 0, 22 * s * Math.abs(Math.cos(r)), 15 * s, 0, 0, 6.3);
  game.view.ctx.stroke();
  game.view.ctx.fillStyle = '#2d3436';
  game.view.ctx.beginPath();
  game.view.ctx.ellipse(18 * s, -2 * s, 5 * s, 8 * s, 0, 0, 6.3);
  game.view.ctx.fill();
  game.view.ctx.restore();
}

export function drawConeProp(it?: GameValue): GameValue {
  const b: GameValue = isoProject(it.x, it.y, 0),
    tp: GameValue = isoProject(it.x, it.y, 24),
    s: GameValue = isoScale();
  box(it.x, it.y, 12, 12, 2, '#2d3436');
  game.view.ctx.fillStyle = '#ff7f27';
  game.view.ctx.beginPath();
  game.view.ctx.moveTo(tp.x, tp.y);
  game.view.ctx.lineTo(b.x + 6 * s, b.y - 1);
  game.view.ctx.lineTo(b.x - 6 * s, b.y - 1);
  game.view.ctx.fill();
  game.view.ctx.fillStyle = '#ffffff';
  game.view.ctx.fillRect(b.x - 3.5 * s, b.y - 13 * s, 7 * s, 3 * s);
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
  box(it.x, it.y, 12, 12, 2, '#7f8c8d');
  box(it.x, it.y, 2, 2, 90, '#bdc3c7', { z0: 2 });
  void box(it.x + 5, it.y, 8, 4, 16, '#d6eaf8', {
    z0: 66,
    left: 'rgba(214,234,248,0.85)',
    right: 'rgba(174,214,241,0.85)',
  });
  const a: GameValue = isoProject(it.x + 5, it.y, 66),
    b: GameValue = isoProject(it.x + 30, it.y + 20, 36);
  game.view.ctx.strokeStyle = 'rgba(255,255,255,0.7)';
  game.view.ctx.lineWidth = 1;
  game.view.ctx.beginPath();
  game.view.ctx.moveTo(a.x, a.y);
  game.view.ctx.quadraticCurveTo(a.x + 10, a.y + 30, b.x, b.y);
  game.view.ctx.stroke();
}

export function drawHeartMonitorProp(it?: GameValue, t?: GameValue): GameValue {
  box(it.x, it.y, it.w, it.h, 40, '#95a5a6');
  const scr: GameValue = box(it.x, it.y, it.w, it.h, 24, '#2d3436', { z0: 40 });
  onFace(scr, 'left', (W?: GameValue, H?: GameValue): GameValue => {
    game.view.ctx.fillStyle = '#071a0e';
    game.view.ctx.fillRect(2, 2, W - 4, H - 4);
    game.view.ctx.strokeStyle = '#2ecc71';
    game.view.ctx.lineWidth = 1.2;
    game.view.ctx.beginPath();
    for (let u: GameValue = 2; u < W - 2; u++) {
      const ph: GameValue = (u / (W - 4) + t * 0.8) % 1;
      let v: GameValue = H / 2;
      if (ph > 0.45 && ph < 0.5) v -= (ph - 0.45) * 160;
      else if (ph >= 0.5 && ph < 0.55) v += (0.55 - ph) * 160 - 4;
      u === 2 ? game.view.ctx.moveTo(u, v) : game.view.ctx.lineTo(u, v);
    }
    game.view.ctx.stroke();
  });
}

export function drawMedCabinetProp(it?: GameValue): GameValue {
  const b: GameValue = box(it.x, it.y, it.w, it.h, it.z, '#f5f6fa');
  onFace(b, 'left', (W?: GameValue, H?: GameValue): GameValue => {
    game.view.ctx.fillStyle = 'rgba(174,214,241,0.55)';
    game.view.ctx.fillRect(4, 4, W / 2 - 6, H * 0.55);
    game.view.ctx.fillRect(W / 2 + 2, 4, W / 2 - 6, H * 0.55);
    const cols: GameValue = ['#e74c3c', '#3498db', '#f1c40f', '#2ecc71'];
    for (let i: GameValue = 0; i < 8; i++) {
      game.view.ctx.fillStyle = cols[i % 4];
      game.view.ctx.fillRect(7 + ((i % 4) * (W - 14)) / 4, 8 + Math.floor(i / 4) * 22, 6, 12);
    }
    game.view.ctx.fillStyle = '#e74c3c';
    game.view.ctx.fillRect(W / 2 - 3, H * 0.66, 6, 18);
    game.view.ctx.fillRect(W / 2 - 9, H * 0.66 + 6, 18, 6);
  });
}

export function drawChair(
  x?: GameValue,
  y?: GameValue,
  color?: GameValue,
  backSide: GameValue = 'y0',
): GameValue {
  box(x, y, 14, 14, 16, game.darken(color, 0.3));
  box(x, y, 16, 16, 3, color, { z0: 16 });
  if (backSide === 'y0') box(x, y - 7, 16, 3, 18, color, { z0: 19 });
  else box(x - 7, y, 3, 16, 18, color, { z0: 19 });
}

export function drawWaitingChairsProp(it?: GameValue): GameValue {
  for (let i: GameValue = 0; i < 3; i++)
    drawChair(it.x - it.w / 2 + 14 + (i * (it.w - 28)) / 2, it.y, '#2e86de');
}

export function drawRestCounterProp(it?: GameValue): GameValue {
  const b: GameValue = box(it.x, it.y, it.w, it.h, it.z - 5, '#8d5a3b');
  onFace(b, 'left', (W?: GameValue, H?: GameValue): GameValue => {
    woodGrain(W, H, 'rgba(0,0,0,0.2)', true, 12);
    game.view.ctx.fillStyle = 'rgba(0,0,0,0.25)';
    game.view.ctx.fillRect(0, H - 6, W, 6);
  });
  box(it.x, it.y, it.w + 6, it.h + 6, 5, '#ecf0f1', { z0: it.z - 5 });
  [-0.3, 0, 0.3].forEach((k?: GameValue, i?: GameValue): GameValue => {
    const d: GameValue = box(it.x + it.w * k, it.y, 18, 18, 3, '#ffffff', { z0: it.z });
    onFace(d, 'top', (W?: GameValue, H?: GameValue): GameValue => {
      game.view.ctx.fillStyle = ['#e17055', '#fdcb6e', '#00b894'][i];
      game.view.ctx.beginPath();
      game.view.ctx.ellipse(W / 2, H / 2, W * 0.3, H * 0.3, 0, 0, 6.3);
      game.view.ctx.fill();
    });
  });
}

export function drawChefStoveProp(it?: GameValue, t?: GameValue): GameValue {
  const b: GameValue = box(it.x, it.y, it.w, it.h, it.z - 4, '#b2bec3');
  onFace(b, 'left', (W?: GameValue, H?: GameValue): GameValue => {
    game.view.ctx.fillStyle = '#2d3436';
    game.view.ctx.fillRect(5, 10, W - 10, H - 16);
    game.view.ctx.fillStyle = 'rgba(255,120,0,0.3)';
    game.view.ctx.fillRect(8, 13, W - 16, H - 22);
  });
  box(it.x, it.y, it.w, it.h, 4, '#2d3436', { z0: it.z - 4 });
  const s: GameValue = isoScale();
  [
    [-0.2, -0.2],
    [0.2, 0.2],
  ].forEach(([kx, ky]: GameValue = {}, i?: GameValue): GameValue => {
    const p: GameValue = isoProject(it.x + it.w * kx, it.y + it.h * ky, it.z);
    for (let f: GameValue = 0; f < 5; f++) {
      const fl: GameValue = 6 + Math.sin(t * 12 + f * 2 + i) * 3;
      game.view.ctx.fillStyle = f % 2 ? 'rgba(255,200,0,0.9)' : 'rgba(255,90,0,0.9)';
      game.view.ctx.beginPath();
      game.view.ctx.moveTo(p.x + (f - 2) * 3 * s, p.y);
      game.view.ctx.lineTo(p.x + (f - 2) * 3 * s + 1.5 * s, p.y - fl * s);
      game.view.ctx.lineTo(p.x + (f - 2) * 3 * s + 3 * s, p.y);
      game.view.ctx.fill();
    }
    const pan: GameValue = box(it.x + it.w * kx, it.y + it.h * ky, 18, 18, 7, '#636e72', {
      z0: it.z + 4,
    });
    onFace(pan, 'top', (W?: GameValue, H?: GameValue): GameValue => {
      game.view.ctx.fillStyle = i ? '#e17055' : '#fab1a0';
      game.view.ctx.fillRect(2, 2, W - 4, H - 4);
    });
  });
}

export function drawDinnerTableProp(it?: GameValue): GameValue {
  const { x, y, w, h }: GameValue = it;
  drawChair(x, y - h / 2 - 2, '#a0522d');
  box(x, y, 6, 6, 30, '#5d4037');
  const top: GameValue = box(x, y, w, h, 8, '#ffffff', { z0: 28 });
  onFace(top, 'left', (W?: GameValue, H?: GameValue): GameValue => {
    game.view.ctx.strokeStyle = 'rgba(0,0,0,0.12)';
    for (let u: GameValue = 6; u < W; u += 10) {
      game.view.ctx.beginPath();
      game.view.ctx.moveTo(u, 0);
      game.view.ctx.lineTo(u, H);
      game.view.ctx.stroke();
    }
  });
  onFace(top, 'top', (W?: GameValue, H?: GameValue): GameValue => {
    game.view.ctx.fillStyle = '#c0392b';
    game.view.ctx.fillRect(W / 2 - 5, 0, 10, H);
    [
      [0.28, 0.3],
      [0.72, 0.7],
    ].forEach(([u, v]: GameValue = {}): GameValue => {
      game.view.ctx.fillStyle = '#f5f6fa';
      game.view.ctx.beginPath();
      game.view.ctx.ellipse(W * u, H * v, 7, 7, 0, 0, 6.3);
      game.view.ctx.fill();
      game.view.ctx.strokeStyle = 'rgba(0,0,0,0.15)';
      game.view.ctx.stroke();
      game.view.ctx.fillStyle = '#e17055';
      game.view.ctx.beginPath();
      game.view.ctx.ellipse(W * u, H * v, 3.5, 3.5, 0, 0, 6.3);
      game.view.ctx.fill();
    });
  });
  box(x + w * 0.2, y - h * 0.15, 3, 3, 8, 'rgba(200,230,255,0.8)', {
    z0: 36,
    left: 'rgba(200,230,255,0.7)',
    right: 'rgba(170,210,240,0.7)',
  });
  drawChair(x + w / 2 + 2, y, '#a0522d', 'x');
}

export function drawOfficeDeskProp(it?: GameValue, t?: GameValue): GameValue {
  drawDesk({ x: it.x, y: it.y, w: it.w, h: it.h, z: it.z + 20, name: '' }, t);
  box(it.x, it.y + it.h / 2 + 12, 16, 16, 18, '#2d3436');
  box(it.x, it.y + it.h / 2 + 12, 18, 18, 4, '#34495e', { z0: 18 });
  box(it.x, it.y + it.h / 2 + 20, 18, 3, 22, '#34495e', { z0: 22 });
}

export function drawArchiveProp(it?: GameValue): GameValue {
  const b: GameValue = box(it.x, it.y, it.w, it.h, it.z, '#95a5a6');
  onFace(b, 'left', (W?: GameValue, H?: GameValue): GameValue => {
    for (let i: GameValue = 0; i < 4; i++) {
      const v: GameValue = 3 + (i * (H - 6)) / 4;
      game.view.ctx.strokeStyle = 'rgba(0,0,0,0.35)';
      game.view.ctx.strokeRect(3, v, W - 6, (H - 6) / 4 - 3);
      game.view.ctx.fillStyle = '#ecf0f1';
      game.view.ctx.fillRect(W / 2 - 6, v + 4, 12, 5);
      game.view.ctx.fillStyle = '#2d3436';
      game.view.ctx.fillRect(W / 2 - 4, v + 12, 8, 2);
    }
  });
}

export function drawCoolerProp(it?: GameValue): GameValue {
  const b: GameValue = box(it.x, it.y, it.w, it.h, it.z - 24, '#ecf0f1');
  onFace(b, 'left', (W?: GameValue, _H?: GameValue): GameValue => {
    game.view.ctx.fillStyle = '#0984e3';
    game.view.ctx.fillRect(W / 2 - 4, 10, 3, 4);
    game.view.ctx.fillStyle = '#d63031';
    game.view.ctx.fillRect(W / 2 + 2, 10, 3, 4);
  });
  box(it.x, it.y, it.w * 0.8, it.h * 0.8, 24, '#74b9ff', {
    z0: it.z - 24,
    left: 'rgba(116,185,255,0.7)',
    right: 'rgba(84,160,255,0.7)',
    top: 'rgba(160,210,255,0.8)',
  });
}

export function drawBarCounterProp(it?: GameValue): GameValue {
  const b: GameValue = box(it.x, it.y, it.w, it.h, it.z - 5, '#4e342e');
  onFace(b, 'left', (W?: GameValue, H?: GameValue): GameValue => {
    for (let u: GameValue = 0; u < W; u += 10) {
      game.view.ctx.fillStyle = u % 20 ? '#5d4037' : '#4e342e';
      game.view.ctx.fillRect(u, 0, 10, H);
    }
    game.view.ctx.fillStyle = '#d4ac0d';
    game.view.ctx.fillRect(0, H - 6, W, 2);
  });
  box(it.x, it.y, it.w + 8, it.h + 8, 5, '#212121', { z0: it.z - 5 });
  [-0.3, -0.1, 0.1].forEach((k?: GameValue): GameValue => {
    box(it.x + it.w * k, it.y - 4, 3, 3, 16, '#d4ac0d', { z0: it.z });
    box(it.x + it.w * k + 3, it.y - 4, 6, 2, 2, '#d4ac0d', { z0: it.z + 13 });
  });
  box(it.x + it.w * 0.3, it.y + 4, 6, 6, 9, 'rgba(241,196,15,0.85)', {
    z0: it.z,
    left: 'rgba(241,196,15,0.8)',
    right: 'rgba(214,170,10,0.8)',
    top: '#ffffff',
  });
}

export function drawStoolProp(it?: GameValue): GameValue {
  box(it.x, it.y, 3, 3, 30, '#bdc3c7');
  box(it.x, it.y, 10, 10, 2, '#7f8c8d');
  const p: GameValue = isoProject(it.x, it.y, 32),
    s: GameValue = isoScale();
  game.view.ctx.fillStyle = '#c0392b';
  game.view.ctx.beginPath();
  game.view.ctx.ellipse(p.x, p.y, 9 * s, 4.5 * s, 0, 0, 6.3);
  game.view.ctx.fill();
  game.view.ctx.fillStyle = '#e74c3c';
  game.view.ctx.beginPath();
  game.view.ctx.ellipse(p.x, p.y - 1.5 * s, 9 * s, 4.5 * s, 0, 0, 6.3);
  game.view.ctx.fill();
}

export function drawRoundTableProp(it?: GameValue): GameValue {
  drawChair(it.x, it.y - it.h / 2 - 6, '#6d4c41');
  box(it.x, it.y, 4, 4, 34, '#2d3436');
  box(it.x, it.y, 18, 18, 2, '#2d3436');
  const p: GameValue = isoProject(it.x, it.y, 36),
    s: GameValue = isoScale();
  game.view.ctx.fillStyle = '#5d4037';
  game.view.ctx.beginPath();
  game.view.ctx.ellipse(p.x, p.y + 2 * s, it.w * 0.75 * s, it.w * 0.38 * s, 0, 0, 6.3);
  game.view.ctx.fill();
  game.view.ctx.fillStyle = '#8d6e63';
  game.view.ctx.beginPath();
  game.view.ctx.ellipse(p.x, p.y, it.w * 0.75 * s, it.w * 0.38 * s, 0, 0, 6.3);
  game.view.ctx.fill();
  game.view.ctx.fillStyle = 'rgba(241,196,15,0.9)';
  game.view.ctx.fillRect(p.x - 6 * s, p.y - 9 * s, 4 * s, 8 * s);
  game.view.ctx.fillStyle = '#ffffff';
  game.view.ctx.fillRect(p.x - 6 * s, p.y - 10 * s, 4 * s, 2 * s);
  drawChair(it.x + it.w / 2 + 6, it.y, '#6d4c41', 'x');
}

export function drawJukeboxProp(it?: GameValue, t?: GameValue): GameValue {
  const b: GameValue = box(it.x, it.y, it.w, it.h, it.z, '#8e44ad');
  onFace(b, 'left', (W?: GameValue, H?: GameValue): GameValue => {
    const hue: GameValue = (t * 60) % 360;
    const g: GameValue = game.view.ctx.createLinearGradient(0, 0, W, 0);
    g.addColorStop(0, `hsl(${hue},90%,60%)`);
    g.addColorStop(1, `hsl(${(hue + 90) % 360},90%,60%)`);
    game.view.ctx.fillStyle = g;
    game.view.ctx.fillRect(3, 3, W - 6, H * 0.45);
    game.view.ctx.fillStyle = '#2d3436';
    game.view.ctx.fillRect(5, H * 0.55, W - 10, H * 0.3);
    game.view.ctx.fillStyle = '#f1c40f';
    for (let i: GameValue = 0; i < 4; i++)
      game.view.ctx.fillRect(7 + (i * (W - 14)) / 4, H * 0.6, 3, 3);
  });
}

export function drawTableProp(it?: GameValue): GameValue {
  drawChair(it.x, it.y - it.h / 2 - 4, '#a0522d');
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
    game.view.ctx.fillStyle = '#ecf0f1';
    game.view.ctx.beginPath();
    game.view.ctx.ellipse(W / 2, H / 2, 9, 7, 0, 0, 6.3);
    game.view.ctx.fill();
    [
      ['#e74c3c', -3, -1],
      ['#f1c40f', 2, 1],
      ['#27ae60', 0, -3],
    ].forEach(([c, du, dv]: GameValue = {}): GameValue => {
      game.view.ctx.fillStyle = c;
      game.view.ctx.beginPath();
      game.view.ctx.arc(W / 2 + du, H / 2 + dv, 2.6, 0, 6.3);
      game.view.ctx.fill();
    });
  });
  drawChair(it.x + it.w / 2 + 4, it.y, '#a0522d', 'x');
}

export function drawConsoleProp(it?: GameValue): GameValue {
  const b: GameValue = box(it.x, it.y, it.w, it.h, 34, '#6d4c41');
  onFace(b, 'left', (W?: GameValue, H?: GameValue): GameValue => {
    woodGrain(W, H, 'rgba(0,0,0,0.2)');
    game.view.ctx.strokeStyle = 'rgba(0,0,0,0.35)';
    game.view.ctx.strokeRect(3, 3, W / 2 - 4, H / 2);
    game.view.ctx.strokeRect(W / 2 + 1, 3, W / 2 - 4, H / 2);
  });
  box(it.x - it.w * 0.25, it.y, 8, 8, 16, '#2980b9', { z0: 34 });
  const p: GameValue = isoProject(it.x - it.w * 0.25, it.y, 52),
    s: GameValue = isoScale();
  ['#ff6b81', '#feca57', '#ff9ff3'].forEach((c?: GameValue, i?: GameValue): GameValue => {
    game.view.ctx.fillStyle = c;
    game.view.ctx.beginPath();
    game.view.ctx.arc(p.x + (i - 1) * 4 * s, p.y - (i % 2) * 3 * s, 3 * s, 0, 6.3);
    game.view.ctx.fill();
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
  const b: GameValue = box(it.x, it.y, it.w, it.h, 34, '#1e1e2f', {
    edge: 'rgba(255,255,255,0.15)',
  });
  onFace(b, 'left', (W?: GameValue, H?: GameValue): GameValue => {
    for (let i: GameValue = 0; i < 10; i++) {
      game.view.ctx.fillStyle = `hsl(${(t * 120 + i * 36) % 360},90%,${40 + 30 * Math.abs(Math.sin(t * 6 + i))}%)`;
      game.view.ctx.fillRect(4 + (i * (W - 8)) / 10, H * 0.3, (W - 8) / 10 - 2, H * 0.4);
    }
  });
  const top: GameValue = box(it.x, it.y, it.w - 6, it.h - 6, 4, '#2d2d44', { z0: 34 });
  onFace(top, 'top', (W?: GameValue, H?: GameValue): GameValue => {
    [W * 0.28, W * 0.72].forEach((cx?: GameValue, k?: GameValue): GameValue => {
      const r: GameValue = Math.min(H * 0.42, W * 0.18);
      game.view.ctx.fillStyle = '#111';
      game.view.ctx.beginPath();
      game.view.ctx.arc(cx, H / 2, r, 0, 6.3);
      game.view.ctx.fill();
      game.view.ctx.strokeStyle = `hsl(${(t * 90 + k * 120) % 360},90%,60%)`;
      game.view.ctx.lineWidth = 1;
      const a: GameValue = t * 5 + k;
      game.view.ctx.beginPath();
      game.view.ctx.moveTo(cx, H / 2);
      game.view.ctx.lineTo(cx + Math.cos(a) * r, H / 2 + Math.sin(a) * r);
      game.view.ctx.stroke();
    });
    game.view.ctx.fillStyle = '#e84393';
    game.view.ctx.fillRect(W / 2 - 3, 3, 6, H - 6);
  });
}

export function drawSpeakerProp(it?: GameValue, t?: GameValue): GameValue {
  const b: GameValue = box(it.x, it.y, it.w, it.h, it.z || 70, '#1a1a1a', {
    edge: 'rgba(255,255,255,0.1)',
  });
  onFace(b, 'left', (W?: GameValue, H?: GameValue): GameValue => {
    const k: GameValue = 1 + 0.1 * Math.sin(t * 9 + it.x);
    [
      [H * 0.3, W * 0.28],
      [H * 0.68, W * 0.4],
    ].forEach(([cy, r]: GameValue = {}): GameValue => {
      game.view.ctx.fillStyle = '#3a3a3a';
      game.view.ctx.beginPath();
      game.view.ctx.arc(W / 2, cy, r * k, 0, 6.3);
      game.view.ctx.fill();
      game.view.ctx.fillStyle = '#0a0a0a';
      game.view.ctx.beginPath();
      game.view.ctx.arc(W / 2, cy, r * 0.45 * k, 0, 6.3);
      game.view.ctx.fill();
    });
  });
}

export function drawDiscoBallProp(it?: GameValue, t?: GameValue): GameValue {
  const top: GameValue = isoProject(it.x, it.y, 230),
    p: GameValue = isoProject(it.x, it.y, it.z || 115),
    r: GameValue = 15 * isoScale();
  game.view.ctx.strokeStyle = '#999';
  game.view.ctx.lineWidth = 1;
  game.view.ctx.beginPath();
  game.view.ctx.moveTo(top.x, top.y);
  game.view.ctx.lineTo(p.x, p.y - r);
  game.view.ctx.stroke();
  const g: GameValue = game.view.ctx.createRadialGradient(
    p.x - r * 0.3,
    p.y - r * 0.3,
    r * 0.1,
    p.x,
    p.y,
    r,
  );
  g.addColorStop(0, '#ffffff');
  g.addColorStop(1, '#7f8fa6');
  game.view.ctx.fillStyle = g;
  game.view.ctx.beginPath();
  game.view.ctx.arc(p.x, p.y, r, 0, 6.3);
  game.view.ctx.fill();
  for (let i: GameValue = 0; i < 16; i++) {
    const a: GameValue = i * 2.4 + t * 1.5,
      d: GameValue = r * (0.2 + (0.7 * ((i * 37) % 10)) / 10);
    game.view.ctx.fillStyle = `hsl(${(t * 200 + i * 40) % 360},100%,${65 + 25 * Math.sin(t * 8 + i)}%)`;
    game.view.ctx.fillRect(p.x + Math.cos(a) * d - 1.5, p.y + Math.sin(a) * d * 0.9 - 1.5, 3, 3);
  }
}

// ---- Cimitero: lapidi dei giocatori deceduti
export function drawGraveProp(it?: GameValue): GameValue {
  const flowers: GameValue = isoScale();
  box(it.x, it.y + 9, 18, 14, 3, '#6b4f3a', { edge: 'rgba(0,0,0,0.2)' });
  const FL: GameValue = ['#ff6b81', '#feca57', '#ffffff', '#a29bfe', '#ff9ff3']; // un fiore per ogni persona che l'ha visitata
  for (let i: GameValue = 0, n: GameValue = Math.min(10, it.visitors || 0); i < n; i++) {
    const q: GameValue = isoProject(it.x - 7 + (i % 5) * 3.5, it.y + 9 + (i < 5 ? 3 : 8), 6);
    game.view.ctx.fillStyle = '#2e7d32';
    game.view.ctx.fillRect(q.x - 0.5, q.y, 1, 3 * flowers);
    game.view.ctx.fillStyle = FL[i % FL.length];
    game.view.ctx.beginPath();
    game.view.ctx.arc(q.x, q.y, 2 * flowers, 0, 6.3);
    game.view.ctx.fill();
  }
  box(it.x, it.y, 22, 6, 4, '#7f8c8d');
  if (it.style === 1) {
    // croce
    box(it.x, it.y, 5, 4, 34, '#b2bec3', { z0: 4 });
    box(it.x, it.y, 18, 4, 5, '#b2bec3', { z0: 20 });
  } else {
    const wide: GameValue = it.style === 2;
    const st: GameValue = box(it.x, it.y, wide ? 20 : 16, 5, wide ? 22 : 28, '#b2bec3', { z0: 4 });
    box(it.x, it.y, wide ? 18 : 14, 5, 3, '#cfd8dc', { z0: wide ? 26 : 32 });
    onFace(st, 'left', (W?: GameValue, H?: GameValue): GameValue => {
      game.view.ctx.fillStyle = '#4b5558';
      game.view.ctx.textAlign = 'center';
      game.view.ctx.font = 'bold 5px serif';
      game.view.ctx.fillText('R.I.P', W / 2, H * 0.34);
      game.view.ctx.fillRect(W / 2 - 0.6, H * 0.5, 1.2, H * 0.3);
      game.view.ctx.fillRect(W / 2 - 2, H * 0.58, 4, 1.1);
    });
  }
}

export function drawMemorialProp(it?: GameValue): GameValue {
  box(it.x, it.y, 46, 16, 5, '#636e72');
  const st: GameValue = box(it.x, it.y, 38, 12, 44, '#2d3436', { z0: 5, top: '#4b5558' });
  onFace(st, 'left', (W?: GameValue, H?: GameValue): GameValue => {
    game.view.ctx.fillStyle = '#dfe6e9';
    game.view.ctx.textAlign = 'center';
    game.view.ctx.font = 'bold 6px serif';
    game.view.ctx.fillText('IN MEMORIA', W / 2, H * 0.3);
    game.view.ctx.font = '5px serif';
    game.view.ctx.fillText("di chi non ce l'ha fatta", W / 2, H * 0.48);
    game.view.ctx.fillRect(W / 2 - 0.7, H * 0.58, 1.4, H * 0.28);
    game.view.ctx.fillRect(W / 2 - 3, H * 0.66, 6, 1.3);
  });
}

export function rebuildGraveyard(val?: GameValue): GameValue {
  game.graveList = Object.keys(val || {})
    .map((id?: GameValue): GameValue => Object.assign({ id }, val[id]))
    .filter((g?: GameValue): GameValue => g && g.name)
    .sort((a?: GameValue, b?: GameValue): GameValue => (b.deadAt || 0) - (a.deadAt || 0));
  const cols: GameValue = [-150, -110, -70, 70, 110, 150],
    rows: GameValue = [40, 0, -40, -80, -120];
  const props: GameValue = [
    {
      kind: 'memorial',
      x: 0,
      y: -138,
      w: 46,
      h: 16,
      z: 62,
      label: '📜 Registro dei defunti',
      who: 'registro',
      name: 'Registro',
    },
    { kind: 'tree', x: -168, y: -146, w: 16, h: 16, size: 1.1, z: 90 },
    { kind: 'tree', x: 168, y: -146, w: 16, h: 16, size: 1, z: 85 },
    { kind: 'streetlamp', x: -35, y: 105, w: 8, h: 8 },
    { kind: 'streetlamp', x: 35, y: 105, w: 8, h: 8 },
    { kind: 'bench', x: -110, y: 108, w: 50, h: 16 },
    { kind: 'bench', x: 110, y: 108, w: 50, h: 16 },
  ];
  game.graveMap = { memorial: props[0] };
  game.graveList
    .slice(0, cols.length * rows.length)
    .forEach((g?: GameValue, i?: GameValue): GameValue => {
      const d: GameValue = g.deadAt ? new Date(g.deadAt).toLocaleDateString('it-IT') : '';
      const o: GameValue = {
        kind: 'grave',
        x: cols[i % cols.length],
        y: rows[Math.floor(i / cols.length)],
        w: 22,
        h: 8,
        z: 40,
        style: nameHash(g.id || g.name) % 3,
        label: '🪦 ' + g.name,
        who: g.name,
        name: g.name,
        days: g.days,
        deadAt: g.deadAt,
        date: d,
        id: g.id,
        lived: g.lived,
        epitaph: g.epitaph || '',
        visitors: Object.keys(g.visitors || {}).length,
        hasVisited: !!(g.visitors && g.visitors[game.session.myPlayerId]),
      };
      props.push(o);
      game.graveMap['grave_' + i] = o;
    });
  game.ENV_PROPS.CIMITERO = props;
  if (game.view.activeEnvironment === 'CIMITERO')
    game.view.currentRoomTitle = `Cimitero 🪦 (${game.graveList.length} ${game.graveList.length === 1 ? 'lapide' : 'lapidi'})`;
}

export async function showGraveInfo(item?: GameValue): Promise<GameValue> {
  if (item.kind === 'memorial') {
    const lines: GameValue = game.graveList
      .slice(0, 40)
      .map(
        (g?: GameValue): GameValue =>
          `🪦 ${g.name} — ${typeof g.lived === 'number' ? fmtDuration(g.lived) : 'giorno ' + (g.days || '?')}${g.deadAt ? ' · ' + new Date(g.deadAt).toLocaleDateString('it-IT') : ''}`,
      );
    openDialog({
      title: `📜 Registro dei defunti (${game.graveList.length})`,
      text: lines.join('\n') || 'Nessuno è ancora morto. Prenditi cura del tuo personaggio!',
      buttons: [{ label: 'Chiudi', value: null, color: '#57606f' }],
    });
    return;
  }
  const lived: GameValue =
    typeof item.lived === 'number'
      ? `Ha vissuto ${fmtDuration(item.lived)}.`
      : `Ha vissuto fino al giorno ${item.days || '?'}.`;
  const text: GameValue =
    (item.epitaph ? `« ${item.epitaph} »\n\n` : 'Riposa in pace.\n\n') +
    lived +
    (item.date ? `\nÈ morto il ${item.date}.` : '') +
    (item.visitors
      ? `\n\n💐 ${item.visitors} ${item.visitors === 1 ? 'persona ha lasciato' : 'persone hanno lasciato'} dei fiori.`
      : '');
  const buttons: GameValue = [{ label: 'Chiudi', value: null, color: '#57606f' }];
  if (!item.hasVisited)
    buttons.push({ label: '💐 Lascia dei fiori (5 €)', value: 'flowers', color: '#e84393' });
  const res: GameValue = await openDialog({ title: `🪦 ${item.who}`, text, buttons });
  if (res.action === 'flowers') {
    if (game.moneyLevel < 5) {
      toast('Non hai abbastanza soldi: servono 5 € in cassaforte.');
      return;
    }
    if (!(await spendMoney(5))) return;
    try {
      game.session.db
        .ref(`sims_graveyard/${item.id}/visitors/${game.session.myPlayerId}`)
        .set(game.player.myData.nick);
    } catch (e: GameValue) {}
    toast(`💐 Hai lasciato dei fiori per ${item.who}`);
  }
}

export async function openEpitaph(..._args: GameValue[]): Promise<GameValue> {
  const res: GameValue = await openDialog({
    title: '🪦 Il tuo epitaffio',
    text:
      'Cosa vuoi che sia scritto sulla tua lapide, quando morirai? Gli altri giocatori potranno leggerlo.' +
      (game.player.epitaph ? `\n\nAttuale: « ${game.player.epitaph} »` : ''),
    input: { placeholder: 'Es. «Ho sempre avuto fame»', maxLength: 60 },
    buttons: [
      { label: 'Annulla', value: null, color: '#57606f' },
      { label: 'Salva', value: 'ok', color: '#2ed573' },
    ],
  });
  if (res.action === 'ok') {
    game.player.epitaph = res.value.slice(0, 60);
    saveGame(true);
    toast(game.player.epitaph ? '🪦 Epitaffio salvato' : '🪦 Epitaffio rimosso');
  }
}

// ---------------------------------------------------------------- BANCA
const BANK_TELLERS = [
  {
    look: 'item_suit,pants_black,shoes_formal,glasses_round,neck_tie',
    body: {
      skin: 2,
      freckles: 0,
      hairStyle: 0,
      hairColor: 1,
      eyeColor: 0,
      eyeShape: 0,
      mouth: 1,
      beard: 1,
    },
  },
  {
    look: 'top_vest,pants_black,shoes_formal,neck_pearls',
    body: {
      skin: 5,
      freckles: 0,
      hairStyle: 3,
      hairColor: 0,
      eyeColor: 1,
      eyeShape: 1,
      mouth: 3,
      beard: 0,
    },
  },
];

// Sportello in marmo con vetri, due impiegati e i cartelli degli sportelli.
export function drawBankCounter(it?: GameValue, t?: GameValue): GameValue {
  const ctx: GameValue = game.view.ctx;
  const windows = [-0.25, 0.25].map((k) => it.x + it.w * k);
  // impiegati dietro il bancone
  windows.forEach((wx, i) => {
    const look: GameValue = resolveLook(parseLook(BANK_TELLERS[i].look));
    look.body = BANK_TELLERS[i].body;
    drawPlayerAvatar(wx, it.y - it.h / 2 - 16, '', (t || 0) + i * 3, look, false, '', {
      noShadow: true,
    });
  });
  const zTop = it.z - 6;
  const b: GameValue = box(it.x, it.y, it.w, it.h, zTop, '#d8cfc0');
  onFace(b, 'left', (W?: GameValue, H?: GameValue): GameValue => {
    const panels = 5;
    const pw = (W - 8) / panels;
    for (let i = 0; i < panels; i++) {
      const x = 4 + i * pw;
      const g = ctx.createLinearGradient(x, 0, x + pw, H);
      g.addColorStop(0, '#f4efe6');
      g.addColorStop(1, '#cfc4b1');
      ctx.fillStyle = g;
      ctx.fillRect(x + 2, 6, pw - 4, H - 14);
      // venature del marmo
      ctx.strokeStyle = 'rgba(120,110,95,0.35)';
      ctx.lineWidth = 0.7;
      ctx.beginPath();
      ctx.moveTo(x + 4, 10 + rnd(i) * 10);
      ctx.bezierCurveTo(
        x + pw * 0.4,
        20 + rnd(i + 3) * 10,
        x + pw * 0.6,
        8,
        x + pw - 4,
        26 + rnd(i + 7) * 12,
      );
      ctx.stroke();
    }
    ctx.fillStyle = '#b08d57';
    ctx.fillRect(0, 2, W, 2);
    ctx.fillRect(0, H - 6, W, 2);
    // targa centrale
    ctx.fillStyle = '#1e3a5f';
    ctx.fillRect(W / 2 - 26, H * 0.36, 52, 14);
    ctx.fillStyle = '#f1c40f';
    ctx.font = 'bold 8px sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('🏦 BANCA', W / 2, H * 0.36 + 10);
  });
  onFace(b, 'right', (W?: GameValue, H?: GameValue): GameValue => {
    ctx.fillStyle = 'rgba(0,0,0,0.06)';
    ctx.fillRect(0, 0, W, H);
    ctx.fillStyle = '#b08d57';
    ctx.fillRect(0, H - 6, W, 2);
  });
  box(it.x, it.y, it.w + 6, it.h + 6, 6, '#2d3436', { z0: zTop, top: '#3d4852' });
  // vetrata con le fessure degli sportelli
  const gy = it.y;
  const z0 = it.z,
    z1 = it.z + 46;
  const x0 = it.x - it.w / 2 + 3,
    x1 = it.x + it.w / 2 - 3;
  const pane = (xa: number, xb: number, za: number, zb: number) =>
    poly(
      [
        isoProject(xa, gy, za),
        isoProject(xb, gy, za),
        isoProject(xb, gy, zb),
        isoProject(xa, gy, zb),
      ],
      'rgba(185,225,245,0.22)',
      'rgba(255,255,255,0.45)',
    );
  const slotH = 9;
  pane(x0, x1, z0 + slotH, z1);
  windows.forEach((wx) => pane(wx - 14, wx + 14, z0, z0 + 2));
  // riflessi sul vetro
  const s: GameValue = isoScale();
  [x0 + 20, it.x + 10, x1 - 30].forEach((rx) => {
    const a = isoProject(rx, gy, z1 - 6),
      c = isoProject(rx + 12, gy, z0 + slotH + 6);
    ctx.strokeStyle = 'rgba(255,255,255,0.35)';
    ctx.lineWidth = 2 * s;
    ctx.beginPath();
    ctx.moveTo(a.x, a.y);
    ctx.lineTo(c.x, c.y);
    ctx.stroke();
  });
  // montanti in ottone
  for (const px of [x0, ...windows.map((w) => w - 16), ...windows.map((w) => w + 16), x1])
    box(px, gy, 3, 3, z1 - z0, '#b08d57', { z0 });
  box(it.x, gy, it.w - 2, 4, 3, '#b08d57', { z0: z1 });
  // cartelli degli sportelli
  windows.forEach((wx, i) => {
    const sign: GameValue = box(wx, gy, 34, 2, 10, '#1e3a5f', { z0: z1 + 3 });
    onFace(sign, 'left', (W?: GameValue, H?: GameValue): GameValue => {
      ctx.fillStyle = '#ffffff';
      ctx.font = 'bold 6px sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText(`SPORTELLO ${i + 1}`, W / 2, H / 2 + 2);
    });
    // campanello e vassoio per i soldi
    box(wx + 8, it.y + it.h / 2 - 6, 10, 6, 1, '#b2bec3', { z0: it.z });
    const bell = isoProject(wx - 9, it.y + it.h / 2 - 6, it.z + 3);
    ctx.fillStyle = '#f1c40f';
    ctx.beginPath();
    ctx.arc(bell.x, bell.y, 3 * s, Math.PI, 0);
    ctx.fill();
    ctx.fillStyle = '#7f8c8d';
    ctx.fillRect(bell.x - 4 * s, bell.y, 8 * s, 1.2 * s);
  });
}

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
