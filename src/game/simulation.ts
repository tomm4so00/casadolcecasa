import { bedSleepSpeed, plantHappinessDecay } from './furniture-benefits.js';
import type { CharacterState, DrugState } from './models.js';
import { fluDamage, fluOnsetAt, updateFluOnset } from './flu-rules.js';

export interface NeedsRules {
  sleepDepletion: number;
  sleepRecovery: number;
  hungerAwake: number;
  hungerSleeping: number;
  hygieneDepletion: number;
  happinessDepletion: number;
  healthDamage: number;
  gameMinutesPerSecond: number;
  drugBase: number;
  drugPeak: number;
  drugHighHours: number;
  drugTaperHours: number;
}
/** Sotto questa felicità ci si intristisce e la salute cala piano… */
const SAD_HAPPINESS = 10;
/** …di tanti punti all'ora. */
const SAD_HEALTH_PER_HOUR = 1;

function dependencyRate(drug: DrugState, now: number, rules: NeedsRules): number {
  if (!drug.active || now >= drug.endAt) return 0;
  const hours = drug.crisisAt ? (now - drug.crisisAt) / 3600000 : -1;
  const peak =
    hours < 0
      ? 0
      : hours < rules.drugHighHours
        ? 1
        : Math.max(0, 1 - (hours - rules.drugHighHours) / rules.drugTaperHours);
  return rules.drugBase + peak * rules.drugPeak;
}

/** The same simulation is used for visible play, suspended tabs and closed games. */
export function advanceNeeds(
  state: CharacterState,
  seconds: number,
  endAt: number,
  rules: NeedsRules,
): void {
  if (state.isDead || !Number.isFinite(seconds) || seconds <= 0 || !Number.isFinite(endAt)) return;
  let remaining = seconds;
  let now = endAt - seconds * 1000;
  // Letto e pianta migliori: riposo più rapido e felicità che cala più lentamente.
  const bed = bedSleepSpeed(state.ownedFurniture);
  const plant = plantHappinessDecay(state.ownedFurniture);
  while (remaining > 1e-8 && state.healthLevel > 0) {
    if (state.isSleeping && state.sleepLevel >= 100 - 1e-8) {
      state.sleepLevel = 100;
      state.isSleeping = false;
    }
    if (state.drug.active && now >= state.drug.endAt) state.drug.active = false;
    const flu = state.flu;
    if (flu) updateFluOnset(flu, now);
    const sleeping = state.isSleeping;
    const sleepRate = sleeping ? (100 * bed) / rules.sleepRecovery : -100 / rules.sleepDepletion;
    const hungerRate = -100 / (sleeping ? rules.hungerSleeping : rules.hungerAwake);
    const hygieneRate = (-100 * (sleeping ? 0.5 : 1)) / rules.hygieneDepletion;
    let step = Math.min(remaining, 60);
    const boundary = (seconds: number) => {
      if (seconds > 1e-8) step = Math.min(step, seconds);
    };
    boundary(sleeping ? (100 - state.sleepLevel) / sleepRate : state.sleepLevel / -sleepRate);
    boundary(state.hungerLevel / -hungerRate);
    boundary(state.hygieneLevel / -hygieneRate);
    const happinessRate = (100 * plant) / rules.happinessDepletion;
    if (state.happinessLevel > SAD_HAPPINESS + 1e-8)
      boundary((state.happinessLevel - SAD_HAPPINESS) / happinessRate);
    if (sleeping) boundary((20 - state.sleepGainedSinceLastHealthBoost) / sleepRate);
    const drug = state.drug;
    if (drug.active) {
      for (const time of [
        drug.endAt,
        drug.crisisAt,
        drug.crisisAt + rules.drugHighHours * 3600000,
        drug.crisisAt + (rules.drugHighHours + rules.drugTaperHours) * 3600000,
      ])
        boundary((time - now) / 1000);
    }
    if (flu) {
      boundary((fluOnsetAt(flu) - now) / 1000);
      boundary((flu.until - now) / 1000);
    }
    // tristezza: si guarda la felicità a inizio passo (il passo finisce quando scende al 10%)
    const sadDamage =
      state.happinessLevel <= SAD_HAPPINESS + 1e-8 ? (SAD_HEALTH_PER_HOUR * step) / 3600 : 0;
    const healthRate =
      state.sleepLevel <= 1e-8 || state.hungerLevel <= 1e-8 || state.hygieneLevel <= 1e-8
        ? 100 / rules.healthDamage
        : 0;
    state.sleepLevel = Math.max(0, Math.min(100, state.sleepLevel + sleepRate * step));
    state.hungerLevel = Math.max(0, state.hungerLevel + hungerRate * step);
    state.hygieneLevel = Math.max(0, state.hygieneLevel + hygieneRate * step);
    state.happinessLevel = Math.max(
      0,
      state.happinessLevel - (100 * plant * step) / rules.happinessDepletion,
    );
    // Midpoint integration is exact on each linear section of dependencyRate.
    const drugDamage = (dependencyRate(drug, now + step * 500, rules) * step) / 3600;
    const sickDamage = flu ? fluDamage(flu, now, now + step * 1000) : 0;
    state.healthLevel = Math.max(
      0,
      state.healthLevel - healthRate * step - drugDamage - sickDamage - sadDamage,
    );
    if (sleeping && state.healthLevel > 0) {
      state.sleepGainedSinceLastHealthBoost += sleepRate * step;
      if (state.sleepGainedSinceLastHealthBoost >= 20 - 1e-8) {
        state.healthLevel = Math.min(100, state.healthLevel + 5);
        state.sleepGainedSinceLastHealthBoost = Math.max(
          0,
          state.sleepGainedSinceLastHealthBoost - 20,
        );
      }
    }
    state.gameMinutes += step * rules.gameMinutesPerSecond;
    now += step * 1000;
    remaining -= step;
  }
  if (state.isSleeping && state.sleepLevel >= 100 - 1e-8) state.isSleeping = false;
  if (state.drug.active && endAt >= state.drug.endAt) state.drug.active = false;
}
