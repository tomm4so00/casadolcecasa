// Turno in ufficio, oltre ai compiti da portare al cerchio: la goccia della sete (si beve al
// distributore), le stampe chieste dai colleghi e, una volta ogni due turni, la visita del capo che
// urla mentre tutti scappano in tondo con le braccia alzate. Le regole stanno in office-rules.ts.
import type { GameValue } from './context.js';
import { game } from './context.js';
import { sfx } from './audio.js';
import { botLook, parseLook, resolveLook } from './character.js';
import { mgHud, mgPop, mgScore } from './jobs.js';
import { drawPlayerAvatar } from './render/avatars.js';
import { isoProject, isoScale } from './render/primitives.js';
import {
  BOSS_LIMIT,
  BOSS_SPEED,
  PRINT_SECONDS,
  SLOW_FACTOR,
  SLOW_SECONDS,
  THIRST_WARN,
  bossBonus,
  bossPlan,
  printGap,
  thirstAfter,
} from './office-rules.js';

type Pt = { x: number; y: number };

interface Colleague {
  name: string;
  seat: Pt;
  x: number;
  y: number;
  dir: Pt;
  /** angolo del giro in tondo quando scappa dal capo */
  ang: number;
}

interface Office {
  clock: number;
  thirst: number;
  warned: boolean;
  slowUntil: number;
  colleagues: Colleague[];
  cooler: GameValue;
  printer: GameValue;
  shelf: GameValue;
  /** stampa chiesta da un collega: `who` è il collega, `left` i secondi che mancano al foglio */
  print: { who: number; phase: 'order' | 'printing' | 'ready' | 'carried'; left: number } | null;
  nextPrintAt: number;
  boss: {
    at: number;
    phase: 'wait' | 'enter' | 'demand' | 'leave' | 'done';
    x: number;
    y: number;
    timer: number;
    happy: boolean;
  } | null;
  t: number;
}

let off: Office | null = null;

const BOSS_LOOK = (): GameValue => resolveLook(parseLook('item_suit,pants_black,shoes_formal'));

export const officeOn = (): boolean => !!off;

export function startOffice(): void {
  const props = (game.ENV_PROPS[game.view.activeEnvironment] || []) as GameValue[];
  const find = (kind: string) => props.find((p) => p.kind === kind);
  // i colleghi: alle scrivanie (tranne la prima, che è quella dei compiti) e su uno sgabello
  const seats: Pt[] = props
    .filter((p) => p.kind === 'officeDesk')
    .slice(1)
    .map((d) => ({ x: d.x, y: d.y + d.h / 2 + 12 }));
  const stool = find('stool');
  if (stool) seats.push({ x: stool.x, y: stool.y });
  const names = ['Paola', 'Gino', 'Marta'];
  const plan = bossPlan(Math.random(), Math.random(), game.SHIFT_SECONDS);
  off = {
    clock: 0,
    thirst: 1,
    warned: false,
    slowUntil: 0,
    colleagues: seats.map((s, i) => ({
      name: names[i % names.length],
      seat: s,
      x: s.x,
      y: s.y,
      dir: { x: 0, y: -1 },
      ang: i * 2.1,
    })),
    cooler: find('cooler'),
    printer: find('printer'),
    shelf: find('bookshelf'),
    print: null,
    nextPrintAt: 6,
    boss: plan.comes
      ? { at: plan.at, phase: 'wait', x: 0, y: game.Y1 - 10, timer: 0, happy: false }
      : null,
    t: 0,
  };
}

export function stopOffice(): void {
  off = null;
  shakeScreen(false);
}

/** Più lenti mentre si è disidratati. */
export function officeSpeed(): number {
  return off && off.clock < off.slowUntil ? SLOW_FACTOR : 1;
}

const bossHere = (): boolean => !!off?.boss && ['enter', 'demand'].includes(off.boss.phase);

/** Gli oggetti dell'ufficio con un pulsante: si aggiungono a quelli dei compiti. */
export function addOfficeMap(map: GameValue): void {
  const o = off;
  if (!o) return;
  const item = (it: GameValue, kind: string) =>
    it && { kind, office: true, x: it.x, y: it.y, w: it.w, h: it.h, name: '', reach: 10 };
  if (o.cooler) map.off_cooler = item(o.cooler, 'cooler');
  if (o.printer && o.print && o.print.phase !== 'carried')
    map.off_printer = item(o.printer, 'printer');
  if (o.print?.phase === 'carried') {
    const c = o.colleagues[o.print.who];
    map.off_desk = {
      kind: 'printDesk',
      office: true,
      x: c.seat.x,
      y: c.seat.y,
      w: 20,
      h: 20,
      name: '',
    };
  }
  if (o.boss?.phase === 'demand') {
    if (o.shelf && !game.MG.carry) map.off_shelf = item(o.shelf, 'shelf');
    map.off_boss = {
      kind: 'boss',
      office: true,
      x: o.boss.x,
      y: o.boss.y,
      w: 20,
      h: 20,
      name: '',
      reach: 10,
    };
  }
}

/** A ogni fotogramma del turno: sete, stampe, capo e colleghi. */
export function tickOffice(delta: number): void {
  const o = off;
  if (!o) return;
  o.clock += delta;
  // sete
  o.thirst = thirstAfter(o.thirst, delta);
  if (o.thirst < THIRST_WARN && !o.warned) {
    o.warned = true;
    mgPop('💧 Bevi, ti stai disidratando!', false);
  }
  if (o.thirst <= 0) {
    o.slowUntil = o.clock + SLOW_SECONDS;
    o.thirst = 0.4;
    o.warned = false;
    mgScore(-0.5);
    sfx('error');
    mgPop('🥵 Disidratato: rallenti!', false);
  }
  // stampe
  if (!o.print && o.clock >= o.nextPrintAt && o.colleagues.length && !bossHere()) {
    o.print = { who: Math.floor(Math.random() * o.colleagues.length), phase: 'order', left: 0 };
    mgPop('🖨️ Un collega vuole una stampa');
  }
  if (o.print?.phase === 'printing') {
    o.print.left -= delta;
    if (o.print.left <= 0) {
      o.print.phase = 'ready';
      sfx('door');
      mgPop('📄 Foglio stampato');
    }
  }
  tickBoss(o, delta);
  const map = game.MG.map;
  for (const k of Object.keys(map)) if (k.startsWith('off_')) delete map[k];
  addOfficeMap(map);
}

function walkTo(p: { x: number; y: number }, to: Pt, speed: number, delta: number): boolean {
  const dx = to.x - p.x,
    dy = to.y - p.y,
    d = Math.hypot(dx, dy),
    move = speed * delta;
  if (d <= move) {
    p.x = to.x;
    p.y = to.y;
    return true;
  }
  p.x += (dx / d) * move;
  p.y += (dy / d) * move;
  return false;
}

function tickBoss(o: Office, delta: number): void {
  const b = o.boss;
  if (!b) return;
  const spot = { x: 0, y: 40 };
  if (b.phase === 'wait' && o.clock >= b.at) {
    b.phase = 'enter';
    sfx('error');
    shakeScreen(true);
    mgPop('😡 Arriva il capo!', false);
  } else if (b.phase === 'enter') {
    if (walkTo(b, spot, BOSS_SPEED, delta)) {
      b.phase = 'demand';
      b.timer = BOSS_LIMIT;
      shakeScreen(false);
      mgHud();
    }
  } else if (b.phase === 'demand') {
    const before = Math.ceil(b.timer);
    b.timer -= delta;
    if (Math.ceil(b.timer) !== before) mgHud();
    if (b.timer <= 0) {
      b.phase = 'leave';
      b.happy = false;
      mgScore(-1);
      sfx('error');
      mgPop('💢 Il capo se ne va furioso', false);
      if (game.MG.carry?.boss) game.MG.carry = null;
      mgHud();
    }
  } else if (b.phase === 'leave') {
    if (walkTo(b, { x: 0, y: game.Y1 - 10 }, BOSS_SPEED, delta)) {
      b.phase = 'done';
      mgHud();
    }
  }
  // colleghi: in panico mentre c'è il capo, poi tornano a sedersi
  const panic = bossHere();
  for (const c of o.colleagues) {
    if (panic) {
      c.ang += delta * 3.2;
      const target = {
        x: c.seat.x + Math.cos(c.ang) * 34,
        y: c.seat.y + 30 + Math.sin(c.ang) * 22,
      };
      const px = c.x,
        py = c.y;
      walkTo(c, target, 150, delta);
      if (Math.hypot(c.x - px, c.y - py) > 0.01) c.dir = { x: c.x - px, y: c.y - py };
    } else walkTo(c, c.seat, 90, delta);
  }
}

/** Lo schermo trema mentre il capo entra urlando. */
function shakeScreen(on: boolean): void {
  const canvas: HTMLCanvasElement | undefined = game.view.canvas;
  if (!canvas) return;
  canvas.classList.toggle('shake', on);
}

const carryOf = (id: string, e: string, label: string, extra: GameValue = {}) => ({
  id,
  e,
  label,
  ...extra,
});

/** Testo del pulsante vicino agli oggetti dell'ufficio. */
export function officePrompt(item: GameValue): { text: string; locked?: boolean } {
  const o = off;
  const c: GameValue = game.MG.carry;
  if (!o) return { text: '', locked: true };
  if (item.kind === 'cooler') return { text: '💧 Bevi un bicchiere d’acqua' };
  if (item.kind === 'printer') {
    const p = o.print;
    if (!p) return { text: '🖨️ Nessuno ha chiesto stampe', locked: true };
    if (p.phase === 'printing') return { text: '⏳ Sta stampando…', locked: true };
    if (p.phase === 'ready')
      return c
        ? { text: '🤲 Hai già le mani occupate', locked: true }
        : { text: '📄 Prendi il foglio' };
    return { text: `🖨️ Stampa per ${o.colleagues[p.who].name}` };
  }
  if (item.kind === 'printDesk')
    return { text: `📄 Dai il foglio a ${o.colleagues[o.print!.who].name}` };
  if (item.kind === 'shelf')
    return c
      ? { text: '🤲 Hai già le mani occupate', locked: true }
      : { text: '📂 Prendi la pratica per il capo' };
  if (item.kind === 'boss')
    return c?.boss
      ? { text: '📂 Dai la pratica al capo' }
      : { text: '😡 Il capo vuole la pratica (è nella libreria)', locked: true };
  return { text: '', locked: true };
}

/** Pulsante premuto vicino a un oggetto dell'ufficio. */
export function officeInteract(item: GameValue): void {
  const o = off;
  if (!o) return;
  const c: GameValue = game.MG.carry;
  const shift: GameValue = game.activeShift;
  const perItem: number = shift?.perItem ?? 0;
  if (item.kind === 'cooler') {
    o.thirst = 1;
    o.warned = false;
    o.slowUntil = 0;
    sfx('shower');
    mgPop('💧 Che sete! Ora va meglio');
  } else if (item.kind === 'printer' && o.print) {
    if (o.print.phase === 'order') {
      o.print.phase = 'printing';
      o.print.left = PRINT_SECONDS;
      sfx('door');
    } else if (o.print.phase === 'ready' && !c) {
      o.print.phase = 'carried';
      game.MG.carry = carryOf('foglio', '📄', 'Foglio', { office: true });
      sfx('door');
    }
  } else if (item.kind === 'printDesk' && c?.id === 'foglio') {
    game.MG.carry = null;
    o.print = null;
    o.nextPrintAt = o.clock + printGap(Math.random());
    if (shift) shift.delivered = (shift.delivered || 0) + 1;
    mgScore(1);
    sfx('coin');
    mgPop(`📄 Stampa consegnata +${perItem} €`);
  } else if (item.kind === 'shelf' && !c) {
    game.MG.carry = carryOf('praticaCapo', '📂', 'Pratica del capo', {
      office: true,
      boss: true,
    });
    sfx('door');
  } else if (item.kind === 'boss' && c?.boss && o.boss) {
    game.MG.carry = null;
    o.boss.phase = 'leave';
    o.boss.happy = true;
    const bonus = bossBonus(perItem);
    if (shift) shift.tips = (shift.tips || 0) + bonus;
    mgScore(1);
    sfx('coin');
    mgPop(`😌 Il capo si calma: bonus +${bonus} €`);
  }
  const map = game.MG.map;
  for (const k of Object.keys(map)) if (k.startsWith('off_')) delete map[k];
  addOfficeMap(map);
  mgHud();
}

/** Riga in più nel riquadro del turno, mentre c'è il capo. */
export function officeHudLine(): string {
  const b = off?.boss;
  if (b?.phase === 'demand')
    return `😡 Il capo vuole la pratica dalla libreria! ⏱ ${Math.max(0, Math.ceil(b.timer))}s`;
  return '';
}

// ---------------------------------------------------------------- disegno

const BOSS_LINES = [
  'CHI HA PERSO LA PRATICA?!',
  'VOGLIO LA PRATICA, SUBITO!',
  'MA CHE STATE FACENDO?!',
];

/** Colleghi, capo, goccia della sete e stampante: si aggiungono ai disegni della scena. */
export function officeDrawables(drawables: GameValue[], t: number): void {
  const o = off;
  if (!o) return;
  o.t = t;
  const panic = bossHere();
  o.colleagues.forEach((c, i) => {
    const seated = !panic && Math.hypot(c.x - c.seat.x, c.y - c.seat.y) < 1;
    drawables.push({
      depth: c.x + c.y,
      draw: () =>
        drawPlayerAvatar(c.x, c.y, c.name, t, botLook('Collega ' + c.name), !seated, '', {
          walkDir: seated ? { x: 0, y: -1 } : c.dir,
          pose: panic ? 'panic' : seated ? 'bench' : '',
          speed: panic ? 150 : 90,
        }),
    });
    if (panic)
      drawables.push({
        depth: 1e9 - 1,
        draw: () => bubble(c.x, c.y, 88, i % 2 ? '😱 AIUTO!' : '😱'),
      });
    else if (o.print && o.print.who === i && o.print.phase !== 'printing')
      drawables.push({
        depth: 1e9 - 1,
        draw: () => bubble(c.x, c.y, 80, o.print!.phase === 'carried' ? '📄 Qui!' : '🖨️'),
      });
  });
  const b = o.boss;
  if (b && b.phase !== 'wait' && b.phase !== 'done') {
    const dir = b.phase === 'leave' ? { x: 0, y: 1 } : { x: 0, y: -1 };
    drawables.push({
      depth: b.x + b.y,
      draw: () => {
        drawPlayerAvatar(b.x, b.y, 'Capo', t, BOSS_LOOK(), b.phase !== 'demand', '', {
          walkDir: b.phase === 'demand' ? { x: 0, y: 1 } : dir,
          speed: BOSS_SPEED,
        });
        // faccia rossa dalla rabbia
        if (!b.happy) {
          const ctx = game.view.ctx;
          const s = isoScale();
          const h = isoProject(b.x, b.y, 58);
          ctx.fillStyle = 'rgba(231,76,60,0.35)';
          ctx.beginPath();
          ctx.arc(h.x, h.y, 9 * s, 0, 6.3);
          ctx.fill();
        }
      },
    });
    const line = b.happy
      ? '😌 Bene, bene…'
      : '💢 ' + BOSS_LINES[Math.floor(t / 1.6) % BOSS_LINES.length];
    drawables.push({ depth: 1e9, draw: () => bubble(b.x, b.y, 96, line, !b.happy) });
  }
  // la goccia della sete sopra la propria testa, quando comincia a svuotarsi
  if (o.thirst < 0.6) {
    const px = game.playerPos.x,
      py = game.playerPos.y;
    drawables.push({ depth: 1e9 - 3, draw: () => drawDrop(px, py, o.thirst, t) });
  }
  if (o.printer && o.print && (o.print.phase === 'printing' || o.print.phase === 'ready')) {
    const p = o.printer,
      pr = o.print;
    drawables.push({
      depth: 1e9 - 2,
      draw: () => drawPrintState(p, pr.phase === 'printing' ? 1 - pr.left / PRINT_SECONDS : 1, t),
    });
  }
}

/** Fumetto sopra la testa; rosso per le urla del capo. */
function bubble(x: number, y: number, z: number, text: string, angry = false): void {
  const ctx = game.view.ctx;
  const s = isoScale();
  const p = isoProject(x, y, z);
  ctx.save();
  ctx.font = `bold ${Math.round((angry ? 11 : 12) * s)}px sans-serif`;
  const w = ctx.measureText(text).width + 14 * s,
    h = 20 * s;
  ctx.fillStyle = angry ? '#e74c3c' : 'rgba(255,255,255,0.95)';
  ctx.strokeStyle = 'rgba(0,0,0,0.25)';
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.roundRect
    ? ctx.roundRect(p.x - w / 2, p.y - h, w, h, 8 * s)
    : ctx.rect(p.x - w / 2, p.y - h, w, h);
  ctx.moveTo(p.x - 4 * s, p.y);
  ctx.lineTo(p.x, p.y + 5 * s);
  ctx.lineTo(p.x + 4 * s, p.y);
  ctx.fill();
  ctx.stroke();
  ctx.fillStyle = angry ? '#ffffff' : '#2d3436';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(text, p.x, p.y - h / 2 + 1);
  ctx.restore();
}

/** Goccia d'acqua che si svuota; sotto il 35% lampeggia. */
function drawDrop(x: number, y: number, level: number, t: number): void {
  const ctx = game.view.ctx;
  const s = isoScale();
  const p = isoProject(x, y, 100);
  const r = 7 * s;
  if (level < THIRST_WARN && Math.floor(t * 4) % 2) return;
  const shape = () => {
    ctx.beginPath();
    ctx.moveTo(p.x, p.y - r * 1.9);
    ctx.quadraticCurveTo(p.x + r * 1.1, p.y - r * 0.4, p.x + r, p.y + r * 0.2);
    ctx.arc(p.x, p.y + r * 0.2, r, 0, Math.PI);
    ctx.quadraticCurveTo(p.x - r * 1.1, p.y - r * 0.4, p.x, p.y - r * 1.9);
  };
  ctx.save();
  shape();
  ctx.fillStyle = 'rgba(255,255,255,0.9)';
  ctx.fill();
  ctx.clip();
  const top = p.y + r * 1.2 - level * r * 3.1;
  ctx.fillStyle = level < THIRST_WARN ? '#e17055' : '#0984e3';
  ctx.fillRect(p.x - r * 1.5, top, r * 3, r * 4);
  ctx.restore();
  shape();
  ctx.strokeStyle = 'rgba(0,0,0,0.4)';
  ctx.lineWidth = 1;
  ctx.stroke();
}

/** Sopra la stampante: il foglio che esce, col cerchio che si riempie; poi il foglio pronto. */
function drawPrintState(p: GameValue, k: number, t: number): void {
  const ctx = game.view.ctx;
  const s = isoScale();
  const bob = k >= 1 ? Math.sin(t * 5) * 2 : 0;
  const c = isoProject(p.x, p.y, (p.z || 38) + 26 + bob);
  ctx.save();
  ctx.fillStyle = 'rgba(255,255,255,0.92)';
  ctx.beginPath();
  ctx.arc(c.x, c.y, 13 * s, 0, 6.3);
  ctx.fill();
  ctx.strokeStyle = k >= 1 ? '#2ecc71' : '#0984e3';
  ctx.lineWidth = 3 * s;
  ctx.beginPath();
  ctx.arc(c.x, c.y, 13 * s, -Math.PI / 2, -Math.PI / 2 + k * Math.PI * 2);
  ctx.stroke();
  ctx.font = `${Math.round(16 * s)}px serif`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillStyle = '#000';
  ctx.fillText('📄', c.x, c.y + 1);
  ctx.restore();
}
