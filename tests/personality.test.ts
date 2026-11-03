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
  PREVAIL_TO_BECOME,
  dayWinner,
  obtainedPersonality,
  personalityBadgeText,
  personalityLevel,
  personalityPerk,
  personalityTitle,
  answerSwitchOffer,
  levelFor,
  levelOf,
  theftTriesFor,
  LEVEL_PREVAIL,
  personalityStatusText,
  settlePersonalityDay,
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

  it('ogni giorno prevale la personalità con più punti: a 5 giornate la si diventa', () => {
    const s = emptyPersonality();
    const days: (PersonalityId | null)[] = [];
    // ogni giorno un po' di romanticismo, ma il lato criminale prende più punti
    for (let d = 1; d <= 6; d++) {
      const first = addPersonalityPoints(s, 'compliment', day(d));
      days.push(first);
      playHardDay(s, 'criminal', d);
    }
    // la giornata si chiude il giorno dopo: il 5° punto arriva con la prima azione del 6° giorno
    expect(days.slice(0, 5).every((r) => r === null)).toBe(true);
    expect(days[5]).toBe('criminal');
    expect(s.prevail).toEqual({ criminal: PREVAIL_TO_BECOME });
    expect(obtainedPersonality(s)).toBe('criminal');
    expect(personalityLevel(s)).toBe(1);
    expect(personalityTitle(s)).toBe('Criminale');
    expect(personalityStatusText(s)).toBe(
      '✨ Criminale (Criminale, livello 1) · livello 2 tra 10 giornate',
    );
  });

  it('livello 2 con altre 10 giornate (15), livello 3 a 30: cambiano titolo e premio', () => {
    const s = emptyPersonality();
    const ups: (number | null)[] = [];
    for (let d = 1; d <= 32; d++) {
      addPersonalityPoints(s, 'paint', day(d));
      ups.push(settlePersonalityDay(s, day(d + 1)).levelUp);
    }
    expect(obtainedPersonality(s)).toBe('artist');
    expect(ups.filter((u) => u !== null)).toEqual([2, 3]);
    expect(ups.indexOf(2)).toBe(LEVEL_PREVAIL[1] - 1); // 15ª giornata
    expect(ups.indexOf(3)).toBe(LEVEL_PREVAIL[2] - 1); // 30ª giornata
    expect(personalityLevel(s)).toBe(3);
    expect(personalityTitle(s)).toBe("Maestro d'arte");
    expect(levelOf(s, 'artist')).toBe(3);
    expect(levelOf(s, 'criminal')).toBe(0);
    expect(levelFor(14)).toBe(1);
    expect(levelFor(15)).toBe(2);
    expect(levelFor(30)).toBe(3);
  });

  it('5 giornate di un’altra personalità: si propone il cambio, e si può restare o cambiare', () => {
    const base = () => {
      const s = emptyPersonality();
      for (let d = 1; d <= 6; d++) playHardDay(s, 'artist', d); // Artista
      for (let d = 7; d <= 15; d++) playHardDay(s, 'artist', d); // fino a 14 giornate
      return s;
    };
    const s = base();
    const offers: (string | null)[] = [];
    for (let d = 16; d <= 22; d++) {
      addPersonalityPoints(s, 'kissAccepted', day(d));
      offers.push(settlePersonalityDay(s, day(d + 1)).offer);
    }
    // la proposta arriva una sola volta, alla 5ª giornata del Romanticone
    expect(offers).toEqual([null, null, null, null, 'romantic', null, null]);
    expect(s.offer).toBe('romantic');
    expect(obtainedPersonality(s)).toBe('artist'); // finché non risponde resta Artista
    // resta Artista: il Romanticone riparte da zero
    expect(answerSwitchOffer(s, false)).toBeNull();
    expect(s.offer).toBeUndefined();
    expect(s.prevail?.romantic).toBeUndefined();
    expect(obtainedPersonality(s)).toBe('artist');
    // oppure cambia: Romanticone livello 1, l'Artista riparte da zero
    const t = base();
    for (let d = 16; d <= 20; d++) {
      addPersonalityPoints(t, 'kissAccepted', day(d));
      settlePersonalityDay(t, day(d + 1));
    }
    expect(answerSwitchOffer(t, true)).toBe('romantic');
    expect(t.announced).toEqual({ romantic: true });
    expect(t.prevail).toEqual({ romantic: PREVAIL_TO_BECOME });
    expect(personalityLevel(t)).toBe(1);
    expect(hasPersonality(t, 'artist')).toBe(false);
  });

  it('a pari merito nessuna prevale; la giornata si chiude anche senza azioni', () => {
    const none = { won: null, reached: null, levelUp: null, offer: null };
    const s = emptyPersonality();
    addPersonalityPoints(s, 'paint', day(1)); // artista 4
    addPersonalityPoints(s, 'theftSuccess', day(1)); // criminale 4
    expect(settlePersonalityDay(s, day(2))).toEqual(none);
    addPersonalityPoints(s, 'paint', day(2));
    addPersonalityPoints(s, 'compliment', day(2));
    expect(settlePersonalityDay(s, day(3))).toEqual({ ...none, won: 'artist' });
    expect(settlePersonalityDay(s, day(3))).toEqual(none);
    expect(personalityStatusText(s)).toBe(
      `✨ Personalità in crescita: Artista 1/${PREVAIL_TO_BECOME}`,
    );
    expect(dayWinner({})).toBeNull();
    expect(dayWinner({ business: 2, romantic: 3 })).toBe('romantic');
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
      // ottenuta col sistema di prima: parte dal livello 1
      prevail: { romantic: PREVAIL_TO_BECOME },
      day: '2026-11-02',
      today: { paint: 2 },
      todayPoints: { artist: 8 },
    });
    expect(decodePersonality(null)).toEqual(emptyPersonality());
    expect(decodePersonality({ prevail: { artist: 3, criminal: -1, wizard: 2 } }).prevail).toEqual({
      artist: 3,
    });
  });

  it('chi aveva più personalità col sistema di prima tiene quella con più punti', () => {
    const s = decodePersonality({
      points: { artist: 80, criminal: 120, romantic: 75 },
      announced: { artist: true, criminal: true, romantic: true },
    });
    expect(s.announced).toEqual({ criminal: true });
    expect(hasPersonality(s, 'artist')).toBe(false);
    expect(personalityLevel(s)).toBe(1);
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
    expect(PERSONALITY_PERKS.criminal).toContain('4 tentativi invece di 3');
    expect(PERSONALITY_PERKS.romantic).toContain('salute');
    // ai livelli 2 e 3 il premio cresce
    expect(personalityPerk('artist', 2)).toContain('40%');
    expect(personalityPerk('artist', 3)).toContain('60%');
    expect(personalityPerk('business', 2)).toContain('1,5%');
    expect(personalityPerk('business', 3)).toContain('2%');
    expect(personalityPerk('criminal', 3)).toContain('6 tentativi');
    expect(personalityPerk('romantic', 2)).toContain('+15%');
  });

  it('il premio vale solo dopo aver raggiunto la personalità', () => {
    const s = emptyPersonality();
    expect(hasPersonality(s, 'artist')).toBe(false);
    s.announced.artist = true;
    expect(hasPersonality(s, 'artist')).toBe(true);
    expect(artistOffer(100, 1)).toBe(125);
    expect(artistOffer(100, 2)).toBe(140);
    expect(artistOffer(100, 3)).toBe(160);
    expect(artistOffer(100, 0)).toBe(100);
    expect(theftTriesFor(0, 3)).toBe(3);
    expect(theftTriesFor(1, 3)).toBe(4);
    expect(theftTriesFor(3, 3)).toBe(6);
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
    expect(bankInterest(10000, '2026-11-04', '2026-11-05', 2)).toBe(150);
    expect(bankInterest(10000, '2026-11-04', '2026-11-05', 3)).toBe(200);
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
    // 5° e 6° tentativo solo ai livelli 2 e 3 (giornate prevalse come in LEVEL_PREVAIL)
    const v: string = rules.sims_theft.$pid.$room['.validate'];
    expect(v).toContain(`=== 5 && `);
    expect(v).toContain(`child('prevail').child('criminal').val() >= ${LEVEL_PREVAIL[1]}`);
    expect(v).toContain(`=== 6 && `);
    expect(v).toContain(`child('prevail').child('criminal').val() >= ${LEVEL_PREVAIL[2]}`);
  });
});

describe('etichetta della personalità', () => {
  it('mostra emoji e nome, e niente per valori sconosciuti', () => {
    expect(personalityBadgeText('artist')).toBe('🎨 Artista · Lv 1');
    expect(personalityBadgeText('criminal', 3)).toBe('😈 Boss del condominio · Lv 3');
    expect(personalityBadgeText('romantic', 2)).toBe("💘 Cuore d'oro · Lv 2");
    expect(personalityBadgeText('wizard')).toBeNull();
    expect(personalityBadgeText(undefined)).toBeNull();
  });
});
