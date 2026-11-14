// Pulsanti degli oggetti di ogni ambiente: cosa c'è scritto quando ci si avvicina e cosa
// succede premendolo. Per un posto nuovo basta aggiungere la sua voce in PLACES.
import { openRoulette } from './roulette.js';
import { facadeFootprint } from './render/facades.js';
import { APERITIVO } from './bar-rules.js';
import { DOOR_OPEN_RADIUS, resetDoors, setBlockedDoor } from './render/doors.js';
import { servicePrompt } from './restaurant.js';
import { hospitalPrompt } from './hospital.js';
import { officePrompt } from './office.js';
import { buySeeds, isSmoking, openGrowCounter, potIndex, potLabel, tendPot } from './weed.js';
import { PETS, PET_FOOD_PRICE, type PetKind, toPetCalled } from './pet-rules.js';
import { PET_OF_KEY, buyPet, dogGatePrompt, feed, giveUpForAdoption, useDogGate } from './pets.js';
import {
  COIN_PRICE,
  ICE_CREAM_PRICE,
  buyIceCream,
  funSpots,
  onSofa,
  atDesk,
  sitAtDesk,
  sitOnChair,
  toggleBench,
  sitOnStool,
  toggleSofa,
  tossCoin,
} from './courtyard-fun.js';
import { STRAINS, type StrainId, growTimeText } from './weed-rules.js';
import {
  earthFlight,
  moonFlight,
  moonOpen,
  myMoonPrice,
  returnToEarth,
  travelToMoon,
} from './moon.js';
import { openRpsTable, openSlot } from './betting.js';
import { SLOT_BET } from './betting-rules.js';
import { bedtimeThought } from './personality.js';
import { purchaseItem } from './economy.js';
import { type GameValue, game } from './context.js';
import { hasRoom, isMyRoomNow, saveGame } from './saves.js';
import { eatDish, food } from './food.js';
import { canCook, canTakeRaw } from './food-rules.js';
import { openRealtyBoard } from './realty.js';
import { openGossipBoard } from './gossip.js';
import { openSuggestionBox, unreadSuggestions } from './suggestions.js';
import {
  isLimitedId,
  makeOffer,
  offerButtonText,
  visitedCopy,
  visitedLimitedClothes,
  wardrobeOffers,
} from './limited.js';
import { openArcadeStation } from './arcade.js';
import { clerkLines } from './clerks.js';
import { buyFromStand, openShelf, shelfPrompt, standPrompt } from './collect.js';
import { openOthersShelf } from './collect-offers.js';
import { usedAct, usedPrompt } from './used-shop.js';
import { ARCADE_GAMES, type ArcadeGame, isArcadeGame } from './arcade-rules.js';
import { quotedTitle } from './painting-titles.js';
import { type DoorGap, type RoomBounds, crossedDoor, gapFor, nearDoor } from './door-walk-rules.js';
import { roomPaintings, slotOfKey } from './painting-rules.js';
import { relaxWith, toast } from './missions.js';
import {
  freeRoomsInApt,
  openClothesShop,
  openWardrobe,
  returnHomeFromActivity,
} from './character.js';
import { mgButtonText, mgInteract } from './jobs.js';
import { coffeeLeftMs, openDealer, useCoffee } from './needs.js';
import { pillSleepBlock } from './pill.js';
import { dealerOf, streetRoleHere } from './dealers.js';
import { DEALERS } from './dealer-rules.js';
import { showGraveInfo } from './render/graveyard.js';
import { startShower, startToilet, startWash } from './bathroom.js';
import { sfx } from './audio.js';
import { partyHooks } from './party-hooks.js';
import { partyPinsHere } from './render/party.js';
import { openBankCounter } from './bank.js';
import { POLICE_ENV, policeAct, policePrompt } from './police.js';
import { CRYO_ENV, cryoCenterHooks } from './cryo-hooks.js';
import { trashAct, trashPrompt } from './trash.js';
import { openProjects, pressLaunchButton, rocketLaunch } from './projects.js';
import { managePainting, openPaintStudio } from './paint-studio.js';
import {
  GALLERY_ENV,
  enterGallery,
  galleryPrompt,
  leaveGallery,
  openCatalog,
  viewGalleryPiece,
} from './gallery.js';
import { nextUpgrade, showroomStatus, tierOf } from './furniture-tiers.js';
import { openCabinet } from './cabinet.js';
import { CONSOLE_COIN } from './cabinet-rules.js';
import {
  announceFurnitureBenefit,
  backToSaloon,
  doActivity,
  enterMoonBase,
  exitMoonBase,
  freeBedSlot,
  getCurrentFurnitureMap,
  handleSafeInteraction,
  openFurnitureShopModal,
  renderOutsideMenu,
  spawnAtDoor,
  throughDoor,
  workbenchMessage,
} from './world.js';

/** Il pulsante che compare vicino a un oggetto: testo, se è bloccato e gli eventuali altri due. */
export interface Prompt {
  text: string;
  locked?: boolean;
  sub?: string;
  sub2?: string;
}

/**
 * Cosa si fa con gli oggetti di un ambiente: `prompt` dice il testo del pulsante, `act` cosa
 * succede premendolo. `key` è il nome dell'oggetto nella mappa (doorExit, fridge…), `item` i suoi
 * dati (può mancare per panchine, fontana e animali, che non sono mobili).
 */
interface Place {
  prompt(key: string, item: GameValue): Prompt;
  act(key: string, item: GameValue): void | Promise<void>;
}

const touch = (item: GameValue): Prompt => ({ text: `✋ ${item?.name || ''}` });
const OUT: Prompt = { text: '🚪 Torna Fuori' };

/** Negozi e locali dove l'unica cosa in più è l'uscita: `act` riceve gli altri oggetti. */
function shop(
  prompt: (key: string, item: GameValue) => Prompt | null,
  act: (key: string, item: GameValue) => void | Promise<void>,
): Place {
  return {
    prompt: (key, item) => prompt(key, item) || OUT,
    act: (key, item) => (key === 'doorExit' ? backToSaloon() : act(key, item)),
  };
}

// ---------------------------------------------------------------- commessi

const CLERK_COUNTERS = new Set(['growCounter', 'collectCounter', 'usedCounter']);

/** Il commesso dell'ambiente in cui si è (se c'è). */
function clerkHere(): GameValue {
  return game.simulationBots.find(
    (b: GameValue) => b.clerk && b.env === game.view.activeEnvironment,
  );
}

/** Pulsante del bancone: si parla col commesso. */
function clerkPrompt(key: string): Prompt | null {
  if (!CLERK_COUNTERS.has(key)) return null;
  const clerk = clerkHere();
  return { text: `💬 Parla con ${clerk ? clerk.name : 'il commesso'}` };
}

/** Il commesso risponde con una delle sue frasi. */
function talkToClerk(): void {
  const clerk = clerkHere();
  const lines = clerkLines(game.view.activeEnvironment);
  if (!clerk || !lines?.length) return;
  clerk.talk = lines[Math.floor(Math.random() * lines.length)];
  sfx('click');
}

// ---------------------------------------------------------------- casa
const SALOON: Place = {
  prompt(_key, item) {
    if (item.roomIdx === undefined) return touch(item);
    const room: GameValue = game.roomsState[game.gRoomIdx(item)];
    return room && room.owner
      ? { text: `🚪 Entra nella Stanza di ${room.owner}` }
      : { text: '🔒 Stanza Vuota (Chiusa)', locked: true };
  },
  act: (key, item) => goThroughSaloonDoor(key, item, true),
};

/**
 * Passa da una porta del salone. Col pulsante (`wait`) la porta si spalanca e dopo un attimo si
 * passa; camminando la porta è già aperta e si passa subito.
 */
async function goThroughSaloonDoor(key: string, item: GameValue, wait: boolean): Promise<void> {
  {
    if (item.targetEnv === 'PLAYER_ROOM') {
      const gi: GameValue = game.gRoomIdx(item);
      const room: GameValue = game.roomsState[gi];
      if (!room || !room.owner) {
        toast('🔒 Questa stanza è vuota.');
        return;
      }
      if (wait) await throughDoor('saloon:' + key);
      game.view.currentRoomTitle =
        gi === game.myAssignedRoomIdx ? `La tua stanza 🏠` : `Stanza di ${room.owner}`;
      game.currentRoomIdx = gi;
      game.view.activeEnvironment = 'PLAYER_ROOM';
      spawnAtDoor(getCurrentFurnitureMap().doorExit);
    } else {
      if (wait) await throughDoor('saloon:' + key);
      game.view.currentRoomTitle = item.title;
      game.view.activeEnvironment = item.targetEnv;
      if (item.targetEnv === 'CORTILE')
        spawnAtDoor(game.courtyardDoors['doorApt' + game.currentApt]);
      else spawnAtDoor(getCurrentFurnitureMap().doorExit);
    }
  }
}

const KITCHEN: Place = {
  prompt(key, item) {
    if (key === 'fridge') {
      if (!game.view.fridgeIsOpen) return { text: '🧊 Apri Frigorifero' };
      return {
        text: '🧊 Chiudi Frigorifero',
        sub: canTakeRaw(food()) ? '🍎 Prendi Cibo (-5 Đ)' : undefined,
      };
    }
    if (key === 'stove') {
      // si cucina un pezzo alla volta; con dei piatti pronti si possono anche mangiare qui
      if (canCook(food()))
        return {
          text: `🍳 Cucina (${game.player.rawFood} crudi)`,
          sub: game.player.dishes > 0 ? '🍽️ Mangia' : undefined,
        };
      return { text: game.player.dishes > 0 ? '🍽️ Mangia' : '🍳 Fornello (Serve Cibo)' };
    }
    if (key === 'coffee') {
      const left: GameValue = coffeeLeftMs();
      return {
        text:
          left > 0
            ? `☕ Macchina in pausa (${Math.ceil(left / 60000)} min)`
            : `☕ Prepara un caffè (+${game.COFFEE_SLEEP}% sonno, −${game.COFFEE_HEALTH}% salute)`,
        locked: left > 0,
      };
    }
    return touch(item);
  },
  act(key) {
    if (key === 'fridge') {
      game.view.fridgeIsOpen = !game.view.fridgeIsOpen;
      sfx(game.view.fridgeIsOpen ? 'fridgeOpen' : 'fridgeClose');
      // il cibo preso resta in mano anche chiudendo il frigo: serve per il fornello
    } else if (key === 'coffee') useCoffee();
    else if (key === 'stove') {
      if (canCook(food())) {
        game.player.rawFood--;
        game.player.dishes++;
        toast(`Hai cucinato! 🍝 Il piatto è nello zaino (${game.player.dishes}).`);
        saveGame(false);
      } else if (game.player.dishes > 0) eatDish();
    } else if (key === 'doorExit') backToSaloon();
  },
};

const BATHROOM: Place = {
  prompt(key, item) {
    const busy = !!(game.showerAnim || game.bathAnim);
    const labels: Record<string, [string, string]> = {
      shower: ['🚿 Fai la doccia', '🚿 Doccia in corso…'],
      toilet: ['🚽 Usa il WC', '🚽 Occupato…'],
      sink: ['🚰 Lavati le mani', '🚰 Ti stai lavando…'],
    };
    return labels[key] ? { text: labels[key][busy ? 1 : 0], locked: busy } : touch(item);
  },
  act(key) {
    if (key === 'shower') startShower();
    else if (key === 'sink') startWash();
    else if (key === 'toilet') {
      startToilet();
    } else if (key === 'doorExit') backToSaloon();
  },
};

const PLAYER_ROOM: Place = {
  prompt(key, item) {
    const mine = isMyRoomNow();
    if (potIndex(key) >= 0)
      return { text: mine ? potLabel(potIndex(key)) : `🌱 ${item.name}`, locked: !mine };
    if (key === 'safe')
      return mine
        ? {
            text: '🔐 Apri la Cassaforte',
            sub: game.hasSetSafePin ? '🔑 Cambia combinazione' : '🔑 Imposta combinazione',
          }
        : { text: '🕵️ Prova a Rubare (Tentativo PIN)' };
    if (key === 'bed')
      return { text: game.player.isSleeping ? '⏰ Svegliati' : '😴 Coricati a Letto' };
    if (item.pet && PET_OF_KEY[key] && mine) {
      const kind = item.pet as PetKind;
      return {
        text: `🍖 Dai da mangiare ${toPetCalled(kind, game.player.pets?.[kind])} (${PET_FOOD_PRICE} Đ)`,
        // il nome si cambia dalla sua casetta; il cane qui ha anche la passeggiata
        sub: kind === 'dog' ? '🦮 Porta a spasso' : '✏️ Cambia nome',
        sub2: kind === 'dog' ? '✏️ Cambia nome' : undefined,
      };
    }
    // mobile in edizione limitata: il mio, o di un altro (offerta)
    if (isLimitedId(key))
      return { text: mine ? `💎 ${item.name}` : offerButtonText(key) || `💎 ${item.name}` };
    if (key === 'wardrobe' && !mine && visitedLimitedClothes())
      return { text: `💎 ${visitedLimitedClothes()}` };
    if (String(key).startsWith('painting')) {
      const name = paintingTitleOf(key);
      return { text: mine ? `🖼️ ${name || item.name}` : `🖼️ Ammira ${name || 'il quadro'}` };
    }
    if (key === 'collectShelf') return shelfPrompt(mine);
    if (key === 'partyBoard') return { text: '📌 Bacheca delle feste (' + partyPinsHere() + ')' };
    if (key === 'trashBin') return trashPrompt();
    if (key === 'tv') return { text: '📺 Guarda la TV' };
    if (key === 'cabinet') return { text: '🕹️ Gioca al cabinato' };
    if (key === 'desk' && mine) return { text: atDesk() ? '🧍 Alzati' : '💻 Usa il PC' };
    if (key === 'sofa') return { text: onSofa() ? '🧍 Alzati' : '🛋️ Siediti sul Divano' };
    return touch(item);
  },
  async act(key, item) {
    if (key === 'doorExit') backToSaloon();
    else if (key === 'trashBin') await trashAct();
    else if (potIndex(key) >= 0) {
      if (isMyRoomNow()) await tendPot(potIndex(key));
      else toast('🌱 Questa pianta non è tua!');
    } else if (key === 'bed') {
      if (!game.player.isSleeping) {
        const blocked = pillSleepBlock();
        if (blocked) {
          toast(blocked, 4000);
          return;
        }
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
    } else if (key === 'wardrobe') {
      if (isMyRoomNow()) openWardrobe();
      // nell'armadio di un altro si vedono solo i capi in edizione limitata, per fare un'offerta
      else if (!(await wardrobeOffers())) toast("🚫 Non puoi frugare nell'armadio di un altro!");
    } else if (isLimitedId(key)) {
      const n = visitedCopy(key);
      if (!isMyRoomNow() && n) await makeOffer(key, n);
      else toast(`💎 ${item?.name || ''}: edizione limitata. Puoi spostarlo con 🛠️ Arreda.`, 4000);
    } else if (key === 'partyBoard') {
      const owner = game.roomsState[game.currentRoomIdx ?? -1]?.owner || '';
      sfx('click');
      toast(partyHooks.boardText(isMyRoomNow(), partyPinsHere(), owner), 7000);
    } else if (key === 'collectShelf') {
      const room: GameValue = game.roomsState[game.currentRoomIdx ?? -1];
      if (isMyRoomNow()) await openShelf();
      else await openOthersShelf(room?.ownerId, room?.owner);
    } else if (key === 'desk') {
      // nella propria stanza ci si siede al PC (che si accende da seduti); da un altro no
      if (isMyRoomNow()) sitAtDesk(item);
      else toast('💻 Questo PC non è tuo!');
    } else if (PET_OF_KEY[key] && isMyRoomNow()) await feed(PET_OF_KEY[key]);
    else if (key === 'sofa') toggleSofa(item);
    else if (key === 'tv') relaxWith(key, item);
    else if (key === 'cabinet') {
      if (isMyRoomNow()) openCabinet(item);
      else toast('🕹️ Questo cabinato non è tuo: compralo anche tu al negozio di mobili!');
    } else if (key === 'safe') handleSafeInteraction();
    else if (String(key).startsWith('painting')) {
      if (isMyRoomNow()) await managePainting(key);
      else
        toast(
          `🖼️ ${paintingTitleOf(key) || 'Un quadro'}, appeso nella stanza di ${game.roomsState[game.currentRoomIdx ?? -1]?.owner || 'chi abita qui'}.`,
          4000,
        );
    }
  },
};

// ---------------------------------------------------------------- cortile e cimitero
const CORTILE: Place = {
  prompt(key, item) {
    if (key === 'exitHouse')
      return {
        text: '🚪 Esci dal Condominio',
      };
    if (item.fun === 'realty') return { text: '🏘️ Bacheca immobiliare: cambia stanza' };
    if (item.fun === 'gossip') return { text: '📰 Leggi i pettegolezzi del condominio' };
    if (item.fun === 'suggest') {
      const n = unreadSuggestions();
      return {
        text: n ? `📬 Suggerimenti e bug (${n} nuovi)` : '📮 Scrivi un suggerimento o un bug',
      };
    }
    if (item.fun === 'fountain')
      return {
        text: `⛲ Lancia una moneta nella fontana (${COIN_PRICE} Đ)`,
        locked: !!game.coinToss,
      };
    const mine: GameValue = hasRoom() && game.aptOfRoom(game.myAssignedRoomIdx) === item.aptIdx;
    return {
      text: mine
        ? '🚪 Entra nel tuo appartamento 🏠'
        : `🚪 Entra nell'Appartamento ${item.aptIdx + 1} (${freeRoomsInApt(item.aptIdx)} stanze libere)`,
    };
  },
  async act(key, item) {
    if (key === 'exitHouse') {
      // l'uscita del condominio apre il menu dei posti dove andare; si chiude allontanandosi
      game.view.isOutsideMenuOpen = true;
      game.view.outsideSubmenu = '';
      renderOutsideMenu();
      return;
    }
    const spot = funSpots()[key];
    if (spot?.fun === 'realty') await openRealtyBoard();
    else if (spot?.fun === 'gossip') await openGossipBoard();
    else if (spot?.fun === 'suggest') await openSuggestionBox();
    else if (spot?.fun === 'fountain') await tossCoin();
    else if (item && item.aptIdx !== undefined) {
      await throughDoor('cortile:' + key);
      game.currentApt = item.aptIdx;
      backToSaloon();
    }
  },
};

const CIMITERO: Place = {
  prompt: (_key, item) => ({
    text:
      item.kind === 'memorial'
        ? '📜 Leggi il registro dei defunti'
        : `⚰️ Leggi la lapide di ${item.who}`,
  }),
  act(_key, item) {
    if (item) showGraveInfo(item);
  },
};

// ---------------------------------------------------------------- negozi e locali
const MALL: Place = {
  prompt(_key, item) {
    if (item.fun === 'iceCream')
      return {
        text: game.iceCream
          ? '🍦 Stai mangiando il gelato…'
          : `🍦 Compra un gelato (${ICE_CREAM_PRICE} Đ)`,
        locked: !!game.iceCream,
      };
    return { text: item.enter ? `🚪 Entra: ${item.name}` : '🏠 Torna a casa' };
  },
  async act(key, item) {
    if (key === 'iceCream') await buyIceCream();
    else if (item?.enter) await doActivity(item.enter);
    else if (key === 'doorExit') backToSaloon();
  },
};

const FURNITURE_SHOP = shop(
  (key, item) => {
    if (key === 'shopCounter') return { text: '🛋️ Catalogo: compra e rivendi' };
    if (!item.category) return null;
    if (item.showId) {
      const status = showroomStatus(game.furnitureCatalog, game.player.ownedFurniture, {
        id: item.showId,
        category: item.category,
      });
      if (status === 'mine')
        return {
          text: item.price === null ? '🏠 Ce l’hai già nella tua stanza' : '✅ È già tuo',
          locked: true,
        };
      if (status === 'better') return { text: '✅ Ne hai già uno migliore', locked: true };
      if (status === 'locked') {
        const need = nextUpgrade(game.furnitureCatalog, game.player.ownedFurniture, item.category);
        return { text: `🔒 Prima compra ${need?.name || 'il modello precedente'}`, locked: true };
      }
    }
    // Progressione: standard → pregiato → lusso.
    const next: GameValue = nextUpgrade(
      game.furnitureCatalog,
      game.player.ownedFurniture,
      item.category,
    );
    if (!next) return { text: `✅ Già posseduto (Versione Lusso)`, locked: true };
    const icon = { std: '🛒', premium: '💎', lux: '✨' }[tierOf(next)];
    return { text: `${icon} Acquista ${next.name} (${next.price} Đ)` };
  },
  async (key, item) => {
    if (key === 'shopCounter') {
      openFurnitureShopModal();
      return;
    }
    if (!item.category) return;
    const next: GameValue = nextUpgrade(
      game.furnitureCatalog,
      game.player.ownedFurniture,
      item.category,
    );
    if (!next) return;
    // nello showroom si compra il modello davanti a cui si è (se è il prossimo della serie)
    if (item.showId && item.showId !== next.id) return;
    if (game.moneyLevel < next.price) {
      toast(`Non hai abbastanza soldi: ${next.name} costa ${next.price} Đ.`);
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
  },
);

const CLOTHES_SHOP = shop(
  (key, item) =>
    key === 'clothesCounter'
      ? { text: '🛍️ Catalogo: compra e rivendi' }
      : item.slot
        ? {
            text: `${game.SLOT_INFO[item.slot].icon} Guarda ${game.SLOT_INFO[item.slot].label}`,
          }
        : null,
  (_key, item) => openClothesShop(item.slot || 'top', false),
);

const PET_SHOP = shop(
  (key, item) => {
    if (item.pet) {
      const info = PETS[item.pet as PetKind];
      const owned = !!game.player.pets?.[item.pet as PetKind];
      return {
        text: owned
          ? `${info.emoji} Hai già un ${info.name}`
          : `${info.emoji} Compra un ${info.name} (${info.price} Đ)`,
        locked: owned,
      };
    }
    return key === 'petCounter' ? { text: '🏡 Dai in adozione un animale' } : null;
  },
  async (key, item) => {
    if (item?.pet) await buyPet(item.pet as PetKind);
    else if (key === 'petCounter') await giveUpForAdoption();
  },
);

const COLLECT_SHOP = shop(
  (key, item) => (item.stand !== undefined ? standPrompt(item.stand) : clerkPrompt(key)),
  async (key, item) => {
    if (item?.stand !== undefined) await buyFromStand(item.stand);
    else if (CLERK_COUNTERS.has(key)) talkToClerk();
  },
);

const USED_SHOP = shop(
  (key, item) => (item.stand !== undefined ? usedPrompt(item.stand) : clerkPrompt(key)),
  async (key, item) => {
    if (item?.stand !== undefined) await usedAct(item.stand);
    else if (CLERK_COUNTERS.has(key)) talkToClerk();
  },
);

const GROW_SHOP = shop(
  (key, item) =>
    item.strain
      ? {
          text: `🌱 Semi di ${STRAINS[item.strain as StrainId].name} (${STRAINS[item.strain as StrainId].price} Đ, ${growTimeText(item.strain as StrainId)})`,
        }
      : key === 'growCounter'
        ? { text: '🪴 Vasi e lampade (Rocco)' }
        : clerkPrompt(key),
  async (key, item) => {
    if (item?.strain) await buySeeds(item.strain);
    else if (key === 'growCounter') await openGrowCounter();
    else if (CLERK_COUNTERS.has(key)) talkToClerk();
  },
);

const BANK = shop(
  (key) => (key === 'bankCounter' ? { text: '🏦 Vai allo Sportello' } : null),
  async (key) => {
    if (key === 'bankCounter') await openBankCounter();
  },
);

const POLICE = shop(
  (key) => policePrompt(key),
  (key) => policeAct(key),
);

const CRYO_CENTER = shop(
  (key) => cryoCenterHooks.prompt(key),
  (key) => cryoCenterHooks.act(key),
);

const ARCADE = shop(
  (key, item) =>
    key === 'arcadeConsole'
      ? { text: `🕹️ Gioca alla console (${CONSOLE_COIN} Đ a partita)` }
      : isArcadeGame(item.game)
        ? {
            text: `${ARCADE_GAMES[item.game as ArcadeGame].emoji} Sfida qualcuno a ${ARCADE_GAMES[item.game as ArcadeGame].name}`,
          }
        : null,
  async (key, item) => {
    if (key === 'arcadeConsole') openCabinet(item, CONSOLE_COIN);
    else if (isArcadeGame(item?.game)) await openArcadeStation(item.game);
  },
);

const BETTING = shop(
  (key) =>
    key.startsWith('slot')
      ? { text: `🎰 Gioca alla slot (${SLOT_BET} Đ)` }
      : key === 'rpsTable'
        ? { text: '✊ Sfida qualcuno a morra cinese' }
        : key === 'rouletteTable'
          ? { text: '🎡 Gioca alla roulette' }
          : null,
  (key) => {
    if (key.startsWith('slot')) openSlot();
    else if (key === 'rpsTable') openRpsTable();
    else if (key === 'rouletteTable') openRoulette();
  },
);

const ART_STUDIO = shop(
  (key) =>
    key.startsWith('easel')
      ? { text: '🎨 Dipingi un quadro' }
      : key === 'galleryDoor'
        ? { text: "🖼️ Entra nella Galleria d'Arte" }
        : null,
  async (key) => {
    if (key.startsWith('easel')) openPaintStudio();
    else if (key === 'galleryDoor') {
      await throughDoor('art:gallery');
      enterGallery();
    }
  },
);

// Galleria d'Arte: i quadri si guardano da vicino; l'uscita riporta nel laboratorio.
const GALLERY: Place = {
  prompt: (key, item) =>
    key === 'doorExit'
      ? { text: '🎨 Torna al Laboratorio' }
      : key === 'catalog'
        ? { text: "📖 Sfoglia il catalogo delle opere d'arte" }
        : item?.gallerySlot !== undefined
          ? galleryPrompt(item.gallerySlot)
          : touch(item),
  act(key, item) {
    if (key === 'doorExit') leaveGallery();
    else if (key === 'catalog') openCatalog();
    else if (item?.gallerySlot !== undefined) viewGalleryPiece(item.gallerySlot);
  },
};

const DEALER: Place = {
  prompt: () => {
    const role = streetRoleHere(game.view.activeEnvironment);
    if (role === 'police') return { text: '🚓 Parla con il poliziotto' };
    if (role === 'absent') return { text: 'Lo spacciatore non è di turno', locked: true };
    const id = dealerOf(game.view.activeEnvironment);
    return { text: id ? `🕴️ Parla con ${DEALERS[id].name}` : '🕴️ Parla con lo spacciatore' };
  },
  act(_key, item) {
    if (item) openDealer();
  },
};

// ---------------------------------------------------------------- laboratorio, razzo e luna
const ENGINEERING = shop(
  (key) => {
    if (key === 'launchButton') {
      // zona esterna: il pulsante di lancio e la rampa del razzo
      const phase = rocketLaunch().phase;
      return {
        text:
          phase === 'waiting'
            ? '🔴 Premi il pulsante: lancia il razzo!'
            : phase === 'building'
              ? '🔒 Pulsante di lancio (razzo non completo)'
              : phase === 'launched'
                ? '✅ Razzo già lanciato'
                : '⏳ Lancio in corso…',
        locked: phase !== 'waiting',
      };
    }
    if (key === 'rocketPad') {
      if (!moonOpen()) return { text: '🚀 Guarda il progetto del razzo' };
      const flight = earthFlight();
      return {
        text:
          flight.phase === 'idle'
            ? `🌙 Vola sulla luna (${myMoonPrice()} Đ)`
            : '🚀 Il razzo è in viaggio…',
        locked: flight.phase !== 'idle',
      };
    }
    const labels: Record<string, string> = {
      projectBoard: '📌 Guarda i progetti',
      moonScreen: '📺 Guarda la diretta dalla luna',
      workbench: '🔧 Lavora al bancone',
    };
    return labels[key] ? { text: labels[key] } : null;
  },
  async (key) => {
    if (key === 'projectBoard' || key === 'moonScreen') openProjects(false);
    else if (key === 'workbench') workbenchMessage();
    else if (key === 'rocketPad') {
      if (moonOpen()) await travelToMoon();
      else openProjects(false);
    } else if (key === 'launchButton') await pressLaunchButton();
  },
);

const MOON: Place = {
  prompt(key) {
    if (key === 'baseDoor') return { text: '🚪 Entra dentro la base spaziale' };
    const flight = moonFlight();
    return {
      text: flight.phase === 'idle' ? '🌍 Torna sulla Terra' : '🚀 Il razzo è in viaggio…',
      locked: flight.phase !== 'idle',
    };
  },
  async act(key) {
    if (key === 'baseDoor') enterMoonBase();
    else if (key === 'moonRocket') await returnToEarth();
  },
};

const MOON_BASE: Place = {
  prompt: (key) => ({
    text: key === 'baseConsole' ? '🖥️ Guarda il pannello di controllo' : '🚀 Esci sulla luna',
  }),
  act(key) {
    if (key === 'baseConsole') openProjects(false);
    else if (key === 'doorExit') exitMoonBase();
  },
};

// ---------------------------------------------------------------- parco
// Il cancello si attraversa liberamente; il pulsante permette di richiamare il cane.
const PARK: Place = {
  prompt: (key, item) =>
    key === 'dealer' ? DEALER.prompt(key, item) : key === 'dogGate' ? dogGatePrompt() : touch(item),
  act(key, item) {
    if (key === 'dealer') return DEALER.act(key, item);
    if (key === 'dogGate') useDogGate();
  },
};

// ---------------------------------------------------------------- lavoro
const WORK: Place = {
  prompt: (_key, item) =>
    item.hosp
      ? hospitalPrompt(item)
      : item.kind === 'station' || item.kind === 'table'
        ? servicePrompt(item)
        : item.office
          ? officePrompt(item)
          : {
              text: mgButtonText(item),
              locked: item.kind === 'target' && !game.MG.carry,
            },
  act(key, item) {
    if (item) mgInteract(item, key);
  },
};

const PLACES: Record<string, Place> = {
  SALOON,
  KITCHEN,
  BATHROOM,
  PLAYER_ROOM,
  CORTILE,
  CIMITERO,
  passeggiata: PARK,
  centro_commerciale: MALL,
  negozio_mobili: FURNITURE_SHOP,
  negozio_vestiti: CLOTHES_SHOP,
  negozio_animali: PET_SHOP,
  collezionismo: COLLECT_SHOP,
  usato: USED_SHOP,
  growshop: GROW_SHOP,
  banca: BANK,
  [POLICE_ENV]: POLICE,
  [CRYO_ENV]: CRYO_CENTER,
  sala_giochi: ARCADE,
  scommesse: BETTING,
  laboratorio: ART_STUDIO,
  [GALLERY_ENV]: GALLERY,
  ingegneria: ENGINEERING,
  luna: MOON,
  base_lunare: MOON_BASE,
  bar: DEALER,
  discoteca: DEALER,
};

// ---------------------------------------------------------------- porte da attraversare camminando
interface WalkZone {
  key: string;
  /** `m` allarga la zona di tanto da ogni lato */
  inside: (x: number, y: number, m: number) => boolean;
}

/** Le porte del salone che si possono attraversare: tutte tranne quelle delle stanze vuote. */
export function doorGapsHere(): DoorGap[] {
  if (game.view.activeEnvironment !== 'SALOON') return [];
  const out: DoorGap[] = [];
  for (const [key, it] of Object.entries(game.saloonDoors) as [string, GameValue][]) {
    if (it.roomIdx !== undefined && !game.roomsState[game.gRoomIdx(it)]?.owner) continue;
    const thinX = it.w < it.h;
    out.push(
      gapFor(
        key,
        thinX ? 'x' : 'y',
        (thinX ? Math.sign(it.x) : Math.sign(it.y)) < 0 ? -1 : 1,
        thinX ? it.y : it.x,
        thinX ? it.h : it.w,
      ),
    );
  }
  return out;
}

/**
 * Porte senza pulsante: quelle che si passano camminando e quelle delle palazzine ancora chiuse
 * (col nastro), dove non si entra.
 */
export function walkThroughKeys(): Set<string> {
  const keys = new Set(doorGapsHere().map((g) => g.key));
  for (const z of walkZones()) if (z.key !== 'exitHouse') keys.add(z.key);
  if (game.view.activeEnvironment === 'CORTILE')
    for (const [key, it] of Object.entries(game.courtyardDoors) as [string, GameValue][])
      if (it.aptIdx !== undefined && freeRoomsInApt(it.aptIdx) === game.ROOMS_PER_APT)
        keys.add(key);
  return keys;
}

/** Con che nome si disegna la porta `key` di questo ambiente (vedi doorOpenAmount). */
function doorDrawId(env: string, key: string): string {
  if (env === 'CORTILE') return 'cortile:' + key;
  if (env === 'centro_commerciale') return 'mall:' + getCurrentFurnitureMap()[key]?.shop;
  return 'saloon:' + key;
}

/** Larghezza della porta a vetri dei negozi del centro commerciale (vedi drawShopFacade). */
const SHOP_DOOR = 30;

/**
 * Zone che si attraversano camminando, senza pulsante: porte del cortile, zerbini dell'uscita,
 * cancello dell'area cani e porte dei negozi del centro commerciale.
 */
function walkZones(): WalkZone[] {
  const env = game.view.activeEnvironment;
  if (env !== 'CORTILE') {
    // arredando niente porte a piedi: non si esce per sbaglio spostando un mobile
    if (game.arrangeMode || game.isMovingFurnitureMode) return [];
    const out: WalkZone[] = [];
    const map: GameValue = getCurrentFurnitureMap();
    const ex: GameValue = env === 'SALOON' ? null : map.doorExit;
    // lo zerbino sta sul bordo della stanza: vale anche un passo prima
    if (ex)
      out.push({
        key: 'doorExit',
        inside: (x, y, m) =>
          Math.abs(x - ex.x) < ex.w / 2 + m && Math.abs(y - ex.y) < ex.h / 2 + 14 + m,
      });
    // centro commerciale: si entra nei negozi arrivando alla loro porta a vetri
    if (env === 'centro_commerciale')
      for (const [key, it] of Object.entries(map) as [string, GameValue][]) {
        if (!it.enter) continue;
        const left = it.side === 'left';
        out.push({
          key,
          inside: left
            ? (x, y, m) => Math.abs(y - it.y) < SHOP_DOOR / 2 + m && x - (it.x + it.w / 2) < 14 + m
            : (x, y, m) => Math.abs(x - it.x) < SHOP_DOOR / 2 + m && y - (it.y + it.h / 2) < 14 + m,
        });
      }
    return out;
  }
  const out: WalkZone[] = [];
  for (const [key, it] of Object.entries(game.courtyardDoors) as [string, GameValue][]) {
    // nelle palazzine ancora vuote (col nastro) si entra solo col pulsante
    if (it.aptIdx === undefined || freeRoomsInApt(it.aptIdx) === game.ROOMS_PER_APT) continue;
    const fp = facadeFootprint(it);
    // si passa dentro solo una volta entrati nel vano del portone
    out.push({
      key,
      inside:
        it.side === 'left'
          ? (x, y, m) => Math.abs(y - it.y) < 10 + m && x < fp.x + fp.w / 2 - 3 + m
          : (x, y, m) => Math.abs(x - it.x) < 10 + m && y < fp.y + fp.h / 2 - 3 + m,
    });
  }
  const ex: GameValue = game.courtyardDoors.exitHouse;
  if (ex)
    out.push({
      key: 'exitHouse',
      inside: (x, y, m) => Math.abs(x - ex.x) < ex.w / 2 + m && Math.abs(y - ex.y) < 16 + m,
    });
  return out;
}

let walkEnv = '';
// Appena arrivati si è davanti alla porta da cui si entra (nel salone il portone è in fondo come la
// porta della palazzina, quindi chi va dritto ci finisce contro): quella porta, e solo quella, fa da
// muro finché le si resta vicino (entro WALK_REARM dalla sua zona). Le altre porte valgono sempre.
let blockedDoor: string | null = null;
let pickBlocked = false;
const WALK_REARM = 45;

/** Le porte del salone che in questo momento si aprono a chi ci cammina contro. */
export function openGapsHere(): DoorGap[] {
  return doorGapsHere().filter((g) => g.key !== blockedDoor);
}

/**
 * Davanti a un portone del cortile chi cammina verso la facciata viene accompagnato verso il centro
 * del vano: largo quanto il portone, non bisogna centrarlo al pixel.
 */
function funnelToPortone(): void {
  if (game.view.activeEnvironment !== 'CORTILE' || !game.isWalking) return;
  const p = game.playerPos;
  for (const it of Object.values(game.courtyardDoors) as GameValue[]) {
    if (it.aptIdx === undefined) continue;
    const fp = facadeFootprint(it);
    const side = it.side === 'left';
    const along = side ? p.y - it.y : p.x - it.x;
    const toFront = side ? p.x - (fp.x + fp.w / 2) : p.y - (fp.y + fp.h / 2);
    const pushing = side ? game.moveRight < 0 : game.moveForward > 0;
    if (!pushing || Math.abs(along) > 26 || toFront > 26) continue;
    const step = Math.sign(along) * Math.min(Math.abs(along), 1.6);
    if (side) p.y -= step;
    else p.x -= step;
  }
}

/** A ogni fotogramma: chi entra camminando nella zona di una porta la attraversa. */
export function checkWalkThrough(): void {
  funnelToPortone();
  walkStep();
  // passando una porta si è cambiato ambiente in questo stesso fotogramma: la porta da cui si
  // arriva va bloccata (e chiusa) prima di disegnarlo, se no si vede aprirsi per un attimo
  if (game.view.activeEnvironment !== walkEnv) walkStep();
}

function walkStep(): void {
  const env = game.view.activeEnvironment;
  if (env !== walkEnv) {
    walkEnv = env;
    blockedDoor = null;
    pickBlocked = true;
    resetDoors();
  }
  const { x, y } = game.playerPos;
  const busy =
    isSmoking() ||
    game.player.isSleeping ||
    game.showerAnim ||
    game.bathAnim ||
    game.rocketTrip ||
    game.benchSit ||
    game.fainted ||
    game.activeShift;
  const bounds = roomBounds(),
    gaps = doorGapsHere(),
    zones = walkZones();
  const near = (key: string): boolean => {
    const g = gaps.find((d) => d.key === key);
    if (g) return nearDoor(x, y, bounds, [g], WALK_REARM);
    return !!zones.find((z) => z.key === key)?.inside(x, y, WALK_REARM);
  };
  // appena cambiato ambiente: la porta accanto a cui si è comparsi è quella da cui si arriva
  if (pickBlocked) {
    pickBlocked = false;
    blockedDoor = [...gaps.map((g) => g.key), ...zones.map((z) => z.key)].find(near) ?? null;
  }
  // il blocco si toglie lontano dalla zona e oltre la distanza a cui la porta si apre: così,
  // allontanandosi, la porta non si apre (e richiude) alle spalle
  if (blockedDoor && !near(blockedDoor)) {
    const it: GameValue = getCurrentFurnitureMap()[blockedDoor];
    if (!it || Math.hypot(x - it.x, y - it.y) > DOOR_OPEN_RADIUS + 5) blockedDoor = null;
  }
  // la porta bloccata resta chiusa: si apre di nuovo avvicinandosi solo quando il blocco è tolto
  setBlockedDoor(blockedDoor ? doorDrawId(env, blockedDoor) : null);
  // gli zerbini attraversabili adesso: davanti a loro compare la freccia verso l'uscita
  game.openExits = busy
    ? []
    : zones
        .map((z) => z.key)
        .filter((k) => k !== blockedDoor && (k === 'doorExit' || k === 'exitHouse'));
  // salone: si passa la porta arrivando sul suo filo
  const gap = crossedDoor(
    x,
    y,
    bounds,
    gaps.filter((g) => g.key !== blockedDoor),
  );
  if (gap) {
    if (!busy) {
      blockedDoor = gap.key;
      void goThroughSaloonDoor(gap.key, game.saloonDoors[gap.key], false);
    }
    return;
  }
  const zone = zones.find((z) => z.key !== blockedDoor && z.inside(x, y, 0));
  if (!zone || busy || !game.isWalking) return;
  // finché si resta sulla zona non riscatta (la porta si sta aprendo, il menu è aperto)
  blockedDoor = zone.key;
  // sul tappeto dell'uscita il menu dei posti si apre (non si richiude se è già aperto)
  if (zone.key === 'exitHouse' && game.view.isOutsideMenuOpen) return;
  game.activeTargetProp = zone.key;
  void interactWith(zone.key, getCurrentFurnitureMap()[zone.key]);
}

/** Le regole dell'ambiente in cui si trova il giocatore (il turno di lavoro ha le sue). */
function placeHere(): Place | undefined {
  const env = game.view.activeEnvironment;
  if (game.MG.active && env === 'lavoro_' + game.MG.job) return WORK;
  return PLACES[env];
}

/** Testo del pulsante per l'oggetto vicino. */
export function promptFor(key: string, item: GameValue): Prompt {
  // le panchine funzionano allo stesso modo in tutti gli ambienti
  if (item?.fun === 'bench')
    return { text: game.benchSit ? '🧍 Alzati' : '🪑 Siediti sulla panchina' };
  if (item?.fun === 'chair') return { text: game.benchSit ? '🧍 Alzati' : '🪑 Siediti' };
  // al bar: sgabello del bancone e aperitivo
  if (item?.fun === 'stool')
    return {
      text: game.benchSit ? '🧍 Alzati' : `🍹 Siediti per un aperitivo (${APERITIVO.price} Đ)`,
    };
  return placeHere()?.prompt(key, item) ?? touch(item);
}

/** Preme il pulsante dell'oggetto vicino. */
export async function interactWith(key: string, item: GameValue): Promise<void> {
  if (
    key === 'doorExit' &&
    ['bar', 'discoteca', 'passeggiata'].includes(game.view.activeEnvironment)
  ) {
    returnHomeFromActivity();
    return;
  }
  if (funSpots()[key]?.fun === 'bench') {
    toggleBench(key);
    return;
  }
  if (funSpots()[key]?.fun === 'chair') {
    sitOnChair(key);
    return;
  }
  if (funSpots()[key]?.fun === 'stool') {
    await sitOnStool(key);
    return;
  }
  const place = placeHere();
  if (place) await place.act(key, item);
  else if (key === 'doorExit') backToSaloon();
}

/** Titolo (tra virgolette) del quadro appeso al posto `key` della stanza in cui si è. */
export function paintingTitleOf(key: string): string {
  return quotedTitle(
    roomPaintings(game.roomsState[game.currentRoomIdx ?? -1])[slotOfKey(key) || 'p1'],
  );
}

/** I muri dell'ambiente in cui si è. */
export function roomBounds(): RoomBounds {
  // nella stanza privata si arriva fino al bordo davanti, dove c'è lo zerbino
  const near = game.view.activeEnvironment === 'PLAYER_ROOM' ? 12 : undefined;
  return { x0: game.X0, x1: game.X1, y0: game.Y0, y1: game.Y1, near };
}
