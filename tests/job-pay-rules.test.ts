import { describe, expect, it } from 'vitest';
import {
  JOB_CLAIM_LIMITS,
  PAY_LEASE_MS,
  SHIFTS_PER_DAY,
  SHIFT_CLAIM_MS,
  SHIFT_MIN_MS,
  closeShift,
  decodeClaim,
  decodeJobState,
  importExperience,
  markPaid,
  romeDay,
  shiftPay,
  shiftsLeft,
  startShift,
} from '../shared/job-pay-rules.js';

// 15 novembre 2026, 10:00 a Roma
const NOW = Date.UTC(2026, 10, 15, 9, 0, 0);
const ROOM = 'sims_rooms_state/3';
const claim = { delivered: 10, tips: 0, fine: 0 };

function opened(state = decodeJobState(null), job: 'cantiere' | 'ufficio' = 'cantiere') {
  const out = startShift(state, job, ROOM, 's1', NOW);
  if (!out.ok) throw new Error('turno non aperto');
  return out.state;
}

describe('paga dei turni sul server: le regole', () => {
  it('il giorno è quello di Roma, non quello del telefono', () => {
    expect(romeDay(NOW)).toBe('2026-11-15');
    // 23:30 UTC del 15 è già il 16 a Roma
    expect(romeDay(Date.UTC(2026, 10, 15, 23, 30))).toBe('2026-11-16');
  });

  it('al massimo 4 turni al giorno; il giorno dopo si riparte', () => {
    let state = decodeJobState(null);
    for (let i = 0; i < SHIFTS_PER_DAY; i++) {
      const out = startShift(state, 'cantiere', ROOM, 's' + i, NOW + i);
      expect(out.ok).toBe(true);
      if (out.ok) state = out.state;
    }
    expect(shiftsLeft(state, NOW)).toBe(0);
    expect(startShift(state, 'cantiere', ROOM, 'x', NOW).ok).toBe(false);
    expect(startShift(state, 'cantiere', ROOM, 'x', NOW + 24 * 3600 * 1000).ok).toBe(true);
  });

  it('il livello di paga lo decidono i turni contati dal server', () => {
    const state = { ...decodeJobState(null), exp: { cantiere: 60 } };
    const out = startShift(state, 'cantiere', ROOM, 's1', NOW);
    expect(out.ok && out.shift).toMatchObject({ base: 95, perItem: 15, room: ROOM });
  });

  it('cambiando lavoro, i turni del vecchio ripartono da zero', () => {
    const state = { ...decodeJobState(null), active: 'cantiere' as const, exp: { cantiere: 20 } };
    const out = startShift(state, 'ufficio', ROOM, 's1', NOW);
    expect(out.ok && out.state.exp).toEqual({ cantiere: 0 });
    expect(out.ok && out.shift).toMatchObject({ base: 40, perItem: 5 });
  });

  it('i turni del salvataggio si copiano una volta sola, fino al livello massimo', () => {
    const first = importExperience(decodeJobState(null), {
      exp: { cantiere: 500, ufficio: 7, finto: 3 },
      active: 'cantiere',
    });
    expect(first).toMatchObject({
      exp: { cantiere: 60, ufficio: 7 },
      active: 'cantiere',
      imported: true,
    });
    const again = importExperience(first, {
      exp: { cantiere: 0, ufficio: 999 },
      active: 'ufficio',
    });
    expect(again).toBe(first);
    // salvataggio senza lavoro: si parte da zero e non si copia più
    expect(importExperience(decodeJobState(null), { exp: null, active: null })).toMatchObject({
      exp: {},
      imported: true,
    });
  });

  it('oggetti e mance oltre i tetti del lavoro non si pagano; la multa sì', () => {
    const tier = { base: 40, perItem: 5 };
    expect(shiftPay('cantiere', tier, { delivered: 10, tips: 0, fine: 0 })).toBe(90);
    expect(shiftPay('cantiere', tier, { delivered: 9999, tips: 9999, fine: 0 })).toBe(
      40 + JOB_CLAIM_LIMITS.cantiere.items * 5,
    );
    expect(shiftPay('ristorante', tier, { delivered: 0, tips: 9999, fine: 0 })).toBe(
      40 + JOB_CLAIM_LIMITS.ristorante.tips * 5,
    );
    expect(shiftPay('ufficio', tier, { delivered: 0, tips: 0, fine: 500 })).toBe(0);
  });

  it('i numeri del browser devono essere interi non negativi', () => {
    expect(decodeClaim({ delivered: 3 })).toEqual({ delivered: 3, tips: 0, fine: 0 });
    expect(decodeClaim({ delivered: -1 })).toBeNull();
    expect(decodeClaim({ delivered: 1.5 })).toBeNull();
    expect(decodeClaim({ delivered: '3' })).toBeNull();
    expect(decodeClaim(null)).toBeNull();
  });

  it('il turno si paga solo dopo la sua durata e non oltre 26 ore', () => {
    const state = opened();
    expect(closeShift(state, 's1', claim, NOW + SHIFT_MIN_MS - 1)).toEqual({
      kind: 'error',
      error: 'troppo presto',
    });
    expect(closeShift(state, 's1', claim, NOW + SHIFT_CLAIM_MS + 1)).toEqual({
      kind: 'error',
      error: 'scaduto',
    });
    expect(closeShift(state, 'altro', claim, NOW + SHIFT_MIN_MS)).toEqual({
      kind: 'error',
      error: 'nessun turno',
    });
    const out = closeShift(state, 's1', claim, NOW + SHIFT_MIN_MS);
    expect(out).toMatchObject({ kind: 'pay', pay: 90, room: ROOM, job: 'cantiere' });
    if (out.kind !== 'pay') return;
    expect(out.state.shift).toBeUndefined();
    expect(out.state.exp.cantiere).toBe(1);
  });

  it('la stessa paga non si versa due volte, nemmeno con due richieste insieme', () => {
    const at = NOW + SHIFT_MIN_MS;
    const out = closeShift(opened(), 's1', claim, at);
    if (out.kind !== 'pay') throw new Error('turno non chiuso');
    // una seconda richiesta mentre la prima sta versando: aspetta
    expect(closeShift(out.state, 's1', claim, at + 1000)).toEqual({ kind: 'busy' });
    // la prima si è fermata a metà: dopo un minuto la si riprende, con la stessa paga
    const resumed = closeShift(
      out.state,
      's1',
      { delivered: 45, tips: 0, fine: 0 },
      at + PAY_LEASE_MS,
    );
    expect(resumed).toMatchObject({ kind: 'pay', pay: 90 });
    // versata: chi richiede riceve la stessa cifra senza nuovi soldi
    const paid = markPaid(out.state, 's1')!;
    expect(closeShift(paid, 's1', claim, at + 5000)).toEqual({ kind: 'paid', pay: 90 });
    expect(markPaid(paid, 'altro')).toBeNull();
  });

  it('un turno lasciato a metà si chiude senza paga quando se ne apre un altro', () => {
    const first = opened();
    const second = startShift(first, 'cantiere', ROOM, 's2', NOW + 10_000);
    if (!second.ok) throw new Error('turno non aperto');
    expect(closeShift(second.state, 's1', claim, NOW + SHIFT_MIN_MS)).toMatchObject({
      kind: 'error',
      error: 'nessun turno',
    });
    expect(second.state.count).toBe(2);
  });

  it('i dati rovinati nel database non valgono', () => {
    expect(
      decodeJobState({
        day: 5,
        count: -2,
        exp: { cantiere: 'tanti', ufficio: 3 },
        shift: { id: 's1', job: 'pilota' },
        last: { id: 'x', state: 'boh' },
      }),
    ).toEqual({ day: '', count: 0, exp: { ufficio: 3 }, imported: false });
  });
});
