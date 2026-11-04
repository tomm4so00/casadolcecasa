// Frigorifero della cucina: anta che si apre, magneti, display e ripiani con il cibo.
import { type GameValue, game } from '../context.js';
import { isoProject, isoScale, poly, rnd, setPlane } from './primitives.js';
import { resetPlane, box, onFace, roundRect } from './objects.js';

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
