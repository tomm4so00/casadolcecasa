import type { WeedState } from './weed-rules.js';
import type { FluState } from './flu-rules.js';
import type { PillTimers } from './pill-rules.js';
import type { LoyaltyBook } from './dealer-rules.js';
import type { DailyUses } from './daily-limits.js';
import type { PetBook } from './pet-rules.js';
import type { TrashSave } from './trash-rules.js';
import type { PersonalityState } from './personality-rules.js';
import type { WorkDay } from './job-pay.js';
import type { RomanceBook } from './romance-rules.js';
import type { RelationBook } from './relations-rules.js';
import type { WelcomeState } from './welcome-rules.js';
import type { QuestState } from './quests-rules.js';
import type { DailyState } from './daily-rules.js';
import type { GameDatabase } from './database.js';

export interface Point {
  x: number;
  y: number;
}
/** Spostamento della telecamera in unità isometriche e ambiente in cui è stata posizionata. */
export interface CameraState {
  u: number;
  v: number;
  env: string | null;
}
/** Disegno fuori dalla scena (icone, anteprime, sfondo in cache): centro e scala propri. */
export interface ViewOverride {
  cx: number;
  cy: number;
  scale: number;
}
/** Un oggetto di una scena: mobile, porta, bancone… (catalogues.ts). */
interface MapItem extends Point {
  w: number;
  h: number;
  z?: number;
  name?: string;
  moveable?: boolean;
  color?: string;
  topColor?: string;
  /** Porta: ambiente in cui porta. */
  targetEnv?: string;
  /** Porta di una stanza privata (indice nell'appartamento) o di un appartamento. */
  roomIdx?: number;
  aptIdx?: number;
  category?: string;
  slot?: string;
  wallItem?: boolean;
  title?: string;
  seed?: number;
  /** Quarti di giro del mobile. */
  rot?: number;
  /** Campi propri di alcuni oggetti (tombe, postazioni di lavoro…). */
  [extra: string]: unknown;
}
export type SceneMap = Record<string, MapItem>;
interface Investment {
  units: number;
  cost: number;
}
export interface ChatMessage {
  id: string;
  name: string;
  text: string;
  t: number;
}
export interface DialogResult {
  action: string | null;
  value: string;
  /** la casella `check` era spuntata */
  checked?: boolean;
}
export interface DialogOptions {
  title: string;
  text?: string;
  /** `value`: testo già scritto nel campo (per correggere un nome) */
  /** `multiline`: campo su più righe (Invio va a capo e non conferma) */
  input?: {
    placeholder?: string;
    numeric?: boolean;
    maxLength?: number;
    value?: string;
    multiline?: boolean;
  } | null;
  /** una casella da spuntare (con un link facoltativo, per esempio alle condizioni) */
  check?: { label: string; href?: string; linkText?: string } | null;
  /** `wide`: il pulsante occupa una riga intera, sotto gli altri; `needsCheck`: resta spento
   *  finché la casella non è spuntata */
  buttons: {
    label: string;
    value: string | null;
    color?: string;
    wide?: boolean;
    needsCheck?: boolean;
  }[];
}
export interface DrugState {
  active: boolean;
  doses: number;
  lastDose: number;
  endAt: number;
  dAtDose: number;
  crisisAt: number;
}
export interface EconomyState {
  version: 1;
  ownedItems: Record<string, boolean>;
  ownedFurniture: Record<string, boolean>;
  invest: Record<string, Investment>;
  /** Soldi depositati in banca. */
  bank?: number;
}
export interface RoomState {
  inventory?: import('./inventory-trade-rules.js').StockInventory;
  id: number;
  owner?: string | null;
  ownerId?: string | null;
  vaultMoney: number;
  /** PIN vecchio, leggibile da tutti: ora sta in sims_safe_pins e qui si cancella */
  pin?: string | null;
  /** la cassaforte ha una combinazione (quale, lo sa solo il proprietario) */
  pinSet?: boolean;
  /** l'ultimo furto riuscito: le regole del database lo accettano solo col PIN giusto */
  robbed?: { by: string; t: number };
  /** promemoria di chi abitava qui ed è morto: lo scrive il server (maintenance.ts) */
  pendingDeath?: { id: string; name?: string; lastSeen?: number };
  /** quadri appesi: posto → codice del quadro (painting-rules.ts) */
  paintings?: Record<string, string>;
  /** quadri messi in vendita dalla stanza, per posto */
  sale?: Record<string, unknown>;
  /** permessi di addebito: chi può prendere quanto da questa cassaforte (shared/debit-rules.ts) */
  allow?: Record<string, { amt: number; t: number }>;
  lastSeen?: number;
  layout?: Record<
    string,
    Point & { w?: number; h?: number; z?: number; name?: string; color?: string; topColor?: string }
  >;
  economy?: EconomyState;
}
export interface CharacterState {
  healthLevel: number;
  sleepLevel: number;
  hungerLevel: number;
  hygieneLevel: number;
  happinessLevel: number;
  isSleeping: boolean;
  sleepGainedSinceLastHealthBoost: number;
  /** Da quando (ms) fame, sonno e igiene sono tutti a zero; 0 se non lo sono. */
  needsZeroSince?: number;
  /** Cibo nello zaino: crudo (dal frigo) e piatti cucinati, a scorta (food-rules.ts). */
  rawFood: number;
  dishes: number;
  /** Dopo essersi lasciati: fino a quando non ci si fidanza con nessuno (ms). */
  /** quando ha accettato le condizioni la prima volta; 0 = non ancora (terms.ts) */
  termsAt?: number;
  /** quando ha confermato di avere almeno 18 anni (dalla 0.31; prima l'età minima era 14) */
  adultAt?: number;
  /** quando ha letto l'avviso della chat (terms.ts) */
  chatNoticeAt?: number;
  coupleCooldownUntil?: number;
  /** Da quando si dorme nello stesso letto del fidanzato (0 = no): per il premio al risveglio. */
  sleptTogetherSince?: number;
  ownedItems: Record<string, boolean>;
  ownedFurniture: Record<string, boolean>;
  equipped: Record<string, string | null>;
  activeJobKey: string | null;
  jobExperience: Record<string, number>;
  myData: { nick: string };
  stats: Record<string, number>;
  invest: Record<string, Investment>;
  drug: DrugState;
  drugStock: number;
  /** fino a quando si hanno gli occhi rossi dopo una canna (ms, ora del dispositivo) */
  stonedUntil: number;
  /** Prossimo consumo di erba consentito, anche dopo la fine degli effetti. */
  jointReadyAt?: number;
  coffeeAt: number;
  /** Ultimo uso del WC, per l’attesa di due ore anche a gioco chiuso. */
  toiletAt?: number;
  bornAt: number;
  isDead: boolean;
  deadAt: number;
  /** Motivi della morte (death-cause-rules.ts), "hunger,sleep". */
  deathCause?: string;
  epitaph: string;
  gameMinutes: number;
  missionIndex: number;
  /** Relazioni romantiche con gli altri giocatori. */
  romance?: RomanceBook;
  /** Come lo hanno trattato gli altri giocatori: amici e nemici. */
  relations?: RelationBook;
  /** Trofei dei capitoli e medaglie delle missioni bonus (render/trophies.ts). */
  trophies?: string[];
  /** Missioni di benvenuto: a che punto si è. */
  welcome?: WelcomeState;
  /** I capitoli delle missioni e le missioni bonus (quests-rules.ts). */
  quests?: QuestState;
  /** Le missioni del giorno e la serie di giorni (daily-rules.ts). */
  today?: DailyState;
  /** I posti in cui la riga «prima volta qui» è già comparsa (first-visit-rules.ts). */
  placesSeen?: string[];
  /** Punti delle personalità sviluppate giocando. */
  personality?: PersonalityState;
  /** Turni di lavoro iniziati oggi (massimo SHIFTS_PER_DAY). */
  workDay?: WorkDay;
  /** Piante in vaso nella propria stanza, erba e semi nello zaino. */
  weed?: WeedState;
  /** Influenza: in corso, in arrivo per contagio o la prossima spontanea. */
  flu?: FluState;
  /** Acquisti dagli spacciatori, per lo sconto fedeltà (dealer-rules.ts). */
  dealers?: LoyaltyBook;
  /** Effetti della pillola misteriosa che durano (pill-rules.ts). */
  pill?: PillTimers;
  /** Azioni con un massimo al giorno già fatte oggi (viaggio, WC). */
  daily?: DailyUses;
  /** Animali domestici: fame e posizione delle casette. */
  pets?: PetBook;
  trash?: TrashSave;
}
export interface SessionState {
  authUid: string | null;
  /** Si gioca come ospite (accesso anonimo): niente chat, scambi né acquisti finché non salva. */
  guest?: boolean;
  /** L'ospite ha appena salvato il personaggio: ora gli spetta l'invito con cui era arrivato. */
  guestSaved?: boolean;
  db: GameDatabase;
  OFFLINE: boolean;
  LS_PREFIX: string;
  SAVE_KEY: string;
  myPlayerId: string;
  saveReady: boolean;
  /** All'ingresso c'era già un personaggio salvato (sul dispositivo o online). */
  hadSave?: boolean;
  gameStarted: boolean;
  serverOffset: number;
  /** Il mondo (condominio) in cui si gioca: stanze, chat, cimitero… sono i suoi. */
  worldId: string;
  /** In pausa (dormancy.ts): scollegati dal database, niente bisogni né salvataggi. */
  dormant?: boolean;
}
export interface ViewState {
  activeEnvironment: string;
  currentRoomTitle: string;
  canvas: HTMLCanvasElement;
  ctx: CanvasRenderingContext2D;
  isOutsideMenuOpen: boolean;
  /** Gruppo aperto nel menu di uscita: '' (principale) o 'fun' (attività ricreative). */
  outsideSubmenu: '' | 'fun';
  fridgeIsOpen: boolean;
}
export const createCharacterState = (): CharacterState => ({
  healthLevel: 50,
  sleepLevel: 50,
  hungerLevel: 50,
  hygieneLevel: 50,
  happinessLevel: 50,
  isSleeping: false,
  sleepGainedSinceLastHealthBoost: 0,
  rawFood: 0,
  dishes: 0,
  ownedItems: {},
  ownedFurniture: {},
  equipped: {},
  activeJobKey: null,
  jobExperience: {},
  myData: { nick: '' },
  stats: {},
  invest: {},
  drug: { active: false, doses: 0, lastDose: 0, endAt: 0, dAtDose: 0, crisisAt: 0 },
  drugStock: 0,
  stonedUntil: 0,
  coffeeAt: 0,
  bornAt: 0,
  isDead: false,
  deadAt: 0,
  epitaph: '',
  gameMinutes: 0,
  missionIndex: 0,
  romance: {},
  relations: {},
});
