// Cortile interno: sedersi sulle panchine e lanciare una moneta nella fontana.
// Centro commerciale: comprare un gelato al carretto.
// Stanza: sedersi sul divano e rilassarsi.
import type { GameValue } from './context.js';
import { game } from './context.js';
import { relaxWith, toast } from './missions.js';
import { sfx } from './audio.js';
import { spendMoney } from './economy.js';
import { saySocial } from './social.js';
import { isoProject, isoScale, rotateAround } from './render/primitives.js';

export const COIN_PRICE = 5;
export const ICE_CREAM_PRICE = 5;
const ICE_CREAM_HUNGER = 50;
/** Secondi per finire il gelato (il cono si vede in mano e si rimpicciolisce). */
const ICE_CREAM_EAT = 8;
const SIT = { approach: 0.5, down: 0.3, up: 0.3 };
const TOSS = { fly: 1.0, splash: 1.2 };
/** Ogni quanto si guadagna un po' di felicità stando seduti (in panchina o sul divano). */
const RELAX_EVERY = 30;
/** Durata del "tonfo" sui cuscini quando ci si lascia cadere sul divano. */
const PLOP = 0.45;

const WISHES = [
  'Hai espresso un desiderio ✨',
  'Plin! Chissà se si avvererà… 🌠',
  'La moneta brilla sul fondo della fontana 💫',
  'Desiderio espresso: incrocia le dita 🤞',
];

interface Spot {
  x: number;
  y: number;
  w: number;
  h: number;
  reach: number;
  fun: 'bench' | 'fountain' | 'iceCream';
}

/**
 * Decorazioni con cui si può interagire: panchine e fontana del cortile (bench0, bench1, fountain)
 * e il carretto dei gelati del centro commerciale (iceCream).
 */
export function funSpots(): Record<string, Spot> {
  const out: Record<string, Spot> = {};
  if (game.view.activeEnvironment === 'centro_commerciale') {
    const cart = ((game.ENV_DECOR.centro_commerciale || []) as GameValue[]).find(
      (p) => p.kind === 'iceCreamCart',
    );
    if (cart)
      out.iceCream = { x: cart.x, y: cart.y, w: cart.w, h: cart.h, reach: 10, fun: 'iceCream' };
    return out;
  }
  if (game.view.activeEnvironment !== 'CORTILE') return out;
  let benches = 0;
  for (const p of (game.ENV_DECOR.CORTILE || []) as GameValue[]) {
    if (p.kind === 'bench')
      out['bench' + benches++] = { x: p.x, y: p.y, w: p.w, h: p.h, reach: 0, fun: 'bench' };
    else if (p.kind === 'fountain')
      out.fountain = { x: p.x, y: p.y, w: p.w, h: p.h, reach: p.w / 2, fun: 'fountain' };
  }
  return out;
}

export const isSittingOnBench = (): boolean => !!game.benchSit;

/** Posa da mostrare (e da mandare agli altri) mentre si è seduti. */
export const myBenchPose = (): string => (game.benchSit?.pose === 'bench' ? 'bench' : '');

function walk(a: { x: number; y: number }, b: { x: number; y: number }, k: number): void {
  const t = Math.max(0, Math.min(1, k));
  const e = t * t * (3 - 2 * t);
  game.playerPos.x = a.x + (b.x - a.x) * e;
  game.playerPos.y = a.y + (b.y - a.y) * e;
  game.isWalking = k < 1;
}

// ---------------------------------------------------------------- panchine

/** Siediti sulla panchina (dal lato più vicino), oppure alzati se ci sei già seduto. */
export function toggleBench(key: string): void {
  if (game.benchSit) {
    standUp();
    return;
  }
  const b = funSpots()[key];
  if (!b || game.player.isSleeping) return;
  // due posti per panchina: ci si siede su quello dalla propria parte
  const side = game.playerPos.x < b.x ? -1 : 1;
  const seat = { x: b.x + side * b.w * 0.22, y: b.y + 2 };
  startSit('bench', seat, { x: seat.x, y: b.y + b.h / 2 + 18 }, null);
}

function startSit(
  kind: 'bench' | 'sofa',
  seat: { x: number; y: number },
  front: { x: number; y: number },
  item: GameValue,
): void {
  game.benchSit = {
    kind,
    env: game.view.activeEnvironment,
    item,
    t0: game.animClock,
    from: { x: game.playerPos.x, y: game.playerPos.y },
    front,
    seat,
    pose: '',
    relaxAt: game.animClock + RELAX_EVERY,
  };
}

// ---------------------------------------------------------------- divano

/**
 * Siediti sul divano della stanza (sul posto dalla tua parte, anche se il divano è ruotato),
 * oppure alzati se ci sei già seduto.
 */
export function toggleSofa(item: GameValue): void {
  if (game.benchSit) {
    standUp();
    return;
  }
  if (!item || game.player.isSleeping) return;
  const k = (((item.rot || 0) % 4) + 4) % 4;
  // posizione del giocatore vista "dal divano" (come se non fosse ruotato)
  const local = rotateAround(game.playerPos.x, game.playerPos.y, item.x, item.y, (4 - k) % 4);
  const arm = Math.max(6, item.w * 0.11);
  const off = (item.w - arm * 2) / 4;
  const sx = item.x + (local.x < item.x ? -off : off);
  const seat = rotateAround(sx, item.y + 4, item.x, item.y, k);
  const front = rotateAround(sx, item.y + item.h / 2 + 22, item.x, item.y, k);
  startSit('sofa', seat, front, item);
}

/** Seduti sul divano (per il pulsante "Alzati"). */
export const onSofa = (): boolean => game.benchSit?.kind === 'sofa';

export function standUp(): void {
  const s: GameValue = game.benchSit;
  if (!s || s.upAt !== undefined) return;
  // se si era ancora per strada verso la panchina ci si ferma e basta
  if (s.pose !== 'bench') {
    game.benchSit = null;
    game.isWalking = false;
    return;
  }
  s.upAt = game.animClock;
}

/** Ogni fotogramma: avvicinarsi, sedersi, restare seduti, alzarsi. */
export function updateBench(now: number): void {
  const s: GameValue = game.benchSit;
  if (!s) return;
  if (game.view.activeEnvironment !== s.env) {
    game.benchSit = null;
    return;
  }
  if (s.upAt !== undefined) {
    const e = (now - s.upAt) / SIT.up;
    s.pose = '';
    walk(s.seat, s.front, e);
    if (e >= 1) {
      game.benchSit = null;
      game.isWalking = false;
    }
    return;
  }
  let e = now - s.t0;
  if (e < SIT.approach) return walk(s.from, s.front, e / SIT.approach);
  e -= SIT.approach;
  if (e < SIT.down) {
    s.pose = 'bench';
    return walk(s.front, s.seat, e / SIT.down);
  }
  s.pose = 'bench';
  walk(s.seat, s.seat, 1);
  if (s.kind === 'sofa') {
    // appena seduti: tonfo sui cuscini, sospiro e la pausa sul divano (felicità)
    if (!s.seatedAt) {
      s.seatedAt = now;
      saySocial('😌 Aaah, che relax…');
      relaxWith('sofa', s.item);
    } else if (now >= s.relaxAt) {
      // restando seduti la pausa si ripete appena è passato il tempo minimo fra due pause
      s.relaxAt = now + RELAX_EVERY;
      relaxWith('sofa', s.item, true);
    }
    return;
  }
  // stare un po' seduti all'aria aperta mette di buon umore
  if (now >= s.relaxAt) {
    s.relaxAt = now + RELAX_EVERY;
    if (game.player.happinessLevel < 100) {
      game.player.happinessLevel = Math.min(100, game.player.happinessLevel + 1);
      toast('🌳 Ti rilassi sulla panchina (Felicità +1%)', 2000);
    }
  }
}

// ---------------------------------------------------------------- fontana

/** Lancia una moneta nella fontana: costa 5 € e porta un po' di buon umore. */
export async function tossCoin(): Promise<void> {
  if (game.coinToss) return;
  const f = funSpots().fountain;
  if (!f) return;
  if (game.moneyLevel < COIN_PRICE) {
    toast(`Ti servono ${COIN_PRICE} € in cassaforte per lanciare una moneta.`);
    sfx('error');
    return;
  }
  if (!(await spendMoney(COIN_PRICE))) {
    toast('Non è stato possibile prendere la moneta, riprova.');
    return;
  }
  const a = Math.random() * Math.PI * 2,
    r = Math.random() * f.w * 0.22;
  game.coinToss = {
    t0: game.animClock,
    from: { x: game.playerPos.x, y: game.playerPos.y },
    to: { x: f.x + Math.cos(a) * r, y: f.y + Math.sin(a) * r },
    splashed: false,
  };
  sfx('coin');
  saySocial('✨ Esprimo un desiderio…');
}

/** Ogni fotogramma: fine del lancio e desiderio. */
export function updateCoinToss(now: number): void {
  const c: GameValue = game.coinToss;
  if (!c) return;
  if (game.view.activeEnvironment !== 'CORTILE') {
    game.coinToss = null;
    return;
  }
  const e = now - c.t0;
  if (!c.splashed && e >= TOSS.fly) {
    c.splashed = true;
    sfx('shower');
    game.player.happinessLevel = Math.min(100, game.player.happinessLevel + 3);
    toast(`${WISHES[Math.floor(Math.random() * WISHES.length)]} (Felicità +3%)`, 3000);
  }
  if (e >= TOSS.fly + TOSS.splash) game.coinToss = null;
}

/** La moneta che vola in arco verso l'acqua, poi gli schizzi e i cerchi sull'acqua. */
export function drawCoinToss(now: number): void {
  const c: GameValue = game.coinToss;
  if (!c) return;
  const ctx = game.view.ctx;
  const s = isoScale();
  const e = now - c.t0;
  const WATER = 15;
  if (e < TOSS.fly) {
    const k = e / TOSS.fly;
    const x = c.from.x + (c.to.x - c.from.x) * k,
      y = c.from.y + (c.to.y - c.from.y) * k;
    const z = 44 + (WATER - 44) * k + Math.sin(k * Math.PI) * 55;
    const p = isoProject(x, y, z);
    // la moneta gira su se stessa: si vede ora piena ora di taglio
    const spin = Math.abs(Math.cos(e * 18));
    ctx.fillStyle = '#f1c40f';
    ctx.strokeStyle = '#b7950b';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.ellipse(p.x, p.y, Math.max(0.8, 4.5 * s * spin), 4.5 * s, 0, 0, 6.3);
    ctx.fill();
    ctx.stroke();
    if (spin > 0.6) {
      ctx.fillStyle = 'rgba(255,255,255,0.8)';
      ctx.beginPath();
      ctx.arc(p.x - 1 * s, p.y - 1 * s, 0.9 * s, 0, 6.3);
      ctx.fill();
    }
    return;
  }
  const k = (e - TOSS.fly) / TOSS.splash;
  const p = isoProject(c.to.x, c.to.y, WATER);
  // cerchi che si allargano sull'acqua
  for (let i = 0; i < 3; i++) {
    const kk = k - i * 0.18;
    if (kk <= 0 || kk >= 1) continue;
    ctx.strokeStyle = `rgba(255,255,255,${0.8 * (1 - kk)})`;
    ctx.lineWidth = 1.2;
    ctx.beginPath();
    ctx.ellipse(p.x, p.y, (3 + kk * 16) * s, (1.5 + kk * 8) * s, 0, 0, 6.3);
    ctx.stroke();
  }
  // goccioline che saltano su e ricadono
  if (k < 0.5) {
    const kk = k / 0.5;
    ctx.fillStyle = `rgba(200,235,255,${0.9 * (1 - kk)})`;
    for (let i = 0; i < 6; i++) {
      const a = (i / 6) * Math.PI * 2;
      const d = kk * 9;
      const h = Math.sin(kk * Math.PI) * 12;
      const q = isoProject(c.to.x + Math.cos(a) * d, c.to.y + Math.sin(a) * d, WATER + h);
      ctx.beginPath();
      ctx.arc(q.x, q.y, 1.3 * s, 0, 6.3);
      ctx.fill();
    }
  }
}

// ---------------------------------------------------------------- gelato

const FLAVOURS = [
  { name: 'fragola', color: '#ff8fab' },
  { name: 'pistacchio', color: '#a8d672' },
  { name: 'cioccolato', color: '#7b4a2e' },
  { name: 'limone', color: '#fff27a' },
  { name: 'stracciatella', color: '#fffaf0' },
];

/** Compra un gelato al carretto: 5 € e la fame sale del 50%. */
export async function buyIceCream(): Promise<void> {
  if (game.iceCream) return;
  if (game.moneyLevel < ICE_CREAM_PRICE) {
    toast(`Ti servono ${ICE_CREAM_PRICE} € in cassaforte per il gelato.`);
    sfx('error');
    return;
  }
  if (!(await spendMoney(ICE_CREAM_PRICE))) {
    toast('Non è stato possibile pagare il gelato, riprova.');
    return;
  }
  const flavour = FLAVOURS[Math.floor(Math.random() * FLAVOURS.length)];
  game.player.hungerLevel = Math.min(100, game.player.hungerLevel + ICE_CREAM_HUNGER);
  game.iceCream = { t0: game.animClock, color: flavour.color };
  sfx('coin');
  toast(`🍦 Gelato al gusto ${flavour.name}! (Fame +${ICE_CREAM_HUNGER}%)`, 3000);
  saySocial('🍦 Mmm, che buono!');
}

/** Ogni fotogramma: il gelato finisce dopo qualche secondo (o se si cambia posto). */
export function updateIceCream(now: number): void {
  const ic: GameValue = game.iceCream;
  if (!ic) return;
  if (now - ic.t0 >= ICE_CREAM_EAT || game.player.isSleeping) game.iceCream = null;
}

/** Il cono in mano, con la pallina che a ogni morso diventa più piccola. */
export function drawIceCream(x: number, y: number, now: number): void {
  const ic: GameValue = game.iceCream;
  if (!ic) return;
  const ctx = game.view.ctx;
  const s = isoScale();
  const k = Math.min(1, (now - ic.t0) / ICE_CREAM_EAT);
  const hand = isoProject(x + 9, y + 6, 32 + Math.sin(now * 3) * 1.5);
  // cono
  ctx.fillStyle = '#d9a35b';
  ctx.strokeStyle = '#a0692b';
  ctx.lineWidth = 0.8;
  ctx.beginPath();
  ctx.moveTo(hand.x - 3.2 * s, hand.y - 6 * s);
  ctx.lineTo(hand.x + 3.2 * s, hand.y - 6 * s);
  ctx.lineTo(hand.x, hand.y + 4 * s);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();
  // pallina che cala a ogni morso (a scatti)
  const bites = Math.floor(k * 5);
  const r = 4.2 * s * (1 - bites / 6);
  if (k < 0.95) {
    ctx.fillStyle = ic.color;
    ctx.strokeStyle = 'rgba(0,0,0,0.25)';
    ctx.beginPath();
    ctx.arc(hand.x, hand.y - 6 * s - r * 0.6, r, 0, 6.3);
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = 'rgba(255,255,255,0.6)';
    ctx.beginPath();
    ctx.arc(hand.x - r * 0.35, hand.y - 6 * s - r * 0.95, r * 0.28, 0, 6.3);
    ctx.fill();
  }
}

/**
 * Sul divano: un tonfo sui cuscini appena ci si siede (sbuffi di polvere e cuscino che si schiaccia),
 * poi note musicali e cuoricini che salgono piano mentre ci si rilassa.
 */
export function drawSofaRelax(x: number, y: number, now: number): void {
  const s: GameValue = game.benchSit;
  if (!s || s.kind !== 'sofa' || !s.seatedAt || s.upAt !== undefined) return;
  const ctx = game.view.ctx;
  const sc = isoScale();
  const since = now - s.seatedAt;
  if (since < PLOP) {
    const k = since / PLOP;
    const hip = isoProject(x, y, 16);
    // cuscino che si schiaccia: un'ombra che si allarga e svanisce
    ctx.fillStyle = `rgba(0,0,0,${0.18 * (1 - k)})`;
    ctx.beginPath();
    ctx.ellipse(hip.x, hip.y + 2 * sc, (10 + k * 10) * sc, (4 + k * 4) * sc, 0, 0, 6.3);
    ctx.fill();
    // sbuffi di polvere ai lati
    ctx.fillStyle = `rgba(255,255,255,${0.75 * (1 - k)})`;
    for (let i = 0; i < 6; i++) {
      const a = Math.PI + (i / 5) * Math.PI;
      const d = (8 + k * 14) * sc;
      ctx.beginPath();
      ctx.arc(
        hip.x + Math.cos(a) * d * 1.4,
        hip.y + Math.sin(a) * d * 0.5 - k * 6 * sc,
        (2 + k * 2.5) * sc,
        0,
        6.3,
      );
      ctx.fill();
    }
    return;
  }
  // note e cuoricini che salgono, uno dopo l'altro
  const head = isoProject(x, y, 74);
  const glyphs = ['♪', '♥', '♫', '♥'];
  ctx.textAlign = 'center';
  for (let i = 0; i < 3; i++) {
    const k = ((since - PLOP) * 0.35 + i / 3) % 1;
    const g = glyphs[(Math.floor((since - PLOP) * 0.35 + i / 3) + i) % glyphs.length];
    ctx.fillStyle =
      g === '♥'
        ? `rgba(255,105,140,${0.9 * Math.sin(k * Math.PI)})`
        : `rgba(255,255,255,${0.9 * Math.sin(k * Math.PI)})`;
    ctx.font = `bold ${Math.round((10 + k * 4) * sc)}px sans-serif`;
    ctx.fillText(g, head.x + (22 + Math.sin(k * 6 + i) * 6) * sc, head.y - k * 34 * sc);
  }
}
