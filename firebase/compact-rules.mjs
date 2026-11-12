// Le regole si pubblicano compattate: Firebase ne accetta al massimo 256 KB e spazi e rientri ne
// occupano un quinto. Nella repo il file resta leggibile; qui si tolgono solo gli spazi, mai il
// significato: niente rientri del JSON e niente spazi intorno agli operatori delle espressioni,
// fuori dalle stringhe ('…', "…") e dalle espressioni regolari di matches(/…/).
//   node firebase/compact-rules.mjs   → stampa quanto pesano le regole, prima e dopo
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

/** Il limite di Firebase per le regole del Realtime Database. */
export const RULES_LIMIT = 256 * 1024;

/** Operatori intorno ai quali lo spazio non serve (i più lunghi prima). */
const OPERATORS = ['===', '!==', '==', '!=', '&&', '||', '>=', '<=', '>', '<', ','];

/** I pezzi di un'espressione: testo libero, stringhe ed espressioni regolari (intoccabili). */
function pieces(expr) {
  const out = [];
  let free = '';
  let i = 0;
  while (i < expr.length) {
    const c = expr[i];
    let end = -1;
    if (c === "'" || c === '"') {
      end = i + 1;
      while (end < expr.length && expr[end] !== c) end += expr[end] === '\\' ? 2 : 1;
    } else if (c === '/' && /matches\(\s*$/.test(expr.slice(0, i))) {
      end = i + 1;
      while (end < expr.length && expr[end] !== '/') end += expr[end] === '\\' ? 2 : 1;
    }
    if (end < 0) {
      free += c;
      i++;
      continue;
    }
    if (end >= expr.length) throw new Error(`Stringa non chiusa nella regola: ${expr}`);
    out.push({ free }, { literal: expr.slice(i, end + 1) });
    free = '';
    i = end + 1;
  }
  out.push({ free });
  return out;
}

/** Un'espressione senza gli spazi inutili. */
export function compactExpression(expr) {
  return pieces(expr)
    .map((p) => {
      if ('literal' in p) return p.literal;
      let s = p.free.replace(/\s+/g, ' ');
      for (const op of OPERATORS) s = s.split(` ${op}`).join(op).split(`${op} `).join(op);
      return s.replace(/\( /g, '(').replace(/ \)/g, ')');
    })
    .join('')
    .trim();
}

/** Le stesse regole, compattate: oggetto JSON con le espressioni senza spazi inutili. */
export function compactRules(text) {
  const walk = (v) =>
    typeof v === 'string'
      ? compactExpression(v)
      : Array.isArray(v)
        ? v.map(walk)
        : v && typeof v === 'object'
          ? Object.fromEntries(Object.entries(v).map(([k, x]) => [k, walk(x)]))
          : v;
  return JSON.stringify(walk(JSON.parse(text)));
}

/**
 * Prova che si sono tolti solo spazi fuori da stringhe ed espressioni regolari: senza tutti gli
 * spazi liberi, le due versioni devono essere identiche.
 */
export function sameMeaning(original, compacted) {
  const squeeze = (v) =>
    typeof v === 'string'
      ? pieces(v)
          .map((p) => ('literal' in p ? p.literal : p.free.replace(/\s+/g, '')))
          .join('')
      : Array.isArray(v)
        ? v.map(squeeze)
        : v && typeof v === 'object'
          ? Object.fromEntries(Object.entries(v).map(([k, x]) => [k, squeeze(x)]))
          : v;
  return (
    JSON.stringify(squeeze(JSON.parse(original))) === JSON.stringify(squeeze(JSON.parse(compacted)))
  );
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const text = readFileSync(new URL('./database.rules.proposed.json', import.meta.url), 'utf8');
  const small = compactRules(text);
  const kb = (n) => (n / 1024).toFixed(1) + ' KB';
  console.log(`Nella repo: ${kb(Buffer.byteLength(text))}`);
  console.log(`Pubblicate: ${kb(Buffer.byteLength(small))} su ${kb(RULES_LIMIT)}`);
  console.log(`Stesso significato: ${sameMeaning(text, small) ? 'sì' : 'NO'}`);
}
