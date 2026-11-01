import { FLOOR_HALF_SIZE } from '../config.js';
import { canvas, ctx } from '../engine/canvas.js';
import { drawIsoFloor, drawIsoBlock, drawLabel } from '../engine/iso.js';
import { state, currentEnv, currentObjects } from '../state.js';
import { drawAvatar } from './avatar.js';

// Disegna l'ambiente corrente leggendo solo lo stato (nessuna logica qui).
export function renderScene(time) {
  ctx.clearRect(0, 0, canvas.width, canvas.height);

  drawIsoFloor(FLOOR_HALF_SIZE.x, FLOOR_HALF_SIZE.y, currentEnv().floorColor);
  drawLabel(state.title, canvas.width / 2, 35, 'bold 15px sans-serif');

  for (const obj of Object.values(currentObjects())) {
    drawIsoBlock(obj.x, obj.y, obj.w, obj.h, obj.z || 110, obj.color || '#e74c3c', obj.topColor || '#ff6b6b', obj.name);
  }

  // Altri giocatori nello stesso ambiente
  for (const [id, p] of Object.entries(state.onlinePlayers)) {
    if (id !== state.playerId && p.env === state.envId) {
      drawAvatar(p.x, p.y, p.name, time, false);
    }
  }

  drawAvatar(state.pos.x, state.pos.y, state.nick, time, true);
}
