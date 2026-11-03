import { describe, expect, it } from 'vitest';
import { ENV_STYLE, MUSIC_TRACKS } from '../src/game/data/catalogues';
import { ENV_MUSIC, musicFor } from '../src/game/music-rules';

const NOTE = /^[A-G][b#]?\d$/;
const CHORD = /^[A-G][b#]?(m|o)?$/;
const tracks = MUSIC_TRACKS as Record<
  string,
  { bpm: number; lead: string; chords: string; melody: string[]; bass: string; drums: string }
>;

describe('musica', () => {
  it('ogni brano è scritto bene: 8 battute, accordi e note validi', () => {
    for (const [name, tr] of Object.entries(tracks)) {
      const chords = tr.chords.split(' ');
      expect(chords.length, name).toBe(tr.melody.length);
      for (const c of chords) expect(c, `${name}: accordo ${c}`).toMatch(CHORD);
      for (const bar of tr.melody) {
        const steps = bar.split(' ');
        expect(steps.length, `${name}: ${bar}`).toBe(8);
        for (const s of steps) if (s !== '.') expect(s, `${name}: nota ${s}`).toMatch(NOTE);
      }
      expect(tr.bass.split(' ').length, name).toBe(8);
      expect(tr.drums.split(' ').length, name).toBe(8);
      expect(tr.bpm, name).toBeGreaterThan(40);
    }
  });

  it('ogni ambiente ha un tema che esiste, e molti ne hanno uno tutto loro', () => {
    for (const env of Object.keys(ENV_STYLE)) expect(tracks[musicFor(env)], env).toBeDefined();
    for (const name of Object.values(ENV_MUSIC)) expect(tracks[name], name).toBeDefined();
    expect(musicFor('CORTILE')).toBe('courtyard');
    expect(musicFor('PLAYER_ROOM')).toBe('room');
    expect(musicFor('negozio_vestiti')).toBe('mall');
    expect(musicFor('luna')).toBe('space');
    expect(musicFor('lavoro_ufficio')).toBe('work');
    expect(musicFor('SALOON')).toBe('home');
    expect(new Set(Object.keys(ENV_STYLE).map(musicFor)).size).toBeGreaterThanOrEqual(12);
  });
});
