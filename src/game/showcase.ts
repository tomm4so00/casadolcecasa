// La vetrina della prima schermata: dietro all'accesso il cortile del condominio, disegnato dal
// motore del gioco (scripts/vetrina.mjs), di giorno, al tramonto o di notte secondo l'ora di
// Roma, e quanti vicini sono online adesso (lo dice il Worker: chi arriva non ha ancora un
// account per leggerlo da sé).
import { onlineText, sceneFor } from './showcase-rules.js';
import { WORKER_URL } from './worker-client.js';

const romeHour = (): number =>
  Number(
    new Intl.DateTimeFormat('en-GB', {
      timeZone: 'Europe/Rome',
      hour: '2-digit',
      hourCycle: 'h23',
    }).format(new Date()),
  );

/** Accende la vetrina dentro la schermata d'ingresso. */
export function showcase(root: HTMLElement): void {
  const screen = root.querySelector<HTMLElement>('#ui-setup-screen');
  const scene = root.querySelector<HTMLElement>('#setup-scene');
  if (!screen || !scene) return;
  screen.classList.add('showcase');
  scene.style.backgroundImage = `url(./vetrina/${sceneFor(romeHour())}.jpg)`;
  scene.classList.remove('hidden');
  root.querySelector('#setup-brand')?.classList.remove('hidden');
  void showOnline(root);
}

/** Il numero dei vicini online; se il Worker non risponde in 4 secondi la riga non compare. */
async function showOnline(root: HTMLElement): Promise<void> {
  const pill = root.querySelector<HTMLElement>('#setup-online-count');
  if (!pill) return;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 4000);
  try {
    const res = await fetch(WORKER_URL + '/online', { signal: controller.signal });
    const { n } = (await res.json()) as { n: unknown };
    if (typeof n !== 'number' || n < 0) return;
    pill.querySelector('span')!.textContent = onlineText(n);
    pill.classList.remove('hidden');
  } catch {
    // senza numero la vetrina resta com'è
  } finally {
    clearTimeout(timer);
  }
}
