import { buyPlant, plantLabel, smokeJoint, tendPlant } from './weed.js';
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
import { PETS, PET_FOOD_PRICE, type PetKind } from './pet-rules.js';
import { PET_OF_KEY, buyPet, feed, giveUpForAdoption, petSpots } from './pets.js';
import { DAILY_LIMITS, recordUse, usesLeftToday } from './daily-limits.js';
import {
  COIN_PRICE,
  ICE_CREAM_PRICE,
  buyIceCream,
  funSpots,
  onSofa,
  othersHere,
  toggleBench,
  toggleSofa,
  tossCoin,
} from './courtyard-fun.js';
import { STRAINS, type StrainId, growTimeText } from './weed-rules.js';
import { earthFlight, moonFlight, moonOpen, returnToEarth, travelToMoon } from './moon.js';
import { MOON_TRIP_PRICE } from './project-rules.js';
import { openRpsTable, openSlot } from './betting.js';
import { SLOT_BET } from './betting-rules.js';
import { levelOf, theftTriesFor } from './personality-rules.js';
import {
  THEFT_TRIES,
  type TheftRecord,
  decodeTheftRecord,
  recordTheftAttempt,
  theftLockLeft,
  theftTriesLeft,
} from './theft-rules.js';
import { bedtimeThought, notePersonality } from './personality.js';
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
import { openRealtyBoard } from './realty.js';
import { sendSocial } from './social.js';
import { openGossipBoard } from './gossip.js';
import { openArcadeStation } from './arcade.js';
import { ARCADE_GAMES, type ArcadeGame, isArcadeGame } from './arcade-rules.js';
import { quotedTitle } from './painting-titles.js';
import { roomPaintings, slotOfKey } from './painting-rules.js';
import { relaxWith, toast } from './missions.js';
import {
  freeRoomsInApt,
  openClothesShop,
  openWardrobe,
  placeFurniture,
  rotateFurniture,
  returnHomeFromActivity,
} from './character.js';
import { footprintOf, isoProject, isoScale } from './render/primitives.js';
import { mgButtonText, mgInteract, mgStart, openComputerShopModal } from './jobs.js';
import { coffeeLeftMs, openDealer, promptSetSafePin, useCoffee } from './needs.js';
import { showGraveInfo } from './render/objects.js';
import { startShower, startToilet, startWash } from './bathroom.js';
import { sfx } from './audio.js';
import { openBankCounter } from './bank.js';
import { openProjects, pressLaunchButton, rocketFunded, rocketLaunch } from './projects.js';
import { PROJECTS, projectGoal } from './project-rules.js';
import { avoidWallSafe, pushOutOfCorridor } from './room-layout.js';
import { managePainting, openPaintStudio } from './paint-studio.js';
import { bestOwnedByProp, nextUpgrade, TIER_LABEL, TIER_RANK, tierOf } from './furniture-tiers.js';
import { furnitureBenefit } from './furniture-benefits.js';
import { SHIFTS_PER_DAY, jobPayTier, recordShift, shiftsLeftToday } from './job-pay.js';
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
export function setWallItemPosition(obj: GameValue, x: number, y: number): void {
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
  if (game.view.activeEnvironment === 'KITCHEN') return game.kitchenFurniture;
  if (game.view.activeEnvironment === 'BATHROOM') return game.bathroomFurniture;
  if (game.view.activeEnvironment === 'SALOON') return game.saloonDoors;
  if (game.view.activeEnvironment === 'CORTILE') return game.courtyardDoors;
  if (game.view.activeEnvironment === 'negozio_mobili') return game.storeFloorFurniture;
  if (game.view.activeEnvironment === 'negozio_vestiti') return game.clothesStoreFurniture;
  if (game.view.activeEnvironment === 'banca') return game.bankFurniture;
  if (game.view.activeEnvironment === 'laboratorio') return game.artStudioFurniture;
  if (game.view.activeEnvironment === 'ingegneria') return game.engineeringFurniture;
  if (game.view.activeEnvironment === 'scommesse') return game.bettingFurniture;
  if (game.view.activeEnvironment === 'sala_giochi') return game.arcadeFurniture;
  if (game.view.activeEnvironment === 'centro_commerciale') return game.mallFurniture;
  if (game.view.activeEnvironment === 'luna') return game.moonFurniture;
  if (game.view.activeEnvironment === 'base_lunare') return game.moonbaseInsideFurniture;
  if (game.view.activeEnvironment === 'growshop') return game.growshopFurniture;
  if (game.view.activeEnvironment === 'negozio_animali') return game.petshopFurniture;
  if (game.view.activeEnvironment === 'ingegneria_esterno') return game.engineeringYardFurniture;
  if (game.view.activeEnvironment === 'CIMITERO') return game.graveMap;
  if (game.MG.active && game.view.activeEnvironment === 'lavoro_' + game.MG.job) return game.MG.map;
  if (game.view.activeEnvironment === 'bar') return game.barMap;
  if (game.view.activeEnvironment === 'discoteca') return game.discoMap;
  return {};
}

export function checkProximity(..._args: GameValue[]): GameValue {
  if (game.isMovingFurnitureMode) return;
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
    // gli oggetti molto grandi (il razzo) si raggiungono anche dal bordo: `reach` allunga la portata
    let d: GameValue =
      Math.hypot(game.playerPos.x - obj.x, game.playerPos.y - obj.y) - (obj.reach || 0);
    if (d < bestDist) {
      bestDist = d;
      found = key;
    } // l'oggetto più vicino
  });
  // cane e gatto che girano per la propria stanza
  const pets = petSpots();
  for (const key of Object.keys(pets)) {
    const d = Math.hypot(game.playerPos.x - pets[key].x, game.playerPos.y - pets[key].y);
    if (d < Math.min(bestDist, 45)) {
      bestDist = d;
      found = key;
    }
  }
  // seduti sul divano il pulsante resta quello per alzarsi
  if (onSofa() && map.sofa) found = 'sofa';
  // panchine e fontana del cortile, carretto dei gelati (seduti si resta sulla propria panchina)
  const spots = funSpots();
  for (const key of Object.keys(spots)) {
    const sp = spots[key];
    const d = Math.hypot(game.playerPos.x - sp.x, game.playerPos.y - sp.y) - sp.reach;
    if (d < bestDist || (game.benchSit && sp.fun === 'bench' && d < 40)) {
      bestDist = d;
      found = key;
    }
  }
  const pop: GameValue = dom('pop-interaction');
  const btnMove: GameValue = dom('btn-act-move');
  const btnMain: GameValue = dom('btn-act-main');
  const btnSub: GameValue = dom('btn-act-sub');
  renderOutsideMenu();
  if (found) {
    game.activeTargetProp = found;
    pop.classList.remove('hidden');
    let item: GameValue = map[found] || spots[found] || pets[found];
    // vicino a qualcosa che non è l'uscita del condominio il menu per uscire si chiude
    if (found !== 'exitHouse') game.view.isOutsideMenuOpen = false;
    if (found === 'exitHouse') {
      btnMain.innerText = game.view.isOutsideMenuOpen
        ? '🚪 Chiudi Menu Uscita'
        : '🚪 Esci dal Condominio';
      btnMain.classList.remove('btn-pop-locked');
      btnSub.classList.add('hidden');
    } else if (game.view.activeEnvironment === 'SALOON') {
      if (item.roomIdx !== undefined) {
        game.view.isOutsideMenuOpen = false;
        let room: GameValue = game.roomsState[game.gRoomIdx(item)];
        if (!room || !room.owner) {
          btnMain.innerText = `🔒 Stanza Vuota (Chiusa)`;
          btnMain.classList.add('btn-pop-locked');
          btnMove.classList.add('hidden');
          btnSub.classList.add('hidden');
          return;
        } else {
          btnMain.innerText = `🚪 Entra nella Stanza di ${room.owner}`;
          btnMain.classList.remove('btn-pop-locked');
          btnSub.classList.add('hidden');
        }
      } else {
        game.view.isOutsideMenuOpen = false;
        btnMain.innerText = `✋ ${item.name}`;
        btnMain.classList.remove('btn-pop-locked');
        btnSub.classList.add('hidden');
      }
    } else if (game.view.activeEnvironment === 'laboratorio') {
      btnMain.classList.remove('btn-pop-locked');
      btnSub.classList.add('hidden');
      btnMain.innerText = found.startsWith('easel') ? '🎨 Dipingi un quadro' : '🚪 Torna Fuori';
    } else if (game.view.activeEnvironment === 'ingegneria') {
      btnMain.classList.remove('btn-pop-locked');
      btnSub.classList.add('hidden');
      const labels: Record<string, string> = {
        projectBoard: '📌 Guarda i progetti',
        moonScreen: '📺 Guarda la diretta dalla luna',
        workbench: '🔧 Lavora al bancone',
        doorYard: '🚀 Vai nella zona esterna',
      };
      btnMain.innerText = labels[found] || '🚪 Torna Fuori';
    } else if (game.view.activeEnvironment === 'negozio_animali') {
      btnMain.classList.remove('btn-pop-locked');
      btnSub.classList.add('hidden');
      if (item.pet) {
        const info = PETS[item.pet as PetKind];
        const owned = !!game.player.pets?.[item.pet as PetKind];
        btnMain.innerText = owned
          ? `${info.emoji} Hai già un ${info.name}`
          : `${info.emoji} Compra un ${info.name} (${info.price} €)`;
        btnMain.classList.toggle('btn-pop-locked', owned);
      } else if (found === 'petCounter') btnMain.innerText = '🏡 Dai in adozione un animale';
      else btnMain.innerText = '🚪 Torna Fuori';
    } else if (game.view.activeEnvironment === 'growshop') {
      btnMain.classList.remove('btn-pop-locked');
      btnSub.classList.add('hidden');
      btnMain.innerText = item.strain
        ? `🌱 Compra ${STRAINS[item.strain as StrainId].name} (${STRAINS[item.strain as StrainId].price} €, cresce in ${growTimeText(item.strain as StrainId)})`
        : '🚪 Torna Fuori';
    } else if (game.view.activeEnvironment === 'luna' && found === 'baseDoor') {
      btnSub.classList.add('hidden');
      btnMain.classList.remove('btn-pop-locked');
      btnMain.innerText = '🚪 Entra dentro la base spaziale';
    } else if (game.view.activeEnvironment === 'base_lunare') {
      btnSub.classList.add('hidden');
      btnMain.classList.remove('btn-pop-locked');
      btnMain.innerText =
        found === 'baseConsole' ? '🖥️ Guarda il pannello di controllo' : '🚀 Esci sulla luna';
    } else if (game.view.activeEnvironment === 'luna') {
      btnSub.classList.add('hidden');
      const flight = moonFlight();
      btnMain.innerText =
        flight.phase === 'idle' ? '🌍 Torna sulla Terra' : '🚀 Il razzo è in viaggio…';
      btnMain.classList.toggle('btn-pop-locked', flight.phase !== 'idle');
    } else if (game.view.activeEnvironment === 'centro_commerciale') {
      btnMain.classList.remove('btn-pop-locked');
      btnSub.classList.add('hidden');
      if (item.fun === 'iceCream') {
        btnMain.innerText = game.iceCream
          ? '🍦 Stai mangiando il gelato…'
          : `🍦 Compra un gelato (${ICE_CREAM_PRICE} €)`;
        btnMain.classList.toggle('btn-pop-locked', !!game.iceCream);
      } else btnMain.innerText = item.enter ? `🚪 Entra: ${item.name}` : '🏠 Torna a casa';
    } else if (game.view.activeEnvironment === 'sala_giochi') {
      btnMain.classList.remove('btn-pop-locked');
      btnSub.classList.add('hidden');
      btnMain.innerText = isArcadeGame(item.game)
        ? `${ARCADE_GAMES[item.game as ArcadeGame].emoji} Sfida qualcuno a ${ARCADE_GAMES[item.game as ArcadeGame].name}`
        : '🚪 Torna Fuori';
    } else if (game.view.activeEnvironment === 'scommesse') {
      btnMain.classList.remove('btn-pop-locked');
      btnSub.classList.add('hidden');
      btnMain.innerText = found.startsWith('slot')
        ? `🎰 Gioca alla slot (${SLOT_BET} €)`
        : found === 'rpsTable'
          ? '✊ Sfida qualcuno a morra cinese'
          : '🚪 Torna Fuori';
    } else if (game.view.activeEnvironment === 'ingegneria_esterno') {
      btnMain.classList.remove('btn-pop-locked');
      btnSub.classList.add('hidden');
      if (found === 'launchButton') {
        const phase = rocketLaunch().phase;
        btnMain.innerText =
          phase === 'waiting'
            ? '🔴 Premi il pulsante: lancia il razzo!'
            : phase === 'building'
              ? '🔒 Pulsante di lancio (razzo non completo)'
              : phase === 'launched'
                ? '✅ Razzo già lanciato'
                : '⏳ Lancio in corso…';
        btnMain.classList.toggle('btn-pop-locked', phase !== 'waiting');
      } else if (found === 'rocketPad' && moonOpen()) {
        const flight = earthFlight();
        btnMain.innerText =
          flight.phase === 'idle'
            ? `🌙 Vola sulla luna (${MOON_TRIP_PRICE} €)`
            : '🚀 Il razzo è in viaggio…';
        btnMain.classList.toggle('btn-pop-locked', flight.phase !== 'idle');
      } else
        btnMain.innerText =
          found === 'rocketPad' ? '🚀 Guarda il progetto del razzo' : '🔧 Torna nel laboratorio';
    } else if (game.view.activeEnvironment === 'banca') {
      btnMain.classList.remove('btn-pop-locked');
      btnSub.classList.add('hidden');
      btnMain.innerText = found === 'bankCounter' ? '🏦 Vai allo Sportello' : '🚪 Torna Fuori';
    } else if (game.view.activeEnvironment === 'negozio_vestiti') {
      btnMain.classList.remove('btn-pop-locked');
      btnSub.classList.add('hidden');
      if (found === 'clothesCounter') btnMain.innerText = '🛍️ Catalogo: compra e rivendi';
      else if (item.slot)
        btnMain.innerText = `${game.SLOT_INFO[item.slot].icon} Guarda ${game.SLOT_INFO[item.slot].label}`;
      else btnMain.innerText = '🚪 Torna Fuori';
    } else if (game.view.activeEnvironment === 'negozio_mobili') {
      btnMain.classList.remove('btn-pop-locked');
      if (found === 'shopCounter') {
        btnMain.innerText = '🛋️ Catalogo: compra e rivendi';
        btnSub.classList.add('hidden');
      } else if (item.category) {
        // Progressione: standard → pregiato → lusso.
        const next: GameValue = nextUpgrade(
          game.furnitureCatalog,
          game.player.ownedFurniture,
          item.category,
        );
        btnSub.classList.add('hidden');
        if (!next) {
          btnMain.innerText = `✅ Già posseduto (Versione Lusso)`;
          btnMain.classList.add('btn-pop-locked');
        } else {
          const icon = { std: '🛒', premium: '💎', lux: '✨' }[tierOf(next)];
          btnMain.innerText = `${icon} Acquista ${next.name} (${next.price} €)`;
        }
      } else {
        btnMain.innerText = `🚪 Torna Fuori`;
        btnSub.classList.add('hidden');
      }
    } else if (
      game.view.activeEnvironment === 'bar' ||
      game.view.activeEnvironment === 'discoteca'
    ) {
      btnMain.innerText = '🕴️ Parla con lo spacciatore';
      btnMain.classList.remove('btn-pop-locked');
      btnSub.classList.add('hidden');
    } else if (game.MG.active && game.view.activeEnvironment === 'lavoro_' + game.MG.job) {
      btnMain.innerText = mgButtonText(item);
      btnMain.classList.toggle('btn-pop-locked', item.kind === 'target' && !game.MG.carry);
      btnSub.classList.add('hidden');
    } else if (game.view.activeEnvironment === 'CIMITERO') {
      btnMain.innerText =
        item.kind === 'memorial'
          ? '📜 Leggi il registro dei defunti'
          : `⚰️ Leggi la lapide di ${item.who}`;
      btnMain.classList.remove('btn-pop-locked');
      btnSub.classList.add('hidden');
    } else if (game.view.activeEnvironment === 'CORTILE' && item.fun) {
      btnSub.classList.add('hidden');
      btnMain.classList.remove('btn-pop-locked');
      if (item.fun === 'bench')
        btnMain.innerText = game.benchSit ? '🧍 Alzati' : '🪑 Siediti sulla panchina';
      else if (item.fun === 'realty') btnMain.innerText = '🏘️ Bacheca immobiliare: cambia stanza';
      else if (item.fun === 'gossip') btnMain.innerText = '📰 Leggi i pettegolezzi del condominio';
      else {
        btnMain.innerText = `⛲ Lancia una moneta nella fontana (${COIN_PRICE} €)`;
        btnMain.classList.toggle('btn-pop-locked', !!game.coinToss);
      }
    } else if (game.view.activeEnvironment === 'CORTILE') {
      const mine: GameValue = hasRoom() && game.aptOfRoom(game.myAssignedRoomIdx) === item.aptIdx;
      btnMain.innerText = mine
        ? '🚪 Entra nel tuo appartamento 🏠'
        : `🚪 Entra nell'Appartamento ${item.aptIdx + 1} (${freeRoomsInApt(item.aptIdx)} stanze libere)`;
      btnMain.classList.remove('btn-pop-locked');
      btnSub.classList.add('hidden');
    } else if (game.view.activeEnvironment === 'PLAYER_ROOM') {
      if (found === 'safe') {
        let isMyRoom: GameValue = isMyRoomNow();
        btnMain.innerText = isMyRoom
          ? '🔐 Apri la Cassaforte'
          : '🕵️ Prova a Rubare (Tentativo PIN)';
        btnMain.classList.remove('btn-pop-locked');
        if (isMyRoom) {
          btnSub.innerText = game.hasSetSafePin
            ? '🔑 Cambia combinazione'
            : '🔑 Imposta combinazione';
          btnSub.classList.remove('hidden');
        } else {
          btnSub.classList.add('hidden');
        }
      } else if (found === 'bed') {
        btnMain.innerText = game.player.isSleeping ? '⏰ Svegliati' : '😴 Coricati a Letto';
        btnMain.classList.remove('btn-pop-locked');
        btnSub.classList.add('hidden');
      } else if (item.pet && PET_OF_KEY[found] && isMyRoomNow()) {
        const kind = item.pet as PetKind;
        btnMain.innerText = `🍖 Dai da mangiare ${/^[aeiou]/.test(PETS[kind].name) ? "all'" : 'al '}${PETS[kind].name} (${PET_FOOD_PRICE} €)`;
        btnMain.classList.remove('btn-pop-locked');
        if (kind === 'dog') {
          btnSub.innerText = '🦮 Porta a spasso';
          btnSub.classList.remove('hidden');
        } else btnSub.classList.add('hidden');
      } else if (found.startsWith('painting')) {
        const name = quotedTitle(
          roomPaintings(game.roomsState[game.currentRoomIdx ?? -1])[slotOfKey(found) || 'p1'],
        );
        btnMain.innerText = isMyRoomNow()
          ? `🖼️ ${name || item.name}`
          : `🖼️ Ammira ${name || 'il quadro'}`;
        btnMain.classList.remove('btn-pop-locked');
        btnSub.classList.add('hidden');
      } else if (found === 'sofa' || found === 'tv') {
        btnMain.innerText =
          found === 'tv' ? '📺 Guarda la TV' : onSofa() ? '🧍 Alzati' : '🛋️ Siediti sul Divano';
        btnMain.classList.remove('btn-pop-locked');
        btnSub.classList.add('hidden');
      } else {
        btnMain.innerText = `✋ ${item.name}`;
        btnMain.classList.remove('btn-pop-locked');
        btnSub.classList.add('hidden');
      }
    } else if (game.view.activeEnvironment === 'KITCHEN') {
      btnMain.classList.remove('btn-pop-locked');
      if (found === 'fridge') {
        if (!game.view.fridgeIsOpen) {
          btnMain.innerText = '🧊 Apri Frigorifero';
          btnSub.classList.add('hidden');
        } else {
          btnMain.innerText = '🧊 Chiudi Frigorifero';
          if (!game.player.hasFoodInInventory) {
            btnSub.innerText = '🍎 Prendi Cibo (-5 €)';
            btnSub.classList.remove('hidden');
          } else {
            btnSub.classList.add('hidden');
          }
        }
      } else if (found === 'stove') {
        if (game.player.hasFoodInInventory && !game.player.foodIsCooked) {
          btnMain.innerText = '🍳 Cucina Cibo';
          btnSub.classList.add('hidden');
        } else if (game.player.foodIsCooked) {
          btnMain.innerText = '🍽️ Mangia';
          btnSub.classList.add('hidden');
        } else {
          btnMain.innerText = '🍳 Fornello (Serve Cibo)';
          btnSub.classList.add('hidden');
        }
      } else if (found === 'coffee') {
        const left: GameValue = coffeeLeftMs();
        btnMain.innerText =
          left > 0
            ? `☕ Macchina in pausa (${Math.ceil(left / 60000)} min)`
            : `☕ Prepara un caffè (+${game.COFFEE_SLEEP}% sonno, −${game.COFFEE_HEALTH}% salute)`;
        btnMain.classList.toggle('btn-pop-locked', left > 0);
        btnSub.classList.add('hidden');
      } else {
        btnMain.innerText = `✋ ${item.name}`;
        btnSub.classList.add('hidden');
      }
    } else {
      btnMain.innerText = `✋ ${item.name}`;
      btnSub.classList.add('hidden');
    }
    if (
      game.view.activeEnvironment === 'PLAYER_ROOM' &&
      (found === 'weedPot' || found === 'weedJar')
    ) {
      const mine = isMyRoomNow();
      btnSub.classList.add('hidden');
      btnMain.innerText =
        found === 'weedPot'
          ? mine
            ? plantLabel()
            : `🌱 ${item.name}`
          : mine
            ? `🚬 Fuma una canna (${game.player.weed?.grams || 0} g)`
            : '🌿 Barattolo di erba';
      btnMain.classList.toggle('btn-pop-locked', !mine);
    }
    if (game.view.activeEnvironment === 'BATHROOM') {
      const busy = !!(game.showerAnim || game.bathAnim);
      const labels: Record<string, [string, string]> = {
        shower: ['🚿 Fai la doccia', '🚿 Doccia in corso…'],
        toilet: [
          `🚽 Usa il WC (${usesLeftToday(game.player.daily, 'wc', new Date())}/${DAILY_LIMITS.wc} oggi)`,
          '🚽 Occupato…',
        ],
        sink: ['🚰 Lavati le mani', '🚰 Ti stai lavando…'],
      };
      if (labels[found]) {
        btnMain.innerText = labels[found][busy ? 1 : 0];
        btnMain.classList.toggle('btn-pop-locked', busy);
      }
    }
    if (item.moveable && isMyRoomNow()) {
      if (found === 'bed' && game.player.isSleeping) {
        btnMove.classList.add('hidden');
      } else {
        btnMove.classList.remove('hidden');
      }
    } else {
      btnMove.classList.add('hidden');
    }
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
function throughDoor(id: string): Promise<void> {
  game.doorForce[id] = performance.now() + 900;
  sfx('door');
  return new Promise((resolve) => lifetime.setTimeout(() => resolve(), 380));
}

function backToSaloon(): void {
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
function enterMoonBase(): void {
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
function exitMoonBase(): void {
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
function freeBedSlot(): number | null {
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
  if (!game.activeTargetProp) return;
  if (game.showerAnim || game.bathAnim || game.rocketTrip) return;
  let map = getCurrentFurnitureMap();
  let item: GameValue = map[game.activeTargetProp];
  if (game.view.activeEnvironment === 'CIMITERO') {
    if (item) showGraveInfo(item);
    return;
  }
  if (game.MG.active && game.view.activeEnvironment === 'lavoro_' + game.MG.job) {
    if (item) mgInteract(item, game.activeTargetProp);
    return;
  }
  if (game.view.activeEnvironment === 'bar' || game.view.activeEnvironment === 'discoteca') {
    if (item) openDealer();
    return;
  }
  if (game.view.activeEnvironment === 'CORTILE' && game.activeTargetProp === 'exitHouse') {
    // l'uscita del condominio apre il menu dei posti dove andare
    game.view.isOutsideMenuOpen = !game.view.isOutsideMenuOpen;
    game.view.outsideSubmenu = '';
    dom('btn-act-main').innerText = game.view.isOutsideMenuOpen
      ? '🚪 Chiudi Menu Uscita'
      : '🚪 Esci dal Condominio';
    renderOutsideMenu();
    return;
  }
  if (game.view.activeEnvironment === 'SALOON') {
    if (item.targetEnv === 'PLAYER_ROOM') {
      const gi: GameValue = game.gRoomIdx(item);
      let room: GameValue = game.roomsState[gi];
      if (!room || !room.owner) {
        toast('🔒 Questa stanza è vuota.');
        return;
      }
      await throughDoor('saloon:' + game.activeTargetProp);
      game.view.currentRoomTitle =
        gi === game.myAssignedRoomIdx ? `La tua stanza 🏠` : `Stanza di ${room.owner}`;
      game.currentRoomIdx = gi;
      game.view.activeEnvironment = 'PLAYER_ROOM';
      if (gi !== game.myAssignedRoomIdx) notePersonality('enterOtherRoom');
      spawnAtDoor(getCurrentFurnitureMap().doorExit);
    } else {
      await throughDoor('saloon:' + game.activeTargetProp);
      game.view.currentRoomTitle = item.title;
      game.view.activeEnvironment = item.targetEnv;
      if (item.targetEnv === 'CORTILE')
        spawnAtDoor(game.courtyardDoors['doorApt' + game.currentApt]);
      else spawnAtDoor(getCurrentFurnitureMap().doorExit);
    }
  } else if (game.view.activeEnvironment === 'CORTILE') {
    const spot = funSpots()[game.activeTargetProp];
    if (spot?.fun === 'bench') toggleBench(game.activeTargetProp);
    else if (spot?.fun === 'realty') await openRealtyBoard();
    else if (spot?.fun === 'gossip') await openGossipBoard();
    else if (spot?.fun === 'fountain') await tossCoin();
    else if (item && item.aptIdx !== undefined) {
      await throughDoor('cortile:' + game.activeTargetProp);
      game.currentApt = item.aptIdx;
      backToSaloon();
    }
  } else if (game.view.activeEnvironment === 'laboratorio') {
    if (String(game.activeTargetProp).startsWith('easel')) openPaintStudio();
    else if (game.activeTargetProp === 'doorExit') {
      backToSaloon();
    }
  } else if (game.view.activeEnvironment === 'ingegneria') {
    if (game.activeTargetProp === 'projectBoard' || game.activeTargetProp === 'moonScreen')
      openProjects(false);
    else if (game.activeTargetProp === 'workbench') workbenchMessage();
    else if (game.activeTargetProp === 'doorYard') {
      game.labDoorForceUntil = performance.now() + 900;
      sfx('door');
      lifetime.setTimeout(() => goToEngineering(true), 350);
    } else if (game.activeTargetProp === 'doorExit') backToSaloon();
  } else if (game.view.activeEnvironment === 'negozio_animali') {
    if (item?.pet) await buyPet(item.pet as PetKind);
    else if (game.activeTargetProp === 'petCounter') await giveUpForAdoption();
    else if (game.activeTargetProp === 'doorExit') backToSaloon();
  } else if (game.view.activeEnvironment === 'growshop') {
    if (item?.strain) await buyPlant(item.strain);
    else if (game.activeTargetProp === 'doorExit') backToSaloon();
  } else if (game.view.activeEnvironment === 'luna') {
    if (game.activeTargetProp === 'baseDoor') enterMoonBase();
    else if (game.activeTargetProp === 'moonRocket') await returnToEarth();
  } else if (game.view.activeEnvironment === 'base_lunare') {
    if (game.activeTargetProp === 'baseConsole') openProjects(false);
    else if (game.activeTargetProp === 'doorExit') exitMoonBase();
  } else if (game.view.activeEnvironment === 'centro_commerciale') {
    if (game.activeTargetProp === 'iceCream') await buyIceCream();
    else if (item?.enter) await doActivity(item.enter);
    else if (game.activeTargetProp === 'doorExit') backToSaloon();
  } else if (game.view.activeEnvironment === 'sala_giochi') {
    if (isArcadeGame(item?.game)) await openArcadeStation(item.game);
    else if (game.activeTargetProp === 'doorExit') backToSaloon();
  } else if (game.view.activeEnvironment === 'scommesse') {
    if (String(game.activeTargetProp).startsWith('slot')) openSlot();
    else if (game.activeTargetProp === 'rpsTable') openRpsTable();
    else if (game.activeTargetProp === 'doorExit') backToSaloon();
  } else if (game.view.activeEnvironment === 'ingegneria_esterno') {
    if (game.activeTargetProp === 'rocketPad') {
      if (moonOpen()) await travelToMoon();
      else openProjects(false);
    } else if (game.activeTargetProp === 'launchButton') await pressLaunchButton();
    else if (game.activeTargetProp === 'doorLab') goToEngineering(false);
  } else if (game.view.activeEnvironment === 'banca') {
    if (game.activeTargetProp === 'bankCounter') await openBankCounter();
    else if (game.activeTargetProp === 'doorExit') {
      backToSaloon();
    }
  } else if (game.view.activeEnvironment === 'negozio_vestiti') {
    if (game.activeTargetProp === 'doorExit') {
      backToSaloon();
    } else {
      openClothesShop(item.slot || 'top', false);
    }
  } else if (game.view.activeEnvironment === 'negozio_mobili') {
    if (game.activeTargetProp === 'shopCounter') {
      openFurnitureShopModal();
    } else if (game.activeTargetProp === 'doorExit') {
      backToSaloon();
    } else if (item.category) {
      const next: GameValue = nextUpgrade(
        game.furnitureCatalog,
        game.player.ownedFurniture,
        item.category,
      );
      if (!next) return;
      if (game.moneyLevel < next.price) {
        toast(`Non hai abbastanza soldi: ${next.name} costa ${next.price} €.`);
        return;
      }
      if (!(await purchaseItem('ownedFurniture', next.id, next.price))) return;
      const tier = tierOf(next);
      toast(
        tier === 'std'
          ? `✅ Hai acquistato ${next.name}! È comparso nella tua stanza.`
          : `${tier === 'lux' ? '✨' : '💎'} Complimenti! Hai acquistato ${next.name}: ha sostituito il modello precedente nella tua stanza!`,
      );
      announceFurnitureBenefit(next);
    }
  } else if (game.view.activeEnvironment === 'KITCHEN') {
    if (game.activeTargetProp === 'fridge') {
      game.view.fridgeIsOpen = !game.view.fridgeIsOpen;
      sfx(game.view.fridgeIsOpen ? 'fridgeOpen' : 'fridgeClose');
      // il cibo preso resta in mano anche chiudendo il frigo: serve per il fornello
    } else if (game.activeTargetProp === 'coffee') {
      useCoffee();
    } else if (game.activeTargetProp === 'stove') {
      if (game.player.hasFoodInInventory && !game.player.foodIsCooked) {
        game.player.foodIsCooked = true;
        toast('Hai cucinato il cibo! 🍽️');
      } else if (game.player.foodIsCooked) {
        game.player.hungerLevel = Math.min(100, game.player.hungerLevel + 50);
        game.player.stats.meals++;
        game.player.hasFoodInInventory = false;
        game.player.foodIsCooked = false;
        game.view.fridgeIsOpen = false;
        toast('Gnam! Fame +50%');
      }
    } else if (game.activeTargetProp === 'doorExit') {
      backToSaloon();
    }
  } else if (game.view.activeEnvironment === 'BATHROOM') {
    if (game.activeTargetProp === 'shower') {
      startShower();
    } else if (game.activeTargetProp === 'sink') {
      startWash();
    } else if (game.activeTargetProp === 'toilet') {
      if (game.showerAnim || game.bathAnim) return;
      if (usesLeftToday(game.player.daily, 'wc', new Date()) <= 0) {
        toast(`🚽 Oggi hai già usato il WC ${DAILY_LIMITS.wc} volte: riprova domani.`);
        return;
      }
      game.player.daily = recordUse(game.player.daily, 'wc', new Date());
      startToilet();
      saveGame();
    } else if (game.activeTargetProp === 'doorExit') {
      backToSaloon();
    }
  } else {
    if (game.activeTargetProp === 'doorExit') {
      backToSaloon();
    } else if (game.activeTargetProp === 'weedPot') {
      if (isMyRoomNow()) tendPlant();
      else toast('🌱 Questa pianta non è tua!');
    } else if (game.activeTargetProp === 'weedJar') {
      if (isMyRoomNow()) smokeJoint();
      else toast('🚫 Questo barattolo non è tuo!');
    } else if (game.activeTargetProp === 'bed') {
      if (!game.player.isSleeping) {
        const slot = freeBedSlot();
        if (slot === null) {
          toast('🛏️ Letto pieno, prova un altro letto.');
          return;
        }
        game.bedSlot = slot;
      }
      game.player.isSleeping = !game.player.isSleeping;
      sfx(game.player.isSleeping ? 'sleep' : 'wake');
      if (game.player.isSleeping) bedtimeThought();
      toast(game.player.isSleeping ? 'Ti sei coricato a letto 🛏️' : 'Ti sei svegliato.');
    } else if (game.activeTargetProp === 'wardrobe') {
      if (isMyRoomNow()) openWardrobe();
      else toast("🚫 Non puoi frugare nell'armadio di un altro!");
    } else if (game.activeTargetProp === 'desk') {
      openComputerShopModal();
    } else if (PET_OF_KEY[game.activeTargetProp] && isMyRoomNow()) {
      await feed(PET_OF_KEY[game.activeTargetProp]);
    } else if (game.activeTargetProp === 'sofa') {
      toggleSofa(item);
    } else if (game.activeTargetProp === 'tv') {
      relaxWith(game.activeTargetProp, item);
    } else if (game.activeTargetProp === 'safe') {
      handleSafeInteraction();
    } else if (String(game.activeTargetProp).startsWith('painting')) {
      if (isMyRoomNow()) await managePainting(game.activeTargetProp);
      else
        toast(
          `🖼️ ${quotedTitle(roomPaintings(game.roomsState[game.currentRoomIdx ?? -1])[slotOfKey(game.activeTargetProp) || 'p1']) || 'Un quadro'}, appeso nella stanza di ${game.roomsState[game.currentRoomIdx ?? -1]?.owner || 'chi abita qui'}.`,
          4000,
        );
    }
  }
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
    game.playerPos = { x: 0, y: 110 };
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
  game.view.activeEnvironment = 'ingegneria_esterno';
  game.view.currentRoomTitle = 'Zona esterna del laboratorio 🚀';
  game.playerPos = { x: 20, y: 100 };
}

/** Passa tra il laboratorio ingegneristico e la sua zona esterna (dove si costruisce il razzo). */
function goToEngineering(yard: boolean): void {
  if (yard) {
    game.view.activeEnvironment = 'ingegneria_esterno';
    game.view.currentRoomTitle = 'Zona esterna del laboratorio 🚀';
    spawnAtDoor(game.engineeringYardFurniture.doorLab);
  } else {
    game.view.activeEnvironment = 'ingegneria';
    game.view.currentRoomTitle = 'Laboratorio Ingegneristico 🔧';
    spawnAtDoor(game.engineeringFurniture.doorYard);
    // si rientra dalla porta: è aperta e si richiude alle spalle
    game.labDoorForceUntil = performance.now() + 600;
  }
}

/** Al bancone si vede a che punto sono i lavori del razzo. */
function workbenchMessage(): void {
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
function announceFurnitureBenefit(def: GameValue): void {
  const text = furnitureBenefit(def);
  if (text) toast(text, 6500, false);
}

export function openFurnitureShopModal(..._args: GameValue[]): GameValue {
  const container: GameValue = dom('furniture-catalog-container');
  container.innerHTML = '';
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
      text: `Hai già un lavoro attivo (${game.player.activeJobKey.toUpperCase()}). Se cambi perdi i turni accumulati e ricominci da 50 € a turno.`,
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
  const leftToday = shiftsLeftToday(game.player.workDay, new Date());
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
  mgStart(jobKey);
  toast(
    `💼 Turno iniziato: hai ${game.SHIFT_SECONDS} secondi! Base ${pay} € + ${tier.perItem} € per ogni oggetto consegnato. ` +
      (leftToday > 0
        ? `Oggi puoi lavorare ancora ${leftToday} ${leftToday === 1 ? 'volta' : 'volte'}.`
        : 'È il tuo ultimo turno di oggi.'),
    5000,
  );
}
