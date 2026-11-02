// Controlla e pubblica le regole del Realtime Database usando la Firebase CLI già installata.
//   node firebase/rules.mjs check   → confronta le regole online con firebase/database.rules.proposed.json
//   node firebase/rules.mjs deploy  → salva una copia di quelle online, pubblica le nuove e ricontrolla
// Serve un accesso fatto una volta con "npx firebase login".
import { execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

const PROJECT = process.env.FIREBASE_PROJECT || 'casadolcecasa-6d92a';
const RULES = resolve('firebase/database.rules.proposed.json');
const BACKUPS = resolve('firebase/backups');

// Avvia la CLI di Firebase installata nel progetto, senza passare dalla shell.
const CLI = resolve('node_modules/firebase-tools/lib/bin/firebase.js');
function firebase(args) {
  return execFileSync(process.execPath, [CLI, ...args, '--project', PROJECT], {
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
  });
}

function liveRules() {
  const dir = mkdtempSync(join(tmpdir(), 'rules-'));
  const file = join(dir, 'live.json');
  firebase(['database:get', '/.settings/rules', '-o', file]);
  return readFileSync(file, 'utf8');
}

const same = (a, b) => JSON.stringify(JSON.parse(a)) === JSON.stringify(JSON.parse(b));

function check() {
  const live = liveRules();
  const local = readFileSync(RULES, 'utf8');
  if (same(live, local)) {
    console.log('✅ Le regole online sono aggiornate.');
    return true;
  }
  console.log(
    '⚠️ Le regole online sono diverse da quelle del progetto: serve "npm run rules:deploy".',
  );
  return false;
}

function deploy() {
  const live = liveRules();
  mkdirSync(BACKUPS, { recursive: true });
  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  const backup = join(BACKUPS, `rules-${stamp}.json`);
  writeFileSync(backup, live);
  console.log('💾 Copia delle regole online salvata in ' + backup);
  if (same(live, readFileSync(RULES, 'utf8'))) {
    console.log('✅ Le regole online erano già aggiornate: niente da pubblicare.');
    return true;
  }
  // Configurazione temporanea: firebase.json del progetto non pubblica le regole per errore.
  const dir = mkdtempSync(join(tmpdir(), 'rules-deploy-'));
  const config = join(dir, 'firebase.json');
  writeFileSync(config, JSON.stringify({ database: { rules: RULES } }));
  console.log(firebase(['deploy', '--only', 'database', '--config', config, '--non-interactive']));
  return check();
}

const command = process.argv[2];
if (command === 'check') process.exitCode = check() ? 0 : 1;
else if (command === 'deploy') process.exitCode = deploy() ? 0 : 1;
else {
  console.log('Uso: node firebase/rules.mjs check | deploy');
  process.exitCode = 2;
}
