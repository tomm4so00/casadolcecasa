import { readFileSync, writeFileSync, realpathSync } from 'node:fs';
import { resolve } from 'node:path';
import { prepareMarketRules } from '../../shared/market-rules.js';

const [input, output] = process.argv.slice(2);
if (!input || !output)
  throw new Error('Usage: node prepare-market-rules.js existing.rules.json proposed.rules.json');
if (realpathSync(input) === resolve(output))
  throw new Error('Choose a separate output file to preserve the original rules');
writeFileSync(
  output,
  JSON.stringify(prepareMarketRules(JSON.parse(readFileSync(input, 'utf8'))), null, 2) + '\n',
  { flag: 'wx' },
);
console.log('Rules proposal written. Review before publishing; no database was modified.');
