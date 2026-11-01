import { DEFAULT_NICK } from './config.js';
import { ENVIRONMENTS } from './data/environments.js';
import { NEEDS, INITIAL_NEED_VALUE } from './data/needs.js';

// Unico stato mutabile del gioco. Tutti i moduli leggono e scrivono qui,
// la UI e il rendering si limitano a mostrarlo.
export const state = {
  playerId: 'player_' + Math.random().toString(36).substring(2, 9),
  nick: DEFAULT_NICK,

  // Dove si trova il giocatore
  envId: 'SALOON',
  title: ENVIRONMENTS.SALOON.title,
  roomIdx: null,          // indice della stanza privata (0-7) se envId === 'PLAYER_ROOM'
  pos: { x: 0, y: 0 },

  // Input (scritto da js/engine/input.js), valori da -1 a 1
  input: { forward: 0, right: 0 },
  sprinting: false,

  needs: Object.fromEntries(NEEDS.map(n => [n.key, INITIAL_NEED_VALUE])),
  isSleeping: false,

  kitchen: { fridgeOpen: false, fridgeAnim: 0 },
  inventory: { hasFood: false, foodCooked: false },

  movingObjectKey: null,  // mobile in fase di spostamento
  outsideMenuOpen: false, // menu attività della porta di casa aperto

  rooms: Array.from({ length: 8 }, (_, i) => ({ id: i + 1, owner: null })),

  // Copia modificabile degli oggetti di ogni ambiente
  objects: Object.fromEntries(
    Object.entries(ENVIRONMENTS).map(([id, env]) => [id, structuredClone(env.objects)])
  ),

  // Altri giocatori ricevuti da Firebase: { [id]: { name, x, y, env } }
  onlinePlayers: {},
};

export const currentEnv = () => ENVIRONMENTS[state.envId];
export const currentObjects = () => state.objects[state.envId];

const clamp = (v, min, max) => Math.max(min, Math.min(max, v));

export function changeNeed(key, amount) {
  state.needs[key] = clamp(state.needs[key] + amount, 0, 100);
}

export function setNeed(key, value) {
  state.needs[key] = clamp(value, 0, 100);
}
