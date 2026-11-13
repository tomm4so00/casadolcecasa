import { describe, expect, it } from 'vitest';
import { FIRST_VISIT, decodeSeenPlaces, firstVisitKey } from '../src/game/first-visit-rules';
import { GUIDE_TOPICS } from '../src/game/data/guide-topics';

describe('riga «prima volta qui»', () => {
  it('ogni posto del gioco ha la sua riga, breve', () => {
    const places = [
      'CORTILE',
      'SALOON',
      'KITCHEN',
      'BATHROOM',
      'PLAYER_ROOM',
      'centro_commerciale',
    ];
    for (const env of places) expect(FIRST_VISIT[env]).toBeTruthy();
    for (const line of Object.values(FIRST_VISIT)) expect(line.length).toBeLessThanOrEqual(100);
  });

  it('i lavori hanno una riga sola; la stanza solo se è la tua', () => {
    expect(firstVisitKey('lavoro_ospedale', false)).toBe('lavoro');
    expect(firstVisitKey('lavoro_cantiere', false)).toBe('lavoro');
    expect(firstVisitKey('PLAYER_ROOM', true)).toBe('PLAYER_ROOM');
    expect(firstVisitKey('PLAYER_ROOM', false)).toBeNull();
    expect(firstVisitKey('bar', false)).toBe('bar');
    expect(firstVisitKey('posto_inventato', false)).toBeNull();
  });

  it('dal salvataggio si tengono solo i posti conosciuti', () => {
    expect(decodeSeenPlaces(['bar', 'boh', 3, 'lavoro'])).toEqual(['bar', 'lavoro']);
    expect(decodeSeenPlaces(null)).toEqual([]);
  });
});

describe('guida per argomenti', () => {
  it('argomenti con id diversi, titolo e testo', () => {
    expect(new Set(GUIDE_TOPICS.map((t) => t.id)).size).toBe(GUIDE_TOPICS.length);
    for (const t of GUIDE_TOPICS) {
      expect(t.title).toBeTruthy();
      expect(t.text.length).toBeGreaterThan(80);
    }
  });
});
