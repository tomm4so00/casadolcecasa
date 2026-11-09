// Pillola misteriosa nel gioco: dipendenza come le dosi di prima, più l'effetto tirato a sorte.
import { game } from './context.js';
import { toast } from './missions.js';
import { drugTake } from './needs.js';
import {
  MUNCHIES_HUNGER,
  PILL_EFFECTS,
  PILL_TEXT,
  type PillEffect,
  pillActive,
  pillFever,
  rollPillEffect,
  withPillTimer,
} from './pill-rules.js';

/** Si prende una pillola (già tolta dallo zaino): dipendenza ed effetto a sorpresa. */
export function takePill(r = Math.random()): PillEffect {
  const now = Date.now();
  drugTake();
  const effect = rollPillEffect(r, game.player.healthLevel);
  const p = game.player;
  if (effect === 'euphoria') p.happinessLevel = 100;
  if (effect === 'munchies') p.hungerLevel = Math.max(0, p.hungerLevel - MUNCHIES_HUNGER);
  if (effect === 'fever' && p.flu) p.flu = pillFever(p.flu, now);
  if (effect === 'insomnia' && p.isSleeping) p.isSleeping = false;
  p.pill = withPillTimer(p.pill, effect, now);
  // dopo l'avviso della dipendenza
  setTimeout(() => toast(PILL_TEXT[effect], 6000), 1800);
  return effect;
}

export const pillOn = (id: PillEffect): boolean => pillActive(game.player.pill, id, Date.now());

/** Comandi invertiti: −1 mentre dura l'effetto. */
export const pillControlSign = (): number => (pillOn('inverted') ? -1 : 1);

/** Premi del cabinato doppi con la fortuna. */
export const pillPrizeFactor = (): number => (pillOn('lucky') ? 2 : 1);

/** Con l'insonnia non si va a letto: il messaggio, oppure null. */
export function pillSleepBlock(): string | null {
  if (!pillOn('insomnia')) return null;
  const left = Math.ceil(((game.player.pill?.insomnia ?? 0) - Date.now()) / 60_000);
  return `👀 Hai gli occhi sbarrati: non riesci a dormire per altri ${left} minuti.`;
}

let tinted = false;
/** Ogni fotogramma: i colori psichedelici girano sulla scena finché dura l'effetto. */
export function updatePillVisuals(t: number): void {
  const canvas = game.view.canvas as HTMLCanvasElement | undefined;
  if (!canvas) return;
  if (pillOn('psychedelic') && !game.player.isDead) {
    tinted = true;
    canvas.style.filter = `hue-rotate(${Math.round((t * 80) % 360)}deg) saturate(1.8)`;
  } else if (tinted) {
    tinted = false;
    canvas.style.filter = '';
  }
}

/** Per il riquadro dello zaino: cosa sta facendo la pillola adesso. */
export function activePillText(): string {
  const now = Date.now();
  const on = (Object.keys(PILL_EFFECTS) as PillEffect[]).filter((id) =>
    pillActive(game.player.pill, id, now),
  );
  return on
    .map((id) => {
      const min = Math.ceil(((game.player.pill?.[id] ?? 0) - now) / 60_000);
      return `${PILL_EFFECTS[id].icon} ${PILL_EFFECTS[id].name} (${min} min)`;
    })
    .join(' · ');
}
