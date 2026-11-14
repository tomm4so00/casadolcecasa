// La vetrina della prima schermata: dietro all'accesso il cortile del condominio, disegnato dal
// motore del gioco (scripts/vetrina.mjs), di giorno, al tramonto o di notte secondo l'ora di
// Roma, e quanti vicini sono online adesso (lo dice il Worker: chi arriva non ha ancora un
// account per leggerlo da sé).
import { countPills, sceneFor } from './showcase-rules.js';
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
 * Quanti vicini giocano adesso, quanti ci vivono e le stanze libere (countPills); se il Worker non
 * risponde in 4 secondi le scritte non compaiono.
 */
async function showOnline(root: HTMLElement): Promise<void> {
  const box = root.querySelector<HTMLElement>('#setup-counts');
  if (!box) return;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 4000);
  try {
    const res = await fetch(WORKER_URL + '/online', { signal: controller.signal });
    const pills = countPills((await res.json()) as Record<string, unknown>);
    box.replaceChildren(
      ...pills.map((p) => {
        const el = document.createElement('div');
        el.className = 'setup-online-count';
        const mark = document.createElement(p.live ? 'i' : 'b');
        mark.textContent = p.icon;
        mark.setAttribute('aria-hidden', 'true');
        el.append(mark, Object.assign(document.createElement('span'), { textContent: p.text }));
        return el;
      }),
    );
  } catch {
    // senza numero la vetrina resta com'è
  } finally {
    clearTimeout(timer);
  }
}
