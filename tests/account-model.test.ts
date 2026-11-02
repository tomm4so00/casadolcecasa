import fs from 'node:fs';
import { describe, expect, it } from 'vitest';
import {
  decodeAccountBinding,
  googlePlayerId,
  onlineSaveKey,
  rebirthNameError,
  rebirthPlayerId,
} from '../src/game/account-model.js';

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

describe('ricominciare dopo la morte', () => {
  it('il nuovo personaggio ha un codice nuovo, legato allo stesso account', () => {
    const id = rebirthPlayerId('abcDEF123', 1_800_000_000_000);
    expect(id.startsWith('player_abcDEF123_r')).toBe(true);
    expect(id).toMatch(/^player_[A-Za-z0-9_-]+_r[a-z0-9]{6,12}$/);
    expect(decodeAccountBinding({ playerId: id })).toEqual({ playerId: id });
    expect(rebirthPlayerId('abcDEF123', 1_800_000_000_001)).not.toBe(id);
  });

  it('il nome deve essere diverso da quello del personaggio morto', () => {
    expect(rebirthNameError('Luca', 'Mario')).toBeNull();
    expect(rebirthNameError(' mario ', 'Mario')).toMatch(/diverso da Mario/);
    expect(rebirthNameError('   ', 'Mario')).toMatch(/Scrivi/);
    expect(rebirthNameError('x'.repeat(21), 'Mario')).toMatch(/20 caratteri/);
  });

  it('le regole permettono di cambiare codice solo se il personaggio è morto', () => {
    const rules = JSON.parse(
      fs.readFileSync('firebase/database.rules.proposed.json', 'utf8'),
    ).rules;
    const write = rules.sims_accounts.$uid['.write'];
    expect(write).toContain("child('dead').val() === true");
    expect(write).toContain("beginsWith('player_' + auth.uid + '_r')");
    expect(write).toContain(
      "!root.child('sims_saves').child(newData.child('playerId').val()).exists()",
    );
  });
});
