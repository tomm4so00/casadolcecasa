// Razzo del laboratorio e luna: rampa, lancio, volo, cantiere, porta e bacheca del laboratorio.
import { countdownText, launchPhase, rocketFlight } from '../project-rules.js';
import { type GameValue, game } from '../context.js';
import { isoProject, isoScale, rnd } from './primitives.js';
import { box, onFace, woodGrain } from './objects.js';
import { SERVICE_DOOR, doorOpenAmount } from './doors.js';
import { paintWallSurface } from './scenes.js';
import { LAB_WALL_Y } from '../data/catalogues.js';

// ---------------------------------------------------------------- RAZZO DEL LABORATORIO
/** Rampa del laboratorio ingegneristico: il razzo cresce con i soldi versati dai giocatori. */
export function drawRocketPad(it?: GameValue, t?: GameValue): GameValue {
  const now = Date.now() + (game.session.serverOffset || 0);
  const { phase, left } = launchPhase(game.rocketStage || 0, game.rocketLaunchAt, now);
  if (phase === 'launched' || phase === 'launching') {
    // dopo il primo lancio il razzo fa avanti e indietro con la luna
    drawFlight(
      it,
      rocketFlight(Math.max(game.rocketLaunchAt || 0, game.rocketTripAt || 0), now),
      t,
    );
    return;
  }
  drawRocketProp({ ...it, stage: game.rocketStage || 0 }, t);
  if (phase === 'countdown') drawCountdownSign(it, countdownText(left), left < 10000);
}

/**
 * Pulsante rosso per lanciare il razzo, su una colonnina gialla e nera. Si illumina quando il
 * razzo è completo e si abbassa quando qualcuno lo preme.
 */
export function drawLaunchButton(it?: GameValue, t?: GameValue): GameValue {
  const ctx = game.view.ctx;
  const s: number = isoScale();
  const now = Date.now() + (game.session.serverOffset || 0);
  const { phase } = launchPhase(game.rocketStage || 0, game.rocketLaunchAt, now);
  const ready = phase === 'waiting';
  const pole: GameValue = box(it.x, it.y, 16, 16, 30, '#f1c40f');
  for (const face of ['left', 'right'])
    onFace(pole, face, (W: number, H: number): void => {
      // strisce gialle e nere, solo dentro la faccia della colonnina
      ctx.save();
      ctx.beginPath();
      ctx.rect(0, 0, W, H);
      ctx.clip();
      ctx.fillStyle = '#2d3436';
      for (let i = -2; i < 8; i++) {
        ctx.beginPath();
        ctx.moveTo(i * 8, H);
        ctx.lineTo(i * 8 + 4, H);
        ctx.lineTo(i * 8 + 4 + H, 0);
        ctx.lineTo(i * 8 + H, 0);
        ctx.fill();
      }
      ctx.restore();
    });
  box(it.x, it.y, 20, 20, 3, '#636e72', { z0: 30 });
  // si abbassa per mezzo secondo dopo averlo premuto (o resta giù dopo il lancio)
  const pressed =
    (t || 0) - game.launchPressedAt < 0.5 ||
    phase === 'countdown' ||
    phase === 'launching' ||
    phase === 'launched';
  const c = isoProject(it.x, it.y, pressed ? 34 : 37);
  const r = 7 * s;
  if (ready) {
    const glow = 0.35 + 0.25 * Math.sin((t || 0) * 5);
    ctx.fillStyle = `rgba(255,71,87,${glow})`;
    ctx.beginPath();
    ctx.arc(c.x, c.y, r * 2.2, 0, 6.3);
    ctx.fill();
  }
  const g = ctx.createRadialGradient(c.x - r * 0.35, c.y - r * 0.45, 1, c.x, c.y, r);
  g.addColorStop(0, ready ? '#ff9f9f' : '#c98b8b');
  g.addColorStop(1, ready ? '#d63031' : '#7f3a3a');
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.ellipse(c.x, c.y, r, r * 0.75, 0, Math.PI, 0);
  ctx.ellipse(c.x, c.y, r, r * 0.45, 0, 0, Math.PI);
  ctx.fill();
  ctx.strokeStyle = 'rgba(0,0,0,0.35)';
  ctx.lineWidth = 1;
  ctx.stroke();
}

/** Razzo in volo: decolla, sparisce in cielo, torna giù frenando con i motori, poi è pronto. */
function drawFlight(it: GameValue, flight: ReturnType<typeof rocketFlight>, t: GameValue): void {
  if (flight.phase === 'launching') {
    drawLaunchSmoke(it, flight.since);
    drawRocketProp({ ...it, stage: 2, lift: flight.lift, flame: flight.since }, t);
  } else if (flight.phase === 'away') drawRocketProp({ ...it, stage: 2, gone: true }, t);
  else if (flight.phase === 'landing') {
    drawLaunchSmoke(it, 3000 + Math.max(0, 6000 - flight.lift * 4));
    drawRocketProp({ ...it, stage: 2, lift: flight.lift, flame: 2000 }, t);
  } else drawRocketProp({ ...it, stage: 2 }, t);
}

/** Razzo atterrato sulla luna (senza torre): riporta i giocatori sulla Terra. */
export function drawMoonRocket(it?: GameValue, t?: GameValue): GameValue {
  const now = Date.now() + (game.session.serverOffset || 0);
  drawFlight({ ...it, noTower: true, moonPad: true }, rocketFlight(game.moonTripAt || 0, now), t);
}

/** Cratere: bordo rialzato chiaro e fondo più scuro, che segue la curva della luna. */
export function drawCraterProp(it?: GameValue): GameValue {
  const ctx = game.view.ctx;
  const ring = (r: number, z: number) => {
    ctx.beginPath();
    for (let i = 0; i <= 24; i++) {
      const a = (i / 24) * Math.PI * 2;
      const p = isoProject(it.x + Math.cos(a) * r, it.y + Math.sin(a) * r, z);
      if (i) ctx.lineTo(p.x, p.y);
      else ctx.moveTo(p.x, p.y);
    }
    ctx.closePath();
  };
  ring(it.r * 1.15, 0.5);
  ctx.fillStyle = 'rgba(225,225,218,0.9)';
  ctx.fill();
  ring(it.r, 0.5);
  ctx.fillStyle = '#8f8f88';
  ctx.fill();
  ring(it.r * 0.7, 0.5);
  ctx.fillStyle = '#7d7d76';
  ctx.fill();
}

/** Sasso lunare grigio, fatto di due blocchi. */
export function drawMoonRockProp(it?: GameValue): GameValue {
  box(it.x, it.y, it.w, it.h, it.z * 0.6, '#9a9a93');
  box(it.x - it.w * 0.15, it.y + it.h * 0.1, it.w * 0.6, it.h * 0.6, it.z * 0.4, '#a8a8a0', {
    z0: it.z * 0.6,
  });
}

/** Bandiera della missione piantata nel suolo lunare. */
export function drawMoonFlagProp(it?: GameValue): GameValue {
  const ctx = game.view.ctx;
  box(it.x, it.y, 2.5, 2.5, it.z, '#dfe6e9');
  const a = isoProject(it.x, it.y, it.z - 2),
    b = isoProject(it.x + 34, it.y, it.z - 2),
    c = isoProject(it.x + 34, it.y, it.z - 24),
    d = isoProject(it.x, it.y, it.z - 24);
  ctx.fillStyle = '#ffffff';
  ctx.beginPath();
  ctx.moveTo(a.x, a.y);
  ctx.lineTo(b.x, b.y);
  ctx.lineTo(c.x, c.y);
  ctx.lineTo(d.x, d.y);
  ctx.closePath();
  ctx.fill();
  ctx.strokeStyle = '#b2bec3';
  ctx.stroke();
  // razzo rosso e scritta della missione
  const m = isoProject(it.x + 17, it.y, it.z - 13);
  ctx.fillStyle = '#e74c3c';
  ctx.font = `bold ${Math.round(7 * isoScale())}px sans-serif`;
  ctx.textAlign = 'center';
  ctx.fillText('CDC-1', m.x, m.y + 2 * isoScale());
}

/** Cartellone luminoso con il conto alla rovescia sopra la rampa. */
function drawCountdownSign(it: GameValue, text: string, last: boolean): void {
  const ctx = game.view.ctx;
  const s: number = isoScale();
  const p = isoProject(it.x + 75, it.y - 45, 110);
  const w = 74 * s,
    h = 26 * s;
  ctx.fillStyle = 'rgba(10,15,30,0.9)';
  ctx.strokeStyle = last ? '#ff4757' : '#feca57';
  ctx.lineWidth = 2 * s;
  ctx.beginPath();
  ctx.roundRect
    ? ctx.roundRect(p.x - w / 2, p.y - h / 2, w, h, 5 * s)
    : ctx.rect(p.x - w / 2, p.y - h / 2, w, h);
  ctx.fill();
  ctx.stroke();
  ctx.fillStyle = last ? '#ff4757' : '#feca57';
  ctx.font = `bold ${Math.round(15 * s)}px monospace`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText('T-' + text, p.x, p.y + 1 * s);
  ctx.textBaseline = 'alphabetic';
}

/** Nuvole di fumo che si allargano dalla rampa durante il lancio. */
function drawLaunchSmoke(it: GameValue, since: number): void {
  const ctx = game.view.ctx;
  const s: number = isoScale();
  const k = Math.min(1, since / 3000);
  const fade = since > 15000 ? Math.max(0, 1 - (since - 15000) / 10000) : 1;
  for (let i = 0; i < 14; i++) {
    const a = i * 2.4;
    const r = (30 + (i % 4) * 22) * k + 10;
    const p = isoProject(it.x + Math.cos(a) * r, it.y + Math.sin(a) * r, 8 + (i % 3) * 8);
    const grey = 200 + (i % 3) * 18;
    ctx.fillStyle = `rgba(${grey},${grey},${grey},${0.75 * fade})`;
    ctx.beginPath();
    ctx.arc(p.x, p.y, (14 + (i % 5) * 5) * s * (0.5 + k), 0, 6.3);
    ctx.fill();
  }
}

/** Razzo sulla rampa. stage: 0 = solo la rampa, 1 = pezzi in costruzione, 2 = razzo completo. */
export function drawRocketProp(it?: GameValue, t?: GameValue): GameValue {
  const ctx = game.view.ctx;
  const s: number = isoScale();
  const { x, y } = it;
  const stage: number = it.stage ?? 2;
  const lift: number = it.lift || 0;
  // rampa di lancio con bordo a strisce
  const pad: GameValue = box(x, y, it.w, it.h, 10, it.moonPad ? '#7f8c8d' : '#8d99ae');
  onFace(pad, 'top', (W: number, H: number): void => {
    ctx.fillStyle = '#5c6370';
    ctx.fillRect(6, 6, W - 12, H - 12);
    ctx.strokeStyle = '#f1c40f';
    ctx.lineWidth = 3;
    ctx.setLineDash([6, 6]);
    ctx.strokeRect(4, 4, W - 8, H - 8);
    ctx.setLineDash([]);
    ctx.strokeStyle = 'rgba(255,255,255,0.5)';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.arc(W / 2, H / 2, 22, 0, 6.3);
    ctx.stroke();
    if (stage === 0) {
      ctx.fillStyle = 'rgba(255,255,255,0.75)';
      ctx.font = 'bold 9px sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText('CDC-1', W / 2, H / 2 + 3);
    }
  });
  if (stage === 0) {
    // ancora niente razzo: solo casse di materiale in attesa
    box(x + 30, y + 30, 18, 18, 14, '#b9884f', { z0: 10 });
    box(x + 30, y + 30, 14, 14, 12, '#a87b45', { z0: 24 });
    return;
  }
  if (!it.noTower) {
    // torre di servizio a traliccio, dietro al razzo (a metà durante i lavori)
    const tx = x - 30,
      ty = y - 30,
      tw = 9,
      tz = stage === 1 ? 130 : 250;
    const corners = [
      [-tw, -tw],
      [tw, -tw],
      [tw, tw],
      [-tw, tw],
    ];
    for (const [cx, cy] of corners) box(tx + cx, ty + cy, 2.5, 2.5, tz, '#c0392b', { z0: 10 });
    ctx.strokeStyle = '#a93226';
    ctx.lineWidth = Math.max(1, 1.2 * s);
    for (let z = 10; z < tz; z += 24)
      for (let i = 0; i < 4; i++) {
        const [ax, ay] = corners[i],
          [bx, by] = corners[(i + 1) % 4];
        const p1 = isoProject(tx + ax, ty + ay, z),
          p2 = isoProject(tx + bx, ty + by, z + 24),
          p3 = isoProject(tx + bx, ty + by, z);
        ctx.beginPath();
        ctx.moveTo(p1.x, p1.y);
        ctx.lineTo(p2.x, p2.y);
        ctx.moveTo(p1.x, p1.y);
        ctx.lineTo(p3.x, p3.y);
        ctx.stroke();
      }
  }
  // braccio che tiene il razzo (si stacca al lancio)
  if (stage >= 2 && !lift && it.flame === undefined && !it.gone && !it.noTower)
    box(x - 15, y - 15, 26, 4, 4, '#7f8c8d', { z0: 190 });
  if (it.gone) {
    // il razzo è partito: sulla rampa restano le bruciature e la scritta della missione
    const ctx2 = game.view.ctx;
    const c = isoProject(x, y, 10);
    ctx2.fillStyle = 'rgba(30,30,30,0.45)';
    ctx2.beginPath();
    ctx2.ellipse(c.x, c.y, 26 * s, 13 * s, 0, 0, 6.3);
    ctx2.fill();
    return;
  }
  // razzo: corpo cilindrico, ogiva, finestrino e alette (disegnati a schermo sull'asse verticale)
  const P = (z: number) => isoProject(x, y, z + lift);
  const cx = P(0).x,
    R = 17 * s;
  const yB = P(26).y,
    yT = P(stage === 1 ? 100 : 200).y,
    yTip = P(285).y;
  const shade = (c1: string, c2: string) => {
    const g = ctx.createLinearGradient(cx - R, 0, cx + R, 0);
    g.addColorStop(0, game.darken(c1, 0.35));
    g.addColorStop(0.35, c2);
    g.addColorStop(0.6, c1);
    g.addColorStop(1, game.darken(c1, 0.45));
    return g;
  };
  // fiamma dei motori durante il lancio
  if (it.flame !== undefined) {
    const k = Math.min(1, it.flame / 1500);
    const len = (30 + 50 * k + Math.sin(it.flame / 40) * 6) * s;
    const top = P(11).y;
    const fg = ctx.createLinearGradient(0, top, 0, top + len);
    fg.addColorStop(0, 'rgba(255,255,220,0.95)');
    fg.addColorStop(0.3, 'rgba(255,190,60,0.9)');
    fg.addColorStop(1, 'rgba(255,80,20,0)');
    ctx.fillStyle = fg;
    ctx.beginPath();
    ctx.moveTo(cx - R * 0.75, top);
    ctx.quadraticCurveTo(cx, top + len * 1.4, cx + R * 0.75, top);
    ctx.closePath();
    ctx.fill();
  }
  // ugello
  ctx.fillStyle = shade('#57606f', '#a4b0be');
  ctx.beginPath();
  ctx.moveTo(cx - R * 0.55, yB);
  ctx.lineTo(cx + R * 0.55, yB);
  ctx.lineTo(cx + R * 0.75, P(11).y);
  ctx.lineTo(cx - R * 0.75, P(11).y);
  ctx.fill();
  // vapore che esce piano dalla base (solo a razzo finito)
  for (let i = 0; i < (stage >= 2 ? 5 : 0); i++) {
    const k = ((t || 0) * 0.35 + i / 5) % 1;
    const p = isoProject(x + (i - 2) * 14 * k, y + 20 * k, 12 + 10 * k);
    ctx.fillStyle = `rgba(235,235,235,${0.45 * (1 - k)})`;
    ctx.beginPath();
    ctx.arc(p.x, p.y, (6 + 14 * k) * s, 0, 6.3);
    ctx.fill();
  }
  // corpo
  ctx.fillStyle = shade('#dfe4ea', '#ffffff');
  ctx.fillRect(cx - R, yT, R * 2, yB - yT);
  ctx.beginPath();
  ctx.ellipse(cx, yB, R, R * 0.45, 0, 0, Math.PI);
  ctx.fill();
  // fasce rosse
  ctx.fillStyle = shade('#e74c3c', '#ff7675');
  for (const [z0, z1] of stage === 1
    ? [[44, 58]]
    : [
        [44, 58],
        [150, 158],
      ])
    ctx.fillRect(cx - R, P(z1).y, R * 2, P(z0).y - P(z1).y);
  if (stage === 1) {
    drawRocketWorks(it, P, cx, R, yT, shade);
    return;
  }
  // scritta verticale
  ctx.save();
  ctx.translate(cx + R * 0.15, P(110).y);
  ctx.rotate(-Math.PI / 2);
  ctx.fillStyle = '#2d3436';
  ctx.font = `bold ${Math.round(8 * s)}px sans-serif`;
  ctx.textAlign = 'center';
  ctx.fillText('CDC-1', 0, 0);
  ctx.restore();
  // finestrino
  const wy = P(172).y;
  ctx.fillStyle = '#b2bec3';
  ctx.beginPath();
  ctx.arc(cx, wy, 8 * s, 0, 6.3);
  ctx.fill();
  const gl = ctx.createRadialGradient(cx - 2 * s, wy - 2 * s, 1, cx, wy, 6 * s);
  gl.addColorStop(0, '#a6e1ff');
  gl.addColorStop(1, '#0a5fa8');
  ctx.fillStyle = gl;
  ctx.beginPath();
  ctx.arc(cx, wy, 6 * s, 0, 6.3);
  ctx.fill();
  // ogiva
  ctx.fillStyle = shade('#e74c3c', '#ff7675');
  ctx.beginPath();
  ctx.moveTo(cx - R, yT);
  ctx.quadraticCurveTo(cx - R, (yT + yTip) / 2 + 6 * s, cx, yTip);
  ctx.quadraticCurveTo(cx + R, (yT + yTip) / 2 + 6 * s, cx + R, yT);
  ctx.closePath();
  ctx.fill();
  // alette ai lati e davanti
  ctx.fillStyle = '#c0392b';
  for (const dir of [-1, 1]) {
    ctx.beginPath();
    ctx.moveTo(cx + dir * R, P(80).y);
    ctx.lineTo(cx + dir * (R + 16 * s), P(36).y);
    ctx.lineTo(cx + dir * (R + 16 * s), P(10).y);
    ctx.lineTo(cx + dir * R, P(32).y);
    ctx.fill();
  }
  // aletta davanti: sporge solo sotto il corpo
  ctx.fillStyle = '#a93226';
  ctx.fillRect(cx - 2 * s, yB - 4 * s, 4 * s, P(6).y - yB + 4 * s);
}

/** Razzo in costruzione: bordo aperto in cima, impalcatura, alette e ogiva ancora a terra. */
function drawRocketWorks(
  it: GameValue,
  P: (z: number) => { x: number; y: number },
  cx: number,
  R: number,
  yT: number,
  shade: (c1: string, c2: string) => GameValue,
): void {
  const ctx = game.view.ctx;
  const s: number = isoScale();
  // bordo aperto del tronco di razzo
  ctx.fillStyle = '#57606f';
  ctx.beginPath();
  ctx.ellipse(cx, yT, R, R * 0.45, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = '#2f3542';
  ctx.beginPath();
  ctx.ellipse(cx, yT, R * 0.8, R * 0.34, 0, 0, Math.PI * 2);
  ctx.fill();
  // alette già montate
  ctx.fillStyle = '#c0392b';
  for (const dir of [-1, 1]) {
    ctx.beginPath();
    ctx.moveTo(cx + dir * R, P(80).y);
    ctx.lineTo(cx + dir * (R + 16 * s), P(36).y);
    ctx.lineTo(cx + dir * (R + 16 * s), P(10).y);
    ctx.lineTo(cx + dir * R, P(32).y);
    ctx.fill();
  }
  // impalcatura gialla attorno al razzo
  ctx.strokeStyle = '#f1c40f';
  ctx.lineWidth = Math.max(1, 1.6 * s);
  const left = cx - R - 7 * s,
    right = cx + R + 7 * s;
  ctx.beginPath();
  for (const xx of [left, right]) {
    ctx.moveTo(xx, P(10).y);
    ctx.lineTo(xx, P(120).y);
  }
  for (let z = 30; z <= 120; z += 30) {
    ctx.moveTo(left, P(z).y);
    ctx.lineTo(right, P(z).y);
  }
  ctx.moveTo(left, P(30).y);
  ctx.lineTo(right, P(60).y);
  ctx.moveTo(right, P(60).y);
  ctx.lineTo(left, P(90).y);
  ctx.stroke();
  // ogiva appoggiata a terra, in attesa di essere montata
  const nx = it.x + 34,
    ny = it.y + 30;
  const base = isoProject(nx - 14, ny, 12),
    tip = isoProject(nx + 22, ny, 12);
  ctx.fillStyle = shade('#e74c3c', '#ff7675');
  ctx.beginPath();
  ctx.moveTo(base.x, base.y - 12 * s);
  ctx.quadraticCurveTo(tip.x - 6 * s, base.y - 12 * s, tip.x, tip.y);
  ctx.quadraticCurveTo(tip.x - 6 * s, base.y + 12 * s, base.x, base.y + 12 * s);
  ctx.closePath();
  ctx.fill();
  ctx.fillStyle = '#b2bec3';
  ctx.beginPath();
  ctx.ellipse(base.x, base.y, 4 * s, 12 * s, 0, 0, Math.PI * 2);
  ctx.fill();
  // cassa con i pezzi
  box(it.x - 34, it.y + 34, 18, 18, 14, '#b9884f', { z0: 10 });
}

// ---------------------------------------------------------------- LABORATORIO INGEGNERISTICO
// apertura della porta verso la zona esterna (0 = chiusa, 1 = aperta) e ultimo istante disegnato

// ---------------------------------------------------------------- MURO DI FONDO DEL LABORATORIO
let labCut = 0;
let labCutT = 0;

/**
 * Quanto è abbassato il muro tra laboratorio e zona esterna (0 alto, 1 abbassato): si abbassa
 * quando si esce, come in una casa delle bambole, così non copre il piazzale e chi ci sta.
 */
function labWallCut(t: number): number {
  if (t !== labCutT) {
    const dt = Math.min(0.1, Math.max(0, t - labCutT));
    labCutT = t;
    const out = game.playerPos.y < LAB_WALL_Y ? 1 : 0;
    labCut += (out - labCut) * Math.min(1, dt * 5);
  }
  return labCut * labCut * (3 - 2 * labCut);
}

/** Altezza del muro adesso: piena dentro il laboratorio, uno zoccolo basso da fuori. */
const labWallHeight = (t: number): number => {
  const full: number = game.ENV_STYLE.ingegneria.lab.wallH;
  return full - labWallCut(t) * (full - 24);
};

// La faccia del muro (intonaco, battiscopa, cartello) si dipinge una volta sola su una tela
// e ogni pezzo ne mostra la sua striscia.
const TEX_K = 2;
let labWallTex: HTMLCanvasElement | null = null;
function labWallTexture(): HTMLCanvasElement {
  if (labWallTex) return labWallTex;
  const lab: GameValue = game.ENV_STYLE.ingegneria.lab;
  const W = 400,
    H: number = lab.wallH;
  const c = document.createElement('canvas');
  c.width = W * TEX_K;
  c.height = H * TEX_K;
  const prev = game.view.ctx;
  const tctx = c.getContext('2d')!;
  tctx.scale(TEX_K, TEX_K);
  game.view.ctx = tctx;
  try {
    paintWallSurface(lab, W, H, 'back');
    for (const d of lab.decor?.back || []) game.WALL_DECOR[d.t]?.(d, { hour: 12, wallH: H });
  } finally {
    game.view.ctx = prev;
  }
  labWallTex = c;
  return c;
}

/**
 * Faccia del muro tra u e u+W, alta FH dalla cima del muro (alto wallH adesso): abbassato,
 * il muro mostra la sua parte bassa, con il battiscopa.
 */
function paintLabWallStrip(u: number, W: number, FH: number, wallH: number): void {
  const full: number = game.ENV_STYLE.ingegneria.lab.wallH;
  const tex = labWallTexture();
  game.view.ctx.drawImage(
    tex,
    u * TEX_K,
    (full - wallH) * TEX_K,
    W * TEX_K,
    FH * TEX_K,
    0,
    0,
    W,
    FH,
  );
}

/** Un pezzo del muro di fondo del laboratorio (vedi labWall nei cataloghi). */
export function drawLabWall(p?: GameValue, t?: GameValue): GameValue {
  const lab: GameValue = game.ENV_STYLE.ingegneria.lab;
  const b: GameValue = box(p.x, p.y, p.w, p.h, labWallHeight(t || 0), lab.wall, {
    top: game.darken(lab.wall, 0.45),
    edge: 'rgba(0,0,0,0)',
  });
  onFace(b, 'left', (W: number, FH: number): void => paintLabWallStrip(p.u, W, FH, FH));
}

/**
 * Porta tra il laboratorio e la zona esterna, nel varco del muro di fondo: telaio, muro sopra la
 * porta e anta che ruota sui cardini quando qualcuno si avvicina, da dentro o da fuori.
 */
export function drawLabDoor(it?: GameValue, t?: GameValue): GameValue {
  const ctx = game.view.ctx;
  const now: number = t || 0;
  const open = doorOpenAmount('lab:door', it.x, it.y, true, true);
  const lab: GameValue = game.ENV_STYLE.ingegneria.lab;
  const wallH = labWallHeight(now);
  const x0 = it.x - it.w / 2,
    x1 = it.x + it.w / 2,
    wy = it.y - it.h / 2 - 2, // filo della parete
    H = Math.min(it.z, wallH - 8);
  // muro sopra la porta (il varco è largo quanto due pezzi e mezzo)
  if (wallH > H + 8) {
    const gap = 60;
    const top: GameValue = box(it.x, LAB_WALL_Y, gap, 10, wallH - H - 8, lab.wall, {
      z0: H + 8,
      top: game.darken(lab.wall, 0.45),
      edge: 'rgba(0,0,0,0)',
    });
    onFace(top, 'left', (W: number, FH: number): void =>
      paintLabWallStrip(it.x - gap / 2 + 200, W, FH, wallH),
    );
  }
  // telaio
  box(x0 - 3, wy + 2, 6, 6, H + 6, '#2d3436');
  box(x1 + 3, wy + 2, 6, 6, H + 6, '#2d3436');
  box(it.x, wy + 2, it.w + 12, 6, 8, '#2d3436', { z0: H });
  // anta: ruota sul cardine di sinistra verso l'interno del laboratorio
  SERVICE_DOOR.draw(
    { hinge: [x0, wy + 4, H], along: [1, 0], normal: [0, 1], w: it.w, h: H },
    { color: '#0984e3' },
    open,
  );
  // cartello sopra la porta (si vede con il muro alzato)
  if (wallH > 100) {
    const s = isoScale();
    const sign = isoProject(it.x, wy + 6, H + 16);
    ctx.fillStyle = '#2ed573';
    ctx.fillRect(sign.x - 22 * s, sign.y - 6 * s, 44 * s, 12 * s);
    ctx.fillStyle = '#ffffff';
    ctx.font = `bold ${Math.round(7 * s)}px sans-serif`;
    ctx.textAlign = 'center';
    ctx.fillText('🚀 ESTERNO', sign.x, sign.y + 2.5 * s);
  }
}

/** Bacheca dei progetti: pannello di sughero con i fogli appesi; il primo è il razzo. */
export function drawProjectBoard(it?: GameValue): GameValue {
  const ctx = game.view.ctx;
  const { x, y, w, z } = it;
  box(x - w / 2 + 6, y, 5, 5, z - 70, '#636e72');
  box(x + w / 2 - 6, y, 5, 5, z - 70, '#636e72');
  const b: GameValue = box(x, y, w, 6, 72, '#8d6e63', { z0: z - 72 });
  onFace(b, 'left', (W: number, H: number): void => {
    ctx.fillStyle = '#c69c6d';
    ctx.fillRect(3, 3, W - 6, H - 6);
    // puntini del sughero
    ctx.fillStyle = 'rgba(90,60,30,0.25)';
    for (let i = 0; i < 70; i++)
      ctx.fillRect(4 + rnd(i) * (W - 8), 4 + rnd(i + 50) * (H - 8), 1, 1);
    ctx.fillStyle = '#2d3436';
    ctx.font = 'bold 7px sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('PROGETTI', W / 2, 11);
    // foglio del razzo: disegno tecnico blu
    const sheet = (sx: number, color: string, draw: () => void) => {
      ctx.fillStyle = 'rgba(0,0,0,0.2)';
      ctx.fillRect(sx + 1.5, 17.5, 30, 46);
      ctx.fillStyle = color;
      ctx.fillRect(sx, 16, 30, 46);
      draw();
      ctx.fillStyle = '#e74c3c';
      ctx.beginPath();
      ctx.arc(sx + 15, 18, 2, 0, 6.3);
      ctx.fill();
    };
    sheet(8, '#0b3d91', () => {
      ctx.strokeStyle = '#ffffff';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(23, 22);
      ctx.quadraticCurveTo(28, 28, 28, 34);
      ctx.lineTo(28, 52);
      ctx.lineTo(18, 52);
      ctx.lineTo(18, 34);
      ctx.quadraticCurveTo(18, 28, 23, 22);
      ctx.moveTo(18, 46);
      ctx.lineTo(14, 56);
      ctx.lineTo(18, 54);
      ctx.moveTo(28, 46);
      ctx.lineTo(32, 56);
      ctx.lineTo(28, 54);
      ctx.stroke();
      ctx.beginPath();
      ctx.arc(23, 38, 2.5, 0, 6.3);
      ctx.stroke();
      // avanzamento del razzo
      const k = (game.rocketStage || 0) / 2;
      ctx.fillStyle = 'rgba(255,255,255,0.3)';
      ctx.fillRect(11, 57, 24, 3);
      ctx.fillStyle = '#2ed573';
      ctx.fillRect(11, 57, 24 * k, 3);
    });
    for (const sx of [W / 2 - 15, W - 38])
      sheet(sx, '#f5f6fa', () => {
        ctx.fillStyle = '#b2bec3';
        for (let l = 0; l < 5; l++) ctx.fillRect(sx + 4, 26 + l * 5, 22 - (l % 2) * 6, 1.5);
        ctx.fillStyle = '#636e72';
        ctx.font = 'bold 6px sans-serif';
        ctx.fillText('🔒', sx + 15, 52);
        ctx.fillText('presto', sx + 15, 58);
      });
  });
}

/** Bancone da lavoro con morsa, attrezzi e pezzi del razzo. */
export function drawWorkbench(it?: GameValue, t?: GameValue): GameValue {
  const ctx = game.view.ctx;
  const { x, y, w, h, z } = it;
  for (const [dx, dy] of [
    [-1, -1],
    [1, -1],
    [-1, 1],
    [1, 1],
  ])
    box(x + dx * (w / 2 - 5), y + dy * (h / 2 - 5), 5, 5, z - 6, '#57606f');
  // ripiano basso con una cassetta degli attrezzi
  box(x, y, w - 8, h - 8, 3, '#7f8c8d', { z0: 10 });
  box(x, y + 20, 20, 30, 12, '#c0392b', { z0: 13 });
  const top: GameValue = box(x, y, w, h, 6, '#a1887f', { z0: z - 6 });
  onFace(top, 'top', (W: number, H: number): void => {
    woodGrain(W, H, 'rgba(60,40,20,0.25)', false, 5);
    // progetto arrotolato aperto sul bancone
    ctx.fillStyle = '#0b3d91';
    ctx.fillRect(8, 10, W - 16, 30);
    ctx.strokeStyle = 'rgba(255,255,255,0.7)';
    ctx.lineWidth = 0.8;
    ctx.strokeRect(11, 13, W - 22, 24);
    ctx.beginPath();
    ctx.arc(W / 2, 25, 6, 0, 6.3);
    ctx.stroke();
    // ingranaggio
    ctx.fillStyle = '#95a5a6';
    ctx.beginPath();
    for (let i = 0; i < 16; i++) {
      const a = (i / 16) * Math.PI * 2 + (t || 0) * 0.2;
      const r = i % 2 ? 6 : 8;
      ctx.lineTo(W / 2 + Math.cos(a) * r, H * 0.62 + Math.sin(a) * r);
    }
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = '#a1887f';
    ctx.beginPath();
    ctx.arc(W / 2, H * 0.62, 2.5, 0, 6.3);
    ctx.fill();
    // chiave inglese
    ctx.strokeStyle = '#636e72';
    ctx.lineWidth = 2.5;
    ctx.beginPath();
    ctx.moveTo(10, H - 14);
    ctx.lineTo(W - 14, H - 26);
    ctx.stroke();
  });
  // morsa sul bordo davanti
  box(x + w / 2 - 10, y - h / 2 + 18, 12, 14, 8, '#2d3436', { z0: z });
  box(x + w / 2 - 10, y - h / 2 + 18, 4, 18, 4, '#636e72', { z0: z + 8 });
  // aletta del razzo appena tagliata
  box(x - 6, y + h / 2 - 22, 16, 3, 12, '#e74c3c', { z0: z });
}

/** Cartello accanto al razzo. */
export function drawMoonSignProp(it?: GameValue): GameValue {
  const ctx = game.view.ctx;
  box(it.x - it.w / 2 + 6, it.y, 4, 4, 34, '#6d4c41');
  box(it.x + it.w / 2 - 6, it.y, 4, 4, 34, '#6d4c41');
  const b: GameValue = box(it.x, it.y, it.w, 4, 26, '#1e2a4a', { z0: 30 });
  onFace(b, 'left', (W: number, H: number): void => {
    const g = ctx.createLinearGradient(0, 0, 0, H);
    g.addColorStop(0, '#16213e');
    g.addColorStop(1, '#2c3e7a');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, W, H);
    ctx.fillStyle = 'rgba(255,255,255,0.8)';
    for (let i = 0; i < 12; i++) ctx.fillRect(rnd(i + 40) * W, rnd(i + 90) * H, 1, 1);
    ctx.strokeStyle = '#f1c40f';
    ctx.lineWidth = 1.5;
    ctx.strokeRect(1.5, 1.5, W - 3, H - 3);
    ctx.fillStyle = '#ffffff';
    ctx.font = 'bold 9px sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('TO THE MOON', W / 2 - 6, H / 2 + 3);
    // spicchio di luna
    ctx.fillStyle = '#f5f3ce';
    ctx.beginPath();
    ctx.arc(W - 9, H / 2, 4, 0, 6.3);
    ctx.fill();
    ctx.fillStyle = '#16213e';
    ctx.beginPath();
    ctx.arc(W - 7.5, H / 2 - 1.5, 3.4, 0, 6.3);
    ctx.fill();
  });
}
