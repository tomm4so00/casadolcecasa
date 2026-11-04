// Banca: sportelli con i cassieri.
import { type GameValue, game } from '../context.js';
import { isoProject, isoScale, poly, rnd } from './primitives.js';
import { parseLook, resolveLook } from '../character.js';
import { drawPlayerAvatar } from './avatars.js';
import { box, onFace } from './objects.js';

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
