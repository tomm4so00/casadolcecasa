import { describe, expect, it } from 'vitest';
import {
  DAILY_MISSIONS,
  NEIGHBOUR_VISIT,
  WEEK_MEDAL,
  advanceDaily,
  dailyFor,
  dailyPick,
  dailyProgress,
  dailyPush,
  dayBefore,
  decodeDaily,
  liveStreak,
  streakBonus,
} from '../src/game/daily-rules';

/** Tutto quello che serve per fare le tre missioni di `day`. */
function allDone(day: string, base: Record<string, number>) {
  const stats = { ...base };
  const seen: Record<string, boolean> = {};
  for (const m of dailyPick(day)) {
    if (m.visit) seen[m.visit] = true;
    else stats[m.stat!] = (stats[m.stat!] || 0) + (m.need ?? 1);
  }
  return { stats, seen };
}

describe('missioni del giorno', () => {
  it('almeno 20 missioni, con id diversi, e ognuna si controlla con un totale o un posto', () => {
    expect(DAILY_MISSIONS.length).toBeGreaterThanOrEqual(20);
    expect(new Set(DAILY_MISSIONS.map((m) => m.id)).size).toBe(DAILY_MISSIONS.length);
    for (const m of DAILY_MISSIONS) expect(!!m.stat !== !!m.visit).toBe(true);
  });

  it('tre al giorno, una per tipo, uguali per tutti e mai uguali al giorno prima', () => {
    for (let d = 1; d <= 60; d++) {
      const day = `2026-${String(Math.ceil(d / 30) + 10).padStart(2, '0')}-${String(((d - 1) % 28) + 1).padStart(2, '0')}`;
      const pick = dailyPick(day);
      expect(pick.map((m) => m.kind)).toEqual(['casa', 'vicini', 'citta']);
      expect(dailyPick(day)).toEqual(pick);
      const before = dailyPick(dayBefore(day));
      pick.forEach((m, i) => expect(m.id).not.toBe(before[i].id));
    }
  });

  it("l'offerta all'asta esce sempre e solo il giorno dopo «Metti un quadro all'asta»", () => {
    let day = '2026-11-01';
    let put = 0;
    for (let i = 0; i < 400; i++) {
      const next = new Date(Date.parse(day + 'T12:00:00Z') + 86_400_000).toISOString().slice(0, 10);
      const city = dailyPick(day)[2].id;
      const tomorrow = dailyPick(next)[2].id;
      if (city === 'asta_metti') {
        put++;
        expect(tomorrow).toBe('asta_offri');
      }
      if (tomorrow === 'asta_offri') expect(city).toBe('asta_metti');
      day = next;
    }
    expect(put).toBeGreaterThan(20);
  });

  it('il giorno prima, anche a cavallo dei mesi', () => {
    expect(dayBefore('2026-11-12')).toBe('2026-11-11');
    expect(dayBefore('2026-03-01')).toBe('2026-02-28');
    expect(dayBefore('2027-01-01')).toBe('2026-12-31');
  });

  it('si conta da quello fatto oggi, non dai totali di sempre', () => {
    const s = dailyFor(undefined, '2026-11-12', { shifts: 40, praises: 9 });
    const turno = DAILY_MISSIONS.find((m) => m.id === 'due_turni')!;
    expect(dailyProgress(s, turno, { shifts: 41 })).toEqual({ have: 1, need: 2 });
    expect(dailyProgress(s, turno, { shifts: 45 })).toEqual({ have: 2, need: 2 });
    const visita = DAILY_MISSIONS.find((m) => m.visit === NEIGHBOUR_VISIT)!;
    expect(dailyProgress({ ...s, seen: { [NEIGHBOUR_VISIT]: true } }, visita, {}).have).toBe(1);
  });

  it('a giorno nuovo si riparte, ma la serie e la medaglia restano', () => {
    const s = {
      ...dailyFor(undefined, '2026-11-11', {}),
      done: { x: true },
      streak: 3,
      lastFull: '2026-11-11',
      week: true,
    };
    const next = dailyFor(s, '2026-11-12', { meals: 5 });
    expect(next).toMatchObject({
      day: '2026-11-12',
      done: {},
      seen: {},
      streak: 3,
      lastFull: '2026-11-11',
      week: true,
    });
    expect(next.base.meals).toBe(5);
    expect(dailyFor(next, '2026-11-12', { meals: 9 })).toBe(next);
  });

  it('ogni missione si premia una volta; finite tutte arriva il premio della serie', () => {
    const day = '2026-11-12';
    const s0 = dailyFor(undefined, day, {});
    const { stats, seen } = allDone(day, {});
    const r = advanceDaily({ ...s0, seen }, stats);
    expect(r.rewards.map((x) => x.id)).toEqual([...dailyPick(day).map((m) => m.id), 'serie']);
    expect(r.rewards.at(-1)).toMatchObject({ reward: streakBonus(1), streak: 1 });
    expect(advanceDaily(r.state, stats).rewards).toEqual([]);
  });

  it('la serie cresce di giorno in giorno, si azzera saltando un giorno, la medaglia al 7°', () => {
    let s = dailyFor(undefined, '2026-11-01', {});
    let stats: Record<string, number> = {};
    const play = (day: string) => {
      s = dailyFor(s, day, stats);
      const all = allDone(day, stats);
      stats = all.stats;
      const r = advanceDaily({ ...s, seen: all.seen }, stats);
      s = r.state;
      return r.rewards.at(-1)!;
    };
    for (let d = 1; d <= 6; d++) expect(play(`2026-11-0${d}`).medal).toBeUndefined();
    const seventh = play('2026-11-07');
    expect(seventh).toMatchObject({ streak: 7, reward: 80, medal: WEEK_MEDAL });
    const eighth = play('2026-11-08');
    expect(eighth).toMatchObject({ streak: 8, reward: 80 });
    expect(eighth.medal).toBeUndefined();
    // saltato il 9: il 10 si riparte da 1, la medaglia resta
    expect(play('2026-11-10')).toMatchObject({ streak: 1, reward: 20 });
    expect(s.week).toBe(true);
  });

  it('la serie mostrata vale solo se ieri o oggi le ha finite', () => {
    const s = { ...dailyFor(undefined, '2026-11-12', {}), streak: 4, lastFull: '2026-11-11' };
    expect(liveStreak(s)).toBe(4);
    expect(liveStreak({ ...s, lastFull: '2026-11-09' })).toBe(0);
  });

  it('il salvataggio si legge scartando quello che non torna', () => {
    expect(decodeDaily(null)).toBeUndefined();
    expect(decodeDaily({ day: 'ieri' })).toBeUndefined();
    const s = decodeDaily({
      day: '2026-11-12',
      base: { shifts: 3, hack: 9, meals: 'x' },
      seen: { bar: true, luna: true },
      done: { bar: true, boh: true },
      streak: 2.5,
      lastFull: '2026-11-11',
    });
    expect(s).toEqual({
      day: '2026-11-12',
      base: { shifts: 3 },
      seen: { bar: true },
      done: { bar: true },
      streak: 0,
      lastFull: '2026-11-11',
    });
  });

  it('la notifica elenca le missioni del giorno', () => {
    const push = dailyPush('2026-11-12');
    for (const m of dailyPick('2026-11-12')) expect(push.body).toContain(m.title);
  });
});
