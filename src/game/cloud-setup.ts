import { game } from './context.js';
import { startGame } from './interface.js';
import { toast } from './missions.js';
import { lifetime } from './runtime.js';
import {
  createGoogleSim,
  type GoogleAccess,
  localLegacySimCode,
  requestLegacyLink,
  signInWithGoogleAccount,
  useGoogleSim,
} from './accounts.js';

type Step = 'login' | 'choice' | 'code' | 'new' | 'pending';

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
    if (step === 'pending' && access?.pendingPlayerId)
      el('setup-pending-code').textContent = access.pendingPlayerId;
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

  const signIn = async () => {
    access = await signInWithGoogleAccount();
    if (access.playerId)
      await play(
        access.playerId,
        localStorage.getItem(game.session.LS_PREFIX + 'sims_player_nick') || access.name,
      );
    else show(access.pendingPlayerId ? 'pending' : 'choice');
  };

  run(el('cloud-game-btn'), signIn);
  run(el('setup-check-again'), signIn);
  run(el('setup-has-sim'), async () => {
    if (!codeInput.value) codeInput.value = localLegacySimCode() || '';
    show('code');
    codeInput.focus();
  });
  run(el('setup-new-sim'), async () => {
    if (!nickInput.value)
      nickInput.value =
        localStorage.getItem(game.session.LS_PREFIX + 'sims_player_nick') || access?.name || '';
    show('new');
    nickInput.focus();
  });
  run(el('setup-send-code'), async () => {
    if (!access) return;
    const code = codeInput.value.trim();
    await requestLegacyLink(code);
    access.pendingPlayerId = code;
    show('pending');
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
