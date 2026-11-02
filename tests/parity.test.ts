import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import manifest from '../src/game/source-manifest.json';

describe('copertura della versione originale più recente', () => {
  it('identifica esattamente la base v8 di casadolcecasa4', () => {
    expect(manifest.repository).toBe('tomm4so00/casadolcecasa4');
    expect(manifest.commit).toBe('8f15c85353196c899edd41770e953900cb0d081d');
    expect(manifest.version).toBe(8);
    expect(manifest.functions).toHaveLength(304);
  });
  it('mantiene tutte le funzioni del file originale nei moduli dedicati', () => {
    for (const fn of manifest.functions) {
      const module = fn.module === 'local-database' ? 'runtime' : fn.module;
      const source = fs.readFileSync(path.join('src/game', module + '.ts'), 'utf8');
      expect(source, fn.name).toMatch(new RegExp('export (?:async )?function ' + fn.name + '\\b'));
    }
  });
});
