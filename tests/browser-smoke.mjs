import { strict as assert } from 'node:assert';
import { chromium } from '@playwright/test';
import { createServer } from 'vite';

const server = await createServer({ server: { host: '127.0.0.1', port: 0 } });
await server.listen();
const browser = await chromium.launch(process.platform === 'win32' ? { channel: 'msedge' } : {});
const page = await browser.newPage();
const errors = [];
page.on('pageerror', (error) => errors.push(error.message));
page.on('requestfailed', (request) => console.log('REQUEST', request.url()));
page.setDefaultTimeout(12000);
try {
  await page.goto(server.resolvedUrls.local[0] + '?offline=1');
  await page.locator('#nickname').fill('Verifica v8');
  await page.locator('#start-game-btn').click();
  await page.locator('#creator-modal').waitFor({ state: 'visible' });
  await page
    .locator('#creator-modal')
    .getByRole('button', { name: /Conferma/ })
    .click();
  await page.waitForFunction(async () => {
    const { game } = await import('/src/game/context.ts');
    return (
      game.myAssignedRoomIdx !== null &&
      game.roomsState[game.myAssignedRoomIdx]?.ownerId === game.myPlayerId
    );
  });
  await page.locator('#dialog-buttons').getByRole('button', { name: 'Salta', exact: true }).click();
  const catalog = await page.evaluate(async () => {
    const { game } = await import('/src/game/context.ts');
    game.pinPromptMoneyThreshold = 1e9;
    game.moneyLevel = 10000;
    return {
      rooms: game.roomsState.length,
      clothes: game.shopCatalog.length,
      furniture: game.furnitureCatalog.length,
      jobs: Object.keys(game.WORK_JOBS).length,
      business: game.BIZ.length,
      version: game.GAME_VERSION,
    };
  });
  assert.equal(catalog.version, 8);
  console.log('CATALOG', catalog);
  assert.equal(catalog.rooms, 32);
  assert(
    catalog.clothes === 28 &&
      catalog.furniture === 16 &&
      catalog.jobs === 4 &&
      catalog.business === 3,
  );
  await page.evaluate(() => window.openClothesShop('top'));
  await page.locator('#clothes-modal').waitFor({ state: 'visible' });
  await page.evaluate(() => window.buyClothing('item_hoodie'));
  await page.evaluate(() => window.closeModal('clothes-modal'));
  await page.evaluate(async () => {
    const { game } = await import('/src/game/context.ts');
    const item = game.furnitureCatalog.find((f) => f.id === 'bed_lux');
    window.buyFurnitureItem(item.id, item.price);
  });
  await page.locator('#furniture-shop-modal').waitFor({ state: 'visible' });
  await page.evaluate(() => window.closeModal('furniture-shop-modal'));
  await page.evaluate(() => window.openBizSite());
  await page.locator('#biz-modal').waitFor({ state: 'visible' });
  await page.evaluate(() => {
    void window.bizInvest('shop');
  });
  await page.locator('#dialog-input').fill('100');
  await page
    .locator('#dialog-buttons')
    .getByRole('button', { name: 'Investi', exact: true })
    .click();
  await page.evaluate(() => window.closeModal('biz-modal'));
  await page.evaluate(() => window.chooseOrGoToJob('ufficio', 'Ufficio'));
  const shift = await page.evaluate(async () => {
    const { game } = await import('/src/game/context.ts');
    game.activeShift.remaining = 0.1;
    window.updateShift(1);
    return {
      turns: game.jobExperience.ufficio,
      owned: game.ownedItems.item_hoodie,
      bed: game.ownedFurniture.bed_lux,
      invest: game.invest.shop.cost,
    };
  });
  assert.deepEqual(shift, { turns: 1, owned: true, bed: true, invest: 100 });
  await page.evaluate(() => window.openGlobalChat());
  await page.locator('#gchat-input').fill('Messaggio di prova offline');
  await page.evaluate(() => window.sendChat());
  await page.getByText('Messaggio di prova offline', { exact: true }).waitFor();
  await page.evaluate(() => window.closeGlobalChat());
  await page.evaluate(async () => {
    const { game } = await import('/src/game/context.ts');
    for (const env of [
      'SALOON',
      'CORTILE',
      'KITCHEN',
      'BATHROOM',
      'PLAYER_ROOM',
      'passeggiata',
      'bar',
      'viaggio',
      'discoteca',
      'negozio_vestiti',
      'negozio_mobili',
      'CIMITERO',
      'lavoro_cantiere',
      'lavoro_ospedale',
      'lavoro_ristorante',
      'lavoro_ufficio',
    ]) {
      game.activeEnvironment = env;
      game.currentRoomIdx = game.myAssignedRoomIdx;
      window.renderEnvironment(0, game.animClock);
    }
    game.activeEnvironment = 'PLAYER_ROOM';
    window.saveGame(true);
  });
  const before = await page.evaluate(() =>
    JSON.parse(localStorage.getItem('offline_sims_save_v1')),
  );
  assert.equal(before.ownedItems.item_hoodie, true);
  assert.equal(before.ownedFurniture.bed_lux, true);
  assert.equal(before.jobExperience.ufficio, 1);
  await page.screenshot({ path: 'test-results/latest-v8.png' });
  await page.locator('#save-exit').click();
  await page.locator('#ui-setup-screen').waitFor({ state: 'visible' });
  await page.locator('#start-game-btn').click();
  await page.locator('#ui-setup-screen').waitFor({ state: 'hidden' });
  await page.waitForFunction(async () => {
    const { game } = await import('/src/game/context.ts');
    return (
      game.ownedItems.item_hoodie &&
      game.jobExperience.ufficio === 1 &&
      game.invest.shop?.cost === 100
    );
  });
  await page.reload();
  await page.locator('#start-game-btn').click();
  await page.locator('#ui-setup-screen').waitFor({ state: 'hidden' });
  await page.waitForFunction(async () => {
    const { game } = await import('/src/game/context.ts');
    return game.ownedFurniture.bed_lux && game.ownedItems.item_hoodie;
  });
  console.log('CATALOG', catalog);
  console.log('ERRORS', errors);
  assert.deepEqual(errors, []);
  console.log(
    'PASS: v8 creator, 32 rooms, clothes, furniture, investments, jobs, chat, 16 scenes and saves.',
  );
} finally {
  await browser.close();
  await server.close();
}
