import { notePersonality } from './personality.js';
import { creditMoney } from './economy.js';
import type { GameValue } from './context.js';
import { game } from './context.js';
import { dom } from './runtime.js';
import { collidesAt, getSolidObstacles } from './engine.js';
import { toast } from './missions.js';
import { sfx } from './audio.js';
import { isoProject, isoScale } from './render/primitives.js';
import { box, ellipseShadow } from './render/objects.js';
import { openDialog } from './interface.js';
import { nextPayMessage } from './job-pay.js';
export function mgFlash(ok?: GameValue): GameValue {
  if (!game.MG.el) return;
  game.MG.el.classList.remove('mg-flash-ok', 'mg-flash-ko');
  void game.MG.el.offsetWidth;
  game.MG.el.classList.add(ok ? 'mg-flash-ok' : 'mg-flash-ko');
}

export function mgScore(delta?: GameValue): GameValue {
  game.MG.score = Math.max(0, game.MG.score + delta);
  mgFlash(delta > 0);
  const s: GameValue = dom('mg-score');
  if (s) s.textContent = `⭐ ${Math.round(Math.min(1, game.MG.score / game.MG.target) * 100)}%`;
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
  const st: GameValue = game.MG.task.steps[game.MG.stepIdx];
  el.innerHTML =
    `<div class="mg-head"><span>${game.MG.cfg.title} · ${game.MG.task.title}</span><span id="mg-score">⭐ ${Math.round(mgRating() * 100)}%</span></div>` +
    `<div class="mg-step">👉 ${st.text}</div>` +
    `<div class="mg-sub">Passo ${game.MG.stepIdx + 1}/${game.MG.task.steps.length} · ${game.MG.carry ? '🤲 Porti: ' + game.MG.carry.e + ' ' + game.MG.carry.label : 'Raccogli un oggetto e portalo al cerchio giallo'}</div>`;
}

export function mgSpawnTask(..._args: GameValue[]): GameValue {
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
        x = -150 + Math.random() * 300;
        y = -105 + Math.random() * 230;
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
  mgSpawnTask();
  toast("📦 Raccogli gli oggetti sparsi e portali al cerchio giallo, nell'ordine richiesto", 5000);
}

export function mgStop(..._args: GameValue[]): GameValue {
  game.MG.active = false;
  game.MG.map = {};
  game.MG.carry = null;
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
      toast(`🔁 Hai preso ${game.MG.carry.e} ${game.MG.carry.label}`, 1800);
    } else {
      game.MG.carry = item.item;
      delete game.MG.map[key];
      toast(`✋ Hai preso ${game.MG.carry.e} ${game.MG.carry.label}`, 1800);
    }
    sfx('door');
    mgHud();
    return;
  }
  if (!game.MG.carry) {
    toast('🤚 Prima raccogli un oggetto da portare qui', 2200);
    return;
  }
  const st: GameValue = game.MG.task.steps[game.MG.stepIdx];
  if (game.MG.carry.id === st.item && item.id === st.target) {
    mgScore(1);
    sfx('coin');
    const perItem: number = game.activeShift?.perItem ?? 0;
    if (game.activeShift) game.activeShift.delivered = (game.activeShift.delivered || 0) + 1;
    toast(
      `✅ ${game.MG.carry.e} ${game.MG.carry.label} consegnato!${perItem ? ` +${perItem} €` : ''}`,
      1800,
    );
    game.MG.carry = null;
    game.MG.stepIdx++;
    if (game.MG.stepIdx >= game.MG.task.steps.length) {
      toast(`🎉 Compito completato: ${game.MG.task.title}`, 2500);
      mgSpawnTask();
    } else mgHud();
  } else {
    mgScore(-0.5);
    toast(
      game.MG.carry.id !== st.item
        ? "❌ Non è l'oggetto giusto per questo passo"
        : '❌ Oggetto giusto, ma nel posto sbagliato',
      2200,
    );
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
  if (tg.draw === 'beam') {
    box(tg.x, tg.y, tg.w, tg.h, 12, '#8d5a2b');
    box(tg.x, tg.y, tg.w - 6, 5, 2, '#a9743a', { z0: 12 });
  } else if (tg.draw === 'panel') box(tg.x, tg.y, tg.w, tg.h, 38, '#95a5a6', { top: '#bdc3c7' });
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
    if (o.kind === 'pickup')
      addThing(o.x, o.y, 16, 16, 34, o.item.label, (): GameValue => drawWorkItem(o, t));
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
  const hud: GameValue = dom('shift-hud');
  if (!game.activeShift) {
    hud.classList.add('hidden');
    if (game.MG.active) mgStop();
    return;
  }
  if (game.view.activeEnvironment !== 'lavoro_' + game.activeShift.jobKey) {
    toast('🚪 Hai lasciato il lavoro prima della fine: turno non pagato.');
    game.activeShift = null;
    hud.classList.add('hidden');
    mgStop();
    return;
  }
  game.activeShift.remaining -= delta;
  mgTick(delta);
  hud.classList.remove('hidden');
  const pct: GameValue = Math.min(100, (1 - game.activeShift.remaining / game.SHIFT_SECONDS) * 100);
  dom('shift-fill').style.width = pct + '%';
  const itemsPay: number = (game.activeShift.delivered || 0) * (game.activeShift.perItem || 0);
  dom('shift-text').textContent =
    `💼 Turno in corso: ${Math.ceil(Math.max(0, game.activeShift.remaining))} s · +${game.activeShift.pay} €` +
    (itemsPay ? ` · 📦 +${itemsPay} €` : '');
  if (game.activeShift.remaining <= 0) {
    const s: GameValue = game.activeShift;
    game.activeShift = null;
    hud.classList.add('hidden');
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
    const multText = s.mult !== 1 ? ' (×' + String(s.mult).replace('.', ',') + ')' : '';
    void openDialog({
      title: '✅ Turno completato!',
      text:
        `💼 Paga base: ${basePay} €${multText}\n` +
        `📦 Oggetti consegnati: ${delivered} × ${s.perItem || 0} € = ${itemsPay} €\n` +
        `💰 Totale: +${s.pay} €\n` +
        `Turni completati in questo lavoro: ${done}\n\n` +
        nextPayMessage(done),
      buttons: [{ label: 'Ok', value: 'ok' }],
    });
  }
}

export function openComputerShopModal(..._args: GameValue[]): GameValue {
  dom('pc-modal').classList.remove('hidden');
}
