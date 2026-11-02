import template from './view.html?raw';
import { initializeGame } from './initialize.js';
import { game } from './context.js';
import { bindUiActions } from './ui-bindings.js';
import { lifetime, resetLifetime } from './runtime.js';
import { importRefactoredSave } from './save-model.js';
import { mountCloudSetup } from './cloud-setup.js';
export function mountLatestGame() {
  resetLifetime();
  const root = document.getElementById('app');
  if (!root) throw new Error('Contenitore del gioco mancante');
  root.innerHTML = template;
  bindUiActions(root);
  initializeGame();
  importRefactoredSave(localStorage, game.session.LS_PREFIX);
  if (!game.session.OFFLINE) mountCloudSetup(root);
  return disposeLatestGame;
}

export async function disposeLatestGame() {
  if (!lifetime.active) return;
  const reference =
    game.session.db && game.session.myPlayerId && (game.session.OFFLINE || game.session.authUid)
      ? game.session.db.ref('sims_online_players/' + game.session.myPlayerId)
      : null;
  for (const key of ['audioCtx', 'musicCtx']) {
    const context = game[key as keyof typeof game];
    if (context?.close) void context.close();
  }
  lifetime.dispose();
  if (reference) {
    await reference.remove();
    await reference.onDisconnect().cancel();
  }
}
