// Casco spaziale: sulla luna (fuori dalla base) non c'è aria. Chi ha comprato il casco al negozio
// di vestiti se lo trova addosso appena arriva; chi non ce l'ha perde l'1% di salute al secondo.
import { game } from './context.js';
import { dom } from './runtime.js';
import { toast } from './missions.js';
import { sendNotify } from './needs.js';
import { sfx } from './audio.js';
import { ownsItem } from './character.js';

const SPACE_HELMET = 'hat_space';
/** Salute persa ogni secondo sulla luna senza casco. */
const NO_HELMET_DAMAGE_PER_SEC = 1;
/** Ogni quanto ricordare di tornare indietro (secondi). */
const REMIND_EVERY = 25;

let lastEnv = '';
/** Cappello che si portava prima di mettersi il casco (si rimette tornando dalla luna). */
let savedHat: string | null | undefined;
let nextRemindAt = 0;

const hasSpaceHelmet = (): boolean => !!ownsItem(SPACE_HELMET);

/** Ogni fotogramma: casco addosso sulla luna, e salute che scende a chi non ce l'ha. */
export function updateSpaceHelmet(dt: number, t: number): void {
  const env = game.view.activeEnvironment;
  const onMoon = env === 'luna' && !game.rocketTrip;
  const overlay = dom('no-air-overlay');
  if (!game.session.saveReady || game.player.isDead) {
    overlay?.classList.add('hidden');
    return;
  }
  if (onMoon && lastEnv !== 'luna') arriveOnMoon(t);
  else if (!onMoon && lastEnv === 'luna') leaveMoon();
  lastEnv = onMoon ? 'luna' : env;
  const suffocating = onMoon && !hasSpaceHelmet() && !game.fainted;
  overlay?.classList.toggle('hidden', !suffocating);
  if (!suffocating) return;
  game.player.healthLevel = Math.max(0, game.player.healthLevel - NO_HELMET_DAMAGE_PER_SEC * dt);
  if (t >= nextRemindAt) {
    nextRemindAt = t + REMIND_EVERY;
    toast(
      `🫁 Senza casco stai perdendo salute (${Math.round(game.player.healthLevel)}%)! Torna sulla Terra col razzo${(game.moonBaseStage || 0) >= 3 ? ' o entra nella base' : ''}.`,
      4500,
    );
  }
}

function arriveOnMoon(t: number): void {
  if (hasSpaceHelmet()) {
    // il casco si mette da solo
    if (game.player.equipped.hat !== SPACE_HELMET) {
      savedHat = game.player.equipped.hat ?? null;
      game.player.equipped.hat = SPACE_HELMET;
    }
    toast('🚀 Hai indossato il casco spaziale: qui sulla luna puoi respirare tranquillo.', 4000);
    return;
  }
  // avviso solo adesso, una volta arrivati senza casco
  nextRemindAt = t + REMIND_EVERY;
  const msg =
    '⚠️ Sulla luna non c’è aria! Senza casco spaziale perdi l’1% di salute al secondo. ' +
    'Torna subito sulla Terra col razzo e compra il casco al negozio di vestiti.';
  toast(msg, 9000);
  if (document.hidden) sendNotify('⚠️ Casa dolce casa: urgente', msg, 'sims-no-helmet');
  sfx('error');
}

function leaveMoon(): void {
  // tornati dalla luna (o entrati nella base) si rimette il cappello di prima
  if (savedHat !== undefined && game.player.equipped.hat === SPACE_HELMET) {
    game.player.equipped.hat = savedHat;
  }
  savedHat = undefined;
}
