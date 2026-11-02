import { describe, expect, it } from 'vitest';
import { FURNITURE_CATALOG } from '../src/game/data/catalogues.js';
import {
  bedSleepSpeed,
  furnitureBenefit,
  plantHappinessDecay,
} from '../src/game/furniture-benefits.js';

describe('vantaggi dei mobili', () => {
  it('la pianta rallenta il calo della felicità di più a ogni fascia', () => {
    const none = plantHappinessDecay({});
    const std = plantHappinessDecay({ plant_std: true });
    const pre = plantHappinessDecay({ plant_std: true, plant_pre: true });
    const lux = plantHappinessDecay({ plant_lux: true });
    expect(none).toBe(1);
    expect(std).toBeLessThan(none);
    expect(pre).toBeLessThan(std);
    expect(lux).toBeLessThan(pre);
  });

  it('il letto migliore fa recuperare il sonno più in fretta', () => {
    expect(bedSleepSpeed({})).toBe(1);
    expect(bedSleepSpeed({ bed_pre: true })).toBeGreaterThan(1);
    expect(bedSleepSpeed({ bed_pre: true, bed_lux: true })).toBeGreaterThan(
      bedSleepSpeed({ bed_pre: true }),
    );
  });

  it('ogni mobile ha un messaggio che spiega cosa fa', () => {
    for (const def of FURNITURE_CATALOG) expect(furnitureBenefit(def), def.id).not.toBe('');
    expect(furnitureBenefit({ id: 'plant_lux', category: 'plant' })).toContain('80%');
    expect(furnitureBenefit({ id: 'bed_pre', category: 'bed' })).toContain('25%');
  });
});
