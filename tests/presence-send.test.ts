import { describe, expect, it } from 'vitest';
import {
  PRESENCE_BEAT_MS,
  PRESENCE_FULL_MS,
  presenceDiff,
  presenceSend,
} from '../src/game/presence-send-rules.js';

const card = { name: 'Tommaso', x: 10, y: 20, env: 'COURTYARD', look: 'abc', roomIdx: null };

describe('presenza leggera: si manda solo quello che cambia', () => {
  it('camminando partono solo x e y', () => {
    expect(presenceDiff(card, { ...card, x: 12, y: 21 })).toEqual({ x: 12, y: 21 });
    expect(presenceDiff(card, card)).toEqual({});
  });

  it('le voci sparite si tolgono, quelle nuove si aggiungono', () => {
    expect(presenceDiff({ ...card, sick: 1 }, card)).toEqual({ sick: null });
    expect(presenceDiff(card, { ...card, say: 'Ciao' })).toEqual({ say: 'Ciao' });
    // null e assente sono la stessa cosa
    expect(presenceDiff(card, { ...card, roomIdx: undefined })).toEqual({});
    expect(presenceDiff(card, { ...card, roomIdx: 3 })).toEqual({ roomIdx: 3 });
  });

  it('scheda intera la prima volta, dopo un errore e ogni tanto; battito da fermi', () => {
    const base = { next: card, now: 100_000, lastSentAt: 99_900, lastFullAt: 90_000 };
    expect(presenceSend({ ...base, last: null })).toEqual({ kind: 'full' });
    expect(
      presenceSend({ ...base, last: card, lastFullAt: 100_000 - PRESENCE_FULL_MS - 1 }),
    ).toEqual({ kind: 'full' });
    expect(presenceSend({ ...base, last: card })).toEqual({ kind: 'none' });
    expect(presenceSend({ ...base, last: card, next: { ...card, x: 11 } })).toEqual({
      kind: 'diff',
      changes: { x: 11 },
    });
    // fermo da più di 5 secondi: parte solo l'ora (la aggiunge chi manda)
    expect(
      presenceSend({ ...base, last: card, lastSentAt: 100_000 - PRESENCE_BEAT_MS - 1 }),
    ).toEqual({ kind: 'diff', changes: {} });
  });
});
