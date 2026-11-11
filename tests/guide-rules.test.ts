import { describe, expect, it } from 'vitest';
import { guideStep } from '../src/game/guide-rules.js';

const at = (env: string, apt = 0, roomIdx: number | null = null) => ({ env, apt, roomIdx });

describe('freccia delle missioni', () => {
  it('in cucina punta al frigo; dal salone alla porta della cucina', () => {
    const fridge = { env: 'KITCHEN', apt: 1, key: 'fridge' };
    expect(guideStep(at('KITCHEN', 1), fridge)).toEqual({ key: 'fridge' });
    expect(guideStep(at('SALOON', 1), fridge)).toEqual({ key: 'kitchen' });
  });

  it('dalla cucina di un altro appartamento: uscita, cortile, portone giusto', () => {
    const bed = { env: 'PLAYER_ROOM', roomIdx: 13, key: 'bed' };
    expect(guideStep(at('KITCHEN', 0), bed)).toEqual({ key: 'doorExit' });
    expect(guideStep(at('SALOON', 0), bed)).toEqual({ key: 'courtyard' });
    expect(guideStep(at('CORTILE'), bed)).toEqual({ key: 'doorApt1' });
    // nel salone giusto: la porta col numero della stanza nell'appartamento (14 → room6)
    expect(guideStep(at('SALOON', 1), bed)).toEqual({ key: 'room6' });
    expect(guideStep(at('PLAYER_ROOM', 1, 13), bed)).toEqual({ key: 'bed' });
  });

  it('nella stanza sbagliata si esce', () => {
    const safe = { env: 'PLAYER_ROOM', roomIdx: 2, key: 'safe' };
    expect(guideStep(at('PLAYER_ROOM', 0, 5), safe)).toEqual({ key: 'doorExit' });
  });

  it('per uscire dal condominio: cortile e poi l’uscita', () => {
    const exit = { env: 'CORTILE', key: 'exitHouse' };
    expect(guideStep(at('BATHROOM', 2), exit)).toEqual({ key: 'doorExit' });
    expect(guideStep(at('SALOON', 2), exit)).toEqual({ key: 'courtyard' });
    expect(guideStep(at('CORTILE'), exit)).toEqual({ key: 'exitHouse' });
  });

  it('una persona fuori casa: si esce dal condominio; arrivati, si punta a lei', () => {
    const friend = { env: 'bar', point: { x: 10, y: 20 } };
    expect(guideStep(at('CORTILE'), friend)).toEqual({ key: 'exitHouse' });
    expect(guideStep(at('banca'), friend)).toEqual({ key: 'doorExit' });
    expect(guideStep(at('bar'), friend)).toEqual({ point: { x: 10, y: 20 } });
  });

  it('dentro la stanza giusta senza un oggetto: niente freccia', () => {
    expect(guideStep(at('PLAYER_ROOM', 0, 4), { env: 'PLAYER_ROOM', roomIdx: 4 })).toBeNull();
  });
});
