// Palazzine del cortile: facciate, finestre, tetti, balconi e portoni degli appartamenti.
import { realHour } from '../game-clock.js';
import { type GameValue, game } from '../context.js';
import { isoProject, isoScale, poly, rnd } from './primitives.js';
import { hasRoom } from '../saves.js';
import { freeRoomsInApt } from '../character.js';
import { drawCached } from './sprite-cache.js';
import { box, onFace } from './objects.js';
import { PORTONE, doorOpenAmount } from './doors.js';

// ---------------------------------------------------------------- PALAZZINE DEL CORTILE
const FACADE_COLORS = [
  '#e8d5b7',
  '#d9b8a0',
  '#cfd8c4',
  '#e3c9c9',
  '#c9d6e3',
  '#e6dcb0',
  '#d7c4e0',
  '#c4dcd6',
];
/** Piani sopra il piano terra, per palazzina: così lo skyline non è tutto uguale. */
const FACADE_FLOORS = [2, 3, 2, 3, 3, 2, 3, 2];
const AWNING_COLORS = ['#c0392b', '#2471a3', '#1e8449', '#b9770e'];
const FLOWER_COLORS = ['#ff6b81', '#feca57', '#ff9ff3', '#ffffff', '#e84393'];
const FACADE_W = 84;
const FACADE_D = 26;

/** Finestra con cornice, architrave, davanzale e (se accesa) tende. */
function facadeWindow(
  ctx: CanvasRenderingContext2D,
  wx: number,
  wy: number,
  ww: number,
  wh: number,
  lit: boolean,
  night: boolean,
  wall: string,
  arch = false,
): void {
  // contorno della finestra (rettangolo o con l'arco in cima), allargato di `g`
  const shape = (g: number): void => {
    ctx.beginPath();
    if (arch) {
      ctx.moveTo(wx - g, wy + wh + g);
      ctx.lineTo(wx - g, wy + ww / 2);
      ctx.arc(wx + ww / 2, wy + ww / 2, ww / 2 + g, Math.PI, 0);
      ctx.lineTo(wx + ww + g, wy + wh + g);
      ctx.closePath();
    } else ctx.rect(wx - g, wy - g, ww + g * 2, wh + g * 2);
  };
  ctx.fillStyle = '#f5f0e6';
  shape(2);
  ctx.fill();
  ctx.save();
  shape(0);
  ctx.clip();
  const g = ctx.createLinearGradient(wx, wy, wx + ww, wy + wh);
  if (lit) {
    g.addColorStop(0, '#ffe8a3');
    g.addColorStop(1, '#f6b93b');
  } else {
    g.addColorStop(0, night ? '#2c3e66' : '#cdeefd');
    g.addColorStop(1, night ? '#1b2440' : '#6fb1d6');
  }
  ctx.fillStyle = g;
  ctx.fillRect(wx, wy, ww, wh);
  if (lit) {
    // tende raccolte ai lati
    ctx.fillStyle = 'rgba(192,57,43,0.55)';
    ctx.fillRect(wx, wy, ww * 0.22, wh);
    ctx.fillRect(wx + ww * 0.78, wy, ww * 0.22, wh);
  } else if (!night) {
    // riflesso del cielo
    ctx.fillStyle = 'rgba(255,255,255,0.45)';
    ctx.beginPath();
    ctx.moveTo(wx + ww * 0.15, wy + wh);
    ctx.lineTo(wx + ww * 0.6, wy);
    ctx.lineTo(wx + ww * 0.8, wy);
    ctx.lineTo(wx + ww * 0.35, wy + wh);
    ctx.fill();
  }
  ctx.fillStyle = '#f5f0e6';
  ctx.fillRect(wx + ww / 2 - 0.6, wy, 1.2, wh);
  ctx.fillRect(wx, wy + wh * 0.45, ww, 1.2);
  ctx.restore();
  // architrave (o ghiera dell'arco con la chiave di volta) e davanzale
  ctx.fillStyle = game.darken(wall, 0.3);
  if (arch) {
    ctx.strokeStyle = game.darken(wall, 0.3);
    ctx.lineWidth = 2.5;
    ctx.beginPath();
    ctx.arc(wx + ww / 2, wy + ww / 2, ww / 2 + 3.5, Math.PI, 0);
    ctx.stroke();
    ctx.fillRect(wx + ww / 2 - 2, wy - 6, 4, 5);
  } else ctx.fillRect(wx - 4, wy - 5, ww + 8, 3);
  ctx.fillRect(wx - 3, wy + wh + 2, ww + 6, 3);
}

/**
 * Finitura del muro di ogni palazzina (stesso stile, materiali diversi): intonaco liscio,
 * mattoni a vista, conci di pietra, bugnato a fasce orizzontali o lesene tra le finestre.
 */
const FACADE_LOOKS: { tex: string; shutter: string; arch: boolean }[] = [
  { tex: 'plaster', shutter: '#4e7d5b', arch: false },
  { tex: 'brick', shutter: '#6d4c41', arch: false },
  { tex: 'stone', shutter: '#4a6274', arch: true },
  { tex: 'bands', shutter: '#7b3b3b', arch: false },
  { tex: 'pilasters', shutter: '#4e7d5b', arch: true },
  { tex: 'brick', shutter: '#3e5e4a', arch: false },
  { tex: 'plaster', shutter: '#8a6d3b', arch: true },
  { tex: 'stone', shutter: '#6d4c41', arch: false },
];

function facadeTexture(
  ctx: CanvasRenderingContext2D,
  tex: string,
  W: number,
  H: number,
  wall: string,
  seed: number,
): void {
  const top = 10,
    bottom = H - 10;
  if (tex === 'brick') {
    // mattoni a vista con le fughe, un po' di colore diverso l'uno dall'altro
    const bw = 9,
      bh = 4.5;
    for (let r = 0, v = top; v < bottom; r++, v += bh) {
      for (let u = r % 2 ? -bw / 2 : 0, i = 0; u < W; u += bw, i++) {
        const k = rnd(seed * 31 + r * 17 + i);
        ctx.fillStyle = k > 0.5 ? game.darken(wall, 0.12 + k * 0.1) : game.lighten(wall, k * 0.12);
        ctx.fillRect(u + 0.5, v + 0.5, bw - 1, bh - 1);
      }
    }
  } else if (tex === 'stone') {
    // conci di pietra squadrati, sfalsati riga per riga
    ctx.strokeStyle = 'rgba(0,0,0,0.16)';
    ctx.lineWidth = 0.8;
    for (let r = 0, v = top; v < bottom; r++, v += 9) {
      ctx.beginPath();
      ctx.moveTo(0, v);
      ctx.lineTo(W, v);
      ctx.stroke();
      for (let u = r % 2 ? 8 : 0; u < W; u += 16) {
        ctx.fillStyle = `rgba(255,255,255,${0.04 + rnd(seed + r * 7 + u) * 0.08})`;
        ctx.fillRect(u + 1, v + 1, 14, 7);
        ctx.beginPath();
        ctx.moveTo(u, v);
        ctx.lineTo(u, v + 9);
        ctx.stroke();
      }
    }
  } else if (tex === 'bands') {
    // bugnato: fasce orizzontali in rilievo, più marcate al piano terra
    for (let v = top; v < bottom; v += 6) {
      const ground = v > H - 58;
      ctx.fillStyle = ground ? 'rgba(0,0,0,0.2)' : 'rgba(0,0,0,0.1)';
      ctx.fillRect(0, v, W, ground ? 1.5 : 1);
      ctx.fillStyle = 'rgba(255,255,255,0.12)';
      ctx.fillRect(0, v + 1.5, W, 1);
    }
  } else if (tex === 'pilasters') {
    // lesene chiare tra una colonna di finestre e l'altra, con il loro capitello
    for (const u of [W * 0.06, W * 0.375, W * 0.675, W * 0.94]) {
      ctx.fillStyle = game.lighten(wall, 0.3);
      ctx.fillRect(u - 3, top, 6, bottom - top - 46);
      ctx.fillStyle = 'rgba(0,0,0,0.12)';
      ctx.fillRect(u + 2, top, 1, bottom - top - 46);
      ctx.fillStyle = game.lighten(wall, 0.45);
      ctx.fillRect(u - 4.5, top, 9, 3);
    }
  } else {
    // intonaco: leggere macchie di colore
    for (let i = 0; i < 60; i++) {
      ctx.fillStyle = rnd(seed + i) > 0.5 ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.05)';
      ctx.beginPath();
      ctx.arc(
        rnd(seed * 3 + i) * W,
        top + rnd(seed * 5 + i) * (bottom - top),
        2 + rnd(i) * 4,
        0,
        6.3,
      );
      ctx.fill();
    }
  }
}

/** Tipo di tetto per palazzina: così lo skyline cambia da un palazzo all'altro. */
const FACADE_ROOFS = ['gable', 'tiles', 'mansard', 'flat', 'gable', 'mansard', 'tiles', 'flat'];

/**
 * Tetto di una palazzina: a falde con il timpano, di coppi piatto, a mansarda in ardesia con gli
 * abbaini, o a terrazza con il serbatoio dell'acqua e l'antenna.
 * Le coordinate sono "lungo la facciata" (a) e "verso il cortile" (d), così vale per entrambe le pareti.
 */
function drawFacadeRoof(
  it: GameValue,
  side: boolean,
  type: string,
  tall: number,
  wall: string,
): void {
  const ctx = game.view.ctx;
  const W3 = (a: number, d: number, z: number) =>
    isoProject(side ? it.x + d : it.x + a, side ? it.y + a : it.y + d, z);
  const at = (a: number, d: number): [number, number] =>
    side ? [it.x + d, it.y + a] : [it.x + a, it.y + d];
  const sized = (along: number, deep: number): [number, number] =>
    side ? [deep, along] : [along, deep];
  const front = side ? 'right' : 'left';
  const ha = FACADE_W / 2 + 3,
    hd = FACADE_D / 2 + 3;
  const edge = 'rgba(0,0,0,0.3)';
  const rows = (
    p0: (k: number) => { x: number; y: number },
    p1: (k: number) => { x: number; y: number },
    n: number,
    color: string,
  ) => {
    ctx.strokeStyle = color;
    ctx.lineWidth = 0.8;
    for (let i = 1; i < n; i++) {
      const a = p0(i / n),
        b = p1(i / n);
      ctx.beginPath();
      ctx.moveTo(a.x, a.y);
      ctx.lineTo(b.x, b.y);
      ctx.stroke();
    }
  };
  const chimney = (a: number, d: number, z0: number, h: number) => {
    const [cx, cy] = at(a, d);
    const c: GameValue = box(cx, cy, 8, 8, h, '#8e4a36', { z0 });
    onFace(c, 'left', (W: number, H: number): void => {
      ctx.strokeStyle = 'rgba(0,0,0,0.25)';
      ctx.lineWidth = 0.8;
      for (let v = 4; v < H; v += 4) {
        ctx.beginPath();
        ctx.moveTo(0, v);
        ctx.lineTo(W, v);
        ctx.stroke();
      }
    });
    box(cx, cy, 10, 10, 2, '#5d4037', { z0: z0 + h });
  };
  // cornicione sotto ogni tetto
  {
    const [bw, bh] = sized(FACADE_W + 4, FACADE_D + 4);
    box(it.x, it.y, bw, bh, 3, game.darken(wall, 0.5), { z0: tall });
  }
  const z = tall + 3;
  if (type === 'gable') {
    // a due falde con il colmo lungo la facciata e il timpano sul fianco
    const R = z + 26;
    chimney(22, -7, z, 30);
    poly([W3(-ha, -hd, z), W3(ha, -hd, z), W3(ha, 0, R), W3(-ha, 0, R)], '#8f3f2c', edge);
    poly([W3(ha, -hd, z), W3(ha, hd, z), W3(ha, 0, R)], game.darken(wall, 0.12), edge);
    const tri = W3(ha, 0, R - 12);
    ctx.fillStyle = '#f5f0e6';
    ctx.beginPath();
    ctx.arc(tri.x, tri.y, 3, 0, 6.3);
    ctx.fill();
    poly([W3(-ha, hd, z), W3(ha, hd, z), W3(ha, 0, R), W3(-ha, 0, R)], '#b5523b', edge);
    rows(
      (k) => W3(-ha, hd * (1 - k), z + (R - z) * k),
      (k) => W3(ha, hd * (1 - k), z + (R - z) * k),
      5,
      'rgba(0,0,0,0.22)',
    );
    rows(
      (k) => W3(-ha + 2 * ha * k, hd, z),
      (k) => W3(-ha + 2 * ha * k, 0, R),
      14,
      'rgba(0,0,0,0.12)',
    );
  } else if (type === 'mansard') {
    // falde ripide in ardesia, sommità piatta e due abbaini con la finestra
    const i = 8,
      M = z + 18;
    poly(
      [W3(ha, -hd, z), W3(ha, hd, z), W3(ha - i, hd - i, M), W3(ha - i, -hd + i, M)],
      '#4d5b6a',
      edge,
    );
    poly(
      [W3(-ha, hd, z), W3(ha, hd, z), W3(ha - i, hd - i, M), W3(-ha + i, hd - i, M)],
      '#5d6d7e',
      edge,
    );
    rows(
      (k) => W3(-ha + i * k, hd - i * k, z + (M - z) * k),
      (k) => W3(ha - i * k, hd - i * k, z + (M - z) * k),
      4,
      'rgba(255,255,255,0.12)',
    );
    poly(
      [
        W3(-ha + i, -hd + i, M),
        W3(ha - i, -hd + i, M),
        W3(ha - i, hd - i, M),
        W3(-ha + i, hd - i, M),
      ],
      '#7f8c8d',
      edge,
    );
    chimney(-24, -4, M, 14);
    for (const a of [-20, 20]) {
      const [dx, dy] = at(a, hd - 6);
      const [w, h] = sized(13, 6);
      const dormer: GameValue = box(dx, dy, w, h, 13, game.lighten(wall, 0.1), { z0: z + 1 });
      onFace(dormer, front, (W: number, H: number): void => {
        ctx.fillStyle = '#f5f0e6';
        ctx.fillRect(W * 0.2 - 1, H * 0.25 - 1, W * 0.6 + 2, H * 0.6 + 2);
        ctx.fillStyle = '#6fb1d6';
        ctx.fillRect(W * 0.2, H * 0.25, W * 0.6, H * 0.6);
        ctx.fillStyle = '#f5f0e6';
        ctx.fillRect(W / 2 - 0.5, H * 0.25, 1, H * 0.6);
      });
      const [cw, ch] = sized(15, 8);
      box(dx, dy, cw, ch, 2, '#4d5b6a', { z0: z + 14 });
    }
  } else if (type === 'flat') {
    // terrazza con parapetto, serbatoio dell'acqua, antenna e vasi
    const [pw, ph] = sized(FACADE_W + 2, FACADE_D + 2);
    const deck: GameValue = box(it.x, it.y, pw, ph, 6, game.darken(wall, 0.15), { z0: z });
    onFace(deck, 'top', (W: number, H: number): void => {
      ctx.fillStyle = '#b8b2a4';
      ctx.fillRect(3, 3, W - 6, H - 6);
      ctx.fillStyle = 'rgba(0,0,0,0.08)';
      for (let k = 0; k < 40; k++)
        ctx.fillRect(3 + rnd(k) * (W - 7), 3 + rnd(k + 9) * (H - 7), 1, 1);
    });
    const [tx, ty] = at(-20, -3);
    const tank: GameValue = box(tx, ty, 14, 14, 16, '#7f8c8d', { z0: z + 6 });
    onFace(tank, 'left', (W: number, H: number): void => {
      ctx.fillStyle = 'rgba(0,0,0,0.15)';
      for (let v = 4; v < H; v += 5) ctx.fillRect(0, v, W, 1);
    });
    box(tx, ty, 16, 16, 2, '#5f6a6a', { z0: z + 22 });
    const base = W3(26, -4, z + 6),
      tip = W3(26, -4, z + 42);
    ctx.strokeStyle = '#2d3436';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(base.x, base.y);
    ctx.lineTo(tip.x, tip.y);
    for (const [k, l] of [
      [0.6, 7],
      [0.8, 5],
      [1, 3],
    ]) {
      const p = W3(26, -4, z + 6 + 36 * k);
      ctx.moveTo(p.x - l, p.y + l * 0.3);
      ctx.lineTo(p.x + l, p.y - l * 0.3);
    }
    ctx.stroke();
    const s: number = isoScale();
    for (const a of [-32, 32]) {
      const [px, py] = at(a, hd - 7);
      box(px, py, 6, 6, 5, '#a0522d', { z0: z + 6 });
      const top = isoProject(px, py, z + 15);
      ctx.fillStyle = '#2e7d32';
      ctx.beginPath();
      ctx.arc(top.x, top.y, 4.5 * s, 0, 6.3);
      ctx.fill();
    }
  } else {
    // tetto piatto di coppi, come le prime palazzine
    const [rw, rh] = sized(FACADE_W + 6, FACADE_D + 6);
    const roof: GameValue = box(it.x, it.y, rw, rh, 5, game.darken(wall, 0.5), { z0: z });
    onFace(roof, 'top', (W: number, H: number): void => {
      ctx.fillStyle = '#b5523b';
      ctx.fillRect(2, 2, W - 4, H - 4);
      ctx.strokeStyle = 'rgba(0,0,0,0.22)';
      ctx.lineWidth = 1;
      for (let u = 5; u < W - 2; u += 5) {
        ctx.beginPath();
        ctx.moveTo(u, 2);
        ctx.lineTo(u, H - 2);
        ctx.stroke();
      }
      ctx.fillStyle = 'rgba(255,255,255,0.12)';
      for (let v = 4; v < H - 2; v += 6) ctx.fillRect(2, v, W - 4, 1);
    });
    chimney(22, -4, z + 5, 20);
  }
}

/**
 * Palazzina vista dal cortile: piani di finestre (accese di notte, con le tende), fioriere,
 * balcone, cantonali in pietra, tetti di tipi diversi, portone ad arco con pensilina,
 * lampioncini e vasi. `side: 'left'` = sulla parete di sinistra, altrimenti su quella di fondo.
 */
function drawFacade(
  it: GameValue,
  o: { no: number; doorColor: string; building?: boolean; open?: number },
): void {
  const ctx = game.view.ctx;
  const side = it.side === 'left';
  const idx = (o.no - 1) % FACADE_COLORS.length;
  const wall = FACADE_COLORS[idx];
  const floors = FACADE_FLOORS[idx];
  const tall = 70 + floors * 48;
  const awning = AWNING_COLORS[idx % AWNING_COLORS.length];
  const look = FACADE_LOOKS[idx];
  // balconi: sul piano più basso sempre, su tutti i piani nelle palazzine dispari
  const balconyFloors = [...Array(floors).keys()].filter((f) => f === floors - 1 || idx % 2 === 1);
  const hour = realHour(new Date());
  const night = hour >= 19 || hour < 7;
  const bw = side ? FACADE_D : FACADE_W,
    bh = side ? FACADE_W : FACADE_D;
  const b: GameValue = box(it.x, it.y, bw, bh, tall, wall);
  drawFacadeRoof(it, side, FACADE_ROOFS[idx], tall, wall);
  const opening = o.open || 0;
  // vano del portone sulla facciata (u lungo la facciata, v dall'alto): serve anche ai battenti
  let door = { dx: 0, dw: 0, spring: 0, bottom: 0 };
  // facciata principale
  onFace(b, side ? 'right' : 'left', (W: number, H: number): void => {
    // luce dall'alto: più chiaro in cima
    const sh = ctx.createLinearGradient(0, 0, 0, H);
    sh.addColorStop(0, 'rgba(255,255,255,0.12)');
    sh.addColorStop(1, 'rgba(0,0,0,0.1)');
    ctx.fillStyle = sh;
    ctx.fillRect(0, 0, W, H);
    facadeTexture(ctx, look.tex, W, H, wall, o.no);
    // cornicione con dentelli
    ctx.fillStyle = game.darken(wall, 0.3);
    ctx.fillRect(0, 0, W, 7);
    ctx.fillStyle = game.lighten(wall, 0.35);
    for (let u = 2; u < W - 2; u += 6) ctx.fillRect(u, 7, 3, 3);
    // cantonali in pietra sugli spigoli (mattoni e pietra hanno già il loro disegno)
    if (look.tex === 'plaster' || look.tex === 'bands') {
      ctx.fillStyle = game.lighten(wall, 0.45);
      for (let v = 12, i = 0; v < H - 14; v += 9, i++) {
        const qw = i % 2 ? 5 : 8;
        ctx.fillRect(0, v, qw, 7);
        ctx.fillRect(W - qw, v, qw, 7);
      }
    }
    // piani: finestre con persiane e fioriere
    const ww = W * 0.17,
      wh = 28;
    for (let f = 0; f < floors; f++) {
      const wy = 16 + f * 48;
      for (let c = 0; c < 3; c++) {
        const wx = W * (0.13 + c * 0.3);
        const lit = night && rnd(o.no * 13 + f * 3 + c) > 0.35;
        ctx.fillStyle = look.shutter;
        ctx.fillRect(wx - 7, wy - 1, 4, wh + 2);
        ctx.fillRect(wx + ww + 3, wy - 1, 4, wh + 2);
        facadeWindow(ctx, wx, wy, ww, wh, lit, night, wall, look.arch);
        if (rnd(o.no * 7 + f * 5 + c) > 0.45) {
          ctx.fillStyle = '#6d4c41';
          ctx.fillRect(wx - 1, wy + wh + 5, ww + 2, 4);
          for (let k = 0; k < 4; k++) {
            ctx.fillStyle = FLOWER_COLORS[(o.no + f + c + k) % FLOWER_COLORS.length];
            ctx.beginPath();
            ctx.arc(wx + 2 + (k * (ww - 4)) / 3, wy + wh + 4, 1.6, 0, 6.3);
            ctx.fill();
          }
        }
      }
      // marcapiano
      ctx.fillStyle = 'rgba(0,0,0,0.12)';
      ctx.fillRect(0, wy + 41, W, 3);
    }
    // ombra sul muro sotto i balconi (i balconi sono in 3D, vedi sotto)
    ctx.fillStyle = 'rgba(0,0,0,0.18)';
    for (const f of balconyFloors) ctx.fillRect(W * 0.5 - 16, 16 + f * 48 + wh + 2, 32, 5);
    // piano terra
    const gy = H - 56;
    ctx.fillStyle = game.darken(wall, 0.08);
    ctx.fillRect(0, gy, W, 46);
    // portone ad arco
    const dx = W * 0.36,
      dw = W * 0.28,
      dy = gy + 8;
    ctx.fillStyle = game.lighten(wall, 0.4);
    ctx.beginPath();
    ctx.moveTo(dx - 4, H - 10);
    ctx.lineTo(dx - 4, dy + dw / 2);
    ctx.arc(dx + dw / 2, dy + dw / 2, dw / 2 + 4, Math.PI, 0);
    ctx.lineTo(dx + dw + 4, H - 10);
    ctx.fill();
    door = { dx, dw, spring: dy + dw / 2, bottom: H - 10 };
    // androne buio dietro il portone
    ctx.fillStyle = '#20160f';
    ctx.beginPath();
    ctx.moveTo(dx, H - 10);
    ctx.lineTo(dx, dy + dw / 2);
    ctx.arc(dx + dw / 2, dy + dw / 2, dw / 2, Math.PI, 0);
    ctx.lineTo(dx + dw, H - 10);
    ctx.fill();
    ctx.fillStyle = o.doorColor;
    ctx.beginPath();
    ctx.arc(dx + dw / 2, dy + dw / 2, dw / 2, Math.PI, 0);
    ctx.fill();
    // lunetta a vetri sopra il portone
    ctx.fillStyle = night ? '#ffe08a' : 'rgba(205,238,253,0.9)';
    ctx.beginPath();
    ctx.arc(dx + dw / 2, dy + dw / 2, dw / 2 - 3, Math.PI, 0);
    ctx.fill();
    ctx.strokeStyle = 'rgba(0,0,0,0.3)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(dx + dw / 2, dy + 3);
    ctx.lineTo(dx + dw / 2, H - 10);
    ctx.moveTo(dx + 3, dy + dw / 2);
    ctx.lineTo(dx + dw - 3, dy + dw / 2);
    ctx.stroke();
    // vetrine del piano terra con tende a strisce
    for (const wx of [W * 0.07, W * 0.73]) {
      const vw = W * 0.2;
      ctx.fillStyle = night ? '#2c3e66' : '#9fd3ec';
      ctx.fillRect(wx, gy + 18, vw, 20);
      ctx.fillStyle = '#f5f0e6';
      ctx.fillRect(wx + vw / 2 - 0.6, gy + 18, 1.2, 20);
      for (let k = 0; k < 5; k++) {
        ctx.fillStyle = k % 2 ? '#ffffff' : awning;
        ctx.beginPath();
        ctx.moveTo(wx - 2 + (k * (vw + 4)) / 5, gy + 9);
        ctx.lineTo(wx - 2 + ((k + 1) * (vw + 4)) / 5, gy + 9);
        ctx.lineTo(wx - 2 + ((k + 1) * (vw + 4)) / 5, gy + 15);
        ctx.lineTo(wx - 2 + (k * (vw + 4)) / 5, gy + 15);
        ctx.fill();
      }
      ctx.fillStyle = game.darken(awning, 0.25);
      for (let k = 0; k <= 5; k++) {
        ctx.beginPath();
        ctx.arc(wx - 2 + (k * (vw + 4)) / 5, gy + 15, 1.6, 0, Math.PI);
        ctx.fill();
      }
    }
    // lampioncini ai lati del portone
    for (const lx of [dx - 9, dx + dw + 5]) {
      if (night) {
        const glow = ctx.createRadialGradient(lx + 2, dy + 8, 0, lx + 2, dy + 8, 12);
        glow.addColorStop(0, 'rgba(255,224,138,0.8)');
        glow.addColorStop(1, 'rgba(255,224,138,0)');
        ctx.fillStyle = glow;
        ctx.fillRect(lx - 10, dy - 4, 24, 24);
      }
      ctx.fillStyle = '#2d3436';
      ctx.fillRect(lx, dy + 3, 4, 2);
      ctx.fillStyle = night ? '#ffe08a' : '#d6d0c4';
      ctx.fillRect(lx, dy + 5, 4, 6);
    }
    // zoccolo in pietra
    ctx.fillStyle = game.darken(wall, 0.3);
    ctx.fillRect(0, H - 10, W, 10);
    ctx.strokeStyle = 'rgba(0,0,0,0.2)';
    ctx.lineWidth = 0.8;
    for (let u = 0, r = 0; u < W; u += 10, r++) {
      ctx.beginPath();
      ctx.moveTo(u + (r % 2) * 5, H - 10);
      ctx.lineTo(u + (r % 2) * 5, H);
      ctx.stroke();
    }
  });
  // i due battenti, chiusi o aperti verso il cortile
  const along: [number, number] = side ? [0, -1] : [1, 0];
  const ox = side ? b.x1 : b.x0;
  PORTONE.draw(
    {
      hinge: [ox + along[0] * door.dx, b.y1 + along[1] * door.dx, b.z1 - door.spring],
      along,
      normal: side ? [1, 0] : [0, 1],
      w: door.dw,
      h: door.bottom - door.spring,
    },
    { color: o.doorColor },
    opening,
  );
  if (o.building) {
    // appartamento ancora vuoto: nastro bianco e rosso sopra il portone chiuso
    onFace(b, side ? 'right' : 'left', (): void => {
      const { dx, dw } = door;
      const dy = door.spring - dw / 2;
      // appartamento ancora vuoto: nastro bianco e rosso sul portone
      ctx.save();
      ctx.beginPath();
      ctx.rect(dx - 4, dy + dw / 2 + 2, dw + 8, 9);
      ctx.clip();
      for (let u = dx - 14, i = 0; u < dx + dw + 8; u += 8, i++) {
        ctx.fillStyle = i % 2 ? '#ffffff' : '#e74c3c';
        ctx.beginPath();
        ctx.moveTo(u, dy + dw / 2 + 11);
        ctx.lineTo(u + 8, dy + dw / 2 + 2);
        ctx.lineTo(u + 16, dy + dw / 2 + 2);
        ctx.lineTo(u + 8, dy + dw / 2 + 11);
        ctx.fill();
      }
      ctx.restore();
    });
  }
  // fianco della palazzina: finestrelle per piano
  onFace(b, side ? 'left' : 'right', (W: number, H: number): void => {
    ctx.fillStyle = 'rgba(0,0,0,0.08)';
    ctx.fillRect(0, 0, W, H);
    ctx.fillStyle = game.darken(wall, 0.35);
    ctx.fillRect(0, 0, W, 7);
    ctx.fillRect(0, H - 10, W, 10);
    for (let f = 0; f < floors; f++)
      facadeWindow(
        ctx,
        W / 2 - 4,
        20 + f * 48,
        8,
        20,
        night && rnd(o.no + f * 11) > 0.5,
        night,
        wall,
      );
  });
  // gradino, zerbino e vasi ai lati del portone
  const out = FACADE_D / 2;
  const front = (along: number, away: number): [number, number] =>
    side ? [it.x + out + away, it.y + along] : [it.x + along, it.y + out + away];
  const sized = (along: number, away: number): [number, number] =>
    side ? [away, along] : [along, away];
  const part = (
    along: number,
    away: number,
    wA: number,
    wD: number,
    h: number,
    c: string,
    z0: number,
  ) => {
    const [px, py] = front(along, away);
    const [pw, ph] = sized(wA, wD);
    return box(px, py, pw, ph, h, c, { z0 });
  };
  // elementi che sporgono dalla facciata: il cartello col numero sopra il portone e i balconi
  const sign: GameValue = part(0, 1.5, 24, 3, 11, '#f5f0e6', 48);
  onFace(sign, side ? 'right' : 'left', (W: number, H: number): void => {
    ctx.strokeStyle = '#5d4037';
    ctx.lineWidth = 1.2;
    ctx.strokeRect(0.6, 0.6, W - 1.2, H - 1.2);
    ctx.fillStyle = '#2d3436';
    ctx.font = 'bold 8px sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('A' + o.no, W / 2, H / 2 + 3);
  });
  const rail = '#2d3436';
  for (const f of balconyFloors) {
    const z0 = tall - (16 + f * 48 + 28) - 3;
    part(0, 5, 32, 10, 2.5, game.darken(wall, 0.3), z0);
    for (let a = -14; a <= 14; a += 4) part(a, 9.5, 0.9, 0.9, 10, rail, z0 + 2.5);
    for (const a of [-15.5, 15.5]) part(a, 5, 0.9, 9, 0.9, rail, z0 + 11.5);
    part(0, 9.5, 32, 1.2, 1.2, rail, z0 + 11.5);
  }
  {
    const [sx, sy] = front(0, 5);
    box(sx, sy, side ? 10 : 30, side ? 30 : 10, 4, '#bdb6aa');
  }
  for (const along of [-21, 21]) {
    const [px, py] = front(along, 6);
    box(px, py, 7, 7, 8, '#a0522d');
    const top = isoProject(px, py, 14);
    const s: number = isoScale();
    ctx.fillStyle = '#2e7d32';
    ctx.beginPath();
    ctx.arc(top.x, top.y, 5.5 * s, 0, 6.3);
    ctx.fill();
    ctx.fillStyle = '#43a047';
    ctx.beginPath();
    ctx.arc(top.x - 1.5 * s, top.y - 1.5 * s, 3 * s, 0, 6.3);
    ctx.fill();
  }
}

// Ingresso di un appartamento visto dal cortile: il colore del portone dice se è il tuo o se è pieno;
// il nastro bianco e rosso resta finché nell'appartamento non abita ancora nessuno.
export function drawCourtyardDoor(key?: GameValue, it?: GameValue): GameValue {
  const mine: GameValue = hasRoom() && game.aptOfRoom(game.myAssignedRoomIdx) === it.aptIdx;
  const free: number = freeRoomsInApt(it.aptIdx);
  const building = free === game.ROOMS_PER_APT;
  const o = {
    no: it.aptIdx + 1,
    doorColor: mine ? '#2e86de' : free === 0 ? '#7f8c8d' : '#27ae60',
    building,
    open: doorOpenAmount('cortile:' + key, it.x, it.y, !building),
  };
  // la palazzina si ridisegna solo se cambia qualcosa che si vede (notte, portone, colore…)
  const hour = realHour(new Date());
  const night = hour >= 19 || hour < 7;
  const sig = [it.x, it.y, it.side, o.no, o.doorColor, o.building, o.open.toFixed(2), night].join();
  drawCached('facade:' + key, sig, it.x, it.y, FACADE_BOUNDS, () => drawFacade(it, o));
}

/** Ingombro a terra di una palazzina: non la si attraversa e chi le passa davanti resta davanti. */
export function facadeFootprint(it: GameValue): { x: number; y: number; w: number; h: number } {
  const side = it.side === 'left';
  return { x: it.x, y: it.y, w: side ? FACADE_D : FACADE_W, h: side ? FACADE_W : FACADE_D };
}

/** Spazio occupato sullo schermo da una palazzina (tetto e camino compresi). */
const FACADE_BOUNDS = { left: 120, right: 120, up: 380, down: 90 };
