// La vetrina della prima schermata: dietro all'accesso il cortile del condominio, disegnato dal
// motore del gioco (scripts/vetrina.mjs), di giorno, al tramonto o di notte secondo l'ora di
// Roma, e quanti vicini sono online adesso (lo dice il Worker: chi arriva non ha ancora un
// account per leggerlo da sé).
import { aliveText, onlineText, sceneFor } from './showcase-rules.js';
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

/**
 * Quanti vicini giocano adesso e quanti sono vivi; se il Worker non risponde in 4 secondi le
 * righe non compaiono.
 */
async function showOnline(root: HTMLElement): Promise<void> {
  const pill = root.querySelector<HTMLElement>('#setup-online-count');
  if (!pill) return;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 4000);
  try {
    const res = await fetch(WORKER_URL + '/online', { signal: controller.signal });
    const { n, vivi } = (await res.json()) as { n: unknown; vivi: unknown };
    if (typeof n === 'number' && n >= 0) {
      pill.querySelector('span')!.textContent = onlineText(n);
      pill.classList.remove('hidden');
    }
    const alive = root.querySelector<HTMLElement>('#setup-alive-count');
    if (alive && typeof vivi === 'number' && vivi >= 0) {
      alive.querySelector('span')!.textContent = aliveText(vivi);
      alive.classList.remove('hidden');
    }
  } catch {
    // senza numero la vetrina resta com'è
  } finally {
    clearTimeout(timer);
  }
}
