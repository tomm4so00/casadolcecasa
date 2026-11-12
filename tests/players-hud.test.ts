import { describe, expect, it } from 'vitest';
import {
  iconOrder,
  onlineVitals,
  publishVitals,
  touchRecent,
} from '../src/game/players-hud-rules.js';

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

describe('elenco delle icone dei vicini', () => {
  const ids = ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h'];
  it('con tanti giocatori se ne vedono 4 e il pulsante «+» dice quanti mancano', () => {
    expect(iconOrder(ids, [], false)).toEqual({ shown: ['a', 'b', 'c', 'd'], hidden: 4 });
    expect(iconOrder(ids, [], true)).toEqual({ shown: ids, hidden: 0 });
  });
  it('con uno solo in più non serve il pulsante', () => {
    expect(iconOrder(ids.slice(0, 5), [], false)).toEqual({ shown: ids.slice(0, 5), hidden: 0 });
  });
  it('chi tocco sale in cima, anche se era fra i nascosti', () => {
    const recent = touchRecent(touchRecent([], 'g'), 'c');
    expect(recent).toEqual(['c', 'g']);
    expect(iconOrder(ids, recent, false).shown).toEqual(['c', 'g', 'a', 'b']);
    // chi è andato offline sparisce anche dai recenti
    expect(iconOrder(['a', 'b', 'c'], ['z', 'b'], false).shown).toEqual(['b', 'a', 'c']);
  });
});
