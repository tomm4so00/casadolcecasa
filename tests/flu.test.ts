import { describe, expect, it } from 'vitest';
import { createCharacterState } from '../src/game/models.js';
import { advanceNeeds, type NeedsRules } from '../src/game/simulation.js';
import {
  FLU_CONTAGION_DELAY_MS,
  FLU_MAX_GAP_DAYS,
  canCatchFlu,
  decodeFlu,
  fluDamage,
  healthyFlu,
  isSick,
  nextFluAt,
  startFlu,
  updateFluOnset,
} from '../src/game/flu-rules.js';

const HOUR = 3_600_000;
const DAY = 24 * HOUR;
const T0 = 1_800_000_000_000;

// bisogni che non calano: così si vede solo l'effetto dell'influenza
const rules: NeedsRules = {
  sleepDepletion: 1e12,
  sleepRecovery: 28800,
  hungerAwake: 1e12,
  hungerSleeping: 1e12,
  hygieneDepletion: 1e12,
  happinessDepletion: 1e12,
  healthDamage: 172800,
  gameMinutesPerSecond: 1,
  drugBase: 0,
  drugPeak: 0,
  drugHighHours: 6,
  drugTaperHours: 18,
};

describe('influenza', () => {
  it('la prossima influenza spontanea arriva entro 30 giorni', () => {
    expect(nextFluAt(T0, 0)).toBe(T0);
    expect(nextFluAt(T0, 1)).toBe(T0 + FLU_MAX_GAP_DAYS * DAY);
    const flu = healthyFlu();
    startFlu(flu, T0);
    expect(flu.until).toBe(T0 + 12 * HOUR);
    expect(flu.nextAt).toBeGreaterThanOrEqual(flu.until);
    expect(flu.nextAt).toBeLessThanOrEqual(flu.until + FLU_MAX_GAP_DAYS * DAY);
  });

  it('si perde il 3% di salute all’ora per 12 ore', () => {
    const flu = healthyFlu();
    startFlu(flu, T0);
    expect(fluDamage(flu, T0, T0 + HOUR)).toBeCloseTo(3);
    expect(fluDamage(flu, T0 - DAY, T0 + DAY)).toBeCloseTo(36);
  });

  it('ci si ammala 30 secondi dopo essersi avvicinati a un malato, e poi si è immuni per un po’', () => {
    const flu = healthyFlu();
    flu.nextAt = T0 + 20 * DAY;
    expect(canCatchFlu(flu, T0)).toBe(true);
    flu.exposedAt = T0;
    expect(canCatchFlu(flu, T0 + 1000)).toBe(false);
    expect(updateFluOnset(flu, T0 + FLU_CONTAGION_DELAY_MS - 1)).toBe(false);
    expect(updateFluOnset(flu, T0 + FLU_CONTAGION_DELAY_MS)).toBe(true);
    expect(isSick(flu, T0 + FLU_CONTAGION_DELAY_MS)).toBe(true);
    expect(flu.exposedAt).toBe(0);
    // appena guariti non ci si riammala per contagio
    expect(canCatchFlu(flu, flu.until + HOUR)).toBe(false);
    expect(canCatchFlu(flu, flu.until + 4 * DAY)).toBe(true);
  });

  it('la simulazione (anche a gioco chiuso) fa partire l’influenza e toglie salute', () => {
    const closed = createCharacterState();
    closed.healthLevel = 100;
    closed.flu = { ...healthyFlu(), nextAt: T0 + HOUR };
    const open = structuredClone(closed);
    const seconds = 20 * 3600;
    advanceNeeds(closed, seconds, T0 + seconds * 1000, rules);
    for (let i = 1; i <= seconds / 60; i++) advanceNeeds(open, 60, T0 + i * 60_000, rules);
    expect(closed.flu.sickAt).toBe(T0 + HOUR);
    expect(closed.healthLevel).toBeCloseTo(64, 6);
    expect(open.healthLevel).toBeCloseTo(closed.healthLevel, 6);
    expect(isSick(closed.flu, T0 + seconds * 1000)).toBe(false);
  });

  it('il salvataggio si legge anche se rovinato', () => {
    expect(decodeFlu(null)).toEqual(healthyFlu());
    expect(decodeFlu({ sickAt: 5, until: 2, nextAt: -1, exposedAt: 'x' })).toEqual({
      sickAt: 5,
      until: 5,
      nextAt: 0,
      exposedAt: 0,
    });
  });
});
