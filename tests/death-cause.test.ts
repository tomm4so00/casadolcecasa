import { describe, expect, it } from 'vitest';
import {
  decodeDeathCauses,
  deathCauseText,
  deathCauses,
  encodeDeathCauses,
} from '../src/game/death-cause-rules';
import { absentDeath } from '../src/game/absent-death-rules';

const HOUR = 3600000;
const healthy = { sickAt: 0, until: 0, nextAt: 0, exposedAt: 0 };
const noDrug = { active: false, doses: 0, lastDose: 0, endAt: 0, dAtDose: 0, crisisAt: 0 };

describe('motivo della morte', () => {
  it('elenca i bisogni a zero, la tristezza, la droga e la febbre', () => {
    const at = 10 * HOUR;
    const causes = deathCauses(
      {
        hungerLevel: 0,
        sleepLevel: 30,
        hygieneLevel: 0,
        happinessLevel: 5,
        drug: { ...noDrug, active: true, endAt: at + HOUR },
        flu: { ...healthy, sickAt: at - HOUR, until: at + HOUR },
      },
      at,
    );
    expect(causes).toEqual(['hunger', 'hygiene', 'sadness', 'drug', 'flu']);
  });

  it('sulla luna senza casco', () => {
    const state = {
      hungerLevel: 80,
      sleepLevel: 80,
      hygieneLevel: 80,
      happinessLevel: 80,
      drug: noDrug,
      flu: healthy,
    };
    expect(deathCauses(state, 0, true)).toEqual(['air']);
  });

  it('si salva e si rilegge, ignorando quello che non conosce', () => {
    expect(decodeDeathCauses(encodeDeathCauses(['hunger', 'away']))).toEqual(['hunger', 'away']);
    expect(decodeDeathCauses('boh,sleep,sleep')).toEqual(['sleep']);
    expect(decodeDeathCauses(undefined)).toEqual([]);
  });

  it('la frase per la schermata', () => {
    expect(deathCauseText(['hunger', 'sleep', 'away'])).toBe(
      'Causa della morte: fame e stanchezza. Con la fame e il sonno a zero la salute scende di ' +
        'circa 2 punti all’ora. È successo a gioco chiuso: il tempo passa anche quando non giochi.',
    );
    expect(deathCauseText([])).toMatch(/salute è arrivata a zero/);
    expect(deathCauseText(['abandoned', 'away'])).not.toMatch(/gioco chiuso/);
  });

  it('chi muore a gioco chiuso ha il suo motivo', () => {
    const save = {
      savedAt: 1_000_000,
      healthLevel: 20,
      hungerLevel: 0,
      sleepLevel: 0,
      hygieneLevel: 0,
      happinessLevel: 50,
    };
    const death = absentDeath(save, {}, save.savedAt + 30 * HOUR);
    expect(death?.causes).toContain('hunger');
    expect(death?.causes).toContain('away');
  });
});
