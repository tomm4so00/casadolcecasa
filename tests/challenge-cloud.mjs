// Prova della sfida con il link (sala giochi), con gli emulatori di Firebase: Ada manda il link
// a Bea, che non sta giocando; Bea lo apre, entra nel gioco e accetta, e la partita comincia.
//   npm run test:challenge
import { readFile } from 'node:fs/promises';
import { strict as assert } from 'node:assert';
import { chromium } from '@playwright/test';
import { createServer } from 'vite';

if (!process.env.FIREBASE_DATABASE_EMULATOR_HOST || !process.env.FIREBASE_AUTH_EMULATOR_HOST)
  throw new Error('Test consentito solo con gli emulatori.');
Object.assign(process.env, {
  VITE_FIREBASE_API_KEY: 'fake-api-key',
  VITE_FIREBASE_AUTH_DOMAIN: 'demo-casadolcecasa.firebaseapp.com',
  VITE_FIREBASE_DATABASE_URL: 'https://demo-casadolcecasa-default-rtdb.firebaseio.com',
  VITE_FIREBASE_PROJECT_ID: 'demo-casadolcecasa',
  VITE_FIREBASE_APP_ID: 'demo-app-id',
  VITE_FIREBASE_EMULATORS: 'true',
});
const namespace = 'demo-casadolcecasa-default-rtdb';
const headers = { Authorization: 'Bearer owner' };
const db = (path) => `http://127.0.0.1:9000/${path}.json?ns=${namespace}`;
const rulesLoaded = await fetch(db('.settings/rules'), {
  method: 'PUT',
  headers,
  body: await readFile(
    new URL('../firebase/database.rules.proposed.json', import.meta.url),
    'utf8',
  ),
});
assert.equal(rulesLoaded.ok, true, 'regole rifiutate: ' + (await rulesLoaded.text()));
await fetch(db(''), { method: 'PUT', headers, body: 'null' });

const server = await createServer({ server: { host: '127.0.0.1', port: 0 } });
await server.listen();
const url = server.resolvedUrls.local[0] + '';
const browser = await chromium.launch(process.platform === 'win32' ? { channel: 'msedge' } : {});
const errors = [];

async function newPage() {
  const page = await (await browser.newContext()).newPage();
  page.setDefaultTimeout(20000);
  page.on('pageerror', (e) => errors.push(e.message));
  return page;
}

/** Ripete `check` nella pagina finché non è vero. */
async function until(page, check, arg, ms = 20000) {
  const end = Date.now() + ms;
  while (Date.now() < end) {
    if (await page.evaluate(check, arg)) return true;
    await new Promise((r) => setTimeout(r, 250));
  }
  return false;
}

/** Accesso con Google (di prova) e personaggio nuovo nel condominio di sempre. */
async function newSim(page, email, nick) {
  await page.evaluate(
    async (e) => (await import('/tests/auth-fixture.ts')).signInTestUser(e),
    email,
  );
  await page.locator('#cloud-game-btn').click();
  await page.locator('#setup-new-sim').click();
  await page.locator('#setup-nickname').fill(nick);
  await page.locator('#setup-create-sim').click();
  await page.locator('#world-modal [data-w="public"]').click();
  await page
    .locator('#creator-modal')
    .getByRole('button', { name: /Conferma/ })
    .click();
  await page
    .locator('#dialog-buttons')
    .getByRole('button', { name: /^(Salta|Ho capito, si parte! ✅)$/ })
    .click();
  assert(
    await until(page, async () => {
      const { game } = await import('/src/game/context.ts');
      return typeof game.myAssignedRoomIdx === 'number' && game.myAssignedRoomIdx >= 0;
    }),
    nick + ' senza stanza',
  );
}

const button = (page, name) =>
  page.locator('#dialog-buttons').getByRole('button', { name, exact: false });

let failed = false;
try {
  const ada = await newPage();
  await ada.goto(url);
  await newSim(ada, 'ada@example.com', 'Ada');
  const adaId = await ada.evaluate(
    async () => (await import('/src/game/context.ts')).game.session.myPlayerId,
  );
  // dalla postazione di Forza 4: nessuno online, ma c'è il link per gli amici
  void ada.evaluate(async () => (await import('/src/game/arcade.ts')).openArcadeStation('c4'));
  await button(ada, 'Invita un amico').click();
  await button(ada, 'Chiudi').click();
  const games = await (await fetch(db('sims_games'), { headers })).json();
  const [gid, open] = Object.entries(games || {}).find(([, m]) => m.a === adaId && m.b === '');
  assert(gid, 'sfida con il posto vuoto non trovata');
  assert.equal(open.status, 'wait');
  console.log('PASS: Ada crea la sfida con il posto vuoto');

  // Bea non sta giocando: apre il link, si crea il personaggio e accetta
  const bea = await newPage();
  await bea.goto(`${url}?invito=${encodeURIComponent(adaId)}&sfida=CASA-0001~${gid}`);
  await newSim(bea, 'bea@example.com', 'Bea');
  await button(bea, 'Gioca').click({ timeout: 30000 });
  assert(
    await until(bea, async () => !!document.querySelector('#arcade-modal [data-col]')),
    'Bea non vede la partita',
  );
  const match = await (await fetch(db('sims_games/' + gid), { headers })).json();
  assert.equal(match.status, 'play');
  assert.equal(match.nb, 'Bea');
  console.log('PASS: Bea apre il link, accetta e prende il posto');
  assert(
    await until(ada, async () =>
      /Tocca a te/.test(document.querySelector('#arcade-modal')?.textContent || ''),
    ),
    'Ada non vede che la partita è cominciata',
  );
  // Ada fa la prima mossa e Bea la vede
  await ada.locator('#arcade-modal [data-col="3"]').first().click();
  assert(
    await until(bea, async () =>
      /Tocca a te/.test(document.querySelector('#arcade-modal')?.textContent || ''),
    ),
    'Bea non vede la mossa di Ada',
  );
  console.log('PASS: si gioca a turno');
  // il link non vale più per un terzo
  const cri = await newPage();
  await cri.goto(`${url}?sfida=CASA-0001~${gid}`);
  await newSim(cri, 'cri@example.com', 'Cri');
  await new Promise((r) => setTimeout(r, 4000));
  assert.equal(
    await cri.locator('#arcade-modal [data-col]').count(),
    0,
    'Cri non deve entrare in una partita già presa',
  );
  console.log('PASS: il posto preso non si prende due volte');
  assert.deepEqual(errors, []);
  console.log('PASS: sfida con il link (crea, apri, accetta, gioca, posto già preso).');
} catch (e) {
  failed = true;
  console.error('FAIL:', e.message);
  console.error('Errori della pagina:', errors);
} finally {
  await browser.close();
  await server.close();
}
process.exit(failed ? 1 : 0);
