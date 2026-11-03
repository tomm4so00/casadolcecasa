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
      game.roomsState[game.myAssignedRoomIdx]?.ownerId === game.session.myPlayerId
    );
  });
  await page.locator('#dialog-buttons').getByRole('button', { name: 'Salta', exact: true }).click();
  const catalog = await page.evaluate(async () => {
    const { game } = await import('/src/game/context.ts');
    game.pinPromptMoneyThreshold = 1e9;
    const { creditMoney } = await import('/src/game/economy.ts');
    await creditMoney(10000);
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
  assert.equal(catalog.rooms, 64);
  assert(
    catalog.clothes === 78 &&
      catalog.furniture === 22 &&
      catalog.jobs === 4 &&
      catalog.business === 9,
  );
  await page.evaluate(async () => (await import('/src/game/character.ts')).openClothesShop('top'));
  await page.locator('#clothes-modal').waitFor({ state: 'visible' });
  await page.evaluate(async () =>
    (await import('/src/game/character.ts')).buyClothing('item_hoodie'),
  );
  await page.evaluate(async () =>
    (await import('/src/game/render/primitives.ts')).closeModal('clothes-modal'),
  );
  await page.evaluate(async () => {
    const { game } = await import('/src/game/context.ts');
    const item = game.furnitureCatalog.find((f) => f.id === 'bed_lux');
    await (await import('/src/game/world.ts')).buyFurnitureItem(item.id);
  });
  await page.locator('#furniture-shop-modal').waitFor({ state: 'visible' });
  await page.evaluate(async () =>
    (await import('/src/game/render/primitives.ts')).closeModal('furniture-shop-modal'),
  );
  await page.evaluate(async () => (await import('/src/game/business.ts')).openBizSite());
  await page.locator('#biz-modal').waitFor({ state: 'visible' });
  // si clicca il pulsante vero, su un'attività aggiunta dopo le tre di partenza
  await page.locator('#biz-modal [data-action="bizInvest"][data-arg="pizza"]').click();
  await page.locator('#dialog-input').fill('100');
  await page
    .locator('#dialog-buttons')
    .getByRole('button', { name: 'Investi', exact: true })
    .click();
  await page.evaluate(async () =>
    (await import('/src/game/render/primitives.ts')).closeModal('biz-modal'),
  );
  await page.evaluate(async () =>
    (await import('/src/game/world.ts')).chooseOrGoToJob('ufficio', 'Ufficio'),
  );
  const shift = await page.evaluate(async () => {
    const { game } = await import('/src/game/context.ts');
    game.activeShift.remaining = 0.1;
    await (await import('/src/game/jobs.ts')).updateShift(1);
    return {
      turns: game.player.jobExperience.ufficio,
      owned: game.player.ownedItems.item_hoodie,
      bed: game.player.ownedFurniture.bed_lux,
      invest: game.player.invest.pizza?.cost,
    };
  });
  assert.deepEqual(shift, { turns: 1, owned: true, bed: true, invest: 100 });
  // A fine turno compare il riepilogo della paga: lo chiude come farebbe il giocatore.
  await page.locator('#dialog-buttons').getByRole('button', { name: 'Ok', exact: true }).click();
  await page.evaluate(async () => (await import('/src/game/chat.ts')).openGlobalChat());
  await page.locator('#gchat-input').fill('Messaggio di prova offline');
  await page.evaluate(async () => (await import('/src/game/chat.ts')).sendChat());
  await page.getByText('Messaggio di prova offline', { exact: true }).waitFor();
  await page.evaluate(async () => (await import('/src/game/chat.ts')).closeGlobalChat());
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
      'banca',
      'laboratorio',
      'CIMITERO',
      'lavoro_cantiere',
      'lavoro_ospedale',
      'lavoro_ristorante',
      'lavoro_ufficio',
    ]) {
      game.view.activeEnvironment = env;
      game.currentRoomIdx = game.myAssignedRoomIdx;
      (await import('/src/game/engine.ts')).renderEnvironment(0, game.animClock);
    }
    game.view.activeEnvironment = 'PLAYER_ROOM';
    await (await import('/src/game/saves.ts')).saveGame(true);
  });
  const before = await page.evaluate(async () =>
    JSON.parse(localStorage.getItem('offline_sims_save_v1')),
  );
  assert.equal(before.ownedItems.item_hoodie, true);
  assert.equal(before.ownedFurniture.bed_lux, true);
  assert.equal(before.jobExperience.ufficio, 1);
  await page.screenshot({ path: 'test-results/latest-v8.png' });
  await page.reload();
  await page.locator('#ui-setup-screen').waitFor({ state: 'visible' });
  await page.locator('#start-game-btn').click();
  await page.locator('#ui-setup-screen').waitFor({ state: 'hidden' });
  await page.waitForFunction(async () => {
    const { game } = await import('/src/game/context.ts');
    return (
      game.player.ownedItems.item_hoodie &&
      game.player.jobExperience.ufficio === 1 &&
      game.player.invest.pizza?.cost === 100
    );
  });
  await page.reload();
  await page.locator('#start-game-btn').click();
  await page.locator('#ui-setup-screen').waitFor({ state: 'hidden' });
  await page.waitForFunction(async () => {
    const { game } = await import('/src/game/context.ts');
    return game.player.ownedFurniture.bed_lux && game.player.ownedItems.item_hoodie;
  });
  await page.evaluate(async () => {
    const { game } = await import('/src/game/context.ts');
    const { lifetime } = await import('/src/game/runtime.ts');
    const { buildSaveData } = await import('/src/game/saves.ts');
    game.player.healthLevel = 50;
    game.player.sleepLevel = 50;
    game.player.hungerLevel = 80;
    game.player.hygieneLevel = 80;
    game.player.isSleeping = true;
    game.player.sleepGainedSinceLastHealthBoost = 0;
    const save = buildSaveData();
    save.savedAt = Date.now() - 2 * 3600000;
    lifetime.dispose();
    await game.session.db.ref('sims_saves/' + game.session.myPlayerId).set(save);
    localStorage.setItem(game.session.SAVE_KEY, JSON.stringify(save));
  });
  await page.reload();
  await page.locator('#start-game-btn').click();
  await page.waitForFunction(async () => {
    const { game } = await import('/src/game/context.ts');
    return (
      game.player.isSleeping &&
      game.player.sleepLevel >= 86 &&
      game.player.sleepLevel <= 89 &&
      game.player.healthLevel >= 55 &&
      game.view.activeEnvironment === 'PLAYER_ROOM'
    );
  });
  console.log('PASS: two hours of offline sleep with luxury bed, health bonus and bedroom resume.');
  console.log('CATALOG', catalog);
  console.log('ERRORS', errors);
  assert.deepEqual(errors, []);
  console.log(
    'PASS: v8 creator, 64 rooms, clothes, furniture, investments, jobs, chat, 16 scenes and saves.',
  );
} finally {
  await browser.close();
  await server.close();
}
