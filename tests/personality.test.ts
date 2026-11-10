import fs from 'node:fs';
import { describe, expect, it } from 'vitest';
import {
  BEDTIME_THOUGHTS,
  PERSONALITY_ACTIONS,
  PERSONALITY_IDS,
  PERSONALITY_PERKS,
  PREVAIL_MIN_POINTS,
  SECOND_LEVEL,
  actionDailyMax,
  actionEffort,
  actionPoints,
  addictHappiness,
  discoPrice,
  moonTripPrice,
  perkAt,
  personalityRank,
  petFoodGain,
  reporterShare,
  secondLevel,
  secondLevelValue,
  secondPerkLines,
  secondPersonality,
  slotPrize,
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
  it('tutte e dieci crescono al massimo di 10 punti al giorno', () => {
    for (const id of PERSONALITY_IDS) {
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
    expect(personalityStatusText(s, day(6)).split('\n')[0]).toBe(
      '✨ Criminale (Criminale, livello 1) · livello 2 tra 10 giornate',
    );
    // i progressi di oggi
    expect(personalityStatusText(s, day(6))).toContain('📅 Oggi: 😈 Criminale 10/10');
  });

  it('livello 2 con altre 10 giornate (15), livello 3 a 30: cambiano titolo e premio', () => {
    const s = emptyPersonality();
    const ups: (number | null)[] = [];
    for (let d = 1; d <= 32; d++) {
      // un quadro (4) e due vendite (1,5 + 1,5): 7 punti, sopra la soglia dei 6
      addPersonalityPoints(s, 'paint', day(d));
      addPersonalityPoints(s, 'sellPainting', day(d));
      addPersonalityPoints(s, 'sellPainting', day(d));
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
      playHardDay(s, 'romantic', d);
      offers.push(settlePersonalityDay(s, day(d + 1)).offer);
    }
    // la proposta arriva una sola volta, alla 5ª giornata del Romanticone
    expect(offers).toEqual([null, null, null, null, 'romantic', null, null]);
    expect(s.offer).toBe('romantic');
    expect(obtainedPersonality(s)).toBe('artist'); // finché non risponde resta Artista
    // resta Artista: il Romanticone diventa il secondo tratto e si riproporrà più avanti
    expect(answerSwitchOffer(s, false)).toBeNull();
    expect(s.offer).toBeUndefined();
    expect(s.prevail?.romantic).toBe(7);
    expect(s.second).toBe('romantic');
    expect(levelOf(s, 'romantic')).toBe(SECOND_LEVEL);
    expect(obtainedPersonality(s)).toBe('artist');
    const again: (string | null)[] = [];
    for (let d = 23; d <= 28; d++) {
      playHardDay(s, 'romantic', d);
      again.push(settlePersonalityDay(s, day(d + 1)).offer);
    }
    // rifiutata a 7 giornate: si ripropone a 12
    expect(again).toEqual([null, null, null, null, 'romantic', null]);
    // oppure cambia: Romanticone livello 1, l'Artista resta come secondo tratto
    const t = base();
    for (let d = 16; d <= 20; d++) {
      playHardDay(t, 'romantic', d);
      settlePersonalityDay(t, day(d + 1));
    }
    expect(answerSwitchOffer(t, true)).toBe('romantic');
    expect(t.announced).toEqual({ romantic: true });
    expect(t.prevail).toEqual({ artist: 15, romantic: PREVAIL_TO_BECOME });
    expect(personalityLevel(t)).toBe(1);
    expect(hasPersonality(t, 'artist')).toBe(false);
    expect(secondPersonality(t)).toBe('artist');
    expect(t.second).toBe('artist');
  });

  it('serve una giornata da almeno 6 punti; a pari merito vince chi ha più giornate', () => {
    const none = { won: null, reached: null, levelUp: null, offer: null };
    const s = emptyPersonality();
    addPersonalityPoints(s, 'paint', day(1)); // artista 4: giornata svogliata
    expect(settlePersonalityDay(s, day(2))).toEqual(none);
    playHardDay(s, 'artist', 2);
    expect(settlePersonalityDay(s, day(3))).toEqual({ ...none, won: 'artist' });
    expect(settlePersonalityDay(s, day(3))).toEqual(none);
    expect(personalityStatusText(s, day(3)).split('\n')[0]).toBe(
      `✨ Personalità in crescita: Artista 1/${PREVAIL_TO_BECOME}`,
    );
    expect(dayWinner({})).toBeNull();
    expect(dayWinner({ business: 2, romantic: 3 })).toBeNull();
    expect(dayWinner({ business: 2, romantic: PREVAIL_MIN_POINTS })).toBe('romantic');
    expect(dayWinner({ artist: 7, criminal: 7 })).toBeNull();
    expect(dayWinner({ artist: 7, criminal: 7 }, { criminal: 2 })).toBe('criminal');
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
  const ids: PersonalityId[] = PERSONALITY_IDS;

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
    expect(PERSONALITY_PERKS.criminal).toContain('5 tentativi invece di 3');
    expect(PERSONALITY_PERKS.romantic).toContain('salute');
    // ai livelli 2 e 3 il premio cresce
    expect(personalityPerk('artist', 2)).toContain('40%');
    expect(personalityPerk('artist', 3)).toContain('60%');
    expect(personalityPerk('business', 2)).toContain('1,5%');
    expect(personalityPerk('business', 3)).toContain('2%');
    expect(personalityPerk('criminal', 2)).toContain('7 tentativi');
    expect(personalityPerk('criminal', 3)).toContain('9 tentativi');
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
    // prima personalità: due tentativi in più per livello
    expect(theftTriesFor(1, 3)).toBe(5);
    expect(theftTriesFor(2, 3)).toBe(7);
    expect(theftTriesFor(3, 3)).toBe(9);
    // secondo tratto: uno in più per livello
    expect(theftTriesFor(secondLevelValue(1), 3)).toBe(4);
    expect(theftTriesFor(secondLevelValue(2), 3)).toBe(5);
    expect(theftTriesFor(secondLevelValue(3), 3)).toBe(6);
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
    // anche a chi ha il Criminale come secondo tratto
    expect(rules.sims_theft.$pid.$room['.validate']).toContain(
      "child('second').val() === 'criminal'",
    );
    // 5° e 6° tentativo solo ai livelli 2 e 3 (giornate prevalse come in LEVEL_PREVAIL)
    const v: string = rules.sims_theft.$pid.$room['.validate'];
    // prima personalità fino a 5, 7 e 9; secondo tratto fino a 4, 5 e 6
    for (const n of [5, 7, 9, 4, 6]) expect(v).toContain(`val() <= ${n}`);
    expect(v).toContain(`child('prevail').child('criminal').val() >= ${LEVEL_PREVAIL[1]}`);
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

describe('punti ben calibrati', () => {
  /** Il modo più economico (in minuti equivalenti) per fare 10 punti in un giorno. */
  function cheapestDay(id: PersonalityId): number {
    const acts = actionsOf(id).map((a) => ({
      p: actionPoints(a),
      e: actionEffort(a),
      cap: actionDailyMax(a),
    }));
    let best = Infinity;
    const rec = (i: number, pts: number, eff: number) => {
      if (eff >= best) return;
      if (pts >= PERSONALITY_DAILY_MAX) {
        best = eff;
        return;
      }
      if (i >= acts.length) return;
      const x = acts[i];
      for (let n = 0; n <= Math.ceil(x.cap / x.p); n++)
        rec(i + 1, pts + Math.min(n * x.p, x.cap), eff + n * x.e);
    };
    rec(0, 0, 0);
    return best;
  }

  it('ogni personalità si riempie con 15-30 minuti di gioco mirato', () => {
    for (const id of PERSONALITY_IDS) {
      const m = cheapestDay(id);
      expect(m, id).toBeGreaterThanOrEqual(15);
      expect(m, id).toBeLessThanOrEqual(30);
    }
  });

  it('nessuna azione da sola riempie la giornata: ne servono almeno due', () => {
    for (const a of Object.keys(PERSONALITY_ACTIONS) as PersonalityAction[])
      expect(actionDailyMax(a)).toBeLessThan(PERSONALITY_DAILY_MAX);
    const s = emptyPersonality();
    for (let i = 0; i < 20; i++) addPersonalityPoints(s, 'insult', day(2));
    expect(s.todayPoints.criminal).toBe(actionDailyMax('insult'));
  });

  it('i punti seguono lo sforzo: tempo, soldi, rischio e altri giocatori', () => {
    // 2 minuti a punto, mezzo punto minimo, 5 al massimo
    expect(actionPoints('paint')).toBe(4);
    expect(actionPoints('insult')).toBe(0.5);
    expect(actionPoints('moonTrip')).toBe(5);
    // con i soldi spesi davvero: versare 200 Đ vale più di 10 Đ
    expect(actionPoints('donateProject', 200)).toBeGreaterThan(actionPoints('donateProject', 10));
    // rischio e altri giocatori pesano
    expect(actionEffort('kissAttempt')).toBe(1.5);
    expect(actionEffort('theftAttempt')).toBe(3);
  });
});

describe('secondo tratto e premi nuovi', () => {
  it("il secondo tratto è l'altra personalità più forte, da 5 giornate in su", () => {
    const s = decodePersonality({
      points: { artist: 50, criminal: 30, gambler: 40 },
      announced: { artist: true },
      prevail: { artist: 9, criminal: 6, gambler: 4 },
    });
    expect(secondPersonality(s)).toBe('criminal');
    expect(s.second).toBe('criminal');
    expect(levelOf(s, 'criminal')).toBe(SECOND_LEVEL);
    expect(levelOf(s, 'gambler')).toBe(0);
    // il premio del secondo tratto è più leggero del livello 1
    expect(theftTriesFor(levelOf(s, 'criminal'), 3)).toBe(4);
    s.prevail!.criminal = 15;
    expect(secondLevel(s)).toBe(2);
    expect(levelOf(s, 'criminal')).toBe(secondLevelValue(2));
    expect(theftTriesFor(levelOf(s, 'criminal'), 3)).toBe(5);
    expect(perkAt('artist', SECOND_LEVEL)!).toBeLessThan(perkAt('artist', 1)!);
    expect(personalityStatusText(s, day(3))).toContain("Secondo tratto: un po' 😈 Criminale");
    // senza una personalità non c'è secondo tratto
    expect(
      secondPersonality(decodePersonality({ prevail: { artist: 9, criminal: 6 } })),
    ).toBeNull();
  });

  it('i premi delle sei personalità nuove, livello per livello', () => {
    expect(addictHappiness(15, 1)).toBe(19);
    expect(addictHappiness(15, 0)).toBe(15);
    expect(slotPrize(100, 3)).toBe(130);
    expect(slotPrize(0, 3)).toBe(0);
    expect(discoPrice(20, 1)).toBe(15);
    expect(discoPrice(20, 3)).toBe(0);
    expect(discoPrice(20, SECOND_LEVEL)).toBe(18);
    expect(petFoodGain(50, 2)).toBe(70);
    expect(moonTripPrice(500, 1)).toBe(400);
    expect(moonTripPrice(500, 3)).toBe(250);
    expect(moonTripPrice(500, SECOND_LEVEL)).toBe(450);
    expect(reporterShare(0)).toBe(50);
    expect(reporterShare(SECOND_LEVEL)).toBe(55);
    expect(reporterShare(3)).toBe(80);
    for (const id of PERSONALITY_IDS) {
      expect(PERSONALITY_PERKS[id].length, id).toBeGreaterThan(10);
      expect(BEDTIME_THOUGHTS[id].length, id).toBeGreaterThan(0);
    }
    expect(PERSONALITY_PERKS.scientist).toContain('luna');
    expect(personalityPerk('partier', 3)).toBe('In discoteca entri gratis.');
  });

  it('nella classifica del condominio: personalità, livello, giornate e secondo tratto', () => {
    expect(personalityRank(emptyPersonality())).toEqual({});
    const s = decodePersonality({
      announced: { vigilante: true },
      prevail: { vigilante: 16, addict: 5 },
    });
    expect(personalityRank(s)).toEqual({
      pers: 'vigilante',
      persLv: 2,
      persDays: 16,
      pers2: 'addict',
    });
  });
});

describe('livelli del secondo tratto', () => {
  it('tutte le personalità hanno tre livelli anche come secondo tratto, sempre più leggeri', () => {
    for (const id of PERSONALITY_IDS) {
      const second = [1, 2, 3].map((lv) => perkAt(id, secondLevelValue(lv))!);
      const main = [1, 2, 3].map((lv) => perkAt(id, lv)!);
      // il premio sale con il livello (lo sconto e la quota crescono, come gli altri)
      expect(second[1], id).toBeGreaterThan(second[0]);
      expect(second[2], id).toBeGreaterThan(second[1]);
      // e al suo livello resta sotto la personalità principale allo stesso livello
      for (let i = 0; i < 3; i++) expect(second[i], id).toBeLessThan(main[i]);
      expect(secondPerkLines(id)).toHaveLength(3);
    }
    expect(secondPerkLines('scientist')[2]).toContain('25% in meno');
    expect(discoPrice(20, secondLevelValue(3))).toBe(10);
    expect(reporterShare(secondLevelValue(2))).toBe(60);
  });
});
