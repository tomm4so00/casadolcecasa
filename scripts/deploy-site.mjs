// Pubblica la cartella dist su un sito di Firebase Hosting del progetto (FIREBASE_PROJECT): serve
// per i siti in più, come casadolcecasa.web.app, che firebase.json non nomina.
//   node scripts/deploy-site.mjs <sito> [messaggio]
import { execFileSync } from 'node:child_process';
import { readFileSync, rmSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

const [site, message = ''] = process.argv.slice(2);
const project = process.env.FIREBASE_PROJECT;
if (!site || !project) {
  console.error('Uso: FIREBASE_PROJECT=<progetto> node scripts/deploy-site.mjs <sito> [messaggio]');
  process.exit(2);
}
// la configurazione di sempre, con il sito scelto; accanto a firebase.json, così "dist" è lo stesso
const base = JSON.parse(readFileSync(resolve('firebase.json'), 'utf8'));
const config = resolve(`firebase.${site}.json`);
writeFileSync(config, JSON.stringify({ hosting: { ...base.hosting, site } }));
try {
  execFileSync(
    process.execPath,
    [
      resolve('node_modules/firebase-tools/lib/bin/firebase.js'),
      'deploy',
      '--only',
      'hosting',
      '--config',
      config,
      '--project',
      project,
      '--non-interactive',
      ...(message ? ['--message', message] : []),
    ],
    { stdio: 'inherit' },
  );
} finally {
  rmSync(config, { force: true });
}
