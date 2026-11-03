import { describe, expect, it } from 'vitest';
import {
  SNOOZE_MS,
  WELCOME_MISSIONS,
  type WelcomeView,
  answerOffer,
  completeIfDone,
  decodeWelcome,
  newWelcome,
  shouldOffer,
  welcomeFinished,
} from '../src/game/welcome-rules';

const base: WelcomeView = {
  env: 'SALOON',
  inOwnRoom: false,
  meals: 2,
  showers: 1,
  shifts: 0,
  sleeping: false,
  pinSet: false,
  hasFood: false,
  foodCooked: false,
  working: false,
};

describe('missioni di benvenuto', () => {
  it('sono 5, con un piccolo premio, e insegnano a sopravvivere', () => {
    expect(WELCOME_MISSIONS.map((m) => m.id)).toEqual(['eat', 'shower', 'sleep', 'work', 'pin']);
    for (const m of WELCOME_MISSIONS) {
      expect(m.reward).toBeGreaterThan(0);
      expect(m.reward).toBeLessThanOrEqual(50);
      expect(m.intro.length).toBeGreaterThan(40);
    }
  });

  it('i tre pulsanti: più tardi ripropone dopo 5 minuti, no le spegne, sì le avvia', () => {
    const s = newWelcome();
    expect(shouldOffer(s, 0)).toBe(true);
    const later = answerOffer(s, 'later', base, 1000);
    expect(shouldOffer(later, 1000 + SNOOZE_MS - 1)).toBe(false);
    expect(shouldOffer(later, 1000 + SNOOZE_MS)).toBe(true);
    const off = answerOffer(s, 'no', base, 1000);
    expect(off.status).toBe('off');
    expect(shouldOffer(off, 1e12)).toBe(false);
    const on = answerOffer(s, 'yes', base, 1000);
    expect(on.status).toBe('active');
    expect(on.base).toBe(2); // pasti già fatti: conta solo il prossimo
  });

  it('si sbloccano una alla volta e si completano facendo davvero la cosa', () => {
    let s = answerOffer(newWelcome(), 'yes', base, 0);
    expect(completeIfDone(s, base)).toBeNull();
    s = completeIfDone(s, { ...base, meals: 3 })!;
    expect(s).toEqual({ i: 1, status: 'offer', base: 0, snoozeUntil: 0 });
    // la doccia: solo dopo averla accettata
    expect(completeIfDone(s, { ...base, showers: 9 })).toBeNull();
    s = answerOffer(s, 'yes', base, 0);
    s = completeIfDone(s, { ...base, showers: 2 })!;
    s = answerOffer(s, 'yes', base, 0);
    s = completeIfDone(s, { ...base, sleeping: true })!;
    s = answerOffer(s, 'yes', base, 0);
    s = completeIfDone(s, { ...base, shifts: 1 })!;
    s = answerOffer(s, 'yes', base, 0);
    s = completeIfDone(s, { ...base, pinSet: true })!;
    expect(welcomeFinished(s)).toBe(true);
    expect(shouldOffer(s, 0)).toBe(false);
  });

  it('le istruzioni seguono il passo in cui si è', () => {
    const eat = WELCOME_MISSIONS[0];
    expect(eat.hint(base)).toContain('cucina');
    expect(eat.hint({ ...base, env: 'KITCHEN' })).toContain('frigorifero');
    expect(eat.hint({ ...base, env: 'KITCHEN', hasFood: true })).toContain('fornello');
    expect(eat.hint({ ...base, env: 'KITCHEN', hasFood: true, foodCooked: true })).toContain(
      'mangiarlo',
    );
    const work = WELCOME_MISSIONS[3];
    expect(work.hint({ ...base, env: 'CORTILE' })).toContain('uscita del condominio');
    expect(work.hint({ ...base, working: true })).toContain('turno');
  });

  it('chi giocava già prima non le riceve; il salvataggio scarta i valori strani', () => {
    expect(welcomeFinished(decodeWelcome(undefined, true))).toBe(true);
    expect(decodeWelcome(undefined, false)).toEqual(newWelcome());
    expect(decodeWelcome({ i: 99, status: 'boh' }, false)).toEqual({
      ...newWelcome(),
      i: WELCOME_MISSIONS.length,
    });
    expect(decodeWelcome({ i: 2, status: 'active', base: 3 }, true).status).toBe('active');
  });
});
