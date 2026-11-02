import { describe, expect, it } from 'vitest';
import { onlineVitals, publishVitals } from '../src/game/players-hud-rules.js';

describe('parametri dei giocatori online', () => {
  it('pubblica i parametri arrotondati e il nome del posto', () => {
    const out = publishVitals(
      { health: 80.4, sleep: 37.6, hunger: 120, hygiene: -3, happiness: 50 },
      'Banca Dolce Casa 🏦',
    );
    expect(out).toEqual({
      hp: 80,
      sleep: 38,
      hun: 100,
      hyg: 0,
      hap: 50,
      place: 'Banca Dolce Casa 🏦',
    });
    expect(onlineVitals(out)).toEqual({
      health: 80,
      sleep: 38,
      hunger: 100,
      hygiene: 0,
      happiness: 50,
      place: 'Banca Dolce Casa 🏦',
    });
  });

  it('chi ha una versione vecchia del gioco mostra solo i parametri che ha', () => {
    expect(onlineVitals({ name: 'Ada', sleep: 40, hp: 'x' })).toEqual({
      health: null,
      sleep: 40,
      hunger: null,
      hygiene: null,
      happiness: null,
      place: '',
    });
    expect(onlineVitals(null).health).toBeNull();
  });
});
