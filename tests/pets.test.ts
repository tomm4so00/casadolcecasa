import { describe, expect, it } from 'vitest';
import {
  PETS,
  buyPetError,
  decodePets,
  feedPet,
  newPet,
  petHunger,
  petIsDead,
  petStarvesAt,
  petDiesAt,
  petCompanyPerHour,
} from '../src/game/pet-rules.js';

const DAY = 86_400_000;
const T0 = 1_800_000_000_000;

describe('animali domestici', () => {
  it('la fame scende come quella del giocatore e il cibo dà +50%', () => {
    const p = newPet(T0);
    expect(petHunger(p, T0, 86400)).toBe(100);
    expect(petHunger(p, T0 + DAY / 2, 86400)).toBeCloseTo(50);
    expect(petHunger(p, T0 + 2 * DAY, 86400)).toBe(0);
    const fed = feedPet(p, T0 + (DAY * 3) / 4, 86400);
    expect(petHunger(fed, T0 + (DAY * 3) / 4, 86400)).toBeCloseTo(75);
    expect(petHunger(feedPet(p, T0, 86400), T0, 86400)).toBe(100);
  });

  it('si compra un solo animale per tipo, se i soldi bastano', () => {
    expect(buyPetError({}, 'dog', PETS.dog.price)).toBeNull();
    expect(buyPetError({}, 'dog', PETS.dog.price - 1)).toContain('Ti servono');
    expect(buyPetError({ dog: newPet(T0) }, 'dog', 9999)).toContain('Hai già');
    expect(buyPetError({ dog: newPet(T0) }, 'cat', 9999)).toBeNull();
  });

  it('senza cibo per 24 ore con la fame a zero l’animale muore', () => {
    const p = newPet(T0); // sazio: la fame arriva a zero dopo un giorno
    expect(petStarvesAt(p, 86400)).toBe(T0 + DAY);
    expect(petIsDead(p, T0 + DAY, 86400)).toBe(false);
    expect(petIsDead(p, T0 + 2 * DAY - 1, 86400)).toBe(false);
    expect(petIsDead(p, T0 + 2 * DAY, 86400)).toBe(true);
    // dargli da mangiare in tempo lo salva
    const fed = feedPet(p, T0 + 1.5 * DAY, 86400);
    expect(petIsDead(fed, T0 + 2 * DAY, 86400)).toBe(false);
  });

  it('la compagnia dà più felicità per gli animali più cari, il doppio col cane a spasso', () => {
    expect(petCompanyPerHour('fish')).toBe(2);
    expect(petCompanyPerHour('dog')).toBe(3.9);
    expect(petCompanyPerHour('dog', true)).toBe(7.8);
    expect(petCompanyPerHour('cat')).toBeGreaterThan(petCompanyPerHour('hamster'));
    expect(petDiesAt(newPet(T0), 86400)).toBe(T0 + 2 * DAY);
  });

  it('il salvataggio si legge anche se rovinato', () => {
    expect(decodePets(null)).toEqual({});
    const out = decodePets({
      dog: { hunger: 140, at: T0 },
      fish: { hunger: 20, at: T0, x: 999, y: -5, rot: 2 },
      bird: { hunger: 'tanta', at: T0 },
      unicorn: { hunger: 50, at: T0 },
    });
    expect(out.dog).toEqual({ hunger: 100, at: T0 });
    expect(out.fish).toEqual({ hunger: 20, at: T0, x: 200, y: -5, rot: 2 });
    expect(out.bird).toBeUndefined();
    expect(Object.keys(out)).toEqual(['dog', 'fish']);
  });
});
