import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import {
  CREATE_EVERY_MS,
  WORLD_NODES as RULE_NODES,
  withWorldRules,
} from '../firebase/world-rules.mjs';
import { WORLD_CREATE_EVERY_MS, WORLD_NODES } from '../shared/worlds';

const proposed = JSON.parse(readFileSync('firebase/database.rules.proposed.json', 'utf8'));

describe('regole dei mondi', () => {
  it('il file delle regole è aggiornato (node firebase/world-rules.mjs)', () => {
    expect(withWorldRules(proposed)).toEqual(proposed);
  });

  it('nodi dei mondi e limite di creazione sono gli stessi nel gioco e nelle regole', () => {
    expect(RULE_NODES).toEqual([...WORLD_NODES]);
    expect(CREATE_EVERY_MS).toBe(WORLD_CREATE_EVERY_MS);
  });

  it('dentro un mondo nuovo nessuna regola guarda i nodi del mondo di sempre', () => {
    const text = JSON.stringify(proposed.rules.worlds);
    for (const node of WORLD_NODES) expect(text).not.toContain(`sims_${node}'`);
    // gli account restano quelli di tutti
    expect(text).toContain("root.child('sims_accounts')");
  });
});
