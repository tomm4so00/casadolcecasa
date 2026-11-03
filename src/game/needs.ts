import { disablePush, enablePush, needsHomeScreen, showPhoneNotification } from './push.js';
import { startNewLife } from './rebirth.js';
import { clockText, dayNumber, isNight, realHour } from './game-clock.js';
import { spendMoney } from './economy.js';
import { advanceNeeds } from './simulation.js';
import { needsRules } from './needs-rules.js';
import type { GameValue } from './context.js';
import { game } from './context.js';
import { lifetime, dom, browser } from './runtime.js';
import {
  SAFE_PIN_HINT,
  SAFE_PIN_RE,
  buildSaveData,
  hasRoom,
  hashPin,
  normalizeRooms,
  withTimeout,
} from './saves.js';
import { mgStop, updateShift } from './jobs.js';
import { openDialog, writeGrave } from './interface.js';
import { toast } from './missions.js';
import { socDo } from './social.js';
import { box, onFace } from './render/objects.js';
import { isoProject, isoScale } from './render/primitives.js';
import { sfx } from './audio.js';
import { updateFlu } from './flu.js';
export async function reapAbsentPlayers(..._args: GameValue[]): Promise<GameValue> {
  if (!game.session.OFFLINE) return; // The trusted scheduled process handles other characters.
  let reaped: GameValue = [];
  try {
    await withTimeout(
      game.session.db.ref('sims_rooms_state').transaction((cur?: GameValue): GameValue => {
        const rooms: GameValue = normalizeRooms(cur),
          now: GameValue = Date.now();
        reaped = [];
        rooms.forEach((r?: GameValue, i?: GameValue): GameValue => {
          if (
            r.ownerId &&
            r.ownerId !== game.session.myPlayerId &&
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
      const sv: GameValue =
        (await game.session.db.ref('sims_saves/' + g.id).once('value')).val() || {};
      const gm: GameValue = sv.gameMinutes;
      const deadAt: GameValue = g.lastSeen + game.ABSENT_DEATH_ESTIMATE_MS;
      await game.session.db.ref('sims_saves/' + g.id + '/dead').set(true);
      await game.session.db.ref('sims_saves/' + g.id + '/deadAt').set(deadAt);
      const grave: GameValue = {
        name: g.name,
        deadAt,
        days: Math.floor((Number(gm) || 0) / 1440) + 1,
      };
      if (sv.bornAt) grave.lived = Math.max(0, deadAt - sv.bornAt);
      if (sv.epitaph) grave.epitaph = String(sv.epitaph).slice(0, 60);
      await game.session.db.ref('sims_graveyard/' + g.id).update(grave);
      await game.session.db.ref('sims_leaderboard/' + g.id).remove();
      await game.session.db.ref('sims_online_players/' + g.id).remove();
    } catch (e: GameValue) {
      console.warn('Registrazione morte fallita', g.id, e);
    }
  }
}

export async function die(..._args: GameValue[]): Promise<GameValue> {
  if (game.player.isDead) return;
  game.player.isDead = true;
  game.player.deadAt = Date.now();
  game.player.isSleeping = false;
  game.activeShift = null;
  game.showerAnim = null;
  game.bathAnim = null;
  mgStop();
  const data: GameValue = buildSaveData(); // contiene dead:true
  try {
    localStorage.setItem(game.session.SAVE_KEY, JSON.stringify(data));
  } catch (e: GameValue) {}
  try {
    game.session.db.ref('sims_saves/' + game.session.myPlayerId).set(data);
  } catch (e: GameValue) {}
  try {
    game.session.db.ref('sims_leaderboard/' + game.session.myPlayerId).remove();
  } catch (e: GameValue) {}
  try {
    game.session.db.ref('sims_online_players/' + game.session.myPlayerId).remove();
  } catch (e: GameValue) {}
  writeGrave();
  // La stanza torna libera per un altro giocatore (cassaforte, PIN e arredi si perdono con il personaggio)
  try {
    await withTimeout(
      game.session.db.ref('sims_rooms_state').transaction((cur?: GameValue): GameValue => {
        const rooms: GameValue = normalizeRooms(cur);
        const i: GameValue = rooms.findIndex(
          (r?: GameValue): GameValue => r.ownerId === game.session.myPlayerId,
        );
        if (i !== -1)
          rooms[i] = {
            id: rooms[i].id,
            vaultMoney: 0,
            ...(rooms[i].pendingDeath ? { pendingDeath: rooms[i].pendingDeath } : {}),
          };
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
  const days: GameValue = dayNumber(
    game.player.gameMinutes,
    new Date(game.player.deadAt || Date.now()),
  );
  const when: GameValue = game.player.deadAt
    ? new Date(game.player.deadAt).toLocaleString('it-IT', {
        dateStyle: 'long',
        timeStyle: 'short',
      })
    : '';
  ov.innerHTML =
    '<div style="font-size:64px">🕯️</div>' +
    '<h1 style="margin:12px 0 6px;font-size:28px">' +
    escapeHtmlSafe(game.player.myData.nick) +
    ' è morto</h1>' +
    '<p style="max-width:380px;line-height:1.5;opacity:.85">La salute è arrivata a zero: il personaggio non ce l\'ha fatta. Ha vissuto fino al giorno ' +
    days +
    '.' +
    (when ? '<br>' + when : '') +
    '</p>' +
    '<p style="opacity:.6;font-size:13px">Riposerà al cimitero, dove gli altri giocatori potranno ricordarlo.</p>' +
    '<div style="margin-top:18px;display:flex;flex-direction:column;gap:8px;align-items:center;width:100%;max-width:300px">' +
    '<p style="margin:0;font-size:14px">🌱 Ricomincia da zero con un nuovo personaggio:</p>' +
    '<input id="death-new-name" maxlength="20" autocomplete="off" placeholder="Nome del nuovo personaggio" style="width:100%;box-sizing:border-box;padding:10px;border-radius:10px;border:1px solid #444;background:#1b1b26;color:#fff;font-size:15px;text-align:center">' +
    '<div id="death-name-error" style="min-height:18px;color:#ff7675;font-size:13px"></div>' +
    '<button id="death-restart" style="padding:10px 18px;border-radius:10px;border:0;background:#2ed573;color:#fff;font-size:15px;font-weight:bold;cursor:pointer">🌱 Ricomincia da zero</button>' +
    '</div>';
  const input: GameValue = dom('death-new-name');
  const errorBox: GameValue = dom('death-name-error');
  const b: GameValue = dom('death-restart');
  const restart = async (): Promise<void> => {
    if (b.disabled) return;
    b.disabled = true;
    errorBox.textContent = '';
    const error = await startNewLife(String(input.value || ''));
    if (error) {
      errorBox.textContent = error;
      b.disabled = false;
    }
  };
  b.onclick = (): void => void restart();
  input.onkeydown = (e: KeyboardEvent): void => {
    if (e.key === 'Enter') void restart();
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

export async function faint(..._args: GameValue[]): Promise<void> {
  const fee: GameValue = Math.min(game.moneyLevel, 30);
  if (!(await spendMoney(fee))) return;
  game.player.healthLevel = 40;
  game.player.sleepLevel = Math.max(game.player.sleepLevel, 40);
  game.player.hungerLevel = Math.max(game.player.hungerLevel, 40);
  game.player.hygieneLevel = Math.max(game.player.hygieneLevel, 40);
  game.player.isSleeping = false;
  game.activeShift = null;
  game.view.activeEnvironment = 'lavoro_ospedale';
  game.view.currentRoomTitle = 'Pronto Soccorso 🚑';
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
  updateNeeds(d);
}

export function drugLevel(t: GameValue = Date.now()): GameValue {
  if (!game.player.drug.active) return 0;
  const decayMs: GameValue = game.drugWindowMs() * 0.7; // la barra arriva al minimo al 70% del periodo
  return Math.max(0, game.player.drug.dAtDose * (1 - (t - game.player.drug.lastDose) / decayMs));
}

export function updateDrugHud(..._args: GameValue[]): GameValue {
  const row: GameValue = dom('drug-row');
  if (!row) return;
  row.classList.toggle('hidden', !game.player.drug.active);
  if (!game.player.drug.active) return;
  const v: GameValue = drugLevel(),
    crisis: GameValue =
      game.player.drug.crisisAt &&
      Date.now() >= game.player.drug.crisisAt &&
      (Date.now() - game.player.drug.crisisAt) / 3600000 < game.DRUG_HIGH_H;
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
      (game.player.drug.active ? `\n\nDipendenza attuale: ${Math.round(v)}%.` : '') +
      (game.player.drugStock ? `\nDosi che hai con te: ${game.player.drugStock}.` : ''),
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
  if (!(await spendMoney(game.DRUG_PRICE))) return;
  if (res.action === 'stock') {
    game.player.drugStock++;
    toast(
      `💊 Hai comprato una dose da portare via (ne hai ${game.player.drugStock}). Puoi regalarla a un altro giocatore.`,
      4500,
    );
    return;
  }
  drugTake();
}

export function drugTake(..._args: GameValue[]): GameValue {
  const now: GameValue = Date.now();
  const d: GameValue = Math.min(100, drugLevel(now) + game.DRUG_DOSE);
  game.player.drug.doses = (game.player.drug.active ? game.player.drug.doses : 0) + 1;
  game.player.drug.active = true;
  game.player.drug.lastDose = now;
  game.player.drug.dAtDose = d;
  game.player.drug.endAt = now + game.drugWindowMs();
  if (d >= 100) game.player.drug.crisisAt = now; // dipendenza a 100%: parte la crisi
  game.player.happinessLevel = Math.min(100, game.player.happinessLevel + game.DRUG_EUPHORIA);
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
    ? t.id +
      '|' +
      acts.map((a?: GameValue): GameValue => a.id).join(',') +
      '|' +
      game.player.drugStock
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
  return game.player.coffeeAt + game.COFFEE_CD_MS - Date.now();
}

export function useCoffee(..._args: GameValue[]): GameValue {
  const left: GameValue = coffeeLeftMs();
  if (left > 0) {
    toast(`☕ La macchina si sta scaldando: riprova tra ${Math.ceil(left / 60000)} min.`, 3000);
    return;
  }
  if (game.player.sleepLevel >= 90) {
    toast('😳 Non hai affatto sonno: non ti serve un caffè.');
    return;
  }
  if (game.player.healthLevel <= game.COFFEE_MIN_HEALTH) {
    toast('🚫 Con questa salute un altro caffè potrebbe esserti fatale!', 3500);
    return;
  }
  game.player.coffeeAt = Date.now();
  game.coffeeBrewUntil = performance.now() + 2500;
  game.player.sleepLevel = Math.min(100, game.player.sleepLevel + game.COFFEE_SLEEP);
  game.player.healthLevel = Math.max(1, game.player.healthLevel - game.COFFEE_HEALTH);
  toast(`☕ Caffè! Sonno +${game.COFFEE_SLEEP}%, salute −${game.COFFEE_HEALTH}%`, 3500);
}

export function drawCoffeeMachine(it?: GameValue, t?: GameValue): GameValue {
  const ctx = game.view.ctx;
  const brewing: GameValue = performance.now() < game.coffeeBrewUntil;
  box(it.x, it.y, it.w + 14, it.h + 6, 28, '#8d6e63'); // piano d'appoggio
  const b: GameValue = box(it.x, it.y - 3, it.w, it.h - 10, 36, '#2d3436', { z0: 28 });
  onFace(b, 'left', (W?: GameValue, H?: GameValue): GameValue => {
    ctx.fillStyle = '#111';
    ctx.fillRect(3, 3, W - 6, H * 0.28);
    ctx.fillStyle = brewing ? '#fdcb6e' : '#55efc4';
    ctx.fillRect(5, 5, (W - 10) * (brewing ? 0.9 : 0.4), 3);
    ctx.fillStyle = '#b2bec3';
    [0.25, 0.5, 0.75].forEach((u?: GameValue): GameValue => {
      ctx.beginPath();
      ctx.arc(W * u, H * 0.42, 2.2, 0, 6.3);
      ctx.fill();
    });
    ctx.fillStyle = '#636e72';
    ctx.fillRect(W * 0.38, H * 0.52, W * 0.24, H * 0.1);
    ctx.fillStyle = '#1e272e';
    ctx.fillRect(3, H * 0.86, W - 6, H * 0.1);
  });
  const fy: GameValue = it.y - 3 + (it.h - 10) / 2 + 3;
  box(it.x, fy, 9, 9, 7, '#ecf0f1', { z0: 28, edge: 'rgba(0,0,0,0.25)' }); // tazzina
  if (brewing) {
    const p: GameValue = isoProject(it.x, fy, 40),
      s: GameValue = isoScale();
    for (let i: GameValue = 0; i < 3; i++) {
      const ph: GameValue = (t * 0.8 + i / 3) % 1;
      ctx.fillStyle = `rgba(255,255,255,${0.55 * (1 - ph)})`;
      ctx.beginPath();
      ctx.arc(p.x + Math.sin(ph * 6 + i) * 3 * s, p.y - ph * 24 * s, (2.5 + ph * 4) * s, 0, 6.3);
      ctx.fill();
    }
  }
}

export function updateNotifyButton(..._args: GameValue[]): GameValue {
  const b: GameValue = dom('btn-notify');
  if (b) b.textContent = game.notifyOn ? '🔔' : '🔕';
}

export function sendNotify(title?: GameValue, body?: GameValue, tag?: GameValue): GameValue {
  if (!game.notifyOn || typeof browser.Notification === 'undefined') return;
  // sui telefoni le notifiche passano dal service worker; sul computer basta Notification
  void showPhoneNotification(String(title), String(body), String(tag)).then((ok) => {
    if (ok) return;
    try {
      const options: NotificationOptions & { renotify: boolean } = { body, tag, renotify: true };
      new browser.Notification(title, options);
    } catch (e: GameValue) {
      /* restano il titolo della scheda e gli avvisi in gioco */
    }
  });
}

export async function toggleNotify(..._args: GameValue[]): Promise<GameValue> {
  if (game.notifyOn) {
    game.notifyOn = false;
    void disablePush();
    try {
      localStorage.setItem(game.session.LS_PREFIX + 'sims_notify', 'off');
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
    localStorage.setItem(game.session.LS_PREFIX + 'sims_notify', 'on');
  } catch (e: GameValue) {}
  updateNotifyButton();
  const remote = await enablePush();
  toast(
    remote
      ? '🔔 Notifiche attive! Ti avviso anche a gioco chiuso se il personaggio sta per morire.'
      : needsHomeScreen()
        ? '🔔 Notifiche attive a gioco aperto. Per riceverle anche a gioco chiuso su iPhone, aggiungi il gioco alla schermata Home (Condividi → Aggiungi a Home) e riattivale da lì.'
        : '🔔 Notifiche attive: ti avviso quando il personaggio ha fame, sonno, sporco o salute bassa. La scheda deve restare aperta.',
    7000,
  );
  sendNotify('Casa dolce casa', 'Notifiche attive ✅', 'sims-test');
}

export function checkAlerts(..._args: GameValue[]): GameValue {
  if (!game.session.saveReady) return;
  let worst: GameValue = null;
  game.ALERT_DEFS.forEach((a?: GameValue): GameValue => {
    const v: GameValue = a.get();
    const lvl: GameValue = v < a.crit ? 2 : v < a.low ? 1 : 0;
    const prev: GameValue = game.alertLevel[a.key] || 0;
    if (lvl > prev) {
      const msg: GameValue =
        `${a.emoji} ${game.player.myData.nick} ${a.label} (${a.name} ${Math.round(v)}%)` +
        (lvl === 2 ? a.critText || ' – è critico!' : '');
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
  if (game.player.isSleeping && game.player.sleepLevel >= 100) {
    if (!game.wakeAlertSent) {
      game.wakeAlertSent = true;
      if (document.hidden)
        sendNotify(
          'Casa dolce casa',
          `😴 ${game.player.myData.nick} ha dormito abbastanza: può svegliarsi!`,
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
  if (game.player.isDead) return;
  if (!game.session.saveReady) return;
  advanceNeeds(game.player, delta, Date.now(), needsRules());
  // Suoni automatici: monete quando i soldi salgono, porta quando cambi ambiente
  if (game.lastMoneyForSound !== null && game.moneyLevel > game.lastMoneyForSound) sfx('coin');
  game.lastMoneyForSound = game.session.saveReady ? game.moneyLevel : null;
  if (game.lastEnvForSound && game.view.activeEnvironment !== game.lastEnvForSound) sfx('door');
  game.lastEnvForSound = game.view.activeEnvironment;
  if (game.player.healthLevel <= 0) {
    die();
    return;
  }
  if (
    game.player.healthLevel < 25 &&
    (game.player.hungerLevel <= 0 ||
      game.player.hygieneLevel <= 0 ||
      game.player.sleepLevel <= 0) &&
    Date.now() - game.lastDangerToast > 60000
  ) {
    game.lastDangerToast = Date.now();
    toast('☠️ Salute critica! Mangia, dormi o lavati prima che sia troppo tardi!', 5000);
  }
  // ora reale del dispositivo; il giorno conta quelli vissuti dal personaggio
  const nowDate = new Date();
  dom('clock-text').innerText = `${isNight(realHour(nowDate)) ? '🌙' : '☀️'} ${clockText(nowDate)}`;
  dom('day-text').innerText = `Giorno ${dayNumber(game.player.gameMinutes, nowDate)}`;
  updateShift(Math.min(delta, 0.1));
  checkAlerts();
  dom('health-bar-fill').style.width = Math.round(game.player.healthLevel) + '%';
  dom('health-text').innerText = Math.round(game.player.healthLevel) + '%';
  dom('sleep-bar-fill').style.width = Math.round(game.player.sleepLevel) + '%';
  dom('sleep-text').innerText = Math.round(game.player.sleepLevel) + '%';
  dom('hunger-bar-fill').style.width = Math.round(game.player.hungerLevel) + '%';
  dom('hunger-text').innerText = Math.round(game.player.hungerLevel) + '%';
  dom('hygiene-bar-fill').style.width = Math.round(game.player.hygieneLevel) + '%';
  dom('hygiene-text').innerText = Math.round(game.player.hygieneLevel) + '%';
  dom('happiness-bar-fill').style.width = Math.round(game.player.happinessLevel) + '%';
  dom('happiness-text').innerText = Math.round(game.player.happinessLevel) + '%';
  updateDrugHud();
  updateFlu();
  // Sotto i 1000 € in cassaforte la barra si riempie solo di verde, verso 1000 €.
  // Da 1000 € in su è piena e divisa in proporzione: verde cassaforte, azzurro banca.
  const bankMoney: number = game.bankBalance || 0;
  const totalMoney: number = game.moneyLevel + bankMoney;
  const vaultFull: boolean = game.moneyLevel >= 1000;
  const vaultWidth: number = vaultFull
    ? (game.moneyLevel / totalMoney) * 100
    : (game.moneyLevel / 1000) * 100;
  dom('money-bar-fill').style.width = vaultWidth + '%';
  dom('bank-bar-fill').style.width = (vaultFull ? 100 - vaultWidth : 0) + '%';
  dom('money-text').innerText = '🔐 ' + game.moneyLevel + ' €';
  dom('bank-text').innerText = '🏦 ' + bankMoney + ' €';
  // Chiede il PIN solo quando i soldi salgono oltre l'ultima richiesta (prima chiedeva ad ogni frame)
  if (
    game.session.saveReady &&
    game.moneyLevel > game.pinPromptMoneyThreshold &&
    !game.hasSetSafePin &&
    hasRoom() &&
    !game.dialogResolve
  ) {
    game.pinPromptMoneyThreshold = game.moneyLevel;
    lifetime.setTimeout(() => void promptSetSafePin(), 0);
  }
}

export async function promptSetSafePin(intro?: string): Promise<GameValue> {
  const res: GameValue = await openDialog({
    title: '🔐 Proteggi la cassaforte',
    text:
      intro ||
      `Hai guadagnato dei soldi! Scegli una combinazione segreta per la cassaforte della tua stanza: ${SAFE_PIN_HINT}.`,
    input: { placeholder: '134', numeric: true, maxLength: 3 },
    buttons: [
      { label: 'Più tardi', value: null, color: '#57606f' },
      { label: 'Salva PIN', value: 'ok', color: '#2ed573' },
    ],
  });
  if (res.action !== 'ok') {
    game.pinPromptMoneyThreshold = game.moneyLevel + 100; // non richiederlo a ogni moneta
    return;
  }
  if (SAFE_PIN_RE.test(res.value) && hasRoom()) {
    let room: GameValue = game.roomsState[game.myAssignedRoomIdx ?? -1];
    game.safePinCode = hashPin(res.value, room.id);
    game.hasSetSafePin = true;
    game.session.db.ref(`sims_rooms_state/${game.myAssignedRoomIdx}/pin`).set(game.safePinCode);
    toast('✅ Cassaforte protetta con successo!');
  } else {
    toast(`❌ Combinazione non valida (${SAFE_PIN_HINT}). Te la richiederò al prossimo guadagno.`);
  }
}
