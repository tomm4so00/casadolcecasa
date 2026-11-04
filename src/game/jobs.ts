import { notePersonality } from './personality.js';
import { creditMoney } from './economy.js';
import type { GameValue } from './context.js';
import { game } from './context.js';
import { dom } from './runtime.js';
import { collidesAt, getSolidObstacles } from './engine.js';
import { toast } from './missions.js';
import { sfx } from './audio.js';
import { isoProject, isoScale } from './render/primitives.js';
import { ellipseShadow } from './render/objects.js';
import { drawBeamTarget, drawPanelTarget } from './render/construction.js';
import { openDialog } from './interface.js';
import { nextPayMessage, shiftsLeftToday } from './job-pay.js';
import { applyRoomBounds } from './room-size.js';
export function mgFlash(ok?: GameValue): GameValue {
  if (!game.MG.el) return;
  game.MG.el.classList.remove('mg-flash-ok', 'mg-flash-ko');
  void game.MG.el.offsetWidth;
  game.MG.el.classList.add(ok ? 'mg-flash-ok' : 'mg-flash-ko');
}

export function mgScore(delta?: GameValue): GameValue {
  game.MG.score = Math.max(0, game.MG.score + delta);
  mgFlash(delta > 0);
}

/** Scritta breve che sale dal riquadro del lavoro e sparisce: al posto dei messaggi in alto. */
export function mgPop(text: string, ok = true): void {
  const el: GameValue = game.MG.el;
  if (!el) return;
  const p = document.createElement('div');
  p.className = 'mg-pop ' + (ok ? 'ok' : 'ko');
  p.textContent = text;
  p.addEventListener('animationend', () => p.remove());
  el.appendChild(p);
}

export function mgRating(..._args: GameValue[]): GameValue {
  return Math.max(0, Math.min(1, game.MG.score / game.MG.target));
}

export function mgMultiplier(r?: GameValue): GameValue {
  // Bonus prestazione (×1,2 dal 50%, ×1,4 dal 75%): disattivato con SKILL_PAY = false.
  return !game.SKILL_PAY ? 1 : r < 0.5 ? 1 : r < 0.75 ? 1.2 : 1.4;
}

export function mgHud(..._args: GameValue[]): GameValue {
  const el: GameValue = game.MG.el;
  if (!el || !game.MG.active) return;
  const { cfg, task, stepIdx, carry } = game.MG;
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
    `<div class="mg-top"><span id="mg-time"></span><div class="mg-bar"><div id="mg-fill"></div></div><span id="mg-pay"></span></div>` +
    `<div class="mg-step"><span class="${held ? 'held' : ''}">${held ? '🤲 ' : ''}${e} ${label}</span> → 🎯 ${target?.label ?? ''}<span class="mg-dots">${dots}</span></div>` +
    (sub ? `<div class="mg-sub">${sub}</div>` : '');
  mgShiftHud();
}

/** Tempo e paga del turno nel riquadro del lavoro (a ogni fotogramma). */
function mgShiftHud(): void {
  const s: GameValue = game.activeShift;
  const time = dom('mg-time');
  if (!s || !time) return;
  time.textContent = `⏱ ${Math.ceil(Math.max(0, s.remaining))}s`;
  dom('mg-fill').style.width = Math.max(0, (s.remaining / game.SHIFT_SECONDS) * 100) + '%';
  dom('mg-pay').textContent = `💰 ${s.pay + (s.delivered || 0) * (s.perItem || 0)} €`;
}

export function mgSpawnTask(..._args: GameValue[]): GameValue {
  // il turno parte appena cambiato ambiente: i bordi sono ancora quelli del posto da cui si arriva
  applyRoomBounds(game.view.activeEnvironment);
  const cfg: GameValue = game.MG.cfg;
  let ti: GameValue;
  do {
    ti = Math.floor(Math.random() * cfg.tasks.length);
  } while (ti === game.MG.lastTask && cfg.tasks.length > 1);
  game.MG.lastTask = ti;
  game.MG.task = cfg.tasks[ti];
  game.MG.stepIdx = 0;
  game.MG.carry = null;
  const need: GameValue = game.MG.task.steps.map((s?: GameValue): GameValue => s.item);
  const decoys: GameValue = Object.keys(cfg.pool)
    .filter((k?: GameValue): GameValue => !need.includes(k))
    .sort((): GameValue => Math.random() - 0.5)
    .slice(0, 3);
  const obstacles: GameValue = getSolidObstacles();
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
          cfg.targets.every((t?: GameValue): GameValue => Math.hypot(x - t.x, y - t.y) > 75);
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
  mgHud();
}

export function mgStart(jobKey?: GameValue): GameValue {
  mgStop();
  if (!game.WORK_JOBS[jobKey]) return;
  game.MG.el = dom('minigame');
  game.MG.active = true;
  game.MG.job = jobKey;
  game.MG.cfg = game.WORK_JOBS[jobKey];
  game.MG.score = 0;
  game.MG.lastTask = -1;
  game.MG.el.classList.remove('hidden');
  // durante il turno il ritorno a casa è un'icona in un angolo, lontana dal riquadro
  dom('btn-return-home').classList.add('compact');
  mgSpawnTask();
}

export function mgStop(..._args: GameValue[]): GameValue {
  game.MG.active = false;
  game.MG.map = {};
  game.MG.carry = null;
  dom('btn-return-home')?.classList.remove('compact');
  const el: GameValue = dom('minigame');
  if (el) {
    el.classList.add('hidden');
    el.innerHTML = '';
  }
}

export function mgTick(..._args: GameValue[]): GameValue {}

export function mgButtonText(item?: GameValue): GameValue {
  if (item.kind === 'pickup')
    return game.MG.carry
      ? `🔁 Scambia con ${item.item.e} ${item.item.label}`
      : `✋ Raccogli ${item.item.e} ${item.item.label}`;
  return game.MG.carry
    ? `⬇️ Consegna ${game.MG.carry.e} ${game.MG.carry.label} → ${item.label}`
    : `🎯 ${item.label} (prima prendi un oggetto)`;
}

export function mgInteract(item?: GameValue, key?: GameValue): GameValue {
  if (!game.MG.active) return;
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
  const st: GameValue = game.MG.task.steps[game.MG.stepIdx];
  if (game.MG.carry.id === st.item && item.id === st.target) {
    mgScore(1);
    sfx('coin');
    const perItem: number = game.activeShift?.perItem ?? 0;
    if (game.activeShift) game.activeShift.delivered = (game.activeShift.delivered || 0) + 1;
    game.MG.carry = null;
    game.MG.stepIdx++;
    const done = game.MG.stepIdx >= game.MG.task.steps.length;
    if (done) mgSpawnTask();
    else mgHud();
    mgPop((done ? '🎉 ' : '✅ ') + (perItem ? `+${perItem} €` : ''));
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
  const st: GameValue = game.MG.task.steps[game.MG.stepIdx];
  game.MG.cfg.targets.forEach((tg?: GameValue): GameValue => {
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
        game.view.ctx.fillText(e, p.x + 18 * s, p.y + 1);
        game.view.ctx.textBaseline = 'alphabetic';
      },
    });
  }
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
  game.activeShift.remaining -= delta;
  mgTick(delta);
  mgShiftHud();
  if (game.activeShift.remaining <= 0) {
    const s: GameValue = game.activeShift;
    game.activeShift = null;
    const rating: GameValue = mgRating(),
      mult: GameValue = mgMultiplier(rating);
    mgStop();
    const basePay: number = Math.round(s.pay * mult);
    const delivered: number = s.delivered || 0;
    const itemsPay: number = delivered * (s.perItem || 0);
    s.pay = basePay + itemsPay;
    s.rating = rating;
    s.mult = mult;
    game.player.jobExperience[s.jobKey] = (game.player.jobExperience[s.jobKey] || 0) + 1;
    const paid = await creditMoney(s.pay);
    if (!paid) {
      toast('Pagamento del turno non confermato.');
      return;
    }
    game.player.stats.shifts++;
    notePersonality('workShift');
    game.player.happinessLevel = Math.max(0, game.player.happinessLevel - 5);
    game.player.sleepLevel = Math.max(0, game.player.sleepLevel - 3);
    game.view.currentRoomTitle = `${s.title} ✅`;
    const done: number = game.player.jobExperience[s.jobKey];
    const multText = s.mult !== 1 ? ' ×' + String(s.mult).replace('.', ',') : '';
    const left = shiftsLeftToday(game.player.workDay, new Date());
    void openDialog({
      title: `✅ +${s.pay} €`,
      text:
        `${basePay} €${multText} di paga + ${delivered} 📦 × ${s.perItem || 0} €\n\n` +
        nextPayMessage(done) +
        `\n\n${left > 0 ? `Oggi puoi lavorare ancora ${left} ${left === 1 ? 'volta' : 'volte'}.` : 'Per oggi hai finito.'}`,
      buttons: [{ label: 'Ok', value: 'ok' }],
    });
  }
}

export function openComputerShopModal(..._args: GameValue[]): GameValue {
  dom('pc-modal').classList.remove('hidden');
}
