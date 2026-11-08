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

describe('nome degli animali', () => {
  it('accetta lettere (anche accentate), numeri, spazi, apostrofo, punto e trattino', async () => {
    const { cleanPetName, petNameError, PET_NAME_MAX } = await import('../src/game/pet-rules.js');
    expect(cleanPetName('  Fido  ')).toBe('Fido');
    expect(cleanPetName('Micia   Bella')).toBe('Micia Bella');
    expect(cleanPetName("Pà-Pù l'1.")).toBe("Pà-Pù l'1.");
    expect(petNameError('Nemo')).toBeNull();
    // niente HTML né simboli: il nome finisce nella stanza che vedono gli altri
    expect(cleanPetName('<b>Fido</b>')).toBeNull();
    expect(petNameError('Fido🐶')).toContain('solo lettere');
    expect(petNameError('   ')).toBe('Scrivi un nome.');
    expect(petNameError('x'.repeat(PET_NAME_MAX + 1))).toContain(`${PET_NAME_MAX} caratteri`);
    expect(cleanPetName(42)).toBeNull();
  });

  it('nelle frasi si usa il nome, oppure la specie', async () => {
    const { petCalled, toPetCalled, capitalized } = await import('../src/game/pet-rules.js');
    const fido = { hunger: 50, at: 0, name: 'Fido' };
    expect(petCalled('dog', fido)).toBe('Fido');
    expect(petCalled('dog', { hunger: 50, at: 0 })).toBe('il tuo cane');
    expect(capitalized(petCalled('cat', null))).toBe('Il tuo gatto');
    expect(toPetCalled('dog', fido)).toBe('a Fido');
    expect(toPetCalled('dog', null)).toBe('al cane');
    expect(toPetCalled('bird', null)).toBe("all'uccellino");
  });

  it('il nome si salva e si rilegge; un nome rovinato si scarta', async () => {
    const { decodePets } = await import('../src/game/pet-rules.js');
    const book = decodePets({
      dog: { hunger: 80, at: 1, name: 'Fido' },
      cat: { hunger: 80, at: 1, name: '<script>' },
    });
    expect(book.dog?.name).toBe('Fido');
    expect(book.cat).toBeDefined();
    expect(book.cat?.name).toBeUndefined();
  });

  it('la notifica sul telefono chiama l’animale per nome', async () => {
    const { petWarningText } = await import('../server/src/maintenance.js');
    const now = 1_000_000;
    expect(petWarningText('dog', now + 3 * 3600000, now, 'Fido').title).toBe(
      '🆘 Fido 🐶 sta per morire!',
    );
    expect(petWarningText('dog', now + 3 * 3600000, now).title).toBe(
      '🆘 Il tuo cane 🐶 sta per morire!',
    );
  });
});
