// La freccetta delle missioni sui pulsanti (regole in guide-rules.ts): quando il passo dice di
// toccare qualcosa («Regala», «Prendi Cibo», «Lavoro»…) o di aprire lo zaino, il pulsante giusto
// si illumina e una freccetta gialla lo indica. Così chi gioca da poco sa subito cosa toccare.
import { lifetime } from './runtime.js';
import { game } from './context.js';
import { exitMenuButton, pickAction, quotedActions, wantsBackpack } from './guide-rules.js';
import { welcomeDest, welcomeHint } from './welcome.js';

const CHECK_MS = 300;
/** Dove non si cerca: i pulsanti fissi a destra, i parametri e il riquadro della guida. */
const SKIP = '#hud-actions, #needs-hud, #coach';

let pointer: HTMLElement | null = null;
let lit: HTMLElement | null = null;

const visible = (el: HTMLElement): boolean => {
  // prima il controllo che costa poco: dentro un elemento nascosto offsetParent è null
  if (!el.offsetParent && getComputedStyle(el).position !== 'fixed') return false;
  const r = el.getBoundingClientRect();
  return r.width > 0 && r.height > 0 && getComputedStyle(el).visibility !== 'hidden';
};

/** Il pulsante da indicare adesso, o null. */
function target(): HTMLElement | null {
  const hint = welcomeHint();
  if (!hint) return null;
  const inventory = document.getElementById('inventory-modal');
  const backpackOpen = !!inventory && !inventory.classList.contains('hidden');
  if (wantsBackpack(hint) && !backpackOpen) return document.getElementById('btn-inventory');
  const actions = quotedActions(hint);
  const buttons = [...document.querySelectorAll<HTMLElement>('button')].filter(
    (b) => !b.closest(SKIP) && visible(b),
  );
  const i = pickAction(
    buttons.map((b) => b.textContent || ''),
    actions,
  );
  if (i >= 0) return buttons[i];
  // nel menu dell'uscita del condominio: il pulsante verso il posto della missione
  const dest = game.view.isOutsideMenuOpen ? welcomeDest() : null;
  const id = dest ? exitMenuButton(dest.env, game.view.outsideSubmenu || '') : null;
  const el = id ? document.getElementById(id) : null;
  return el && visible(el) ? el : null;
}

function place(el: HTMLElement): void {
  if (!pointer) {
    pointer = document.createElement('div');
    pointer.id = 'guide-pointer';
    pointer.setAttribute('aria-hidden', 'true');
    document.body.append(pointer);
  }
  const r = el.getBoundingClientRect();
  // a sinistra del pulsante, verso di lui; se non c'è spazio, sul suo bordo sinistro
  const left = Math.max(4, r.left - 40);
  pointer.style.left = left + 'px';
  pointer.style.top = r.top + r.height / 2 - 14 + 'px';
  pointer.classList.remove('hidden');
}

function update(): void {
  const el = target();
  if (lit && lit !== el) lit.classList.remove('guide-target');
  lit = el;
  if (!el) {
    pointer?.classList.add('hidden');
    return;
  }
  el.classList.add('guide-target');
  place(el);
}

export function startGuidePointer(): void {
  lifetime.setInterval(update, CHECK_MS);
  lifetime.add(() => {
    lit?.classList.remove('guide-target');
    pointer?.remove();
    pointer = null;
  });
}
