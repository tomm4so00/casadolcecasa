import { describe, expect, it } from 'vitest';
import {
  BREAKUP_COOLDOWN_MS,
  PROPOSE_AFTER_KISSES,
  type RomanceBook,
  anniversaryOn,
  anniversaryText,
  canPropose,
  decodeRomance,
  noteKiss,
  resetKisses,
} from '../src/game/romance-rules';
import { confirmedCouples, notifyAnniversaries } from '../server/src/couples';
import type { PushSender } from '../server/src/maintenance';
import { romeTime } from '../shared/hacker-rules';
import { localDatabase } from '../src/game/database';
import { Lifetime } from '../src/game/lifetime';
import { MemoryStorage } from './helpers';

const NOW = 1_800_000_000_000;

describe('fidanzamento: i baci della coppia', () => {
  it('si contano per coppia e dopo 5 ci si può proporre', () => {
    const book: RomanceBook = {};
    for (let i = 1; i < PROPOSE_AFTER_KISSES; i++)
      expect(noteKiss(book, 'player_giulia', 'Giulia', NOW)).toBe(i);
    const free = { mine: null, theirs: null, cooldownUntil: 0, now: NOW };
    expect(canPropose({ ...free, kisses: book.player_giulia.kisses! })).toBe(false);
    noteKiss(book, 'player_giulia', 'Giulia', NOW);
    expect(canPropose({ ...free, kisses: book.player_giulia.kisses! })).toBe(true);
    // gli altri baci contano a parte
    expect(noteKiss(book, 'player_sara', 'Sara', NOW)).toBe(1);
    // il conto si salva
    expect(decodeRomance(book).player_giulia.kisses).toBe(PROPOSE_AFTER_KISSES);
  });

  it('dopo un no il conto riparte da zero, ma ci si può ancora baciare', () => {
    const book: RomanceBook = {};
    for (let i = 0; i < PROPOSE_AFTER_KISSES; i++) noteKiss(book, 'player_giulia', 'Giulia', NOW);
    resetKisses(book, 'player_giulia');
    expect(book.player_giulia.kisses).toBe(0);
    expect(book.player_giulia.unlocked).toBe(true);
  });

  it('non con chi è già fidanzato, né subito dopo essersi lasciati', () => {
    const base = { kisses: 9, mine: null, theirs: null, cooldownUntil: 0, now: NOW };
    expect(canPropose({ ...base, mine: 'player_sara' })).toBe(false);
    expect(canPropose({ ...base, theirs: 'player_luca' })).toBe(false);
    expect(canPropose({ ...base, cooldownUntil: NOW + BREAKUP_COOLDOWN_MS })).toBe(false);
    expect(canPropose(base)).toBe(true);
  });
});

describe('fidanzamento: gli anniversari', () => {
  it('dopo una settimana, poi ogni mese nello stesso giorno', () => {
    expect(anniversaryOn('2026-11-10', '2026-11-17')).toEqual({ months: 0 });
    expect(anniversaryOn('2026-11-10', '2026-11-16')).toBeNull();
    expect(anniversaryOn('2026-11-10', '2026-12-10')).toEqual({ months: 1 });
    expect(anniversaryOn('2026-11-10', '2027-11-10')).toEqual({ months: 12 });
    expect(anniversaryOn('2026-11-10', '2026-12-11')).toBeNull();
    // fidanzati il 31: nei mesi più corti è l'ultimo giorno
    expect(anniversaryOn('2027-01-31', '2027-02-28')).toEqual({ months: 1 });
    expect(anniversaryOn('2027-01-31', '2027-03-31')).toEqual({ months: 2 });
    expect(anniversaryText('Giulia', { months: 0 })).toContain('una settimana');
    expect(anniversaryText('Giulia', { months: 1 })).toContain('un mese');
    expect(anniversaryText('Giulia', { months: 12 })).toContain('un anno');
  });

  it('le coppie valgono solo se confermate da tutti e due', () => {
    const couples = confirmedCouples({
      player_marco: { with: 'player_giulia', name: 'Giulia', since: NOW },
      player_giulia: { with: 'player_marco', name: 'Marco', since: NOW },
      player_sara: { with: 'player_luca', name: 'Luca', since: NOW },
    });
    expect([...couples.keys()].sort()).toEqual(['player_giulia', 'player_marco']);
  });

  it('il server manda gli auguri la mattina, una volta al giorno', async () => {
    const database = localDatabase(new Lifetime(), new MemoryStorage());
    const since = romeTime('2026-11-03', 20 * 60);
    await database.ref('/').update({
      'sims_couples/player_marco': { with: 'player_giulia', name: 'Giulia', since },
      'sims_couples/player_giulia': { with: 'player_marco', name: 'Marco', since },
      'sims_push/player_marco': { tokens: { a: { token: 'tok_marco'.padEnd(30, 'x'), t: 1 } } },
    });
    const bodies: string[] = [];
    const send: PushSender = async (_t, m) => {
      bodies.push(m.body);
      return 'sent';
    };
    // alle 9 è presto
    expect(await notifyAnniversaries(database, romeTime('2026-11-10', 9 * 60), send)).toBe(-1);
    expect(await notifyAnniversaries(database, romeTime('2026-11-10', 10 * 60 + 7), send)).toBe(1);
    expect(bodies[0]).toContain('una settimana con Giulia');
    // un'ora dopo non si ripete
    expect(await notifyAnniversaries(database, romeTime('2026-11-10', 11 * 60), send)).toBe(-1);
  });
});
