// Porte: un solo modo di disegnare le ante (chiuse a filo del muro o aperte sui cardini, con lo
// spessore) e di aprirle, e tre modelli che lo usano: la porta interna a pannelli, il portone a due
// ante e la porta di servizio con l'oblò. Telai e cornici restano a chi disegna la porta.
import { game } from '../context.js';
import { isoProject, poly, setPlane } from './primitives.js';
import { resetPlane, woodGrain } from './objects.js';

type V3 = [number, number, number];

/** Aspetto di una porta in questo momento: colore delle ante ed eventuale cartello. */
export interface DoorLook {
  color: string;
  sign?: string;
}

/**
 * Dove sta il vano: `hinge` è lo spigolo in alto a sinistra (visto da chi guarda) sul filo del
 * muro, `along` la direzione del muro verso destra, `normal` il lato verso cui si aprono le ante.
 */
export interface DoorPlace {
  hinge: V3;
  along: [number, number];
  normal: [number, number];
  w: number;
  h: number;
}

/** Faccia di un'anta larga W e alta H; `hingeLeft` dice da che parte sono i cardini. */
type LeafPainter = (W: number, H: number, look: DoorLook, hingeLeft: boolean) => void;

export class DoorModel {
  constructor(
    private readonly spec: {
      /** una o due ante */
      leaves: 1 | 2;
      /** apertura massima (radianti) */
      maxAngle: number;
      /** spessore dell'anta */
      thick: number;
      paint: LeafPainter;
    },
  ) {}

  /** Disegna le ante: `open` va da 0 (chiusa) a 1 (aperta del tutto). */
  draw(at: DoorPlace, look: DoorLook, open: number): void {
    const { leaves, maxAngle, thick, paint } = this.spec;
    const lw = at.w / leaves;
    const [ax, ay] = at.along,
      [nx, ny] = at.normal;
    for (let i = 0; i < leaves; i++) {
      const first = i === 0;
      if (open < 0.001) {
        // chiusa: l'anta sta nel piano del muro
        const o: V3 = [at.hinge[0] + ax * lw * i, at.hinge[1] + ay * lw * i, at.hinge[2]];
        onPlane(o, [ax, ay, 0], lw, at.h, () => paint(lw, at.h, look, first));
        continue;
      }
      // aperta: ruota sul suo cardine (a sinistra la prima, a destra la seconda)
      const a = open * maxAngle;
      // da chiusa lo spessore sta nello stipite: il bordo esce piano piano mentre l'anta gira
      // (pieno da circa 25°), invece di comparire tutto insieme
      const shownThick = thick * Math.min(1, a / 0.45);
      const dir = first ? 1 : -1;
      const hinge: V3 = first
        ? at.hinge
        : [at.hinge[0] + ax * at.w, at.hinge[1] + ay * at.w, at.hinge[2]];
      const u = [
        ax * dir * Math.cos(a) + nx * Math.sin(a),
        ay * dir * Math.cos(a) + ny * Math.sin(a),
        0,
      ];
      doorLeaf(hinge, u, lw, at.h, shownThick, look.color, (W, H) => {
        paint(W, H, look, true); // da aperta i cardini sono sempre all'origine dell'anta
        // più è aperta, più l'anta è in ombra
        game.view.ctx.fillStyle = `rgba(0,0,0,${0.25 * open})`;
        game.view.ctx.fillRect(0, 0, W, H);
      });
    }
  }
}

/** Disegna su un rettangolo verticale largo W e alto H, con il ritaglio. */
function onPlane(o: V3, u: V3, W: number, H: number, fn: () => void): void {
  const ctx = game.view.ctx;
  ctx.save();
  setPlane(o, u, [0, 0, -1]);
  try {
    ctx.beginPath();
    ctx.rect(0, 0, W, H);
    ctx.clip();
    fn();
  } finally {
    ctx.restore();
    resetPlane();
  }
}

/**
 * Anta aperta di una porta, con il suo spessore. `hinge` è lo spigolo in alto sul cardine, `u` la
 * direzione (orizzontale) in cui si allunga l'anta, larga W e alta H. Disegna retro e bordi del colore
 * `edge`, poi `paint(W, H)` dipinge la faccia verso chi guarda (origine in alto sul cardine).
 */
export function doorLeaf(
  hinge: number[],
  u: number[],
  W: number,
  H: number,
  thick: number,
  edge: string,
  paint: (W: number, H: number) => void,
): void {
  // lo spessore va verso il fondo della scena: chi guarda sta dalla parte di +x +y
  let nx = -u[1],
    ny = u[0];
  if (nx + ny > 0) {
    nx = -nx;
    ny = -ny;
  }
  const [hx, hy, hz] = hinge;
  const ex = hx + u[0] * W,
    ey = hy + u[1] * W;
  const bx = nx * thick,
    by = ny * thick;
  const P = isoProject;
  poly(
    [
      P(hx + bx, hy + by, hz),
      P(ex + bx, ey + by, hz),
      P(ex + bx, ey + by, hz - H),
      P(hx + bx, hy + by, hz - H),
    ],
    game.darken(edge, 0.35),
  );
  // bordo dal lato della maniglia e bordo in alto
  poly(
    [P(ex, ey, hz), P(ex + bx, ey + by, hz), P(ex + bx, ey + by, hz - H), P(ex, ey, hz - H)],
    game.darken(edge, 0.2),
    'rgba(0,0,0,0.25)',
  );
  poly(
    [P(hx, hy, hz), P(ex, ey, hz), P(ex + bx, ey + by, hz), P(hx + bx, hy + by, hz)],
    game.lighten(edge, 0.15),
    'rgba(0,0,0,0.25)',
  );
  onPlane([hx, hy, hz], [u[0], u[1], 0], W, H, () => paint(W, H));
}

// Apertura delle porte (0 = chiusa, 1 = aperta), che si muove piano verso quella voluta.
const doorOpenState = new Map<string, { k: number; t: number }>();

/**
 * Quanto è aperta una porta: si apre quando il giocatore la sta attraversando (game.doorForce)
 * e, se `byProximity`, anche quando le si avvicina; poi si richiude.
 */
export function doorOpenAmount(
  id: string,
  x: number,
  y: number,
  enabled: boolean,
  byProximity = true,
): number {
  const now = performance.now();
  const st = doorOpenState.get(id) || { k: 0, t: now };
  const dt = Math.min(0.1, Math.max(0, (now - st.t) / 1000));
  const near = byProximity && Math.hypot(game.playerPos.x - x, game.playerPos.y - y) < 75;
  const target = enabled && (near || (game.doorForce[id] || 0) > now) ? 1 : 0;
  st.k += (target - st.k) * Math.min(1, dt * 6);
  st.t = now;
  doorOpenState.set(id, st);
  return st.k * st.k * (3 - 2 * st.k);
}

// ---------------------------------------------------------------- i tre modelli
/** Maniglia dal lato opposto ai cardini, all'altezza `v`. */
const handleX = (W: number, hingeLeft: boolean, inset: number) => (hingeLeft ? W - inset : inset);

/** Porta interna a un'anta: legno a due pannelli, pomello d'ottone e il cartello (numero o icona). */
export const PANEL_DOOR = new DoorModel({
  leaves: 1,
  maxAngle: 1.45,
  thick: 3,
  paint(W, H, look, hingeLeft) {
    const ctx = game.view.ctx;
    ctx.fillStyle = look.color;
    ctx.fillRect(0, 0, W, H);
    woodGrain(W, H, 'rgba(0,0,0,0.12)', true, 6);
    ctx.strokeStyle = 'rgba(0,0,0,0.28)';
    ctx.lineWidth = 1;
    ctx.strokeRect(4, 6, W - 8, H * 0.3);
    ctx.strokeRect(4, H * 0.45, W - 8, H * 0.47);
    ctx.fillStyle = '#f1c40f';
    ctx.beginPath();
    ctx.arc(handleX(W, hingeLeft, 6), H * 0.52, 2.2, 0, Math.PI * 2);
    ctx.fill();
    if (look.sign) {
      ctx.fillStyle = 'rgba(255,255,255,0.92)';
      ctx.fillRect(W / 2 - 8, 8, 16, 12);
      ctx.fillStyle = '#2d3436';
      ctx.font = 'bold 9px sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText(look.sign, W / 2, 17.5);
    }
  },
});

/** Portone a due ante: legno a pannelli in rilievo, maniglie d'ottone verso il centro. */
export const PORTONE = new DoorModel({
  leaves: 2,
  maxAngle: 2.6, // quasi contro il muro: aperte a 90° coprirebbero metà del passaggio
  thick: 4,
  paint(W, H, look, hingeLeft) {
    const ctx = game.view.ctx;
    const g = ctx.createLinearGradient(0, 0, W, 0);
    const light = game.lighten(look.color, 0.12),
      dark = game.darken(look.color, 0.18);
    g.addColorStop(0, hingeLeft ? light : dark);
    g.addColorStop(1, hingeLeft ? dark : light);
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, W, H);
    woodGrain(W, H, 'rgba(0,0,0,0.14)', true, 5);
    const inset = Math.max(2, W * 0.12);
    for (const [py, ph] of [
      [H * 0.08, H * 0.36],
      [H * 0.52, H * 0.38],
    ]) {
      ctx.fillStyle = 'rgba(255,255,255,0.07)';
      ctx.fillRect(inset, py, W - inset * 2, ph);
      ctx.strokeStyle = 'rgba(0,0,0,0.35)';
      ctx.lineWidth = 1;
      ctx.strokeRect(inset, py, W - inset * 2, ph);
    }
    // maniglia d'ottone dal lato dove le ante si incontrano
    const hx = handleX(W, hingeLeft, Math.max(3, W * 0.12));
    ctx.fillStyle = '#d4a017';
    ctx.fillRect(hx - 1, H * 0.44, 2, Math.max(4, H * 0.1));
    // filo scuro dove le ante si chiudono
    ctx.fillStyle = 'rgba(0,0,0,0.35)';
    ctx.fillRect(hingeLeft ? W - 0.6 : 0, 0, 0.6, H);
  },
});

/** Porta di servizio in metallo: oblò in alto e maniglione antipanico. */
export const SERVICE_DOOR = new DoorModel({
  leaves: 1,
  maxAngle: 1.5,
  thick: 3,
  paint(W, H, look) {
    const ctx = game.view.ctx;
    ctx.fillStyle = look.color;
    ctx.fillRect(0, 0, W, H);
    ctx.fillStyle = 'rgba(255,255,255,0.08)';
    ctx.fillRect(0, 0, W, 3);
    ctx.fillStyle = 'rgba(200,235,255,0.85)';
    ctx.fillRect(W * 0.25, H * 0.15, W * 0.5, H * 0.25);
    ctx.strokeStyle = '#dfe6e9';
    ctx.lineWidth = 2.5;
    ctx.beginPath();
    ctx.moveTo(W * 0.15, H * 0.55);
    ctx.lineTo(W * 0.85, H * 0.55);
    ctx.stroke();
  },
});
