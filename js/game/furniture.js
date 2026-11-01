import { state } from '../state.js';

// Modalità "sposta mobile": mentre è attiva il joystick muove il mobile invece del giocatore.

export function startMovingFurniture(key) {
  state.movingObjectKey = key;
}

export function placeFurniture() {
  state.movingObjectKey = null;
}
