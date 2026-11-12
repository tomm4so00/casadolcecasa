import { notePersonality } from './personality.js';
import { countUse } from './usage.js';
import { creditMoney } from './economy.js';
import type { GameValue } from './context.js';
import { game } from './context.js';
import { dom, lifetime } from './runtime.js';

let workStartLeft = 0;
export const mgStarting = (): boolean => workStartLeft > 0;
import { collidesAt, getSolidObstacles } from './engine.js';
import { toast } from './missions.js';
import { sfx } from './audio.js';
import { isoProject, isoScale } from './render/primitives.js';
import { ellipseShadow } from './render/objects.js';
import { drawBeamTarget, drawPanelTarget } from './render/construction.js';
import { openDialog } from './interface.js';
import { nextPayMessage, shiftsLeftToday } from './job-pay.js';
import { claimServerPay, flushPendingPay } from './job-server.js';
import { applyRoomBounds } from './room-size.js';
import { type Prop, hiddenBehind } from './work-spawn-rules.js';
import type { WorkHost } from './work-model.js';
import {
  serviceDrawables,
  serviceHudLine,
  serviceInteract,
  serviceOn,
  servicePrompt,
  startService,
  stopService,
  tickService,
} from './restaurant.js';
import {
  addOfficeMap,
  officeBossActive,
  officeBossBar,
  officeDrawables,
  officeFrozen,
  officeHud,
  officeInteract,
  officeOn,
  officePrompt,
  startOffice,
  stopOffice,
  tickOffice,
} from './office.js';
import {
  hospitalDrawables,
  hospitalHud,
  hospitalInteract,
  hospitalOn,
  hospitalPrompt,
  startHospital,
  stopHospital,
  tickHospital,
} from './hospital.js';
export function mgFlash(ok = false): void {
  if (!game.MG.el) return;
  game.MG.el.classList.remove('mg-flash-ok', 'mg-flash-ko');
  void game.MG.el.offsetWidth;
  game.MG.el.classList.add(ok ? 'mg-flash-ok' : 'mg-flash-ko');
}

export function mgScore(delta = 0): void {
  game.MG.score = Math.max(0, game.MG.score + delta);
  mgFlash(delta > 0);
}

/** Scritta breve che sale dal riquadro del lavoro e sparisce: al posto dei messaggi in alto. */
export function mgPop(text: string, ok = true): void {
  const el = game.MG.el;
  if (!el) return;
  const p = document.createElement('div');
  p.className = 'mg-pop ' + (ok ? 'ok' : 'ko');
  p.textContent = text;
  p.addEventListener('animationend', () => p.remove());
  el.appendChild(p);
}

export function mgRating(): number {
  return Math.max(0, Math.min(1, game.MG.score / game.MG.target));
}

export function mgMultiplier(r = 0): number {
  // Bonus prestazione (×1,2 dal 50%, ×1,4 dal 75%): disattivato con SKILL_PAY = false.
  return !game.SKILL_PAY ? 1 : r < 0.5 ? 1 : r < 0.75 ? 1.2 : 1.4;
}

export function mgHud(..._args: GameValue[]): GameValue {
  const el: GameValue = game.MG.el;
  if (!el || !game.MG.active) return;
  if (serviceOn()) {
    el.innerHTML = MG_TOP + `<div class="mg-step">${serviceHudLine()}</div>`;
    mgShiftHud();
    return;
  }
  // in ospedale: cosa chiede ciascuno dei due pazienti
  if (hospitalOn()) {
    el.innerHTML = MG_TOP + hospitalHud();
    mgShiftHud();
    return;
  }
  // in ufficio, mentre c'è il capo, nel riquadro c'è solo lui
  if (officeOn() && officeBossActive()) {
    el.innerHTML = MG_TOP + officeHud();
    mgShiftHud();
    return;
  }
  const { cfg, task, stepIdx, carry } = game.MG;
  if (!cfg || !task) return;
  const st: GameValue = task.steps[stepIdx];
  const [e, label] = cfg.pool[st.item];
  const target: GameValue = cfg.targets.find((t: GameValue) => t.id === st.target);
  const held = carry?.id === st.item;
  // un pallino per passo: pieno se fatto, acceso se è quello di adesso
  const dots = task.steps
    .map(
      (_: GameValue, i: number) =>
        `<i class="${i < stepIdx ? 'done' : i === stepIdx ? 'now' : ''}"></i>`,
    )
    .join('');
  // la spiegazione serve solo ai primi turni; dopo resta solo se in mano c'è l'oggetto sbagliato
  const sub =
    carry && !held
      ? `🤲 ${carry.e} non serve qui: scambialo`
      : (game.player.stats.shifts || 0) < 3 && !carry
        ? "Prendi l'oggetto e portalo al cerchio giallo"
        : '';
  el.innerHTML =
    MG_TOP +
    `<div class="mg-step"><span class="${held ? 'held' : ''}">${held ? '🤲 ' : ''}${e} ${label}</span> → 🎯 ${target?.label ?? ''}<span class="mg-dots">${dots}</span></div>` +
    (sub ? `<div class="mg-sub">${sub}</div>` : '');
  mgShiftHud();
}

/** Tempo e paga in cima al riquadro del lavoro. */
const MG_TOP = `<div class="mg-top"><span id="mg-time"></span><div class="mg-bar"><div id="mg-fill"></div></div><span id="mg-pay"></span></div>`;

/** Tempo e paga del turno nel riquadro del lavoro (a ogni fotogramma). */
function mgShiftHud(): void {
  const s = game.activeShift;
  const time = dom('mg-time');
  if (!s || !time) return;
  time.textContent = `⏱ ${Math.ceil(Math.max(0, s.remaining))}s`;
  // con il capo la barra diventa rossa e conta il tempo della sua richiesta
  const boss = officeOn() ? officeBossBar() : null;
  const fill = dom('mg-fill');
  fill.classList.toggle('boss', boss !== null);
  fill.style.width = Math.max(0, (boss ?? s.remaining / game.SHIFT_SECONDS) * 100) + '%';
  dom('mg-pay').textContent =
    `💰 ${Math.max(0, s.pay + (s.delivered || 0) * (s.perItem || 0) + (s.tips || 0) - (s.fine || 0))} Đ`;
}

export function mgSpawnTask(..._args: GameValue[]): GameValue {
  // il turno parte appena cambiato ambiente: i bordi sono ancora quelli del posto da cui si arriva
  applyRoomBounds(game.view.activeEnvironment);
  const cfg = game.MG.cfg;
  if (!cfg || !cfg.tasks.length) return;
  let ti: GameValue;
  do {
    ti = Math.floor(Math.random() * cfg.tasks.length);
  } while (ti === game.MG.lastTask && cfg.tasks.length > 1);
  game.MG.lastTask = ti;
  game.MG.task = cfg.tasks[ti];
  game.MG.stepIdx = 0;
  game.MG.carry = null;
  const need = cfg.tasks[ti].steps.map((s) => s.item);
  const decoys: GameValue = Object.keys(cfg.pool)
    .filter((k?: GameValue): GameValue => !need.includes(k))
    .sort((): GameValue => Math.random() - 0.5)
    .slice(0, 3);
  const obstacles: GameValue = getSolidObstacles();
  // i mobili alti che possono nascondere un oggetto messo dietro (le scrivanie col monitor sopra)
  const tall: Prop[] = ((game.ENV_PROPS[game.view.activeEnvironment] || []) as GameValue[]).map(
    (p: GameValue) => ({
      x: p.x,
      y: p.y,
      w: p.w,
      h: p.h,
      z: p.kind === 'officeDesk' ? (p.z || 40) + 45 : p.z,
    }),
  );
  const placed: GameValue = [];
  game.MG.map = {};
  cfg.targets.forEach((t?: GameValue): GameValue => {
    game.MG.map['tg_' + t.id] = {
      kind: 'target',
      id: t.id,
      label: t.label,
      name: t.label,
      x: t.x,
      y: t.y,
      w: t.w,
      h: t.h,
    };
  });
  need
    .concat(decoys)
    .sort((): GameValue => Math.random() - 0.5)
    .forEach((id?: GameValue, i?: GameValue): GameValue => {
      let x: GameValue = 0,
        y: GameValue = 0,
        ok: GameValue = false;
      for (let n: GameValue = 0; n < 300 && !ok; n++) {
        x = game.X0 + 50 + Math.random() * (game.X1 - game.X0 - 100);
        y = game.Y0 + 75 + Math.random() * (game.Y1 - game.Y0 - 130);
        ok =
          !collidesAt(x, y, obstacles) &&
          Math.hypot(x - game.playerPos.x, y - game.playerPos.y) > 45 &&
          placed.every((p?: GameValue): GameValue => Math.hypot(x - p.x, y - p.y) > 55) &&
          cfg.targets.every((t?: GameValue): GameValue => Math.hypot(x - t.x, y - t.y) > 75) &&
          !hiddenBehind(x, y, tall);
      }
      const def: GameValue = cfg.pool[id],
        o: GameValue = {
          kind: 'pickup',
          x,
          y,
          w: 16,
          h: 16,
          name: def[1],
          item: { id, e: def[0], label: def[1] },
        };
      placed.push(o);
      game.MG.map['it' + i] = o;
    });
  // in ufficio anche distributore, stampante e capo hanno il loro pulsante
  addOfficeMap(game.MG.map);
  mgHud();
}

export function mgStart(jobKey?: GameValue): GameValue {
  mgStop();
  if (!game.WORK_JOBS[jobKey]) return;
  const el = document.getElementById('minigame');
  if (!el) return;
  game.MG.el = el;
  game.MG.active = true;
  game.MG.job = jobKey;
  game.MG.cfg = game.WORK_JOBS[jobKey];
  game.MG.score = 0;
  game.MG.lastTask = -1;
  el.classList.remove('hidden');
  el.classList.toggle('mg-office', jobKey === 'ufficio');
  // ufficio e ristorante: il riquadro in alto e il tasto tondo in basso, sotto il pollice
  el.classList.toggle('mg-rest', jobKey === 'ristorante');
  dom('pop-interaction').classList.toggle('work-interact', roundButtonJob(jobKey));
  {
    workStartLeft = 1.5;
    const intro = document.createElement('div');
    intro.id = 'work-start';
    intro.setAttribute('role', 'status');
    intro.textContent = 'Pronti…';
    el.insertAdjacentElement('afterend', intro);
  }
  // durante il turno il ritorno a casa è un'icona in un angolo, lontana dal riquadro
  dom('btn-return-home').classList.add('compact');
  // il ristorante ha il servizio ai tavoli, gli altri lavori i compiti da portare al cerchio
  const host: WorkHost = {
    hud: mgHud,
    pop: mgPop,
    score: mgScore,
    spawnTask: mgSpawnTask,
    starting: mgStarting,
  };
  if (game.MG.cfg.mode === 'service') startService(host);
  // l'ospedale ha i due pazienti a letto e le postazioni fisse
  else if (game.MG.cfg.mode === 'hospital') {
    applyRoomBounds(game.view.activeEnvironment);
    startHospital(host);
  } else {
    // l'ufficio ha in più sete, stampe e la visita del capo
    if (jobKey === 'ufficio') startOffice(host);
    mgSpawnTask();
  }
}

export function mgStop(..._args: GameValue[]): GameValue {
  workStartLeft = 0;
  dom('work-start')?.remove();
  dom('pop-interaction')?.classList.remove('work-interact');
  stopService();
  stopOffice();
  stopHospital();
  game.MG.active = false;
  game.MG.map = {};
  game.MG.carry = null;
  dom('btn-return-home')?.classList.remove('compact');
  const el: GameValue = dom('minigame');
  if (el) {
    el.classList.remove('mg-office');
    el.classList.add('hidden');
    el.innerHTML = '';
  }
}

export function mgTick(delta: number): void {
  tickService(delta);
  tickOffice(delta);
  tickHospital(delta);
}

/** I lavori con il tasto tondo grande in basso al posto del pulsante normale. */
const roundButtonJob = (jobKey: string): boolean => jobKey === 'ufficio' || jobKey === 'ristorante';

/** Le postazioni del ristorante e degli uffici, con l'icona del loro tasto. */
const STATION_ICON: Record<string, string> = {
  sink: '🚰',
  stove: '🍝',
  oven: '🍕',
  cellar: '🍷',
  dessert: '🍰',
  counter: '☕',
};
const OFFICE_ICON: Record<string, string> = {
  cooler: '💧',
  printer: '🖨️',
  printDesk: '📄',
  boss: '👔',
};

/**
 * L'icona del tasto tondo vicino a un oggetto del lavoro, o '' se il lavoro usa il pulsante
 * normale. Con qualcosa in mano, al tavolo o al bersaglio si vede quello che si porta.
 */
/** Quello che serve a scegliere l'icona: l'oggetto vicino e quello che si ha in mano. */
interface IconTarget {
  kind?: string;
  station?: string;
  office?: boolean;
  item?: { e?: string };
}

export function mgButtonIcon(item?: IconTarget): string {
  if (!game.MG.active || !roundButtonJob(game.MG.job) || !item) return '';
  const carry: { id?: string; e?: string } | null = game.MG.carry;
  if (item.kind === 'station') {
    if (carry?.id === 'water' && item.station === 'stove') return '🔥';
    return STATION_ICON[item.station || ''] || '✋';
  }
  if (item.kind === 'table') return carry?.e || '🍽️';
  if (item.office) return OFFICE_ICON[item.kind || ''] || carry?.e || '✋';
  if (item.kind === 'pickup') return item.item?.e || '✋';
  if (item.kind === 'target') return carry?.e || '🎯';
  return '✋';
}

export function mgButtonText(item?: GameValue): GameValue {
  if (serviceOn()) return servicePrompt(item).text;
  if (hospitalOn()) return hospitalPrompt(item).text;
  if (officeOn() && officeFrozen()) return 'Aspetta';
  if (item.office) return officePrompt(item).text;
  if (officeOn() && officeBossActive() && item.kind === 'target') return 'Prima il capo';
  if (item.kind === 'pickup') return game.MG.carry ? 'Scambia' : 'Prendi';
  return game.MG.carry ? 'Consegna' : 'Prima prendi';
}

/** Una consegna valida viene prima degli oggetti da raccogliere o scambiare. */
export function mgCanDeliver(item: GameValue): boolean {
  if (!game.MG.active || workStartLeft > 0) return false;
  const carry = game.MG.carry;
  if (!carry) return false;
  if (serviceOn())
    return (
      (item.kind !== 'station' || (carry.id === 'water' && item.station === 'stove')) &&
      !servicePrompt(item).locked
    );
  if (hospitalOn()) return false;
  if (officeOn()) {
    if (officeFrozen()) return false;
    if (item.office) {
      if (item.kind === 'boss') return !officePrompt(item).locked;
      return item.kind === 'printDesk' && carry.id === 'foglio';
    }
    if (officeBossActive() || carry.office) return false;
  }
  const step = game.MG.task?.steps[game.MG.stepIdx];
  return item.kind === 'target' && carry.id === step?.item && item.id === step?.target;
}

export function mgInteract(item?: GameValue, key?: GameValue): GameValue {
  if (!game.MG.active) return;
  if (workStartLeft > 0) return;
  if (serviceOn()) return serviceInteract(item);
  if (hospitalOn()) return void hospitalInteract(item);
  // appena arriva il capo tutto si ferma per un attimo
  if (officeOn() && officeFrozen()) return;
  if (item.office) return officeInteract(item);
  if (officeOn() && officeBossActive() && item.kind === 'target') {
    mgPop('😡 Prima il capo!', false);
    return;
  }
  // con il foglio o la cartella del capo in mano non si prendono né si consegnano gli oggetti dei compiti
  if (game.MG.carry?.office) {
    mgPop(`🤲 Prima consegna ${game.MG.carry.e} ${game.MG.carry.label}`, false);
    return;
  }
  if (item.kind === 'pickup') {
    if (game.MG.carry) {
      // scambio: l'oggetto in mano resta a terra
      const dropped: GameValue = game.MG.carry;
      game.MG.carry = item.item;
      item.item = dropped;
      item.name = dropped.label;
    } else {
      game.MG.carry = item.item;
      delete game.MG.map[key];
    }
    sfx('door');
    mgHud();
    return;
  }
  if (!game.MG.carry) {
    mgPop('🤚 Prima prendi un oggetto', false);
    return;
  }
  const task = game.MG.task;
  if (!task) return;
  const st = task.steps[game.MG.stepIdx];
  if (game.MG.carry.id === st.item && item.id === st.target) {
    mgScore(1);
    sfx('coin');
    const perItem: number = game.activeShift?.perItem ?? 0;
    if (game.activeShift) game.activeShift.delivered = (game.activeShift.delivered || 0) + 1;
    game.MG.carry = null;
    game.MG.stepIdx++;
    const done = game.MG.stepIdx >= task.steps.length;
    if (done) mgSpawnTask();
    else mgHud();
    mgPop((done ? '🎉 ' : '✅ ') + (perItem ? `+${perItem} Đ` : ''));
  } else {
    mgScore(-0.5);
    sfx('error');
    mgPop(game.MG.carry.id !== st.item ? '❌ Non questo' : '❌ Posto sbagliato', false);
  }
}

// --- disegno nell'ambiente
export function drawWorkItem(o?: GameValue, t?: GameValue): GameValue {
  const ctx = game.view.ctx;
  const s: GameValue = isoScale(),
    bob: GameValue = Math.sin(t * 3 + o.x * 0.05) * 1.8;
  ellipseShadow(o.x, o.y, 11, 6, 0.28);
  const p: GameValue = isoProject(o.x, o.y, 14 + bob);
  ctx.fillStyle = 'rgba(255,255,255,0.82)';
  ctx.strokeStyle = 'rgba(0,0,0,0.25)';
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.arc(p.x, p.y, 17 * s, 0, 6.3);
  ctx.fill();
  ctx.stroke();
  ctx.font = `${Math.round(26 * s)}px serif`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillStyle = '#000';
  ctx.fillText(o.item.e, p.x, p.y + 1);
  ctx.textBaseline = 'alphabetic';
}

export function drawWorkTarget(tg?: GameValue): GameValue {
  if (tg.draw === 'beam') drawBeamTarget(tg);
  else if (tg.draw === 'panel') drawPanelTarget(tg);
}

export function drawTargetRing(tg?: GameValue, t?: GameValue): GameValue {
  const ctx = game.view.ctx;
  const s: GameValue = isoScale(),
    pulse: GameValue = 1 + Math.sin(t * 4) * 0.08,
    c: GameValue = isoProject(tg.x, tg.y, 0);
  const rx: GameValue = (Math.max(tg.w, 36) * 0.5 + 18) * s * pulse * 0.87,
    ry: GameValue = rx * 0.5;
  ctx.save();
  ctx.lineWidth = 3 * s;
  ctx.strokeStyle = 'rgba(254,202,87,0.95)';
  ctx.fillStyle = 'rgba(254,202,87,0.18)';
  ctx.beginPath();
  ctx.ellipse(c.x, c.y, rx, ry, 0, 0, 6.3);
  ctx.fill();
  ctx.stroke();
  ctx.restore();
}

// Freccia sopra il punto di consegna: resta visibile anche quando un mobile alto copre il cerchio.
function drawTargetArrow(tg?: GameValue, t?: GameValue): GameValue {
  const s: GameValue = isoScale(),
    bob: GameValue = Math.sin(t * 4) * 5,
    p: GameValue = isoProject(tg.x, tg.y, 100 + bob);
  const ctx: GameValue = game.view.ctx;
  ctx.save();
  ctx.fillStyle = 'rgba(254,202,87,0.98)';
  ctx.strokeStyle = 'rgba(120,80,0,0.9)';
  ctx.lineWidth = 2 * s;
  ctx.beginPath();
  ctx.moveTo(p.x, p.y + 14 * s);
  ctx.lineTo(p.x - 12 * s, p.y);
  ctx.lineTo(p.x - 5 * s, p.y);
  ctx.lineTo(p.x - 5 * s, p.y - 14 * s);
  ctx.lineTo(p.x + 5 * s, p.y - 14 * s);
  ctx.lineTo(p.x + 5 * s, p.y);
  ctx.lineTo(p.x + 12 * s, p.y);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();
  ctx.restore();
}

export function mgAddDrawables(
  addThing?: GameValue,
  drawables?: GameValue,
  t?: GameValue,
): GameValue {
  if (serviceOn()) serviceDrawables(drawables, t);
  else if (hospitalOn()) hospitalDrawables(drawables, t);
  else addTaskDrawables(addThing, drawables, t);
  if (officeOn()) officeDrawables(drawables, t);
  if (game.MG.carry) {
    const px: GameValue = game.playerPos.x,
      py: GameValue = game.playerPos.y,
      e: GameValue = game.MG.carry.e;
    drawables.push({
      depth: px + py + 0.3,
      draw: (): GameValue => {
        const s: GameValue = isoScale(),
          p: GameValue = isoProject(px, py, 74);
        game.view.ctx.fillStyle = 'rgba(255,255,255,0.88)';
        game.view.ctx.beginPath();
        game.view.ctx.arc(p.x + 18 * s, p.y, 14 * s, 0, 6.3);
        game.view.ctx.fill();
        game.view.ctx.font = `${Math.round(20 * s)}px serif`;
        game.view.ctx.textAlign = 'center';
        game.view.ctx.textBaseline = 'middle';
        game.view.ctx.fillStyle = '#000';
        if (game.MG.carry?.id === 'water') {
          const ctx = game.view.ctx;
          ctx.save();
          ctx.translate(p.x + 18 * s, p.y);
          ctx.scale(s, s);
          // Manici, corpo in acciaio e bordo aperto con acqua azzurra.
          ctx.strokeStyle = '#4b5964';
          ctx.lineWidth = 2;
          ctx.strokeRect(-13, -2, 5, 6);
          ctx.strokeRect(8, -2, 5, 6);
          ctx.fillStyle = '#8799a6';
          ctx.beginPath();
          ctx.roundRect(-9, -3, 18, 13, 4);
          ctx.fill();
          ctx.fillStyle = '#dce5ea';
          ctx.beginPath();
          ctx.ellipse(0, -3, 10, 5, 0, 0, Math.PI * 2);
          ctx.fill();
          ctx.fillStyle = '#299edb';
          ctx.beginPath();
          ctx.ellipse(0, -3, 7.5, 3.5, 0, 0, Math.PI * 2);
          ctx.fill();
          ctx.strokeStyle = '#bceeff';
          ctx.lineWidth = 1;
          ctx.beginPath();
          ctx.moveTo(-4, -3);
          ctx.quadraticCurveTo(0, -5, 4, -3);
          ctx.stroke();
          ctx.restore();
        } else game.view.ctx.fillText(e, p.x + 18 * s, p.y + 1);
        game.view.ctx.textBaseline = 'alphabetic';
      },
    });
  }
}

/** Cerchi, frecce e oggetti da raccogliere dei lavori a compiti. */
function addTaskDrawables(addThing: GameValue, drawables: GameValue, t: GameValue): void {
  if (!game.MG.task) return;
  const st: GameValue = game.MG.task.steps[game.MG.stepIdx];
  // con il capo in ufficio i cerchi del compito spariscono: gli oggetti a terra li vuole lui
  const boss = officeOn() && officeBossActive();
  if (!boss)
    game.MG.cfg?.targets.forEach((tg?: GameValue): GameValue => {
      if (tg.draw)
        addThing(tg.x, tg.y, tg.w, tg.h, tg.z || 30, tg.label, (): GameValue => drawWorkTarget(tg));
      if (st && tg.id === st.target) {
        drawables.push({ depth: -1e5 + 2, draw: (): GameValue => drawTargetRing(tg, t) });
        drawables.push({ depth: 1e9, draw: (): GameValue => drawTargetArrow(tg, t) });
      }
    });
  Object.keys(game.MG.map).forEach((k?: GameValue): GameValue => {
    const o: GameValue = game.MG.map[k];
    if (o.kind !== 'pickup') return;
    // il nome solo sull'oggetto che serve adesso o su quello vicino: gli altri restano icone
    const named =
      o.item.id === st?.item || Math.hypot(o.x - game.playerPos.x, o.y - game.playerPos.y) < 70;
    addThing(o.x, o.y, 16, 16, 34, named ? o.item.label : '', (): GameValue => drawWorkItem(o, t));
  });
}

export async function updateShift(delta: number): Promise<void> {
  if (!game.activeShift) {
    if (game.MG.active) mgStop();
    return;
  }
  if (game.view.activeEnvironment !== 'lavoro_' + game.activeShift.jobKey) {
    toast('🚪 Hai lasciato il lavoro prima della fine: turno non pagato.');
    game.activeShift = null;
    mgStop();
    return;
  }
  if (workStartLeft > 0) {
    workStartLeft = Math.max(0, workStartLeft - delta);
    const intro = dom('work-start');
    if (workStartLeft === 0) intro?.remove();
    else if (intro) intro.textContent = workStartLeft <= 0.5 ? 'Via!' : 'Pronti…';
    mgShiftHud();
    return;
  }
  // mentre il capo esce dalla sua stanza anche il tempo del turno si ferma
  if (!(officeOn() && officeFrozen())) game.activeShift.remaining -= delta;
  mgTick(delta);
  mgShiftHud();
  if (game.activeShift.remaining <= 0) {
    const s = game.activeShift;
    game.activeShift = null;
    const rating: GameValue = mgRating(),
      mult: GameValue = mgMultiplier(rating);
    mgStop();
    const basePay: number = Math.round(s.pay * mult);
    const delivered: number = s.delivered || 0;
    const itemsPay: number = delivered * (s.perItem || 0);
    const tips: number = s.tips || 0;
    // la multa del capo si toglie dalla paga, che però non va mai sotto zero
    const fine: number = s.fine || 0;
    s.pay = Math.max(0, basePay + itemsPay + tips - fine);
    s.rating = rating;
    s.mult = mult;
    const countShift = () => {
      game.player.jobExperience[s.jobKey] = (game.player.jobExperience[s.jobKey] || 0) + 1;
    };
    // la paga la versa il server (job-server.ts); in modalità prova resta locale
    let later = false;
    if (s.serverShift) {
      const outcome = await claimServerPay(s.serverShift, s.jobKey, { delivered, tips, fine });
      if (outcome.kind === 'refused') {
        toast('💼 ' + outcome.message, 4500);
        return;
      }
      if (outcome.kind === 'paid') {
        // il server applica i tetti del lavoro: conta la sua cifra
        s.pay = outcome.pay;
        if (outcome.exp === null) countShift();
      } else {
        // salvata nel telefono: si riprova da sola, la prima volta dopo poco più di un minuto
        later = true;
        countShift();
        lifetime.setTimeout(() => void flushPendingPay(), 70_000);
      }
    } else {
      countShift();
      if (!(await creditMoney(s.pay))) {
        toast('Pagamento del turno non confermato.');
        return;
      }
    }
    game.player.stats.shifts++;
    if (game.player.stats.shifts === 1) countUse('ingresso:primo_turno');
    notePersonality('workShift');
    game.player.happinessLevel = Math.max(0, game.player.happinessLevel - 5);
    game.player.sleepLevel = Math.max(0, game.player.sleepLevel - 3);
    game.view.currentRoomTitle = `${s.title} ✅`;
    const done: number = game.player.jobExperience[s.jobKey];
    const multText = s.mult !== 1 ? ' ×' + String(s.mult).replace('.', ',') : '';
    const left = shiftsLeftToday(game.player.workDay, new Date());
    void openDialog({
      title: later ? '⏳ Turno finito' : `✅ +${s.pay} Đ`,
      text:
        (later
          ? `Il server non ha risposto: la paga (${s.pay} Đ) arriverà da sola appena risponde, anche alla prossima partita.\n\n`
          : '') +
        `${basePay} Đ${multText} di paga + ${delivered} 📦 × ${s.perItem || 0} Đ` +
        (tips ? ` + ${tips} Đ di mance e bonus` : '') +
        (fine ? ` − ${fine} Đ ${s.fineLabel || 'di multa del capo'}` : '') +
        '\n\n' +
        nextPayMessage(done) +
        `\n\n${left > 0 ? `Oggi puoi lavorare ancora ${left} ${left === 1 ? 'volta' : 'volte'}.` : 'Per oggi hai finito.'}`,
      buttons: [{ label: 'Ok', value: 'ok' }],
    });
  }
}

export function openComputerShopModal(..._args: GameValue[]): GameValue {
  dom('pc-modal').classList.remove('hidden');
}
