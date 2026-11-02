import { describe, expect, it } from 'vitest';
import { googlePlayerId, onlineSaveKey, decodeAccountBinding } from '../src/game/account-model.js';

describe('Google character identity', () => {
  it('uses a different player and local save for each Google identity', () => {
    expect(googlePlayerId('GoogleUser_A')).not.toBe(googlePlayerId('GoogleUser_B'));
    expect(onlineSaveKey(googlePlayerId('GoogleUser_A'))).not.toBe(
      onlineSaveKey(googlePlayerId('GoogleUser_B')),
    );
  });
  it('accepts approved legacy IDs and rejects malformed bindings', () => {
    expect(decodeAccountBinding({ playerId: 'player_legacy123' })).toEqual({
      playerId: 'player_legacy123',
    });
    for (const value of [null, {}, { playerId: 1 }, { playerId: 'someone/else' }])
      expect(decodeAccountBinding(value)).toBeNull();
    expect(() => googlePlayerId('bad/uid')).toThrow();
  });
});
