import { startPlayersHud } from './players-hud.js';
import { dayNumber } from './game-clock.js';
import { renderArtSite, startArtMarket } from './art-market.js';
import { resumeFaintSpot } from './faint.js';
import type { GameValue } from './context.js';
import type { DialogOptions, DialogResult } from './models.js';
import { acquirePlayerSession } from './accounts.js';
import { game } from './context.js';
import { lifetime, dom, browser } from './runtime.js';
import {
  claimRoom,
  hasRoom,
  loadGame,
  normalizeRooms,
  saveGame,
  startPresence,
  syncMyPinFromRoom,
  syncVaultFromServer,
  watchGameVersion,
} from './saves.js';
import { openCharacterCreator } from './render/avatars.js';
import { openEpitaph, rebuildGraveyard } from './render/objects.js';
import { checkMissions, toast } from './missions.js';
import { setupControls } from './world.js';
import { startLoop } from './engine.js';
import { die, reapAbsentPlayers, showDeathScreen, updateNotifyButton } from './needs.js';
import { updateSoundButton } from './audio.js';
// ---------- Finestre di dialogo in-game ----------
export function openDialog({
  title,
  text = '',
  input = null,
  buttons,
}: DialogOptions): Promise<DialogResult> {
  if (game.dialogResolve) game.dialogResolve({ action: null, value: '' });
  const modal: GameValue = dom('dialog-modal');
  const inp: GameValue = dom('dialog-input');
  const box: GameValue = dom('dialog-buttons');
  dom('dialog-title').textContent = title;
  dom('dialog-text').textContent = text;
  inp.value = '';
  inp.classList.toggle('hidden', !input);
  if (input) {
    inp.placeholder = input.placeholder || '';
    inp.inputMode = input.numeric ? 'numeric' : 'text';
    inp.maxLength = input.maxLength || 60;
  }
  box.innerHTML = '';
  return new Promise((resolve) => {
    const finish = (action: string | null): void => {
      game.dialogResolve = null;
      modal.classList.add('hidden');
      resolve({ action, value: inp.value.trim() });
    };
    game.dialogResolve = resolve;
    buttons.forEach((b) => {
      const btn: GameValue = document.createElement('button');
      btn.className = 'btn-primary';
      btn.type = 'button';
      if (b.color) btn.style.background = b.color;
      btn.textContent = b.label;
      btn.onclick = (): GameValue => finish(b.value);
      box.appendChild(btn);
    });
    inp.onkeydown = (e?: GameValue): GameValue => {
      if (e.key === 'Enter') {
        e.preventDefault();
        finish(buttons[buttons.length - 1].value);
      }
      if (e.key === 'Escape') finish(null);
    };
    modal.classList.remove('hidden');
    if (input) lifetime.setTimeout((): GameValue => inp.focus(), 50);
  });
}

export async function openChat(..._args: GameValue[]): Promise<GameValue> {
  const res: GameValue = await openDialog({
    title: "💬 Di' qualcosa",
    text: 'Il messaggio appare sopra la tua testa per qualche secondo, visibile a chi è nella tua stessa stanza.',
    input: { placeholder: 'Scrivi…', maxLength: 60 },
    buttons: [
      { label: 'Annulla', value: null, color: '#57606f' },
      { label: 'Invia', value: 'ok', color: '#2e86de' },
    ],
  });
  if (res.action === 'ok' && res.value) {
    game.mySay = res.value.slice(0, 60);
    game.player.stats.chats++;
    game.mySayT = Date.now();
  }
}

export async function showIntro(force: GameValue = false): Promise<GameValue> {
  const KEY: GameValue = game.session.LS_PREFIX + 'sims_intro_v2';
  try {
    if (!force && localStorage.getItem(KEY) === 'seen') return;
  } catch (e: GameValue) {}
  let i: GameValue = 0;
  while (i < game.INTRO_PAGES.length) {
    const pg: GameValue = game.INTRO_PAGES[i],
      last: GameValue = i === game.INTRO_PAGES.length - 1;
    const res: GameValue = await openDialog({
      title: `${pg.title} (${i + 1}/${game.INTRO_PAGES.length})`,
      text: pg.text,
      buttons: last
        ? [{ label: 'Ho capito, si parte! ✅', value: 'done', color: '#2ed573' }]
        : [
            { label: 'Salta', value: 'skip', color: '#57606f' },
            { label: 'Avanti ▶', value: 'next', color: '#3498db' },
          ],
    });
    if (res.action === 'skip' || res.action === null) break;
    i++;
  }
  try {
    localStorage.setItem(KEY, 'seen');
  } catch (e: GameValue) {}
}

export async function openProfile(..._args: GameValue[]): Promise<GameValue> {
  const res: GameValue = await openDialog({
    title: `👤 ${game.player.myData.nick}`,
    text:
      (game.session.OFFLINE
        ? `Il tuo codice personaggio è:\n${game.session.myPlayerId}`
        : 'Il tuo Sim è collegato al tuo account Google. Per ritrovarlo su un altro dispositivo accedi con lo stesso account.') +
      (hasRoom()
        ? `\n\nLa tua stanza: n° ${(game.myAssignedRoomIdx ?? -1) + 1} (Appartamento ${game.aptOfRoom(game.myAssignedRoomIdx) + 1})`
        : '') +
      (game.session.OFFLINE
        ? '\n\n🧪 Sei in modalità prova: niente viene salvato sul server.'
        : ''),
    input: game.session.OFFLINE
      ? { placeholder: 'Codice di un altro dispositivo…', maxLength: 140 }
      : null,
    buttons: [
      { label: 'Chiudi', value: null, color: '#57606f' },
      { label: '🎨 Aspetto', value: 'look', color: '#8e44ad' },
      { label: '🪦 Epitaffio', value: 'epitaph', color: '#636e72' },
      ...(game.session.OFFLINE ? [{ label: 'Usa codice', value: 'switch', color: '#e67e22' }] : []),
    ],
  });
  if (res.action === 'look') openCharacterCreator(false);
  if (res.action === 'epitaph') openEpitaph();
  if (res.action === 'switch') switchToCode(res.value);
}

export function switchToCode(code?: GameValue): GameValue {
  if (!game.session.OFFLINE) {
    toast('Il Sim online si apre con il tuo account Google.');
    return false;
  }
  code = (code || '').trim();
  if (!/^player_[a-z0-9]{4,20}$/.test(code)) {
    toast('❌ Codice non valido (es. player_ab12cd3)');
    return false;
  }
  saveGame(true);
  localStorage.setItem(game.session.LS_PREFIX + 'sims_device_id', code);
  localStorage.setItem(game.session.LS_PREFIX + 'sims_adopt_nick', '1');
  localStorage.removeItem(game.session.SAVE_KEY);
  if (!localStorage.getItem(game.session.LS_PREFIX + 'sims_player_nick'))
    localStorage.setItem(game.session.LS_PREFIX + 'sims_player_nick', 'Ospite');
  location.reload();
  return true;
}

export async function restoreFromCode(..._args: GameValue[]): Promise<GameValue> {
  if (!game.session.OFFLINE) {
    // Online the account already owns this Sim: a previous one is linked only on the first access.
    toast(
      'Questo account Google ha già un Sim. Un Sim precedente si recupera al primo accesso con un altro account Google.',
      7000,
    );
    return;
  }
  const res: GameValue = await openDialog({
    title: '🔑 Recupera personaggio',
    text: "Inserisci il codice personaggio che trovi nel profilo (👤) sull'altro dispositivo.",
    input: { placeholder: 'player_…', maxLength: 140 },
    buttons: [
      { label: 'Annulla', value: null, color: '#57606f' },
      { label: 'Recupera', value: 'ok', color: '#2ed573' },
    ],
  });
  if (res.action === 'ok') switchToCode(res.value);
}

export function resizeCanvas(..._args: GameValue[]): GameValue {
  if (game.view.canvas) {
    game.view.canvas.width = browser.innerWidth;
    game.view.canvas.height = browser.innerHeight;
  }
}

export async function startGame(..._args: GameValue[]): Promise<GameValue> {
  if (game.session.gameStarted) return;
  game.session.gameStarted = true;
  try {
    await acquirePlayerSession();
  } catch (error) {
    game.session.gameStarted = false;
    toast(error instanceof Error ? error.message : String(error), 6000);
    return;
  }
  game.player.myData.nick = (
    localStorage.getItem(game.session.LS_PREFIX + 'sims_player_nick') || 'Ospite'
  ).slice(0, 20);
  dom('ui-setup-screen').classList.add('hidden');
  dom('needs-hud').classList.remove('hidden');
  dom('hud-actions').classList.remove('hidden');
  if (game.session.OFFLINE) toast('🧪 Modalità prova: nessun dato viene inviato al server', 5000);
  setupControls();
  startLoop();
  watchGameVersion();
  await loadGame();
  if (game.player.isDead || game.player.healthLevel <= 0) {
    // morto in una sessione precedente, oppure durante l'assenza
    if (!game.player.isDead) await die();
    else writeGrave();
    showDeathScreen();
    return;
  }
  if (!game.bodyChosen) await openCharacterCreator(true);
  await claimRoom();
  reapAbsentPlayers();
  game.currentApt = hasRoom() ? game.aptOfRoom(game.myAssignedRoomIdx) : 0;
  game.view.currentRoomTitle = game.saloonTitle();
  if (game.player.isSleeping && hasRoom()) {
    game.view.activeEnvironment = 'PLAYER_ROOM';
    game.currentRoomIdx = game.myAssignedRoomIdx;
    game.view.currentRoomTitle = 'La tua stanza 🏠';
    game.playerPos = { x: game.playerRoomFurniture.bed.x, y: game.playerRoomFurniture.bed.y };
  }
  if (game.fainted) await resumeFaintSpot();
  game.session.db.ref('sims_rooms_state').on('value', (snapshot?: GameValue): GameValue => {
    game.roomsState = normalizeRooms(snapshot.val());
    syncVaultFromServer();
    syncMyPinFromRoom();
    renderArtSite();
  });
  game.session.db
    .ref('sims_graveyard')
    .on('value', (snap?: GameValue): GameValue => rebuildGraveyard(snap.val()));
  startPresence();
  startPlayersHud();
  startArtMarket();
  updateSoundButton();
  updateNotifyButton();
  checkMissions();
  lifetime.setInterval(checkMissions, 1000);
  showIntro(); // guida iniziale (solo la prima volta; sempre rileggibile dal ❓)
  lifetime.setInterval((): GameValue => saveGame(false), 3000);
  lifetime.setInterval((): GameValue => {
    if (hasRoom())
      game.session.db.ref(`sims_rooms_state/${game.myAssignedRoomIdx}/lastSeen`).set(Date.now());
  }, 60000);
  lifetime.listen(browser, 'beforeunload', (): GameValue => saveGame(true));
  lifetime.listen(document, 'visibilitychange', (): GameValue => {
    if (document.hidden) saveGame(true);
  });
}

export function writeGrave(..._args: GameValue[]): GameValue {
  const g: GameValue = {
    name: game.player.myData.nick,
    deadAt: game.player.deadAt || Date.now(),
    days: dayNumber(game.player.gameMinutes, new Date(game.player.deadAt || Date.now())),
  };
  if (game.player.bornAt) g.lived = Math.max(0, g.deadAt - game.player.bornAt);
  if (game.player.epitaph) g.epitaph = game.player.epitaph;
  try {
    game.session.db.ref('sims_graveyard/' + game.session.myPlayerId).update(g);
  } catch (e: GameValue) {} // update: conserva i fiori già lasciati
}
