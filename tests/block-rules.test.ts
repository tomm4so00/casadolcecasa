import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import {
  PASS_THROUGH_BLOCK,
  REPORT_REASONS,
  chatProof,
  decodeBlocks,
  passesBlock,
} from '../shared/block-rules';

const rules = readFileSync(
  new URL('../firebase/database.rules.proposed.json', import.meta.url),
  'utf8',
);

describe('blocco e segnalazione', () => {
  it('chi è bloccato manda solo avvisi e risposte, non contatti nuovi', () => {
    for (const t of ['theft', 'artSold', 'colDone', 'engageNo', 'cheat', 'money_notice'])
      expect(passesBlock(t)).toBe(true);
    for (const t of ['talk', 'praise', 'insult', 'punch', 'kissAsk', 'romance', 'engageAsk'])
      expect(passesBlock(t)).toBe(false);
    for (const t of ['artOffer', 'colOffer', 'ltdOffer', 'weedOffer', 'inventoryOffer'])
      expect(passesBlock(t)).toBe(false);
    expect(passesBlock(undefined)).toBe(false);
  });

  it('le regole del database usano gli stessi elenchi', () => {
    expect(rules).toContain(`matches(/^(${PASS_THROUGH_BLOCK.join('|')})$/)`);
    expect(rules).toContain(`matches(/^(${REPORT_REASONS.map((r) => r.id).join('|')})$/)`);
  });

  it('legge la lista dei bloccati anche con dati strani', () => {
    expect(decodeBlocks({ p1: { name: 'Anna', t: 5 }, p2: 'x', p3: { t: 'no' } })).toEqual({
      p1: { name: 'Anna', t: 5 },
      p3: { name: 'Giocatore', t: 0 },
    });
    expect(decodeBlocks(null)).toEqual({});
  });

  it('la prova: gli ultimi messaggi del segnalato, in ordine, così come scritti', () => {
    const chat: Record<string, unknown> = {};
    for (let i = 0; i < 14; i++)
      chat[`k${String(i).padStart(2, '0')}`] = { id: i % 2 ? 'p1' : 'p2', text: `m${i}`, t: i };
    chat.zz = { id: 'p1', text: 'x'.repeat(300), t: 99 };
    chat.bad = { id: 'p1', text: 5, t: 1 };
    const proof = chatProof(chat, 'p1', 3);
    expect(proof.map((m) => m.t)).toEqual([11, 13, 99]);
    expect(proof[2].text).toHaveLength(200);
    expect(chatProof(null, 'p1')).toEqual([]);
  });
});
