import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import {
  ROMANCE_MAX_ENTRIES,
  ROMANCE_THRESHOLD,
  canTryKiss,
  decodeRomance,
  endRomance,
  noteAttention,
  unlockRomance,
  type RomanceBook,
} from '../src/game/romance-rules.js';

describe('storie romantiche', () => {
  it("l'interesse nasce dopo 5 dialoghi o complimenti dalla stessa persona", () => {
    const book: RomanceBook = {};
    const results = Array.from({ length: ROMANCE_THRESHOLD + 2 }, () =>
      noteAttention(book, 'player_anna', 'Anna', 1),
    );
    // il messaggio compare una sola volta, alla quinta interazione
    expect(results.filter(Boolean)).toHaveLength(1);
    expect(results[ROMANCE_THRESHOLD - 1]).toBe(true);
    expect(canTryKiss(book, 'player_anna')).toBe(true);
    expect(canTryKiss(book, 'player_marco')).toBe(false);
  });

  it('dopo un bacio rifiutato il pulsante sparisce e si riparte da zero', () => {
    const book: RomanceBook = {};
    unlockRomance(book, 'player_anna', 'Anna', 1);
    expect(canTryKiss(book, 'player_anna')).toBe(true);
    endRomance(book, 'player_anna', 2);
    expect(canTryKiss(book, 'player_anna')).toBe(false);
    for (let i = 0; i < ROMANCE_THRESHOLD - 1; i++)
      expect(noteAttention(book, 'player_anna', 'Anna', 3)).toBe(false);
    expect(noteAttention(book, 'player_anna', 'Anna', 4)).toBe(true);
  });

  it('il salvataggio scarta dati non validi e ricorda solo le relazioni recenti', () => {
    expect(decodeRomance('x')).toEqual({});
    expect(
      decodeRomance({ player_ok: { name: 'Ok', points: 2, unlocked: false, t: 5 }, bad: {} }),
    ).toEqual({ player_ok: { name: 'Ok', points: 2, unlocked: false, t: 5 } });
    const many: Record<string, unknown> = {};
    for (let i = 0; i < ROMANCE_MAX_ENTRIES + 5; i++)
      many['player_' + i] = { name: 'P' + i, points: 1, unlocked: false, t: i };
    const kept = decodeRomance(many);
    expect(Object.keys(kept)).toHaveLength(ROMANCE_MAX_ENTRIES);
    expect(kept.player_0).toBeUndefined();
  });

  it('le regole del database accettano i messaggi del bacio', () => {
    const rule = JSON.parse(fs.readFileSync('firebase/database.rules.proposed.json', 'utf8')).rules
      .sims_interactions.$pid.$key['.validate'];
    for (const type of ['romance', 'kissAsk', 'kissYes', 'kissNo']) expect(rule).toContain(type);
  });
});
