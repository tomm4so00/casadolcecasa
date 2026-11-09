import fs from 'node:fs';
import { describe, expect, it } from 'vitest';
import {
  BAG_GRAMS,
  LEGACY_GRAMS,
  MAX_POTS,
  POTS,
  STRAINS,
  afterSmoke,
  bagFloorPrice,
  buyLampError,
  buyPotError,
  decodeWeed,
  dryPeriods,
  expectedGrams,
  growMsFor,
  growProgress,
  growTimeText,
  harvestPot,
  jointHappiness,
  plant,
  plantError,
  potGrowInfo,
  potProgress,
  setLamp,
  takeJoint,
  water,
  type WeedState,
} from '../src/game/weed-rules.js';

const t0 = 1_800_000_000_000;
const H = 3600 * 1000;
const D = 24 * H;

/** Un vaso di quel tipo con un seme di quella varietà nello zaino. */
const withSeed = (kind: 'soil' | 'premium' | 'hydro', strain: 'lemon' | 'amnesia' | 'purple') =>
  ({ grams: 0, pots: [{ kind }], seeds: { [strain]: 1 } }) as WeedState;

describe('coltivazione', () => {
  it('tre varietà: più care, più veloci e con più raccolto', () => {
    expect(Object.values(STRAINS).map((s) => s.name)).toEqual([
      'Lemon Haze',
      'Amnesia',
      'Purple Haze',
    ]);
    expect(growTimeText('lemon')).toBe('6 giorni');
    expect(growTimeText('amnesia')).toBe('5 giorni');
    expect(growTimeText('purple')).toBe('4 giorni');
    expect(STRAINS.lemon.grams).toBeLessThan(STRAINS.purple.grams);
  });

  it('vaso premium e idroponico crescono più in fretta, le lampade ancora di più', () => {
    expect(growMsFor('amnesia', 'premium')).toBeLessThan(growMsFor('amnesia', 'soil'));
    expect(growMsFor('amnesia', 'hydro')).toBe(growMsFor('amnesia', 'premium'));
    expect(growMsFor('amnesia', 'soil', 1)).toBeLessThan(growMsFor('amnesia', 'soil'));
    expect(growMsFor('amnesia', 'soil', 3)).toBeLessThan(growMsFor('amnesia', 'soil', 2));
    // il più veloce: Purple in idroponico con la Lampada Super
    expect(growMsFor('purple', 'hydro', 3)).toBe(Math.round((4 * D) / (1.25 * 1.5)));
  });

  it('si pianta un seme in un vaso vuoto e si raccoglie solo quando è pronta', () => {
    expect(plantError(withSeed('soil', 'amnesia'), 0, 'purple')).toMatch(/Non hai semi/);
    const s = plant(withSeed('soil', 'amnesia'), 0, 'amnesia', t0)!;
    expect(s.seeds).toEqual({});
    expect(plantError(s, 0, 'amnesia')).toMatch(/già una pianta/);
    expect(potProgress(s.pots![0], t0 + 2.5 * D)).toBeCloseTo(0.5);
    expect(harvestPot(s, 0, t0 + 5 * D - 1)).toBeNull();
    // annaffiata ogni giorno: raccolto pieno, il vaso torna vuoto
    let pot = s.pots![0];
    for (let d = 1; d < 5; d++) pot = water(pot, t0 + d * D);
    const done = harvestPot({ ...s, pots: [pot] }, 0, t0 + 5 * D)!;
    expect(done.grams).toBe(100);
    expect(done.state.pots).toEqual([{ kind: 'soil' }]);
    expect(done.state.jarStrain).toBe('amnesia');
  });

  it('ogni annaffiatura saltata toglie il 15%, ma non sotto il 40%', () => {
    const s = plant(withSeed('soil', 'amnesia'), 0, 'amnesia', t0)!;
    const pot = s.pots![0];
    expect(dryPeriods(pot, t0 + D - 1)).toBe(0);
    expect(dryPeriods(pot, t0 + D + 1)).toBe(1);
    expect(dryPeriods(pot, t0 + 2 * D + 1)).toBe(2);
    // mai annaffiata in 5 giorni: 4 annaffiature saltate (−60%) → 40 g minimi
    expect(expectedGrams(pot, t0 + 5 * D)).toBe(40);
    // saltata una volta sola, poi annaffiata
    const once = water(pot, t0 + 1.5 * D);
    expect(once.missed).toBe(1);
    let p = once;
    for (let d = 2; d < 5; d++) p = water(p, t0 + d * D + H);
    expect(expectedGrams(p, t0 + 5 * D)).toBe(85);
    // raccogliere tardi non toglie niente: si conta fino a quando era pronta
    expect(expectedGrams(p, t0 + 9 * D)).toBe(85);
  });

  it("l'idroponico rende il 40% in più e va annaffiato ogni 48 ore", () => {
    const s = plant(withSeed('hydro', 'purple'), 0, 'purple', t0)!;
    const pot = s.pots![0];
    expect(POTS.hydro.waterMs).toBe(2 * D);
    expect(dryPeriods(pot, t0 + 1.9 * D)).toBe(0);
    const ready = t0 + growMsFor('purple', 'hydro');
    const watered = water(pot, t0 + 1.9 * D);
    expect(expectedGrams(watered, ready)).toBe(Math.round(120 * 1.4));
  });

  it('una lampada a metà crescita tiene la crescita fatta e accelera il resto', () => {
    const s = plant(withSeed('soil', 'amnesia'), 0, 'amnesia', t0)!;
    const half = t0 + 2.5 * D;
    const lit = setLamp(s.pots![0], 3, half);
    expect(potProgress(lit, half)).toBeCloseTo(0.5);
    // il resto (2,5 giorni) va 1,5 volte più veloce
    expect(potProgress(lit, half + (2.5 * D) / 1.5)).toBeCloseTo(1);
    // i visitatori vedono la stessa crescita
    expect(growProgress(potGrowInfo(lit)!, half + D)).toBeCloseTo(potProgress(lit, half + D));
  });

  it('fino a 3 vasi e lampade sempre migliori', () => {
    const full = {
      grams: 0,
      pots: Array.from({ length: MAX_POTS }, () => ({ kind: 'soil' as const })),
    };
    expect(buyPotError(full, 'soil', 10_000)).toMatch(/massimo/);
    expect(buyPotError({ grams: 0 }, 'hydro', 100)).toMatch(/abbastanza/);
    expect(buyPotError({ grams: 0 }, 'hydro', 900)).toBeNull();
    expect(buyLampError({ kind: 'soil', lamp: 2 }, 2, 10_000)).toMatch(/migliore/);
    expect(buyLampError({ kind: 'soil', lamp: 2 }, 3, 10_000)).toBeNull();
  });

  it('il prezzo minimo della bustina è il 90% del costo di coltivarla', () => {
    // Lemon: 100 Đ per 80 g = 1,25 Đ/g → 12,5 Đ per 10 g → 90% = 11 Đ
    expect(BAG_GRAMS).toBe(10);
    expect(bagFloorPrice()).toBe(11);
  });
});

describe('salvataggi di prima', () => {
  it('la pianta comprata col vaso diventa un vaso di terra con la pianta di prima', () => {
    const old = decodeWeed({
      strain: 'purple',
      plantedAt: t0,
      grams: 40,
      jarStrain: 'lemon',
      potX: -40,
      potY: 90,
    });
    expect(old.grams).toBe(40);
    const pot = old.pots![0];
    expect(pot).toMatchObject({
      kind: 'soil',
      strain: 'purple',
      plantedAt: t0,
      legacy: true,
      x: -40,
      y: 90,
    });
    // tempi di prima (4 giorni e mezzo), 100 g, niente acqua
    expect(potProgress(pot, t0 + 4.5 * D)).toBe(1);
    expect(expectedGrams(pot, t0 + 20 * D)).toBe(LEGACY_GRAMS);
    expect(water(pot, t0 + D)).toBe(pot);
    // chi aveva già raccolto si ritrova il vaso vuoto
    expect(decodeWeed({ grams: 0, potX: 999, potY: 10 }).pots).toEqual([
      { kind: 'soil', x: 200, y: 10 },
    ]);
    // chi non aveva mai coltivato non ha vasi
    expect(decodeWeed({ grams: 5 }).pots).toBeUndefined();
  });

  it('il salvataggio scarta i valori non validi', () => {
    expect(decodeWeed({ strain: 'kush', plantedAt: t0, grams: -3 })).toEqual({ grams: 0 });
    expect(
      decodeWeed({
        grams: 3,
        seeds: { lemon: 2, kush: 4, purple: -1 },
        pots: [{ kind: 'gold' }, { kind: 'hydro', lamp: 7, strain: 'amnesia', plantedAt: t0 }],
      }),
    ).toEqual({
      grams: 3,
      seeds: { lemon: 2 },
      pots: [
        {
          kind: 'hydro',
          strain: 'amnesia',
          plantedAt: t0,
          growAt: t0,
          grown: 0,
          wateredAt: t0,
          missed: 0,
        },
      ],
    });
  });
});

describe('canne', () => {
  it('ogni canna toglie un grammo dal barattolo', () => {
    let s: WeedState = { grams: 2, jarStrain: 'amnesia' };
    s = takeJoint(s)!;
    expect(s.grams).toBe(1);
    const last = takeJoint({ ...s, jarX: -20, jarY: 30 })!;
    expect(last).toEqual({ grams: 0 });
    expect(takeJoint(last)).toBeNull();
  });

  it('tolleranza: ogni canna delle ultime 24 ore toglie il 10%, fino a metà effetto', () => {
    expect(jointHappiness([], t0)).toBe(10);
    let smokes: number[] = [];
    for (let i = 0; i < 3; i++) smokes = afterSmoke(smokes, t0 + i * H);
    expect(jointHappiness(smokes, t0 + 3 * H)).toBe(7);
    for (let i = 3; i < 10; i++) smokes = afterSmoke(smokes, t0 + i * H);
    expect(jointHappiness(smokes, t0 + 10 * H)).toBe(5);
    // dopo un giorno passa
    expect(jointHappiness(smokes, t0 + 40 * H)).toBe(10);
  });

  it('le regole permettono i messaggi per vendere le canne', () => {
    const rules = JSON.parse(
      fs.readFileSync('firebase/database.rules.proposed.json', 'utf8'),
    ).rules;
    const v = rules.sims_interactions.$pid.$key['.validate'];
    for (const type of ['weedOffer', 'weedPaid', 'weedNo']) expect(v).toContain(type);
  });
});
