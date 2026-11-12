import type { WorkHost } from './work-model.js';
// Turno in ufficio, oltre ai compiti da prendere e consegnare: la goccia della sete (si beve al
// distributore), le stampe chieste dai colleghi, in parallelo ai compiti, e ogni tanto la visita del
// capo. Il capo esce dalla sua stanza con due assistenti in panico, tutto si ferma per un attimo e
// poi chiede, una alla volta e con poco tempo, cose che ci sono nella stanza o un foglio stampato.
// Le regole stanno in office-rules.ts.
import type { GameValue } from './context.js';
import { game } from './context.js';
import { sfx } from './audio.js';
import { botLook, parseLook, resolveLook } from './character.js';
import { drawPlayerAvatar } from './render/avatars.js';
import { isoProject, isoScale } from './render/primitives.js';
import {
  BOSS_FREEZE,
  BOSS_SPEED,
  type BossRequest,
  PRINT_SECONDS,
  SLOW_FACTOR,
  SLOW_SECONDS,
  THIRST_WARN,
  bossBonus,
  bossFine,
  bossPlan,
  bossRequestSeconds,
  bossRequests,
  printGap,
  thirstAfter,
} from './office-rules.js';

type Pt = { x: number; y: number };
type PrintPhase = 'order' | 'printing' | 'ready' | 'carried';

interface Runner {
  name: string;
  x: number;
  y: number;
  dir: Pt;
  /** angolo del giro in tondo quando scappa dal capo */
  ang: number;
}

interface Colleague extends Runner {
  seat: Pt;
}

interface Boss {
  at: number;
  phase: 'wait' | 'freeze' | 'enter' | 'demand' | 'leave' | 'done';
  x: number;
  y: number;
  /** secondi che restano: della pausa iniziale o della richiesta di adesso */
  timer: number;
  total: number;
  reqs: BossRequest[];
  idx: number;
  ok: number;
  /** i due assistenti che escono con lui e corrono con le braccia alzate */
  followers: Runner[];
  /** il foglio che ha chiesto lui (le stampe dei colleghi intanto aspettano) */
  print: { phase: PrintPhase; left: number } | null;
}

interface Office {
  clock: number;
  thirst: number;
  warned: boolean;
  slowUntil: number;
  colleagues: Colleague[];
  cooler: GameValue;
  printer: GameValue;
  /** la porta della stanza del capo (chiusa: ci passa solo lui) */
  door: GameValue;
  /** stampa chiesta da un collega: `who` è il collega, `left` i secondi che mancano al foglio */
  print: { who: number; phase: PrintPhase; left: number } | null;
  nextPrintAt: number;
  boss: Boss | null;
  t: number;
}

let off: Office | null = null;

const BOSS_LOOK = (): GameValue => resolveLook(parseLook('item_suit,pants_black,shoes_formal'));
/** Dove si mette il capo per sbraitare: al centro, davanti alle scrivanie. */
const BOSS_SPOT = { x: 40, y: -30 };

export const officeOn = (): boolean => !!off;

/** Appena davanti alla porta del capo, dentro l'ufficio. */
const doorFront = (o: Office): Pt => ({ x: o.door ? o.door.x : 0, y: game.Y0 + 22 });

let host: WorkHost;

export function startOffice(controller: WorkHost): void {
  host = controller;
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
    door: props.find((p) => p.kind === 'wallEntrance' && p.door === 'office:boss'),
    print: null,
    nextPrintAt: 6,
    boss: null,
    t: 0,
  };
  if (plan.comes) {
    const d = doorFront(off);
    off.boss = {
      at: plan.at,
      phase: 'wait',
      x: d.x,
      y: d.y,
      timer: 0,
      total: 0,
      reqs: [],
      idx: 0,
      ok: 0,
      followers: ['Segretaria', 'Vice'].map((name, i) => ({
        name,
        x: d.x + (i ? 16 : -16),
        y: d.y - 6,
        dir: { x: 0, y: 1 },
        ang: i * 3.1,
      })),
      print: null,
    };
  }
}

export function stopOffice(): void {
  off = null;
  shakeScreen(false);
}

/** Più lenti mentre si è disidratati. */
export function officeSpeed(): number {
  return off && off.clock < off.slowUntil ? SLOW_FACTOR : 1;
}

/** Il capo è in ufficio (dalla pausa iniziale finché non ha finito di chiedere). */
const bossHere = (): boolean =>
  !!off?.boss && ['freeze', 'enter', 'demand'].includes(off.boss.phase);
export const officeBossActive = bossHere;
/** I primi secondi della visita: si ferma tutto, così il giocatore lo nota. */
export const officeFrozen = (): boolean => off?.boss?.phase === 'freeze';
/** Quanto tempo resta per la richiesta di adesso (da 1 a 0), per la barra rossa; null senza capo. */
export function officeBossBar(): number | null {
  const b = off?.boss;
  return b?.phase === 'demand' && b.total > 0 ? Math.max(0, b.timer / b.total) : null;
}

const currentRequest = (): BossRequest | null => {
  const b = off?.boss;
  return b?.phase === 'demand' ? b.reqs[b.idx] || null : null;
};

/** Emoji e nome di una richiesta del capo. */
function requestLabel(req: BossRequest): { e: string; label: string } {
  if (req.kind === 'print') return { e: '🖨️', label: 'Documento da stampare' };
  const def = game.MG.cfg?.pool?.[req.id];
  return def ? { e: def[0], label: def[1] } : { e: '❓', label: req.id };
}

/** La stampa in corso adesso: quella del capo se l'ha chiesta, se no quella del collega. */
const activePrint = (o: Office) =>
  bossHere() ? (currentRequest()?.kind === 'print' ? o.boss!.print : null) : o.print;

/** Gli oggetti dell'ufficio con un pulsante: si aggiungono a quelli dei compiti. */
export function addOfficeMap(map: GameValue): void {
  const o = off;
  if (!o) return;
  const item = (it: GameValue, kind: string, reach = 10) =>
    it && { kind, office: true, x: it.x, y: it.y, w: it.w, h: it.h, name: '', reach };
  const pr = activePrint(o);
  // la stampante ha il pulsante solo se qualcuno ha chiesto un foglio
  if (o.printer && pr && pr.phase !== 'carried') map.off_printer = item(o.printer, 'printer');
  if (bossHere()) {
    if (o.boss!.phase === 'demand') map.off_boss = item({ ...o.boss!, w: 20, h: 20 }, 'boss', 14);
    return;
  }
  if (o.cooler) map.off_cooler = item(o.cooler, 'cooler');
  if (o.print?.phase === 'carried') {
    // il foglio si dà al collega dov'è adesso
    const c = o.colleagues[o.print.who];
    map.off_desk = item({ x: c.x, y: c.y, w: 20, h: 20 }, 'printDesk', 16);
  }
}

function refreshMap(): void {
  const map = game.MG.map;
  for (const k of Object.keys(map)) if (k.startsWith('off_')) delete map[k];
  addOfficeMap(map);
}

/** Un foglio in mano senza nessuno che lo aspetti si butta: non deve restare in mano per sempre. */
function dropStraySheet(o: Office): void {
  if (game.MG.carry?.id !== 'foglio') return;
  const waited = o.print?.phase === 'carried' || o.boss?.print?.phase === 'carried';
  if (!waited) game.MG.carry = null;
}

function tickPrint(p: { phase: PrintPhase; left: number } | null, delta: number): void {
  if (p?.phase !== 'printing') return;
  p.left -= delta;
  if (p.left > 0) return;
  p.phase = 'ready';
  sfx('door');
  host.pop('📄 Documento stampato: prendilo e portalo');
  host.hud();
}

/** A ogni fotogramma del turno: sete, stampe, capo e colleghi. */
export function tickOffice(delta: number): void {
  const o = off;
  if (!o) return;
  o.clock += delta;
  const boss = bossHere();
  // sete (ferma mentre c'è il capo: si pensa solo a lui)
  if (!boss) o.thirst = thirstAfter(o.thirst, delta);
  if (o.thirst < THIRST_WARN && !o.warned) {
    o.warned = true;
    host.pop('💧 Bevi, ti stai disidratando!', false);
  }
  if (o.thirst <= 0) {
    o.slowUntil = o.clock + SLOW_SECONDS;
    o.thirst = 0.4;
    o.warned = false;
    host.score(-0.5);
    sfx('error');
    host.pop('🥵 Disidratato: rallenti!', false);
  }
  // stampe dei colleghi, in parallelo ai compiti (non mentre c'è il capo)
  if (!boss) {
    if (!o.print && o.clock >= o.nextPrintAt && o.colleagues.length) {
      o.print = { who: Math.floor(Math.random() * o.colleagues.length), phase: 'order', left: 0 };
      host.pop('🖨️ Un collega: «Stampami il documento e portamelo»');
    }
    tickPrint(o.print, delta);
  } else tickPrint(o.boss?.print ?? null, delta);
  tickBoss(o, delta);
  dropStraySheet(o);
  refreshMap();
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

/** La porta del capo si apre mentre lui (e chi lo segue) passa. */
function openBossDoor(): void {
  game.doorForce['office:boss'] = performance.now() + 700;
}

/** Il capo passa alla richiesta dopo; finite le richieste se ne torna nella sua stanza. */
function nextRequest(o: Office, b: Boss): void {
  b.idx++;
  // se vuole un foglio, la stampante si attiva per lui
  b.print = b.reqs[b.idx]?.kind === 'print' ? { phase: 'order', left: 0 } : null;
  if (game.MG.carry?.office) game.MG.carry = null;
  const req = b.reqs[b.idx];
  if (req) {
    b.timer = b.total = bossRequestSeconds(req);
    const { e, label } = requestLabel(req);
    host.pop(`😡 Ora vuole: ${e} ${label}`, false);
  } else {
    b.phase = 'leave';
    if (b.ok === b.reqs.length) {
      const shift = game.activeShift;
      const bonus = bossBonus(shift?.perItem ?? 0);
      if (shift) shift.tips = (shift.tips || 0) + bonus;
      host.pop(`😌 Il capo è soddisfatto: bonus +${bonus} Đ`);
    } else {
      const shift = game.activeShift;
      const fine = bossFine(shift?.perItem ?? 0);
      if (shift) shift.fine = (shift.fine || 0) + fine;
      host.pop(`💢 Il capo se ne va scontento: multa −${fine} Đ`, false);
    }
  }
  host.hud();
  void o;
}

function tickBoss(o: Office, delta: number): void {
  const b = o.boss;
  if (!b) return;
  if (b.phase === 'wait' && o.clock >= b.at) {
    // esce dalla sua stanza: tutto si ferma per un attimo
    b.phase = 'freeze';
    b.timer = BOSS_FREEZE;
    openBossDoor();
    sfx('error');
    shakeScreen(true);
    host.hud();
  } else if (b.phase === 'freeze') {
    openBossDoor();
    b.timer -= delta;
    if (b.timer <= 0) {
      b.phase = 'enter';
      shakeScreen(false);
    }
  } else if (b.phase === 'enter') {
    if (walkTo(b, BOSS_SPOT, BOSS_SPEED, delta)) {
      // chiede le cose che ci sono nella stanza (gli oggetti a terra) o un foglio stampato
      const ids = [
        ...new Set(
          (Object.values(game.MG.map) as GameValue[])
            .filter((it) => it.kind === 'pickup')
            .map((it) => it.item.id as string),
        ),
      ];
      b.reqs = bossRequests(ids, Math.random);
      b.idx = -1;
      b.phase = 'demand';
      nextRequest(o, b);
    }
  } else if (b.phase === 'demand') {
    // aspettando cammina avanti e indietro, sbraitando
    b.x = BOSS_SPOT.x + Math.sin(o.clock * 0.9) * 45;
    const before = Math.ceil(b.timer);
    b.timer -= delta;
    if (Math.ceil(b.timer) !== before) host.hud();
    if (b.timer <= 0) {
      host.score(-0.5);
      sfx('error');
      host.pop('💢 Troppo lento!', false);
      nextRequest(o, b);
    }
  } else if (b.phase === 'leave') {
    const home = doorFront(o);
    const back = walkTo(b, home, BOSS_SPEED, delta);
    b.followers.forEach((f, i) => walkTo(f, { x: home.x + (i ? 16 : -16), y: home.y }, 130, delta));
    if (Math.hypot(b.x - home.x, b.y - home.y) < 30) openBossDoor();
    if (back) {
      b.phase = 'done';
      openBossDoor();
      // si riprende con un compito nuovo: alcuni oggetti li ha voluti il capo
      host.spawnTask();
    }
  }
  // colleghi e assistenti: in panico mentre c'è il capo, poi i colleghi tornano a sedersi
  const panic = bossHere() && b.phase !== 'freeze';
  const run = (r: Runner, center: Pt) => {
    r.ang += delta * 3.2;
    const target = { x: center.x + Math.cos(r.ang) * 34, y: center.y + 30 + Math.sin(r.ang) * 22 };
    const px = r.x,
      py = r.y;
    walkTo(r, target, 150, delta);
    if (Math.hypot(r.x - px, r.y - py) > 0.01) r.dir = { x: r.x - px, y: r.y - py };
  };
  for (const c of o.colleagues) {
    if (panic) run(c, c.seat);
    else walkTo(c, c.seat, 90, delta);
  }
  if (panic) for (const f of b.followers) run(f, b);
}

/** Lo schermo trema mentre il capo esce urlando. */
function shakeScreen(on: boolean): void {
  const canvas: HTMLCanvasElement | undefined = game.view.canvas;
  if (!canvas) return;
  canvas.classList.toggle('shake', on);
}

/** Testo del pulsante vicino agli oggetti dell'ufficio. */
export function officePrompt(item: GameValue): { text: string; locked?: boolean } {
  const o = off;
  const c = game.MG.carry;
  if (!o) return { text: '', locked: true };
  if (item.kind === 'cooler') return { text: 'Bevi' };
  if (item.kind === 'printer') {
    const p = activePrint(o);
    if (!p) return { text: 'Nessuna stampa', locked: true };
    if (p.phase === 'printing') return { text: 'In stampa', locked: true };
    if (p.phase === 'ready')
      return c ? { text: 'Mani occupate', locked: true } : { text: 'Prendi' };
    return { text: 'Stampa' };
  }
  if (item.kind === 'printDesk') return { text: 'Consegna' };
  if (item.kind === 'boss') {
    const req = currentRequest();
    if (!req) return { text: '', locked: true };
    const ok = req.kind === 'print' ? c?.id === 'foglio' : c?.id === req.id;
    return ok ? { text: 'Consegna' } : { text: 'Prima l’oggetto', locked: true };
  }
  return { text: '', locked: true };
}

/** Pulsante premuto vicino a un oggetto dell'ufficio. */
export function officeInteract(item: GameValue): void {
  const o = off;
  if (!o || officeFrozen()) return;
  const c = game.MG.carry;
  const shift = game.activeShift;
  const perItem: number = shift?.perItem ?? 0;
  if (item.kind === 'cooler') {
    o.thirst = 1;
    o.warned = false;
    o.slowUntil = 0;
    sfx('shower');
    host.pop('💧 Che sete! Ora va meglio');
  } else if (item.kind === 'printer') {
    const p = activePrint(o);
    if (p?.phase === 'order') {
      p.phase = 'printing';
      p.left = PRINT_SECONDS;
      sfx('door');
    } else if (p?.phase === 'ready' && !c) {
      // il foglio si prende solo se qualcuno l'ha chiesto (vedi activePrint)
      p.phase = 'carried';
      game.MG.carry = { id: 'foglio', e: '📄', label: 'Documento stampato', office: true };
      sfx('door');
    }
  } else if (item.kind === 'printDesk' && c?.id === 'foglio' && o.print) {
    game.MG.carry = null;
    o.print = null;
    o.nextPrintAt = o.clock + printGap(Math.random());
    if (shift) shift.delivered = (shift.delivered || 0) + 1;
    host.score(1);
    sfx('coin');
    host.pop(`📄 Stampa consegnata +${perItem} Đ`);
  } else if (item.kind === 'boss' && o.boss) {
    const req = currentRequest();
    const ok = req && (req.kind === 'print' ? c?.id === 'foglio' : c?.id === req.id);
    if (!ok) return;
    game.MG.carry = null;
    o.boss.ok++;
    if (shift) shift.delivered = (shift.delivered || 0) + 1;
    host.score(1);
    sfx('coin');
    host.pop(`😤 Il capo prende: +${perItem} Đ`);
    nextRequest(o, o.boss);
  }
  refreshMap();
  host.hud();
}

/** Il riquadro del turno mentre c'è il capo: al posto del compito di adesso. */
export function officeHud(): string {
  const b = off?.boss;
  if (!b || !bossHere()) return '';
  const req = currentRequest();
  if (!req) return `<div class="mg-step mg-boss">😡 Arriva il capo!</div>`;
  const { e, label } = requestLabel(req);
  const how = req.kind === 'print' ? 'stampalo e portaglielo' : 'è nella stanza: portaglielo';
  return (
    `<div class="mg-step mg-boss">😡 Il capo vuole: ${e} ${label} ⏱ ${Math.max(0, Math.ceil(b.timer))}s</div>` +
    `<div class="mg-sub">${b.idx + 1} di ${b.reqs.length} · ${how}</div>`
  );
}

// ---------------------------------------------------------------- disegno

const BOSS_LINES = ['CHI HA PERSO LA PRATICA?!', 'MA CHE STATE FACENDO?!', 'LO VOGLIO, SUBITO!'];

/** Colleghi, capo e assistenti, goccia della sete e stampante: si aggiungono ai disegni della scena. */
export function officeDrawables(drawables: GameValue[], t: number): void {
  const o = off;
  if (!o) return;
  o.t = t;
  const panic = bossHere() && o.boss!.phase !== 'freeze';
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
    // gli assistenti: con le braccia alzate appena fuori dalla porta, poi in tondo attorno al capo
    for (const f of b.followers)
      drawables.push({
        depth: f.x + f.y,
        draw: () =>
          drawPlayerAvatar(
            f.x,
            f.y,
            f.name,
            t,
            botLook('Assistente ' + f.name),
            b.phase !== 'freeze',
            '',
            {
              walkDir: f.dir,
              pose: b.phase === 'leave' ? '' : 'panic',
              speed: 150,
            },
          ),
      });
    const walking = b.phase === 'enter' || b.phase === 'leave' || b.phase === 'demand';
    const dir =
      b.phase === 'leave'
        ? { x: 0, y: -1 }
        : b.phase === 'demand'
          ? { x: Math.cos(o.clock * 0.9), y: 0.3 }
          : { x: 0, y: 1 };
    drawables.push({
      depth: b.x + b.y,
      draw: () => {
        drawPlayerAvatar(b.x, b.y, 'Capo', t, BOSS_LOOK(), walking, '', {
          walkDir: dir,
          speed: BOSS_SPEED,
        });
        // faccia rossa dalla rabbia
        const ctx = game.view.ctx;
        const s = isoScale();
        const h = isoProject(b.x, b.y, 58);
        ctx.fillStyle = 'rgba(231,76,60,0.35)';
        ctx.beginPath();
        ctx.arc(h.x, h.y, 9 * s, 0, 6.3);
        ctx.fill();
      },
    });
    const req = currentRequest();
    const line = req
      ? `💢 ${requestLabel(req).e} ${BOSS_LINES[Math.floor(t / 1.6) % BOSS_LINES.length]}`
      : b.phase === 'leave'
        ? '😤 Hmpf.'
        : '💢 CHE SUCCEDE QUI?!';
    drawables.push({ depth: 1e9, draw: () => bubble(b.x, b.y, 96, line, b.phase !== 'leave') });
    if (b.phase !== 'leave')
      for (const f of b.followers)
        drawables.push({ depth: 1e9 - 1, draw: () => bubble(f.x, f.y, 88, '😱') });
  }
  // la goccia della sete sopra la propria testa, quando comincia a svuotarsi
  if (o.thirst < 0.6) {
    const px = game.playerPos.x,
      py = game.playerPos.y;
    drawables.push({ depth: 1e9 - 3, draw: () => drawDrop(px, py, o.thirst, t) });
  }
  const pr = activePrint(o);
  if (o.printer && pr && (pr.phase === 'printing' || pr.phase === 'ready')) {
    const p = o.printer;
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
