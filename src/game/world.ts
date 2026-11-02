import { bedtimeThought, notePersonality } from './personality.js';
import { purchaseItem, spendMoney, creditMoney } from './economy.js';
import type { GameValue } from './context.js';
import type { SceneMap } from './models.js';
import { game } from './context.js';
import { lifetime, dom, browser } from './runtime.js';
import {
  SAFE_PIN_HINT,
  SAFE_PIN_RE,
  getMyRoomMap,
  hasRoom,
  hashPin,
  isMyRoomNow,
  presenceAlive,
  saveGame,
  withTimeout,
} from './saves.js';
import { applyRoomBounds } from './room-size.js';
import { presenceState } from './presence-rules.js';
import { openDialog } from './interface.js';
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
import { coffeeLeftMs, openDealer, useCoffee } from './needs.js';
import { showGraveInfo } from './render/objects.js';
import { startShower } from './render/avatars.js';
import { sfx } from './audio.js';
import { openBankCounter } from './bank.js';
import { avoidWallSafe, pushOutOfCorridor } from './room-layout.js';
import { managePainting, openPaintStudio } from './paint-studio.js';
import { bestOwnedByProp, nextUpgrade, TIER_LABEL, TIER_RANK, tierOf } from './furniture-tiers.js';
import { furnitureBenefit } from './furniture-benefits.js';
import { jobPayTier } from './job-pay.js';
// Il proprietario può cambiare la combinazione della propria cassaforte quando vuole
export async function changeSafePin(..._args: GameValue[]): Promise<GameValue> {
  if (!hasRoom() || !isMyRoomNow()) return;
  const room: GameValue = game.roomsState[game.myAssignedRoomIdx ?? -1];
  if (!room || room.ownerId !== game.session.myPlayerId) return;
  const res: GameValue = await openDialog({
    title: game.hasSetSafePin ? '🔑 Cambia combinazione' : '🔑 Imposta combinazione',
    text: `Scegli la nuova combinazione segreta della cassaforte: ${SAFE_PIN_HINT}.`,
    input: { placeholder: '134', numeric: true, maxLength: 3 },
    buttons: [
      { label: 'Annulla', value: null, color: '#57606f' },
      { label: 'Salva', value: 'ok', color: '#2ed573' },
    ],
  });
  if (res.action !== 'ok') return;
  if (!SAFE_PIN_RE.test(res.value)) {
    toast('❌ Combinazione non valida: servono ' + SAFE_PIN_HINT + '.');
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
      Object.keys(room.layout).forEach(
        (k?: GameValue): GameValue => (m[k] = Object.assign({ moveable: false }, room.layout[k])),
      );
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
  if (game.view.activeEnvironment === 'CIMITERO') return game.graveMap;
  if (game.MG.active && game.view.activeEnvironment === 'lavoro_' + game.MG.job) return game.MG.map;
  if (game.view.activeEnvironment === 'bar') return game.barMap;
  if (game.view.activeEnvironment === 'discoteca') return game.discoMap;
  return {};
}

export function checkProximity(..._args: GameValue[]): GameValue {
  if (game.isMovingFurnitureMode) return;
  if (game.fainted) {
    dom('pop-interaction').classList.add('hidden');
    return;
  }
  let map = getCurrentFurnitureMap();
  let found: GameValue = null;
  let bestDist: GameValue = 65;
  Object.keys(map).forEach((key?: GameValue): GameValue => {
    let obj: GameValue = map[key];
    let d: GameValue = Math.hypot(game.playerPos.x - obj.x, game.playerPos.y - obj.y);
    if (d < bestDist) {
      bestDist = d;
      found = key;
    } // l'oggetto più vicino
  });
  const pop: GameValue = dom('pop-interaction');
  const btnMove: GameValue = dom('btn-act-move');
  const btnMain: GameValue = dom('btn-act-main');
  const btnSub: GameValue = dom('btn-act-sub');
  const btnWalk: GameValue = dom('btn-act-walk');
  const btnBar: GameValue = dom('btn-act-bar');
  const btnTrip: GameValue = dom('btn-act-trip');
  const btnFurnitureShop: GameValue = dom('btn-act-furnitureshop');
  const btnClothesShop: GameValue = dom('btn-act-clothesshop');
  const btnWork: GameValue = dom('btn-act-work');
  const btnCem: GameValue = dom('btn-act-cemetery');
  const btnDisco: GameValue = dom('btn-act-disco');
  const btnBank: GameValue = dom('btn-act-bank');
  const btnArt: GameValue = dom('btn-act-art');
  if (!game.view.isOutsideMenuOpen) {
    btnWalk.classList.add('hidden');
    btnBar.classList.add('hidden');
    btnTrip.classList.add('hidden');
    btnFurnitureShop.classList.add('hidden');
    btnClothesShop.classList.add('hidden');
    btnWork.classList.add('hidden');
    btnCem.classList.add('hidden');
    btnDisco.classList.add('hidden');
    btnBank.classList.add('hidden');
    btnArt.classList.add('hidden');
  }
  if (found) {
    game.activeTargetProp = found;
    pop.classList.remove('hidden');
    let item: GameValue = map[found];
    if (game.view.activeEnvironment === 'SALOON') {
      if (found === 'exitHouse') {
        if (!game.view.isOutsideMenuOpen) {
          btnMain.innerText = '🚪 Esci di Casa';
          btnMain.classList.remove('btn-pop-locked');
          btnSub.classList.add('hidden');
        } else {
          btnMain.innerText = '🚪 Chiudi Menu Uscita';
          btnWalk.classList.remove('hidden');
          btnBar.classList.remove('hidden');
          btnTrip.classList.remove('hidden');
          btnFurnitureShop.classList.remove('hidden');
          btnClothesShop.classList.remove('hidden');
          btnWork.classList.remove('hidden');
          btnCem.classList.remove('hidden');
          btnDisco.classList.remove('hidden');
          btnBank.classList.remove('hidden');
          btnArt.classList.remove('hidden');
        }
      } else if (item.roomIdx !== undefined) {
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
    } else if (game.view.activeEnvironment === 'banca') {
      btnMain.classList.remove('btn-pop-locked');
      btnSub.classList.add('hidden');
      btnMain.innerText = found === 'bankCounter' ? '🏦 Vai allo Sportello' : '🚪 Torna Fuori';
    } else if (game.view.activeEnvironment === 'negozio_vestiti') {
      btnMain.classList.remove('btn-pop-locked');
      btnSub.classList.add('hidden');
      if (found === 'clothesCounter') btnMain.innerText = '🛍️ Sfoglia tutto il catalogo';
      else if (item.slot)
        btnMain.innerText = `${game.SLOT_INFO[item.slot].icon} Guarda ${game.SLOT_INFO[item.slot].label}`;
      else btnMain.innerText = '🚪 Torna Fuori';
    } else if (game.view.activeEnvironment === 'negozio_mobili') {
      btnMain.classList.remove('btn-pop-locked');
      if (found === 'shopCounter') {
        btnMain.innerText = '🛋️ Apri Catalogo Web Showroom';
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
          : `🪦 Leggi la lapide di ${item.who}`;
      btnMain.classList.remove('btn-pop-locked');
      btnSub.classList.add('hidden');
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
      } else if (found.startsWith('painting')) {
        btnMain.innerText = isMyRoomNow() ? `🖼️ ${item.name}` : '🖼️ Ammira il quadro';
        btnMain.classList.remove('btn-pop-locked');
        btnSub.classList.add('hidden');
      } else if (found === 'sofa' || found === 'tv') {
        btnMain.innerText = found === 'tv' ? '📺 Guarda la TV' : '🛋️ Rilassati sul Divano';
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
    if (game.view.activeEnvironment === 'BATHROOM' && found === 'shower') {
      btnMain.innerText = game.showerAnim ? '🚿 Doccia in corso…' : '🚿 Fai la doccia';
      btnMain.classList.toggle('btn-pop-locked', !!game.showerAnim);
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

// Ritorno al salone davanti alla porta da cui si esce: stanza, cucina, bagno o uscita di casa.
function backToSaloon(): void {
  const env: GameValue = game.view.activeEnvironment;
  const doors: GameValue = game.saloonDoors;
  let door: GameValue = doors.exitHouse;
  if (env === 'KITCHEN') door = doors.kitchen;
  else if (env === 'BATHROOM') door = doors.bathroom;
  else if (env === 'CORTILE') door = doors.courtyard;
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
}

/** Cuscino libero nel letto di questa stanza (ci stanno al massimo due persone), o null se è pieno. */
function freeBedSlot(): number | null {
  const now = Date.now();
  const taken = new Set<number>();
  for (const [id, op] of Object.entries(game.onlinePlayers || {})) {
    if (id === game.session.myPlayerId || !op || op.act !== 'sleep') continue;
    if (op.env !== 'PLAYER_ROOM' || op.roomIdx !== game.currentRoomIdx) continue;
    const alive = presenceAlive(id, op, now);
    const state = presenceState(
      op,
      alive,
      now + (game.session.serverOffset || 0),
      game.SLEEP_DEPLETION_SEC,
    );
    if (state === 'gone') continue;
    // le versioni vecchie non dicono il cuscino: dormono al centro e occupano il primo
    taken.add(typeof op.bed === 'number' ? op.bed : taken.has(0) ? 1 : 0);
  }
  if (!taken.has(0)) return 0;
  if (!taken.has(1)) return 1;
  return null;
}

export async function handleObjectInteract(..._args: GameValue[]): Promise<void> {
  if (!game.activeTargetProp) return;
  if (game.showerAnim) return;
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
  if (game.view.activeEnvironment === 'SALOON') {
    if (game.activeTargetProp === 'exitHouse') {
      game.view.isOutsideMenuOpen = !game.view.isOutsideMenuOpen;
      const btnWalk: GameValue = dom('btn-act-walk');
      const btnBar: GameValue = dom('btn-act-bar');
      const btnTrip: GameValue = dom('btn-act-trip');
      const btnFurnitureShop: GameValue = dom('btn-act-furnitureshop');
      const btnClothesShop: GameValue = dom('btn-act-clothesshop');
      const btnWork: GameValue = dom('btn-act-work');
      const btnCem: GameValue = dom('btn-act-cemetery');
      const btnDisco: GameValue = dom('btn-act-disco');
      const btnBank: GameValue = dom('btn-act-bank');
      const btnArt: GameValue = dom('btn-act-art');
      if (game.view.isOutsideMenuOpen) {
        dom('btn-act-main').innerText = '🚪 Chiudi Menu Uscita';
        btnWalk.classList.remove('hidden');
        btnBar.classList.remove('hidden');
        btnTrip.classList.remove('hidden');
        btnFurnitureShop.classList.remove('hidden');
        btnClothesShop.classList.remove('hidden');
        btnWork.classList.remove('hidden');
        btnCem.classList.remove('hidden');
        btnDisco.classList.remove('hidden');
        btnBank.classList.remove('hidden');
        btnArt.classList.remove('hidden');
      } else {
        dom('btn-act-main').innerText = '🚪 Esci di Casa';
        btnWalk.classList.add('hidden');
        btnBar.classList.add('hidden');
        btnTrip.classList.add('hidden');
        btnFurnitureShop.classList.add('hidden');
        btnClothesShop.classList.add('hidden');
        btnWork.classList.add('hidden');
        btnCem.classList.add('hidden');
        btnDisco.classList.add('hidden');
        btnBank.classList.add('hidden');
        btnArt.classList.add('hidden');
      }
    } else if (item.targetEnv === 'PLAYER_ROOM') {
      const gi: GameValue = game.gRoomIdx(item);
      let room: GameValue = game.roomsState[gi];
      if (!room || !room.owner) {
        toast('🔒 Questa stanza è vuota.');
        return;
      }
      game.view.currentRoomTitle =
        gi === game.myAssignedRoomIdx ? `La tua stanza 🏠` : `Stanza di ${room.owner}`;
      game.currentRoomIdx = gi;
      game.view.activeEnvironment = 'PLAYER_ROOM';
      if (gi !== game.myAssignedRoomIdx) notePersonality('enterOtherRoom');
      spawnAtDoor(getCurrentFurnitureMap().doorExit);
    } else {
      game.view.currentRoomTitle = item.title;
      game.view.activeEnvironment = item.targetEnv;
      if (item.targetEnv === 'CORTILE')
        spawnAtDoor(game.courtyardDoors['doorApt' + game.currentApt]);
      else spawnAtDoor(getCurrentFurnitureMap().doorExit);
    }
  } else if (game.view.activeEnvironment === 'CORTILE') {
    if (item && item.aptIdx !== undefined) {
      game.currentApt = item.aptIdx;
      backToSaloon();
    }
  } else if (game.view.activeEnvironment === 'laboratorio') {
    if (String(game.activeTargetProp).startsWith('easel')) openPaintStudio();
    else if (game.activeTargetProp === 'doorExit') {
      backToSaloon();
    }
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
      if (!game.view.fridgeIsOpen) game.player.hasFoodInInventory = false;
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
      game.player.hygieneLevel = Math.min(100, game.player.hygieneLevel + 20);
      toast('Ti sei lavato mani e viso 🚰 (Igiene +20%)');
    } else if (game.activeTargetProp === 'toilet') {
      game.player.happinessLevel = Math.min(100, game.player.happinessLevel + 5);
      toast('Che sollievo! 🚽 (Felicità +5%)');
    } else if (game.activeTargetProp === 'doorExit') {
      backToSaloon();
    }
  } else {
    if (game.activeTargetProp === 'doorExit') {
      backToSaloon();
    } else if (game.activeTargetProp === 'bed') {
      if (!game.player.isSleeping) {
        const slot = freeBedSlot();
        if (slot === null) {
          toast('🛏️ Il letto è pieno: ci dormono già in due.');
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
    } else if (game.activeTargetProp === 'sofa' || game.activeTargetProp === 'tv') {
      relaxWith(game.activeTargetProp, item);
    } else if (game.activeTargetProp === 'safe') {
      handleSafeInteraction();
    } else if (String(game.activeTargetProp).startsWith('painting')) {
      if (isMyRoomNow()) await managePainting(game.activeTargetProp);
      else
        toast(
          `🖼️ Un quadro dipinto da ${game.roomsState[game.currentRoomIdx ?? -1]?.owner || 'chi abita qui'}.`,
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
    const res: GameValue = await openDialog({
      title: '🔐 Cassaforte personale',
      text:
        `In cassaforte: ${game.moneyLevel} €\n\nTutti i tuoi soldi sono qui, al sicuro sul server… a meno che qualcuno indovini il PIN!` +
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
  let tries: GameValue = game.theftAttempts[room.id] || 0;
  if (tries >= 3) {
    toast('🚨 Allarme attivo! Hai già fallito 3 volte con questa cassaforte.');
    return;
  }
  const res: GameValue = await openDialog({
    title: '🕵️ Tentativo di scasso',
    text: `Inserisci la combinazione segreta di 3 cifre (da 1 a 4).\nTentativi rimasti: ${3 - tries}`,
    input: { placeholder: '???', numeric: true, maxLength: 3 },
    buttons: [
      { label: 'Lascia stare', value: null, color: '#57606f' },
      { label: '🔓 Prova', value: 'try', color: '#e74c3c' },
    ],
  });
  if (res.action !== 'try' || !res.value) return;
  // un tentativo scritto male non conta
  if (!SAFE_PIN_RE.test(res.value)) {
    toast('❌ La combinazione è fatta di ' + SAFE_PIN_HINT + '.');
    return;
  }
  game.theftAttempts[room.id] = tries + 1;
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
      toast(`🎉 COLPO RIUSCITO! Hai rubato ${stolen} € dalla cassaforte! 💰`, 4000);
      notePersonality('theftSuccess');
    } else {
      toast('🚫 Qualcuno è stato più veloce di te: la cassaforte è vuota.');
    }
  } else {
    toast('🚨 CODICE ERRATO! Il sistema di sicurezza ha sventato il furto!');
  }
}

export async function doActivity(type?: GameValue): Promise<void> {
  game.view.isOutsideMenuOpen = false;
  dom('pop-interaction').classList.add('hidden');
  dom('btn-return-home').classList.remove('hidden');
  if (type === 'walk') {
    game.player.happinessLevel = Math.min(100, game.player.happinessLevel + 10);
    game.player.healthLevel = Math.min(100, game.player.healthLevel + 5);
    game.player.sleepLevel = Math.max(0, game.player.sleepLevel - 5); // la passeggiata stanca un po'
    game.view.activeEnvironment = 'passeggiata';
    game.view.currentRoomTitle = 'Passeggiata nel Parco 🌳';
  } else if (type === 'bar') {
    if (game.moneyLevel < 10) {
      toast('Non hai abbastanza soldi! Ti servono almeno 10 €.');
      returnHomeFromActivity();
      return;
    }
    if (!(await spendMoney(10))) {
      returnHomeFromActivity();
      return;
    }
    game.player.happinessLevel = Math.min(100, game.player.happinessLevel + 15);
    game.player.hungerLevel = Math.min(100, game.player.hungerLevel + 15);
    game.view.activeEnvironment = 'bar';
    game.view.currentRoomTitle = "Bar all'Aperto ☕";
  } else if (type === 'disco') {
    if (game.moneyLevel < game.DISCO_PRICE) {
      toast(`Non hai abbastanza soldi! L'ingresso costa ${game.DISCO_PRICE} €.`);
      returnHomeFromActivity();
      return;
    }
    if (!(await spendMoney(game.DISCO_PRICE))) {
      returnHomeFromActivity();
      return;
    }
    game.player.happinessLevel = Math.min(100, game.player.happinessLevel + game.DISCO_HAPPY);
    game.player.sleepLevel = Math.max(0, game.player.sleepLevel - game.DISCO_SLEEP);
    game.view.activeEnvironment = 'discoteca';
    game.view.currentRoomTitle = 'Discoteca 🪩';
    toast(`🪩 Si balla! Felicità +${game.DISCO_HAPPY}%, sonno −${game.DISCO_SLEEP}%`, 3500);
  } else if (type === 'cemetery') {
    game.view.activeEnvironment = 'CIMITERO';
    game.view.currentRoomTitle = `Cimitero 🪦 (${game.graveList.length} ${game.graveList.length === 1 ? 'lapide' : 'lapidi'})`;
    game.playerPos = { x: 0, y: 140 };
  } else if (type === 'trip') {
    let cost: GameValue = Math.floor(game.moneyLevel * 0.2);
    if (!(await spendMoney(cost))) {
      returnHomeFromActivity();
      return;
    }
    toast(`✈️ Viaggio pagato: -${cost} €`);
    game.player.happinessLevel = Math.min(100, game.player.happinessLevel + 70);
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
            <p>💰 ${item.price} € · ${TIER_LABEL[tierOf(item)]}</p>
            <p class="shop-item-benefit">${furnitureBenefit(item)}</p>
          </div>
          <button class="btn-buy ${isOwned ? 'owned' : ''}" data-action="buyFurnitureItem" data-arg="${item.id}">
            ${isOwned ? 'Acquistato ✓' : 'Acquista'}
          </button>
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
  if (before && TIER_RANK[tierOf(before)] > TIER_RANK[tier]) {
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

// Gestione intelligente del menu Lavoro
export function handleJobMenuAction(..._args: GameValue[]): GameValue {
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
  dom('pop-interaction').classList.add('hidden');
  dom('job-select-modal').classList.add('hidden');
  dom('btn-return-home').classList.remove('hidden');
  game.view.activeEnvironment = 'lavoro_' + jobKey;
  game.view.currentRoomTitle = jobTitleName;
  game.playerPos = { x: 0, y: 60 };
  mgStart(jobKey);
  toast(
    `💼 Turno iniziato: hai ${game.SHIFT_SECONDS} secondi! Base ${pay} € + ${tier.perItem} € per ogni oggetto consegnato`,
    3500,
  );
}
