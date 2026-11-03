import type { WeedState } from './weed-rules.js';
import type { FluState } from './flu-rules.js';
import type { DailyUses } from './daily-limits.js';
import type { PetBook } from './pet-rules.js';
import type { PersonalityState } from './personality-rules.js';
import type { WorkDay } from './job-pay.js';
import type { RomanceBook } from './romance-rules.js';
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
export interface MapItem extends Point {
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
export interface Investment {
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
}
export interface DialogOptions {
  title: string;
  text?: string;
  input?: { placeholder?: string; numeric?: boolean; maxLength?: number } | null;
  buttons: { label: string; value: string | null; color?: string }[];
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
  id: number;
  owner?: string | null;
  ownerId?: string | null;
  vaultMoney: number;
  pin?: string | null;
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
  hasFoodInInventory: boolean;
  foodIsCooked: boolean;
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
  coffeeAt: number;
  bornAt: number;
  isDead: boolean;
  deadAt: number;
  epitaph: string;
  gameMinutes: number;
  missionIndex: number;
  /** Relazioni romantiche con gli altri giocatori. */
  romance?: RomanceBook;
  /** Punti delle personalità sviluppate giocando. */
  personality?: PersonalityState;
  /** Turni di lavoro iniziati oggi (massimo SHIFTS_PER_DAY). */
  workDay?: WorkDay;
  /** Pianta in vaso e barattolo d'erba nella propria stanza. */
  weed?: WeedState;
  /** Influenza: in corso, in arrivo per contagio o la prossima spontanea. */
  flu?: FluState;
  /** Azioni con un massimo al giorno già fatte oggi (viaggio, WC). */
  daily?: DailyUses;
  /** Animali domestici: fame e posizione delle casette. */
  pets?: PetBook;
}
export interface SessionState {
  authUid: string | null;
  db: GameDatabase;
  OFFLINE: boolean;
  LS_PREFIX: string;
  SAVE_KEY: string;
  myPlayerId: string;
  saveReady: boolean;
  gameStarted: boolean;
  serverOffset: number;
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
  hasFoodInInventory: false,
  foodIsCooked: false,
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
  coffeeAt: 0,
  bornAt: 0,
  isDead: false,
  deadAt: 0,
  epitaph: '',
  gameMinutes: 0,
  missionIndex: 0,
  romance: {},
});
