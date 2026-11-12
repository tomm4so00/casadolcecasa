import { describe, expect, it } from 'vitest';
import {
  BONUS,
  CHAPTERS,
  type QuestView,
  WELCOME_TROPHY,
  advanceQuests,
  currentQuest,
  decodeQuests,
  earnedTrophies,
  followed,
  newQuests,
} from '../src/game/quests-rules';

const view = (over: Partial<QuestView> = {}): QuestView => ({
  env: 'CORTILE',
  visited: {},
  chats: 0,
  praises: 0,
  friends: 0,
  shifts: 1,
  holdings: 0,
  bank: 0,
  clothes: 0,
  trashEmptied: 0,
  gossipRead: 0,
  safeLevel: 1,
  paintings: 0,
  pets: 0,
  rocketDonor: false,
  moonTrips: 0,
  suggestions: 0,
  ...over,
});

describe('capitoli delle missioni', () => {
  it('a capitoli chiusi avanzano solo i bonus', () => {
    const r = advanceQuests(newQuests(), view({ chats: 3, suggestions: 1 }), false);
    expect(r.state.ch).toEqual({});
    expect(r.rewards.map((x) => x.id)).toEqual(['idea']);
    expect(r.state.bonus.idea).toBe(true);
  });

  it('in un capitolo le missioni vanno in ordine', () => {
    // il bar visto ma non il centro commerciale: la città resta alla prima missione
    const r = advanceQuests(newQuests(), view({ visited: { bar: true } }), true);
    expect(r.state.ch.citta).toBe(0);
    expect(currentQuest(r.state, 'citta')?.id).toBe('mall');
  });

  it('più capitoli avanzano insieme, e quelli già fatti si completano di fila', () => {
    const r = advanceQuests(newQuests(), view({ chats: 1, praises: 2, shifts: 3 }), true);
    expect(r.state.ch.vicini).toBe(2);
    expect(r.state.ch.lavoro).toBe(1);
    expect(r.rewards.map((x) => x.id)).toEqual(['chat', 'praise', 'shifts']);
  });

  it('finito un capitolo arriva il trofeo con il premio in più', () => {
    const v = view({ chats: 1, praises: 1, friends: 1 });
    const r = advanceQuests(newQuests(), v, true);
    const vicini = CHAPTERS.find((c) => c.id === 'vicini')!;
    expect(r.rewards.at(-1)).toMatchObject({
      id: 'vicini',
      trophy: 'trofeo_vicini',
      reward: vicini.bonus,
    });
    expect(earnedTrophies(r.state, false)).toEqual(['trofeo_vicini']);
    // un secondo giro non dà niente
    expect(advanceQuests(r.state, v, true).rewards).toEqual([]);
  });

  it('il trofeo del benvenuto: a missioni finite o a chi giocava già', () => {
    expect(earnedTrophies(newQuests(), true)).toEqual([WELCOME_TROPHY]);
    expect(earnedTrophies({ ...newQuests(), old: true }, false)).toEqual([WELCOME_TROPHY]);
    expect(earnedTrophies(newQuests(), false)).toEqual([]);
  });

  it('le medaglie dei bonus', () => {
    const r = advanceQuests(newQuests(), view({ moonTrips: 1, suggestions: 1 }), false);
    expect(earnedTrophies(r.state, false)).toEqual(BONUS.map((b) => b.medal));
  });

  it('il razzo vuole la quota versata, non basta la visita', () => {
    const s = { ...newQuests(), ch: { progetti: 2 } };
    expect(advanceQuests(s, view({ env: 'ingegneria' }), true).state.ch.progetti).toBe(2);
    expect(advanceQuests(s, view({ rocketDonor: true }), true).state.ch.progetti).toBe(3);
  });

  it('si segue il capitolo scelto, o il primo ancora aperto', () => {
    const s = newQuests();
    expect(followed(s)).toBe('citta');
    expect(followed({ ...s, follow: 'lavoro' })).toBe('lavoro');
    expect(followed({ ...s, follow: 'none' })).toBe(null);
    const done = { ...s, ch: { citta: 4 }, follow: 'citta' };
    expect(followed(done)).toBe('vicini');
  });

  it('il salvataggio si legge scartando quello che non torna', () => {
    const s = decodeQuests({
      ch: { citta: 99, vicini: -3, boh: 2 },
      bonus: { luna: true, idea: 'si' },
      visited: { bar: true, 'x/y': true },
      follow: 'hack',
      old: true,
    });
    expect(s).toEqual({
      ch: { citta: 4, vicini: 0 },
      bonus: { luna: true },
      visited: { bar: true },
      old: true,
    });
    expect(decodeQuests(null)).toEqual(newQuests());
  });
});
