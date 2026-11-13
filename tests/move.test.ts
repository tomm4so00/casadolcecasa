import { describe, expect, it } from 'vitest';
import {
  MOVE_MAX_AGE_MS,
  movableStorage,
  moveUrl,
  readMove,
  type MovePayload,
} from '../src/game/move-rules';

const NOW = Date.UTC(2026, 10, 12, 15);
const KEY = 'AIzaChiaveVera';
const user = { uid: 'abc', apiKey: KEY, isAnonymous: true, stsTokenManager: { refreshToken: 'r' } };
const payload: MovePayload = {
  v: 1,
  t: NOW,
  user,
  session: false,
  ls: { sims_sound: '1', sims_player_nick: 'Tommaso è qui' },
};
const hashOf = (url: string) => new URL(url).hash;

describe('trasloco al nuovo indirizzo', () => {
  it('porta accesso e memoria nel pezzo dopo #, e tiene gli inviti', () => {
    const url = moveUrl('https://casadolcecasa.web.app/', '?invito=ABC', payload);
    expect(url.startsWith('https://casadolcecasa.web.app/?invito=ABC#trasloco=')).toBe(true);
    expect(readMove(hashOf(url), NOW + 5000, KEY)).toEqual(payload);
  });

  it('dice se il trasloco parte dalla vecchia app installata', () => {
    const fromApp = moveUrl('https://casadolcecasa.web.app/', '', { ...payload, app: true });
    expect(readMove(hashOf(fromApp), NOW, KEY)?.app).toBe(true);
    const fromBrowser = moveUrl('https://casadolcecasa.web.app/', '', payload);
    expect(readMove(hashOf(fromBrowser), NOW, KEY)?.app).toBeUndefined();
  });

  it('rifiuta i link vecchi, quelli di un altro progetto e quelli rovinati', () => {
    const url = moveUrl('https://casadolcecasa.web.app/', '', payload);
    expect(readMove(hashOf(url), NOW + MOVE_MAX_AGE_MS + 1, KEY)).toBeNull();
    // dal gioco di prova a quello vero: la memoria sì, l'accesso no
    expect(readMove(hashOf(url), NOW, 'AIzaAltraChiave')?.user).toBeUndefined();
    expect(readMove('#trasloco=%%%', NOW, KEY)).toBeNull();
    expect(readMove('#altro=1', NOW, KEY)).toBeNull();
  });

  it('non porta le voci di Firebase, i salvataggi e i valori enormi', () => {
    expect(
      movableStorage([
        ['firebase:authUser:x:[DEFAULT]', '{}'],
        ['p_sims_save_v1', '{"tanto":1}'],
        ['sims_big', 'x'.repeat(5000)],
        ['sims_sound', '0'],
      ]),
    ).toEqual({ sims_sound: '0' });
  });
});
