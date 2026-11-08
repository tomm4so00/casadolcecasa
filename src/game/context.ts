import type { IsoPart } from './render/iso-sort.js';
import type { Business } from '../../shared/market.js';
import type { SHOP_CATALOG, FURNITURE_CATALOG } from './data/catalogues.js';
import type {
  CharacterState,
  ViewState,
  SessionState,
  RoomState,
  ChatMessage,
  DialogResult,
  CameraState,
  ViewOverride,
  SceneMap,
} from './models.js';
import type { OnlinePlayer } from './network-model.js';

/** Dynamic values at the boundary with the v8 save format and scene catalogues. */
export type GameValue = any;

interface GameContext {
  view: ViewState;
  player: CharacterState;
  session: SessionState;
  firebaseConfig: GameValue;
  GAME_VERSION: number;
  onlinePlayers: Record<string, OnlinePlayer>;
  vaultCache: number;
  bankBalance: number;
  kissAnim: GameValue;
  /** true se il personaggio è svenuto a terra (sonno finito mentre era offline). */
  fainted: boolean;
  /** Già chiesto, in questa sessione, di cambiare un vecchio PIN con il 5. */
  pinRetiredAsked: boolean;
  /** Inizio dell'animazione con cui si rialza (0 = nessuna). */
  faintRiseAt: number;
  /** Rotazione del mobile che si sta disegnando (null = nessuna). */
  furnRot: { k: number; cx: number; cy: number } | null;
  /** Parti del mobile ruotato in attesa di essere disegnate nell'ordine giusto. */
  furnQueue: IsoPart[] | null;
  kissPending: GameValue;
  legacyPocketMoney: number;
  vaultSynced: boolean;
  lastNoRoomToastAt: number;
  hasSetSafePin: boolean;
  safePinCode: string;
  showerAnim: GameValue;
  /** Animazione del WC o del lavandino in corso (kind: 'toilet' | 'wash'). */
  bathAnim: GameValue;
  /** Seduti su una panchina del cortile (o mentre ci si siede/alza). */
  benchSit: GameValue;
  /** Moneta lanciata nella fontana del cortile. */
  coinToss: GameValue;
  /** Gelato che si sta mangiando (comprato al centro commerciale). */
  iceCream: GameValue;
  /** Momento (animClock) dell'ultimo scarico del WC, per il vortice d'acqua. */
  toiletFlushAt: number;
  /** Qualcuno si sta lavando le mani in questo fotogramma (acqua dal rubinetto). */
  frameSinkRunning: boolean;
  sleepK: number;
  /** Cuscino su cui dorme il giocatore: 0 sinistro, 1 destro (nel letto ci stanno in due). */
  bedSlot: number;
  showerFog: number;
  frameShowerActors: GameValue;
  /** Chi è seduto su una sedia in questo fotogramma: lo disegna la sedia (render/objects.ts). */
  frameChairSitters: GameValue;
  /** La scrivania del PC della stanza in cui si è (per la sua sedia), o null. */
  frameDesk: GameValue;
  SLEEP_DEPLETION_SEC: number;
  SLEEP_RECOVERY_SEC: number;
  HUNGER_AWAKE_DEPLETION_SEC: number;
  HUNGER_SLEEP_DEPLETION_SEC: number;
  HYGIENE_DEPLETION_SEC: number;
  HEALTH_DAMAGE_SEC: number;
  shopCatalog: Array<(typeof SHOP_CATALOG)[number]>;
  SLOTS: GameValue;
  SLOT_INFO: GameValue;
  OPTIONAL_SLOTS: GameValue;
  DEFAULT_LOOK: GameValue;
  botLooks: GameValue;
  BODY_PARTS: GameValue;
  BODY_KEYS: GameValue;
  CREATOR_TABS: GameValue;
  bodyString: GameValue;
  OLD_SKIN_IDX: GameValue;
  OLD_HAIR_IDX: GameValue;
  myBody: GameValue;
  bodyChosen: boolean;
  furnitureCatalog: Array<(typeof FURNITURE_CATALOG)[number]>;
  playerPos: { x: number; y: number };
  moveForward: number;
  moveRight: number;
  isSprinting: boolean;
  keysPressed: GameValue;
  isMovingFurnitureMode: boolean;
  /** modalità Arreda: vicino ai mobili il pulsante è solo "Sposta" */
  arrangeMode: boolean;
  isDraggingFurniture: boolean;
  movingPropKey: string | null;
  activeTargetProp: GameValue;
  APT_COUNT: number;
  ROOMS_PER_APT: number;
  TOTAL_ROOMS: GameValue;
  APT_ENVS: GameValue;
  currentApt: number;
  aptOfRoom: GameValue;
  gRoomIdx: GameValue;
  saloonTitle: GameValue;
  blankRoom: GameValue;
  roomsState: RoomState[];
  myAssignedRoomIdx: number | null;
  joystickTouchId: GameValue;
  joystickOrigin: GameValue;
  pinPromptMoneyThreshold: number;
  theftAttempts: GameValue;
  isWalking: boolean;
  remoteSmooth: GameValue;
  currentRoomIdx: number | null;
  GAME_MINUTES_PER_SEC: GameValue;
  activeShift: GameValue;
  SHIFT_SECONDS: number;
  mySay: string;
  mySayT: number;
  dialogResolve: ((result: DialogResult) => void) | null;
  HAPPINESS_DEPLETION_SEC: number;
  lastMoneyForSound: GameValue;
  lastEnvForSound: GameValue;
  relaxCooldownUntil: number;
  audioCtx: GameValue;
  soundOn: GameValue;
  musicOn: GameValue;
  MUSIC: GameValue;
  NOTE_IX: GameValue;
  midiOf: GameValue;
  midiHz: GameValue;
  MUSIC_TRACKS: GameValue;
  MISSIONS: GameValue;
  lastCloudSaveAt: number;
  lastCloudMoney: GameValue;
  lastLayoutKey: string;
  presenceTrack: GameValue;
  INTRO_PAGES: GameValue;
  simulationBots: GameValue;
  playerRoomFurniture: SceneMap;
  kitchenFurniture: SceneMap;
  bathroomFurniture: SceneMap;
  clothesStoreFurniture: SceneMap;
  storeFloorFurniture: SceneMap;
  bankFurniture: SceneMap;
  artStudioFurniture: SceneMap;
  engineeringFurniture: SceneMap;
  bettingFurniture: SceneMap;
  arcadeFurniture: SceneMap;
  moonFurniture: SceneMap;
  growshopFurniture: SceneMap;
  petshopFurniture: SceneMap;
  collectShopFurniture: SceneMap;
  usedShopFurniture: SceneMap;
  /** Galleria d'Arte: i posti dei dieci quadri in mostra e l'uscita verso il laboratorio. */
  galleryFurniture: SceneMap;
  /** Dentro la base spaziale lunare. */
  moonbaseInsideFurniture: SceneMap;
  /** Cane al guinzaglio che segue il giocatore (null se è a casa). */
  dogWalk: GameValue;
  /** Dove è stato lasciato il cane togliendogli il guinzaglio. */
  dogLeftAt: { x: number; y: number } | null;
  /** Fino a quando (animClock) il cancello dell'area cani resta aperto. */
  dogGateOpenUntil: number;
  /** Cani e gatti di chi abita nella stanza che si sta visitando. */
  visitFreePets: string[];
  /** Stanza in cui si stava dormendo quando si è chiuso il gioco (null = la propria). */
  sleepRoom: number | null;
  /** Fino a quando (performance.now) si vede il fumo della canna. */
  smokeUntil: number;
  /** Porte tenute aperte mentre le si attraversa: id → fino a quando (performance.now). */
  doorForce: Record<string, number>;
  /** Curvatura del terreno (solo sulla luna). */
  moonCurve: number;
  /** Ultimi decolli verso la luna e dalla luna (ora del server). */
  rocketTripAt: number;
  moonTripAt: number;
  /** Viaggio in corso con il razzo: direzione e ora del decollo. */
  rocketTrip: { dir: 'up' | 'down'; at: number } | null;
  mallFurniture: SceneMap;
  /** Fase del razzo del laboratorio ingegneristico: 0 niente, 1 pezzi, 2 completo. */
  rocketStage: number;
  /** Fase della base lunare (0 = non ancora avviata, 3 = completa). */
  moonBaseStage: number;
  /** Soldi raccolti per la base lunare (per lo schermo del laboratorio). */
  moonBaseFunded: number;
  /** Ora (del server) del lancio del razzo, 0 se non è ancora fissata. */
  rocketLaunchAt: number;
  /** Momento (animClock) in cui si è premuto il pulsante rosso, per l'animazione. */
  launchPressedAt: number;
  /** Chi ha versato per il razzo (codice giocatore → euro): per la targhetta in camera. */
  rocketDonors: Record<string, number>;
  saloonDoors: SceneMap;
  courtyardDoors: SceneMap;
  ABSENT_DEATH_MS: GameValue;
  ABSENT_DEATH_ESTIMATE_MS: GameValue;
  lastNeedsWall: GameValue;
  lastDangerToast: number;
  DRUG_PRICE: number;
  DRUG_DOSE: number;
  DRUG_EUPHORIA: number;
  DRUG_BASE: number;
  DRUG_PEAK: number;
  DRUG_HIGH_H: number;
  DRUG_TAPER_H: number;
  drugWindowMs: GameValue;
  discoMap: GameValue;
  barMap: GameValue;
  /** Parco: il cancello dell'area cani (l'unico oggetto con un pulsante). */
  parkMap: GameValue;
  DISCO_LINES: GameValue;
  DEALER_LINES: GameValue;
  SOC_RANGE: number;
  SOC_CD_MS: number;
  SOC_MSG_TTL: GameValue;
  socCd: GameValue;
  frameNear: GameValue;
  socKey: string;
  socTarget: GameValue;
  SOC_ACTIONS: GameValue;
  socBusy: GameValue;
  pick: GameValue;
  socDone: GameValue;
  socPending: boolean;
  BIZ: readonly Business[];
  bizById: (id: string) => Business | undefined;
  bizValue: (id: string) => number;
  investedTotal: () => number;
  fmtEur: (amount: number) => string;
  fmtPct: (amount: number) => string;
  bizBuilt: boolean;
  CHAT_KEEP: number;
  CHAT_SHOW: number;
  CHAT_MAX_LEN: number;
  chatMsgs: ChatMessage[];
  chatInit: boolean;
  chatSeen: Record<string, boolean>;
  chatLastSend: number;
  chatReadT: number;
  chatHadRead: boolean;
  chatOpen: () => boolean;
  COFFEE_SLEEP: number;
  COFFEE_HEALTH: number;
  COFFEE_CD_MS: GameValue;
  COFFEE_MIN_HEALTH: number;
  coffeeBrewUntil: number;
  BASE_TITLE: GameValue;
  notifyOn: boolean;
  ALERT_DEFS: GameValue;
  alertLevel: GameValue;
  wakeAlertSent: boolean;
  SKILL_PAY: boolean;
  MG: GameValue;
  WORK_JOBS: GameValue;
  previewRaf: GameValue;
  shopState: GameValue;
  wardrobeAnim: GameValue;
  wardrobeSlot: string;
  viewOverride: ViewOverride | null;
  cam: CameraState | null;
  _rgbCache: GameValue;
  lighten: GameValue;
  darken: GameValue;
  FURNITURE_DRAW: GameValue;
  discoRGB: GameValue;
  DISCO_PRICE: number;
  DISCO_HAPPY: number;
  DISCO_SLEEP: number;
  PROP_DRAW: GameValue;
  graveList: GameValue;
  graveMap: GameValue;
  ENV_PROPS: GameValue;
  ENV_DECOR: GameValue;
  ROOM_WALLS: GameValue;
  ENV_STYLE: GameValue;
  X0: number;
  X1: number;
  Y0: number;
  Y1: number;
  WALL_DECOR: GameValue;
  WALL_DECOR_DYNAMIC: GameValue;
  /** Pavimento e pareti già disegnati, con la chiave della scena a cui appartengono. */
  bgCache: { key: string; canvas: HTMLCanvasElement | null };
  lightCanvas: GameValue;
  SKIN_TONES: GameValue;
  HAIR_COLORS: GameValue;
  creatorDraft: GameValue;
  creatorTab: string;
  creatorResolve: GameValue;
  creatorRaf: GameValue;
  OUTDOOR_ENVS: GameValue;
  BOT_LINES: GameValue;
  lastTime: GameValue;
  animClock: number;
  readonly moneyLevel: number;
  lastSavePromise: Promise<boolean>;
  lastSaveContent: string | null;
  lastCloudSaveContent: string | null;
}

export const game = {} as GameContext;
