import { game } from './context.js';
import type { NeedsRules } from './simulation.js';
export function needsRules(): NeedsRules {
  return {
    sleepDepletion: game.SLEEP_DEPLETION_SEC,
    sleepRecovery: game.SLEEP_RECOVERY_SEC,
    hungerAwake: game.HUNGER_AWAKE_DEPLETION_SEC,
    hungerSleeping: game.HUNGER_SLEEP_DEPLETION_SEC,
    hygieneDepletion: game.HYGIENE_DEPLETION_SEC,
    happinessDepletion: game.HAPPINESS_DEPLETION_SEC,
    healthDamage: game.HEALTH_DAMAGE_SEC,
    gameMinutesPerSecond: game.GAME_MINUTES_PER_SEC,
    drugBase: game.DRUG_BASE,
    drugPeak: game.DRUG_PEAK,
    drugHighHours: game.DRUG_HIGH_H,
    drugTaperHours: game.DRUG_TAPER_H,
  };
}
