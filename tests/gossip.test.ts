import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import { ENV_DECOR } from '../src/game/data/catalogues';
import {
  GOSSIP_MAX_TEXT,
  decodeGossip,
  gossipKey,
  isAbout,
  isRepeat,
  timeAgo,
} from '../src/game/gossip-rules';

describe('bacheca dei pettegolezzi', () => {
  it('sta nel cortile accanto alla bacheca immobiliare', () => {
    const decor = ENV_DECOR.CORTILE as { kind: string; x: number; y: number }[];
    const gossip = decor.find((d) => d.kind === 'gossipBoard')!;
    const realty = decor.find((d) => d.kind === 'realtyBoard')!;
    expect(gossip).toBeDefined();
    expect(Math.hypot(gossip.x - realty.x, gossip.y - realty.y)).toBeLessThan(90);
  });

  it('legge i fatti scartando quelli non validi', () => {
    const ok = { by: 'player_abc123', text: 'Anna e Luca si sono baciati 💋', t: 5 };
    expect(decodeGossip(ok)).toEqual(ok);
    expect(decodeGossip({ ...ok, about: 'player_luca' })?.about).toBe('player_luca');
    expect(decodeGossip({ ...ok, by: 'hacker' })).toBeNull();
    expect(decodeGossip({ ...ok, text: '   ' })).toBeNull();
    expect(decodeGossip({ ...ok, t: -1 })).toBeNull();
    expect(decodeGossip(null)).toBeNull();
    expect(decodeGossip({ ...ok, text: 'x'.repeat(500) })?.text.length).toBe(GOSSIP_MAX_TEXT);
  });

  it('riconosce i fatti che parlano di un giocatore', () => {
    const e = { by: 'player_a', text: 'x', t: 1, about: 'player_b,player_c' };
    expect(isAbout(e, 'player_b')).toBe(true);
    expect(isAbout(e, 'player_c')).toBe(true);
    expect(isAbout(e, 'player_a')).toBe(false);
    expect(isAbout({ by: 'player_a', text: 'x', t: 1 }, 'player_b')).toBe(false);
  });

  it('dice da quanto tempo è successo', () => {
    const now = 10 * 86400000;
    expect(timeAgo(now - 10_000, now)).toBe('adesso');
    expect(timeAgo(now - 5 * 60000, now)).toBe('5 minuti fa');
    expect(timeAgo(now - 3 * 3600000, now)).toBe('3 ore fa');
    expect(timeAgo(now - 30 * 3600000, now)).toBe('ieri');
    expect(timeAgo(now - 4 * 86400000, now)).toBe('4 giorni fa');
  });

  it('le chiavi sono in ordine di tempo; lo stesso fatto non si ripete subito', () => {
    expect(gossipKey(1000, 'aaaa') < gossipKey(2000, 'zzzz')).toBe(true);
    const recent = { 'Marco ha preso a pugni Luca': 1000 };
    expect(isRepeat(recent, 'Marco ha preso a pugni Luca', 2000, 60_000)).toBe(true);
    expect(isRepeat(recent, 'Marco ha preso a pugni Luca', 100_000, 60_000)).toBe(false);
    expect(isRepeat(recent, 'altro', 2000, 60_000)).toBe(false);
  });

  it('il database accetta solo fatti scritti a proprio nome, senza cancellare quelli degli altri', () => {
    const rules = JSON.parse(fs.readFileSync('firebase/database.rules.proposed.json', 'utf8')).rules
      .sims_gossip;
    expect(rules.$key['.write']).toContain('!data.exists()');
    expect(rules.$key['.write']).toContain(
      "newData.child('by').val() === root.child('sims_accounts')",
    );
    expect(rules.$key.text['.validate']).toContain(`<= ${GOSSIP_MAX_TEXT}`);
    expect(rules.$key.$other['.validate']).toBe(false);
  });
});
