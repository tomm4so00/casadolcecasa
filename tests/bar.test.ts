import { describe, expect, it } from 'vitest';
import {
  APERITIVO,
  BAR_TIMES,
  DRINK_END,
  afterAperitivo,
  barMoment,
} from '../src/game/bar-rules.js';

const SPOTS = { idle: { x: -58, y: -152 }, shelfY: -158, counterY: -152 };
const at = (e: number) => barMoment(e, 50, SPOTS);

describe("l'aperitivo al bancone", () => {
  it('costa 5 € e dà +25% di fame e +5% di felicità, senza superare il 100%', () => {
    expect(APERITIVO).toEqual({ price: 5, hunger: 25, happiness: 5 });
    expect(afterAperitivo({ hunger: 40, happiness: 50 })).toEqual({ hunger: 65, happiness: 55 });
    expect(afterAperitivo({ hunger: 90, happiness: 98 })).toEqual({ hunger: 100, happiness: 100 });
  });

  it('il barista va al mobile dietro di sé, prende bottiglia e bicchiere girato di spalle', () => {
    expect(at(0).bartender).toMatchObject({ x: -58, back: false, bottle: false });
    const picking = at(BAR_TIMES.atShelf + 0.8);
    expect(picking.bartender).toMatchObject({
      x: 50,
      y: -158,
      back: true,
      bottle: true,
      glass: true,
    });
    expect(picking.glass).toBe('none');
  });

  it('posa il bicchiere sul bancone e versa: il bicchiere si riempie', () => {
    const placing = at(BAR_TIMES.atCounter + 0.1);
    expect(placing.bartender).toMatchObject({ y: -152, back: false, bottle: true });
    const pouring = at((BAR_TIMES.placed + BAR_TIMES.poured) / 2);
    expect(pouring.glass).toBe('counter');
    expect(pouring.bartender.pour).toBe(1);
    expect(pouring.fill).toBeGreaterThan(0.2);
    expect(pouring.fill).toBeLessThan(0.9);
    expect(at(BAR_TIMES.poured).fill).toBeCloseTo(1, 5);
  });

  it('il cliente beve in tre sorsi e alla fine il bicchiere è vuoto e si alza', () => {
    const t = BAR_TIMES.take + 0.3;
    expect(at(t + 0.6).glass).toBe('hand');
    expect(at(t + 0.6).sip).toBe(1); // bicchiere alla bocca
    expect(at(t + 1.3).sip).toBe(0); // tra un sorso e l'altro
    const fills = [0, 1, 2].map((k) => at(t + k * BAR_TIMES.sipEvery + 1.25).fill);
    expect(fills[0]).toBeCloseTo(2 / 3, 5);
    expect(fills[1]).toBeCloseTo(1 / 3, 5);
    expect(fills[2]).toBeCloseTo(0, 5);
    expect(at(DRINK_END - 0.01).done).toBe(false);
    expect(at(DRINK_END).done).toBe(true);
    expect(at(DRINK_END).glass).toBe('none');
  });

  it('dopo aver servito il barista torna al suo posto', () => {
    const later = at(BAR_TIMES.idle + 1).bartender;
    expect(later).toMatchObject({ x: -58, y: -152, bottle: false, glass: false, back: false });
  });
});
