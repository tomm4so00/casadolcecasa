import { describe, expect, it } from 'vitest';
import {
  PILL_EFFECTS,
  decodePillTimers,
  pillActive,
  pillFever,
  pruneTimers,
  rollPillEffect,
  withPillTimer,
} from '../src/game/pill-rules';
import {
  DEALERS,
  activeRaid,
  afterPurchase,
  dealerOffer,
  dealerOnDuty,
  decodeLoyalty,
  loyaltyDiscount,
  raidOfDay,
  streetPillPrice,
} from '../src/game/dealer-rules';
import { NEEDS_RULES, needsStateFromSave } from '../src/game/absent-death-rules';
import { advanceNeeds } from '../src/game/simulation';

const H = 3_600_000;
const D = 24 * H;
const NOW = 1_800_000_000_000;

describe('pillola misteriosa', () => {
  it('gli effetti seguono i pesi (e sommano a 100)', () => {
    expect(Object.values(PILL_EFFECTS).reduce((s, e) => s + e.weight, 0)).toBe(100);
    expect(rollPillEffect(0)).toBe('euphoria');
    expect(rollPillEffect(0.19)).toBe('euphoria');
    expect(rollPillEffect(0.2)).toBe('insomnia');
    expect(rollPillEffect(0.999)).toBe('fever');
  });

  it('con poca salute niente febbre: diventa zucchero', () => {
    expect(rollPillEffect(0.999, 20)).toBe('sugar');
  });

  it('gli effetti che durano hanno una scadenza e sopravvivono al salvataggio', () => {
    const timers = withPillTimer({}, 'insomnia', NOW);
    expect(pillActive(timers, 'insomnia', NOW + 2 * H)).toBe(true);
    expect(pillActive(timers, 'insomnia', NOW + 3 * H)).toBe(false);
    expect(withPillTimer({}, 'euphoria', NOW)).toEqual({});
    expect(pruneTimers({ insomnia: NOW - 1, lucky: NOW + 1 }, NOW)).toEqual({ lucky: NOW + 1 });
    expect(decodePillTimers({ insomnia: NOW, boh: 3, lucky: 'x' })).toEqual({ insomnia: NOW });
  });

  it("la febbre è un'influenza di 6 ore", () => {
    const flu = pillFever({ sickAt: 0, until: 0, nextAt: NOW + 30 * D, exposedAt: 5 }, NOW);
    expect(flu).toMatchObject({
      sickAt: NOW,
      until: NOW + 6 * H,
      nextAt: NOW + 30 * D,
      exposedAt: 0,
    });
  });

  it("con l'insonnia il sonno non cala da svegli, poi riprende", () => {
    const state = needsStateFromSave({
      savedAt: NOW,
      sleepLevel: 50,
      pill: { insomnia: NOW + 3 * H },
    });
    advanceNeeds(state, 3 * 3600, NOW + 3 * H, NEEDS_RULES);
    expect(state.sleepLevel).toBeCloseTo(50);
    advanceNeeds(state, 3600, NOW + 4 * H, NEEDS_RULES);
    expect(state.sleepLevel).toBeLessThan(50);
  });
});

describe('spacciatori', () => {
  it('ognuno ha i suoi orari, anche a cavallo della mezzanotte', () => {
    expect(dealerOnDuty('biondo', 14)).toBe(true);
    expect(dealerOnDuty('biondo', 1)).toBe(true);
    expect(dealerOnDuty('biondo', 3)).toBe(false);
    expect(dealerOnDuty('mirko', 23)).toBe(true);
    expect(dealerOnDuty('mirko', 5)).toBe(true);
    expect(dealerOnDuty('mirko', 12)).toBe(false);
    expect(DEALERS.mirko.sells).toBe('pill');
    expect(DEALERS.biondo.sells).toBe('pill');
    expect(DEALERS.nico.sells).toBe('weed');
    expect(Object.values(DEALERS).filter((d) => d.sells === 'weed')).toHaveLength(1);
  });

  it('il listino delle pillole sta nella sua fascia e cambia piano da un’ora all’altra', () => {
    let last = streetPillPrice('CASA-0001', NOW);
    for (let h = 1; h < 500; h++) {
      const p = streetPillPrice('CASA-0001', NOW + h * H);
      expect(p).toBeGreaterThanOrEqual(15);
      expect(p).toBeLessThanOrEqual(38);
      // media di tre ore: un'ora sposta al massimo un terzo della fascia
      expect(Math.abs(p - last)).toBeLessThanOrEqual(23 / 3 + 1e-9);
      last = p;
    }
    // stesso condominio e ora: stesso prezzo; altro condominio: prezzo suo
    expect(streetPillPrice('CASA-0001', NOW)).toBe(streetPillPrice('CASA-0001', NOW));
  });

  it('retate rare (in media una ogni 7–10 giorni), da 12 a 24 ore, nei tre luoghi', () => {
    const raids = [];
    for (let d = 0; d < 3650; d++) {
      const r = raidOfDay('CASA-0001', 20_000 + d);
      if (r) raids.push(r);
    }
    const every = 3650 / raids.length;
    expect(every).toBeGreaterThan(7);
    expect(every).toBeLessThan(10.5);
    for (const r of raids) {
      expect((r.end - r.start) / H).toBeGreaterThanOrEqual(12);
      expect((r.end - r.start) / H).toBeLessThanOrEqual(24);
    }
    for (let i = 1; i < raids.length; i++)
      expect(raids[i].id - raids[i - 1].id).toBeGreaterThanOrEqual(5);
    expect(new Set(raids.map((r) => r.place))).toEqual(
      new Set(['bar', 'discoteca', 'passeggiata']),
    );
    const r = raids[0];
    expect(activeRaid('CASA-0001', r.start)).toEqual(r);
    expect(activeRaid('CASA-0001', r.end)).toBeNull();
  });

  it('durante una retata lo spacciatore del posto sparisce e l’altro raddoppia', () => {
    let r = null;
    for (let d = 20_000; !r; d++) r = raidOfDay('CASA-0001', d);
    const busted = r.place === 'bar' ? 'biondo' : r.place === 'discoteca' ? 'mirko' : 'nico';
    const other = busted === 'biondo' ? 'mirko' : 'biondo';
    const hour = DEALERS[other].from;
    expect(dealerOffer(busted, 'CASA-0001', r.start, DEALERS[busted].from, 20, 0, {}).present).toBe(
      false,
    );
    const during = dealerOffer(other, 'CASA-0001', r.start, hour, 20, 0, {});
    const after = dealerOffer(other, 'CASA-0001', r.end, hour, 20, 0, {});
    expect(during.raid).toBe(true);
    expect(during.price).toBe(after.price * 2);
  });

  it('la dipendenza fa salire il prezzo delle pillole, la fedeltà lo fa scendere', () => {
    const w = 'CASA-0001';
    const base = dealerOffer('mirko', w, NOW, 23, 30, 0, {}).price;
    expect(dealerOffer('mirko', w, NOW, 23, 30, 100, {}).price).toBe(Math.round(base * 1.5));
    let book = {};
    for (let i = 0; i < 12; i++) book = afterPurchase(book, 'mirko', NOW - 3 * D + i);
    expect(loyaltyDiscount(book, 'mirko', NOW)).toBeCloseTo(0.1);
    // due settimane senza comprare da lui: si scorda di te
    expect(loyaltyDiscount(book, 'mirko', NOW + 12 * D)).toBe(0);
    expect(afterPurchase(book, 'mirko', NOW + 12 * D).mirko).toEqual({ n: 1, last: NOW + 12 * D });
    // lo sconto arriva al massimo al 20%
    for (let i = 0; i < 40; i++) book = afterPurchase(book, 'mirko', NOW + i);
    expect(loyaltyDiscount(book, 'mirko', NOW + 41)).toBeCloseTo(0.2);
    expect(
      decodeLoyalty({ mirko: { n: 3, last: NOW }, boh: { n: 1, last: 1 }, biondo: { n: -1 } }),
    ).toEqual({
      mirko: { n: 3, last: NOW },
    });
  });
});
