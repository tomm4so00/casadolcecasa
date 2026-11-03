import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import { PAINT_CELLS } from '../src/game/painting-rules';
import {
  TITLE_MAX,
  cleanTitle,
  decodeTitle,
  paintingId,
  quoted,
  titleError,
} from '../src/game/painting-title-rules';

const paint = (c: string) => c.repeat(PAINT_CELLS);

describe('titoli dei quadri', () => {
  it('lo stesso disegno ha sempre la stessa impronta, disegni diversi impronte diverse', () => {
    const a = paint('3'),
      b = paint('4');
    expect(paintingId(a)).toBe(paintingId(a));
    expect(paintingId(a)).not.toBe(paintingId(b));
    // basta un quadretto diverso
    const c = '5' + a.slice(1);
    expect(paintingId(c)).not.toBe(paintingId(a));
    expect(paintingId(a)).toMatch(/^q[0-9a-z]{2,20}$/);
  });

  it('il titolo si pulisce e ha un limite di lunghezza', () => {
    expect(cleanTitle('  Tramonto   sul  mare ')).toBe('Tramonto sul mare');
    expect(titleError('   ')).not.toBeNull();
    expect(titleError('x'.repeat(TITLE_MAX + 1))).not.toBeNull();
    expect(titleError('Notte stellata')).toBeNull();
    expect(quoted('Notte stellata')).toBe('«Notte stellata»');
    expect(quoted(null)).toBe('');
  });

  it('dal database si leggono solo titoli validi', () => {
    expect(decodeTitle({ title: ' Ciao ', by: 'player_a', t: 3 })).toEqual({
      title: 'Ciao',
      by: 'player_a',
      t: 3,
    });
    expect(decodeTitle({ title: '', by: 'player_a' })).toBeNull();
    expect(decodeTitle({ title: 'x', by: 4 })).toBeNull();
    expect(decodeTitle(null)).toBeNull();
  });

  it('il database lascia cambiare il titolo solo a chi l’ha dato', () => {
    const r = JSON.parse(fs.readFileSync('firebase/database.rules.proposed.json', 'utf8')).rules
      .sims_painting_titles.$id;
    expect(r['.write']).toContain("(!data.exists() || data.child('by').val() === root");
    expect(r.title['.validate']).toContain(`<= ${TITLE_MAX}`);
    expect(r.$other['.validate']).toBe(false);
  });
});
