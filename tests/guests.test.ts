import { describe, expect, it } from 'vitest';
import { GUEST_KEEP_MS, cleanupGuests, guestAccounts, guestGone } from '../server/src/guests.js';
import { decodeAccountBinding } from '../src/game/account-model.js';
import { WORLD_PARAM, inviteLink } from '../src/game/invite-rules.js';
import { localDatabase } from '../src/game/database.js';
import { Lifetime } from '../src/game/lifetime.js';
import { MemoryStorage } from './helpers.js';

const NOW = 1_800_000_000_000;
const D = 24 * 3600000;

describe('ospiti: il segno nell’account', () => {
  it('il segno "guest" si legge solo se è un numero', () => {
    expect(decodeAccountBinding({ playerId: 'player_abc123', guest: NOW })).toEqual({
      playerId: 'player_abc123',
      guest: NOW,
    });
    expect(decodeAccountBinding({ playerId: 'player_abc123', guest: 'sì' })).toEqual({
      playerId: 'player_abc123',
    });
    expect(decodeAccountBinding({ playerId: 'player_abc123' })).toEqual({
      playerId: 'player_abc123',
    });
  });

  it('il link d’invito porta anche il condominio', () => {
    const link = inviteLink('player_abc123', 'CASA-X92K');
    expect(link).toContain('invito=player_abc123');
    expect(new URL(link).searchParams.get(WORLD_PARAM)).toBe('CASA-X92K');
    // senza condominio resta quello di prima
    expect(inviteLink('player_abc123')).not.toContain(WORLD_PARAM);
  });
});

describe('ospiti: la pulizia sul server', () => {
  it('trova solo gli account con il segno', () => {
    expect(
      guestAccounts({
        g1: { playerId: 'player_g1', guest: NOW },
        u1: { playerId: 'player_u1' },
        'bad/uid': { playerId: 'player_x', guest: NOW },
      }),
    ).toEqual([{ uid: 'g1', playerId: 'player_g1', since: NOW }]);
  });

  it('sparito dopo 7 giorni senza entrare (conta l’ultimo salvataggio)', () => {
    const guest = { uid: 'g1', playerId: 'player_g1', since: NOW };
    expect(guestGone(guest, null, NOW + GUEST_KEEP_MS)).toBe(false);
    expect(guestGone(guest, null, NOW + GUEST_KEEP_MS + 1)).toBe(true);
    // ha giocato ieri: resta
    expect(guestGone(guest, NOW + 7 * D, NOW + 8 * D)).toBe(false);
  });

  it('cancella gli ospiti spariti, non chi ha salvato né chi gioca ancora', async () => {
    const database = localDatabase(new Lifetime(), new MemoryStorage());
    const old = NOW - 10 * D;
    await database.ref('/').update({
      'sims_accounts/gone': { playerId: 'player_gone', guest: old },
      'sims_accounts/linked': { playerId: 'player_linked', guest: old },
      'sims_accounts/active': { playerId: 'player_active', guest: old },
      'sims_accounts/full': { playerId: 'player_full' },
      'sims_saves/player_gone': { savedAt: old, moneyLevel: 30 },
      'sims_saves/player_linked': { savedAt: old, moneyLevel: 30 },
      'sims_saves/player_active': { savedAt: NOW - D, moneyLevel: 30 },
      'sims_saves/player_full': { savedAt: old, moneyLevel: 30 },
    });
    const logins: string[] = [];
    const deleted = await cleanupGuests(
      database,
      NOW,
      // "linked" ha collegato Google mentre il segno era ancora lì: non si tocca
      async (uid) => uid !== 'linked',
      async (uid) => void logins.push(uid),
    );
    expect(deleted).toBe(1);
    expect(logins).toEqual(['gone']);
    expect((await database.ref('sims_accounts/gone').get()).exists()).toBe(false);
    expect((await database.ref('sims_saves/player_gone').get()).exists()).toBe(false);
    for (const uid of ['linked', 'active', 'full'])
      expect((await database.ref('sims_accounts/' + uid).get()).exists()).toBe(true);
  });
});
