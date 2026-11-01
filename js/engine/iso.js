import { canvas, ctx } from './canvas.js';

// Primitive di disegno in proiezione isometrica.
// Coordinate mondo: x/y sul pavimento (0,0 = centro stanza), z = altezza.

export function isoProject(x, y, z) {
  const cx = canvas.width / 2;
  const cy = canvas.height / 2 + 20;
  return {
    x: cx + (x - y) * 0.866,
    y: cy + (x + y) * 0.5 - z,
  };
}

function fillPolygon(points, color) {
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.moveTo(points[0].x, points[0].y);
  for (let i = 1; i < points.length; i++) ctx.lineTo(points[i].x, points[i].y);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();
}

// Rettangolo piatto sul pavimento
export function drawIsoFloor(halfX, halfY, color) {
  ctx.strokeStyle = 'rgba(0,0,0,0.3)';
  ctx.lineWidth = 1;
  fillPolygon([
    isoProject(-halfX, -halfY, 0),
    isoProject(halfX, -halfY, 0),
    isoProject(halfX, halfY, 0),
    isoProject(-halfX, halfY, 0),
  ], color);
}

// Parallelepipedo centrato in (x, y) con etichetta opzionale
export function drawIsoBlock(x, y, w, h, zHeight, mainColor, topColor, label) {
  const b1 = isoProject(x - w / 2, y - h / 2, 0);
  const b3 = isoProject(x + w / 2, y + h / 2, 0);
  const b4 = isoProject(x - w / 2, y + h / 2, 0);

  const t1 = isoProject(x - w / 2, y - h / 2, zHeight);
  const t2 = isoProject(x + w / 2, y - h / 2, zHeight);
  const t3 = isoProject(x + w / 2, y + h / 2, zHeight);
  const t4 = isoProject(x - w / 2, y + h / 2, zHeight);

  ctx.strokeStyle = 'rgba(0,0,0,0.3)';
  ctx.lineWidth = 1;

  fillPolygon([b1, b4, t4, t1], mainColor); // lato sinistro
  fillPolygon([b4, b3, t3, t4], mainColor); // lato frontale
  fillPolygon([t1, t2, t3, t4], topColor);  // piano superiore

  if (label) drawLabel(label, t4.x, t4.y - 8);
}

// Prisma a base poligonale (es. sgabelli, vasi). Al momento non usato.
export function drawCylinder(x, y, radius, zHeight, sides, sideColor, topColor) {
  const bottom = [];
  const top = [];
  for (let i = 0; i < sides; i++) {
    const angle = (i / sides) * Math.PI * 2;
    const px = x + Math.cos(angle) * radius;
    const py = y + Math.sin(angle) * radius;
    bottom.push(isoProject(px, py, 0));
    top.push(isoProject(px, py, zHeight));
  }

  ctx.strokeStyle = 'rgba(0,0,0,0.2)';
  ctx.lineWidth = 1;

  for (let i = 0; i < sides; i++) {
    const next = (i + 1) % sides;
    fillPolygon([bottom[i], bottom[next], top[next], top[i]], sideColor);
  }
  fillPolygon(top, topColor);
}

export function drawLabel(text, x, y, font = '11px sans-serif') {
  ctx.fillStyle = '#fff';
  ctx.font = font;
  ctx.textAlign = 'center';
  ctx.fillText(text, x, y);
}
