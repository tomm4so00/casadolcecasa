import template from './view.html?raw';
import { initializeGame } from './initialize.js';
import { game } from './context.js';
import { bindUiActions } from './ui-bindings.js';
import { startGame } from './interface.js';
import { saveGame } from './saves.js';
import { toast } from './missions.js';
import { lifetime, resetLifetime } from './runtime.js';
import { importRefactoredSave } from './save-model.js';
import { loginWithGoogle, releasePlayerSession } from './accounts.js';
export function mountLatestGame() {
  resetLifetime();
  const root = document.getElementById('app');
  if (!root) throw new Error('Contenitore del gioco mancante');
  root.innerHTML = template;
  bindUiActions(root);
  initializeGame();
  importRefactoredSave(localStorage, game.session.LS_PREFIX);
  if (!game.session.OFFLINE) {
    const setup = root.querySelector('#ui-setup-screen .card');
    const login = document.createElement('button');
    login.id = 'cloud-game-btn';
    login.className = 'btn-primary';
    login.textContent = 'Accedi con Google e gioca';
    login.style.marginTop = '10px';
    setup?.append(login);
    lifetime.listen(login, 'click', () => {
      login.disabled = true;
      void loginWithGoogle()
        .then((name) => {
          const input = root.querySelector<HTMLInputElement>('#nickname');
          const nick = input?.value.trim() || name;
          localStorage.setItem(game.session.LS_PREFIX + 'sims_player_nick', nick.slice(0, 20));
          return startGame();
        })
        .catch((error) => toast('Accesso Google non disponibile: ' + String(error), 6000))
        .finally(() => {
          login.disabled = false;
        });
    });
  }
  const exit = document.createElement('button');
  exit.id = 'save-exit';
  exit.textContent = 'Salva ed esci';
  exit.className = 'btn-save-exit';
  root.append(exit);
  const status = document.createElement('span');
  status.id = 'save-status';
  status.className = 'save-status';
  status.textContent = game.session.OFFLINE ? 'Modalità locale' : 'Modalità online';
  root.append(status);
  lifetime.listen(exit, 'click', () => {
    void (async () => {
      exit.disabled = true;
      const scope = lifetime;
      let timer: ReturnType<typeof setTimeout> | undefined;
      const saved = await Promise.race([
        saveGame(true),
        new Promise<boolean>((resolve) => {
          timer = scope.setTimeout(() => resolve(false), 8000);
        }),
      ]);
      if (timer !== undefined) scope.clearTimeout(timer);
      if (!saved) {
        exit.disabled = false;
        toast('Il cloud non ha ancora confermato: riprova quando sei connesso.', 5000);
        return;
      }
      await releasePlayerSession();
      await disposeLatestGame();
      mountLatestGame();
    })().catch((error) => {
      exit.disabled = false;
      toast(String(error), 5000);
    });
  });
  return disposeLatestGame;
}

export async function disposeLatestGame() {
  if (!lifetime.active) return;
  const reference =
    game.session.db && game.session.myPlayerId
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
