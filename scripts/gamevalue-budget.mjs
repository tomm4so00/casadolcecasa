// Quanti GameValue (cioè `any`) restano in ogni file del gioco. Il test
// tests/gamevalue-budget.test.ts confronta il conto con i tetti in tests/gamevalue-budget.json:
// il numero può solo scendere.
//   npm run gamevalue:budget   → abbassa i tetti al conto di adesso (non li alza mai)
import { readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import { join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
export const BUDGET_FILE = join(ROOT, 'tests/gamevalue-budget.json');

/** I GameValue di ogni file .ts in src/ (solo i file che ne hanno). */
export function countGameValue(root = ROOT) {
  const counts = {};
  const walk = (dir) => {
    for (const name of readdirSync(dir)) {
      const path = join(dir, name);
      if (statSync(path).isDirectory()) walk(path);
      else if (name.endsWith('.ts')) {
        const n = (readFileSync(path, 'utf8').match(/\bGameValue\b/g) || []).length;
        if (n) counts[relative(root, path).replace(/\\/g, '/')] = n;
      }
    }
  };
  walk(join(root, 'src'));
  return Object.fromEntries(Object.entries(counts).sort(([a], [b]) => a.localeCompare(b)));
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const now = countGameValue();
  let old = null;
  try {
    old = JSON.parse(readFileSync(BUDGET_FILE, 'utf8')).files;
  } catch {
    /* la prima volta non c'è ancora */
  }
  const higher = old ? Object.entries(now).filter(([file, n]) => n > (old[file] ?? 0)) : [];
  if (higher.length) {
    for (const [file, n] of higher)
      console.log(
        `❌ ${file}: ${n} GameValue, il tetto è ${old[file] ?? 0}. Il numero può solo scendere.`,
      );
    process.exitCode = 1;
  } else {
    const total = Object.values(now).reduce((a, b) => a + b, 0);
    writeFileSync(BUDGET_FILE, JSON.stringify({ total, files: now }, null, 2) + '\n');
    console.log(`✅ Tetti aggiornati: ${total} GameValue in ${Object.keys(now).length} file.`);
  }
}
