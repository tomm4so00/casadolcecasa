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
// se il database rifiuta le regole resterebbero quelle aperte e la prova non varrebbe niente
const rulesLoaded = await fetch(`http://127.0.0.1:9000/.settings/rules.json?ns=${namespace}`, {
  method: 'PUT',
  headers,
  body: await readFile(
    new URL('../firebase/database.rules.proposed.json', import.meta.url),
    'utf8',
  ),
});
assert.equal(rulesLoaded.ok, true, 'rules rejected: ' + (await rulesLoaded.text()));
await fetch(`http://127.0.0.1:9000/.json?ns=${namespace}`, {
  method: 'PUT',
  headers,
  body: 'null',
});
const server = await createServer({ server: { host: '127.0.0.1', port: 0 } });
await server.listen();
const browser = await chromium.launch(
  process.platform === 'win32' ? { channel: 'msedge', args: ['--disable-gpu'] } : {},
);
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
  await page.locator('#cloud-game-btn').click();
  await page.locator('#setup-new-sim').click();
  await page.locator('#setup-nickname').fill('Profilo cloud v8');
  await page.locator('#setup-create-sim').click();
  // personaggio nuovo: prima sceglie il condominio (qui c'è solo quello di sempre)
  await page.locator('#world-modal [data-w="public"]').click();
  await page
    .locator('#creator-modal')
    .getByRole('button', { name: /Conferma/ })
    .click();
  await page
    .locator('#dialog-buttons')
    .getByRole('button', { name: /^(Salta|Ho capito, si parte! ✅)$/ })
    .click();
  await page.evaluate(async () => {
    const { game } = await import('/src/game/context.ts');
    game.pinPromptMoneyThreshold = 1e9;
    const economy = await import('/src/game/economy.ts');
    await economy.creditMoney(807);
    await economy.purchaseItem('ownedItems', 'item_hoodie', 30);
    return (await import('/src/game/saves.ts')).saveGame(true);
  });
  await other.goto(url);
  await signIn(other);
  // The latest access wins: the first device is blocked and stops saving.
  await other.locator('#cloud-game-btn').click();
  await page.locator('#session-lost-banner').waitFor({ state: 'visible' });
  assert.equal(
    await page.evaluate(async () => (await import('/src/game/saves.ts')).saveGame(true)),
    false,
    'a device that lost the session must not save',
  );
  // chi ha già un personaggio non rivede la guida iniziale, neanche su un altro dispositivo
  await other.waitForFunction(async () => {
    const { game } = await import('/src/game/context.ts');
    return game.player.ownedItems.item_hoodie && game.moneyLevel === 777;
  });
  assert.equal(
    await other.locator('#dialog-modal').isVisible(),
    false,
    'an existing Sim must not see the intro again on another device',
  );
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
    (await import('/shared/market.ts')).advanceMarket(null, Date.now() - 3 * 3600000, () => 0),
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
  const victim = await other.evaluate(async () => {
    const { game } = await import('/src/game/context.ts');
    return { id: game.session.myPlayerId, uid: game.session.authUid };
  });
  for (let i = 0; ; i++) {
    const cloud = await (
      await fetch(`http://127.0.0.1:9000/sims_saves/${victim.id}.json?ns=${namespace}`, {
        headers,
      })
    ).json();
    if (cloud?.hygieneLevel === 88) break;
    assert(i < 60, 'the offline save must reach the cloud after reconnecting');
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
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
      // A Google Sim is never claimable as a legacy code, even bypassing the client check.
      claimGoogleSim: await attempt(() =>
        game.session.db.ref('').update({
          ['sims_legacy_claims/' + victim.id]: firebaseClient.auth().currentUser.uid,
          ['sims_accounts/' + firebaseClient.auth().currentUser.uid]: { playerId: victim.id },
        }),
      ),
    };
  }, victim);
  assert.deepEqual(deniedOther, {
    readSave: false,
    writeSave: false,
    readAccount: false,
    replaceBinding: false,
    claimGoogleSim: false,
  });
  // A legacy code is linked at once to the first Google account that claims it.
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
    async (id) => (await import('/src/game/accounts.ts')).claimLegacySim(id),
    legacyId,
  );
  const claim = await (
    await fetch(`http://127.0.0.1:9000/sims_legacy_claims/${legacyId}.json?ns=${namespace}`, {
      headers,
    })
  ).json();
  assert.equal(claim, isolatedUid);
  const stolen = await other.evaluate(async (id) => {
    try {
      await (await import('/src/game/accounts.ts')).claimLegacySim(id);
      return true;
    } catch {
      return false;
    }
  }, legacyId);
  assert.equal(stolen, false);
  await isolated.locator('#cloud-game-btn').click();
  // chi ritrova un Sim che c'era già non vede la guida iniziale: è solo per i nuovi
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
  // Another device takes over the Sim: this page is blocked.
  const takenId = await other.evaluate(async () => {
    const { game } = await import('/src/game/context.ts');
    return game.session.myPlayerId;
  });
  await fetch(`http://127.0.0.1:9000/sims_sessions/${takenId}.json?ns=${namespace}`, {
    method: 'PUT',
    headers,
    body: JSON.stringify({ id: 'other-device', expiresAt: Date.now() + 45000 }),
  });
  await other.locator('#session-lost-banner').waitFor({ state: 'visible' });
  assert.deepEqual(errors, []);
  console.log(
    'PASS cloud v8: Google account binding, v8 cloud saves, vault balance, two browsers, exclusive session, latest access wins, shared server quotes, read-only market and offline/reconnect.',
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
