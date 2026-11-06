// Il bancone del Bar all'Aperto: dietro, contro la parete, il mobile del barista con le mensole
// di bottiglie e i bicchieri; davanti, il bancone con il piano lucido, le spine della birra e il
// poggiapiedi in ottone. È un solo oggetto che arriva fino alla parete: dietro il bancone non si
// entra, così l'ordine di disegno è giusto per chi sta davanti e ai lati (vedi depthCorner).
import type { GameValue } from '../context.js';
import { game } from '../context.js';
import { box, onFace } from './objects.js';
import { isoProject, isoScale, poly } from './primitives.js';
import { type BarMoment, type BarSpots, barMoment } from '../bar-rules.js';
import { myBarSeat } from '../courtyard-fun.js';
import { resolveLook } from '../character.js';
import { drawPlayerAvatar } from './avatars.js';

/** Un tipo di bottiglia: raggio e altezza del corpo, del collo, colori del vetro. */
interface BottleKind {
  r: number;
  tall: number;
  neck: number;
  neckTall: number;
  glass: string;
  label: string;
  cap: string;
}

const BOTTLES: Record<string, BottleKind> = {
  whisky: {
    r: 2.6,
    tall: 11,
    neck: 0.9,
    neckTall: 3,
    glass: 'rgba(176,96,20,0.93)',
    label: '#f5e6c8',
    cap: '#1b1b1b',
  },
  gin: {
    r: 2.3,
    tall: 13,
    neck: 0.85,
    neckTall: 4,
    glass: 'rgba(46,170,110,0.75)',
    label: '#ecf0f1',
    cap: '#c0392b',
  },
  vodka: {
    r: 2.1,
    tall: 14,
    neck: 0.8,
    neckTall: 5,
    glass: 'rgba(214,234,248,0.6)',
    label: '#2c3e50',
    cap: '#bdc3c7',
  },
  rum: {
    r: 2.4,
    tall: 12,
    neck: 0.9,
    neckTall: 4,
    glass: 'rgba(92,40,12,0.95)',
    label: '#f1c40f',
    cap: '#7f5539',
  },
  campari: {
    r: 2.1,
    tall: 13,
    neck: 0.8,
    neckTall: 4,
    glass: 'rgba(200,22,44,0.88)',
    label: '#ffffff',
    cap: '#c9a227',
  },
  curacao: {
    r: 2,
    tall: 13,
    neck: 0.8,
    neckTall: 5,
    glass: 'rgba(41,128,185,0.82)',
    label: '#ffffff',
    cap: '#c9a227',
  },
  tequila: {
    r: 2.3,
    tall: 12,
    neck: 0.9,
    neckTall: 3,
    glass: 'rgba(241,196,15,0.7)',
    label: '#8e2b1f',
    cap: '#2d3436',
  },
  wine: {
    r: 2,
    tall: 12,
    neck: 0.75,
    neckTall: 7,
    glass: 'rgba(22,70,38,0.95)',
    label: '#f5e6c8',
    cap: '#6d1a2a',
  },
};

/** Le due mensole, da sinistra a destra: i tipi si alternano come in un vero bar. */
const LOWER = [
  'whisky',
  'rum',
  'gin',
  'vodka',
  'campari',
  'tequila',
  'whisky',
  'curacao',
  'gin',
  'rum',
  'vodka',
];
const UPPER = [
  'wine',
  'vodka',
  'tequila',
  'gin',
  'whisky',
  'wine',
  'rum',
  'curacao',
  'campari',
  'wine',
];

/** Un cerchio di raggio r a quota z, visto in prospettiva: centro e semiassi dell'ellisse. */
function ring(x: number, y: number, z: number, r: number) {
  const p = isoProject(x, y, z),
    s = isoScale();
  // come i tavolini tondi: larghezza una volta e mezzo il raggio, altezza la metà
  return { x: p.x, y: p.y, rx: 1.5 * r * s, ry: 0.76 * r * s };
}

/** Fianco visibile di un cilindro (o di una sua fascia) da z0 a z1: la parte davanti, curva. */
function cylinderSide(x: number, y: number, z0: number, z1: number, r: number, fill: string): void {
  const ctx = game.view.ctx;
  const b = ring(x, y, z0, r),
    t = ring(x, y, z1, r);
  ctx.beginPath();
  ctx.moveTo(t.x - t.rx, t.y);
  ctx.lineTo(b.x - b.rx, b.y);
  ctx.ellipse(b.x, b.y, b.rx, b.ry, 0, Math.PI, 0, true);
  ctx.lineTo(t.x + t.rx, t.y);
  ctx.ellipse(t.x, t.y, t.rx, t.ry, 0, 0, Math.PI, false);
  ctx.closePath();
  ctx.fillStyle = fill;
  ctx.fill();
}

/** Cilindro intero: fianco, cerchio in alto e, se serve, il bordo chiaro del vetro. */
function cylinder(
  x: number,
  y: number,
  z: number,
  r: number,
  h: number,
  side: string,
  top: string,
  rimLine?: string,
): void {
  const ctx = game.view.ctx;
  cylinderSide(x, y, z, z + h, r, side);
  const t = ring(x, y, z + h, r);
  ctx.beginPath();
  ctx.ellipse(t.x, t.y, t.rx, t.ry, 0, 0, Math.PI * 2);
  ctx.fillStyle = top;
  ctx.fill();
  if (rimLine) {
    ctx.strokeStyle = rimLine;
    ctx.lineWidth = 0.6 * isoScale();
    ctx.stroke();
  }
}

/** Riflesso verticale sul vetro, un po' a sinistra del centro. */
function glint(x: number, y: number, z0: number, z1: number, r: number, alpha = 0.4): void {
  const ctx = game.view.ctx;
  const b = ring(x, y, z0, r),
    t = ring(x, y, z1, r);
  ctx.fillStyle = 'rgba(255,255,255,' + alpha + ')';
  ctx.fillRect(b.x - b.rx * 0.5, t.y + t.ry * 0.6, Math.max(0.6, b.rx * 0.16), b.y - t.y);
}

/** Una bottiglia in piedi: corpo tondo, etichetta a fascia, spalla, collo e tappo. */
function bottle(x: number, y: number, z: number, k: BottleKind): void {
  const top = z + k.tall;
  cylinder(x, y, z, k.r, k.tall, k.glass, k.glass);
  cylinderSide(x, y, z + k.tall * 0.3, z + k.tall * 0.68, k.r, k.label);
  glint(x, y, z + 1, top - 1, k.r);
  // spalla: un gradino che si stringe verso il collo
  cylinder(x, y, top, (k.r + k.neck) * 0.62, 1.2, k.glass, k.glass);
  cylinder(x, y, top + 1.2, k.neck, k.neckTall, k.glass, k.glass);
  cylinder(x, y, top + 1.2 + k.neckTall, k.neck * 1.25, 1.3, k.cap, k.cap);
}

/** Bicchiere basso (tumbler) di vetro trasparente, vuoto o con un dito di whisky. */
function tumbler(x: number, y: number, z: number, drink = false): void {
  if (drink) cylinder(x, y, z + 0.4, 1.7, 1.8, 'rgba(200,120,30,0.9)', 'rgba(230,150,50,0.95)');
  cylinder(
    x,
    y,
    z,
    2,
    4.2,
    'rgba(210,232,245,0.28)',
    'rgba(255,255,255,0.12)',
    'rgba(255,255,255,0.6)',
  );
  glint(x, y, z + 0.5, z + 3.8, 2, 0.5);
}

/** Gambo sottile di un bicchiere, dal piede alla coppa. */
function stem(x: number, y: number, z: number, h: number): void {
  const ctx = game.view.ctx;
  const foot = ring(x, y, z, 1.7);
  ctx.fillStyle = 'rgba(220,235,245,0.6)';
  ctx.beginPath();
  ctx.ellipse(foot.x, foot.y, foot.rx, foot.ry, 0, 0, Math.PI * 2);
  ctx.fill();
  const top = isoProject(x, y, z + h);
  ctx.strokeStyle = 'rgba(230,240,250,0.85)';
  ctx.lineWidth = 0.7 * isoScale();
  ctx.beginPath();
  ctx.moveTo(foot.x, foot.y);
  ctx.lineTo(top.x, top.y);
  ctx.stroke();
}

/** Calice: piede, gambo e coppa trasparente. */
function wineGlass(x: number, y: number, z: number): void {
  stem(x, y, z, 3.5);
  cylinder(
    x,
    y,
    z + 3.5,
    1.8,
    3.6,
    'rgba(210,232,245,0.3)',
    'rgba(255,255,255,0.14)',
    'rgba(255,255,255,0.65)',
  );
}

/** Pinta di birra: birra ambrata con la schiuma e il riflesso del vetro. */
function pint(x: number, y: number, z: number): void {
  cylinder(x, y, z, 2.4, 7, 'rgba(232,160,30,0.93)', '#fffaf0');
  cylinder(x, y, z + 7, 2.4, 1.6, '#fffaf0', '#ffffff', 'rgba(255,255,255,0.7)');
  glint(x, y, z + 0.8, z + 6.5, 2.4, 0.45);
}

/** Coppa da cocktail (martini) con l'oliva. */
function cocktail(x: number, y: number, z: number): void {
  const ctx = game.view.ctx;
  const s = isoScale();
  stem(x, y, z, 4.5);
  // coppa a cono rovesciato con il bordo ellittico
  const tip = isoProject(x, y, z + 4.5);
  const top = ring(x, y, z + 9, 2.8);
  poly(
    [
      { x: tip.x, y: tip.y },
      { x: top.x - top.rx, y: top.y },
      { x: top.x + top.rx, y: top.y },
    ],
    'rgba(120,220,170,0.55)',
    'rgba(255,255,255,0.55)',
  );
  ctx.fillStyle = 'rgba(190,245,215,0.8)';
  ctx.beginPath();
  ctx.ellipse(top.x, top.y, top.rx, top.ry, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = '#6b8e23';
  ctx.beginPath();
  ctx.arc(top.x + 0.8 * s, top.y + 0.6 * s, 0.9 * s, 0, Math.PI * 2);
  ctx.fill();
}

/** Una fila di bottiglie su una mensola, da sinistra a destra (le più vicine si disegnano dopo). */
function bottleRow(x0: number, x1: number, y: number, z: number, kinds: string[]): void {
  const step = (x1 - x0) / kinds.length;
  kinds.forEach((k, i) => bottle(x0 + step * (i + 0.5), y, z, BOTTLES[k]));
}

// ---------------------------------------------------------------- il barista e l'aperitivo

/** Il barista: camicia con gilet, pantaloni neri, scarpe eleganti e papillon. */
let bartenderLook: GameValue = null;
const lookOfBartender = (): GameValue =>
  (bartenderLook ??= resolveLook({
    top: 'top_vest',
    pants: 'pants_black',
    shoes: 'shoes_formal',
    neck: 'neck_bowtie',
  }));

/** Il colore dell'aperitivo (uno spritz). */
const SPRITZ = 'rgba(255,112,24,0.92)';

/** Dove il barista posa il bicchiere: al centro del piano, davanti allo sgabello. */
function glassSpot(it: GameValue, stoolX: number): { x: number; y: number; z: number } {
  const front = it.y + it.h / 2;
  return { x: stoolX + 4, y: front - 19, z: 48 };
}

/**
 * Bottiglia da aperitivo disegnata sullo schermo, tenuta per il corpo in \`hand\` e inclinata di
 * \`angle\` (0 = dritta, negativo = verso sinistra). Restituisce la punta del collo, da cui esce il
 * getto.
 */
function heldBottle(hand: { x: number; y: number }, angle: number): { x: number; y: number } {
  const ctx = game.view.ctx;
  const s = isoScale();
  ctx.save();
  ctx.translate(hand.x, hand.y);
  ctx.rotate(angle);
  const bw = 4 * s,
    bh = 10 * s;
  ctx.fillStyle = 'rgba(230,90,20,0.95)';
  ctx.fillRect(-bw / 2, -bh / 2, bw, bh);
  ctx.fillStyle = '#fff3e0';
  ctx.fillRect(-bw / 2, -bh * 0.1, bw, bh * 0.35);
  ctx.fillStyle = 'rgba(255,255,255,0.4)';
  ctx.fillRect(-bw / 2 + 0.6 * s, -bh / 2 + 1 * s, 0.8 * s, bh - 2 * s);
  ctx.fillStyle = 'rgba(230,90,20,0.95)';
  ctx.fillRect(-0.8 * s, -bh / 2 - 4 * s, 1.6 * s, 4 * s);
  ctx.fillStyle = '#c9a227';
  ctx.fillRect(-1 * s, -bh / 2 - 5.2 * s, 2 * s, 1.4 * s);
  ctx.restore();
  // punta del collo, ruotata come la bottiglia
  const tip = -(bh / 2 + 5.2 * s);
  return { x: hand.x - Math.sin(angle) * tip, y: hand.y + Math.cos(angle) * tip };
}

/** Bicchiere vuoto o pieno tenuto in mano dal barista (piccolo, sullo schermo). */
function heldGlass(hand: { x: number; y: number }, fill = 0): void {
  const ctx = game.view.ctx;
  const s = isoScale();
  const w = 3.6 * s,
    h = 6 * s;
  if (fill > 0) {
    ctx.fillStyle = SPRITZ;
    ctx.fillRect(hand.x - w / 2, hand.y - h / 2 + h * (1 - fill), w, h * fill);
  }
  ctx.fillStyle = 'rgba(220,235,245,0.35)';
  ctx.strokeStyle = 'rgba(255,255,255,0.85)';
  ctx.lineWidth = 0.7 * s;
  ctx.fillRect(hand.x - w / 2, hand.y - h / 2 - 1 * s, w, h);
  ctx.strokeRect(hand.x - w / 2, hand.y - h / 2 - 1 * s, w, h);
}

/** Calice dello spritz sul bancone, pieno fino a \`fill\` (0–1), con la fetta d'arancia. */
function spritzGlass(g: { x: number; y: number; z: number }, fill: number): void {
  stem(g.x, g.y, g.z, 3.5);
  const bowl = g.z + 3.5;
  if (fill > 0.02) {
    cylinder(g.x, g.y, bowl, 2.3, 5.6 * fill, SPRITZ, 'rgba(255,150,60,0.95)');
    // cubetti di ghiaccio che affiorano
    if (fill > 0.4) {
      const top = isoProject(g.x, g.y, bowl + 5.6 * fill);
      const ctx = game.view.ctx;
      const s = isoScale();
      ctx.fillStyle = 'rgba(235,248,255,0.75)';
      ctx.fillRect(top.x - 2 * s, top.y - 1 * s, 1.6 * s, 1.4 * s);
      ctx.fillRect(top.x + 0.6 * s, top.y - 0.4 * s, 1.6 * s, 1.4 * s);
    }
  }
  cylinder(
    g.x,
    g.y,
    bowl,
    2.6,
    6.2,
    'rgba(210,232,245,0.22)',
    'rgba(255,255,255,0.08)',
    'rgba(255,255,255,0.7)',
  );
  glint(g.x, g.y, bowl + 0.5, bowl + 5.5, 2.6, 0.45);
  if (fill > 0.9) {
    // fetta d'arancia sul bordo
    const rim = isoProject(g.x + 2.4, g.y, bowl + 6.2);
    const ctx = game.view.ctx;
    const s = isoScale();
    ctx.fillStyle = '#ff9f1a';
    ctx.beginPath();
    ctx.arc(rim.x, rim.y, 2 * s, Math.PI, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#ffe0a3';
    ctx.beginPath();
    ctx.arc(rim.x, rim.y, 1.3 * s, Math.PI, Math.PI * 2);
    ctx.fill();
  }
}

/** Il barista dietro il bancone, con quello che ha in mano. Si disegna prima del bancone. */
function drawBartender(
  it: GameValue,
  t: number,
  scene: BarMoment | null,
): { x: number; y: number } | null {
  const spots = barSpots(it);
  const b = scene
    ? scene.bartender
    : {
        x: spots.idle.x,
        y: spots.idle.y,
        back: false,
        walking: false,
        reach: 0,
        bottle: false,
        glass: false,
        pour: 0,
      };
  const P = (dx: number, dy: number, z: number) => isoProject(b.x + dx, b.y + dy, z);
  let hands: { back: { x: number; y: number }; front: { x: number; y: number } };
  let glassHand: { x: number; y: number } | null = null;
  let bottleHand: { x: number; y: number } | null = null;
  let bottleAngle = 0;
  if (b.back) {
    // girato verso le mensole: le braccia salgono a prendere le cose
    const z = 34 + b.reach * 26;
    hands = { back: P(4, -9, z), front: P(-4, -9, z) };
  } else if (b.pour > 0 && scene) {
    // versa: la bottiglia sopra il bicchiere, il bicchiere è già sul bancone
    const g = glassSpot(it, b.x - 4);
    const top = isoProject(g.x, g.y, g.z + 10);
    bottleAngle = -b.pour * 2.2;
    const s = isoScale();
    const L = 10.2 * s;
    const hand = {
      x: top.x - Math.sin(bottleAngle) * L,
      y: top.y - 7 * s + Math.cos(bottleAngle) * L,
    };
    hands = { back: hand, front: P(-5, 6, 40) };
    bottleHand = hand;
  } else if (b.bottle || b.glass) {
    // porta bottiglia e bicchiere davanti a sé
    hands = { back: P(6, 9, 56), front: P(-6, 9, 55) };
    if (b.bottle) bottleHand = hands.back;
    if (b.glass) glassHand = hands.front;
  } else if (!scene || (!b.walking && scene.done)) {
    // in attesa: lucida un bicchiere con lo straccio
    const k = Math.sin(t * 3);
    hands = { back: P(4 + k, 9, 56 + Math.cos(t * 3)), front: P(-3, 9, 54) };
    glassHand = hands.front;
  } else {
    hands = { back: P(7, 2, 30), front: P(-7, 2, 30) };
  }
  drawPlayerAvatar(b.x, b.y, 'Barista 🍸', t, lookOfBartender(), b.walking, '', {
    walkDir: { x: 0, y: b.back ? -1 : 1 },
    back: b.back,
    hands,
  });
  if (glassHand) heldGlass(glassHand);
  if (!bottleHand) return null;
  const tip = heldBottle(bottleHand, bottleAngle);
  return b.pour > 0.6 ? tip : null;
}

/** Il getto arancione dalla bottiglia al bicchiere (dopo il bicchiere, sopra il bancone). */
function pourStream(
  tip: { x: number; y: number },
  g: { x: number; y: number; z: number },
  fill: number,
): void {
  const into = isoProject(g.x, g.y, g.z + 3.5 + 5.6 * fill);
  const ctx = game.view.ctx;
  ctx.strokeStyle = SPRITZ;
  ctx.lineWidth = 1.1 * isoScale();
  ctx.beginPath();
  ctx.moveTo(tip.x, tip.y);
  ctx.lineTo(into.x, into.y);
  ctx.stroke();
}

/** Dove si muove il barista, dentro il bancone `it` (dalla parete al fronte). */
export function barSpots(it: GameValue): BarSpots {
  const back = it.y - it.h / 2,
    front = it.y + it.h / 2;
  return {
    // tra due sgabelli, a destra delle spine della birra (che altrimenti lo coprono)
    idle: { x: it.x + it.w * 0.17, y: front - 40 },
    shelfY: back + 22,
    counterY: front - 40,
  };
}

/** La scena del proprio aperitivo, se si è seduti al bancone (o null). */
export function myBarScene(): BarMoment | null {
  const seat = myBarSeat();
  if (!seat) return null;
  const counter = ((game.ENV_PROPS.bar || []) as GameValue[]).find((p) => p.kind === 'barCounter');
  return counter ? barMoment(seat.e, seat.x, barSpots(counter)) : null;
}

/** Il sorso e il bicchiere in mano per chi è seduto al bancone (opzioni del personaggio). */
export function myBarDrinkOpts(): GameValue {
  const m = myBarScene();
  return m && m.glass === 'hand' ? { sip: m.sip, glassFill: m.fill } : null;
}

export function drawBar(it: GameValue, t = 0): void {
  const ctx = game.view.ctx;
  const x: number = it.x,
    w: number = it.w;
  const back: number = it.y - it.h / 2; // la parete
  const front: number = it.y + it.h / 2; // il fronte del bancone

  // ---- dietro: pannello retroilluminato, mensole di bottiglie, mobile con i bicchieri
  const panel = box(x, back + 1, w, 2, 56, '#2b1d18', { z0: 30, edge: false });
  onFace(panel, 'left', (W: number, H: number) => {
    const glow = ctx.createLinearGradient(0, 0, 0, H);
    glow.addColorStop(0, 'rgba(255,170,60,0.05)');
    glow.addColorStop(0.5, 'rgba(255,170,60,0.32)');
    glow.addColorStop(1, 'rgba(255,170,60,0.08)');
    ctx.fillStyle = glow;
    ctx.fillRect(0, 0, W, H);
  });
  const shelfY = back + 5.5;
  for (const [z, kinds] of [
    [37, LOWER],
    [61, UPPER],
  ] as const) {
    box(x, shelfY, w - 6, 9, 2, '#8d6e63', { z0: z - 2, top: '#a1887f' });
    // striscia di luce calda sotto la mensola
    const a = isoProject(x - (w - 6) / 2, shelfY + 4.5, z - 2.2);
    const b = isoProject(x + (w - 6) / 2, shelfY + 4.5, z - 2.2);
    ctx.strokeStyle = 'rgba(255,190,90,0.85)';
    ctx.lineWidth = 1.2 * isoScale();
    ctx.beginPath();
    ctx.moveTo(a.x, a.y);
    ctx.lineTo(b.x, b.y);
    ctx.stroke();
    bottleRow(x - w / 2 + 6, x + w / 2 - 6, shelfY, z, [...kinds]);
  }
  // cornice in alto
  box(x, back + 4, w + 2, 8, 4, '#3e2723', { z0: 85, top: '#5d4037' });

  // mobile basso del barista, con ante e maniglie
  const cab = box(x, back + 8, w, 16, 30, '#3e2723', { top: '#6d4c41' });
  onFace(cab, 'left', (W: number, H: number) => {
    const doors = 6;
    for (let i = 0; i < doors; i++) {
      const dx = (W / doors) * i;
      ctx.fillStyle = i % 2 ? '#4e342e' : '#4a3029';
      ctx.fillRect(dx + 2, 3, W / doors - 4, H - 6);
      ctx.fillStyle = '#c9a227';
      ctx.fillRect(dx + W / doors / 2 - 1, H * 0.4, 2, H * 0.18);
    }
  });
  // sopra il mobile: bicchieri e calici in fila, qualcuno con il whisky
  for (let i = 0; i < 9; i++) {
    const gx = x - w / 2 + 12 + i * ((w - 24) / 8);
    if (i % 3 === 1) wineGlass(gx, back + 9, 30);
    else tumbler(gx, back + 9, 30, i === 4);
  }

  // il barista sta tra il mobile e il bancone: il bancone, disegnato dopo, gli copre le gambe
  const scene = myBarScene();
  const seat = myBarSeat();
  const tip = drawBartender(it, t, scene);

  // ---- davanti: il bancone
  const depth = 34;
  const cy = front - depth / 2;
  const body = box(x, cy, w, depth, 44, '#4e342e');
  onFace(body, 'left', (W: number, H: number) => {
    // doghe verticali in legno, zoccolo scuro, striscia LED sotto il piano
    for (let u = 0; u < W; u += 8) {
      ctx.fillStyle = (u / 8) % 2 ? '#5d4037' : '#6d4c41';
      ctx.fillRect(u, 4, 8, H - 12);
      ctx.fillStyle = 'rgba(0,0,0,0.25)';
      ctx.fillRect(u, 4, 1, H - 12);
    }
    ctx.fillStyle = '#1b1b1b';
    ctx.fillRect(0, H - 8, W, 8);
    const led = ctx.createLinearGradient(0, 0, 0, 10);
    led.addColorStop(0, 'rgba(255,190,90,0.95)');
    led.addColorStop(1, 'rgba(255,190,90,0)');
    ctx.fillStyle = led;
    ctx.fillRect(0, 0, W, 10);
  });
  onFace(body, 'right', (W: number, H: number) => {
    ctx.fillStyle = 'rgba(0,0,0,0.18)';
    ctx.fillRect(0, 0, W, H);
  });
  // poggiapiedi in ottone, su tre supporti
  for (const k of [-0.42, 0, 0.42])
    box(x + w * k, front + 3, 1.6, 4, 7, '#a67c00', { edge: false });
  box(x, front + 4.5, w - 4, 1.6, 1.6, '#d4ac0d', { z0: 7, edge: false, top: '#f7dc6f' });
  // piano lucido scuro, un po' più largo del bancone, con un riflesso di luce
  const top = box(x, cy, w + 8, depth + 8, 4, '#1c1c1c', { z0: 44, top: '#2e2e2e' });
  onFace(top, 'top', (W: number, H: number) => {
    const sheen = ctx.createLinearGradient(0, 0, W, H);
    sheen.addColorStop(0.35, 'rgba(255,255,255,0)');
    sheen.addColorStop(0.5, 'rgba(255,255,255,0.12)');
    sheen.addColorStop(0.65, 'rgba(255,255,255,0)');
    ctx.fillStyle = sheen;
    ctx.fillRect(0, 0, W, H);
  });
  onFace(top, 'left', (W: number, H: number) => {
    ctx.fillStyle = '#c9a227';
    ctx.fillRect(0, H - 1, W, 1);
  });
  const onTop = 48;
  // colonna della birra con tre spine e la vaschetta
  const tapX = x - w * 0.24;
  box(tapX, cy - 6, 16, 4, 1.5, '#7f8c8d', { z0: onTop, edge: false });
  const tower = box(tapX, cy - 8, 4, 4, 18, '#cfd8dc', {
    z0: onTop,
    right: '#90a4ae',
    top: '#eceff1',
  });
  onFace(tower, 'left', (W: number, H: number) => {
    ctx.fillStyle = 'rgba(255,255,255,0.5)';
    ctx.fillRect(W * 0.15, 1, W * 0.18, H - 2);
  });
  ['#1b1b1b', '#c0392b', '#27ae60'].forEach((color, i) => {
    const hx = tapX - 5 + i * 5;
    box(hx, cy - 5, 1.6, 2.6, 1.6, '#b0bec5', { z0: onTop + 12, edge: false });
    box(hx, cy - 4.5, 1.6, 1.6, 7, color, { z0: onTop + 13.5, edge: false });
  });
  // sul piano: due pinte e un cocktail, tra uno sgabello e l'altro
  pint(x - w * 0.15, cy + 6, onTop);
  pint(x + w * 0.17, cy + 2, onTop);
  cocktail(x + w * 0.43, cy + 4, onTop);
  // l'aperitivo del cliente, appena posato o mentre il barista versa
  if (scene && seat && scene.glass === 'counter') {
    const g = glassSpot(it, seat.x);
    spritzGlass(g, scene.fill);
    if (tip) pourStream(tip, g, scene.fill);
  }
}
