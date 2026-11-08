import { describe, expect, it } from 'vitest';
import {
  JOINT_EFFECT_MS,
  JOINT_COOLDOWN_MS,
  jointReadyAt,
  jointOutdoors,
  jointSpeed,
  jointUseError,
} from '../src/game/joint-rules.js';

describe('fumare erba', () => {
  it('consente gli esterni ma distingue il laboratorio dalla sua zona esterna', () => {
    expect(jointOutdoors('CORTILE', true, 0, 15)).toBe(true);
    expect(jointOutdoors('passeggiata', true, 0, 15)).toBe(true);
    expect(jointOutdoors('PLAYER_ROOM', false, 0, 15)).toBe(false);
    expect(jointOutdoors('ingegneria', true, 100, 15)).toBe(false);
    expect(jointOutdoors('ingegneria', true, 15, 15)).toBe(false);
    expect(jointOutdoors('ingegneria', true, -100, 15)).toBe(true);
    expect(jointOutdoors('luna', true, 0, 15)).toBe(false);
  });

  it('dopo dieci minuti torna la velocità normale ma per fumare ne servono trenta', () => {
    const now = 1_000_000;
    const effectUntil = now + JOINT_EFFECT_MS;
    const readyAt = now + JOINT_COOLDOWN_MS;
    expect(jointUseError(2, true, readyAt, now, false)).toContain('30 min');
    expect(jointSpeed(effectUntil, effectUntil - 1)).toBe(0.9);
    expect(jointSpeed(effectUntil, effectUntil)).toBe(1);
    expect(jointUseError(2, true, readyAt, effectUntil, false)).toContain('20 min');
    expect(jointUseError(2, true, readyAt, readyAt - 1, false)).toContain('1 min');
    expect(jointUseError(2, true, readyAt, readyAt, false)).toBeNull();
  });

  it('ricostruisce l’attesa dai vecchi effetti senza allungare una scadenza già salvata', () => {
    expect(jointReadyAt(undefined, 0)).toBe(0);
    expect(jointReadyAt(undefined, JOINT_EFFECT_MS)).toBe(JOINT_COOLDOWN_MS);
    expect(jointReadyAt(123, JOINT_EFFECT_MS)).toBe(123);
  });

  it('rifiuta il consumo senza scorte, al chiuso o durante altre attività', () => {
    expect(jointUseError(0, true, 0, 1, false)).toContain('Non hai erba');
    expect(jointUseError(1, false, 0, 1, false)).toContain('all’aperto');
    expect(jointUseError(1, true, 0, 1, true)).toContain('Finisci prima');
    expect(jointUseError(1, true, 0, 1, false)).toBeNull();
  });
});
