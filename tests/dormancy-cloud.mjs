// La pausa con la scheda nascosta, nel browser e sugli emulatori di Firebase:
// - in pausa il gioco salva, si scollega (il server lo segna "offline") e non scrive più niente;
// - al ritorno ricarica la pagina;
// - se intanto il personaggio è stato aperto su un altro dispositivo, al ritorno non ricarica
//   (gli ruberebbe la sessione) ma mostra l'avviso.
//   npm run test:dormancy
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
const ns = 'demo-casadolcecasa-default-rtdb';
const headers = { Authorization: 'Bearer owner' };
const rulesLoaded = await fetch(`http://127.0.0.1:9000/.settings/rules.json?ns=${ns}`, {
  method: 'PUT',
  headers,
  body: await readFile(
    new URL('../firebase/database.rules.proposed.json', import.meta.url),
    'utf8',
  ),
});
assert.equal(rulesLoaded.ok, true, 'rules rejected: ' + (await rulesLoaded.text()));
await fetch(`http://127.0.0.1:9000/.json?ns=${ns}`, { method: 'PUT', headers, body: 'null' });
const read = async (path) =>
  (await fetch(`http://127.0.0.1:9000/${path}.json?ns=${ns}`, { headers })).json();

const server = await createServer({ server: { host: '127.0.0.1', port: 0 } });
await server.listen();
const browser = await chromium.launch(
  process.platform === 'win32' ? { channel: 'msedge', args: ['--disable-gpu'] } : {},
);
const contexts = await Promise.all([browser.newContext(), browser.newContext()]);
const [page, other] = await Promise.all(contexts.map((c) => c.newPage()));
const errors = [];
for (const p of [page, other]) {
  p.setDefaultTimeout(20000);
  p.on('pageerror', (e) => errors.push(e.message));
}
const url = server.resolvedUrls.local[0] + '';
const signIn = (p) =>
  p.evaluate(async () =>
    (await import('/tests/auth-fixture.ts')).signInTestUser('pausa@example.com'),
  );
const started = (p) =>
  p.waitForFunction(async () => {
    const { game } = await import('/src/game/context.ts');
    return game.session.saveReady && !!game.session.myPlayerId;
  });
/** La scheda diventa nascosta o visibile, come quando si cambia scheda. */
const setHidden = (p, hidden) =>
  p.evaluate((h) => {
    Object.defineProperty(document, 'hidden', { configurable: true, get: () => h });
    Object.defineProperty(document, 'visibilityState', {
      configurable: true,
      get: () => (h ? 'hidden' : 'visible'),
    });
    document.dispatchEvent(new Event('visibilitychange'));
  }, hidden);
const pause = (p) =>
  p.evaluate(async () => {
    await (await import('/src/game/dormancy.ts')).goDormant();
    const { game } = await import('/src/game/context.ts');
    return { dormant: !!game.session.dormant, pid: game.session.myPlayerId };
  });
/** Entra nel gioco con il personaggio già creato, da un altro dispositivo. */
async function enter(p) {
  await signIn(p);
  await p.locator('#cloud-game-btn').click();
  await started(p);
}

try {
  // ---------------------------------------------------------------- personaggio nuovo
  await page.goto(url);
  await signIn(page);
  await page.locator('#cloud-game-btn').click();
  await page.locator('#setup-new-sim').click();
  await page.locator('#setup-nickname').fill('Dormiglione');
  await page.locator('#setup-create-sim').click();
  await acceptTerms(page);
  await page.locator('#world-modal [data-w="public"]').click();
  await page
    .locator('#creator-modal')
    .getByRole('button', { name: /Conferma/ })
    .click();
  await page
    .locator('#dialog-buttons')
    .getByRole('button', { name: /^(Salta|Ho capito, si parte! ✅)$/ })
    .click();
  await started(page);

  // ---------------------------------------------------------------- in pausa
  await setHidden(page, true);
  const { dormant, pid } = await pause(page);
  assert.equal(dormant, true, 'con la scheda nascosta il gioco va in pausa');
  const savedAt = (await read(`sims_saves/${pid}/savedAt`)) || 0;
  assert(savedAt > 0, 'prima della pausa il gioco salva online');
  // il server segna da solo il giocatore come uscito (onDisconnect della presenza)
  for (let i = 0; ; i++) {
    const op = await read(`sims_online_players/${pid}`);
    if (op?.offline === true) break;
    assert(i < 40, 'in pausa gli altri devono vederlo uscito: ' + JSON.stringify(op));
    await page.waitForTimeout(250);
  }
  const silent = await page.evaluate(async () => {
    const saves = await import('/src/game/saves.ts');
    return saves.saveGame(true);
  });
  assert.equal(silent, false, 'in pausa non si salva');
  await page.waitForTimeout(1500);
  assert.equal(await read(`sims_saves/${pid}/savedAt`), savedAt, 'niente scritte durante la pausa');

  // ---------------------------------------------------------------- ritorno: ricarica
  const reloaded = page.waitForEvent('load');
  await setHidden(page, false);
  await reloaded;
  // si rientra da soli, senza toccare "Accedi con Google"
  await started(page);
  const back = await page.evaluate(async () => {
    const { game } = await import('/src/game/context.ts');
    return {
      dormant: !!game.session.dormant,
      nav: performance.getEntriesByType('navigation')[0].type,
    };
  });
  assert.deepEqual(back, { dormant: false, nav: 'reload' }, 'al ritorno la pagina si ricarica');
  for (let i = 0; ; i++) {
    const op = await read(`sims_online_players/${pid}`);
    if (op && op.offline !== true) break;
    if (i >= 40) {
      const state = await page.evaluate(async () => {
        const { game } = await import('/src/game/context.ts');
        const dialog = document
          .querySelector('#dialog-modal:not(.hidden)')
          ?.textContent?.slice(0, 200);
        const buttons = [...document.querySelectorAll('button')]
          .filter((b) => b.offsetParent)
          .map((b) => b.id + ':' + b.textContent.trim().slice(0, 30));
        return { started: game.session.gameStarted, dialog, buttons };
      });
      assert.fail('dopo la ricarica si torna online: ' + JSON.stringify({ op, state }));
    }
    await page.waitForTimeout(250);
  }

  // ---------------------------------------------------------------- aperto altrove
  await setHidden(page, true);
  assert.equal((await pause(page)).dormant, true);
  await other.goto(url);
  await enter(other);
  let navigated = false;
  page.once('load', () => (navigated = true));
  await setHidden(page, false);
  await page.locator('#session-lost-banner').waitFor({ state: 'visible' });
  await page.waitForTimeout(1500);
  assert.equal(navigated, false, 'non ruba la sessione al dispositivo che sta giocando');

  assert.deepEqual(errors, []);
  console.log('PASS pausa: salva, si scollega, ricarica al ritorno, rispetta l’altro dispositivo.');
} finally {
  await browser.close();
  await server.close();
}

/** Età e condizioni (terms.ts): la casella e "Gioca", la prima volta di ogni personaggio. */
async function acceptTerms(p) {
  await p.locator('#dialog-check-box').check();
  await p.locator('#dialog-buttons').getByRole('button', { name: '✅ Gioca' }).click();
}
