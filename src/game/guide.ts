// La freccia delle missioni di benvenuto: gialla, sul piano del pavimento attorno al personaggio,
// punta verso dove andare (regole in guide-rules.ts). Sparisce quando si è arrivati o non c'è
// niente da raggiungere.
import { game } from './context.js';
import { GUIDE_NEAR, type GuideDest, guideStep } from './guide-rules.js';
import { isoProject } from './render/primitives.js';
import { welcomeDest } from './welcome.js';
import { arrivalGuide } from './arrival.js';
import { questDest } from './quests.js';
import { getCurrentFurnitureMap, mallShopFacade } from './world.js';

/** La meta si ricalcola ogni tanto, non a ogni fotogramma (il vicino dell'assaggio costa). */
const REFRESH_MS = 400;
let cached: { at: number; dest: GuideDest | null } = { at: -Infinity, dest: null };

function dest(): GuideDest | null {
  const now = performance.now();
  if (now - cached.at > REFRESH_MS)
    cached = { at: now, dest: arrivalGuide() ?? welcomeDest() ?? questDest() };
  return cached.dest;
}

/** Il punto verso cui puntare adesso, nell'ambiente in cui si è (o null). */
function target(): { x: number; y: number } | null {
  const d = dest();
  if (!d) return null;
  const env: string = game.view.activeEnvironment;
  // nel centro commerciale, verso la vetrina del negozio della meta
  if (env === 'centro_commerciale' && d.env !== env) return mallShopFacade(d.env);
  const step = guideStep(
    {
      env,
      apt: game.currentApt ?? 0,
      roomIdx: env === 'PLAYER_ROOM' ? (game.currentRoomIdx ?? null) : null,
    },
    d,
    game.ROOMS_PER_APT,
  );
  if (!step) return null;
  if ('point' in step) return step.point;
  const it = getCurrentFurnitureMap()[step.key];
  return it && Number.isFinite(it.x) ? { x: it.x, y: it.y } : null;
}

/** Disegna la freccia sul piano del pavimento, sopra mobili e personaggi (così non si perde). */
export function drawGuideArrow(t: number): void {
  if (game.player.isSleeping || game.activeShift || game.MG?.active || game.rocketTrip) return;
  const goal = target();
  if (!goal) return;
  const p = game.playerPos;
  const dx = goal.x - p.x,
    dy = goal.y - p.y;
  const dist = Math.hypot(dx, dy);
  if (dist < GUIDE_NEAR) return;
  // direzione verso la meta e la sua perpendicolare, nel piano del pavimento
  const ux = dx / dist,
    uy = dy / dist;
  const vx = -uy,
    vy = ux;
  // la freccia "respira" avanti e indietro, così si nota
  const r = 58 + Math.sin(t * 5) * 4;
  const at = (along: number, side: number) =>
    isoProject(p.x + ux * along + vx * side, p.y + uy * along + vy * side, 1);
  // asta e punta, staccate dai piedi del personaggio
  const pts = [
    at(r, 5),
    at(r + 18, 5),
    at(r + 18, 14),
    at(r + 38, 0),
    at(r + 18, -14),
    at(r + 18, -5),
    at(r, -5),
  ];
  const ctx = game.view.ctx;
  ctx.save();
  ctx.globalAlpha = 0.92;
  ctx.beginPath();
  pts.forEach((q, i) => (i ? ctx.lineTo(q.x, q.y) : ctx.moveTo(q.x, q.y)));
  ctx.closePath();
  ctx.fillStyle = '#feca57';
  ctx.strokeStyle = 'rgba(45,52,54,0.75)';
  ctx.lineWidth = 2;
  ctx.lineJoin = 'round';
  ctx.stroke();
  ctx.fill();
  ctx.restore();
}
