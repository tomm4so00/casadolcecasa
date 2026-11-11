import { describe, expect, it } from 'vitest';
import {
  DORMANT_AFTER_MS,
  DORMANT_ASLEEP_MS,
  shouldGoDormant,
  wakeAction,
} from '../src/game/dormancy-rules.js';

const MIN = 60_000;

describe('pausa con la scheda nascosta', () => {
  it('dopo 10 minuti si scollega; se il personaggio dorme dopo 2', () => {
    expect(DORMANT_AFTER_MS).toBe(10 * MIN);
    expect(DORMANT_ASLEEP_MS).toBe(2 * MIN);
    const awake = { sleeping: false, busy: false };
    expect(shouldGoDormant({ ...awake, hiddenFor: 9 * MIN })).toBe(false);
    expect(shouldGoDormant({ ...awake, hiddenFor: 10 * MIN })).toBe(true);
    const asleep = { sleeping: true, busy: false };
    expect(shouldGoDormant({ ...asleep, hiddenFor: 1 * MIN })).toBe(false);
    expect(shouldGoDormant({ ...asleep, hiddenFor: 2 * MIN })).toBe(true);
  });

  it('con la scheda visibile o qualcosa in corso resta collegato', () => {
    expect(shouldGoDormant({ hiddenFor: 0, sleeping: true, busy: false })).toBe(false);
    expect(shouldGoDormant({ hiddenFor: 60 * MIN, sleeping: true, busy: true })).toBe(false);
  });

  it('al ritorno ricarica, tranne se il personaggio è aperto su un altro dispositivo', () => {
    const now = 1_800_000_000_000;
    // la sessione è ancora la mia (o non c'è, o è scaduta): si ricarica
    expect(wakeAction({ id: 'mia', expiresAt: now - 600_000 }, 'mia', now)).toBe('reload');
    expect(wakeAction(null, 'mia', now)).toBe('reload');
    expect(wakeAction({ id: 'telefono', expiresAt: now - 1000 }, 'mia', now)).toBe('reload');
    // un altro dispositivo la tiene adesso: ricaricando gliela ruberei
    expect(wakeAction({ id: 'telefono', expiresAt: now + 30_000 }, 'mia', now)).toBe('taken');
  });
});
