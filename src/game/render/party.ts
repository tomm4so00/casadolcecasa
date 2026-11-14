// La festa del condominio (party-rules.ts): la bacheca delle spille nella stanza e, mentre la festa
// è in corso, gli addobbi del cortile (festoni di luci, striscione, coriandoli e fuochi).
import { game } from '../context.js';
import { isoProject, isoScale, setPlane } from './primitives.js';
import { partyHooks } from '../party-hooks.js';
import { PARTY_DAYS, PARTY_HOUR, partyCount } from '../party-rules.js';

/** I colori delle spille, a turno. */
const PIN_COLORS = ['#e84393', '#0984e3', '#fdcb6e', '#00b894', '#e17055', '#a29bfe'];
const BOARD_W = 58;
const BOARD_H = 46;
const COLS = 5;
const ROWS = 3;

type Spot = { x: number; y: number };
type RoomView = { layout?: Record<string, Spot>; parties?: unknown } | undefined;
const roomHere = (): RoomView => game.roomsState[game.currentRoomIdx ?? -1] as RoomView;

/** Le spille di chi abita la stanza in cui si è. */
export function partyPinsHere(): number {
  if (partyHooks.isMyRoom()) return (game.player.parties || []).length;
  return partyCount(roomHere()?.parties);
}

const SHORT_DAYS = ['Dom', 'Lun', 'Mar', 'Mer', 'Gio', 'Ven', 'Sab'];
/** "Mar · Ven · Dom ore 21", in ordine di settimana. */
const scheduleText = (): string =>
  [...PARTY_DAYS]
    .sort((a, b) => ((a + 6) % 7) - ((b + 6) % 7))
    .map((d) => SHORT_DAYS[d])
    .join(' · ') + ` ore ${PARTY_HOUR}`;

/** La bacheca in rilievo: quanto sporge il sughero e quanto la cornice. */
const CORK_OUT = 2.5;
const FRAME_OUT = 4;
const FRAME = 2.5;
/** In alto, sulla parete alta 130 (come i quadri). */
const BOARD_Z1 = 108;
const BOARD_Z0 = BOARD_Z1 - BOARD_H;

type Vec = [number, number, number];

/**
 * Le coordinate della bacheca: `a` lungo il muro (da sinistra a destra per chi guarda), `o` quanto
 * sporge, `z` l'altezza. Sulla parete di fondo `a` va verso +x, su quella di sinistra verso −y.
 */
function boardFrame(side: 'back' | 'left', spot: Spot) {
  const back = side === 'back';
  const A: Vec = back ? [1, 0, 0] : [0, -1, 0];
  const O: Vec = back ? [0, 1, 0] : [1, 0, 0];
  const x0 = back ? spot.x - BOARD_W / 2 : game.X0;
  const y0 = back ? game.Y0 : spot.y + BOARD_W / 2;
  const pt = (a: number, o: number, z: number): Vec => [
    x0 + A[0] * a + O[0] * o,
    y0 + A[1] * a + O[1] * o,
    z,
  ];
  const DOWN: Vec = [0, 0, -1];
  return {
    /** Il piano davanti, a `o` dal muro: u lungo il muro, v verso il basso dalla cima della bacheca. */
    face: (o: number) => setPlane(pt(0, o, BOARD_Z1), A, DOWN),
    /** Un blocco pieno: davanti, sopra e il fianco che si vede. */
    slab(
      a0: number,
      a1: number,
      o: number,
      z0: number,
      z1: number,
      color: string,
      light: string,
      dark: string,
    ) {
      const ctx: CanvasRenderingContext2D = game.view.ctx;
      ctx.fillStyle = light;
      setPlane(pt(a0, 0, z1), A, O);
      ctx.fillRect(0, 0, a1 - a0, o);
      // il fianco verso chi guarda: a destra sulla parete di fondo, a sinistra su quella di sinistra
      ctx.fillStyle = dark;
      setPlane(pt(back ? a1 : a0, 0, z1), O, DOWN);
      ctx.fillRect(0, 0, o, z1 - z0);
      ctx.fillStyle = color;
      setPlane(pt(a0, o, z1), A, DOWN);
      ctx.fillRect(0, 0, a1 - a0, z1 - z0);
    },
  };
}

/** Una coccarda in rilievo: nastrini sul sughero, il disco spesso a petali e la puntina tonda. */
function rosette3d(
  ctx: CanvasRenderingContext2D,
  face: (o: number) => void,
  x: number,
  y: number,
  color: string,
): void {
  // l'ombra sul sughero e i due nastrini
  face(CORK_OUT + 0.05);
  ctx.fillStyle = 'rgba(60,35,10,0.35)';
  ctx.beginPath();
  ctx.arc(x + 0.8, y + 0.9, 3.6, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = shade(color, -0.15);
  ctx.beginPath();
  ctx.moveTo(x - 1.6, y + 1);
  ctx.lineTo(x - 2.8, y + 6.5);
  ctx.lineTo(x - 0.9, y + 5.4);
  ctx.lineTo(x, y + 1.5);
  ctx.lineTo(x + 0.9, y + 5.4);
  ctx.lineTo(x + 2.8, y + 6.5);
  ctx.lineTo(x + 1.6, y + 1);
  ctx.fill();
  // lo spessore del disco: strati sempre più avanti
  for (let o = CORK_OUT + 0.3; o < CORK_OUT + 1.6; o += 0.3) {
    face(o);
    ctx.fillStyle = shade(color, -0.35);
    ctx.beginPath();
    ctx.arc(x, y, 3.3, 0, Math.PI * 2);
    ctx.fill();
  }
  // davanti: i petali e il centro chiaro
  face(CORK_OUT + 1.6);
  ctx.fillStyle = color;
  for (let k = 0; k < 10; k++) {
    const a = (k / 10) * Math.PI * 2;
    ctx.beginPath();
    ctx.arc(x + Math.cos(a) * 2.5, y + Math.sin(a) * 2.5, 1.1, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.beginPath();
  ctx.arc(x, y, 2.6, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = 'rgba(255,255,255,0.9)';
  ctx.beginPath();
  ctx.arc(x, y, 1.3, 0, Math.PI * 2);
  ctx.fill();
  // la puntina che la tiene, ancora più avanti, con il riflesso
  face(CORK_OUT + 2.6);
  const g = ctx.createRadialGradient(x - 0.3, y - 0.3, 0.1, x, y, 0.9);
  g.addColorStop(0, '#ffffff');
  g.addColorStop(1, '#b2bec3');
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.arc(x, y, 0.9, 0, Math.PI * 2);
  ctx.fill();
}

/** Un colore più chiaro (k > 0) o più scuro (k < 0). */
function shade(hex: string, k: number): string {
  const n = parseInt(hex.slice(1), 16);
  const ch = (v: number) =>
    Math.round(k < 0 ? v * (1 + k) : v + (255 - v) * k)
      .toString(16)
      .padStart(2, '0');
  return '#' + ch(n >> 16) + ch((n >> 8) & 255) + ch(n & 255);
}

/** La bacheca di sughero in rilievo sulla parete, con le coccarde delle feste. */
export function wallPartyBoard(d: { side?: string }): void {
  const map = partyHooks.isMyRoom() ? partyHooks.myRoomMap() : roomHere()?.layout || {};
  const spot: Spot | undefined = map.partyBoard || game.playerRoomFurniture.partyBoard;
  if (!spot) return;
  const side = spot.y <= -160 ? 'back' : 'left';
  if (d.side !== side) return;
  const ctx: CanvasRenderingContext2D = game.view.ctx;
  ctx.save();
  const b = boardFrame(side, spot);
  // il sughero e la cornice di legno, che sporge un po' di più
  b.slab(0, BOARD_W, CORK_OUT, BOARD_Z0, BOARD_Z1, '#c69c6d', '#d9b88f', '#a37b4f');
  // sul sughero: la grana, il foglietto col titolo e gli orari
  b.face(CORK_OUT + 0.02);
  ctx.fillStyle = 'rgba(110,70,30,0.28)';
  for (let i = 0; i < 46; i++) ctx.fillRect(1 + ((i * 37) % 56), 1 + ((i * 23) % 44), 0.9, 0.9);
  b.face(CORK_OUT + 0.3);
  ctx.fillStyle = '#fffdf3';
  ctx.fillRect(3.5, 2.5, BOARD_W - 7, 7);
  ctx.fillStyle = '#2d3436';
  ctx.textAlign = 'center';
  ctx.font = 'bold 3.9px sans-serif';
  ctx.fillText('FESTE DEL CONDOMINIO', BOARD_W / 2, 7.6);
  ctx.fillStyle = '#4e342e';
  ctx.font = '3.8px sans-serif';
  ctx.fillText(scheduleText(), BOARD_W / 2, BOARD_H - 3.5);
  // le spille: le ultime che ci stanno, e quante altre ce ne sono
  const n = partyPinsHere();
  const room = COLS * ROWS;
  const shown = n > room ? room - 1 : n;
  for (let i = 0; i < room; i++) {
    const x = 7 + (i % COLS) * 11;
    const y = 15 + Math.floor(i / COLS) * 9.5;
    if (i < shown) {
      rosette3d(ctx, b.face, x, y, PIN_COLORS[(n - shown + i) % PIN_COLORS.length]);
      continue;
    }
    b.face(CORK_OUT + 0.05);
    if (i === shown && n > room) {
      ctx.fillStyle = '#4e342e';
      ctx.font = 'bold 4.6px sans-serif';
      ctx.fillText(`+${n - shown}`, x, y + 1.8);
    } else {
      // il posto libero: un forellino
      ctx.fillStyle = 'rgba(80,50,20,0.35)';
      ctx.beginPath();
      ctx.arc(x, y, 0.8, 0, Math.PI * 2);
      ctx.fill();
    }
  }
  // la cornice per ultima: sporge più del sughero e ne copre il bordo
  const wood = ['#6d4c41', '#8d6e63', '#4e342e'] as const;
  b.slab(-FRAME, 0, FRAME_OUT, BOARD_Z0 - FRAME, BOARD_Z1 + FRAME, ...wood);
  b.slab(BOARD_W, BOARD_W + FRAME, FRAME_OUT, BOARD_Z0 - FRAME, BOARD_Z1 + FRAME, ...wood);
  b.slab(0, BOARD_W, FRAME_OUT, BOARD_Z0 - FRAME, BOARD_Z0, ...wood);
  b.slab(0, BOARD_W, FRAME_OUT, BOARD_Z1, BOARD_Z1 + FRAME, ...wood);
  ctx.restore();
}

// ---------------------------------------------------------------- il cortile in festa

/** I lampioni da cui partono i festoni (ENV_PROPS del cortile): due catene ai lati della fontana. */
const GARLANDS: [number, number][][] = [
  [
    [36, -122],
    [227, -37],
    [46, 206],
  ],
  [
    [-36, -122],
    [-283, -37],
    [-46, 206],
  ],
  // e davanti, tra i due lampioni dell'uscita: la piazzetta resta tutta dentro le luci
  [
    [-46, 206],
    [46, 206],
  ],
];
/** Lo striscione, tra i due lampioni del vialetto che va alle palazzine. */
const BANNER = { x0: -36, x1: 36, y: -122 };
const LAMP_TOP = 86;
const BULB_COLORS = ['255,82,82', '255,214,64', '72,219,251', '29,209,161', '255,159,243'];

const rnd = (i: number): number => {
  const x = Math.sin(i * 127.1 + 311.7) * 43758.5453;
  return x - Math.floor(x);
};

function drawGarland(ctx: CanvasRenderingContext2D, a: number[], b: number[], t: number): void {
  const s = isoScale();
  const len = Math.hypot(b[0] - a[0], b[1] - a[1]);
  const n = Math.max(6, Math.round(len / 16));
  const sag = Math.min(26, len / 9);
  const pts = [];
  for (let k = 0; k <= n; k++) {
    const f = k / n;
    pts.push(
      isoProject(
        a[0] + (b[0] - a[0]) * f,
        a[1] + (b[1] - a[1]) * f,
        LAMP_TOP - sag * 4 * f * (1 - f),
      ),
    );
  }
  ctx.strokeStyle = 'rgba(30,30,30,0.85)';
  ctx.lineWidth = Math.max(1.4, 1.1 * s);
  ctx.beginPath();
  pts.forEach((p, k) => (k ? ctx.lineTo(p.x, p.y) : ctx.moveTo(p.x, p.y)));
  ctx.stroke();
  // le lampadine: si accendono a onde, ognuna col suo colore
  pts.forEach((p, k) => {
    if (k === 0 || k === n) return;
    const c =
      BULB_COLORS[
        (((k + Math.round(a[0])) % BULB_COLORS.length) + BULB_COLORS.length) % BULB_COLORS.length
      ];
    const on = 0.55 + 0.45 * Math.sin(t * 4 - k * 0.9);
    const r = Math.max(3, 3 * s);
    const glow = ctx.createRadialGradient(p.x, p.y + r, 0, p.x, p.y + r, r * 5);
    glow.addColorStop(0, `rgba(${c},${0.7 * on})`);
    glow.addColorStop(1, `rgba(${c},0)`);
    ctx.fillStyle = glow;
    ctx.beginPath();
    ctx.arc(p.x, p.y + r, r * 5, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = `rgba(${c},${0.5 + 0.5 * on})`;
    ctx.beginPath();
    ctx.arc(p.x, p.y + r, r, 0, Math.PI * 2);
    ctx.fill();
  });
}

function drawBanner(ctx: CanvasRenderingContext2D, t: number): void {
  const s = isoScale();
  const W = BANNER.x1 - BANNER.x0;
  const H = 24;
  // tutto lo striscione dondola piano, scritta compresa: la scritta è stampata sulla stoffa
  const z1 = LAMP_TOP - 2 + Math.sin(t * 1.6) * 0.8;
  // le corde fino ai lampioni
  ctx.strokeStyle = 'rgba(30,30,30,0.8)';
  ctx.lineWidth = Math.max(1, 0.7 * s);
  ctx.beginPath();
  for (const x of [BANNER.x0, BANNER.x1]) {
    const lamp = isoProject(x, BANNER.y, LAMP_TOP + 2);
    const corner = isoProject(x, BANNER.y, z1);
    ctx.moveTo(lamp.x, lamp.y);
    ctx.lineTo(corner.x, corner.y);
  }
  ctx.stroke();
  // la stoffa, nel suo piano: u lungo lo striscione, v verso il basso
  setPlane([BANNER.x0, BANNER.y, z1], [1, 0, 0], [0, 0, -1]);
  const stripes = 9;
  for (let k = 0; k < stripes; k++) {
    ctx.fillStyle = k % 2 ? '#e84393' : '#d63080';
    ctx.fillRect((k * W) / stripes, 0, W / stripes + 0.2, H - 4);
  }
  // il bordo in basso a punte, come le bandierine
  const teeth = 9;
  for (let k = 0; k < teeth; k++) {
    ctx.fillStyle = k % 2 ? '#fdcb6e' : '#48dbfb';
    ctx.beginPath();
    ctx.moveTo((k * W) / teeth, H - 4);
    ctx.lineTo(((k + 1) * W) / teeth, H - 4);
    ctx.lineTo(((k + 0.5) * W) / teeth, H);
    ctx.fill();
  }
  ctx.fillStyle = '#fff3c4';
  ctx.fillRect(0, 0, W, 1.6);
  // la scritta, stampata sulla stoffa
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.font = '900 12px sans-serif';
  ctx.lineWidth = 2;
  ctx.strokeStyle = '#6c1450';
  ctx.strokeText('★ FESTA! ★', W / 2, (H - 4) / 2 + 0.8);
  ctx.fillStyle = '#ffffff';
  ctx.fillText('★ FESTA! ★', W / 2, (H - 4) / 2 + 0.8);
  ctx.textBaseline = 'alphabetic';
  ctx.setTransform(1, 0, 0, 1, 0, 0);
}

/** Coriandoli che cadono su tutto lo schermo, sempre gli stessi (dipendono solo dal tempo). */
function drawConfetti(ctx: CanvasRenderingContext2D, t: number): void {
  const W = game.view.canvas.width,
    H = game.view.canvas.height;
  const colors = ['#ff6b81', '#feca57', '#48dbfb', '#1dd1a1', '#ff9ff3', '#ffffff'];
  for (let i = 0; i < 90; i++) {
    const speed = 30 + rnd(i) * 40;
    const y = ((rnd(i + 100) * (H + 40) + t * speed) % (H + 40)) - 20;
    const x = rnd(i + 200) * W + Math.sin(t * 1.5 + i) * 18;
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(t * (1 + rnd(i + 300) * 3) + i);
    ctx.fillStyle = colors[i % colors.length];
    ctx.fillRect(-4, -2, 8, 4);
    ctx.restore();
  }
}

/** Un fuoco d'artificio ogni tanto, in alto: si apre, cade un po' e si spegne. */
function drawFireworks(ctx: CanvasRenderingContext2D, t: number): void {
  const W = game.view.canvas.width,
    H = game.view.canvas.height;
  const EVERY = 1.1,
    LIFE = 2.2;
  const now = Math.floor(t / EVERY);
  for (let k = now - 2; k <= now; k++) {
    const age = t - k * EVERY;
    if (age < 0 || age > LIFE) continue;
    const cx = W * (0.15 + rnd(k) * 0.7),
      cy = H * (0.1 + rnd(k + 50) * 0.25);
    const c = BULB_COLORS[Math.abs(k) % BULB_COLORS.length];
    const R = Math.min(W, H) * (0.11 + rnd(k + 90) * 0.06);
    const p = age / LIFE;
    const spread = R * Math.sqrt(Math.min(1, age / 0.6));
    const fall = p * p * 30;
    // le scie dal centro e la punta luminosa di ogni scintilla
    ctx.strokeStyle = `rgba(${c},${0.45 * (1 - p)})`;
    ctx.fillStyle = `rgba(${c},${1 - p})`;
    ctx.lineWidth = 1.5;
    for (let j = 0; j < 26; j++) {
      const a = (j / 26) * Math.PI * 2 + k;
      const x = cx + Math.cos(a) * spread;
      const y = cy + Math.sin(a) * spread + fall;
      ctx.beginPath();
      ctx.moveTo(cx + Math.cos(a) * spread * 0.55, cy + Math.sin(a) * spread * 0.55 + fall);
      ctx.lineTo(x, y);
      ctx.stroke();
      ctx.beginPath();
      ctx.arc(x, y, 3 * (1 - p * 0.5), 0, Math.PI * 2);
      ctx.fill();
    }
  }
}

/** Il cortile in festa, sopra la scena e dopo le luci della notte (le lampadine brillano). */
export function drawPartyCourtyard(t: number): void {
  const ctx: CanvasRenderingContext2D = game.view.ctx;
  ctx.save();
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  drawFireworks(ctx, t);
  for (const chain of GARLANDS)
    for (let i = 0; i + 1 < chain.length; i++) drawGarland(ctx, chain[i], chain[i + 1], t);
  drawBanner(ctx, t);
  drawConfetti(ctx, t);
  ctx.restore();
}
