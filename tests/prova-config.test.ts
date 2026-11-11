import { describe, expect, it } from 'vitest';
// @ts-expect-error lo script è JavaScript, senza tipi
import { PRODUCTION, provaConfigProblems } from '../scripts/check-prova-config.mjs';

const good = {
  VITE_FIREBASE_API_KEY: 'chiave-prova',
  VITE_FIREBASE_AUTH_DOMAIN: 'casadolcecasa-prova.firebaseapp.com',
  VITE_FIREBASE_DATABASE_URL: 'https://casadolcecasa-prova-default-rtdb.firebaseio.com',
  VITE_FIREBASE_PROJECT_ID: 'casadolcecasa-prova',
  VITE_FIREBASE_APP_ID: '1:1:web:1',
  VITE_FIREBASE_MESSAGING_SENDER_ID: '1',
  VITE_WORKER_URL: 'https://casadolcecasa-prova.casadolcecasa-criogenesi.workers.dev',
  VITE_GAME_URL: 'https://casadolcecasa-prova.web.app/',
  VITE_STAGE: 'prova',
  SERVICE_ACCOUNT: JSON.stringify({ project_id: 'casadolcecasa-prova' }),
};

describe('configurazione del gioco di prova', () => {
  it('quella del progetto di prova va bene', () => {
    expect(provaConfigProblems(good)).toEqual([]);
  });

  it('se manca qualcosa si ferma: il gioco userebbe di nascosto il progetto vero', () => {
    const { VITE_FIREBASE_PROJECT_ID: _p, ...missing } = good;
    expect(provaConfigProblems(missing)).toContain('manca la variabile PROVA_FIREBASE_PROJECT_ID');
    expect(provaConfigProblems({ ...good, VITE_STAGE: '' })).toContain(
      'VITE_STAGE deve essere "prova"',
    );
  });

  it('non usa mai progetto, Worker o sito veri', () => {
    expect(
      provaConfigProblems({
        ...good,
        VITE_FIREBASE_DATABASE_URL: `https://${PRODUCTION.project}.firebaseio.com`,
      }),
    ).toContain('la configurazione usa il progetto vero');
    expect(
      provaConfigProblems({ ...good, VITE_WORKER_URL: `https://${PRODUCTION.worker}` }),
    ).toContain('la configurazione usa il Worker vero');
    expect(
      provaConfigProblems({ ...good, VITE_GAME_URL: `https://${PRODUCTION.site}/casadolcecasa/` }),
    ).toContain('la configurazione usa il sito vero');
  });

  it('la chiave deve essere del progetto di prova', () => {
    expect(
      provaConfigProblems({
        ...good,
        SERVICE_ACCOUNT: JSON.stringify({ project_id: PRODUCTION.project }),
      }),
    ).toContain('il secret PROVA_FIREBASE_SERVICE_ACCOUNT è di un altro progetto');
    expect(provaConfigProblems({ ...good, SERVICE_ACCOUNT: 'non json' })).toContain(
      'il secret PROVA_FIREBASE_SERVICE_ACCOUNT non è un JSON valido',
    );
  });
});
