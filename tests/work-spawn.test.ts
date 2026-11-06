import { describe, expect, it } from 'vitest';
import { hiddenBehind } from '../src/game/work-spawn-rules';

// un archivio alto 90 al centro
const archive = { x: 0, y: 0, w: 36, h: 50, z: 90 };

describe('oggetti dei lavori che non restano nascosti', () => {
  it('subito dietro un mobile alto l’oggetto non si vede', () => {
    expect(hiddenBehind(-30, -40, [archive])).toBe(true);
  });

  it('davanti al mobile o lontano di lato si vede', () => {
    expect(hiddenBehind(30, 50, [archive])).toBe(false);
    expect(hiddenBehind(-150, 150, [archive])).toBe(false);
  });

  it('i mobili bassi non coprono niente', () => {
    expect(hiddenBehind(-30, -40, [{ ...archive, z: 12 }])).toBe(false);
  });
});
