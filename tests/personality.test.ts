import { describe, expect, it } from 'vitest';
import {
  BEDTIME_THOUGHTS,
  PERSONALITY_ACTIONS,
  PERSONALITY_DAILY_MAX,
  PERSONALITY_THRESHOLD,
  type PersonalityAction,
  type PersonalityId,
  addPersonalityPoints,
  decodePersonality,
  emptyPersonality,
  leadingPersonality,
} from '../src/game/personality-rules.js';

const day = (d: number) => new Date(2026, 10, d, 12, 0);
const actionsOf = (id: PersonalityId) =>
  (Object.keys(PERSONALITY_ACTIONS) as PersonalityAction[]).filter(
    (a) => PERSONALITY_ACTIONS[a].to === id,
  );
/** Fa tutte le azioni di una personalità quante più volte possibile in un giorno. */
function playHardDay(s: ReturnType<typeof emptyPersonality>, id: PersonalityId, d: number) {
  let reached: PersonalityId | null = null;
  for (const a of actionsOf(id))
    for (let i = 0; i < 20; i++) reached = addPersonalityPoints(s, a, day(d)) ?? reached;
  return reached;
}

describe('personalità', () => {
  it('tutte e quattro crescono al massimo di 10 punti al giorno', () => {
    for (const id of ['artist', 'business', 'criminal', 'romantic'] as PersonalityId[]) {
      const s = emptyPersonality();
      playHardDay(s, id, 2);
      expect(s.points[id], id).toBe(PERSONALITY_DAILY_MAX);
    }
  });

  it('andare solo al lavoro fa diventare Imprenditore molto lentamente', () => {
    const s = emptyPersonality();
    for (let i = 0; i < 10; i++) addPersonalityPoints(s, 'workShift', day(2));
    expect(s.points.business).toBe(4);
  });

  it('servono almeno 7 giorni di gioco dedicato, e il messaggio compare una volta sola', () => {
    const s = emptyPersonality();
    const days: (PersonalityId | null)[] = [];
    for (let d = 1; d <= 8; d++) days.push(playHardDay(s, 'criminal', d));
    expect(days.slice(0, 6).every((r) => r === null)).toBe(true);
    expect(days[6]).toBe('criminal');
    expect(days[7]).toBeNull();
    expect(s.points.criminal).toBeGreaterThanOrEqual(PERSONALITY_THRESHOLD);
  });

  it('prima di dormire si pensa alla personalità più sviluppata', () => {
    const s = emptyPersonality();
    expect(leadingPersonality(s)).toBeNull();
    addPersonalityPoints(s, 'paint', day(2));
    addPersonalityPoints(s, 'compliment', day(2));
    expect(leadingPersonality(s)).toBe('artist');
    expect(BEDTIME_THOUGHTS.business).toContain('Ho lavorato molto oggi…');
    expect(BEDTIME_THOUGHTS.artist).toContain('Ho fatto proprio un bel quadro oggi');
  });

  it('il salvataggio scarta i valori non validi', () => {
    const s = decodePersonality({
      points: { artist: 12, criminal: -3, wizard: 99 },
      announced: { romantic: true, artist: 'si' },
      day: '2026-11-02',
      today: { paint: 2, fly: 4 },
      todayPoints: { artist: 8, business: 'x' },
    });
    expect(s).toEqual({
      points: { artist: 12 },
      announced: { romantic: true },
      day: '2026-11-02',
      today: { paint: 2 },
      todayPoints: { artist: 8 },
    });
    expect(decodePersonality(null)).toEqual(emptyPersonality());
  });
});
