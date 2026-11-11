import template from './view.html?raw';
import { version } from '../../package.json';
import { isTestStage } from './stage.js';
import { initializeGame } from './initialize.js';
import { game } from './context.js';
import { bindUiActions } from './ui-bindings.js';
import { lifetime, resetLifetime } from './runtime.js';
import { importRefactoredSave } from './save-model.js';
import { mountCloudSetup } from './cloud-setup.js';
import { OFFLINE_MARK } from './saves.js';
import { offerInstall } from './install.js';
import { rememberInviteFromUrl } from './invite.js';
import { rememberChallengeFromUrl } from './arcade.js';
import { worldNode } from './world-db.js';
export function mountLatestGame() {
  resetLifetime();
  const root = document.getElementById('app');
  if (!root) throw new Error('Contenitore del gioco mancante');
  root.innerHTML = template;
  const versionTag = document.getElementById('app-version');
  // nel gioco di prova la scritta PROVA: nessuno lo confonde con quello di tutti
  if (versionTag) versionTag.textContent = 'v' + version + (isTestStage() ? ' · PROVA' : '');
  bindUiActions(root);
  initializeGame();
  // Dopo initializeGame: serve la sessione per sapere dove ricordare l'invito
  rememberInviteFromUrl();
  // e la sfida della sala giochi mandata con un link
  rememberChallengeFromUrl();
  importRefactoredSave(localStorage, game.session.LS_PREFIX);
  if (!game.session.OFFLINE) mountCloudSetup(root);
  offerInstall();
  return disposeLatestGame;
}

async function disposeLatestGame() {
  if (!lifetime.active) return;
  const reference =
    game.session.db && game.session.myPlayerId && (game.session.OFFLINE || game.session.authUid)
      ? game.session.db.ref(worldNode('online_players') + '/' + game.session.myPlayerId)
      : null;
  for (const key of ['audioCtx', 'musicCtx']) {
    const context = game[key as keyof typeof game];
    if (context?.close) void context.close();
  }
  lifetime.dispose();
  if (reference) {
    // Chiudendo il gioco il personaggio resta visibile agli altri, segnato come offline
    await reference.update(OFFLINE_MARK);
    await reference.onDisconnect().cancel();
  }
}
