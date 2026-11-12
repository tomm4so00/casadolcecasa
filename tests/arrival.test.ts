import { describe, expect, it } from 'vitest';
import {
  type ArrivalView,
  arrivalDest,
  coachFor,
  lowNeed,
  nextArrival,
} from '../src/game/arrival-rules';

const at = (v: Partial<ArrivalView>): ArrivalView => ({
  env: 'CORTILE',
  inMyApt: true,
  inOwnRoom: false,
  mission: 0,
  ...v,
});

describe("l'arrivo del giocatore nuovo", () => {
  it('va avanti solo arrivando nel posto giusto', () => {
    expect(nextArrival('keys', at({ env: 'SALOON' }))).toBe('keys');
    expect(nextArrival('door', at({}))).toBe('door');
    expect(nextArrival('door', at({ env: 'SALOON', inMyApt: false }))).toBe('door');
    expect(nextArrival('door', at({ env: 'SALOON' }))).toBe('room');
    expect(nextArrival('room', at({ env: 'PLAYER_ROOM' }))).toBe('room');
    expect(nextArrival('room', at({ env: 'PLAYER_ROOM', inOwnRoom: true }))).toBe('gift');
    expect(nextArrival('gift', at({ env: 'KITCHEN' }))).toBe('cook');
    expect(nextArrival('cook', at({ env: 'KITCHEN', mission: 1 }))).toBe('cook');
    expect(nextArrival('cook', at({ mission: 2 }))).toBe('done');
  });

  it('la freccia: portone, stanza, cucina; poi decidono le missioni', () => {
    expect(arrivalDest('door', 2, 21)).toEqual({ env: 'SALOON', apt: 2 });
    expect(arrivalDest('room', 2, 21)).toEqual({ env: 'PLAYER_ROOM', roomIdx: 21, key: 'bed' });
    expect(arrivalDest('gift', 2, 21)).toEqual({ env: 'KITCHEN', apt: 2, key: 'fridge' });
    expect(arrivalDest('cook', 2, 21)).toBeNull();
  });

  it('i testi approvati, con nome, appartamento e stanza', () => {
    const c = { nick: 'Tommaso', apt: 0, room: 5, mission: 0, hint: '' };
    expect(coachFor('keys', c)).toMatchObject({
      title: '🔑 Benvenuto a casa, Tommaso!',
      text: 'Da oggi abiti qui: Appartamento 1 · Stanza 5. Ecco le chiavi! La freccia gialla ti porta al portone.',
      button: 'Andiamo! 🏠',
    });
    expect(coachFor('door', c)?.label).toBe('PASSO 1 DI 5');
    expect(coachFor('room', c)?.text).toBe(
      '🏠 La porta numero 5 è la tua stanza: entra a dare un’occhiata.',
    );
    expect(coachFor('cook', { ...c, hint: '🧊 Apri il frigorifero' })?.text).toContain(
      'Da noi si usa così',
    );
    expect(coachFor('cook', { ...c, hint: '🔥 Ora vai al fornello' })?.text).toBe(
      '🔥 Ora vai al fornello',
    );
    expect(coachFor('cook', { ...c, mission: 1 })?.label).toBe('PASSO 5 DI 5');
    expect(coachFor('done', c)).toBeNull();
  });

  it('la spiegazione dei parametri sotto il 30%', () => {
    expect(lowNeed([50, 40, 31, 90])).toBe(false);
    expect(lowNeed([50, 29, 80, 90])).toBe(true);
  });
});
