// I due pulsanti di destra che si aprono: 🔊 con le barre del volume (effetti e musica) e le
// notifiche, 💬 con la chat del condominio e il fumetto sopra la testa. Così i pulsanti in
// colonna sono meno; un tocco fuori, o su una voce del menu, li richiude.
import { dom, lifetime } from './runtime.js';
import { musicVolume, setMusicVolume, setSoundVolume, soundVolume } from './audio.js';
import { game } from './context.js';

const MENUS = ['audio', 'chat'] as const;
type Menu = (typeof MENUS)[number];

const pop = (m: Menu): HTMLElement | null => dom('hud-menu-' + m);

/** Chiude tutti i menu (tranne `keep`). */
function closeMenus(keep?: Menu): void {
  for (const m of MENUS) if (m !== keep) pop(m)?.classList.add('hidden');
}

/** Le barre mostrano il volume di adesso (a 0 se quel suono è spento). */
function syncSliders(): void {
  const set = (id: string, on: boolean, v: number): void => {
    const input = dom(id) as HTMLInputElement | null;
    const pct = on ? Math.round(v * 100) : 0;
    if (input) input.value = String(pct);
    const txt = dom(id + '-txt');
    if (txt) txt.textContent = pct + '%';
  };
  set('vol-sound', !!game.soundOn, soundVolume());
  set('vol-music', !!game.musicOn, musicVolume());
}

/** Tocco su 🔊 o 💬: apre il suo menu, o lo richiude se era aperto. */
export function toggleHudMenu(which: string): void {
  const m = MENUS.find((x) => x === which);
  if (!m) return;
  const el = pop(m);
  if (!el) return;
  const open = el.classList.contains('hidden');
  closeMenus(m);
  el.classList.toggle('hidden', !open);
  if (open && m === 'audio') syncSliders();
}

export function startHudMenus(): void {
  const bind = (id: string, apply: (v: number) => void): void => {
    const input = dom(id) as HTMLInputElement | null;
    if (!input) return;
    lifetime.listen(input, 'input', () => {
      apply(Number(input.value) / 100);
      syncSliders();
    });
  };
  bind('vol-sound', setSoundVolume);
  bind('vol-music', setMusicVolume);
  // un tocco fuori dai menu li chiude (appena comincia: il gioco i tocchi sulla scena li tiene per
  // sé); una voce del menu chat lo chiude dopo averla aperta
  lifetime.listen(
    document,
    'pointerdown',
    (e: Event) => {
      const t = e.target instanceof Element ? e.target : null;
      if (t && !t.closest('.hud-group')) closeMenus();
    },
    { capture: true },
  );
  lifetime.listen(document, 'click', (e: Event) => {
    if (e.target instanceof Element && e.target.closest('.hud-pop-close')) closeMenus();
  });
}
