import { describe, expect, it } from 'vitest';
import {
  LEGACY_WELCOME_MISSIONS,
  SNOOZE_MS,
  WELCOME_MISSIONS,
  type WelcomeView,
  answerOffer,
  completeIfDone,
  decodeWelcome,
  missionsOf,
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
  rawFood: 0,
  dishes: 0,
  tastes: 0,
  tasteHint: '🧑 Porta l’assaggio a Marco',
  working: false,
};

describe('missioni di benvenuto', () => {
  it("sono 5, con un piccolo premio: l'assaggio di benvenuto, poi cassaforte, lavoro e letto", () => {
    expect(WELCOME_MISSIONS.map((m) => m.id)).toEqual([
      'taste_cook',
      'taste_give',
      'pin',
      'work',
      'sleep',
    ]);
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
    expect(answerOffer(s, 'yes', base, 1000).status).toBe('active');
  });

  it("si completano facendo davvero la cosa: cucinare, regalare l'assaggio, PIN, lavoro, letto", () => {
    let s = answerOffer(newWelcome(), 'yes', base, 0);
    expect(completeIfDone(s, base)).toBeNull();
    s = completeIfDone(s, { ...base, dishes: 1 })!;
    expect(s).toEqual({ i: 1, status: 'offer', base: 0, snoozeUntil: 0, v: 2 });
    // l'assaggio: conta solo quello regalato dopo aver accettato la missione
    s = answerOffer(s, 'yes', { ...base, tastes: 1 }, 0);
    expect(completeIfDone(s, { ...base, tastes: 1 })).toBeNull();
    s = completeIfDone(s, { ...base, tastes: 2 })!;
    s = answerOffer(s, 'yes', base, 0);
    s = completeIfDone(s, { ...base, pinSet: true })!;
    s = answerOffer(s, 'yes', base, 0);
    s = completeIfDone(s, { ...base, shifts: 1 })!;
    s = answerOffer(s, 'yes', base, 0);
    s = completeIfDone(s, { ...base, sleeping: true })!;
    expect(welcomeFinished(s)).toBe(true);
    expect(shouldOffer(s, 0)).toBe(false);
  });

  it('le istruzioni seguono il passo in cui si è', () => {
    const cook = WELCOME_MISSIONS[0];
    expect(cook.hint(base)).toContain('cucina');
    expect(cook.hint({ ...base, env: 'KITCHEN' })).toContain('frigorifero');
    expect(cook.hint({ ...base, env: 'KITCHEN', rawFood: 1 })).toContain('zaino');
    // a chi portarlo lo decide il gioco (chi c'è online): qui si mostra e basta
    expect(WELCOME_MISSIONS[1].hint(base)).toContain('Marco');
    const work = WELCOME_MISSIONS[3];
    expect(work.hint({ ...base, env: 'CORTILE' })).toContain('uscita del condominio');
    expect(work.hint({ ...base, working: true })).toContain('turno');
  });

  it('chi aveva cominciato le missioni di prima le finisce così come sono', () => {
    const old = decodeWelcome({ i: 2, status: 'active', base: 3 }, false);
    expect(old.v).toBeUndefined();
    expect(missionsOf(old)).toBe(LEGACY_WELCOME_MISSIONS);
    expect(missionsOf(old)[old.i].id).toBe('sleep');
    expect(decodeWelcome({ i: 1, status: 'offer', v: 2 }, false).v).toBe(2);
    expect(missionsOf(newWelcome())).toBe(WELCOME_MISSIONS);
  });

  it('chi giocava già prima non le riceve; il salvataggio scarta i valori strani', () => {
    expect(welcomeFinished(decodeWelcome(undefined, true))).toBe(true);
    expect(decodeWelcome(undefined, false)).toEqual(newWelcome());
    expect(decodeWelcome({ i: 99, status: 'boh', v: 2 }, false)).toEqual({
      ...newWelcome(),
      i: WELCOME_MISSIONS.length,
    });
    expect(decodeWelcome({ i: 2, status: 'active', base: 3 }, true).status).toBe('active');
  });
});
