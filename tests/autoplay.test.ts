import { describe, expect, it } from 'vitest';
import {
  ABANDON_DAYS,
  AUTOPLAY_GRACE_MS,
  AUTOPLAY_PLACES,
  AUTOPLAY_SPEED,
  BED_THRESHOLD,
  GAMBLES_PER_DAY,
  GAMBLE_MIN_VAULT,
  PERSONALITY_PLACES,
  SLOT_MS,
  type AutoplayInfo,
  absenceDiary,
  absenceGambles,
  autoplayAt,
  isNight,
  placeFor,
  romeHour,
  speedAt,
} from '../src/game/autoplay-rules.js';
import {
  NEEDS_RULES,
  advanceAbsence,
  forecastBedAt,
  lowestNeed,
  needsStateFromSave,
} from '../src/game/absent-death-rules.js';
import { SLOT_BET } from '../src/game/betting-rules.js';

const H = 3600000;
const D = 24 * H;
/** Mezzogiorno italiano di un giorno qualunque (novembre: UTC+1). */
const NOON = Date.UTC(2026, 10, 10, 11, 0);

const info = (more: Partial<AutoplayInfo> = {}): AutoplayInfo => ({
  pid: 'player_ada1',
  offAt: NOON - H,
  bedAt: NOON + 5 * D,
  need: 90,
  ...more,
});

describe('autoplay: dove va e cosa fa', () => {
  it('appena uscito resta dov’era, di notte dorme, dopo la soglia torna a letto', () => {
    const i = info();
    expect(autoplayAt({ ...i, offAt: NOON }, NOON + AUTOPLAY_GRACE_MS - 1).kind).toBe('still');
    expect(autoplayAt(i, NOON).kind).toBe('place');
    // le 3 di notte in Italia
    const night = Date.UTC(2026, 10, 11, 2, 0);
    expect(romeHour(night)).toBe(3);
    expect(isNight(night)).toBe(true);
    expect(autoplayAt(i, night).kind).toBe('bed');
    expect(autoplayAt({ ...i, bedAt: NOON - 1 }, NOON).kind).toBe('bed');
  });

  it('tutti calcolano la stessa cosa: stesso personaggio e stessa ora, stesso posto e punto', () => {
    const a = autoplayAt(info({ pers: 'artist', persLv: 2 }), NOON + 7 * 60_000);
    const b = autoplayAt(info({ pers: 'artist', persLv: 2 }), NOON + 7 * 60_000);
    expect(a).toEqual(b);
    // e cammina dentro il posto, tra i suoi punti
    if (a.kind !== 'place') throw new Error('doveva essere in giro');
    const pts = (AUTOPLAY_PLACES[a.place].points as readonly (readonly number[])[]).flat();
    expect(a.x).toBeGreaterThanOrEqual(Math.min(...pts.filter((_, k) => k % 2 === 0)) - 1e-6);
  });

  it('in giro non sta quasi mai fermo, e non rifà sempre lo stesso giro', () => {
    let still = 0,
      n = 0;
    const spots = new Set<string>();
    let last = '';
    const order: string[] = [];
    for (let t = NOON; t < NOON + 4 * H; t += 1000) {
      const v = autoplayAt(info(), t);
      if (v.kind !== 'place') continue;
      n++;
      if (!v.moving) {
        still++;
        const at = `${v.place}:${v.x},${v.y}`;
        spots.add(at);
        if (at !== last) order.push(at);
        last = at;
      }
    }
    expect(n).toBeGreaterThan(0);
    // fermo meno di un quarto del tempo (prima era l'85%)
    expect(still / n).toBeLessThan(0.25);
    // le soste non si ripetono a giro fisso: in fila ci sono anche tre punti diversi
    expect(spots.size).toBeGreaterThan(3);
    expect(order.length).toBeGreaterThan(50);
  });

  it('più cresce la personalità, più va nei posti suoi', () => {
    const share = (more: Partial<AutoplayInfo>) => {
      let mine = 0;
      for (let s = 0; s < 2000; s++)
        if (PERSONALITY_PLACES.scientist.includes(placeFor(info(more), s))) mine++;
      return mine / 2000;
    };
    const none = share({});
    const lead = share({ lead: 'scientist' });
    const lv1 = share({ pers: 'scientist', persLv: 1 });
    const lv3 = share({ pers: 'scientist', persLv: 3 });
    expect(lead).toBeGreaterThan(none);
    expect(lv1).toBeGreaterThan(lead);
    expect(lv3).toBeGreaterThan(lv1);
    expect(lv3).toBeGreaterThan(0.85);
  });

  it('va più piano di chi gioca, e più piano ancora con i parametri bassi', () => {
    expect(speedAt(100)).toBeCloseTo(AUTOPLAY_SPEED);
    expect(AUTOPLAY_SPEED).toBeLessThan(130);
    expect(speedAt(BED_THRESHOLD)).toBeLessThan(speedAt(80));
    expect(speedAt(0)).toBeCloseTo(AUTOPLAY_SPEED / 2);
    const fresh = autoplayAt(info(), NOON);
    const tired = autoplayAt(info(), NOON + 4 * D + 3 * H);
    if (fresh.kind !== 'place' || tired.kind !== 'place') throw new Error('in giro');
    expect(tired.speed).toBeLessThan(fresh.speed);
  });
});

describe('autoplay: i parametri di chi è via', () => {
  const full = {
    savedAt: NOON,
    healthLevel: 100,
    sleepLevel: 100,
    hungerLevel: 100,
    hygieneLevel: 100,
    happinessLevel: 100,
  };

  it('da pieni durano circa una settimana; a letto sotto il 20%', () => {
    const s = needsStateFromSave(full);
    advanceAbsence(s, NOON, NOON + 3 * D, NEEDS_RULES);
    expect(lowestNeed(s)).toBeGreaterThan(50);
    const week = needsStateFromSave(full);
    advanceAbsence(week, NOON, NOON + 7 * D, NEEDS_RULES);
    expect(week.hungerLevel).toBeLessThan(2);
    expect(week.healthLevel).toBeGreaterThan(0);
    const bedAt = forecastBedAt(needsStateFromSave(full), NOON, NEEDS_RULES);
    expect((bedAt - NOON) / D).toBeGreaterThan(5);
    expect((bedAt - NOON) / D).toBeLessThan(6);
  });

  it('la vita di chi è via si allunga fino a circa il limite dell’abbandono', () => {
    const s = needsStateFromSave(full);
    advanceAbsence(s, NOON, NOON + 9 * D, NEEDS_RULES);
    expect(s.healthLevel).toBeGreaterThan(0);
    advanceAbsence(s, NOON + 9 * D, NOON + (ABANDON_DAYS + 1) * D, NEEDS_RULES);
    expect(s.healthLevel).toBe(0);
  });
});

describe('autoplay: soldi e diario', () => {
  it('il Giocatore d’azzardo fa 3 giocate al giorno, solo con almeno 50 Đ', () => {
    const i = info({ pers: 'gambler', persLv: 1, bedAt: NOON + 10 * D });
    const two = absenceGambles(i, NOON, NOON + 2 * D, 1000);
    // giorni in giro: oggi, domani e dopodomani (fino a mezzogiorno)
    expect(two.spins.length).toBe(3 * GAMBLES_PER_DAY);
    expect(two.net).toBe(two.spins.reduce((s, x) => s + x.win - SLOT_BET, 0));
    // poveri: niente giocate
    expect(absenceGambles(i, NOON, NOON + 2 * D, GAMBLE_MIN_VAULT - 1).spins).toHaveLength(0);
    // sempre lo stesso risultato
    expect(absenceGambles(i, NOON, NOON + 2 * D, 1000)).toEqual(two);
  });

  it('il diario racconta i posti in cui è stato di più', () => {
    const d = absenceDiary(info({ pers: 'partier', persLv: 3 }), NOON, NOON + 8 * H);
    expect(d.length).toBeGreaterThan(0);
    expect(d.length).toBeLessThanOrEqual(3);
    expect(PERSONALITY_PLACES.partier).toContain(d[0].place);
    const total = d.reduce((s, x) => s + x.minutes, 0);
    expect(total).toBeLessThanOrEqual((8 * H) / 60_000);
    expect(total % (SLOT_MS / 60_000)).toBe(0);
  });
});
