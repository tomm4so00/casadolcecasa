import fs from 'node:fs';
import { describe, expect, it } from 'vitest';
import {
  BEDTIME_THOUGHTS,
  PERSONALITY_ACTIONS,
  PERSONALITY_PERKS,
  artistOffer,
  bankInterest,
  hasPersonality,
  PERSONALITY_DAILY_MAX,
  PERSONALITY_THRESHOLD,
  type PersonalityAction,
  type PersonalityId,
  addPersonalityPoints,
  decodePersonality,
  emptyPersonality,
  leadingPersonality,
  OWN_LINE_CHANCE,
  SOCIAL_LINES,
  type SocialAct,
  socialLine,
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

describe('frasi delle azioni sociali', () => {
  const acts: SocialAct[] = ['talk', 'praise', 'insult', 'punch', 'food'];
  const ids: PersonalityId[] = ['artist', 'business', 'criminal', 'romantic'];

  it('ogni personalità ha le sue frasi per ogni azione', () => {
    for (const id of ids)
      for (const a of acts) expect(SOCIAL_LINES[id][a].length).toBeGreaterThan(0);
  });

  it('senza personalità si usano solo le frasi di tutti', () => {
    for (const a of acts)
      for (let i = 0; i < 20; i++) expect(SOCIAL_LINES.shared[a]).toContain(socialLine(a, null));
  });

  it('con una personalità escono a volte le sue frasi, a volte quelle di tutti', () => {
    // primo numero: decide il gruppo; secondo: la frase dentro il gruppo
    const seq =
      (...n: number[]) =>
      () =>
        n.shift() ?? 0;
    expect(SOCIAL_LINES.romantic.praise).toContain(
      socialLine('praise', 'romantic', seq(OWN_LINE_CHANCE - 0.01, 0.5)),
    );
    expect(SOCIAL_LINES.shared.praise).toContain(
      socialLine('praise', 'romantic', seq(OWN_LINE_CHANCE + 0.01, 0.5)),
    );
  });
});

describe('premi delle personalità', () => {
  it('ogni personalità ha il suo premio, scritto nel messaggio', () => {
    expect(PERSONALITY_PERKS.artist).toContain('25%');
    expect(PERSONALITY_PERKS.business).toContain('1%');
    expect(PERSONALITY_PERKS.criminal).toContain('4 invece di 3');
    expect(PERSONALITY_PERKS.romantic).toContain('salute');
  });

  it('il premio vale solo dopo aver raggiunto la personalità', () => {
    const s = emptyPersonality();
    expect(hasPersonality(s, 'artist')).toBe(false);
    s.announced.artist = true;
    expect(hasPersonality(s, 'artist')).toBe(true);
    expect(artistOffer(100, true)).toBe(125);
    expect(artistOffer(100, false)).toBe(100);
  });

  it('interessi in banca: 1% al giorno, al massimo una settimana', () => {
    expect(bankInterest(10000, undefined, '2026-11-05')).toBe(0);
    expect(bankInterest(10000, '2026-11-04', '2026-11-05')).toBe(100);
    expect(bankInterest(10000, '2026-11-03', '2026-11-05')).toBe(201);
    expect(bankInterest(10000, '2026-10-01', '2026-11-05')).toBe(
      Math.floor(10000 * (1.01 ** 7 - 1)),
    );
    expect(bankInterest(50, '2026-11-04', '2026-11-05')).toBe(0);
    expect(bankInterest(10000, '2026-11-05', '2026-11-05')).toBe(0);
  });

  it('il salvataggio ricorda i giorni dei premi', () => {
    const s = decodePersonality({
      points: {},
      announced: {},
      perks: { interestDay: '2026-11-04', romanceDay: 'ieri' },
    });
    expect(s.perks).toEqual({ interestDay: '2026-11-04' });
  });

  it('le regole permettono il 4° tentativo di furto solo al Criminale', () => {
    const rules = JSON.parse(
      fs.readFileSync('firebase/database.rules.proposed.json', 'utf8'),
    ).rules;
    expect(rules.sims_theft.$pid.$room['.validate']).toContain(
      "child('announced').child('criminal').val() === true",
    );
  });
});
