// Prima di pubblicare il gioco di prova (workflow prova.yml): la configurazione deve essere quella
// del progetto di prova. Senza, src/firebase-config.ts userebbe di nascosto il progetto vero.
//   node scripts/check-prova-config.mjs   (legge le variabili d'ambiente del workflow)
import { fileURLToPath } from 'node:url';

/** Il progetto, il Worker e il sito di tutti: la prova non deve mai usarli. */
export const PRODUCTION = {
  project: 'casadolcecasa-6d92a',
  worker: 'casadolcecasa-criogenesi.casadolcecasa-criogenesi.workers.dev',
  site: 'tomm4so00.github.io',
};

const REQUIRED = [
  'VITE_FIREBASE_API_KEY',
  'VITE_FIREBASE_AUTH_DOMAIN',
  'VITE_FIREBASE_DATABASE_URL',
  'VITE_FIREBASE_PROJECT_ID',
  'VITE_FIREBASE_APP_ID',
  'VITE_FIREBASE_MESSAGING_SENDER_ID',
  'VITE_WORKER_URL',
  'VITE_GAME_URL',
];

/** I problemi della configurazione (vuoto: si può pubblicare). */
export function provaConfigProblems(env) {
  const problems = [];
  for (const key of REQUIRED)
    if (!env[key]) problems.push(`manca la variabile ${key.replace('VITE_', 'PROVA_')}`);
  if (env.VITE_STAGE !== 'prova') problems.push('VITE_STAGE deve essere "prova"');
  const project = env.VITE_FIREBASE_PROJECT_ID || '';
  const values = REQUIRED.map((key) => env[key] || '').join(' ');
  if (values.includes(PRODUCTION.project)) problems.push('la configurazione usa il progetto vero');
  if (values.includes(PRODUCTION.worker)) problems.push('la configurazione usa il Worker vero');
  if (values.includes(PRODUCTION.site)) problems.push('la configurazione usa il sito vero');
  // la chiave dell'account di servizio: deve essere del progetto di prova
  if (env.SERVICE_ACCOUNT !== undefined) {
    let account = null;
    try {
      account = JSON.parse(env.SERVICE_ACCOUNT);
    } catch {
      problems.push('il secret PROVA_FIREBASE_SERVICE_ACCOUNT non è un JSON valido');
    }
    if (account && account.project_id !== project)
      problems.push('il secret PROVA_FIREBASE_SERVICE_ACCOUNT è di un altro progetto');
  }
  return problems;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const problems = provaConfigProblems(process.env);
  for (const problem of problems) console.log(`::error::Ambiente di prova: ${problem}`);
  if (problems.length) process.exitCode = 1;
  else console.log('✅ Configurazione del progetto di prova');
}
