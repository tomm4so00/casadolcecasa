import { readFile } from 'node:fs/promises';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
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
  body: await readFile(
    new URL('../firebase/database.rules.proposed.json', import.meta.url),
    'utf8',
  ),
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
  assert.equal(
    await page.locator('#start-game-btn').isVisible(),
    false,
    'online access must use Google',
  );
  const fixture = { market: null };
  const runPublisher = () =>
    promisify(execFile)(process.execPath, ['server/lib/server/src/index.js'], {
      env: {
        ...process.env,
        FIREBASE_PROJECT_ID: 'demo-casadolcecasa',
        FIREBASE_DATABASE_URL: 'https://demo-casadolcecasa-default-rtdb.firebaseio.com',
      },
      timeout: 30000,
    });
  const initialPublish = await runPublisher();
  assert(initialPublish.stdout.includes('Shared market updated.'));
  fixture.market = await (
    await fetch(`http://127.0.0.1:9000/sims_market.json?ns=${namespace}`, { headers })
  ).json();
  const retries = await Promise.all([runPublisher(), runPublisher()]);
  for (const retry of retries) assert(retry.stdout.includes('already published'));
  const denied = await fetch(
    `http://127.0.0.1:9000/sims_market/quotes/shop/price.json?ns=${namespace}`,
    {
      method: 'PUT',
      body: '1',
    },
  );
  assert.equal(denied.ok, false, 'a browser must not be able to change market quotes');
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
    const economy = await import('/src/game/economy.ts');
    await economy.creditMoney(807);
    await economy.purchaseItem('ownedItems', 'item_hoodie', 30);
    await (await import('/src/game/saves.ts')).saveGame(true);
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
    return game.player.ownedItems.item_hoodie && game.moneyLevel === 777;
  });
  const firstQuote = await page.evaluate(async () =>
    (await import('/src/game/business.ts')).mktPrice({ id: 'shop' }),
  );
  const otherQuote = await other.evaluate(async () => {
    const originalNow = Date.now;
    Date.now = () => originalNow() + 36000000;
    try {
      return (await import('/src/game/business.ts')).mktPrice({ id: 'shop' });
    } finally {
      Date.now = originalNow;
    }
  });
  assert.equal(firstQuote, fixture.market.quotes.shop.price);
  assert.equal(otherQuote, firstQuote, 'device time must not change the shared price');
  const authenticatedWrite = await other.evaluate(async () => {
    const { game } = await import('/src/game/context.ts');
    try {
      await game.session.db.ref('sims_market/quotes/shop/price').set(1);
      return true;
    } catch {
      return false;
    }
  });
  assert.equal(authenticatedWrite, false, 'even a signed-in player must not change quotes');
  const deniedDelete = await fetch(`http://127.0.0.1:9000/sims_market.json?ns=${namespace}`, {
    method: 'DELETE',
  });
  assert.equal(deniedDelete.ok, false);
  const staleMarket = await other.evaluate(async () =>
    (await import('/shared/market.ts')).advanceMarket(null, Date.now() - 3600000, () => 0),
  );
  await fetch(`http://127.0.0.1:9000/sims_market.json?ns=${namespace}`, {
    method: 'PUT',
    headers,
    body: JSON.stringify(staleMarket),
  });
  await other.waitForFunction(async () => {
    const market = await import('/src/game/market-client.ts');
    return market.marketSnapshot() !== null && !market.canTradeMarket();
  });
  await other.evaluate(async () => (await import('/src/game/business.ts')).openBizSite());
  assert.equal(await other.locator('[data-action="bizInvest"]').first().isDisabled(), true);
  await other.evaluate(async () =>
    (await import('/src/game/render/primitives.ts')).closeModal('biz-modal'),
  );
  await fetch(`http://127.0.0.1:9000/sims_market.json?ns=${namespace}`, {
    method: 'PUT',
    headers,
    body: JSON.stringify(fixture.market),
  });
  await other.waitForFunction(async () =>
    (await import('/src/game/market-client.ts')).canTradeMarket(),
  );
  await contexts[1].setOffline(true);
  await other.evaluate(async () => {
    const { game } = await import('/src/game/context.ts');
    game.player.hygieneLevel = 88;
    void (await import('/src/game/saves.ts')).saveGame(true);
  });
  const local = await other.evaluate(async () => {
    const { game } = await import('/src/game/context.ts');
    return JSON.parse(localStorage.getItem(game.session.SAVE_KEY));
  });
  assert.equal(local.hygieneLevel, 88);
  await contexts[1].setOffline(false);
  await other.getByText('Salvato sul cloud', { exact: true }).waitFor();
  const victim = await other.evaluate(async () => {
    const { game } = await import('/src/game/context.ts');
    return { id: game.session.myPlayerId, uid: game.session.authUid };
  });
  const isolatedContext = await browser.newContext();
  const isolated = await isolatedContext.newPage();
  isolated.on('pageerror', (error) => errors.push(error.message));
  await isolated.goto(url);
  const isolatedUid = await isolated.evaluate(async () =>
    (await import('/tests/auth-fixture.ts')).signInTestUser('another-google@example.com'),
  );
  const deniedOther = await isolated.evaluate(async (victim) => {
    const { game } = await import('/src/game/context.ts');
    const { firebaseClient } = await import('/src/game/runtime.ts');
    const attempt = async (operation) => {
      try {
        await operation();
        return true;
      } catch {
        return false;
      }
    };
    return {
      readSave: await attempt(() => game.session.db.ref('sims_saves/' + victim.id).get()),
      writeSave: await attempt(() =>
        game.session.db.ref('sims_saves/' + victim.id + '/healthLevel').set(100),
      ),
      readAccount: await attempt(() => game.session.db.ref('sims_accounts/' + victim.uid).get()),
      replaceBinding: await attempt(() =>
        game.session.db
          .ref('sims_accounts/' + firebaseClient.auth().currentUser.uid)
          .set({ playerId: victim.id }),
      ),
    };
  }, victim);
  assert.deepEqual(deniedOther, {
    readSave: false,
    writeSave: false,
    readAccount: false,
    replaceBinding: false,
  });
  // A legacy code creates a request. Only the trusted admin can approve the account binding.
  const legacyId = 'player_legacytest';
  const legacySave = await (
    await fetch(`http://127.0.0.1:9000/sims_saves/${victim.id}.json?ns=${namespace}`, { headers })
  ).json();
  legacySave.nick = 'Sim precedente';
  await fetch(`http://127.0.0.1:9000/sims_saves/${legacyId}.json?ns=${namespace}`, {
    method: 'PUT',
    headers,
    body: JSON.stringify(legacySave),
  });
  await isolated.evaluate(
    async (id) => (await import('/src/game/accounts.ts')).requestLegacyLink(id),
    legacyId,
  );
  const request = await (
    await fetch(`http://127.0.0.1:9000/sims_link_requests/${isolatedUid}.json?ns=${namespace}`, {
      headers,
    })
  ).json();
  assert.equal(request.playerId, legacyId);
  await fetch(`http://127.0.0.1:9000/sims_accounts/${isolatedUid}.json?ns=${namespace}`, {
    method: 'PUT',
    headers,
    body: JSON.stringify({ playerId: legacyId }),
  });
  await isolated.locator('#cloud-game-btn').click();
  await isolated
    .locator('#dialog-buttons')
    .getByRole('button', { name: 'Salta', exact: true })
    .click();
  await isolated.waitForFunction(async (id) => {
    const { game } = await import('/src/game/context.ts');
    return game.session.myPlayerId === id && game.player.ownedItems.item_hoodie === true;
  }, legacyId);
  const protectedRoom = await other.evaluate(async () => {
    const { game } = await import('/src/game/context.ts');
    return game.myAssignedRoomIdx;
  });
  const deniedBoundPlayer = await isolated.evaluate(
    async ({ victim, protectedRoom }) => {
      const { game } = await import('/src/game/context.ts');
      const attempt = async (operation) => {
        try {
          await operation();
          return true;
        } catch {
          return false;
        }
      };
      return {
        readSave: await attempt(() => game.session.db.ref('sims_saves/' + victim.id).get()),
        stealRoom: await attempt(() =>
          game.session.db
            .ref('sims_rooms_state/' + protectedRoom + '/ownerId')
            .set(game.session.myPlayerId),
        ),
        alterInventory: await attempt(() =>
          game.session.db
            .ref('sims_rooms_state/' + protectedRoom + '/economy/ownedItems/item_hoodie')
            .set(false),
        ),
        alterLastSeen: await attempt(() =>
          game.session.db.ref('sims_rooms_state/' + protectedRoom + '/lastSeen').set(1),
        ),
        forgeMaintenance: await attempt(() =>
          game.session.db
            .ref('sims_rooms_state/' + game.myAssignedRoomIdx + '/pendingDeath')
            .set({ id: victim.id, name: 'Falso', lastSeen: 1 }),
        ),
      };
    },
    { victim, protectedRoom },
  );
  assert.deepEqual(deniedBoundPlayer, {
    readSave: false,
    stealRoom: false,
    alterInventory: false,
    alterLastSeen: false,
    forgeMaintenance: false,
  });
  assert.deepEqual(errors, []);
  console.log(
    'PASS cloud v8: Google account binding, v8 cloud saves, vault balance, two browsers, exclusive session, shared server quotes, read-only market and offline/reconnect.',
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
