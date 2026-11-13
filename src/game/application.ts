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
import { initEmbed } from './embed.js';
import { rememberInviteFromUrl } from './invite.js';
import { rememberChallengeFromUrl } from './arcade.js';
import { worldNode } from './world-db.js';
import { devMode } from './dev-mode.js';
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
  if (!devMode) importRefactoredSave(localStorage, game.session.LS_PREFIX);
  if (!game.session.OFFLINE) mountCloudSetup(root);
  if (import.meta.env.DEV && !devMode) {
    const testButton = document.createElement('button');
    testButton.textContent = '🧪 Entra con Sim di prova (salta login)';
    testButton.style.cssText =
      'position:fixed;bottom:24px;left:50%;transform:translateX(-50%);z-index:10000;padding:14px 20px;background:#243b68;color:white;border:2px solid white;border-radius:12px;cursor:pointer';
    testButton.onclick = () => {
      const url = new URL(location.href);
      url.searchParams.set('test', '1');
      location.assign(url);
    };
    document.body.append(testButton);
    lifetime.add(() => testButton.remove());
  }
  // dentro la cornice di itch & co.: il pulsante dello schermo intero (embed.ts)
  initEmbed();
  offerInstall();
  if (devMode) void import('./dev-tools.js').then((m) => m.startDevGame());
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
