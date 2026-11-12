import { maskText } from '../../shared/text-filter-rules.js';
import { wokeFromPause } from './dormancy.js';
import { movedIn } from './move.js';
import { countUse } from './usage.js';
import { showcase } from './showcase.js';
import { game } from './context.js';
import { startGame } from './interface.js';
import { toast } from './missions.js';
import { lifetime } from './runtime.js';
import type firebase from 'firebase/compat/app';
import { isLegacyEmail, usernameFromEmail } from './account-model.js';
import {
  accessFor,
  accountLogins,
  claimLegacySim,
  clearGuestMark,
  createGoogleSim,
  createGuestSim,
  signInAsGuest,
  type GoogleAccess,
  LEGACY_SIM_CODE,
  localLegacySimCode,
  rememberedGoogleUser,
  rememberMe,
  addEmailToAccount,
  claimEmail,
  emailConfirmed,
  registerWithEmail,
  reloadConfirmed,
  resendVerification,
  sendPasswordReset,
  setRememberMe,
  signedInWithPassword,
  signInWithGoogleAccount,
  signInWithPassword,
  signOutAccount,
  useGoogleSim,
} from './accounts.js';

type Step = 'home' | 'login' | 'register' | 'verify' | 'add-email' | 'choice' | 'code' | 'new';

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
    // la vetrina (showcase.ts) a tutto schermo solo nel primo passo; negli altri resta dietro
    root.querySelector('#ui-setup-screen')?.setAttribute('data-step', step);
  };
  showcase(root);

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
    // L'ospite ha salvato il personaggio (Google o email collegati): via il segno "guest".
    if (access.guestMark && !access.anonymous) {
      await clearGuestMark(access.uid, playerId);
      game.session.guestSaved = true;
      toast(
        '💾 Personaggio salvato! Ora lo ritrovi su ogni dispositivo e puoi scrivere in chat.',
        7000,
      );
    }
    game.session.guest = access.anonymous;
    useGoogleSim(access.uid, playerId);
    localStorage.setItem(game.session.LS_PREFIX + 'sims_player_nick', nick.slice(0, 20));
    await startGame();
  };

  const savedNick = () =>
    localStorage.getItem(game.session.LS_PREFIX + 'sims_player_nick') || access?.name || '';

  const remember = el<HTMLInputElement>('setup-remember');
  remember.checked = rememberMe();

  // Account di prima a cui si sta aggiungendo l'email (vedi il passaggio "add-email").
  let newEmail = '';

  // Account con email e password: si gioca solo con l'email confermata. Il Sim si crea subito,
  // con il nome scelto (niente Sim da recuperare: quelli vecchi si collegano solo con Google).
  const enterPasswordAccount = async (user: firebase.User, nick?: string) => {
    if (isLegacyEmail(user.email)) {
      show('add-email');
      el('setup-add-email').focus();
      return;
    }
    if (!emailConfirmed(user)) {
      el('setup-verify-address').textContent = user.email || '';
      show('verify');
      return;
    }
    // ogni casella vale un solo account
    await claimEmail();
    access = await accessFor(user);
    await setRememberMe(remember.checked);
    const name = (nick || user.displayName || usernameFromEmail(user.email) || '').slice(0, 20);
    if (access.playerId) await play(access.playerId, savedNick() || name);
    else await play(await createGoogleSim(access.uid), name);
    if (!accountLogins().google)
      toast(
        '🔗 Puoi collegare il tuo account Google: tocca il pulsante 🧑 per aprire il profilo e scegli «Collega Google».',
        8000,
      );
  };

  const signIn = async (restored?: firebase.User) => {
    if (restored && (await signedInWithPassword(restored))) {
      await enterPasswordAccount(restored);
      return;
    }
    access = restored ? await accessFor(restored) : await signInWithGoogleAccount();
    // un ospite resta sempre ricordato: chiudendo il browser perderebbe il personaggio
    if (!access.anonymous) await setRememberMe(remember.checked);
    if (access.playerId) {
      await play(access.playerId, savedNick());
      return;
    }
    // ospite entrato ma senza personaggio (pagina chiusa a metà): il nome lo chiede la creazione
    if (access.anonymous) {
      await play(await createGuestSim(access.uid), savedNick());
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
  run(loginButton, () => {
    countUse('ingresso:google');
    return signIn();
  });

  // ---- gioca subito, da ospite: nome, aspetto e 18 anni li chiede la creazione (first-entry.ts)
  run(el('setup-guest'), async () => {
    countUse('ingresso:gioca_subito');
    const user = await signInAsGuest();
    access = await accessFor(user);
    await play(access.playerId ?? (await createGuestSim(access.uid)), savedNick());
  });

  // ---- nome giocatore e password
  const userInput = el<HTMLInputElement>('setup-username');
  const passInput = el<HTMLInputElement>('setup-password');
  const passwordLogin = el<HTMLButtonElement>('setup-password-login');
  run(passwordLogin, async () => {
    countUse('ingresso:email_accesso');
    await setRememberMe(remember.checked);
    await enterPasswordAccount(await signInWithPassword(userInput.value, passInput.value));
  });
  lifetime.listen(passInput, 'keydown', (e: Event) => {
    if ((e as KeyboardEvent).key === 'Enter') passwordLogin.click();
  });
  const regUser = el<HTMLInputElement>('setup-reg-username');
  const regEmail = el<HTMLInputElement>('setup-reg-email');
  const regPass = el<HTMLInputElement>('setup-reg-password');
  const regPass2 = el<HTMLInputElement>('setup-reg-password2');
  run(el('setup-register-open'), async () => {
    regUser.value ||= userInput.value.trim();
    show('register');
    regUser.focus();
  });
  run(el('setup-register'), async () => {
    countUse('ingresso:email_nuovo');
    if (regPass.value !== regPass2.value) {
      toast('Le due password non sono uguali.');
      return;
    }
    await setRememberMe(remember.checked);
    const user = await registerWithEmail(regUser.value, regEmail.value, regPass.value);
    await enterPasswordAccount(user, regUser.value.trim());
  });
  run(el('setup-forgot'), async () => {
    await sendPasswordReset(userInput.value);
    toast('📧 Ti abbiamo mandato un link per scegliere una nuova password.', 6000);
  });

  // ---- conferma dell'email
  const backToLogin = async () => {
    await signOutAccount().catch(() => {});
    show('login');
  };
  run(el('setup-verify-done'), async () => {
    let user: firebase.User | null;
    try {
      user = await reloadConfirmed();
    } catch (error) {
      // cambiando email Firebase chiede di rientrare: si entra con quella nuova
      if (!newEmail) throw error;
      await backToLogin();
      userInput.value = newEmail;
      passInput.focus();
      toast('✅ Ora entra con la tua email e la password di sempre.', 6000);
      return;
    }
    if (!user) {
      toast("Non risulta ancora confermata: apri il link nell'email, poi tocca di nuovo.", 6000);
      return;
    }
    await enterPasswordAccount(user);
  });
  run(el('setup-verify-resend'), async () => {
    if (newEmail) await addEmailToAccount(newEmail);
    else await resendVerification();
    toast('📧 Email rimandata.');
  });
  run(el('setup-verify-logout'), backToLogin);
  run(el('setup-add-email-logout'), backToLogin);
  run(el('setup-add-email-send'), async () => {
    const input = el<HTMLInputElement>('setup-add-email');
    await addEmailToAccount(input.value);
    newEmail = input.value.trim();
    el('setup-verify-address').textContent = newEmail;
    show('verify');
  });
  panel.querySelectorAll<HTMLButtonElement>('[data-setup-login]').forEach((button) => {
    lifetime.listen(button, 'click', () => show('login'));
  });
  panel.querySelectorAll<HTMLButtonElement>('[data-setup-home]').forEach((button) => {
    lifetime.listen(button, 'click', () => show('home'));
  });
  show('home');
  // With "Ricordami" a returning player goes straight into the game. Anche tornando dalla pausa
  // (dormancy.ts): la pagina si è ricaricata da sola e il giocatore si aspetta il gioco. E dopo il
  // trasloco dal vecchio indirizzo (move.ts), anche senza "Ricordami": era già dentro.
  const autoEnter = remember.checked || wokeFromPause() || movedIn;
  // l'imbuto d'ingresso (usage.ts): conta chi vede davvero la schermata, non chi rientra da solo
  if (!autoEnter) countUse('ingresso:visto');
  if (autoEnter) {
    loginButton.disabled = true;
    loginButton.textContent = 'Accesso in corso…';
    const pageLoaded = new Promise<void>((resolve) => {
      if (document.readyState === 'complete') resolve();
      else lifetime.listen(window, 'load', () => resolve());
    });
    void Promise.all([rememberedGoogleUser(), pageLoaded])
      // nessun accesso da riprendere: è qualcuno che vede la schermata d'ingresso
      .then(([user]) => (user ? signIn(user) : countUse('ingresso:visto')))
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
    const nick = maskText(nickInput.value.trim());
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
