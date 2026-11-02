import type { RomanceBook } from './romance-rules.js';
import type { GameDatabase } from './database.js';

export interface Point {
  x: number;
  y: number;
}
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
