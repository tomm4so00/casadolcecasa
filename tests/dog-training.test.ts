import { describe, expect, it } from 'vitest';
import {
  REWARD_WINDOW_S,
  TRAIN_BASE,
  TRAIN_CAP,
  obeyChance,
  reactTo,
  rewarded,
  treatTeaches,
} from '../src/game/dog-training-rules';
import { decodePets, feedPet, newPet } from '../src/game/pet-rules.js';

describe('addestramento del cane', () => {
  it('da cucciolo si distrae più spesso di quanto obbedisce, e la zampa è più difficile', () => {
    expect(obeyChance('sit', undefined)).toBe(TRAIN_BASE.sit);
    expect(obeyChance('sit', undefined)).toBeLessThan(0.5);
    expect(obeyChance('paw', undefined)).toBeLessThan(obeyChance('sit', undefined));
    // con lo stesso numero di premietti la zampa resta un po' più difficile
    for (const n of [1, 5, 20, 60])
      expect(obeyChance('paw', { sit: n, paw: n })).toBeLessThan(
        obeyChance('sit', { sit: n, paw: n }),
      );
  });

  it('ogni premietto meritato alza la probabilità, fino a un massimo sotto il 100%', () => {
    let t = rewarded(undefined, 'sit');
    expect(t).toEqual({ sit: 1, paw: 0 });
    let prev = obeyChance('sit', undefined);
    for (let i = 0; i < 80; i++) {
      const p = obeyChance('sit', t);
      expect(p).toBeGreaterThanOrEqual(prev);
      prev = p;
      t = rewarded(t, 'sit');
    }
    expect(t.sit).toBe(TRAIN_CAP);
    expect(prev).toBeLessThan(1);
    // la zampa non migliora premiando lo stare seduto
    expect(obeyChance('paw', t)).toBe(TRAIN_BASE.paw);
  });

  it('se non obbedisce abbaia, si allontana o fa un giretto', () => {
    expect(reactTo('sit', undefined, 0.1, 0.5)).toBe('sit');
    expect(reactTo('paw', undefined, 0.25, 0)).toBe('bark'); // 0.25 basta per sedersi, non per la zampa
    expect(reactTo('sit', undefined, 0.25, 0)).toBe('sit');
    expect(reactTo('sit', undefined, 0.9, 0.1)).toBe('bark');
    expect(reactTo('sit', undefined, 0.9, 0.5)).toBe('wander');
    expect(reactTo('sit', undefined, 0.9, 0.9)).toBe('spin');
  });

  it('il premietto insegna solo subito dopo il comando eseguito', () => {
    expect(treatTeaches(null, 10)).toBe(false);
    expect(treatTeaches({ cmd: 'sit', at: 10 }, 11)).toBe(true);
    expect(treatTeaches({ cmd: 'sit', at: 10 }, 10 + REWARD_WINDOW_S)).toBe(true);
    expect(treatTeaches({ cmd: 'sit', at: 10 }, 10.1 + REWARD_WINDOW_S)).toBe(false);
  });

  it("l'addestramento si salva con il cane e resta dopo il cibo", () => {
    const dog = { ...newPet(1000), train: { sit: 4, paw: 2 } };
    expect(decodePets({ dog }).dog?.train).toEqual({ sit: 4, paw: 2 });
    expect(feedPet(dog, 2000, 3600).train).toEqual({ sit: 4, paw: 2 });
    // valori strani: si scartano o si limitano
    expect(decodePets({ dog: { ...dog, train: { sit: 'x', paw: 999 } } }).dog?.train).toEqual({
      sit: 0,
      paw: 60,
    });
    // solo il cane si addestra
    expect(decodePets({ cat: { ...dog } }).cat?.train).toBeUndefined();
  });
});
