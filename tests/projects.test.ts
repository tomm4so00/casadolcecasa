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
  LAUNCH_ANIM_MS,
  LAUNCH_DELAY_MS,
  LAUNCH_IGNITION_MS,
  countdownText,
  launchLift,
  launchPhase,
} from '../src/game/project-rules.js';
import { type PushSender, notifyRocketAlmostReady } from '../server/src/maintenance.js';
import { localDatabase } from '../src/game/database.js';
import { Lifetime } from '../src/game/lifetime.js';
import { MemoryStorage } from './helpers.js';

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

describe('lancio del razzo', () => {
  const t0 = 1_800_000_000_000;
  it("le fasi sono uguali per tutti perché usano l'ora del server", () => {
    expect(launchPhase(1, undefined, t0).phase).toBe('building');
    expect(launchPhase(2, undefined, t0).phase).toBe('waiting');
    expect(launchPhase(2, t0 + LAUNCH_DELAY_MS, t0)).toEqual({
      phase: 'countdown',
      left: LAUNCH_DELAY_MS,
      since: 0,
    });
    expect(launchPhase(2, t0, t0 + 5000).phase).toBe('launching');
    expect(launchPhase(2, t0, t0 + LAUNCH_ANIM_MS).phase).toBe('launched');
  });

  it('il razzo si accende, poi sale sempre più veloce', () => {
    expect(launchLift(1000)).toBe(0);
    expect(launchLift(LAUNCH_IGNITION_MS)).toBe(0);
    const a = launchLift(LAUNCH_IGNITION_MS + 2000),
      b = launchLift(LAUNCH_IGNITION_MS + 4000);
    expect(b - a).toBeGreaterThan(a);
  });

  it('conto alla rovescia in minuti e secondi', () => {
    expect(countdownText(LAUNCH_DELAY_MS)).toBe('00:10');
    expect(countdownText(600_000)).toBe('10:00');
    expect(countdownText(61_500)).toBe('01:02');
    expect(countdownText(-5)).toBe('00:00');
  });

  it('a 14.000 € il server avvisa tutti, una volta sola', async () => {
    const database = localDatabase(new Lifetime(), new MemoryStorage());
    await database.ref('sims_projects/rocket').set({ funded: 14200 });
    await database.ref('sims_push/a/tokens/k1').set({ token: 'tok-a', t: t0 });
    await database.ref('sims_push/b/tokens/k2').set({ token: 'tok-b', t: t0 });
    const sent: string[] = [];
    const send: PushSender = async (token, m) => {
      sent.push(token + ':' + m.title + ':' + m.body);
      return 'sent';
    };
    expect(await notifyRocketAlmostReady(database, t0, send)).toBe(2);
    expect(sent[0]).toContain('quasi pronto');
    expect(sent[0]).toContain('800 €');
    expect(sent[0]).toContain('pulsante rosso');
    expect((await database.ref('sims_projects/rocket/notified').get()).val()).toBe(t0);
    expect(await notifyRocketAlmostReady(database, t0 + 60000, send)).toBe(-1);
    expect(sent.length).toBe(2);
  });

  it('non avvisa sotto i 14.000 €; se si arriva direttamente a 15.000 dice che è pronto', async () => {
    const low = localDatabase(new Lifetime(), new MemoryStorage());
    await low.ref('sims_projects/rocket').set({ funded: 13999 });
    expect(await notifyRocketAlmostReady(low, t0, async () => 'sent')).toBe(-1);
    const full = localDatabase(new Lifetime(), new MemoryStorage());
    await full.ref('sims_projects/rocket').set({ funded: 15000 });
    await full.ref('sims_push/a/tokens/k1').set({ token: 'tok-a', t: t0 });
    const titles: string[] = [];
    await notifyRocketAlmostReady(full, t0, async (_t, m) => {
      titles.push(m.title);
      return 'sent';
    });
    expect(titles).toEqual(['🚀 Il razzo è pronto!']);
  });

  it('le regole permettono a un giocatore di premere il pulsante solo a razzo completo', () => {
    const rules = JSON.parse(
      fs.readFileSync('firebase/database.rules.proposed.json', 'utf8'),
    ).rules;
    const launch = rules.sims_projects.$project.launchAt;
    expect(launch['.write']).toContain('!data.exists()');
    expect(launch['.write']).toContain('>= 15000');
    expect(launch['.validate']).toContain('now + 5000');
  });
});
