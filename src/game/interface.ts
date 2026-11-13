import { filterNotice, filterText } from '../../shared/text-filter-rules.js';
import { startUsage } from './usage.js';
import { startBetting } from './betting.js';
import { devMode } from './dev-mode.js';
import { chooseFirstWorld, currentWorldCode, openWorldSwitch } from './world-select.js';
import { startGossip } from './gossip.js';
import { startPaintingTitles } from './painting-titles.js';
import { startCollect } from './collect.js';
import { onLedgerChange, startLimited } from './limited.js';
import { applyDailyPerks } from './personality.js';
import { enablePush } from './push.js';
import { claimInvite, openInvite, remindInvite, startInviteRewards } from './invite.js';
import { joinSharedChallenge } from './arcade.js';
import {
  guestProfileText,
  isGuest,
  offerSave,
  requireAccount,
  startGuestReminder,
} from './guest.js';
import { openCryo, watchCryo } from './cryo.js';
import { flushPendingPay } from './job-server.js';
import { startDormancy } from './dormancy.js';
import { ensureTerms } from './terms.js';
import { startHacker } from './hacker.js';
import { startSuggestions } from './suggestions.js';
import { leavePartner, myPartner, startCouples } from './couples.js';
import { startTrash } from './trash.js';
import { startTaste } from './taste.js';
import { blockedByDeletion, requestDeletion } from './deletion.js';
import { openBlockedList } from './blocks.js';
import { isModerator, openModPanel, stoppedByMute } from './moderation.js';
import { startPlayersHud } from './players-hud.js';
import { startHudMenus } from './hud-menus.js';
import { dayNumber } from './game-clock.js';
import { renderArtSite, startArtMarket } from './art-market.js';
import { startProjects } from './projects.js';
import { resumeFaintSpot } from './faint.js';
import type { GameValue } from './context.js';
import type { DialogOptions, DialogResult } from './models.js';
import {
  accountLogins,
  acquirePlayerSession,
  linkGoogleAccount,
  signOutAccount,
} from './accounts.js';
import { roomLabel } from './realty-rules.js';
import { personalityStatusText } from './personality-rules.js';
import { openPersonalityPage } from './personality-page.js';
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
  withTimeout,
} from './saves.js';
import { openCharacterCreator } from './render/avatars.js';
import { openFirstCreator } from './first-entry.js';
import { bindCoach, startArrival } from './arrival.js';
import { startGuidePointer } from './guide-pointer.js';
import { openEpitaph, rebuildGraveyard } from './render/graveyard.js';
import { checkMissions, toast } from './missions.js';
import { openFurnitureShopModal, resumeLastSpot, setupControls } from './world.js';
import { currentBody, renderClothesShop } from './character.js';
import { startLoop } from './engine.js';
import {
  die,
  reapAbsentPlayers,
  recordDeathUntilDone,
  showDeathScreen,
  updateNotifyButton,
} from './needs.js';
import { updateSoundButton } from './audio.js';
import { worldNode } from './world-db.js';
// ---------- Finestre di dialogo in-game ----------
export function openDialog({
  title,
  text = '',
  input = null,
  check = null,
  buttons,
}: DialogOptions): Promise<DialogResult> {
  if (game.dialogResolve) game.dialogResolve({ action: null, value: '' });
  const modal: GameValue = dom('dialog-modal');
  const line: GameValue = dom('dialog-input');
  const area: GameValue = dom('dialog-textarea');
  // il campo su più righe prende il posto di quello normale
  const inp: GameValue = input?.multiline ? area : line;
  const box: GameValue = dom('dialog-buttons');
  dom('dialog-title').textContent = title;
  dom('dialog-text').textContent = text;
  line.value = area.value = '';
  line.classList.toggle('hidden', !input || !!input.multiline);
  area.classList.toggle('hidden', !input?.multiline);
  if (input) {
    inp.placeholder = input.placeholder || '';
    inp.inputMode = input.numeric ? 'numeric' : 'text';
    inp.maxLength = input.maxLength || 60;
    inp.value = input.value || '';
  }
  // la casella da spuntare e il suo link (età e condizioni)
  const checkRow: HTMLElement = dom('dialog-check');
  const checkBox: HTMLInputElement = dom('dialog-check-box');
  const link: HTMLAnchorElement = dom('dialog-link');
  checkRow.classList.toggle('hidden', !check);
  checkBox.checked = false;
  dom('dialog-check-text').textContent = check?.label || '';
  link.classList.toggle('hidden', !check?.href);
  if (check?.href) {
    link.href = check.href;
    link.textContent = check.linkText || check.href;
  }
  box.innerHTML = '';
  return new Promise((resolve) => {
    const finish = (action: string | null): void => {
      game.dialogResolve = null;
      modal.classList.add('hidden');
      resolve({ action, value: inp.value.trim(), checked: !!check && checkBox.checked });
    };
    const needing: HTMLButtonElement[] = [];
    game.dialogResolve = resolve;
    buttons.forEach((b) => {
      const btn: GameValue = document.createElement('button');
      btn.className = b.wide ? 'btn-primary wide' : 'btn-primary';
      btn.type = 'button';
      if (b.color) btn.style.background = b.color;
      btn.textContent = b.label;
      btn.onclick = (): GameValue => finish(b.value);
      if (b.needsCheck && check) {
        btn.disabled = true;
        needing.push(btn);
      }
      box.appendChild(btn);
    });
    checkBox.onchange = () => {
      for (const btn of needing) btn.disabled = !checkBox.checked;
    };
    line.onkeydown = area.onkeydown = null;
    inp.onkeydown = (e?: GameValue): GameValue => {
      if (e.key === 'Enter' && !input?.multiline) {
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
  if (!(await requireAccount('scrivere nel fumetto'))) return;
  if (stoppedByMute()) return;
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
    const { text, problems } = filterText(res.value.slice(0, 60));
    const notice = filterNotice(problems);
    if (notice) toast(notice, 5000);
    game.mySay = text;
    game.player.stats.chats++;
    game.mySayT = Date.now();
  }
}

export async function showIntro(force: GameValue = false): Promise<GameValue> {
  const KEY: GameValue = game.session.LS_PREFIX + 'sims_intro_v2';
  try {
    if (!force && localStorage.getItem(KEY) === 'seen') return;
    // Chi ha già un personaggio non è nuovo: se entra da un'app, un browser o un telefono dove la
    // guida non risulta vista, non deve sembrargli di ricominciare da capo. Resta sul pulsante ❓.
    if (!force && game.session.hadSave) {
      localStorage.setItem(KEY, 'seen');
      return;
    }
  } catch (e: GameValue) {}
  let i: GameValue = 0;
  while (i < game.INTRO_PAGES.length) {
    const pg: GameValue = game.INTRO_PAGES[i],
      last: GameValue = i === game.INTRO_PAGES.length - 1;
    const res: GameValue = await openDialog({
      // con una pagina sola niente "(1/1)"
      title:
        game.INTRO_PAGES.length > 1
          ? `${pg.title} (${i + 1}/${game.INTRO_PAGES.length})`
          : pg.title,
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

/** Come si accede al Sim (testo del profilo). */
function loginText(): string {
  const { username, email, google } = accountLogins();
  if (!username && !email)
    return 'Il tuo Sim è collegato al tuo account Google. Per ritrovarlo su un altro dispositivo accedi con lo stesso account.';
  return (
    (email
      ? `Entri con l'email «${email}» e la tua password.`
      : `Entri con il nome giocatore «${username}» e la tua password.`) +
    (google
      ? '\n🔗 Google collegato: puoi entrare anche con il tuo account Google.'
      : '\n🔗 Puoi collegare il tuo account Google per entrare anche con quello.')
  );
}

export async function openProfile(..._args: GameValue[]): Promise<GameValue> {
  const guest = isGuest();
  const logins = game.session.OFFLINE || guest ? null : accountLogins();
  const canLink = !!(logins?.username || logins?.email) && !logins?.google;
  const res: GameValue = await openDialog({
    title: `🧑 ${game.player.myData.nick}`,
    text:
      (game.session.OFFLINE
        ? `Il tuo codice personaggio è:\n${game.session.myPlayerId}`
        : guest
          ? guestProfileText()
          : loginText()) +
      `\n\n🌍 Condominio: ${currentWorldCode()} (dai il codice agli amici per giocare insieme)` +
      (hasRoom()
        ? `\nLa tua stanza: ${roomLabel(game.myAssignedRoomIdx ?? 0, game.ROOMS_PER_APT)}`
        : '') +
      `\n\n${personalityStatusText(game.player.personality)}` +
      coupleStatus() +
      (game.session.OFFLINE
        ? '\n\n🧪 Sei in modalità prova: niente viene salvato sul server.'
        : ''),
    input: game.session.OFFLINE
      ? { placeholder: 'Codice di un altro dispositivo…', maxLength: 140 }
      : null,
    buttons: [
      { label: 'Chiudi', value: null, color: '#57606f' },
      ...(guest
        ? [{ label: '💾 Salva il personaggio', value: 'save', color: '#00b894', wide: true }]
        : []),
      { label: '✨ Vedi la tua personalità', value: 'personality', color: '#6c5ce7', wide: true },
      { label: '💌 Invita amici', value: 'invite', color: '#e84393', wide: true },
      { label: '🌍 Cambia condominio', value: 'world', color: '#16a085', wide: true },
      { label: '🧊 Criogenesi (pausa personaggio)', value: 'cryo', color: '#00a8ff', wide: true },
      ...(myPartner()
        ? [
            {
              label: `💔 Lascia ${myPartner()!.name}`,
              value: 'breakup',
              color: '#c0392b',
              wide: true,
            },
          ]
        : []),
      { label: '🚫 Persone bloccate', value: 'blocked', color: '#636e72', wide: true },
      ...(isModerator()
        ? [{ label: '🛡️ Moderazione', value: 'moderation', color: '#2d3436', wide: true }]
        : []),
      { label: '🎨 Aspetto', value: 'look', color: '#8e44ad' },
      { label: '⚰️ Epitaffio', value: 'epitaph', color: '#636e72' },
      ...(game.session.OFFLINE ? [{ label: 'Usa codice', value: 'switch', color: '#e67e22' }] : []),
      ...(canLink ? [{ label: '🔗 Collega Google', value: 'google', color: '#2e86de' }] : []),
      ...(game.session.OFFLINE
        ? []
        : [
            { label: "🚪 Esci dall'account", value: 'logout', color: '#c0392b', wide: true },
            { label: '🗑️ Elimina account e dati', value: 'delete', color: '#57606f', wide: true },
          ]),
    ],
  });
  if (res.action === 'save') await offerSave();
  if (res.action === 'breakup') await confirmBreakup();
  if (res.action === 'logout') await logOut();
  if (res.action === 'delete') await requestDeletion();
  if (res.action === 'google') {
    try {
      await linkGoogleAccount();
      toast('✅ Account Google collegato! Ora puoi entrare anche con Google.', 5000);
    } catch (error) {
      toast(error instanceof Error ? error.message : String(error), 6000);
    }
  }
  if (res.action === 'personality') openPersonalityPage();
  if (res.action === 'invite') await openInvite();
  if (res.action === 'world') await openWorldSwitch();
  if (res.action === 'cryo') await openCryo();
  if (res.action === 'look') openCharacterCreator(false);
  if (res.action === 'epitaph') openEpitaph();
  if (res.action === 'blocked') await openBlockedList();
  if (res.action === 'moderation') await openModPanel();
  if (res.action === 'switch') switchToCode(res.value);
}

/** Nel profilo: con chi stai e da quanti giorni. */
function coupleStatus(): string {
  const p = myPartner();
  if (!p) return '';
  const days = Math.max(0, Math.floor((Date.now() - p.since) / 86400000));
  const since = days === 0 ? 'da oggi' : days === 1 ? 'da 1 giorno' : `da ${days} giorni`;
  return `\n\n💞 Stai con ${p.name} ${since}`;
}

/** Lasciarsi, dopo una conferma. */
async function confirmBreakup(): Promise<void> {
  const p = myPartner();
  if (!p) return;
  const ok: GameValue = await openDialog({
    title: `💔 Lasciare ${p.name}?`,
    text: 'Non sarete più fidanzati e per 24 ore non potrai fidanzarti con nessuno.',
    buttons: [
      { label: 'Annulla', value: null, color: '#57606f' },
      { label: '💔 Lascia', value: 'ok', color: '#c0392b' },
    ],
  });
  if (ok.action === 'ok') await leavePartner();
}

/** Salva, esce dall'account e torna alla schermata di accesso (dopo una conferma). */
async function logOut(): Promise<void> {
  const ok: GameValue = await openDialog({
    title: "🚪 Esci dall'account",
    text: isGuest()
      ? `⚠️ Sei un ospite: se esci senza salvare il personaggio, ${game.player.myData.nick} è perso per sempre. Prima salvalo dal profilo (💾).`
      : 'Il tuo personaggio viene salvato. Per rientrare ti servirà di nuovo il tuo accesso.',
    buttons: [
      { label: 'Annulla', value: null, color: '#57606f' },
      { label: 'Esci', value: 'ok', color: '#c0392b' },
    ],
  });
  if (ok.action !== 'ok') return;
  try {
    await saveGame(true);
  } catch {}
  try {
    await signOutAccount();
  } catch (error) {
    toast(error instanceof Error ? error.message : String(error), 5000);
    return;
  }
  location.reload();
}

export function switchToCode(code?: GameValue): GameValue {
  if (!game.session.OFFLINE) {
    toast('Il Sim online si apre con il tuo account (Google o nome giocatore e password).');
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
    text: "Inserisci il codice personaggio che trovi nel profilo (🧑) sull'altro dispositivo.",
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

/** Mostra la scena con una breve dissolvenza, con la telecamera già sul personaggio. */
function revealScene(): void {
  const canvas: HTMLCanvasElement = game.view.canvas;
  if (canvas.dataset.revealed) return;
  canvas.dataset.revealed = '1';
  game.cam = null;
  canvas.style.transition = 'opacity 0.35s ease-out';
  canvas.style.opacity = '1';
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
  // cancellazione dell'account chiesta e non ancora fatta: non si entra
  if (await blockedByDeletion()) return;
  game.player.myData.nick = (
    localStorage.getItem(game.session.LS_PREFIX + 'sims_player_nick') || 'Ospite'
  ).slice(0, 20);
  dom('ui-setup-screen').classList.add('hidden');
  dom('needs-hud').classList.remove('hidden');
  dom('hud-actions').classList.remove('hidden');
  if (game.session.OFFLINE) toast('🧪 Modalità prova: nessun dato viene inviato al server', 5000);
  setupControls();
  // la scena resta nascosta finché il personaggio non è al suo posto (non si vede il salone)
  game.view.canvas.style.opacity = '0';
  // se la rete è lenta non si resta comunque al buio
  setTimeout(revealScene, 8000);
  startLoop();
  watchGameVersion();
  if (devMode) {
    game.session.saveReady = true;
    game.session.hadSave = true;
    game.bodyChosen = true;
    game.player.myData.nick = 'Sim di prova';
    game.myBody = { ...currentBody() };
    game.hasSetSafePin = true;
  } else await loadGame();
  // Il primo personaggio chiede nome, aspetto e 18 anni in una schermata sola (first-entry.ts)
  const firstCharacter = !game.bodyChosen;
  if (!devMode && !firstCharacter && !(await ensureTerms())) return;
  if (game.player.isDead || game.player.healthLevel <= 0) {
    // morto in una sessione precedente, oppure durante l'assenza
    if (!game.player.isDead) await die();
    // già morto: si completa quello che allora non era arrivato online (lapide, stanza…)
    else void recordDeathUntilDone();
    revealScene();
    showDeathScreen();
    return;
  }
  // prima il personaggio (con la conferma dei 18 anni), poi il condominio
  if (firstCharacter) await openFirstCreator();
  // chi entra per la prima volta sceglie il condominio (pubblico, nuovo o quello di un amico)
  if (!game.session.hadSave) await chooseFirstWorld();
  await claimRoom();
  if (devMode) await (await import('./dev-fixture.js')).prepareDevFixture();
  // l'ospite che ha appena salvato riceve ora il bonus dell'invito con cui era arrivato
  void claimInvite(firstCharacter || !!game.session.guestSaved);
  reapAbsentPlayers();
  game.currentApt = hasRoom() ? game.aptOfRoom(game.myAssignedRoomIdx) : 0;
  game.view.currentRoomTitle = game.saloonTitle();
  // si riparte dall'ultima posizione (chi dorme o è svenuto ha già il suo posto, qui sotto)
  if (!devMode && !game.player.isSleeping && !game.fainted) await resumeLastSpot();
  // il personaggio nuovo arriva in cortile con la valigia e le chiavi (arrival.ts)
  bindCoach();
  // la freccetta gialla sul pulsante che il passo della missione dice di toccare
  startGuidePointer();
  if (!devMode && firstCharacter && !game.session.hadSave) startArrival();
  if (game.player.isSleeping && hasRoom()) {
    // si riprende nel letto in cui ci si era addormentati, anche se è di un altro giocatore
    // (l'elenco delle stanze non è ancora arrivato: si legge solo quella stanza)
    let other: GameValue = null;
    if (game.sleepRoom !== null && game.sleepRoom !== game.myAssignedRoomIdx)
      try {
        // senza risposta in tempo si dorme nel proprio letto
        other =
          (
            await withTimeout(
              game.session.db.ref(worldNode('rooms_state') + '/' + game.sleepRoom).get(),
              5000,
            )
          )?.val() ?? null;
      } catch {
        other = null;
      }
    game.view.activeEnvironment = 'PLAYER_ROOM';
    if (other && other.owner) {
      game.currentRoomIdx = game.sleepRoom;
      game.view.currentRoomTitle = `Stanza di ${other.owner}`;
      const bed: GameValue = other.layout?.bed || game.playerRoomFurniture.bed;
      game.playerPos = { x: bed.x, y: bed.y };
    } else {
      game.currentRoomIdx = game.myAssignedRoomIdx;
      game.view.currentRoomTitle = 'La tua stanza 🏠';
      game.playerPos = { x: game.playerRoomFurniture.bed.x, y: game.playerRoomFurniture.bed.y };
    }
  }
  if (game.fainted) await resumeFaintSpot();
  revealScene();
  game.session.db.ref(worldNode('rooms_state')).on('value', (snapshot?: GameValue): GameValue => {
    game.roomsState = normalizeRooms(snapshot.val());
    syncVaultFromServer();
    syncMyPinFromRoom();
    renderArtSite();
  });
  game.session.db
    .ref(worldNode('graveyard'))
    .on('value', (snap?: GameValue): GameValue => rebuildGraveyard(snap.val()));
  startPresence();
  if (game.notifyOn) void enablePush();
  startInviteRewards();
  // entrati con il link di una sfida: si propone di giocarla (dopo le finestre dell'ingresso)
  lifetime.setTimeout(() => void joinSharedChallenge(), 2500);
  watchCryo();
  // la paga di un turno che il server non aveva confermato: si riprova appena si entra
  lifetime.setTimeout(() => void flushPendingPay(), 4000);
  // con la scheda nascosta da un po' il gioco si scollega: le connessioni del piano Spark sono 100
  startDormancy();
  // quante volte si entra in ogni posto (usage.ts)
  startUsage();
  // Zero, lo scassinatore: riga sotto i parametri, annuncio delle 11:45, ladri alla mia cassaforte
  startHacker();
  // coppie: cuori accanto ai nomi, insieme, anniversari
  startCouples();
  // la cassetta dei suggerimenti: i collaboratori vedono quanti messaggi nuovi ci sono
  startSuggestions();
  // il cestino della stanza, le multe da pagare e la cassa della polizia
  startTrash();
  // assaggi di benvenuto lasciati nelle stanze
  startTaste();
  // l'ospite non può invitare: al suo posto, dopo 20 minuti, l'invito a salvare
  if (isGuest()) startGuestReminder();
  else remindInvite();
  // premi giornalieri delle personalità (dopo che le finestre d'avvio si sono chiuse)
  lifetime.setTimeout(() => void applyDailyPerks(), 4000);
  lifetime.setInterval(() => void applyDailyPerks(), 60000);
  startPlayersHud();
  startHudMenus();
  startArtMarket();
  startGossip();
  startPaintingTitles();
  startLimited();
  // negozi aperti: si aggiornano quando qualcuno compra o vende una copia in edizione limitata
  onLedgerChange(() => {
    if (!dom('clothes-modal').classList.contains('hidden')) renderClothesShop();
    if (!dom('furniture-shop-modal').classList.contains('hidden')) openFurnitureShopModal();
  });
  startProjects();
  startBetting();
  startCollect();
  updateSoundButton();
  updateNotifyButton();
  checkMissions();
  lifetime.setInterval(checkMissions, 1000);
  // la guida lunga non si apre più da sola: i primi passi li fa l'arrivo; resta sul pulsante ❓
  lifetime.setInterval((): GameValue => saveGame(false), 3000);
  lifetime.setInterval((): GameValue => {
    if (hasRoom() && !game.session.dormant)
      game.session.db
        .ref(`${worldNode('rooms_state')}/${game.myAssignedRoomIdx}/lastSeen`)
        .set(Date.now());
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
  // update: conserva i fiori già lasciati; chi muore aspetta la risposta (vedi recordDeath)
  return game.session.db.ref(worldNode('graveyard') + '/' + game.session.myPlayerId).update(g);
}
