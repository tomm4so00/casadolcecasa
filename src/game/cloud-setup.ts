import { game } from './context.js';
import { startGame } from './interface.js';
import { toast } from './missions.js';
import { lifetime } from './runtime.js';
import type firebase from 'firebase/compat/app';
import { usernameFromEmail } from './account-model.js';
import {
  accessFor,
  claimLegacySim,
  createGoogleSim,
  type GoogleAccess,
  LEGACY_SIM_CODE,
  localLegacySimCode,
  rememberedGoogleUser,
  rememberMe,
  registerWithPassword,
  setRememberMe,
  signInWithGoogleAccount,
  signInWithPassword,
  useGoogleSim,
} from './accounts.js';

type Step = 'login' | 'register' | 'choice' | 'code' | 'new';

// Online setup: Google first, then (only on the first access) existing Sim or new Sim.
export function mountCloudSetup(root: HTMLElement): void {
  root.querySelector('#setup-offline')?.classList.add('hidden');
  const panel = root.querySelector<HTMLElement>('#setup-online');
  if (!panel) return;
  panel.classList.remove('hidden');
  const el = <T extends HTMLElement = HTMLElement>(id: string) =>
    panel.querySelector<T>('#' + id) as T;
  const codeInput = el<HTMLInputElement>('setup-code');
  const nickInput = el<HTMLInputElement>('setup-nickname');
  let access: GoogleAccess | null = null;

  const show = (step: Step) => {
    panel.querySelectorAll<HTMLElement>('.setup-step').forEach((node) => {
      node.classList.toggle('hidden', node.dataset.step !== step);
    });
  };

  // Disables the button while the action runs and reports failures without leaving the step.
  const run = (button: HTMLButtonElement, action: () => Promise<void>) => {
    lifetime.listen(button, 'click', () => {
      if (button.disabled) return;
      button.disabled = true;
      void action()
        .catch((error) =>
          toast(error instanceof Error ? error.message : 'Accesso non riuscito: ' + error, 6000),
        )
        .finally(() => {
          button.disabled = false;
        });
    });
  };

  const play = async (playerId: string, nick: string) => {
    if (!access) return;
    useGoogleSim(access.uid, playerId);
    localStorage.setItem(game.session.LS_PREFIX + 'sims_player_nick', nick.slice(0, 20));
    await startGame();
  };

  const savedNick = () =>
    localStorage.getItem(game.session.LS_PREFIX + 'sims_player_nick') || access?.name || '';

  const remember = el<HTMLInputElement>('setup-remember');
  remember.checked = rememberMe();

  // Account con nome giocatore e password: il Sim si crea subito, con il nome giocatore
  // (niente Sim da recuperare: quelli vecchi si collegano solo con Google).
  const enterPasswordAccount = async (user: firebase.User, nick?: string) => {
    access = await accessFor(user);
    await setRememberMe(remember.checked);
    const name = (nick || user.displayName || usernameFromEmail(user.email) || '').slice(0, 20);
    if (access.playerId) await play(access.playerId, savedNick() || name);
    else await play(await createGoogleSim(access.uid), name);
  };

  const signIn = async (restored?: firebase.User) => {
    if (restored && usernameFromEmail(restored.email)) {
      await enterPasswordAccount(restored);
      return;
    }
    access = restored ? await accessFor(restored) : await signInWithGoogleAccount();
    await setRememberMe(remember.checked);
    if (access.playerId) {
      await play(access.playerId, savedNick());
      return;
    }
    // First access: link by itself the Sim saved on this device, or the one requested
    // when links still needed an admin. Without one, ask the player.
    const candidates = [access.pendingPlayerId, localLegacySimCode()].filter(
      (code): code is string => !!code && LEGACY_SIM_CODE.test(code),
    );
    for (const code of new Set(candidates)) {
      try {
        await play(await claimLegacySim(code), savedNick());
        return;
      } catch {
        codeInput.value ||= code;
      }
    }
    show('choice');
  };

  const loginButton = el<HTMLButtonElement>('cloud-game-btn');
  run(loginButton, () => signIn());

  // ---- nome giocatore e password
  const userInput = el<HTMLInputElement>('setup-username');
  const passInput = el<HTMLInputElement>('setup-password');
  const passwordLogin = el<HTMLButtonElement>('setup-password-login');
  run(passwordLogin, async () => {
    await setRememberMe(remember.checked);
    await enterPasswordAccount(await signInWithPassword(userInput.value, passInput.value));
  });
  lifetime.listen(passInput, 'keydown', (e: Event) => {
    if ((e as KeyboardEvent).key === 'Enter') passwordLogin.click();
  });
  const regUser = el<HTMLInputElement>('setup-reg-username');
  const regPass = el<HTMLInputElement>('setup-reg-password');
  const regPass2 = el<HTMLInputElement>('setup-reg-password2');
  run(el('setup-register-open'), async () => {
    regUser.value ||= userInput.value.trim();
    show('register');
    regUser.focus();
  });
  run(el('setup-register'), async () => {
    if (regPass.value !== regPass2.value) {
      toast('Le due password non sono uguali.');
      return;
    }
    await setRememberMe(remember.checked);
    const user = await registerWithPassword(regUser.value, regPass.value);
    await enterPasswordAccount(user, regUser.value.trim());
  });
  panel.querySelectorAll<HTMLButtonElement>('[data-setup-login]').forEach((button) => {
    lifetime.listen(button, 'click', () => show('login'));
  });
  // With "Ricordami" a returning player goes straight into the game.
  if (remember.checked) {
    loginButton.disabled = true;
    loginButton.textContent = 'Accesso in corso…';
    const pageLoaded = new Promise<void>((resolve) => {
      if (document.readyState === 'complete') resolve();
      else lifetime.listen(window, 'load', () => resolve());
    });
    void Promise.all([rememberedGoogleUser(), pageLoaded])
      .then(([user]) => (user ? signIn(user) : undefined))
      .catch((error) =>
        toast(error instanceof Error ? error.message : 'Accesso non riuscito: ' + error, 6000),
      )
      .finally(() => {
        loginButton.disabled = false;
        loginButton.textContent = 'Accedi con Google';
      });
  }
  run(el('setup-has-sim'), async () => {
    if (!codeInput.value) codeInput.value = localLegacySimCode() || '';
    show('code');
    codeInput.focus();
  });
  run(el('setup-new-sim'), async () => {
    if (!nickInput.value) nickInput.value = savedNick();
    show('new');
    nickInput.focus();
  });
  run(el('setup-send-code'), async () => {
    if (!access) return;
    await play(await claimLegacySim(codeInput.value), savedNick());
  });
  run(el('setup-create-sim'), async () => {
    if (!access) return;
    const nick = nickInput.value.trim();
    if (!nick) {
      toast('Inserisci un nome valido per iniziare!');
      return;
    }
    await play(await createGoogleSim(access.uid), nick);
  });
  panel.querySelectorAll<HTMLButtonElement>('[data-setup-back]').forEach((button) => {
    lifetime.listen(button, 'click', () => show('choice'));
  });
}
