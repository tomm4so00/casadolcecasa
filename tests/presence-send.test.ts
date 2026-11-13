import { describe, expect, it } from 'vitest';
import {
  DRIFT_PX,
  MOVING_REFRESH_MS,
  PRESENCE_BEAT_MS,
  PRESENCE_FULL_MS,
  motionNeedsSend,
  presenceDiff,
  presenceSend,
  velocity,
} from '../src/game/presence-send-rules.js';

const card = {
  name: 'Tommaso',
  x: 10,
  y: 20,
  vx: 0,
  vy: 0,
  env: 'COURTYARD',
  look: 'abc',
  roomIdx: null,
};
const still = { x: 10, y: 20, vx: 0, vy: 0 };
const walking = { x: 10, y: 20, vx: 100, vy: 0 };

describe('presenza leggera: si manda solo quello che serve', () => {
  it('le voci sparite si tolgono, quelle nuove si aggiungono', () => {
    expect(presenceDiff({ ...card, sick: 1 }, card)).toEqual({ sick: null });
    expect(presenceDiff(card, { ...card, say: 'Ciao' })).toEqual({ say: 'Ciao' });
    // null e assente sono la stessa cosa
    expect(presenceDiff(card, { ...card, roomIdx: undefined })).toEqual({});
    expect(presenceDiff(card, { ...card, roomIdx: 3 })).toEqual({ roomIdx: 3 });
  });

  it('la velocità: arrotondata, zero da fermi e dopo un salto', () => {
    expect(velocity({ x: 0, y: 0 }, { x: 13, y: 0 }, 100)).toEqual({ vx: 130, vy: 0 });
    expect(velocity({ x: 0, y: 0 }, { x: 0, y: 0 }, 100)).toEqual({ vx: 0, vy: 0 });
    expect(velocity({ x: 0, y: 0 }, { x: 400, y: 0 }, 100)).toEqual({ vx: 0, vy: 0 });
  });

  it('camminando dritti basta un punto al secondo; partenza, fermata e curve subito', () => {
    // dritto a 100 al secondo: dopo mezzo secondo è dove gli altri lo immaginano
    expect(motionNeedsSend(walking, { ...walking, x: 60 }, 500)).toBe(false);
    expect(motionNeedsSend(walking, { ...walking, x: 110 }, MOVING_REFRESH_MS)).toBe(true);
    // parte, si ferma
    expect(motionNeedsSend(still, { ...still, vx: 100 }, 100)).toBe(true);
    expect(motionNeedsSend(walking, { ...still, x: 20 }, 100)).toBe(true);
    // gira: la stima sbaglia di più di DRIFT_PX
    expect(motionNeedsSend(walking, { x: 40, y: 20 + DRIFT_PX + 2, vx: 0, vy: 100 }, 300)).toBe(
      true,
    );
    // fermo resta fermo: niente
    expect(motionNeedsSend(still, still, 3000)).toBe(false);
  });

  it('scheda intera la prima volta e ogni tanto; il movimento parte sempre con le voci cambiate', () => {
    const base = { next: card, now: 100_000, lastSentAt: 99_900, lastFullAt: 90_000 };
    expect(presenceSend({ ...base, last: null })).toEqual({ kind: 'full' });
    expect(
      presenceSend({ ...base, last: card, lastFullAt: 100_000 - PRESENCE_FULL_MS - 1 }),
    ).toEqual({ kind: 'full' });
    expect(presenceSend({ ...base, last: card })).toEqual({ kind: 'none' });
    expect(presenceSend({ ...base, last: card, next: { ...card, say: 'Ciao' } })).toEqual({
      kind: 'diff',
      changes: { say: 'Ciao', ...still },
    });
    expect(presenceSend({ ...base, last: card, next: { ...card, x: 11, vx: 10 } })).toEqual({
      kind: 'diff',
      changes: { x: 11, y: 20, vx: 10, vy: 0 },
    });
    // fermo da più di 5 secondi: il battito
    expect(
      presenceSend({ ...base, last: card, lastSentAt: 100_000 - PRESENCE_BEAT_MS - 1 }),
    ).toEqual({ kind: 'diff', changes: still });
  });
});
