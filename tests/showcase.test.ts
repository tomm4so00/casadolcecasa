import { describe, expect, it } from 'vitest';
import { countPills, sceneFor } from '../src/game/showcase-rules';

describe('vetrina della prima schermata', () => {
  it("sceglie l'immagine secondo l'ora di Roma", () => {
    expect(sceneFor(6)).toBe('notte');
    expect(sceneFor(7)).toBe('giorno');
    expect(sceneFor(16)).toBe('giorno');
    expect(sceneFor(17)).toBe('tramonto');
    expect(sceneFor(19)).toBe('tramonto');
    expect(sceneFor(20)).toBe('notte');
    expect(sceneFor(0)).toBe('notte');
  });

  const texts = (d: Record<string, unknown>) =>
    countPills(d).map((p) => (p.live ? '● ' : p.icon + ' ') + p.text);

  it('con tanti online li conta, con pochi dice "qualcuno"', () => {
    expect(texts({ n: 12, vivi: 40, liberi: 9 })).toEqual([
      '● 12 vicini online adesso',
      '🏠 40 vivono qui',
    ]);
    expect(texts({ n: 2, vivi: 40, liberi: 9 })).toEqual([
      '● Qualcuno è in cortile adesso',
      '🏠 40 vivono qui',
    ]);
    expect(texts({ n: 1, vivi: 1 })).toEqual(['● Qualcuno è in cortile adesso', '🏠 1 vive qui']);
  });

  it('senza nessuno online parla di chi ci vive e delle stanze libere, senza pallino', () => {
    expect(texts({ n: 0, vivi: 15, liberi: 49 })).toEqual([
      '🏠 15 vicini vivono qui',
      '🔑 49 stanze libere',
    ]);
    expect(texts({ n: 0, vivi: 1, liberi: 1 })).toEqual([
      '🏠 1 vicino vive qui',
      '🔑 1 stanza libera',
    ]);
    expect(texts({ n: 0, vivi: 0, liberi: 0 })).toEqual([]);
  });

  it('se il Worker non sa i numeri non dice niente', () => {
    expect(texts({ n: null, vivi: null, liberi: null })).toEqual([]);
    expect(texts({})).toEqual([]);
    // un Worker vecchio, senza le stanze libere
    expect(texts({ n: 0, vivi: 15 })).toEqual(['🏠 15 vicini vivono qui']);
  });
});
