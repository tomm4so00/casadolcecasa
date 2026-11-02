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
await fetch(`http://127.0.0.1:9000/.settings/rules.json?ns=${namespace}`, {
  method: 'PUT',
  headers,
  body: JSON.stringify({ rules: { '.read': 'auth != null', '.write': 'auth != null' } }),
});
await fetch(`http://127.0.0.1:9000/.json?ns=${namespace}`, {
  method: 'PUT',
  headers,
  body: 'null',
});
const server = await createServer({ server: { host: '127.0.0.1', port: 0 } });
await server.listen();
const browser = await chromium.launch(process.platform === 'win32' ? { channel: 'msedge' } : {});
const contexts = await Promise.all([browser.newContext(), browser.newContext()]);
const [page, other] = await Promise.all(contexts.map((c) => c.newPage()));
const errors = [];
for (const p of [page, other]) {
  p.setDefaultTimeout(15000);
  p.on('pageerror', (e) => errors.push(e.message));
}
const url = server.resolvedUrls.local[0] + '';
const signIn = (p) =>
  p.evaluate(async () => {
    const f = await import('/tests/auth-fixture.ts');
    return f.signInTestUser('v8-cloud@example.com');
  });
try {
  await page.goto(url);
  await signIn(page);
  await page.locator('#nickname').fill('Profilo cloud v8');
  await page.locator('#cloud-game-btn').click();
  await page
    .locator('#creator-modal')
    .getByRole('button', { name: /Conferma/ })
    .click();
  await page.locator('#dialog-buttons').getByRole('button', { name: 'Salta', exact: true }).click();
  await page.evaluate(async () => {
    const { game } = await import('/src/game/context.ts');
    game.pinPromptMoneyThreshold = 1e9;
    game.moneyLevel = 777;
    game.ownedItems.item_hoodie = true;
    await window.saveGame(true);
  });
  await page.getByText('Salvato sul cloud', { exact: true }).waitFor();
  await other.goto(url);
  await signIn(other);
  await other.locator('#nickname').fill('Altro dispositivo');
  await other.locator('#cloud-game-btn').click();
  await other.getByText(/Questo personaggio è già aperto altrove/).waitFor();
  await page.locator('#save-exit').click();
  await page.locator('#ui-setup-screen').waitFor({ state: 'visible' });
  await other.locator('#cloud-game-btn').click();
  await other
    .locator('#dialog-buttons')
    .getByRole('button', { name: 'Salta', exact: true })
    .click();
  await other.waitForFunction(async () => {
    const { game } = await import('/src/game/context.ts');
    return game.ownedItems.item_hoodie && game.moneyLevel === 777;
  });
  await contexts[1].setOffline(true);
  await other.evaluate(async () => {
    const { game } = await import('/src/game/context.ts');
    game.hygieneLevel = 88;
    void window.saveGame(true);
  });
  const local = await other.evaluate(() => JSON.parse(localStorage.getItem('sims_save_v1')));
  assert.equal(local.hygieneLevel, 88);
  await contexts[1].setOffline(false);
  await other.getByText('Salvato sul cloud', { exact: true }).waitFor();
  assert.deepEqual(errors, []);
  console.log(
    'PASS cloud v8: Google account binding, v8 cloud saves, vault balance, two browsers, exclusive session and offline/reconnect.',
  );
} catch (error) {
  console.log(
    'FIRST UI',
    await page
      .locator('body')
      .innerText()
      .then((t) => t.slice(-900)),
  );
  console.log(
    'SECOND UI',
    await other
      .locator('body')
      .innerText()
      .then((t) => t.slice(-900)),
  );
  console.log('PAGE ERRORS', errors);
  throw error;
} finally {
  await browser.close();
  await server.close();
}
