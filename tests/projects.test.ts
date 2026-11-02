import fs from 'node:fs';
import { describe, expect, it } from 'vitest';
import {
  MIN_DONATION,
  PROJECTS,
  decodeProject,
  donationError,
  projectGoal,
  projectStage,
  toNextStage,
  topDonors,
} from '../src/game/project-rules.js';

const rocket = PROJECTS.rocket;

describe('progetto del razzo', () => {
  it('si vedono i primi pezzi a 5.000 € e il razzo completo con altri 10.000 €', () => {
    expect(projectGoal(rocket)).toBe(15000);
    expect(projectStage(rocket, 0)).toBe(0);
    expect(projectStage(rocket, 4999)).toBe(0);
    expect(projectStage(rocket, 5000)).toBe(1);
    expect(projectStage(rocket, 14999)).toBe(1);
    expect(projectStage(rocket, 15000)).toBe(2);
    expect(toNextStage(rocket, 1200)).toBe(3800);
    expect(toNextStage(rocket, 6000)).toBe(9000);
    expect(toNextStage(rocket, 15000)).toBe(0);
  });

  it('controlla i versamenti', () => {
    expect(donationError(rocket, 0, 100, 500)).toBeNull();
    expect(donationError(rocket, 0, MIN_DONATION - 1, 500)).toMatch(/minimo/);
    expect(donationError(rocket, 0, 600, 500)).toMatch(/abbastanza/);
    expect(donationError(rocket, 0, 1.5, 500)).toMatch(/intero/);
    expect(donationError(rocket, 14000, 2000, 5000)).toMatch(/mancano solo 1000/);
    // per chiudere il progetto si può versare anche meno del minimo
    expect(donationError(rocket, 14995, 5, 100)).toBeNull();
    expect(donationError(rocket, 15000, 100, 500)).toMatch(/completo/);
  });

  it('legge lo stato e ordina chi ha versato di più', () => {
    const s = decodeProject({
      funded: 700,
      donors: { a: { name: 'Ada', amount: 200 }, b: { name: 'Bea', amount: 500 }, c: 'x' },
    });
    expect(s.funded).toBe(700);
    expect(topDonors(s).map((d) => d.name)).toEqual(['Bea', 'Ada']);
    expect(decodeProject(null)).toEqual({ funded: 0, donors: {} });
  });

  it('le regole del database permettono solo di aumentare i fondi', () => {
    const rules = JSON.parse(
      fs.readFileSync('firebase/database.rules.proposed.json', 'utf8'),
    ).rules;
    const p = rules.sims_projects.$project;
    expect(p.funded['.validate']).toContain('newData.val() > data.val()');
    expect(p.donors.$pid['.write']).toContain('$pid');
  });
});
