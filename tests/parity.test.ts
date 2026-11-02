import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import manifest from '../src/game/source-manifest.json';

describe('copertura della versione originale più recente', () => {
  it('identifica esattamente la base v8 di casadolcecasa4', () => {
    expect(manifest.repository).toBe('tomm4so00/casadolcecasa4');
    expect(manifest.commit).toBe('8f15c85353196c899edd41770e953900cb0d081d');
    expect(manifest.version).toBe(8);
    expect(manifest.functions.length + manifest.replacements.length).toBe(304);
  });
  it('mantiene le funzioni originali e documenta le sostituzioni condivise', () => {
    for (const replacement of manifest.replacements)
      expect(fs.existsSync(replacement.module)).toBe(true);
    for (const fn of manifest.functions) {
      const module = fn.module === 'local-database' ? 'runtime' : fn.module;
      const source = fs.readFileSync(path.join('src/game', module + '.ts'), 'utf8');
      expect(source, fn.name).toMatch(new RegExp('export (?:async )?function ' + fn.name + '\\b'));
    }
  });
});
