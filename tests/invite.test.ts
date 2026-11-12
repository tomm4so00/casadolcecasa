import fs from 'node:fs';
import { describe, expect, it } from 'vitest';
import {
  INVITE_MAX_PAID,
  INVITE_TTL_MS,
  canClaimInvite,
  decodeOwedBonuses,
  decodePendingInvite,
  inviteLink,
  inviteMessage,
  invitesToPay,
  parseInviteCode,
} from '../src/game/invite-rules.js';

describe('inviti', () => {
  it('il link porta il codice di chi invita; in modalità prova è il link nudo', () => {
    expect(inviteLink('player_abc123')).toBe('https://casadolcecasa.web.app/?invito=player_abc123');
    expect(inviteLink(null)).toBe('https://casadolcecasa.web.app/');
    expect(parseInviteCode('player_<script>')).toBeNull();
    expect(parseInviteCode('qualcosa')).toBeNull();
    expect(inviteMessage('Anna')).toContain('Sono «Anna»');
    expect(inviteMessage('Anna')).toContain('riceviamo 300Đ a testa');
    // il link personale sta dentro il testo del messaggio
    const link = inviteLink('player_abc123');
    expect(inviteMessage('Anna', link).endsWith('\n' + link)).toBe(true);
    expect(inviteMessage('Anna', link)).toContain('?invito=player_abc123');
  });

  it("l'invito ricordato scade dopo una settimana", () => {
    const now = 1_000_000_000_000;
    expect(decodePendingInvite({ by: 'player_abcd', t: now - 1000 }, now)).toEqual({
      by: 'player_abcd',
      t: now - 1000,
    });
    expect(decodePendingInvite({ by: 'player_abcd', t: now - INVITE_TTL_MS - 1 }, now)).toBeNull();
    expect(decodePendingInvite({ by: 'boh', t: now }, now)).toBeNull();
    expect(decodePendingInvite(null, now)).toBeNull();
  });

  it('il bonus da invitato spetta solo al primo personaggio di un account nuovo', () => {
    const base = {
      firstCharacter: true,
      myPlayerId: 'player_nuovo',
      accountPlayerId: 'player_nuovo',
      inviter: 'player_amico',
      deviceAlreadyClaimed: false,
    };
    expect(canClaimInvite(base)).toBe(true);
    expect(canClaimInvite({ ...base, firstCharacter: false })).toBe(false); // gioca già
    expect(canClaimInvite({ ...base, myPlayerId: 'player_nuovo_r1' })).toBe(false); // rinato
    expect(canClaimInvite({ ...base, inviter: 'player_nuovo' })).toBe(false); // se stesso
    expect(canClaimInvite({ ...base, deviceAlreadyClaimed: true })).toBe(false);
  });

  it('chi invita ritira al massimo 10 bonus', () => {
    expect(invitesToPay({ a: {}, b: { paid: true }, c: {} })).toEqual(['a', 'c']);
    const many: Record<string, { paid?: boolean }> = {};
    for (let i = 0; i < 15; i++)
      many['u' + String(i).padStart(2, '0')] = i < 8 ? { paid: true } : {};
    expect(invitesToPay(many)).toHaveLength(INVITE_MAX_PAID - 8);
    expect(invitesToPay(null)).toEqual([]);
  });

  it('le regole del database: un invito per account, e il bonus si ritira una volta', () => {
    const r = JSON.parse(fs.readFileSync('firebase/database.rules.proposed.json', 'utf8')).rules;
    const invited = r.sims_invited.$uid;
    expect(invited['.write']).toContain('auth.uid === $uid && !data.exists()');
    expect(invited['.validate']).toContain(
      "child('sims_invites').child(newData.val()).child($uid)",
    );
    const entry = r.sims_invites.$pid.$uid;
    expect(entry['.write']).toContain('auth.uid === $uid && !data.exists()');
    expect(entry['.validate']).toContain("child('sims_invited').child($uid).val() === $pid");
    expect(entry.paid['.write']).toContain('!data.exists()');
    expect(entry.paid['.validate']).toBe('newData.val() === true');
    expect(entry.$other['.validate']).toBe(false);
  });

  it('i bonus da versare ricordati sul dispositivo si leggono con prudenza', () => {
    expect(decodeOwedBonuses(['a', 'b'])).toEqual(['a', 'b']);
    expect(decodeOwedBonuses(['a', 3, '', null])).toEqual(['a']);
    expect(decodeOwedBonuses('a')).toEqual([]);
    expect(decodeOwedBonuses(null)).toEqual([]);
    expect(decodeOwedBonuses(Array(50).fill('x'))).toHaveLength(INVITE_MAX_PAID + 1);
  });
});
