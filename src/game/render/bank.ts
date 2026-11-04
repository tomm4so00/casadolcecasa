// Banca: sportelli con i cassieri, il caveau e i divisori della zona del personale.
import { type GameValue, game } from '../context.js';
import { isoProject, isoScale, poly, rnd, setPlane } from './primitives.js';
import { parseLook, resolveLook } from '../character.js';
import { drawPlayerAvatar } from './avatars.js';
import { box, onFace, resetPlane } from './objects.js';

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

// ---------------------------------------------------------------- CAVEAU
type V3 = [number, number, number];

/** Disegna su un piano verticale parallelo al muro di fondo, centrato in `c` (y verso il basso). */
function onWallPlane(c: V3, fn: (ctx: CanvasRenderingContext2D) => void): void {
  setPlane(c, [1, 0, 0], [0, 0, -1]);
  try {
    fn(game.view.ctx);
  } finally {
    resetPlane();
  }
}

/** Cilindro con l'asse verso chi guarda (+y): `depth` dischi uno davanti all'altro, poi la faccia. */
function cylinder(
  x: number,
  y0: number,
  z: number,
  r: number,
  depth: number,
  side: string,
  face: (ctx: CanvasRenderingContext2D) => string | CanvasGradient,
): void {
  for (let k = 0; k <= depth; k += 0.75) {
    onWallPlane([x, y0 + k, z], (ctx) => {
      ctx.fillStyle = side;
      ctx.beginPath();
      ctx.arc(0, 0, r, 0, Math.PI * 2);
      ctx.fill();
    });
  }
  onWallPlane([x, y0 + depth, z], (ctx) => {
    ctx.fillStyle = face(ctx);
    ctx.beginPath();
    ctx.arc(0, 0, r, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = 'rgba(0,0,0,0.35)';
    ctx.lineWidth = 1;
    ctx.stroke();
  });
}

/** Caveau incassato nel muro di fondo: telaio d'acciaio e porta rotonda spessa, con il volante. */
export function drawBankVault(it?: GameValue): GameValue {
  const front = it.y + it.h / 2;
  const zc = 62,
    r = 44;
  // telaio
  const frame = box(it.x, it.y, it.w, it.h, it.z, '#5d6873', { top: '#7d8894' });
  onFace(frame, 'left', (W?: GameValue, H?: GameValue): GameValue => {
    const ctx = game.view.ctx;
    const g = ctx.createLinearGradient(0, 0, W, H);
    g.addColorStop(0, '#8a96a3');
    g.addColorStop(1, '#55606b');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, W, H);
    ctx.strokeStyle = 'rgba(0,0,0,0.3)';
    ctx.lineWidth = 1;
    ctx.strokeRect(4, 4, W - 8, H - 8);
    // rivetti lungo il bordo
    ctx.fillStyle = '#3d4650';
    for (let u = 9; u < W - 4; u += 12) {
      ctx.fillRect(u - 1, 7, 2, 2);
      ctx.fillRect(u - 1, H - 9, 2, 2);
    }
    // targa
    ctx.fillStyle = '#b08d57';
    ctx.fillRect(W / 2 - 22, 6, 44, 11);
    ctx.fillStyle = '#2d1e0f';
    ctx.font = 'bold 7px sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('CAVEAU', W / 2, 14.5);
    ctx.textAlign = 'left';
  });
  // incavo scuro e anello che regge la porta
  cylinder(it.x, front, zc, r + 7, 1.5, '#2d3436', () => '#3d4650');
  cylinder(it.x, front + 1.5, zc, r + 3, 2, '#4b5563', () => '#6b7785');
  // cerniere sul lato destro
  for (const dz of [-22, 22]) box(it.x + r + 4, front + 5, 8, 8, 9, '#4b5563', { z0: zc + dz - 4 });
  // la porta, spessa
  cylinder(it.x, front + 3.5, zc, r, 7, '#4f5964', (ctx) => {
    const g = ctx.createRadialGradient(-14, -16, 4, 0, 0, r);
    g.addColorStop(0, '#e1e6ea');
    g.addColorStop(1, '#808b96');
    return g;
  });
  const face = front + 10.5;
  onWallPlane([it.x, face, zc], (ctx) => {
    // bulloni e anello interno
    ctx.fillStyle = '#4b5563';
    for (let i = 0; i < 16; i++) {
      const a = (i / 16) * Math.PI * 2;
      ctx.beginPath();
      ctx.arc(Math.cos(a) * (r - 6), Math.sin(a) * (r - 6), 2.1, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.strokeStyle = 'rgba(0,0,0,0.25)';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.arc(0, 0, r * 0.64, 0, Math.PI * 2);
    ctx.stroke();
    // serratura a combinazione sotto il volante
    ctx.fillStyle = '#2d3436';
    ctx.beginPath();
    ctx.arc(0, r * 0.47, 5, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#b08d57';
    ctx.fillRect(-0.6, r * 0.47 - 5, 1.2, 3);
  });
  // perno e volante, staccati dalla porta
  cylinder(it.x, face, zc, 5, 6, '#2d3436', () => '#4b5563');
  const wheel = face + 8;
  for (const [dy, color, width] of [
    [0, '#1e2326', 4],
    [1.5, '#3d4650', 3],
  ] as const) {
    onWallPlane([it.x, wheel + dy, zc], (ctx) => {
      ctx.strokeStyle = color;
      ctx.lineWidth = width;
      ctx.lineCap = 'round';
      ctx.beginPath();
      ctx.arc(0, 0, 21, 0, Math.PI * 2);
      for (let i = 0; i < 3; i++) {
        const a = (i / 3) * Math.PI + 0.3;
        ctx.moveTo(-Math.cos(a) * 21, -Math.sin(a) * 21);
        ctx.lineTo(Math.cos(a) * 21, Math.sin(a) * 21);
      }
      ctx.stroke();
      ctx.lineCap = 'butt';
    });
  }
  cylinder(it.x, wheel + 1.5, zc, 6, 1.5, '#8a6d3b', () => '#d4a017');
}

/** Divisorio basso di legno con il corrimano d'ottone: chiude ai lati la zona dietro il bancone. */
export function drawBankRail(it?: GameValue): GameValue {
  const ctx: GameValue = game.view.ctx;
  const b: GameValue = box(it.x, it.y, it.w, it.h, it.z, '#6d4c41', { top: '#5d3f35' });
  onFace(b, 'right', (W?: GameValue, H?: GameValue): GameValue => {
    ctx.strokeStyle = 'rgba(0,0,0,0.3)';
    ctx.lineWidth = 1;
    const n = 4;
    for (let i = 0; i < n; i++) ctx.strokeRect(4 + (i * (W - 8)) / n, 6, (W - 8) / n - 4, H - 12);
  });
  box(it.x, it.y, it.w + 2, it.h + 2, 3, '#b08d57', { z0: it.z, top: '#d4b373' });
}
