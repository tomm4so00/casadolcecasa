import fs from 'node:fs';
import { describe, expect, it } from 'vitest';
import {
  GROW_MS,
  HARVEST_GRAMS,
  STRAINS,
  buyPlantError,
  decodeWeed,
  emptyWeed,
  growLeftText,
  growProgress,
  harvest,
  takeJoint,
} from '../src/game/weed-rules.js';

const t0 = 1_800_000_000_000;

describe('coltivazione', () => {
  it('ci sono tre varietà con prezzi diversi', () => {
    expect(Object.values(STRAINS).map((s) => s.name)).toEqual([
      'Lemon Haze',
      'Amnesia',
      'Purple Haze',
    ]);
  });

  it('la pianta cresce in 5 giorni e solo allora si raccoglie', () => {
    const s = { grams: 0, strain: 'lemon' as const, plantedAt: t0 };
    expect(growProgress(t0, t0 + GROW_MS / 2)).toBeCloseTo(0.5);
    expect(harvest(s, t0 + GROW_MS - 1)).toBeNull();
    expect(harvest(s, t0 + GROW_MS)).toEqual({ grams: HARVEST_GRAMS, jarStrain: 'lemon' });
    expect(growLeftText(t0, t0 + 36 * 3600 * 1000)).toBe('3 giorni e 12 ore');
    expect(growLeftText(t0, t0 + GROW_MS - 3600 * 1000)).toBe('1 ora');
    expect(growLeftText(t0, t0)).toBe('5 giorni');
  });

  it('una pianta alla volta', () => {
    expect(buyPlantError(emptyWeed(), 'purple', 500)).toBeNull();
    expect(buyPlantError({ grams: 0, strain: 'lemon', plantedAt: t0 }, 'purple', 500)).toMatch(
      /già una pianta/,
    );
    expect(buyPlantError(emptyWeed(), 'purple', 10)).toMatch(/abbastanza/);
  });

  it('ogni canna toglie un grammo dal barattolo', () => {
    let s = { grams: 2, jarStrain: 'amnesia' as const };
    s = takeJoint(s) as typeof s;
    expect(s.grams).toBe(1);
    const last = takeJoint(s)!;
    expect(last.grams).toBe(0);
    expect(last.jarStrain).toBeUndefined();
    expect(takeJoint(last)).toBeNull();
  });

  it('il salvataggio scarta i valori non validi', () => {
    expect(decodeWeed({ strain: 'kush', plantedAt: t0, grams: -3 })).toEqual({ grams: 0 });
    expect(decodeWeed({ strain: 'purple', plantedAt: t0, grams: 40, jarStrain: 'lemon' })).toEqual({
      strain: 'purple',
      plantedAt: t0,
      grams: 40,
      jarStrain: 'lemon',
    });
  });

  it('le regole permettono i messaggi per vendere le canne', () => {
    const rules = JSON.parse(
      fs.readFileSync('firebase/database.rules.proposed.json', 'utf8'),
    ).rules;
    const v = rules.sims_interactions.$pid.$key['.validate'];
    for (const type of ['weedOffer', 'weedPaid', 'weedNo']) expect(v).toContain(type);
  });
});

describe('vaso spostato nella stanza', () => {
  it('la posizione del vaso resta anche dopo il raccolto e si legge dal salvataggio', () => {
    const planted = { grams: 0, strain: 'lemon' as const, plantedAt: 1, potX: -40, potY: 90 };
    const after = harvest(planted, 1 + GROW_MS)!;
    expect(after.potX).toBe(-40);
    expect(after.potY).toBe(90);
    expect(decodeWeed({ grams: 0, potX: 999, potY: 10 })).toEqual({
      grams: 0,
      potX: 200,
      potY: 10,
    });
    expect(decodeWeed({ grams: 0, potX: 'x', potY: 10 }).potX).toBeUndefined();
  });
});

describe('barattolo spostato nella stanza', () => {
  it('la posizione del barattolo si salva e si perde solo quando si svuota', () => {
    expect(decodeWeed({ grams: 5, jarStrain: 'lemon', jarX: -20, jarY: 30 })).toMatchObject({
      jarX: -20,
      jarY: 30,
    });
    // barattolo vuoto: niente posizione
    expect(decodeWeed({ grams: 0, jarX: -20, jarY: 30 }).jarX).toBeUndefined();
    const last = takeJoint({
      grams: 1,
      jarStrain: 'lemon',
      jarX: -20,
      jarY: 30,
      potX: 5,
      potY: 6,
    })!;
    expect(last).toEqual({ grams: 0, potX: 5, potY: 6 });
  });
});
