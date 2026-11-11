// I messaggi tra giocatori (sims_interactions) passano solo se il loro tipo è nell'elenco delle
// regole del database. In modalità prova le regole non ci sono: un tipo dimenticato funziona lì e
// si rompe solo online (è successo con le proposte di scambio dello zaino).
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const rules = JSON.parse(readFileSync('firebase/database.rules.proposed.json', 'utf8')).rules;
const validate: string = rules.sims_interactions.$pid.$key['.validate'];
const allowed = validate.slice(validate.indexOf('/^(') + 3, validate.indexOf(')$/')).split('|');

function sentTypes(dir: string, out = new Set<string>()): Set<string> {
  for (const name of readdirSync(dir)) {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) sentTypes(path, out);
    else if (path.endsWith('.ts'))
      for (const m of readFileSync(path, 'utf8').matchAll(
        /(?:sendSocial|send)\([^;]*?\{\s*type:\s*'([a-zA-Z]+)'/gs,
      ))
        out.add(m[1]);
  }
  return out;
}

describe('messaggi tra giocatori', () => {
  it('ogni tipo mandato dal gioco è permesso dalle regole', () => {
    const sent = [...sentTypes('src/game')];
    expect(sent.length).toBeGreaterThan(10);
    expect(sent.filter((t) => !allowed.includes(t))).toEqual([]);
  });
});
