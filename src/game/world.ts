import type { GameValue } from './context.js';
import { game } from './context.js';
import { lifetime, dom, browser } from './runtime.js';
import { getMyRoomMap, hasRoom, hashPin, isMyRoomNow, saveGame } from './saves.js';
import { openDialog } from './interface.js';
import { relaxWith, toast } from './missions.js';
import {
  freeRoomsInApt,
  openClothesShop,
  openWardrobe,
  placeFurniture,
  returnHomeFromActivity,
} from './character.js';
import { isoProject, isoScale } from './render/primitives.js';
import { mgButtonText, mgInteract, mgStart, openComputerShopModal } from './jobs.js';
import { coffeeLeftMs, openDealer, useCoffee } from './needs.js';
import { showGraveInfo } from './render/objects.js';
import { startShower } from './render/avatars.js';
import { sfx } from './audio.js';
// Il proprietario può cambiare la combinazione della propria cassaforte quando vuole
export async function changeSafePin(..._args: GameValue[]): Promise<GameValue> {
  if (!hasRoom() || !isMyRoomNow()) return;
  const room: GameValue = game.roomsState[game.myAssignedRoomIdx];
  if (!room || room.ownerId !== game.myPlayerId) return;
  const res: GameValue = await openDialog({
    title: game.hasSetSafePin ? '🔑 Cambia combinazione' : '🔑 Imposta combinazione',
    text: 'Scegli la nuova combinazione segreta della cassaforte: 3 cifre da 1 a 5 (es. 135).',
    input: { placeholder: '135', numeric: true, maxLength: 3 },
    buttons: [
      { label: 'Annulla', value: null, color: '#57606f' },
      { label: 'Salva', value: 'ok', color: '#2ed573' },
    ],
  });
  if (res.action !== 'ok') return;
  if (!/^[1-5]{3}$/.test(res.value)) {
    toast('❌ Combinazione non valida: servono 3 cifre da 1 a 5.');
    return;
  }
  game.safePinCode = hashPin(res.value, room.id);
  game.hasSetSafePin = true;
  game.db.ref(`sims_rooms_state/${game.myAssignedRoomIdx}/pin`).set(game.safePinCode);
  toast('✅ Nuova combinazione salvata!');
}

export function setupControls(..._args: GameValue[]): GameValue {
  lifetime.listen(browser, 'keydown', (e?: GameValue): GameValue => {
    if (e.target && (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA')) return;
    let k: GameValue = e.key.toLowerCase();
    if ((k === 'e' || k === ' ') && !e.repeat) {
      if (game.isMovingFurnitureMode) placeFurniture();
      else if (!dom('pop-interaction').classList.contains('hidden') && game.activeTargetProp)
        handleObjectInteract();
      e.preventDefault();
    }
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
  const obj: GameValue = getCurrentFurnitureMap()[game.movingPropKey];
  if (!obj) return;
  const rect: GameValue = game.canvas.getBoundingClientRect();
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
  obj.x = Math.max(-200 + obj.w / 2 + 4, Math.min(200 - obj.w / 2 - 4, x));
  obj.y = Math.max(-180 + obj.h / 2 + 4, Math.min(180 - obj.h / 2 - 4, y));
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

export function getCurrentFurnitureMap(..._args: GameValue[]): GameValue {
  if (game.activeEnvironment === 'PLAYER_ROOM') {
    if (isMyRoomNow()) return getMyRoomMap();
    // Stanza di un altro: mostra i suoi mobili come li ha sistemati lui
    let room: GameValue = game.roomsState[game.currentRoomIdx];
    if (room && room.layout) {
      let m: GameValue = {};
      Object.keys(room.layout).forEach(
        (k?: GameValue): GameValue => (m[k] = Object.assign({ moveable: false }, room.layout[k])),
      );
      return m;
    }
    return Object.assign({}, game.playerRoomFurniture);
  }
  if (game.activeEnvironment === 'KITCHEN') return game.kitchenFurniture;
  if (game.activeEnvironment === 'BATHROOM') return game.bathroomFurniture;
  if (game.activeEnvironment === 'SALOON') return game.saloonDoors;
  if (game.activeEnvironment === 'CORTILE') return game.courtyardDoors;
  if (game.activeEnvironment === 'negozio_mobili') return game.storeFloorFurniture;
  if (game.activeEnvironment === 'negozio_vestiti') return game.clothesStoreFurniture;
  if (game.activeEnvironment === 'CIMITERO') return game.graveMap;
  if (game.MG.active && game.activeEnvironment === 'lavoro_' + game.MG.job) return game.MG.map;
  if (game.activeEnvironment === 'bar') return game.barMap;
  if (game.activeEnvironment === 'discoteca') return game.discoMap;
  return {};
}

export function checkProximity(..._args: GameValue[]): GameValue {
  if (game.isMovingFurnitureMode) return;
  let map: GameValue = getCurrentFurnitureMap();
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
  if (!game.isOutsideMenuOpen) {
    btnWalk.classList.add('hidden');
    btnBar.classList.add('hidden');
    btnTrip.classList.add('hidden');
    btnFurnitureShop.classList.add('hidden');
    btnClothesShop.classList.add('hidden');
    btnWork.classList.add('hidden');
    btnCem.classList.add('hidden');
    btnDisco.classList.add('hidden');
  }
  if (found) {
    game.activeTargetProp = found;
    pop.classList.remove('hidden');
    let item: GameValue = map[found];
    if (game.activeEnvironment === 'SALOON') {
      if (found === 'exitHouse') {
        if (!game.isOutsideMenuOpen) {
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
        }
      } else if (item.roomIdx !== undefined) {
        game.isOutsideMenuOpen = false;
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
        game.isOutsideMenuOpen = false;
        btnMain.innerText = `✋ ${item.name}`;
        btnMain.classList.remove('btn-pop-locked');
        btnSub.classList.add('hidden');
      }
    } else if (game.activeEnvironment === 'negozio_vestiti') {
      btnMain.classList.remove('btn-pop-locked');
      btnSub.classList.add('hidden');
      if (found === 'clothesCounter') btnMain.innerText = '🛍️ Sfoglia tutto il catalogo';
      else if (item.slot)
        btnMain.innerText = `${game.SLOT_INFO[item.slot].icon} Guarda ${game.SLOT_INFO[item.slot].label}`;
      else btnMain.innerText = '🚪 Torna Fuori';
    } else if (game.activeEnvironment === 'negozio_mobili') {
      btnMain.classList.remove('btn-pop-locked');
      if (found === 'shopCounter') {
        btnMain.innerText = '🛋️ Apri Catalogo Web Showroom';
        btnSub.classList.add('hidden');
      } else if (item.category) {
        let stdItem: GameValue = game.furnitureCatalog.find(
          (f?: GameValue): GameValue => f.category === item.category && !f.isLuxury,
        );
        let luxItem: GameValue = game.furnitureCatalog.find(
          (f?: GameValue): GameValue => f.category === item.category && f.isLuxury,
        );
        let hasStd: GameValue = game.ownedFurniture[stdItem.id];
        let hasLux: GameValue = game.ownedFurniture[luxItem.id];
        if (!hasStd) {
          btnMain.innerText = `🛒 Acquista ${stdItem.name} (${stdItem.price} €)`;
          btnSub.classList.add('hidden');
        } else if (!hasLux) {
          btnMain.innerText = `✨ Acquista Versione Lusso ${luxItem.name} (${luxItem.price} €)`;
          btnSub.classList.add('hidden');
        } else {
          btnMain.innerText = `✅ Già posseduto (Versione Lusso)`;
          btnMain.classList.add('btn-pop-locked');
          btnSub.classList.add('hidden');
        }
      } else {
        btnMain.innerText = `🚪 Torna Fuori`;
        btnSub.classList.add('hidden');
      }
    } else if (game.activeEnvironment === 'bar' || game.activeEnvironment === 'discoteca') {
      btnMain.innerText = '🕴️ Parla con lo spacciatore';
      btnMain.classList.remove('btn-pop-locked');
      btnSub.classList.add('hidden');
    } else if (game.MG.active && game.activeEnvironment === 'lavoro_' + game.MG.job) {
      btnMain.innerText = mgButtonText(item);
      btnMain.classList.toggle('btn-pop-locked', item.kind === 'target' && !game.MG.carry);
      btnSub.classList.add('hidden');
    } else if (game.activeEnvironment === 'CIMITERO') {
      btnMain.innerText =
        item.kind === 'memorial'
          ? '📜 Leggi il registro dei defunti'
          : `🪦 Leggi la lapide di ${item.who}`;
      btnMain.classList.remove('btn-pop-locked');
      btnSub.classList.add('hidden');
    } else if (game.activeEnvironment === 'CORTILE') {
      const mine: GameValue = hasRoom() && game.aptOfRoom(game.myAssignedRoomIdx) === item.aptIdx;
      btnMain.innerText = mine
        ? '🚪 Entra nel tuo appartamento 🏠'
        : `🚪 Entra nell'Appartamento ${item.aptIdx + 1} (${freeRoomsInApt(item.aptIdx)} stanze libere)`;
      btnMain.classList.remove('btn-pop-locked');
      btnSub.classList.add('hidden');
    } else if (game.activeEnvironment === 'PLAYER_ROOM') {
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
        btnMain.innerText = game.isSleeping ? '⏰ Svegliati' : '😴 Coricati a Letto';
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
    } else if (game.activeEnvironment === 'KITCHEN') {
      btnMain.classList.remove('btn-pop-locked');
      if (found === 'fridge') {
        if (!game.fridgeIsOpen) {
          btnMain.innerText = '🧊 Apri Frigorifero';
          btnSub.classList.add('hidden');
        } else {
          btnMain.innerText = '🧊 Chiudi Frigorifero';
          if (!game.hasFoodInInventory) {
            btnSub.innerText = '🍎 Prendi Cibo (-5 €)';
            btnSub.classList.remove('hidden');
          } else {
            btnSub.classList.add('hidden');
          }
        }
      } else if (found === 'stove') {
        if (game.hasFoodInInventory && !game.foodIsCooked) {
          btnMain.innerText = '🍳 Cucina Cibo';
          btnSub.classList.add('hidden');
        } else if (game.foodIsCooked) {
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
    if (game.activeEnvironment === 'BATHROOM' && found === 'shower') {
      btnMain.innerText = game.showerAnim ? '🚿 Doccia in corso…' : '🚿 Fai la doccia';
      btnMain.classList.toggle('btn-pop-locked', !!game.showerAnim);
    }
    if (item.moveable && isMyRoomNow()) {
      if (found === 'bed' && game.isSleeping) {
        btnMove.classList.add('hidden');
      } else {
        btnMove.classList.remove('hidden');
      }
    } else {
      btnMove.classList.add('hidden');
    }
  } else {
    game.activeTargetProp = null;
    if (!game.isOutsideMenuOpen) {
      pop.classList.add('hidden');
    }
  }
}

export function handleObjectInteract(..._args: GameValue[]): GameValue {
  if (!game.activeTargetProp) return;
  if (game.showerAnim) return;
  let map: GameValue = getCurrentFurnitureMap();
  let item: GameValue = map[game.activeTargetProp];
  if (game.activeEnvironment === 'CIMITERO') {
    if (item) showGraveInfo(item);
    return;
  }
  if (game.MG.active && game.activeEnvironment === 'lavoro_' + game.MG.job) {
    if (item) mgInteract(item, game.activeTargetProp);
    return;
  }
  if (game.activeEnvironment === 'bar' || game.activeEnvironment === 'discoteca') {
    if (item) openDealer();
    return;
  }
  if (game.activeEnvironment === 'SALOON') {
    if (game.activeTargetProp === 'exitHouse') {
      game.isOutsideMenuOpen = !game.isOutsideMenuOpen;
      const btnWalk: GameValue = dom('btn-act-walk');
      const btnBar: GameValue = dom('btn-act-bar');
      const btnTrip: GameValue = dom('btn-act-trip');
      const btnFurnitureShop: GameValue = dom('btn-act-furnitureshop');
      const btnClothesShop: GameValue = dom('btn-act-clothesshop');
      const btnWork: GameValue = dom('btn-act-work');
      const btnCem: GameValue = dom('btn-act-cemetery');
      const btnDisco: GameValue = dom('btn-act-disco');
      if (game.isOutsideMenuOpen) {
        dom('btn-act-main').innerText = '🚪 Chiudi Menu Uscita';
        btnWalk.classList.remove('hidden');
        btnBar.classList.remove('hidden');
        btnTrip.classList.remove('hidden');
        btnFurnitureShop.classList.remove('hidden');
        btnClothesShop.classList.remove('hidden');
        btnWork.classList.remove('hidden');
        btnCem.classList.remove('hidden');
        btnDisco.classList.remove('hidden');
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
      }
    } else if (item.targetEnv === 'PLAYER_ROOM') {
      const gi: GameValue = game.gRoomIdx(item);
      let room: GameValue = game.roomsState[gi];
      if (!room || !room.owner) {
        toast('🔒 Questa stanza è vuota.');
        return;
      }
      game.currentRoomTitle =
        gi === game.myAssignedRoomIdx ? `La tua stanza 🏠` : `Stanza di ${room.owner}`;
      game.currentRoomIdx = gi;
      game.activeEnvironment = 'PLAYER_ROOM';
      game.playerPos = { x: 0, y: 120 };
    } else {
      game.currentRoomTitle = item.title;
      game.activeEnvironment = item.targetEnv;
      game.playerPos = { x: 0, y: 120 };
    }
  } else if (game.activeEnvironment === 'CORTILE') {
    if (item && item.aptIdx !== undefined) {
      game.currentApt = item.aptIdx;
      game.activeEnvironment = 'SALOON';
      game.currentRoomTitle = game.saloonTitle();
      game.playerPos = { x: 0, y: -90 };
    }
  } else if (game.activeEnvironment === 'negozio_vestiti') {
    if (game.activeTargetProp === 'doorExit') {
      game.activeEnvironment = 'SALOON';
      game.currentRoomTitle = game.saloonTitle();
      game.playerPos = { x: 0, y: 0 };
    } else {
      openClothesShop(item.slot || 'top', false);
    }
  } else if (game.activeEnvironment === 'negozio_mobili') {
    if (game.activeTargetProp === 'shopCounter') {
      openFurnitureShopModal();
    } else if (game.activeTargetProp === 'doorExit') {
      game.activeEnvironment = 'SALOON';
      game.currentRoomTitle = game.saloonTitle();
      game.playerPos = { x: 0, y: 0 };
    } else if (item.category) {
      let stdItem: GameValue = game.furnitureCatalog.find(
        (f?: GameValue): GameValue => f.category === item.category && !f.isLuxury,
      );
      let luxItem: GameValue = game.furnitureCatalog.find(
        (f?: GameValue): GameValue => f.category === item.category && f.isLuxury,
      );
      let hasStd: GameValue = game.ownedFurniture[stdItem.id];
      let hasLux: GameValue = game.ownedFurniture[luxItem.id];
      if (!hasStd) {
        if (game.moneyLevel < stdItem.price) {
          toast('Non hai abbastanza soldi per acquistare questo mobile!');
          return;
        }
        game.moneyLevel -= stdItem.price;
        game.ownedFurniture[stdItem.id] = true;
        toast(`✅ Hai acquistato ${stdItem.name}! È comparso nella tua stanza.`);
      } else if (!hasLux) {
        if (game.moneyLevel < luxItem.price) {
          toast('Non hai abbastanza soldi per acquistare la versione di lusso!');
          return;
        }
        game.moneyLevel -= luxItem.price;
        game.ownedFurniture[luxItem.id] = true;
        toast(
          `✨ Complimenti! Hai acquistato ${luxItem.name}. La versione standard è stata sostituita dal modello di lusso nella tua stanza!`,
        );
      }
    }
  } else if (game.activeEnvironment === 'KITCHEN') {
    if (game.activeTargetProp === 'fridge') {
      game.fridgeIsOpen = !game.fridgeIsOpen;
      if (!game.fridgeIsOpen) game.hasFoodInInventory = false;
    } else if (game.activeTargetProp === 'coffee') {
      useCoffee();
    } else if (game.activeTargetProp === 'stove') {
      if (game.hasFoodInInventory && !game.foodIsCooked) {
        game.foodIsCooked = true;
        toast('Hai cucinato il cibo! 🍽️');
      } else if (game.foodIsCooked) {
        game.hungerLevel = Math.min(100, game.hungerLevel + 50);
        game.stats.meals++;
        game.hasFoodInInventory = false;
        game.foodIsCooked = false;
        game.fridgeIsOpen = false;
        toast('Gnam! Fame +50%');
      }
    } else if (game.activeTargetProp === 'doorExit') {
      game.activeEnvironment = 'SALOON';
      game.currentRoomTitle = game.saloonTitle();
      game.playerPos = { x: 0, y: 0 };
    }
  } else if (game.activeEnvironment === 'BATHROOM') {
    if (game.activeTargetProp === 'shower') {
      startShower();
    } else if (game.activeTargetProp === 'sink') {
      game.hygieneLevel = Math.min(100, game.hygieneLevel + 20);
      toast('Ti sei lavato mani e viso 🚰 (Igiene +20%)');
    } else if (game.activeTargetProp === 'toilet') {
      game.happinessLevel = Math.min(100, game.happinessLevel + 5);
      toast('Che sollievo! 🚽 (Felicità +5%)');
    } else if (game.activeTargetProp === 'doorExit') {
      game.activeEnvironment = 'SALOON';
      game.currentRoomTitle = game.saloonTitle();
      game.playerPos = { x: 0, y: 0 };
    }
  } else {
    if (game.activeTargetProp === 'doorExit') {
      game.activeEnvironment = 'SALOON';
      game.currentRoomTitle = game.saloonTitle();
      game.playerPos = { x: 0, y: 0 };
    } else if (game.activeTargetProp === 'bed') {
      game.isSleeping = !game.isSleeping;
      sfx(game.isSleeping ? 'sleep' : 'wake');
      toast(game.isSleeping ? 'Ti sei coricato a letto 🛏️' : 'Ti sei svegliato.');
    } else if (game.activeTargetProp === 'wardrobe') {
      if (isMyRoomNow()) openWardrobe();
      else toast("🚫 Non puoi frugare nell'armadio di un altro!");
    } else if (game.activeTargetProp === 'desk') {
      openComputerShopModal();
    } else if (game.activeTargetProp === 'sofa' || game.activeTargetProp === 'tv') {
      relaxWith(game.activeTargetProp, item);
    } else if (game.activeTargetProp === 'safe') {
      handleSafeInteraction();
    }
  }
}

export async function handleSafeInteraction(..._args: GameValue[]): Promise<GameValue> {
  const room: GameValue = game.roomsState[game.currentRoomIdx];
  if (!room) return;
  const vaultRef: GameValue = game.db.ref(`sims_rooms_state/${game.currentRoomIdx}/vaultMoney`);
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
    text: `Inserisci la combinazione segreta di 3 cifre (da 1 a 5).\nTentativi rimasti: ${3 - tries}`,
    input: { placeholder: '???', numeric: true, maxLength: 3 },
    buttons: [
      { label: 'Lascia stare', value: null, color: '#57606f' },
      { label: '🔓 Prova', value: 'try', color: '#e74c3c' },
    ],
  });
  if (res.action !== 'try' || !res.value) return;
  game.theftAttempts[room.id] = tries + 1;
  if (room.pin === hashPin(res.value, room.id) || room.pin === res.value) {
    let stolen: GameValue = 0;
    const r: GameValue = await vaultRef.transaction((v?: GameValue): GameValue => {
      stolen = v || 0;
      return 0;
    });
    if (r && r.committed && stolen > 0) {
      game.moneyLevel += stolen;
      saveGame(true);
      toast(`🎉 COLPO RIUSCITO! Hai rubato ${stolen} € dalla cassaforte! 💰`, 4000);
    } else {
      toast('🚫 Qualcuno è stato più veloce di te: la cassaforte è vuota.');
    }
  } else {
    toast('🚨 CODICE ERRATO! Il sistema di sicurezza ha sventato il furto!');
  }
}

export function doActivity(type?: GameValue): GameValue {
  game.isOutsideMenuOpen = false;
  dom('pop-interaction').classList.add('hidden');
  dom('btn-return-home').classList.remove('hidden');
  if (type === 'walk') {
    game.happinessLevel = Math.min(100, game.happinessLevel + 10);
    game.healthLevel = Math.min(100, game.healthLevel + 5);
    game.sleepLevel = Math.max(0, game.sleepLevel - 5); // la passeggiata stanca un po'
    game.activeEnvironment = 'passeggiata';
    game.currentRoomTitle = 'Passeggiata nel Parco 🌳';
  } else if (type === 'bar') {
    if (game.moneyLevel < 10) {
      toast('Non hai abbastanza soldi! Ti servono almeno 10 €.');
      returnHomeFromActivity();
      return;
    }
    game.moneyLevel -= 10;
    game.happinessLevel = Math.min(100, game.happinessLevel + 15);
    game.hungerLevel = Math.min(100, game.hungerLevel + 15);
    game.activeEnvironment = 'bar';
    game.currentRoomTitle = "Bar all'Aperto ☕";
  } else if (type === 'disco') {
    if (game.moneyLevel < game.DISCO_PRICE) {
      toast(`Non hai abbastanza soldi! L'ingresso costa ${game.DISCO_PRICE} €.`);
      returnHomeFromActivity();
      return;
    }
    game.moneyLevel -= game.DISCO_PRICE;
    game.happinessLevel = Math.min(100, game.happinessLevel + game.DISCO_HAPPY);
    game.sleepLevel = Math.max(0, game.sleepLevel - game.DISCO_SLEEP);
    game.activeEnvironment = 'discoteca';
    game.currentRoomTitle = 'Discoteca 🪩';
    toast(`🪩 Si balla! Felicità +${game.DISCO_HAPPY}%, sonno −${game.DISCO_SLEEP}%`, 3500);
  } else if (type === 'cemetery') {
    game.activeEnvironment = 'CIMITERO';
    game.currentRoomTitle = `Cimitero 🪦 (${game.graveList.length} ${game.graveList.length === 1 ? 'lapide' : 'lapidi'})`;
    game.playerPos = { x: 0, y: 140 };
  } else if (type === 'trip') {
    let cost: GameValue = Math.floor(game.moneyLevel * 0.2);
    game.moneyLevel -= cost;
    toast(`✈️ Viaggio pagato: -${cost} €`);
    game.happinessLevel = Math.min(100, game.happinessLevel + 70);
    game.activeEnvironment = 'viaggio';
    game.currentRoomTitle = 'Viaggio ✈️';
  } else if (type === 'clothesshop') {
    game.activeEnvironment = 'negozio_vestiti';
    game.currentRoomTitle = 'Boutique Dolce Casa 👗';
    dom('btn-return-home').classList.add('hidden');
    game.playerPos = { x: 0, y: 110 };
    return;
  } else if (type === 'furnitureshop') {
    game.activeEnvironment = 'negozio_mobili';
    game.currentRoomTitle = 'Negozio di Mobili 🛋️';
    dom('btn-return-home').classList.add('hidden');
    game.playerPos = { x: 0, y: 110 };
    return;
  }
  game.playerPos = { x: 0, y: 80 };
}

export function openFurnitureShopModal(..._args: GameValue[]): GameValue {
  const container: GameValue = dom('furniture-catalog-container');
  container.innerHTML = '';
  game.furnitureCatalog.forEach((item?: GameValue): GameValue => {
    const isOwned: GameValue = game.ownedFurniture[item.id];
    const card: GameValue = document.createElement('div');
    card.className = 'shop-item-card';
    card.innerHTML = `
          <div class="shop-item-info">
            <h4>${item.name}</h4>
            <p>💰 ${item.price} €</p>
          </div>
          <button class="btn-buy ${isOwned ? 'owned' : ''}" onclick="buyFurnitureItem('${item.id}', ${item.price})">
            ${isOwned ? 'Acquistato ✓' : 'Acquista'}
          </button>
        `;
    container.appendChild(card);
  });
  dom('furniture-shop-modal').classList.remove('hidden');
}

export function buyFurnitureItem(itemId?: GameValue, price?: GameValue): GameValue {
  if (game.ownedFurniture[itemId]) {
    toast('Hai già acquistato questo mobile!');
    return;
  }
  if (game.moneyLevel < price) {
    toast('Non hai abbastanza soldi per acquistare questo mobile!');
    return;
  }
  game.moneyLevel -= price;
  game.ownedFurniture[itemId] = true;
  let def: GameValue = game.furnitureCatalog.find((f?: GameValue): GameValue => f.id === itemId);
  if (def && def.isLuxury) {
    toast('✨ Versione di lusso acquistata! Ha sostituito il modello standard nella tua stanza.');
  } else {
    toast('Mobile standard acquistato e posizionato nella tua stanza! 🛋️');
  }
  openFurnitureShopModal();
}

// Gestione intelligente del menu Lavoro
export function handleJobMenuAction(..._args: GameValue[]): GameValue {
  const modal: GameValue = dom('job-select-modal');
  modal.classList.remove('hidden');
  let statusText: GameValue = game.activeJobKey
    ? `Attivo: ${game.activeJobKey.toUpperCase()}`
    : 'Nessun lavoro attivo';
  dom('current-job-status').innerText = 'Lavoro Attivo: ' + statusText;
  Object.keys(game.jobExperience).forEach((key?: GameValue): GameValue => {
    let el: GameValue = dom('count-' + key);
    if (el) el.innerText = game.jobExperience[key];
  });
  const choicesContainer: GameValue = dom('job-choices-container');
  const continueContainer: GameValue = dom('job-continue-container');
  const titleEl: GameValue = dom('job-modal-title');
  if (!game.activeJobKey) {
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
  if (!game.activeJobKey) return;
  let jobTitles: GameValue = {
    cantiere: 'Cantiere 🏗️',
    ospedale: 'Ospedale 🏥',
    ristorante: 'Ristorante 🍳',
    ufficio: 'Ufficio 💻',
  };
  chooseOrGoToJob(game.activeJobKey, jobTitles[game.activeJobKey] || game.activeJobKey);
}

export async function chooseOrGoToJob(
  jobKey?: GameValue,
  jobTitleName?: GameValue,
): Promise<GameValue> {
  if (game.activeJobKey && game.activeJobKey !== jobKey) {
    const res: GameValue = await openDialog({
      title: '⚠️ Cambiare lavoro?',
      text: `Hai già un lavoro attivo (${game.activeJobKey.toUpperCase()}). Se cambi perdi i turni accumulati e ricominci da 50 € a turno.`,
      buttons: [
        { label: 'No', value: null, color: '#57606f' },
        { label: 'Sì, cambia', value: 'ok', color: '#e74c3c' },
      ],
    });
    if (res.action !== 'ok') return;
    game.jobExperience[game.activeJobKey] = 0;
  }
  if (game.sleepLevel < 10 || game.healthLevel < 15) {
    toast('😵 Sei troppo stanco o malato per lavorare. Riposati prima!');
    return;
  }
  game.activeJobKey = jobKey;
  let turns: GameValue = (game.jobExperience[jobKey] || 0) + 1;
  let pay: GameValue = turns >= 60 ? 120 : turns >= 30 ? 80 : 50;
  game.activeShift = { jobKey, title: jobTitleName, pay, remaining: game.SHIFT_SECONDS };
  game.isOutsideMenuOpen = false;
  dom('pop-interaction').classList.add('hidden');
  dom('job-select-modal').classList.add('hidden');
  dom('btn-return-home').classList.remove('hidden');
  game.activeEnvironment = 'lavoro_' + jobKey;
  game.currentRoomTitle = jobTitleName;
  game.playerPos = { x: 0, y: 60 };
  mgStart(jobKey);
  toast(
    `💼 Turno iniziato: hai ${game.SHIFT_SECONDS} secondi! Se lavori bene ottieni un bonus (base ${pay} €)`,
    3500,
  );
}
