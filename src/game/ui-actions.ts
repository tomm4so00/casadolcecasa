import { openArtSite, setArtTab } from './art-market.js';
import { leaveDogHome } from './pets.js';
import { openProjects } from './projects.js';
import { spinSlot } from './betting.js';
import { standUp } from './faint.js';
import {
  closeWardrobe,
  handleSubAction,
  openClothesShop,
  placeFurniture,
  rotateFurniture,
  returnHomeFromActivity,
  startMovingFurniture,
} from './character.js';
import { toggleMusic, toggleSound } from './audio.js';
import { openLeaderboard, openMissions } from './missions.js';
import { reloadForUpdate } from './saves.js';
import { openChat, openProfile, restoreFromCode, showIntro } from './interface.js';
import { toggleNotify } from './needs.js';
import { bizInvest, bizWithdraw, openBizSite } from './business.js';
import { closeGlobalChat, openGlobalChat, sendChat } from './chat.js';
import {
  buyFurnitureItem,
  sellFurnitureItem,
  chooseOrGoToJob,
  continueCurrentJob,
  doActivity,
  openOutsideSubmenu,
  goToLaunchSite,
  handleJobMenuAction,
  handleObjectInteract,
  openFurnitureShopModal,
  showJobAgencySelection,
  toggleSprint,
} from './world.js';
import { closeModal } from './render/primitives.js';
import { finishCreator, openCharacterCreator, randomizeCreator } from './render/avatars.js';
export type UiArgument = string | number | boolean | null;
export type UiAction = (args: readonly UiArgument[]) => unknown;
export const uiActions: Readonly<Record<string, UiAction>> = {
  openMissions: () => openMissions(),
  toggleSound: () => toggleSound(),
  toggleMusic: () => toggleMusic(),
  showIntro: ([arg0]) => showIntro(Boolean(arg0)),
  toggleNotify: () => toggleNotify(),
  openLeaderboard: () => openLeaderboard(),
  openProfile: () => openProfile(),
  openChat: () => openChat(),
  openGlobalChat: () => openGlobalChat(),
  toggleSprint: () => toggleSprint(),
  handleObjectInteract: () => handleObjectInteract(),
  handleSubAction: () => handleSubAction(),
  doActivity: ([arg0]) => doActivity(String(arg0)),
  openOutsideSubmenu: ([arg0]) => openOutsideSubmenu(String(arg0 ?? '')),
  goToLaunchSite: () => goToLaunchSite(),
  handleJobMenuAction: () => handleJobMenuAction(),
  startMovingFurniture: () => startMovingFurniture(),
  placeFurniture: () => placeFurniture(),
  rotateFurniture: () => rotateFurniture(),
  standUp: () => standUp(),
  openArtSite: () => openArtSite(),
  openProjectsSite: () => openProjects(true),
  spinSlot: () => void spinSlot(),
  setArtTab: ([tab]) => setArtTab(String(tab)),
  returnHomeFromActivity: () => returnHomeFromActivity(),
  leaveDogHome: () => leaveDogHome(),
  reloadForUpdate: () => reloadForUpdate(),
  restoreFromCode: () => restoreFromCode(),
  chooseOrGoToJob: ([arg0, arg1]) => chooseOrGoToJob(String(arg0), String(arg1)),
  continueCurrentJob: () => continueCurrentJob(),
  showJobAgencySelection: () => showJobAgencySelection(),
  closeModal: ([arg0]) => closeModal(String(arg0)),
  openClothesShop: ([arg0, arg1]) => openClothesShop(String(arg0), Boolean(arg1)),
  openFurnitureShopModal: () => openFurnitureShopModal(),
  openBizSite: () => openBizSite(),
  sendChat: () => sendChat(),
  closeGlobalChat: () => closeGlobalChat(),
  finishCreator: ([arg0]) => finishCreator(Boolean(arg0)),
  randomizeCreator: () => randomizeCreator(),
  openCharacterCreator: ([arg0]) => openCharacterCreator(Boolean(arg0)),
  closeWardrobe: () => closeWardrobe(),
  bizInvest: ([id]) => {
    if (id === 'shop' || id === 'app' || id === 'crypto') return bizInvest(id);
  },
  bizWithdraw: ([id]) => {
    if (id === 'shop' || id === 'app' || id === 'crypto') return bizWithdraw(id);
  },
  buyFurnitureItem: ([arg0]) => buyFurnitureItem(String(arg0)),
  sellFurnitureItem: ([arg0]) => void sellFurnitureItem(String(arg0)),
};
