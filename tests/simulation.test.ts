import { describe, it, expect } from 'vitest';
import { createCharacterState } from '../src/game/models.js';
import { advanceNeeds, type NeedsRules } from '../src/game/simulation.js';

const rules: NeedsRules = {
  sleepDepletion: 86400,
  sleepRecovery: 28800,
  hungerAwake: 86400,
  hungerSleeping: 172800,
  hygieneDepletion: 86400,
  happinessDepletion: 86400,
  healthDamage: 172800,
  gameMinutesPerSecond: 1,
  drugBase: 0.35,
  drugPeak: 2.5,
  drugHighHours: 6,
  drugTaperHours: 18,
};
describe('shared needs simulation', () => {
  it('produces the same sleep, wake-up and health bonuses when open or closed', () => {
    const closed = createCharacterState();
    closed.isSleeping = true;
    closed.sleepLevel = 30;
    const open = structuredClone(closed);
    const duration = 8 * 3600;
    const start = 1_800_000_000_000;
    advanceNeeds(closed, duration, start + duration * 1000, rules);
    for (let i = 1; i <= duration; i++) advanceNeeds(open, 1, start + i * 1000, rules);
    for (const key of [
      'healthLevel',
      'sleepLevel',
      'hungerLevel',
      'hygieneLevel',
      'happinessLevel',
      'gameMinutes',
    ] as const)
      expect(closed[key], key).toBeCloseTo(open[key], 6);
    expect(closed.isSleeping).toBe(false);
    expect(closed.healthLevel).toBe(65);
  });
  it('keeps sleep and accumulated partial health recovery across saves', () => {
    const state = createCharacterState();
    state.isSleeping = true;
    state.sleepGainedSinceLastHealthBoost = 19;
    advanceNeeds(state, 288, 1_800_000_000_000, rules);
    expect(state.healthLevel).toBe(55);
    expect(state.sleepGainedSinceLastHealthBoost).toBeCloseTo(0);
    expect(state.isSleeping).toBe(true);
  });
  it('handles long absences, dependency and invalid clocks without non-finite values', () => {
    const state = createCharacterState();
    state.drug = {
      active: true,
      doses: 4,
      lastDose: 1000,
      endAt: 1e9,
      dAtDose: 100,
      crisisAt: 1000,
    };
    advanceNeeds(state, 80 * 3600, 80 * 3600000 + 1000, rules);
    expect(state.healthLevel).toBe(0);
    expect(state.sleepLevel).toBeGreaterThanOrEqual(0);
    const before = structuredClone(state);
    advanceNeeds(state, -300, 0, rules);
    advanceNeeds(state, NaN, 0, rules);
    expect(state).toEqual(before);
  });
});

describe('felicità bassa', () => {
  it('sotto il 10% di felicità si perde l’1% di salute all’ora, anche a gioco chiuso', () => {
    const calm: NeedsRules = {
      ...rules,
      sleepDepletion: 1e12,
      hungerAwake: 1e12,
      hungerSleeping: 1e12,
      hygieneDepletion: 1e12,
      happinessDepletion: 360000, // −1% di felicità ogni ora
    };
    const closed = createCharacterState();
    closed.healthLevel = 80;
    closed.happinessLevel = 12;
    const open = structuredClone(closed);
    const seconds = 10 * 3600;
    const start = 1_800_000_000_000;
    advanceNeeds(closed, seconds, start + seconds * 1000, calm);
    for (let i = 1; i <= seconds / 60; i++) advanceNeeds(open, 60, start + i * 60_000, calm);
    // 2 ore per scendere al 10%, poi 8 ore da tristi: −8% di salute
    expect(closed.happinessLevel).toBeCloseTo(2, 6);
    expect(closed.healthLevel).toBeCloseTo(72, 6);
    expect(open.healthLevel).toBeCloseTo(closed.healthLevel, 6);
  });
});
