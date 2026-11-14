// Centro di criogenesi: le capsule con dentro i vicini in criogenesi (dietro il vetro brinato,
// con la luce azzurra, il display della temperatura e il nome), la tua capsula, i serbatoi d'azoto liquido, la
// console di controllo, l'accettazione con la tecnica in camice, il totem delle istruzioni e, sui
// muri, le tubazioni del freddo, l'insegna e i monitor con i parametri vitali.
import { game } from '../context.js';
import { isoProject, isoScale } from './primitives.js';
import { box, onFace } from './objects.js';
import { drawPlayerAvatar } from './avatars.js';
import { parseBody, parseLook, resolveLook } from '../character.js';
import { cryoActive } from '../../../shared/cryo-rules.js';
import { myCryo } from '../cryo.js';
import { cryoSleepers } from '../autoplay.js';
import { CRYO_PODS } from '../data/catalogues.js';

/** Un oggetto della scena: posizione, ingombro e altezza, più i campi delle capsule. */
interface CryoItem {
  x: number;
  y: number;
  w: number;
  h: number;
  z: number;
  /** capsula: il lato con il vetro ('back' = sul muro di fondo, 'left' = sul muro di sinistra) */
  face?: 'back' | 'left';
  /** capsula: il suo posto in CRYO_PODS (chi ci dorme è il vicino con lo stesso indice) */
  sleeper?: number;
}

const STEEL = '#8a99a6';
const STEEL_DARK = '#4b5a66';
const CYAN = '#38c6ff';

const ctx = (): CanvasRenderingContext2D => game.view.ctx as CanvasRenderingContext2D;

// ---------------------------------------------------------------- chi dorme nelle capsule
// Sono i vicini veri in criogenesi (autoplay.ts, cryoSleepers): uno per capsula, con i loro
// vestiti e il loro nome. Le capsule senza nessuno sono libere.

const sleeperLooks = new Map<string, ReturnType<typeof resolveLook>>();

/** L'aspetto di un vicino dalla sua presenza (vestiti e corpo), ricordato finché non cambia. */
function sleeperLook(look: string, body: string): ReturnType<typeof resolveLook> {
  const key = look + '|' + body;
  let l = sleeperLooks.get(key);
  if (!l) {
    l = resolveLook(look ? parseLook(look) : {});
    const b = parseBody(body);
    if (b) l.body = b;
    sleeperLooks.set(key, l);
  }
  return l;
}

// ---------------------------------------------------------------- la capsula

/** Il pannello del display sul basamento: temperatura (o LIBERA) e la lucina di stato. */
function podDisplay(
  b: ReturnType<typeof box>,
  face: 'left' | 'right',
  text: string,
  on: boolean,
  t: number,
): void {
  const c = ctx();
  onFace(b, face, (W: number, H: number): void => {
    c.fillStyle = '#16232d';
    c.fillRect(W * 0.18, H * 0.2, W * 0.64, H * 0.55);
    c.fillStyle = on ? CYAN : '#9be7a1';
    c.font = 'bold 5px monospace';
    c.textAlign = 'center';
    c.fillText(text, W / 2, H * 0.6);
    // la lucina che pulsa piano
    c.fillStyle = on ? `rgba(56,198,255,${0.5 + 0.5 * Math.sin(t * 2)})` : '#2ecc71';
    c.beginPath();
    c.arc(W * 0.86, H * 0.45, 1.4, 0, 6.3);
    c.fill();
  });
}

/**
 * Una capsula in piedi: basamento d'acciaio, schienale contro il muro, la persona ibernata (o
 * nessuno), il vetro azzurro brinato davanti e sopra, il tetto con la striscia di luce.
 */
function drawPod(
  it: CryoItem,
  t: number,
  who: ReturnType<typeof resolveLook> | null,
  label: string,
  empty = 'LIBERA',
  name = '',
): void {
  const c = ctx();
  const s = isoScale();
  const back = it.face !== 'left';
  const baseZ = 14;
  const capZ = 14;
  const glassZ = it.z - baseZ - capZ;
  // il basamento con il display sul davanti
  const base = box(it.x, it.y, it.w, it.h, baseZ, STEEL, { top: '#a9b6c1' });
  podDisplay(base, back ? 'left' : 'right', who ? '−196°C' : empty, !!who, t);
  // lo schienale contro il muro, con i tubi che entrano
  if (back) box(it.x, it.y - it.h / 2 + 4, it.w, 8, glassZ, STEEL_DARK, { z0: baseZ });
  else box(it.x - it.w / 2 + 4, it.y, 8, it.h, glassZ, STEEL_DARK, { z0: baseZ });
  // dentro: chi dorme, un po' sollevato dal basamento
  if (who) {
    c.save();
    c.translate(0, -(baseZ - 2) * s);
    drawPlayerAvatar(it.x, it.y + (back ? 4 : 0), '', 0, who, false, '', { noShadow: true });
    c.restore();
  }
  // il bagliore azzurro dentro la capsula
  const mid = isoProject(it.x, it.y, baseZ + glassZ / 2);
  const glow = c.createRadialGradient(mid.x, mid.y, 2 * s, mid.x, mid.y, 40 * s);
  glow.addColorStop(0, who ? 'rgba(120,210,255,0.35)' : 'rgba(150,230,200,0.18)');
  glow.addColorStop(1, 'rgba(120,210,255,0)');
  c.fillStyle = glow;
  c.fillRect(mid.x - 40 * s, mid.y - 40 * s, 80 * s, 80 * s);
  // il vetro, azzurro e un po' brinato
  const glass = box(it.x, it.y, it.w - 4, it.h - 4, glassZ, 'rgba(190,230,255,0.28)', {
    z0: baseZ,
    left: 'rgba(200,236,255,0.30)',
    right: 'rgba(170,215,245,0.34)',
    top: 'rgba(225,245,255,0.35)',
    edge: 'rgba(255,255,255,0.7)',
  });
  // la brina in basso sul vetro e un riflesso lungo
  onFace(glass, back ? 'left' : 'right', (W: number, H: number): void => {
    const g = c.createLinearGradient(0, H, 0, H * 0.55);
    g.addColorStop(0, 'rgba(255,255,255,0.75)');
    g.addColorStop(1, 'rgba(255,255,255,0)');
    c.fillStyle = g;
    c.fillRect(0, H * 0.55, W, H * 0.45);
    c.strokeStyle = 'rgba(255,255,255,0.55)';
    c.lineWidth = 1.2;
    c.beginPath();
    c.moveTo(W * 0.22, H * 0.08);
    c.lineTo(W * 0.12, H * 0.5);
    c.stroke();
    // i bordi della porta e la maniglia
    c.strokeStyle = 'rgba(80,110,130,0.6)';
    c.lineWidth = 0.8;
    c.strokeRect(1.5, 1.5, W - 3, H - 3);
    c.fillStyle = '#5d6d7e';
    c.fillRect(W - 5, H * 0.45, 1.6, 8);
  });
  // il tetto d'acciaio con la striscia di luce
  const cap = box(it.x, it.y, it.w, it.h, capZ, STEEL, { z0: baseZ + glassZ, top: '#b4c2cd' });
  onFace(cap, back ? 'left' : 'right', (W: number, H: number): void => {
    c.fillStyle = who ? CYAN : '#7ee2a8';
    c.globalAlpha = 0.75 + 0.25 * Math.sin(t * 1.5 + it.x * 0.05);
    c.fillRect(3, H * 0.4, W - 6, 2.4);
    c.globalAlpha = 1;
    c.fillStyle = '#1e2a33';
    c.font = 'bold 4px sans-serif';
    c.textAlign = 'center';
    if (label) c.fillText(label, W / 2, H * 0.32);
  });
  if (name) {
    const p = isoProject(it.x, it.y, it.z + 6);
    c.font = `bold ${7 * s}px sans-serif`;
    c.textAlign = 'center';
    const w = c.measureText('🧊 ' + name).width + 8 * s;
    c.fillStyle = 'rgba(15,30,45,0.78)';
    c.fillRect(p.x - w / 2, p.y - 10 * s, w, 12 * s);
    c.fillStyle = '#bfe6ff';
    c.fillText('🧊 ' + name, p.x, p.y - 1.5 * s);
  }
}

/** Una capsula dei vicini (ENV_PROPS): dentro chi è in criogenesi, se no è libera. */
export function drawCryoPod(it: CryoItem, t: number): void {
  const who = cryoSleepers()[it.sleeper || 0];
  drawPod(
    it,
    t || 0,
    who ? sleeperLook(who.look, who.body) : null,
    '',
    'LIBERA',
    who ? who.name : '',
  );
}

/**
 * La tua capsula: vuota, perché stai giocando. Con la criogenesi attiva è PRONTA: quando esci
 * dal gioco ci entri tu (e gli altri ti vedono dentro una capsula dei vicini).
 */
export function drawMyPod(it: CryoItem, t: number): void {
  const ready = cryoActive(myCryo(), Date.now());
  drawPod(it, t || 0, null, 'TUA', ready ? 'PRONTA' : 'LIBERA');
}

// ---------------------------------------------------------------- serbatoi e azoto

/** Serbatoio d'azoto liquido: cilindro bianco con la fascia azzurra, il manometro e la valvola. */
export function drawNitrogenTank(it: CryoItem, t: number): void {
  const c = ctx();
  const s = isoScale();
  const r = it.w / 2;
  const top = isoProject(it.x, it.y, it.z);
  const bottom = isoProject(it.x, it.y, 0);
  const rx = r * s * 1.05,
    ry = r * s * 0.55;
  // l'ombra a terra
  c.fillStyle = 'rgba(0,0,0,0.18)';
  c.beginPath();
  c.ellipse(bottom.x, bottom.y + 2 * s, rx * 1.1, ry * 1.1, 0, 0, 6.3);
  c.fill();
  // il corpo, con la luce da sinistra
  const g = c.createLinearGradient(bottom.x - rx, 0, bottom.x + rx, 0);
  g.addColorStop(0, '#f5f8fa');
  g.addColorStop(0.45, '#e2e8ed');
  g.addColorStop(1, '#9fadb8');
  c.fillStyle = g;
  c.beginPath();
  c.ellipse(bottom.x, bottom.y, rx, ry, 0, 0, Math.PI);
  c.lineTo(top.x - rx, top.y);
  c.ellipse(top.x, top.y, rx, ry, 0, Math.PI, 0, true);
  c.closePath();
  c.fill();
  c.strokeStyle = 'rgba(0,0,0,0.25)';
  c.stroke();
  // la fascia azzurra con la scritta
  const band = isoProject(it.x, it.y, it.z * 0.55);
  c.fillStyle = '#2b6f9e';
  c.beginPath();
  c.ellipse(band.x, band.y + 6 * s, rx, ry, 0, 0, Math.PI);
  c.lineTo(band.x - rx, band.y - 6 * s);
  c.ellipse(band.x, band.y - 6 * s, rx, ry, 0, Math.PI, 0, true);
  c.closePath();
  c.fill();
  c.fillStyle = '#ffffff';
  c.font = `bold ${5.5 * s}px sans-serif`;
  c.textAlign = 'center';
  c.fillText('LN₂', band.x - rx * 0.25, band.y + 3 * s);
  // il cartello giallo del pericolo
  const warn = isoProject(it.x, it.y + r, it.z * 0.3);
  c.fillStyle = '#f1c40f';
  c.beginPath();
  c.moveTo(warn.x - rx * 0.35, warn.y + 4 * s);
  c.lineTo(warn.x - rx * 0.35 + 5 * s, warn.y - 5 * s);
  c.lineTo(warn.x - rx * 0.35 + 10 * s, warn.y + 4 * s);
  c.closePath();
  c.fill();
  c.fillStyle = '#2d3436';
  c.font = `bold ${5 * s}px sans-serif`;
  c.fillText('!', warn.x - rx * 0.35 + 5 * s, warn.y + 3 * s);
  // il coperchio
  c.fillStyle = '#d0d9e0';
  c.beginPath();
  c.ellipse(top.x, top.y, rx, ry, 0, 0, 6.3);
  c.fill();
  c.stroke();
  // la valvola, il manometro e il vapore freddo che esce piano
  box(it.x, it.y, 6, 6, 8, '#7f8c8d', { z0: it.z });
  const gauge = isoProject(it.x + r * 0.3, it.y + r * 0.6, it.z - 18);
  c.fillStyle = '#ecf0f1';
  c.beginPath();
  c.arc(gauge.x, gauge.y, 4 * s, 0, 6.3);
  c.fill();
  c.strokeStyle = '#2d3436';
  c.stroke();
  c.beginPath();
  c.moveTo(gauge.x, gauge.y);
  c.lineTo(gauge.x + 3 * s * Math.cos(-0.6), gauge.y + 3 * s * Math.sin(-0.6));
  c.stroke();
  const vent = isoProject(it.x, it.y, it.z + 10);
  for (let i = 0; i < 3; i++) {
    const k = ((t || 0) * 0.35 + i / 3) % 1;
    c.fillStyle = `rgba(235,248,255,${0.45 * (1 - k)})`;
    c.beginPath();
    c.arc(vent.x + Math.sin(k * 6 + i) * 3 * s, vent.y - k * 26 * s, (3 + k * 7) * s, 0, 6.3);
    c.fill();
  }
}

/** Il carrello con il vaso Dewar: il contenitore tondo dell'azoto per rabboccare le capsule. */
export function drawDewarCart(it: CryoItem, t: number): void {
  const c = ctx();
  const s = isoScale();
  box(it.x, it.y, it.w, it.h, 4, '#95a5a6', { z0: 10 });
  for (const [dx, dy] of [
    [-1, -1],
    [1, -1],
    [-1, 1],
    [1, 1],
  ])
    box(it.x + (dx * it.w) / 2.6, it.y + (dy * it.h) / 2.6, 3, 3, 10, '#2d3436');
  const p = isoProject(it.x, it.y, 14);
  const top = isoProject(it.x, it.y, 46);
  c.fillStyle = '#c8d3db';
  c.beginPath();
  c.ellipse(p.x, p.y, 13 * s, 7 * s, 0, 0, Math.PI);
  c.lineTo(top.x - 13 * s, top.y);
  c.ellipse(top.x, top.y, 13 * s, 7 * s, 0, Math.PI, 0, true);
  c.closePath();
  c.fill();
  c.strokeStyle = 'rgba(0,0,0,0.3)';
  c.stroke();
  c.fillStyle = '#e8eef2';
  c.beginPath();
  c.ellipse(top.x, top.y, 13 * s, 7 * s, 0, 0, 6.3);
  c.fill();
  c.stroke();
  // il vapore che sale dal collo
  for (let i = 0; i < 2; i++) {
    const k = ((t || 0) * 0.5 + i / 2) % 1;
    c.fillStyle = `rgba(235,248,255,${0.5 * (1 - k)})`;
    c.beginPath();
    c.arc(top.x, top.y - k * 22 * s, (2 + k * 6) * s, 0, 6.3);
    c.fill();
  }
}

// ---------------------------------------------------------------- console e accettazione

const TECH_BODIES = [
  { skin: 1, hairStyle: 3, hairColor: 2, eyeColor: 1, eyeShape: 1, mouth: 1, beard: 0, gender: 1 },
  { skin: 3, hairStyle: 0, hairColor: 0, eyeColor: 0, eyeShape: 0, mouth: 2, beard: 1, gender: 0 },
];
const techLooks: Record<number, ReturnType<typeof resolveLook>> = {};

/** Il camice bianco con il cartellino. */
function techLook(i: number): ReturnType<typeof resolveLook> {
  if (techLooks[i]) return techLooks[i];
  const base = resolveLook(parseLook('item_suit,pants_black,shoes_formal'));
  return (techLooks[i] = {
    ...base,
    top: { ...base.top, style: 'jacket', color: '#f7f9fa', color2: '#9ecbe6' },
    pants: { ...base.pants, color: '#4b6584' },
    body: TECH_BODIES[i % TECH_BODIES.length],
  });
}

/** Un monitor sul piano, girato verso chi guarda, con quello che `paint` ci disegna. */
function monitor(x: number, y: number, z: number, paint: (W: number, H: number) => void): void {
  box(x, y + 2, 5, 4, 4, '#2d3436', { z0: z });
  const scr = box(x, y, 34, 3, 22, '#1e272e', { z0: z + 4, top: '#2d3436' });
  onFace(scr, 'left', (W: number, H: number): void => {
    ctx().fillStyle = '#071923';
    ctx().fillRect(1.5, 1.5, W - 3, H - 3);
    paint(W, H);
  });
}

/** La linea del battito che scorre (per i monitor). */
function heartbeat(W: number, H: number, t: number, color: string): void {
  const c = ctx();
  c.strokeStyle = color;
  c.lineWidth = 0.8;
  c.beginPath();
  for (let i = 0; i <= 30; i++) {
    const u = 3 + ((W - 6) * i) / 30;
    const k = (i / 30 + t * 0.4) % 1;
    const spike = k > 0.45 && k < 0.52 ? -H * 0.32 * Math.sin(((k - 0.45) / 0.07) * Math.PI) : 0;
    const y = H * 0.6 + spike;
    if (i) c.lineTo(u, y);
    else c.moveTo(u, y);
  }
  c.stroke();
}

/** La console al centro: il tecnico, tre monitor con temperatura, battito e livello d'azoto. */
export function drawCryoConsole(it: CryoItem, t: number): void {
  const c = ctx();
  const tt = t || 0;
  const y0 = it.y - it.h / 2;
  drawPlayerAvatar(it.x + 30, y0 - 12, '', tt + 4, techLook(1), false, '', { noShadow: true });
  // il mobile della console, con il piano inclinato pieno di comandi
  const body = box(it.x, it.y, it.w, it.h, it.z - 6, '#dfe6ec', { top: '#eef2f5' });
  onFace(body, 'left', (W: number, H: number): void => {
    c.fillStyle = '#2b6f9e';
    c.fillRect(0, H * 0.25, W, 3);
    c.fillStyle = '#5d6d7e';
    c.font = 'bold 5px sans-serif';
    c.textAlign = 'center';
    c.fillText('CONTROLLO CAPSULE', W / 2, H * 0.62);
  });
  const deck = box(it.x, it.y + 6, it.w - 8, it.h - 18, 4, '#34495e', {
    z0: it.z - 6,
    top: '#2c3e50',
  });
  onFace(deck, 'top', (W: number, H: number): void => {
    // file di pulsanti colorati che si accendono a turno
    for (let i = 0; i < 18; i++) {
      const on = Math.floor(tt * 2 + i * 1.7) % 5 === 0;
      c.fillStyle = on ? ['#2ecc71', '#38c6ff', '#f1c40f'][i % 3] : '#576574';
      c.fillRect(6 + (i % 9) * ((W - 12) / 9), 4 + Math.floor(i / 9) * (H / 2.4), 5, 3);
    }
  });
  const mz = it.z - 2;
  monitor(it.x - 52, y0 + 8, mz, (W, H) => {
    c.fillStyle = CYAN;
    c.font = 'bold 6px monospace';
    c.textAlign = 'center';
    c.fillText('−196 °C', W / 2, H * 0.45);
    c.font = '3.5px monospace';
    c.fillStyle = '#9fd6f5';
    c.fillText('TEMPERATURA', W / 2, H * 0.75);
  });
  monitor(it.x, y0 + 8, mz, (W, H) => {
    heartbeat(W, H, tt, '#2ecc71');
    c.fillStyle = '#2ecc71';
    c.font = 'bold 4px monospace';
    c.textAlign = 'left';
    c.fillText('♥ 4 bpm', 3, 6);
  });
  monitor(it.x + 52, y0 + 8, mz, (W, H) => {
    const lvl = 0.82 + 0.03 * Math.sin(tt * 0.3);
    c.fillStyle = '#2d3436';
    c.fillRect(5, 4, W - 10, 5);
    c.fillStyle = CYAN;
    c.fillRect(5, 4, (W - 10) * lvl, 5);
    c.fillStyle = '#9fd6f5';
    c.font = '3.5px monospace';
    c.textAlign = 'center';
    c.fillText(`AZOTO ${Math.round(lvl * 100)}%`, W / 2, H * 0.75);
  });
}

/** L'accettazione: il bancone bianco con la fascia azzurra, la tecnica in camice e l'insegna. */
export function drawCryoDesk(it: CryoItem, t: number): void {
  const c = ctx();
  drawPlayerAvatar(it.x - 20, it.y - it.h / 2 - 14, '', (t || 0) + 2, techLook(0), false, '', {
    noShadow: true,
  });
  const b = box(it.x, it.y, it.w, it.h, it.z - 4, '#f2f5f7', { top: '#ffffff' });
  onFace(b, 'left', (W: number, H: number): void => {
    c.fillStyle = '#2b6f9e';
    c.fillRect(0, H * 0.55, W, 4);
    c.fillStyle = '#2b6f9e';
    c.font = 'bold 7px sans-serif';
    c.textAlign = 'center';
    c.fillText('ACCETTAZIONE', W / 2, H * 0.4);
    c.font = '20px sans-serif';
  });
  onFace(b, 'right', (W: number, H: number): void => {
    c.fillStyle = '#2b6f9e';
    c.fillRect(0, H * 0.55, W, 4);
  });
  // sul piano: il monitor girato verso la tecnica, il registro e il campanello
  box(it.x + 30, it.y - 10, 26, 3, 16, '#2d3436', { z0: it.z - 4, top: '#3d4852' });
  box(it.x - 30, it.y + 6, 18, 12, 2, '#2b6f9e', { z0: it.z - 4, top: '#3b82b5' });
  const bell = isoProject(it.x + 52, it.y + 8, it.z);
  const s = isoScale();
  c.fillStyle = '#d4ac0d';
  c.beginPath();
  c.arc(bell.x, bell.y, 3 * s, Math.PI, 0);
  c.fill();
}

/** Il totem con le istruzioni: colonna bianca con lo schermo azzurro e il fiocco di neve. */
export function drawCryoInfo(it: CryoItem, t: number): void {
  const c = ctx();
  box(it.x, it.y, it.w + 6, it.h + 6, 3, '#b2bec3');
  const b = box(it.x, it.y, it.w, it.h, it.z - 3, '#f5f8fa', { z0: 3, top: '#ffffff' });
  onFace(b, 'left', (W: number, H: number): void => {
    c.fillStyle = '#0d2b3e';
    c.fillRect(3, 6, W - 6, H * 0.55);
    c.fillStyle = `rgba(56,198,255,${0.75 + 0.25 * Math.sin((t || 0) * 2)})`;
    c.font = 'bold 12px sans-serif';
    c.textAlign = 'center';
    c.fillText('❄', W / 2, H * 0.28);
    c.fillStyle = '#ffffff';
    c.font = 'bold 4px sans-serif';
    c.fillText('COME', W / 2, H * 0.42);
    c.fillText('FUNZIONA', W / 2, H * 0.49);
    c.fillStyle = '#2b6f9e';
    c.font = 'bold 9px sans-serif';
    c.fillText('i', W / 2, H * 0.82);
  });
}

// ---------------------------------------------------------------- sui muri

/** Le tubazioni del freddo lungo tutto il muro di fondo, con le valvole e la brina. */
export function wallCryoPipes(): void {
  const c = ctx();
  const W = game.X1 - game.X0;
  for (const [y, h, col] of [
    [52, 7, '#b8c6d1'],
    [61, 5, '#8fa3b1'],
  ] as [number, number, string][]) {
    const g = c.createLinearGradient(0, y, 0, y + h);
    g.addColorStop(0, '#eef3f6');
    g.addColorStop(1, col);
    c.fillStyle = g;
    c.fillRect(0, y, W, h);
    c.fillStyle = 'rgba(0,0,0,0.12)';
    c.fillRect(0, y + h, W, 1.5);
    for (let u = 40; u < W; u += 110) {
      c.fillStyle = '#6c7a89';
      c.fillRect(u, y - 1.5, 4, h + 3);
    }
  }
  // le calate verticali sopra ogni capsula della fila di fondo
  for (const x of [-300, -225, -150, -75, 0, 75, 150]) {
    const u = x - game.X0;
    c.fillStyle = '#a9b8c4';
    c.fillRect(u - 2, 66, 4, 8);
    c.fillStyle = 'rgba(255,255,255,0.6)';
    c.fillRect(u - 2, 66, 1.2, 8);
  }
}

/** L'insegna del centro, con il fiocco di neve. */
export function wallCryoSign(d: { u: number }): void {
  const c = ctx();
  c.fillStyle = '#2b6f9e';
  c.font = 'bold 22px sans-serif';
  c.textAlign = 'center';
  c.fillText('❄ CRIOGENESI', d.u, 30);
  c.fillStyle = '#5d6d7e';
  c.font = '9px sans-serif';
  c.fillText('il tempo si ferma, tu no', d.u, 42);
}

/** Il grande schermo a muro con temperatura, battiti e capsule occupate, che si aggiorna. */
export function wallCryoScreen(d: { u: number; small?: boolean }, t: number): void {
  const c = ctx();
  const w = d.small ? 70 : 96,
    h = d.small ? 44 : 56,
    x = d.u - w / 2,
    y = d.small ? 20 : 4;
  c.fillStyle = '#1e272e';
  c.fillRect(x - 3, y - 3, w + 6, h + 6);
  c.fillStyle = '#061520';
  c.fillRect(x, y, w, h);
  c.fillStyle = CYAN;
  c.font = 'bold 8px monospace';
  c.textAlign = 'left';
  c.fillText('−196 °C', x + 5, y + 12);
  c.fillStyle = '#9fd6f5';
  c.font = '5px monospace';
  c.fillText(`CAPSULE OCCUPATE ${cryoSleepers().length}/${CRYO_PODS.length}`, x + 5, y + 21);
  // il battito che scorre in basso
  c.strokeStyle = '#2ecc71';
  c.lineWidth = 1;
  c.beginPath();
  for (let i = 0; i <= 40; i++) {
    const u = x + 4 + ((w - 8) * i) / 40;
    const k = (i / 40 + (t || 0) * 0.35) % 1;
    const spike = k > 0.46 && k < 0.53 ? -12 * Math.sin(((k - 0.46) / 0.07) * Math.PI) : 0;
    const yy = y + h - 12 + spike;
    if (i) c.lineTo(u, yy);
    else c.moveTo(u, yy);
  }
  c.stroke();
}

/**
 * Velo di nebbia fredda sul pavimento davanti alle capsule, che si muove piano. È un oggetto di
 * scena con la profondità più bassa di tutti: si disegna sopra il pavimento e sotto il resto.
 */
export function drawCryoMist(_it: CryoItem, t: number): void {
  const c = ctx();
  const s = isoScale();
  for (let i = 0; i < 6; i++) {
    const x = -300 + i * 110 + Math.sin((t || 0) * 0.2 + i) * 25;
    const y = -185 + (i % 2) * 45;
    const p = isoProject(x, y, 0);
    const g = c.createRadialGradient(p.x, p.y, 0, p.x, p.y, 70 * s);
    g.addColorStop(0, 'rgba(230,245,255,0.22)');
    g.addColorStop(1, 'rgba(230,245,255,0)');
    c.fillStyle = g;
    c.beginPath();
    c.ellipse(p.x, p.y, 70 * s, 34 * s, 0, 0, 6.3);
    c.fill();
  }
  // la linea blu di sicurezza a terra davanti alle due file di capsule
  c.strokeStyle = 'rgba(43,111,158,0.75)';
  c.lineWidth = 2.2 * s;
  c.setLineDash([9 * s, 5 * s]);
  c.beginPath();
  for (const [x, y] of [
    [185, -212],
    [-312, -212],
    [-312, 125],
  ]) {
    const p = isoProject(x, y, 0);
    if (x === 185) c.moveTo(p.x, p.y);
    else c.lineTo(p.x, p.y);
  }
  c.stroke();
  c.setLineDash([]);
}
