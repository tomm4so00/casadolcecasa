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
import { presenceAlive } from './saves.js';
import { presenceState } from './presence-rules.js';

export const COIN_PRICE = 5;
export const ICE_CREAM_PRICE = 5;
const ICE_CREAM_HUNGER = 50;
/** Secondi per finire il gelato (il cono si vede in mano e si rimpicciolisce). */
const ICE_CREAM_EAT = 8;
const SIT = { down: 0.3, up: 0.3 };
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
  fun: 'bench' | 'fountain' | 'iceCream' | 'realty';
}

/**
 * Decorazioni con cui si può interagire: panchine, fontana e bacheca immobiliare del cortile
 * (bench0, bench1, fountain, realty)
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
    else if (p.kind === 'realtyBoard')
      out.realty = { x: p.x, y: p.y, w: p.w, h: p.h, reach: 10, fun: 'realty' };
  }
  return out;
}

export const isSittingOnBench = (): boolean => !!game.benchSit;

/** Posa da mostrare (e da mandare agli altri) mentre si è seduti. */
export const myBenchPose = (): string => (game.benchSit?.pose === 'bench' ? 'bench' : '');

type Pt = { x: number; y: number };

/** Spostamento "da seduti" (sedersi, alzarsi): un passo breve e morbido da a a b. */
function slide(a: Pt, b: Pt, k: number, walking: boolean): void {
  const t = Math.max(0, Math.min(1, k));
  const e = t * t * (3 - 2 * t);
  game.playerPos.x = a.x + (b.x - a.x) * e;
  game.playerPos.y = a.y + (b.y - a.y) * e;
  game.isWalking = walking && k < 1;
}

/** Cammina lungo il percorso a velocità costante; true quando è arrivato in fondo. */
function walkPath(s: GameValue, dist: number): boolean {
  const path: Pt[] = s.path;
  for (let i = 1; i < path.length; i++) {
    const a = path[i - 1],
      b = path[i];
    const len = Math.hypot(b.x - a.x, b.y - a.y);
    if (dist <= len && len > 0) {
      game.playerPos.x = a.x + ((b.x - a.x) * dist) / len;
      game.playerPos.y = a.y + ((b.y - a.y) * dist) / len;
      s.dir = { x: b.x - a.x, y: b.y - a.y };
      game.isWalking = true;
      return false;
    }
    dist -= len;
  }
  const end = path[path.length - 1];
  game.playerPos.x = end.x;
  game.playerPos.y = end.y;
  return true;
}

const pathLength = (path: Pt[]): number =>
  path.reduce((n, p, i) => (i ? n + Math.hypot(p.x - path[i - 1].x, p.y - path[i - 1].y) : 0), 0);

// ---------------------------------------------------------------- posti occupati

/** Gli altri giocatori che si vedono qui (stesso ambiente, stessa stanza o appartamento). */
export function othersHere(): [string, GameValue][] {
  const env = game.view.activeEnvironment;
  const now = Date.now();
  const out: [string, GameValue][] = [];
  for (const [id, op] of Object.entries(game.onlinePlayers || {}) as [string, GameValue][]) {
    if (id === game.session.myPlayerId || !op || op.env !== env) continue;
    if (env === 'PLAYER_ROOM' && op.roomIdx !== game.currentRoomIdx) continue;
    if (game.APT_ENVS.includes(env) && (op.apt || 0) !== game.currentApt) continue;
    const state = presenceState(
      op,
      presenceAlive(id, op, now),
      now + (game.session.serverOffset || 0),
      game.SLEEP_DEPLETION_SEC,
    );
    // chi è andato via non si vede più; chi è svenuto è a terra, non seduto
    if (state === 'gone' || state === 'fainted') continue;
    out.push([id, op]);
  }
  return out;
}

/** Distanza sotto la quale due persone sedute starebbero una sopra l'altra. */
const SEAT_GAP = 12;

/** Chi è già seduto su questo posto (anche se è uscito dal gioco seduto lì), o null. */
function seatTakenBy(seat: Pt): string | null {
  for (const [id, op] of othersHere())
    if (op.act === 'bench' && Math.hypot(op.x - seat.x, op.y - seat.y) < SEAT_GAP) return id;
  return null;
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
  // due posti per panchina: prima quello dalla propria parte, se è preso l'altro
  const near = game.playerPos.x < b.x ? -1 : 1;
  const side = [near, -near].find((sd) => !seatTakenBy({ x: b.x + sd * b.w * 0.22, y: b.y + 2 }));
  if (side === undefined) {
    toast('🪑 La panchina è occupata: ci sono già seduti in due.');
    sfx('error');
    return;
  }
  const seat = { x: b.x + side * b.w * 0.22, y: b.y + 2 };
  const front = { x: seat.x, y: b.y + b.h / 2 + 18 };
  const from = { x: game.playerPos.x, y: game.playerPos.y };
  // da dietro la panchina si gira attorno al bracciolo invece di attraversarla
  const path: Pt[] = [from];
  if (from.y < b.y + b.h / 2) {
    const clear = b.w / 2 + 16;
    if (Math.abs(from.x - b.x) < clear) {
      const aside = b.x + side * clear;
      path.push({ x: aside, y: from.y }, { x: aside, y: front.y });
    } else path.push({ x: from.x, y: front.y });
  }
  path.push(front);
  startSit('bench', seat, front, path, null);
}

/** Velocità con cui si va a sedersi (come camminare). */
const SIT_WALK_SPEED = 130;

function startSit(kind: 'bench' | 'sofa', seat: Pt, front: Pt, path: Pt[], item: GameValue): void {
  game.benchSit = {
    kind,
    env: game.view.activeEnvironment,
    item,
    t0: game.animClock,
    path,
    walk: pathLength(path) / SIT_WALK_SPEED,
    front,
    seat,
    // seduti si guarda in avanti, dal posto verso chi sta davanti
    face: { x: front.x - seat.x, y: front.y - seat.y },
    dir: null,
    pose: '',
    relaxAt: game.animClock + RELAX_EVERY,
  };
}

/** Direzione in cui guarda chi si sta sedendo o è seduto (null = quella dei tasti). */
export const benchWalkDir = (): Pt | null => game.benchSit?.dir || null;

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
  const near = local.x < item.x ? -1 : 1;
  const side = [near, -near].find(
    (sd) => !seatTakenBy(rotateAround(item.x + sd * off, item.y + 4, item.x, item.y, k)),
  );
  if (side === undefined) {
    toast('🛋️ Il divano è occupato: ci sono già seduti in due.');
    sfx('error');
    return;
  }
  const sx = item.x + side * off;
  const seat = rotateAround(sx, item.y + 4, item.x, item.y, k);
  const front = rotateAround(sx, item.y + item.h / 2 + 22, item.x, item.y, k);
  startSit('sofa', seat, front, [{ x: game.playerPos.x, y: game.playerPos.y }, front], item);
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

/**
 * Se nel frattempo il posto l'ha preso qualcun altro: chi stava ancora arrivando rinuncia;
 * se ci si è seduti nello stesso istante, si alza chi ha l'id "più grande" (lo decidono
 * allo stesso modo tutti e due, così se ne alza uno solo).
 */
function checkSeatConflict(s: GameValue): boolean {
  if (s.upAt !== undefined) return false;
  const other = seatTakenBy(s.seat);
  if (!other) return false;
  if (s.pose !== 'bench') {
    game.benchSit = null;
    game.isWalking = false;
    toast('🪑 Qualcuno si è seduto lì prima di te.');
    return true;
  }
  if (other < String(game.session.myPlayerId)) {
    toast('🪑 Vi siete seduti nello stesso posto: ti alzi e lo lasci libero.');
    standUp();
    return true;
  }
  return false;
}

/** Ogni fotogramma: avvicinarsi, sedersi, restare seduti, alzarsi. */
export function updateBench(now: number): void {
  const s: GameValue = game.benchSit;
  if (!s) return;
  if (game.view.activeEnvironment !== s.env) {
    game.benchSit = null;
    return;
  }
  if (checkSeatConflict(s)) return;
  if (s.upAt !== undefined) {
    // ci si alza con un passo in avanti
    const e = (now - s.upAt) / SIT.up;
    s.pose = '';
    s.dir = s.face;
    slide(s.seat, s.front, e, true);
    if (e >= 1) {
      game.benchSit = null;
      game.isWalking = false;
    }
    return;
  }
  let e = now - s.t0;
  if (e < s.walk) {
    walkPath(s, e * SIT_WALK_SPEED);
    return;
  }
  e -= s.walk;
  // arrivati davanti al posto: ci si gira e ci si lascia andare all'indietro sulla seduta
  s.dir = s.face;
  s.pose = 'bench';
  if (e < SIT.down) return slide(s.front, s.seat, e / SIT.down, false);
  slide(s.seat, s.seat, 1, false);
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
