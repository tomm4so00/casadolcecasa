import { describe, expect, it } from 'vitest';
import { decodePrefs } from '../src/game/prefs-rules.js';

describe('preferenze che viaggiano con il salvataggio', () => {
  it('tiene i valori del tipo giusto', () => {
    const p = {
      sound: false,
      music: true,
      notify: true,
      hudFull: true,
      gossipRead: 1_800_000_000_000,
      eventSeen: 'crollo-123',
      lastSpot: '{"env":"bar","x":1,"y":2}',
    };
    expect(decodePrefs(p)).toEqual(p);
  });

  it('scarta quello che non va, senza rompere niente', () => {
    expect(decodePrefs(null)).toEqual({});
    expect(decodePrefs('ciao')).toEqual({});
    expect(
      decodePrefs({
        sound: 'off',
        gossipRead: -1,
        eventSeen: 5,
        lastSpot: 'x'.repeat(401),
        altro: 1,
      }),
    ).toEqual({});
  });
});
