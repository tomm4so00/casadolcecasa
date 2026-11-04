import { postGossip } from './gossip.js';
import {
  SAFE_LEVEL2_PRICE,
  isValidPin,
  maxPinDigit,
  pinHint,
  pinTooHighForLevel,
  safeLevel,
} from './safe-pin.js';
import { resaleValue } from './resale-rules.js';
import { petSpots } from './pets.js';
import { DAILY_LIMITS, recordUse, usesLeftToday } from './daily-limits.js';
import { funSpots, onSofa, othersHere } from './courtyard-fun.js';
import {} from './project-rules.js';
import {} from './betting-rules.js';
import { levelOf, theftTriesFor } from './personality-rules.js';
import {
  THEFT_TRIES,
  type TheftRecord,
  decodeTheftRecord,
  recordTheftAttempt,
  theftLockLeft,
  theftTriesLeft,
} from './theft-rules.js';
import { notePersonality } from './personality.js';
import { purchaseItem, sellItem, spendMoney, creditMoney } from './economy.js';
import type { GameValue } from './context.js';
import type { SceneMap } from './models.js';
import { game } from './context.js';
import { lifetime, dom, browser } from './runtime.js';
import {
  mySafeLevel,
  getMyRoomMap,
  hasRoom,
  hashPin,
  isMyRoomNow,
  saveGame,
  withTimeout,
} from './saves.js';
import { applyRoomBounds } from './room-size.js';
import { openDialog } from './interface.js';
import {} from './realty.js';
import { sendSocial } from './social.js';
import {} from './gossip.js';
import { LIMITED_FURNITURE } from './data/catalogues.js';
import { buyLimited, limitedLeft, myCopy } from './limited.js';
import {} from './arcade.js';
import {} from './painting-titles.js';
import { toast } from './missions.js';
import {
  placeFurniture,
  rotateFurniture,
  returnHomeFromActivity,
  setArrangeMode,
  startMovingFurniture,
} from './character.js';
import { footprintOf, isoProject, isoScale } from './render/primitives.js';
import { mgStart } from './jobs.js';
import { promptSetSafePin } from './needs.js';
import {} from './render/graveyard.js';
import { sfx } from './audio.js';
import {} from './bank.js';
import { rocketFunded } from './projects.js';
import { PROJECTS, projectGoal } from './project-rules.js';
import { avoidWallSafe, pushOutOfCorridor } from './room-layout.js';
import { bestOwnedByProp, TIER_LABEL, TIER_RANK, tierOf } from './furniture-tiers.js';
import { furnitureBenefit } from './furniture-benefits.js';
import {
  JOB_PAY_TIERS,
  SHIFTS_PER_DAY,
  jobPayTier,
  recordShift,
  shiftsLeftToday,
} from './job-pay.js';
import { interactWith, paintingTitleOf, promptFor } from './interactions.js';
// Il proprietario può cambiare la combinazione della propria cassaforte quando vuole
export async function changeSafePin(..._args: GameValue[]): Promise<GameValue> {
  if (!hasRoom() || !isMyRoomNow()) return;
  const room: GameValue = game.roomsState[game.myAssignedRoomIdx ?? -1];
  if (!room || room.ownerId !== game.session.myPlayerId) return;
  const res: GameValue = await openDialog({
    title: game.hasSetSafePin ? '🔑 Cambia combinazione' : '🔑 Imposta combinazione',
    text: `Scegli la nuova combinazione segreta della cassaforte: ${pinHint(mySafeLevel())}.`,
    input: { placeholder: mySafeLevel() >= 2 ? '152' : '134', numeric: true, maxLength: 3 },
    buttons: [
      { label: 'Annulla', value: null, color: '#57606f' },
      { label: 'Salva', value: 'ok', color: '#2ed573' },
    ],
  });
  if (res.action !== 'ok') return;
  if (!isValidPin(res.value, mySafeLevel())) {
    toast('❌ Combinazione non valida: servono ' + pinHint(mySafeLevel()) + '.');
    return;
  }
  game.safePinCode = hashPin(res.value, room.id);
  game.hasSetSafePin = true;
  game.session.db.ref(`sims_rooms_state/${game.myAssignedRoomIdx}/pin`).set(game.safePinCode);
  toast('✅ Nuova combinazione salvata!');
}

/**
 * Invio preme l'unico pulsante a schermo: quello del dialogo aperto, altrimenti dell'ultima finestra
 * aperta, altrimenti delle azioni vicino al giocatore. Con più pulsanti non fa niente.
 */
function pressOnlyButton(): boolean {
  const dialog: HTMLElement = dom('dialog-modal');
  const open = [...document.querySelectorAll<HTMLElement>('.fullscreen-modal:not(.hidden)')];
  const scope: HTMLElement | undefined = !dialog.classList.contains('hidden')
    ? dialog
    : open.at(-1) || dom('pop-interaction');
  if (!scope || scope.classList.contains('hidden')) return false;
  const buttons = [...scope.querySelectorAll<HTMLButtonElement>('button')].filter(
    (b) => !b.disabled && !b.closest('.hidden') && b.getClientRects().length > 0,
  );
  if (buttons.length !== 1) return false;
  buttons[0].click();
  return true;
}

export function setupControls(..._args: GameValue[]): GameValue {
  lifetime.listen(browser, 'keydown', (e?: GameValue): GameValue => {
    if (e.target && (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA')) return;
    let k: GameValue = e.key.toLowerCase();
    // (su un pulsante già selezionato Invio lo preme il browser da solo)
    if (k === 'enter' && !e.repeat && e.target?.tagName !== 'BUTTON' && pressOnlyButton()) {
      e.preventDefault();
      return;
    }
    if ((k === 'e' || k === ' ') && !e.repeat) {
      if (game.isMovingFurnitureMode) placeFurniture();
      else if (!dom('pop-interaction').classList.contains('hidden') && game.activeTargetProp)
        handleObjectInteract();
      e.preventDefault();
    }
    if (k === 'r' && !e.repeat && game.isMovingFurnitureMode) rotateFurniture();
    if (k === 'w' || e.code === 'ArrowUp') game.keysPressed.w = true;
    if (k === 's' || e.code === 'ArrowDown') game.keysPressed.s = true;
    if (k === 'a' || e.code === 'ArrowLeft') game.keysPressed.a = true;
    if (k === 'd' || e.code === 'ArrowRight') game.keysPressed.d = true;
    updateKeyboardMovement();
  });
  lifetime.listen(browser, 'keyup', (e?: GameValue): GameValue => {
    let k: GameValue = e.key.toLowerCase();
    if (k === 'w' || e.code === 'ArrowUp') game.keysPressed.w = false;
    if (k === 's' || e.code === 'ArrowDown') game.keysPressed.s = false;
    if (k === 'a' || e.code === 'ArrowLeft') game.keysPressed.a = false;
    if (k === 'd' || e.code === 'ArrowRight') game.keysPressed.d = false;
    updateKeyboardMovement();
  });
  const leftZone: GameValue = dom('left-touch-zone');
  const joystickEl: GameValue = dom('dynamic-joystick');
  const knobEl: GameValue = dom('joystick-knob');
  lifetime.listen(leftZone, 'touchstart', (e?: GameValue): GameValue => {
    // In modalità "Sposta Mobile" il dito trascina il mobile invece di muovere il personaggio
    if (
      game.isMovingFurnitureMode &&
      e.touches.length > 0 &&
      startFurnitureDrag(e.touches[0].clientX, e.touches[0].clientY)
    )
      return;
    for (let touch of e.changedTouches) {
      if (game.joystickTouchId === null) {
        game.joystickTouchId = touch.identifier;
        game.joystickOrigin = { x: touch.clientX, y: touch.clientY };
        joystickEl.style.left = `${touch.clientX}px`;
        joystickEl.style.top = `${touch.clientY}px`;
        joystickEl.style.display = 'block';
      }
    }
  });
  lifetime.listen(leftZone, 'touchmove', (e?: GameValue): GameValue => {
    if (game.isDraggingFurniture && e.touches.length > 0) {
      moveFurnitureToPointer(e.touches[0].clientX, e.touches[0].clientY);
      return;
    }
    for (let touch of e.changedTouches) {
      if (touch.identifier === game.joystickTouchId) {
        let dx: GameValue = touch.clientX - game.joystickOrigin.x;
        let dy: GameValue = touch.clientY - game.joystickOrigin.y;
        let dist: GameValue = Math.hypot(dx, dy);
        let maxR: GameValue = 40;
        if (dist > maxR) {
          dx = (dx / dist) * maxR;
          dy = (dy / dist) * maxR;
        }
        knobEl.style.transform = `translate(calc(-50% + ${dx}px), calc(-50% + ${dy}px))`;
        game.moveRight = dx / maxR;
        game.moveForward = -dy / maxR;
      }
    }
  });
  const resetJoy: GameValue = (e?: GameValue): GameValue => {
    game.isDraggingFurniture = false;
    for (let touch of e.changedTouches) {
      if (touch.identifier === game.joystickTouchId) {
        game.joystickTouchId = null;
        if (!isKeyActive()) {
          game.moveForward = 0;
          game.moveRight = 0;
        }
        joystickEl.style.display = 'none';
      }
    }
  };
  lifetime.listen(leftZone, 'touchend', resetJoy);
  lifetime.listen(leftZone, 'touchcancel', resetJoy);
  // Spostamento mobili col mouse: lo strato del joystick copre il canvas,
  // quindi ascoltiamo lui e la finestra (prima gli eventi sul canvas non arrivavano mai)
  lifetime.listen(
    leftZone,
    'mousedown',
    (e?: GameValue): GameValue => startFurnitureDrag(e.clientX, e.clientY),
  );
  lifetime.listen(browser, 'mousemove', (e?: GameValue): GameValue => {
    if (game.isDraggingFurniture) moveFurnitureToPointer(e.clientX, e.clientY);
  });
  lifetime.listen(browser, 'mouseup', (): GameValue => {
    game.isDraggingFurniture = false;
  });
}

// Converte un punto dello schermo in coordinate del pavimento e ci sposta il mobile
export function moveFurnitureToPointer(clientX?: GameValue, clientY?: GameValue): GameValue {
  if (!game.isMovingFurnitureMode || !game.movingPropKey) return;
  const obj = getCurrentFurnitureMap()[game.movingPropKey];
  if (!obj) return;
  const rect: GameValue = game.view.canvas.getBoundingClientRect();
  const s: GameValue = isoScale(),
    o: GameValue = isoProject(0, 0, 0);
  const a: GameValue = (clientX - rect.left - o.x) / (0.866 * s); // x - y
  const b: GameValue = (clientY - rect.top - o.y) / (0.5 * s); // x + y
  setFurniturePosition(obj, (a + b) / 2, (b - a) / 2);
}

export function startFurnitureDrag(clientX?: GameValue, clientY?: GameValue): GameValue {
  if (!game.isMovingFurnitureMode || !game.movingPropKey) return false;
  game.isDraggingFurniture = true;
  moveFurnitureToPointer(clientX, clientY);
  return true;
}

// Tiene il mobile dentro le pareti della stanza
export function setFurniturePosition(obj?: GameValue, x?: GameValue, y?: GameValue): GameValue {
  if (obj.wallItem) {
    setWallItemPosition(obj, x, y);
    return;
  }
  const fp: GameValue = footprintOf(obj);
  obj.x = Math.max(-200 + fp.w / 2 + 4, Math.min(200 - fp.w / 2 - 4, x));
  obj.y = Math.max(-180 + fp.h / 2 + 4, Math.min(180 - fp.h / 2 - 4, y));
  // Nella stanza il passaggio dall'ingresso alla cassaforte deve restare libero.
  if (game.view.activeEnvironment === 'PLAYER_ROOM') {
    const free = pushOutOfCorridor({ x: obj.x, y: obj.y, w: fp.w, h: fp.h });
    obj.x = free.x;
    obj.y = free.y;
  }
}

// Un oggetto da parete scorre lungo la parete di fondo (y = -180) o quella di sinistra (x = -200).
function setWallItemPosition(obj: GameValue, x: number, y: number): void {
  const half = obj.w / 2 + 6;
  const onBack = obj.y <= -160;
  const minX = -200 + half,
    minY = -180 + half;
  let back = y + 180 <= x + 200;
  // Con tastiera o joystick si cambia parete spingendo il quadro oltre l'angolo.
  if (onBack && x <= minX && y > obj.y + 0.5) back = false;
  else if (!onBack && y <= minY && x > obj.x + 0.5) back = true;
  if (back) {
    obj.y = -165;
    obj.x = Math.max(minX, Math.min(200 - half, x));
  } else {
    obj.x = -185;
    obj.y = avoidWallSafe(Math.max(minY, Math.min(180 - half, y)), obj.w, minY, 180 - half);
  }
}

export function isKeyActive(..._args: GameValue[]): GameValue {
  return game.keysPressed.w || game.keysPressed.s || game.keysPressed.a || game.keysPressed.d;
}

export function updateKeyboardMovement(..._args: GameValue[]): GameValue {
  let fwd: GameValue = 0,
    rt: GameValue = 0;
  if (game.keysPressed.w) fwd += 1;
  if (game.keysPressed.s) fwd -= 1;
  if (game.keysPressed.a) rt -= 1;
  if (game.keysPressed.d) rt += 1;
  if (fwd !== 0 || rt !== 0) {
    game.moveForward = fwd;
    game.moveRight = rt;
  } else if (game.joystickTouchId === null) {
    game.moveForward = 0;
    game.moveRight = 0;
  }
}

export function toggleSprint(..._args: GameValue[]): GameValue {
  game.isSprinting = !game.isSprinting;
  dom('btn-sprint').classList.toggle('active', game.isSprinting);
}

/** Dove stanno mobili e oggetti di ogni ambiente: il campo di `game` (alcuni si rifanno durante il gioco). */
const ENV_MAPS: Record<string, string> = {
  KITCHEN: 'kitchenFurniture',
  BATHROOM: 'bathroomFurniture',
  SALOON: 'saloonDoors',
  CORTILE: 'courtyardDoors',
  negozio_mobili: 'storeFloorFurniture',
  negozio_vestiti: 'clothesStoreFurniture',
  banca: 'bankFurniture',
  laboratorio: 'artStudioFurniture',
  ingegneria: 'engineeringFurniture',
  scommesse: 'bettingFurniture',
  sala_giochi: 'arcadeFurniture',
  centro_commerciale: 'mallFurniture',
  luna: 'moonFurniture',
  base_lunare: 'moonbaseInsideFurniture',
  growshop: 'growshopFurniture',
  negozio_animali: 'petshopFurniture',
  CIMITERO: 'graveMap',
  bar: 'barMap',
  discoteca: 'discoMap',
};

export function getCurrentFurnitureMap(..._args: GameValue[]): SceneMap {
  if (game.view.activeEnvironment === 'PLAYER_ROOM') {
    if (isMyRoomNow()) return getMyRoomMap();
    // Stanza di un altro: mostra i suoi mobili come li ha sistemati lui
    let room: GameValue = game.roomsState[game.currentRoomIdx ?? -1];
    if (room && room.layout) {
      let m: GameValue = {};
      const free: string[] = [];
      Object.keys(room.layout).forEach((k?: GameValue): GameValue => {
        // cane e gatto non sono mobili: girano per la stanza (vedi pets.ts)
        if (room.layout[k]?.free) free.push(room.layout[k].free);
        else m[k] = Object.assign({ moveable: false }, room.layout[k]);
      });
      game.visitFreePets = free;
      // La cassaforte è sempre a muro, anche nelle disposizioni pubblicate prima di questa versione.
      m.safe = { ...game.playerRoomFurniture.safe, moveable: false };
      return m;
    }
    return Object.assign({}, game.playerRoomFurniture);
  }
  const env = game.view.activeEnvironment;
  const field = ENV_MAPS[env];
  if (field) return (game as GameValue)[field];
  if (game.MG.active && env === 'lavoro_' + game.MG.job) return game.MG.map;
  return {};
}

export function checkProximity(..._args: GameValue[]): GameValue {
  const mine = isMyRoomNow();
  if (!mine && game.arrangeMode) setArrangeMode(false);
  dom('btn-arrange').classList.toggle('hidden', !mine || game.isMovingFurnitureMode);
  if (game.isMovingFurnitureMode) return;
  // in modalità Arreda contano solo i mobili che si possono spostare
  const arrange: boolean = game.arrangeMode;
  if (game.fainted || game.rocketTrip) {
    // svenuto o a bordo del razzo: niente pulsanti
    dom('pop-interaction').classList.add('hidden');
    return;
  }
  let map = getCurrentFurnitureMap();
  let found: GameValue = null;
  let bestDist: GameValue = 65;
  Object.keys(map).forEach((key?: GameValue): GameValue => {
    let obj: GameValue = map[key];
    if (arrange && (!obj.moveable || (key === 'bed' && game.player.isSleeping))) return;
    // gli oggetti molto grandi (il razzo) si raggiungono anche dal bordo: `reach` allunga la portata
    let d: GameValue =
      Math.hypot(game.playerPos.x - obj.x, game.playerPos.y - obj.y) - (obj.reach || 0);
    if (d < bestDist) {
      bestDist = d;
      found = key;
    } // l'oggetto più vicino
  });
  // cane e gatto che girano per la propria stanza
  // a letto si ignorano cane e gatto: il pulsante resta "Svegliati"
  const pets = arrange || game.player.isSleeping ? {} : petSpots();
  for (const key of Object.keys(pets)) {
    const d = Math.hypot(game.playerPos.x - pets[key].x, game.playerPos.y - pets[key].y);
    if (d < Math.min(bestDist, 45)) {
      bestDist = d;
      found = key;
    }
  }
  // seduti sul divano il pulsante resta quello per alzarsi
  if (onSofa() && map.sofa && !arrange) found = 'sofa';
  // panchine e fontana del cortile, carretto dei gelati (seduti si resta sulla propria panchina)
  const spots = arrange ? {} : funSpots();
  for (const key of Object.keys(spots)) {
    const sp = spots[key];
    const d = Math.hypot(game.playerPos.x - sp.x, game.playerPos.y - sp.y) - sp.reach;
    if (d < bestDist || (game.benchSit && sp.fun === 'bench' && d < 40)) {
      bestDist = d;
      found = key;
    }
  }
  // a letto il pulsante resta sempre quello per svegliarsi
  if (game.player.isSleeping && map.bed && !arrange) found = 'bed';
  const pop: GameValue = dom('pop-interaction');
  const btnMain: GameValue = dom('btn-act-main');
  const btnSub: GameValue = dom('btn-act-sub');
  renderOutsideMenu();
  if (found) {
    game.activeTargetProp = found;
    pop.classList.remove('hidden');
    let item: GameValue = map[found] || spots[found] || pets[found];
    // vicino a qualcosa che non è l'uscita del condominio il menu per uscire si chiude
    if (found !== 'exitHouse') game.view.isOutsideMenuOpen = false;
    const name = String(found).startsWith('painting')
      ? paintingTitleOf(found) || item.name
      : item.name;
    const p = arrange ? { text: `🖐️ Sposta ${name}` } : promptFor(found, item);
    btnMain.innerText = p.text;
    btnMain.classList.toggle('btn-pop-locked', !!p.locked);
    if (p.sub) {
      btnSub.innerText = p.sub;
      btnSub.classList.remove('hidden');
    } else btnSub.classList.add('hidden');
  } else {
    game.activeTargetProp = null;
    if (!game.view.isOutsideMenuOpen) {
      pop.classList.add('hidden');
    }
  }
}

// Menu "Esci di casa": i luoghi principali, più due gruppi che si aprono con un tocco
// (attività ricreative e negozi) e il pulsante Indietro per tornare all'elenco principale.
const OUTSIDE_MENU: Record<'' | 'fun', string[]> = {
  '': [
    'btn-act-fun',
    'btn-act-mall',
    'btn-act-work',
    'btn-act-bank',
    'btn-act-art',
    'btn-act-eng',
    'btn-act-cemetery',
  ],
  fun: ['btn-act-walk', 'btn-act-bar', 'btn-act-trip', 'btn-act-disco', 'btn-act-back'],
};
const OUTSIDE_BUTTONS = [...new Set(Object.values(OUTSIDE_MENU).flat())];

/** Mostra i pulsanti del menu di uscita giusti (nessuno se il menu è chiuso). */
export function renderOutsideMenu(): void {
  const shown = game.view.isOutsideMenuOpen ? OUTSIDE_MENU[game.view.outsideSubmenu || ''] : [];
  for (const id of OUTSIDE_BUTTONS) dom(id)?.classList.toggle('hidden', !shown.includes(id));
}

/** Apre un gruppo del menu di uscita ('' torna all'elenco principale). */
export function openOutsideSubmenu(sub: string): void {
  game.view.outsideSubmenu = sub === 'fun' ? sub : '';
  renderOutsideMenu();
}

// Fa comparire il personaggio appena oltre la porta, spostato verso il centro dell'ambiente.
export function spawnAtDoor(door: GameValue): void {
  if (!door) {
    game.playerPos = { x: 0, y: 0 };
    return;
  }
  const step = 45;
  game.playerPos =
    Math.abs(door.x) > Math.abs(door.y)
      ? { x: door.x - Math.sign(door.x) * step, y: door.y }
      : { x: door.x, y: door.y - Math.sign(door.y) * step };
}

/**
 * Al rientro riporta il giocatore dov'era: la sua ultima presenza online (che resta salvata anche
 * quando esce) dice ambiente, stanza, appartamento e posizione; se non c'è (modalità prova, rete
 * lenta) si usa la copia salvata sul dispositivo. Vale solo per i posti di casa
 * (salone, cucina, bagno, cortile, stanze): lavori, gite e locali ripartono dal salone.
 */
export async function resumeLastSpot(): Promise<boolean> {
  let op: GameValue = null;
  try {
    const snap: GameValue = await withTimeout(
      game.session.db.ref('sims_online_players/' + game.session.myPlayerId).once('value'),
      4000,
    );
    op = snap && snap.val();
  } catch (e: GameValue) {}
  if (!op)
    try {
      const local: GameValue = JSON.parse(
        localStorage.getItem(game.session.LS_PREFIX + 'sims_last_spot') || 'null',
      );
      // sullo stesso dispositivo può giocare anche qualcun altro: vale solo la propria copia
      if (local && local.id === game.session.myPlayerId) op = local;
    } catch (e: GameValue) {}
  if (!op || !Number.isFinite(op.x) || !Number.isFinite(op.y)) return false;
  const env: string = op.env;
  if (game.APT_ENVS.includes(env)) {
    if (Number.isInteger(op.apt) && op.apt >= 0 && op.apt < game.APT_COUNT)
      game.currentApt = op.apt;
    game.view.currentRoomTitle =
      env === 'SALOON'
        ? game.saloonTitle()
        : game.saloonDoors[env === 'KITCHEN' ? 'kitchen' : 'bathroom'].title || '';
  } else if (env === 'CORTILE') {
    game.view.currentRoomTitle = game.saloonDoors.courtyard.title || '';
  } else if (env === 'PLAYER_ROOM') {
    const room: GameValue = Number.isInteger(op.roomIdx) ? game.roomsState[op.roomIdx] : null;
    if (!room || !room.owner) return false;
    game.currentRoomIdx = op.roomIdx;
    game.currentApt = game.aptOfRoom(op.roomIdx);
    game.view.currentRoomTitle =
      op.roomIdx === game.myAssignedRoomIdx ? 'La tua stanza 🏠' : `Stanza di ${room.owner}`;
  } else return false;
  game.view.activeEnvironment = env;
  applyRoomBounds(env);
  game.playerPos = {
    x: Math.max(game.X0 + 30, Math.min(game.X1 - 30, op.x)),
    y: Math.max(game.Y0 + 30, Math.min(game.Y1 - 30, op.y)),
  };
  return true;
}

// Ritorno al salone davanti alla porta da cui si esce (stanza, cucina, bagno, cortile);
// da fuori (lavoro, negozi, gite…) si rientra invece dall'uscita del condominio, nel cortile.
/** La porta si spalanca (con il suo rumore) e dopo un attimo si passa dall'altra parte. */
export function throughDoor(id: string): Promise<void> {
  game.doorForce[id] = performance.now() + 900;
  sfx('door');
  return new Promise((resolve) => lifetime.setTimeout(() => resolve(), 380));
}

export function backToSaloon(): void {
  const env: GameValue = game.view.activeEnvironment;
  if (MALL_SHOPS[env]) {
    backToMall(env);
    return;
  }
  const doors: GameValue = game.saloonDoors;
  if (!['KITCHEN', 'BATHROOM', 'CORTILE', 'PLAYER_ROOM'].includes(env)) {
    backToCourtyardGate();
    return;
  }
  let door: GameValue = doors.courtyard;
  if (env === 'KITCHEN') door = doors.kitchen;
  else if (env === 'BATHROOM') door = doors.bathroom;
  else if (env === 'PLAYER_ROOM')
    door =
      Object.values(doors).find(
        (d: GameValue): GameValue =>
          d.targetEnv === 'PLAYER_ROOM' &&
          d.roomIdx === (game.currentRoomIdx ?? 0) % game.ROOMS_PER_APT,
      ) || door;
  game.view.activeEnvironment = 'SALOON';
  game.view.currentRoomTitle = game.saloonTitle();
  spawnAtDoor(door);
  const doorKey = Object.keys(doors).find((k) => doors[k] === door);
  if (doorKey) game.doorForce['saloon:' + doorKey] = performance.now() + 500;
}

/** Rientro da fuori: si ricompare nel cortile, appena dentro l'uscita del condominio. */
export function backToCourtyardGate(): void {
  game.view.activeEnvironment = 'CORTILE';
  game.view.currentRoomTitle = game.saloonDoors.courtyard.title || 'Cortile Condominiale';
  applyRoomBounds('CORTILE');
  spawnAtDoor(game.courtyardDoors.exitHouse);
}

// ---------------------------------------------------------------- viaggio

/** Viaggio: uno al giorno, a prezzo fisso. */
const TRIP_PRICE = 100;
const TRIP_HAPPY = 50;
const TRIP_HEALTH = 15;

// ---------------------------------------------------------------- base spaziale lunare

/** Si entra nella base finita dal portellone del primo modulo. */
export function enterMoonBase(): void {
  if ((game.moonBaseStage || 0) < 3) {
    toast('🔒 La base lunare non è ancora finita.');
    return;
  }
  sfx('door');
  game.view.activeEnvironment = 'base_lunare';
  game.view.currentRoomTitle = 'Base spaziale lunare 🌙';
  game.playerPos = { x: 0, y: 120 };
  toast('🌙 Benvenuto nella base spaziale lunare! Qui puoi toglierti il casco.', 4500);
}

/** Dal portellone si torna sulla luna, davanti alla base. */
export function exitMoonBase(): void {
  sfx('door');
  const d: GameValue = game.moonFurniture.baseDoor || { x: 162, y: -20 };
  game.view.activeEnvironment = 'luna';
  game.view.currentRoomTitle = 'Luna 🌙';
  game.playerPos = { x: d.x + 6, y: d.y + 36 };
}

// ---------------------------------------------------------------- centro commerciale

/** Negozi del centro commerciale: ambiente → vetrina (e attività per entrarci). */
const MALL_SHOPS: Record<string, { facade: string; activity: string }> = {
  negozio_mobili: { facade: 'shopFurniture', activity: 'furnitureshop' },
  negozio_vestiti: { facade: 'shopClothes', activity: 'clothesshop' },
  scommesse: { facade: 'shopBetting', activity: 'betting' },
  sala_giochi: { facade: 'shopArcade', activity: 'arcade' },
  growshop: { facade: 'shopGrow', activity: 'growshop' },
  negozio_animali: { facade: 'shopPets', activity: 'petshop' },
};

/** Esce da un negozio e torna nel centro commerciale, davanti alla sua vetrina. */
function backToMall(fromEnv?: string): void {
  game.view.activeEnvironment = 'centro_commerciale';
  game.view.currentRoomTitle = 'Centro Commerciale 🏬';
  const facade: GameValue = fromEnv ? game.mallFurniture[MALL_SHOPS[fromEnv].facade] : null;
  game.playerPos = facade
    ? { x: facade.x, y: facade.y + facade.h / 2 + 30 }
    : { x: 0, y: game.mallFurniture.doorExit.y - 45 };
}

/**
 * Cuscini presi dagli altri che dormono nel letto di questa stanza: cuscino → id di chi ci dorme
 * (se per sbaglio sono in due sullo stesso, vale l'id "più piccolo").
 */
function bedSlotsTaken(): Map<number, string> {
  const taken = new Map<number, string>();
  if (game.view.activeEnvironment !== 'PLAYER_ROOM') return taken;
  for (const [id, op] of othersHere()) {
    if (op.act !== 'sleep') continue;
    // le versioni vecchie non dicono il cuscino: dormono al centro e occupano il primo
    const slot = typeof op.bed === 'number' ? op.bed : taken.has(0) ? 1 : 0;
    const prev = taken.get(slot);
    if (prev === undefined || id < prev) taken.set(slot, id);
  }
  return taken;
}

/** Cuscino libero nel letto di questa stanza (ci stanno al massimo due persone), o null se è pieno. */
export function freeBedSlot(): number | null {
  const taken = bedSlotsTaken();
  if (!taken.has(0)) return 0;
  if (!taken.has(1)) return 1;
  return null;
}

/**
 * Ogni fotogramma, mentre si dorme: se ci si è coricati nello stesso istante di un altro sullo
 * stesso cuscino (o al rientro il proprio cuscino è stato preso), chi ha l'id "più grande" passa
 * all'altro cuscino; se il letto è pieno si alza. Così due persone non si sovrappongono mai.
 */
export function keepOwnPillow(): void {
  if (!game.player.isSleeping || game.view.activeEnvironment !== 'PLAYER_ROOM') return;
  const taken = bedSlotsTaken();
  const other = taken.get(game.bedSlot);
  if (other === undefined || other > String(game.session.myPlayerId)) return;
  const alt = game.bedSlot === 0 ? 1 : 0;
  if (!taken.has(alt)) {
    game.bedSlot = alt;
    return;
  }
  game.player.isSleeping = false;
  sfx('wake');
  toast('🛏️ Letto pieno, prova un altro letto.');
}

export async function handleObjectInteract(..._args: GameValue[]): Promise<void> {
  const key: string | null = game.activeTargetProp;
  if (!key) return;
  if (game.showerAnim || game.bathAnim || game.rocketTrip) return;
  if (game.arrangeMode && isMyRoomNow()) {
    startMovingFurniture();
    return;
  }
  await interactWith(key, getCurrentFurnitureMap()[key]);
}

export async function handleSafeInteraction(..._args: GameValue[]): Promise<GameValue> {
  const room: GameValue = game.roomsState[game.currentRoomIdx ?? -1];
  if (!room) return;
  const vaultRef: GameValue = game.session.db.ref(
    `sims_rooms_state/${game.currentRoomIdx}/vaultMoney`,
  );
  if (isMyRoomNow()) {
    const buttons: GameValue = [{ label: 'Chiudi', value: null, color: '#57606f' }];
    buttons.push({
      label: game.hasSetSafePin ? '🔑 Cambia combinazione' : '🔑 Imposta combinazione',
      value: 'pin',
      color: '#2ed573',
    });
    const level = mySafeLevel();
    const res: GameValue = await openDialog({
      title: `🔐 Cassaforte personale · Livello ${level}`,
      text:
        `In cassaforte: ${game.moneyLevel} €\n\nTutti i tuoi soldi sono qui, al sicuro sul server… a meno che qualcuno indovini il PIN!` +
        `\n\nCombinazione: ${pinHint(level)}.` +
        (level < 2
          ? `\n🔐 Con la cassaforte livello 2 (negozio di mobili, ${SAFE_LEVEL2_PRICE} €) puoi usare anche il 5: è più difficile da indovinare.`
          : '') +
        (game.hasSetSafePin ? '' : '\n\n⚠️ La cassaforte non ha ancora un PIN.'),
      buttons,
    });
    if (res.action === 'pin') changeSafePin();
    return;
  }
  if (!room.pin) {
    toast('🔒 Questa cassaforte non è protetta o è vuota.');
    return;
  }
  if (!(room.vaultMoney > 0)) {
    toast("🚫 La cassaforte di questo giocatore è vuota! Non c'è nulla da rubare.");
    return;
  }
  // I tentativi sono salvati online: ricaricare la pagina non li azzera.
  const theftRef = game.session.db.ref(`sims_theft/${game.session.myPlayerId}/${room.id}`);
  // ora del server, con un piccolo margine perché il database non accetta orari nel futuro
  const serverNow = (): number => Date.now() + (game.session.serverOffset || 0) - 2000;
  let record: TheftRecord | null = null;
  try {
    record = decodeTheftRecord((await withTimeout(theftRef.get(), 8000)).val());
  } catch {
    toast('📡 Connessione assente: riprova tra poco.');
    return;
  }
  const alarmOn = (r: TheftRecord | null): void => {
    const hours = Math.max(1, Math.ceil(theftLockLeft(r, serverNow(), maxTries) / 3600000));
    toast(
      `🚨 Allarme attivo! Hai già sbagliato ${maxTries} volte con questa cassaforte. Riprova tra ${hours} ${hours === 1 ? 'ora' : 'ore'}.`,
      4500,
    );
  };
  // il Criminale ha più tentativi, di più a ogni livello
  const maxTries = theftTriesFor(levelOf(game.player.personality, 'criminal'), THEFT_TRIES);
  const tries = maxTries - theftTriesLeft(record, serverNow(), maxTries);
  if (tries >= maxTries) {
    alarmOn(record);
    return;
  }
  // la cassaforte livello 2 accetta combinazioni con le cifre fino a 5
  const level = safeLevel(room.economy?.ownedFurniture);
  const res: GameValue = await openDialog({
    title: `🕵️ Tentativo di scasso · Cassaforte livello ${level}`,
    text: `Inserisci la combinazione segreta di 3 cifre (da 1 a ${maxPinDigit(level)}).\nTentativi rimasti: ${maxTries - tries}`,
    input: { placeholder: '???', numeric: true, maxLength: 3 },
    buttons: [
      { label: 'Lascia stare', value: null, color: '#57606f' },
      { label: '🔓 Prova', value: 'try', color: '#e74c3c' },
    ],
  });
  if (res.action !== 'try' || !res.value) return;
  // un tentativo scritto male non conta
  if (!isValidPin(res.value, level)) {
    toast('❌ La combinazione è fatta di ' + pinHint(level) + '.');
    return;
  }
  // il tentativo si registra online prima di sapere se la combinazione è giusta
  let saved: TheftRecord | null = null;
  try {
    const result = await withTimeout(
      theftRef.transaction((cur: GameValue) => {
        saved = recordTheftAttempt(decodeTheftRecord(cur), serverNow(), maxTries);
        return saved ?? undefined;
      }),
      8000,
    );
    if (!result.committed) saved = null;
  } catch {
    saved = null;
  }
  if (!saved) {
    alarmOn(record);
    return;
  }
  game.theftAttempts[room.id] = (saved as TheftRecord).n;
  notePersonality('theftAttempt');
  if (room.pin === hashPin(res.value, room.id) || room.pin === res.value) {
    let stolen: GameValue = 0;
    const r: GameValue = await vaultRef.transaction((v?: GameValue): GameValue => {
      stolen = v || 0;
      return 0;
    });
    if (r && r.committed && stolen > 0) {
      if (!(await creditMoney(stolen))) return;
      saveGame(true);
      sfx('theft');
      toast(`🎉 COLPO RIUSCITO! Hai rubato ${stolen} € dalla cassaforte! 💰`, 4000);
      // la vittima scopre chi è stato (e il ladro diventa suo nemico)
      if (room.ownerId) void sendSocial(room.ownerId, { type: 'theft', amt: stolen });
      // per tutti gli altri il ladro resta misterioso: si sa solo di chi era la cassaforte
      postGossip(
        `La cassaforte di ${room.owner || 'qualcuno'} è stata svuotata da un ladro misterioso 🕵️ (${stolen} €)`,
        room.ownerId ? [room.ownerId] : [],
      );
      notePersonality('theftSuccess');
    } else {
      toast('🚫 Qualcuno è stato più veloce di te: la cassaforte è vuota.');
    }
  } else {
    const left = maxTries - (saved as TheftRecord).n;
    toast(
      left > 0
        ? `🚨 CODICE ERRATO! Il sistema di sicurezza ha sventato il furto! Tentativi rimasti: ${left}`
        : '🚨 CODICE ERRATO! Allarme attivo: con questa cassaforte potrai riprovare tra 24 ore.',
      4500,
    );
  }
}

export async function doActivity(type?: GameValue): Promise<void> {
  game.view.isOutsideMenuOpen = false;
  game.view.outsideSubmenu = '';
  dom('pop-interaction').classList.add('hidden');
  dom('btn-return-home').classList.remove('hidden');
  if (type === 'walk') {
    if (usesLeftToday(game.player.daily, 'walk', new Date()) <= 0) {
      toast(`🌳 Hai già fatto ${DAILY_LIMITS.walk} passeggiate oggi: riprova domani!`);
      returnHomeFromActivity();
      return;
    }
    game.player.daily = recordUse(game.player.daily, 'walk', new Date());
    saveGame();
    game.player.happinessLevel = Math.min(100, game.player.happinessLevel + 10);
    game.player.healthLevel = Math.min(100, game.player.healthLevel + 5);
    game.player.sleepLevel = Math.max(0, game.player.sleepLevel - 5); // la passeggiata stanca un po'
    game.view.activeEnvironment = 'passeggiata';
    game.view.currentRoomTitle = 'Passeggiata nel Parco 🌳';
  } else if (type === 'bar') {
    if (usesLeftToday(game.player.daily, 'bar', new Date()) <= 0) {
      toast(`☕ Sei già andato al bar ${DAILY_LIMITS.bar} volte oggi: riprova domani!`);
      returnHomeFromActivity();
      return;
    }
    if (game.moneyLevel < 10) {
      toast('Non hai abbastanza soldi! Ti servono almeno 10 €.');
      returnHomeFromActivity();
      return;
    }
    if (!(await spendMoney(10))) {
      returnHomeFromActivity();
      return;
    }
    game.player.daily = recordUse(game.player.daily, 'bar', new Date());
    saveGame();
    game.player.happinessLevel = Math.min(100, game.player.happinessLevel + 15);
    game.player.hungerLevel = Math.min(100, game.player.hungerLevel + 15);
    game.view.activeEnvironment = 'bar';
    game.view.currentRoomTitle = "Bar all'Aperto ☕";
  } else if (type === 'disco') {
    if (usesLeftToday(game.player.daily, 'disco', new Date()) <= 0) {
      toast(`🕺 Sei già andato in discoteca ${DAILY_LIMITS.disco} volte oggi: riprova domani!`);
      returnHomeFromActivity();
      return;
    }
    if (game.moneyLevel < game.DISCO_PRICE) {
      toast(`Non hai abbastanza soldi! L'ingresso costa ${game.DISCO_PRICE} €.`);
      returnHomeFromActivity();
      return;
    }
    if (!(await spendMoney(game.DISCO_PRICE))) {
      returnHomeFromActivity();
      return;
    }
    game.player.daily = recordUse(game.player.daily, 'disco', new Date());
    saveGame();
    game.player.happinessLevel = Math.min(100, game.player.happinessLevel + game.DISCO_HAPPY);
    game.player.sleepLevel = Math.max(0, game.player.sleepLevel - game.DISCO_SLEEP);
    game.view.activeEnvironment = 'discoteca';
    game.view.currentRoomTitle = 'Discoteca 🕺';
    toast(`🕺 Si balla! Felicità +${game.DISCO_HAPPY}%, sonno −${game.DISCO_SLEEP}%`, 3500);
  } else if (type === 'cemetery') {
    game.view.activeEnvironment = 'CIMITERO';
    game.view.currentRoomTitle = `Cimitero ⚰️ (${game.graveList.length} ${game.graveList.length === 1 ? 'lapide' : 'lapidi'})`;
    game.playerPos = { x: 0, y: 140 };
  } else if (type === 'trip') {
    if (usesLeftToday(game.player.daily, 'trip', new Date()) <= 0) {
      toast('✈️ Hai già fatto un viaggio oggi: il prossimo domani!');
      returnHomeFromActivity();
      return;
    }
    if (game.moneyLevel < TRIP_PRICE) {
      toast(`Non hai abbastanza soldi! Il viaggio costa ${TRIP_PRICE} €.`);
      returnHomeFromActivity();
      return;
    }
    if (!(await spendMoney(TRIP_PRICE))) {
      returnHomeFromActivity();
      return;
    }
    game.player.daily = recordUse(game.player.daily, 'trip', new Date());
    game.player.happinessLevel = Math.min(100, game.player.happinessLevel + TRIP_HAPPY);
    game.player.healthLevel = Math.min(100, game.player.healthLevel + TRIP_HEALTH);
    toast(
      `✈️ Buon viaggio! −${TRIP_PRICE} €, Felicità +${TRIP_HAPPY}%, Salute +${TRIP_HEALTH}%`,
      4000,
    );
    saveGame();
    game.view.activeEnvironment = 'viaggio';
    game.view.currentRoomTitle = 'Viaggio ✈️';
  } else if (type === 'clothesshop') {
    game.view.activeEnvironment = 'negozio_vestiti';
    game.view.currentRoomTitle = 'Boutique Dolce Casa 👗';
    dom('btn-return-home').classList.add('hidden');
    game.playerPos = { x: 0, y: 110 };
    return;
  } else if (type === 'art') {
    game.view.activeEnvironment = 'laboratorio';
    game.view.currentRoomTitle = 'Laboratorio Artistico 🎨';
    dom('btn-return-home').classList.add('hidden');
    game.playerPos = { x: 0, y: 110 };
    return;
  } else if (type === 'mall') {
    backToMall();
    dom('btn-return-home').classList.add('hidden');
    return;
  } else if (type === 'petshop') {
    game.view.activeEnvironment = 'negozio_animali';
    game.view.currentRoomTitle = 'Negozio di Animali 🐾';
    dom('btn-return-home').classList.add('hidden');
    game.playerPos = { x: 0, y: 110 };
    return;
  } else if (type === 'growshop') {
    game.view.activeEnvironment = 'growshop';
    game.view.currentRoomTitle = 'Grow Shop 🌿';
    dom('btn-return-home').classList.add('hidden');
    game.playerPos = { x: 0, y: 110 };
    return;
  } else if (type === 'arcade') {
    game.view.activeEnvironment = 'sala_giochi';
    game.view.currentRoomTitle = 'Sala Giochi 🕹️';
    dom('btn-return-home').classList.add('hidden');
    game.playerPos = { x: 0, y: 110 };
    return;
  } else if (type === 'betting') {
    game.view.activeEnvironment = 'scommesse';
    game.view.currentRoomTitle = 'Sala Scommesse 🎰';
    dom('btn-return-home').classList.add('hidden');
    game.playerPos = { x: 0, y: 110 };
    return;
  } else if (type === 'engineering') {
    game.view.activeEnvironment = 'ingegneria';
    game.view.currentRoomTitle = 'Laboratorio Ingegneristico 🔧';
    dom('btn-return-home').classList.add('hidden');
    game.playerPos = { x: 0, y: 310 };
    return;
  } else if (type === 'bank') {
    game.view.activeEnvironment = 'banca';
    game.view.currentRoomTitle = 'Banca Dolce Casa 🏦';
    dom('btn-return-home').classList.add('hidden');
    game.playerPos = { x: 0, y: 110 };
    return;
  } else if (type === 'furnitureshop') {
    game.view.activeEnvironment = 'negozio_mobili';
    game.view.currentRoomTitle = 'Negozio di Mobili 🛋️';
    dom('btn-return-home').classList.add('hidden');
    game.playerPos = { x: 0, y: 110 };
    return;
  }
  game.playerPos = { x: 0, y: 80 };
}

/** Porta il personaggio davanti al razzo per vedere il lancio (dal pulsante del conto alla rovescia). */
export function goToLaunchSite(): void {
  if (game.player.isDead || game.fainted) return;
  if (game.activeShift || game.MG.active) {
    toast('💼 Finisci prima il turno di lavoro!');
    return;
  }
  if (game.player.isSleeping) {
    toast('😴 Prima svegliati: scendi dal letto!');
    return;
  }
  if (game.showerAnim || game.bathAnim) return;
  game.view.isOutsideMenuOpen = false;
  game.view.outsideSubmenu = '';
  dom('pop-interaction').classList.add('hidden');
  dom('btn-return-home').classList.add('hidden');
  game.view.activeEnvironment = 'ingegneria';
  game.view.currentRoomTitle = 'Zona esterna del laboratorio 🚀';
  game.playerPos = { x: 20, y: -100 };
}

/** Al bancone si vede a che punto sono i lavori del razzo. */
export function workbenchMessage(): void {
  const stage = game.rocketStage || 0;
  const left = (projectGoal(PROJECTS.rocket) - rocketFunded()).toLocaleString('it-IT');
  toast(
    stage >= 2
      ? '🔧 Il razzo è completo! Sul bancone si progettano già le prossime idee…'
      : stage === 1
        ? `🔧 Stai lucidando un pezzo del razzo. Per completarlo mancano ${left} €: versali alla bacheca!`
        : '🔧 Sul bancone ci sono i disegni del razzo: per iniziare i lavori servono 5.000 € versati alla bacheca.',
    5500,
  );
}

// Dopo un acquisto spiega al giocatore cosa fa il mobile.
export function announceFurnitureBenefit(def: GameValue): void {
  const text = furnitureBenefit(def);
  if (text) toast(text, 6500, false);
}

export function openFurnitureShopModal(..._args: GameValue[]): GameValue {
  const container: GameValue = dom('furniture-catalog-container');
  container.innerHTML = '';
  // in cima i mobili in edizione limitata: poche copie numerate, si comprano una volta sola
  for (const def of LIMITED_FURNITURE) {
    const n = myCopy(def.id);
    const left = limitedLeft(def.id);
    const card: GameValue = document.createElement('div');
    card.className = 'shop-item-card ltd';
    card.innerHTML = `
          <div class="shop-item-info">
            <h4>${def.name}</h4>
            <p class="ltd-tag">💎 Edizione limitata · ${n ? `tua: copia #${n}/${def.limited}` : left ? `ne restano ${left} su ${def.limited}` : 'esaurita'}</p>
            <p>💰 ${def.price.toLocaleString('it-IT')} €</p>
          </div>
          ${n || !left ? '' : `<button class="btn-buy" type="button">Acquista</button>`}`;
    card
      .querySelector('button')
      ?.addEventListener('click', () => void buyLimited(def.id, def.price));
    container.appendChild(card);
  }
  game.furnitureCatalog.forEach((item?: GameValue): GameValue => {
    const isOwned: GameValue = game.player.ownedFurniture[item.id];
    const card: GameValue = document.createElement('div');
    card.className = 'shop-item-card';
    card.innerHTML = `
          <div class="shop-item-info">
            <h4>${item.name}</h4>
            <p>💰 ${item.price} € · ${item.category === 'safe' ? 'Livello 2 🔐' : TIER_LABEL[tierOf(item)]}</p>
            <p class="shop-item-benefit">${furnitureBenefit(item)}</p>
          </div>
          ${
            isOwned
              ? `<button class="btn-buy btn-sell" data-action="sellFurnitureItem" data-arg="${item.id}">💸 Rivendi ${resaleValue(item.price)} €</button>`
              : `<button class="btn-buy" data-action="buyFurnitureItem" data-arg="${item.id}">Acquista</button>`
          }
        `;
    container.appendChild(card);
  });
  dom('furniture-shop-modal').classList.remove('hidden');
}

export async function buyFurnitureItem(itemId: string): Promise<void> {
  const definition = game.furnitureCatalog.find((item: { id: string }) => item.id === itemId);
  if (!definition) return;
  const price: number = definition.price;
  if (game.player.ownedFurniture[itemId]) {
    toast('Hai già acquistato questo mobile!');
    return;
  }
  if (game.moneyLevel < price) {
    toast('Non hai abbastanza soldi per acquistare questo mobile!');
    return;
  }
  const before: GameValue = bestOwnedByProp(game.furnitureCatalog, game.player.ownedFurniture).get(
    definition.propKey,
  );
  if (!(await purchaseItem('ownedFurniture', itemId, price))) return;
  const tier = tierOf(definition);
  if (definition.category === 'safe') {
    toast('🔐 Cassaforte livello 2 installata nella parete della tua stanza!');
  } else if (before && TIER_RANK[tierOf(before)] > TIER_RANK[tier]) {
    toast(`Acquistato! Nella stanza resta però ${before.name}, che è di una fascia superiore.`);
  } else if (tier === 'lux') {
    toast('✨ Versione di lusso acquistata! Ha sostituito il modello precedente nella tua stanza.');
  } else if (tier === 'premium') {
    toast('💎 Versione pregiata acquistata! È comparsa nella tua stanza.');
  } else {
    toast('Mobile standard acquistato e posizionato nella tua stanza! 🛋️');
  }
  announceFurnitureBenefit(definition);
  openFurnitureShopModal();
}

/** Rivende un mobile comprato: si riprende l'85% del prezzo e nella stanza torna il modello sotto. */
export async function sellFurnitureItem(itemId: string): Promise<void> {
  const definition = game.furnitureCatalog.find((item: { id: string }) => item.id === itemId);
  if (!definition || !game.player.ownedFurniture[itemId]) return;
  if (game.isMovingFurnitureMode) {
    toast('Prima finisci di spostare il mobile.');
    return;
  }
  const refund = resaleValue(definition.price);
  const res: GameValue = await openDialog({
    title: `💸 Rivendere ${definition.name}?`,
    text: `L'avevi pagato ${definition.price} €: rivendendolo ricevi ${refund} € (il 15% in meno).
Sparirà dalla tua stanza (se hai un modello più semplice, tornerà quello).`,
    buttons: [
      { label: 'Annulla', value: null },
      { label: `Rivendi (${refund} €)`, value: 'sell', color: '#e67e22' },
    ],
  });
  if (res.action !== 'sell') return;
  if (!(await sellItem('ownedFurniture', itemId, refund))) return;
  sfx('coin');
  toast(`💸 Hai rivenduto ${definition.name}: +${refund} € in cassaforte.`, 3500);
  saveGame(true);
  openFurnitureShopModal();
  // senza la cassaforte livello 2 il 5 non è più permesso: se la combinazione lo usa va cambiata
  const room: GameValue = game.roomsState[game.myAssignedRoomIdx ?? -1];
  if (
    definition.category === 'safe' &&
    room &&
    pinTooHighForLevel(room.pin, room.id, mySafeLevel())
  )
    void promptSetSafePin(
      `La cassaforte è tornata al livello 1, che accetta solo le cifre da 1 a 4, e la tua combinazione contiene un 5. Scegline una nuova: ${pinHint(1)}.`,
    );
}

// Gestione intelligente del menu Lavoro
/** Avvisa se oggi si è già andati al lavoro il numero massimo di volte. */
function workLimitReached(): boolean {
  if (shiftsLeftToday(game.player.workDay, new Date()) > 0) return false;
  void openDialog({
    title: '💼 Basta lavoro per oggi',
    text: `Oggi sei già andato al lavoro ${SHIFTS_PER_DAY} volte, il massimo in un giorno. Riposati: potrai tornare al lavoro domani, dopo mezzanotte.`,
    buttons: [{ label: 'Ok', value: 'ok' }],
  });
  return true;
}

export function handleJobMenuAction(..._args: GameValue[]): GameValue {
  if (workLimitReached()) return;
  const modal: GameValue = dom('job-select-modal');
  modal.classList.remove('hidden');
  let statusText: GameValue = game.player.activeJobKey
    ? `Attivo: ${game.player.activeJobKey.toUpperCase()}`
    : 'Nessun lavoro attivo';
  dom('current-job-status').innerText = 'Lavoro Attivo: ' + statusText;
  Object.keys(game.player.jobExperience).forEach((key?: GameValue): GameValue => {
    let el: GameValue = dom('count-' + key);
    if (el) el.innerText = game.player.jobExperience[key];
  });
  const choicesContainer: GameValue = dom('job-choices-container');
  const continueContainer: GameValue = dom('job-continue-container');
  const titleEl: GameValue = dom('job-modal-title');
  if (!game.player.activeJobKey) {
    // Se non ha un lavoro attivo, mostra direttamente le scelte
    titleEl.innerText = '💼 Agenzia di Lavoro';
    choicesContainer.classList.remove('hidden');
    continueContainer.classList.add('hidden');
  } else {
    // Dal secondo turno dello stesso lavoro, mostra Continua o Cambia
    titleEl.innerText = '💼 Gestione Lavoro Attivo';
    choicesContainer.classList.add('hidden');
    continueContainer.classList.remove('hidden');
  }
}

export function showJobAgencySelection(..._args: GameValue[]): GameValue {
  dom('job-modal-title').innerText = '💼 Agenzia di Lavoro';
  dom('job-choices-container').classList.remove('hidden');
  dom('job-continue-container').classList.add('hidden');
}

export function continueCurrentJob(..._args: GameValue[]): GameValue {
  if (!game.player.activeJobKey) return;
  let jobTitles: GameValue = {
    cantiere: 'Cantiere 🏗️',
    ospedale: 'Ospedale 🏥',
    ristorante: 'Ristorante 🍳',
    ufficio: 'Ufficio 💻',
  };
  chooseOrGoToJob(
    game.player.activeJobKey,
    jobTitles[game.player.activeJobKey] || game.player.activeJobKey,
  );
}

export async function chooseOrGoToJob(
  jobKey?: GameValue,
  jobTitleName?: GameValue,
): Promise<GameValue> {
  if (game.player.activeJobKey && game.player.activeJobKey !== jobKey) {
    const res: GameValue = await openDialog({
      title: '⚠️ Cambiare lavoro?',
      text: `Hai già un lavoro attivo (${game.player.activeJobKey.toUpperCase()}). Se cambi perdi i turni accumulati e ricominci da ${JOB_PAY_TIERS[0].base} € a turno.`,
      buttons: [
        { label: 'No', value: null, color: '#57606f' },
        { label: 'Sì, cambia', value: 'ok', color: '#e74c3c' },
      ],
    });
    if (res.action !== 'ok') return;
    game.player.jobExperience[game.player.activeJobKey] = 0;
  }
  if (game.player.sleepLevel < 10 || game.player.healthLevel < 15) {
    toast('😵 Sei troppo stanco o malato per lavorare. Riposati prima!');
    return;
  }
  if (workLimitReached()) return;
  game.player.workDay = recordShift(game.player.workDay, new Date());
  game.player.activeJobKey = jobKey;
  const tier = jobPayTier((game.player.jobExperience[jobKey] || 0) + 1);
  const pay: number = tier.base;
  game.activeShift = {
    jobKey,
    title: jobTitleName,
    pay,
    perItem: tier.perItem,
    delivered: 0,
    remaining: game.SHIFT_SECONDS,
  };
  game.view.isOutsideMenuOpen = false;
  game.view.outsideSubmenu = '';
  dom('pop-interaction').classList.add('hidden');
  dom('job-select-modal').classList.add('hidden');
  dom('btn-return-home').classList.remove('hidden');
  game.view.activeEnvironment = 'lavoro_' + jobKey;
  game.view.currentRoomTitle = jobTitleName;
  game.playerPos = { x: 0, y: 60 };
  // tempo, paga e compito li mostra il riquadro del lavoro; i turni rimasti li dice la fine del turno
  mgStart(jobKey);
}
