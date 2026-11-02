import type { GameValue } from './context.js';
import { game } from './context.js';
import { lifetime, dom, browser } from './runtime.js';
import { buildSaveData, hasRoom, hashPin, normalizeRooms, withTimeout } from './saves.js';
import { mgStop, updateShift } from './jobs.js';
import { openDialog, writeGrave } from './interface.js';
import { toast } from './missions.js';
import { socDo } from './social.js';
import { box, onFace } from './render/objects.js';
import { isoProject, isoScale } from './render/primitives.js';
import { sfx } from './audio.js';
export async function reapAbsentPlayers(..._args: GameValue[]): Promise<GameValue> {
  let reaped: GameValue = [];
  try {
    await withTimeout(
      game.db.ref('sims_rooms_state').transaction((cur?: GameValue): GameValue => {
        const rooms: GameValue = normalizeRooms(cur),
          now: GameValue = Date.now();
        reaped = [];
        rooms.forEach((r?: GameValue, i?: GameValue): GameValue => {
          if (
            r.ownerId &&
            r.ownerId !== game.myPlayerId &&
            r.lastSeen &&
            now - r.lastSeen > game.ABSENT_DEATH_MS
          ) {
            reaped.push({ id: r.ownerId, name: r.owner || 'Sconosciuto', lastSeen: r.lastSeen });
            rooms[i] = { id: r.id, vaultMoney: 0 }; // stanza libera e cassaforte azzerata
          }
        });
        return rooms;
      }),
      8000,
    );
  } catch (e: GameValue) {
    console.warn('Controllo assenti fallito', e);
    return;
  }
  for (const g of reaped) {
    try {
      const sv: GameValue = (await game.db.ref('sims_saves/' + g.id).once('value')).val() || {};
      const gm: GameValue = sv.gameMinutes;
      const deadAt: GameValue = g.lastSeen + game.ABSENT_DEATH_ESTIMATE_MS;
      await game.db.ref('sims_saves/' + g.id + '/dead').set(true);
      await game.db.ref('sims_saves/' + g.id + '/deadAt').set(deadAt);
      const grave: GameValue = {
        name: g.name,
        deadAt,
        days: Math.floor((Number(gm) || 0) / 1440) + 1,
      };
      if (sv.bornAt) grave.lived = Math.max(0, deadAt - sv.bornAt);
      if (sv.epitaph) grave.epitaph = String(sv.epitaph).slice(0, 60);
      await game.db.ref('sims_graveyard/' + g.id).update(grave);
      await game.db.ref('sims_leaderboard/' + g.id).remove();
      await game.db.ref('sims_online_players/' + g.id).remove();
    } catch (e: GameValue) {
      console.warn('Registrazione morte fallita', g.id, e);
    }
  }
}

export async function die(..._args: GameValue[]): Promise<GameValue> {
  if (game.isDead) return;
  game.isDead = true;
  game.deadAt = Date.now();
  game.isSleeping = false;
  game.activeShift = null;
  game.showerAnim = null;
  mgStop();
  const data: GameValue = buildSaveData(); // contiene dead:true
  try {
    localStorage.setItem(game.SAVE_KEY, JSON.stringify(data));
  } catch (e: GameValue) {}
  try {
    game.db.ref('sims_saves/' + game.myPlayerId).set(data);
  } catch (e: GameValue) {}
  try {
    game.db.ref('sims_leaderboard/' + game.myPlayerId).remove();
  } catch (e: GameValue) {}
  try {
    game.db.ref('sims_online_players/' + game.myPlayerId).remove();
  } catch (e: GameValue) {}
  writeGrave();
  // La stanza torna libera per un altro giocatore (cassaforte, PIN e arredi si perdono con il personaggio)
  try {
    await withTimeout(
      game.db.ref('sims_rooms_state').transaction((cur?: GameValue): GameValue => {
        const rooms: GameValue = normalizeRooms(cur);
        const i: GameValue = rooms.findIndex(
          (r?: GameValue): GameValue => r.ownerId === game.myPlayerId,
        );
        if (i !== -1) rooms[i] = { id: rooms[i].id, vaultMoney: 0 };
        return rooms;
      }),
      8000,
    );
  } catch (e: GameValue) {
    console.warn('Liberazione stanza fallita', e);
  }
  game.myAssignedRoomIdx = -1;
  showDeathScreen();
}

export function showDeathScreen(..._args: GameValue[]): GameValue {
  dom('needs-hud').classList.add('hidden');
  dom('hud-actions').classList.add('hidden');
  ['dialog-modal', 'creator-modal'].forEach((id?: GameValue): GameValue => {
    const el: GameValue = dom(id);
    if (el) el.classList.add('hidden');
  });
  let ov: GameValue = dom('death-screen');
  if (!ov) {
    ov = document.createElement('div');
    ov.id = 'death-screen';
    ov.style.cssText =
      'position:fixed;inset:0;z-index:9999;background:#0b0b10;color:#eee;display:flex;flex-direction:column;align-items:center;justify-content:center;text-align:center;padding:24px;font-family:inherit';
    document.body.appendChild(ov);
  }
  const days: GameValue = Math.floor(game.gameMinutes / 1440) + 1;
  const when: GameValue = game.deadAt
    ? new Date(game.deadAt).toLocaleString('it-IT', { dateStyle: 'long', timeStyle: 'short' })
    : '';
  ov.innerHTML =
    '<div style="font-size:64px">🕯️</div>' +
    '<h1 style="margin:12px 0 6px;font-size:28px">' +
    escapeHtmlSafe(game.myData.nick) +
    ' è morto</h1>' +
    '<p style="max-width:380px;line-height:1.5;opacity:.85">La salute è arrivata a zero: il personaggio non ce l\'ha fatta. Ha vissuto fino al giorno ' +
    days +
    '.' +
    (when ? '<br>' + when : '') +
    '</p>' +
    '<p style="opacity:.6;font-size:13px">Questo personaggio non può più giocare.</p>' +
    (game.OFFLINE
      ? '<button id="death-restart" style="margin-top:18px;padding:10px 18px;border-radius:10px;border:0;background:#e74c3c;color:#fff;font-size:15px;cursor:pointer">🧪 Ricomincia (solo modalità prova)</button>'
      : '');
  const b: GameValue = dom('death-restart');
  if (b)
    b.onclick = (): GameValue => {
      try {
        localStorage.removeItem(game.SAVE_KEY);
      } catch (e: GameValue) {}
      try {
        game.db.ref('sims_saves/' + game.myPlayerId).set(null);
      } catch (e: GameValue) {}
      try {
        game.db.ref('sims_graveyard/' + game.myPlayerId).set(null);
      } catch (e: GameValue) {}
      location.reload();
    };
}

export function escapeHtmlSafe(t?: GameValue): string {
  const entities: Record<string, string> = {
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;',
  };
  return String(t).replace(/[&<>"']/g, (c) => entities[c]);
}

export function faint(..._args: GameValue[]): GameValue {
  const fee: GameValue = Math.min(game.moneyLevel, 30);
  game.moneyLevel -= fee;
  game.healthLevel = 40;
  game.sleepLevel = Math.max(game.sleepLevel, 40);
  game.hungerLevel = Math.max(game.hungerLevel, 40);
  game.hygieneLevel = Math.max(game.hygieneLevel, 40);
  game.isSleeping = false;
  game.activeShift = null;
  game.activeEnvironment = 'lavoro_ospedale';
  game.currentRoomTitle = 'Pronto Soccorso 🚑';
  game.playerPos = { x: 0, y: 60 };
  dom('btn-return-home').classList.remove('hidden');
  openDialog({
    title: '🚑 Sei svenuto!',
    text: `La tua salute è arrivata a zero. Ti hanno portato in ospedale e le cure sono costate ${fee} €.\n\nRicordati di mangiare, dormire e lavarti!`,
    buttons: [{ label: 'Ok', value: 'ok' }],
  });
}

export function tickNeeds(..._args: GameValue[]): GameValue {
  const n: GameValue = Date.now();
  let d: GameValue = (n - game.lastNeedsWall) / 1000;
  game.lastNeedsWall = n;
  if (!isFinite(d) || d < 0) d = 0;
  updateNeeds(Math.min(d, 12 * 3600));
}

export function drugLevel(t: GameValue = Date.now()): GameValue {
  if (!game.drug.active) return 0;
  const decayMs: GameValue = game.drugWindowMs() * 0.7; // la barra arriva al minimo al 70% del periodo
  return Math.max(0, game.drug.dAtDose * (1 - (t - game.drug.lastDose) / decayMs));
}

export function drugRate(t?: GameValue): GameValue {
  let r: GameValue = game.DRUG_BASE;
  if (game.drug.crisisAt && t >= game.drug.crisisAt) {
    const e: GameValue = (t - game.drug.crisisAt) / 3600000;
    if (e < game.DRUG_HIGH_H) r += game.DRUG_PEAK;
    else if (e < game.DRUG_HIGH_H + game.DRUG_TAPER_H)
      r += game.DRUG_PEAK * (1 - (e - game.DRUG_HIGH_H) / game.DRUG_TAPER_H);
  }
  return r;
}

export function drugApply(tNowMs?: GameValue, dtSec?: GameValue): GameValue {
  if (!game.drug.active || dtSec <= 0) return;
  let left: GameValue = dtSec,
    t: GameValue = tNowMs - dtSec * 1000;
  while (left > 0 && game.drug.active) {
    const d: GameValue = Math.min(300, left);
    const mid: GameValue = t + d * 500;
    if (mid >= game.drug.endAt) {
      game.drug = { active: false, doses: 0, lastDose: 0, endAt: 0, dAtDose: 0, crisisAt: 0 };
      break;
    }
    game.healthLevel = Math.max(0, game.healthLevel - (drugRate(mid) * d) / 3600);
    t += d * 1000;
    left -= d;
  }
}

export function updateDrugHud(..._args: GameValue[]): GameValue {
  const row: GameValue = dom('drug-row');
  if (!row) return;
  row.classList.toggle('hidden', !game.drug.active);
  if (!game.drug.active) return;
  const v: GameValue = drugLevel(),
    crisis: GameValue =
      game.drug.crisisAt &&
      Date.now() >= game.drug.crisisAt &&
      (Date.now() - game.drug.crisisAt) / 3600000 < game.DRUG_HIGH_H;
  dom('drug-bar-fill').style.width = Math.round(v) + '%';
  dom('drug-bar-fill').style.background = crisis ? '#ff4757' : '#a29bfe';
  dom('drug-text').innerText = crisis
    ? Math.round(v) + '% ⚠️ crisi'
    : v < 1
      ? 'astinenza'
      : Math.round(v) + '%';
}

export async function openDealer(..._args: GameValue[]): Promise<GameValue> {
  const v: GameValue = drugLevel();
  const res: GameValue = await openDialog({
    title: '🕴️ Lo spacciatore',
    text:
      `«Psst… hai l'aria di uno che vuole dimenticare i problemi.»\n\nUna dose costa ${game.DRUG_PRICE} €. Dà euforia subito (+${game.DRUG_EUPHORIA}% felicità), ma crea dipendenza: la salute scende più in fretta per giorni e, se la dipendenza arriva a 100%, è molto peggio. Più dosi compri, più dura.` +
      (game.drug.active ? `\n\nDipendenza attuale: ${Math.round(v)}%.` : '') +
      (game.drugStock ? `\nDosi che hai con te: ${game.drugStock}.` : ''),
    buttons: [
      { label: 'Vai via', value: null, color: '#57606f' },
      { label: `Compra da portare via (${game.DRUG_PRICE} €)`, value: 'stock', color: '#6c5ce7' },
      { label: `Compra e assumi (${game.DRUG_PRICE} €)`, value: 'buy', color: '#8e44ad' },
    ],
  });
  if (res.action !== 'buy' && res.action !== 'stock') return;
  if (game.moneyLevel < game.DRUG_PRICE) {
    toast(`Non hai abbastanza soldi: servono ${game.DRUG_PRICE} € in cassaforte.`);
    return;
  }
  game.moneyLevel -= game.DRUG_PRICE;
  if (res.action === 'stock') {
    game.drugStock++;
    toast(
      `💊 Hai comprato una dose da portare via (ne hai ${game.drugStock}). Puoi regalarla a un altro giocatore.`,
      4500,
    );
    return;
  }
  drugTake();
}

export function drugTake(..._args: GameValue[]): GameValue {
  const now: GameValue = Date.now();
  const d: GameValue = Math.min(100, drugLevel(now) + game.DRUG_DOSE);
  game.drug.doses = (game.drug.active ? game.drug.doses : 0) + 1;
  game.drug.active = true;
  game.drug.lastDose = now;
  game.drug.dAtDose = d;
  game.drug.endAt = now + game.drugWindowMs();
  if (d >= 100) game.drug.crisisAt = now; // dipendenza a 100%: parte la crisi
  game.happinessLevel = Math.min(100, game.happinessLevel + game.DRUG_EUPHORIA);
  toast(
    d >= 100
      ? '☠️ Dipendenza al 100%: la tua salute sta crollando!'
      : `💊 Hai assunto una dose… dipendenza ${Math.round(d)}%`,
    4500,
  );
  updateDrugHud();
}

export function updateSocialPanel(..._args: GameValue[]): GameValue {
  const panel: GameValue = dom('social-panel');
  if (!panel) return;
  game.frameNear.sort((a?: GameValue, b?: GameValue): GameValue => a.d - b.d);
  const t: GameValue = !game.socBusy() && game.frameNear.length ? game.frameNear[0] : null;
  game.socTarget = t;
  const acts: GameValue = t
    ? game.SOC_ACTIONS.filter((a?: GameValue): GameValue => !a.show || a.show())
    : [];
  const key: GameValue = t
    ? t.id + '|' + acts.map((a?: GameValue): GameValue => a.id).join(',') + '|' + game.drugStock
    : '';
  if (key === game.socKey) return;
  game.socKey = key;
  panel.classList.toggle('hidden', !t);
  if (!t) return;
  dom('soc-title').textContent = '👥 ' + t.name;
  const row: GameValue = dom('soc-row');
  row.innerHTML = '';
  acts.forEach((a?: GameValue): GameValue => {
    const b: GameValue = document.createElement('button');
    b.type = 'button';
    b.style.background = a.color;
    b.textContent = typeof a.label === 'function' ? a.label() : a.label;
    b.onclick = (): GameValue => socDo(a.id);
    row.appendChild(b);
  });
}

export function coffeeLeftMs(..._args: GameValue[]): GameValue {
  return game.coffeeAt + game.COFFEE_CD_MS - Date.now();
}

export function useCoffee(..._args: GameValue[]): GameValue {
  const left: GameValue = coffeeLeftMs();
  if (left > 0) {
    toast(`☕ La macchina si sta scaldando: riprova tra ${Math.ceil(left / 60000)} min.`, 3000);
    return;
  }
  if (game.sleepLevel >= 90) {
    toast('😳 Non hai affatto sonno: non ti serve un caffè.');
    return;
  }
  if (game.healthLevel <= game.COFFEE_MIN_HEALTH) {
    toast('🚫 Con questa salute un altro caffè potrebbe esserti fatale!', 3500);
    return;
  }
  game.coffeeAt = Date.now();
  game.coffeeBrewUntil = performance.now() + 2500;
  game.sleepLevel = Math.min(100, game.sleepLevel + game.COFFEE_SLEEP);
  game.healthLevel = Math.max(1, game.healthLevel - game.COFFEE_HEALTH);
  toast(`☕ Caffè! Sonno +${game.COFFEE_SLEEP}%, salute −${game.COFFEE_HEALTH}%`, 3500);
}

export function drawCoffeeMachine(it?: GameValue, t?: GameValue): GameValue {
  const brewing: GameValue = performance.now() < game.coffeeBrewUntil;
  box(it.x, it.y, it.w + 14, it.h + 6, 28, '#8d6e63'); // piano d'appoggio
  const b: GameValue = box(it.x, it.y - 3, it.w, it.h - 10, 36, '#2d3436', { z0: 28 });
  onFace(b, 'left', (W?: GameValue, H?: GameValue): GameValue => {
    game.ctx.fillStyle = '#111';
    game.ctx.fillRect(3, 3, W - 6, H * 0.28);
    game.ctx.fillStyle = brewing ? '#fdcb6e' : '#55efc4';
    game.ctx.fillRect(5, 5, (W - 10) * (brewing ? 0.9 : 0.4), 3);
    game.ctx.fillStyle = '#b2bec3';
    [0.25, 0.5, 0.75].forEach((u?: GameValue): GameValue => {
      game.ctx.beginPath();
      game.ctx.arc(W * u, H * 0.42, 2.2, 0, 6.3);
      game.ctx.fill();
    });
    game.ctx.fillStyle = '#636e72';
    game.ctx.fillRect(W * 0.38, H * 0.52, W * 0.24, H * 0.1);
    game.ctx.fillStyle = '#1e272e';
    game.ctx.fillRect(3, H * 0.86, W - 6, H * 0.1);
  });
  const fy: GameValue = it.y - 3 + (it.h - 10) / 2 + 3;
  box(it.x, fy, 9, 9, 7, '#ecf0f1', { z0: 28, edge: 'rgba(0,0,0,0.25)' }); // tazzina
  if (brewing) {
    const p: GameValue = isoProject(it.x, fy, 40),
      s: GameValue = isoScale();
    for (let i: GameValue = 0; i < 3; i++) {
      const ph: GameValue = (t * 0.8 + i / 3) % 1;
      game.ctx.fillStyle = `rgba(255,255,255,${0.55 * (1 - ph)})`;
      game.ctx.beginPath();
      game.ctx.arc(
        p.x + Math.sin(ph * 6 + i) * 3 * s,
        p.y - ph * 24 * s,
        (2.5 + ph * 4) * s,
        0,
        6.3,
      );
      game.ctx.fill();
    }
  }
}

export function updateNotifyButton(..._args: GameValue[]): GameValue {
  const b: GameValue = dom('btn-notify');
  if (b) b.textContent = game.notifyOn ? '🔔' : '🔕';
}

export function sendNotify(title?: GameValue, body?: GameValue, tag?: GameValue): GameValue {
  if (!game.notifyOn || typeof browser.Notification === 'undefined') return;
  try {
    new browser.Notification(title, { body, tag, renotify: true });
  } catch (e: GameValue) {
    /* alcuni telefoni richiedono un service worker: restano titolo e avvisi in gioco */
  }
}

export async function toggleNotify(..._args: GameValue[]): Promise<GameValue> {
  if (game.notifyOn) {
    game.notifyOn = false;
    try {
      localStorage.setItem(game.LS_PREFIX + 'sims_notify', 'off');
    } catch (e: GameValue) {}
    updateNotifyButton();
    toast('🔕 Notifiche disattivate');
    return;
  }
  if (typeof browser.Notification === 'undefined') {
    toast(
      "Questo browser non supporta le notifiche. Resta l'avviso nel titolo della scheda.",
      4500,
    );
    return;
  }
  let perm: GameValue = browser.Notification.permission;
  if (perm === 'default') {
    try {
      perm = await browser.Notification.requestPermission();
    } catch (e: GameValue) {}
  }
  if (perm !== 'granted') {
    toast('🔕 Notifiche bloccate: abilitale dalle impostazioni del sito nel browser.', 5000);
    return;
  }
  game.notifyOn = true;
  try {
    localStorage.setItem(game.LS_PREFIX + 'sims_notify', 'on');
  } catch (e: GameValue) {}
  updateNotifyButton();
  toast(
    '🔔 Notifiche attive: ti avviso quando il personaggio ha fame, sonno, sporco o salute bassa. La scheda deve restare aperta.',
    5500,
  );
  sendNotify('Casa dolce casa', 'Notifiche attive ✅', 'sims-test');
}

export function checkAlerts(..._args: GameValue[]): GameValue {
  if (!game.saveReady) return;
  let worst: GameValue = null;
  game.ALERT_DEFS.forEach((a?: GameValue): GameValue => {
    const v: GameValue = a.get();
    const lvl: GameValue = v < a.crit ? 2 : v < a.low ? 1 : 0;
    const prev: GameValue = game.alertLevel[a.key] || 0;
    if (lvl > prev) {
      const msg: GameValue =
        `${a.emoji} ${game.myData.nick} ${a.label} (${a.name} ${Math.round(v)}%)` +
        (lvl === 2 ? ' – è critico!' : '');
      if (document.hidden)
        sendNotify(
          lvl === 2 ? '⚠️ Casa dolce casa: urgente' : 'Casa dolce casa',
          msg,
          'sims-' + a.key,
        );
      else toast(msg, 4000);
      game.alertLevel[a.key] = lvl;
    } else if (lvl < prev && (lvl === 0 ? v > a.low + 8 : true)) game.alertLevel[a.key] = lvl;
    if (lvl > 0 && (!worst || v / a.low < worst.v / worst.a.low)) worst = { a, v };
  });
  // sonno completato: il personaggio può svegliarsi
  if (game.isSleeping && game.sleepLevel >= 100) {
    if (!game.wakeAlertSent) {
      game.wakeAlertSent = true;
      if (document.hidden)
        sendNotify(
          'Casa dolce casa',
          `😴 ${game.myData.nick} ha dormito abbastanza: può svegliarsi!`,
          'sims-wake',
        );
      else toast('😴 Hai dormito abbastanza: puoi svegliarti', 3500);
    }
  } else game.wakeAlertSent = false;
  const t: GameValue = worst
    ? `${worst.a.emoji} ${worst.a.name} ${Math.round(worst.v)}% · ${game.BASE_TITLE}`
    : game.BASE_TITLE;
  if (document.title !== t) document.title = t;
}

export function updateNeeds(delta?: GameValue): GameValue {
  if (game.isDead) return;
  if (game.isSleeping) {
    const bedBoost: GameValue = game.ownedFurniture.bed_lux ? 1.5 : 1; // il letto di lusso fa riposare più in fretta
    game.sleepLevel = Math.min(
      100,
      game.sleepLevel + (delta / game.SLEEP_RECOVERY_SEC) * 100 * bedBoost,
    );
    game.hungerLevel = Math.max(
      0,
      game.hungerLevel - (delta / game.HUNGER_SLEEP_DEPLETION_SEC) * 100,
    );
    game.sleepGainedSinceLastHealthBoost += (delta / game.SLEEP_RECOVERY_SEC) * 100 * bedBoost;
    if (game.sleepGainedSinceLastHealthBoost >= 20) {
      game.healthLevel = Math.min(100, game.healthLevel + 5);
      game.sleepGainedSinceLastHealthBoost = 0;
    }
  } else {
    game.sleepLevel = Math.max(0, game.sleepLevel - (delta / game.SLEEP_DEPLETION_SEC) * 100);
    game.hungerLevel = Math.max(
      0,
      game.hungerLevel - (delta / game.HUNGER_AWAKE_DEPLETION_SEC) * 100,
    );
  }
  game.hygieneLevel = Math.max(
    0,
    game.hygieneLevel - (delta / game.HYGIENE_DEPLETION_SEC) * 100 * (game.isSleeping ? 0.5 : 1),
  );
  // La felicità cala piano; le piante in stanza la fanno calare ancora più piano
  const plantFactor: GameValue = game.ownedFurniture.plant_lux
    ? 0.3
    : game.ownedFurniture.plant_std
      ? 0.5
      : 1;
  game.happinessLevel = Math.max(
    0,
    game.happinessLevel - (delta / game.HAPPINESS_DEPLETION_SEC) * 100 * plantFactor,
  );
  // Suoni automatici: monete quando i soldi salgono, porta quando cambi ambiente
  if (game.lastMoneyForSound !== null && game.moneyLevel > game.lastMoneyForSound) sfx('coin');
  game.lastMoneyForSound = game.saveReady ? game.moneyLevel : null;
  if (game.lastEnvForSound && game.activeEnvironment !== game.lastEnvForSound) sfx('door');
  game.lastEnvForSound = game.activeEnvironment;
  if (game.hungerLevel <= 0 || game.hygieneLevel <= 0 || game.sleepLevel <= 0) {
    game.healthLevel = Math.max(0, game.healthLevel - (delta / game.HEALTH_DAMAGE_SEC) * 100);
  }
  drugApply(Date.now(), delta);
  if (game.healthLevel <= 0) {
    die();
    return;
  }
  if (
    game.healthLevel < 25 &&
    (game.hungerLevel <= 0 || game.hygieneLevel <= 0 || game.sleepLevel <= 0) &&
    Date.now() - game.lastDangerToast > 60000
  ) {
    game.lastDangerToast = Date.now();
    toast('☠️ Salute critica! Mangia, dormi o lavati prima che sia troppo tardi!', 5000);
  }
  game.gameMinutes += delta * game.GAME_MINUTES_PER_SEC;
  const totalMin: GameValue = Math.floor(game.gameMinutes);
  const hh: GameValue = String(Math.floor(totalMin / 60) % 24).padStart(2, '0');
  const mm: GameValue = String(totalMin % 60).padStart(2, '0');
  const hour: GameValue = Math.floor(totalMin / 60) % 24;
  dom('clock-text').innerText = `${hour >= 20 || hour < 6 ? '🌙' : '☀️'} ${hh}:${mm}`;
  dom('day-text').innerText = `Giorno ${Math.floor(totalMin / 1440) + 1}`;
  updateShift(Math.min(delta, 0.1));
  checkAlerts();
  dom('health-bar-fill').style.width = Math.round(game.healthLevel) + '%';
  dom('health-text').innerText = Math.round(game.healthLevel) + '%';
  dom('sleep-bar-fill').style.width = Math.round(game.sleepLevel) + '%';
  dom('sleep-text').innerText = Math.round(game.sleepLevel) + '%';
  dom('hunger-bar-fill').style.width = Math.round(game.hungerLevel) + '%';
  dom('hunger-text').innerText = Math.round(game.hungerLevel) + '%';
  dom('hygiene-bar-fill').style.width = Math.round(game.hygieneLevel) + '%';
  dom('hygiene-text').innerText = Math.round(game.hygieneLevel) + '%';
  dom('happiness-bar-fill').style.width = Math.round(game.happinessLevel) + '%';
  dom('happiness-text').innerText = Math.round(game.happinessLevel) + '%';
  updateDrugHud();
  let moneyBarWidth: GameValue = Math.min(100, (game.moneyLevel / 1000) * 100);
  dom('money-bar-fill').style.width = moneyBarWidth + '%';
  dom('money-text').innerText = game.moneyLevel + ' €';
  // Chiede il PIN solo quando i soldi salgono oltre l'ultima richiesta (prima chiedeva ad ogni frame)
  if (
    game.saveReady &&
    game.moneyLevel > game.pinPromptMoneyThreshold &&
    !game.hasSetSafePin &&
    hasRoom() &&
    !game.dialogResolve
  ) {
    game.pinPromptMoneyThreshold = game.moneyLevel;
    lifetime.setTimeout(promptSetSafePin, 0);
  }
}

export async function promptSetSafePin(..._args: GameValue[]): Promise<GameValue> {
  const res: GameValue = await openDialog({
    title: '🔐 Proteggi la cassaforte',
    text: 'Hai guadagnato dei soldi! Scegli una combinazione segreta per la cassaforte della tua stanza: 3 cifre da 1 a 5 (es. 135).',
    input: { placeholder: '135', numeric: true, maxLength: 3 },
    buttons: [
      { label: 'Più tardi', value: null, color: '#57606f' },
      { label: 'Salva PIN', value: 'ok', color: '#2ed573' },
    ],
  });
  if (res.action !== 'ok') {
    game.pinPromptMoneyThreshold = game.moneyLevel + 100; // non richiederlo a ogni moneta
    return;
  }
  if (/^[1-5]{3}$/.test(res.value) && hasRoom()) {
    let room: GameValue = game.roomsState[game.myAssignedRoomIdx];
    game.safePinCode = hashPin(res.value, room.id);
    game.hasSetSafePin = true;
    game.db.ref(`sims_rooms_state/${game.myAssignedRoomIdx}/pin`).set(game.safePinCode);
    toast('✅ Cassaforte protetta con successo!');
  } else {
    toast('❌ Combinazione non valida (3 cifre da 1 a 5). Te la richiederò al prossimo guadagno.');
  }
}
