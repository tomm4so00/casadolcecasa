import { canSellJoint } from './weed.js';
import { drawGoldStatue, drawJukebox } from './render/limited-props.js';
import { drawBNTable, drawC4Table, drawReflexCabinet } from './render/arcade-props.js';
import {
  MOONBASE_DRAW,
  MOONBASE_INSIDE_DRAW,
  MOONBASE_PARTS,
  drawBaseConsole,
  drawBaseDoor,
  drawMoonScreen,
} from './render/moonbase.js';
import { drawPetBubble, drawPetHome, drawPetShelf, drawShopPet } from './render/pets.js';
import { homeBubble } from './pets.js';
import type { PetKind } from './pet-rules.js';
import { canKiss } from './romance.js';
import { applyRoomBounds, growSceneData } from './room-size.js';
import { startMarket } from './market-client.js';
import { resetEconomy } from './economy.js';
import { createCharacterState } from './models.js';
import {
  SHOP_CATALOG,
  SLOT_INFO,
  BODY_PARTS,
  CREATOR_TABS,
  FURNITURE_CATALOG,
  MUSIC_TRACKS,
  INTRO_PAGES,
  SIMULATION_BOTS,
  PLAYER_ROOM_FURNITURE,
  KITCHEN_FURNITURE,
  BATHROOM_FURNITURE,
  CLOTHES_STORE_FURNITURE,
  BANK_FURNITURE,
  ART_STUDIO_FURNITURE,
  ENGINEERING_FURNITURE,
  BETTING_FURNITURE,
  ARCADE_FURNITURE,
  MALL_FURNITURE,
  MOON_FURNITURE,
  GROWSHOP_FURNITURE,
  PETSHOP_FURNITURE,
  MOONBASE_INSIDE_FURNITURE,
  ENGINEERING_YARD_FURNITURE,
  STORE_FLOOR_FURNITURE,
  SALOON_DOORS,
  COURTYARD_DOORS,
  BIZ,
  WORK_JOBS,
  ENV_PROPS,
  ENV_DECOR,
  ENV_STYLE,
} from './data/catalogues.js';
import type { GameValue } from './context.js';
import { game } from './context.js';
import { lifetime, dom, browser } from './runtime.js';
import { hasRoom } from './saves.js';
import { toast } from './missions.js';
import { musicTick, musicUnlock } from './audio.js';
import { resizeCanvas, startGame } from './interface.js';
import { drawCoffeeMachine, tickNeeds } from './needs.js';
import { bizUpdate, mktPrice } from './business.js';
import { closeGlobalChat, sendChat } from './chat.js';
import { mixColor } from './render/primitives.js';
import {
  drawArchiveProp,
  drawBallProp,
  drawBarCounterProp,
  drawBathmatProp,
  drawBed,
  drawBenchProp,
  drawBricksProp,
  drawChefStoveProp,
  drawConeProp,
  drawConsoleProp,
  drawCoolerProp,
  drawCounter,
  drawCraneProp,
  drawDesk,
  drawDinnerTableProp,
  drawDiscoBallProp,
  drawDjBoothProp,
  drawFlowersProp,
  drawFountainProp,
  drawRealtyBoardProp,
  drawGossipBoardProp,
  drawHeartMonitorProp,
  drawHospitalBedProp,
  drawIvStandProp,
  drawJukeboxProp,
  drawLamp,
  drawMedCabinetProp,
  drawMixerProp,
  drawNightstand,
  drawOfficeDeskProp,
  drawPalmProp,
  drawPlant,
  drawRestCounterProp,
  drawRoundTableProp,
  drawSafe,
  drawSandcastleProp,
  drawShower,
  drawSink,
  drawSofa,
  drawSpeakerProp,
  drawStoolProp,
  drawStove,
  drawStreetLampProp,
  drawSunbedProp,
  drawTV,
  drawTableProp,
  drawToilet,
  drawTreeProp,
  drawUmbrellaProp,
  drawWaitingChairsProp,
  drawWardrobe,
} from './render/objects.js';
import {
  drawRocketProp,
  drawRocketPad,
  drawMoonRocket,
  drawCraterProp,
  drawMoonRockProp,
  drawMoonFlagProp,
  drawLaunchButton,
  drawProjectBoard,
  drawWorkbench,
  drawMoonSignProp,
} from './render/rocket.js';
import { drawSlotMachine, drawRpsTable } from './render/arcade-props.js';
import {
  drawShopFacade,
  drawMallColumnProp,
  drawMallPalmProp,
  drawIceCreamCartProp,
  drawBalloonStandProp,
  drawMannequinProp,
} from './render/mall.js';
import { drawWeedPot, drawWeedJar, drawStrainDisplay } from './render/weed-props.js';
import { drawFridge } from './render/fridge.js';
import { drawBankCounter } from './render/bank.js';
import { drawEasel, drawPaintTableProp } from './render/studio.js';
import { drawGraveProp, drawMemorialProp, rebuildGraveyard } from './render/graveyard.js';
import {
  wallBottles,
  wallCabinets,
  wallClock,
  wallCross,
  wallLogo,
  wallMenu,
  wallMirror,
  wallNeon,
  wallPainting,
  wallPoster,
  wallShelf,
  wallTowels,
  wallWhiteboard,
  wallVaultDoor,
  wallRoomPainting,
  wallSafe,
  wallWindow,
  wallRocketPlaque,
  wallAdScreen,
} from './render/scenes.js';
import { firebaseOptions, isLocalMode, createDatabase } from './runtime.js';
export function initializeGame() {
  const canvas = document.getElementById('game-canvas');
  if (!(canvas instanceof HTMLCanvasElement)) throw new Error('Canvas del gioco mancante');
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Rendering 2D non disponibile');
  game.view = {
    canvas,
    ctx,
    activeEnvironment: 'SALOON',
    currentRoomTitle: 'Salone Principale',
    isOutsideMenuOpen: false,
    outsideSubmenu: '',
    fridgeIsOpen: false,
  };
  resetEconomy();
  game.player = createCharacterState();
  game.lastSavePromise = Promise.resolve(true);
  game.lastSaveContent = null;
  game.lastCloudSaveContent = null;
  game.firebaseConfig = firebaseOptions;
  game.GAME_VERSION = 8;
  const offline = isLocalMode();
  const prefix = offline ? 'offline_' : '';
  const playerId =
    localStorage.getItem(prefix + 'sims_device_id') ||
    'player_' + Math.random().toString(36).substring(2, 9);
  localStorage.setItem(prefix + 'sims_device_id', playerId);
  game.session = {
    authUid: null,
    OFFLINE: offline,
    LS_PREFIX: prefix,
    SAVE_KEY: prefix + 'sims_save_v1',
    myPlayerId: playerId,
    db: createDatabase(offline),
    saveReady: false,
    gameStarted: false,
    serverOffset: 0,
  };
  game.onlinePlayers = {};
  game.view.activeEnvironment = 'SALOON';
  game.view.currentRoomTitle = 'Salone Principale';
  game.player.healthLevel = 50;
  game.player.sleepLevel = 50;
  game.player.hungerLevel = 50;
  game.player.hygieneLevel = 50;
  game.player.happinessLevel = 50;
  game.vaultCache = 0;
  game.bankBalance = 0;
  game.kissAnim = null;
  game.fainted = false;
  game.pinRetiredAsked = false;
  game.faintRiseAt = 0;
  game.kissPending = null;
  game.legacyPocketMoney = 0;
  game.vaultSynced = false;
  game.lastNoRoomToastAt = 0;
  Object.defineProperty(game, 'moneyLevel', {
    configurable: true,
    get: () => Math.max(0, Math.round(game.vaultCache)),
  });
  game.hasSetSafePin = false;
  game.safePinCode = '';
  game.player.activeJobKey = null;
  game.player.jobExperience = { cantiere: 0, ospedale: 0, ristorante: 0, ufficio: 0 };
  game.player.isSleeping = false;
  game.showerAnim = null;
  game.bathAnim = null;
  game.benchSit = null;
  game.coinToss = null;
  game.iceCream = null;
  game.toiletFlushAt = -10;
  game.frameSinkRunning = false;
  game.sleepK = 0;
  game.bedSlot = 0;
  game.showerFog = 0;
  game.frameShowerActors = [];
  game.view.isOutsideMenuOpen = false;
  game.view.outsideSubmenu = '';
  game.view.fridgeIsOpen = false;
  game.player.sleepGainedSinceLastHealthBoost = 0;
  game.SLEEP_DEPLETION_SEC = 86400;
  game.SLEEP_RECOVERY_SEC = 28800;
  game.HUNGER_AWAKE_DEPLETION_SEC = 86400;
  game.HUNGER_SLEEP_DEPLETION_SEC = 172800;
  game.HYGIENE_DEPLETION_SEC = 86400;
  game.HEALTH_DAMAGE_SEC = 172800;
  game.player.hasFoodInInventory = false;
  game.player.foodIsCooked = false;
  game.shopCatalog = structuredClone(SHOP_CATALOG);
  game.SLOTS = ['top', 'pants', 'shoes', 'hat', 'glasses', 'neck'];
  game.SLOT_INFO = structuredClone(SLOT_INFO);
  game.OPTIONAL_SLOTS = ['hat', 'glasses', 'neck'];
  game.DEFAULT_LOOK = {
    top: 'top_basic',
    pants: 'pants_jeans',
    shoes: 'shoes_sneakers',
    hat: null,
    glasses: null,
    neck: null,
  };
  game.player.ownedItems = {};
  game.player.equipped = Object.assign({}, game.DEFAULT_LOOK);
  game.botLooks = {};
  game.BODY_PARTS = structuredClone(BODY_PARTS);
  game.BODY_KEYS = [
    'skin',
    'hairStyle',
    'hairColor',
    'eyeColor',
    'eyeShape',
    'mouth',
    'freckles',
    'beard',
  ];
  game.CREATOR_TABS = structuredClone(CREATOR_TABS);
  game.bodyString = (b?: GameValue): GameValue =>
    game.BODY_KEYS.map((k?: GameValue): GameValue => b[k]).join('.');
  game.OLD_SKIN_IDX = [1, 2, 3, 4, 6];
  game.OLD_HAIR_IDX = [1, 2, 4, 5, 0, 3, 7];
  game.myBody = null;
  game.bodyChosen = false;
  game.furnitureCatalog = structuredClone(FURNITURE_CATALOG);
  game.player.ownedFurniture = {};
  game.playerPos = { x: 0, y: 0 };
  game.moveForward = 0;
  game.moveRight = 0;
  game.isSprinting = false;
  game.keysPressed = {
    w: false,
    a: false,
    s: false,
    d: false,
    arrowup: false,
    arrowleft: false,
    arrowdown: false,
    arrowright: false,
  };
  game.isMovingFurnitureMode = false;
  game.isDraggingFurniture = false;
  game.movingPropKey = null;
  game.activeTargetProp = null;
  game.APT_COUNT = 8;
  game.ROOMS_PER_APT = 8;
  game.TOTAL_ROOMS = game.APT_COUNT * game.ROOMS_PER_APT;
  game.APT_ENVS = ['SALOON', 'KITCHEN', 'BATHROOM'];
  game.currentApt = 0;
  game.aptOfRoom = (idx?: GameValue): GameValue => Math.floor(idx / game.ROOMS_PER_APT);
  game.gRoomIdx = (item?: GameValue): GameValue =>
    game.currentApt * game.ROOMS_PER_APT + item.roomIdx;
  game.saloonTitle = (): GameValue => `Salone · Appartamento ${game.currentApt + 1}`;
  game.blankRoom = (i?: GameValue): GameValue => ({
    id: i + 1,
    owner: null,
    ownerId: null,
    pin: null,
    vaultMoney: 0,
  });
  game.roomsState = Array.from(
    { length: game.TOTAL_ROOMS },
    (__?: GameValue, i?: GameValue): GameValue => game.blankRoom(i),
  );
  game.myAssignedRoomIdx = null;
  game.joystickTouchId = null;
  game.joystickOrigin = { x: 0, y: 0 };
  game.player.myData = { nick: '' };
  game.pinPromptMoneyThreshold = 0;
  game.theftAttempts = {};
  game.isWalking = false;
  game.remoteSmooth = {};
  game.session.SAVE_KEY = game.session.LS_PREFIX + 'sims_save_v1';
  game.session.saveReady = false;
  game.session.gameStarted = false;
  game.currentRoomIdx = null;
  game.player.gameMinutes = 8 * 60;
  game.GAME_MINUTES_PER_SEC = 1 / 60;
  game.activeShift = null;
  game.SHIFT_SECONDS = 45;
  game.mySay = '';
  game.mySayT = 0;
  game.dialogResolve = null;
  game.HAPPINESS_DEPLETION_SEC = 172800;
  game.lastMoneyForSound = null;
  game.lastEnvForSound = null;
  game.relaxCooldownUntil = 0;
  game.player.stats = { showers: 0, meals: 0, shifts: 0, deposits: 0, chats: 0, relax: 0 };
  game.player.missionIndex = 0;
  game.audioCtx = null;
  game.soundOn = localStorage.getItem(game.session.LS_PREFIX + 'sims_sound') !== 'off';
  game.musicOn = localStorage.getItem(game.session.LS_PREFIX + 'sims_music') !== 'off';
  game.MUSIC = {
    cur: null,
    step: 0,
    next: 0,
    gain: null,
    vol: -1,
    noise: null,
    waves: {},
    ctxRef: null,
  };
  game.NOTE_IX = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 };
  game.midiOf = (n?: GameValue): GameValue => {
    const m: GameValue = /^([A-G])([b#]?)(\d)$/.exec(n);
    return (
      12 * (Number(m[3]) + 1) + game.NOTE_IX[m[1]] + (m[2] === '#' ? 1 : m[2] === 'b' ? -1 : 0)
    );
  };
  game.midiHz = (m?: GameValue): GameValue => 440 * Math.pow(2, (m - 69) / 12);
  game.MUSIC_TRACKS = structuredClone(MUSIC_TRACKS);
  ['pointerdown', 'keydown', 'touchstart'].forEach(
    (ev?: GameValue): GameValue => lifetime.listen(browser, ev, musicUnlock, { passive: true }),
  );
  lifetime.listen(document, 'visibilitychange', (): GameValue => {
    try {
      if (!game.audioCtx) return;
      if (document.hidden) game.audioCtx.suspend();
      else if (game.musicOn || game.soundOn) game.audioCtx.resume();
    } catch (e: GameValue) {}
  });
  lifetime.setInterval(musicTick, 60);
  game.MISSIONS = [];
  game.lastCloudSaveAt = 0;
  game.lastCloudMoney = null;
  game.lastLayoutKey = '';
  game.session.serverOffset = 0;
  game.presenceTrack = {};
  game.INTRO_PAGES = structuredClone(INTRO_PAGES);
  game.simulationBots = structuredClone(SIMULATION_BOTS);
  game.playerRoomFurniture = structuredClone(PLAYER_ROOM_FURNITURE);
  game.kitchenFurniture = structuredClone(KITCHEN_FURNITURE);
  game.bathroomFurniture = structuredClone(BATHROOM_FURNITURE);
  game.clothesStoreFurniture = structuredClone(CLOTHES_STORE_FURNITURE);
  game.storeFloorFurniture = structuredClone(STORE_FLOOR_FURNITURE);
  game.bankFurniture = structuredClone(BANK_FURNITURE);
  game.artStudioFurniture = structuredClone(ART_STUDIO_FURNITURE);
  game.engineeringFurniture = structuredClone(ENGINEERING_FURNITURE);
  game.bettingFurniture = structuredClone(BETTING_FURNITURE);
  game.arcadeFurniture = structuredClone(ARCADE_FURNITURE);
  game.mallFurniture = structuredClone(MALL_FURNITURE);
  game.moonFurniture = structuredClone(MOON_FURNITURE);
  game.growshopFurniture = structuredClone(GROWSHOP_FURNITURE);
  game.petshopFurniture = structuredClone(PETSHOP_FURNITURE);
  game.moonbaseInsideFurniture = structuredClone(MOONBASE_INSIDE_FURNITURE);
  game.dogWalk = null;
  game.dogLeftAt = null;
  game.visitFreePets = [];
  game.moonCurve = 0;
  game.rocketTripAt = 0;
  game.moonTripAt = 0;
  game.rocketTrip = null;
  game.sleepRoom = null;
  game.labDoorForceUntil = 0;
  game.smokeUntil = 0;
  game.doorForce = {};
  game.engineeringYardFurniture = structuredClone(ENGINEERING_YARD_FURNITURE);
  game.rocketStage = 0;
  game.rocketLaunchAt = 0;
  game.launchPressedAt = -10;
  game.rocketDonors = {};
  game.saloonDoors = structuredClone(SALOON_DOORS);
  game.courtyardDoors = structuredClone(COURTYARD_DOORS);
  lifetime.listen(browser, 'load', (): GameValue => {
    game.view.canvas = dom('game-canvas');
    const context = game.view.canvas.getContext('2d');
    if (!context) throw new Error('Rendering 2D non disponibile');
    game.view.ctx = context;
    resizeCanvas();
    lifetime.listen(browser, 'resize', resizeCanvas);
    const savedNick: GameValue = localStorage.getItem(game.session.LS_PREFIX + 'sims_player_nick');
    if (savedNick) dom('nickname').value = savedNick;
    const startBtn: GameValue = dom('start-game-btn');
    const triggerStart: GameValue = (e?: GameValue): GameValue => {
      if (e) e.preventDefault();
      const nickInput: GameValue = dom('nickname');
      let enteredNick: GameValue = nickInput ? nickInput.value.trim() : '';
      if (!enteredNick) {
        toast('Inserisci un nome valido per iniziare!');
        return;
      }
      localStorage.setItem(game.session.LS_PREFIX + 'sims_player_nick', enteredNick.slice(0, 20));
      startGame();
    };
    lifetime.listen(startBtn, 'click', triggerStart);
    lifetime.listen(startBtn, 'touchstart', triggerStart);
  });
  game.player.isDead = false;
  game.player.deadAt = 0;
  game.player.bornAt = 0;
  game.player.epitaph = '';
  game.ABSENT_DEATH_MS = 80 * 3600 * 1000;
  game.ABSENT_DEATH_ESTIMATE_MS = 72 * 3600 * 1000;
  game.lastNeedsWall = Date.now();
  game.lastDangerToast = 0;
  lifetime.setInterval(tickNeeds, 1000);
  game.DRUG_PRICE = 30;
  game.DRUG_DOSE = 35;
  game.DRUG_EUPHORIA = 20;
  game.DRUG_BASE = 0.35;
  game.DRUG_PEAK = 2.5;
  game.DRUG_HIGH_H = 6;
  game.DRUG_TAPER_H = 18;
  game.player.drug = { active: false, doses: 0, lastDose: 0, endAt: 0, dAtDose: 0, crisisAt: 0 };
  game.drugWindowMs = (): GameValue =>
    Math.min(5, Math.max(1, game.player.drug.doses)) * 24 * 3600 * 1000;
  game.discoMap = { dealer: { x: 140, y: 70, w: 20, h: 20, name: 'Spacciatore' } };
  game.barMap = { dealer: { x: 140, y: -35, w: 20, h: 20, name: 'Spacciatore' } };
  game.DISCO_LINES = [
    'Che musica! 🎶',
    'Balliamo! 💃',
    'Alza il volume! 🔊',
    'Offri un drink? 🍸',
    'Questa canzone è un mito!',
  ];
  game.DEALER_LINES = [
    'Psst… vuoi qualcosa?',
    'Prima dose, prezzo speciale…',
    'Ho quello che ti serve.',
    'Niente domande 🤫',
  ];
  game.player.drugStock = 0;
  game.SOC_RANGE = 70;
  game.SOC_CD_MS = 20000;
  game.SOC_MSG_TTL = 6 * 3600 * 1000;
  game.socCd = {};
  game.frameNear = [];
  game.socKey = '';
  game.socTarget = null;
  game.SOC_ACTIONS = [
    { id: 'talk', label: '💬 Dialoga', color: '#2e86de' },
    { id: 'praise', label: '😍 Complimenti', color: '#e84393' },
    { id: 'insult', label: '🤬 Insulta', color: '#6c5ce7' },
    { id: 'punch', label: '👊 Mena', color: '#d63031' },
    {
      id: 'food',
      label: '🍽️ Dai cibo',
      color: '#e67e22',
      show: (): GameValue => game.player.foodIsCooked,
    },
    { id: 'money', label: '💶 Regala soldi', color: '#27ae60', show: (): GameValue => hasRoom() },
    {
      id: 'kiss',
      label: '💋 Prova a baciare',
      color: '#ff6b81',
      show: (): GameValue => canKiss(game.socTarget?.id),
    },
    {
      id: 'weed',
      label: (): GameValue => `🌿 Vendi una canna (5 €) · ${game.player.weed?.grams || 0} g`,
      color: '#2e7d32',
      show: (): GameValue => canSellJoint(),
    },
    {
      id: 'drug',
      label: (): GameValue => `💊 Regala droga (${game.player.drugStock})`,
      color: '#8e44ad',
      show: (): GameValue => game.player.drugStock > 0,
    },
  ];
  game.socBusy = (): GameValue =>
    game.player.isDead ||
    game.player.isSleeping ||
    !!game.showerAnim ||
    !!game.bathAnim ||
    !!game.activeShift ||
    game.MG.active ||
    !game.session.saveReady ||
    game.fainted;
  game.pick = (arr?: GameValue): GameValue => arr[Math.floor(Math.random() * arr.length)];
  game.socDone = {};
  game.socPending = false;
  game.BIZ = structuredClone(BIZ);
  game.player.invest = {};
  game.bizById = (id?: GameValue): GameValue =>
    game.BIZ.find((b?: GameValue): GameValue => b.id === id);
  game.bizValue = (id?: GameValue): GameValue => {
    const v: GameValue = game.player.invest[id];
    const business = game.bizById(id);
    return v && business ? v.units * mktPrice(business) : 0;
  };
  game.investedTotal = (): GameValue =>
    game.BIZ.reduce((n?: GameValue, b?: GameValue): GameValue => n + game.bizValue(b.id), 0);
  game.fmtEur = (n?: GameValue): GameValue =>
    (Math.round(n * 100) / 100).toLocaleString('it-IT', {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }) + ' €';
  game.fmtPct = (p?: GameValue): GameValue =>
    (p >= 0 ? '+' : '') + (Math.round(p * 10) / 10).toFixed(1).replace('.', ',') + '%';
  game.bizBuilt = false;
  startMarket();
  lifetime.setInterval((): GameValue => {
    try {
      const m: GameValue = dom('biz-modal');
      if (m && !m.classList.contains('hidden')) bizUpdate();
    } catch (e: GameValue) {}
  }, 3000);
  game.CHAT_KEEP = 500;
  game.CHAT_SHOW = 150;
  game.CHAT_MAX_LEN = 200;
  game.chatMsgs = [];
  game.chatInit = false;
  game.chatSeen = {};
  game.chatLastSend = 0;
  game.chatReadT =
    Number(localStorage.getItem(game.session.LS_PREFIX + 'sims_chat_read') || 0) || 0;
  game.chatHadRead = localStorage.getItem(game.session.LS_PREFIX + 'sims_chat_read') !== null;
  game.chatOpen = (): GameValue => !dom('gchat-modal').classList.contains('hidden');
  lifetime.listen(document, 'DOMContentLoaded', (): GameValue => {
    const i: GameValue = dom('gchat-input');
    if (i)
      lifetime.listen(i, 'keydown', (e?: GameValue): GameValue => {
        if (e.key === 'Enter') {
          e.preventDefault();
          sendChat();
        } else if (e.key === 'Escape') closeGlobalChat();
      });
  });
  game.COFFEE_SLEEP = 12;
  game.COFFEE_HEALTH = 4;
  game.COFFEE_CD_MS = 20 * 60 * 1000;
  game.COFFEE_MIN_HEALTH = 10;
  game.player.coffeeAt = 0;
  game.coffeeBrewUntil = 0;
  game.BASE_TITLE = document.title;
  game.notifyOn = false;
  try {
    game.notifyOn =
      localStorage.getItem(game.session.LS_PREFIX + 'sims_notify') === 'on' &&
      typeof browser.Notification !== 'undefined' &&
      browser.Notification.permission === 'granted';
  } catch (e: GameValue) {}
  game.ALERT_DEFS = [
    {
      key: 'hunger',
      get: (): GameValue => game.player.hungerLevel,
      low: 30,
      crit: 10,
      emoji: '🍽️',
      label: 'ha fame',
      name: 'Fame',
    },
    {
      key: 'sleep',
      get: (): GameValue => game.player.sleepLevel,
      low: 30,
      crit: 10,
      emoji: '😴',
      label: 'ha sonno',
      name: 'Sonno',
    },
    {
      key: 'hygiene',
      get: (): GameValue => game.player.hygieneLevel,
      low: 30,
      crit: 10,
      emoji: '🚿',
      label: 'ha bisogno di una doccia',
      name: 'Igiene',
    },
    {
      key: 'happiness',
      get: (): GameValue => game.player.happinessLevel,
      low: 20,
      crit: 10,
      emoji: '😢',
      label: 'è triste',
      name: 'Felicità',
      critText: ' – sta perdendo salute! Fai qualcosa di bello',
    },
    {
      key: 'health',
      get: (): GameValue => game.player.healthLevel,
      low: 50,
      crit: 25,
      emoji: '❤️',
      label: 'sta male',
      name: 'Salute',
    },
  ];
  game.alertLevel = {};
  game.wakeAlertSent = false;
  game.SKILL_PAY = false; // niente bonus in base alla prestazione: la paga dipende da turni e oggetti
  game.MG = {
    active: false,
    job: '',
    score: 0,
    target: 6,
    cfg: null,
    task: null,
    stepIdx: 0,
    map: {},
    carry: null,
    lastTask: -1,
    el: null,
  };
  game.WORK_JOBS = structuredClone(WORK_JOBS);
  game.previewRaf = null;
  game.shopState = { slot: 'top', tryOn: null, online: false };
  game.wardrobeAnim = { state: 'closed', t0: 0 };
  game.wardrobeSlot = 'top';
  game.viewOverride = null;
  game.cam = null;
  game._rgbCache = {};
  game.lighten = (c?: GameValue, t?: GameValue): GameValue => mixColor(c, '#ffffff', t);
  game.darken = (c?: GameValue, t?: GameValue): GameValue => mixColor(c, '#000000', t);
  game.FURNITURE_DRAW = {
    bed: drawBed,
    wardrobe: drawWardrobe,
    desk: drawDesk,
    nightstand: drawNightstand,
    lamp: drawLamp,
    sofa: drawSofa,
    tv: drawTV,
    plant: drawPlant,
    safe: drawSafe,
    stove: drawStove,
    fridge: drawFridge,
    bankCounter: drawBankCounter,
    easel1: drawEasel,
    easel2: drawEasel,
    easel3: drawEasel,
    projectBoard: drawProjectBoard,
    workbench: drawWorkbench,
    rocketPad: drawRocketPad,
    slot1: drawSlotMachine,
    slot2: drawSlotMachine,
    slot3: drawSlotMachine,
    rpsTable: drawRpsTable,
    tableC4: drawC4Table,
    tableBN: drawBNTable,
    reflexCab: drawReflexCabinet,
    shopFurniture: drawShopFacade,
    shopClothes: drawShopFacade,
    shopBetting: drawShopFacade,
    shopArcade: drawShopFacade,
    ltd_statue: drawGoldStatue,
    ltd_jukebox: drawJukebox,
    moonRocket: drawMoonRocket,
    weedPot: drawWeedPot,
    // schermo del laboratorio con la diretta dalla base lunare
    moonScreen: drawMoonScreen,
    // base lunare: ingresso sulla luna e pannello di controllo dentro
    baseDoor: drawBaseDoor,
    baseConsole: drawBaseConsole,
    // animali: casette nella stanza (con il fumetto se hanno fame) ed espositori del negozio
    petBird: (it: GameValue, t: GameValue) => drawPetHomeWithBubble('bird', it, t),
    petHamster: (it: GameValue, t: GameValue) => drawPetHomeWithBubble('hamster', it, t),
    petSnake: (it: GameValue, t: GameValue) => drawPetHomeWithBubble('snake', it, t),
    petFish: (it: GameValue, t: GameValue) => drawPetHomeWithBubble('fish', it, t),
    petDog: () => {},
    petCat: () => {},
    shopDog: drawShopPet,
    shopCat: drawShopPet,
    shopBird: drawShopPet,
    shopHamster: drawShopPet,
    shopSnake: drawShopPet,
    shopFish: drawShopPet,
    weedJar: drawWeedJar,
    strainLemon: drawStrainDisplay,
    strainAmnesia: drawStrainDisplay,
    strainPurple: drawStrainDisplay,
    shopGrow: drawShopFacade,
    shopPets: drawShopFacade,
    launchButton: drawLaunchButton,
    coffee: drawCoffeeMachine,
    toilet: drawToilet,
    sink: drawSink,
    shower: drawShower,
    shopCounter: drawCounter,
    petCounter: drawCounter,
  };
  game.discoRGB = (h?: GameValue): GameValue => {
    const f: GameValue = (n?: GameValue): GameValue => {
      const k: GameValue = (n + h / 60) % 6;
      return Math.round(255 * (0.5 - 0.5 * Math.max(-1, Math.min(k, 4 - k, 1))));
    };
    return `${f(5)},${f(3)},${f(1)}`;
  };
  game.DISCO_PRICE = 20;
  game.DISCO_HAPPY = 35;
  game.DISCO_SLEEP = 15;
  game.PROP_DRAW = {
    grave: drawGraveProp,
    memorial: drawMemorialProp,
    tree: drawTreeProp,
    fountain: drawFountainProp,
    realtyBoard: drawRealtyBoardProp,
    gossipBoard: drawGossipBoardProp,
    bench: drawBenchProp,
    streetlamp: drawStreetLampProp,
    flowers: drawFlowersProp,
    rocket: drawRocketProp,
    crater: drawCraterProp,
    moonRock: drawMoonRockProp,
    moonFlag: drawMoonFlagProp,
    ...MOONBASE_DRAW,
    ...MOONBASE_INSIDE_DRAW,
    petShelf: drawPetShelf,
    mallColumn: drawMallColumnProp,
    mallPalm: drawMallPalmProp,
    iceCreamCart: drawIceCreamCartProp,
    balloonStand: drawBalloonStandProp,
    moonSign: drawMoonSignProp,
    palm: drawPalmProp,
    umbrella: drawUmbrellaProp,
    sunbed: drawSunbedProp,
    sandcastle: drawSandcastleProp,
    ball: drawBallProp,
    crane: drawCraneProp,
    bricks: drawBricksProp,
    mixer: drawMixerProp,
    cone: drawConeProp,
    hospitalBed: drawHospitalBedProp,
    ivStand: drawIvStandProp,
    heartMonitor: drawHeartMonitorProp,
    medCabinet: drawMedCabinetProp,
    waitingChairs: drawWaitingChairsProp,
    restCounter: drawRestCounterProp,
    chefStove: drawChefStoveProp,
    dinnerTable: drawDinnerTableProp,
    officeDesk: drawOfficeDeskProp,
    archive: drawArchiveProp,
    cooler: drawCoolerProp,
    djBooth: drawDjBoothProp,
    speaker: drawSpeakerProp,
    discoBall: drawDiscoBallProp,
    barCounter: drawBarCounterProp,
    stool: drawStoolProp,
    roundTable: drawRoundTableProp,
    jukebox: drawJukeboxProp,
    plant: (it?: GameValue, t?: GameValue): GameValue =>
      drawPlant(Object.assign({ name: '' }, it), t),
    table: drawTableProp,
    mannequin: drawMannequinProp,
    console: drawConsoleProp,
    bathmat: drawBathmatProp,
    paintTable: drawPaintTableProp,
  };
  game.graveList = [];
  game.graveMap = {};
  game.ENV_PROPS = structuredClone(ENV_PROPS);
  game.ENV_DECOR = structuredClone(ENV_DECOR);
  // pezzi della base lunare (si vedono man mano che il progetto avanza: vedi partVisible)
  game.ENV_DECOR.luna.push(...structuredClone(MOONBASE_PARTS));
  game.moonBaseStage = 0;
  game.ROOM_WALLS = [
    '#b39ddb',
    '#90caf9',
    '#a5d6a7',
    '#ffcc80',
    '#f48fb1',
    '#80cbc4',
    '#ce93d8',
    '#ffab91',
  ];
  rebuildGraveyard(null);
  game.ENV_STYLE = structuredClone(ENV_STYLE);
  applyRoomBounds('');
  growSceneData();
  game.WALL_DECOR = {
    window: (d?: GameValue, ctxInfo?: GameValue): GameValue =>
      wallWindow(d, ctxInfo.hour, ctxInfo.wallH),
    painting: wallPainting,
    shelf: wallShelf,
    cabinets: wallCabinets,
    mirror: wallMirror,
    towels: wallTowels,
    bottles: wallBottles,
    poster: wallPoster,
    logo: wallLogo,
    cross: wallCross,
    menu: wallMenu,
    whiteboard: wallWhiteboard,
    vaultDoor: wallVaultDoor,
  };
  game.WALL_DECOR_DYNAMIC = {
    clock: wallClock,
    neon: wallNeon,
    roomPainting: wallRoomPainting,
    wallSafe,
    rocketPlaque: wallRocketPlaque,
    adScreen: wallAdScreen,
  };
  game.bgCache = { key: '', canvas: null };
  game.lightCanvas = null;
  game.SKIN_TONES = ['#ffdbac', '#f1c27d', '#e0ac69', '#c68642', '#8d5524'];
  game.HAIR_COLORS = ['#2c1b10', '#4a2c1a', '#b5651d', '#e6c27a', '#1a1a1a', '#7b3f00', '#c0392b'];
  game.creatorDraft = null;
  game.creatorTab = 'skin';
  game.creatorResolve = null;
  game.creatorRaf = null;
  game.OUTDOOR_ENVS = ['passeggiata', 'viaggio', 'lavoro_cantiere', 'CORTILE', 'CIMITERO'];
  game.BOT_LINES = [
    'Ciao! 👋',
    'Che bella giornata ☀️',
    'Qualcuno ha visto il mio gatto?',
    'Oggi si lavora 💪',
    'Mi piace questo posto!',
    'Ho una fame… 🍕',
    'Hai già arredato la stanza?',
  ];
  game.lastTime = performance.now();
  game.animClock = 0;
}

/** Casetta di un animale nella stanza, con il fumetto quando ha fame o ha appena mangiato. */
function drawPetHomeWithBubble(kind: PetKind, it: GameValue, t: number): void {
  drawPetHome(kind, it, t || 0);
  const text = homeBubble(kind, t || 0);
  if (text) drawPetBubble(it.x, it.y, (it.z || 30) + 6, text);
}
