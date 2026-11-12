// Controlla le dipendenze statiche a esecuzione: gli import di soli tipi non creano cicli JS.
// Il limite registra gli archi dei cicli esistenti, non soltanto il numero di moduli coinvolti.
import { readFileSync, readdirSync, existsSync, writeFileSync } from 'node:fs';
import { join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import ts from 'typescript';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const BASELINE = join(ROOT, 'tests/dependency-cycles-baseline.json');

/** Import ed esportazioni che producono una dipendenza statica JavaScript. */
export function runtimeSpecifiers(source, filename = 'module.ts') {
  const ast = ts.createSourceFile(filename, source, ts.ScriptTarget.Latest, true);
  const imports = [];
  for (const node of ast.statements) {
    if (ts.isImportDeclaration(node)) {
      const clause = node.importClause;
      if (clause?.isTypeOnly) continue;
      if (
        clause &&
        !clause.name &&
        clause.namedBindings &&
        ts.isNamedImports(clause.namedBindings) &&
        clause.namedBindings.elements.length > 0 &&
        clause.namedBindings.elements.every((entry) => entry.isTypeOnly)
      )
        continue;
      imports.push(node.moduleSpecifier.text);
    } else if (ts.isExportDeclaration(node) && node.moduleSpecifier && !node.isTypeOnly) {
      if (
        node.exportClause &&
        ts.isNamedExports(node.exportClause) &&
        node.exportClause.elements.length > 0 &&
        node.exportClause.elements.every((entry) => entry.isTypeOnly)
      )
        continue;
      imports.push(node.moduleSpecifier.text);
    }
  }
  return imports;
}

export function projectGraph(root = ROOT) {
  const files = [];
  const walk = (dir) => {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const path = join(dir, entry.name);
      if (entry.isDirectory()) walk(path);
      else if (/\.tsx?$/.test(path) && !path.endsWith('.d.ts')) files.push(resolve(path));
    }
  };
  for (const dir of ['src', 'shared', 'server/src', 'worker/src']) walk(join(root, dir));
  const config = ts.readConfigFile(join(root, 'tsconfig.json'), ts.sys.readFile);
  if (config.error)
    throw new Error(ts.flattenDiagnosticMessageText(config.error.messageText, '\n'));
  const options = ts.parseJsonConfigFileContent(config.config, ts.sys, root).options;
  const names = new Map(files.map((file) => [file, relative(root, file).replaceAll('\\', '/')]));
  return new Map(
    files.map((file) => {
      const dependencies = runtimeSpecifiers(readFileSync(file, 'utf8'), file).flatMap(
        (specifier) => {
          const target = ts.resolveModuleName(specifier, file, options, ts.sys).resolvedModule;
          const name = target && names.get(resolve(target.resolvedFileName));
          return name ? [name] : [];
        },
      );
      return [names.get(file), [...new Set(dependencies)].sort()];
    }),
  );
}

/** Archi interni alle componenti fortemente connesse, inclusi gli import di sé stessi. */
export function cyclicEdges(graph) {
  let next = 0;
  const indices = new Map(),
    low = new Map(),
    active = new Set(),
    stack = [],
    edges = [];
  const visit = (node) => {
    indices.set(node, next);
    low.set(node, next++);
    stack.push(node);
    active.add(node);
    for (const target of graph.get(node) ?? []) {
      if (!graph.has(target)) continue;
      if (!indices.has(target)) {
        visit(target);
        low.set(node, Math.min(low.get(node), low.get(target)));
      } else if (active.has(target)) low.set(node, Math.min(low.get(node), indices.get(target)));
    }
    if (low.get(node) !== indices.get(node)) return;
    const component = new Set();
    let member;
    do {
      member = stack.pop();
      active.delete(member);
      component.add(member);
    } while (member !== node);
    for (const from of component)
      for (const to of graph.get(from) ?? []) if (component.has(to)) edges.push(`${from} -> ${to}`);
  };
  for (const node of [...graph.keys()].sort()) if (!indices.has(node)) visit(node);
  return [...new Set(edges)].sort();
}

export function newCyclicEdges(current, baseline) {
  const allowed = new Set(baseline);
  return current.filter((edge) => !allowed.has(edge));
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const current = cyclicEdges(projectGraph());
  const init = process.argv.includes('--init');
  if (init && existsSync(BASELINE))
    throw new Error('Il limite esiste già: non può essere sovrascritto.');
  const baseline = init ? current : JSON.parse(readFileSync(BASELINE, 'utf8'));
  const added = newCyclicEdges(current, baseline);
  if (added.length) {
    console.error('Nuove dipendenze circolari:\n' + added.join('\n'));
    process.exitCode = 1;
  } else if (init || process.argv.includes('--prune')) {
    writeFileSync(BASELINE, JSON.stringify(current, null, 2) + '\n');
    console.log(`Limite salvato: ${current.length} archi ciclici. Si può soltanto ridurre.`);
  } else
    console.log(`Dipendenze controllate: nessun nuovo arco ciclico (${current.length} esistenti).`);
}
