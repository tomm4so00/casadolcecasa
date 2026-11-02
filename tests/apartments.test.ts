import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import { COURTYARD_DOORS } from '../src/game/data/catalogues';

const ROOMS_PER_APT = 8;
const rules = JSON.parse(fs.readFileSync('firebase/database.rules.proposed.json', 'utf8')).rules
  .sims_rooms_state;

describe('appartamenti del cortile e regole del database', () => {
  const apts = Object.values(COURTYARD_DOORS).map((d) => d.aptIdx);
  const total = apts.length * ROOMS_PER_APT;

  it('ha una porta per ogni appartamento, numerate di seguito', () => {
    expect(apts).toEqual(apts.map((_, i) => i));
    expect(apts).toHaveLength(8);
  });

  it('le regole accettano tutte le stanze e pretendono la lista intera', () => {
    expect(rules.$room.id['.validate']).toContain(`newData.val() <= ${total}`);
    const required = /hasChildren\(\[([^\]]*)\]\)/.exec(rules['.validate'])![1].split(',');
    // chi riscrive la lista con meno stanze (una versione vecchia del gioco) viene rifiutato
    expect(required).toEqual(Array.from({ length: total }, (_, i) => `'${i}'`));
  });
});
