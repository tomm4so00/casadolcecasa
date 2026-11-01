import { state } from './state.js';
import { initCanvas } from './engine/canvas.js';
import { initInput } from './engine/input.js';
import { startLoop } from './engine/loop.js';
import { updateMovement, findNearbyObject } from './game/world.js';
import { getActions } from './game/interactions.js';
import { renderScene } from './render/scene.js';
import { initHud, updateHud } from './ui/hud.js';
import { initPopup, showActions } from './ui/popup.js';
import { initModals } from './ui/modals.js';
import { initSetupScreen } from './ui/setupScreen.js';
import { initMultiplayer } from './net/multiplayer.js';

// Punto d'ingresso del gioco.

initCanvas('game-canvas');
initSetupScreen(startGame);

function startGame(nick) {
  state.nick = nick;

  initHud();
  initPopup();
  initModals();
  initInput();
  initMultiplayer();

  startLoop(tick);
}

// Un frame di gioco: prima aggiorna lo stato, poi lo mostra.
function tick(delta, time) {
  update(delta);
  renderScene(time);
}

function update(delta) {
  updateMovement(delta);

  // Animazione apertura frigo (pronta per essere usata nel rendering)
  const k = state.kitchen;
  k.fridgeAnim += ((k.fridgeOpen ? 1 : 0) - k.fridgeAnim) * delta * 6;

  // Popup interazioni: nascosto mentre si sposta un mobile
  const target = state.movingObjectKey ? null : findNearbyObject();
  if (!target) state.outsideMenuOpen = false;
  showActions(target ? getActions(target.key, target.obj) : []);

  updateHud();
}
