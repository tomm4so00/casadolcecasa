// I tre minigiochi del cabinato, in stile console anni '80: uno schermo piccolo (192×120 punti)
// che si ingrandisce senza sfumare, pochi colori, sprite fatti di quadratini. Qui ci sono solo
// le regole e il disegno: niente browser né gioco intorno (vedi cabinet.ts), così si testano.
import type { CabinetGameId } from './cabinet-rules.js';

export const SCREEN_W = 192;
export const SCREEN_H = 120;

/** Comandi del momento: frecce, pulsante A, e dove tocca il dito (per la racchetta). */
export interface PadInput {
  left: boolean;
  right: boolean;
  up: boolean;
  down: boolean;
  action: boolean;
  /** posizione orizzontale del dito sullo schermo del gioco (0…SCREEN_W), se tocca */
  pointerX?: number | null;
}

export interface MiniGame {
  readonly id: CabinetGameId;
  score: number;
  over: boolean;
  /** per il disegno: c'è ancora da premere A per partire (pallina sulla racchetta…) */
  waiting: boolean;
  update(dt: number, input: PadInput): void;
  draw(ctx: CanvasRenderingContext2D, t: number): void;
}

type Rng = () => number;

// ---------------------------------------------------------------- sprite

/** Disegna uno sprite fatto di righe ('#' = pieno) con l'angolo in alto a sinistra in (x, y). */
function sprite(
  ctx: CanvasRenderingContext2D,
  rows: string[],
  x: number,
  y: number,
  color: string,
) {
  ctx.fillStyle = color;
  for (let r = 0; r < rows.length; r++)
    for (let c = 0; c < rows[r].length; c++)
      if (rows[r][c] === '#') ctx.fillRect(Math.round(x) + c, Math.round(y) + r, 1, 1);
}

/** Cerchio pieno a quadratini (meteore, nuvole). */
function pixelDisc(ctx: CanvasRenderingContext2D, cx: number, cy: number, r: number) {
  for (let dy = -r; dy <= r; dy++) {
    const w = Math.round(Math.sqrt(Math.max(0, r * r - dy * dy)));
    ctx.fillRect(Math.round(cx - w), Math.round(cy + dy), w * 2 + 1, 1);
  }
}

/**
 * Carattere a quadratini 3×5, come sulle console dell'epoca: le lettere del browser, piccole e
 * ingrandite, verrebbero sfocate. Ogni lettera: cinque righe da tre ('#' = acceso).
 */
const FONT: Record<string, string> = {
  '0': '###|#.#|#.#|#.#|###',
  '1': '.#.|##.|.#.|.#.|###',
  '2': '###|..#|###|#..|###',
  '3': '###|..#|.##|..#|###',
  '4': '#.#|#.#|###|..#|..#',
  '5': '###|#..|###|..#|###',
  '6': '###|#..|###|#.#|###',
  '7': '###|..#|.#.|.#.|.#.',
  '8': '###|#.#|###|#.#|###',
  '9': '###|#.#|###|..#|###',
  A: '.#.|#.#|###|#.#|#.#',
  B: '##.|#.#|##.|#.#|##.',
  C: '.##|#..|#..|#..|.##',
  D: '##.|#.#|#.#|#.#|##.',
  E: '###|#..|##.|#..|###',
  F: '###|#..|##.|#..|#..',
  G: '.##|#..|#.#|#.#|.##',
  H: '#.#|#.#|###|#.#|#.#',
  I: '###|.#.|.#.|.#.|###',
  J: '..#|..#|..#|#.#|.#.',
  K: '#.#|#.#|##.|#.#|#.#',
  L: '#..|#..|#..|#..|###',
  M: '#.#|###|###|#.#|#.#',
  N: '##.|#.#|#.#|#.#|#.#',
  O: '.#.|#.#|#.#|#.#|.#.',
  P: '##.|#.#|##.|#..|#..',
  Q: '.#.|#.#|#.#|##.|.##',
  R: '##.|#.#|##.|##.|#.#',
  S: '.##|#..|.#.|..#|##.',
  T: '###|.#.|.#.|.#.|.#.',
  U: '#.#|#.#|#.#|#.#|###',
  V: '#.#|#.#|#.#|#.#|.#.',
  W: '#.#|#.#|###|###|#.#',
  X: '#.#|#.#|.#.|#.#|#.#',
  Y: '#.#|#.#|.#.|.#.|.#.',
  Z: '###|..#|.#.|#..|###',
  '!': '.#.|.#.|.#.|...|.#.',
  ':': '...|.#.|...|.#.|...',
  '-': '...|...|###|...|...',
  '+': '...|.#.|###|.#.|...',
};

/** Testo col carattere a quadratini; `size` = grandezza di ogni quadratino. */
function text(
  ctx: CanvasRenderingContext2D,
  s: string,
  x: number,
  y: number,
  color: string,
  align: CanvasTextAlign = 'left',
  size = 1,
) {
  const chars = s.toUpperCase();
  const width = (chars.length * 4 - 1) * size;
  let cx = Math.round(align === 'center' ? x - width / 2 : align === 'right' ? x - width : x);
  ctx.fillStyle = color;
  for (const ch of chars) {
    const rows = FONT[ch]?.split('|');
    if (rows)
      rows.forEach((row, r) => {
        for (let c = 0; c < 3; c++)
          if (row[c] === '#') ctx.fillRect(cx + c * size, Math.round(y) + r * size, size, size);
      });
    cx += 4 * size;
  }
}

const pad = (n: number, len = 5) => String(Math.floor(n)).padStart(len, '0');

// ---------------------------------------------------------------- CANE IN FUGA

const DOG_RUN = [
  [
    '..........##....',
    '.........####...',
    '.........#.####.',
    '#........######.',
    '##.......####...',
    '.##########.....',
    '.##########.....',
    '..#########.....',
    '..##.....##.....',
    '..#.......#.....',
    '.##......##.....',
  ],
  [
    '..........##....',
    '.........####...',
    '.........#.####.',
    '#........######.',
    '##.......####...',
    '.##########.....',
    '.##########.....',
    '..#########.....',
    '...##...##......',
    '...#.....##.....',
    '..##......#.....',
  ],
];
const DOG_DUCK = [
  [
    '..............##....',
    '#............######.',
    '##############.####.',
    '.#################..',
    '..###########.......',
    '..##......##........',
    '.##......##.........',
  ],
  [
    '..............##....',
    '#............######.',
    '##############.####.',
    '.#################..',
    '..###########.......',
    '...##....##.........',
    '...#......##........',
  ],
];
const BENCH = [
  '##############',
  '##############',
  '..............',
  '##############',
  '##############',
  '.##........##.',
  '.##........##.',
  '.##........##.',
  '.##........##.',
];
const HYDRANT = [
  '..####..',
  '.######.',
  '..####..',
  '########',
  '########',
  '..####..',
  '..####..',
  '..####..',
  '..####..',
  '..####..',
  '..####..',
  '.######.',
  '########',
];
const PIGEON = [
  ['..##......', '.####.....', '##########', '..#######.', '...####...', '..........'],
  ['..........', '.####.....', '##########', '..#######.', '...####...', '....##....'],
];

interface Obstacle {
  kind: 'bench' | 'hydrant' | 'puddle' | 'pigeon';
  x: number;
  /** altezza da terra del lato basso */
  y0: number;
  w: number;
  h: number;
}

/** Corsa infinita: il cane salta panchine, idranti e pozzanghere e si abbassa sotto i piccioni. */
export class DogRun implements MiniGame {
  readonly id = 'dog' as const;
  score = 0;
  over = false;
  waiting = true;
  private y = 0; // altezza da terra
  private vy = 0;
  private dist = 0;
  private speed = 75;
  private ducking = false;
  private obstacles: Obstacle[] = [];
  private gap = 120;
  private clock = 0;
  static readonly GROUND = 104;
  static readonly X = 22;

  constructor(private rng: Rng = Math.random) {}

  /** Il riquadro del cane (x, altezza da terra del lato basso, larghezza, altezza). */
  private dogBox() {
    return this.ducking
      ? { x: DogRun.X + 1, y0: this.y, w: 17, h: 6 }
      : { x: DogRun.X + 2, y0: this.y, w: 12, h: 10 };
  }

  update(dt: number, input: PadInput): void {
    if (this.over) return;
    const jump = input.up || input.action;
    if (this.waiting) {
      if (!jump) return;
      this.waiting = false;
    }
    this.clock += dt;
    // si parte piano e si accelera piano piano
    this.speed = Math.min(175, 75 + this.dist * 0.011);
    this.dist += this.speed * dt;
    this.score = Math.floor(this.dist / 8);
    // salto: tenendo premuto si va più in alto; con ▼ in aria si scende in fretta
    const onGround = this.y <= 0;
    if (jump && onGround) this.vy = 205;
    const g = input.down ? 1400 : jump && this.vy > 0 ? 470 : 760;
    this.vy -= g * dt;
    this.y = Math.max(0, this.y + this.vy * dt);
    if (this.y <= 0) this.vy = 0;
    this.ducking = input.down && this.y <= 0;
    // ostacoli
    for (const o of this.obstacles) o.x -= this.speed * dt;
    this.obstacles = this.obstacles.filter((o) => o.x + o.w > -4);
    this.gap -= this.speed * dt;
    if (this.gap <= 0) {
      this.obstacles.push(this.newObstacle());
      this.gap = (0.75 + this.rng() * 1.0) * (60 + this.speed * 0.75);
    }
    const d = this.dogBox();
    for (const o of this.obstacles) {
      const hitX = d.x + d.w - 2 > o.x + 1 && d.x + 1 < o.x + o.w - 1;
      const hitY = d.y0 < o.y0 + o.h - 1 && d.y0 + d.h > o.y0 + 1;
      if (hitX && hitY) this.over = true;
    }
  }

  private newObstacle(): Obstacle {
    const r = this.rng();
    const x = SCREEN_W + 4;
    // i piccioni arrivano dopo un po'
    if (this.score > 120 && r < 0.25) {
      const low = this.rng() < 0.5;
      return { kind: 'pigeon', x, y0: low ? 9 : 2, w: 10, h: 6 };
    }
    if (r < 0.5) return { kind: 'bench', x, y0: 0, w: 14, h: 9 };
    if (r < 0.78) return { kind: 'hydrant', x, y0: 0, w: 8, h: 13 };
    return { kind: 'puddle', x, y0: 0, w: 18, h: 3 };
  }

  draw(ctx: CanvasRenderingContext2D, t: number): void {
    const ink = '#535353';
    ctx.fillStyle = '#f7f7f7';
    ctx.fillRect(0, 0, SCREEN_W, SCREEN_H);
    // nuvole che scorrono piano
    ctx.fillStyle = '#d6d6d6';
    for (let i = 0; i < 3; i++) {
      const cx = ((((i * 83 - this.dist * 0.15) % 240) + 240) % 240) - 24;
      const cy = 18 + i * 13;
      ctx.fillRect(Math.round(cx), cy, 16, 2);
      ctx.fillRect(Math.round(cx) + 3, cy - 2, 9, 2);
    }
    // terreno con i sassolini
    const G = DogRun.GROUND;
    ctx.fillStyle = ink;
    ctx.fillRect(0, G, SCREEN_W, 1);
    for (let i = 0; i < 24; i++) {
      const x = (((i * 37 - this.dist) % 200) + 200) % 200;
      ctx.fillRect(Math.round(x), G + 3 + (i % 3) * 3, 1 + (i % 2), 1);
    }
    for (const o of this.obstacles) {
      const top = G - o.y0 - o.h;
      if (o.kind === 'bench') sprite(ctx, BENCH, o.x, top, ink);
      else if (o.kind === 'hydrant') sprite(ctx, HYDRANT, o.x, top, ink);
      else if (o.kind === 'puddle') {
        ctx.fillStyle = '#9fb6c8';
        ctx.fillRect(Math.round(o.x), G - 2, o.w, 3);
        ctx.fillStyle = '#c9d8e3';
        ctx.fillRect(Math.round(o.x) + 3, G - 2, 6, 1);
      } else sprite(ctx, PIGEON[Math.floor(t * 6) % 2], o.x, top, ink);
    }
    // il cane: due fotogrammi di corsa, schiacciato quando si abbassa
    const frame = this.waiting || this.y > 0 ? 0 : Math.floor(this.clock * 12) % 2;
    if (this.ducking) sprite(ctx, DOG_DUCK[frame], DogRun.X, G - 7, ink);
    else sprite(ctx, DOG_RUN[frame], DogRun.X, G - 11 - this.y, ink);
    text(ctx, pad(this.score), SCREEN_W - 4, 4, ink, 'right');
    if (this.waiting) text(ctx, 'PREMI A PER SALTARE', SCREEN_W / 2, 50, ink, 'center');
    if (this.over) text(ctx, 'GAME OVER', SCREEN_W / 2, 44, ink, 'center', 2);
  }
}

// ---------------------------------------------------------------- MATTONCINI

const BRICK_COLS = 12;
const BRICK_ROWS = 6;
const BRICK_W = 15;
const BRICK_H = 5;
const BRICK_LEFT = 6;
const BRICK_TOP = 18;
const BRICK_COLORS = ['#d82800', '#fc7400', '#f8b800', '#58d854', '#3cbcfc', '#a888fc'];
/** Punti di un mattoncino: quelli in alto, più difficili da raggiungere, valgono di più. */
const BRICK_POINTS = [6, 5, 4, 3, 2, 1];

/** Racchetta e pallina contro sei file di mattoncini; finite le file, si riparte più veloci. */
export class Bricks implements MiniGame {
  readonly id = 'bricks' as const;
  score = 0;
  over = false;
  waiting = true;
  lives = 3;
  level = 1;
  private bricks: boolean[] = [];
  private paddleX = SCREEN_W / 2;
  private ballX = 0;
  private ballY = 0;
  private vx = 0;
  private vy = 0;
  static readonly PADDLE_W = 26;
  static readonly PADDLE_Y = 110;

  constructor(private rng: Rng = Math.random) {
    this.fill();
    this.stick();
  }

  private fill() {
    this.bricks = new Array(BRICK_COLS * BRICK_ROWS).fill(true);
  }
  private stick() {
    this.waiting = true;
    this.ballX = this.paddleX;
    this.ballY = Bricks.PADDLE_Y - 3;
  }
  private get ballSpeed() {
    return Math.min(
      190,
      105 + (this.level - 1) * 15 + (BRICK_COLS * BRICK_ROWS - this.left()) * 0.6,
    );
  }
  left(): number {
    return this.bricks.filter(Boolean).length;
  }

  update(dt: number, input: PadInput): void {
    if (this.over) return;
    // racchetta: frecce, oppure segue il dito
    const half = Bricks.PADDLE_W / 2;
    if (typeof input.pointerX === 'number') {
      const d = input.pointerX - this.paddleX;
      this.paddleX += Math.sign(d) * Math.min(Math.abs(d), 260 * dt);
    } else this.paddleX += ((input.right ? 1 : 0) - (input.left ? 1 : 0)) * 170 * dt;
    this.paddleX = Math.max(half, Math.min(SCREEN_W - half, this.paddleX));
    if (this.waiting) {
      this.ballX = this.paddleX;
      if (!input.action && !input.up) return;
      this.waiting = false;
      const a = (this.rng() - 0.5) * 0.9;
      this.vx = Math.sin(a) * this.ballSpeed;
      this.vy = -Math.cos(a) * this.ballSpeed;
    }
    // a piccoli passi, così la pallina non passa attraverso i mattoncini
    const steps = Math.max(1, Math.ceil((this.ballSpeed * dt) / 1.5));
    for (let i = 0; i < steps && !this.waiting; i++) this.step(dt / steps);
  }

  private step(dt: number) {
    this.ballX += this.vx * dt;
    this.ballY += this.vy * dt;
    if (this.ballX < 1) {
      this.ballX = 1;
      this.vx = Math.abs(this.vx);
    } else if (this.ballX > SCREEN_W - 1) {
      this.ballX = SCREEN_W - 1;
      this.vx = -Math.abs(this.vx);
    }
    if (this.ballY < 10) {
      this.ballY = 10;
      this.vy = Math.abs(this.vy);
    }
    // racchetta: l'angolo dipende da dove la pallina la colpisce
    const half = Bricks.PADDLE_W / 2;
    if (
      this.vy > 0 &&
      this.ballY >= Bricks.PADDLE_Y - 1 &&
      this.ballY <= Bricks.PADDLE_Y + 2 &&
      Math.abs(this.ballX - this.paddleX) <= half + 1
    ) {
      const off = Math.max(-1, Math.min(1, (this.ballX - this.paddleX) / half));
      let a = off * 1.05;
      // mai dritta in verticale: rimbalzerebbe per sempre nella stessa colonna
      if (Math.abs(a) < 0.22) a = (a !== 0 ? Math.sign(a) : Math.sign(this.vx) || 1) * 0.22;
      this.vx = Math.sin(a) * this.ballSpeed;
      this.vy = -Math.cos(a) * this.ballSpeed;
      this.ballY = Bricks.PADDLE_Y - 1;
    }
    // mattoncino colpito: sparisce e la pallina rimbalza
    const col = Math.floor((this.ballX - BRICK_LEFT) / BRICK_W);
    const row = Math.floor((this.ballY - BRICK_TOP) / BRICK_H);
    if (col >= 0 && col < BRICK_COLS && row >= 0 && row < BRICK_ROWS) {
      const i = row * BRICK_COLS + col;
      if (this.bricks[i]) {
        this.bricks[i] = false;
        this.score += BRICK_POINTS[row];
        this.vy = -this.vy;
        if (!this.left()) {
          this.level++;
          this.fill();
          this.stick();
        }
      }
    }
    // persa: una vita in meno
    if (this.ballY > SCREEN_H + 2) {
      this.lives--;
      if (this.lives <= 0) this.over = true;
      else this.stick();
    }
  }

  draw(ctx: CanvasRenderingContext2D): void {
    ctx.fillStyle = '#000000';
    ctx.fillRect(0, 0, SCREEN_W, SCREEN_H);
    // bordo in alto e ai lati
    ctx.fillStyle = '#8c8c8c';
    ctx.fillRect(0, 9, SCREEN_W, 1);
    for (let r = 0; r < BRICK_ROWS; r++)
      for (let c = 0; c < BRICK_COLS; c++) {
        if (!this.bricks[r * BRICK_COLS + c]) continue;
        ctx.fillStyle = BRICK_COLORS[r];
        ctx.fillRect(BRICK_LEFT + c * BRICK_W, BRICK_TOP + r * BRICK_H, BRICK_W - 1, BRICK_H - 1);
      }
    ctx.fillStyle = '#d82800';
    ctx.fillRect(
      Math.round(this.paddleX - Bricks.PADDLE_W / 2),
      Bricks.PADDLE_Y,
      Bricks.PADDLE_W,
      3,
    );
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(Math.round(this.ballX) - 1, Math.round(this.ballY) - 1, 2, 2);
    text(ctx, pad(this.score, 4), 4, 2, '#ffffff');
    text(ctx, `LV${this.level}`, SCREEN_W / 2, 2, '#f8b800', 'center');
    for (let i = 0; i < this.lives; i++) {
      ctx.fillStyle = '#d82800';
      ctx.fillRect(SCREEN_W - 8 - i * 7, 3, 5, 2);
    }
    if (this.waiting && !this.over) text(ctx, 'PREMI A', SCREEN_W / 2, 80, '#ffffff', 'center');
    if (this.over) text(ctx, 'GAME OVER', SCREEN_W / 2, 66, '#ffffff', 'center', 2);
  }
}

// ---------------------------------------------------------------- PIOGGIA DI METEORE

const SHIP = ['...#...', '..###..', '..#.#..', '.#####.', '##.#.##', '#..#..#'];

interface Meteor {
  x: number;
  y: number;
  vx: number;
  vy: number;
  size: 1 | 2 | 3;
}
/** Punti per meteora colpita: le grandi valgono di più ma si spaccano in due. */
const METEOR_POINTS = { 1: 15, 2: 10, 3: 5 } as const;
const METEOR_R = { 1: 2, 2: 4, 3: 7 } as const;

/** Il razzo CDC-1 si sposta in basso e spara alle meteore: se una lo colpisce è finita. */
export class Meteors implements MiniGame {
  readonly id = 'meteors' as const;
  score = 0;
  over = false;
  waiting = true;
  private shipX = SCREEN_W / 2;
  private bullets: { x: number; y: number }[] = [];
  private meteors: Meteor[] = [];
  private cooldown = 0;
  private spawn = 0.6;
  private clock = 0;
  private boom = -1;
  static readonly SHIP_Y = 110;

  constructor(private rng: Rng = Math.random) {}

  update(dt: number, input: PadInput): void {
    if (this.over) {
      if (this.boom >= 0) this.boom += dt;
      return;
    }
    if (this.waiting) {
      if (!input.action && !input.up) return;
      this.waiting = false;
      this.cooldown = 0.25;
    }
    this.clock += dt;
    if (typeof input.pointerX === 'number') {
      const d = input.pointerX - this.shipX;
      this.shipX += Math.sign(d) * Math.min(Math.abs(d), 150 * dt);
    } else this.shipX += ((input.right ? 1 : 0) - (input.left ? 1 : 0)) * 125 * dt;
    this.shipX = Math.max(4, Math.min(SCREEN_W - 4, this.shipX));
    // spari: al massimo quattro al secondo
    this.cooldown -= dt;
    if (input.action && this.cooldown <= 0 && this.bullets.length < 4) {
      this.bullets.push({ x: this.shipX, y: Meteors.SHIP_Y - 1 });
      this.cooldown = 0.24;
    }
    for (const b of this.bullets) b.y -= 210 * dt;
    this.bullets = this.bullets.filter((b) => b.y > -4);
    // meteore sempre più fitte e veloci
    this.spawn -= dt;
    if (this.spawn <= 0) {
      const size = (1 + Math.floor(this.rng() * 3)) as 1 | 2 | 3;
      this.meteors.push({
        x: 8 + this.rng() * (SCREEN_W - 16),
        y: -8,
        vx: (this.rng() - 0.5) * 18,
        vy: 22 + this.rng() * 22 + this.clock * 0.9,
        size,
      });
      this.spawn = Math.max(0.32, 1.15 - this.clock * 0.012) * (0.7 + this.rng() * 0.6);
    }
    for (const m of this.meteors) {
      m.x += m.vx * dt;
      m.y += m.vy * dt;
      if (m.x < 2 || m.x > SCREEN_W - 2) m.vx = -m.vx;
    }
    // colpi a segno: le meteore grandi si spaccano in due più piccole
    const born: Meteor[] = [];
    for (const b of this.bullets)
      for (const m of this.meteors) {
        if (m.y < -50) continue;
        const r = METEOR_R[m.size] + 1;
        if (Math.abs(b.x - m.x) <= r && Math.abs(b.y - m.y) <= r) {
          this.score += METEOR_POINTS[m.size];
          b.y = -99;
          if (m.size > 1) {
            const s = (m.size - 1) as 1 | 2;
            born.push(
              { x: m.x - 2, y: m.y, vx: -25, vy: m.vy * 0.8, size: s },
              { x: m.x + 2, y: m.y, vx: 25, vy: m.vy * 0.8, size: s },
            );
          }
          m.y = -99;
        }
      }
    this.meteors = this.meteors.filter((m) => m.y > -60 && m.y < SCREEN_H + 10).concat(born);
    this.bullets = this.bullets.filter((b) => b.y > -4);
    // il razzo colpito
    for (const m of this.meteors) {
      const r = METEOR_R[m.size];
      if (Math.abs(m.x - this.shipX) <= r + 2 && Math.abs(m.y - (Meteors.SHIP_Y + 3)) <= r + 2) {
        this.over = true;
        this.boom = 0;
      }
    }
  }

  draw(ctx: CanvasRenderingContext2D, t: number): void {
    ctx.fillStyle = '#000018';
    ctx.fillRect(0, 0, SCREEN_W, SCREEN_H);
    // stelle che scorrono
    for (let i = 0; i < 40; i++) {
      const y = (((i * 29 + t * (8 + (i % 3) * 6)) % SCREEN_H) + SCREEN_H) % SCREEN_H;
      ctx.fillStyle = i % 5 ? '#4a4a7a' : '#c0c0ff';
      ctx.fillRect((i * 53) % SCREEN_W, Math.floor(y), 1, 1);
    }
    for (const m of this.meteors) {
      ctx.fillStyle = '#a0522d';
      pixelDisc(ctx, m.x, m.y, METEOR_R[m.size]);
      ctx.fillStyle = '#d2915a';
      if (m.size > 1) pixelDisc(ctx, m.x - 1, m.y - 1, METEOR_R[m.size] - 2);
      ctx.fillStyle = '#5c2e14';
      if (m.size > 1) ctx.fillRect(Math.round(m.x + 1), Math.round(m.y + 1), 2, 2);
    }
    ctx.fillStyle = '#fcfc54';
    for (const b of this.bullets) ctx.fillRect(Math.round(b.x), Math.round(b.y), 1, 3);
    if (this.over && this.boom >= 0) {
      // esplosione
      const k = Math.min(1, this.boom * 2);
      ctx.fillStyle = k < 0.5 ? '#fcfc54' : '#fc7400';
      pixelDisc(ctx, this.shipX, Meteors.SHIP_Y + 3, Math.round(3 + k * 7));
    } else {
      sprite(ctx, SHIP, this.shipX - 3, Meteors.SHIP_Y, '#e8e8e8');
      ctx.fillStyle = '#d82800';
      ctx.fillRect(Math.round(this.shipX), Meteors.SHIP_Y, 1, 1);
      if (!this.waiting && Math.floor(t * 12) % 2) {
        ctx.fillStyle = '#fc7400';
        ctx.fillRect(Math.round(this.shipX), Meteors.SHIP_Y + 6, 1, 2);
      }
    }
    text(ctx, pad(this.score), 4, 2, '#ffffff');
    if (this.waiting) text(ctx, 'PREMI A PER PARTIRE', SCREEN_W / 2, 56, '#ffffff', 'center');
    if (this.over) text(ctx, 'GAME OVER', SCREEN_W / 2, 52, '#ffffff', 'center', 2);
  }
}

export function newMiniGame(id: CabinetGameId, rng: Rng = Math.random): MiniGame {
  return id === 'dog' ? new DogRun(rng) : id === 'bricks' ? new Bricks(rng) : new Meteors(rng);
}

/** Console a gettone: sopra il gioco fermo, la richiesta della moneta (lampeggia). */
export function drawCoinPrompt(ctx: CanvasRenderingContext2D, price: number, t: number): void {
  ctx.fillStyle = '#000000';
  ctx.fillRect(0, SCREEN_H / 2 - 18, SCREEN_W, 36);
  ctx.fillStyle = '#fcfc54';
  ctx.fillRect(0, SCREEN_H / 2 - 18, SCREEN_W, 1);
  ctx.fillRect(0, SCREEN_H / 2 + 17, SCREEN_W, 1);
  text(ctx, `INSERISCI ${price} EURO`, SCREEN_W / 2, SCREEN_H / 2 - 12, '#fcfc54', 'center', 2);
  if (Math.floor(t * 2) % 2)
    text(ctx, 'PREMI A PER PAGARE', SCREEN_W / 2, SCREEN_H / 2 + 6, '#ffffff', 'center');
}

/**
 * Fine partita, sotto la scritta del gioco: i punti, i record battuti (quando il database
 * risponde) e l'invito a tornare al menù.
 */
export function drawOverPanel(
  ctx: CanvasRenderingContext2D,
  score: number,
  lines: string[],
  t: number,
): void {
  const h = 18 + lines.length * 8;
  const y0 = SCREEN_H - h - 4;
  ctx.fillStyle = 'rgba(0,0,0,0.85)';
  ctx.fillRect(8, y0, SCREEN_W - 16, h);
  ctx.fillStyle = '#fcfc54';
  ctx.fillRect(8, y0, SCREEN_W - 16, 1);
  text(ctx, 'PUNTI ' + score, SCREEN_W / 2, y0 + 3, '#ffffff', 'center');
  lines.forEach((l, i) => text(ctx, l, SCREEN_W / 2, y0 + 11 + i * 8, '#fcfc54', 'center'));
  if (Math.floor(t * 2) % 2) text(ctx, 'A: MENU', SCREEN_W / 2, y0 + h - 6, '#58d854', 'center');
}
