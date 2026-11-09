import { describe, expect, it } from 'vitest';
import {
  ATTACK_MS,
  attackMinute,
  clockText,
  hackerDay,
  hackerPhase,
  romeClock,
  romeTime,
  untilText,
} from '../shared/hacker-rules.js';
import { REMINDER_WINDOW_MS, hackerPushDue, notifyHacker } from '../server/src/hacker.js';
import type { PushSender } from '../server/src/maintenance.js';
import { localDatabase } from '../src/game/database.js';
import { Lifetime } from '../src/game/lifetime.js';
import { MemoryStorage } from './helpers.js';

describe("attacco hacker: l'orario", () => {
  it("l'ora italiana, con e senza ora legale", () => {
    // 9 novembre 2026, 11:45 in Italia = 10:45 UTC (ora solare)
    const winter = romeTime('2026-11-09', 11 * 60 + 45);
    expect(new Date(winter).toISOString()).toBe('2026-11-09T10:45:00.000Z');
    expect(romeClock(winter)).toEqual({ day: '2026-11-09', minute: 11 * 60 + 45 });
    // 15 luglio 2026, 11:45 in Italia = 09:45 UTC (ora legale)
    expect(new Date(romeTime('2026-07-15', 11 * 60 + 45)).toISOString()).toBe(
      '2026-07-15T09:45:00.000Z',
    );
    // il giorno del cambio d'ora (25 ottobre 2026): a mezzogiorno è già ora solare
    expect(new Date(romeTime('2026-10-25', 12 * 60)).toISOString()).toBe(
      '2026-10-25T11:00:00.000Z',
    );
  });

  it("l'attacco cade tra le 12:00 e le 22:50, su multipli di 5 minuti, ed è fisso per ogni data", () => {
    const seen = new Set<number>();
    for (let i = 0; i < 400; i++) {
      const day = new Date(Date.UTC(2026, 0, 1) + i * 86400000).toISOString().slice(0, 10);
      const m = attackMinute(day);
      expect(m).toBeGreaterThanOrEqual(12 * 60);
      expect(m).toBeLessThanOrEqual(22 * 60 + 50);
      expect(m % 5).toBe(0);
      expect(attackMinute(day)).toBe(m);
      seen.add(m);
    }
    // gli orari cambiano davvero da un giorno all'altro
    expect(seen.size).toBeGreaterThan(60);
  });

  it('le fasi della giornata: annuncio alle 11:45, poi 10 minuti di attacco', () => {
    const d = hackerDay(romeTime('2026-11-09', 9 * 60));
    expect(clockText(d.announceAt)).toBe('11:45');
    expect(d.endAt - d.startAt).toBe(ATTACK_MS);
    expect(hackerPhase(d.announceAt - 1, d)).toBe('quiet');
    expect(hackerPhase(d.announceAt, d)).toBe('announced');
    expect(hackerPhase(d.startAt, d)).toBe('active');
    expect(hackerPhase(d.endAt - 1, d)).toBe('active');
    expect(hackerPhase(d.endAt, d)).toBe('over');
    // dopo mezzanotte è già il giorno dopo, con il suo orario
    expect(hackerDay(romeTime('2026-11-10', 1)).day).toBe('2026-11-10');
  });

  it('quanto manca, scritto per i giocatori', () => {
    expect(untilText(45000)).toBe('45 s');
    expect(untilText(12 * 60000)).toBe('12 min');
    expect(untilText((3 * 60 + 12) * 60000)).toBe('3 h 12 min');
  });
});

describe('attacco hacker: le notifiche dal server', () => {
  const day = '2026-11-09';
  const d = hackerDay(romeTime(day, 9 * 60));

  it("l'annuncio dalle 11:45, il promemoria entro 25 minuti dall'attacco, una volta ciascuno", () => {
    expect(hackerPushDue(d.announceAt - 60000, {})).toBeNull();
    expect(hackerPushDue(d.announceAt, {})).toBe('announce');
    expect(hackerPushDue(d.announceAt, { announce: day })).toBe(
      d.startAt - d.announceAt <= REMINDER_WINDOW_MS ? 'reminder' : null,
    );
    expect(hackerPushDue(d.startAt - 10 * 60000, { announce: day })).toBe('reminder');
    expect(hackerPushDue(d.startAt - 10 * 60000, { announce: day, reminder: day })).toBeNull();
    // finito l'attacco non parte più niente
    expect(hackerPushDue(d.endAt + 1, {})).toBeNull();
  });

  it('manda a tutti i dispositivi e non ripete', async () => {
    const database = localDatabase(new Lifetime(), new MemoryStorage());
    await database.ref('sims_push').set({
      p1: { tokens: { a: { token: 'tok_a'.padEnd(30, 'x'), t: 1 } } },
      p2: { tokens: { b: { token: 'tok_b'.padEnd(30, 'x'), t: 1 } } },
    });
    const titles: string[] = [];
    const send: PushSender = async (_token, m) => {
      titles.push(m.title);
      return 'sent';
    };
    expect(await notifyHacker(database, d.announceAt + 60000, send)).toBe(2);
    expect(titles[0]).toContain(clockText(d.startAt));
    // un minuto dopo non riparte niente (con l'attacco vicino il promemoria è già segnato)
    expect(await notifyHacker(database, d.announceAt + 120000, send)).toBe(-1);
    expect(titles).toHaveLength(2);
  });
});
