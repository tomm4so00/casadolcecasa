import { describe, expect, it } from 'vitest';
import { aliveText, onlineText, sceneFor } from '../src/game/showcase-rules';

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

  it('dice quanti vicini sono online, anche uno solo', () => {
    expect(onlineText(1)).toBe('1 vicino online adesso');
    expect(onlineText(12)).toBe('12 vicini online adesso');
    expect(onlineText(0)).toBe('0 vicini online adesso');
    expect(aliveText(1)).toBe('1 vicino vivo');
    expect(aliveText(14)).toBe('14 vicini vivi');
  });
});
