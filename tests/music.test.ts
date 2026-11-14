import { describe, expect, it } from 'vitest';
import { ENV_STYLE, MUSIC_TRACKS, MUSIC_VARIANTS } from '../src/game/data/catalogues';
import { ENV_MUSIC, firstVariant, musicFor, nextVariant } from '../src/game/music-rules';

const NOTE = /^[A-G][b#]?\d$/;
const CHORD = /^[A-G][b#]?(m|o)?$/;
const tracks = MUSIC_TRACKS as Record<
  string,
  { bpm: number; lead: string; chords: string; melody: string[]; bass: string; drums: string }
>;

describe('musica', () => {
  it('ogni brano è scritto bene: 8 battute, accordi e note validi', () => {
    const all = [
      ...Object.entries(tracks),
      ...Object.entries(MUSIC_VARIANTS).flatMap(([theme, list]) =>
        list.map((tr, i) => [`${theme} ${i + 2}`, tr] as [string, (typeof tracks)[string]]),
      ),
    ];
    for (const [name, tr] of all) {
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

  it('ogni tema ha più brani, e il cambio non ripete mai lo stesso', () => {
    // ogni tema ha almeno 3 brani; salone, cortile e stanza, dove si sta di più, almeno 4. Il
    // cimitero no: lì resta un brano solo, sempre lo stesso
    expect(MUSIC_VARIANTS.grave).toBeUndefined();
    for (const theme of Object.keys(tracks).filter((t) => t !== 'grave'))
      expect(MUSIC_VARIANTS[theme]?.length, theme).toBeGreaterThanOrEqual(
        ['home', 'courtyard', 'room'].includes(theme) ? 3 : 2,
      );
    for (const t of Object.keys(MUSIC_VARIANTS)) expect(tracks[t], t).toBeDefined();
    for (let count = 1; count <= 4; count++)
      for (let cur = 0; cur < count; cur++)
        for (const rnd of [0, 0.2, 0.5, 0.8, 0.999]) {
          const next = nextVariant(count, cur, rnd);
          expect(next).toBeGreaterThanOrEqual(0);
          expect(next).toBeLessThan(count);
          if (count > 1) expect(next).not.toBe(cur);
          const first = firstVariant(count, rnd);
          expect(first).toBeGreaterThanOrEqual(0);
          expect(first).toBeLessThan(count);
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
    // alla festa del condominio, in cortile si balla (solo lì)
    expect(musicFor('CORTILE', true)).toBe('party');
    expect(musicFor('bar', true)).toBe('bar');
    expect(new Set(Object.keys(ENV_STYLE).map((e) => musicFor(e))).size).toBeGreaterThanOrEqual(12);
  });
});
