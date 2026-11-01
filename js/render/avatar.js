import { ctx } from '../engine/canvas.js';
import { isoProject, drawLabel } from '../engine/iso.js';

const SKIN = '#ffdbac';
const PANTS = '#2c3e50';
const SHIRT_ME = '#2e86de';
const SHIRT_OTHER = '#e84393';

// Disegna un omino in (x, y). `time` è pronto per future animazioni.
export function drawAvatar(x, y, name, time, isMe = false) {
  const pelvis = isoProject(x, y, 22);
  const neck = isoProject(x, y, 48);
  const head = isoProject(x, y, 62);

  ctx.lineWidth = 3;
  ctx.strokeStyle = 'rgba(0,0,0,0.4)';

  // Gambe
  const footL = isoProject(x - 6, y, 0);
  const footR = isoProject(x + 6, y, 0);
  ctx.fillStyle = PANTS;
  limb(pelvis.x - 3, pelvis.y, footL.x, footL.y, footL.x + 3, footL.y, pelvis.x, pelvis.y);
  limb(pelvis.x + 3, pelvis.y, footR.x, footR.y, footR.x + 3, footR.y, pelvis.x, pelvis.y);

  // Busto
  ctx.fillStyle = isMe ? SHIRT_ME : SHIRT_OTHER;
  ctx.beginPath();
  ctx.moveTo(pelvis.x - 6, pelvis.y);
  ctx.lineTo(pelvis.x + 6, pelvis.y);
  ctx.lineTo(neck.x + 8, neck.y);
  ctx.lineTo(neck.x - 8, neck.y);
  ctx.closePath();
  ctx.fill(); ctx.stroke();

  // Braccia
  const handL = isoProject(x - 12, y, 24);
  const handR = isoProject(x + 12, y, 24);
  ctx.fillStyle = SKIN;
  limb(neck.x - 7, neck.y + 2, handL.x, handL.y, handL.x + 3, handL.y + 3, neck.x - 4, neck.y + 4);
  limb(neck.x + 7, neck.y + 2, handR.x, handR.y, handR.x + 3, handR.y + 3, neck.x + 4, neck.y + 4);

  // Testa
  ctx.beginPath();
  ctx.arc(head.x, head.y, 9, 0, Math.PI * 2);
  ctx.fill(); ctx.stroke();

  if (name) drawLabel(name, head.x, head.y - 14);
}

function limb(x1, y1, x2, y2, x3, y3, x4, y4) {
  ctx.beginPath();
  ctx.moveTo(x1, y1); ctx.lineTo(x2, y2);
  ctx.lineTo(x3, y3); ctx.lineTo(x4, y4);
  ctx.fill(); ctx.stroke();
}
